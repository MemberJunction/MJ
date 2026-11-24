// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// The M4b adversarial harness (Task M4b.6, D-071): one case per cell of the milestone's coverage table that the unit
// tests leave uncovered, each trying to break the claim its name states with the PRODUCTION readers and writers on SQL
// Server: real `'ML Model'` Record Processes declaring `autoTrain`, run in-process through `RecordProcessRunNowOperation`
// (the server body `RecordProcessExecutor` → `MLModelInferenceProcessor.Preflight` → the startup-registered
// `PipelineAutoTrainer` → `TrainingEngine` on the suite sidecar → `AutomatedPublisher` → `LifecycleGate`), over the
// truth suite's W1-signal s42 and W2-noise s100 worlds. W1 s42's stored decision keeps the simple baseline, so its
// pipelines pin version 2 of their protocol with `autoPublishKeepBaseline: true` (saved through
// `EvaluationProtocolVersioning`): an automatic publish is then possible; W2-noise s100 ships nothing (no signal).
//
// The adversary's writes are labelled: the configured model deleted, and the Record Process deleted, each by the
// statements of `spDeleteEntityWithCoreDependencies` for that one row (the statement texts are checked against the
// migration that defines the procedure); the reusable model's stored artifact moved out of storage (and back after the
// case); a kill after the publish commit (`LifecycleGate.prototype.Publish` wrapped once to throw after the real
// publish returned — the publish's own provider transaction has committed, the job dies before its repoint). Every
// other statement is a verification read through the provider (`RunView`, `BypassCache`). Teardown deletes by ID what
// the file created (its Record Processes with their runs, run details and watermarks, its notifications — by SQL, the
// bootstrap's user may not delete them —, the rows the deletes orphaned, then `HarnessCleanup.DeleteRecorded` over its
// pipelines) and requires the starting census.
//
// The mutation map (D-071: one at a time; the named case goes red; the reliability and scan cases are the Engine's
// `registry/__tests__/automated-publishing.reliability.test.ts` and `no-status-writes.test.ts`):
//   1. `already-published` short-circuit dropped (`LifecycleGate.attemptPublish`) → reliability R1 "call Publish twice".
//   2. single-flight claim dropped (`TrainingClaims.claimUnderLock`'s in-flight check) → reliability R2 "two auto-train
//      Process Runs started together"; this file's (a) is the same claim on SQL Server.
//   3. resume-instead-of-retrain dropped (`EnsureTrainedModel` skips `ResumeTransientRefusal`) → reliability R1
//      "transient refusal then rerun".
//   4. `retryAfterHours` dropped (`WithinRetryWindow` returns null) → (e) retryAfterHours 24.
//   5. `notifyOnWithheld` dropped (`PublisherFor` always notifies) → (f).
//   6. the R0 scan: `model.Status = 'Published'` planted in `scoring/auto-train.ts` → no-status-writes, naming file and line.
//   7. the reuse branch's `verified` requirement dropped (`findReusableModel` reuses any load) → (g).
import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type sql from 'mssql';
import { RunView, type EntityInfo } from '@memberjunction/core';
import {
  RecordProcessRunNowOperation,
  type MJMLEvaluationProtocolEntity,
  type MJMLModelEntity,
  type MJMLModelPublishRecordEntity,
  type MJMLTrainingPipelineEntity,
  type MJMLTrainingRunEntity,
  type MJProcessRunEntity,
  type MJRecordProcessEntity,
  type MJUserNotificationEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { EvaluationProtocol, JsonParse, type Actor } from '@memberjunction/predictive-studio-core';
import {
  EvaluationProtocolVersioning,
  LifecycleGate,
  MetadataEntityFactory,
  PipelineAutoTrainer,
  PredictiveStudioScoringStartup,
  StorageProviderArtifactStore,
  type GateContext,
  type PublishOutcome,
  type PublishRequest,
} from '@memberjunction/predictive-studio';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { DatasetLoader } from '../db/dataset-loader';
import { ArtifactObjects } from '../harness/artifact-objects';
import { HarnessCleanup, RunRecords, type CleanupRow } from '../harness/cleanup';
import { HarnessPipelines, type AlgorithmRow } from '../harness/pipelines';
import { HarnessSidecar } from '../harness/sidecar';
import { W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '../harness/w-world';
import type { LoadedDataset } from '../harness/types';
import { ConsoleCapture } from './fixtures/console-capture';

/** Row counts of every table the file (or the production code it drives) writes, and artifact objects under the storage root. */
interface HarnessCensus {
  readonly Models: number;
  readonly Runs: number;
  readonly Snapshots: number;
  readonly Pipelines: number;
  readonly PublishRecords: number;
  readonly OutputBindings: number;
  readonly ScheduledJobs: number;
  readonly ScheduledJobRuns: number;
  readonly Protocols: number;
  readonly Units: number;
  readonly Files: number;
  readonly Actions: number;
  readonly ActionParams: number;
  readonly RecordProcesses: number;
  readonly ProcessRuns: number;
  readonly ProcessRunDetails: number;
  readonly Watermarks: number;
  readonly Notifications: number;
  readonly ScoringBindings: number;
  readonly FeatureValues: number;
  readonly ScoringRuns: number;
  /** `MJ: AI Prompt Runs`, less the Memory Manager's prompts' and `Name Conversation`'s, by prompt name. */
  readonly PromptRuns: number;
  readonly ArtifactObjects: number;
}

/** A finished Process Run as the database holds it. */
type FinishedRun = Pick<MJProcessRunEntity, 'ID' | 'Status' | 'ErrorMessage'>;

/** A publish record as a case reads it back. */
type RecordRow = Pick<MJMLModelPublishRecordEntity, 'ID' | 'ModelID' | 'TrainingRunID' | 'Kind' | 'Purpose' | 'Transient' | 'Refusal' | 'Reason'>;

/** One pipeline of the file with its auto-train Record Process. */
interface AutoTrainFixture {
  readonly PipelineID: string;
  readonly RecordProcessID: string;
  readonly Dataset: LoadedDataset;
}

/** The `autoTrain` options a fixture's Record Process declares beyond its pipeline. */
interface AutoTrainOptions {
  readonly retryAfterHours?: number;
  readonly notifyOnWithheld?: boolean;
}

/** One row the adversary orphaned (its parent row was deleted by SQL), deleted by ID at teardown. */
interface OrphanedRow {
  readonly EntityName: string;
  readonly ID: string;
}

const TAG = `PSTruth: M4b.6 ${Date.now()}`;
// The bootstrap loads all metadata; on a loaded host that alone has taken 44 s, past vitest's default hook timeout.
const BOOTSTRAP_TIMEOUT_MS = 180_000;
/** A case trains one to three models on the suite sidecar. */
const CASE_TIMEOUT_MS = 600_000;
/** The message the kill after the publish commit throws. */
const KILLED = 'the auto-train job was killed after the publish committed';
/** The console lines the production paths write on purpose. */
const EXPECTED_LINES: readonly RegExp[] = [
  /^Running \d+ post-commit task\(s\) after transaction commit$/,
  /^ModelScoringActionGenerator: (ensured|disabled) scoring action /,
  /^Predictive Studio auto-train: /,
  /^RecordSetProcessor: run failed: /,
];
/** The procedure every statement the adversary runs is taken from. */
const PROC_MARKER = 'CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]';
/** The repository's v6 migrations folder. */
const MIGRATIONS_V6 = new URL('../../../../../../migrations/v6/', import.meta.url);
/**
 * The procedure's model step for the models in `@MLModelIDs`, verbatim from the migration (each is checked against it):
 * the runs that name a model let go of it, the publish records of the models and the run-level refusals go (the
 * `@PipelineIDs` half matches nothing: the case deletes one model, never its pipeline), the references from surviving
 * records are cleared, and the models' Feature Values, output bindings, scoring runs (with the Feature Values they
 * wrote) and monitoring results go. Scoring bindings belong to the pipeline, not the model, so the model step leaves
 * them. The procedure then deletes models by pipeline; for one model the last statement is {@link MODEL_ROW_DELETE}.
 */
const MODEL_STEP: readonly string[] = [
  'UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [ResultingModelID] = NULL WHERE [ResultingModelID] IN (SELECT ID FROM @MLModelIDs);',
  'UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [ReplacesModelID] = NULL WHERE [ReplacesModelID] IN (SELECT ID FROM @MLModelIDs);',
  "DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [Source] = N'Model' AND [MLModelID] IN (SELECT ID FROM @MLModelIDs);",
  'UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [MLModelID] = NULL WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);',
  'DELETE FROM [${flyway:defaultSchema}].[MLOutputBinding] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);',
  'DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [MLScoringRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs));',
  'DELETE FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);',
  'DELETE FROM [${flyway:defaultSchema}].[MLMonitoringResult] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);',
];
/** The model rows of `@MLModelIDs`: the procedure's `DELETE FROM [MLModel]` narrowed from the pipeline to the one model. */
const MODEL_ROW_DELETE = 'DELETE FROM [${flyway:defaultSchema}].[MLModel] WHERE [ID] IN (SELECT ID FROM @MLModelIDs);';
/** The publish-record statement of the model step, which the procedure writes on one line with a run-level half. */
const MODEL_RECORDS_DELETE_PREFIX = 'DELETE FROM [${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs) OR ';
/**
 * The procedure's Record Process step for the processes in `@RecordProcessIDs`, verbatim: the rows that name a process
 * let go of it (its Process Runs survive with `RecordProcessID` NULL), its Feature Values, pipeline versions and
 * watermarks go. The procedure then deletes processes by entity; for one process the last statement is {@link PROCESS_ROW_DELETE}.
 */
const PROCESS_STEP: readonly string[] = [
  'UPDATE [${flyway:defaultSchema}].[FeatureValueCache] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);',
  'UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);',
  'UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);',
  'DELETE FROM [${flyway:defaultSchema}].[FeaturePipelineVersion] WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);',
];
/** The Record Process row of `@RecordProcessIDs`: the procedure's `DELETE FROM [RecordProcess]` narrowed from the entity to the one process. */
const PROCESS_ROW_DELETE = 'DELETE FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [ID] IN (SELECT ID FROM @RecordProcessIDs);';

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let storageRoot: string;
let algorithms: AlgorithmRow[];
let w1: LoadedDataset;
let w2: LoadedDataset;
let startCensus: HarnessCensus;
let startedAt: Date;
let procedure: string;
const records = new RunRecords();
/** The Record Processes the file created (with their runs, run details and watermarks: deleted first at teardown). */
const processIds: string[] = [];
/** Rows whose parent the adversary deleted, so `DeleteRecorded` no longer finds them through it. */
const orphans: OrphanedRow[] = [];
/** Every artifact object the adversary moved out of storage and must put back: [moved-to path, original path]. */
const movedObjects: [string, string][] = [];

// ================================================================================================ helpers ==

/** `[schema].[table]` of an entity. */
function tableOf(entityName: string): string {
  const entity: EntityInfo | undefined = server.Provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** `work` with both console channels captured: its result, every line (log, then error) and the lines that are not {@link EXPECTED_LINES}. */
async function quietly<T>(work: () => Promise<T>): Promise<{ Result: T; Lines: string[]; Unexpected: string[] }> {
  const errors = await ConsoleCapture.During('error', () => ConsoleCapture.During('log', work));
  const lines = [...errors.Result.Lines, ...errors.Lines];
  return { Result: errors.Result.Result, Lines: lines, Unexpected: lines.filter((l) => !EXPECTED_LINES.some((x) => x.test(l))) };
}

/** The rows of `entityName` matching `filter`, read past the cache as the bootstrap's user; throws on a failed read. */
async function rows<T>(entityName: string, filter: string, fields: string[], orderBy?: string): Promise<T[]> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<T>(
    { EntityName: entityName, ExtraFilter: filter, Fields: fields, OrderBy: orderBy, ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true },
    server.User,
  );
  if (!r.Success) throw new Error(`reading ${entityName} (${filter}) failed: ${r.ErrorMessage}`);
  return r.Results;
}

/** The pipeline's training runs, oldest first. */
async function trainingRuns(pipelineId: string): Promise<Pick<MJMLTrainingRunEntity, 'ID' | 'Status' | 'ResultingModelID'>[]> {
  return rows('MJ: ML Training Runs', `PipelineID='${EscapeSQLString(pipelineId)}'`, ['ID', 'Status', 'ResultingModelID'], 'StartedAt ASC');
}

/** The publish records of the pipeline's runs, oldest first. */
async function recordsOf(pipelineId: string): Promise<RecordRow[]> {
  return rows<RecordRow>(
    'MJ: ML Model Publish Records',
    `TrainingRunID IN (SELECT ID FROM ${tableOf('MJ: ML Training Runs')} WHERE PipelineID='${EscapeSQLString(pipelineId)}')`,
    ['ID', 'ModelID', 'TrainingRunID', 'Kind', 'Purpose', 'Transient', 'Refusal', 'Reason'], 'RecordedAt ASC',
  );
}

/** The pipeline's models with their status. */
async function modelsOf(pipelineId: string): Promise<Pick<MJMLModelEntity, 'ID' | 'Status' | 'ArtifactFileID'>[]> {
  return rows('MJ: ML Models', `PipelineID='${EscapeSQLString(pipelineId)}'`, ['ID', 'Status', 'ArtifactFileID'], 'Version ASC');
}

/** The notifications the file's runs sent about `recordIds` (the pipeline or its models) since the file started. */
async function notificationsAbout(recordIds: readonly string[]): Promise<Pick<MJUserNotificationEntity, 'ID' | 'Title'>[]> {
  if (recordIds.length === 0) return [];
  const ids = recordIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  return rows('MJ: User Notifications', `ResourceRecordID IN (${ids}) AND __mj_CreatedAt >= '${startedAt.toISOString()}'`, ['ID', 'Title']);
}

/** The pipeline and its models' IDs: every subject a notification about the pipeline's auto-train names. */
async function subjectsOf(pipelineId: string): Promise<string[]> {
  return [pipelineId, ...(await modelsOf(pipelineId)).map((m) => m.ID)];
}

/** The `kind` of a refusal record's stored refusal. */
function refusalKind(r: RecordRow): string | null {
  const parsed = JsonParse.ParseJsonText(r.Refusal, 'Refusal');
  return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? JsonParse.JsonString(parsed.Value, 'kind') : null;
}

/**
 * `UX_MLModelPublishRecord_OnePublishPerRun` read back over the whole table: the training runs holding more than one
 * applied `publish`/`adopt` record (the index refuses the second insert; a non-empty answer would mean it never ran).
 */
async function runsWithTwoPublishes(): Promise<string[]> {
  const applied = await rows<Pick<MJMLModelPublishRecordEntity, 'TrainingRunID'>>(
    'MJ: ML Model Publish Records', `Kind='publish' AND Purpose IN ('publish','adopt') AND TrainingRunID IS NOT NULL`, ['TrainingRunID'],
  );
  const seen: string[] = [];
  const twice: string[] = [];
  for (const r of applied) {
    const id = r.TrainingRunID;
    if (id === null) continue;
    if (seen.some((s) => UUIDsEqual(s, id))) twice.push(id);
    else seen.push(id);
  }
  return twice;
}

/** The Record Process's stored `Configuration`, parsed. */
async function configurationOf(recordProcessId: string): Promise<Record<string, string | number | boolean | null | object>> {
  const [rp] = await rows<Pick<MJRecordProcessEntity, 'Configuration'>>('MJ: Record Processes', `ID='${EscapeSQLString(recordProcessId)}'`, ['Configuration']);
  const parsed = JsonParse.ParseJsonText(rp === undefined ? null : rp.Configuration, 'Configuration');
  if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) throw new Error(`Record Process ${recordProcessId} has no JSON configuration`);
  return parsed.Value;
}

/** A pipeline over `dataset` (logistic regression, the W-world features), recorded; for W1, bound to protocol v2 with `autoPublishKeepBaseline`. */
async function createPipeline(label: string, dataset: LoadedDataset, autoPublishKeepBaseline: boolean): Promise<string> {
  const p = await HarnessPipelines.CreatePipeline(server.Provider, server.User, algorithms, {
    Name: `${TAG} ${label}`, Dataset: dataset, Target: 'Renewed', ProblemType: 'classification', Features: [...W_WORLD_FEATURES],
    Algorithm: 'logistic_regression', AsOf: { Mode: 'none' }, Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 }, DenyFields: [...W_WORLD_DENY_FIELDS],
  });
  records.RecordPipeline(p.ID);
  records.RecordPipelineBindings(p);
  if (autoPublishKeepBaseline) await bindKeepBaselineProtocol(p);
  return p.ID;
}

/** Version 2 of the pipeline's protocol with `autoPublishKeepBaseline: true` (protocol versions are immutable), bound to it and recorded. */
async function bindKeepBaselineProtocol(p: MJMLTrainingPipelineEntity): Promise<void> {
  if (!p.EvaluationProtocolID) throw new Error(`pipeline ${p.ID} has no protocol`);
  const v1 = await server.Provider.GetEntityObject<MJMLEvaluationProtocolEntity>('MJ: ML Evaluation Protocols', server.User);
  if (!(await v1.Load(p.EvaluationProtocolID))) throw new Error(`protocol ${p.EvaluationProtocolID} not found`);
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(v1);
  if (parsed.Ok === false) throw new Error(`protocol ${v1.ID} does not parse: ${parsed.Errors.join('; ')}`);
  const actor: Actor = { kind: 'human', userId: server.User.ID };
  const v2 = await EvaluationProtocolVersioning.CreateNextEvaluationProtocolVersion(
    v1, { promotion: { ...parsed.Value.promotion, autoPublishKeepBaseline: true } }, actor, new MetadataEntityFactory(server.Provider), server.User,
  );
  records.RecordEvaluationProtocol(v2.ID);
  p.EvaluationProtocolID = v2.ID;
  if (!(await p.Save())) throw new Error(`pipeline ${p.ID} could not be bound to protocol v2: ${p.LatestResult?.CompleteMessage}`);
}

/** An on-demand `'ML Model'` Record Process over five rows of the dataset, declaring `autoTrain` for the pipeline; recorded. */
async function createProcess(label: string, pipelineId: string, dataset: LoadedDataset, options: AutoTrainOptions = {}): Promise<string> {
  const rp = await server.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', server.User);
  rp.NewRecord();
  rp.Name = `${TAG} ${label}`;
  rp.EntityID = dataset.Entity.ID;
  rp.Status = 'Active';
  rp.WorkType = 'ML Model';
  rp.ScopeType = 'Filter';
  rp.ScopeFilter = `ID IN (SELECT TOP 5 ID FROM [${dataset.Entity.SchemaName}].[${dataset.Entity.BaseTable}] ORDER BY ID)`;
  rp.Configuration = JSON.stringify({ primaryKeyField: 'ID', autoTrain: { pipelineId, ...options } });
  rp.OnDemandEnabled = true;
  rp.ScheduleEnabled = false;
  if (!(await rp.Save())) throw new Error(`Record Process ${label} did not save: ${rp.LatestResult?.CompleteMessage}`);
  processIds.push(rp.ID);
  return rp.ID;
}

/** A pipeline and its auto-train process. */
async function fixture(label: string, dataset: LoadedDataset, options: AutoTrainOptions = {}): Promise<AutoTrainFixture> {
  const pipelineId = await createPipeline(label, dataset, dataset === w1);
  return { PipelineID: pipelineId, RecordProcessID: await createProcess(label, pipelineId, dataset, options), Dataset: dataset };
}

/** Runs the Record Process now, in-process (`RecordProcess.RunNow`'s server body), and reads its finished Process Run back. */
async function runNow(recordProcessId: string): Promise<FinishedRun> {
  const rn = await new RecordProcessRunNowOperation().Execute({ recordProcessID: recordProcessId }, { provider: server.Provider, user: server.User });
  const runId = rn.Output?.processRunID;
  if (!rn.Success || !runId) throw new Error(`RecordProcess.RunNow ${recordProcessId} failed (${rn.ResultCode || 'no code'}): ${rn.ErrorMessage || 'no processRunID'}`);
  const [run] = await rows<FinishedRun>('MJ: Process Runs', `ID='${EscapeSQLString(runId)}'`, ['ID', 'Status', 'ErrorMessage']);
  if (run === undefined) throw new Error(`Process Run ${runId} was not found after RunNow returned`);
  return run;
}

/** The newest v6 migration that (re)creates the procedure, by file name (Flyway applies them in that order): its procedure text. */
function procedureText(): string {
  const named = readdirSync(MIGRATIONS_V6).filter((f) => f.endsWith('.sql')).sort();
  const texts = named.map((f) => readFileSync(new URL(f, MIGRATIONS_V6), 'utf8')).filter((t) => t.includes(PROC_MARKER));
  const newest = texts[texts.length - 1];
  if (newest === undefined) throw new Error('no v6 migration creates spDeleteEntityWithCoreDependencies');
  const from = newest.indexOf(PROC_MARKER);
  return newest.slice(from, newest.indexOf('\nGO', from));
}

/** A procedure statement with the schema the database holds, after checking it is in the procedure (a drift fails loudly). */
function procedureStatement(statement: string, verbatim: boolean): string {
  if (verbatim && !procedure.includes(statement)) throw new Error(`spDeleteEntityWithCoreDependencies no longer holds: ${statement}`);
  const schema = server.Provider.EntityByName('MJ: ML Models')?.SchemaName;
  if (!schema) throw new Error('MJ: ML Models is not in metadata');
  return statement.split('${flyway:defaultSchema}').join(schema);
}

/**
 * Adversary (the procedure's model step, by direct SQL in one transaction): deletes the model row and what references
 * it. What the procedure leaves behind for a deleted model's pipeline — the model's monitoring jobs (their
 * configuration names it) and its generated scoring Action — is recorded as orphaned, for teardown.
 */
async function deleteModelByProcedure(modelId: string): Promise<void> {
  await recordModelOrphans(modelId);
  if (!procedure.startsWith(PROC_MARKER) || !procedure.includes(MODEL_RECORDS_DELETE_PREFIX)) throw new Error('the procedure no longer deletes the publish records of its models');
  const statements = [
    ...MODEL_STEP.slice(0, 2).map((s) => procedureStatement(s, true)),
    procedureStatement(`DELETE FROM [\${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);`, false),
    ...MODEL_STEP.slice(2).map((s) => procedureStatement(s, true)),
    procedureStatement(MODEL_ROW_DELETE, false),
  ];
  await pool.request().input('ModelID', modelId).query(`SET XACT_ABORT ON; BEGIN TRANSACTION;
    DECLARE @MLModelIDs TABLE (ID uniqueidentifier PRIMARY KEY); INSERT INTO @MLModelIDs (ID) VALUES (@ModelID);
    ${statements.join('\n    ')}
    COMMIT;`);
}

/**
 * Adversary (the procedure's Record Process step, by direct SQL in one transaction): deletes the process row; its
 * Process Runs survive with `RecordProcessID` NULL, as the procedure leaves them. Its watermarks go with it.
 */
async function deleteProcessByProcedure(recordProcessId: string): Promise<void> {
  const watermarks = procedureStatement('DELETE FROM [${flyway:defaultSchema}].[RecordProcessWatermark] WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);', false);
  const statements = [...PROCESS_STEP.map((s) => procedureStatement(s, true)), watermarks, procedureStatement(PROCESS_ROW_DELETE, false)];
  await pool.request().input('RecordProcessID', recordProcessId).query(`SET XACT_ABORT ON; BEGIN TRANSACTION;
    DECLARE @RecordProcessIDs TABLE (ID uniqueidentifier PRIMARY KEY); INSERT INTO @RecordProcessIDs (ID) VALUES (@RecordProcessID);
    ${statements.join('\n    ')}
    COMMIT;`);
}

/** Records, as orphaned, the model's monitoring jobs with their runs and its generated scoring Action with its params. */
async function recordModelOrphans(modelId: string): Promise<void> {
  const store = HarnessCleanup.EntityStore(server.Provider, server.User);
  const jobs = (await store.MonitoringJobs()).filter((j) => (j.Configuration || '').toLowerCase().includes(`"modelid":"${modelId.toLowerCase()}"`));
  for (const job of jobs) {
    for (const run of await store.Rows('MJ: Scheduled Job Runs', `ScheduledJobID='${EscapeSQLString(job.ID)}'`)) orphans.push({ EntityName: 'MJ: Scheduled Job Runs', ID: run.ID });
    orphans.push({ EntityName: 'MJ: Scheduled Jobs', ID: job.ID });
  }
  const modelParams = await store.ActionParams(`Name = 'ModelID' AND Type = 'Input' AND DefaultValue = '${EscapeSQLString(modelId)}'`);
  for (const p of modelParams) {
    for (const param of await store.ActionParams(`ActionID='${EscapeSQLString(p.ActionID)}'`)) orphans.push({ EntityName: 'MJ: Action Params', ID: param.ID });
    orphans.push({ EntityName: 'MJ: Actions', ID: p.ActionID });
  }
}

/** Adversary (storage): moves the model's stored artifact object aside, as a lost disk does; teardown puts it back. */
async function removeArtifactObject(modelId: string): Promise<string> {
  const [model] = await rows<Pick<MJMLModelEntity, 'ArtifactFileID'>>('MJ: ML Models', `ID='${EscapeSQLString(modelId)}'`, ['ArtifactFileID']);
  const fileId = model === undefined ? null : model.ArtifactFileID;
  if (!fileId) throw new Error(`ML Model ${modelId} has no artifact file`);
  const [file] = await rows<{ ProviderKey: string | null }>('MJ: Files', `ID='${EscapeSQLString(fileId)}'`, ['ProviderKey']);
  if (file === undefined || !file.ProviderKey) throw new Error(`MJ: Files ${fileId} has no ProviderKey`);
  const objectPath = ArtifactObjects.ObjectPath(storageRoot, fileId, file.ProviderKey);
  if (!existsSync(objectPath)) throw new Error(`ML Model ${modelId}'s stored object is not at ${objectPath}`);
  const aside = `${objectPath}.removed-by-m4b6`;
  renameSync(objectPath, aside);
  movedObjects.push([aside, objectPath]);
  return objectPath;
}

/** Wraps the next `LifecycleGate.Publish` so the real publish runs and commits, then the job dies (throws {@link KILLED}). */
function killAfterNextPublishCommit(): { Committed(): PublishOutcome | null; Restore(): void } {
  const original = LifecycleGate.prototype.Publish;
  let committed: PublishOutcome | null = null;
  const spy = vi.spyOn(LifecycleGate.prototype, 'Publish').mockImplementationOnce(async function publishThenDie(this: LifecycleGate, request: PublishRequest, ctx: GateContext): Promise<PublishOutcome> {
    committed = await original.call(this, request, ctx);
    throw new Error(KILLED);
  });
  return { Committed: () => committed, Restore: () => spy.mockRestore() };
}

/** Wraps the next `LifecycleGate.Publish` so that, once the real publish has returned, `then` runs (the adversary's write). */
function afterNextPublish(then: () => Promise<void>): { Restore(): void } {
  const original = LifecycleGate.prototype.Publish;
  const spy = vi.spyOn(LifecycleGate.prototype, 'Publish').mockImplementationOnce(async function publishThenAct(this: LifecycleGate, request: PublishRequest, ctx: GateContext): Promise<PublishOutcome> {
    const outcome = await original.call(this, request, ctx);
    await then();
    return outcome;
  });
  return { Restore: () => spy.mockRestore() };
}

/** Row counts and artifact objects under the storage root. */
async function census(): Promise<HarnessCensus> {
  const t = (n: string): string => `(SELECT COUNT(*) FROM ${tableOf(n)})`;
  const r = await pool.request().query<Omit<HarnessCensus, 'ArtifactObjects'>>(`SELECT
    ${t('MJ: ML Models')} AS Models, ${t('MJ: ML Training Runs')} AS Runs, ${t('MJ: ML Training Snapshots')} AS Snapshots,
    ${t('MJ: ML Training Pipelines')} AS Pipelines, ${t('MJ: ML Model Publish Records')} AS PublishRecords, ${t('MJ: ML Output Bindings')} AS OutputBindings,
    ${t('MJ: Scheduled Jobs')} AS ScheduledJobs, ${t('MJ: Scheduled Job Runs')} AS ScheduledJobRuns, ${t('MJ: ML Evaluation Protocols')} AS Protocols,
    ${t('MJ: ML Prediction Units')} AS Units, ${t('MJ: Files')} AS Files, ${t('MJ: Actions')} AS Actions, ${t('MJ: Action Params')} AS ActionParams,
    ${t('MJ: Record Processes')} AS RecordProcesses, ${t('MJ: Process Runs')} AS ProcessRuns, ${t('MJ: Process Run Details')} AS ProcessRunDetails,
    ${t('MJ: Record Process Watermarks')} AS Watermarks, ${t('MJ: User Notifications')} AS Notifications, ${t('MJ: ML Model Scoring Bindings')} AS ScoringBindings,
    ${t('MJ: Feature Values')} AS FeatureValues, ${t('MJ: ML Scoring Runs')} AS ScoringRuns,
    (SELECT COUNT(*) FROM ${tableOf('MJ: AI Prompt Runs')} WHERE PromptID NOT IN (SELECT ID FROM ${tableOf('MJ: AI Prompts')}
       WHERE Name LIKE N'Memory Manager - %' OR Name = N'Name Conversation')) AS PromptRuns`);
  let objects = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else objects++;
    }
  };
  const artifactsRoot = path.join(storageRoot, StorageProviderArtifactStore.KEY_PREFIX);
  if (existsSync(artifactsRoot)) walk(artifactsRoot);
  return { ...r.recordset[0], ArtifactObjects: objects };
}

// ============================================================================================ lifecycle ==

/** Deletes rows of `entityName` by ID through the entity layer; one line per failure. */
async function deleteByIds(entityName: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const store = HarnessCleanup.EntityStore(server.Provider, server.User);
  const found: CleanupRow[] = await store.Rows(entityName, `ID IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`);
  const failures: string[] = [];
  for (const row of found) {
    const id = row.ID;
    if (!(await row.Delete())) failures.push(`${entityName} ${id}: ${row.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
  }
  return failures;
}

/**
 * Deletes the file's notifications by ID with SQL: the bootstrap's user has no Delete permission on
 * `MJ: User Notifications`, so the entity layer refuses it. One line per ID still present afterwards.
 */
async function deleteNotifications(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const list = ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  await pool.request().query(`DELETE FROM ${tableOf('MJ: User Notifications')} WHERE ID IN (${list})`);
  return (await rows<{ ID: string }>('MJ: User Notifications', `ID IN (${list})`, ['ID'])).map((r) => `MJ: User Notifications ${r.ID}: still present after the delete`);
}

/** The file's Record Processes with their runs (those the procedure detached too), run details and watermarks; its notifications; the orphans. */
async function deleteFileRows(): Promise<string[]> {
  const pids = processIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  // The detached-run sweep (`RecordProcessID IS NULL`, started since this file began) is safe on a private database under
  // the suite lock only: a Process Run carries no name to filter on (its Record Process is gone), so on a shared database
  // it would also take another session's detached runs of the same window (Nit-4).
  const runIds = processIds.length === 0 ? [] : (await rows<{ ID: string }>('MJ: Process Runs',
    `RecordProcessID IN (${pids}) OR (RecordProcessID IS NULL AND StartTime >= '${startedAt.toISOString()}')`, ['ID'])).map((r) => r.ID);
  const detailIds = runIds.length === 0 ? [] : (await rows<{ ID: string }>('MJ: Process Run Details', `ProcessRunID IN (${runIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`, ['ID'])).map((r) => r.ID);
  const watermarkIds = processIds.length === 0 ? [] : (await rows<{ ID: string }>('MJ: Record Process Watermarks', `RecordProcessID IN (${pids})`, ['ID'])).map((r) => r.ID);
  // Every notification the file's runs sent names a pipeline of the file (its title carries the tag), deleted models' too.
  const notificationIds = (await rows<{ ID: string }>('MJ: User Notifications',
    `Title LIKE N'%${EscapeSQLString(TAG)}%' AND __mj_CreatedAt >= '${startedAt.toISOString()}'`, ['ID'])).map((n) => n.ID);
  const orphanOf = (entity: string): string[] => orphans.filter((o) => o.EntityName === entity).map((o) => o.ID);
  return [
    ...(await deleteByIds('MJ: Process Run Details', detailIds)),
    ...(await deleteByIds('MJ: Process Runs', runIds)),
    ...(await deleteByIds('MJ: Record Process Watermarks', watermarkIds)),
    ...(await deleteByIds('MJ: Record Processes', processIds)),
    ...(await deleteNotifications(notificationIds)),
    ...(await deleteByIds('MJ: Scheduled Job Runs', orphanOf('MJ: Scheduled Job Runs'))),
    ...(await deleteByIds('MJ: Scheduled Jobs', orphanOf('MJ: Scheduled Jobs'))),
    ...(await deleteByIds('MJ: Action Params', orphanOf('MJ: Action Params'))),
    ...(await deleteByIds('MJ: Actions', orphanOf('MJ: Actions'))),
  ];
}

/** Puts back every artifact object the adversary moved, deletes what the file created and requires the starting census. */
async function teardown(): Promise<void> {
  for (const [aside, original] of movedObjects) if (existsSync(aside)) renameSync(aside, original);
  const own = await quietly(() => deleteFileRows());
  const recorded = await quietly(() => HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(server.Provider, server.User), records));
  expect([own.Result, own.Unexpected, recorded.Result, recorded.Unexpected]).toEqual([[], [], [], []]);
  expect(await census()).toEqual(startCensus);
}

beforeAll(async () => {
  const root = process.env.STORAGE_LOCAL_ROOT?.trim();
  if (!root) throw new Error('STORAGE_LOCAL_ROOT is unset: training stores artifacts through the Local File System provider, whose root it names');
  storageRoot = path.resolve(root);
  HarnessSidecar.UseSuiteSidecar();
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  await PredictiveStudioScoringStartup.Instance.HandleStartup(server.User, server.Provider);
  pool = await TruthConnection.OpenPool();
  procedure = procedureText();
  startCensus = await census();
  startedAt = new Date(Date.now() - 1000);
  algorithms = await HarnessPipelines.LoadAlgorithms(server.Provider, server.User);
  const loads = await quietly(async () => {
    const ctx = { Provider: server.Provider, User: server.User, Pool: pool };
    return [await DatasetLoader.Load(ctx, { Kind: 'world', ID: 'W1-signal', Seed: 42 }), await DatasetLoader.Load(ctx, { Kind: 'world', ID: 'W2-noise', Seed: 100 })];
  });
  expect(loads.Unexpected).toEqual([]);
  [w1, w2] = loads.Result;
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  try {
    if (server && pool) await teardown();
  } finally {
    UserCache.Instance.Dispose();
    await pool?.close();
    await server?.ClosePool();
  }
}, CASE_TIMEOUT_MS);

// ================================================================================================ cases ==

describe('concurrent publish', () => {
  let a: AutoTrainFixture;

  it('(a) two run-nows of one process from two Promise.all scopes train once and never write two publishes for a run', async () => {
    a = await fixture('a concurrent', w1);
    const out = await quietly(() => Promise.all([runNow(a.RecordProcessID), runNow(a.RecordProcessID)]));
    expect(out.Unexpected).toEqual([]);
    const runs = await trainingRuns(a.PipelineID);
    const published = (await modelsOf(a.PipelineID)).filter((m) => m.Status === 'Published');
    expect([runs.length, published.length, (await recordsOf(a.PipelineID)).filter((r) => r.Kind === 'publish').length, await runsWithTwoPublishes()]).toEqual([1, 1, 1, []]);
    // Each run either served the published model or failed naming the run in flight (none fails any other way).
    for (const run of out.Result) {
      if (run.Status === 'Completed') continue;
      expect(run.ErrorMessage).toContain(`is already being trained by run ${runs[0].ID}`);
    }
    expect(out.Result.filter((r) => r.Status === 'Completed').length).toBeGreaterThanOrEqual(1);
  }, CASE_TIMEOUT_MS);

  // Order dependence (Nit-3): (c) runs on (a)'s fixture and its Published model, so a red (a) makes (c) red too.
  it('(c) a deleted configured model is replaced through the gate: deleted by spDeleteEntityWithCoreDependencies\'s model step, the next run-now trains, never throws on the missing row', async () => {
    const [configured] = (await modelsOf(a.PipelineID)).filter((m) => m.Status === 'Published');
    expect((await configurationOf(a.RecordProcessID))['modelId']).toBe(configured.ID);
    await deleteModelByProcedure(configured.ID);
    expect(await modelsOf(a.PipelineID)).toEqual([]);
    const out = await quietly(() => runNow(a.RecordProcessID));
    expect([out.Result.Status, out.Result.ErrorMessage, out.Unexpected]).toEqual(['Completed', null, []]);
    const [served] = (await modelsOf(a.PipelineID)).filter((m) => m.Status === 'Published');
    expect([(await trainingRuns(a.PipelineID)).length, (await configurationOf(a.RecordProcessID))['modelId'], await runsWithTwoPublishes()]).toEqual([2, served.ID, []]);
  }, CASE_TIMEOUT_MS);
});

describe('the job killed after commit', () => {
  let b: AutoTrainFixture;

  it('(b) a run killed right after the publish commit, then rerun: 0 trainings and 0 new records (the published model is reused)', async () => {
    b = await fixture('b killed', w1);
    const kill = killAfterNextPublishCommit();
    const killed = await quietly(() => runNow(b.RecordProcessID)).finally(() => kill.Restore());
    const committed = kill.Committed();
    if (committed === null || committed.Kind !== 'published') throw new Error(`the killed run committed no publish: ${JSON.stringify(committed)}`);
    expect([killed.Result.Status, killed.Result.ErrorMessage, killed.Unexpected]).toEqual(['Failed', KILLED, []]);
    const [runsBefore, recordsBefore] = [await trainingRuns(b.PipelineID), await recordsOf(b.PipelineID)];
    expect([runsBefore.length, recordsBefore.map((r) => r.Kind), (await configurationOf(b.RecordProcessID))['modelId']]).toEqual([1, ['publish'], undefined]);
    const rerun = await quietly(() => runNow(b.RecordProcessID));
    expect([rerun.Result.Status, rerun.Unexpected]).toEqual(['Completed', []]);
    expect([(await trainingRuns(b.PipelineID)).length, (await recordsOf(b.PipelineID)).length, (await configurationOf(b.RecordProcessID))['modelId'], await runsWithTwoPublishes()]).toEqual([
      1, 1, committed.ModelID, [],
    ]);
  }, CASE_TIMEOUT_MS);

  // Order dependence (Nit-3): (g) runs on (b)'s fixture and its Published model, so a red (b) makes (g) red too.
  it('(g) the reusable model\'s artifact removed from storage: reuse is refused, and auto-train trains a new model and records why it is withheld', async () => {
    const [reusable] = (await modelsOf(b.PipelineID)).filter((m) => m.Status === 'Published');
    await removeArtifactObject(reusable.ID);
    const out = await quietly(() => runNow(b.RecordProcessID));
    const runs = await trainingRuns(b.PipelineID);
    expect(runs.length).toBe(2);
    const newRun = runs[1];
    // the one line besides the expected ones: training names why the Published model cannot be the new run's incumbent
    expect(out.Unexpected).toEqual([`Predictive Studio training: run ${newRun.ID} is trained without an incumbent: Published ML Model ${reusable.ID} cannot be one: its artifact is missing`]);
    const newRecords = (await recordsOf(b.PipelineID)).filter((r) => r.TrainingRunID !== null && UUIDsEqual(r.TrainingRunID, newRun.ID));
    // It trains a new model and records why that one is withheld: the run compared with no incumbent (the Published model
    // could not be one) while that model is still Published, so the gate refuses the publish (`not-servable`, naming it).
    // The Process Run fails with the R4 message; the model whose artifact is gone is not served (the config keeps naming it
    // only as the model this process last served, and every run re-checks it).
    expect([out.Result.Status, newRecords.map((r) => [r.Kind, refusalKind(r)]), newRun.ResultingModelID !== null]).toEqual(['Failed', [['refusal', 'not-servable']], true]);
    expect(newRecords[0].Reason).toContain(`no comparison with ML Model ${reusable.ID}, which is Published now; retrain to compare with it, or, when its artifact is missing`);
    expect(out.Result.ErrorMessage).toContain(`; publish withheld: `);
    expect(await runsWithTwoPublishes()).toEqual([]);
  }, CASE_TIMEOUT_MS);
});

describe('deleted parent or child', () => {
  it('(d) a repoint of a deleted process fails loudly and the next run trains nothing: the training run and publish stand, the Process Run names the deleted process, nothing half-written', async () => {
    const d = await fixture('d process deleted', w1);
    const adversary = afterNextPublish(() => deleteProcessByProcedure(d.RecordProcessID));
    const out = await quietly(() => runNow(d.RecordProcessID)).finally(() => adversary.Restore());
    expect(out.Unexpected).toEqual([]);
    const runs = await trainingRuns(d.PipelineID);
    const models = await modelsOf(d.PipelineID);
    expect([runs.map((r) => r.Status), models.map((m) => m.Status), (await recordsOf(d.PipelineID)).map((r) => r.Kind)]).toEqual([['Completed'], ['Published'], ['publish']]);
    expect([out.Result.Status, await rows('MJ: Record Processes', `ID='${EscapeSQLString(d.RecordProcessID)}'`, ['ID'])]).toEqual(['Failed', []]);
    expect(out.Result.ErrorMessage).toBe(PipelineAutoTrainer.RecordProcessGoneMessage(d.RecordProcessID, models[0].ID, d.PipelineID));
    // the next run (another process on the pipeline) trains nothing: it serves the published model
    const next = await createProcess('d next process', d.PipelineID, d.Dataset);
    const again = await quietly(() => runNow(next));
    expect([again.Result.Status, again.Unexpected, (await trainingRuns(d.PipelineID)).length, (await configurationOf(next))['modelId']]).toEqual(['Completed', [], 1, models[0].ID]);
  }, CASE_TIMEOUT_MS);
});

describe('the retry window and notifications after a no-signal run (W2-noise s100)', () => {
  it('(e) retryAfterHours 24 holds the pipeline after a run-level refusal (R4 message with the ISO time); 0 retrains', async () => {
    const e = await fixture('e retry window', w2, { retryAfterHours: 24 });
    const first = await quietly(() => runNow(e.RecordProcessID));
    const [run] = await trainingRuns(e.PipelineID);
    const [refusal] = await recordsOf(e.PipelineID);
    expect([first.Result.Status, refusal.Kind, refusal.Purpose, refusal.ModelID, refusalKind(refusal)]).toEqual(['Failed', 'refusal', 'evaluate', null, 'gate-no-signal']);
    const held = await quietly(() => runNow(e.RecordProcessID));
    expect([held.Result.Status, (await trainingRuns(e.PipelineID)).length, (await recordsOf(e.PipelineID)).length, held.Unexpected]).toEqual(['Failed', 1, 1, []]);
    expect(held.Result.ErrorMessage).toMatch(new RegExp(
      `^Auto-train run ${run.ID}; evaluation withheld: .+ Auto-train does not retrain pipeline ${e.PipelineID} before \\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z \\(autoTrain\\.retryAfterHours = 24 after that refusal, recorded \\d{4}-`, 'i',
    ));
  }, CASE_TIMEOUT_MS);

  it('(e) retryAfterHours 0 retrains on the next run after a run-level refusal', async () => {
    const e0 = await fixture('e retry 0', w2, { retryAfterHours: 0 });
    const runs = await quietly(async () => [await runNow(e0.RecordProcessID), await runNow(e0.RecordProcessID)]);
    expect([runs.Result.map((r) => r.Status), runs.Unexpected, (await trainingRuns(e0.PipelineID)).length]).toEqual([['Failed', 'Failed'], [], 2]);
    expect((await recordsOf(e0.PipelineID)).map((r) => [r.Kind, r.Purpose, refusalKind(r)])).toEqual([['refusal', 'evaluate', 'gate-no-signal'], ['refusal', 'evaluate', 'gate-no-signal']]);
  }, CASE_TIMEOUT_MS);

  it('(f) notifyOnWithheld false sends 0 notifications, and the refusal is still recorded', async () => {
    const f = await fixture('f quiet', w2, { notifyOnWithheld: false });
    const out = await quietly(() => runNow(f.RecordProcessID));
    expect([out.Result.Status, out.Unexpected, (await recordsOf(f.PipelineID)).map((r) => [r.Kind, refusalKind(r)])]).toEqual(['Failed', [], [['refusal', 'gate-no-signal']]]);
    expect(await notificationsAbout(await subjectsOf(f.PipelineID))).toEqual([]);
  }, CASE_TIMEOUT_MS);
});

describe('R6 audit trail on SQL Server (MJMLModelPublishRecordEntityServer)', () => {
  it('updating a saved publish record is refused (a Reason change → Save false naming immutability; a ReplayOnly save refused)', async () => {
    const [saved] = await rows<{ ID: string }>('MJ: ML Model Publish Records', `Kind='refusal' AND TrainingRunID IN (SELECT ID FROM ${tableOf('MJ: ML Training Runs')} WHERE PipelineID IN (${[...records.PipelineIDs].map((id) => `'${EscapeSQLString(id)}'`).join(', ')}))`, ['ID']);
    if (saved === undefined) throw new Error('the file has no saved publish record to change');
    const record = await server.Provider.GetEntityObject<MJMLModelPublishRecordEntity>('MJ: ML Model Publish Records', server.User);
    expect(await record.Load(saved.ID)).toBe(true);
    record.Reason = `${record.Reason || ''} (changed by the harness)`;
    const changed = await quietly(() => record.Save());
    expect([changed.Result, changed.Unexpected]).toEqual([false, []]);
    expect(record.LatestResult?.CompleteMessage).toMatch(/immutable/i);
    const replay = await server.Provider.GetEntityObject<MJMLModelPublishRecordEntity>('MJ: ML Model Publish Records', server.User);
    expect(await replay.Load(saved.ID)).toBe(true);
    replay.Reason = `${replay.Reason || ''} (changed by the harness)`;
    const replayed = await quietly(() => replay.Save({ ReplayOnly: true }));
    expect([replayed.Result, replayed.Unexpected]).toEqual([false, []]);
    expect(replay.LatestResult?.CompleteMessage).toMatch(/ReplayOnly|immutable/i);
    const [after] = await rows<Pick<MJMLModelPublishRecordEntity, 'Reason'>>('MJ: ML Model Publish Records', `ID='${EscapeSQLString(saved.ID)}'`, ['Reason']);
    expect(after.Reason).not.toContain('(changed by the harness)');
  }, CASE_TIMEOUT_MS);
});
