import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  graphql,
  parse,
  validate,
} from 'graphql';
import { runScan } from '../../src/scanner/runner.js';
import { createShield } from '../../src/shield/index.js';
import { generateReport } from '../../src/reporter/index.js';

// Create a real GraphQL schema for the integration test
const UserType: GraphQLObjectType = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLString },
    name: { type: GraphQLString },
    email: { type: GraphQLString },
    friends: {
      type: new GraphQLList(UserType),
      resolve: () => [
        { id: '2', name: 'Friend 1', email: 'friend1@test.com' },
        { id: '3', name: 'Friend 2', email: 'friend2@test.com' },
      ],
    },
  }),
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      user: {
        type: UserType,
        args: { id: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_root, { id }) => ({
          id,
          name: `User ${id}`,
          email: `user${id}@test.com`,
        }),
      },
      users: {
        type: new GraphQLList(UserType),
        resolve: () => [
          { id: '1', name: 'User 1', email: 'user1@test.com' },
          { id: '2', name: 'User 2', email: 'user2@test.com' },
        ],
      },
    },
  }),
});

// Create a vulnerable mock server using real GraphQL execution
function createVulnerableServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);

    // Accept GET queries (vulnerable to CSRF)
    if (req.method === 'GET') {
      const query = url.searchParams.get('query');
      if (query) {
        const result = await graphql({ schema, source: query });
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
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);

        // Accept batch queries (vulnerable)
        if (Array.isArray(parsed)) {
          const results = await Promise.all(
            parsed.map((p: { query: string; variables?: Record<string, unknown> }) =>
              graphql({ schema, source: p.query, variableValues: p.variables }),
            ),
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
          return;
        }

        const result = await graphql({
          schema,
          source: parsed.query,
          variableValues: parsed.variables,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Invalid JSON' }] }));
      }
    });
  });
}

describe('Integration: Full Scan Flow', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    server = createVulnerableServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      url = `http://localhost:${addr.port}/graphql`;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should detect multiple vulnerabilities in a real GraphQL server', async () => {
    const report = await runScan({ endpoint: url });

    // The server should be flagged for introspection, batch, CSRF at minimum
    expect(report.summary.failed).toBeGreaterThan(0);
    expect(report.target).toBe(url);
    expect(report.results.length).toBeGreaterThan(0);

    // Check that introspection is detected as enabled
    const introspectionResult = report.results.find((r) => r.check === 'introspection');
    expect(introspectionResult).toBeDefined();
    expect(introspectionResult!.passed).toBe(false);

    // Check that CSRF via GET is detected
    const csrfResult = report.results.find((r) => r.check === 'csrf');
    expect(csrfResult).toBeDefined();
    expect(csrfResult!.passed).toBe(false);

    // Check that batch queries are detected
    const batchResult = report.results.find((r) => r.check === 'batch-attack');
    expect(batchResult).toBeDefined();
    expect(batchResult!.passed).toBe(false);
  });

  it('should generate reports in all formats', async () => {
    const report = await runScan({ endpoint: url });

    const jsonOutput = generateReport(report, 'json');
    expect(() => JSON.parse(jsonOutput)).not.toThrow();

    const terminalOutput = generateReport(report, 'terminal');
    expect(terminalOutput).toContain('GraphQL Sentinel');

    const htmlOutput = generateReport(report, 'html');
    expect(htmlOutput).toContain('<!DOCTYPE html>');
  });
});

describe('Integration: Shield Protection', () => {
  it('should block deep queries with depth limiter', () => {
    const shield = createShield({ maxDepth: 3 });

    const deepQuery = parse(`
      {
        user(id: "1") {
          friends {
            friends {
              friends {
                name
              }
            }
          }
        }
      }
    `);

    const errors = validate(schema, deepQuery, shield.validationRules);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('depth');
  });

  it('should block queries with too many aliases', () => {
    const shield = createShield({ maxAliases: 5 });

    const aliases = Array.from({ length: 10 }, (_, i) => `a${i}: user(id: "${i}") { name }`).join(
      '\n',
    );
    const query = parse(`{ ${aliases} }`);

    const errors = validate(schema, query, shield.validationRules);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('aliases');
  });

  it('should block introspection when disabled', () => {
    const shield = createShield({ disableIntrospection: true });

    const query = parse('{ __schema { types { name } } }');
    const errors = validate(schema, query, shield.validationRules);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('__schema');
  });

  it('should allow valid queries through shield', () => {
    const shield = createShield({
      maxDepth: 10,
      maxAliases: 20,
      maxComplexity: 1000,
    });

    const query = parse('{ user(id: "1") { name email } }');
    const errors = validate(schema, query, shield.validationRules);
    expect(errors).toHaveLength(0);
  });

  it('should enforce rate limiting', () => {
    const shield = createShield({
      rateLimit: { window: 1000, max: 3 },
    });

    expect(shield.rateLimiter).toBeDefined();

    const r1 = shield.rateLimiter!.check('client-1', 1);
    expect(r1.allowed).toBe(true);

    const r2 = shield.rateLimiter!.check('client-1', 1);
    expect(r2.allowed).toBe(true);

    const r3 = shield.rateLimiter!.check('client-1', 1);
    expect(r3.allowed).toBe(true);

    const r4 = shield.rateLimiter!.check('client-1', 1);
    expect(r4.allowed).toBe(false);

    shield.rateLimiter!.destroy();
  });
});
