import { GraphQLError } from 'graphql';
import type { ASTVisitor, ValidationContext } from 'graphql';

export const createDepthLimitRule = (maxDepth = 10) =>
  function DepthLimitRule(context: ValidationContext): ASTVisitor {
    return {
      Document: {
        enter(node) {
          // The recursive measurement helper is kept below the visitor factory.
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          const depth = measureDepth(node);
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

const measureDepth = (
  node: Record<string, unknown> | { kind: string; selectionSet?: unknown; selections?: unknown[] },
  currentDepth = 0,
): number => {
  if (!node || typeof node !== 'object') {
    return currentDepth;
  }

  const selectionSet = (node as Record<string, unknown>).selectionSet as
    { selections?: unknown[] } | undefined;
  if (selectionSet && Array.isArray(selectionSet.selections)) {
    let maxChildDepth = currentDepth + 1;
    for (const selection of selectionSet.selections) {
      const childDepth = measureDepth(selection as Record<string, unknown>, currentDepth + 1);
      if (childDepth > maxChildDepth) {
        maxChildDepth = childDepth;
      }
    }
    return maxChildDepth;
  }

  // Check definitions (Document node)
  const definitions = (node as Record<string, unknown>).definitions as unknown[] | undefined;
  if (Array.isArray(definitions)) {
    let maxDefinitionDepth = 0;
    for (const definition of definitions) {
      const definitionDepth = measureDepth(definition as Record<string, unknown>, 0);
      if (definitionDepth > maxDefinitionDepth) {
        maxDefinitionDepth = definitionDepth;
      }
    }
    return maxDefinitionDepth;
  }

  return currentDepth;
};
