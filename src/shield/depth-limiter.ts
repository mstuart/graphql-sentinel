import type { ASTVisitor, ValidationContext } from 'graphql';
import { GraphQLError } from 'graphql';

export function createDepthLimitRule(maxDepth: number = 10) {
  return function DepthLimitRule(context: ValidationContext): ASTVisitor {
    return {
      Document: {
        enter(node) {
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
}

function measureDepth(node: { kind: string; selectionSet?: unknown; selections?: unknown[] } | Record<string, unknown>, currentDepth: number = 0): number {
  if (!node || typeof node !== 'object') {
    return currentDepth;
  }

  const selectionSet = (node as Record<string, unknown>).selectionSet as { selections?: unknown[] } | undefined;
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
    let maxDefDepth = 0;
    for (const def of definitions) {
      const defDepth = measureDepth(def as Record<string, unknown>, 0);
      if (defDepth > maxDefDepth) {
        maxDefDepth = defDepth;
      }
    }
    return maxDefDepth;
  }

  return currentDepth;
}
