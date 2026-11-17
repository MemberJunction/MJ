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
import { Assert } from './test-runner';

/**
 * A single SQL statement captured by {@link ProviderCallProfiler} during a profiled block.
 */
export interface PerfSqlCaptureEntry {
    Sql: string;
    Kind: 'single' | 'batch';
    DurationMs: number;
    TimestampMs: number;
}

/**
 * Aggregated database provider call and SQL statement metrics captured by {@link ProviderCallProfiler}.
 */
export interface PerfCallMetrics {
    SqlExecutions: number;
    SqlBatches: number;
    TotalSqlStatements: number;
    CountOnlyQueries: number;
    RunViewCalls: number;
    RunViewsBatchCalls: number;
    SaveCalls: number;
    DeleteCalls: number;
    DurationMs: number;
    CapturedStatements: ReadonlyArray<PerfSqlCaptureEntry>;
}

/**
 * Upper-bound call and SQL statement budgets enforced by {@link ProviderCallProfiler.AssertBudget}.
 */
export interface PerfCallBudget {
    MaxSqlExecutions?: number;
    MaxTotalSqlStatements?: number;
    MaxCountOnlyQueries?: number;
    MaxRunViewCalls?: number;
    MaxRunViewsBatchCalls?: number;
    MaxSaveCalls?: number;
    MaxDeleteCalls?: number;
    MaxDurationMs?: number;
}

type ExecuteSQLFn = <T = Record<string, unknown>>(
    query: string,
    parameters?: unknown[],
    options?: ExecuteSQLOptions,
    contextUser?: UserInfo
) => Promise<Array<T>>;

type ExecuteSQLBatchFn = (
    queries: string[],
    parameters?: unknown[][],
    options?: ExecuteSQLBatchOptions,
    contextUser?: UserInfo
) => Promise<Record<string, unknown>[][]>;

type RunViewFn = <T = Record<string, unknown>>(
    params: RunViewParams,
    contextUser?: UserInfo
) => Promise<RunViewResult<T>>;

type RunViewsFn = <T = Record<string, unknown>>(
    params: RunViewParams[],
    contextUser?: UserInfo
) => Promise<RunViewResult<T>[]>;

type SaveFn = (
    entity: BaseEntity,
    user: UserInfo,
    options: EntitySaveOptions
) => Promise<Record<string, unknown>>;

type DeleteFn = (
    entity: BaseEntity,
    options: EntityDeleteOptions,
    user: UserInfo
) => Promise<boolean>;

type ProfiledProvider = DatabaseProviderBase & {
    ExecuteSQLBatch?: ExecuteSQLBatchFn;
};

interface OriginalProviderMethods {
    ExecuteSQL: DatabaseProviderBase['ExecuteSQL'];
    HadOwnExecuteSQL: boolean;
    ExecuteSQLBatch?: ExecuteSQLBatchFn;
    HadOwnExecuteSQLBatch: boolean;
    RunView: DatabaseProviderBase['RunView'];
    HadOwnRunView: boolean;
    RunViews: DatabaseProviderBase['RunViews'];
    HadOwnRunViews: boolean;
    Save: DatabaseProviderBase['Save'];
    HadOwnSave: boolean;
    Delete: DeleteFn;
    HadOwnDelete: boolean;
}

const COUNT_ONLY_SQL_REGEX = /SELECT\s+COUNT\(\*\)/i;

/**
 * Non-invasive profiler that wraps a {@link DatabaseProviderBase} instance to count
 * SQL executions, SQL batches, `SELECT COUNT(*)` queries, `RunView`/`RunViews`, `Save`,
 * and `Delete` calls without altering provider behavior.
 */
export class ProviderCallProfiler {
    private readonly provider: ProfiledProvider;
    private originals: OriginalProviderMethods | null = null;
    private batchDepth = 0;
    private startTimeMs = performance.now();

    private sqlExecutions = 0;
    private sqlBatches = 0;
    private totalSqlStatements = 0;
    private countOnlyQueries = 0;
    private runViewCalls = 0;
    private runViewsBatchCalls = 0;
    private saveCalls = 0;
    private deleteCalls = 0;
    private capturedStatements: PerfSqlCaptureEntry[] = [];

    constructor(provider: DatabaseProviderBase) {
        this.provider = provider as ProfiledProvider;
    }

    /**
     * Patches the provider's query and persistence methods to record call metrics.
     * Safe to call multiple times; subsequent calls while already attached are no-ops.
     */
    public Attach(): void {
        if (this.originals !== null) {
            return;
        }

        const rawExecuteSQL = this.provider.ExecuteSQL;
        const rawExecuteSQLBatch = this.provider.ExecuteSQLBatch;
        const rawRunView = this.provider.RunView;
        const rawRunViews = this.provider.RunViews;
        const rawSave = this.provider.Save;
        const rawDelete = this.provider.Delete;

        const origExecuteSQL = rawExecuteSQL.bind(this.provider) as ExecuteSQLFn;
        const origExecuteSQLBatch = typeof rawExecuteSQLBatch === 'function'
            ? (rawExecuteSQLBatch.bind(this.provider) as ExecuteSQLBatchFn)
            : undefined;
        const origRunView = rawRunView.bind(this.provider) as RunViewFn;
        const origRunViews = rawRunViews.bind(this.provider) as RunViewsFn;
        const origSave = rawSave.bind(this.provider) as SaveFn;
        const origDelete = rawDelete.bind(this.provider) as DeleteFn;

        const hasOwn = (prop: string): boolean => Object.prototype.hasOwnProperty.call(this.provider, prop);

        this.originals = {
            ExecuteSQL: rawExecuteSQL,
            HadOwnExecuteSQL: hasOwn('ExecuteSQL'),
            ExecuteSQLBatch: rawExecuteSQLBatch,
            HadOwnExecuteSQLBatch: hasOwn('ExecuteSQLBatch'),
            RunView: rawRunView,
            HadOwnRunView: hasOwn('RunView'),
            RunViews: rawRunViews,
            HadOwnRunViews: hasOwn('RunViews'),
            Save: rawSave,
            HadOwnSave: hasOwn('Save'),
            Delete: rawDelete,
            HadOwnDelete: hasOwn('Delete'),
        };

        this.startTimeMs = performance.now();

        this.provider.ExecuteSQL = (async <T = Record<string, unknown>>(
            query: string,
            parameters?: unknown[],
            options?: ExecuteSQLOptions,
            contextUser?: UserInfo
        ): Promise<Array<T>> => {
            if (this.batchDepth > 0) {
                return origExecuteSQL<T>(query, parameters, options, contextUser);
            }
            const t0 = performance.now();
            try {
                return await origExecuteSQL<T>(query, parameters, options, contextUser);
            } finally {
                const durationMs = Number((performance.now() - t0).toFixed(2));
                this.sqlExecutions++;
                this.totalSqlStatements++;
                if (COUNT_ONLY_SQL_REGEX.test(query)) {
                    this.countOnlyQueries++;
                }
                this.capturedStatements.push({
                    Sql: query,
                    Kind: 'single',
                    DurationMs: durationMs,
                    TimestampMs: Date.now(),
                });
            }
        }) as DatabaseProviderBase['ExecuteSQL'];

        if (origExecuteSQLBatch) {
            this.provider.ExecuteSQLBatch = async (
                queries: string[],
                parameters?: unknown[][],
                options?: ExecuteSQLBatchOptions,
                contextUser?: UserInfo
            ): Promise<Record<string, unknown>[][]> => {
                const t0 = performance.now();
                this.batchDepth++;
                try {
                    return await origExecuteSQLBatch(queries, parameters, options, contextUser);
                } finally {
                    this.batchDepth--;
                    const durationMs = Number((performance.now() - t0).toFixed(2));
                    const timestampMs = Date.now();
                    this.sqlBatches++;
                    this.totalSqlStatements += queries.length;
                    for (const query of queries) {
                        if (COUNT_ONLY_SQL_REGEX.test(query)) {
                            this.countOnlyQueries++;
                        }
                        this.capturedStatements.push({
                            Sql: query,
                            Kind: 'batch',
                            DurationMs: durationMs,
                            TimestampMs: timestampMs,
                        });
                    }
                }
            };
        }

        this.provider.RunView = (async <T = Record<string, unknown>>(
            params: RunViewParams,
            contextUser?: UserInfo
        ): Promise<RunViewResult<T>> => {
            this.runViewCalls++;
            return origRunView<T>(params, contextUser);
        }) as DatabaseProviderBase['RunView'];

        this.provider.RunViews = (async <T = Record<string, unknown>>(
            params: RunViewParams[],
            contextUser?: UserInfo
        ): Promise<RunViewResult<T>[]> => {
            this.runViewsBatchCalls++;
            return origRunViews<T>(params, contextUser);
        }) as DatabaseProviderBase['RunViews'];

        this.provider.Save = (async (
            entity: BaseEntity,
            user: UserInfo,
            options: EntitySaveOptions
        ): Promise<Record<string, unknown>> => {
            this.saveCalls++;
            return origSave(entity, user, options);
        }) as DatabaseProviderBase['Save'];

        this.provider.Delete = async (
            entity: BaseEntity,
            options: EntityDeleteOptions,
            user: UserInfo
        ): Promise<boolean> => {
            this.deleteCalls++;
            return origDelete(entity, options, user);
        };
    }

    /**
     * Restores the original methods on the wrapped provider. Safe to call when not attached.
     */
    public Detach(): void {
        if (this.originals === null) {
            return;
        }
        const orig = this.originals;
        this.originals = null;
        this.batchDepth = 0;

        if (orig.HadOwnExecuteSQL) {
            this.provider.ExecuteSQL = orig.ExecuteSQL;
        } else {
            delete (this.provider as Partial<ProfiledProvider>).ExecuteSQL;
        }
        if (orig.ExecuteSQLBatch) {
            if (orig.HadOwnExecuteSQLBatch) {
                this.provider.ExecuteSQLBatch = orig.ExecuteSQLBatch;
            } else {
                delete this.provider.ExecuteSQLBatch;
            }
        }
        if (orig.HadOwnRunView) {
            this.provider.RunView = orig.RunView;
        } else {
            delete (this.provider as Partial<ProfiledProvider>).RunView;
        }
        if (orig.HadOwnRunViews) {
            this.provider.RunViews = orig.RunViews;
        } else {
            delete (this.provider as Partial<ProfiledProvider>).RunViews;
        }
        if (orig.HadOwnSave) {
            this.provider.Save = orig.Save;
        } else {
            delete (this.provider as Partial<ProfiledProvider>).Save;
        }
        if (orig.HadOwnDelete) {
            this.provider.Delete = orig.Delete;
        } else {
            delete (this.provider as Partial<ProfiledProvider>).Delete;
        }
    }

    /**
     * Resets all captured counters and statements and restarts the elapsed timer.
     */
    public Reset(): void {
        this.sqlExecutions = 0;
        this.sqlBatches = 0;
        this.totalSqlStatements = 0;
        this.countOnlyQueries = 0;
        this.runViewCalls = 0;
        this.runViewsBatchCalls = 0;
        this.saveCalls = 0;
        this.deleteCalls = 0;
        this.capturedStatements = [];
        this.startTimeMs = performance.now();
    }

    /**
     * Returns an immutable snapshot of the metrics captured since the last {@link Reset} or {@link Attach}.
     */
    public Snapshot(): PerfCallMetrics {
        return {
            SqlExecutions: this.sqlExecutions,
            SqlBatches: this.sqlBatches,
            TotalSqlStatements: this.totalSqlStatements,
            CountOnlyQueries: this.countOnlyQueries,
            RunViewCalls: this.runViewCalls,
            RunViewsBatchCalls: this.runViewsBatchCalls,
            SaveCalls: this.saveCalls,
            DeleteCalls: this.deleteCalls,
            DurationMs: Number(Math.max(0, performance.now() - this.startTimeMs).toFixed(2)),
            CapturedStatements: [...this.capturedStatements],
        };
    }

    /**
     * Attaches the profiler, resets counters, executes `work`, captures a {@link Snapshot},
     * and always restores the provider's original methods in a `finally` block.
     */
    public async Profile<T>(work: () => Promise<T>): Promise<{ Result: T; Metrics: PerfCallMetrics }> {
        this.Attach();
        this.Reset();
        try {
            const result = await work();
            const metrics = this.Snapshot();
            return { Result: result, Metrics: metrics };
        } finally {
            this.Detach();
        }
    }

    /**
     * Asserts that `metrics` satisfies every defined upper bound in `budget`.
     */
    public AssertBudget(metrics: PerfCallMetrics, budget: PerfCallBudget, label: string): void {
        ProviderCallProfiler.AssertBudget(metrics, budget, label);
    }

    /**
     * Asserts that `metrics` satisfies every defined upper bound in `budget`.
     */
    public static AssertBudget(metrics: PerfCallMetrics, budget: PerfCallBudget, label: string): void {
        if (budget.MaxSqlExecutions !== undefined) {
            Assert(
                metrics.SqlExecutions <= budget.MaxSqlExecutions,
                `${label}: SqlExecutions (${metrics.SqlExecutions}) exceeded budget (${budget.MaxSqlExecutions})`
            );
        }
        if (budget.MaxTotalSqlStatements !== undefined) {
            Assert(
                metrics.TotalSqlStatements <= budget.MaxTotalSqlStatements,
                `${label}: TotalSqlStatements (${metrics.TotalSqlStatements}) exceeded budget (${budget.MaxTotalSqlStatements})`
            );
        }
        if (budget.MaxCountOnlyQueries !== undefined) {
            Assert(
                metrics.CountOnlyQueries <= budget.MaxCountOnlyQueries,
                `${label}: CountOnlyQueries (${metrics.CountOnlyQueries}) exceeded budget (${budget.MaxCountOnlyQueries})`
            );
        }
        if (budget.MaxRunViewCalls !== undefined) {
            Assert(
                metrics.RunViewCalls <= budget.MaxRunViewCalls,
                `${label}: RunViewCalls (${metrics.RunViewCalls}) exceeded budget (${budget.MaxRunViewCalls})`
            );
        }
        if (budget.MaxRunViewsBatchCalls !== undefined) {
            Assert(
                metrics.RunViewsBatchCalls <= budget.MaxRunViewsBatchCalls,
                `${label}: RunViewsBatchCalls (${metrics.RunViewsBatchCalls}) exceeded budget (${budget.MaxRunViewsBatchCalls})`
            );
        }
        if (budget.MaxSaveCalls !== undefined) {
            Assert(
                metrics.SaveCalls <= budget.MaxSaveCalls,
                `${label}: SaveCalls (${metrics.SaveCalls}) exceeded budget (${budget.MaxSaveCalls})`
            );
        }
        if (budget.MaxDeleteCalls !== undefined) {
            Assert(
                metrics.DeleteCalls <= budget.MaxDeleteCalls,
                `${label}: DeleteCalls (${metrics.DeleteCalls}) exceeded budget (${budget.MaxDeleteCalls})`
            );
        }
        if (budget.MaxDurationMs !== undefined) {
            Assert(
                metrics.DurationMs <= budget.MaxDurationMs,
                `${label}: DurationMs (${metrics.DurationMs}ms) exceeded budget (${budget.MaxDurationMs}ms)`
            );
        }
    }
}
