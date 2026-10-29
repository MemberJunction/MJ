/**
 * Push opens its SQL log with the redactor's transform, registers the env-sourced fields of each
 * save, and reports names-only warnings for values it could not leave out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import type { SqlLoggingOptions, SqlLoggingSession } from '@memberjunction/generic-database-provider';
import type { SyncConfig } from '../config';
import type { SyncResolutionCollector } from '../lib/sync-engine';

let capturedOptions: SqlLoggingOptions | undefined;
const fakeSession = { filePath: '', statementCount: 0, dispose: vi.fn() } as unknown as SqlLoggingSession;
const fakeProvider = {
  CreateSqlLogger: vi.fn(async (_file: string, options?: SqlLoggingOptions) => {
    capturedOptions = options;
    return fakeSession;
  }),
};

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class MockMetadata {
    public static get Provider(): typeof fakeProvider {
      return fakeProvider;
    }
    public EntityByName(): null {
      return null;
    }
    public async GetEntityObject(): Promise<null> {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';
import { SQLLogger } from '../lib/sql-logger';
import { DEFAULT_TRANSACTIONAL_EXCLUDE_PATTERNS } from '../lib/sql-log-filters';

const SECRET = 'super-secret-123';
const ID_VALUE = 'B0000000-0000-4000-8000-000000000001';
const tokenLine = (suffix: string) => `SET @Token_${suffix} = N'${SECRET}'`;
const TOKEN_COMMENT = '-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_SQL_TOKEN';

/** The save-call hash GenericDatabaseProvider gives a dbo.Widget record with this key. */
const hashOf = (id: unknown) => GenericDatabaseProvider.SaveCallVariableHash('dbo', 'Widget', [id]);

interface FakeLevel {
  name?: string;
  baseTable?: string;
  spUpdateGenerated?: boolean;
  parent?: BaseEntity;
  parentFields?: string[];
}

/** A saved or new entity with the members the registration reads; `level` sets its IS-A level. */
function fakeEntity(values: Record<string, unknown>, isSaved: boolean, changes: Record<string, unknown>, level: FakeLevel = {}): BaseEntity {
  return {
    EntityInfo: {
      Name: level.name ?? 'MJ: Widgets',
      SchemaName: 'dbo',
      BaseTable: level.baseTable ?? 'Widget',
      spUpdateGenerated: level.spUpdateGenerated ?? true,
      PrimaryKeys: [{ Name: 'ID' }],
      ParentEntityFieldNames: new Set(level.parentFields ?? []),
    },
    ISAParent: level.parent ?? null,
    get PrimaryKey() {
      return { KeyValuePairs: [{ FieldName: 'ID', Value: values.ID }] };
    },
    IsSaved: isSaved,
    GetChangesSinceLastSave: () => changes,
    GetFieldByName: (name: string) => {
      const match = Object.keys(values).find((key) => key.toLowerCase() === name.toLowerCase());
      return match ? { Name: match, EntityFieldInfo: { CodeName: match } } : null;
    },
    Get: (name: string) => values[name],
    Set: (name: string, value: unknown) => {
      values[name] = value;
    },
  } as unknown as BaseEntity;
}

describe('push SQL log redaction', () => {
  let dir: string;
  let syncEngine: SyncEngine;
  let service: PushService;
  let warnings: string[];

  beforeEach(async () => {
    vi.stubEnv('MJ_SQL_TOKEN', SECRET);
    vi.stubEnv('MJ_SQL_ID', ID_VALUE);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-sql-'));
    syncEngine = new SyncEngine({} as UserInfo);
    service = new PushService(syncEngine, {} as UserInfo);
    const config = { version: '1.0', sqlLogging: { enabled: true, outputDirectory: './sql' } } as SyncConfig;
    service['syncConfig'] = config;
    capturedOptions = undefined;
    warnings = [];
    await service['startSqlLogging'](new SQLLogger(config), {}, dir, { onWarn: (m: string) => warnings.push(m) });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.remove(dir);
  });

  function transform(sql: string): string {
    const fn = capturedOptions?.TransformStatement;
    expect(fn).toBeTypeOf('function');
    return fn ? fn(sql) : sql;
  }

  /** Writes the transformed statement as the SQL log and returns its path. */
  async function writeLog(sql: string): Promise<string> {
    const logPath = path.join(dir, 'push.sql');
    await fs.writeFile(logPath, transform(sql), 'utf8');
    return logPath;
  }

  describe('variableBatchThreshold', () => {
    async function openWith(threshold: number | undefined): Promise<void> {
      const config = { version: '1.0', sqlLogging: { enabled: true, outputDirectory: './sql', variableBatchThreshold: threshold } } as SyncConfig;
      service['syncConfig'] = config;
      capturedOptions = undefined;
      await service['startSqlLogging'](new SQLLogger(config), {}, dir, { onWarn: () => undefined });
    }

    it('defaults to 200 when not configured', async () => {
      await openWith(undefined);
      expect(capturedOptions?.variableBatchThreshold).toBe(200);
    });

    it('passes 0 through (legacy per-statement batching)', async () => {
      await openWith(0);
      expect(capturedOptions?.variableBatchThreshold).toBe(0);
    });

    it('passes a configured value through', async () => {
      await openWith(50);
      expect(capturedOptions?.variableBatchThreshold).toBe(50);
    });
  });

  it('passes the built-in run and log exclusions after the project patterns', async () => {
    const config = { version: '1.0', sqlLogging: { enabled: true, outputDirectory: './sql', filterPatterns: ['*EntityFieldValue*'] } } as SyncConfig;
    service['syncConfig'] = config;
    await service['startSqlLogging'](new SQLLogger(config), {}, dir, {});

    expect(capturedOptions?.filterType).toBe('exclude');
    expect(capturedOptions?.filterPatterns).toEqual(['*EntityFieldValue*', ...DEFAULT_TRANSACTIONAL_EXCLUDE_PATTERNS]);
  });

  it('opens the SQL log with the redactor transform', () => {
    expect(fakeProvider.CreateSqlLogger).toHaveBeenCalled();
    expect(capturedOptions?.statementTypes).toBe('mutations');
    expect(service['envSqlLog']).not.toBeNull();
    expect(service['lookupSqlLog']).not.toBeNull();
    expect(capturedOptions?.TransformStatement).toBeTypeOf('function');
  });

  it('runs the env redactor and then the lookup rewriter on one statement', () => {
    const entity = fakeEntity({ ID: 'w-0001', Token: SECRET, OwnerID: ID_VALUE }, false, {});
    service['registerEnvSqlFields'](entity, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), true);
    vi.spyOn(syncEngine, 'GetEntityInfo').mockReturnValue({
      Name: 'MJ: Users',
      SchemaName: 'dbo',
      BaseTable: 'User',
      PrimaryKeys: [{ Name: 'ID' }],
      FirstPrimaryKey: { Name: 'ID' },
      ParentEntityFieldNames: new Set<string>(),
      Fields: [{ Name: 'Email', Type: 'nvarchar', NeedsQuotes: true, IsVirtual: false }],
    } as unknown as EntityInfo);
    const owner = { Expression: '@lookup:MJ: Users.Email=a@example.com', EntityName: 'MJ: Users', Criteria: [{ FieldName: 'Email', Value: 'a@example.com' }], EnvSourced: false };
    service['lookupSqlLog']?.Rewriter.RegisterEntityLookups(entity, new Map([['OwnerID', owner]]));

    const sql = transform([tokenLine('6679d1fd77d5'), `SET @OwnerID_6679d1fd77d5 = '${ID_VALUE}'`].join('\n'));

    expect(sql).toBe([TOKEN_COMMENT, "SET @OwnerID_6679d1fd77d5 = (SELECT [ID] FROM [dbo].[User] WHERE [Email] = N'a@example.com')"].join('\n'));
  });

  it('passes the sync config schema rules without turning on the Flyway escape for a plain log', async () => {
    const rules = [{ schema: '__mj_App', placeholder: '${flyway:defaultSchema}' }, { schema: '__mj', placeholder: '${mjSchema}' }];
    const config = { version: '1.0', sqlLogging: { enabled: true, outputDirectory: './sql', schemaPlaceholders: rules } } as SyncConfig;
    service['syncConfig'] = config;
    await service['startSqlLogging'](new SQLLogger(config), {}, dir, {});

    expect(capturedOptions?.schemaPlaceholders).toEqual(rules);
    expect(capturedOptions?.escapeFlywaySyntax).toBe(false);
  });

  it('turns on the Flyway escape for a migration-formatted log, or when escapeFlywaySyntax is set', async () => {
    for (const sqlLogging of [{ enabled: true, outputDirectory: './sql', formatAsMigration: true }, { enabled: true, outputDirectory: './sql', escapeFlywaySyntax: true }]) {
      const config = { version: '1.0', sqlLogging } as SyncConfig;
      service['syncConfig'] = config;
      await service['startSqlLogging'](new SQLLogger(config), {}, dir, {});

      expect(capturedOptions?.escapeFlywaySyntax).toBe(true);
    }
  });

  it('drops the lookup rewriter and its own lookup-create hook when the log closes', () => {
    expect(syncEngine.BeforeLookupCreateSaveSource).not.toBeNull();
    service['closeEnvSqlRedactor']();

    expect(service['lookupSqlLog']).toBeNull();
    expect(syncEngine.BeforeLookupCreateSaveSource).toBeNull();
  });

  it('registers a field of an IS-A parent table under the parent level and its hash', () => {
    const parentValues: Record<string, unknown> = { ID: 'p-1', Token: SECRET };
    const parent = fakeEntity(parentValues, false, {}, { name: 'MJ: Products', baseTable: 'Product' });
    const child = fakeEntity({ ID: 'p-1', Token: SECRET }, false, {}, { name: 'MJ: Meetings', baseTable: 'Meeting', parent, parentFields: ['ID', 'Token'] });
    service['registerEnvSqlFields'](child, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), true);

    const parentHash = GenericDatabaseProvider.SaveCallVariableHash('dbo', 'Product', ['p-1']);
    const childHash = GenericDatabaseProvider.SaveCallVariableHash('dbo', 'Meeting', ['p-1']);
    expect(transform(tokenLine(parentHash))).toBe('-- MJ: Products.Token: not recorded, value comes from @env:MJ_SQL_TOKEN');
    expect(transform(tokenLine(childHash))).toBe(tokenLine(childHash));
  });

  it('registers an unchanged field of an update when the entity has no generated update procedure', () => {
    const entity = fakeEntity({ ID: 'w-0001', Token: SECRET }, true, { Name: 'x' }, { spUpdateGenerated: false });
    service['registerEnvSqlFields'](entity, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), false);

    expect(transform(tokenLine('6679d1fd77d5'))).toBe(TOKEN_COMMENT);
  });

  it('drops the redactor and its own lookup-create hook when the log closes', () => {
    expect(syncEngine.BeforeLookupCreateSave).not.toBeNull();
    service['closeEnvSqlRedactor']();

    expect(service['envSqlLog']).toBeNull();
    expect(syncEngine.BeforeLookupCreateSave).toBeNull();
  });

  it('keeps a lookup-create hook that another run set', () => {
    const other = vi.fn();
    syncEngine.BeforeLookupCreateSave = other;
    service['closeEnvSqlRedactor']();

    expect(syncEngine.BeforeLookupCreateSave).toBe(other);
  });

  it('leaves out an env-sourced field of a new record', () => {
    const entity = fakeEntity({ ID: 'w-0001', Token: SECRET }, false, {});
    service['registerEnvSqlFields'](entity, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), true);

    expect(hashOf('w-0001')).toBe('6679d1fd77d5');
    expect(transform(tokenLine('6679d1fd77d5'))).toBe(TOKEN_COMMENT);
  });

  it('replaces only the SET line of the save call of the registered record', () => {
    const entity = fakeEntity({ ID: 'w-0001', Token: SECRET }, false, {});
    service['registerEnvSqlFields'](entity, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), true);

    const otherRecordLine = tokenLine(hashOf('w-0002'));
    expect(transform(otherRecordLine)).toBe(otherRecordLine);
  });

  it('matches a file key spelled in another case to the entity field name', () => {
    const entity = fakeEntity({ ID: 'w-0001', Token: SECRET }, true, { Token: SECRET });
    service['registerEnvSqlFields'](entity, new Map([['token', new Set(['MJ_SQL_TOKEN'])]]), false);

    expect(transform(tokenLine('6679d1fd77d5'))).toBe(TOKEN_COMMENT);
  });

  it('registers a changed field of an update', async () => {
    syncEngine.ResolvedEnvVariables.add('MJ_SQL_TOKEN');
    const changed = fakeEntity({ ID: 'w-0001', Token: SECRET }, true, { Token: SECRET });
    service['registerEnvSqlFields'](changed, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), false);

    const logPath = await writeLog(tokenLine('6679d1fd77d5'));
    expect(await fs.readFile(logPath, 'utf8')).not.toContain(SECRET);
    expect(service['envSqlLog']?.Redactor.Warnings(logPath)).toEqual([]);
  });

  it('does not register an unchanged field of an update (it is not in the statement)', async () => {
    const unchanged = fakeEntity({ ID: 'w-0002', Token: SECRET }, true, { Name: 'x' });
    service['registerEnvSqlFields'](unchanged, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), false);

    // A registered field that is never matched would give a "was not found" warning
    const logPath = await writeLog(`SET @Name_${hashOf('w-0002')} = N'x'`);
    expect(service['envSqlLog']?.Redactor.Warnings(logPath)).toEqual([]);
  });

  it('warns, with names only, for an env-sourced primary key and for a value still in the log', async () => {
    syncEngine.ResolvedEnvVariables.add('MJ_SQL_TOKEN');
    const entity = fakeEntity({ ID: ID_VALUE }, false, {});
    service['registerEnvSqlFields'](entity, new Map([['ID', new Set(['MJ_SQL_ID'])]]), true);
    const logPath = await writeLog(`SET @ID_${hashOf(ID_VALUE)} = '${ID_VALUE}'\nINSERT INTO X VALUES (N'${SECRET}')`);

    service['addEnvSqlWarnings'](logPath, { onWarn: (m: string) => warnings.push(m) });

    expect(warnings).toEqual([
      `⚠️  SQL log ${logPath}: MJ: Widgets.ID is a primary key from @env:MJ_SQL_ID. The log holds its value. Check the log before you share it.`,
      `⚠️  SQL log ${logPath}: the value of @env:MJ_SQL_TOKEN appears in the log. Check the log before you share it.`,
    ]);
    expect(service['warnings']).toHaveLength(2);
    expect(warnings.join('\n')).not.toContain(SECRET);
    expect(warnings.join('\n')).not.toContain(ID_VALUE);
  });

  it('leaves out an env-sourced composition child field', async () => {
    const values: Record<string, unknown> = { ID: 'c-1', Token: null };
    const child = fakeEntity(values, false, {});
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };

    await service['setCompositionField'](child, 'Token', '@env:MJ_SQL_TOKEN', dir, new Map(), collector, undefined, {} as BaseEntity);
    service['registerPendingEnvSqlChildFields'](collector);

    expect(values.Token).toBe(SECRET);
    expect(transform(tokenLine(hashOf('c-1')))).toBe(TOKEN_COMMENT);
  });

  it('registers a composition child field with the key the child has at the owner save', async () => {
    const values: Record<string, unknown> = { ID: 'c-3', Token: null };
    const child = fakeEntity(values, false, {});
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };

    await service['setCompositionField'](child, 'Token', '@env:MJ_SQL_TOKEN', dir, new Map(), collector, undefined, {} as BaseEntity);
    values.ID = 'c-4';
    service['registerPendingEnvSqlChildFields'](collector);

    expect(transform(tokenLine(hashOf('c-4')))).toBe(TOKEN_COMMENT);
    expect(transform(tokenLine(hashOf('c-3')))).toBe(tokenLine(hashOf('c-3')));
  });

  it('does not register a literal composition child field', async () => {
    const values: Record<string, unknown> = { ID: 'c-2', Token: null };
    const child = fakeEntity(values, false, {});
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };

    await service['setCompositionField'](child, 'Token', SECRET, dir, new Map(), collector, undefined, {} as BaseEntity);
    service['registerPendingEnvSqlChildFields'](collector);

    const line = tokenLine(hashOf('c-2'));
    expect(transform(line)).toBe(line);
  });

  it('leaves out an env-sourced field of a record that a lookup creates', () => {
    const created = fakeEntity({ ID: 'w-0001', Token: SECRET }, false, {});
    syncEngine.BeforeLookupCreateSave?.(created, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]));

    expect(transform(tokenLine('6679d1fd77d5'))).toBe(TOKEN_COMMENT);
  });

  it('does nothing when no SQL log is open', () => {
    const plain = new PushService(syncEngine, {} as UserInfo);
    const entity = fakeEntity({ ID: 'w-0001', Token: SECRET }, false, {});
    expect(() => plain['registerEnvSqlFields'](entity, new Map([['Token', new Set(['MJ_SQL_TOKEN'])]]), true)).not.toThrow();
    expect(plain['envSqlLog']).toBeNull();
  });
});
