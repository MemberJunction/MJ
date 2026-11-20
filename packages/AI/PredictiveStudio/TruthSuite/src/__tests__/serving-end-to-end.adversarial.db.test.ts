// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// Task M8.5's adversarial harness (D-071): the cells that cross milestones, one `describe` per cell, each `it` named
// for the claim it tries to break. Everything runs through the production services: models trained by
// `PredictiveStudio.TrainModel` on the truth sidecar, every status change through `LifecycleGate`, every prediction
// written by `ScoringService` through a scoring binding, monitoring by `PredictiveStudioModelMonitoringJobDriver` with
// its production store, withdrawal by `ScoringBindings.Withdraw`, the retention sweep by `PredictionRetention`, the
// record panel's batch by Core's `PredictionPanelQueries`, a person's Feature Value by PR 1's
// `FeatureValueCacheService`, and the entity delete by `spDeleteEntityWithCoreDependencies`. Only the monitoring clock
// is fixed; no seam replaces a service, so no input production refuses is dropped. The adversary's writes are SQL,
// labelled where they happen: a person's value typed into a bound column, a Feature Pipeline's value (a row no entity
// save shapes without running the pipeline), and the entity delete run inside a transaction that is rolled back so the
// shared truth-suite entity survives.
//
// Fixtures: the D1c scenario (periods 0–2 train; 3–5 are scored through bindings as of each period's 1 January) with
// a weak model W (without EngagementZ) and a strong model S (with it), so the predecessor relation can be set up in
// either direction; and the W9-multiclass world, whose `W9_EventRegistration` fields are updatable, for the column
// copy (its `TruthScore` column is the copy target; the original values are restored in teardown). Teardown deletes
// what the file created and requires the starting census.
//
// Cells (M8.5 Step 1):
//   1. M5 × M6      a binding whose model monitoring rolls back
//   2. M3 × M6      a publish, a rival publish and an automatic rollback of one pipeline from three Promise.all scopes
//   3. M5 × M5b     a withdrawn binding through scoring, the panel's read and the retention sweep
//   4. M5 × PR 1    a person's value in a binding's column through a scoring run and the withdrawal, and one on a
//                   pipeline target
//   5. M1 × M5 × M6 an entity deleted after it holds publish records, scoring runs, monitoring results, output
//                   bindings, Model, Human and Pipeline rows (last: it reads the rows the cells above wrote)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { DatabaseProviderBase, RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import {
  PredictiveStudioTrainModelOperation,
  type MJMLAlgorithmEntity,
  type MJMLModelEntity,
  type MJMLModelPublishRecordEntity,
  type MJMLModelScoringBindingEntity,
  type MJMLMonitoringResultEntity,
  type MJMLScoringRunEntity,
  type MJMLTrainingPipelineEntity,
  type MJRecordProcessEntity,
  type MJvwLatestFeatureValuesEntity,
} from '@memberjunction/core-entities';
import { FeatureValueCacheService } from '@memberjunction/feature-pipelines';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
  EvaluationProtocolVersioning, GateContexts, LifecycleGate, MetadataEntityFactory, MonitoringJobs, MonitoringPeriods, PredictionRetention,
  PredictionUnitVersioning, PredictiveStudioModelMonitoringJobDriver, PredictiveStudioScoringStartup, ProtocolDefaults, ProviderAssemblyMetadata,
  RunViewDataAccess, RunViewPredictionUnitStore, ScoringBindings, ScoringService, type GateContext, type MonitoringContext, type MonitoringPeriod,
  type MonitoringRunOutcome, type PublishOutcome,
} from '@memberjunction/predictive-studio';
import {
  EvaluationProtocol, EvaluationProtocolRules, JsonParse, MonitoringResultSchemas, PredictionPanelQueries, PredictionUnit, UtcDay,
  type Actor, type MonitoringJobReadSpec, type PredictionUnitSpec, type RetrainTrigger, type ScoringResult, type TaskType, type UnitDraft,
} from '@memberjunction/predictive-studio-core';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { DatasetLoader } from '../db/dataset-loader';
import { DatasetSeeds } from '../data/seeds';
import { HarnessCleanup, RunRecords } from '../harness/cleanup';
import { HarnessSidecar } from '../harness/sidecar';
import type { LoadedDataset } from '../harness/types';
import { ConsoleCapture } from './fixtures/console-capture';

const TAG = `PSTruth: M8.5 ${Date.now()}`;
const BOOTSTRAP_TIMEOUT_MS = 120_000;
const CASE_TIMEOUT_MS = 900_000;
const TEARDOWN_TIMEOUT_MS = 600_000;
const BINARY: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const MULTICLASS: TaskType = { kind: 'multiclass', classOrder: ['Attended', 'Cancelled', 'NoShow'], adverseIndices: [2] };
/** The monitoring clock: years after every D1c period, so each period's one-day label window has closed. */
const MONITORING_NOW = new Date(Date.UTC(2026, 0, 1));
const WEAK_FEATURES = ['TenureZ', 'AutoRenew'] as const;
const STRONG_FEATURES = ['EngagementZ', 'TenureZ', 'AutoRenew'] as const;
/** Records of W9 the column cells copy into (the first by ID); their `TruthScore` is restored in teardown. */
const COPY_RECORDS = 6;

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let startedAt: Date;
let startCensus: Census;
const records = new RunRecords();
/** The W9 `TruthScore` values the column cells overwrite, by record ID, restored in teardown. */
const truthScores = new Map<string, number | null>();

/** The D1c fixture: the pipeline, its weak and strong models, the binding every D1c cell scores through. */
interface D1cFixture {
  readonly Dataset: LoadedDataset;
  readonly Pipeline: MJMLTrainingPipelineEntity;
  /** Trained without EngagementZ (the scenario's strongest input). */
  readonly Weak: MJMLModelEntity;
  /** Trained with it; published over the weak model. */
  readonly Strong: MJMLModelEntity;
  readonly Binding: MJMLModelScoringBindingEntity;
}
let d1c: D1cFixture;

/** The tables the file writes, counted at start and after teardown. */
interface Census {
  readonly Models: number;
  readonly Results: number;
  readonly FeatureValues: number;
  readonly Bindings: number;
  readonly Jobs: number;
  readonly PublishRecords: number;
  readonly ScoringRuns: number;
}

/** One `MJ: ML Model Publish Records` row as the race cell reads it. */
type RecordRow = Pick<MJMLModelPublishRecordEntity, 'ID' | 'ModelID' | 'TrainingRunID' | 'Kind' | 'Purpose' | 'ReplacesModelID' | 'RecordedAt'>;

/** One stored prediction as the cells read it. */
type ModelRow = Pick<MJvwLatestFeatureValuesEntity, 'ID' | 'RecordID' | 'MLModelID' | 'MLScoringRunID' | 'EffectiveAsOf'>;

/** The serving rows of the doomed entity counted inside the delete's transaction, before and after the procedure. */
interface DeleteCounts {
  readonly Phase: 'before' | 'after';
  readonly PublishRecords: number;
  readonly ScoringRuns: number;
  readonly MonitoringResults: number;
  readonly OutputBindings: number;
  readonly Bindings: number;
  readonly ModelRows: number;
  readonly HumanRows: number;
  readonly PipelineRows: number;
  readonly Models: number;
  readonly Pipelines: number;
  readonly Entities: number;
  /** Feature Values of every other entity (must not move). */
  readonly OtherFeatureValues: number;
  /** Models of pipelines that target another entity (must not move). */
  readonly OtherModels: number;
}

/** `[schema].[table]` of an entity. */
function t(entityName: string): string {
  const e = server.Provider.EntityByName(entityName);
  if (!e) throw new Error(`${entityName} is not in metadata`);
  return `[${e.SchemaName}].[${e.BaseTable}]`;
}

function human(): Actor {
  return { kind: 'human', userId: server.User.ID };
}

function gateCtx(provider: IMetadataProvider = server.Provider, user: UserInfo = server.User): GateContext {
  return GateContexts.ForRequest({ ContextUser: user, Provider: provider });
}

/** 1 January of D1c period `p` (one calendar year per period). */
function dayOf(p: number): Date {
  return new Date(Date.UTC(2019 + p, 0, 1));
}

/** The monthly monitoring period holding D1c period `p`'s decision date. */
function periodOf(p: number): MonitoringPeriod {
  return MonitoringPeriods.Containing(dayOf(p), 'month');
}

/** A monitoring context of the production store and scorer, the clock at {@link MONITORING_NOW}, as the file's user. */
function monitoringCtx(provider: IMetadataProvider = server.Provider): { readonly Driver: PredictiveStudioModelMonitoringJobDriver; readonly Ctx: MonitoringContext } {
  const driver = new PredictiveStudioModelMonitoringJobDriver({ Clock: { Now: () => MONITORING_NOW } });
  return { Driver: driver, Ctx: driver.ContextFor(server.User, provider, null) };
}

/**
 * The console lines a case may produce on purpose: SQL Server's NOWAIT refusal while the gate waits for a held publish
 * lock, the post-commit and scoring-Action lines of an applied publish, and MJ's ClassFactory falling back to
 * `BaseEntity` for a truth-suite world table (no generated subclass is kept in the tree for `pstruth` entities).
 */
const EXPECTED_LINES: readonly RegExp[] = [
  /Lock request time out period exceeded/,
  /^Running \d+ post-commit task\(s\) after transaction commit$/,
  /^ModelScoringActionGenerator: (ensured|disabled) scoring action 'Score with PSTruth: M8\.5 /,
  /^ClassFactory: no registration found for base class 'BaseEntity' with key 'PS Truth: W9_EventRegistration'/,
];

/** Runs `work` with the console's log, warn and error channels captured; the lines no {@link EXPECTED_LINES} entry matches are `Unexpected` (a case requires none). */
async function quietly<T>(work: () => Promise<T>): Promise<{ readonly Result: T; readonly Unexpected: string[] }> {
  const warned = await ConsoleCapture.During('warn', () => ConsoleCapture.During('error', () => ConsoleCapture.During('log', work)));
  const lines = [...warned.Result.Result.Lines, ...warned.Result.Lines, ...warned.Lines];
  return { Result: warned.Result.Result.Result, Unexpected: lines.filter((l) => !EXPECTED_LINES.some((x) => x.test(l))) };
}

/** Independent provider instances this file created, released in teardown. */
const instances: DatabaseProviderBase[] = [];

/**
 * A provider sharing the pool and metadata with its own transaction stack: one per concurrent caller, as MJAPI's
 * per-request providers and each scheduled job's run. Concurrent callers on ONE provider instance do not get their own
 * transactions — the provider joins a second caller's transaction to the first as a savepoint — so a race between
 * callers must give each its own instance.
 */
async function ownProvider(): Promise<DatabaseProviderBase> {
  const p = server.Provider;
  if (!(p instanceof DatabaseProviderBase)) throw new Error('the DB lane bootstrap did not install a database provider');
  const own = await p.CreateIndependentInstance();
  instances.push(own);
  return own;
}

/** The model's open monitoring job's spec with retraining off and a rollback whenever the predecessor wins one period. */
async function rollbackSpecOf(modelId: string): Promise<MonitoringJobReadSpec> {
  const configuration = await MonitoringJobs.OpenJobConfiguration(modelId, { ContextUser: server.User, Provider: server.Provider });
  const parsed = MonitoringResultSchemas.ParseJobSpec(configuration);
  if (parsed.Ok === false) throw new Error(`no monitoring spec for ${modelId}: ${parsed.Errors.join('; ')}`);
  return { ...parsed.Value, retrainTriggers: [], rollback: { kind: 'previous-beats-current', margin: EvaluationProtocol.ToNonNegative(0), consecutivePeriods: 1 } };
}

async function rows<T>(entityName: string, filter: string, fields: string[], orderBy?: string): Promise<T[]> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, OrderBy: orderBy, ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true }, server.User);
  if (!r.Success) throw new Error(`reading ${entityName} failed: ${r.ErrorMessage}`);
  return r.Results;
}

async function statusOf(modelId: string): Promise<string | null> {
  const [m] = await rows<{ Status: string }>('MJ: ML Models', `ID='${EscapeSQLString(modelId)}'`, ['Status']); // pk-filter-ok: MJ core entity keyed by ID
  return m ? m.Status : null;
}

async function publishedOf(pipelineId: string): Promise<string[]> {
  return (await rows<{ ID: string }>('MJ: ML Models', `PipelineID='${EscapeSQLString(pipelineId)}' AND Status='Published'`, ['ID'])).map((r) => r.ID);
}

/** The binding's `Champion` `Model` rows of `recordId`, oldest as-of date first. */
async function championRowsOf(bindingId: string, recordId: string): Promise<ModelRow[]> {
  return rows<ModelRow>('MJ: Feature Values', `MLModelScoringBindingID='${EscapeSQLString(bindingId)}' AND RecordID='${EscapeSQLString(recordId)}' AND Source='Model' AND Role='Champion'`,
    ['ID', 'RecordID', 'MLModelID', 'MLScoringRunID', 'EffectiveAsOf'], 'EffectiveAsOf ASC');
}

async function modelRowCount(bindingId: string): Promise<number> {
  const r = await pool.request().input('BindingID', sql.UniqueIdentifier, bindingId)
    .query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${t('MJ: Feature Values')} WHERE MLModelScoringBindingID = @BindingID AND Source = 'Model'`);
  return r.recordset[0].N;
}

/** The `RollbackCheck.kind` and `recordId` of the model's period row; nulls when there is no row or no check. */
async function rollbackCheckOf(modelId: string, period: MonitoringPeriod): Promise<{ readonly Kind: string | null; readonly RecordID: string | null; readonly Text: string | null }> {
  const [row] = await rows<Pick<MJMLMonitoringResultEntity, 'RollbackCheck'>>('MJ: ML Monitoring Results',
    `ModelID='${EscapeSQLString(modelId)}' AND PeriodGrain='month' AND Period='${UtcDay.UtcDayIso(period.Start)}'`, ['RollbackCheck']);
  if (!row || !row.RollbackCheck) return { Kind: null, RecordID: null, Text: row ? row.RollbackCheck : null };
  const parsed = JsonParse.ParseJsonText(row.RollbackCheck, 'RollbackCheck');
  if (!parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return { Kind: null, RecordID: null, Text: row.RollbackCheck };
  return { Kind: JsonParse.JsonString(parsed.Value, 'kind'), RecordID: JsonParse.JsonString(parsed.Value, 'recordId'), Text: row.RollbackCheck };
}

// ------------------------------------------------------------------------------------------------------- fixtures ----

/** The unit, its protocol and the pipeline, created as the truth suite's `UnitFixtures.provision` creates them, recorded. */
async function provision(draft: UnitDraft, features: readonly string[], algorithm: string, triggers: readonly RetrainTrigger[]): Promise<MJMLTrainingPipelineEntity> {
  const factory = new MetadataEntityFactory(server.Provider);
  const unitRow = await PredictionUnitVersioning.CreatePredictionUnitV1(draft, human(), factory, server.User);
  records.RecordPredictionUnit(unitRow.ID);
  const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  const unit: PredictionUnitSpec = parsed.Value;
  const holdout = await ProtocolDefaults.DefaultHoldoutFor(unit, { DataAccess: new RunViewDataAccess(server.User, server.Provider), Metadata: new ProviderAssemblyMetadata(server.Provider), Now: new Date() });
  const base = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: unit, Holdout: holdout, Candidates: 1, Seed: ProtocolDefaults.DEFAULT_SEED, Name: `${draft.Name} protocol` });
  const protocol = await EvaluationProtocolVersioning.CreateEvaluationProtocolV1({ ...base, retrainTriggers: triggers }, human(), factory, server.User);
  records.RecordEvaluationProtocol(protocol.ID);
  const pipeline = await factory.getEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', server.User);
  pipeline.Name = `${TAG} ${draft.Name}`;
  const [alg] = await rows<Pick<MJMLAlgorithmEntity, 'ID'>>('MJ: ML Algorithms', `Name='${EscapeSQLString(algorithm)}'`, ['ID']);
  if (!alg) throw new Error(`ML Algorithm ${algorithm} not found`);
  pipeline.AlgorithmID = alg.ID;
  pipeline.FeatureSteps = JSON.stringify({ Steps: [{ Id: 'select', Kind: 'select', Columns: [...features] }] });
  pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 });
  RunViewPredictionUnitStore.ApplyUnitToPipeline(pipeline, unitRow.ID, unit, new ProviderAssemblyMetadata(server.Provider));
  pipeline.EvaluationProtocolID = protocol.ID;
  if (!(await pipeline.Save())) throw new Error(`saving the pipeline failed: ${pipeline.LatestResult?.CompleteMessage}`);
  records.RecordPipeline(pipeline.ID);
  return pipeline;
}

async function loadModel(modelId: string): Promise<MJMLModelEntity> {
  const m = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
  if (!(await m.Load(modelId))) throw new Error(`ML Model ${modelId} not found`);
  return m;
}

/** Points the pipeline at `features` (a `select` step) and saves it. */
async function selectFeatures(pipeline: MJMLTrainingPipelineEntity, features: readonly string[]): Promise<void> {
  pipeline.FeatureSteps = JSON.stringify({ Steps: [{ Id: 'select', Kind: 'select', Columns: [...features] }] });
  if (!(await pipeline.Save())) throw new Error(`setting ${pipeline.Name}'s features failed: ${pipeline.LatestResult?.CompleteMessage}`);
}

/** One training through `PredictiveStudio.TrainModel` (the production trainer on the truth sidecar), recorded. */
async function train(pipeline: MJMLTrainingPipelineEntity): Promise<MJMLModelEntity> {
  const r = await new PredictiveStudioTrainModelOperation().Execute({ pipelineId: pipeline.ID, sidecarVersion: 'truth-suite' }, { provider: server.Provider, user: server.User });
  const modelId = r.Output?.modelId;
  if (!r.Success || !modelId) throw new Error(`training ${pipeline.Name} shipped no model (${r.ResultCode || 'no code'}): ${r.ErrorMessage || 'no model id'}`);
  records.RecordModel(modelId);
  return loadModel(modelId);
}

/** Evaluate, then publish through the lifecycle gate (purpose publish), as the file's user. */
async function publish(model: MJMLModelEntity): Promise<void> {
  const gate = new LifecycleGate();
  await gate.Evaluate({ modelId: model.ID }, human(), gateCtx());
  const outcome = await gate.Publish({ modelId: model.ID, purpose: 'publish', initiator: human(), signOffId: null, reason: null }, gateCtx());
  if (outcome.Kind !== 'published' && outcome.Kind !== 'already-published') throw new Error(`publishing ${model.ID} was withheld: ${JSON.stringify(outcome)}`);
}

/** A person rolls the pipeline back to `model` (Archived → Published) through the gate. */
async function rollBackTo(model: MJMLModelEntity, why: string): Promise<void> {
  const outcome = await new LifecycleGate().Publish({ modelId: model.ID, purpose: 'rollback', initiator: human(), signOffId: null, reason: `${TAG}: ${why}` }, gateCtx());
  if (outcome.Kind !== 'published') throw new Error(`rolling back to ${model.ID} was withheld: ${JSON.stringify(outcome)}`);
}

/** A binding of `pipeline` on `entityId`, through the production upsert, seen through the seeded authorization. */
function bind(pipeline: MJMLTrainingPipelineEntity, entityId: string, label: string, column: { readonly Name: string; readonly Source: string } | null, retentionDays: number | null): Promise<MJMLModelScoringBindingEntity> {
  return ScoringBindings.Upsert({
    mlTrainingPipelineId: pipeline.ID, featureName: `${TAG} ${label}`, targetEntityId: entityId, recordProcessId: null, mode: 'OnDemand',
    viewAuthorizationId: ScoringBindings.ResolveViewAuthorizationID(null, server.Provider),
    targetColumn: column ? column.Name : null, targetColumnSource: column ? column.Source : null, retentionDays,
  }, new MetadataEntityFactory(server.Provider), server.User);
}

/** Scores `ids` of `entityName` through `binding` as of `asOf`, as the file's user (the binding path, writing). */
function score(binding: MJMLModelScoringBindingEntity, entityName: string, ids: readonly string[], asOf: Date): Promise<ScoringResult> {
  return new ScoringService({ ContextUser: server.User, Provider: server.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null })
    .Score(binding, { kind: 'record-ids', entity: entityName, ids }, asOf, false);
}

async function scoreCompleted(binding: MJMLModelScoringBindingEntity, entityName: string, ids: readonly string[], asOf: Date): Promise<Extract<ScoringResult, { readonly Status: 'completed' }>> {
  const result = await score(binding, entityName, ids, asOf);
  if (result.Status !== 'completed') throw new Error(`scoring ${ids.length} record(s) of ${entityName} as of ${UtcDay.UtcDayIso(asOf)} ended ${result.Status}: ${JSON.stringify(result)}`);
  return result;
}

/** The D1c record IDs decided on D1c period `p`'s day. */
async function idsOfPeriod(dataset: LoadedDataset, p: number): Promise<string[]> {
  return (await rows<{ ID: string }>(dataset.Entity.Name, `T='${UtcDay.UtcDayIso(dayOf(p))}'`, ['ID'], 'ID')).map((r) => r.ID);
}

/** The D1c unit: rows dated by `T`, labelled by `Target`, censored from 2022 (the snapshot holds periods 0–2). */
function d1cDraft(dataset: LoadedDataset): UnitDraft {
  return {
    Name: 'D1c served', Description: null,
    UnitRows: { kind: 'grain', grainEntity: dataset.Entity.Name, decisionDate: { kind: 'column', column: 'T' }, filter: [] },
    LabelRule: { kind: 'column', column: 'Target' }, LabelWindowDays: 1, LabelGapDays: 0, TaskType: BINARY,
    Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2022-01-01' } },
    ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
    DecisionSpec: { action: 'scenario', actorRole: 'test', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
  };
}

/** D1c: the weak model published, then the strong one over it, and the binding every D1c cell scores through. */
async function createD1c(): Promise<D1cFixture> {
  const dataset = await DatasetLoader.Load({ Provider: server.Provider, User: server.User, Pool: pool }, { Kind: 'scenario', ID: 'D1c', Seed: DatasetSeeds.SeedSet('scenario', 'D1c', 'base')[0] });
  const pipeline = await provision(d1cDraft(dataset), WEAK_FEATURES, 'Logistic Regression', []);
  const weak = await train(pipeline);
  await publish(weak);
  await selectFeatures(pipeline, STRONG_FEATURES);
  const strong = await train(pipeline);
  await publish(strong);
  const binding = await bind(pipeline, dataset.Entity.ID, 'D1c', null, null);
  return { Dataset: dataset, Pipeline: pipeline, Weak: await loadModel(weak.ID), Strong: await loadModel(strong.ID), Binding: binding };
}

/** The first Record Process: the scope a Feature Pipeline's rows name (no pipeline is run here). */
async function anyRecordProcessId(): Promise<string> {
  const [row] = await rows<Pick<MJRecordProcessEntity, 'ID'>>('MJ: Record Processes', '', ['ID'], 'ID');
  if (!row) throw new Error('no MJ: Record Processes row to scope a Feature Pipeline value: push the metadata');
  return row.ID;
}

// ---------------------------------------------------------------------------------------------- census, teardown ----

async function census(): Promise<Census> {
  return (await pool.request().query<Census>(`SELECT
    (SELECT COUNT(*) FROM ${t('MJ: ML Models')}) AS Models, (SELECT COUNT(*) FROM ${t('MJ: ML Monitoring Results')}) AS Results,
    (SELECT COUNT(*) FROM ${t('MJ: Feature Values')}) AS FeatureValues, (SELECT COUNT(*) FROM ${t('MJ: ML Model Scoring Bindings')}) AS Bindings,
    (SELECT COUNT(*) FROM ${t('MJ: Scheduled Jobs')}) AS Jobs, (SELECT COUNT(*) FROM ${t('MJ: ML Model Publish Records')}) AS PublishRecords,
    (SELECT COUNT(*) FROM ${t('MJ: ML Scoring Runs')}) AS ScoringRuns`)).recordset[0];
}

/** Deletes the Feature Values the file wrote outside a binding (a person's value under a pipeline scope, a pipeline's value). */
async function deleteTaggedFeatureValues(): Promise<void> {
  await pool.request().input('Prefix', sql.NVarChar(255), `${TAG}%`)
    .query(`DELETE FROM ${t('MJ: Feature Values')} WHERE FeatureName LIKE @Prefix AND MLModelScoringBindingID IS NULL`);
}

/** Puts back the W9 `TruthScore` values the column cells overwrote. */
async function restoreTruthScores(): Promise<void> {
  const table = t(w9EntityName());
  for (const [id, value] of truthScores) {
    await pool.request().input('ID', sql.UniqueIdentifier, id).input('Value', sql.Float, value).query(`UPDATE ${table} SET TruthScore = @Value WHERE ID = @ID`);
  }
}

/** The registered entity of `pstruth.W9_EventRegistration`. */
function w9EntityName(): string {
  const e = server.Provider.Entities.find((x) => x.SchemaName === 'pstruth' && x.BaseTable === 'W9_EventRegistration');
  if (!e) throw new Error('pstruth.W9_EventRegistration is not registered; run truth:provision');
  return e.Name;
}

beforeAll(async () => {
  if (!process.env.STORAGE_LOCAL_ROOT?.trim()) throw new Error('STORAGE_LOCAL_ROOT is unset: training stores artifacts through the Local File System provider');
  HarnessSidecar.UseSuiteSidecar();
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  await PredictiveStudioScoringStartup.Instance.HandleStartup(server.User, server.Provider);
  pool = await TruthConnection.OpenPool();
  startCensus = await census();
  startedAt = new Date(Date.now() - 1000);
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  try {
    if (server && pool) {
      await deleteTaggedFeatureValues();
      const failures = await HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(server.Provider, server.User), records);
      // After cleanup: its withdrawal of a still-Active binding clears the copies it finds in the column.
      if (truthScores.size > 0) await restoreTruthScores();
      await pool.request().input('Since', sql.DateTimeOffset, startedAt).query(`DELETE FROM ${t('MJ: Record Changes')} WHERE ChangedAt >= @Since`);
      expect(failures).toEqual([]);
      expect(await census()).toEqual(startCensus);
    }
  } finally {
    for (const p of instances) await p.ReleaseIndependentInstance();
    UserCache.Instance.Dispose();
    await pool?.close();
    await server?.ClosePool();
  }
}, TEARDOWN_TIMEOUT_MS);

describe('M8.5 harness', () => {
  beforeAll(async () => {
    d1c = await createD1c();
  }, CASE_TIMEOUT_MS);

  // ---------------------------------------------------------------------------------------------- 1. M5 × M6 ----

  describe('M5 × M6 — a binding whose model monitoring rolls back', () => {
    it('after monitoring rolls the pipeline back, the unchanged binding scores with the rolled-back-to model, and the earlier predictions keep the model that wrote them', async () => {
      // The weak model serves again (a person's rollback over the strong one), so the strong one is its predecessor.
      await rollBackTo(d1c.Weak, 'serve the weak model so monitoring can find its predecessor better');
      const ids = await idsOfPeriod(d1c.Dataset, 3);
      expect(ids.length).toBeGreaterThan(0);
      const before = await scoreCompleted(d1c.Binding, d1c.Dataset.Entity.Name, ids, dayOf(3));
      expect(UUIDsEqual(before.ModelID, d1c.Weak.ID)).toBe(true);

      const { Driver, Ctx } = monitoringCtx();
      await Driver.MonitorPeriods(await rollbackSpecOf(d1c.Weak.ID), [periodOf(3)], Ctx);
      const check = await rollbackCheckOf(d1c.Weak.ID, periodOf(3));
      expect({ Kind: check.Kind, Text: check.Kind === 'rolled-back' ? null : check.Text }).toEqual({ Kind: 'rolled-back', Text: null });
      expect([await statusOf(d1c.Strong.ID), await statusOf(d1c.Weak.ID)]).toEqual(['Published', 'Archived']);
      const [rollback] = await rows<RecordRow>('MJ: ML Model Publish Records', `ID='${EscapeSQLString(check.RecordID || '')}'`, // pk-filter-ok: MJ core entity keyed by ID
        ['ID', 'ModelID', 'TrainingRunID', 'Kind', 'Purpose', 'ReplacesModelID', 'RecordedAt']);
      expect(rollback && [rollback.Kind, rollback.Purpose, UUIDsEqual(rollback.ModelID, d1c.Strong.ID), UUIDsEqual(rollback.ReplacesModelID, d1c.Weak.ID)]).toEqual(['publish', 'rollback', true, true]);

      // The binding was not touched by the rollback: it names the pipeline, not a model version.
      const [binding] = await rows<Pick<MJMLModelScoringBindingEntity, 'MLTrainingPipelineID' | 'FeatureName' | 'Status'>>('MJ: ML Model Scoring Bindings',
        `ID='${EscapeSQLString(d1c.Binding.ID)}'`, ['MLTrainingPipelineID', 'FeatureName', 'Status']); // pk-filter-ok: MJ core entity keyed by ID
      expect([UUIDsEqual(binding.MLTrainingPipelineID, d1c.Pipeline.ID), binding.FeatureName, binding.Status]).toEqual([true, d1c.Binding.FeatureName, 'Active']);

      // The same records scored a year later: the rolled-back-to model scores, and both rows stay in the history.
      const after = await scoreCompleted(d1c.Binding, d1c.Dataset.Entity.Name, ids, dayOf(4));
      expect(UUIDsEqual(after.ModelID, d1c.Strong.ID)).toBe(true);
      const [run] = await rows<Pick<MJMLScoringRunEntity, 'ModelID' | 'MLModelScoringBindingID' | 'Status'>>('MJ: ML Scoring Runs',
        `ID='${EscapeSQLString(after.ScoringRunID)}'`, ['ModelID', 'MLModelScoringBindingID', 'Status']); // pk-filter-ok: MJ core entity keyed by ID
      expect([UUIDsEqual(run.ModelID, d1c.Strong.ID), UUIDsEqual(run.MLModelScoringBindingID, d1c.Binding.ID), run.Status]).toEqual([true, true, 'completed']);
      const history = await championRowsOf(d1c.Binding.ID, ids[0]);
      expect(history.map((r) => [UtcDay.UtcDayIso(new Date(r.EffectiveAsOf || 0)), UUIDsEqual(r.MLModelID, d1c.Weak.ID), UUIDsEqual(r.MLModelID, d1c.Strong.ID)]))
        .toEqual([[UtcDay.UtcDayIso(dayOf(3)), true, false], [UtcDay.UtcDayIso(dayOf(4)), false, true]]);
      const [latest] = await rows<ModelRow>('MJ: Latest Feature Values',
        `EntityID='${EscapeSQLString(d1c.Dataset.Entity.ID)}' AND RecordID='${EscapeSQLString(ids[0])}' AND FeatureName='${EscapeSQLString(d1c.Binding.FeatureName)}'`,
        ['ID', 'RecordID', 'MLModelID', 'MLScoringRunID', 'EffectiveAsOf']);
      expect([UUIDsEqual(latest.MLModelID, d1c.Strong.ID), UUIDsEqual(latest.MLScoringRunID, after.ScoringRunID)]).toEqual([true, true]);
    }, CASE_TIMEOUT_MS);
  });

  // ---------------------------------------------------------------------------------------------- 2. M3 × M6 ----

  describe('M3 × M6 — a publish, a rival publish and an automatic rollback of one pipeline from three Promise.all scopes', () => {
    it('exactly one model ends Published, every applied publish replaces the model Published just before it, and no attempt is left unrecorded', async () => {
      // The weak model serves again over the strong one, and has scored period 5, so monitoring can roll it back.
      await rollBackTo(d1c.Weak, 'serve the weak model again before the race');
      await scoreCompleted(d1c.Binding, d1c.Dataset.Entity.Name, await idsOfPeriod(d1c.Dataset, 5), dayOf(5));
      // Two rivals trained while the weak model serves (so each stored its comparison with it), both evaluated.
      const gate = new LifecycleGate();
      const first = await train(d1c.Pipeline);
      const second = await train(d1c.Pipeline);
      for (const m of [first, second]) await gate.Evaluate({ modelId: m.ID }, human(), gateCtx());
      const spec = await rollbackSpecOf(d1c.Weak.ID);
      // Three callers, three providers (each its own transaction), as three requests or a request and a job would be.
      const [pm, pa, pb] = [await ownProvider(), await ownProvider(), await ownProvider()];
      const { Driver, Ctx } = monitoringCtx(pm);
      const raceStart = new Date(Date.now() - 1000);

      const race = await quietly(() => Promise.all([
        Driver.MonitorPeriods(spec, [periodOf(5)], Ctx),
        new LifecycleGate().Publish({ modelId: first.ID, purpose: 'publish', initiator: human(), signOffId: null, reason: null }, gateCtx(pa)),
        new LifecycleGate().Publish({ modelId: second.ID, purpose: 'publish', initiator: human(), signOffId: null, reason: null }, gateCtx(pb)),
      ]));
      // Only the gate's lock wait and an applied publish's own lines may log.
      expect(race.Unexpected).toEqual([]);
      const [monitored, firstOutcome, secondOutcome]: [MonitoringRunOutcome, PublishOutcome, PublishOutcome] = race.Result;

      const published = await publishedOf(d1c.Pipeline.ID);
      expect(published).toHaveLength(1);
      const models = [d1c.Weak.ID, d1c.Strong.ID, first.ID, second.ID].map((id) => `'${EscapeSQLString(id)}'`).join(',');
      const raced = await rows<RecordRow>('MJ: ML Model Publish Records', `ModelID IN (${models}) AND RecordedAt >= '${raceStart.toISOString()}'`,
        ['ID', 'ModelID', 'TrainingRunID', 'Kind', 'Purpose', 'ReplacesModelID', 'RecordedAt'], 'RecordedAt ASC, ID ASC');
      // Serialized: each applied publish archived exactly the model Published when it ran, starting from the weak one.
      const applied = raced.filter((r) => r.Kind === 'publish');
      let current = d1c.Weak.ID;
      for (const r of applied) {
        expect(UUIDsEqual(r.ReplacesModelID, current)).toBe(true);
        current = r.ModelID || '';
      }
      expect(UUIDsEqual(current, published[0])).toBe(true);
      // Every publish attempt answered and left its record: applied once, or refused with a refusal record.
      for (const [model, outcome] of [[first, firstOutcome], [second, secondOutcome]] as const) {
        const own = raced.filter((r) => UUIDsEqual(r.ModelID, model.ID));
        if (outcome.Kind === 'published') expect(own.filter((r) => r.Kind === 'publish')).toHaveLength(1);
        else expect(own.filter((r) => r.Kind === 'refusal').length).toBeGreaterThan(0);
      }
      // The automatic rollback: what its period row says happened is what the ledger holds.
      const check = await rollbackCheckOf(d1c.Weak.ID, periodOf(5));
      const strongApplied = applied.filter((r) => UUIDsEqual(r.ModelID, d1c.Strong.ID) && r.Purpose === 'rollback');
      if (check.Kind === 'rolled-back') expect(strongApplied.map((r) => r.ID.toLowerCase())).toEqual([(check.RecordID || '').toLowerCase()]);
      else expect([strongApplied.length, monitored.Skipped !== null || check.Kind !== null]).toEqual([0, true]);
    }, CASE_TIMEOUT_MS);
  });

  // --------------------------------------------------------------------------------------------- 3. M5 × M5b ----

  describe('M5 × M5b — a withdrawn binding through scoring, the panel\'s read and the retention sweep', () => {
    it('a withdrawn binding refuses scoring with nothing written, leaves the panel\'s bindings, keeps its stored values and is still swept by its retention', async () => {
      const binding = await bind(d1c.Pipeline, d1c.Dataset.Entity.ID, 'D1c withdrawn', null, 365);
      const ids = (await idsOfPeriod(d1c.Dataset, 4)).slice(0, 10);
      await scoreCompleted(binding, d1c.Dataset.Entity.Name, ids, dayOf(4));
      await scoreCompleted(binding, d1c.Dataset.Entity.Name, ids, dayOf(5));
      expect(await modelRowCount(binding.ID)).toBe(2 * ids.length);

      await ScoringBindings.Withdraw(binding.ID, { ContextUser: server.User, Provider: server.Provider });
      // Scoring: refused before any record is read, one refused run row naming no model, no Feature Value.
      const refused = await score(binding, d1c.Dataset.Entity.Name, ids, dayOf(5));
      expect(refused.Status === 'refused' ? [refused.Reason.kind, refused.ModelID] : [refused.Status, null]).toEqual(['binding-withdrawn', null]);
      const [run] = await rows<Pick<MJMLScoringRunEntity, 'Status' | 'ModelID' | 'Written'>>('MJ: ML Scoring Runs', `ID='${EscapeSQLString(refused.ScoringRunID)}'`, // pk-filter-ok: MJ core entity keyed by ID
        ['Status', 'ModelID', 'Written']);
      expect([run.Status, run.ModelID, run.Written]).toEqual(['refused', null, 0]);
      expect(await modelRowCount(binding.ID)).toBe(2 * ids.length);

      // The panel's batch: the withdrawn binding is not among the entity's bindings; its stored values stay readable.
      const params: RunViewParams[] = PredictionPanelQueries.For(d1c.Dataset.Entity.ID, ids[0], []);
      const results = await RunView.FromMetadataProvider(server.Provider).RunViews<Record<string, string | number | boolean | Date | null>>(params, server.User);
      results.forEach((r, i) => { if (!r.Success) throw new Error(`panel read ${params[i].EntityName} failed: ${r.ErrorMessage}`); });
      const panelBindings = results[PredictionPanelQueries.Index.Bindings].Results.map((row) => String(row['ID']));
      expect(panelBindings.some((id) => UUIDsEqual(id, binding.ID))).toBe(false);
      expect(panelBindings.some((id) => UUIDsEqual(id, d1c.Binding.ID))).toBe(true);
      const history = results[PredictionPanelQueries.Index.History].Results.filter((row) => UUIDsEqual(String(row['MLModelScoringBindingID']), binding.ID));
      expect(history).toHaveLength(2);

      // The retention sweep covers a withdrawn binding: the 2023 rows are past 365 days on 2024-06-01, the 2024 rows are not.
      const retentionContextOf: (ctx: Parameters<typeof PredictionRetention.ContextOf>[0], heartbeat: () => Promise<void>) => ReturnType<typeof PredictionRetention.ContextOf> = PredictionRetention.ContextOf;
      const swept = await PredictionRetention.SweepBinding({ ID: binding.ID, FeatureName: binding.FeatureName, Status: 'Withdrawn', RetentionDays: 365 },
        new Date(Date.UTC(2024, 5, 1, 2)), retentionContextOf({ ContextUser: server.User, Provider: server.Provider }, async () => undefined));
      expect(swept && [swept.Deleted, swept.Failures]).toEqual([ids.length, []]);
      const left = await rows<ModelRow>('MJ: Feature Values', `MLModelScoringBindingID='${EscapeSQLString(binding.ID)}' AND Source='Model'`, ['ID', 'RecordID', 'MLModelID', 'MLScoringRunID', 'EffectiveAsOf']);
      expect(left.map((r) => UtcDay.UtcDayIso(new Date(r.EffectiveAsOf || 0)))).toEqual(ids.map(() => UtcDay.UtcDayIso(dayOf(5))));
      const kept = await rows<{ ID: string }>('MJ: ML Model Scoring Bindings', `ID='${EscapeSQLString(binding.ID)}' AND Status='Withdrawn'`, ['ID']); // pk-filter-ok: MJ core entity keyed by ID
      expect(kept).toHaveLength(1);
    }, CASE_TIMEOUT_MS);
  });

  // ---------------------------------------------------------------------------------------------- 4. M5 × PR 1 ----

  describe('M5 × PR 1 — a person\'s value in a binding\'s column through a scoring run and the withdrawal, and one on a pipeline target', () => {
    it('the column copy never overwrites a person\'s value, whichever writer recorded it, and withdrawal clears only the binding\'s own copies', async () => {
      // The W9 world's table has no generated entity subclass: ClassFactory's BaseEntity fallback is the one line expected.
      const quiet = await quietly(async () => {
        await DatasetLoader.Load({ Provider: server.Provider, User: server.User, Pool: pool }, { Kind: 'world', ID: 'W9-multiclass', Seed: 42 });
        const entityName = w9EntityName();
        const entity = server.Provider.EntityByName(entityName);
        if (!entity) throw new Error(`${entityName} is not in metadata`);
        const today = UtcDay.UtcDayIso(new Date());
        const draft: UnitDraft = {
          Name: 'W9 served', Description: null,
          UnitRows: { kind: 'grain', grainEntity: entityName, decisionDate: { kind: 'fixed', date: today }, filter: [] },
          LabelRule: { kind: 'column', column: 'Outcome' }, LabelWindowDays: 1, LabelGapDays: 0, TaskType: MULTICLASS,
          Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: UtcDay.UtcDayIso(new Date(Date.now() + 86_400_000)) } },
          ChangeHistoryPolicy: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
          DecisionSpec: { action: 'reminder', actorRole: 'events team', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
        };
        const pipeline = await provision(draft, ['TicketTier', 'DaysRegisteredBefore', 'PriorAttendance'], 'Logistic Regression', []);
        await publish(await train(pipeline));
        const binding = await bind(pipeline, entity.ID, 'W9 column', { Name: 'TruthScore', Source: '$.AdverseProbability' }, null);

        // Fixture: the copied records' column emptied (their planted values are kept here and restored in teardown).
        const picked = (await pool.request().query<{ ID: string; TruthScore: number | null }>(`SELECT TOP ${COPY_RECORDS} CONVERT(NVARCHAR(36), ID) AS ID, TruthScore FROM ${t(entityName)} ORDER BY ID`)).recordset;
        for (const r of picked) truthScores.set(r.ID, r.TruthScore);
        const ids = picked.map((r) => r.ID);
        const idList = ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        await pool.request().query(`UPDATE ${t(entityName)} SET TruthScore = NULL WHERE ID IN (${idList})`);
        const column = async (): Promise<Map<string, number | null>> => new Map((await pool.request()
          .query<{ ID: string; TruthScore: number | null }>(`SELECT CONVERT(NVARCHAR(36), ID) AS ID, TruthScore FROM ${t(entityName)} WHERE ID IN (${idList})`)).recordset
          .map((r) => [r.ID.toLowerCase(), r.TruthScore]));

        const day = new Date(`${today}T00:00:00.000Z`);
        await scoreCompleted(binding, entityName, ids, day);
        const copied = await column();
        expect(ids.every((id) => typeof copied.get(id.toLowerCase()) === 'number')).toBe(true);

        // Adversary (a person types a value into the bound column of record 0, by direct SQL).
        const person = 0.123;
        await pool.request().input('ID', sql.UniqueIdentifier, ids[0]).input('Value', sql.Float, person).query(`UPDATE ${t(entityName)} SET TruthScore = @Value WHERE ID = @ID`);
        // A person's value on record 1 recorded by PR 1's writer under a Feature Pipeline's scope (a Record Process), on the
        // binding's feature: the column still holds the binding's copy.
        await FeatureValueCacheService.Instance.RecordHumanValue({
          RecordProcessID: await anyRecordProcessId(), EntityID: entity.ID, RecordID: ids[1], FeatureName: binding.FeatureName,
          Value: copied.get(ids[1].toLowerCase()), ContextUser: server.User, Provider: server.Provider,
        });

        // The scoring run: record 0's value is the person's, so it is kept and recorded as a Human row of the binding.
        await scoreCompleted(binding, entityName, ids, day);
        const afterRun = await column();
        expect(afterRun.get(ids[0].toLowerCase())).toBe(person);
        const humanRows = await rows<{ RecordID: string; MLModelScoringBindingID: string | null }>('MJ: Feature Values',
          `EntityID='${EscapeSQLString(entity.ID)}' AND FeatureName='${EscapeSQLString(binding.FeatureName)}' AND Source='Human'`, ['RecordID', 'MLModelScoringBindingID']);
        expect(humanRows.some((r) => UUIDsEqual(r.RecordID, ids[0]) && UUIDsEqual(r.MLModelScoringBindingID, binding.ID))).toBe(true);

        // The withdrawal: the person's value (record 0) and the copy a pipeline-scoped Human row claims (record 1) are kept;
        // every other copy is cleared.
        const withdrawn = await ScoringBindings.Withdraw(binding.ID, { ContextUser: server.User, Provider: server.Provider });
        expect([withdrawn.Cleared, withdrawn.KeptHuman]).toEqual([ids.length - 2, 2]);
        const afterWithdrawal = await column();
        expect(ids.map((id) => afterWithdrawal.get(id.toLowerCase()))).toEqual([person, copied.get(ids[1].toLowerCase()), ...ids.slice(2).map(() => null)]);
      });
      expect(quiet.Unexpected).toEqual([]);
    }, CASE_TIMEOUT_MS);
  });

  // ----------------------------------------------------------------------------------------- 5. M1 × M5 × M6 ----

  describe('M1 × M5 × M6 — an entity deleted after it holds every kind of serving row', () => {
    it('spDeleteEntityWithCoreDependencies removes the entity with its pipelines\' publish records, scoring runs, monitoring results, output bindings and Model, Human and Pipeline rows, and nothing of another entity', async () => {
      const entityId = d1c.Dataset.Entity.ID;
      const recordId = (await idsOfPeriod(d1c.Dataset, 3))[0];
      // A person's value of the binding's feature on the entity (PR 1's writer, scoped by the binding).
      await FeatureValueCacheService.Instance.RecordHumanValue({
        RecordProcessID: null, MLModelScoringBindingID: d1c.Binding.ID, EntityID: entityId, RecordID: recordId, FeatureName: d1c.Binding.FeatureName,
        Value: 0.5, ContextUser: server.User, Provider: server.Provider,
      });
      // A Feature Pipeline's value on the entity, by direct SQL: a row no entity save shapes without running a pipeline.
      await pool.request().input('EntityID', sql.UniqueIdentifier, entityId).input('RecordID', sql.NVarChar(450), recordId)
        .input('FeatureName', sql.NVarChar(255), `${TAG} pipeline`).input('ProcessID', sql.UniqueIdentifier, await anyRecordProcessId())
        .query(`INSERT INTO ${t('MJ: Feature Values')} (EntityID, RecordID, FeatureName, Source, Role, RecordProcessID, ValueText, Confidence)
                VALUES (@EntityID, @RecordID, @FeatureName, 'Pipeline', 'Champion', @ProcessID, 'Gold', 0.81)`);
      // The monitoring results, publish records, output bindings and scoring runs are the ones cells 1–3 wrote.

      // The delete, inside a transaction this batch rolls back: the procedure joins it (it owns one only when the caller
      // has none), the counts are read inside it, and the shared truth-suite entity survives the case.
      const entities = server.Provider.EntityByName('MJ: Entities');
      if (!entities) throw new Error('MJ: Entities is not in metadata');
      const counts = `
        (SELECT COUNT(*) FROM ${t('MJ: ML Model Publish Records')} WHERE ModelID IN (SELECT ID FROM @Models) OR TrainingRunID IN (SELECT ID FROM @Runs)),
        (SELECT COUNT(*) FROM ${t('MJ: ML Scoring Runs')} WHERE ModelID IN (SELECT ID FROM @Models) OR MLModelScoringBindingID IN (SELECT ID FROM @Bindings) OR ScopeEntityID = @EntityID),
        (SELECT COUNT(*) FROM ${t('MJ: ML Monitoring Results')} WHERE ModelID IN (SELECT ID FROM @Models)),
        (SELECT COUNT(*) FROM ${t('MJ: ML Output Bindings')} WHERE ModelID IN (SELECT ID FROM @Models)),
        (SELECT COUNT(*) FROM ${t('MJ: ML Model Scoring Bindings')} WHERE ID IN (SELECT ID FROM @Bindings)),
        (SELECT COUNT(*) FROM ${t('MJ: Feature Values')} WHERE EntityID = @EntityID AND Source = 'Model'),
        (SELECT COUNT(*) FROM ${t('MJ: Feature Values')} WHERE EntityID = @EntityID AND Source = 'Human'),
        (SELECT COUNT(*) FROM ${t('MJ: Feature Values')} WHERE EntityID = @EntityID AND Source = 'Pipeline'),
        (SELECT COUNT(*) FROM ${t('MJ: ML Models')} WHERE ID IN (SELECT ID FROM @Models)),
        (SELECT COUNT(*) FROM ${t('MJ: ML Training Pipelines')} WHERE ID = @PipelineID),
        (SELECT COUNT(*) FROM ${t('MJ: Entities')} WHERE ID = @EntityID),
        (SELECT COUNT(*) FROM ${t('MJ: Feature Values')} WHERE EntityID <> @EntityID),
        (SELECT COUNT(*) FROM ${t('MJ: ML Models')} m JOIN ${t('MJ: ML Training Pipelines')} p ON p.ID = m.PipelineID WHERE p.TargetEntityID <> @EntityID)`;
      const result = await pool.request().input('EntityID', sql.UniqueIdentifier, entityId).input('PipelineID', sql.UniqueIdentifier, d1c.Pipeline.ID)
        .query<DeleteCounts>(`SET XACT_ABORT ON;
          DECLARE @Counts TABLE (Phase NVARCHAR(10), PublishRecords INT, ScoringRuns INT, MonitoringResults INT, OutputBindings INT, Bindings INT, ModelRows INT,
            HumanRows INT, PipelineRows INT, Models INT, Pipelines INT, Entities INT, OtherFeatureValues INT, OtherModels INT);
          DECLARE @Models TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
          DECLARE @Runs TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
          DECLARE @Bindings TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
          INSERT INTO @Models (ID) SELECT ID FROM ${t('MJ: ML Models')} WHERE PipelineID = @PipelineID;
          INSERT INTO @Runs (ID) SELECT ID FROM ${t('MJ: ML Training Runs')} WHERE PipelineID = @PipelineID;
          INSERT INTO @Bindings (ID) SELECT ID FROM ${t('MJ: ML Model Scoring Bindings')} WHERE MLTrainingPipelineID = @PipelineID;
          BEGIN TRANSACTION;
          INSERT INTO @Counts SELECT 'before', ${counts};
          EXEC [${entities.SchemaName}].[spDeleteEntityWithCoreDependencies] @EntityID = @EntityID;
          INSERT INTO @Counts SELECT 'after', ${counts};
          ROLLBACK TRANSACTION;
          SELECT * FROM @Counts ORDER BY CASE Phase WHEN 'before' THEN 0 ELSE 1 END;`);
      const [before, after] = result.recordset;
      // Every kind of serving row is there before the delete.
      expect([before.PublishRecords, before.ScoringRuns, before.MonitoringResults, before.OutputBindings, before.Bindings, before.ModelRows, before.HumanRows, before.PipelineRows,
        before.Models, before.Pipelines, before.Entities].every((n) => n > 0)).toBe(true);
      // None of the entity's is there after it, and nothing of another entity moved.
      expect(after).toEqual({
        Phase: 'after', PublishRecords: 0, ScoringRuns: 0, MonitoringResults: 0, OutputBindings: 0, Bindings: 0, ModelRows: 0, HumanRows: 0, PipelineRows: 0,
        Models: 0, Pipelines: 0, Entities: 0, OtherFeatureValues: before.OtherFeatureValues, OtherModels: before.OtherModels,
      });
      // The rollback kept the shared entity and the file's rows for teardown.
      expect(await publishedOf(d1c.Pipeline.ID)).toHaveLength(1);
      expect(server.Provider.EntityByName(d1c.Dataset.Entity.Name)).toBeTruthy();
    }, CASE_TIMEOUT_MS);
  });
});
