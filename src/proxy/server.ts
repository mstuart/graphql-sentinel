import http from 'node:http';
import { once } from 'node:events';
import { parse } from 'graphql';
import { createShield } from '../shield/index.js';
import type { ShieldConfig } from '../types/index.js';

export interface ProxyConfig {
  /** Upstream GraphQL endpoint URL */
  target: string;
  /** Proxy listening port (default 4000) */
  port: number;
  /** Shield configuration for query validation */
  shield: ShieldConfig;
  /** Headers to forward to the upstream */
  headers?: Record<string, string>;
  /** Enable CORS headers (default true) */
  cors?: boolean;
}

const readBody = async (request: http.IncomingMessage): Promise<string> => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
};

const setCorsHeaders = (response: http.ServerResponse): void => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export const createProxyServer = (config: ProxyConfig): http.Server => {
  const shield = createShield(config.shield);
  const isEnableCors = config.cors !== false;

  return http.createServer(async (request, response) => {
    // Handle CORS preflight
    if (isEnableCors) {
      setCorsHeaders(response);
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(405, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ errors: [{ message: 'Only POST method is allowed' }] }));
      return;
    }

    // This handler must translate every request-stage failure into an HTTP response.
    // eslint-disable-next-line unicorn/try-complexity
    try {
      const body = await readBody(request);
      let parsed: { query?: string; variables?: Record<string, unknown>; operationName?: string };

      try {
        parsed = JSON.parse(body);
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ errors: [{ message: 'Invalid JSON in request body' }] }));
        return;
      }

      if (!parsed.query || typeof parsed.query !== 'string') {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ errors: [{ message: 'Missing or invalid query field' }] }));
        return;
      }

      // Parse the GraphQL document
      let document;
      try {
        document = parse(parsed.query);
      } catch (parseError) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            errors: [
              {
                message: `GraphQL parse error: ${String(parseError)}`,
              },
            ],
          }),
        );
        return;
      }

      // Apply shield validation rules
      // We don't have a full schema to validate against, so we validate using only
      // the custom rules that don't need schema context (depth, aliases, introspection)
      // The validation helper follows the request handler to keep the handler entry point first.
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      const validationErrors = validateWithRules(document, shield.validationRules);

      if (validationErrors.length > 0) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            errors: validationErrors.map((error) => ({
              extensions: { code: 'GRAPHQL_SENTINEL_BLOCKED' },
              message: error.message,
            })),
          }),
        );
        return;
      }

      // Check rate limiter
      if (shield.rateLimiter) {
        const clientIp =
          (request.headers['x-forwarded-for'] as string)?.split(',', 1)[0]?.trim() ||
          request.socket.remoteAddress ||
          'unknown';
        const result = shield.rateLimiter.check(clientIp);
        if (!result.allowed) {
          response.writeHead(429, { 'Content-Type': 'application/json' });
          response.end(
            JSON.stringify({
              errors: [
                {
                  extensions: { code: 'RATE_LIMITED', remaining: result.remaining },
                  message: 'Rate limit exceeded',
                },
              ],
            }),
          );
          return;
        }
      }

      // Forward request to upstream
      const forwardHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.headers,
      };

      // Forward auth headers from original request
      if (request.headers['authorization']) {
        forwardHeaders['Authorization'] = request.headers['authorization'] as string;
      }

      const upstreamResponse = await fetch(config.target, {
        body: JSON.stringify({
          operationName: parsed.operationName,
          query: parsed.query,
          variables: parsed.variables,
        }),
        headers: forwardHeaders,
        method: 'POST',
      });

      const upstreamBody = await upstreamResponse.text();

      // Forward upstream response headers
      const contentType = upstreamResponse.headers.get('content-type');
      if (contentType) {
        response.setHeader('Content-Type', contentType);
      } else {
        response.setHeader('Content-Type', 'application/json');
      }

      response.writeHead(upstreamResponse.status);
      response.end(upstreamBody);
    } catch (error) {
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          errors: [
            {
              message: `Proxy error: ${String(error)}`,
            },
          ],
        }),
      );
    }
  });
};

/**
 * Validate a document using custom validation rules without requiring a schema.
 * Each rule is called with a minimal validation context.
 */
const validateWithRules = (
  document: ReturnType<typeof parse>,
  rules: ((context: any) => any)[],
): { message: string }[] => {
  const errors: { message: string }[] = [];

  // Create a minimal context-like object that collects errors
  const mockContext = {
    getFieldDef: () => null,
    getSchema: () => ({
      getMutationType: () => null,
      getQueryType: () => ({ name: 'Query' }),
      getSubscriptionType: () => null,
    }),
    reportError(error: { message: string }) {
      errors.push(error);
    },
  };

  for (const rule of rules) {
    const visitor = rule(mockContext);
    // The recursive visitor is defined next so its traversal logic stays adjacent.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    visitNode(document, visitor);
  }

  return errors;
};

const visitNode = (node: any, visitor: any): void => {
  if (!node || typeof node !== 'object') {
    return;
  }

  const { kind } = node;
  if (!kind) {
    return;
  }

  // Enter
  const kindVisitor = visitor[kind];
  if (kindVisitor) {
    if (typeof kindVisitor === 'function') {
      kindVisitor(node);
    } else if (kindVisitor.enter) {
      kindVisitor.enter(node);
    }
  }

  // Visit children
  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child && typeof child === 'object' && child.kind) {
        visitNode(child, visitor);
      }
    }
  }

  // Leave
  if (kindVisitor && kindVisitor.leave) {
    kindVisitor.leave(node);
  }
};

export const startProxy = async (config: ProxyConfig): Promise<http.Server> => {
  const server = createProxyServer(config);
  server.listen(config.port);
  await once(server, 'listening');
  console.log(`GraphQL Sentinel proxy running on port ${config.port}`);
  console.log(`Forwarding to ${config.target}`);
  return server;
};
