import { describe, it, expect, vi } from 'vitest';
import {
    BaseEntity,
    DeleteSQLResult,
    EntityInfo,
    ExecuteSQLOptions,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { ClientClauseScreen } from '../clientClauseScreen';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

const MSSQL = new SQLServerDialect();
const PG = new PostgreSQLDialect();
const ROLE_ID = 'role-agent-test-1';

function buildTestUser(): UserInfo {
    return new UserInfo(null, {
        ID: 'user-agent-test-1',
        Name: 'Agent Policy Tester',
        Email: 'tester@example.com',
        FirstName: 'Agent',
        LastName: 'Tester',
        IsActive: true,
        UserRoles: [{ UserID: 'user-agent-test-1', RoleID: ROLE_ID, RoleName: 'UI' }],
    });
}

function buildTestEntity(
    id: string,
    name: string,
    schemaName: string,
    baseTable: string,
    baseView: string,
    canRead = true,
): EntityInfo {
    return new EntityInfo({
        ID: id,
        Name: name,
        SchemaName: schemaName,
        BaseTable: baseTable,
        BaseView: baseView,
        VirtualEntity: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        Status: 'Active',
        EntityFields: [
            {
                ID: `f-${id}-id`,
                EntityID: id,
                Name: 'ID',
                CodeName: 'ID',
                DisplayName: 'ID',
                Type: 'uniqueidentifier',
                Length: 36,
                IsPrimaryKey: true,
                AllowsNull: false,
                IsVirtual: false,
                AllowUpdateAPI: false,
                Sequence: 1,
                Status: 'Active',
                Entity: name,
                EntityFieldValues: [],
                EntityFieldPermissions: [],
            },
            {
                ID: `f-${id}-status`,
                EntityID: id,
                Name: 'Status',
                CodeName: 'Status',
                DisplayName: 'Status',
                Type: 'nvarchar',
                Length: 50,
                IsPrimaryKey: false,
                AllowsNull: false,
                IsVirtual: false,
                AllowUpdateAPI: true,
                Sequence: 2,
                Status: 'Active',
                Entity: name,
                EntityFieldValues: [],
                EntityFieldPermissions: [],
            },
            {
                ID: `f-${id}-amount`,
                EntityID: id,
                Name: 'Amount',
                CodeName: 'Amount',
                DisplayName: 'Amount',
                Type: 'decimal',
                Length: 18,
                IsPrimaryKey: false,
                AllowsNull: true,
                IsVirtual: false,
                AllowUpdateAPI: true,
                Sequence: 3,
                Status: 'Active',
                Entity: name,
                EntityFieldValues: [],
                EntityFieldPermissions: [],
            },
        ],
        EntityPermissions: [
            {
                ID: `perm-${id}`,
                EntityID: id,
                RoleID: ROLE_ID,
                RoleName: 'UI',
                CanCreate: true,
                CanRead: canRead,
                CanUpdate: true,
                CanDelete: false,
            },
        ],
        EntityRelationships: [],
        EntitySettings: [],
    });
}

class SyntheticRowTestProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*newid\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*getdate\s*\(\s*\)\s*$/i;

    public ExecutedSQL: string[] = [];
    public SimulatedRows: Array<Record<string, number>> = [{ pass: 1 }];
    public ThrowOnExecute = false;

    protected get UUIDFunctionPattern(): RegExp {
        return SyntheticRowTestProvider._uuidPattern;
    }
    protected get DBDefaultFunctionPattern(): RegExp {
        return SyntheticRowTestProvider._defaultPattern;
    }
    public QuoteIdentifier(name: string): string {
        return `[${name}]`;
    }
    public QuoteSchemaAndView(schema: string, obj: string): string {
        return `[${schema}].[${obj}]`;
    }
    protected BuildChildDiscoverySQL(): string {
        return '';
    }
    protected BuildHardLinkDependencySQL(): string {
        return '';
    }
    protected BuildSoftLinkDependencySQL(): string {
        return '';
    }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> {
        return { fullSQL: '' };
    }
    protected GenerateDeleteSQL(): DeleteSQLResult {
        return { fullSQL: '' };
    }
    protected BuildRecordChangeSQL(): null {
        return null;
    }
    protected BuildSiblingRecordChangeSQL(): string {
        return '';
    }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    protected override get HasPhysicalTransaction(): boolean {
        return false;
    }
    protected override async BeginPhysicalTransaction(): Promise<void> {}
    protected override async CommitPhysicalTransaction(): Promise<void> {}
    protected override async RollbackPhysicalTransaction(): Promise<void> {}

    public override async ExecuteSQL<T>(
        sql?: string,
        _params?: Array<string | number | boolean | null>,
        _options?: ExecuteSQLOptions,
        _contextUser?: UserInfo,
    ): Promise<Array<T>> {
        if (sql) {
            this.ExecutedSQL.push(sql);
        }
        if (this.ThrowOnExecute) {
            throw new Error('Simulated DB error');
        }
        return this.SimulatedRows as Array<T>;
    }
}

describe('ClientClauseScreen agent policy & masking screens', () => {
    const user = buildTestUser();
    const contacts = buildTestEntity('ent-contacts', 'Contacts', '__mj', 'Contact', 'vwContacts', true);
    const deals = buildTestEntity('ent-deals', 'Deals', 'crm', 'Deal', 'vwDeals', true);
    const secrets = buildTestEntity('ent-secrets', 'Secrets', 'sec', 'Secret', 'vwSecrets', false);
    const entities = [contacts, deals, secrets];

    describe('AssertBalancedSingleFragment', () => {
        it('refuses parenthesis-breakout fragments such as 1=1) OR (1=1', () => {
            expect(() =>
                ClientClauseScreen.AssertBalancedSingleFragment('1=1) OR (1=1', 'Filter', MSSQL),
            ).toThrow(/unbalanced closing parenthesis/);
            expect(() =>
                ClientClauseScreen.AssertBalancedSingleFragment('(Status = \'Active\'', 'Filter', MSSQL),
            ).toThrow(/unbalanced opening parenthesis/);
        });

        it('allows balanced expressions and ignores parentheses inside string literals', () => {
            expect(() =>
                ClientClauseScreen.AssertBalancedSingleFragment(
                    `(Status = 'Active (Tier 1)' AND Amount > 0)`,
                    'Filter',
                    MSSQL,
                ),
            ).not.toThrow();
        });
    });

    describe('ScreenAgentClause', () => {
        it('validates Filter and OrderBy fragments, rejects breakouts/base tables, and returns subquery EntityInfo[]', () => {
            expect(() =>
                ClientClauseScreen.ScreenAgentClause('1=1) OR (1=1', 'Filter', entities, MSSQL, user),
            ).toThrow(/unbalanced closing parenthesis/);

            expect(() =>
                ClientClauseScreen.ScreenAgentClause(
                    'ID IN (SELECT ContactID FROM sec.vwSecrets)',
                    'Filter',
                    entities,
                    MSSQL,
                    user,
                ),
            ).toThrow(/read permission/);

            expect(() =>
                ClientClauseScreen.ScreenAgentClause(
                    'ID IN (SELECT ID FROM __mj.Contact)',
                    'Filter',
                    entities,
                    MSSQL,
                    user,
                ),
            ).toThrow(/entity base view/);

            const referenced = ClientClauseScreen.ScreenAgentClause(
                `Status = 'Active' AND ID IN (SELECT ID FROM crm.vwDeals)`,
                'Filter',
                entities,
                MSSQL,
                user,
            );
            expect(referenced).toHaveLength(1);
            expect(referenced[0].Name).toBe('Deals');

            const orderRefs = ClientClauseScreen.ScreenAgentClause(
                'Status ASC, Amount DESC',
                'OrderBy',
                entities,
                MSSQL,
                user,
            );
            expect(orderRefs).toHaveLength(0);
        });
    });

    describe('AssertNoPositionalColumnRenames', () => {
        it('refuses CTE column-alias lists, derived-table column-alias lists, and UNION + *', () => {
            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'WITH c(a, b) AS (SELECT * FROM __mj.vwContacts) SELECT a, b FROM c',
                    MSSQL,
                ),
            ).toThrow(/CTE column-alias lists/);

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT x.a FROM (SELECT * FROM __mj.vwContacts) AS x(a, b)',
                    PG,
                ),
            ).toThrow(/derived-table column-alias lists/);

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT ID, Status FROM __mj.vwContacts UNION ALL SELECT * FROM __mj.vwContacts',
                    MSSQL,
                ),
            ).toThrow(/set operations .* wildcard/);

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT (SELECT e2.* FROM __mj.vwContacts e2 WHERE e2.ID = e.ID FOR JSON PATH) AS j FROM __mj.vwContacts e',
                    MSSQL,
                ),
            ).toThrow(/FOR JSON/);

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT * FROM __mj.vwContacts FOR JSON PATH',
                    MSSQL,
                ),
            ).toThrow(/FOR JSON/);

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT to_jsonb(e) AS j FROM __mj.vwContacts e',
                    PG,
                ),
            ).toThrow(/to_jsonb/);

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT ID, Status FROM __mj.vwContacts ORDER BY 2',
                    MSSQL,
                ),
            ).toThrow(/ordinal ORDER BY/);

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT sub.a FROM (WITH c(a, b) AS (SELECT * FROM __mj.vwContacts) SELECT a, b FROM c) AS sub',
                    PG,
                ),
            ).toThrow(/CTE column-alias lists/);

            expect(() =>
                ClientClauseScreen.AssertNoWholeRowOrOrdinalInClause('2 DESC', 'OrderBy', MSSQL),
            ).toThrow(/ordinal ORDER BY/);
        });

        it('allows ordinary CTEs, derived tables without column lists, and explicit-column UNIONs', () => {
            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'WITH c AS (SELECT ID, Status FROM __mj.vwContacts) SELECT c.ID, d.Amount FROM c JOIN (SELECT ID, Amount FROM crm.vwDeals) AS d ON d.ID = c.ID',
                    MSSQL,
                ),
            ).not.toThrow();

            expect(() =>
                ClientClauseScreen.AssertNoPositionalColumnRenames(
                    'SELECT ID, Status FROM __mj.vwContacts UNION ALL SELECT ID, Status FROM crm.vwDeals',
                    MSSQL,
                ),
            ).not.toThrow();
        });
    });

    describe('FindUnmaskableStoredQueryDeniedFields', () => {
        const deniedSet = new Set(['email', 'ssn']);
        const isDenied = (ident: string): boolean => deniedSet.has(ident.toLowerCase());

        it('permits pure unaliased top-level projection columns so MaskRows can strip them', () => {
            expect(
                ClientClauseScreen.FindUnmaskableStoredQueryDeniedFields(
                    'SELECT ID, c.Email, [__mj].[vwContacts].[SSN] FROM [__mj].[vwContacts] c WHERE Status = \'Active\'',
                    MSSQL,
                    isDenied,
                ),
            ).toEqual([]);
        });

        it('flags aliased, aggregated, computed, WHERE, ORDER BY, and CTE references to denied fields', () => {
            expect(
                ClientClauseScreen.FindUnmaskableStoredQueryDeniedFields(
                    'SELECT ID, Email AS ContactEmail FROM __mj.vwContacts',
                    MSSQL,
                    isDenied,
                ),
            ).toEqual(['Email']);

            expect(
                ClientClauseScreen.FindUnmaskableStoredQueryDeniedFields(
                    'SELECT COUNT(Email) AS Total FROM __mj.vwContacts',
                    MSSQL,
                    isDenied,
                ),
            ).toEqual(['Email']);

            expect(
                ClientClauseScreen.FindUnmaskableStoredQueryDeniedFields(
                    `SELECT ID FROM __mj.vwContacts WHERE Email LIKE '%@acme.com' ORDER BY SSN DESC`,
                    MSSQL,
                    isDenied,
                ),
            ).toEqual(['Email', 'SSN']);
        });
    });

    describe('EvaluateSimpleSqlWherePredicate', () => {
        it('evaluates comparisons, IN, IS NULL, LIKE, boolean logic, and fails closed on subqueries/functions', () => {
            const row = {
                Status: 'Active',
                Amount: 250,
                OwnerID: 'u-123',
                Notes: null,
            };

            expect(
                ClientClauseScreen.EvaluateSimpleSqlWherePredicate(
                    `Status = 'Active' AND Amount >= 100 AND Notes IS NULL`,
                    row,
                    MSSQL,
                ),
            ).toBe(true);

            expect(
                ClientClauseScreen.EvaluateSimpleSqlWherePredicate(
                    `Status IN ('Closed', 'Archived') OR Amount > 500`,
                    row,
                    MSSQL,
                ),
            ).toBe(false);

            expect(
                ClientClauseScreen.EvaluateSimpleSqlWherePredicate(
                    `OwnerID LIKE 'u-%' AND Amount <> 999`,
                    row,
                    MSSQL,
                ),
            ).toBe(true);

            // Fail closed on subqueries, function calls, and paren breakouts
            expect(
                ClientClauseScreen.EvaluateSimpleSqlWherePredicate(
                    `EXISTS (SELECT 1 FROM vwContacts)`,
                    row,
                    MSSQL,
                ),
            ).toBe(false);
            expect(
                ClientClauseScreen.EvaluateSimpleSqlWherePredicate(`LOWER(Status) = 'active'`, row, MSSQL),
            ).toBe(false);
            expect(
                ClientClauseScreen.EvaluateSimpleSqlWherePredicate(`1=1) OR (1=1`, row, MSSQL),
            ).toBe(false);
        });
    });

    describe('GenericDatabaseProvider.EvaluateSyntheticRowWhereClause', () => {
        it('evaluates synthetic row SQL, short-circuits clean updates when dirtyOnlyOptimization is true, and fails closed on empty/error', async () => {
            const provider = new SyntheticRowTestProvider();
            const record = new BaseEntity(contacts);
            record.LoadFromData({ ID: '11111111-1111-4111-8111-111111111111', Status: 'Active', Amount: 42 });

            // Clean record with dirtyOnlyOptimization=true short-circuits without hitting ExecuteSQL
            const shortCircuited = await provider.EvaluateSyntheticRowWhereClause(
                record,
                `[Status] = 'Active'`,
                user,
                true,
            );
            expect(shortCircuited).toBe(true);
            expect(provider.ExecutedSQL).toHaveLength(0);

            // Full evaluation executes synthetic SELECT against newrow
            const passed = await provider.EvaluateSyntheticRowWhereClause(
                record,
                `[Status] = 'Active'`,
                user,
                false,
            );
            expect(passed).toBe(true);
            expect(provider.ExecutedSQL).toHaveLength(1);
            expect(provider.ExecutedSQL[0]).toContain(`CASE WHEN ([Status] = 'Active') THEN 1 ELSE 0 END AS pass`);
            expect(provider.ExecutedSQL[0]).toContain('AS newrow');

            // Empty result returns false
            provider.SimulatedRows = [];
            expect(
                await provider.EvaluateSyntheticRowWhereClause(record, `[Status] = 'Closed'`, user, false),
            ).toBe(false);

            // Thrown SQL execution error fails closed (returns false)
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            provider.ThrowOnExecute = true;
            expect(
                await provider.EvaluateSyntheticRowWhereClause(record, `[Status] = 'Active'`, user, false),
            ).toBe(false);
            consoleSpy.mockRestore();

            // Non-IS-A virtual fields (view-joined columns like DepartmentName) are REFUSED on write-side
            // whereClause checks — including when a foreign key (DepartmentID) is updated and dirtyOnlyOptimization is true
            const entityWithVirtual = new EntityInfo({
                ID: contacts.ID,
                Name: contacts.Name,
                SchemaName: contacts.SchemaName,
                BaseTable: contacts.BaseTable,
                BaseView: contacts.BaseView,
                VirtualEntity: false,
                AllowCreateAPI: true,
                AllowUpdateAPI: true,
                AllowDeleteAPI: true,
                IncludeInAPI: true,
                Status: 'Active',
                EntityFields: [
                    ...contacts.Fields.map((f) => ({
                        ID: f.ID,
                        EntityID: contacts.ID,
                        Name: f.Name,
                        CodeName: f.CodeName,
                        DisplayName: f.DisplayName,
                        Type: f.Type,
                        Length: f.Length,
                        IsPrimaryKey: f.IsPrimaryKey,
                        AllowsNull: f.AllowsNull,
                        IsVirtual: f.IsVirtual,
                        AllowUpdateAPI: f.AllowUpdateAPI,
                        Sequence: f.Sequence,
                        Status: 'Active' as const,
                        Entity: contacts.Name,
                        EntityFieldValues: [],
                        EntityFieldPermissions: [],
                    })),
                    {
                        ID: 'f-fk-dept-id',
                        EntityID: contacts.ID,
                        Name: 'DepartmentID',
                        CodeName: 'DepartmentID',
                        DisplayName: 'Department ID',
                        Type: 'uniqueidentifier',
                        Length: 36,
                        IsPrimaryKey: false,
                        AllowsNull: true,
                        IsVirtual: false,
                        AllowUpdateAPI: true,
                        Sequence: 4,
                        Status: 'Active' as const,
                        Entity: contacts.Name,
                        EntityFieldValues: [],
                        EntityFieldPermissions: [],
                    },
                    {
                        ID: 'f-virtual-dept',
                        EntityID: contacts.ID,
                        Name: 'DepartmentName',
                        CodeName: 'DepartmentName',
                        DisplayName: 'Department Name',
                        Type: 'nvarchar',
                        Length: 100,
                        IsPrimaryKey: false,
                        AllowsNull: true,
                        IsVirtual: true,
                        AllowUpdateAPI: false,
                        Sequence: 5,
                        Status: 'Active' as const,
                        Entity: contacts.Name,
                        EntityFieldValues: [],
                        EntityFieldPermissions: [],
                    },
                ],
                EntityPermissions: [],
                EntityRelationships: [],
                EntitySettings: [],
            });
            const recWithVirtual = new BaseEntity(entityWithVirtual);
            await recWithVirtual.LoadFromData({
                ID: '11111111-1111-4111-8111-111111111111',
                Status: 'Active',
                Amount: 42,
                DepartmentID: '22222222-2222-4222-8222-222222222222',
                DepartmentName: 'Sales',
            });
            // Agent mutates the foreign key DepartmentID (moving row out of Sales), while virtual DepartmentName stays 'Sales'
            const deptIdField = recWithVirtual.Fields.find((f) => f.Name === 'DepartmentID')!;
            deptIdField.Value = '33333333-3333-4333-8333-333333333333';

            const virtualConsoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            provider.ThrowOnExecute = false;
            provider.SimulatedRows = [{ pass: 1 }];
            provider.ExecutedSQL = [];
            expect(
                await provider.EvaluateSyntheticRowWhereClause(
                    recWithVirtual,
                    `[DepartmentName] = 'Sales'`,
                    user,
                    true,
                ),
            ).toBe(false);
            expect(
                await provider.EvaluateSyntheticRowWhereClause(
                    recWithVirtual,
                    `[DepartmentName] = 'Sales'`,
                    user,
                    false,
                ),
            ).toBe(false);
            expect(provider.ExecutedSQL).toHaveLength(0);
            virtualConsoleSpy.mockRestore();

            // PostgreSQL dialect AssertNoWholeRowOrOrdinalInClause accepts valid PG filters, bracket-quoted filters, and EXISTS (SELECT * ...)
            expect(() =>
                ClientClauseScreen.AssertNoWholeRowOrOrdinalInClause(
                    `"Status" = 'Active' AND EXISTS (SELECT * FROM "crm"."vwContacts" c2 WHERE c2."ID" = "ID")`,
                    'Filter',
                    PG,
                ),
            ).not.toThrow();
            expect(() =>
                ClientClauseScreen.AssertNoWholeRowOrOrdinalInClause(`[Status] = 'Active'`, 'Filter', PG),
            ).not.toThrow();
            expect(() =>
                ClientClauseScreen.AssertNoWholeRowOrOrdinalInClause(`"Amount" DESC`, 'OrderBy', PG),
            ).not.toThrow();
            expect(() =>
                ClientClauseScreen.AssertNoWholeRowOrOrdinalInClause(`2 DESC`, 'OrderBy', PG),
            ).toThrow(/ordinal/i);
        });
    });
});
