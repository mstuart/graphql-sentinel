import type { SecurityCheck, ScanResult } from '../../types/index.js';

const CHECK_NAME = 'depth-limit';
const REMEDIATION = 'Enforce query depth limits to prevent deeply nested query attacks.';
const TITLE = 'No Query Depth Limit';

export const depthLimitCheck: SecurityCheck = {
  name: CHECK_NAME,
  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    // Build a deeply nested query using __type introspection which naturally allows nesting
    const depth = 20;
    let current = '__typename';
    for (let index = depth; index >= 0; index -= 1) {
      current = `d${index}: __type(name: "Query") { ${current} }`;
    }
    const query = `{ ${current} }`;

    // The scanner must report both depth behavior and endpoint failures.
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
      const hasErrors = body?.errors?.length > 0;
      const depthError = body?.errors?.some(
        (error: { message: string }) =>
          error.message.toLowerCase().includes('depth') ||
          error.message.toLowerCase().includes('too complex') ||
          error.message.toLowerCase().includes('max') ||
          error.message.toLowerCase().includes('limit'),
      );

      // If there are depth-related errors, the server has protection
      if (depthError) {
        return {
          check: CHECK_NAME,
          description: 'Server properly enforces query depth limits.',
          details: { blocked: true, depthTested: depth },
          passed: true,
          remediation: REMEDIATION,
          severity: 'high',
          title: TITLE,
        };
      }

      // If no errors at all, server accepted deep query
      const isNoDepthLimit = !hasErrors || !depthError;

      return {
        check: CHECK_NAME,
        description: isNoDepthLimit
          ? 'Server does not enforce query depth limits, enabling denial-of-service via deeply nested queries.'
          : 'Server properly enforces query depth limits.',
        details: { blocked: !isNoDepthLimit, depthTested: depth },
        passed: !isNoDepthLimit,
        remediation: REMEDIATION,
        severity: 'high',
        title: TITLE,
      };
    } catch (error) {
      return {
        check: CHECK_NAME,
        description: 'Could not test query depth (endpoint unreachable or request failed).',
        details: { error: String(error) },
        passed: true,
        remediation: REMEDIATION,
        severity: 'high',
        title: TITLE,
      };
    }
  },

  severity: 'high',
};
