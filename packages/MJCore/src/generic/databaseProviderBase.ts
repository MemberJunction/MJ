import { ProviderBase } from "./providerBase";
import { UserInfo } from "./securityInfo";

/**
 * Supported database platforms.
 * Extensible — add new platforms as support is implemented.
 */
export type DatabasePlatform = 'sqlserver' | 'postgresql';

/**
 * Represents a SQL fragment that may have platform-specific variants.
 * Used for ExtraFilter, OrderBy, WhereClause, and other user-provided SQL.
 *
 * Backward compatible: where a string was accepted before,
 * PlatformSQL is also accepted via union type (string | PlatformSQL).
 */
export interface PlatformSQL {
    /** The default/fallback SQL. Used if no platform-specific variant exists. */
    default: string;
    /** SQL Server specific variant */
    sqlserver?: string;
    /** PostgreSQL specific variant */
    postgresql?: string;
}

/**
 * Type guard to check if a value is a PlatformSQL object vs plain string.
 */
export function IsPlatformSQL(value: string | PlatformSQL | undefined | null): value is PlatformSQL {
    return typeof value === 'object' && value !== null && 'default' in value;
}

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
     */
    get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    /**
     * Resolves a PlatformSQL value to the appropriate SQL string for this provider's platform.
     * If the value is a plain string, it is returned as-is (backward compatible).
     * If the value is a PlatformSQL object, the platform-specific variant is used if available,
     * otherwise the default variant is used.
     */
    ResolveSQL(value: string | PlatformSQL | undefined | null): string {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        const platformVariant = value[this.PlatformKey];
        if (platformVariant != null && platformVariant.length > 0) return platformVariant;
        return value.default;
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
