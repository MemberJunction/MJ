/**
 * predictive-studio-tests.ts — live, full-stack (headless) integration tests for Predictive Studio's
 * STACK SEAMS over the real provider/transport: ML entity CRUD, the `'ML Model'` Record Set Processing
 * work-type registration + resolution, and the four Predictive Studio Actions in real metadata + invoked
 * through the real Action-execution path.
 *
 * This deliberately does NOT re-test the Python sidecar, the FeatureAssembly executor, the training/scoring
 * math, or the experiment orchestrator — those are covered by the engine package's evergreen vitest
 * (`packages/AI/PredictiveStudio/Engine/src/**`). What only a live stack can prove is the wiring that the
 * unit tests mock away: that the ML entities round-trip through SQLServerDataProvider with their
 * strongly-typed fields intact, that the substrate's pluggable `RecordProcessorRegistry` actually resolves
 * Predictive Studio's `MLModelInferenceProcessor` for a real `WorkType='ML Model'` Record Process, and that
 * the PS Actions are registered in metadata (params + result codes) and invocable end-to-end through
 * `ActionEngineServer.RunAction`.
 *
 *   - PS1: ML entity CRUD round-trip — create a real MJ: ML Training Pipelines + MJ: ML Models + MJ: ML
 *          Model Scoring Bindings, read them back via RunView, assert the typed fields, then delete them.
 *   - PS2: the pipeline ↔ model ↔ binding FK lineage reads back correctly (binding → model → pipeline).
 *   - PS3: 'ML Model' work-type routing — registering the scoring processor teaches the substrate's
 *          pluggable RecordProcessorRegistry the 'ML Model' work type, and resolving a real
 *          RecordProcessorBuildContext through it (the exact seam RecordProcessExecutor.buildProcessor()
 *          falls through to for non-built-in work types) yields the MLModelInferenceProcessor — proving the
 *          open seam is wired without the substrate depending on Predictive Studio. (A real scoring RUN
 *          needs a trained model + the Python sidecar; that is the engine package's evergreen concern, so
 *          this seam test stays sidecar-free.)
 *   - PS4: the four PS Actions (Train / Score / Run Experiment / Promote) exist in metadata with their
 *          expected input/output params + result codes, and the @RegisterClass driver classes resolve.
 *   - PS5: invoke "Train ML Model" through the REAL ActionEngineServer.RunAction with a missing PipelineID
 *          → a clean VALIDATION_ERROR (no throw), proving the metadata → driver-class → param-validation
 *          wiring all the way through. (Real training is gated behind PS_INTEGRATION=1.)
 *
 * Default run is credential-free + sidecar-free (deterministic seams only). Anything needing the live
 * Python sidecar or a trained model is gated behind PS_INTEGRATION=1, exactly like the agent/prompt tier.
 * Creates + deletes ALL of its own fixtures (try/finally cleanup, even on failure).
 *
 * The Predictive Studio engine package is imported here for its side effects: importing
 * `@memberjunction/predictive-studio` runs the `@RegisterClass` decorators on the scoring processor and the
 * four actions, the same registration path a server bootstrap would use (it is NOT in server-bootstrap-lite).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/predictive-studio-tests.ts
 *   PS_INTEGRATION=1 npx tsx packages/MJServer/integration-test-scripts/predictive-studio-tests.ts  # + live sidecar legs
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI } from './lib/ai-bootstrap';
import { RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
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

async function main(): Promise<void> {
    const { user, provider } = await bootstrapAI();
    const md: IMetadataProvider = provider;
    const suite = new TestRunner('Predictive Studio live integration (ML CRUD + ML-Model work-type seam + PS Actions)');

    // ── FK prerequisites for the ML fixtures ──
    // A training-unit entity (any entity works — never trained against here) + a seeded ML algorithm.
    const targetEntityID = (await firstID('MJ: Entities', user));
    Assert(!!targetEntityID, 'Could not resolve a seed entity for the ML pipeline target');
    const algorithmID = (await firstID('MJ: ML Algorithms', user));
    Assert(!!algorithmID, 'No MJ: ML Algorithms are seeded — run `mj sync push --include=ml-algorithms` first');

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

    const binding = await md.GetEntityObject<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', user);
    binding.NewRecord();
    binding.MLModelID = model.ID;
    binding.TargetEntityID = targetEntityID!;
    binding.TargetColumn = 'RenewalScore';
    binding.Mode = 'OnDemand';
    Assert(await binding.Save(), `creating test scoring binding failed: ${binding.LatestResult?.CompleteMessage}`);

    let failures = 0;
    try {
        suite.Test('PS1: ML entity CRUD round-trips through the real provider with typed fields intact', async () => {
            const reloaded = await loadModelRow(model.ID, user);
            Assert(!!reloaded, `persisted ML Model ${model.ID} not found`);
            AssertEqual(reloaded!.PipelineID, pipeline.ID, 'model → pipeline FK persisted');
            AssertEqual(reloaded!.AlgorithmID, algorithmID!, 'model algorithm FK persisted');
            AssertEqual(reloaded!.Version, 1, 'model Version (typed int)');
            AssertEqual(String(reloaded!.ProblemType), 'classification', 'model ProblemType (typed union)');
            AssertEqual(String(reloaded!.Status), 'Draft', 'model Status (typed union)');
            AssertEqual(reloaded!.TargetVariable, 'Renewed', 'model TargetVariable');
            console.log(`      → ML Model ${model.ID} v${reloaded!.Version} (${reloaded!.ProblemType}/${reloaded!.Status}) round-tripped`);
        });

        suite.Test('PS2: the pipeline ↔ model ↔ binding FK lineage reads back correctly', async () => {
            const pRes = await new RunView().RunView<MJMLTrainingPipelineEntity>(
                { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${pipeline.ID}'`, ResultType: 'entity_object', BypassCache: true }, user,
            );
            const p = pRes.Results?.[0];
            Assert(!!p, `persisted pipeline ${pipeline.ID} not found`);
            AssertEqual(p!.TargetEntityID, targetEntityID!, 'pipeline → target entity FK');
            AssertEqual(String(p!.ProblemType), 'classification', 'pipeline ProblemType (typed union)');

            const bRes = await new RunView().RunView<MJMLModelScoringBindingEntity>(
                { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `ID='${binding.ID}'`, ResultType: 'entity_object', BypassCache: true }, user,
            );
            const b = bRes.Results?.[0];
            Assert(!!b, `persisted scoring binding ${binding.ID} not found`);
            AssertEqual(b!.MLModelID, model.ID, 'binding → model FK (lineage)');
            AssertEqual(String(b!.Mode), 'OnDemand', 'binding Mode (typed union)');
            AssertEqual(b!.TargetColumn, 'RenewalScore', 'binding TargetColumn');
            console.log(`      → lineage binding ${b!.ID} → model ${b!.MLModelID} → pipeline ${p!.ID} verified`);
        });

        suite.Test("PS3: the 'ML Model' work type resolves the MLModelInferenceProcessor through the substrate's pluggable registry", async () => {
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
                Configuration: JSON.stringify({ modelId: model.ID }),  // the per-run scoring config the factory reads
                EntityID: targetEntityID!,
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
        });

        suite.Test('PS4: the four Predictive Studio Actions exist in metadata with their params + result codes', async () => {
            await ActionEngineServer.Instance.Config(false, user);
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
            const trainParams = engine.ActionParams.filter((p) => p.ActionID === train.ID).map((p) => p.Name);
            for (const required of ['PipelineID', 'ModelID', 'HoldoutMetrics', 'LeakageFlagged']) {
                Assert(trainParams.includes(required), `Train ML Model is missing the '${required}' param (have: ${trainParams.join(', ')})`);
            }
            const trainCodes = engine.ActionResultCodes.filter((c) => c.ActionID === train.ID).map((c) => c.ResultCode);
            for (const required of ['SUCCESS', 'VALIDATION_ERROR', 'TRAINING_FAILED']) {
                Assert(trainCodes.includes(required), `Train ML Model is missing the '${required}' result code (have: ${trainCodes.join(', ')})`);
            }
            console.log(`      → 4 PS actions registered; Train has params [${trainParams.join(', ')}] + codes [${trainCodes.join(', ')}]`);
        });

        suite.Test('PS5: invoking "Train ML Model" with a missing PipelineID fails cleanly (VALIDATION_ERROR, no throw)', async () => {
            await ActionEngineServer.Instance.Config(false, user);
            const engine = ActionEngineServer.Instance;
            const train = engine.GetActionByName('Train ML Model');
            Assert(!!train, 'Train ML Model action not found');

            // Default leg: omit the required PipelineID → the action's own validation must short-circuit to
            // VALIDATION_ERROR before ever touching the engine/sidecar. This proves metadata → driver-class
            // → InternalRunAction param-validation wiring without needing a sidecar.
            const params = new RunActionParams();
            params.Action = train!;
            params.ContextUser = user;
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
                liveParams.ContextUser = user;
                liveParams.Params = [{ Name: 'PipelineID', Type: 'Input', Value: pipeline.ID }];
                liveParams.SkipActionLog = true;
                const live = await ActionEngineServer.Instance.RunAction(liveParams);
                Assert(typeof live.Success === 'boolean', 'live train returned no structured result');
                console.log(`      → [PS_INTEGRATION] live train returned Success=${live.Success} code='${live.Result?.ResultCode ?? ''}'`);
            } else {
                console.log('      → (skipping the live train invocation — set PS_INTEGRATION=1 to exercise the sidecar path)');
            }
        });

        failures = await suite.Run();
    } finally {
        // Cleanup: delete the fixtures child → parent (binding → model → pipeline) so FKs never block a
        // delete. Each is best-effort so one failure can't strand the others.
        await binding.Delete().catch(() => undefined);
        await model.Delete().catch(() => undefined);
        await pipeline.Delete().catch(() => undefined);
        // Leave the registry registration in place — it's process-wide + idempotent (last-wins).
    }

    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
