import { GraphQLError } from 'graphql';
import { measureDocument } from './measure.js';
import type { ASTVisitor, ValidationContext } from 'graphql';

export interface ComplexityConfig {
  maxComplexity?: number;
  defaultFieldCost?: number;
  listFieldMultiplier?: number;
}

export const createComplexityRule = (config: ComplexityConfig = {}) => {
  const { maxComplexity = 1000, defaultFieldCost = 1, listFieldMultiplier = 10 } = config;

  if (!Number.isFinite(maxComplexity) || maxComplexity <= 0) {
    throw new RangeError('maxComplexity must be a positive finite number');
  }

  const weights = Object.entries({ defaultFieldCost, listFieldMultiplier });
  for (const [name, value] of weights) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }

  return function ComplexityRule(context: ValidationContext): ASTVisitor {
    return {
      Document: {
        enter(node) {
          let complexity: number;
          try {
            ({ complexity } = measureDocument(node, context.getSchema(), {
              defaultFieldCost,
              listFieldMultiplier,
            }));
          } catch (error) {
            if (!(error instanceof GraphQLError)) {
              throw error;
            }
            context.reportError(error);
            return;
          }
          if (complexity > maxComplexity) {
            context.reportError(
              new GraphQLError(
                `Query complexity of ${complexity} exceeds maximum allowed complexity of ${maxComplexity}.`,
              ),
            );
          }
        },
      },
    };
  };
};
