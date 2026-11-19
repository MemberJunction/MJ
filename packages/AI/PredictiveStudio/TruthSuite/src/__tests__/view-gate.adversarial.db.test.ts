// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// The view gate (Task M5b.1, §5.8.4, D-058): one row-level security filter on every role's read permission of
// `MJ: Feature Values` and `MJ: Latest Feature Values`, shipped as metadata. A user without the binding's view
// authorization reads no `Source = 'Model'` row from either entity while every Pipeline and Human row stays visible; a
// Developer (who holds "View Model Predictions") reads the binding's predictions; a writer without the binding's
// authorization is refused before reading (D4-60). Every read is `RunView` on the server provider with the user as
// `ContextUser`, as every server read is row-filtered.
//
// Task M5b.10's adversarial harness follows (`describe('M5b.10 harness')`): one `it` per cell of M5b's coverage table
// that Tasks M5b.1–M5b.7 did not write, plus a role created by SQL with an unfiltered read grant and a user holding a
// filtered and an unfiltered role — the RLS exemption (`EntityInfo.UserExemptFromRowLevelSecurity`), the documented
// residual M6's R7 (i) remediates — and the daily maintenance's production store (Task M5b.5: the binding backfill and the
// retention sweep against SQL Server, which its unit test's in-memory store cannot prove). Predictions are written by the production `ScoringService` (its sidecar and model
// runtime replaced by doubles: no model is trained here) and the production `FeatureValueCacheService`; a row no entity
// save can shape (a Pipeline row naming an existing Record Process) and the adversary's writes (a model archived, a
// role granted read by SQL) are SQL, labelled where they happen. Teardown deletes every row the file created by tag.
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { EntityPermissionType, RunView, UserInfo, UserRoleInfo, type BaseEntity, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type {
  MJAuthorizationEntity, MJFeatureValueEntity, MJFileEntity, MJFileStorageProviderEntity, MJKnowledgeHubSavedSearchEntity, MJMLAlgorithmEntity,
  MJMLModelEntity, MJMLModelScoringBindingEntity, MJMLScoringRunEntity, MJMLTrainingPipelineEntity, MJRoleEntity, MJUserEntity,
  MJUserRoleEntity, MJvwLatestFeatureValuesEntity,
} from '@memberjunction/core-entities';
import { FeatureValueCacheService, type ModelValueRow } from '@memberjunction/feature-pipelines';
import { EscapeSQLString, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
  BindingNotAuthorizedError, InMemoryArtifactLoader, PredictionRetention, ScoringBindings, ScoringService,
  type IScoringModelRuntime, type IScoringPreparedModel, type ISidecarPredictor, type LoadedModel, type ScoringContext,
} from '@memberjunction/predictive-studio';
import {
  PredictionPanelQueries, resolveOutcomeConfig, type FeatureSchemaEntry, type PredictRequest, type PredictResponse, type ScoringResult,
} from '@memberjunction/predictive-studio-core';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { ConsoleCapture } from './fixtures/console-capture';

const TAG = `PSViewGate-${Date.now()}`;
/** The scored entity: a plain MJ entity with a decimal(3,2) column (`MinScore`) and no save hooks. */
const TARGET = 'MJ: Knowledge Hub Saved Searches';
const FILTER_NAME = 'Model Predictions View Gate';
const GATED_ENTITIES = ['MJ: Feature Values', 'MJ: Latest Feature Values'] as const;
const DAY1 = new Date('2026-10-01T00:00:00Z');
const DAY3 = new Date('2026-10-03T00:00:00Z');
const FEATURES: readonly FeatureSchemaEntry[] = [{ Name: 'Tenure', Kind: 'numeric' }];
/** Each scored record's adverse-class probability, by record name. */
const ADVERSE: Readonly<Record<string, number>> = { r1: 0.72, r2: 0.31, r3: 0.55 };
const BOOTSTRAP_TIMEOUT_MS = 180_000;
const CASE_TIMEOUT_MS = 120_000;

/** The Feature Value columns every gated read loads (both entities carry them; the view entity types `Source` as text). */
type GatedRow = Pick<MJvwLatestFeatureValuesEntity, 'ID' | 'RecordID' | 'FeatureName' | 'Source' | 'MLModelScoringBindingID' | 'MLModelID' | 'MLScoringRunID' | 'EffectiveAsOf'>;

/** The scored world the helpers read: entity, pipeline, Published model, its artifact file and the target records. */
interface FixtureBase {
  readonly TargetEntityID: string;
  readonly PipelineID: string;
  readonly ModelID: string;
  readonly FileID: string;
  /** Target record IDs by name (r1, r2, r3). */
  readonly Records: Readonly<Record<string, string>>;
}

/** The rows every case reads. */
interface ViewGateFixtures extends FixtureBase {
  /** The seeded-authorization binding (no column), scored on DAY1 and DAY3. */
  readonly Binding: MJMLModelScoringBindingEntity;
  /** A binding seen through a scratch authorization no role is granted, copying into `MinScore`, scored by the system user. */
  readonly CustomBinding: MJMLModelScoringBindingEntity;
  /** The scratch authorization of {@link CustomBinding}. */
  readonly CustomAuthorizationID: string;
  /** The pipeline feature of the Pipeline row seeded on r1. */
  readonly PipelineFeature: string;
  /** A UI-role user (stored and in memory), neither Developer nor Integration. */
  readonly UIOnly: UserInfo;
  /** A Developer (stored and in memory). */
  readonly Developer: UserInfo;
}

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let base: FixtureBase;
let f: ViewGateFixtures;
const artifact = new TextEncoder().encode(`artifact of ${TAG}`);

// ---------------------------------------------------------------------------------------------------- helpers ----

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

/** The first row ID of `entityName` matching `filter`. */
async function firstId(entityName: string, filter = ''): Promise<string> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<{ ID: string }>({ EntityName: entityName, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, server.User);
  const id = r.Results[0]?.ID;
  if (!r.Success || !id) throw new Error(`no ${entityName} row${filter ? ` where ${filter}` : ''} for the fixture: push the metadata`);
  return id;
}

/** A scratch user holding `roleIds`, stored (vwUserHeldAuthorizations reads the stored roles) and in memory. */
async function scratchUser(label: string, roleIds: readonly string[]): Promise<UserInfo> {
  const row = await createRow<MJUserEntity>('MJ: Users', (u) => { u.Name = `${TAG} ${label}`; u.Email = `${TAG.toLowerCase()}-${label.replace(/\W+/g, '-')}@example.com`; u.Type = 'User'; u.IsActive = true; });
  for (const roleId of roleIds) await createRow<MJUserRoleEntity>('MJ: User Roles', (ur) => { ur.UserID = row.ID; ur.RoleID = roleId; });
  return new UserInfo(server.Provider, {
    ID: row.ID, Name: row.Name, Email: row.Email, Type: 'User', IsActive: true,
    UserRoles: roleIds.map((RoleID) => new UserRoleInfo({ UserID: row.ID, RoleID })),
  });
}

/** `entityName`'s rows matching `filter`, read as `user` (row-filtered). */
async function ReadAs(user: UserInfo, entityName: string, filter: string): Promise<GatedRow[]> {
  const r = await RunView.FromMetadataProvider(server.Provider).RunView<GatedRow>({
    EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    Fields: ['ID', 'RecordID', 'FeatureName', 'Source', 'MLModelScoringBindingID', 'MLModelID', 'MLScoringRunID', 'EffectiveAsOf'],
  }, user);
  if (!r.Success) throw new Error(`reading ${entityName} as ${user.Email} failed: ${r.ErrorMessage}`);
  return r.Results;
}

/** The record filter of `recordName` on the target entity. */
function onRecord(recordName: string): string {
  return `EntityID = '${EscapeSQLString(f.TargetEntityID)}' AND RecordID = '${EscapeSQLString(f.Records[recordName])}'`;
}

/** The binding's Model rows as SQL Server stores them (unfiltered). */
async function ModelRowCount(bindingId: string): Promise<number> {
  const r = await pool.request().input('BindingID', sql.UniqueIdentifier, bindingId)
    .query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${tableOf(server.Provider, 'MJ: Feature Values')} WHERE MLModelScoringBindingID = @BindingID AND Source = 'Model'`);
  return r.recordset[0].N;
}

/** The target records' `MinScore` as stored, by record name. */
async function TargetColumnValues(): Promise<Record<string, number | null>> {
  const r = await pool.request().input('Prefix', sql.NVarChar(255), `${TAG}-%`)
    .query<{ Name: string; MinScore: number | null }>(`SELECT Name, CAST(MinScore AS FLOAT) AS MinScore FROM ${tableOf(server.Provider, TARGET)} WHERE Name LIKE @Prefix ORDER BY Name`);
  return Object.fromEntries(r.recordset.map((row) => [row.Name.slice(TAG.length + 1), row.MinScore]));
}

/** The role names whose read grant of `entities` carries no row-level security filter. */
async function GrantsWithoutFilter(entities: readonly string[]): Promise<string[]> {
  const ids = entities.map((e) => {
    const id = server.Provider.EntityByName(e)?.ID;
    if (!id) throw new Error(`${e} is not in metadata`);
    return `'${EscapeSQLString(id)}'`;
  }).join(',');
  const r = await pool.request().query<{ Role: string }>(`SELECT r.Name AS Role FROM ${tableOf(server.Provider, 'MJ: Entity Permissions')} p
      JOIN ${tableOf(server.Provider, 'MJ: Roles')} r ON r.ID = p.RoleID
      WHERE p.EntityID IN (${ids}) AND p.CanRead = 1 AND p.ReadRLSFilterID IS NULL AND r.Name NOT LIKE '${EscapeSQLString(TAG)}%' ORDER BY r.Name`);
  return r.recordset.map((row) => row.Role);
}

/** The sidecar double: the `Tenure` cell is the record's adverse probability; class order (renewed, lapsed). */
class StubSidecar implements ISidecarPredictor {
  public async predict(req: PredictRequest): Promise<PredictResponse> {
    return { classOrder: ['renewed', 'lapsed'], predictions: req.rows.map((row) => ({ score: Number(row['Tenure']), class: 'lapsed', probabilities: [1 - Number(row['Tenure']), Number(row['Tenure'])] })) };
  }
}

/** The model runtime double: a unitless model on the target entity assembling each record's planted probability. */
class StubRuntime implements IScoringModelRuntime {
  public async Prepare(model: MJMLModelEntity): Promise<IScoringPreparedModel> {
    const byId = new Map(Object.entries(base.Records).map(([name, id]) => [id.toLowerCase(), ADVERSE[name]]));
    const loaded: LoadedModel = {
      modelId: model.ID, targetEntityName: TARGET, artifactB64: Buffer.from(artifact).toString('base64'), fittedPreprocessing: {}, featureSchema: [...FEATURES],
      problemType: 'classification', targetVariable: 'Lapsed', sourceBindings: [], featureSteps: { Steps: [] }, asOf: { Mode: 'none' },
      leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 }, outcomeConfig: resolveOutcomeConfig(), unit: null, trainingRowIds: new UUIDSet(),
    };
    return {
      Loaded: loaded,
      Assemble: async (ids) => ({
        Status: 'assembled', Matrix: { columns: ['Tenure'], rows: ids.map((id) => [byId.get(id.toLowerCase()) || 0]) }, Columns: [...FEATURES], HashColumns: null, RowIDs: [...ids],
      }),
    };
  }
}

/** The scoring context of `user` with the sidecar, runtime and artifact loader replaced; the clock reads `day`. */
function scoringCtx(user: UserInfo, day: Date): ScoringContext {
  const artifacts = new InMemoryArtifactLoader();
  artifacts.Set(base.FileID, artifact);
  return {
    ContextUser: user, Provider: server.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null,
    Seams: { Sidecar: new StubSidecar(), Runtime: new StubRuntime(), ArtifactLoader: artifacts, Clock: { Now: () => day } },
  };
}

/** Scores every fixture record of `binding` as `user` on `asOf`. */
function ScoreAs(user: UserInfo, binding: MJMLModelScoringBindingEntity, asOf: Date): Promise<ScoringResult> {
  return new ScoringService(scoringCtx(user, asOf)).Score(binding, { kind: 'record-ids', entity: TARGET, ids: Object.values(base.Records) }, asOf, false);
}

/** Withdraws `bindingId` as `user`: Ok false with the refusal's name when refused. */
async function WithdrawAs(user: UserInfo, bindingId: string): Promise<{ readonly Ok: boolean; readonly Refusal: string | null }> {
  try {
    await ScoringBindings.Withdraw(bindingId, { ContextUser: user, Provider: server.Provider });
    return { Ok: true, Refusal: null };
  } catch (e) {
    return { Ok: false, Refusal: e instanceof BindingNotAuthorizedError ? 'binding-not-authorized' : e instanceof Error ? e.message : String(e) };
  }
}

/** A new binding of the fixture pipeline (feature `<tag> <label>`), seen through `viewAuthorizationId`. */
function newBinding(label: string, viewAuthorizationId: string, targetColumn: string | null): Promise<MJMLModelScoringBindingEntity> {
  return createRow<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', (b) => {
    b.MLTrainingPipelineID = base.PipelineID; b.FeatureName = `${TAG} ${label}`; b.TargetEntityID = base.TargetEntityID; b.Mode = 'OnDemand'; b.Status = 'Active';
    b.ViewAuthorizationID = viewAuthorizationId; b.TargetColumn = targetColumn; b.TargetColumnSource = targetColumn === null ? null : '$.AdverseProbability';
  });
}

/** The panel's batch (the builder `ModelPredictionPanel` sends) for `recordName`, read as `user`. */
async function PanelAs(user: UserInfo, recordName: string, featureNames: readonly string[]): Promise<{ readonly Bindings: string[]; readonly Latest: GatedRow[]; readonly History: GatedRow[] }> {
  const params: RunViewParams[] = PredictionPanelQueries.For(f.TargetEntityID, f.Records[recordName], featureNames);
  const results = await RunView.FromMetadataProvider(server.Provider).RunViews<Record<string, string | number | boolean | Date | null>>(params, user);
  results.forEach((r, i) => { if (!r.Success) throw new Error(`panel read ${params[i].EntityName} as ${user.Email} failed: ${r.ErrorMessage}`); });
  const bindings = results[PredictionPanelQueries.Index.Bindings].Results.map((row) => String(row['ID']));
  const asGated = (rows: Record<string, string | number | boolean | Date | null>[]): GatedRow[] => rows.map((row) => ({
    ID: String(row['ID']), RecordID: String(row['RecordID']), FeatureName: String(row['FeatureName']), Source: String(row['Source']),
    MLModelScoringBindingID: row['MLModelScoringBindingID'] === null ? null : String(row['MLModelScoringBindingID']),
    MLModelID: row['MLModelID'] === null ? null : String(row['MLModelID']), MLScoringRunID: row['MLScoringRunID'] === null ? null : String(row['MLScoringRunID']),
    EffectiveAsOf: row['EffectiveAsOf'] instanceof Date ? row['EffectiveAsOf'] : row['EffectiveAsOf'] === null ? null : new Date(String(row['EffectiveAsOf'])),
  }));
  return { Bindings: bindings, Latest: asGated(results[PredictionPanelQueries.Index.Latest].Results), History: asGated(results[PredictionPanelQueries.Index.History].Results) };
}

/** Rows of `rows` naming `bindingId`. */
function ofBinding(rows: readonly GatedRow[], bindingId: string): GatedRow[] {
  return rows.filter((r) => r.MLModelScoringBindingID !== null && UUIDsEqual(r.MLModelScoringBindingID, bindingId));
}

// ---------------------------------------------------------------------------------------------- fixture build ----

/** Pipeline, Published model, two bindings, three records scored on DAY1 and DAY3, a Pipeline row on r1 and the two users. */
async function createFixtures(): Promise<ViewGateFixtures> {
  const targetEntityId = server.Provider.EntityByName(TARGET)?.ID;
  if (!targetEntityId) throw new Error(`${TARGET} is not in metadata`);
  const algorithmId = await firstId('MJ: ML Algorithms');
  const providerId = await firstId('MJ: File Storage Providers');
  const pipeline = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (p) => {
    p.Name = TAG; p.TargetEntityID = targetEntityId; p.TargetVariable = 'Lapsed'; p.ProblemType = 'classification'; p.AlgorithmID = algorithmId;
  });
  const file = await createRow<MJFileEntity>('MJ: Files', (x) => { x.Name = `${TAG}.bin`; x.ProviderID = providerId; });
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
  const custom = await createRow<MJAuthorizationEntity>('MJ: Authorizations', (a) => {
    a.Name = `${TAG} custom predictions`; a.IsActive = true; a.UseAuditLog = false; a.Description = 'Predictive Studio truth suite view-gate scratch (safe to delete)';
  });
  const uiRole = await firstId('MJ: Roles', `Name = 'UI'`);
  const developerRole = await firstId('MJ: Roles', `Name = 'Developer'`);
  // The provider caches authorizations: reload so the scratch one resolves.
  await server.Provider.Refresh();
  base = { TargetEntityID: targetEntityId, PipelineID: pipeline.ID, ModelID: model.ID, FileID: file.ID, Records: records };
  const binding = await newBinding('renewal', ScoringBindings.ResolveViewAuthorizationID(null, server.Provider), null);
  const customBinding = await newBinding('custom', custom.ID, 'MinScore');
  const uiOnly = await scratchUser('ui only', [uiRole]);
  const developer = await scratchUser('developer', [developerRole]);
  const pipelineFeature = `${TAG} pipeline tier`;
  for (const day of [DAY1, DAY3]) {
    const scored = await ScoreAs(server.User, binding, day);
    if (scored.Status !== 'completed') throw new Error(`fixture scoring on ${day.toISOString()} did not complete: ${JSON.stringify(scored)}`);
  }
  const customScored = await ScoreAs(server.User, customBinding, DAY1);
  if (customScored.Status !== 'completed') throw new Error(`fixture scoring of the custom binding did not complete: ${JSON.stringify(customScored)}`);
  // A Pipeline row on r1 (a row no entity save shapes without running the pipeline): it names an existing Record Process.
  const processId = await firstId('MJ: Record Processes');
  await pool.request().input('EntityID', sql.UniqueIdentifier, targetEntityId).input('RecordID', sql.NVarChar(900), records['r1'])
    .input('FeatureName', sql.NVarChar(255), pipelineFeature).input('ProcessID', sql.UniqueIdentifier, processId)
    .query(`INSERT INTO ${tableOf(server.Provider, 'MJ: Feature Values')} (EntityID, RecordID, FeatureName, Source, Role, RecordProcessID, ValueText, Confidence)
            VALUES (@EntityID, @RecordID, @FeatureName, 'Pipeline', 'Champion', @ProcessID, 'Gold', 0.81)`);
  return { ...base, Binding: binding, CustomBinding: customBinding, CustomAuthorizationID: custom.ID, PipelineFeature: pipelineFeature, UIOnly: uiOnly, Developer: developer };
}

/** Deletes every row the file created, children first, by the tag. */
async function deleteFixtures(): Promise<void> {
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  const bindings = `SELECT ID FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName LIKE @Prefix`;
  await pool.request().input('Prefix', sql.NVarChar(255), `${TAG}%`).input('Tag', sql.NVarChar(255), TAG).query(`
    DELETE FROM ${t('MJ: Feature Values')} WHERE MLModelScoringBindingID IN (${bindings}) OR FeatureName LIKE @Prefix;
    DELETE FROM ${t('MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID IN (${bindings});
    DELETE FROM ${t('MJ: ML Model Scoring Bindings')} WHERE FeatureName LIKE @Prefix;
    DELETE FROM ${t('MJ: ML Models')} WHERE PipelineID IN (SELECT ID FROM ${t('MJ: ML Training Pipelines')} WHERE Name = @Tag);
    DELETE FROM ${t('MJ: ML Training Pipelines')} WHERE Name = @Tag;
    DELETE FROM ${t('MJ: Files')} WHERE Name LIKE @Prefix;
    DELETE FROM ${t(TARGET)} WHERE Name LIKE @Prefix;
    DELETE FROM ${t('MJ: Entity Permissions')} WHERE RoleID IN (SELECT ID FROM ${t('MJ: Roles')} WHERE Name LIKE @Prefix);
    DELETE FROM ${t('MJ: User Roles')} WHERE UserID IN (SELECT ID FROM ${t('MJ: Users')} WHERE Name LIKE @Prefix) OR RoleID IN (SELECT ID FROM ${t('MJ: Roles')} WHERE Name LIKE @Prefix);
    DELETE FROM ${t('MJ: Users')} WHERE Name LIKE @Prefix;
    DELETE FROM ${t('MJ: Roles')} WHERE Name LIKE @Prefix;
    DELETE FROM ${t('MJ: Authorization Roles')} WHERE AuthorizationID IN (SELECT ID FROM ${t('MJ: Authorizations')} WHERE Name LIKE @Prefix);
    DELETE FROM ${t('MJ: Authorizations')} WHERE Name LIKE @Prefix;`);
}

beforeAll(async () => {
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
  f = await createFixtures();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  if (pool && server) await deleteFixtures();
  await server?.Provider.Refresh();
  await pool?.close();
  await server?.ClosePool();
}, BOOTSTRAP_TIMEOUT_MS);

// ------------------------------------------------------------------------------------------------- M5b.1 ----

describe('the view gate', () => {
  it('a user without the authorization reads no Model row from either entity and every Pipeline and Human row', async () => {
    for (const entity of GATED_ENTITIES) {
      const rows = await ReadAs(f.UIOnly, entity, onRecord('r1'));
      expect(rows.filter((r) => r.Source === 'Model')).toHaveLength(0);
      expect(rows.filter((r) => r.Source !== 'Model').map((r) => r.FeatureName)).toEqual([f.PipelineFeature]);
    }
  });

  it('a Developer reads the binding\'s Model rows', async () => {
    const latest = await ReadAs(f.Developer, 'MJ: Latest Feature Values', `FeatureName = '${EscapeSQLString(f.Binding.FeatureName)}'`);
    expect(latest.length).toBe(Object.keys(f.Records).length);
    expect(latest.every((r) => r.EffectiveAsOf !== null && new Date(r.EffectiveAsOf).getTime() === DAY3.getTime())).toBe(true);
    const history = await ReadAs(f.Developer, 'MJ: Feature Values', `MLModelScoringBindingID = '${EscapeSQLString(f.Binding.ID)}' AND Source = 'Model'`);
    expect(history.length).toBe(2 * Object.keys(f.Records).length);
  });

  it('every read grant of both entities carries the view gate', async () => {
    expect(await GrantsWithoutFilter(GATED_ENTITIES)).toEqual([]);
  });

  it('a writer without the binding\'s authorization is refused before reading: no duplicate rows, no column write, no withdrawal (D4-60)', async () => {
    const before = await ModelRowCount(f.CustomBinding.ID);
    const copiedBefore = await TargetColumnValues();
    const rerun = await ScoreAs(f.Developer, f.CustomBinding, DAY1);
    expect(rerun).toMatchObject({ Status: 'refused', Reason: { kind: 'binding-not-authorized' } });
    expect(await ModelRowCount(f.CustomBinding.ID)).toBe(before);              // UQ_FeatureValue_ModelRow never reached
    expect(await TargetColumnValues()).toEqual(copiedBefore);
    expect(await WithdrawAs(f.Developer, f.CustomBinding.ID)).toMatchObject({ Ok: false, Refusal: 'binding-not-authorized' });
  }, CASE_TIMEOUT_MS);

  it('the filter text names the reader and matches no binding without a view authorization', () => {
    const filter = server.Provider.RowLevelSecurityFilters.find((x) => x.Name === FILTER_NAME);
    if (!filter) throw new Error(`the "${FILTER_NAME}" filter is not in metadata: run mj sync push`);
    const text = filter.MarkupFilterText(f.UIOnly);
    expect(text).toContain(f.UIOnly.ID);
    expect(text).not.toContain('{{UserID}}');
    // A null ViewAuthorizationID joins no held authorization: the subquery's inner join drops it (fail closed).
    expect(text).toContain('JOIN __mj.vwUserHeldAuthorizations a ON a.AuthorizationID = b.ViewAuthorizationID');
  });
});

// ------------------------------------------------------------------------------------------------- M5b.10 ----

describe('M5b.10 harness', () => {
  it('null or missing score: a binding with no rows renders no card and no error', async () => {
    const empty = await newBinding('never scored', ScoringBindings.ResolveViewAuthorizationID(null, server.Provider), null);
    const panel = await PanelAs(f.Developer, 'r1', [empty.FeatureName]);
    expect(panel.Bindings.some((id) => UUIDsEqual(id, empty.ID))).toBe(true);
    expect([panel.Latest, panel.History]).toEqual([[], []]);
  }, CASE_TIMEOUT_MS);

  it('withdrawn binding: the panel\'s binding read excludes a withdrawn binding', async () => {
    const gone = await newBinding('withdrawn', ScoringBindings.ResolveViewAuthorizationID(null, server.Provider), null);
    expect(await WithdrawAs(server.User, gone.ID)).toEqual({ Ok: true, Refusal: null });
    const panel = await PanelAs(f.Developer, 'r1', [f.Binding.FeatureName]);
    expect(panel.Bindings.some((id) => UUIDsEqual(id, gone.ID))).toBe(false);
    expect(panel.Bindings.some((id) => UUIDsEqual(id, f.Binding.ID))).toBe(true);
  }, CASE_TIMEOUT_MS);

  it('deleted parent or child: a deleted record\'s predictions stay readable by ID and drop out of the panel', async () => {
    const extra = await createRow<MJKnowledgeHubSavedSearchEntity>(TARGET, (t) => { t.Name = `${TAG}-deleted`; t.UserID = server.User.ID; t.Query = TAG; });
    const run = await createRow<MJMLScoringRunEntity>('MJ: ML Scoring Runs', (r) => {
      r.ModelID = f.ModelID; r.ModelVersion = 1; r.MLModelScoringBindingID = f.Binding.ID; r.Path = 'score-record-set'; r.ScopeKind = 'record-ids'; r.ScopeEntityID = f.TargetEntityID;
      r.Scope = JSON.stringify({ recordIds: [extra.ID] }); r.AsOfDate = DAY3; r.ReadPolicy = '{}'; r.RequestedBy = JSON.stringify({ kind: 'system', component: 'view-gate-test' }); r.Status = 'completed';
    });
    await writeModelRows(f.Binding, run.ID, DAY3, [extra.ID], 0.4);
    // A successful Delete resets the entity object (BaseEntity.resetDeletedRecords), so the ID is read before it.
    const deletedId = extra.ID;
    expect(await extra.Delete()).toBe(true);
    const byId = await ReadAs(f.Developer, 'MJ: Latest Feature Values', `RecordID = '${EscapeSQLString(deletedId)}'`);
    expect(byId.map((r) => r.Source)).toEqual(['Model']);
    // The panel opens on a record's form; the record is gone, so no form (and no panel) can show it.
    const target = await RunView.FromMetadataProvider(server.Provider).RunView<{ ID: string }>({ EntityName: TARGET, ExtraFilter: `ID = '${EscapeSQLString(deletedId)}'`, Fields: ['ID'], ResultType: 'simple' }, f.Developer);
    expect([target.Success, target.Results.length]).toEqual([true, 0]);
  }, CASE_TIMEOUT_MS);

  it('model status: a prediction of an archived model shows that model\'s version in its lineage', async () => {
    // Adversary: the model is archived by SQL after it scored (as the lifecycle gate writes Status).
    await pool.request().input('ID', sql.UniqueIdentifier, f.ModelID).query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Models')} SET Status = 'Archived' WHERE ID = @ID`);
    try {
      const panel = await PanelAs(f.Developer, 'r1', [f.Binding.FeatureName]);
      const [latest] = ofBinding(panel.Latest, f.Binding.ID);
      if (!latest) throw new Error('the panel read no latest value of the fixture binding');
      expect(UUIDsEqual(latest.MLModelID, f.ModelID)).toBe(true);
      const runs = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJMLScoringRunEntity, 'ID' | 'ModelID' | 'ModelVersion'>>({
        EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID = '${EscapeSQLString(latest.MLScoringRunID || '')}'`, Fields: ['ID', 'ModelID', 'ModelVersion'], ResultType: 'simple',
      }, f.Developer);
      expect(runs.Results.map((r) => r.ModelVersion)).toEqual([1]);
    } finally {
      await pool.request().input('ID', sql.UniqueIdentifier, f.ModelID).query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Models')} SET Status = 'Published' WHERE ID = @ID`);
    }
  }, CASE_TIMEOUT_MS);

  it('human value, without Record Process: a binding\'s Human row stays visible to a user without the authorization', async () => {
    const human = await createRow<MJFeatureValueEntity>('MJ: Feature Values', (fv) => {
      fv.EntityID = f.TargetEntityID; fv.RecordID = f.Records['r2']; fv.FeatureName = f.Binding.FeatureName; fv.Source = 'Human'; fv.Role = 'Champion';
      fv.ValueNumeric = 0.9; fv.RecordProcessID = null; fv.MLModelScoringBindingID = f.Binding.ID; fv.EffectiveAsOf = new Date('2026-10-05T00:00:00Z');
    });
    for (const entity of GATED_ENTITIES) {
      const rows = await ReadAs(f.UIOnly, entity, onRecord('r2'));
      expect(rows.map((r) => [r.Source, UUIDsEqual(r.ID, human.ID)])).toEqual([['Human', true]]);
    }
  }, CASE_TIMEOUT_MS);

  it('binding backfill and retention sweep through the production store: only a binding without a view authorization is assigned, once; only expired Model rows go', async () => {
    const ctx = PredictionRetention.ContextOf({ Provider: server.Provider, ContextUser: server.User });
    const seeded = PredictionRetention.SeededAuthorizationID(server.Provider);
    if (seeded === null) throw new Error('the seeded view authorization is not in metadata: run mj sync push');
    // Adversary: a binding saved before the view authorization existed (the server entity now refuses a null one).
    const legacy = await newBinding('legacy', seeded, null);
    await pool.request().input('ID', sql.UniqueIdentifier, legacy.ID).query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Model Scoring Bindings')} SET ViewAuthorizationID = NULL WHERE ID = @ID`);
    const first = await PredictionRetention.Backfill(ctx);
    const second = await PredictionRetention.Backfill(ctx);
    const auths = await pool.request().input('Legacy', sql.UniqueIdentifier, legacy.ID).input('Custom', sql.UniqueIdentifier, f.CustomBinding.ID)
      .query<{ ID: string; ViewAuthorizationID: string | null }>(`SELECT CAST(ID AS NVARCHAR(36)) AS ID, CAST(ViewAuthorizationID AS NVARCHAR(36)) AS ViewAuthorizationID FROM ${tableOf(server.Provider, 'MJ: ML Model Scoring Bindings')} WHERE ID IN (@Legacy, @Custom)`);
    const authOf = (id: string): string | null => auths.recordset.find((r) => UUIDsEqual(r.ID, id))?.ViewAuthorizationID || null;
    expect([first.Updated, first.Failures, second.Updated]).toEqual([1, [], 0]);
    expect(UUIDsEqual(authOf(legacy.ID), seeded)).toBe(true);
    expect(UUIDsEqual(authOf(f.CustomBinding.ID), f.CustomAuthorizationID)).toBe(true);

    // The sweep: rows dated DAY1 and DAY3, 30 days kept on 2026-11-01 (cutoff 2026-10-02): DAY1 goes, DAY3 and the Pipeline row stay.
    const kept = await newBinding('retained', seeded, null);
    const run = await createRow<MJMLScoringRunEntity>('MJ: ML Scoring Runs', (r) => {
      r.ModelID = f.ModelID; r.ModelVersion = 1; r.MLModelScoringBindingID = kept.ID; r.Path = 'score-record-set'; r.ScopeKind = 'record-ids'; r.ScopeEntityID = f.TargetEntityID;
      r.Scope = JSON.stringify({ recordIds: [f.Records.r1] }); r.AsOfDate = DAY1; r.ReadPolicy = '{}'; r.RequestedBy = JSON.stringify({ kind: 'system', component: 'view-gate-test' }); r.Status = 'completed';
    });
    await writeModelRows(kept, run.ID, DAY1, [f.Records.r1], 0.2);
    await writeModelRows(kept, run.ID, DAY3, [f.Records.r1], 0.3);
    const pipelineBefore = (await ReadAs(server.User, 'MJ: Feature Values', `${onRecord('r1')} AND Source = 'Pipeline'`)).length;
    const swept = await PredictionRetention.SweepBinding({ ID: kept.ID, FeatureName: kept.FeatureName, Status: 'Active', RetentionDays: 30 }, new Date('2026-11-01T02:00:00Z'), ctx);
    expect([swept?.Cutoff, swept?.Deleted, swept?.Failures]).toEqual(['2026-10-02T00:00:00.000Z', 1, []]);
    const left = await ReadAs(server.User, 'MJ: Feature Values', `MLModelScoringBindingID = '${EscapeSQLString(kept.ID)}'`);
    expect(left.map((r) => r.EffectiveAsOf?.toISOString())).toEqual([DAY3.toISOString()]);
    expect((await ReadAs(server.User, 'MJ: Feature Values', `${onRecord('r1')} AND Source = 'Pipeline'`)).length).toBe(pipelineBefore);
  }, CASE_TIMEOUT_MS);

  it('concurrent publish: a read during a same-key write returns one latest row per key', async () => {
    const [run] = (await pool.request().input('BindingID', sql.UniqueIdentifier, f.Binding.ID)
      .query<{ ID: string }>(`SELECT TOP 1 CAST(ID AS NVARCHAR(36)) AS ID FROM ${tableOf(server.Provider, 'MJ: ML Scoring Runs')} WHERE MLModelScoringBindingID = @BindingID AND Status = 'completed'`)).recordset;
    for (let i = 0; i < 5; i++) {
      const asOf = new Date(Date.UTC(2026, 9, 10 + i));
      const [, read] = await Promise.all([
        writeModelRows(f.Binding, run.ID, asOf, Object.values(f.Records), 0.5 + i / 100),
        ReadAs(f.Developer, 'MJ: Latest Feature Values', `EntityID = '${EscapeSQLString(f.TargetEntityID)}' AND FeatureName = '${EscapeSQLString(f.Binding.FeatureName)}'`),
      ]);
      const keys = read.map((r) => r.RecordID.toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
    }
  }, CASE_TIMEOUT_MS);

  it('unauthorized user: a role granted read by SQL with no filter exempts its holder — the residual M6\'s R7 (i) remediates', async () => {
    const role = await createRow<MJRoleEntity>('MJ: Roles', (r) => { r.Name = `${TAG} unfiltered readers`; r.Description = 'Predictive Studio truth suite (safe to delete)'; });
    // Adversary: a read grant on MJ: Latest Feature Values written by SQL, with no ReadRLSFilterID.
    await pool.request().input('EntityID', sql.UniqueIdentifier, server.Provider.EntityByName('MJ: Latest Feature Values')?.ID).input('RoleID', sql.UniqueIdentifier, role.ID)
      .query(`INSERT INTO ${tableOf(server.Provider, 'MJ: Entity Permissions')} (EntityID, RoleID, Type, CanRead, CanCreate, CanUpdate, CanDelete) VALUES (@EntityID, @RoleID, 'Allow', 1, 0, 0, 0)`);
    await server.Provider.Refresh();
    try {
      expect(await GrantsWithoutFilter(['MJ: Latest Feature Values'])).toEqual([]);   // the scratch role is excluded from the census by name
      const unfilteredOnly = await scratchUser('unfiltered only', [role.ID]);
      const uiRole = await firstId('MJ: Roles', `Name = 'UI'`);
      const twoRoles = await scratchUser('ui and unfiltered', [uiRole, role.ID]);
      const latestEntity = server.Provider.EntityByName('MJ: Latest Feature Values');
      expect([latestEntity?.UserExemptFromRowLevelSecurity(twoRoles, EntityPermissionType.Read), latestEntity?.UserExemptFromRowLevelSecurity(f.UIOnly, EntityPermissionType.Read)]).toEqual([true, false]);
      for (const user of [unfilteredOnly, twoRoles]) {
        const rows = await ReadAs(user, 'MJ: Latest Feature Values', onRecord('r1'));
        expect(ofBinding(rows, f.Binding.ID).map((r) => r.Source)).toEqual(['Model']);
      }
      // The same user on MJ: Feature Values, where no unfiltered grant exists, still reads no Model row.
      expect((await ReadAs(twoRoles, 'MJ: Feature Values', onRecord('r1'))).filter((r) => r.Source === 'Model')).toEqual([]);
    } finally {
      await pool.request().input('RoleID', sql.UniqueIdentifier, role.ID).query(`DELETE FROM ${tableOf(server.Provider, 'MJ: Entity Permissions')} WHERE RoleID = @RoleID`);
      await server.Provider.Refresh();
    }
  }, CASE_TIMEOUT_MS);
});

/** Writes Model rows of `binding` for `recordIds` on `asOf` through the production writer, as the system user. */
async function writeModelRows(binding: MJMLModelScoringBindingEntity, runId: string, asOf: Date, recordIds: readonly string[], value: number): Promise<void> {
  const rows: ModelValueRow[] = recordIds.map((RecordID) => ({ RecordID, Value: { ValueNumeric: value, ValueText: 'lapsed', ValueBoolean: null, ValueDate: null, ValueJSON: null }, Confidence: value, InTraining: false }));
  await FeatureValueCacheService.Instance.RecordModelValues({
    MLModelScoringBindingID: binding.ID, EntityID: f.TargetEntityID, FeatureName: binding.FeatureName, Role: 'Champion', MLModelID: f.ModelID,
    MLScoringRunID: runId, EffectiveAsOf: asOf, ProcessRunID: null, Rows: rows, ContextUser: server.User, Provider: server.Provider,
  });
}
