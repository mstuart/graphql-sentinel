import { GraphQLError } from 'graphql';
import type { ASTVisitor, ValidationContext } from 'graphql';

const introspectionControlRule = (context: ValidationContext): ASTVisitor => ({
  // GraphQL visitor keys use the schema's PascalCase AST node names.
  // eslint-disable-next-line sonarjs/function-name
  Field: (node) => {
    const fieldName = node.name.value;
    if (fieldName === '__schema' || fieldName === '__type') {
      context.reportError(
        new GraphQLError(`Introspection query is not allowed. Field "${fieldName}" is disabled.`),
      );
    }
  },
});

export const createIntrospectionControlRule = () => introspectionControlRule;
