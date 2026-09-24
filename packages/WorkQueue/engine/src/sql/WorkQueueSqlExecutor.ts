import type { EntityTransactionScope, ExecuteSQLOptions, UserInfo } from '@memberjunction/core';
import type { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

/** A value bound to a SQL placeholder. */
export type SqlParam = string | number | boolean | Date | null;

export interface SqlStatement {
    SQL: string;
    Params: SqlParam[];
}

/** The slice of DatabaseProviderBase the work queue needs. DatabaseProviderBase satisfies it structurally. */
export interface WorkQueueSqlExecutor {
    readonly PlatformKey: DatabasePlatform;
    readonly MJCoreSchemaName: string;
    readonly Dialect: SQLDialect;
    QuoteIdentifier(name: string): string;
    BuildParameterPlaceholder(index: number): string;
    ExecuteSQL<T>(sql: string, parameters?: SqlParam[], options?: ExecuteSQLOptions, contextUser?: UserInfo): Promise<T[]>;
}

/** An executor whose statements can join a provider-arbitrated transaction. */
export interface WorkQueueTransactionalExecutor extends WorkQueueSqlExecutor {
    BeginEntityTransaction(): Promise<EntityTransactionScope>;
}

/** An executor with its own transaction stack over a shared pool; must be released after use. */
export interface WorkQueueIndependentExecutor extends WorkQueueTransactionalExecutor {
    ReleaseIndependentInstance(): Promise<void>;
}

/** A long-lived executor that can mint independent executors for isolated transactions. */
export interface WorkQueueExecutorSource extends WorkQueueTransactionalExecutor {
    CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor>;
}

/** What a statement builder needs: quoting, schema and placeholders — never execution. */
export type SqlBuilderContext = Pick<WorkQueueSqlExecutor, 'MJCoreSchemaName' | 'QuoteIdentifier' | 'BuildParameterPlaceholder'>;

export function IsWorkQueueTransactionalExecutor(value: object | null | undefined): value is WorkQueueTransactionalExecutor {
    return value != null
        && 'ExecuteSQL' in value && typeof value.ExecuteSQL === 'function'
        && 'BeginEntityTransaction' in value && typeof value.BeginEntityTransaction === 'function'
        && 'BuildParameterPlaceholder' in value && typeof value.BuildParameterPlaceholder === 'function'
        && 'QuoteIdentifier' in value && typeof value.QuoteIdentifier === 'function'
        && 'Dialect' in value && value.Dialect != null
        && 'MJCoreSchemaName' in value && typeof value.MJCoreSchemaName === 'string';
}

export function IsWorkQueueExecutorSource(value: object | null | undefined): value is WorkQueueExecutorSource {
    return IsWorkQueueTransactionalExecutor(value)
        && 'CreateIndependentInstance' in value && typeof value.CreateIndependentInstance === 'function';
}
