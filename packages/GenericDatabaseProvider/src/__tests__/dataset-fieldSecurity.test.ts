import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    DeleteSQLResult,
    EntityInfo,
    FieldPermissionAccess,
    LocalCacheManager,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

/**
 * Dataset reads honor field-level security.
 *
 * A dataset item is a read of one entity's view, so a caller denied a field must neither receive
 * that field's values nor filter by it:
 * - a denied column is never selected for that caller, and is removed from the rows returned;
 * - a cached item, which holds full-width rows for every caller, is projected on the way out, and
 *   the shared slot is never narrowed by a restricted caller's read;
 * - a caller's ItemFilter passes the same denied-field gate as a RunView filter.
 */
class DatasetFlsProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return DatasetFlsProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return DatasetFlsProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `LIMIT ${maxRows} OFFSET ${startRow}`;
    }

    private seededEntities: EntityInfo[] = [];
    public SeedEntities(entities: EntityInfo[]): void { this.seededEntities = entities; }
    public override get Entities(): EntityInfo[] { return this.seededEntities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this.seededEntities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }
    public override EntityByID(id: string): EntityInfo | undefined {
        return this.seededEntities.find(e => e.ID === id);
    }

    public DatasetItems: Record<string, unknown>[] = [];
    public ItemStatements: string[] = [];
    /** The rows the database returns for every item: full width, the denied column included. */
    public ItemRows: Record<string, unknown>[] = [{ ID: 'p-1', Name: 'Ada', Salary: 250000, __mj_UpdatedAt: '2026-02-01T00:00:00.000Z' }];

    override async ExecuteSQL<T>(): Promise<Array<T>> {
        return this.DatasetItems as unknown as Array<T>;
    }
    /** Answers each item statement with the columns it selects, as the database would. */
    public BatchError: Error | null = null;
    override async ExecuteSQLBatch(queries: string[]): Promise<Record<string, unknown>[][]> {
        this.ItemStatements.push(...queries);
        if (this.BatchError) throw this.BatchError;
        return queries.map(sql => {
            const list = /^SELECT (.*?) FROM /.exec(sql)?.[1] ?? '*';
            const columns = list === '*' ? null : list.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            return this.ItemRows.map(row =>
                columns ? Object.fromEntries(Object.entries(row).filter(([key]) => columns.includes(key))) : { ...row },
            );
        });
    }

    private trustCache = false;
    public SetTrustLocalCache(trust: boolean): void { this.trustCache = trust; }
    override get TrustLocalCacheCompletely(): boolean { return this.trustCache; }
}

const PEOPLE_ENTITY_ID = 'E0000000-0000-0000-0000-0000000000F1';
const HR_ROLE_ID = 'R0000000-0000-0000-0000-0000000000F1';
const STAFF_ROLE_ID = 'R0000000-0000-0000-0000-0000000000F2';

function openTo(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

/** 'People' with field security on: Salary is readable only by HR. */
function peopleEntity(): EntityInfo {
    const field = (id: string, name: string, sequence: number, roles: string[] | null) => ({
        ID: id, EntityID: PEOPLE_ENTITY_ID, Sequence: sequence, Name: name, Entity: 'People', Type: 'nvarchar',
        IsPrimaryKey: name === 'ID', EntityFieldPermissions: roles ? openTo(id, roles) : [],
    });
    return new EntityInfo({
        ID: PEOPLE_ENTITY_ID, Name: 'People', SchemaName: '__mj', BaseTable: 'Person', BaseView: 'vwPeople',
        EnableFieldLevelSecurity: true,
        Permissions: [HR_ROLE_ID, STAFF_ROLE_ID].map(r => ({ EntityID: PEOPLE_ENTITY_ID, RoleID: r, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false })),
        Fields: [
            field('f-id', 'ID', 1, null),
            field('f-name', 'Name', 2, [HR_ROLE_ID, STAFF_ROLE_ID]),
            field('f-salary', 'Salary', 3, [HR_ROLE_ID]),
            field('f-updated', '__mj_UpdatedAt', 4, [HR_ROLE_ID, STAFF_ROLE_ID]),
        ],
    });
}

function user(id: string, roleIds: string[]): UserInfo {
    return new UserInfo(undefined, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true,
        UserRoles: roleIds.map(roleId => ({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })),
    });
}

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        DatasetID: 'ds-001', Dataset: 'PeopleDataset', Code: 'People', Entity: 'People', EntityID: PEOPLE_ENTITY_ID,
        EntitySchemaName: '__mj', EntityBaseView: 'vwPeople', WhereClause: null, DateFieldToCheck: '__mj_UpdatedAt',
        DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z', DatasetUpdatedAt: '2026-01-01T00:00:00.000Z', Columns: null,
        ...overrides,
    };
}

const staff = user('staff-user', [STAFF_ROLE_ID]);
const hr = user('hr-user', [HR_ROLE_ID]);

describe('dataset item rows are read for the caller', () => {
    let provider: DatasetFlsProvider;
    beforeEach(() => {
        provider = new DatasetFlsProvider();
        provider.SeedEntities([peopleEntity()]);
        provider.DatasetItems = [item()];
    });

    it('never selects a denied column for a restricted caller', async () => {
        await provider.GetDatasetByName('PeopleDataset', undefined, staff);
        expect(provider.ItemStatements[0]).not.toContain('Salary');
        expect(provider.ItemStatements[0]).not.toContain('*');
    });

    it('drops a denied column the item names explicitly', async () => {
        provider.DatasetItems = [item({ Columns: 'ID,Name,Salary' })];
        const result = await provider.GetDatasetByName('PeopleDataset', undefined, staff);
        expect(result.Success).toBe(true);
        expect(provider.ItemStatements[0]).not.toContain('Salary');
    });

    it('removes a denied column from the rows returned', async () => {
        const result = await provider.GetDatasetByName('PeopleDataset', undefined, staff);
        expect(result.Results[0].Results[0]).not.toHaveProperty('Salary');
        expect(result.Results[0].Results[0]).toHaveProperty('Name', 'Ada');
    });

    it('leaves an unrestricted caller\'s read untouched', async () => {
        const result = await provider.GetDatasetByName('PeopleDataset', undefined, hr);
        expect(provider.ItemStatements[0]).toBe('SELECT * FROM "__mj"."vwPeople" ');
        expect(result.Results[0].Results[0]).toHaveProperty('Salary', 250000);
    });

    it('refuses an ItemFilter that reads a denied column, with the field-security message, without querying', async () => {
        const result = await provider.GetDatasetByName('PeopleDataset', [{ ItemCode: 'People', Filter: 'Salary > 200000' }], staff);
        expect(result.Success).toBe(false);
        expect(result.Status).toMatch(/does not exist on entity 'People' or you do not have access to it/);
        expect(provider.ItemStatements).toEqual([]);
    });

    it('refuses the same ItemFilter in a status check', async () => {
        const result = await provider.GetDatasetStatusByName('PeopleDataset', [{ ItemCode: 'People', Filter: 'Salary > 200000' }], staff);
        expect(result.Success).toBe(false);
        expect(provider.ItemStatements).toEqual([]);
    });

    it('reports a filter on a column that does not exist the same way as one on a denied column', async () => {
        provider.BatchError = new Error("Invalid column name 'Salry'.");
        const missing = await provider.GetDatasetByName('PeopleDataset', [{ ItemCode: 'People', Filter: 'Salry > 200000' }], staff);
        expect(missing.Success).toBe(false);
        expect(missing.Status).toBe("Field 'Salry' does not exist on entity 'People' or you do not have access to it.");
    });

    it('lets an unrestricted caller filter on the column', async () => {
        const result = await provider.GetDatasetByName('PeopleDataset', [{ ItemCode: 'People', Filter: 'Salary > 200000' }], hr);
        expect(result.Success).toBe(true);
    });
});

describe('cached dataset items stay full width and are projected per caller', () => {
    afterEach(() => vi.restoreAllMocks());

    function cachedProvider(): { provider: DatasetFlsProvider; slots: Map<string, Record<string, unknown>[]> } {
        const provider = new DatasetFlsProvider();
        provider.SeedEntities([peopleEntity()]);
        provider.DatasetItems = [item()];
        provider.SetTrustLocalCache(true);
        const slots = new Map<string, Record<string, unknown>[]>();
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        vi.spyOn(LocalCacheManager.Instance, 'GetRunViewResult').mockImplementation(async (fingerprint: string) => {
            const rows = slots.get(fingerprint);
            return rows ? { results: rows, maxUpdatedAt: '2026-02-01T00:00:00.000Z', rowCount: rows.length } : null;
        });
        vi.spyOn(LocalCacheManager.Instance, 'SetRunViewResult').mockImplementation(async (fingerprint: string, _params, rows) => {
            slots.set(fingerprint, rows as Record<string, unknown>[]);
        });
        return { provider, slots };
    }

    it('projects a slot an unrestricted caller warmed before serving it to a restricted one', async () => {
        const { provider } = cachedProvider();
        await provider.GetDatasetByName('PeopleDataset', undefined, hr);
        const served = await provider.GetDatasetByName('PeopleDataset', undefined, staff);

        expect(provider.ItemStatements).toHaveLength(1); // the second read was a cache hit
        expect(served.Results[0].Results[0]).not.toHaveProperty('Salary');
    });

    it('never writes a restricted caller\'s narrowed read into the shared slot', async () => {
        const { provider, slots } = cachedProvider();
        await provider.GetDatasetByName('PeopleDataset', undefined, staff);
        const later = await provider.GetDatasetByName('PeopleDataset', undefined, hr);

        expect([...slots.values()].every(rows => rows.every(row => 'Salary' in row))).toBe(true);
        expect(later.Results[0].Results[0]).toHaveProperty('Salary', 250000);
    });
});
