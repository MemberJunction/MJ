// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// A model's prediction is a Feature Value with Source = 'Model'. Every case writes the way production writes — a
// generated entity saved through BootstrapIntegrationServer()'s provider, or direct SQL for a row no entity save can
// shape — and expects the database to keep a prediction's lineage whole: its binding, model, scoring run, as-of instant
// and in-training flag, one row per binding, record, as-of instant and role.
//
// Task M5.12's adversarial harness (D-071) follows: one `describe` per uncovered cell of M5's coverage table, each `it`
// named for the claim it tries to break, against the production `ScoringService`, `FeatureValueCacheService`,
// `ArtifactRegistry` and the truth sidecar's `/predict`, over models the production trainer trained on the truth
// suite's R1 scenario. The adversary's writes are labelled where they happen: a model's lifecycle `Status` (and a legacy
// model's `ServingWhileUnevaluated` and artifact columns) written by SQL, as the lifecycle gate and M7.2's
// `MigrateArtifact` write them; a stored artifact object moved out of storage; a second publish landed by SQL between a
// run's batches; the migration's own data section run against a scratch copy of the pre-change tables. A seam a case
// replaces only wraps the production collaborator (the real sidecar, the real Feature Value writer) to fix an
// interleaving; it never drops an input. Teardown deletes what the file created and requires the starting census.
import { randomUUID } from 'crypto';
import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import {
  CompositeKey, EntityPermissionInfo, RunView, UserInfo, UserRoleInfo,
  type BaseEntity, type EntityInfo, type IMetadataProvider,
} from '@memberjunction/core';
import {
  PredictiveStudioTrainModelOperation,
  RecordProcessRunNowOperation,
  type MJAuthorizationRoleEntity,
  type MJFeatureValueEntity,
  type MJMLAlgorithmEntity,
  type MJMLModelEntity,
  type MJMLModelScoringBindingEntity,
  type MJMLScoringRunEntity,
  type MJMLTrainingPipelineEntity,
  type MJProcessRunEntity,
  type MJRoleEntity,
  type MJUserEntity,
  type MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { FeatureValueCacheService, type ModelValueRow } from '@memberjunction/feature-pipelines';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
  ArtifactRegistry, CreateScoringProcess, MJSidecarPredictor, MLModelInferenceProcessor, MetadataEntityFactory, PredictiveStudioScoringStartup,
  ProviderTransactions, ScoringBindings, ScoringService, StorageProviderArtifactLoader,
  type ISidecarPredictor, type ScoringContext, type ScoringServiceSeams, type ScoringValueStore,
} from '@memberjunction/predictive-studio';
import { JsonParse, type PredictRequest, type PredictResponse, type ScoringResult, type ScoringScope } from '@memberjunction/predictive-studio-core';
import { BootstrapIntegrationServer, SEED_FIXTURES_COMMAND, SEEDED_NOGRANT_EMAIL, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { DatasetLoader } from '../db/dataset-loader';
import { DatasetSeeds } from '../data/seeds';
import { ArtifactObjects } from '../harness/artifact-objects';
import { HarnessCleanup, RunRecords } from '../harness/cleanup';
import { HarnessPipelines } from '../harness/pipelines';
import { HarnessSidecar } from '../harness/sidecar';
import type { LoadedDataset } from '../harness/types';
import { ConsoleCapture } from './fixtures/console-capture';
import { LatestRows } from './fixtures/latest-feature-values';

/** The lineage columns of a `Model` row a case sets; every other column takes the valid value. */
type ModelRowLineage = Pick<
  MJFeatureValueEntity,
  'MLModelScoringBindingID' | 'MLModelID' | 'MLScoringRunID' | 'EffectiveAsOf' | 'InTraining' | 'Role' | 'RecordID'
>;

/** The columns of a `Human` row a case sets. */
type HumanRowShape = Pick<MJFeatureValueEntity, 'RecordProcessID' | 'MLModelScoringBindingID'>;

/** The columns a raw insert names; the row is otherwise a plain numeric value on the probe record. */
type RawFeatureValueShape = Pick<MJFeatureValueEntity, 'Source' | 'RecordProcessID'>;

/** The rows every case reads: one pipeline, its champion and challenger models, one binding and a run of each model. */
interface ScoringFixtures {
  readonly PipelineID: string;
  readonly ChampionModelID: string;
  readonly ChallengerModelID: string;
  readonly Binding: MJMLModelScoringBindingEntity;
  readonly ChampionRunID: string;
  readonly ChallengerRunID: string;
  readonly TargetEntityID: string;
}

const TAG = `PSScoringService-${Date.now()}`;
/** A scoring as-of instant: 00:00 UTC of the run's as-of date. */
const AS_OF = new Date('2026-10-01T00:00:00Z');

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let fixtures: ScoringFixtures;

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
  const entity: EntityInfo | undefined = provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** A new, unsaved row of `entityName` with `fill` applied. */
async function unsavedRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void): Promise<T> {
  const row = await server.Provider.GetEntityObject<T>(entityName, server.User);
  row.NewRecord();
  fill(row);
  return row;
}

/** An authorization a fixture binding is seen through (the binding entity requires one; which one is immaterial here). */
function AnyAuthorizationID(): string {
  const authorization = server.Provider.Authorizations[0];
  if (!authorization) throw new Error('no MJ: Authorizations are loaded for the scoring binding fixture');
  return authorization.ID;
}

/** Save a new row of `entityName` with `fill` applied; throws with the provider's message when the save fails. */
async function createRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void): Promise<T> {
  const row = await unsavedRow<T>(entityName, fill);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** The row's save is refused, and both its result and the provider's error log name `constraint`. */
async function expectRefused(row: BaseEntity, constraint: string): Promise<void> {
  const save = await ConsoleCapture.During('error', () => row.Save());
  expect(save.Result).toBe(false);
  expect(row.LatestResult?.CompleteMessage).toContain(constraint);
  expect(save.Lines.join('\n')).toContain(constraint);
}

/** A new, unsaved `Model` row of the fixture binding's feature on its target entity, with `lineage` applied. */
function NewModelRow(lineage: ModelRowLineage): Promise<MJFeatureValueEntity> {
  return unsavedRow<MJFeatureValueEntity>('MJ: Feature Values', (fv) => {
    fv.EntityID = fixtures.TargetEntityID;
    fv.FeatureName = fixtures.Binding.FeatureName;
    fv.Source = 'Model';
    fv.RecordProcessID = null;
    fv.ValueNumeric = 0.25;
    fv.RecordID = lineage.RecordID;
    fv.MLModelScoringBindingID = lineage.MLModelScoringBindingID;
    fv.MLModelID = lineage.MLModelID;
    fv.MLScoringRunID = lineage.MLScoringRunID;
    fv.EffectiveAsOf = lineage.EffectiveAsOf;
    fv.InTraining = lineage.InTraining;
    fv.Role = lineage.Role;
  });
}

/** A new, unsaved `Human` row of the fixture binding's feature on a fresh record, with `shape` applied. */
function NewHumanRow(shape: HumanRowShape): Promise<MJFeatureValueEntity> {
  return unsavedRow<MJFeatureValueEntity>('MJ: Feature Values', (fv) => {
    fv.EntityID = fixtures.TargetEntityID;
    fv.RecordID = randomUUID();
    fv.FeatureName = fixtures.Binding.FeatureName;
    fv.Source = 'Human';
    fv.Role = 'Champion';
    fv.ValueNumeric = 1;
    fv.RecordProcessID = shape.RecordProcessID;
    fv.MLModelScoringBindingID = shape.MLModelScoringBindingID;
  });
}

/** Insert a Feature Value by SQL, for a row shape the case expects the database itself to refuse. */
async function RawInsertFeatureValue(p: sql.ConnectionPool, shape: RawFeatureValueShape): Promise<void> {
  await p.request()
    .input('EntityID', sql.UniqueIdentifier, fixtures.TargetEntityID)
    .input('RecordID', sql.NVarChar(900), randomUUID())
    .input('FeatureName', sql.NVarChar(255), fixtures.Binding.FeatureName)
    .input('Source', sql.NVarChar(20), shape.Source)
    .input('RecordProcessID', sql.UniqueIdentifier, shape.RecordProcessID)
    .query(`INSERT INTO ${tableOf(server.Provider, 'MJ: Feature Values')} (EntityID, RecordID, FeatureName, Source, RecordProcessID, ValueNumeric)
            VALUES (@EntityID, @RecordID, @FeatureName, @Source, @RecordProcessID, 1)`);
}

/** The champion lineage of one record: the fixture binding, the champion model and its run, at {@link AS_OF}. */
function championLineage(recordId: string): ModelRowLineage {
  return {
    RecordID: recordId,
    MLModelScoringBindingID: fixtures.Binding.ID,
    MLModelID: fixtures.ChampionModelID,
    MLScoringRunID: fixtures.ChampionRunID,
    EffectiveAsOf: AS_OF,
    InTraining: false,
    Role: 'Champion',
  };
}

/** A completed scoring run of version `version` of `modelId` for the fixture binding, saved through the generated entity. */
function NewScoringRun(modelId: string, version: number, bindingId: string, scopeEntityId: string): Promise<MJMLScoringRunEntity> {
  return createRow<MJMLScoringRunEntity>('MJ: ML Scoring Runs', (r) => {
    r.ModelID = modelId;
    r.ModelVersion = version;
    r.MLModelScoringBindingID = bindingId;
    r.Path = 'score-record-set';
    r.ScopeKind = 'record-ids';
    r.ScopeEntityID = scopeEntityId;
    r.Scope = JSON.stringify({ recordIds: [] });
    r.AsOfDate = AS_OF;
    r.ReadPolicy = '{}';
    r.RequestedBy = JSON.stringify({ kind: 'system', component: 'scoring-service-test' });
    r.Status = 'completed';
  });
}

/** A classification model of the pipeline at `version`, saved through the generated entity. */
function NewModel(pipelineId: string, algorithmId: string, version: number): Promise<MJMLModelEntity> {
  return createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
    m.PipelineID = pipelineId;
    m.AlgorithmID = algorithmId;
    m.Version = version;
    m.FeatureSchema = '[]';
    m.TargetVariable = 'Probe';
    m.ProblemType = 'classification';
  });
}

/** The first `MJ: ML Algorithms` row, which every pipeline and model of this file names. */
async function anyAlgorithmId(): Promise<string> {
  const algorithms = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>(
    { EntityName: 'MJ: ML Algorithms', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
    server.User,
  );
  const algorithmId = algorithms.Results[0]?.ID;
  if (!algorithms.Success || !algorithmId) throw new Error('no MJ: ML Algorithms row to train with: push the metadata');
  return algorithmId;
}

/** One pipeline on `MJ: Users`, its champion and challenger models, one binding and a run of each model. */
async function createFixtures(): Promise<ScoringFixtures> {
  const algorithmId = await anyAlgorithmId();
  const targetEntityId = server.Provider.EntityByName('MJ: Users')?.ID;
  if (!targetEntityId) throw new Error('MJ: Users is not in metadata');
  const pipeline = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (p) => {
    p.Name = TAG;
    p.TargetEntityID = targetEntityId;
    p.TargetVariable = 'Probe';
    p.ProblemType = 'classification';
    p.AlgorithmID = algorithmId;
  });
  const champion = await NewModel(pipeline.ID, algorithmId, 1);
  const challenger = await NewModel(pipeline.ID, algorithmId, 2);
  const binding = await createRow<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', (b) => {
    b.MLTrainingPipelineID = pipeline.ID;
    b.FeatureName = TAG;
    b.ViewAuthorizationID = AnyAuthorizationID();
    b.TargetEntityID = targetEntityId;
    b.Mode = 'OnDemand';
  });
  const championRun = await NewScoringRun(champion.ID, 1, binding.ID, targetEntityId);
  const challengerRun = await NewScoringRun(challenger.ID, 2, binding.ID, targetEntityId);
  return {
    PipelineID: pipeline.ID, ChampionModelID: champion.ID, ChallengerModelID: challenger.ID, Binding: binding,
    ChampionRunID: championRun.ID, ChallengerRunID: challengerRun.ID, TargetEntityID: targetEntityId,
  };
}

/** Delete every row the file created, children first. */
async function deleteFixtures(f: ScoringFixtures): Promise<void> {
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  await pool.request()
    .input('PipelineID', sql.UniqueIdentifier, f.PipelineID)
    .input('BindingID', sql.UniqueIdentifier, f.Binding.ID)
    .input('EntityID', sql.UniqueIdentifier, f.TargetEntityID)
    .input('FeatureName', sql.NVarChar(255), f.Binding.FeatureName)
    .query(`
      DELETE FROM ${t('MJ: Feature Values')}
        WHERE MLModelScoringBindingID = @BindingID OR (EntityID = @EntityID AND FeatureName = @FeatureName)
           OR MLScoringRunID IN (SELECT ID FROM ${t('MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID = @BindingID);
      DELETE FROM ${t('MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID = @BindingID;
      DELETE FROM ${t('MJ: ML Model Scoring Bindings')} WHERE ID = @BindingID;
      DELETE FROM ${t('MJ: ML Models')} WHERE PipelineID = @PipelineID;
      DELETE FROM ${t('MJ: ML Training Pipelines')} WHERE ID = @PipelineID;`);
}

// The bootstrap loads all metadata. On a loaded host that alone has taken 44 s, past vitest's default hook timeout.
const BOOTSTRAP_TIMEOUT_MS = 120_000;
// Teardown deletes two trained models with their runs, snapshots and files, entity by entity.
const TEARDOWN_TIMEOUT_MS = 600_000;

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
  startCensus = await census();
  startedAt = new Date(Date.now() - 1000);
  fixtures = await createFixtures();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  try {
    if (server && pool) await teardown();
  } finally {
    UserCache.Instance.Dispose();
    await pool?.close();
    await server?.ClosePool();
  }
}, TEARDOWN_TIMEOUT_MS);

describe('model Feature Values carry their lineage', () => {
  it('refuses a Model row without its scoring run', async () => {
    const fv = await NewModelRow({ ...championLineage(randomUUID()), MLScoringRunID: null });
    await expectRefused(fv, 'CK_FeatureValue_SourceLineage');
  });

  it('refuses a second Model row for one binding, record, as-of instant and role', async () => {
    const lineage = championLineage(randomUUID());
    const first = await NewModelRow(lineage);
    expect(await first.Save()).toBe(true);
    const twin = await NewModelRow(lineage);
    await expectRefused(twin, 'UQ_FeatureValue_ModelRow');
  });

  it('keeps a Challenger row beside the Champion row of the same key', async () => {
    const lineage = championLineage(randomUUID());
    expect(await (await NewModelRow(lineage)).Save()).toBe(true);
    const challenger = await NewModelRow({
      ...lineage, Role: 'Challenger', MLModelID: fixtures.ChallengerModelID, MLScoringRunID: fixtures.ChallengerRunID,
    });
    expect(await challenger.Save()).toBe(true);
  });

  it('accepts a Human row that names a binding and no Record Process', async () => {
    const human = await NewHumanRow({ RecordProcessID: null, MLModelScoringBindingID: fixtures.Binding.ID });
    expect(await human.Save()).toBe(true);
  });

  it('refuses a Pipeline row without a Record Process', async () => {
    await expect(RawInsertFeatureValue(pool, { Source: 'Pipeline', RecordProcessID: null })).rejects.toThrow('CK_FeatureValue_SourceLineage');
  });

  it('the latest-value view carries the lineage columns', async () => {
    const recordId = randomUUID();
    expect(await (await NewModelRow(championLineage(recordId))).Save()).toBe(true);
    const [row] = await LatestRows(server, fixtures.TargetEntityID, recordId, fixtures.Binding.FeatureName,
      ['MLModelScoringBindingID', 'MLScoringRunID', 'InTraining']);
    expect([
      UUIDsEqual(row.MLModelScoringBindingID, fixtures.Binding.ID), UUIDsEqual(row.MLScoringRunID, fixtures.ChampionRunID), row.InTraining,
    ]).toEqual([true, true, false]);
  });
});

// ======================================================================================= Task M5.12: the harness ==

/** Row counts the harness must leave as it found them, and the files under the storage root. */
interface HarnessCensus {
  /** Every `ML*` table of the core schema, by table name. */
  readonly MLTables: Readonly<Record<string, number>>;
  readonly ModelFeatureValues: number;
  readonly MLRecordProcesses: number;
  readonly ProcessRuns: number;
  readonly Files: number;
  readonly Entities: number;
  readonly RecordChanges: number;
  readonly Roles: number;
  readonly UserRoles: number;
  readonly AuthorizationRoles: number;
  readonly Schemas: number;
  readonly StorageFiles: number;
}

/** A `Model` row of a binding as a case reads it back. */
type ModelRow = Pick<MJFeatureValueEntity, 'RecordID' | 'MLModelID' | 'MLScoringRunID' | 'Role'>;

/** The R1 models every case scores with: two trained versions of one unit pipeline, and the legacy unitless copy. */
interface ServingFixtures {
  readonly Dataset: LoadedDataset;
  readonly UnitPipeline: MJMLTrainingPipelineEntity;
  readonly V1: MJMLModelEntity;
  readonly V2: MJMLModelEntity;
  readonly LegacyPipelineID: string;
  readonly LegacyModelID: string;
  /** Four R1 records, in key order: the scope of every binding case. */
  readonly RecordIDs: readonly string[];
}

const HARNESS_TAG = `PSTruth: M5.12 ${Date.now()}`;
/** A case trains nothing; the setup trains two models on the suite sidecar. */
const CASE_TIMEOUT_MS = 600_000;
/** The R1 scenario's numeric features (no one-hot step, so the unit and transform-only assemblies name the same columns). */
const R1_FEATURES: readonly string[] = ['DistanceZ', 'ItemsZ', 'TrafficZ'];
const R1_DENY_FIELDS: readonly string[] = ['ID', 'EntityKey', 'T', 'TruthScore'];
/** The console lines the production paths write on purpose. */
const EXPECTED_LINES: readonly RegExp[] = [
  /^Running \d+ post-commit task\(s\) after transaction commit$/,
  // A save or delete of an MJ: Roles row (the restricted principal's role) reloads the provider's metadata.
  /^\[Metadata\] Full reload needed: MJ: Roles changed$/,
  /^\[Metadata\] Full reload \(a full reload was requested\) took \d+ ms$/,
];
/**
 * The legacy model's stored feature importance, as a pre-change trainer wrote one: no feature above the default
 * dominance threshold (0.6). The R1 model it copies ships a kept baseline member, whose `FeatureImportance` is `{}`.
 */
const LEGACY_IMPORTANCE: Readonly<Record<string, number>> = { DistanceZ: 0.45, ItemsZ: 0.35, TrafficZ: 0.2 };

let storageRoot: string;
let startCensus: HarnessCensus;
let startedAt: Date;
let serving: ServingFixtures | null = null;
const harnessRecords = new RunRecords();
/** Every artifact object the adversary moved out of storage and must put back: [moved-to path, original path]. */
const movedObjects: [string, string][] = [];
/** The restricted principal's rows, deleted at teardown, children first. */
const principalRows: { EntityName: string; ID: string }[] = [];
/** The scratch schema of the binding migration case, dropped at teardown. */
let scratchSchema: string | null = null;

// ------------------------------------------------------------------------------------------------ helpers ----

/** `[schema].[table]` of an entity of the bootstrap's provider. */
function t(entityName: string): string {
  return tableOf(server.Provider, entityName);
}

/** `work` with both console channels captured: its result, every line and the lines that are not {@link EXPECTED_LINES}. */
async function quietly<T>(work: () => Promise<T>): Promise<{ Result: T; Lines: string[]; Unexpected: string[] }> {
  const errors = await ConsoleCapture.During('error', () => ConsoleCapture.During('log', work));
  const lines = [...errors.Result.Lines, ...errors.Lines];
  return { Result: errors.Result.Result, Lines: lines, Unexpected: lines.filter((l) => !EXPECTED_LINES.some((x) => x.test(l))) };
}

/** The rows of `entityName` matching `filter`, read past the cache as the bootstrap's user; throws on a failed read. */
async function rowsOf<T>(entityName: string, filter: string, fields: string[], orderBy?: string): Promise<T[]> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<T>(
    { EntityName: entityName, ExtraFilter: filter, Fields: fields, OrderBy: orderBy, ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true }, server.User);
  if (!r.Success) throw new Error(`reading ${entityName} (${filter}) failed: ${r.ErrorMessage}`);
  return r.Results;
}

/** The model row, loaded fresh through the entity. */
async function loadModel(modelId: string): Promise<MJMLModelEntity> {
  const m = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
  if (!(await m.Load(modelId))) throw new Error(`ML Model ${modelId} not found`);
  return m;
}

/** One training of the pipeline through `PredictiveStudio.TrainModel` (the production trainer on the suite sidecar); the model, recorded. */
async function train(pipeline: MJMLTrainingPipelineEntity): Promise<MJMLModelEntity> {
  const r = await new PredictiveStudioTrainModelOperation().Execute({ pipelineId: pipeline.ID, sidecarVersion: 'truth-suite' }, { provider: server.Provider, user: server.User });
  const modelId = r.Output?.modelId;
  if (!r.Success || !modelId) throw new Error(`training ${pipeline.Name} shipped no model (${r.ResultCode || 'no code'}): ${r.ErrorMessage || r.Output?.status || 'no model id'}`);
  harnessRecords.RecordModel(modelId);
  return loadModel(modelId);
}

/** Adversary (the lifecycle gate's column, written by SQL): sets the model's `Status`. */
async function setStatus(modelId: string, status: MJMLModelEntity['Status']): Promise<void> {
  await pool.request().input('ID', sql.UniqueIdentifier, modelId).input('Status', sql.NVarChar(20), status)
    .query(`UPDATE ${t('MJ: ML Models')} SET Status = @Status WHERE ID = @ID`);
}

/** A binding of `pipelineId`'s feature `label` on the R1 entity, saved through `ScoringBindings.Upsert` (the binding editor's writer). */
async function newBinding(pipelineId: string, label: string, viewAuthorizationId?: string): Promise<MJMLModelScoringBindingEntity> {
  const f = servingFixtures();
  return ScoringBindings.Upsert({
    mlTrainingPipelineId: pipelineId, featureName: `${HARNESS_TAG} ${label}`, targetEntityId: f.Dataset.Entity.ID, recordProcessId: null,
    viewAuthorizationId: ScoringBindings.ResolveViewAuthorizationID(viewAuthorizationId, server.Provider), targetColumn: null, targetColumnSource: null, mode: 'OnDemand',
  }, new MetadataEntityFactory(server.Provider), server.User);
}

/** The scoring context of a Score Record Set caller `user` on `provider`, with `seams` over the production collaborators. */
function scoringCtx(user: UserInfo, provider: IMetadataProvider, seams: Partial<ScoringServiceSeams> = {}): ScoringContext {
  return { ContextUser: user, Provider: provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null, Seams: seams };
}

/** The fixture records as a record-ids scope of the R1 entity. */
function scope(ids: readonly string[] = servingFixtures().RecordIDs): ScoringScope {
  return { kind: 'record-ids', entity: servingFixtures().Dataset.Entity.Name, ids: [...ids] };
}

/** The run date (00:00 UTC of today): a unit-less model scores only that date. */
function runDay(): Date {
  return ScoringService.Normalize(new Date());
}

/** The serving fixtures; throws when the setup did not build them. */
function servingFixtures(): ServingFixtures {
  if (serving === null) throw new Error('the M5.12 serving fixtures were not built');
  return serving;
}

/** The binding's `Model` rows, by record. */
async function modelRows(bindingId: string): Promise<ModelRow[]> {
  return rowsOf<ModelRow>('MJ: Feature Values', `MLModelScoringBindingID='${EscapeSQLString(bindingId)}' AND Source='Model'`,
    ['RecordID', 'MLModelID', 'MLScoringRunID', 'Role'], 'RecordID ASC');
}

/** The binding's scoring runs, oldest first, as entities (their typed `RefusalObject` and `FirstErrorsObject`). */
async function scoringRuns(bindingId: string): Promise<MJMLScoringRunEntity[]> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<MJMLScoringRunEntity>(
    { EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `MLModelScoringBindingID='${EscapeSQLString(bindingId)}'`, OrderBy: 'StartedAt ASC', ResultType: 'entity_object', BypassCache: true }, server.User);
  if (!r.Success) throw new Error(`reading the scoring runs of binding ${bindingId} failed: ${r.ErrorMessage}`);
  return r.Results;
}

/** True when every value is the same UUID as `id`. */
function allAre(values: readonly (string | null)[], id: string): boolean {
  return values.length > 0 && values.every((v) => v !== null && UUIDsEqual(v, id));
}

/** Where the model's stored artifact object lives under the storage root. */
async function storedObjectPath(modelId: string): Promise<string> {
  const model = await loadModel(modelId);
  if (!model.ArtifactFileID) throw new Error(`ML Model ${modelId} has no artifact file`);
  const [file] = await rowsOf<{ ProviderKey: string | null }>('MJ: Files', `ID='${EscapeSQLString(model.ArtifactFileID)}'`, ['ProviderKey']);
  if (file === undefined || !file.ProviderKey) throw new Error(`MJ: Files ${model.ArtifactFileID} has no ProviderKey`);
  return ArtifactObjects.ObjectPath(storageRoot, model.ArtifactFileID, file.ProviderKey);
}

/** Adversary (storage): moves the model's stored artifact object aside, as a lost disk does; teardown puts it back. */
async function removeArtifactObject(modelId: string): Promise<void> {
  const objectPath = await storedObjectPath(modelId);
  if (!existsSync(objectPath)) throw new Error(`ML Model ${modelId}'s stored object is not at ${objectPath}`);
  const aside = `${objectPath}.removed-by-m5-12`;
  renameSync(objectPath, aside);
  movedObjects.push([aside, objectPath]);
}

/** Puts every moved artifact object back. */
function restoreArtifactObjects(): void {
  for (const [aside, original] of movedObjects.splice(0)) if (existsSync(aside)) renameSync(aside, original);
}

/**
 * The production sidecar predictor with an interleaving point: before its `n`-th call (1-based) the hook for `n` runs.
 * Every request is kept, so a case can read which artifact each batch was scored with. It changes no request.
 */
class InterleavingSidecar implements ISidecarPredictor {
  public readonly Requests: PredictRequest[] = [];
  private readonly inner = new MJSidecarPredictor();

  constructor(private readonly before: ReadonlyMap<number, () => Promise<void>>) {}

  /** @inheritdoc */
  public async predict(req: PredictRequest): Promise<PredictResponse> {
    this.Requests.push(req);
    const hook = this.before.get(this.Requests.length);
    if (hook) await hook();
    return this.inner.predict(req);
  }
}

/**
 * The production Feature Value store with a barrier on the model-row write: each `RecordModelValues` call waits until
 * `parties` calls have arrived (or `timeoutMs` passed), then writes through `FeatureValueCacheService.Instance` as it is.
 * One shared instance makes two runs' batch writes overlap.
 */
class BarrierValues implements ScoringValueStore {
  private arrived = 0;
  private release: (() => void) | null = null;
  private readonly gate: Promise<void>;

  constructor(private readonly parties: number, private readonly timeoutMs: number) {
    this.gate = new Promise<void>((resolve) => { this.release = resolve; });
  }

  /** @inheritdoc */
  public async RecordModelValues(...args: Parameters<FeatureValueCacheService['RecordModelValues']>): ReturnType<FeatureValueCacheService['RecordModelValues']> {
    this.arrived++;
    if (this.arrived >= this.parties && this.release) this.release();
    await Promise.race([this.gate, new Promise<void>((resolve) => setTimeout(resolve, this.timeoutMs))]);
    return FeatureValueCacheService.Instance.RecordModelValues(...args);
  }

  /** @inheritdoc */
  public RecordHumanValue(...args: Parameters<FeatureValueCacheService['RecordHumanValue']>): ReturnType<FeatureValueCacheService['RecordHumanValue']> {
    return FeatureValueCacheService.Instance.RecordHumanValue(...args);
  }

  /** @inheritdoc */
  public RetireHumanValue(...args: Parameters<FeatureValueCacheService['RetireHumanValue']>): ReturnType<FeatureValueCacheService['RetireHumanValue']> {
    return FeatureValueCacheService.Instance.RetireHumanValue(...args);
  }
}

// ------------------------------------------------------------------------------------------------ setup ----

/** The R1 unit pipeline (the pipeline migration binds its unit and protocol), recorded. */
async function createUnitPipeline(dataset: LoadedDataset): Promise<MJMLTrainingPipelineEntity> {
  const algorithms = await HarnessPipelines.LoadAlgorithms(server.Provider, server.User);
  const p = await HarnessPipelines.CreatePipeline(server.Provider, server.User, algorithms, {
    Name: `${HARNESS_TAG} unit`, Dataset: dataset, Target: 'Target', ProblemType: 'regression', Features: [...R1_FEATURES],
    Algorithm: 'ridge', AsOf: { Mode: 'none' }, Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 }, DenyFields: [...R1_DENY_FIELDS],
  });
  harnessRecords.RecordPipeline(p.ID);
  harnessRecords.RecordPipelineBindings(p);
  return p;
}

/** A pre-change pipeline: the unit pipeline's definition saved with no Prediction Unit (MoreCheese's shape), recorded. */
async function createLegacyPipeline(unit: MJMLTrainingPipelineEntity): Promise<MJMLTrainingPipelineEntity> {
  const p = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (row) => {
    row.Name = `${HARNESS_TAG} legacy`; row.Description = 'Predictive Studio truth suite (safe to delete)'; row.Version = 1; row.Status = 'Draft';
    row.TargetEntityID = unit.TargetEntityID; row.TargetVariable = unit.TargetVariable; row.ProblemType = unit.ProblemType; row.AlgorithmID = unit.AlgorithmID;
    row.SourceBindings = unit.SourceBindings; row.FeatureSteps = unit.FeatureSteps; row.AsOfStrategy = unit.AsOfStrategy;
    row.LeakageGuard = unit.LeakageGuard; row.ValidationStrategy = unit.ValidationStrategy;
  });
  harnessRecords.RecordPipeline(p.ID);
  if (p.PredictionUnitID !== null) throw new Error(`the legacy pipeline ${p.ID} was bound to a Prediction Unit`);
  return p;
}

/**
 * A pre-change model of the legacy pipeline: `source`'s frozen columns (schema, preprocessing) with
 * {@link LEGACY_IMPORTANCE} as its stored importance, the pre-change trainer's Lineage ({@link legacyLineage}) and no schema hash, its artifact (the bytes `source`'s verified load returns) stored through
 * `ArtifactRegistry.Store`; then, by SQL as M7.2's `MigrateArtifact` and data section write them, `ArtifactFileID`,
 * `ArtifactSha256`, `ArtifactStatus = 'verified'`, `Status = 'Unevaluated'` and `ServingWhileUnevaluated = 1`.
 */
async function createLegacyModel(pipeline: MJMLTrainingPipelineEntity, source: MJMLModelEntity): Promise<string> {
  const pipelineId = pipeline.ID;
  const regCtx = { ContextUser: server.User, Provider: server.Provider };
  const registry = ArtifactRegistry.ForContext(regCtx, new StorageProviderArtifactLoader());
  const load = await registry.Load(source, regCtx);
  if (load.Status !== 'verified') throw new Error(`the trained model ${source.ID}'s artifact did not verify: ${load.Status}`);
  const model = await createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
    m.PipelineID = pipelineId; m.AlgorithmID = source.AlgorithmID; m.Version = 1; m.TargetVariable = source.TargetVariable; m.ProblemType = source.ProblemType;
    m.FeatureSchema = source.FeatureSchema; m.FittedPreprocessing = source.FittedPreprocessing; m.FeatureImportance = JSON.stringify(LEGACY_IMPORTANCE);
  });
  harnessRecords.RecordModel(model.ID);
  const stored = await registry.Store(load.Bytes, `${HARNESS_TAG} legacy.bin`, regCtx);
  await pool.request().input('ID', sql.UniqueIdentifier, model.ID).input('FileID', sql.UniqueIdentifier, stored.fileId).input('Sha', sql.Char(64), stored.sha256)
    .input('Lineage', sql.NVarChar(sql.MAX), legacyLineage(pipeline))
    .query(`UPDATE ${t('MJ: ML Models')} SET Status = 'Unevaluated', ServingWhileUnevaluated = 1, ArtifactFileID = @FileID, ArtifactSha256 = @Sha,
            ArtifactStatus = 'verified', Lineage = @Lineage, FeatureSchemaHash = NULL WHERE ID = @ID`);
  return model.ID;
}

/**
 * The Lineage the pre-change trainer wrote (`TrainingEngine.buildLineage` as `45f18fdee6` added it, the shape every
 * pre-change model carries): provenance only — no `predictionUnitId`, no `featureSteps`, no `targetEntityName`.
 */
function legacyLineage(pipeline: MJMLTrainingPipelineEntity): string {
  const bindings = JsonParse.ParseJsonText(pipeline.SourceBindings, 'SourceBindings');
  if (!bindings.Ok) throw new Error(`the legacy pipeline ${pipeline.ID}'s SourceBindings is not JSON`);
  return JSON.stringify({
    pipelineId: pipeline.ID, pipelineVersion: pipeline.Version, sourceBindings: bindings.Value, asOfStrategy: { Mode: 'none' },
    sidecarVersion: 'truth-suite', lockedHoldoutRowCount: 1200, trainingRowCount: 4800, assembledAt: '2026-06-01T00:00:00.000Z',
  });
}

/** Loads R1, trains two models of its unit pipeline, publishes v1 and builds the legacy pipeline and model. */
async function createServingFixtures(): Promise<ServingFixtures> {
  const dataset = await DatasetLoader.Load({ Provider: server.Provider, User: server.User, Pool: pool }, { Kind: 'scenario', ID: 'R1', Seed: DatasetSeeds.SeedSet('scenario', 'R1', 'base')[0] });
  const unit = await createUnitPipeline(dataset);
  const v1 = await train(unit);
  const v2 = await train(unit);
  await setStatus(v1.ID, 'Published');
  const legacy = await createLegacyPipeline(unit);
  const legacyModelId = await createLegacyModel(legacy, v1);
  const keys = await rowsOf<{ ID: string }>(dataset.Entity.Name, '', ['ID'], 'ID ASC');
  return { Dataset: dataset, UnitPipeline: unit, V1: v1, V2: v2, LegacyPipelineID: legacy.ID, LegacyModelID: legacyModelId, RecordIDs: keys.slice(0, 4).map((k) => k.ID) };
}

// ------------------------------------------------------------------------------------------------ census and teardown ----

/** Every file under `dir`, recursively (0 when it does not exist). */
function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  return n;
}

/** The census: every ML table, the Model Feature Values, the ML Record Processes and their runs, Files, entities, Record Changes, the principal tables, schemas and storage files. */
async function census(): Promise<HarnessCensus> {
  const schema = server.Provider.EntityByName('MJ: ML Models')?.SchemaName;
  if (!schema) throw new Error('MJ: ML Models is not in metadata');
  const tables = (await pool.request().input('Schema', sql.NVarChar(128), schema)
    .query<{ name: string }>(`SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID(@Schema) AND name LIKE 'ML%' ORDER BY name`)).recordset.map((r) => r.name);
  const counts = (await pool.request().query<Record<string, number>>(`SELECT ${tables.map((n) => `(SELECT COUNT(*) FROM [${schema}].[${n}]) AS [${n}]`).join(', ')}`)).recordset[0];
  const c = (await pool.request().query<Omit<HarnessCensus, 'MLTables' | 'StorageFiles'>>(`SELECT
    (SELECT COUNT(*) FROM ${t('MJ: Feature Values')} WHERE Source = 'Model') AS ModelFeatureValues,
    (SELECT COUNT(*) FROM ${t('MJ: Record Processes')} WHERE WorkType = 'ML Model') AS MLRecordProcesses,
    (SELECT COUNT(*) FROM ${t('MJ: Process Runs')}) AS ProcessRuns, (SELECT COUNT(*) FROM ${t('MJ: Files')}) AS Files,
    (SELECT COUNT(*) FROM ${t('MJ: Entities')}) AS Entities, (SELECT COUNT(*) FROM ${t('MJ: Record Changes')}) AS RecordChanges,
    (SELECT COUNT(*) FROM ${t('MJ: Roles')}) AS Roles, (SELECT COUNT(*) FROM ${t('MJ: User Roles')}) AS UserRoles,
    (SELECT COUNT(*) FROM ${t('MJ: Authorization Roles')}) AS AuthorizationRoles, (SELECT COUNT(*) FROM sys.schemas) AS Schemas`)).recordset[0];
  return { ...c, MLTables: counts, StorageFiles: countFiles(storageRoot) };
}

/** Deletes the restricted principal's rows through the entity layer, children first; one line per failure. */
async function deletePrincipalRows(): Promise<string[]> {
  const failures: string[] = [];
  for (const row of principalRows.splice(0).reverse()) {
    const e = await server.Provider.GetEntityObject<BaseEntity>(row.EntityName, server.User);
    if (!(await e.InnerLoad(CompositeKey.FromID(row.ID)))) { failures.push(`${row.EntityName} ${row.ID}: not found`); continue; }
    if (!(await e.Delete())) failures.push(`${row.EntityName} ${row.ID}: ${e.LatestResult?.CompleteMessage || 'Delete() returned false'}`);
  }
  return failures;
}

/** Drops the scratch schema of the binding migration case and its tables. */
async function dropScratchSchema(): Promise<void> {
  if (scratchSchema === null) return;
  const s = scratchSchema;
  scratchSchema = null;
  await pool.request().query(`DROP TABLE IF EXISTS [${s}].[MLModelScoringBinding]; DROP TABLE IF EXISTS [${s}].[MLModel];
    DROP TABLE IF EXISTS [${s}].[MLTrainingPipeline]; DROP TABLE IF EXISTS [${s}].[RecordProcess];`);
  await pool.request().query(`DROP SCHEMA IF EXISTS [${s}]`);
}

/**
 * Puts the moved artifacts back, deletes what the file created (the M5.1 fixtures, the principal's rows, the recorded
 * pipelines with their models, runs, bindings, values, processes and files; the scratch schema; the Record Changes the
 * file's saves wrote, by `ChangedAt` since the file started — a private database under the suite lock), then requires
 * the starting census.
 */
async function teardown(): Promise<void> {
  restoreArtifactObjects();
  if (fixtures) await deleteFixtures(fixtures);
  const principal = await quietly(() => deletePrincipalRows());
  const recorded = await quietly(() => HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(server.Provider, server.User), harnessRecords));
  await dropScratchSchema();
  await pool.request().input('Since', sql.DateTimeOffset, startedAt).query(`DELETE FROM ${t('MJ: Record Changes')} WHERE ChangedAt >= @Since`);
  expect([principal.Result, principal.Unexpected, recorded.Result, recorded.Unexpected]).toEqual([[], [], [], []]);
  expect(await census()).toEqual(startCensus);
}

describe('M5.12 harness', () => {
  beforeAll(async () => {
    const built = await quietly(() => createServingFixtures());
    expect(built.Unexpected).toEqual([]);
    serving = built.Result;
  }, CASE_TIMEOUT_MS);

  // -------------------------------------------------------------------------------------------------- artifact state ----
  describe('artifact state: the Published model\'s artifact missing', () => {
    it('an unverifiable artifact refuses the binding run before any record', async () => {
      const f = servingFixtures();
      const binding = await newBinding(f.UnitPipeline.ID, 'artifact missing');
      await removeArtifactObject(f.V1.ID);
      const out = await quietly(() => new ScoringService(scoringCtx(server.User, server.Provider)).Score(binding, scope(), runDay(), false)).finally(() => restoreArtifactObjects());
      expect(out.Unexpected).toEqual([]);
      expect(out.Result).toMatchObject({ Status: 'refused', ModelID: f.V1.ID, Reason: { kind: 'artifact-missing', fileId: f.V1.ArtifactFileID } });
      const runs = await scoringRuns(binding.ID);
      expect(runs.map((r) => [r.Status, r.Total, r.Written, r.RefusalObject?.kind])).toEqual([['refused', 0, 0, 'artifact-missing']]);
      expect([await modelRows(binding.ID), (await loadModel(f.V1.ID)).ArtifactStatus]).toEqual([[], 'missing']);
      // The object is back: the registry re-verifies every load, so the model scores again (and its status says so).
      const again = await quietly(() => new ScoringService(scoringCtx(server.User, server.Provider)).Score(binding, scope(), runDay(), false));
      expect([again.Result.Status, again.Unexpected, (await modelRows(binding.ID)).length]).toEqual(['completed', [], f.RecordIDs.length]);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------------------ concurrent publish ----
  describe('concurrent publish: a new model published while a binding run is between batches', () => {
    it('a run keeps the model it resolved when another publish lands mid-run', async () => {
      const f = servingFixtures();
      const binding = await newBinding(f.UnitPipeline.ID, 'publish mid-run');
      // Adversary: before batch 2's sidecar call, v2 is published and v1 archived (the gate's two writes, by SQL).
      const sidecar = new InterleavingSidecar(new Map([[2, async () => { await setStatus(f.V1.ID, 'Archived'); await setStatus(f.V2.ID, 'Published'); }]]));
      const out = await quietly(() => new ScoringService(scoringCtx(server.User, server.Provider, { Sidecar: sidecar, BatchSize: 2 })).Score(binding, scope(), runDay(), false));
      expect(out.Unexpected).toEqual([]);
      expect(out.Result).toMatchObject({ Status: 'completed', ModelID: f.V1.ID, Total: 4, Written: 4 });
      expect([sidecar.Requests.length, new Set(sidecar.Requests.map((r) => r.artifact_b64)).size, (await loadModel(f.V2.ID)).Status]).toEqual([2, 1, 'Published']);
      const rows = await modelRows(binding.ID);
      const [run] = await scoringRuns(binding.ID);
      expect([rows.length, allAre(rows.map((r) => r.MLModelID), f.V1.ID), allAre(rows.map((r) => r.MLScoringRunID), run.ID), run.ModelID !== null && UUIDsEqual(run.ModelID, f.V1.ID)])
        .toEqual([4, true, true, true]);
    }, CASE_TIMEOUT_MS);
  });

  describe('concurrent publish: two runs of one binding and as-of date at once', () => {
    it('two concurrent runs of one as-of date leave one row per key (the loser\'s batch fails on UQ_FeatureValue_ModelRow and is reported, never duplicated)', async () => {
      const f = servingFixtures();
      const binding = await newBinding(f.UnitPipeline.ID, 'two runs at once');
      const values = new BarrierValues(2, 60_000);
      // Two requests, each on its own provider instance (its own transaction), as two API calls are.
      const providers = await Promise.all([MLModelInferenceProcessor.BatchProvider(server.Provider), MLModelInferenceProcessor.BatchProvider(server.Provider)]);
      const runOne = (i: number): Promise<ScoringResult> => new ScoringService(scoringCtx(server.User, providers[i].Provider, { Values: values })).Score(binding, scope(), runDay(), false);
      const out = await quietly(() => Promise.all([runOne(0), runOne(1)])).finally(() => Promise.all(providers.map((p) => p.Independent?.ReleaseIndependentInstance())));
      const statuses = out.Result.map((r) => r.Status).sort();
      const loser = out.Result.find((r) => r.Status === 'failed');
      expect(statuses).toEqual(['completed', 'failed']);
      expect(loser?.Status === 'failed' ? loser.FirstErrors.map((e) => e.message).join('\n') : '').toContain('UQ_FeatureValue_ModelRow');
      const rows = await modelRows(binding.ID);
      expect([rows.length, new Set(rows.map((r) => r.RecordID.toLowerCase())).size]).toEqual([f.RecordIDs.length, f.RecordIDs.length]);
      const runs = await scoringRuns(binding.ID);
      expect(runs.map((r) => [r.Status, r.Written]).sort()).toEqual([['completed', 4], ['failed', 0]]);
      // The loser's report: its run row stores the failure, naming the constraint.
      const failed = runs.find((r) => r.Status === 'failed');
      expect((failed?.FirstErrorsObject || []).map((e) => e.message).join('\n')).toContain('UQ_FeatureValue_ModelRow');
      expect(out.Unexpected.every((l) => l.includes('UQ_FeatureValue_ModelRow'))).toBe(true);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------------------ unauthorized user ----
  describe('unauthorized user: a Score Record Set caller without create permission on MJ: Feature Values', () => {
    it('a caller who cannot create Feature Values gets a refused run, not a partial write', async () => {
      const f = servingFixtures();
      const restricted = await restrictedScorer();
      const scoringRunsEntity = server.Provider.EntityByName('MJ: ML Scoring Runs');
      const featureValues = server.Provider.EntityByName('MJ: Feature Values');
      if (!scoringRunsEntity || !featureValues) throw new Error('MJ: ML Scoring Runs or MJ: Feature Values is not in metadata');
      // In-process only (no MJ: Entity Permissions row is written): the principal's role may open and close scoring runs.
      const grant = new EntityPermissionInfo({ ID: randomUUID().toUpperCase(), EntityID: scoringRunsEntity.ID, RoleID: restricted.RoleID, Type: 'Allow', CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: false }, server.Provider);
      scoringRunsEntity.Permissions.push(grant);
      try {
        const binding = await newBinding(f.UnitPipeline.ID, 'no create on Feature Values');
        expect([featureValues.GetUserPermisions(restricted.User).CanCreate, scoringRunsEntity.GetUserPermisions(restricted.User).CanCreate,
          await ScoringBindings.CallerHoldsBinding(binding, scoringCtx(restricted.User, server.Provider))]).toEqual([false, true, true]);
        const out = await quietly(() => new ScoringService(scoringCtx(restricted.User, server.Provider, { BatchSize: 2 })).Score(binding, scope(), runDay(), false));
        expect(await modelRows(binding.ID)).toEqual([]);
        const runs = await scoringRuns(binding.ID);
        // Refused before any read (D4-165): the stored run names the refusal and holds no row errors.
        expect(out.Unexpected).toEqual([]);
        expect(out.Result).toMatchObject({ Status: 'refused', ModelID: null, Reason: { kind: 'feature-values-not-writable', userId: restricted.User.ID } });
        expect(runs.map((r) => [r.Status, r.Written, r.RefusalObject?.kind, (r.FirstErrorsObject || []).map((e) => e.message)])).toEqual([['refused', 0, 'feature-values-not-writable', []]]);
      } finally {
        scoringRunsEntity.Permissions.splice(scoringRunsEntity.Permissions.indexOf(grant), 1);
      }
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------------- deleted parent or child ----
  describe('deleted parent or child: a serving pre-change model of a pipeline with no Prediction Unit (MoreCheese\'s shape)', () => {
    it('a serving pre-change model of a unitless pipeline scores through the transform-only assembly and writes its rows (through a binding)', async () => {
      const f = servingFixtures();
      const binding = await newBinding(f.LegacyPipelineID, 'legacy binding');
      const out = await quietly(() => new ScoringService(scoringCtx(server.User, server.Provider)).Score(binding, scope(), runDay(), false));
      expect(out.Unexpected).toEqual([]);
      expect(out.Result.Status === 'refused' ? out.Result.Reason : null).toBeNull();
      expect(out.Result).toMatchObject({ Status: 'completed', ModelID: f.LegacyModelID, Total: 4, Written: 4 });
      const rows = await modelRows(binding.ID);
      expect([rows.length, allAre(rows.map((r) => r.MLModelID), f.LegacyModelID), rows.every((r) => r.Role === 'Champion')]).toEqual([4, true, true]);
    }, CASE_TIMEOUT_MS);

    it('a serving pre-change model of a unitless pipeline scores through the transform-only assembly and writes its rows (through its Record Process)', async () => {
      const f = servingFixtures();
      const keys = f.RecordIDs.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
      const created = await CreateScoringProcess({
        modelId: f.LegacyModelID, targetEntityName: f.Dataset.Entity.Name, scope: { filter: `ID IN (${keys})` },
        featureName: `${HARNESS_TAG} legacy process`, name: `${HARNESS_TAG} legacy process`, provider: server.Provider, contextUser: server.User,
      });
      const out = await quietly(() => new RecordProcessRunNowOperation().Execute({ recordProcessID: created.recordProcess.ID }, { provider: server.Provider, user: server.User }));
      expect(out.Unexpected).toEqual([]);
      const runId = out.Result.Output?.processRunID;
      if (!out.Result.Success || !runId) throw new Error(`RecordProcess.RunNow failed (${out.Result.ResultCode || 'no code'}): ${out.Result.ErrorMessage || 'no processRunID'}`);
      const [run] = await rowsOf<Pick<MJProcessRunEntity, 'Status' | 'ErrorMessage'>>('MJ: Process Runs', `ID='${EscapeSQLString(runId)}'`, ['Status', 'ErrorMessage']);
      expect([run.Status, run.ErrorMessage]).toEqual(['Completed', null]);
      const rows = await modelRows(created.binding.ID);
      const runs = await scoringRuns(created.binding.ID);
      expect([rows.length, allAre(rows.map((r) => r.MLModelID), f.LegacyModelID), runs.every((r) => r.Status === 'completed' && r.ModelID !== null && UUIDsEqual(r.ModelID, f.LegacyModelID))])
        .toEqual([4, true, true]);
    }, CASE_TIMEOUT_MS);
  });

  // ------------------------------------------------------------------------------------- binding state: existing rows ----
  describe('binding state: an existing pre-change binding (two of one model on one entity, one Materialized)', () => {
    it('pre-change bindings migrate to pipeline, de-duplicated feature names and OnDemand', async () => {
      const s = await seedScratchCopy();
      for (const batch of bindingDataSection(s.Schema)) await pool.request().batch(batch);
      const migrated = (await pool.request().query<{ ID: string; MLTrainingPipelineID: string; TargetEntityID: string; FeatureName: string; TargetColumnSource: string | null; Mode: string; Status: string }>(
        `SELECT CAST(ID AS NVARCHAR(36)) AS ID, CAST(MLTrainingPipelineID AS NVARCHAR(36)) AS MLTrainingPipelineID, CAST(TargetEntityID AS NVARCHAR(36)) AS TargetEntityID,
                FeatureName, TargetColumnSource, Mode, Status FROM [${s.Schema}].[MLModelScoringBinding] ORDER BY __mj_CreatedAt`)).recordset;
      expect(migrated.map((b) => [b.FeatureName, b.TargetColumnSource, b.Mode, b.Status])).toEqual([
        ['PSTruth churn', '$.AdverseProbability', 'OnDemand', 'Active'],
        ['PSTruth churn (2)', null, 'OnDemand', 'Active'],
        ['PSTruth churn (3)', null, 'Scheduled', 'Active'],
        ['PSTruth spend', '$.Value', 'OnDemand', 'Active'],
      ]);
      expect(migrated.map((b) => [UUIDsEqual(b.MLTrainingPipelineID, b.FeatureName.startsWith('PSTruth churn') ? s.Churn : s.Spend), UUIDsEqual(b.TargetEntityID, s.Entity)]))
        .toEqual([[true, true], [true, true], [true, true], [true, true]]);
      const mappings = (await pool.request().query<{ ID: string; OutputMapping: string | null }>(
        `SELECT CAST(ID AS NVARCHAR(36)) AS ID, OutputMapping FROM [${s.Schema}].[RecordProcess]`)).recordset;
      expect(mappings.map((m) => [s.BoundProcesses.some((id) => UUIDsEqual(id, m.ID)), m.OutputMapping]).sort()).toEqual([[false, '{"Score":"KeepMe"}'], [true, null], [true, null]]);
    }, CASE_TIMEOUT_MS);
  });

  // ---------------------------------------------------------------------------- null or missing score: key volume ----
  describe('null or missing score: a record whose RecordID is a 900-character CompositeKey (A-FV-VOLUME, warning 1945)', () => {
    it('a batch holding a 900-character RecordID fails loudly and keeps none of its rows', async () => {
      const f = servingFixtures();
      const binding = await newBinding(f.UnitPipeline.ID, 'key volume');
      const scored = await quietly(() => new ScoringService(scoringCtx(server.User, server.Provider)).Score(binding, scope(f.RecordIDs.slice(0, 1)), runDay(), false));
      const completed = scored.Result;
      if (completed.Status !== 'completed') throw new Error(`the key-volume fixture run did not complete: ${JSON.stringify(completed)}`);
      const longKey = nineHundredCharacterKey();
      const shortKey = randomUUID();
      const row = (recordId: string): ModelValueRow => ({ RecordID: recordId, Value: { ValueNumeric: 0.5, ValueText: null, ValueBoolean: null, ValueDate: null, ValueJSON: null }, Confidence: null, InTraining: false });
      const independent = await MLModelInferenceProcessor.BatchProvider(server.Provider);
      const ctx = scoringCtx(server.User, independent.Provider);
      const write = (): Promise<unknown> => ProviderTransactions.Run(ctx, 'a scoring batch holding a 900-character RecordID', () => FeatureValueCacheService.Instance.RecordModelValues({
        MLModelScoringBindingID: binding.ID, EntityID: f.Dataset.Entity.ID, FeatureName: binding.FeatureName, Role: 'Champion', MLModelID: completed.ModelID,
        MLScoringRunID: completed.ScoringRunID, EffectiveAsOf: runDay(), ProcessRunID: null, Rows: [row(shortKey), row(longKey)], ContextUser: server.User, Provider: independent.Provider,
      }));
      const out = await quietly(async () => { try { await write(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } })
        .finally(() => independent.Independent?.ReleaseIndependentInstance());
      expect(longKey.length).toBe(900);
      expect(out.Result).toMatch(/exceeds the maximum length of 1700 bytes/);
      expect((await modelRows(binding.ID)).map((r) => r.RecordID.toLowerCase())).toEqual([f.RecordIDs[0].toLowerCase()]);
    }, CASE_TIMEOUT_MS);
  });
});

// ------------------------------------------------------------------------------------------ the case fixtures ----

/** A 900-character two-field CompositeKey segment (`Field|value||Field|value`), the longest value `RecordID` holds. */
function nineHundredCharacterKey(): string {
  const head = CompositeKey.FromKeyValuePairs([{ FieldName: 'TenantCode', Value: 'T' }, { FieldName: 'MemberCode', Value: '' }]).ToURLSegment();
  return CompositeKey.FromKeyValuePairs([{ FieldName: 'TenantCode', Value: 'T' }, { FieldName: 'MemberCode', Value: 'M'.repeat(900 - head.length) }]).ToURLSegment();
}

/**
 * The suite's restricted user (`it-nogrant@integration.test`) as a Score Record Set caller who holds the binding's view
 * authorization and may not create Feature Values: a role of the file's (`MJ: Roles`) granted "View Model Predictions"
 * (`MJ: Authorization Roles`) and given to the user (`MJ: User Roles`) — stored, because `vwUserHeldAuthorizations`
 * reads the stored roles —, and in process the `UI` role besides (read on every scoring entity, create on none).
 */
async function restrictedScorer(): Promise<{ readonly User: UserInfo; readonly RoleID: string }> {
  const [seeded] = await rowsOf<Pick<MJUserEntity, 'ID' | 'Name' | 'Email' | 'Type' | 'IsActive'>>('MJ: Users', `Email='${EscapeSQLString(SEEDED_NOGRANT_EMAIL)}'`, ['ID', 'Name', 'Email', 'Type', 'IsActive']);
  if (!seeded) throw new Error(`the user ${SEEDED_NOGRANT_EMAIL} is not seeded: run ${SEED_FIXTURES_COMMAND}`);
  const [ui] = await rowsOf<Pick<MJRoleEntity, 'ID'>>('MJ: Roles', `Name='UI'`, ['ID']);
  if (!ui) throw new Error('the UI role is not in MJ: Roles');
  const role = await createRow<MJRoleEntity>('MJ: Roles', (r) => { r.Name = `${HARNESS_TAG} prediction viewers`; r.Description = 'Predictive Studio truth suite (safe to delete)'; });
  principalRows.push({ EntityName: 'MJ: Roles', ID: role.ID });
  const allow = await createRow<MJAuthorizationRoleEntity>('MJ: Authorization Roles', (a) => { a.AuthorizationID = ScoringBindings.ResolveViewAuthorizationID(null, server.Provider); a.RoleID = role.ID; a.Type = 'Allow'; });
  principalRows.push({ EntityName: 'MJ: Authorization Roles', ID: allow.ID });
  const member = await createRow<MJUserRoleEntity>('MJ: User Roles', (u) => { u.UserID = seeded.ID; u.RoleID = role.ID; });
  principalRows.push({ EntityName: 'MJ: User Roles', ID: member.ID });
  const user = new UserInfo(server.Provider, {
    ID: seeded.ID, Name: seeded.Name, Email: seeded.Email, Type: seeded.Type, IsActive: seeded.IsActive,
    UserRoles: [new UserRoleInfo({ UserID: seeded.ID, RoleID: ui.ID }), new UserRoleInfo({ UserID: seeded.ID, RoleID: role.ID })],
  });
  return { User: user, RoleID: role.ID };
}

/** The scratch copy the binding migration case seeds: its schema, entity, pipelines and the processes its bindings name. */
interface ScratchCopy {
  readonly Schema: string;
  readonly Entity: string;
  readonly Churn: string;
  readonly Spend: string;
  readonly BoundProcesses: readonly string[];
}

/**
 * A scratch copy of the four tables the migration's binding data section reads, in their pre-change shape (the binding
 * still names `MLModelID`, `MaterializedResultID` and `Mode 'Materialized'`), seeded with: two bindings of one
 * classification model on one entity (one with a column and a bound process, one `Materialized` with a bound process),
 * a third of the same model with no target entity, a regression model's binding with a column, and a process no binding
 * names. Nothing is registered as an entity; teardown drops the schema.
 */
async function seedScratchCopy(): Promise<ScratchCopy> {
  const s = `ps_m512_${Date.now()}`;
  scratchSchema = s;
  await pool.request().batch(`CREATE SCHEMA [${s}]`);
  await pool.request().batch(`
    CREATE TABLE [${s}].[MLTrainingPipeline] ([ID] UNIQUEIDENTIFIER PRIMARY KEY, [Name] NVARCHAR(255) NOT NULL, [TargetEntityID] UNIQUEIDENTIFIER NULL);
    CREATE TABLE [${s}].[MLModel] ([ID] UNIQUEIDENTIFIER PRIMARY KEY, [PipelineID] UNIQUEIDENTIFIER NOT NULL, [ProblemType] NVARCHAR(20) NOT NULL);
    CREATE TABLE [${s}].[RecordProcess] ([ID] UNIQUEIDENTIFIER PRIMARY KEY, [OutputMapping] NVARCHAR(MAX) NULL);
    CREATE TABLE [${s}].[MLModelScoringBinding] ([ID] UNIQUEIDENTIFIER PRIMARY KEY, [MLModelID] UNIQUEIDENTIFIER NOT NULL, [TargetEntityID] UNIQUEIDENTIFIER NULL,
      [TargetColumn] NVARCHAR(255) NULL, [RecordProcessID] UNIQUEIDENTIFIER NULL, [Mode] NVARCHAR(20) NOT NULL, [MaterializedResultID] UNIQUEIDENTIFIER NULL,
      [__mj_CreatedAt] DATETIMEOFFSET NOT NULL);`);
  const id = (): string => randomUUID().toUpperCase();
  const c: ScratchCopy = { Schema: s, Entity: servingFixtures().Dataset.Entity.ID, Churn: id(), Spend: id(), BoundProcesses: [id(), id()] };
  const [classification, regression, kept] = [id(), id(), id()];
  await pool.request()
    .input('E', sql.UniqueIdentifier, c.Entity).input('Churn', sql.UniqueIdentifier, c.Churn).input('Spend', sql.UniqueIdentifier, c.Spend)
    .input('MC', sql.UniqueIdentifier, classification).input('MR', sql.UniqueIdentifier, regression)
    .input('RP1', sql.UniqueIdentifier, c.BoundProcesses[0]).input('RP2', sql.UniqueIdentifier, c.BoundProcesses[1]).input('RP3', sql.UniqueIdentifier, kept)
    .batch(`
      INSERT INTO [${s}].[MLTrainingPipeline] VALUES (@Churn, N'PSTruth churn', @E), (@Spend, N'PSTruth spend', @E);
      INSERT INTO [${s}].[MLModel] VALUES (@MC, @Churn, N'classification'), (@MR, @Spend, N'regression');
      INSERT INTO [${s}].[RecordProcess] VALUES (@RP1, N'{"Score":"RenewalScore"}'), (@RP2, N'{"Score":"RenewalScore"}'), (@RP3, N'{"Score":"KeepMe"}');
      INSERT INTO [${s}].[MLModelScoringBinding] VALUES
        (NEWID(), @MC, @E, N'RenewalScore', @RP1, N'OnDemand', NULL, '2026-01-01T00:00:00Z'),
        (NEWID(), @MC, @E, NULL, @RP2, N'Materialized', NEWID(), '2026-01-02T00:00:00Z'),
        (NEWID(), @MC, NULL, NULL, NULL, N'Scheduled', NULL, '2026-01-03T00:00:00Z'),
        (NEWID(), @MR, @E, N'Spend', NULL, N'OnDemand', NULL, '2026-01-04T00:00:00Z');`);
  return c;
}

/**
 * The migration's own binding statements, verbatim from the newest v6 migration holding them, against `schema`: section
 * 7 (the six columns) and section 8 (the existing-binding data section), then section 9's two `NOT NULL` alters and the
 * `UQ_MLModelScoringBinding_EntityFeature` index (so the de-duplicated names are proven unique by the index itself). One
 * batch per `GO`.
 */
function bindingDataSection(schema: string): string[] {
  const v6 = new URL('../../../../../../migrations/v6/', import.meta.url);
  const start = '-- 7. MLModelScoringBinding: a binding defines a prediction feature';
  const end = '-- 9. MLModelScoringBinding: the model reference and the materialized mode removed';
  const texts = readdirSync(v6).filter((n) => n.endsWith('.sql')).sort().map((n) => readFileSync(new URL(n, v6), 'utf8')).filter((x) => x.includes(start) && x.includes(end));
  const text = texts[texts.length - 1];
  if (text === undefined) throw new Error('no v6 migration holds the binding data section');
  const sections = text.slice(text.indexOf(start), text.indexOf(end));
  const nine = text.slice(text.indexOf(end));
  const notNull = nine.split('\n').filter((l) => /ALTER COLUMN \[(MLTrainingPipelineID|FeatureName)\]/.test(l));
  const index = nine.slice(nine.indexOf('CREATE UNIQUE NONCLUSTERED INDEX [UQ_MLModelScoringBinding_EntityFeature]'));
  const uq = index.slice(0, index.indexOf('\nGO'));
  if (notNull.length !== 2 || !uq.startsWith('CREATE UNIQUE')) throw new Error('section 9 no longer holds the two NOT NULL alters and the feature-name index');
  return [...sections.split(/^GO\s*$/m), notNull.join('\n'), uq]
    .map((b) => b.split('${flyway:defaultSchema}').join(schema).trim())
    .filter((b) => b.split('\n').some((l) => l.trim().length > 0 && !l.trim().startsWith('--')));
}
