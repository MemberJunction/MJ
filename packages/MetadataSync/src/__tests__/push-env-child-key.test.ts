/**
 * Push resolves an `@env:` primary key of a collection child before it matches or creates the child.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import type { RecordData, SyncResolutionCollector } from '../lib/sync-engine';
import type { EntityConfig } from '../config';
import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';
import { EnvSqlLog } from '../lib/env-sql-redactor';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { EnvVariableNotSetError } from '../lib/env-reference';

const CHILD_ID = 'C0000000-0000-4000-8000-000000000001';
const CHILD_VAR = 'MJ_PUSH_CHILD_KEY';

/** An entity with a UUID key; field names match without regard to case. */
class ChildKeyEntity {
  public data: Record<string, unknown>;
  public EntityInfo: EntityInfo;
  public IsSaved = true;
  public collections: Record<string, LineCollection> = {};
  private readonly fields = ['ID', 'Name'];

  constructor(entityName: string, data: Record<string, unknown>) {
    this.data = { ...data };
    this.EntityInfo = {
      Name: entityName,
      SchemaName: 'dbo',
      BaseTable: entityName.replace(/\s/g, ''),
      spUpdateGenerated: false,
      PrimaryKeys: [{ Name: 'ID' }],
    } as unknown as EntityInfo;
  }

  get PrimaryKey() {
    return { KeyValuePairs: [{ FieldName: 'ID', Value: this.data.ID }] };
  }

  GetChangesSinceLastSave(): Record<string, unknown> {
    return {};
  }

  Get(name: string): unknown {
    return this.data[this.canonical(name)];
  }

  Set(name: string, value: unknown): void {
    this.data[this.canonical(name)] = value;
  }

  GetFieldByName(name: string) {
    const field = this.canonical(name);
    const isKey = field === 'ID';
    return { Name: field, EntityFieldInfo: { Type: isKey ? 'uniqueidentifier' : 'nvarchar', IsUniqueIdentifier: isKey, CodeName: field } };
  }

  /** The IS-A child that EnsureISAChild gives. */
  public IsAChild: ChildKeyEntity | null = null;

  async EnsureISAChild(): Promise<ChildKeyEntity | null> {
    return this.IsAChild;
  }

  GetCompanion(name: string): LineCollection | undefined {
    return this.collections[name];
  }

  private canonical(name: string): string {
    return this.fields.find((field) => field.toLowerCase() === name.toLowerCase()) ?? name;
  }
}

interface LineCollection {
  Name: string;
  RelatedEntityName: string;
  LoadMode: string;
  IsLoaded: boolean;
  Items: ChildKeyEntity[];
  Load: () => Promise<void>;
  Create: () => Promise<ChildKeyEntity>;
  Remove: (item: ChildKeyEntity) => void;
}

describe('push resolves an @env: key of a collection child', () => {
  let service: PushService;
  let owner: ChildKeyEntity;
  let existingChild: ChildKeyEntity;
  let lines: LineCollection;
  let created: ChildKeyEntity[];

  beforeEach(() => {
    vi.stubEnv(CHILD_VAR, CHILD_ID.toLowerCase());
    service = new PushService(new SyncEngine({} as UserInfo), {} as UserInfo);
    owner = new ChildKeyEntity('Orders', { ID: 'ord-1' });
    existingChild = new ChildKeyEntity('Order Lines', { ID: CHILD_ID, Name: 'Old' });
    created = [];
    lines = {
      Name: 'Lines',
      RelatedEntityName: 'Order Lines',
      LoadMode: 'explicit',
      IsLoaded: true,
      Items: [existingChild],
      Load: async () => undefined,
      Create: async () => {
        const child = new ChildKeyEntity('Order Lines', {});
        created.push(child);
        return child;
      },
      Remove: vi.fn(),
    };
    owner.collections.Lines = lines;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  let collector: SyncResolutionCollector;

  async function apply(item: RecordData, entityConfig?: EntityConfig): Promise<void> {
    await applyRecord({ primaryKey: { ID: 'ord-1' }, fields: {}, collections: { Lines: [item] } }, entityConfig);
  }

  async function applyRecord(record: RecordData, entityConfig?: EntityConfig): Promise<void> {
    collector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };
    await service['applyCompositionAxes'](owner as unknown as BaseEntity, record, 'Orders', '/dummy/dir', new Map(), collector, {}, {}, entityConfig);
  }

  /** The printed error for the owner record `Orders[0]`, which has no record file. */
  function printed(error: Error): string {
    const record = { record: { fields: {} }, entityName: 'Orders', depth: 0, path: 'Orders[0]', dependencies: new Set<string>(), id: 'o', originalIndex: 0, graphId: 'g' };
    return (service['locateRecordError'](error, record) as Error).message;
  }

  it('updates the existing child whose key equals the variable, without regard to UUID case', async () => {
    await apply({ primaryKey: { ID: `@env:${CHILD_VAR}` }, fields: { Name: 'New' } });

    expect(created).toEqual([]);
    expect(existingChild.Get('Name')).toBe('New');
  });

  it('keeps the real child in authoritative mode', async () => {
    const entityConfig = { entity: 'Orders', collections: { Lines: { mode: 'authoritative' } } } as EntityConfig;

    await apply({ primaryKey: { ID: `@env:${CHILD_VAR}` }, fields: { Name: 'New' } }, entityConfig);

    expect(lines.Remove).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it('gives a new child the resolved key, not the reference text', async () => {
    lines.Items = [];

    await apply({ primaryKey: { ID: `@env:${CHILD_VAR}` }, fields: { Name: 'New' } });

    expect(created).toHaveLength(1);
    expect(created[0].Get('ID')).toBe(CHILD_ID.toLowerCase());
  });

  it('stops with a names-only message when the child key variable is not set', async () => {
    vi.stubEnv(CHILD_VAR, undefined);

    const error = await apply({ primaryKey: { ID: `@env:${CHILD_VAR}` }, fields: { Name: 'New' } }).catch((e: Error) => e);

    expect((error as Error).message).toBe(`Environment variable not found: ${CHILD_VAR}`);
    expect(created).toEqual([]);
  });

  it('registers the @env: key of a matched child for the names-only SQL log warning', async () => {
    const syncEngine = new SyncEngine({} as UserInfo);
    service = new PushService(syncEngine, {} as UserInfo);
    service['envSqlLog'] = new EnvSqlLog(syncEngine);
    const registerKey = vi.spyOn(service['envSqlLog'].Redactor, 'RegisterPrimaryKey');

    await apply({ primaryKey: { ID: `@env:${CHILD_VAR}` }, fields: { Name: 'New' } });
    service['registerPendingEnvSqlChildFields'](collector);

    expect(created).toEqual([]);
    expect(registerKey).toHaveBeenCalledWith('Order Lines', 'ID', new Set([CHILD_VAR]));
  });

  it('registers the @env: key of a child it removes for the names-only SQL log warning', async () => {
    const syncEngine = new SyncEngine({} as UserInfo);
    service = new PushService(syncEngine, {} as UserInfo);
    service['envSqlLog'] = new EnvSqlLog(syncEngine);
    const registerKey = vi.spyOn(service['envSqlLog'].Redactor, 'RegisterPrimaryKey');

    await apply({ primaryKey: { ID: `@env:${CHILD_VAR}` }, fields: {}, deleteRecord: { delete: true } });
    service['registerPendingEnvSqlChildFields'](collector);

    expect(lines.Remove).toHaveBeenCalledWith(existingChild);
    expect(registerKey).toHaveBeenCalledWith('Order Lines', 'ID', new Set([CHILD_VAR]));
  });

  it('names the item path and the child entity for an unset key variable', async () => {
    vi.stubEnv(CHILD_VAR, undefined);

    const error = await apply({ primaryKey: { ID: `@env:${CHILD_VAR}` }, fields: { Name: 'New' } }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(EnvVariableNotSetError);
    expect((error as EnvVariableNotSetError).Field).toBe('collections.Lines[0].primaryKey.ID');
    expect((error as EnvVariableNotSetError).EntityName).toBe('Order Lines');
  });

  it('names the item path and the child entity for an unset field variable', async () => {
    const error = await apply({ primaryKey: { ID: CHILD_ID }, fields: { Name: '@env:MJ_PUSH_CHILD_UNSET' } }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(EnvVariableNotSetError);
    expect((error as EnvVariableNotSetError).Field).toBe('collections.Lines[0].fields.Name');
    expect((error as EnvVariableNotSetError).EntityName).toBe('Order Lines');
  });

  it('leaves the SET line of a child field skipped for an unset ?optional variable out of the SQL log', async () => {
    const syncEngine = new SyncEngine({} as UserInfo);
    service = new PushService(syncEngine, {} as UserInfo);
    service['envSqlLog'] = new EnvSqlLog(syncEngine);

    await apply({ primaryKey: { ID: CHILD_ID }, fields: { Name: '@env:MJ_PUSH_CHILD_OPTIONAL?optional' } });
    service['registerPendingEnvSqlChildFields'](collector);

    expect(existingChild.Get('Name')).toBe('Old');
    const hash = GenericDatabaseProvider.SaveCallVariableHash('dbo', 'OrderLines', [CHILD_ID]);
    expect(service['envSqlLog'].Redactor.Transform(`SET @Name_${hash} = N'Old'`)).toBe(
      '-- Order Lines.Name: not recorded, value comes from @env:MJ_PUSH_CHILD_OPTIONAL'
    );
  });

  it('prints the child entity and the item path in the error message', async () => {
    const error = await apply({ primaryKey: { ID: CHILD_ID }, fields: { Name: '@env:MJ_PUSH_CHILD_UNSET' } }).catch((e: Error) => e);

    expect(printed(error as Error)).toBe('Orders[0]: Order Lines collections.Lines[0].fields.Name uses @env:MJ_PUSH_CHILD_UNSET, which is not set');
  });

  it('prints the embed entity and path for an unset variable in an embed', async () => {
    const address = new ChildKeyEntity('Addresses', { ID: 'a-1' });
    Reflect.set(owner, 'AddressID_EnsureObject', async () => address);

    const error = await applyRecord({ primaryKey: { ID: 'ord-1' }, fields: {}, embeds: { AddressID: { fields: { Name: '@env:MJ_PUSH_EMBED_UNSET' } } } }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(EnvVariableNotSetError);
    expect(printed(error as Error)).toBe('Orders[0]: Addresses embeds.AddressID.fields.Name uses @env:MJ_PUSH_EMBED_UNSET, which is not set');
  });

  it('prints the extension entity and path for an unset variable in an extension', async () => {
    owner.IsAChild = new ChildKeyEntity('Rush Orders', { ID: 'ord-1' });

    const error = await applyRecord({ primaryKey: { ID: 'ord-1' }, fields: {}, extension: { 'Rush Orders': { fields: { Name: '@env:MJ_PUSH_EXT_UNSET' } } } }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(EnvVariableNotSetError);
    expect(printed(error as Error)).toBe('Orders[0]: Rush Orders extension.Rush Orders.fields.Name uses @env:MJ_PUSH_EXT_UNSET, which is not set');
  });
});

