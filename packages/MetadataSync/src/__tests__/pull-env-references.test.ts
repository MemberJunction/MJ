/**
 * PullService end to end over a temp folder, with the database read stubbed: a field whose
 * file value is an `@env:` reference keeps the reference after a pull.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { BaseEntity, EntityInfo, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { PullService } from '../services/PullService';
import { SyncEngine, RecordData } from '../lib/sync-engine';

const ENTITY = 'EnvTest: Tags';
const ID = 'B0000000-0000-4000-8000-000000000001';
const SECRET = 'super-secret-123';
const VAR = 'MJ_PULL_ENV_TEST';

class UntypedTag extends BaseEntity {}

const tagInfo = new EntityInfo({
  ID: 'bbbbbbbb-0000-4000-8000-000000000000',
  Name: ENTITY,
  BaseTable: 'Tag',
  BaseView: 'vwTags',
  Status: 'Active',
  Fields: [
    { ID: 'f-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'f-name', Name: 'Name', Type: 'nvarchar', AllowsNull: false, Status: 'Active' },
    { ID: 'f-desc', Name: 'Description', Type: 'nvarchar', AllowsNull: true, Status: 'Active' },
  ],
});

const CHILD_ENTITY = 'EnvTest: Tag Items';
const CHILD_ID = 'C0000000-0000-4000-8000-000000000001';

const tagItemInfo = new EntityInfo({
  ID: 'cccccccc-0000-4000-8000-000000000000',
  Name: CHILD_ENTITY,
  BaseTable: 'TagItem',
  BaseView: 'vwTagItems',
  Status: 'Active',
  Fields: [
    { ID: 'fi-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'fi-tag', Name: 'TagID', Type: 'uniqueidentifier', AllowsNull: false, Status: 'Active' },
    { ID: 'fi-secret', Name: 'Secret', Type: 'nvarchar', AllowsNull: true, Status: 'Active' },
  ],
});

function dbTagItem(secret: string | null): BaseEntity {
  const record = new UntypedTag(tagItemInfo);
  record.Set('ID', CHILD_ID);
  record.Set('TagID', ID);
  record.Set('Secret', secret);
  return record;
}

function dbTag(name: string, description: string | null): BaseEntity {
  const record = new UntypedTag(tagInfo);
  record.Set('ID', ID);
  record.Set('Name', name);
  record.Set('Description', description);
  return record;
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

describe('PullService.pull — @env: references', () => {
  const originalCwd = process.cwd();
  let root: string;
  let syncEngine: SyncEngine;
  let service: PullService;
  let warnings: string[];

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-env-'));
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockImplementation((name) => (name === CHILD_ENTITY ? tagItemInfo : tagInfo));
    service = new PullService(syncEngine, user);
    warnings = [];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  async function tagDir(
    description: string,
    pull: Record<string, unknown> = {},
    relatedEntities?: Record<string, RecordData[]>
  ): Promise<string> {
    const dir = path.join(root, 'tags');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), {
      entity: ENTITY,
      filePattern: '.*.json',
      pull: { backupBeforeUpdate: false, ...pull },
    });
    await fs.writeJson(path.join(dir, '.tag.json'), {
      fields: { Name: 'EnvTestTag', Description: description },
      primaryKey: { ID },
      ...(relatedEntities ? { relatedEntities } : {}),
    });
    return dir;
  }

  async function pull(dir: string, record: BaseEntity) {
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult([record]));
    return service.pull({ entity: ENTITY, targetDir: dir }, { onWarn: (m) => warnings.push(m) });
  }

  async function readTag(dir: string): Promise<RecordData> {
    return fs.readJson(path.join(dir, '.tag.json'));
  }

  function driftWarnings(): string[] {
    return warnings.filter((w) => w.includes('does not match'));
  }

  it('keeps the reference, with no warning, when the variable matches the database', async () => {
    vi.stubEnv(VAR, SECRET);
    const dir = await tagDir(`@env:${VAR}`);

    await pull(dir, dbTag('EnvTestTag', SECRET));

    const file = await readTag(dir);
    expect(file.fields.Description).toBe(`@env:${VAR}`);
    expect(JSON.stringify(file)).not.toContain(SECRET);
    expect(driftWarnings()).toEqual([]);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('keeps the reference and warns, without either value, when the database differs', async () => {
    vi.stubEnv(VAR, 'value-in-env');
    const dir = await tagDir(`@env:${VAR}`);

    await pull(dir, dbTag('EnvTestTag', SECRET));

    expect((await readTag(dir)).fields.Description).toBe(`@env:${VAR}`);
    const drift = driftWarnings();
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(`does not match ${VAR}`);
    expect(drift[0]).toContain('Description');
    expect(drift[0]).toContain(ENTITY);
    expect(drift[0]).toContain(ID);
    expect(drift[0]).not.toContain(SECRET);
    expect(drift[0]).not.toContain('value-in-env');
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('keeps the reference, with no warning, when the variable is not set', async () => {
    const dir = await tagDir('@env:MJ_PULL_ENV_TEST_UNSET');

    await pull(dir, dbTag('EnvTestTag', SECRET));

    const file = await readTag(dir);
    expect(file.fields.Description).toBe('@env:MJ_PULL_ENV_TEST_UNSET');
    expect(JSON.stringify(file)).not.toContain(SECRET);
    expect(driftWarnings()).toEqual([]);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('keeps the reference under mergeStrategy overwrite', async () => {
    vi.stubEnv(VAR, SECRET);
    const dir = await tagDir(`@env:${VAR}`, { mergeStrategy: 'overwrite' });

    await pull(dir, dbTag('EnvTestTag', SECRET));

    expect((await readTag(dir)).fields.Description).toBe(`@env:${VAR}`);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('keeps a ?optional suffix as written', async () => {
    const dir = await tagDir(`@env:${VAR}?optional`);

    await pull(dir, dbTag('EnvTestTag', SECRET));

    expect((await readTag(dir)).fields.Description).toBe(`@env:${VAR}?optional`);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('still takes the database value for a field without a reference', async () => {
    vi.stubEnv(VAR, SECRET);
    const dir = await tagDir(`@env:${VAR}`);

    await pull(dir, dbTag('Renamed In DB', SECRET));

    expect((await readTag(dir)).fields.Name).toBe('Renamed In DB');
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('writes a checksum over the reference, the same input push --incremental uses', async () => {
    vi.stubEnv(VAR, SECRET);
    const dir = await tagDir(`@env:${VAR}`);

    await pull(dir, dbTag('EnvTestTag', SECRET));

    const file = await readTag(dir);
    const expected = syncEngine.calculateChecksum(SyncEngine.BuildRecordChecksumPayload(file.fields));
    expect(file.sync?.checksum).toBe(expected);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('keeps the reference and warns under ignoreNullFields with overwrite when the database value is null', async () => {
    vi.stubEnv(VAR, SECRET);
    const dir = await tagDir(`@env:${VAR}`, { ignoreNullFields: true, mergeStrategy: 'overwrite' });

    await pull(dir, dbTag('EnvTestTag', null));

    expect((await readTag(dir)).fields.Description).toBe(`@env:${VAR}`);
    expect(driftWarnings()).toHaveLength(1);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('keeps the reference in a related child record under ignoreNullFields when the database value is null', async () => {
    const existingChild: RecordData = { fields: { TagID: '@parent:ID', Secret: `@env:${VAR}` }, primaryKey: { ID: CHILD_ID } };
    const dir = await tagDir(
      `@env:${VAR}`,
      { ignoreNullFields: true, relatedEntities: { TagItems: { entity: CHILD_ENTITY, foreignKey: 'TagID' } } },
      { TagItems: [existingChild] }
    );
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) =>
      runViewResult(params.EntityName === CHILD_ENTITY ? [dbTagItem(null)] : [dbTag('EnvTestTag', SECRET)])
    );

    await service.pull({ entity: ENTITY, targetDir: dir }, { onWarn: (m) => warnings.push(m) });

    const children = (await readTag(dir)).relatedEntities?.TagItems ?? [];
    expect(children).toHaveLength(1);
    expect(children[0].fields.Secret).toBe(`@env:${VAR}`);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });

  it('keeps the reference and writes no externalized file when the field is in externalizeFields', async () => {
    vi.stubEnv(VAR, SECRET);
    const dir = await tagDir(`@env:${VAR}`, { externalizeFields: ['Description'] });

    await pull(dir, dbTag('EnvTestTag', SECRET));

    expect((await readTag(dir)).fields.Description).toBe(`@env:${VAR}`);
    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tag.json']);
    for (const name of await fs.readdir(dir)) {
      expect(await fs.readFile(path.join(dir, name), 'utf8')).not.toContain(SECRET);
    }
    expect(driftWarnings()).toEqual([]);
    expect(warnings.some((w) => w.includes(SECRET))).toBe(false);
  });
});
