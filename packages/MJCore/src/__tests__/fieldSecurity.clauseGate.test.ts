/**
 * Field-Level Security — the denied-field gate on caller-authored SQL.
 *
 * Every test here runs the gate through `ProviderBase.AssertPredicatesRespectFieldSecurity`, the
 * entry point every RunView path calls, so a test proves what a caller would actually see. The
 * statement-level API (`FieldSecuritySQLGate.AssertStatementAllowed`), used for saved-query SQL,
 * is tested directly at the end.
 *
 * Fixture: `Employees` (field security on) denies the intern `Salary`, `BankAccount` and
 * `Doseμg`; `Accounts` has field security off and happens to have its own `Salary` column.
 */

import { describe, it, expect } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { EntityInfo, FieldPermissionAccess, FieldSecurityDenialMessage, FieldSecurityError, RecordDependency, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import {
    DatasetResultType,
    DatasetStatusResultType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    ILocalStorageProvider,
    IMetadataProvider,
    PotentialDuplicateResponse,
    ProviderType,
    RunViewResult,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';
import { BaseEntity } from '../generic/baseEntity';
import { FieldSecuritySQLGate } from '../generic/fieldSecuritySQLGate';

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const EMPLOYEES_ID = 'entity-employees';
const ACCOUNTS_ID = 'entity-accounts';

function openTo(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

function field(entityId: string, entityName: string, id: string, name: string, sequence: number, roles: string[] | null): Record<string, unknown> {
    return {
        ID: id, EntityID: entityId, Sequence: sequence, Name: name, Entity: entityName, Type: 'nvarchar',
        IsPrimaryKey: name === 'ID', EntityFieldPermissions: roles ? openTo(id, roles) : [],
    };
}

function entity(id: string, name: string, view: string, table: string, fls: boolean, fields: Record<string, unknown>[]): EntityInfo {
    return new EntityInfo({
        ID: id, Name: name, SchemaName: 'dbo', BaseTable: table, BaseView: view, EnableFieldLevelSecurity: fls,
        Permissions: [HR_ROLE_ID, INTERN_ROLE_ID].map(r => ({ EntityID: id, RoleID: r, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true })),
        Fields: fields,
    });
}

const both = [HR_ROLE_ID, INTERN_ROLE_ID];
const hrOnly = [HR_ROLE_ID];

function employees(): EntityInfo {
    return entity(EMPLOYEES_ID, 'Employees', 'vwEmployees', 'Employee', true, [
        field(EMPLOYEES_ID, 'Employees', 'e-id', 'ID', 1, null),
        field(EMPLOYEES_ID, 'Employees', 'e-name', 'Name', 2, both),
        field(EMPLOYEES_ID, 'Employees', 'e-salary', 'Salary', 3, hrOnly),
        field(EMPLOYEES_ID, 'Employees', 'e-bank', 'BankAccount', 4, hrOnly),
        field(EMPLOYEES_ID, 'Employees', 'e-dose', 'Doseμg', 5, hrOnly), // GREEK SMALL LETTER MU
        field(EMPLOYEES_ID, 'Employees', 'e-notes', 'Notes', 6, both),
        field(EMPLOYEES_ID, 'Employees', 'e-manager', 'ManagerID', 7, both),
    ]);
}

function accounts(): EntityInfo {
    return entity(ACCOUNTS_ID, 'Accounts', 'vwAccounts', 'Account', false, [
        field(ACCOUNTS_ID, 'Accounts', 'a-id', 'ID', 1, null),
        field(ACCOUNTS_ID, 'Accounts', 'a-name', 'Name', 2, null),
        field(ACCOUNTS_ID, 'Accounts', 'a-salary', 'Salary', 3, null),
        field(ACCOUNTS_ID, 'Accounts', 'a-owner', 'OwnerID', 4, null),
    ]);
}

function buildUser(roleIds: string[], id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

const intern = buildUser([INTERN_ROLE_ID], 'intern');
const hr = buildUser([HR_ROLE_ID], 'hr');

class GateTestProvider extends ProviderBase {
    private _localStorage: ILocalStorageProvider = {
        async GetItem() { return null; },
        async SetItem() { /* noop */ },
        async Remove() { /* noop */ },
        async ClearCategory() { /* noop */ },
        async GetCategoryKeys() { return []; },
    };
    private readonly _entities = [employees(), accounts()];

    constructor(private readonly platform: 'sqlserver' | 'postgresql' = 'sqlserver') {
        super();
    }
    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.toLowerCase() === name?.toLowerCase());
    }
    public override EntityByID(id: string): EntityInfo | undefined {
        return this._entities.find(e => e.ID === id);
    }
    public assertPredicates(params: RunViewParams, user?: UserInfo): void {
        return this['AssertPredicatesRespectFieldSecurity'](params, user);
    }
    override get PlatformKey() { return this.platform; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_i: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], TotalRowCount: 0, ExecutionTime: 0, RowCount: 0, UserViewRunID: '', ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [], Fields: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_s: QueryExecutionSpec, _u?: UserInfo): Promise<RunQueryResult> { throw new Error('n/a'); }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public get InstanceConnectionString(): string { return 'fls-gate-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

/** The gate's error message for a RunView, or null when it lets the request through. */
function refusal(params: Partial<RunViewParams>, user: UserInfo = intern, platform: 'sqlserver' | 'postgresql' = 'sqlserver'): string | null {
    try {
        new GateTestProvider(platform).assertPredicates({ EntityName: 'Employees', ...params } as RunViewParams, user);
        return null;
    } catch (e: unknown) {
        expect(e).toBeInstanceOf(FieldSecurityError);
        return e instanceof Error ? e.message : String(e);
    }
}

/** A loaded saved view, as RunView receives it in `ViewEntity`. */
function savedView(values: Record<string, string>): BaseEntity {
    return { Get: (name: string) => (name === 'EntityID' ? EMPLOYEES_ID : values[name] ?? null) } as unknown as BaseEntity;
}

describe('the gate reads SQL the way the database does', () => {
    it('does not refuse a denied name inside a string literal', () => {
        expect(refusal({ ExtraFilter: "Notes LIKE '%Salary%'" })).toBeNull();
    });

    it('does not refuse a denied name inside a comment', () => {
        expect(refusal({ ExtraFilter: "Name = 'Ada' /* Salary */" })).toBeNull();
    });

    it('still refuses the bracketed and quoted spellings of a denied name', () => {
        expect(refusal({ ExtraFilter: '[Salary] > 1' })).toBe(FieldSecurityDenialMessage('Salary', 'Employees'));
        expect(refusal({ OrderBy: '"Salary" DESC' })).toBe(FieldSecurityDenialMessage('Salary', 'Employees'));
    });

    it('refuses a look-alike spelling the database may resolve to the denied column (MICRO SIGN for μ)', () => {
        expect(refusal({ ExtraFilter: '[Doseµg] > 1' })).not.toBeNull();
    });

    it('refuses a look-alike spelling the database may resolve to the denied column (KELVIN SIGN for K)', () => {
        expect(refusal({ ExtraFilter: "[BanKAccount] LIKE '1%'" })).not.toBeNull();
    });

    it('refuses an accented spelling an accent-insensitive collation folds onto the denied column', () => {
        expect(refusal({ ExtraFilter: '[Saláry] > 1' })).not.toBeNull();
    });

    it('fails closed on text it cannot read, for a user carrying denials', () => {
        expect(refusal({ ExtraFilter: "Name = 'unclosed" })).not.toBeNull();
    });

    it('lets the same unreadable text through to the database for a user denied nothing', () => {
        expect(refusal({ ExtraFilter: "Name = 'unclosed" }, hr)).toBeNull();
    });
});

describe('every effective clause slot is checked', () => {
    it('refuses an OverrideExcludeFilter that reads a denied field', () => {
        expect(refusal({ OverrideExcludeFilter: 'Salary > 200000' })).toBe(FieldSecurityDenialMessage('Salary', 'Employees'));
    });

    it("refuses a loaded saved view's stored WhereClause that reads a denied field", () => {
        expect(refusal({ ViewEntity: savedView({ WhereClause: 'Salary > 200000' }) })).not.toBeNull();
    });

    it("refuses a loaded saved view's stored OrderByClause that reads a denied field", () => {
        expect(refusal({ ViewEntity: savedView({ OrderByClause: 'Salary DESC' }) })).not.toBeNull();
    });

    it('resolves the entity from a loaded ViewEntity when EntityName is absent', () => {
        expect(refusal({ EntityName: undefined, ViewID: 'v-1', ViewEntity: savedView({}), ExtraFilter: 'Salary > 1' })).not.toBeNull();
    });
});

describe('subqueries into an entity the user is denied fields on', () => {
    it('refuses a denied column read through a subquery, even when the filtered entity has no field security', () => {
        expect(refusal({ EntityName: 'Accounts', ExtraFilter: 'OwnerID IN (SELECT e.ID FROM vwEmployees e WHERE e.Salary > 1)' })).not.toBeNull();
    });

    it("names the filtered entity in the refusal, never the subquery's", () => {
        expect(refusal({ EntityName: 'Accounts', ExtraFilter: 'OwnerID IN (SELECT e.ID FROM dbo.vwEmployees e WHERE e.Salary > 1)' }))
            .toBe(FieldSecurityDenialMessage('Salary', 'Accounts'));
    });

    it("allows a column of another entity that shares the denied column's name when its qualifier binds there", () => {
        expect(refusal({ EntityName: 'Accounts', ExtraFilter: 'ID IN (SELECT a.ID FROM vwAccounts a WHERE a.Salary > 1)' })).toBeNull();
    });

    it('allows a subquery that names only permitted columns', () => {
        expect(refusal({ ExtraFilter: 'ManagerID IN (SELECT e.ID FROM vwEmployees e WHERE LEN(e.Name) * 2 > 10)' })).toBeNull();
    });
});

describe('whole-row constructs, for a user denied something on an entity the SQL reads', () => {
    it('refuses the FOR JSON subquery that names no column', () => {
        const clause = `(SELECT x.* FROM [dbo].[vwEmployees] x WHERE x.ID = ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) LIKE N'%ary":2%'`;
        expect(refusal({ ExtraFilter: clause })).not.toBeNull();
    });

    it('refuses FOR XML', () => {
        expect(refusal({ ExtraFilter: `(SELECT e.ID, e.Name FROM vwEmployees e WHERE e.ID = ID FOR XML RAW) LIKE '%1%'` })).not.toBeNull();
    });

    it('refuses CHECKSUM(*) and BINARY_CHECKSUM(*) in the outer predicate', () => {
        expect(refusal({ ExtraFilter: 'CHECKSUM(*) = 12345' })).not.toBeNull();
        expect(refusal({ OrderBy: 'BINARY_CHECKSUM(*)' })).not.toBeNull();
    });

    it('refuses SELECT * and its DISTINCT and TOP forms in a subquery', () => {
        for (const clause of [
            'ID IN (SELECT * FROM vwEmployees)',
            'ID IN (SELECT DISTINCT * FROM vwEmployees)',
            'ID IN (SELECT TOP 1 * FROM vwEmployees)',
            'ID IN (SELECT TOP (1) * FROM vwEmployees)',
        ]) {
            expect(refusal({ ExtraFilter: clause }), clause).not.toBeNull();
        }
    });

    it('refuses a SELECT * subquery over the restricted entity from an entity without field security', () => {
        expect(refusal({ EntityName: 'Accounts', ExtraFilter: 'EXISTS (SELECT 1 FROM (SELECT * FROM vwEmployees) z WHERE z.ID = OwnerID)' })).not.toBeNull();
    });

    it('refuses a PostgreSQL whole-row reference to the outer row and to a subquery alias', () => {
        expect(refusal({ ExtraFilter: `row_to_json(vwEmployees)::text LIKE '%1%'` }, intern, 'postgresql')).not.toBeNull();
        expect(refusal({ ExtraFilter: `(SELECT row_to_json(e) FROM vwEmployees e WHERE e.ID = ID)::text LIKE '%1%'` }, intern, 'postgresql')).not.toBeNull();
    });

    it('refuses a column alias list, which renames a denied column', () => {
        expect(refusal({ ExtraFilter: `ID IN (SELECT e.x1 FROM vwEmployees AS e(x1, x2, x3) WHERE e.x3 > 1)` }, intern, 'postgresql')).not.toBeNull();
    });

    it('keeps COUNT(*), EXISTS (SELECT * …) and multiplication working', () => {
        expect(refusal({ ExtraFilter: '(SELECT COUNT(*) FROM vwEmployees e WHERE e.ManagerID = ID) > 2' })).toBeNull();
        expect(refusal({ ExtraFilter: 'EXISTS (SELECT * FROM vwEmployees e WHERE e.ManagerID = ID)' })).toBeNull();
        expect(refusal({ OrderBy: 'LEN(Name) * 2 DESC' })).toBeNull();
    });

    it('lets a user denied nothing use whole-row constructs and ordinary subqueries', () => {
        expect(refusal({ ExtraFilter: 'CHECKSUM(*) = 1' }, hr)).toBeNull();
        expect(refusal({ ExtraFilter: 'ID IN (SELECT * FROM vwEmployees)' }, hr)).toBeNull();
    });
});

describe('the refusal for a denied column and for a nonexistent one is the same', () => {
    it('turns a SQL Server "Invalid column name" error into the denied-field error, for a user carrying denials', () => {
        const converted = FieldSecuritySQLGate.ErrorForInvalidColumn(new Error("Invalid column name 'Salry'."), employees(), intern);
        expect(converted?.message).toBe(FieldSecurityDenialMessage('Salry', 'Employees'));
        expect(refusal({ ExtraFilter: 'Salary > 1' })).toBe(FieldSecurityDenialMessage('Salary', 'Employees'));
    });

    it('reads the column out of the multi-part and PostgreSQL forms', () => {
        const e = employees();
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error('The multi-part identifier "x.Salry" could not be bound.'), e, intern)?.message)
            .toBe(FieldSecurityDenialMessage('Salry', 'Employees'));
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error('column "salry" does not exist'), e, intern)?.message)
            .toBe(FieldSecurityDenialMessage('salry', 'Employees'));
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error('column e.salry does not exist'), e, intern)?.message)
            .toBe(FieldSecurityDenialMessage('salry', 'Employees'));
    });

    it('reports a PostgreSQL unquoted denied name in lower case, as PostgreSQL reports an unknown one', () => {
        expect(refusal({ ExtraFilter: 'Salary > 1' }, intern, 'postgresql')).toBe(FieldSecurityDenialMessage('salary', 'Employees'));
    });

    it('leaves the database error alone for a user denied nothing, and for other errors', () => {
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error("Invalid column name 'Salry'."), employees(), hr)).toBeNull();
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error('Deadlock victim'), employees(), intern)).toBeNull();
    });
});

describe('FieldSecuritySQLGate.AssertStatementAllowed (saved-query SQL)', () => {
    const catalog = [employees(), accounts()];
    const check = (sql: string, user: UserInfo = intern): string | null => {
        try {
            FieldSecuritySQLGate.AssertStatementAllowed(sql, user, catalog, 'sqlserver');
            return null;
        } catch (e: unknown) {
            return e instanceof Error ? e.message : String(e);
        }
    };

    it('refuses a denied column in any clause: select list, WHERE, JOIN, GROUP BY, ORDER BY, HAVING', () => {
        for (const sql of [
            'SELECT e.Salary FROM vwEmployees e',
            'SELECT e.ID FROM vwEmployees e WHERE e.Salary > 1',
            'SELECT a.ID FROM vwAccounts a JOIN vwEmployees e ON e.Salary = a.Salary',
            'SELECT COUNT(*) FROM vwEmployees e GROUP BY e.Salary',
            'SELECT e.ID FROM vwEmployees e ORDER BY e.Salary',
            'SELECT e.ManagerID FROM vwEmployees e GROUP BY e.ManagerID HAVING MAX(e.Salary) > 1',
            'SELECT UPPER(e.BankAccount) AS x FROM vwEmployees e',
        ]) {
            expect(check(sql), sql).toBe(FieldSecurityDenialMessage(sql.includes('BankAccount') ? 'BankAccount' : 'Salary', 'Employees'));
        }
    });

    it("allows another entity's same-named column when its qualifier binds there", () => {
        expect(check('SELECT a.Salary, e.Name FROM vwAccounts a JOIN vwEmployees e ON e.ID = a.OwnerID')).toBeNull();
    });

    it('fails closed on SELECT * over a restricted entity, but not for a user denied nothing', () => {
        expect(check('SELECT * FROM vwEmployees')).not.toBeNull();
        expect(check('SELECT * FROM vwEmployees', hr)).toBeNull();
    });

    it('allows alias.* over an entity the user is denied nothing on, beside a restricted one', () => {
        expect(check('SELECT a.*, e.Name FROM vwAccounts a JOIN vwEmployees e ON e.ID = a.OwnerID')).toBeNull();
        expect(check('SELECT a.*, e.* FROM vwAccounts a JOIN vwEmployees e ON e.ID = a.OwnerID')).not.toBeNull();
    });

    it('checks only entities the SQL reads', () => {
        expect(check('SELECT * FROM vwAccounts')).toBeNull();
    });
});
