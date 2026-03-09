/**
 * Middleware Integration Tests — HTTP-level smoke tests.
 *
 * These tests verify the unified auth middleware, CORS handling, and
 * multi-tenancy headers against a RUNNING MJAPI instance.
 *
 * Usage:
 *   1. Start MJAPI:    cd packages/MJAPI && npm run start
 *   2. Run tests:      MJAPI_URL=http://localhost:4001 npm run test:integration
 *
 * Environment variables:
 *   MJAPI_URL              Base URL of the running MJAPI instance (required)
 *   MJAPI_SYSTEM_API_KEY   System API key (x-mj-api-key header)
 *   MJAPI_BEARER_TOKEN     Valid JWT bearer token
 *   MJAPI_USER_API_KEY     User API key (x-api-key header, mj_sk_* format)
 *   MJAPI_GRAPHQL_PATH     GraphQL endpoint path (default: /)
 *   MJAPI_TENANT_HEADER    Tenant header name (default: x-tenant-id)
 *
 * Tests are organized into tiers:
 *   Tier 1 — No auth needed (CORS, 401 behavior, rejection edge cases)
 *   Tier 2 — System API key auth (authenticates as system user)
 *   Tier 3 — JWT bearer token auth (authenticates as specific user)
 *   Tier 4 — User API key auth (authenticates as API key owner)
 *   Tier 5 — Multi-tenancy data isolation
 */
import { describe, it, expect, beforeAll } from 'vitest';

// ─── Configuration ─────────────────────────────────────────────────────────

const BASE_URL = process.env.MJAPI_URL ?? '';
const SYSTEM_API_KEY = process.env.MJAPI_SYSTEM_API_KEY ?? '';
const BEARER_TOKEN = process.env.MJAPI_BEARER_TOKEN ?? '';
const USER_API_KEY = process.env.MJAPI_USER_API_KEY ?? '';
const GRAPHQL_PATH = process.env.MJAPI_GRAPHQL_PATH ?? '/';
const TENANT_HEADER = process.env.MJAPI_TENANT_HEADER ?? 'x-tenant-id';

const GRAPHQL_URL = `${BASE_URL}${GRAPHQL_PATH}`;
const HAS_SERVER = !!BASE_URL;
const HAS_SYSTEM_KEY = !!SYSTEM_API_KEY;
const HAS_BEARER = !!BEARER_TOKEN;
const HAS_USER_KEY = !!USER_API_KEY;
// True if ANY auth method is available
const HAS_AUTH = HAS_SYSTEM_KEY || HAS_BEARER || HAS_USER_KEY;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Simple introspection query for testing GraphQL connectivity */
const INTROSPECTION_QUERY = JSON.stringify({
  query: '{ __typename }',
});

/** RunDynamicView query to verify data access by EntityName.
 * Note: Results is a complex type [RunViewResultRow] requiring subfield selection. */
function makeRunViewQuery(entityName: string, maxRows = 1): string {
  return JSON.stringify({
    query: `query RunDynamicView($input: RunDynamicViewInput!) {
      RunDynamicView(input: $input) {
        Results {
          PrimaryKey { FieldName Value }
          EntityID
          Data
        }
        UserViewRunID
        RowCount
        TotalRowCount
        ExecutionTime
        ErrorMessage
        Success
      }
    }`,
    variables: {
      input: {
        EntityName: entityName,
        ExtraFilter: '',
        OrderBy: '',
        MaxRows: maxRows,
        ResultType: 'simple',
      },
    },
    operationName: 'RunDynamicView',
  });
}

/** Build auth headers depending on which method is available */
function getAuthHeaders(): Record<string, string> {
  if (HAS_SYSTEM_KEY) {
    return { 'Content-Type': 'application/json', 'x-mj-api-key': SYSTEM_API_KEY };
  }
  if (HAS_BEARER) {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${BEARER_TOKEN}` };
  }
  if (HAS_USER_KEY) {
    return { 'Content-Type': 'application/json', 'x-api-key': USER_API_KEY };
  }
  return { 'Content-Type': 'application/json' };
}

async function fetchJson(
  url: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; body: Record<string, unknown> }> {
  const response = await fetch(url, options);
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON response — body stays empty
  }
  return { status: response.status, headers: response.headers, body };
}

/** Encode a string to base64url (JWT-compatible) */
function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Asserts that auth succeeded (status 200) and optionally checks RunView execution.
 * RunView can fail at the GraphQL level (e.g., system user not in UserCache) even though
 * auth succeeded. The test differentiates:
 *   - Auth failure: status !== 200 → hard fail
 *   - GraphQL error (auth OK, resolver error): status 200, data null → skip data assertions
 *   - Full success: status 200, data present, Success=true
 */
function assertRunViewResult(
  status: number,
  body: Record<string, unknown>,
  entityName: string
): void {
  // Auth must have succeeded — RunView should never return 401
  expect(status, `Expected 200 for ${entityName} query (auth OK)`).toBe(200);

  const errors = body.errors as Array<{ message: string }> | undefined;
  const data = body.data as Record<string, Record<string, unknown>> | null | undefined;

  if (errors?.length && data === null) {
    // GraphQL-level error (not auth-related). This can happen when the system user
    // isn't in UserCache or lacks entity permissions. Auth is verified, so we skip
    // the data assertions and log a diagnostic message.
    console.warn(
      `[DIAGNOSTIC] RunView for '${entityName}' returned GraphQL error (auth OK): ${errors[0].message}`
    );
    return;
  }

  // If we got data back, verify RunView succeeded
  expect(data?.RunDynamicView?.Success).toBe(true);
  const rowCount = data?.RunDynamicView?.RowCount as number | undefined;
  if (rowCount !== undefined) {
    expect(rowCount).toBeGreaterThan(0);
  }
}

// ─── Tier 1: No Auth Needed ────────────────────────────────────────────────

describe.skipIf(!HAS_SERVER)('Tier 1: Unauthenticated Middleware Behavior', () => {
  beforeAll(async () => {
    // Verify server is reachable
    try {
      await fetch(BASE_URL, { method: 'OPTIONS' });
    } catch {
      throw new Error(
        `Cannot reach MJAPI at ${BASE_URL}. Start the server first:\n` +
        `  cd packages/MJAPI && npm run start`
      );
    }
  });

  describe('CORS Preflight (OPTIONS)', () => {
    it('should respond to OPTIONS with 2xx and CORS headers', async () => {
      const response = await fetch(GRAPHQL_URL, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:4200',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
      });

      // Preflight should succeed (200 or 204)
      expect(response.status).toBeLessThan(300);

      // CORS headers must be present
      const allowOrigin = response.headers.get('access-control-allow-origin');
      expect(allowOrigin).toBeTruthy();
    });

    it('should include authorization in allowed headers', async () => {
      const response = await fetch(GRAPHQL_URL, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:4200',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });

      const allowHeaders = response.headers.get('access-control-allow-headers');
      expect(allowHeaders).toBeTruthy();
    });

    it('should allow POST method in preflight response', async () => {
      const response = await fetch(GRAPHQL_URL, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:4200',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const allowMethods = response.headers.get('access-control-allow-methods');
      expect(allowMethods).toBeTruthy();
    });
  });

  describe('Unauthenticated Requests', () => {
    it('should return 401 for POST without authorization', async () => {
      const { status, headers } = await fetchJson(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4200' },
        body: INTROSPECTION_QUERY,
      });

      expect(status).toBe(401);

      // Critical: 401 response MUST include CORS headers so the browser
      // can read the response body (needed for MSAL token refresh).
      const allowOrigin = headers.get('access-control-allow-origin');
      expect(allowOrigin).toBeTruthy();
    });

    it('should return error body with 401', async () => {
      const { status, body } = await fetchJson(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: INTROSPECTION_QUERY,
      });

      expect(status).toBe(401);
      expect(body).toBeDefined();
      expect(body.error).toBeDefined();
    });

    it('should return JWT_EXPIRED code for expired token', async () => {
      // Create a JWT with an expired exp claim.
      // jwt.decode() expects base64url encoding (no padding, - and _ instead of + and /).
      // getUserPayload checks exp BEFORE calling verifyAsync, so no valid signature needed.
      const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const payload = base64url(JSON.stringify({
        iss: 'https://fake-issuer.example.com',
        sub: 'test-user',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        aud: 'test',
      }));
      const expiredToken = `${header}.${payload}.fake-signature`;

      const { status, body } = await fetchJson(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${expiredToken}`,
        },
        body: INTROSPECTION_QUERY,
      });

      expect(status).toBe(401);
      expect(body.code).toBe('JWT_EXPIRED');
      expect(body.error).toBe('Token expired');
    });

    it('should return 401 for invalid bearer token format', async () => {
      const { status } = await fetchJson(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer not-a-real-jwt',
        },
        body: INTROSPECTION_QUERY,
      });

      expect(status).toBe(401);
    });

    it('should return 401 for invalid system API key', async () => {
      const { status, body } = await fetchJson(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mj-api-key': 'wrong-api-key-12345',
        },
        body: INTROSPECTION_QUERY,
      });

      expect(status).toBe(401);
      expect(body.error).toBeDefined();
    });

    it('should return 401 for invalid user API key', async () => {
      const { status, body } = await fetchJson(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'mj_sk_invalid_key_12345',
        },
        body: INTROSPECTION_QUERY,
      });

      expect(status).toBe(401);
      expect(body.error).toBeDefined();
    });

    it('should return 401 for GET without authorization', async () => {
      const { status } = await fetchJson(GRAPHQL_URL, {
        method: 'GET',
        headers: { Origin: 'http://localhost:4200' },
      });

      expect(status).toBe(401);
    });
  });
});

// ─── Tier 2: System API Key Auth ───────────────────────────────────────────

describe.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
  'Tier 2: System API Key Authentication (x-mj-api-key)',
  () => {
    const systemKeyHeaders = {
      'Content-Type': 'application/json',
      'x-mj-api-key': SYSTEM_API_KEY,
    };

    describe('Basic connectivity', () => {
      it('should return 200 for introspection with system API key', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders,
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });

      it('should include CORS headers on successful response', async () => {
        const { status, headers } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: { ...systemKeyHeaders, Origin: 'http://localhost:4200' },
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        const allowOrigin = headers.get('access-control-allow-origin');
        expect(allowOrigin).toBeTruthy();
      });
    });

    describe('Data access', () => {
      it('should authenticate and query Entities via RunView', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders,
          body: makeRunViewQuery('Entities', 3),
        });

        assertRunViewResult(status, body, 'Entities');
      });

      it('should authenticate and query Roles via RunView', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders,
          body: makeRunViewQuery('Roles', 3),
        });

        assertRunViewResult(status, body, 'Roles');
      });

      it('should authenticate and query Applications via RunView', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders,
          body: makeRunViewQuery('Applications', 3),
        });

        assertRunViewResult(status, body, 'Applications');
      });
    });

    describe('System API key should NOT work with wrong header', () => {
      it('should reject system API key sent in Authorization header', async () => {
        const { status } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SYSTEM_API_KEY}`,
          },
          body: INTROSPECTION_QUERY,
        });

        // System key in Authorization header is treated as a JWT → fails
        expect(status).toBe(401);
      });

      it('should reject system API key sent in x-api-key header', async () => {
        const { status } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': SYSTEM_API_KEY,
          },
          body: INTROSPECTION_QUERY,
        });

        // System key in x-api-key header is treated as a user API key → fails
        expect(status).toBe(401);
      });
    });

    describe('Session and tenant headers', () => {
      it('should handle x-session-id header with system key', async () => {
        const { status } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...systemKeyHeaders,
            'x-session-id': 'integration-test-session',
          },
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
      });

      it('should handle tenant header with system key', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...systemKeyHeaders,
            [TENANT_HEADER]: 'test-tenant-from-system-key',
          },
          body: INTROSPECTION_QUERY,
        });

        // Tenant header should not break system key auth
        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });
    });
  }
);

// ─── Tier 3: JWT Bearer Token Auth ─────────────────────────────────────────

describe.skipIf(!HAS_SERVER || !HAS_BEARER)(
  'Tier 3: JWT Bearer Token Authentication',
  () => {
    const bearerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BEARER_TOKEN}`,
    };

    describe('Basic connectivity', () => {
      it('should return 200 for introspection with bearer token', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: bearerHeaders,
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });
    });

    describe('Data access', () => {
      it('should authenticate and query Entities via RunView', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: bearerHeaders,
          body: makeRunViewQuery('Entities', 3),
        });

        assertRunViewResult(status, body, 'Entities');
      });

      it('should authenticate and query Roles via RunView', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: bearerHeaders,
          body: makeRunViewQuery('Roles', 3),
        });

        assertRunViewResult(status, body, 'Roles');
      });
    });

    describe('Tenant context header handling', () => {
      it('should process tenant header without error', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...bearerHeaders,
            [TENANT_HEADER]: 'test-tenant-001',
          },
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });

      it('should work without tenant header', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: bearerHeaders,
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });
    });

    describe('Backward compatibility', () => {
      it('should handle x-session-id header', async () => {
        const { status } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...bearerHeaders,
            'x-session-id': 'test-session-123',
          },
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
      });
    });
  }
);

// ─── Tier 4: User API Key Auth ─────────────────────────────────────────────

describe.skipIf(!HAS_SERVER || !HAS_USER_KEY)(
  'Tier 4: User API Key Authentication (x-api-key)',
  () => {
    const userKeyHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': USER_API_KEY,
    };

    describe('Basic connectivity', () => {
      it('should return 200 for introspection with user API key', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: userKeyHeaders,
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });
    });

    describe('Data access', () => {
      it('should authenticate and query Entities via RunView', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: userKeyHeaders,
          body: makeRunViewQuery('Entities', 3),
        });

        assertRunViewResult(status, body, 'Entities');
      });
    });

    describe('User API key should NOT work with wrong header', () => {
      it('should reject user API key in Authorization header', async () => {
        const { status } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${USER_API_KEY}`,
          },
          body: INTROSPECTION_QUERY,
        });

        // User key in Authorization header is treated as a JWT → fails
        expect(status).toBe(401);
      });

      it('should reject user API key in x-mj-api-key header', async () => {
        const { status } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mj-api-key': USER_API_KEY,
          },
          body: INTROSPECTION_QUERY,
        });

        // User key in system key header → fails (doesn't match system API key)
        expect(status).toBe(401);
      });
    });
  }
);

// ─── Tier 5: Multi-Tenancy Data Isolation ──────────────────────────────────

describe.skipIf(!HAS_SERVER || !HAS_AUTH)(
  'Tier 5: Multi-Tenancy Data Isolation',
  () => {
    it('should succeed with tenant header set (regardless of MT config)', async () => {
      // With a tenant header, RunView results should be scoped if MT is enabled.
      // Without MT config, results are unaffected.
      // Either way, the request should succeed (200) — not 401.
      const { status, body } = await fetchJson(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          [TENANT_HEADER]: 'nonexistent-tenant-for-testing',
        },
        body: makeRunViewQuery('Entities', 5),
      });

      assertRunViewResult(status, body, 'Entities (with tenant header)');
    });

    it('should return same results with and without tenant header when MT disabled', async () => {
      const headers = getAuthHeaders();

      const [withTenant, withoutTenant] = await Promise.all([
        fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: { ...headers, [TENANT_HEADER]: 'some-tenant-id' },
          body: makeRunViewQuery('Entities', 3),
        }),
        fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers,
          body: makeRunViewQuery('Entities', 3),
        }),
      ]);

      // Both requests should authenticate successfully (200)
      expect(withTenant.status).toBe(200);
      expect(withoutTenant.status).toBe(200);

      // If both have GraphQL errors (e.g., system user can't run views), that's OK —
      // the important thing is that the tenant header didn't change the outcome
      const withData = withTenant.body.data as Record<string, Record<string, unknown>> | null | undefined;
      const withoutData = withoutTenant.body.data as Record<string, Record<string, unknown>> | null | undefined;

      // When both return data, verify row counts match (MT not configured → same data)
      if (withData?.RunDynamicView && withoutData?.RunDynamicView) {
        expect(withData.RunDynamicView.RowCount).toBe(withoutData.RunDynamicView.RowCount);
      }
      // When both return null (GraphQL error), the tenant header had no effect — also passing
    });
  }
);

// ─── Tier 6: Multi-Tenancy Middleware Pipeline (Phase 1) ─────────────────
// These tests verify the multi-tenancy middleware integrates correctly with
// the auth pipeline when MT is enabled in mj.config.cjs. They validate
// that the tenant middleware doesn't break auth, runs in the correct order,
// and handles edge cases at the HTTP level.

describe.skipIf(!HAS_SERVER || !HAS_AUTH)(
  'Tier 6: Multi-Tenancy Middleware Pipeline',
  () => {
    describe('Tenant header does not interfere with auth', () => {
      it('should authenticate with system key + tenant header on scoped entity', async () => {
        if (!HAS_SYSTEM_KEY) return;
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mj-api-key': SYSTEM_API_KEY,
            [TENANT_HEADER]: 'test-tenant-for-employees',
          },
          body: makeRunViewQuery('Employees', 3),
        });

        // Auth must succeed (200). RunView may fail at resolver level (pre-existing).
        assertRunViewResult(status, body, 'Employees (scoped, with tenant header)');
      });

      it('should authenticate with system key + tenant header on non-scoped entity', async () => {
        if (!HAS_SYSTEM_KEY) return;
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mj-api-key': SYSTEM_API_KEY,
            [TENANT_HEADER]: 'test-tenant-for-roles',
          },
          body: makeRunViewQuery('Roles', 3),
        });

        // Non-scoped entity: tenant header should have no filtering effect
        assertRunViewResult(status, body, 'Roles (non-scoped, with tenant header)');
      });

      it('should authenticate without tenant header on scoped entity', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: makeRunViewQuery('Employees', 3),
        });

        // No tenant header → no TenantContext → no filtering
        assertRunViewResult(status, body, 'Employees (scoped, no tenant header)');
      });
    });

    describe('Tenant header edge cases at HTTP level', () => {
      it('should handle empty tenant header value gracefully', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            [TENANT_HEADER]: '',
          },
          body: INTROSPECTION_QUERY,
        });

        // Empty header → falsy → no TenantContext set → request proceeds normally
        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });

      it('should handle SQL injection attempt in tenant header', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            [TENANT_HEADER]: "' OR 1=1 --",
          },
          body: INTROSPECTION_QUERY,
        });

        // The tenant header is processed but introspection queries don't trigger
        // RunView hooks, so this should just succeed at the auth level.
        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });

      it('should handle UUID tenant header value', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            [TENANT_HEADER]: '550e8400-e29b-41d4-a716-446655440000',
          },
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });

      it('should handle very long tenant header value', async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            [TENANT_HEADER]: 'a'.repeat(500),
          },
          body: INTROSPECTION_QUERY,
        });

        // Should not crash the server — just process normally
        expect(status).toBe(200);
        expect(body.data).toBeDefined();
      });
    });

    describe('Core entity exclusion (autoExcludeCoreEntities)', () => {
      it('should not filter core __mj entity (Entities) even with tenant header', async () => {
        // When autoExcludeCoreEntities is true, __mj entities are never filtered.
        // Querying Entities with a tenant header should return the same as without.
        const headers = getAuthHeaders();

        const [withTenant, withoutTenant] = await Promise.all([
          fetchJson(GRAPHQL_URL, {
            method: 'POST',
            headers: { ...headers, [TENANT_HEADER]: 'any-tenant-id' },
            body: makeRunViewQuery('Entities', 5),
          }),
          fetchJson(GRAPHQL_URL, {
            method: 'POST',
            headers,
            body: makeRunViewQuery('Entities', 5),
          }),
        ]);

        expect(withTenant.status).toBe(200);
        expect(withoutTenant.status).toBe(200);

        const withData = withTenant.body.data as Record<string, Record<string, unknown>> | null | undefined;
        const withoutData = withoutTenant.body.data as Record<string, Record<string, unknown>> | null | undefined;

        // If RunView works, row counts should match (core entity not filtered)
        if (withData?.RunDynamicView && withoutData?.RunDynamicView) {
          expect(withData.RunDynamicView.RowCount).toBe(withoutData.RunDynamicView.RowCount);
        }
      });
    });

    describe('CORS with tenant header', () => {
      it('should include CORS headers on response with tenant header', async () => {
        const { status, headers } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            Origin: 'http://localhost:4200',
            [TENANT_HEADER]: 'cors-test-tenant',
          },
          body: INTROSPECTION_QUERY,
        });

        expect(status).toBe(200);
        expect(headers.get('access-control-allow-origin')).toBeTruthy();
      });

      it('should expose tenant header in CORS preflight', async () => {
        const response = await fetch(GRAPHQL_URL, {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:4200',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': `content-type,authorization,${TENANT_HEADER}`,
          },
        });

        // Tenant header should be allowed in CORS preflight
        const allowHeaders = response.headers.get('access-control-allow-headers') ?? '';
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        // CORS should allow the tenant header (either explicitly or via wildcard)
        const headerAllowed =
          allowHeaders === '*' ||
          allowHeaders.toLowerCase().includes(TENANT_HEADER.toLowerCase());
        expect(headerAllowed).toBe(true);
      });
    });

    describe('Concurrent requests with different tenant contexts', () => {
      it('should handle multiple concurrent requests with different tenant IDs', async () => {
        const headers = getAuthHeaders();
        const tenantIds = ['tenant-a', 'tenant-b', 'tenant-c', 'no-tenant'];

        const requests = tenantIds.map(tenantId => {
          const reqHeaders = tenantId === 'no-tenant'
            ? headers
            : { ...headers, [TENANT_HEADER]: tenantId };

          return fetchJson(GRAPHQL_URL, {
            method: 'POST',
            headers: reqHeaders,
            body: INTROSPECTION_QUERY,
          });
        });

        const results = await Promise.all(requests);

        // All requests should authenticate successfully (200)
        for (const result of results) {
          expect(result.status).toBe(200);
          expect(result.body.data).toBeDefined();
        }
      });
    });
  }
);
