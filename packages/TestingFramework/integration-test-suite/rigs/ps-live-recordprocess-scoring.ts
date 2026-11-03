/**
 * ps-live-recordprocess-scoring.ts — headless, CLIENT-SIDE proof of **PS2-1 end-to-end**:
 * a SAVED `MJ: Record Processes` row with `WorkType='ML Model'` runs over an entity and
 * writes a trained model's predictions back into entity columns — driven entirely over
 * GraphQL against an ALREADY-RUNNING MJAPI (http://localhost:4000), the same way a browser
 * would.
 *
 * The distinguishing point of THIS script (vs. ps-live-writeback-demo, which calls the
 * PredictiveStudio.ScoreRecordSet op directly): scoring here flows through the SAVED Record
 * Process substrate. The `'ML Model'` work type is NOT a built-in of the record-set-processor
 * package; it is contributed by `registerMLScoringProcessor(...)`, which the MJAPI server
 * already called at BOOT. We do NOT register it ourselves — we rely on the startup-registered
 * scorer being live on the server. If it weren't registered, `RecordProcess.RunNow` would fail
 * to resolve a processor for the `'ML Model'` work type and the run would error.
 *
 *   entity fields  →  PredictiveStudio.TrainModel  (MJAPI → TrainingEngine → sidecar /train)
 *                  →  CREATE MJ: Record Processes   (WorkType='ML Model', ScopeType='Filter',
 *                                                    Configuration={modelId,…}, OutputMapping={…})
 *                  →  RecordProcess.RunNow          (MJAPI → RecordProcessExecutor → the
 *                                                    startup-registered MLModelInferenceProcessor
 *                                                    → sidecar /predict → WriteBackProcessor)
 *                  →  RunView the same rows         (the predictions now live in the columns)
 *
 * The Record Process's `Configuration` column carries the `MLScoringConfiguration` JSON
 * (`{ modelId, primaryKeyField: 'ID' }`) the `'ML Model'` work type reads, and its
 * `OutputMapping` column carries the substrate's `OutputMappingConfig` JSON that maps the
 * scorer's result payload (`$.class` / `$.score`) onto two THROWAWAY columns codegen'd onto
 * the AssociationDemo `Memberships` entity (vwMemberships / Membership table):
 *   - PredictedRenewalClass  NVARCHAR(50)   ← receives the predicted class string
 *   - RenewalScore           FLOAT          ← receives the numeric model output
 *
 * Nothing about the ML is mocked. The train op + RunNow op are invoked exactly as any caller
 * would: `await new SomeOperation().Execute(input, { provider, user })` — the call marshals over
 * GraphQL to MJAPI, which dispatches to the registered server operation.
 *
 * THROWAWAY rows it creates, all deleted in `finally` through the harness cleanup
 * (`lib/ps-rig-lifecycle.ts`), children first, every Delete() checked — a row it cannot delete
 * fails the rig: the Record Process (found by the model its configuration names) with its Process
 * Runs, run details and watermarks; the trained Model, its Training Run(s), Training Snapshot and
 * stored files; the ML Training Pipeline and the version-1 Prediction Unit and Evaluation Protocol
 * it is bound to (bound through the harness's pipeline migration, every row saved over GraphQL);
 * and the driver's ML Algorithm when the rig created it. The written-back column VALUES on the
 * scored Membership rows are printed, then NULLed out so the test is repeatable.
 *
 * AUTH: system API key from MJ_API_KEY (x-mj-api-key) via the shared harness — no secrets here.
 *
 * PREREQUISITES:
 *   - MJAPI up on :4000, built WITH the Predictive Studio server-bootstrap (ops registered AND
 *     `registerMLScoringProcessor` called at startup), the local-disk artifact fallback, and the
 *     write-back runner fix.
 *   - The Python sidecar reachable by MJAPI (managed child-process default is fine).
 *   - AssociationDemo data loaded (Memberships populated) + MJ: ML Algorithms present.
 *   - The two prediction columns codegen'd onto Memberships: PredictedRenewalClass, RenewalScore.
 *   - MJ_API_KEY set in the environment (or .env resolved by the harness).
 *
 * Gracefully SKIPs (exit 0) when AssociationDemo `Memberships` or `MJ: ML Algorithms` aren't present.
 *
 * USAGE (from the repo root, with MJAPI already up on :4000 and its Python sidecar reachable):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-live-recordprocess-scoring.ts
 */
import { RigStorage } from './lib/rig-storage';
import { RunRecords, type FileStorageActivation } from '@memberjunction/predictive-studio-truth-suite';
import { LoadEnv, LoadClientConfig } from './lib/harness';
import { ShippedModelID } from './lib/ps-train-output';
import { PromoteToPublished } from './lib/ps-promote';
import { BindUnitAndProtocol, DeleteRecordedRows, EnsureDriverAlgorithm, ReportCleanup, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import { Metadata, RunView, UserInfo, BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { GraphQLProviderConfigData, setupGraphQLClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import '@memberjunction/core-entities';
import {
  MJMLTrainingPipelineEntity,
  MJRecordProcessEntity,
  PredictiveStudioTrainModelOperation,
  RecordProcessRunNowOperation,
  RecordProcessRunNowOutput,
} from '@memberjunction/core-entities';

const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-live-recordprocess-scoring (safe to delete)';
/** Throwaway label prefix for the Record Process row this script creates. */
const RP_NAME = '[ps-live-rp-ml-scoring] (safe to delete)';
/** How many Membership rows the Record Process scopes + scores + writes back. */
const ROW_COUNT = 15;
/** The two throwaway prediction columns on the Memberships entity. */
const CLASS_COLUMN = 'PredictedRenewalClass';
const SCORE_COLUMN = 'RenewalScore';

/**
 * Resolve a small, deterministic set of Membership IDs and build the EXACT `ID IN (...)` filter
 * the whole test uses (Record Process scope, RunNow override, read-back, and verify). This bounds
 * the run to ~ROW_COUNT rows — `ScopeFilter`/`BatchSize` alone would NOT cap the row set (a
 * `Status IS NOT NULL`-style filter selects every Membership, and BatchSize is batch granularity,
 * not a row cap). Throws if too few rows exist to make the proof meaningful.
 */
async function resolveScopeIDs(user: UserInfo): Promise<{ ids: string[]; filter: string }> {
  const rv = new RunView();
  const res = await rv.RunView<{ ID: string }>(
    { EntityName: 'Memberships', Fields: ['ID'], OrderBy: 'ID', MaxRows: ROW_COUNT, ResultType: 'simple' },
    user,
  );
  if (!res.Success) {
    { console.log(`  SKIP: could not query Memberships (${res.ErrorMessage}) — is AssociationDemo loaded? (exiting 0)`); process.exit(0); }
  }
  const ids = (res.Results ?? []).map((r) => r.ID);
  if (ids.length === 0) {
    { console.log('  SKIP: Memberships has no rows — AssociationDemo data not loaded. (exiting 0)'); process.exit(0); }
  }
  const filter = `ID IN (${ids.map((id) => `'${id}'`).join(', ')})`;
  return { ids, filter };
}

/** Shape of the rows we read back from the prediction columns (no `any`, no entity overhead). */
interface MembershipReadback {
  ID: string;
  Status: string;
  PredictedRenewalClass: string | null;
  RenewalScore: number | null;
}

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

/** Resolve an entity's ID by name (throws if not found). */
function entityId(md: Metadata, name: string): string {
  const e = md.EntityByName(name);
  if (!e) {
    throw new Error(`Entity '${name}' not found in metadata.`);
  }
  return e.ID;
}

/** Build the renewal pipeline's JSON config columns and save the pipeline row. */
async function createPipeline(md: Metadata, user: UserInfo, algorithmId: string): Promise<MJMLTrainingPipelineEntity> {
  // Features available leak-free on the target row (vwMemberships): AutoRenew (bit→numeric
  // passthrough) + MembershipType (categorical → one-hot). The FeatureAssembly executor
  // reads `select` columns straight off the target Membership row (no joins), so we only
  // select columns that actually exist on vwMemberships.
  const sourceBindings = [{ Kind: 'Entity', Ref: 'Memberships' }];
  const featureSteps = {
    Steps: [
      { Id: 'select-raw', Kind: 'select', Columns: ['AutoRenew', 'MembershipType'] },
      { Id: 'onehot-type', Kind: 'onehot', Column: 'MembershipType' },
    ],
  };
  const asOf = { Mode: 'none' };
  // Deny the post-outcome fields that would leak the label.
  const leakageGuard = {
    DenyFields: ['CancellationDate', 'CancellationReason', 'RenewalDate', 'EndDate', 'StartDate'],
    SingleFeatureDominanceThreshold: 0.85,
  };
  const validation = { Strategy: 'holdout', LockedHoldoutFraction: 0.2 };

  const p = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  p.NewRecord();
  p.Name = TAG;
  p.Description = 'Member renewal classifier on AssociationDemo Memberships (Status) — Record Process scoring proof.';
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
 * Create the SAVED `MJ: Record Processes` row with `WorkType='ML Model'`. The target entity is
 * named via the `EntityID` FK; the substrate's `ProcessRunMeta.EntityID` (and the Filter source)
 * resolve from it, so the `ScopeFilter` is evaluated against `Memberships`.
 *
 * The `'ML Model'` work type's processor is contributed at MJAPI boot by
 * `registerMLScoringProcessor`; the value itself is one of the generated `WorkType` literals.
 */
async function createRecordProcess(
  md: Metadata, user: UserInfo, membershipEntityId: string, modelId: string, scopeFilter: string,
): Promise<MJRecordProcessEntity> {
  // The work type's per-run Configuration (MLScoringConfiguration): which trained model to score
  // with + the primary-key field on the target entity. Injected runtime seams (model/artifact
  // loader, sidecar) were supplied to the scorer at server startup; only declarative config lives here.
  const mlConfiguration = { modelId, primaryKeyField: 'ID' };
  // The substrate's OutputMappingConfig: map the scorer's result payload onto the two columns.
  // `$` is the work result root (the scorer's ResultPayload, which exposes `class` + `score`).
  const outputMapping = {
    fields: {
      [CLASS_COLUMN]: '$.class',
      [SCORE_COLUMN]: '$.score',
    },
  };

  const rp = await md.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', user);
  rp.NewRecord();
  rp.Name = RP_NAME;
  rp.Description = TAG;
  rp.EntityID = membershipEntityId; // target entity = Memberships (Filter scope resolves against it)
  rp.Status = 'Active';
  rp.WorkType = 'ML Model';
  rp.ScopeType = 'Filter';
  rp.ScopeFilter = scopeFilter; // explicit ID IN (...) over the small resolved row set
  rp.Configuration = JSON.stringify(mlConfiguration);
  rp.OutputMapping = JSON.stringify(outputMapping);
  rp.OnDemandEnabled = true;       // runnable via RecordProcess.RunNow
  rp.SkipUnchanged = false;        // always score the scoped rows in this proof
  rp.BatchSize = ROW_COUNT;        // bound the work to a small, fast batch
  if (!(await rp.Save())) {
    throw new Error(`Failed to create Record Process: ${rp.LatestResult?.CompleteMessage}`);
  }
  return rp;
}

/** Read the prediction columns back off the EXACT scoped rows, so we can prove they persisted. */
async function readBackPredictions(user: UserInfo, scopeFilter: string): Promise<MembershipReadback[]> {
  const rv = new RunView();
  const result = await rv.RunView<MembershipReadback>(
    {
      EntityName: 'Memberships',
      Fields: ['ID', 'Status', CLASS_COLUMN, SCORE_COLUMN],
      ExtraFilter: scopeFilter, // the same ID IN (...) set the Record Process scored
      MaxRows: ROW_COUNT,
      ResultType: 'simple',
      BypassCache: true, // bypass server cache so we read true DB state after the write-back
    },
    user,
  );
  if (!result.Success) {
    throw new Error(`Read-back RunView failed: ${result.ErrorMessage}`);
  }
  return result.Results ?? [];
}

/** Print the read-back rows as a table: ID · actual Status · PredictedRenewalClass · RenewalScore. */
function printReadbackTable(rows: MembershipReadback[]): void {
  const pad = (v: string, n: number): string => (v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n));
  console.log(`  ${pad('ID', 38)} ${pad('Status', 14)} ${pad(CLASS_COLUMN, 24)} ${pad('RenewalScore', 14)}`);
  console.log(`  ${'-'.repeat(38)} ${'-'.repeat(14)} ${'-'.repeat(24)} ${'-'.repeat(14)}`);
  for (const r of rows) {
    const cls = r.PredictedRenewalClass ?? '(null)';
    const score = r.RenewalScore == null ? '(null)' : r.RenewalScore.toFixed(4);
    console.log(`  ${pad(r.ID, 38)} ${pad(r.Status ?? '', 14)} ${pad(cls, 24)} ${pad(score, 14)}`);
  }
}

/** Count rows carrying a written-back prediction (either column populated). */
function countWritten(rows: MembershipReadback[]): number {
  return rows.filter((r) => r.PredictedRenewalClass != null || r.RenewalScore != null).length;
}

/**
 * NULL out the prediction columns we wrote so the demo is repeatable. Best-effort, per row —
 * a failure to clear one row is logged but never aborts the rest.
 */
async function clearWrittenColumns(md: Metadata, user: UserInfo, rows: MembershipReadback[]): Promise<void> {
  let cleared = 0;
  for (const r of rows) {
    if (r.PredictedRenewalClass == null && r.RenewalScore == null) {
      continue; // nothing was written to this row
    }
    try {
      // The strongly-typed AssociationDemoMembershipEntity (with typed PredictedRenewalClass /
      // RenewalScore setters) lives in `mj_generatedentities`, which is NOT a dependency of
      // MJServer and is intentionally not imported by these throwaway client-side scripts. Clearing
      // two columns to null on a generic handle is the established cleanup idiom in this script suite.
      const m = await md.GetEntityObject<BaseEntity>('Memberships', user);
      if (!(await m.InnerLoad(CompositeKey.FromID(r.ID)))) {
        continue;
      }
      m.Set(CLASS_COLUMN, null);
      m.Set(SCORE_COLUMN, null);
      if (await m.Save()) {
        cleared++;
      } else {
        console.log(`    FAILED to clear Membership ${r.ID} — ${m.LatestResult?.CompleteMessage}`);
      }
    } catch (e) {
      console.log(`    skip clear Membership ${r.ID}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`  cleared prediction columns on ${cleared}/${rows.length} rows`);
}

/** Pretty-print a RunNow output line. */
function describeRun(out: RecordProcessRunNowOutput): string {
  return `status=${out.status} processed=${out.processed} success=${out.success} error=${out.error} skipped=${out.skipped}` +
    `${out.processRunID ? ` runId=${out.processRunID}` : ''}${out.errorMessage ? ` errorMessage=${out.errorMessage}` : ''}`;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { md, route, user } = await connect();

  // Cleanup deletes what these record: the pipeline and its unit and protocol, and the model with
  // everything hanging off it (the Record Process whose configuration names it, its Process Runs,
  // run details and watermarks, the training runs, the snapshot and the stored files).
  const records = new RunRecords();
  let algorithm: RigAlgorithm | undefined;
  // Rows we read back — captured so cleanup can NULL out whatever the write-back persisted,
  // even if a later step threw.
  let readbackRows: MembershipReadback[] = [];

  let storage: FileStorageActivation | null = null;
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
    // Sanity-check the throwaway prediction columns exist on the entity metadata.
    const hasClassCol = membership.Fields.some((f) => f.Name === CLASS_COLUMN);
    const hasScoreCol = membership.Fields.some((f) => f.Name === SCORE_COLUMN);
    console.log(`  Prediction columns: ${CLASS_COLUMN}=${hasClassCol ? 'present' : 'MISSING'}, ${SCORE_COLUMN}=${hasScoreCol ? 'present' : 'MISSING'}`);
    if (!hasClassCol || !hasScoreCol) {
      throw new Error(`Prediction columns missing on Memberships — codegen the ${CLASS_COLUMN} / ${SCORE_COLUMN} columns first.`);
    }
    algorithm = await EnsureDriverAlgorithm(route, user, DRIVER_KEY, TAG);
    console.log(`  Algorithm row: ${algorithm.ID} (driver '${DRIVER_KEY}', ${algorithm.Created ? 'created' : 'reused'})`);

    // ── 2. Create the renewal pipeline ───────────────────────────────────────
    // Training stores its artifacts through an active File Storage Provider, made available as the gate harness does.
    storage = await RigStorage.Activate(route, user);
    banner('2. CREATE ML TRAINING PIPELINE + BIND UNIT AND PROTOCOL');
    const pipeline = await createPipeline(md, user, algorithm.ID);
    records.RecordPipeline(pipeline.ID);
    console.log(`  Pipeline ${pipeline.ID}`);
    // Training refuses a pipeline without a Prediction Unit (UNIT_REQUIRED): bind version 1 of each, saved over GraphQL.
    await BindUnitAndProtocol(route, user, pipeline, records);
    console.log(`  Bound Prediction Unit ${pipeline.PredictionUnitID} and Evaluation Protocol ${pipeline.EvaluationProtocolID}`);
    console.log(`  Target: Memberships.Status (classification), Algorithm=${DRIVER_KEY}`);
    console.log(`  Features: select[AutoRenew, MembershipType] + onehot[MembershipType]`);

    // ── 3. Train a FRESH model (artifact lands on the MJAPI host's local disk) ─────────
    // A fresh train guarantees the model's artifact is present on the server's disk for the
    // startup-registered scorer to load when the Record Process runs (no remote artifact store needed).
    banner('3. TRAIN (PredictiveStudio.TrainModel)');
    const trainStart = Date.now();
    const trainResult = await new PredictiveStudioTrainModelOperation().Execute(
      { pipelineId: pipeline.ID, sidecarVersion: 'ps-live-recordprocess-scoring' },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${trainResult.Success}${trainResult.ErrorMessage ? ` Error=${trainResult.ErrorMessage}` : ''} (${Date.now() - trainStart}ms)`);
    if (!trainResult.Success || !trainResult.Output) {
      throw new Error(`Training failed: ${trainResult.ErrorMessage}`);
    }
    const out = trainResult.Output;
    const shippedModelId = ShippedModelID(out, 'publish and score through a Record Process', check);
    if (shippedModelId === null) throw new Error(`Training shipped no model to publish and score through a Record Process: ${out.gateOutcome ?? 'no gate decision'}.`);
    records.RecordModel(shippedModelId);
    console.log(`  modelId       = ${shippedModelId}`);
    console.log(`  trainingRunId = ${out.trainingRunId}`);
    console.log(`  status        = ${out.status}`);
    console.log(`  leakageFlagged= ${out.leakageFlagged}`);
    console.log(`  holdoutMetrics= ${out.holdoutMetrics ?? '(none)'}`);
    // Scoring refuses a Draft model (MODEL_NOT_SCORABLE), so promote it to Published first.
    console.log(`  promoted      → ${await PromoteToPublished(route, user, shippedModelId, TAG)}`);

    // ── 4. Resolve a small, deterministic scope + create the SAVED Record Process ──────
    banner('4. RESOLVE SCOPE + CREATE MJ: Record Processes (WorkType=ML Model)');
    // Bound the test to ~ROW_COUNT specific rows via an explicit ID IN (...) filter (NOT a broad
    // predicate + BatchSize, which would score the whole table). The SAME filter is used for the
    // Record Process scope, both RunNow overrides, the read-back, and the verify — one row set.
    const scope = await resolveScopeIDs(user);
    console.log(`  Scope: ${scope.ids.length} Membership IDs → ScopeFilter = ID IN (… ${scope.ids.length} ids …)`);
    const rp = await createRecordProcess(md, user, membership.ID, shippedModelId, scope.filter);
    console.log(`  Record Process ${rp.ID}`);
    console.log(`  WorkType='ML Model' (runtime-registered scorer), ScopeType='Filter' on Memberships`);
    console.log(`  Configuration: {"modelId":"${shippedModelId}","primaryKeyField":"ID"}`);
    console.log(`  OutputMapping: {"fields":{"${CLASS_COLUMN}":"$.class","${SCORE_COLUMN}":"$.score"}}`);

    // Pre-clear the prediction columns on the scoped rows so the dry-run "wrote nothing" check is
    // meaningful even if a prior run (or leftover data) had populated them.
    const preClear = await readBackPredictions(user, scope.filter);
    await clearWrittenColumns(md, user, preClear);

    // ── 5a. DRY-RUN first — proves the dry-run path does NOT write back ────────
    banner('5a. DRY-RUN (RecordProcess.RunNow, dryRun=true — must NOT write)');
    const dryStart = Date.now();
    const dryResult = await new RecordProcessRunNowOperation().Execute(
      {
        recordProcessID: rp.ID,
        dryRun: true,
        // Bound the scope to the same small ID set, run via the startup-registered scorer.
        scope: { Kind: 'filter', Filter: scope.filter },
      },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${dryResult.Success}${dryResult.ErrorMessage ? ` Error=${dryResult.ErrorMessage}` : ''} (${Date.now() - dryStart}ms)`);
    if (!dryResult.Success || !dryResult.Output) {
      throw new Error(`Dry-run RunNow failed: ${dryResult.ErrorMessage}`);
    }
    console.log(`  ${describeRun(dryResult.Output)}`);
    // A dry-run must NOT write — so 0 written-back rows is the PASS condition.
    const afterDry = await readBackPredictions(user, scope.filter);
    const dryWritten = countWritten(afterDry);
    check(dryWritten === 0, `dry-run wrote NOTHING back (expected 0, got ${dryWritten}/${afterDry.length} rows with a prediction)`);

    // ── 5b. REAL APPLY — RecordProcess.RunNow drives the startup-registered scorer ─────
    banner('5b. APPLY (RecordProcess.RunNow, dryRun=false — write-back)');
    const applyStart = Date.now();
    const applyResult = await new RecordProcessRunNowOperation().Execute(
      {
        recordProcessID: rp.ID,
        dryRun: false,
        scope: { Kind: 'filter', Filter: scope.filter },
      },
      { provider: route, user },
    );
    console.log(`  Execute() Success=${applyResult.Success}${applyResult.ErrorMessage ? ` Error=${applyResult.ErrorMessage}` : ''} (${Date.now() - applyStart}ms)`);
    if (!applyResult.Success || !applyResult.Output) {
      throw new Error(`Apply RunNow failed: ${applyResult.ErrorMessage}`);
    }
    const a = applyResult.Output;
    console.log(`  ${describeRun(a)}`);
    check(a.status === 'Completed', `RunNow status = Completed (got '${a.status}')`);
    check(a.success > 0, `RunNow scored > 0 records (success=${a.success})`);
    check(a.error === 0, `RunNow had 0 errors (error=${a.error})`);

    // ── 6. Verify the predictions landed in the entity columns (same ID set) ──────────
    banner('6. VERIFY WRITE-BACK (RunView Memberships — prediction columns)');
    readbackRows = await readBackPredictions(user, scope.filter);
    console.log(`  Read ${readbackRows.length} rows back. The model's predictions now live in entity columns:`);
    printReadbackTable(readbackRows);
    const written = countWritten(readbackRows);
    console.log(`\n  ${written}/${readbackRows.length} rows carry a written-back prediction.`);
    check(written > 0, `at least one Membership row carries a written-back prediction (${written} rows)`);

    banner(failures === 0 ? 'PS2-1 PROOF COMPLETE — ALL CHECKS PASSED' : `PS2-1 PROOF FAILED — ${failures} CHECK(S) FAILED`);
    console.log(`  Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`  NOTE: the written-back column VALUES persisted to the Membership rows (that's the point).`);
    console.log(`  The cleanup step below NULLs them out again so this proof is repeatable.`);
  } finally {
    // Repeatability: clear the written-back columns before deleting the model/pipeline/record-process.
    banner('CLEAR WRITTEN-BACK COLUMNS (repeatability)');
    if (readbackRows.length > 0) {
      await clearWrittenColumns(md, user, readbackRows);
    } else {
      console.log('  (no read-back rows captured — nothing to clear)');
    }
    banner('CLEANUP');
    failures += ReportCleanup(await DeleteRecordedRows(route, user, records, algorithm));
    await RigStorage.Restore(route, user, storage);
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nRECORD-PROCESS SCORING ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
