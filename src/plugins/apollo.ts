import { validate } from 'graphql';
import { createShield } from '../shield/index.js';
import type { GraphQLSchema, DocumentNode } from 'graphql';
import type { ShieldConfig } from '../types/index.js';

export interface ApolloPluginContext {
  request: {
    query?: string;
  };
  document?: DocumentNode;
  schema: GraphQLSchema;
}

export const sentinelApolloPlugin = (config?: ShieldConfig) => {
  const shield = createShield(config ?? {});

  return {
    requestDidStart: async () => ({
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
    }),
  };
};
