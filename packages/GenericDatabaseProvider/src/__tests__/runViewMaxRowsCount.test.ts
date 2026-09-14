/**
 * InternalRunView's row-count round trip.
 *
 * A row-LIMITED read that comes back FULL might have been truncated, so the provider buys the
 * real total with a second, SEQUENTIAL `COUNT(*)` — that is what makes Explorer's "100 of 299"
 * correct, and it must keep working.
 *
 * The one case where it cannot be worth anything is `MaxRows:1`: those callers are asking "does
 * a row exist / give me the one row" (a record-map lookup, a single-key resolve) and never read
 * TotalRowCount. On a live tenant those probes were 1,321 extra round trips and 9,760 ms — 11.4%
 * of all SQL time in a 120-second window — for a number nothing looked at.
 *
 * These tests pin both halves: the `MaxRows:1` probe issues ONE query, and everything above 1
 * still issues the count.
 *
 * The one observable difference for `MaxRows:1` is asserted rather than glossed: a hit now reports
 * `TotalRowCount: 1` (the fallback `rowCount ?? retData.length`) instead of the whole view's row
 * count. The fixture's COUNT(*) answers with a total far from 1 precisely so that a leaked count
 * can never pass for the fallback.
 */

import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    UserInfo,
    UserRoleInfo,
    ProviderType,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '@memberjunction/core';
import type { RunQueryResult, RunViewParams, RunViewResult } from '@memberjunction/core';
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
// Concrete subclass: records every statement InternalRunView executes, and
// answers COUNT(*) statements with a total distinct from the row count so a
// leaked count can never be mistaken for the data-row fallback.
// Stub block patterned after FlsSelectTestProvider in fieldSecurity.selectList.test.ts.
// ---------------------------------------------------------------------------
const TOTAL_IN_VIEW = 4242;

class RowCountTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    private _entities: EntityInfo[] = [];
    /** Rows the data query returns. */
    public dataRows: Record<string, unknown>[] = [];
    /** Every SQL statement ExecuteSQL was handed, in order. */
    public readonly executed: string[] = [];

    public seedEntities(entities: EntityInfo[]): void {
        this._entities = entities;
    }
    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }

    /** InternalRunView is protected; this is the test entry point. */
    public runView<T = unknown>(params: RunViewParams, user: UserInfo): Promise<RunViewResult<T>> {
        return this.InternalRunView<T>(params, user);
    }

    public get countStatements(): string[] {
        return this.executed.filter(sql => /COUNT\(\*\)/i.test(sql));
    }

    public override async ExecuteSQL<T>(sql?: string): Promise<Array<T>> {
        this.executed.push(sql ?? '');
        if (sql && /COUNT\(\*\)/i.test(sql)) {
            return [{ TotalRowCount: TOTAL_IN_VIEW }] as unknown as Array<T>;
        }
        return this.dataRows as unknown as Array<T>;
    }

    // --- Abstract-member implementations (just enough to satisfy the type system) ---
    protected get UUIDFunctionPattern(): RegExp { return RowCountTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return RowCountTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected override BuildTopClause(maxRows: number): string { return `TOP ${maxRows}`; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
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
    public get InstanceConnectionString(): string { return 'row-count-test'; }
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
// Real EntityInfo + UserInfo fixtures — permissions have to be live, since
// InternalRunView gates on CheckUserReadPermissions before it builds any SQL.
// ---------------------------------------------------------------------------

const ROLE_ID = 'B0000000-0000-0000-0000-000000000001';
const ENTITY_ID = 'entity-widgets';

function widgetEntity(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Widgets',
        SchemaName: 'dbo',
        BaseTable: 'Widget',
        BaseView: 'vwWidgets',
        IncludeInAPI: true,
        AuditViewRuns: false,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Widgets', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Widgets', Type: 'nvarchar', Length: 100 },
        ],
    });
}

function buildUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'user-1';
    u.Name = 'Row Count User';
    u.Email = 'rowcount@test.com';
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        [new UserRoleInfo({ UserID: 'user-1', RoleID: ROLE_ID, Role: `Role-${ROLE_ID}` })];
    return u;
}

function setup(rowCount: number): { provider: RowCountTestProvider; user: UserInfo } {
    const provider = new RowCountTestProvider();
    provider.seedEntities([widgetEntity()]);
    provider.dataRows = Array.from({ length: rowCount }, (_, i) => ({ ID: `id-${i}`, Name: `Widget ${i}` }));
    return { provider, user: buildUser() };
}

// ═══════════════════════════════════════════════════════════════════════════
// MaxRows:1 — the existence probe pays for one query, not two
// ═══════════════════════════════════════════════════════════════════════════

describe('InternalRunView — MaxRows:1 row count', () => {
    it('issues exactly ONE query for a MaxRows:1 probe that hits, and reports TotalRowCount 1', async () => {
        const { provider, user } = setup(1);

        const result = await provider.runView({ EntityName: 'Widgets', MaxRows: 1 }, user);

        expect(result.Success).toBe(true);
        expect(provider.executed.length).toBe(1);
        expect(provider.countStatements).toEqual([]);
        expect(result.TotalRowCount).toBe(1);
        expect(result.TotalRowCount).not.toBe(TOTAL_IN_VIEW); // the view total was never asked for
        expect(result.RowCount).toBe(1);
        expect(result.Results.length).toBe(1);
    });

    it('issues exactly ONE query for a MaxRows:1 probe that MISSES', async () => {
        const { provider, user } = setup(0);

        const result = await provider.runView({ EntityName: 'Widgets', MaxRows: 1 }, user);

        expect(result.Success).toBe(true);
        expect(provider.executed.length).toBe(1);
        expect(result.TotalRowCount).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// MaxRows > 1 — the Explorer "N of M" count is UNCHANGED
// ═══════════════════════════════════════════════════════════════════════════

describe('InternalRunView — the truncation count is preserved above MaxRows:1', () => {
    it('still issues the COUNT when a MaxRows:100 read comes back full, and reports the real total', async () => {
        const { provider, user } = setup(100);

        const result = await provider.runView({ EntityName: 'Widgets', MaxRows: 100 }, user);

        expect(result.Success).toBe(true);
        expect(provider.countStatements.length).toBe(1);
        expect(result.TotalRowCount).toBe(TOTAL_IN_VIEW);
        expect(result.RowCount).toBe(100);
    });

    it('still issues the COUNT at the smallest multi-row limit (MaxRows:2 returning 2)', async () => {
        const { provider, user } = setup(2);

        const result = await provider.runView({ EntityName: 'Widgets', MaxRows: 2 }, user);

        expect(provider.countStatements.length).toBe(1);
        expect(result.TotalRowCount).toBe(TOTAL_IN_VIEW);
    });

    it('skips the COUNT when a MaxRows:100 read comes back SHORT (nothing was truncated)', async () => {
        const { provider, user } = setup(7);

        const result = await provider.runView({ EntityName: 'Widgets', MaxRows: 100 }, user);

        expect(provider.countStatements).toEqual([]);
        expect(result.TotalRowCount).toBe(7);
    });
});
