import { GraphQLError } from 'graphql';
import { measureDocument } from './measure.js';
import type { ASTVisitor, ValidationContext } from 'graphql';

export const createDepthLimitRule = (maxDepth = 10) => {
  if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0) {
    throw new RangeError('maxDepth must be a positive safe integer');
  }

  return function DepthLimitRule(context: ValidationContext): ASTVisitor {
    return {
      Document: {
        enter(node) {
          let depth: number;
          try {
            ({ depth } = measureDocument(node));
          } catch (error) {
            if (!(error instanceof GraphQLError)) {
              throw error;
            }
            context.reportError(error);
            return;
          }
          if (depth > maxDepth) {
            context.reportError(
              new GraphQLError(
                `Query depth of ${depth} exceeds maximum allowed depth of ${maxDepth}.`,
              ),
            );
          }
        },
      },
    };
  };
};
