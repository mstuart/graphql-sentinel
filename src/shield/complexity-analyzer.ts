import { GraphQLError } from 'graphql';
import type { ASTVisitor, ValidationContext } from 'graphql';

export interface ComplexityConfig {
  maxComplexity?: number;
  defaultFieldCost?: number;
  listFieldMultiplier?: number;
}

export const createComplexityRule = (config: ComplexityConfig = {}) => {
  const { maxComplexity = 1000, defaultFieldCost = 1, listFieldMultiplier = 10 } = config;

  return function ComplexityRule(context: ValidationContext): ASTVisitor {
    let complexity = 0;
    const multiplierStack: number[] = [1];

    return {
      Document: {
        leave() {
          if (complexity > maxComplexity) {
            context.reportError(
              new GraphQLError(
                `Query complexity of ${complexity} exceeds maximum allowed complexity of ${maxComplexity}.`,
              ),
            );
          }
        },
      },
      Field: {
        enter() {
          const currentMultiplier = multiplierStack.at(-1) || 1;
          complexity += defaultFieldCost * currentMultiplier;

          // Check if field returns a list type
          const fieldDefinition = context.getFieldDef();
          if (fieldDefinition) {
            const { type } = fieldDefinition;
            const typeName = type.toString();
            if (typeName.startsWith('[')) {
              multiplierStack.push(currentMultiplier * listFieldMultiplier);
            } else {
              multiplierStack.push(currentMultiplier);
            }
          } else {
            multiplierStack.push(currentMultiplier);
          }
        },
        leave() {
          multiplierStack.pop();
        },
      },
    };
  };
};
