import http from 'node:http';

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

export function createMockGraphQLServer(
  options: MockServerOptions = {},
): { server: http.Server; getUrl: () => string } {
  const {
    introspectionEnabled = true,
    depthLimitEnabled = false,
    batchEnabled = true,
    fieldSuggestionsEnabled = true,
    aliasLimitEnabled = false,
    getQueriesEnabled = true,
    authRequired = false,
    validToken,
  } = options;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);

    // Auth check helper
    const checkAuth = (): boolean => {
      if (!authRequired) return true;
      const authHeader = req.headers['authorization'];
      if (!authHeader) return false;
      if (validToken && authHeader === `Bearer ${validToken}`) return true;
      if (!validToken && authHeader && authHeader !== '' && authHeader !== 'Bearer invalid_token_sentinel_test') return true;
      return false;
    };

    // Handle GET requests
    if (req.method === 'GET') {
      if (!getQueriesEnabled) {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'GET method not allowed' }] }));
        return;
      }

      const query = url.searchParams.get('query');
      if (query) {
        if (!checkAuth()) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ errors: [{ message: 'Unauthorized: authentication required' }] }));
          return;
        }
        const result = processQuery(query, options);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }
    }

    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        // Check auth for POST requests
        if (!checkAuth()) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ errors: [{ message: 'Unauthorized: authentication required' }] }));
          return;
        }

        const parsed = JSON.parse(body);

        // Handle batch requests
        if (Array.isArray(parsed)) {
          if (!batchEnabled) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ errors: [{ message: 'Batch queries are not allowed' }] }),
            );
            return;
          }
          const results = parsed.map((p: { query: string }) =>
            processQuery(p.query, options),
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
          return;
        }

        const result = processQuery(parsed.query, options);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Invalid JSON' }] }));
      }
    });
  });

  return {
    server,
    getUrl: () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        return `http://localhost:${addr.port}/graphql`;
      }
      return '';
    },
  };
}

function processQuery(
  query: string,
  options: MockServerOptions,
): Record<string, unknown> {
  const {
    introspectionEnabled = true,
    depthLimitEnabled = false,
    fieldSuggestionsEnabled = true,
    aliasLimitEnabled = false,
  } = options;

  // Field suggestion check (must come before introspection check since __schemax contains __schema)
  if (query.includes('__schemax')) {
    if (fieldSuggestionsEnabled) {
      return {
        errors: [
          {
            message:
              'Cannot query field "__schemax" on type "Query". Did you mean "__schema"?',
          },
        ],
      };
    }
    return {
      errors: [{ message: 'Cannot query field "__schemax" on type "Query".' }],
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
          types: [
            { name: 'Query' },
            { name: 'String' },
            { name: 'Boolean' },
            { name: 'Int' },
          ],
        },
      },
    };
  }

  // Depth check - detect deeply nested queries
  if (query.includes('__type') && depthLimitEnabled) {
    const nestCount = (query.match(/__type/g) || []).length;
    if (nestCount > 5) {
      return {
        errors: [{ message: 'Query depth limit exceeded' }],
      };
    }
  }

  // Alias check
  const aliasMatches = query.match(/\ba\d+\s*:/g);
  if (aliasMatches && aliasMatches.length > 15 && aliasLimitEnabled) {
    return {
      errors: [{ message: 'Too many aliases in query' }],
    };
  }

  // Default: handle __typename and aliases
  if (query.includes('__typename')) {
    const data: Record<string, string> = {};
    // Extract all aliases like a0: __typename
    const aliasPattern = /(\w+)\s*:\s*__typename/g;
    let match;
    while ((match = aliasPattern.exec(query)) !== null) {
      data[match[1]] = 'Query';
    }
    // If no aliases found, just return __typename
    if (Object.keys(data).length === 0) {
      data['__typename'] = 'Query';
    }
    return { data };
  }

  return { data: { __typename: 'Query' } };
}

export function startServer(
  options: MockServerOptions = {},
): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const { server, getUrl } = createMockGraphQLServer(options);
    server.listen(0, () => {
      resolve({ server, url: getUrl() });
    });
  });
}

export function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
