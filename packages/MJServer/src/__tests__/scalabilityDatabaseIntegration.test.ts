import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import sql from 'mssql';
import { RunViewParams, RunViewResult, SetProvider, UserInfo } from '@memberjunction/core';
import { GenericDatabaseProvider, UserCache } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import {
    CacheInvalidationBroadcastManager,
    SequencedRoleBucketBroadcastProvider,
} from '../broadcast/index.js';

const IT_DB_NAME = process.env.MJ_IT_DB;

describe.skipIf(!IT_DB_NAME)('MJServer Scalability Architecture — Live SQL Server Integration', () => {
    let pool: sql.ConnectionPool;
    let sharedProvider: SQLServerDataProvider;
    let sysUser: UserInfo;

    beforeAll(async () => {
        pool = new sql.ConnectionPool({
            server: process.env.MJ_IT_HOST || 'localhost',
            port: parseInt(process.env.MJ_IT_PORT || '1433', 10),
            database: IT_DB_NAME,
            user: process.env.MJ_IT_USER || 'sa',
            password: process.env.MJ_IT_PASSWORD || 'GHWUc7QKZNT8GQiqnJHdEPonPcukY2WA',
            options: {
                encrypt: false,
                trustServerCertificate: true,
            },
        });
        await pool.connect();

        sharedProvider = new SQLServerDataProvider();
        const config = new SQLServerProviderConfigData(pool, '__mj', 0);
        await sharedProvider.Config(config);
        SetProvider(sharedProvider);
        await UserCache.Instance.Refresh(sharedProvider, 0);

        const foundUser =
            UserCache.Instance.GetSystemUser() ||
            UserCache.Instance.Users.find((u) => u.IsActive && u.Type === 'Owner') ||
            UserCache.Instance.Users[0];
        if (!foundUser) {
            throw new Error(`No user found in ${IT_DB_NAME}`);
        }
        sysUser = foundUser;
    }, 60_000);

    afterAll(async () => {
        if (pool?.connected) {
            await pool.close();
        }
    });

    it('creates per-request SQLServerDataProvider with zero-copy prototype-delegated metadata shell and lazy transaction queues', async () => {
        const reqProvider = new SQLServerDataProvider();
        const reqConfig = new SQLServerProviderConfigData(
            pool,
            '__mj',
            0,
            undefined,
            undefined,
            false // ignoreExistingMetadata = false -> reuses shared metadata shell
        );
        await reqProvider.Config(reqConfig);

        // Verify lazy RxJS Subjects are NOT allocated on a read-only request provider
        const internal = reqProvider as unknown as {
            _sqlQueue$: unknown;
            _transactionState$: unknown;
        };

        expect(internal._sqlQueue$).toBeNull();
        expect(internal._transactionState$).toBeNull();

        // Verify zero-copy prototype delegation to shared metadata
        expect(Object.getPrototypeOf(reqProvider.AllMetadata)).toBe(sharedProvider.AllMetadata);
        expect(reqProvider.Entities.length).toBeGreaterThan(50);
        expect(reqProvider.Entities).toBe(sharedProvider.Entities);
    });

    it('coalesces 10 concurrent identical InternalRunView calls against SQL Server into a single SQL execution and isolates result mutations', async () => {
        // Warm up the view column order cache for vwEntities (must return >=1 row so sortViewRowKeys caches sys.columns)
        await sharedProvider.RunView(
            {
                EntityName: 'MJ: Entities',
                ExtraFilter: "Name = 'MJ: Entities'",
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            sysUser
        );

        const executeSpy = vi.spyOn(sharedProvider, 'ExecuteSQL');
        const internalRunner = sharedProvider as unknown as {
            InternalRunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;
        };

        try {
            const concurrentCount = 10;
            const promises = Array.from({ length: concurrentCount }, () =>
                internalRunner.InternalRunView<Record<string, unknown>>(
                    {
                        EntityName: 'MJ: Entities',
                        ExtraFilter: "SchemaName = '__mj' AND Name LIKE 'MJ: %'",
                        OrderBy: 'Name ASC',
                        IgnoreMaxRows: true,
                        ResultType: 'simple',
                    },
                    sysUser
                )
            );

            const results = await Promise.all(promises);

            // Only 1 physical SQL execution should have been issued for the 10 identical concurrent views
            expect(executeSpy).toHaveBeenCalledTimes(1);

            for (const res of results) {
                expect(res.Success).toBe(true);
                expect(res.Results.length).toBeGreaterThan(0);
            }

            // Mutating caller 0's result array or row object must not affect caller 1's result
            const originalName = results[1].Results[0].Name;
            const originalLength = results[1].Results.length;
            results[0].Results[0].Name = 'MUTATED_IN_CALLER_0';
            results[0].Results.pop();

            expect(results[1].Results[0].Name).toBe(originalName);
            expect(results[0].Results.length).toBe(originalLength - 1);
            expect(results[1].Results.length).toBe(originalLength);
        } finally {
            executeSpy.mockRestore();
        }
    });

    it('bounds concurrent SQL executions in RunViews to MaxConcurrentViewsPerBatch', async () => {
        let activeCount = 0;
        let maxObservedConcurrency = 0;

        const originalExecuteSQL = sharedProvider.ExecuteSQL.bind(sharedProvider);
        const executeSpy = vi.spyOn(sharedProvider, 'ExecuteSQL').mockImplementation(async (query, params, options, contextUser) => {
            activeCount++;
            if (activeCount > maxObservedConcurrency) {
                maxObservedConcurrency = activeCount;
            }
            try {
                return await originalExecuteSQL(query, params, options, contextUser);
            } finally {
                activeCount--;
            }
        });

        try {
            const batchParams = Array.from({ length: 16 }, (_, idx) => ({
                EntityName: 'MJ: Entities',
                ExtraFilter: `SchemaName = '__mj' AND UserViewMaxRows IS NULL AND ${idx} = ${idx}`,
                IgnoreMaxRows: true,
                ResultType: 'simple' as const,
            }));

            const batchResults = await sharedProvider.RunViews(batchParams, sysUser);
            expect(batchResults).toHaveLength(16);
            for (const r of batchResults) {
                expect(r.Success).toBe(true);
            }
            expect(maxObservedConcurrency).toBeLessThanOrEqual(GenericDatabaseProvider.MaxConcurrentViewsPerBatch);
            expect(maxObservedConcurrency).toBeGreaterThan(1);
        } finally {
            executeSpy.mockRestore();
        }
    });

    it('sequences and shapes cache invalidation broadcasts against live entity metadata and replays delta catch-up', async () => {
        const provider = CacheInvalidationBroadcastManager.Instance.Configure({
            provider: 'SequencedRoleBucket',
            ringBufferSize: 500,
        }) as SequencedRoleBucketBroadcastProvider;
        expect(provider).toBeInstanceOf(SequencedRoleBucketBroadcastProvider);

        const baseSeq = provider.CurrentSequence;
        const entityInfo = sharedProvider.Entities.find((e) => e.Name === 'MJ: Entities');
        expect(entityInfo).toBeDefined();

        const published = provider.RecordInvalidation({
            entityName: 'MJ: Entities',
            primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: entityInfo!.ID }]),
            action: 'save',
            sourceServerId: 'it-server-node-1',
            timestamp: new Date(),
            recordData: JSON.stringify({ ID: entityInfo!.ID, Name: entityInfo!.Name }),
        });

        expect(published.sequence).toBe(baseSeq + 1);
        expect(provider.CurrentSequence).toBe(baseSeq + 1);

        // Verify delta catch-up shapes payload for sysUser against real MJ: Entities metadata
        const catchUp = provider.GetChangesSince(baseSeq, sysUser);
        expect(catchUp.RequiresFullRefresh).toBe(false);
        expect(catchUp.CurrentSequence).toBe(baseSeq + 1);
        expect(catchUp.Events).toHaveLength(1);
        expect(catchUp.Events[0].EntityName).toBe('MJ: Entities');
        expect(catchUp.Events[0].Sequence).toBe(baseSeq + 1);
        expect(catchUp.Events[0].RecordData).toContain(entityInfo!.Name);
    });
});
