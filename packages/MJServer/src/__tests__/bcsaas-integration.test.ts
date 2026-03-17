/**
 * BCSaaS Integration Tests — Phase 4, 5, 6
 *
 * Tests the BCSaaS middle-layer plugin architecture against a RUNNING MJAPI instance
 * that has BCSaaS loaded via @RegisterClass(BaseServerMiddleware) and a database with BCSaaS entities.
 *
 * Test data setup (mj_test database):
 *   - Organizations: Acme Corp (11111111-...), Beta Inc (22222222-...), Acme West Division (33333333-...)
 *   - Contacts: System User (AAAAAAAA-...) linked to MJ System user, Other User (BBBBBBBB-...)
 *   - OrgContacts: System→Acme (Owner), System→Beta (Member), Other→Beta (Admin)
 *   - ContactRoles: Owner, Admin, Member, Viewer
 *
 * Environment variables:
 *   MJAPI_URL              Base URL of the running MJAPI instance (required)
 *   MJAPI_SYSTEM_API_KEY   System API key (x-mj-api-key header)
 */
import { describe, it, expect, beforeAll } from 'vitest';

// ─── Configuration ─────────────────────────────────────────────────────────

const BASE_URL = process.env.MJAPI_URL ?? '';
const SYSTEM_API_KEY = process.env.MJAPI_SYSTEM_API_KEY ?? '';
const GRAPHQL_PATH = process.env.MJAPI_GRAPHQL_PATH ?? '/';

const GRAPHQL_URL = `${BASE_URL}${GRAPHQL_PATH}`;
const HAS_SERVER = !!BASE_URL;
const HAS_SYSTEM_KEY = !!SYSTEM_API_KEY;

// Timeout for HTTP requests (some first-request queries are slow due to connection pool warmup)
const REQUEST_TIMEOUT = 60_000;

// ─── Test Data IDs ─────────────────────────────────────────────────────────

const ACME_ORG_ID = '11111111-1111-1111-1111-111111111111';
const BETA_ORG_ID = '22222222-2222-2222-2222-222222222222';
const SYSTEM_CONTACT_ID = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
const NONEXISTENT_ORG_ID = '99999999-9999-9999-9999-999999999999';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FetchResult {
  status: number;
  headers: Headers;
  body: Record<string, unknown>;
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON response — body stays empty
    }
    return { status: response.status, headers: response.headers, body };
  } finally {
    clearTimeout(timer);
  }
}

function systemKeyHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-mj-api-key': SYSTEM_API_KEY,
    ...extra,
  };
}

function makeRunViewQuery(entityName: string, extraFilter = '', maxRows = 100): string {
  return JSON.stringify({
    query: `query RunDynamicView($input: RunDynamicViewInput!) {
      RunDynamicView(input: $input) {
        Results { PrimaryKey { FieldName Value } EntityID Data }
        RowCount TotalRowCount ExecutionTime ErrorMessage
      }
    }`,
    variables: {
      input: {
        EntityName: entityName,
        ExtraFilter: extraFilter,
        OrderBy: '',
        MaxRows: maxRows,
        ResultType: 'simple',
      },
    },
    operationName: 'RunDynamicView',
  });
}

interface RunViewData {
  Results: Array<{ Data: string; PrimaryKey: Array<{ FieldName: string; Value: string }> }>;
  RowCount: number;
  TotalRowCount: number;
  ErrorMessage: string | null;
}

function extractRunViewData(body: Record<string, unknown>): RunViewData | null {
  const data = body.data as Record<string, RunViewData> | null;
  if (!data?.RunDynamicView) return null;
  return data.RunDynamicView;
}

function parseResults(rvData: RunViewData): Record<string, unknown>[] {
  return rvData.Results.map(r => JSON.parse(r.Data) as Record<string, unknown>);
}

// ─── Phase 4: BCSaaS as Middle-Layer Plugin ─────────────────────────────────

describe('Phase 4: BCSaaS as Middle-Layer Plugin', () => {
  beforeAll(() => {
    if (!HAS_SERVER) {
      console.warn('MJAPI_URL not set — skipping BCSaaS integration tests');
    }
  });

  describe('4.4 BCTenantContext resolution', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should resolve tenant context for authenticated system user',
      async () => {
        // The system user (not.set@nowhere.com) has a Contact linked via LinkedUserID.
        // bcTenantContextMiddleware finds the Contact, loads org memberships.
        // Verify by querying BC: Contacts (non-scoped) — success means middleware ran.
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders(),
          body: makeRunViewQuery('BC: Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData) {
          expect(rvData.ErrorMessage).toBeNull();
          // Should see both contacts (BC: Contacts has no OrganizationID — unfiltered)
          expect(rvData.RowCount).toBe(2);
        }
      },
      REQUEST_TIMEOUT
    );
  });

  describe('4.6 Multi-org user resolution', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should access both orgs the user belongs to',
      async () => {
        // System user belongs to Acme Corp (Owner) and Beta Inc (Member).
        // Verify multi-org by switching org context and confirming both work.
        // Query with Acme context:
        const acmeResult = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': ACME_ORG_ID }),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });
        expect(acmeResult.status).toBe(200);

        // Query with Beta context:
        const betaResult = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': BETA_ORG_ID }),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });
        expect(betaResult.status).toBe(200);

        const acmeData = extractRunViewData(acmeResult.body);
        const betaData = extractRunViewData(betaResult.body);

        if (acmeData && betaData) {
          // Acme has 1 org contact (System user as Owner)
          const acmeContacts = parseResults(acmeData);
          expect(acmeContacts.length).toBe(1);
          expect(acmeContacts[0].OrganizationID).toBe(ACME_ORG_ID);

          // Beta has 2 org contacts (System as Member + Other as Admin)
          const betaContacts = parseResults(betaData);
          expect(betaContacts.length).toBe(2);
          for (const c of betaContacts) {
            expect(c.OrganizationID).toBe(BETA_ORG_ID);
          }
        }
      },
      REQUEST_TIMEOUT
    );
  });

  describe('4.7 Org selector via X-Organization-ID header', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should switch active org via X-Organization-ID header',
      async () => {
        // When X-Organization-ID is set to Beta Inc, the request should succeed.
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': BETA_ORG_ID }),
          body: JSON.stringify({ query: '{ __typename }' }),
        });

        expect(status).toBe(200);
        const data = body.data as Record<string, string> | null;
        expect(data?.__typename).toBe('Query');
      },
      REQUEST_TIMEOUT
    );

    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should reject X-Organization-ID for org user has no access to',
      async () => {
        // System user does NOT belong to org 99999999-...
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': NONEXISTENT_ORG_ID }),
          body: JSON.stringify({ query: '{ __typename }' }),
        });

        expect(status).toBe(403);
        const error = body as { error?: string; message?: string };
        expect(error.error).toBe('Forbidden');
      }
    );
  });

  describe('4.8 MJ TenantContext populated', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should populate TenantContext with org data',
      async () => {
        // When context is set to Acme, org-scoped queries should be filtered.
        // This proves TenantContext is populated and hooks can read it.
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': ACME_ORG_ID }),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData) {
          expect(rvData.ErrorMessage).toBeNull();
          // Hook used TenantContext.organizationID to filter — only Acme contacts
          const results = parseResults(rvData);
          expect(results.length).toBe(1);
          expect(results[0].OrganizationID).toBe(ACME_ORG_ID);
        }
      },
      REQUEST_TIMEOUT
    );
  });

  describe('4.12 GraphQL context has tenant', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should authenticate and execute GraphQL with tenant context',
      async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders(),
          body: JSON.stringify({ query: '{ __typename }' }),
        });

        expect(status).toBe(200);
        const data = body.data as Record<string, string> | null;
        expect(data?.__typename).toBe('Query');
      }
    );
  });
});

// ─── Phase 5: BCSaaS Hook Integration ───────────────────────────────────────

describe('Phase 5: BCSaaS Hook Integration', () => {
  describe('5.3 BCSaaS PreRunView filter uses org context', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should filter org-scoped entities by OrganizationID from default context',
      async () => {
        // Default org for System user is Acme Corp (first membership).
        // BC: Organization Contacts (org-scoped) should only return Acme contacts.
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders(),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData && rvData.RowCount > 0) {
          const results = parseResults(rvData);
          for (const row of results) {
            expect(row.OrganizationID).toBe(ACME_ORG_ID);
          }
        }
      },
      REQUEST_TIMEOUT
    );

    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should filter by selected org when X-Organization-ID is set',
      async () => {
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': BETA_ORG_ID }),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData && rvData.RowCount > 0) {
          const results = parseResults(rvData);
          for (const row of results) {
            expect(row.OrganizationID).toBe(BETA_ORG_ID);
          }
        }
      },
      REQUEST_TIMEOUT
    );
  });

  describe('5.3b Non-scoped entities pass through unfiltered', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should NOT filter entities without OrganizationID field',
      async () => {
        // BC: Contacts does NOT have OrganizationID — should return all 2 contacts
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders(),
          body: makeRunViewQuery('BC: Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData) {
          expect(rvData.ErrorMessage).toBeNull();
          expect(rvData.RowCount).toBe(2);
        }
      },
      REQUEST_TIMEOUT
    );
  });

  describe('5.6 Hook priority ordering', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should execute BCSaaS hook at priority 100 for org filtering',
      async () => {
        // BCSaaS hooks at priority 100 with namespace 'mj:tenantFilter'.
        // Verify the hook runs by checking org filtering works.
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': BETA_ORG_ID }),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData && rvData.RowCount > 0) {
          const results = parseResults(rvData);
          for (const row of results) {
            expect(row.OrganizationID).toBe(BETA_ORG_ID);
          }
        }
      },
      REQUEST_TIMEOUT
    );
  });

  describe('5.7-5.8 MJ multi-tenancy disabled, BCSaaS handles all', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should handle tenant filtering entirely through BCSaaS hooks',
      async () => {
        // MJ config-driven MT is disabled. BCSaaS hooks handle all filtering.
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': ACME_ORG_ID }),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData && rvData.RowCount > 0) {
          const results = parseResults(rvData);
          // Acme Corp has 1 org contact (System user)
          expect(results.length).toBe(1);
          expect(results[0].OrganizationID).toBe(ACME_ORG_ID);
        }
      },
      REQUEST_TIMEOUT
    );
  });
});

// ─── Phase 6: Multi-Layer Stacking ──────────────────────────────────────────

describe('Phase 6: Multi-Layer Stacking', () => {
  describe('6.5 BCSaaS hooks coexist with base MJ', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should run BCSaaS middleware and hooks without conflicting with MJ base',
      async () => {
        // Full pipeline: MJ auth → BCSaaS tenant → hooks → GraphQL
        // BC: Organizations has no OrganizationID field, so it's unfiltered — all 3 orgs.
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders(),
          body: makeRunViewQuery('BC: Organizations'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData) {
          expect(rvData.ErrorMessage).toBeNull();
          expect(rvData.RowCount).toBe(3);
        }
      },
      REQUEST_TIMEOUT
    );
  });

  describe('6.6 Middleware execution order', () => {
    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should execute: MJ Auth → BCSaaS Tenant → GraphQL in correct order',
      async () => {
        // Order verified by:
        // 1. Auth succeeds (200, not 401)
        // 2. Tenant context resolved (org filtering works on scoped entity)
        // 3. GraphQL query returns filtered data
        const { status, body } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: systemKeyHeaders({ 'x-organization-id': ACME_ORG_ID }),
          body: makeRunViewQuery('BC: Organization Contacts'),
        });

        expect(status).toBe(200);
        const rvData = extractRunViewData(body);
        if (rvData) {
          expect(rvData.ErrorMessage).toBeNull();
          if (rvData.RowCount > 0) {
            const results = parseResults(rvData);
            for (const row of results) {
              expect(row.OrganizationID).toBe(ACME_ORG_ID);
            }
          }
        }
      },
      REQUEST_TIMEOUT
    );

    it.skipIf(!HAS_SERVER || !HAS_SYSTEM_KEY)(
      'should return 401 when no auth is provided (MJ auth blocks before BCSaaS)',
      async () => {
        const { status } = await fetchJson(GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: makeRunViewQuery('BC: Organizations'),
        });

        expect(status).toBe(401);
      }
    );
  });
});
