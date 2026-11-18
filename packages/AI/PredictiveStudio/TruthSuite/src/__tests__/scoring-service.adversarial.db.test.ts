// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// A model's prediction is a Feature Value with Source = 'Model'. Every case writes the way production writes — a
// generated entity saved through BootstrapIntegrationServer()'s provider, or direct SQL for a row no entity save can
// shape — and expects the database to keep a prediction's lineage whole: its binding, model, scoring run, as-of instant
// and in-training flag, one row per binding, record, as-of instant and role.
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { RunView, type BaseEntity, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type {
  MJFeatureValueEntity,
  MJMLAlgorithmEntity,
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
  MJMLScoringRunEntity,
  MJMLTrainingPipelineEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
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

beforeAll(async () => {
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
  fixtures = await createFixtures();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  if (fixtures) await deleteFixtures(fixtures);
  await pool?.close();
  await server?.ClosePool();
});

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
