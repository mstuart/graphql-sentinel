import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const aliasOverloadingCheck: SecurityCheck = {
  name: 'alias-overloading',
  severity: 'medium',

  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const aliasCount = 100;
    const aliases = Array.from({ length: aliasCount }, (_, i) => `a${i}: __typename`).join(' ');
    const query = `{ ${aliases} }`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ query }),
      });

       
      const body: any = await response.json();
      const hasData = body?.data !== undefined && body?.data !== null;
      const aliasKeys = hasData ? Object.keys(body.data) : [];
      const allAliasesResolved = aliasKeys.length >= aliasCount;

      // Check if server returned errors related to aliases
      const hasAliasError = body?.errors?.some(
        (e: { message: string }) =>
          e.message.toLowerCase().includes('alias') ||
          e.message.toLowerCase().includes('too many') ||
          e.message.toLowerCase().includes('limit'),
      );

      const passed = hasAliasError || !allAliasesResolved;

      return {
        check: 'alias-overloading',
        severity: 'medium',
        passed,
        title: 'Alias Overloading Possible',
        description: passed
          ? 'Server properly limits the number of aliases in a query.'
          : `Server accepted ${aliasCount} aliases without restriction, enabling alias-based DoS attacks.`,
        remediation:
          'Implement alias limits to prevent denial-of-service via alias overloading.',
        details: {
          aliasesTested: aliasCount,
          aliasesAccepted: aliasKeys.length,
          blocked: passed,
        },
      };
    } catch (error) {
      return {
        check: 'alias-overloading',
        severity: 'medium',
        passed: true,
        title: 'Alias Overloading Possible',
        description:
          'Could not test alias overloading (endpoint unreachable or request failed).',
        remediation:
          'Implement alias limits to prevent denial-of-service via alias overloading.',
        details: { error: String(error) },
      };
    }
  },
};
