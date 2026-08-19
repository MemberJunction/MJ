import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { BaseRESTIntegrationConnector, type RESTAuthContext, type RESTResponse, type PaginationState } from '../BaseRESTIntegrationConnector.js';
import type { FetchContext, FetchBatchResult } from '../BaseIntegrationConnector.js';

/**
 * Does the DISCOVERY intent actually reach the connector?
 *
 * `DiscoverFieldsViaFetch` computes a time budget and a record cap, and a connector that fans out
 * internally (one request per parent) can only respect them if it is TOLD. It is told through
 * `FetchContext` — and the whole point is that the connector under test receives those fields.
 *
 * This is a regression guard with a specific incident behind it. The first version of the fix set
 * the fields in `BaseIntegrationConnector.DiscoverySampleRecordStream`, but `BaseRESTIntegrationConnector`
 * OVERRIDES that method, and its fallback called `super(...)` with the old five arguments — dropping
 * the deadline. The fix shipped to a customer instance and did nothing: a Totara discovery spent 28
 * minutes inside a single `FetchChanges`, walked every parent, and returned `rows=0`, exactly as
 * before. The patched file was sitting right there, unused.
 *
 * The fallback is not an edge case: the record-constrained sampler in the REST class is gated on URL
 * template vars, so every connector expressing parent scope as CONFIGURATION instead (Totara declares
 * `Configuration.parentScope` + a wsfunction, with no vars in its APIPath) lands on it.
 */

const f = (o: Partial<MJIntegrationObjectFieldEntity>) => o as unknown as MJIntegrationObjectFieldEntity;
// APIPath carries NO template vars — the condition that routes through the fallback branch.
const objFlat = {
    ID: 'objFlat', Name: 'Widgets', APIPath: '/widgets',
    SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null,
} as unknown as MJIntegrationObjectEntity;
const FIELDS: Record<string, MJIntegrationObjectFieldEntity[]> = {
    objFlat: [f({ Name: 'id', IsPrimaryKey: true, Status: 'Active', Sequence: 1 })],
};

/** Captures the FetchContext the connector is handed, which is the entire question. */
class CapturingConnector extends BaseRESTIntegrationConnector {
    public seen: FetchContext[] = [];
    public get IntegrationName(): string { return 'Capturing'; }
    protected GetCachedObject(): MJIntegrationObjectEntity { return objFlat; }
    protected GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] { return FIELDS[objectID] ?? []; }
    protected async Authenticate(): Promise<RESTAuthContext> { return { Token: 't' } as RESTAuthContext; }
    protected BuildHeaders(): Record<string, string> { return {}; }
    protected GetBaseURL(): string { return 'https://api.test'; }
    protected async MakeHTTPRequest(): Promise<RESTResponse> { return { Status: 200, Body: [], Headers: {} } as RESTResponse; }
    protected NormalizeResponse(body: unknown): Record<string, unknown>[] { return Array.isArray(body) ? body as Record<string, unknown>[] : []; }
    protected ExtractPaginationInfo(): PaginationState { return { HasMore: false } as PaginationState; }

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.seen.push({ ...ctx });
        return { Records: [{ Fields: { id: '1' } }], HasMore: false } as unknown as FetchBatchResult;
    }
}

const CI = { ID: 'ci1', IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
const USER = {} as UserInfo;

describe('discovery intent reaches the connector through FetchContext', () => {
    beforeEach(() => {
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            GetIntegrationObjectByID: () => objFlat,
            GetIntegrationObject: () => objFlat,
            GetIntegrationObjectFields: (id: string) => FIELDS[id] ?? [],
            GetActiveIntegrationObjects: () => [objFlat],
        } as unknown as IntegrationEngineBase);
    });

    it('marks the call as a sample, with a target and a deadline — through the REST override', async () => {
        const c = new CapturingConnector();
        const before = Date.now();
        await c.DiscoverFieldsViaFetch(CI, 'Widgets', USER, { MaxRecords: 50, TimeBudgetMs: 60_000 });

        expect(c.seen.length).toBeGreaterThan(0);
        const ctx = c.seen[0];

        // The three fields a fanning-out connector needs to stop early.
        expect(ctx.IsDiscoverySample).toBe(true);
        expect(ctx.SampleTargetRecords).toBe(50);
        expect(ctx.DeadlineMs).toBeTypeOf('number');

        // The deadline is REAL — inside the budget window, not a stray 0 or a far-future sentinel.
        expect(ctx.DeadlineMs!).toBeGreaterThanOrEqual(before);
        expect(ctx.DeadlineMs!).toBeLessThanOrEqual(Date.now() + 60_000);
    });

    it('is a FULL fetch, so sampling breadth is not narrowed by a watermark', async () => {
        const c = new CapturingConnector();
        await c.DiscoverFieldsViaFetch(CI, 'Widgets', USER, { MaxRecords: 10, TimeBudgetMs: 30_000 });
        expect(c.seen[0].WatermarkValue).toBeNull();
    });

    it('leaves the SYNC path untouched — no discovery marker when nobody asked for a sample', async () => {
        // The guard that matters for correctness: a real sync must still walk everything. A connector
        // keys its early stop off IsDiscoverySample, so this being absent is what preserves sync.
        const c = new CapturingConnector();
        await c.FetchChanges({
            CompanyIntegration: CI, ObjectName: 'Widgets', WatermarkValue: null,
            BatchSize: 100, ContextUser: USER,
        });
        expect(c.seen[0].IsDiscoverySample).toBeUndefined();
        expect(c.seen[0].SampleTargetRecords).toBeUndefined();
        expect(c.seen[0].DeadlineMs).toBeUndefined();
    });
});
