import type { SecurityCheck, ScanResult } from '../../types/index.js';

const CHECK_NAME = 'field-suggestion';

export const fieldSuggestionCheck: SecurityCheck = {
  name: CHECK_NAME,
  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const query = '{ __schemax }';

    // The scanner must report both suggestion behavior and endpoint failures.
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
      const errorMessages = (body?.errors || [])
        .map((error: { message: string }) => error.message)
        .join(' ');
      const hasSuggestions =
        errorMessages.toLowerCase().includes('did you mean') ||
        errorMessages.toLowerCase().includes('do you mean');

      return {
        check: CHECK_NAME,
        description: hasSuggestions
          ? 'Server exposes field suggestions in error messages, aiding schema discovery.'
          : 'Server does not expose field suggestions in error messages.',
        details: {
          errorMessages: errorMessages.slice(0, 500),
          suggestionsExposed: hasSuggestions,
        },
        passed: !hasSuggestions,
        remediation:
          'Disable field suggestions in production to prevent schema enumeration via error messages.',
        severity: 'low',
        title: 'Field Suggestions Exposed',
      };
    } catch (error) {
      return {
        check: CHECK_NAME,
        description: 'Could not test field suggestions (endpoint unreachable or request failed).',
        details: { error: String(error) },
        passed: true,
        remediation:
          'Disable field suggestions in production to prevent schema enumeration via error messages.',
        severity: 'low',
        title: 'Field Suggestions Exposed',
      };
    }
  },

  severity: 'low',
};
