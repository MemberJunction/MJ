/**
 * Bundle 'feature-value-only': a Feature Pipeline whose three outputs have no write target, run through the
 * executor (so the write-back wraps the processor) over three real `MJ: Entities` rows, on the gate stub driver —
 * deterministic, no model calls. The pipeline writes nothing to `MJ: Entities`: its only stored values are its own
 * Feature Values. Setup deletes what an interrupted run left; teardown deletes everything the bundle created.
 */
import { RunView } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJProcessRunDetailEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import { ValidateSpec, type DataFeatureSpec, type SpecValidationIssue } from '@memberjunction/feature-pipelines';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import type { FeatureValuePreview, ProcessRunResult } from '@memberjunction/record-set-processor-base';
import {
    Assert, AssertDeepEqual, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck,
} from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures as F } from './fp-gates/fp-gate-fixture';
import { FeaturePipelineGateStubTable, type StubAnswer } from './fp-gates/feature-pipeline-gate-stub-driver';

/** The spec the bundle stores: every output has no `Target`. */
type ValueOnlySpec = Omit<DataFeatureSpec, 'Name' | 'PromptID' | 'PipelineType' | 'Unattended'>;

/** A Process Run Detail as the checks read it. */
type DetailRow = Pick<MJProcessRunDetailEntity, 'RecordID' | 'Status' | 'ResultPayload'>;

/** The slice of a detail's `ResultPayload` the checks read. */
interface DetailPayload {
    writeBack?: { previewFeatureValues?: FeatureValuePreview[] };
}

/** The Feature Value columns the checks compare. */
type StoredValue = Pick<MJFeatureValueEntity, 'RecordID' | 'FeatureName' | 'ValueText' | 'ValueNumeric' | 'ValueBoolean'>;

/** The bundle's pipeline: its rows, runs and reads. State carried between checks lives here and is reset by Setup. */
class FeatureValueOnlyBundle {
    /** Name of the prompt, its template and the Record Process (teardown deletes every row named from it). */
    public static readonly NAME = 'it126-feature-value-only';
    /** Name of the bundle's stub `MJ: Feature Pipeline Types` row. */
    public static readonly TYPE_NAME = 'it126-stub';
    /** Description of the bundle's spec and Record Process. */
    public static readonly DESCRIPTION = 'Integration test pipeline (stub driver, feature-value-only outputs).';
    /**
     * The answer the stub gives every input but the low-confidence one. `Score` and `Flag` arrive as strings, so the
     * checks pin the coercion of a target-less output end to end: stored as `ValueNumeric 0.75` and `ValueBoolean true`.
     */
    public static readonly ANSWER: StubAnswer = { Label: 'A', Score: '0.75', ScoreConfidence: 0.9, Flag: 'true' };

    /** The three `MJ: Entities` rows the bundle processes, in name order; the last one is the low-confidence record. */
    public static Records: Array<{ ID: string; Name: string }> = [];
    /** The Feature Value count after the real run (FV4 compares against it). */
    public static StoredAfterRealRun = 0;
    /** Each bundle record's `__mj_UpdatedAt` (ms) at setup: the pipeline has no targets, so it must never change. */
    public static UpdatedAtAtSetup = new UUIDMap<number>();

    /** The record the stub answers with a low `ScoreConfidence`, so its `Score` is withheld. */
    public static get LowConfidence(): { ID: string; Name: string } {
        return FeatureValueOnlyBundle.Records[2];
    }

    /** Clears an interrupted run, then creates the stub pipeline on `MJ: Entities` and points the stub at `Name`. */
    public static async Setup(ctx: IntegrationCheckContext): Promise<void> {
        await FeatureValueOnlyBundle.Teardown(ctx);
        FeatureValueOnlyBundle.StoredAfterRealRun = 0;
        const entity = ctx.Provider.EntityByName('MJ: Entities');
        if (!entity) {
            throw new Error('MJ: Entities is not in the metadata');
        }
        FeatureValueOnlyBundle.Records = await FeatureValueOnlyBundle.PickRecords(ctx);
        FeatureValueOnlyBundle.UpdatedAtAtSetup = await FeatureValueOnlyBundle.ReadUpdatedAt(ctx);
        await F.CreateStubPipeline(ctx, {
            Name: FeatureValueOnlyBundle.NAME,
            TypeName: FeatureValueOnlyBundle.TYPE_NAME,
            Description: FeatureValueOnlyBundle.DESCRIPTION,
            EntityID: entity.ID,
            Prompt: {
                TypeID: await F.LookupID(ctx, 'MJ: AI Prompt Types', `Name = 'Chat'`), CategoryID: null, ResponseFormat: 'JSON',
                TemplateText: 'Name: {{ record.Name }}\n{{ ConstraintBlock }}',
            },
            Model: { ModelID: await F.ActiveLLMID(ctx), VendorID: null },
            Spec: FeatureValueOnlyBundle.Spec(),
            // The runs hand the executor an explicit records scope, so the filter only has to admit those rows. No OutputMapping:
            // the executor wraps the processor in the write-back because an output has no write target, which carries the dry-run preview.
            RecordProcess: { CategoryID: null, ScopeFilter: '1=1', OutputMapping: null, WatermarkStrategy: 'Checksum' },
        });
        const table = FeaturePipelineGateStubTable.Instance;
        table.Clear();
        table.InputField = 'Name';
        table.Fallback = FeatureValueOnlyBundle.ANSWER;
        table.Answers.set(FeaturePipelineGateStubTable.KeyOf(FeatureValueOnlyBundle.LowConfidence.Name),
            { ...FeatureValueOnlyBundle.ANSWER, ScoreConfidence: 0.1 });
    }

    /** The bundle's spec: three outputs, none with a `Target`. */
    public static Spec(): ValueOnlySpec {
        return {
            Description: FeatureValueOnlyBundle.DESCRIPTION,
            Context: { Fields: ['Name'] },
            Caching: { Cacheable: true, KeyFields: ['Name'], TTLSeconds: 3600, Scope: 'pipeline' },
            Outputs: [
                { Name: 'Label', Ref: '$.Label', Constraint: { Type: 'enum', Values: ['A', 'B'], OnViolation: 'fail' } },
                {
                    Name: 'Score', Ref: '$.Score', ConfidenceRef: '$.ScoreConfidence',
                    MinConfidence: 0.5, OnLowConfidence: 'null',
                    Constraint: { Type: 'numeric', Min: 0, Max: 1, OnViolation: 'null' },
                },
                { Name: 'Flag', Ref: '$.Flag', Constraint: { Type: 'boolean', OnViolation: 'fail' } },
            ],
        };
    }

    /** The first three `MJ: Entities` rows by name: stable records the pipeline only reads. */
    protected static async PickRecords(ctx: IntegrationCheckContext): Promise<Array<{ ID: string; Name: string }>> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Entities', Fields: ['ID', 'Name'], ResultType: 'simple', OrderBy: 'Name', MaxRows: 3, BypassCache: true,
        }, ctx.User);
        const rows = res.Success ? res.Results || [] : [];
        if (rows.length < 3) {
            throw new Error(`MJ: Entities has fewer than three rows${res.Success ? '' : `: ${res.ErrorMessage}`}`);
        }
        return rows.map((r) => ({ ID: r.ID, Name: r.Name }));
    }

    /** The bundle records' `__mj_UpdatedAt` in ms, by record ID (read past the cache). */
    public static async ReadUpdatedAt(ctx: IntegrationCheckContext): Promise<UUIDMap<number>> {
        const ids = FeatureValueOnlyBundle.Records.map((r) => `'${EscapeSQLString(r.ID)}'`).join(',');
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; __mj_UpdatedAt: Date | string }>({
            EntityName: 'MJ: Entities', Fields: ['ID', '__mj_UpdatedAt'], ResultType: 'simple', BypassCache: true, ExtraFilter: `ID IN (${ids})`,
        }, ctx.User);
        Assert(res.Success, `reading the MJ: Entities rows: ${res.ErrorMessage}`);
        return new UUIDMap((res.Results || []).map((x): [string, number] => [x.ID, new Date(x.__mj_UpdatedAt).getTime()]));
    }

    /** Asserts the processed `MJ: Entities` rows were not written (their `__mj_UpdatedAt` is what Setup recorded). */
    public static async AssertRecordsUntouched(ctx: IntegrationCheckContext): Promise<void> {
        const now = await FeatureValueOnlyBundle.ReadUpdatedAt(ctx);
        for (const rec of FeatureValueOnlyBundle.Records) {
            AssertEqual(now.Get(rec.ID), FeatureValueOnlyBundle.UpdatedAtAtSetup.Get(rec.ID), `${rec.Name} __mj_UpdatedAt unchanged`);
        }
    }

    /** Deletes the bundle's pipeline and everything hanging off it, and restores the shared stub table. Never throws. */
    public static async Teardown(ctx: IntegrationCheckContext): Promise<void> {
        await F.TeardownStubPipeline(ctx, FeatureValueOnlyBundle.NAME, FeatureValueOnlyBundle.TYPE_NAME, 'feature-value-only');
    }

    /** Runs the pipeline through the executor over the three records (so write-back wraps the processor). */
    public static async Run(ctx: IntegrationCheckContext, dryRun: boolean): Promise<ProcessRunResult> {
        const r = await new RecordProcessExecutor().RunByID(F.Require(ctx).RecordProcessID, {
            contextUser: ctx.User, provider: ctx.Provider, triggeredBy: 'OnDemand', dryRun, SkipUnchanged: false,
            scope: { Kind: 'records', RecordIDs: FeatureValueOnlyBundle.Records.map((x) => x.ID) },
        });
        AssertEqual(r.Status, 'Completed', `status (${r.ErrorMessage || 'no error'})`);
        return r;
    }

    /** The run's Process Run Details by record. */
    public static async Details(ctx: IntegrationCheckContext, run: ProcessRunResult): Promise<DetailRow[]> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<DetailRow>({
            EntityName: 'MJ: Process Run Details', Fields: ['RecordID', 'Status', 'ResultPayload'], ResultType: 'simple', BypassCache: true,
            ExtraFilter: `ProcessRunID = '${EscapeSQLString(run.ProcessRunID || '')}'`,
        }, ctx.User);
        Assert(res.Success, `reading the run details: ${res.ErrorMessage}`);
        const rows = res.Results || [];
        AssertEqual(rows.length, FeatureValueOnlyBundle.Records.length, 'one detail per record');
        return rows;
    }

    /** The detail's dry-run preview, by feature name. */
    public static Previews(detail: DetailRow): Map<string, FeatureValuePreview> {
        const payload: DetailPayload = detail.ResultPayload ? JSON.parse(detail.ResultPayload) as DetailPayload : {};
        return new Map((payload.writeBack?.previewFeatureValues || []).map((p) => [p.FeatureName, p]));
    }

    /** The pipeline's stored Feature Values, read past the cache. */
    public static async Stored(ctx: IntegrationCheckContext): Promise<StoredValue[]> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<StoredValue>({
            EntityName: 'MJ: Feature Values', Fields: ['RecordID', 'FeatureName', 'ValueText', 'ValueNumeric', 'ValueBoolean'],
            ResultType: 'simple', BypassCache: true,
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}'`,
        }, ctx.User);
        Assert(res.Success, `reading the Feature Values: ${res.ErrorMessage}`);
        return res.Results || [];
    }

    /** One stored value of a record and feature. */
    public static ValueOf(rows: StoredValue[], recordID: string, feature: string): StoredValue | undefined {
        return rows.find((r) => UUIDsEqual(r.RecordID, recordID) && r.FeatureName === feature);
    }

    /** The record's detail. */
    public static DetailOf(details: DetailRow[], recordID: string): DetailRow {
        const d = details.find((x) => UUIDsEqual(x.RecordID, recordID));
        if (!d) {
            throw new Error(`no detail for record ${recordID}`);
        }
        return d;
    }

    /** The spec problems of severity error. */
    public static Errors(spec: DataFeatureSpec): SpecValidationIssue[] {
        return ValidateSpec(spec).filter((i) => i.Severity === 'error');
    }
}

const B = FeatureValueOnlyBundle;

export const FeatureValueOnlyChecks: NamedCheck[] = [
    {
        Id: 'feature-value-only.FV1', Name: 'FV1 the spec validates with no targets; an enum without Values and a lookup without Entity are refused', RequiresMutation: true,
        Fn: async (ctx) => {
            const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
            Assert(await rp.Load(F.Require(ctx).RecordProcessID), 'load the bundle pipeline');
            const stored = JSON.parse(rp.Configuration || '{}') as DataFeatureSpec;
            AssertDeepEqual(B.Errors(stored).map((i) => i.Message), [], 'the stored spec has no errors');
            const withOutput = (output: DataFeatureSpec['Outputs'][number]): DataFeatureSpec => ({ ...stored, Outputs: [output] });
            AssertDeepEqual(B.Errors(withOutput({ Name: 'Kind', Ref: '$.Kind', Constraint: { Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail' } })).map((i) => i.Message),
                ["Output 'Kind' has no write target, so its enum constraint cannot read a field's value list: list Constraint.Values, or give the output a field target."],
                'enum without a value list');
            AssertDeepEqual(B.Errors(withOutput({ Name: 'Fn', Ref: '$.Fn', Constraint: { Type: 'lookup', OnViolation: 'fail' } })).map((i) => i.Message),
                ["Output 'Fn' has no write target, so its lookup constraint has no entity: set Constraint.Entity, or give the output a field target."],
                'lookup without an entity');
        },
    },
    {
        Id: 'feature-value-only.FV2', Name: 'FV2 a dry run stores nothing and previews each record\'s Feature Values', RequiresMutation: true,
        Fn: async (ctx) => {
            const run = await B.Run(ctx, true);
            AssertEqual((await B.Stored(ctx)).length, 0, 'the dry run stored no Feature Value');
            const details = await B.Details(ctx, run);
            for (const rec of B.Records) {
                const previews = B.Previews(B.DetailOf(details, rec.ID));
                const low = UUIDsEqual(rec.ID, B.LowConfidence.ID);
                AssertEqual(previews.size, low ? 2 : 3, `preview items for ${rec.Name}`);
                AssertEqual(previews.get('Label')?.Proposed, 'A', `${rec.Name} Label`);
                AssertEqual(previews.get('Flag')?.Proposed, true, `${rec.Name} Flag`);
                if (low) {
                    Assert(!previews.has('Score'), 'the low-confidence record previews no Score');
                } else {
                    AssertEqual(previews.get('Score')?.Proposed, 0.75, `${rec.Name} Score`);
                }
            }
        },
    },
    {
        Id: 'feature-value-only.FV3', Name: 'FV3 a real run upserts every record into the typed value columns', RequiresMutation: true,
        Fn: async (ctx) => {
            const run = await B.Run(ctx, false);
            const summary = await F.Summary(ctx, run.ProcessRunID);
            AssertEqual(summary.Upserted, B.Records.length, 'every record upserted');
            AssertEqual(summary.Unchanged, 0, 'none unchanged');
            const stored = await B.Stored(ctx);
            for (const rec of B.Records) {
                AssertEqual(B.ValueOf(stored, rec.ID, 'Label')?.ValueText, 'A', `${rec.Name} Label ValueText`);
                AssertEqual(B.ValueOf(stored, rec.ID, 'Flag')?.ValueBoolean, true, `${rec.Name} Flag ValueBoolean`);
                if (UUIDsEqual(rec.ID, B.LowConfidence.ID)) {
                    const score = B.ValueOf(stored, rec.ID, 'Score');
                    Assert(!score || (score.ValueNumeric === null && score.ValueText === null), `${rec.Name} withheld Score holds no value`);
                } else {
                    AssertEqual(Number(B.ValueOf(stored, rec.ID, 'Score')?.ValueNumeric), 0.75, `${rec.Name} Score ValueNumeric`);
                }
            }
            await B.AssertRecordsUntouched(ctx);
            B.StoredAfterRealRun = stored.length;
            const details = await B.Details(ctx, run);
            AssertEqual(details.filter((d) => d.Status === 'Succeeded').length, B.Records.length, 'every detail Succeeded');
        },
    },
    {
        Id: 'feature-value-only.FV4', Name: 'FV4 an identical rerun leaves every record unchanged', RequiresMutation: true,
        Fn: async (ctx) => {
            Assert(B.StoredAfterRealRun > 0, 'FV3 stored values (FV4 runs after FV3)');
            const run = await B.Run(ctx, false);
            const summary = await F.Summary(ctx, run.ProcessRunID);
            AssertEqual(summary.Unchanged, B.Records.length, 'every record unchanged');
            AssertEqual(summary.Upserted, 0, 'none upserted');
            AssertEqual((await B.Stored(ctx)).length, B.StoredAfterRealRun, 'no new Feature Values');
            await B.AssertRecordsUntouched(ctx);
        },
    },
    {
        Id: 'feature-value-only.FV5', Name: 'FV5 a low-confidence Score is withheld: its row holds no value', RequiresMutation: true,
        Fn: async (ctx) => {
            const stored = await B.Stored(ctx);
            const score = B.ValueOf(stored, B.LowConfidence.ID, 'Score');
            Assert(!score || (score.ValueNumeric === null && score.ValueText === null), 'the withheld Score holds no value');
            AssertEqual(B.ValueOf(stored, B.LowConfidence.ID, 'Label')?.ValueText, 'A', 'its other outputs are stored');
            const other = B.Records.find((r) => !UUIDsEqual(r.ID, B.LowConfidence.ID));
            AssertEqual(Number(B.ValueOf(stored, other?.ID || '', 'Score')?.ValueNumeric), 0.75, 'a confident record keeps its Score');
        },
    },
];

for (const c of FeatureValueOnlyChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
IntegrationCheckRegistry.Instance.RegisterLifecycle('feature-value-only', {
    Setup: async (ctx) => { await FeatureValueOnlyBundle.Setup(ctx); },
    Teardown: async (ctx) => { await FeatureValueOnlyBundle.Teardown(ctx); },
});
