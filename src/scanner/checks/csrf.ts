import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const csrfCheck: SecurityCheck = {
  name: 'csrf',
  severity: 'high',

  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    // Test if the server accepts queries via GET request (CSRF risk for mutations)
    const query = encodeURIComponent('{ __typename }');
    const url = `${endpoint}?query=${query}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...headers,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = await response.json();
      const hasData = body?.data?.__typename !== undefined;

      return {
        check: 'csrf',
        severity: 'high',
        passed: !hasData,
        title: 'GET Mutations Allowed (CSRF Risk)',
        description: hasData
          ? 'Server accepts GraphQL queries via GET requests, which can be exploited for CSRF attacks on mutations.'
          : 'Server does not accept GraphQL queries via GET requests.',
        remediation:
          'Disable GET method for GraphQL queries, or at minimum restrict GET to only allow queries (not mutations).',
        details: {
          getRequestAccepted: hasData,
          statusCode: response.status,
        },
      };
    } catch (error) {
      return {
        check: 'csrf',
        severity: 'high',
        passed: true,
        title: 'GET Mutations Allowed (CSRF Risk)',
        description:
          'Could not test CSRF via GET request (endpoint unreachable or request failed).',
        remediation:
          'Disable GET method for GraphQL queries, or at minimum restrict GET to only allow queries (not mutations).',
        details: { error: String(error) },
      };
    }
  },
};
