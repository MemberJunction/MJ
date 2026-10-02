/**
 * PullService end to end over a real directory, with the database read stubbed.
 *
 * The records are instances of a BaseEntity subclass with no typed field properties — exactly
 * what the ClassFactory returns when an entity's generated subclass is not registered in the
 * process (an Open App whose server package did not load under `mj sync`). Before the fix, pull
 * read each key through the typed property, every record keyed as "ID:undefined", and a pull of
 * N new records appended exactly one (with `primaryKey: {}`, duplicated on the next pull).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { BaseEntity, EntityInfo, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { PullService } from '../services/PullService';
import { SyncEngine, RecordData } from '../lib/sync-engine';

const ENTITY = 'PullTest: Companies';

class UntypedCompany extends BaseEntity {}

const companyInfo = new EntityInfo({
  ID: 'aaaaaaaa-0000-4000-8000-000000000000',
  Name: ENTITY,
  BaseTable: 'Company',
  BaseView: 'vwCompanies',
  Status: 'Active',
  Fields: [
    { ID: 'f-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'f-name', Name: 'Name', Type: 'nvarchar', AllowsNull: false, Status: 'Active' },
  ],
});

const idOf = (n: number): string => `A0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function dbCompanies(count: number): BaseEntity[] {
  return Array.from({ length: count }, (_, i) => {
    const record = new UntypedCompany(companyInfo);
    record.Set('ID', idOf(i + 1));
    record.Set('Name', `Company ${i + 1}`);
    return record;
  });
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

/** The entity directory layout from the bug report: one array file new records are appended to. */
async function createEntityDir(root: string): Promise<string> {
  const dir = path.join(root, 'companies');
  await fs.ensureDir(dir);
  await fs.writeJson(path.join(dir, '.mj-sync.json'), {
    entity: ENTITY,
    filePattern: '.*.json',
    pull: {
      createNewFileIfNotFound: true,
      newFileName: '.companies.json',
      appendRecordsToExistingFile: true,
      updateExistingRecords: true,
      mergeStrategy: 'merge',
    },
  });
  return dir;
}

describe('PullService.pull — records whose entity subclass is not registered', () => {
  const originalCwd = process.cwd();
  let root: string;
  let service: PullService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-'));
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    const syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(companyInfo);
    service = new PullService(syncEngine, user);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await fs.remove(root);
  });

  async function pull(dir: string, records: BaseEntity[]) {
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult(records));
    return service.pull({ entity: ENTITY, targetDir: dir });
  }

  async function readCompanies(dir: string): Promise<RecordData[]> {
    return fs.readJson(path.join(dir, '.companies.json'));
  }

  it('writes every new record, with its key, into a fresh file', async () => {
    const dir = await createEntityDir(root);
    const result = await pull(dir, dbCompanies(3));

    expect(result.created).toBe(3);
    const written = await readCompanies(dir);
    expect(written.map((r) => r.primaryKey?.ID)).toEqual([idOf(1), idOf(2), idOf(3)]);
  });

  it('appends all new records and updates the existing ones — not one record per pull', async () => {
    const dir = await createEntityDir(root);
    await pull(dir, dbCompanies(3));

    const result = await pull(dir, dbCompanies(7));

    expect(result).toMatchObject({ created: 4, updated: 3 });
    const written = await readCompanies(dir);
    expect(written).toHaveLength(7);
    expect(new Set(written.map((r) => r.primaryKey?.ID)).size).toBe(7);
    expect(written.some((r) => !r.primaryKey?.ID)).toBe(false);
  });

  it('does not duplicate anything when the same records are pulled again', async () => {
    const dir = await createEntityDir(root);
    await pull(dir, dbCompanies(5));
    await pull(dir, dbCompanies(5));

    expect(await readCompanies(dir)).toHaveLength(5);
  });

  it('pulls key values containing the separator, an empty string, or the text null — and matches them on the next pull', async () => {
    const dir = await createEntityDir(root);
    const keys = ['AB|CD', 'AB', '', 'null', 'a\\|b'];
    const companies = (): BaseEntity[] =>
      keys.map((key) => {
        const record = new UntypedCompany(companyInfo);
        record.Set('ID', key);
        record.Set('Name', `Company ${key}`);
        return record;
      });

    expect(await pull(dir, companies())).toMatchObject({ created: keys.length });
    expect(await pull(dir, companies())).toMatchObject({ created: 0, updated: keys.length });

    const written = await readCompanies(dir);
    expect(written.map((r) => r.primaryKey?.ID)).toEqual(keys);
  });
});
