import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        Instance: {
            Config: async () => {},
            EncryptValue: async (v: unknown) => v,
            DecryptValue: async (v: unknown) => v,
        },
    },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    InMemoryLocalStorageProvider,
    LocalCacheManager,
    RunViewParams,
    RunViewResult,
    UserInfo,
    EntityInfo,
    ExecuteSQLOptions,
} from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * A client whose cached copy of a change-tracked entity is older than the server's cached
 * copy receives only the rows that changed since its copy, not the full cached result.
 */

interface TestRow {
    ID: string;
    Name: string;
    __mj_CreatedAt: string;
    __mj_UpdatedAt: string;
}

const TRACKED_ENTITY = new EntityInfo({
    ID: 'ent-tracked',
    Name: 'Tracked Items',
    SchemaName: '__mj',
    BaseView: 'vwTrackedItems',
    AllowCaching: true,
    TrackRecordChanges: true,
    EntityFields: [
        { ID: 'f-id', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' },
        { ID: 'f-name', Name: 'Name', IsPrimaryKey: false, Type: 'nvarchar' },
        { ID: 'f-created', Name: '__mj_CreatedAt', IsPrimaryKey: false, Type: 'datetimeoffset' },
        { ID: 'f-updated', Name: '__mj_UpdatedAt', IsPrimaryKey: false, IsUpdatedAtField: true, Type: 'datetimeoffset' },
    ],
});

class TrackedDifferentialTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TrackedDifferentialTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TrackedDifferentialTestProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    public FullViewReads: RunViewParams[] = [];
    public ExecutedSQLStatements: string[] = [];
    private queuedSQLResults: Array<Record<string, unknown>[]> = [];
    private sqlCallIndex = 0;

    override get TrustLocalCacheCompletely(): boolean {
        return true;
    }

    public QueueSQLResults(results: Array<Record<string, unknown>[]>): void {
        this.queuedSQLResults = results;
        this.sqlCallIndex = 0;
    }

    public override EntityByName(name: string): EntityInfo | undefined {
        return name === TRACKED_ENTITY.Name ? TRACKED_ENTITY : undefined;
    }

    public override CheckUserReadPermissions(_entityName: string, _userInfo: UserInfo | undefined): boolean {
        return true;
    }

    protected override async buildWhereClauseForCacheCheck(params: RunViewParams): Promise<string> {
        return typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
    }

    protected override async resolveEffectiveBaseView(entityInfo: EntityInfo): Promise<string> {
        return entityInfo.BaseView;
    }

    public override async ExecuteSQL<T>(query?: string, _parameters?: unknown[], _options?: ExecuteSQLOptions): Promise<Array<T>> {
        this.ExecutedSQLStatements.push(query ?? '');
        const rows = this.queuedSQLResults[this.sqlCallIndex] ?? [];
        this.sqlCallIndex++;
        return rows as unknown as Array<T>;
    }

    protected override async InternalRunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.FullViewReads.push(params);
        return {
            Success: true,
            Results: [] as T[],
            UserViewRunID: '',
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 0,
            ErrorMessage: '',
        } as RunViewResult<T>;
    }

    public FingerprintFor(params: RunViewParams, contextUser?: UserInfo): string {
        return LocalCacheManager.Instance.GenerateRunViewFingerprint(
            params,
            this.InstanceConnectionString,
            this.ComputeRunViewRLSWhereClause(params, contextUser),
            undefined,
            this.ComputeRunViewFLSFingerprintKey(params),
        );
    }
}

const testUser: UserInfo = { ID: 'u-tracked', Name: 'Tracked Tester', Email: 'tracked@test.com' } as UserInfo;

const unchangedRows: TestRow[] = [
    { ID: '1', Name: 'Item 1', __mj_CreatedAt: '2026-04-20T11:00:00.000Z', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
    { ID: '2', Name: 'Item 2', __mj_CreatedAt: '2026-04-20T11:00:00.000Z', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
];
const newRow: TestRow = { ID: '3', Name: 'Item 3', __mj_CreatedAt: '2026-04-20T12:10:00.000Z', __mj_UpdatedAt: '2026-04-20T12:10:00.000Z' };

describe('RunViewsWithCacheCheck: change-tracked entity with an older client cache', () => {
    let provider: TrackedDifferentialTestProvider;
    const params: RunViewParams = { EntityName: TRACKED_ENTITY.Name, CacheLocal: true };

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        provider = new TrackedDifferentialTestProvider();
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
        // The server slot already holds the new row (12:10, 3 rows); the client still has 2 rows (12:00).
        await LocalCacheManager.Instance.SetRunViewResult(
            provider.FingerprintFor(params, testUser),
            params,
            [...unchangedRows, newRow],
            '2026-04-20T12:10:00.000Z',
            undefined,
            3,
            provider,
        );
        provider.QueueSQLResults([
            [{ TotalRows: 3, MaxUpdatedAt: '2026-04-20T12:10:00.000Z' }],
            [newRow as unknown as Record<string, unknown>],
            [],
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function runOlderClientCheck() {
        return provider.RunViewsWithCacheCheck(
            [{ params, cacheStatus: { maxUpdatedAt: '2026-04-20T12:00:00.000Z', rowCount: 2 } }],
            testUser,
        );
    }

    function expectChangedRowsOnly(response: Awaited<ReturnType<typeof runOlderClientCheck>>) {
        expect(response.success).toBe(true);
        expect(response.results).toHaveLength(1);
        const result = response.results[0];
        expect(result.status).toBe('differential');
        expect(result.results).toBeUndefined();
        expect(result.differentialData?.updatedRows).toEqual([newRow]);
        expect(result.differentialData?.deletedRecordIDs).toEqual([]);
        expect(result.rowCount).toBe(3);
        expect(provider.FullViewReads).toHaveLength(0);
    }

    it('sends only the changed rows when the server slot is within its freshness window', async () => {
        const response = await runOlderClientCheck();

        expectChangedRowsOnly(response);
        expect(provider.ExecutedSQLStatements).toHaveLength(3);
        expect(provider.ExecutedSQLStatements[0]).toContain('COUNT(*)');
        expect(provider.ExecutedSQLStatements[1]).toContain('"__mj_UpdatedAt" > \'2026-04-20T12:00:00.000Z\'');
        expect(provider.ExecutedSQLStatements[2]).toContain('vwRecordChanges');
    });

    it('sends only the changed rows when an expired server slot is verified against the database', async () => {
        const fingerprint = provider.FingerprintFor(params, testUser);
        LocalCacheManager.Instance.TouchRunViewResultVerifiedAt(fingerprint, Date.now() - 10_000);

        const response = await runOlderClientCheck();

        expectChangedRowsOnly(response);
        expect(provider.ExecutedSQLStatements).toHaveLength(3);
        expect(await LocalCacheManager.Instance.GetRunViewResult(fingerprint)).not.toBeNull();
    });
});
