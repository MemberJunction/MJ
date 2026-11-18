// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// The scoring service's write path on SQL Server: the run rows its CHECK constraints admit (a model-less refusal, a
// completed run), the binding's view authorization read through vwUserHeldAuthorizations, the model rows written per
// batch in one transaction and replaced by a same-day re-run (the EffectiveAsOf ISO filter against the DATETIMEOFFSET
// column), the column copy rounded to a decimal(3,2) column's scale and cleared again by withdrawal, and the model-row
// writer's single RecordID IN (…) read at the service's batch size. The sidecar and the model runtime are doubles (no
// model is trained here); every row is written through the service and the generated entities.
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import sql from 'mssql';
import { RunView, UserInfo, type BaseEntity, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type { MJUserEntity, MJFileEntity, MJFileStorageProviderEntity, MJMLAlgorithmEntity, MJMLModelEntity, MJMLModelScoringBindingEntity, MJMLTrainingPipelineEntity, MJKnowledgeHubSavedSearchEntity } from '@memberjunction/core-entities';
import { FeatureValueCacheService, type ModelValueRow } from '@memberjunction/feature-pipelines';
import { UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
  InMemoryArtifactLoader, SCORING_BATCH_SIZE_DEFAULT, ScoringBindings, ScoringService,
  type IScoringModelRuntime, type IScoringPreparedModel, type ISidecarPredictor, type LoadedModel, type ScoringContext,
} from '@memberjunction/predictive-studio';
import { resolveOutcomeConfig, type FeatureSchemaEntry, type PredictRequest, type PredictResponse } from '@memberjunction/predictive-studio-core';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { createHash } from 'node:crypto';
import { TruthConnection } from '../db/connection';
import { ConsoleCapture } from './fixtures/console-capture';

const TAG = `PSScoringWrites-${Date.now()}`;
/** The target entity: a plain MJ entity with a decimal(3,2) column (`MinScore`) and no save hooks. */
const TARGET = 'MJ: Knowledge Hub Saved Searches';
/** The run date of every case: the service's clock reads this day. */
const RUN_DAY = new Date('2026-10-01T00:00:00Z');
const FEATURES: readonly FeatureSchemaEntry[] = [{ Name: 'Tenure', Kind: 'numeric' }];
/** Each target record's adverse-class probability: four decimals, so the decimal(3,2) copy must round it. */
const ADVERSE: Readonly<Record<string, number>> = { r1: 0.7123, r2: 0.4567 };

interface Fixtures {
  readonly PipelineID: string;
  readonly ModelID: string;
  readonly FileID: string;
  readonly Binding: MJMLModelScoringBindingEntity;
  /** Target record ID by the fixture's record name (r1, r2). */
  readonly Records: Readonly<Record<string, string>>;
}

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let fixtures: Fixtures;
const artifact = new TextEncoder().encode(`artifact of ${TAG}`);

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
  const entity = provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** Save a new row of `entityName` with `fill` applied; throws with the provider's message when the save fails. */
async function createRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void): Promise<T> {
  const row = await server.Provider.GetEntityObject<T>(entityName, server.User);
  row.NewRecord();
  fill(row);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** The first row of `entityName`'s ID, which a fixture names. */
async function anyId<T extends { ID: string }>(entityName: string): Promise<string> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<T>({ EntityName: entityName, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, server.User);
  const id = r.Results[0]?.ID;
  if (!r.Success || !id) throw new Error(`no ${entityName} row for the fixture: push the metadata`);
  return id;
}

/** The sidecar double: the `Tenure` cell is the record's adverse probability; class order (renewed, lapsed), lapsed adverse. */
class StubSidecar implements ISidecarPredictor {
  public async predict(req: PredictRequest): Promise<PredictResponse> {
    return { classOrder: ['renewed', 'lapsed'], predictions: req.rows.map((row) => ({ score: Number(row['Tenure']), class: 'lapsed', probabilities: [1 - Number(row['Tenure']), Number(row['Tenure'])] })) };
  }
}

/** The model runtime double: a model trained without a unit on the target entity, assembling each record's adverse probability. */
class StubRuntime implements IScoringModelRuntime {
  constructor(private readonly byRecordId: () => ReadonlyMap<string, number>) {}
  /** A record's planted adverse probability. */
  private adverseOf(id: string): number {
    const v = this.byRecordId().get(id.toLowerCase());
    if (v === undefined) throw new Error(`StubRuntime: record ${id} is not a fixture record`);
    return v;
  }
  public async Prepare(model: MJMLModelEntity): Promise<IScoringPreparedModel> {
    const loaded: LoadedModel = {
      modelId: model.ID, targetEntityName: TARGET, artifactB64: Buffer.from(artifact).toString('base64'), fittedPreprocessing: {}, featureSchema: [...FEATURES],
      problemType: 'classification', targetVariable: 'Lapsed', sourceBindings: [], featureSteps: { Steps: [] }, asOf: { Mode: 'none' },
      leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, outcomeConfig: resolveOutcomeConfig(), unit: null, trainingRowIds: new UUIDSet(),
    };
    return {
      Loaded: loaded,
      Assemble: async (ids) => ({
        Status: 'assembled', Matrix: { columns: ['Tenure'], rows: ids.map((id) => [this.adverseOf(id)]) },
        Columns: [...FEATURES], HashColumns: null, RowIDs: [...ids],
      }),
    };
  }
}

/** The service context of `user`, with the sidecar, runtime and artifact loader replaced. */
function ctx(user: UserInfo = server.User): ScoringContext {
  const byRecord = (): ReadonlyMap<string, number> => new Map(Object.entries(fixtures.Records).map(([name, id]) => [id.toLowerCase(), ADVERSE[name]]));
  const artifacts = new InMemoryArtifactLoader();
  artifacts.Set(fixtures.FileID, artifact);
  return {
    ContextUser: user, Provider: server.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null,
    Seams: { Sidecar: new StubSidecar(), Runtime: new StubRuntime(byRecord), ArtifactLoader: artifacts, Clock: { Now: () => RUN_DAY } },
  };
}

/** One Published classification model on the target entity with a registered artifact, and a binding copying into MinScore. */
async function createFixtures(): Promise<Fixtures> {
  const algorithmId = await anyId<Pick<MJMLAlgorithmEntity, 'ID'>>('MJ: ML Algorithms');
  const providerId = await anyId<Pick<MJFileStorageProviderEntity, 'ID'>>('MJ: File Storage Providers');
  const tagsId = server.Provider.EntityByName(TARGET)?.ID;
  if (!tagsId) throw new Error(`${TARGET} is not in metadata`);
  const pipeline = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (p) => {
    p.Name = TAG; p.TargetEntityID = tagsId; p.TargetVariable = 'Lapsed'; p.ProblemType = 'classification'; p.AlgorithmID = algorithmId;
  });
  const file = await createRow<MJFileEntity>('MJ: Files', (f) => { f.Name = `${TAG}.bin`; f.ProviderID = providerId; });
  const model = await createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
    m.PipelineID = pipeline.ID; m.AlgorithmID = algorithmId; m.Version = 1; m.FeatureSchema = JSON.stringify(FEATURES); m.TargetVariable = 'Lapsed'; m.ProblemType = 'classification';
  });
  // Status is the lifecycle gate's to write (its PreSave guard refuses an entity save), so the fixture publishes by SQL.
  await pool.request()
    .input('ID', sql.UniqueIdentifier, model.ID).input('FileID', sql.UniqueIdentifier, file.ID)
    .input('Sha', sql.Char(64), createHash('sha256').update(artifact).digest('hex'))
    .input('Semantics', sql.NVarChar(sql.MAX), JSON.stringify({ task: { kind: 'binary', classOrder: ['renewed', 'lapsed'], adverseIndex: 1 } }))
    .query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Models')} SET Status = 'Published', ArtifactFileID = @FileID, ArtifactSha256 = @Sha, OutputSemantics = @Semantics WHERE ID = @ID`);
  const records: Record<string, string> = {};
  for (const name of Object.keys(ADVERSE)) {
    records[name] = (await createRow<MJKnowledgeHubSavedSearchEntity>(TARGET, (t) => { t.Name = `${TAG}-${name}`; t.UserID = server.User.ID; t.Query = TAG; })).ID;
  }
  const binding = await createRow<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', (b) => {
    b.MLTrainingPipelineID = pipeline.ID; b.FeatureName = TAG; b.TargetEntityID = tagsId; b.Mode = 'OnDemand'; b.Status = 'Active';
    b.ViewAuthorizationID = ScoringBindings.ResolveViewAuthorizationID(null, server.Provider);
    b.TargetColumn = 'MinScore'; b.TargetColumnSource = '$.AdverseProbability';
  });
  return { PipelineID: pipeline.ID, ModelID: model.ID, FileID: file.ID, Binding: binding, Records: records };
}

/**
 * Delete every row the file created, children first, found by the file's tag (so a setup that failed part-way is
 * cleaned too). The binding entity refuses a delete before withdrawal, so the teardown is SQL.
 */
async function deleteFixtures(): Promise<void> {
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  const bindings = `SELECT ID FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName = @Tag`;
  const pipelines = `SELECT ID FROM ${t('MJ: ML Training Pipelines')} WHERE Name = @Tag`;
  await pool.request().input('Tag', sql.NVarChar(255), TAG).input('TagPrefix', sql.NVarChar(255), `${TAG}%`).query(`
      DELETE FROM ${t('MJ: Feature Values')} WHERE MLModelScoringBindingID IN (${bindings});
      DELETE FROM ${t('MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID IN (${bindings});
      DELETE FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName = @Tag;
      DELETE FROM ${t('MJ: ML Models')} WHERE PipelineID IN (${pipelines});
      DELETE FROM ${t('MJ: ML Training Pipelines')} WHERE Name = @Tag;
      DELETE FROM ${t('MJ: Files')} WHERE Name LIKE @TagPrefix;
      DELETE FROM ${t(TARGET)} WHERE Name LIKE @TagPrefix;
      DELETE FROM ${t('MJ: Users')} WHERE Name LIKE @TagPrefix;`);
}

/** The target records' MinScore as SQL Server stores it, by record name. */
async function minWeights(): Promise<Record<string, number | null>> {
  const r = await pool.request().input('TagPrefix', sql.NVarChar(255), `${TAG}-%`).query<{ Name: string; MinScore: number | null }>(
    `SELECT Name, CAST(MinScore AS FLOAT) AS MinScore FROM ${tableOf(server.Provider, TARGET)} WHERE Name LIKE @TagPrefix ORDER BY Name`);
  return Object.fromEntries(r.recordset.map((row) => [row.Name.slice(TAG.length + 1), row.MinScore]));
}

/** The binding's Model rows and its runs, as SQL Server stores them. */
async function stored(): Promise<{ readonly Rows: number; readonly AsOf: string[]; readonly Runs: { Status: string; Written: number; ModelID: string | null }[] }> {
  const rows = await pool.request().input('BindingID', sql.UniqueIdentifier, fixtures.Binding.ID).query<{ N: number; AsOf: string }>(
    `SELECT COUNT(*) AS N, CONVERT(NVARCHAR(40), EffectiveAsOf, 127) AS AsOf FROM ${tableOf(server.Provider, 'MJ: Feature Values')} WHERE MLModelScoringBindingID = @BindingID AND Source = 'Model' GROUP BY EffectiveAsOf`);
  const runs = await pool.request().input('BindingID', sql.UniqueIdentifier, fixtures.Binding.ID).query<{ Status: string; Written: number; ModelID: string | null }>(
    `SELECT Status, Written, CAST(ModelID AS NVARCHAR(36)) AS ModelID FROM ${tableOf(server.Provider, 'MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID = @BindingID ORDER BY StartedAt`);
  return { Rows: rows.recordset.reduce((n, r) => n + r.N, 0), AsOf: rows.recordset.map((r) => r.AsOf), Runs: runs.recordset };
}

const BOOTSTRAP_TIMEOUT_MS = 120_000;

beforeAll(async () => {
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
  fixtures = await createFixtures();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  if (pool && server) await deleteFixtures();
  await pool?.close();
  await server?.ClosePool();
});

describe('ScoringService on the database', () => {
  const scope = (): { readonly kind: 'record-ids'; readonly entity: string; readonly ids: string[] } => ({ kind: 'record-ids', entity: TARGET, ids: Object.values(fixtures.Records) });

  it('checks the binding\'s view authorization through vwUserHeldAuthorizations, and refuses a caller who holds none with a model-less refused run', async () => {
    // A scratch user with no UserRole rows, acting with the fixture user's roles in memory: entity permissions pass, and
    // vwUserHeldAuthorizations (which reads the stored roles) holds nothing for it.
    const row = await createRow<MJUserEntity>('MJ: Users', (u) => { u.Name = `${TAG} stranger`; u.Email = `${TAG}@example.com`; u.Type = 'User'; u.IsActive = true; });
    const stranger = new UserInfo(server.Provider, {
      ID: row.ID, Name: row.Name, Email: row.Email, Type: 'User',
      UserRoles: server.User.UserRoles.map((r) => ({ ID: r.ID, UserID: row.ID, RoleID: r.RoleID, Role: r.Role })),
    });
    expect(await ScoringBindings.CallerHoldsBinding(fixtures.Binding, ctx())).toBe(true);
    expect(await ScoringBindings.CallerHoldsBinding(fixtures.Binding, ctx(stranger))).toBe(false);
    const r = await new ScoringService(ctx(stranger)).Score(fixtures.Binding, scope(), RUN_DAY, false);
    expect(r).toMatchObject({ Status: 'refused', ModelID: null, Reason: { kind: 'binding-not-authorized', bindingId: fixtures.Binding.ID } });
    expect((await stored()).Runs).toEqual([{ Status: 'refused', Written: 0, ModelID: null }]);
  });

  it('writes the model rows and the column copy (a decimal(3,2) column holds it at two places), and a same-day re-run replaces the rows (EffectiveAsOf matched against DATETIMEOFFSET)', async () => {
    const first = await new ScoringService(ctx()).Score(fixtures.Binding, scope(), new Date('2026-10-01T17:30:00-05:00'), false);
    expect(first.Status === 'refused' ? first.Reason : null).toBeNull();
    expect(first).toMatchObject({ Status: 'completed', Total: 2, Written: 2, ModelID: fixtures.ModelID });
    expect(await minWeights()).toEqual({ r1: 0.71, r2: 0.46 });
    const second = await new ScoringService(ctx()).Score(fixtures.Binding, scope(), RUN_DAY, false);
    expect(second).toMatchObject({ Status: 'completed', Written: 2 });
    const after = await stored();
    expect([after.Rows, after.AsOf]).toEqual([2, ['2026-10-01T00:00:00Z']]);
    expect(after.Runs.map((x) => [x.Status, x.Written])).toEqual([['refused', 0], ['completed', 2], ['completed', 2]]);
    expect(UUIDsEqual(after.Runs[1].ModelID, fixtures.ModelID)).toBe(true);
  });

  it('the model-row writer reads a batch\'s existing rows in one RecordID IN (…) query at the service\'s batch size', async () => {
    const runId = (await pool.request().input('BindingID', sql.UniqueIdentifier, fixtures.Binding.ID).query<{ ID: string }>(
      `SELECT TOP 1 CAST(ID AS NVARCHAR(36)) AS ID FROM ${tableOf(server.Provider, 'MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID = @BindingID AND Status = 'completed'`)).recordset[0].ID;
    const rows: ModelValueRow[] = Array.from({ length: SCORING_BATCH_SIZE_DEFAULT }, () => ({
      RecordID: randomUUID(), Value: { ValueNumeric: 0.5, ValueText: 'lapsed', ValueBoolean: null, ValueDate: null, ValueJSON: null }, Confidence: 0.5, InTraining: false,
    }));
    const params = (asOf: Date) => ({
      MLModelScoringBindingID: fixtures.Binding.ID, EntityID: fixtures.Binding.TargetEntityID || '', FeatureName: TAG, Role: 'Champion' as const, MLModelID: fixtures.ModelID,
      MLScoringRunID: runId, EffectiveAsOf: asOf, ProcessRunID: null, Rows: rows, ContextUser: server.User, Provider: server.Provider,
    });
    const views = vi.spyOn(server.Provider, 'RunView');
    const asOf = new Date('2026-09-15T00:00:00Z');
    expect(await FeatureValueCacheService.Instance.RecordModelValues(params(asOf))).toEqual({ Inserted: SCORING_BATCH_SIZE_DEFAULT, Replaced: 0 });
    // The same instant written with another offset: the ISO filter still finds every row.
    expect(await FeatureValueCacheService.Instance.RecordModelValues(params(new Date('2026-09-14T20:00:00-04:00')))).toEqual({ Inserted: 0, Replaced: SCORING_BATCH_SIZE_DEFAULT });
    const reads = views.mock.calls.map((call): RunViewParams => call[0]).filter((p) => p.EntityName === 'MJ: Feature Values');
    views.mockRestore();
    expect(reads.map((p) => String(p.ExtraFilter).match(/RecordID IN \(/g)?.length)).toEqual([1, 1]);
    expect(String(reads[0].ExtraFilter)).toContain(`EffectiveAsOf = '2026-09-15T00:00:00.000Z'`);
  });

  it('withdrawal recognises the copies rounded to the column\'s scale as its own and clears them (fails without the rounding)', async () => {
    expect(await ScoringBindings.Withdraw(fixtures.Binding.ID, ctx())).toEqual({ Cleared: 2, KeptHuman: 0 });
    expect(await minWeights()).toEqual({ r1: null, r2: null });
  });
});
