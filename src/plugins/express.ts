import { validate, parse, type GraphQLSchema, type GraphQLError } from 'graphql';
import type { ShieldConfig } from '../types/index.js';
import { createShield } from '../shield/index.js';

export interface SentinelRequest {
  body?: {
    query?: string;
  };
}

export interface SentinelResponse {
  status(code: number): SentinelResponse;
  json(data: unknown): void;
}

export function sentinelMiddleware(schema: GraphQLSchema, config?: ShieldConfig) {
  const shield = createShield(config ?? {});

  return (req: SentinelRequest, res: SentinelResponse, next: () => void) => {
    const query = req.body?.query;

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
      res.status(400).json({
        errors: errors.map((error: GraphQLError) => ({
          message: error.message,
          extensions: {
            code: 'GRAPHQL_SENTINEL_BLOCKED',
          },
        })),
      });
      return;
    }

    next();
  };
}
