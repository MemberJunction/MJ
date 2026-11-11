// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// Every case writes the way production writes — a generated entity saved through BootstrapIntegrationServer()'s
// provider, or the direct SQL a data migration uses for the columns no entity save may set — and expects the database
// to refuse the inconsistent row, naming the constraint that refused it. The last suite runs CodeGen's entity delete
// procedure on an entity whose pipeline holds a row of every serving table, and expects each row cleared in order.
import { randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import { RunView, type BaseEntity, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type {
  MJFeatureValueEntity,
  MJvwLatestFeatureValuesEntity,
  MJMLAlgorithmEntity,
  MJMLModelEntity,
  MJMLModelPublishRecordEntity,
  MJMLModelScoringBindingEntity,
  MJMLMonitoringResultEntity,
  MJMLOutputBindingEntity,
  MJMLScoringRunEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import { MJMLModelSchema } from '@memberjunction/core-entities';
import type { PersistedModelStatus } from '@memberjunction/predictive-studio-core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';

/** The publish-record columns a case sets; every other column takes the valid value for the row's `Kind`. */
type PublishRecordOverrides = Partial<
  Pick<
    MJMLModelPublishRecordEntity,
    | 'Kind' | 'Purpose' | 'ApproverKind' | 'UserID' | 'ModelID' | 'TrainingRunID' | 'SignOffID' | 'ReplacesModelID'
    | 'OverridesFlags' | 'Reason' | 'Refusal'
  >
>;

/** One test row's identity, for the teardown. */
interface CreatedRow {
  readonly ID: string;
}

/** The fixtures every case reads: one pipeline, its runs and models, and one record process for the Feature Values. */
interface ServingFixtures {
  readonly AlgorithmID: string;
  readonly Pipeline: CreatedRow;
  readonly Run: CreatedRow;
  readonly Model: CreatedRow;
  readonly PublishedModel: CreatedRow;
  readonly LegacyA: CreatedRow;
  readonly LegacyB: CreatedRow;
  readonly RecordProcess: CreatedRow;
}

/** The SHA-256 of `{}` — a well-formed 64-character evidence hash. */
const EMPTY_JSON_SHA256 = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
const PROBE_FEATURE = 'probe-feature';
/** A sign-off's overridden leakage flag: any non-empty JSON array engages `CK_MLModelPublishRecord_Reason`. */
const OVERRIDDEN_FLAGS = JSON.stringify(['single-feature-auc']);

/**
 * Core's persisted model statuses, written out once. The `Record` key type makes the compiler refuse a missing or an
 * extra value, so its keys are `PersistedModelStatus` exactly.
 */
const CORE_STATUSES: Record<PersistedModelStatus, true> = {
  Draft: true, Validated: true, Published: true, Archived: true, KeepBaseline: true, Unevaluated: true,
};

/** The five `ArtifactStatus` values, keyed by the generated union so the compiler refuses a missing or an extra one. */
const ARTIFACT_STATUSES: Record<MJMLModelEntity['ArtifactStatus'], true> = {
  unverified: true, verified: true, missing: true, 'hash-mismatch': true, 'legacy-local': true,
};
const TAG = `PSServingSchema-${Date.now()}`;

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let fixtures: ServingFixtures;
let defaultModelId: string;
/**
 * Publish records a case expected to be refused but that saved (only under a mutated schema). Their `ModelID` may name
 * no model, so the teardown's model and run predicates cannot reach them; it deletes these by ID.
 */
const unexpectedlySavedPublishRecordIDs: string[] = [];

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
  const entity: EntityInfo | undefined = provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** A new, unsaved row of `entityName` with `fill` applied, for a case that expects its save to be refused. */
async function unsavedRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void): Promise<T> {
  const row = await server.Provider.GetEntityObject<T>(entityName, server.User);
  row.NewRecord();
  fill(row);
  return row;
}

/** Save a new row of `entityName` with `fill` applied; throws with the provider's message when the save fails. */
async function createRow<T extends BaseEntity>(
  entityName: string,
  fill: (row: T) => void,
): Promise<T> {
  const row = await unsavedRow<T>(entityName, fill);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** A new, unsaved publish record that satisfies every constraint for its `Kind`, with `overrides` applied last. */
async function NewPublishRecord(ctx: IntegrationBootstrapContext, overrides: PublishRecordOverrides): Promise<MJMLModelPublishRecordEntity> {
  const r = await ctx.Provider.GetEntityObject<MJMLModelPublishRecordEntity>('MJ: ML Model Publish Records', ctx.User);
  r.NewRecord();
  const kind = overrides.Kind || 'publish';
  r.Kind = kind;
  r.Purpose = 'publish';
  r.ApproverKind = 'automated-gate';
  r.UserID = null;
  r.ModelID = defaultModelId;
  r.TrainingRunID = null;
  r.Initiator = JSON.stringify({ kind: 'system', component: 'serving-schema-test' });
  r.OverridesFlags = '[]';
  if (kind === 'refusal') {
    r.Refusal = JSON.stringify({ kind: 'gate-no-signal' });
    r.Reason = 'No signal.';
  } else {
    r.Evidence = '{}';
    r.EvidenceSha256 = EMPTY_JSON_SHA256;
    if (kind === 'publish') r.GateDecision = JSON.stringify({ outcome: 'model' });
    if (kind === 'sign-off') {
      r.ApproverKind = 'user';
      r.UserID = ctx.User.ID;
      r.Decision = 'approve';
    }
  }
  if (overrides.Purpose !== undefined) r.Purpose = overrides.Purpose;
  if (overrides.ApproverKind !== undefined) r.ApproverKind = overrides.ApproverKind;
  if (overrides.UserID !== undefined) r.UserID = overrides.UserID;
  if (overrides.ModelID !== undefined) r.ModelID = overrides.ModelID;
  if (overrides.TrainingRunID !== undefined) r.TrainingRunID = overrides.TrainingRunID;
  if (overrides.SignOffID !== undefined) r.SignOffID = overrides.SignOffID;
  if (overrides.ReplacesModelID !== undefined) r.ReplacesModelID = overrides.ReplacesModelID;
  if (overrides.OverridesFlags !== undefined) r.OverridesFlags = overrides.OverridesFlags;
  if (overrides.Reason !== undefined) r.Reason = overrides.Reason;
  if (overrides.Refusal !== undefined) r.Refusal = overrides.Refusal;
  return r;
}

/**
 * Write a model's `Status` by SQL. Takes a plain string on purpose: the case writes a value outside the generated
 * `MJMLModelEntity['Status']` union to prove the CHECK refuses it.
 */
async function RawStatusWrite(p: sql.ConnectionPool, modelId: string, status: string): Promise<void> {
  await p.request()
    .input('ID', sql.UniqueIdentifier, modelId)
    .input('Status', sql.NVarChar(20), status)
    .query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Models')} SET Status = @Status WHERE ID = @ID`);
}

/** Write a model's `ArtifactStatus` by SQL. A plain string on purpose, as `RawStatusWrite`. */
async function RawArtifactStatusWrite(p: sql.ConnectionPool, modelId: string, artifactStatus: string): Promise<void> {
  await p.request()
    .input('ID', sql.UniqueIdentifier, modelId)
    .input('ArtifactStatus', sql.NVarChar(20), artifactStatus)
    .query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Models')} SET ArtifactStatus = @ArtifactStatus WHERE ID = @ID`);
}

/** One model column read back by SQL. */
async function StoredModelColumn(p: sql.ConnectionPool, modelId: string, column: 'Status' | 'ArtifactStatus'): Promise<string[]> {
  const stored = await p.request()
    .input('ID', sql.UniqueIdentifier, modelId)
    .query<Record<'Value', string>>(`SELECT [${column}] AS Value FROM ${tableOf(server.Provider, 'MJ: ML Models')} WHERE ID = @ID`);
  return stored.recordset.map((r) => r.Value);
}

/** Set `ServingWhileUnevaluated` by SQL, as only a data migration may. */
async function RawServingFlag(p: sql.ConnectionPool, modelId: string, flag: 0 | 1): Promise<void> {
  await p.request()
    .input('ID', sql.UniqueIdentifier, modelId)
    .input('Flag', sql.Bit, flag)
    .query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Models')} SET ServingWhileUnevaluated = @Flag WHERE ID = @ID`);
}

/** Demote a model to `Unevaluated` and keep it serving, in one statement, as the pre-change data migration does. */
async function RawUnevaluatedServing(p: sql.ConnectionPool, modelId: string): Promise<void> {
  await p.request()
    .input('ID', sql.UniqueIdentifier, modelId)
    .query(`UPDATE ${tableOf(server.Provider, 'MJ: ML Models')} SET Status = N'Unevaluated', ServingWhileUnevaluated = 1 WHERE ID = @ID`);
}

/** The latest-value view's rows for one record and feature, read through the entity like any reader. */
async function LatestRows(
  ctx: IntegrationBootstrapContext,
  entityId: string,
  recordId: string,
  featureName: string,
): Promise<Pick<MJvwLatestFeatureValuesEntity, 'ID'>[]> {
  const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJvwLatestFeatureValuesEntity, 'ID'>>(
    {
      EntityName: 'MJ: Latest Feature Values',
      ExtraFilter: `EntityID = '${EscapeSQLString(entityId)}' AND RecordID = '${EscapeSQLString(recordId)}' AND FeatureName = '${EscapeSQLString(featureName)}'`,
      Fields: ['ID'],
      ResultType: 'simple',
    },
    ctx.User,
  );
  if (!result.Success) throw new Error(`MJ: Latest Feature Values did not load: ${result.ErrorMessage}`);
  return result.Results;
}

/** A new training run of the pipeline, saved through the generated entity. */
function NewTrainingRun(pipelineId: string, algorithmId: string): Promise<MJMLTrainingRunEntity> {
  return createRow<MJMLTrainingRunEntity>('MJ: ML Training Runs', (r) => {
    r.PipelineID = pipelineId;
    r.AlgorithmID = algorithmId;
  });
}

/** One pipeline, one run, four models (distinct versions) and a record process, saved through the generated entities. */
async function createFixtures(): Promise<ServingFixtures> {
  const algorithms = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>(
    { EntityName: 'MJ: ML Algorithms', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
    server.User,
  );
  const algorithmId = algorithms.Results[0]?.ID;
  if (!algorithms.Success || !algorithmId) throw new Error('no MJ: ML Algorithms row to train with: push the metadata');
  const targetEntityId = server.Provider.EntityByName('MJ: Users')?.ID;
  if (!targetEntityId) throw new Error('MJ: Users is not in metadata');

  const pipeline = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (p) => {
    p.Name = TAG;
    p.TargetEntityID = targetEntityId;
    p.TargetVariable = 'Probe';
    p.ProblemType = 'classification';
    p.AlgorithmID = algorithmId;
  });
  const newModel = (version: number): Promise<MJMLModelEntity> =>
    createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
      m.PipelineID = pipeline.ID;
      m.AlgorithmID = algorithmId;
      m.Version = version;
      m.FeatureSchema = '[]';
      m.TargetVariable = 'Probe';
      m.ProblemType = 'classification';
    });
  const run = await NewTrainingRun(pipeline.ID, algorithmId);
  const model = await newModel(1);
  const publishedModel = await newModel(2);
  const legacyA = await newModel(3);
  const legacyB = await newModel(4);
  await RawStatusWrite(pool, publishedModel.ID, 'Published');
  const recordProcess = await createRow<MJRecordProcessEntity>('MJ: Record Processes', (rp) => {
    rp.Name = TAG;
    rp.EntityID = targetEntityId;
    rp.WorkType = 'ML Model';
    rp.ScopeType = 'SingleRecord';
  });
  return {
    AlgorithmID: algorithmId, Pipeline: pipeline, Run: run, Model: model, PublishedModel: publishedModel,
    LegacyA: legacyA, LegacyB: legacyB, RecordProcess: recordProcess,
  };
}

/** Delete every row the file created, children first. */
async function deleteFixtures(f: ServingFixtures): Promise<void> {
  const p = server.Provider;
  for (const id of unexpectedlySavedPublishRecordIDs) {
    await pool.request()
      .input('ID', sql.UniqueIdentifier, id)
      .query(`DELETE FROM ${tableOf(p, 'MJ: ML Model Publish Records')} WHERE ID = @ID`);
  }
  await pool.request()
    .input('PipelineID', sql.UniqueIdentifier, f.Pipeline.ID)
    .input('RecordProcessID', sql.UniqueIdentifier, f.RecordProcess.ID)
    .query(`
      DELETE FROM ${tableOf(p, 'MJ: Feature Values')} WHERE RecordProcessID = @RecordProcessID;
      DELETE FROM ${tableOf(p, 'MJ: Record Processes')} WHERE ID = @RecordProcessID;
      DELETE FROM ${tableOf(p, 'MJ: ML Scoring Runs')}
        WHERE ModelID IN (SELECT ID FROM ${tableOf(p, 'MJ: ML Models')} WHERE PipelineID = @PipelineID);
      DELETE FROM ${tableOf(p, 'MJ: ML Monitoring Results')}
        WHERE ModelID IN (SELECT ID FROM ${tableOf(p, 'MJ: ML Models')} WHERE PipelineID = @PipelineID);
      DELETE FROM ${tableOf(p, 'MJ: ML Output Bindings')}
        WHERE ModelID IN (SELECT ID FROM ${tableOf(p, 'MJ: ML Models')} WHERE PipelineID = @PipelineID);
      DELETE FROM ${tableOf(p, 'MJ: ML Model Publish Records')}
        WHERE ModelID IN (SELECT ID FROM ${tableOf(p, 'MJ: ML Models')} WHERE PipelineID = @PipelineID)
           OR TrainingRunID IN (SELECT ID FROM ${tableOf(p, 'MJ: ML Training Runs')} WHERE PipelineID = @PipelineID);
      DELETE FROM ${tableOf(p, 'MJ: ML Models')} WHERE PipelineID = @PipelineID;
      DELETE FROM ${tableOf(p, 'MJ: ML Training Runs')} WHERE PipelineID = @PipelineID;
      DELETE FROM ${tableOf(p, 'MJ: ML Training Pipelines')} WHERE ID = @PipelineID;`);
}

// The bootstrap loads all metadata. On a loaded host (a parallel build or test run) that alone has taken 44 s,
// past vitest's default hook timeout, so this hook gets its own.
const BOOTSTRAP_TIMEOUT_MS = 120_000;

beforeAll(async () => {
  server = await BootstrapIntegrationServer();
  pool = await TruthConnection.OpenPool();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  await pool?.close();
  await server?.ClosePool();
});

describe('ML model publish records refuse inconsistent rows', () => {
  beforeAll(async () => {
    fixtures = await createFixtures();
    defaultModelId = fixtures.Model.ID;
  });

  afterAll(async () => {
    if (fixtures) await deleteFixtures(fixtures);
  });

  it('refuses a user approver without a user', async () => {
    const r = await NewPublishRecord(server, { Kind: 'publish', ApproverKind: 'user', UserID: null });
    expect(await r.Save()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('CK_MLModelPublishRecord_Approver');
    // the other half of the cell: an automated-gate approver that names a user
    const gateWithUser = await NewPublishRecord(server, { Kind: 'publish', ApproverKind: 'automated-gate', UserID: server.User.ID });
    expect(await gateWithUser.Save()).toBe(false);
    expect(gateWithUser.LatestResult?.CompleteMessage).toContain('CK_MLModelPublishRecord_Approver');
  });

  it('refuses a sign-off that overrides flags with an empty reason', async () => {
    const r = await NewPublishRecord(server, { Kind: 'sign-off', OverridesFlags: OVERRIDDEN_FLAGS, Reason: '   ' });
    expect(await r.Save()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('CK_MLModelPublishRecord_Reason');
  });

  it('refuses a refusal record without a Refusal', async () => {
    const r = await NewPublishRecord(server, { Kind: 'refusal', Refusal: null });
    expect(await r.Save()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('CK_MLModelPublishRecord_Refusal');
  });

  it('refuses a sign-off whose approver is the automated gate', async () => {
    const r = await NewPublishRecord(server, { Kind: 'sign-off', ApproverKind: 'automated-gate', UserID: null });
    expect(await r.Save()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('CK_MLModelPublishRecord_SignOff');
  });

  it('refuses a publish record for a missing model', async () => {
    const r = await NewPublishRecord(server, { Kind: 'publish', ModelID: randomUUID() });
    const saved = await r.Save();
    // without FK_MLModelPublishRecord_Model the row saves; its random ModelID is outside the teardown's predicates
    if (saved) unexpectedlySavedPublishRecordIDs.push(r.ID);
    expect(saved).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('FK_MLModelPublishRecord_Model');
  });

  it('refuses a refused scoring run that wrote a score', async () => {
    const usersEntityId = server.Provider.EntityByName('MJ: Users')?.ID;
    if (!usersEntityId) throw new Error('MJ: Users is not in metadata');
    const run = await unsavedRow<MJMLScoringRunEntity>('MJ: ML Scoring Runs', (r) => {
      fillScoringRun(fixtures.Model.ID, usersEntityId, null)(r);
      r.Status = 'refused';
      r.Refusal = JSON.stringify({ kind: 'leakage-unknown', modelId: fixtures.Model.ID });
      r.Written = 1;
    });
    expect(await run.Save()).toBe(false);
    expect(run.LatestResult?.CompleteMessage).toContain('CK_MLScoringRun_Refused');
  });

  it('refuses a second monitoring result for one model and period', async () => {
    await NewMonitoringResult(fixtures.Model.ID, fixtures.Run.ID);
    const second = await unsavedRow<MJMLMonitoringResultEntity>('MJ: ML Monitoring Results', fillMonitoringResult(fixtures.Model.ID, fixtures.Run.ID));
    expect(await second.Save()).toBe(false);
    expect(second.LatestResult?.CompleteMessage).toContain('UQ_MLMonitoringResult_ModelPeriod');
  });

  it('refuses a second output binding for one model and surface', async () => {
    await createRow<MJMLOutputBindingEntity>('MJ: ML Output Bindings', fillOutputBinding(fixtures.Model.ID));
    const second = await unsavedRow<MJMLOutputBindingEntity>('MJ: ML Output Bindings', fillOutputBinding(fixtures.Model.ID));
    expect(await second.Save()).toBe(false);
    expect(second.LatestResult?.CompleteMessage).toContain('UQ_MLOutputBinding_ModelSurface');
  });

  it('refuses a second applied publish of one training run', async () => {
    const run = fixtures.Run;
    expect(await (await NewPublishRecord(server, { Kind: 'publish', TrainingRunID: run.ID })).Save()).toBe(true);
    const second = await NewPublishRecord(server, { Kind: 'publish', TrainingRunID: run.ID });
    expect(await second.Save()).toBe(false);
    expect(second.LatestResult?.CompleteMessage).toContain('UX_MLModelPublishRecord_OnePublishPerRun');
  });

  it('refuses a status outside the widened CHECK', async () => {
    // each of the six persisted values is saved and read back; KeepBaseline last, so the model ends there
    const accepted = [...Object.keys(CORE_STATUSES).filter((v) => v !== 'KeepBaseline'), 'KeepBaseline'];
    for (const status of accepted) {
      await expect(RawStatusWrite(pool, fixtures.Model.ID, status)).resolves.toBeUndefined();
      expect(await StoredModelColumn(pool, fixtures.Model.ID, 'Status')).toEqual([status]);
    }
    await expect(RawStatusWrite(pool, fixtures.Model.ID, 'Shipped')).rejects.toThrow('CK_MLModel_Status');
    await expect(RawStatusWrite(pool, fixtures.Model.ID, 'NoSignal')).rejects.toThrow('CK_MLModel_Status');
    expect(await StoredModelColumn(pool, fixtures.Model.ID, 'Status')).toEqual(['KeepBaseline']);
  });

  it('refuses an artifact status outside its CHECK', async () => {
    for (const artifactStatus of Object.keys(ARTIFACT_STATUSES)) {
      await expect(RawArtifactStatusWrite(pool, fixtures.Model.ID, artifactStatus)).resolves.toBeUndefined();
      expect(await StoredModelColumn(pool, fixtures.Model.ID, 'ArtifactStatus')).toEqual([artifactStatus]);
    }
    await expect(RawArtifactStatusWrite(pool, fixtures.Model.ID, 'corrupt')).rejects.toThrow('CK_MLModel_ArtifactStatus');
    await expect(RawArtifactStatusWrite(pool, fixtures.Model.ID, 'unverified')).resolves.toBeUndefined();
  });

  it("the Core status union equals the generated MJMLModelEntity['Status']", async () => {
    // compile time: status-union-parity.compile.test.ts (this package's tsconfig excludes __tests__, so tsc never
    // checks a type assertion written here)
    // run time: Core's written-out values against the generated entity's Zod literals and the database CHECK
    const core = new Set<string>(Object.keys(CORE_STATUSES));
    const generated = new Set<string>(MJMLModelSchema.shape.Status.options.map((o) => o.value));
    expect(generated).toEqual(core);
    const check = await pool.request().query<{ Definition: string }>(
      `SELECT definition AS Definition FROM sys.check_constraints WHERE name = N'CK_MLModel_Status'`);
    expect(check.recordset).toHaveLength(1);
    const checked = new Set<string>([...check.recordset[0].Definition.matchAll(/'([^']+)'/g)].map((m) => m[1]));
    expect(checked).toEqual(core);
  });

  it('refuses ServingWhileUnevaluated on a model that is not Unevaluated', async () => {
    await expect(RawServingFlag(pool, fixtures.PublishedModel.ID, 1)).rejects.toThrow('CK_MLModel_ServingWhileUnevaluated');
  });

  it('refuses a second serving pre-change model of one pipeline', async () => {
    await RawUnevaluatedServing(pool, fixtures.LegacyA.ID);
    // LegacyB has LegacyA's PipelineID
    await expect(RawUnevaluatedServing(pool, fixtures.LegacyB.ID)).rejects.toThrow('UX_MLModel_OneServingUnevaluatedPerPipeline');
  });

  it('refuses an adopt record that is not a publish', async () => {
    const r = await NewPublishRecord(server, { Kind: 'refusal', Purpose: 'adopt', TrainingRunID: fixtures.Run.ID });
    expect(await r.Save()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('CK_MLModelPublishRecord_Adopt');
  });

  it('accepts a run-level refusal with no model and refuses any other row without one', async () => {
    // The case's own runs: one whose outcome produced no model, one that already holds an applied publish.
    const noSignalRun = await NewTrainingRun(fixtures.Pipeline.ID, fixtures.AlgorithmID);
    const publishedRun = await NewTrainingRun(fixtures.Pipeline.ID, fixtures.AlgorithmID);
    expect(await (await NewPublishRecord(server, { Kind: 'publish', TrainingRunID: publishedRun.ID })).Save()).toBe(true);
    expect(await (await NewPublishRecord(server, { Kind: 'refusal', Purpose: 'evaluate', ModelID: null, TrainingRunID: noSignalRun.ID })).Save()).toBe(true);
    // The orphan names the run without an applied publish: one naming publishedRun would be refused by
    // UX_MLModelPublishRecord_OnePublishPerRun before the CHECK is reached.
    const orphan = await NewPublishRecord(server, { Kind: 'publish', Purpose: 'publish', ModelID: null, TrainingRunID: noSignalRun.ID });
    expect(await orphan.Save()).toBe(false);
    expect(orphan.LatestResult?.CompleteMessage).toContain('CK_MLModelPublishRecord_RunLevel');
    const second = await NewPublishRecord(server, { Kind: 'refusal', Purpose: 'evaluate', ModelID: null, TrainingRunID: noSignalRun.ID });
    expect(await second.Save()).toBe(false);
    expect(second.LatestResult?.CompleteMessage).toContain('UX_MLModelPublishRecord_OneRunOutcome');
  });

  it('the latest-value view returns the newest dated Champion row and never a Challenger', async () => {
    const entityId = server.Provider.EntityByName('MJ: Users')?.ID;
    if (!entityId) throw new Error('MJ: Users is not in metadata');
    const recordId = fixtures.Pipeline.ID;   // any key the record process never wrote before this case
    const value = (role: MJFeatureValueEntity['Role'], effectiveAsOf: Date | null, computedAt: Date): Promise<MJFeatureValueEntity> =>
      createRow<MJFeatureValueEntity>('MJ: Feature Values', (fv) => {
        fv.RecordProcessID = fixtures.RecordProcess.ID;
        fv.EntityID = entityId;
        fv.RecordID = recordId;
        fv.FeatureName = PROBE_FEATURE;
        fv.Source = 'Pipeline';
        fv.Role = role;
        fv.EffectiveAsOf = effectiveAsOf;
        fv.ComputedAt = computedAt;
        fv.ValueNumeric = 1;
      });
    await value('Champion', new Date('2026-01-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'));
    await value('Champion', new Date('2026-03-01T00:00:00Z'), new Date('2026-03-02T00:00:00Z'));                // same EffectiveAsOf, computed earlier
    const newestDatedChampion = await value('Champion', new Date('2026-03-01T00:00:00Z'), new Date('2026-03-05T00:00:00Z'));
    await value('Champion', null, new Date('2026-09-01T00:00:00Z'));                                   // undated: never beats a dated value
    await value('Challenger', new Date('2026-06-01T00:00:00Z'), new Date('2026-06-02T00:00:00Z'));    // newer, but a shadow score
    const rows = await LatestRows(server, entityId, recordId, PROBE_FEATURE);
    expect(rows.map((r) => r.ID)).toEqual([newestDatedChampion.ID]);
  });

  it("a same-day re-run's later row is the latest value", async () => {
    const entityId = server.Provider.EntityByName('MJ: Users')?.ID;
    if (!entityId) throw new Error('MJ: Users is not in metadata');
    const day = new Date('2026-04-01T00:00:00Z');
    const champion = (recordId: string, computedAt: Date): Promise<MJFeatureValueEntity> =>
      createRow<MJFeatureValueEntity>('MJ: Feature Values', (fv) => {
        fv.RecordProcessID = fixtures.RecordProcess.ID;
        fv.EntityID = entityId;
        fv.RecordID = recordId;
        fv.FeatureName = PROBE_FEATURE;
        fv.Source = 'Pipeline';
        fv.Role = 'Champion';
        fv.EffectiveAsOf = day;
        fv.ComputedAt = computedAt;
        fv.ValueNumeric = 1;
      });
    // one EffectiveAsOf, two computations: the later ComputedAt wins whichever row was written first
    const rerunRecord = randomUUID();
    const rerun = await champion(rerunRecord, new Date('2026-04-01T18:00:00Z'));
    await champion(rerunRecord, new Date('2026-04-01T06:00:00Z'));
    expect((await LatestRows(server, entityId, rerunRecord, PROBE_FEATURE)).map((r) => r.ID)).toEqual([rerun.ID]);
    // one EffectiveAsOf and one ComputedAt: the higher ID, in the database's uniqueidentifier order
    const tieRecord = randomUUID();
    const sameInstant = new Date('2026-04-01T12:00:00Z');
    const tied = [await champion(tieRecord, sameInstant), await champion(tieRecord, sameInstant)];
    const higher = await pool.request()
      .input('A', sql.UniqueIdentifier, tied[0].ID)
      .input('B', sql.UniqueIdentifier, tied[1].ID)
      .query<{ ID: string }>(`SELECT TOP 1 ID FROM ${tableOf(server.Provider, 'MJ: Feature Values')} WHERE ID IN (@A, @B) ORDER BY ID DESC`);
    const latest = await LatestRows(server, entityId, tieRecord, PROBE_FEATURE);
    expect(latest).toHaveLength(1);
    expect(UUIDsEqual(latest[0].ID, higher.recordset[0].ID)).toBe(true);
  });
});

// ── spDeleteEntityWithCoreDependencies ─────────────────────────────────────────────────────────────────────────────

/** The entity the delete case removes, its pipeline, and the rows of every serving table that name that pipeline. */
interface DoomedEntityWorld {
  readonly EntityID: string;
  readonly PipelineID: string;
  readonly RunID: string;
  readonly NoSignalRunID: string;
  readonly SnapshotID: string;
  readonly PredictionUnitID: string;
  readonly FileIDs: readonly string[];
  readonly ModelID: string;
  readonly BindingID: string;
  /** A sign-off of the doomed model that another pipeline's publish consumed. */
  readonly ConsumedSignOffID: string;
  /** A scoring run scoped to the doomed entity, of the surviving model: only its scope ties it to the entity. */
  readonly ScopedRunID: string;
}

/** Rows of another pipeline that reference the doomed rows: each must survive with the reference cleared. */
interface SurvivingRows {
  /** `SignOffID` names the consumed sign-off, `ReplacesModelID` the doomed model. */
  readonly PublishID: string;
  /** `MLModelScoringBindingID` names the doomed model's binding. */
  readonly ScoringRunID: string;
  /** `ChallengerRunID` names the doomed run. */
  readonly MonitoringResultID: string;
  /** `MLModelID` names the doomed model. */
  readonly FeatureValueID: string;
  /** `TrainingRunID` names the doomed run, `TrainingSnapshotID` the doomed snapshot. */
  readonly ModelID: string;
  /** A sign-off of the surviving model whose `TrainingRunID` names the doomed run: kept, the run link cleared (R2, D4-73). */
  readonly RunNamingRecordID: string;
}

/** The surviving rows' references after the delete, and how many of the six rows are still there. */
interface SurvivingReferences {
  readonly Surviving: number;
  readonly RunNamingRecordRunID: string | null;
  readonly RunNamingRecordModelID: string | null;
  readonly SignOffID: string | null;
  readonly ReplacesModelID: string | null;
  readonly BindingID: string | null;
  readonly ChallengerRunID: string | null;
  readonly FeatureValueModelID: string | null;
  readonly ModelTrainingRunID: string | null;
  readonly ModelTrainingSnapshotID: string | null;
}

/** The doomed pipeline's rows written before its serving rows. */
type DoomedPipeline = Pick<
  DoomedEntityWorld,
  'EntityID' | 'PipelineID' | 'RunID' | 'NoSignalRunID' | 'SnapshotID' | 'PredictionUnitID' | 'FileIDs' | 'ModelID'
>;

/** A 64-character hex digest: the snapshot's hash columns only check the length. */
function RandomSha256(): string {
  return randomBytes(32).toString('hex');
}

/** Write an Entity row by SQL, as CodeGen does. Its table never exists: the case only deletes the row. */
async function RawScratchEntity(p: sql.ConnectionPool, entityId: string): Promise<void> {
  const entities = server.Provider.EntityByName('MJ: Entities');
  if (!entities) throw new Error('MJ: Entities is not in metadata');
  const name = `PSServingDelete${entityId.replace(/-/g, '').slice(0, 12)}`;
  await p.request()
    .input('ID', sql.UniqueIdentifier, entityId)
    .input('Name', sql.NVarChar(255), name)
    .input('View', sql.NVarChar(255), `vw${name}`)
    .input('Schema', sql.NVarChar(255), entities.SchemaName)
    .query(`INSERT INTO ${tableOf(server.Provider, 'MJ: Entities')} (ID, Name, BaseTable, BaseView, SchemaName)
            VALUES (@ID, @Name, @Name, @View, @Schema)`);
}

/**
 * A training snapshot of the pipeline with the prediction unit and the three files it requires, written by SQL. The
 * snapshot builder writes these through its storage provider; the case needs only the rows, whose thirty required
 * columns are not what it tests.
 */
async function RawTrainingSnapshot(p: sql.ConnectionPool, pipelineId: string): Promise<Pick<DoomedEntityWorld, 'SnapshotID' | 'PredictionUnitID' | 'FileIDs'>> {
  const ids = { SnapshotID: randomUUID(), PredictionUnitID: randomUUID(), FileIDs: [randomUUID(), randomUUID(), randomUUID()] };
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  await p.request()
    .input('SnapshotID', sql.UniqueIdentifier, ids.SnapshotID)
    .input('UnitID', sql.UniqueIdentifier, ids.PredictionUnitID)
    .input('F1', sql.UniqueIdentifier, ids.FileIDs[0])
    .input('F2', sql.UniqueIdentifier, ids.FileIDs[1])
    .input('F3', sql.UniqueIdentifier, ids.FileIDs[2])
    .input('PipelineID', sql.UniqueIdentifier, pipelineId)
    .input('Name', sql.NVarChar(255), TAG)
    .input('ContentHash', sql.NVarChar(64), RandomSha256())
    .input('Hash', sql.NVarChar(64), RandomSha256())
    .query(`
      DECLARE @ProviderID uniqueidentifier = (SELECT TOP 1 ID FROM ${t('MJ: File Storage Providers')} ORDER BY ID);
      INSERT INTO ${t('MJ: ML Prediction Units')} (ID, LineageRootID, Version, Name, UnitRows, LabelRule, LabelWindowDays,
          LabelGapDays, TaskType, LabelVersion, Censoring, ChangeHistoryPolicy, DecisionSpec, IncumbentHeuristic, AuthoredBy)
        VALUES (@UnitID, @UnitID, 1, @Name, N'{}', N'{}', 30, 0, N'classification', 1, N'{}', N'{}', N'{}', N'{}', N'{}');
      INSERT INTO ${t('MJ: Files')} (ID, Name, ProviderID) VALUES (@F1, @Name, @ProviderID), (@F2, @Name, @ProviderID), (@F3, @Name, @ProviderID);
      INSERT INTO ${t('MJ: ML Training Snapshots')} (ID, ContentHash, PipelineID, PredictionUnitID, LabelVersion,
          FeatureSpecVersion, StorageProviderID, MatrixFileID, MatrixSha256, MatrixSizeBytes, RowManifestFileID,
          RowManifestSha256, RowManifestSizeBytes, ProvenanceFileID, ProvenanceSha256, ProvenanceSizeBytes, ManifestRowCount,
          HoldoutRowCount, FeatureSpec, FeatureSchema, FeatureSchemaHash, ColumnProvenance, RowsRead, CensoredRowsExcluded,
          LabelKnownRowsExcluded, EmptyLabelRowsExcluded, DataCutoff, AssemblyCodeVersion)
        VALUES (@SnapshotID, @ContentHash, @PipelineID, @UnitID, 1, 1, @ProviderID, @F1, @Hash, 0, @F2, @Hash, 0, @F3, @Hash, 0,
          0, 0, N'{}', N'[]', @Hash, N'{}', 0, 0, 0, 0, SYSDATETIMEOFFSET(), N'serving-schema-test');`);
  return ids;
}

/** Fills a completed scoring run of version 1 of `modelId`, scoped to `scopeEntityId`. */
function fillScoringRun(modelId: string, scopeEntityId: string, bindingId: string | null): (r: MJMLScoringRunEntity) => void {
  return (r) => {
    r.ModelID = modelId;
    r.ModelVersion = 1;
    r.MLModelScoringBindingID = bindingId;
    r.Path = 'score-record-set';
    r.ScopeKind = 'record-ids';
    r.ScopeEntityID = scopeEntityId;
    r.Scope = JSON.stringify({ recordIds: [] });
    r.AsOfDate = new Date('2026-10-01T00:00:00Z');
    r.ReadPolicy = '{}';
    r.RequestedBy = JSON.stringify({ kind: 'system', component: 'serving-schema-test' });
    r.Status = 'completed';
  };
}

/** A completed scoring run of version 1 of `modelId`, scoped to `scopeEntityId`, saved through the generated entity. */
function NewScoringRun(modelId: string, scopeEntityId: string, bindingId: string | null): Promise<MJMLScoringRunEntity> {
  return createRow<MJMLScoringRunEntity>('MJ: ML Scoring Runs', fillScoringRun(modelId, scopeEntityId, bindingId));
}

/** Fills an evaluated monitoring result of `modelId` for October 2026, monthly. */
function fillMonitoringResult(modelId: string, challengerRunId: string): (m: MJMLMonitoringResultEntity) => void {
  return (m) => {
    m.ModelID = modelId;
    m.Period = new Date('2026-10-01T00:00:00Z');
    m.PeriodGrain = 'month';
    m.State = 'evaluated';
    m.DriftAlarms = '[]';
    m.TriggersFired = '[]';
    m.ChallengerRunID = challengerRunId;
  };
}

/** An evaluated monthly monitoring result of `modelId`, saved through the generated entity. */
function NewMonitoringResult(modelId: string, challengerRunId: string): Promise<MJMLMonitoringResultEntity> {
  return createRow<MJMLMonitoringResultEntity>('MJ: ML Monitoring Results', fillMonitoringResult(modelId, challengerRunId));
}

/** Fills a record-panel output binding of `modelId`. */
function fillOutputBinding(modelId: string): (b: MJMLOutputBindingEntity) => void {
  return (b) => {
    b.ModelID = modelId;
    b.Surface = 'record-panel';
    b.SortsBy = 'none';
    b.DriverDirectionRelativeTo = 'raw-contribution';
    b.Label = TAG;
  };
}

/** Save a publish record built by `NewPublishRecord`; throws with the provider's message when the save fails. */
async function SavePublishRecord(overrides: PublishRecordOverrides): Promise<MJMLModelPublishRecordEntity> {
  const r = await NewPublishRecord(server, overrides);
  if (!(await r.Save())) throw new Error(`fixture publish record did not save: ${r.LatestResult?.CompleteMessage}`);
  return r;
}

/** The scratch entity, its pipeline, a trained run and a no-signal run, a snapshot, and the model the run produced. */
async function createDoomedPipeline(algorithmId: string): Promise<DoomedPipeline> {
  const entityId = randomUUID();
  await RawScratchEntity(pool, entityId);
  const pipeline = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (p) => {
    p.Name = `${TAG}-doomed-${entityId}`;
    p.TargetEntityID = entityId;
    p.TargetVariable = 'Probe';
    p.ProblemType = 'classification';
    p.AlgorithmID = algorithmId;
  });
  const run = await NewTrainingRun(pipeline.ID, algorithmId);
  const noSignalRun = await NewTrainingRun(pipeline.ID, algorithmId);
  const snapshot = await RawTrainingSnapshot(pool, pipeline.ID);
  const model = await createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
    m.PipelineID = pipeline.ID;
    m.AlgorithmID = algorithmId;
    m.Version = 1;
    m.FeatureSchema = '[]';
    m.TargetVariable = 'Probe';
    m.ProblemType = 'classification';
    m.TrainingRunID = run.ID;
    m.TrainingSnapshotID = snapshot.SnapshotID;
  });
  return { EntityID: entityId, PipelineID: pipeline.ID, RunID: run.ID, NoSignalRunID: noSignalRun.ID, ModelID: model.ID, ...snapshot };
}

/** One row of every serving table naming the doomed pipeline: publish pair, run-level refusal, bindings, runs, monitoring. */
async function createDoomedServingRows(d: DoomedPipeline, survivingModelId: string): Promise<DoomedEntityWorld> {
  const signOff = await SavePublishRecord({ Kind: 'sign-off', ModelID: d.ModelID });
  await SavePublishRecord({ Kind: 'publish', ModelID: d.ModelID, TrainingRunID: d.RunID, SignOffID: signOff.ID });
  await SavePublishRecord({ Kind: 'refusal', Purpose: 'evaluate', ModelID: null, TrainingRunID: d.NoSignalRunID });
  const consumedSignOff = await SavePublishRecord({ Kind: 'sign-off', ModelID: d.ModelID });
  await createRow<MJMLOutputBindingEntity>('MJ: ML Output Bindings', fillOutputBinding(d.ModelID));
  const binding = await createRow<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', (b) => {
    b.MLModelID = d.ModelID;
    b.TargetEntityID = d.EntityID;
    b.Mode = 'OnDemand';
  });
  await NewScoringRun(d.ModelID, d.EntityID, binding.ID);
  await NewMonitoringResult(d.ModelID, d.RunID);
  const scopedRun = await NewScoringRun(survivingModelId, d.EntityID, null);
  return { ...d, BindingID: binding.ID, ConsumedSignOffID: consumedSignOff.ID, ScopedRunID: scopedRun.ID };
}

/** Rows of the surviving pipeline that reference the doomed rows through each nullable FK the procedure clears. */
async function createSurvivingRows(w: DoomedEntityWorld, s: ServingFixtures): Promise<SurvivingRows> {
  const usersEntityId = server.Provider.EntityByName('MJ: Users')?.ID;
  if (!usersEntityId) throw new Error('MJ: Users is not in metadata');
  const publish = await SavePublishRecord({ Kind: 'publish', ModelID: s.Model.ID, SignOffID: w.ConsumedSignOffID, ReplacesModelID: w.ModelID });
  const scoringRun = await NewScoringRun(s.Model.ID, usersEntityId, w.BindingID);
  const monitoring = await NewMonitoringResult(s.Model.ID, w.RunID);
  const featureValue = await createRow<MJFeatureValueEntity>('MJ: Feature Values', (fv) => {
    fv.RecordProcessID = s.RecordProcess.ID;
    fv.EntityID = usersEntityId;
    fv.RecordID = s.Pipeline.ID;
    fv.FeatureName = PROBE_FEATURE;
    fv.Source = 'Pipeline';
    fv.Role = 'Champion';
    fv.MLModelID = w.ModelID;
    fv.ValueNumeric = 1;
  });
  const model = await server.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', server.User);
  if (!(await model.Load(s.Model.ID))) throw new Error(`surviving model did not load: ${model.LatestResult?.CompleteMessage}`);
  model.TrainingRunID = w.RunID;
  model.TrainingSnapshotID = w.SnapshotID;
  if (!(await model.Save())) throw new Error(`surviving model did not save: ${model.LatestResult?.CompleteMessage}`);
  const runNaming = await SavePublishRecord({ Kind: 'sign-off', ModelID: s.Model.ID, TrainingRunID: w.RunID });
  return {
    PublishID: publish.ID, ScoringRunID: scoringRun.ID, MonitoringResultID: monitoring.ID, FeatureValueID: featureValue.ID,
    ModelID: model.ID, RunNamingRecordID: runNaming.ID,
  };
}

/** Run the procedure as CodeGen does: one EXEC in autocommit, so the procedure owns its transaction. */
async function RunEntityDelete(p: sql.ConnectionPool, entityId: string): Promise<void> {
  const entities = server.Provider.EntityByName('MJ: Entities');
  if (!entities) throw new Error('MJ: Entities is not in metadata');
  await p.request()
    .input('EntityID', sql.UniqueIdentifier, entityId)
    .query(`EXEC [${entities.SchemaName}].[spDeleteEntityWithCoreDependencies] @EntityID = @EntityID`);
}

/** Rows of the doomed world still present: the brief's four serving counts plus the entity, pipeline, snapshot, binding and scoped run. */
async function DoomedRowCount(p: sql.ConnectionPool, w: DoomedEntityWorld): Promise<number> {
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  const result = await p.request()
    .input('EntityID', sql.UniqueIdentifier, w.EntityID)
    .input('PipelineID', sql.UniqueIdentifier, w.PipelineID)
    .input('ModelID', sql.UniqueIdentifier, w.ModelID)
    .input('NoSignalRunID', sql.UniqueIdentifier, w.NoSignalRunID)
    .input('SnapshotID', sql.UniqueIdentifier, w.SnapshotID)
    .input('BindingID', sql.UniqueIdentifier, w.BindingID)
    .input('ScopedRunID', sql.UniqueIdentifier, w.ScopedRunID)
    .query<{ Remaining: number }>(`SELECT
        (SELECT COUNT(*) FROM ${t('MJ: ML Model Publish Records')} WHERE ModelID = @ModelID OR TrainingRunID = @NoSignalRunID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Scoring Runs')} WHERE ModelID = @ModelID OR ID = @ScopedRunID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Monitoring Results')} WHERE ModelID = @ModelID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Output Bindings')} WHERE ModelID = @ModelID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Model Scoring Bindings')} WHERE ID = @BindingID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Training Snapshots')} WHERE ID = @SnapshotID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Training Pipelines')} WHERE ID = @PipelineID)
      + (SELECT COUNT(*) FROM ${t('MJ: Entities')} WHERE ID = @EntityID) AS Remaining`);
  return result.recordset[0].Remaining;
}

/** The surviving rows' references to the doomed rows, read back by SQL. */
async function SurvivingReferencesOf(p: sql.ConnectionPool, s: SurvivingRows): Promise<SurvivingReferences> {
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  const result = await p.request()
    .input('PublishID', sql.UniqueIdentifier, s.PublishID)
    .input('ScoringRunID', sql.UniqueIdentifier, s.ScoringRunID)
    .input('MonitoringResultID', sql.UniqueIdentifier, s.MonitoringResultID)
    .input('FeatureValueID', sql.UniqueIdentifier, s.FeatureValueID)
    .input('ModelID', sql.UniqueIdentifier, s.ModelID)
    .input('RunNamingRecordID', sql.UniqueIdentifier, s.RunNamingRecordID)
    .query<SurvivingReferences>(`SELECT
        (SELECT COUNT(*) FROM ${t('MJ: ML Model Publish Records')} WHERE ID IN (@PublishID, @RunNamingRecordID))
      + (SELECT COUNT(*) FROM ${t('MJ: ML Scoring Runs')} WHERE ID = @ScoringRunID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Monitoring Results')} WHERE ID = @MonitoringResultID)
      + (SELECT COUNT(*) FROM ${t('MJ: Feature Values')} WHERE ID = @FeatureValueID)
      + (SELECT COUNT(*) FROM ${t('MJ: ML Models')} WHERE ID = @ModelID) AS Surviving,
        (SELECT TrainingRunID FROM ${t('MJ: ML Model Publish Records')} WHERE ID = @RunNamingRecordID) AS RunNamingRecordRunID,
        (SELECT ModelID FROM ${t('MJ: ML Model Publish Records')} WHERE ID = @RunNamingRecordID) AS RunNamingRecordModelID,
        (SELECT SignOffID FROM ${t('MJ: ML Model Publish Records')} WHERE ID = @PublishID) AS SignOffID,
        (SELECT ReplacesModelID FROM ${t('MJ: ML Model Publish Records')} WHERE ID = @PublishID) AS ReplacesModelID,
        (SELECT MLModelScoringBindingID FROM ${t('MJ: ML Scoring Runs')} WHERE ID = @ScoringRunID) AS BindingID,
        (SELECT ChallengerRunID FROM ${t('MJ: ML Monitoring Results')} WHERE ID = @MonitoringResultID) AS ChallengerRunID,
        (SELECT MLModelID FROM ${t('MJ: Feature Values')} WHERE ID = @FeatureValueID) AS FeatureValueModelID,
        (SELECT TrainingRunID FROM ${t('MJ: ML Models')} WHERE ID = @ModelID) AS ModelTrainingRunID,
        (SELECT TrainingSnapshotID FROM ${t('MJ: ML Models')} WHERE ID = @ModelID) AS ModelTrainingSnapshotID`);
  return result.recordset[0];
}

/**
 * Delete what one delete case wrote that the procedure leaves (the prediction unit, the files, the surviving rows' links)
 * and, when the procedure failed, the doomed world too, children first. The surviving pipeline's own fixtures are
 * deleted once, after every world, by `deleteFixtures`.
 */
async function deleteDoomedWorld(w: DoomedEntityWorld, s: ServingFixtures): Promise<void> {
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  await pool.request()
    .input('EntityID', sql.UniqueIdentifier, w.EntityID)
    .input('Doomed', sql.UniqueIdentifier, w.PipelineID)
    .input('Surviving', sql.UniqueIdentifier, s.Pipeline.ID)
    .input('UnitID', sql.UniqueIdentifier, w.PredictionUnitID)
    .input('F1', sql.UniqueIdentifier, w.FileIDs[0])
    .input('F2', sql.UniqueIdentifier, w.FileIDs[1])
    .input('F3', sql.UniqueIdentifier, w.FileIDs[2])
    .query(`
      DECLARE @Models TABLE (ID uniqueidentifier PRIMARY KEY);
      INSERT INTO @Models (ID) SELECT ID FROM ${t('MJ: ML Models')} WHERE PipelineID IN (@Doomed, @Surviving);
      DECLARE @Runs TABLE (ID uniqueidentifier PRIMARY KEY);
      INSERT INTO @Runs (ID) SELECT ID FROM ${t('MJ: ML Training Runs')} WHERE PipelineID IN (@Doomed, @Surviving);
      DELETE FROM ${t('MJ: Feature Values')} WHERE MLModelID IN (SELECT ID FROM @Models);
      DELETE FROM ${t('MJ: ML Scoring Runs')} WHERE ModelID IN (SELECT ID FROM @Models) OR ScopeEntityID = @EntityID
        OR MLModelScoringBindingID IN (SELECT ID FROM ${t('MJ: ML Model Scoring Bindings')} WHERE MLModelID IN (SELECT ID FROM @Models));
      DELETE FROM ${t('MJ: ML Monitoring Results')} WHERE ModelID IN (SELECT ID FROM @Models);
      DELETE FROM ${t('MJ: ML Output Bindings')} WHERE ModelID IN (SELECT ID FROM @Models);
      DELETE FROM ${t('MJ: ML Model Scoring Bindings')} WHERE MLModelID IN (SELECT ID FROM @Models);
      DELETE FROM ${t('MJ: ML Model Publish Records')} WHERE ModelID IN (SELECT ID FROM @Models)
        OR ReplacesModelID IN (SELECT ID FROM @Models) OR TrainingRunID IN (SELECT ID FROM @Runs);
      UPDATE ${t('MJ: ML Models')} SET TrainingRunID = NULL, TrainingSnapshotID = NULL WHERE ID IN (SELECT ID FROM @Models);
      DELETE FROM ${t('MJ: ML Models')} WHERE PipelineID = @Doomed;
      DELETE FROM ${t('MJ: ML Training Runs')} WHERE PipelineID = @Doomed;
      DELETE FROM ${t('MJ: ML Training Snapshots')} WHERE PipelineID = @Doomed;
      DELETE FROM ${t('MJ: ML Training Pipelines')} WHERE ID = @Doomed;
      DELETE FROM ${t('MJ: ML Prediction Units')} WHERE ID = @UnitID;
      DELETE FROM ${t('MJ: Files')} WHERE ID IN (@F1, @F2, @F3);
      DELETE FROM ${t('MJ: Entities')} WHERE ID = @EntityID;`);
}

/** A new scratch entity with a pipeline holding a row of every serving table, recorded in `worlds` for the teardown. */
async function BuildDoomedWorld(s: ServingFixtures, worlds: DoomedEntityWorld[]): Promise<DoomedEntityWorld> {
  const doomed = await createDoomedPipeline(s.AlgorithmID);
  const world = await createDoomedServingRows(doomed, s.Model.ID);
  worlds.push(world);
  return world;
}

describe('spDeleteEntityWithCoreDependencies removes an entity with its serving rows', () => {
  // Each case builds its own doomed entity and runs the procedure itself, so neither depends on the other.
  let surviving: ServingFixtures;
  const worlds: DoomedEntityWorld[] = [];

  beforeAll(async () => {
    surviving = await createFixtures();
  });

  afterAll(async () => {
    if (!surviving) return;
    for (const w of worlds) await deleteDoomedWorld(w, surviving);
    await deleteFixtures(surviving);
  });

  it('deletes the pipeline\'s publish records, scoring runs, monitoring results and output bindings, and the scoped run', async () => {
    const world = await BuildDoomedWorld(surviving, worlds);
    expect(await DoomedRowCount(pool, world)).toBeGreaterThan(0);
    await expect(RunEntityDelete(pool, world.EntityID)).resolves.toBeUndefined();
    expect(await DoomedRowCount(pool, world)).toBe(0);
  });

  it('clears the references the other pipeline\'s rows hold to the deleted rows, and keeps those rows', async () => {
    const world = await BuildDoomedWorld(surviving, worlds);
    const survivors = await createSurvivingRows(world, surviving);
    await expect(RunEntityDelete(pool, world.EntityID)).resolves.toBeUndefined();
    const { RunNamingRecordModelID, ...cleared } = await SurvivingReferencesOf(pool, survivors);
    expect(cleared).toEqual({
      Surviving: 6,
      RunNamingRecordRunID: null,
      SignOffID: null,
      ReplacesModelID: null,
      BindingID: null,
      ChallengerRunID: null,
      FeatureValueModelID: null,
      ModelTrainingRunID: null,
      ModelTrainingSnapshotID: null,
    });
    // the record that named the doomed run keeps its model (R2, D4-73)
    expect(UUIDsEqual(RunNamingRecordModelID, surviving.Model.ID)).toBe(true);
  });
});

// ── the hand-written blocks that must apply twice ─────────────────────────────────────────────────────────────────

/** The migration whose hand-written section the run-twice case re-applies, from the repository root. */
const SERVING_MIGRATION = new URL('../../../../../../migrations/v6/V202611101201__v6.3.x__PS_Honest_Serving_Schema.sql', import.meta.url);
/** The fixed IDs those blocks write under (the migration's literals). */
const FEATURE_VALUES_ENTITY_ID = '3BED585D-B150-4899-AB06-8A19624EA9BE';
const ML_MODELS_ENTITY_ID = 'A3997636-011D-46E0-BC01-8B1E61E1087B';
const ROLE_FIELD_ID = '234FB2CE-776D-4D36-B356-0FE1348132B4';
const LATEST_VALUES_ENTITY_ID = '1AC777D7-EEE8-485F-83DB-2127DBB4BFB7';

/** How many of each object the guarded block and the Entity insert own: each must be 1 (2 for the pairs), before and after. */
interface ServingObjectCensus {
  readonly RoleColumn: number;
  readonly MLModelIDColumn: number;
  readonly RoleDefault: number;
  readonly RoleCheck: number;
  readonly MLModelForeignKey: number;
  readonly MLModelIndex: number;
  readonly ColumnDescriptions: number;
  readonly EntityFields: number;
  readonly RoleFieldValues: number;
  readonly Relationship: number;
  readonly LatestValuesEntity: number;
}

/** Text from `start` up to (not including) the first `end` after it; throws when either marker is missing. */
function sliceBetween(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = from < 0 ? -1 : text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`migration marker not found: ${from < 0 ? start : end}`);
  return text.slice(from, to);
}

/**
 * #6180's guarded block (section 4: FeatureValue's Role and MLModelID, their constraints, descriptions and metadata
 * rows) and the virtual Entity insert of section 6, as the batches Flyway sends, with the schema placeholder resolved.
 */
function idempotentBatches(schema: string): string[] {
  const text = readFileSync(SERVING_MIGRATION, 'utf8');
  const guarded = sliceBetween(text, '-- 4. FeatureValue + Role and MLModelID', '-- 5. FeatureValue: the latest value');
  const entityInsert = sliceBetween(text, `IF NOT EXISTS (SELECT 1 FROM [\${flyway:defaultSchema}].[Entity] WHERE [ID] = '${LATEST_VALUES_ENTITY_ID}')`, '\nGO');
  return `${guarded}\nGO\n${entityInsert}`
    .split('${flyway:defaultSchema}').join(schema)
    .split(/^\s*GO\s*$/m)
    .filter((batch) => batch.replace(/--.*$/gm, '').trim().length > 0);
}

/** Count the objects the blocks own, through `request` (inside or outside the case's transaction). */
async function censusOf(request: sql.Request, schema: string): Promise<ServingObjectCensus> {
  const fv = `N'[${schema}].[FeatureValue]'`;
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  const result = await request
    .input('FVEntity', sql.UniqueIdentifier, FEATURE_VALUES_ENTITY_ID)
    .input('ModelsEntity', sql.UniqueIdentifier, ML_MODELS_ENTITY_ID)
    .input('RoleField', sql.UniqueIdentifier, ROLE_FIELD_ID)
    .input('LatestEntity', sql.UniqueIdentifier, LATEST_VALUES_ENTITY_ID)
    .query<ServingObjectCensus>(`SELECT
      (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(${fv}) AND name = N'Role') AS RoleColumn,
      (SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(${fv}) AND name = N'MLModelID') AS MLModelIDColumn,
      (SELECT COUNT(*) FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(${fv}) AND name = N'DF_FeatureValue_Role') AS RoleDefault,
      (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(${fv}) AND name = N'CK_FeatureValue_Role') AS RoleCheck,
      (SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID(${fv}) AND name = N'FK_FeatureValue_MLModel') AS MLModelForeignKey,
      (SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID(${fv}) AND name = N'IDX_AUTO_MJ_FKEY_FeatureValue_MLModelID') AS MLModelIndex,
      (SELECT COUNT(*) FROM sys.extended_properties WHERE major_id = OBJECT_ID(${fv}) AND name = N'MS_Description'
         AND minor_id IN (COLUMNPROPERTY(OBJECT_ID(${fv}), N'Role', 'ColumnId'), COLUMNPROPERTY(OBJECT_ID(${fv}), N'MLModelID', 'ColumnId'))) AS ColumnDescriptions,
      (SELECT COUNT(*) FROM ${t('MJ: Entity Fields')} WHERE EntityID = @FVEntity AND Name IN (N'Role', N'MLModelID')) AS EntityFields,
      (SELECT COUNT(*) FROM ${t('MJ: Entity Field Values')} WHERE EntityFieldID = @RoleField) AS RoleFieldValues,
      (SELECT COUNT(*) FROM ${t('MJ: Entity Relationships')} WHERE EntityID = @ModelsEntity AND RelatedEntityID = @FVEntity
         AND RelatedEntityJoinField = N'MLModelID') AS Relationship,
      (SELECT COUNT(*) FROM ${t('MJ: Entities')} WHERE ID = @LatestEntity OR Name = N'MJ: Latest Feature Values') AS LatestValuesEntity`);
  return result.recordset[0];
}

/** One of each object, two of each pair: what the migration's first application leaves. */
const ONE_OF_EACH: ServingObjectCensus = {
  RoleColumn: 1, MLModelIDColumn: 1, RoleDefault: 1, RoleCheck: 1, MLModelForeignKey: 1, MLModelIndex: 1,
  ColumnDescriptions: 2, EntityFields: 2, RoleFieldValues: 2, Relationship: 1, LatestValuesEntity: 1,
};

describe("the migration's idempotent blocks apply a second time", () => {
  it("re-applies the Entity insert and #6180's guarded block with no duplicate object and no error", async () => {
    const entities = server.Provider.EntityByName('MJ: Entities');
    if (!entities) throw new Error('MJ: Entities is not in metadata');
    const schema = entities.SchemaName;
    const batches = idempotentBatches(schema);
    expect(batches.length).toBeGreaterThan(10);
    expect(await censusOf(pool.request(), schema)).toEqual(ONE_OF_EACH);
    // The second application runs inside a transaction that is always rolled back: the dev database keeps its state.
    const tx = new sql.Transaction(pool);
    let aborted = false;
    tx.on('rollback', (wasAborted: boolean) => { aborted = wasAborted; });
    await tx.begin();
    try {
      for (const batch of batches) await new sql.Request(tx).batch(batch);
      expect(await censusOf(new sql.Request(tx), schema)).toEqual(ONE_OF_EACH);
    } finally {
      if (!aborted) await tx.rollback();
    }
    expect(await censusOf(pool.request(), schema)).toEqual(ONE_OF_EACH);
  });
});
