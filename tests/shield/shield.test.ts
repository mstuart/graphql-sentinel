import { describe, it, expect } from 'vitest';
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  parse,
  validate,
} from 'graphql';
import { createDepthLimitRule } from '../../src/shield/depth-limiter.js';
import { createComplexityRule } from '../../src/shield/complexity-analyzer.js';
import { createAliasLimitRule } from '../../src/shield/alias-limiter.js';
import { createIntrospectionControlRule } from '../../src/shield/introspection-control.js';
import { createRateLimiter } from '../../src/shield/rate-limiter.js';
import { createFieldAuthRule } from '../../src/shield/field-auth.js';
import { createShield } from '../../src/shield/index.js';

// Create a test schema
const UserType: GraphQLObjectType = new GraphQLObjectType({
  fields: () => ({
    email: { type: GraphQLString },
    friends: { type: new GraphQLList(UserType) },
    id: { type: GraphQLString },
    name: { type: GraphQLString },
  }),
  name: 'User',
});

const testSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    fields: {
      hello: {
        type: GraphQLString,
      },
      user: {
        args: { id: { type: new GraphQLNonNull(GraphQLString) } },
        type: UserType,
      },
      users: {
        type: new GraphQLList(UserType),
      },
    },
    name: 'Query',
  }),
});

describe('Depth Limiter', () => {
  it('should allow queries within depth limit', () => {
    const query = parse('{ user(id: "1") { name email } }');
    const errors = validate(testSchema, query, [createDepthLimitRule(5)]);
    expect(errors).toHaveLength(0);
  });

  it('should reject queries exceeding depth limit', () => {
    const query = parse(`
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
    const errors = validate(testSchema, query, [createDepthLimitRule(3)]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('depth');
    expect(errors[0].message).toContain('exceeds');
  });

  it('should use default max depth of 10', () => {
    const query = parse('{ user(id: "1") { name } }');
    const errors = validate(testSchema, query, [createDepthLimitRule()]);
    expect(errors).toHaveLength(0);
  });
});

describe('Complexity Analyzer', () => {
  it('should allow queries within complexity limit', () => {
    const query = parse('{ hello }');
    const errors = validate(testSchema, query, [createComplexityRule({ maxComplexity: 10 })]);
    expect(errors).toHaveLength(0);
  });

  it('should reject queries exceeding complexity limit', () => {
    const query = parse(`
      {
        users {
          id
          name
          email
          friends {
            id
            name
          }
        }
      }
    `);
    const errors = validate(testSchema, query, [createComplexityRule({ maxComplexity: 5 })]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('complexity');
    expect(errors[0].message).toContain('exceeds');
  });

  it('should use default complexity limit of 1000', () => {
    const query = parse('{ hello }');
    const errors = validate(testSchema, query, [createComplexityRule()]);
    expect(errors).toHaveLength(0);
  });
});

describe('Alias Limiter', () => {
  it('should allow queries with few aliases', () => {
    const query = parse('{ a1: hello a2: hello a3: hello }');
    const errors = validate(testSchema, query, [createAliasLimitRule(5)]);
    expect(errors).toHaveLength(0);
  });

  it('should reject queries with too many aliases', () => {
    const aliases = Array.from({ length: 20 }, (_, index) => `a${index}: hello`).join(' ');
    const query = parse(`{ ${aliases} }`);
    const errors = validate(testSchema, query, [createAliasLimitRule(15)]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('aliases');
    expect(errors[0].message).toContain('20');
  });

  it('should use default max aliases of 15', () => {
    const aliases = Array.from({ length: 10 }, (_, index) => `a${index}: hello`).join(' ');
    const query = parse(`{ ${aliases} }`);
    const errors = validate(testSchema, query, [createAliasLimitRule()]);
    expect(errors).toHaveLength(0);
  });
});

describe('Introspection Control', () => {
  it('should block __schema introspection', () => {
    const query = parse('{ __schema { types { name } } }');
    const errors = validate(testSchema, query, [createIntrospectionControlRule()]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.message.includes('__schema'))).toBe(true);
  });

  it('should block __type introspection', () => {
    const query = parse('{ __type(name: "Query") { name } }');
    const errors = validate(testSchema, query, [createIntrospectionControlRule()]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.message.includes('__type'))).toBe(true);
  });

  it('should allow normal queries', () => {
    const query = parse('{ hello }');
    const errors = validate(testSchema, query, [createIntrospectionControlRule()]);
    expect(errors).toHaveLength(0);
  });
});

describe('Rate Limiter', () => {
  it('should allow requests within limit', () => {
    const limiter = createRateLimiter({ max: 10, window: 1000 });
    const result = limiter.check('client-1', 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    limiter.destroy();
  });

  it('should block requests exceeding limit', () => {
    const limiter = createRateLimiter({ max: 3, window: 1000 });
    limiter.check('client-1', 1);
    limiter.check('client-1', 1);
    limiter.check('client-1', 1);
    const result = limiter.check('client-1', 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    limiter.destroy();
  });

  it('should track clients independently', () => {
    const limiter = createRateLimiter({ max: 2, window: 1000 });
    limiter.check('client-1', 1);
    limiter.check('client-1', 1);
    const result1 = limiter.check('client-1', 1);
    const result2 = limiter.check('client-2', 1);
    expect(result1.allowed).toBe(false);
    expect(result2.allowed).toBe(true);
    limiter.destroy();
  });

  it('should support cost-based limiting', () => {
    const limiter = createRateLimiter({ max: 10, window: 1000 });
    const result1 = limiter.check('client-1', 5);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(5);

    const result2 = limiter.check('client-1', 6);
    expect(result2.allowed).toBe(false);
    limiter.destroy();
  });

  it('should reset client state', () => {
    const limiter = createRateLimiter({ max: 2, window: 1000 });
    limiter.check('client-1', 2);
    limiter.reset('client-1');
    const result = limiter.check('client-1', 1);
    expect(result.allowed).toBe(true);
    limiter.destroy();
  });
});

describe('createShield', () => {
  it('should create shield with all configured rules', () => {
    const shield = createShield({
      disableIntrospection: true,
      maxAliases: 10,
      maxComplexity: 100,
      maxDepth: 5,
      rateLimit: { max: 100, window: 60_000 },
    });

    expect(shield.validationRules).toHaveLength(4);
    expect(shield.rateLimiter).toBeDefined();
  });

  it('should create shield with partial config', () => {
    const shield = createShield({
      maxDepth: 10,
    });

    expect(shield.validationRules).toHaveLength(1);
    expect(shield.rateLimiter).toBeUndefined();
  });

  it('should create empty shield with no config', () => {
    const shield = createShield({});

    expect(shield.validationRules).toHaveLength(0);
    expect(shield.rateLimiter).toBeUndefined();
  });

  it('should include field auth rule when configured', () => {
    const shield = createShield({
      fieldAuth: {
        rules: {
          'Query.user': { requireAuth: true },
        },
      },
    });

    expect(shield.validationRules).toHaveLength(1);
  });
});

describe('Field Auth Rule', () => {
  it('should block access to fields requiring auth when not authenticated', () => {
    const rule = createFieldAuthRule({
      extractContext: () => null,
      rules: {
        'Query.user': { requireAuth: true },
      },
    });

    const query = parse('{ user(id: "1") { name } }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Access denied');
    expect(errors[0].message).toContain('requires authentication');
  });

  it('should allow access to fields requiring auth when authenticated', () => {
    const rule = createFieldAuthRule({
      extractContext: () => ({
        authenticated: true,
        permissions: [],
        roles: [],
      }),
      rules: {
        'Query.user': { requireAuth: true },
      },
    });

    const query = parse('{ user(id: "1") { name } }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors).toHaveLength(0);
  });

  it('should block access when user lacks required role', () => {
    const rule = createFieldAuthRule({
      extractContext: () => ({
        authenticated: true,
        permissions: [],
        roles: ['viewer'],
      }),
      rules: {
        'Query.users': { requireAuth: true, roles: ['admin'] },
      },
    });

    const query = parse('{ users { name } }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('requires one of roles');
    expect(errors[0].message).toContain('admin');
  });

  it('should allow access when user has required role', () => {
    const rule = createFieldAuthRule({
      extractContext: () => ({
        authenticated: true,
        permissions: [],
        roles: ['admin', 'viewer'],
      }),
      rules: {
        'Query.users': { requireAuth: true, roles: ['admin'] },
      },
    });

    const query = parse('{ users { name } }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors).toHaveLength(0);
  });

  it('should block access when user lacks required permission', () => {
    const rule = createFieldAuthRule({
      extractContext: () => ({
        authenticated: true,
        permissions: ['read:posts'],
        roles: [],
      }),
      rules: {
        'Query.user': {
          permissions: ['read:users'],
          requireAuth: true,
        },
      },
    });

    const query = parse('{ user(id: "1") { name } }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('requires one of permissions');
  });

  it('should allow access when user has required permission', () => {
    const rule = createFieldAuthRule({
      extractContext: () => ({
        authenticated: true,
        permissions: ['read:users', 'write:users'],
        roles: [],
      }),
      rules: {
        'Query.user': {
          permissions: ['read:users'],
          requireAuth: true,
        },
      },
    });

    const query = parse('{ user(id: "1") { name } }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors).toHaveLength(0);
  });

  it('should allow fields with no auth rules', () => {
    const rule = createFieldAuthRule({
      extractContext: () => null,
      rules: {
        'Query.user': { requireAuth: true },
      },
    });

    const query = parse('{ hello }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors).toHaveLength(0);
  });

  it('should work without extractContext (defaults to null)', () => {
    const rule = createFieldAuthRule({
      rules: {
        'Query.hello': { requireAuth: true },
      },
    });

    const query = parse('{ hello }');
    const errors = validate(testSchema, query, [rule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Access denied');
  });
});
