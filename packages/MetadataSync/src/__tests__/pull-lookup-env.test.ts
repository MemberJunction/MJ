/**
 * PullService over a temp folder with the database read stubbed: a `@lookup:` whose criteria
 * use `@env:` is kept when the foreign key still points at a matching record.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { BaseEntity, EntityInfo, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { PullService } from '../services/PullService';
import { SyncEngine, RecordData } from '../lib/sync-engine';

const ENTITY = 'EnvTest: Tags';
const USERS = 'EnvTest: Users';
const ACCOUNTS = 'EnvTest: Accounts';
const ID = 'B0000000-0000-4000-8000-000000000001';
const USER_ID = 'E0000000-0000-4000-8000-000000000001';
const EMAIL = 'admin@example.com';
const VAR = 'MJ_PULL_LOOKUP_ENV_TEST';
const VAR_2 = 'MJ_PULL_LOOKUP_ENV_TEST_2';

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
    { ID: 'f-owner', Name: 'OwnerID', Type: 'uniqueidentifier', AllowsNull: true, Status: 'Active' },
  ],
});

const userInfoEntity = new EntityInfo({
  ID: 'eeeeeeee-0000-4000-8000-000000000000',
  Name: USERS,
  BaseTable: 'User',
  BaseView: 'vwUsers',
  Status: 'Active',
  Fields: [
    { ID: 'u-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'u-email', Name: 'Email', Type: 'nvarchar', AllowsNull: false, Status: 'Active' },
  ],
});

const accountInfo = new EntityInfo({
  ID: 'aaaaaaaa-0000-4000-8000-000000000000',
  Name: ACCOUNTS,
  BaseTable: 'Account',
  BaseView: 'vwAccounts',
  Status: 'Active',
  Fields: [
    { ID: 'a-key', Name: 'AccountKey', Type: 'nvarchar', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'a-email', Name: 'Email', Type: 'nvarchar', AllowsNull: false, Status: 'Active' },
  ],
});

function dbTag(ownerId: string | null): BaseEntity {
  const record = new UntypedTag(tagInfo);
  record.Set('ID', ID);
  record.Set('Name', 'EnvTestTag');
  record.Set('OwnerID', ownerId);
  return record;
}

function runViewResult<T>(records: T[]): RunViewResult<T> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

describe('PullService.pull — @lookup: with @env: criteria', () => {
  let root: string;
  let dir: string;
  let service: PullService;
  let warnings: string[];
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-lookup-env-'));
    dir = path.join(root, 'tags');
    await fs.ensureDir(dir);
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    const syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockImplementation((name) =>
      name === USERS ? userInfoEntity : name === ACCOUNTS ? accountInfo : tagInfo
    );
    service = new PullService(syncEngine, user);
    warnings = [];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  async function setup(ownerValue: string, pull: Record<string, unknown> = {}) {
    await fs.writeJson(path.join(dir, '.mj-sync.json'), {
      entity: ENTITY,
      filePattern: '.*.json',
      pull: { backupBeforeUpdate: false, ...pull },
    });
    await fs.writeJson(path.join(dir, '.tag.json'), { fields: { Name: 'EnvTestTag', OwnerID: ownerValue }, primaryKey: { ID } });
  }

  async function pull(
    tag: BaseEntity,
    users: Array<Record<string, unknown>> = [{ ID: USER_ID, Email: EMAIL, Nickname: null }],
    verbose = false
  ) {
    const spy = vi
      .spyOn(RunView.prototype, 'RunView')
      .mockImplementation(async (params) => (params.EntityName === ENTITY ? runViewResult([tag]) : runViewResult(users)));
    await service.pull({ entity: ENTITY, targetDir: dir, verbose }, { onWarn: (m) => warnings.push(m) });
    return spy;
  }

  async function fileText(): Promise<string> {
    return fs.readFile(path.join(dir, '.tag.json'), 'utf8');
  }

  async function owner(): Promise<unknown> {
    return ((await fs.readJson(path.join(dir, '.tag.json'))) as RecordData).fields.OwnerID;
  }

  function keepWarnings(): string[] {
    return warnings.filter((w) => w.includes(' field '));
  }

  it('keeps the lookup when the target matches without case', async () => {
    vi.stubEnv(VAR, 'Admin@Example.com');
    await setup(`@lookup:${USERS}.Email=@env:${VAR}`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toEqual([]);
    expect(await fileText()).not.toContain(EMAIL);
  });

  it('warns when the variable has spaces the target value does not have, as push does not trim', async () => {
    vi.stubEnv(VAR, ' admin@example.com');
    await setup(`@lookup:${USERS}.Email=@env:${VAR}`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('does not match');
  });

  it('finds the criteria field on the target without case', async () => {
    vi.stubEnv(VAR, EMAIL);
    await setup(`@lookup:${USERS}.email=@env:${VAR}`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.email=@env:${VAR}`);
    expect(keepWarnings()).toEqual([]);
  });

  it('matches a literal null criteria value against a null target column', async () => {
    vi.stubEnv(VAR, EMAIL);
    await setup(`@lookup:${USERS}.Email=@env:${VAR}&Nickname=null`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}&Nickname=null`);
    expect(keepWarnings()).toEqual([]);
  });

  it('treats a variable whose value is null as a null criteria value', async () => {
    vi.stubEnv(VAR, EMAIL);
    vi.stubEnv(VAR_2, ' NULL ');
    await setup(`@lookup:${USERS}.Email=@env:${VAR}&Nickname=@env:${VAR_2}`);

    await pull(dbTag(USER_ID));

    expect(keepWarnings()).toEqual([]);
  });

  it('keeps the lookup when lookupFields is configured for the field', async () => {
    vi.stubEnv(VAR, EMAIL);
    await setup(`@lookup:${USERS}.Email=@env:${VAR}`, { lookupFields: { OwnerID: { entity: USERS, field: 'Email' } } });

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(await fileText()).not.toContain(EMAIL);
  });

  it('keeps flags and create fields as written', async () => {
    vi.stubEnv(VAR, EMAIL);
    const lookup = `@lookup:${USERS}.Email=@env:${VAR}?create&Name=@env:${VAR_2}`;
    await setup(lookup);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(lookup);
  });

  it('keeps the lookup and warns, without values, when the target does not match', async () => {
    vi.stubEnv(VAR, 'someone-else@example.com');
    await setup(`@lookup:${USERS}.Email=@env:${VAR}`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain(VAR);
    expect(keepWarnings()[0]).toContain('field OwnerID');
    expect(keepWarnings()[0]).not.toContain(EMAIL);
    expect(keepWarnings()[0]).not.toContain('someone-else@example.com');
    expect(keepWarnings()[0]).not.toContain(USER_ID);
  });

  it('keeps the lookup, with no warning, when the variable is not set', async () => {
    await setup(`@lookup:${USERS}.Email=@env:${VAR}`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toEqual([]);
  });

  it('keeps the lookup and gives a separate warning when the foreign key is null or the target is gone', async () => {
    vi.stubEnv(VAR, EMAIL);
    await setup(`@lookup:${USERS}.Email=@env:${VAR}`);

    await pull(dbTag(null));
    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('the database value is null');

    warnings = [];
    await pull(dbTag(USER_ID), []);
    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('was not found');
  });

  it('keeps the lookup and warns when the target cannot be read', async () => {
    vi.stubEnv(VAR, EMAIL);
    await setup(`@lookup:${USERS}.Email=@env:${VAR}`);
    const tag = dbTag(USER_ID);
    const pullWith = async (read: () => Promise<RunViewResult<unknown>>) => {
      vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) =>
        params.EntityName === ENTITY ? runViewResult([tag]) : read()
      );
      await service.pull({ entity: ENTITY, targetDir: dir }, { onWarn: (m) => warnings.push(m) });
    };

    await pullWith(async () => ({ ...runViewResult([]), Success: false, ErrorMessage: 'boom' }));
    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('could not be read');

    warnings = [];
    await pullWith(async () => {
      throw new Error('connection lost');
    });
    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}`);
    expect(keepWarnings()).toHaveLength(1);
    expect(keepWarnings()[0]).toContain('could not be read');
  });

  it('reads the target by its own primary key field', async () => {
    vi.stubEnv(VAR, EMAIL);
    await setup(`@lookup:${ACCOUNTS}.Email=@env:${VAR}`);

    const spy = await pull(dbTag(USER_ID), [{ AccountKey: USER_ID, Email: EMAIL }]);

    const targetCalls = spy.mock.calls.filter(([params]) => params.EntityName === ACCOUNTS);
    expect(targetCalls).toHaveLength(1);
    expect(targetCalls[0][0].ExtraFilter).toBe(`AccountKey='${USER_ID}'`);
    expect(targetCalls[0][0].ResultType).toBe('simple');
    expect(keepWarnings()).toEqual([]);
  });

  it.each([
    ['a trailing &', `@lookup:${USERS}.Email=@env:${VAR}&`],
    ['a criteria item without =', `@lookup:${USERS}.Email=@env:${VAR}&Active`],
  ])('keeps a lookup with %s unchecked and writes no database value', async (_label, lookup) => {
    vi.stubEnv(VAR, EMAIL);
    await setup(lookup, { lookupFields: { OwnerID: { entity: USERS, field: 'Email' } } });

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(lookup);
    expect(await fileText()).not.toContain(EMAIL);
    expect(await fileText()).not.toContain(USER_ID);
    expect(keepWarnings()).toEqual([]);
  });

  it('keeps a lookup with unreadable criteria and an @env: create field', async () => {
    const lookup = `@lookup:${USERS}.Email?create&Name=@env:${VAR_2}`;
    await setup(lookup);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(lookup);
  });

  it('keeps a lookup whose @env: is only in a create field', async () => {
    vi.stubEnv(VAR_2, 'Some Name');
    const lookup = `@lookup:${USERS}.Email=${EMAIL}?create&Name=@env:${VAR_2}`;
    await setup(lookup);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(lookup);
    expect(keepWarnings()).toEqual([]);
  });

  it.each([
    ['a bad % sequence in a create field', `@lookup:${USERS}.Email=@env:${VAR}?create&Name=%E0%A4%A`],
    ['a ?optional flag', `@lookup:${USERS}.Email=@env:${VAR}?optional`],
  ])('keeps a lookup with %s without throwing', async (_label, lookup) => {
    vi.stubEnv(VAR, EMAIL);
    await setup(lookup);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(lookup);
    expect(keepWarnings()).toEqual([]);
  });

  it.each(['@parent:OwnerID', '@root:ID'])('keeps a lookup with %s criteria and no warning', async (reference) => {
    vi.stubEnv(VAR, EMAIL);
    const lookup = `@lookup:${USERS}.Email=@env:${VAR}&ID=${reference}`;
    await setup(lookup);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(lookup);
    expect(keepWarnings()).toEqual([]);
  });

  it('prints no value in the verbose note', async () => {
    vi.stubEnv(VAR, EMAIL);
    const lookup = `@lookup:${USERS}.Email=@env:${VAR}&ID=@parent:OwnerID`;
    await setup(lookup);
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });

    await pull(dbTag(USER_ID), undefined, true);

    const notes = logs.filter((line) => line.includes(' field OwnerID'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain(lookup);
    expect(notes[0]).not.toContain(EMAIL);
    expect(notes[0]).not.toContain(USER_ID);
  });

  it('checks literal criteria next to the @env: one', async () => {
    vi.stubEnv(VAR, EMAIL);
    await setup(`@lookup:${USERS}.Email=@env:${VAR}&ID=${USER_ID.toLowerCase()}`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(`@lookup:${USERS}.Email=@env:${VAR}&ID=${USER_ID.toLowerCase()}`);
    expect(keepWarnings()).toEqual([]);
  });

  it('does not change a lookup without @env:', async () => {
    await setup(`@lookup:${USERS}.Email=${EMAIL}`);

    await pull(dbTag(USER_ID));

    expect(await owner()).toBe(USER_ID);
  });
});
