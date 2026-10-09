// type-graphql decorators on the resolver need the Reflect.metadata polyfill at import time.
import 'reflect-metadata';
/**
 * `GetDataContextItemData` and `GetDataContextData` run the SQL stored in `sql` Data Context Items.
 * Before it runs, that SQL is held to the rules `ExecuteAdhocQuery` applies to caller-supplied SQL:
 *   - the caller owns the data context, or is an administrator (Owner-type user);
 *   - the caller is not a scope-limited (magic-link) session;
 *   - it runs on the read-only provider only — never on the read-write pool, even when no read-only
 *     database is configured;
 *   - it is a single read statement that reads only entity base views the caller may read.
 * Items of the other types load as before, for the calling user.
 *
 * The resolver runs for real against in-memory providers. `mssql` is replaced by a recorder so a
 * test can see whether any SQL reached a raw connection pool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type {
    DatabaseProviderBase,
    IMetadataProvider,
    IRunViewProvider,
    RunQueryParams,
    RunQueryResult,
    RunViewParams,
    RunViewResult,
} from '@memberjunction/core';
import type { MJDataContextEntity, MJDataContextItemEntity } from '@memberjunction/core-entities';
import type { AppContext } from '../types.js';

/** Every SQL text that a raw mssql connection was asked to run, and the pool it was sent to. */
const rawConnectionQueries: Array<{ Pool: string | undefined; SQL: string }> = [];

vi.mock('mssql', () => {
    class RecordingRequest {
        private readonly pool: string | undefined;
        constructor(parent?: { Name?: string }) {
            this.pool = parent?.Name;
        }
        public input(): this {
            return this;
        }
        public async query(sqlText: string): Promise<{ recordset: Array<Record<string, unknown>> }> {
            rawConnectionQueries.push({ Pool: this.pool, SQL: sqlText });
            return { recordset: [{ One: 1 }] };
        }
    }
    class ConnectionPool {}
    return {
        default: { ConnectionPool, Request: RecordingRequest },
        ConnectionPool,
        Request: RecordingRequest,
    };
});

// MJAPI registers the server-side Data Context Item class at startup; this import does the same.
import '@memberjunction/data-context-server';
import { GetDataContextDataResolver } from '../resolvers/GetDataContextDataResolver.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const OWNER_ID = 'A0000000-0000-4000-8000-000000000001';
const DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000001';
const SQL_ITEM_ID = 'C0000000-0000-4000-8000-000000000001';
const ENTITY_ITEM_ID = 'C0000000-0000-4000-8000-000000000002';
const NOTES_ENTITY_ID = 'E0000000-0000-4000-8000-000000000001';
const READ_SQL = 'SELECT 1 AS One';

type ItemRow = Pick<MJDataContextItemEntity,
    'ID' | 'DataContextID' | 'Type' | 'SQL' | 'CodeName' | 'DataJSON' | 'EntityID' | 'ViewID' | 'QueryID' | 'RecordID'>;
type ContextRow = Pick<MJDataContextEntity, 'ID' | 'Name' | 'UserID'>;

function sqlItemRow(sqlText: string): ItemRow {
    return {
        ID: SQL_ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'sql', SQL: sqlText, CodeName: 'revenue',
        DataJSON: null, EntityID: null, ViewID: null, QueryID: null, RecordID: null,
    };
}

function entityItemRow(): ItemRow {
    return {
        ID: ENTITY_ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'full_entity', SQL: null, CodeName: 'notes',
        DataJSON: null, EntityID: NOTES_ENTITY_ID, ViewID: null, QueryID: null, RecordID: null,
    };
}

const DATA_CONTEXT: ContextRow = { ID: DATA_CONTEXT_ID, Name: 'Revenue review', UserID: OWNER_ID };

function user(id: string, type: 'User' | 'Owner'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Email = `${id.slice(-4)}@example.com`;
    u.Type = type;
    return u;
}

const OWNER = user(OWNER_ID, 'User');
const OTHER_USER = user('A0000000-0000-4000-8000-000000000002', 'User');
const ADMINISTRATOR = user('A0000000-0000-4000-8000-000000000003', 'Owner');

function scopeLimitedOwner(): UserInfo {
    const u = user(OWNER_ID, 'User');
    u.MagicLinkScope = { ResourceID: 'F0000000-0000-4000-8000-000000000001', ResourceType: 'Dashboards' };
    return u;
}

const ENTITIES: EntityInfo[] = [
    new EntityInfo({ ID: 'E0000000-0000-4000-8000-0000000000D1', Name: 'MJ: Data Contexts', SchemaName: '__mj', BaseView: 'vwDataContexts', BaseTable: 'DataContext' }),
    new EntityInfo({ ID: 'E0000000-0000-4000-8000-0000000000D2', Name: 'MJ: Data Context Items', SchemaName: '__mj', BaseView: 'vwDataContextItems', BaseTable: 'DataContextItem' }),
    new EntityInfo({
        ID: NOTES_ENTITY_ID, Name: 'Notes', SchemaName: 'crm', BaseView: 'vwNotes', BaseTable: 'Note',
        EntityFields: [{ ID: 'F0000000-0000-4000-8000-0000000000F1', Name: 'Body', Type: 'nvarchar', Sequence: 1, Length: 0, Precision: 0, Scale: 0 }],
    }),
];

const NOTE_ROWS = [{ Body: 'Call back on Tuesday' }];

/** The result shape a provider's ad-hoc path returns for a successful run. */
const AD_HOC_SUCCESS: RunQueryResult = {
    QueryID: '', QueryName: 'Ad-Hoc Query', Success: true, Results: [{ One: 1 }],
    RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '',
};

interface QueryRun {
    SQL: string | undefined;
    User: UserInfo | undefined;
}

interface ViewRun {
    Params: RunViewParams;
    User: UserInfo | undefined;
}

/** An in-memory database provider holding one data context and its items. */
class InMemoryProvider {
    public readonly PlatformKey = 'sqlserver';
    public readonly Entities = ENTITIES;
    public readonly QueryRuns: QueryRun[] = [];
    public readonly ViewRuns: ViewRun[] = [];
    public readonly LoadedKeys: string[] = [];

    constructor(private readonly items: ItemRow[]) {}

    public async RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        this.QueryRuns.push({ SQL: params.SQL, User: contextUser });
        return AD_HOC_SUCCESS;
    }

    public async GetEntityObject<T>(entityName: string): Promise<T> {
        const rows: Array<ItemRow | ContextRow> = entityName === 'MJ: Data Contexts' ? [DATA_CONTEXT] : this.items;
        const record: Record<string, unknown> = {};
        record.Load = async (key: string): Promise<boolean> => {
            this.LoadedKeys.push(key);
            const row = rows.find((r) => r.ID === key);
            if (row) {
                Object.assign(record, row);
            }
            return !!row;
        };
        return record as unknown as T;
    }

    public async RunView(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> {
        this.ViewRuns.push({ Params: params, User: contextUser });
        const results = params.EntityName === 'Notes'
            ? NOTE_ROWS
            : this.items.filter((row) => params.ExtraFilter === `DataContextID = '${row.DataContextID}'`);
        return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    }
}

const READ_WRITE_POOL = { Name: 'read-write connection pool' };
const READ_ONLY_POOL = { Name: 'read-only connection pool' };

interface Server {
    ReadWrite: InMemoryProvider;
    ReadOnly: InMemoryProvider | null;
    Context: AppContext;
}

/** A request context the way MJAPI builds one: the read-only provider exists only with a read-only pool. */
function server(caller: UserInfo, items: ItemRow[], withReadOnlyDatabase: boolean): Server {
    const readWrite = new InMemoryProvider(items);
    const readOnly = withReadOnlyDatabase ? new InMemoryProvider(items) : null;
    const providers: Array<{ provider: InMemoryProvider; type: 'Read-Write' | 'Read-Only' }> = [{ provider: readWrite, type: 'Read-Write' }];
    const dataSources: Array<{ dataSource: object; type: 'Read-Write' | 'Read-Only' }> = [{ dataSource: READ_WRITE_POOL, type: 'Read-Write' }];
    if (readOnly) {
        providers.push({ provider: readOnly, type: 'Read-Only' });
        dataSources.push({ dataSource: READ_ONLY_POOL, type: 'Read-Only' });
    }
    // MJAPI's process-wide default provider is the read-write one.
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(readWrite as unknown as IMetadataProvider);
    vi.spyOn(RunView, 'Provider', 'get').mockReturnValue(readWrite as unknown as IRunViewProvider);
    const context = { providers, dataSources, userPayload: { email: caller.Email, userRecord: caller, sessionId: 'test-session' } };
    return { ReadWrite: readWrite, ReadOnly: readOnly, Context: context as unknown as AppContext };
}

/** Asserts that no SQL text reached any database: no raw connection, no provider ad-hoc run. */
function expectNoSQLRan(s: Server): void {
    expect(rawConnectionQueries).toEqual([]);
    expect(s.ReadWrite.QueryRuns).toEqual([]);
    expect(s.ReadOnly?.QueryRuns ?? []).toEqual([]);
}

const resolver = new GetDataContextDataResolver();

beforeEach(() => {
    rawConnectionQueries.length = 0;
});

// ─── GetDataContextItemData ──────────────────────────────────────────────────

describe('GetDataContextItemData — sql items', () => {
    it('runs the owner\'s SQL on the read-only provider, for the owner', async () => {
        const s = server(OWNER, [sqlItemRow(READ_SQL)], true);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expect(result.Success).toBe(true);
        expect(JSON.parse(result.Result ?? 'null')).toEqual([{ One: 1 }]);
        expect(s.ReadOnly?.QueryRuns).toEqual([{ SQL: READ_SQL, User: OWNER }]);
        expect(s.ReadWrite.QueryRuns).toEqual([]);
        expect(rawConnectionQueries).toEqual([]);
    });

    it('refuses to run SQL when no read-only database is configured, instead of falling back to read-write', async () => {
        const s = server(OWNER, [sqlItemRow(READ_SQL)], false);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/read-only/i);
    });

    it('refuses stacked statements before they reach a database', async () => {
        const s = server(OWNER, [sqlItemRow('SELECT 1 AS One; SELECT 2 AS Two')], true);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/single read query/i);
    });

    it('refuses SQL that reads a table other than an entity base view', async () => {
        const s = server(OWNER, [sqlItemRow('SELECT Email FROM __mj.[User]')], true);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/entity base view/i);
    });

    it('refuses to run another user\'s SQL', async () => {
        const s = server(OTHER_USER, [sqlItemRow(READ_SQL)], true);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/owner/i);
    });

    it('refuses to run SQL whose data context cannot be loaded, since its owner is unknown', async () => {
        const orphan = { ...sqlItemRow(READ_SQL), DataContextID: 'B0000000-0000-4000-8000-000000000009' };
        const s = server(OWNER, [orphan], true);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/owner/i);
    });

    it('lets an administrator (Owner-type user) run another user\'s SQL, on the read-only provider', async () => {
        const s = server(ADMINISTRATOR, [sqlItemRow(READ_SQL)], true);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expect(result.Success).toBe(true);
        expect(s.ReadOnly?.QueryRuns).toEqual([{ SQL: READ_SQL, User: ADMINISTRATOR }]);
        expect(rawConnectionQueries).toEqual([]);
    });

    it('refuses a scope-limited (magic-link) session, even for its own data context', async () => {
        const caller = scopeLimitedOwner();
        const s = server(caller, [sqlItemRow(READ_SQL)], true);

        const result = await resolver.GetDataContextItemData(SQL_ITEM_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/scope-limited/i);
    });
});

describe('GetDataContextItemData — other item types', () => {
    it('loads an entity item for the calling user, with no ownership or read-only database needed', async () => {
        const s = server(OTHER_USER, [entityItemRow()], false);

        const result = await resolver.GetDataContextItemData(ENTITY_ITEM_ID, s.Context);

        expect(result.Success).toBe(true);
        expect(JSON.parse(result.Result ?? 'null')).toEqual(NOTE_ROWS);
        const noteViewRuns = s.ReadWrite.ViewRuns.filter((run) => run.Params.EntityName === 'Notes');
        expect(noteViewRuns.map((run) => run.User)).toEqual([OTHER_USER]);
    });
});

// ─── GetDataContextData ──────────────────────────────────────────────────────

describe('GetDataContextData — sql items', () => {
    it('runs the owner\'s SQL items on the read-only provider', async () => {
        const s = server(OWNER, [sqlItemRow(READ_SQL)], true);

        const result = await resolver.GetDataContextData(DATA_CONTEXT_ID, s.Context);

        expect(result.Success).toBe(true);
        expect((result.Results ?? []).map((r) => JSON.parse(r ?? 'null'))).toEqual([[{ One: 1 }]]);
        expect(s.ReadOnly?.QueryRuns).toEqual([{ SQL: READ_SQL, User: OWNER }]);
        expect(rawConnectionQueries).toEqual([]);
    });

    it('refuses to run SQL items when no read-only database is configured', async () => {
        const s = server(OWNER, [sqlItemRow(READ_SQL)], false);

        const result = await resolver.GetDataContextData(DATA_CONTEXT_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect((result.ErrorMessages ?? []).join(' ')).toMatch(/read-only/i);
    });

    it('refuses to run another user\'s SQL items', async () => {
        const s = server(OTHER_USER, [sqlItemRow(READ_SQL)], true);

        const result = await resolver.GetDataContextData(DATA_CONTEXT_ID, s.Context);

        expectNoSQLRan(s);
        expect(result.Success).toBe(false);
        expect((result.ErrorMessages ?? []).join(' ')).toMatch(/owner/i);
    });

    it('refuses a DataContextID that is not a UUID before it reaches the item filter', async () => {
        const s = server(OWNER, [sqlItemRow(READ_SQL)], true);
        const notAnID = `${DATA_CONTEXT_ID}' OR '1'='1`;

        const result = await resolver.GetDataContextData(notAnID, s.Context);

        expect(result.Success).toBe(false);
        const filters = [...s.ReadWrite.ViewRuns, ...(s.ReadOnly?.ViewRuns ?? [])].map((run) => run.Params.ExtraFilter ?? '');
        const keys = [...s.ReadWrite.LoadedKeys, ...(s.ReadOnly?.LoadedKeys ?? [])];
        expect([...filters, ...keys].filter((text) => text.includes("OR '1'='1"))).toEqual([]);
        expectNoSQLRan(s);
    });
});
