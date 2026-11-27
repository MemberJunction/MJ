/**
 * PR 5 milestone B3 — attack 5, the estimator half (§5.2.4, F-DOC-10): `RederivationEstimator.Estimate` on a fixture
 * with known prompt-run costs returns their mean × the calls it projects. Affected values are the open Pipeline Champion
 * values of the Record Process under another version; records that share an input hash share one call; a key already
 * in the Dedup Cache under the new pin is a cache hit, not a call. The mean is over the prompt's newest 200 priced runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { RederivationEstimator, type RederivationChange } from '../versions/rederivation-estimator';

type Row = Record<string, string | number | null>;

const fake = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, reads: [] as RunViewParams[] }));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class FakeRunView {
        public static FromMetadataProvider(): FakeRunView { return new FakeRunView(); }
        public async RunView(params: RunViewParams) {
            fake.reads.push(params);
            const rows = fake.tables[params.EntityName || ''] || [];
            const limited = typeof params.MaxRows === 'number' && params.MaxRows > 0 ? rows.slice(0, params.MaxRows) : rows;
            return { Success: true, Results: limited, TotalRowCount: limited.length, ErrorMessage: '' };
        }
    }
    return { ...actual, RunView: FakeRunView };
});

const user = { ID: 'user-1' } as Partial<UserInfo> as UserInfo;
const provider = {} as Partial<IMetadataProvider> as IMetadataProvider;
const change: RederivationChange = {
    ToVersion: 2, PromptID: 'PROMPT-1', PromptVersionHash: 'pvh-2', ConstraintHash: 'ch-2', AIModelID: 'MODEL-1', ParametersHash: 'ph-2',
};

/** `n` stale values: one feature per record, record i with input hash `hashOf(i)`. */
function staleValues(n: number, hashOf: (i: number) => string): Row[] {
    return Array.from({ length: n }, (_, i) => ({ RecordID: `r-${i}`, InputHash: hashOf(i), FeatureName: 'JobTitleLevel' }));
}

beforeEach(() => {
    fake.tables = {};
    fake.reads.length = 0;
});

describe('RederivationEstimator.Estimate (attack 5)', () => {
    it('returns the mean cost of the known prompt runs × the projected calls, with the basis', async () => {
        fake.tables['MJ: Feature Values'] = staleValues(10, (i) => `h-${i}`);
        fake.tables['MJ: AI Prompt Runs'] = [{ Cost: 0.001 }, { Cost: 0.002 }, { Cost: 0.003 }];
        const e = await RederivationEstimator.Estimate('RP-1', change, provider, user);
        expect(e.affectedValues).toBe(10);
        expect(e.affectedRecords).toBe(10);
        expect(e.expectedCacheHits).toBe(0);
        expect(e.projectedCalls).toBe(10);
        expect(e.basis).toEqual({ meanCostPerCall: 0.002, sampleSize: 3 });
        expect(e.projectedUsd).toBeCloseTo(0.02, 12);
    });

    it('records sharing an input hash share one call; a key cached under the new pin is a hit', async () => {
        fake.tables['MJ: Feature Values'] = staleValues(6, (i) => `h-${i % 3}`);
        fake.tables['MJ: Feature Value Caches'] = [{ KeyHash: 'h-0' }];
        fake.tables['MJ: AI Prompt Runs'] = [{ Cost: 0.01 }];
        const e = await RederivationEstimator.Estimate('RP-1', change, provider, user);
        expect(e.affectedValues).toBe(6);
        expect(e.expectedCacheHits).toBe(1);
        expect(e.projectedCalls).toBe(2);
        expect(e.projectedUsd).toBeCloseTo(0.02, 12);
    });

    it('reads the stale values of this Record Process under another version, and the prompt\'s newest 200 priced runs', async () => {
        fake.tables['MJ: Feature Values'] = staleValues(1, () => 'h');
        await RederivationEstimator.Estimate('RP-1', change, provider, user);
        const values = fake.reads.find((r) => r.EntityName === 'MJ: Feature Values');
        expect(values?.ExtraFilter).toContain("RecordProcessID='RP-1'");
        expect(values?.ExtraFilter).toContain('EffectiveTo IS NULL');
        expect(values?.ExtraFilter).toContain("Source='Pipeline'");
        expect(values?.ExtraFilter).toContain("Role='Champion'");
        expect(values?.ExtraFilter).toContain('PipelineVersion<>2');
        const runs = fake.reads.find((r) => r.EntityName === 'MJ: AI Prompt Runs');
        expect(runs?.ExtraFilter).toContain("PromptID='PROMPT-1'");
        expect(runs?.ExtraFilter).toContain('Cost IS NOT NULL');
        expect(runs?.MaxRows).toBe(RederivationEstimator.COST_SAMPLE_SIZE);
        expect(RederivationEstimator.COST_SAMPLE_SIZE).toBe(200);
        expect(String(runs?.OrderBy)).toMatch(/DESC/);
    });

    it('no priced prompt run yet: the mean is 0 and the projection is $0 over the calls', async () => {
        fake.tables['MJ: Feature Values'] = staleValues(4, (i) => `h-${i}`);
        const e = await RederivationEstimator.Estimate('RP-1', change, provider, user);
        expect(e.basis).toEqual({ meanCostPerCall: 0, sampleSize: 0 });
        expect(e.projectedCalls).toBe(4);
        expect(e.projectedUsd).toBe(0);
    });

    it('nothing stale: an empty estimate, no cache or cost read needed', async () => {
        const e = await RederivationEstimator.Estimate('RP-1', change, provider, user);
        expect(e).toMatchObject({ affectedValues: 0, affectedRecords: 0, expectedCacheHits: 0, projectedCalls: 0, projectedUsd: 0 });
    });
});
