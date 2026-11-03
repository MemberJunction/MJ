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
 * THROWAWAY: it creates the driver's ML Algorithm (if missing) + an ML Training Pipeline bound to its Prediction Unit
 * and Evaluation Protocol (the pipeline migration, as the gates' harness binds its pipelines), trains a model, creates
 * a saved `MJ: Queries` row, runs it twice (with + without enrichment), then deletes every row it created in
 * `finally`, children first (the Query, then `lib/ps-rig-lifecycle.ts`); a row it cannot delete fails the rig. A run
 * whose stored gate decision ships no model fails the rig with the stored reason (nothing to score).
 *
 * USAGE (from the repo root, against a live DB the harness resolves; needs AssociationDemo's Memberships):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-scored-query.ts
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-scored-query.ts   # deterministic SKIP (no sidecar)
 *
 * Exit code: 0 = passed (or cleanly skipped), 1 = failures, 2 = bootstrap error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import { RigStorage } from './lib/rig-storage';
import type { FileStorageActivation } from '@memberjunction/predictive-studio-truth-suite';
import { PromoteToPublished } from './lib/ps-promote';
import { DeleteRecordedRows, DeleteRow, EnsureDriverAlgorithm, ReportCleanup, TrainBoundPipeline, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import {
  RunQuery,
  UserInfo,
  type IMetadataProvider,
} from '@memberjunction/core';
import '@memberjunction/core-entities';
import {
  MJMLTrainingPipelineEntity,
  MJQueryEntity,
} from '@memberjunction/core-entities';
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
// Side-effect import: runs the @RegisterClass decorators for the scoring processor + the
// MLModelScoreEnricher ('ML Model Score').
import {
  LoadMLModelInferenceProcessor,
  LoadMLModelScoreEnricher,
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

/** Everything the run created that cleanup undoes: the recorded rows, the algorithm and the saved Query. */
interface RigState {
  readonly Records: RunRecords;
  Algorithm?: RigAlgorithm;
  Query?: MJQueryEntity;
}

/**
 * Step 1: resolve the Memberships entity and the query source it reads, exiting 0 with a SKIP when AssociationDemo or
 * the ML metadata is absent, or the live legs are off.
 */
function resolveQuerySourceOrSkip(md: IMetadataProvider): { Schema: string; BaseView: string } {
  banner('1. RESOLVE ENTITIES');
  const membership = md.EntityByName('Memberships');
  if (!membership) {
    console.log('  SKIP: Memberships entity not found — is AssociationDemo loaded? (exiting 0)');
    process.exit(0);
  }
  if (!md.EntityByName('MJ: ML Algorithms')) {
    console.log('  SKIP: MJ: ML Algorithms entity not found — Predictive Studio metadata absent. (exiting 0)');
    process.exit(0);
  }
  console.log(`  Memberships entity: ${membership.Name} (${membership.ID})`);
  console.log(`  Resolved schema='${membership.SchemaName}', baseView='${membership.BaseView}' → query source [${membership.SchemaName}].[${membership.BaseView}]`);
  // Training + scoring need the Python sidecar — gate the live legs (deterministic SKIP otherwise).
  if (!PS_LIVE) {
    console.log('\n  SKIP: set PS_INTEGRATION=1 (with the Python sidecar reachable) to train + score.');
    console.log('  This script trains a real model and exercises the RunQuery → enricher → sidecar path,');
    console.log('  which is gated like predictive-studio-tests.ts. Exiting 0.');
    process.exit(0);
  }
  return { Schema: membership.SchemaName, BaseView: membership.BaseView };
}

/** Step 2: create the pipeline, bind its unit and protocol, train it, and promote the shipped model; null when none shipped. */
async function trainAndPromote(md: IMetadataProvider, user: UserInfo, state: RigState): Promise<string | null> {
  banner('2. CREATE PIPELINE + BIND UNIT AND PROTOCOL + TRAIN IN-PROCESS');
  state.Algorithm = await EnsureDriverAlgorithm(md, user, DRIVER_KEY, TAG);
  console.log(`  Algorithm row: ${state.Algorithm.ID} (driver '${DRIVER_KEY}', ${state.Algorithm.Created ? 'created' : 'reused'})`);
  const pipeline = await createPipeline(md, user, state.Algorithm.ID);
  state.Records.RecordPipeline(pipeline.ID);
  console.log(`  Pipeline ${pipeline.ID} — target Memberships.Status (classification)`);
  const trainStart = Date.now();
  // In-process: calls TrainingEngine.trainModel with production deps (sidecar /train) — NOT the GraphQL op.
  const training = await TrainBoundPipeline(md, user, pipeline, state.Records, 'ps-inproc-scored-query');
  console.log(`  Trained in ${Date.now() - trainStart}ms — run ${training.RunID}, model ${training.Model ? `${training.Model.ID} (status=${training.Model.Status}, version=${training.Model.Version})` : '(none)'}`);
  check(training.Model !== null, `the run's stored gate decision shipped a model to score${training.NoModelReason ? ` (it shipped none: ${training.NoModelReason})` : ''}`);
  if (training.Model === null) return null;
  // Scoring refuses a Draft model (MODEL_NOT_SCORABLE), so promote it to Published first.
  console.log(`  promoted → ${await PromoteToPublished(md, user, training.Model.ID, TAG)}`);
  return training.Model.ID;
}

/** Step 4: the saved Query run WITHOUT enrichment — the baseline, which must NOT carry the prediction column. */
async function runBaseline(user: UserInfo, queryId: string): Promise<void> {
  banner('4. RunQuery WITHOUT Enrichment (baseline)');
  const baseResult = await new RunQuery().RunQuery({ QueryID: queryId }, user);
  console.log(`  Success=${baseResult.Success} RowCount=${baseResult.RowCount}${baseResult.ErrorMessage ? ` Error=${baseResult.ErrorMessage}` : ''}`);
  check(baseResult.Success, 'baseline RunQuery succeeded');
  const baseRows = asRows(baseResult.Results ?? []);
  check(baseRows.length > 0, `baseline returned rows (${baseRows.length})`);
  const baseScored = countScored(baseRows);
  check(baseScored === 0, `baseline rows do NOT carry '${OUTPUT_FIELD}' (additive/opt-in) — found ${baseScored}`);
}

/** Steps 5–6: the saved Query run WITH the ML Model Score enrichment (the PS2-3 path), every row carrying the prediction. */
async function runEnriched(user: UserInfo, queryId: string, modelId: string): Promise<void> {
  banner('5. RunQuery WITH Enrichment (ML Model Score)');
  const enrichStart = Date.now();
  const enrichResult = await new RunQuery().RunQuery(
    {
      QueryID: queryId,
      Enrichment: {
        EnricherKey: 'ML Model Score',
        Config: { modelId, outputField: OUTPUT_FIELD, primaryKeyField: 'ID' },
      },
    },
    user,
  );
  console.log(`  Success=${enrichResult.Success} RowCount=${enrichResult.RowCount} (${Date.now() - enrichStart}ms)${enrichResult.ErrorMessage ? ` Error=${enrichResult.ErrorMessage}` : ''}`);
  check(enrichResult.Success, 'enriched RunQuery succeeded');
  const enrichedRows = asRows(enrichResult.Results ?? []);
  check(enrichedRows.length > 0, `enriched returned rows (${enrichedRows.length})`);
  printRows(enrichedRows);

  banner('6. VERIFY APPENDED PREDICTION COLUMN');
  const scored = countScored(enrichedRows);
  console.log(`  ${scored}/${enrichedRows.length} rows carry a numeric '${OUTPUT_FIELD}'.`);
  check(scored > 0, `at least one enriched row carries a numeric '${OUTPUT_FIELD}' prediction`);
  // The full scored set should pick up the column (every row has an ID → a prediction).
  check(scored === enrichedRows.length, `ALL ${enrichedRows.length} enriched rows carry '${OUTPUT_FIELD}' (got ${scored})`);
}

/** Deletes the saved Query, then every recorded row children first; each failure fails the rig. */
async function cleanup(md: IMetadataProvider, user: UserInfo, state: RigState): Promise<void> {
  banner('CLEANUP');
  const queryFailure = state.Query ? await DeleteRow('MJ: Queries', state.Query) : null;
  failures += ReportCleanup([...(queryFailure === null ? [] : [queryFailure]), ...(await DeleteRecordedRows(md, user, state.Records, state.Algorithm))]);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { user, provider } = await BootstrapAI();
  const state: RigState = { Records: new RunRecords() };
  let storage: FileStorageActivation | null = null;
  try {
    const source = resolveQuerySourceOrSkip(provider);
    // Training stores its artifacts through an active File Storage Provider, made available as the gate harness does.
    storage = await RigStorage.Activate(provider, user);
    const modelId = await trainAndPromote(provider, user, state);
    if (modelId !== null) {
      banner('3. CREATE SAVED QUERY (MJ: Queries)');
      state.Query = await createScoredQuery(provider, user, source.Schema, source.BaseView);
      console.log(`  Query ${state.Query.ID}`);
      console.log(`  SQL: ${state.Query.SQL}`);
      await runBaseline(user, state.Query.ID);
      await runEnriched(user, state.Query.ID, modelId);
    }
    banner(failures === 0 ? 'PS2-3 PROOF COMPLETE — ALL CHECKS PASSED' : `PS2-3 PROOF FAILED — ${failures} CHECK(S) FAILED`);
    console.log(`  Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await cleanup(provider, user, state);
    try {
      await RigStorage.Restore(provider, user, storage);
    } catch (e) {
      check(false, `the File Storage Provider is put back after the run (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nSCORED-QUERY ENRICHMENT ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(2);
});
