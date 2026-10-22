import {
  GraphQLError,
  Kind,
  getNamedType,
  isCompositeType,
  isListType,
  isNonNullType,
  SchemaMetaFieldDef,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
} from 'graphql';
import type {
  DocumentNode,
  GraphQLCompositeType,
  SelectionSetNode,
  GraphQLSchema,
  FragmentDefinitionNode,
} from 'graphql';

interface Measurement {
  complexity: number;
  depth: number;
}

const metaFields = new Map([
  ['__schema', SchemaMetaFieldDef],
  ['__type', TypeMetaFieldDef],
  ['__typename', TypeNameMetaFieldDef],
]);

export const measureDocument = (
  document: DocumentNode,
  schema?: GraphQLSchema,
  { defaultFieldCost = 1, listFieldMultiplier = 10 } = {},
): Measurement => {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }
  const fragmentMeasurements = new Map<string, Measurement>();
  const activeFragments = new Set<string>();

  const measure = (
    selectionSet: SelectionSetNode,
    parent: GraphQLCompositeType | undefined,
    // eslint-disable-next-line sonarjs/cognitive-complexity, complexity -- Recursive AST measurement keeps depth, list costs, and fragment cycle state together.
  ): Measurement => {
    let complexity = 0;
    let depth = 0;
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const field =
          (parent && 'getFields' in parent
            ? parent.getFields()[selection.name.value]
            : undefined) ?? metaFields.get(selection.name.value);
        const type = field?.type;
        const named = type ? getNamedType(type) : undefined;
        const childType = named && isCompositeType(named) ? named : undefined;
        const child = selection.selectionSet
          ? measure(selection.selectionSet, childType)
          : { complexity: 0, depth: 0 };
        const nullable = type && isNonNullType(type) ? type.ofType : type;
        complexity +=
          defaultFieldCost + child.complexity * (isListType(nullable) ? listFieldMultiplier : 1);
        depth = Math.max(depth, 1 + child.depth);
        continue;
      }

      const fragment =
        selection.kind === Kind.FRAGMENT_SPREAD ? fragments.get(selection.name.value) : selection;
      if (fragment) {
        const name = selection.kind === Kind.FRAGMENT_SPREAD ? selection.name.value : undefined;
        if (name && activeFragments.has(name)) {
          throw new GraphQLError(`Cannot measure cyclic fragment "${name}".`);
        }
        if (name) {
          activeFragments.add(name);
        }
        const condition = fragment.typeCondition
          ? schema?.getType?.(fragment.typeCondition.name.value)
          : parent;
        const child =
          (name ? fragmentMeasurements.get(name) : undefined) ??
          measure(
            fragment.selectionSet,
            condition && isCompositeType(condition) ? condition : parent,
          );
        if (name) {
          fragmentMeasurements.set(name, child);
        }
        if (name) {
          activeFragments.delete(name);
        }
        complexity += child.complexity;
        depth = Math.max(depth, child.depth);
      }
    }
    return { complexity, depth };
  };

  let complexity = 0;
  let depth = 0;
  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) {
      continue;
    }
    const root = schema?.getRootType?.(definition.operation);
    const result = measure(definition.selectionSet, root ?? undefined);
    complexity += result.complexity;
    depth = Math.max(depth, result.depth);
  }
  return { complexity, depth };
};
