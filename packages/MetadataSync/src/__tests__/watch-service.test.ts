/**
 * WatchService over temp folders, with chokidar mocked: folder selection, pushWhen and the save path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { GenericDatabaseProvider, type SqlLoggingOptions } from '@memberjunction/generic-database-provider';
import { OptionalEnvSkipMessage } from '../lib/env-reference';

const { watchedPatterns, sqlLog } = vi.hoisted(() => ({
  watchedPatterns: [] as string[][],
  sqlLog: { options: undefined as SqlLoggingOptions | undefined, filePath: '' },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class MockMetadata {
    public static get Provider() {
      return {
        CreateSqlLogger: async (filePath: string, options?: SqlLoggingOptions) => {
          sqlLog.options = options;
          sqlLog.filePath = filePath;
          return { filePath, statementCount: 1, dispose: async () => undefined };
        },
      };
    }
    public EntityByName(): null {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

vi.mock('chokidar', () => {
  const watch = vi.fn((target: string | string[]) => {
    watchedPatterns.push(Array.isArray(target) ? target : [target]);
    const watcher = {
      on: vi.fn(() => watcher),
      close: vi.fn(async () => undefined),
    };
    return watcher;
  });
  return { default: { watch }, watch };
});

import chokidar from 'chokidar';
import { WatchService } from '../services/WatchService';
import { SyncEngine } from '../lib/sync-engine';
import { configManager } from '../lib/config-manager';

describe('WatchService — folder selection', () => {
  let root: string;
  let previousCwd: string;
  let warnings: string[];

  beforeEach(async () => {
    previousCwd = configManager.GetOriginalCwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-watch-'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', ignoreDirectories: ['scratch'] });
    await entityFolder('open', {});
    await entityFolder('gated', { pushWhen: '@env:MJ_WATCH_GATE' });
    await entityFolder('scratch', {});
    configManager.SetOriginalCwd(root);
    watchedPatterns.length = 0;
    warnings = [];
  });

  afterEach(async () => {
    configManager.SetOriginalCwd(previousCwd);
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  async function entityFolder(name: string, extra: Record<string, unknown>): Promise<void> {
    await fs.ensureDir(path.join(root, name));
    await fs.writeJson(path.join(root, name, '.mj-sync.json'), { entity: `Entity ${name}`, ...extra });
  }

  function watchedFolders(): string[] {
    // Each watch call gets the entity folder
    return watchedPatterns.map((patterns) => path.relative(root, patterns[0]).split(path.sep)[0]).sort();
  }

  async function watch(dir?: string) {
    const service = new WatchService(new SyncEngine({} as UserInfo));
    return service.Watch({ dir }, { onWarn: (m: string) => warnings.push(m) });
  }

  it('watches the folders push would push, without ignored or gated ones', async () => {
    const result = await watch();

    expect(watchedFolders()).toEqual(['open']);
    expect(warnings).toEqual(['⏭️  Skipped folder gated: MJ_WATCH_GATE is not set']);
    expect(result.SkippedDirectories).toEqual([{ Directory: path.join(root, 'gated'), Reason: 'MJ_WATCH_GATE is not set' }]);
    await result.stop();
  });

  it('watches a gated folder whose variable is true', async () => {
    vi.stubEnv('MJ_WATCH_GATE', 'true');

    const result = await watch();

    expect(watchedFolders()).toEqual(['gated', 'open']);
    expect(result.SkippedDirectories).toEqual([]);
    await result.stop();
  });

  it('throws when pushWhen skips every folder', async () => {
    await expect(watch('gated')).rejects.toThrow('No entity directories to watch: pushWhen skips every folder');
    expect(watchedPatterns).toHaveLength(0);
  });

  it('watches one entity folder given with dir', async () => {
    const result = await watch('open');

    expect(watchedFolders()).toEqual(['open']);
    await result.stop();
  });
});

const SECRET = 'super-secret-123';
const OLD_SECRET = 'old-secret-456';
const ID_VALUE = 'B0000000-0000-4000-8000-000000000001';
const WATCH_FIELDS = ['ID', 'Code', 'Name', 'Token'];

/** An entity with plain field properties (watch assigns them directly) and dirty tracking. */
class WatchEntity {
  public ID: string | null = null;
  public Code: string | null = null;
  public Name: string | null = null;
  public Token: string | null = null;
  public EntityInfo;
  public IsSaved = false;
  public LatestResult: { Message: string; Errors: string[] } | null = null;
  public SaveMessage: string | null = null;
  public SaveError: Error | null = null;
  private original: Record<string, unknown> = {};

  constructor(private readonly keyName: 'ID' | 'Code' = 'ID') {
    this.EntityInfo = {
      Name: 'MJ: Widgets',
      SchemaName: '__mj',
      BaseTable: 'Widget',
      spUpdateGenerated: true,
      PrimaryKeys: [{ Name: keyName }],
    };
  }

  Load(values: Record<string, string>): this {
    for (const [name, value] of Object.entries(values)) {
      Reflect.set(this, name, value);
    }
    this.original = { ...values };
    this.IsSaved = true;
    return this;
  }

  get PrimaryKey() {
    return { KeyValuePairs: [{ FieldName: this.keyName, Value: Reflect.get(this, this.keyName) }] };
  }

  NewRecord(): void {
    Reflect.set(this, this.keyName, 'generated-id');
    this.original = {};
    this.IsSaved = false;
  }

  /** Field names match without regard to case, as BaseEntity matches them. */
  Get(name: string): unknown {
    return Reflect.get(this, this.fieldName(name));
  }

  Set(name: string, value: unknown): void {
    Reflect.set(this, this.fieldName(name), value);
  }

  private fieldName(name: string): string {
    return WATCH_FIELDS.find((field) => field.toLowerCase() === name.toLowerCase()) ?? name;
  }

  get Dirty(): boolean {
    return Object.keys(this.GetChangesSinceLastSave()).length > 0;
  }

  GetChangesSinceLastSave(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const name of WATCH_FIELDS) {
      const value = Reflect.get(this, name);
      if (this.IsSaved ? (this.original[name] ?? null) !== value : value !== null) {
        changes[name] = value;
      }
    }
    return changes;
  }

  /** Finds a field without regard to case, as BaseEntity does; null for a name the entity does not have. */
  GetFieldByName(name: string) {
    const field = WATCH_FIELDS.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return field ? { Name: field, OldValue: this.original[field], EntityFieldInfo: { CodeName: field } } : null;
  }

  async Save(): Promise<boolean> {
    if (this.SaveError) {
      throw this.SaveError;
    }
    if (this.SaveMessage !== null) {
      this.LatestResult = { Message: this.SaveMessage, Errors: [] };
      return false;
    }
    this.original = { ID: this.ID, Code: this.Code, Name: this.Name, Token: this.Token };
    this.IsSaved = true;
    return true;
  }
}

/** A widget with a virtual TemplateText property that is not an entity field; Set routes it to the accessor. */
class TemplateWidget extends WatchEntity {
  private templateText: string | null = null;

  get TemplateText(): string | null {
    return this.templateText;
  }

  set TemplateText(value: string | null) {
    this.templateText = value;
  }

  override Set(name: string, value: unknown): void {
    if (name === 'TemplateText') {
      this.TemplateText = typeof value === 'string' ? value : null;
      return;
    }
    super.Set(name, value);
  }
}

describe('WatchService — save path', () => {
  let root: string;
  let widgets: string;
  let recordFile: string;
  let previousCwd: string;
  let syncEngine: SyncEngine;
  let service: WatchService;
  let output: string[];
  let warnings: string[];
  const entityConfig = { entity: 'MJ: Widgets' };

  beforeEach(async () => {
    vi.stubEnv('MJ_WATCH_TOKEN', SECRET);
    vi.stubEnv('MJ_WATCH_ID', ID_VALUE);
    previousCwd = configManager.GetOriginalCwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-watch-save-'));
    widgets = path.join(root, 'widgets');
    recordFile = path.join(widgets, '.w.json');
    await fs.ensureDir(widgets);
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', sqlLogging: { enabled: true } });
    await fs.writeJson(path.join(widgets, '.mj-sync.json'), entityConfig);
    configManager.SetOriginalCwd(root);
    syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue({ PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo);
    vi.spyOn(syncEngine, 'calculateChecksumWithFileContent').mockResolvedValue('sha256-x');
    service = new WatchService(syncEngine);
    output = [];
    warnings = [];
    sqlLog.options = undefined;
    sqlLog.filePath = '';
  });

  afterEach(async () => {
    configManager.SetOriginalCwd(previousCwd);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  const callbacks = () => ({ onLog: (m: string) => output.push(m), onWarn: (m: string) => warnings.push(m) });

  async function sync(record: Record<string, unknown>): Promise<void> {
    await fs.writeJson(recordFile, record);
    await service['syncJsonFile'](recordFile, widgets, entityConfig, callbacks());
  }

  it('loads by the resolved @env: key and masks the -v lines', async () => {
    const existing = new WatchEntity().Load({ ID: ID_VALUE, Name: 'Old', Token: OLD_SECRET });
    const load = vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: '@env:MJ_WATCH_ID' }, fields: { Name: 'New', Token: '@env:MJ_WATCH_TOKEN' } });

    expect(load).toHaveBeenCalledWith('MJ: Widgets', { ID: ID_VALUE });
    expect(existing.Token).toBe(SECRET);
    expect(output).toContain('   Primary Key: ID: <from @env:MJ_WATCH_ID>');
    expect(output).toContain('     Token: <hidden> → <from @env:MJ_WATCH_TOKEN>');
    expect(output).toContain('     Name: Old → New');
    const printed = output.join('\n');
    expect(printed).not.toContain(SECRET);
    expect(printed).not.toContain(OLD_SECRET);
    expect(printed).not.toContain(ID_VALUE);
    const written = await fs.readJson(recordFile);
    expect(written.primaryKey).toEqual({ ID: '@env:MJ_WATCH_ID' });
    expect(written.fields.Token).toBe('@env:MJ_WATCH_TOKEN');
  });

  it('creates a record with the resolved key and keeps @env: as the file key', async () => {
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const created = new WatchEntity();
    vi.spyOn(syncEngine, 'createEntityObject').mockResolvedValue(created as unknown as BaseEntity);

    await sync({ primaryKey: { ID: '@env:MJ_WATCH_ID' }, fields: { Name: 'New' } });

    expect(created.ID).toBe(ID_VALUE);
    expect((await fs.readJson(recordFile)).primaryKey).toEqual({ ID: '@env:MJ_WATCH_ID' });
  });

  it('ignores the change events of its own write-back, and syncs the next real change', async () => {
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    vi.spyOn(syncEngine, 'createEntityObject').mockResolvedValue(new WatchEntity() as unknown as BaseEntity);
    await sync({ primaryKey: { ID: '@env:MJ_WATCH_ID' }, fields: { Name: 'New' } });
    const syncFile = vi.spyOn(service as unknown as { syncJsonFile: () => Promise<void> }, 'syncJsonFile').mockResolvedValue(undefined);
    const fire = async () => {
      service['handleFileChange'](recordFile, 'changed', widgets, entityConfig, { debounceMs: 1 }, callbacks());
      await new Promise((resolve) => setTimeout(resolve, 30));
    };

    await fire();
    await fire();
    expect(syncFile).not.toHaveBeenCalled();

    const record = await fs.readJson(recordFile);
    await fs.writeJson(recordFile, { ...record, fields: { Name: 'Edited' } });
    await fire();
    expect(syncFile).toHaveBeenCalledTimes(1);
  });

  it('leaves out an unset ?optional field with a warning', async () => {
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New', Token: '@env:MJ_WATCH_MISSING?optional' } });

    expect(existing.Token).toBe(OLD_SECRET);
    expect(existing.Name).toBe('New');
    expect(warnings).toContain(OptionalEnvSkipMessage('MJ: Widgets', 'Token', 'MJ_WATCH_MISSING'));
  });

  it('warns about an unset ?optional default the record uses', async () => {
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { Token: '@env:MJ_WATCH_MISSING?optional' } });
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New' } });

    expect(existing.Token).toBe(OLD_SECRET);
    expect(warnings).toContain(OptionalEnvSkipMessage('MJ: Widgets', 'Token', 'MJ_WATCH_MISSING'));
  });

  it('does not fall back to a default for a skipped ?optional record field', async () => {
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { Token: '@env:MJ_WATCH_TOKEN' } });
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Token: '@env:MJ_WATCH_MISSING?optional' } });

    expect(existing.Token).toBe(OLD_SECRET);
    expect(output.some((line) => line.includes('Token:'))).toBe(false);
    expect(warnings).toContain(OptionalEnvSkipMessage('MJ: Widgets', 'Token', 'MJ_WATCH_MISSING'));
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('keeps an @env: key given in fields as the file key of a created record', async () => {
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const created = new WatchEntity();
    vi.spyOn(syncEngine, 'createEntityObject').mockResolvedValue(created as unknown as BaseEntity);

    await sync({ fields: { ID: '@env:MJ_WATCH_ID', Name: 'New' } });

    expect(created.ID).toBe(ID_VALUE);
    const written = await fs.readJson(recordFile);
    expect(written.primaryKey).toEqual({ ID: '@env:MJ_WATCH_ID' });
    expect(JSON.stringify(written)).not.toContain(ID_VALUE);
  });

  it('keeps an @env: key spelled in another case as the file key of a created record', async () => {
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const created = new WatchEntity();
    vi.spyOn(syncEngine, 'createEntityObject').mockResolvedValue(created as unknown as BaseEntity);

    await sync({ primaryKey: { id: '@env:MJ_WATCH_ID' }, fields: { Name: 'New' } });

    expect(created.ID).toBe(ID_VALUE);
    const written = await fs.readJson(recordFile);
    expect(written.primaryKey).toEqual({ ID: '@env:MJ_WATCH_ID' });
    expect(JSON.stringify(written)).not.toContain(ID_VALUE);
  });

  it('uses a key field that is not named ID', async () => {
    vi.mocked(syncEngine.getEntityInfo).mockReturnValue({ PrimaryKeys: [{ Name: 'Code' }] } as unknown as EntityInfo);
    const existing = new WatchEntity('Code').Load({ Code: ID_VALUE, Name: 'Old' });
    const load = vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { Code: '@env:MJ_WATCH_ID' }, fields: { Name: 'New' } });

    expect(load).toHaveBeenCalledWith('MJ: Widgets', { Code: ID_VALUE });
    expect(output).toContain('   Primary Key: Code: <from @env:MJ_WATCH_ID>');
    expect(output.join('\n')).not.toContain(ID_VALUE);
  });

  it('creates a record whose key is not named ID and keeps @env: as the file key', async () => {
    vi.mocked(syncEngine.getEntityInfo).mockReturnValue({ PrimaryKeys: [{ Name: 'Code' }] } as unknown as EntityInfo);
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const created = new WatchEntity('Code');
    vi.spyOn(syncEngine, 'createEntityObject').mockResolvedValue(created as unknown as BaseEntity);

    await sync({ primaryKey: { Code: '@env:MJ_WATCH_ID' }, fields: { Name: 'New' } });

    expect(created.Code).toBe(ID_VALUE);
    expect((await fs.readJson(recordFile)).primaryKey).toEqual({ Code: '@env:MJ_WATCH_ID' });
  });

  it('throws for a malformed @env: key and does not load with it', async () => {
    const load = vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);

    await expect(sync({ primaryKey: { ID: '@env:MJ_WATCH_ID?bogus' }, fields: {} })).rejects.toThrow(
      'Invalid @env reference: @env:MJ_WATCH_ID?bogus'
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('fails only the file whose key variable is not set, with a names-only message', async () => {
    const errors: Error[] = [];
    const fileCallbacks = { ...callbacks(), onError: (e: Error) => errors.push(e) };
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);
    const badFile = path.join(widgets, '.bad.json');
    await fs.writeJson(badFile, { primaryKey: { ID: '@env:MJ_WATCH_UNSET' }, fields: { Name: 'New' } });
    await fs.writeJson(recordFile, { primaryKey: { ID: 'w-1' }, fields: { Name: 'New' } });

    service['handleFileChange'](badFile, 'changed', widgets, entityConfig, { debounceMs: 1 }, fileCallbacks);
    service['handleFileChange'](recordFile, 'changed', widgets, entityConfig, { debounceMs: 1 }, fileCallbacks);
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
      expect(output).toContain('Successfully updated MJ: Widgets record');
    });

    expect(warnings).toContain(`Failed to sync ${badFile}: Environment variable not found: MJ_WATCH_UNSET`);
    expect(existing.Name).toBe('New');
  });

  it('masks variable values in a save failure', async () => {
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    existing.SaveMessage = `Duplicate value '${SECRET}'`;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    const error = await sync({ primaryKey: { ID: 'w-1' }, fields: { Token: '@env:MJ_WATCH_TOKEN' } }).catch((e: Error) => e);

    expect((error as Error).message).toBe("Failed to save record: Duplicate value '<from @env:MJ_WATCH_TOKEN>'");
  });

  it('masks variable values in the message and stack of a thrown save error', async () => {
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    existing.SaveError = new Error(`Connection failed near '${SECRET}'`);
    // V8 formats the stack on first read; reading it here puts the secret in the stack text
    expect(existing.SaveError.stack).toContain(SECRET);
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    const error = await sync({ primaryKey: { ID: 'w-1' }, fields: { Token: '@env:MJ_WATCH_TOKEN' } }).catch((e: Error) => e);

    expect((error as Error).message).toBe("Connection failed near '<from @env:MJ_WATCH_TOKEN>'");
    expect((error as Error).stack).toContain('<from @env:MJ_WATCH_TOKEN>');
    expect((error as Error).stack).not.toContain(SECRET);
  });

  it('registers an unchanged env field of an updated record, because watch logs the full row', async () => {
    const result = await service.Watch({}, callbacks());
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New', Token: '@env:MJ_WATCH_TOKEN' } });

    const hash = GenericDatabaseProvider.SaveCallVariableHash('__mj', 'Widget', ['w-1']);
    expect(sqlLog.options?.TransformStatement?.(`SET @Token_${hash} = N'${SECRET}'`)).toBe(
      '-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_WATCH_TOKEN'
    );
    await result.stop();
  });

  it('registers a field skipped for an unset ?optional variable, so its full-row SET line is left out', async () => {
    const result = await service.Watch({}, callbacks());
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New', token: '@env:MJ_WATCH_MISSING?optional' } });

    expect(existing.Token).toBe(OLD_SECRET);
    const hash = GenericDatabaseProvider.SaveCallVariableHash('__mj', 'Widget', ['w-1']);
    expect(sqlLog.options?.TransformStatement?.(`SET @Token_${hash} = N'${OLD_SECRET}'`)).toBe(
      '-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_WATCH_MISSING'
    );
    await result.stop();
  });

  it('registers a default skipped for an unset ?optional variable, so its full-row SET line is left out', async () => {
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { Token: '@env:MJ_WATCH_MISSING?optional' } });
    const result = await service.Watch({}, callbacks());
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New' } });

    const hash = GenericDatabaseProvider.SaveCallVariableHash('__mj', 'Widget', ['w-1']);
    expect(sqlLog.options?.TransformStatement?.(`SET @Token_${hash} = N'${OLD_SECRET}'`)).toBe(
      '-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_WATCH_MISSING'
    );
    await result.stop();
  });

  it('resolves and registers a record field spelled in another case, and leaves its SET line out', async () => {
    const result = await service.Watch({}, callbacks());
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { name: 'New', token: '@env:MJ_WATCH_TOKEN' } });

    expect(existing.Token).toBe(SECRET);
    expect(existing.Name).toBe('New');
    expect(output).toContain('     Token: <hidden> → <from @env:MJ_WATCH_TOKEN>');
    const hash = GenericDatabaseProvider.SaveCallVariableHash('__mj', 'Widget', ['w-1']);
    expect(sqlLog.options?.TransformStatement?.(`SET @Token_${hash} = N'${SECRET}'`)).toBe(
      '-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_WATCH_TOKEN'
    );
    expect(output.join('\n')).not.toContain(SECRET);
    expect((await fs.readJson(recordFile)).fields).toEqual({ name: 'New', token: '@env:MJ_WATCH_TOKEN' });
    await result.stop();
  });

  it('applies a default spelled in another case', async () => {
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { token: '@env:MJ_WATCH_TOKEN' } });
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New' } });

    expect(existing.Token).toBe(SECRET);
    expect(output).toContain('     Token: <hidden> → <from @env:MJ_WATCH_TOKEN>');
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('warns about an unset ?optional default spelled in another case', async () => {
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { token: '@env:MJ_WATCH_MISSING?optional' } });
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: OLD_SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New' } });

    expect(existing.Token).toBe(OLD_SECRET);
    expect(warnings).toContain(OptionalEnvSkipMessage('MJ: Widgets', 'Token', 'MJ_WATCH_MISSING'));
  });

  it('does not apply a default over a record field spelled in another case', async () => {
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { Name: 'From default' } });
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { name: 'From record' } });

    expect(existing.Name).toBe('From record');
  });

  it('sets a record field that is a virtual property of the entity, through Set', async () => {
    const existing = new TemplateWidget().Load({ ID: 'w-1', Name: 'Old' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { TemplateText: 'Hello {{name}}' } });

    expect(existing.TemplateText).toBe('Hello {{name}}');
  });

  it('applies a default that is a virtual property of the entity', async () => {
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { TemplateText: 'From default' } });
    const existing = new TemplateWidget().Load({ ID: 'w-1', Name: 'Old' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Name: 'New' } });

    expect(existing.TemplateText).toBe('From default');
  });

  it('does not register the fields of a save that writes nothing', async () => {
    const result = await service.Watch({}, callbacks());
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old', Token: SECRET });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Token: '@env:MJ_WATCH_TOKEN' } });
    await fs.outputFile(sqlLog.filePath, '');
    await result.stop();

    expect(output).toContain('No changes detected for MJ: Widgets record - skipped update');
    expect(warnings.filter((w) => w.includes('was not found'))).toEqual([]);
  });

  it('writes a lookup-sourced field into the SQL log as a subquery, and closes the rewriter when it stops', async () => {
    const result = await service.Watch({}, callbacks());
    expect(syncEngine.BeforeLookupCreateSaveSource).toBeTypeOf('function');
    vi.spyOn(syncEngine, 'ResolveLookup').mockResolvedValue('w-1');
    vi.spyOn(syncEngine, 'GetEntityInfo').mockReturnValue({
      Name: 'MJ: Widgets',
      SchemaName: '__mj',
      BaseTable: 'Widget',
      PrimaryKeys: [{ Name: 'ID' }],
      FirstPrimaryKey: { Name: 'ID' },
      ParentEntityFieldNames: new Set<string>(),
      Fields: [{ Name: 'Name', Type: 'nvarchar', NeedsQuotes: true, IsVirtual: false }],
    } as unknown as EntityInfo);
    const existing = new WatchEntity().Load({ ID: 'w-1', Name: 'Old' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(existing as unknown as BaseEntity);

    await sync({ primaryKey: { ID: 'w-1' }, fields: { Code: '@lookup:MJ: Widgets.Name=Old' } });

    const hash = GenericDatabaseProvider.SaveCallVariableHash('__mj', 'Widget', ['w-1']);
    expect(sqlLog.options?.TransformStatement?.(`SET @Code_${hash} = 'w-1'`)).toBe(
      `SET @Code_${hash} = (SELECT [ID] FROM [__mj].[Widget] WHERE [Name] = N'Old')`
    );
    await result.stop();
    expect(service['lookupSqlLog']).toBeNull();
    expect(syncEngine.BeforeLookupCreateSaveSource).toBeNull();
  });

  it('passes the .mj-sync.json schema placeholder rules to the watch log without turning on the Flyway escape', async () => {
    const rules = [{ schema: '__mj', placeholder: '${mjSchema}' }];
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', sqlLogging: { enabled: true, schemaPlaceholders: rules } });

    const result = await service.Watch({}, callbacks());

    expect(sqlLog.options?.schemaPlaceholders).toEqual(rules);
    expect(sqlLog.options?.escapeFlywaySyntax).toBe(false);
    await result.stop();
  });

  it('turns on the Flyway escape for a migration-formatted watch log, or when escapeFlywaySyntax is set', async () => {
    for (const sqlLogging of [{ enabled: true, formatAsMigration: true }, { enabled: true, escapeFlywaySyntax: true }]) {
      await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', sqlLogging });

      const result = await service.Watch({}, callbacks());

      expect(sqlLog.options?.escapeFlywaySyntax).toBe(true);
      await result.stop();
    }
  });

  it('closes the SQL log and the lookup-create hook when the start fails', async () => {
    const failingCallbacks = {
      onLog: (m: string) => {
        if (m.startsWith('Watching MJ: Widgets')) {
          throw new Error('start failed');
        }
      },
    };
    const start = service.Watch({}, failingCallbacks);
    await expect(start).rejects.toThrow('start failed');

    expect(syncEngine.BeforeLookupCreateSave).toBeNull();
    expect(service['sqlLoggingSession']).toBeNull();
    expect(service['envSqlLog']).toBeNull();
  });

  it('closes the SQL log and keeps the start error when a watcher fails to close', async () => {
    await fs.ensureDir(path.join(root, 'gadgets'));
    await fs.writeJson(path.join(root, 'gadgets', '.mj-sync.json'), { entity: 'MJ: Gadgets' });
    vi.mocked(chokidar.watch).mockImplementationOnce(() => {
      const watcher = { on: vi.fn(() => watcher), close: vi.fn(async () => Promise.reject(new Error('close failed'))) };
      return watcher as unknown as ReturnType<typeof chokidar.watch>;
    });
    const failingCallbacks = {
      onLog: (m: string) => {
        if (m.startsWith('Watching MJ: Widgets')) {
          throw new Error('start failed');
        }
      },
    };

    await expect(service.Watch({}, failingCallbacks)).rejects.toThrow('start failed');

    expect(syncEngine.BeforeLookupCreateSave).toBeNull();
    expect(service['sqlLoggingSession']).toBeNull();
    expect(service['envSqlLog']).toBeNull();
  });

  it('leaves env fields out of the SQL log and warns about an env key when it stops', async () => {
    const result = await service.Watch({}, callbacks());
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    vi.spyOn(syncEngine, 'createEntityObject').mockResolvedValue(new WatchEntity() as unknown as BaseEntity);

    await sync({ primaryKey: { ID: '@env:MJ_WATCH_ID' }, fields: { Token: '@env:MJ_WATCH_TOKEN' } });
    const transform = sqlLog.options?.TransformStatement;
    expect(transform).toBeTypeOf('function');
    const hash = GenericDatabaseProvider.SaveCallVariableHash('__mj', 'Widget', [ID_VALUE]);
    expect(transform?.(`SET @Token_${hash} = N'${SECRET}'`)).toBe(
      '-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_WATCH_TOKEN'
    );
    expect(syncEngine.BeforeLookupCreateSave).toBeTypeOf('function');
    // The written log is on disk when the watch stops
    await fs.outputFile(sqlLog.filePath, '');
    await result.stop();

    expect(output).toContain(`📝 SQL log written to: ${sqlLog.filePath}`);
    expect(warnings.some((w) => w.includes('MJ: Widgets.ID is a primary key from @env:MJ_WATCH_ID'))).toBe(true);
    expect(warnings.join('\n')).not.toContain(ID_VALUE);
    expect(syncEngine.BeforeLookupCreateSave).toBeNull();
  });

  it('gives no SQL log warnings when the log file is not there', async () => {
    const result = await service.Watch({}, callbacks());
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    vi.spyOn(syncEngine, 'createEntityObject').mockResolvedValue(new WatchEntity() as unknown as BaseEntity);

    await sync({ primaryKey: { ID: '@env:MJ_WATCH_ID' }, fields: { Token: '@env:MJ_WATCH_TOKEN' } });
    await result.stop();

    expect(warnings.filter((w) => w.startsWith('SQL log '))).toEqual([]);
    expect(output.some((line) => line.includes('SQL log written to'))).toBe(false);
    expect(syncEngine.BeforeLookupCreateSave).toBeNull();
  });
});
