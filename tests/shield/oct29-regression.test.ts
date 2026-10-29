import { buildSchema, parse, validate } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { createFieldAuthRule } from '../../src/shield/field-auth.js';
import { createRateLimiter } from '../../src/shield/rate-limiter.js';

const schema = buildSchema(`
  interface Node { secret: String }
  type User implements Node { secret: String }
  type Query { node: Node }
  type Mutation { secret: String }
  type Subscription { secret: String }
`);

describe('authorization parent types', () => {
  it.each([
    'mutation { secret }',
    'subscription { secret }',
    '{ node { ... on User { secret } } }',
    '{ node { ...Private } } fragment Private on User { secret }',
  ])('applies the schema parent policy to %s', (query) => {
    const errors = validate(schema, parse(query), [
      createFieldAuthRule({
        rules: {
          'Mutation.secret': { requireAuth: true },
          'Subscription.secret': { requireAuth: true },
          'User.secret': { requireAuth: true },
        },
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('requires authentication');
  });
});

it('resetting an empty client key preserves other clients', () => {
  const limiter = createRateLimiter({ max: 1, window: 1000 });
  // The public limiter exposes destroy(), not Symbol.dispose.
  // eslint-disable-next-line unicorn/prefer-dispose
  try {
    limiter.check('');
    limiter.check('other');
    limiter.reset('');
    expect(limiter.check('other').allowed).toBe(false);
    expect(limiter.check('').allowed).toBe(true);
  } finally {
    limiter.destroy();
  }
});

it('schedules large rate windows without Node timer overflow', () => {
  const schedule = vi.spyOn(globalThis, 'setInterval');
  const limiter = createRateLimiter({ max: 1, window: 2 ** 31 });
  try {
    expect(schedule).toHaveBeenLastCalledWith(expect.any(Function), 2 ** 31 - 1);
  } finally {
    limiter.destroy();
    schedule.mockRestore();
  }
});
