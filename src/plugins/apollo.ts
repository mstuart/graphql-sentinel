import { validate, parse as gqlParse, type GraphQLSchema, type DocumentNode } from 'graphql';
import type { ShieldConfig } from '../types/index.js';
import { createShield } from '../shield/index.js';

export interface ApolloPluginContext {
  request: {
    query?: string;
  };
  document?: DocumentNode;
  schema: GraphQLSchema;
}

export function sentinelApolloPlugin(config?: ShieldConfig) {
  const shield = createShield(config ?? {});

  return {
    async requestDidStart() {
      return {
        async didResolveOperation(requestContext: ApolloPluginContext) {
          const { document, schema } = requestContext;

          if (!document) {
            return;
          }

          const errors = validate(schema, document, shield.validationRules);

          if (errors.length > 0) {
            throw errors[0];
          }
        },
      };
    },
  };
}
