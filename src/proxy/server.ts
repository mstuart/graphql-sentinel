import http from 'node:http';
import { parse } from 'graphql';
import type { ShieldConfig } from '../types/index.js';
import { createShield } from '../shield/index.js';

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

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function createProxyServer(config: ProxyConfig): http.Server {
  const shield = createShield(config.shield);
  const enableCors = config.cors !== false;

  const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (enableCors) {
      setCorsHeaders(res);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: 'Only POST method is allowed' }] }));
      return;
    }

    try {
      const body = await readBody(req);
      let parsed: { query?: string; variables?: Record<string, unknown>; operationName?: string };

      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Invalid JSON in request body' }] }));
        return;
      }

      if (!parsed.query || typeof parsed.query !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Missing or invalid query field' }] }));
        return;
      }

      // Parse the GraphQL document
      let document;
      try {
        document = parse(parsed.query);
      } catch (parseError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            errors: [
              {
                message: `GraphQL parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              },
            ],
          }),
        );
        return;
      }

      // Apply shield validation rules
      // We don't have a full schema to validate against, so we validate using only
      // the custom rules that don't need schema context (depth, aliases, introspection)
      const validationErrors = validateWithRules(document, shield.validationRules);

      if (validationErrors.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            errors: validationErrors.map((e) => ({
              message: e.message,
              extensions: { code: 'GRAPHQL_SENTINEL_BLOCKED' },
            })),
          }),
        );
        return;
      }

      // Check rate limiter
      if (shield.rateLimiter) {
        const clientIp =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.socket.remoteAddress ||
          'unknown';
        const result = shield.rateLimiter.check(clientIp);
        if (!result.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              errors: [
                {
                  message: 'Rate limit exceeded',
                  extensions: { code: 'RATE_LIMITED', remaining: result.remaining },
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
      if (req.headers['authorization']) {
        forwardHeaders['Authorization'] = req.headers['authorization'] as string;
      }

      const upstreamResponse = await fetch(config.target, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify({
          query: parsed.query,
          variables: parsed.variables,
          operationName: parsed.operationName,
        }),
      });

      const upstreamBody = await upstreamResponse.text();

      // Forward upstream response headers
      const contentType = upstreamResponse.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      } else {
        res.setHeader('Content-Type', 'application/json');
      }

      res.writeHead(upstreamResponse.status);
      res.end(upstreamBody);
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          errors: [
            {
              message: `Proxy error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }),
      );
    }
  });

  return server;
}

/**
 * Validate a document using custom validation rules without requiring a schema.
 * Each rule is called with a minimal validation context.
 */
function validateWithRules(
  document: ReturnType<typeof parse>,
   
  rules: Array<(context: any) => any>,
): Array<{ message: string }> {
  const errors: Array<{ message: string }> = [];

  // Create a minimal context-like object that collects errors
  const mockContext = {
    reportError(error: { message: string }) {
      errors.push(error);
    },
    getSchema() {
      return {
        getQueryType() {
          return { name: 'Query' };
        },
        getMutationType() {
          return null;
        },
        getSubscriptionType() {
          return null;
        },
      };
    },
    getFieldDef() {
      return null;
    },
  };

  for (const rule of rules) {
    const visitor = rule(mockContext);
    visitNode(document, visitor);
  }

  return errors;
}

 
function visitNode(node: any, visitor: any): void {
  if (!node || typeof node !== 'object') return;

  const kind = node.kind;
  if (!kind) return;

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
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && child.kind) {
          visitNode(child, visitor);
        }
      }
    } else if (value && typeof value === 'object' && value.kind) {
      visitNode(value, visitor);
    }
  }

  // Leave
  if (kindVisitor) {
    if (kindVisitor.leave) {
      kindVisitor.leave(node);
    }
  }
}

export async function startProxy(config: ProxyConfig): Promise<http.Server> {
  const server = createProxyServer(config);
  return new Promise((resolve) => {
    server.listen(config.port, () => {
      console.log(`GraphQL Sentinel proxy running on port ${config.port}`);
      console.log(`Forwarding to ${config.target}`);
      resolve(server);
    });
  });
}
