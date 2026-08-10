import { validate, parse } from 'graphql';
import { createShield } from '../shield/index.js';
import type { GraphQLSchema, GraphQLError } from 'graphql';
import type { ShieldConfig } from '../types/index.js';

export interface SentinelRequest {
  body?: {
    query?: string;
  };
}

export interface SentinelResponse {
  status: (code: number) => SentinelResponse;
  json: (data: unknown) => void;
}

export const sentinelMiddleware = (schema: GraphQLSchema, config?: ShieldConfig) => {
  const shield = createShield(config ?? {});

  return (request: SentinelRequest, response: SentinelResponse, next: () => void) => {
    const query = request.body?.query;

    if (!query || typeof query !== 'string') {
      next();
      return;
    }

    let document;
    try {
      document = parse(query);
    } catch {
      // Let the GraphQL server handle parse errors
      next();
      return;
    }

    const errors = validate(schema, document, shield.validationRules);

    if (errors.length > 0) {
      response.status(400).json({
        errors: errors.map((error: GraphQLError) => ({
          extensions: {
            code: 'GRAPHQL_SENTINEL_BLOCKED',
          },
          message: error.message,
        })),
      });
      return;
    }

    next();
  };
};
