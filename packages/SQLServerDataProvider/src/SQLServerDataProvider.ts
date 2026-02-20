/**
 * @fileoverview SQL Server Data Provider for MemberJunction
 * 
 * This module provides a comprehensive SQL Server implementation of the MemberJunction data provider interfaces.
 * It handles all database operations including CRUD operations, metadata management, view execution, and 
 * advanced features like SQL logging, transaction management, and record change tracking.
 * 
 * @module @memberjunction/sqlserver-dataprovider
 * @author MemberJunction Team
 * @version 2.0
 * @since 1.0
 */

/**************************************************************************************************************
 * The SQLServerDataProvider provides a data provider for the entities framework that uses SQL Server directly
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it.
 **************************************************************************************************************/

import {
  BaseEntity,
  IEntityDataProvider,
  IMetadataProvider,
  IRunViewProvider,
  RunViewResult,
  AggregateResult,
  AggregateValue,
  EntityInfo,
  EntityFieldInfo,
  ApplicationInfo,
  RunViewParams,
  EntityFieldTSType,
  ProviderType,
  UserInfo,
  RecordChange,
  ILocalStorageProvider,
  IFileSystemProvider,
  AuditLogTypeInfo,
  AuthorizationInfo,
  TransactionGroupBase,
  TransactionItem,
  EntityPermissionType,
  EntitySaveOptions,
  LogError,
  RunReportParams,
  DatasetItemFilterType,
  DatasetResultType,
  DatasetStatusEntityUpdateDateType,
  DatasetStatusResultType,
  EntityRecordNameInput,
  EntityRecordNameResult,
  IRunReportProvider,
  RunReportResult,
  StripStopWords,
  RecordDependency,
  RecordMergeRequest,
  RecordMergeResult,
  RecordMergeDetailResult,
  EntityDependency,
  RunQueryResult,
  RunQueryParams,
  PotentialDuplicateRequest,
  PotentialDuplicateResponse,
  LogStatus,
  CompositeKey,
  EntityDeleteOptions,
  EntityMergeOptions,
  BaseEntityResult,
  Metadata,
  DatasetItemResultType,
  DatabaseProviderBase,
  QueryInfo,
  QueryCategoryInfo,
  QueryCache,
  RunViewWithCacheCheckParams,
  RunViewsWithCacheCheckResponse,
  RunViewWithCacheCheckResult,
  RunQueryWithCacheCheckParams,
  RunQueriesWithCacheCheckResponse,
  RunQueryWithCacheCheckResult,
  InMemoryLocalStorageProvider,
} from '@memberjunction/core';
import { QueryParameterProcessor } from './queryParameterProcessor';
import { NodeFileSystemProvider } from './NodeFileSystemProvider';

import {
  MJAuditLogEntity,
  MJDuplicateRunEntity,
  MJEntityAIActionEntity,
  MJListEntity,
  MJQueryEntity,
  MJRecordMergeDeletionLogEntity,
  MJRecordMergeLogEntity,
  MJUserFavoriteEntity,
  QueryEngine,
  MJUserViewEntityExtended,
  ViewInfo,
} from '@memberjunction/core-entities';
import { AIEngine, EntityAIActionParams } from '@memberjunction/aiengine';
import { QueueManager } from '@memberjunction/queue';

import sql from 'mssql';
import { BehaviorSubject, Observable, Subject, concatMap, from, tap, catchError, of } from 'rxjs';
import { SQLServerTransactionGroup } from './SQLServerTransactionGroup';
import { SqlLoggingSessionImpl } from './SqlLogger.js';
import { 
  ExecuteSQLOptions, 
  ExecuteSQLBatchOptions, 
  SQLServerProviderConfigData, 
  SqlLoggingOptions, 
  SqlLoggingSession,
  SQLExecutionContext,
  InternalSQLOptions
} from './types.js';

import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import { EntityActionEngineServer } from '@memberjunction/actions';
import { ActionResult } from '@memberjunction/actions-base';
import { EncryptionEngine } from '@memberjunction/encryption';
import { v4 as uuidv4 } from 'uuid';
import { MJGlobal, SQLExpressionValidator } from '@memberjunction/global';

/**
 * Represents a single field change in the DiffObjects comparison result
 */
export type FieldChange = {
  field: string;
  oldValue: any;
  newValue: any;
};

/**
 * Core SQL execution function - handles the actual database query execution
 * This is outside the class to allow both static and instance methods to use it
 * without creating circular dependencies or forcing everything to be static
 */
async function executeSQLCore(
  query: string,
  parameters: any,
  context: SQLExecutionContext,
  options?: InternalSQLOptions
): Promise<sql.IResult<any>> {
  // Determine which connection source to use
  let connectionSource: sql.ConnectionPool | sql.Transaction;
  
  if (context.transaction) {
    // Use the transaction if provided
    // Note: We no longer test the transaction validity here because:
    // 1. It could cause race conditions with concurrent queries
    // 2. If the transaction is invalid, we'll get a proper error when trying to use it
    // 3. We should never silently fall back to the pool when a transaction is expected
    connectionSource = context.transaction;
  } else {
    connectionSource = context.pool;
  }

  // Check if the pool is connected before attempting to execute
  if (connectionSource === context.pool && !context.pool.connected) {
    const errorMessage = 'Connection pool is closed. Cannot execute SQL query.';
    const error = new Error(errorMessage);
    (error as any).code = 'POOL_CLOSED';
    throw error;
  }

  // Handle logging
  let logPromise: Promise<void>;
  if (options && !options.ignoreLogging && context.logSqlStatement) {
    logPromise = context.logSqlStatement(
      query,
      parameters,
      options.description,
      options.ignoreLogging,
      options.isMutation,
      options.simpleSQLFallback,
      options.contextUser
    );
  } else {
    logPromise = Promise.resolve();
  }

  try {
    // Create a new request object for this query
    // Note: This looks redundant but is required for TypeScript type narrowing.
    // The sql.Request constructor has overloads for ConnectionPool and Transaction,
    // but TypeScript can't resolve the overload with a union type parameter.
    let request: sql.Request;
    if (connectionSource instanceof sql.Transaction) {
      request = new sql.Request(connectionSource);
    } else {
      request = new sql.Request(connectionSource);
    }

    // Add parameters if provided
    let processedQuery = query;
    if (parameters) {
      if (Array.isArray(parameters)) {
        // Handle positional parameters (legacy TypeORM style)
        parameters.forEach((value, index) => {
          request.input(`p${index}`, value);
        });
        // Replace ? with @p0, @p1, etc. in the query
        let paramIndex = 0;
        processedQuery = query.replace(/\?/g, () => `@p${paramIndex++}`);
      } else if (typeof parameters === 'object') {
        // Handle named parameters
        for (const [key, value] of Object.entries(parameters)) {
          request.input(key, value);
        }
      }
    }

    // Execute query and logging in parallel
    const [result] = await Promise.all([
      request.query(processedQuery),
      logPromise
    ]);
    
    return result;
  } catch (error: any) {
    // Build detailed error message with query and parameters
    const errorMessage = `Error executing SQL
    Error: ${error?.message ? error.message : error}
    Query: ${query}
    Parameters: ${parameters ? JSON.stringify(parameters) : 'None'}`;

    // Throw error with detailed message - caller decides whether to log
    throw new Error(errorMessage);
  }
}


/**
 * SQL Server implementation of the MemberJunction data provider interfaces.
 * 
 * This class provides comprehensive database functionality including:
 * - CRUD operations for entities
 * - Metadata management and caching
 * - View and query execution
 * - Transaction support
 * - SQL logging capabilities
 * - Record change tracking
 * - AI integration hooks
 * 
 * @example
 * ```typescript
 * const config = new SQLServerProviderConfigData(dataSource);
 * const provider = new SQLServerDataProvider(config);
 * await provider.Config();
 * ```
 */
export class SQLServerDataProvider
  extends DatabaseProviderBase
  implements IEntityDataProvider, IMetadataProvider, IRunReportProvider
{
  private _pool: sql.ConnectionPool;
  
  // Instance transaction properties
  private _transaction: sql.Transaction;
  private _transactionDepth: number = 0;
  private _savepointCounter: number = 0;
  private _savepointStack: string[] = [];

  // Query cache instance
  private queryCache = new QueryCache();

  // Removed _transactionRequest - creating new Request objects for each query to avoid concurrency issues
  private _localStorageProvider: ILocalStorageProvider;
  private _fileSystemProvider: IFileSystemProvider;
  private _bAllowRefresh: boolean = true;
  private _recordDupeDetector: DuplicateRecordDetector;
  private _needsDatetimeOffsetAdjustment: boolean = false;
  private _datetimeOffsetTestComplete: boolean = false;
  private static _sqlLoggingSessionsKey: string = 'MJ_SQLServerDataProvider_SqlLoggingSessions';
  private get _sqlLoggingSessions(): Map<string, SqlLoggingSessionImpl> {
    const g = MJGlobal.Instance.GetGlobalObjectStore();
    if (g) {
      if (!g[SQLServerDataProvider._sqlLoggingSessionsKey]) {
        g[SQLServerDataProvider._sqlLoggingSessionsKey] = new Map<string, SqlLoggingSessionImpl>();
      }
      return g[SQLServerDataProvider._sqlLoggingSessionsKey];
    } else {
      throw new Error('No global object store available for SQL logging session');
    }
  }

  // Instance SQL execution queue for serializing transaction queries
  // Non-transactional queries bypass this queue for maximum parallelism
  private _sqlQueue$ = new Subject<{
    id: string;
    query: string;
    parameters: any;
    context: SQLExecutionContext;
    options?: InternalSQLOptions;
    resolve: (value: sql.IResult<any>) => void;
    reject: (error: any) => void;
  }>();
  
  // Subscription for the queue processor
  private _queueSubscription: any;
  
  // Transaction state management
  private _transactionState$ = new BehaviorSubject<boolean>(false);
  private _deferredTasks: Array<{ type: string; data: any; options: any; user: UserInfo }> = [];


  /**
   * Observable that emits the current transaction state (true when active, false when not)
   * External code can subscribe to this to know when transactions start and end
   * 
   * @example
   * provider.transactionState$.subscribe(isActive => {
   *   console.log('Transaction active:', isActive);
   * });
   */
  public get transactionState$(): Observable<boolean> {
    return this._transactionState$.asObservable();
  }
  
  /**
   * Gets the current transaction nesting depth
   * 0 = no transaction, 1 = first level, 2+ = nested transactions
   */
  public get transactionDepth(): number {
    // Request-specific depth should be accessed via getTransactionContext
    return this._transactionDepth;
  }
  
  /**
   * Checks if we're currently in a transaction (at any depth)
   */
  public get inTransaction(): boolean {
    return this.transactionDepth > 0;
  }
  
  /**
   * Checks if we're currently in a nested transaction (depth > 1)
   */
  public get inNestedTransaction(): boolean {
    return this.transactionDepth > 1;
  }
  
  /**
   * Gets the current savepoint names in the stack (for debugging)
   * Returns a copy to prevent external modification
   */
  public get savepointStack(): string[] {
    return [...this._savepointStack];
  }
  
  /**
   * Gets whether a transaction is currently active
   */
  public get isTransactionActive(): boolean {
    // Always return instance-level state
    // Request-specific state should be accessed via getTransactionContext
    return this._transactionState$.value;
  }

  /**
   * Gets the current configuration data for this provider instance
   */
  public get ConfigData(): SQLServerProviderConfigData {
    return <SQLServerProviderConfigData>super.ConfigData;
  }

  /**
   * Configures the SQL Server data provider with connection settings and initializes the connection pool
   * 
   * @param configData - Configuration data including connection string and options
   * @returns Promise<boolean> - True if configuration succeeded
   */
  public async Config(configData: SQLServerProviderConfigData, providerToUse?: IMetadataProvider): Promise<boolean> {
    try {
      this._pool = configData.ConnectionPool; // Now expects a ConnectionPool instead of DataSource

      // Initialize the instance queue processor
      this.initializeQueueProcessor();

      return super.Config(configData, providerToUse); // now parent class can do it's config
    } catch (e) {
      LogError(e);
      throw e;
    }
  }
  
  /**
   * Initialize the SQL queue processor for this instance
   * This ensures all queries within a transaction execute sequentially
   */
  private initializeQueueProcessor(): void {
    // Each instance gets its own queue processor, but only do this ONCE if we get this method called more than once we don't need to reinit
    // the sub, taht would cause duplicate rprocessing.
    if (!this._queueSubscription) {
      this._queueSubscription = this._sqlQueue$.pipe(
        concatMap(item => 
          from(executeSQLCore(
            item.query,
            item.parameters,
            item.context,
            item.options
          )).pipe(
            // Handle success
            tap(result => item.resolve(result)),
            // Handle errors
            catchError(error => {
              item.reject(error);
              return of(null); // Continue processing queue even on errors
            })
          )
        )
      ).subscribe();
    }
  }

  /**
   * Gets the underlying SQL Server connection pool
   * @returns The mssql ConnectionPool object
   */
  public get DatabaseConnection(): any {
    return this._pool;
  }

  /**
   * For the SQLServerDataProvider the unique instance connection string which is used to identify, uniquely, a given connection is the following format:
   * mssql://host:port/instanceName?/database
   * instanceName is only inserted if it is provided in the options
   */
  public get InstanceConnectionString(): string {
    // For mssql, we need to access the pool's internal connection options
    // Since mssql v11 doesn't expose config directly, we'll construct from what we know
    const pool = this._pool as any;
    const options = {
      type: 'mssql',
      host: pool._config?.server || 'localhost',
      port: pool._config?.port || 1433,
      instanceName: pool._config?.options?.instanceName ? '/' + pool._config.options.instanceName : '',
      database: pool._config?.database || '',
    };
    return options.type + '://' + options.host + ':' + options.port + options.instanceName + '/' + options.database;
  }

  /**
   * Gets whether metadata refresh is currently allowed
   * @internal
   */
  protected get AllowRefresh(): boolean {
    return this._bAllowRefresh;
  }

  /**
   * Gets the MemberJunction core schema name (defaults to __mj if not configured)
   */
  public get MJCoreSchemaName(): string {
    return this.ConfigData.MJCoreSchemaName;
  }

  /**************************************************************************/
  // START ---- SQL Logging Methods
  /**************************************************************************/

  /**
   * Creates a new SQL logging session that will capture all SQL operations to a file.
   * Returns a disposable session object that must be disposed to stop logging.
   *
   * @param filePath - Full path to the file where SQL statements will be logged
   * @param options - Optional configuration for the logging session
   * @returns Promise<SqlLoggingSession> - Disposable session object
   *
   * @example
   * ```typescript
   * // Basic usage
   * const session = await provider.CreateSqlLogger('./logs/metadata-sync.sql');
   * try {
   *   // Perform operations that will be logged
   *   await provider.ExecuteSQL('INSERT INTO ...');
   * } finally {
   *   await session.dispose(); // Stop logging
   * }
   *
   * // With migration formatting
   * const session = await provider.CreateSqlLogger('./migrations/changes.sql', {
   *   formatAsMigration: true,
   *   description: 'MetadataSync push operation'
   * });
   * ```
   */
  public async CreateSqlLogger(filePath: string, options?: SqlLoggingOptions): Promise<SqlLoggingSession> {
    const sessionId = uuidv4();
    const mjCoreSchema = this.ConfigData.MJCoreSchemaName;
    const session = new SqlLoggingSessionImpl(sessionId, filePath, 
      {
        defaultSchemaName: mjCoreSchema,
        ...options // if defaultSchemaName is not provided, it will use the MJCoreSchemaName, otherwise
        // the caller's defaultSchemaName will be used
      });

    // Initialize the session (create file, write header)
    await session.initialize();

    // Store in active sessions map
    this._sqlLoggingSessions.set(sessionId, session);

    // Return a proxy that handles cleanup on dispose
    return {
      id: session.id,
      filePath: session.filePath,
      startTime: session.startTime,
      get statementCount() {
        return session.statementCount;
      },
      options: session.options,
      dispose: async () => {
        await session.dispose();
        this._sqlLoggingSessions.delete(sessionId);
      },
    };
  }

  public async GetCurrentUser(): Promise<UserInfo> {
    return this.CurrentUser;
  }

  /**
   * Gets information about all active SQL logging sessions.
   * Useful for monitoring and debugging.
   *
   * @returns Array of session information objects
   */
  public GetActiveSqlLoggingSessions(): Array<{
    id: string;
    filePath: string;
    startTime: Date;
    statementCount: number;
    options: SqlLoggingOptions;
  }> {
    return Array.from(this._sqlLoggingSessions.values()).map((session) => ({
      id: session.id,
      filePath: session.filePath,
      startTime: session.startTime,
      statementCount: session.statementCount,
      options: session.options,
    }));
  }

  /**
   * Gets a specific SQL logging session by its ID.
   * Returns the session if found, or undefined if not found.
   *
   * @param sessionId - The unique identifier of the session to retrieve
   * @returns The SqlLoggingSession if found, undefined otherwise
   */
  public GetSqlLoggingSessionById(sessionId: string): SqlLoggingSession | undefined {
    return this._sqlLoggingSessions.get(sessionId);
  }

  /**
   * Disposes all active SQL logging sessions.
   * Useful for cleanup on provider shutdown.
   */
  public async DisposeAllSqlLoggingSessions(): Promise<void> {
    const disposePromises = Array.from(this._sqlLoggingSessions.values()).map((session) => session.dispose());
    await Promise.all(disposePromises);
    this._sqlLoggingSessions.clear();
  }
  
  /**
   * Dispose of this provider instance and clean up resources.
   * This should be called when the provider is no longer needed.
   */
  public async Dispose(): Promise<void> {
    // Dispose all SQL logging sessions
    await this.DisposeAllSqlLoggingSessions();
    
    // Unsubscribe from the SQL queue
    if (this._queueSubscription) {
      this._queueSubscription.unsubscribe();
      this._queueSubscription = null;
    }
    
    // Complete the queue subject
    if (this._sqlQueue$) {
      this._sqlQueue$.complete();
    }
    
    // Note: We don't close the pool here as it might be shared
    // The caller is responsible for closing the pool when appropriate
  }

  /**
   * Internal method to log SQL statement to all active logging sessions.
   * This is called automatically by ExecuteSQL methods.
   *
   * @param query - The SQL query being executed
   * @param parameters - Parameters for the query
   * @param description - Optional description for this operation
   * @param ignoreLogging - If true, this statement will not be logged
   * @param isMutation - Whether this is a data mutation operation
   * @param simpleSQLFallback - Optional simple SQL to use for loggers with logRecordChangeMetadata=false
   */
  private async _logSqlStatement(
    query: string,
    parameters?: any,
    description?: string,
    ignoreLogging: boolean = false,
    isMutation: boolean = false,
    simpleSQLFallback?: string,
    contextUser?: UserInfo,
  ): Promise<void> {
    if (ignoreLogging || this._sqlLoggingSessions.size === 0) {
      return;
    }

    // Check if any session has verbose output enabled for debug logging
    const allSessions = Array.from(this._sqlLoggingSessions.values());
    const hasVerboseSession = allSessions.some(s => s.options.verboseOutput === true);
    
    if (hasVerboseSession) {
      console.log('=== SQL LOGGING DEBUG ===');
      console.log(`Query to log: ${query.substring(0, 100)}...`);
      console.log(`Context user email: ${contextUser?.Email || 'NOT_PROVIDED'}`);
      console.log(`Active sessions count: ${this._sqlLoggingSessions.size}`);
      
      console.log(`All sessions:`, allSessions.map(s => ({
        id: s.id,
        filterByUserId: s.options.filterByUserId,
        sessionName: s.options.sessionName
      })));
    }
    
    const filteredSessions = allSessions.filter((session) => {
        // If session has user filter, only log if contextUser matches AND contextUser is provided
        if (session.options.filterByUserId) {
          if (!contextUser?.Email) {
            if (hasVerboseSession) {
              console.log(`Session ${session.id}: Has user filter but no contextUser provided - SKIPPING`);
            }
            return false; // Don't log if filtering requested but no user context provided
          }
          const matches = session.options.filterByUserId === contextUser.ID;
          if (hasVerboseSession) {
            console.log(`Session ${session.id} filter check:`, {
              filterByUserId: session.options.filterByUserId,
              contextUserEmail: contextUser.Email,
              matches: matches
            });
          }
          return matches;
        }
        // No filter means log for all users (regardless of contextUser)
        if (hasVerboseSession) {
          console.log(`Session ${session.id} has no filter - including`);
        }
        return true;
      });
    
    if (hasVerboseSession) {
      console.log(`Sessions after filtering: ${filteredSessions.length}`);
    }
    
    const logPromises = filteredSessions.map((session) => 
        session.logSqlStatement(query, parameters, description, isMutation, simpleSQLFallback)
      );

    await Promise.all(logPromises);
    
    if (hasVerboseSession) {
      console.log('=== SQL LOGGING DEBUG END ===');
    }
  }

  /**
   * Static method to log SQL statements from external sources like transaction groups
   * 
   * @param query - The SQL query being executed
   * @param parameters - Parameters for the query
   * @param description - Optional description for this operation
   * @param isMutation - Whether this is a data mutation operation
   * @param simpleSQLFallback - Optional simple SQL to use for loggers with logRecordChangeMetadata=false
   */
  public static async LogSQLStatement(
    query: string,
    parameters?: any,
    description?: string,
    isMutation: boolean = false,
    simpleSQLFallback?: string,
    contextUser?: UserInfo,
  ): Promise<void> {
    // Get the current provider instance
    const provider = Metadata.Provider as SQLServerDataProvider;
    if (provider && provider._sqlLoggingSessions.size > 0) {
      await provider._logSqlStatement(query, parameters, description, false, isMutation, simpleSQLFallback, contextUser);
    }
  }

  /**************************************************************************/
  // END ---- SQL Logging Methods
  /**************************************************************************/

  /**************************************************************************/
  // START ---- IRunReportProvider
  /**************************************************************************/
  public async RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult> {
    const ReportID = params.ReportID;
    // run the sql and return the data
    const sqlReport = `SELECT ReportSQL FROM [${this.MJCoreSchemaName}].vwReports WHERE ID =${ReportID}`;
    const reportInfo = await this.ExecuteSQL(sqlReport, undefined, undefined, contextUser);
    if (reportInfo && reportInfo.length > 0) {
      const start = new Date().getTime();
      const sql = reportInfo[0].ReportSQL;
      const result = await this.ExecuteSQL(sql, undefined, undefined, contextUser);
      const end = new Date().getTime();
      if (result)
        return {
          Success: true,
          ReportID,
          Results: result,
          RowCount: result.length,
          ExecutionTime: end - start,
          ErrorMessage: '',
        };
      else
        return {
          Success: false,
          ReportID,
          Results: [],
          RowCount: 0,
          ExecutionTime: end - start,
          ErrorMessage: 'Error running report SQL',
        };
    } else return { Success: false, ReportID, Results: [], RowCount: 0, ExecutionTime: 0, ErrorMessage: 'Report not found' };
  }
  /**************************************************************************/
  // END ---- IRunReportProvider
  /**************************************************************************/

  /**
   * Resolves a hierarchical category path (e.g., "/MJ/AI/Agents/") to a CategoryID.
   * The path is split by "/" and each segment is matched case-insensitively against
   * category names, walking down the hierarchy from root to leaf.
   * 
   * @param categoryPath The hierarchical category path (e.g., "/MJ/AI/Agents/")
   * @returns The CategoryID if the path exists, null otherwise
   */
  private resolveCategoryPath(categoryPath: string): string | null {
    if (!categoryPath) return null;
    
    // Split path and clean segments - remove empty strings from leading/trailing slashes
    const segments = categoryPath.split('/')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    if (segments.length === 0) return null;
    
    // Walk down the hierarchy to find the target category
    let currentCategory: QueryCategoryInfo | null = null;
    
    for (const segment of segments) {
      const parentId = currentCategory?.ID || null;
      currentCategory = this.QueryCategories.find(cat => 
        cat.Name.trim().toLowerCase() === segment.toLowerCase() && 
        cat.ParentID === parentId
      );
      
      if (!currentCategory) {
        return null; // Path not found
      }
    }
    
    return currentCategory.ID;
  }

  /**
   * Finds a query by ID or by Name+Category combination.
   * Supports both direct CategoryID lookup and hierarchical CategoryPath path resolution.
   * 
   * @param QueryID Unique identifier for the query
   * @param QueryName Name of the query to find
   * @param CategoryID Direct category ID for the query
   * @param CategoryPath Hierarchical category path (e.g., "/MJ/AI/Agents/") or simple category name
   * @param refreshMetadataIfNotFound Whether to refresh metadata if query is not found
   * @returns The found QueryInfo or null if not found
   */
  protected async findQuery(QueryID: string, QueryName: string, CategoryID: string, CategoryPath: string, refreshMetadataIfNotFound: boolean = false): Promise<QueryInfo | null> {
      // Use QueryEngine as the source of truth — it auto-refreshes on entity changes,
      // so we always get fresh data without needing to reload full metadata.
      const freshEntity = this.findQueryInEngine(QueryID, QueryName, CategoryID, CategoryPath);
      if (freshEntity) {
        return this.refreshQueryInfoFromEntity(freshEntity);
      }

      // If QueryEngine didn't have it, fall back to ProviderBase metadata with optional refresh.
      // This handles edge cases where QueryEngine hasn't loaded yet or hasn't picked up a brand-new record.
      const queries = this.Queries.filter(q => {
        if (QueryID) {
          return q.ID.trim().toLowerCase() === QueryID.trim().toLowerCase();
        } else if (QueryName) {
          let matches = q.Name.trim().toLowerCase() === QueryName.trim().toLowerCase();
          if (CategoryID) {
            matches = matches && q.CategoryID.trim().toLowerCase() === CategoryID.trim().toLowerCase();
          } else if (CategoryPath) {
            const resolvedCategoryId = this.resolveCategoryPath(CategoryPath);
            if (resolvedCategoryId) {
              matches = matches && q.CategoryID === resolvedCategoryId;
            } else {
              matches = matches && q.Category.trim().toLowerCase() === CategoryPath.trim().toLowerCase();
            }
          }
          return matches;
        }
        return false;
      });

      if (queries.length === 0) {
        if (refreshMetadataIfNotFound) {
          await this.Refresh();
          return this.findQuery(QueryID, QueryName, CategoryID, CategoryPath, false);
        }
        else {
          return null;
        }
      }
      else {
        return queries[0];
      }
  }

  /**
   * Looks up a query from QueryEngine's auto-refreshed cache by ID, name, and optional category filters.
   */
  protected findQueryInEngine(QueryID: string, QueryName: string, CategoryID: string, CategoryPath: string): MJQueryEntity | null {
      const engineQueries = QueryEngine.Instance?.Queries;
      if (!engineQueries || engineQueries.length === 0) {
        return null; // Engine not loaded yet
      }

      if (QueryID) {
        const lower = QueryID.trim().toLowerCase();
        return engineQueries.find(q => q.ID.trim().toLowerCase() === lower) ?? null;
      }

      if (QueryName) {
        const lowerName = QueryName.trim().toLowerCase();
        const matches = engineQueries.filter(q => q.Name.trim().toLowerCase() === lowerName);
        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        // Disambiguate by category
        if (CategoryID) {
          const byId = matches.find(q => q.CategoryID?.trim().toLowerCase() === CategoryID.trim().toLowerCase());
          if (byId) return byId;
        }
        if (CategoryPath) {
          const resolvedCategoryId = this.resolveCategoryPath(CategoryPath);
          if (resolvedCategoryId) {
            const byPath = matches.find(q => q.CategoryID === resolvedCategoryId);
            if (byPath) return byPath;
          }
        }
        return matches[0];
      }

      return null;
  }

  /**
   * Creates a fresh QueryInfo from a MJQueryEntity and patches the ProviderBase in-memory cache.
   * This avoids stale data without requiring a full metadata reload.
   */
  protected refreshQueryInfoFromEntity(entity: MJQueryEntity): QueryInfo {
      const freshInfo = new QueryInfo(entity.GetAll());

      // Patch the ProviderBase cache: replace the stale entry or add the new one
      const existingIndex = this.Queries.findIndex(q => q.ID === freshInfo.ID);
      if (existingIndex >= 0) {
        this.Queries[existingIndex] = freshInfo;
      } else {
        this.Queries.push(freshInfo);
      }

      return freshInfo;
  }

  /**************************************************************************/
  // START ---- IRunQueryProvider
  /**************************************************************************/
  protected async InternalRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
    // This is the internal implementation - pre/post processing is handled by ProviderBase.RunQuery()

    // Route ad-hoc SQL queries to dedicated handler
    if (params.SQL) {
      return this.ExecuteAdhocSQL(params, contextUser);
    }

    try {
      // Find and validate query
      const query = await this.findAndValidateQuery(params, contextUser);
      
      // Process parameters if needed
      const { finalSQL, appliedParameters } = this.processQueryParameters(query, params.Parameters);
      
      // Check cache if enabled
      const cachedResult = this.checkQueryCache(query, params, appliedParameters);
      if (cachedResult) {
        return cachedResult;
      }
      
      // Execute query and measure performance
      const { result, executionTime } = await this.executeQueryWithTiming(finalSQL, contextUser);
      
      // Apply pagination
      const { paginatedResult, totalRowCount } = this.applyQueryPagination(result, params);
      
      // Handle audit logging (fire-and-forget)
      this.auditQueryExecution(query, params, finalSQL, paginatedResult.length, totalRowCount, executionTime, contextUser);
      
      // Cache results if enabled
      this.cacheQueryResults(query, params.Parameters || {}, result);
      
      return {
        Success: true,
        QueryID: query.ID,
        QueryName: query.Name,
        Results: paginatedResult,
        RowCount: paginatedResult.length,
        TotalRowCount: totalRowCount,
        ExecutionTime: executionTime,
        ErrorMessage: '',
        AppliedParameters: appliedParameters,
        CacheHit: false
      };
    } catch (e) {
      LogError(e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      return {
        Success: false,
        QueryID: params.QueryID,
        QueryName: params.QueryName,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: errorMessage,
      };
    }
  }

  /**
   * Executes an ad-hoc SQL query directly, with security validation.
   * SQL must be a SELECT or WITH (CTE) statement — mutations are rejected.
   */
  protected async ExecuteAdhocSQL(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
    try {
      // Validate SQL security
      const validator = SQLExpressionValidator.Instance;
      const validation = validator.validateFullQuery(params.SQL!);
      if (!validation.valid) {
        return {
          Success: false,
          QueryID: '',
          QueryName: 'Ad-Hoc Query',
          Results: [],
          RowCount: 0,
          TotalRowCount: 0,
          ExecutionTime: 0,
          ErrorMessage: validation.error || 'SQL validation failed',
        };
      }

      // Execute query and measure performance
      const { result, executionTime } = await this.executeQueryWithTiming(params.SQL!, contextUser);

      // Apply pagination if requested
      const { paginatedResult, totalRowCount } = this.applyQueryPagination(result, params);

      return {
        Success: true,
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Results: paginatedResult,
        RowCount: paginatedResult.length,
        TotalRowCount: totalRowCount,
        ExecutionTime: executionTime,
        ErrorMessage: '',
      };
    } catch (e) {
      LogError(e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      return {
        Success: false,
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: `Ad-hoc query execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Finds a query based on provided parameters and validates user permissions
   */
  protected async findAndValidateQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<QueryInfo> {
    const query = await this.findQuery(params.QueryID, params.QueryName, params.CategoryID, params.CategoryPath, true);
    if (!query) {
      let errorDetails = 'Query not found';
      if (params.QueryName) {
        errorDetails = `Query '${params.QueryName}' not found`;
        if (params.CategoryPath) {
          errorDetails += ` in category path '${params.CategoryPath}'`;
        } else if (params.CategoryID) {
          errorDetails += ` in category ID '${params.CategoryID}'`;
        }
      } else if (params.QueryID) {
        errorDetails = `Query with ID '${params.QueryID}' not found`;
      }
      throw new Error(errorDetails);
    }
    
    // Check permissions and status
    if (!query.UserCanRun(contextUser)) {
      if (!query.UserHasRunPermissions(contextUser)) {
        throw new Error('User does not have permission to run this query');
      } else {
        throw new Error(`Query is not in an approved status (current status: ${query.Status})`);
      }
    }
    
    return query;
  }

  /**
   * Processes query parameters and applies template substitution if needed
   */
  protected processQueryParameters(query: QueryInfo, parameters?: Record<string, any>): { finalSQL: string; appliedParameters: Record<string, any> } {
    let finalSQL = query.SQL;
    let appliedParameters: Record<string, any> = {};
    
    if (query.UsesTemplate) {
      const processingResult = QueryParameterProcessor.processQueryTemplate(query, parameters);
      
      if (!processingResult.success) {
        throw new Error(processingResult.error);
      }
      
      finalSQL = processingResult.processedSQL;
      appliedParameters = processingResult.appliedParameters || {};
    } else if (parameters && Object.keys(parameters).length > 0) {
      // Warn if parameters were provided but query doesn't use templates
      LogStatus('Warning: Parameters provided but query does not use templates. Parameters will be ignored.');
    }
    
    return { finalSQL, appliedParameters };
  }

  /**
   * Checks the cache for existing results and returns them if valid
   */
  protected checkQueryCache(query: QueryInfo, params: RunQueryParams, appliedParameters: Record<string, any>): RunQueryResult | null {
    const cacheConfig = query.CacheConfig;
    if (!cacheConfig?.enabled) {
      return null;
    }
    
    const cachedEntry = this.queryCache.get(query.ID, params.Parameters || {}, cacheConfig);
    if (!cachedEntry) {
      return null;
    }
    
    LogStatus(`Cache hit for query ${query.Name} (${query.ID})`);
    
    // Apply pagination to cached results
    const { paginatedResult, totalRowCount } = this.applyQueryPagination(cachedEntry.results, params);
    
    const remainingTTL = (cachedEntry.timestamp + (cachedEntry.ttlMinutes * 60 * 1000)) - Date.now();
    
    return {
      Success: true,
      QueryID: query.ID,
      QueryName: query.Name,
      Results: paginatedResult,
      RowCount: paginatedResult.length,
      TotalRowCount: totalRowCount,
      ExecutionTime: 0, // Cached result
      ErrorMessage: '',
      AppliedParameters: appliedParameters,
      CacheHit: true,
      CacheTTLRemaining: remainingTTL
    } as RunQueryResult & { CacheHit: boolean; CacheTTLRemaining: number };
  }

  /**
   * Executes the query and tracks execution time
   */
  protected async executeQueryWithTiming(sql: string, contextUser?: UserInfo): Promise<{ result: any[]; executionTime: number }> {
    const start = new Date().getTime();
    const result = await this.ExecuteSQL(sql, undefined, undefined, contextUser);
    const end = new Date().getTime();
    
    if (!result) {
      throw new Error('Error executing query SQL');
    }
    
    return { 
      result, 
      executionTime: end - start 
    };
  }

  /**
   * Applies pagination to query results based on StartRow and MaxRows parameters
   */
  protected applyQueryPagination(results: any[], params: RunQueryParams): { paginatedResult: any[]; totalRowCount: number } {
    const totalRowCount = results.length;
    const startRow = params.StartRow || 0;
    
    let paginatedResult = results;
    if (startRow > 0) {
      paginatedResult = paginatedResult.slice(startRow);
    }
    if (params.MaxRows && params.MaxRows > 0) {
      paginatedResult = paginatedResult.slice(0, params.MaxRows);
    }
    
    return { paginatedResult, totalRowCount };
  }

  /**
   * Creates an audit log record for query execution (fire-and-forget)
   */
  protected auditQueryExecution(
    query: QueryInfo, 
    params: RunQueryParams, 
    finalSQL: string, 
    rowCount: number, 
    totalRowCount: number, 
    executionTime: number, 
    contextUser?: UserInfo
  ): void {
    if (!params.ForceAuditLog && !query.AuditQueryRuns) {
      return;
    }
    
    // Fire and forget - we do NOT await this but catch errors
    this.CreateAuditLogRecord(
      contextUser,
      'Run Query',
      'Run Query',
      'Success',
      JSON.stringify({
        QueryID: query.ID,
        QueryName: query.Name,
        CategoryPath: query.CategoryPath,
        Description: params.AuditLogDescription,
        Parameters: params.Parameters,
        RowCount: rowCount,
        TotalRowCount: totalRowCount,
        ExecutionTime: executionTime,
        SQL: finalSQL // After parameter substitution
      }),
      null, // entityId - No specific entity for queries
      query.ID, // recordId
      params.AuditLogDescription,
      { IgnoreDirtyState: true } // saveOptions
    ).catch(error => {
      console.error('Error creating audit log:', error);
    });
  }

  /**
   * Caches query results if caching is enabled for the query
   */
  protected cacheQueryResults(query: QueryInfo, parameters: Record<string, any>, results: any[]): void {
    const cacheConfig = query.CacheConfig;
    if (!cacheConfig?.enabled) {
      return;
    }
    
    // Cache the full result set (before pagination)
    this.queryCache.set(query.ID, parameters, results, cacheConfig);
    LogStatus(`Cached results for query ${query.Name} (${query.ID})`);
  }

  /**
   * Internal implementation of batch query execution.
   * Runs multiple queries in parallel for efficiency.
   * @param params - Array of query parameters
   * @param contextUser - Optional user context for permissions
   * @returns Array of query results
   */
  protected async InternalRunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]> {
    // This is the internal implementation - pre/post processing is handled by ProviderBase.RunQueries()
    // Run all queries in parallel
    const promises = params.map((p) => this.InternalRunQuery(p, contextUser));
    return Promise.all(promises);
  }

  /**
   * RunQueriesWithCacheCheck - Smart cache validation for batch RunQueries.
   * For each query request, if cacheStatus is provided, uses the Query's CacheValidationSQL
   * to check if the cached data is still current by comparing MAX(__mj_UpdatedAt) and COUNT(*)
   * with client's values. Returns 'current' if cache is valid (no data), or 'stale' with fresh data.
   *
   * Queries without CacheValidationSQL configured will return 'no_validation' status with full data.
   */
  public async RunQueriesWithCacheCheck<T = unknown>(
    params: RunQueryWithCacheCheckParams[],
    contextUser?: UserInfo
  ): Promise<RunQueriesWithCacheCheckResponse<T>> {
    try {
      const user = contextUser || this.CurrentUser;
      if (!user) {
        return {
          success: false,
          results: [],
          errorMessage: 'No user context available',
        };
      }

      // Separate items that need cache check from those that don't
      const itemsNeedingCacheCheck: Array<{
        index: number;
        item: RunQueryWithCacheCheckParams;
        queryInfo: QueryInfo;
      }> = [];
      const itemsWithoutCacheCheck: Array<{ index: number; item: RunQueryWithCacheCheckParams }> = [];
      const itemsWithoutValidationSQL: Array<{ index: number; item: RunQueryWithCacheCheckParams; queryInfo: QueryInfo }> = [];
      const errorResults: RunQueryWithCacheCheckResult<T>[] = [];

      // Pre-process all items to resolve query info and validate
      for (let i = 0; i < params.length; i++) {
        const item = params[i];

        // Resolve query info
        const queryInfo = this.resolveQueryInfo(item.params);
        if (!queryInfo) {
          errorResults.push({
            queryIndex: i,
            queryId: item.params.QueryID || '',
            status: 'error',
            errorMessage: `Query not found: ${item.params.QueryID || item.params.QueryName}`,
          });
          continue;
        }

        // Check permissions
        if (!queryInfo.UserCanRun(user)) {
          errorResults.push({
            queryIndex: i,
            queryId: queryInfo.ID,
            status: 'error',
            errorMessage: `User does not have permission to run query: ${queryInfo.Name}`,
          });
          continue;
        }

        if (!item.cacheStatus) {
          // No cache status provided - will run full query
          itemsWithoutCacheCheck.push({ index: i, item });
          continue;
        }

        // Check if query has CacheValidationSQL
        if (!queryInfo.CacheValidationSQL) {
          // No validation SQL configured - will run full query and return 'no_validation'
          itemsWithoutValidationSQL.push({ index: i, item, queryInfo });
          continue;
        }

        itemsNeedingCacheCheck.push({ index: i, item, queryInfo });
      }

      // Execute batched cache status check for all items that need it
      const cacheStatusResults = await this.getBatchedQueryCacheStatus(itemsNeedingCacheCheck, contextUser);

      // Determine which items are current vs stale
      const staleItems: Array<{ index: number; params: RunQueryParams; queryInfo: QueryInfo }> = [];
      const currentResults: RunQueryWithCacheCheckResult<T>[] = [];

      for (const { index, item, queryInfo } of itemsNeedingCacheCheck) {
        const serverStatus = cacheStatusResults.get(index);
        if (!serverStatus || !serverStatus.success) {
          errorResults.push({
            queryIndex: index,
            queryId: queryInfo.ID,
            status: 'error',
            errorMessage: serverStatus?.errorMessage || 'Failed to get cache status',
          });
          continue;
        }

        const isCurrent = this.isCacheCurrent(item.cacheStatus!, serverStatus);
        if (isCurrent) {
          currentResults.push({
            queryIndex: index,
            queryId: queryInfo.ID,
            status: 'current',
          });
        } else {
          staleItems.push({ index, params: item.params, queryInfo });
        }
      }

      // Run full queries in parallel for:
      // 1. Items without cache status (no fingerprint from client)
      // 2. Items without CacheValidationSQL (always return data with 'no_validation' status)
      // 3. Items with stale cache
      const fullQueryPromises: Promise<RunQueryWithCacheCheckResult<T>>[] = [
        ...itemsWithoutCacheCheck.map(({ index, item }) =>
          this.runFullQueryAndReturnForQuery<T>(item.params, index, 'stale', contextUser)
        ),
        ...itemsWithoutValidationSQL.map(({ index, item, queryInfo }) =>
          this.runFullQueryAndReturnForQuery<T>(item.params, index, 'no_validation', contextUser, queryInfo.ID)
        ),
        ...staleItems.map(({ index, params: queryParams, queryInfo }) =>
          this.runFullQueryAndReturnForQuery<T>(queryParams, index, 'stale', contextUser, queryInfo.ID)
        ),
      ];

      const fullQueryResults = await Promise.all(fullQueryPromises);

      // Combine all results and sort by queryIndex
      const allResults = [...errorResults, ...currentResults, ...fullQueryResults];
      allResults.sort((a, b) => a.queryIndex - b.queryIndex);

      return {
        success: true,
        results: allResults,
      };
    } catch (e) {
      LogError(e);
      return {
        success: false,
        results: [],
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Resolves QueryInfo from RunQueryParams (by ID or Name+CategoryPath).
   */
  protected resolveQueryInfo(params: RunQueryParams): QueryInfo | undefined {
    // Try QueryEngine first for fresh, auto-refreshed data
    const freshEntity = this.findQueryInEngine(
      params.QueryID, params.QueryName, params.CategoryID, params.CategoryPath
    );
    if (freshEntity) {
      return this.refreshQueryInfoFromEntity(freshEntity);
    }

    // Fall back to ProviderBase cache if engine isn't loaded
    if (params.QueryID) {
      return this.Queries.find((q) => q.ID === params.QueryID);
    }

    if (params.QueryName) {
      const matchingQueries = this.Queries.filter(
        (q) => q.Name.trim().toLowerCase() === params.QueryName?.trim().toLowerCase()
      );

      if (matchingQueries.length === 0) return undefined;
      if (matchingQueries.length === 1) return matchingQueries[0];

      if (params.CategoryPath) {
        const byPath = matchingQueries.find(
          (q) => q.CategoryPath.toLowerCase() === params.CategoryPath?.toLowerCase()
        );
        if (byPath) return byPath;
      }

      if (params.CategoryID) {
        const byId = matchingQueries.find((q) => q.CategoryID === params.CategoryID);
        if (byId) return byId;
      }

      return matchingQueries[0];
    }

    return undefined;
  }

  /**
   * Executes a batched cache status check for multiple queries using their CacheValidationSQL.
   */
  protected async getBatchedQueryCacheStatus(
    items: Array<{ index: number; item: RunQueryWithCacheCheckParams; queryInfo: QueryInfo }>,
    contextUser?: UserInfo
  ): Promise<Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>> {
    const results = new Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>();

    if (items.length === 0) {
      return results;
    }

    // Build array of SQL statements for batch execution
    const sqlStatements: string[] = [];
    for (const { queryInfo } of items) {
      // CacheValidationSQL should return MaxUpdatedAt and RowCount
      sqlStatements.push(queryInfo.CacheValidationSQL!);
    }

    try {
      // Execute the batched SQL
      const resultSets = await this.ExecuteSQLBatch(sqlStatements, undefined, undefined, contextUser);

      // Process each result set and map to the corresponding item index
      for (let i = 0; i < items.length; i++) {
        const { index } = items[i];
        const resultSet = resultSets[i];

        if (resultSet && resultSet.length > 0) {
          const row = resultSet[0] as { MaxUpdatedAt: Date | string | null; RowCount: number };
          results.set(index, {
            success: true,
            rowCount: row.RowCount,
            maxUpdatedAt: row.MaxUpdatedAt ? new Date(row.MaxUpdatedAt).toISOString() : undefined,
          });
        } else {
          results.set(index, { success: true, rowCount: 0, maxUpdatedAt: undefined });
        }
      }
    } catch (e) {
      // If batch fails, mark all items as failed
      const errorMessage = e instanceof Error ? e.message : String(e);
      for (const { index } of items) {
        results.set(index, { success: false, errorMessage });
      }
    }

    return results;
  }

  /**
   * Runs the full query and returns results with cache metadata.
   */
  protected async runFullQueryAndReturnForQuery<T = unknown>(
    params: RunQueryParams,
    queryIndex: number,
    status: 'stale' | 'no_validation',
    contextUser?: UserInfo,
    queryId?: string
  ): Promise<RunQueryWithCacheCheckResult<T>> {
    const result = await this.InternalRunQuery(params, contextUser);

    if (!result.Success) {
      return {
        queryIndex,
        queryId: queryId || result.QueryID || '',
        status: 'error',
        errorMessage: result.ErrorMessage || 'Unknown error executing query',
      };
    }

    // Extract maxUpdatedAt from results
    const maxUpdatedAt = this.extractMaxUpdatedAt(result.Results);

    return {
      queryIndex,
      queryId: result.QueryID,
      status,
      results: result.Results as T[],
      maxUpdatedAt,
      rowCount: result.Results.length,
    };
  }

  /**************************************************************************/
  // END ---- IRunQueryProvider
  /**************************************************************************/

  /**
   * This method will check to see if the where clause for the view provided has any templating within it, and if it does
   * will replace the templating with the appropriate run-time values. This is done recursively with depth-first traversal
   * so that if there are nested templates, they will be replaced as well. We also maintain a stack to ensure that any
   * possible circular references are caught and an error is thrown if that is the case.
   * @param viewEntity
   * @param user
   */
  protected async RenderViewWhereClause(viewEntity: MJUserViewEntityExtended, user: UserInfo, stack: string[] = []): Promise<string> {
    try {
      let sWhere = viewEntity.WhereClause;
      if (sWhere && sWhere.length > 0) {
        // check for the existence of one or more templated values in the where clause which will follow the nunjucks format of {%variable%}
        const templateRegex = /{%([^%]+)%}/g;
        const matches = sWhere.match(templateRegex);
        if (matches) {
          for (const match of matches) {
            const variable = match.substring(2, match.length - 2); // remove the {% and %}

            // the variable has a name and a parameter value for example {%UserView "123456"%}
            // where UserView is the variable name and 123456 is the parameter value, in this case the View ID
            // we need to split the variable into its name and parameter value
            const parts = variable.split(' ');
            const variableName = parts[0];
            if (variableName.trim().toLowerCase() === 'userview') {
              let variableValue = parts.length > 1 ? parts[1] : null;
              // now strip the quotes from the variable value if they are there
              if (variableValue && variableValue.startsWith('"') && variableValue.endsWith('"'))
                variableValue = variableValue.substring(1, variableValue.length - 1);

              if (stack.includes(variable)) throw new Error(`Circular reference detected in view where clause for variable ${variable}`);
              else stack.push(variable); // add to the stack for circular reference detection

              // variable values is the view ID of the view that we want to get its WHERE CLAUSE, so we need to get the view entity
              const innerViewEntity = await ViewInfo.GetViewEntity(variableValue, user);
              if (innerViewEntity) {
                // we have the inner view, so now call this function recursively to get the where clause for the inner view
                const innerWhere = await this.RenderViewWhereClause(innerViewEntity, user, stack);
                const innerSQL = `SELECT [${innerViewEntity.ViewEntityInfo.FirstPrimaryKey.Name}] FROM [${innerViewEntity.ViewEntityInfo.SchemaName}].[${innerViewEntity.ViewEntityInfo.BaseView}] WHERE (${innerWhere})`;
                sWhere = sWhere.replace(match, innerSQL);
              } else throw new Error(`View ID ${variableValue} not found in metadata`);
            } else {
              // we don't know what this variable is, so throw an error
              throw new Error(`Unknown variable ${variableName} as part of template match ${match} in view where clause`);
            }
          }
        } else {
          // no matches, just a regular old SQL where clause, so we're done, do nothing here as the return process will be below
        }
      }
      return sWhere;
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**************************************************************************/
  // START ---- IRunViewProvider
  /**************************************************************************/
  protected async InternalRunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
    // This is the internal implementation - pre/post processing is handled by ProviderBase.RunView()

    // Log aggregate input for debugging
    if (params?.Aggregates?.length) {
      LogStatus(`[SQLServerDataProvider] InternalRunView received aggregates: entityName=${params.EntityName}, viewID=${params.ViewID}, viewName=${params.ViewName}, aggregateCount=${params.Aggregates.length}, aggregates=${JSON.stringify(params.Aggregates.map(a => ({ expression: a.expression, alias: a.alias })))}`);
    }

    const startTime = new Date();
    try {
      if (params) {
        const user = contextUser ? contextUser : this.CurrentUser;
        if (!user) throw new Error(`User not found in metadata and no contextUser provided to RunView()`);

        let viewEntity: any = null,
          entityInfo: EntityInfo = null;
        if (params.ViewEntity) viewEntity = params.ViewEntity;
        else if (params.ViewID && params.ViewID.length > 0) viewEntity = await ViewInfo.GetViewEntity(params.ViewID, contextUser);
        else if (params.ViewName && params.ViewName.length > 0) viewEntity = await ViewInfo.GetViewEntityByName(params.ViewName, contextUser);

        if (!viewEntity) {
          // if we don't have viewEntity, that means it is a dynamic view, so we need EntityName at a minimum
          if (!params.EntityName || params.EntityName.length === 0) throw new Error(`EntityName is required when ViewID or ViewName is not provided`);

          entityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === params.EntityName.trim().toLowerCase());
          if (!entityInfo) throw new Error(`Entity ${params.EntityName} not found in metadata`);
        } else {
          entityInfo = this.Entities.find((e) => e.ID === viewEntity.EntityID);
          if (!entityInfo) throw new Error(`Entity ID: ${viewEntity.EntityID} not found in metadata`);
        }

        // check permissions now, this call will throw an error if the user doesn't have permission
        this.CheckUserReadPermissions(entityInfo.Name, user);

        // get other variaables from params
        const extraFilter: string = params.ExtraFilter;
        const userSearchString: string = params.UserSearchString;
        const excludeUserViewRunID: string = params.ExcludeUserViewRunID;
        const overrideExcludeFilter: string = params.OverrideExcludeFilter;
        const saveViewResults: boolean = params.SaveViewResults;

        let topSQL: string = '';
        // Only use TOP if we're NOT using OFFSET/FETCH pagination
        const usingPagination = params.MaxRows && params.MaxRows > 0 && (params.StartRow !== undefined && params.StartRow >= 0);
        
        if (params.IgnoreMaxRows === true) {
          // do nothing, leave it blank, this structure is here to make the code easier to read
        } else if (usingPagination) {
          // When using OFFSET/FETCH, don't add TOP clause
          // do nothing, leave it blank
        } else if (params.MaxRows && params.MaxRows > 0) {
          // user provided a max rows, so we use that (but not using pagination)
          topSQL = 'TOP ' + params.MaxRows;
        } else if (entityInfo.UserViewMaxRows && entityInfo.UserViewMaxRows > 0) {
          topSQL = 'TOP ' + entityInfo.UserViewMaxRows;
        }

        const fields: string = this.getRunTimeViewFieldString(params, viewEntity);

        let viewSQL: string = `SELECT ${topSQL} ${fields} FROM [${entityInfo.SchemaName}].${entityInfo.BaseView}`;
        // We need countSQL for pagination (to get total count) or when using TOP (to show limited vs total)
        let countSQL = (usingPagination || (topSQL && topSQL.length > 0)) ? `SELECT COUNT(*) AS TotalRowCount FROM [${entityInfo.SchemaName}].${entityInfo.BaseView}` : null;
        let whereSQL: string = '';
        let bHasWhere: boolean = false;
        let userViewRunID: string = '';

        // The view may have a where clause that is part of the view definition. If so, we need to add it to the SQL
        if (viewEntity?.WhereClause && viewEntity?.WhereClause.length > 0) {
          const renderedWhere = await this.RenderViewWhereClause(viewEntity, contextUser);
          whereSQL = `(${renderedWhere})`;
          bHasWhere = true;
        }

        // a developer calling the function can provide an additional Extra Filter which is any valid SQL exprssion that can be added to the WHERE clause
        if (extraFilter && extraFilter.length > 0) {
          // extra filter is simple- we just AND it to the where clause if it exists, or we add it as a where clause if there was no prior WHERE
          if (!this.validateUserProvidedSQLClause(extraFilter))
            throw new Error(`Invalid Extra Filter: ${extraFilter}, contains one more for forbidden keywords`);

          if (bHasWhere) {
            whereSQL += ` AND (${extraFilter})`;
          } else {
            whereSQL = `(${extraFilter})`;
            bHasWhere = true;
          }
        }

        // check for a user provided search string and generate SQL as needed if provided
        if (userSearchString && userSearchString.length > 0) {
          if (!this.validateUserProvidedSQLClause(userSearchString))
            throw new Error(`Invalid User Search SQL clause: ${userSearchString}, contains one more for forbidden keywords`);

          const sUserSearchSQL: string = this.createViewUserSearchSQL(entityInfo, userSearchString);

          if (sUserSearchSQL.length > 0) {
            if (bHasWhere) {
              whereSQL += ` AND (${sUserSearchSQL})`;
            } else {
              whereSQL = `(${sUserSearchSQL})`;
              bHasWhere = true;
            }
          }
        }

        // now, check for an exclude UserViewRunID, or exclusion of ALL prior runs
        // if provided, we need to exclude the records that were part of that run (or all prior runs)
        if ((excludeUserViewRunID && excludeUserViewRunID.length > 0) || params.ExcludeDataFromAllPriorViewRuns === true) {
          let sExcludeSQL: string = `ID NOT IN (SELECT RecordID FROM [${this.MJCoreSchemaName}].vwUserViewRunDetails WHERE EntityID='${viewEntity.EntityID}' AND`;
          if (params.ExcludeDataFromAllPriorViewRuns === true)
            sExcludeSQL += ` UserViewID=${viewEntity.ID})`; // exclude ALL prior runs for this view, we do NOT need to also add the UserViewRunID even if it was provided because this will automatically filter that out too
          else sExcludeSQL += `UserViewRunID=${excludeUserViewRunID})`; // exclude just the run that was provided

          if (overrideExcludeFilter && overrideExcludeFilter.length > 0) {
            if (!this.validateUserProvidedSQLClause(overrideExcludeFilter))
              throw new Error(`Invalid OverrideExcludeFilter: ${overrideExcludeFilter}, contains one more for forbidden keywords`);

            // add in the OVERRIDE filter with an OR statement, this results in those rows that match the Exclude filter to be included
            // even if they're in the UserViewRunID that we're excluding
            sExcludeSQL += ' OR (' + overrideExcludeFilter + ')';
          }
          if (bHasWhere) {
            whereSQL += ` AND (${sExcludeSQL})`;
          } else {
            whereSQL = `(${sExcludeSQL})`;
            bHasWhere = true;
          }
        }

        // NEXT, apply Row Level Security (RLS)
        if (!entityInfo.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)) {
          // user is NOT exempt from RLS, so we need to apply it
          const rlsWhereClause: string = entityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');

          if (rlsWhereClause && rlsWhereClause.length > 0) {
            if (bHasWhere) {
              whereSQL += ` AND (${rlsWhereClause})`;
            } else {
              whereSQL = `(${rlsWhereClause})`;
              bHasWhere = true;
            }
          }
        }
        if (bHasWhere) {
          viewSQL += ` WHERE ${whereSQL}`;
          if (countSQL) countSQL += ` WHERE ${whereSQL}`;
        }

        // figure out the sorting for the view
        // first check params.OrderBy, that takes first priority
        // if that's not provided, then we check the view definition for its SortState
        // if that's not provided we do NOT sort
        const orderBy: string = params.OrderBy ? params.OrderBy : viewEntity ? viewEntity.OrderByClause : '';

        // if we're saving the view results, we need to wrap the entire SQL statement
        if (viewEntity?.ID && viewEntity?.ID.length > 0 && saveViewResults && user) {
          const { executeViewSQL, runID } = await this.executeSQLForUserViewRunLogging(viewEntity.ID, viewEntity.EntityBaseView, whereSQL, orderBy, user);
          viewSQL = executeViewSQL;
          userViewRunID = runID;
        } else if (orderBy && orderBy.length > 0) {
          // we only add order by if we're not doing run logging. This is becuase the run logging will
          // add the order by to its SELECT query that pulls from the list of records that were returned
          // there is no point in ordering the rows as they are saved into an audit list anyway so no order-by above
          // just here for final step before we execute it.
          if (!this.validateUserProvidedSQLClause(orderBy)) throw new Error(`Invalid Order By clause: ${orderBy}, contains one more for forbidden keywords`);

          viewSQL += ` ORDER BY ${orderBy}`;
        }

        // Apply pagination using OFFSET/FETCH if both MaxRows and StartRow are specified
        if (params.MaxRows && params.MaxRows > 0 && (params.StartRow !== undefined && params.StartRow >= 0) && entityInfo.FirstPrimaryKey) {
          // If no ORDER BY was already added, add one based on primary key (required for OFFSET/FETCH)
          if (!orderBy) {
            viewSQL += ` ORDER BY ${entityInfo.FirstPrimaryKey.Name} `;
          }
          viewSQL += ` OFFSET ${params.StartRow} ROWS FETCH NEXT ${params.MaxRows} ROWS ONLY`;
        }

        // Build aggregate SQL if aggregates are requested
        let aggregateSQL: string | null = null;
        let aggregateValidationErrors: AggregateResult[] = [];
        if (params.Aggregates && params.Aggregates.length > 0) {
          const aggregateBuild = this.buildAggregateSQL(
            params.Aggregates,
            entityInfo,
            entityInfo.SchemaName,
            entityInfo.BaseView,
            whereSQL
          );
          aggregateSQL = aggregateBuild.aggregateSQL;
          aggregateValidationErrors = aggregateBuild.validationErrors;
        }

        // Execute queries in parallel for better performance
        // - Data query (if not count_only)
        // - Count query (if needed)
        // - Aggregate query (if aggregates requested)
        const queries: Promise<unknown>[] = [];
        const queryKeys: string[] = [];

        // Data query
        if (params.ResultType !== 'count_only') {
          queries.push(this.ExecuteSQL(viewSQL, undefined, undefined, contextUser));
          queryKeys.push('data');
        }

        // Count query (run in parallel if we'll need it)
        const maxRowsUsed = params.MaxRows || entityInfo.UserViewMaxRows;
        const willNeedCount = countSQL && (usingPagination || params.ResultType === 'count_only');
        if (willNeedCount) {
          queries.push(this.ExecuteSQL(countSQL, undefined, undefined, contextUser));
          queryKeys.push('count');
        }

        // Aggregate query (runs in parallel with data/count queries)
        const aggregateStartTime = Date.now();
        if (aggregateSQL) {
          queries.push(this.ExecuteSQL(aggregateSQL, undefined, undefined, contextUser));
          queryKeys.push('aggregate');
        }

        // Execute all queries in parallel
        const results = await Promise.all(queries);

        // Map results back to their queries
        const resultMap: Record<string, unknown> = {};
        queryKeys.forEach((key, index) => {
          resultMap[key] = results[index];
        });

        // Process data results
        let retData = resultMap['data'] as Record<string, unknown>[] || [];

        // Process rows for datetime conversion and field-level decryption
        // This is critical for encrypted fields - without this, encrypted data stays encrypted in the UI
        if (retData.length > 0 && params.ResultType !== 'count_only') {
          retData = await this.ProcessEntityRows(retData, entityInfo, contextUser);
        }

        // Process count results - also check if we need count based on result length
        let rowCount = null;
        if (willNeedCount && resultMap['count']) {
          const countResult = resultMap['count'] as { TotalRowCount: number }[];
          if (countResult && countResult.length > 0) {
            rowCount = countResult[0].TotalRowCount;
          }
        } else if (countSQL && maxRowsUsed && retData.length === maxRowsUsed) {
          // Need to run count query because we hit the limit
          const countResult = await this.ExecuteSQL(countSQL, undefined, undefined, contextUser);
          if (countResult && countResult.length > 0) {
            rowCount = countResult[0].TotalRowCount;
          }
        }

        // Process aggregate results
        let aggregateResults: AggregateResult[] | undefined = undefined;
        let aggregateExecutionTime: number | undefined = undefined;
        if (params.Aggregates && params.Aggregates.length > 0) {
          aggregateExecutionTime = Date.now() - aggregateStartTime;

          if (resultMap['aggregate']) {
            // Map raw aggregate results back to original expressions
            const rawAggregateResult = resultMap['aggregate'] as Record<string, unknown>[];
            if (rawAggregateResult && rawAggregateResult.length > 0) {
              const row = rawAggregateResult[0];
              aggregateResults = [];
              let validExprIndex = 0;

              for (let i = 0; i < params.Aggregates.length; i++) {
                const agg = params.Aggregates[i];
                const alias = agg.alias || agg.expression;

                // Check if this expression had a validation error
                const validationError = aggregateValidationErrors.find(e => e.expression === agg.expression);
                if (validationError) {
                  aggregateResults.push(validationError);
                } else {
                  // Get the value from the result using the numbered alias
                  const rawValue = row[`Agg_${validExprIndex}`];
                  // Cast to AggregateValue - SQL Server returns numbers, strings, dates, or null
                  const value: AggregateValue = rawValue === undefined ? null : rawValue as AggregateValue;
                  aggregateResults.push({
                    expression: agg.expression,
                    alias: alias,
                    value: value,
                    error: undefined
                  });
                  validExprIndex++;
                }
              }
            }
          } else if (aggregateValidationErrors.length > 0) {
            // All expressions had validation errors
            aggregateResults = aggregateValidationErrors;
          }
        }

        const stopTime = new Date();

        if (
          params.ForceAuditLog ||
          (viewEntity?.ID && (extraFilter === undefined || extraFilter === null || extraFilter?.trim().length === 0) && entityInfo.AuditViewRuns)
        ) {
          // ONLY LOG TOP LEVEL VIEW EXECUTION - this would be for views with an ID, and don't have ExtraFilter as ExtraFilter
          // is only used in the system on a tab or just for ad hoc view execution

          // we do NOT want to wait for this, so no await,
          this.CreateAuditLogRecord(
            user,
            'Run View',
            'Run View',
            'Success',
            JSON.stringify({
              ViewID: viewEntity?.ID,
              ViewName: viewEntity?.Name,
              Description: params.AuditLogDescription,
              RowCount: retData.length,
              SQL: viewSQL,
            }),
            entityInfo.ID,
            null,
            params.AuditLogDescription,
            null
          );
        }

        const result: RunViewResult<T> = {
          RowCount:
            params.ResultType === 'count_only'
              ? rowCount
              : retData.length /*this property should be total row count if the ResultType='count_only' otherwise it should be the row count of the returned rows */,
          TotalRowCount: rowCount ? rowCount : retData.length,
          Results: retData as T[],
          UserViewRunID: userViewRunID,
          ExecutionTime: stopTime.getTime() - startTime.getTime(),
          Success: true,
          ErrorMessage: null,
          AggregateResults: aggregateResults,
          AggregateExecutionTime: aggregateExecutionTime,
        };

        return result;
      } 
      else {
        return null;
      }
    } catch (e) {
      const exceptionStopTime = new Date();
      LogError(e);
      return {
        RowCount: 0,
        TotalRowCount: 0,
        Results: [],
        UserViewRunID: '',
        ExecutionTime: exceptionStopTime.getTime() - startTime.getTime(),
        Success: false,
        ErrorMessage: e.message,
      };
    }
  }

  protected async InternalRunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
    // This is the internal implementation - pre/post processing is handled by ProviderBase.RunViews()
    // Note: We call InternalRunView directly since we're already inside the internal flow
    const promises = params.map((p) => this.InternalRunView<T>(p, contextUser));
    const results = await Promise.all(promises);
    return results;
  }

  /**
   * RunViewsWithCacheCheck - Smart cache validation for batch RunViews.
   * For each view request, if cacheStatus is provided, first checks if the cache is current
   * by comparing MAX(__mj_UpdatedAt) and COUNT(*) with client's values.
   * Returns 'current' if cache is valid (no data), or 'stale' with fresh data if cache is outdated.
   *
   * Optimized to batch all cache status checks into a single SQL call with multiple result sets.
   */
  public async RunViewsWithCacheCheck<T = unknown>(
    params: RunViewWithCacheCheckParams[],
    contextUser?: UserInfo
  ): Promise<RunViewsWithCacheCheckResponse<T>> {
    try {
      const user = contextUser || this.CurrentUser;
      if (!user) {
        return {
          success: false,
          results: [],
          errorMessage: 'No user context available',
        };
      }

      // Separate items that need cache check from those that don't
      const itemsNeedingCacheCheck: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo; whereSQL: string }> = [];
      const itemsWithoutCacheCheck: Array<{ index: number; item: RunViewWithCacheCheckParams }> = [];
      const errorResults: RunViewWithCacheCheckResult<T>[] = [];

      // Pre-process all items to build WHERE clauses and validate
      for (let i = 0; i < params.length; i++) {
        const item = params[i];
        if (!item.cacheStatus) {
          // No cache status - will run full query
          itemsWithoutCacheCheck.push({ index: i, item });
          continue;
        }

        // Get entity info
        const entityInfo = this.Entities.find(
          (e) => e.Name.trim().toLowerCase() === item.params.EntityName?.trim().toLowerCase()
        );
        if (!entityInfo) {
          errorResults.push({
            viewIndex: i,
            status: 'error',
            errorMessage: `Entity ${item.params.EntityName} not found in metadata`,
          });
          continue;
        }

        try {
          // Check permissions
          this.CheckUserReadPermissions(entityInfo.Name, user);
          // Build WHERE clause
          const whereSQL = await this.buildWhereClauseForCacheCheck(item.params, entityInfo, user);
          itemsNeedingCacheCheck.push({ index: i, item, entityInfo, whereSQL });
        } catch (e) {
          errorResults.push({
            viewIndex: i,
            status: 'error',
            errorMessage: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Execute batched cache status check for all items that need it
      const cacheStatusResults = await this.getBatchedServerCacheStatus(itemsNeedingCacheCheck, contextUser);

      // Determine which items are current vs stale, and whether they support differential updates
      const differentialItems: Array<{
        index: number;
        params: RunViewParams;
        entityInfo: EntityInfo;
        whereSQL: string;
        clientMaxUpdatedAt: string;
        clientRowCount: number;
        serverStatus: { maxUpdatedAt?: string; rowCount?: number };
      }> = [];
      const staleItemsNoTracking: Array<{ index: number; params: RunViewParams }> = [];
      const currentResults: RunViewWithCacheCheckResult<T>[] = [];

      for (const { index, item, entityInfo, whereSQL } of itemsNeedingCacheCheck) {
        const serverStatus = cacheStatusResults.get(index);
        if (!serverStatus || !serverStatus.success) {
          errorResults.push({
            viewIndex: index,
            status: 'error',
            errorMessage: serverStatus?.errorMessage || 'Failed to get cache status',
          });
          continue;
        }

        const isCurrent = this.isCacheCurrent(item.cacheStatus!, serverStatus);
        if (isCurrent) {
          currentResults.push({
            viewIndex: index,
            status: 'current',
          });
        } else {
          // Cache is stale - check if entity supports differential updates
          if (entityInfo.TrackRecordChanges) {
            // Entity tracks record changes - we can do differential update
            differentialItems.push({
              index,
              params: item.params,
              entityInfo,
              whereSQL,
              clientMaxUpdatedAt: item.cacheStatus!.maxUpdatedAt,
              clientRowCount: item.cacheStatus!.rowCount,
              serverStatus,
            });
          } else {
            // Entity doesn't track record changes - fall back to full refresh
            staleItemsNoTracking.push({ index, params: item.params });
          }
        }
      }

      // Run queries in parallel:
      // 1. Items without cache status (no fingerprint from client) - full query
      // 2. Items with stale cache but no tracking - full query
      // 3. Items with stale cache and tracking - differential query
      const queryPromises: Promise<RunViewWithCacheCheckResult<T>>[] = [
        // Full queries for items without cache status
        ...itemsWithoutCacheCheck.map(({ index, item }) =>
          this.runFullQueryAndReturn<T>(item.params, index, contextUser)
        ),
        // Full queries for entities that don't track record changes
        ...staleItemsNoTracking.map(({ index, params: viewParams }) =>
          this.runFullQueryAndReturn<T>(viewParams, index, contextUser)
        ),
        // Differential queries for entities that track record changes
        ...differentialItems.map(({ index, params: viewParams, entityInfo, whereSQL, clientMaxUpdatedAt, clientRowCount, serverStatus }) =>
          this.runDifferentialQueryAndReturn<T>(
            viewParams,
            entityInfo,
            clientMaxUpdatedAt,
            clientRowCount,
            serverStatus,
            whereSQL,
            index,
            contextUser
          )
        ),
      ];

      const fullQueryResults = await Promise.all(queryPromises);

      // Combine all results and sort by viewIndex
      const allResults = [...errorResults, ...currentResults, ...fullQueryResults];
      allResults.sort((a, b) => a.viewIndex - b.viewIndex);

      return {
        success: true,
        results: allResults,
      };
    } catch (e) {
      LogError(e);
      return {
        success: false,
        results: [],
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Executes a batched cache status check for multiple views in a single SQL call.
   * Uses multiple result sets to return status for each view efficiently.
   */
  protected async getBatchedServerCacheStatus(
    items: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo; whereSQL: string }>,
    contextUser?: UserInfo
  ): Promise<Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>> {
    const results = new Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>();

    if (items.length === 0) {
      return results;
    }

    // Build array of SQL statements for batch execution
    const sqlStatements: string[] = [];
    for (const { entityInfo, whereSQL } of items) {
      const statusSQL = `SELECT COUNT(*) AS TotalRows, MAX(__mj_UpdatedAt) AS MaxUpdatedAt FROM [${entityInfo.SchemaName}].${entityInfo.BaseView}${whereSQL ? ' WHERE ' + whereSQL : ''}`;
      sqlStatements.push(statusSQL);
    }

    try {
      // Execute the batched SQL using existing ExecuteSQLBatch method
      const resultSets = await this.ExecuteSQLBatch(sqlStatements, undefined, undefined, contextUser);

      // Process each result set and map to the corresponding item index
      for (let i = 0; i < items.length; i++) {
        const { index } = items[i];
        const resultSet = resultSets[i];

        if (resultSet && resultSet.length > 0) {
          const row = resultSet[0] as { TotalRows: number; MaxUpdatedAt: Date | string | null };
          results.set(index, {
            success: true,
            rowCount: row.TotalRows,
            maxUpdatedAt: row.MaxUpdatedAt ? new Date(row.MaxUpdatedAt).toISOString() : undefined,
          });
        } else {
          results.set(index, { success: true, rowCount: 0, maxUpdatedAt: undefined });
        }
      }
    } catch (e) {
      // If batch fails, mark all items as failed
      const errorMessage = e instanceof Error ? e.message : String(e);
      for (const { index } of items) {
        results.set(index, { success: false, errorMessage });
      }
    }

    return results;
  }

  /**
   * Builds the WHERE clause for cache status check, using same logic as InternalRunView.
   */
  protected async buildWhereClauseForCacheCheck(
    params: RunViewParams,
    entityInfo: EntityInfo,
    user: UserInfo
  ): Promise<string> {
    let whereSQL = '';
    let bHasWhere = false;

    // Extra filter
    if (params.ExtraFilter && params.ExtraFilter.length > 0) {
      if (!this.validateUserProvidedSQLClause(params.ExtraFilter)) {
        throw new Error(`Invalid Extra Filter: ${params.ExtraFilter}`);
      }
      whereSQL = `(${params.ExtraFilter})`;
      bHasWhere = true;
    }

    // User search string
    if (params.UserSearchString && params.UserSearchString.length > 0) {
      if (!this.validateUserProvidedSQLClause(params.UserSearchString)) {
        throw new Error(`Invalid User Search SQL clause: ${params.UserSearchString}`);
      }
      const sUserSearchSQL = this.createViewUserSearchSQL(entityInfo, params.UserSearchString);
      if (sUserSearchSQL.length > 0) {
        if (bHasWhere) {
          whereSQL += ` AND (${sUserSearchSQL})`;
        } else {
          whereSQL = `(${sUserSearchSQL})`;
          bHasWhere = true;
        }
      }
    }

    // Row Level Security
    if (!entityInfo.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)) {
      const rlsWhereClause = entityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
      if (rlsWhereClause && rlsWhereClause.length > 0) {
        if (bHasWhere) {
          whereSQL += ` AND (${rlsWhereClause})`;
        } else {
          whereSQL = `(${rlsWhereClause})`;
        }
      }
    }

    return whereSQL;
  }

  /**
   * Compares client cache status with server status to determine if cache is current.
   */
  protected isCacheCurrent(
    clientStatus: { maxUpdatedAt: string; rowCount: number },
    serverStatus: { maxUpdatedAt?: string; rowCount?: number }
  ): boolean {
    // Row count must match
    if (clientStatus.rowCount !== serverStatus.rowCount) {
      return false;
    }

    // Compare maxUpdatedAt dates
    const clientDate = new Date(clientStatus.maxUpdatedAt);
    const serverDate = serverStatus.maxUpdatedAt ? new Date(serverStatus.maxUpdatedAt) : null;

    if (!serverDate) {
      // No records on server, so if client has any, it's stale
      return clientStatus.rowCount === 0;
    }

    // Dates must match (compare as ISO strings for precision)
    return clientDate.toISOString() === serverDate.toISOString();
  }

  /**
   * Runs the full query and returns results with cache metadata.
   */
  protected async runFullQueryAndReturn<T = unknown>(
    params: RunViewParams,
    viewIndex: number,
    contextUser?: UserInfo
  ): Promise<RunViewWithCacheCheckResult<T>> {
    const result = await this.InternalRunView<T>(params, contextUser);

    if (!result.Success) {
      return {
        viewIndex,
        status: 'error',
        errorMessage: result.ErrorMessage || 'Unknown error executing view',
      };
    }

    // Extract maxUpdatedAt from results
    const maxUpdatedAt = this.extractMaxUpdatedAt(result.Results);

    return {
      viewIndex,
      status: 'stale',
      results: result.Results,
      maxUpdatedAt,
      rowCount: result.Results.length,
    };
  }

  /**
   * Extracts the maximum __mj_UpdatedAt value from a result set.
   * @param results - Array of result objects that may contain __mj_UpdatedAt
   * @returns ISO string of the max timestamp, or current time if none found
   */
  protected extractMaxUpdatedAt(results: unknown[]): string {
    if (!results || results.length === 0) {
      return new Date().toISOString();
    }

    let maxDate: Date | null = null;
    for (const row of results) {
      const rowObj = row as Record<string, unknown>;
      const updatedAt = rowObj['__mj_UpdatedAt'];
      if (updatedAt) {
        const date = new Date(updatedAt as string);
        if (!isNaN(date.getTime()) && (!maxDate || date > maxDate)) {
          maxDate = date;
        }
      }
    }

    return maxDate ? maxDate.toISOString() : new Date().toISOString();
  }

  /**
   * Gets the IDs of records that have been deleted since a given timestamp.
   * Uses the RecordChange table which tracks all deletions for entities with TrackRecordChanges enabled.
   * @param entityID - The entity ID to check deletions for
   * @param sinceTimestamp - ISO timestamp to check deletions since
   * @param contextUser - Optional user context for permissions
   * @returns Array of record IDs (in CompositeKey concatenated string format)
   */
  protected async getDeletedRecordIDsSince(
    entityID: string,
    sinceTimestamp: string,
    contextUser?: UserInfo
  ): Promise<string[]> {
    try {
      const sql = `
        SELECT DISTINCT RecordID
        FROM [${this.MJCoreSchemaName}].vwRecordChanges
        WHERE EntityID = '${entityID}'
          AND Type = 'Delete'
          AND ChangedAt > '${sinceTimestamp}'
      `;
      const results = await this.ExecuteSQL(sql, undefined, undefined, contextUser);
      return results.map(r => r.RecordID);
    } catch (e) {
      LogError(e);
      return [];
    }
  }

  /**
   * Gets rows that have been created or updated since a given timestamp.
   * @param params - RunView parameters (used for entity, filter, etc.)
   * @param entityInfo - Entity metadata
   * @param sinceTimestamp - ISO timestamp to check updates since
   * @param whereSQL - Pre-built WHERE clause from the original query
   * @param contextUser - Optional user context for permissions
   * @returns Array of updated/created rows
   */
  protected async getUpdatedRowsSince<T = unknown>(
    params: RunViewParams,
    entityInfo: EntityInfo,
    sinceTimestamp: string,
    whereSQL: string,
    contextUser?: UserInfo
  ): Promise<T[]> {
    try {
      // Add the timestamp filter to the existing WHERE clause
      const timestampFilter = `__mj_UpdatedAt > '${sinceTimestamp}'`;
      const combinedWhere = whereSQL
        ? `(${whereSQL}) AND ${timestampFilter}`
        : timestampFilter;

      // Build field list
      const fields = params.Fields && params.Fields.length > 0
        ? params.Fields.map(f => `[${f}]`).join(', ')
        : '*';

      // Build the query
      let sql = `SELECT ${fields} FROM [${entityInfo.SchemaName}].${entityInfo.BaseView} WHERE ${combinedWhere}`;

      // Add ORDER BY if specified
      if (params.OrderBy && params.OrderBy.length > 0) {
        if (!this.validateUserProvidedSQLClause(params.OrderBy)) {
          throw new Error(`Invalid OrderBy clause: ${params.OrderBy}`);
        }
        sql += ` ORDER BY ${params.OrderBy}`;
      }

      const results = await this.ExecuteSQL(sql, undefined, undefined, contextUser);
      return results;
    } catch (e) {
      LogError(e);
      return [];
    }
  }

  /**
   * Runs a differential query and returns only changes since the client's cached state.
   * This includes updated/created rows and deleted record IDs.
   *
   * Validates that the differential can be safely applied by checking for "hidden" deletes
   * (rows deleted outside of MJ's RecordChanges tracking, e.g., direct SQL deletes).
   * If hidden deletes are detected, falls back to a full query with 'stale' status.
   *
   * @param params - RunView parameters
   * @param entityInfo - Entity metadata
   * @param clientMaxUpdatedAt - Client's cached maxUpdatedAt timestamp
   * @param clientRowCount - Client's cached row count
   * @param serverStatus - Current server status (for new row count)
   * @param whereSQL - Pre-built WHERE clause
   * @param viewIndex - Index for correlation in batch operations
   * @param contextUser - Optional user context
   * @returns RunViewWithCacheCheckResult with differential data, or falls back to full query if unsafe
   */
  protected async runDifferentialQueryAndReturn<T = unknown>(
    params: RunViewParams,
    entityInfo: EntityInfo,
    clientMaxUpdatedAt: string,
    clientRowCount: number,
    serverStatus: { maxUpdatedAt?: string; rowCount?: number },
    whereSQL: string,
    viewIndex: number,
    contextUser?: UserInfo
  ): Promise<RunViewWithCacheCheckResult<T>> {
    try {
      // Get updated/created rows since client's timestamp
      const updatedRows = await this.getUpdatedRowsSince<T>(
        params,
        entityInfo,
        clientMaxUpdatedAt,
        whereSQL,
        contextUser
      );

      // Get deleted record IDs since client's timestamp
      const deletedRecordIDs = await this.getDeletedRecordIDsSince(
        entityInfo.ID,
        clientMaxUpdatedAt,
        contextUser
      );

      // === VALIDATION: Detect "hidden" deletes not tracked in RecordChanges ===
      // Count how many returned rows are NEW (created after client's cache timestamp)
      // vs rows that already existed and were just updated
      const clientMaxUpdatedDate = new Date(clientMaxUpdatedAt);
      const newInserts = updatedRows.filter(row => {
        const createdAt = (row as Record<string, unknown>)['__mj_CreatedAt'];
        if (!createdAt) return false;
        return new Date(String(createdAt)) > clientMaxUpdatedDate;
      }).length;

      // Calculate implied deletes using the algebra:
      // serverRowCount = clientRowCount - deletes + inserts
      // Therefore: impliedDeletes = clientRowCount + newInserts - serverRowCount
      const serverRowCount = serverStatus.rowCount ?? 0;
      const impliedDeletes = clientRowCount + newInserts - serverRowCount;
      const actualDeletes = deletedRecordIDs.length;

      // Validate: if impliedDeletes < 0, there are unexplained rows on the server
      // This could happen with direct SQL inserts that bypassed MJ's tracking
      if (impliedDeletes < 0) {
        LogStatus(
          `Differential validation failed for ${entityInfo.Name}: impliedDeletes=${impliedDeletes} (negative). ` +
          `clientRowCount=${clientRowCount}, newInserts=${newInserts}, serverRowCount=${serverRowCount}. ` +
          `Falling back to full refresh.`
        );
        return this.runFullQueryAndReturn<T>(params, viewIndex, contextUser);
      }

      // Validate: if impliedDeletes > actualDeletes, there are "hidden" deletes
      // not tracked in RecordChanges (e.g., direct SQL deletes)
      if (impliedDeletes > actualDeletes) {
        LogStatus(
          `Differential validation failed for ${entityInfo.Name}: hidden deletes detected. ` +
          `impliedDeletes=${impliedDeletes}, actualDeletes=${actualDeletes}. ` +
          `clientRowCount=${clientRowCount}, newInserts=${newInserts}, serverRowCount=${serverRowCount}. ` +
          `Falling back to full refresh.`
        );
        return this.runFullQueryAndReturn<T>(params, viewIndex, contextUser);
      }

      // Validation passed - safe to apply differential
      // Extract maxUpdatedAt from the updated rows (or use server status)
      const newMaxUpdatedAt = updatedRows.length > 0
        ? this.extractMaxUpdatedAt(updatedRows)
        : serverStatus.maxUpdatedAt || new Date().toISOString();

      return {
        viewIndex,
        status: 'differential',
        differentialData: {
          updatedRows,
          deletedRecordIDs,
        },
        maxUpdatedAt: newMaxUpdatedAt,
        rowCount: serverStatus.rowCount,
      };
    } catch (e) {
      LogError(e);
      return {
        viewIndex,
        status: 'error',
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }
  }

  protected validateUserProvidedSQLClause(clause: string): boolean {
    // First, remove all string literals from the clause to avoid false positives
    // This regex matches both single and double quoted strings, handling escaped quotes
    const stringLiteralPattern = /(['"])(?:(?=(\\?))\2[\s\S])*?\1/g;
    
    // Replace all string literals with empty strings for validation purposes
    const clauseWithoutStrings = clause.replace(stringLiteralPattern, '');
    
    // convert the clause to lower case to make the keyword search case-insensitive
    const lowerClause = clauseWithoutStrings.toLowerCase();

    // Define forbidden keywords and characters as whole words using regular expressions
    const forbiddenPatterns: RegExp[] = [
      /\binsert\b/,
      /\bupdate\b/,
      /\bdelete\b/,
      /\bexec\b/,
      /\bexecute\b/,
      /\bdrop\b/,
      /--/,
      /\/\*/,
      /\*\//,
      /\bunion\b/,
      /\bcast\b/,
      /\bxp_/,
      /;/,
    ];

    // Check for forbidden patterns
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(lowerClause)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validates and builds an aggregate SQL query from the provided aggregate expressions.
   * Uses the SQLExpressionValidator to ensure expressions are safe from SQL injection.
   *
   * @param aggregates - Array of aggregate expressions to validate and build
   * @param entityInfo - Entity metadata for field reference validation
   * @param schemaName - Schema name for the table
   * @param baseView - Base view name for the table
   * @param whereSQL - WHERE clause to apply (without the WHERE keyword)
   * @returns Object with aggregateSQL string and any validation errors
   */
  protected buildAggregateSQL(
    aggregates: { expression: string; alias?: string }[],
    entityInfo: EntityInfo,
    schemaName: string,
    baseView: string,
    whereSQL: string
  ): { aggregateSQL: string | null; validationErrors: AggregateResult[] } {
    if (!aggregates || aggregates.length === 0) {
      return { aggregateSQL: null, validationErrors: [] };
    }

    const validator = SQLExpressionValidator.Instance;
    const validationErrors: AggregateResult[] = [];
    const validExpressions: string[] = [];
    const fieldNames = entityInfo.Fields.map(f => f.Name);

    for (let i = 0; i < aggregates.length; i++) {
      const agg = aggregates[i];
      const alias = agg.alias || agg.expression;

      // Validate the expression using SQLExpressionValidator
      const result = validator.validate(agg.expression, {
        context: 'aggregate',
        entityFields: fieldNames
      });

      if (!result.valid) {
        // Record the error but continue processing other expressions
        validationErrors.push({
          expression: agg.expression,
          alias: alias,
          value: null,
          error: result.error || 'Validation failed'
        });
      } else {
        // Expression is valid, add to the query with an alias
        // Use a numbered alias for the SQL to make result mapping easier
        validExpressions.push(`${agg.expression} AS [Agg_${i}]`);
      }
    }

    if (validExpressions.length === 0) {
      return { aggregateSQL: null, validationErrors };
    }

    // Build the aggregate SQL query
    let aggregateSQL = `SELECT ${validExpressions.join(', ')} FROM [${schemaName}].${baseView}`;
    if (whereSQL && whereSQL.length > 0) {
      aggregateSQL += ` WHERE ${whereSQL}`;
    }

    return { aggregateSQL, validationErrors };
  }

  /**
   * Executes the aggregate query and maps results back to the original expressions.
   *
   * @param aggregateSQL - The aggregate SQL query to execute
   * @param aggregates - Original aggregate expressions (for result mapping)
   * @param validationErrors - Any validation errors from buildAggregateSQL
   * @param contextUser - User context for query execution
   * @returns Array of AggregateResult objects
   */
  protected async executeAggregateQuery(
    aggregateSQL: string | null,
    aggregates: { expression: string; alias?: string }[],
    validationErrors: AggregateResult[],
    contextUser?: UserInfo
  ): Promise<{ results: AggregateResult[]; executionTime: number }> {
    const startTime = Date.now();

    if (!aggregateSQL) {
      // No valid expressions to execute, return only validation errors
      return { results: validationErrors, executionTime: 0 };
    }

    try {
      const queryResult = await this.ExecuteSQL(aggregateSQL, undefined, undefined, contextUser);
      const executionTime = Date.now() - startTime;

      if (!queryResult || queryResult.length === 0) {
        // Query returned no results, which shouldn't happen for aggregates
        // Return validation errors plus null values for valid expressions
        const nullResults = aggregates
          .filter((_, i) => !validationErrors.some(e => e.expression === aggregates[i].expression))
          .map(agg => ({
            expression: agg.expression,
            alias: agg.alias || agg.expression,
            value: null,
            error: undefined
          }));
        return { results: [...validationErrors, ...nullResults], executionTime };
      }

      // Map query results back to original expressions
      const row = queryResult[0];
      const results: AggregateResult[] = [];
      let validExprIndex = 0;

      for (let i = 0; i < aggregates.length; i++) {
        const agg = aggregates[i];
        const alias = agg.alias || agg.expression;

        // Check if this expression had a validation error
        const validationError = validationErrors.find(e => e.expression === agg.expression);
        if (validationError) {
          results.push(validationError);
        } else {
          // Get the value from the result using the numbered alias
          const value = row[`Agg_${validExprIndex}`];
          results.push({
            expression: agg.expression,
            alias: alias,
            value: value ?? null,
            error: undefined
          });
          validExprIndex++;
        }
      }

      return { results, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Return all expressions with the error
      const errorResults = aggregates.map(agg => ({
        expression: agg.expression,
        alias: agg.alias || agg.expression,
        value: null,
        error: errorMessage
      }));

      return { results: errorResults, executionTime };
    }
  }

  protected getRunTimeViewFieldString(params: RunViewParams, viewEntity: MJUserViewEntityExtended): string {
    const fieldList = this.getRunTimeViewFieldArray(params, viewEntity);
    // pass this back as a comma separated list, put square brackets around field names to make sure if they are reserved words or have spaces, that they'll still work.
    if (fieldList.length === 0) return '*';
    else
      return fieldList
        .map((f) => {
          const asString: string = f.CodeName === f.Name ? '' : ` AS [${f.CodeName}]`;
          return `[${f.Name}]${asString}`;
        })
        .join(',');
  }

  protected getRunTimeViewFieldArray(params: RunViewParams, viewEntity: MJUserViewEntityExtended): EntityFieldInfo[] {
    const fieldList: EntityFieldInfo[] = [];
    try {
      let entityInfo: EntityInfo = null;
      if (viewEntity) {
        entityInfo = viewEntity.ViewEntityInfo;
      } else {
        entityInfo = this.Entities.find((e) => e.Name === params.EntityName);
        if (!entityInfo) throw new Error(`Entity ${params.EntityName} not found in metadata`);
      }

      if (params.Fields) {
        // fields provided, if primary key isn't included, add it first
        for (const ef of entityInfo.PrimaryKeys) {
          if (params.Fields.find((f) => f.trim().toLowerCase() === ef.Name.toLowerCase()) === undefined) fieldList.push(ef); // always include the primary key fields in view run time field list
        }

        // now add the rest of the param.Fields to fields
        params.Fields.forEach((f) => {
          const field = entityInfo.Fields.find((field) => field.Name.trim().toLowerCase() === f.trim().toLowerCase());
          if (field) fieldList.push(field);
          else LogError(`Field ${f} not found in entity ${entityInfo.Name}`);
        });
      } else {
        // fields weren't provided by the caller. So, let's do the following
        // * if this is a defined view, using a View Name or View ID, we use the fields that are used wtihin the View and always return the ID
        // * if this is an dynamic view, we return ALL fields in the entity using *
        if (viewEntity) {
          // saved view, figure out it's field list
          viewEntity.Columns.forEach((c) => {
            if (!c.hidden) {
              // only return the non-hidden fields
              if (c.EntityField) {
                fieldList.push(c.EntityField);
              } else {
                LogError(
                  `View Field ${c.Name} doesn't match an Entity Field in entity ${entityInfo.Name}. This can happen if the view was saved with a field that no longer exists in the entity. It is best to update the view to remove this field.`,
                );
              }
            }
          });
          // the below shouldn't happen as the pkey fields should always be included by now, but make SURE...
          for (const ef of entityInfo.PrimaryKeys) {
            if (fieldList.find((f) => f.Name?.trim().toLowerCase() === ef.Name?.toLowerCase()) === undefined) fieldList.push(ef); // always include the primary key fields in view run time field list
          }
        }
      }
    } catch (e) {
      LogError(e);
    } finally {
      return fieldList;
    }
  }

  protected async executeSQLForUserViewRunLogging(
    viewId: number,
    entityBaseView: string,
    whereSQL: string,
    orderBySQL: string,
    user: UserInfo,
  ): Promise<{ executeViewSQL: string; runID: string }> {
    const entityInfo = this.Entities.find((e) => e.BaseView.trim().toLowerCase() === entityBaseView.trim().toLowerCase());
    const sSQL = `
            DECLARE @ViewIDList TABLE ( ID NVARCHAR(255) );
            INSERT INTO @ViewIDList (ID) (SELECT ${entityInfo.FirstPrimaryKey.Name} FROM [${entityInfo.SchemaName}].${entityBaseView} WHERE (${whereSQL}))
            EXEC [${this.MJCoreSchemaName}].spCreateUserViewRunWithDetail(${viewId},${user.Email}, @ViewIDLIst)
            `;
    const runIDResult = await this.ExecuteSQL(sSQL, undefined, undefined, user);
    const runID: string = runIDResult[0].UserViewRunID;
    const sRetSQL: string = `SELECT * FROM [${entityInfo.SchemaName}].${entityBaseView} WHERE ${entityInfo.FirstPrimaryKey.Name} IN
                                    (SELECT RecordID FROM [${this.MJCoreSchemaName}].vwUserViewRunDetails WHERE UserViewRunID=${runID})
                                 ${orderBySQL && orderBySQL.length > 0 ? ` ORDER BY ${orderBySQL}` : ''}`;
    return { executeViewSQL: sRetSQL, runID };
  }

  protected createViewUserSearchSQL(entityInfo: EntityInfo, userSearchString: string) {
    // we have a user search string.
    // if we have full text search, we use that.
    // Otherwise, we need to manually construct the additional filter associated with this. The user search string is just text from the user
    // we need to apply it to one or more fields that are part of the entity that support being part of a user search.
    // we need to get the list of fields that are part of the entity that support being part of a user search.

    let sUserSearchSQL = '';
    if (entityInfo.FullTextSearchEnabled) {
      // we have full text search, so we use that, do as subquery but that gets optimized into JOIN by SQL Server, so we can keep our situation logially simpler
      // in the context of overall filtering by doing as a SUBQUERY here.

      // if we have a user search string that includes AND, OR, or NOT, we leave it alone
      // otherwise, we check to see if the userSearchString is a single word, if so, we also leave it alone
      // if the userSearchString doesn't have AND OR or NOT in it, and has multiple words, we convert the spaces to
      // AND so that we can do a full text search on all the words
      let u = userSearchString;
      const uUpper = u.toUpperCase();
      if (uUpper.includes(' AND ') || uUpper.includes(' OR ') || uUpper.includes(' NOT ')) {
        //replace all spaces with %, but add spaces inbetween the original and, or and not keywords
        u = uUpper.replace(/ /g, '%').replace(/%AND%/g, ' AND ').replace(/%OR%/g, ' OR ').replace(/%NOT%/g, ' NOT ');
      } else if (uUpper.includes('AND') || uUpper.includes('OR') || uUpper.includes('NOT')) {
        //leave the string alone, except replacing spaces with %
        u = u.replace(/ /g, '%');
      } else if (u.includes(' ')) {
        if (u.startsWith('"') && u.endsWith('"')) {
          // do nothing because we start AND end with a quote, so we have a phrase search
        } else {
          // we have multiple words, so we need to convert the spaces to AND
          // but first, let's strip the stopwords out of the string
          u = StripStopWords(userSearchString);
          // next, include "AND" between all the words so that we have a full text search on all the words
          u = u.replace(/ /g, ' AND ');
        }
      }

      sUserSearchSQL = `${entityInfo.FirstPrimaryKey.Name} IN (SELECT ${entityInfo.FirstPrimaryKey.Name} FROM ${entityInfo.SchemaName}.${entityInfo.FullTextSearchFunction}('${u}'))`;
    } else {
      const entityFields = entityInfo.Fields;

      for (const field of entityFields) {
        if (field.IncludeInUserSearchAPI) {
          let sParam = '';
          if (sUserSearchSQL.length > 0) sUserSearchSQL += ' OR ';

          if (field.UserSearchParamFormatAPI && field.UserSearchParamFormatAPI.length > 0)
            // we have a search param format. we need to apply it to the user search string
            sParam = field.UserSearchParamFormatAPI.replace('{0}', userSearchString);
          else sParam = ` LIKE '%${userSearchString}%'`;

          sUserSearchSQL += `(${field.Name} ${sParam})`;
        }
      }
      if (sUserSearchSQL.length > 0) sUserSearchSQL = '(' + sUserSearchSQL + ')'; // wrap the entire search string in parens
    }

    return sUserSearchSQL;
  }

  public async CreateAuditLogRecord(
    user: UserInfo,
    authorizationName: string | null,
    auditLogTypeName: string,
    status: string,
    details: string | null,
    entityId: string,
    recordId: any | null,
    auditLogDescription: string | null,
    saveOptions: EntitySaveOptions
  ): Promise<MJAuditLogEntity> {
    try {
      const authorization = authorizationName
        ? this.Authorizations.find((a) => a?.Name?.trim().toLowerCase() === authorizationName.trim().toLowerCase())
        : null;
      const auditLogType = auditLogTypeName ? this.AuditLogTypes.find((a) => a?.Name?.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase()) : null;

      if (!user) throw new Error(`User is a required parameter`);
      if (!auditLogType) {
        throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);
      }

      const auditLog = await this.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', user); // must pass user context on back end as we're not authenticated the same way as the front end
      auditLog.NewRecord();
      auditLog.UserID = user.ID;
      auditLog.AuditLogTypeID = auditLogType.ID;
      if (status?.trim().toLowerCase() === 'success') auditLog.Status = 'Success';
      else auditLog.Status = 'Failed';

      auditLog.EntityID = entityId;
      auditLog.RecordID = recordId;

      if (authorization) auditLog.AuthorizationID = authorization.ID;

      if (details) auditLog.Details = details;

      if (auditLogDescription) auditLog.Description = auditLogDescription;

      if (await auditLog.Save(saveOptions)) {
        return auditLog;
      }
      else throw new Error(`Error saving audit log record`);
    } catch (err) {
      LogError(err);
      return null;
    }
  }

  protected CheckUserReadPermissions(entityName: string, contextUser: UserInfo) {
    const entityInfo = this.Entities.find((e) => e.Name === entityName);
    if (!contextUser) throw new Error(`contextUser is null`);

    // first check permissions, the logged in user must have read permissions on the entity to run the view
    if (entityInfo) {
      const userPermissions = entityInfo.GetUserPermisions(contextUser);
      if (!userPermissions.CanRead) throw new Error(`User ${contextUser.Email} does not have read permissions on ${entityInfo.Name}`);
    } else throw new Error(`Entity not found in metadata`);
  }

  /**************************************************************************/
  // END ---- IRunViewProvider
  /**************************************************************************/

  /**************************************************************************/
  // START ---- IEntityDataProvider
  /**************************************************************************/
  public get ProviderType(): ProviderType {
    return ProviderType.Database;
  }

  public async GetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<boolean> {
    const id = await this.GetRecordFavoriteID(userId, entityName, CompositeKey, contextUser);
    return id !== null;
  }

  public async GetRecordFavoriteID(userId: string, entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<string | null> {
    try {
      const sSQL = `SELECT ID FROM [${this.MJCoreSchemaName}].vwUserFavorites WHERE UserID='${userId}' AND Entity='${entityName}' AND RecordID='${CompositeKey.Values()}'`;
      const result = await this.ExecuteSQL(sSQL, null, undefined, contextUser);
      if (result && result.length > 0) return result[0].ID;
      else return null;
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  public async SetRecordFavoriteStatus(
    userId: string,
    entityName: string,
    CompositeKey: CompositeKey,
    isFavorite: boolean,
    contextUser: UserInfo,
  ): Promise<void> {
    try {
      const currentFavoriteId = await this.GetRecordFavoriteID(userId, entityName, CompositeKey);
      if ((currentFavoriteId === null && isFavorite === false) || (currentFavoriteId !== null && isFavorite === true)) return; // no change

      // if we're here that means we need to invert the status, which either means creating a record or deleting a record
      const e = this.Entities.find((e) => e.Name === entityName);
      const ufEntity = <MJUserFavoriteEntity>await this.GetEntityObject('MJ: User Favorites', contextUser || this.CurrentUser);
      if (currentFavoriteId !== null) {
        // delete the record since we are setting isFavorite to FALSE
        await ufEntity.Load(currentFavoriteId);
        if (await ufEntity.Delete()) return;
        else throw new Error(`Error deleting user favorite`);
      } else {
        // create the record since we are setting isFavorite to TRUE
        ufEntity.NewRecord();
        ufEntity.Set('EntityID', e.ID);
        ufEntity.Set('RecordID', CompositeKey.Values()); // this is a comma separated list of primary key values, which is fine as the primary key is a string
        ufEntity.Set('UserID', userId);
        if (await ufEntity.Save()) return;
        else throw new Error(`Error saving user favorite`);
      }
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  public async GetRecordChanges(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<RecordChange[]> {
    try {
      const sSQL = `SELECT * FROM [${this.MJCoreSchemaName}].vwRecordChanges WHERE Entity='${entityName}' AND RecordID='${compositeKey.ToConcatenatedString()}' ORDER BY ChangedAt DESC`;
      return this.ExecuteSQL(sSQL, undefined, undefined, contextUser);
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**
   * This function will generate SQL statements for all of the possible soft links that are not traditional foreign keys but exist in entities
   * where there is a column that has the EntityIDFieldName set to a column name (not null). We need to get a list of all such soft link fields across ALL entities
   * and then generate queries for each possible soft link in the same format as the hard links
   * @param entityName
   * @param compositeKey
   */
  protected GetSoftLinkDependencySQL(entityName: string, compositeKey: CompositeKey): string {
    // we need to go through ALL of the entities in the system and find all of the EntityFields that have a non-null EntityIDFieldName
    // for each of these, we generate a SQL Statement that will return the EntityName, RelatedEntityName, FieldName, and the primary key values of the related entity
    let sSQL = '';
    this.Entities.forEach((entity) => {
      // we build a string that will concatenate all of the primary key values into a single string, this is because the primary key could be a composite key
      // we do this in SQL by combining the pirmary key name and value for each row using the default separator defined by the CompositeKey class
      // the output of this should be like the following 'Field1|Value1||Field2|Value2||Field3|Value3' where the || is the CompositeKey.DefaultFieldDelimiter and the | is the CompositeKey.DefaultValueDelimiter
      const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
      const primaryKeySelectString = `CONCAT(${entity.PrimaryKeys.map((pk) => `'${pk.Name}|', CAST(${pk.Name} AS NVARCHAR(MAX))`).join(`,'${CompositeKey.DefaultFieldDelimiter}',`)})`;

      // for this entity, check to see if it has any fields that are soft links, and for each of those, generate the SQL
      entity.Fields.filter((f) => f.EntityIDFieldName && f.EntityIDFieldName.length > 0).forEach((f) => {
        // each field in f must be processed
        if (sSQL.length > 0) sSQL += ' UNION ALL ';

        // there is a layer of indirection here because each ROW in each of the entity records for this entity/field combination could point to a DIFFERENT
        // entity. We find out which entity it is pointed to via the EntityIDFieldName in the field definition, so we have to filter the rows in the entity
        // based on that.
        sSQL += `SELECT
                            '${entityName}' AS EntityName,
                            '${entity.Name}' AS RelatedEntityName,
                            ${primaryKeySelectString} AS PrimaryKeyValue,
                            '${f.Name}' AS FieldName
                        FROM
                            [${entity.SchemaName}].[${entity.BaseView}]
                        WHERE
                            [${f.EntityIDFieldName}] = ${quotes}${entity.ID}${quotes} AND
                            [${f.Name}] = ${quotes}${compositeKey.GetValueByIndex(0)}${quotes}`; // we only use the first primary key value, this is because we don't yet support composite primary keys
      });
    });
    return sSQL;
  }

  protected GetHardLinkDependencySQL(entityDependencies: EntityDependency[], compositeKey: CompositeKey): string {
    let sSQL = '';
    for (const entityDependency of entityDependencies) {
      const entityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === entityDependency.EntityName?.trim().toLowerCase());
      const quotes = entityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : '';
      const relatedEntityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === entityDependency.RelatedEntityName?.trim().toLowerCase());
      const primaryKeySelectString = `CONCAT(${entityInfo.PrimaryKeys.map((pk) => `'${pk.Name}|', CAST(${pk.Name} AS NVARCHAR(MAX))`).join(`,'${CompositeKey.DefaultFieldDelimiter}',`)})`;

      if (sSQL.length > 0) sSQL += ' UNION ALL ';
      sSQL += `SELECT
                        '${entityDependency.EntityName}' AS EntityName,
                        '${entityDependency.RelatedEntityName}' AS RelatedEntityName,
                        ${primaryKeySelectString} AS PrimaryKeyValue,
                        '${entityDependency.FieldName}' AS FieldName
                    FROM
                        [${relatedEntityInfo.SchemaName}].[${relatedEntityInfo.BaseView}]
                    WHERE
                        [${entityDependency.FieldName}] = ${this.GetRecordDependencyLinkSQL(entityDependency, entityInfo, relatedEntityInfo, compositeKey)}`;
    }
    return sSQL;
  }

  /**
   * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
   * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
   * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
   * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
   * @param entityName the name of the entity to check
   * @param KeyValuePairs the primary key(s) to check - only send multiple if you have an entity with a composite primary key
   */
  public async GetRecordDependencies(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<RecordDependency[]> {
    try {
      const recordDependencies: RecordDependency[] = [];

      // first, get the entity dependencies for this entity
      const entityDependencies: EntityDependency[] = await this.GetEntityDependencies(entityName);
      if (entityDependencies.length === 0) {
        // no dependencies, exit early
        return recordDependencies;
      }

      // now, we have to construct a query that will return the dependencies for this record, both hard and soft links
      const sSQL: string = this.GetHardLinkDependencySQL(entityDependencies, compositeKey) + '\n' + this.GetSoftLinkDependencySQL(entityName, compositeKey);

      // now, execute the query
      const result = await this.ExecuteSQL(sSQL, null, undefined, contextUser);
      if (!result || result.length === 0) {
        return recordDependencies;
      }

      // now we go through the results and create the RecordDependency objects
      for (const r of result) {
        const entityInfo: EntityInfo | undefined = this.Entities.find((e) => e.Name.trim().toLowerCase() === r.EntityName?.trim().toLowerCase());
        if (!entityInfo) {
          throw new Error(`Entity ${r.EntityName} not found in metadata`);
        }

        // future, if we support foreign keys that are composite keys, we'll need to enable this code
        // const pkeyValues: KeyValuePair[] = [];
        // entityInfo.PrimaryKeys.forEach((pk) => {
        //     pkeyValues.push({FieldName: pk.Name, Value: r[pk.Name]}) // add all of the primary keys, which often is as simple as just "ID", but this is generic way to do it
        // })

        const compositeKey: CompositeKey = new CompositeKey();
        // the row r will have a PrimaryKeyValue field that is a string that is a concatenation of the primary key field names and values
        // we need to parse that out so that we can then pass it to the CompositeKey object
        const pkeys = {};
        const keyValues = r.PrimaryKeyValue.split(CompositeKey.DefaultFieldDelimiter);
        keyValues.forEach((kv) => {
          const parts = kv.split(CompositeKey.DefaultValueDelimiter);
          pkeys[parts[0]] = parts[1];
        });
        compositeKey.LoadFromEntityInfoAndRecord(entityInfo, pkeys);

        const recordDependency: RecordDependency = {
          EntityName: r.EntityName,
          RelatedEntityName: r.RelatedEntityName,
          FieldName: r.FieldName,
          PrimaryKey: compositeKey,
        };

        recordDependencies.push(recordDependency);
      }
      return recordDependencies;
    } catch (e) {
      // log and throw
      LogError(e);
      throw e;
    }
  }

  protected GetRecordDependencyLinkSQL(dep: EntityDependency, entity: EntityInfo, relatedEntity: EntityInfo, CompositeKey: CompositeKey): string {
    const f = relatedEntity.Fields.find((f) => f.Name.trim().toLowerCase() === dep.FieldName?.trim().toLowerCase());
    const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
    if (!f) {
      throw new Error(`Field ${dep.FieldName} not found in Entity ${relatedEntity.Name}`);
    }

    if (f.RelatedEntityFieldName?.trim().toLowerCase() === 'id') {
      // simple link to first primary key, most common scenario for linkages
      return `${quotes}${CompositeKey.GetValueByIndex(0)}${quotes}`;
    } else {
      // linking to something else, so we need to use that field in a sub-query
      // NOTICE - we are only using the FIRST primary key in our current implementation, this is because we don't yet support composite foreign keys
      // if we do start to support composite foreign keys, we'll need to update this code to handle that
      return `(SELECT ${f.RelatedEntityFieldName} FROM [${entity.SchemaName}].${entity.BaseView} WHERE ${entity.FirstPrimaryKey.Name}=${quotes}${CompositeKey.GetValueByIndex(0)}${quotes})`;
    }
  }

  public async GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {
    if (!contextUser) {
      throw new Error('User context is required to get record duplicates.');
    }

    const listEntity: MJListEntity = await this.GetEntityObject<MJListEntity>('MJ: Lists');
    listEntity.ContextCurrentUser = contextUser;
    const success = await listEntity.Load(params.ListID);
    if (!success) {
      throw new Error(`List with ID ${params.ListID} not found.`);
    }

    const duplicateRun: MJDuplicateRunEntity = await this.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs');
    duplicateRun.NewRecord();
    duplicateRun.EntityID = params.EntityID;
    duplicateRun.StartedByUserID = contextUser.ID;
    duplicateRun.StartedAt = new Date();
    duplicateRun.ProcessingStatus = 'In Progress';
    duplicateRun.ApprovalStatus = 'Pending';
    duplicateRun.SourceListID = listEntity.ID;
    duplicateRun.ContextCurrentUser = contextUser;

    const saveResult = await duplicateRun.Save();
    if (!saveResult) {
      throw new Error(`Failed to save Duplicate Run Entity`);
    }

    const response: PotentialDuplicateResponse = {
      Status: 'Inprogress',
      PotentialDuplicateResult: [],
    };

    return response;
  }

  public async MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, options?: EntityMergeOptions): Promise<RecordMergeResult> {
    const e = this.Entities.find((e) => e.Name.trim().toLowerCase() === request.EntityName.trim().toLowerCase());
    if (!e || !e.AllowRecordMerge)
      throw new Error(`Entity ${request.EntityName} does not allow record merging, check the AllowRecordMerge property in the entity metadata`);

    const result: RecordMergeResult = {
      Success: false,
      RecordMergeLogID: null,
      RecordStatus: [],
      Request: request,
      OverallStatus: null,
    };
    const mergeRecordLog: MJRecordMergeLogEntity = await this.StartMergeLogging(request, result, contextUser);
    try {
      /*
                we will follow this process...
                * 1. Begin Transaction
                * 2. The surviving record is loaded and fields are updated from the field map, if provided, and the record is saved. If a FieldMap not provided within the request object, this step is skipped.
                * 3. For each of the records that will be merged INTO the surviving record, we call the GetEntityDependencies() method and get a list of all other records in the database are linked to the record to be deleted. We then go through each of those dependencies and update the link to point to the SurvivingRecordID and save the record.
                * 4. The record to be deleted is then deleted.
                * 5. Commit or Rollback Transaction
             */

      // Step 1 - begin transaction
      await this.BeginTransaction();

      // Step 2 - update the surviving record, but only do this if we were provided a field map
      if (request.FieldMap && request.FieldMap.length > 0) {
        const survivor: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser);
        await survivor.InnerLoad(request.SurvivingRecordCompositeKey);
        for (const fieldMap of request.FieldMap) {
          survivor.Set(fieldMap.FieldName, fieldMap.Value);
        }
        if (!(await survivor.Save())) {
          result.OverallStatus = 'Error saving survivor record with values from provided field map.';
          throw new Error(result.OverallStatus);
        }
      }

      // Step 3 - update the dependencies for each of the records we will delete
      for (const pksToDelete of request.RecordsToMerge) {
        const newRecStatus: RecordMergeDetailResult = {
          CompositeKey: pksToDelete,
          Success: false,
          RecordMergeDeletionLogID: null,
          Message: null,
        };
        result.RecordStatus.push(newRecStatus);
        const dependencies = await this.GetRecordDependencies(request.EntityName, pksToDelete);
        // now, loop through the dependencies and update the link to point to the surviving record
        for (const dependency of dependencies) {
          const reInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === dependency.RelatedEntityName.trim().toLowerCase());
          const relatedEntity: BaseEntity = await this.GetEntityObject(dependency.RelatedEntityName, contextUser);
          await relatedEntity.InnerLoad(dependency.PrimaryKey);
          relatedEntity.Set(dependency.FieldName, request.SurvivingRecordCompositeKey.GetValueByIndex(0)); // only support single field foreign keys for now
          /*
                    if we later support composite foreign keys, we'll need to do this instead, at the moment this code will break as dependency.KeyValuePair is a single value, not an array

                    for (let pkv of dependency.KeyValuePairs) {
                        relatedEntity.Set(dependency.FieldName, pkv.Value);
                    }
                     */
          if (!(await relatedEntity.Save())) {
            newRecStatus.Success = false;
            newRecStatus.Message = `Error updating dependency record ${dependency.PrimaryKey.ToString} for entity ${dependency.RelatedEntityName} to point to surviving record ${request.SurvivingRecordCompositeKey.ToString()}`;
            throw new Error(newRecStatus.Message);
          }
        }
        // if we get here, that means that all of the dependencies were updated successfully, so we can now delete the records to be merged
        const recordToDelete: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser);
        await recordToDelete.InnerLoad(pksToDelete);
        if (!(await recordToDelete.Delete())) {
          newRecStatus.Message = `Error deleting record ${pksToDelete.ToString()} for entity ${request.EntityName}`;
          throw new Error(newRecStatus.Message);
        } else newRecStatus.Success = true;
      }

      result.Success = true;
      await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);

      // Step 5 - commit transaction
      await this.CommitTransaction();

      result.Success = true;

      return result;
    } catch (e) {
      LogError(e);

      await this.RollbackTransaction();
      // attempt to persist the status to the DB, although that might fail
      await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);
      throw e;
    }
  }

  protected async StartMergeLogging(request: RecordMergeRequest, result: RecordMergeResult, contextUser: UserInfo): Promise<MJRecordMergeLogEntity> {
    try {
      // create records in the Record Merge Logs entity and Record Merge Deletion Logs entity
      const recordMergeLog = <MJRecordMergeLogEntity>await this.GetEntityObject('MJ: Record Merge Logs', contextUser);
      const entity = this.Entities.find((e) => e.Name === request.EntityName);
      if (!entity) throw new Error(`Entity ${result.Request.EntityName} not found in metadata`);
      if (!contextUser && !this.CurrentUser) throw new Error(`contextUser is null and no CurrentUser is set`);

      recordMergeLog.NewRecord();
      recordMergeLog.EntityID = entity.ID;
      recordMergeLog.SurvivingRecordID = request.SurvivingRecordCompositeKey.Values(); // this would join together all of the primary key values, which is fine as the primary key is a string
      recordMergeLog.InitiatedByUserID = contextUser ? contextUser.ID : this.CurrentUser?.ID;
      recordMergeLog.ApprovalStatus = 'Approved';
      recordMergeLog.ApprovedByUserID = contextUser ? contextUser.ID : this.CurrentUser?.ID;
      recordMergeLog.ProcessingStatus = 'Started';
      recordMergeLog.ProcessingStartedAt = new Date();
      if (await recordMergeLog.Save()) {
        result.RecordMergeLogID = recordMergeLog.ID;
        return recordMergeLog;
      } else throw new Error(`Error saving record merge log`);
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  protected async CompleteMergeLogging(recordMergeLog: MJRecordMergeLogEntity, result: RecordMergeResult, contextUser?: UserInfo) {
    try {
      // create records in the Record Merge Logs entity and Record Merge Deletion Logs entity
      if (!contextUser && !this.CurrentUser) throw new Error(`contextUser is null and no CurrentUser is set`);

      recordMergeLog.ProcessingStatus = result.Success ? 'Complete' : 'Error';
      recordMergeLog.ProcessingEndedAt = new Date();
      if (!result.Success)
        // only create the log record if the merge failed, otherwise it is wasted space
        recordMergeLog.ProcessingLog = result.OverallStatus;
      if (await recordMergeLog.Save()) {
        // top level saved, now let's create the deletion detail records for each of the records that were merged
        for (const d of result.RecordStatus) {
          const recordMergeDeletionLog = <MJRecordMergeDeletionLogEntity>await this.GetEntityObject('MJ: Record Merge Deletion Logs', contextUser);
          recordMergeDeletionLog.NewRecord();
          recordMergeDeletionLog.RecordMergeLogID = recordMergeLog.ID;
          recordMergeDeletionLog.DeletedRecordID = d.CompositeKey.Values(); // this would join together all of the primary key values, which is fine as the primary key is a string
          recordMergeDeletionLog.Status = d.Success ? 'Complete' : 'Error';
          recordMergeDeletionLog.ProcessingLog = d.Success ? null : d.Message; // only save the message if it failed
          if (!(await recordMergeDeletionLog.Save())) throw new Error(`Error saving record merge deletion log`);
        }
      } else throw new Error(`Error saving record merge log`);
    } catch (e) {
      // do nothing here because we often will get here since some conditions lead to no DB updates possible...
      LogError(e);
      // don't bubble up the error here as we're sometimes already in an exception block in caller
    }
  }

  /**
   * Generates the SQL Statement that will Save a record to the database.
   *
   * This method is used by the Save() method of this class, but it is marked as public because
   * it is also used by the SQLServerTransactionGroup to regenerate Save SQL if any values were
   * changed by the transaction group due to transaction variables being set into the object.
   *
   * @param entity - The entity to generate save SQL for
   * @param bNewRecord - Whether this is a new record (create) or existing record (update)
   * @param spName - The stored procedure name to call
   * @param user - The user context for the operation
   * @returns The full SQL statement for the save operation
   *
   * @security This method handles field-level encryption transparently.
   *           Fields marked with Encrypt=true will have their values encrypted
   *           before being included in the SQL statement.
   */
  public async GetSaveSQL(entity: BaseEntity, bNewRecord: boolean, spName: string, user: UserInfo): Promise<string> {
    const result = await this.GetSaveSQLWithDetails(entity, bNewRecord, spName, user);
    return result.fullSQL;
  }

  /**
   * This function generates both the full SQL (with record change metadata) and the simple stored procedure call
   * @returns Object with fullSQL and simpleSQL properties
   *
   * @security This method handles field-level encryption transparently.
   *           Fields marked with Encrypt=true will have their values encrypted
   *           before being included in the SQL statement.
   */
  private async GetSaveSQLWithDetails(entity: BaseEntity, bNewRecord: boolean, spName: string, user: UserInfo): Promise<{ fullSQL: string; simpleSQL: string; overlappingChangeData?: { changesJSON: string; changesDescription: string } }> {
    // Generate the stored procedure parameters - now returns an object with structured SQL
    // This is async because it may need to encrypt field values
    const spParams = await this.generateSPParams(entity, !bNewRecord, user);
    
    // Build the simple SQL - use the new DECLARE/SET/EXEC pattern
    let sSimpleSQL: string;
    const execSQL = `EXEC [${entity.EntityInfo.SchemaName}].${spName} ${spParams.execParams}`;
    if (spParams.variablesSQL) {
      sSimpleSQL = `${spParams.variablesSQL}\n\n${spParams.setSQL}\n\n${execSQL}`;
    } else {
      sSimpleSQL = execSQL;
    }
    
    const recordChangesEntityInfo = this.Entities.find((e) => e.Name === 'MJ: Record Changes');
    let sSQL: string = '';
    let overlappingChangeData: { changesJSON: string; changesDescription: string } | undefined;
    if (entity.EntityInfo.TrackRecordChanges && entity.EntityInfo.Name.trim().toLowerCase() !== 'record changes') {
      // don't track changes for the record changes entity
      let oldData = null;
      // use SQL Server CONCAT function to combine all of the primary key values and then combine them together
      // using the default field delimiter and default value delimiter as defined in the CompositeKey class
      const concatPKIDString = `CONCAT(${entity.EntityInfo.PrimaryKeys.map((pk) => `'${pk.CodeName}','${CompositeKey.DefaultValueDelimiter}',${pk.Name}`).join(`,'${CompositeKey.DefaultFieldDelimiter}',`)})`;

      if (!bNewRecord) oldData = entity.GetAll(true); // get all the OLD values, only do for existing records, for new records, not relevant

      // Capture the diff for overlapping subtype Record Change propagation.
      // Must happen before finalizeSave() resets OldValues, since the diff would be lost.
      // Returned to Save() which handles propagation — this is a backend-only concern.
      const newData = entity.GetAll(false);
      if (!bNewRecord && oldData) {
        const diffChanges = this.DiffObjects(oldData, newData, entity.EntityInfo, "'");
        const diffKeys = diffChanges ? Object.keys(diffChanges) : [];
        if (diffKeys.length > 0) {
          overlappingChangeData = {
            changesJSON: JSON.stringify(diffChanges),
            changesDescription: this.CreateUserDescriptionOfChanges(diffChanges)
          };
        }
      }

      const logRecordChangeSQL = this.GetLogRecordChangeSQL(newData, oldData, entity.EntityInfo.Name, '@ID', entity.EntityInfo, bNewRecord ? 'Create' : 'Update', user, false);
      if (logRecordChangeSQL === null) {
        // if we don't have any record changes to log, just return the simple SQL to run which will do nothing but update __mj_UpdatedAt
        // this can happen if a subclass overrides the Dirty() flag to make the object dirty due to factors outside of the
        // array of fields that are directly stored in the DB and we need to respect that but this will blow up if we try
        // to log record changes when there are none, so we just return the simple SQL to run
        sSQL = sSimpleSQL; 
      }
      else {
        // For complex case with record change tracking, we need to insert DECLARE statements at the top
        const execSQL = `EXEC [${entity.EntityInfo.SchemaName}].${spName} ${spParams.execParams}`;
        sSQL = `
                    ${spParams.variablesSQL}
                    
                    DECLARE @ResultTable TABLE (
                        ${this.getAllEntityColumnsSQL(entity.EntityInfo)}
                    );

                    ${spParams.setSQL}

                    INSERT INTO @ResultTable
                    ${execSQL};

                    DECLARE @ID NVARCHAR(MAX);
                    
                    SELECT @ID = ${concatPKIDString} FROM @ResultTable;
                    
                    IF @ID IS NOT NULL
                    BEGIN
                        DECLARE @ResultChangesTable TABLE (
                            ${this.getAllEntityColumnsSQL(recordChangesEntityInfo)}
                        );

                        INSERT INTO @ResultChangesTable
                        ${logRecordChangeSQL};
                    END;

                    SELECT * FROM @ResultTable;`; // NOTE - in the above, we call the T-SQL variable @ID for simplicity just as a variable name, even though for each entity the pkey could be something else. Entity pkeys are not always a field called ID could be something else including composite keys.
      }
    } else {
      // not doing track changes for this entity, keep it simple
      sSQL = sSimpleSQL;
    }
    return { fullSQL: sSQL, simpleSQL: sSimpleSQL, overlappingChangeData };
  }

  /**
   * Gets AI actions configured for an entity based on trigger timing
   * 
   * @param entityInfo - The entity to get AI actions for
   * @param before - True to get before-save actions, false for after-save
   * @returns Array of AI action entities
   * @internal
   */
  protected GetEntityAIActions(entityInfo: EntityInfo, before: boolean): MJEntityAIActionEntity[] {
    return AIEngine.Instance.EntityAIActions.filter(
      (a) => a.EntityID === entityInfo.ID && a.TriggerEvent.toLowerCase().trim() === (before ? 'before save' : 'after save'),
    );
  }

  /**
   * Handles entity actions (non-AI) for save, delete, or validate operations
   * 
   * @param entity - The entity being operated on
   * @param baseType - The type of operation
   * @param before - Whether this is before or after the operation
   * @param user - The user performing the operation
   * @returns Array of action results
   * @internal
   */
  protected async HandleEntityActions(entity: BaseEntity, baseType: 'save' | 'delete' | 'validate', before: boolean, user: UserInfo): Promise<ActionResult[]> {
    // use the EntityActionEngine for this
    try {
      const engine = EntityActionEngineServer.Instance;
      await engine.Config(false, user);
      const newRecord = entity.IsSaved ? false : true;
      const baseTypeType = baseType === 'save' ? (newRecord ? 'Create' : 'Update') : 'Delete';
      const invocationType = baseType === 'validate' ? 'Validate' : before ? 'Before' + baseTypeType : 'After' + baseTypeType;
      const invocationTypeEntity = engine.InvocationTypes.find((i) => i.Name === invocationType);
      if (!invocationTypeEntity) {
        LogError(`Invocation Type ${invocationType} not found in metadata`);
        return [];
        //            throw new Error(`Invocation Type ${invocationType} not found in metadata`);
      }

      const activeActions = engine.GetActionsByEntityNameAndInvocationType(entity.EntityInfo.Name, invocationType, 'Active');
      const results: ActionResult[] = [];
      for (const a of activeActions) {
        const result = await engine.RunEntityAction({
          EntityAction: a,
          EntityObject: entity,
          InvocationType: invocationTypeEntity,
          ContextUser: user,
        });
        results.push(result);
      }
      return results;
    } catch (e) {
      LogError(e);
      return [];
    }
  }

  /**
   * Handles Entity AI Actions. Parameters are setup for a future support of delete actions, but currently that isn't supported so the baseType parameter
   * isn't fully functional. If you pass in delete, the function will just exit for now, and in the future calling code will start working when we support
   * Delete as a trigger event for Entity AI Actions...
   * @param entity
   * @param baseType
   * @param before
   * @param user
   */
  protected async HandleEntityAIActions(entity: BaseEntity, baseType: 'save' | 'delete', before: boolean, user: UserInfo) {
    try {
      // TEMP while we don't support delete
      if (baseType === 'delete') return;

      // Make sure AI Metadata is loaded here...
      await AIEngine.Instance.Config(false, user);

      const actions = this.GetEntityAIActions(entity.EntityInfo, before); // get the actions we need to do for this entity
      if (actions && actions.length > 0) {
        const ai = AIEngine.Instance;
        for (let i = 0; i < actions.length; i++) {
          const a = actions[i];
          if ((a.TriggerEvent === 'before save' && before) || (a.TriggerEvent === 'after save' && !before)) {
            const p: EntityAIActionParams = {
              entityAIActionId: a.ID,
              entityRecord: entity,
              actionId: a.AIActionID,
              modelId: a.AIModelID,
            };
            if (before) {
              // do it with await so we're blocking, as it needs to complete before the record save continues
              await ai.ExecuteEntityAIAction(p);
            } else {
              // just add a task and move on, we are doing 'after save' so we don't wait
              try {
                if (this.isTransactionActive) {
                  // Defer the task until after the transaction completes
                  this._deferredTasks.push({ type: 'Entity AI Action', data: p, options: null, user });
                } else {
                  // No transaction active, add the task immediately
                  QueueManager.AddTask('Entity AI Action', p, null, user);
                }
              } catch (e) {
                LogError(e.message);
              }
            }
          }
        }
      }
    } catch (e) {
      LogError(e);
    }
  }

  public async Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions): Promise<{}> {
    const entityResult = new BaseEntityResult();
    try {
      entity.RegisterTransactionPreprocessing();

      const bNewRecord = !entity.IsSaved;
      if (!options) options = new EntitySaveOptions();
      const bReplay = !!options.ReplayOnly;
      if (!bReplay && !bNewRecord && !entity.EntityInfo.AllowUpdateAPI) {
        // existing record and not allowed to update
        throw new Error(`UPDATE not allowed for entity ${entity.EntityInfo.Name}`);
      } else if (!bReplay && bNewRecord && !entity.EntityInfo.AllowCreateAPI) {
        // new record and not allowed to create
        throw new Error(`CREATE not allowed for entity ${entity.EntityInfo.Name}`);
      } else {
        // getting here means we are good to save, now check to see if we're dirty and need to save
        // REMEMBER - this is the provider and the BaseEntity/subclasses handle user-level permission checking already, we just make sure API was turned on for the operation
        if (entity.Dirty || options.IgnoreDirtyState || options.ReplayOnly) {
          entityResult.StartedAt = new Date();
          entityResult.Type = bNewRecord ? 'create' : 'update';

          entityResult.OriginalValues = entity.Fields.map((f) => {
            const tempStatus = f.ActiveStatusAssertions;
            f.ActiveStatusAssertions = false; // turn off warnings for this operation
            const ret = { 
              FieldName: f.Name, 
              Value: f.Value 
            };
            f.ActiveStatusAssertions = tempStatus; // restore the status assertions
            return ret;
          }); // save the original values before we start the process
          entity.ResultHistory.push(entityResult); // push the new result as we have started a process

          // The assumption is that Validate() has already been called by the BaseEntity object that is invoking this provider.
          // However, we have an extra responsibility in this situation which is to fire off the EntityActions for the Validate invocation type and
          // make sure they clear. If they don't clear we throw an exception with the message provided.
          if (!bReplay) {
            const validationResult = await this.HandleEntityActions(entity, 'validate', false, user);
            if (validationResult && validationResult.length > 0) {
              // one or more actions executed, see the reults and if any failed, concat their messages and return as exception being thrown
              const message = validationResult
                .filter((v) => !v.Success)
                .map((v) => v.Message)
                .join('\n\n');
              if (message) {
                entityResult.Success = false;
                entityResult.EndedAt = new Date();
                entityResult.Message = message;
                return false;
              }
            }
          } else {
            // we are in replay mode we so do NOT need to do the validation stuff, skipping it...
          }

          const spName = this.GetCreateUpdateSPName(entity, bNewRecord);
          if (options.SkipEntityActions !== true /*options set, but not set to skip entity actions*/) {
            await this.HandleEntityActions(entity, 'save', true, user);
          }

          if (options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/) {
            // process any Entity AI actions that are set to trigger BEFORE the save, these are generally a really bad idea to do before save
            // but they are supported (for now)
            await this.HandleEntityAIActions(entity, 'save', true, user);
          }

          // Generate the SQL for the save operation
          // This is async because it may need to encrypt field values
          const sqlDetails = await this.GetSaveSQLWithDetails(entity, bNewRecord, spName, user);
          const sSQL = sqlDetails.fullSQL;

          if (entity.TransactionGroup && !bReplay /*we never participate in a transaction if we're in replay mode*/) {
            // we have a transaction group, need to play nice and be part of it
            entity.RaiseReadyForTransaction(); // let the entity know we're ready to be part of the transaction
            // we are part of a transaction group, so just add our query to the list
            // and when the transaction is committed, we will send all the queries at once
            this._bAllowRefresh = false; // stop refreshes of metadata while we're doing work
            entity.TransactionGroup.AddTransaction(
              new TransactionItem(
                entity,
                entityResult.Type === 'create' ? 'Create' : 'Update',
                sSQL,
                null,
                { 
                  dataSource: this._pool,
                  simpleSQLFallback: entity.EntityInfo.TrackRecordChanges ? sqlDetails.simpleSQL : undefined,
                  entityName: entity.EntityInfo.Name
                },
                (transactionResult: Record<string, any>, success: boolean) => {
                  // we get here whenever the transaction group does gets around to committing
                  // our query.
                  this._bAllowRefresh = true; // allow refreshes again
                  entityResult.EndedAt = new Date();
                  if (success && transactionResult) {
                    // process any Entity AI actions that are set to trigger AFTER the save
                    // these are fired off but are NOT part of the transaction group, so if they fail,
                    // the transaction group will still commit, but the AI action will not be executed
                    if (options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/) {
                      this.HandleEntityAIActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY
                    }

                    // Same approach to Entity Actions as Entity AI Actions
                    if (options.SkipEntityActions !== true) {
                      this.HandleEntityActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY
                    }

                    entityResult.Success = true;
                    entityResult.NewValues = this.MapTransactionResultToNewValues(transactionResult);
                  } else {
                    // the transaction failed, nothing to update, but we need to call Reject so the
                    // promise resolves with a rejection so our outer caller knows
                    entityResult.Success = false;
                    entityResult.Message = 'Transaction Failed';
                  }
                },
              ),
            );

            return true; // we're part of a transaction group, so we're done here
          } else {
            // no transaction group, just execute this immediately...
            this._bAllowRefresh = false; // stop refreshes of metadata while we're doing work

            let result;
            if (bReplay) {
              result = [entity.GetAll()]; // just return the entity as it was before the save as we are NOT saving anything as we are in replay mode
            } else {
              try {
                // Execute SQL with optional simple SQL fallback for loggers
                // IS-A: use entity's ProviderTransaction when available for shared transaction
                const rawResult = await this.ExecuteSQL(sSQL, null, {
                  isMutation: true,
                  description: `Save ${entity.EntityInfo.Name}`,
                  simpleSQLFallback: entity.EntityInfo.TrackRecordChanges ? sqlDetails.simpleSQL : undefined,
                  connectionSource: entity.ProviderTransaction as sql.Transaction ?? undefined
                }, user);
                // Process rows with user context for decryption
                result = await this.ProcessEntityRows(rawResult, entity.EntityInfo, user);
              } catch (e) {
                throw e; // rethrow
              }
            }

            this._bAllowRefresh = true; // allow refreshes now

            entityResult.EndedAt = new Date();
            if (result && result.length > 0) {
              // Entity AI Actions - fired off async, NO await on purpose
              if (options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/)
                this.HandleEntityAIActions(entity, 'save', false, user); // fire off any AFTER SAVE AI actions, but don't wait for them

              // Entity Actions - fired off async, NO await on purpose
              if (options.SkipEntityActions !== true) this.HandleEntityActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY

              entityResult.Success = true;

              // IS-A overlapping subtypes: propagate Record Change entries to sibling branches.
              // Runs after this entity's save succeeds. Skips the active child branch (if this
              // is a parent save in a chain) so siblings don't get duplicate entries.
              if (sqlDetails.overlappingChangeData
                  && entity.EntityInfo.AllowMultipleSubtypes
                  && entity.EntityInfo.TrackRecordChanges) {
                await this.PropagateRecordChangesToSiblings(
                  entity.EntityInfo,
                  sqlDetails.overlappingChangeData,
                  entity.PrimaryKey.Values(),
                  user?.ID ?? '',
                  options.ISAActiveChildEntityName,
                  entity.ProviderTransaction as sql.Transaction ?? undefined
                );
              }

              return result[0];
            } else {
              if (bNewRecord) {
                throw new Error(`SQL Error: Error creating new record, no rows returned from SQL: ` + sSQL);
              }
              else {
                // if we get here that means that SQL did NOT find a matching row to update in the DB, so we need to throw an error
                throw new Error(`SQL Error: Error updating record, no MATCHING rows found within the database: ` + sSQL);
              }
            }
          }
        } else {
          return entity; // nothing to save, just return the entity
        }
      }
    } catch (e) {
      this._bAllowRefresh = true; // allow refreshes again if we get a failure here
      entityResult.EndedAt = new Date();
      entityResult.Message = e.message;
      LogError(e);

      throw e; // rethrow the error
    }
  }

  protected MapTransactionResultToNewValues(transactionResult: Record<string, any>): { FieldName: string; Value: any }[] {
    return Object.keys(transactionResult).map((k) => {
      return {
        FieldName: k,
        Value: transactionResult[k],
      };
    }); // transform the result into a list of field/value pairs
  }

  /**
   * Returns the stored procedure name to use for the given entity based on if it is a new record or an existing record.
   * @param entity
   * @param bNewRecord
   * @returns
   */
  public GetCreateUpdateSPName(entity: BaseEntity, bNewRecord: boolean): string {
    const spName = bNewRecord
      ? entity.EntityInfo.spCreate?.length > 0
        ? entity.EntityInfo.spCreate
        : 'spCreate' + entity.EntityInfo.BaseTableCodeName
      : entity.EntityInfo.spUpdate?.length > 0
        ? entity.EntityInfo.spUpdate
        : 'spUpdate' + entity.EntityInfo.BaseTableCodeName;
    return spName;
  }

  private getAllEntityColumnsSQL(entityInfo: EntityInfo): string {
    let sRet: string = '',
      outputCount: number = 0;
    for (let i = 0; i < entityInfo.Fields.length; i++) {
      const f = entityInfo.Fields[i];
      if (outputCount !== 0) sRet += ',\n';
      sRet += '[' + f.Name + '] ' + f.SQLFullType + ' ' + (f.AllowsNull || f.IsVirtual ? 'NULL' : 'NOT NULL');
      outputCount++;
    }
    return sRet;
  }

  /**
   * Generates the stored procedure parameters for a save operation.
   *
   * This method handles:
   * - Value type conversions (datetimeoffset, uniqueidentifier, etc.)
   * - Field-level encryption for fields marked with Encrypt=true
   * - Primary key handling for create/update operations
   *
   * @param entity - The entity being saved
   * @param isUpdate - Whether this is an update (true) or create (false) operation
   * @param contextUser - The user context for encryption operations
   * @returns An object containing the SQL components for the stored procedure call
   *
   * @security Fields with Encrypt=true are encrypted before being sent to the database.
   *           Encryption uses the key specified in EncryptionKeyID.
   */
  private async generateSPParams(
    entity: BaseEntity,
    isUpdate: boolean,
    contextUser?: UserInfo
  ): Promise<{ variablesSQL: string; setSQL: string; execParams: string; simpleParams: string }> {
    // Generate a unique suffix for variable names to avoid collisions in batch scripts
    const uniqueSuffix = '_' + uuidv4().substring(0, 8).replace(/-/g, '');

    const declarations: string[] = [];
    const setStatements: string[] = [];
    const execParams: string[] = [];
    let simpleParams: string = '';
    let bFirst: boolean = true;

    // Get the encryption engine instance (lazy - only used if needed)
    let encryptionEngine: EncryptionEngine | null = null;

    for (let i = 0; i < entity.EntityInfo.Fields.length; i++) {
      const f = entity.EntityInfo.Fields[i];
      // For CREATE operations, include primary keys that are not auto-increment and have actual values
      const includePrimaryKeyForCreate = !isUpdate && f.IsPrimaryKey && !f.AutoIncrement && entity.Get(f.Name) !== null && entity.Get(f.Name) !== undefined;

      if (f.AllowUpdateAPI || includePrimaryKeyForCreate) {
        if (!f.SkipValidation || includePrimaryKeyForCreate) {
          // DO NOT INCLUDE any fields where we skip validation, these are fields that are not editable by the user/object
          // model/api because they're special fields like ID, CreatedAt, etc. or they're virtual or auto-increment, etc.
          // EXCEPTION: Include primary keys for CREATE when they have values and are not auto-increment

          const theField = entity.Fields.find((field) => field.Name.trim().toLowerCase() === f.Name.trim().toLowerCase());
          const tempStatus = theField.ActiveStatusAssertions;
          theField.ActiveStatusAssertions = false; // turn off warnings for this operation
          let value = theField.Value;// entity.Get(f.Name);
          theField.ActiveStatusAssertions = tempStatus; // restore the status assertions

          if (value && f.Type.trim().toLowerCase() === 'datetimeoffset') {
            // for non-null datetimeoffset fields, we need to convert the value to ISO format
            value = new Date(value).toISOString();
          } else if (!isUpdate && f.Type.trim().toLowerCase() === 'uniqueidentifier' && !includePrimaryKeyForCreate) {
            // in the case of unique identifiers, for CREATE procs only,
            // we need to check to see if the value we have in the entity object is a function like newid() or newsquentialid()
            // in those cases we should just skip the parameter entirely because that means there is a default value that should be used
            // and that will be handled by the database not by us
            // instead of just checking for specific functions like newid(), we can instead check for any string that includes ()
            // this way we can handle any function that the database might support in the future
            // EXCEPTION: Don't skip if we're including a primary key for create
            if (typeof value === 'string' && value.includes('()')) {
              continue; // skip this field entirely by going to the next iteration of the loop
            }
          }

          // ========================================================================
          // FIELD-LEVEL ENCRYPTION
          // If the field is marked for encryption and has a non-null value,
          // encrypt it before storing in the database.
          // ========================================================================
          if (f.Encrypt && f.EncryptionKeyID && value !== null && value !== undefined) {
            // Lazy-load encryption engine only when needed
            if (!encryptionEngine) {
              encryptionEngine = EncryptionEngine.Instance;
              await encryptionEngine.Config(false, contextUser);
            }

            // Only encrypt if the value is not already encrypted
            // This handles cases where values may already be encrypted (e.g., re-save scenarios)
            const keyMarker = encryptionEngine.GetKeyByID(f.EncryptionKeyID)?.Marker;
            if (!encryptionEngine.IsEncrypted(value, keyMarker)) {
              try {
                // Convert value to string for encryption if it isn't already
                const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                value = await encryptionEngine.Encrypt(stringValue, f.EncryptionKeyID, contextUser);
              } catch (encryptError) {
                // Log the error but throw to prevent unencrypted storage
                // SECURITY: Never store unencrypted data in an encrypted field
                const message = encryptError instanceof Error ? encryptError.message : String(encryptError);
                throw new Error(
                  `Failed to encrypt field "${f.Name}" on entity "${entity.EntityInfo.Name}": ${message}. ` +
                  'The save operation has been aborted to prevent storing unencrypted sensitive data.'
                );
              }
            }
          }
          // ========================================================================

          // Generate variable name with unique suffix
          const varName = `@${f.CodeName}${uniqueSuffix}`;

          // Add declaration with proper SQL type using existing SQLFullType property
          declarations.push(`${varName} ${f.SQLFullType.toUpperCase()}`);

          // Add SET statement if value is not null (SQL variables default to NULL)
          if (value !== null && value !== undefined) {
            const setValueSQL = this.generateSetStatementValue(f, value);
            setStatements.push(`SET ${varName} = ${setValueSQL}`);
          }

          // Add to EXEC parameters
          execParams.push(`@${f.CodeName}=${varName}`);

          // Also build the old-style simple params for backward compatibility
          simpleParams += this.generateSingleSPParam(f, value, bFirst);
          bFirst = false;
        }
      }
    }
    if (isUpdate && execParams.length > 0) {
      // this is an update and we have other fields, so we need to add all of the pkeys to the end of the SP call
      for (const pkey of entity.PrimaryKey.KeyValuePairs) {
        const f = entity.EntityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === pkey.FieldName.trim().toLowerCase());
        const varName = `@${f.CodeName}${uniqueSuffix}`;
        
        // Add declaration using existing SQLFullType property
        declarations.push(`${varName} ${f.SQLFullType.toUpperCase()}`);
        
        // Add SET statement
        const setValueSQL = this.generateSetStatementValue(f, pkey.Value);
        setStatements.push(`SET ${varName} = ${setValueSQL}`);
        
        // Add to EXEC parameters
        execParams.push(`@${f.CodeName}=${varName}`);
        
        // Also add to simple params
        const pkeyQuotes = f.NeedsQuotes ? "'" : '';
        simpleParams += `, @${f.CodeName} = ` + pkeyQuotes + pkey.Value + pkeyQuotes; // add pkey to update SP at end, but only if other fields included
      }
      bFirst = false;
    }

    // Return the structured result with all components
    return {
      variablesSQL: declarations.length > 0 ? `DECLARE ${declarations.join(',\n        ')}` : '',
      setSQL: setStatements.join('\n'),
      execParams: execParams.join(',\n                '),
      simpleParams: simpleParams
    };
  }

  /**
   * Generates the value portion of a SET statement for a field
   * @param f The field info
   * @param value The value to set
   * @returns SQL value string
   */
  private generateSetStatementValue(f: EntityFieldInfo, value: any): string {
    let val: any = value;
    
    switch (f.TSType) {
      case EntityFieldTSType.Boolean:
        // check to see if the value is a string and if it is equal to true, if so, set the value to 1
        if (typeof value === 'string' && value.trim().toLowerCase() === 'true') val = 1;
        else if (typeof value === 'string' && value.trim().toLowerCase() === 'false') val = 0;
        else val = value ? 1 : 0;
        return val.toString();
        
      case EntityFieldTSType.String:
        // Handle string escaping for SET statements
        if (typeof val === 'string') {
          val = val.replace(/'/g, "''");
        }
        else if (typeof val === 'object' && val !== null) {
          // stringify the value
          val = JSON.stringify(val);
          // escape it
          val = val.replace(/'/g, "''");
        }
        return `${f.UnicodePrefix}'${val}'`;
        
      case EntityFieldTSType.Date:
        if (val !== null && val !== undefined) {
          if (typeof val === 'number') {
            // we have a timestamp - milliseconds since Unix Epoch
            val = new Date(val);
          } else if (typeof val === 'string') {
            // we have a string, attempt to convert it to a date object
            val = new Date(val);
          }
          val = val.toISOString(); // convert the date to ISO format for storage in the DB
        }
        return `'${val}'`;
        
      case EntityFieldTSType.Number:
        return val.toString();
        
      default:
        // For other types, convert to string and quote if needed
        if (f.NeedsQuotes) {
          if (typeof val === 'string') {
            val = val.replace(/'/g, "''");
          }
          return `${f.UnicodePrefix}'${val}'`;
        }
        return val.toString();
    }
  }

  private generateSingleSPParam(f: EntityFieldInfo, value: string, isFirst: boolean): string {
    let sRet: string = '';
    let quotes: string = '';
    let val: any = value;

    switch (f.TSType) {
      case EntityFieldTSType.Boolean:
        // check to see if the value is a string and if it is equal to true, if so, set the value to 1
        if (typeof value === 'string' && value.trim().toLowerCase() === 'true') val = 1;
        else if (typeof value === 'string' && value.trim().toLowerCase() === 'false') val = 0;
        else val = value ? 1 : 0;
        break;
      case EntityFieldTSType.String:
        quotes = "'";
        break;
      case EntityFieldTSType.Date:
        quotes = "'";
        if (val !== null && val !== undefined) {
          if (typeof val === 'number') {
            // we have a timestamp - milliseconds since Unix Epoch
            // convert to a date
            val = new Date(val);
          } else if (typeof val === 'string') {
            // we have a string, attempt to convert it to a date object
            val = new Date(val);
          }
          val = val.toISOString(); // convert the date to ISO format for storage in the DB
        }
        break;
      default:
        break;
    }
    if (!isFirst) sRet += ',\n                ';

    sRet += `@${f.CodeName}=${this.packageSPParam(val, quotes, f.UnicodePrefix)}`;

    return sRet;
  }

  /**
   * Returns a string that packages the parameter value for the stored procedure call.
   * It will handle quoting the value based on the quoteString provided and will also handle null
   * values by returning 'NULL' as a string. Finally, the prefix is used for unicode fields to add the 'N' prefix if needed.
   * @param paramValue 
   * @param quoteString 
   * @param prefix 
   * @returns 
   */
  protected packageSPParam(paramValue: any, quoteString: string, unicodePrefix: string) {
    // Handle null/undefined first
    if (paramValue === null || paramValue === undefined) {
      return 'NULL';
    }
    
    let pVal: any;
    if (typeof paramValue === 'string') {
      if (quoteString === "'") 
        pVal = paramValue.replace(/'/g, "''");
      else if (quoteString === '"') 
        pVal = paramValue.replace(/"/g, '""');
      else 
        pVal = paramValue;
    } 
    else {
      pVal = paramValue;
    }

    return unicodePrefix + quoteString + pVal + quoteString;
  }

  protected GetLogRecordChangeSQL(
    newData: any,
    oldData: any,
    entityName: string,
    recordID: any,
    entityInfo: EntityInfo,
    type: 'Create' | 'Update' | 'Delete',
    user: UserInfo,
    wrapRecordIdInQuotes: boolean,
  ) {
    const fullRecordJSON: string = JSON.stringify(this.escapeQuotesInProperties(newData ? newData : oldData, "'")); // stringify old data if we don't have new - means we are DELETING A RECORD
    const changes: any = this.DiffObjects(oldData, newData, entityInfo, "'");
    const changesKeys = changes ? Object.keys(changes) : [];
    if (changesKeys.length > 0 || oldData === null /*new record*/ || newData === null /*deleted record*/) {
      const changesJSON: string = changes !== null ? JSON.stringify(changes) : '';
      const quotes = wrapRecordIdInQuotes ? "'" : '';
      const sSQL = `EXEC [${this.MJCoreSchemaName}].spCreateRecordChange_Internal @EntityName='${entityName}',
                                                                                        @RecordID=${quotes}${recordID}${quotes},
                                                                                        @UserID='${user.ID}',
                                                                                        @Type='${type}',
                                                                                        @ChangesJSON='${changesJSON}',
                                                                                        @ChangesDescription='${oldData && newData ? this.CreateUserDescriptionOfChanges(changes) : !oldData ? 'Record Created' : 'Record Deleted'}',
                                                                                        @FullRecordJSON='${fullRecordJSON}',
                                                                                        @Status='Complete',
                                                                                        @Comments=null`;
      return sSQL;
    } else return null;
  }
  protected async LogRecordChange(
    newData: any,
    oldData: any,
    entityName: string,
    recordID: any,
    entityInfo: EntityInfo,
    type: 'Create' | 'Update' | 'Delete',
    user: UserInfo,
  ) {
    const sSQL = this.GetLogRecordChangeSQL(newData, oldData, entityName, recordID, entityInfo, type, user, true);
    if (sSQL) {
      const result = await this.ExecuteSQL(sSQL, undefined, undefined, user);
      return result;
    }
  }

  /**
   * This method will create a human-readable string that describes the changes object that was created using the DiffObjects() method
   * @param changesObject JavaScript object that has properties for each changed field that in turn have field, oldValue and newValue as sub-properties
   * @param maxValueLength If not specified, default value of 200 characters applies where any values after the maxValueLength is cut off. The actual values are stored in the ChangesJSON and FullRecordJSON in the RecordChange table, this is only for the human-display
   * @param cutOffText If specified, and if maxValueLength applies to any of the values being included in the description, this cutOffText param will be appended to the end of the cut off string to indicate to the human reader that the value is partial.
   * @returns
   */
  public CreateUserDescriptionOfChanges(changesObject: any, maxValueLength: number = 200, cutOffText: string = '...'): string {
    let sRet = '';
    const keys = Object.keys(changesObject);
    for (let i = 0; i < keys.length; i++) {
      const change = changesObject[keys[i]];
      if (sRet.length > 0) {
        sRet += '\n';
      }
      if (change.oldValue && change.newValue)
        // both old and new values set, show change
        sRet += `${change.field} changed from ${this.trimString(change.oldValue, maxValueLength, cutOffText)} to ${this.trimString(change.newValue, maxValueLength, cutOffText)}`;
      else if (change.newValue)
        // old value was blank, new value isn't
        sRet += `${change.field} set to ${this.trimString(change.newValue, maxValueLength, cutOffText)}`;
      else if (change.oldValue)
        // new value is blank, old value wasn't
        sRet += `${change.field} cleared from ${this.trimString(change.oldValue, maxValueLength, cutOffText)}`;
    }
    return sRet.replace(/'/g, "''");
  }

  protected trimString(value: any, maxLength: number, trailingChars: string) {
    if (value && typeof value === 'string' && value.length > maxLength) {
      value = value.substring(0, maxLength) + trailingChars;
    }
    return value;
  }

  /**
   * Recursively escapes quotes in all string properties of an object or array.
   * This method traverses through nested objects and arrays, escaping the specified
   * quote character in all string values to prevent SQL injection and syntax errors.
   * 
   * @param obj - The object, array, or primitive value to process
   * @param quoteToEscape - The quote character to escape (typically single quote "'")
   * @returns A new object/array with all string values having quotes properly escaped.
   *          Non-string values are preserved as-is.
   * 
   * @example
   * // Escaping single quotes in a nested object
   * const input = {
   *   name: "John's Company",
   *   details: {
   *     description: "It's the best",
   *     tags: ["Won't fail", "Can't stop"]
   *   }
   * };
   * const escaped = this.escapeQuotesInProperties(input, "'");
   * // Result: {
   * //   name: "John''s Company",
   * //   details: {
   * //     description: "It''s the best",
   * //     tags: ["Won''t fail", "Can''t stop"]
   * //   }
   * // }
   * 
   * @remarks
   * This method is essential for preparing data to be embedded in SQL strings.
   * It handles:
   * - Nested objects of any depth
   * - Arrays (including arrays of objects)
   * - Mixed-type objects with strings, numbers, booleans, null values
   * - Circular references are NOT handled and will cause stack overflow
   */
  protected escapeQuotesInProperties(obj: any, quoteToEscape: string): any {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // Handle arrays recursively
    if (Array.isArray(obj)) {
      return obj.map(item => this.escapeQuotesInProperties(item, quoteToEscape));
    }
    
    // Handle Date objects - convert to ISO string before they lose their value
    if (obj instanceof Date) {
      return obj.toISOString();
    }

    // Handle objects recursively
    if (typeof obj === 'object') {
      const sRet: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const element = obj[key];
          if (typeof element === 'string') {
            const reg = new RegExp(quoteToEscape, 'g');
            sRet[key] = element.replace(reg, quoteToEscape + quoteToEscape);
          } else if (typeof element === 'object') {
            // Recursively escape nested objects and arrays
            sRet[key] = this.escapeQuotesInProperties(element, quoteToEscape);
          } else {
            // Keep primitive values as-is (numbers, booleans, etc.)
            sRet[key] = element;
          }
        }
      }
      return sRet;
    }
    
    // For non-object types (shouldn't normally happen), return as-is
    return obj;
  }

  /**
   * Creates a changes object by comparing two javascript objects, identifying fields that have different values.
   * Each property in the returned object represents a changed field, with the field name as the key.
   * 
   * @param oldData - The original data object to compare from
   * @param newData - The new data object to compare to
   * @param entityInfo - Entity metadata used to validate fields and determine comparison logic
   * @param quoteToEscape - The quote character to escape in string values (typically "'")
   * @returns A Record mapping field names to FieldChange objects containing the field name, old value, and new value.
   *          Returns null if either oldData or newData is null/undefined.
   *          Only includes fields that have actually changed and are not read-only.
   * 
   * @remarks
   * - Read-only fields are never considered changed
   * - null and undefined are treated as equivalent
   * - Date fields are compared by timestamp
   * - String and object values have quotes properly escaped for SQL
   * - Objects/arrays are recursively escaped using escapeQuotesInProperties
   * 
   * @example
   * ```typescript
   * const changes = provider.DiffObjects(
   *   { name: "John's Co", revenue: 1000 },
   *   { name: "John's Co", revenue: 2000 },
   *   entityInfo,
   *   "'"
   * );
   * // Returns: { revenue: { field: "revenue", oldValue: 1000, newValue: 2000 } }
   * ```
   */
  public DiffObjects(oldData: any, newData: any, entityInfo: EntityInfo, quoteToEscape: string): Record<string, FieldChange> | null {
    if (!oldData || !newData) return null;
    else {
      const changes: Record<string, FieldChange> = {};
      for (const key in newData) {
        const f = entityInfo.Fields.find((f) => f.Name.toLowerCase() === key.toLowerCase());
        if (!f) {
          continue; // skip if field not found in entity info, sometimes objects have extra properties that are not part of the entity
        }
        
        let bDiff: boolean = false;
        if (f.ReadOnly)
          bDiff = false; // read only fields are never different, they can change in the database, but we don't consider them to be a change for record changes purposes.
        else if ((oldData[key] == undefined || oldData[key] == null) && (newData[key] == undefined || newData[key] == null))
          bDiff = false; // this branch of logic ensures that undefined and null are treated the same
        else {
          switch (f.TSType) {
            case EntityFieldTSType.String:
              bDiff = oldData[key] !== newData[key];
              break;
            case EntityFieldTSType.Date:
              bDiff = new Date(oldData[key]).getTime() !== new Date(newData[key]).getTime();
              break;
            case EntityFieldTSType.Number:
            case EntityFieldTSType.Boolean:
              bDiff = oldData[key] !== newData[key];
              break;
          }
        }
        if (bDiff) {
          // make sure we escape things properly
          let o = oldData[key];
          let n = newData[key];
          
          if (typeof o === 'string') {
            // Escape strings directly
            const r = new RegExp(quoteToEscape, 'g');
            o = o.replace(r, quoteToEscape + quoteToEscape);
          } else if (typeof o === 'object' && o !== null) {
            // For objects/arrays, recursively escape all string properties
            o = this.escapeQuotesInProperties(o, quoteToEscape);
          }
          
          if (typeof n === 'string') {
            // Escape strings directly
            const r = new RegExp(quoteToEscape, 'g');
            n = n.replace(r, quoteToEscape + quoteToEscape);
          } else if (typeof n === 'object' && n !== null) {
            // For objects/arrays, recursively escape all string properties
            n = this.escapeQuotesInProperties(n, quoteToEscape);
          }

          changes[key] = {
            field: key,
            oldValue: o,
            newValue: n,
          };
        }
      }

      return changes;
    }
  }

  public async Load(entity: BaseEntity, CompositeKey: CompositeKey, EntityRelationshipsToLoad: string[] = null, user: UserInfo): Promise<{}> {
    const where = CompositeKey.KeyValuePairs.map((val) => {
      const pk = entity.EntityInfo.PrimaryKeys.find((pk) => pk.Name.trim().toLowerCase() === val.FieldName.trim().toLowerCase());
      if (!pk) throw new Error(`Primary key ${val.FieldName} not found in entity ${entity.EntityInfo.Name}`);
      const quotes = pk.NeedsQuotes ? "'" : '';
      return `[${pk.CodeName}]=${quotes}${val.Value}${quotes}`;
    }).join(' AND ');

    const sql = `SELECT * FROM [${entity.EntityInfo.SchemaName}].${entity.EntityInfo.BaseView} WHERE ${where}`;
    const rawData = await this.ExecuteSQL(sql, undefined, undefined, user);
    // Process rows with user context for decryption
    const d = await this.ProcessEntityRows(rawData, entity.EntityInfo, user);
    if (d && d.length > 0) {
      // got the record, now process the relationships if there are any
      const ret = d[0];
      // we need to post process the retrieval to see if we have any char or nchar fields and we need to remove their trailing spaces
      for (const field of entity.EntityInfo.Fields) {
        if (field.TSType === EntityFieldTSType.String && 
            field.Type.toLowerCase().includes('char') && 
            !field.Type.toLowerCase().includes('varchar')) {
          // trim trailing spaces for char and nchar fields
          ret[field.Name] = ret[field.Name] ? ret[field.Name].trimEnd() : ret[field.Name];
        }
      }

      if (EntityRelationshipsToLoad && EntityRelationshipsToLoad.length > 0) {
        for (let i = 0; i < EntityRelationshipsToLoad.length; i++) {
          const rel = EntityRelationshipsToLoad[i];
          const relInfo = entity.EntityInfo.RelatedEntities.find((r) => r.RelatedEntity == rel);
          if (relInfo) {
            let relSql: string = '';
            const relEntitySchemaName = this.Entities.find((e) => e.Name.trim().toLowerCase() === relInfo.RelatedEntity.trim().toLowerCase())?.SchemaName;
            const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
            if (relInfo.Type.trim().toLowerCase() === 'one to many')
              // one to many - simple query
              relSql = `  SELECT
                                            *
                                        FROM
                                            [${relEntitySchemaName}].[${relInfo.RelatedEntityBaseView}]
                                        WHERE
                                            [${relInfo.RelatedEntityJoinField}] = ${quotes}${ret[entity.FirstPrimaryKey.Name]}${quotes}`;
            // don't yet support composite foreign keys
            // many to many - need to use join view
            else
              relSql = `  SELECT
                                            _theview.*
                                        FROM
                                            [${relEntitySchemaName}].[${relInfo.RelatedEntityBaseView}] _theview
                                        INNER JOIN
                                            [${relEntitySchemaName}].[${relInfo.JoinView}] _jv ON _theview.[${relInfo.RelatedEntityJoinField}] = _jv.[${relInfo.JoinEntityInverseJoinField}]
                                        WHERE
                                            _jv.${relInfo.JoinEntityJoinField} = ${quotes}${ret[entity.FirstPrimaryKey.Name]}${quotes}`; // don't yet support composite foreign keys

            const rawRelData = await this.ExecuteSQL(relSql, undefined, undefined, user);
            if (rawRelData && rawRelData.length > 0) {
              // Find the related entity info to process datetime fields correctly
              const relEntityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === relInfo.RelatedEntity.trim().toLowerCase());
              if (relEntityInfo) {
                ret[rel] = await this.ProcessEntityRows(rawRelData, relEntityInfo, user);
              } else {
                // Fallback if we can't find entity info
                ret[rel] = rawRelData;
              }
            }
          }
        }
      }
      return ret;
    }
    // if we get here, something didn't go right
    return null;
  }

  /**
   * Generates the SQL statement for deleting an entity record
   * 
   * @param entity - The entity to delete
   * @param user - The user performing the delete
   * @returns The full SQL statement for deletion
   * @internal
   */
  protected GetDeleteSQL(entity: BaseEntity, user: UserInfo): string {
    const result = this.GetDeleteSQLWithDetails(entity, user);
    return result.fullSQL;
  }

  /**
   * This function generates both the full SQL (with record change metadata) and the simple stored procedure call for delete
   * @returns Object with fullSQL and simpleSQL properties
   */
  private GetDeleteSQLWithDetails(entity: BaseEntity, user: UserInfo): { fullSQL: string; simpleSQL: string } {
    let sSQL: string = '';
    const spName: string = entity.EntityInfo.spDelete ? entity.EntityInfo.spDelete : `spDelete${entity.EntityInfo.BaseTableCodeName}`;
    const sParams = entity.PrimaryKey.KeyValuePairs.map((kv) => {
      const f = entity.EntityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === kv.FieldName.trim().toLowerCase());
      const quotes = f.NeedsQuotes ? "'" : '';
      return `@${f.CodeName}=${quotes}${kv.Value}${quotes}`;
    }).join(', ');
    const sSimpleSQL: string = `EXEC [${entity.EntityInfo.SchemaName}].[${spName}] ${sParams}`;
    const recordChangesEntityInfo = this.Entities.find((e) => e.Name === 'MJ: Record Changes');

    if (entity.EntityInfo.TrackRecordChanges && entity.EntityInfo.Name.trim().toLowerCase() !== 'record changes') {
      // don't track changes for the record changes entity
      const oldData = entity.GetAll(true); // get all the OLD values
      const sTableDeclare: string = entity.PrimaryKeys.map((pk) => {
        return `${pk.CodeName} ${pk.EntityFieldInfo.SQLFullType}`;
      }).join(', ');
      const sVariableDeclare: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName} ${pk.EntityFieldInfo.SQLFullType}`;
      }).join(', ');
      const sSelectDeclare: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName}=${pk.CodeName}`;
      }).join(', ');
      const sIF: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName} IS NOT NULL`;
      }).join(' AND ');
      const sCombinedPrimaryKey: string = entity.PrimaryKey.ToConcatenatedString();
      const sReturnList: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName} AS [${pk.Name}]`;
      }).join(', ');
      sSQL = `
                    IF OBJECT_ID('tempdb..#ResultTable') IS NOT NULL
                        DROP TABLE #ResultTable

                    DECLARE @ResultTable TABLE (
                        ${sTableDeclare}
                    )

                    INSERT INTO @ResultTable
                    ${sSimpleSQL}

                    DECLARE ${sVariableDeclare}
                    SELECT ${sSelectDeclare} FROM @ResultTable
                    IF ${sIF}
                    BEGIN
                        DECLARE @ResultChangesTable TABLE (
                            ${this.getAllEntityColumnsSQL(recordChangesEntityInfo)}
                        )

                        INSERT INTO @ResultChangesTable
                        ${this.GetLogRecordChangeSQL(null /*pass in null for new data for deleted records*/, oldData, entity.EntityInfo.Name, sCombinedPrimaryKey, entity.EntityInfo, 'Delete', user, true)}
                    END

                    SELECT ${sReturnList}`;
    } else {
      // no record change tracking
      // just delete the record
      sSQL = sSimpleSQL;
    }
    return { fullSQL: sSQL, simpleSQL: sSimpleSQL };
  }

  public async Delete(entity: BaseEntity, options: EntityDeleteOptions, user: UserInfo): Promise<boolean> {
    const result = new BaseEntityResult();
    try {
      entity.RegisterTransactionPreprocessing();

      if (!options) options = new EntityDeleteOptions();

      const bReplay = options.ReplayOnly;

      if (!entity.IsSaved && !bReplay)
        // existing record and not allowed to update
        throw new Error(`Delete() isn't callable for records that haven't yet been saved - ${entity.EntityInfo.Name}`);
      if (!entity.EntityInfo.AllowDeleteAPI && !bReplay)
        // not allowed to delete
        throw new Error(`Delete() isn't callable for ${entity.EntityInfo.Name} as AllowDeleteAPI is false`);

      result.StartedAt = new Date();
      result.Type = 'delete';
      result.OriginalValues = entity.Fields.map((f) => {
        return { FieldName: f.Name, Value: f.Value };
      }); // save the original values before we start the process
      entity.ResultHistory.push(result); // push the new result as we have started a process

      // REMEMBER - this is the provider and the BaseEntity/subclasses handle user-level permission checking already, we just make sure API was turned on for the operation
      // if we get here we can delete, so build the SQL and then handle appropriately either as part of TransGroup or directly...

      const sqlDetails = this.GetDeleteSQLWithDetails(entity, user);
      const sSQL = sqlDetails.fullSQL;

      // Handle Entity and Entity AI Actions here w/ before and after handling
      if (false === options?.SkipEntityActions) await this.HandleEntityActions(entity, 'delete', true, user);
      if (false === options?.SkipEntityAIActions) await this.HandleEntityAIActions(entity, 'delete', true, user);

      if (entity.TransactionGroup && !bReplay) {
        // we have a transaction group, need to play nice and be part of it
        entity.RaiseReadyForTransaction();
        // we are part of a transaction group, so just add our query to the list
        // and when the transaction is committed, we will send all the queries at once
        entity.TransactionGroup.AddTransaction(
          new TransactionItem(
            entity, 
            'Delete', 
            sSQL, 
            null, 
            { 
              dataSource: this._pool,
              simpleSQLFallback: entity.EntityInfo.TrackRecordChanges ? sqlDetails.simpleSQL : undefined,
              entityName: entity.EntityInfo.Name
            }, 
            (transactionResult: Record<string, any>, success: boolean) => {
            // we get here whenever the transaction group does gets around to committing
            // our query.
            result.EndedAt = new Date();
            if (success && result) {
              // Entity AI Actions and Actions - fired off async, NO await on purpose
              if (false === options?.SkipEntityActions) {
                this.HandleEntityActions(entity, 'delete', false, user);
              }
              if (false === options?.SkipEntityAIActions) {
                this.HandleEntityAIActions(entity, 'delete', false, user);
              }

              // Make sure the return value matches up as that is how we know the SP was succesfully internally
              for (const key of entity.PrimaryKeys) {
                if (key.Value !== transactionResult[key.Name]) {
                  result.Success = false;
                  result.Message = 'Transaction failed to commit';
                }
              }
              result.NewValues = this.MapTransactionResultToNewValues(transactionResult);
              result.Success = true;
            } else {
              // the transaction failed, nothing to update, but we need to call Reject so the
              // promise resolves with a rejection so our outer caller knows
              result.Success = false;
              result.Message = 'Transaction failed to commit';
            }
          }),
        );

        return true; // we're part of a transaction group, so we're done here
      } else {
        let d;
        if (bReplay) {
          d = [entity.GetAll()]; // just return the entity as it was before the save as we are NOT saving anything as we are in replay mode
        } else {
          // IS-A: use entity's ProviderTransaction when available for shared transaction
          d = await this.ExecuteSQL(sSQL, null, {
            isMutation: true,
            description: `Delete ${entity.EntityInfo.Name}`,
            simpleSQLFallback: entity.EntityInfo.TrackRecordChanges ? sqlDetails.simpleSQL : undefined,
            connectionSource: entity.ProviderTransaction as sql.Transaction ?? undefined
          }, user);
        }

        if (d && d.length > 0) {
          // SP executed, now make sure the return value matches up as that is how we know the SP was succesfully internally
          // Note: When CASCADE operations exist, multiple result sets are returned (d is array of arrays).
          // When no CASCADE operations exist, a single result set is returned (d is array of objects).
          // We need to handle both cases by checking if the first element is an array.
          const isMultipleResultSets = Array.isArray(d[0]);
          const deletedRecord = isMultipleResultSets
            ? d[d.length - 1][0]  // Multiple result sets: get last result set, first row
            : d[0];               // Single result set: get first row directly

          for (const key of entity.PrimaryKeys) {
            if (key.Value !== deletedRecord[key.Name]) {
              // we can get here if the sp returns NULL for a given key. The reason that would be the case is if the record
              // was not found in the DB. This was the existing logic prior to the SP modifications in 2.68.0, just documenting
              // it here for clarity.
              result.Message = `Transaction failed to commit, record with primary key ${key.Name}=${key.Value} not found`;
              result.EndedAt = new Date();
              result.Success = false;

              return false;
            }
          }

          // Entity AI Actions and Actions - fired off async, NO await on purpose
          this.HandleEntityActions(entity, 'delete', false, user);
          this.HandleEntityAIActions(entity, 'delete', false, user);

          result.EndedAt = new Date();
          return true;
        } else {
          result.Message = 'No result returned from SQL';
          result.EndedAt = new Date();
          return false;
        }
      }
    } catch (e) {
      LogError(e);
      result.Message = e.message;
      result.Success = false;
      result.EndedAt = new Date();

      return false;
    }
  }
  /**************************************************************************/
  // END ---- IEntityDataProvider
  /**************************************************************************/

  /**************************************************************************/
  // START ---- IMetadataProvider
  /**************************************************************************/

  public async GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetResultType> {
    const sSQL = `SELECT
                        di.*,
                        e.BaseView EntityBaseView,
                        e.SchemaName EntitySchemaName,
                        di.__mj_UpdatedAt AS DatasetItemUpdatedAt,
                        d.__mj_UpdatedAt AS DatasetUpdatedAt
                    FROM
                        [${this.MJCoreSchemaName}].vwDatasets d
                    INNER JOIN
                        [${this.MJCoreSchemaName}].vwDatasetItems di
                    ON
                        d.ID = di.DatasetID
                    INNER JOIN
                        [${this.MJCoreSchemaName}].vwEntities e
                    ON
                        di.EntityID = e.ID
                    WHERE
                        d.Name = @p0`;

    let items: any[] = [];
    const useThisProvider: SQLServerDataProvider = providerToUse ? (providerToUse as SQLServerDataProvider) : this;
    items = await useThisProvider.ExecuteSQL(sSQL, [datasetName], undefined, contextUser);
    // now we have the dataset and the items, we need to get the update date from the items underlying entities

    if (items && items.length > 0) {
      // Optimization: Use batch SQL execution for multiple items
      // Build SQL queries for all items
      const queries: string[] = [];
      const itemsWithSQL: any[] = [];

      for (const item of items) {
        const itemSQL = useThisProvider.GetDatasetItemSQL(item, itemFilters, datasetName);
        if (itemSQL) {
          queries.push(itemSQL);
          itemsWithSQL.push(item);
        } else {
          // Handle invalid SQL case - add to results with error
          itemsWithSQL.push({ ...item, hasError: true });
        }
      }

      // Execute all queries in a single batch
      const batchResults = await useThisProvider.ExecuteSQLBatch(queries, undefined, undefined, contextUser);

      // Process results for each item
      const results: DatasetItemResultType[] = [];
      let queryIndex = 0;

      for (const item of itemsWithSQL) {
        if (item.hasError) {
          // Handle error case for invalid columns
          results.push({
            EntityID: item.EntityID,
            EntityName: item.Entity,
            Code: item.Code,
            Results: null,
            LatestUpdateDate: null,
            Status: 'Invalid columns specified for dataset item',
            Success: false,
          });
        } else {
          // Process successful query result
          let itemData = batchResults[queryIndex] || [];

          // Process rows for datetime conversion and field-level decryption
          // This is critical for datasets that contain encrypted fields
          if (itemData.length > 0) {
            const entityInfo = useThisProvider.Entities.find(e =>
              e.Name.trim().toLowerCase() === item.Entity.trim().toLowerCase()
            );
            if (entityInfo) {
              itemData = await useThisProvider.ProcessEntityRows(itemData, entityInfo, contextUser);
            }
          }

          const itemUpdatedAt = new Date(item.DatasetItemUpdatedAt);
          const datasetUpdatedAt = new Date(item.DatasetUpdatedAt);
          const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime()));

          // get the latest update date
          let latestUpdateDate = new Date(1900, 1, 1);
          if (itemData && itemData.length > 0) {
            itemData.forEach((data) => {
              if (data[item.DateFieldToCheck] && new Date(data[item.DateFieldToCheck]) > latestUpdateDate) {
                latestUpdateDate = new Date(data[item.DateFieldToCheck]);
              }
            });
          }

          // finally, compare the latestUpdatedDate to the dataset max date, and use the latter if it is more recent
          if (datasetMaxUpdatedAt > latestUpdateDate) {
            latestUpdateDate = datasetMaxUpdatedAt;
          }

          results.push({
            EntityID: item.EntityID,
            EntityName: item.Entity,
            Code: item.Code,
            Results: itemData,
            LatestUpdateDate: latestUpdateDate,
            Success: itemData !== null && itemData !== undefined,
          });

          queryIndex++;
        }
      }

      // determine overall success
      const bSuccess = results.every((result) => result.Success);

      // get the latest update date from all the results
      const latestUpdateDate = results.reduce(
        (acc, result) => {
          if (result?.LatestUpdateDate) {
            const theDate = new Date(result.LatestUpdateDate);
            if (result.LatestUpdateDate && theDate.getTime() > acc.getTime()) {
              return theDate;
            }
          }
          return acc;
        },
        new Date(0), // Unix epoch - lowest possible date to start with
      );

      return {
        DatasetID: items[0].DatasetID,
        DatasetName: datasetName,
        Success: bSuccess,
        Status: '',
        LatestUpdateDate: latestUpdateDate,
        Results: results,
      };
    } else {
      return {
        DatasetID: '',
        DatasetName: datasetName,
        Success: false,
        Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
        LatestUpdateDate: null,
        Results: null,
      };
    }
  }

  /**
   * Constructs the SQL query for a dataset item.
   * @param item - The dataset item metadata
   * @param itemFilters - Optional filters to apply
   * @param datasetName - Name of the dataset (for error logging)
   * @returns The SQL query string, or null if columns are invalid
   */
  protected GetDatasetItemSQL(item: any, itemFilters: any, datasetName: string): string | null {
    let filterSQL = '';
    if (itemFilters && itemFilters.length > 0) {
      const filter = itemFilters.find((f) => f.ItemCode === item.Code);
      if (filter) filterSQL = (item.WhereClause ? ' AND ' : ' WHERE ') + '(' + filter.Filter + ')';
    }

    const columns = this.GetColumnsForDatasetItem(item, datasetName);
    if (!columns) {
      return null; // Invalid columns
    }

    return `SELECT ${columns} FROM [${item.EntitySchemaName}].[${item.EntityBaseView}] ${item.WhereClause ? 'WHERE ' + item.WhereClause : ''}${filterSQL}`;
  }

  protected async GetDatasetItem(item: any, itemFilters, datasetName, contextUser: UserInfo): Promise<DatasetItemResultType> {
    const itemUpdatedAt = new Date(item.DatasetItemUpdatedAt);
    const datasetUpdatedAt = new Date(item.DatasetUpdatedAt);
    const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime()));

    const itemSQL = this.GetDatasetItemSQL(item, itemFilters, datasetName);
    if (!itemSQL) {
      // failure condition within columns, return a failed result
      return {
        EntityID: item.EntityID,
        EntityName: item.Entity,
        Code: item.Code,
        Results: null,
        LatestUpdateDate: null,
        Status: 'Invalid columns specified for dataset item',
        Success: false,
      };
    }

    const itemData = await this.ExecuteSQL(itemSQL, undefined, undefined, contextUser);

    // get the latest update date
    let latestUpdateDate = new Date(1900, 1, 1);
    if (itemData && itemData.length > 0) {
      itemData.forEach((data) => {
        if (data[item.DateFieldToCheck] && new Date(data[item.DateFieldToCheck]) > latestUpdateDate) {
          latestUpdateDate = new Date(data[item.DateFieldToCheck]);
        }
      });
    }

    // finally, compare the latestUpdatedDate to the dataset max date, and use the latter if it is more recent
    if (datasetMaxUpdatedAt > latestUpdateDate) {
      latestUpdateDate = datasetMaxUpdatedAt;
    }

    return {
      EntityID: item.EntityID,
      EntityName: item.Entity,
      Code: item.Code,
      Results: itemData,
      LatestUpdateDate: latestUpdateDate,
      Success: itemData !== null && itemData !== undefined,
    };
  }

  /**
   * Gets column info for a dataset item, which might be * for all columns or if a Columns field was provided in the DatasetItem table,
   * attempts to use those columns assuming they are valid.
   * @param item
   * @param datasetName
   * @returns
   */
  protected GetColumnsForDatasetItem(item: any, datasetName: string): string {
    const specifiedColumns = item.Columns ? item.Columns.split(',').map((col) => col.trim()) : [];
    if (specifiedColumns.length > 0) {
      // validate that the columns specified are valid within the entity metadata
      const entity = this.Entities.find((e) => e.ID === item.EntityID);
      if (!entity && this.Entities.length > 0) {
        // we have loaded entities (e.g. Entites.length > 0) but the entity wasn't found, log an error and return a failed result
        // the reason we continue below if we have NOT loaded Entities is that when the system first bootstraps, DATASET gets loaded
        // FIRST before Entities are loaded to load the entity metadata so this would ALWAYS fail :)

        // entity not found, return a failed result, shouldn't ever get here  due to the foreign key constraint on the table
        LogError(`Entity not found for dataset item ${item.Code} in dataset ${datasetName}`);
        return null;
      } else {
        if (entity) {
          // have a valid entity, now make sure that all of the columns specified are valid
          // only do the column validity check if we have an entity, we can get here if the entity wasn't found IF we haven't loaded entities yet per above comment
          const invalidColumns: string[] = [];

          specifiedColumns.forEach((col) => {
            if (!entity.Fields.find((f) => f.Name.trim().toLowerCase() === col.trim().toLowerCase())) {
              invalidColumns.push(col);
            }
          });
          if (invalidColumns.length > 0) {
            LogError(`Invalid columns specified for dataset item ${item.Code} in dataset ${datasetName}: ${invalidColumns.join(', ')}`);
            return null;
          }
        }

        // check to see if the specified columns include the DateFieldToCheck
        // in the below we only check entity metadata if we have it, if we don't have it, we just add the special fields back in
        if (item.DateFieldToCheck && item.DateFieldToCheck.trim().length > 0 && specifiedColumns.indexOf(item.DateFieldToCheck) === -1) {
          // we only check the entity if we have it, otherwise we just add it back in
          if (!entity || entity.Fields.find((f) => f.Name.trim().toLowerCase() === item.DateFieldToCheck.trim().toLowerCase()))
            specifiedColumns.push(item.DateFieldToCheck);
        }
      }
    }
    return specifiedColumns.length > 0 ? specifiedColumns.map((colName) => `[${colName.trim()}]`).join(',') : '*';
  }

  public async GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetStatusResultType> {
    const sSQL = `
            SELECT
                di.*,
                e.BaseView EntityBaseView,
                e.SchemaName EntitySchemaName,
                d.__mj_UpdatedAt AS DatasetUpdatedAt,
                di.__mj_UpdatedAt AS DatasetItemUpdatedAt
            FROM
                [${this.MJCoreSchemaName}].vwDatasets d
            INNER JOIN
                [${this.MJCoreSchemaName}].vwDatasetItems di
            ON
                d.ID = di.DatasetID
            INNER JOIN
                [${this.MJCoreSchemaName}].vwEntities e
            ON
                di.EntityID = e.ID
            WHERE
                d.Name = @p0`;

    let items: any[] = [];
    const useThisProvider: SQLServerDataProvider = providerToUse ? (providerToUse as SQLServerDataProvider) : this;
    items = await useThisProvider.ExecuteSQL(sSQL, [datasetName], undefined, contextUser);

    // now we have the dataset and the items, we need to get the update date from the items underlying entities
    if (items && items.length > 0) {
      // loop through each of the items and get the update date from the underlying entity by building a combined UNION ALL SQL statement
      let combinedSQL = '';
      const updateDates: DatasetStatusEntityUpdateDateType[] = [];

      items.forEach((item, index) => {
        let filterSQL = '';
        if (itemFilters && itemFilters.length > 0) {
          const filter = itemFilters.find((f) => f.ItemCode === item.Code);
          if (filter) filterSQL = ' WHERE ' + filter.Filter;
        }
        const itemUpdatedAt = new Date(item.DatasetItemUpdatedAt);
        const datasetUpdatedAt = new Date(item.DatasetUpdatedAt);
        const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime())).toISOString();

        const itemSQL = `SELECT
                                        CASE
                                            WHEN MAX(${item.DateFieldToCheck}) > '${datasetMaxUpdatedAt}' THEN MAX(${item.DateFieldToCheck})
                                            ELSE '${datasetMaxUpdatedAt}'
                                        END AS UpdateDate,
                                        COUNT(*) AS TheRowCount,
                                        '${item.EntityID}' AS EntityID,
                                        '${item.Entity}' AS EntityName
                                 FROM
                                    [${item.EntitySchemaName}].[${item.EntityBaseView}]${filterSQL}`;
        combinedSQL += itemSQL;
        if (index < items.length - 1) {
          combinedSQL += ' UNION ALL ';
        }
      });
      const itemUpdateDates = await useThisProvider.ExecuteSQL(combinedSQL, null, undefined, contextUser);

      if (itemUpdateDates && itemUpdateDates.length > 0) {
        let latestUpdateDate = new Date(1900, 1, 1);

        itemUpdateDates.forEach((itemUpdate) => {
          const updateDate = new Date(itemUpdate.UpdateDate);
          updateDates.push({
            EntityID: itemUpdate.EntityID,
            EntityName: itemUpdate.EntityName,
            RowCount: itemUpdate.TheRowCount,
            UpdateDate: updateDate,
          });

          if (updateDate > latestUpdateDate) {
            latestUpdateDate = updateDate;
          }
        });

        return {
          DatasetID: items[0].DatasetID,
          DatasetName: datasetName,
          Success: true,
          Status: '',
          LatestUpdateDate: latestUpdateDate,
          EntityUpdateDates: updateDates,
        };
      } else {
        return {
          DatasetID: items[0].DatasetID,
          DatasetName: datasetName,
          Success: false,
          Status: 'No update dates found for DatasetName: ' + datasetName,
          LatestUpdateDate: null,
          EntityUpdateDates: null,
        };
      }
    } else {
      return {
        DatasetID: '',
        DatasetName: datasetName,
        Success: false,
        Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
        EntityUpdateDates: null,
        LatestUpdateDate: null,
      };
    }
  }

  protected async GetApplicationMetadata(contextUser: UserInfo): Promise<ApplicationInfo[]> {
    const apps = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwApplications`, null, undefined, contextUser);
    const appEntities = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwApplicationEntities ORDER BY ApplicationName`, undefined, undefined, contextUser);
    const ret: ApplicationInfo[] = [];
    for (let i = 0; i < apps.length; i++) {
      ret.push(
        new ApplicationInfo(this, {
          ...apps[i],
          ApplicationEntities: appEntities.filter((ae) => ae.ApplicationName.trim().toLowerCase() === apps[i].Name.trim().toLowerCase()),
        }),
      );
    }
    return ret;
  }

  protected async GetAuditLogTypeMetadata(contextUser: UserInfo): Promise<AuditLogTypeInfo[]> {
    const alts = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuditLogTypes`, null, undefined, contextUser);
    const ret: AuditLogTypeInfo[] = [];
    for (let i = 0; i < alts.length; i++) {
      const alt = new AuditLogTypeInfo(alts[i]);
      ret.push(alt);
    }
    return ret;
  }

  protected async GetUserMetadata(contextUser: UserInfo): Promise<UserInfo[]> {
    const users = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUsers`, null, undefined, contextUser);
    const userRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUserRoles ORDER BY UserID`, undefined, undefined, contextUser);
    const ret: UserInfo[] = [];
    for (let i = 0; i < users.length; i++) {
      ret.push(
        new UserInfo(this, {
          ...users[i],
          UserRoles: userRoles.filter((ur) => ur.UserID === users[i].ID),
        }),
      );
    }
    return ret;
  }

  protected async GetAuthorizationMetadata(contextUser: UserInfo): Promise<AuthorizationInfo[]> {
    const auths = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuthorizations`, null, undefined, contextUser);
    const authRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuthorizationRoles ORDER BY AuthorizationName`, undefined, undefined, contextUser);
    const ret: AuthorizationInfo[] = [];
    for (let i = 0; i < auths.length; i++) {
      ret.push(
        new AuthorizationInfo(this, {
          ...auths[i],
          AuthorizationRoles: authRoles.filter((ar) => ar.AuthorizationName.trim().toLowerCase() === auths[i].Name.trim().toLowerCase()),
        }),
      );
    }
    return ret;
  }
   
  /**
   * Processes entity rows returned from SQL Server to handle:
   * 1. Timezone conversions for datetime fields
   * 2. Field-level decryption for encrypted fields
   *
   * This method specifically handles the conversion of datetime2 fields (which SQL Server returns without timezone info)
   * to proper UTC dates, preventing JavaScript from incorrectly interpreting them as local time.
   *
   * For encrypted fields, this method decrypts values at the data provider level.
   * API-level filtering (AllowDecryptInAPI/SendEncryptedValue) is handled by the GraphQL layer.
   *
   * @param rows The raw result rows from SQL Server
   * @param entityInfo The entity metadata to determine field types
   * @param contextUser Optional user context for decryption operations
   * @returns The processed rows with corrected datetime values and decrypted fields
   *
   * @security Encrypted fields are decrypted here for internal use.
   *           The API layer handles response filtering based on AllowDecryptInAPI settings.
   */
  public async ProcessEntityRows(rows: any[], entityInfo: EntityInfo, contextUser?: UserInfo): Promise<any[]> {
    if (!rows || rows.length === 0) {
      return rows;
    }

    // Find all datetime fields in the entity
    const datetimeFields = entityInfo.Fields.filter((field) => field.TSType === EntityFieldTSType.Date);

    // Find all encrypted fields in the entity
    const encryptedFields = entityInfo.Fields.filter((field) => field.Encrypt && field.EncryptionKeyID);

    // If there are no fields requiring processing, return the rows as-is
    if (datetimeFields.length === 0 && encryptedFields.length === 0) {
      return rows;
    }

    // Check if we need datetimeoffset adjustment (lazy loaded on first use)
    const needsAdjustment = datetimeFields.length > 0 ? await this.NeedsDatetimeOffsetAdjustment() : false;

    // Get encryption engine instance (lazy - only if we have encrypted fields)
    let encryptionEngine: EncryptionEngine | null = null;
    if (encryptedFields.length > 0) {
      encryptionEngine = EncryptionEngine.Instance;
      await encryptionEngine.Config(false, contextUser);
    }

    // Process each row - need to use Promise.all for async decryption
    const processedRows = await Promise.all(rows.map(async (row) => {
      const processedRow = { ...row };

      // ========================================================================
      // DATETIME FIELD PROCESSING
      // ========================================================================
      for (const field of datetimeFields) {
        const fieldValue = processedRow[field.Name];

        // Skip null/undefined values
        if (fieldValue === null || fieldValue === undefined) {
          continue;
        }

        // Handle different datetime field types
        if (field.Type.toLowerCase() === 'datetime2') {
          if (typeof fieldValue === 'string') {
            // If it's still a string (rare case), convert to UTC
            if (!fieldValue.includes('Z') && !fieldValue.includes('+') && !fieldValue.includes('-')) {
              const utcValue = fieldValue.replace(' ', 'T') + 'Z';
              processedRow[field.Name] = new Date(utcValue);
            } else {
              processedRow[field.Name] = new Date(fieldValue);
            }
          } else if (fieldValue instanceof Date) {
            // DB driver has already converted to a Date object using local timezone
            // We need to adjust it back to UTC
            // SQL Server stores datetime2 as UTC, but DB Driver interprets it as local
            const localDate = fieldValue;
            const timezoneOffsetMs = localDate.getTimezoneOffset() * 60 * 1000;
            const utcDate = new Date(localDate.getTime() + timezoneOffsetMs);
            processedRow[field.Name] = utcDate;
          }
        } else if (field.Type.toLowerCase() === 'datetimeoffset') {
          // Handle datetimeoffset based on empirical test results
          if (typeof fieldValue === 'string') {
            // String format should include timezone offset, parse it correctly
            processedRow[field.Name] = new Date(fieldValue);
          } else if (fieldValue instanceof Date && needsAdjustment) {
            // The database driver has incorrectly converted to a Date object using local timezone
            // For datetimeoffset, SQL Server provides the value with timezone info, but the driver
            // creates the Date as if it were in local time, ignoring the offset
            // We need to adjust it back to the correct UTC time
            const localDate = fieldValue;
            const timezoneOffsetMs = localDate.getTimezoneOffset() * 60 * 1000;
            const utcDate = new Date(localDate.getTime() + timezoneOffsetMs);
            processedRow[field.Name] = utcDate;
          }
          // If it's already a Date object and no adjustment needed, leave as-is
        } else if (field.Type.toLowerCase() === 'datetime') {
          // Legacy datetime type - similar handling to datetime2
          if (fieldValue instanceof Date) {
            const localDate = fieldValue;
            const timezoneOffsetMs = localDate.getTimezoneOffset() * 60 * 1000;
            const utcDate = new Date(localDate.getTime() + timezoneOffsetMs);
            processedRow[field.Name] = utcDate;
          }
        }
        // For other types (date, time), leave as-is
      }

      // ========================================================================
      // ENCRYPTED FIELD PROCESSING (DECRYPTION)
      // Decrypt at the data provider level for internal use.
      // API-level filtering based on AllowDecryptInAPI is handled by GraphQL resolvers.
      // ========================================================================
      if (encryptionEngine && encryptedFields.length > 0) {
        for (const field of encryptedFields) {
          const fieldValue = processedRow[field.Name];

          // Skip null/undefined/empty values
          if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
            continue;
          }

          // Only decrypt if the value is actually encrypted
          const keyMarker = field.EncryptionKeyID ? encryptionEngine.GetKeyByID(field.EncryptionKeyID)?.Marker : undefined;
          if (typeof fieldValue === 'string' && encryptionEngine.IsEncrypted(fieldValue, keyMarker)) {
            try {
              const decryptedValue = await encryptionEngine.Decrypt(fieldValue, contextUser);
              processedRow[field.Name] = decryptedValue;
            } catch (decryptError) {
              // Log error but don't fail the entire operation
              // Return the encrypted value so the caller knows something is wrong
              const message = decryptError instanceof Error ? decryptError.message : String(decryptError);
              LogError(
                `Failed to decrypt field "${field.Name}" on entity "${entityInfo.Name}": ${message}. ` +
                'The encrypted value will be returned unchanged.'
              );
              // Keep the encrypted value in the row - let the caller decide what to do
            }
          }
        }
      }

      return processedRow;
    }));

    return processedRows;
  }


  /**
   * Static method for executing SQL with proper handling of connections and logging.
   * This is the single point where all SQL execution happens in the entire class.
   * 
   * @param query - SQL query to execute
   * @param parameters - Query parameters
   * @param context - Execution context containing pool, transaction, and logging functions
   * @param options - Options for SQL execution
   * @returns Promise<sql.IResult<any>> - Query result
   * @private
   */

  /**
   * Internal SQL execution method for instance calls - routes queries based on transaction state
   * - Queries without transactions execute directly (allowing parallelism)
   * - Queries within transactions go through the instance queue (ensuring serialization)
   */
  private async _internalExecuteSQLInstance(
    query: string,
    parameters: any,
    context: SQLExecutionContext,
    options?: InternalSQLOptions
  ): Promise<sql.IResult<any>> {
    // If no transaction is active, execute directly without queuing
    // This allows maximum parallelism for non-transactional queries
    if (!context.transaction) {
      return executeSQLCore(query, parameters, context, options);
    }
    
    // For transactional queries, use the instance queue to ensure serialization
    // This prevents EREQINPROG errors when multiple queries try to use the same transaction
    return new Promise((resolve, reject) => {
      this._sqlQueue$.next({
        id: uuidv4(),
        query,
        parameters,
        context,
        options,
        resolve,
        reject
      });
    });
  }

  /**
   * Static SQL execution method - for static methods like ExecuteSQLWithPool
   * Static methods don't have access to instance queues, so they execute directly
   * Transactions are not supported in static context
   */
  private static async _internalExecuteSQLStatic(
    query: string,
    parameters: any,
    context: SQLExecutionContext,
    options?: InternalSQLOptions
  ): Promise<sql.IResult<any>> {
    if (context.transaction) {
      throw new Error('Transactions are not supported in static SQL execution context. Use instance methods for transactional queries.');
    }
    
    // Static calls always execute directly (no queue needed since no transactions)
    return executeSQLCore(query, parameters, context, options);
  }

  /**
   * Internal centralized method for executing SQL queries with consistent transaction and connection handling.
   * This method ensures proper request object creation and management to avoid concurrency issues,
   * particularly when using transactions where multiple operations may execute in parallel.
   * 
   * @private
   * @param query - The SQL query to execute
   * @param parameters - Optional parameters for the query (array for positional, object for named)
   * @param connectionSource - Optional specific connection source (pool, transaction, or request)
   * @param loggingOptions - Optional logging configuration
   * @returns Promise<sql.IResult<any>> - The raw mssql result object
   * 
   * @remarks
   * - Always creates a new Request object for each query to avoid "EREQINPROG" errors
   * - Handles both positional (?) and named (@param) parameter styles
   * - Automatically uses active transaction if one exists, otherwise uses connection pool
   * - Handles SQL logging in parallel with query execution
   * - Provides automatic retry with pool connection if transaction fails
   * 
   * @throws {Error} Rethrows any SQL execution errors after logging
   */
  private async _internalExecuteSQL(
    query: string,
    parameters?: any,
    connectionSource?: sql.ConnectionPool | sql.Transaction | sql.Request,
    loggingOptions?: {
      description?: string;
      ignoreLogging?: boolean;
      isMutation?: boolean;
      simpleSQLFallback?: string;
      contextUser?: UserInfo;
    }
  ): Promise<sql.IResult<any>> {
    // Handle the connectionSource parameter for backwards compatibility
    // If a specific source is provided, we'll pass it as the transaction (if it's a transaction)
    // or ignore it if it's a pool/request (since we'll use our own pool)
    let transaction: sql.Transaction | null = null;
    
    if (connectionSource instanceof sql.Transaction) {
      transaction = connectionSource;
    } else if (!connectionSource) {
      // Use instance transaction
      transaction = this._transaction;
    }
    
    // Create the execution context
    const context: SQLExecutionContext = {
      pool: this._pool,
      transaction: transaction,
      logSqlStatement: this._logSqlStatement.bind(this),
      clearTransaction: () => { 
        this._transaction = null;
      }
    };
    
    // Convert logging options to internal format
    const options: InternalSQLOptions | undefined = loggingOptions ? {
      description: loggingOptions.description,
      ignoreLogging: loggingOptions.ignoreLogging,
      isMutation: loggingOptions.isMutation,
      simpleSQLFallback: loggingOptions.simpleSQLFallback,
      contextUser: loggingOptions.contextUser
    } : undefined;
    
    // Delegate to instance method
    return this._internalExecuteSQLInstance(query, parameters, context, options);
  }

  /**
   * This method can be used to execute raw SQL statements outside of the MJ infrastructure.
   * *CAUTION* - use this method with great care.
   * @param query
   * @param parameters
   * @returns
   */
  public async ExecuteSQL(
    query: string,
    parameters: any = null,
    options?: ExecuteSQLOptions,
    contextUser?: UserInfo,
  ): Promise<any> {
    try {
      // Use internal method with logging options
      // Pass connectionSource if provided (used by IS-A chain orchestration for shared transactions)
      const result = await this._internalExecuteSQL(query, parameters, options?.connectionSource, {
        description: options?.description,
        ignoreLogging: options?.ignoreLogging,
        isMutation: options?.isMutation,
        simpleSQLFallback: options?.simpleSQLFallback,
        contextUser: contextUser
      });
      
      // Return recordset for consistency with TypeORM behavior
      // If multiple recordsets, return recordsets array
      return result.recordsets && Array.isArray(result.recordsets) && result.recordsets.length > 1 ? result.recordsets : result.recordset;
    } catch (e) {
      // Error already logged by _internalExecuteSQL
      throw e; // force caller to handle
    }
  }

  /**
   * Static helper method for executing SQL queries on an external connection pool.
   * This method is designed to be used by generated code where a connection pool
   * is passed in from the context. It returns results as arrays for consistency
   * with the expected behavior in generated resolvers.
   *
   * @param pool - The mssql ConnectionPool to execute the query on
   * @param query - The SQL query to execute
   * @param parameters - Optional parameters for the query
   * @returns Promise<any[]> - Array of results (empty array if no results)
   */
  public static async ExecuteSQLWithPool(pool: sql.ConnectionPool, query: string, parameters?: any, contextUser?: UserInfo): Promise<any[]> {
    try {
      // Create the execution context for static method
      const context: SQLExecutionContext = {
        pool: pool,
        transaction: null,
        logSqlStatement: async (q, p, d, i, m, s, u) => {
          // Use static logging method
          await SQLServerDataProvider.LogSQLStatement(q, p, d || 'ExecuteSQLWithPool', m || false, s, u);
        }
      };
      
      // Create options
      const options: InternalSQLOptions = {
        description: 'ExecuteSQLWithPool',
        ignoreLogging: false,
        isMutation: false,
        contextUser: contextUser
      };
      
      // Use the static execution method
      const result = await SQLServerDataProvider._internalExecuteSQLStatic(query, parameters, context, options);

      // Always return array for consistency
      return result.recordset || [];
    } catch (e) {
      // Error already logged by _internalExecuteSQLStatic
      throw e;
    }
  }

  /**
   * Static method to execute a batch of SQL queries using a provided connection source.
   * This allows the batch logic to be reused from external contexts like TransactionGroup.
   * All queries are combined into a single SQL statement and executed together within
   * the same connection/transaction context for optimal performance.
   *
   * @param connectionSource - Either a sql.ConnectionPool, sql.Transaction, or sql.Request to use for execution
   * @param queries - Array of SQL queries to execute
   * @param parameters - Optional array of parameter arrays, one for each query
   * @returns Promise<any[][]> - Array of result arrays, one for each query
   */
  public static async ExecuteSQLBatchStatic(
    connectionSource: sql.ConnectionPool | sql.Transaction | sql.Request,
    queries: string[],
    parameters?: any[][],
    contextUser?: UserInfo,
  ): Promise<any[][]> {
    try {
      // Build combined batch SQL and parameters
      let batchSQL = '';
      const batchParameters: Record<string, any> = {};
      let globalParamIndex = 0;

      queries.forEach((query, queryIndex) => {
        let processedQuery = query;
        
        // Add parameters for this query if provided
        if (parameters && parameters[queryIndex]) {
          const queryParams = parameters[queryIndex];
          if (Array.isArray(queryParams)) {
            // Handle positional parameters
            queryParams.forEach((value, localIndex) => {
              const paramName = `p${globalParamIndex}`;
              batchParameters[paramName] = value;
              globalParamIndex++;
            });
            // Replace ? placeholders with parameter names
            let localParamIndex = globalParamIndex - queryParams.length;
            processedQuery = processedQuery.replace(/\?/g, () => `@p${localParamIndex++}`);
          } else if (typeof queryParams === 'object') {
            // Handle named parameters - prefix with query index to avoid conflicts
            for (const [key, value] of Object.entries(queryParams)) {
              const paramName = `q${queryIndex}_${key}`;
              batchParameters[paramName] = value;
              // Replace parameter references in query
              processedQuery = processedQuery.replace(new RegExp(`@${key}\\b`, 'g'), `@${paramName}`);
            }
          }
        }

        batchSQL += processedQuery;
        if (queryIndex < queries.length - 1) {
          batchSQL += ';\n';
        }
      });

      // Create execution context for batch SQL
      let pool: sql.ConnectionPool;
      let transaction: sql.Transaction | null = null;
      
      if (connectionSource instanceof sql.Request) {
        throw new Error('Request objects are not supported for batch execution. Use ConnectionPool or Transaction.');
      } else if (connectionSource instanceof sql.Transaction) {
        transaction = connectionSource;
        // Get pool from transaction's internal connection
        pool = (connectionSource as any)._pool || (connectionSource as any).parent;
        if (!pool) {
          throw new Error('Unable to get connection pool from transaction');
        }
      } else if (connectionSource instanceof sql.ConnectionPool) {
        pool = connectionSource;
      } else {
        throw new Error('Invalid connection source type');
      }
      
      // Create context for executeSQLCore
      const context: SQLExecutionContext = {
        pool: pool,
        transaction: transaction,
        logSqlStatement: async (q, p, d, i, m, s, u) => {
          await SQLServerDataProvider.LogSQLStatement(q, p, d || 'Batch execution', m || false, s, u);
        }
      };
      
      // Use named parameters for batch SQL
      const namedParams: Record<string, any> = batchParameters;
      
      // Execute using the centralized core function
      const result = await executeSQLCore(batchSQL, namedParams, context, {
        description: 'Batch execution',
        ignoreLogging: false,
        isMutation: false,
        contextUser: contextUser
      });
      
      // Return array of recordsets - one for each query
      // Handle both single and multiple recordsets
      if (result.recordsets && Array.isArray(result.recordsets)) {
        return result.recordsets;
      } else if (result.recordset) {
        return [result.recordset];
      } else {
        return [];
      }
    } catch (e) {
      // Error already logged by _internalExecuteSQLStatic
      throw e;
    }
  }

  /**
   * Executes multiple SQL queries in a single batch for optimal performance.
   * All queries are combined into a single SQL statement and executed together.
   * This is particularly useful for bulk operations where you need to execute
   * many similar queries and want to minimize round trips to the database.
   *
   * @param queries - Array of SQL queries to execute
   * @param parameters - Optional array of parameter arrays, one for each query
   * @param options - Optional execution options for logging and description
   * @returns Promise<any[][]> - Array of result arrays, one for each query
   */
  public async ExecuteSQLBatch(
    queries: string[],
    parameters?: any[][],
    options?: ExecuteSQLBatchOptions,
    contextUser?: UserInfo,
  ): Promise<any[][]> {
    try {
      // Build combined batch SQL and parameters (same as static method)
      let batchSQL = '';
      const batchParameters: Record<string, any> = {};
      let globalParamIndex = 0;

      queries.forEach((query, queryIndex) => {
        let processedQuery = query;
        
        // Add parameters for this query if provided
        if (parameters && parameters[queryIndex]) {
          const queryParams = parameters[queryIndex];
          if (Array.isArray(queryParams)) {
            // Handle positional parameters
            queryParams.forEach((value, localIndex) => {
              const paramName = `p${globalParamIndex}`;
              batchParameters[paramName] = value;
              globalParamIndex++;
            });
            // Replace ? placeholders with parameter names
            let localParamIndex = globalParamIndex - queryParams.length;
            processedQuery = processedQuery.replace(/\?/g, () => `@p${localParamIndex++}`);
          } else if (typeof queryParams === 'object') {
            // Handle named parameters - prefix with query index to avoid conflicts
            for (const [key, value] of Object.entries(queryParams)) {
              const paramName = `q${queryIndex}_${key}`;
              batchParameters[paramName] = value;
              // Replace parameter references in query
              processedQuery = processedQuery.replace(new RegExp(`@${key}\\b`, 'g'), `@${paramName}`);
            }
          }
        }

        batchSQL += processedQuery;
        if (queryIndex < queries.length - 1) {
          batchSQL += ';\n';
        }
      });

      // Create execution context
      const context: SQLExecutionContext = {
        pool: this._pool,
        transaction: this._transaction,
        logSqlStatement: this._logSqlStatement.bind(this),
        clearTransaction: () => { 
          this._transaction = null;
        }
      };

      // Execute using instance method (which handles queue for transactions)
      const result = await this._internalExecuteSQLInstance(batchSQL, batchParameters, context, {
        description: options?.description || 'Batch execution',
        ignoreLogging: options?.ignoreLogging || false,
        isMutation: options?.isMutation || false,
        contextUser: contextUser
      });
      
      // Return array of recordsets - one for each query
      // Handle both single and multiple recordsets
      if (result.recordsets && Array.isArray(result.recordsets)) {
        return result.recordsets;
      } else if (result.recordset) {
        return [result.recordset];
      } else {
        return [];
      }
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**
   * Determines whether the database driver requires adjustment for datetimeoffset fields.
   * This method performs an empirical test on first use to detect if the driver (e.g., mssql)
   * incorrectly handles timezone information in datetimeoffset columns.
   *
   * @returns {Promise<boolean>} True if datetimeoffset values need timezone adjustment, false otherwise
   *
   * @example
   * ```typescript
   * const provider = new SQLServerDataProvider();
   * if (await provider.NeedsDatetimeOffsetAdjustment()) {
   *   console.log('Driver requires datetimeoffset adjustment');
   * }
   * ```
   *
   * @remarks
   * Some database drivers (notably TypeORM) incorrectly interpret SQL Server's datetimeoffset
   * values as local time instead of respecting the timezone offset. This method detects
   * this behavior by inserting a known UTC time and checking if it's retrieved correctly.
   * The test is performed only once and the result is cached for performance.
   */
  public async NeedsDatetimeOffsetAdjustment(): Promise<boolean> {
    // If we've already run the test, return the cached result
    if (this._datetimeOffsetTestComplete) {
      return this._needsDatetimeOffsetAdjustment;
    }

    // Run the test
    await this.testDatetimeOffsetHandling();
    return this._needsDatetimeOffsetAdjustment;
  }

  /**
   * Tests how the database driver handles datetimeoffset fields.
   * This empirical test determines if we need to adjust for incorrect timezone handling.
   */
  private async testDatetimeOffsetHandling(): Promise<void> {
    try {
      const testQuery = `
        DECLARE @TestTable TABLE (
            TestDateTime datetimeoffset NOT NULL
        );

        -- Insert 1/1/1900 at 11:00 AM UTC
        INSERT INTO @TestTable (TestDateTime)
        VALUES ('1900-01-01 11:00:00.0000000 +00:00');

        -- Select and return the row
        SELECT TestDateTime FROM @TestTable;
      `;

      const result = await this.ExecuteSQL(testQuery, null, { description: 'DatetimeOffset handling test' });
      if (result && result.length > 0) {
        const testDate = result[0].TestDateTime;

        // Expected: January 1, 1900 at 11:00 AM UTC
        const expectedUTCHours = 11;

        if (testDate instanceof Date) {
          // Get the UTC hours from the returned date
          const actualUTCHours = testDate.getUTCHours();

          // If the UTC hours don't match, the driver is incorrectly handling timezone
          if (actualUTCHours !== expectedUTCHours) {
            this._needsDatetimeOffsetAdjustment = true;
            console.warn(
              `SQLServerDataProvider: Detected incorrect datetimeoffset handling. Expected UTC hour: ${expectedUTCHours}, got: ${actualUTCHours}. Enabling automatic adjustment.`,
            );
          } else {
            this._needsDatetimeOffsetAdjustment = false;
          }
        } else {
          // If it's not a Date object, log for debugging
          console.log('SQLServerDataProvider: Unexpected datetimeoffset test result type:', typeof testDate, testDate);
        }
      }

      // Mark the test as complete
      this._datetimeOffsetTestComplete = true;
    } catch (e) {
      // If the test fails, log the error but don't prevent initialization
      console.error('SQLServerDataProvider: Failed to test datetimeoffset handling:', e);
      // Default to assuming adjustment is needed for safety
      this._needsDatetimeOffsetAdjustment = true;
      this._datetimeOffsetTestComplete = true;
    }
  }

  /**
   * Begin an independent transaction for IS-A chain orchestration.
   * Returns a new sql.Transaction object that is NOT linked to the provider's
   * internal transaction state (used by TransactionGroup). Each IS-A chain
   * gets its own transaction to avoid interference with other operations.
   */
  public async BeginISATransaction(): Promise<unknown> {
    const transaction = new sql.Transaction(this._pool);
    await transaction.begin();
    return transaction;
  }

  /**
   * Commit an IS-A chain transaction.
   * @param txn The sql.Transaction object returned from BeginISATransaction()
   */
  public async CommitISATransaction(txn: unknown): Promise<void> {
    if (txn && txn instanceof sql.Transaction) {
      await txn.commit();
    }
  }

  /**
   * Rollback an IS-A chain transaction.
   * @param txn The sql.Transaction object returned from BeginISATransaction()
   */
  public async RollbackISATransaction(txn: unknown): Promise<void> {
    if (txn && txn instanceof sql.Transaction) {
      await txn.rollback();
    }
  }

  /**
   * Discovers which IS-A child entity, if any, has a record with the given primary key.
   * Executes a single UNION ALL query across all child entity tables for maximum efficiency.
   * Each branch of the UNION is a PK lookup on a clustered index — effectively instant.
   *
   * @param entityInfo The parent entity whose children to search
   * @param recordPKValue The primary key value to find in child tables
   * @param contextUser Optional context user for audit/permission purposes
   * @returns The child entity name if found, or null if no child record exists
   */
  public async FindISAChildEntity(
    entityInfo: EntityInfo,
    recordPKValue: string,
    contextUser?: UserInfo
  ): Promise<{ ChildEntityName: string } | null> {
    const childEntities = entityInfo.ChildEntities;
    if (childEntities.length === 0) return null;

    const unionSQL = this.buildChildDiscoverySQL(childEntities, recordPKValue);
    if (!unionSQL) return null;

    const results = await this.ExecuteSQL(unionSQL, undefined, undefined, contextUser);
    if (results && results.length > 0 && results[0].EntityName) {
      return { ChildEntityName: results[0].EntityName };
    }
    return null;
  }

  /**
   * Discovers ALL IS-A child entities that have records with the given primary key.
   * Used for overlapping subtype parents (AllowMultipleSubtypes = true) where multiple
   * children can coexist. Same UNION ALL query as FindISAChildEntity, but returns all matches.
   *
   * @param entityInfo The parent entity whose children to search
   * @param recordPKValue The primary key value to find in child tables
   * @param contextUser Optional context user for audit/permission purposes
   * @returns Array of child entity names found (empty if none)
   */
  public async FindISAChildEntities(
    entityInfo: EntityInfo,
    recordPKValue: string,
    contextUser?: UserInfo
  ): Promise<{ ChildEntityName: string }[]> {
    const childEntities = entityInfo.ChildEntities;
    if (childEntities.length === 0) return [];

    const unionSQL = this.buildChildDiscoverySQL(childEntities, recordPKValue);
    if (!unionSQL) return [];

    const results = await this.ExecuteSQL(unionSQL, undefined, undefined, contextUser);
    if (results && results.length > 0) {
      return results
        .filter((r: Record<string, string>) => r.EntityName)
        .map((r: Record<string, string>) => ({ ChildEntityName: r.EntityName }));
    }
    return [];
  }

  /**
   * Builds a UNION ALL query that checks each child entity's base table for a record
   * with the given primary key. Returns the first match (disjoint subtypes guarantee
   * at most one result) unless used with overlapping subtypes.
   */
  private buildChildDiscoverySQL(
    childEntities: EntityInfo[],
    recordPKValue: string
  ): string {
    // Sanitize the PK value to prevent SQL injection
    const safePKValue = recordPKValue.replace(/'/g, "''");

    const unionParts = childEntities
      .filter(child => child.PrimaryKeys.length > 0)
      .map(child => {
        const schema = child.SchemaName || '__mj';
        const table = child.BaseTable;
        const pkName = child.PrimaryKeys[0].Name;
        return `SELECT '${child.Name.replace(/'/g, "''")}' AS EntityName FROM [${schema}].[${table}] WHERE [${pkName}] = '${safePKValue}'`;
      });

    if (unionParts.length === 0) return '';
    return unionParts.join(' UNION ALL ');
  }

  /**************************************************************************
   * IS-A Overlapping Subtype — Record Change Propagation
   *
   * When saving through one branch of an overlapping hierarchy, propagate
   * ancestor-level Record Change entries to all active sibling branches.
   * Executes as a single SQL batch within the active IS-A transaction.
   **************************************************************************/

  /**
   * Propagates Record Change entries to sibling branches of an overlapping IS-A parent.
   * Called from Save() after a successful save of an entity with AllowMultipleSubtypes.
   * Generates a single SQL batch that creates Record Change entries for all child entities
   * (and their sub-trees) except the active branch that triggered this parent save.
   *
   * @param parentInfo The overlapping parent entity's metadata
   * @param changeData The diff data (changesJSON and changesDescription) from the save
   * @param pkValue The shared primary key value
   * @param userId The ID of the user performing the save
   * @param activeChildEntityName The child entity that initiated this parent save (skipped).
   *        Undefined when saving the parent directly — all children get propagated to.
   * @param transaction The active IS-A transaction, or undefined for standalone saves
   */
  private async PropagateRecordChangesToSiblings(
    parentInfo: EntityInfo,
    changeData: { changesJSON: string; changesDescription: string },
    pkValue: string,
    userId: string,
    activeChildEntityName: string | undefined,
    transaction: sql.Transaction | undefined
  ): Promise<void> {
    const sqlParts: string[] = [];
    let varIndex = 0;

    const safePKValue = pkValue.replace(/'/g, "''");
    const safeUserId = userId.replace(/'/g, "''");
    const safeChangesJSON = changeData.changesJSON.replace(/'/g, "''");
    const safeChangesDesc = changeData.changesDescription.replace(/'/g, "''");

    for (const childInfo of parentInfo.ChildEntities) {
      // Skip the active branch (the child that initiated the parent save).
      // When activeChildEntityName is undefined (direct save on parent), propagate to ALL children.
      if (activeChildEntityName && this.isEntityOrAncestorOf(childInfo, activeChildEntityName)) continue;

      // Recursively enumerate this child's entire sub-tree from metadata
      const subTree = this.getFullSubTree(childInfo);

      for (const entityInTree of subTree) {
        if (!entityInTree.TrackRecordChanges) continue;

        const varName = `@_rc_prop_${varIndex++}`;
        sqlParts.push(this.buildSiblingRecordChangeSQL(
          varName,
          entityInTree,
          safeChangesJSON,
          safeChangesDesc,
          safePKValue,
          safeUserId
        ));
      }
    }

    // Execute as single batch
    if (sqlParts.length > 0) {
      const batch = sqlParts.join('\n');
      await this.ExecuteSQL(batch, undefined, {
        connectionSource: transaction,
        description: 'IS-A overlapping subtype Record Change propagation',
        isMutation: true
      });
    }
  }

  /**
   * Checks whether a given entity matches the target name, or is an ancestor
   * of the target (i.e., the target is somewhere in its descendant sub-tree).
   * Used to identify and skip the active branch during sibling propagation.
   */
  private isEntityOrAncestorOf(entityInfo: EntityInfo, targetName: string): boolean {
    if (entityInfo.Name === targetName) return true;
    for (const child of entityInfo.ChildEntities) {
      if (this.isEntityOrAncestorOf(child, targetName)) return true;
    }
    return false;
  }

  /**
   * Recursively enumerates an entity's entire sub-tree from metadata.
   * No DB queries — uses EntityInfo.ChildEntities which is populated from metadata.
   */
  private getFullSubTree(entityInfo: EntityInfo): EntityInfo[] {
    const result: EntityInfo[] = [entityInfo];
    for (const child of entityInfo.ChildEntities) {
      result.push(...this.getFullSubTree(child));
    }
    return result;
  }

  /**
   * Generates a single block of SQL for one sibling entity in the Record Change
   * propagation batch. Uses SELECT...FOR JSON to get the full record, then
   * conditionally inserts a Record Change entry if the record exists.
   */
  private buildSiblingRecordChangeSQL(
    varName: string,
    entityInfo: EntityInfo,
    safeChangesJSON: string,
    safeChangesDesc: string,
    safePKValue: string,
    safeUserId: string
  ): string {
    const schema = entityInfo.SchemaName || '__mj';
    const view = entityInfo.BaseView;
    const pkName = entityInfo.PrimaryKeys[0]?.Name ?? 'ID';
    const safeEntityName = entityInfo.Name.replace(/'/g, "''");

    // Build RecordID in CompositeKey format: "FieldCodeName|Value" (or "F1|V1||F2|V2" for composite PKs)
    // Must match the format used by the main save flow (concatPKIDString in GetSaveSQLWithDetails)
    const recordID = entityInfo.PrimaryKeys
      .map(pk => `${pk.CodeName}${CompositeKey.DefaultValueDelimiter}${safePKValue}`)
      .join(CompositeKey.DefaultFieldDelimiter);

    return `
DECLARE ${varName} NVARCHAR(MAX) = (
    SELECT * FROM [${schema}].[${view}] WHERE [${pkName}] = '${safePKValue}'
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);
IF ${varName} IS NOT NULL
    EXEC [${this.MJCoreSchemaName}].spCreateRecordChange_Internal
        @EntityName='${safeEntityName}',
        @RecordID='${recordID}',
        @UserID='${safeUserId}',
        @Type='Update',
        @ChangesJSON='${safeChangesJSON}',
        @ChangesDescription='${safeChangesDesc}',
        @FullRecordJSON=${varName},
        @Status='Complete',
        @Comments=NULL;`;
  }

  public async BeginTransaction() {
    try {
      this._transactionDepth++;

      if (this._transactionDepth === 1) {
        // First transaction - actually begin using mssql Transaction object
        this._transaction = new sql.Transaction(this._pool);
        await this._transaction.begin();
        
        // Emit transaction state change
        this._transactionState$.next(true);
      } else {
        // Nested transaction - create a savepoint
        const savepointName = `SavePoint_${++this._savepointCounter}`;
        this._savepointStack.push(savepointName);
        
        // Create savepoint for nested transaction
        await this.ExecuteSQL(`SAVE TRANSACTION ${savepointName}`, null, {
          description: `Creating savepoint ${savepointName} at depth ${this._transactionDepth}`,
          ignoreLogging: true
        });
      }
    } catch (e) {
      this._transactionDepth--; // Restore depth on error
      LogError(e);
      throw e; // force caller to handle
    }
  }

  public async CommitTransaction() {
    try {
      if (!this._transaction) {
        throw new Error('No active transaction to commit');
      }
      
      if (this._transactionDepth === 0) {
        throw new Error('Transaction depth mismatch - no transaction to commit');
      }
      
      this._transactionDepth--;
      
      if (this._transactionDepth === 0) {
        // Outermost transaction - use mssql Transaction object to commit
        await this._transaction.commit();
        this._transaction = null;
        
        // Clear savepoint tracking
        this._savepointStack = [];
        this._savepointCounter = 0;
        
        // Emit transaction state change
        this._transactionState$.next(false);
        
        // Process any deferred tasks after successful commit
        await this.processDeferredTasks();
      } else {
        // Nested transaction - just remove the savepoint from stack
        this._savepointStack.pop();
      }
    } catch (e) {
      LogError(e);
      throw e; // force caller to handle
    }
  }

  public async RollbackTransaction() {
    try {
      if (!this._transaction) {
        throw new Error('No active transaction to rollback');
      }
      
      if (this._transactionDepth === 0) {
        throw new Error('Transaction depth mismatch - no transaction to rollback');
      }
      
      if (this._transactionDepth === 1) {
        // Outermost transaction - rollback everything
        await this._transaction.rollback();
        this._transaction = null;
        this._transactionDepth = 0;
        
        // Clear savepoint tracking
        this._savepointStack = [];
        this._savepointCounter = 0;
        
        // Emit transaction state change
        this._transactionState$.next(false);
        
        // Clear deferred tasks after rollback
        const deferredCount = this._deferredTasks.length;
        this._deferredTasks = [];
        if (deferredCount > 0) {
          LogStatus(`Cleared ${deferredCount} deferred tasks after transaction rollback`);
        }
      } else {
        // Nested transaction - rollback to savepoint
        const savepointName = this._savepointStack[this._savepointStack.length - 1];
        if (!savepointName) {
          throw new Error('Savepoint stack mismatch - no savepoint to rollback to');
        }
        
        await this.ExecuteSQL(`ROLLBACK TRANSACTION ${savepointName}`, null, {
          description: `Rolling back to savepoint ${savepointName}`,
          ignoreLogging: true
        });
        
        this._savepointStack.pop();
        this._transactionDepth--;
      }
    } catch (e) {
      // On error in outer transaction, reset everything
      if (this._transactionDepth === 1 || !this._transaction) {
        this._transaction = null;
        this._transactionDepth = 0;
        this._savepointStack = [];
        this._savepointCounter = 0;
        this._transactionState$.next(false);
      }
      
      LogError(e);
      throw e; // force caller to handle
    }
  }

  /**
   * Override RefreshIfNeeded to skip refresh when a transaction is active
   * This prevents conflicts between metadata refresh operations and active transactions
   * @returns Promise<boolean> - true if refresh was performed, false if skipped or no refresh needed
   */
  public async RefreshIfNeeded(): Promise<boolean> {
    // Skip refresh if a transaction is active
    if (this.isTransactionActive) {
      LogStatus('Skipping metadata refresh - transaction is active');
      return false;
    }

    // Call parent implementation if no transaction
    return super.RefreshIfNeeded();
  }

  /**
   * Process any deferred tasks that were queued during a transaction
   * This is called after a successful transaction commit
   * @private
   */
  private async processDeferredTasks(): Promise<void> {
    if (this._deferredTasks.length === 0) return;

    LogStatus(`Processing ${this._deferredTasks.length} deferred tasks after transaction commit`);
    
    // Copy and clear the deferred tasks array
    const tasksToProcess = [...this._deferredTasks];
    this._deferredTasks = [];
    
    // Process each deferred task
    for (const task of tasksToProcess) {
      try {
        if (task.type === 'Entity AI Action') {
          // Process the AI action now that we're outside the transaction
          await QueueManager.AddTask('Entity AI Action', task.data, task.options, task.user);
        }
        // Add other task types here as needed
      } catch (error) {
        LogError(`Failed to process deferred ${task.type} task: ${error}`);
        // Continue processing other tasks even if one fails
      }
    }
    
    LogStatus(`Completed processing deferred tasks`);
  }

  get LocalStorageProvider(): ILocalStorageProvider {
    if (!this._localStorageProvider) this._localStorageProvider = new InMemoryLocalStorageProvider();

    return this._localStorageProvider;
  }

  override get FileSystemProvider(): IFileSystemProvider {
    if (!this._fileSystemProvider) this._fileSystemProvider = new NodeFileSystemProvider();

    return this._fileSystemProvider;
  }

  protected async InternalGetEntityRecordNames(info: EntityRecordNameInput[], contextUser?: UserInfo): Promise<EntityRecordNameResult[]> {
    const promises = info.map(async (item) => {
      const r = await this.InternalGetEntityRecordName(item.EntityName, item.CompositeKey, contextUser);
      return {
        EntityName: item.EntityName,
        CompositeKey: item.CompositeKey,
        RecordName: r,
        Success: r ? true : false,
        Status: r ? 'Success' : 'Error',
      };
    });
    return Promise.all(promises);
  }

  protected async InternalGetEntityRecordName(entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<string> {
    try {
      const sql = this.GetEntityRecordNameSQL(entityName, CompositeKey);
      if (sql) {
        const data = await this.ExecuteSQL(sql, null, undefined, contextUser);
        if (data && data.length === 1) {
          const fields = Object.keys(data[0]);
          return data[0][fields[0]]; // return first field
        } else {
          LogError(`Entity ${entityName} record ${CompositeKey.ToString()} not found, returning null`);
          return null;
        }
      }
    } catch (e) {
      LogError(e);
      return null;
    }
  }

  protected GetEntityRecordNameSQL(entityName: string, CompositeKey: CompositeKey): string {
    const e = this.Entities.find((e) => e.Name === entityName);
    if (!e) throw new Error(`Entity ${entityName} not found`);
    else {
      const f = e.NameField;
      if (!f) {
        LogError(`Entity ${entityName} does not have an IsNameField or a field with the column name of Name, returning null, use recordId`);
        return null;
      } else {
        // got our field, create a SQL Query
        const sql: string = `SELECT [${f.Name}] FROM [${e.SchemaName}].[${e.BaseView}] WHERE `;
        let where: string = '';
        for (const pkv of CompositeKey.KeyValuePairs) {
          const pk = e.PrimaryKeys.find((pk) => pk.Name === pkv.FieldName);
          const quotes = pk.NeedsQuotes ? "'" : '';
          if (where.length > 0) where += ' AND ';
          where += `[${pkv.FieldName}]=${quotes}${pkv.Value}${quotes}`;
        }
        return sql + where;
      }
    }
  }

  public async CreateTransactionGroup(): Promise<TransactionGroupBase> {
    return new SQLServerTransactionGroup();
  }

  /**************************************************************************/
  // END ---- IMetadataProvider
  /**************************************************************************/
  protected get Metadata(): IMetadataProvider {
    return this;
  }
}
