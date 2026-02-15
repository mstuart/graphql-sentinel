import type { ShieldConfig } from '../types/index.js';
import { createDepthLimitRule } from './depth-limiter.js';
import { createComplexityRule } from './complexity-analyzer.js';
import { createAliasLimitRule } from './alias-limiter.js';
import { createIntrospectionControlRule } from './introspection-control.js';
import { createRateLimiter } from './rate-limiter.js';

type ValidationRule = (context: import('graphql').ValidationContext) => import('graphql').ASTVisitor;

export interface Shield {
  validationRules: ValidationRule[];
  rateLimiter?: ReturnType<typeof createRateLimiter>;
}

export function createShield(config: ShieldConfig): Shield {
  const validationRules: ValidationRule[] = [];

  if (config.maxDepth !== undefined) {
    validationRules.push(createDepthLimitRule(config.maxDepth));
  }

  if (config.maxComplexity !== undefined) {
    validationRules.push(
      createComplexityRule({
        maxComplexity: config.maxComplexity,
      }),
    );
  }

  if (config.maxAliases !== undefined) {
    validationRules.push(createAliasLimitRule(config.maxAliases));
  }

  if (config.disableIntrospection) {
    validationRules.push(createIntrospectionControlRule());
  }

  let rateLimiter: ReturnType<typeof createRateLimiter> | undefined;
  if (config.rateLimit) {
    rateLimiter = createRateLimiter(config.rateLimit);
  }

  return { validationRules, rateLimiter };
}

export { createDepthLimitRule } from './depth-limiter.js';
export { createComplexityRule } from './complexity-analyzer.js';
export { createAliasLimitRule } from './alias-limiter.js';
export { createIntrospectionControlRule } from './introspection-control.js';
export { createRateLimiter } from './rate-limiter.js';
