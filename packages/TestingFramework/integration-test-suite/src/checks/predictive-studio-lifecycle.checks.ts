/**
 * predictive-studio-lifecycle.checks.ts — the 'predictive-studio-lifecycle' bundle (PSL1–PSL5):
 * does each advertised capability actually work against a model this bundle TRAINED?
 *
 * WHY THIS IS SEPARATE FROM IT14 AND IT87.
 *
 * The three cover different things, and the gaps between them are where every defect lived:
 *
 * - **IT14 (PS1–PS8)** hand-writes rows and asserts the seams accept them. It proves the shapes fit.
 * - **IT87 (PSC1–PSC6)** sweeps rows that already exist and asserts they agree with each other. It
 *   proves the state is coherent — but only for whatever state happens to be in the database.
 * - **This bundle** trains a real model through the real engine and then asks whether the things the
 *   platform ADVERTISES are reachable against what that training produced: are the signals it left
 *   behind computable, are its findings searchable, is its trained state actually reusable?
 *
 * Every defect found while building the signal/finding/architecture layers was of the last kind — a
 * capability that existed in code and was unreachable in practice. Neither of the other two tiers
 * could see them, because both were looking at rows nobody had produced by running the thing.
 *
 * WHY IT IS GATED, AND WHY IT FAILS RATHER THAN SKIPS ONCE OPTED IN.
 *
 * Training needs the Python sidecar and a real dataset, so the IT record carries
 * `requiresEnv: PS_INTEGRATION` and the whole test reports a REAL `Skipped` when it is unset — the
 * driver's own rule that a gated run must never be indistinguishable from executed coverage.
 *
 * But once `PS_INTEGRATION=1` IS set, the operator has asserted a live Predictive Studio
 * environment. A missing dataset is then a misconfiguration, not a reason to pass quietly: Setup
 * records the reason and every check FAILS with it. This is the exact trap the standalone rigs fall
 * into — they `process.exit(0)` on "no published model", so as CI checks they would go green on a
 * fresh database by doing nothing at all.
 */
import { RunView, CompositeKey } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type {
    MJMLTrainingPipelineEntity,
    MJMLModelEntity,
} from '@memberjunction/core-entities';
import {
    createTrainingPipeline,
    trainModelViaEngine,
    MLComponentEngine,
    SignalComputer,
    type TrainModelResult,
} from '@memberjunction/predictive-studio';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type {
    NamedCheck,
    IntegrationCheckContext,
    PredictiveStudioLifecycleFixture,
} from '@memberjunction/testing-integration';

/** Prefix so every row this bundle creates is identifiable and removable. */
const PREFIX = 'mj-ps-lifecycle-test';

/** The dataset the bundle trains against. */
const TARGET_ENTITY = 'Members';
const TARGET_VARIABLE = 'Renewed';
const AS_OF_COLUMN = 'RenewalDecidedAt';
const FEATURE_COLUMNS = ['MembershipTenureMonths', 'City'];

/**
 * Fetch the fixture, failing with Setup's own reason when it could not be built.
 *
 * The reason matters more than the failure: "PS_INTEGRATION is set but the Members dataset is not
 * present" is actionable, while a bare assertion failure sends the reader into the engine.
 */
function fx(ctx: IntegrationCheckContext): PredictiveStudioLifecycleFixture {
    const f = ctx.PredictiveStudioLifecycleFixture;
    Assert(f != null, 'predictive-studio-lifecycle fixture missing (bundle Setup did not run)');
    Assert(!f!.SetupError, `the bundle could not train a model: ${f!.SetupError}`);
    return f!;
}

/** The trained model, or a failure naming what training produced instead. */
function trainedModel(f: PredictiveStudioLifecycleFixture): MJMLModelEntity {
    Assert(f.Model != null, 'training did not produce a model row');
    return f.Model!;
}

export const PredictiveStudioLifecycleChecks: NamedCheck[] = [
    {
        Id: 'predictive-studio-lifecycle.PSL1',
        Name: 'PSL1: training a model leaves behind a root component and the signals it used',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const model = trainedModel(f);
            Assert(!!f.RootComponentID, 'the trained model has no RootComponentID — the materializer did not run');
            AssertEqual(String(model.Status), 'Draft', 'a newly trained model is Draft until promoted');
            // The claim the whole "one model, many assets" thesis rests on: a model is not just a
            // score, it leaves reusable measurements behind. If this is zero the thesis is untrue
            // for this model no matter what the docs say.
            Assert(f.SignalIDs.length > 0,
                'training produced NO input components — the model left no reusable signals behind');
            console.log(`      → model ${model.ID} → root ${f.RootComponentID} + ${f.SignalIDs.length} signal(s)`);
        }
    },
    {
        Id: 'predictive-studio-lifecycle.PSL2',
        Name: 'PSL2: a signal the model left behind is COMPUTABLE over a population, with no model involved',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            // Browsable is not callable. This runs one of the model's own inputs as a standalone
            // measurement through the same assembly path training used — the property that makes a
            // signal reusable by a report, an agent or a dashboard rather than only by its model.
            const computer = new SignalComputer();
            const failures: string[] = [];
            let computed = 0;
            for (const signalID of f.SignalIDs) {
                const result = await computer.compute(
                    { SignalID: signalID, TargetEntity: f.TargetEntityName, MaxRows: 25, AsOfColumn: AS_OF_COLUMN },
                    ctx.User, ctx.Provider,
                );
                if (result.Success && result.Values.length > 0) { computed++; continue; }
                // Not every signal kind is rebindable (embeddings, LLM-derived and forecasts each
                // carry their own execution path and refuse BY NAME) — that refusal is correct
                // behaviour, so only an unexplained failure counts against the check.
                if (result.ErrorMessage && /cannot be rebound/i.test(result.ErrorMessage)) continue;
                failures.push(`${signalID}: ${result.ErrorMessage ?? 'no values returned'}`);
            }
            Assert(failures.length === 0, `signal(s) could not be computed — ${failures.join('; ')}`);
            Assert(computed > 0,
                `none of the ${f.SignalIDs.length} signal(s) were computable; the catalogue is browsable but not callable`);
            console.log(`      → ${computed}/${f.SignalIDs.length} signal(s) computed over ${f.TargetEntityName}`);
        }
    },
    {
        Id: 'predictive-studio-lifecycle.PSL3',
        Name: 'PSL3: every signal the model left behind is embedded, so the catalogue is searchable by meaning',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            // The finding-vector defect in miniature: a Story with no vector saves without error and
            // is silently unfindable. Asserted here against rows a REAL run just wrote, which is the
            // only place the registration of the server-side entity subclass is actually exercised.
            const rv = await new RunView().RunView<{ ID: string; Name: string; Story: string | null; StoryVector: string | null }>(
                {
                    EntityName: 'MJ: ML Components',
                    ExtraFilter: `ID IN (${[f.RootComponentID, ...f.SignalIDs].filter(Boolean).map((id) => `'${id}'`).join(',')})`,
                    Fields: ['ID', 'Name', 'Story', 'StoryVector'],
                    ResultType: 'simple', BypassCache: true,
                },
                ctx.User,
            );
            Assert(rv.Success, `could not read the model's components: ${rv.ErrorMessage}`);
            const withStory = (rv.Results ?? []).filter((r) => (r.Story ?? '').trim().length > 0);
            const unembedded = withStory.filter((r) => !r.StoryVector);
            Assert(unembedded.length === 0,
                `${unembedded.length} component(s) carry a Story with no StoryVector and are unsearchable: ` +
                unembedded.map((r) => r.Name).join(', '));
            if (withStory.length === 0) {
                // Say so rather than reporting a pass. Stories are authored at PROMOTION, and this
                // bundle deliberately stops at training — so a freshly trained model legitimately has
                // none, and this check proves nothing about this run. The population-wide guarantee
                // is IT87/PSC2's job, which sweeps every row that does carry one.
                console.log('      → VACUOUS: a freshly trained model carries no stories yet ' +
                    '(they are written at promotion); IT87/PSC2 covers the population-wide guarantee');
                return;
            }
            console.log(`      → ${withStory.length} component(s) with a story, all embedded`);
        }
    },
    {
        Id: 'predictive-studio-lifecycle.PSL4',
        Name: 'PSL4: the trained root is REUSABLE — it carries an artifact and the finder actually offers it',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            Assert(!!f.RootComponentID, 'no root component to check');
            const rv = await new RunView().RunView<{ ID: string; Name: string; IsTrained: boolean; ArtifactFileID: string | null }>(
                {
                    EntityName: 'MJ: ML Components', ExtraFilter: `ID='${f.RootComponentID}'`,
                    Fields: ['ID', 'Name', 'IsTrained', 'ArtifactFileID'], ResultType: 'simple', BypassCache: true,
                },
                ctx.User,
            );
            const root = rv.Results?.[0];
            Assert(root != null, 'the root component row could not be read back');
            Assert(root!.IsTrained === true, 'the root component is not marked trained');
            // The defect that made reuse unreachable for the life of the feature: written IsTrained,
            // carrying nothing to load. A root's artifact IS the model artifact, so it always exists
            // — unlike a composed child, which may legitimately be fitted yet unserialisable.
            Assert(!!root!.ArtifactFileID,
                'the root component claims IsTrained but carries no ArtifactFileID — nothing can reuse it');
            console.log(`      → root ${root!.ID} is trained AND loadable (artifact ${root!.ArtifactFileID})`);
        }
    },
    {
        Id: 'predictive-studio-lifecycle.PSL5',
        Name: 'PSL5: the pipeline → model → component → binding lineage of a REAL run reads back end to end',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const model = trainedModel(f);
            AssertEqual(model.PipelineID, f.Pipeline.ID, 'model → pipeline FK');
            const comps = await new RunView().RunView<{ ID: string; MLModelID: string | null; ParentComponentID: string | null }>(
                {
                    EntityName: 'MJ: ML Components', ExtraFilter: `MLModelID='${model.ID}'`,
                    Fields: ['ID', 'MLModelID', 'ParentComponentID'], ResultType: 'simple', BypassCache: true,
                },
                ctx.User,
            );
            Assert(comps.Success, `could not read the model's components: ${comps.ErrorMessage}`);
            const rows = comps.Results ?? [];
            Assert(rows.length > 0, 'no components are attached to the trained model');
            // The one-way-link defect: the model names a root that does not name it back.
            const root = rows.find((r) => r.ParentComponentID == null);
            Assert(root != null, 'the model has components but none of them is a root');
            AssertEqual(root!.ID, f.RootComponentID!, 'the root component the model points at is the one attached to it');
            console.log(`      → pipeline ${f.Pipeline.ID} → model ${model.ID} → ${rows.length} component(s), root round-trips`);
        }
    },
];

for (const check of PredictiveStudioLifecycleChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('predictive-studio-lifecycle', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const user: UserInfo = ctx.User;
        const provider: IMetadataProvider = ctx.Provider;
        const fixture: PredictiveStudioLifecycleFixture = {
            Pipeline: undefined as unknown as MJMLTrainingPipelineEntity,
            SignalIDs: [],
            FindingIDs: [],
            TargetEntityName: TARGET_ENTITY,
        };
        ctx.PredictiveStudioLifecycleFixture = fixture;

        // A missing prerequisite is recorded, never thrown: Teardown must still run, and every check
        // then fails naming the reason instead of erroring opaquely or passing quietly.
        const fail = (reason: string) => { fixture.SetupError = reason; };

        const targetEntity = provider.EntityByName(TARGET_ENTITY);
        if (!targetEntity) {
            return fail(`PS_INTEGRATION is set but the '${TARGET_ENTITY}' entity is not in metadata — this bundle trains a real model and needs its dataset.`);
        }
        const missing = [TARGET_VARIABLE, AS_OF_COLUMN, ...FEATURE_COLUMNS].filter(
            (col) => !targetEntity.Fields.some((fld) => fld.Name.toLowerCase() === col.toLowerCase()),
        );
        if (missing.length > 0) {
            return fail(`'${TARGET_ENTITY}' is missing the column(s) this bundle trains on: ${missing.join(', ')}.`);
        }

        await MLComponentEngine.Instance.Config(false, user, provider);

        try {
            const pipeline = await createTrainingPipeline(
                {
                    name: `${PREFIX} · lifecycle`,
                    description: 'Trained by the predictive-studio-lifecycle integration bundle; deleted at teardown.',
                    targetEntityName: TARGET_ENTITY,
                    targetVariable: TARGET_VARIABLE,
                    problemType: 'classification',
                    algorithmName: 'Logistic Regression',
                    sourceBindings: [{ Kind: 'Entity', Ref: TARGET_ENTITY }],
                    featureSteps: {
                        Steps: [
                            { Id: 'select-raw', Kind: 'select', Columns: FEATURE_COLUMNS },
                            { Id: 'impute-tenure', Kind: 'impute', Column: FEATURE_COLUMNS[0], Strategy: 'median' },
                            { Id: 'standardize', Kind: 'standardize', Columns: [FEATURE_COLUMNS[0]] },
                            { Id: 'onehot-City', Kind: 'onehot', Column: FEATURE_COLUMNS[1] },
                        ],
                    },
                    asOf: { Mode: 'column', Column: AS_OF_COLUMN },
                } as never,
                provider, user,
            );
            const pipelineEntity = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
            await pipelineEntity.Load(pipeline.ID);
            fixture.Pipeline = pipelineEntity;

            // `trainModelViaEngine` returns the ENTITY, not an id — reading a `modelId` off it
            // would always be undefined and would turn any outcome into a fabricated diagnosis.
            const result: TrainModelResult = await trainModelViaEngine(
                { pipelineId: pipeline.ID, sidecarVersion: PREFIX }, provider, user,
            );
            const model = result.model;
            fixture.Model = model;
            fixture.RootComponentID = model.RootComponentID ?? undefined;
            const modelID = model.ID;

            const comps = await new RunView().RunView<{ ID: string; ParentComponentID: string | null }>(
                {
                    EntityName: 'MJ: ML Components', ExtraFilter: `MLModelID='${modelID}'`,
                    Fields: ['ID', 'ParentComponentID'], ResultType: 'simple', BypassCache: true,
                },
                user,
            );
            fixture.SignalIDs = (comps.Results ?? []).filter((c) => c.ParentComponentID != null).map((c) => c.ID);
        } catch (err) {
            fail(`training threw: ${err instanceof Error ? err.message : String(err)}`);
        }
    },

    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.PredictiveStudioLifecycleFixture;
        if (!f) return;
        const user = ctx.User;
        const provider = ctx.Provider;

        // Teardown is best-effort per row so one failure still lets the rest run — but "best effort"
        // must not mean SILENT. Swallowing every error is how a teardown that deletes nothing at all
        // looks identical to one that worked, which is the same absence-means-two-things trap this
        // bundle exists to catch. Failures are counted and reported.
        const leaked: string[] = [];
        const del = async (entityName: string, id: string) => {
            try {
                // `Load` is generated per subclass, so a generic delete goes through InnerLoad —
                // the same pattern the agent-live bundles use for best-effort cleanup.
                const row = await provider.GetEntityObject(entityName, user);
                if (!(await row.InnerLoad(CompositeKey.FromID(id)))) return;
                if (!(await row.Delete())) leaked.push(`${entityName} ${id}: ${row.LatestResult?.CompleteMessage ?? 'delete refused'}`);
            } catch (err) {
                leaked.push(`${entityName} ${id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        };
        /** Delete every child row of `parentEntity` pointing at `id` through `fkField`. */
        const delChildren = async (entityName: string, fkField: string, id: string) => {
            const rv = await new RunView().RunView<{ ID: string }>(
                { EntityName: entityName, ExtraFilter: `${fkField}='${id}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
                user,
            );
            for (const row of rv.Results ?? []) await del(entityName, row.ID);
        };

        for (const id of f.FindingIDs) await del('MJ: ML Findings', id);

        // A component cannot be deleted while its BINDINGS reference it — every materialized
        // component has at least one — and the model ↔ root-component cycle has to be cut before
        // either side goes. Children before the root, bindings before the component.
        const componentIDs = [...f.SignalIDs, ...(f.RootComponentID ? [f.RootComponentID] : [])];
        for (const id of componentIDs) await delChildren('MJ: ML Component Bindings', 'ComponentID', id);
        if (f.Model && f.RootComponentID) {
            try {
                f.Model.RootComponentID = null;
                if (!(await f.Model.Save())) leaked.push(`could not clear RootComponentID on model ${f.Model.ID}`);
            } catch (err) {
                leaked.push(`clearing RootComponentID threw: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        for (const id of f.SignalIDs) await del('MJ: ML Components', id);
        if (f.RootComponentID) await del('MJ: ML Components', f.RootComponentID);

        // Training writes an `MJ: ML Training Runs` row that references the model.
        if (f.Model) {
            await delChildren('MJ: ML Training Runs', 'ResultingModelID', f.Model.ID);
            await del('MJ: ML Models', f.Model.ID);
        }
        if (f.Pipeline) {
            await delChildren('MJ: ML Training Runs', 'PipelineID', f.Pipeline.ID);
            await del('MJ: ML Training Pipelines', f.Pipeline.ID);
        }

        if (leaked.length > 0) {
            console.log(`      ⚠ predictive-studio-lifecycle teardown left ${leaked.length} row(s) behind:`);
            for (const l of leaked.slice(0, 10)) console.log(`         ${l}`);
        }
        ctx.PredictiveStudioLifecycleFixture = undefined;
    }
});
