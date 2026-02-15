import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const introspectionCheck: SecurityCheck = {
  name: 'introspection',
  severity: 'medium',

  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const query = '{ __schema { types { name } } }';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ query }),
      });

      const body = await response.json();
      const hasSchema = body?.data?.__schema?.types?.length > 0;

      return {
        check: 'introspection',
        severity: 'medium',
        passed: !hasSchema,
        title: 'Introspection Enabled',
        description: hasSchema
          ? 'GraphQL introspection is enabled, exposing the full API schema to attackers.'
          : 'GraphQL introspection is properly disabled.',
        remediation: 'Disable introspection in production to prevent schema exposure.',
        details: {
          introspectionEnabled: hasSchema,
          typesFound: hasSchema ? body.data.__schema.types.length : 0,
        },
      };
    } catch (error) {
      return {
        check: 'introspection',
        severity: 'medium',
        passed: true,
        title: 'Introspection Enabled',
        description: 'Could not perform introspection query (likely disabled or endpoint unreachable).',
        remediation: 'Disable introspection in production to prevent schema exposure.',
        details: { error: String(error) },
      };
    }
  },
};
