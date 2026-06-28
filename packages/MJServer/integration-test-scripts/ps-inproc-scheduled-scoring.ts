/**
 * ps-inproc-scheduled-scoring.ts — IN-PROCESS proof of the **PS2-6 north-star**: the full
 * composition that lets a one-call helper bind a trained model to write its prediction into a
 * member record on a recurring (monthly) schedule, end to end:
 *
 *   train a model  →  createScheduledModelScoring(...)  (ONE call)
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
 * THROWAWAY: it creates a driver-named ML Algorithm (if missing) + an ML Training Pipeline, trains a
 * model, creates the scheduled Record Process (+ its owned Scheduled Job), runs it once, then deletes
 * every row it created (child→parent) in `finally` and NULLs the RenewalScore column for repeatability.
 *
 * USAGE (from the repo root, against a live DB the harness resolves):
 *   PS_INTEGRATION=1 npx tsx packages/MJServer/integration-test-scripts/ps-inproc-scheduled-scoring.ts
 *   npx tsx packages/MJServer/integration-test-scripts/ps-inproc-scheduled-scoring.ts   # deterministic SKIP (no sidecar)
 *
 * Exit code: 0 = passed (or cleanly skipped), 1 = failures, 2 = bootstrap error.
 */
import { bootstrapAI } from './lib/ai-bootstrap';
import {
  RunView,
  UserInfo,
  BaseEntity,
  CompositeKey,
  type IMetadataProvider,
} from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import '@memberjunction/core-entities';
import {
  MJMLAlgorithmEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJRecordProcessEntity,
  MJProcessRunEntity,
  MJScheduledJobEntity,
  MJScheduledJobRunEntity,
  MJMLModelScoringBindingEntity,
} from '@memberjunction/core-entities';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
// Side-effect import: runs the @RegisterClass decorator for the 'ML Model' scoring work type, and
// exposes the in-process train delegation helper + the PS2-6 scheduled-scoring helper.
import {
  trainModelViaEngine,
  createScheduledModelScoring,
  LoadMLModelInferenceProcessor,
  type TrainModelInput,
  type TrainModelResult,
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

/**
 * Best-effort cleanup, child→parent: the owned Scheduled Job (+ its Job Runs) → the ML Model Scoring
 * Binding (it FKs both the model AND the Record Process, so delete it before either) → the Record
 * Process's Process Run Details → Process Runs → the Record Process → the model's training run(s) →
 * model → pipeline → algorithm. Logs LatestResult on every delete failure.
 */
async function cleanup(md: IMetadataProvider, user: UserInfo, ids: {
  scheduledJobId?: string; scoringBindingId?: string; recordProcessId?: string; pipelineId?: string; modelId?: string;
  algorithmId?: string; algorithmCreated?: boolean;
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

  // The owned Scheduled Job (+ its Job Runs) — delete the runs first (they FK the job).
  if (ids.scheduledJobId) {
    const jobRuns = await new RunView().RunView<MJScheduledJobRunEntity>(
      { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ScheduledJobID='${ids.scheduledJobId}'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    for (const jr of jobRuns.Results ?? []) {
      const ok = await jr.Delete();
      if (!ok) {
        console.log(`  FAILED to delete MJ: Scheduled Job Runs ${jr.ID} — ${jr.LatestResult?.CompleteMessage}`);
      }
    }
    await del('MJ: Scheduled Jobs', ids.scheduledJobId);
  }

  // The ML Model Scoring Binding FKs both the model AND the Record Process — delete it before either.
  if (ids.scoringBindingId) {
    await del('MJ: ML Model Scoring Bindings', ids.scoringBindingId);
  }

  // The Record Process's Process Runs (+ their details) FK the Record Process; delete child→parent.
  if (ids.recordProcessId) {
    const runs = await new RunView().RunView<{ ID: string }>(
      { EntityName: 'MJ: Process Runs', Fields: ['ID'], ExtraFilter: `RecordProcessID='${ids.recordProcessId}'`, ResultType: 'simple', BypassCache: true }, user,
    );
    for (const run of runs.Results ?? []) {
      const details = await new RunView().RunView<MJProcessRunEntity>(
        { EntityName: 'MJ: Process Run Details', ExtraFilter: `ProcessRunID='${run.ID}'`, ResultType: 'entity_object', BypassCache: true }, user,
      );
      for (const d of details.Results ?? []) {
        const ok = await d.Delete();
        if (!ok) {
          console.log(`  FAILED to delete MJ: Process Run Details ${d.ID} — ${d.LatestResult?.CompleteMessage}`);
        }
      }
      await del('MJ: Process Runs', run.ID);
    }
    await del('MJ: Record Processes', ids.recordProcessId);
  }

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

  let scheduledJobId: string | undefined;
  let recordProcessId: string | undefined;
  let scoringBindingId: string | undefined;
  let pipelineId: string | undefined;
  let modelId: string | undefined;
  let algorithm: { id: string; created: boolean } | undefined;
  let readbackRows: MembershipReadback[] = [];

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
    console.log(`  Memberships entity: ${membership.Name} (${membership.ID})`);

    if (!PS_LIVE) {
      console.log('\n  SKIP: set PS_INTEGRATION=1 (with the Python sidecar reachable) to train + score.');
      console.log('  This script trains a real model and runs the scheduled Record Process against the sidecar,');
      console.log('  gated like predictive-studio-tests.ts. The scheduled-job creation is part of that path. Exiting 0.');
      process.exit(0);
    }

    // ── 2. Resolve a small scope + train a model IN-PROCESS ───────────────────
    banner('2. RESOLVE SCOPE + TRAIN IN-PROCESS (trainModelViaEngine)');
    const scope = await resolveScopeIDs(user);
    console.log(`  Scope: ${scope.ids.length} Membership IDs → filter = ID IN (… ${scope.ids.length} ids …)`);
    algorithm = await ensureDriverNamedAlgorithm(md, user);
    console.log(`  Algorithm row: ${algorithm.id} (Name='${DRIVER_KEY}', ${algorithm.created ? 'created' : 'reused'})`);
    const pipeline = await createPipeline(md, user, algorithm.id);
    pipelineId = pipeline.ID;
    console.log(`  Pipeline ${pipeline.ID} — target Memberships.Status (classification)`);

    const trainStart = Date.now();
    const trainInput: TrainModelInput = { pipelineId: pipeline.ID, sidecarVersion: 'ps-inproc-scheduled-scoring' };
    const trainResult: TrainModelResult = await trainModelViaEngine(trainInput, provider, user);
    modelId = trainResult.model.ID;
    console.log(`  Trained in ${Date.now() - trainStart}ms — modelId=${trainResult.model.ID} (status=${trainResult.model.Status}, version=${trainResult.model.Version})`);
    check(!!modelId, 'training produced a model id');

    // ── 3. Bind the model to a MONTHLY write-back schedule — ONE helper call ───
    banner('3. createScheduledModelScoring(...) — bind model → monthly RenewalScore write-back');
    const scheduled = await createScheduledModelScoring({
      modelId: modelId!,
      targetEntityName: 'Memberships',
      outputField: OUTPUT_FIELD,
      scope: { filter: scope.filter },
      cadence: 'Monthly',
      primaryKeyField: 'ID',
      contextUser: user,
      provider,
    });
    const rp = scheduled.recordProcess;
    recordProcessId = rp.ID;
    scoringBindingId = scheduled.binding.ID;
    console.log(`  Record Process ${rp.ID} ('${rp.Name}')`);
    console.log(`  Scoring Binding ${scheduled.binding.ID} (Mode='${scheduled.binding.Mode}')`);

    // ── 4. Verify the scheduled Record Process row ────────────────────────────
    banner('4. VERIFY RECORD PROCESS (re-read, BypassCache)');
    const rpCheck = await new RunView().RunView<MJRecordProcessEntity>(
      { EntityName: 'MJ: Record Processes', ExtraFilter: `ID='${rp.ID}'`, ResultType: 'entity_object', MaxRows: 1, BypassCache: true }, user,
    );
    const rpRow = rpCheck.Results?.[0];
    check(!!rpRow, 'Record Process re-read found');
    if (rpRow) {
      check(rpRow.Status === 'Active', `RP Status = 'Active' (got '${rpRow.Status}')`);
      // 'ML Model' is the runtime work type, not in the codegen'd union — read it via Get().
      check(rpRow.Get('WorkType') === 'ML Model', `RP WorkType = 'ML Model' (got '${rpRow.Get('WorkType')}')`);
      check(rpRow.ScheduleEnabled === true, `RP ScheduleEnabled = true (got ${rpRow.ScheduleEnabled})`);
      check(rpRow.CronExpression === MONTHLY_CRON, `RP CronExpression = '${MONTHLY_CRON}' (got '${rpRow.CronExpression}')`);
      const cfg = SafeJSONParse<MLScoringConfiguration>(rpRow.Configuration ?? '');
      check(cfg?.modelId === modelId, `RP Configuration.modelId === the model id`);
      check(cfg?.primaryKeyField === 'ID', `RP Configuration.primaryKeyField === 'ID'`);
      const om = SafeJSONParse<OutputMappingShape>(rpRow.OutputMapping ?? '');
      check(om?.fields?.[OUTPUT_FIELD] === '$.score', `RP OutputMapping maps ${OUTPUT_FIELD} ← '$.score'`);
    }

    // ── 5. Verify the OWNED Scheduled Job (the monthly binding) ───────────────
    banner('5. VERIFY OWNED SCHEDULED JOB (auto-created on save)');
    // Find it by its Configuration referencing the RP id (the reconcile sets Configuration={RecordProcessID}).
    const jobs = await new RunView().RunView<MJScheduledJobEntity>(
      { EntityName: 'MJ: Scheduled Jobs', ExtraFilter: `Configuration LIKE '%${rp.ID}%'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    const jobRows = jobs.Results ?? [];
    check(jobRows.length === 1, `exactly ONE owned Scheduled Job references the RP (found ${jobRows.length})`);
    const job = jobRows[0];
    if (job) {
      scheduledJobId = job.ID;
      console.log(`  Scheduled Job ${job.ID} ('${job.Name}')`);
      check(job.CronExpression === MONTHLY_CRON, `Job CronExpression = '${MONTHLY_CRON}' (got '${job.CronExpression}')`);
      check(job.Status === 'Active', `Job Status = 'Active' (got '${job.Status}')`);
      const jobCfg = SafeJSONParse<ScheduledJobConfiguration>(job.Configuration ?? '');
      check(jobCfg?.RecordProcessID === rp.ID, `Job Configuration.RecordProcessID === the RP id`);
    }

    // ── 5b. Verify the ML Model Scoring Binding (the lineage row) ─────────────
    // The new UX surfaces (model-prediction form panel + "Models in Production"
    // dashboard) read these binding rows; assert EXACTLY ONE exists for the model,
    // tying it to this RP + target entity/column at Mode='Scheduled'.
    banner('5b. VERIFY ML MODEL SCORING BINDING (the lineage row)');
    const bindings = await new RunView().RunView<MJMLModelScoringBindingEntity>(
      { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `MLModelID='${modelId}'`, ResultType: 'entity_object', BypassCache: true }, user,
    );
    const bindingRows = bindings.Results ?? [];
    check(bindingRows.length === 1, `exactly ONE scoring binding exists for the model (found ${bindingRows.length})`);
    const binding = bindingRows[0];
    if (binding) {
      check(binding.ID === scoringBindingId, `binding id matches the helper's returned binding (${scoringBindingId})`);
      check(binding.RecordProcessID === rp.ID, `binding RecordProcessID === the RP id`);
      check(binding.TargetEntityID === entityId(md, 'Memberships'), `binding TargetEntityID === Memberships entity id`);
      check(binding.TargetColumn === OUTPUT_FIELD, `binding TargetColumn === '${OUTPUT_FIELD}' (got '${binding.TargetColumn}')`);
      check(binding.Mode === 'Scheduled', `binding Mode === 'Scheduled' (got '${binding.Mode}')`);
    }

    // ── 6. Prove the actual scoring + write-back (the scheduler's dispatch path) ──
    // SchedulingEngine fires the cron monthly via RecordProcessExecutor.RunByID; we invoke the SAME
    // path now (we can't wait a month) and assert the column was written back.
    banner('6. RUN THE RECORD PROCESS NOW (RecordProcessExecutor.RunByID)');
    const runStart = Date.now();
    const runResult = await new RecordProcessExecutor().RunByID(rp.ID, { contextUser: user, triggeredBy: 'OnDemand' });
    console.log(`  Run: Status=${runResult.Status} Processed=${runResult.Processed} Success=${runResult.Success} Error=${runResult.Error} Skipped=${runResult.Skipped} (${Date.now() - runStart}ms)`);
    check(runResult.Status === 'Completed', `run Status = 'Completed' (got '${runResult.Status}')`);
    check(runResult.Success > 0, `run scored > 0 records (Success=${runResult.Success})`);
    check(runResult.Error === 0, `run had 0 errors (Error=${runResult.Error})`);

    // ── 7. Verify the write-back landed in the column ─────────────────────────
    banner('7. VERIFY WRITE-BACK (RunView Memberships — RenewalScore)');
    readbackRows = await readBackPredictions(user, scope.filter);
    const scored = countScored(readbackRows);
    console.log(`  ${scored}/${readbackRows.length} rows carry a numeric '${OUTPUT_FIELD}'.`);
    check(scored > 0, `at least one Membership row carries a numeric '${OUTPUT_FIELD}'`);
    check(scored === readbackRows.length, `ALL ${readbackRows.length} scoped rows carry '${OUTPUT_FIELD}' (got ${scored})`);

    banner(failures === 0 ? 'PS2-6 NORTH-STAR PROOF COMPLETE — ALL CHECKS PASSED' : `PS2-6 PROOF FAILED — ${failures} CHECK(S) FAILED`);
    console.log(`  Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    banner('CLEAR WRITTEN-BACK COLUMN (repeatability)');
    if (readbackRows.length > 0) {
      await clearWrittenColumns(md, user, readbackRows);
    } else {
      console.log('  (no read-back rows captured — nothing to clear)');
    }
    await cleanup(md, user, {
      scheduledJobId, scoringBindingId, recordProcessId, pipelineId, modelId,
      algorithmId: algorithm?.id, algorithmCreated: algorithm?.created,
    });
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nSCHEDULED-SCORING ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(2);
});
