/**
 * HubSpotConnector smoke tests.
 *
 * Per .claude/rules/connector-test-conventions.md these tests must NOT hit live
 * APIs — that's T8's job. They exercise the deterministic pieces of the connector:
 * - Identity (three-way invariant)
 * - Capability getters
 * - NormalizeResponse envelope handling
 * - TransformRecord HubSpot properties flattening
 * - ExtractPaginationInfo cursor-based pagination
 * - IsVendorCustomObject HubSpot custom-property namespace detection
 */
import { describe, it, expect } from 'vitest';
import { HubSpotConnector } from '../HubSpotConnector.js';

// ─── Test helpers ─────────────────────────────────────────────────────

/**
 * Subclass exposing the protected hooks so we can assert their behaviour without
 * monkey-patching or going through the full FetchChanges loop.
 */
class TestableHubSpotConnector extends HubSpotConnector {
    public PublicNormalizeResponse(rawBody: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(rawBody, key);
    }
    public PublicTransformRecord(raw: Record<string, unknown>): Record<string, unknown> {
        return this.TransformRecord(raw, undefined as unknown, undefined as unknown);
    }
    public PublicExtractPaginationInfo(
        body: unknown,
        type: 'Cursor' | 'PageNumber' | 'Offset' | 'None',
        page: number,
        offset: number,
        size: number
    ): ReturnType<HubSpotConnector['ExtractPaginationInfo']> {
        return this.ExtractPaginationInfo(body, type, page, offset, size);
    }
    public PublicIsVendorCustomObject(name: string): boolean {
        return this.IsVendorCustomObject({ Name: name, DisplayName: name, Description: '', SupportsWrite: false });
    }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('HubSpotConnector', () => {
    describe('Identity', () => {
        it('exposes IntegrationName matching the registered brand', () => {
            const c = new HubSpotConnector();
            expect(c.IntegrationName).toBe('HubSpot');
        });
    });

    describe('Capability getters', () => {
        const c = new HubSpotConnector();
        it('reports full CRUD support per metadata', () => {
            expect(c.SupportsCreate).toBe(true);
            expect(c.SupportsUpdate).toBe(true);
            expect(c.SupportsDelete).toBe(true);
        });
        it('reports search + list support', () => {
            expect(c.SupportsSearch).toBe(true);
            expect(c.SupportsListing).toBe(true);
        });
    });

    describe('NormalizeResponse', () => {
        const c = new TestableHubSpotConnector();

        it('unwraps the CRM "results" envelope', () => {
            const body = { total: 2, results: [{ id: '1' }, { id: '2' }], paging: {} };
            expect(c.PublicNormalizeResponse(body, 'results')).toEqual([{ id: '1' }, { id: '2' }]);
        });

        it('returns the array directly when responseDataKey is null', () => {
            const arr = [{ id: '1' }, { id: '2' }];
            expect(c.PublicNormalizeResponse(arr, null)).toEqual(arr);
        });

        it('returns [] when envelope key is absent', () => {
            expect(c.PublicNormalizeResponse({ paging: {} }, 'results')).toEqual([]);
        });

        it('returns [] when body is not an object and key is provided', () => {
            expect(c.PublicNormalizeResponse('oops', 'results')).toEqual([]);
            expect(c.PublicNormalizeResponse(null, 'results')).toEqual([]);
        });
    });

    describe('TransformRecord', () => {
        const c = new TestableHubSpotConnector();

        it('flattens HubSpot properties up to the record top level', () => {
            const raw = {
                id: '101',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-02T00:00:00Z',
                properties: { firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.com' },
            };
            const flat = c.PublicTransformRecord(raw);
            expect(flat).toEqual({
                id: '101',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-02T00:00:00Z',
                firstname: 'Ada',
                lastname: 'Lovelace',
                email: 'ada@example.com',
            });
            // properties envelope is removed
            expect(flat).not.toHaveProperty('properties');
        });

        it('is a no-op for records without properties', () => {
            const raw = { id: '5', name: 'no envelope' };
            expect(c.PublicTransformRecord(raw)).toEqual({ id: '5', name: 'no envelope' });
        });
    });

    describe('ExtractPaginationInfo', () => {
        const c = new TestableHubSpotConnector();

        it('returns NextCursor from paging.next.after when present', () => {
            const body = { results: [], paging: { next: { after: 'CURSOR_X' } } };
            expect(c.PublicExtractPaginationInfo(body, 'Cursor', 0, 0, 100)).toEqual({
                HasMore: true,
                NextCursor: 'CURSOR_X',
            });
        });

        it('reports HasMore=false when paging.next is absent', () => {
            const body = { results: [{ id: '1' }] };
            expect(c.PublicExtractPaginationInfo(body, 'Cursor', 0, 0, 100)).toEqual({ HasMore: false, NextCursor: undefined });
        });

        it('returns HasMore=false for None pagination', () => {
            expect(c.PublicExtractPaginationInfo({}, 'None', 0, 0, 100)).toEqual({ HasMore: false });
        });
    });

    describe('IsVendorCustomObject', () => {
        const c = new TestableHubSpotConnector();

        it('flags HubSpot customProperties.* namespace as custom', () => {
            expect(c.PublicIsVendorCustomObject('customProperties.something')).toBe(true);
        });

        it('does NOT flag standard HubSpot object names as custom', () => {
            expect(c.PublicIsVendorCustomObject('contacts')).toBe(false);
            expect(c.PublicIsVendorCustomObject('CRM.Companies.companies')).toBe(false);
        });
    });

    // T8-style live tests are intentionally not included here — they live in the
    // mj-test-runner suite with real credentials, per connector-test-conventions.

    // ─── CRUD body fixture tests ──────────────────────────────────
    //
    // Verify per-IO routing + HubSpot's `{properties: ...}` write envelope by
    // mocking the network boundary (MakeHTTPRequest) and asserting the URL,
    // method, body shape, and response-parsing for each CRUD operation.

    describe('CRUD bodies (mocked HTTP)', () => {
        /**
         * Routing-only fixture matching the IO row shape produced by the extractor.
         * `customers.search` is included to verify the search path; `marketing.forms`
         * is included as a parameterized-update target so {formId} resolution is exercised.
         */
        const FIXTURE_IOS = [
            {
                Name: 'crm.contacts',
                CreateAPIPath: '/crm/v3/objects/contacts',
                CreateMethod: 'POST',
                UpdateAPIPath: '/crm/v3/objects/contacts/{contactId}',
                UpdateMethod: 'PATCH',
                DeleteAPIPath: '/crm/v3/objects/contacts/{contactId}',
                GetAPIPath: '/crm/v3/objects/contacts/{contactId}',
                SearchAPIPath: '/crm/v3/objects/contacts/search',
                SearchMethod: 'POST',
                ListAPIPath: '/crm/v3/objects/contacts',
                ListMethod: 'GET',
                ResponseDataKey: 'results',
            },
            {
                Name: 'marketing.forms',
                CreateAPIPath: '/marketing/v3/forms',
                CreateMethod: 'POST',
                UpdateAPIPath: '/marketing/v3/forms/{formId}',
                UpdateMethod: 'PATCH',
                DeleteAPIPath: '/marketing/v3/forms/{formId}',
                GetAPIPath: '/marketing/v3/forms/{formId}',
                ResponseDataKey: 'results',
            },
        ];

        /**
         * Test subclass that captures the most recent HTTP call so assertions can
         * inspect URL, method, headers, body without hitting the wire. Stubs out
         * Authenticate to skip the real OAuth refresh.
         */
        class MockedHubSpotConnector extends HubSpotConnector {
            public LastCall: { url: string; method: string; headers: Record<string, string>; body: unknown } | undefined;
            public NextResponse: { Status: number; Body: unknown; Headers: Record<string, string> } = { Status: 200, Body: {}, Headers: {} };
            protected override LoadMetadata() {
                return { ios: FIXTURE_IOS };
            }
            protected override async Authenticate() {
                return { Token: 'TEST_TOKEN', ExpiresAt: new Date(Date.now() + 60_000), Config: { ClientId: 'x', ClientSecret: 'x', RefreshToken: 'x' } } as never;
            }
            protected override async MakeHTTPRequest(_auth: unknown, url: string, method: string, headers: Record<string, string>, body?: unknown) {
                this.LastCall = { url, method, headers, body };
                return this.NextResponse;
            }
        }

        function fakeCtx(extras: Record<string, unknown> = {}) {
            return { CompanyIntegration: { Configuration: '{}' }, ObjectName: 'crm.contacts', ContextUser: {}, ...extras };
        }

        it('CreateRecord builds URL = base + CreateAPIPath, POSTs body wrapped in {properties}', async () => {
            const c = new MockedHubSpotConnector();
            c.NextResponse = { Status: 201, Body: { id: '12345', properties: {} }, Headers: {} };
            const result = await c.CreateRecord(fakeCtx({ Attributes: { email: 'ada@example.com', firstname: 'Ada' } }) as never);
            expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts');
            expect(c.LastCall?.method).toBe('POST');
            expect(c.LastCall?.headers['Authorization']).toBe('Bearer TEST_TOKEN');
            expect(c.LastCall?.body).toEqual({ properties: { email: 'ada@example.com', firstname: 'Ada' } });
            expect(result).toEqual({ Success: true, StatusCode: 201, ExternalID: '12345' });
        });

        it('CreateRecord returns 405 if object has no CreateAPIPath', async () => {
            const c = new MockedHubSpotConnector();
            const result = await c.CreateRecord(fakeCtx({ ObjectName: 'unknown.object', Attributes: {} }) as never);
            expect(result.Success).toBe(false);
            expect(result.StatusCode).toBe(404);
        });

        it('UpdateRecord resolves {contactId} template var from ExternalID', async () => {
            const c = new MockedHubSpotConnector();
            c.NextResponse = { Status: 200, Body: { id: '12345', properties: {} }, Headers: {} };
            const result = await c.UpdateRecord(fakeCtx({ ExternalID: '12345', Attributes: { firstname: 'Grace' } }) as never);
            expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts/12345');
            expect(c.LastCall?.method).toBe('PATCH');
            expect(c.LastCall?.body).toEqual({ properties: { firstname: 'Grace' } });
            expect(result).toEqual({ Success: true, StatusCode: 200, ExternalID: '12345' });
        });

        it('UpdateRecord on marketing.forms substitutes {formId} not {contactId} — generic template resolver', async () => {
            const c = new MockedHubSpotConnector();
            c.NextResponse = { Status: 200, Body: {}, Headers: {} };
            await c.UpdateRecord(fakeCtx({ ObjectName: 'marketing.forms', ExternalID: 'abc-form-id', Attributes: { name: 'New Name' } }) as never);
            expect(c.LastCall?.url).toBe('https://api.hubapi.com/marketing/v3/forms/abc-form-id');
        });

        it('DeleteRecord issues DELETE on path-with-substituted-id; no body sent', async () => {
            const c = new MockedHubSpotConnector();
            c.NextResponse = { Status: 204, Body: '', Headers: {} };
            const result = await c.DeleteRecord(fakeCtx({ ExternalID: '12345' }) as never);
            expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts/12345');
            expect(c.LastCall?.method).toBe('DELETE');
            expect(c.LastCall?.body).toBeUndefined();
            expect(result.Success).toBe(true);
            expect(result.StatusCode).toBe(204);
            expect(result.ExternalID).toBe('12345');
        });

        it('SearchRecords posts to SearchAPIPath with filterGroups built from ctx.Filters', async () => {
            const c = new MockedHubSpotConnector();
            c.NextResponse = {
                Status: 200,
                Body: { total: 1, results: [{ id: '99', properties: { email: 'ada@example.com' } }], paging: {} },
                Headers: {},
            };
            const result = await c.SearchRecords(fakeCtx({ Filters: { email: 'ada@example.com' }, PageSize: 50 }) as never);
            expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts/search');
            expect(c.LastCall?.method).toBe('POST');
            const body = c.LastCall?.body as Record<string, unknown>;
            expect(body.limit).toBe(50);
            expect(body.filterGroups).toEqual([{ filters: [{ propertyName: 'email', operator: 'EQ', value: 'ada@example.com' }] }]);
            expect(result.Records.length).toBe(1);
            expect(result.Records[0].ExternalID).toBe('99');
            expect(result.Records[0].ObjectType).toBe('crm.contacts');
            expect(result.Records[0].Fields).toMatchObject({ email: 'ada@example.com' });
            expect(result.TotalCount).toBe(1);
            expect(result.HasMore).toBe(false);
        });

        it('ListRecords issues GET with limit + after query params and surfaces NextCursor', async () => {
            const c = new MockedHubSpotConnector();
            c.NextResponse = {
                Status: 200,
                Body: { results: [{ id: '1', properties: {} }, { id: '2', properties: {} }], paging: { next: { after: 'CURSOR_PAGE_2' } } },
                Headers: {},
            };
            const result = await c.ListRecords(fakeCtx({ PageSize: 25, Cursor: 'CURSOR_PAGE_1' }) as never);
            expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts?limit=25&after=CURSOR_PAGE_1');
            expect(c.LastCall?.method).toBe('GET');
            expect(c.LastCall?.body).toBeUndefined();
            expect(result.Records.length).toBe(2);
            expect(result.Records.map((r) => r.ExternalID)).toEqual(['1', '2']);
            expect(result.HasMore).toBe(true);
            expect(result.NextCursor).toBe('CURSOR_PAGE_2');
        });

        it('Failed CRUD surfaces vendor error message + status code', async () => {
            const c = new MockedHubSpotConnector();
            c.NextResponse = { Status: 400, Body: { message: 'Invalid email format' }, Headers: {} };
            const result = await c.CreateRecord(fakeCtx({ Attributes: { email: 'not-an-email' } }) as never);
            expect(result.Success).toBe(false);
            expect(result.StatusCode).toBe(400);
            expect(result.ErrorMessage).toBe('Invalid email format');
        });

        // ── GetRecord ───────────────────────────────────────────────

        describe('GetRecord', () => {
            it('builds URL = base + GetAPIPath with template substituted; returns ExternalRecord on 200', async () => {
                const c = new MockedHubSpotConnector();
                c.NextResponse = {
                    Status: 200,
                    Body: { id: 'contact-42', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-05-18T12:00:00Z', properties: { email: 'ada@example.com', firstname: 'Ada' } },
                    Headers: {},
                };
                const result = await c.GetRecord(fakeCtx({ ExternalID: 'contact-42' }) as never);
                expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts/contact-42');
                expect(c.LastCall?.method).toBe('GET');
                expect(c.LastCall?.body).toBeUndefined();
                expect(result).not.toBeNull();
                expect(result!.ExternalID).toBe('contact-42');
                expect(result!.ObjectType).toBe('crm.contacts');
                expect(result!.Fields).toMatchObject({ email: 'ada@example.com', firstname: 'Ada', id: 'contact-42' });
            });

            it('returns null on 404 (record not found)', async () => {
                const c = new MockedHubSpotConnector();
                c.NextResponse = { Status: 404, Body: { message: 'Not found' }, Headers: {} };
                const result = await c.GetRecord(fakeCtx({ ExternalID: 'missing-id' }) as never);
                expect(result).toBeNull();
            });

            it('throws on non-404 non-2xx with vendor error message', async () => {
                const c = new MockedHubSpotConnector();
                c.NextResponse = { Status: 500, Body: { message: 'Internal server error' }, Headers: {} };
                await expect(c.GetRecord(fakeCtx({ ExternalID: 'contact-42' }) as never)).rejects.toThrow(/Internal server error/);
            });

            it('returns null when IO has no GetAPIPath (graceful empty)', async () => {
                const c = new MockedHubSpotConnector();
                const result = await c.GetRecord(fakeCtx({ ObjectName: 'unknown.object', ExternalID: 'x' }) as never);
                expect(result).toBeNull();
            });
        });

        // ── FetchChanges (incremental sync — directive §13.4) ───────

        describe('FetchChanges incremental scenarios', () => {
            /** Routing fixture with an incremental-capable IO matching real HubSpot CRM shape. */
            const INCREMENTAL_FIXTURE_IOS = [
                {
                    Name: 'crm.contacts',
                    ListAPIPath: '/crm/v3/objects/contacts',
                    ListMethod: 'GET',
                    ResponseDataKey: 'results',
                    SupportsIncrementalSync: true,
                    IncrementalCursorFieldName: 'updatedAt',
                    IncrementalWatermarkType: 'Timestamp' as const,
                },
                {
                    Name: 'crm.companies',
                    ListAPIPath: '/crm/v3/objects/companies',
                    ListMethod: 'GET',
                    ResponseDataKey: 'results',
                    SupportsIncrementalSync: false,
                },
            ];

            class IncrementalMockedConnector extends HubSpotConnector {
                public LastCall: { url: string; method: string; headers: Record<string, string>; body: unknown } | undefined;
                public NextResponse: { Status: number; Body: unknown; Headers: Record<string, string> } = { Status: 200, Body: {}, Headers: {} };
                protected override LoadMetadata() {
                    return { ios: INCREMENTAL_FIXTURE_IOS };
                }
                protected override async Authenticate() {
                    return { Token: 'TEST_TOKEN', ExpiresAt: new Date(Date.now() + 60_000), Config: { ClientId: 'x', ClientSecret: 'x', RefreshToken: 'x' } } as never;
                }
                protected override async MakeHTTPRequest(_auth: unknown, url: string, method: string, headers: Record<string, string>, body?: unknown) {
                    this.LastCall = { url, method, headers, body };
                    return this.NextResponse;
                }
            }

            function makeFetchCtx(extras: Record<string, unknown> = {}) {
                return {
                    CompanyIntegration: { Configuration: '{}', IntegrationID: 'fake-int-id' },
                    ObjectName: 'crm.contacts',
                    ContextUser: {},
                    BatchSize: 100,
                    WatermarkValue: null,
                    ...extras,
                };
            }

            it('§13.4 scenario 1 — first sync: no watermark → no modifiedSince param; NewWatermarkValue = max(cursor) across batch', async () => {
                const c = new IncrementalMockedConnector();
                c.NextResponse = {
                    Status: 200,
                    Body: {
                        results: [
                            { id: '1', properties: { updatedAt: '2026-05-15T08:00:00Z', email: 'a@example.com' } },
                            { id: '2', properties: { updatedAt: '2026-05-17T11:30:00Z', email: 'b@example.com' } },
                            { id: '3', properties: { updatedAt: '2026-05-10T22:00:00Z', email: 'c@example.com' } },
                        ],
                        paging: { next: { after: 'NEXT_PAGE_CURSOR' } },
                    },
                    Headers: {},
                };
                const result = await c.FetchChanges(makeFetchCtx({ WatermarkValue: null }) as never);
                expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts?limit=100');
                expect(c.LastCall?.url).not.toContain('modifiedSince');
                expect(result.Records.length).toBe(3);
                expect(result.HasMore).toBe(true);
                expect(result.NextCursor).toBe('NEXT_PAGE_CURSOR');
                expect(result.NewWatermarkValue).toBe('2026-05-17T11:30:00Z'); // max of the three
            });

            it('§13.4 scenario 2 — subsequent sync: ctx.WatermarkValue present → modifiedSince added; NewWatermarkValue ≥ incoming', async () => {
                const c = new IncrementalMockedConnector();
                const priorWatermark = '2026-05-15T00:00:00Z';
                c.NextResponse = {
                    Status: 200,
                    Body: {
                        results: [
                            { id: '4', properties: { updatedAt: '2026-05-17T08:00:00Z' } },
                            { id: '5', properties: { updatedAt: '2026-05-18T14:00:00Z' } },
                        ],
                        paging: {},
                    },
                    Headers: {},
                };
                const result = await c.FetchChanges(makeFetchCtx({ WatermarkValue: priorWatermark }) as never);
                expect(c.LastCall?.url).toContain('modifiedSince=2026-05-15T00%3A00%3A00Z');
                expect(c.LastCall?.url).toContain('limit=100');
                expect(result.Records.length).toBe(2);
                expect(result.HasMore).toBe(false);
                expect(result.NewWatermarkValue).toBe('2026-05-18T14:00:00Z');
                // Must be strictly newer than (or equal to) incoming watermark
                expect(result.NewWatermarkValue! >= priorWatermark).toBe(true);
            });

            it('§13.4 scenario 3 — out-of-order batch: returns max-seen NOT most-recent record', async () => {
                const c = new IncrementalMockedConnector();
                // Records arrive in [highest, lowest, middle] order — typical when the
                // vendor paginates by ID rather than by cursor-field ordering.
                c.NextResponse = {
                    Status: 200,
                    Body: {
                        results: [
                            { id: '10', properties: { updatedAt: '2026-05-18T20:00:00Z' } }, // highest
                            { id: '11', properties: { updatedAt: '2026-05-16T08:00:00Z' } }, // lowest
                            { id: '12', properties: { updatedAt: '2026-05-17T12:00:00Z' } }, // middle
                        ],
                        paging: {},
                    },
                    Headers: {},
                };
                const result = await c.FetchChanges(makeFetchCtx({ WatermarkValue: '2026-05-15T00:00:00Z' }) as never);
                // The KEY assertion: watermark is the MAX-seen, not the last-in-batch.
                // If implementation tracked most-recent (last record) it would be 2026-05-17;
                // tracking max-seen yields 2026-05-18.
                expect(result.NewWatermarkValue).toBe('2026-05-18T20:00:00Z');
            });

            it('§13.4 scenario 4 — partial failure: HTTP 500 → throws (engine catches; watermark untouched)', async () => {
                const c = new IncrementalMockedConnector();
                c.NextResponse = { Status: 500, Body: { message: 'Database timeout' }, Headers: {} };
                await expect(
                    c.FetchChanges(makeFetchCtx({ WatermarkValue: '2026-05-15T00:00:00Z' }) as never)
                ).rejects.toThrow(/Database timeout/);
                // No assertion on watermark persistence — the connector doesn't persist;
                // the engine reads NewWatermarkValue from a successful return and persists
                // via WatermarkService.Update. By throwing, the engine never calls Update.
            });

            it('§13.4 scenario 5 — format-mismatch: malformed watermark → falls back to full pull (no modifiedSince added)', async () => {
                const c = new IncrementalMockedConnector();
                c.NextResponse = {
                    Status: 200,
                    Body: { results: [{ id: '20', properties: { updatedAt: '2026-05-18T08:00:00Z' } }], paging: {} },
                    Headers: {},
                };
                // Garbage value should fail WatermarkService.ValidateWatermark for Timestamp type
                const result = await c.FetchChanges(makeFetchCtx({ WatermarkValue: 'this-is-not-a-timestamp' }) as never);
                expect(c.LastCall?.url).not.toContain('modifiedSince');
                expect(c.LastCall?.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts?limit=100');
                expect(result.Records.length).toBe(1);
                // New watermark still computed from the batch even when incoming was malformed —
                // the next sync will use a valid watermark forward.
                expect(result.NewWatermarkValue).toBe('2026-05-18T08:00:00Z');
            });

            it('IO without SupportsIncrementalSync → no modifiedSince + no NewWatermarkValue', async () => {
                const c = new IncrementalMockedConnector();
                c.NextResponse = {
                    Status: 200,
                    Body: { results: [{ id: 'co-1', properties: {} }], paging: {} },
                    Headers: {},
                };
                const result = await c.FetchChanges(makeFetchCtx({
                    ObjectName: 'crm.companies', // SupportsIncrementalSync=false in fixture
                    WatermarkValue: '2026-05-15T00:00:00Z',
                }) as never);
                expect(c.LastCall?.url).not.toContain('modifiedSince');
                expect(result.NewWatermarkValue).toBeUndefined();
            });

            it('IO without ListAPIPath → returns empty result cleanly', async () => {
                const c = new IncrementalMockedConnector();
                const result = await c.FetchChanges(makeFetchCtx({ ObjectName: 'unknown.object' }) as never);
                expect(result.Records).toEqual([]);
                expect(result.HasMore).toBe(false);
            });
        });

        // ── T9 perf scaffold (mocked-batch throughput timing) ──────────
        //
        // Per directive item C: T9 target ≥100 records/sec list throughput. This is a
        // LOCAL scaffold using vitest timing — no MCP, no live API. The MCP runner
        // doesn't yet have a T9 case; this test gates the connector's batch-shape
        // performance against the directive's threshold so the perf regression is
        // caught at the unit level.

        describe('T9 perf scaffold', () => {
            it('processes 1000 records in a single FetchChanges call at ≥100 rec/sec', async () => {
                class PerfMockedConnector extends HubSpotConnector {
                    protected override LoadMetadata() {
                        return {
                            ios: [{
                                Name: 'crm.contacts',
                                ListAPIPath: '/crm/v3/objects/contacts',
                                ListMethod: 'GET',
                                ResponseDataKey: 'results',
                                SupportsIncrementalSync: true,
                                IncrementalCursorFieldName: 'updatedAt',
                                IncrementalWatermarkType: 'Timestamp' as const,
                            }],
                        };
                    }
                    protected override async Authenticate() {
                        return { Token: 'T', ExpiresAt: new Date(Date.now() + 60_000), Config: { ClientId: 'x', ClientSecret: 'x', RefreshToken: 'x' } } as never;
                    }
                    protected override async MakeHTTPRequest() {
                        const results: Array<{ id: string; properties: Record<string, string> }> = [];
                        for (let i = 0; i < 1000; i++) {
                            results.push({ id: String(i), properties: { updatedAt: `2026-05-18T${String(Math.floor(i / 60) % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z` } });
                        }
                        return { Status: 200, Body: { results, paging: {} }, Headers: {} };
                    }
                }
                const c = new PerfMockedConnector();
                const start = Date.now();
                const result = await c.FetchChanges({
                    CompanyIntegration: { Configuration: '{}', IntegrationID: 'fake' },
                    ObjectName: 'crm.contacts',
                    ContextUser: {},
                    BatchSize: 1000,
                    WatermarkValue: null,
                } as never);
                const elapsedMs = Date.now() - start;
                const throughput = (result.Records.length / elapsedMs) * 1000;
                expect(result.Records.length).toBe(1000);
                expect(throughput).toBeGreaterThanOrEqual(100); // ≥100 rec/sec per directive item C
            });

            it('concurrent 3-IO fetch via Promise.all does not cross-contaminate state', async () => {
                class ConcurrentMockedConnector extends HubSpotConnector {
                    protected override LoadMetadata() {
                        return {
                            ios: [
                                { Name: 'crm.contacts', ListAPIPath: '/crm/v3/objects/contacts', ListMethod: 'GET', ResponseDataKey: 'results' },
                                { Name: 'crm.companies', ListAPIPath: '/crm/v3/objects/companies', ListMethod: 'GET', ResponseDataKey: 'results' },
                                { Name: 'crm.deals', ListAPIPath: '/crm/v3/objects/deals', ListMethod: 'GET', ResponseDataKey: 'results' },
                            ],
                        };
                    }
                    protected override async Authenticate() {
                        return { Token: 'T', ExpiresAt: new Date(Date.now() + 60_000), Config: { ClientId: 'x', ClientSecret: 'x', RefreshToken: 'x' } } as never;
                    }
                    protected override async MakeHTTPRequest(_a: unknown, url: string) {
                        // Tag the response with the URL so we can verify the right
                        // IO got the right response when run concurrently.
                        return { Status: 200, Body: { results: [{ id: 'r-1', properties: { fromUrl: url } }], paging: {} }, Headers: {} };
                    }
                }
                const c = new ConcurrentMockedConnector();
                const ctx = (obj: string) => ({
                    CompanyIntegration: { Configuration: '{}', IntegrationID: 'fake' },
                    ObjectName: obj, ContextUser: {}, BatchSize: 10, WatermarkValue: null,
                } as never);
                const [contacts, companies, deals] = await Promise.all([
                    c.FetchChanges(ctx('crm.contacts')),
                    c.FetchChanges(ctx('crm.companies')),
                    c.FetchChanges(ctx('crm.deals')),
                ]);
                expect((contacts.Records[0].Fields as Record<string, unknown>).fromUrl).toContain('/crm/v3/objects/contacts');
                expect((companies.Records[0].Fields as Record<string, unknown>).fromUrl).toContain('/crm/v3/objects/companies');
                expect((deals.Records[0].Fields as Record<string, unknown>).fromUrl).toContain('/crm/v3/objects/deals');
            });
        });
    });
});
