import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
} from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type {
    RESTAuthContext,
    RESTResponse,
    PaginationType,
} from '@memberjunction/integration-engine';
import { HivebriteConnector } from '../HivebriteConnector.js';

// ─── Test harness ────────────────────────────────────────────────────
//
// The vitest file is CREDENTIAL-FREE and NON-MUTATING (T4/T5). It tests:
//   - OAuth2 token mint (password grant w/ admin_email param) + refresh (refresh_token grant)
//     by mocking the token endpoint via global.fetch
//   - Bearer header injection + per-community base URL resolution
//   - page/per_page pagination URL building (incl. per_page clamp) + watermark param
//   - NormalizeResponse bare-array / envelope / single-object shapes + empty-string→null
//   - ExtractPaginationInfo short-page HasMore derivation
//   - RateLimitPolicy + ExtractRetryAfterMs
//   - Identity (three-way name) + metadata-driven write capability
// It NEVER hits a live API and NEVER mutates data.
//
// FIXTURES descend from the Hivebrite OpenAPI spec component schemas
// (components.schemas.User / Companies_Company), with all PII replaced by safe synthetic
// values (scrub-fixture convention: emails → example+N@example.com, names → scrubbed).
// PROVENANCE: https://api-docs.hivebrite.com/ OpenAPI spec, components.schemas.

/** Exposes protected members so tests can drive the auth/pagination/normalize surface. */
class TestHivebriteConnector extends HivebriteConnector {
    /** Records every URL passed to MakeHTTPRequest (set as the API mock). */
    public RequestedURLs: string[] = [];
    /** Records the headers MakeHTTPRequest was invoked with. */
    public RequestedHeaders: Array<Record<string, string>> = [];
    /** Records the methods + bodies for write-path tests. */
    public RequestedMethods: string[] = [];
    public RequestedBodies: unknown[] = [];
    /** Canned API response (NOT the token endpoint — that goes through global.fetch). */
    public NextAPIResponse: RESTResponse = { Status: 200, Body: [], Headers: {} };

    public callAuthenticate(ci: MJCompanyIntegrationEntity, user: UserInfo): Promise<RESTAuthContext> {
        return this.Authenticate(ci, user);
    }
    public callBuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return this.BuildHeaders(auth);
    }
    public callGetBaseURL(ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return this.GetBaseURL(ci, auth);
    }
    public callNormalizeResponse(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public callExtractPaginationInfo(
        body: unknown, type: PaginationType, page: number, offset: number, pageSize: number
    ) {
        return this.ExtractPaginationInfo(body, type, page, offset, pageSize);
    }
    public callBuildPaginatedURL(
        basePath: string, obj: MJIntegrationObjectEntity, page: number, offset: number,
        cursor?: string, effPageSize?: number
    ): string {
        return this.BuildPaginatedURL(basePath, obj, page, offset, cursor, effPageSize);
    }
    /** Sets the watermark context the same way FetchChanges would, for URL-building tests. */
    public setWatermark(value: string | undefined): void {
        (this as unknown as { currentWatermark: string | undefined }).currentWatermark = value;
    }

    // Capture the API HTTP layer (the token endpoint is mocked separately via global.fetch).
    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        this.RequestedURLs.push(url);
        this.RequestedHeaders.push(headers);
        this.RequestedMethods.push(method);
        this.RequestedBodies.push(body);
        return this.NextAPIResponse;
    }
}

const USER = {} as UserInfo;

/** A CompanyIntegration whose Configuration carries an OAuth2 config (no credential lookup). */
function ciWithConfig(config: Record<string, unknown>): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'hb-integration-id',
        CredentialID: null,
        Configuration: JSON.stringify(config),
    } as unknown as MJCompanyIntegrationEntity;
}

const REFRESH_CONFIG = {
    ClientId: 'client-123',
    ClientSecret: 'secret-456',
    RefreshToken: 'refresh-789',
    BaseURL: 'https://demo.hivebrite.com',
    Scope: 'admin',
};

const PASSWORD_CONFIG = {
    ClientId: 'client-123',
    ClientSecret: 'secret-456',
    AdminEmail: 'example+1@example.com',
    Password: 'svc-pass',
    BaseURL: 'https://demo.hivebrite.com',
    Scope: 'admin',
};

/** Builds a minimal IntegrationObject entity for URL-building tests. */
function obj(partial: Partial<MJIntegrationObjectEntity>): MJIntegrationObjectEntity {
    return {
        Name: 'User',
        APIPath: '/admin/v1/users',
        SupportsPagination: true,
        PaginationType: 'PageNumber',
        DefaultPageSize: 100,
        SupportsIncrementalSync: false,
        IncrementalWatermarkField: null,
        ...partial,
    } as unknown as MJIntegrationObjectEntity;
}

// ── Reality-descended fixtures (OpenAPI components.schemas, PII-scrubbed) ──
const USER_FIXTURE = {
    id: 4001,
    email: 'example+1@example.com',
    name: '<scrubbed-name-1>',
    sub_network_ids: [10, 11],
    extended_updated_at: '2026-03-04T10:00:00Z',
    firstname: '<scrubbed-name-1>',
    lastname: '<scrubbed-name-2>',
    updated_at: '2026-03-04T10:00:00Z',
    bio: '', // empty string → null coercion target
};

const COMPANY_FIXTURE = {
    id: 7002,
    name: '<scrubbed-company-1>',
    corporate_name: '<scrubbed-company-1> Inc.',
    company_identifier: 'CMP-7002',
    website_url: 'https://example.com',
    updated_at: '2026-02-01T08:30:00Z',
};

describe('HivebriteConnector', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    const realFetch = global.fetch;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });
    afterEach(() => {
        global.fetch = realFetch;
        vi.restoreAllMocks();
    });

    /** Makes global.fetch (the token endpoint) return a token payload. */
    function mockTokenEndpoint(payload: Record<string, unknown>, status = 200): void {
        fetchMock.mockResolvedValue({
            ok: status >= 200 && status < 300,
            status,
            text: async () => JSON.stringify(payload),
            json: async () => payload,
        } as unknown as Response);
    }

    // ── Identity / three-way invariant ──────────────────────────────
    describe('Identity', () => {
        it('IntegrationName getter returns the canonical name verbatim', () => {
            expect(new HivebriteConnector().IntegrationName).toBe('Hivebrite');
        });
        it('write capability is METADATA-DRIVEN — read-only with no engine cache loaded', () => {
            const c = new HivebriteConnector();
            expect(c.SupportsCreate).toBe(false);
            expect(c.SupportsUpdate).toBe(false);
            expect(c.SupportsDelete).toBe(false);
            expect(c.SupportsGet).toBe(true);
        });
    });

    // ── OAuth2 token mint + refresh ─────────────────────────────────
    describe('OAuth2 Authenticate', () => {
        it('PRIMARY grant: exchanges refresh_token at {base}/api/oauth/token and bears the access token', async () => {
            mockTokenEndpoint({ access_token: 'AT-primary', token_type: 'Bearer', expires_in: 3600 });
            const connector = new TestHivebriteConnector();

            const auth = await connector.callAuthenticate(ciWithConfig(REFRESH_CONFIG), USER);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [tokenURL, init] = fetchMock.mock.calls[0];
            expect(tokenURL).toBe('https://demo.hivebrite.com/api/oauth/token');
            const body = String((init as RequestInit).body);
            expect(body).toContain('grant_type=refresh_token');
            expect(body).toContain('refresh_token=refresh-789');
            expect(body).toContain('client_id=client-123');
            expect(body).toContain('client_secret=secret-456');
            expect((auth as { Token: string }).Token).toBe('AT-primary');
        });

        it('FALLBACK grant: uses password grant with admin_email param when no refresh_token', async () => {
            mockTokenEndpoint({ access_token: 'AT-fallback', token_type: 'Bearer', expires_in: 3600 });
            const connector = new TestHivebriteConnector();

            const auth = await connector.callAuthenticate(ciWithConfig(PASSWORD_CONFIG), USER);

            const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
            expect(body).toContain('grant_type=password');
            // Hivebrite-specific: username param is admin_email, NOT username.
            expect(body).toContain('admin_email=example%2B1%40example.com');
            expect(body).not.toContain('username=');
            expect(body).toContain('password=svc-pass');
            expect(body).toContain('scope=admin');
            expect((auth as { Token: string }).Token).toBe('AT-fallback');
        });

        it('honors a TokenURL override from the config', async () => {
            mockTokenEndpoint({ access_token: 'AT-override', expires_in: 3600 });
            const connector = new TestHivebriteConnector();
            await connector.callAuthenticate(
                ciWithConfig({ ...REFRESH_CONFIG, TokenURL: 'https://auth.example.com/token' }), USER
            );
            expect(fetchMock.mock.calls[0][0]).toBe('https://auth.example.com/token');
        });

        it('caches the token within a run (single token round-trip across calls)', async () => {
            mockTokenEndpoint({ access_token: 'AT-cached', expires_in: 3600 });
            const connector = new TestHivebriteConnector();
            const ci = ciWithConfig(REFRESH_CONFIG);
            await connector.callAuthenticate(ci, USER);
            await connector.callAuthenticate(ci, USER);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('fails loudly when the token endpoint rejects the credentials', async () => {
            mockTokenEndpoint({ error: 'invalid_grant', error_description: 'bad refresh token' }, 400);
            const connector = new TestHivebriteConnector();
            await expect(connector.callAuthenticate(ciWithConfig(REFRESH_CONFIG), USER))
                .rejects.toThrow(/invalid_grant|bad refresh token|400/);
        });

        it('rejects a config lacking both a refresh token and admin_email/password', async () => {
            const connector = new TestHivebriteConnector();
            const badCfg = { ClientId: 'c', ClientSecret: 's', BaseURL: 'https://x.hivebrite.com' };
            await expect(connector.callAuthenticate(ciWithConfig(badCfg), USER))
                .rejects.toThrow(/RefreshToken|AdminEmail/);
        });

        it('rejects a config missing BaseURL', async () => {
            const connector = new TestHivebriteConnector();
            const badCfg = { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' };
            await expect(connector.callAuthenticate(ciWithConfig(badCfg), USER)).rejects.toThrow(/BaseURL/);
        });
    });

    // ── Bearer header + base URL ─────────────────────────────────────
    describe('BuildHeaders / GetBaseURL', () => {
        it('injects Authorization: Bearer {token}', async () => {
            mockTokenEndpoint({ access_token: 'AT-header', expires_in: 3600 });
            const connector = new TestHivebriteConnector();
            const auth = await connector.callAuthenticate(ciWithConfig(REFRESH_CONFIG), USER);
            const headers = connector.callBuildHeaders(auth);
            expect(headers['Authorization']).toBe('Bearer AT-header');
            expect(headers['Accept']).toBe('application/json');
        });

        it('resolves the per-community base URL with a /api segment (no hardcoded host)', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestHivebriteConnector();
            const ci = ciWithConfig({ ...REFRESH_CONFIG, BaseURL: 'https://operator-x.hivebrite.com/' });
            const auth = await connector.callAuthenticate(ci, USER);
            expect(connector.callGetBaseURL(ci, auth)).toBe('https://operator-x.hivebrite.com/api');
        });

        it('strips a trailing /api from BaseURL before re-appending it', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestHivebriteConnector();
            const ci = ciWithConfig({ ...REFRESH_CONFIG, BaseURL: 'https://operator-x.hivebrite.com/api' });
            const auth = await connector.callAuthenticate(ci, USER);
            expect(connector.callGetBaseURL(ci, auth)).toBe('https://operator-x.hivebrite.com/api');
        });
    });

    // ── NormalizeResponse ────────────────────────────────────────────
    describe('NormalizeResponse', () => {
        const c = new TestHivebriteConnector();

        it('passes through a bare top-level array (the common Hivebrite list shape)', () => {
            const out = c.callNormalizeResponse([USER_FIXTURE, { ...USER_FIXTURE, id: 4002 }], null);
            expect(out).toHaveLength(2);
            expect(out[0].id).toBe(4001);
            expect(out[1].id).toBe(4002);
        });

        it('coerces empty strings to null', () => {
            const out = c.callNormalizeResponse([USER_FIXTURE], null);
            expect(out[0].bio).toBeNull();
        });

        it('preserves the FULL source record (custom-column pass-through)', () => {
            const withCustom = { ...USER_FIXTURE, custom_attributes: [{ name: 'cohort', value: '2026' }] };
            const out = c.callNormalizeResponse([withCustom], null);
            expect(out[0].custom_attributes).toEqual([{ name: 'cohort', value: '2026' }]);
            // every source key survives
            expect(Object.keys(out[0]).sort()).toEqual(Object.keys(withCustom).sort());
        });

        it('unwraps an explicit responseDataKey envelope', () => {
            const out = c.callNormalizeResponse({ users: [USER_FIXTURE] }, 'users');
            expect(out).toHaveLength(1);
            expect(out[0].id).toBe(4001);
        });

        it('unwraps a single-array-property envelope (e.g. postal_addresses)', () => {
            const out = c.callNormalizeResponse({ postal_addresses: [{ id: 1 }, { id: 2 }] }, null);
            expect(out).toHaveLength(2);
        });

        it('keeps a genuine single-object detail record', () => {
            const out = c.callNormalizeResponse(COMPANY_FIXTURE, null);
            expect(out).toHaveLength(1);
            expect(out[0].id).toBe(7002);
        });

        it('returns [] for null / undefined bodies', () => {
            expect(c.callNormalizeResponse(null, null)).toEqual([]);
            expect(c.callNormalizeResponse(undefined, null)).toEqual([]);
        });
    });

    // ── ExtractPaginationInfo ────────────────────────────────────────
    describe('ExtractPaginationInfo', () => {
        const c = new TestHivebriteConnector();

        it('a FULL page (length >= per_page) implies more — advances NextPage', () => {
            const page = Array.from({ length: 25 }, (_, i) => ({ id: i }));
            const state = c.callExtractPaginationInfo(page, 'PageNumber', 1, 0, 25);
            expect(state.HasMore).toBe(true);
            expect(state.NextPage).toBe(2);
        });

        it('a SHORT page (length < per_page) terminates', () => {
            const page = Array.from({ length: 7 }, (_, i) => ({ id: i }));
            const state = c.callExtractPaginationInfo(page, 'PageNumber', 3, 0, 25);
            expect(state.HasMore).toBe(false);
        });

        it('an EMPTY page terminates', () => {
            expect(c.callExtractPaginationInfo([], 'PageNumber', 2, 0, 25).HasMore).toBe(false);
        });

        it('clamps the per_page comparator to the server cap (100)', () => {
            // 100 rows requested at per_page=500 → effective cap is 100, so a 100-row page is "full".
            const page = Array.from({ length: 100 }, (_, i) => ({ id: i }));
            expect(c.callExtractPaginationInfo(page, 'PageNumber', 1, 0, 500).HasMore).toBe(true);
        });
    });

    // ── BuildPaginatedURL ────────────────────────────────────────────
    describe('BuildPaginatedURL', () => {
        const c = new TestHivebriteConnector();

        it('emits page + per_page with per_page clamped to 100', () => {
            const url = c.callBuildPaginatedURL('/admin/v1/users', obj({}), 2, 0, undefined, 500);
            expect(url).toContain('page=2');
            expect(url).toContain('per_page=100');
        });

        it('honors the requested page size below the cap', () => {
            const url = c.callBuildPaginatedURL('/admin/v1/users', obj({}), 1, 0, undefined, 25);
            expect(url).toContain('per_page=25');
        });

        it('emits the metadata IncrementalWatermarkField param when watermark is in context', () => {
            c.setWatermark('2026-01-15T00:00:00Z');
            const url = c.callBuildPaginatedURL(
                '/admin/v1/users',
                obj({ SupportsIncrementalSync: true, IncrementalWatermarkField: 'updated_since' }),
                1, 0, undefined, 25
            );
            expect(url).toContain('updated_since=2026-01-15T00%3A00%3A00Z');
            c.setWatermark(undefined);
        });

        it('uses created_since when that is the IO watermark field (per-IO metadata-driven)', () => {
            c.setWatermark('2026-01-15T00:00:00Z');
            const url = c.callBuildPaginatedURL(
                '/admin/v1/receipts',
                obj({ Name: 'Receipt', SupportsIncrementalSync: true, IncrementalWatermarkField: 'created_since' }),
                1, 0, undefined, 25
            );
            expect(url).toContain('created_since=');
            expect(url).not.toContain('updated_since=');
            c.setWatermark(undefined);
        });

        it('omits the watermark param when SupportsIncrementalSync is false', () => {
            c.setWatermark('2026-01-15T00:00:00Z');
            const url = c.callBuildPaginatedURL('/admin/v1/users', obj({}), 1, 0, undefined, 25);
            expect(url).not.toContain('updated_since');
            c.setWatermark(undefined);
        });
    });

    // ── RateLimitPolicy / ExtractRetryAfterMs ────────────────────────
    describe('Sync-efficiency hooks', () => {
        const c = new HivebriteConnector();

        it('declares the documented 300/min (5/sec) rate limit', () => {
            const policy = c.RateLimitPolicy;
            expect(policy).not.toBeNull();
            expect(policy?.TokensPerSec).toBe(5);
        });

        it('parses a numeric Retry-After header (seconds → ms)', () => {
            const ms = c.ExtractRetryAfterMs({ Headers: { 'retry-after': '30' } });
            expect(ms).toBe(30_000);
        });

        it('returns undefined when no Retry-After header is present', () => {
            expect(c.ExtractRetryAfterMs({ Headers: {} })).toBeUndefined();
            expect(c.ExtractRetryAfterMs(null)).toBeUndefined();
        });
    });

    // ── TestConnection ───────────────────────────────────────────────
    describe('TestConnection', () => {
        it('returns Success on a 2xx from the users probe', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestHivebriteConnector();
            connector.NextAPIResponse = { Status: 200, Body: [USER_FIXTURE], Headers: {} };
            const result = await connector.TestConnection(ciWithConfig(REFRESH_CONFIG), USER);
            expect(result.Success).toBe(true);
            expect(connector.RequestedURLs[0]).toContain('/api/admin/v1/users?per_page=1');
        });

        it('returns failure on a non-2xx API response', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestHivebriteConnector();
            connector.NextAPIResponse = { Status: 401, Body: { status: 401, errors: 'unauthorized' }, Headers: {} };
            const result = await connector.TestConnection(ciWithConfig(REFRESH_CONFIG), USER);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('401');
        });

        it('returns failure (not throw) when the token endpoint rejects', async () => {
            mockTokenEndpoint({ error: 'invalid_client' }, 401);
            const connector = new TestHivebriteConnector();
            const result = await connector.TestConnection(ciWithConfig(REFRESH_CONFIG), USER);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });
    });
});
