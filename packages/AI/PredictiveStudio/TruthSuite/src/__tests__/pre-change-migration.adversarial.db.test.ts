// Runs under vitest.db.config.ts against the PR's private database (or the M7 scratch database), never the unit run.
//
// Task M7.1 (the serving migration's data section for models registered before the lifecycle gate, and
// UX_MLModel_OnePublishedPerPipeline) and Task M7.8 (the adversarial harness of the coverage table's cells the unit tests
// leave uncovered).
//
// The data section is read from the migration file itself — section 13 of `V*__v6.3.x__PS_Honest_Serving_Schema.sql`,
// through the GO after `UX_MLModel_OnePublishedPerPipeline` — with `${flyway:defaultSchema}` replaced by the schema the
// metadata names, so the statements under test are the migration's, never a copy.
//
// M7.1's cases seed the assessment's pre-change states as rows saved through the generated entities (then the status
// and run columns no entity save may set, by SQL as a pre-change database holds them), and run the data section inside
// ONE transaction on this file's own connection: drop the index the migration already created, run the section, read
// the rows back and roll everything back. The database is left as it was, so the cases run on any migrated database.
//
// M7.8's cases need the migrated state committed (the registry job's step reads it through the provider): they seed the
// states, run the data section in a committed transaction, then run the Registry Check job's step (g) in-process as a
// run of the shipped Registry Check job (`PreGateModelMigration.RunRegistryStep` with a `MJ: Scheduled Job Runs` row of
// that job, the body the job's run-now path executes; the job driver itself is Task M6.4's), training on the suite
// sidecar over the truth suite's W1-signal s42 world. The section touches only rows with no Delivery, which are the
// file's own; teardown deletes what the file created and requires the starting census.
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sql from 'mssql';
import { RunView, type BaseEntity, type EntityInfo } from '@memberjunction/core';
import type {
  MJFeatureValueEntity,
  MJMLAlgorithmEntity,
  MJMLEvaluationProtocolEntity,
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJRecordProcessEntity,
  MJScheduledJobEntity,
  MJScheduledJobRunEntity,
  MJScheduledJobTypeEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { EvaluationProtocol, JsonParse, type Actor } from '@memberjunction/predictive-studio-core';
import {
  EvaluationProtocolVersioning,
  MetadataEntityFactory,
  PipelineAutoTrainer,
  PreGateMigrationContexts,
  PreGateModelMigration,
  PredictiveStudioScoringStartup,
  ScoringService,
  type PreChangeStepDetails,
} from '@memberjunction/predictive-studio';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { DatasetLoader } from '../db/dataset-loader';
import { HarnessCleanup, RunRecords } from '../harness/cleanup';
import { HarnessPipelines, type AlgorithmRow } from '../harness/pipelines';
import { HarnessSidecar } from '../harness/sidecar';
import { W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '../harness/w-world';
import type { LoadedDataset } from '../harness/types';
import { ConsoleCapture } from './fixtures/console-capture';

/** One stored model row as a case reads it back. */
interface ModelRow {
  readonly ID: string;
  readonly Status: string;
  readonly StatusReason: string | null;
  readonly ArtifactStatus: string;
  readonly ServingWhileUnevaluated: boolean;
  readonly TrainingRunID: string | null;
}

/** The M7.1 fixtures: one row per assessment state, by name. */
interface LegacyWorld {
  readonly AlgorithmID: string;
  readonly PipelineIDs: string[];
  readonly LegacyPublished: string;
  readonly LegacyValidated: string;
  readonly LegacyDraft: string;
  readonly Archived: string;
  readonly ArtifactLess: string;
  readonly OlderPublished: string;
  readonly NewerPublished: string;
  readonly Pr3Published: string;
  readonly Pr3PublishedRun: string;
  readonly Pr3Validated: string;
  readonly Pr3ValidatedRun: string;
  readonly Pr3NoSignal: string;
  readonly LegacyBesidePr3: string;
  readonly Pr3Older: string;
  readonly Pr3Newer: string;
  readonly GatePublished: string;
  readonly OtherOfGatePipeline: string;
}

const TAG = `PSPreChange-${Date.now()}`;
const BOOTSTRAP_TIMEOUT_MS = 180_000;
const CASE_TIMEOUT_MS = 600_000;
/** The data section's first line and the statement it ends with. */
const SECTION_HEADER = '-- 13. MLModel: models trained before the lifecycle gate';
const SECTION_LAST = 'CREATE UNIQUE NONCLUSTERED INDEX [UX_MLModel_OnePublishedPerPipeline]';
const MIGRATIONS_V6 = new URL('../../../../../../migrations/v6/', import.meta.url);
/** A stored gate record's decision, as PR 3's trainer left it on the run (`ValidationResults.gate.decision.outcome`). */
const GATE_RECORD = (outcome: 'model' | 'no-signal'): string => JSON.stringify({ schema: 'ps-training-run/v2', status: 'completed', gate: { decision: { outcome } } });

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let batches: string[];

// ================================================================================================ helpers ==

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(entityName: string): string {
  const entity: EntityInfo | undefined = server.Provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/**
 * The data section's batches, from the serving migration file (whatever its timestamp), with the metadata's schema in
 * place of `${flyway:defaultSchema}`; split on its `GO` lines.
 */
function dataSectionBatches(): string[] {
  const file = readdirSync(MIGRATIONS_V6).find((f) => /^V\d+__v6\.3\.x__PS_Honest_Serving_Schema\.sql$/.test(f));
  if (!file) throw new Error('the serving migration is not in migrations/v6');
  const text = readFileSync(new URL(file, MIGRATIONS_V6), 'utf8');
  const from = text.indexOf(SECTION_HEADER);
  const last = text.indexOf(SECTION_LAST, from);
  const to = text.indexOf('\nGO', last);
  if (from < 0 || last < 0 || to < 0) throw new Error(`the serving migration has no data section "${SECTION_HEADER}" ending with "${SECTION_LAST}"`);
  const schema = server.Provider.EntityByName('MJ: ML Models')?.SchemaName;
  if (!schema) throw new Error('MJ: ML Models is not in metadata');
  return text.slice(from, to).split('${flyway:defaultSchema}').join(schema).split(/^GO\s*$/m).map((b) => b.trim()).filter((b) => b.length > 0);
}

/** The statement that drops the index the migration created, so the section creates it again. */
function dropIndexStatement(): string {
  return `DROP INDEX IF EXISTS [UX_MLModel_OnePublishedPerPipeline] ON ${tableOf('MJ: ML Models')}`;
}

/** Runs the data section on `request` (a transaction's), after dropping the index it creates. */
async function runDataSection(request: () => sql.Request): Promise<void> {
  await request().batch(dropIndexStatement());
  for (const b of batches) await request().batch(b);
}

/** Saves a new row of `entityName` with `fill` applied; throws with the provider's message when the save fails. */
async function createRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void): Promise<T> {
  const row = await server.Provider.GetEntityObject<T>(entityName, server.User);
  row.NewRecord();
  fill(row);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** The model rows by ID, in the order asked, read on `request`. */
async function ModelRows(request: () => sql.Request, ids: readonly string[]): Promise<ModelRow[]> {
  const list = ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  const r = await request().query<ModelRow>(
    `SELECT ID, Status, StatusReason, ArtifactStatus, ServingWhileUnevaluated, TrainingRunID FROM ${tableOf('MJ: ML Models')} WHERE ID IN (${list})`,
  );
  return ids.map((id) => {
    const row = r.recordset.find((m) => UUIDsEqual(m.ID, id));
    if (!row) throw new Error(`no model ${id}`);
    return row;
  });
}

/** Writes a model's `Status` by SQL (a plain string, as a pre-change database or an adversary would). */
async function RawStatusWrite(request: () => sql.Request, modelId: string, status: string): Promise<void> {
  await request().input('ID', sql.UniqueIdentifier, modelId).input('Status', sql.NVarChar(20), status)
    .query(`UPDATE ${tableOf('MJ: ML Models')} SET Status = @Status WHERE ID = @ID`);
}

/**
 * A pre-change model row: saved through the entity (Draft, no artifact: the data section reads no artifact), then its
 * status, creation time and (for a gate-produced row) its Delivery by SQL, as a pre-change database holds them.
 */
async function PreChangeModel(pipelineId: string, algorithmId: string, version: number, status: string, o: { readonly CreatedAt: string; readonly Delivery?: string }): Promise<string> {
  const model = await createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
    m.PipelineID = pipelineId;
    m.AlgorithmID = algorithmId;
    m.Version = version;
    m.FeatureSchema = '[]';
    m.TargetVariable = 'Probe';
    m.ProblemType = 'classification';
  });
  await pool.request()
    .input('ID', sql.UniqueIdentifier, model.ID).input('Status', sql.NVarChar(20), status).input('CreatedAt', sql.DateTimeOffset, new Date(o.CreatedAt))
    .input('Delivery', sql.NVarChar(sql.MAX), o.Delivery || null)
    .query(`UPDATE ${tableOf('MJ: ML Models')} SET Status = @Status, __mj_CreatedAt = @CreatedAt, Delivery = @Delivery,
              ArtifactStatus = N'unverified', ServingWhileUnevaluated = 0, StatusReason = NULL, TrainingRunID = NULL WHERE ID = @ID`);
  return model.ID;
}

/** A training run of the pipeline whose stored results name `modelId` as its model and hold a gate record. */
async function GateRecordRun(pipelineId: string, algorithmId: string, modelId: string, outcome: 'model' | 'no-signal'): Promise<string> {
  const run = await createRow<MJMLTrainingRunEntity>('MJ: ML Training Runs', (r) => {
    r.PipelineID = pipelineId;
    r.AlgorithmID = algorithmId;
  });
  await pool.request().input('ID', sql.UniqueIdentifier, run.ID).input('ModelID', sql.UniqueIdentifier, modelId).input('Results', sql.NVarChar(sql.MAX), GATE_RECORD(outcome))
    .query(`UPDATE ${tableOf('MJ: ML Training Runs')} SET ResultingModelID = @ModelID, ValidationResults = @Results, Status = N'Completed' WHERE ID = @ID`);
  return run.ID;
}

/** A pipeline of the file, saved through the entity. */
async function NewPipeline(algorithmId: string, label: string): Promise<string> {
  const targetEntityId = server.Provider.EntityByName('MJ: Users')?.ID;
  if (!targetEntityId) throw new Error('MJ: Users is not in metadata');
  const p = await createRow<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', (x) => {
    x.Name = `${TAG} ${label}`;
    x.TargetEntityID = targetEntityId;
    x.TargetVariable = 'Probe';
    x.ProblemType = 'classification';
    x.AlgorithmID = algorithmId;
  });
  return p.ID;
}

/** The assessment's model states, one pipeline per scenario. */
async function createLegacyWorld(): Promise<LegacyWorld> {
  const algorithms = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>(
    { EntityName: 'MJ: ML Algorithms', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, server.User,
  );
  const a = algorithms.Results[0]?.ID;
  if (!algorithms.Success || !a) throw new Error('no MJ: ML Algorithms row: push the metadata');
  const [mixed, twoLegacy, pr3, pr3Validated, pr3NoSignal, twoPr3, gate] = await Promise.all(
    ['mixed', 'two legacy published', 'pr3', 'pr3 validated', 'pr3 no-signal', 'two pr3 published', 'gate'].map((l) => NewPipeline(a, l)),
  );
  const legacyPublished = await PreChangeModel(mixed, a, 1, 'Published', { CreatedAt: '2025-01-01T00:00:00Z' });
  const legacyValidated = await PreChangeModel(mixed, a, 2, 'Validated', { CreatedAt: '2025-01-02T00:00:00Z' });
  const legacyDraft = await PreChangeModel(mixed, a, 3, 'Draft', { CreatedAt: '2025-01-03T00:00:00Z' });
  const archived = await PreChangeModel(mixed, a, 4, 'Archived', { CreatedAt: '2025-01-04T00:00:00Z' });
  const artifactLess = await PreChangeModel(mixed, a, 5, 'Draft', { CreatedAt: '2025-01-05T00:00:00Z' });
  const olderPublished = await PreChangeModel(twoLegacy, a, 1, 'Published', { CreatedAt: '2025-02-01T00:00:00Z' });
  const newerPublished = await PreChangeModel(twoLegacy, a, 2, 'Published', { CreatedAt: '2025-02-02T00:00:00Z' });
  const pr3Published = await PreChangeModel(pr3, a, 1, 'Published', { CreatedAt: '2026-11-09T00:00:00Z' });
  const pr3PublishedRun = await GateRecordRun(pr3, a, pr3Published, 'model');
  const legacyBesidePr3 = await PreChangeModel(pr3, a, 2, 'Published', { CreatedAt: '2025-03-01T00:00:00Z' });
  const pr3ValidatedModel = await PreChangeModel(pr3Validated, a, 1, 'Validated', { CreatedAt: '2026-11-09T00:00:00Z' });
  const pr3ValidatedRun = await GateRecordRun(pr3Validated, a, pr3ValidatedModel, 'model');
  const pr3NoSignalModel = await PreChangeModel(pr3NoSignal, a, 1, 'Published', { CreatedAt: '2026-11-09T00:00:00Z' });
  await GateRecordRun(pr3NoSignal, a, pr3NoSignalModel, 'no-signal');
  const pr3Older = await PreChangeModel(twoPr3, a, 1, 'Published', { CreatedAt: '2026-11-09T00:00:00Z' });
  await GateRecordRun(twoPr3, a, pr3Older, 'model');
  const pr3Newer = await PreChangeModel(twoPr3, a, 2, 'Published', { CreatedAt: '2026-11-10T00:00:00Z' });
  await GateRecordRun(twoPr3, a, pr3Newer, 'model');
  const gatePublished = await PreChangeModel(gate, a, 1, 'Published', { CreatedAt: '2026-11-18T00:00:00Z', Delivery: JSON.stringify({ kind: 'no-signal', gate: { outcome: 'no-signal' }, artifact: null }) });
  const otherOfGatePipeline = await PreChangeModel(gate, a, 2, 'Archived', { CreatedAt: '2026-11-18T01:00:00Z', Delivery: JSON.stringify({ kind: 'no-signal', gate: { outcome: 'no-signal' }, artifact: null }) });
  return {
    AlgorithmID: a, PipelineIDs: [mixed, twoLegacy, pr3, pr3Validated, pr3NoSignal, twoPr3, gate],
    LegacyPublished: legacyPublished, LegacyValidated: legacyValidated, LegacyDraft: legacyDraft, Archived: archived, ArtifactLess: artifactLess,
    OlderPublished: olderPublished, NewerPublished: newerPublished, Pr3Published: pr3Published, Pr3PublishedRun: pr3PublishedRun,
    Pr3Validated: pr3ValidatedModel, Pr3ValidatedRun: pr3ValidatedRun, Pr3NoSignal: pr3NoSignalModel, LegacyBesidePr3: legacyBesidePr3,
    Pr3Older: pr3Older, Pr3Newer: pr3Newer, GatePublished: gatePublished, OtherOfGatePipeline: otherOfGatePipeline,
  };
}

/** Deletes every row of the file's pipelines, children first. */
async function deletePipelines(pipelineIds: readonly string[]): Promise<void> {
  if (pipelineIds.length === 0) return;
  const list = pipelineIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  const models = `SELECT ID FROM ${tableOf('MJ: ML Models')} WHERE PipelineID IN (${list})`;
  await pool.request().query(`
    UPDATE ${tableOf('MJ: ML Training Runs')} SET ResultingModelID = NULL WHERE PipelineID IN (${list});
    DELETE FROM ${tableOf('MJ: ML Model Publish Records')} WHERE ModelID IN (${models})
      OR TrainingRunID IN (SELECT ID FROM ${tableOf('MJ: ML Training Runs')} WHERE PipelineID IN (${list}));
    DELETE FROM ${tableOf('MJ: ML Output Bindings')} WHERE ModelID IN (${models});
    DELETE FROM ${tableOf('MJ: ML Models')} WHERE PipelineID IN (${list});
    DELETE FROM ${tableOf('MJ: ML Training Runs')} WHERE PipelineID IN (${list});
    DELETE FROM ${tableOf('MJ: ML Training Pipelines')} WHERE ID IN (${list});`);
}

beforeAll(async () => {
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
  batches = dataSectionBatches();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  UserCache.Instance.Dispose();
  await pool?.close();
  await server?.ClosePool();
}, CASE_TIMEOUT_MS);

// =========================================================================== M7.1: the data section, rolled back ==

describe('the pre-change data section (in one transaction, rolled back)', () => {
  let legacy: LegacyWorld;
  let tx: sql.Transaction;
  const inTx = (): sql.Request => new sql.Request(tx);

  beforeAll(async () => {
    legacy = await createLegacyWorld();
    tx = new sql.Transaction(pool);
    await tx.begin();
    await runDataSection(inTx);
  }, CASE_TIMEOUT_MS);

  afterAll(async () => {
    if (tx) await tx.rollback();
    if (legacy) await deletePipelines(legacy.PipelineIDs);
  }, CASE_TIMEOUT_MS);

  it('demotes every legacy Draft, Validated and Published row to Unevaluated with the fixed reason', async () => {
    const ids = [legacy.LegacyPublished, legacy.LegacyValidated, legacy.LegacyDraft, legacy.ArtifactLess, legacy.OlderPublished, legacy.NewerPublished, legacy.LegacyBesidePr3];
    const rows = await ModelRows(inTx, ids);
    const reasons = [PreGateModelMigration.NotServingReason, PreGateModelMigration.ServingReason];
    expect(rows.filter((r) => !(r.Status === 'Unevaluated' && reasons.includes(r.StatusReason || '') && r.ArtifactStatus === 'unverified'))).toEqual([]);
  });

  it('keeps the newest legacy Published model of each pipeline serving, flagged, and no second one', async () => {
    const rows = await ModelRows(inTx, [legacy.OlderPublished, legacy.NewerPublished]);
    expect(rows.filter((r) => r.ServingWhileUnevaluated).map((r) => r.ID.toUpperCase())).toEqual([legacy.NewerPublished.toUpperCase()]);
    expect(rows.map((r) => r.StatusReason)).toEqual([PreGateModelMigration.NotServingReason, PreGateModelMigration.ServingReason]);
  });

  it('a legacy Published model beside an evidence-bearing Published one does not serve', async () => {
    expect((await ModelRows(inTx, [legacy.LegacyBesidePr3]))[0]).toMatchObject({ Status: 'Unevaluated', ServingWhileUnevaluated: false });
  });

  it('leaves an evidence-bearing Published model Published with its training run, and returns a Validated one to Draft', async () => {
    const rows = await ModelRows(inTx, [legacy.Pr3Published, legacy.Pr3Validated]);
    expect(rows.map((r) => [r.Status, (r.TrainingRunID || '').toUpperCase(), r.ArtifactStatus]))
      .toEqual([['Published', legacy.Pr3PublishedRun.toUpperCase(), 'unverified'], ['Draft', legacy.Pr3ValidatedRun.toUpperCase(), 'unverified']]);
  });

  it('archives all but the newest evidence-bearing Published model of a pipeline as superseded', async () => {
    const rows = await ModelRows(inTx, [legacy.Pr3Older, legacy.Pr3Newer]);
    expect(rows.map((r) => r.Status)).toEqual(['Archived', 'Published']);
    expect(rows[0].StatusReason).toContain('Superseded');
  });

  it('leaves Archived rows Archived and gate-produced rows untouched', async () => {
    expect((await ModelRows(inTx, [legacy.Archived, legacy.GatePublished])).map((r) => r.Status)).toEqual(['Archived', 'Published']);
  });

  it('refuses a second Published model of one pipeline after the migration', async () => {
    await expect(RawStatusWrite(inTx, legacy.OtherOfGatePipeline, 'Published')).rejects.toThrow('UX_MLModel_OnePublishedPerPipeline');
  });

  it('leaves only evidence-bearing models Published without a Delivery, one serving model per pipeline, and the index (§5.6 step 1 queries)', async () => {
    const m = tableOf('MJ: ML Models');
    const unrun = await inTx().query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${m} WHERE Status = 'Published' AND Delivery IS NULL AND TrainingRunID IS NULL`);
    const twoServing = await inTx().query<{ PipelineID: string }>(`SELECT PipelineID FROM ${m} WHERE ServingWhileUnevaluated = 1 GROUP BY PipelineID HAVING COUNT(*) > 1`);
    const index = await inTx().query<{ name: string }>(`SELECT name FROM sys.indexes WHERE name = 'UX_MLModel_OnePublishedPerPipeline'`);
    expect([unrun.recordset[0].N, twoServing.recordset, index.recordset.length]).toEqual([0, [], 1]);
  });

  it('a stored record that ships nothing still makes its Published model evidence-bearing (the re-verification decides)', async () => {
    expect((await ModelRows(inTx, [legacy.Pr3NoSignal]))[0]).toMatchObject({ Status: 'Published', ArtifactStatus: 'unverified' });
  });
});

// ============================================================ M7.8: the harness, committed, then the registry step ==

/** The W1 pipelines of the harness, each with what the cells need. */
interface HarnessWorld {
  /** A pipeline whose only model is a demoted (non-serving) legacy one. */
  readonly Demoted: { readonly PipelineID: string; readonly ModelID: string };
  readonly ActiveBinding: MJMLModelScoringBindingEntity;
  readonly WithdrawnBinding: MJMLModelScoringBindingEntity;
  /** A non-auto-train Record Process with a column copy, configured with the demoted model, scheduled. */
  readonly ColumnProcessID: string;
  /** A Human Feature Value of the binding's feature, written with no Record Process. */
  readonly HumanValueID: string;
  /** A second pipeline for the concurrency cell. */
  readonly Concurrent: { readonly PipelineID: string; readonly ModelID: string };
}

describe('the M7.8 harness: the data section committed, then the Registry Check step', () => {
  const records = new RunRecords();
  let algorithms: AlgorithmRow[];
  let w1: LoadedDataset;
  let h: HarnessWorld;
  let jobRunId: string;
  let firstRun: PreChangeStepDetails | null;

  /**
   * A W1 pipeline bound to version 2 of its protocol with `autoPublishKeepBaseline` (W1 s42's stored decision keeps the
   * simple baseline, so a re-evaluation can publish), holding one legacy model that was `Validated` before the gate (no
   * Delivery, no run, no artifact): the data section demotes it to `Unevaluated` without serving.
   */
  async function demotedW1Pipeline(label: string): Promise<{ readonly PipelineID: string; readonly ModelID: string }> {
    const p = await HarnessPipelines.CreatePipeline(server.Provider, server.User, algorithms, {
      Name: `PSTruth: ${TAG} ${label}`, Dataset: w1, Target: 'Renewed', ProblemType: 'classification', Features: [...W_WORLD_FEATURES],
      Algorithm: 'logistic_regression', AsOf: { Mode: 'none' }, Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 }, DenyFields: [...W_WORLD_DENY_FIELDS],
    });
    records.RecordPipeline(p.ID);
    records.RecordPipelineBindings(p);
    await bindKeepBaselineProtocol(p);
    const model = await createRow<MJMLModelEntity>('MJ: ML Models', (m) => {
      m.PipelineID = p.ID;
      m.AlgorithmID = algorithms[0].ID;
      m.Version = 1;
      m.FeatureSchema = '[]';
      m.TargetVariable = 'Renewed';
      m.ProblemType = 'classification';
    });
    await RawStatusWrite(() => pool.request(), model.ID, 'Validated');
    return { PipelineID: p.ID, ModelID: model.ID };
  }

  /** Version 2 of the pipeline's protocol with `autoPublishKeepBaseline: true`, bound to it and recorded (as M4b.6's harness does). */
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

  /** A run of the shipped Registry Check job (Task M6.4's metadata), as its run-now path starts one. */
  async function registryJobRun(): Promise<string> {
    const types = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJScheduledJobTypeEntity, 'ID'>>(
      { EntityName: 'MJ: Scheduled Job Types', ExtraFilter: `Name='Predictive Studio Registry Check'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, server.User,
    );
    const typeId = types.Results[0]?.ID;
    if (!typeId) throw new Error('the Predictive Studio Registry Check job type is not in metadata: push the M6.4 metadata');
    const jobs = await RunView.FromMetadataProvider(server.Provider).RunView<Pick<MJScheduledJobEntity, 'ID'>>(
      { EntityName: 'MJ: Scheduled Jobs', ExtraFilter: `JobTypeID='${EscapeSQLString(typeId)}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, server.User,
    );
    const jobId = jobs.Results[0]?.ID;
    if (!jobId) throw new Error('the Predictive Studio Registry Check job is not in metadata: push the M6.4 metadata');
    const run = await createRow<MJScheduledJobRunEntity>('MJ: Scheduled Job Runs', (r) => {
      r.ScheduledJobID = jobId;
      r.StartedAt = new Date();
      r.Status = 'Running';
    });
    return run.ID;
  }

  /** One registry step as the job run; its Details saved on the run, as the job driver records them. */
  async function registryStep(): Promise<PreChangeStepDetails | null> {
    const ctx = PreGateMigrationContexts.ForJobRun({ ContextUser: server.User, Provider: server.Provider }, jobRunId);
    const config = PreGateModelMigration.ConfigFrom({ batchSize: 50, retrainPerRun: 3 });
    const details = await PreGateModelMigration.RunRegistryStep(config, ctx);
    const run = await server.Provider.GetEntityObject<MJScheduledJobRunEntity>('MJ: Scheduled Job Runs', server.User);
    if (!(await run.Load(jobRunId))) throw new Error(`Scheduled Job Run ${jobRunId} is gone`);
    run.Details = JSON.stringify({ [PreGateModelMigration.DetailsKey]: details });
    if (!(await run.Save())) throw new Error(`the Details of Scheduled Job Run ${jobRunId} did not save: ${run.LatestResult?.CompleteMessage}`);
    return details;
  }

  /** A binding of the pipeline on the dataset's entity, saved through the entity. */
  async function binding(pipelineId: string, feature: string, status: MJMLModelScoringBindingEntity['Status']): Promise<MJMLModelScoringBindingEntity> {
    return createRow<MJMLModelScoringBindingEntity>('MJ: ML Model Scoring Bindings', (b) => {
      b.MLTrainingPipelineID = pipelineId;
      b.FeatureName = `${TAG} ${feature}`;
      b.TargetEntityID = w1.Entity.ID;
      b.Status = status;
      b.Mode = 'OnDemand';
    });
  }

  /** The stored model rows of a pipeline. */
  async function modelsOf(pipelineId: string): Promise<ModelRow[]> {
    const r = await pool.request().input('P', sql.UniqueIdentifier, pipelineId)
      .query<ModelRow>(`SELECT ID, Status, StatusReason, ArtifactStatus, ServingWhileUnevaluated, TrainingRunID FROM ${tableOf('MJ: ML Models')} WHERE PipelineID = @P ORDER BY Version`);
    return r.recordset;
  }

  beforeAll(async () => {
    HarnessSidecar.UseSuiteSidecar();
    await PredictiveStudioScoringStartup.Instance.HandleStartup(server.User, server.Provider);
    algorithms = await HarnessPipelines.LoadAlgorithms(server.Provider, server.User);
    w1 = await DatasetLoader.Load({ Provider: server.Provider, User: server.User, Pool: pool }, { Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const demoted = await demotedW1Pipeline('demoted');
    const concurrent = await demotedW1Pipeline('concurrent');
    const active = await binding(demoted.PipelineID, 'active', 'Active');
    const withdrawn = await binding(demoted.PipelineID, 'withdrawn', 'Withdrawn');
    const rp = await createRow<MJRecordProcessEntity>('MJ: Record Processes', (x) => {
      x.Name = `${TAG} column process`;
      x.EntityID = w1.Entity.ID;
      x.Status = 'Active';
      x.WorkType = 'ML Model';
      x.ScopeType = 'Filter';
      x.ScopeFilter = `ID IN (SELECT TOP 5 ID FROM [${w1.Entity.SchemaName}].[${w1.Entity.BaseTable}] ORDER BY ID)`;
      x.Configuration = JSON.stringify({ primaryKeyField: 'ID', modelId: demoted.ModelID });
      x.ScheduleEnabled = true;
      x.CronExpression = '0 3 * * *';
    });
    const human = await createRow<MJFeatureValueEntity>('MJ: Feature Values', (v) => {
      v.EntityID = w1.Entity.ID;
      v.RecordID = 'pre-change-human-1';
      v.FeatureName = active.FeatureName;
      v.Source = 'Human';
      v.RecordProcessID = null;
      v.ValueJSON = JSON.stringify(0.5);
    });
    h = { Demoted: demoted, ActiveBinding: active, WithdrawnBinding: withdrawn, ColumnProcessID: rp.ID, HumanValueID: human.ID, Concurrent: concurrent };
    const tx = new sql.Transaction(pool);
    await tx.begin();
    await runDataSection(() => new sql.Request(tx));
    await tx.commit();
    jobRunId = await registryJobRun();
    firstRun = await registryStep();
  }, CASE_TIMEOUT_MS);

  afterAll(async () => {
    if (h) {
      await pool.request().input('RP', sql.UniqueIdentifier, h.ColumnProcessID).input('FV', sql.UniqueIdentifier, h.HumanValueID)
        .input('B1', sql.UniqueIdentifier, h.ActiveBinding.ID).input('B2', sql.UniqueIdentifier, h.WithdrawnBinding.ID)
        .query(`DELETE FROM ${tableOf('MJ: Feature Values')} WHERE ID = @FV OR MLModelScoringBindingID IN (@B1, @B2);
                DELETE FROM ${tableOf('MJ: ML Model Scoring Bindings')} WHERE ID IN (@B1, @B2);
                DELETE FROM ${tableOf('MJ: Record Processes')} WHERE ID = @RP;`);
    }
    if (jobRunId) await pool.request().input('R', sql.UniqueIdentifier, jobRunId).query(`DELETE FROM ${tableOf('MJ: Scheduled Job Runs')} WHERE ID = @R`);
    const failures = await HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(server.Provider, server.User), records);
    expect(failures).toEqual([]);
  }, CASE_TIMEOUT_MS);

  it('an Unevaluated model is refused model-not-published by every scoring path', async () => {
    const demotedModel = (await modelsOf(h.Concurrent.PipelineID)).find((m) => m.Status === 'Unevaluated');
    if (!demotedModel) throw new Error('the concurrent pipeline has no demoted model');
    const svc = new ScoringService({ ContextUser: server.User, Provider: server.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null });
    const predicted = await svc.Predict({
      ScoringRunID: '', ModelID: demotedModel.ID, Scope: { kind: 'record-ids', entity: w1.Entity.Name, ids: ['1'] }, EntityMapping: null,
      AsOfDate: new Date().toISOString(), Read: { mode: 'complete' }, DryRun: true, RequestedBy: { kind: 'human', userId: server.User.ID },
    });
    expect(predicted.Result).toMatchObject({ Status: 'refused', Reason: { kind: 'model-not-published' } });
  }, CASE_TIMEOUT_MS);

  it('a disabled process writes nothing to its column until re-enabled', async () => {
    expect(firstRun?.Schedules.Disabled.map((id) => id.toUpperCase())).toContain(h.ColumnProcessID.toUpperCase());
    const [rp] = (await pool.request().input('RP', sql.UniqueIdentifier, h.ColumnProcessID)
      .query<{ ScheduleEnabled: boolean; Configuration: string }>(`SELECT ScheduleEnabled, Configuration FROM ${tableOf('MJ: Record Processes')} WHERE ID = @RP`)).recordset;
    const published = (await modelsOf(h.Demoted.PipelineID)).find((m) => m.Status === 'Published');
    const config = JsonParse.ParseJsonText(rp.Configuration, 'Configuration');
    const configured = config.Ok && JsonParse.IsJsonObject(config.Value) ? JsonParse.JsonString(config.Value, 'modelId') : null;
    // Disabled while its pipeline had no Published model; re-enabled and repointed in the run whose re-evaluation published.
    expect(published === undefined ? [rp.ScheduleEnabled, configured] : [rp.ScheduleEnabled, (configured || '').toUpperCase()])
      .toEqual(published === undefined ? [false, h.Demoted.ModelID] : [true, published.ID.toUpperCase()]);
  }, CASE_TIMEOUT_MS);

  it('a binding of a demoted pipeline scores again once the re-evaluation publishes', async () => {
    const published = (await modelsOf(h.Demoted.PipelineID)).find((m) => m.Status === 'Published');
    expect(firstRun?.ReEvaluation.Findings).toContainEqual(expect.objectContaining({ PipelineID: h.Demoted.PipelineID, Kind: 'published' }));
    const svc = new ScoringService({ ContextUser: server.User, Provider: server.Provider, Path: 'score-record-set', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null });
    const r = await svc.Score(h.ActiveBinding, { kind: 'record-ids', entity: w1.Entity.Name, ids: ['1'] }, new Date(), true);
    expect([published === undefined, r.Status, r.ModelID]).toEqual([false, 'completed', published?.ID]);
  }, CASE_TIMEOUT_MS);

  it('a withdrawn binding is not revived by the re-evaluation', async () => {
    const [b] = (await pool.request().input('B', sql.UniqueIdentifier, h.WithdrawnBinding.ID)
      .query<{ Status: string }>(`SELECT Status FROM ${tableOf('MJ: ML Model Scoring Bindings')} WHERE ID = @B`)).recordset;
    expect(b.Status).toBe('Withdrawn');
  }, CASE_TIMEOUT_MS);

  it('a binding\'s Human row without a Record Process survives the demotion', async () => {
    const r = await pool.request().input('FV', sql.UniqueIdentifier, h.HumanValueID)
      .query<{ Source: string; RecordProcessID: string | null }>(`SELECT Source, RecordProcessID FROM ${tableOf('MJ: Feature Values')} WHERE ID = @FV`);
    expect(r.recordset).toEqual([{ Source: 'Human', RecordProcessID: null }]);
  }, CASE_TIMEOUT_MS);

  it('a model whose artifact file names nothing is marked missing (FK_MLModel_ArtifactFile keeps a referenced file row from being deleted)', async () => {
    const rows = await modelsOf(h.Demoted.PipelineID);
    const legacy = rows.find((m) => UUIDsEqual(m.ID, h.Demoted.ModelID));
    expect(legacy?.ArtifactStatus).toBe('missing');
  }, CASE_TIMEOUT_MS);

  it('a re-evaluation and an auto-train run of one pipeline train it once', async () => {
    const runsBefore = (await pool.request().input('P', sql.UniqueIdentifier, h.Concurrent.PipelineID)
      .query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${tableOf('MJ: ML Training Runs')} WHERE PipelineID = @P`)).recordset[0].N;
    // The re-evaluation's training seam and auto-train's training of the same pipeline, started together: the
    // single-flight claim (§5.7 R2) lets one train and refuses the other naming the run in flight.
    const ctx = PreGateMigrationContexts.ForJobRun({ ContextUser: server.User, Provider: server.Provider }, jobRunId);
    const settled = await Promise.allSettled([
      ctx.Seams.Train(h.Concurrent.PipelineID, server.Provider, server.User),
      PipelineAutoTrainer.TrainThroughEngine(h.Concurrent.PipelineID, server.Provider, server.User),
    ]);
    const runsAfter = (await pool.request().input('P', sql.UniqueIdentifier, h.Concurrent.PipelineID)
      .query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${tableOf('MJ: ML Training Runs')} WHERE PipelineID = @P`)).recordset[0].N;
    expect([runsAfter - runsBefore, settled.filter((s) => s.status === 'fulfilled').length]).toEqual([1, 1]);
    const rejected = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    expect(String(rejected?.reason)).toContain('is already being trained by run');
  }, CASE_TIMEOUT_MS);

  it('a second registry run changes nothing the first finished, and §5.6 step 5\'s queries hold', async () => {
    const second = await registryStep();
    const m = tableOf('MJ: ML Models');
    const left = await pool.request().query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${m} WHERE ArtifactStatus = 'unverified' AND Delivery IS NULL`);
    const unrun = await pool.request().query<{ N: number }>(`SELECT COUNT(*) AS N FROM ${m} WHERE Status = 'Published' AND Delivery IS NULL`);
    expect([second === null ? 0 : second.Artifacts.Changed, left.recordset[0].N, unrun.recordset[0].N]).toEqual([0, 0, 0]);
  }, CASE_TIMEOUT_MS);
});
