import type { ASTVisitor, ValidationContext } from 'graphql';
import { GraphQLError } from 'graphql';

export interface ComplexityConfig {
  maxComplexity?: number;
  defaultFieldCost?: number;
  listFieldMultiplier?: number;
}

export function createComplexityRule(config: ComplexityConfig = {}) {
  const {
    maxComplexity = 1000,
    defaultFieldCost = 1,
    listFieldMultiplier = 10,
  } = config;

  return function ComplexityRule(context: ValidationContext): ASTVisitor {
    let complexity = 0;
    const multiplierStack: number[] = [1];

    return {
      Field: {
        enter(_node) {
          const currentMultiplier = multiplierStack[multiplierStack.length - 1] || 1;
          complexity += defaultFieldCost * currentMultiplier;

          // Check if field returns a list type
          const fieldDef = context.getFieldDef();
          if (fieldDef) {
            const type = fieldDef.type;
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
    };
  };
}
