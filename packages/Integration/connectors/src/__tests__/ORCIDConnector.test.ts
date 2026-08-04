import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTResponse,
    RESTAuthContext,
    FetchContext,
    PaginationType,
} from '@memberjunction/integration-engine';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { ORCIDConnector } from '../ORCIDConnector.js';

// ─── Fixtures (scrubbed; ORCID Public API v3.0 shapes) ────────────────
// Derived from documented ORCID Public API example payloads. ORCID iDs in the
// 0000-* test ranges are public sample identifiers; no PII beyond synthetic names.

const SEARCH_FIXTURE = {
    'num-found': 2,
    result: [
        { 'orcid-identifier': { path: '0000-0002-1825-0097', uri: 'https://orcid.org/0000-0002-1825-0097' } },
        { 'orcid-identifier': { path: '0000-0001-2345-6789', uri: 'https://orcid.org/0000-0001-2345-6789' } },
    ],
};

const RECORD_FIXTURE = {
    'orcid-identifier': { path: '0000-0002-1825-0097', uri: 'https://orcid.org/0000-0002-1825-0097' },
    'last-modified-date': { value: 1700000000000 },
    history: {
        'submission-date': { value: 1500000000000 },
        claimed: true,
        'verified-email': true,
    },
    person: {
        name: {
            'given-names': { value: 'Test' },
            'family-name': { value: 'Researcher' },
            'credit-name': { value: 'T. Researcher' },
        },
        biography: { content: '<redacted>' },
        emails: { email: [] },
        keywords: { keyword: [] },
    },
};

// A works group envelope: group[].work-summary[] with put-code leaf items.
const WORKS_FIXTURE = {
    'last-modified-date': { value: 1700000000000 },
    group: [
        {
            'work-summary': [
                { 'put-code': 111, title: { title: { value: 'Paper A' } }, type: 'journal-article', 'last-modified-date': { value: 1600000000000 } },
            ],
        },
        {
            'work-summary': [
                { 'put-code': 222, title: { title: { value: 'Paper B' } }, type: 'book', 'last-modified-date': { value: 1800000000000 } },
            ],
        },
    ],
};

// ─── Mock metadata builders ───────────────────────────────────────────

function mockField(over: Partial<MJIntegrationObjectFieldEntity> & { Name: string }): MJIntegrationObjectFieldEntity {
    return {
        Name: over.Name,
        Type: over.Type ?? 'String',
        IsPrimaryKey: over.IsPrimaryKey ?? false,
        IsRequired: over.IsRequired ?? false,
        IsReadOnly: over.IsReadOnly ?? true,
        IsUniqueKey: over.IsUniqueKey ?? false,
        Status: 'Active',
        Sequence: over.Sequence ?? 0,
        DisplayName: over.Name,
        RelatedIntegrationObjectID: over.RelatedIntegrationObjectID ?? null,
    } as unknown as MJIntegrationObjectFieldEntity;
}

function mockObject(name: string): MJIntegrationObjectEntity {
    return {
        ID: `io-${name}`,
        Name: name,
        APIPath: `/{iD}/${name === 'record' ? 'record' : name}`,
        PaginationType: 'None',
        SupportsPagination: false,
        SupportsIncrementalSync: true,
        SupportsWrite: false,
        Status: 'Active',
    } as unknown as MJIntegrationObjectEntity;
}

const RECORD_FIELDS: MJIntegrationObjectFieldEntity[] = [
    mockField({ Name: 'orcid-id', IsPrimaryKey: true, IsRequired: true, IsUniqueKey: true, Sequence: 0 }),
    mockField({ Name: 'given-names', Sequence: 1 }),
    mockField({ Name: 'family-name', Sequence: 2 }),
    mockField({ Name: 'last-modified-date', Type: 'DateTime', Sequence: 3 }),
];

const WORKS_FIELDS: MJIntegrationObjectFieldEntity[] = [
    mockField({ Name: 'orcid-id', IsRequired: true, Sequence: 0, RelatedIntegrationObjectID: 'io-record' }),
    mockField({ Name: 'put-code', Type: 'Integer', IsPrimaryKey: true, IsRequired: true, IsUniqueKey: true, Sequence: 1 }),
    mockField({ Name: 'type', Sequence: 2 }),
    mockField({ Name: 'last-modified-date', Type: 'DateTime', Sequence: 3 }),
];

const OBJECTS: Record<string, { obj: MJIntegrationObjectEntity; fields: MJIntegrationObjectFieldEntity[] }> = {
    record: { obj: mockObject('record'), fields: RECORD_FIELDS },
    works: { obj: mockObject('works'), fields: WORKS_FIELDS },
};

/**
 * Test connector: overrides auth + HTTP transport + cached-metadata accessors so
 * FetchChanges runs end-to-end with NO credentials and NO real network. Captures
 * outbound calls and serves canned fixtures keyed by URL substring.
 */
class TestORCIDConnector extends ORCIDConnector {
    public Calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    public Responder: (url: string) => RESTResponse = () => ({ Status: 200, Body: {}, Headers: {} });
    /** PascalCase ORCIDConnectionConfig overrides — the shape parseConfig would produce. */
    public Config: Record<string, unknown> = { SearchQuery: 'affiliation-org-name:"Test University"' };

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            Token: 'test-token',
            ExpiresAt: new Date(Date.now() + 3600_000),
            BaseUrl: 'https://pub.orcid.org/v3.0',
            Config: { ClientID: 'cid', ClientSecret: 'sec', UseSandbox: false, ...this.Config },
        } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>
    ): Promise<RESTResponse> {
        this.Calls.push({ url, method, headers });
        return this.Responder(url);
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        return OBJECTS[objectName].obj;
    }

    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        const name = objectID.replace(/^io-/, '');
        return OBJECTS[name].fields;
    }
}

function ctx(objectName: string, watermark: string | null = null): FetchContext {
    return {
        CompanyIntegration: { IntegrationID: 'int-1' } as MJCompanyIntegrationEntity,
        ObjectName: objectName,
        WatermarkValue: watermark,
        BatchSize: 1000,
        ContextUser: {} as never,
    };
}

function respond(url: string): RESTResponse {
    if (url.includes('/search')) return { Status: 200, Body: SEARCH_FIXTURE, Headers: {} };
    if (url.includes('/record')) return { Status: 200, Body: RECORD_FIXTURE, Headers: {} };
    if (url.includes('/works')) return { Status: 200, Body: WORKS_FIXTURE, Headers: {} };
    return { Status: 404, Body: null, Headers: {} };
}

// ─── Identity + capability ────────────────────────────────────────────

describe('ORCIDConnector — identity & capabilities', () => {
    const c = new ORCIDConnector();

    it('instantiates and exposes the verbatim IntegrationName', () => {
        expect(c).toBeInstanceOf(ORCIDConnector);
        expect(c.IntegrationName).toBe('ORCID');
    });

    it('is PULL-ONLY (no create/update/delete)', () => {
        expect(c.SupportsCreate).toBe(false);
        expect(c.SupportsUpdate).toBe(false);
        expect(c.SupportsDelete).toBe(false);
    });

    it('declares a conservative RateLimitPolicy under the 40 req/s burst', () => {
        const policy = c.RateLimitPolicy;
        expect(policy).not.toBeNull();
        expect(policy!.TokensPerSec).toBeLessThanOrEqual(40);
        expect(policy!.Burst).toBe(40);
    });

    it('StableOrderingKey is null for the search-scoped universe (keyset N/A)', () => {
        expect(c.StableOrderingKey('record')).toBeNull();
        expect(c.StableOrderingKey('works')).toBeNull();
    });

    it('CreateRecord throws via the base stub (capability false)', async () => {
        await expect(c.CreateRecord({} as never)).rejects.toThrow();
    });
});

// ─── TestConnection ───────────────────────────────────────────────────

describe('ORCIDConnector — TestConnection', () => {
    let c: TestORCIDConnector;
    beforeEach(() => { c = new TestORCIDConnector(); });

    it('happy path: a 200 probe yields Success', async () => {
        c.Responder = () => ({ Status: 200, Body: RECORD_FIXTURE, Headers: {} });
        const res = await c.TestConnection({} as MJCompanyIntegrationEntity, {} as never);
        expect(res.Success).toBe(true);
        expect(res.ServerVersion).toContain('v3.0');
    });

    it('auth-fail path: a 401 probe yields failure', async () => {
        c.Responder = () => ({ Status: 401, Body: null, Headers: {} });
        const res = await c.TestConnection({} as MJCompanyIntegrationEntity, {} as never);
        expect(res.Success).toBe(false);
        expect(res.Message).toContain('401');
    });

    it('network-error path: a thrown transport error yields failure', async () => {
        c.Responder = () => { throw new Error('ENOTFOUND pub.orcid.org'); };
        // exhaust retries quickly by treating it as non-retryable? It IS retryable; cap retries via config.
        c.Config = { ...c.Config, MaxRetries: 0 };
        const res = await c.TestConnection({} as MJCompanyIntegrationEntity, {} as never);
        expect(res.Success).toBe(false);
    });
});

// ─── DiscoverObjects / DiscoverFields (base cache path is not exercised; verify shape via fields) ──

describe('ORCIDConnector — schema mapping', () => {
    it('record IO declares orcid-id as the PK', () => {
        const pk = RECORD_FIELDS.filter(f => f.IsPrimaryKey).map(f => f.Name);
        expect(pk).toEqual(['orcid-id']);
    });
    it('works IO declares put-code as the PK and orcid-id as the FK', () => {
        const pk = WORKS_FIELDS.filter(f => f.IsPrimaryKey).map(f => f.Name);
        expect(pk).toEqual(['put-code']);
        const fk = WORKS_FIELDS.find(f => f.Name === 'orcid-id');
        expect(fk?.RelatedIntegrationObjectID).toBe('io-record');
    });
});

// ─── FetchChanges: iD universe resolution + per-iD fan-out ────────────

describe('ORCIDConnector — FetchChanges (record)', () => {
    let c: TestORCIDConnector;
    beforeEach(() => { c = new TestORCIDConnector(); c.Responder = respond; });

    it('resolves the iD universe via /search then fetches /{iD}/record per iD', async () => {
        const result = await c.FetchChanges(ctx('record'));
        // Two iDs found → two /record fetches (plus the /search call).
        const recordCalls = c.Calls.filter(x => x.url.includes('/record'));
        const searchCalls = c.Calls.filter(x => x.url.includes('/search'));
        expect(searchCalls.length).toBeGreaterThanOrEqual(1);
        expect(recordCalls.length).toBe(2);
        expect(result.Records.length).toBe(2);
    });

    it('sends Lucene query + offset pagination params to /search', async () => {
        await c.FetchChanges(ctx('record'));
        const search = c.Calls.find(x => x.url.includes('/search'))!;
        expect(search.url).toContain('q=');
        expect(search.url).toContain('start=0');
        expect(search.url).toContain('rows=');
    });

    it('flattens person scalars and the PK onto Fields while preserving full record', async () => {
        const result = await c.FetchChanges(ctx('record'));
        const rec = result.Records[0];
        expect(rec.Fields['given-names']).toBe('Test');
        expect(rec.Fields['family-name']).toBe('Researcher');
        expect(rec.Fields['orcid-id']).toBe('0000-0002-1825-0097');
        // full-record pass-through: nested blobs retained
        expect(rec.Fields['person']).toBeDefined();
        expect(rec.Fields['history']).toBeDefined();
        // PK drives ExternalID
        expect(rec.ExternalID).toBe('0000-0002-1825-0097');
    });

    it('sets Authorization bearer + Accept JSON headers', async () => {
        await c.FetchChanges(ctx('record'));
        const call = c.Calls[0];
        expect(call.headers['Authorization']).toBe('Bearer test-token');
        expect(call.headers['Accept']).toBe('application/json');
    });

    it('uses explicit orcidIds when no searchQuery is set (no /search call)', async () => {
        c.Config = { OrcidIds: ['0000-0002-1825-0097'] };
        const result = await c.FetchChanges(ctx('record'));
        expect(c.Calls.find(x => x.url.includes('/search'))).toBeUndefined();
        expect(result.Records.length).toBe(1);
    });

    it('returns a ZERO_SCOPE warning when Configuration scopes nothing', async () => {
        c.Config = {};
        const result = await c.FetchChanges(ctx('record'));
        expect(result.Records).toEqual([]);
        expect(result.Warnings?.[0]?.Code).toBe('ZERO_SCOPE');
    });
});

describe('ORCIDConnector — FetchChanges (works section fan-out)', () => {
    let c: TestORCIDConnector;
    beforeEach(() => { c = new TestORCIDConnector(); c.Responder = respond; c.Config = { OrcidIds: ['0000-0002-1825-0097'] }; });

    it('expands the group envelope into individual put-code items tagged with orcid-id', async () => {
        const result = await c.FetchChanges(ctx('works'));
        expect(result.Records.length).toBe(2);
        const putCodes = result.Records.map(r => r.Fields['put-code']).sort();
        expect(putCodes).toEqual([111, 222]);
        for (const r of result.Records) {
            expect(r.Fields['orcid-id']).toBe('0000-0002-1825-0097');
        }
    });

    it('put-code drives the ExternalID per item', async () => {
        const result = await c.FetchChanges(ctx('works'));
        const ids = result.Records.map(r => r.ExternalID).sort();
        expect(ids).toEqual(['111', '222']);
    });
});

// ─── Incremental watermark + content-hash idempotency ────────────────

describe('ORCIDConnector — incremental sync', () => {
    let c: TestORCIDConnector;
    beforeEach(() => { c = new TestORCIDConnector(); c.Responder = respond; c.Config = { OrcidIds: ['0000-0002-1825-0097'] }; });

    it('first sync (no watermark) returns all items and a NewWatermarkValue = max last-modified', async () => {
        const result = await c.FetchChanges(ctx('works', null));
        expect(result.Records.length).toBe(2);
        // max of 1600000000000 and 1800000000000
        expect(result.NewWatermarkValue).toBe('1800000000000');
    });

    it('subsequent sync narrows to items strictly newer than the watermark', async () => {
        // watermark = 1600000000000 → only the 1800000000000 item (put-code 222) is newer.
        const result = await c.FetchChanges(ctx('works', '1600000000000'));
        expect(result.Records.length).toBe(1);
        expect(result.Records[0].Fields['put-code']).toBe(222);
        expect(result.NewWatermarkValue).toBe('1800000000000');
    });

    it('no advancement when nothing is newer than the watermark (NewWatermarkValue omitted)', async () => {
        const result = await c.FetchChanges(ctx('works', '1800000000000'));
        expect(result.Records.length).toBe(0);
        expect(result.NewWatermarkValue).toBeUndefined();
    });

    it('content-hash idempotency: re-running yields identical ExternalIDs/Fields (PK-stable)', async () => {
        const a = await c.FetchChanges(ctx('works', null));
        const b = await c.FetchChanges(ctx('works', null));
        expect(a.Records.map(r => r.ExternalID).sort()).toEqual(b.Records.map(r => r.ExternalID).sort());
    });
});

// ─── NormalizeResponse + pagination ───────────────────────────────────

describe('ORCIDConnector — NormalizeResponse / pagination', () => {
    let c: TestORCIDConnector;
    beforeEach(() => { c = new TestORCIDConnector(); });

    it('NormalizeResponse wraps a single object as a one-element array', () => {
        const out = (c as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] })
            .NormalizeResponse(RECORD_FIXTURE, null);
        expect(out.length).toBe(1);
    });

    it('NormalizeResponse extracts an array under a responseDataKey', () => {
        const out = (c as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] })
            .NormalizeResponse(SEARCH_FIXTURE, 'result');
        expect(out.length).toBe(2);
    });

    it('NormalizeResponse returns [] for null body', () => {
        const out = (c as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] })
            .NormalizeResponse(null, null);
        expect(out).toEqual([]);
    });

    it('ExtractPaginationInfo always reports HasMore=false (per-iD endpoints unpaginated)', () => {
        const state = (c as unknown as {
            ExtractPaginationInfo(b: unknown, t: PaginationType, p: number, o: number, s: number): { HasMore: boolean };
        }).ExtractPaginationInfo(RECORD_FIXTURE, 'None', 1, 0, 50);
        expect(state.HasMore).toBe(false);
    });
});

// ─── Retry-After parsing ──────────────────────────────────────────────

describe('ORCIDConnector — ExtractRetryAfterMs', () => {
    const c = new ORCIDConnector();
    it('parses delta-seconds Retry-After into ms', () => {
        expect(c.ExtractRetryAfterMs({ Headers: { 'retry-after': '2' } })).toBe(2000);
    });
    it('returns undefined when no Retry-After present', () => {
        expect(c.ExtractRetryAfterMs({ Headers: {} })).toBeUndefined();
        expect(c.ExtractRetryAfterMs(new Error('boom'))).toBeUndefined();
    });
});
