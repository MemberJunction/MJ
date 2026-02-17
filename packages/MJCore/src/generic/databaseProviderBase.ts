import { ProviderBase } from "./providerBase";
import { UserInfo } from "./securityInfo";

// Re-export PlatformSQL types from their canonical location for backward compatibility
export { DatabasePlatform, PlatformSQL, IsPlatformSQL } from "./platformSQL";
import { DatabasePlatform, PlatformSQL } from "./platformSQL";

/**
 * This class is a generic server-side provider class to abstract database operations
 * on any database system and therefore be usable by server-side components that need to
 * do database operations but do not want close coupling with a specific database provider
 * like @see @memberjunction/sqlserver-dataprovider
 */
export abstract class DatabaseProviderBase extends ProviderBase {
    /**
     * Executes a SQL query with optional parameters and options.
     * @param query
     * @param parameters
     * @param options
     * @param contextUser
     * @param T - The type of the result set
     * @returns A promise that resolves to an array of results of type T
     */
    abstract ExecuteSQL<T>(query: string, parameters?: unknown[], options?: ExecuteSQLOptions, contextUser?: UserInfo): Promise<Array<T>>

    /**
     * Begins a transaction for the current database connection.
     */
    abstract BeginTransaction(): Promise<void>;

    /**
     * Commits the current transaction.
     */
    abstract CommitTransaction(): Promise<void>;

    /**
     * Rolls back the current transaction.
     */
    abstract RollbackTransaction(): Promise<void>;

    /**
     * Returns the database platform key for this provider.
     * Override in subclasses. Defaults to 'sqlserver' for backward compatibility.
     * Inherited from ProviderBase; redeclared here for DatabaseProviderBase consumers.
     */
    override get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }
}

/**
 * Configuration options for SQL execution with logging support
 */
export interface ExecuteSQLOptions {
  /** Optional description for this SQL operation, used by logging, if logging is supported by the underlying provider */
  description?: string;
  /** If true, this statement will not be logged to any logging session */
  ignoreLogging?: boolean;
  /** Whether this is a data mutation operation (INSERT/UPDATE/DELETE or SP call that results in any data change) */
  isMutation?: boolean;
  /** Simple SQL fallback for loggers to emit logging of a simpler SQL statement that doesn't have extra functionality that isn't important for migrations or other logging purposes. */
  simpleSQLFallback?: string;
}
