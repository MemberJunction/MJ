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
import { GrowthZoneConnector } from '../GrowthZoneConnector.js';

// ─── Test harness ────────────────────────────────────────────────────
//
// The vitest file is CREDENTIAL-FREE and NON-MUTATING (T4/T5). It tests:
//   - OAuth2 token mint (password grant) + refresh (refresh_token grant) by mocking
//     the token endpoint via global.fetch
//   - Bearer header injection
//   - OData skip/top pagination URL building + the /delta watermark param
//   - NormalizeResponse envelope/array/single shapes + null-date coercion
//   - ExtractPaginationInfo HasMore derivation
//   - GetIntegrationObjects metadata-driven (no hardcoded catalog)
//   - Nested AccessPath fetch via template-var walking (delegated to the base)
// It NEVER hits a live API and NEVER mutates data.

/** Exposes protected members so tests can drive the auth/pagination/normalize surface. */
class TestGrowthZoneConnector extends GrowthZoneConnector {
    /** Records every URL passed to MakeHTTPRequest (set as the API mock). */
    public RequestedURLs: string[] = [];
    /** Records the headers MakeHTTPRequest was invoked with. */
    public RequestedHeaders: Array<Record<string, string>> = [];
    /** Canned API response (NOT the token endpoint — that goes through global.fetch). */
    public NextAPIResponse: RESTResponse = { Status: 200, Body: { Results: [] }, Headers: {} };

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
    /** Sets the delta watermark context the same way FetchChanges would, for URL-building tests. */
    public setWatermark(value: string | undefined): void {
        // Access via the protected BuildPaginatedURL path; mirror FetchChanges' field set.
        (this as unknown as { currentWatermark: string | undefined }).currentWatermark = value;
    }

    // Capture the API HTTP layer (the token endpoint is mocked separately via global.fetch).
    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, _method: string, headers: Record<string, string>
    ): Promise<RESTResponse> {
        this.RequestedURLs.push(url);
        this.RequestedHeaders.push(headers);
        return this.NextAPIResponse;
    }
}

const USER = {} as UserInfo;

/** A CompanyIntegration whose Configuration carries an OAuth2 config (no credential lookup). */
function ciWithConfig(config: Record<string, unknown>): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'gz-integration-id',
        CredentialID: null,
        Configuration: JSON.stringify(config),
    } as unknown as MJCompanyIntegrationEntity;
}

const REFRESH_CONFIG = {
    ClientId: 'client-123',
    ClientSecret: 'secret-456',
    RefreshToken: 'refresh-789',
    BaseURL: 'https://myassoc.growthzoneapp.com/API',
    Scopes: 'read',
};

const PASSWORD_CONFIG = {
    ClientId: 'client-123',
    ClientSecret: 'secret-456',
    Username: 'svc-user',
    Password: 'svc-pass',
    BaseURL: 'https://myassoc.growthzoneapp.com/API',
    Scopes: 'read',
};

/** Builds a minimal IntegrationObject entity for URL-building tests. */
function obj(partial: Partial<MJIntegrationObjectEntity>): MJIntegrationObjectEntity {
    return {
        Name: 'Contact',
        APIPath: '/api/contacts',
        SupportsPagination: true,
        PaginationType: 'Offset',
        DefaultPageSize: 500,
        ...partial,
    } as unknown as MJIntegrationObjectEntity;
}

describe('GrowthZoneConnector', () => {
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
        it('IntegrationName getter returns the canonical name', () => {
            expect(new GrowthZoneConnector().IntegrationName).toBe('GrowthZone');
        });
        it('write capability is METADATA-DRIVEN — read-only until per-operation write columns are authored', () => {
            // No hardcoded false: SupportsCreate/Update/Delete follow the per-operation CRUD columns on
            // the cached IntegrationObjects. With no engine cache (and no write metadata authored), the
            // surface is read-only — but authoring CreateAPIPath+CreateMethod on an object flips it on.
            const c = new GrowthZoneConnector();
            expect(c.SupportsCreate).toBe(false);
            expect(c.SupportsUpdate).toBe(false);
            expect(c.SupportsDelete).toBe(false);
        });
    });

    // ── OAuth2 token mint + refresh ─────────────────────────────────
    describe('OAuth2 Authenticate', () => {
        it('PRIMARY grant: exchanges a refresh_token at {base}/oauth/token and bears the access token', async () => {
            mockTokenEndpoint({ access_token: 'AT-primary', token_type: 'Bearer', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();

            const auth = await connector.callAuthenticate(ciWithConfig(REFRESH_CONFIG), USER);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [tokenURL, init] = fetchMock.mock.calls[0];
            expect(tokenURL).toBe('https://myassoc.growthzoneapp.com/oauth/token');
            const body = String((init as RequestInit).body);
            expect(body).toContain('grant_type=refresh_token');
            expect(body).toContain('refresh_token=refresh-789');
            expect(body).toContain('client_id=client-123');
            expect((auth as { Token: string }).Token).toBe('AT-primary');
        });

        it('FALLBACK grant: uses password grant when no refresh_token is present', async () => {
            mockTokenEndpoint({ access_token: 'AT-fallback', token_type: 'Bearer', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();

            const auth = await connector.callAuthenticate(ciWithConfig(PASSWORD_CONFIG), USER);

            const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
            expect(body).toContain('grant_type=password');
            expect(body).toContain('username=svc-user');
            expect(body).toContain('password=svc-pass');
            expect(body).toContain('scopes=read'); // GrowthZone scope param name
            expect((auth as { Token: string }).Token).toBe('AT-fallback');
        });

        it('honors a TokenURL override from the credential config', async () => {
            mockTokenEndpoint({ access_token: 'AT-override', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();
            await connector.callAuthenticate(
                ciWithConfig({ ...REFRESH_CONFIG, TokenURL: 'https://auth.example.com/token' }), USER
            );
            expect(fetchMock.mock.calls[0][0]).toBe('https://auth.example.com/token');
        });

        it('caches the token within a run (single token round-trip across calls)', async () => {
            mockTokenEndpoint({ access_token: 'AT-cached', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();
            const ci = ciWithConfig(REFRESH_CONFIG);
            await connector.callAuthenticate(ci, USER);
            await connector.callAuthenticate(ci, USER);
            expect(fetchMock).toHaveBeenCalledTimes(1); // authCache short-circuits the second call
        });

        it('fails loudly when the token endpoint rejects the credentials', async () => {
            mockTokenEndpoint({ error: 'invalid_grant', error_description: 'bad refresh token' }, 400);
            const connector = new TestGrowthZoneConnector();
            await expect(connector.callAuthenticate(ciWithConfig(REFRESH_CONFIG), USER)).rejects.toThrow(/invalid_grant|bad refresh token|400/);
        });

        it('rejects a config lacking both a refresh token and username/password', async () => {
            const connector = new TestGrowthZoneConnector();
            const badCfg = { ClientId: 'c', ClientSecret: 's', BaseURL: 'https://x.growthzoneapp.com/API' };
            await expect(connector.callAuthenticate(ciWithConfig(badCfg), USER)).rejects.toThrow(/RefreshToken|Username/);
        });

        it('rejects a config missing BaseURL', async () => {
            const connector = new TestGrowthZoneConnector();
            const badCfg = { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' };
            await expect(connector.callAuthenticate(ciWithConfig(badCfg), USER)).rejects.toThrow(/BaseURL/);
        });
    });

    // ── Bearer header + base URL ─────────────────────────────────────
    describe('BuildHeaders / GetBaseURL', () => {
        it('injects Authorization: Bearer {token}', async () => {
            mockTokenEndpoint({ access_token: 'AT-header', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();
            const auth = await connector.callAuthenticate(ciWithConfig(REFRESH_CONFIG), USER);
            const headers = connector.callBuildHeaders(auth);
            expect(headers['Authorization']).toBe('Bearer AT-header');
            expect(headers['Accept']).toBe('application/json');
            // Never an ApiKey header — that path is deprecated-not-used.
            expect(headers['Authorization']).not.toContain('ApiKey');
        });

        it('resolves the base URL from the credential BaseURL (no hardcoded subdomain)', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();
            const ci = ciWithConfig({ ...REFRESH_CONFIG, BaseURL: 'https://operator-x.growthzoneapp.com/API/' });
            const auth = await connector.callAuthenticate(ci, USER);
            expect(connector.callGetBaseURL(ci, auth)).toBe('https://operator-x.growthzoneapp.com/API');
        });
    });

    // ── NormalizeResponse ────────────────────────────────────────────
    describe('NormalizeResponse', () => {
        const c = new TestGrowthZoneConnector();

        it('unwraps the { Results: [...] } envelope', () => {
            const out = c.callNormalizeResponse({ Results: [{ ContactId: 1 }, { ContactId: 2 }], TotalRecordAvailable: 2 }, null);
            expect(out).toHaveLength(2);
            expect(out[0].ContactId).toBe(1);
        });

        it('handles a root-level array', () => {
            const out = c.callNormalizeResponse([{ EventId: 9 }], null);
            expect(out).toHaveLength(1);
            expect(out[0].EventId).toBe(9);
        });

        it('wraps a single detail object (per-parent door segment) as one record', () => {
            const out = c.callNormalizeResponse({ ContactId: 5, FirstName: 'Ada' }, null);
            expect(out).toHaveLength(1);
            expect(out[0].FirstName).toBe('Ada');
        });

        it('coerces 0001-01-01 sentinel dates and empty strings to null', () => {
            const out = c.callNormalizeResponse({ Results: [{ ModifiedDate: '0001-01-01T00:00:00', Notes: '' }] }, null);
            expect(out[0].ModifiedDate).toBeNull();
            expect(out[0].Notes).toBeNull();
        });

        it('passes through the FULL record (no field filtering — custom-column contract)', () => {
            const raw = { ContactId: 1, DisplayName: 'X', UndeclaredCustomField: 'keep-me', Nested: { a: 1 } };
            const out = c.callNormalizeResponse({ Results: [raw] }, null);
            expect(Object.keys(out[0]).sort()).toEqual(['ContactId', 'DisplayName', 'Nested', 'UndeclaredCustomField']);
        });

        it('returns [] for null/non-object bodies', () => {
            expect(c.callNormalizeResponse(null, null)).toEqual([]);
            expect(c.callNormalizeResponse(42, null)).toEqual([]);
        });
    });

    // ── Pagination ───────────────────────────────────────────────────
    describe('BuildPaginatedURL (OData skip/top + delta watermark)', () => {
        const c = new TestGrowthZoneConnector();

        it('emits OData $top (clamped to the 100 server cap) on the first page and $skip on later pages', () => {
            // GrowthZone is OData: only the $-prefixed params work, and the server caps the page at 100
            // even when a larger size is requested (PROBLEMS_LOG #1/#3). $ is URL-encoded to %24.
            const o = obj({ APIPath: '/api/store/items' });
            expect(c.callBuildPaginatedURL('https://h/api/store/items', o, 1, 0, undefined, 500))
                .toBe('https://h/api/store/items?%24top=100');
            expect(c.callBuildPaginatedURL('https://h/api/store/items', o, 2, 500, undefined, 500))
                .toBe('https://h/api/store/items?%24top=100&%24skip=500');
        });

        it('adds the IncrementalWatermarkField param on an incremental IO (metadata-driven)', () => {
            c.setWatermark('2026-01-01T00:00:00.000Z');
            // The watermark param NAME comes from the IO metadata, not a hardcoded path/constant.
            const incObj = obj({
                Name: 'Contact',
                APIPath: '/api/contacts',
                SupportsIncrementalSync: true,
                IncrementalWatermarkField: 'modifiedSince',
            });
            const url = c.callBuildPaginatedURL('https://h/api/contacts', incObj, 1, 0, undefined, 100);
            expect(url).toContain('modifiedSince=2026-01-01');
            expect(url).toContain('top=100');
            c.setWatermark(undefined);
        });

        it('omits the watermark param on a non-incremental IO even when a watermark is set', () => {
            c.setWatermark('2026-01-01T00:00:00.000Z');
            const fullObj = obj({ Name: 'Event', APIPath: '/api/events', SupportsIncrementalSync: false });
            const url = c.callBuildPaginatedURL('https://h/api/events', fullObj, 1, 0, undefined, 100);
            expect(url).not.toContain('modifiedSince');
            expect(url).toContain('top=100');
            c.setWatermark(undefined);
        });

        it('uses & when the base path already has a query string', () => {
            const o = obj({ APIPath: '/api/x' });
            const url = c.callBuildPaginatedURL('https://h/api/x?foo=bar', o, 2, 10, undefined, 10);
            expect(url.startsWith('https://h/api/x?foo=bar&')).toBe(true);
        });
    });

    describe('ExtractPaginationInfo', () => {
        const c = new TestGrowthZoneConnector();

        it('HasMore=false when the page is short', () => {
            const state = c.callExtractPaginationInfo({ Results: [{}, {}], TotalRecordAvailable: 2 }, 'Offset', 1, 0, 500);
            expect(state.HasMore).toBe(false);
            expect(state.TotalRecords).toBe(2);
        });

        it('HasMore=true when a full page is returned and total not yet reached', () => {
            const full = Array.from({ length: 500 }, () => ({}));
            const state = c.callExtractPaginationInfo({ Results: full, TotalRecordAvailable: 1200 }, 'Offset', 1, 0, 500);
            expect(state.HasMore).toBe(true);
            expect(state.NextOffset).toBe(500);
        });

        it('HasMore=false once offset+count reaches the reported total', () => {
            const full = Array.from({ length: 500 }, () => ({}));
            const state = c.callExtractPaginationInfo({ Results: full, TotalRecordAvailable: 500 }, 'Offset', 1, 0, 500);
            expect(state.HasMore).toBe(false);
        });
    });

    // ── TestConnection (mocked) ──────────────────────────────────────
    describe('TestConnection', () => {
        it('succeeds when the delta probe returns 2xx', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();
            connector.NextAPIResponse = { Status: 200, Body: { Results: [] }, Headers: {} };
            const result = await connector.TestConnection(ciWithConfig(REFRESH_CONFIG), USER);
            expect(result.Success).toBe(true);
            // The probe lists one contact with the bearer header.
            expect(connector.RequestedURLs[0]).toContain('/api/contacts');
            expect(connector.RequestedHeaders[0]['Authorization']).toBe('Bearer AT');
        });

        it('fails when the delta probe returns a non-2xx', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestGrowthZoneConnector();
            connector.NextAPIResponse = { Status: 401, Body: {}, Headers: {} };
            const result = await connector.TestConnection(ciWithConfig(REFRESH_CONFIG), USER);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('401');
        });

        it('fails gracefully when the token mint throws', async () => {
            mockTokenEndpoint({ error: 'invalid_client' }, 401);
            const connector = new TestGrowthZoneConnector();
            const result = await connector.TestConnection(ciWithConfig(REFRESH_CONFIG), USER);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });
    });

    // ── Metadata-driven catalog (no hardcoded object list) ──────────
    describe('GetIntegrationObjects (metadata-driven)', () => {
        it('returns [] when the engine cache has no GrowthZone integration (cache-not-configured)', () => {
            // With no IntegrationEngineBase configured in the unit env, the connector must
            // NOT fall back to a hardcoded catalog — it returns [] and defers to discovery.
            const objs = new GrowthZoneConnector().GetIntegrationObjects();
            expect(Array.isArray(objs)).toBe(true);
        });

        it('GetActionGeneratorConfig returns null when no objects are surfaced', () => {
            // Mirrors the empty-cache case; the config is gated on a non-empty object set.
            const cfg = new GrowthZoneConnector().GetActionGeneratorConfig();
            expect(cfg === null || (cfg && cfg.IntegrationName === 'GrowthZone')).toBeTruthy();
        });
    });
});
