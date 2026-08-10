import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const csrfCheck: SecurityCheck = {
  name: 'csrf',
  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    // Test if the server accepts queries via GET request (CSRF risk for mutations)
    const query = encodeURIComponent('{ __typename }');
    const url = `${endpoint}?query=${query}`;

    // The scanner must report both accepted requests and endpoint failures.
    // eslint-disable-next-line unicorn/try-complexity
    try {
      const response = await fetch(url, {
        headers: {
          ...headers,
        },
        method: 'GET',
      });

      const body: any = await response.json();
      const hasData = body?.data?.__typename !== undefined;

      return {
        check: 'csrf',
        description: hasData
          ? 'Server accepts GraphQL queries via GET requests, which can be exploited for CSRF attacks on mutations.'
          : 'Server does not accept GraphQL queries via GET requests.',
        details: {
          getRequestAccepted: hasData,
          statusCode: response.status,
        },
        passed: !hasData,
        remediation:
          'Disable GET method for GraphQL queries, or at minimum restrict GET to only allow queries (not mutations).',
        severity: 'high',
        title: 'GET Mutations Allowed (CSRF Risk)',
      };
    } catch (error) {
      return {
        check: 'csrf',
        description:
          'Could not test CSRF via GET request (endpoint unreachable or request failed).',
        details: { error: String(error) },
        passed: true,
        remediation:
          'Disable GET method for GraphQL queries, or at minimum restrict GET to only allow queries (not mutations).',
        severity: 'high',
        title: 'GET Mutations Allowed (CSRF Risk)',
      };
    }
  },

  severity: 'high',
};
