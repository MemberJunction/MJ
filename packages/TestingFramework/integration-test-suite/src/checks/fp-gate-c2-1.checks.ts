/**
 * Gate G7.1 "C1 → C2.1": changing the job-title prompt, its AI model or a parameter forces recomputation of 100% of
 * the affected values, and an expired entry is recomputed. The bundle runs the installed job-title pipeline cloned onto
 * the stub driver (fp-gates/fp-gate-fixture.ts), so it measures the cache keys and pins without model calls; it also
 * diffs the gates' copy of the golden titles against the golden set bizapps-common installs.
 */
import { RunView } from '@memberjunction/core';
import { type MJAIPromptModelEntity, type MJFeatureValueCacheEntity, type MJFeatureValueEntity, type MJTemplateContentEntity } from '@memberjunction/core-entities';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { EscapeSQLString, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { PromptTemplateContent, type FeaturePipelineRunPin } from '@memberjunction/feature-pipelines';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures as F } from './fp-gates/fp-gate-fixture';
import { FeaturePipelineGateStubTable } from './fp-gates/feature-pipeline-gate-stub-driver';
import { ALL_GOLDEN_TITLES, GOLDEN_TITLES, GoldenTitleCopy } from './fp-gates/golden-titles';

/** 52 people, 52 distinct titles. */
const N = GOLDEN_TITLES.length;
const stub = (): FeaturePipelineGateStubTable => FeaturePipelineGateStubTable.Instance;

/** The steps of the change-then-recompute checks: pin filters, recompute counts, the change-then-recompute run, and the fixture reads. */
class ChangeRecomputeSteps {
    /** The Feature Value / cache filter that selects rows computed under `pin` (an absent model is `IS NULL`). */
    public static PinFilter(pin: FeaturePipelineRunPin): string {
        const model = pin.AIModelID ? `AIModelID = '${EscapeSQLString(pin.AIModelID)}'` : 'AIModelID IS NULL';
        return `PromptVersionHash = '${EscapeSQLString(pin.PromptVersionHash || '')}' AND ParametersHash = '${EscapeSQLString(pin.ParametersHash || '')}' AND ${model}`;
    }

    /** How many fixture people hold Feature Values computed under the run's pin, and how often the stub was asked. */
    public static async Recomputed(ctx: IntegrationCheckContext, pin: FeaturePipelineRunPin): Promise<{ People: number; Calls: number }> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeatureValueEntity, 'RecordID'>>({
            EntityName: 'MJ: Feature Values', Fields: ['RecordID'], ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}' AND Source = 'Pipeline' AND ${ChangeRecomputeSteps.PinFilter(pin)}`,
        }, ctx.User);
        Assert(res.Success, `reading Feature Values: ${res.ErrorMessage}`);
        return { People: new UUIDSet((res.Results || []).map((r) => r.RecordID)).Size, Calls: stub().Calls.length };
    }

    /** The pin a fixture run computed under, from its stored FeaturePipelineRunResult; a run must record one. */
    public static async PinOf(ctx: IntegrationCheckContext, processRunID: string | undefined): Promise<FeaturePipelineRunPin> {
        const pin = (await F.Summary(ctx, processRunID)).Pin;
        if (!pin) {
            throw new Error(`Process Run ${processRunID} recorded no pin in its ResultSummary (a completed Feature Pipeline run always has one)`);
        }
        return pin;
    }

    /**
     * Runs the fixture (so the cache holds every title under the current pin), applies `change`, and runs again: the new
     * run's pin must differ in the changed part, every title must reach the stub, and every person must hold values
     * computed under the new pin.
     */
    public static async ChangeThenRecompute(ctx: IntegrationCheckContext, label: string, change: () => Promise<void>,
        changed: (pin: FeaturePipelineRunPin, before: FeaturePipelineRunPin) => boolean): Promise<void> {
        // Both runs bypass the watermark skip, so every record reaches the cache: the control proves the cache serves
        // every title before the change, and the run after it proves the change alone made them recompute.
        stub().ResetCalls();
        const before = await ChangeRecomputeSteps.PinOf(ctx, (await F.Run(ctx, { SkipUnchanged: false })).ProcessRunID);
        AssertEqual(stub().Calls.length, 0, `${label}: before the change every title is served from the cache`);
        await change();
        stub().ResetCalls();
        const run = await F.Run(ctx, { SkipUnchanged: false });
        AssertEqual(run.Status, 'Completed', `${label}: run status`);
        const pin = await ChangeRecomputeSteps.PinOf(ctx, run.ProcessRunID);
        Assert(changed(pin, before), `${label}: the run's pin must differ from the previous one`);
        const r = await ChangeRecomputeSteps.Recomputed(ctx, pin);
        AssertEqual(r.Calls, N, `${label}: every distinct input recomputed (no stale cache served)`);
        AssertEqual(r.People, N, `${label}: ${r.People}/${N} people hold values under the new pin`);
        console.log(`      → ${label}: recomputed ${r.People}/${N} (100%)`);
    }

    /** The template content the prompt renders (the highest-priority content, as a Feature Pipeline run reads it: `PromptTemplateContent`). */
    public static async RenderedContent(ctx: IntegrationCheckContext, templateID: string): Promise<MJTemplateContentEntity> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTemplateContentEntity>({
            EntityName: 'MJ: Template Contents', ExtraFilter: `TemplateID = '${EscapeSQLString(templateID)}'`,
            ResultType: 'entity_object', BypassCache: true, // the row is edited and saved
        }, ctx.User);
        const content = res.Success ? PromptTemplateContent.SelectHighestPriority(res.Results || []) : undefined;
        if (!content) {
            throw new Error(`template ${templateID} has no content${res.Success ? '' : `: ${res.ErrorMessage}`}`);
        }
        return content;
    }

    /** The fixture's cache rows for one title under `pin`. */
    public static async CacheRows(ctx: IntegrationCheckContext, title: string, pin: FeaturePipelineRunPin): Promise<MJFeatureValueCacheEntity[]> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJFeatureValueCacheEntity>({
            EntityName: 'MJ: Feature Value Caches', ResultType: 'entity_object', BypassCache: true, // the row is expired through Save
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(F.Require(ctx).RecordProcessID)}' AND KeyDisplay = N'${EscapeSQLString(title)}' AND ${ChangeRecomputeSteps.PinFilter(pin)}`,
        }, ctx.User);
        Assert(res.Success, `reading the cache rows of '${title}': ${res.ErrorMessage}`);
        return res.Results || [];
    }
}

export const FpGateC21Checks: NamedCheck[] = [
    {
        Id: 'fp-gate-c2-1.G1', Name: 'C2.1 baseline: 52/52 people computed', RequiresMutation: true,
        Fn: async (ctx) => {
            stub().ResetCalls();
            const run = await F.Run(ctx);
            AssertEqual(run.Status, 'Completed', 'baseline status');
            AssertEqual(stub().Calls.length, N, 'one computation per distinct title');
        },
    },
    {
        Id: 'fp-gate-c2-1.G2', Name: 'C2.1 prompt change: a template edit recomputes 100%, without a restart', RequiresMutation: true,
        Fn: async (ctx) => {
            const fx = F.Require(ctx);
            const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, fx.PromptID));
            if (!prompt?.TemplateID) {
                throw new Error('the fixture prompt has no template');
            }
            const marker = `<!-- template edit ${Date.now()} -->`;
            await ChangeRecomputeSteps.ChangeThenRecompute(ctx, 'template edit', async () => {
                const tc = await ChangeRecomputeSteps.RenderedContent(ctx, prompt.TemplateID);
                tc.TemplateText = `${tc.TemplateText}\n${marker}`;
                Assert(await tc.Save(), `save template content: ${tc.LatestResult?.CompleteMessage}`);
            }, (pin, before) => pin.PromptVersionHash !== before.PromptVersionHash);
        },
    },
    {
        Id: 'fp-gate-c2-1.G3', Name: 'C2.1 model change: a new primary AI model recomputes 100%', RequiresMutation: true,
        Fn: async (ctx) => {
            const fx = F.Require(ctx);
            await ChangeRecomputeSteps.ChangeThenRecompute(ctx, 'AI model change', async () => {
                const pm = await ctx.Provider.GetEntityObject<MJAIPromptModelEntity>('MJ: AI Prompt Models', ctx.User);
                Assert(await pm.Load(fx.PromptModelID), 'load prompt model');
                const otherID = await F.ActiveLLMID(ctx, pm.ModelID);
                pm.ModelID = otherID;
                Assert(await pm.Save(), `save prompt model: ${pm.LatestResult?.CompleteMessage}`);
                await F.WaitFor(() => AIEngine.Instance.PromptModels.some((x) => UUIDsEqual(x.ID, fx.PromptModelID) && UUIDsEqual(x.ModelID, otherID)),
                    10_000, 'the engine to see the new model');
            }, (pin, before) => !UUIDsEqual(pin.AIModelID, before.AIModelID));
        },
    },
    {
        Id: 'fp-gate-c2-1.G4', Name: 'C2.1 parameter change: a new temperature recomputes 100%', RequiresMutation: true,
        Fn: async (ctx) => {
            const fx = F.Require(ctx);
            await ChangeRecomputeSteps.ChangeThenRecompute(ctx, 'parameter change', async () => {
                const p = await ctx.Provider.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', ctx.User);
                Assert(await p.Load(fx.PromptID), 'load prompt');
                p.Temperature = 0.1;
                Assert(await p.Save(), `save prompt: ${p.LatestResult?.CompleteMessage}`);
                await F.WaitFor(() => AIEngine.Instance.Prompts.some((x) => UUIDsEqual(x.ID, fx.PromptID) && x.Temperature === 0.1),
                    10_000, 'the engine to see the new temperature');
            }, (pin, before) => pin.ParametersHash !== before.ParametersHash);
        },
    },
    {
        Id: 'fp-gate-c2-1.G5', Name: 'C2.1 expired entry: recomputed once, refreshed in place, then served', RequiresMutation: true,
        Fn: async (ctx) => {
            // The earlier checks left one cache row per title and pin; the current pin is the one a fresh run reports.
            const title = GOLDEN_TITLES[0].Title;
            const pin = await ChangeRecomputeSteps.PinOf(ctx, (await F.Run(ctx)).ProcessRunID);
            const before = await ChangeRecomputeSteps.CacheRows(ctx, title, pin);
            AssertEqual(before.length, 1, 'one cache row for the title under the current pin');
            before[0].ExpiresAt = new Date(Date.now() - 86_400_000);
            Assert(await before[0].Save(), `expire the cache row: ${before[0].LatestResult?.CompleteMessage}`);
            const employeeTypeID = await F.EmployeeRelationshipTypeID(ctx);
            const p1 = await F.AddPerson(ctx, 950, title, employeeTypeID);
            stub().ResetCalls();
            AssertEqual((await F.Run(ctx, { Records: [p1] })).Status, 'Completed', 'run on a new person with the expired title');
            AssertEqual(stub().Calls.length, 1, 'the expired entry was recomputed');
            const after = await ChangeRecomputeSteps.CacheRows(ctx, title, pin);
            AssertEqual(after.length, 1, 'no duplicate cache row');
            Assert(UUIDsEqual(after[0].ID, before[0].ID), 'refreshed in place');
            Assert(!!after[0].ExpiresAt && new Date(after[0].ExpiresAt).getTime() > Date.now(), 'expiry pushed into the future');
            const p2 = await F.AddPerson(ctx, 951, title, employeeTypeID);
            stub().ResetCalls();
            AssertEqual((await F.Run(ctx, { Records: [p2] })).Status, 'Completed', 'run on the next person with the title');
            AssertEqual(stub().Calls.length, 0, 'the refreshed entry is served to the next person');
        },
    },
    {
        // Read-only: gated only because the bundle runs in the mutation tier (its lifecycle Setup writes the fixture).
        Id: 'fp-gate-c2-1.G6', Name: 'golden titles: the gate copy equals the installed golden set', RequiresMutation: true,
        Fn: async (ctx) => {
            const problems = GoldenTitleCopy.Differences(ALL_GOLDEN_TITLES, await F.InstalledGoldenCases(ctx));
            Assert(problems.length === 0, `the gates' golden titles drifted from the installed golden set: ${problems.slice(0, 5).join('; ')}`);
        },
    },
];

for (const c of FpGateC21Checks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
IntegrationCheckRegistry.Instance.RegisterLifecycle('fp-gate-c2-1', {
    Setup: async (ctx) => { await F.Setup(ctx); },
    Teardown: async (ctx) => { await F.Teardown(ctx); },
});
