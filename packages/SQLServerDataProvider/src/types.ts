/**
 * @fileoverview Type definitions for SQL Server Data Provider
 * 
 * This module contains all the types, interfaces, and configuration classes
 * used by the SQL Server Data Provider.
 * 
 * @module @memberjunction/sqlserver-dataprovider/types
 */

import { ProviderConfigDataBase, UserInfo } from '@memberjunction/core';
import sql from 'mssql';

/**
 * Configuration options for SQL execution with logging support
 */
export interface ExecuteSQLOptions {
  /** Optional description for this SQL operation */
  description?: string;
  /** If true, this statement will not be logged to any logging session */
  ignoreLogging?: boolean;
  /** Whether this is a data mutation operation (INSERT/UPDATE/DELETE) */
  isMutation?: boolean;
  /** Simple SQL fallback for loggers with logRecordChangeMetadata=false (only for Save/Delete operations) */
  simpleSQLFallback?: string;
  /**
   * Optional connection source to use instead of the default pool.
   * Used by IS-A chain orchestration to execute SPs on a shared transaction.
   * Should be a sql.Transaction or sql.ConnectionPool instance.
   */
  connectionSource?: sql.ConnectionPool | sql.Transaction;
}

/**
 * Context for SQL execution containing all necessary resources
 */
export interface SQLExecutionContext {
  /** The connection pool to use for queries */
  pool: sql.ConnectionPool;
  /** Optional transaction if one is active */
  transaction?: sql.Transaction | null;
  /** Function to log SQL statements */
  logSqlStatement?: (
    query: string,
    parameters?: any,
    description?: string,
    ignoreLogging?: boolean,
    isMutation?: boolean,
    simpleSQLFallback?: string,
    contextUser?: UserInfo
  ) => Promise<void>;
  /** Function to clear transaction reference on EREQINPROG */
  clearTransaction?: () => void;
}

/**
 * Options for internal SQL execution
 */
export interface InternalSQLOptions {
  /** Optional description for this SQL operation */
  description?: string;
  /** If true, this statement will not be logged */
  ignoreLogging?: boolean;
  /** Whether this is a data mutation operation */
  isMutation?: boolean;
  /** Simple SQL fallback for loggers */
  simpleSQLFallback?: string;
  /** User context for logging */
  contextUser?: UserInfo;
}

/**
 * Configuration options for batch SQL execution
 */
export interface ExecuteSQLBatchOptions {
  /** Optional description for this batch operation */
  description?: string;
  /** If true, this batch will not be logged to any logging session */
  ignoreLogging?: boolean;
  /** Whether this batch contains data mutation operations */
  isMutation?: boolean;
}

/**
 * Configuration data specific to SQL Server provider
 */
export class SQLServerProviderConfigData extends ProviderConfigDataBase<SQLServerProviderConfigOptions> {
  /**
   * Gets the SQL Server connection pool configuration
   */
  get ConnectionPool(): sql.ConnectionPool {
    return this.Data.ConnectionPool;
  }
  
  /**
   * Gets the interval in seconds for checking metadata refresh
   */
  get CheckRefreshIntervalSeconds(): number {
    return this.Data.CheckRefreshIntervalSeconds;
  }

  constructor(
    connectionPool: sql.ConnectionPool,
    MJCoreSchemaName?: string,
    checkRefreshIntervalSeconds: number = 0 /*default to disabling auto refresh */,
    includeSchemas?: string[],
    excludeSchemas?: string[],
    ignoreExistingMetadata: boolean = true
  ) {
    super(
      {
        ConnectionPool: connectionPool,
        CheckRefreshIntervalSeconds: checkRefreshIntervalSeconds,
      },
      MJCoreSchemaName,
      includeSchemas,
      excludeSchemas,
      ignoreExistingMetadata
    );
  }
}

export interface SQLServerProviderConfigOptions {
  ConnectionPool: sql.ConnectionPool;
  CheckRefreshIntervalSeconds: number;
}

/**
 * Configuration options for SQL logging sessions
 */
export interface SqlLoggingOptions {
  /** Whether to format output as a flyway migration file with schema placeholders */
  formatAsMigration?: boolean;

  /**
   * Optional default schema name to use for Flyway migrations for replacing schema names with 
   * the placeholder ${flyway:defaultSchema}
   */
  defaultSchemaName?: string;

  /** Optional description to include as a comment at the start of the log */
  description?: string;
  /** Which types of statements to log: 'queries' (all), 'mutations' (only data changes), 'both' (default) */
  statementTypes?: 'queries' | 'mutations' | 'both';
  /** Optional batch separator to emit after each statement (e.g., "GO" for SQL Server) */
  batchSeparator?: string;
  /** Whether to pretty print SQL statements with proper formatting */
  prettyPrint?: boolean;
  /** Whether to log record change metadata wrapper SQL (default: false). When false, only core spCreate/spUpdate/spDelete calls are logged */
  logRecordChangeMetadata?: boolean;
  /** Whether to retain log files that contain no SQL statements (default: false). When false, empty log files are automatically deleted on dispose */
  retainEmptyLogFiles?: boolean;
  /** Optional user ID to filter SQL logging - only log SQL executed by this user */
  filterByUserId?: string;
  /** Optional friendly name for this logging session (for UI display) */
  sessionName?: string;
  /** Whether to output verbose debug information to console (default: false) */
  verboseOutput?: boolean;
  /**
   * Array of patterns to filter SQL statements.
   * Supports both regex (RegExp objects) and simple wildcard patterns (strings).
   * How these patterns are applied depends on filterType.
   * 
   * String patterns support:
   * - Simple wildcards: "*AIPrompt*", "spCreate*", "*Run"
   * - Regex strings: "/spCreate.*Run/i", "/^SELECT.*FROM/i"
   * 
   * RegExp examples:
   * - /spCreateAIPromptRun/i - Match stored procedure calls
   * - /^SELECT.*FROM.*vw.*Metadata/i - Match metadata view queries
   * - /INSERT INTO EntityFieldValue/i - Match specific inserts
   */
  filterPatterns?: (string | RegExp)[];
  /**
   * Determines how filterPatterns are applied:
   * - 'exclude': If ANY pattern matches, the SQL is NOT logged (default)
   * - 'include': If ANY pattern matches, the SQL IS logged
   * 
   * Note: If filterPatterns is empty/undefined, all SQL is logged regardless of filterType.
   */
  filterType?: 'include' | 'exclude';
}

/**
 * Interface for SQL logging session with disposable pattern
 */
export interface SqlLoggingSession {
  /** Unique session ID */
  readonly id: string;
  /** File path where SQL is being logged */
  readonly filePath: string;
  /** Session start time */
  readonly startTime: Date;
  /** Number of statements logged so far */
  readonly statementCount: number;
  /** Configuration options for this session */
  readonly options: SqlLoggingOptions;
  /** Dispose method to stop logging and clean up resources */
  dispose(): Promise<void>;
}