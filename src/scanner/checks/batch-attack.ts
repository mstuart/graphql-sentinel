import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const batchAttackCheck: SecurityCheck = {
  name: 'batch-attack',
  severity: 'medium',

  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const singleQuery = { query: '{ __typename }' };
    const batchPayload = Array.from({ length: 10 }, () => ({ ...singleQuery }));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(batchPayload),
      });

      const body = await response.json();
      const isBatchResponse = Array.isArray(body) && body.length === 10;

      return {
        check: 'batch-attack',
        severity: 'medium',
        passed: !isBatchResponse,
        title: 'Batch Queries Allowed',
        description: isBatchResponse
          ? 'Server accepts batched queries, enabling amplification attacks.'
          : 'Server does not accept batched queries.',
        remediation:
          'Disable or limit batch query support to prevent query amplification attacks.',
        details: {
          batchSize: 10,
          batchAccepted: isBatchResponse,
          responseType: Array.isArray(body) ? 'array' : typeof body,
        },
      };
    } catch (error) {
      return {
        check: 'batch-attack',
        severity: 'medium',
        passed: true,
        title: 'Batch Queries Allowed',
        description: 'Could not test batch queries (endpoint unreachable or request failed).',
        remediation:
          'Disable or limit batch query support to prevent query amplification attacks.',
        details: { error: String(error) },
      };
    }
  },
};
