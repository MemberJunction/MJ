/**
 * Field-level security on DatabaseProviderBase's record-name lookup.
 *
 * A record's name is read from the entity's name field(s). When field security withholds any of
 * them from the acting user, the lookup answers with no name and never runs the query, so every
 * server-side caller is covered rather than only the ones that check first.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseProviderBase, SaveSQLResult, DeleteSQLResult } from '../generic/databaseProviderBase';
import { EntityInfo, FieldPermissionAccess } from '../generic/entityInfo';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { CompositeKey } from '../generic/compositeKey';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';

const STAFF_ROLE_ID = 'B0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'B0000000-0000-0000-0000-000000000002';
const PEOPLE_ENTITY_ID = 'E0000000-0000-0000-0000-0000000000P1';

/** Read access per role for one field; any role not listed has no row, which fails closed. */
function permissions(fieldId: string, read: Record<string, FieldPermissionAccess>): Record<string, unknown>[] {
    return Object.entries(read).map(([roleId, access], i) => ({
        ID: `${fieldId}-perm-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: access,
        UpdateAccess: FieldPermissionAccess.NoAccess,
        CreateAccess: FieldPermissionAccess.NoAccess,
    }));
}

const OPEN_TO_ALL = { [STAFF_ROLE_ID]: FieldPermissionAccess.Allow, [INTERN_ROLE_ID]: FieldPermissionAccess.Allow };

/** `People`, named "FirstName LastName"; interns may read FirstName but are denied LastName. */
function peopleEntity(enableFieldLevelSecurity: boolean): EntityInfo {
    return new EntityInfo({
        ID: PEOPLE_ENTITY_ID,
        Name: 'People',
        SchemaName: 'dbo',
        BaseTable: 'Person',
        BaseView: 'vwPeople',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: enableFieldLevelSecurity,
        Permissions: [
            { EntityID: PEOPLE_ENTITY_ID, RoleID: STAFF_ROLE_ID, CanRead: true },
            { EntityID: PEOPLE_ENTITY_ID, RoleID: INTERN_ROLE_ID, CanRead: true },
        ],
        Fields: [
            { ID: 'p-id', EntityID: PEOPLE_ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'People', Type: 'uniqueidentifier', IsPrimaryKey: true, NeedsQuotes: true },
            { ID: 'p-first', EntityID: PEOPLE_ENTITY_ID, Sequence: 2, Name: 'FirstName', Entity: 'People', Type: 'nvarchar', IsNameField: true,
              EntityFieldPermissions: permissions('p-first', OPEN_TO_ALL) },
            { ID: 'p-last', EntityID: PEOPLE_ENTITY_ID, Sequence: 3, Name: 'LastName', Entity: 'People', Type: 'nvarchar', IsNameField: true,
              EntityFieldPermissions: permissions('p-last', { [STAFF_ROLE_ID]: FieldPermissionAccess.Allow, [INTERN_ROLE_ID]: FieldPermissionAccess.Deny }) },
        ],
    });
}

function buildUser(roleId: string, id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })];
    return u;
}

/** A provider over one entity, whose database answers every name query with Ada Lovelace. */
class RecordNameProvider extends DatabaseProviderBase {
    public SqlRun: string[] = [];

    constructor(private readonly entity: EntityInfo) {
        super();
    }

    public override EntityByName(entityName: string): EntityInfo {
        return entityName === this.entity.Name ? this.entity : (undefined as unknown as EntityInfo);
    }

    async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.SqlRun.push(sql);
        return [{ FirstName: 'Ada', LastName: 'Lovelace' } as unknown as T];
    }

    protected get UUIDFunctionPattern(): RegExp { return /^newid\(\)$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^getdate\(\)$/i; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec): Promise<RunQueryResult> {
        throw new Error('Not supported.');
    }
}

const ADA = new CompositeKey([{ FieldName: 'ID', Value: '11111111-1111-1111-1111-111111111111' }]);

describe('DatabaseProviderBase record names under field-level security', () => {
    let staff: UserInfo;
    let intern: UserInfo;

    beforeEach(() => {
        staff = buildUser(STAFF_ROLE_ID, 'staff');
        intern = buildUser(INTERN_ROLE_ID, 'intern');
    });

    it('returns the name to a user who may read every name field', async () => {
        const provider = new RecordNameProvider(peopleEntity(true));

        expect(await provider.GetEntityRecordName('People', ADA, staff)).toBe('Ada Lovelace');
    });

    it('withholds the name, without querying, when any one of the name fields is denied', async () => {
        const provider = new RecordNameProvider(peopleEntity(true));

        expect(await provider.GetEntityRecordName('People', ADA, intern)).toBe('');
        expect(provider.SqlRun).toHaveLength(0);
    });

    it('withholds a denied name from a batch lookup', async () => {
        const provider = new RecordNameProvider(peopleEntity(true));

        const [result] = await provider.GetEntityRecordNames([{ EntityName: 'People', CompositeKey: ADA }], intern);

        expect(result.RecordName).toBeFalsy();
        expect(result.Success).toBe(false);
        expect(provider.SqlRun).toHaveLength(0);
    });

    it('withholds the name when no user is given on an entity with field security on', async () => {
        const provider = new RecordNameProvider(peopleEntity(true));

        expect(await provider.GetEntityRecordName('People', ADA)).toBe('');
        expect(provider.SqlRun).toHaveLength(0);
    });

    it('returns the name with no user when field security is off', async () => {
        const provider = new RecordNameProvider(peopleEntity(false));

        expect(await provider.GetEntityRecordName('People', ADA)).toBe('Ada Lovelace');
        expect(await provider.GetEntityRecordName('People', ADA, intern)).toBe('Ada Lovelace');
    });

    it('does not serve one user the name another user looked up', async () => {
        const provider = new RecordNameProvider(peopleEntity(true));

        await provider.GetEntityRecordName('People', ADA, staff);

        expect(await provider.GetEntityRecordName('People', ADA, intern)).toBe('');
        expect(provider.GetCachedRecordNameOnlyIfCached('People', ADA)).toBeUndefined();
    });
});
