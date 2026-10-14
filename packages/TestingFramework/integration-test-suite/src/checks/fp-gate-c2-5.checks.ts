/**
 * Gate G7.5 "C1 → C2.5": every active pipeline version has a stored golden-set result at or above its declared
 * accuracy threshold, 100%, and a version below it is refused activation, 1 of 1. The bundle gates the installed
 * job-title pipeline cloned onto the stub driver (fp-gates/fp-gate-fixture.ts) with a golden-set test over the 52
 * golden titles, so the version gate is measured without model calls.
 */
import { RunView } from '@memberjunction/core';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJFeaturePipelineVersionEntity, MJRecordProcessEntity, MJTestEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';
import {
    GoldenLabelQualityCheck,
    TestEngine,
    type FeaturePipelineGoldenSetConfig,
    type FeaturePipelineGoldenSetInput,
    type LabelerIdentity,
} from '@memberjunction/testing-engine';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures as F, FIXTURE_NAME_PREFIX } from './fp-gates/fp-gate-fixture';
import { FeaturePipelineGateStubTable } from './fp-gates/feature-pipeline-gate-stub-driver';
import { GOLDEN_TITLES } from './fp-gates/golden-titles';

/** One golden-set test run's result (RunTest answers one result, or a list for a repeated test). */
type GoldenSetRunResult = Extract<Awaited<ReturnType<TestEngine['RunTest']>>, { status: string }>;

/** The version fields the checks read. */
type VersionRow = Pick<MJFeaturePipelineVersionEntity, 'ID' | 'Version' | 'Status' | 'Gated' | 'ResultValue' | 'Threshold' | 'GoldenSetTestRunID'>;

/** The golden-set test, its runs and the fixture's versions, shared by the bundle's checks; reset by the bundle's Setup. */
class GoldenSetGate {
    /** The accuracy the fixture pipeline's Activation declares. */
    public static readonly THRESHOLD = 0.9;
    /** The temperature the second check moves the fixture prompt to (from the fixture's 0), so the pin changes. */
    public static readonly NEW_TEMPERATURE = 0.2;
    /** The golden-set test the first check creates. */
    public static TestID: string | null = null;
    /** The version the first check activated. */
    public static ActivatedVersionID: string | null = null;

    /** Forgets a previous bundle run's state. */
    public static Reset(): void {
        GoldenSetGate.TestID = null;
        GoldenSetGate.ActivatedVersionID = null;
    }

    /** The golden-set test's ID; throws when the first check did not create it. */
    public static RequireTestID(): string {
        if (!GoldenSetGate.TestID) {
            throw new Error('The golden-set test was not created (the first C2.5 check did not run or failed before creating it).');
        }
        return GoldenSetGate.TestID;
    }

    /**
     * A golden-set test over the fixture's 52 titles. The gate proves activation mechanics, not label quality: three
     * fixture "labelers" give the table's labels, so the stored label-quality record passes deterministically (52/52
     * agreement, 0 excluded). Labelers B and C name two vendors because the label check requires two.
     */
    public static async CreateGoldenTest(ctx: IntegrationCheckContext): Promise<MJTestEntity> {
        const typeID = await F.LookupID(ctx, 'MJ: Test Types', `Name = 'Feature Pipeline Golden Set'`);
        const ids: Array<LabelerIdentity['ID']> = ['A', 'B', 'C'];
        const labelers: LabelerIdentity[] = ids.map((id) => ({ ID: id, Vendor: `gate fixture ${id}`, Model: 'GOLDEN_TITLES', PromptSha256: null }));
        const golden = await GoldenLabelQualityCheck.Adjudicate(GOLDEN_TITLES.map((g) => {
            const answer = { JobFunctions: g.Functions, SeniorityLevel: g.Seniority };
            return { ID: g.ID, Input: { CurrentJobTitle: g.Title }, A: answer, B: answer, C: answer };
        }), ['JobFunctions', 'SeniorityLevel'], labelers);
        Assert(golden.labelQuality.Passed, `fixture label quality: ${golden.labelQuality.Problems.join('; ')}`);
        const config: FeaturePipelineGoldenSetConfig = {
            RecordProcessID: F.Require(ctx).RecordProcessID,
            Outputs: { JobFunctions: { PrimaryItemOrderBy: 'Sequence', Compare: 'display-name' }, SeniorityLevel: { Compare: 'value' } },
        };
        const input: FeaturePipelineGoldenSetInput = { Cases: golden.cases, LabelQuality: golden.labelQuality };
        const test = await ctx.Provider.GetEntityObject<MJTestEntity>('MJ: Tests', ctx.User);
        test.NewRecord();
        test.Name = `${FIXTURE_NAME_PREFIX}golden set ${Date.now()}`;
        test.TypeID = typeID;
        test.Status = 'Active';
        test.Configuration = JSON.stringify(config);
        test.InputDefinition = JSON.stringify(input);
        Assert(await test.Save(), `save golden test: ${test.LatestResult?.CompleteMessage}`);
        F.Require(ctx).CreatedTestIDs.push(test.ID);
        // The engine runs tests from its cache, so it is refreshed to include the new test.
        await TestEngine.Instance.Config(true, ctx.User, ctx.Provider);
        return test;
    }

    /** Gates the fixture pipeline: its spec's Activation names the golden-set test at {@link THRESHOLD} accuracy. */
    public static async GateFixturePipeline(ctx: IntegrationCheckContext, testID: string): Promise<void> {
        const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        Assert(await rp.Load(F.Require(ctx).RecordProcessID), 'load fixture pipeline');
        const current = rp.Configuration ? SafeJSONParse<DataFeatureSpec>(rp.Configuration) : null;
        if (!current) {
            throw new Error('The fixture pipeline has no readable spec in its Configuration.');
        }
        const spec: DataFeatureSpec = { ...current, Activation: { GoldenSetTestID: testID, Metric: 'accuracy', Threshold: GoldenSetGate.THRESHOLD } };
        rp.Configuration = JSON.stringify(spec);
        Assert(await rp.Save(), `gate the fixture pipeline: ${rp.LatestResult?.CompleteMessage}`);
    }

    /** Runs the golden-set test once; returns its one result. */
    public static async RunGoldenSet(ctx: IntegrationCheckContext): Promise<GoldenSetRunResult> {
        const result = await TestEngine.Instance.RunTest(GoldenSetGate.RequireTestID(), { verbose: false }, ctx.User);
        const single = Array.isArray(result) ? result[0] : result;
        if (!single) {
            throw new Error('The golden-set test returned no result.');
        }
        return single;
    }

    /** The fixture pipeline's versions, in version order (a fresh read). */
    public static async Versions(ctx: IntegrationCheckContext): Promise<VersionRow[]> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<VersionRow>({
            EntityName: 'MJ: Feature Pipeline Versions', OrderBy: 'Version', ResultType: 'simple', BypassCache: true,
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}'`,
            Fields: ['ID', 'Version', 'Status', 'Gated', 'ResultValue', 'Threshold', 'GoldenSetTestRunID'],
        }, ctx.User);
        Assert(res.Success, `reading versions: ${res.ErrorMessage}`);
        return res.Results || [];
    }

    /** Moves the fixture prompt to {@link NEW_TEMPERATURE} (a new pin, so a new version) and waits for the engine to see it. */
    public static async ChangeTemperature(ctx: IntegrationCheckContext): Promise<void> {
        const fx = F.Require(ctx);
        const p = await ctx.Provider.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', ctx.User);
        Assert(await p.Load(fx.PromptID), 'load prompt');
        p.Temperature = GoldenSetGate.NEW_TEMPERATURE;
        Assert(await p.Save(), `save prompt: ${p.LatestResult?.CompleteMessage}`);
        await F.WaitFor(() => AIEngine.Instance.Prompts.some((x) => UUIDsEqual(x.ID, fx.PromptID) && x.Temperature === GoldenSetGate.NEW_TEMPERATURE),
            10_000, 'the engine to see the new temperature');
    }
}

/**
 * The C1 → C2.5 gate's checks (mutation tier: they create and change fixture rows). They run in order and share the
 * {@link GoldenSetGate} state: the second check gates the version after the one the first check activated, and the
 * third measures the database after both.
 */
export const FpGateC25Checks: NamedCheck[] = [
    {
        Id: 'fp-gate-c2-5.G1', Name: 'C2.5 the gated version activates only through a stored golden-set result at or above threshold', RequiresMutation: true,
        Fn: async (ctx) => {
            const test = await GoldenSetGate.CreateGoldenTest(ctx);
            GoldenSetGate.TestID = test.ID;
            await GoldenSetGate.GateFixturePipeline(ctx, test.ID);
            const refused = await F.Run(ctx);
            AssertEqual(refused.Status, 'Failed', 'a gated pipeline with no activated version is refused');
            Assert((refused.ErrorMessage || '').includes('is not activated'), `message: ${refused.ErrorMessage}`);
            const before = await GoldenSetGate.Versions(ctx);
            AssertEqual(before.length, 1, 'the refused run registered one version');
            AssertEqual(before[0].Status, 'Candidate', 'the version stays a Candidate until its golden-set result is stored');
            FeaturePipelineGateStubTable.Instance.Mode = 'golden';
            const evaluation = await GoldenSetGate.RunGoldenSet(ctx);
            AssertEqual(evaluation.status, 'Passed', `golden-set test status (${evaluation.errorMessage || 'no error'})`);
            const active = (await GoldenSetGate.Versions(ctx)).filter((x) => x.Status === 'Active');
            AssertEqual(active.length, 1, 'one active version');
            Assert(UUIDsEqual(active[0].ID, before[0].ID), 'the activated version is the one the refused run registered');
            Assert(UUIDsEqual(active[0].GoldenSetTestRunID, evaluation.testRunId), `the stored result is this golden-set run's (${active[0].GoldenSetTestRunID})`);
            Assert(typeof active[0].ResultValue === 'number' && active[0].ResultValue >= GoldenSetGate.THRESHOLD,
                `stored result ${active[0].ResultValue} >= ${GoldenSetGate.THRESHOLD}`);
            GoldenSetGate.ActivatedVersionID = active[0].ID;
            AssertEqual((await F.Run(ctx)).Status, 'Completed', 'the activated version runs');
        },
    },
    {
        Id: 'fp-gate-c2-5.G2', Name: 'C2.5 a version below its threshold is refused activation, 1 of 1', RequiresMutation: true,
        Fn: async (ctx) => {
            await GoldenSetGate.ChangeTemperature(ctx);
            const activatedID = GoldenSetGate.ActivatedVersionID;
            Assert(activatedID !== null, 'the first check recorded the version it activated');
            FeaturePipelineGateStubTable.Instance.Mode = 'degraded'; // 40/52 = 0.769 < 0.9
            let evaluationRunID = '';
            try {
                const evaluation = await GoldenSetGate.RunGoldenSet(ctx);
                AssertEqual(evaluation.status, 'Failed', `golden-set test status for the weaker version (${evaluation.errorMessage || 'no error'})`);
                evaluationRunID = evaluation.testRunId;
            } finally {
                FeaturePipelineGateStubTable.Instance.Mode = 'golden';
            }
            const versions = await GoldenSetGate.Versions(ctx);
            const refused = versions.filter((x) => x.Status === 'Refused');
            AssertEqual(refused.length, 1, 'refused versions');
            Assert(!UUIDsEqual(refused[0].ID, activatedID), 'the refused version is the new one, not the version the first check activated');
            const stillActive = versions.filter((x) => x.Status === 'Active');
            Assert(stillActive.length === 1 && UUIDsEqual(stillActive[0].ID, activatedID), 'the previously activated version stays the one Active version');
            Assert(refused[0].Version > stillActive[0].Version, `the refused version v${refused[0].Version} is newer than v${stillActive[0].Version}`);
            Assert(typeof refused[0].ResultValue === 'number' && refused[0].ResultValue < GoldenSetGate.THRESHOLD, `refused result ${refused[0].ResultValue}`);
            Assert(UUIDsEqual(refused[0].GoldenSetTestRunID, evaluationRunID), `the refused version's stored result is this golden-set run's (${refused[0].GoldenSetTestRunID})`);
            const row = await ctx.Provider.GetEntityObject<MJFeaturePipelineVersionEntity>('MJ: Feature Pipeline Versions', ctx.User);
            Assert(await row.Load(refused[0].ID), 'load refused version');
            row.Status = 'Active';
            AssertEqual(await row.Save(), false, 'activating a below-threshold version is refused by the save check');
            Assert((row.LatestResult?.CompleteMessage || '').includes('below the threshold'), `save message: ${row.LatestResult?.CompleteMessage}`);
            const run = await F.Run(ctx);
            AssertEqual(run.Status, 'Failed', 'a run under the refused version is refused');
            Assert((run.ErrorMessage || '').includes('was refused activation'), `run message: ${run.ErrorMessage}`);
            const after = await GoldenSetGate.Versions(ctx);
            AssertEqual(after.filter((x) => x.Status === 'Refused').length, 1, 'the refused version is still Refused after the attempts');
        },
    },
    {
        Id: 'fp-gate-c2-5.G3', Name: 'C2.5 every active gated version in the database has a stored result at or above its threshold (100%)', RequiresMutation: true,
        Fn: async (ctx) => {
            const rp = `'${EscapeSQLString(F.Require(ctx).RecordProcessID)}'`;
            const rows = await F.Query<{ Total: number; Bad: number; Fixture: number }>(ctx, `SELECT COUNT(*) AS Total,
                SUM(CASE WHEN GoldenSetTestRunID IS NULL OR ResultValue IS NULL OR Threshold IS NULL OR ResultValue < Threshold THEN 1 ELSE 0 END) AS Bad,
                SUM(CASE WHEN RecordProcessID = ${rp} THEN 1 ELSE 0 END) AS Fixture
                FROM [__mj].[FeaturePipelineVersion] WHERE Status = 'Active' AND Gated = 1`);
            AssertEqual(rows[0].Fixture, 1, 'the fixture pipeline has one active gated version');
            AssertEqual(rows[0].Bad, 0, `active gated versions without a passing stored result: ${rows[0].Bad} of ${rows[0].Total}`);
            console.log(`      → active gated versions with a passing stored result: ${rows[0].Total}/${rows[0].Total} (100%)`);
        },
    },
];

for (const c of FpGateC25Checks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
IntegrationCheckRegistry.Instance.RegisterLifecycle('fp-gate-c2-5', {
    Setup: async (ctx) => { GoldenSetGate.Reset(); await F.Setup(ctx); },
    Teardown: async (ctx) => { FeaturePipelineGateStubTable.Instance.Mode = 'golden'; await F.Teardown(ctx); },
});
