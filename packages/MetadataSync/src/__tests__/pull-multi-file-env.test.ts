/**
 * PullService `--multi-file` over a temp folder with the database read stubbed: existing
 * records in the target file are matched by key, so their `@env:` references are kept.
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
const ID_2 = 'B0000000-0000-4000-8000-000000000002';
const ID_3 = 'B0000000-0000-4000-8000-000000000003';
const SECRET = 'super-secret-123';
const VAR = 'MJ_PULL_MULTI_ENV_TEST';
const SINCE = '2026-01-01T00:00:00Z';

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

function dbTag(id: string, name: string, description: string | null): BaseEntity {
  const record = new UntypedTag(tagInfo);
  record.Set('ID', id);
  record.Set('Name', name);
  record.Set('Description', description);
  return record;
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

describe('PullService.pull --multi-file — @env: references', () => {
  let root: string;
  let dir: string;
  let file: string;
  let syncEngine: SyncEngine;
  let service: PullService;
  let warnings: string[];
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-multi-env-'));
    dir = path.join(root, 'tags');
    file = path.join(dir, 'all-tags.json');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: ENTITY, pull: { backupBeforeUpdate: false } });
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(tagInfo);
    service = new PullService(syncEngine, user);
    warnings = [];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  async function pull(records: BaseEntity[], since?: string, softDeleted: Record<string, unknown>[] = []) {
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) =>
      params.ResultType === 'simple'
        ? ({ ...runViewResult([]), Results: softDeleted } as unknown as RunViewResult<BaseEntity>)
        : runViewResult(records)
    );
    return service.pull(
      { entity: ENTITY, targetDir: dir, multiFile: 'all-tags', ...(since ? { since } : {}) },
      { onWarn: (m) => warnings.push(m) }
    );
  }

  function existing(description: string, id = ID, name = 'EnvTestTag'): RecordData {
    return { fields: { Name: name, Description: description }, primaryKey: { ID: id } };
  }

  async function readAll(): Promise<RecordData[]> {
    return fs.readJson(file);
  }

  it('keeps the reference, with no warning, when the variable matches', async () => {
    vi.stubEnv(VAR, SECRET);
    await fs.writeJson(file, [existing(`@env:${VAR}`)]);

    await pull([dbTag(ID, 'EnvTestTag', SECRET)]);

    const records = await readAll();
    expect(records[0].fields.Description).toBe(`@env:${VAR}`);
    expect(await fs.readFile(file, 'utf8')).not.toContain(SECRET);
    expect(warnings.filter((w) => w.includes('does not match'))).toEqual([]);
  });

  it('keeps the reference and warns, without values, when the database differs', async () => {
    vi.stubEnv(VAR, 'value-in-env');
    await fs.writeJson(file, [existing(`@env:${VAR}`)]);

    await pull([dbTag(ID, 'EnvTestTag', SECRET)]);

    expect((await readAll())[0].fields.Description).toBe(`@env:${VAR}`);
    const drift = warnings.filter((w) => w.includes('does not match'));
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(VAR);
    expect(drift[0]).not.toContain(SECRET);
    expect(drift[0]).not.toContain('value-in-env');
  });

  it('keeps the reference when the variable is not set', async () => {
    await fs.writeJson(file, [existing(`@env:${VAR}`)]);

    await pull([dbTag(ID, 'EnvTestTag', SECRET)]);

    expect((await readAll())[0].fields.Description).toBe(`@env:${VAR}`);
    expect(await fs.readFile(file, 'utf8')).not.toContain(SECRET);
  });

  it('writes a checksum over the reference', async () => {
    vi.stubEnv(VAR, SECRET);
    await fs.writeJson(file, [existing(`@env:${VAR}`)]);

    await pull([dbTag(ID, 'EnvTestTag', SECRET)]);

    const record = (await readAll())[0];
    expect(record.sync?.checksum).toBe(syncEngine.calculateChecksum(SyncEngine.BuildRecordChecksumPayload(record.fields)));
  });

  it('matches an existing file that holds one object', async () => {
    vi.stubEnv(VAR, SECRET);
    await fs.writeJson(file, existing(`@env:${VAR}`));

    await pull([dbTag(ID, 'EnvTestTag', SECRET)]);

    expect((await readAll())[0].fields.Description).toBe(`@env:${VAR}`);
  });

  it('replaces the file with the query result on a full pull', async () => {
    vi.stubEnv(VAR, SECRET);
    await fs.writeJson(file, [existing(`@env:${VAR}`), existing('plain', ID_2, 'Second')]);

    await pull([dbTag(ID, 'EnvTestTag', SECRET), dbTag(ID_3, 'Third', 'new')]);

    const records = await readAll();
    expect(records.map((r) => r.primaryKey?.ID)).toEqual([ID, ID_3]);
    expect(records[0].fields.Description).toBe(`@env:${VAR}`);
    expect(records[1].fields.Description).toBe('new');
  });

  it('upserts on a --since pull: replaces matched entries in place, keeps the others, appends new ones', async () => {
    vi.stubEnv(VAR, SECRET);
    await fs.writeJson(file, [existing('plain', ID_2, 'Second'), existing(`@env:${VAR}`)]);

    await pull([dbTag(ID, 'Renamed', SECRET), dbTag(ID_3, 'Third', 'new')], SINCE);

    const records = await readAll();
    expect(records.map((r) => r.primaryKey?.ID)).toEqual([ID_2, ID, ID_3]);
    expect(records[0]).toEqual(existing('plain', ID_2, 'Second'));
    expect(records[1].fields.Name).toBe('Renamed');
    expect(records[1].fields.Description).toBe(`@env:${VAR}`);
    expect(records[2].fields.Description).toBe('new');
    expect(await fs.readFile(file, 'utf8')).not.toContain(SECRET);
  });

  it('keeps an @env: primaryKey', async () => {
    vi.stubEnv(VAR, ID);
    await fs.writeJson(file, [{ fields: { Name: 'EnvTestTag', Description: 'x' }, primaryKey: { ID: `@env:${VAR}` } }]);

    await pull([dbTag(ID, 'EnvTestTag', 'x')]);

    expect((await readAll())[0].primaryKey).toEqual({ ID: `@env:${VAR}` });
  });

  it('fails before any write when a primaryKey variable is not set', async () => {
    await fs.writeJson(file, [{ fields: { Name: 'EnvTestTag' }, primaryKey: { ID: `@env:${VAR}` } }]);
    const before = await fs.readFile(file, 'utf8');

    await expect(pull([dbTag(ID, 'EnvTestTag', 'x')])).rejects.toThrow(`uses @env:${VAR}, which is not set`);

    expect(await fs.readFile(file, 'utf8')).toBe(before);
  });

  it('fails and leaves the file alone when it is not valid JSON, and keeps the cause', async () => {
    await fs.writeFile(file, '{ not json');

    const error = await pull([dbTag(ID, 'EnvTestTag', 'x')]).catch((e: Error) => e);

    expect((error as Error).message).toContain('Pull does not overwrite a file it cannot read');
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(await fs.readFile(file, 'utf8')).toBe('{ not json');
  });

  it('reads an empty or whitespace-only file as no records', async () => {
    await fs.writeFile(file, '  \n');

    await pull([dbTag(ID, 'EnvTestTag', 'from-db')]);

    expect((await readAll()).map((r) => r.primaryKey?.ID)).toEqual([ID]);
  });

  it('removes the entries of rows soft-deleted since the timestamp, and never the file itself', async () => {
    await fs.writeJson(file, [existing('plain', ID_2, 'Second'), existing('kept')]);

    await pull([dbTag(ID, 'Renamed', 'kept')], SINCE, [{ ID: ID_2.toLowerCase(), Name: 'all-tags' }]);

    const records = await readAll();
    expect(records.map((r) => r.primaryKey?.ID)).toEqual([ID]);
    expect(records[0].fields.Name).toBe('Renamed');
  });

  it('removes soft-deleted entries when no row was updated', async () => {
    await fs.writeJson(file, [existing('plain', ID_2, 'Second'), existing('kept')]);

    await pull([], SINCE, [{ ID: ID_2, Name: 'Second' }]);

    expect((await readAll()).map((r) => r.primaryKey?.ID)).toEqual([ID]);
  });

  it('writes a new file with database values when there is no file', async () => {
    await pull([dbTag(ID, 'EnvTestTag', 'from-db')]);

    expect((await readAll())[0].fields.Description).toBe('from-db');
  });

  describe('a record whose file is another record file of the folder', () => {
    const otherFile = () => path.join(dir, '.a.json');
    const allFile = () => path.join(dir, '.all.json');

    beforeEach(async () => {
      await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: ENTITY, filePattern: '.*.json', pull: { backupBeforeUpdate: false } });
      await fs.writeJson(otherFile(), existing(`@env:${VAR}`));
    });

    async function pullAll(records: BaseEntity[], since?: string): Promise<string[]> {
      const output: string[] = [];
      const collect = (m: string) => output.push(m);
      vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) =>
        params.ResultType === 'simple' ? ({ ...runViewResult([]), Results: [] } as unknown as RunViewResult<BaseEntity>) : runViewResult(records)
      );
      await service.pull(
        { entity: ENTITY, targetDir: dir, multiFile: '.all', verbose: true, ...(since ? { since } : {}) },
        { onWarn: collect, onLog: collect, onProgress: collect, onSuccess: collect }
      );
      return output;
    }

    async function filesText(): Promise<string> {
      const names = await fs.readdir(dir);
      const texts = await Promise.all(names.map((name) => fs.readFile(path.join(dir, name), 'utf8')));
      return texts.join('\n');
    }

    it('keeps the @env: reference in the multi-file, and the value is in no file and no output', async () => {
      vi.stubEnv(VAR, SECRET);

      const output = await pullAll([dbTag(ID, 'EnvTestTag', SECRET), dbTag(ID_2, 'Second', 'plain')]);

      const records: RecordData[] = await fs.readJson(allFile());
      expect(records.map((r) => r.primaryKey?.ID)).toEqual([ID, ID_2]);
      expect(records[0].fields.Description).toBe(`@env:${VAR}`);
      expect(await filesText()).not.toContain(SECRET);
      expect(output.join('\n')).not.toContain(SECRET);
    });

    it('keeps the reference with --since, and adds the record to the multi-file', async () => {
      vi.stubEnv(VAR, SECRET);
      await fs.writeJson(allFile(), [existing('plain', ID_2, 'Second')]);

      const output = await pullAll([dbTag(ID, 'EnvTestTag', SECRET)], SINCE);

      const records: RecordData[] = await fs.readJson(allFile());
      expect(records.map((r) => r.primaryKey?.ID)).toEqual([ID_2, ID]);
      expect(records[1].fields.Description).toBe(`@env:${VAR}`);
      expect(await filesText()).not.toContain(SECRET);
      expect(output.join('\n')).not.toContain(SECRET);
    });

    it('fails before any write when another record file cannot be read', async () => {
      await fs.writeFile(otherFile(), '{ not json');

      await expect(pullAll([dbTag(ID, 'EnvTestTag', 'x')])).rejects.toThrow('Pull does not write new records while a record file in the folder cannot be read');

      expect(await fs.pathExists(allFile())).toBe(false);
    });

    it('fails before any write when a key variable in another record file is not set', async () => {
      await fs.writeJson(otherFile(), { fields: { Name: 'EnvTestTag' }, primaryKey: { ID: `@env:${VAR}` } });

      await expect(pullAll([dbTag(ID, 'EnvTestTag', 'x')])).rejects.toThrow(`uses @env:${VAR}, which is not set`);

      expect(await fs.pathExists(allFile())).toBe(false);
    });
  });
});
