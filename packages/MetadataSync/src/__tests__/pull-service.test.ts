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
import { PullService, PullOptions } from '../services/PullService';
import { FileWriteBatch } from '../lib/file-write-batch';
import { SyncEngine, RecordData } from '../lib/sync-engine';
import { resetMissingEntitySubclassWarnings } from '../lib/entity-subclass-guard';

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

function dbCompanies(count: number, namePrefix = 'Company'): BaseEntity[] {
  return Array.from({ length: count }, (_, i) => {
    const record = new UntypedCompany(companyInfo);
    record.Set('ID', idOf(i + 1));
    record.Set('Name', `${namePrefix} ${i + 1}`);
    return record;
  });
}

function runViewResult(records: BaseEntity[]): RunViewResult<BaseEntity> {
  return { Success: true, Results: records, RowCount: records.length, TotalRowCount: records.length, ExecutionTime: 0, ErrorMessage: '' };
}

/** The entity directory layout from the bug report: one array file new records are appended to. */
async function createEntityDir(root: string, pullOverrides: { backupDirectory?: string; updateExistingRecords?: boolean; createNewFileIfNotFound?: boolean } = {}): Promise<string> {
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
      backupBeforeUpdate: true,
      ...pullOverrides,
    },
  });
  return dir;
}

describe('PullService.pull — records whose entity subclass is not registered', () => {
  const originalCwd = process.cwd();
  let root: string;
  let service: PullService;
  let warnings: string[];

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-'));
    resetMissingEntitySubclassWarnings();
    const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
    const syncEngine = new SyncEngine(user);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(companyInfo);
    service = new PullService(syncEngine, user);
    warnings = [];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await fs.remove(root);
  });

  async function pull(dir: string, records: BaseEntity[], extraOptions: Partial<PullOptions> = {}) {
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult(records));
    return service.pull({ entity: ENTITY, targetDir: dir, ...extraOptions }, { onWarn: (m) => warnings.push(m) });
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

  it('skips existing records when updateExistingRecords is false over a folder value of true', async () => {
    const dir = await createEntityDir(root);
    await pull(dir, dbCompanies(2));

    const result = await pull(dir, dbCompanies(3), { updateExistingRecords: false });

    expect(result).toMatchObject({ updated: 0, skipped: 2, created: 1 });
    expect(await readCompanies(dir)).toHaveLength(3);
  });

  it('creates no records when createNewFileIfNotFound is false', async () => {
    const dir = await createEntityDir(root);

    const result = await pull(dir, dbCompanies(3), { createNewFileIfNotFound: false });

    expect(result).toMatchObject({ created: 0, skipped: 3 });
  });

  it('skips existing records when the folder sets updateExistingRecords to false and no option is given', async () => {
    const dir = await createEntityDir(root, { updateExistingRecords: false });
    await pull(dir, dbCompanies(2));

    const result = await pull(dir, dbCompanies(2));

    expect(result).toMatchObject({ updated: 0, skipped: 2, created: 0 });
  });

  it('updates existing records when updateExistingRecords is true over a folder value of false', async () => {
    const dir = await createEntityDir(root, { updateExistingRecords: false });
    await pull(dir, dbCompanies(2));

    const result = await pull(dir, dbCompanies(2, 'Renamed'), { updateExistingRecords: true });

    expect(result).toMatchObject({ updated: 2, skipped: 0, created: 0 });
    expect((await readCompanies(dir)).map((r) => r.fields?.Name)).toEqual(['Renamed 1', 'Renamed 2']);
  });

  it('warns once that the entity subclass is missing, in pull terms', async () => {
    const dir = await createEntityDir(root);
    await pull(dir, dbCompanies(2));

    const subclassWarnings = warnings.filter((w) => w.includes(`No entity subclass is registered for '${ENTITY}'`));
    expect(subclassWarnings).toHaveLength(1);
    expect(subclassWarnings[0]).toMatch(/read through the generic BaseEntity/);
  });
});

describe('PullService.pull — backupBeforeUpdate', () => {
  const originalCwd = process.cwd();
  let root: string;
  let service: PullService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-backup-'));
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

  async function pull(dir: string, count: number) {
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult(dbCompanies(count)));
    return service.pull({ entity: ENTITY, targetDir: dir });
  }

  async function backups(backupDir: string): Promise<string[]> {
    return (await fs.pathExists(backupDir)) ? (await fs.readdir(backupDir)).sort() : [];
  }

  async function readCompanies(dir: string): Promise<RecordData[]> {
    return fs.readJson(path.join(dir, '.companies.json'));
  }

  /** Makes the next flush fail after it has started rewriting files. */
  function failNextFlush(): void {
    vi.spyOn(FileWriteBatch.prototype, 'flush').mockImplementationOnce(async function (this: FileWriteBatch) {
      for (const file of this.getPendingFiles()) {
        await fs.writeJson(file, []);
      }
      throw new Error('disk full');
    });
  }

  it('removes its backups after a successful pull', async () => {
    const dir = await createEntityDir(root);
    await pull(dir, 2);
    await pull(dir, 4);

    expect(await fs.pathExists(path.join(dir, '.backups'))).toBe(false);
    expect(await readCompanies(dir)).toHaveLength(4);
  });

  it('restores a file that only gained new records when the pull fails', async () => {
    const dir = await createEntityDir(root, { updateExistingRecords: false });
    await pull(dir, 2);

    failNextFlush();
    await expect(pull(dir, 4)).rejects.toThrow(/disk full/);

    expect((await readCompanies(dir)).map((r) => r.primaryKey?.ID)).toEqual([idOf(1), idOf(2)]);
  });

  it('restores from a nested backupDirectory, and treats an absolute one as inside the folder', async () => {
    for (const backupDirectory of ['backups/pull', '/abs-backups']) {
      const dir = await createEntityDir(root, { backupDirectory });
      await fs.remove(path.join(dir, '.companies.json'));
      await pull(dir, 2);

      failNextFlush();
      await expect(pull(dir, 3)).rejects.toThrow(/disk full/);

      expect(await readCompanies(dir)).toHaveLength(2);
      expect(await backups(path.join(dir, backupDirectory))).toHaveLength(1);
    }
  });

  it('refuses a backupDirectory outside the folder of the files, before writing anything', async () => {
    const dir = await createEntityDir(root, { backupDirectory: '../escaped' });
    await pull(dir, 1);

    await expect(pull(dir, 2)).rejects.toThrow(/points outside/);

    expect(await readCompanies(dir)).toHaveLength(1);
    expect(await fs.pathExists(path.join(root, 'escaped'))).toBe(false);
  });
});

describe('PullService.pull — mergeStrategy skip', () => {
  const originalCwd = process.cwd();
  let root: string;
  let service: PullService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-pull-skip-'));
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

  it('counts existing records as skipped and leaves the file byte-identical', async () => {
    const dir = await createEntityDir(root);
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult(dbCompanies(2)));
    await service.pull({ entity: ENTITY, targetDir: dir });
    process.chdir(originalCwd);

    const config = await fs.readJson(path.join(dir, '.mj-sync.json'));
    config.pull.mergeStrategy = 'skip';
    await fs.writeJson(path.join(dir, '.mj-sync.json'), config);
    const file = path.join(dir, '.companies.json');
    await fs.appendFile(file, '\n');
    const before = await fs.readFile(file, 'utf8');

    const result = await service.pull({ entity: ENTITY, targetDir: dir });

    expect(result).toMatchObject({ updated: 0, skipped: 2 });
    expect(await fs.readFile(file, 'utf8')).toBe(before);
  });

  it('applies a MergeStrategy option of skip over a merge folder config', async () => {
    const dir = await createEntityDir(root);
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(runViewResult(dbCompanies(2)));
    await service.pull({ entity: ENTITY, targetDir: dir });
    process.chdir(originalCwd);

    const file = path.join(dir, '.companies.json');
    await fs.appendFile(file, '\n');
    const before = await fs.readFile(file, 'utf8');

    const result = await service.pull({ entity: ENTITY, targetDir: dir, MergeStrategy: 'skip' });

    expect(result).toMatchObject({ updated: 0, skipped: 2 });
    expect(await fs.readFile(file, 'utf8')).toBe(before);
  });
});

describe('PullService.mergeRecords — composition axes', () => {
  type MergeRecords = (
    existing: RecordData,
    newData: RecordData,
    strategy: 'overwrite' | 'merge' | 'skip',
    preserveFields: string[]
  ) => Promise<RecordData>;

  const user = new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' });
  const merge = (existing: RecordData, newData: RecordData, strategy: 'overwrite' | 'merge') => {
    const service = new PullService(new SyncEngine(user), user);
    return (service as unknown as { mergeRecords: MergeRecords }).mergeRecords(existing, newData, strategy, []);
  };

  const declared: RecordData = {
    fields: { Name: 'Get Agent Run Tree' },
    collections: { Parameters: [{ fields: { Name: 'agentRunID', DetectionMethod: 'Manual' } }] },
    embeds: { ShipToAddressID: { fields: { City: 'Ames' } } },
    extension: { entity: 'Event Order Lines', fields: { Venue: 'Hall' } },
    primaryKey: { ID: 'q-1' },
  };
  const pulledWithoutAxes: RecordData = { fields: { Name: 'Get Agent Run Tree' }, primaryKey: { ID: 'q-1' } };

  it('keeps collections, embeds and extension the pull did not produce under merge', async () => {
    const result = await merge(declared, pulledWithoutAxes, 'merge');
    expect(result.collections).toEqual(declared.collections);
    expect(result.embeds).toEqual(declared.embeds);
    expect(result.extension).toEqual(declared.extension);
  });

  it('replaces a collection the pull produced under merge', async () => {
    const pulled: RecordData = {
      ...pulledWithoutAxes,
      collections: { Parameters: [{ fields: { Name: 'maxDepth', DetectionMethod: 'Manual' } }] },
    };
    const result = await merge(declared, pulled, 'merge');
    expect(result.collections?.Parameters.map((p) => p.fields.Name)).toEqual(['maxDepth']);
  });

  it('writes the pulled composition axes under overwrite', async () => {
    const pulled: RecordData = { ...declared, collections: { Parameters: [{ fields: { Name: 'maxDepth' } }] } };
    const result = await merge(declared, pulled, 'overwrite');
    expect(result.collections?.Parameters.map((p) => p.fields.Name)).toEqual(['maxDepth']);
    expect(result.embeds).toEqual(declared.embeds);
    expect(result.extension).toEqual(declared.extension);
  });

  it('emits no empty composition blocks', async () => {
    const result = await merge(pulledWithoutAxes, pulledWithoutAxes, 'merge');
    expect(result).not.toHaveProperty('collections');
    expect(result).not.toHaveProperty('embeds');
    expect(result).not.toHaveProperty('extension');
  });
});
