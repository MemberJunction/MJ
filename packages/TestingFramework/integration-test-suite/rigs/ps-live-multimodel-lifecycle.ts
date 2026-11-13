/**
 * ps-live-multimodel-lifecycle.ts — headless, CLIENT-SIDE end-to-end lifecycle test of
 * Predictive Studio against an ALREADY-RUNNING MJAPI (http://localhost:4000), driven
 * entirely over GraphQL via the same GraphQLDataProvider a browser uses.
 *
 * This is the MULTI-MODEL extension of `ps-live-renewal-lifecycle.ts`. Instead of a single
 * Member-Renewal classifier, it runs the FULL Predictive Studio lifecycle —
 *
 *   PredictiveStudio.TrainModel    → MJAPI → TrainingEngine → Python sidecar (/train)
 *   PredictiveStudio.ScoreRecordSet→ MJAPI → MLModelInferenceProcessor → sidecar (/predict)
 *   PredictiveStudio.PromoteModel  → MJAPI → LifecycleGate (transition 'evaluate')
 *
 * — for SEVERAL model configs in turn, each fully isolated by its own try/finally cleanup
 * so one model's failure never blocks the next. At the end it prints a summary table
 * (model · trained? · holdout metric · scored · evaluated? · wall-clock).
 *
 * Nothing about the ML is mocked. The ops are invoked exactly as any caller would:
 *   `await new SomeOperation().Execute(input, { provider, user })` — the call marshals over
 *   GraphQL to MJAPI, which dispatches to the registered server operation.
 *
 * THE THREE MODEL CONFIGS (all on procedurally-generated AssociationDemo data — weak signal
 * is EXPECTED; the goal is reliable end-to-end completion, not accuracy):
 *
 *   1. Member Renewal   — entity `Memberships`,        target `Status` (classification)
 *        select   : AutoRenew, MembershipType  +  onehot: MembershipType
 *        leak deny: CancellationDate, CancellationReason, RenewalDate, EndDate, StartDate
 *      (the exact feature/leakage config the single-model renewal script already proved out)
 *
 *   2. Event No-Show    — entity `Event Registrations`, target `Status` (classification)
 *        select   : RegistrationType, CEUAwarded  +  onehot: RegistrationType
 *        leak deny: CheckInTime, CancellationDate, CancellationReason, CEUAwardedDate
 *
 *   3. Enrollment       — entity `Enrollments`,         target `Status` (classification)
 *        select   : ProgressPercentage, TimeSpentMinutes, PassingScore  (all numeric)
 *        leak deny: CompletionDate, FinalScore, Passed, ExpirationDate, LastAccessedDate
 *      (best-effort — if the `Enrollments` entity is missing it SKIPS gracefully, no hard-fail)
 *
 * All column names verified against the AssociationDemo DDL
 * (`Demos/AssociationDB/schema/V002__create_tables.sql`) and the generated entity classes
 * (`packages/GeneratedEntities/src/generated/entity_subclasses.ts`). Every `select` column is
 * a real column on its entity's row — the FeatureAssembly `select` reads straight off the
 * target row (no joins).
 *
 * THROWAWAY: it reuses (or creates) ONE shared ML Algorithm row for the driver, then per model
 * creates a Training Pipeline bound to version 1 of its Prediction Unit and Evaluation Protocol
 * through the harness's pipeline migration (`lib/ps-rig-lifecycle.ts`, every row saved over
 * GraphQL) and trains it. Each model's finally block deletes everything that model created
 * through the harness cleanup (pipeline, unit, protocol, model, training runs, Training Snapshot
 * and stored files), children first; the shared algorithm row (only when created) goes at the very
 * end. A row it cannot delete fails the rig. It is NOT part of any build or run-all harness.
 *
 * AUTH: system API key from MJ_API_KEY (x-mj-api-key) via the shared harness — no secrets here.
 *
 * PREREQUISITES:
 *   - MJAPI up on :4000, built WITH the Predictive Studio server-bootstrap fix, and `PS_STORAGE_PROVIDER` naming a
 *     provider configured on it for model files (default "Local File System", rooted at STORAGE_LOCAL_ROOT).
 *   - The Python sidecar reachable by MJAPI (managed child-process default is fine).
 *   - AssociationDemo data loaded (Memberships / Event Registrations / Enrollments populated).
 *   - MJ_API_KEY set in the environment (or .env resolved by the harness).
 *
 * USAGE (from the repo root, with MJAPI already up on :4000 and its Python sidecar reachable):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-live-multimodel-lifecycle.ts
 */
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { LoadEnv, LoadClientConfig } from './lib/harness';
import { GateAnswer } from './lib/ps-promote';
import { RequireCheck, ShippedModelID } from './lib/ps-train-output';
import { BindUnitAndProtocol, DeleteCreatedAlgorithm, DeleteRecordedRows, EnsureDriverAlgorithm, ReportCleanup, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import { Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { GraphQLProviderConfigData, setupGraphQLClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import '@memberjunction/core-entities';
import {
  MJMLTrainingPipelineEntity,
  PredictiveStudioTrainModelOperation,
  PredictiveStudioScoreRecordSetOperation,
  PredictiveStudioPromoteModelOperation,
} from '@memberjunction/core-entities';

const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-live-multimodel-lifecycle (safe to delete)';

/** A single FeatureSteps step — either a `select` of raw columns or a `onehot` of one column. */
type FeatureStep =
  | { Id: string; Kind: 'select'; Columns: string[] }
  | { Id: string; Kind: 'onehot'; Column: string };

/** A source binding feeding the pipeline (here always the target entity, no joins). */
interface SourceBinding {
  Kind: 'Entity';
  Ref: string;
}

/** One parameterized model to run through the full lifecycle. */
interface ModelConfig {
  /** Short human label for banners + the summary table. */
  name: string;
  /** Registered MJ entity name of the training-unit / target row. */
  targetEntity: string;
  /** Label column on the target row. */
  targetVariable: string;
  /** Problem type (all three configs are classification). */
  problemType: 'classification';
  /** Feed-in sources (no joins — the target entity itself). */
  sourceBindings: SourceBinding[];
  /** Feature assembly steps — `select` columns MUST be real columns on the target row. */
  featureSteps: FeatureStep[];
  /** Post-outcome columns to deny so they can't leak the label. */
  leakageDeny: string[];
  /** Validation strategy (holdout fraction is the honest-metric lock). */
  validation: { Strategy: 'holdout'; LockedHoldoutFraction: number };
}

/** Per-model run outcome captured for the final summary table (never throws out of a run). */
interface ModelResult {
  name: string;
  /** True when the entity was missing and the model was skipped (best-effort configs). */
  skipped: boolean;
  trained: boolean;
  holdoutMetric: string;
  scored: number;
  evaluated: boolean;
  /** Wall-clock for this model's lifecycle in seconds. */
  seconds: number;
  /** Captured failure message, when the run errored. */
  error?: string;
  /** Rows (or stored objects) this model's cleanup could not delete; each fails the rig. */
  cleanupFailures: number;
}

/** The three model configs. */
const MODELS: ModelConfig[] = [
  {
    name: 'Member Renewal',
    targetEntity: 'Memberships',
    targetVariable: 'Status',
    problemType: 'classification',
    sourceBindings: [{ Kind: 'Entity', Ref: 'Memberships' }],
    featureSteps: [
      { Id: 'select-raw', Kind: 'select', Columns: ['AutoRenew', 'MembershipType'] },
      { Id: 'onehot-type', Kind: 'onehot', Column: 'MembershipType' },
    ],
    leakageDeny: ['CancellationDate', 'CancellationReason', 'RenewalDate', 'EndDate', 'StartDate'],
    validation: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  },
  {
    name: 'Event No-Show',
    targetEntity: 'Event Registrations',
    targetVariable: 'Status',
    problemType: 'classification',
    sourceBindings: [{ Kind: 'Entity', Ref: 'Event Registrations' }],
    featureSteps: [
      { Id: 'select-raw', Kind: 'select', Columns: ['RegistrationType', 'CEUAwarded'] },
      { Id: 'onehot-regtype', Kind: 'onehot', Column: 'RegistrationType' },
    ],
    // CheckInTime / CEUAwardedDate / CancellationDate|Reason are populated only AFTER the
    // attendance outcome is known — denying them keeps the train leak-free.
    leakageDeny: ['CheckInTime', 'CancellationDate', 'CancellationReason', 'CEUAwardedDate'],
    validation: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  },
  {
    name: 'Enrollment Completion',
    targetEntity: 'Enrollments',
    targetVariable: 'Status',
    problemType: 'classification',
    sourceBindings: [{ Kind: 'Entity', Ref: 'Enrollments' }],
    // All numeric in-progress signals available before the terminal Status is reached.
    featureSteps: [{ Id: 'select-raw', Kind: 'select', Columns: ['ProgressPercentage', 'TimeSpentMinutes', 'PassingScore'] }],
    // CompletionDate / FinalScore / Passed / ExpirationDate / LastAccessedDate are
    // post-outcome (or directly encode the label) — deny them all.
    leakageDeny: ['CompletionDate', 'FinalScore', 'Passed', 'ExpirationDate', 'LastAccessedDate'],
    validation: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  },
];

function banner(title: string): void {
  console.log(`\n${'═'.repeat(78)}\n  ${title}\n${'═'.repeat(78)}`);
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

/** Build a model's pipeline JSON config columns from its ModelConfig and save the pipeline row. */
async function createPipeline(
  md: Metadata,
  user: UserInfo,
  algorithmId: string,
  cfg: ModelConfig,
): Promise<MJMLTrainingPipelineEntity> {
  const featureSteps = { Steps: cfg.featureSteps };
  const asOf = { Mode: 'none' };
  const leakageGuard = { DenyFields: cfg.leakageDeny, SingleFeatureDominanceThreshold: 0.85 };

  const p = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  p.NewRecord();
  p.Name = `${TAG} — ${cfg.name}`;
  p.Description = `${cfg.name} classifier on AssociationDemo ${cfg.targetEntity} (${cfg.targetVariable}).`;
  p.Version = 1;
  p.Status = 'Draft';
  p.TargetEntityID = entityId(md, cfg.targetEntity);
  p.TargetVariable = cfg.targetVariable;
  p.ProblemType = cfg.problemType;
  p.AlgorithmID = algorithmId;
  p.SourceBindings = JSON.stringify(cfg.sourceBindings);
  p.FeatureSteps = JSON.stringify(featureSteps);
  p.AsOfStrategy = JSON.stringify(asOf);
  p.LeakageGuard = JSON.stringify(leakageGuard);
  p.ValidationStrategy = JSON.stringify(cfg.validation);
  if (!(await p.Save())) {
    throw new Error(`Failed to create pipeline: ${p.LatestResult?.CompleteMessage}`);
  }
  return p;
}

/**
 * Run the FULL lifecycle (pipeline → train → score → promote → cleanup) for ONE model config.
 * NEVER throws — every failure is captured in the returned ModelResult so the harness always
 * reaches the summary table. Per-model cleanup runs in a finally block.
 */
async function runModel(md: Metadata, route: IMetadataProvider, user: UserInfo, algorithmId: string, cfg: ModelConfig): Promise<ModelResult> {
  const t0 = Date.now();
  const result: ModelResult = {
    name: cfg.name, skipped: false, trained: false, holdoutMetric: '—', scored: 0, evaluated: false, seconds: 0, cleanupFailures: 0,
  };

  banner(`MODEL: ${cfg.name}  (${cfg.targetEntity}.${cfg.targetVariable}, ${cfg.problemType})`);

  // Best-effort SKIP when the entity isn't present (e.g. Enrollments not loaded) — no hard-fail.
  if (!md.EntityByName(cfg.targetEntity)) {
    console.log(`  SKIP: entity '${cfg.targetEntity}' not found in metadata — is AssociationDemo loaded? Skipping gracefully.`);
    result.skipped = true;
    result.seconds = (Date.now() - t0) / 1000;
    return result;
  }

  const records = new RunRecords();

  try {
    // ── Create pipeline + bind its unit and protocol ─────────────────────────
    const pipeline = await createPipeline(md, user, algorithmId, cfg);
    records.RecordPipeline(pipeline.ID);
    const selectCols = cfg.featureSteps
      .filter((s): s is Extract<FeatureStep, { Kind: 'select' }> => s.Kind === 'select')
      .flatMap((s) => s.Columns);
    const onehotCols = cfg.featureSteps
      .filter((s): s is Extract<FeatureStep, { Kind: 'onehot' }> => s.Kind === 'onehot')
      .map((s) => s.Column);
    console.log(`  Pipeline ${pipeline.ID}`);
    console.log(`  Target: ${cfg.targetEntity}.${cfg.targetVariable} (${cfg.problemType}), Algorithm=${DRIVER_KEY}`);
    console.log(`  Features: select[${selectCols.join(', ')}]${onehotCols.length ? ` + onehot[${onehotCols.join(', ')}]` : ''}`);
    console.log(`  Leakage deny: ${cfg.leakageDeny.join(', ')}`);
    console.log(`  Validation: holdout, LockedHoldoutFraction=${cfg.validation.LockedHoldoutFraction}`);
    // Training refuses a pipeline without a Prediction Unit (UNIT_REQUIRED): bind version 1 of each, saved over GraphQL.
    await BindUnitAndProtocol(route, user, pipeline, records);
    console.log(`  Bound Prediction Unit ${pipeline.PredictionUnitID} and Evaluation Protocol ${pipeline.EvaluationProtocolID}`);

    // ── Train ────────────────────────────────────────────────────────────────
    // NOTE: attached over-the-wire onProgress would require a live GraphQL-WS endpoint (the
    // client opens a RemoteOperationProgress subscription). We connect with an empty wsurl
    // (like the other client-side scripts), so we DON'T attach onProgress here — the synchronous
    // train Output already carries the honest holdout metrics + leakage flag.
    const trainStart = Date.now();
    const trainResult = await new PredictiveStudioTrainModelOperation().Execute(
      { pipelineId: pipeline.ID, sidecarVersion: 'ps-live-multimodel-lifecycle' },
      { provider: route, user },
    );
    console.log(`  TRAIN Success=${trainResult.Success}${trainResult.ErrorMessage ? ` Error=${trainResult.ErrorMessage}` : ''} (${Date.now() - trainStart}ms)`);
    if (!trainResult.Success || !trainResult.Output) {
      throw new Error(`Training failed: ${trainResult.ErrorMessage}`);
    }
    const out = trainResult.Output;
    const shippedModelId = ShippedModelID(out, 'score and promote', RequireCheck);
    if (shippedModelId === null) throw new Error(`Training shipped no model to score and promote: ${out.gateOutcome ?? 'no gate decision'}.`);
    records.RecordModel(shippedModelId);
    result.trained = true;
    result.holdoutMetric = out.holdoutMetrics ?? '(none)';
    console.log(`    modelId       = ${shippedModelId}`);
    console.log(`    trainingRunId = ${out.trainingRunId}`);
    console.log(`    version       = ${out.version}`);
    console.log(`    status        = ${out.status}`);
    console.log(`    leakageFlagged= ${out.leakageFlagged}`);
    console.log(`    holdoutMetrics= ${out.holdoutMetrics ?? '(none)'}`);

    // ── Score (filter scope over the target entity, ephemeral dry-run) ────────
    const scoreStart = Date.now();
    const scoreResult = await new PredictiveStudioScoreRecordSetOperation().Execute(
      {
        modelId: shippedModelId,
        scope: { filter: { entityName: cfg.targetEntity, extraFilter: '', maxRows: 25 } },
        dryRun: true,
      },
      { provider: route, user },
    );
    console.log(`  SCORE Success=${scoreResult.Success}${scoreResult.ErrorMessage ? ` Error=${scoreResult.ErrorMessage}` : ''} (${Date.now() - scoreStart}ms)`);
    if (!scoreResult.Success || !scoreResult.Output) {
      throw new Error(`Scoring failed: ${scoreResult.ErrorMessage}`);
    }
    const s = scoreResult.Output;
    result.scored = s.scored;
    console.log(`    scored=${s.scored} failed=${s.failed} skipped=${s.skipped} wroteBack=${s.wroteBack}`);
    const samples = (s.predictions ?? []).slice(0, 5);
    for (const p of samples) {
      console.log(`      • record ${p.recordId?.slice(0, 8)}… → class='${p.class}' score=${p.score?.toFixed(4)}`);
    }

    // ── Evaluate (Draft → Validated or KeepBaseline, the stored decision) through the lifecycle gate ──
    const promoteResult = await new PredictiveStudioPromoteModelOperation().Execute(
      { modelId: shippedModelId, transition: 'evaluate', reason: 'ps-live-multimodel-lifecycle smoke test' },
      { provider: route, user },
    );
    console.log(`  EVALUATE Success=${promoteResult.Success}${promoteResult.ErrorMessage ? ` Error=${promoteResult.ErrorMessage}` : ''}`);
    if (!promoteResult.Success || !promoteResult.Output) {
      throw new Error(`Evaluation failed: ${promoteResult.ErrorMessage}`);
    }
    const reached = promoteResult.Output.status;
    if (!promoteResult.Output.applied || (reached !== 'Validated' && reached !== 'KeepBaseline')) {
      throw new Error(`Evaluation left ML Model ${shippedModelId} ${reached} (the lifecycle gate's answer: ${GateAnswer(promoteResult.Output.refusal)})`);
    }
    result.evaluated = promoteResult.Output.applied;
    console.log(`    applied=${promoteResult.Output.applied} status=${promoteResult.Output.status}${promoteResult.Output.refusal ? ` refusal=${promoteResult.Output.refusal.kind}` : ''}`);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR in ${cfg.name}: ${result.error}`);
  } finally {
    console.log(`  cleanup ${cfg.name}:`);
    result.cleanupFailures = ReportCleanup(await DeleteRecordedRows(route, user, records, undefined));
  }

  result.seconds = (Date.now() - t0) / 1000;
  return result;
}

/** Print the final per-model summary table. */
function printSummary(results: ModelResult[], totalSeconds: number): void {
  banner('SUMMARY');
  const pad = (v: string, n: number): string => (v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n));
  const trim = (v: string, n: number): string => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
  console.log(
    `  ${pad('Model', 22)} ${pad('Trained', 8)} ${pad('Holdout', 30)} ${pad('Scored', 7)} ${pad('Evaluated', 9)} ${pad('Wall(s)', 8)}`,
  );
  console.log(`  ${'-'.repeat(22)} ${'-'.repeat(8)} ${'-'.repeat(30)} ${'-'.repeat(7)} ${'-'.repeat(9)} ${'-'.repeat(8)}`);
  for (const r of results) {
    const trained = r.skipped ? 'skipped' : r.trained ? 'yes' : 'no';
    const holdout = r.skipped ? '—' : r.error && !r.trained ? `ERR: ${trim(r.error, 24)}` : trim(r.holdoutMetric, 30);
    const evaluated = r.skipped ? '—' : r.evaluated ? 'yes' : 'no';
    console.log(
      `  ${pad(r.name, 22)} ${pad(trained, 8)} ${pad(holdout, 30)} ${pad(String(r.scored), 7)} ${pad(evaluated, 9)} ${pad(r.seconds.toFixed(1), 8)}`,
    );
  }
  console.log(`\n  Total wall-clock: ${totalSeconds.toFixed(1)}s`);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { md, route, user } = await connect();

  let algorithm: RigAlgorithm | undefined;
  const results: ModelResult[] = [];
  let algorithmCleanupFailures = 0;

  try {
    banner('RESOLVE SHARED ALGORITHM');
    algorithm = await EnsureDriverAlgorithm(route, user, DRIVER_KEY, TAG);
    console.log(`  Algorithm row: ${algorithm.ID} (driver '${DRIVER_KEY}', ${algorithm.Created ? 'created' : 'reused'})`);

    // Each model is fully isolated inside runModel (its own try/finally) — a failure in one
    // is captured in its ModelResult and never blocks the next.
    for (const cfg of MODELS) {
      results.push(await runModel(md, route, user, algorithm.ID, cfg));
    }
  } finally {
    banner('CLEANUP (shared algorithm)');
    if (algorithm && !algorithm.Created) console.log(`  reused algorithm ${algorithm.ID} — left in place`);
    algorithmCleanupFailures = ReportCleanup(await DeleteCreatedAlgorithm(route, user, algorithm));
    printSummary(results, (Date.now() - t0) / 1000);
  }
  const cleanupFailures = algorithmCleanupFailures + results.reduce((n, r) => n + r.cleanupFailures, 0);
  process.exit(cleanupFailures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nLIFECYCLE ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
