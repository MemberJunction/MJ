/**
 * Pull leaves out a read-only field whose database value holds the value of an `@env:` reference
 * in the record file, such as a key path built from an env-sourced primary key.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { BaseEntity, EntityInfo, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { PullService } from '../services/PullService';
import { SyncEngine, RecordData } from '../lib/sync-engine';

const ENTITY = 'EnvTest: Nodes';
const ID = 'C0000000-0000-4000-8000-00000000000A';
const KEY_VAR = 'MJ_PULL_DERIVED_KEY';
const VAR = 'MJ_PULL_DERIVED_VALUE';
const SECRET = 'super-secret-123';

class UntypedNode extends BaseEntity {}

const nodeInfo = new EntityInfo({
  ID: 'cccccccc-0000-4000-8000-000000000000',
  Name: ENTITY,
  BaseTable: 'Node',
  BaseView: 'vwNodes',
  Status: 'Active',
  Fields: [
    { ID: 'n-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'n-name', Name: 'Name', Type: 'nvarchar', AllowsNull: false, AllowUpdateAPI: true, Status: 'Active' },
    { ID: 'n-desc', Name: 'Description', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
    { ID: 'n-parent', Name: 'ParentID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
    { ID: 'n-notes', Name: 'Notes', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
    { ID: 'n-root', Name: 'RootParentID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: false, Status: 'Active' },
    { ID: 'n-path', Name: 'ParentIDPath', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: false, Status: 'Active' },
    { ID: 'n-summary', Name: 'Summary', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: false, Status: 'Active' },
  ],
});

function dbNode(values: Record<string, string | null>): BaseEntity {
  const record = new UntypedNode(nodeInfo);
  for (const [name, value] of Object.entries(values)) {
    record.Set(name, value);
  }
  return record;
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

describe('pull leaves out read-only fields that hold an @env: value', () => {
  let dir: string;
  let file: string;
  let service: PullService;
  let output: string[];

  beforeEach(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-derived-'));
    dir = path.join(root, 'nodes');
    file = path.join(dir, 'all.json');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: ENTITY, pull: { backupBeforeUpdate: false } });
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    const syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(nodeInfo);
    service = new PullService(syncEngine, user);
    output = [];
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      output.push(String(m));
    });
    vi.spyOn(console, 'warn').mockImplementation((m: unknown) => {
      output.push(String(m));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(path.dirname(dir));
  });

  async function pull(record: BaseEntity, verbose = true): Promise<RecordData> {
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => runViewResult([record]));
    const collect = (m: string) => output.push(m);
    await service.pull({ entity: ENTITY, targetDir: dir, multiFile: 'all', verbose }, { onWarn: collect, onLog: collect, onSuccess: collect });
    return (await fs.readJson(file))[0];
  }

  it('leaves out a read-only field that holds the env-sourced key, without regard to case, with a names-only note', async () => {
    vi.stubEnv(KEY_VAR, ID.toLowerCase());
    await fs.writeJson(file, [{ primaryKey: { ID: `@env:${KEY_VAR}` }, fields: { Name: 'Root' } }]);

    const written = await pull(dbNode({ ID, Name: 'Root', RootParentID: ID, ParentIDPath: `/${ID}/` }));

    expect(written.primaryKey).toEqual({ ID: `@env:${KEY_VAR}` });
    expect(written.fields).not.toHaveProperty('RootParentID');
    expect(written.fields).not.toHaveProperty('ParentIDPath');
    expect((await fs.readFile(file, 'utf8')).toLowerCase()).not.toContain(ID.toLowerCase());
    expect(output.join('\n').toLowerCase()).not.toContain(ID.toLowerCase());
    expect(output.some((m) => m.includes('RootParentID') && m.includes(KEY_VAR))).toBe(true);
  });

  it('leaves out a read-only field that holds the value of an @env: field reference', async () => {
    vi.stubEnv(KEY_VAR, ID);
    vi.stubEnv(VAR, SECRET);
    await fs.writeJson(file, [{ primaryKey: { ID }, fields: { Name: 'Root', Description: `@env:${VAR}` } }]);

    const written = await pull(dbNode({ ID, Name: 'Root', Description: SECRET, Summary: `Root: ${SECRET}` }));

    expect(written.fields.Description).toBe(`@env:${VAR}`);
    expect(written.fields).not.toHaveProperty('Summary');
    expect(await fs.readFile(file, 'utf8')).not.toContain(SECRET);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('keeps a writable field that holds the same value, and a read-only field that holds no env value', async () => {
    vi.stubEnv(KEY_VAR, ID);
    await fs.writeJson(file, [{ primaryKey: { ID: `@env:${KEY_VAR}` }, fields: { Name: 'Root' } }]);

    const written = await pull(dbNode({ ID, Name: 'Root', Notes: `see ${ID}`, Summary: 'plain summary' }), false);

    expect(written.fields.Notes).toBe(`see ${ID}`);
    expect(written.fields.Summary).toBe('plain summary');
  });

  it('leaves out a read-only field that holds a UUID @env: field value in another case', async () => {
    const parentId = 'C0000000-0000-4000-8000-0000000000BB';
    vi.stubEnv(VAR, parentId.toLowerCase());
    await fs.writeJson(file, [{ primaryKey: { ID }, fields: { Name: 'Child', ParentID: `@env:${VAR}` } }]);

    const written = await pull(dbNode({ ID, Name: 'Child', ParentID: parentId, RootParentID: parentId, ParentIDPath: `/${parentId}/${ID}/` }));

    expect(written.fields.ParentID).toBe(`@env:${VAR}`);
    expect(written.fields).not.toHaveProperty('RootParentID');
    expect(written.fields).not.toHaveProperty('ParentIDPath');
    expect((await fs.readFile(file, 'utf8')).toLowerCase()).not.toContain(parentId.toLowerCase());
  });

  describe('a record file that already holds the derived fields', () => {
    async function pullSingle(record: BaseEntity, mergeStrategy?: 'merge' | 'overwrite'): Promise<RecordData> {
      const single = path.join(dir, '.root.json');
      await fs.writeJson(path.join(dir, '.mj-sync.json'), {
        entity: ENTITY,
        filePattern: '.*.json',
        pull: { backupBeforeUpdate: false, ...(mergeStrategy ? { mergeStrategy } : {}) },
      });
      vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => runViewResult([record]));
      await service.pull({ entity: ENTITY, targetDir: dir }, {});
      return fs.readJson(single);
    }

    beforeEach(async () => {
      vi.stubEnv(KEY_VAR, ID);
      await fs.writeJson(path.join(dir, '.root.json'), {
        fields: { Name: 'Root', RootParentID: ID, ParentIDPath: `/${ID}/`, Summary: 'old summary' },
        primaryKey: { ID: `@env:${KEY_VAR}` },
      });
    });

    it('removes them under the default merge, and keeps a field with an unrelated value', async () => {
      const written = await pullSingle(dbNode({ ID, Name: 'Root', RootParentID: ID, ParentIDPath: `/${ID}/`, Summary: 'new summary' }));

      expect(written.primaryKey).toEqual({ ID: `@env:${KEY_VAR}` });
      expect(written.fields).not.toHaveProperty('RootParentID');
      expect(written.fields).not.toHaveProperty('ParentIDPath');
      expect(written.fields.Summary).toBe('new summary');
      expect((await fs.readFile(path.join(dir, '.root.json'), 'utf8')).toLowerCase()).not.toContain(ID.toLowerCase());
    });

    it('removes them under overwrite with preserveFields', async () => {
      await fs.writeJson(path.join(dir, '.mj-sync.json'), {
        entity: ENTITY,
        filePattern: '.*.json',
        pull: { backupBeforeUpdate: false, mergeStrategy: 'overwrite', preserveFields: ['RootParentID'] },
      });
      vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => runViewResult([dbNode({ ID, Name: 'Root', RootParentID: ID })]));
      await service.pull({ entity: ENTITY, targetDir: dir }, {});

      const written: RecordData = await fs.readJson(path.join(dir, '.root.json'));
      expect(written.fields).not.toHaveProperty('RootParentID');
    });
  });
});

