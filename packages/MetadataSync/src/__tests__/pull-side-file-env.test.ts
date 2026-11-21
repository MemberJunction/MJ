/**
 * PullService over a temp folder with the database read stubbed: a field that points at a
 * `.json` side file with `@file:` keeps the reference, and the side file keeps its `@env:` leaves.
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
const VAR = 'MJ_PULL_SIDE_FILE_ENV_TEST';
const VAR_B = 'MJ_PULL_SIDE_FILE_ENV_TEST_B';
const SECRET_B = 'other-secret-456';

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
    { ID: 'f-conf', Name: 'Configuration', Type: 'nvarchar', AllowsNull: true, Status: 'Active' },
  ],
});

function dbTag(configuration: string | null): BaseEntity {
  const record = new UntypedTag(tagInfo);
  record.Set('ID', ID);
  record.Set('Name', 'EnvTestTag');
  record.Set('Configuration', configuration);
  return record;
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

describe('PullService.pull — @env: in a @file: JSON side file', () => {
  let root: string;
  let dir: string;
  let service: PullService;
  let warnings: string[];
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-side-env-'));
    dir = path.join(root, 'tags');
    await fs.ensureDir(dir);
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    const syncEngine = new SyncEngine(user);
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

  async function setup(sideFile: string, pull: Record<string, unknown> = {}) {
    await fs.writeJson(path.join(dir, '.mj-sync.json'), {
      entity: ENTITY,
      filePattern: '.*.json',
      pull: { backupBeforeUpdate: false, ...pull },
    });
    await fs.writeFile(path.join(dir, 'config.json'), sideFile);
    await fs.writeJson(path.join(dir, '.tag.json'), {
      fields: { Name: 'EnvTestTag', Configuration: '@file:config.json' },
      primaryKey: { ID },
    });
  }

  async function pull(record: BaseEntity) {
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult([record]));
    return service.pull({ entity: ENTITY, targetDir: dir }, { onWarn: (m) => warnings.push(m) });
  }

  function keepWarnings(): string[] {
    return warnings.filter((w) => w.includes(' field '));
  }

  async function diskText(): Promise<string> {
    const names = await fs.readdir(dir);
    return (await Promise.all(names.map((n) => fs.readFile(path.join(dir, n), 'utf8')))).join('\n');
  }

  it('keeps the @file: reference and writes the database JSON with the reference put back', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup(JSON.stringify({ auth: { apiKey: `@env:${VAR}` }, region: 'eu' }, null, 2));

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET }, region: 'us' })));

    const record: RecordData = await fs.readJson(path.join(dir, '.tag.json'));
    expect(record.fields.Configuration).toBe('@file:config.json');
    expect(await fs.readJson(path.join(dir, 'config.json'))).toEqual({ auth: { apiKey: `@env:${VAR}` }, region: 'us' });
    expect(await diskText()).not.toContain(SECRET);
    expect(keepWarnings()).toEqual([]);
  });

  it('does the same when the field is in externalizeFields', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup(JSON.stringify({ auth: { apiKey: `@env:${VAR}` } }), { externalizeFields: ['Configuration'] });

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET } })));

    expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe('@file:config.json');
    expect(await fs.readJson(path.join(dir, 'config.json'))).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect(await diskText()).not.toContain(SECRET);
  });

  it('warns with the path and variable, without values, on drift', async () => {
    vi.stubEnv(VAR, 'value-in-env');
    await setup(JSON.stringify({ auth: { apiKey: `@env:${VAR}` } }));

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET } })));

    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('field Configuration.auth.apiKey (side file config.json)');
    expect(keepWarnings()[0]).not.toContain(SECRET);
    expect(keepWarnings()[0]).not.toContain('value-in-env');
    expect(await diskText()).not.toContain(SECRET);
  });

  it('does not rewrite a side file that has @include directives, and warns', async () => {
    vi.stubEnv(VAR, SECRET);
    const original = JSON.stringify({ auth: { apiKey: `@env:${VAR}` }, '@include': 'base.json' }, null, 2);
    await setup(original);

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET } })));

    expect(await fs.readFile(path.join(dir, 'config.json'), 'utf8')).toBe(original);
    expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe('@file:config.json');
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('@include');
    expect(await diskText()).not.toContain(SECRET);
  });

  it('keeps the side file as is and warns when the database array has an item added at the front', async () => {
    vi.stubEnv(VAR, SECRET);
    const original = JSON.stringify({ keys: [`@env:${VAR}`] });
    await setup(original);

    await pull(dbTag(JSON.stringify({ keys: ['new-item', SECRET] })));

    expect(await fs.readFile(path.join(dir, 'config.json'), 'utf8')).toBe(original);
    expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe('@file:config.json');
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain(`the database value holds the value of ${VAR} at a path the file does not reference`);
    expect(await diskText()).not.toContain(SECRET);
  });

  it('keeps the side file as is and warns when the database value is not JSON', async () => {
    vi.stubEnv(VAR, SECRET);
    const original = JSON.stringify({ auth: { apiKey: `@env:${VAR}` } });
    await setup(original);

    await pull(dbTag(`raw ${SECRET}`));

    expect(await fs.readFile(path.join(dir, 'config.json'), 'utf8')).toBe(original);
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('the database value is not JSON');
    expect(keepWarnings()[0]).toContain('(side file config.json)');
    expect(await diskText()).not.toContain(SECRET);
  });

  it('reads a side file that starts with a byte order mark', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup(`\uFEFF${JSON.stringify({ auth: { apiKey: `@env:${VAR}` }, region: 'eu' })}`);

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET }, region: 'us' })));

    expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe('@file:config.json');
    expect(await fs.readJson(path.join(dir, 'config.json'))).toEqual({ auth: { apiKey: `@env:${VAR}` }, region: 'us' });
    expect(await diskText()).not.toContain(SECRET);
  });

  it('does not rewrite a side file that has a nested @file: reference, and warns', async () => {
    vi.stubEnv(VAR, SECRET);
    vi.stubEnv(VAR_B, SECRET_B);
    const original = JSON.stringify({ apiKey: `@env:${VAR}`, sub: '@file:sub.json' }, null, 2);
    await setup(original);
    await fs.writeJson(path.join(dir, 'sub.json'), { key: `@env:${VAR_B}` });

    await pull(dbTag(JSON.stringify({ apiKey: SECRET, sub: { key: SECRET_B } })));

    expect(await fs.readFile(path.join(dir, 'config.json'), 'utf8')).toBe(original);
    expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe('@file:config.json');
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('@file:');
    expect(keepWarnings()[0]).toContain('(side file config.json)');
    expect(keepWarnings()[0]).not.toContain(SECRET);
    expect(keepWarnings()[0]).not.toContain(SECRET_B);
    expect(await diskText()).not.toContain(SECRET);
    expect(await diskText()).not.toContain(SECRET_B);
  });

  it('does not rewrite a side file whose content matches with other formatting', async () => {
    vi.stubEnv(VAR, SECRET);
    const original = JSON.stringify({ auth: { apiKey: `@env:${VAR}` }, region: 'us' }, null, 4);
    await setup(original);

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET }, region: 'us' })));

    expect(await fs.readFile(path.join(dir, 'config.json'), 'utf8')).toBe(original);
    expect(keepWarnings()).toEqual([]);
  });

  describe('falls back to the old path', () => {
    const DB_VALUE = JSON.stringify({ region: 'us' });

    it('when the side file is missing', async () => {
      await setup('{}');
      await fs.remove(path.join(dir, 'config.json'));

      await pull(dbTag(DB_VALUE));

      expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe(DB_VALUE);
    });

    it('when the side file does not parse', async () => {
      const original = `{ "auth": "@env:${VAR}", `;
      await setup(original);

      await pull(dbTag(DB_VALUE));

      expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe(DB_VALUE);
      expect(await fs.readFile(path.join(dir, 'config.json'), 'utf8')).toBe(original);
    });

    it('when the side file holds no @env: reference', async () => {
      const original = JSON.stringify({ region: 'eu' });
      await setup(original);

      await pull(dbTag(DB_VALUE));

      expect(((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.Configuration).toBe(DB_VALUE);
      expect(await fs.readFile(path.join(dir, 'config.json'), 'utf8')).toBe(original);
    });
  });
});
