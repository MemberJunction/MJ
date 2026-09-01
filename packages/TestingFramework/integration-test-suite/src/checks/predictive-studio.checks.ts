/**
 * predictive-studio.checks.ts — the 'predictive-studio' bundle (PS1–PS8): live, full-stack (headless)
 * integration checks for Predictive Studio's STACK SEAMS over the real provider/transport: ML entity
 * CRUD, the `'ML Model'` Record Set Processing work-type registration + resolution, the four
 * Predictive Studio Actions in real metadata + invoked through the real Action-execution path, and
 * (PS6–PS8) the typed-component model: component-type CRUD with the hierarchy columns the base view
 * only emits when the self-FK is opted into hierarchy support, profile resolution + tree lint over
 * the SHIPPED seed tree, and the Model → Component → Binding → Entity Field meaning chain.
 * Graduated verbatim from integration-test-scripts/predictive-studio-tests.ts.
 *
 * Deterministic + sidecar-free by default (PS1–PS5 seams only). The only live-sidecar leg is an
 * internal PS5 leg gated on PS_INTEGRATION=1 (read inline, verbatim). The Predictive Studio engine is
 * imported for its side effects (the @RegisterClass decorators on the scoring processor + the four
 * actions). The bundle lifecycle creates the Pipeline → Model → Binding lineage fixture once and tears
 * it down (child → parent) afterwards.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJMLTrainingPipelineEntity,
    MJMLModelEntity,
    MJMLModelScoringBindingEntity,
    MJMLComponentEntity,
    MJMLComponentBindingEntity,
    MJMLComponentTypeEntity,
} from '@memberjunction/core-entities';
import {
    RecordProcessorRegistry,
    type RecordProcessorBuildContext,
} from '@memberjunction/record-set-processor-base';
import { ActionEngineServer } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
// Side-effect import: runs the @RegisterClass decorators for the scoring processor + the four PS actions,
// and exposes the registration helpers / work-type keys + tree-shaking anchors. This is the same
// registration path a server bootstrap uses (the PS engine is NOT in server-bootstrap-lite).
import {
    MLModelInferenceProcessor,
    ML_INFERENCE_WORK_TYPE,
    registerMLScoringProcessor,
    LoadMLModelInferenceProcessor,
    LoadPredictiveStudioActions,
    TRAIN_MODEL_DRIVER_CLASS,
    MLComponentEngine,
    type MLInferenceDeps,
} from '@memberjunction/predictive-studio';
// The sidecar request/response contracts live in the Core package (the engine consumes them and, per
// CLAUDE.md rule 5, does NOT re-export them) — import them directly from their defining package.
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { PredictiveStudioFixture } from '@memberjunction/testing-integration';

/** Whether the live-sidecar / trained-model legs run (mirrors RUN_AGENT_TESTS on the AI tier). */
const PS_LIVE = process.env.PS_INTEGRATION === '1';
const PREFIX = 'mj-predictive-studio-test';

// Anchor the side-effect registrations so the bundler/transpiler can't drop the decorated modules.
LoadMLModelInferenceProcessor();
LoadPredictiveStudioActions();

// ── small typed read helpers (BypassCache → true DB state; RunView never throws, so we Assert) ──

async function firstID(entity: string, user: UserInfo): Promise<string | undefined> {
    const r = await new RunView().RunView(
        { EntityName: entity, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, user,
    );
    return (r.Results?.[0] as { ID?: string } | undefined)?.ID;
}

async function loadModelRow(id: string, user: UserInfo): Promise<MJMLModelEntity | undefined> {
    const r = await new RunView().RunView<MJMLModelEntity>(
        { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    return r.Results?.[0];
}

/**
 * A deny-everything inference deps bundle for the deterministic (default) tier. The seams are never
 * exercised because the default work-type test asserts only that the processor RESOLVES — it never calls
 * the sidecar. Under PS_INTEGRATION=1, the model/artifact loaders + sidecar would be the real adapters.
 */
function stubInferenceDeps(): MLInferenceDeps {
    return {
        modelLoader: { loadModel: async () => null },
        artifactLoader: { load: async () => null },
        sidecar: {
            predict: async (_req: PredictRequest): Promise<PredictResponse> => ({ predictions: [] }),
        },
    };
}

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.PredictiveStudioFixture != null, 'predictive-studio fixture missing (bundle Setup did not run)');
    return ctx.PredictiveStudioFixture!;
}

export const PredictiveStudioChecks: NamedCheck[] = [
    {
        Id: 'predictive-studio.PS1',
        Name: 'PS1: ML entity CRUD round-trips through the real provider with typed fields intact',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Pipeline, Model, AlgorithmID } = fx(ctx);
            const reloaded = await loadModelRow(Model.ID, ctx.User);
            Assert(!!reloaded, `persisted ML Model ${Model.ID} not found`);
            AssertEqual(reloaded!.PipelineID, Pipeline.ID, 'model → pipeline FK persisted');
            AssertEqual(reloaded!.AlgorithmID, AlgorithmID!, 'model algorithm FK persisted');
            AssertEqual(reloaded!.Version, 1, 'model Version (typed int)');
            AssertEqual(String(reloaded!.ProblemType), 'classification', 'model ProblemType (typed union)');
            AssertEqual(String(reloaded!.Status), 'Draft', 'model Status (typed union)');
            AssertEqual(reloaded!.TargetVariable, 'Renewed', 'model TargetVariable');
            console.log(`      → ML Model ${Model.ID} v${reloaded!.Version} (${reloaded!.ProblemType}/${reloaded!.Status}) round-tripped`);
        }
    },
    {
        Id: 'predictive-studio.PS2',
        Name: 'PS2: the pipeline ↔ model ↔ binding FK lineage reads back correctly',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Pipeline, Model, Binding, TargetEntityID } = fx(ctx);
            const pRes = await new RunView().RunView<MJMLTrainingPipelineEntity>(
                { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${Pipeline.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            const p = pRes.Results?.[0];
            Assert(!!p, `persisted pipeline ${Pipeline.ID} not found`);
            AssertEqual(p!.TargetEntityID, TargetEntityID!, 'pipeline → target entity FK');
            AssertEqual(String(p!.ProblemType), 'classification', 'pipeline ProblemType (typed union)');

            const bRes = await new RunView().RunView<MJMLModelScoringBindingEntity>(
                { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `ID='${Binding.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            const b = bRes.Results?.[0];
            Assert(!!b, `persisted scoring binding ${Binding.ID} not found`);
            AssertEqual(b!.MLModelID, Model.ID, 'binding → model FK (lineage)');
            AssertEqual(String(b!.Mode), 'OnDemand', 'binding Mode (typed union)');
            AssertEqual(b!.TargetColumn, 'RenewalScore', 'binding TargetColumn');
            console.log(`      → lineage binding ${b!.ID} → model ${b!.MLModelID} → pipeline ${p!.ID} verified`);
        }
    },
    {
        Id: 'predictive-studio.PS3',
        Name: "PS3: the 'ML Model' work type resolves the MLModelInferenceProcessor through the substrate's pluggable registry",
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Model, TargetEntityID } = fx(ctx);
            // Register the ML scoring processor into the substrate's registry — the bootstrap step a server
            // performs (registerMLScoringProcessor closes over the injected deps). Stub deps: this seam test
            // asserts only RESOLUTION, never calling the sidecar.
            registerMLScoringProcessor(stubInferenceDeps());
            Assert(
                RecordProcessorRegistry.Instance.Has(ML_INFERENCE_WORK_TYPE),
                `registry has no factory for work type '${ML_INFERENCE_WORK_TYPE}' after registration`,
            );

            // Resolve through the registry's public seam with a real build context — this is the EXACT call
            // RecordProcessExecutor.buildProcessor() makes for any work type its built-in switch
            // (FieldRules/Action/Agent/Infer) doesn't handle. The factory reads `modelId` off Configuration
            // and constructs the MLModelInferenceProcessor.
            const context: RecordProcessorBuildContext = {
                WorkType: ML_INFERENCE_WORK_TYPE,                       // 'ML Model'
                Configuration: JSON.stringify({ modelId: Model.ID }),  // the per-run scoring config the factory reads
                EntityID: TargetEntityID!,
                RecordProcessName: `${PREFIX}-ml-model-context`,
            };
            const processor = RecordProcessorRegistry.Instance.Resolve(context);
            Assert(!!processor, `registry resolved no processor for work type '${ML_INFERENCE_WORK_TYPE}'`);
            Assert(
                processor instanceof MLModelInferenceProcessor,
                `expected MLModelInferenceProcessor, got ${processor?.constructor?.name}`,
            );

            // Case-insensitivity of the registry key (a row could store 'ml model') still resolves.
            Assert(
                RecordProcessorRegistry.Instance.Resolve({ ...context, WorkType: 'ml model' }) instanceof MLModelInferenceProcessor,
                "case-insensitive work-type key 'ml model' did not resolve the ML processor",
            );
            console.log(`      → '${ML_INFERENCE_WORK_TYPE}' (and 'ml model') resolved to ${processor!.constructor.name} via the registry seam`);
        }
    },
    {
        Id: 'predictive-studio.PS4',
        Name: 'PS4: the four Predictive Studio Actions exist in metadata with their params + result codes',
        Fn: async (ctx: IntegrationCheckContext) => {
            await ActionEngineServer.Instance.Config(false, ctx.User);
            const engine = ActionEngineServer.Instance;
            const expected = ['Train ML Model', 'Score Record Set', 'Run Experiment Session', 'Promote ML Model'];
            for (const name of expected) {
                const action = engine.GetActionByName(name);
                Assert(!!action, `PS action '${name}' is not registered in metadata`);
                AssertEqual(String(action!.Status), 'Active', `PS action '${name}' Status`);
            }

            // Spot-check the Train action's param + result-code contract (the wiring agents/UI depend on).
            const train = engine.GetActionByName('Train ML Model')!;
            AssertEqual(train.DriverClass, TRAIN_MODEL_DRIVER_CLASS, "Train action DriverClass matches the @RegisterClass key");
            const trainParams = engine.ActionParams.filter((p) => UUIDsEqual(p.ActionID, train.ID)).map((p) => p.Name);
            for (const required of ['PipelineID', 'ModelID', 'HoldoutMetrics', 'LeakageFlagged']) {
                Assert(trainParams.includes(required), `Train ML Model is missing the '${required}' param (have: ${trainParams.join(', ')})`);
            }
            const trainCodes = engine.ActionResultCodes.filter((c) => UUIDsEqual(c.ActionID, train.ID)).map((c) => c.ResultCode);
            for (const required of ['SUCCESS', 'VALIDATION_ERROR', 'TRAINING_FAILED']) {
                Assert(trainCodes.includes(required), `Train ML Model is missing the '${required}' result code (have: ${trainCodes.join(', ')})`);
            }
            console.log(`      → 4 PS actions registered; Train has params [${trainParams.join(', ')}] + codes [${trainCodes.join(', ')}]`);
        }
    },
    {
        Id: 'predictive-studio.PS5',
        Name: 'PS5: invoking "Train ML Model" with a missing PipelineID fails cleanly (VALIDATION_ERROR, no throw)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Pipeline } = fx(ctx);
            await ActionEngineServer.Instance.Config(false, ctx.User);
            const engine = ActionEngineServer.Instance;
            const train = engine.GetActionByName('Train ML Model');
            Assert(!!train, 'Train ML Model action not found');

            // Default leg: omit the required PipelineID → the action's own validation must short-circuit to
            // VALIDATION_ERROR before ever touching the engine/sidecar. This proves metadata → driver-class
            // → InternalRunAction param-validation wiring without needing a sidecar.
            const params = new RunActionParams();
            params.Action = train!;
            params.ContextUser = ctx.User;
            params.Params = [];                   // no PipelineID
            params.SkipActionLog = true;          // observability is irrelevant to the seam assertion

            const result = await ActionEngineServer.Instance.RunAction(params);
            Assert(result != null, 'RunAction returned no result');
            AssertEqual(result.Success, false, 'missing-PipelineID run reports failure');
            // The result code surfaces either via the resolved Result entity or the raw message.
            const code = result.Result?.ResultCode ?? '';
            Assert(
                code === 'VALIDATION_ERROR' || /PipelineID/i.test(result.Message ?? ''),
                `expected a VALIDATION_ERROR for missing PipelineID, got code='${code}' message='${result.Message}'`,
            );
            console.log(`      → clean validation failure: code='${code}' message='${result.Message}'`);

            if (PS_LIVE) {
                // Gated: a real train invocation against the test pipeline. Needs the Python sidecar +
                // model storage; we assert only that it returns a structured result (success OR a clean
                // engine failure code), never that it throws.
                const liveParams = new RunActionParams();
                liveParams.Action = train!;
                liveParams.ContextUser = ctx.User;
                liveParams.Params = [{ Name: 'PipelineID', Type: 'Input', Value: Pipeline.ID }];
                liveParams.SkipActionLog = true;
                const live = await ActionEngineServer.Instance.RunAction(liveParams);
                Assert(typeof live.Success === 'boolean', 'live train returned no structured result');
                console.log(`      → [PS_INTEGRATION] live train returned Success=${live.Success} code='${live.Result?.ResultCode ?? ''}'`);
            } else {
                console.log('      → (skipping the live train invocation — set PS_INTEGRATION=1 to exercise the sidecar path)');
            }
        }
    },
    {
        Id: 'predictive-studio.PS6',
        Name: 'PS6: ML Component Type CRUD round-trips, INCLUDING the hierarchy columns the base view only emits when the self-FK is opted in',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { ComponentTypeID } = fx(ctx);
            Assert(!!ComponentTypeID, 'no seeded concrete ML Component Type resolved in Setup');

            // Read the row back as a full entity object. This is the check that would have caught the
            // opt-in trap: MJ registers a virtual Root<FK>ID/Depth/Path/IsLeaf set for a self-referencing
            // FK, but the BASE VIEW only produces those columns when the field declares
            // Configuration.Hierarchy.IsHierarchy. Without it every read of this entity fails with
            // "column does not exist" — and a grid renders "no data" rather than an error, so the
            // breakage is invisible until someone opens the tree.
            const r = await new RunView().RunView<MJMLComponentTypeEntity>(
                { EntityName: 'MJ: ML Component Types', ExtraFilter: `ID='${ComponentTypeID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            const t = r.Results?.[0];
            Assert(!!t, `seeded ML Component Type ${ComponentTypeID} not readable`);
            AssertEqual(String(t!.Kind), 'Model', 'component type Kind (typed union)');
            AssertEqual(String(t!.Status), 'Published', 'component type Status (typed union)');
            AssertEqual(t!.IsAbstract, false, 'the fixture type must be CONCRETE (abstract types are not instantiable)');
            Assert(!!t!.DriverClass, 'a concrete Model leaf must carry a DriverClass (the sidecar key)');

            // The hierarchy virtual fields must be PRESENT (not undefined) — that is the opt-in working.
            Assert(t!.ParentIDPath != null, 'ParentIDPath is null/undefined — the ParentID hierarchy opt-in is missing from the base view');
            Assert(typeof t!.ParentIDDepth === 'number', 'ParentIDDepth is not a number — hierarchy columns are not being produced');
            Assert((t!.ParentIDDepth ?? 0) > 0, `a concrete leaf must sit BELOW a root (depth ${t!.ParentIDDepth})`);
            Assert(!!t!.RootParentID || !!t!.ParentID, 'the leaf has neither a parent nor a resolved hierarchy root');
            console.log(`      → component type '${t!.Name}' (${t!.Kind}/${t!.Status}) depth=${t!.ParentIDDepth} path=${t!.ParentIDPath}`);
        }
    },
    {
        Id: 'predictive-studio.PS7',
        Name: 'PS7: MLComponentEngine resolves inherited profiles over the SHIPPED seed tree, and the tree lints clean',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = MLComponentEngine.Instance;
            await engine.Config(true, ctx.User, ctx.Provider);
            Assert(engine.ComponentTypes.length > 0, 'MLComponentEngine loaded zero component types — run `mj sync push` for the ml-component-type* dirs');

            // (a) The principled partition holds on the tree we actually ship. A property may live on a
            // node only if it is true of every descendant; lintComponentTree is the enforcer, and a
            // seeded tree with findings means the shipped metadata itself is unsound.
            const findings = engine.Lint().filter((f) => f.Severity !== 'Info');
            AssertEqual(
                findings.length, 0,
                `seed component tree has ${findings.length} lint finding(s): ${findings.map((f) => `${f.Severity}/${f.Rule}@${f.NodeID}: ${f.Message}`).join(' | ')}`,
            );

            // (b) Union-with-provenance: XGBoost inherits `impute` from Tree Ensemble and the boosting
            // hyperparameters from Boosting, neither of which is declared on XGBoost itself.
            const xgb = engine.FindTypeByName('XGBoost');
            Assert(!!xgb, "seed tree has no 'XGBoost' component type");
            const profile = engine.ResolveProfile(xgb!.ID);
            Assert(profile.Chain.length >= 3, `XGBoost should inherit through Boosting → Tree Ensemble → Model (chain: ${profile.Chain.map((c) => c.Name).join(' → ')})`);

            const bank = (profile.Properties.PreprocessingBank ?? []).map((i) => i.ItemKey);
            Assert(bank.includes('impute'), `XGBoost's effective PreprocessingBank is missing 'impute' (have: ${bank.join(', ')})`);
            const hyper = (profile.Properties.HyperparameterBank ?? []).map((i) => i.ItemKey);
            for (const key of ['n_estimators', 'max_depth', 'learning_rate']) {
                Assert(hyper.includes(key), `XGBoost's effective HyperparameterBank is missing '${key}' (have: ${hyper.join(', ')})`);
            }
            const explain = (profile.Properties.Explainability ?? [])[0]?.Value;
            AssertEqual(String(explain), 'global-importance', "XGBoost's effective Explainability (override-nearest, inherited from Tree Ensemble)");
            const gates = (profile.Properties.StatisticalGate ?? []).map((i) => i.ItemKey);
            Assert(gates.includes('single-feature-dominance'), `the Model root's leakage gate did not reach XGBoost (have: ${gates.join(', ')})`);

            // Provenance is what drives the "inherited from" chips — it must name a node ABOVE the leaf.
            const bankProvenance = profile.Provenance.PreprocessingBank ?? [];
            Assert(bankProvenance.length > 0, 'PreprocessingBank resolved with no provenance');
            Assert(
                bankProvenance.some((id) => !UUIDsEqual(id, xgb!.ID)),
                'PreprocessingBank provenance names only XGBoost — inheritance did not contribute',
            );

            // (c) Override-nearest actually overrides: MLP REPLACES the Model root's min-rows-per-feature
            // gate, so the effective gate must be MLP's own, not the root's.
            const mlp = engine.FindTypeByName('Multilayer Perceptron') ?? engine.FindTypeByName('MLP');
            if (mlp) {
                const mlpProfile = engine.ResolveProfile(mlp.ID);
                const mlpExplain = (mlpProfile.Properties.Explainability ?? [])[0]?.Value;
                AssertEqual(String(mlpExplain), 'none', "MLP's effective Explainability (inherited from Neural)");
                const replaced = (mlpProfile.Properties.StatisticalGate ?? []).find((g) => g.ItemKey === 'min-rows-per-feature');
                Assert(!!replaced, 'MLP lost the min-rows-per-feature gate entirely');
                Assert(
                    !UUIDsEqual(replaced!.SourceTypeID, profile.Chain[0].ID),
                    "MLP's min-rows-per-feature gate still resolves to the Model root — the Replace operation did not take effect",
                );
            }
            console.log(`      → ${engine.ComponentTypes.length} types, 0 lint findings; XGBoost chain: ${profile.Chain.map((c) => c.Name).join(' → ')}`);
        }
    },
    {
        Id: 'predictive-studio.PS8',
        Name: 'PS8: the Model → Component → Binding → Entity Field meaning chain reads back, and abstract types are refused',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Model, Component, ComponentBinding, EntityFieldID, ComponentTypeID } = fx(ctx);
            Assert(!!Component && !!ComponentBinding, 'PS8 fixtures were not created in Setup');

            // The model points at its root component…
            const reloaded = await loadModelRow(Model.ID, ctx.User);
            Assert(!!reloaded, `model ${Model.ID} not found`);
            Assert(
                UUIDsEqual(reloaded!.RootComponentID ?? '', Component!.ID),
                `model RootComponentID ${reloaded!.RootComponentID} != component ${Component!.ID}`,
            );

            // …the component is an instance of the seeded concrete type, hung off the model…
            const cRes = await new RunView().RunView<MJMLComponentEntity>(
                { EntityName: 'MJ: ML Components', ExtraFilter: `ID='${Component!.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            const c = cRes.Results?.[0];
            Assert(!!c, `component ${Component!.ID} not readable`);
            Assert(UUIDsEqual(c!.ComponentTypeID, ComponentTypeID!), 'component → component type FK');
            Assert(UUIDsEqual(c!.MLModelID ?? '', Model.ID), 'component → model FK');
            AssertEqual(String(c!.PromotionState), 'Draft', 'a freshly materialized component must not outrun its Draft model');
            Assert(c!.ParentComponentIDPath != null, 'ParentComponentIDPath is null — the ParentComponentID hierarchy opt-in is missing');

            // …and the binding ties an input to a REAL entity field. This is the whole point of the
            // component model: the model's inputs have business meaning, not just column names.
            const bRes = await new RunView().RunView<MJMLComponentBindingEntity>(
                { EntityName: 'MJ: ML Component Bindings', ExtraFilter: `ComponentID='${Component!.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            const b = bRes.Results?.find((x) => UUIDsEqual(x.ID, ComponentBinding!.ID));
            Assert(!!b, `binding ${ComponentBinding!.ID} not readable under component ${Component!.ID}`);
            AssertEqual(String(b!.Role), 'Input', 'binding Role (typed union)');
            Assert(UUIDsEqual(b!.EntityFieldID ?? '', EntityFieldID!), 'binding → MJ: Entity Fields FK (the meaning link)');
            AssertEqual(String(b!.DataType), 'Number', 'binding DataType (typed union)');
            // The denormalized view field proves the FK resolves to a real field row, not a dangling id.
            Assert(!!b!.EntityField, 'binding EntityField (denormalized view field) is empty — the FK does not resolve');

            // The server subclass must refuse an ABSTRACT type. Save() returns false (never throws) on a
            // logical failure, so a `true` here means the guard is not wired.
            const abstractType = MLComponentEngine.Instance.ComponentTypes.find((t) => t.IsAbstract);
            if (abstractType) {
                const bad = await ctx.Provider.GetEntityObject<MJMLComponentEntity>('MJ: ML Components', ctx.User);
                bad.NewRecord();
                bad.ComponentTypeID = abstractType.ID;
                bad.Name = `${PREFIX}-abstract-instantiation (safe to delete)`;
                bad.Sequence = 0;
                bad.IsTrained = false;
                bad.PromotionState = 'Draft';
                bad.Status = 'Draft';
                bad.Version = 1;
                const saved = await bad.Save();
                if (saved) {
                    await bad.Delete().catch(() => undefined);
                }
                Assert(!saved, `instantiating the ABSTRACT component type '${abstractType.Name}' was allowed — the server-side guard is not registered`);
                console.log(`      → abstract '${abstractType.Name}' correctly refused: ${bad.LatestResult?.CompleteMessage ?? '(no message)'}`);
            }
            console.log(`      → model ${Model.ID} → component ${c!.ID} → binding ${b!.Name} → field ${b!.EntityField}`);
        }
    },
];

for (const check of PredictiveStudioChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('predictive-studio', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const md: IMetadataProvider = ctx.Provider;
        const user = ctx.User;

        // ── FK prerequisites for the ML fixtures ──
        // A training-unit entity (any entity works — never trained against here) + a seeded ML algorithm.
        const targetEntityID = (await firstID('MJ: Entities', user));
        Assert(!!targetEntityID, 'Could not resolve a seed entity for the ML pipeline target');
        const algorithmID = (await firstID('MJ: ML Algorithms', user));
        Assert(!!algorithmID, 'No MJ: ML Algorithms are seeded — run `mj sync push --include=ml-algorithms` first');

        // Publish the handle up-front and populate each field as its record is created, so a
        // mid-Setup crash leaves Teardown a handle to sweep whatever part of the lineage exists.
        const fx = (ctx.PredictiveStudioFixture = { TargetEntityID: targetEntityID!, AlgorithmID: algorithmID! } as PredictiveStudioFixture);

        // ── PS1/PS2 fixtures: a Pipeline → Model → Scoring Binding lineage chain. Created up front so the CRUD
        // tests can read them back, deleted in finally (child → parent order: binding → model → pipeline). ──
        const pipeline = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
        pipeline.NewRecord();
        pipeline.Name = `${PREFIX}-pipeline (safe to delete)`;
        pipeline.Description = 'Throwaway pipeline for the Predictive Studio integration test';
        pipeline.Status = 'Draft';
        pipeline.TargetEntityID = targetEntityID!;
        pipeline.TargetVariable = 'Renewed';
        pipeline.ProblemType = 'classification';
        pipeline.AlgorithmID = algorithmID!;
        Assert(await pipeline.Save(), `creating test ML pipeline failed: ${pipeline.LatestResult?.CompleteMessage}`);
        fx.Pipeline = pipeline;

        const model = await md.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
        model.NewRecord();
        model.PipelineID = pipeline.ID;
        model.Version = 1;
        model.AlgorithmID = algorithmID!;
        model.FeatureSchema = JSON.stringify([{ Name: 'tenure', Kind: 'numeric' }]);
        model.TargetVariable = 'Renewed';
        model.ProblemType = 'classification';
        model.Status = 'Draft';
        Assert(await model.Save(), `creating test ML model failed: ${model.LatestResult?.CompleteMessage}`);
        fx.Model = model;

        const binding = await md.GetEntityObject<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', user);
        binding.NewRecord();
        binding.MLModelID = model.ID;
        binding.TargetEntityID = targetEntityID!;
        binding.TargetColumn = 'RenewalScore';
        binding.Mode = 'OnDemand';
        Assert(await binding.Save(), `creating test scoring binding failed: ${binding.LatestResult?.CompleteMessage}`);
        fx.Binding = binding;

        // ── PS6/PS8 fixtures: the typed-component leg. Skipped (leaving PS6/PS8 to assert their own
        // preconditions) when the component tree isn't seeded, so a DB without `mj sync push` for the
        // ml-component-type* dirs fails with a readable message instead of an FK error here. ──
        const engine = MLComponentEngine.Instance;
        await engine.Config(true, user, md);
        // A CONCRETE Model leaf with a driver — the shape a trained model actually materializes under.
        const concreteLeaf = engine
            .TypesByKind('Model', true)
            .find((t) => !!t.DriverClass && !!t.ParentID);
        if (!concreteLeaf) {
            return;
        }
        fx.ComponentTypeID = concreteLeaf.ID;

        // A real numeric field on the target entity, so the binding points at something that exists.
        const targetEntity = md.EntityByID(targetEntityID!);
        Assert(!!targetEntity, `target entity ${targetEntityID} not in metadata`);
        const numericField = targetEntity!.Fields.find((f) => f.TSType === 'number') ?? targetEntity!.Fields[0];
        Assert(!!numericField, `target entity '${targetEntity!.Name}' has no fields to bind`);
        fx.EntityFieldID = numericField!.ID;

        const component = await md.GetEntityObject<MJMLComponentEntity>('MJ: ML Components', user);
        component.NewRecord();
        component.ComponentTypeID = concreteLeaf.ID;
        component.Name = `${PREFIX}-component (safe to delete)`;
        component.MLModelID = model.ID;
        component.Sequence = 0;
        component.IsTrained = true;
        component.PromotionState = 'Draft';
        component.Status = 'Draft';
        component.Version = 1;
        Assert(await component.Save(), `creating test ML component failed: ${component.LatestResult?.CompleteMessage}`);
        fx.Component = component;

        // Point the model at its root component — the link PS8 walks.
        model.RootComponentID = component.ID;
        Assert(await model.Save(), `linking model → root component failed: ${model.LatestResult?.CompleteMessage}`);

        const componentBinding = await md.GetEntityObject<MJMLComponentBindingEntity>('MJ: ML Component Bindings', user);
        componentBinding.NewRecord();
        componentBinding.ComponentID = component.ID;
        componentBinding.Role = 'Input';
        componentBinding.Name = numericField!.Name;
        componentBinding.EntityID = targetEntityID!;
        componentBinding.EntityFieldID = numericField!.ID;
        componentBinding.DataType = 'Number';
        componentBinding.Meaning = `${targetEntity!.Name}.${numericField!.Name}, read directly off the record being scored.`;
        Assert(await componentBinding.Save(), `creating test ML component binding failed: ${componentBinding.LatestResult?.CompleteMessage}`);
        fx.ComponentBinding = componentBinding;
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.PredictiveStudioFixture;
        if (!f) {
            return;
        }
        // Cleanup: delete the fixtures child → parent (binding → model → pipeline) so FKs never block a
        // delete. Each is guarded + best-effort — a mid-Setup crash may have created only some (R4).
        if (f.Binding) {
            await f.Binding.Delete().catch(() => undefined);
        }
        // The component leg deletes binding → component BEFORE the model, since the component FKs the
        // model AND the model's RootComponentID FKs the component — the cycle has to be cut first.
        if (f.ComponentBinding) {
            await f.ComponentBinding.Delete().catch(() => undefined);
        }
        if (f.Model && f.Component) {
            f.Model.RootComponentID = null;
            await f.Model.Save().catch(() => undefined);
        }
        if (f.Component) {
            await f.Component.Delete().catch(() => undefined);
        }
        if (f.Model) {
            await f.Model.Delete().catch(() => undefined);
        }
        if (f.Pipeline) {
            await f.Pipeline.Delete().catch(() => undefined);
        }
        // Leave the registry registration in place — it's process-wide + idempotent (last-wins).
        ctx.PredictiveStudioFixture = undefined;
    }
});
