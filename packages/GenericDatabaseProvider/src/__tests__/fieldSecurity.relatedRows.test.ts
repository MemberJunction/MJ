/**
 * Field and row security on related rows loaded with a single record (Load with
 * EntityRelationshipsToLoad).
 *
 * The parent row of a Load gets the user's allowed-column list and Read row filter; the related
 * rows must get the same: no denied column in the SELECT, the Read row filter applied, and no
 * rows at all when the user cannot read the related entity. Unrestricted users keep the SQL they
 * had before.
 */

import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    EntityRelationshipInfo,
    UserInfo,
    UserRoleInfo,
    ProviderType,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '@memberjunction/core';
import type { RunQueryResult } from '@memberjunction/core';
import { CompositeKey } from '@memberjunction/core';
import { RecordMergeResult } from '@memberjunction/core';
import { TransactionGroupBase } from '@memberjunction/core';
import { QueryExecutionSpec } from '@memberjunction/core';

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
class RelatedRowsTestProvider extends GenericDatabaseProvider {
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

    public relatedSQL(rel: EntityRelationshipInfo, relEntity: EntityInfo, pk: unknown, quoted: boolean, user?: UserInfo): string | null {
        return this.BuildRelatedRowsLoadSQL(rel, relEntity, pk, quoted, user);
    }

    // --- Abstract-member implementations (just enough to satisfy the type system) ---
    protected get UUIDFunctionPattern(): RegExp { return RelatedRowsTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return RelatedRowsTestProvider._defaultPattern; }
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
    public get InstanceConnectionString(): string { return 'related-rows-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return {
            GetItem: async () => null,
            SetItem: async () => {},
            Remove: async () => {},
        } as unknown as ILocalStorageProvider;
    }
}


const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const OUTSIDER_ROLE_ID = 'A0000000-0000-0000-0000-000000000009';
const ENTITY_ID = 'entity-employees';

function openTo(fieldId: string, roles: string[] = [HR_ROLE_ID, INTERN_ROLE_ID]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: 'Allow',
        UpdateAccess: 'Allow',
        CreateAccess: 'Allow',
    }));
}

/** The related entity: Salary is readable by HR only. */
function employeeEntity(fls = true): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        EnableFieldLevelSecurity: fls,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-dept', EntityID: ENTITY_ID, Sequence: 2, Name: 'DepartmentID', Entity: 'Employees', Type: 'uniqueidentifier', EntityFieldPermissions: openTo('f-dept') },
            { ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 3, Name: 'Salary', Entity: 'Employees', Type: 'nvarchar', Length: 50, EntityFieldPermissions: openTo('f-salary', [HR_ROLE_ID]) },
        ],
    });
}

function oneToMany(): EntityRelationshipInfo {
    return new EntityRelationshipInfo({
        Type: 'One To Many',
        RelatedEntityJoinField: 'DepartmentID',
        RelatedEntityBaseView: 'vwEmployees',
    });
}

function manyToMany(): EntityRelationshipInfo {
    return new EntityRelationshipInfo({
        Type: 'Many To Many',
        RelatedEntityJoinField: 'ID',
        RelatedEntityBaseView: 'vwEmployees',
        JoinView: 'vwProjectMembers',
        JoinEntityJoinField: 'ProjectID',
        JoinEntityInverseJoinField: 'EmployeeID',
    });
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

const intern = () => buildUser([INTERN_ROLE_ID]);
const hr = () => buildUser([HR_ROLE_ID]);
const outsider = () => buildUser([OUTSIDER_ROLE_ID]);
const DEPT = 'D0000000-0000-0000-0000-000000000001';

function withRowFilter(entity: EntityInfo, filter: string): EntityInfo {
    vi.spyOn(entity, 'GetEffectiveRowFilterWhereClause').mockReturnValue(filter);
    return entity;
}

describe('BuildRelatedRowsLoadSQL — one to many', () => {
    it('keeps SELECT * and no filter for an unrestricted user (unchanged SQL)', () => {
        const p = new RelatedRowsTestProvider();
        expect(p.relatedSQL(oneToMany(), employeeEntity(), DEPT, true, hr()))
            .toBe(`SELECT * FROM [dbo].[vwEmployees] WHERE [DepartmentID] = '${DEPT}'`);
    });

    it('names only the allowed columns for a user denied a field', () => {
        const p = new RelatedRowsTestProvider();
        const sql = p.relatedSQL(oneToMany(), employeeEntity(), DEPT, true, intern());
        expect(sql).toBe(`SELECT [ID], [DepartmentID] FROM [dbo].[vwEmployees] WHERE [DepartmentID] = '${DEPT}'`);
        expect(sql).not.toContain('Salary');
    });

    it('appends the Read row filter', () => {
        const p = new RelatedRowsTestProvider();
        const rel = withRowFilter(employeeEntity(), "OrganizationID = 'org-1'");
        expect(p.relatedSQL(oneToMany(), rel, DEPT, true, intern()))
            .toBe(`SELECT [ID], [DepartmentID] FROM [dbo].[vwEmployees] WHERE [DepartmentID] = '${DEPT}' AND (OrganizationID = 'org-1')`);
    });

    it('returns null (skip the relationship) when the user cannot read the related entity', () => {
        const p = new RelatedRowsTestProvider();
        expect(p.relatedSQL(oneToMany(), employeeEntity(), DEPT, true, outsider())).toBeNull();
    });

    it('escapes a quoted key value', () => {
        const p = new RelatedRowsTestProvider();
        const sql = p.relatedSQL(oneToMany(), employeeEntity(), "a'b", true, hr());
        expect(sql).toBe(`SELECT * FROM [dbo].[vwEmployees] WHERE [DepartmentID] = 'a''b'`);
    });

    it('narrows nothing when there is no user, matching the parent load', () => {
        const p = new RelatedRowsTestProvider();
        expect(p.relatedSQL(oneToMany(), employeeEntity(), 7, false, undefined))
            .toBe(`SELECT * FROM [dbo].[vwEmployees] WHERE [DepartmentID] = 7`);
    });
});

describe('BuildRelatedRowsLoadSQL — many to many', () => {
    const join = `INNER JOIN [dbo].[vwProjectMembers] _jv ON _theview.[ID] = _jv.[EmployeeID] WHERE _jv.[ProjectID] = 'P1'`;

    it('keeps _theview.* and the plain view for an unrestricted user (unchanged SQL)', () => {
        const p = new RelatedRowsTestProvider();
        expect(p.relatedSQL(manyToMany(), employeeEntity(), 'P1', true, hr()))
            .toBe(`SELECT _theview.* FROM [dbo].[vwEmployees] _theview ${join}`);
    });

    it('qualifies the allowed columns with the view alias for a user denied a field', () => {
        const p = new RelatedRowsTestProvider();
        expect(p.relatedSQL(manyToMany(), employeeEntity(), 'P1', true, intern()))
            .toBe(`SELECT _theview.[ID], _theview.[DepartmentID] FROM [dbo].[vwEmployees] _theview ${join}`);
    });

    it('applies the Read row filter inside a derived table so its columns cannot clash with the join view', () => {
        const p = new RelatedRowsTestProvider();
        const rel = withRowFilter(employeeEntity(), "OrganizationID = 'org-1'");
        expect(p.relatedSQL(manyToMany(), rel, 'P1', true, intern()))
            .toBe(`SELECT _theview.[ID], _theview.[DepartmentID] FROM (SELECT * FROM [dbo].[vwEmployees] WHERE (OrganizationID = 'org-1')) _theview ${join}`);
    });

    it('returns null when the user cannot read the related entity', () => {
        const p = new RelatedRowsTestProvider();
        expect(p.relatedSQL(manyToMany(), employeeEntity(), 'P1', true, outsider())).toBeNull();
    });
});
