// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompositeKey, DatabaseProviderBase, EntityInfo, EntityPermissionType, Metadata, RowLevelSecurityFilterInfo, UserInfo } from '@memberjunction/core';
import type { DeleteSQLResult, IMetadataProvider, QueryExecutionSpec, RunQueryResult, SaveSQLResult } from '@memberjunction/core';
import { EntityRecordNameResolver } from '../resolvers/EntityRecordNameResolver.js';
import type { AppContext, UserPayload } from '../types.js';

/**
 * The record-name queries against a real provider whose database only records what it is sent.
 * The lookup the resolver causes carries the acting user's read row filter, binds the key value,
 * refuses a key that is not the entity's primary key, and never runs without an acting user.
 */

const CLIENTS_ID = 'E0000000-0000-0000-0000-0000000000C1';
const ACCOUNT_MANAGER_ROLE_ID = 'B0000000-0000-0000-0000-0000000000C1';
const OWN_CLIENTS_FILTER_ID = 'F0000000-0000-0000-0000-0000000000C1';
const MANAGER_ID = 'C0000000-0000-0000-0000-0000000000C1';
const CLIENT_ID_VALUE = '33333333-3333-3333-3333-333333333333';

const ROW_FILTERS: RowLevelSecurityFilterInfo[] = [
    new RowLevelSecurityFilterInfo({ ID: OWN_CLIENTS_FILTER_ID, Name: 'Own clients', FilterText: "AccountManagerID = '{{UserID}}'" }),
];

/** `Clients`: account managers read only the clients they manage. */
function clientsEntity(): EntityInfo {
    return new EntityInfo({
        ID: CLIENTS_ID, Name: 'Clients', SchemaName: 'dbo', BaseTable: 'Client', BaseView: 'vwClients',
        Permissions: [
            { ID: 'perm-manager', EntityID: CLIENTS_ID, RoleID: ACCOUNT_MANAGER_ROLE_ID, CanRead: true, ReadRLSFilterID: OWN_CLIENTS_FILTER_ID, Type: 'Allow' },
        ],
        Fields: [
            { ID: 'cl-id', EntityID: CLIENTS_ID, Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, NeedsQuotes: true },
            { ID: 'cl-name', EntityID: CLIENTS_ID, Sequence: 2, Name: 'Name', Type: 'nvarchar', IsNameField: true, NeedsQuotes: true },
            { ID: 'cl-tier', EntityID: CLIENTS_ID, Sequence: 3, Name: 'Tier', Type: 'int', NeedsQuotes: false },
            { ID: 'cl-manager', EntityID: CLIENTS_ID, Sequence: 4, Name: 'AccountManagerID', Type: 'uniqueidentifier', NeedsQuotes: true },
        ],
    });
}

interface SentQuery {
    SQL: string;
    Parameters: unknown[] | undefined;
}

/** A SQL Server-shaped provider over `Clients`, whose database answers every query with one row. */
class RecordingProvider extends DatabaseProviderBase {
    public Sent: SentQuery[] = [];
    private readonly entities = [clientsEntity()];

    public override get Entities(): EntityInfo[] {
        return this.entities;
    }

    public override get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[] {
        return ROW_FILTERS;
    }

    async ExecuteSQL<T>(sql: string, parameters?: unknown[]): Promise<Array<T>> {
        this.Sent.push({ SQL: sql, Parameters: parameters });
        return [{ Name: 'Acme Manufacturing' }] as T[];
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

const MANAGER = new UserInfo(null, {
    ID: MANAGER_ID, Name: 'Morgan', Email: 'morgan@example.com', IsActive: true,
    UserRoles: [{ UserID: MANAGER_ID, RoleID: ACCOUNT_MANAGER_ROLE_ID, Role: 'Account Managers' }],
});

function key(fieldName: string, value: string): CompositeKey {
    return new CompositeKey([{ FieldName: fieldName, Value: value }]);
}

describe('EntityRecordNameResolver lookups under row-level security', () => {
    let provider: RecordingProvider;
    let savedProvider: IMetadataProvider;
    let context: AppContext;
    const resolver = new EntityRecordNameResolver();

    beforeEach(() => {
        provider = new RecordingProvider();
        // Row filters resolve through the global provider.
        savedProvider = Metadata.Provider;
        Metadata.Provider = provider;
        const userPayload: UserPayload = { email: MANAGER.Email, userRecord: MANAGER, sessionId: 'session-1' };
        context = { dataSource: undefined, dataSources: [], providers: [{ provider, type: 'Read-Only' }], userPayload };
    });

    afterEach(() => {
        Metadata.Provider = savedProvider;
    });

    function managerRowFilter(): string {
        return provider.EntityByName('Clients').GetEffectiveRowFilterWhereClause(MANAGER, EntityPermissionType.Read, '');
    }

    it("looks the name up under the acting user's read row filter, with the key value bound", async () => {
        const rowFilter = managerRowFilter();
        expect(rowFilter).toContain(MANAGER_ID);

        const result = await resolver.GetEntityRecordName('Clients', key('ID', CLIENT_ID_VALUE), context);

        expect(result.Success).toBe(true);
        expect(provider.Sent).toEqual([
            { SQL: `SELECT [Name] FROM [dbo].[vwClients] WHERE [ID]=@p0 AND (${rowFilter})`, Parameters: [CLIENT_ID_VALUE] },
        ]);
    });

    it('applies the row filter to each item of a batch', async () => {
        const rowFilter = managerRowFilter();

        const results = await resolver.GetEntityRecordNames([{ EntityName: 'Clients', CompositeKey: key('ID', CLIENT_ID_VALUE) }], context);

        expect(results.map(r => r.Success)).toEqual([true]);
        expect(provider.Sent.map(q => q.SQL)).toEqual([`SELECT [Name] FROM [dbo].[vwClients] WHERE [ID]=@p0 AND (${rowFilter})`]);
    });

    it('refuses a key field that is not a primary key, without querying', async () => {
        const result = await resolver.GetEntityRecordName('Clients', key('Tier', '1'), context);

        expect(result.Success).toBe(false);
        expect(result.RecordName).toBeUndefined();
        expect(provider.Sent).toHaveLength(0);
    });

    it('looks no name up when there is no acting user', async () => {
        const result = await resolver.InnerGetEntityRecordName(provider, 'Clients', key('ID', CLIENT_ID_VALUE));

        expect(result.Success).toBe(false);
        expect(provider.Sent).toHaveLength(0);
    });
});
