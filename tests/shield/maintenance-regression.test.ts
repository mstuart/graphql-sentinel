import { expect, it } from 'vitest';
import { buildSchema, parse, validate } from 'graphql';
import { createDepthLimitRule } from '../../src/shield/depth-limiter.js';
import { createComplexityRule } from '../../src/shield/complexity-analyzer.js';

const schema = buildSchema(
  'type Query { users: [User] } type User { name: String friends: [User] }',
);

it('measures named and inline fragments at their actual field depth', () => {
  const fragmented = parse(`
    { users { ...A } }
    fragment A on User { friends { ...B } }
    fragment B on User { friends { name } }
  `);
  const errors = validate(schema, fragmented, [createDepthLimitRule(3)]);
  expect(errors).toHaveLength(1);
  expect(errors[0].message).toContain('depth of 4');
  expect(
    validate(schema, parse('{ users { ... on User { name } } }'), [createDepthLimitRule(2)]),
  ).toEqual([]);
});

it('charges fragment fields under every list multiplier and ignores unused definitions', () => {
  const inline = parse('{ users { name friends { name } } }');
  const fragmented = parse(`
    { users { ...Fields friends { ...Fields } } }
    fragment Fields on User { name }
    fragment Unused on User { friends { name } }
  `);
  const rule = createComplexityRule({ maxComplexity: 100 });
  const errors = validate(schema, fragmented, [rule]);
  expect(errors.map((error) => error.message)).toEqual(
    validate(schema, inline, [rule]).map((error) => error.message),
  );
  expect(errors).toHaveLength(1);
});

it('rejects weights that disable or poison complexity enforcement', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    expect(() => createComplexityRule({ defaultFieldCost: value })).toThrow(RangeError);
    expect(() => createComplexityRule({ listFieldMultiplier: value })).toThrow(RangeError);
  }
});

it('reports cyclic fragments without recursing forever', () => {
  const document = parse('{ users { ...A } } fragment A on User { friends { ...A } }');
  for (const rule of [createDepthLimitRule(), createComplexityRule()]) {
    const errors = validate(schema, document, [rule]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('cyclic fragment');
  }
});

it('preserves list costs inside introspection fields', () => {
  const document = parse('{ __schema { types { name } } }');
  expect(validate(schema, document, [createComplexityRule({ maxComplexity: 11 })])).toHaveLength(1);
});
