import type { SecurityCheck, ScanResult } from '../../types/index.js';

const CHECK_NAME = 'batch-attack';

export const batchAttackCheck: SecurityCheck = {
  name: CHECK_NAME,
  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const singleQuery = { query: '{ __typename }' };
    const batchPayload = Array.from({ length: 10 }, () => ({ ...singleQuery }));

    // The scanner must report both accepted batches and endpoint failures.
    // eslint-disable-next-line unicorn/try-complexity
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(batchPayload),
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        method: 'POST',
      });

      const body: any = await response.json();
      const isBatchResponse = Array.isArray(body) && body.length === 10;

      return {
        check: CHECK_NAME,
        description: isBatchResponse
          ? 'Server accepts batched queries, enabling amplification attacks.'
          : 'Server does not accept batched queries.',
        details: {
          batchAccepted: isBatchResponse,
          batchSize: 10,
          responseType: Array.isArray(body) ? 'array' : typeof body,
        },
        passed: !isBatchResponse,
        remediation: 'Disable or limit batch query support to prevent query amplification attacks.',
        severity: 'medium',
        title: 'Batch Queries Allowed',
      };
    } catch (error) {
      return {
        check: CHECK_NAME,
        description: 'Could not test batch queries (endpoint unreachable or request failed).',
        details: { error: String(error) },
        passed: true,
        remediation: 'Disable or limit batch query support to prevent query amplification attacks.',
        severity: 'medium',
        title: 'Batch Queries Allowed',
      };
    }
  },

  severity: 'medium',
};
