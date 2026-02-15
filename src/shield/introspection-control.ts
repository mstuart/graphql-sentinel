import type { ASTVisitor, ValidationContext } from 'graphql';
import { GraphQLError } from 'graphql';

export function createIntrospectionControlRule() {
  return function IntrospectionControlRule(context: ValidationContext): ASTVisitor {
    return {
      Field(node) {
        const fieldName = node.name.value;
        if (fieldName === '__schema' || fieldName === '__type') {
          context.reportError(
            new GraphQLError(
              `Introspection query is not allowed. Field "${fieldName}" is disabled.`,
            ),
          );
        }
      },
    };
  };
}
