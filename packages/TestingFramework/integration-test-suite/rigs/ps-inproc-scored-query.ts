/**
 * ps-inproc-scored-query.ts — IN-PROCESS proof of **PS2-3 (scored-query enrichment)**: that
 * `RunQuery`, given a `RunQueryParams.Enrichment` directive, post-processes its result rows through
 * the registered `MLModelScoreEnricher` (ClassFactory key `'ML Model Score'`) and APPENDS the
 * model's prediction as a new column on each row.
 *
 * ## Why in-process (NOT the GraphQL/client harness the other ps-live-* scripts use)
 * The `Enrichment` param is a RUNTIME-ONLY RunQuery directive and is NOT marshaled over GraphQL yet
 * (by design — a saved per-query annotation is a deliberate follow-up). So this script mirrors the
 * IN-PROCESS harness of `predictive-studio-tests.ts`: `bootstrapAI()` (from `./lib/ai-bootstrap`)
 * stands up the real `SQLServerDataProvider` against the live DB in-process — no MJAPI needed — and
 * `new RunQuery().RunQuery(...)` runs through the real provider's RunQuery path, which resolves the
 * enricher by key off the MJGlobal ClassFactory and runs the FULL path:
 *
 *   RunQuery  →  resolveQueryResultEnricher('ML Model Score')  →  MLModelScoreEnricher.EnrichResults
 *            →  ProductionScoreRecordSetRunner → MLModelInferenceProcessor → real DB + Python sidecar
 *            →  predictions joined back onto the rows by primary key → new `RenewalScore` column
 *
 * The enricher passes each row's `primaryKeyField` value as the scorer's `records` scope; the MODEL
 * supplies the target entity, so the query only needs to return the `ID` column. The numeric `score`
 * is written into `outputField` ('RenewalScore'). The model does NOT need to be Published to be
 * scorable (the scorer's model loader has no status gate — same as the write-back path).
 *
 * ## Gating + side-effect registration
 * Training + scoring need the Python sidecar, so the train+enrich legs are GATED behind
 * `PS_INTEGRATION=1` (mirroring predictive-studio-tests.ts's `PS_LIVE`); without it the script does a
 * graceful, deterministic SKIP (exit 0) after noting it. Importing `@memberjunction/predictive-studio`
 * runs the `@RegisterClass` decorators for the scoring processor AND the `MLModelScoreEnricher`
 * (the same registration a server bootstrap performs); `LoadMLModelScoreEnricher()` /
 * `LoadMLModelInferenceProcessor()` anchor those side effects against tree-shaking.
 *
 * THROWAWAY: it creates a driver-named ML Algorithm (if missing) + an ML Training Pipeline, trains a
 * model, creates a saved `MJ: Queries` row, runs it twice (with + without enrichment), then deletes
 * every row it created (child→parent) in `finally`.
 *
 * USAGE (from the repo root, against a live DB the harness resolves):
 *   PS_INTEGRATION=1 npx tsx packages/MJServer/integration-test-scripts/ps-inproc-scored-query.ts
 *   npx tsx packages/MJServer/integration-test-scripts/ps-inproc-scored-query.ts   # deterministic SKIP (no sidecar)
 *
 * Exit code: 0 = passed (or cleanly skipped), 1 = failures, 2 = bootstrap error.
 */
import { bootstrapAI } from './lib/ai-bootstrap';
import {
  RunView,
  RunQuery,
  UserInfo,
  BaseEntity,
  CompositeKey,
  type IMetadataProvider,
} from '@memberjunction/core';
import '@memberjunction/core-entities';
import {
  MJMLAlgorithmEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJQueryEntity,
} from '@memberjunction/core-entities';
// Side-effect import: runs the @RegisterClass decorators for the scoring processor + the
// MLModelScoreEnricher ('ML Model Score'), and exposes the in-process train delegation helper.
import {
  trainModelViaEngine,
  LoadMLModelInferenceProcessor,
  LoadMLModelScoreEnricher,
  type TrainModelInput,
  type TrainModelResult,
} from '@memberjunction/predictive-studio';

// Anchor the side-effect registrations so the transpiler/bundler can't drop the decorated modules.
LoadMLModelInferenceProcessor();
LoadMLModelScoreEnricher();

/** Whether the live-sidecar / trained-model legs run (mirrors PS_LIVE on predictive-studio-tests.ts). */
const PS_LIVE = process.env.PS_INTEGRATION === '1';
const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-inproc-scored-query (safe to delete)';
const QUERY_NAME = '[ps-inproc-scored-query] (safe to delete)';
/** The result column the enricher writes the prediction into. */
const OUTPUT_FIELD = 'RenewalScore';
/** How many rows the query returns (the scored set). */
const ROW_COUNT = 15;

/** Narrow row shape we read off the (any[]) RunQuery results — no `any` leaks into our code. */
interface ScoredRow {
  ID?: string;
  Status?: string;
  RenewalScore?: unknown;
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

/**
 * Resolve (or create) an ML Algorithm row whose DISPLAY NAME equals the sidecar driver key (the
 * TrainingEngine sends `pipeline.Algorithm` — the denormalized algorithm NAME — to the sidecar).
 */
async function ensureDriverNamedAlgorithm(md: IMetadataProvider, user: UserInfo): Promise<{ id: string; created: boolean }> {
  const existing = await new RunView().RunView<{ ID: string }>(
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
function entityId(md: IMetadataProvider, name: string): string {
  const e = md.EntityByName(name);
  if (!e) {
    throw new Error(`Entity '${name}' not found in metadata.`);
  }
  return e.ID;
}

/** Build the renewal pipeline's JSON config columns and save the pipeline row (reuses ps-live-renewal). */
async function createPipeline(md: IMetadataProvider, user: UserInfo, algorithmId: string): Promise<MJMLTrainingPipelineEntity> {
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
  p.Description = 'Member renewal classifier on AssociationDemo Memberships (Status) — scored-query enrichment proof.';
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
 * Create a throwaway saved Query that returns the small `ID` + `Status` set the enricher scores.
 * The SQL targets the Memberships entity's resolved schema + base view (so it's a real saved Query,
 * not ad-hoc SQL) and returns the `ID` column the enricher joins predictions back onto.
 */
async function createScoredQuery(
  md: IMetadataProvider, user: UserInfo, schema: string, baseView: string,
): Promise<MJQueryEntity> {
  const sql = `SELECT TOP ${ROW_COUNT} ID, Status FROM [${schema}].[${baseView}] ORDER BY ID`;
  const q = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
  q.NewRecord();
  q.Name = QUERY_NAME;
  q.Description = TAG;
  q.SQL = sql;
  q.Status = 'Approved'; // Approved so the saved query is runnable
  if (!(await q.Save())) {
    throw new Error(`Failed to create Query: ${q.LatestResult?.CompleteMessage}`);
  }
  return q;
}

/** True when a value is a finite number (the enricher writes a numeric `score`). */
function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Count rows whose OUTPUT_FIELD carries a numeric prediction. */
function countScored(rows: ScoredRow[]): number {
  return rows.filter((r) => isNumeric(r.RenewalScore)).length;
}

/** Print the first few rows: ID · Status · RenewalScore. */
function printRows(rows: ScoredRow[], limit = 6): void {
  const pad = (v: string, n: number): string => (v.length > n ? `${v.slice(0, n - 1)}…` : v.padEnd(n));
  console.log(`  ${pad('ID', 38)} ${pad('Status', 14)} ${pad(OUTPUT_FIELD, 14)}`);
  console.log(`  ${'-'.repeat(38)} ${'-'.repeat(14)} ${'-'.repeat(14)}`);
  for (const r of rows.slice(0, limit)) {
    const score = isNumeric(r.RenewalScore) ? r.RenewalScore.toFixed(4) : '(none)';
    console.log(`  ${pad(r.ID ?? '', 38)} ${pad(r.Status ?? '', 14)} ${pad(score, 14)}`);
  }
}

/** Narrow the (any[]) RunQuery results to our typed row shape without leaking `any`. */
function asRows(results: unknown[]): ScoredRow[] {
  return results.map((r) => r as ScoredRow);
}

/** Best-effort cleanup, child→parent: the Query row, then the model's training run(s) → model → pipeline → algorithm. */
async function cleanup(md: IMetadataProvider, user: UserInfo, ids: {
  queryId?: string; pipelineId?: string; modelId?: string; algorithmId?: string; algorithmCreated?: boolean;
}): Promise<void> {
  banner('CLEANUP');
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

  if (ids.queryId) await del('MJ: Queries', ids.queryId);

  // Training runs reference the pipeline (and the model); delete them before the model/pipeline.
  if (ids.pipelineId) {
    const trainingRuns = await new RunView().RunView<MJMLTrainingRunEntity>(
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
  const { user, provider } = await bootstrapAI();
  const md = provider;

  let queryId: string | undefined;
  let pipelineId: string | undefined;
  let modelId: string | undefined;
  let algorithm: { id: string; created: boolean } | undefined;

  try {
    // ── 1. Resolve entities (graceful SKIP if AssociationDemo / ML metadata absent) ──
    banner('1. RESOLVE ENTITIES');
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
    const schema = membership.SchemaName;
    const baseView = membership.BaseView;
    console.log(`  Memberships entity: ${membership.Name} (${membership.ID})`);
    console.log(`  Resolved schema='${schema}', baseView='${baseView}' → query source [${schema}].[${baseView}]`);

    // Training + scoring need the Python sidecar — gate the live legs (deterministic SKIP otherwise).
    if (!PS_LIVE) {
      console.log('\n  SKIP: set PS_INTEGRATION=1 (with the Python sidecar reachable) to train + score.');
      console.log('  This script trains a real model and exercises the RunQuery → enricher → sidecar path,');
      console.log('  which is gated like predictive-studio-tests.ts. Exiting 0.');
      process.exit(0);
    }

    // ── 2. Train a renewal model IN-PROCESS (TrainingEngine via delegation) ────
    banner('2. CREATE PIPELINE + TRAIN IN-PROCESS (trainModelViaEngine)');
    algorithm = await ensureDriverNamedAlgorithm(md, user);
    console.log(`  Algorithm row: ${algorithm.id} (Name='${DRIVER_KEY}', ${algorithm.created ? 'created' : 'reused'})`);
    const pipeline = await createPipeline(md, user, algorithm.id);
    pipelineId = pipeline.ID;
    console.log(`  Pipeline ${pipeline.ID} — target Memberships.Status (classification)`);

    const trainStart = Date.now();
    const trainInput: TrainModelInput = { pipelineId: pipeline.ID, sidecarVersion: 'ps-inproc-scored-query' };
    // In-process: calls TrainingEngine.trainModel with production deps (sidecar /train) — NOT the GraphQL op.
    const trainResult: TrainModelResult = await trainModelViaEngine(trainInput, provider, user);
    modelId = trainResult.model.ID;
    console.log(`  Trained in ${Date.now() - trainStart}ms`);
    console.log(`  modelId = ${trainResult.model.ID}  (status=${trainResult.model.Status}, version=${trainResult.model.Version})`);
    console.log(`  trainingRunId = ${trainResult.run.ID}`);
    check(!!modelId, 'training produced a model id');

    // ── 3. Create the throwaway saved Query (returns ID + Status) ─────────────
    banner('3. CREATE SAVED QUERY (MJ: Queries)');
    const query = await createScoredQuery(md, user, schema, baseView);
    queryId = query.ID;
    console.log(`  Query ${query.ID}`);
    console.log(`  SQL: ${query.SQL}`);

    // ── 4. Run WITHOUT enrichment (baseline — must NOT carry the prediction column) ──
    banner('4. RunQuery WITHOUT Enrichment (baseline)');
    const baseResult = await new RunQuery().RunQuery({ QueryID: query.ID }, user);
    console.log(`  Success=${baseResult.Success} RowCount=${baseResult.RowCount}${baseResult.ErrorMessage ? ` Error=${baseResult.ErrorMessage}` : ''}`);
    check(baseResult.Success, 'baseline RunQuery succeeded');
    const baseRows = asRows(baseResult.Results ?? []);
    check(baseRows.length > 0, `baseline returned rows (${baseRows.length})`);
    const baseScored = countScored(baseRows);
    check(baseScored === 0, `baseline rows do NOT carry '${OUTPUT_FIELD}' (additive/opt-in) — found ${baseScored}`);

    // ── 5. Run WITH enrichment (the PS2-3 path) ───────────────────────────────
    banner('5. RunQuery WITH Enrichment (ML Model Score)');
    const enrichStart = Date.now();
    const enrichResult = await new RunQuery().RunQuery(
      {
        QueryID: query.ID,
        Enrichment: {
          EnricherKey: 'ML Model Score',
          Config: { modelId: modelId!, outputField: OUTPUT_FIELD, primaryKeyField: 'ID' },
        },
      },
      user,
    );
    console.log(`  Success=${enrichResult.Success} RowCount=${enrichResult.RowCount} (${Date.now() - enrichStart}ms)${enrichResult.ErrorMessage ? ` Error=${enrichResult.ErrorMessage}` : ''}`);
    check(enrichResult.Success, 'enriched RunQuery succeeded');
    const enrichedRows = asRows(enrichResult.Results ?? []);
    check(enrichedRows.length > 0, `enriched returned rows (${enrichedRows.length})`);
    printRows(enrichedRows);

    // ── 6. Verify the appended prediction column ──────────────────────────────
    banner('6. VERIFY APPENDED PREDICTION COLUMN');
    const scored = countScored(enrichedRows);
    console.log(`  ${scored}/${enrichedRows.length} rows carry a numeric '${OUTPUT_FIELD}'.`);
    check(scored > 0, `at least one enriched row carries a numeric '${OUTPUT_FIELD}' prediction`);
    // The full scored set should pick up the column (every row has an ID → a prediction).
    check(scored === enrichedRows.length, `ALL ${enrichedRows.length} enriched rows carry '${OUTPUT_FIELD}' (got ${scored})`);

    banner(failures === 0 ? 'PS2-3 PROOF COMPLETE — ALL CHECKS PASSED' : `PS2-3 PROOF FAILED — ${failures} CHECK(S) FAILED`);
    console.log(`  Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await cleanup(md, user, {
      queryId, pipelineId, modelId,
      algorithmId: algorithm?.id, algorithmCreated: algorithm?.created,
    });
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nSCORED-QUERY ENRICHMENT ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(2);
});
