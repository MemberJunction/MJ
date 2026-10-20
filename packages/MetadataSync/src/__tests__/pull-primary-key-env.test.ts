/**
 * PullService over a temp folder with the database read stubbed: a record whose file
 * primaryKey is an `@env:` reference is matched by the variable and keeps the reference.
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
const OTHER_ID = 'B0000000-0000-4000-8000-000000000002';
const VAR = 'MJ_PULL_PK_ENV_TEST';

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
  ],
});

function dbTag(id: string, name: string): BaseEntity {
  const record = new UntypedTag(tagInfo);
  record.Set('ID', id);
  record.Set('Name', name);
  return record;
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

describe('PullService.pull — @env: in primaryKey', () => {
  let root: string;
  let dir: string;
  let service: PullService;
  let messages: string[];
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-pk-env-'));
    dir = path.join(root, 'tags');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), {
      entity: ENTITY,
      filePattern: '.*.json',
      pull: { backupBeforeUpdate: false },
    });
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    const syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(tagInfo);
    service = new PullService(syncEngine, user);
    messages = [];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  async function pull(records: BaseEntity[]) {
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult(records));
    const collect = (m: string) => messages.push(m);
    return service.pull(
      { entity: ENTITY, targetDir: dir, verbose: true },
      { onWarn: collect, onLog: collect, onError: collect, onSuccess: collect, onProgress: collect }
    );
  }

  async function allText(): Promise<string> {
    const names = await fs.readdir(dir);
    const texts = await Promise.all(names.map((n) => fs.readFile(path.join(dir, n), 'utf8')));
    return texts.join('\n');
  }

  it('updates the same file and keeps the @env: key when the variable equals the database key', async () => {
    vi.stubEnv(VAR, ID);
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'Old' }, primaryKey: { ID: `@env:${VAR}` } });

    await pull([dbTag(ID, 'Renamed')]);

    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tag.json']);
    const file: RecordData = await fs.readJson(path.join(dir, '.tag.json'));
    expect(file.fields.Name).toBe('Renamed');
    expect(file.primaryKey).toEqual({ ID: `@env:${VAR}` });
    expect(await allText()).not.toContain(ID);
    expect(messages.some((m) => m.includes(ID))).toBe(false);
  });

  it('matches a lowercase GUID in the variable to the uppercase database key', async () => {
    vi.stubEnv(VAR, ID.toLowerCase());
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'Old' }, primaryKey: { ID: `@env:${VAR}` } });

    await pull([dbTag(ID, 'Renamed')]);

    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tag.json']);
    const file: RecordData = await fs.readJson(path.join(dir, '.tag.json'));
    expect(file.primaryKey).toEqual({ ID: `@env:${VAR}` });
    expect(file.fields.Name).toBe('Renamed');
  });

  it('replaces the matched entry of an array file in place and leaves the others', async () => {
    vi.stubEnv(VAR, ID);
    await fs.writeJson(path.join(dir, '.tags.json'), [
      { fields: { Name: 'Other' }, primaryKey: { ID: OTHER_ID } },
      { fields: { Name: 'Old' }, primaryKey: { ID: `@env:${VAR}` } },
    ]);

    await pull([dbTag(ID, 'Renamed')]);

    const file: RecordData[] = await fs.readJson(path.join(dir, '.tags.json'));
    expect(file).toHaveLength(2);
    expect(file[0]).toEqual({ fields: { Name: 'Other' }, primaryKey: { ID: OTHER_ID } });
    expect(file[1].fields.Name).toBe('Renamed');
    expect(file[1].primaryKey).toEqual({ ID: `@env:${VAR}` });
    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tags.json']);
  });

  it('fails before any write when a key variable is not set, naming the variable only', async () => {
    const original = { fields: { Name: 'Old' }, primaryKey: { ID: `@env:${VAR}` } };
    await fs.writeJson(path.join(dir, '.tag.json'), original);
    const before = await fs.readFile(path.join(dir, '.tag.json'), 'utf8');

    await expect(pull([dbTag(ID, 'Renamed')])).rejects.toThrow(`primaryKey field ID uses @env:${VAR}, which is not set`);

    expect(await fs.readFile(path.join(dir, '.tag.json'), 'utf8')).toBe(before);
    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tag.json']);
    expect(messages.some((m) => m.includes(ID))).toBe(false);
  });

  it('does not say file changes were rolled back when the pull stopped before any write', async () => {
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'Old' }, primaryKey: { ID: `@env:${VAR}` } });

    await expect(pull([dbTag(ID, 'Renamed')])).rejects.toThrow(`@env:${VAR}, which is not set`);

    expect(messages).not.toContain('File changes have been rolled back due to operation failure');
  });

  it('says file changes were rolled back when a backed-up file was restored', async () => {
    await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: ENTITY, filePattern: '.*.json', pull: { backupBeforeUpdate: true } });
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'Old' }, primaryKey: { ID } });
    vi.spyOn(service['fileWriteBatch'], 'flush').mockRejectedValue(new Error('disk full'));

    await expect(pull([dbTag(ID, 'Renamed')])).rejects.toThrow('disk full');

    expect(messages).toContain('File changes have been rolled back due to operation failure');
  });

  it('stops before any write when a record file in the folder cannot be read', async () => {
    vi.stubEnv(VAR, ID);
    const broken = path.join(dir, '.tag.json');
    const brokenText = `{ "fields": { "Name": "Old", }, "primaryKey": { "ID": "@env:${VAR}" } }`;
    await fs.writeFile(broken, brokenText);

    const error = await pull([dbTag(ID, 'Renamed')]).catch((e: Error) => e);

    const shownPath = path.join(await fs.realpath(dir), '.tag.json');
    expect((error as Error).message).toBe(`Cannot read ${shownPath}. Pull does not write new records while a record file in the folder cannot be read.`);
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tag.json']);
    expect(await fs.readFile(broken, 'utf8')).toBe(brokenText);
    expect(messages.some((m) => m.includes(ID))).toBe(false);
  });

  it('leaves the file record unchanged when the variable points at another record', async () => {
    vi.stubEnv(VAR, OTHER_ID);
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'Old' }, primaryKey: { ID: `@env:${VAR}` } });
    const before = await fs.readFile(path.join(dir, '.tag.json'), 'utf8');

    await pull([dbTag(ID, 'Renamed')]);

    expect(await fs.readFile(path.join(dir, '.tag.json'), 'utf8')).toBe(before);
    const created: RecordData = await fs.readJson(path.join(dir, '.b0000000.json'));
    expect(created.primaryKey).toEqual({ ID });
  });

  it('matches a literal lowercase GUID key and writes no second file', async () => {
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'Old' }, primaryKey: { ID: ID.toLowerCase() } });

    await pull([dbTag(ID, 'Renamed')]);

    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tag.json']);
    expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Name).toBe('Renamed');
  });
});
