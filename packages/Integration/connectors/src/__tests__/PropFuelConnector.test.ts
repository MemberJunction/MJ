import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTResponse,
    FetchContext,
    ExternalObjectSchema,
} from '@memberjunction/integration-engine';
import { PropFuelConnector, parseFileName, compareMicrotime } from '../PropFuelConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

/**
 * READ-ONLY / MOCKED-ONLY test connector. Overrides the auth + HTTP transport seams so no test ever
 * touches the live PropFuel API and no mutation occurs. The connector is pull-only (no ack/POST), so
 * there is no write path to test. The harness routes each GET by URL to a canned response and records
 * every requested URL for assertion (proving the discovery MECHANISM hits /list and /download).
 */
class TestPropFuelConnector extends PropFuelConnector {
    /** URL → canned response. */
    public Routes = new Map<string, RESTResponse>();
    /** Every URL the connector requested, in order. */
    public RequestedURLs: string[] = [];
    /** Fixed credentials returned by Authenticate (no live credential load). */
    public TestToken = 'test-token';
    public TestAccountID = '2019';

    protected override async Authenticate(): Promise<{ Token: string; AccountID: string }> {
        return { Token: this.TestToken, AccountID: this.TestAccountID };
    }

    protected override async MakeHTTPRequest(
        _auth: { Token: string; AccountID: string },
        url: string,
        _method: string,
        _headers: Record<string, string>
    ): Promise<RESTResponse> {
        this.RequestedURLs.push(url);
        const canned = this.Routes.get(url);
        if (!canned) {
            return { Status: 404, Body: { message: `no canned response for ${url}` }, Headers: {} };
        }
        return canned;
    }
}

const ACCOUNT = '2019';
const BASE = `https://app.propfuel.com/dataexport/${ACCOUNT}`;
const LIST_URL = `${BASE}/list`;
const downloadURL = (file: string) => `${BASE}/download/${encodeURIComponent(file)}`;

function listResponse(files: unknown): RESTResponse {
    return { Status: 200, Body: files, Headers: { 'content-type': 'application/json' } };
}
function fileResponse(records: unknown): RESTResponse {
    return { Status: 200, Body: records, Headers: { 'content-type': 'application/json' } };
}

const companyIntegration = {} as unknown as MJCompanyIntegrationEntity;
const contextUser = {} as unknown as UserInfo;

describe('PropFuelConnector', () => {
    let connector: TestPropFuelConnector;
    beforeEach(() => {
        connector = new TestPropFuelConnector();
        connector.TestAccountID = ACCOUNT;
    });

    describe('Identity & capabilities', () => {
        it('IntegrationName getter is the verbatim canonical name', () => {
            expect(connector.IntegrationName).toBe('PropFuel');
        });

        it('the real connector class is named PropFuelConnector', () => {
            expect(new PropFuelConnector().constructor.name).toBe('PropFuelConnector');
        });

        it('is read-only: no create/update/delete capability', () => {
            expect(connector.SupportsCreate).toBe(false);
            expect(connector.SupportsUpdate).toBe(false);
            expect(connector.SupportsDelete).toBe(false);
            expect(connector.SupportsGet).toBe(true);
        });

        it('StableOrderingKey is the microtime cursor for every object', () => {
            expect(connector.StableOrderingKey('checkin_questions')).toBe('microtime');
            expect(connector.StableOrderingKey('anything_else')).toBe('microtime');
        });
    });

    describe('parseFileName (mechanism, not a catalog)', () => {
        it('parses [microtime]-[datatype].json', () => {
            expect(parseFileName('1717804800.123456-checkin_questions.json')).toEqual({
                microtime: '1717804800.123456',
                dataType: 'checkin_questions',
            });
        });
        it('parses integer microtime + a data type with internal dashes', () => {
            expect(parseFileName('1717804800-some-data-type.json')).toEqual({
                microtime: '1717804800',
                dataType: 'some-data-type',
            });
        });
        it('strips a path prefix', () => {
            expect(parseFileName('exports/1717.0-opens.json')?.dataType).toBe('opens');
        });
        it('rejects names that do not match the convention', () => {
            expect(parseFileName('not-a-microtime.json')).toBeNull();
            expect(parseFileName('1717804800.json')).toBeNull();
            expect(parseFileName('')).toBeNull();
        });
    });

    describe('compareMicrotime', () => {
        it('orders chronologically by numeric value (not lexically)', () => {
            expect(compareMicrotime('200', '1000')).toBeLessThan(0); // numeric, not '200' > '1000'
            expect(compareMicrotime('1717804801', '1717804800')).toBeGreaterThan(0);
            expect(compareMicrotime('1717.5', '1717.5')).toBe(0);
        });
    });

    describe('DiscoverObjects — runtime mechanism (no static catalog)', () => {
        it('derives objects from whatever data-types the live listing actually contains', async () => {
            connector.Routes.set(LIST_URL, listResponse([
                '1717804800.1-checkin_questions.json',
                '1717804801.2-opens.json',
                '1717804802.3-clicks.json',
                '1717804803.4-opens.json', // duplicate datatype → one object
            ]));
            const objects = await connector.DiscoverObjects(companyIntegration, contextUser);
            const names = objects.map((o: ExternalObjectSchema) => o.Name).sort();
            expect(names).toEqual(['checkin_questions', 'clicks', 'opens']);
            expect(connector.RequestedURLs).toContain(LIST_URL); // proves it CALLED /list at runtime
        });

        it('reflects a DIFFERENT data-type set when the listing differs (proves no baked answer)', async () => {
            connector.Routes.set(LIST_URL, listResponse([
                '1717804800.1-survey_responses.json',
                '1717804801.2-bounces.json',
            ]));
            const objects = await connector.DiscoverObjects(companyIntegration, contextUser);
            expect(objects.map(o => o.Name).sort()).toEqual(['bounces', 'survey_responses']);
        });

        it('marks objects as incremental + read-only', async () => {
            connector.Routes.set(LIST_URL, listResponse(['1717804800.1-opens.json']));
            const [obj] = await connector.DiscoverObjects(companyIntegration, contextUser);
            expect(obj.SupportsIncrementalSync).toBe(true);
            expect(obj.SupportsWrite).toBe(false);
        });

        it('handles a listing wrapped in an object with objects-with-name entries', async () => {
            connector.Routes.set(LIST_URL, listResponse({ files: [
                { name: '1717804800.1-opens.json' },
                { name: '1717804801.2-clicks.json' },
            ]}));
            const objects = await connector.DiscoverObjects(companyIntegration, contextUser);
            expect(objects.map(o => o.Name).sort()).toEqual(['clicks', 'opens']);
        });
    });

    describe('DiscoverFields — samples a real file (no frozen field catalog)', () => {
        it('downloads the most-recent file of the type and emits its key names', async () => {
            const file = '1717804802.9-opens.json';
            connector.Routes.set(LIST_URL, listResponse([
                '1717804800.1-opens.json',
                file, // most recent → chosen as the sample
                '1717804801.5-clicks.json',
            ]));
            connector.Routes.set(downloadURL(file), fileResponse([
                { id: 'o1', email: 'a@example.com', opened_at: '2026-01-01' },
                { id: 'o2', email: 'b@example.com', opened_at: '2026-01-02' },
            ]));
            const fields = await connector.DiscoverFields(companyIntegration, 'opens', contextUser);
            const names = fields.map(f => f.Name).sort();
            expect(names).toEqual(['email', 'id', 'opened_at']);
            expect(connector.RequestedURLs).toContain(downloadURL(file)); // proves it SAMPLED a file
        });

        it('marks discovered fields read-only', async () => {
            const file = '1717804800.1-opens.json';
            connector.Routes.set(LIST_URL, listResponse([file]));
            connector.Routes.set(downloadURL(file), fileResponse([{ id: 'o1', name: 'x' }]));
            const fields = await connector.DiscoverFields(companyIntegration, 'opens', contextUser);
            expect(fields.every(f => f.IsReadOnly)).toBe(true);
        });

        it('returns empty when no file of the requested type exists', async () => {
            connector.Routes.set(LIST_URL, listResponse(['1717804800.1-opens.json']));
            const fields = await connector.DiscoverFields(companyIntegration, 'nonexistent', contextUser);
            expect(fields).toEqual([]);
        });
    });

    describe('NormalizeResponse', () => {
        it('returns a root array of records directly', () => {
            const out = (connector as unknown as { NormalizeResponse: (b: unknown, k: string | null) => Record<string, unknown>[] })
                .NormalizeResponse([{ a: 1 }, { b: 2 }], null);
            expect(out).toEqual([{ a: 1 }, { b: 2 }]);
        });
        it('wraps a single object as a one-element array', () => {
            const out = (connector as unknown as { NormalizeResponse: (b: unknown, k: string | null) => Record<string, unknown>[] })
                .NormalizeResponse({ a: 1 }, null);
            expect(out).toEqual([{ a: 1 }]);
        });
        it('unwraps a keyed envelope', () => {
            const out = (connector as unknown as { NormalizeResponse: (b: unknown, k: string | null) => Record<string, unknown>[] })
                .NormalizeResponse({ data: [{ a: 1 }] }, 'data');
            expect(out).toEqual([{ a: 1 }]);
        });
    });

    describe('ExtractPaginationInfo', () => {
        it('reports no in-file pagination (file-level paging is the microtime cursor)', () => {
            const state = (connector as unknown as { ExtractPaginationInfo: (...a: unknown[]) => { HasMore: boolean } })
                .ExtractPaginationInfo({}, 'None', 1, 0, 50);
            expect(state.HasMore).toBe(false);
        });
    });

    describe('FetchChanges — synthetic __file_microtime cursor', () => {
        function ctx(overrides: Partial<FetchContext>): FetchContext {
            return {
                CompanyIntegration: companyIntegration,
                ObjectName: 'opens',
                WatermarkValue: null,
                BatchSize: 1000,
                ContextUser: contextUser,
                ...overrides,
            } as FetchContext;
        }

        it('first sync (no cursor): fetches all files of the type and advances the watermark to the max microtime', async () => {
            const f1 = '100.0-opens.json';
            const f2 = '200.0-opens.json';
            connector.Routes.set(LIST_URL, listResponse([f1, f2, '150.0-clicks.json']));
            connector.Routes.set(downloadURL(f1), fileResponse([{ id: 'a' }]));
            connector.Routes.set(downloadURL(f2), fileResponse([{ id: 'b' }, { id: 'c' }]));

            const result = await connector.FetchChanges(ctx({ WatermarkValue: null }));
            expect(result.Records.map(r => r.ExternalID)).toEqual(['a', 'b', 'c']); // ascending microtime
            expect(result.NewWatermarkValue).toBe('200.0');
            expect(result.NextAfterKeyValue).toBe('200.0');
            // only 'opens' files were downloaded — the clicks file is untouched
            expect(connector.RequestedURLs).not.toContain(downloadURL('150.0-clicks.json'));
        });

        it('incremental sync: only fetches files whose microtime exceeds the stored cursor', async () => {
            const fOld = '100.0-opens.json';
            const fNew = '300.0-opens.json';
            connector.Routes.set(LIST_URL, listResponse([fOld, fNew]));
            connector.Routes.set(downloadURL(fNew), fileResponse([{ id: 'new' }]));

            const result = await connector.FetchChanges(ctx({ WatermarkValue: '100.0' }));
            expect(result.Records.map(r => r.ExternalID)).toEqual(['new']);
            expect(result.NewWatermarkValue).toBe('300.0');
            // the already-seen file is NOT re-downloaded
            expect(connector.RequestedURLs).not.toContain(downloadURL(fOld));
        });

        it('no new files: returns empty with no watermark advance (content-hash idempotency — writes nothing)', async () => {
            connector.Routes.set(LIST_URL, listResponse(['100.0-opens.json']));
            const result = await connector.FetchChanges(ctx({ WatermarkValue: '100.0' }));
            expect(result.Records).toEqual([]);
            expect(result.NewWatermarkValue).toBeUndefined();
        });

        it('full-record pass-through: the COMPLETE source record reaches Fields', async () => {
            const f = '100.0-opens.json';
            connector.Routes.set(LIST_URL, listResponse([f]));
            connector.Routes.set(downloadURL(f), fileResponse([
                { id: 'a', email: 'x@y.com', custom_field_1: 'v1', nested: { z: 1 } },
            ]));
            const result = await connector.FetchChanges(ctx({}));
            expect(result.Records[0].Fields).toEqual({
                id: 'a', email: 'x@y.com', custom_field_1: 'v1', nested: { z: 1 },
            });
        });

        it('partial batch (BatchSize): stops mid-listing and reports HasMore=true', async () => {
            const f1 = '100.0-opens.json';
            const f2 = '200.0-opens.json';
            connector.Routes.set(LIST_URL, listResponse([f1, f2]));
            connector.Routes.set(downloadURL(f1), fileResponse([{ id: 'a' }, { id: 'b' }]));
            connector.Routes.set(downloadURL(f2), fileResponse([{ id: 'c' }]));

            const result = await connector.FetchChanges(ctx({ BatchSize: 1 }));
            // first file alone exceeds the batch limit → second file not fetched yet
            expect(result.Records.map(r => r.ExternalID)).toEqual(['a', 'b']);
            expect(result.HasMore).toBe(true);
            expect(connector.RequestedURLs).not.toContain(downloadURL(f2));
        });

        it('uses a content-hash fallback identity when a record has no id key', async () => {
            const f = '100.0-opens.json';
            connector.Routes.set(LIST_URL, listResponse([f]));
            connector.Routes.set(downloadURL(f), fileResponse([{ email: 'x@y.com' }]));
            const result = await connector.FetchChanges(ctx({}));
            expect(result.Records[0].ExternalID.startsWith('100.0:')).toBe(true);
        });
    });

    describe('TestConnection', () => {
        it('succeeds when the listing returns 200', async () => {
            connector.Routes.set(LIST_URL, listResponse(['100.0-opens.json']));
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(true);
        });
        it('fails on auth error (401)', async () => {
            connector.Routes.set(LIST_URL, { Status: 401, Body: {}, Headers: {} });
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Authentication failed');
        });
        it('fails on a server error (5xx)', async () => {
            connector.Routes.set(LIST_URL, { Status: 503, Body: {}, Headers: {} });
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
        });
    });

    describe('BuildHeaders', () => {
        it('builds a static Bearer header', () => {
            const headers = (connector as unknown as { BuildHeaders: (a: { Token: string }) => Record<string, string> })
                .BuildHeaders({ Token: 'abc' });
            expect(headers['Authorization']).toBe('Bearer abc');
            expect(headers['Accept']).toBe('application/json');
        });
    });
});
