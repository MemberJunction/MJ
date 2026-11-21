/**
 * PushService.processFlattenedRecord with a real SyncEngine (database calls stubbed): values that
 * come from `@env:` never reach the verbose diff, the change log or the save-failure output.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import type { RecordData, BatchContext, SyncResolutionCollector } from '../lib/sync-engine';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { PushOptions, PushCallbacks } from '../services/PushService';
import type { BaseEntity, UserInfo, EntityInfo } from '@memberjunction/core';
import type { SyncConfig } from '../config';

const SECRET = 'super-secret-123';
const OLD_SECRET = 'old-secret-456';
const VAR = 'MJ_PUSH_MASK_TEST';
const ID_VAR = 'MJ_PUSH_MASK_ID';
const OTHER_SECRET = 'other-secret-789';
const OTHER_VAR = 'MJ_PUSH_MASK_OTHER';
const LONG_ID = 'long-key-value-42';
const LONG_ID_VAR = 'MJ_PUSH_MASK_LONG_ID';

/** An Error whose stack text is already formatted, so it holds the original message. */
function errorWithFormattedStack(message: string): Error {
  const error = new Error(message);
  void error.stack;
  return error;
}

/**
 * Minimal entity with BaseEntity's dirty tracking and a configurable Save. Field names match
 * without regard to case, as in BaseEntity.
 */
class MockBaseEntity {
  public data: Record<string, unknown>;
  private original: Record<string, unknown>;
  public PrimaryKeys: { Name: string }[];
  public Fields: { Name: string }[];
  public EntityInfo: { Name: string; SchemaName: string; BaseTable: string; spUpdateGenerated: boolean; PrimaryKeys: { Name: string }[] };
  public LatestResult: { CompleteMessage: string; Errors: string[] } | null = null;
  public SaveBehavior: 'ok' | 'false' | 'throw' = 'ok';
  public SaveMessage = '';
  /** Thrown as is by Save when set, in place of an Error with SaveMessage. */
  public SaveThrowValue: string | Record<string, string> | null = null;
  public DeleteBehavior: 'ok' | 'false' | 'throw' = 'ok';
  public SkipEmbeddings = false;
  /** Written to the key field by Save when set, as a database-assigned key. */
  public SavedKey: string | null = null;
  public ISAChild: object | null = null;
  private keyName: string;

  constructor(initialData: Record<string, unknown> = {}, keyName = 'ID') {
    this.keyName = keyName;
    this.PrimaryKeys = [{ Name: keyName }];
    this.EntityInfo = { Name: 'TestEntity', SchemaName: 'dbo', BaseTable: 'TestEntity', spUpdateGenerated: true, PrimaryKeys: this.PrimaryKeys };
    this.Fields = [{ Name: keyName }, { Name: 'Name' }, { Name: 'Description' }, { Name: 'Config' }];
    this.data = { ...initialData };
    this.original = { ...initialData };
  }

  get Dirty(): boolean {
    return Object.keys(this.GetChangesSinceLastSave()).length > 0;
  }

  get PrimaryKey(): { KeyValuePairs: { FieldName: string; Value: unknown }[] } {
    return { KeyValuePairs: this.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: this.data[pk.Name] })) };
  }

  get IsSaved(): boolean {
    return Object.keys(this.original).length > 0;
  }

  Get(fieldName: string): unknown {
    return this.data[this.canonical(fieldName)];
  }

  Set(fieldName: string, value: unknown): void {
    this.data[this.canonical(fieldName)] = value;
  }

  GetFieldByName(fieldName: string) {
    const name = this.canonical(fieldName);
    return { Name: name, OldValue: this.original[name], EntityFieldInfo: { Type: 'nvarchar', CodeName: name } };
  }

  GetChangesSinceLastSave(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.data)) {
      if (this.original[k] !== v) changes[k] = v;
    }
    return changes;
  }

  NewRecord(): void {
    this.data = { [this.keyName]: 'new-generated-id' };
    this.original = {};
  }

  GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  async EnsureISAChild(): Promise<object | null> {
    return this.ISAChild;
  }

  async Delete(): Promise<boolean> {
    if (this.DeleteBehavior === 'throw') {
      throw errorWithFormattedStack(this.SaveMessage);
    }
    if (this.DeleteBehavior === 'false') {
      this.LatestResult = { CompleteMessage: this.SaveMessage, Errors: [this.SaveMessage] };
      return false;
    }
    return true;
  }

  async Save(): Promise<boolean> {
    if (this.SaveBehavior === 'throw') {
      if (this.SaveThrowValue !== null) {
        throw this.SaveThrowValue;
      }
      throw errorWithFormattedStack(this.SaveMessage);
    }
    if (this.SaveBehavior === 'false') {
      this.LatestResult = { CompleteMessage: this.SaveMessage, Errors: [] };
      return false;
    }
    if (this.SavedKey !== null) {
      this.data[this.keyName] = this.SavedKey;
    }
    this.original = { ...this.data };
    return true;
  }

  /** The entity's spelling of a field name. */
  private canonical(fieldName: string): string {
    return this.Fields.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase())?.Name ?? fieldName;
  }
}

let mockEntityInstance: MockBaseEntity;
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    /** Host provider for the push graph pool; no transaction is open. */
    public static get Provider(): { TransactionDepth: number; GetEntityObject: () => Promise<MockBaseEntity> } {
      return { TransactionDepth: 0, GetEntityObject: async () => mockEntityInstance };
    }
    public async GetEntityObject(): Promise<MockBaseEntity> {
      return mockEntityInstance;
    }
    public EntityByName(): EntityInfo | null {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';
import { EnvDisplayMask } from '../lib/env-display';
import { EnvSqlLog, EnvSqlRedactor } from '../lib/env-sql-redactor';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { FileBackupManager } from '../lib/file-backup-manager';
import { OptionalEnvSkipMessage } from '../lib/env-reference';

function entityInfoWithKey(keyName: string): EntityInfo {
  return {
    Name: 'TestEntity',
    PrimaryKeys: [{ Name: keyName }],
    Fields: [{ Name: keyName }, { Name: 'Name' }, { Name: 'Description' }, { Name: 'Config' }],
  } as unknown as EntityInfo;
}

const entityInfo = entityInfoWithKey('ID');

class TestablePushService extends PushService {
  public async process(flattenedRecord: FlattenedRecord, options: PushOptions, callbacks: PushCallbacks) {
    const batchContext: BatchContext = new Map();
    return this.processFlattenedRecord(flattenedRecord, '/dummy/dir', options, batchContext, callbacks);
  }
}

/** A child record of `parentId`, flattened as push sees it. */
function flattenChild(record: RecordData, parentId: string): FlattenedRecord {
  return {
    ...flatten(record),
    id: 'child-1',
    path: 'TestEntity[0].Children[0]',
    depth: 1,
    parentContext: { entityName: 'TestEntity', record: { fields: {} }, recordIndex: 0 },
    dependencies: new Set([parentId]),
  };
}

function flatten(record: RecordData): FlattenedRecord {
  return {
    id: 'rec-1',
    record,
    entityName: 'TestEntity',
    depth: 0,
    path: 'TestEntity[0]',
    dependencies: new Set(),
    originalIndex: 0,
    graphId: 'graph-1',
  };
}

describe('push masks values that come from @env:', () => {
  let service: TestablePushService;
  let syncEngine: SyncEngine;
  let output: string[];
  let callbacks: PushCallbacks;

  beforeEach(() => {
    vi.stubEnv(VAR, SECRET);
    vi.stubEnv(ID_VAR, '1');
    syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
    vi.spyOn(syncEngine, 'calculateChecksumWithFileContent').mockResolvedValue('sha256-x');
    vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({});
    service = new TestablePushService(syncEngine, {} as UserInfo);
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: OLD_SECRET, Config: '{}' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    output = [];
    const collect = (m: string) => output.push(m);
    callbacks = { onLog: collect, onWarn: collect, onError: collect, onRecordError: (d) => output.push(JSON.stringify(d)) };
    vi.spyOn(console, 'error').mockImplementation((m: unknown) => {
      output.push(String(m));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function changeDetails() {
    return service['changeDetails'];
  }

  it('masks the verbose diff and the change log, and shows other fields as before', async () => {
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name', Description: `@env:${VAR}` } };

    const result = await service.process(flatten(record), { verbose: true }, callbacks);

    expect(result.status).toBe('updated');
    expect(output).toContain(`     Description: <hidden> → <from @env:${VAR}>`);
    expect(output).toContain('     Name: "Old Name" → "New Name"');
    expect(changeDetails()[0].fields).toContainEqual({ field: 'Description', oldValue: '<hidden>', newValue: `<from @env:${VAR}>` });
    expect(JSON.stringify(changeDetails())).not.toContain(SECRET);
    expect(output.join('\n')).not.toContain(SECRET);
    expect(output.join('\n')).not.toContain(OLD_SECRET);
  });

  it('masks a JSON field that holds a nested @env: reference', async () => {
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Config: { auth: { key: `@env:${VAR}` } } } };

    await service.process(flatten(record), { verbose: true }, callbacks);

    expect(changeDetails()[0].fields).toContainEqual({ field: 'Config', oldValue: '<hidden>', newValue: `<from @env:${VAR}>` });
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('masks an env-sourced primary key in the change log', async () => {
    const record: RecordData = { primaryKey: { ID: `@env:${ID_VAR}` }, fields: { Name: 'New Name' } };

    await service.process(flatten(record), { verbose: true }, callbacks);

    expect(changeDetails()[0].primaryKey).toBe(`ID: <from @env:${ID_VAR}>`);
    expect(output).toContain(`   Primary Key: ID: <from @env:${ID_VAR}>`);
  });

  it('masks the save-exception dump and the error it throws', async () => {
    mockEntityInstance.SaveBehavior = 'throw';
    mockEntityInstance.SaveMessage = `Violation of constraint, value '${SECRET}'`;
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Description: `@env:${VAR}` } };

    const error = await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(SECRET);
    expect(output).toContain(`     Description: <from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('masks the save-returned-false dump, the record error and the thrown error', async () => {
    mockEntityInstance.SaveBehavior = 'false';
    mockEntityInstance.SaveMessage = `Cannot insert '${SECRET}'`;
    const record: RecordData = { primaryKey: { ID: `@env:${ID_VAR}` }, fields: { Description: `@env:${VAR}` } };

    const error = await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect((error as Error).message).not.toContain(SECRET);
    expect(output).toContain(`     - Description=<from @env:${VAR}>`);
    expect(output).toContain(`   Primary Key: {ID=<from @env:${ID_VAR}>}`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('masks a field whose file key differs in case from the entity field name', async () => {
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { description: `@env:${VAR}` } };

    await service.process(flatten(record), { verbose: true }, callbacks);

    expect(changeDetails()[0].fields).toContainEqual({ field: 'Description', oldValue: '<hidden>', newValue: `<from @env:${VAR}>` });
    expect(output).toContain(`     Description: <hidden> → <from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
    expect(output.join('\n')).not.toContain(OLD_SECRET);
  });

  it('masks a lowercase file key in the save-failure dumps', async () => {
    mockEntityInstance.SaveBehavior = 'false';
    mockEntityInstance.SaveMessage = 'Save failed';
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { description: `@env:${VAR}` } };

    await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(output).toContain(`     Description: <from @env:${VAR}>`);
    expect(output).toContain(`     - description=<from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('masks an env-sourced default in the diff', async () => {
    vi.spyOn(syncEngine, 'buildDefaults').mockImplementation(async (_path, _config, collector) => {
      collector?.EnvFields?.set('Description', new Set([VAR]));
      return { Description: SECRET };
    });
    Object.defineProperty(mockEntityInstance, 'Description', { value: undefined, configurable: true });
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    const result = await service['processFlattenedRecord'](
      flatten(record),
      '/dummy/dir',
      { verbose: true },
      new Map(),
      callbacks,
      { entity: 'TestEntity', defaults: { Description: `@env:${VAR}` } }
    );

    expect(result.status).toBe('updated');
    expect(output).toContain(`     Description: <hidden> → <from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
    expect(output.join('\n')).not.toContain(OLD_SECRET);
  });

  it('does not label a record field in another case when a default for that field is env-sourced', async () => {
    vi.spyOn(syncEngine, 'buildDefaults').mockImplementation(async (_path, _config, collector) => {
      collector?.EnvFields?.set('description', new Set([VAR]));
      return { description: SECRET };
    });
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Description: 'Literal text' } };

    const result = await service['processFlattenedRecord'](flatten(record), '/dummy/dir', { verbose: true }, new Map(), callbacks, { entity: 'TestEntity' });

    expect(result.status).toBe('updated');
    expect(mockEntityInstance.Get('Description')).toBe('Literal text');
    expect(output).toContain(`     Description: "${OLD_SECRET}" → "Literal text"`);
    expect(output.join('\n')).not.toContain(`<from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('labels the record by its real key field when the key is not ID', async () => {
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfoWithKey('Code'));
    mockEntityInstance = new MockBaseEntity({ Code: SECRET, Name: 'Old Name', Description: 'plain' }, 'Code');
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    mockEntityInstance.SaveBehavior = 'throw';
    mockEntityInstance.SaveMessage = 'Save failed';
    const record: RecordData = { primaryKey: { Code: `@env:${VAR}` }, fields: { Description: 'changed' } };

    await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(output).toContain(`   Record ID: <from @env:${VAR}>`);
    expect(output).toContain(`     Code: <from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('labels an env-sourced record name', async () => {
    mockEntityInstance.SaveBehavior = 'false';
    mockEntityInstance.SaveMessage = 'Save failed';
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: `@env:${VAR}` } };

    await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(output).toContain(`   Record Name: <from @env:${VAR}>`);
    expect(output).toContain('   Record ID: 1');
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('masks the value of any variable push resolved in the database error text', async () => {
    // A composition child field resolves into its own collector; the engine still knows the variable
    vi.stubEnv(OTHER_VAR, OTHER_SECRET);
    syncEngine.ResolvedEnvVariables.add(OTHER_VAR);
    mockEntityInstance.SaveBehavior = 'false';
    mockEntityInstance.SaveMessage = `Cannot insert '${OTHER_SECRET}' into child`;
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    const error = await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect((error as Error).message).toContain(`<from @env:${OTHER_VAR}>`);
    expect(output.join('\n')).not.toContain(OTHER_SECRET);
  });

  it('masks an extension field that writes an owner field', async () => {
    const owner = mockEntityInstance;
    owner.ISAChild = {
      EntityInfo: { Name: 'TestSubEntity' },
      Set: (fieldName: string, value: unknown) => owner.Set(fieldName, value),
    };
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: {},
      extension: { fields: { Description: `@env:${VAR}` } },
    };

    await service.process(flatten(record), { verbose: true }, callbacks);

    expect(owner.Get('Description')).toBe(SECRET);
    expect(output).toContain(`     Description: <hidden> → <from @env:${VAR}>`);
    expect(changeDetails()[0].fields).toContainEqual({ field: 'Description', oldValue: '<hidden>', newValue: `<from @env:${VAR}>` });
    expect(output.join('\n')).not.toContain(SECRET);
    expect(output.join('\n')).not.toContain(OLD_SECRET);
  });

  it('masks the stack of the save exception', async () => {
    mockEntityInstance.SaveBehavior = 'throw';
    mockEntityInstance.SaveMessage = `Violation, value '${SECRET}'`;
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Description: `@env:${VAR}` } };

    const error = await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect((error as Error).stack).toBeDefined();
    expect((error as Error).stack).not.toContain(SECRET);
    expect((error as Error).stack).toContain(`<from @env:${VAR}>`);
  });

  it('wraps a thrown value that is not an Error in an Error with a masked message', async () => {
    mockEntityInstance.SaveBehavior = 'throw';
    mockEntityInstance.SaveThrowValue = `raw failure '${SECRET}'`;
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Description: `@env:${VAR}` } };

    const error = await service.process(flatten(record), {}, callbacks).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`raw failure '<from @env:${VAR}>'`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('wraps a thrown plain object with its JSON text, masked', async () => {
    mockEntityInstance.SaveBehavior = 'throw';
    mockEntityInstance.SaveThrowValue = { reason: `bad '${SECRET}'` };
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Description: `@env:${VAR}` } };

    const error = await service.process(flatten(record), {}, callbacks).catch((e: unknown) => e);

    expect((error as Error).message).toBe(`{"reason":"bad '<from @env:${VAR}>'"}`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('masks the Additional Details of a save that returned false', async () => {
    mockEntityInstance.SaveBehavior = 'false';
    mockEntityInstance.SaveMessage = 'Save failed';
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Description: `@env:${VAR}` } };
    vi.spyOn(mockEntityInstance, 'Save').mockImplementation(async () => {
      mockEntityInstance.LatestResult = { CompleteMessage: 'Save failed', Errors: [`bad value '${SECRET}'`] };
      return false;
    });

    await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(output).toContain(`   Additional Details: bad value '<from @env:${VAR}>'`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('labels a long env-sourced key on the save-returned-false Record ID line', async () => {
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    mockEntityInstance = new MockBaseEntity({ ID: LONG_ID, Name: 'Old Name', Description: 'plain' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    mockEntityInstance.SaveBehavior = 'false';
    mockEntityInstance.SaveMessage = `Cannot update '${LONG_ID}'`;
    const record: RecordData = { primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: { Description: 'changed' } };

    await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(output).toContain(`   Record ID: <from @env:${LONG_ID_VAR}>`);
    expect(output).toContain(`   Database Error: Cannot update '<from @env:${LONG_ID_VAR}>'`);
    expect(output.join('\n')).not.toContain(LONG_ID);
  });

  it('labels an env-sourced record name on the save-exception path', async () => {
    mockEntityInstance.SaveBehavior = 'throw';
    mockEntityInstance.SaveMessage = 'Save failed';
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: `@env:${VAR}` } };

    await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(output).toContain(`   Record Name: <from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('masks a variable that only the engine resolved in the save-exception text', async () => {
    vi.stubEnv(OTHER_VAR, OTHER_SECRET);
    syncEngine.ResolvedEnvVariables.add(OTHER_VAR);
    mockEntityInstance.SaveBehavior = 'throw';
    mockEntityInstance.SaveMessage = `Child insert failed '${OTHER_SECRET}'`;
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    const error = await service.process(flatten(record), {}, callbacks).catch((e: Error) => e);

    expect(output).toContain(`   Error: Child insert failed '<from @env:${OTHER_VAR}>'`);
    expect((error as Error).message).not.toContain(OTHER_SECRET);
    expect(output.join('\n')).not.toContain(OTHER_SECRET);
  });

  it('labels each field of a composite key', () => {
    mockEntityInstance.PrimaryKeys = [{ Name: 'ID' }, { Name: 'Name' }];
    const mask = new EnvDisplayMask(new Map([['ID', new Set([ID_VAR])]]));

    const label = service['recordIdLabel'](mockEntityInstance as unknown as BaseEntity, mask);

    expect(label).toBe(`ID=<from @env:${ID_VAR}>, Name=Old Name`);
  });

  it('prints the env-sourced key as a label when the record is not found', async () => {
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const record: RecordData = { primaryKey: { ID: `@env:${ID_VAR}` }, fields: { Name: 'New Name' } };

    const result = await service.process(flatten(record), {}, callbacks);

    expect(result.status).toBe('error');
    expect(output.some((m) => m.startsWith(`Record not found: TestEntity with primaryKey {ID=<from @env:${ID_VAR}>}`))).toBe(true);
    expect(output.some((m) => m.includes(`"primaryKey":"ID=<from @env:${ID_VAR}>"`))).toBe(true);
    expect(output.join('\n')).not.toContain('ID=1');
  });

  it('creates a missing record, prints labels and keeps @env: as the file key', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const record: RecordData = { primaryKey: { ID: `@env:${ID_VAR}` }, fields: { Name: 'New Name' } };

    const result = await service.process(flatten(record), { verbose: true }, callbacks);

    expect(result.status).toBe('created');
    expect(output).toContain(`📝 Creating missing TestEntity record with primaryKey {ID=<from @env:${ID_VAR}>}`);
    expect(record.primaryKey).toEqual({ ID: `@env:${ID_VAR}` });
    expect(changeDetails()[changeDetails().length - 1]).toEqual({ entityName: 'TestEntity', primaryKey: `ID: <from @env:${ID_VAR}>`, Operation: 'created', fields: [] });
  });

  it('writes the saved key back for a literal key and for a record with no key', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const literal: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };
    await service.process(flatten(literal), {}, callbacks);
    expect(literal.primaryKey).toEqual({ ID: '1' });

    mockEntityInstance = new MockBaseEntity({});
    const keyless: RecordData = { fields: { Name: 'Another' } };
    await service.process(flatten(keyless), {}, callbacks);
    expect(keyless.primaryKey).toEqual({ ID: 'new-generated-id' });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe('ID: new-generated-id');
  });

  it('prints the env-sourced key as a label in a dry-run create', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const record: RecordData = { primaryKey: { ID: `@env:${ID_VAR}` }, fields: { Name: 'New Name' } };

    await service.process(flatten(record), { dryRun: true }, callbacks);

    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`ID: <from @env:${ID_VAR}>`);
  });

  it('keeps @env: for a non-ID key spelled in another case, and labels it in every key line', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfoWithKey('Code'));
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    mockEntityInstance = new MockBaseEntity({}, 'Code');
    const record: RecordData = { primaryKey: { code: `@env:${VAR}` }, fields: { Name: 'New Name' } };

    const result = await service.process(flatten(record), { verbose: true }, callbacks);

    expect(result.status).toBe('created');
    expect(output).toContain(`📝 Creating missing TestEntity record with primaryKey {code=<from @env:${VAR}>}`);
    expect(record.primaryKey).toEqual({ Code: `@env:${VAR}` });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`Code: <from @env:${VAR}>`);
    expect(output.join('\n')).not.toContain(SECRET);
    expect(JSON.stringify(changeDetails())).not.toContain(SECRET);
  });

  it('labels a non-ID key spelled in another case in a dry-run create', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfoWithKey('Code'));
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    mockEntityInstance = new MockBaseEntity({}, 'Code');
    const record: RecordData = { primaryKey: { code: `@env:${VAR}` }, fields: { Name: 'New Name' } };

    await service.process(flatten(record), { dryRun: true }, callbacks);

    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`Code: <from @env:${VAR}>`);
    expect(JSON.stringify(changeDetails())).not.toContain(SECRET);
  });

  it('keeps @env: only for the env-sourced part of a composite key', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    const compositeInfo = { ...entityInfoWithKey('Code'), PrimaryKeys: [{ Name: 'Code' }, { Name: 'Name' }] } as unknown as EntityInfo;
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(compositeInfo);
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    mockEntityInstance = new MockBaseEntity({}, 'Code');
    mockEntityInstance.PrimaryKeys = [{ Name: 'Code' }, { Name: 'Name' }];
    const record: RecordData = { primaryKey: { Code: `@env:${VAR}`, Name: 'Alpha' }, fields: { Description: 'plain' } };

    const result = await service.process(flatten(record), { verbose: true }, callbacks);

    expect(result.status).toBe('created');
    expect(output).toContain(`📝 Creating missing TestEntity record with primaryKey {Code=<from @env:${VAR}>, Name=Alpha}`);
    expect(record.primaryKey).toEqual({ Code: `@env:${VAR}`, Name: 'Alpha' });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`Code: <from @env:${VAR}>, Name: Alpha`);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('labels a composite key with one env-sourced part when the record is not found', async () => {
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const record: RecordData = { primaryKey: { Code: `@env:${VAR}`, Name: 'Alpha' }, fields: { Description: 'plain' } };

    await service.process(flatten(record), {}, callbacks);

    expect(output.some((m) => m.startsWith(`Record not found: TestEntity with primaryKey {Code=<from @env:${VAR}>, Name=Alpha}`))).toBe(true);
    expect(output.join('\n')).not.toContain(SECRET);
  });

  it('finds a created env-keyed record again on a deferred retry and labels its key', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    const loadEntity = vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const flattened = flatten({ primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: { Name: 'New Name' } });
    await service.process(flattened, {}, callbacks);
    expect(flattened.record.primaryKey).toEqual({ ID: `@env:${LONG_ID_VAR}` });

    mockEntityInstance = new MockBaseEntity({ ID: LONG_ID, Name: 'New Name' });
    loadEntity.mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    service['deferredRecords'] = [{ flattenedRecord: flattened, entityDir: '/dummy/dir', entityConfig: { entity: 'TestEntity' } }];
    const result = await service['processDeferredRecords']({}, callbacks);

    expect(result.errors).toBe(0);
    expect(loadEntity).toHaveBeenLastCalledWith('TestEntity', { ID: LONG_ID }, undefined);
    expect(output).toContain(`   - TestEntity (ID=<from @env:${LONG_ID_VAR}>) - unchanged`);
    expect(output.join('\n')).not.toContain(LONG_ID);
  });

  it('resolves an env key in the incremental shortcut, so a child copies the value through @parent:', async () => {
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    const batchContext: BatchContext = new Map();
    const parent = flatten({ primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: { Name: 'Parent' }, sync: { checksum: 'sha256-x', lastModified: '2026-01-01T00:00:00.000Z' } });
    const parentResult = await service['processFlattenedRecord'](parent, '/dummy/dir', { incremental: true }, batchContext, callbacks);
    expect(parentResult.status).toBe('unchanged');
    batchContext.set(parentResult.batchContextEntry!.key, parentResult.batchContextEntry!.entity);

    mockEntityInstance = new MockBaseEntity({});
    const child = flattenChild({ fields: { Name: 'Child', Description: '@parent:ID' } }, parent.id);
    const result = await service['processFlattenedRecord'](child, '/dummy/dir', { incremental: true, verbose: true }, batchContext, callbacks);

    expect(result.status).toBe('created');
    expect(mockEntityInstance.Get('Description')).toBe(LONG_ID);
    expect(output.join('\n')).not.toContain(LONG_ID);
    expect(JSON.stringify(changeDetails())).not.toContain(LONG_ID);
  });

  it('keeps a @lookup: key whose result equals an env value as the file key, and prints no value', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    await service.process(flatten({ primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: { Name: 'Record A' } }), {}, callbacks);

    mockEntityInstance = new MockBaseEntity({});
    vi.spyOn(syncEngine, 'ResolveLookup').mockResolvedValue(LONG_ID);
    const record: RecordData = { primaryKey: { ID: '@lookup:Other.Name=Foo' }, fields: { Name: 'Record B' } };
    const result = await service.process(flatten(record), { verbose: true }, callbacks);

    expect(result.status).toBe('created');
    expect(record.primaryKey).toEqual({ ID: '@lookup:Other.Name=Foo' });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`ID: <from @env:${LONG_ID_VAR}>`);
    expect(output.join('\n')).not.toContain(LONG_ID);
    expect(JSON.stringify(changeDetails())).not.toContain(LONG_ID);
  });

  it('leaves a @lookup: key raw in the incremental shortcut, with no lookup query', async () => {
    const resolveLookup = vi.spyOn(syncEngine, 'ResolveLookup');
    const record: RecordData = { primaryKey: { ID: '@lookup:Other.Name=Alpha' }, fields: { Name: 'Parent' }, sync: { checksum: 'sha256-x', lastModified: '2026-01-01T00:00:00.000Z' } };

    const result = await service['processFlattenedRecord'](flatten(record), '/dummy/dir', { incremental: true }, new Map(), callbacks);

    expect(result.status).toBe('unchanged');
    expect(resolveLookup).not.toHaveBeenCalled();
    expect(result.batchContextEntry!.entity.Get('ID')).toBe('@lookup:Other.Name=Alpha');
  });

  it('gives a child the parent key value in the shortcut when fields still holds the @env: key', async () => {
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    const batchContext: BatchContext = new Map();
    const parent = flatten({
      primaryKey: { ID: LONG_ID },
      fields: { ID: `@env:${LONG_ID_VAR}`, Name: 'Parent' },
      sync: { checksum: 'sha256-x', lastModified: '2026-01-01T00:00:00.000Z' },
    });
    const parentResult = await service['processFlattenedRecord'](parent, '/dummy/dir', { incremental: true }, batchContext, callbacks);
    expect(parentResult.status).toBe('unchanged');
    batchContext.set(parentResult.batchContextEntry!.key, parentResult.batchContextEntry!.entity);

    mockEntityInstance = new MockBaseEntity({});
    const child = flattenChild({ fields: { Name: 'Child', Description: '@parent:ID' } }, parent.id);
    await service['processFlattenedRecord'](child, '/dummy/dir', { incremental: true }, batchContext, callbacks);

    expect(mockEntityInstance.Get('Description')).toBe(LONG_ID);
  });

  it('keeps @env: for a key given in fields, and a deferred retry prints no value', async () => {
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    mockEntityInstance = new MockBaseEntity({});
    const loadEntity = vi.spyOn(syncEngine, 'loadEntity');
    const flattened = flatten({ fields: { ID: `@env:${LONG_ID_VAR}`, Name: 'New Name' } });

    const result = await service.process(flattened, {}, callbacks);

    expect(result.status).toBe('created');
    expect(flattened.record.primaryKey).toEqual({ ID: `@env:${LONG_ID_VAR}` });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`ID: <from @env:${LONG_ID_VAR}>`);

    mockEntityInstance = new MockBaseEntity({ ID: LONG_ID, Name: 'New Name' });
    loadEntity.mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    service['deferredRecords'] = [{ flattenedRecord: flattened, entityDir: '/dummy/dir', entityConfig: { entity: 'TestEntity' } }];
    await service['processDeferredRecords']({}, callbacks);

    expect(loadEntity).toHaveBeenLastCalledWith('TestEntity', { ID: LONG_ID }, undefined);
    expect(output).toContain(`   - TestEntity (ID=<from @env:${LONG_ID_VAR}>) - unchanged`);
    expect(output.join('\n')).not.toContain(LONG_ID);
  });

  it('keeps a child key @parent:ID when the parent key is env-sourced, and writes the value otherwise', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    syncEngine.ResolvedEnvVariables.add(LONG_ID_VAR);
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);

    const envParent: BatchContext = new Map([['parent-1', new MockBaseEntity({ ID: LONG_ID }) as unknown as BaseEntity]]);
    mockEntityInstance = new MockBaseEntity({});
    const envChild = flattenChild({ primaryKey: { ID: '@parent:ID' }, fields: { Name: 'Child' } }, 'parent-1');
    await service['processFlattenedRecord'](envChild, '/dummy/dir', {}, envParent, callbacks);
    expect(envChild.record.primaryKey).toEqual({ ID: '@parent:ID' });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`ID: <from @env:${LONG_ID_VAR}>`);

    const plainParent: BatchContext = new Map([['parent-1', new MockBaseEntity({ ID: 'plain-parent-id' }) as unknown as BaseEntity]]);
    mockEntityInstance = new MockBaseEntity({});
    const plainChild = flattenChild({ primaryKey: { ID: '@parent:ID' }, fields: { Name: 'Child' } }, 'parent-1');
    await service['processFlattenedRecord'](plainChild, '/dummy/dir', {}, plainParent, callbacks);
    expect(plainChild.record.primaryKey).toEqual({ ID: 'plain-parent-id' });
    expect(output.join('\n')).not.toContain(LONG_ID);
  });

  it('labels a key given in fields with another case in a dry-run create', async () => {
    mockEntityInstance = new MockBaseEntity({});
    const record: RecordData = { fields: { id: `@env:${ID_VAR}`, Name: 'New Name' } };

    await service.process(flatten(record), { dryRun: true }, callbacks);

    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`ID: <from @env:${ID_VAR}>`);
  });

  it('writes a database-assigned key back in place of the @env: reference', async () => {
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    mockEntityInstance.SavedKey = 'db-assigned-7';
    const record: RecordData = { primaryKey: { ID: `@env:${ID_VAR}` }, fields: { Name: 'New Name' } };

    await service.process(flatten(record), {}, callbacks);

    expect(record.primaryKey).toEqual({ ID: 'db-assigned-7' });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe('ID: db-assigned-7');
  });

  it('keeps the @env: reference when a UUID key is saved in another case', async () => {
    const uuid = 'A1B2C3D4-0000-4000-8000-00000000ABCD';
    vi.stubEnv(LONG_ID_VAR, uuid);
    service['syncConfig'] = { version: '1.0', push: { autoCreateMissingRecords: true } } as SyncConfig;
    const uuidInfo = { ...entityInfo, PrimaryKeys: [{ Name: 'ID', IsUniqueIdentifier: true }] } as unknown as EntityInfo;
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(uuidInfo);
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    mockEntityInstance.SavedKey = uuid.toLowerCase();
    const record: RecordData = { primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: { Name: 'New Name' } };

    await service.process(flatten(record), {}, callbacks);

    expect(record.primaryKey).toEqual({ ID: `@env:${LONG_ID_VAR}` });
    expect(changeDetails()[changeDetails().length - 1].primaryKey).toBe(`ID: <from @env:${LONG_ID_VAR}>`);
    expect(JSON.stringify(changeDetails()).toLowerCase()).not.toContain(uuid.toLowerCase());
  });

  describe('delete path', () => {
    function deleteRecord(fields: Record<string, unknown>): FlattenedRecord {
      return flatten({ primaryKey: { ID: '1' }, fields, deleteRecord: { delete: true } });
    }

    beforeEach(() => {
      vi.stubEnv(OTHER_VAR, OTHER_SECRET);
      syncEngine.ResolvedEnvVariables.add(OTHER_VAR);
      // A delete reads the row through the push transaction, not the preload cache (#4935)
      vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    });

    it('hides the record name when the file Name is an @env: reference', async () => {
      mockEntityInstance.Set('Name', SECRET);

      await service['processDeleteRecord'](deleteRecord({ Name: `@env:${VAR}` }), '/dummy/dir', { verbose: true }, callbacks);

      expect(output).toContain('   Name: <hidden>');
      expect(output.join('\n')).not.toContain(SECRET);
    });

    it('hides the record name when the file spells the Name key in another case', async () => {
      mockEntityInstance.Set('Name', SECRET);

      await service['processDeleteRecord'](deleteRecord({ name: `@env:${VAR}` }), '/dummy/dir', { verbose: true }, callbacks);

      expect(output).toContain('   Name: <hidden>');
      expect(output.join('\n')).not.toContain(SECRET);
    });

    it('shows a plain record name as before', async () => {
      await service['processDeleteRecord'](deleteRecord({ Name: 'Old Name' }), '/dummy/dir', { verbose: true }, callbacks);

      expect(output).toContain('   Name: Old Name');
    });

    it('masks the error text of a delete that returned false', async () => {
      mockEntityInstance.DeleteBehavior = 'false';
      mockEntityInstance.SaveMessage = `Delete blocked by '${OTHER_SECRET}'`;

      const error = await service['processDeleteRecord'](deleteRecord({}), '/dummy/dir', {}, callbacks).catch((e: Error) => e);

      expect(output).toContain(`   Error: Delete blocked by '<from @env:${OTHER_VAR}>'`);
      expect(output).toContain(`   Details: Delete blocked by '<from @env:${OTHER_VAR}>'`);
      expect((error as Error).message).not.toContain(OTHER_SECRET);
      expect(output.join('\n')).not.toContain(OTHER_SECRET);
    });

    it('masks the DELETE EXCEPTION text and the error it throws', async () => {
      mockEntityInstance.DeleteBehavior = 'throw';
      mockEntityInstance.SaveMessage = `Delete crashed on '${OTHER_SECRET}'`;

      const error = await service['processDeleteRecord'](deleteRecord({}), '/dummy/dir', {}, callbacks).catch((e: Error) => e);

      expect(output).toContain(`   Error: Delete crashed on '<from @env:${OTHER_VAR}>'`);
      expect((error as Error).message).not.toContain(OTHER_SECRET);
      expect((error as Error).stack).not.toContain(OTHER_SECRET);
      expect(output.join('\n')).not.toContain(OTHER_SECRET);
    });
  });
});

describe('setCompositionField keeps child env fields out of the owner collector', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets the resolved value on the child and leaves the owner EnvFields alone', async () => {
    vi.stubEnv(VAR, SECRET);
    const syncEngine = new SyncEngine({} as UserInfo);
    const service = new PushService(syncEngine, {} as UserInfo);
    const target = {
      Set: vi.fn(),
      EntityInfo: { Name: 'MJ: Child' },
      IsSaved: false,
      GetChangesSinceLastSave: () => ({}),
      GetFieldByName: () => ({ EntityFieldInfo: { CodeName: 'Name' } }),
    };
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };

    await service['setCompositionField'](
      target as unknown as BaseEntity,
      'Name',
      `@env:${VAR}`,
      '/dummy/dir',
      new Map(),
      collector,
      undefined,
      {} as BaseEntity
    );

    expect(target.Set).toHaveBeenCalledWith('Name', SECRET);
    expect(collector.EnvFields?.has('Name')).toBe(false);
  });
});

describe('push registers env-sourced fields with the SQL log redactor', () => {
  let service: TestablePushService;
  let syncEngine: SyncEngine;
  let output: string[];
  let callbacks: PushCallbacks;
  let redactor: EnvSqlRedactor;

  beforeEach(() => {
    vi.stubEnv(VAR, SECRET);
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
    vi.spyOn(syncEngine, 'calculateChecksumWithFileContent').mockResolvedValue('sha256-x');
    vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({});
    service = new TestablePushService(syncEngine, {} as UserInfo);
    service['envSqlLog'] = new EnvSqlLog(syncEngine);
    redactor = service['envSqlLog'].Redactor;
    output = [];
    const collect = (m: string) => output.push(m);
    callbacks = { onLog: collect, onWarn: collect, onError: collect };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('registers a changed env-sourced field of an update before the save', async () => {
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: OLD_SECRET, Config: '{}' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    let lineAtSave = '';
    const hash = GenericDatabaseProvider.SaveCallVariableHash('dbo', 'TestEntity', ['1']);
    vi.spyOn(mockEntityInstance, 'Save').mockImplementation(async () => {
      lineAtSave = redactor.Transform(`SET @Description_${hash} = N'${SECRET}'`);
      return true;
    });
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Description: `@env:${VAR}` } };

    await service.process(flatten(record), {}, callbacks);

    expect(lineAtSave).toBe(`-- TestEntity.Description: not recorded, value comes from @env:${VAR}`);
  });

  it('registers a field skipped for an unset ?optional variable, so a full-row SET line is left out', async () => {
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: OLD_SECRET, Config: '{}' });
    mockEntityInstance.EntityInfo.spUpdateGenerated = false;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    let lineAtSave = '';
    const hash = GenericDatabaseProvider.SaveCallVariableHash('dbo', 'TestEntity', ['1']);
    vi.spyOn(mockEntityInstance, 'Save').mockImplementation(async () => {
      lineAtSave = redactor.Transform(`SET @Description_${hash} = N'${OLD_SECRET}'`);
      return true;
    });
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name', description: '@env:MJ_PUSH_UNSET_OPTIONAL?optional' } };

    await service.process(flatten(record), {}, callbacks);

    expect(mockEntityInstance.Get('Description')).toBe(OLD_SECRET);
    expect(lineAtSave).toBe('-- TestEntity.Description: not recorded, value comes from @env:MJ_PUSH_UNSET_OPTIONAL');
  });

  it('registers a default skipped for an unset ?optional variable, so a full-row SET line is left out', async () => {
    vi.spyOn(syncEngine, 'buildDefaults').mockImplementation(async (_file, _config, _collector, skippedOptional) => {
      skippedOptional?.set('description', 'MJ_PUSH_UNSET_OPTIONAL');
      return {};
    });
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: OLD_SECRET, Config: '{}' });
    mockEntityInstance.EntityInfo.spUpdateGenerated = false;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    let lineAtSave = '';
    const hash = GenericDatabaseProvider.SaveCallVariableHash('dbo', 'TestEntity', ['1']);
    vi.spyOn(mockEntityInstance, 'Save').mockImplementation(async () => {
      lineAtSave = redactor.Transform(`SET @Description_${hash} = N'${OLD_SECRET}'`);
      return true;
    });
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    await service['processFlattenedRecord'](flatten(record), '/dummy/dir', {}, new Map(), callbacks, { entity: 'TestEntity' });

    expect(lineAtSave).toBe('-- TestEntity.Description: not recorded, value comes from @env:MJ_PUSH_UNSET_OPTIONAL');
  });

  it('deletes by an @env: key and prints no value', async () => {
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    mockEntityInstance = new MockBaseEntity({ ID: LONG_ID, Name: 'Old Name' });
    const load = vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    const remove = vi.spyOn(mockEntityInstance, 'Delete');
    const record: RecordData = { primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: {}, deleteRecord: { delete: true } };

    const result = await service['processDeleteRecord'](flatten(record), '', { verbose: true }, callbacks);

    expect(load).toHaveBeenCalledWith('TestEntity', { ID: LONG_ID }, expect.anything());
    expect(result.status).toBe('deleted');
    expect(remove).toHaveBeenCalled();
    expect(output).toContain(`   Primary Key: ID: <from @env:${LONG_ID_VAR}>`);
    expect(output.join('\n')).not.toContain(LONG_ID);
    expect(JSON.stringify(service['changeDetails'])).not.toContain(LONG_ID);
  });

  it('registers an @env: delete key for the names-only SQL log warning', async () => {
    mockEntityInstance = new MockBaseEntity({ ID: LONG_ID, Name: 'Old Name' });
    vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    const registerKey = vi.spyOn(redactor, 'RegisterPrimaryKey');
    const record: RecordData = { primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: {}, deleteRecord: { delete: true } };

    await service['processDeleteRecord'](flatten(record), '', {}, callbacks);

    expect(registerKey).toHaveBeenCalledWith('TestEntity', 'ID', new Set([LONG_ID_VAR]));
  });

  it('removes a deleted record from the metadata cache by the resolved @env: key', async () => {
    mockEntityInstance = new MockBaseEntity({ ID: LONG_ID, Name: 'Old Name' });
    vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    const removeFromCache = vi.spyOn(service['syncMetadataEngine'], 'removeEntityFromCache').mockImplementation(() => undefined);
    const record: RecordData = { primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: {}, deleteRecord: { delete: true } };

    await service['processDeleteRecord'](flatten(record), '', {}, callbacks);

    expect(removeFromCache).toHaveBeenCalledWith('TestEntity', { ID: LONG_ID });
    expect(record.primaryKey).toEqual({ ID: `@env:${LONG_ID_VAR}` });
  });

  it('names the @env: key variable, and no value, when the record to delete is not found', async () => {
    vi.stubEnv(LONG_ID_VAR, LONG_ID);
    vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(null);
    const record: RecordData = { primaryKey: { ID: `@env:${LONG_ID_VAR}` }, fields: {}, deleteRecord: { delete: true } };

    await service['processDeleteRecord'](flatten(record), '', {}, callbacks);

    expect(output).toContain(`Record not found for deletion: TestEntity with primaryKey {ID=<from @env:${LONG_ID_VAR}>}`);
    expect(output.join('\n')).not.toContain(LONG_ID);
  });

  it('masks an env value in the delete key print and the changes recap', async () => {
    syncEngine.ResolvedEnvVariables.add(LONG_ID_VAR);
    mockEntityInstance = new MockBaseEntity({ ID: LONG_ID, Name: 'Old Name' });
    vi.spyOn(syncEngine, 'LoadEntityFromDatabase').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    const record: RecordData = { primaryKey: { ID: LONG_ID }, fields: {}, deleteRecord: { delete: true } };

    await service['processDeleteRecord'](flatten(record), '', { verbose: true }, callbacks);

    expect(output).toContain(`   Primary Key: ID: <from @env:${LONG_ID_VAR}>`);
    expect(service['changeDetails'][0].primaryKey).toBe(`ID: <from @env:${LONG_ID_VAR}>`);
    expect(output.join('\n')).not.toContain(LONG_ID);
  });
});

describe('push builds defaults from the record file', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes FlattenedRecord.FilePath to buildDefaults, and a file in the entity folder without it', async () => {
    const syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
    vi.spyOn(syncEngine, 'calculateChecksumWithFileContent').mockResolvedValue('sha256-x');
    const buildDefaults = vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({});
    const service = new TestablePushService(syncEngine, {} as UserInfo);
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    const entityConfig = { entity: 'TestEntity' };

    const recordFile = path.join('/meta', 'widgets', 'sub', '.w.json');
    const withPath = { ...flatten({ primaryKey: { ID: '1' }, fields: { Name: 'A' } }), FilePath: recordFile };
    await service['processFlattenedRecord'](withPath, '/meta/widgets', {}, new Map(), {}, entityConfig);
    expect(buildDefaults.mock.calls[0][0]).toBe(recordFile);

    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    await service['processFlattenedRecord'](flatten({ primaryKey: { ID: '1' }, fields: { Name: 'B' } }), '/meta/widgets', {}, new Map(), {}, entityConfig);
    expect(path.dirname(String(buildDefaults.mock.calls[1][0]))).toBe(path.join('/meta', 'widgets'));
  });

  it('gives every record of a file in a sub-folder, nested records too, that file path', async () => {
    const entityDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-file-path-'));
    try {
      const recordFile = path.join(entityDir, 'sub', '.w.json');
      await fs.ensureDir(path.join(entityDir, 'sub'));
      await fs.writeJson(path.join(entityDir, 'sub', '.mj-folder.json'), { defaults: { Description: 'sub' } });
      await fs.writeJson(recordFile, {
        fields: { Name: 'Parent' },
        relatedEntities: { TestEntity: [{ fields: { Name: 'Child', Config: '@parent:ID' } }] },
      });
      const syncEngine = new SyncEngine({} as UserInfo);
      vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
      const buildDefaults = vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({});
      const service = new TestablePushService(syncEngine, {} as UserInfo);
      mockEntityInstance = new MockBaseEntity();
      const entityConfig = { entity: 'TestEntity', filePattern: '**/*.json' };

      await service['processEntityDirectory'](entityDir, entityConfig, { dryRun: true }, new FileBackupManager(), {});

      expect(buildDefaults.mock.calls.map((call) => call[0])).toEqual([recordFile, recordFile]);
    } finally {
      await fs.remove(entityDir);
    }
  });
});

/** A MockBaseEntity with field properties, so `field in entity` holds as for a real entity. */
class FieldPropertyEntity extends MockBaseEntity {
  get Description(): unknown {
    return this.Get('Description');
  }
  get Config(): unknown {
    return this.Get('Config');
  }
}

describe('push skips a default whose optional variable is not set', () => {
  let output: string[];
  let callbacks: PushCallbacks;
  let service: TestablePushService;

  beforeEach(() => {
    const syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
    vi.spyOn(syncEngine, 'calculateChecksumWithFileContent').mockResolvedValue('sha256-x');
    vi.spyOn(syncEngine, 'buildDefaults').mockImplementation(async (_file, _config, _collector, skippedOptional) => {
      skippedOptional?.set('Description', 'MJ_PUSH_OPT_DEFAULT');
      return { Config: 'from-default' };
    });
    service = new TestablePushService(syncEngine, {} as UserInfo);
    mockEntityInstance = new FieldPropertyEntity({ ID: '1', Name: 'Old Name' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    output = [];
    callbacks = { onWarn: (m) => output.push(m), onError: (m) => output.push(m) };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns for the skipped default and pushes the record with the other defaults', async () => {
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    const result = await service['processFlattenedRecord'](flatten(record), '/meta/widgets', {}, new Map(), callbacks, { entity: 'TestEntity' });

    const warning = OptionalEnvSkipMessage('TestEntity', 'Description', 'MJ_PUSH_OPT_DEFAULT');
    expect(result.status).toBe('updated');
    expect(result.warnings).toEqual([warning]);
    expect(output).toEqual([`⚠️  ${warning}`]);
    expect(mockEntityInstance.Get('Config')).toBe('from-default');
    expect(mockEntityInstance.Get('Description')).toBeUndefined();
  });

  it('does not warn when the record sets the field itself', async () => {
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name', Description: 'own' } };

    const result = await service['processFlattenedRecord'](flatten(record), '/meta/widgets', {}, new Map(), callbacks, { entity: 'TestEntity' });

    expect(result.status).toBe('updated');
    expect(result.warnings).toBeUndefined();
    expect(output).toEqual([]);
  });

  it('does not warn when the record sets the field in another case', async () => {
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name', description: 'own' } };

    const result = await service['processFlattenedRecord'](flatten(record), '/meta/widgets', {}, new Map(), callbacks, { entity: 'TestEntity' });

    expect(result.status).toBe('updated');
    expect(result.warnings).toBeUndefined();
    expect(output).toEqual([]);
    expect(mockEntityInstance.Get('Description')).toBe('own');
  });

  it('does not apply a default over a record field spelled in another case', async () => {
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { config: 'from-record' } };

    await service['processFlattenedRecord'](flatten(record), '/meta/widgets', {}, new Map(), callbacks, { entity: 'TestEntity' });

    expect(mockEntityInstance.Get('Config')).toBe('from-record');
  });
});

/** An entity with a virtual TemplateText property that is not an entity field; Set routes it to the accessor. */
class VirtualTemplateEntity extends FieldPropertyEntity {
  public TemplateTextValue: unknown = undefined;

  get TemplateText(): unknown {
    return this.TemplateTextValue;
  }

  override Set(fieldName: string, value: unknown): void {
    if (fieldName === 'TemplateText') {
      this.TemplateTextValue = value;
      return;
    }
    super.Set(fieldName, value);
  }

  /** Null for a name that is not an entity field, as BaseEntity returns. */
  override GetFieldByName(fieldName: string) {
    return this.Fields.some((f) => f.Name.toLowerCase() === fieldName.toLowerCase()) ? super.GetFieldByName(fieldName) : null;
  }
}

describe('push applies defaults by entity field name', () => {
  let syncEngine: SyncEngine;
  let service: TestablePushService;
  const callbacks: PushCallbacks = {};

  beforeEach(() => {
    syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
    vi.spyOn(syncEngine, 'calculateChecksumWithFileContent').mockResolvedValue('sha256-x');
    service = new TestablePushService(syncEngine, {} as UserInfo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies a default spelled in another case with the entity spelling', async () => {
    vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({ config: 'from-default' });
    mockEntityInstance = new FieldPropertyEntity({ ID: '1', Name: 'Old Name' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    await service['processFlattenedRecord'](flatten(record), '/meta/widgets', {}, new Map(), callbacks, { entity: 'TestEntity' });

    expect(mockEntityInstance.data).toMatchObject({ Config: 'from-default' });
    expect(mockEntityInstance.data).not.toHaveProperty('config');
  });

  it('applies a default for a virtual property of the entity through Set', async () => {
    vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({ TemplateText: 'From default' });
    const entity = new VirtualTemplateEntity({ ID: '1', Name: 'Old Name' });
    mockEntityInstance = entity;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(entity as unknown as BaseEntity);
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    await service['processFlattenedRecord'](flatten(record), '/meta/widgets', {}, new Map(), callbacks, { entity: 'TestEntity' });

    expect(entity.TemplateText).toBe('From default');
  });

  it('does not apply a default whose name is neither a field nor a property of the entity', async () => {
    vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({ NotAField: 'x' });
    const entity = new VirtualTemplateEntity({ ID: '1', Name: 'Old Name' });
    mockEntityInstance = entity;
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(entity as unknown as BaseEntity);
    const record: RecordData = { primaryKey: { ID: '1' }, fields: { Name: 'New Name' } };

    await service['processFlattenedRecord'](flatten(record), '/meta/widgets', {}, new Map(), callbacks, { entity: 'TestEntity' });

    expect(entity.data).not.toHaveProperty('NotAField');
  });
});

describe('push names the file, line, entity and field of an unset @env: variable', () => {
  let syncEngine: SyncEngine;
  let service: TestablePushService;
  let dir: string;
  const UNSET = 'MJ_PUSH_UNSET_VARIABLE';

  beforeEach(async () => {
    syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue(entityInfo);
    vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({});
    service = new TestablePushService(syncEngine, {} as UserInfo);
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name' });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
    dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-unset-')));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(dir);
  });

  /** Writes two records, the second with a nested child, and returns the file path. */
  async function writeRecords(): Promise<string> {
    const file = path.join(dir, '.widgets.json');
    const records = [
      { fields: { Name: 'First' } },
      { fields: { Name: 'Second' }, relatedEntities: { 'Child Things': [{ fields: { Name: 'Child' } }] } },
    ];
    await fs.writeFile(file, JSON.stringify(records, null, 2));
    return file;
  }

  async function failureMessage(record: RecordData, recordPath: string, file: string): Promise<string> {
    const flattened = { ...flatten(record), path: recordPath, FilePath: file };
    const error = await service.process(flattened, {}, {}).catch((e: Error) => e);
    try {
      service['throwRecordFailure']({ success: false, error, record: flattened, graphId: 'g' });
    } catch (thrown) {
      return (thrown as Error).message;
    }
    return '';
  }

  it('for a field', async () => {
    const file = await writeRecords();

    const message = await failureMessage({ primaryKey: { ID: '1' }, fields: { Description: `@env:${UNSET}` } }, 'TestEntity[1]', file);

    expect(message).toBe(`${file}:7: TestEntity fields.Description uses @env:${UNSET}, which is not set`);
  });

  it('gives the file without a line when the file uses @include', async () => {
    const file = path.join(dir, '.widgets.json');
    await fs.writeFile(file, JSON.stringify(['@include:more.json', { fields: { Name: 'Second' } }], null, 2));

    const message = await failureMessage({ primaryKey: { ID: '1' }, fields: { Description: `@env:${UNSET}` } }, 'TestEntity[1]', file);

    expect(message).toBe(`${file}: TestEntity fields.Description uses @env:${UNSET}, which is not set`);
  });

  it('for a primary key of a nested record', async () => {
    const file = await writeRecords();

    const message = await failureMessage({ primaryKey: { ID: `@env:${UNSET}` }, fields: { Name: 'Child' } }, 'TestEntity[1]/Child Things[0]', file);

    expect(message).toBe(`${file}:13: TestEntity primaryKey.ID uses @env:${UNSET}, which is not set`);
  });
});

