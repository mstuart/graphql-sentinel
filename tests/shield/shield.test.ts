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
import { createShield } from '../../src/shield/index.js';

// Create a test schema
const UserType: GraphQLObjectType = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLString },
    name: { type: GraphQLString },
    email: { type: GraphQLString },
    friends: { type: new GraphQLList(UserType) },
  }),
});

const testSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      user: {
        type: UserType,
        args: { id: { type: new GraphQLNonNull(GraphQLString) } },
      },
      users: {
        type: new GraphQLList(UserType),
      },
      hello: {
        type: GraphQLString,
      },
    },
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
    const aliases = Array.from({ length: 20 }, (_, i) => `a${i}: hello`).join(' ');
    const query = parse(`{ ${aliases} }`);
    const errors = validate(testSchema, query, [createAliasLimitRule(15)]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('aliases');
    expect(errors[0].message).toContain('20');
  });

  it('should use default max aliases of 15', () => {
    const aliases = Array.from({ length: 10 }, (_, i) => `a${i}: hello`).join(' ');
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
    expect(errors.some((e) => e.message.includes('__schema'))).toBe(true);
  });

  it('should block __type introspection', () => {
    const query = parse('{ __type(name: "Query") { name } }');
    const errors = validate(testSchema, query, [createIntrospectionControlRule()]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('__type'))).toBe(true);
  });

  it('should allow normal queries', () => {
    const query = parse('{ hello }');
    const errors = validate(testSchema, query, [createIntrospectionControlRule()]);
    expect(errors).toHaveLength(0);
  });
});

describe('Rate Limiter', () => {
  it('should allow requests within limit', () => {
    const limiter = createRateLimiter({ window: 1000, max: 10 });
    const result = limiter.check('client-1', 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    limiter.destroy();
  });

  it('should block requests exceeding limit', () => {
    const limiter = createRateLimiter({ window: 1000, max: 3 });
    limiter.check('client-1', 1);
    limiter.check('client-1', 1);
    limiter.check('client-1', 1);
    const result = limiter.check('client-1', 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    limiter.destroy();
  });

  it('should track clients independently', () => {
    const limiter = createRateLimiter({ window: 1000, max: 2 });
    limiter.check('client-1', 1);
    limiter.check('client-1', 1);
    const result1 = limiter.check('client-1', 1);
    const result2 = limiter.check('client-2', 1);
    expect(result1.allowed).toBe(false);
    expect(result2.allowed).toBe(true);
    limiter.destroy();
  });

  it('should support cost-based limiting', () => {
    const limiter = createRateLimiter({ window: 1000, max: 10 });
    const result1 = limiter.check('client-1', 5);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(5);

    const result2 = limiter.check('client-1', 6);
    expect(result2.allowed).toBe(false);
    limiter.destroy();
  });

  it('should reset client state', () => {
    const limiter = createRateLimiter({ window: 1000, max: 2 });
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
      maxDepth: 5,
      maxComplexity: 100,
      maxAliases: 10,
      disableIntrospection: true,
      rateLimit: { window: 60000, max: 100 },
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
});
