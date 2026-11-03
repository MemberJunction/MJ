/**
 * ps-inproc-operate-flow.ts — IN-PROCESS proof of the **on-demand "Operate this model" path**: the
 * one-call `createScoringProcess(...)` helper that the `PredictiveStudio.CreateScoringProcess` Remote
 * Op + the Operate dialog call to operationalize a trained model WITHOUT a schedule.
 *
 * It is the on-demand sibling of `ps-inproc-scheduled-scoring.ts` (which proves the recurring/monthly
 * north-star). Where that one binds a model to a cron + owned Scheduled Job, this one proves the THREE
 * shapes the Operate dialog produces from `createScoringProcess`:
 *
 *   1. GENERIC output — `createScoringProcess({ modelId, targetEntityName, scope })` (no outputField):
 *      assembles a `WorkType='ML Model'` Record Process (OnDemandEnabled=true, ScheduleEnabled=false,
 *      NO OutputMapping, ScopeType='Filter'), `result.binding === null`. Running it via
 *      `RecordProcessExecutor.RunByID` records predictions in the process run history
 *      (`MJ: Process Run Details`, a numeric `score` per row) — and writes NOTHING back to the member
 *      record (RenewalScore stays null). This is the core assertion: predictions persist in run
 *      history with NO binding.
 *
 *   2. WRITE-BACK output — `createScoringProcess({ ..., outputField: 'RenewalScore' })`:
 *      `result.binding !== null` (Mode='OnDemand', TargetColumn='RenewalScore'), the RP carries an
 *      OutputMapping, and a run BOTH records predictions in run history AND writes RenewalScore back
 *      on the scoped rows.
 *
 *   3. WHOLE-ENTITY scope SHAPE — `createScoringProcess({ ..., scope: { all: true } })`: assert-only
 *      (we do NOT run it, to avoid scoring the whole table). Proves `all:true` maps to
 *      `ScopeType='Filter'` + `ScopeFilter='(1=1)'`.
 *
 * "Operate this model — score these members on demand, optionally writing the renewal probability into
 * the member record" — proved by composition, with no new dispatch / write-back code.
 *
 * ## Why in-process (mirrors ps-inproc-scheduled-scoring.ts)
 * Like the scheduled-scoring proof, this needs the real server-side machinery: the runtime-registered
 * `'ML Model'` scoring work type, the write-back substrate, and the Python sidecar. So it uses
 * `bootstrapAI()` (the real SQLServerDataProvider in-process, no MJAPI) and gates the train+score legs
 * behind `PS_INTEGRATION=1`. We invoke the SAME run path the generic "Run Record Process" Remote Op
 * uses — `RecordProcessExecutor.RunByID` — and assert the run history (and, in write-back mode, the
 * column) landed.
 *
 * ## Gating + side-effect registration
 * Importing `@memberjunction/predictive-studio` runs the `@RegisterClass` decorators for the `'ML
 * Model'` scoring work type; `LoadMLModelInferenceProcessor()` anchors that side effect against
 * tree-shaking. Without `PS_INTEGRATION=1` (+ a reachable sidecar) the script does a graceful,
 * deterministic SKIP (exit 0) after entity resolution.
 *
 * THROWAWAY: it creates the driver's ML Algorithm (if missing) + an ML Training Pipeline bound to its Prediction Unit
 * and Evaluation Protocol (the pipeline migration, as the gates' harness binds its pipelines), trains a model, creates
 * the on-demand Record Processes (+ their bindings/run history), runs two of them, then NULLs the RenewalScore column
 * and deletes every row it created in `finally`, children first (`lib/ps-rig-lifecycle.ts`); a row it cannot delete
 * fails the rig. A run whose stored gate decision ships no model fails the rig with the stored reason (nothing to
 * operate).
 *
 * USAGE (from the repo root, against a live DB the harness resolves; needs AssociationDemo's Memberships):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-operate-flow.ts
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-operate-flow.ts   # deterministic SKIP (no sidecar)
 *
 * Exit code: 0 = passed (or cleanly skipped), 1 = failures, 2 = bootstrap error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import { RigStorage } from './lib/rig-storage';
import type { FileStorageActivation } from '@memberjunction/predictive-studio-truth-suite';
import { PromoteToPublished } from './lib/ps-promote';
import { DeleteRecordedRows, EnsureDriverAlgorithm, ReportCleanup, TrainBoundPipeline, type RigAlgorithm } from './lib/ps-rig-lifecycle';
import {
  RunView,
  UserInfo,
  BaseEntity,
  CompositeKey,
  type IMetadataProvider,
} from '@memberjunction/core';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import '@memberjunction/core-entities';
import {
  MJMLTrainingPipelineEntity,
  MJRecordProcessEntity,
  MJProcessRunDetailEntity,
} from '@memberjunction/core-entities';
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
// Side-effect import: runs the @RegisterClass decorator for the 'ML Model' scoring work type, and
// exposes the on-demand "Operate" scoring helper.
import {
  CreateScoringProcess,
  LoadMLModelInferenceProcessor,
  type CreateScoringProcessResult,
} from '@memberjunction/predictive-studio';

// Anchor the side-effect registration so the transpiler/bundler can't drop the decorated module.
LoadMLModelInferenceProcessor();

/** Whether the live-sidecar / trained-model legs run (mirrors PS_LIVE on predictive-studio-tests.ts). */
const PS_LIVE = process.env.PS_INTEGRATION === '1';
const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-inproc-operate-flow (safe to delete)';
/** The column the write-back leg writes the prediction into. */
const OUTPUT_FIELD = 'RenewalScore';
/** How many Membership rows to scope/score (kept small so the on-demand runs are fast). */
const ROW_COUNT = 15;

/** The model Configuration shape the 'ML Model' work type reads off the Record Process. */
interface MLScoringConfiguration {
  modelId?: string;
  primaryKeyField?: string;
}
/** The OutputMapping shape the write-back substrate reads off the Record Process. */
interface OutputMappingShape {
  fields?: Record<string, string>;
}
/** The shape a 'ML Model' run persists into each Process Run Detail's ResultPayload. */
interface ScoringResultPayload {
  score?: number;
  class?: string;
  scoredAt?: string;
  /**
   * Write-back runs nest the raw prediction under `output` (the substrate's `WriteBackProcessor`
   * wraps the result as `{ output: <prediction>, writeBack: {...} }`); generic runs carry the
   * prediction fields at the top level. {@link readRunDetailPayloads} normalizes both to top level.
   */
  output?: { score?: number; class?: string; scoredAt?: string };
}
/** Narrow row shape for the Membership read-back. */
interface MembershipReadback {
  ID: string;
  Status: string;
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

/** True when a value is a finite number (the work type persists a numeric `score`). */
function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Resolve an entity's ID by name (throws if not found). */
function entityId(md: IMetadataProvider, name: string): string {
  const e = md.EntityByName(name);
  if (!e) {
    throw new Error(`Entity '${name}' not found in metadata.`);
  }
  return e.ID;
}

/** Resolve ~ROW_COUNT Membership IDs + the `ID IN (...)` filter the scope uses (fast + deterministic). */
async function resolveScopeIDs(user: UserInfo): Promise<{ ids: string[]; filter: string }> {
  const res = await new RunView().RunView<{ ID: string }>(
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

/** Build the renewal pipeline's JSON config columns and save the pipeline row (reuses ps-inproc-scheduled-scoring). */
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
  p.Description = 'Member renewal classifier on AssociationDemo Memberships (Status) — operate-flow on-demand proof.';
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

/** Re-read the scoped Membership rows (BypassCache) to inspect the (un)written-back RenewalScore. */
async function readBackPredictions(user: UserInfo, scopeFilter: string): Promise<MembershipReadback[]> {
  const res = await new RunView().RunView<MembershipReadback>(
    {
      EntityName: 'Memberships',
      Fields: ['ID', 'Status', OUTPUT_FIELD],
      ExtraFilter: scopeFilter,
      MaxRows: ROW_COUNT,
      ResultType: 'simple',
      BypassCache: true,
    },
    user,
  );
  if (!res.Success) {
    throw new Error(`Read-back RunView failed: ${res.ErrorMessage}`);
  }
  return res.Results ?? [];
}

/** Count rows whose RenewalScore carries a numeric prediction. */
function countScored(rows: MembershipReadback[]): number {
  return rows.filter((r) => isNumeric(r.RenewalScore)).length;
}

/**
 * Load the `MJ: Process Run Details` for a run, asserting predictions persisted in run history.
 * Returns the parsed ResultPayloads carrying a numeric `score` (the core generic-mode evidence).
 */
async function readRunDetailPayloads(user: UserInfo, processRunID: string): Promise<ScoringResultPayload[]> {
  const res = await new RunView().RunView<MJProcessRunDetailEntity>(
    {
      EntityName: 'MJ: Process Run Details',
      ExtraFilter: `ProcessRunID='${processRunID}'`,
      ResultType: 'entity_object',
      BypassCache: true,
    },
    user,
  );
  if (!res.Success) {
    throw new Error(`Process Run Details RunView failed: ${res.ErrorMessage}`);
  }
  const payloads: ScoringResultPayload[] = [];
  for (const d of res.Results ?? []) {
    const parsed = SafeJSONParse<ScoringResultPayload>(d.ResultPayload ?? '');
    if (parsed) {
      // Write-back runs wrap the prediction under `output` (WriteBackProcessor); generic runs carry it
      // at the top level. Normalize so callers always read score/class/scoredAt directly, either way.
      payloads.push(parsed.output ? { ...parsed.output } : parsed);
    }
  }
  return payloads;
}

/** NULL the RenewalScore column on the read-back rows (repeatability). Best-effort, per row. */
async function clearWrittenColumns(md: IMetadataProvider, user: UserInfo, rows: MembershipReadback[]): Promise<void> {
  let cleared = 0;
  for (const r of rows) {
    if (r.RenewalScore == null) {
      continue;
    }
    try {
      const m = await md.GetEntityObject<BaseEntity>('Memberships', user);
      if (!(await m.InnerLoad(CompositeKey.FromID(r.ID)))) {
        continue;
      }
      m.Set(OUTPUT_FIELD, null);
      if (await m.Save()) {
        cleared++;
      } else {
        console.log(`    FAILED to clear Membership ${r.ID} — ${m.LatestResult?.CompleteMessage}`);
      }
    } catch (e) {
      console.log(`    skip clear Membership ${r.ID}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`  cleared ${OUTPUT_FIELD} on ${cleared}/${rows.length} rows`);
}

/** Everything the run created that cleanup undoes: the recorded rows, the algorithm, and the rows whose column it wrote. */
interface RigState {
  readonly Records: RunRecords;
  Algorithm?: RigAlgorithm;
  ReadbackRows: MembershipReadback[];
}

/** Step 1: resolve the entities, exiting 0 with a SKIP when AssociationDemo or the ML metadata is absent, or the live legs are off. */
function resolveEntitiesOrSkip(md: IMetadataProvider): void {
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
  if (!PS_LIVE) {
    console.log('\n  SKIP: set PS_INTEGRATION=1 (with the Python sidecar reachable) to train + score.');
    console.log('  This script trains a real model and runs the on-demand "Operate" Record Processes against');
    console.log('  the sidecar, gated like predictive-studio-tests.ts. Exiting 0.');
    process.exit(0);
  }
}

/** Step 2: create the pipeline, bind its unit and protocol, train it, and promote the shipped model so it can score; null when none shipped. */
async function trainAndPromote(md: IMetadataProvider, user: UserInfo, state: RigState): Promise<string | null> {
  state.Algorithm = await EnsureDriverAlgorithm(md, user, DRIVER_KEY, TAG);
  console.log(`  Algorithm row: ${state.Algorithm.ID} (driver '${DRIVER_KEY}', ${state.Algorithm.Created ? 'created' : 'reused'})`);
  const pipeline = await createPipeline(md, user, state.Algorithm.ID);
  state.Records.RecordPipeline(pipeline.ID);
  console.log(`  Pipeline ${pipeline.ID} — target Memberships.Status (classification)`);
  const trainStart = Date.now();
  const training = await TrainBoundPipeline(md, user, pipeline, state.Records, 'ps-inproc-operate-flow');
  console.log(`  Trained in ${Date.now() - trainStart}ms — run ${training.RunID}, model ${training.Model ? `${training.Model.ID} (status=${training.Model.Status}, version=${training.Model.Version})` : '(none)'}`);
  check(training.Model !== null, `the run's stored gate decision shipped a model to operate${training.NoModelReason ? ` (it shipped none: ${training.NoModelReason})` : ''}`);
  if (training.Model === null) return null;
  // Scoring refuses a Draft model (MODEL_NOT_SCORABLE), so promote it to Published first.
  console.log(`  promoted → ${await PromoteToPublished(md, user, training.Model.ID, TAG)}`);
  return training.Model.ID;
}

/** Steps 3–3b: the GENERIC Record Process — no binding, predictions in run history only, nothing written back. */
async function proveGenericOutput(md: IMetadataProvider, user: UserInfo, modelId: string, scope: { filter: string }): Promise<void> {
  // The Operate dialog's "record predictions in run history only" mode: no binding, no write-back.
  banner('3. CreateScoringProcess(...) — GENERIC output (no write-back, no binding)');
  const generic: CreateScoringProcessResult = await CreateScoringProcess({
    modelId,
    targetEntityName: 'Memberships',
    scope: { filter: scope.filter },
    primaryKeyField: 'ID',
    contextUser: user,
    provider: md,
  });
  const genericRP = generic.recordProcess;
  console.log(`  Record Process ${genericRP.ID} ('${genericRP.Name}')`);
  check(generic.binding === null, 'GENERIC mode → result.binding === null (no lineage row)');
  await verifyGenericRecordProcess(user, genericRP.ID, modelId);

  // ── 3b. Run the GENERIC RP — predictions persist in run history, NOT the column ──
  banner('3b. RUN GENERIC RP (RecordProcessExecutor.RunByID) — run-history-only predictions');
  const genRunStart = Date.now();
  const genRun = await new RecordProcessExecutor().RunByID(genericRP.ID, { ContextUser: user, TriggeredBy: 'OnDemand' });
  console.log(`  Run: Status=${genRun.Status} Processed=${genRun.Processed} Success=${genRun.Success} Error=${genRun.Error} Skipped=${genRun.Skipped} ProcessRunID=${genRun.ProcessRunID} (${Date.now() - genRunStart}ms)`);
  check(genRun.Status === 'Completed', `generic run Status = 'Completed' (got '${genRun.Status}')`);
  check(genRun.Success > 0, `generic run scored > 0 records (Success=${genRun.Success})`);
  check(genRun.Error === 0, `generic run had 0 errors (Error=${genRun.Error})`);
  check(!!genRun.ProcessRunID, 'generic run produced a persisted ProcessRunID');
  if (genRun.ProcessRunID) await verifyGenericRunHistory(user, genRun.ProcessRunID);

  // The member column must NOT have been written in generic mode.
  const genScored = countScored(await readBackPredictions(user, scope.filter));
  check(genScored === 0, `GENERIC mode wrote NOTHING to '${OUTPUT_FIELD}' (got ${genScored} scored rows)`);
}

/** Step 3a: the generic Record Process row as saved. */
async function verifyGenericRecordProcess(user: UserInfo, recordProcessId: string, modelId: string): Promise<void> {
  const genCheck = await new RunView().RunView<MJRecordProcessEntity>(
    { EntityName: 'MJ: Record Processes', ExtraFilter: `ID='${recordProcessId}'`, ResultType: 'entity_object', MaxRows: 1, BypassCache: true }, user,
  );
  const genRow = genCheck.Results?.[0];
  check(!!genRow, 'GENERIC Record Process re-read found');
  if (!genRow) return;
  check(genRow.Status === 'Active', `RP Status = 'Active' (got '${genRow.Status}')`);
  // 'ML Model' is the runtime work type, not in the codegen'd union — read it via Get().
  check(genRow.Get('WorkType') === 'ML Model', `RP WorkType = 'ML Model' (got '${genRow.Get('WorkType')}')`);
  check(genRow.OnDemandEnabled === true, `RP OnDemandEnabled = true (got ${genRow.OnDemandEnabled})`);
  check(genRow.ScheduleEnabled === false, `RP ScheduleEnabled = false (got ${genRow.ScheduleEnabled})`);
  check(genRow.ScopeType === 'Filter', `RP ScopeType = 'Filter' (got '${genRow.ScopeType}')`);
  const om = genRow.OutputMapping;
  check(om == null || om.trim().length === 0, `RP OutputMapping is null/empty (no write-back) (got '${om ?? 'null'}')`);
  const cfg = SafeJSONParse<MLScoringConfiguration>(genRow.Configuration ?? '');
  check(UUIDsEqual(cfg?.modelId ?? '', modelId), `RP Configuration.modelId === the model id`);
}

/** The core generic-mode assertion: predictions persist in `MJ: Process Run Details` with NO binding, and they vary. */
async function verifyGenericRunHistory(user: UserInfo, processRunId: string): Promise<void> {
  const payloads = await readRunDetailPayloads(user, processRunId);
  console.log(`  ${payloads.length} Process Run Detail payloads parsed.`);
  check(payloads.length > 0, 'GENERIC run wrote ≥1 Process Run Detail row');
  const withScore = payloads.filter((p) => isNumeric(p.score) && p.scoredAt != null);
  check(withScore.length > 0, "a detail's ResultPayload parses to { score: <number>, scoredAt } (predictions in run history)");
  // ── ANTI-SKEW REGRESSION GUARD ──────────────────────────────────────────────
  // The pipeline trains on `MembershipType` — a VIRTUAL (view-joined) column the on-demand
  // scope can silently drop, which made every prediction identical (the bug this guards). The
  // assembler now re-reads dropped feature columns from the entity view, so predictions must VARY.
  // A single distinct score across a multi-type scope = the skew is back.
  const distinctScores = new Set(withScore.map((p) => p.score)).size;
  console.log(`  Distinct prediction scores across ${withScore.length} rows: ${distinctScores}`);
  check(distinctScores > 1, `GENERIC predictions VARY across the scope (distinct scores=${distinctScores}>1) — virtual feature reached the model, no train/serve skew`);
}

/** Steps 4–4c: the WRITE-BACK Record Process — binding + OutputMapping, run history AND the column. */
async function proveWriteBackOutput(md: IMetadataProvider, user: UserInfo, modelId: string, scope: { filter: string }, state: RigState): Promise<void> {
  banner('4. CreateScoringProcess(...) — WRITE-BACK output (binding + OutputMapping)');
  const writeBack: CreateScoringProcessResult = await CreateScoringProcess({
    modelId,
    targetEntityName: 'Memberships',
    scope: { filter: scope.filter },
    outputField: OUTPUT_FIELD,
    primaryKeyField: 'ID',
    contextUser: user,
    provider: md,
  });
  const wbRP = writeBack.recordProcess;
  console.log(`  Record Process ${wbRP.ID} ('${wbRP.Name}')`);
  check(writeBack.binding !== null, 'WRITE-BACK mode → result.binding !== null');
  if (writeBack.binding) {
    check(writeBack.binding.Mode === 'OnDemand', `binding.Mode === 'OnDemand' (got '${writeBack.binding.Mode}')`);
    check(writeBack.binding.TargetColumn === OUTPUT_FIELD, `binding.TargetColumn === '${OUTPUT_FIELD}' (got '${writeBack.binding.TargetColumn}')`);
    check(UUIDsEqual(writeBack.binding.RecordProcessID, wbRP.ID), 'binding.RecordProcessID === the RP id');
  }

  // ── 4a. Verify the write-back RP carries an OutputMapping ─────────────────
  const wbCheck = await new RunView().RunView<MJRecordProcessEntity>(
    { EntityName: 'MJ: Record Processes', ExtraFilter: `ID='${wbRP.ID}'`, ResultType: 'entity_object', MaxRows: 1, BypassCache: true }, user,
  );
  const wbRow = wbCheck.Results?.[0];
  check(!!wbRow, 'WRITE-BACK Record Process re-read found');
  if (wbRow) {
    const om = SafeJSONParse<OutputMappingShape>(wbRow.OutputMapping ?? '');
    check(om?.fields?.[OUTPUT_FIELD] === '$.score', `RP OutputMapping maps ${OUTPUT_FIELD} ← '$.score'`);
  }

  // ── 4b. Run the WRITE-BACK RP — run history AND the column land ───────────
  banner('4b. RUN WRITE-BACK RP (RecordProcessExecutor.RunByID) — predictions + column write-back');
  const wbRunStart = Date.now();
  const wbRun = await new RecordProcessExecutor().RunByID(wbRP.ID, { ContextUser: user, TriggeredBy: 'OnDemand' });
  console.log(`  Run: Status=${wbRun.Status} Processed=${wbRun.Processed} Success=${wbRun.Success} Error=${wbRun.Error} Skipped=${wbRun.Skipped} ProcessRunID=${wbRun.ProcessRunID} (${Date.now() - wbRunStart}ms)`);
  check(wbRun.Status === 'Completed', `write-back run Status = 'Completed' (got '${wbRun.Status}')`);
  check(wbRun.Success > 0, `write-back run scored > 0 records (Success=${wbRun.Success})`);
  check(wbRun.Error === 0, `write-back run had 0 errors (Error=${wbRun.Error})`);
  if (wbRun.ProcessRunID) {
    const payloads = await readRunDetailPayloads(user, wbRun.ProcessRunID);
    check(payloads.filter((p) => isNumeric(p.score)).length > 0, 'WRITE-BACK run ALSO carries predictions in Process Run Details');
  }

  // ── 4c. Verify the column write-back landed ───────────────────────────────
  banner('4c. VERIFY WRITE-BACK (RunView Memberships — RenewalScore)');
  state.ReadbackRows = await readBackPredictions(user, scope.filter);
  const scored = countScored(state.ReadbackRows);
  console.log(`  ${scored}/${state.ReadbackRows.length} rows carry a numeric '${OUTPUT_FIELD}'.`);
  check(scored > 0, `at least one Membership row carries a numeric '${OUTPUT_FIELD}' (countScored > 0)`);
}

/** Step 5: the whole-entity scope SHAPE — assert only, never run (it would score the whole table). */
async function proveWholeEntityShape(md: IMetadataProvider, user: UserInfo, modelId: string): Promise<void> {
  banner('5. CreateScoringProcess({ scope: { all: true } }) — SHAPE ONLY (not run)');
  const wholeEntity: CreateScoringProcessResult = await CreateScoringProcess({
    modelId,
    targetEntityName: 'Memberships',
    scope: { all: true },
    primaryKeyField: 'ID',
    contextUser: user,
    provider: md,
  });
  const allRP = wholeEntity.recordProcess;
  console.log(`  Record Process ${allRP.ID} ('${allRP.Name}') — NOT run.`);
  check(allRP.ScopeType === 'Filter', `whole-entity RP ScopeType === 'Filter' (got '${allRP.ScopeType}')`);
  check(allRP.ScopeFilter === '(1=1)', `whole-entity RP ScopeFilter === '(1=1)' (got '${allRP.ScopeFilter}')`);
}

/** NULLs the written column, then deletes every row the run created (the model's Record Processes and bindings included); each failure fails the rig. */
async function cleanup(md: IMetadataProvider, user: UserInfo, state: RigState): Promise<void> {
  banner('CLEAR WRITTEN-BACK COLUMN (repeatability)');
  if (state.ReadbackRows.length > 0) {
    await clearWrittenColumns(md, user, state.ReadbackRows);
  } else {
    console.log('  (no read-back rows captured — nothing to clear)');
  }
  banner('CLEANUP');
  failures += ReportCleanup(await DeleteRecordedRows(md, user, state.Records, state.Algorithm));
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { user, provider } = await BootstrapAI();
  const state: RigState = { Records: new RunRecords(), ReadbackRows: [] };
  let storage: FileStorageActivation | null = null;
  try {
    resolveEntitiesOrSkip(provider);
    // Training stores its artifacts through an active File Storage Provider, made available as the gate harness does.
    storage = await RigStorage.Activate(provider, user);
    banner('2. RESOLVE SCOPE + BIND UNIT AND PROTOCOL + TRAIN IN-PROCESS');
    const scope = await resolveScopeIDs(user);
    console.log(`  Scope: ${scope.ids.length} Membership IDs → filter = ID IN (… ${scope.ids.length} ids …)`);
    const modelId = await trainAndPromote(provider, user, state);
    if (modelId !== null) {
      await proveGenericOutput(provider, user, modelId, scope);
      await proveWriteBackOutput(provider, user, modelId, scope, state);
      await proveWholeEntityShape(provider, user, modelId);
    }
    banner(failures === 0 ? 'OPERATE-FLOW PROOF COMPLETE — ALL CHECKS PASSED' : `OPERATE-FLOW PROOF FAILED — ${failures} CHECK(S) FAILED`);
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
  console.error(`\nOPERATE-FLOW ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(2);
});
