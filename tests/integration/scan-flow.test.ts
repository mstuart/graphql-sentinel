import http from 'node:http';
import { once } from 'node:events';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  fields: () => ({
    email: { type: GraphQLString },
    friends: {
      resolve: () => [
        { email: 'friend1@test.com', id: '2', name: 'Friend 1' },
        { email: 'friend2@test.com', id: '3', name: 'Friend 2' },
      ],
      type: new GraphQLList(UserType),
    },
    id: { type: GraphQLString },
    name: { type: GraphQLString },
  }),
  name: 'User',
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    fields: {
      user: {
        args: { id: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_root, { id }) => ({
          email: `user${id}@test.com`,
          id,
          name: `User ${id}`,
        }),
        type: UserType,
      },
      users: {
        resolve: () => [
          { email: 'user1@test.com', id: '1', name: 'User 1' },
          { email: 'user2@test.com', id: '2', name: 'User 2' },
        ],
        type: new GraphQLList(UserType),
      },
    },
    name: 'Query',
  }),
});

// Create a vulnerable mock server using real GraphQL execution
const createVulnerableServer = (): http.Server =>
  http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://localhost`);

    // Accept GET queries (vulnerable to CSRF)
    if (request.method === 'GET') {
      const query = url.searchParams.get('query');
      if (query) {
        const result = await graphql({ schema, source: query });
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
    request.on('end', async () => {
      // The fixture responds to several request shapes in one request boundary.
      // eslint-disable-next-line unicorn/try-complexity
      try {
        const parsed = JSON.parse(body);

        // Accept batch queries (vulnerable)
        if (Array.isArray(parsed)) {
          const results = await Promise.all(
            parsed.map((p: { query: string; variables?: Record<string, unknown> }) =>
              graphql({ schema, source: p.query, variableValues: p.variables }),
            ),
          );
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(results));
          return;
        }

        const result = await graphql({
          schema,
          source: parsed.query,
          variableValues: parsed.variables,
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(result));
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ errors: [{ message: 'Invalid JSON' }] }));
      }
    });
  });

describe('Integration: Full Scan Flow', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    server = createVulnerableServer();
    server.listen(0);
    await once(server, 'listening');
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      url = `http://localhost:${addr.port}/graphql`;
    }
  });

  afterAll(async () => {
    const closed = once(server, 'close');
    server.close();
    await closed;
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
    expect(introspectionResult?.passed).toBe(false);

    // Check that CSRF via GET is detected
    const csrfResult = report.results.find((r) => r.check === 'csrf');
    expect(csrfResult).toBeDefined();
    expect(csrfResult?.passed).toBe(false);

    // Check that batch queries are detected
    const batchResult = report.results.find((r) => r.check === 'batch-attack');
    expect(batchResult).toBeDefined();
    expect(batchResult?.passed).toBe(false);
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
    expect(errors.at(0)?.message).toContain('depth');
  });

  it('should block queries with too many aliases', () => {
    const shield = createShield({ maxAliases: 5 });

    const aliases = Array.from(
      { length: 10 },
      (_, index) => `a${index}: user(id: "${index}") { name }`,
    ).join('\n');
    const query = parse(`{ ${aliases} }`);

    const errors = validate(schema, query, shield.validationRules);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.at(0)?.message).toContain('aliases');
  });

  it('should block introspection when disabled', () => {
    const shield = createShield({ disableIntrospection: true });

    const query = parse('{ __schema { types { name } } }');
    const errors = validate(schema, query, shield.validationRules);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.at(0)?.message).toContain('__schema');
  });

  it('should allow valid queries through shield', () => {
    const shield = createShield({
      maxAliases: 20,
      maxComplexity: 1000,
      maxDepth: 10,
    });

    const query = parse('{ user(id: "1") { name email } }');
    const errors = validate(schema, query, shield.validationRules);
    expect(errors).toHaveLength(0);
  });

  it('should enforce rate limiting', () => {
    const shield = createShield({
      rateLimit: { max: 3, window: 1000 },
    });

    expect(shield.rateLimiter).toBeDefined();

    const { rateLimiter } = shield;
    if (!rateLimiter) {
      throw new Error('Expected rate limiter to be configured');
    }

    const r1 = rateLimiter.check('client-1', 1);
    expect(r1.allowed).toBe(true);

    const r2 = rateLimiter.check('client-1', 1);
    expect(r2.allowed).toBe(true);

    const r3 = rateLimiter.check('client-1', 1);
    expect(r3.allowed).toBe(true);

    const r4 = rateLimiter.check('client-1', 1);
    expect(r4.allowed).toBe(false);

    rateLimiter.destroy();
  });
});
