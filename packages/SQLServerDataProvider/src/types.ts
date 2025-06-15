/**
 * @fileoverview Type definitions for SQL Server Data Provider
 * 
 * This module contains all the types, interfaces, and configuration classes
 * used by the SQL Server Data Provider.
 * 
 * @module @memberjunction/sqlserver-dataprovider/types
 */

import { ProviderConfigDataBase } from '@memberjunction/core';

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
export class SQLServerProviderConfigData extends ProviderConfigDataBase {
  /**
   * Gets the SQL Server data source configuration
   */
  get DataSource(): any {
    return this.Data.DataSource;
  }
  
  /**
   * Gets the interval in seconds for checking metadata refresh
   */
  get CheckRefreshIntervalSeconds(): number {
    return this.Data.CheckRefreshIntervalSeconds;
  }

  constructor(
    dataSource: any,
    MJCoreSchemaName?: string,
    checkRefreshIntervalSeconds: number = 0 /*default to disabling auto refresh */,
    includeSchemas?: string[],
    excludeSchemas?: string[],
  ) {
    super(
      {
        DataSource: dataSource,
        CheckRefreshIntervalSeconds: checkRefreshIntervalSeconds,
      },
      MJCoreSchemaName,
      includeSchemas,
      excludeSchemas,
    );
  }
}

/**
 * Configuration options for SQL logging sessions
 */
export interface SqlLoggingOptions {
  /** Whether to format output as a migration file with schema placeholders */
  formatAsMigration?: boolean;
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