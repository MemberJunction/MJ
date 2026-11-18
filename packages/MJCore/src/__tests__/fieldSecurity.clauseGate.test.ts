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
import { FieldSecuritySQLGate, FieldSecurityUnresolvableSQLMessage, FoldIdentifier } from '../generic/fieldSecuritySQLGate';

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
/**
 * A loaded saved view, shaped like a real `MJUserViewEntityExtended`: `WhereClause` and `EntityID`
 * are columns read through `Get`, while `OrderByClause` is a computed property (built from the
 * view's sort state) that `Get` knows nothing about.
 */
function savedView(values: Record<string, string>): BaseEntity {
    const { OrderByClause, ...columns } = values;
    return {
        Get: (name: string) => (name === 'EntityID' ? EMPLOYEES_ID : columns[name] ?? null),
        OrderByClause: OrderByClause ?? '',
    } as unknown as BaseEntity;
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

    it('reads a quoted, dotted PostgreSQL path and ignores a message with no column', () => {
        const e = employees();
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error('column "E"."Salry" does not exist'), e, intern)?.message)
            .toBe(FieldSecurityDenialMessage('Salry', 'Employees'));
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error('relation "x" does not exist'), e, intern)).toBeNull();
    });

    it('parses a crafted error message in linear time (no catastrophic backtracking)', () => {
        const e = employees();
        const crafted = 'column !' + '.!'.repeat(50_000) + ' x';
        const started = performance.now();
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error(crafted), e, intern)).toBeNull();
        expect(performance.now() - started).toBeLessThan(250);
    });

    it('reports a PostgreSQL denied name as PostgreSQL reports an unknown one after MJ quotes the SQL', () => {
        // MJ quotes a capitalized or dot-qualified word before PostgreSQL sees it, so an unknown
        // `Salry` is reported as "Salry"; a word left bare folds to lower case.
        expect(refusal({ ExtraFilter: 'Salary > 1' }, intern, 'postgresql')).toBe(FieldSecurityDenialMessage('Salary', 'Employees'));
        expect(refusal({ ExtraFilter: 'e.sAlary > 1' }, intern, 'postgresql')).toBe(FieldSecurityDenialMessage('sAlary', 'Employees'));
        expect(refusal({ ExtraFilter: 'salary > 1' }, intern, 'postgresql')).toBe(FieldSecurityDenialMessage('salary', 'Employees'));
        expect(refusal({ ExtraFilter: 'sAlary > 1' }, intern, 'postgresql')).toBe(FieldSecurityDenialMessage('salary', 'Employees'));
        expect(FieldSecuritySQLGate.ErrorForInvalidColumn(new Error('column "Salry" does not exist'), employees(), intern)?.message)
            .toBe(FieldSecurityDenialMessage('Salry', 'Employees'));
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

/** Invisible characters SQL Server's collations give no weight to, or that a database may drop. */
const INVISIBLE_CHARACTERS = [
    '\u200D', '\u2060', '\uFEFF', '\u200E', '\u200F', '\u034F', '\u180B', '\uFE0F', '\u2063', '\u202A', '\u180E',
    '\u00AD', '\u200B', '\u200C', '\u0001',
];

describe('invisible characters inside a name, for a user carrying denials', () => {
    it.each(INVISIBLE_CHARACTERS.map(c => [`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`, c]))(
        'refuses %s inside a bracketed or quoted column name in ExtraFilter and OrderBy',
        (_label, c) => {
            expect(refusal({ ExtraFilter: `[Sal${c}ary] > 100000` })).not.toBeNull();
            expect(refusal({ ExtraFilter: `[Salary${c}] > 100000` })).not.toBeNull();
            expect(refusal({ OrderBy: `[Sal${c}ary] DESC` })).not.toBeNull();
            expect(refusal({ ExtraFilter: `"Sal${c}ary" > 1` }, intern, 'postgresql')).not.toBeNull();
        },
    );

    it.each(INVISIBLE_CHARACTERS.map(c => [`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`, c]))(
        'refuses %s inside a view name in a subquery',
        (_label, c) => {
            expect(refusal({ EntityName: 'Accounts', ExtraFilter: `OwnerID IN (SELECT e.ID FROM [vwEmploy${c}ees] e WHERE e.Name = 'x')` })).not.toBeNull();
            expect(refusal({ EntityName: 'Accounts', ExtraFilter: `EXISTS (SELECT * FROM [vwEmploy${c}ees] WHERE 1=1)` })).not.toBeNull();
        },
    );

    it('still lets a user denied nothing use such a name, and keeps them in string literals', () => {
        expect(refusal({ ExtraFilter: '[Sal\u2060ary] > 1' }, hr)).toBeNull();
        expect(refusal({ ExtraFilter: "Name = 'Ada\u200D'" })).toBeNull();
    });

    it('folds them away when comparing names', () => {
        expect(FoldIdentifier('Sal\u2060ary\u00AD')).toBe('salary');
    });
});

describe('set operations make SELECT * a whole-row comparison', () => {
    it.each([
        ["EXISTS (SELECT * FROM vwEmployees x WHERE x.ID = vwEmployees.ID INTERSECT SELECT x2.ID, x2.Name, n.v, 'A', x2.ManagerID FROM vwEmployees x2 CROSS JOIN (VALUES (1),(2)) n(v))"],
        ["EXISTS (SELECT * FROM vwEmployees WHERE ID='k' EXCEPT SELECT ID, Name, 1, 'A', ManagerID FROM vwEmployees)"],
        ["EXISTS (SELECT * FROM vwEmployees WHERE ID='k' UNION ALL SELECT 1,2,3,4,5)"],
        ["EXISTS (SELECT * FROM vwEmployees WHERE ID='k' UNION SELECT 1,2,3,4,5)"],
        ["NOT EXISTS (SELECT * FROM vwEmployees WHERE ID='k' EXCEPT SELECT 'k','Bob',1,'A',NULL)"],
        ["EXISTS (SELECT\n* FROM vwEmployees WHERE ID='k' INTERSECT SELECT 'k','Bob',1,'A',NULL)"],
        ["EXISTS ( /*c*/ SELECT * FROM vwEmployees WHERE ID='k' INTERSECT (SELECT 'k','Bob',1,'A',NULL))"],
        ['EXISTS (SELECT * FROM vwEmployees e WHERE e.ID = vwEmployees.ID ORDER BY 3 DESC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY)'],
    ])('refuses %s', (clause) => {
        expect(refusal({ ExtraFilter: clause })).not.toBeNull();
    });

    it('refuses the PostgreSQL form', () => {
        const clause = `EXISTS (SELECT * FROM vwEmployees WHERE "ID" = 'k' INTERSECT SELECT e."ID", e."Name", n, 'A', e."ManagerID" FROM vwEmployees e, generate_series(50000,100000) n WHERE e."ID" = 'k')`;
        expect(refusal({ ExtraFilter: clause }, intern, 'postgresql')).not.toBeNull();
    });

    it('refuses the cross-entity form from an entity without field security', () => {
        const clause = 'EXISTS (SELECT * FROM vwEmployees s WHERE s.ManagerID = vwAccounts.OwnerID INTERSECT SELECT s2.ID, s2.Name, n.v, 1, 2, 3, 4 FROM vwEmployees s2 CROSS JOIN (VALUES (100000)) n(v))';
        expect(refusal({ EntityName: 'Accounts', ExtraFilter: clause })).not.toBeNull();
    });

    it('keeps EXISTS (SELECT * …) working when the set operation is inside a nested subquery', () => {
        expect(refusal({ ExtraFilter: 'EXISTS (SELECT * FROM vwEmployees e WHERE e.ManagerID IN (SELECT 1 UNION SELECT 2))' })).toBeNull();
    });

    it('lets a user denied nothing use them', () => {
        expect(refusal({ ExtraFilter: "EXISTS (SELECT * FROM vwEmployees WHERE ID='k' EXCEPT SELECT 'k','Bob',1,'A',NULL)" }, hr)).toBeNull();
    });
});

describe('PostgreSQL U&"…" identifiers are read as the name PostgreSQL resolves', () => {
    it.each([
        ['U&"\\0053alary" > 1'],
        ['u&"S\\0061lary" > 1'],
        ["U&\"S!0061lary\" UESCAPE '!' > 1"],
        ['U&"S\\+000061lary" > 1'],
    ])('refuses %s as the denied column', (clause) => {
        expect(refusal({ ExtraFilter: clause }, intern, 'postgresql')).toBe(FieldSecurityDenialMessage('Salary', 'Employees'));
    });

    it('fails closed on one PostgreSQL would not decode', () => {
        expect(refusal({ ExtraFilter: 'U&"\\00zzalary" > 1' }, intern, 'postgresql')).not.toBeNull();
    });

    it("does not read a name inside an E'…' string", () => {
        expect(refusal({ ExtraFilter: "Notes = E'Salary'" }, intern, 'postgresql')).toBeNull();
    });
});

describe('saved-query SQL that reads a relation the catalog does not know', () => {
    const catalog = [employees(), accounts()];
    const check = (sql: string, user: UserInfo = intern, dialect: 'sqlserver' | 'postgresql' = 'sqlserver'): string | null => {
        try {
            FieldSecuritySQLGate.AssertStatementAllowed(sql, user, catalog, dialect);
            return null;
        } catch (e: unknown) {
            return e instanceof Error ? e.message : String(e);
        }
    };

    it.each([
        ['a custom view', 'SELECT Salary FROM __mj.vwPeopleSummary'],
        ['SELECT * from a custom view', 'SELECT * FROM vwPeopleSummary'],
        ['a table-valued function', 'SELECT x.Name FROM dbo.fnPeople(1) x'],
        ['an APPLY of a function', 'SELECT a.Name FROM vwAccounts a CROSS APPLY OPENJSON(a.Name) j'],
        ['a temp table', 'SELECT t.Name FROM #people t'],
        ['a cross-database name', 'SELECT e.Name FROM OtherDb.dbo.vwEmployees e'],
        ['a linked-server name', 'SELECT e.Name FROM Srv.OtherDb.dbo.vwAccounts e'],
        ['an entity view name in another schema', 'SELECT a.Name FROM reporting.vwAccounts a'],
        ['a system catalog view', 'SELECT o.name FROM sys.objects o'],
        ['a join to a custom view', 'SELECT a.Name FROM vwAccounts a JOIN vwPeopleSummary p ON p.ID = a.ID'],
        ['a custom view in a parenthesized join', 'SELECT a.Name FROM (vwAccounts a CROSS JOIN vwPeopleSummary p)'],
    ])('refuses %s for a user carrying denials, with the ambiguous message', (_label, sql) => {
        expect(check(sql)).toBe(FieldSecurityUnresolvableSQLMessage('query'));
        expect(check(sql, hr)).toBeNull();
    });

    it('refuses an unknown relation on PostgreSQL, including FROM ONLY and a set-returning function', () => {
        expect(check('SELECT p."Name" FROM ONLY __mj.vwPeopleSummary p', intern, 'postgresql')).not.toBeNull();
        expect(check('SELECT n FROM generate_series(1, 10) n', intern, 'postgresql')).not.toBeNull();
    });

    it.each([
        ['entity views, schema-qualified or not', 'SELECT a.Name, e.Name FROM dbo.vwAccounts a JOIN [dbo].[vwEmployees] e ON e.ID = a.OwnerID'],
        ['an entity base table', 'SELECT a.Name FROM dbo.Account a'],
        ['CTEs, with a column list and several of them', 'WITH x (n) AS (SELECT e.Name FROM vwEmployees e), y AS (SELECT a.Name FROM vwAccounts a) SELECT x.n FROM x JOIN y ON y.Name = x.n'],
        ['a derived table and a VALUES list', 'SELECT z.Name, v.k FROM (SELECT a.Name FROM vwAccounts a) z CROSS JOIN (VALUES (1)) v(k)'],
        ['FROM inside EXTRACT and TRIM', "SELECT EXTRACT(YEAR FROM a.Created), TRIM(' ' FROM a.Name) FROM vwAccounts a"],
        ['IS DISTINCT FROM', 'SELECT a.Name FROM vwAccounts a WHERE a.Name IS DISTINCT FROM a.OwnerID'],
        ['a parenthesized join of entity views', 'SELECT a.Name FROM (vwAccounts a CROSS JOIN vwEmployees e)'],
    ])('allows %s', (_label, sql) => {
        expect(check(sql)).toBeNull();
    });

    it('allows a LATERAL subquery on PostgreSQL', () => {
        expect(check('SELECT a."Name" FROM vwAccounts a CROSS JOIN LATERAL (SELECT e."Name" FROM vwEmployees e) l', intern, 'postgresql')).toBeNull();
    });
});
