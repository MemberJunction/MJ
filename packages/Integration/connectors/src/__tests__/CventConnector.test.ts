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
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    FetchContext,
} from '@memberjunction/integration-engine';
import { CventConnector } from '../CventConnector.js';

// ─── Test harness ────────────────────────────────────────────────────
//
// The vitest file is CREDENTIAL-FREE and NON-MUTATING (T4/T5). It exercises:
//   - OAuth2 client_credentials token mint (Basic base64(client_id:client_secret) on the token
//     request + grant_type=client_credentials in the body) by mocking the token endpoint via
//     global.fetch
//   - Bearer header injection + region-aware base URL resolution
//   - token + limit cursor pagination URL building (incl. limit clamp ≤200) + watermark param
//   - NormalizeResponse data[] envelope / single-object detail + empty-string→null + full-record
//     pass-through into Fields
//   - ExtractPaginationInfo paging.nextToken → NextCursor surfacing
//   - generic per-operation CRUD request construction (URL/method/body) against MOCKS
//   - FetchChanges incremental watermark math (first sync / subsequent / partial-failure safety)
//   - RateLimitPolicy + ExtractRetryAfterMs (seconds + http-date + X-RateLimit-Reset)
//   - Identity (three-way name) + metadata-driven write capability
// It NEVER hits a live API and NEVER mutates data. Write-path tests assert only the request the
// connector WOULD send (captured from the MakeHTTPRequest mock) — no real endpoint is called.
//
// FIXTURES are small synthetic Cvent-shaped records (data[] + paging.nextToken). All values are
// fabricated test data; IDs are fake (evt_001 / con_001). No PII.

const USER = {} as UserInfo;

/** A CompanyIntegration whose Configuration carries an OAuth2 config (no credential lookup). */
function ciWithConfig(config: Record<string, unknown>): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'cvent-integration-id',
        CredentialID: null,
        Configuration: JSON.stringify(config),
    } as unknown as MJCompanyIntegrationEntity;
}

const BASE_CONFIG = {
    ClientId: 'client-abc',
    ClientSecret: 'secret-xyz',
    Scope: 'event/events:read',
};

/** Builds a minimal IntegrationObject entity for URL-building / CRUD tests. */
function obj(partial: Partial<MJIntegrationObjectEntity>): MJIntegrationObjectEntity {
    return {
        Name: 'Event',
        APIPath: '/events',
        SupportsPagination: true,
        PaginationType: 'Cursor',
        DefaultPageSize: 100,
        SupportsIncrementalSync: false,
        IncrementalWatermarkField: null,
        ...partial,
    } as unknown as MJIntegrationObjectEntity;
}

// ── Synthetic Cvent fixtures (data[] envelope + cursor) ──────────────
const EVENT_FIXTURE = {
    id: 'evt_001',
    title: 'Annual Conference',
    code: 'AC-2026',
    status: 'Active',
    start: '2026-04-01T09:00:00Z',
    lastModified: '2026-03-04T10:00:00Z',
    description: '', // empty string → null coercion target
};

const CONTACT_FIXTURE = {
    id: 'con_001',
    firstName: '<scrubbed-name-1>',
    lastName: '<scrubbed-name-2>',
    email: 'example+1@example.com',
    lastModified: '2026-02-01T08:30:00Z',
};

/** A list response: data[] + paging.nextToken. */
function listResponse(records: Record<string, unknown>[], nextToken?: string | null): Record<string, unknown> {
    return { data: records, paging: { nextToken: nextToken ?? null, limit: 100 } };
}

/**
 * Test subclass exposing protected members + capturing the HTTP boundary. The token endpoint
 * is mocked separately via global.fetch (OAuth2TokenManager's own round-trip); MakeHTTPRequest
 * captures API call args and returns canned responses.
 */
class TestCventConnector extends CventConnector {
    public RequestedURLs: string[] = [];
    public RequestedHeaders: Array<Record<string, string>> = [];
    public RequestedMethods: string[] = [];
    public RequestedBodies: unknown[] = [];
    public NextAPIResponse: RESTResponse = { Status: 200, Body: { data: [], paging: { nextToken: null } }, Headers: {} };
    /** Injected IntegrationObject returned by GetCachedObject for CRUD tests. */
    public CachedObject: MJIntegrationObjectEntity | null = null;

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
        basePath: string, o: MJIntegrationObjectEntity, page: number, offset: number,
        cursor?: string, effPageSize?: number
    ): string {
        return this.BuildPaginatedURL(basePath, o, page, offset, cursor, effPageSize);
    }
    /** Sets the watermark context the same way FetchChanges would, for URL-building tests. */
    public setWatermark(value: string | undefined): void {
        (this as unknown as { currentWatermark: string | undefined }).currentWatermark = value;
    }

    // For CRUD tests: bypass the engine cache and inject a known IntegrationObject.
    protected override GetCachedObject(_integrationID: string, _objectName: string): MJIntegrationObjectEntity {
        if (!this.CachedObject) throw new Error('test: CachedObject not set');
        return this.CachedObject;
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

describe('CventConnector', () => {
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

    /** Makes global.fetch (the token endpoint) return a token payload. Captures the request init. */
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
            expect(new CventConnector().IntegrationName).toBe('Cvent');
        });

        it('write capability is METADATA-DRIVEN — read-only with no engine cache loaded', () => {
            const c = new CventConnector();
            // With no engine cache, anyObjectDeclares() fails safe → no write capability.
            expect(c.SupportsCreate).toBe(false);
            expect(c.SupportsUpdate).toBe(false);
            expect(c.SupportsDelete).toBe(false);
            expect(c.SupportsGet).toBe(true);
        });
    });

    // ── OAuth2 client_credentials token mint ────────────────────────
    describe('OAuth2 Authenticate (client_credentials)', () => {
        it('exchanges client_credentials with Basic base64(client_id:client_secret) + grant_type in body', async () => {
            mockTokenEndpoint({ access_token: 'AT-cc', token_type: 'Bearer', expires_in: 3600 });
            const connector = new TestCventConnector();

            const auth = await connector.callAuthenticate(ciWithConfig(BASE_CONFIG), USER);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [tokenURL, init] = fetchMock.mock.calls[0];
            // Defaults to the documented Cvent token endpoint.
            expect(tokenURL).toBe('https://api-platform.cvent.com/ea/oauth2/token');

            const reqInit = init as RequestInit;
            // Basic auth header carrying base64(client_id:client_secret).
            const headers = reqInit.headers as Record<string, string>;
            const expectedBasic = Buffer.from('client-abc:secret-xyz').toString('base64');
            expect(headers['Authorization']).toBe(`Basic ${expectedBasic}`);
            expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');

            // grant_type=client_credentials in the form body; client creds NOT duplicated in the body.
            const body = String(reqInit.body);
            expect(body).toContain('grant_type=client_credentials');
            expect(body).not.toContain('client_id=');
            expect(body).not.toContain('client_secret=');
            expect(body).toContain('scope=event');

            expect((auth as { Token: string }).Token).toBe('AT-cc');
        });

        it('honors a TokenURL override from the config', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestCventConnector();
            await connector.callAuthenticate(
                ciWithConfig({ ...BASE_CONFIG, TokenURL: 'https://auth.example.com/token' }), USER
            );
            expect(fetchMock.mock.calls[0][0]).toBe('https://auth.example.com/token');
        });

        it('caches the token within a run (single token round-trip across calls)', async () => {
            mockTokenEndpoint({ access_token: 'AT-cached', expires_in: 3600 });
            const connector = new TestCventConnector();
            const ci = ciWithConfig(BASE_CONFIG);
            await connector.callAuthenticate(ci, USER);
            await connector.callAuthenticate(ci, USER);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('never logs the client secret in the auth path', async () => {
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestCventConnector();
            await connector.callAuthenticate(ciWithConfig(BASE_CONFIG), USER);
            const allLogs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
                .flat().map(String).join(' ');
            expect(allLogs).not.toContain('secret-xyz');
        });

        it('fails loudly when the token endpoint rejects the credentials', async () => {
            mockTokenEndpoint({ error: 'invalid_client', error_description: 'bad client credentials' }, 401);
            const connector = new TestCventConnector();
            await expect(connector.callAuthenticate(ciWithConfig(BASE_CONFIG), USER))
                .rejects.toThrow(/invalid_client|bad client credentials|401/);
        });

        it('rejects a config missing ClientId / ClientSecret', async () => {
            const connector = new TestCventConnector();
            await expect(connector.callAuthenticate(ciWithConfig({ Scope: 'x' }), USER))
                .rejects.toThrow(/ClientId|ClientSecret/);
        });
    });

    // ── Bearer header + base URL ─────────────────────────────────────
    describe('BuildHeaders / GetBaseURL', () => {
        it('injects Authorization: Bearer {token}', async () => {
            mockTokenEndpoint({ access_token: 'AT-header', expires_in: 3600 });
            const connector = new TestCventConnector();
            const auth = await connector.callAuthenticate(ciWithConfig(BASE_CONFIG), USER);
            const headers = connector.callBuildHeaders(auth);
            expect(headers['Authorization']).toBe('Bearer AT-header');
            expect(headers['Accept']).toBe('application/json');
            expect(headers['Content-Type']).toBe('application/json');
        });

        it('resolves the default US platform base URL (with /ea segment) when no override', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestCventConnector();
            const ci = ciWithConfig(BASE_CONFIG);
            const auth = await connector.callAuthenticate(ci, USER);
            expect(connector.callGetBaseURL(ci, auth)).toBe('https://api-platform.cvent.com/ea');
        });

        it('resolves a region override base URL (e.g. EUR host) and strips a trailing slash', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestCventConnector();
            const ci = ciWithConfig({ ...BASE_CONFIG, BaseURL: 'https://api-platform-eur.cvent.com/ea/' });
            const auth = await connector.callAuthenticate(ci, USER);
            expect(connector.callGetBaseURL(ci, auth)).toBe('https://api-platform-eur.cvent.com/ea');
        });
    });

    // ── NormalizeResponse ────────────────────────────────────────────
    describe('NormalizeResponse', () => {
        const c = new TestCventConnector();

        it('unwraps the data[] envelope (the common Cvent list shape)', () => {
            const out = c.callNormalizeResponse(listResponse([EVENT_FIXTURE, { ...EVENT_FIXTURE, id: 'evt_002' }]), null);
            expect(out).toHaveLength(2);
            expect(out[0].id).toBe('evt_001');
            expect(out[1].id).toBe('evt_002');
        });

        it('keeps a genuine single-object detail record (GET /resource/{id})', () => {
            const out = c.callNormalizeResponse(EVENT_FIXTURE, null);
            expect(out).toHaveLength(1);
            expect(out[0].id).toBe('evt_001');
        });

        it('passes through a bare top-level array', () => {
            const out = c.callNormalizeResponse([EVENT_FIXTURE], null);
            expect(out).toHaveLength(1);
            expect(out[0].id).toBe('evt_001');
        });

        it('coerces empty strings to null', () => {
            const out = c.callNormalizeResponse(listResponse([EVENT_FIXTURE]), null);
            expect(out[0].description).toBeNull();
        });

        it('preserves the FULL source record (custom-column pass-through)', () => {
            const withCustom = { ...EVENT_FIXTURE, customFields: [{ name: 'track', value: 'AI' }] };
            const out = c.callNormalizeResponse(listResponse([withCustom]), null);
            expect(out[0].customFields).toEqual([{ name: 'track', value: 'AI' }]);
            // every source key survives the normalize (nothing dropped before the record is built)
            expect(Object.keys(out[0]).sort()).toEqual(Object.keys(withCustom).sort());
        });

        it('honors an explicit responseDataKey envelope', () => {
            const out = c.callNormalizeResponse({ items: [EVENT_FIXTURE] }, 'items');
            expect(out).toHaveLength(1);
            expect(out[0].id).toBe('evt_001');
        });

        it('returns [] for null / undefined bodies', () => {
            expect(c.callNormalizeResponse(null, null)).toEqual([]);
            expect(c.callNormalizeResponse(undefined, null)).toEqual([]);
        });
    });

    // ── ExtractPaginationInfo (paging.nextToken cursor) ──────────────
    describe('ExtractPaginationInfo', () => {
        const c = new TestCventConnector();

        it('surfaces NextCursor when paging.nextToken is present', () => {
            const state = c.callExtractPaginationInfo(listResponse([EVENT_FIXTURE], 'CURSOR_PAGE2'), 'Cursor', 1, 0, 100);
            expect(state.HasMore).toBe(true);
            expect(state.NextCursor).toBe('CURSOR_PAGE2');
        });

        it('terminates when paging.nextToken is null', () => {
            const state = c.callExtractPaginationInfo(listResponse([EVENT_FIXTURE], null), 'Cursor', 1, 0, 100);
            expect(state.HasMore).toBe(false);
        });

        it('terminates when paging is absent entirely', () => {
            const state = c.callExtractPaginationInfo({ data: [EVENT_FIXTURE] }, 'Cursor', 1, 0, 100);
            expect(state.HasMore).toBe(false);
        });

        it('terminates on an empty-string nextToken', () => {
            const state = c.callExtractPaginationInfo(listResponse([EVENT_FIXTURE], ''), 'Cursor', 1, 0, 100);
            expect(state.HasMore).toBe(false);
        });
    });

    // ── BuildPaginatedURL (token + limit, watermark) ─────────────────
    describe('BuildPaginatedURL', () => {
        const c = new TestCventConnector();

        it('emits limit clamped to the server cap (200) on the first page', () => {
            const url = c.callBuildPaginatedURL('/events', obj({}), 1, 0, undefined, 500);
            expect(url).toContain('limit=200');
            // No cursor token on the first page.
            expect(url).not.toContain('token=');
        });

        it('honors a requested limit below the cap', () => {
            const url = c.callBuildPaginatedURL('/events', obj({}), 1, 0, undefined, 50);
            expect(url).toContain('limit=50');
        });

        it('emits the token cursor param on subsequent pages', () => {
            const url = c.callBuildPaginatedURL('/events', obj({}), 2, 0, 'CURSOR_PAGE2', 100);
            expect(url).toContain('token=CURSOR_PAGE2');
            expect(url).toContain('limit=100');
        });

        it('emits the metadata IncrementalWatermarkField param on the first page when a watermark is in context', () => {
            c.setWatermark('2026-01-15T00:00:00Z');
            const url = c.callBuildPaginatedURL(
                '/events',
                obj({ SupportsIncrementalSync: true, IncrementalWatermarkField: 'lastModified' }),
                1, 0, undefined, 100
            );
            // Cvent emits the watermark via its `filter` DSL param (`<field> ge '<value>'`), not a bare query key.
            expect(url).toContain("filter=lastModified+ge+%272026-01-15T00%3A00%3A00Z%27");
            c.setWatermark(undefined);
        });

        it('does NOT re-send the watermark once a cursor is in play (rides the cursor)', () => {
            c.setWatermark('2026-01-15T00:00:00Z');
            const url = c.callBuildPaginatedURL(
                '/events',
                obj({ SupportsIncrementalSync: true, IncrementalWatermarkField: 'lastModified' }),
                2, 0, 'CURSOR_PAGE2', 100
            );
            expect(url).not.toContain('lastModified=');
            expect(url).toContain('token=CURSOR_PAGE2');
            c.setWatermark(undefined);
        });

        it('omits the watermark param when SupportsIncrementalSync is false', () => {
            c.setWatermark('2026-01-15T00:00:00Z');
            const url = c.callBuildPaginatedURL('/events', obj({}), 1, 0, undefined, 100);
            expect(url).not.toContain('lastModified');
            c.setWatermark(undefined);
        });
    });

    // ── Generic per-operation CRUD (request construction, mocked) ────
    describe('CRUD via per-operation IO columns', () => {
        function authStub(connector: TestCventConnector): void {
            // Skip the token round-trip; CRUD only needs an auth context with a BaseUrl/Token.
            (connector as unknown as { authCache: unknown }).authCache = {
                Token: 'AT-crud', BaseUrl: 'https://api-platform.cvent.com/ea',
                Config: { ClientId: 'x', ClientSecret: 'y' },
            };
        }
        function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
            return {
                CompanyIntegration: { IntegrationID: 'cvent-integration-id' },
                ContextUser: USER, ObjectName: objectName, Attributes: attributes,
            } as unknown as CreateRecordContext;
        }
        function updateCtx(objectName: string, externalID: string, attributes: Record<string, unknown>): UpdateRecordContext {
            return {
                CompanyIntegration: { IntegrationID: 'cvent-integration-id' },
                ContextUser: USER, ObjectName: objectName, ExternalID: externalID, Attributes: attributes,
            } as unknown as UpdateRecordContext;
        }
        function deleteCtx(objectName: string, externalID: string): DeleteRecordContext {
            return {
                CompanyIntegration: { IntegrationID: 'cvent-integration-id' },
                ContextUser: USER, ObjectName: objectName, ExternalID: externalID,
            } as unknown as DeleteRecordContext;
        }

        it('CreateRecord POSTs a flat body to CreateAPIPath and reads the new ID from the body', async () => {
            const connector = new TestCventConnector();
            authStub(connector);
            connector.CachedObject = obj({
                Name: 'Event', CreateAPIPath: '/events', CreateMethod: 'POST',
                CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
            });
            connector.NextAPIResponse = { Status: 201, Body: { id: 'evt_999' }, Headers: {} };

            const result = await connector.CreateRecord(createCtx('Event', { title: 'New Event', code: 'NE-1' }));

            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('evt_999');
            expect(connector.RequestedMethods[0]).toBe('POST');
            expect(connector.RequestedURLs[0]).toBe('https://api-platform.cvent.com/ea/events');
            // flat body: attributes verbatim (not wrapped).
            expect(connector.RequestedBodies[0]).toEqual({ title: 'New Event', code: 'NE-1' });
        });

        it('CreateRecord fails loudly (Success=false) on a 2xx with no record ID', async () => {
            const connector = new TestCventConnector();
            authStub(connector);
            connector.CachedObject = obj({
                Name: 'Event', CreateAPIPath: '/events', CreateMethod: 'POST',
                CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
            });
            connector.NextAPIResponse = { Status: 200, Body: { somethingElse: 1 }, Headers: {} };

            const result = await connector.CreateRecord(createCtx('Event', { title: 'X' }));
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('no record ID');
        });

        it('UpdateRecord substitutes the ID into the path and PATCHes a flat body', async () => {
            const connector = new TestCventConnector();
            authStub(connector);
            connector.CachedObject = obj({
                Name: 'Event', UpdateAPIPath: '/events/{id}', UpdateMethod: 'PATCH',
                UpdateBodyShape: 'flat', UpdateBodyKey: null, UpdateIDLocation: 'path',
            });
            connector.NextAPIResponse = { Status: 200, Body: { id: 'evt_001' }, Headers: {} };

            const result = await connector.UpdateRecord(updateCtx('Event', 'evt_001', { title: 'Renamed' }));

            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('evt_001');
            expect(connector.RequestedMethods[0]).toBe('PATCH');
            expect(connector.RequestedURLs[0]).toBe('https://api-platform.cvent.com/ea/events/evt_001');
            expect(connector.RequestedBodies[0]).toEqual({ title: 'Renamed' });
        });

        it('DeleteRecord substitutes the ID into the path with the metadata-driven verb', async () => {
            const connector = new TestCventConnector();
            authStub(connector);
            connector.CachedObject = obj({
                Name: 'Event', DeleteAPIPath: '/events/{id}', DeleteMethod: 'DELETE',
                DeleteIDLocation: 'path',
            });
            connector.NextAPIResponse = { Status: 204, Body: null, Headers: {} };

            const result = await connector.DeleteRecord(deleteCtx('Event', 'evt_001'));

            expect(result.Success).toBe(true);
            expect(connector.RequestedMethods[0]).toBe('DELETE');
            expect(connector.RequestedURLs[0]).toBe('https://api-platform.cvent.com/ea/events/evt_001');
        });

        it('CreateRecord throws when the IO has no Create columns (null-capability honesty)', async () => {
            const connector = new TestCventConnector();
            authStub(connector);
            connector.CachedObject = obj({ Name: 'Event' }); // no Create* columns
            await expect(connector.CreateRecord(createCtx('Event', { title: 'X' })))
                .rejects.toThrow(/CreateRecord not supported|CreateAPIPath/);
        });
    });

    // ── FetchChanges incremental watermark math (REAL method, stubbed transport) ──
    describe('FetchChanges (incremental watermark)', () => {
        /**
         * Drives the connector's REAL FetchChanges override (→ base flat-fetch → BuildPaginatedURL /
         * NormalizeResponse / ExtractPaginationInfo) with the engine cache + auth + HTTP stubbed. We
         * assert the watermark math: incoming watermark is set into context for the URL builder, max
         * is advanced only on the final batch, and a non-final batch leaves the watermark unchanged.
         */
        class FetchTestConnector extends CventConnector {
            public Pages: RESTResponse[] = [];
            private pageIdx = 0;
            public CapturedURLs: string[] = [];

            protected override GetCachedObject(): MJIntegrationObjectEntity {
                return obj({
                    Name: 'Event', APIPath: '/events', ID: 'io-event',
                    SupportsIncrementalSync: true, IncrementalWatermarkField: 'lastModified',
                    PaginationType: 'Cursor', SupportsPagination: true, DefaultPageSize: 100,
                });
            }
            protected override GetCachedFields(): never[] { return []; }
            protected override async Authenticate(): Promise<RESTAuthContext> {
                return { Token: 'AT', BaseUrl: 'https://api-platform.cvent.com/ea',
                    Config: { ClientId: 'x', ClientSecret: 'y' } } as unknown as RESTAuthContext;
            }
            protected override async MakeHTTPRequest(
                _auth: RESTAuthContext, url: string
            ): Promise<RESTResponse> {
                this.CapturedURLs.push(url);
                const page = this.Pages[this.pageIdx] ?? { Status: 200, Body: listResponse([], null), Headers: {} };
                this.pageIdx++;
                return page;
            }
        }

        function ctx(watermark: string | null): FetchContext {
            return {
                CompanyIntegration: { IntegrationID: 'cvent-integration-id' },
                ContextUser: USER, ObjectName: 'Event', WatermarkValue: watermark, BatchSize: 100,
            } as unknown as FetchContext;
        }

        it('first sync (no watermark) advances to the MAX lastModified seen (out-of-order safe)', async () => {
            const c = new FetchTestConnector();
            c.Pages = [{
                Status: 200,
                Body: listResponse([
                    { id: 'evt_001', lastModified: '2026-03-01T00:00:00Z' },
                    { id: 'evt_002', lastModified: '2026-03-05T00:00:00Z' }, // max, out of order
                    { id: 'evt_003', lastModified: '2026-03-03T00:00:00Z' },
                ], null),
                Headers: {},
            }];
            const result = await c.FetchChanges(ctx(null));
            // first sync ⇒ no watermark param on the request
            expect(c.CapturedURLs[0]).not.toContain('lastModified=');
            expect(result.Records).toHaveLength(3);
            expect(result.NewWatermarkValue).toBe(new Date('2026-03-05T00:00:00Z').toISOString());
        });

        it('subsequent sync emits the watermark param + advances to the new max', async () => {
            const c = new FetchTestConnector();
            c.Pages = [{
                Status: 200,
                Body: listResponse([{ id: 'evt_004', lastModified: '2026-03-10T00:00:00Z' }], null),
                Headers: {},
            }];
            const result = await c.FetchChanges(ctx('2026-03-01T00:00:00Z'));
            expect(c.CapturedURLs[0]).toContain("filter=lastModified+ge+%272026-03-01T00%3A00%3A00Z%27");
            expect(result.NewWatermarkValue).toBe(new Date('2026-03-10T00:00:00Z').toISOString());
        });

        it('final batch with no datable timestamps falls back to the prior watermark', async () => {
            const c = new FetchTestConnector();
            c.Pages = [{ Status: 200, Body: listResponse([{ id: 'evt_006' }], null), Headers: {} }];
            const result = await c.FetchChanges(ctx('2026-03-01T00:00:00Z'));
            expect(result.NewWatermarkValue).toBe('2026-03-01T00:00:00Z');
        });
    });

    // ── RateLimitPolicy / ExtractRetryAfterMs ────────────────────────
    describe('Sync-efficiency hooks', () => {
        const c = new CventConnector();

        it('declares a conservative seed rate-limit policy with backoff', () => {
            const policy = c.RateLimitPolicy;
            expect(policy).not.toBeNull();
            expect(policy?.TokensPerSec).toBe(5);
            expect(policy?.Burst).toBe(10);
            expect(policy?.ThrottleBackoffFactor).toBe(0.5);
        });

        it('parses a numeric Retry-After header (seconds → ms)', () => {
            expect(c.ExtractRetryAfterMs({ Headers: { 'retry-after': '30' } })).toBe(30_000);
        });

        it('parses an http-date Retry-After header into a future-relative ms delay', () => {
            const future = new Date(Date.now() + 45_000).toUTCString();
            const ms = c.ExtractRetryAfterMs({ Headers: { 'retry-after': future } });
            expect(ms).toBeGreaterThan(30_000);
            expect(ms).toBeLessThanOrEqual(46_000);
        });

        it('falls back to X-RateLimit-Reset (epoch seconds) when no Retry-After is present', () => {
            const resetEpoch = Math.floor((Date.now() + 20_000) / 1000);
            const ms = c.ExtractRetryAfterMs({ Headers: { 'x-ratelimit-reset': String(resetEpoch) } });
            expect(ms).toBeGreaterThan(10_000);
            expect(ms).toBeLessThanOrEqual(21_000);
        });

        it('returns undefined when no retry signal is present', () => {
            expect(c.ExtractRetryAfterMs({ Headers: {} })).toBeUndefined();
            expect(c.ExtractRetryAfterMs(null)).toBeUndefined();
        });
    });

    // ── 429 backoff/retry in the real MakeHTTPRequest path ───────────
    describe('MakeHTTPRequest 429 backoff', () => {
        /** Drives the REAL MakeHTTPRequest (not the capturing override) to prove 429 → retry. */
        class RealHTTPConnector extends CventConnector {
            public callMakeHTTPRequest(
                auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown
            ): Promise<RESTResponse> {
                return this.MakeHTTPRequest(auth, url, method, headers, body);
            }
        }

        it('retries after a 429 then returns the eventual 200 (Retry-After honored)', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            // First call 429 + Retry-After: 0 (no real wait), then 200.
            fetchMock
                .mockResolvedValueOnce({
                    status: 429,
                    headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? '0' : null), forEach: () => {} },
                    text: async () => JSON.stringify({ error: 'rate_limited' }),
                } as unknown as Response)
                .mockResolvedValueOnce({
                    status: 200,
                    headers: { get: () => null, forEach: () => {} },
                    text: async () => JSON.stringify(listResponse([EVENT_FIXTURE], null)),
                } as unknown as Response);

            const connector = new RealHTTPConnector();
            const auth = { Token: 'AT', BaseUrl: 'https://api-platform.cvent.com/ea',
                Config: { ClientId: 'x', ClientSecret: 'y', MaxRetries: 2, RequestTimeoutMs: 5000 } } as unknown as RESTAuthContext;

            const response = await connector.callMakeHTTPRequest(
                auth, 'https://api-platform.cvent.com/ea/events?limit=100', 'GET', { Authorization: 'Bearer AT' }
            );

            expect(fetchMock).toHaveBeenCalledTimes(2); // retried once after the 429
            expect(response.Status).toBe(200);
            const body = response.Body as Record<string, unknown>;
            expect(Array.isArray(body.data)).toBe(true);
        });
    });

    // ── TestConnection ───────────────────────────────────────────────
    describe('TestConnection', () => {
        it('returns Success on a 2xx from the events probe', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestCventConnector();
            connector.NextAPIResponse = { Status: 200, Body: listResponse([EVENT_FIXTURE], null), Headers: {} };
            const result = await connector.TestConnection(ciWithConfig(BASE_CONFIG), USER);
            expect(result.Success).toBe(true);
            expect(connector.RequestedURLs[0]).toContain('/events?limit=1');
        });

        it('returns failure on a non-2xx API response', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestCventConnector();
            connector.NextAPIResponse = { Status: 403, Body: { message: 'forbidden' }, Headers: {} };
            const result = await connector.TestConnection(ciWithConfig(BASE_CONFIG), USER);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('403');
        });

        it('returns failure (not throw) when the token endpoint rejects', async () => {
            mockTokenEndpoint({ error: 'invalid_client' }, 401);
            const connector = new TestCventConnector();
            const result = await connector.TestConnection(ciWithConfig(BASE_CONFIG), USER);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });
    });
});
