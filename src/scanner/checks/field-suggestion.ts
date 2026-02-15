import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const fieldSuggestionCheck: SecurityCheck = {
  name: 'field-suggestion',
  severity: 'low',

  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    const query = '{ __schemax }';

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
      const errorMessages = (body?.errors || [])
        .map((e: { message: string }) => e.message)
        .join(' ');
      const hasSuggestions =
        errorMessages.toLowerCase().includes('did you mean') ||
        errorMessages.toLowerCase().includes('do you mean');

      return {
        check: 'field-suggestion',
        severity: 'low',
        passed: !hasSuggestions,
        title: 'Field Suggestions Exposed',
        description: hasSuggestions
          ? 'Server exposes field suggestions in error messages, aiding schema discovery.'
          : 'Server does not expose field suggestions in error messages.',
        remediation:
          'Disable field suggestions in production to prevent schema enumeration via error messages.',
        details: {
          suggestionsExposed: hasSuggestions,
          errorMessages: errorMessages.substring(0, 500),
        },
      };
    } catch (error) {
      return {
        check: 'field-suggestion',
        severity: 'low',
        passed: true,
        title: 'Field Suggestions Exposed',
        description: 'Could not test field suggestions (endpoint unreachable or request failed).',
        remediation:
          'Disable field suggestions in production to prevent schema enumeration via error messages.',
        details: { error: String(error) },
      };
    }
  },
};
