import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
    RESTAuthContext,
    RESTResponse,
    FetchContext,
} from '@memberjunction/integration-engine';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { PropFuelConnector } from '../PropFuelConnector.js';

// ─── Mock harness ────────────────────────────────────────────────────────
//
// READ-ONLY / MOCKED-ONLY (T4/T5). This test NEVER hits a live PropFuel API and
// NEVER mutates data. It captures the request args the connector WOULD send and
// returns canned list/download responses. The connector's `ack` (cursor-advance)
// endpoint is NEVER invoked here — tests are list + download only.

interface CapturedCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
}

/**
 * Routes a requested URL to a canned RESTResponse. Captures every call so tests can
 * assert URL/method/header shape. A null queued response for a download throws (so we
 * can drive the partial-failure / watermark-unchanged path deterministically).
 */
class MockedPropFuelConnector extends PropFuelConnector {
    public Calls: CapturedCall[] = [];
    /** Canned response for GET …/list */
    public ListResponse: RESTResponse = { Status: 200, Body: [], Headers: {} };
    /** Canned response per download filename. A response of `null` => throw (simulated download failure). */
    public DownloadResponses: Record<string, RESTResponse | null> = {};

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            Token: 'test-token',
            Config: { Token: 'test-token', AccountID: '2019', BaseURL: 'https://app.propfuel.com' },
        } as unknown as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Calls.push({ url, method, headers, body });

        if (url.endsWith('/list')) {
            return this.ListResponse;
        }
        const downloadMatch = url.match(/\/download\/(.+)$/);
        if (downloadMatch) {
            const fileName = decodeURIComponent(downloadMatch[1]);
            const resp = this.DownloadResponses[fileName];
            if (resp === undefined) throw new Error(`MockedPropFuelConnector: no canned download for "${fileName}"`);
            if (resp === null) throw new Error(`PropFuel download failed for "${fileName}": HTTP 500`);
            return resp;
        }
        // /ack must never be hit by tests — surface loudly if it ever is.
        if (url.includes('/ack/')) {
            throw new Error('MockedPropFuelConnector: ack must NOT be called from tests (read-only)');
        }
        throw new Error(`MockedPropFuelConnector: unexpected URL ${url}`);
    }
}

const CI = {} as unknown as MJCompanyIntegrationEntity;
const USER = {} as unknown as UserInfo;

function fetchCtx(objectName: string, watermark: string | null): FetchContext {
    return {
        CompanyIntegration: CI,
        ObjectName: objectName,
        WatermarkValue: watermark,
        BatchSize: 500,
        ContextUser: USER,
    } as unknown as FetchContext;
}

/** A checkin_questions download record (nested objects, as the file feed emits). */
function checkinQuestionRecord(id: number, opts?: { deleted?: boolean; answered?: boolean }): Record<string, unknown> {
    return {
        checkin_question: {
            id,
            checkin_id: 900 + id,
            rating: opts?.answered ? 5 : null,
            selection: null,
            response: opts?.answered ? 'yes' : null,
            answered_at: opts?.answered ? '2026-03-01T10:00:00Z' : null,
            created_at: '2026-03-01T09:00:00Z',
            updated_at: opts?.answered ? '2026-03-01T10:00:00Z' : '2026-03-01T09:00:00Z',
            deleted_at: opts?.deleted ? '2026-03-02T00:00:00Z' : null,
        },
        contact: { id: 10 + id, name: '<scrubbed-name>', email: 'example+1@example.com', external_ids: null },
        question: { id: 50 + id, display: 'How are you?', follow_up: null, response_type: 'rating' },
        campaign: { id: 7, name: 'Spring Campaign' },
    };
}

/** A clicks download record (nested objects). */
function clickRecord(id: number): Record<string, unknown> {
    return {
        click: { id, type: 'link', checkin_id: 800 + id, clicked_at: '2026-03-01T11:00:00Z', link: 'https://example.com/x' },
        contact: { id: 10 + id, name: '<scrubbed-name>', email: 'example+2@example.com' },
        campaign: { id: 7, name: 'Spring Campaign' },
        checkin_notification: { id: 300 + id, type: 'prompt' },
    };
}

/** An opens download record (nested objects). */
function openRecord(id: number): Record<string, unknown> {
    return {
        open: { id, type: 'checkin_notification', checkin_id: 700 + id, opened_at: '2026-03-01T12:00:00Z' },
        contact: { id: 10 + id, name: '<scrubbed-name>', email: 'example+3@example.com' },
        campaign: { id: 7, name: 'Spring Campaign' },
        checkin_notification: { id: 400 + id, type: 'prompt' },
    };
}

// ─── Identity + capability surface ────────────────────────────────────────

describe('PropFuelConnector (identity + capability)', () => {
    const connector = new PropFuelConnector();

    it('instantiates without throwing', () => {
        expect(connector instanceof PropFuelConnector).toBe(true);
    });

    it('IntegrationName getter returns the verbatim "PropFuel"', () => {
        expect(connector.IntegrationName).toBe('PropFuel');
    });

    it('is PULL-ONLY: all write capability flags are false', () => {
        expect(connector.SupportsCreate).toBe(false);
        expect(connector.SupportsUpdate).toBe(false);
        expect(connector.SupportsDelete).toBe(false);
        expect(connector.SupportsSearch).toBe(false);
        expect(connector.SupportsListing).toBe(false);
        expect(connector.SupportsUpsert).toBe(false);
    });

    it('exposes a keyset ordering key for insert-only streams, none for the mutable stream', () => {
        expect(connector.StableOrderingKey('clicks')).toBe('click_id');
        expect(connector.StableOrderingKey('opens')).toBe('open_id');
        // checkin_questions is watermark-incremental (updated_at), not keyset.
        expect(connector.StableOrderingKey('checkin_questions')).toBeNull();
    });
});

// ─── TestConnection (read-only: list only) ─────────────────────────────────

describe('PropFuelConnector.TestConnection', () => {
    it('happy path: GET …/list returns 2xx → success, and hits only the list endpoint', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: [], Headers: {} };

        const result = await c.TestConnection(CI, USER);

        expect(result.Success).toBe(true);
        expect(c.Calls).toHaveLength(1);
        expect(c.Calls[0].url).toBe('https://app.propfuel.com/dataexport/2019/list');
        expect(c.Calls[0].method).toBe('GET');
        // No download, no ack on the connection test.
        expect(c.Calls.every(call => !call.url.includes('/ack/'))).toBe(true);
    });

    it('sends Authorization: Bearer + Content-Type: application/json on the request', async () => {
        const c = new MockedPropFuelConnector();
        await c.TestConnection(CI, USER);
        expect(c.Calls[0].headers['Authorization']).toBe('Bearer test-token');
        expect(c.Calls[0].headers['Content-Type']).toBe('application/json');
    });

    it('auth/HTTP failure path: non-2xx → success=false', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 401, Body: { error: 'unauthorized' }, Headers: {} };
        const result = await c.TestConnection(CI, USER);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('401');
    });
});

// ─── Discovery ─────────────────────────────────────────────────────────────

describe('PropFuelConnector.DiscoverObjects', () => {
    it('returns exactly the three proven streams with correct incremental flags', async () => {
        const c = new PropFuelConnector();
        const objects = await c.DiscoverObjects(CI, USER);
        const names = objects.map(o => o.Name).sort();
        expect(names).toEqual(['checkin_questions', 'clicks', 'opens']);

        const byName = Object.fromEntries(objects.map(o => [o.Name, o]));
        expect(byName['checkin_questions'].SupportsIncrementalSync).toBe(true);
        expect(byName['clicks'].SupportsIncrementalSync).toBe(false);
        expect(byName['opens'].SupportsIncrementalSync).toBe(false);
        // Pull-only: nothing is writable.
        expect(objects.every(o => o.SupportsWrite === false)).toBe(true);
    });
});

describe('PropFuelConnector.DiscoverFields', () => {
    it('surfaces every checkin_questions field; PK only on checkin_question.id', async () => {
        const c = new PropFuelConnector();
        const fields = await c.DiscoverFields(CI, 'checkin_questions', USER);
        const names = fields.map(f => f.Name);
        expect(names).toContain('checkin_question.id');
        expect(names).toContain('checkin_question.updated_at');
        expect(names).toContain('checkin_question.deleted_at');
        expect(names).toContain('contact.email');
        expect(names).toContain('campaign.name');

        const pkFields = fields.filter(f => f.IsPrimaryKey);
        expect(pkFields.map(f => f.Name)).toEqual(['checkin_question.id']);
        // All fields are read-only (pull-only feed).
        expect(fields.every(f => f.IsReadOnly === true)).toBe(true);
    });

    it('clicks/opens PK is the integer id column', async () => {
        const c = new PropFuelConnector();
        const clickFields = await c.DiscoverFields(CI, 'clicks', USER);
        expect(clickFields.filter(f => f.IsPrimaryKey).map(f => f.Name)).toEqual(['click_id']);

        const openFields = await c.DiscoverFields(CI, 'opens', USER);
        expect(openFields.filter(f => f.IsPrimaryKey).map(f => f.Name)).toEqual(['open_id']);
    });

    it('returns [] for an unknown object', async () => {
        const c = new PropFuelConnector();
        expect(await c.DiscoverFields(CI, 'definitely_unknown_xyz', USER)).toEqual([]);
    });
});

describe('PropFuelConnector.IntrospectSchema', () => {
    it('emits IncrementalWatermarkField only for checkin_questions', async () => {
        const c = new PropFuelConnector();
        const schema = await c.IntrospectSchema(CI, USER);
        const byName = Object.fromEntries(schema.Objects.map(o => [o.ExternalName, o]));
        expect(byName['checkin_questions'].IncrementalWatermarkField).toBe('checkin_question.updated_at');
        expect(byName['clicks'].IncrementalWatermarkField).toBeUndefined();
        expect(byName['opens'].IncrementalWatermarkField).toBeUndefined();
    });
});

// ─── FetchChanges: first sync (no watermark) ───────────────────────────────

describe('PropFuelConnector.FetchChanges — first sync', () => {
    it('checkin_questions: downloads all files oldest→newest, flattens, persists max microtime', async () => {
        const c = new MockedPropFuelConnector();
        // List returns files out of chronological order; the connector must sort ascending.
        c.ListResponse = {
            Status: 200,
            Body: [
                '1777565720.0000-checkin_questions.json',
                '1777565710.1224-checkin_questions.json',
                '1777565714.4161-clicks.json', // different datatype — must be ignored
            ],
            Headers: {},
        };
        c.DownloadResponses = {
            '1777565710.1224-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(1)], Headers: {} },
            '1777565720.0000-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(2, { answered: true })], Headers: {} },
        };

        const result = await c.FetchChanges(fetchCtx('checkin_questions', null));

        expect(result.Records).toHaveLength(2);
        // Watermark = highest fully-downloaded file microtime.
        expect(result.NewWatermarkValue).toBe('1777565720.0000');

        // Flatten check: dotted IOF names present; ExternalID = checkin_question.id.
        const first = result.Records[0];
        expect(first.ObjectType).toBe('checkin_questions');
        expect(first.ExternalID).toBe('1');
        expect(first.Fields['checkin_question.id']).toBe(1);
        expect(first.Fields['contact.email']).toBe('example+1@example.com');
        expect(first.Fields['campaign.name']).toBe('Spring Campaign');
        expect(first.Fields['question.response_type']).toBe('rating');

        // The clicks file was never downloaded.
        expect(c.Calls.some(call => call.url.includes('clicks'))).toBe(false);
        // ack never called.
        expect(c.Calls.every(call => !call.url.includes('/ack/'))).toBe(true);
    });

    it('clicks: insert-only — records flatten with underscore names; IsDeleted always false', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565714.4161-clicks.json'], Headers: {} };
        c.DownloadResponses = {
            '1777565714.4161-clicks.json': { Status: 200, Body: [clickRecord(11), clickRecord(12)], Headers: {} },
        };

        const result = await c.FetchChanges(fetchCtx('clicks', null));

        expect(result.Records).toHaveLength(2);
        expect(result.NewWatermarkValue).toBe('1777565714.4161');
        const rec = result.Records[0];
        expect(rec.ExternalID).toBe('11');
        expect(rec.Fields['click_id']).toBe(11);
        expect(rec.Fields['click_link']).toBe('https://example.com/x');
        expect(rec.Fields['contact_id']).toBe(21);
        expect(rec.Fields['checkin_notification_type']).toBe('prompt');
        // insert-only: never a tombstone.
        expect(result.Records.every(r => r.IsDeleted === false)).toBe(true);
    });

    it('opens: insert-only — underscore names; ExternalID = open_id; IsDeleted false', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565718.7132-opens.json'], Headers: {} };
        c.DownloadResponses = {
            '1777565718.7132-opens.json': { Status: 200, Body: [openRecord(31)], Headers: {} },
        };

        const result = await c.FetchChanges(fetchCtx('opens', null));

        expect(result.Records).toHaveLength(1);
        const rec = result.Records[0];
        expect(rec.ExternalID).toBe('31');
        expect(rec.Fields['open_id']).toBe(31);
        expect(rec.Fields['open_opened_at']).toBe('2026-03-01T12:00:00Z');
        expect(rec.Fields['checkin_notification_id']).toBe(431);
        expect(rec.IsDeleted).toBe(false);
    });
});

// ─── FetchChanges: incremental (with watermark) ────────────────────────────

describe('PropFuelConnector.FetchChanges — incremental', () => {
    it('only downloads files strictly newer than the watermark microtime', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = {
            Status: 200,
            Body: [
                '1777565710.0000-checkin_questions.json', // <= watermark → skip
                '1777565715.0000-checkin_questions.json', // > watermark → fetch
                '1777565720.0000-checkin_questions.json', // > watermark → fetch
            ],
            Headers: {},
        };
        c.DownloadResponses = {
            '1777565715.0000-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(5)], Headers: {} },
            '1777565720.0000-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(6)], Headers: {} },
        };

        const result = await c.FetchChanges(fetchCtx('checkin_questions', '1777565710.0000'));

        expect(result.Records).toHaveLength(2);
        expect(result.NewWatermarkValue).toBe('1777565720.0000');
        // The stale file was never downloaded.
        expect(c.Calls.some(call => call.url.includes('1777565710.0000'))).toBe(false);
    });

    it('returns no records (and no watermark) when no files are newer than the watermark', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565710.0000-checkin_questions.json'], Headers: {} };

        const result = await c.FetchChanges(fetchCtx('checkin_questions', '1777565710.0000'));

        expect(result.Records).toEqual([]);
        expect(result.NewWatermarkValue).toBeUndefined();
        // No download performed (only the list call).
        expect(c.Calls.filter(call => call.url.includes('/download/'))).toHaveLength(0);
    });
});

// ─── FetchChanges: out-of-order microtime ──────────────────────────────────

describe('PropFuelConnector.FetchChanges — out-of-order microtime', () => {
    it('processes files in ascending microtime order regardless of list order; watermark is the MAX', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = {
            Status: 200,
            Body: [
                '1777565730.0000-clicks.json',
                '1777565710.0000-clicks.json',
                '1777565720.0000-clicks.json',
            ],
            Headers: {},
        };
        c.DownloadResponses = {
            '1777565710.0000-clicks.json': { Status: 200, Body: [clickRecord(1)], Headers: {} },
            '1777565720.0000-clicks.json': { Status: 200, Body: [clickRecord(2)], Headers: {} },
            '1777565730.0000-clicks.json': { Status: 200, Body: [clickRecord(3)], Headers: {} },
        };

        const result = await c.FetchChanges(fetchCtx('clicks', null));

        // Download order is oldest → newest.
        const downloadOrder = c.Calls
            .filter(call => call.url.includes('/download/'))
            .map(call => call.url.match(/(\d+\.\d+)-clicks/)?.[1]);
        expect(downloadOrder).toEqual(['1777565710.0000', '1777565720.0000', '1777565730.0000']);

        // Watermark is the max microtime seen, not the most-recent in list order.
        expect(result.NewWatermarkValue).toBe('1777565730.0000');
        expect(result.Records).toHaveLength(3);
    });
});

// ─── FetchChanges: partial failure leaves watermark unchanged ───────────────

describe('PropFuelConnector.FetchChanges — partial failure', () => {
    it('throws when a mid-iteration download fails, before advancing the watermark', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = {
            Status: 200,
            Body: [
                '1777565710.0000-opens.json',
                '1777565720.0000-opens.json', // this one fails
                '1777565730.0000-opens.json',
            ],
            Headers: {},
        };
        c.DownloadResponses = {
            '1777565710.0000-opens.json': { Status: 200, Body: [openRecord(1)], Headers: {} },
            '1777565720.0000-opens.json': null, // simulated HTTP 500 → throw
            '1777565730.0000-opens.json': { Status: 200, Body: [openRecord(3)], Headers: {} },
        };

        // FetchChanges throws → the engine catches it and never persists a NewWatermarkValue,
        // so the watermark stays at its prior value and the next run re-resumes from there.
        await expect(c.FetchChanges(fetchCtx('opens', '1777565700.0000'))).rejects.toThrow(/download failed/i);

        // The file AFTER the failing one was never attempted (we stop on first failure).
        expect(c.Calls.some(call => call.url.includes('1777565730.0000'))).toBe(false);
    });
});

// ─── checkin_questions: upsert-by-identity + tombstones ────────────────────

describe('PropFuelConnector — checkin_questions upsert + tombstone', () => {
    it('re-emitted record keeps the SAME ExternalID (upsert-by-identity on checkin_question.id)', async () => {
        const c = new MockedPropFuelConnector();
        // Same id 42 appears twice across the feed: created, then answered/updated.
        c.ListResponse = {
            Status: 200,
            Body: ['1777565710.0000-checkin_questions.json', '1777565720.0000-checkin_questions.json'],
            Headers: {},
        };
        c.DownloadResponses = {
            '1777565710.0000-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(42)], Headers: {} },
            '1777565720.0000-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(42, { answered: true })], Headers: {} },
        };

        const result = await c.FetchChanges(fetchCtx('checkin_questions', null));

        expect(result.Records).toHaveLength(2);
        // Both versions share identity 42 → the engine upserts (the later overwrites the earlier).
        expect(result.Records.map(r => r.ExternalID)).toEqual(['42', '42']);
        expect(result.Records[0].Fields['checkin_question.answered_at']).toBeNull();
        expect(result.Records[1].Fields['checkin_question.answered_at']).toBe('2026-03-01T10:00:00Z');
        expect(result.Records.every(r => r.IsDeleted === false)).toBe(true);
    });

    it('applies a tombstone when checkin_question.deleted_at is present (IsDeleted=true)', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565730.0000-checkin_questions.json'], Headers: {} };
        c.DownloadResponses = {
            '1777565730.0000-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(42, { deleted: true })], Headers: {} },
        };

        const result = await c.FetchChanges(fetchCtx('checkin_questions', null));

        expect(result.Records).toHaveLength(1);
        expect(result.Records[0].ExternalID).toBe('42');
        expect(result.Records[0].IsDeleted).toBe(true);
        expect(result.Records[0].Fields['checkin_question.deleted_at']).toBe('2026-03-02T00:00:00Z');
    });

    it('flattens nullable nested fields (question.display=null) without dropping the column (re-verify nullability)', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565745.0000-checkin_questions.json'], Headers: {} };
        const rec = checkinQuestionRecord(44);
        // The 851-file union re-scan (propfuel-schema-union-1780737815) refined question.display to nullable.
        (rec.question as Record<string, unknown>).display = null;
        c.DownloadResponses = {
            '1777565745.0000-checkin_questions.json': { Status: 200, Body: [rec], Headers: {} },
        };
        const result = await c.FetchChanges(fetchCtx('checkin_questions', null));
        expect(result.Records).toHaveLength(1);
        // The dotted column is still present (flattened), carrying the null value — not silently dropped.
        expect('question.display' in result.Records[0].Fields).toBe(true);
        expect(result.Records[0].Fields['question.display']).toBeNull();
        // Its sibling response_type still flattens normally.
        expect(result.Records[0].Fields['question.response_type']).toBe('rating');
    });

    it('does NOT tombstone when deleted_at is null', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565740.0000-checkin_questions.json'], Headers: {} };
        c.DownloadResponses = {
            '1777565740.0000-checkin_questions.json': { Status: 200, Body: [checkinQuestionRecord(43)], Headers: {} },
        };
        const result = await c.FetchChanges(fetchCtx('checkin_questions', null));
        expect(result.Records[0].IsDeleted).toBe(false);
    });
});

// ─── clicks/opens: insert-only (no tombstone column) ───────────────────────

describe('PropFuelConnector — clicks/opens insert-only', () => {
    it('clicks never carry a tombstone even if a stray deleted_at appears in the payload', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565710.0000-clicks.json'], Headers: {} };
        const stray = clickRecord(99);
        (stray.click as Record<string, unknown>).deleted_at = '2026-03-02T00:00:00Z'; // not a recognized tombstone column for clicks
        c.DownloadResponses = {
            '1777565710.0000-clicks.json': { Status: 200, Body: [stray], Headers: {} },
        };
        const result = await c.FetchChanges(fetchCtx('clicks', null));
        // clicks have no tombstone semantics → IsDeleted stays false.
        expect(result.Records[0].IsDeleted).toBe(false);
    });

    it('opens never carry a tombstone', async () => {
        const c = new MockedPropFuelConnector();
        c.ListResponse = { Status: 200, Body: ['1777565710.0000-opens.json'], Headers: {} };
        c.DownloadResponses = {
            '1777565710.0000-opens.json': { Status: 200, Body: [openRecord(99)], Headers: {} },
        };
        const result = await c.FetchChanges(fetchCtx('opens', null));
        expect(result.Records[0].IsDeleted).toBe(false);
    });
});

// ─── Unknown stream → surfaced warning, not a throw ────────────────────────

describe('PropFuelConnector.FetchChanges — unknown stream', () => {
    it('returns a FetchWarning (not a throw) for an unmapped object', async () => {
        const c = new MockedPropFuelConnector();
        const result = await c.FetchChanges(fetchCtx('not_a_stream', null));
        expect(result.Records).toEqual([]);
        expect(result.Warnings?.[0]?.Code).toBe('UNKNOWN_STREAM');
    });
});

// ─── Rate-limit retry / backoff (429 / 503) ──────────────────────────────────
//
// The mocks above override MakeHTTPRequest and therefore BYPASS the retry loop. To prove the
// REAL 429/503 retry-with-backoff in MakeHTTPRequest, this mock sits one level lower: it overrides
// `doFetch` (the single-fetch primitive) to return a queued status sequence, and no-ops `sleep` so
// the backoff is instant while still recording each wait. No live API, no real timers.

class RateLimitTestConnector extends PropFuelConnector {
    public queued: RESTResponse[] = [];
    public fetchCalls = 0;
    public backoffs: number[] = [];

    protected override async doFetch(): Promise<RESTResponse> {
        this.fetchCalls++;
        const r = this.queued.shift();
        if (!r) throw new Error('RateLimitTestConnector: response queue empty');
        return r;
    }
    protected override sleep(ms: number): Promise<void> {
        this.backoffs.push(ms);
        return Promise.resolve(); // instant — but recorded, so we can assert backoff growth
    }
    /** Public passthrough that drives the protected MakeHTTPRequest retry path. */
    public async request(maxRetries: number): Promise<RESTResponse> {
        const auth = {
            Token: 't',
            Config: { Token: 't', AccountID: '2019', MaxRetries: maxRetries },
        } as unknown as RESTAuthContext;
        return this.MakeHTTPRequest(auth, 'https://app.propfuel.com/dataexport/2019/list', 'GET', {});
    }
}

const ok = (body: unknown = []): RESTResponse => ({ Status: 200, Body: body, Headers: {} });
const throttled = (status: 429 | 503): RESTResponse => ({ Status: status, Body: null, Headers: {} });

// ─── Frozen-contract field-catalog regression guard ────────────────────────
//
// Binds the connector's DiscoverFields output to the RE-VERIFIED frozen contract
// (metadata/integrations/propfuel/.propfuel.integration.json, re-verify run
// connector-propfuel-1780736733985-c8a0cf02 / broker scan propfuel-schema-union-1780737815).
// The 851-file union re-scan surfaced NO field beyond what already shipped, so these lists
// are the authoritative set. If discovery ever drifts from the frozen contract — a field
// added, dropped, or renamed away from the per-stream naming convention (dotted for
// checkin_questions, underscore for clicks/opens) — this fails loudly.

const CONTRACT_FIELDS: Record<string, string[]> = {
    checkin_questions: [
        'checkin_question.id',
        'checkin_question.checkin_id',
        'checkin_question.rating',
        'checkin_question.selection',
        'checkin_question.response',
        'checkin_question.answered_at',
        'checkin_question.created_at',
        'checkin_question.updated_at',
        'checkin_question.deleted_at',
        'contact.id',
        'contact.name',
        'contact.email',
        'contact.external_ids',
        'question.id',
        'question.display',
        'question.follow_up',
        'question.response_type',
        'campaign.id',
        'campaign.name',
    ],
    clicks: [
        'click_id',
        'click_type',
        'click_checkin_id',
        'click_clicked_at',
        'click_link',
        'contact_id',
        'contact_name',
        'contact_email',
        'campaign_id',
        'campaign_name',
        'checkin_notification_id',
        'checkin_notification_type',
    ],
    opens: [
        'open_id',
        'open_type',
        'open_checkin_id',
        'open_opened_at',
        'contact_id',
        'contact_name',
        'contact_email',
        'campaign_id',
        'campaign_name',
        'checkin_notification_id',
        'checkin_notification_type',
    ],
};

describe('PropFuelConnector — DiscoverFields matches the re-verified frozen contract', () => {
    for (const stream of ['checkin_questions', 'clicks', 'opens'] as const) {
        it(`${stream}: exact field set + order matches the frozen contract (no missing, no extra)`, async () => {
            const c = new PropFuelConnector();
            const fields = await c.DiscoverFields(CI, stream, USER);
            const names = fields.map(f => f.Name);
            // Exact equality (order-preserving): catches drops, additions, and renames at once.
            expect(names).toEqual(CONTRACT_FIELDS[stream]);
            // Every contract field is surfaced as a read-only, non-FK column (pull-only feed).
            for (const f of fields) {
                expect(f.IsReadOnly).toBe(true);
                expect(f.IsForeignKey).toBe(false);
            }
        });
    }

    it('checkin_questions naming stays DOTTED; clicks/opens stay UNDERSCORE', async () => {
        const c = new PropFuelConnector();
        const cq = (await c.DiscoverFields(CI, 'checkin_questions', USER)).map(f => f.Name);
        // Every checkin_questions column is a dotted nested path.
        expect(cq.every(n => n.includes('.'))).toBe(true);

        for (const stream of ['clicks', 'opens'] as const) {
            const flat = (await c.DiscoverFields(CI, stream, USER)).map(f => f.Name);
            // No dotted names on the underscore-convention streams.
            expect(flat.every(n => !n.includes('.'))).toBe(true);
        }
    });

    it('every non-PK contract field is nullable (non-required) and only the id column is PK', async () => {
        const c = new PropFuelConnector();
        const pkByStream: Record<string, string> = {
            checkin_questions: 'checkin_question.id',
            clicks: 'click_id',
            opens: 'open_id',
        };
        for (const stream of ['checkin_questions', 'clicks', 'opens'] as const) {
            const fields = await c.DiscoverFields(CI, stream, USER);
            const pk = fields.filter(f => f.IsPrimaryKey).map(f => f.Name);
            expect(pk).toEqual([pkByStream[stream]]);
            // Newly-surfaced / non-identity fields are non-required (nullable) per the contract.
            for (const f of fields) {
                if (f.Name !== pkByStream[stream]) {
                    expect(f.IsRequired).toBe(false);
                }
            }
        }
    });
});

describe('PropFuelConnector — rate-limit retry/backoff (429/503)', () => {
    it('retries on 429 then succeeds, backing off once between the two attempts', async () => {
        const c = new RateLimitTestConnector();
        c.queued = [throttled(429), ok([{ ok: true }])];
        const resp = await c.request(3);
        expect(resp.Status).toBe(200);
        expect(c.fetchCalls).toBe(2);      // one retry
        expect(c.backoffs.length).toBe(1); // one backoff wait
    });

    it('retries on 503 (service unavailable) then succeeds', async () => {
        const c = new RateLimitTestConnector();
        c.queued = [throttled(503), ok()];
        const resp = await c.request(3);
        expect(resp.Status).toBe(200);
        expect(c.fetchCalls).toBe(2);
    });

    it('exhausts maxRetries on persistent 429 and returns the final 429 (does NOT throw)', async () => {
        const c = new RateLimitTestConnector();
        c.queued = [throttled(429), throttled(429), throttled(429)]; // maxRetries=2 => attempts 0,1,2
        const resp = await c.request(2);
        expect(resp.Status).toBe(429);
        expect(c.fetchCalls).toBe(3);      // attempts 0,1,2
        expect(c.backoffs.length).toBe(2); // backoff after attempts 0 and 1, never after the last
    });

    it('uses exponential backoff — each wait strictly longer than the previous', async () => {
        const c = new RateLimitTestConnector();
        c.queued = [throttled(429), throttled(429), ok()];
        await c.request(3);
        expect(c.backoffs.length).toBe(2);
        expect(c.backoffs[1]).toBeGreaterThan(c.backoffs[0]); // ~2000+jitter > ~1000+jitter
    });
});

// ─── Live binding to the RE-VERIFIED frozen-contract metadata file ─────────
//
// The block above (CONTRACT_FIELDS) is a hand-maintained regression guard. THIS block
// instead reads the actual on-disk frozen-contract artifact —
//   metadata/integrations/propfuel/.propfuel.integration.json
// (authored by the re-verify run connector-propfuel-1780736733985-c8a0cf02 / broker scan
// propfuel-schema-union-1780737815) — and asserts the connector's DiscoverFields output
// EXACTLY equals the IOFs that file declares per stream. This is a live binding: if a future
// contract re-verify surfaces a NEW field into the metadata file, this fails until the
// connector's per-stream catalog adds it (and vice-versa for a drop/rename). It also independently
// re-confirms the present re-verify added nothing beyond what already shipped (19 / 12 / 11).

interface MetadataIOF { fields: { Name: string; IsPrimaryKey?: boolean; IsReadOnly?: boolean } }
interface MetadataIO {
    fields: { Name: string };
    relatedEntities?: { 'MJ: Integration Object Fields'?: MetadataIOF[] };
}
interface MetadataIntegration {
    relatedEntities?: { 'MJ: Integration Objects'?: MetadataIO[] };
}

function loadContractIOFNamesByStream(): Record<string, string[]> {
    const here = dirname(fileURLToPath(import.meta.url));
    // src/__tests__ -> repo root -> metadata/integrations/propfuel/.propfuel.integration.json
    const metadataPath = resolve(
        here,
        '../../../../../metadata/integrations/propfuel/.propfuel.integration.json'
    );
    const raw = JSON.parse(readFileSync(metadataPath, 'utf8')) as MetadataIntegration[];
    const ios = raw[0]?.relatedEntities?.['MJ: Integration Objects'] ?? [];
    const out: Record<string, string[]> = {};
    for (const io of ios) {
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        out[io.fields.Name] = iofs.map(f => f.fields.Name);
    }
    return out;
}

describe('PropFuelConnector — DiscoverFields is bound to the on-disk re-verified contract', () => {
    const contractByStream = loadContractIOFNamesByStream();

    it('the metadata file declares exactly the three proven streams', () => {
        expect(Object.keys(contractByStream).sort()).toEqual(['checkin_questions', 'clicks', 'opens']);
    });

    for (const stream of ['checkin_questions', 'clicks', 'opens'] as const) {
        it(`${stream}: connector discovery field SET equals the metadata file's declared IOFs (no field missing, none extra)`, async () => {
            const c = new PropFuelConnector();
            const discovered = (await c.DiscoverFields(CI, stream, USER)).map(f => f.Name);
            const declared = contractByStream[stream];
            expect(declared.length).toBeGreaterThan(0);
            // Set-equality (sorted): every metadata-declared field is surfaced by discovery, and
            // discovery surfaces nothing the contract doesn't declare.
            expect([...discovered].sort()).toEqual([...declared].sort());
        });
    }

    it('re-verify added no new fields: counts stay 19 / 12 / 11', () => {
        expect(contractByStream['checkin_questions'].length).toBe(19);
        expect(contractByStream['clicks'].length).toBe(12);
        expect(contractByStream['opens'].length).toBe(11);
    });

    it('every metadata-declared PK is surfaced by discovery as a PK (and is the only PK)', async () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const metadataPath = resolve(
            here,
            '../../../../../metadata/integrations/propfuel/.propfuel.integration.json'
        );
        const raw = JSON.parse(readFileSync(metadataPath, 'utf8')) as MetadataIntegration[];
        const ios = raw[0]?.relatedEntities?.['MJ: Integration Objects'] ?? [];
        const c = new PropFuelConnector();
        for (const io of ios) {
            const declaredPKs = (io.relatedEntities?.['MJ: Integration Object Fields'] ?? [])
                .filter(f => f.fields.IsPrimaryKey === true)
                .map(f => f.fields.Name)
                .sort();
            const discoveredPKs = (await c.DiscoverFields(CI, io.fields.Name, USER))
                .filter(f => f.IsPrimaryKey)
                .map(f => f.Name)
                .sort();
            expect(discoveredPKs).toEqual(declaredPKs);
        }
    });
});
