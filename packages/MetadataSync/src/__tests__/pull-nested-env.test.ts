/**
 * PullService over a temp folder with the database read stubbed: a JSON field whose file
 * value holds `@env:` references keeps them; every other leaf takes the database value.
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
const VAR = 'MJ_PULL_NESTED_ENV_TEST';
const KEY_VAR = 'MJ_PULL_NESTED_KEY_TEST';

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
    { ID: 'f-conf', Name: 'Configuration', Type: 'nvarchar', AllowsNull: true, Status: 'Active' },
  ],
});

function dbTag(configuration: string | null, description: string | null = 'd'): BaseEntity {
  const record = new UntypedTag(tagInfo);
  record.Set('ID', ID);
  record.Set('Name', 'EnvTestTag');
  record.Set('Description', description);
  record.Set('Configuration', configuration);
  return record;
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

describe('PullService.pull — nested @env: references in JSON fields', () => {
  let originalCwd: string;
  let root: string;
  let dir: string;
  let syncEngine: SyncEngine;
  let service: PullService;
  let warnings: string[];

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-nested-env-'));
    dir = path.join(root, 'tags');
    await fs.ensureDir(dir);
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

  async function setup(fields: Record<string, unknown>, pull: Record<string, unknown> = {}, primaryKey: Record<string, unknown> = { ID }) {
    await fs.writeJson(path.join(dir, '.mj-sync.json'), {
      entity: ENTITY,
      filePattern: '.*.json',
      pull: { backupBeforeUpdate: false, ...pull },
    });
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'EnvTestTag', ...fields }, primaryKey });
  }

  async function pull(record: BaseEntity, verbose: boolean = false) {
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult([record]));
    return service.pull({ entity: ENTITY, targetDir: dir, verbose }, { onWarn: (m) => warnings.push(m) });
  }

  async function readTag(): Promise<RecordData> {
    return fs.readJson(path.join(dir, '.tag.json'));
  }

  /** Text of every file under the folder, at any depth. */
  async function diskText(folder: string = dir): Promise<string> {
    const texts: string[] = [];
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      texts.push(entry.isDirectory() ? await diskText(full) : await fs.readFile(full, 'utf8'));
    }
    return texts.join('\n');
  }

  /** Warnings about kept references; other pull warnings (such as the entity subclass notice) are left out. */
  function keepWarnings(): string[] {
    return warnings.filter((w) => w.includes(' field '));
  }

  it('keeps the nested reference and takes the other leaves from the database', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup({ Configuration: { auth: { apiKey: `@env:${VAR}` }, region: 'eu' } });

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET }, region: 'us' })));

    expect((await readTag()).fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` }, region: 'us' });
    expect(await diskText()).not.toContain(SECRET);
    expect(keepWarnings()).toEqual([]);
  });

  it('warns with the path and variable, without values, when the database differs', async () => {
    vi.stubEnv(VAR, 'value-in-env');
    await setup({ Configuration: { auth: { apiKey: `@env:${VAR}` } } });

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET } })));

    expect((await readTag()).fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('field Configuration.auth.apiKey');
    expect(keepWarnings()[0]).toContain(`does not match ${VAR}`);
    expect(keepWarnings()[0]).not.toContain(SECRET);
    expect(keepWarnings()[0]).not.toContain('value-in-env');
  });

  it('keeps the file value and warns when the database array has an item added at the front', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup({ Configuration: { keys: [`@env:${VAR}`] } });

    const result = await pull(dbTag(JSON.stringify({ keys: ['new-item', SECRET] })));

    expect((await readTag()).fields.Configuration).toEqual({ keys: [`@env:${VAR}`] });
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain(`the database value holds the value of ${VAR} at a path the file does not reference`);
    expect(warnings.join('\n')).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(await diskText()).not.toContain(SECRET);
  });

  it('writes a checksum over the kept object', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup({ Configuration: { auth: { apiKey: `@env:${VAR}` } } });

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET } })));

    const file = await readTag();
    expect(file.fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect(file.sync?.checksum).toBe(syncEngine.calculateChecksum(SyncEngine.BuildRecordChecksumPayload(file.fields)));
  });

  it('keeps the file value and warns when the database value is not JSON', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup({ Configuration: { auth: { apiKey: `@env:${VAR}` } } });

    await pull(dbTag(`raw ${SECRET}`));

    expect((await readTag()).fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('the database value is not JSON');
    expect(await diskText()).not.toContain(SECRET);
  });

  it('keeps the file value, with no warning, when the database value is null', async () => {
    await setup({ Configuration: { auth: { apiKey: `@env:${VAR}` } } });

    await pull(dbTag(null));

    expect((await readTag()).fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect(keepWarnings()).toEqual([]);
  });

  it('notes an unset nested variable and a null database value when verbose, without values', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    await setup({ Configuration: { auth: { apiKey: `@env:${VAR}` } } });

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET } })), true);

    const unsetNotes = logs.filter((l) => l.includes(' field Configuration'));
    expect(unsetNotes).toHaveLength(1);
    expect(unsetNotes[0]).toContain(`field Configuration.auth.apiKey: ${VAR} is not set`);
    expect(logs.join('\n')).not.toContain(SECRET);

    logs.length = 0;
    await pull(dbTag(null), true);

    const nullNotes = logs.filter((l) => l.includes(' field Configuration'));
    expect(nullNotes).toHaveLength(1);
    expect(nullNotes[0]).toContain('field Configuration: the database value is null');
    expect(keepWarnings()).toEqual([]);
  });

  it('writes no side file for a whole-field externalizeFields entry', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup({ Configuration: { auth: { apiKey: `@env:${VAR}` } } }, { externalizeFields: ['Configuration'] });

    await pull(dbTag(JSON.stringify({ auth: { apiKey: SECRET } })));

    expect((await readTag()).fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect((await fs.readdir(dir)).sort()).toEqual(['.mj-sync.json', '.tag.json']);
  });

  it('externalizes a dotted sub-property and keeps the @env: leaf beside it', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup(
      { Configuration: { apiKey: `@env:${VAR}`, ReplayScript: '@file:scripts/replay.json' } },
      { externalizeFields: [{ field: 'Configuration.ReplayScript', pattern: '@file:scripts/{Name}.json' }] }
    );

    await pull(dbTag(JSON.stringify({ apiKey: SECRET, ReplayScript: { steps: [1, 2] } })));

    expect((await readTag()).fields.Configuration).toEqual({ apiKey: `@env:${VAR}`, ReplayScript: '@file:scripts/replay.json' });
    expect(await fs.readJson(path.join(dir, 'scripts', 'replay.json'))).toEqual({ steps: [1, 2] });
    expect(await diskText()).not.toContain(SECRET);
  });

  it('keeps a dotted sub-object that holds an @env: reference inline over two pulls', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup(
      { Configuration: { auth: { apiKey: `@env:${VAR}` } } },
      { externalizeFields: [{ field: 'Configuration.auth', pattern: '@file:auth/{Name}.json' }] }
    );
    const record = () => dbTag(JSON.stringify({ auth: { apiKey: SECRET } }));

    await pull(record());

    expect((await readTag()).fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect(await diskText()).not.toContain(SECRET);

    await pull(record());

    expect((await readTag()).fields.Configuration).toEqual({ auth: { apiKey: `@env:${VAR}` } });
    expect(await diskText()).not.toContain(SECRET);
  });

  it('does not externalize a dotted sub-property whose leaf is an @env: reference', async () => {
    vi.stubEnv(VAR, SECRET);
    await setup(
      { Configuration: { apiKey: `@env:${VAR}` } },
      { externalizeFields: [{ field: 'Configuration.apiKey', pattern: '@file:keys/{Name}.txt' }] }
    );

    await pull(dbTag(JSON.stringify({ apiKey: SECRET })));

    expect((await readTag()).fields.Configuration).toEqual({ apiKey: `@env:${VAR}` });
    expect(await fs.pathExists(path.join(dir, 'keys'))).toBe(false);
    expect(await diskText()).not.toContain(SECRET);
  });

  it('names an @env: primary key as the file has it in a drift warning', async () => {
    vi.stubEnv(VAR, 'value-in-env');
    vi.stubEnv(KEY_VAR, ID);
    await setup({ Description: `@env:${VAR}` }, {}, { ID: `@env:${KEY_VAR}` });

    await pull(dbTag(null, SECRET));

    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain(`@env:${KEY_VAR}`);
    expect(keepWarnings()[0]).not.toContain(ID);
  });
});
