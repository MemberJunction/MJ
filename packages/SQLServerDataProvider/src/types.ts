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
  pool: sql.ConnectionPool;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Optional transaction if one is active */
  transaction?: sql.Transaction | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Function to log SQL statements */
  logSqlStatement?: (  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    query: string,
    parameters?: any,
    description?: string,
    ignoreLogging?: boolean,
    isMutation?: boolean,
    simpleSQLFallback?: string,
    contextUser?: UserInfo
  ) => Promise<void>;
  /** Function to clear transaction reference on EREQINPROG */
  clearTransaction?: () => void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Options for internal SQL execution
 */
export interface InternalSQLOptions {
  /** Optional description for this SQL operation */
  description?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** If true, this statement will not be logged */
  ignoreLogging?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Whether this is a data mutation operation */
  isMutation?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Simple SQL fallback for loggers */
  simpleSQLFallback?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** User context for logging */
  contextUser?: UserInfo;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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