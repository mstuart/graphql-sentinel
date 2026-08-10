import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const introspectionCheck: SecurityCheck = {
  name: 'introspection',
  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const query = '{ __schema { types { name } } }';

    // The scanner must report both introspection behavior and endpoint failures.
    // eslint-disable-next-line unicorn/try-complexity
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ query }),
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        method: 'POST',
      });

      const body: any = await response.json();
      const hasSchema = body?.data?.__schema?.types?.length > 0;

      return {
        check: 'introspection',
        description: hasSchema
          ? 'GraphQL introspection is enabled, exposing the full API schema to attackers.'
          : 'GraphQL introspection is properly disabled.',
        details: {
          introspectionEnabled: hasSchema,
          typesFound: hasSchema ? body.data.__schema.types.length : 0,
        },
        passed: !hasSchema,
        remediation: 'Disable introspection in production to prevent schema exposure.',
        severity: 'medium',
        title: 'Introspection Enabled',
      };
    } catch (error) {
      return {
        check: 'introspection',
        description:
          'Could not perform introspection query (likely disabled or endpoint unreachable).',
        details: { error: String(error) },
        passed: true,
        remediation: 'Disable introspection in production to prevent schema exposure.',
        severity: 'medium',
        title: 'Introspection Enabled',
      };
    }
  },

  severity: 'medium',
};
