// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// The M3 adversarial harness (Task M3.6, D-071): one case per uncovered cell of M3's coverage table and per scenario of
// the task's Step 1, each trying to break the claim its name states against the PRODUCTION lifecycle gate
// (`new LifecycleGate()`: the storage-provider artifact loader, the system clock, the real scoring-Action generator),
// the stored lock and version Queries (`RunQuery` on SQL Server) and the PreSave status and evidence guards, which
// this process registers by importing the Engine's entry point exactly as MJAPI does. Every model row is written the
// way the trainer writes it — artifact stored write-once through the artifact registry, the gate record built by
// `GateRecords`, the delivery registered by `Delivery`/`RegisteredDelivery`, the row saved by `ModelVersions.SaveNewRow`
// (the trainer's one transaction around the pipeline lock, the version Query and the save) — from a synthetic trainer
// answer (`fixtures/gate-trainer-answers.ts`). Concurrent callers each get their own provider instance (one
// transaction stack each, as MJAPI's per-request providers do). The adversary's writes the task prescribes "by direct
// SQL" are the only SQL DML here, each labelled; every other SQL statement is a verification read. Teardown deletes
// what the file created by ID through `HarnessCleanup.DeleteRecorded` (D4-62's order) and requires the starting census.
import { existsSync, readdirSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { DatabaseProviderBase, RunView, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJMLAlgorithmEntity, MJMLEvaluationProtocolEntity, MJMLModelEntity, MJMLModelPublishRecordEntity, MJMLTrainingPipelineEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
  Delivery,
  EvaluationProtocol,
  EvaluationProtocolRules,
  GateRecords,
  PredictionUnit,
  RegisteredDelivery,
  TRAINING_RUN_RESULTS_SCHEMA,
  TrainerContract,
  type Actor,
  type EvaluationProtocolSpec,
  type PredictionUnitSpec,
  type PromotionRule,
  type StoredFile,
  type StoredGateRecord,
  type TrainerCompleted,
  type TrainingRunResults,
  type UnitDraft,
} from '@memberjunction/predictive-studio-core';
import {
  ArtifactRegistry,
  EvaluationProtocolVersioning,
  GateContexts,
  LifecycleGate,
  MetadataEntityFactory,
  ModelVersions,
  PredictionUnitVersioning,
  PredictiveStudioStatusGuard,
  PreSaveHookRegistration,
  StatusWriteAuthorisations,
  StorageProviderArtifactLoader,
  StorageProviderArtifactStore,
  type GateContext,
  type PublishOutcome,
  type PublishRequest,
  type RegistryContext,
} from '@memberjunction/predictive-studio';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { HarnessCleanup, RunRecords } from '../harness/cleanup';
import { ArtifactObjects } from '../harness/artifact-objects';
import { ConsoleCapture } from './fixtures/console-capture';
import { GATE_TASK, GateTrainerAnswers, type IncumbentDiff } from './fixtures/gate-trainer-answers';

/** Row counts of every table the gate and the harness write, and model-artifact objects under the storage root. */
interface HarnessCensus {
  readonly Models: number;
  readonly Runs: number;
  readonly Pipelines: number;
  readonly PublishRecords: number;
  readonly ScheduledJobs: number;
  readonly ScheduledJobRuns: number;
  readonly Protocols: number;
  readonly Units: number;
  readonly Files: number;
  readonly Actions: number;
  readonly ActionParams: number;
  readonly ActionCategories: number;
  readonly ArtifactObjects: number;
  readonly ArtifactDirectories: number;
}

/** A protocol version row and its parsed spec. */
interface ProtocolVersion {
  readonly Row: MJMLEvaluationProtocolEntity;
  readonly Spec: EvaluationProtocolSpec;
}

/** A harness pipeline and the protocol version its runs are evaluated under. */
interface PipelineFixture {
  readonly PipelineID: string;
  readonly Protocol: ProtocolVersion;
}

/** A trained model: its row, its run and the version the pipeline lock allocated. */
interface TrainedModel {
  readonly ModelID: string;
  readonly RunID: string;
  readonly Version: number;
}

/** How a harness training is written. */
interface TrainOptions {
  /** The provider the training writes on (its own instance for a concurrent training); default the bootstrap's. */
  readonly Provider?: IMetadataProvider;
  /** The run's stored comparison with the published model (null for a pipeline's first model). */
  readonly IncumbentDiff?: IncumbentDiff | null;
  /**
   * The protocol the gate record is BUILT under, when it is not the run's pinned one (the adversary's stored record:
   * its decision is the one this protocol's margin gives, while the run pins `fixture.Protocol`).
   */
  readonly RecordProtocol?: EvaluationProtocolSpec;
}

/** A model row as the verification SQL reads it. */
interface ModelState {
  readonly ID: string;
  readonly Version: number;
  readonly Status: MJMLModelEntity['Status'];
  readonly StatusReason: string | null;
  readonly TrainingRunID: string | null;
  readonly EvaluationProtocolID: string | null;
}

/** A publish record as the verification SQL reads it. */
type RecordState = Pick<MJMLModelPublishRecordEntity, 'ID' | 'Kind' | 'Purpose' | 'ModelID' | 'TrainingRunID' | 'ReplacesModelID' | 'Reason' | 'Refusal' | 'GateDecision'>;

const TAG = `PSLifecycleGate-${Date.now()}`;
/**
 * The console lines the production code writes on the paths this file drives, each expected: SQL Server's NOWAIT
 * refusal of a held lock Query (error 1222), which the provider logs on every retry of the gate's lock wait; the
 * provider's note that a committed transaction runs its post-commit tasks; and the scoring-Action generator's line for
 * each Action it ensures or disables after a publish or archive commits. Any other line fails the case that wrote it.
 */
const EXPECTED_LINES: readonly RegExp[] = [
  /Lock request time out period exceeded/,
  /^Running \d+ post-commit task\(s\) after transaction commit$/,
  /^ModelScoringActionGenerator: (ensured|disabled) scoring action 'Score with PSLifecycleGate-/,
];
// The bootstrap loads all metadata; on a loaded host that alone has taken 44 s, past vitest's default hook timeout.
const BOOTSTRAP_TIMEOUT_MS = 120_000;
/**
 * The shared Action Category the scoring-Action generator finds or creates on the first publish of a database
 * (`ModelScoringActionGenerator.ensureModelsActionCategory`) and never deletes, as the rigs leave it too
 * (`ps-rig-lifecycle.ts`). The census leaves it out: on a fresh database the file's first publish creates it.
 */
const SHARED_MODELS_CATEGORY = 'Predictive Studio Models';

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let storageRoot: string;
let algorithmId: string;
let usersEntityId: string;
let unitId: string;
let unitSpec: PredictionUnitSpec;
let startCensus: HarnessCensus;
const records = new RunRecords();
/** Every provider key the file stored, for the sweep of the key directories the local driver leaves. */
const storedKeys: string[] = [];
/** Every independent provider instance the file opened, released at teardown. */
const instances: DatabaseProviderBase[] = [];

// ================================================================================================== helpers ==

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(entityName: string): string {
  const entity: EntityInfo | undefined = server.Provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** The harness user as an interactive human initiator (the publish record's approver is that user). */
function human(): Actor {
  return { kind: 'human', userId: server.User.ID };
}

/** The bootstrap's provider as the database provider it is (concurrent callers need their own instance of it). */
function databaseProvider(): DatabaseProviderBase {
  const p = server.Provider;
  if (!(p instanceof DatabaseProviderBase)) throw new Error('the DB lane bootstrap did not install a database provider');
  return p;
}

/** A provider sharing the pool and metadata with its own transaction stack: one per concurrent caller, as MJAPI's per-request providers. */
async function ownProvider(): Promise<DatabaseProviderBase> {
  const p = await databaseProvider().CreateIndependentInstance();
  instances.push(p);
  return p;
}

/** The registry context of the harness user on `provider`. */
function registryCtx(provider: IMetadataProvider = server.Provider): RegistryContext {
  return { ContextUser: server.User, Provider: provider };
}

/** M3's production gate context (stored-rows evidence, passing semantics check, no sign-off lookup) on `provider`. */
function gateCtx(provider: IMetadataProvider = server.Provider): GateContext {
  return GateContexts.ForRequest(registryCtx(provider));
}

/** A publish request for `modelId` by the harness user. */
function publishRequest(modelId: string): PublishRequest {
  return { modelId, purpose: 'publish', initiator: human(), signOffId: null, reason: null };
}

/** The binary unit every harness pipeline's models name (one row per user, one fixed decision date). */
function unitDraft(): UnitDraft {
  return {
    Name: `${TAG} unit`, Description: 'Lifecycle-gate harness unit (no rows are ever read: the trainer answers are synthetic).',
    UnitRows: { kind: 'grain', grainEntity: 'MJ: Users', decisionDate: { kind: 'fixed', date: '2026-01-01' }, filter: [] },
    LabelRule: { kind: 'column', column: 'IsActive' }, LabelWindowDays: 31, LabelGapDays: 0, TaskType: GATE_TASK,
    Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2027-02-01' } },
    ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
    DecisionSpec: { action: 'harness', actorRole: 'harness', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
  };
}

/** The parsed spec of a saved protocol version row. */
function specOf(row: MJMLEvaluationProtocolEntity): EvaluationProtocolSpec {
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
  if (parsed.Ok === false) throw new Error(`protocol ${row.ID} does not parse: ${parsed.Errors.join('; ')}`);
  return parsed.Value;
}

/** Version 1 of a new protocol lineage over the unit (its default draft at `margin`), saved by the harness user and recorded. */
async function createProtocol(label: string, margin: number): Promise<ProtocolVersion> {
  const base = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: unitSpec, Holdout: { kind: 'seeded-random', fraction: 0.25 }, Candidates: 1, Seed: 0, Name: `${TAG} ${label}` });
  const draft = { ...base, promotion: EvaluationProtocol.WithPromotionMargin(base.promotion, EvaluationProtocol.ToNonNegative(margin)) };
  const row = await EvaluationProtocolVersioning.CreateEvaluationProtocolV1(draft, human(), new MetadataEntityFactory(server.Provider), server.User);
  records.RecordEvaluationProtocol(row.ID);
  return { Row: row, Spec: specOf(row) };
}

/** A pipeline of the harness and the protocol (version 1, at `margin`) its runs pin; both recorded for teardown. */
async function createPipeline(label: string, margin = 0): Promise<PipelineFixture> {
  const protocol = await createProtocol(label, margin);
  const pipeline = await server.Provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', server.User);
  pipeline.NewRecord();
  pipeline.Name = `${TAG} ${label}`;
  pipeline.TargetEntityID = usersEntityId;
  pipeline.TargetVariable = 'IsActive';
  pipeline.ProblemType = 'classification';
  pipeline.AlgorithmID = algorithmId;
  if (!(await pipeline.Save())) throw new Error(`pipeline ${label} did not save: ${pipeline.LatestResult?.CompleteMessage}`);
  records.RecordPipeline(pipeline.ID);
  return { PipelineID: pipeline.ID, Protocol: protocol };
}

/** A training run of the pipeline, Running, pinned to the pipeline's protocol version (as the trainer opens it). */
async function startRun(fix: PipelineFixture, provider: IMetadataProvider): Promise<MJMLTrainingRunEntity> {
  const run = await provider.GetEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', server.User);
  run.NewRecord();
  run.PipelineID = fix.PipelineID;
  run.AlgorithmID = algorithmId;
  run.EvaluationProtocolID = fix.Protocol.Row.ID;
  run.Status = 'Running';
  run.StartedAt = new Date();
  if (!(await run.Save())) throw new Error(`training run did not save: ${run.LatestResult?.CompleteMessage}`);
  return run;
}

/** Every returned artifact stored write-once through the production registry; the stored file by candidate. */
async function storeArtifacts(answer: TrainerCompleted, ctx: RegistryContext): Promise<Map<string, StoredFile>> {
  const registry = ArtifactRegistry.ForContext(ctx, new StorageProviderArtifactLoader());
  const stored = new Map<string, StoredFile>();
  for (const a of answer.artifacts) {
    const file = await registry.Store(Buffer.from(a.bytesBase64, 'base64'), `trainer-${answer.trainingRunId}-${a.candidate}.json`, ctx);
    storedKeys.push(file.providerKey);
    stored.set(a.candidate, file);
  }
  return stored;
}

/** The gate record `GateRecords` builds for the answer under `protocol`; throws when it refuses. */
function gateRecordOf(answer: TrainerCompleted, protocol: EvaluationProtocolSpec): StoredGateRecord {
  const built = GateRecords.BuildStoredGateRecord({ Result: answer, Protocol: protocol, Task: GATE_TASK, Carve: null });
  if (built.Ok === false) throw new Error(`the gate record was refused: ${JSON.stringify(built.Refusal)}`);
  return built.Record;
}

/** The registered delivery of what the stored decision ships, as the trainer registers it; throws when refused. */
function registeredDeliveryOf(gate: StoredGateRecord, answer: TrainerCompleted, stored: StoredFile): RegisteredDelivery {
  const created = Delivery.Create(gate.decision, answer.artifacts, GATE_TASK);
  if (created.Ok === false) throw new Error(`the delivery was refused: ${JSON.stringify(created.Error)}`);
  const registered = RegisteredDelivery.Register(created.Delivery, stored);
  if (registered.Ok === false) throw new Error(`the delivery could not be registered: ${registered.Reason}`);
  return registered.Registered;
}

/** The trainer's model row for the shipped artifact (Draft; its version is allocated by the save). */
async function newModelRow(fix: PipelineFixture, runId: string, stored: StoredFile, delivery: RegisteredDelivery, provider: IMetadataProvider): Promise<MJMLModelEntity> {
  const model = await provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
  model.NewRecord();
  model.PipelineID = fix.PipelineID;
  model.AlgorithmID = algorithmId;
  model.ArtifactFileID = stored.fileId;
  model.ArtifactSha256 = stored.sha256;
  model.TrainingRunID = runId;
  model.EvaluationProtocolID = fix.Protocol.Row.ID;
  model.PredictionUnitID = unitId;
  model.OutputSemantics = JSON.stringify({ task: GATE_TASK });
  model.Delivery = JSON.stringify(delivery.View);
  model.ArtifactStatus = 'verified';
  model.ArtifactCheckedAt = new Date();
  model.FittedPreprocessing = '{}';
  model.FeatureSchema = JSON.stringify([{ Name: 'EventsAttended' }, { Name: 'Tenure' }]);
  model.SnapshotHash = 'a'.repeat(64);
  model.TargetVariable = 'IsActive';
  model.ProblemType = 'classification';
  model.TrainedAt = new Date();
  model.Status = 'Draft';
  return model;
}

/** Completes the run as the trainer does: the v2 envelope (trainer result as file references, the gate record) and its model. */
async function completeRun(run: MJMLTrainingRunEntity, answer: TrainerCompleted, gate: StoredGateRecord, stored: ReadonlyMap<string, StoredFile>, modelId: string | null): Promise<void> {
  const fileIds = new Map([...stored].map(([candidate, f]): [string, string] => [candidate, f.fileId]));
  const results: TrainingRunResults = {
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 8, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 8, dataCutoff: '2026-01-01' },
    trainer: TrainerContract.ToStoredTrainerResult(answer, fileIds), trainerRequest: null, carve: null, gate,
  };
  run.ValidationResults = JSON.stringify(results);
  run.ResultingModelID = modelId;
  run.Status = 'Completed';
  run.CompletedAt = new Date();
  if (!(await run.Save())) throw new Error(`training run ${run.ID} did not complete: ${run.LatestResult?.CompleteMessage}`);
}

/**
 * One training of the pipeline that ships its model, written the way the trainer writes it: the run opened, the
 * artifact stored, the gate record and delivery built, the model row saved by `ModelVersions.SaveNewRow` (the
 * trainer's transaction around the pipeline lock, the version Query and the save), then the run completed.
 */
async function trainModel(fix: PipelineFixture, label: string, o: TrainOptions = {}): Promise<TrainedModel> {
  const provider = o.Provider || server.Provider;
  const ctx = registryCtx(provider);
  const run = await startRun(fix, provider);
  const answer = GateTrainerAnswers.ModelWins(run.ID, fix.Protocol.Spec, `${TAG}:${label}`, o.IncumbentDiff || null);
  const stored = await storeArtifacts(answer, ctx);
  const gate = gateRecordOf(answer, o.RecordProtocol || fix.Protocol.Spec);
  const shipped = stored.get('xgb');
  if (!shipped) throw new Error('the shipped artifact was not stored');
  const model = await newModelRow(fix, run.ID, shipped, registeredDeliveryOf(gate, answer, shipped), provider);
  try {
    await ModelVersions.SaveNewRow(model, ctx);
  } catch (error) {
    // The run is completed without a model, so teardown still finds the stored artifact through the run's trainer result.
    await completeRun(run, answer, gate, stored, null);
    throw error;
  }
  records.RecordModel(model.ID);
  await completeRun(run, answer, gate, stored, model.ID);
  return { ModelID: model.ID, RunID: run.ID, Version: model.Version };
}

/** A completed run whose stored decision is no-signal: no artifact, no model row (D4-56). */
async function trainNoSignalRun(fix: PipelineFixture, label: string): Promise<string> {
  const run = await startRun(fix, server.Provider);
  const answer = GateTrainerAnswers.NoSignal(run.ID, fix.Protocol.Spec, `${TAG}:${label}`);
  await completeRun(run, answer, gateRecordOf(answer, fix.Protocol.Spec), new Map(), null);
  return run.ID;
}

/** Evaluate through the production gate and require the model to reach Validated. */
async function evaluateToValidated(modelId: string): Promise<void> {
  const outcome = await new LifecycleGate().Evaluate({ modelId }, human(), gateCtx());
  expect(outcome).toMatchObject({ Kind: 'evaluated', ModelID: modelId, To: 'Validated' });
}

/** A trained, evaluated (Validated) model. */
async function validatedModel(fix: PipelineFixture, label: string, o: TrainOptions = {}): Promise<TrainedModel> {
  const m = await trainModel(fix, label, o);
  await evaluateToValidated(m.ModelID);
  return m;
}

/** A Validated model published through the production gate (the pipeline's incumbent). */
async function publishedModel(fix: PipelineFixture, label: string): Promise<TrainedModel> {
  const m = await validatedModel(fix, label);
  const outcome = await quietly(() => new LifecycleGate().Publish(publishRequest(m.ModelID), gateCtx()));
  expect(outcome.Unexpected).toEqual([]);
  expect(outcome.Result).toMatchObject({ Kind: 'published', ModelID: m.ModelID });
  return m;
}

/**
 * Every promise settled (so no straggler keeps writing after a case ends), then the values; the first rejection is
 * rethrown once all have settled.
 */
async function allSettledValues<T>(work: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(work);
  const failed = settled.find((x): x is PromiseRejectedResult => x.status === 'rejected');
  if (failed) throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
  return settled.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []));
}

/** The incumbent comparison a candidate's run stores when it beats `incumbentId` by 0.01 at the lower bound. */
function beats(incumbentId: string): IncumbentDiff {
  return { incumbentModelId: incumbentId, value: 0.02, lower: 0.01, upper: 0.03 };
}

/**
 * `work` with both console channels captured: its result, every line (log, then error) and the lines that are not
 * {@link EXPECTED_LINES} (a case requires none).
 */
/** The error message `work` fails with, or null when it completes (an adversary's write the database may refuse). */
async function failureOf(work: () => Promise<void>): Promise<string | null> {
  try {
    await work();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function quietly<T>(work: () => Promise<T>): Promise<{ Result: T; Lines: string[]; Unexpected: string[] }> {
  const errors = await ConsoleCapture.During('error', () => ConsoleCapture.During('log', work));
  const lines = [...errors.Result.Lines, ...errors.Lines];
  return { Result: errors.Result.Result, Lines: lines, Unexpected: lines.filter((l) => !EXPECTED_LINES.some((x) => x.test(l))) };
}

// ===================================================================================== verification SQL ==

/** The pipeline's model rows, by version (verification). */
async function modelsOf(pipelineId: string): Promise<ModelState[]> {
  const r = await pool.request().input('P', sql.UniqueIdentifier, pipelineId).query<ModelState>(
    `SELECT ID, Version, Status, StatusReason, TrainingRunID, EvaluationProtocolID FROM ${tableOf('MJ: ML Models')} WHERE PipelineID = @P ORDER BY Version`,
  );
  return r.recordset;
}

/** One model row (verification); throws when it is gone. */
async function modelState(modelId: string): Promise<ModelState> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, modelId).query<ModelState>(
    `SELECT ID, Version, Status, StatusReason, TrainingRunID, EvaluationProtocolID FROM ${tableOf('MJ: ML Models')} WHERE ID = @ID`,
  );
  const row = r.recordset[0];
  if (!row) throw new Error(`ML Model ${modelId} is gone`);
  return row;
}

/** The publish records naming the model (as the model or the model it replaced) or the run (verification). */
async function recordsOf(o: { readonly ModelID?: string; readonly RunID?: string }): Promise<RecordState[]> {
  const r = await pool.request()
    .input('M', sql.UniqueIdentifier, o.ModelID || null)
    .input('R', sql.UniqueIdentifier, o.RunID || null)
    .query<RecordState>(
      `SELECT ID, Kind, Purpose, ModelID, TrainingRunID, ReplacesModelID, Reason, Refusal, GateDecision FROM ${tableOf('MJ: ML Model Publish Records')}
       WHERE ModelID = @M OR ReplacesModelID = @M OR TrainingRunID = @R ORDER BY RecordedAt`,
    );
  return r.recordset;
}

/** The statuses of the model's monitoring jobs, by the job configuration's `modelId` (verification). */
async function monitoringJobStatuses(modelId: string): Promise<string[]> {
  const r = await pool.request().input('M', sql.NVarChar(64), modelId).query<{ Status: string }>(
    `SELECT Status FROM ${tableOf('MJ: Scheduled Jobs')} WHERE JSON_VALUE(Configuration, '$.modelId') = @M ORDER BY __mj_CreatedAt`,
  );
  return r.recordset.map((x) => x.Status);
}

/** The `EvaluationProtocolID` a training run stores (verification). */
async function runProtocolId(runId: string): Promise<string | null> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, runId).query<{ EvaluationProtocolID: string | null }>(
    `SELECT EvaluationProtocolID FROM ${tableOf('MJ: ML Training Runs')} WHERE ID = @ID`,
  );
  return r.recordset[0]?.EvaluationProtocolID || null;
}

/**
 * Adversary (direct SQL): replaces a protocol version row's `Promotion` JSON, as an operator's UPDATE would, without
 * the entity layer (no RunView cache invalidation, no versioning).
 */
async function setPromotionBySql(protocolId: string, promotion: PromotionRule): Promise<void> {
  await pool.request().input('ID', sql.UniqueIdentifier, protocolId).input('P', sql.NVarChar(sql.MAX), JSON.stringify(promotion))
    .query(`UPDATE ${tableOf('MJ: ML Evaluation Protocols')} SET Promotion = @P WHERE ID = @ID`);
}

/** The model's monitoring jobs with the challenger rule their configuration carries (verification). */
async function monitoringJobRules(modelId: string): Promise<{ Status: string; Margin: number; RequiresHumanSignOff: boolean; SignOffExpiryDays: number }[]> {
  const r = await pool.request().input('M', sql.NVarChar(64), modelId).query<{ Status: string; Margin: number; RequiresHumanSignOff: boolean; SignOffExpiryDays: number }>(
    `SELECT Status,
            CAST(JSON_VALUE(Configuration, '$.challenger.rule.margin') AS FLOAT) AS Margin,
            CAST(CASE JSON_VALUE(Configuration, '$.challenger.rule.requiresHumanSignOff') WHEN 'true' THEN 1 ELSE 0 END AS BIT) AS RequiresHumanSignOff,
            CAST(JSON_VALUE(Configuration, '$.challenger.rule.signOffExpiryDays') AS INT) AS SignOffExpiryDays
     FROM ${tableOf('MJ: Scheduled Jobs')} WHERE JSON_VALUE(Configuration, '$.modelId') = @M ORDER BY __mj_CreatedAt`,
  );
  return r.recordset;
}

/** The versions of a protocol lineage, ascending (verification). */
async function protocolLineage(rootId: string): Promise<{ ID: string; Version: number }[]> {
  const r = await pool.request().input('L', sql.UniqueIdentifier, rootId).query<{ ID: string; Version: number }>(
    `SELECT ID, Version FROM ${tableOf('MJ: ML Evaluation Protocols')} WHERE LineageRootID = @L ORDER BY Version`,
  );
  return r.recordset;
}

/** The `MJ: Record Changes` rows of the harness's entities written since `since` (the audit trail; reported, not a leak). */
async function recordChangesSince(since: Date): Promise<number> {
  const r = await pool.request().input('S', sql.DateTimeOffset, since).query<{ N: number }>(
    `SELECT COUNT(*) AS N FROM ${tableOf('MJ: Record Changes')} WHERE ChangedAt >= @S`,
  );
  return r.recordset[0]?.N || 0;
}

/** Row counts and model-artifact objects/directories under the storage root. */
async function census(): Promise<HarnessCensus> {
  const t = (n: string): string => `(SELECT COUNT(*) FROM ${tableOf(n)})`;
  const r = await pool.request().query<Omit<HarnessCensus, 'ArtifactObjects' | 'ArtifactDirectories'>>(`SELECT
    ${t('MJ: ML Models')} AS Models, ${t('MJ: ML Training Runs')} AS Runs, ${t('MJ: ML Training Pipelines')} AS Pipelines,
    ${t('MJ: ML Model Publish Records')} AS PublishRecords, ${t('MJ: Scheduled Jobs')} AS ScheduledJobs, ${t('MJ: Scheduled Job Runs')} AS ScheduledJobRuns,
    ${t('MJ: ML Evaluation Protocols')} AS Protocols, ${t('MJ: ML Prediction Units')} AS Units, ${t('MJ: Files')} AS Files,
    ${t('MJ: Actions')} AS Actions, ${t('MJ: Action Params')} AS ActionParams,
    (SELECT COUNT(*) FROM ${tableOf('MJ: Action Categories')} WHERE Name <> N'${SHARED_MODELS_CATEGORY}') AS ActionCategories`);
  let objects = 0;
  let directories = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        directories++;
        walk(path.join(dir, entry.name));
      } else objects++;
    }
  };
  const artifactsRoot = path.join(storageRoot, StorageProviderArtifactStore.KEY_PREFIX);
  if (existsSync(artifactsRoot)) walk(artifactsRoot);
  return { ...r.recordset[0], ArtifactObjects: objects, ArtifactDirectories: directories };
}

// ============================================================================================ lifecycle ==

let startedAt: Date;

beforeAll(async () => {
  const root = process.env.STORAGE_LOCAL_ROOT?.trim();
  if (!root) throw new Error('STORAGE_LOCAL_ROOT is unset: the harness stores artifacts through the Local File System provider, whose root it names');
  storageRoot = path.resolve(root);
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
  startedAt = new Date();
  startCensus = await census();
  const algorithms = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>(
    { EntityName: 'MJ: ML Algorithms', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, server.User,
  );
  const firstAlgorithm = algorithms.Results[0]?.ID;
  if (!algorithms.Success || !firstAlgorithm) throw new Error('no MJ: ML Algorithms row to name: push the metadata');
  algorithmId = firstAlgorithm;
  const users = server.Provider.EntityByName('MJ: Users');
  if (!users) throw new Error('MJ: Users is not in metadata');
  usersEntityId = users.ID;
  const unitRow = await PredictionUnitVersioning.CreatePredictionUnitV1(unitDraft(), human(), new MetadataEntityFactory(server.Provider), server.User);
  records.RecordPredictionUnit(unitRow.ID);
  unitId = unitRow.ID;
  const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
  if (parsed.Ok === false) throw new Error(`the harness unit does not parse: ${parsed.Errors.join('; ')}`);
  unitSpec = parsed.Value;
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  try {
    if (server && pool) await teardown();
  } finally {
    for (const p of instances) await p.ReleaseIndependentInstance();
    await pool?.close();
    await server?.ClosePool();
  }
}, BOOTSTRAP_TIMEOUT_MS);

/** Deletes every row the file created through D4-62's cleanup order, sweeps its key directories, and requires the starting census. */
async function teardown(): Promise<void> {
  const failures = await quietly(() => HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(server.Provider, server.User), records));
  for (const key of storedKeys) {
    const dir = path.dirname(ArtifactObjects.ObjectPath(storageRoot, '(a key the harness stored)', key));
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
  expect(failures.Result).toEqual([]);
  expect(failures.Unexpected).toEqual([]);
  expect(await census()).toEqual(startCensus);
  // The audit trail the platform keeps of every save and delete above (Record Changes): counted, not a leak (§11).
  expect(await recordChangesSince(startedAt)).toBeGreaterThan(0);
}

// ================================================================================================ cases ==

describe('the PreSave status guard is the production hook, registered in this process by the Engine entry point', () => {
  it('hook registration: a Status save outside the gate is refused status-changed-outside-gate and the stored row is unchanged', async () => {
    expect(PreSaveHookRegistration.IsRegistered(PredictiveStudioStatusGuard.HookMark)).toBe(true);
    const fix = await createPipeline('hook');
    const m = await validatedModel(fix, 'hook');
    const row = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
    expect(await row.Load(m.ModelID)).toBe(true);
    row.Status = 'Published';
    const saved = await quietly(() => row.Save());
    expect(saved.Result).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toContain('(status-changed-outside-gate)');
    expect(saved.Unexpected).toEqual([]);
    expect((await modelState(m.ModelID)).Status).toBe('Validated');
    expect(await recordsOf({ ModelID: m.ModelID, RunID: m.RunID })).toEqual([]);
  });
});

describe('concurrent publish — an incumbent and two validated candidates published from two Promise.all scopes', () => {
  let fix: PipelineFixture;
  let incumbent: TrainedModel;
  let a: TrainedModel;
  let b: TrainedModel;
  let winner: TrainedModel;
  let loser: TrainedModel;

  it('two parallel publishes of one pipeline publish exactly one', async () => {
    fix = await createPipeline('parallel');
    incumbent = await publishedModel(fix, 'incumbent');
    a = await validatedModel(fix, 'candidate-a', { IncumbentDiff: beats(incumbent.ModelID) });
    b = await validatedModel(fix, 'candidate-b', { IncumbentDiff: beats(incumbent.ModelID) });
    const [pa, pb] = [await ownProvider(), await ownProvider()];
    const raced = await quietly(() => allSettledValues([new LifecycleGate().Publish(publishRequest(a.ModelID), gateCtx(pa)), new LifecycleGate().Publish(publishRequest(b.ModelID), gateCtx(pb))]));
    const outcomes: PublishOutcome[] = raced.Result;
    // Only the gate's lock wait may log: SQL Server's NOWAIT refusal on each retry of the held pipeline lock.
    expect(raced.Unexpected).toEqual([]);
    const published = outcomes.filter((o) => o.Kind === 'published');
    const withheld = outcomes.flatMap((o) => (o.Kind === 'withheld' ? [o] : []));
    expect(published).toHaveLength(1);
    expect(withheld).toHaveLength(1);
    const won = published[0];
    winner = UUIDsEqual(won.ModelID, a.ModelID) ? a : b;
    loser = winner === a ? b : a;
    expect(won).toMatchObject({ Kind: 'published', ModelID: winner.ModelID, Replaces: incumbent.ModelID });
    expect(withheld[0]).toMatchObject({
      Kind: 'withheld', ModelID: loser.ModelID, Status: 'Validated', Transient: false,
      Refusal: { kind: 'incumbent-not-current', comparedWith: incumbent.ModelID, current: winner.ModelID },
    });
    // The database: exactly one Published row, the incumbent archived by the winner's publish, the loser still Validated.
    const rows = await modelsOf(fix.PipelineID);
    expect(rows.filter((r) => r.Status === 'Published').map((r) => r.ID)).toEqual([winner.ModelID]);
    expect((await modelState(incumbent.ModelID)).Status).toBe('Archived');
    expect((await modelState(incumbent.ModelID)).StatusReason).toBe(`Replaced by v${winner.Version}, published through the gate.`);
    const loserRow = await modelState(loser.ModelID);
    expect(loserRow.Status).toBe('Validated');
    expect(loserRow.StatusReason).toBe(`Publish withheld: The training run was compared with model ${incumbent.ModelID}, but model ${winner.ModelID} is Published now; retrain to compare with it.`);
    // The ledger: the winner's one publish record replacing the incumbent; the loser's one refusal record, and nothing else.
    const winnerRecords = (await recordsOf({ ModelID: winner.ModelID, RunID: winner.RunID })).filter((r) => UUIDsEqual(r.ModelID, winner.ModelID));
    expect(winnerRecords.map((r) => [r.Kind, r.Purpose, r.ReplacesModelID])).toEqual([['publish', 'publish', incumbent.ModelID]]);
    const loserRecords = await recordsOf({ ModelID: loser.ModelID, RunID: loser.RunID });
    expect(loserRecords.map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish']]);
    expect(JSON.parse(loserRecords[0].Refusal || 'null')).toEqual({ kind: 'incumbent-not-current', comparedWith: incumbent.ModelID, current: winner.ModelID });
    // Monitoring: the winner's job Pending, the archived incumbent's disabled.
    expect(await monitoringJobStatuses(winner.ModelID)).toEqual(['Pending']);
    expect(await monitoringJobStatuses(incumbent.ModelID)).toEqual(['Disabled']);
  });

  it('concurrent publish (Publish twice for one training run): a retried Publish of the published winner is already-published and writes nothing', async () => {
    const before = await recordsOf({ ModelID: winner.ModelID, RunID: winner.RunID });
    const retry = await new LifecycleGate().Publish(publishRequest(winner.ModelID), gateCtx());
    expect(retry).toMatchObject({ Kind: 'already-published', ModelID: winner.ModelID, PublishRecordID: before.find((r) => r.Kind === 'publish')?.ID });
    expect(await recordsOf({ ModelID: winner.ModelID, RunID: winner.RunID })).toEqual(before);
    expect((await modelState(winner.ModelID)).Status).toBe('Published');
  });

  it('Archive: a Published model is archived with a reason and no sign-off, its monitoring job disabled, and the pipeline left with no Published model', async () => {
    const archived = await quietly(() => new LifecycleGate().Archive(winner.ModelID, 'harness: archived without a sign-off', human(), gateCtx()));
    expect(archived.Unexpected).toEqual([]);
    expect(archived.Result).toEqual({ Ok: true, ModelID: winner.ModelID, From: 'Published', To: 'Archived', Archived: null });
    expect(await modelState(winner.ModelID)).toMatchObject({ Status: 'Archived', StatusReason: 'harness: archived without a sign-off' });
    expect(await monitoringJobStatuses(winner.ModelID)).toEqual(['Disabled']);
    expect((await modelsOf(fix.PipelineID)).filter((r) => r.Status === 'Published')).toEqual([]);
  });
});

describe('concurrent training — twelve trainings of one pipeline started together', () => {
  it('twelve concurrent trainings get twelve distinct versions', async () => {
    const fix = await createPipeline('twelve');
    const providers = await Promise.all(Array.from({ length: 12 }, () => ownProvider()));
    const trained = await quietly(() => allSettledValues(providers.map((p, i) => trainModel(fix, `twelve-${i}`, { Provider: p }))));
    expect(trained.Unexpected).toEqual([]);
    const versions = trained.Result.map((m) => m.Version).sort((x, y) => x - y);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const rows = await modelsOf(fix.PipelineID);
    expect(rows.map((r) => r.Version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rows.every((r) => r.Status === 'Draft')).toBe(true);
    // Each run evaluated twice (D4-102: the gate's documented outcome however often a run is evaluated): its model
    // moves Draft → Validated once, the repeat is illegal-transition, and no run of the twelve gets a run-level record
    // (each run has a model row) or any record at all.
    const gate = new LifecycleGate();
    for (const m of trained.Result) {
      expect(await gate.Evaluate({ trainingRunId: m.RunID }, human(), gateCtx())).toMatchObject({ Kind: 'evaluated', ModelID: m.ModelID, To: 'Validated' });
      expect(await gate.Evaluate({ trainingRunId: m.RunID }, human(), gateCtx())).toMatchObject({ Kind: 'refused', Refusal: { kind: 'illegal-transition' } });
      expect(await recordsOf({ ModelID: m.ModelID, RunID: m.RunID })).toEqual([]);
    }
    expect((await modelsOf(fix.PipelineID)).map((r) => r.Status)).toEqual(Array.from({ length: 12 }, () => 'Validated'));
  });
});

describe('deleted parent — a candidate whose training run row is deleted by SQL before Publish', () => {
  it('publish of a model whose run is gone is refused', async () => {
    const fix = await createPipeline('run-gone');
    const m = await validatedModel(fix, 'run-gone');
    // Adversary (direct SQL): delete the run row. The database refuses while the model names it (FK_MLModel_TrainingRun)…
    const refused = await failureOf(async () => {
      await pool.request().input('R', sql.UniqueIdentifier, m.RunID).query(`DELETE FROM ${tableOf('MJ: ML Training Runs')} WHERE ID = @R`);
    });
    expect(refused).toContain('FK_MLModel_TrainingRun');
    // …so the adversary detaches the model first and deletes the run in one transaction (direct SQL).
    const tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx).input('M', sql.UniqueIdentifier, m.ModelID).query(`UPDATE ${tableOf('MJ: ML Models')} SET TrainingRunID = NULL WHERE ID = @M`);
    await new sql.Request(tx).input('R', sql.UniqueIdentifier, m.RunID).query(`DELETE FROM ${tableOf('MJ: ML Training Runs')} WHERE ID = @R`);
    await tx.commit();
    const outcome = await quietly(() => new LifecycleGate().Publish(publishRequest(m.ModelID), gateCtx()));
    expect(outcome.Unexpected).toEqual([]);
    expect(outcome.Result).toMatchObject({
      Kind: 'withheld', ModelID: m.ModelID, Status: 'Validated', Transient: false,
      Refusal: { kind: 'not-servable', reason: `ML Model ${m.ModelID} has no stored training run with a gate record and trainer result` },
    });
    expect(await modelState(m.ModelID)).toMatchObject({ Status: 'Validated', TrainingRunID: null });
    const recs = await recordsOf({ ModelID: m.ModelID });
    expect(recs.map((r) => [r.Kind, r.Purpose, r.TrainingRunID])).toEqual([['refusal', 'publish', null]]);
    expect(await monitoringJobStatuses(m.ModelID)).toEqual([]);
  });
});

describe('an out-of-gate Published row — set by direct SQL, then a Publish of another model of the pipeline', () => {
  it('out-of-gate incumbent: a Published row set by SQL is not silently replaced — the gate refuses incumbent-not-current and the record names it', async () => {
    const fix = await createPipeline('sql-published');
    const incumbent = await publishedModel(fix, 'gate-incumbent');
    const candidate = await validatedModel(fix, 'candidate', { IncumbentDiff: beats(incumbent.ModelID) });
    const rogue = await validatedModel(fix, 'rogue', { IncumbentDiff: beats(incumbent.ModelID) });
    // Adversary (direct SQL, one transaction): archive the gate's incumbent and publish the rogue model, with no record.
    const tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx).input('M', sql.UniqueIdentifier, incumbent.ModelID).query(`UPDATE ${tableOf('MJ: ML Models')} SET Status = 'Archived' WHERE ID = @M`);
    await new sql.Request(tx).input('M', sql.UniqueIdentifier, rogue.ModelID).query(`UPDATE ${tableOf('MJ: ML Models')} SET Status = 'Published' WHERE ID = @M`);
    await tx.commit();
    const outcome = await quietly(() => new LifecycleGate().Publish(publishRequest(candidate.ModelID), gateCtx()));
    expect(outcome.Unexpected).toEqual([]);
    expect(outcome.Result).toMatchObject({
      Kind: 'withheld', ModelID: candidate.ModelID, Status: 'Validated',
      Refusal: { kind: 'incumbent-not-current', comparedWith: incumbent.ModelID, current: rogue.ModelID },
    });
    // The rogue row keeps serving as it was set (the gate never adopts or replaces it); it has no record of its own.
    expect((await modelState(rogue.ModelID)).Status).toBe('Published');
    expect(await recordsOf({ ModelID: rogue.ModelID, RunID: rogue.RunID })).toEqual([]);
    expect((await modelState(candidate.ModelID)).Status).toBe('Validated');
    const recs = await recordsOf({ ModelID: candidate.ModelID, RunID: candidate.RunID });
    expect(recs.map((r) => [r.Kind, r.Purpose, r.ReplacesModelID])).toEqual([['refusal', 'publish', null]]);
    expect(recs[0].Reason).toBe(`The training run was compared with model ${incumbent.ModelID}, but model ${rogue.ModelID} is Published now; retrain to compare with it.`);
  });

  it('out-of-gate first incumbent: a pipeline\'s first candidate publishing over a Published row set by SQL is refused, and the record names that row', async () => {
    const fix = await createPipeline('sql-published-first');
    const rogue = await validatedModel(fix, 'rogue');
    const candidate = await validatedModel(fix, 'candidate');
    // Adversary (direct SQL): publish the rogue model, with no record; the candidate's run compared with no model.
    await pool.request().input('M', sql.UniqueIdentifier, rogue.ModelID).query(`UPDATE ${tableOf('MJ: ML Models')} SET Status = 'Published' WHERE ID = @M`);
    const outcome = await quietly(() => new LifecycleGate().Publish(publishRequest(candidate.ModelID), gateCtx()));
    expect(outcome.Unexpected).toEqual([]);
    expect(outcome.Result).toMatchObject({ Kind: 'withheld', ModelID: candidate.ModelID, Status: 'Validated', Refusal: { kind: 'not-servable' } });
    expect((await modelState(rogue.ModelID)).Status).toBe('Published');
    expect((await modelState(candidate.ModelID)).Status).toBe('Validated');
    const recs = await recordsOf({ ModelID: candidate.ModelID, RunID: candidate.RunID });
    expect(recs.map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish']]);
    expect(recs[0].Reason).toContain(rogue.ModelID);
  });
});

describe('a protocol version pinned by a run and then superseded by a new version', () => {
  let fix: PipelineFixture;
  let pinned: TrainedModel;
  let superseding: MJMLEvaluationProtocolEntity;

  it('superseded protocol: the publish re-verifies the version the run pinned, not the newer one', async () => {
    fix = await createPipeline('superseded');
    pinned = await validatedModel(fix, 'pinned');
    // A newer version under the same lineage that this run's evidence could not pass: margin 0.08 (the run's model beats
    // the dummy by 0.05 at the lower bound, so it recomputes to no-signal) and a required human sign-off (none exists).
    superseding = await EvaluationProtocolVersioning.CreateNextEvaluationProtocolVersion(
      fix.Protocol.Row,
      { promotion: { ...EvaluationProtocol.WithPromotionMargin(fix.Protocol.Spec.promotion, EvaluationProtocol.ToNonNegative(0.08)), requiresHumanSignOff: true } },
      human(), new MetadataEntityFactory(server.Provider), server.User,
    );
    records.RecordEvaluationProtocol(superseding.ID);
    expect(await protocolLineage(fix.Protocol.Row.ID)).toEqual([{ ID: fix.Protocol.Row.ID, Version: 1 }, { ID: superseding.ID, Version: 2 }]);
    const outcome = await quietly(() => new LifecycleGate().Publish(publishRequest(pinned.ModelID), gateCtx()));
    expect(outcome.Unexpected).toEqual([]);
    expect(outcome.Result).toMatchObject({ Kind: 'published', ModelID: pinned.ModelID, Replaces: null });
    // The stored pin: the run and the model name version 1, and the publish record holds the decision version 1 gives.
    expect(UUIDsEqual(await runProtocolId(pinned.RunID), fix.Protocol.Row.ID)).toBe(true);
    expect(UUIDsEqual((await modelState(pinned.ModelID)).EvaluationProtocolID, fix.Protocol.Row.ID)).toBe(true);
    const publish = (await recordsOf({ ModelID: pinned.ModelID, RunID: pinned.RunID })).filter((r) => r.Kind === 'publish');
    expect(publish).toHaveLength(1);
    expect(JSON.parse(publish[0].GateDecision || 'null')).toMatchObject({ outcome: 'model', shipped: 'xgb' });
  });

  it('superseded protocol: a run re-pointed at the newer version by SQL is refused protocol-mismatch against its stored gate record', async () => {
    const tampered = await validatedModel(fix, 'repointed', { IncumbentDiff: beats(pinned.ModelID) });
    // Adversary (direct SQL): point the run at the superseding version; its stored gate record still names version 1.
    await pool.request().input('R', sql.UniqueIdentifier, tampered.RunID).input('P', sql.UniqueIdentifier, superseding.ID)
      .query(`UPDATE ${tableOf('MJ: ML Training Runs')} SET EvaluationProtocolID = @P WHERE ID = @R`);
    const outcome = await quietly(() => new LifecycleGate().Publish(publishRequest(tampered.ModelID), gateCtx()));
    expect(outcome.Unexpected).toEqual([]);
    expect(outcome.Result).toMatchObject({
      Kind: 'withheld', ModelID: tampered.ModelID, Status: 'Validated',
      Refusal: { kind: 'not-servable', reason: `publish re-verification refused (protocol-mismatch): run pinned ${fix.Protocol.Row.ID} v1, row is ${superseding.ID} v2` },
    });
    expect((await modelState(pinned.ModelID)).Status).toBe('Published');
    expect((await modelState(tampered.ModelID)).Status).toBe('Validated');
    expect((await recordsOf({ ModelID: tampered.ModelID, RunID: tampered.RunID })).map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish']]);
  });

  it('agent-authored guard field: an agent cannot supersede the pinned protocol\'s margin, and the lineage keeps its two versions', async () => {
    const attempt = await quietly(() => failureOf(async () => {
      const created = await EvaluationProtocolVersioning.CreateNextEvaluationProtocolVersion(
        superseding,
        { promotion: EvaluationProtocol.WithPromotionMargin(fix.Protocol.Spec.promotion, EvaluationProtocol.ToNonNegative(0)) },
        { kind: 'agent', agentRunId: '00000000-0000-4000-8000-0000000A6E47' }, new MetadataEntityFactory(server.Provider), server.User,
      );
      // Recorded so teardown deletes it when the refusal is broken and the row is saved.
      records.RecordEvaluationProtocol(created.ID);
    }));
    expect(attempt.Result).toContain('Saving Evaluation Protocol');
    expect(attempt.Unexpected).toEqual([]);
    expect(attempt.Result).toMatch(/guard field|GuardFieldsEditableBy|agent/i);
    expect(await protocolLineage(fix.Protocol.Row.ID)).toEqual([{ ID: fix.Protocol.Row.ID, Version: 1 }, { ID: superseding.ID, Version: 2 }]);
  });
});

describe('the pinned protocol row changed by direct SQL after the gate has read it (D4-108)', () => {
  it('pinned protocol changed by SQL: Publish, the status hook and the monitoring job all read the stored row, not the copy read before', async () => {
    const fix = await createPipeline('protocol-sql');
    const protocolId = fix.Protocol.Row.ID;
    // A first publish of the pipeline reads the pinned version row (the read a cache would keep).
    const sibling = await publishedModel(fix, 'sibling');
    const target = await validatedModel(fix, 'target', { IncumbentDiff: beats(sibling.ModelID) });
    // Adversary (direct SQL): the pinned row's promotion rule becomes margin 0.08 with a required sign-off. The target's
    // stored intervals beat the dummy by 0.05 at the lower bound, so under the stored row they recompute to no-signal.
    await setPromotionBySql(protocolId, { ...fix.Protocol.Spec.promotion, margin: EvaluationProtocol.ToNonNegative(0.08), requiresHumanSignOff: true });
    const refused = await quietly(() => new LifecycleGate().Publish(publishRequest(target.ModelID), gateCtx()));
    expect(refused.Unexpected).toEqual([]);
    // §5.2 / N9: the margin is the pinned protocol row's, so the re-derivation refuses gate-no-signal first.
    expect(refused.Result).toMatchObject({ Kind: 'withheld', ModelID: target.ModelID, Status: 'Validated', Refusal: { kind: 'gate-no-signal', reason: 'recomputed gate is no-signal' } });
    expect([(await modelState(target.ModelID)).Status, (await modelState(sibling.ModelID)).Status]).toEqual(['Validated', 'Published']);
    // The status hook's re-derivation reads the same stored row: an authorisation issued outside the gate is refused gate-no-signal.
    const row = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
    expect(await row.Load(target.ModelID)).toBe(true);
    StatusWriteAuthorisations.Instance.Authorise(row, { From: 'Validated', To: 'Published', Initiator: human(), Replaces: sibling.ModelID });
    row.Status = 'Published';
    const hooked = await quietly(() => row.Save());
    expect(hooked.Unexpected).toEqual([]);
    expect(hooked.Result).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toContain('(gate-no-signal)');
    // Adversary (direct SQL): margin back to 0, no sign-off, and a 45-day sign-off wait the cached copy never had.
    await setPromotionBySql(protocolId, { ...fix.Protocol.Spec.promotion, signOffExpiryDays: 45 });
    const published = await quietly(() => new LifecycleGate().Publish(publishRequest(target.ModelID), gateCtx()));
    expect(published.Unexpected).toEqual([]);
    expect(published.Result).toMatchObject({ Kind: 'published', ModelID: target.ModelID, Replaces: sibling.ModelID });
    // The monitoring job the publish created carries the stored row's promotion rule as its challenger rule.
    expect(await monitoringJobRules(target.ModelID)).toEqual([{ Status: 'Pending', Margin: 0, RequiresHumanSignOff: false, SignOffExpiryDays: 45 }]);
    const recs = await recordsOf({ ModelID: target.ModelID, RunID: target.RunID });
    expect(recs.filter((r) => UUIDsEqual(r.ModelID, target.ModelID)).map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish'], ['publish', 'publish']]);
  });
});

describe('a gate record whose stored intervals recompute to no-signal under the pinned margin', () => {
  let fix: PipelineFixture;
  let model: TrainedModel;

  it('no-signal recomputation: the stored outcome says model, the pinned margin says no signal, and Publish is refused gate-no-signal by the re-derivation', async () => {
    // The pinned protocol's margin is 0.08; the adversary's stored gate record was built at margin 0, so its decision
    // (`model`) is not what its intervals give under the pinned margin (the model beats the dummy by 0.05 at the lower bound).
    fix = await createPipeline('no-signal-recompute', 0.08);
    const atMarginZero: EvaluationProtocolSpec = { ...fix.Protocol.Spec, promotion: EvaluationProtocol.WithPromotionMargin(fix.Protocol.Spec.promotion, EvaluationProtocol.ToNonNegative(0)) };
    model = await trainModel(fix, 'stored-model', { RecordProtocol: atMarginZero });
    // Evaluate trusts the stored decision: the model reaches Validated.
    await evaluateToValidated(model.ModelID);
    const outcome = await quietly(() => new LifecycleGate().Publish(publishRequest(model.ModelID), gateCtx()));
    expect(outcome.Unexpected).toEqual([]);
    expect(outcome.Result).toMatchObject({
      Kind: 'withheld', ModelID: model.ModelID, Status: 'Validated', Transient: false,
      Refusal: { kind: 'gate-no-signal', reason: 'recomputed gate is no-signal' },
    });
    expect((await modelState(model.ModelID)).Status).toBe('Validated');
    const recs = await recordsOf({ ModelID: model.ModelID, RunID: model.RunID });
    expect(recs.map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish']]);
    expect(await monitoringJobStatuses(model.ModelID)).toEqual([]);
  });

  it('no-signal recomputation: an authorisation issued outside the gate does not publish it — the hook re-derives and refuses', async () => {
    const row = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
    expect(await row.Load(model.ModelID)).toBe(true);
    // Adversary: any module can fill the exported authorisation singleton for this instance (D4-58).
    StatusWriteAuthorisations.Instance.Authorise(row, { From: 'Validated', To: 'Published', Initiator: human(), Replaces: null });
    row.Status = 'Published';
    const saved = await quietly(() => row.Save());
    expect(saved.Result).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toContain('(gate-no-signal)');
    expect(saved.Unexpected).toEqual([]);
    expect((await modelState(model.ModelID)).Status).toBe('Validated');
  });

  it('a no-signal run with no model row, evaluated twice at once, gets exactly one run-level refusal record', async () => {
    const runId = await trainNoSignalRun(fix, 'no-model');
    const [p1, p2] = [await ownProvider(), await ownProvider()];
    const both = await quietly(() => allSettledValues([
      new LifecycleGate().Evaluate({ trainingRunId: runId }, human(), gateCtx(p1)),
      new LifecycleGate().Evaluate({ trainingRunId: runId }, human(), gateCtx(p2)),
    ]));
    const recs = await recordsOf({ RunID: runId });
    // The losing insert, when the two evaluations race, is refused by the one-outcome-per-run index; the provider logs
    // that refusal and the gate returns the winner's record. No other line is written.
    expect(both.Unexpected.filter((l) => !l.includes("unique index 'UX_MLModelPublishRecord_OneRunOutcome'"))).toEqual([]);
    expect(recs.map((r) => [r.Kind, r.Purpose, r.ModelID])).toEqual([['refusal', 'evaluate', null]]);
    for (const o of both.Result) expect(o).toMatchObject({ Kind: 'run-recorded', TrainingRunID: runId, RefusalRecordID: recs[0].ID, Refusal: { kind: 'gate-no-signal' } });
    // A third evaluation finds the record and writes none.
    expect(await new LifecycleGate().Evaluate({ trainingRunId: runId }, human(), gateCtx())).toMatchObject({ Kind: 'run-recorded', RefusalRecordID: recs[0].ID });
    expect(await recordsOf({ RunID: runId })).toHaveLength(1);
  });
});
