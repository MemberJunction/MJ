// Runs under vitest.db.config.ts against the PR's private database, never the unit run (D5-B1-1).
//
// PR 5 milestone B1 — effective-dated Feature Value writes, the database half of the attack list. The unit half (the
// decision rules, the lock wait, the guard over hand-built entities, InferProcessor's inputAsOf) is in
// FeaturePipelines/src/__tests__/feature-value-*.test.ts, PS Engine feature-values/__tests__/effective-range-guard.test.ts
// and FeaturePipelinesEngine/src/__tests__/infer-processor-input-as-of.test.ts.
//
// Every case writes through the real FeatureValueCacheService on the bootstrap's SQL Server provider, so the filtered
// unique indexes of migration section B1, the two stored lock Queries and the entity transactions are the database's own.
// The guard (FeatureValueEffectiveRangeGuard) is registered in this process as the Engine entry point registers it. The
// GraphQL and Action writers of attack 5 run against the MJAPI on GRAPHQL_PORT (it must load the Engine with the guard).
//
// Attack 10 (the migration on PR 1 data, F-008) follows PR 4's pre-change-migration pattern (D5-B1-2): inside ONE
// transaction on this file's own connection it removes what section B1 built, seeds the Feature Value shapes a PR 1
// database holds, runs section B1 read from the migration file itself, asserts every property and rolls back.
//
// Every row the file creates carries the file's tag (records, Record Processes, Roles) and is deleted at teardown.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sql from 'mssql';
import { DatabaseProviderBase, RunInEntityTransaction, RunView, type BaseEntity, type IMetadataProvider, type PreSaveHook } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJRecordProcessEntity, MJRoleEntity } from '@memberjunction/core-entities';
import {
  FEATURE_VALUE_LOCK_QUERIES,
  FeatureValueCacheService,
  FeatureValueLockTimeoutError,
  FeatureValueSaveError,
  type FeatureValueOutputItem,
  type RecordFeatureValuesParams,
} from '@memberjunction/feature-pipelines';
import { EscapeSQLString } from '@memberjunction/global';
import { FeatureValueEffectiveRangeGuard, PreSaveHookRegistration } from '@memberjunction/predictive-studio';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { ConsoleCapture } from './fixtures/console-capture';

const TAG = `PSB1-${Date.now()}`;
const BOOTSTRAP_TIMEOUT_MS = 120_000;
/** A case that waits out the 30 s lock deadline once. */
const LOCK_CASE_TIMEOUT_MS = 90_000;
const CASE_TIMEOUT_MS = 60_000;
const FEATURE = 'JobTitleLevel';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');

/** One stored row, as the cases read it back. */
interface StoredRow {
  readonly ID: string;
  readonly Source: string;
  readonly RecordProcessID: string | null;
  readonly RecordID: string;
  readonly FeatureName: string;
  readonly PipelineVersion: number | null;
  readonly ValueText: string | null;
  readonly AIModelID: string | null;
  readonly EffectiveAsOf: Date | null;
  readonly EffectiveTo: Date | null;
  readonly InputAsOf: Date | null;
  readonly SourceUserID: string | null;
  readonly ComputedAt: Date;
}

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;
let rolesEntityID: string;
let rp1: string;
let rp2: string;
let aiModelID: string;
const roleIDs: string[] = [];

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(entityName: string): string {
  const entity = server.Provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** The core schema, read from metadata. */
function coreSchema(): string {
  const entity = server.Provider.EntityByName('MJ: Feature Values');
  if (!entity) throw new Error('MJ: Feature Values is not in metadata');
  return entity.SchemaName;
}

/** Save a new row of `entityName` with `fill` applied; throws with the provider's message when the save fails. */
async function createRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void, provider: IMetadataProvider = server.Provider): Promise<T> {
  const row = await provider.GetEntityObject<T>(entityName, server.User);
  row.NewRecord();
  fill(row);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** A scratch record (an `MJ: Roles` row: it tracks record changes and has `__mj_UpdatedAt`); its ID is the RecordID. */
async function newRecord(label: string): Promise<string> {
  const role = await createRow<MJRoleEntity>('MJ: Roles', (r) => { r.Name = `${TAG} ${label}`; r.Description = 'Predictive Studio B1 scratch (safe to delete)'; });
  roleIDs.push(role.ID);
  return role.ID;
}

/** A disabled scratch Feature Pipeline on `MJ: Roles` (the Feature Values' Record Process). */
async function newRecordProcess(label: string): Promise<string> {
  const rp = await createRow<MJRecordProcessEntity>('MJ: Record Processes', (x) => {
    x.Name = `${TAG} ${label}`;
    x.EntityID = rolesEntityID;
    x.Status = 'Disabled';
    x.WorkType = 'Infer';
    x.ScopeType = 'Filter';
    x.ScopeFilter = '1 = 0';
    x.Configuration = '{}';
  });
  return rp.ID;
}

/** A pipeline write of `recordID` at version 1 of RP1 (pin model `aiModelID`), one output. */
function pipelineWrite(recordID: string, value: FeatureValueOutputItem['value'], inputHash: string, overrides: Partial<RecordFeatureValuesParams> = {}): RecordFeatureValuesParams {
  return {
    recordProcessID: rp1, entityID: rolesEntityID, recordID, outputs: [{ featureName: FEATURE, value }], promptID: null,
    promptVersionHash: 'b1-pvh-1', pipelineVersion: 1, aiModelID, parametersHash: 'b1-ph-1', inputHash, source: 'Pipeline',
    contextUser: server.User, provider: server.Provider, ...overrides,
  };
}

/** Every Champion Feature Value of a record, oldest first. */
async function rowsOf(recordID: string): Promise<StoredRow[]> {
  const r = await pool.request().input('R', sql.NVarChar(450), recordID).query<StoredRow>(`
    SELECT CAST(ID AS NVARCHAR(36)) AS ID, Source, CAST(RecordProcessID AS NVARCHAR(36)) AS RecordProcessID, RecordID, FeatureName,
           PipelineVersion, ValueText, CAST(AIModelID AS NVARCHAR(36)) AS AIModelID, EffectiveAsOf, EffectiveTo, InputAsOf,
           CAST(SourceUserID AS NVARCHAR(36)) AS SourceUserID, ComputedAt
    FROM ${tableOf('MJ: Feature Values')} WHERE RecordID = @R AND Role = N'Champion' ORDER BY ComputedAt, __mj_CreatedAt, ID`);
  return r.recordset;
}

const isOpen = (r: StoredRow): boolean => r.EffectiveTo === null;

/** The rows PR 3's reader selects for a pin (`AsOfFeatureAssembler.featureValueFilter`'s predicate). */
async function readerRows(recordID: string, recordProcessID: string, version: number, modelID: string): Promise<number> {
  const filter = [`[EntityID]='${EscapeSQLString(rolesEntityID)}'`, `[FeatureName]='${FEATURE}'`, `[RecordProcessID]='${EscapeSQLString(recordProcessID)}'`,
    '[EffectiveAsOf] IS NOT NULL', `[PipelineVersion]=${version}`, `[AIModelID]='${EscapeSQLString(modelID)}'`, `[RecordID]='${EscapeSQLString(recordID)}'`].join(' AND ');
  const res = await RunView.FromMetadataProvider(server.Provider).RunView<{ ID: string }>({ EntityName: 'MJ: Feature Values', ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, server.User);
  if (!res.Success) throw new Error(res.ErrorMessage);
  return res.Results.length;
}

/** A GraphQL request to the MJAPI on GRAPHQL_PORT, as the system API key. */
async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<{ data?: T; errors?: { message: string }[] }> {
  const port = process.env.GRAPHQL_PORT || '4000';
  const key = process.env.MJ_API_KEY;
  if (!key) throw new Error('MJ_API_KEY is not set: attack 5\'s GraphQL writers need it');
  const res = await fetch(`http://localhost:${port}/`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mj-api-key': key }, body: JSON.stringify({ query, variables }) });
  return (await res.json()) as { data?: T; errors?: { message: string }[] };
}

/** The B1 migration file and its section B1, split on GO, with the schema placeholder resolved. */
function sectionB1(): string[] {
  const dir = path.join(REPO_ROOT, 'migrations', 'v6');
  const file = readdirSync(dir).find((f) => /^V\d{12}__v6\.\d+\.x__PS_Agent_FP_Input.*\.sql$/.test(f));
  if (!file) throw new Error('migration section B1: no migrations/v6/V*__v6.*.x__PS_Agent_FP_Input*.sql');
  const text = readFileSync(path.join(dir, file), 'utf8');
  const from = text.indexOf('-- section: B1');
  if (from < 0) throw new Error(`${file} has no '-- section: B1'`);
  // the section runs from its heading to the next section heading or the CodeGen block
  const rest = text.slice(from);
  const end = rest.slice(1).search(/\n-- section: |\n\/\*{10,}/);
  const body = end < 0 ? rest : rest.slice(0, end + 1);
  return body.split('${flyway:defaultSchema}').join(coreSchema()).split(/^GO\s*$/m).map((b) => b.trim()).filter((b) => b.replace(/--.*$/gm, '').trim().length > 0);
}

/** A stored lock Query's SQL with literal parameters, as RunQuery renders it (the pipeline-scoped branch). */
function renderedLockSQL(file: string, p: { RecordProcessID: string; EntityID: string; RecordID: string; FeatureNames: string[] }): string {
  const text = readFileSync(path.join(REPO_ROOT, 'metadata', 'queries', 'SQL', file), 'utf8');
  const lit = (v: string): string => `N'${EscapeSQLString(v)}'`;
  return text
    .replace(/\{%\s*if RecordProcessID\s*%\}([\s\S]*?)\{%\s*else\s*%\}[\s\S]*?\{%\s*endif\s*%\}/g, '$1')
    .replace(/\{\{\s*RecordProcessID\s*\|\s*sqlString\s*\}\}/g, lit(p.RecordProcessID))
    .replace(/\{\{\s*EntityID\s*\|\s*sqlString\s*\}\}/g, lit(p.EntityID))
    .replace(/\{\{\s*RecordID\s*\|\s*sqlString\s*\}\}/g, lit(p.RecordID))
    .replace(/\{\{\s*FeatureNames\s*\|\s*sqlIn\s*\}\}/g, `(${p.FeatureNames.map(lit).join(', ')})`);
}

beforeAll(async () => {
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
  FeatureValueEffectiveRangeGuard.Register();
  const roles = server.Provider.EntityByName('MJ: Roles');
  if (!roles) throw new Error('MJ: Roles is not in metadata');
  rolesEntityID = roles.ID;
  const model = (await pool.request().query<{ ID: string }>(`SELECT TOP 1 CAST(ID AS NVARCHAR(36)) AS ID FROM ${tableOf('MJ: AI Models')} ORDER BY ID`)).recordset[0];
  if (!model) throw new Error('no MJ: AI Models row to pin');
  aiModelID = model.ID;
  rp1 = await newRecordProcess('pipeline 1');
  rp2 = await newRecordProcess('pipeline 2');
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  if (pool && server) {
    const rps = [rp1, rp2].filter(Boolean).map((id) => `'${id}'`).join(', ');
    const ids = roleIDs.map((id) => `N'${id}'`).join(', ');
    await pool.request().query(`
      ${ids ? `DELETE FROM ${tableOf('MJ: Feature Values')} WHERE RecordID IN (${ids});` : ''}
      ${rps ? `DELETE FROM ${tableOf('MJ: Feature Values')} WHERE RecordProcessID IN (${rps});
               DELETE FROM ${tableOf('MJ: Record Processes')} WHERE ID IN (${rps});` : ''}
      ${ids ? `DELETE FROM ${tableOf('MJ: Record Changes')} WHERE RecordID IN (${ids}) OR RecordID IN (${roleIDs.map((id) => `N'ID|${id}'`).join(', ')});
               DELETE FROM ${tableOf('MJ: Roles')} WHERE ID IN (${roleIDs.map((id) => `'${id}'`).join(', ')});` : ''}`);
  }
  await pool?.close();
  await server?.ClosePool();
});

describe('B1 attacks 1–4, 7, 9, 11: dated writes on the real indexes', () => {
  it('attack 1: two runs with one record\'s input changed → that record has one closed and one open row; the others 0 new rows', async () => {
    const people = [await newRecord('a1-p1'), await newRecord('a1-p2'), await newRecord('a1-p3')];
    for (const p of people) await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', `in-${p}`));
    for (const p of people) {
      const changed = p === people[1];
      await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, changed ? 'Manager' : 'Director', changed ? `in-${p}-new` : `in-${p}`));
    }
    const changedRows = await rowsOf(people[1]);
    expect(changedRows.map((r) => [r.ValueText, isOpen(r)])).toEqual([['Director', false], ['Manager', true]]);
    expect(changedRows[0].EffectiveTo?.getTime()).toBe(changedRows[1].EffectiveAsOf?.getTime());
    expect((await rowsOf(people[0])).length).toBe(1);
    expect((await rowsOf(people[2])).length).toBe(1);
  }, CASE_TIMEOUT_MS);

  it('attack 2: the same input twice → Unchanged, 0 rows written, EffectiveAsOf unchanged', async () => {
    const p = await newRecord('a2');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    const [before] = await rowsOf(p);
    const again = await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    expect([again.Upserted, again.Unchanged, again.Closed]).toEqual([0, 1, 0]);
    const after = await rowsOf(p);
    expect(after).toHaveLength(1);
    expect(after[0].EffectiveAsOf?.getTime()).toBe(before.EffectiveAsOf?.getTime());
  }, CASE_TIMEOUT_MS);

  it('attack 3: a pipeline run over a record whose open value is Human → the Human row stays open (D-017)', async () => {
    const p = await newRecord('a3');
    await FeatureValueCacheService.Instance.RecordHumanValue({ RecordProcessID: rp1, EntityID: rolesEntityID, RecordID: p, FeatureName: FEATURE, Value: 'VP', ContextUser: server.User, Provider: server.Provider });
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Manager', 'in-2'));
    const human = (await rowsOf(p)).filter((r) => r.Source === 'Human');
    expect(human.map(isOpen)).toEqual([true]);
  }, CASE_TIMEOUT_MS);

  it('attack 4: a run of pipeline version 2 → no version-1 row\'s EffectiveTo changes', async () => {
    const p = await newRecord('a4');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Manager', 'in-2'));
    const v1 = (await rowsOf(p)).map((r) => [r.ID, r.EffectiveTo?.getTime() ?? null]);
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Senior Manager', 'in-3', { pipelineVersion: 2, promptVersionHash: 'b1-pvh-2' }));
    const rows = await rowsOf(p);
    expect(rows.filter((r) => r.PipelineVersion === 1).map((r) => [r.ID, r.EffectiveTo?.getTime() ?? null])).toEqual(v1);
    expect(rows.filter((r) => r.PipelineVersion === 2).map(isOpen)).toEqual([true]);
  }, CASE_TIMEOUT_MS);

  it('attack 7: PR 3\'s reader reads the new pipeline rows (they carry EffectiveAsOf)', async () => {
    const p = await newRecord('a7');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Manager', 'in-2'));
    expect(await readerRows(p, rp1, 1, aiModelID)).toBe(2);
  }, CASE_TIMEOUT_MS);

  it('attack 9: A → B → A on one version → three rows, two closed, the last open, no FeatureValueSaveError', async () => {
    const p = await newRecord('a9-aba');
    for (const [v, h] of [['Director', 'in-A'], ['Manager', 'in-B'], ['Director', 'in-A']]) {
      await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, v, h));
    }
    expect((await rowsOf(p)).map((r) => [r.ValueText, isOpen(r)])).toEqual([['Director', false], ['Manager', false], ['Director', true]]);
  }, CASE_TIMEOUT_MS);

  it('attack 9: the same input re-derived to a new value (cache bypassed) → one closed, one open', async () => {
    const p = await newRecord('a9-rederive');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Manager', 'in-1'));
    expect((await rowsOf(p)).map((r) => [r.ValueText, isOpen(r)])).toEqual([['Director', false], ['Manager', true]]);
  }, CASE_TIMEOUT_MS);

  it('attack 9: two Human edits → two Human rows, the first closed; RetireHumanValue closes, never deletes', async () => {
    const p = await newRecord('a9-human');
    const ref = { RecordProcessID: rp1, EntityID: rolesEntityID, RecordID: p, FeatureName: FEATURE, ContextUser: server.User, Provider: server.Provider };
    await FeatureValueCacheService.Instance.RecordHumanValue({ ...ref, Value: 'VP' });
    await FeatureValueCacheService.Instance.RecordHumanValue({ ...ref, Value: 'SVP' });
    expect((await rowsOf(p)).map((r) => [r.ValueText, isOpen(r)])).toEqual([['VP', false], ['SVP', true]]);
    expect(await FeatureValueCacheService.Instance.RetireHumanValue(ref)).toBe(1);
    expect((await rowsOf(p)).map((r) => [r.ValueText, isOpen(r)])).toEqual([['VP', false], ['SVP', false]]);
  }, CASE_TIMEOUT_MS);

  it('attack 11: two Record Processes on one entity both emitting the feature at version 1 → each keeps its own open row', async () => {
    const p = await newRecord('a11-shared');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Manager', 'in-1', { recordProcessID: rp2 }));
    const rows = await rowsOf(p);
    expect(rows.filter((r) => r.RecordProcessID?.toUpperCase() === rp1.toUpperCase()).map(isOpen)).toEqual([true]);
    expect(rows.filter((r) => r.RecordProcessID?.toUpperCase() === rp2.toUpperCase()).map(isOpen)).toEqual([true]);
  }, CASE_TIMEOUT_MS);

  it('attack 11: a fallback-answered value of the pinned version → stored with the pin\'s AIModelID, closes and opens the same open row, read by PR 3\'s reader with that pin', async () => {
    const p = await newRecord('a11-fallback');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    // the prompt answered by a ranked fallback: InferProcessor still passes the pin's model (aiModelID: params.Pin.AIModelID)
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Manager', 'in-2'));
    const rows = await rowsOf(p);
    expect(rows.map((r) => [r.AIModelID?.toUpperCase(), isOpen(r)])).toEqual([[aiModelID.toUpperCase(), false], [aiModelID.toUpperCase(), true]]);
    expect(await readerRows(p, rp1, 1, aiModelID)).toBe(2);
  }, LOCK_CASE_TIMEOUT_MS);
});

describe('B1 attack 6: a failure between close and open rolls the close back', () => {
  it('the insert refused → nothing closed, the open row stays open, FeatureValueSaveError', async () => {
    const p = await newRecord('a6');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    const mark = Symbol.for(`${TAG}:refuse-insert`);
    const refuse: PreSaveHook = (entity) => (entity.EntityInfo?.Name === 'MJ: Feature Values' && !entity.IsSaved && (entity as MJFeatureValueEntity).ValueText === 'B1-REFUSED' ? 'B1 attack 6: the insert is refused' : true);
    PreSaveHookRegistration.RegisterOnce(mark, refuse);
    try {
      await expect(FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'B1-REFUSED', 'in-2'))).rejects.toBeInstanceOf(FeatureValueSaveError);
    } finally {
      PreSaveHookRegistration.Unregister(mark);
    }
    expect((await rowsOf(p)).map((r) => [r.ValueText, isOpen(r)])).toEqual([['Director', true]]);
  }, LOCK_CASE_TIMEOUT_MS);
});

describe('B1 attack 8 (database half): EffectiveAsOf = the caller\'s inputAsOf', () => {
  it('a value derived from an input last updated at T is effective from T, InputAsOf = T', async () => {
    const p = await newRecord('a8');
    const t = new Date('2026-02-14T10:30:00.000Z');
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1', { inputAsOf: t }));
    const [row] = await rowsOf(p);
    expect([row.EffectiveAsOf?.getTime(), row.InputAsOf?.getTime()]).toEqual([t.getTime(), t.getTime()]);
  }, LOCK_CASE_TIMEOUT_MS);
});

describe('B1 attack 12: concurrent writers (F-011)', () => {
  it('two calls for one record and feature in two transactions at once, different values → one open, one closed, neither raises', async () => {
    const p = await newRecord('a12-diff');
    await Promise.all([
      FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1')),
      FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Manager', 'in-2')),
    ]);
    const rows = await rowsOf(p);
    expect([rows.length, rows.filter(isOpen).length]).toEqual([2, 1]);
  }, CASE_TIMEOUT_MS);

  it('with the same value → one row, the second Unchanged', async () => {
    const p = await newRecord('a12-same');
    const outcomes = await Promise.all([
      FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1')),
      FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1')),
    ]);
    expect(await rowsOf(p)).toHaveLength(1);
    expect(outcomes.map((o) => o.Unchanged).sort()).toEqual([0, 1]);
  }, CASE_TIMEOUT_MS);

  it('a run overlapping a second run of the same pipeline over the same records → ≤ 1 open row per identity', async () => {
    const people = [await newRecord('a12-run-1'), await newRecord('a12-run-2'), await newRecord('a12-run-3')];
    const run = (suffix: string) => Promise.all(people.map((p) => FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, `v-${suffix}`, `in-${suffix}`))));
    await Promise.all([run('a'), run('b')]);
    for (const p of people) expect((await rowsOf(p)).filter(isOpen)).toHaveLength(1);
  }, LOCK_CASE_TIMEOUT_MS);
});

describe('B1 attack 13: write-back is never Human; a Human value is dated at the edit (F-015)', () => {
  it('a person\'s edit → one Human row dated at the record\'s __mj_UpdatedAt, by the editing user', async () => {
    const p = await newRecord('a13-edit');
    const role = await server.Provider.GetEntityObject<MJRoleEntity>('MJ: Roles', server.User);
    if (!(await role.Load(p))) throw new Error('scratch role did not load');
    role.Description = 'edited by a person';
    if (!(await role.Save())) throw new Error(role.LatestResult?.CompleteMessage);
    const stamp = (await pool.request().input('ID', sql.UniqueIdentifier, p).query<{ U: Date }>(`SELECT __mj_UpdatedAt AS U FROM ${tableOf('MJ: Roles')} WHERE ID = @ID`)).recordset[0].U;
    await FeatureValueCacheService.Instance.RecordHumanValue({ RecordProcessID: rp1, EntityID: rolesEntityID, RecordID: p, FeatureName: FEATURE, Value: 'VP', ContextUser: server.User, Provider: server.Provider });
    const human = (await rowsOf(p)).filter((r) => r.Source === 'Human');
    expect(human).toHaveLength(1);
    expect(human[0].EffectiveAsOf?.getTime()).toBe(stamp.getTime());
    expect(human[0].SourceUserID?.toUpperCase()).toBe(server.User.ID.toUpperCase());
  }, CASE_TIMEOUT_MS);

  it('the write-back unit made to fail after RecordPreserved → no Human row and no field change (same transaction)', async () => {
    const p = await newRecord('a13-rollback');
    if (!(server.Provider instanceof DatabaseProviderBase)) throw new Error('attack 13 needs the server database provider');
    const unit = await server.Provider.CreateIndependentInstance();
    try {
      await expect(RunInEntityTransaction(unit, async () => {
        const role = await unit.GetEntityObject<MJRoleEntity>('MJ: Roles', server.User);
        if (!(await role.Load(p))) throw new Error('scratch role did not load');
        role.Description = 'written by the failing unit';
        if (!(await role.Save())) throw new Error(role.LatestResult?.CompleteMessage);
        await FeatureValueCacheService.Instance.RecordHumanValue({ RecordProcessID: rp1, EntityID: rolesEntityID, RecordID: p, FeatureName: FEATURE, Value: 'VP', ContextUser: server.User, Provider: unit });
        throw new Error('B1 attack 13: the unit fails after RecordPreserved');
      })).rejects.toThrow('the unit fails after RecordPreserved');
    } finally {
      await unit.ReleaseIndependentInstance();
    }
    expect((await rowsOf(p)).filter((r) => r.Source === 'Human')).toEqual([]);
    const description = (await pool.request().input('ID', sql.UniqueIdentifier, p).query<{ D: string }>(`SELECT Description AS D FROM ${tableOf('MJ: Roles')} WHERE ID = @ID`)).recordset[0].D;
    expect(description).toBe('Predictive Studio B1 scratch (safe to delete)');
  }, LOCK_CASE_TIMEOUT_MS);
});

describe('B1 attacks 5 and 14: every other writer of the effective range is refused (D5-30)', () => {
  /** A saved Pipeline row written by the service, for the writers to attack. */
  async function servicesRow(label: string): Promise<{ RecordID: string; Row: StoredRow }> {
    const p = await newRecord(label);
    await FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'));
    const [row] = await rowsOf(p);
    return { RecordID: p, Row: row };
  }

  it('a server Save() outside the service: a create of a Pipeline row in the past and an EffectiveTo change are refused', async () => {
    const { RecordID, Row } = await servicesRow('a5-save');
    const forged = await server.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', server.User);
    forged.NewRecord();
    Object.assign(forged, { RecordProcessID: rp1, EntityID: rolesEntityID, RecordID, FeatureName: 'Forged', Source: 'Pipeline', Role: 'Champion', ValueText: 'x', ComputedAt: new Date(), EffectiveAsOf: new Date('2020-01-01T00:00:00Z') });
    expect(await forged.Save()).toBe(false);
    expect(forged.LatestResult?.CompleteMessage).toContain('effective range guard');
    const saved = await server.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', server.User);
    if (!(await saved.Load(Row.ID))) throw new Error('the service\'s row did not load');
    saved.EffectiveTo = new Date();
    expect(await saved.Save()).toBe(false);
    expect((await rowsOf(RecordID)).map(isOpen)).toEqual([true]);
  }, CASE_TIMEOUT_MS);

  it('a GraphQL update of EffectiveTo and a GraphQL create of a Pipeline row with EffectiveAsOf in the past are refused', async () => {
    const { RecordID, Row } = await servicesRow('a5-graphql');
    const update = await graphql<{ UpdateMJFeatureValue: { ID: string } | null }>(
      'mutation U($input: UpdateMJFeatureValueInput!) { UpdateMJFeatureValue(input: $input) { ID } }',
      { input: { ID: Row.ID, EffectiveTo: new Date().toISOString() } });
    expect(update.data?.UpdateMJFeatureValue ?? null).toBeNull();
    expect(JSON.stringify(update.errors || [])).toContain('effective range guard');
    const create = await graphql<{ CreateMJFeatureValue: { ID: string } | null }>(
      'mutation C($input: CreateMJFeatureValueInput!) { CreateMJFeatureValue(input: $input) { ID } }',
      { input: { RecordProcessID: rp1, EntityID: rolesEntityID, RecordID, FeatureName: 'ForgedOverGraphQL', Source: 'Pipeline', Role: 'Champion', ValueText: 'x', ComputedAt: new Date().toISOString(), EffectiveAsOf: '2020-01-01T00:00:00.000Z' } });
    expect(create.data?.CreateMJFeatureValue ?? null).toBeNull();
    expect(JSON.stringify(create.errors || [])).toContain('effective range guard');
    expect((await rowsOf(RecordID)).map((r) => [r.FeatureName, isOpen(r)])).toEqual([[FEATURE, true]]);
  }, CASE_TIMEOUT_MS);

  it('an Update Record Action of EffectiveTo is refused', async () => {
    const { RecordID, Row } = await servicesRow('a5-action');
    const action = (await pool.request().query<{ ID: string }>(`SELECT CAST(ID AS NVARCHAR(36)) AS ID FROM ${tableOf('MJ: Actions')} WHERE Name = N'Update Record'`)).recordset[0];
    if (!action) throw new Error('the Update Record Action is not installed');
    const run = await graphql<{ RunAction: { Success: boolean; Message: string | null } }>(
      'mutation R($input: RunActionInput!) { RunAction(input: $input) { Success Message } }',
      { input: { ActionID: action.ID, SkipActionLog: true, Params: [
        { Name: 'EntityName', Value: 'MJ: Feature Values', Type: 'Input' },
        { Name: 'PrimaryKey', Value: JSON.stringify({ ID: Row.ID }), Type: 'Input' },
        { Name: 'Fields', Value: JSON.stringify({ EffectiveTo: new Date().toISOString() }), Type: 'Input' },
      ] } });
    expect(run.errors ?? []).toEqual([]);
    expect(run.data?.RunAction.Success).toBe(false);
    expect((await rowsOf(RecordID)).map(isOpen)).toEqual([true]);
  }, CASE_TIMEOUT_MS);

  it('attack 14: a range change of another instance issued while the service\'s save is in flight in this server process → refused', async () => {
    const { RecordID, Row } = await servicesRow('a14');
    const other = await newRecord('a14-service');
    const forged = await server.Provider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', server.User);
    if (!(await forged.Load(Row.ID))) throw new Error('the service\'s row did not load');
    forged.EffectiveTo = new Date();
    const [serviceWrite, forgedSave] = await Promise.all([
      FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(other, 'Director', 'in-1')),
      forged.Save(),
    ]);
    expect(serviceWrite.Upserted).toBe(1);
    expect(forgedSave).toBe(false);
    expect((await rowsOf(RecordID)).map(isOpen)).toEqual([true]);
  }, LOCK_CASE_TIMEOUT_MS);
});

describe('B1 attack 15: lock timeout and order (F-021)', () => {
  it('the Pipeline open-row lock held by another transaction past LOCK_WAIT_MS → FeatureValueLockTimeoutError, nothing written', async () => {
    const p = await newRecord('a15-timeout');
    const holder = new sql.Transaction(pool);
    await holder.begin();
    try {
      await new sql.Request(holder).query(renderedLockSQL('predictive-studio-lock-open-pipeline-feature-values.sql', { RecordProcessID: rp1, EntityID: rolesEntityID, RecordID: p, FeatureNames: [FEATURE] }).replace(/NOWAIT/i, 'ROWLOCK'));
      await expect(FeatureValueCacheService.Instance.RecordFeatureValues(pipelineWrite(p, 'Director', 'in-1'))).rejects.toBeInstanceOf(FeatureValueLockTimeoutError);
    } finally {
      await holder.rollback();
    }
    expect(await rowsOf(p)).toEqual([]);
  }, LOCK_CASE_TIMEOUT_MS);

  it('each lock Query\'s plan seeks its filtered index (SET SHOWPLAN_XML)', async () => {
    const params = { RecordProcessID: rp1, EntityID: rolesEntityID, RecordID: 'b1-plan', FeatureNames: [FEATURE, 'Other'] };
    const plans: Record<string, string> = {};
    for (const [file, index] of [['predictive-studio-lock-open-pipeline-feature-values.sql', 'UQ_FeatureValue_OpenPipeline'], ['predictive-studio-lock-open-human-feature-values.sql', 'UQ_FeatureValue_OpenHuman']]) {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await new sql.Request(tx).batch('SET SHOWPLAN_XML ON');
        const r = await new sql.Request(tx).batch<Record<string, string>>(renderedLockSQL(file, params));
        await new sql.Request(tx).batch('SET SHOWPLAN_XML OFF');
        plans[index] = String(Object.values(r.recordset[0])[0]);
      } finally {
        await tx.rollback();
      }
      expect(plans[index]).toContain(`Index="[${index}]"`);
      expect(plans[index]).toMatch(/<IndexScan[^>]*Lookup="false"|<SeekPredicates>/);
    }
  }, CASE_TIMEOUT_MS);

  it('the stored lock Queries are installed under the names the service runs', async () => {
    const r = await pool.request().query<{ Name: string }>(`SELECT Name FROM ${tableOf('MJ: Queries')} WHERE Name IN (N'${FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline}', N'${FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman}') ORDER BY Name`);
    expect(r.recordset.map((x) => x.Name)).toEqual([FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman, FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline]);
  });
});

describe('B1 attack 10: migration section B1 on PR 1 data (F-008, D5-B1-2)', () => {
  /** One seeded row: its identity, value, computation time, key and source. */
  interface SeedRow {
    readonly Key: string;
    readonly RP: 'rp1' | 'rp2';
    readonly Record: string;
    readonly Feature: string;
    readonly Version: number | null;
    readonly Source: 'Pipeline' | 'Human';
    readonly Value: string | null;
    readonly ComputedAt: string;
    readonly EffectiveAsOf: string | null;
    readonly ValueKeyHash: string | null;
    readonly Role?: 'Champion' | 'Challenger';
  }

  it('applies without error over several Pipeline rows per identity; ≤ 1 open row per identity; closed rows end at their successor\'s start; a historyOnly row is never the open one', async () => {
    const recs = { changed: `${TAG}-m-changed`, aba: `${TAG}-m-aba`, hist: `${TAG}-m-hist`, human: `${TAG}-m-human`, shared: `${TAG}-m-shared`, versions: `${TAG}-m-versions` };
    const seed: SeedRow[] = [
      // changed inputs: three keys on one identity, PR 1's "a changed input inserts a new key and keeps the old row"
      { Key: 'c1', RP: 'rp1', Record: recs.changed, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Director', ComputedAt: '2026-01-01T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-c1' },
      { Key: 'c2', RP: 'rp1', Record: recs.changed, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Manager', ComputedAt: '2026-02-01T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-c2' },
      { Key: 'c3', RP: 'rp1', Record: recs.changed, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'VP', ComputedAt: '2026-03-01T00:00:00Z', EffectiveAsOf: '2026-02-20T00:00:00Z', ValueKeyHash: 'k-c3' },
      // A → B → A over three distinct inputs
      { Key: 'a1', RP: 'rp1', Record: recs.aba, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Director', ComputedAt: '2026-01-01T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-a1' },
      { Key: 'a2', RP: 'rp1', Record: recs.aba, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Manager', ComputedAt: '2026-01-02T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-a2' },
      { Key: 'a3', RP: 'rp1', Record: recs.aba, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Director', ComputedAt: '2026-01-03T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-a3' },
      // an all-null historyOnly row computed AFTER the answer it was superseded by: it must not be the open one
      { Key: 'h1', RP: 'rp1', Record: recs.hist, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Director', ComputedAt: '2026-01-01T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-h1' },
      { Key: 'h2', RP: 'rp1', Record: recs.hist, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: null, ComputedAt: '2026-01-05T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-h2' },
      // repeated Human rows written before keys existed (no ValueKeyHash), and a Pipeline value beside them
      { Key: 'u1', RP: 'rp1', Record: recs.human, Feature: FEATURE, Version: null, Source: 'Human', Value: 'VP', ComputedAt: '2026-01-01T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: null },
      { Key: 'u2', RP: 'rp1', Record: recs.human, Feature: FEATURE, Version: null, Source: 'Human', Value: 'SVP', ComputedAt: '2026-01-04T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: null },
      { Key: 'u3', RP: 'rp1', Record: recs.human, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Director', ComputedAt: '2026-01-02T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-u3' },
      // two Record Processes emitting one feature on one record: two identities
      { Key: 's1', RP: 'rp1', Record: recs.shared, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Director', ComputedAt: '2026-01-01T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-s1' },
      { Key: 's2', RP: 'rp2', Record: recs.shared, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Manager', ComputedAt: '2026-01-02T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-s2' },
      // two versions of one pipeline: two identities; plus a Challenger row the close never touches
      { Key: 'v1', RP: 'rp1', Record: recs.versions, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Director', ComputedAt: '2026-01-01T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-v1' },
      { Key: 'v2', RP: 'rp1', Record: recs.versions, Feature: FEATURE, Version: 2, Source: 'Pipeline', Value: 'Manager', ComputedAt: '2026-01-02T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: 'k-v2' },
      { Key: 'v3', RP: 'rp1', Record: recs.versions, Feature: FEATURE, Version: 1, Source: 'Pipeline', Value: 'Shadow', ComputedAt: '2026-01-03T00:00:00Z', EffectiveAsOf: null, ValueKeyHash: null, Role: 'Challenger' },
    ];
    const expectedOpen = new Set(['c3', 'a3', 'h1', 'u2', 'u3', 's1', 's2', 'v1', 'v2', 'v3']);
    const successorStart: Record<string, string> = {
      c1: '2026-02-01T00:00:00Z', c2: '2026-02-20T00:00:00Z', a1: '2026-01-02T00:00:00Z', a2: '2026-01-03T00:00:00Z',
      // the historyOnly row sorts before the answer, so it is closed at the answer's start
      h2: '2026-01-01T00:00:00Z', u1: '2026-01-04T00:00:00Z',
    };
    const schema = coreSchema();
    const fv = `[${schema}].[FeatureValue]`;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const run = (text: string) => new sql.Request(tx).batch(text);
    try {
      // 1. back to the state before section B1: its indexes, FK, CodeGen's FK index and columns gone, the old key index back
      const fkIndex = (await new sql.Request(tx).query<{ name: string }>(`SELECT i.name FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id WHERE i.object_id = OBJECT_ID(N'${schema}.FeatureValue') AND c.name IN (N'EffectiveTo', N'SourceUserID')
        UNION SELECT i.name FROM sys.indexes i WHERE i.object_id = OBJECT_ID(N'${schema}.FeatureValue') AND i.filter_definition LIKE N'%EffectiveTo%'`)).recordset.map((r) => r.name);
      for (const name of [...new Set(fkIndex)]) await run(`DROP INDEX [${name}] ON ${fv}`);
      const fks = (await new sql.Request(tx).query<{ name: string }>(`SELECT fk.name FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id WHERE fk.parent_object_id = OBJECT_ID(N'${schema}.FeatureValue') AND c.name = N'SourceUserID'`)).recordset.map((r) => r.name);
      for (const name of fks) await run(`ALTER TABLE ${fv} DROP CONSTRAINT [${name}]`);
      // a PR 1 database holds no closed history (B1's writer made it, e.g. this file's earlier cases): it would repeat keys
      // under the old, unfiltered key index
      await run(`DELETE FROM ${fv} WHERE [EffectiveTo] IS NOT NULL`);
      await run(`ALTER TABLE ${fv} DROP COLUMN [EffectiveTo], [SourceUserID]`);
      await run(`CREATE UNIQUE NONCLUSTERED INDEX [UQ_FeatureValue_ValueKey] ON ${fv} ([RecordProcessID], [ValueKeyHash]) WHERE [ValueKeyHash] IS NOT NULL`);
      // 2. the PR 1 states (direct DML: the shapes PR 1's writer left, which no current writer produces)
      const ids: Record<string, string> = {};
      for (const s of seed) {
        const r = await new sql.Request(tx)
          .input('RP', sql.UniqueIdentifier, s.RP === 'rp1' ? rp1 : rp2).input('E', sql.UniqueIdentifier, rolesEntityID).input('R', sql.NVarChar(450), s.Record)
          .input('F', sql.NVarChar(255), s.Feature).input('V', sql.Int, s.Version).input('S', sql.NVarChar(20), s.Source).input('T', sql.NVarChar(sql.MAX), s.Value)
          .input('C', sql.DateTimeOffset, new Date(s.ComputedAt)).input('A', sql.DateTimeOffset, s.EffectiveAsOf ? new Date(s.EffectiveAsOf) : null)
          .input('K', sql.NVarChar(64), s.ValueKeyHash).input('Role', sql.NVarChar(20), s.Role || 'Champion')
          .query<{ ID: string }>(`INSERT INTO ${fv} (RecordProcessID, EntityID, RecordID, FeatureName, PipelineVersion, Source, Role, ValueText, ComputedAt, EffectiveAsOf, ValueKeyHash)
            OUTPUT CAST(inserted.ID AS NVARCHAR(36)) AS ID VALUES (@RP, @E, @R, @F, @V, @S, @Role, @T, @C, @A, @K)`);
        ids[s.Key] = r.recordset[0].ID;
      }
      // 3. section B1, read from the migration file
      for (const batch of sectionB1()) await run(batch);
      // 4. the properties
      const after = (await new sql.Request(tx).query<{ ID: string; EffectiveTo: Date | null }>(`SELECT CAST(ID AS NVARCHAR(36)) AS ID, EffectiveTo FROM ${fv} WHERE RecordID IN (${Object.values(recs).map((r) => `N'${r}'`).join(', ')})`)).recordset;
      const byID = new Map(after.map((r) => [r.ID.toUpperCase(), r.EffectiveTo]));
      for (const s of seed) {
        const end = byID.get(ids[s.Key].toUpperCase());
        if (expectedOpen.has(s.Key)) expect([s.Key, end ?? null]).toEqual([s.Key, null]);
        else expect([s.Key, end?.toISOString()]).toEqual([s.Key, new Date(successorStart[s.Key]).toISOString()]);
      }
      const doubleOpen = (await new sql.Request(tx).query<{ n: number }>(`SELECT COUNT(*) AS n FROM (
          SELECT 1 AS x FROM ${fv} WHERE EffectiveTo IS NULL AND Source = N'Pipeline' AND Role = N'Champion' GROUP BY RecordProcessID, EntityID, RecordID, FeatureName, PipelineVersion HAVING COUNT(*) > 1
          UNION ALL
          SELECT 1 FROM ${fv} WHERE EffectiveTo IS NULL AND Source = N'Human' AND Role = N'Champion' GROUP BY RecordProcessID, MLModelScoringBindingID, EntityID, RecordID, FeatureName HAVING COUNT(*) > 1) d`)).recordset[0].n;
      expect(doubleOpen).toBe(0);
      const modelClosed = (await new sql.Request(tx).query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${fv} WHERE Source = N'Model' AND EffectiveTo IS NOT NULL`)).recordset[0].n;
      expect(modelClosed).toBe(0);
      const indexes = (await new sql.Request(tx).query<{ name: string; filter_definition: string | null }>(`SELECT name, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID(N'${schema}.FeatureValue')
          AND name IN (N'UQ_FeatureValue_ValueKey', N'UQ_FeatureValue_OpenPipeline', N'UQ_FeatureValue_OpenHuman') ORDER BY name`)).recordset;
      expect(indexes.map((i) => i.name)).toEqual(['UQ_FeatureValue_OpenHuman', 'UQ_FeatureValue_OpenPipeline', 'UQ_FeatureValue_ValueKey']);
      expect(indexes.find((i) => i.name === 'UQ_FeatureValue_ValueKey')?.filter_definition).toContain('[EffectiveTo] IS NULL');
    } catch (e) {
      // a failed statement can abort the transaction: roll back what remains and report the statement's own error
      await tx.rollback().catch(() => undefined);
      throw e;
    }
    await tx.rollback();
  }, LOCK_CASE_TIMEOUT_MS);
});
