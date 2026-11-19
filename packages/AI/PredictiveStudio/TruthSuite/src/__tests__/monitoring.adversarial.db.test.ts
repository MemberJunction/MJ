// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// Task M6.9's adversarial harness (D-071): one `describe` per uncovered cell of M6's coverage table, each `it` named for
// the claim it tries to break, against the production monitoring driver (`PredictiveStudioModelMonitoringJobDriver`
// with its production store, `ScoringService` on the monitoring path, the truth sidecar's `/predict` and
// `/monitor/drift`) and the production lifecycle gate, over models the production trainer trained on the truth suite's
// D1c scenario (periods 0–2, then scored through a binding as of each of periods 3–5) and on W9-multiclass. The
// adversary's writes are labelled where they happen: a model deleted by direct SQL (the delete procedure's model step);
// `Human` Feature Values written by SQL beside the binding's `Model` rows; a binding withdrawn after period 4; a
// rollback and a publish of one pipeline started from two `Promise.all` scopes; a job owned by a user without, then with,
// the binding's view authorization (stored `MJ: Roles` / `MJ: Authorization Roles` / `MJ: User Roles` rows). Only the
// clock and the job context are replaced; no seam drops an input. Teardown deletes what the file created and requires
// the starting census.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { CompositeKey, RunView, UserInfo, UserRoleInfo, type BaseEntity, type IMetadataProvider } from '@memberjunction/core';
import {
  PredictiveStudioTrainModelOperation,
  type MJMLAlgorithmEntity,
  type MJMLModelEntity,
  type MJMLModelScoringBindingEntity,
  type MJMLMonitoringResultEntity,
  type MJMLTrainingPipelineEntity,
  type MJAuthorizationRoleEntity,
  type MJRoleEntity,
  type MJUserEntity,
  type MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
  EvaluationProtocolVersioning, GateContexts, LifecycleGate, MetadataEntityFactory, MonitoringJobs, MonitoringPeriods, PredictionUnitVersioning,
  PredictiveStudioModelMonitoringJobDriver, PredictiveStudioScoringStartup, ProtocolDefaults, ProviderAssemblyMetadata, RunViewDataAccess,
  RunViewPredictionUnitStore, ScoringBindings, ScoringService, type GateContext, type MonitoringContext, type MonitoringPeriod,
} from '@memberjunction/predictive-studio';
import {
  EvaluationProtocol, EvaluationProtocolRules, JsonParse, MonitoringResultSchemas, PredictionUnit, UtcDay,
  type Actor, type MonitoringJobReadSpec, type PredictionUnitSpec, type RetrainTrigger, type TaskType, type UnitDraft,
} from '@memberjunction/predictive-studio-core';
import { BootstrapIntegrationServer, SEED_FIXTURES_COMMAND, SEEDED_NOGRANT_EMAIL, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { DatasetLoader } from '../db/dataset-loader';
import { DatasetSeeds } from '../data/seeds';
import { HarnessCleanup, RunRecords } from '../harness/cleanup';
import { HarnessSidecar } from '../harness/sidecar';
import type { LoadedDataset } from '../harness/types';
import { ConsoleCapture } from './fixtures/console-capture';

const TAG = `PSTruth: M6.9 ${Date.now()}`;
const BOOTSTRAP_TIMEOUT_MS = 120_000;
const CASE_TIMEOUT_MS = 900_000;
const TEARDOWN_TIMEOUT_MS = 600_000;
const BINARY: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };
const DEGRADATION: RetrainTrigger = { kind: 'outcome-degradation', margin: EvaluationProtocol.ToNonNegative(0.01), consecutivePeriods: 1 };

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let startedAt: Date;
let startCensus: Census;
const records = new RunRecords();
/** The restricted owner's principal rows (`MJ: Roles`, `MJ: Authorization Roles`, `MJ: User Roles`), deleted children first. */
const principalRows: { EntityName: string; ID: string }[] = [];

/** The D1c fixture: the pipeline, its predecessor (v1, Archived) and current (v2, Published) models, the binding. */
interface D1cFixture {
  readonly Dataset: LoadedDataset;
  readonly Pipeline: MJMLTrainingPipelineEntity;
  readonly Predecessor: MJMLModelEntity;
  readonly Current: MJMLModelEntity;
  readonly Binding: MJMLModelScoringBindingEntity;
}
let d1c: D1cFixture;

/** The tables the file writes, counted at start and after teardown. */
interface Census { readonly Models: number; readonly Results: number; readonly FeatureValues: number; readonly Bindings: number; readonly Jobs: number; readonly Roles: number; readonly UserRoles: number; readonly AuthorizationRoles: number }

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

/** The period of D1c period index `p` (one calendar year per period, the month of its Jan 1 decision date). */
function periodOf(p: number): MonitoringPeriod {
  return MonitoringPeriods.Containing(new Date(Date.UTC(2019 + p, 0, 1)), 'month');
}

/** A monitoring context of the production store and scorer, the clock at `now`, as `user`. */
function monitoringCtx(now: Date, user: UserInfo = server.User): { readonly Driver: PredictiveStudioModelMonitoringJobDriver; readonly Ctx: MonitoringContext } {
  const driver = new PredictiveStudioModelMonitoringJobDriver({ Clock: { Now: () => now } });
  return { Driver: driver, Ctx: driver.ContextFor(user, server.Provider, null) };
}

/** The model's open monitoring job's spec. */
async function specOf(modelId: string): Promise<MonitoringJobReadSpec> {
  const configuration = await MonitoringJobs.OpenJobConfiguration(modelId, { ContextUser: server.User, Provider: server.Provider });
  const parsed = MonitoringResultSchemas.ParseJobSpec(configuration);
  if (parsed.Ok === false) throw new Error(`no monitoring spec for ${modelId}: ${parsed.Errors.join('; ')}`);
  return parsed.Value;
}

async function rows<T>(entityName: string, filter: string, fields: string[], orderBy?: string): Promise<T[]> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, OrderBy: orderBy, ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true }, server.User);
  if (!r.Success) throw new Error(`reading ${entityName} failed: ${r.ErrorMessage}`);
  return r.Results;
}

async function periodRows(modelId: string, period: MonitoringPeriod): Promise<Pick<MJMLMonitoringResultEntity, 'ID' | 'State' | 'ErrorMessage' | 'JoinedRows' | 'ScoredRows' | 'ExcludedInTrainingRows' | 'RollbackCheck' | 'TrackedMetrics' | 'PrimaryScore'>[]> {
  return rows('MJ: ML Monitoring Results', `ModelID='${EscapeSQLString(modelId)}' AND PeriodGrain='month' AND Period='${UtcDay.UtcDayIso(period.Start)}'`, ['ID', 'State', 'ErrorMessage', 'JoinedRows', 'ScoredRows', 'ExcludedInTrainingRows', 'RollbackCheck', 'TrackedMetrics', 'PrimaryScore']);
}

async function statusOf(modelId: string): Promise<string | null> {
  const [m] = await rows<{ Status: string }>('MJ: ML Models', `ID='${EscapeSQLString(modelId)}'`, ['Status']); // pk-filter-ok: MJ core entity keyed by ID
  return m ? m.Status : null;
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

/** One training through `PredictiveStudio.TrainModel` (the production trainer on the truth sidecar), recorded. */
async function train(pipeline: MJMLTrainingPipelineEntity): Promise<MJMLModelEntity> {
  const r = await new PredictiveStudioTrainModelOperation().Execute({ pipelineId: pipeline.ID, sidecarVersion: 'truth-suite' }, { provider: server.Provider, user: server.User });
  const modelId = r.Output?.modelId;
  if (!r.Success || !modelId) throw new Error(`training ${pipeline.Name} shipped no model (${r.ResultCode || 'no code'}): ${r.ErrorMessage || 'no model id'}`);
  records.RecordModel(modelId);
  return loadModel(modelId);
}

/** Evaluate, then publish through the lifecycle gate (purpose publish). */
async function publish(model: MJMLModelEntity): Promise<void> {
  const gate = new LifecycleGate();
  await gate.Evaluate({ modelId: model.ID }, human(), gateCtx());
  const outcome = await gate.Publish({ modelId: model.ID, purpose: 'publish', initiator: human(), signOffId: null, reason: null }, gateCtx());
  if (outcome.Kind !== 'published' && outcome.Kind !== 'already-published') throw new Error(`publishing ${model.ID} was withheld: ${JSON.stringify(outcome)}`);
}

/** The D1c unit: rows dated by `T`, labelled by `Target`, censored from 2022 (the snapshot holds periods 0–2). */
function d1cDraft(dataset: LoadedDataset): UnitDraft {
  return {
    Name: 'D1c monitored', Description: null,
    UnitRows: { kind: 'grain', grainEntity: dataset.Entity.Name, decisionDate: { kind: 'column', column: 'T' }, filter: [] },
    LabelRule: { kind: 'column', column: 'Target' }, LabelWindowDays: 1, LabelGapDays: 0, TaskType: BINARY,
    Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2022-01-01' } },
    ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
    DecisionSpec: { action: 'scenario', actorRole: 'test', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
  };
}

/** Scores period `p`'s rows through the binding as of the period's decision date (the binding path, writing). */
async function scorePeriod(f: Pick<D1cFixture, 'Binding' | 'Dataset'>, p: number): Promise<void> {
  const day = new Date(Date.UTC(2019 + p, 0, 1));
  const ids = (await rows<{ ID: string }>(f.Dataset.Entity.Name, `T='${UtcDay.UtcDayIso(day)}'`, ['ID'])).map((r) => r.ID);
  const result = await new ScoringService({ ContextUser: server.User, Provider: server.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null })
    .Score(f.Binding, { kind: 'record-ids', entity: f.Dataset.Entity.Name, ids }, day, false);
  if (result.Status !== 'completed') throw new Error(`scoring period ${p} ended ${result.Status}: ${JSON.stringify(result)}`);
}

async function createD1c(): Promise<D1cFixture> {
  const dataset = await DatasetLoader.Load({ Provider: server.Provider, User: server.User, Pool: pool }, { Kind: 'scenario', ID: 'D1c', Seed: DatasetSeeds.SeedSet('scenario', 'D1c', 'base')[0] });
  // The predecessor trains without EngagementZ (the scenario's strongest input), the current one with it, so the current
  // model beats the predecessor on its holdout and publishes over it: two trainings on one snapshot and one feature set
  // fit the same model, which the gate withholds (does-not-beat-incumbent).
  const pipeline = await provision(d1cDraft(dataset), ['TenureZ', 'AutoRenew'], 'Logistic Regression', [DEGRADATION]);
  const predecessor = await train(pipeline);
  await publish(predecessor);
  pipeline.FeatureSteps = JSON.stringify({ Steps: [{ Id: 'select', Kind: 'select', Columns: ['EngagementZ', 'TenureZ', 'AutoRenew'] }] });
  if (!(await pipeline.Save())) throw new Error(`widening the D1c pipeline's features failed: ${pipeline.LatestResult?.CompleteMessage}`);
  const current = await train(pipeline);
  await publish(current);
  const binding = await ScoringBindings.Upsert({
    mlTrainingPipelineId: pipeline.ID, featureName: `${TAG} D1c`, targetEntityId: dataset.Entity.ID, recordProcessId: null, mode: 'OnDemand',
    viewAuthorizationId: ScoringBindings.ResolveViewAuthorizationID(null, server.Provider),
  }, new MetadataEntityFactory(server.Provider), server.User);
  const f: D1cFixture = { Dataset: dataset, Pipeline: pipeline, Predecessor: await loadModel(predecessor.ID), Current: await loadModel(current.ID), Binding: binding };
  for (const p of [1, 2, 3, 4, 5]) await scorePeriod(f, p);
  return f;
}

// ------------------------------------------------------------------------------------------ the restricted owner ----

async function createRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void): Promise<T> {
  const row = await server.Provider.GetEntityObject<T>(entityName, server.User);
  row.NewRecord();
  fill(row);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** The restricted owner: the seeded no-grant user, its stored roles (none at first) and the file's role. */
interface RestrictedOwner {
  readonly User: UserInfo;
  readonly RoleID: string;
}

/**
 * The suite's restricted user (`it-nogrant@integration.test`) as a monitoring job's owner: in process it carries the
 * `Integration` role (read and write on every monitoring entity), but it holds no stored role, so
 * `vwUserHeldAuthorizations` (which reads the stored roles) gives it no authorization — not the binding's
 * "View Model Predictions". The file's own role (`MJ: Roles`) is created here and given to it in process; the grant
 * that makes the authorization held is stored later by {@link grantViewAuthorization}.
 */
async function restrictedOwner(): Promise<RestrictedOwner> {
  const [seeded] = await rows<Pick<MJUserEntity, 'ID' | 'Name' | 'Email' | 'Type' | 'IsActive'>>('MJ: Users', `Email='${EscapeSQLString(SEEDED_NOGRANT_EMAIL)}'`, ['ID', 'Name', 'Email', 'Type', 'IsActive']);
  if (!seeded) throw new Error(`the user ${SEEDED_NOGRANT_EMAIL} is not seeded: run ${SEED_FIXTURES_COMMAND}`);
  const [integration] = await rows<Pick<MJRoleEntity, 'ID'>>('MJ: Roles', `Name='Integration'`, ['ID']);
  if (!integration) throw new Error('the Integration role is not in MJ: Roles');
  const role = await createRow<MJRoleEntity>('MJ: Roles', (r) => { r.Name = `${TAG} prediction viewers`; r.Description = 'Predictive Studio truth suite (safe to delete)'; });
  principalRows.push({ EntityName: 'MJ: Roles', ID: role.ID });
  const user = new UserInfo(server.Provider, {
    ID: seeded.ID, Name: seeded.Name, Email: seeded.Email, Type: seeded.Type, IsActive: seeded.IsActive,
    UserRoles: [new UserRoleInfo({ UserID: seeded.ID, RoleID: integration.ID }), new UserRoleInfo({ UserID: seeded.ID, RoleID: role.ID })],
  });
  return { User: user, RoleID: role.ID };
}

/** Stores the binding's view authorization for the owner: the file's role granted it (`Allow`), and the role given to the user. */
async function grantViewAuthorization(owner: RestrictedOwner): Promise<void> {
  const allow = await createRow<MJAuthorizationRoleEntity>('MJ: Authorization Roles', (a) => { a.AuthorizationID = ScoringBindings.ResolveViewAuthorizationID(null, server.Provider); a.RoleID = owner.RoleID; a.Type = 'Allow'; });
  principalRows.push({ EntityName: 'MJ: Authorization Roles', ID: allow.ID });
  const member = await createRow<MJUserRoleEntity>('MJ: User Roles', (u) => { u.UserID = owner.User.ID; u.RoleID = owner.RoleID; });
  principalRows.push({ EntityName: 'MJ: User Roles', ID: member.ID });
}

/** Deletes the restricted owner's principal rows through the entity layer, children first; one line per failure. */
async function deletePrincipalRows(): Promise<string[]> {
  const failures: string[] = [];
  for (const row of principalRows.splice(0).reverse()) {
    const e = await server.Provider.GetEntityObject<BaseEntity>(row.EntityName, server.User);
    if (!(await e.InnerLoad(CompositeKey.FromID(row.ID)))) { failures.push(`${row.EntityName} ${row.ID}: not found`); continue; }
    if (!(await e.Delete())) failures.push(`${row.EntityName} ${row.ID}: ${e.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------- census, teardown ----

async function census(): Promise<Census> {
  const c = (await pool.request().query<Census>(`SELECT
    (SELECT COUNT(*) FROM ${t('MJ: ML Models')}) AS Models, (SELECT COUNT(*) FROM ${t('MJ: ML Monitoring Results')}) AS Results,
    (SELECT COUNT(*) FROM ${t('MJ: Feature Values')}) AS FeatureValues, (SELECT COUNT(*) FROM ${t('MJ: ML Model Scoring Bindings')}) AS Bindings,
    (SELECT COUNT(*) FROM ${t('MJ: Scheduled Jobs')}) AS Jobs, (SELECT COUNT(*) FROM ${t('MJ: Roles')}) AS Roles,
    (SELECT COUNT(*) FROM ${t('MJ: User Roles')}) AS UserRoles, (SELECT COUNT(*) FROM ${t('MJ: Authorization Roles')}) AS AuthorizationRoles`)).recordset[0];
  return c;
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
      const failures = [...await deletePrincipalRows(), ...await HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(server.Provider, server.User), records)];
      await pool.request().input('Since', sql.DateTimeOffset, startedAt).query(`DELETE FROM ${t('MJ: Record Changes')} WHERE ChangedAt >= @Since`);
      expect(failures).toEqual([]);
      expect(await census()).toEqual(startCensus);
    }
  } finally {
    UserCache.Instance.Dispose();
    await pool?.close();
    await server?.ClosePool();
  }
}, TEARDOWN_TIMEOUT_MS);

describe('M6.9 harness', () => {
  beforeAll(async () => {
    d1c = await createD1c();
  }, CASE_TIMEOUT_MS);

  // ------------------------------------------------------------------------------------------------- as-of order ----

  describe('as-of order — a period re-run', () => {
    it('a re-run of a period updates its one row', async () => {
      const { Driver, Ctx } = monitoringCtx(new Date(Date.UTC(2026, 0, 1)));
      const spec = await specOf(d1c.Current.ID);
      await Driver.MonitorPeriods(spec, [periodOf(3)], Ctx);
      await Driver.MonitorPeriods(spec, [periodOf(3)], Ctx);
      const stored = await periodRows(d1c.Current.ID, periodOf(3));
      expect(stored.map((r) => r.State)).toEqual(['evaluated']);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------------------ model status ----

  describe('model status — an archived model\'s job', () => {
    it('an archived model\'s job is disabled and writes no period', async () => {
      expect(await MonitoringJobs.OpenJobCount(d1c.Predecessor.ID, { ContextUser: server.User, Provider: server.Provider })).toBe(0);
      const { Driver, Ctx } = monitoringCtx(new Date(Date.UTC(2026, 0, 1)));
      const spec = await specOf(d1c.Current.ID);
      const outcome = await Driver.MonitorPeriods({ ...spec, modelId: d1c.Predecessor.ID }, [periodOf(3)], Ctx);
      expect(outcome).toMatchObject({ Skipped: expect.stringContaining('Archived'), Periods: [] });
      expect(await periodRows(d1c.Predecessor.ID, periodOf(3))).toEqual([]);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------- deleted parent or child ----

  describe('deleted parent or child — training-snapshot rows', () => {
    it('training-snapshot rows of either model are excluded from the rollback comparison', async () => {
      const { Driver, Ctx } = monitoringCtx(new Date(Date.UTC(2026, 0, 1)));
      // Period 1 is training rows of both models; period 2 is the year-cutoff protocol's holdout, so not InTraining.
      await Driver.MonitorPeriods(await specOf(d1c.Current.ID), [periodOf(1)], Ctx);
      const [row] = await periodRows(d1c.Current.ID, periodOf(1));
      expect(row).toMatchObject({ JoinedRows: 0 });
      expect(row.ExcludedInTrainingRows).toBe(row.ScoredRows);
      expect(row.ScoredRows).toBeGreaterThan(0);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------------- human value rows ----

  describe('human value — Human rows beside the binding\'s Model rows', () => {
    it('Human rows never enter the outcome join, and a binding\'s Human row without a Record Process is not a prediction', async () => {
      const { Driver, Ctx } = monitoringCtx(new Date(Date.UTC(2026, 0, 1)));
      const spec = await specOf(d1c.Current.ID);
      await Driver.MonitorPeriods(spec, [periodOf(4)], Ctx);
      const [before] = await periodRows(d1c.Current.ID, periodOf(4));
      // Adversary (a person's value, by direct SQL): one Human row per period-4 record on the binding's feature, no Record Process.
      await pool.request().input('Binding', sql.UniqueIdentifier, d1c.Binding.ID).input('Entity', sql.UniqueIdentifier, d1c.Dataset.Entity.ID).input('Feature', sql.NVarChar(255), d1c.Binding.FeatureName)
        .query(`INSERT INTO ${t('MJ: Feature Values')} (ID, EntityID, RecordID, FeatureName, ValueNumeric, Source, MLModelScoringBindingID, EffectiveAsOf, ComputedAt)
          SELECT NEWID(), @Entity, CONVERT(NVARCHAR(450), d.ID), @Feature, 0.99, 'Human', @Binding, '2023-01-01', SYSDATETIMEOFFSET()
          FROM ${t(d1c.Dataset.Entity.Name)} d WHERE d.T = '2023-01-01'`);
      await Driver.MonitorPeriods(spec, [periodOf(4)], Ctx);
      const [after] = await periodRows(d1c.Current.ID, periodOf(4));
      expect([after.ScoredRows, after.JoinedRows]).toEqual([before.ScoredRows, before.JoinedRows]);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------------- withdrawn binding ----

  describe('withdrawn binding — the periods it scored', () => {
    it('a withdrawn binding\'s rows join for the periods before withdrawal', async () => {
      const { Driver, Ctx } = monitoringCtx(new Date(Date.UTC(2026, 0, 1)));
      const spec = await specOf(d1c.Current.ID);
      await Driver.MonitorPeriods(spec, [periodOf(5)], Ctx);
      const [before] = await periodRows(d1c.Current.ID, periodOf(5));
      await ScoringBindings.Withdraw(d1c.Binding.ID, { ContextUser: server.User, Provider: server.Provider });
      await Driver.MonitorPeriods(spec, [periodOf(5)], Ctx);
      const [after] = await periodRows(d1c.Current.ID, periodOf(5));
      expect(after.JoinedRows).toBe(before.JoinedRows);
      expect(after.JoinedRows).toBeGreaterThan(0);
    }, CASE_TIMEOUT_MS);
  });

  // ----------------------------------------------------------------------------------------- unauthorized user ----

  describe('unauthorized user — a job owned by a user without the binding\'s view authorization', () => {
    it('monitoring reads as the job owner: an owner without the binding\'s view authorization gets that as the period\'s finding, and nothing is read around it (D4-157)', async () => {
      const owner = await restrictedOwner();
      const { Driver, Ctx } = monitoringCtx(new Date(Date.UTC(2026, 0, 1)), owner.User);
      const spec = await specOf(d1c.Current.ID);
      const outcome = await Driver.MonitorPeriods(spec, [periodOf(3)], Ctx);
      expect(outcome.Periods.map((p) => [p.State, p.JoinedRows])).toEqual([['failed', 0]]);
      expect(outcome.Periods[0].ErrorMessage).toContain(`does not hold the view authorization of scoring binding ${d1c.Binding.ID}`);
      const [refused] = await periodRows(d1c.Current.ID, periodOf(3));
      expect([refused.State, refused.ScoredRows, refused.JoinedRows]).toEqual(['failed', 0, 0]);
      // The same owner, once it holds the binding's view authorization, reads the binding's rows as itself.
      await grantViewAuthorization(owner);
      await Driver.MonitorPeriods(spec, [periodOf(3)], Ctx);
      const [row] = await periodRows(d1c.Current.ID, periodOf(3));
      expect(row).toMatchObject({ State: 'evaluated' });
      expect(row.JoinedRows).toBeGreaterThan(0);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------------ concurrent publish ----

  describe('concurrent publish — a rollback racing a publish of the same pipeline', () => {
    it('a rollback that races a publish leaves exactly one Published model', async () => {
      const candidate = await train(d1c.Pipeline);
      const gate = new LifecycleGate();
      await gate.Evaluate({ modelId: candidate.ID }, human(), gateCtx());
      await Promise.all([
        gate.Publish({ modelId: d1c.Predecessor.ID, purpose: 'rollback', initiator: human(), signOffId: null, reason: `${TAG}: the race` }, gateCtx()),
        gate.Publish({ modelId: candidate.ID, purpose: 'publish', initiator: human(), signOffId: null, reason: null }, gateCtx()),
      ]);
      const published = await rows<{ ID: string }>('MJ: ML Models', `PipelineID='${EscapeSQLString(d1c.Pipeline.ID)}' AND Status='Published'`, ['ID']);
      expect(published).toHaveLength(1);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------- deleted predecessor ----

  describe('deleted parent or child — the predecessor deleted since its publish record', () => {
    it('a deleted predecessor makes the rollback not-eligible', async () => {
      const [published] = await rows<{ ID: string }>('MJ: ML Models', `PipelineID='${EscapeSQLString(d1c.Pipeline.ID)}' AND Status='Published'`, ['ID']);
      // The Published model's newest applied record (the race above published either the candidate or the rolled-back predecessor).
      const [record] = await rows<{ ReplacesModelID: string | null }>('MJ: ML Model Publish Records', `ModelID='${EscapeSQLString(published.ID)}' AND Kind='publish'`, ['ReplacesModelID'], '__mj_CreatedAt DESC');
      const victim = record?.ReplacesModelID;
      if (!victim) throw new Error('the Published model replaced no predecessor');
      // Adversary (the delete procedure's model step, by direct SQL in one transaction): the model's rows, then the model.
      await pool.request().input('ModelID', sql.UniqueIdentifier, victim).query(`SET XACT_ABORT ON; BEGIN TRANSACTION;
        DELETE FROM ${t('MJ: ML Monitoring Results')} WHERE ModelID = @ModelID;
        DELETE FROM ${t('MJ: Feature Values')} WHERE MLModelID = @ModelID AND Source = 'Model';
        DELETE FROM ${t('MJ: ML Scoring Runs')} WHERE ModelID = @ModelID;
        UPDATE ${t('MJ: ML Model Publish Records')} SET ReplacesModelID = NULL WHERE ReplacesModelID = @ModelID;
        DELETE FROM ${t('MJ: ML Model Publish Records')} WHERE ModelID = @ModelID;
        UPDATE ${t('MJ: ML Training Runs')} SET ResultingModelID = NULL WHERE ResultingModelID = @ModelID;
        DELETE FROM ${t('MJ: ML Output Bindings')} WHERE ModelID = @ModelID;
        DELETE FROM ${t('MJ: ML Models')} WHERE ID = @ModelID;
        COMMIT;`);
      const { Driver, Ctx } = monitoringCtx(new Date(Date.UTC(2026, 0, 1)));
      const spec = await specOf(published.ID);
      // Rollback only: no retrain trigger, so no challenger publish can change the status this case reads.
      await Driver.MonitorPeriods({ ...spec, retrainTriggers: [], rollback: { kind: 'previous-beats-current', margin: EvaluationProtocol.ToNonNegative(0), consecutivePeriods: 1 } }, [periodOf(3)], Ctx);
      const [row] = await periodRows(published.ID, periodOf(3));
      const stored = JsonParse.ParseJsonText(row.RollbackCheck, 'RollbackCheck');
      const check = stored.Ok && JsonParse.IsJsonObject(stored.Value) ? JsonParse.JsonString(stored.Value, 'kind') : null;
      expect(['not-eligible', 'no-predecessor']).toContain(check);
      expect(await statusOf(published.ID)).toBe('Published');
      expect(UUIDsEqual(published.ID, victim)).toBe(false);
    }, CASE_TIMEOUT_MS);
  });

  // -------------------------------------------------------------------------------------------------- multiclass ----

  describe('multiclass — a W9-multiclass model\'s period', () => {
    it('a multiclass model\'s period row carries log loss and per-class rates with bounds', async () => {
      await DatasetLoader.Load({ Provider: server.Provider, User: server.User, Pool: pool }, { Kind: 'world', ID: 'W9-multiclass', Seed: 42 });
      const registrations = server.Provider.Entities.find((e) => e.SchemaName === 'pstruth' && e.BaseTable === 'W9_EventRegistration');
      if (!registrations) throw new Error('pstruth.W9_EventRegistration is not registered; run truth:provision');
      const today = UtcDay.UtcDayIso(new Date());
      const task: TaskType = { kind: 'multiclass', classOrder: ['Attended', 'Cancelled', 'NoShow'], adverseIndices: [2] };
      const draft: UnitDraft = {
        Name: 'W9 monitored', Description: null,
        UnitRows: { kind: 'grain', grainEntity: registrations.Name, decisionDate: { kind: 'fixed', date: today }, filter: [] },
        LabelRule: { kind: 'column', column: 'Outcome' }, LabelWindowDays: 1, LabelGapDays: 0, TaskType: task,
        Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: UtcDay.UtcDayIso(new Date(Date.now() + 86_400_000)) } },
        ChangeHistoryPolicy: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
        DecisionSpec: { action: 'reminder', actorRole: 'events team', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
      };
      const pipeline = await provision(draft, ['TicketTier', 'DaysRegisteredBefore', 'PriorAttendance'], 'Logistic Regression', []);
      const model = await train(pipeline);
      await publish(model);
      const period = MonitoringPeriods.Containing(new Date(`${today}T00:00:00.000Z`), 'month');
      // The clock three days after the period ends, so its one-day label window has closed.
      const now = new Date(period.End.getTime() + 3 * 86_400_000);
      const { Driver, Ctx } = monitoringCtx(now);
      await Driver.MonitorPeriods(await specOf(model.ID), [period], Ctx);
      const [row] = await periodRows(model.ID, period);
      expect([row.State, row.ErrorMessage]).toEqual(['evaluated', null]);
      const primary = MonitoringResultSchemas.ParsePrimaryScore(row.PrimaryScore);
      expect(primary.Ok && primary.Value.metric === 'multiclass-log-loss' && primary.Value.interval.lower <= primary.Value.value).toBe(true);
      const tracked = JsonParse.ParseJsonText(row.TrackedMetrics, 'TrackedMetrics');
      const entries = tracked.Ok && Array.isArray(tracked.Value) ? tracked.Value.filter(JsonParse.IsJsonObject) : [];
      const bounds = (m: (typeof entries)[number]): { lower: number | null; upper: number | null } => {
        const interval = JsonParse.JsonObjectField(m, 'interval');
        return { lower: interval === null ? null : JsonParse.JsonNumber(interval, 'lower'), upper: interval === null ? null : JsonParse.JsonNumber(interval, 'upper') };
      };
      expect(entries.filter((m) => JsonParse.JsonString(m, 'metric') === 'class-rate').map((m) => JsonParse.JsonString(m, 'className'))).toEqual(['Attended', 'Cancelled', 'NoShow']);
      expect(entries.every((m) => { const b = bounds(m); return b.lower !== null && b.upper !== null && b.lower <= b.upper; })).toBe(true);
    }, CASE_TIMEOUT_MS);
  });
});

