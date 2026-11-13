import { describe, it, expect } from 'vitest';
import type {
    BaseEntity,
    DatabaseProviderBase,
    EntityDeleteOptions,
    EntitySaveOptions,
    ExecuteSQLOptions,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import type { ExecuteSQLBatchOptions } from '@memberjunction/generic-database-provider';
import { ProviderCallProfiler } from '../perf-profiler';

interface MockProviderSurface {
    ExecuteSQL: <T = Record<string, unknown>>(
        query: string,
        parameters?: unknown[],
        options?: ExecuteSQLOptions,
        contextUser?: UserInfo
    ) => Promise<Array<T>>;
    ExecuteSQLBatch: (
        queries: string[],
        parameters?: unknown[][],
        options?: ExecuteSQLBatchOptions,
        contextUser?: UserInfo
    ) => Promise<Record<string, unknown>[][]>;
    RunView: <T = Record<string, unknown>>(params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult<T>>;
    RunViews: <T = Record<string, unknown>>(params: RunViewParams[], contextUser?: UserInfo) => Promise<RunViewResult<T>[]>;
    Save: (entity: BaseEntity, user: UserInfo, options: EntitySaveOptions) => Promise<Record<string, unknown>>;
    Delete: (entity: BaseEntity, options: EntityDeleteOptions, user: UserInfo) => Promise<boolean>;
}

function createMockProvider(delegateBatchToExecuteSQL = false): MockProviderSurface {
    const provider: MockProviderSurface = {
        ExecuteSQL: async <T = Record<string, unknown>>(): Promise<Array<T>> => [],
        ExecuteSQLBatch: async (queries: string[]): Promise<Record<string, unknown>[][]> => {
            if (delegateBatchToExecuteSQL) {
                return Promise.all(queries.map((q) => provider.ExecuteSQL<Record<string, unknown>>(q)));
            }
            return queries.map(() => []);
        },
        RunView: async <T = Record<string, unknown>>(): Promise<RunViewResult<T>> =>
            ({ Success: true, Results: [], TotalRowCount: 0 } as unknown as RunViewResult<T>),
        RunViews: async <T = Record<string, unknown>>(params: RunViewParams[]): Promise<RunViewResult<T>[]> =>
            params.map(() => ({ Success: true, Results: [], TotalRowCount: 0 } as unknown as RunViewResult<T>)),
        Save: async (): Promise<Record<string, unknown>> => ({ ID: '1' }),
        Delete: async (): Promise<boolean> => true,
    };
    return provider;
}

describe('ProviderCallProfiler', () => {
    it('counts SQL executions, batches, COUNT(*) queries, RunView, RunViews, Save, and Delete', async () => {
        const mock = createMockProvider(false);
        const profiler = new ProviderCallProfiler(mock as unknown as DatabaseProviderBase);

        const { Result, Metrics } = await profiler.Profile(async () => {
            await mock.ExecuteSQL('SELECT ID, Name FROM vwUsers');
            await mock.ExecuteSQL('select   count(*) as Total from vwUsers');
            await mock.ExecuteSQLBatch(['SELECT 1', 'SELECT COUNT(*) FROM vwActions']);
            await mock.RunView({ EntityName: 'MJ: Users' });
            await mock.RunViews([{ EntityName: 'MJ: Users' }, { EntityName: 'MJ: Roles' }]);
            await mock.Save({} as BaseEntity, {} as UserInfo, {} as EntitySaveOptions);
            await mock.Delete({} as BaseEntity, {} as EntityDeleteOptions, {} as UserInfo);
            return 'ok';
        });

        expect(Result).toBe('ok');
        expect(Metrics.SqlExecutions).toBe(2);
        expect(Metrics.SqlBatches).toBe(1);
        expect(Metrics.TotalSqlStatements).toBe(4);
        expect(Metrics.CountOnlyQueries).toBe(2);
        expect(Metrics.RunViewCalls).toBe(1);
        expect(Metrics.RunViewsBatchCalls).toBe(1);
        expect(Metrics.SaveCalls).toBe(1);
        expect(Metrics.DeleteCalls).toBe(1);
        expect(Metrics.DurationMs).toBeGreaterThanOrEqual(0);
        expect(Metrics.CapturedStatements).toHaveLength(4);
        expect(Metrics.CapturedStatements[0].Kind).toBe('single');
        expect(Metrics.CapturedStatements[2].Kind).toBe('batch');
    });

    it('does not double-count ExecuteSQL when ExecuteSQLBatch delegates to ExecuteSQL', async () => {
        const mock = createMockProvider(true);
        const profiler = new ProviderCallProfiler(mock as unknown as DatabaseProviderBase);

        const { Metrics } = await profiler.Profile(async () => {
            await mock.ExecuteSQLBatch(['SELECT 1', 'SELECT COUNT(*) FROM vwActions']);
        });

        expect(Metrics.SqlBatches).toBe(1);
        expect(Metrics.SqlExecutions).toBe(0);
        expect(Metrics.TotalSqlStatements).toBe(2);
        expect(Metrics.CountOnlyQueries).toBe(1);
        expect(Metrics.CapturedStatements).toHaveLength(2);
    });

    it('always restores original provider methods in finally even when work throws', async () => {
        const mock = createMockProvider(false);
        const origExec = mock.ExecuteSQL;
        const origBatch = mock.ExecuteSQLBatch;
        const origRunView = mock.RunView;
        const origSave = mock.Save;
        const origDelete = mock.Delete;

        const profiler = new ProviderCallProfiler(mock as unknown as DatabaseProviderBase);

        await expect(
            profiler.Profile(async () => {
                await mock.ExecuteSQL('SELECT 1');
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        expect(mock.ExecuteSQL).toBe(origExec);
        expect(mock.ExecuteSQLBatch).toBe(origBatch);
        expect(mock.RunView).toBe(origRunView);
        expect(mock.Save).toBe(origSave);
        expect(mock.Delete).toBe(origDelete);
    });

    it('supports Attach, Reset, Snapshot defensive copy, and Detach lifecycle', async () => {
        const mock = createMockProvider(false);
        const profiler = new ProviderCallProfiler(mock as unknown as DatabaseProviderBase);

        profiler.Attach();
        await mock.ExecuteSQL('SELECT 1');
        const snap1 = profiler.Snapshot();
        expect(snap1.SqlExecutions).toBe(1);
        expect(snap1.CapturedStatements).toHaveLength(1);

        profiler.Reset();
        await mock.ExecuteSQL('SELECT 2');
        await mock.ExecuteSQL('SELECT 3');
        const snap2 = profiler.Snapshot();
        expect(snap2.SqlExecutions).toBe(2);
        expect(snap1.CapturedStatements).toHaveLength(1);

        profiler.Detach();
        await mock.ExecuteSQL('SELECT 4');
        expect(profiler.Snapshot().SqlExecutions).toBe(2);
    });

    it('enforces PerfCallBudget via instance and static AssertBudget', () => {
        const metrics = {
            SqlExecutions: 3,
            SqlBatches: 1,
            TotalSqlStatements: 5,
            CountOnlyQueries: 2,
            RunViewCalls: 4,
            RunViewsBatchCalls: 1,
            SaveCalls: 2,
            DeleteCalls: 1,
            DurationMs: 120,
            CapturedStatements: [],
        };

        const profiler = new ProviderCallProfiler(createMockProvider() as unknown as DatabaseProviderBase);
        expect(() =>
            profiler.AssertBudget(
                metrics,
                {
                    MaxSqlExecutions: 3,
                    MaxTotalSqlStatements: 5,
                    MaxCountOnlyQueries: 2,
                    MaxRunViewCalls: 4,
                    MaxRunViewsBatchCalls: 1,
                    MaxSaveCalls: 2,
                    MaxDeleteCalls: 1,
                    MaxDurationMs: 200,
                },
                'PassCase'
            )
        ).not.toThrow();

        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxSqlExecutions: 2 }, 'CaseA')).toThrow(/CaseA: SqlExecutions/);
        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxTotalSqlStatements: 4 }, 'CaseB')).toThrow(/CaseB: TotalSqlStatements/);
        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxCountOnlyQueries: 1 }, 'CaseC')).toThrow(/CaseC: CountOnlyQueries/);
        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxRunViewCalls: 3 }, 'CaseD')).toThrow(/CaseD: RunViewCalls/);
        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxRunViewsBatchCalls: 0 }, 'CaseE')).toThrow(/CaseE: RunViewsBatchCalls/);
        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxSaveCalls: 1 }, 'CaseF')).toThrow(/CaseF: SaveCalls/);
        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxDeleteCalls: 0 }, 'CaseG')).toThrow(/CaseG: DeleteCalls/);
        expect(() => ProviderCallProfiler.AssertBudget(metrics, { MaxDurationMs: 50 }, 'CaseH')).toThrow(/CaseH: DurationMs/);
    });
});
