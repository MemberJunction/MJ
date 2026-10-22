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

interface TestRow {
    ID: string;
    Name: string;
    __mj_UpdatedAt: string;
}

const CUSTOMERS_ENTITY = new EntityInfo({
    ID: 'ent-customers',
    Name: 'Customers',
    SchemaName: '__mj',
    BaseView: 'vwCustomers',
    AllowCaching: true,
    TrackRecordChanges: false,
    EntityFields: [
        { ID: 'f-id', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' },
        { ID: 'f-name', Name: 'Name', IsPrimaryKey: false, Type: 'nvarchar' },
        { ID: 'f-updated', Name: '__mj_UpdatedAt', IsPrimaryKey: false, IsUpdatedAtField: true, Type: 'datetimeoffset' },
    ],
});

class ReconcileTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return ReconcileTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return ReconcileTestProvider._defaultPattern; }

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
    public RowsFromDatabase: TestRow[] = [];
    public ExecutedSQLStatements: string[] = [];
    private queuedSQLResults: Array<Record<string, unknown>[]> = [];
    private sqlCallIndex = 0;
    private _trustCache = true;

    public setTrustLocalCache(trust: boolean): void {
        this._trustCache = trust;
    }

    override get TrustLocalCacheCompletely(): boolean {
        return this._trustCache;
    }

    public queueSQLResults(results: Array<Record<string, unknown>[]>): void {
        this.queuedSQLResults = results;
        this.sqlCallIndex = 0;
    }

    public override EntityByName(name: string): EntityInfo | undefined {
        if (name === 'Customers') {
            return CUSTOMERS_ENTITY;
        }
        return undefined;
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
        const rows = this.RowsFromDatabase as unknown as T[];
        return {
            Success: true,
            Results: rows,
            UserViewRunID: '',
            RowCount: rows.length,
            TotalRowCount: rows.length,
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

const testUser: UserInfo = { ID: 'u-reconcile', Name: 'Reconcile Tester', Email: 'reconcile@test.com' } as UserInfo;

function buildDatasetItemRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        DatasetID: 'ds-001',
        Code: 'EntityFields',
        Entity: 'MJ: Entity Fields',
        EntityID: 'ent-fields-001',
        EntitySchemaName: '__mj',
        EntityBaseView: 'vwEntityFields',
        WhereClause: null,
        DateFieldToCheck: '__mj_UpdatedAt',
        DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z',
        DatasetUpdatedAt: '2026-01-01T00:00:00.000Z',
        Columns: null,
        ...overrides,
    };
}

describe('Zero-Restart Cache Auto-Reconciliation (RunViewsWithCacheCheck & GetDatasetByName)', () => {
    let provider: ReconcileTestProvider;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        provider = new ReconcileTestProvider();
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Scenario 1: Client Monotonicity Guard (Part 2)', () => {
        it('does NOT serve a stale server slot when client cacheStatus has a newer maxUpdatedAt, evicts the server slot, and validates against SQL', async () => {
            const params: RunViewParams = { EntityName: 'Customers', CacheLocal: true };
            const fingerprint = provider.FingerprintFor(params, testUser);

            // Seed server cache slot with OLDER data (12:00:00Z, 2 rows)
            const staleServerRows: TestRow[] = [
                { ID: '1', Name: 'Old A', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: '2', Name: 'Old B', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
            ];
            await LocalCacheManager.Instance.SetRunViewResult(
                fingerprint,
                params,
                staleServerRows,
                '2026-04-20T12:00:00.000Z',
                undefined,
                2,
                provider,
            );

            const invalidateSpy = vi.spyOn(LocalCacheManager.Instance, 'InvalidateRunViewResult');

            // SQL status check reports the DB matches the client's newer timestamp (12:05:00Z, 2 rows)
            provider.queueSQLResults([
                [{ TotalRows: 2, MaxUpdatedAt: '2026-04-20T12:05:00.000Z' }],
            ]);

            const response = await provider.RunViewsWithCacheCheck(
                [
                    {
                        params,
                        cacheStatus: {
                            maxUpdatedAt: '2026-04-20T12:05:00.000Z',
                            rowCount: 2,
                        },
                    },
                ],
                testUser,
            );

            expect(response.success).toBe(true);
            expect(response.results).toHaveLength(1);
            // Must return 'current' (validated against SQL), NOT 'stale' with the older server rows
            expect(response.results[0].status).toBe('current');
            expect(response.results[0].results).toBeUndefined();

            // Server slot must have been invalidated
            expect(invalidateSpy).toHaveBeenCalledWith(fingerprint);
            expect(await LocalCacheManager.Instance.GetRunViewResult(fingerprint)).toBeNull();

            // Exactly 1 lightweight SQL status query ran; 0 full view reads
            expect(provider.ExecutedSQLStatements).toHaveLength(1);
            expect(provider.ExecutedSQLStatements[0]).toContain('COUNT(*)');
            expect(provider.FullViewReads).toHaveLength(0);
        });
    });

    describe('Scenario 2: TTL-Expired Server Slot + Out-of-Band SQL Change (Part 2)', () => {
        it('detects out-of-band SQL changes when server slot TTL has expired, invalidates the stale slot, refreshes from DB, and updates LocalCacheManager', async () => {
            const params: RunViewParams = { EntityName: 'Customers', CacheLocal: true };
            const fingerprint = provider.FingerprintFor(params, testUser);

            // Seed server cache with 2 rows at 12:00:00Z
            const initialCachedRows: TestRow[] = [
                { ID: '1', Name: 'Customer 1', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: '2', Name: 'Customer 2', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
            ];
            await LocalCacheManager.Instance.SetRunViewResult(
                fingerprint,
                params,
                initialCachedRows,
                '2026-04-20T12:00:00.000Z',
                undefined,
                2,
                provider,
            );

            // Age the server slot beyond ServerCacheVerificationTTL (default 5000ms)
            LocalCacheManager.Instance.TouchRunViewResultVerifiedAt(fingerprint, Date.now() - 10_000);

            // Out-of-band SQL mutation added a 3rd row at 12:10:00Z
            provider.queueSQLResults([
                [{ TotalRows: 3, MaxUpdatedAt: '2026-04-20T12:10:00.000Z' }],
            ]);
            const freshDBRows: TestRow[] = [
                ...initialCachedRows,
                { ID: '3', Name: 'Customer 3 (From Migration)', __mj_UpdatedAt: '2026-04-20T12:10:00.000Z' },
            ];
            provider.RowsFromDatabase = freshDBRows;

            const invalidateSpy = vi.spyOn(LocalCacheManager.Instance, 'InvalidateRunViewResult');

            // Client currently matches the old server slot (12:00:00Z, 2 rows)
            const response = await provider.RunViewsWithCacheCheck(
                [
                    {
                        params,
                        cacheStatus: {
                            maxUpdatedAt: '2026-04-20T12:00:00.000Z',
                            rowCount: 2,
                        },
                    },
                ],
                testUser,
            );

            expect(response.success).toBe(true);
            expect(response.results).toHaveLength(1);
            expect(response.results[0].status).toBe('stale');
            expect(response.results[0].rowCount).toBe(3);
            expect(response.results[0].results).toEqual(freshDBRows);

            // Stale server slot was invalidated, then repopulated with the 3 fresh rows from DB
            expect(invalidateSpy).toHaveBeenCalledWith(fingerprint);
            expect(provider.FullViewReads).toHaveLength(1);

            const updatedServerSlot = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
            expect(updatedServerSlot).not.toBeNull();
            expect(updatedServerSlot?.rowCount).toBe(3);
            expect(updatedServerSlot?.maxUpdatedAt).toBe('2026-04-20T12:10:00.000Z');
        });
    });

    describe('Scenario 3: TTL-Expired Server Slot + No SQL Change (Part 2)', () => {
        it('touches lastVerifiedAt via TouchRunViewResultVerifiedAt, executes NO full SELECT * query, and serves current/stale from verified cache', async () => {
            const params: RunViewParams = { EntityName: 'Customers', CacheLocal: true };
            const fingerprint = provider.FingerprintFor(params, testUser);

            const cachedRows: TestRow[] = [
                { ID: '1', Name: 'Customer 1', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: '2', Name: 'Customer 2', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
            ];
            await LocalCacheManager.Instance.SetRunViewResult(
                fingerprint,
                params,
                cachedRows,
                '2026-04-20T12:00:00.000Z',
                undefined,
                2,
                provider,
            );

            // Expire verification window
            const expiredTime = Date.now() - 10_000;
            LocalCacheManager.Instance.TouchRunViewResultVerifiedAt(fingerprint, expiredTime);

            const touchSpy = vi.spyOn(LocalCacheManager.Instance, 'TouchRunViewResultVerifiedAt');

            // SQL probe confirms the server slot is still current (2 rows, 12:00:00Z)
            provider.queueSQLResults([
                [{ TotalRows: 2, MaxUpdatedAt: '2026-04-20T12:00:00.000Z' }],
            ]);

            // 3a: Client matches server slot -> receives 'current'
            const currentResp = await provider.RunViewsWithCacheCheck(
                [
                    {
                        params,
                        cacheStatus: {
                            maxUpdatedAt: '2026-04-20T12:00:00.000Z',
                            rowCount: 2,
                        },
                    },
                ],
                testUser,
            );

            expect(currentResp.success).toBe(true);
            expect(currentResp.results[0].status).toBe('current');
            expect(touchSpy).toHaveBeenCalledWith(fingerprint);
            expect(provider.ExecutedSQLStatements).toHaveLength(1);
            expect(provider.FullViewReads).toHaveLength(0);

            // Verify lastVerifiedAt was updated to a recent timestamp
            const verifiedSlot = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
            expect(verifiedSlot?.lastVerifiedAt).toBeGreaterThan(expiredTime);

            // 3b: Immediately call again with an older client cacheStatus within the freshness window:
            // Because lastVerifiedAt was just touched, zero SQL queries should execute and the client
            // should receive 'stale' served directly from the verified server cache slot.
            const staleClientResp = await provider.RunViewsWithCacheCheck(
                [
                    {
                        params,
                        cacheStatus: {
                            maxUpdatedAt: '2026-04-20T11:00:00.000Z',
                            rowCount: 1,
                        },
                    },
                ],
                testUser,
            );

            expect(staleClientResp.success).toBe(true);
            expect(staleClientResp.results[0].status).toBe('stale');
            expect(staleClientResp.results[0].results).toEqual(cachedRows);
            // Still only the 1 status probe from 3a — no new SQL status probe and no full view read!
            expect(provider.ExecutedSQLStatements).toHaveLength(1);
            expect(provider.FullViewReads).toHaveLength(0);
        });
    });

    describe('Scenario 4: GetDatasetByName Auto-Reconciliation (Part 3)', () => {
        it('reconciles cached dataset item slots against GetDatasetStatusByName SQL status, re-fetching only mismatched items from SQL and updating LocalCacheManager', async () => {
            provider.setTrustLocalCache(true);

            const entitiesMetaRow = buildDatasetItemRow({
                Code: 'Entities',
                Entity: 'MJ: Entities',
                EntityID: 'ent-001',
                EntityBaseView: 'vwEntities',
            });
            const fieldsMetaRow = buildDatasetItemRow({
                Code: 'EntityFields',
                Entity: 'MJ: Entity Fields',
                EntityID: 'ent-fields-001',
                EntityBaseView: 'vwEntityFields',
            });

            // Compute exact dataset fingerprints for both items
            const entitiesFp = LocalCacheManager.Instance.GenerateRunViewFingerprint(
                { EntityName: 'MJ: Entities', ExtraFilter: '' },
                provider.InstanceConnectionString,
                undefined,
                'MJ_Metadata/Entities',
            );
            const fieldsFp = LocalCacheManager.Instance.GenerateRunViewFingerprint(
                { EntityName: 'MJ: Entity Fields', ExtraFilter: '' },
                provider.InstanceConnectionString,
                undefined,
                'MJ_Metadata/EntityFields',
            );

            const cachedEntities: TestRow[] = [
                { ID: 'e1', Name: 'Entities', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: 'e2', Name: 'Entity Fields', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
            ];
            // Stale EntityFields cache has only 5 rows at 12:00:00Z
            const staleCachedFields: TestRow[] = [
                { ID: 'f1', Name: 'Field1', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: 'f2', Name: 'Field2', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: 'f3', Name: 'Field3', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: 'f4', Name: 'Field4', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: 'f5', Name: 'Field5', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
            ];
            // Fresh SQL EntityFields has 7 rows (2 added by out-of-band migration at 12:05:00Z)
            const freshSQLFields: TestRow[] = [
                ...staleCachedFields,
                { ID: 'f6', Name: 'Field6', __mj_UpdatedAt: '2026-04-20T12:05:00.000Z' },
                { ID: 'f7', Name: 'Field7', __mj_UpdatedAt: '2026-04-20T12:05:00.000Z' },
            ];

            await LocalCacheManager.Instance.SetRunViewResult(
                entitiesFp,
                { EntityName: 'MJ: Entities', ExtraFilter: '' },
                cachedEntities,
                '2026-04-20T12:00:00.000Z',
                undefined,
                2,
                provider,
                undefined,
                { ProviderInternalScaffolding: true },
            );
            await LocalCacheManager.Instance.SetRunViewResult(
                fieldsFp,
                { EntityName: 'MJ: Entity Fields', ExtraFilter: '' },
                staleCachedFields,
                '2026-04-20T12:00:00.000Z',
                undefined,
                5,
                provider,
                undefined,
                { ProviderInternalScaffolding: true },
            );

            // Force verification on GetDatasetByName by setting ServerCacheVerificationTTL = 0
            provider.ServerCacheVerificationTTL = 0;

            const invalidateSpy = vi.spyOn(LocalCacheManager.Instance, 'InvalidateRunViewResult');

            // Queue SQL responses:
            // 1. GetDatasetByName dataset metadata query -> [entitiesMetaRow, fieldsMetaRow]
            // 2. GetDatasetStatusByName (triggered by verification) dataset metadata query -> [entitiesMetaRow, fieldsMetaRow]
            // 3. GetDatasetStatusByName status query for Entities -> 2 rows, 12:00:00Z (matches cache!)
            // 4. GetDatasetStatusByName status query for EntityFields -> 7 rows, 12:05:00Z (MISMATCH: 7 != 5!)
            // 5. GetDatasetByName SQL fetch for ONLY the mismatched EntityFields item -> freshSQLFields (7 rows)
            provider.queueSQLResults([
                [entitiesMetaRow, fieldsMetaRow],
                [entitiesMetaRow, fieldsMetaRow],
                [{ UpdateDate: '2026-04-20T12:00:00.000Z', TheRowCount: 2 }],
                [{ UpdateDate: '2026-04-20T12:05:00.000Z', TheRowCount: 7 }],
                freshSQLFields as unknown as Record<string, unknown>[],
            ]);

            const datasetResult = await provider.GetDatasetByName('MJ_Metadata', undefined, testUser);

            expect(datasetResult.Success).toBe(true);
            expect(datasetResult.Results).toHaveLength(2);

            const entitiesItem = datasetResult.Results.find(r => r.Code === 'Entities');
            const fieldsItem = datasetResult.Results.find(r => r.Code === 'EntityFields');

            // Entities matched SQL status and was served from cache
            expect(entitiesItem?.Results).toEqual(cachedEntities);
            // EntityFields disagreed with SQL status (5 vs 7 rows), was invalidated, re-fetched from SQL, and returned with all 7 rows
            expect(fieldsItem?.Results).toHaveLength(7);
            expect(fieldsItem?.Results).toEqual(freshSQLFields);

            expect(invalidateSpy).toHaveBeenCalledWith(fieldsFp);
            expect(invalidateSpy).not.toHaveBeenCalledWith(entitiesFp);

            // LocalCacheManager now holds the fresh 7-row EntityFields slot
            const healedFieldsSlot = await LocalCacheManager.Instance.GetRunViewResult(fieldsFp);
            expect(healedFieldsSlot?.rowCount).toBe(7);
            expect(healedFieldsSlot?.maxUpdatedAt).toBe('2026-04-20T12:05:00.000Z');
        });

        it('reuses recent GetDatasetStatusByName SQL status during RefreshIfNeeded -> GetDatasetByName flow even within TTL window', async () => {
            provider.setTrustLocalCache(true);
            // Keep default 5000ms TTL — the cached slot itself is fresh in memory,
            // but GetDatasetStatusByName was just called by RefreshIfNeeded() and saw 7 rows in SQL.
            provider.ServerCacheVerificationTTL = 5000;

            const fieldsMetaRow = buildDatasetItemRow({
                Code: 'EntityFields',
                Entity: 'MJ: Entity Fields',
                EntityID: 'ent-fields-001',
                EntityBaseView: 'vwEntityFields',
            });

            const fieldsFp = LocalCacheManager.Instance.GenerateRunViewFingerprint(
                { EntityName: 'MJ: Entity Fields', ExtraFilter: '' },
                provider.InstanceConnectionString,
                undefined,
                'MJ_Metadata/EntityFields',
            );

            const staleCachedFields: TestRow[] = [
                { ID: 'f1', Name: 'Field1', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
                { ID: 'f2', Name: 'Field2', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' },
            ];
            const freshSQLFields: TestRow[] = [
                ...staleCachedFields,
                { ID: 'f3', Name: 'Field3', __mj_UpdatedAt: '2026-04-20T12:05:00.000Z' },
            ];

            await LocalCacheManager.Instance.SetRunViewResult(
                fieldsFp,
                { EntityName: 'MJ: Entity Fields', ExtraFilter: '' },
                staleCachedFields,
                '2026-04-20T12:00:00.000Z',
                undefined,
                2,
                provider,
                undefined,
                { ProviderInternalScaffolding: true },
            );

            // Step 1: Call GetDatasetStatusByName (as RefreshIfNeeded does)
            provider.queueSQLResults([
                [fieldsMetaRow],
                [{ UpdateDate: '2026-04-20T12:05:00.000Z', TheRowCount: 3 }],
                // Step 2: GetDatasetByName will run next; it reuses the status from Step 1
                // and only executes metadata query + SQL fetch for the mismatched EntityFields item
                [fieldsMetaRow],
                freshSQLFields as unknown as Record<string, unknown>[],
            ]);

            const statusResult = await provider.GetDatasetStatusByName('MJ_Metadata', undefined, testUser);
            expect(statusResult.Success).toBe(true);
            expect(statusResult.EntityUpdateDates[0].RowCount).toBe(3);

            const datasetResult = await provider.GetDatasetByName('MJ_Metadata', undefined, testUser);
            expect(datasetResult.Success).toBe(true);
            expect(datasetResult.Results[0].Results).toHaveLength(3);
            expect(datasetResult.Results[0].Results).toEqual(freshSQLFields);
        });
    });
});
