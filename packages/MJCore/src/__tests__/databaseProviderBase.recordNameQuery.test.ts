/**
 * The query DatabaseProviderBase's record-name lookup sends to the database.
 *
 * Key values are bound as parameters, key columns come from the entity's primary keys, and the
 * acting user's read row filter (role RLS and API-key row filters) is ANDed in. The test database
 * records every query and answers each one with a row, so these tests read the SQL itself.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseProviderBase, SaveSQLResult, DeleteSQLResult } from '../generic/databaseProviderBase';
import { EntityInfo, EntityPermissionType } from '../generic/entityInfo';
import { UserInfo, RowLevelSecurityFilterInfo } from '../generic/securityInfo';
import { CompositeKey } from '../generic/compositeKey';
import { Metadata } from '../generic/metadata';
import { IMetadataProvider, RunQueryResult } from '../generic/interfaces';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';

const PROJECTS_ID = 'E0000000-0000-0000-0000-0000000000A1';
const TICKETS_ID = 'E0000000-0000-0000-0000-0000000000A2';
const ORDER_LINES_ID = 'E0000000-0000-0000-0000-0000000000A3';
const MEMBER_ROLE_ID = 'B0000000-0000-0000-0000-0000000000A1';
const ADMIN_ROLE_ID = 'B0000000-0000-0000-0000-0000000000A2';
const OWN_PROJECTS_FILTER_ID = 'F0000000-0000-0000-0000-0000000000A1';
const KEY_FILTER_ID = 'F0000000-0000-0000-0000-0000000000A2';
const MEMBER_ID = 'C0000000-0000-0000-0000-0000000000A1';
const ADMIN_ID = 'C0000000-0000-0000-0000-0000000000A2';

const PROJECT_ID_VALUE = '11111111-1111-1111-1111-111111111111';
const ORDER_ID_VALUE = '22222222-2222-2222-2222-222222222222';

const ROW_FILTERS: RowLevelSecurityFilterInfo[] = [
    new RowLevelSecurityFilterInfo({ ID: OWN_PROJECTS_FILTER_ID, Name: 'Own projects', FilterText: "OwnerID = '{{UserID}}'" }),
    new RowLevelSecurityFilterInfo({ ID: KEY_FILTER_ID, Name: 'Low priority', FilterText: 'Priority > 3' }),
];

/** `Projects`, keyed by `ID`: members read only the projects they own, admins read every project. */
function projectsEntity(): EntityInfo {
    return new EntityInfo({
        ID: PROJECTS_ID, Name: 'Projects', SchemaName: 'dbo', BaseTable: 'Project', BaseView: 'vwProjects',
        Permissions: [
            { ID: 'perm-member', EntityID: PROJECTS_ID, RoleID: MEMBER_ROLE_ID, CanRead: true, ReadRLSFilterID: OWN_PROJECTS_FILTER_ID, Type: 'Allow' },
            { ID: 'perm-admin', EntityID: PROJECTS_ID, RoleID: ADMIN_ROLE_ID, CanRead: true, Type: 'Allow' },
        ],
        Fields: [
            { ID: 'pr-id', EntityID: PROJECTS_ID, Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, NeedsQuotes: true },
            { ID: 'pr-name', EntityID: PROJECTS_ID, Sequence: 2, Name: 'Name', Type: 'nvarchar', IsNameField: true, NeedsQuotes: true },
            { ID: 'pr-priority', EntityID: PROJECTS_ID, Sequence: 3, Name: 'Priority', Type: 'int', NeedsQuotes: false },
            { ID: 'pr-owner', EntityID: PROJECTS_ID, Sequence: 4, Name: 'OwnerID', Type: 'uniqueidentifier', NeedsQuotes: true },
        ],
    });
}

/** `Tickets`, keyed by an integer `TicketNumber`. */
function ticketsEntity(): EntityInfo {
    return new EntityInfo({
        ID: TICKETS_ID, Name: 'Tickets', SchemaName: 'dbo', BaseTable: 'Ticket', BaseView: 'vwTickets',
        Permissions: [{ ID: 'perm-tickets', EntityID: TICKETS_ID, RoleID: ADMIN_ROLE_ID, CanRead: true, Type: 'Allow' }],
        Fields: [
            { ID: 'tk-number', EntityID: TICKETS_ID, Sequence: 1, Name: 'TicketNumber', Type: 'int', IsPrimaryKey: true, NeedsQuotes: false },
            { ID: 'tk-title', EntityID: TICKETS_ID, Sequence: 2, Name: 'Title', Type: 'nvarchar', IsNameField: true, NeedsQuotes: true },
        ],
    });
}

/** `Order Lines`, keyed by `(OrderID, LineNumber)`. */
function orderLinesEntity(): EntityInfo {
    return new EntityInfo({
        ID: ORDER_LINES_ID, Name: 'Order Lines', SchemaName: 'dbo', BaseTable: 'OrderLine', BaseView: 'vwOrderLines',
        Permissions: [{ ID: 'perm-lines', EntityID: ORDER_LINES_ID, RoleID: ADMIN_ROLE_ID, CanRead: true, Type: 'Allow' }],
        Fields: [
            { ID: 'ol-order', EntityID: ORDER_LINES_ID, Sequence: 1, Name: 'OrderID', Type: 'uniqueidentifier', IsPrimaryKey: true, NeedsQuotes: true },
            { ID: 'ol-line', EntityID: ORDER_LINES_ID, Sequence: 2, Name: 'LineNumber', Type: 'int', IsPrimaryKey: true, NeedsQuotes: false },
            { ID: 'ol-desc', EntityID: ORDER_LINES_ID, Sequence: 3, Name: 'Description', Type: 'nvarchar', IsNameField: true, NeedsQuotes: true },
        ],
    });
}

function buildUser(id: string, roleId: string): UserInfo {
    return new UserInfo(null, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true,
        UserRoles: [{ UserID: id, RoleID: roleId, Role: `Role-${roleId}` }],
    });
}

function key(...pairs: Array<[string, string | number]>): CompositeKey {
    return new CompositeKey(pairs.map(([FieldName, Value]) => ({ FieldName, Value })));
}

interface SentQuery {
    SQL: string;
    Parameters: unknown[] | undefined;
}

/** A SQL Server-shaped provider over the test entities, whose database answers every query with one row. */
class RecordNameQueryProvider extends DatabaseProviderBase {
    public Sent: SentQuery[] = [];

    constructor(private readonly entities: EntityInfo[]) {
        super();
    }

    public override get Entities(): EntityInfo[] {
        return this.entities;
    }

    public override get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[] {
        return ROW_FILTERS;
    }

    async ExecuteSQL<T>(sql: string, parameters?: unknown[]): Promise<Array<T>> {
        this.Sent.push({ SQL: sql, Parameters: parameters });
        return [{ Name: 'Apollo' }] as T[];
    }

    public override BuildParameterPlaceholder(index: number): string { return `@p${index}`; }
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

describe('DatabaseProviderBase record-name query', () => {
    let provider: RecordNameQueryProvider;
    let savedProvider: IMetadataProvider;
    const member = buildUser(MEMBER_ID, MEMBER_ROLE_ID);
    const admin = buildUser(ADMIN_ID, ADMIN_ROLE_ID);

    beforeEach(() => {
        provider = new RecordNameQueryProvider([projectsEntity(), ticketsEntity(), orderLinesEntity()]);
        // Row filters resolve through the global provider.
        savedProvider = Metadata.Provider;
        Metadata.Provider = provider;
    });

    afterEach(() => {
        Metadata.Provider = savedProvider;
    });

    function onlyQuery(): SentQuery {
        expect(provider.Sent).toHaveLength(1);
        return provider.Sent[0];
    }

    function readFilterFor(user: UserInfo): string {
        return provider.EntityByName('Projects').GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');
    }

    describe('key values', () => {
        it('binds a string key value as a parameter and keeps it out of the SQL text', async () => {
            const value = `${PROJECT_ID_VALUE}'; SELECT 1 --`;

            const name = await provider.GetEntityRecordName('Projects', key(['ID', value]), admin);

            expect(name).toBe('Apollo');
            expect(onlyQuery().SQL).toBe('SELECT [Name] FROM [dbo].[vwProjects] WHERE [ID]=@p0');
            expect(onlyQuery().Parameters).toEqual([value]);
        });

        it('binds a numeric key value as a parameter', async () => {
            await provider.GetEntityRecordName('Tickets', key(['TicketNumber', '42']), admin);

            expect(onlyQuery().SQL).toBe('SELECT [Title] FROM [dbo].[vwTickets] WHERE [TicketNumber]=@p0');
            expect(onlyQuery().Parameters).toEqual(['42']);
        });

        it('binds each column of a composite key, in the order the key gives them', async () => {
            await provider.GetEntityRecordName('Order Lines', key(['LineNumber', 2], ['OrderID', ORDER_ID_VALUE]), admin);

            expect(onlyQuery().SQL).toBe('SELECT [Description] FROM [dbo].[vwOrderLines] WHERE [LineNumber]=@p0 AND [OrderID]=@p1');
            expect(onlyQuery().Parameters).toEqual([2, ORDER_ID_VALUE]);
        });
    });

    describe('key field names', () => {
        it('refuses a field that is not a primary key, without querying', async () => {
            const name = await provider.GetEntityRecordName('Projects', key(['Priority', '1']), admin);

            expect(name).toBe('');
            expect(provider.Sent).toHaveLength(0);
        });

        it('refuses a field name that is not a column of the entity, without querying', async () => {
            const name = await provider.GetEntityRecordName('Projects', key(['ID]=1; SELECT 1 --', '1']), admin);

            expect(name).toBe('');
            expect(provider.Sent).toHaveLength(0);
        });

        it('refuses an empty key, without querying', async () => {
            const name = await provider.GetEntityRecordName('Projects', new CompositeKey([]), admin);

            expect(name).toBe('');
            expect(provider.Sent).toHaveLength(0);
        });

        it('matches a primary key name in any case and writes the column name from metadata', async () => {
            await provider.GetEntityRecordName('Projects', key(['id', PROJECT_ID_VALUE]), admin);

            expect(onlyQuery().SQL).toBe('SELECT [Name] FROM [dbo].[vwProjects] WHERE [ID]=@p0');
            expect(onlyQuery().Parameters).toEqual([PROJECT_ID_VALUE]);
        });

        it('applies the same checks to each item of a batch lookup', async () => {
            const results = await provider.GetEntityRecordNames([
                { EntityName: 'Projects', CompositeKey: key(['ID', PROJECT_ID_VALUE]) },
                { EntityName: 'Projects', CompositeKey: key(['Priority', '1']) },
            ], admin);

            expect(results.map(r => r.Success)).toEqual([true, false]);
            expect(onlyQuery().Parameters).toEqual([PROJECT_ID_VALUE]);
        });
    });

    describe('row-level security', () => {
        it("ANDs the acting user's read row filter into the lookup", async () => {
            const rowFilter = readFilterFor(member);
            expect(rowFilter).toContain(MEMBER_ID);

            await provider.GetEntityRecordName('Projects', key(['ID', PROJECT_ID_VALUE]), member);

            expect(onlyQuery().SQL).toBe(`SELECT [Name] FROM [dbo].[vwProjects] WHERE [ID]=@p0 AND (${rowFilter})`);
            expect(onlyQuery().Parameters).toEqual([PROJECT_ID_VALUE]);
        });

        it('ANDs the API-key row filters carried on the session user', async () => {
            const keyUser = buildUser(ADMIN_ID, ADMIN_ROLE_ID);
            keyUser.APIKeyRowFilters = [{ EntityID: PROJECTS_ID, PermissionType: 'Read', FilterID: KEY_FILTER_ID }];
            const rowFilter = readFilterFor(keyUser);
            expect(rowFilter).toContain('Priority > 3');

            await provider.GetEntityRecordName('Projects', key(['ID', PROJECT_ID_VALUE]), keyUser);

            expect(onlyQuery().SQL).toBe(`SELECT [Name] FROM [dbo].[vwProjects] WHERE [ID]=@p0 AND (${rowFilter})`);
        });

        it('applies the row filter to each item of a batch lookup', async () => {
            const rowFilter = readFilterFor(member);

            await provider.GetEntityRecordNames([{ EntityName: 'Projects', CompositeKey: key(['ID', PROJECT_ID_VALUE]) }], member);

            expect(onlyQuery().SQL).toBe(`SELECT [Name] FROM [dbo].[vwProjects] WHERE [ID]=@p0 AND (${rowFilter})`);
        });

        it('adds no row filter when no user is given, as for a trusted server-side caller', async () => {
            await provider.GetEntityRecordName('Projects', key(['ID', PROJECT_ID_VALUE]));

            expect(onlyQuery().SQL).toBe('SELECT [Name] FROM [dbo].[vwProjects] WHERE [ID]=@p0');
            expect(onlyQuery().Parameters).toEqual([PROJECT_ID_VALUE]);
        });
    });
});
