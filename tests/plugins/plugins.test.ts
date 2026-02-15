import { describe, it, expect, vi } from 'vitest';
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
} from 'graphql';
import { useSentinelShield } from '../../src/plugins/yoga.js';
import { sentinelApolloPlugin } from '../../src/plugins/apollo.js';
import { sentinelMiddleware } from '../../src/plugins/express.js';

const testSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      hello: { type: GraphQLString },
      users: {
        type: new GraphQLList(
          new GraphQLObjectType({
            name: 'User',
            fields: {
              name: { type: GraphQLString },
            },
          }),
        ),
      },
    },
  }),
});

describe('Yoga Plugin', () => {
  it('should create a valid Yoga plugin', () => {
    const plugin = useSentinelShield({ maxDepth: 5, disableIntrospection: true });
    expect(plugin).toBeDefined();
    expect(plugin.onValidate).toBeDefined();
    expect(typeof plugin.onValidate).toBe('function');
  });

  it('should add validation rules via onValidate', () => {
    const plugin = useSentinelShield({
      maxDepth: 5,
      maxAliases: 10,
      disableIntrospection: true,
    });

    const rules: unknown[] = [];
    const addValidationRule = (rule: unknown) => rules.push(rule);

    plugin.onValidate({ addValidationRule });
    expect(rules).toHaveLength(3);
  });

  it('should work with empty config', () => {
    const plugin = useSentinelShield();
    const rules: unknown[] = [];
    plugin.onValidate({ addValidationRule: (r: unknown) => rules.push(r) });
    expect(rules).toHaveLength(0);
  });
});

describe('Apollo Plugin', () => {
  it('should create a valid Apollo plugin', () => {
    const plugin = sentinelApolloPlugin({ maxDepth: 5 });
    expect(plugin).toBeDefined();
    expect(plugin.requestDidStart).toBeDefined();
  });

  it('should return lifecycle hooks from requestDidStart', async () => {
    const plugin = sentinelApolloPlugin({ maxDepth: 5 });
    const hooks = await plugin.requestDidStart();
    expect(hooks.didResolveOperation).toBeDefined();
  });
});

describe('Express Middleware', () => {
  it('should create express middleware function', () => {
    const middleware = sentinelMiddleware(testSchema, { maxDepth: 5 });
    expect(typeof middleware).toBe('function');
  });

  it('should call next for valid queries', () => {
    const middleware = sentinelMiddleware(testSchema, { maxDepth: 10 });
    const req = { body: { query: '{ hello }' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block queries that violate rules', () => {
    const middleware = sentinelMiddleware(testSchema, { disableIntrospection: true });
    const req = { body: { query: '{ __schema { types { name } } }' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('__schema'),
            extensions: { code: 'GRAPHQL_SENTINEL_BLOCKED' },
          }),
        ]),
      }),
    );
  });

  it('should call next when no query is present', () => {
    const middleware = sentinelMiddleware(testSchema, { maxDepth: 5 });
    const req = { body: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should call next for invalid query syntax', () => {
    const middleware = sentinelMiddleware(testSchema, { maxDepth: 5 });
    const req = { body: { query: '{ this is not valid graphql :::' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
