/**
 * predictive-studio.checks.ts — the 'predictive-studio' bundle (PS1–PS5): live, full-stack (headless)
 * integration checks for Predictive Studio's STACK SEAMS over the real provider/transport: ML entity
 * CRUD, the `'ML Model'` Record Set Processing work-type registration + resolution, and the four
 * Predictive Studio Actions in real metadata + invoked through the real Action-execution path.
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
    type MLInferenceDeps,
} from '@memberjunction/predictive-studio';
// The sidecar request/response contracts live in the Core package (the engine consumes them and, per
// CLAUDE.md rule 5, does NOT re-export them) — import them directly from their defining package.
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';
import type { PredictiveStudioFixture } from '../check';

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
    }
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
