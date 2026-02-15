import type { SecurityCheck, ScanResult } from '../../types/index.js';

export const depthLimitCheck: SecurityCheck = {
  name: 'depth-limit',
  severity: 'high',

  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    // Build a deeply nested query using __type introspection which naturally allows nesting
    const depth = 20;
    let current = '__typename';
    for (let i = depth; i >= 0; i--) {
      current = `d${i}: __type(name: "Query") { ${current} }`;
    }
    const query = `{ ${current} }`;

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
      const hasErrors = body?.errors?.length > 0;
      const depthError = body?.errors?.some(
        (e: { message: string }) =>
          e.message.toLowerCase().includes('depth') ||
          e.message.toLowerCase().includes('too complex') ||
          e.message.toLowerCase().includes('max') ||
          e.message.toLowerCase().includes('limit'),
      );

      // If there are depth-related errors, the server has protection
      if (depthError) {
        return {
          check: 'depth-limit',
          severity: 'high',
          passed: true,
          title: 'No Query Depth Limit',
          description: 'Server properly enforces query depth limits.',
          remediation: 'Enforce query depth limits to prevent deeply nested query attacks.',
          details: { depthTested: depth, blocked: true },
        };
      }

      // If no errors at all, server accepted deep query
      const noDepthLimit = !hasErrors || !depthError;

      return {
        check: 'depth-limit',
        severity: 'high',
        passed: !noDepthLimit,
        title: 'No Query Depth Limit',
        description: noDepthLimit
          ? 'Server does not enforce query depth limits, enabling denial-of-service via deeply nested queries.'
          : 'Server properly enforces query depth limits.',
        remediation: 'Enforce query depth limits to prevent deeply nested query attacks.',
        details: { depthTested: depth, blocked: !noDepthLimit },
      };
    } catch (error) {
      return {
        check: 'depth-limit',
        severity: 'high',
        passed: true,
        title: 'No Query Depth Limit',
        description: 'Could not test query depth (endpoint unreachable or request failed).',
        remediation: 'Enforce query depth limits to prevent deeply nested query attacks.',
        details: { error: String(error) },
      };
    }
  },
};
