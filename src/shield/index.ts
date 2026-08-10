import { createDepthLimitRule } from './depth-limiter.js';
import { createComplexityRule } from './complexity-analyzer.js';
import { createAliasLimitRule } from './alias-limiter.js';
import { createIntrospectionControlRule } from './introspection-control.js';
import { createRateLimiter } from './rate-limiter.js';
import { createFieldAuthRule } from './field-auth.js';
import type { ShieldConfig } from '../types/index.js';
import type { ASTVisitor, ValidationContext } from 'graphql';

type ValidationRule = (context: ValidationContext) => ASTVisitor;

export interface Shield {
  validationRules: ValidationRule[];
  rateLimiter?: ReturnType<typeof createRateLimiter>;
}

export const createShield = (config: ShieldConfig): Shield => {
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

  if (config.fieldAuth) {
    validationRules.push(createFieldAuthRule(config.fieldAuth));
  }

  let rateLimiter: ReturnType<typeof createRateLimiter> | undefined;
  if (config.rateLimit) {
    rateLimiter = createRateLimiter(config.rateLimit);
  }

  return { rateLimiter, validationRules };
};

export { createDepthLimitRule } from './depth-limiter.js';
export { createComplexityRule } from './complexity-analyzer.js';
export { createAliasLimitRule } from './alias-limiter.js';
export { createIntrospectionControlRule } from './introspection-control.js';
export { createRateLimiter } from './rate-limiter.js';
export { createFieldAuthRule } from './field-auth.js';
