import type { SecurityCheck, ScanResult } from '../../types/index.js';

const INTROSPECTION_QUERY = `{
  __schema {
    queryType { name }
    types {
      name
      kind
      fields {
        name
        type { name kind ofType { name kind } }
      }
    }
  }
}`;

function findFirstQueryField(schemaData: Record<string, unknown>): string | null {
   
  const types = (schemaData as any)?.__schema?.types;
  if (!Array.isArray(types)) return null;

   
  const queryTypeName = (schemaData as any)?.__schema?.queryType?.name || 'Query';
   
  const queryType = types.find((t: any) => t.name === queryTypeName);
  if (!queryType?.fields || !Array.isArray(queryType.fields)) return null;

  // Find a field that returns a scalar or simple type (not introspection)
   
  for (const field of queryType.fields as any[]) {
    if (field.name.startsWith('__')) continue;
    return field.name;
  }

  return null;
}

async function sendQuery(
  endpoint: string,
  query: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
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
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function isAuthError(body: Record<string, unknown> | null, status: number): boolean {
  if (status === 401 || status === 403) return true;
  if (!body) return false;

   
  const errors = (body as any)?.errors;
  if (!Array.isArray(errors)) return false;

  return errors.some((e: { message: string; extensions?: { code?: string } }) => {
    const msg = (e.message || '').toLowerCase();
    const code = (e.extensions?.code || '').toLowerCase();
    return (
      msg.includes('unauthorized') ||
      msg.includes('unauthenticated') ||
      msg.includes('not authenticated') ||
      msg.includes('authentication required') ||
      msg.includes('access denied') ||
      msg.includes('forbidden') ||
      msg.includes('must be logged in') ||
      msg.includes('not allowed') ||
      code.includes('unauthenticated') ||
      code.includes('unauthorized') ||
      code.includes('forbidden')
    );
  });
}

function hasData(body: Record<string, unknown> | null): boolean {
  if (!body) return false;
   
  const data = (body as any)?.data;
  if (data === null || data === undefined) return false;
  // Check if data has any non-null values
  if (typeof data === 'object') {
    return Object.values(data).some((v) => v !== null);
  }
  return true;
}

export const authBypassCheck: SecurityCheck = {
  name: 'auth-bypass',
  severity: 'high',

  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    try {
      // Step 1: Try introspection to find query fields
      const introResult = await sendQuery(endpoint, INTROSPECTION_QUERY, headers);
      let testField: string | null = null;
      if (introResult.body && hasData(introResult.body)) {
         
        testField = findFirstQueryField((introResult.body as any).data);
      }

      // Use a discovered field or fall back to __typename
      const testQuery = testField ? `{ ${testField} }` : '{ __typename }';

      // Step 2: Send request WITHOUT any auth headers
      const noAuthResult = await sendQuery(endpoint, testQuery);
      const noAuthBlocked = isAuthError(noAuthResult.body, noAuthResult.status);
      const noAuthHasData = hasData(noAuthResult.body);

      // Step 3: Send request with empty Authorization header
      const emptyAuthResult = await sendQuery(endpoint, testQuery, {
        Authorization: '',
      });
      const emptyAuthBlocked = isAuthError(emptyAuthResult.body, emptyAuthResult.status);
      const emptyAuthHasData = hasData(emptyAuthResult.body);

      // Step 4: Send request with invalid Bearer token
      const invalidTokenResult = await sendQuery(endpoint, testQuery, {
        Authorization: 'Bearer invalid_token_sentinel_test',
      });
      const invalidTokenBlocked = isAuthError(invalidTokenResult.body, invalidTokenResult.status);
      const invalidTokenHasData = hasData(invalidTokenResult.body);

      // Step 5: If auth headers were provided, compare with authenticated response
      if (headers && (headers['Authorization'] || headers['authorization'])) {
        await sendQuery(endpoint, testQuery, headers);
      }

      // Analysis
      const allBlocked = noAuthBlocked && emptyAuthBlocked && invalidTokenBlocked;
      const anyDataLeaked = noAuthHasData || emptyAuthHasData || invalidTokenHasData;

      // If no auth headers provided and data returned, it could be a public API
      const isPublicApi = !headers && noAuthHasData && !noAuthBlocked;

      if (isPublicApi && !headers) {
        return {
          check: 'auth-bypass',
          severity: 'info',
          passed: true,
          title: 'Authorization Bypass Detection',
          description:
            'API appears to be publicly accessible without authentication. Verify this is intentional.',
          remediation:
            'If this API should require authentication, implement proper auth middleware.',
          details: {
            publicApi: true,
            noAuthBlocked,
            emptyAuthBlocked,
            invalidTokenBlocked,
            testQuery,
          },
        };
      }

      if (allBlocked) {
        return {
          check: 'auth-bypass',
          severity: 'high',
          passed: true,
          title: 'Authorization Bypass Detection',
          description:
            'All unauthorized requests were properly rejected. Authorization checks appear to be in place.',
          remediation:
            'Continue enforcing authorization checks on all fields and mutations.',
          details: {
            noAuthBlocked,
            emptyAuthBlocked,
            invalidTokenBlocked,
            testQuery,
          },
        };
      }

      if (anyDataLeaked) {
        const bypasses: string[] = [];
        if (noAuthHasData) bypasses.push('no-auth-header');
        if (emptyAuthHasData) bypasses.push('empty-auth-header');
        if (invalidTokenHasData) bypasses.push('invalid-bearer-token');

        return {
          check: 'auth-bypass',
          severity: 'high',
          passed: false,
          title: 'Authorization Bypass Detection',
          description: `Data was returned without valid authorization via: ${bypasses.join(', ')}. The API may have missing or improperly configured authorization.`,
          remediation:
            'Ensure all queries require proper authentication. Validate authorization tokens on every request and verify field-level authorization is enforced.',
          details: {
            noAuthBlocked,
            noAuthHasData,
            emptyAuthBlocked,
            emptyAuthHasData,
            invalidTokenBlocked,
            invalidTokenHasData,
            bypasses,
            testQuery,
          },
        };
      }

      return {
        check: 'auth-bypass',
        severity: 'high',
        passed: true,
        title: 'Authorization Bypass Detection',
        description:
          'Unauthorized requests did not return data. Authorization appears to be configured.',
        remediation:
          'Continue enforcing authorization checks on all fields and mutations.',
        details: {
          noAuthBlocked,
          emptyAuthBlocked,
          invalidTokenBlocked,
          testQuery,
        },
      };
    } catch (error) {
      return {
        check: 'auth-bypass',
        severity: 'high',
        passed: true,
        title: 'Authorization Bypass Detection',
        description:
          'Could not perform authorization bypass check (endpoint unreachable or request failed).',
        remediation:
          'Ensure all queries require proper authentication and retry the scan.',
        details: { error: String(error) },
      };
    }
  },
};
