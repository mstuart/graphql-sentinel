import { GraphQLError } from 'graphql';
import type { ASTVisitor, ValidationContext } from 'graphql';

export const createAliasLimitRule = (maxAliases = 15) =>
  function AliasLimitRule(context: ValidationContext): ASTVisitor {
    let aliasCount = 0;

    return {
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
      Field: {
        enter(node) {
          if (node.alias) {
            aliasCount += 1;
          }
        },
      },
    };
  };
