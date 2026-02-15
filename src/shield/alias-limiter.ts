import type { ASTVisitor, ValidationContext } from 'graphql';
import { GraphQLError } from 'graphql';

export function createAliasLimitRule(maxAliases: number = 15) {
  return function AliasLimitRule(context: ValidationContext): ASTVisitor {
    let aliasCount = 0;

    return {
      Field: {
        enter(node) {
          if (node.alias) {
            aliasCount++;
          }
        },
      },
      Document: {
        leave() {
          if (aliasCount > maxAliases) {
            context.reportError(
              new GraphQLError(
                `Query contains ${aliasCount} aliases, exceeding the maximum of ${maxAliases}.`,
              ),
            );
          }
        },
      },
    };
  };
}
