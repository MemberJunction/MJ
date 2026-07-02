/**
 * ps-live-modelaction-generation.ts — headless, CLIENT-SIDE proof of **PS2-2**: when a Predictive
 * Studio model is promoted to **Published**, the promote gate auto-generates a per-model child
 * Action `Score with <label> v<version>` that wraps the canonical "Score Record Set" action with
 * the model's id BAKED into the `ModelID` param's `DefaultValue`. Driven entirely over GraphQL
 * against an ALREADY-RUNNING MJAPI (http://localhost:4000), the same way a browser would.
 *
 * We never call the generator (`ModelScoringActionGenerator`) directly. It runs SERVER-SIDE inside
 * `ProductionModelPromotionGate.transition` whenever a model reaches Status `'Published'`. We
 * trigger it purely by promoting the model over the wire, then VERIFY the generated Action + its
 * baked `ModelID` default by reading `MJ: Actions` / `MJ: Action Params` back.
 *
 *   entity fields  →  PredictiveStudio.TrainModel   (MJAPI → TrainingEngine → sidecar /train)
 *                  →  PredictiveStudio.PromoteModel  Draft→Validated  (lifecycle only)
 *                  →  PredictiveStudio.PromoteModel  Validated→Published
 *                         → server-side: ProductionModelPromotionGate.syncScoringAction
 *                             → ModelScoringActionGenerator.generateForModel
 *                                 → creates Action 'Score with <pipeline> v<version>' + params
 *                  →  RunView MJ: Actions / MJ: Action Params  (verify the generated metadata)
 *
 * EXPECTED ACTION NAME — `Score with ${model.Pipeline ?? model.ID} v${model.Version ?? 1}`. The
 * label is the model's DENORMALIZED `Pipeline` view field (MJMLModelEntity has NO Name column),
 * which equals the producing pipeline's Name. We read the published model row back to get the
 * authoritative `Pipeline` + `Version` and compute the expected name from those.
 *
 * THE BAKED DEFAULT — the generated Action's `ModelID` Input param has `DefaultValue === model.ID`,
 * so invoking the action with only a Scope (no ModelID) scores with this model (ActionEngine seeds
 * params from their DefaultValue before invoke).
 *
 * PROMOTE PATH — the gate enforces `Draft → Validated → Published` (no Draft→Published jump), so we
 * promote STEPWISE. If the freshly-trained model is leakage-flagged, the gate refuses Published
 * unless `signOff=true` + a `reason`; we pass both defensively so it always reaches Published.
 *
 * THROWAWAY rows it creates (all cleaned up in `finally`, child→parent): a driver-named ML Algorithm
 * (if missing) + an ML Training Pipeline + the trained Model (+ its Training Run), plus the
 * server-generated Action + its Params. The shared "Predictive Studio Models" Action Category is
 * NOT deleted (it may hold other models' actions).
 *
 * AUTH: system API key from MJ_API_KEY (x-mj-api-key) via the shared harness — no secrets here.
 *
 * PREREQUISITES:
 *   - MJAPI up on :4000 with the Predictive Studio server-bootstrap (ops registered) + the PS2-2
 *     promote-gate scoring-action generation + the local-disk artifact fallback.
 *   - The canonical 'Score Record Set' parent Action (DriverClass='PredictiveStudioScoreRecordSetAction',
 *     ParentID NULL) seeded — the generator links the child to it.
 *   - The Python sidecar reachable by MJAPI (managed child-process default is fine).
 *   - AssociationDemo data loaded (Memberships populated) + MJ: ML Algorithms present.
 *   - MJ_API_KEY set in the environment (or .env resolved by the harness).
 *
 * Gracefully SKIPs (exit 0) when AssociationDemo `Memberships` or `MJ: ML Algorithms` aren't present.
 *
 * USAGE (from the repo root, with MJAPI already up on :4000):
 *   npx tsx packages/MJServer/integration-test-scripts/ps-live-modelaction-generation.ts
 */
import { LoadEnv, LoadClientConfig } from './lib/harness';
import { Metadata, RunView, UserInfo, BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { GraphQLProviderConfigData, setupGraphQLClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import '@memberjunction/core-entities';
import {
  MJMLAlgorithmEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJMLModelEntity,
  MJActionEntity,
  MJActionParamEntity,
  PredictiveStudioTrainModelOperation,
  PredictiveStudioPromoteModelOperation,
} from '@memberjunction/core-entities';

const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-live-modelaction-generation (safe to delete)';
/** The DriverClass the generated child Action reuses (composition over the parent). */
const SCORE_DRIVER_CLASS = 'PredictiveStudioScoreRecordSetAction';
/** The canonical parent Action's Name the child links to via ParentID. */
const PARENT_ACTION_NAME = 'Score Record Set';
/** The shared Action Category the generator find-or-creates for per-model scoring actions. */
const MODELS_CATEGORY_NAME = 'Predictive Studio Models';

function banner(title: string): void {
  console.log(`\n${'═'.repeat(78)}\n  ${title}\n${'═'.repeat(78)}`);
}

let failures = 0;
function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

/** Fail fast with a clear message when MJAPI isn't reachable. */
async function preflight(url: string, apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.log(`SKIP: MJAPI not reachable at ${url} — start MJAPI (and set PS_INTEGRATION=1 + the sidecar) to run this wire test.`);
    process.exit(0);
  }
  if (!response.ok) {
    console.log(`SKIP: MJAPI at ${url} answered HTTP ${response.status} — set MJ_API_KEY + start MJAPI to run this wire test.`);
    process.exit(0);
  }
}

/**
 * Connect the GraphQLDataProvider to the live MJAPI and return:
 *  - `md`: a `Metadata` wrapper for entity helpers (GetEntityObject / EntityByName)
 *  - `route`: the GraphQLDataProvider itself — the IRemoteOperationProvider that
 *    marshals `.Execute()` over the `ExecuteRemoteOperation` GraphQL mutation
 *  - `user`: the resolved CurrentUser
 */
async function connect(): Promise<{ md: Metadata; route: IMetadataProvider; user: UserInfo }> {
  LoadEnv();
  const client = LoadClientConfig();
  await preflight(client.Url, client.MJAPIKey);
  const config = new GraphQLProviderConfigData(
    '', client.Url, '', async () => '', '__mj', undefined, undefined, client.MJAPIKey,
  );
  await setupGraphQLClient(config);
  const md = new Metadata(); // global-provider-ok: standalone integration/demo script
  const route = GraphQLDataProvider.Instance;
  const user = md.CurrentUser;
  if (!user) {
    throw new Error('No CurrentUser resolved after client setup — check the API key.');
  }
  console.log(`Connected to ${client.Url} as ${user.Name ?? user.Email ?? user.ID}`);
  return { md, route, user };
}

/**
 * Resolve (or create) an ML Algorithm row whose DISPLAY NAME equals the sidecar driver key
 * (the TrainingEngine sends `pipeline.Algorithm` — the denormalized algorithm NAME — to the
 * sidecar). Returns the row id + whether we created it (for cleanup).
 */
async function ensureDriverNamedAlgorithm(md: Metadata, user: UserInfo): Promise<{ id: string; created: boolean }> {
  const rv = new RunView();
  const existing = await rv.RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Algorithms', ExtraFilter: `Name='${DRIVER_KEY}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
    user,
  );
  if (existing.Success && existing.Results.length > 0) {
    return { id: existing.Results[0].ID, created: false };
  }
  const algo = await md.GetEntityObject<MJMLAlgorithmEntity>('MJ: ML Algorithms', user);
  algo.NewRecord();
  algo.Name = DRIVER_KEY;
  algo.Description = TAG;
  algo.ProblemTypes = 'classification';
  algo.DriverClass = DRIVER_KEY;
  algo.SupportsFeatureImportance = true;
  algo.Status = 'Active';
  if (!(await algo.Save())) {
    throw new Error(`Failed to create ML Algorithm: ${algo.LatestResult?.CompleteMessage}`);
  }
  return { id: algo.ID, created: true };
}

/** Resolve an entity's ID by name (throws if not found). */
function entityId(md: Metadata, name: string): string {
  const e = md.EntityByName(name);
  if (!e) {
    throw new Error(`Entity '${name}' not found in metadata.`);
  }
  return e.ID;
}

/**
 * Build the renewal pipeline's JSON config columns and save the pipeline row. The pipeline's
 * Name (= TAG) is what surfaces as the model's denormalized `Pipeline` view field, which the
 * generator uses as the model's label in the generated Action's Name.
 */
async function createPipeline(md: Metadata, user: UserInfo, algorithmId: string): Promise<MJMLTrainingPipelineEntity> {
  const sourceBindings = [{ Kind: 'Entity', Ref: 'Memberships' }];
  const featureSteps = {
    Steps: [
      { Id: 'select-raw', Kind: 'select', Columns: ['AutoRenew', 'MembershipType'] },
      { Id: 'onehot-type', Kind: 'onehot', Column: 'MembershipType' },
    ],
  };
  const asOf = { Mode: 'none' };
  const leakageGuard = {
    DenyFields: ['CancellationDate', 'CancellationReason', 'RenewalDate', 'EndDate', 'StartDate'],
    SingleFeatureDominanceThreshold: 0.85,
  };
  const validation = { Strategy: 'holdout', LockedHoldoutFraction: 0.2 };

  const p = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  p.NewRecord();
  p.Name = TAG;
  p.Description = 'Member renewal classifier on AssociationDemo Memberships (Status) — model-action generation proof.';
  p.Version = 1;
  p.Status = 'Draft';
  p.TargetEntityID = entityId(md, 'Memberships');
  p.TargetVariable = 'Status';
  p.ProblemType = 'classification';
  p.AlgorithmID = algorithmId;
  p.SourceBindings = JSON.stringify(sourceBindings);
  p.FeatureSteps = JSON.stringify(featureSteps);
  p.AsOfStrategy = JSON.stringify(asOf);
  p.LeakageGuard = JSON.stringify(leakageGuard);
  p.ValidationStrategy = JSON.stringify(validation);
  if (!(await p.Save())) {
    throw new Error(`Failed to create pipeline: ${p.LatestResult?.CompleteMessage}`);
  }
  return p;
}

/**
 * Promote the model one lifecycle step over the wire. Passes signOff=true + a reason defensively
 * so a (possibly) leakage-flagged model still reaches the target status. Returns the new status.
 */
async function promote(
  route: IMetadataProvider, user: UserInfo, modelId: string,
  targetStatus: 'Validated' | 'Published' | 'Archived',
): Promise<string> {
  const result = await new PredictiveStudioPromoteModelOperation().Execute(
    {
      modelId,
      targetStatus,
      signOff: true, // ignored for clean models; required to override a leakage-flagged one
      reason: `${TAG}: stepwise promotion to ${targetStatus} for PS2-2 action-generation proof`,
    },
    { provider: route, user },
  );
  if (!result.Success || !result.Output) {
    throw new Error(`Promote → ${targetStatus} failed: ${result.ErrorMessage}`);
  }
  if (!result.Output.promoted) {
    throw new Error(`Promote → ${targetStatus} did not promote (status=${result.Output.status}).`);
  }
  return result.Output.status;
}

/** Re-read the model row (BypassCache) for its authoritative denormalized Pipeline + Version + Status. */
async function loadModelRow(user: UserInfo, modelId: string): Promise<MJMLModelEntity> {
  const rv = new RunView();
  const res = await rv.RunView<MJMLModelEntity>(
    { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${modelId}'`, ResultType: 'entity_object', MaxRows: 1, BypassCache: true },
    user,
  );
  if (!res.Success || (res.Results?.length ?? 0) === 0) {
    throw new Error(`Could not re-read ML Model '${modelId}': ${res.ErrorMessage ?? 'not found'}`);
  }
  return res.Results[0];
}

/** Compute the deterministic generated-action Name exactly as the generator does. */
function expectedActionName(model: MJMLModelEntity): string {
  const pipeline = model.Pipeline?.trim();
  const label = pipeline && pipeline.length > 0 ? pipeline : model.ID;
  const version = model.Version ?? 1;
  return `Score with ${label} v${version}`;
}

/** Load all `MJ: Actions` rows with the given exact Name (BypassCache) — for existence + uniqueness. */
async function findActionsByName(user: UserInfo, name: string): Promise<MJActionEntity[]> {
  const escaped = name.replace(/'/g, "''");
  const rv = new RunView();
  const res = await rv.RunView<MJActionEntity>(
    { EntityName: 'MJ: Actions', ExtraFilter: `Name='${escaped}'`, ResultType: 'entity_object', BypassCache: true },
    user,
  );
  if (!res.Success) {
    throw new Error(`RunView MJ: Actions by name failed: ${res.ErrorMessage}`);
  }
  return res.Results ?? [];
}

/** Load all `MJ: Action Params` for an action (BypassCache). */
async function findActionParams(user: UserInfo, actionId: string): Promise<MJActionParamEntity[]> {
  const rv = new RunView();
  const res = await rv.RunView<MJActionParamEntity>(
    { EntityName: 'MJ: Action Params', ExtraFilter: `ActionID='${actionId}'`, ResultType: 'entity_object', BypassCache: true },
    user,
  );
  if (!res.Success) {
    throw new Error(`RunView MJ: Action Params failed: ${res.ErrorMessage}`);
  }
  return res.Results ?? [];
}

/** Resolve the canonical parent 'Score Record Set' action ID (ParentID NULL), or undefined. */
async function findParentActionId(user: UserInfo): Promise<string | undefined> {
  const rv = new RunView();
  const res = await rv.RunView<{ ID: string }>(
    {
      EntityName: 'MJ: Actions',
      Fields: ['ID'],
      ExtraFilter: `Name='${PARENT_ACTION_NAME}' AND DriverClass='${SCORE_DRIVER_CLASS}' AND ParentID IS NULL`,
      ResultType: 'simple',
      MaxRows: 1,
      BypassCache: true,
    },
    user,
  );
  return res.Success && (res.Results?.length ?? 0) > 0 ? res.Results[0].ID : undefined;
}

/**
 * Best-effort cleanup, child→parent: the generated Action's Params → the Action row → the model's
 * training run(s) → the Model → the Pipeline → (if created) the Algorithm. Leaves the shared
 * 'Predictive Studio Models' Action Category (it may hold other models' actions).
 */
async function cleanup(md: Metadata, user: UserInfo, ids: {
  actionId?: string; pipelineId?: string; modelId?: string;
  algorithmId?: string; algorithmCreated?: boolean;
}): Promise<void> {
  banner('CLEANUP');
  const rv = new RunView();
  const del = async (entity: string, id: string): Promise<void> => {
    try {
      const obj = await md.GetEntityObject<BaseEntity>(entity, user);
      if (await obj.InnerLoad(CompositeKey.FromID(id))) {
        const ok = await obj.Delete();
        console.log(`  ${ok ? 'deleted' : 'FAILED to delete'} ${entity} ${id}${ok ? '' : ` — ${obj.LatestResult?.CompleteMessage}`}`);
      }
    } catch (e) {
      console.log(`  skip ${entity} ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // The generated Action's params FK the Action; delete them first, then the Action.
  if (ids.actionId) {
    const params = await rv.RunView<MJActionParamEntity>(
      { EntityName: 'MJ: Action Params', ExtraFilter: `ActionID='${ids.actionId}'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    for (const p of params.Results ?? []) {
      const ok = await p.Delete();
      if (!ok) {
        console.log(`  FAILED to delete MJ: Action Params ${p.ID} — ${p.LatestResult?.CompleteMessage}`);
      }
    }
    await del('MJ: Actions', ids.actionId);
  }

  // Training runs reference the pipeline (and the model); delete them before the model/pipeline.
  if (ids.pipelineId) {
    const trainingRuns = await rv.RunView<MJMLTrainingRunEntity>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID='${ids.pipelineId}'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    for (const r of trainingRuns.Results ?? []) {
      const ok = await r.Delete();
      console.log(`  ${ok ? 'deleted' : 'FAILED to delete'} MJ: ML Training Runs ${r.ID}`);
    }
  }
  if (ids.modelId) await del('MJ: ML Models', ids.modelId);
  if (ids.pipelineId) await del('MJ: ML Training Pipelines', ids.pipelineId);
  if (ids.algorithmId && ids.algorithmCreated) await del('MJ: ML Algorithms', ids.algorithmId);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { md, route, user } = await connect();

  let actionId: string | undefined;
  let pipelineId: string | undefined;
  let modelId: string | undefined;
  let algorithm: { id: string; created: boolean } | undefined;

  try {
    // ── 1. Resolve entities + algorithm (graceful SKIP if AssociationDemo / ML metadata absent) ──
    banner('1. RESOLVE ENTITIES + ALGORITHM');
    const membership = md.EntityByName('Memberships');
    const mlAlgorithms = md.EntityByName('MJ: ML Algorithms');
    if (!membership) {
      console.log('  SKIP: Memberships entity not found — is AssociationDemo loaded? (exiting 0)');
      process.exit(0);
    }
    if (!mlAlgorithms) {
      console.log('  SKIP: MJ: ML Algorithms entity not found — Predictive Studio metadata absent. (exiting 0)');
      process.exit(0);
    }
    console.log(`  Memberships entity: ${membership.Name} (${membership.ID})`);
    algorithm = await ensureDriverNamedAlgorithm(md, user);
    console.log(`  Algorithm row: ${algorithm.id} (Name='${DRIVER_KEY}', ${algorithm.created ? 'created' : 'reused'})`);
    const parentActionId = await findParentActionId(user);
    console.log(`  Parent action '${PARENT_ACTION_NAME}': ${parentActionId ?? '(MISSING — generation will be skipped server-side)'}`);
    if (!parentActionId) {
      console.log(`  SKIP: canonical '${PARENT_ACTION_NAME}' parent action not seeded — the generator no-ops. (exiting 0)`);
      process.exit(0);
    }

    // ── 2. Create the renewal pipeline ───────────────────────────────────────
    banner('2. CREATE ML TRAINING PIPELINE');
    const pipeline = await createPipeline(md, user, algorithm.id);
    pipelineId = pipeline.ID;
    console.log(`  Pipeline ${pipeline.ID} (Name='${TAG}' → becomes the model's Pipeline label)`);

    // ── 3. Train a fresh model ────────────────────────────────────────────────
    banner('3. TRAIN (PredictiveStudio.TrainModel)');
    const trainStart = Date.now();
    const trainResult = await new PredictiveStudioTrainModelOperation().Execute(
      { pipelineId: pipeline.ID, sidecarVersion: 'ps-live-modelaction-generation' },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${trainResult.Success}${trainResult.ErrorMessage ? ` Error=${trainResult.ErrorMessage}` : ''} (${Date.now() - trainStart}ms)`);
    if (!trainResult.Success || !trainResult.Output) {
      throw new Error(`Training failed: ${trainResult.ErrorMessage}`);
    }
    const out = trainResult.Output;
    modelId = out.modelId;
    console.log(`  modelId        = ${out.modelId}`);
    console.log(`  version        = ${out.version}`);
    console.log(`  status         = ${out.status}`);
    console.log(`  leakageFlagged = ${out.leakageFlagged}`);

    // ── 4. Promote stepwise to Published (Draft → Validated → Published) ───────
    // The gate enforces ALLOWED_TRANSITIONS — no Draft→Published jump — so step through Validated.
    // signOff=true + reason are passed defensively in case the model is leakage-flagged.
    banner('4. PROMOTE STEPWISE → Published (PredictiveStudio.PromoteModel)');
    const s1 = await promote(route, user, out.modelId, 'Validated');
    console.log(`  Draft → Validated: promoted, status=${s1}`);
    check(s1 === 'Validated', `step 1 status = Validated (got '${s1}')`);
    const s2 = await promote(route, user, out.modelId, 'Published');
    console.log(`  Validated → Published: promoted, status=${s2}`);
    check(s2 === 'Published', `step 2 status = Published (got '${s2}')`);

    // Re-read the published model for the authoritative Pipeline + Version the generator used.
    const model = await loadModelRow(user, out.modelId);
    check(model.Status === 'Published', `model.Status = Published (got '${model.Status}')`);
    const expectedName = expectedActionName(model);
    console.log(`  Model.Pipeline='${model.Pipeline}', Version=${model.Version}`);
    console.log(`  Expected generated action Name: '${expectedName}'`);

    // ── 5. Verify the generated Action exists + has the right shape ────────────
    banner('5. VERIFY GENERATED ACTION (MJ: Actions)');
    const actions = await findActionsByName(user, expectedName);
    check(actions.length === 1, `exactly ONE action named '${expectedName}' exists (found ${actions.length})`);
    const action = actions[0];
    if (!action) {
      throw new Error(`Generated action '${expectedName}' was not found — did the model reach Published and the parent exist?`);
    }
    actionId = action.ID;
    console.log(`  Action ${action.ID}`);
    check(action.Type === 'Custom', `action.Type = 'Custom' (got '${action.Type}')`);
    check(action.DriverClass === SCORE_DRIVER_CLASS, `action.DriverClass = '${SCORE_DRIVER_CLASS}' (got '${action.DriverClass}')`);
    check(action.ParentID === parentActionId, `action.ParentID matches the '${PARENT_ACTION_NAME}' parent (${parentActionId})`);
    check(action.Status === 'Active', `action.Status = 'Active' (got '${action.Status}')`);
    check(!!action.CategoryID, `action.CategoryID is set (category '${MODELS_CATEGORY_NAME}')`);

    // ── 6. Verify the baked ModelID default + the Scope/WriteBack params ───────
    banner('6. VERIFY BAKED ModelID DefaultValue (MJ: Action Params)');
    const params = await findActionParams(user, action.ID);
    console.log(`  ${params.length} params on the generated action: ${params.map((p) => p.Name).join(', ')}`);
    const modelParam = params.find((p) => p.Name === 'ModelID');
    check(!!modelParam, `a 'ModelID' param exists`);
    if (modelParam) {
      check(modelParam.Type === 'Input', `ModelID param is an Input (got '${modelParam.Type}')`);
      check(modelParam.ValueType === 'Scalar', `ModelID param ValueType = 'Scalar' (got '${modelParam.ValueType}')`);
      check(modelParam.IsRequired === false, `ModelID param is NOT required (so the default feeds the scorer)`);
      // The crux of PS2-2: the model's id is BAKED into the ModelID param's DefaultValue.
      check(
        modelParam.DefaultValue === out.modelId,
        `ModelID DefaultValue === the model id (expected '${out.modelId}', got '${modelParam.DefaultValue}')`,
      );
    }
    const scopeParam = params.find((p) => p.Name === 'Scope');
    const writeBackParam = params.find((p) => p.Name === 'WriteBack');
    check(!!scopeParam && scopeParam.Type === 'Input', `a 'Scope' Input param exists`);
    check(!!scopeParam && scopeParam.IsRequired === true, `the 'Scope' param is required`);
    check(!!writeBackParam && writeBackParam.Type === 'Input', `a 'WriteBack' Input param exists`);

    // ── 7. Bonus: invoke the generated action with only a Scope ────────────────
    // SKIPPED BY DESIGN: invoking an Action requires the SERVER-SIDE ActionEngineServer.RunAction
    // path (see predictive-studio-tests.ts, which bootstraps in-process). These ps-live-* scripts
    // drive the CLIENT/GraphQL wire path (GraphQLDataProvider + MJ_API_KEY) and there is no
    // client-side RunAction surface in @memberjunction/graphql-dataprovider. The baked-default
    // verification in step 6 already proves the ModelID DefaultValue is in place; the actual
    // default-feeds-the-scorer behavior is covered by the server-side action tests.
    banner('7. INVOKE GENERATED ACTION (bonus) — SKIPPED');
    console.log('  Skipped: client-side RunAction is not part of these GraphQL-wire ps-live scripts.');
    console.log('  The baked ModelID DefaultValue (verified in step 6) is what makes a Scope-only invoke score with this model.');

    // ── 8. Idempotency ────────────────────────────────────────────────────────
    // The generator is idempotent (find-or-create by deterministic Name; params deleted+recreated).
    // A direct re-trigger would re-promote to Published, but the gate's ALLOWED_TRANSITIONS does NOT
    // permit Published→Published (only Published→Archived), so we cannot re-promote to the same status.
    // Instead we assert the single-publish result is already idempotent: exactly ONE action by name
    // and no duplicate ModelID params.
    banner('8. IDEMPOTENCY (single action + no duplicate params)');
    console.log('  NOTE: Published→Published is not an allowed transition, so we cannot re-trigger by re-promoting.');
    const again = await findActionsByName(user, expectedName);
    check(again.length === 1, `still exactly ONE action named '${expectedName}' (found ${again.length})`);
    const modelIdParams = params.filter((p) => p.Name === 'ModelID');
    check(modelIdParams.length === 1, `exactly ONE 'ModelID' param (no duplicates) (found ${modelIdParams.length})`);

    banner(failures === 0 ? 'PS2-2 PROOF COMPLETE — ALL CHECKS PASSED' : `PS2-2 PROOF FAILED — ${failures} CHECK(S) FAILED`);
    console.log(`  Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await cleanup(md, user, {
      actionId, pipelineId, modelId,
      algorithmId: algorithm?.id, algorithmCreated: algorithm?.created,
    });
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nMODEL-ACTION GENERATION ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
