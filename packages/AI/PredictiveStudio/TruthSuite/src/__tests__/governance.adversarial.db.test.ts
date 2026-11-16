// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// The M4 adversarial harness (Task M4.6, D-071): one case per uncovered cell of M4's coverage table and per scenario of
// the task's Step 1, each trying to break the claim its name states against the PRODUCTION readers and writers: the
// lifecycle gate (`new LifecycleGate()` with `GateContexts.ForRequest`: stored-rows evidence, the sign-off lookup over
// the publish records, the semantics check), `SignOffService` and the `PredictiveStudio.SignOffModel` operation's server
// body, the `MJ: ML Output Bindings` server subclass (`MJMLOutputBindingEntityServer`, registered by the bootstrap from
// MJCoreEntitiesServer's dist), CodeGen's `spDeleteEntityWithCoreDependencies` and the experiment report
// (`ExperimentReports`). Every model row is written the way the trainer writes it — artifact stored write-once through
// the artifact registry, the gate record built by `GateRecords`, the delivery registered by
// `Delivery`/`RegisteredDelivery`, the row saved by `ModelVersions.SaveNewRow` — from a synthetic trainer answer
// (`fixtures/gate-trainer-answers.ts`). The adversary's writes the task prescribes "by direct SQL" are the only SQL DML
// here, each labelled (with the one Entity row CodeGen writes by SQL, labelled as CodeGen's write); every other SQL
// statement is a verification read. Teardown deletes what the file created by ID through `HarnessCleanup.DeleteRecorded`
// (D4-62's order), then the files whose rows the adversary's deletes orphaned and the one role grant the operation's
// approving person needed (the bootstrap's user is the MJ system user, which the operation refuses), and requires the
// starting census.
//
// The bootstrap's user (`server.User`, the Owner `not.set@nowhere.com`) is the MJ system user: `human()` here, as in
// the older DB lanes, initiates as the system user (accepted for those lanes; F2). Every sign-off in this file is made
// by a real person who is not the system user — the seeded `it-rls-a@integration.test` granted `Developer`
// (`approvingHuman`) — through the service (Case B, D) or the operation (Case C).
//
// The mutation map (D-071: the reviewer flips each, one at a time; exactly the case named goes red):
//   1. Evidence-hash equality at publish dropped (`StoredSignOffLookup.FindApproving` compares by ID only)
//      → `a sign-off over evidence that changed` › the publish naming the sign-off after the snapshot hash changed is
//        published instead of refused no-sign-off.
//   2. The non-human refusal of the sign-off operation dropped (`PredictiveStudioSignOffModelServerOperation.IsNotHuman`
//      → false) → `non-human and unauthorised sign-offs` › (i) the API-key call and (ii) the system user's call each
//        record a sign-off row instead of NOT_HUMAN.
//   3. `overridesFlags` without a reason allowed (`SignOffService.Record`'s overrides-without-reason check dropped)
//      → `non-human and unauthorised sign-offs` › (iv) the result is not OVERRIDES_WITHOUT_REASON (the database's
//        CK_MLModelPublishRecord_Reason then refuses the row, so the op returns EXECUTION_ERROR).
//   4. Sign-off required only when the protocol asks dropped (`LifecycleGate.CheckPublishable`'s
//      `requiresHumanSignOff && signOff === null` check removed) → `a sign-off over evidence that changed` › the
//        automatic publish under a protocol requiring a sign-off is published instead of refused no-sign-off.
//   5. `MJMLOutputBindingEntityServer.ValidateAsync` not running `SemanticsRules.CheckRow` → `every binding
//      combination` › 32 of 32 pairs save instead of 4, and every label saves.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { RunView, UserInfo, UserRoleInfo, WellKnownUserSource, type EntityInfo, type RemoteOpServerContext } from '@memberjunction/core';
import type {
  MJMLAlgorithmEntity, MJMLEvaluationProtocolEntity, MJMLModelEntity, MJMLModelPublishRecordEntity, MJMLOutputBindingEntity, MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity, MJMLTrainingSnapshotEntity, MJRoleEntity, MJUserEntity, MJUserRoleEntity, PredictiveStudioSignOffModelInput,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
  Delivery,
  EvaluationProtocol,
  EvaluationProtocolRules,
  GateRecords,
  JsonParse,
  PredictionUnit,
  RegisteredDelivery,
  TRAINING_RUN_RESULTS_SCHEMA,
  TracedNumbers,
  TrainerContract,
  type Actor,
  type EvaluationProtocolSpec,
  type LeakageFlag,
  type PredictionUnitSpec,
  type StoredFile,
  type StoredGateRecord,
  type TaskType,
  type TrainerCompleted,
  type TrainingRunResults,
  type UnitDraft,
} from '@memberjunction/predictive-studio-core';
import {
  ArtifactRegistry,
  EvaluationProtocolVersioning,
  ExperimentReports,
  GateContexts,
  LifecycleGate,
  MetadataEntityFactory,
  ModelVersions,
  PredictionUnitVersioning,
  PredictiveStudioSignOffModelServerOperation,
  SignOffService,
  StorageProviderArtifactLoader,
  StorageProviderArtifactStore,
  type ExperimentReport,
  type GateContext,
  type PublishOutcome,
  type PublishRequest,
  type RegistryContext,
} from '@memberjunction/predictive-studio';
import {
  BootstrapIntegrationServer, SEED_FIXTURES_COMMAND, SEEDED_NOGRANT_EMAIL, SEEDED_SCOPED_A_EMAIL, type IntegrationBootstrapContext,
} from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { HarnessCleanup, RunRecords, type CleanupFileRow } from '../harness/cleanup';
import { ArtifactObjects } from '../harness/artifact-objects';
import { ConsoleCapture } from './fixtures/console-capture';
import { GATE_TASK, GateTrainerAnswers, MULTICLASS_TASK } from './fixtures/gate-trainer-answers';

/** Row counts of every table the file (or the production code it drives) writes, and model-artifact objects under the storage root. */
interface HarnessCensus {
  readonly Models: number;
  readonly Runs: number;
  readonly Snapshots: number;
  readonly Pipelines: number;
  readonly PublishRecords: number;
  readonly OutputBindings: number;
  readonly ScheduledJobs: number;
  readonly Protocols: number;
  readonly Units: number;
  readonly Files: number;
  readonly Entities: number;
  readonly UserRoles: number;
  readonly Actions: number;
  readonly ActionParams: number;
  /** `MJ: AI Agent Runs`, less the Memory Manager's (MJAPI's scheduled job writes them while it is up), by agent name. */
  readonly AgentRuns: number;
  /** `MJ: AI Prompt Runs`, less the Memory Manager's prompts' (`Memory Manager - …`) and `Name Conversation`'s, by prompt name. */
  readonly PromptRuns: number;
  readonly ArtifactObjects: number;
  readonly ArtifactDirectories: number;
}

/** A prediction unit version the file created: its row ID, its parsed spec and the task its models are trained for. */
interface UnitFixture {
  readonly ID: string;
  readonly Spec: PredictionUnitSpec;
  readonly Task: TaskType;
}

/** A protocol version row and its parsed spec. */
interface ProtocolVersion {
  readonly Row: MJMLEvaluationProtocolEntity;
  readonly Spec: EvaluationProtocolSpec;
}

/** A harness pipeline, the unit its models name and the protocol version its runs pin. */
interface PipelineFixture {
  readonly PipelineID: string;
  readonly Unit: UnitFixture;
  readonly Protocol: ProtocolVersion;
}

/** How a harness pipeline is created. */
interface PipelineOptions {
  /** The unit its models name (default: the binary unit). */
  readonly Unit?: UnitFixture;
  /** Pin version 2 of the protocol lineage, whose promotion rule requires a human sign-off. */
  readonly RequiresHumanSignOff?: boolean;
  /** The pipeline's target entity (default: `MJ: Users`). */
  readonly TargetEntityID?: string;
}

/** A trainer answer for a run of a pipeline, built once the run has its ID. */
type AnswerOf = (runId: string, protocol: EvaluationProtocolSpec, tag: string) => TrainerCompleted;

/** A completed training: its run, the Training Snapshot it trained on and the model it shipped (null when nothing shipped). */
interface TrainedRun {
  readonly RunID: string;
  readonly SnapshotID: string;
  readonly ModelID: string | null;
}

/** A completed training that shipped a model. */
interface TrainedModel extends TrainedRun {
  readonly ModelID: string;
}

/** A model row as the verification SQL reads it. */
type ModelState = Pick<MJMLModelEntity, 'ID' | 'Status' | 'TrainingSnapshotID' | 'ArtifactFileID'>;

/** A publish record as the verification SQL reads it. */
type RecordState = Pick<
  MJMLModelPublishRecordEntity,
  'ID' | 'Kind' | 'Purpose' | 'ModelID' | 'TrainingRunID' | 'SignOffID' | 'ApproverKind' | 'UserID' | 'EvidenceSha256' | 'Refusal' | 'Reason'
>;

/** An output binding row as the verification SQL reads it. */
type BindingState = Pick<MJMLOutputBindingEntity, 'ID' | 'Surface' | 'SortsBy' | 'DriverDirectionRelativeTo' | 'Label'>;

/** A Training Snapshot's file columns, read before the adversary deletes the row. */
type SnapshotFiles = Pick<MJMLTrainingSnapshotEntity, 'MatrixFileID' | 'RowManifestFileID' | 'ProvenanceFileID'>;

/** The outcome of one call of the sign-off operation's server body: its result code, the recorded ID, and the sign-off rows the call added. */
interface OpAttempt {
  readonly ResultCode: string | null;
  readonly ErrorMessage: string | null;
  readonly SignOffRecordID: string | null;
  /** The model's sign-off rows after the call less those before it. */
  readonly SignOffRowsAdded: number;
  readonly Unexpected: string[];
}

/** One binding save attempt: whether it saved, and the refusal's complete message (empty when it saved). */
interface BindingAttempt {
  readonly Saved: boolean;
  readonly Message: string;
}

const TAG = `PSGovernance-${Date.now()}`;
/**
 * The console lines the production code writes on the paths this file drives, each expected: the provider's note that a
 * committed transaction runs its post-commit tasks, and the scoring-Action generator's line for each Action it ensures
 * after a publish commits. Any other line fails the case that wrote it, unless the case names it.
 */
const EXPECTED_LINES: readonly RegExp[] = [
  /^Running \d+ post-commit task\(s\) after transaction commit$/,
  /^ModelScoringActionGenerator: (ensured|disabled) scoring action 'Score with PSGovernance-/,
];
// The bootstrap loads all metadata; on a loaded host that alone has taken 44 s, past vitest's default hook timeout.
const BOOTSTRAP_TIMEOUT_MS = 120_000;
/** The four sorts a binding may store (the generated `SortsBy` union, every member). */
const SORTS: readonly MJMLOutputBindingEntity['SortsBy'][] = ['adverse-probability-desc', 'score-desc', 'score-asc', 'none'];
/** The two driver directions a binding may store (the generated union, every member). */
const DIRECTIONS: readonly MJMLOutputBindingEntity['DriverDirectionRelativeTo'][] = ['adverse-class', 'raw-contribution'];
/**
 * The pair the rule table (`SemanticsRules`' JSDoc) requires of each surface of a multiclass model that declares
 * adverse classes, written out here (not read from the rule) so a change to the rule is what this file catches.
 */
const REQUIRED_PAIRS: Readonly<Record<MJMLOutputBindingEntity['Surface'], Pick<MJMLOutputBindingEntity, 'SortsBy' | 'DriverDirectionRelativeTo'>>> = {
  'at-risk-list': { SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class' },
  'predictions-grid': { SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class' },
  'why-badge': { SortsBy: 'none', DriverDirectionRelativeTo: 'adverse-class' },
  'record-panel': { SortsBy: 'none', DriverDirectionRelativeTo: 'adverse-class' },
};
/** The default label the rule table gives the W9 multiclass task (its adverse classes in class order, joined by " or "). */
const MULTICLASS_DEFAULT_LABEL = 'NoShow or Cancelled risk';
/** The marker of the procedure's definition in a migration that (re)creates it. */
const PROC_MARKER = 'CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]';
/** The output-binding delete of the procedure, as the migration writes it. */
const BINDING_DELETE = 'DELETE FROM [${flyway:defaultSchema}].[MLOutputBinding]';
/** The model delete of the procedure, as the migration writes it (the closing bracket keeps `[MLModelPublishRecord]` out). */
const MODEL_DELETE = 'DELETE FROM [${flyway:defaultSchema}].[MLModel] ';
/** The repository's v6 migrations folder. */
const MIGRATIONS_V6 = new URL('../../../../../../migrations/v6/', import.meta.url);

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let storageRoot: string;
let algorithmId: string;
let usersEntityId: string;
let binaryUnit: UnitFixture;
let multiclassUnit: UnitFixture;
let startCensus: HarnessCensus;
const records = new RunRecords();
/** Every provider key the file stored, for the sweep of the key directories the local driver leaves. */
const storedKeys: string[] = [];
/** The `MJ: Files` rows whose referencing rows the adversary's deletes removed: teardown deletes them (object, then row). */
const orphanedFileIds: string[] = [];
/** The `MJ: User Roles` rows the file granted (the approving human's role): teardown deletes them. */
const grantedUserRoleIds: string[] = [];
/** The approving person, granted once for the file ({@link approvingHuman}). */
let approver: Promise<UserInfo> | null = null;
/** The role the approving human is granted: it reads and writes the Predictive Studio registry entities. */
const APPROVER_ROLE = 'Developer';

// ================================================================================================== helpers ==

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(entityName: string): string {
  const entity: EntityInfo | undefined = server.Provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** The bootstrap's user as an interactive human initiator. It is the MJ system user (see the header): a publish's initiator only, never a signer. */
function human(): Actor {
  return { kind: 'human', userId: server.User.ID };
}

/** The registry context of the harness user on the bootstrap's provider. */
function registryCtx(): RegistryContext {
  return { ContextUser: server.User, Provider: server.Provider };
}

/** The production gate context (stored-rows evidence, the sign-off lookup over the publish records, the semantics check). */
function gateCtx(): GateContext {
  return GateContexts.ForRequest(registryCtx());
}

/** A publish request for `modelId` by the harness user, naming `signOffId` (none by default). */
function publishRequest(modelId: string, signOffId: string | null = null): PublishRequest {
  return { modelId, purpose: 'publish', initiator: human(), signOffId, reason: null };
}

/** The lower-case hex SHA-256 of `text`. */
function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** A unit over `MJ: Users` (one row per user, one fixed decision date) whose label is `task`. */
function unitDraft(label: string, task: TaskType): UnitDraft {
  return {
    Name: `${TAG} ${label} unit`, Description: 'Governance harness unit (no rows are ever read: the trainer answers are synthetic).',
    UnitRows: { kind: 'grain', grainEntity: 'MJ: Users', decisionDate: { kind: 'fixed', date: '2026-01-01' }, filter: [] },
    LabelRule: { kind: 'column', column: 'IsActive' }, LabelWindowDays: 31, LabelGapDays: 0, TaskType: task,
    Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2027-02-01' } },
    ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
    DecisionSpec: { action: 'harness', actorRole: 'harness', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
  };
}

/** Version 1 of a new unit lineage of `task`, saved by the harness user and recorded. */
async function createUnit(label: string, task: TaskType): Promise<UnitFixture> {
  const row = await PredictionUnitVersioning.CreatePredictionUnitV1(unitDraft(label, task), human(), new MetadataEntityFactory(server.Provider), server.User);
  records.RecordPredictionUnit(row.ID);
  const parsed = PredictionUnit.ParsePredictionUnitRow(row);
  if (parsed.Ok === false) throw new Error(`the ${label} unit does not parse: ${parsed.Errors.join('; ')}`);
  return { ID: row.ID, Spec: parsed.Value, Task: task };
}

/** The parsed spec of a saved protocol version row. */
function specOf(row: MJMLEvaluationProtocolEntity): EvaluationProtocolSpec {
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
  if (parsed.Ok === false) throw new Error(`protocol ${row.ID} does not parse: ${parsed.Errors.join('; ')}`);
  return parsed.Value;
}

/**
 * The protocol version a pipeline pins: version 1 of a new lineage over `unit` (its default draft), or, when
 * `requiresHumanSignOff`, version 2 of it whose promotion rule requires a human sign-off (as the lifecycle lane
 * supersedes a version). Every version is recorded.
 */
async function createProtocol(label: string, unit: UnitFixture, requiresHumanSignOff: boolean): Promise<ProtocolVersion> {
  const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: unit.Spec, Holdout: { kind: 'seeded-random', fraction: 0.25 }, Candidates: 1, Seed: 0, Name: `${TAG} ${label}` });
  const v1 = await EvaluationProtocolVersioning.CreateEvaluationProtocolV1(draft, human(), new MetadataEntityFactory(server.Provider), server.User);
  records.RecordEvaluationProtocol(v1.ID);
  if (!requiresHumanSignOff) return { Row: v1, Spec: specOf(v1) };
  const spec = specOf(v1);
  const v2 = await EvaluationProtocolVersioning.CreateNextEvaluationProtocolVersion(
    v1, { promotion: { ...spec.promotion, requiresHumanSignOff: true } }, human(), new MetadataEntityFactory(server.Provider), server.User,
  );
  records.RecordEvaluationProtocol(v2.ID);
  return { Row: v2, Spec: specOf(v2) };
}

/** A pipeline of the harness and the protocol version its runs pin; both recorded for teardown. */
async function createPipeline(label: string, o: PipelineOptions = {}): Promise<PipelineFixture> {
  const unit = o.Unit || binaryUnit;
  const protocol = await createProtocol(label, unit, o.RequiresHumanSignOff === true);
  const pipeline = await server.Provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', server.User);
  pipeline.NewRecord();
  pipeline.Name = `${TAG} ${label}`;
  pipeline.TargetEntityID = o.TargetEntityID || usersEntityId;
  pipeline.TargetVariable = 'IsActive';
  pipeline.ProblemType = 'classification';
  pipeline.AlgorithmID = algorithmId;
  if (!(await pipeline.Save())) throw new Error(`pipeline ${label} did not save: ${pipeline.LatestResult?.CompleteMessage}`);
  records.RecordPipeline(pipeline.ID);
  return { PipelineID: pipeline.ID, Unit: unit, Protocol: protocol };
}

/** A training run of the pipeline, Running, pinned to the pipeline's protocol version (as the trainer opens it). */
async function startRun(fix: PipelineFixture): Promise<MJMLTrainingRunEntity> {
  const run = await server.Provider.GetEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', server.User);
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

/** The gate record `GateRecords` builds for the answer under the pipeline's protocol and task; throws when it refuses. */
function gateRecordOf(answer: TrainerCompleted, fix: PipelineFixture): StoredGateRecord {
  const built = GateRecords.BuildStoredGateRecord({ Result: answer, Protocol: fix.Protocol.Spec, Task: fix.Unit.Task, Carve: null });
  if (built.Ok === false) throw new Error(`the gate record was refused: ${JSON.stringify(built.Refusal)}`);
  return built.Record;
}

/** The registered delivery of what the stored decision ships, as the trainer registers it; throws when refused. */
function registeredDeliveryOf(gate: StoredGateRecord, answer: TrainerCompleted, stored: StoredFile, task: TaskType): RegisteredDelivery {
  const created = Delivery.Create(gate.decision, answer.artifacts, task);
  if (created.Ok === false) throw new Error(`the delivery was refused: ${JSON.stringify(created.Error)}`);
  const registered = RegisteredDelivery.Register(created.Delivery, stored);
  if (registered.Ok === false) throw new Error(`the delivery could not be registered: ${registered.Reason}`);
  return registered.Registered;
}

/**
 * The Training Snapshot row a training trains on, as the snapshot builder leaves it: its three files stored write-once
 * (through the artifact registry, so teardown deletes their objects with their rows), a complete read, five hashes and
 * the data cutoff. The gate's evidence reads its `ContentHash` and `DataCutoff`.
 */
async function storeSnapshot(fix: PipelineFixture, label: string, ctx: RegistryContext): Promise<MJMLTrainingSnapshotEntity> {
  const registry = ArtifactRegistry.ForContext(ctx, new StorageProviderArtifactLoader());
  const files: StoredFile[] = [];
  for (const part of ['matrix', 'row-manifest', 'provenance']) {
    const file = await registry.Store(Buffer.from(`${TAG}:${label}:${part}`), `snapshot-${label}-${part}.txt`, ctx);
    storedKeys.push(file.providerKey);
    files.push(file);
  }
  const [matrix, manifest, provenance] = files;
  const snapshot = await ctx.Provider.GetEntityObject<MJMLTrainingSnapshotEntity>('MJ: ML Training Snapshots', server.User);
  snapshot.NewRecord();
  snapshot.ContentHash = sha256Hex(`${TAG}:${label}:${randomUUID()}`);
  snapshot.PipelineID = fix.PipelineID;
  snapshot.PredictionUnitID = fix.Unit.ID;
  snapshot.LabelVersion = 1;
  snapshot.FeatureSpecVersion = 1;
  snapshot.EvaluationProtocolID = fix.Protocol.Row.ID;
  snapshot.StorageProviderID = matrix.storageProviderId;
  [snapshot.MatrixFileID, snapshot.MatrixSha256, snapshot.MatrixSizeBytes] = [matrix.fileId, matrix.sha256, matrix.sizeBytes];
  [snapshot.RowManifestFileID, snapshot.RowManifestSha256, snapshot.RowManifestSizeBytes] = [manifest.fileId, manifest.sha256, manifest.sizeBytes];
  [snapshot.ProvenanceFileID, snapshot.ProvenanceSha256, snapshot.ProvenanceSizeBytes] = [provenance.fileId, provenance.sha256, provenance.sizeBytes];
  snapshot.ManifestRowCount = 8;
  snapshot.HoldoutRowCount = 2;
  snapshot.RowsRead = 8;
  snapshot.ReadComplete = true;
  snapshot.CensoredRowsExcluded = 0;
  snapshot.LabelKnownRowsExcluded = 0;
  snapshot.EmptyLabelRowsExcluded = 0;
  snapshot.FeatureSpec = '{}';
  snapshot.FeatureSchema = JSON.stringify([{ Name: 'EventsAttended' }, { Name: 'Tenure' }]);
  snapshot.FeatureSchemaHash = sha256Hex('governance-harness feature schema');
  snapshot.ColumnProvenance = '{}';
  snapshot.DataCutoff = new Date('2026-01-01T00:00:00Z');
  snapshot.AssemblyCodeVersion = 'governance-harness';
  if (!(await snapshot.Save())) throw new Error(`the training snapshot of ${label} did not save: ${snapshot.LatestResult?.CompleteMessage}`);
  return snapshot;
}

/** The trainer's model row for the shipped artifact (Draft; its version is allocated by the save); its semantics are the unit's task. */
async function newModelRow(fix: PipelineFixture, runId: string, snapshot: MJMLTrainingSnapshotEntity, stored: StoredFile, delivery: RegisteredDelivery): Promise<MJMLModelEntity> {
  const model = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
  model.NewRecord();
  model.PipelineID = fix.PipelineID;
  model.AlgorithmID = algorithmId;
  model.ArtifactFileID = stored.fileId;
  model.ArtifactSha256 = stored.sha256;
  model.TrainingRunID = runId;
  model.EvaluationProtocolID = fix.Protocol.Row.ID;
  model.PredictionUnitID = fix.Unit.ID;
  model.OutputSemantics = JSON.stringify({ task: fix.Unit.Task });
  model.Delivery = JSON.stringify(delivery.View);
  model.ArtifactStatus = 'verified';
  model.ArtifactCheckedAt = new Date();
  model.FittedPreprocessing = '{}';
  model.FeatureSchema = JSON.stringify([{ Name: 'EventsAttended' }, { Name: 'Tenure' }]);
  model.TrainingSnapshotID = snapshot.ID;
  model.SnapshotHash = snapshot.ContentHash;
  model.TargetVariable = 'IsActive';
  model.ProblemType = 'classification';
  model.TrainedAt = new Date();
  model.Status = 'Draft';
  return model;
}

/** The completed results the trainer stores for a run: the unit resolution, the trainer result (or none) and the gate record. */
function completedResults(trainer: Extract<TrainingRunResults, { status: 'completed' }>['trainer'], gate: StoredGateRecord | null): TrainingRunResults {
  return {
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 8, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 8, dataCutoff: '2026-01-01' },
    trainer, trainerRequest: null, carve: null, gate,
  };
}

/** Completes the run as the trainer does: the v2 envelope (`results`) and the model it produced (or none). */
async function completeRun(run: MJMLTrainingRunEntity, results: TrainingRunResults, modelId: string | null): Promise<void> {
  run.ValidationResults = JSON.stringify(results);
  run.ResultingModelID = modelId;
  run.Status = 'Completed';
  run.CompletedAt = new Date();
  if (!(await run.Save())) throw new Error(`training run ${run.ID} did not complete: ${run.LatestResult?.CompleteMessage}`);
}

/**
 * One training of the pipeline, written the way the trainer writes it (`TrainingEngine`): the run opened, the snapshot
 * stored, the gate record built from the answer before anything else is stored, every returned artifact stored, the
 * model row of what the stored decision ships saved by `ModelVersions.SaveNewRow` (the trainer's transaction around the
 * pipeline lock, the version Query and the save) — none for `no-signal` — then the run completed. When a step after the
 * artifacts are stored throws, the run is completed without a model first, so teardown still finds the stored artifacts
 * through the run's trainer result.
 */
async function train(fix: PipelineFixture, label: string, answerOf: AnswerOf): Promise<TrainedRun> {
  const ctx = registryCtx();
  const run = await startRun(fix);
  const snapshot = await storeSnapshot(fix, label, ctx);
  run.TrainingSnapshotID = snapshot.ID;
  const answer = answerOf(run.ID, fix.Protocol.Spec, `${TAG}:${label}`);
  const gate = gateRecordOf(answer, fix);
  const stored = await storeArtifacts(answer, ctx);
  const fileIds = new Map([...stored].map(([candidate, f]): [string, string] => [candidate, f.fileId]));
  const results = completedResults(TrainerContract.ToStoredTrainerResult(answer, fileIds), gate);
  let modelId: string | null = null;
  try {
    modelId = await saveShippedModel(fix, run.ID, snapshot, answer, gate, stored);
  } catch (error) {
    await completeRun(run, results, null);
    throw error;
  }
  await completeRun(run, results, modelId);
  return { RunID: run.ID, SnapshotID: snapshot.ID, ModelID: modelId };
}

/** The model row of what the stored decision ships, saved as the trainer saves it and recorded; null when the decision is `no-signal`. */
async function saveShippedModel(
  fix: PipelineFixture, runId: string, snapshot: MJMLTrainingSnapshotEntity, answer: TrainerCompleted, gate: StoredGateRecord, stored: ReadonlyMap<string, StoredFile>,
): Promise<string | null> {
  const decision = gate.decision;
  if (decision.outcome === 'no-signal') return null;
  const shipped = stored.get(decision.shipped);
  if (!shipped) throw new Error(`the shipped artifact '${decision.shipped}' was not stored`);
  const model = await newModelRow(fix, runId, snapshot, shipped, registeredDeliveryOf(gate, answer, shipped, fix.Unit.Task));
  await ModelVersions.SaveNewRow(model, registryCtx());
  records.RecordModel(model.ID);
  return model.ID;
}

/** One training of the pipeline that must ship a model ({@link train}); throws when the stored decision ships none. */
async function trainModel(fix: PipelineFixture, label: string, answerOf: AnswerOf): Promise<TrainedModel> {
  const t = await train(fix, label, answerOf);
  if (t.ModelID === null) throw new Error(`the training ${label} shipped no model`);
  return { ...t, ModelID: t.ModelID };
}

/** The binary answer whose model the gate ships (no incumbent). */
function binaryModelWins(runId: string, protocol: EvaluationProtocolSpec, tag: string): TrainerCompleted {
  return GateTrainerAnswers.ModelWins(runId, protocol, tag, null);
}

/** A trained, evaluated (Validated) binary model of the pipeline. */
async function validatedModel(fix: PipelineFixture, label: string, answerOf: AnswerOf = binaryModelWins): Promise<TrainedModel> {
  const m = await trainModel(fix, label, answerOf);
  const outcome = await new LifecycleGate().Evaluate({ modelId: m.ModelID }, human(), gateCtx());
  expect(outcome).toMatchObject({ Kind: 'evaluated', ModelID: m.ModelID, To: 'Validated' });
  return m;
}

/** `work` with both console channels captured: its result, every line (log, then error) and the lines that are not {@link EXPECTED_LINES}. */
async function quietly<T>(work: () => Promise<T>): Promise<{ Result: T; Lines: string[]; Unexpected: string[] }> {
  const errors = await ConsoleCapture.During('error', () => ConsoleCapture.During('log', work));
  const lines = [...errors.Result.Lines, ...errors.Lines];
  return { Result: errors.Result.Result, Lines: lines, Unexpected: lines.filter((l) => !EXPECTED_LINES.some((x) => x.test(l))) };
}

/** The error message `work` fails with, or null when it completes (an adversary's write the database may refuse). */
async function failureOf(work: () => Promise<void>): Promise<string | null> {
  try {
    await work();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** A publish's outcome, or the error it threw as `{ Kind: 'thrown', Message, Stack }` (so a throw is asserted, not lost). */
async function failureOrOutcome(work: () => Promise<PublishOutcome>): Promise<PublishOutcome | { readonly Kind: 'thrown'; readonly Message: string; readonly Stack: string }> {
  try {
    return await work();
  } catch (e) {
    return { Kind: 'thrown', Message: e instanceof Error ? e.message : String(e), Stack: e instanceof Error ? e.stack || '' : '' };
  }
}

/** A publish through the production gate with the console captured; the case asserts the lines. */
function publish(modelId: string, signOffId: string | null = null): Promise<{ Result: PublishOutcome; Lines: string[]; Unexpected: string[] }> {
  return quietly(() => new LifecycleGate().Publish(publishRequest(modelId, signOffId), gateCtx()));
}

/** A sign-off of `modelId` by `signer` (a person), overriding `overridesFlags`, through the production service as that person; throws unless it is recorded. */
async function recordSignOff(modelId: string, signer: UserInfo, overridesFlags: LeakageFlag['kind'][] = []): Promise<{ ID: string; EvidenceSha256: string }> {
  const result = await new SignOffService().Record(
    { modelId, purpose: 'publish', decision: 'approve', reason: 'governance harness: approved', overridesFlags },
    { kind: 'human', userId: signer.ID }, GateContexts.ForRequest({ ContextUser: signer, Provider: server.Provider }),
  );
  if (result.Ok === false) throw new Error(`the sign-off of ${modelId} was refused: ${result.Refusal}`);
  return { ID: result.SignOffRecordID, EvidenceSha256: result.EvidenceSha256 };
}

/**
 * A seeded principal (`metadata-optional/integration-test`) as a real `UserInfo` with its `UserRoles`, built from its
 * `MJ: Users` row and `MJ: User Roles` rows read through the bootstrap's provider (as
 * `artifact-registry.adversarial.db.test.ts` builds the restricted user).
 *
 * @throws when the seed has not been pushed, naming the command that seeds it
 */
async function seededUser(email: string): Promise<UserInfo> {
  const rv = RunView.FromMetadataProvider(server.Provider);
  const users = await rv.RunView<Pick<MJUserEntity, 'ID' | 'Name' | 'Email' | 'Type' | 'IsActive'>>({
    EntityName: 'MJ: Users', ExtraFilter: `Email='${EscapeSQLString(email)}'`, Fields: ['ID', 'Name', 'Email', 'Type', 'IsActive'], ResultType: 'simple',
  }, server.User);
  if (!users.Success) throw new Error(`reading MJ: Users for ${email} failed: ${users.ErrorMessage}`);
  const row = users.Results[0];
  if (!row) throw new Error(`the user ${email} is not seeded: run ${SEED_FIXTURES_COMMAND}`);
  const roles = await rv.RunView<Pick<MJUserRoleEntity, 'UserID' | 'RoleID'>>({
    EntityName: 'MJ: User Roles', ExtraFilter: `UserID='${EscapeSQLString(row.ID)}'`, Fields: ['UserID', 'RoleID'], ResultType: 'simple', BypassCache: true,
  }, server.User);
  if (!roles.Success) throw new Error(`reading MJ: User Roles for ${email} failed: ${roles.ErrorMessage}`);
  return new UserInfo(server.Provider, { ...row, UserRoles: roles.Results.map((r) => new UserRoleInfo({ UserID: r.UserID, RoleID: r.RoleID })) });
}

/**
 * A person who is not the MJ system user and may sign off: the seeded `it-rls-a@integration.test` granted the
 * {@link APPROVER_ROLE} role through an `MJ: User Roles` save (recorded; teardown deletes it). The bootstrap's own user
 * is the MJ system user, which the operation refuses, so the operation's other rules need this principal.
 */
async function approvingHuman(): Promise<UserInfo> {
  approver = approver || grantApprover();
  return approver;
}

/** Grants {@link APPROVER_ROLE} to the seeded person and returns them as a `UserInfo` read back from the rows ({@link approvingHuman} calls it once). */
async function grantApprover(): Promise<UserInfo> {
  const seeded = await seededUser(SEEDED_SCOPED_A_EMAIL);
  const roles = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJRoleEntity, 'ID'>>({
    EntityName: 'MJ: Roles', ExtraFilter: `Name='${EscapeSQLString(APPROVER_ROLE)}'`, Fields: ['ID'], ResultType: 'simple',
  }, server.User);
  const roleId = roles.Results[0]?.ID;
  if (!roles.Success || !roleId) throw new Error(`the ${APPROVER_ROLE} role is not in MJ: Roles: ${roles.ErrorMessage}`);
  const grant = await server.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', server.User);
  grant.NewRecord();
  grant.UserID = seeded.ID;
  grant.RoleID = roleId;
  if (!(await grant.Save())) throw new Error(`granting ${APPROVER_ROLE} to ${SEEDED_SCOPED_A_EMAIL} failed: ${grant.LatestResult?.CompleteMessage}`);
  grantedUserRoleIds.push(grant.ID);
  return seededUser(SEEDED_SCOPED_A_EMAIL);
}

/** Deletes the role grants the file made, through the entity layer. Returns one line per grant that could not be deleted. */
async function revokeGrants(): Promise<string[]> {
  const failures: string[] = [];
  for (const id of grantedUserRoleIds) {
    const grant = await server.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', server.User);
    if (!(await grant.Load(id))) failures.push(`MJ: User Roles ${id}: did not load: ${grant.LatestResult?.CompleteMessage}`);
    else if (!(await grant.Delete())) failures.push(`MJ: User Roles ${id}: ${grant.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
  }
  return failures;
}

/** The server context the MJAPI resolver hands the operation for `user`, with the caller's API-key hash when one is given. */
function opContext(user: UserInfo, apiKeyHash: string | null): RemoteOpServerContext {
  const base: RemoteOpServerContext = { provider: server.Provider, user, emitProgress: () => undefined };
  return apiKeyHash === null ? base : { ...base, apiKeyHash };
}

/** The model's `sign-off` publish records (verification). */
async function signOffRowsOf(modelId: string): Promise<number> {
  return (await recordsOf(modelId)).filter((r) => r.Kind === 'sign-off').length;
}

/**
 * One call of the sign-off operation's server body in-process (`ExecuteServer`, what the resolver runs after its
 * framework gates), with the console captured: the result code, the message, the recorded ID and the sign-off rows the
 * call added to the model (so a row an earlier case wrote under a mutation is not counted again).
 */
async function signOffThroughOp(input: PredictiveStudioSignOffModelInput, context: RemoteOpServerContext): Promise<OpAttempt> {
  const before = await signOffRowsOf(input.modelId);
  const run = await quietly(() => new PredictiveStudioSignOffModelServerOperation().ExecuteServer(input, context));
  return {
    ResultCode: run.Result.ResultCode || null, ErrorMessage: run.Result.ErrorMessage || null, SignOffRecordID: run.Result.Output?.signOffRecordId || null,
    SignOffRowsAdded: (await signOffRowsOf(input.modelId)) - before, Unexpected: run.Unexpected,
  };
}

/** The op's wire input approving a publish of `modelId`, with `overridesFlags` and `reason`. */
function signOffInput(modelId: string, overridesFlags: PredictiveStudioSignOffModelInput['overridesFlags'] = [], reason = 'governance harness: approved'): PredictiveStudioSignOffModelInput {
  return { modelId, purpose: 'publish', decision: 'approve', reason, overridesFlags };
}

/** One save of the binding row `bindingId` with `fill` applied, through a fresh server entity loaded by the bootstrap's provider; validation forced. */
async function saveBinding(bindingId: string, fill: (row: MJMLOutputBindingEntity) => void): Promise<BindingAttempt> {
  const row = await server.Provider.GetEntityObject<MJMLOutputBindingEntity>('MJ: ML Output Bindings', server.User);
  if (!(await row.Load(bindingId))) throw new Error(`output binding ${bindingId} did not load: ${row.LatestResult?.CompleteMessage}`);
  fill(row);
  const saved = await quietly(() => row.Save({ IgnoreDirtyState: true }));
  expect(saved.Unexpected).toEqual([]);
  return { Saved: saved.Result, Message: saved.Result ? '' : row.LatestResult?.CompleteMessage || '' };
}

/** The class name of the entity object the bootstrap's provider builds for `MJ: ML Output Bindings` (the registered subclass). */
async function bindingEntityClassName(): Promise<string> {
  const row = await server.Provider.GetEntityObject<MJMLOutputBindingEntity>('MJ: ML Output Bindings', server.User);
  return row.constructor.name;
}

// ===================================================================================== verification SQL ==

/** One model row (verification); null when it is gone. */
async function modelState(modelId: string): Promise<ModelState | null> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, modelId).query<ModelState>(
    `SELECT ID, Status, TrainingSnapshotID, ArtifactFileID FROM ${tableOf('MJ: ML Models')} WHERE ID = @ID`,
  );
  return r.recordset[0] || null;
}

/** The publish records naming the model, oldest first (verification). */
async function recordsOf(modelId: string): Promise<RecordState[]> {
  const r = await pool.request().input('M', sql.UniqueIdentifier, modelId).query<RecordState>(
    `SELECT ID, Kind, Purpose, ModelID, TrainingRunID, SignOffID, ApproverKind, UserID, EvidenceSha256, Refusal, Reason
     FROM ${tableOf('MJ: ML Model Publish Records')} WHERE ModelID = @M ORDER BY RecordedAt, ID`,
  );
  return r.recordset;
}

/** The model's output binding rows, by surface (verification). */
async function bindingsOf(modelId: string): Promise<BindingState[]> {
  const r = await pool.request().input('M', sql.UniqueIdentifier, modelId).query<BindingState>(
    `SELECT ID, Surface, SortsBy, DriverDirectionRelativeTo, Label FROM ${tableOf('MJ: ML Output Bindings')} WHERE ModelID = @M ORDER BY Surface`,
  );
  return r.recordset;
}

/** One binding row (verification); throws when it is gone. */
async function bindingState(bindingId: string): Promise<BindingState> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, bindingId).query<BindingState>(
    `SELECT ID, Surface, SortsBy, DriverDirectionRelativeTo, Label FROM ${tableOf('MJ: ML Output Bindings')} WHERE ID = @ID`,
  );
  const row = r.recordset[0];
  if (!row) throw new Error(`output binding ${bindingId} is gone`);
  return row;
}

/** A model's `StatusReason` (verification); null when it has none or the row is gone. */
async function modelStatusReason(modelId: string): Promise<string | null> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, modelId).query<Pick<MJMLModelEntity, 'StatusReason'>>(
    `SELECT StatusReason FROM ${tableOf('MJ: ML Models')} WHERE ID = @ID`,
  );
  return r.recordset[0]?.StatusReason || null;
}

/** A Training Snapshot's `ContentHash` (verification); null when the row is gone. */
async function snapshotHash(snapshotId: string): Promise<string | null> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, snapshotId).query<Pick<MJMLTrainingSnapshotEntity, 'ContentHash'>>(
    `SELECT ContentHash FROM ${tableOf('MJ: ML Training Snapshots')} WHERE ID = @ID`,
  );
  return r.recordset[0]?.ContentHash || null;
}

/** A Training Snapshot's three file IDs (verification). */
async function snapshotFiles(snapshotId: string): Promise<SnapshotFiles> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, snapshotId).query<SnapshotFiles>(
    `SELECT MatrixFileID, RowManifestFileID, ProvenanceFileID FROM ${tableOf('MJ: ML Training Snapshots')} WHERE ID = @ID`,
  );
  const row = r.recordset[0];
  if (!row) throw new Error(`Training Snapshot ${snapshotId} is gone`);
  return row;
}

/** A run's stored `ValidationResults` (verification); throws when the run is gone. */
async function runResultsJson(runId: string): Promise<string | null> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, runId).query<Pick<MJMLTrainingRunEntity, 'ValidationResults'>>(
    `SELECT ValidationResults FROM ${tableOf('MJ: ML Training Runs')} WHERE ID = @ID`,
  );
  const row = r.recordset[0];
  if (!row) throw new Error(`training run ${runId} is gone`);
  return row.ValidationResults;
}

/** A model's report columns (verification); throws when the model is gone. */
async function modelReportRow(modelId: string): Promise<Pick<MJMLModelEntity, 'ID' | 'FeatureImportance' | 'Lineage' | 'Status'>> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, modelId).query<Pick<MJMLModelEntity, 'ID' | 'FeatureImportance' | 'Lineage' | 'Status'>>(
    `SELECT ID, FeatureImportance, Lineage, Status FROM ${tableOf('MJ: ML Models')} WHERE ID = @ID`,
  );
  const row = r.recordset[0];
  if (!row) throw new Error(`ML Model ${modelId} is gone`);
  return row;
}

/** How many rows of `entityName` have `ID = id` (verification). */
async function rowCount(entityName: string, id: string): Promise<number> {
  const r = await pool.request().input('ID', sql.UniqueIdentifier, id).query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${tableOf(entityName)} WHERE ID = @ID`);
  return r.recordset[0]?.N || 0;
}

/** The procedure's definition as the database holds it (verification). */
async function storedProcDefinition(): Promise<string> {
  const entities = server.Provider.EntityByName('MJ: Entities');
  if (!entities) throw new Error('MJ: Entities is not in metadata');
  const r = await pool.request().input('Name', sql.NVarChar, `[${entities.SchemaName}].[spDeleteEntityWithCoreDependencies]`)
    .query<{ Definition: string | null }>(`SELECT OBJECT_DEFINITION(OBJECT_ID(@Name)) AS Definition`);
  const def = r.recordset[0]?.Definition;
  if (!def) throw new Error('spDeleteEntityWithCoreDependencies is not in the database');
  return def;
}

/** Row counts and model-artifact objects/directories under the storage root. */
async function census(): Promise<HarnessCensus> {
  const t = (n: string): string => `(SELECT COUNT(*) FROM ${tableOf(n)})`;
  const r = await pool.request().query<Omit<HarnessCensus, 'ArtifactObjects' | 'ArtifactDirectories'>>(`SELECT
    ${t('MJ: ML Models')} AS Models, ${t('MJ: ML Training Runs')} AS Runs, ${t('MJ: ML Training Snapshots')} AS Snapshots,
    ${t('MJ: ML Training Pipelines')} AS Pipelines, ${t('MJ: ML Model Publish Records')} AS PublishRecords,
    ${t('MJ: ML Output Bindings')} AS OutputBindings, ${t('MJ: Scheduled Jobs')} AS ScheduledJobs,
    ${t('MJ: ML Evaluation Protocols')} AS Protocols, ${t('MJ: ML Prediction Units')} AS Units, ${t('MJ: Files')} AS Files,
    ${t('MJ: Entities')} AS Entities, ${t('MJ: User Roles')} AS UserRoles, ${t('MJ: Actions')} AS Actions, ${t('MJ: Action Params')} AS ActionParams,
    (SELECT COUNT(*) FROM ${tableOf('MJ: AI Agent Runs')} WHERE AgentID NOT IN (SELECT ID FROM ${tableOf('MJ: AI Agents')} WHERE Name = N'Memory Manager')) AS AgentRuns,
    (SELECT COUNT(*) FROM ${tableOf('MJ: AI Prompt Runs')} WHERE PromptID NOT IN (SELECT ID FROM ${tableOf('MJ: AI Prompts')}
       WHERE Name LIKE N'Memory Manager - %' OR Name = N'Name Conversation')) AS PromptRuns`);
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

// ======================================================================================== adversary SQL ==

/** Adversary (direct SQL): replaces a Training Snapshot row's `ContentHash`, which no entity save may change. */
async function setSnapshotHashBySql(snapshotId: string, hash: string): Promise<void> {
  await pool.request().input('ID', sql.UniqueIdentifier, snapshotId).input('H', sql.NVarChar(64), hash)
    .query(`UPDATE ${tableOf('MJ: ML Training Snapshots')} SET ContentHash = @H WHERE ID = @ID`);
}

/** Adversary (direct SQL): deletes a Training Snapshot row. */
async function deleteSnapshotBySql(snapshotId: string): Promise<void> {
  await pool.request().input('S', sql.UniqueIdentifier, snapshotId).query(`DELETE FROM ${tableOf('MJ: ML Training Snapshots')} WHERE ID = @S`);
}

/** CodeGen's write (direct SQL, as CodeGen writes it): an Entity row whose table never exists; the delete case only removes the row. */
async function insertScratchEntityBySql(entityId: string): Promise<void> {
  const entities = server.Provider.EntityByName('MJ: Entities');
  if (!entities) throw new Error('MJ: Entities is not in metadata');
  const name = `PSGovernanceDelete${entityId.replace(/-/g, '').slice(0, 12)}`;
  await pool.request()
    .input('ID', sql.UniqueIdentifier, entityId)
    .input('Name', sql.NVarChar(255), name)
    .input('View', sql.NVarChar(255), `vw${name}`)
    .input('Schema', sql.NVarChar(255), entities.SchemaName)
    .query(`INSERT INTO ${tableOf('MJ: Entities')} (ID, Name, BaseTable, BaseView, SchemaName) VALUES (@ID, @Name, @Name, @View, @Schema)`);
}

/** Runs CodeGen's entity delete procedure as CodeGen does: one EXEC in autocommit, so the procedure owns its transaction. */
async function runEntityDelete(entityId: string): Promise<void> {
  const entities = server.Provider.EntityByName('MJ: Entities');
  if (!entities) throw new Error('MJ: Entities is not in metadata');
  await pool.request().input('EntityID', sql.UniqueIdentifier, entityId)
    .query(`EXEC [${entities.SchemaName}].[spDeleteEntityWithCoreDependencies] @EntityID = @EntityID`);
}

/** Text from `start` up to (not including) the first `end` after it; throws when either marker is missing. */
function sliceBetween(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = from < 0 ? -1 : text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`migration marker not found: ${from < 0 ? start : end}`);
  return text.slice(from, to);
}

/** The newest v6 migration that (re)creates the procedure, by file name (Flyway applies them in that order), with its text. */
function newestProcMigration(): { readonly Name: string; readonly Text: string } {
  const named = readdirSync(MIGRATIONS_V6).filter((f) => f.endsWith('.sql')).sort();
  const defining = named.flatMap((f) => {
    const text = readFileSync(new URL(f, MIGRATIONS_V6), 'utf8');
    return text.includes(PROC_MARKER) ? [{ Name: f, Text: text }] : [];
  });
  const newest = defining[defining.length - 1];
  if (!newest) throw new Error('no v6 migration creates spDeleteEntityWithCoreDependencies');
  return newest;
}

// ============================================================================================ lifecycle ==

/** Deletes the files whose referencing rows the adversary's deletes removed (stored object, then row), through the entity store. */
async function deleteOrphanedFiles(): Promise<string[]> {
  if (orphanedFileIds.length === 0) return [];
  const store = HarnessCleanup.EntityStore(server.Provider, server.User);
  const files: CleanupFileRow[] = await store.Files(`ID IN (${orphanedFileIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`);
  const failures: string[] = [];
  for (const f of files) {
    const objectFailure = await store.DeleteStoredObject(f);
    if (objectFailure !== null) failures.push(`stored object of MJ: Files ${f.ID}: ${objectFailure}`);
    else if (!(await f.Delete())) failures.push(`MJ: Files ${f.ID}: ${f.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
  }
  return failures;
}

/** Deletes every row the file created through D4-62's cleanup order and the orphaned files, sweeps its key directories, and requires the starting census. */
async function teardown(): Promise<void> {
  const recorded = await quietly(() => HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(server.Provider, server.User), records));
  const orphans = await quietly(() => deleteOrphanedFiles());
  const grants = await quietly(() => revokeGrants());
  for (const key of storedKeys) {
    const dir = path.dirname(ArtifactObjects.ObjectPath(storageRoot, '(a key the harness stored)', key));
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
  expect(recorded.Result).toEqual([]);
  expect(recorded.Unexpected).toEqual([]);
  expect(orphans.Result).toEqual([]);
  expect(orphans.Unexpected).toEqual([]);
  expect(grants.Result).toEqual([]);
  expect(grants.Unexpected).toEqual([]);
  expect(await census()).toEqual(startCensus);
}

beforeAll(async () => {
  const root = process.env.STORAGE_LOCAL_ROOT?.trim();
  if (!root) throw new Error('STORAGE_LOCAL_ROOT is unset: the harness stores artifacts through the Local File System provider, whose root it names');
  storageRoot = path.resolve(root);
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
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
  binaryUnit = await createUnit('binary', GATE_TASK);
  multiclassUnit = await createUnit('multiclass', MULTICLASS_TASK);
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  try {
    if (server && pool) await teardown();
  } finally {
    // The role grant's delete scheduled a debounced UserCache reload; it would run after the pool closes (clean shutdown).
    UserCache.Instance.Dispose();
    await pool?.close();
    await server?.ClosePool();
  }
}, BOOTSTRAP_TIMEOUT_MS);

// ================================================================================================ cases ==

describe('every binding combination of a C3 (multiclass, two adverse classes) model, saved through MJMLOutputBindingEntityServer', () => {
  /** What one pair attempt did: whether it saved, which fields its refusal named, and whether the stored row kept its default. */
  interface PairOutcome {
    readonly Attempt: string;
    readonly Saved: boolean;
    readonly NamesSortsBy: boolean;
    readonly NamesDirection: boolean;
    readonly RowUnchanged: boolean;
  }

  /** What one label attempt did: whether it saved, whether its refusal named `Label`, and whether the stored row is what it should be after it. */
  interface LabelOutcome {
    readonly Label: string;
    readonly Saved: boolean;
    readonly NamesLabel: boolean;
    readonly RowAsExpected: boolean;
  }

  /** Every (sort × direction) pair tried on `b`'s row: each attempt's outcome. */
  async function tryEveryPair(b: BindingState): Promise<PairOutcome[]> {
    const outcomes: PairOutcome[] = [];
    for (const sortsBy of SORTS) {
      for (const direction of DIRECTIONS) {
        const attempt = await saveBinding(b.ID, (row) => {
          row.SortsBy = sortsBy;
          row.DriverDirectionRelativeTo = direction;
        });
        outcomes.push({
          Attempt: `${b.Surface} ${sortsBy}/${direction}`, Saved: attempt.Saved,
          NamesSortsBy: attempt.Message.includes(`${b.Surface}: SortsBy is ${sortsBy}`),
          NamesDirection: attempt.Message.includes(`${b.Surface}: DriverDirectionRelativeTo is ${direction}`),
          RowUnchanged: JSON.stringify(await bindingState(b.ID)) === JSON.stringify(b),
        });
      }
    }
    return outcomes;
  }

  /** The outcome the rule table gives each pair of `b`'s surface: only the required pair saves; a refusal names each field at fault and leaves the row. */
  function expectedPairs(b: BindingState): PairOutcome[] {
    const required = REQUIRED_PAIRS[b.Surface];
    return SORTS.flatMap((sortsBy) => DIRECTIONS.map((direction): PairOutcome => {
      const ok = sortsBy === required.SortsBy && direction === required.DriverDirectionRelativeTo;
      return {
        Attempt: `${b.Surface} ${sortsBy}/${direction}`, Saved: ok,
        NamesSortsBy: !ok && sortsBy !== required.SortsBy, NamesDirection: !ok && direction !== required.DriverDirectionRelativeTo, RowUnchanged: true,
      };
    }));
  }

  it('output-binding semantics: exactly the rule table\'s pair saves on each surface, every other pair and every label not naming exactly the adverse classes is refused and leaves the row unchanged', async () => {
    expect(await bindingEntityClassName()).toBe('MJMLOutputBindingEntityServer');
    const fix = await createPipeline('c3-bindings', { Unit: multiclassUnit });
    const m = await validatedModel(fix, 'c3', (runId, protocol, tag) => GateTrainerAnswers.MulticlassModelWins(runId, protocol, tag));
    // Evaluate created the four default rows from the stored semantics (the rule table's pairs and label).
    const defaults = await bindingsOf(m.ModelID);
    expect(defaults.map((b) => [b.Surface, b.SortsBy, b.DriverDirectionRelativeTo, b.Label])).toEqual([
      ['at-risk-list', 'adverse-probability-desc', 'adverse-class', MULTICLASS_DEFAULT_LABEL],
      ['predictions-grid', 'adverse-probability-desc', 'adverse-class', MULTICLASS_DEFAULT_LABEL],
      ['record-panel', 'none', 'adverse-class', MULTICLASS_DEFAULT_LABEL],
      ['why-badge', 'none', 'adverse-class', MULTICLASS_DEFAULT_LABEL],
    ]);
    const pairs: PairOutcome[] = [];
    for (const b of defaults) pairs.push(...(await tryEveryPair(b)));
    const saved = pairs.filter((p) => p.Saved).length;
    expect({ Tried: pairs.length, Accepted: saved, Refused: pairs.length - saved }).toEqual({ Tried: 32, Accepted: 4, Refused: 28 });
    expect(pairs).toEqual(defaults.flatMap((b) => expectedPairs(b)));
    // The label swaps on the at-risk list row: only a label naming both adverse classes and no other class saves.
    const atRisk = defaults.find((b) => b.Surface === 'at-risk-list');
    if (!atRisk) throw new Error('no at-risk-list binding');
    const tried: ReadonlyArray<{ readonly Label: string; readonly Saves: boolean }> = [
      { Label: 'Attended risk', Saves: false },
      { Label: 'NoShow risk', Saves: false },
      { Label: 'Cancelled or NoShow risk', Saves: true },
      { Label: 'Review me', Saves: false },
    ];
    const labels: LabelOutcome[] = [];
    for (const l of tried) {
      const before = await bindingState(atRisk.ID);
      const attempt = await saveBinding(atRisk.ID, (row) => {
        row.Label = l.Label;
      });
      const after = await bindingState(atRisk.ID);
      labels.push({
        Label: l.Label, Saved: attempt.Saved, NamesLabel: attempt.Message.includes(`at-risk-list: Label is "${l.Label}"`),
        RowAsExpected: attempt.Saved ? after.Label === l.Label : JSON.stringify(after) === JSON.stringify(before),
      });
    }
    const labelsSaved = labels.filter((l) => l.Saved).length;
    expect({ Tried: labels.length, Accepted: labelsSaved, Refused: labels.length - labelsSaved }).toEqual({ Tried: 4, Accepted: 1, Refused: 3 });
    expect(labels).toEqual(tried.map((l): LabelOutcome => ({ Label: l.Label, Saved: l.Saves, NamesLabel: !l.Saves, RowAsExpected: true })));
    // Restore the default label (a label naming both adverse classes in class order saves).
    expect((await saveBinding(atRisk.ID, (row) => {
      row.Label = MULTICLASS_DEFAULT_LABEL;
    })).Saved).toBe(true);
    expect(await bindingsOf(m.ModelID)).toEqual(defaults);
  });
});

describe('a sign-off over evidence that changed — a protocol requiring a human sign-off, a sign-off made, then the snapshot hash changed by SQL', () => {
  it('sign-off evidence: a publish naming a sign-off made over a snapshot hash since changed is refused no-sign-off, and the same sign-off publishes once the hash is restored', async () => {
    const fix = await createPipeline('sign-off-evidence', { RequiresHumanSignOff: true });
    expect(fix.Protocol.Spec.promotion.requiresHumanSignOff).toBe(true);
    const m = await validatedModel(fix, 'evidence');
    // An automatic publish (no sign-off) under a protocol that requires one is refused.
    const automatic = await publish(m.ModelID);
    expect(automatic.Unexpected).toEqual([]);
    expect(automatic.Result).toMatchObject({ Kind: 'withheld', ModelID: m.ModelID, Status: 'Validated', Refusal: { kind: 'no-sign-off' } });
    const signer = await approvingHuman();
    expect(WellKnownUserSource.Instance.IsSystemUser(signer)).toBe(false);
    const signOff = await recordSignOff(m.ModelID, signer);
    const stored = (await recordsOf(m.ModelID)).filter((r) => r.Kind === 'sign-off');
    expect(stored.map((r) => [r.ID, r.EvidenceSha256, UUIDsEqual(r.UserID, signer.ID)])).toEqual([[signOff.ID, signOff.EvidenceSha256, true]]);
    const original = await snapshotHash(m.SnapshotID);
    if (original === null) throw new Error('the model\'s snapshot is gone');
    // Adversary (direct SQL): the snapshot the evidence was built from now stores another content hash.
    await setSnapshotHashBySql(m.SnapshotID, sha256Hex(`${TAG}:tampered`));
    const tampered = await publish(m.ModelID, signOff.ID);
    expect(tampered.Unexpected).toEqual([]);
    expect(tampered.Result).toMatchObject({ Kind: 'withheld', ModelID: m.ModelID, Status: 'Validated', Refusal: { kind: 'no-sign-off' } });
    expect((await modelState(m.ModelID))?.Status).toBe('Validated');
    const afterTamper = await recordsOf(m.ModelID);
    expect(afterTamper.map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish'], ['sign-off', 'publish'], ['refusal', 'publish']]);
    // The refusal record of the attempt names the model, its run and the refusal, and consumed no sign-off.
    const refusal = afterTamper[2];
    expect([UUIDsEqual(refusal.TrainingRunID, m.RunID), refusal.SignOffID, JsonParse.ParseJsonText(refusal.Refusal, 'Refusal')]).toEqual([true, null, { Ok: true, Value: { kind: 'no-sign-off' } }]);
    // Adversary (direct SQL): the hash restored; the same sign-off now matches the rebuilt evidence.
    await setSnapshotHashBySql(m.SnapshotID, original);
    const restored = await publish(m.ModelID, signOff.ID);
    expect(restored.Unexpected).toEqual([]);
    expect(restored.Result).toMatchObject({ Kind: 'published', ModelID: m.ModelID, Replaces: null, Approver: 'user' });
    expect((await modelState(m.ModelID))?.Status).toBe('Published');
    const published = (await recordsOf(m.ModelID)).filter((r) => r.Kind === 'publish');
    // The publish consumed the person's sign-off (SignOffID; the sign-off row names the signer). Its approver is the
    // interactive initiator, as `LifecycleGate.approverOf` makes an interactive publisher the approver.
    expect(published.map((r) => [UUIDsEqual(r.SignOffID, signOff.ID), r.ApproverKind, UUIDsEqual(r.UserID, server.User.ID), r.EvidenceSha256])).toEqual([[true, 'user', true, signOff.EvidenceSha256]]);
  });
});

describe('non-human and unauthorised sign-offs through the PredictiveStudio.SignOffModel operation', () => {
  /** The operation's refusal words for a caller that is not a person. */
  const NOT_HUMAN_MESSAGE = 'Only a person can sign off a model: an API-key caller or the system user cannot.';
  let model: TrainedModel;
  let person: UserInfo;

  beforeAll(async () => {
    const fix = await createPipeline('op-sign-off');
    model = await validatedModel(fix, 'op');
    person = await approvingHuman();
    // The bootstrap's user is the MJ system user; the person is a person with update permission on MJ: ML Models.
    expect([WellKnownUserSource.Instance.IsSystemUser(server.User), WellKnownUserSource.Instance.IsSystemUser(person)]).toEqual([true, false]);
    const models = server.Provider.EntityByName('MJ: ML Models');
    if (!models) throw new Error('MJ: ML Models is not in metadata');
    expect(models.GetUserPermisions(person).CanUpdate).toBe(true);
  });

  it('non-human sign-off: (i) a call with an MJ API key, as a permitted person, is refused NOT_HUMAN and writes no row', async () => {
    const attempt = await signOffThroughOp(signOffInput(model.ModelID), opContext(person, sha256Hex(`${TAG}:api-key`)));
    expect(attempt).toEqual({ ResultCode: 'NOT_HUMAN', ErrorMessage: NOT_HUMAN_MESSAGE, SignOffRecordID: null, SignOffRowsAdded: 0, Unexpected: [] });
  });

  it('non-human sign-off: (ii) a call as the MJ system user is refused NOT_HUMAN and writes no row', async () => {
    const system = await WellKnownUserSource.Instance.GetSystemUser(server.Provider);
    if (system === null) throw new Error('the MJ system user is not available through the provider');
    expect(WellKnownUserSource.Instance.IsSystemUser(system)).toBe(true);
    const attempt = await signOffThroughOp(signOffInput(model.ModelID), opContext(system, null));
    expect(attempt).toEqual({ ResultCode: 'NOT_HUMAN', ErrorMessage: NOT_HUMAN_MESSAGE, SignOffRecordID: null, SignOffRowsAdded: 0, Unexpected: [] });
  });

  it('unauthorised sign-off: (iii) a call as the suite\'s restricted user (no permission on MJ: ML Models) is refused and writes no row', async () => {
    const restricted = await seededUser(SEEDED_NOGRANT_EMAIL);
    const models = server.Provider.EntityByName('MJ: ML Models');
    if (!models) throw new Error('MJ: ML Models is not in metadata');
    expect([WellKnownUserSource.Instance.IsSystemUser(restricted), models.GetUserPermisions(restricted).CanRead, models.GetUserPermisions(restricted).CanUpdate]).toEqual([false, false, false]);
    const attempt = await signOffThroughOp(signOffInput(model.ModelID), opContext(restricted, null));
    expect([attempt.SignOffRecordID, attempt.SignOffRowsAdded]).toEqual([null, 0]);
    expect([attempt.ResultCode, attempt.ErrorMessage]).toEqual(['EXECUTION_ERROR', expect.stringContaining('does not have read permissions on MJ: ML Models')]);
    expect(attempt.Unexpected.filter((l) => !l.includes('does not have read permissions on MJ: ML Models'))).toEqual([]);
  });

  it('overrides without a reason: (iv) a person\'s sign-off overriding single-feature-auc with a blank reason is refused OVERRIDES_WITHOUT_REASON and writes no row', async () => {
    const attempt = await signOffThroughOp(signOffInput(model.ModelID, ['single-feature-auc'], ''), opContext(person, null));
    expect(attempt).toEqual({ ResultCode: 'OVERRIDES_WITHOUT_REASON', ErrorMessage: 'A sign-off that overrides leakage flags needs a reason.', SignOffRecordID: null, SignOffRowsAdded: 0, Unexpected: [] });
  });

  it('the control: the same person\'s well-formed sign-off through the operation is recorded, once, as that person\'s', async () => {
    const attempt = await signOffThroughOp(signOffInput(model.ModelID), opContext(person, null));
    expect([attempt.ResultCode, attempt.ErrorMessage, attempt.SignOffRowsAdded, attempt.Unexpected]).toEqual(['SUCCESS', null, 1, []]);
    const row = (await recordsOf(model.ModelID)).find((r) => UUIDsEqual(r.ID, attempt.SignOffRecordID));
    expect(row && [row.Kind, row.Purpose, row.ApproverKind, UUIDsEqual(row.UserID, person.ID)]).toEqual(['sign-off', 'publish', 'user', true]);
  });
});

describe('deleted parent or child — a model\'s entity deleted, a signed-off model\'s snapshot deleted', () => {
  it("deleting a model's entity removes its output bindings first", async () => {
    // The order claim, statically: in the newest migration that (re)creates the procedure, and in the procedure the
    // database holds, the output-binding delete precedes the model delete.
    const migration = newestProcMigration();
    expect(migration.Name).toBe('V202611131725__v6.3.x__PS_Honest_Serving_Schema.sql');
    const proc = sliceBetween(migration.Text, PROC_MARKER, '\nGO');
    const [bindingAt, modelAt] = [proc.indexOf(BINDING_DELETE), proc.indexOf(MODEL_DELETE)];
    expect(bindingAt).toBeGreaterThan(0);
    expect(modelAt).toBeGreaterThan(bindingAt);
    const entities = server.Provider.EntityByName('MJ: Entities');
    if (!entities) throw new Error('MJ: Entities is not in metadata');
    const live = await storedProcDefinition();
    const [liveBindingAt, liveModelAt] = [live.indexOf(`DELETE FROM [${entities.SchemaName}].[MLOutputBinding]`), live.indexOf(`DELETE FROM [${entities.SchemaName}].[MLModel] `)];
    expect(liveBindingAt).toBeGreaterThan(0);
    expect(liveModelAt).toBeGreaterThan(liveBindingAt);
    // The doomed target entity, its pipeline and a model whose Evaluate created its four binding rows.
    const entityId = randomUUID();
    await insertScratchEntityBySql(entityId);
    const fix = await createPipeline('doomed-entity', { TargetEntityID: entityId });
    const m = await validatedModel(fix, 'doomed');
    expect((await bindingsOf(m.ModelID)).length).toBe(4);
    const model = await modelState(m.ModelID);
    if (model === null || model.ArtifactFileID === null) throw new Error('the doomed model has no artifact file');
    const files = await snapshotFiles(m.SnapshotID);
    // The procedure removes the rows that name the files, not the files: teardown deletes them.
    orphanedFileIds.push(model.ArtifactFileID, files.MatrixFileID, files.RowManifestFileID, files.ProvenanceFileID);
    const deleted = await quietly(() => runEntityDelete(entityId));
    expect(deleted.Unexpected).toEqual([]);
    expect(await bindingsOf(m.ModelID)).toEqual([]);
    expect(await modelState(m.ModelID)).toBeNull();
    expect([await rowCount('MJ: ML Training Pipelines', fix.PipelineID), await rowCount('MJ: ML Training Runs', m.RunID), await rowCount('MJ: ML Training Snapshots', m.SnapshotID), await rowCount('MJ: Entities', entityId)]).toEqual([0, 0, 0, 0]);
  });

  /**
   * Adversary (direct SQL): delete the model's Training Snapshot row. The database refuses while the model names it, so
   * the adversary detaches the model and its run first and deletes the snapshot in one transaction. Its three files are
   * left for teardown.
   */
  async function deleteModelSnapshot(m: TrainedModel): Promise<void> {
    const files = await snapshotFiles(m.SnapshotID);
    const refused = await failureOf(() => deleteSnapshotBySql(m.SnapshotID));
    expect(refused).toContain('FK_MLModel_TrainingSnapshot');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx).input('M', sql.UniqueIdentifier, m.ModelID).query(`UPDATE ${tableOf('MJ: ML Models')} SET TrainingSnapshotID = NULL WHERE ID = @M`);
    await new sql.Request(tx).input('R', sql.UniqueIdentifier, m.RunID).query(`UPDATE ${tableOf('MJ: ML Training Runs')} SET TrainingSnapshotID = NULL WHERE ID = @R`);
    await new sql.Request(tx).input('S', sql.UniqueIdentifier, m.SnapshotID).query(`DELETE FROM ${tableOf('MJ: ML Training Snapshots')} WHERE ID = @S`);
    await tx.commit();
    orphanedFileIds.push(files.MatrixFileID, files.RowManifestFileID, files.ProvenanceFileID);
    expect(await snapshotHash(m.SnapshotID)).toBeNull();
  }

  /**
   * A publish naming `signOffId` of a model whose snapshot is gone is refused not-servable (not thrown, D4-128): the model
   * stays Validated, nothing is published, and the attempt's refusal record and StatusReason name the missing snapshot.
   * Returns the model's publish records after it.
   */
  async function expectRefusedWithoutSnapshot(m: TrainedModel, signOffId: string): Promise<RecordState[]> {
    const outcome = await quietly(() => failureOrOutcome(() => new LifecycleGate().Publish(publishRequest(m.ModelID, signOffId), gateCtx())));
    expect(outcome.Unexpected).toEqual([]);
    expect((await modelState(m.ModelID))?.Status).toBe('Validated');
    expect((await recordsOf(m.ModelID)).filter((r) => r.Kind === 'publish')).toEqual([]);
    const reason = `ML Model ${m.ModelID} names no Training Snapshot to build evidence from`;
    expect(outcome.Result.Kind === 'thrown' ? outcome.Result : null).toBeNull();
    expect(outcome.Result).toMatchObject({ Kind: 'withheld', ModelID: m.ModelID, Status: 'Validated', Transient: false, Refusal: { kind: 'not-servable', reason } });
    const recs = await recordsOf(m.ModelID);
    const last = recs[recs.length - 1];
    expect([last.Kind, last.Purpose, last.SignOffID, JsonParse.ParseJsonText(last.Refusal, 'Refusal')]).toEqual(['refusal', 'publish', null, { Ok: true, Value: { kind: 'not-servable', reason } }]);
    expect(await modelStatusReason(m.ModelID)).toBe(`Publish withheld: The model cannot be served: ${reason}`);
    return recs;
  }

  it('evidence of a deleted snapshot is refused at recomputation', async () => {
    const fix = await createPipeline('snapshot-gone');
    const m = await validatedModel(fix, 'snapshot-gone');
    const signOff = await recordSignOff(m.ModelID, await approvingHuman());
    await deleteModelSnapshot(m);
    const recs = await expectRefusedWithoutSnapshot(m, signOff.ID);
    expect(recs.map((r) => [r.Kind, r.Purpose])).toEqual([['sign-off', 'publish'], ['refusal', 'publish']]);
  });

  it('evidence of a deleted snapshot is refused at recomputation: a leakage-flagged model whose sign-off overrides the flag is refused not-servable before the leakage check builds evidence', async () => {
    const fix = await createPipeline('snapshot-gone-flagged');
    const flag: LeakageFlag = { kind: 'single-feature-auc', sourceColumn: 'EventsAttended', heldOutAuc: 0.97 };
    const m = await validatedModel(fix, 'snapshot-gone-flagged', (runId, protocol, tag) => ({ ...GateTrainerAnswers.ModelWins(runId, protocol, tag, null), leakageFlags: [flag] }));
    // The control, while the snapshot is there: a publish naming no sign-off is refused for the unacknowledged flag.
    const control = await publish(m.ModelID);
    expect(control.Unexpected).toEqual([]);
    expect(control.Result).toMatchObject({ Kind: 'withheld', ModelID: m.ModelID, Status: 'Validated', Refusal: { kind: 'unacknowledged-leakage-flags', flags: ['single-feature-auc'] } });
    const signOff = await recordSignOff(m.ModelID, await approvingHuman(), ['single-feature-auc']);
    await deleteModelSnapshot(m);
    const recs = await expectRefusedWithoutSnapshot(m, signOff.ID);
    expect(recs.map((r) => [r.Kind, r.Purpose])).toEqual([['refusal', 'publish'], ['sign-off', 'publish'], ['refusal', 'publish']]);
  });
});

describe('a report for a run whose stored holdout lacks a secondary metric', () => {
  /** A number the report rendered beside what the stored row it names holds at its path, re-read by SQL. */
  interface Recomputation {
    readonly Path: string;
    readonly Value: number;
    readonly Recomputed: number | null;
  }

  /** The report of the stored rows (read by SQL) and every number it renders recomputed from the row it names. */
  async function reportOf(runId: string, modelId: string | null): Promise<{ Report: ExperimentReport; Recomputed: Recomputation[] }> {
    const runJson = await runResultsJson(runId);
    const model = modelId === null ? null : await modelReportRow(modelId);
    const input = ExperimentReports.InputFromRows({
      Name: `${TAG} report`, Goal: 'Governance harness report', TargetVariable: 'IsActive', TargetMetric: 'log-loss',
      Run: { ID: runId, ValidationResults: runJson }, Model: model,
    });
    const report = ExperimentReports.GenerateMarkdownReport(input);
    const recomputed = report.Numbers.map((n): Recomputation => {
      const fromRun = n.Source.EntityName === 'MJ: ML Training Runs' && UUIDsEqual(n.Source.RecordID, runId);
      const fromModel = model !== null && n.Source.EntityName === ExperimentReports.ModelEntityName && UUIDsEqual(n.Source.RecordID, model.ID);
      const json = fromRun ? runJson : fromModel ? model.FeatureImportance : null;
      return { Path: n.Source.Path, Value: n.Value, Recomputed: json === null ? null : TracedNumbers.Recompute(n, json) };
    });
    return { Report: report, Recomputed: recomputed };
  }

  /** The report lines that name a secondary metric (the protocol's secondaries of either task, or the word itself). */
  function secondaryLines(markdown: string): string[] {
    return markdown.split('\n').filter((l) => /\b(secondary|auc|brier|accuracy|f1|precision|recall|calibration-slope)\b/i.test(l));
  }

  it('report without secondary metrics (multiclass): the shipped model\'s report renders, holds no secondary-metric line, and every number recomputes from its stored row', async () => {
    const fix = await createPipeline('report-no-secondary', { Unit: multiclassUnit });
    const m = await validatedModel(fix, 'no-secondary', (runId, protocol, tag) => {
      const base = GateTrainerAnswers.MulticlassModelWins(runId, protocol, tag);
      return { ...base, holdout: { primary: base.holdout.primary, secondary: [] } };
    });
    expect(JsonParse.ParseJsonText(await runResultsJson(m.RunID), 'ValidationResults')).toMatchObject({ Ok: true, Value: { trainer: { holdout: { secondary: [] } } } });
    const { Report, Recomputed } = await reportOf(m.RunID, m.ModelID);
    // The report prints no secondary metric at all (stored or not), so it holds no secondary-metric line to say "not measured" on.
    expect(secondaryLines(Report.Markdown)).toEqual([]);
    expect(Report.Numbers.length).toBeGreaterThan(0);
    expect(Recomputed.filter((r) => r.Recomputed !== r.Value)).toEqual([]);
  });

  it('report without secondary metrics (binary): the gate ships nothing without the AUC secondary, and the report of that run renders the refusal and recomputes every number', async () => {
    const fix = await createPipeline('report-no-auc');
    const t = await train(fix, 'no-auc', (runId, protocol, tag) => GateTrainerAnswers.ModelWinsWithoutSecondary(runId, protocol, tag));
    // A binary model's holdout AUC interval is a gate guard input: without it the stored decision is no-signal.
    expect(t.ModelID).toBeNull();
    expect(JsonParse.ParseJsonText(await runResultsJson(t.RunID), 'ValidationResults')).toMatchObject({
      Ok: true, Value: { trainer: { holdout: { secondary: [] } }, gate: { decision: { outcome: 'no-signal' }, guardRefusal: { kind: 'auc-interval-missing' } } },
    });
    const { Report, Recomputed } = await reportOf(t.RunID, null);
    expect(Report.Markdown).toContain('No model shipped');
    // The one line naming the secondary metric is the stored guard refusal saying it was not measured.
    expect(secondaryLines(Report.Markdown)).toEqual(['- **Why**: The trainer reported no AUC interval for the model, so it cannot be shown to beat a coin flip; nothing ships.']);
    expect(Recomputed.filter((r) => r.Recomputed !== r.Value)).toEqual([]);
  });

  it('report without a trainer result: a completed run whose trainer member is null renders "not measured" and renders no number', async () => {
    const fix = await createPipeline('report-no-trainer');
    const run = await startRun(fix);
    await completeRun(run, completedResults(null, null), null);
    const { Report, Recomputed } = await reportOf(run.ID, null);
    expect(Report.Markdown).toContain('Selection score: not measured.');
    expect(Report.Markdown).toContain('**log-loss** = **not measured**');
    expect(Report.Markdown).toContain('Leakage audit: not run.');
    expect([Report.Numbers.length, Recomputed.length]).toEqual([0, 0]);
  });
});
