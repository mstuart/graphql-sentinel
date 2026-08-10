import type { SecurityCheck, ScanResult } from '../../types/index.js';

const CHECK_NAME = 'alias-overloading';

export const aliasOverloadingCheck: SecurityCheck = {
  name: CHECK_NAME,
  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const aliasCount = 100;
    const aliases = Array.from({ length: aliasCount }, (_, index) => `a${index}: __typename`).join(
      ' ',
    );
    const query = `{ ${aliases} }`;

    // The scanner must report both accepted queries and endpoint failures.
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
      const hasData = body?.data !== undefined && body?.data !== null;
      const aliasKeys = hasData ? Object.keys(body.data) : [];
      const isAllAliasesResolved = aliasKeys.length >= aliasCount;

      // Check if server returned errors related to aliases
      const hasAliasError = body?.errors?.some(
        (error: { message: string }) =>
          error.message.toLowerCase().includes('alias') ||
          error.message.toLowerCase().includes('too many') ||
          error.message.toLowerCase().includes('limit'),
      );

      const passed = hasAliasError || !isAllAliasesResolved;

      return {
        check: CHECK_NAME,
        description: passed
          ? 'Server properly limits the number of aliases in a query.'
          : `Server accepted ${aliasCount} aliases without restriction, enabling alias-based DoS attacks.`,
        details: {
          aliasesAccepted: aliasKeys.length,
          aliasesTested: aliasCount,
          blocked: passed,
        },
        passed,
        remediation: 'Implement alias limits to prevent denial-of-service via alias overloading.',
        severity: 'medium',
        title: 'Alias Overloading Possible',
      };
    } catch (error) {
      return {
        check: CHECK_NAME,
        description: 'Could not test alias overloading (endpoint unreachable or request failed).',
        details: { error: String(error) },
        passed: true,
        remediation: 'Implement alias limits to prevent denial-of-service via alias overloading.',
        severity: 'medium',
        title: 'Alias Overloading Possible',
      };
    }
  },

  severity: 'medium',
};
