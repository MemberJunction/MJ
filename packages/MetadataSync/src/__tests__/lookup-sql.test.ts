/**
 * `@lookup` values in the push SQL log are written as subqueries on the natural key (#5626, #3619):
 * the subquery builder, the SET-line rewriter, and the lookup sources the sync engine records.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import {
  ComposeStatementTransforms,
  LookupSqlLog,
  LookupSqlRewriter,
  LookupSubqueryBuilder,
  type LookupSqlSource,
} from '../lib/lookup-sql';
import { SyncEngine, type SyncResolutionCollector } from '../lib/sync-engine';

interface FakeField {
  Name: string;
  Type?: string;
  NeedsQuotes?: boolean;
  IsVirtual?: boolean;
}

function entityInfo(name: string, baseTable: string, fields: FakeField[], options: { schema?: string; keys?: string[]; parentFields?: string[] } = {}): EntityInfo {
  const keys = (options.keys ?? ['ID']).map((key) => ({ Name: key }));
  return {
    Name: name,
    SchemaName: options.schema ?? '__mj',
    BaseTable: baseTable,
    PrimaryKeys: keys,
    FirstPrimaryKey: keys[0],
    ParentEntityFieldNames: new Set(options.parentFields ?? []),
    Fields: fields.map((field) => ({
      Name: field.Name,
      Type: field.Type ?? 'nvarchar',
      NeedsQuotes: field.NeedsQuotes ?? true,
      IsVirtual: field.IsVirtual ?? false,
    })),
  } as unknown as EntityInfo;
}

const ENTITIES = new Map<string, EntityInfo>([
  ['MJ: Entities', entityInfo('MJ: Entities', 'Entity', [{ Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'Name' }, { Name: 'SchemaName', IsVirtual: true }])],
  ['MJ: Roles', entityInfo('MJ: Roles', 'Role', [{ Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'Name' }])],
  [
    'MJ: Entity Permissions',
    entityInfo('MJ: Entity Permissions', 'EntityPermission', [
      { Name: 'ID', Type: 'uniqueidentifier' },
      { Name: 'EntityID', Type: 'uniqueidentifier' },
      { Name: 'RoleID', Type: 'uniqueidentifier' },
      { Name: 'Type' },
      { Name: 'CanRead', Type: 'bit', NeedsQuotes: false },
      { Name: 'Sequence', Type: 'int', NeedsQuotes: false },
      { Name: 'CreatedAt', Type: 'datetimeoffset' },
    ]),
  ],
  ['MJ: Composite', entityInfo('MJ: Composite', 'Composite', [{ Name: 'A' }, { Name: 'B' }], { keys: ['A', 'B'] })],
  ['MJ: Meetings', entityInfo('MJ: Meetings', 'Meeting', [{ Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'Title' }], { parentFields: ['Title'] })],
]);
const builder = new LookupSubqueryBuilder((name) => ENTITIES.get(name));

const ENTITY_ID = 'E893433E-F36B-1410-8045-0077034ECA4A';
const ROLE_ID = 'A1B2C3D4-0000-4000-8000-000000000001';
const PERMISSION_ID = 'ECD1423E-F36B-1410-8728-003D3A6A09FA';

function source(entityName: string, criteria: LookupSqlSource['Criteria'], envSourced = false): LookupSqlSource {
  return { Expression: `@lookup:${entityName}`, EntityName: entityName, Criteria: criteria, EnvSourced: envSourced };
}

const entityLookup = source('MJ: Entities', [{ FieldName: 'Name', Value: "Conversation's Branches" }]);
const roleLookup = source('MJ: Roles', [{ FieldName: 'Name', Value: 'UI' }]);
const permissionLookup = source('MJ: Entity Permissions', [
  { FieldName: 'EntityID', Value: entityLookup },
  { FieldName: 'RoleID', Value: roleLookup },
  { FieldName: 'Type', Value: 'Allow' },
]);

const ENTITY_SUBQUERY = "(SELECT [ID] FROM [__mj].[Entity] WHERE LOWER([Name]) = LOWER(N'Conversation''s Branches'))";
const ROLE_SUBQUERY = "(SELECT [ID] FROM [__mj].[Role] WHERE LOWER([Name]) = LOWER(N'UI'))";
const PERMISSION_SUBQUERY = `(SELECT [ID] FROM [__mj].[EntityPermission] WHERE [EntityID] = ${ENTITY_SUBQUERY} AND [RoleID] = ${ROLE_SUBQUERY} AND LOWER([Type]) = LOWER(N'Allow'))`;

describe('LookupSubqueryBuilder', () => {
  it('builds a subquery on the base table, comparing string criteria lower-cased and escaping quotes', () => {
    expect(builder.Build(entityLookup)).toEqual({ Sql: ENTITY_SUBQUERY });
  });

  it('nests a lookup inside a lookup', () => {
    expect(builder.Build(permissionLookup)).toEqual({ Sql: PERMISSION_SUBQUERY });
  });

  it('writes literals by field type, folds no bit, int, uuid or date criterion, and writes null as IS NULL', () => {
    const result = builder.Build(
      source('MJ: Entity Permissions', [
        { FieldName: 'canread', Value: 'true' },
        { FieldName: 'Sequence', Value: '3' },
        { FieldName: 'EntityID', Value: ENTITY_ID },
        { FieldName: 'CreatedAt', Value: '2026-01-01' },
        { FieldName: 'Type', Value: 'null' },
      ])
    );
    expect(result.Sql).toBe(
      `(SELECT [ID] FROM [__mj].[EntityPermission] WHERE [CanRead] = 1 AND [Sequence] = 3 AND [EntityID] = '${ENTITY_ID}' AND [CreatedAt] = '2026-01-01' AND [Type] IS NULL)`
    );
  });

  it('gives a problem, not SQL, when it cannot match on the natural key', () => {
    const problems = [
      builder.Build(source('MJ: Entities', [{ FieldName: 'Name', Value: 'X' }], true)),
      builder.Build(source('MJ: Missing', [{ FieldName: 'Name', Value: 'X' }])),
      builder.Build(source('MJ: Composite', [{ FieldName: 'A', Value: 'X' }])),
      builder.Build(source('MJ: Entities', [{ FieldName: 'Nope', Value: 'X' }])),
      builder.Build(source('MJ: Entities', [{ FieldName: 'SchemaName', Value: '__mj' }])),
      builder.Build(source('MJ: Meetings', [{ FieldName: 'Title', Value: 'X' }])),
      builder.Build(source('MJ: Entity Permissions', [{ FieldName: 'Sequence', Value: 'three' }])),
      builder.Build(source('MJ: Entity Permissions', [{ FieldName: 'EntityID', Value: source('MJ: Entities', [], false) }])),
    ];
    for (const problem of problems) {
      expect(problem.Sql).toBeUndefined();
      expect(problem.Problem).toBeTruthy();
    }
  });
});

/** An entity with the members the rewriter reads. */
function fakeEntity(name: string, baseTable: string, values: Record<string, unknown>, parent: BaseEntity | null = null, parentFields: string[] = []): BaseEntity {
  return {
    EntityInfo: {
      Name: name,
      SchemaName: '__mj',
      BaseTable: baseTable,
      PrimaryKeys: [{ Name: 'ID' }],
      FirstPrimaryKey: { Name: 'ID' },
      ParentEntityFieldNames: new Set(parentFields),
    },
    ISAParent: parent,
    get PrimaryKey() {
      return { KeyValuePairs: [{ FieldName: 'ID', Value: values.ID }] };
    },
    GetFieldByName: (field: string) => {
      const match = Object.keys(values).find((key) => key.toLowerCase() === field.toLowerCase());
      return match ? { Name: match, EntityFieldInfo: { CodeName: match } } : null;
    },
    Get: (field: string) => values[field],
  } as unknown as BaseEntity;
}

const hashOf = (table: string, id: string) => GenericDatabaseProvider.SaveCallVariableHash('__mj', table, [id]);

/** A logged update of an entity permission, as the SQL Server provider writes it. */
function permissionUpdate(hash: string, id: string, entityId: string): string {
  return [
    `DECLARE @EntityID_${hash} UNIQUEIDENTIFIER, @CanRead_${hash} BIT, @ID_${hash} UNIQUEIDENTIFIER`,
    `SET @EntityID_${hash} = '${entityId}'`,
    `SET @CanRead_${hash} = 0`,
    `SET @ID_${hash} = '${id}'`,
    `EXEC [__mj].spUpdateEntityPermission @EntityID = @EntityID_${hash}, @CanRead = @CanRead_${hash}, @ID = @ID_${hash}`,
  ].join('\n');
}

describe('LookupSqlRewriter', () => {
  it('rewrites a lookup-keyed primary key and a lookup foreign key of that save call only', () => {
    const rewriter = new LookupSqlRewriter(builder);
    const entity = fakeEntity('MJ: Entity Permissions', 'EntityPermission', { ID: PERMISSION_ID, EntityID: ENTITY_ID, CanRead: false });
    rewriter.RegisterEntityLookups(entity, new Map([['ID', permissionLookup], ['entityid', entityLookup]]));

    const hash = hashOf('EntityPermission', PERMISSION_ID);
    const sql = rewriter.Transform(permissionUpdate(hash, PERMISSION_ID, ENTITY_ID));

    expect(sql).toContain(`SET @ID_${hash} = ${PERMISSION_SUBQUERY}`);
    expect(sql).toContain(`SET @EntityID_${hash} = ${ENTITY_SUBQUERY}`);
    expect(sql).toContain(`SET @CanRead_${hash} = 0`);
    expect(sql).not.toContain(PERMISSION_ID);
    expect(sql).not.toContain(ENTITY_ID);

    const otherHash = hashOf('EntityPermission', 'other-id');
    const other = permissionUpdate(otherHash, PERMISSION_ID, ENTITY_ID);
    expect(rewriter.Transform(other)).toBe(other);
    expect(rewriter.Warnings()).toEqual([]);
  });

  it('matches a UUID in another case and a numbered suffix', () => {
    const rewriter = new LookupSqlRewriter(builder);
    const entity = fakeEntity('MJ: Entity Permissions', 'EntityPermission', { ID: PERMISSION_ID.toLowerCase() });
    rewriter.RegisterEntityLookups(entity, new Map([['ID', permissionLookup]]));

    const hash = hashOf('EntityPermission', PERMISSION_ID);
    expect(rewriter.Transform(`  SET @ID_${hash}_2 = '${PERMISSION_ID}'`)).toBe(`  SET @ID_${hash}_2 = ${PERMISSION_SUBQUERY}`);
  });

  it('rewrites the primary key at every IS-A level and another field at the level that holds it', () => {
    const rewriter = new LookupSqlRewriter(builder);
    const parentValues = { ID: PERMISSION_ID, EntityID: ENTITY_ID };
    const parent = fakeEntity('MJ: Products', 'Product', parentValues);
    const child = fakeEntity('MJ: Meetings', 'Meeting', { ID: PERMISSION_ID, EntityID: ENTITY_ID }, parent, ['ID', 'EntityID']);
    rewriter.RegisterEntityLookups(child, new Map([['ID', permissionLookup], ['EntityID', entityLookup]]));

    const parentHash = hashOf('Product', PERMISSION_ID);
    const childHash = hashOf('Meeting', PERMISSION_ID);
    expect(rewriter.Transform(`SET @ID_${parentHash} = '${PERMISSION_ID}'`)).toBe(`SET @ID_${parentHash} = ${PERMISSION_SUBQUERY}`);
    expect(rewriter.Transform(`SET @ID_${childHash} = '${PERMISSION_ID}'`)).toBe(`SET @ID_${childHash} = ${PERMISSION_SUBQUERY}`);
    expect(rewriter.Transform(`SET @EntityID_${parentHash} = '${ENTITY_ID}'`)).toBe(`SET @EntityID_${parentHash} = ${ENTITY_SUBQUERY}`);
    expect(rewriter.Transform(`SET @EntityID_${childHash} = '${ENTITY_ID}'`)).toBe(`SET @EntityID_${childHash} = '${ENTITY_ID}'`);
  });

  it('keeps the literal and warns, naming the field, when no subquery can be built', () => {
    const rewriter = new LookupSqlRewriter(builder);
    const entity = fakeEntity('MJ: Entity Permissions', 'EntityPermission', { ID: PERMISSION_ID, RoleID: ROLE_ID });
    const envLookup = source('MJ: Roles', [{ FieldName: 'Name', Value: 'from-env' }], true);
    rewriter.RegisterEntityLookups(entity, new Map([['RoleID', envLookup]]));

    const line = `SET @RoleID_${hashOf('EntityPermission', PERMISSION_ID)} = '${ROLE_ID}'`;
    expect(rewriter.Transform(line)).toBe(line);
    expect(rewriter.Warnings()).toHaveLength(1);
    expect(rewriter.Warnings()[0]).toContain('MJ: Entity Permissions.RoleID is written with this database');
    expect(rewriter.Warnings()[0]).not.toContain('from-env');
  });

  it('keys a row a ?create lookup makes by that lookup, nests its lookup foreign keys, and warns', () => {
    const rewriter = new LookupSqlRewriter(builder);
    const created = fakeEntity('MJ: Entity Permissions', 'EntityPermission', { ID: PERMISSION_ID, EntityID: ENTITY_ID, RoleID: ROLE_ID, Type: 'Allow' });
    rewriter.RegisterLookupCreate(created, permissionLookup);

    const hash = hashOf('EntityPermission', PERMISSION_ID);
    const sql = rewriter.Transform([`SET @EntityID_${hash} = '${ENTITY_ID}'`, `SET @RoleID_${hash} = '${ROLE_ID}'`, `SET @ID_${hash} = '${PERMISSION_ID}'`].join('\n'));

    expect(sql).toBe([`SET @EntityID_${hash} = ${ENTITY_SUBQUERY}`, `SET @RoleID_${hash} = ${ROLE_SUBQUERY}`, `SET @ID_${hash} = ${PERMISSION_SUBQUERY}`].join('\n'));
    expect(rewriter.Warnings()).toHaveLength(1);
    expect(rewriter.Warnings()[0]).toContain('IF NOT EXISTS guard inserts the row');
  });

  it('composes with another transform in order', () => {
    const transform = ComposeStatementTransforms((sql) => `${sql}-a`, (sql) => `${sql}-b`);
    expect(transform('x')).toBe('x-a-b');
  });
});

describe('LookupSqlLog', () => {
  it('sets and clears its own lookup-create hook', () => {
    const engine = { BeforeLookupCreateSaveSource: null, GetEntityInfo: (name: string) => ENTITIES.get(name) ?? null } as unknown as SyncEngine;
    const log = new LookupSqlLog(engine);
    expect(engine.BeforeLookupCreateSaveSource).not.toBeNull();
    log.Close();
    expect(engine.BeforeLookupCreateSaveSource).toBeNull();
  });
});

describe('SyncEngine records the @lookup a field value came from', () => {
  it('keeps nested lookups and leaves out the ?create flags', async () => {
    const engine = new SyncEngine({} as UserInfo);
    const resolve = vi.spyOn(engine, 'ResolveLookup').mockImplementation(async (entityName: string) => {
      return entityName === 'MJ: Entities' ? ENTITY_ID : entityName === 'MJ: Roles' ? ROLE_ID : PERMISSION_ID;
    });
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'primaryKey', EnvFields: new Map(), LookupSources: new Map() };

    const value = await engine.ProcessFieldValue(
      '@lookup:MJ: Entity Permissions.EntityID=@lookup:MJ: Entities.Name=Widgets&RoleID=@lookup:MJ: Roles.Name=UI&Type=Allow?create&CanRead=1',
      '/dir',
      null,
      null,
      0,
      undefined,
      collector,
      'ID'
    );

    expect(value).toBe(PERMISSION_ID);
    const recorded = collector.LookupSources?.get('ID');
    expect(recorded?.EntityName).toBe('MJ: Entity Permissions');
    expect(recorded?.EnvSourced).toBe(false);
    expect(builder.Build(recorded as LookupSqlSource).Sql).toBe(
      "(SELECT [ID] FROM [__mj].[EntityPermission] WHERE [EntityID] = (SELECT [ID] FROM [__mj].[Entity] WHERE LOWER([Name]) = LOWER(N'Widgets')) AND [RoleID] = (SELECT [ID] FROM [__mj].[Role] WHERE LOWER([Name]) = LOWER(N'UI')) AND LOWER([Type]) = LOWER(N'Allow'))"
    );
    // The lookup passes its source on, so a ?create can register the row it makes
    expect(resolve.mock.calls.at(-1)?.[9]).toBe(recorded);
  });

  it('marks a lookup whose criteria come from @env', async () => {
    vi.stubEnv('MJ_LOOKUP_ROLE', 'UI');
    const engine = new SyncEngine({} as UserInfo);
    vi.spyOn(engine, 'ResolveLookup').mockResolvedValue(ROLE_ID);
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map(), LookupSources: new Map() };

    await engine.ProcessFieldValue('@lookup:MJ: Roles.Name=@env:MJ_LOOKUP_ROLE', '/dir', null, null, 0, undefined, collector, 'RoleID');

    expect(collector.LookupSources?.get('RoleID')?.EnvSourced).toBe(true);
    vi.unstubAllEnvs();
  });
});
