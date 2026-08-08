/**
 * Field-Level Security — Workstream C SELECT-list intersection + user-search filtering.
 *
 * getRunTimeViewFieldArray/String: for a field-restricted user on the simple path, the
 * generated SELECT list must never name a denied column — explicit Fields and saved-view
 * columns are silently narrowed, and the empty-Fields case emits the explicit allowed-column
 * list instead of `SELECT *`. PKs always survive; `entity_object` requests are exempt
 * (entities hydrate from every column; their enforcement is the output boundary).
 *
 * createViewUserSearchSQL: denied fields are never searched — matching against a denied
 * column is a value oracle. LIKE path excludes them per field; the FTS index can't exclude
 * columns, so a denied FTS-indexed field forces the fallback to the per-field LIKE path.
 */

import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    UserRoleInfo,
    ProviderType,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '@memberjunction/core';
import type { RunQueryResult, RunViewParams } from '@memberjunction/core';
import { CompositeKey } from '@memberjunction/core';
import { RecordMergeResult } from '@memberjunction/core';
import { TransactionGroupBase } from '@memberjunction/core';
import { QueryExecutionSpec } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn(),
                Encrypt: vi.fn(),
                IsEncrypted: vi.fn().mockReturnValue(false),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
}));

// ---------------------------------------------------------------------------
// Concrete subclass exposing the protected members under test.
// Stub block patterned after SearchSQLTestProvider in createViewUserSearchSQL.test.ts.
// ---------------------------------------------------------------------------
class FlsSelectTestProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    private _entities: EntityInfo[] = [];

    public seedEntities(entities: EntityInfo[]): void {
        this._entities = entities;
    }
    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }

    public fieldString(params: RunViewParams, viewEntity: MJUserViewEntityExtended | null, user?: UserInfo): string {
        return this.getRunTimeViewFieldString(params, viewEntity, user);
    }
    public loadSelectList(entityInfo: EntityInfo, user?: UserInfo): string {
        return this.buildFieldSecuritySelectList(entityInfo, user);
    }
    public searchSQL(entityInfo: EntityInfo, term: string, user?: UserInfo): string {
        return this.createViewUserSearchSQL(entityInfo, term, user);
    }

    // --- Abstract-member implementations (just enough to satisfy the type system) ---
    protected get UUIDFunctionPattern(): RegExp { return FlsSelectTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return FlsSelectTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    public async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<{ EntityID: string; PrimaryKey: CompositeKey; RecordName: string }[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey; }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] } as unknown as PotentialDuplicateResponse;
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as unknown as RecordMergeResult['Request'], KeyValueOfSurvivingRecord: new CompositeKey() } as unknown as RecordMergeResult;
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] } as unknown as DatasetResultType;
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] } as unknown as DatasetStatusResultType;
    }
    public get InstanceConnectionString(): string { return 'fls-select-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return {
            GetItem: async () => null,
            SetItem: async () => {},
            Remove: async () => {},
        } as unknown as ILocalStorageProvider;
    }
}

// ---------------------------------------------------------------------------
// Real EntityInfo fixtures — FLS aggregation must be live, so these go through
// the actual constructor (mirroring MJCore's fieldSecurity test builders).
// ---------------------------------------------------------------------------

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'entity-employees';

function employeeEntityInit(opts: { fls?: boolean; entityFtx?: boolean; salaryFtx?: boolean } = {}): Record<string, unknown> {
    const { fls = true, entityFtx = false, salaryFtx = false } = opts;
    const salaryPerms = fls
        ? [{ ID: 'p1', EntityFieldID: 'f-salary', RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true }]
        : [];
    return {
        ID: ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        FullTextSearchEnabled: entityFtx,
        FullTextSearchFunction: 'fnSearchEmployees',
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', Length: 100, IncludeInUserSearchAPI: true, UserSearchPredicateAPI: 'Contains' },
            {
                ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'nvarchar', Length: 50,
                IncludeInUserSearchAPI: true, UserSearchPredicateAPI: 'Contains', FullTextSearchEnabled: salaryFtx,
                EntityFieldPermissions: salaryPerms,
            },
            { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 4, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', Length: 200, IncludeInUserSearchAPI: true, UserSearchPredicateAPI: 'Contains' },
        ],
    };
}

function buildUser(roleIds: string[], id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Test User';
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

function setup(opts: Parameters<typeof employeeEntityInit>[0] = {}): { provider: FlsSelectTestProvider; entity: EntityInfo } {
    const provider = new FlsSelectTestProvider();
    const entity = new EntityInfo(employeeEntityInit(opts));
    provider.seedEntities([entity]);
    return { provider, entity };
}

/** A minimal saved-view double: ViewEntityInfo + Columns are all the SUT reads. */
function fakeView(entity: EntityInfo, columnNames: string[]): MJUserViewEntityExtended {
    return {
        ViewEntityInfo: entity,
        Columns: columnNames.map(name => ({
            hidden: false,
            Name: name,
            EntityField: entity.Fields.find(f => f.Name === name),
        })),
    } as unknown as MJUserViewEntityExtended;
}

const params = (extra: Partial<RunViewParams> = {}): RunViewParams =>
    ({ EntityName: 'Employees', ...extra }) as RunViewParams;

const intern = () => buildUser([INTERN_ROLE_ID]);
const hr = () => buildUser([HR_ROLE_ID]);

// ═══════════════════════════════════════════════════════════════════════════
// 1. SELECT-list intersection
// ═══════════════════════════════════════════════════════════════════════════

describe('getRunTimeViewFieldString — field security intersection', () => {
    it('silently drops a denied column from an explicit Fields list (PKs force-added)', () => {
        const { provider } = setup();
        const sql = provider.fieldString(params({ Fields: ['Name', 'Salary'] }), null, intern());
        expect(sql).toBe('[ID],[Name]');
    });

    it('emits the explicit allowed-column list instead of SELECT * when Fields is empty', () => {
        const { provider } = setup();
        const sql = provider.fieldString(params(), null, intern());
        expect(sql).toBe('[ID],[Name],[Notes]');
        expect(sql).not.toContain('Salary');
    });

    it('keeps SELECT * for an empty Fields list when the user is unrestricted', () => {
        const { provider } = setup();
        expect(provider.fieldString(params(), null, hr())).toBe('*');
    });

    it('keeps SELECT * for an empty Fields list on entities with no field security', () => {
        const { provider } = setup({ fls: false });
        expect(provider.fieldString(params(), null, intern())).toBe('*');
    });

    it('silently drops a denied column from saved-view columns (PKs force-added)', () => {
        const { provider, entity } = setup();
        const view = fakeView(entity, ['Name', 'Salary', 'Notes']);
        const sql = provider.fieldString(params(), view, intern());
        expect(sql).toBe('[Name],[Notes],[ID]');
    });

    it('leaves saved-view columns intact for an unrestricted user', () => {
        const { provider, entity } = setup();
        const view = fakeView(entity, ['Name', 'Salary']);
        expect(provider.fieldString(params(), view, hr())).toBe('[Name],[Salary],[ID]');
    });

    it('does NOT filter entity_object requests — entities hydrate from every column', () => {
        const { provider, entity } = setup();
        const allFields = entity.Fields.map(f => f.Name);
        const sql = provider.fieldString(params({ Fields: allFields, ResultType: 'entity_object' }), null, intern());
        expect(sql).toContain('[Salary]');
    });

    it('leaves an unrestricted user\'s explicit Fields list untouched', () => {
        const { provider } = setup();
        expect(provider.fieldString(params({ Fields: ['Name', 'Salary'] }), null, hr())).toBe('[ID],[Name],[Salary]');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1b. Single-record Load — the SELECT list
//
// An agent running under a restricted service account calls Load() on one record. Before
// this, that issued `SELECT *` and pulled denied values into server memory. Now it names
// only the allowed columns; the omitted keys mark those fields not-loaded on the entity,
// so the next save skips them.
// ═══════════════════════════════════════════════════════════════════════════

describe('buildFieldSecuritySelectList — single-record Load', () => {
    it('names only the allowed columns for a restricted user', () => {
        const { provider, entity } = setup();
        expect(provider.loadSelectList(entity, intern())).toBe('[ID], [Name], [Notes]');
    });

    it('keeps the literal SELECT * for an unrestricted user (byte-identical SQL, no plan churn)', () => {
        const { provider, entity } = setup();
        expect(provider.loadSelectList(entity, hr())).toBe('*');
    });

    it('keeps SELECT * on entities with no field security, and with no user', () => {
        const { provider: p1, entity: e1 } = setup({ fls: false });
        expect(p1.loadSelectList(e1, intern())).toBe('*');
        const { provider: p2, entity: e2 } = setup();
        expect(p2.loadSelectList(e2, undefined)).toBe('*');
    });

    it('always keeps the primary key', () => {
        const { provider, entity } = setup();
        expect(provider.loadSelectList(entity, intern())).toContain('[ID]');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. UserSearchString — denied fields are never searched
// ═══════════════════════════════════════════════════════════════════════════

describe('createViewUserSearchSQL — field security', () => {
    it('excludes a denied field from the LIKE search (the value-probe oracle)', () => {
        const { provider, entity } = setup();
        const sql = provider.searchSQL(entity, 'secret', intern());
        expect(sql).not.toContain('[Salary]');
        expect(sql).toContain('[Name]');
        expect(sql).toContain('[Notes]');
    });

    it('searches all fields for an unrestricted user (unchanged behavior)', () => {
        const { provider, entity } = setup();
        const sql = provider.searchSQL(entity, 'secret', hr());
        expect(sql).toContain('[Salary]');
        expect(sql).toContain('[Name]');
    });

    it('returns empty search SQL when every searchable field is denied', () => {
        // Deny read on Name, Salary, AND Notes for the intern (Allow rows for HR only).
        const init = employeeEntityInit();
        const fields = init['Fields'] as Array<Record<string, unknown>>;
        for (const f of fields) {
            if (f['Name'] === 'Name' || f['Name'] === 'Notes') {
                f['EntityFieldPermissions'] = [
                    { ID: `p-${f['Name']}`, EntityFieldID: f['ID'], RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true },
                ];
            }
        }
        const provider = new FlsSelectTestProvider();
        const entity = new EntityInfo(init);
        provider.seedEntities([entity]);

        expect(provider.searchSQL(entity, 'secret', intern())).toBe('');
    });

    it('keeps the FTS path when no denied field is FTS-indexed', () => {
        const { provider, entity } = setup({ entityFtx: true, salaryFtx: false });
        const sql = provider.searchSQL(entity, 'secret', intern());
        expect(sql).toContain('fnSearchEmployees');
    });

    it('falls back to the per-field LIKE path (denied excluded) when a denied field IS FTS-indexed', () => {
        const { provider, entity } = setup({ entityFtx: true, salaryFtx: true });
        const sql = provider.searchSQL(entity, 'secret', intern());
        expect(sql).not.toContain('fnSearchEmployees');
        expect(sql).not.toContain('[Salary]');
        expect(sql).toContain('[Name]');
    });

    it('keeps the FTS path for an unrestricted user even when a restricted field is FTS-indexed', () => {
        const { provider, entity } = setup({ entityFtx: true, salaryFtx: true });
        expect(provider.searchSQL(entity, 'secret', hr())).toContain('fnSearchEmployees');
    });
});
