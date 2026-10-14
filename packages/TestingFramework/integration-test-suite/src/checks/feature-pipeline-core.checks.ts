/**
 * Bundle 'feature-pipeline-core': the Feature Value key, the Dedup Cache, the version gate, the dry run and the
 * error-rate breaker, against MJ core tables only (no bizapps-common), on the gate stub driver — deterministic,
 * self-cleaning, no model calls.
 *
 * The pipeline runs on `MJ: Entities` over in-memory records (their IDs and names start with `it123-`), straight
 * through `RecordSetProcessor` with no write-back, so nothing outside the pipeline's own rows (Feature Values, cache
 * rows, watermarks, versions, process runs) is written. Setup deletes what an interrupted run left; teardown deletes
 * everything the bundle created.
 */
import { RunView } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import type { MJAIModelEntity, MJFeaturePipelineVersionEntity, MJFeatureValueCacheEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';
import { InferProcessor, RecordSetProcessor } from '@memberjunction/record-set-processor';
import { ArraySource, type ProcessRunResult, type RecordRef, type TriggeredByValue } from '@memberjunction/record-set-processor-base';
import {
    Assert, AssertDeepEqual, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck,
} from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures as F } from './fp-gates/fp-gate-fixture';
import { FeaturePipelineGateStubTable, type StubAnswer } from './fp-gates/feature-pipeline-gate-stub-driver';

/** Options of one bundle run. */
interface CoreRunOptions {
    /** What triggered the run (default `OnDemand`). */
    Trigger?: TriggeredByValue;
    /** Compute without writing. */
    DryRun?: boolean;
    /** Skip records whose watermark is unchanged. */
    SkipUnchanged?: boolean;
}

/** The pipeline-owned entities the bundle counts, each filtered by RecordProcessID. */
type PipelineRowEntity = 'MJ: Feature Values' | 'MJ: Feature Value Caches' | 'MJ: Record Process Watermarks' | 'MJ: Feature Pipeline Versions';

/** The bundle's pipeline: its rows, runs and reads. State carried between checks lives here and is reset by Setup. */
class FeaturePipelineCoreBundle {
    /** Name of the prompt, its template and the Record Process (teardown deletes every row named from it). */
    public static readonly NAME = 'it123-feature-pipeline-core';
    /** Name of the bundle's stub `MJ: Feature Pipeline Types` row. */
    public static readonly TYPE_NAME = 'it123-stub';
    /** Description of the bundle's spec and Record Process. */
    public static readonly DESCRIPTION = 'Integration test pipeline (stub driver, MJ core only).';
    /** The answer the stub gives an input it has no table entry for. */
    public static readonly FALLBACK_ANSWER: StubAnswer = { Label: 'A' };

    /** The cache row FP3 created for "director of sales", which FP4 expires. */
    public static DirectorCacheRowID: string | null = null;

    /** Clears an interrupted run, then creates the stub pipeline on `MJ: Entities` and points the stub at `Name`. */
    public static async Setup(ctx: IntegrationCheckContext): Promise<void> {
        await FeaturePipelineCoreBundle.Teardown(ctx);
        FeaturePipelineCoreBundle.DirectorCacheRowID = null;
        const entity = ctx.Provider.EntityByName('MJ: Entities');
        if (!entity) {
            throw new Error('MJ: Entities is not in the metadata');
        }
        const spec: Omit<DataFeatureSpec, 'Name' | 'PromptID' | 'PipelineType' | 'Unattended'> = {
            Description: FeaturePipelineCoreBundle.DESCRIPTION,
            Context: { Fields: ['Name'] },
            Caching: { Cacheable: true, KeyFields: ['Name'], TTLSeconds: 3600, Scope: 'pipeline' },
            Outputs: [{
                Name: 'Label', Ref: '$.Label', Constraint: { Type: 'enum', Values: ['A', 'B'], OnViolation: 'fail' },
                Target: { Mode: 'field', EntityFieldName: 'Description' },
            }],
        };
        await F.CreateStubPipeline(ctx, {
            Name: FeaturePipelineCoreBundle.NAME,
            TypeName: FeaturePipelineCoreBundle.TYPE_NAME,
            Description: FeaturePipelineCoreBundle.DESCRIPTION,
            EntityID: entity.ID,
            Prompt: {
                TypeID: await F.LookupID(ctx, 'MJ: AI Prompt Types', `Name = 'Chat'`), CategoryID: null, ResponseFormat: 'JSON',
                TemplateText: 'Name: {{ record.Name }}\n{{ ConstraintBlock }}',
            },
            Model: { ModelID: await FeaturePipelineCoreBundle.FirstLLM(ctx), VendorID: null },
            Spec: spec,
            // Never run by scope: the checks hand the processor their own in-memory records.
            RecordProcess: { CategoryID: null, ScopeFilter: '1=0', OutputMapping: null, WatermarkStrategy: 'Checksum' },
        });
        const table = FeaturePipelineGateStubTable.Instance;
        table.Clear();
        table.InputField = 'Name';
        table.Fallback = FeaturePipelineCoreBundle.FALLBACK_ANSWER;
    }

    /** Deletes the bundle's pipeline and everything hanging off it, and restores the shared stub table. Never throws. */
    public static async Teardown(ctx: IntegrationCheckContext): Promise<void> {
        try {
            const problems = await F.DeleteStubPipeline(ctx, FeaturePipelineCoreBundle.NAME, FeaturePipelineCoreBundle.TYPE_NAME);
            FeaturePipelineGateStubTable.Instance.Clear();
            await AIEngine.Instance.Config(true, ctx.User, ctx.Provider);
            await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
            if (problems.length > 0) {
                console.warn(`feature-pipeline-core teardown: ${problems.join('; ')}`);
            }
        } catch (e) {
            console.warn(`feature-pipeline-core teardown: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** The first active LLM by name (the stub answers, so which one does not matter; a stable choice keeps the pin stable). */
    protected static async FirstLLM(ctx: IntegrationCheckContext): Promise<string> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIModelEntity, 'ID'>>({
            EntityName: 'MJ: AI Models', Fields: ['ID'], ResultType: 'simple', MaxRows: 1, OrderBy: 'Name',
            ExtraFilter: `AIModelType = 'LLM' AND IsActive = 1`,
        }, ctx.User);
        const id = res.Success ? res.Results?.[0]?.ID : undefined;
        if (!id) {
            throw new Error(`no active LLM model exists${res.Success ? '' : `: ${res.ErrorMessage}`}`);
        }
        return id;
    }

    /** An in-memory `MJ: Entities` record the pipeline reads `Name` from. */
    public static Ref(ctx: IntegrationCheckContext, n: number | string, name: string): RecordRef {
        const id = `it123-${n}`;
        return { EntityID: F.Require(ctx).EntityID, RecordID: id, Record: { ID: id, Name: name } };
    }

    /** Runs the pipeline over `refs` as a Feature Pipeline run (processor built from the saved row, as the executor does). */
    public static async Run(ctx: IntegrationCheckContext, refs: RecordRef[], opts: CoreRunOptions = {}): Promise<ProcessRunResult> {
        const fx = F.Require(ctx);
        const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        Assert(await rp.Load(fx.RecordProcessID), 'load the bundle pipeline');
        return RecordSetProcessor.Instance.Process({
            source: new ArraySource(refs, fx.EntityID), processor: InferProcessor.FromRecordProcess(rp, ctx.Provider),
            contextUser: ctx.User, provider: ctx.Provider, recordProcessID: fx.RecordProcessID, entityID: fx.EntityID,
            triggeredBy: opts.Trigger || 'OnDemand', dryRun: opts.DryRun, FeaturePipeline: true,
            skipUnchanged: opts.SkipUnchanged === true, watermarkStrategy: 'Checksum', batchSize: 100,
        });
    }

    /** How many rows of `entityName` belong to the bundle's pipeline. */
    public static async Count(ctx: IntegrationCheckContext, entityName: PipelineRowEntity): Promise<number> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView({
            EntityName: entityName, ResultType: 'count_only', BypassCache: true,
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}'`,
        }, ctx.User);
        Assert(res.Success, `counting ${entityName}: ${res.ErrorMessage}`);
        return res.TotalRowCount;
    }

    /** The pipeline's cache rows (entity objects: FP4 saves one). */
    public static async CacheRows(ctx: IntegrationCheckContext): Promise<MJFeatureValueCacheEntity[]> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJFeatureValueCacheEntity>({
            EntityName: 'MJ: Feature Value Caches', ResultType: 'entity_object', BypassCache: true, // FP4 saves the row
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}'`,
        }, ctx.User);
        Assert(res.Success, `reading the cache rows: ${res.ErrorMessage}`);
        return res.Results || [];
    }

    /** The pipeline's versions, oldest first. */
    public static async Versions(ctx: IntegrationCheckContext): Promise<Array<Pick<MJFeaturePipelineVersionEntity, 'Version' | 'Status'>>> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeaturePipelineVersionEntity, 'Version' | 'Status'>>({
            EntityName: 'MJ: Feature Pipeline Versions', Fields: ['Version', 'Status'], ResultType: 'simple', OrderBy: 'Version',
            BypassCache: true, ExtraFilter: `RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}'`,
        }, ctx.User);
        Assert(res.Success, `reading the versions: ${res.ErrorMessage}`);
        // RunView adds the primary key to the named fields; the checks compare version and status only.
        return (res.Results || []).map((v) => ({ Version: v.Version, Status: v.Status }));
    }

    /** Sets the bundle prompt's temperature (a parameter change: a new pipeline version) and waits for the engine to see it. */
    public static async SetTemperature(ctx: IntegrationCheckContext, temperature: number): Promise<void> {
        const fx = F.Require(ctx);
        const p = await ctx.Provider.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', ctx.User);
        Assert(await p.Load(fx.PromptID), 'load the bundle prompt');
        p.Temperature = temperature;
        Assert(await p.Save(), `save the bundle prompt: ${p.LatestResult?.CompleteMessage}`);
        await F.WaitFor(() => AIEngine.Instance.Prompts.some((x) => UUIDsEqual(x.ID, fx.PromptID) && x.Temperature === temperature),
            10_000, `the engine to see temperature ${temperature}`);
    }
}

const B = FeaturePipelineCoreBundle;
const stub = (): FeaturePipelineGateStubTable => FeaturePipelineGateStubTable.Instance;

export const FeaturePipelineCoreChecks: NamedCheck[] = [
    {
        Id: 'feature-pipeline-core.FP1', Name: 'FP1 the first run activates v1 and writes one Feature Value per record', RequiresMutation: true,
        Fn: async (ctx) => {
            const r = await B.Run(ctx, [B.Ref(ctx, 1, 'Alpha'), B.Ref(ctx, 2, 'Beta')], { Trigger: 'Schedule' });
            AssertEqual(r.Status, 'Completed', `status (${r.ErrorMessage || 'no error'})`);
            AssertEqual(await B.Count(ctx, 'MJ: Feature Values'), 2, 'Feature Values');
            AssertEqual((await F.Summary(ctx, r.ProcessRunID)).Pin?.PipelineVersion, 1, 'the run computed under version 1');
            AssertDeepEqual(await B.Versions(ctx), [{ Version: 1, Status: 'Active' }], 'versions');
        },
    },
    {
        Id: 'feature-pipeline-core.FP2', Name: 'FP2 an identical second run changes nothing (upsert on the key)', RequiresMutation: true,
        Fn: async (ctx) => {
            const r = await B.Run(ctx, [B.Ref(ctx, 1, 'Alpha'), B.Ref(ctx, 2, 'Beta')]);
            AssertEqual(r.Status, 'Completed', `status (${r.ErrorMessage || 'no error'})`);
            const summary = await F.Summary(ctx, r.ProcessRunID);
            AssertEqual(summary.Unchanged, 2, 'unchanged');
            AssertEqual(summary.Upserted, 0, 'upserted');
            AssertEqual(await B.Count(ctx, 'MJ: Feature Values'), 2, 'no new Feature Values');
        },
    },
    {
        Id: 'feature-pipeline-core.FP3', Name: 'FP3 two spellings of one value share a cache row and one computation', RequiresMutation: true,
        Fn: async (ctx) => {
            const before = await B.CacheRows(ctx);
            stub().ResetCalls();
            const r = await B.Run(ctx, [B.Ref(ctx, 3, 'Director of Sales'), B.Ref(ctx, 4, ' director  of sales ')]);
            AssertEqual(r.Status, 'Completed', `status (${r.ErrorMessage || 'no error'})`);
            AssertEqual(stub().Calls.length, 1, 'one computation for both spellings');
            const added = (await B.CacheRows(ctx)).filter((row) => !before.some((b) => UUIDsEqual(b.ID, row.ID)));
            AssertEqual(added.length, 1, 'one new cache row for both spellings');
            AssertEqual(await B.Count(ctx, 'MJ: Feature Values'), 4, 'both records hold a Feature Value');
            B.DirectorCacheRowID = added[0].ID;
        },
    },
    {
        Id: 'feature-pipeline-core.FP4', Name: 'FP4 an expired entry is recomputed once and refreshed in place', RequiresMutation: true,
        Fn: async (ctx) => {
            const rowID = B.DirectorCacheRowID;
            if (!rowID) {
                throw new Error('FP3 recorded no cache row (FP4 runs after FP3)');
            }
            // Control: while the entry is live, a new record with the value is served from it.
            stub().ResetCalls();
            AssertEqual((await B.Run(ctx, [B.Ref(ctx, 8, 'Director of Sales')])).Status, 'Completed', 'control run');
            AssertEqual(stub().Calls.length, 0, 'a live entry is served without computing');
            const row = (await B.CacheRows(ctx)).find((c) => UUIDsEqual(c.ID, rowID));
            if (!row) {
                throw new Error(`cache row ${rowID} no longer exists`);
            }
            row.ExpiresAt = new Date(Date.now() - 86_400_000);
            Assert(await row.Save(), `expire the cache row: ${row.LatestResult?.CompleteMessage}`);
            const countBefore = await B.Count(ctx, 'MJ: Feature Value Caches');
            stub().ResetCalls();
            AssertEqual((await B.Run(ctx, [B.Ref(ctx, 5, 'Director of Sales')])).Status, 'Completed', 'run on the expired value');
            AssertEqual(stub().Calls.length, 1, 'recomputed once');
            AssertEqual(await B.Count(ctx, 'MJ: Feature Value Caches'), countBefore, 'no new cache row');
            const after = (await B.CacheRows(ctx)).find((c) => UUIDsEqual(c.ID, rowID));
            if (!after) {
                throw new Error('the expired cache row was replaced instead of refreshed in place');
            }
            Assert(!!after.ExpiresAt && new Date(after.ExpiresAt).getTime() > Date.now(), 'the expiry moved into the future');
        },
    },
    {
        Id: 'feature-pipeline-core.FP5', Name: 'FP5 a version change holds scheduled runs until an on-demand run', RequiresMutation: true,
        Fn: async (ctx) => {
            await B.SetTemperature(ctx, 0.3);
            const held = await B.Run(ctx, [B.Ref(ctx, 1, 'Alpha')], { Trigger: 'Schedule' });
            AssertEqual(held.Status, 'Failed', 'the scheduled run is held');
            AssertEqual(held.Processed, 0, 'nothing processed');
            Assert((held.ErrorMessage || '').includes('on-demand run'), `the message names the on-demand run: ${held.ErrorMessage}`);
            const backfill = await B.Run(ctx, [B.Ref(ctx, 1, 'Alpha')]);
            AssertEqual(backfill.Status, 'Completed', `on-demand backfill (${backfill.ErrorMessage || 'no error'})`);
            AssertDeepEqual(await B.Versions(ctx), [{ Version: 1, Status: 'Retired' }, { Version: 2, Status: 'Active' }], 'versions');
        },
    },
    {
        Id: 'feature-pipeline-core.FP6', Name: 'FP6 a dry run writes no cache, value, watermark or version rows', RequiresMutation: true,
        Fn: async (ctx) => {
            await B.SetTemperature(ctx, 0.4);
            const entities: PipelineRowEntity[] = ['MJ: Feature Values', 'MJ: Feature Value Caches', 'MJ: Record Process Watermarks', 'MJ: Feature Pipeline Versions'];
            const before = await Promise.all(entities.map((e) => B.Count(ctx, e)));
            stub().ResetCalls();
            const r = await B.Run(ctx, [B.Ref(ctx, 6, 'Gamma'), B.Ref(ctx, 7, 'Delta')], { DryRun: true, SkipUnchanged: true });
            AssertEqual(r.Success, 2, 'the dry run computed both records');
            AssertEqual(stub().Calls.length, 2, 'both records reached the driver');
            AssertEqual((await F.Summary(ctx, r.ProcessRunID)).Previewed, 2, 'previewed');
            AssertDeepEqual(await Promise.all(entities.map((e) => B.Count(ctx, e))), before, 'row counts unchanged');
        },
    },
    {
        Id: 'feature-pipeline-core.FP7', Name: 'FP7 25 skipped + 2 failed ends Failed: the breaker uses attempted records', RequiresMutation: true,
        Fn: async (ctx) => {
            const watermarked = Array.from({ length: 25 }, (_, i) => B.Ref(ctx, `w${i}`, `Watermarked ${i}`));
            const first = await B.Run(ctx, watermarked, { SkipUnchanged: true });
            AssertEqual(first.Status, 'Completed', `watermarking run (${first.ErrorMessage || 'no error'})`);
            // No table entry and no fallback: the stub fails the two new names.
            stub().Fallback = undefined;
            try {
                const r = await B.Run(ctx, [...watermarked, B.Ref(ctx, 'f1', 'force-fail one'), B.Ref(ctx, 'f2', 'force-fail two')], { SkipUnchanged: true });
                AssertEqual(r.Skipped, 25, 'skipped on their watermark');
                AssertEqual(r.Error, 2, 'failed');
                AssertEqual(r.Status, 'Failed', 'status');
                // 2 failures of 27 records is 7%, under the 20% threshold; of the 2 attempted it is 100%.
                Assert((r.ErrorMessage || '').startsWith('Circuit breaker') && (r.ErrorMessage || '').includes('of 2 attempted'),
                    `the breaker tripped on the attempted records: ${r.ErrorMessage}`);
            } finally {
                stub().Fallback = B.FALLBACK_ANSWER;
            }
        },
    },
];

for (const c of FeaturePipelineCoreChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
IntegrationCheckRegistry.Instance.RegisterLifecycle('feature-pipeline-core', {
    Setup: async (ctx) => { await FeaturePipelineCoreBundle.Setup(ctx); },
    Teardown: async (ctx) => { await FeaturePipelineCoreBundle.Teardown(ctx); },
});
