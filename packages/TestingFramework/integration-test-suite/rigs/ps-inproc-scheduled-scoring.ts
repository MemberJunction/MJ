/**
 * ps-inproc-scheduled-scoring.ts — IN-PROCESS proof of the **PS2-6 north-star**: the full
 * composition that lets a one-call helper bind a trained model to write its prediction into a
 * member record on a recurring (monthly) schedule, end to end:
 *
 *   train a model  →  CreateScheduledModelScoring(...)  (ONE call)
 *                  →  a scheduled `MJ: Record Processes` row is created + saved (WorkType='ML Model',
 *                     ScheduleEnabled=true, CronExpression='0 0 1 * *', OutputMapping writes RenewalScore)
 *                  →  saving it AUTO-CREATES an owned `MJ: Scheduled Jobs` row (the monthly binding,
 *                     via MJRecordProcessEntityServer.Save → reconcileScheduledJob)
 *                  →  running the Record Process actually SCORES the rows + WRITES the column back.
 *
 * "Build a model, write the renewal probability back into the member record, and re-score it on the
 * 1st of every month" — proved by composition, with no new scheduling / dispatch / write-back code.
 *
 * ## Why in-process (mirrors ps-inproc-scored-query.ts)
 * Like the scored-query enrichment proof, this needs the real server-side machinery: the
 * MJRecordProcessEntityServer Save hook that reconciles the owned Scheduled Job, the runtime-registered
 * `'ML Model'` scoring work type, and the Python sidecar. So it uses `bootstrapAI()` (the real
 * SQLServerDataProvider in-process, no MJAPI) and gates the train+score legs behind `PS_INTEGRATION=1`.
 * We can't wait a month for SchedulingEngine to fire the cron, so instead we (a) VERIFY the owned
 * Scheduled Job the scheduler would dispatch, and (b) run the Record Process now via
 * `RecordProcessExecutor.RunByID` — the SAME path the scheduled job driver uses — and assert the
 * write-back landed.
 *
 * ## Gating + side-effect registration
 * Importing `@memberjunction/predictive-studio` runs the `@RegisterClass` decorators for the `'ML
 * Model'` scoring work type; `LoadMLModelInferenceProcessor()` anchors that side effect against
 * tree-shaking. Without `PS_INTEGRATION=1` (+ a reachable sidecar) the script does a graceful,
 * deterministic SKIP (exit 0) after entity resolution.
 *
 * THROWAWAY: it creates the driver's ML Algorithm (if missing) + an ML Training Pipeline bound to its Prediction Unit
 * and Evaluation Protocol (the pipeline migration, as the gates' harness binds its pipelines), trains a model, creates
 * the scheduled Record Process (+ its owned Scheduled Job), runs it once, then NULLs the RenewalScore column and
 * deletes every row it created in `finally`, children first (the owned Scheduled Job, then `lib/ps-rig-lifecycle.ts`);
 * a row it cannot delete fails the rig. A run whose stored gate decision ships no model fails the rig with the stored
 * reason (nothing to schedule).
 *
 * USAGE (from the repo root, against a live DB the harness resolves; needs AssociationDemo's Memberships):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-scheduled-scoring.ts
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-scheduled-scoring.ts   # deterministic SKIP (no sidecar)
 *
 * Exit code: 0 = passed (or cleanly skipped), 1 = failures, 2 = bootstrap error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import { RigStorage } from './lib/rig-storage';
import type { FileStorageActivation } from '@memberjunction/predictive-studio-truth-suite';
import { PromoteToPublished } from './lib/ps-promote';
import { DeleteRecordedRows, DeleteRow, EnsureDriverAlgorithm, ReportCleanup, TrainBoundPipeline, type RigAlgorithm } from './lib/ps-rig-lifecycle';
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
  MJScheduledJobEntity,
  MJScheduledJobRunEntity,
  MJMLModelScoringBindingEntity,
} from '@memberjunction/core-entities';
import { RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
// Side-effect import: runs the @RegisterClass decorator for the 'ML Model' scoring work type, and
// exposes the PS2-6 scheduled-scoring helper.
import {
  CreateScheduledModelScoring,
  LoadMLModelInferenceProcessor,
} from '@memberjunction/predictive-studio';

// Anchor the side-effect registration so the transpiler/bundler can't drop the decorated module.
LoadMLModelInferenceProcessor();

/** Whether the live-sidecar / trained-model legs run (mirrors PS_LIVE on predictive-studio-tests.ts). */
const PS_LIVE = process.env.PS_INTEGRATION === '1';
const DRIVER_KEY = 'logistic_regression';
const TAG = 'ps-inproc-scheduled-scoring (safe to delete)';
/** The column the scheduled write-back writes the prediction into. */
const OUTPUT_FIELD = 'RenewalScore';
/** How many Membership rows to scope/score (kept small so the on-demand run is fast). */
const ROW_COUNT = 15;
/** The cron the 'Monthly' cadence maps to (CADENCE_CRON.Monthly) — what we assert on the RP + job. */
const MONTHLY_CRON = '0 0 1 * *';

/** The model Configuration shape the 'ML Model' work type reads off the Record Process. */
interface MLScoringConfiguration {
  modelId?: string;
  primaryKeyField?: string;
}
/** The OutputMapping shape the write-back substrate reads off the Record Process. */
interface OutputMappingShape {
  fields?: Record<string, string>;
}
/** The owned Scheduled Job's Configuration shape (links it back to the Record Process). */
interface ScheduledJobConfiguration {
  RecordProcessID?: string;
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

/** True when a value is a finite number (the write-back persists a numeric `score`). */
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

/** Resolve ~ROW_COUNT Membership IDs + the `ID IN (...)` filter the schedule scopes (fast + deterministic). */
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

/** Build the renewal pipeline's JSON config columns and save the pipeline row (reuses ps-inproc-scored-query). */
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
  p.Description = 'Member renewal classifier on AssociationDemo Memberships (Status) — scheduled-scoring north-star proof.';
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

/** Re-read the 15 scoped Membership rows (BypassCache) to inspect the written-back RenewalScore. */
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

/** Everything the run created that cleanup undoes: the recorded rows, the algorithm, the Record Process whose owned Scheduled Job it removes, and the rows whose column it wrote. */
interface RigState {
  readonly Records: RunRecords;
  Algorithm?: RigAlgorithm;
  RecordProcessID?: string;
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
    console.log('  This script trains a real model and runs the scheduled Record Process against the sidecar,');
    console.log('  gated like predictive-studio-tests.ts. The scheduled-job creation is part of that path. Exiting 0.');
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
  const training = await TrainBoundPipeline(md, user, pipeline, state.Records, 'ps-inproc-scheduled-scoring');
  console.log(`  Trained in ${Date.now() - trainStart}ms — run ${training.RunID}, model ${training.Model ? `${training.Model.ID} (status=${training.Model.Status}, version=${training.Model.Version})` : '(none)'}`);
  check(training.Model !== null, `the run's stored gate decision shipped a model to schedule${training.NoModelReason ? ` (it shipped none: ${training.NoModelReason})` : ''}`);
  if (training.Model === null) return null;
  // Scoring refuses a Draft model (MODEL_NOT_SCORABLE), so promote it to Published first.
  console.log(`  promoted → ${await PromoteToPublished(md, user, training.Model.ID, TAG)}`);
  return training.Model.ID;
}

/** The scheduled Record Process and the binding the helper returned. */
interface ScheduledScoring {
  readonly RecordProcessID: string;
  readonly BindingID: string | null;
}

/** Steps 3–4: bind the model to a MONTHLY write-back schedule (one helper call) and verify the Record Process row. */
async function scheduleScoring(md: IMetadataProvider, user: UserInfo, modelId: string, scope: { filter: string }, state: RigState): Promise<ScheduledScoring> {
  banner('3. CreateScheduledModelScoring(...) — bind model → monthly RenewalScore write-back');
  const scheduled = await CreateScheduledModelScoring({
    modelId,
    targetEntityName: 'Memberships',
    outputField: OUTPUT_FIELD,
    scope: { filter: scope.filter },
    cadence: 'Monthly',
    primaryKeyField: 'ID',
    contextUser: user,
    provider: md,
  });
  const rp = scheduled.recordProcess;
  state.RecordProcessID = rp.ID;
  console.log(`  Record Process ${rp.ID} ('${rp.Name}')`);
  check(scheduled.binding !== null, 'the scheduled write-back saved its scoring binding');
  if (scheduled.binding) console.log(`  Scoring Binding ${scheduled.binding.ID} (Mode='${scheduled.binding.Mode}')`);
  await verifyRecordProcess(user, rp.ID, modelId);
  return { RecordProcessID: rp.ID, BindingID: scheduled.binding ? scheduled.binding.ID : null };
}

/** Step 4: the scheduled Record Process row as saved (re-read, BypassCache). */
async function verifyRecordProcess(user: UserInfo, recordProcessId: string, modelId: string): Promise<void> {
  banner('4. VERIFY RECORD PROCESS (re-read, BypassCache)');
  const rpCheck = await new RunView().RunView<MJRecordProcessEntity>(
    { EntityName: 'MJ: Record Processes', ExtraFilter: `ID='${recordProcessId}'`, ResultType: 'entity_object', MaxRows: 1, BypassCache: true }, user,
  );
  const rpRow = rpCheck.Results?.[0];
  check(!!rpRow, 'Record Process re-read found');
  if (!rpRow) return;
  check(rpRow.Status === 'Active', `RP Status = 'Active' (got '${rpRow.Status}')`);
  // 'ML Model' is the runtime work type, not in the codegen'd union — read it via Get().
  check(rpRow.Get('WorkType') === 'ML Model', `RP WorkType = 'ML Model' (got '${rpRow.Get('WorkType')}')`);
  check(rpRow.ScheduleEnabled === true, `RP ScheduleEnabled = true (got ${rpRow.ScheduleEnabled})`);
  check(rpRow.CronExpression === MONTHLY_CRON, `RP CronExpression = '${MONTHLY_CRON}' (got '${rpRow.CronExpression}')`);
  const cfg = SafeJSONParse<MLScoringConfiguration>(rpRow.Configuration ?? '');
  check(UUIDsEqual(cfg?.modelId ?? '', modelId), `RP Configuration.modelId === the model id`);
  check(cfg?.primaryKeyField === 'ID', `RP Configuration.primaryKeyField === 'ID'`);
  const om = SafeJSONParse<OutputMappingShape>(rpRow.OutputMapping ?? '');
  check(om?.fields?.[OUTPUT_FIELD] === '$.score', `RP OutputMapping maps ${OUTPUT_FIELD} ← '$.score'`);
}

/** The owned Scheduled Jobs whose Configuration names the Record Process (the reconcile sets Configuration={RecordProcessID}). */
async function ownedScheduledJobs(user: UserInfo, recordProcessId: string): Promise<MJScheduledJobEntity[]> {
  const jobs = await new RunView().RunView<MJScheduledJobEntity>(
    { EntityName: 'MJ: Scheduled Jobs', ExtraFilter: `Configuration LIKE '%${recordProcessId}%'`, ResultType: 'entity_object', BypassCache: true }, user,
  );
  if (!jobs.Success) throw new Error(`Reading MJ: Scheduled Jobs failed: ${jobs.ErrorMessage}`);
  return jobs.Results;
}

/** Step 5: the OWNED Scheduled Job the save created (the monthly binding). */
async function verifyOwnedScheduledJob(user: UserInfo, recordProcessId: string): Promise<void> {
  banner('5. VERIFY OWNED SCHEDULED JOB (auto-created on save)');
  const jobRows = await ownedScheduledJobs(user, recordProcessId);
  check(jobRows.length === 1, `exactly ONE owned Scheduled Job references the RP (found ${jobRows.length})`);
  const job = jobRows[0];
  if (!job) return;
  console.log(`  Scheduled Job ${job.ID} ('${job.Name}')`);
  check(job.CronExpression === MONTHLY_CRON, `Job CronExpression = '${MONTHLY_CRON}' (got '${job.CronExpression}')`);
  check(job.Status === 'Active', `Job Status = 'Active' (got '${job.Status}')`);
  const jobCfg = SafeJSONParse<ScheduledJobConfiguration>(job.Configuration ?? '');
  check(UUIDsEqual(jobCfg?.RecordProcessID ?? '', recordProcessId), `Job Configuration.RecordProcessID === the RP id`);
}

/**
 * Step 5b: the ML Model Scoring Binding (the lineage row). The model-prediction form panel and the "Models in
 * Production" dashboard read these rows; assert EXACTLY ONE exists for the model, tying it to this RP + target
 * entity/column at Mode='Scheduled'.
 */
async function verifyScoringBinding(md: IMetadataProvider, user: UserInfo, modelId: string, scheduled: ScheduledScoring): Promise<void> {
  banner('5b. VERIFY ML MODEL SCORING BINDING (the lineage row)');
  const bindings = await new RunView().RunView<MJMLModelScoringBindingEntity>(
    { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `MLModelID='${modelId}'`, ResultType: 'entity_object', BypassCache: true }, user,
  );
  const bindingRows = bindings.Results ?? [];
  check(bindingRows.length === 1, `exactly ONE scoring binding exists for the model (found ${bindingRows.length})`);
  const binding = bindingRows[0];
  if (!binding) return;
  check(UUIDsEqual(binding.ID, scheduled.BindingID ?? ''), `binding id matches the helper's returned binding (${scheduled.BindingID})`);
  check(UUIDsEqual(binding.RecordProcessID, scheduled.RecordProcessID), `binding RecordProcessID === the RP id`);
  check(UUIDsEqual(binding.TargetEntityID, entityId(md, 'Memberships')), `binding TargetEntityID === Memberships entity id`);
  check(binding.TargetColumn === OUTPUT_FIELD, `binding TargetColumn === '${OUTPUT_FIELD}' (got '${binding.TargetColumn}')`);
  check(binding.Mode === 'Scheduled', `binding Mode === 'Scheduled' (got '${binding.Mode}')`);
}

/**
 * Steps 6–7: the actual scoring + write-back (the scheduler's dispatch path). SchedulingEngine fires the cron monthly
 * via RecordProcessExecutor.RunByID; we invoke the SAME path now (we can't wait a month) and assert the column landed.
 */
async function runAndVerifyWriteBack(user: UserInfo, recordProcessId: string, scope: { filter: string }, state: RigState): Promise<void> {
  banner('6. RUN THE RECORD PROCESS NOW (RecordProcessExecutor.RunByID)');
  const runStart = Date.now();
  const runResult = await new RecordProcessExecutor().RunByID(recordProcessId, { ContextUser: user, TriggeredBy: 'OnDemand' });
  console.log(`  Run: Status=${runResult.Status} Processed=${runResult.Processed} Success=${runResult.Success} Error=${runResult.Error} Skipped=${runResult.Skipped} (${Date.now() - runStart}ms)`);
  check(runResult.Status === 'Completed', `run Status = 'Completed' (got '${runResult.Status}')`);
  check(runResult.Success > 0, `run scored > 0 records (Success=${runResult.Success})`);
  check(runResult.Error === 0, `run had 0 errors (Error=${runResult.Error})`);

  banner('7. VERIFY WRITE-BACK (RunView Memberships — RenewalScore)');
  state.ReadbackRows = await readBackPredictions(user, scope.filter);
  const scored = countScored(state.ReadbackRows);
  console.log(`  ${scored}/${state.ReadbackRows.length} rows carry a numeric '${OUTPUT_FIELD}'.`);
  check(scored > 0, `at least one Membership row carries a numeric '${OUTPUT_FIELD}'`);
  check(scored === state.ReadbackRows.length, `ALL ${state.ReadbackRows.length} scoped rows carry '${OUTPUT_FIELD}' (got ${scored})`);
}

/** Deletes the Record Process's owned Scheduled Jobs, each job's runs first; one line per row that could not be deleted. */
async function deleteOwnedScheduledJobs(user: UserInfo, recordProcessId: string): Promise<string[]> {
  const failures: string[] = [];
  for (const job of await ownedScheduledJobs(user, recordProcessId)) {
    const jobRuns = await new RunView().RunView<MJScheduledJobRunEntity>(
      { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ScheduledJobID='${job.ID}'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    if (!jobRuns.Success) throw new Error(`Reading MJ: Scheduled Job Runs failed: ${jobRuns.ErrorMessage}`);
    for (const jr of jobRuns.Results) {
      const failure = await DeleteRow('MJ: Scheduled Job Runs', jr);
      if (failure !== null) failures.push(failure);
    }
    const failure = await DeleteRow('MJ: Scheduled Jobs', job);
    if (failure !== null) failures.push(failure);
  }
  return failures;
}

/**
 * NULLs the written column, then deletes every row the run created: the owned Scheduled Job (+ its runs) first, then
 * the recorded rows children first (the model's Record Process and binding included); each failure fails the rig.
 */
async function cleanup(md: IMetadataProvider, user: UserInfo, state: RigState): Promise<void> {
  banner('CLEAR WRITTEN-BACK COLUMN (repeatability)');
  if (state.ReadbackRows.length > 0) {
    await clearWrittenColumns(md, user, state.ReadbackRows);
  } else {
    console.log('  (no read-back rows captured — nothing to clear)');
  }
  banner('CLEANUP');
  const jobFailures = state.RecordProcessID ? await deleteOwnedScheduledJobs(user, state.RecordProcessID) : [];
  failures += ReportCleanup([...jobFailures, ...(await DeleteRecordedRows(md, user, state.Records, state.Algorithm))]);
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
      const scheduled = await scheduleScoring(provider, user, modelId, scope, state);
      await verifyOwnedScheduledJob(user, scheduled.RecordProcessID);
      await verifyScoringBinding(provider, user, modelId, scheduled);
      await runAndVerifyWriteBack(user, scheduled.RecordProcessID, scope, state);
    }
    banner(failures === 0 ? 'PS2-6 NORTH-STAR PROOF COMPLETE — ALL CHECKS PASSED' : `PS2-6 PROOF FAILED — ${failures} CHECK(S) FAILED`);
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
  console.error(`\nSCHEDULED-SCORING ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(2);
});
