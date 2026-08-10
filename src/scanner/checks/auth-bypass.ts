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
const CHECK_NAME = 'auth-bypass';
const TITLE = 'Authorization Bypass Detection';

const findFirstQueryField = (schemaData: Record<string, unknown>): string | null => {
  const types = (schemaData as any)?.__schema?.types;
  if (!Array.isArray(types)) {
    return null;
  }

  const queryTypeName = (schemaData as any)?.__schema?.queryType?.name || 'Query';

  const queryType = types.find((t: any) => t.name === queryTypeName);
  if (!queryType?.fields || !Array.isArray(queryType.fields)) {
    return null;
  }

  // Find a field that returns a scalar or simple type (not introspection)

  for (const field of queryType.fields as any[]) {
    if (field.name.startsWith('__')) {
      continue;
    }
    return field.name;
  }

  return null;
};

const sendQuery = async (
  endpoint: string,
  query: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> | null }> => {
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
    return { body, status: response.status };
  } catch {
    return { body: null, status: 0 };
  }
};

const isAuthError = (body: Record<string, unknown> | null, status: number): boolean => {
  if (status === 401 || status === 403) {
    return true;
  }
  if (!body) {
    return false;
  }

  const errors = (body as any)?.errors;
  if (!Array.isArray(errors)) {
    return false;
  }

  return errors.some((error: { message: string; extensions?: { code?: string } }) => {
    const message = (error.message || '').toLowerCase();
    const code = (error.extensions?.code || '').toLowerCase();
    const messageIndicators = [
      'unauthorized',
      'unauthenticated',
      'not authenticated',
      'authentication required',
      'access denied',
      'forbidden',
      'must be logged in',
      'not allowed',
    ];
    const codeIndicators = ['unauthenticated', 'unauthorized', 'forbidden'];
    return (
      messageIndicators.some((indicator) => message.includes(indicator)) ||
      codeIndicators.some((indicator) => code.includes(indicator))
    );
  });
};

const hasData = (body: Record<string, unknown> | null): boolean => {
  if (!body) {
    return false;
  }

  const data = (body as any)?.data;
  if (data === null || data === undefined) {
    return false;
  }
  // Check if data has any non-null values
  if (typeof data === 'object') {
    return Object.values(data).some((v) => v !== null);
  }
  return true;
};

export const authBypassCheck: SecurityCheck = {
  name: CHECK_NAME,
  async run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult> {
    // The check compares several authentication outcomes within one recoverable scan.
    // eslint-disable-next-line unicorn/try-complexity
    try {
      // Step 1: Try introspection to find query fields
      const introResult = await sendQuery(endpoint, INTROSPECTION_QUERY, headers);
      const testField =
        introResult.body && hasData(introResult.body)
          ? findFirstQueryField((introResult.body as any).data)
          : null;

      // Use a discovered field or fall back to __typename
      const testQuery = testField ? `{ ${testField} }` : '{ __typename }';

      // Step 2: Send request WITHOUT any auth headers
      const noAuthResult = await sendQuery(endpoint, testQuery);
      const isNoAuthBlocked = isAuthError(noAuthResult.body, noAuthResult.status);
      const isNoAuthHasData = hasData(noAuthResult.body);

      // Step 3: Send request with empty Authorization header
      const emptyAuthResult = await sendQuery(endpoint, testQuery, {
        Authorization: '',
      });
      const isEmptyAuthBlocked = isAuthError(emptyAuthResult.body, emptyAuthResult.status);
      const isEmptyAuthHasData = hasData(emptyAuthResult.body);

      // Step 4: Send request with invalid Bearer token
      const invalidTokenResult = await sendQuery(endpoint, testQuery, {
        Authorization: 'Bearer invalid_token_sentinel_test',
      });
      const isInvalidTokenBlocked = isAuthError(invalidTokenResult.body, invalidTokenResult.status);
      const isInvalidTokenHasData = hasData(invalidTokenResult.body);

      // Step 5: If auth headers were provided, compare with authenticated response
      if (headers && (headers['Authorization'] || headers['authorization'])) {
        await sendQuery(endpoint, testQuery, headers);
      }

      // Analysis
      const isAllBlocked = isNoAuthBlocked && isEmptyAuthBlocked && isInvalidTokenBlocked;
      const isAnyDataLeaked = isNoAuthHasData || isEmptyAuthHasData || isInvalidTokenHasData;

      // If no auth headers provided and data returned, it could be a public API
      const isPublicApi = !headers && isNoAuthHasData && !isNoAuthBlocked;

      if (isPublicApi) {
        return {
          check: CHECK_NAME,
          description:
            'API appears to be publicly accessible without authentication. Verify this is intentional.',
          details: {
            emptyAuthBlocked: isEmptyAuthBlocked,
            invalidTokenBlocked: isInvalidTokenBlocked,
            noAuthBlocked: isNoAuthBlocked,
            publicApi: true,
            testQuery,
          },
          passed: true,
          remediation:
            'If this API should require authentication, implement proper auth middleware.',
          severity: 'info',
          title: TITLE,
        };
      }

      if (isAllBlocked) {
        return {
          check: CHECK_NAME,
          description:
            'All unauthorized requests were properly rejected. Authorization checks appear to be in place.',
          details: {
            emptyAuthBlocked: isEmptyAuthBlocked,
            invalidTokenBlocked: isInvalidTokenBlocked,
            noAuthBlocked: isNoAuthBlocked,
            testQuery,
          },
          passed: true,
          remediation: 'Continue enforcing authorization checks on all fields and mutations.',
          severity: 'high',
          title: TITLE,
        };
      }

      if (isAnyDataLeaked) {
        const bypasses: string[] = [];
        if (isNoAuthHasData) {
          bypasses.push('no-auth-header');
        }
        if (isEmptyAuthHasData) {
          bypasses.push('empty-auth-header');
        }
        if (isInvalidTokenHasData) {
          bypasses.push('invalid-bearer-token');
        }

        return {
          check: CHECK_NAME,
          description: `Data was returned without valid authorization via: ${bypasses.join(', ')}. The API may have missing or improperly configured authorization.`,
          details: {
            bypasses,
            emptyAuthBlocked: isEmptyAuthBlocked,
            emptyAuthHasData: isEmptyAuthHasData,
            invalidTokenBlocked: isInvalidTokenBlocked,
            invalidTokenHasData: isInvalidTokenHasData,
            noAuthBlocked: isNoAuthBlocked,
            noAuthHasData: isNoAuthHasData,
            testQuery,
          },
          passed: false,
          remediation:
            'Ensure all queries require proper authentication. Validate authorization tokens on every request and verify field-level authorization is enforced.',
          severity: 'high',
          title: TITLE,
        };
      }

      return {
        check: CHECK_NAME,
        description:
          'Unauthorized requests did not return data. Authorization appears to be configured.',
        details: {
          emptyAuthBlocked: isEmptyAuthBlocked,
          invalidTokenBlocked: isInvalidTokenBlocked,
          noAuthBlocked: isNoAuthBlocked,
          testQuery,
        },
        passed: true,
        remediation: 'Continue enforcing authorization checks on all fields and mutations.',
        severity: 'high',
        title: TITLE,
      };
    } catch (error) {
      return {
        check: CHECK_NAME,
        description:
          'Could not perform authorization bypass check (endpoint unreachable or request failed).',
        details: { error: String(error) },
        passed: true,
        remediation: 'Ensure all queries require proper authentication and retry the scan.',
        severity: 'high',
        title: TITLE,
      };
    }
  },

  severity: 'high',
};
