/**
 * PR 5 milestone B3 — owner-batch item 2 (D5-14, D5-21, D5-28, D5-41), the `InferProcessor` run loop:
 *
 * - attack 5: a run that re-derives after a version change stores its `RederivationEstimate` in its own Process Run's
 *   `ResultSummary.Rederivation` before its first prompt call (so a run killed after that call still has it), and its
 *   final run summary carries it;
 * - attack 7: with `maxValuesPerRun` = 10 over 25 stale values, three runs re-derive 10, 10 and 5, oldest `EffectiveAsOf`
 *   first, and a fourth re-derives none; with `maxUsdPerRun` set, a run stops before the call that would pass it;
 * - attack 9 (the processor half): of two overlapping runs only the lease holder re-derives (the other `Yielded`), no
 *   value is re-derived twice, and a holder whose renewal is lost makes no further call.
 *
 * The database is faked at the Feature Pipelines statics the run loop calls (the stale-value read, the estimator, the
 * lease and the interim summary store); `rederivation-lease.test.ts` attacks the lease itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ChatResult, ModelUsage } from '@memberjunction/ai';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import {
    FeaturePipelineRunResults,
    FeaturePipelineVersionService,
    FeatureValueCacheService,
    RederivationEstimator,
    RederivationLease,
    RederivationSlice,
    type DataFeatureSpec,
    type FeaturePipelineRecordResult,
    type FeaturePipelineRunResult,
    type RecordFeatureValuesOutcome,
    type RederivationEstimate,
    type StaleRederivationRecord,
} from '@memberjunction/feature-pipelines';
import { KnowledgeHubMetadataEngine, type MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { InferProcessor } from '../processors/InferProcessor';

type PromptDouble = Pick<MJAIPromptEntityExtended, 'ID' | 'Name' | 'TemplateText' | 'ValidationBehavior'>;
const asPrompt = (p: PromptDouble): MJAIPromptEntityExtended => p as MJAIPromptEntityExtended;

const USER = new UserInfo();
const PEOPLE = new EntityInfo({ ID: 'ENT-P', Name: 'People', Fields: [{ Name: 'Title', TSType: 'string' }] });
/** The Feature Value store the run's stale values live in (a provider without it holds none). */
const FEATURE_VALUES = new EntityInfo({ ID: 'ENT-FV', Name: 'MJ: Feature Values', Fields: [] });
const provider = new EntitiesOnlyProvider([PEOPLE, FEATURE_VALUES]);
const OUTCOME: RecordFeatureValuesOutcome = { Upserted: 1, Unchanged: 0, Closed: 0, Previous: {} };
/** The mean cost of the prompt's priced runs, and what each faked call costs. */
const MEAN = 0.01;

/** An uncached spec (every record is its own call) and a cached one. */
const spec: DataFeatureSpec = {
    Name: 'Level', Description: 'level', PromptID: 'PROMPT-1', Context: { Fields: ['Title'] },
    Outputs: [{ Name: 'JobTitleLevel', Ref: '$.Level', Constraint: { Type: 'enum', Values: ['Director', 'Manager', 'VP'], OnViolation: 'fail' } }],
};
const cachedSpec: DataFeatureSpec = { ...spec, Caching: { Cacheable: true, KeyFields: ['ID'], Scope: 'pipeline' } };

/** The fake database the statics read: open values by record (version + EffectiveAsOf), the lease, the stored summaries. */
const world = {
    values: new Map<string, { Version: number; EffectiveAsOf: Date }>(),
    leaseHolder: null as string | null,
    leaseRenews: true,
    stored: [] as Array<{ ProcessRunID: string; Summary: FeaturePipelineRunResult }>,
    calls: [] as string[],
    events: [] as string[],
};

/** 25 records whose open values are version 1, r-0 the oldest; the pipeline is now at version 2. */
function seed(n: number): RecordRef[] {
    world.values.clear();
    const refs: RecordRef[] = [];
    for (let i = 0; i < n; i++) {
        world.values.set(`r-${i}`, { Version: 1, EffectiveAsOf: new Date(Date.UTC(2026, 0, 1 + i)) });
        refs.push({ EntityID: 'ENT-P', RecordID: `r-${i}`, Record: { ID: `r-${i}`, Title: `Title ${i}` } });
    }
    // the run loop hands records over in source order, not oldest first
    return [...refs].reverse();
}

function context(processRunID: string): RecordProcessorContext {
    return { ContextUser: USER, RecordProcessID: 'rp-1', EntityID: 'ENT-P', ProcessRunID: processRunID, Provider: provider, TriggeredBy: 'Schedule' };
}

/** One run: Preflight, the batches, the run summary, then the lease settled. */
async function runOnce(processRunID: string, records: RecordRef[], config: { maxValuesPerRun?: number; maxUsdPerRun?: number }, s: DataFeatureSpec = spec, batchSize = 25): Promise<{ Results: FeaturePipelineRecordResult[]; Summary: FeaturePipelineRunResult }> {
    const p = new InferProcessor('PROMPT-1', undefined, s, null);
    p.RederivationConfig = { maxUsdPerRun: config.maxUsdPerRun ?? 5, maxValuesPerRun: config.maxValuesPerRun ?? 10_000 };
    const ctx = context(processRunID);
    await p.Preflight(ctx);
    const results: FeaturePipelineRecordResult[] = [];
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = await p.ProcessBatch(records.slice(i, i + batchSize), ctx);
        results.push(...batch.values());
    }
    const built = p.BuildRunSummary({ RecordProcessID: 'rp-1', Counts: { Processed: results.length, Success: results.filter((r) => r.Status === 'Succeeded').length, Error: 0, Skipped: results.filter((r) => r.Status === 'Skipped').length }, Status: 'Completed', DryRun: false, Results: results });
    await p.RederivationSettled;
    return { Results: results, Summary: built.ResultSummary as FeaturePipelineRunResult };
}

beforeEach(() => {
    vi.restoreAllMocks();
    world.leaseHolder = null;
    world.leaseRenews = true;
    world.stored.length = 0;
    world.calls.length = 0;
    world.events.length = 0;
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([]);
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt({ ID: 'PROMPT-1', Name: 'L', TemplateText: 'Title {{record.Title}} {{ ConstraintBlock }}', ValidationBehavior: 'Strict' })]);
    vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockImplementation(async (params: AIPromptParams): Promise<AIPromptRunResult> => {
        const id = String((params.data as { record?: { ID?: string } } | undefined)?.record?.ID ?? '?');
        world.calls.push(id);
        world.events.push(`call ${id}`);
        const chat = new ChatResult(true, new Date(), new Date());
        chat.data = { choices: [], usage: new ModelUsage(10, 10, MEAN) };
        return { success: true, result: { Level: 'Director' }, chatResult: chat };
    });
    vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(null);
    vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
    vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue({ ID: 'cache-1' } as MJFeatureValueCacheEntity);
    vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 2, Status: 'Active' });
    vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (params) => {
        world.values.set(params.recordID, { Version: 2, EffectiveAsOf: new Date() });
        return OUTCOME;
    });
    vi.spyOn(RederivationSlice, 'ReadStale').mockImplementation(async (_rp: string, version: number): Promise<StaleRederivationRecord[]> =>
        [...world.values.entries()].filter(([, v]) => v.Version !== version)
            .sort((a, b) => a[1].EffectiveAsOf.getTime() - b[1].EffectiveAsOf.getTime())
            .map(([RecordID, v]) => ({ RecordID, EffectiveAsOf: v.EffectiveAsOf })));
    vi.spyOn(RederivationEstimator, 'Estimate').mockImplementation(async (): Promise<RederivationEstimate> => {
        const stale = [...world.values.values()].filter((v) => v.Version !== 2).length;
        world.events.push('estimate');
        return { affectedValues: stale, affectedRecords: stale, expectedCacheHits: 0, projectedCalls: stale, projectedUsd: stale * MEAN, basis: { meanCostPerCall: MEAN, sampleSize: 200 } };
    });
    vi.spyOn(RederivationLease, 'Acquire').mockImplementation(async (_rp: string, runId: string) => {
        await Promise.resolve();
        if (world.leaseHolder === null || world.leaseHolder === runId) {
            world.leaseHolder = runId;
            return { Held: true as const, LeaseID: 'lease-1' };
        }
        return { Held: false as const, HolderRunID: world.leaseHolder };
    });
    vi.spyOn(RederivationLease, 'Renew').mockImplementation(async () => world.leaseRenews);
    vi.spyOn(RederivationLease, 'Release').mockImplementation(async (_id: string, runId: string) => {
        if (world.leaseHolder === runId) world.leaseHolder = null;
        return true;
    });
    vi.spyOn(FeaturePipelineRunResults, 'StoreInterim').mockImplementation(async (processRunID: string, summary: FeaturePipelineRunResult) => {
        world.stored.push({ ProcessRunID: processRunID, Summary: summary });
        world.events.push('stored');
    });
});

describe('attack 7: three runs re-derive 10, 10 and 5 values, oldest first; a fourth none (D5-14)', () => {
    it('slices 25 stale values by maxValuesPerRun = 10 across runs, oldest EffectiveAsOf first', async () => {
        const records = seed(25);
        const done: string[][] = [];
        for (const run of ['run-1', 'run-2', 'run-3', 'run-4']) {
            const before = world.calls.length;
            // the run loop's watermark skips a record already computed under the current pin (its basis hash holds
            // the pin), so a later run is handed only the records not yet at version 2
            const handed = records.filter((x) => world.values.get(x.RecordID)?.Version !== 2);
            const r = await runOnce(run, handed, { maxValuesPerRun: 10 });
            done.push(world.calls.slice(before));
            if (run !== 'run-4') {
                expect(r.Summary.Rederivation).toMatchObject({ Rederived: done[done.length - 1].length, Yielded: false });
            }
        }
        expect(done.map((d) => d.length)).toEqual([10, 10, 5, 0]);
        expect([...done[0]].sort(byIndex)).toEqual(Array.from({ length: 10 }, (_, i) => `r-${i}`));
        expect([...done[1]].sort(byIndex)).toEqual(Array.from({ length: 10 }, (_, i) => `r-${i + 10}`));
        expect([...done[2]].sort(byIndex)).toEqual(Array.from({ length: 5 }, (_, i) => `r-${i + 20}`));
        // no value re-derived twice
        expect(new Set(world.calls).size).toBe(world.calls.length);
    });

    it('a record outside the slice is Skipped (no prompt call, no watermark), and the run records what remains', async () => {
        const records = seed(25);
        const r = await runOnce('run-1', records, { maxValuesPerRun: 10 });
        const skipped = r.Results.filter((x) => x.Status === 'Skipped');
        expect(skipped).toHaveLength(15);
        expect(skipped.every((x) => x.RederivationDeferred === true)).toBe(true);
        expect(r.Summary.Rederivation).toMatchObject({ Rederived: 10, Remaining: 15, Yielded: false });
    });

    it('with maxUsdPerRun = 3.5 × the mean call cost, a run stops before the call that would pass it', async () => {
        const records = seed(25);
        const r = await runOnce('run-1', records, { maxUsdPerRun: 3.5 * MEAN });
        expect(world.calls).toHaveLength(3);
        expect(r.Summary.Rederivation?.SpentUsd).toBeCloseTo(3 * MEAN, 10);
        expect(r.Summary.Rederivation?.Remaining).toBe(22);
    });

    it('a cached pipeline is sliced the same way (the slice applies before the Dedup Cache lookup)', async () => {
        const records = seed(25);
        const r = await runOnce('run-1', records, { maxValuesPerRun: 10 }, cachedSpec);
        expect(world.calls).toHaveLength(10);
        expect(r.Summary.Rederivation).toMatchObject({ Rederived: 10, Remaining: 15 });
    });

    it('a record whose value is already the current version is not budgeted', async () => {
        const records = seed(5);
        world.values.set('r-0', { Version: 2, EffectiveAsOf: new Date() });
        await runOnce('run-1', records, { maxValuesPerRun: 1 });
        // r-0 is current (computed outside the slice), r-1 is the oldest stale value
        expect([...world.calls].sort(byIndex)).toEqual(['r-0', 'r-1']);
    });
});

describe('attack 5: the estimate is stored on the run before its first prompt call', () => {
    it('stores ResultSummary.Rederivation.Estimate on the run\'s own Process Run before any prompt call', async () => {
        const records = seed(25);
        const r = await runOnce('run-1', records, { maxValuesPerRun: 10 });
        const first = world.events.findIndex((e) => e.startsWith('call'));
        expect(world.events.indexOf('stored')).toBeGreaterThanOrEqual(0);
        expect(world.events.indexOf('stored')).toBeLessThan(first);
        expect(world.stored[0].ProcessRunID).toBe('run-1');
        expect(world.stored[0].Summary.Rederivation?.Estimate).toMatchObject({ affectedValues: 25, projectedCalls: 25, projectedUsd: 25 * MEAN });
        expect(r.Summary.Rederivation?.Estimate).toEqual(world.stored[0].Summary.Rederivation?.Estimate);
    });

    it('a run killed after its first call still has the estimate on its run row', async () => {
        const records = seed(3);
        vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockImplementationOnce(async () => { throw new Error('process killed'); });
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.Preflight(context('run-killed'));
        await p.ProcessBatch(records.slice(0, 1), context('run-killed')).catch(() => undefined);
        expect(world.stored.map((s) => s.ProcessRunID)).toEqual(['run-killed']);
        expect(world.stored[0].Summary.Rederivation?.Estimate.affectedValues).toBe(3);
    });

    it('a dry run stores nothing and takes no lease', async () => {
        const records = seed(3);
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.Preflight({ ...context('run-dry'), DryRun: true });
        await p.ProcessBatch(records, { ...context('run-dry'), DryRun: true });
        expect(world.stored).toHaveLength(0);
        expect(RederivationLease.Acquire).not.toHaveBeenCalled();
    });
});

describe('attack 9 (processor half): overlapping runs of one Record Process', () => {
    it('only the lease holder re-derives; the other re-derives 0 and records Yielded: true', async () => {
        const records = seed(25);
        const a = new InferProcessor('PROMPT-1', undefined, spec, null);
        const b = new InferProcessor('PROMPT-1', undefined, spec, null);
        a.RederivationConfig = { maxUsdPerRun: 5, maxValuesPerRun: 10 };
        b.RederivationConfig = { maxUsdPerRun: 5, maxValuesPerRun: 10 };
        await Promise.all([a.Preflight(context('run-a')), b.Preflight(context('run-b'))]);
        const [ra, rb] = await Promise.all([a.ProcessBatch(records, context('run-a')), b.ProcessBatch(records, context('run-b'))]);
        const sum = (p: InferProcessor, m: Map<string, FeaturePipelineRecordResult>): FeaturePipelineRunResult =>
            p.BuildRunSummary({ RecordProcessID: 'rp-1', Counts: { Processed: m.size, Success: 0, Error: 0, Skipped: 0 }, Status: 'Completed', DryRun: false, Results: [...m.values()] }).ResultSummary as FeaturePipelineRunResult;
        const sa = sum(a, ra);
        const sb = sum(b, rb);
        const holder = sa.Rederivation?.Yielded ? sb : sa;
        const yielded = sa.Rederivation?.Yielded ? sa : sb;
        expect(holder.Rederivation).toMatchObject({ Rederived: 10, Yielded: false });
        expect(yielded.Rederivation).toMatchObject({ Rederived: 0, Yielded: true });
        expect(world.calls).toHaveLength(10);
        expect(new Set(world.calls).size).toBe(10);
    });

    it('a holder whose renewal is lost before a batch makes no further call (lease-lost)', async () => {
        const records = seed(25).reverse();
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        p.RederivationConfig = { maxUsdPerRun: 5, maxValuesPerRun: 20 };
        const ctx = context('run-a');
        await p.Preflight(ctx);
        await p.ProcessBatch(records.slice(0, 5), ctx);
        expect(world.calls).toHaveLength(5);
        world.leaseRenews = false;
        const second = await p.ProcessBatch(records.slice(5, 10), ctx);
        expect(world.calls).toHaveLength(5);
        expect([...second.values()].every((r) => r.Status === 'Skipped' && r.RederivationDeferred === true)).toBe(true);
        const s = p.BuildRunSummary({ RecordProcessID: 'rp-1', Counts: { Processed: 10, Success: 5, Error: 0, Skipped: 5 }, Status: 'Completed', DryRun: false, Results: [] }).ResultSummary as FeaturePipelineRunResult;
        expect(s.Rederivation).toMatchObject({ Rederived: 5, LeaseLost: true });
    });

    it('renews the lease before each batch', async () => {
        const records = seed(25).reverse();
        await runOnce('run-a', records, { maxValuesPerRun: 25 }, spec, 5);
        expect(vi.mocked(RederivationLease.Renew).mock.calls.length).toBeGreaterThanOrEqual(5);
    });
});

/** Orders record IDs `r-<n>` by n. */
function byIndex(a: string, b: string): number {
    return Number(a.slice(2)) - Number(b.slice(2));
}
