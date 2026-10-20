/**
 * PullService over a temp folder with the database read stubbed: a related child whose file
 * primaryKey is an `@env:` reference is matched by the variable, kept in place, and keeps its references.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { BaseEntity, EntityInfo, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { PullService } from '../services/PullService';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { UnsetPrimaryKeyVariableError } from '../lib/existing-record-index';
import { RecordProcessor } from '../lib/RecordProcessor';

const ENTITY = 'EnvTest: Tags';
const CHILD_ENTITY = 'EnvTest: Tag Items';
const ID = 'B0000000-0000-4000-8000-000000000001';
const ID_2 = 'B0000000-0000-4000-8000-000000000002';
const CHILD_ID = 'C0000000-0000-4000-8000-000000000001';
const SECRET = 'super-secret-123';
const VAR = 'MJ_PULL_RELATED_ENV_TEST';
const CHILD_VAR = 'MJ_PULL_RELATED_KEY_TEST';

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

function dbTag(id = ID): BaseEntity {
  const record = new UntypedTag(tagInfo);
  record.Set('ID', id);
  record.Set('Name', 'EnvTestTag');
  return record;
}

function dbTagItem(): BaseEntity {
  const record = new UntypedTag(tagItemInfo);
  record.Set('ID', CHILD_ID);
  record.Set('TagID', ID);
  record.Set('Secret', SECRET);
  return record;
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

/** The D2 message for an unset child key variable in `file`. */
function unsetChildKeyMessage(file: string): string {
  return `${file}: primaryKey field ID uses @env:${CHILD_VAR}, which is not set. Set it to pull ${ENTITY}; the key belongs to ${CHILD_ENTITY}.`;
}

describe('PullService.pull — related children with an @env: primaryKey', () => {
  let root: string;
  let dir: string;
  let service: PullService;
  let messages: string[];
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-related-env-')));
    dir = path.join(root, 'tags');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), {
      entity: ENTITY,
      filePattern: '.*.json',
      pull: { backupBeforeUpdate: false, relatedEntities: { TagItems: { entity: CHILD_ENTITY, foreignKey: 'TagID' } } },
    });
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    const syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockImplementation((name) => (name === CHILD_ENTITY ? tagItemInfo : tagInfo));
    service = new PullService(syncEngine, user);
    messages = [];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  function tagRecord(childKey: Record<string, unknown>, id = ID): RecordData {
    return {
      fields: { Name: 'EnvTestTag' },
      primaryKey: { ID: id },
      relatedEntities: { TagItems: [{ fields: { TagID: '@parent:ID', Secret: `@env:${VAR}` }, primaryKey: childKey }] },
    };
  }

  async function writeTag(childKey: Record<string, unknown>) {
    await fs.writeJson(path.join(dir, '.tag.json'), tagRecord(childKey));
  }

  async function pull(multiFile?: string, parents: BaseEntity[] = [dbTag()]) {
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) =>
      runViewResult(params.EntityName === CHILD_ENTITY ? [dbTagItem()] : parents)
    );
    const collect = (m: string) => messages.push(m);
    return service.pull(
      { entity: ENTITY, targetDir: dir, ...(multiFile ? { multiFile } : {}) },
      { onWarn: collect, onError: collect, onLog: collect }
    );
  }

  async function children(): Promise<RecordData[]> {
    return ((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).relatedEntities?.TagItems ?? [];
  }

  /** The error a rejected pull throws. */
  async function pullError(multiFile?: string, parents?: BaseEntity[]): Promise<unknown> {
    try {
      await pull(multiFile, parents);
    } catch (error) {
      return error;
    }
    throw new Error('pull did not reject');
  }

  it('keeps the child in place with its @env: key and fields', async () => {
    vi.stubEnv(VAR, SECRET);
    vi.stubEnv(CHILD_VAR, CHILD_ID);
    await writeTag({ ID: `@env:${CHILD_VAR}` });

    await pull();

    const items = await children();
    expect(items).toHaveLength(1);
    expect(items[0].primaryKey).toEqual({ ID: `@env:${CHILD_VAR}` });
    expect(items[0].fields.Secret).toBe(`@env:${VAR}`);
    const text = await fs.readFile(path.join(dir, '.tag.json'), 'utf8');
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(CHILD_ID);
  });

  it('matches a lowercase literal child key to the uppercase database key', async () => {
    vi.stubEnv(VAR, SECRET);
    await writeTag({ ID: CHILD_ID.toLowerCase() });

    await pull();

    const items = await children();
    expect(items).toHaveLength(1);
    expect(items[0].fields.Secret).toBe(`@env:${VAR}`);
  });

  it('fails before any write when a child key variable is not set', async () => {
    vi.stubEnv(VAR, SECRET);
    await writeTag({ ID: `@env:${CHILD_VAR}` });
    const before = await fs.readFile(path.join(dir, '.tag.json'), 'utf8');

    await expect(pull()).rejects.toThrow(`uses @env:${CHILD_VAR}, which is not set`);

    expect(await fs.readFile(path.join(dir, '.tag.json'), 'utf8')).toBe(before);
    expect(messages.some((m) => m.includes(SECRET) || m.includes(CHILD_ID))).toBe(false);
  });

  it('gives the unset child key error unwrapped, naming the record file and the pulled entity', async () => {
    vi.stubEnv(VAR, SECRET);
    await writeTag({ ID: `@env:${CHILD_VAR}` });

    const error = await pullError();

    expect(error).toBeInstanceOf(UnsetPrimaryKeyVariableError);
    expect((error as UnsetPrimaryKeyVariableError).message).toBe(unsetChildKeyMessage(path.join(dir, '.tag.json')));
  });

  it('gives the unset child key error unwrapped in a --multi-file pull, naming the target file', async () => {
    vi.stubEnv(VAR, SECRET);
    const file = path.join(dir, 'all-tags.json');
    await fs.writeJson(file, [tagRecord({ ID: `@env:${CHILD_VAR}` })]);
    const before = await fs.readFile(file, 'utf8');

    const error = await pullError('all-tags');

    expect(error).toBeInstanceOf(UnsetPrimaryKeyVariableError);
    expect((error as UnsetPrimaryKeyVariableError).message).toBe(unsetChildKeyMessage(file));
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(messages.some((m) => m.includes(SECRET) || m.includes(CHILD_ID))).toBe(false);
  });

  it('gives the unset child key error unwrapped when two parents load related children in one batch', async () => {
    vi.stubEnv(VAR, SECRET);
    await writeTag({ ID: `@env:${CHILD_VAR}` });
    await fs.writeJson(path.join(dir, '.tag2.json'), { fields: { Name: 'EnvTestTag' }, primaryKey: { ID: ID_2 } });
    const before = [await fs.readFile(path.join(dir, '.tag.json'), 'utf8'), await fs.readFile(path.join(dir, '.tag2.json'), 'utf8')];

    const error = await pullError(undefined, [dbTag(), dbTag(ID_2)]);

    expect(error).toBeInstanceOf(UnsetPrimaryKeyVariableError);
    expect((error as UnsetPrimaryKeyVariableError).message).toBe(unsetChildKeyMessage(path.join(dir, '.tag.json')));
    expect(await fs.readFile(path.join(dir, '.tag.json'), 'utf8')).toBe(before[0]);
    expect(await fs.readFile(path.join(dir, '.tag2.json'), 'utf8')).toBe(before[1]);
    expect(messages.some((m) => m.includes(SECRET) || m.includes(CHILD_ID))).toBe(false);
  });

  it('gives the error of the first record in query order when a later record fails first', async () => {
    vi.stubEnv(VAR, SECRET);
    await writeTag({ ID: `@env:${CHILD_VAR}` });
    await fs.writeJson(path.join(dir, '.tag2.json'), tagRecord({ ID: `@env:${CHILD_VAR}` }, ID_2));

    // The first record waits until the second record has failed
    let secondDone: () => void = () => undefined;
    const secondFailed = new Promise<void>((resolve) => (secondDone = resolve));
    const original = RecordProcessor.prototype.processRecord;
    vi.spyOn(RecordProcessor.prototype, 'processRecord').mockImplementation(async function (this: RecordProcessor, ...args) {
      if (args[0].Get('ID') === ID) {
        await secondFailed;
        return original.apply(this, args);
      }
      try {
        return await original.apply(this, args);
      } finally {
        secondDone();
      }
    });

    const error = await pullError(undefined, [dbTag(), dbTag(ID_2)]);

    expect(error).toBeInstanceOf(UnsetPrimaryKeyVariableError);
    expect((error as UnsetPrimaryKeyVariableError).message).toBe(unsetChildKeyMessage(path.join(dir, '.tag.json')));
  });
});
