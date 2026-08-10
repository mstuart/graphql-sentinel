import { describe, it, expect, vi } from 'vitest';
import { GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLList } from 'graphql';
import { useSentinelShield } from '../../src/plugins/yoga.js';
import { sentinelApolloPlugin } from '../../src/plugins/apollo.js';
import { sentinelMiddleware } from '../../src/plugins/express.js';

const testSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    fields: {
      hello: { type: GraphQLString },
      users: {
        type: new GraphQLList(
          new GraphQLObjectType({
            fields: {
              name: { type: GraphQLString },
            },
            name: 'User',
          }),
        ),
      },
    },
    name: 'Query',
  }),
});

describe('Yoga Plugin', () => {
  it('should create a valid Yoga plugin', () => {
    const plugin = useSentinelShield({ disableIntrospection: true, maxDepth: 5 });
    expect(plugin).toBeDefined();
    expect(plugin.onValidate).toBeDefined();
    expect(typeof plugin.onValidate).toBe('function');
  });

  it('should add validation rules via onValidate', () => {
    const plugin = useSentinelShield({
      disableIntrospection: true,
      maxAliases: 10,
      maxDepth: 5,
    });

    const rules: unknown[] = [];
    const addValidationRule = (rule: unknown) => {
      rules.push(rule);
    };

    plugin.onValidate({ addValidationRule });
    expect(rules).toHaveLength(3);
  });

  it('should work with empty config', () => {
    const plugin = useSentinelShield();
    const rules: unknown[] = [];
    plugin.onValidate({
      addValidationRule: (rule: unknown) => {
        rules.push(rule);
      },
    });
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
    const request = { body: { query: '{ hello }' } };
    const response = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    middleware(request, response, next);
    expect(next).toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('should block queries that violate rules', () => {
    const middleware = sentinelMiddleware(testSchema, { disableIntrospection: true });
    const request = { body: { query: '{ __schema { types { name } } }' } };
    const response = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    middleware(request, response, next);
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            extensions: { code: 'GRAPHQL_SENTINEL_BLOCKED' },
            message: expect.stringContaining('__schema'),
          }),
        ]),
      }),
    );
  });

  it('should call next when no query is present', () => {
    const middleware = sentinelMiddleware(testSchema, { maxDepth: 5 });
    const request = { body: {} };
    const response = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    middleware(request, response, next);
    expect(next).toHaveBeenCalled();
  });

  it('should call next for invalid query syntax', () => {
    const middleware = sentinelMiddleware(testSchema, { maxDepth: 5 });
    const request = { body: { query: '{ this is not valid graphql :::' } };
    const response = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    middleware(request, response, next);
    expect(next).toHaveBeenCalled();
  });
});
