import http from 'node:http';
import { once } from 'node:events';

export interface MockServerOptions {
  introspectionEnabled?: boolean;
  depthLimitEnabled?: boolean;
  batchEnabled?: boolean;
  fieldSuggestionsEnabled?: boolean;
  aliasLimitEnabled?: boolean;
  getQueriesEnabled?: boolean;
  authRequired?: boolean;
  validToken?: string;
}

export const createMockGraphQLServer = (
  options: MockServerOptions = {},
): {
  server: http.Server;
  getUrl: () => string;
} => {
  const {
    batchEnabled = true,
    getQueriesEnabled = true,
    authRequired = false,
    validToken,
  } = options;

  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', `http://localhost`);

    // Auth check helper
    const isAuthorized = (): boolean => {
      if (!authRequired) {
        return true;
      }
      const authHeader = request.headers['authorization'];
      if (!authHeader) {
        return false;
      }
      if (validToken && authHeader === `Bearer ${validToken}`) {
        return true;
      }
      if (
        !validToken &&
        authHeader &&
        authHeader !== '' &&
        authHeader !== 'Bearer invalid_token_sentinel_test'
      ) {
        return true;
      }
      return false;
    };

    // Handle GET requests
    if (request.method === 'GET') {
      if (!getQueriesEnabled) {
        response.writeHead(405, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ errors: [{ message: 'GET method not allowed' }] }));
        return;
      }

      const query = url.searchParams.get('query');
      if (query) {
        if (!isAuthorized()) {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(
            JSON.stringify({ errors: [{ message: 'Unauthorized: authentication required' }] }),
          );
          return;
        }
        // The fixture query processor is defined below the server factory.
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const result = processQuery(query, options);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
    }

    if (request.method !== 'POST') {
      response.writeHead(405);
      response.end();
      return;
    }

    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      // The fixture responds to several request shapes in one request boundary.
      // eslint-disable-next-line unicorn/try-complexity
      try {
        // Check auth for POST requests
        if (!isAuthorized()) {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(
            JSON.stringify({ errors: [{ message: 'Unauthorized: authentication required' }] }),
          );
          return;
        }

        const parsed = JSON.parse(body);

        // Handle batch requests
        if (Array.isArray(parsed)) {
          if (!batchEnabled) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(
              JSON.stringify({ errors: [{ message: 'Batch queries are not allowed' }] }),
            );
            return;
          }
          const results = parsed.map((item: { query: string }) =>
            // The fixture query processor is defined below the server factory.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            processQuery(item.query, options),
          );
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(results));
          return;
        }

        // The fixture query processor is defined below the server factory.
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const result = processQuery(parsed.query, options);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(result));
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ errors: [{ message: 'Invalid JSON' }] }));
      }
    });
  });

  return {
    getUrl: () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        return `http://localhost:${addr.port}/graphql`;
      }
      return '';
    },
    server,
  };
};

const processTypeNameQuery = (query: string): Record<string, unknown> => {
  const data: Record<string, string> = {};
  const aliasPattern = /\b(?<alias>[_A-Za-z]\w*)[ \t]*:[ \t]*__typename/gu;
  let match;
  while ((match = aliasPattern.exec(query)) !== null) {
    const alias = match.groups?.alias;
    if (alias) {
      data[alias] = 'Query';
    }
  }
  if (Object.keys(data).length === 0) {
    data['__typename'] = 'Query';
  }
  return { data };
};

const processQuery = (query: string, options: MockServerOptions): Record<string, unknown> => {
  const {
    introspectionEnabled = true,
    depthLimitEnabled = false,
    fieldSuggestionsEnabled = true,
    aliasLimitEnabled = false,
  } = options;

  // Field suggestion check (must come before introspection check since __schemax contains __schema)
  if (query.includes('__schemax')) {
    const message = fieldSuggestionsEnabled
      ? 'Cannot query field "__schemax" on type "Query". Did you mean "__schema"?'
      : 'Cannot query field "__schemax" on type "Query".';
    return {
      errors: [{ message }],
    };
  }

  // Introspection check
  if (query.includes('__schema')) {
    if (!introspectionEnabled) {
      return {
        errors: [{ message: 'Introspection is disabled' }],
      };
    }
    return {
      data: {
        __schema: {
          types: [{ name: 'Query' }, { name: 'String' }, { name: 'Boolean' }, { name: 'Int' }],
        },
      },
    };
  }

  // Depth check - detect deeply nested queries
  if (depthLimitEnabled && query.includes('__type')) {
    const nestCount = (query.match(/__type/gu) || []).length;
    if (nestCount > 5) {
      return {
        errors: [{ message: 'Query depth limit exceeded' }],
      };
    }
  }

  // Alias check
  const aliasMatches = query.match(/\ba\d+\s*:/gu);
  if (aliasLimitEnabled && aliasMatches && aliasMatches.length > 15) {
    return {
      errors: [{ message: 'Too many aliases in query' }],
    };
  }

  // Default: handle __typename and aliases
  if (query.includes('__typename')) {
    return processTypeNameQuery(query);
  }

  return { data: { __typename: 'Query' } };
};

export const startServer = async (
  options: MockServerOptions = {},
): Promise<{ server: http.Server; url: string }> => {
  const { server, getUrl } = createMockGraphQLServer(options);
  server.listen(0);
  await once(server, 'listening');
  return { server, url: getUrl() };
};

export const stopServer = async (server: http.Server): Promise<void> => {
  const closed = once(server, 'close');
  server.close();
  await closed;
};
