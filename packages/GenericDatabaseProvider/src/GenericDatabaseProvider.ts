/**
 * @fileoverview Generic Database Provider for MemberJunction
 *
 * This module provides an intermediate abstract base class between DatabaseProviderBase (MJCore)
 * and platform-specific providers (SQLServerDataProvider, PostgreSQLDataProvider).
 *
 * It contains shared logic that requires heavy dependencies (ActionEngine, AIEngine,
 * EncryptionEngine, MJCoreEntities) which cannot live in MJCore's lightweight base class.
 *
 * Inheritance chain:
 *   DatabaseProviderBase (MJCore — no heavy deps)
 *     └── GenericDatabaseProvider (this package — has ActionEngine, AIEngine, EncryptionEngine)
 *         ├── SQLServerDataProvider (adds datetime handling, SQL logging, mssql-specific)
 *         └── PostgreSQLDataProvider (adds pg-specific connection management)
 *
 * @module @memberjunction/generic-database-provider
 */

import {
    BaseEntity,
    DatabaseProviderBase,
    EntityInfo,
    EntityFieldInfo,
    EntityFieldTSType,
    EntitySaveOptions,
    EntityDeleteOptions,
    EntityPermissionType,
    ExecuteSQLOptions,
    ILocalStorageProvider,
    InMemoryLocalStorageProvider,
    Metadata,
    RunViewParams,
    RunViewResult,
    RunViewWithCacheCheckParams,
    RunViewsWithCacheCheckResponse,
    RunViewWithCacheCheckResult,
    RunQueryParams,
    RunQueryResult,
    RunQueryWithCacheCheckParams,
    RunQueriesWithCacheCheckResponse,
    RunQueryWithCacheCheckResult,
    QueryInfo,
    QueryCategoryInfo,
    AggregateResult,
    AggregateValue,
    CompositeKey,
    DatasetItemFilterType,
    DatasetResultType,
    DatasetItemResultType,
    DatasetStatusResultType,
    DatasetStatusEntityUpdateDateType,
    IMetadataProvider,
    UserInfo,
    LocalCacheManager,
    LogError,
    LogStatus,
    LogStatusEx,
    StripStopWords,
    QueryCacheManager,
    DatabasePlatform,
    QueryExecutionSpec,
} from '@memberjunction/core';

import { MJGlobal, SQLExpressionValidator, UUIDsEqual } from '@memberjunction/global';
import { QueryPagingEngine } from './queryPagingEngine.js';
import { QueryParameterProcessor } from '@memberjunction/query-processor';
import { v4 as uuidv4 } from 'uuid';
import { SqlLoggingSessionImpl } from './SqlLogger.js';
import { SqlLoggingOptions, SqlLoggingSession } from './types.js';
import { SQLDialect } from '@memberjunction/sql-dialect';
import { QueryCompositionEngine } from './queryCompositionEngine.js';

import {
    MJEntityAIActionEntity,
    MJQueryEntity,
    MJUserViewEntityExtended,
    QueryEngine,
    ViewInfo,
} from '@memberjunction/core-entities';

import { AIEngine, EntityAIActionParams } from '@memberjunction/aiengine';
import { QueueManager } from '@memberjunction/queue';
import { EntityActionEngineServer } from '@memberjunction/actions';
import { ActionResult } from '@memberjunction/actions-base';
import { EncryptionEngine } from '@memberjunction/encryption';

/**
 * Configuration options for batch SQL execution.
 * Shared between GenericDatabaseProvider and platform-specific providers.
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
 * GenericDatabaseProvider is an intermediate abstract class that implements shared
 * entity action, AI action, encryption, and view WHERE clause rendering logic.
 *
 * Platform-specific providers should extend this class instead of DatabaseProviderBase
 * to inherit these shared behaviors.
 */
export abstract class GenericDatabaseProvider extends DatabaseProviderBase {
    private _compositionEngine = new QueryCompositionEngine();

    /**************************************************************************/
    // Local Storage Provider — Server-Side Cache Backend
    /**************************************************************************/

    /**
     * The local storage provider backing server-side caching for metadata,
     * RunView results, RunQuery results, and datasets.
     *
     * Defaults to {@link InMemoryLocalStorageProvider} (data lost on restart, not shared
     * across instances). To enable persistent, shared caching, replace with a
     * {@link https://www.npmjs.com/package/@memberjunction/redis-provider | RedisLocalStorageProvider}
     * or any other {@link ILocalStorageProvider} implementation.
     *
     * Subclasses can override this property to supply a custom provider, or call
     * {@link SetLocalStorageProvider} to swap the provider at runtime (e.g., after
     * reading configuration).
     *
     * @see {@link ILocalStorageProvider} for the interface contract
     * @see {@link InMemoryLocalStorageProvider} for the default in-memory implementation
     */
    private _localStorageProvider: ILocalStorageProvider | undefined;

    /**
     * Returns the active local storage provider, lazily creating an
     * {@link InMemoryLocalStorageProvider} if none has been set.
     *
     * This fulfills the abstract `LocalStorageProvider` requirement from
     * {@link ProviderBase} and is shared by all database providers
     * (SQL Server, PostgreSQL, and any future platforms).
     */
    get LocalStorageProvider(): ILocalStorageProvider {
        if (!this._localStorageProvider) {
            this._localStorageProvider = new InMemoryLocalStorageProvider();
        }
        return this._localStorageProvider;
    }

    /**
     * Replaces the active local storage provider at runtime.
     *
     * Use this to swap from the default in-memory provider to a Redis-backed
     * provider (or any other {@link ILocalStorageProvider}) after reading
     * application configuration.
     *
     * @param provider - The new storage provider to use for all caching operations.
     *
     * @example
     * ```typescript
     * import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
     *
     * // During server startup, after config is loaded:
     * const redis = new RedisLocalStorageProvider({
     *     url: process.env.REDIS_URL,
     *     defaultTTLSeconds: 300
     * });
     * (Metadata.Provider as GenericDatabaseProvider).SetLocalStorageProvider(redis);
     * ```
     */
    public SetLocalStorageProvider(provider: ILocalStorageProvider): void {
        this._localStorageProvider = provider;
    }

    /**************************************************************************/
    // SQL Logging — Session Management & Statement Logging
    /**************************************************************************/

    private static _sqlLoggingSessionsKey: string = 'MJ_GenericDatabaseProvider_SqlLoggingSessions';
    private get _sqlLoggingSessions(): Map<string, SqlLoggingSessionImpl> {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g) {
            if (!g[GenericDatabaseProvider._sqlLoggingSessionsKey]) {
                g[GenericDatabaseProvider._sqlLoggingSessionsKey] = new Map<string, SqlLoggingSessionImpl>();
            }
            return g[GenericDatabaseProvider._sqlLoggingSessionsKey];
        } else {
            throw new Error('No global object store available for SQL logging session');
        }
    }

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
                // Inject the platform's batch separator as the default so callers don't need to
                // hardcode 'GO'. Callers can still override by passing batchSeparator explicitly.
                batchSeparator: this.PlatformBatchSeparator || undefined,
                ...options
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
     * Internal method to log SQL statement to all active logging sessions.
     * This is called automatically by ExecuteSQL methods.
     * Protected so platform-specific providers can reference it (e.g., to bind as a callback).
     *
     * @param query - The SQL query being executed
     * @param parameters - Parameters for the query
     * @param description - Optional description for this operation
     * @param ignoreLogging - If true, this statement will not be logged
     * @param isMutation - Whether this is a data mutation operation
     * @param simpleSQLFallback - Optional simple SQL to use for loggers with logRecordChangeMetadata=false
     * @param contextUser - Optional user context for session filtering
     */
    protected async _logSqlStatement(
        query: string,
        parameters?: unknown,
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
                const matches = UUIDsEqual(session.options.filterByUserId, contextUser.ID);
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
     * Static method to log SQL statements from external sources like transaction groups.
     * Gets the current provider instance from Metadata.Provider and delegates to the
     * instance _logSqlStatement method.
     *
     * @param query - The SQL query being executed
     * @param parameters - Parameters for the query
     * @param description - Optional description for this operation
     * @param isMutation - Whether this is a data mutation operation
     * @param simpleSQLFallback - Optional simple SQL to use for loggers with logRecordChangeMetadata=false
     * @param contextUser - Optional user context for session filtering
     */
    public static async LogSQLStatement(
        query: string,
        parameters?: unknown,
        description?: string,
        isMutation: boolean = false,
        simpleSQLFallback?: string,
        contextUser?: UserInfo,
    ): Promise<void> {
        // Get the current provider instance
        const provider = Metadata.Provider as GenericDatabaseProvider;
        if (provider && provider._sqlLoggingSessions.size > 0) {
            await provider._logSqlStatement(query, parameters, description, false, isMutation, simpleSQLFallback, contextUser);
        }
    }

    /**************************************************************************/
    // Entity Actions & AI Actions (Concrete Implementations)
    /**************************************************************************/

    /**
     * Returns AI actions configured for the given entity and timing.
     * Uses AIEngine metadata to find matching EntityAIAction records.
     */
    protected override GetEntityAIActions(entityInfo: EntityInfo, before: boolean): MJEntityAIActionEntity[] {
        return AIEngine.Instance.EntityAIActions.filter(
            (a) => UUIDsEqual(a.EntityID, entityInfo.ID) && a.TriggerEvent.toLowerCase().trim() === (before ? 'before save' : 'after save'),
        );
    }

    /**
     * Handles entity actions (non-AI) for save, delete, or validate operations.
     * Uses EntityActionEngineServer to discover and run active actions.
     */
    protected override async HandleEntityActions(
        entity: BaseEntity,
        baseType: 'save' | 'delete' | 'validate',
        before: boolean,
        user: UserInfo,
    ): Promise<ActionResult[]> {
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
     * Handles Entity AI Actions for save or delete operations.
     *
     * For "before save" actions: blocks (awaits) until complete.
     * For "after save" actions: fires and forgets via QueueManager.
     *
     * Subclasses that manage transactions can override to defer after-save tasks
     * until after transaction commit (see SQLServerDataProvider).
     */
    protected override async HandleEntityAIActions(
        entity: BaseEntity,
        baseType: 'save' | 'delete',
        before: boolean,
        user: UserInfo,
    ): Promise<void> {
        try {
            if (baseType === 'delete') return; // delete not yet supported for AI actions

            await AIEngine.Instance.Config(false, user);

            const actions = this.GetEntityAIActions(entity.EntityInfo, before);
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
                            await ai.ExecuteEntityAIAction(p);
                        } else {
                            try {
                                this.EnqueueAfterSaveAIAction(p, user);
                            } catch (e) {
                                LogError(e instanceof Error ? e.message : String(e));
                            }
                        }
                    }
                }
            }
        } catch (e) {
            LogError(e);
        }
    }

    /**
     * Enqueues an after-save AI action for execution. By default, immediately adds
     * to QueueManager. Subclasses with transaction support can override to defer
     * until after transaction commit.
     */
    protected EnqueueAfterSaveAIAction(params: EntityAIActionParams, user: UserInfo): void {
        QueueManager.AddTask('Entity AI Action', params, null, user);
    }

    /**************************************************************************/
    // Save/Delete Lifecycle Hooks (Concrete Implementations)
    /**************************************************************************/

    protected override async OnValidateBeforeSave(entity: BaseEntity, user: UserInfo): Promise<string | null> {
        const validationResult = await this.HandleEntityActions(entity, 'validate', false, user);
        if (validationResult && validationResult.length > 0) {
            const message = validationResult
                .filter((v) => !v.Success)
                .map((v) => v.Message)
                .join('\n\n');
            if (message) return message;
        }
        return null;
    }

    protected override async OnBeforeSaveExecute(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions): Promise<void> {
        if (options.SkipEntityActions !== true)
            await this.HandleEntityActions(entity, 'save', true, user);
        if (options.SkipEntityAIActions !== true)
            await this.HandleEntityAIActions(entity, 'save', true, user);
    }

    protected override OnAfterSaveExecute(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions): void {
        if (options.SkipEntityAIActions !== true)
            this.HandleEntityAIActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY
        if (options.SkipEntityActions !== true)
            this.HandleEntityActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY
    }

    protected override async OnBeforeDeleteExecute(entity: BaseEntity, user: UserInfo, options: EntityDeleteOptions): Promise<void> {
        if (false === options?.SkipEntityActions)
            await this.HandleEntityActions(entity, 'delete', true, user);
        if (false === options?.SkipEntityAIActions)
            await this.HandleEntityAIActions(entity, 'delete', true, user);
    }

    protected override OnAfterDeleteExecute(entity: BaseEntity, user: UserInfo, options: EntityDeleteOptions): void {
        if (false === options?.SkipEntityActions)
            this.HandleEntityActions(entity, 'delete', false, user);
        if (false === options?.SkipEntityAIActions)
            this.HandleEntityAIActions(entity, 'delete', false, user);
    }

    /**************************************************************************/
    // PostProcessRows — Datetime Adjustment + Encryption Decryption
    /**************************************************************************/

    /**
     * Post-processes rows: first applies platform-specific datetime adjustments
     * via the virtual `AdjustDatetimeFields` hook, then handles field-level
     * decryption for encrypted fields.
     *
     * Subclasses should NOT override this method. Instead, override
     * `AdjustDatetimeFields` for platform-specific datetime corrections.
     */
    protected override async PostProcessRows(
        rows: Record<string, unknown>[],
        entityInfo: EntityInfo,
        user: UserInfo,
    ): Promise<Record<string, unknown>[]> {
        if (!rows || rows.length === 0) return rows;

        // Step 1: Platform-specific datetime adjustment (virtual hook)
        const datetimeFields = entityInfo.Fields.filter((field) => field.TSType === EntityFieldTSType.Date);
        let processedRows: Record<string, unknown>[] = rows;
        if (datetimeFields.length > 0) {
            processedRows = await this.AdjustDatetimeFields(processedRows, datetimeFields, entityInfo);
        }

        // Step 2: Encryption decryption
        const encryptedFields = entityInfo.Fields.filter((field) => field.Encrypt && field.EncryptionKeyID);
        if (encryptedFields.length === 0) return processedRows;

        const encryptionEngine = EncryptionEngine.Instance;
        await encryptionEngine.Config(false, user);

        return Promise.all(processedRows.map(async (row) => {
            const processedRow = { ...row };

            for (const field of encryptedFields) {
                const fieldValue = processedRow[field.Name];
                if (fieldValue === null || fieldValue === undefined || fieldValue === '') continue;

                const keyMarker = field.EncryptionKeyID ? encryptionEngine.GetKeyByID(field.EncryptionKeyID)?.Marker : undefined;
                if (typeof fieldValue === 'string' && encryptionEngine.IsEncrypted(fieldValue, keyMarker)) {
                    try {
                        const decryptedValue = await encryptionEngine.Decrypt(fieldValue, user);
                        processedRow[field.Name] = decryptedValue;
                    } catch (decryptError) {
                        const message = decryptError instanceof Error ? decryptError.message : String(decryptError);
                        LogError(
                            `Failed to decrypt field "${field.Name}" on entity "${entityInfo.Name}": ${message}. ` +
                            'The encrypted value will be returned unchanged.'
                        );
                    }
                }
            }

            return processedRow;
        }));
    }

    /**
     * Virtual hook for platform-specific datetime field adjustments.
     * Default implementation is a no-op (returns rows unchanged).
     *
     * SQL Server overrides this to correct datetime2/datetimeoffset/datetime
     * timezone interpretation issues in the mssql driver.
     * PostgreSQL does NOT need to override — PG timestamp types are timezone-aware natively.
     *
     * @param rows The data rows to process
     * @param datetimeFields Entity fields with TSType === Date
     * @param entityInfo The entity metadata
     * @returns The rows with datetime fields adjusted (or unchanged for default)
     */
    protected async AdjustDatetimeFields(
        rows: Record<string, unknown>[],
        datetimeFields: EntityFieldInfo[],
        entityInfo: EntityInfo,
    ): Promise<Record<string, unknown>[]> {
        return rows; // No-op by default — PG timestamps don't need adjustment
    }

    /**************************************************************************/
    // ExecuteSQLBatch — Default Batch Execution (Parallel Individual Queries)
    /**************************************************************************/

    /**
     * Executes multiple SQL queries and returns an array of result arrays, one per query.
     *
     * The default implementation runs queries in parallel using `Promise.all(ExecuteSQL(...))`.
     * Platform-specific providers can override for true multi-result-set batching:
     * - SQL Server: concatenates queries and uses a single mssql request with multiple recordsets
     * - PostgreSQL: could use pg pipeline or simple parallel execution
     *
     * @param queries Array of SQL query strings to execute
     * @param parameters Optional array of parameter arrays, one per query
     * @param options Optional batch execution options
     * @param contextUser Optional user context for logging/filtering
     * @returns Array of result arrays, one for each query
     */
    public async ExecuteSQLBatch(
        queries: string[],
        parameters?: unknown[][],
        options?: ExecuteSQLBatchOptions,
        contextUser?: UserInfo,
    ): Promise<Record<string, unknown>[][]> {
        const execOptions: ExecuteSQLOptions | undefined = options ? {
            description: options.description,
            ignoreLogging: options.ignoreLogging,
            isMutation: options.isMutation,
        } : undefined;

        const promises = queries.map((query, index) => {
            const queryParams = parameters?.[index];
            return this.ExecuteSQL<Record<string, unknown>>(query, queryParams, execOptions, contextUser);
        });

        return Promise.all(promises);
    }

    /**************************************************************************/
    // RenderViewWhereClause — View Template Rendering
    /**************************************************************************/

    /**************************************************************************/
    // InternalRunView — Shared View Execution Engine
    /**************************************************************************/

    /**
     * Returns the SQLDialect instance for this provider's platform.
     * Subclasses override to return the appropriate dialect (e.g. SQLServerDialect, PostgreSQLDialect).
     * Used by `PlatformBatchSeparator` to retrieve the correct batch separator token via
     * `@memberjunction/sql-dialect` rather than hardcoding platform strings.
     */
    protected getDialect(): SQLDialect | null {
        return null;
    }

    /**
     * Returns the batch separator token for the underlying database platform by delegating to
     * the SQLDialect instance returned by `getDialect()`.
     * SQL Server → `'GO'`, PostgreSQL → `''` (no separator needed).
     * Auto-injected as the default `batchSeparator` in `CreateSqlLogger`.
     */
    protected get PlatformBatchSeparator(): string {
        return this.getDialect()?.BatchSeparator() ?? '';
    }

    /**
     * Builds a platform-specific pagination clause.
     * SQL Server: `OFFSET X ROWS FETCH NEXT Y ROWS ONLY`
     * PostgreSQL: `LIMIT Y OFFSET X`
     */
    protected abstract BuildPaginationSQL(maxRows: number, startRow: number): string;

    /**
     * Builds a platform-specific TOP/LIMIT clause for non-paginated row limits.
     * SQL Server: `TOP N`; PostgreSQL returns empty (uses LIMIT via BuildPaginationSQL).
     * Default: returns empty string. SQL Server overrides.
     */
    protected BuildTopClause(_maxRows: number): string {
        return '';
    }

    /**
     * Builds a platform-specific non-paginated row limit clause appended at end of query.
     * SQL Server: returns '' (already handled by TOP in SELECT clause).
     * PostgreSQL: returns `LIMIT N`.
     * Default: returns empty string. PG overrides.
     */
    protected BuildNonPaginatedLimitSQL(_maxRows: number): string {
        return '';
    }

    /**
     * Transforms a user-provided SQL clause (ExtraFilter, OrderBy, etc.) for platform compatibility.
     * PostgreSQL overrides to quote mixed-case identifiers and convert bracket notation.
     * Default: returns the clause unchanged.
     */
    protected TransformExternalSQLClause(clause: string, _entityInfo: EntityInfo): string {
        return clause;
    }

    /**
     * Optionally wraps a view query with user view run logging.
     * SQL Server overrides to use spCreateUserViewRunWithDetail.
     * Default: returns null (no view run logging).
     */
    protected async executeSQLForUserViewRunLogging(
        _viewId: number,
        _entityBaseView: string,
        _whereSQL: string,
        _orderBySQL: string,
        _user: UserInfo,
    ): Promise<{ executeViewSQL: string; runID: string } | null> {
        return null;
    }

    /**
     * Shared InternalRunView implementation.
     * Handles: view resolution, permissions, field selection, WHERE clause building
     * (view + extra filter + user search + exclude + RLS), ORDER BY, pagination,
     * aggregates, parallel query execution, post-processing, and audit logging.
     */
    protected override async InternalRunView<T = unknown>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        if (params?.Aggregates?.length) {
            LogStatus(`[GenericDatabaseProvider] InternalRunView received aggregates: entityName=${params.EntityName}, viewID=${params.ViewID}, viewName=${params.ViewName}, aggregateCount=${params.Aggregates.length}`);
        }

        const startTime = new Date();
        try {
            if (!params) return null as unknown as RunViewResult<T>;

            const user = contextUser ?? this.CurrentUser;
            if (!user) throw new Error('User not found in metadata and no contextUser provided to RunView()');

            // ── View / Entity resolution ──
            let viewEntity: MJUserViewEntityExtended | null = null;
            let entityInfo: EntityInfo | null = null;

            if (params.ViewEntity) viewEntity = params.ViewEntity as MJUserViewEntityExtended;
            else if (params.ViewID && params.ViewID.length > 0) viewEntity = await ViewInfo.GetViewEntity(params.ViewID, contextUser) ?? null;
            else if (params.ViewName && params.ViewName.length > 0) viewEntity = await ViewInfo.GetViewEntityByName(params.ViewName, contextUser) ?? null;

            if (!viewEntity) {
                if (!params.EntityName || params.EntityName.length === 0) throw new Error('EntityName is required when ViewID or ViewName is not provided');
                entityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === params.EntityName!.trim().toLowerCase()) ?? null;
                if (!entityInfo) throw new Error(`Entity ${params.EntityName} not found in metadata`);
            } else {
                entityInfo = this.Entities.find((e) => UUIDsEqual(e.ID, viewEntity!.EntityID)) ?? null;
                if (!entityInfo) throw new Error(`Entity ID: ${viewEntity.EntityID} not found in metadata`);
            }

            this.CheckUserReadPermissions(entityInfo.Name, user);

            // ── Parameters (transform user-provided SQL clauses for platform compatibility) ──
            const extraFilter: string = this.TransformExternalSQLClause((params.ExtraFilter as string) || '', entityInfo);
            const userSearchString: string = params.UserSearchString ?? '';
            const excludeUserViewRunID: string = params.ExcludeUserViewRunID ?? '';
            const overrideExcludeFilter: string = params.OverrideExcludeFilter ?? '';
            const saveViewResults: boolean = params.SaveViewResults ?? false;

            // ── TOP / pagination mode ──
            const usingPagination = !!(params.MaxRows && params.MaxRows > 0 && params.StartRow !== undefined && params.StartRow >= 0);
            let topSQL = '';
            let maxRowsForQuery = 0;
            if (params.IgnoreMaxRows === true) {
                // no limit
            } else if (usingPagination) {
                // pagination — no TOP, will add OFFSET/FETCH or LIMIT/OFFSET later
                maxRowsForQuery = params.MaxRows!;
            } else if (params.MaxRows && params.MaxRows > 0) {
                topSQL = this.BuildTopClause(params.MaxRows);
                maxRowsForQuery = params.MaxRows;
            } else if (entityInfo.UserViewMaxRows && entityInfo.UserViewMaxRows > 0) {
                topSQL = this.BuildTopClause(entityInfo.UserViewMaxRows);
                maxRowsForQuery = entityInfo.UserViewMaxRows;
            }

            // ── Field selection ──
            const fields: string = this.getRunTimeViewFieldString(params, viewEntity);

            // ── Build SELECT and COUNT SQL ──
            const topFragment = topSQL ? topSQL + ' ' : '';
            let viewSQL = `SELECT ${topFragment}${fields} FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.BaseView)}`;
            let countSQL: string | null = (usingPagination || (topSQL && topSQL.length > 0))
                ? `SELECT COUNT(*) AS TotalRowCount FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.BaseView)}`
                : null;

            // ── WHERE clause assembly ──
            let whereSQL = '';
            let bHasWhere = false;

            // 1. View where clause
            if (viewEntity?.WhereClause && viewEntity.WhereClause.length > 0) {
                const renderedWhere = await this.RenderViewWhereClause(viewEntity, user);
                whereSQL = `(${renderedWhere})`;
                bHasWhere = true;
            }

            // 2. ExtraFilter
            if (extraFilter.length > 0) {
                if (!this.ValidateUserProvidedSQLClause(extraFilter))
                    throw new Error(`Invalid Extra Filter: ${extraFilter}, contains one more for forbidden keywords`);
                whereSQL = bHasWhere ? `${whereSQL} AND (${extraFilter})` : `(${extraFilter})`;
                bHasWhere = true;
            }

            // 3. User search string
            if (userSearchString.length > 0) {
                if (!this.ValidateUserProvidedSQLClause(userSearchString))
                    throw new Error(`Invalid User Search SQL clause: ${userSearchString}, contains one more for forbidden keywords`);
                const sUserSearchSQL = this.createViewUserSearchSQL(entityInfo, userSearchString);
                if (sUserSearchSQL.length > 0) {
                    whereSQL = bHasWhere ? `${whereSQL} AND (${sUserSearchSQL})` : `(${sUserSearchSQL})`;
                    bHasWhere = true;
                }
            }

            // 4. Exclude UserViewRunID
            if ((excludeUserViewRunID.length > 0) || params.ExcludeDataFromAllPriorViewRuns === true) {
                let sExcludeSQL = `${this.QuoteIdentifier(entityInfo.FirstPrimaryKey?.Name ?? 'ID')} NOT IN (SELECT RecordID FROM ${this.QuoteSchemaAndView(this.MJCoreSchemaName, 'vwUserViewRunDetails')} WHERE EntityID='${viewEntity?.EntityID}' AND`;
                if (params.ExcludeDataFromAllPriorViewRuns === true)
                    sExcludeSQL += ` UserViewID=${viewEntity?.ID})`;
                else
                    sExcludeSQL += ` UserViewRunID=${excludeUserViewRunID})`;

                if (overrideExcludeFilter.length > 0) {
                    if (!this.ValidateUserProvidedSQLClause(overrideExcludeFilter))
                        throw new Error(`Invalid OverrideExcludeFilter: ${overrideExcludeFilter}, contains one more for forbidden keywords`);
                    sExcludeSQL += ' OR (' + overrideExcludeFilter + ')';
                }
                whereSQL = bHasWhere ? `${whereSQL} AND (${sExcludeSQL})` : `(${sExcludeSQL})`;
                bHasWhere = true;
            }

            // 5. Row-Level Security
            if (!entityInfo.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)) {
                const rlsWhereClause = entityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
                if (rlsWhereClause && rlsWhereClause.length > 0) {
                    whereSQL = bHasWhere ? `${whereSQL} AND (${rlsWhereClause})` : `(${rlsWhereClause})`;
                    bHasWhere = true;
                }
            }

            if (bHasWhere) {
                viewSQL += ` WHERE ${whereSQL}`;
                if (countSQL) countSQL += ` WHERE ${whereSQL}`;
            }

            // ── ORDER BY (transform user-provided clause for platform compatibility) ──
            const rawOrderBy: string = params.OrderBy ? (params.OrderBy as string) : (viewEntity ? viewEntity.OrderByClause ?? '' : '');
            const orderBy: string = rawOrderBy.length > 0 ? this.TransformExternalSQLClause(rawOrderBy, entityInfo) : '';

            // View run logging (SQL Server-specific, others return null)
            let userViewRunID = '';
            if (viewEntity?.ID && String(viewEntity.ID).length > 0 && saveViewResults && user) {
                const logResult = await this.executeSQLForUserViewRunLogging(
                    Number(viewEntity.ID), viewEntity.EntityBaseView, whereSQL, orderBy, user,
                );
                if (logResult) {
                    viewSQL = logResult.executeViewSQL;
                    userViewRunID = logResult.runID;
                } else if (orderBy.length > 0) {
                    if (!this.ValidateUserProvidedSQLClause(orderBy)) throw new Error(`Invalid Order By clause: ${orderBy}, contains one more for forbidden keywords`);
                    viewSQL += ` ORDER BY ${orderBy}`;
                }
            } else if (orderBy.length > 0) {
                if (!this.ValidateUserProvidedSQLClause(orderBy)) throw new Error(`Invalid Order By clause: ${orderBy}, contains one more for forbidden keywords`);
                viewSQL += ` ORDER BY ${orderBy}`;
            }

            // ── Pagination / Non-paginated limit ──
            if (usingPagination && entityInfo.FirstPrimaryKey) {
                if (!orderBy) {
                    viewSQL += ` ORDER BY ${this.QuoteIdentifier(entityInfo.FirstPrimaryKey.Name)}`;
                }
                viewSQL += ' ' + this.BuildPaginationSQL(params.MaxRows!, params.StartRow!);
            } else if (!topSQL && maxRowsForQuery > 0) {
                // Platform doesn't use TOP (e.g., PG uses LIMIT at end of query)
                const limitSQL = this.BuildNonPaginatedLimitSQL(maxRowsForQuery);
                if (limitSQL) viewSQL += ' ' + limitSQL;
            }

            // ── Aggregates ──
            let aggregateSQL: string | null = null;
            let aggregateValidationErrors: AggregateResult[] = [];
            if (params.Aggregates && params.Aggregates.length > 0) {
                const aggregateBuild = this.BuildAggregateSQL(
                    params.Aggregates, entityInfo, entityInfo.SchemaName, entityInfo.BaseView, whereSQL,
                );
                aggregateSQL = aggregateBuild.aggregateSQL;
                aggregateValidationErrors = aggregateBuild.validationErrors;
            }

            // ── Execute queries in parallel ──
            const queries: Promise<unknown>[] = [];
            const queryKeys: string[] = [];

            if (params.ResultType !== 'count_only') {
                queries.push(this.ExecuteSQL(viewSQL, undefined, undefined, contextUser));
                queryKeys.push('data');
            }

            const maxRowsUsed = params.MaxRows || entityInfo.UserViewMaxRows;
            const willNeedCount = countSQL && (usingPagination || params.ResultType === 'count_only');
            if (willNeedCount) {
                queries.push(this.ExecuteSQL(countSQL!, undefined, undefined, contextUser));
                queryKeys.push('count');
            }

            const aggregateStartTime = Date.now();
            if (aggregateSQL) {
                queries.push(this.ExecuteSQL(aggregateSQL, undefined, undefined, contextUser));
                queryKeys.push('aggregate');
            }

            const results = await Promise.all(queries);
            const resultMap: Record<string, unknown> = {};
            queryKeys.forEach((key, index) => { resultMap[key] = results[index]; });

            // ── Process data rows ──
            let retData = (resultMap['data'] as Record<string, unknown>[]) || [];
            if (retData.length > 0 && params.ResultType !== 'count_only') {
                retData = await this.PostProcessRows(retData, entityInfo, user);
            }

            // ── Process count ──
            let rowCount: number | null = null;
            if (willNeedCount && resultMap['count']) {
                const countResult = resultMap['count'] as { TotalRowCount: number }[];
                if (countResult && countResult.length > 0) rowCount = countResult[0].TotalRowCount;
            } else if (countSQL && maxRowsUsed && retData.length === maxRowsUsed) {
                const countResult = await this.ExecuteSQL<{ TotalRowCount: number }>(countSQL, undefined, undefined, contextUser);
                if (countResult && countResult.length > 0) rowCount = countResult[0].TotalRowCount;
            }

            // ── Process aggregates ──
            let aggregateResults: AggregateResult[] | undefined;
            let aggregateExecutionTime: number | undefined;
            if (params.Aggregates && params.Aggregates.length > 0) {
                aggregateExecutionTime = Date.now() - aggregateStartTime;
                if (resultMap['aggregate']) {
                    const rawAggregateResult = resultMap['aggregate'] as Record<string, unknown>[];
                    if (rawAggregateResult && rawAggregateResult.length > 0) {
                        const row = rawAggregateResult[0];
                        aggregateResults = [];
                        let validExprIndex = 0;
                        for (let i = 0; i < params.Aggregates.length; i++) {
                            const agg = params.Aggregates[i];
                            const alias = agg.alias || agg.expression;
                            const validationError = aggregateValidationErrors.find(e => e.expression === agg.expression);
                            if (validationError) {
                                aggregateResults.push(validationError);
                            } else {
                                const rawValue = row[`Agg_${validExprIndex}`];
                                const value: AggregateValue = rawValue === undefined ? null : rawValue as AggregateValue;
                                aggregateResults.push({ expression: agg.expression, alias, value, error: undefined });
                                validExprIndex++;
                            }
                        }
                    }
                } else if (aggregateValidationErrors.length > 0) {
                    aggregateResults = aggregateValidationErrors;
                }
            }

            // ── Audit log ──
            const stopTime = new Date();
            if (params.ForceAuditLog || (viewEntity?.ID && (!extraFilter || extraFilter.trim().length === 0) && entityInfo.AuditViewRuns)) {
                this.CreateAuditLogRecord(user, 'Run View', 'Run View', 'Success',
                    JSON.stringify({ ViewID: viewEntity?.ID, ViewName: viewEntity?.Name, Description: params.AuditLogDescription, RowCount: retData.length, SQL: viewSQL }),
                    entityInfo.ID, null, params.AuditLogDescription ?? null, null,
                );
            }

            return {
                RowCount: params.ResultType === 'count_only' ? rowCount : retData.length,
                TotalRowCount: rowCount ?? retData.length,
                Results: retData as T[],
                UserViewRunID: userViewRunID,
                ExecutionTime: stopTime.getTime() - startTime.getTime(),
                Success: true,
                ErrorMessage: '',
                AggregateResults: aggregateResults,
                AggregateExecutionTime: aggregateExecutionTime,
            } as RunViewResult<T>;
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
                ErrorMessage: e instanceof Error ? e.message : String(e),
            } as RunViewResult<T>;
        }
    }

    protected override async InternalRunViews<T = unknown>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        const promises = params.map((p) => this.InternalRunView<T>(p, contextUser));
        return Promise.all(promises);
    }

    /**************************************************************************/
    // InternalRunView Helpers
    /**************************************************************************/

    /**
     * Builds the SQL field list string for a view query, using dialect-neutral quoting.
     * Returns '*' if no specific fields are resolved.
     */
    protected getRunTimeViewFieldString(params: RunViewParams, viewEntity: MJUserViewEntityExtended | null): string {
        const fieldList = this.getRunTimeViewFieldArray(params, viewEntity);
        if (fieldList.length === 0) return '*';
        return fieldList
            .map((f) => {
                const asString = f.CodeName === f.Name ? '' : ` AS ${this.QuoteIdentifier(f.CodeName)}`;
                return `${this.QuoteIdentifier(f.Name)}${asString}`;
            })
            .join(',');
    }

    /**
     * Resolves the list of EntityFieldInfo objects for a view query.
     * Priority: params.Fields > view columns > all entity fields (wildcard).
     */
    protected getRunTimeViewFieldArray(params: RunViewParams, viewEntity: MJUserViewEntityExtended | null): EntityFieldInfo[] {
        const fieldList: EntityFieldInfo[] = [];
        try {
            let entityInfo: EntityInfo | null = null;
            if (viewEntity) {
                entityInfo = viewEntity.ViewEntityInfo;
            } else {
                entityInfo = this.Entities.find((e) => e.Name === params.EntityName) ?? null;
                if (!entityInfo) throw new Error(`Entity ${params.EntityName} not found in metadata`);
            }

            if (params.Fields) {
                for (const ef of entityInfo.PrimaryKeys) {
                    if (!params.Fields.find((f) => f.trim().toLowerCase() === ef.Name.toLowerCase())) fieldList.push(ef);
                }
                params.Fields.forEach((f) => {
                    const field = entityInfo!.Fields.find((field) => field.Name.trim().toLowerCase() === f.trim().toLowerCase());
                    if (field) fieldList.push(field);
                    else LogError(`Field ${f} not found in entity ${entityInfo!.Name}`);
                });
            } else if (viewEntity) {
                viewEntity.Columns.forEach((c: { hidden?: boolean; EntityField?: EntityFieldInfo; Name?: string }) => {
                    if (!c.hidden) {
                        if (c.EntityField) {
                            fieldList.push(c.EntityField);
                        } else {
                            LogError(`View Field ${c.Name} doesn't match an Entity Field in entity ${entityInfo!.Name}.`);
                        }
                    }
                });
                for (const ef of entityInfo.PrimaryKeys) {
                    if (!fieldList.find((f) => f.Name?.trim().toLowerCase() === ef.Name?.toLowerCase())) fieldList.push(ef);
                }
            }
        } catch (e) {
            LogError(e);
        }
        return fieldList;
    }

    /**
     * Builds user search SQL for the given entity and search string.
     * Supports full-text search (if enabled) and field-by-field LIKE searching.
     */
    protected createViewUserSearchSQL(entityInfo: EntityInfo, userSearchString: string): string {
        let sUserSearchSQL = '';
        if (entityInfo.FullTextSearchEnabled) {
            let u = userSearchString;
            const uUpper = u.toUpperCase();
            if (uUpper.includes(' AND ') || uUpper.includes(' OR ') || uUpper.includes(' NOT ')) {
                u = uUpper.replace(/ /g, '%').replace(/%AND%/g, ' AND ').replace(/%OR%/g, ' OR ').replace(/%NOT%/g, ' NOT ');
            } else if (uUpper.includes('AND') || uUpper.includes('OR') || uUpper.includes('NOT')) {
                u = u.replace(/ /g, '%');
            } else if (u.includes(' ')) {
                if (!(u.startsWith('"') && u.endsWith('"'))) {
                    u = StripStopWords(userSearchString);
                    u = u.replace(/ /g, ' AND ');
                }
            }
            const pkName = this.QuoteIdentifier(entityInfo.FirstPrimaryKey?.Name ?? 'ID');
            sUserSearchSQL = `${pkName} IN (SELECT ${pkName} FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.FullTextSearchFunction ?? '')}('${u}'))`;
        } else {
            for (const field of entityInfo.Fields) {
                if (field.IncludeInUserSearchAPI) {
                    let sParam = '';
                    if (sUserSearchSQL.length > 0) sUserSearchSQL += ' OR ';
                    if (field.UserSearchParamFormatAPI && field.UserSearchParamFormatAPI.length > 0)
                        sParam = field.UserSearchParamFormatAPI.replace('{0}', userSearchString);
                    else
                        sParam = ` LIKE '%${userSearchString}%'`;
                    sUserSearchSQL += `(${field.Name} ${sParam})`;
                }
            }
            if (sUserSearchSQL.length > 0) sUserSearchSQL = '(' + sUserSearchSQL + ')';
        }
        return sUserSearchSQL;
    }

    /**************************************************************************/
    // RenderViewWhereClause — View Template Rendering
    /**************************************************************************/

    /**
     * Renders the WHERE clause for a saved view, replacing template variables
     * like {%UserView "viewId"%} with subquery SQL. Handles nested/recursive
     * templates with circular reference detection.
     *
     * Uses QuoteIdentifier/QuoteSchemaAndView for dialect-neutral SQL generation.
     */
    protected async RenderViewWhereClause(
        viewEntity: MJUserViewEntityExtended,
        user: UserInfo,
        stack: string[] = [],
    ): Promise<string> {
        try {
            let sWhere: string = viewEntity.WhereClause ?? '';
            if (sWhere && sWhere.length > 0) {
                const templateRegex = /{%([^%]+)%}/g;
                const matches = sWhere.match(templateRegex);
                if (matches) {
                    for (const match of matches) {
                        const variable = match.substring(2, match.length - 2);
                        const parts = variable.split(' ');
                        const variableName = parts[0];
                        if (variableName.trim().toLowerCase() === 'userview') {
                            let variableValue = parts.length > 1 ? parts[1] : null;
                            if (variableValue && variableValue.startsWith('"') && variableValue.endsWith('"'))
                                variableValue = variableValue.substring(1, variableValue.length - 1);

                            if (stack.includes(variable)) throw new Error(`Circular reference detected in view where clause for variable ${variable}`);
                            else stack.push(variable);

                            const innerViewEntity = variableValue ? await ViewInfo.GetViewEntity(variableValue, user) : null;
                            if (innerViewEntity) {
                                const innerWhere = await this.RenderViewWhereClause(innerViewEntity, user, stack);
                                const innerSQL = `SELECT ${this.QuoteIdentifier(innerViewEntity.ViewEntityInfo.FirstPrimaryKey.Name)} FROM ${this.QuoteSchemaAndView(innerViewEntity.ViewEntityInfo.SchemaName, innerViewEntity.ViewEntityInfo.BaseView)} WHERE (${innerWhere})`;
                                sWhere = sWhere.replace(match, innerSQL);
                            } else throw new Error(`View ID ${variableValue} not found in metadata`);
                        } else {
                            throw new Error(`Unknown variable ${variableName} as part of template match ${match} in view where clause`);
                        }
                    }
                }
            }
            return sWhere;
        } catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**************************************************************************/
    // Cache Check Utilities
    /**************************************************************************/

    /**
     * Compares client cache status with server status to determine if cache is current.
     * Checks both row count and maxUpdatedAt timestamp.
     */
    protected isCacheCurrent(
        clientStatus: { maxUpdatedAt: string; rowCount: number },
        serverStatus: { maxUpdatedAt?: string; rowCount?: number },
    ): boolean {
        if (clientStatus.rowCount !== serverStatus.rowCount) return false;
        const clientDate = new Date(clientStatus.maxUpdatedAt);
        const serverDate = serverStatus.maxUpdatedAt ? new Date(serverStatus.maxUpdatedAt) : null;
        if (!serverDate) return clientStatus.rowCount === 0;
        return clientDate.toISOString() === serverDate.toISOString();
    }

    /**************************************************************************/
    // RunViewsWithCacheCheck — Shared Implementation
    /**************************************************************************/

    /**
     * Smart cache validation for batch RunViews.
     * For each view request, if cacheStatus is provided, checks if the cache is current
     * by comparing MAX(__mj_UpdatedAt) and COUNT(*) with client's values.
     * Returns 'current' if cache is valid (no data), 'stale' with fresh data, or 'differential'
     * with only changed rows for entities that track record changes.
     */
    public async RunViewsWithCacheCheck<T = unknown>(
        params: RunViewWithCacheCheckParams[],
        contextUser?: UserInfo,
    ): Promise<RunViewsWithCacheCheckResponse<T>> {
        try {
            const user = contextUser || this.CurrentUser;
            if (!user) {
                return { success: false, results: [], errorMessage: 'No user context available' };
            }

            // Separate items by type: no cache check, needs validation
            const itemsWithoutCacheCheck: Array<{ index: number; item: RunViewWithCacheCheckParams }> = [];
            const itemsNeedingValidation: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo }> = [];
            const errorResults: RunViewWithCacheCheckResult<T>[] = [];

            for (let i = 0; i < params.length; i++) {
                const item = params[i];
                if (!item.cacheStatus) {
                    itemsWithoutCacheCheck.push({ index: i, item });
                    continue;
                }

                const entityInfo = this.Entities.find(
                    (e) => e.Name.trim().toLowerCase() === item.params.EntityName?.trim().toLowerCase(),
                );
                if (!entityInfo) {
                    errorResults.push({ viewIndex: i, status: 'error', errorMessage: `Entity ${item.params.EntityName} not found in metadata` });
                    continue;
                }

                try {
                    this.CheckUserReadPermissions(entityInfo.Name, user);
                    itemsNeedingValidation.push({ index: i, item, entityInfo });
                } catch (e) {
                    errorResults.push({ viewIndex: i, status: 'error', errorMessage: e instanceof Error ? e.message : String(e) });
                }
            }

            // Phase 1: Check server's LocalCacheManager first (zero DB hits)
            const currentResults: RunViewWithCacheCheckResult<T>[] = [];
            const serverCacheStaleItems: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo; serverCached: { results: unknown[]; maxUpdatedAt: string; rowCount: number } }> = [];
            const serverCacheMissItems: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo }> = [];

            for (const { index, item, entityInfo } of itemsNeedingValidation) {
                const entityLabel = item.params.EntityName || 'unknown';
                const resolved = await this.resolveFromServerCache(item, index, entityLabel);
                if (resolved) {
                    if (resolved.status === 'current') {
                        currentResults.push(resolved.result);
                    } else {
                        serverCacheStaleItems.push({ index, item, entityInfo, serverCached: resolved.serverCached! });
                    }
                } else {
                    serverCacheMissItems.push({ index, item, entityInfo });
                }
            }

            // Phase 2: For server cache misses, fall back to DB validation
            const differentialItems: Array<{
                index: number; params: RunViewParams; entityInfo: EntityInfo; whereSQL: string;
                clientMaxUpdatedAt: string; clientRowCount: number;
                serverStatus: { maxUpdatedAt?: string; rowCount?: number };
            }> = [];
            const staleItemsNoTracking: Array<{ index: number; params: RunViewParams }> = [];

            if (serverCacheMissItems.length > 0) {
                // Build WHERE clauses and run batched DB status check only for cache misses
                const itemsForDBCheck: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo; whereSQL: string }> = [];
                for (const { index, item, entityInfo } of serverCacheMissItems) {
                    try {
                        const whereSQL = await this.buildWhereClauseForCacheCheck(item.params, entityInfo, user);
                        itemsForDBCheck.push({ index, item, entityInfo, whereSQL });
                    } catch (e) {
                        errorResults.push({ viewIndex: index, status: 'error', errorMessage: e instanceof Error ? e.message : String(e) });
                    }
                }

                const cacheStatusResults = await this.getBatchedServerCacheStatus(itemsForDBCheck, contextUser);

                for (const { index, item, entityInfo, whereSQL } of itemsForDBCheck) {
                    const serverStatus = cacheStatusResults.get(index);
                    if (!serverStatus || !serverStatus.success) {
                        errorResults.push({ viewIndex: index, status: 'error', errorMessage: serverStatus?.errorMessage || 'Failed to get cache status' });
                        continue;
                    }

                    const entityLabel = item.params.EntityName || 'unknown';
                    if (this.isCacheCurrent(item.cacheStatus!, serverStatus)) {
                        LogStatusEx({ message: `    ✅ [SmartCache CURRENT] "${entityLabel}" — client cache matches DB (server cache miss)`, verboseOnly: true });
                        currentResults.push({ viewIndex: index, status: 'current' });
                    } else if (entityInfo.TrackRecordChanges) {
                        LogStatusEx({ message: `    🔄 [SmartCache DIFFERENTIAL] "${entityLabel}" — sending only changed rows (from DB)`, verboseOnly: true });
                        differentialItems.push({
                            index, params: item.params, entityInfo, whereSQL,
                            clientMaxUpdatedAt: item.cacheStatus!.maxUpdatedAt,
                            clientRowCount: item.cacheStatus!.rowCount,
                            serverStatus,
                        });
                    } else {
                        LogStatusEx({ message: `    🔍 [SmartCache STALE] "${entityLabel}" — full refresh from DB (no change tracking)`, verboseOnly: true });
                        staleItemsNoTracking.push({ index, params: item.params });
                    }
                }
            }

            // Phase 3: For items without cacheStatus (client has nothing), check server cache before hitting DB
            const noCacheStatusServedFromCache: Array<{ index: number; serverCached: { results: unknown[]; maxUpdatedAt: string; rowCount: number } }> = [];
            const noCacheStatusNeedsDB: Array<{ index: number; item: RunViewWithCacheCheckParams }> = [];

            for (const entry of itemsWithoutCacheCheck) {
                if (LocalCacheManager.Instance.IsInitialized) {
                    const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(entry.item.params, this.InstanceConnectionString);
                    const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
                    if (cached) {
                        const entityLabel = entry.item.params.EntityName || 'unknown';
                        LogStatusEx({ message: `    📦 [SmartCache SERVE-FROM-CACHE] "${entityLabel}" — client has no cache, serving ${cached.rowCount} rows from server cache, no DB hit`, verboseOnly: true });
                        noCacheStatusServedFromCache.push({ index: entry.index, serverCached: cached });
                        continue;
                    }
                }
                noCacheStatusNeedsDB.push(entry);
            }

            // Phase 4: Run queries in parallel for items needing data
            const queryPromises: Promise<RunViewWithCacheCheckResult<T>>[] = [
                // Items without cache check — served from server cache
                ...noCacheStatusServedFromCache.map(({ index, serverCached }) =>
                    this.serveFromServerCache<T>(index, serverCached),
                ),
                // Items without cache check — server cache miss, must hit DB
                ...noCacheStatusNeedsDB.map(({ index, item }) =>
                    this.runFullQueryAndCacheResult<T>(item.params, index, contextUser),
                ),
                // Server cache stale — serve from server's cached data (zero DB)
                ...serverCacheStaleItems.map(({ index, serverCached }) =>
                    this.serveFromServerCache<T>(index, serverCached),
                ),
                // DB-validated stale items (no change tracking)
                ...staleItemsNoTracking.map(({ index, params: viewParams }) =>
                    this.runFullQueryAndCacheResult<T>(viewParams, index, contextUser),
                ),
                // DB-validated differential items
                ...differentialItems.map(({ index, params: viewParams, entityInfo, whereSQL, clientMaxUpdatedAt, clientRowCount, serverStatus }) =>
                    this.runDifferentialQueryAndReturn<T>(viewParams, entityInfo, clientMaxUpdatedAt, clientRowCount, serverStatus, whereSQL, index, contextUser),
                ),
            ];

            const fullQueryResults = await Promise.all(queryPromises);
            const allResults = [...errorResults, ...currentResults, ...fullQueryResults];
            allResults.sort((a, b) => a.viewIndex - b.viewIndex);

            const entities = params.map(p => p.params.EntityName || 'unknown').join(', ');
            const totalServerCacheHits = (itemsNeedingValidation.length - serverCacheMissItems.length) + noCacheStatusServedFromCache.length;
            const totalChecked = itemsNeedingValidation.length + itemsWithoutCacheCheck.length;
            const totalDBQueries = noCacheStatusNeedsDB.length + staleItemsNoTracking.length + differentialItems.length;
            LogStatusEx({ message: `  📊 [SmartCache] Batch [${entities}] — ${currentResults.length} current, ${serverCacheStaleItems.length + noCacheStatusServedFromCache.length} served-from-cache, ${differentialItems.length} differential, ${totalDBQueries} full-query, ${errorResults.length} errors (server cache: ${totalServerCacheHits}/${totalChecked} hits)`, verboseOnly: true });

            return { success: true, results: allResults };
        } catch (e) {
            LogError(e);
            return { success: false, results: [], errorMessage: e instanceof Error ? e.message : String(e) };
        }
    }

    /**
     * Builds the WHERE clause for cache status check, using same logic as InternalRunView.
     * Handles ExtraFilter, UserSearch, and Row-Level Security.
     * Subclasses can override to add platform-specific SQL transformations (e.g., identifier quoting).
     */
    protected async buildWhereClauseForCacheCheck(
        params: RunViewParams,
        entityInfo: EntityInfo,
        user: UserInfo,
    ): Promise<string> {
        let whereSQL = '';
        let bHasWhere = false;

        const extraFilter = this.TransformExternalSQLClause((params.ExtraFilter as string) || '', entityInfo);
        if (extraFilter.length > 0) {
            if (!this.ValidateUserProvidedSQLClause(extraFilter))
                throw new Error(`Invalid Extra Filter: ${extraFilter}`);
            whereSQL = `(${extraFilter})`;
            bHasWhere = true;
        }

        if (params.UserSearchString && params.UserSearchString.length > 0) {
            if (!this.ValidateUserProvidedSQLClause(params.UserSearchString))
                throw new Error(`Invalid User Search SQL clause: ${params.UserSearchString}`);
            const sUserSearchSQL = this.createViewUserSearchSQL(entityInfo, params.UserSearchString);
            if (sUserSearchSQL.length > 0) {
                whereSQL = bHasWhere ? `${whereSQL} AND (${sUserSearchSQL})` : `(${sUserSearchSQL})`;
                bHasWhere = true;
            }
        }

        if (!entityInfo.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)) {
            const rlsWhereClause = entityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
            if (rlsWhereClause && rlsWhereClause.length > 0) {
                whereSQL = bHasWhere ? `${whereSQL} AND (${rlsWhereClause})` : `(${rlsWhereClause})`;
            }
        }

        return whereSQL;
    }

    /**
     * Executes cache status checks for multiple views.
     * Default: parallel individual queries (works on all platforms).
     * SQL Server overrides to use ExecuteSQLBatch for multi-result-set efficiency.
     */
    protected async getBatchedServerCacheStatus(
        items: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo; whereSQL: string }>,
        contextUser?: UserInfo,
    ): Promise<Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>> {
        const results = new Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>();
        if (items.length === 0) return results;

        const promises = items.map(async ({ index, entityInfo, whereSQL }) => {
            try {
                const statusSQL = `SELECT COUNT(*) AS ${this.QuoteIdentifier('TotalRows')}, MAX(${this.QuoteIdentifier('__mj_UpdatedAt')}) AS ${this.QuoteIdentifier('MaxUpdatedAt')} FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.BaseView)}${whereSQL ? ' WHERE ' + whereSQL : ''}`;
                const rows = await this.ExecuteSQL<Record<string, unknown>>(statusSQL, undefined, undefined, contextUser);
                if (rows && rows.length > 0) {
                    const row = rows[0];
                    results.set(index, {
                        success: true,
                        rowCount: Number(row['TotalRows']),
                        maxUpdatedAt: row['MaxUpdatedAt'] ? new Date(String(row['MaxUpdatedAt'])).toISOString() : undefined,
                    });
                } else {
                    results.set(index, { success: true, rowCount: 0, maxUpdatedAt: undefined });
                }
            } catch (e) {
                results.set(index, { success: false, errorMessage: e instanceof Error ? e.message : String(e) });
            }
        });

        await Promise.all(promises);
        return results;
    }

    /**
     * Runs a full view query and returns results with cache metadata.
     */
    protected async runFullQueryAndReturn<T = unknown>(
        params: RunViewParams,
        viewIndex: number,
        contextUser?: UserInfo,
    ): Promise<RunViewWithCacheCheckResult<T>> {
        const result = await this.InternalRunView<T>(params, contextUser);
        if (!result.Success) {
            return { viewIndex, status: 'error', errorMessage: result.ErrorMessage || 'Unknown error executing view' };
        }
        const maxUpdatedAt = this.extractMaxUpdatedAt(result.Results);
        return { viewIndex, status: 'stale', results: result.Results, maxUpdatedAt, rowCount: result.Results.length };
    }

    /**
     * Runs a full query and stores the result in the server's LocalCacheManager.
     * Used by RunViewsWithCacheCheck to populate the server cache for future requests.
     */
    protected async runFullQueryAndCacheResult<T = unknown>(
        params: RunViewParams,
        viewIndex: number,
        contextUser?: UserInfo,
    ): Promise<RunViewWithCacheCheckResult<T>> {
        const result = await this.runFullQueryAndReturn<T>(params, viewIndex, contextUser);
        // Cache the result so subsequent RunViewsWithCacheCheck calls can skip DB
        if (result.status !== 'error' && result.results && LocalCacheManager.Instance.IsInitialized) {
            const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, this.InstanceConnectionString);
            const maxUpdatedAt = result.maxUpdatedAt || new Date().toISOString();
            await LocalCacheManager.Instance.SetRunViewResult(fingerprint, params, result.results, maxUpdatedAt);
        }
        return result;
    }

    /**
     * Checks the server's LocalCacheManager for cached data matching the client's request.
     * Returns the resolution if found (either 'current' or server-cached data to serve),
     * or null if the server cache doesn't have this data.
     */
    private async resolveFromServerCache(
        item: RunViewWithCacheCheckParams,
        index: number,
        entityLabel: string,
    ): Promise<{ status: 'current'; result: RunViewWithCacheCheckResult<never> } | { status: 'stale'; serverCached: { results: unknown[]; maxUpdatedAt: string; rowCount: number } } | null> {
        if (!LocalCacheManager.Instance.IsInitialized) return null;

        const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(item.params, this.InstanceConnectionString);
        const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
        if (!cached) return null;

        const serverStatus = { maxUpdatedAt: cached.maxUpdatedAt, rowCount: cached.rowCount };
        if (this.isCacheCurrent(item.cacheStatus!, serverStatus)) {
            LogStatusEx({ message: `    ✅ [SmartCache CURRENT] "${entityLabel}" — client cache matches server cache, no DB hit`, verboseOnly: true });
            return { status: 'current', result: { viewIndex: index, status: 'current' } };
        }

        // Server has newer data than client — we can serve it directly from cache
        LogStatusEx({ message: `    📦 [SmartCache SERVE-FROM-CACHE] "${entityLabel}" — serving ${cached.rowCount} rows from server cache, no DB hit`, verboseOnly: true });
        return { status: 'stale', serverCached: cached };
    }

    /**
     * Packages server-cached data as a RunViewWithCacheCheckResult for return to the client.
     */
    private async serveFromServerCache<T = unknown>(
        viewIndex: number,
        serverCached: { results: unknown[]; maxUpdatedAt: string; rowCount: number },
    ): Promise<RunViewWithCacheCheckResult<T>> {
        return {
            viewIndex,
            status: 'stale',
            results: serverCached.results as T[],
            maxUpdatedAt: serverCached.maxUpdatedAt,
            rowCount: serverCached.rowCount,
        };
    }

    /**
     * Runs a differential query and returns only changes since the client's cached state.
     * Includes updated/created rows and deleted record IDs.
     * Falls back to full query if hidden deletes are detected.
     */
    protected async runDifferentialQueryAndReturn<T = unknown>(
        params: RunViewParams,
        entityInfo: EntityInfo,
        clientMaxUpdatedAt: string,
        clientRowCount: number,
        serverStatus: { maxUpdatedAt?: string; rowCount?: number },
        whereSQL: string,
        viewIndex: number,
        contextUser?: UserInfo,
    ): Promise<RunViewWithCacheCheckResult<T>> {
        try {
            const updatedRows = await this.getUpdatedRowsSince<T>(params, entityInfo, clientMaxUpdatedAt, whereSQL, contextUser);
            const deletedRecordIDs = await this.getDeletedRecordIDsSince(entityInfo.ID, clientMaxUpdatedAt, contextUser);

            // Validation: detect hidden deletes not tracked in RecordChanges
            const clientMaxUpdatedDate = new Date(clientMaxUpdatedAt);
            const newInserts = updatedRows.filter(row => {
                const createdAt = (row as Record<string, unknown>)['__mj_CreatedAt'];
                if (!createdAt) return false;
                return new Date(String(createdAt)) > clientMaxUpdatedDate;
            }).length;

            const serverRowCount = serverStatus.rowCount ?? 0;
            const impliedDeletes = clientRowCount + newInserts - serverRowCount;
            const actualDeletes = deletedRecordIDs.length;

            if (impliedDeletes < 0) {
                LogStatus(`Differential validation failed for ${entityInfo.Name}: impliedDeletes=${impliedDeletes} (negative). Falling back to full refresh.`);
                return this.runFullQueryAndReturn<T>(params, viewIndex, contextUser);
            }

            if (impliedDeletes > actualDeletes) {
                LogStatus(`Differential validation failed for ${entityInfo.Name}: hidden deletes detected (implied=${impliedDeletes}, actual=${actualDeletes}). Falling back to full refresh.`);
                return this.runFullQueryAndReturn<T>(params, viewIndex, contextUser);
            }

            const newMaxUpdatedAt = updatedRows.length > 0
                ? this.extractMaxUpdatedAt(updatedRows)
                : serverStatus.maxUpdatedAt || new Date().toISOString();

            return {
                viewIndex,
                status: 'differential',
                differentialData: { updatedRows, deletedRecordIDs },
                maxUpdatedAt: newMaxUpdatedAt,
                rowCount: serverStatus.rowCount,
            };
        } catch (e) {
            LogError(e);
            return { viewIndex, status: 'error', errorMessage: e instanceof Error ? e.message : String(e) };
        }
    }

    /**
     * Gets IDs of records deleted since a given timestamp.
     * Uses dialect-neutral quoting. Subclasses can override for parameterized queries.
     */
    protected async getDeletedRecordIDsSince(
        entityID: string,
        sinceTimestamp: string,
        contextUser?: UserInfo,
    ): Promise<string[]> {
        try {
            const sql = `SELECT DISTINCT ${this.QuoteIdentifier('RecordID')} FROM ${this.QuoteSchemaAndView(this.MJCoreSchemaName, 'vwRecordChanges')} WHERE ${this.QuoteIdentifier('EntityID')} = '${entityID}' AND ${this.QuoteIdentifier('Type')} = 'Delete' AND ${this.QuoteIdentifier('ChangedAt')} > '${sinceTimestamp}'`;
            const results = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, contextUser);
            return results.map(r => String(r['RecordID']));
        } catch (e) {
            LogError(e);
            return [];
        }
    }

    /**
     * Gets rows updated/created since a given timestamp.
     * Uses dialect-neutral quoting and TransformExternalSQLClause for OrderBy.
     */
    protected async getUpdatedRowsSince<T = unknown>(
        params: RunViewParams,
        entityInfo: EntityInfo,
        sinceTimestamp: string,
        whereSQL: string,
        contextUser?: UserInfo,
    ): Promise<T[]> {
        try {
            const timestampFilter = `${this.QuoteIdentifier('__mj_UpdatedAt')} > '${sinceTimestamp}'`;
            const combinedWhere = whereSQL
                ? `(${whereSQL}) AND ${timestampFilter}`
                : timestampFilter;

            const fields = params.Fields && params.Fields.length > 0
                ? params.Fields.map(f => this.QuoteIdentifier(f)).join(', ')
                : '*';

            let sql = `SELECT ${fields} FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.BaseView)} WHERE ${combinedWhere}`;

            const orderBy = this.TransformExternalSQLClause((params.OrderBy as string) || '', entityInfo);
            if (orderBy.length > 0) {
                if (!this.ValidateUserProvidedSQLClause(orderBy))
                    throw new Error(`Invalid OrderBy clause: ${orderBy}`);
                sql += ` ORDER BY ${orderBy}`;
            }

            return await this.ExecuteSQL<T>(sql, undefined, undefined, contextUser);
        } catch (e) {
            LogError(e);
            return [];
        }
    }

    /**************************************************************************/
    // RunQueriesWithCacheCheck — Shared Implementation
    /**************************************************************************/

    /**
     * Smart cache validation for batch RunQueries.
     * For each query, if cacheStatus is provided, checks CacheValidationSQL to determine staleness.
     * Returns 'current' if cache is valid, 'stale' with fresh data, or 'no_validation' if
     * the query has no CacheValidationSQL configured.
     */
    public async RunQueriesWithCacheCheck<T = unknown>(
        params: RunQueryWithCacheCheckParams[],
        contextUser?: UserInfo,
    ): Promise<RunQueriesWithCacheCheckResponse<T>> {
        try {
            const user = contextUser || this.CurrentUser;
            if (!user) {
                return { success: false, results: [], errorMessage: 'No user context available' };
            }

            const itemsNeedingCacheCheck: Array<{ index: number; item: RunQueryWithCacheCheckParams; queryInfo: QueryInfo }> = [];
            const itemsWithoutCacheCheck: Array<{ index: number; item: RunQueryWithCacheCheckParams }> = [];
            const itemsWithoutValidationSQL: Array<{ index: number; item: RunQueryWithCacheCheckParams; queryInfo: QueryInfo }> = [];
            const errorResults: RunQueryWithCacheCheckResult<T>[] = [];

            for (let i = 0; i < params.length; i++) {
                const item = params[i];
                const queryInfo = this.resolveQueryInfo(item.params);
                if (!queryInfo) {
                    errorResults.push({ queryIndex: i, queryId: item.params.QueryID || '', status: 'error', errorMessage: `Query not found: ${item.params.QueryID || item.params.QueryName}` });
                    continue;
                }

                if (!queryInfo.UserCanRun(user)) {
                    errorResults.push({ queryIndex: i, queryId: queryInfo.ID, status: 'error', errorMessage: `User does not have permission to run query: ${queryInfo.Name}` });
                    continue;
                }

                if (!item.cacheStatus) {
                    itemsWithoutCacheCheck.push({ index: i, item });
                    continue;
                }

                if (!queryInfo.CacheValidationSQL) {
                    itemsWithoutValidationSQL.push({ index: i, item, queryInfo });
                    continue;
                }

                itemsNeedingCacheCheck.push({ index: i, item, queryInfo });
            }

            const cacheStatusResults = await this.getBatchedQueryCacheStatus(itemsNeedingCacheCheck, contextUser);

            const staleItems: Array<{ index: number; params: RunQueryParams; queryInfo: QueryInfo }> = [];
            const currentResults: RunQueryWithCacheCheckResult<T>[] = [];

            for (const { index, item, queryInfo } of itemsNeedingCacheCheck) {
                const serverStatus = cacheStatusResults.get(index);
                if (!serverStatus || !serverStatus.success) {
                    errorResults.push({ queryIndex: index, queryId: queryInfo.ID, status: 'error', errorMessage: serverStatus?.errorMessage || 'Failed to get cache status' });
                    continue;
                }

                if (this.isCacheCurrent(item.cacheStatus!, serverStatus)) {
                    currentResults.push({ queryIndex: index, queryId: queryInfo.ID, status: 'current' });
                } else {
                    staleItems.push({ index, params: item.params, queryInfo });
                }
            }

            const fullQueryPromises: Promise<RunQueryWithCacheCheckResult<T>>[] = [
                ...itemsWithoutCacheCheck.map(({ index, item }) =>
                    this.runFullQueryAndReturnForQuery<T>(item.params, index, 'stale', contextUser),
                ),
                ...itemsWithoutValidationSQL.map(({ index, item, queryInfo }) =>
                    this.runFullQueryAndReturnForQuery<T>(item.params, index, 'no_validation', contextUser, queryInfo.ID),
                ),
                ...staleItems.map(({ index, params: queryParams, queryInfo }) =>
                    this.runFullQueryAndReturnForQuery<T>(queryParams, index, 'stale', contextUser, queryInfo.ID),
                ),
            ];

            const fullQueryResults = await Promise.all(fullQueryPromises);
            const allResults = [...errorResults, ...currentResults, ...fullQueryResults];
            allResults.sort((a, b) => a.queryIndex - b.queryIndex);

            return { success: true, results: allResults };
        } catch (e) {
            LogError(e);
            return { success: false, results: [], errorMessage: e instanceof Error ? e.message : String(e) };
        }
    }

    /**
     * Resolves QueryInfo from RunQueryParams (by ID or Name+CategoryPath).
     * Tries QueryEngine first for fresh data, falls back to ProviderBase cache.
     */
    protected resolveQueryInfo(params: RunQueryParams): QueryInfo | undefined {
        const freshEntity = this.findQueryInEngine(
            params.QueryID, params.QueryName, params.CategoryID, params.CategoryPath,
        );
        if (freshEntity) return this.refreshQueryInfoFromEntity(freshEntity);

        if (params.QueryID) return this.Queries.find(q => UUIDsEqual(q.ID, params.QueryID));

        if (params.QueryName) {
            const matchingQueries = this.Queries.filter(
                q => q.Name.trim().toLowerCase() === params.QueryName?.trim().toLowerCase(),
            );
            if (matchingQueries.length === 0) return undefined;
            if (matchingQueries.length === 1) return matchingQueries[0];

            if (params.CategoryPath) {
                const byPath = matchingQueries.find(
                    q => q.CategoryPath.toLowerCase() === params.CategoryPath?.toLowerCase(),
                );
                if (byPath) return byPath;
            }

            if (params.CategoryID) {
                const byId = matchingQueries.find(q => UUIDsEqual(q.CategoryID, params.CategoryID));
                if (byId) return byId;
            }

            return matchingQueries[0];
        }

        return undefined;
    }

    /**
     * Searches QueryEngine for a fresh query entity.
     */
    protected findQueryInEngine(QueryID: string | undefined, QueryName: string | undefined, CategoryID: string | undefined, CategoryPath: string | undefined): MJQueryEntity | null {
        const engineQueries = QueryEngine.Instance?.Queries;
        if (!engineQueries || engineQueries.length === 0) return null;

        if (QueryID) {
            const lower = QueryID.trim().toLowerCase();
            return engineQueries.find(q => q.ID.trim().toLowerCase() === lower) ?? null;
        }

        if (QueryName) {
            const lowerName = QueryName.trim().toLowerCase();
            const matches = engineQueries.filter(q => q.Name.trim().toLowerCase() === lowerName);
            if (matches.length === 0) return null;
            if (matches.length === 1) return matches[0];

            if (CategoryID) {
                const byId = matches.find(q => q.CategoryID?.trim().toLowerCase() === CategoryID.trim().toLowerCase());
                if (byId) return byId;
            }
            if (CategoryPath) {
                const resolvedCategoryId = this.resolveCategoryPath(CategoryPath);
                if (resolvedCategoryId) {
                    const byPath = matches.find(q => UUIDsEqual(q.CategoryID, resolvedCategoryId));
                    if (byPath) return byPath;
                }
            }
            return matches[0];
        }

        return null;
    }

    /**
     * Validates that a query can be executed by the given user. Checks both permissions
     * and approval status. Permission failures throw an error. Non-approved status
     * emits a console warning but allows execution to proceed, enabling query testing
     * before formal approval.
     *
     * @param query - The resolved QueryInfo to validate
     * @param contextUser - The user attempting to execute the query
     * @throws Error if the user does not have permission to run the query
     */
    protected ValidateQueryForExecution(query: QueryInfo, contextUser?: UserInfo): void {
        const user = contextUser || this.CurrentUser;
        if (user && !query.UserHasRunPermissions(user)) {
            throw new Error(`User does not have permission to run query '${query.Name}' (ID: ${query.ID})`);
        }

        if (query.Status !== 'Approved') {
            LogStatus(`WARNING: Executing query '${query.Name}' (ID: ${query.ID}) with status '${query.Status}'. Query has not been approved.`);
        }
    }

    /**
     * Creates a fresh QueryInfo from a MJQueryEntity and patches the ProviderBase cache.
     */
    protected refreshQueryInfoFromEntity(entity: MJQueryEntity): QueryInfo {
        const freshInfo = new QueryInfo(entity.GetAll());
        const existingIndex = this.Queries.findIndex(q => UUIDsEqual(q.ID, freshInfo.ID));
        if (existingIndex >= 0) {
            this.Queries[existingIndex] = freshInfo;
        } else {
            this.Queries.push(freshInfo);
        }
        return freshInfo;
    }

    /**
     * Resolves a category path string to a QueryCategoryInfo ID.
     */
    protected resolveCategoryPath(categoryPath: string): string | null {
        if (!categoryPath) return null;
        const segments = categoryPath.split('/').map(s => s.trim()).filter(s => s.length > 0);
        if (segments.length === 0) return null;

        let currentCategory: QueryCategoryInfo | null = null;
        for (const segment of segments) {
            const parentId: string | null = currentCategory !== null ? currentCategory.ID : null;
            currentCategory = this.QueryCategories.find(cat =>
                cat.Name.trim().toLowerCase() === segment.toLowerCase() && UUIDsEqual(cat.ParentID, parentId),
            ) ?? null;
            if (!currentCategory) return null;
        }
        return currentCategory?.ID || null;
    }

    /**
     * Executes cache status checks for multiple queries using their CacheValidationSQL.
     * Default: parallel individual queries. SQL Server overrides for batch execution.
     */
    protected async getBatchedQueryCacheStatus(
        items: Array<{ index: number; item: RunQueryWithCacheCheckParams; queryInfo: QueryInfo }>,
        contextUser?: UserInfo,
    ): Promise<Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>> {
        const results = new Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>();
        if (items.length === 0) return results;

        const promises = items.map(async ({ index, queryInfo }) => {
            try {
                const rows = await this.ExecuteSQL<Record<string, unknown>>(queryInfo.CacheValidationSQL!, undefined, undefined, contextUser);
                if (rows && rows.length > 0) {
                    const row = rows[0];
                    results.set(index, {
                        success: true,
                        rowCount: Number(row['RowCount']),
                        maxUpdatedAt: row['MaxUpdatedAt'] ? new Date(String(row['MaxUpdatedAt'])).toISOString() : undefined,
                    });
                } else {
                    results.set(index, { success: true, rowCount: 0, maxUpdatedAt: undefined });
                }
            } catch (e) {
                results.set(index, { success: false, errorMessage: e instanceof Error ? e.message : String(e) });
            }
        });

        await Promise.all(promises);
        return results;
    }

    /**
     * Runs a full query and returns results with cache metadata.
     */
    protected async runFullQueryAndReturnForQuery<T = unknown>(
        params: RunQueryParams,
        queryIndex: number,
        status: 'stale' | 'no_validation',
        contextUser?: UserInfo,
        queryId?: string,
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
    // InternalRunQuery — Shared Pipeline Implementation
    /**************************************************************************/

    private _queryCacheInitialized: boolean = false;

    private get QueryCacheMgr(): QueryCacheManager {
        if (!this._queryCacheInitialized) {
            QueryCacheManager.Instance.Init(this.InstanceConnectionString);
            this._queryCacheInitialized = true;
        }
        return QueryCacheManager.Instance;
    }

    /**
     * Full query execution pipeline: resolve → validate → compose → template → cache check →
     * execute → paginate → audit → cache store. Platform providers inherit this; only
     * `ExecuteSQL()` is platform-specific.
     */
    protected async InternalRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        // Route ad-hoc SQL queries to dedicated handler
        if (params.SQL) {
            return this.ExecuteAdhocQuery(params, contextUser);
        }

        try {
            // Find and validate query
            const query = this.findAndValidateQuery(params, contextUser);

            // Process parameters (composition + Nunjucks templates)
            const { finalSQL, appliedParameters } = this.processQueryParameters(query, params.Parameters, contextUser);

            // Execute query — use SQL-level paging when requested, else fetch all rows
            const useSQLPaging = QueryPagingEngine.ShouldPage(params.StartRow, params.MaxRows);
            const cacheConfig = query.CacheConfig;
            let paginatedResult: Record<string, unknown>[];
            let totalRowCount: number;
            let executionTime: number;
            let fullResult: Record<string, unknown>[] | undefined;

            if (useSQLPaging) {
                // Check paged cache before executing SQL
                const pagedCacheHit = await this.checkPagedQueryCache(query, params, appliedParameters);
                if (pagedCacheHit) {
                    return pagedCacheHit;
                }

                const paging = QueryPagingEngine.WrapWithPaging(
                    finalSQL,
                    params.StartRow!,
                    params.MaxRows!,
                    this.PlatformKey as DatabasePlatform,
                );

                // Check count cache — skip COUNT SQL if we have a cached total
                const cachedCount = cacheConfig?.enabled
                    ? await this.QueryCacheMgr.GetTotalRowCount(query, params.Parameters || {})
                    : null;

                const start = Date.now();
                if (cachedCount != null) {
                    // Only execute data query — count is cached
                    const dataResult = await this.ExecuteSQL<Record<string, unknown>>(paging.DataSQL, undefined, undefined, contextUser);
                    executionTime = Date.now() - start;
                    if (!dataResult) throw new Error('Error executing paged query SQL');
                    paginatedResult = dataResult;
                    totalRowCount = cachedCount;
                } else {
                    // Execute data + count queries in parallel
                    const [dataResult, countResult] = await Promise.all([
                        this.ExecuteSQL<Record<string, unknown>>(paging.DataSQL, undefined, undefined, contextUser),
                        this.ExecuteSQL<Record<string, unknown>>(paging.CountSQL, undefined, undefined, contextUser),
                    ]);
                    executionTime = Date.now() - start;
                    if (!dataResult) throw new Error('Error executing paged query SQL');

                    paginatedResult = dataResult;
                    totalRowCount = countResult?.[0]?.TotalRowCount != null
                        ? Number(countResult[0].TotalRowCount)
                        : paginatedResult.length;

                    // Cache the count for subsequent page requests (fire-and-forget)
                    if (cacheConfig?.enabled) {
                        void this.QueryCacheMgr.SetTotalRowCount(query, params.Parameters || {}, totalRowCount);
                    }
                }

                // Cache the paged results (fire-and-forget)
                if (cacheConfig?.enabled) {
                    void this.QueryCacheMgr.SetPaged(query, params.Parameters || {}, params.StartRow!, params.MaxRows!, paginatedResult);
                    void this.QueryCacheMgr.InvalidateWithDependents(query);
                }
            } else {
                // Check full-result cache before executing
                const cachedResult = await this.checkQueryCache(query, params, appliedParameters);
                if (cachedResult) {
                    return cachedResult;
                }

                // No paging requested — execute full query, apply in-memory pagination as fallback
                const timing = await this.executeQueryWithTiming(finalSQL, contextUser);
                executionTime = timing.executionTime;
                fullResult = timing.result;

                const paginated = this.applyQueryPagination(fullResult, params);
                paginatedResult = paginated.paginatedResult;
                totalRowCount = paginated.totalRowCount;

                // Cache full (unpaginated) results if enabled (fire-and-forget)
                void this.cacheQueryResults(query, params.Parameters || {}, fullResult);
            }

            // Handle audit logging (fire-and-forget)
            this.auditQueryExecution(query, params, finalSQL, paginatedResult.length, totalRowCount, executionTime, contextUser);

            return {
                Success: true,
                QueryID: query.ID,
                QueryName: query.Name,
                Results: paginatedResult,
                RowCount: paginatedResult.length,
                TotalRowCount: totalRowCount,
                PageNumber: useSQLPaging ? Math.floor(params.StartRow! / params.MaxRows!) + 1 : undefined,
                PageSize: useSQLPaging ? params.MaxRows! : undefined,
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
                QueryID: params.QueryID ?? '',
                QueryName: params.QueryName ?? '',
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: errorMessage,
            };
        }
    }

    /**
     * Batch query execution — runs all queries in parallel.
     */
    protected async InternalRunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]> {
        return Promise.all(params.map(p => this.InternalRunQuery(p, contextUser)));
    }

    /**
     * Executes an ad-hoc SQL query directly, with security validation.
     * SQL must be a SELECT or WITH (CTE) statement — mutations are rejected.
     */
    protected async ExecuteAdhocQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        try {
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

            // Check ad-hoc cache if opt-in TTL is provided
            const adhocTTL = params.AdhocCacheTTLMinutes;
            if (adhocTTL != null && adhocTTL > 0) {
                const cached = await this.QueryCacheMgr.GetAdhoc(params.SQL!, adhocTTL);
                if (cached) {
                    const { paginatedResult, totalRowCount } = this.applyQueryPagination(
                        cached.results as Record<string, unknown>[], params,
                    );
                    return {
                        Success: true,
                        QueryID: '',
                        QueryName: 'Ad-Hoc Query',
                        Results: paginatedResult,
                        RowCount: paginatedResult.length,
                        TotalRowCount: totalRowCount,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                        CacheHit: true,
                    };
                }
            }

            const { result, executionTime } = await this.executeQueryWithTiming(params.SQL!, contextUser);

            // Store in ad-hoc cache if opt-in (fire-and-forget)
            if (adhocTTL != null && adhocTTL > 0) {
                void this.QueryCacheMgr.SetAdhoc(params.SQL!, adhocTTL, result);
            }

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
     * Finds a query from RunQueryParams and validates user permissions.
     * Uses `resolveQueryInfo()` for lookup and `ValidateQueryForExecution()` for permissions.
     */
    protected findAndValidateQuery(params: RunQueryParams, contextUser?: UserInfo): QueryInfo {
        const query = this.resolveQueryInfo(params);
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

        this.ValidateQueryForExecution(query, contextUser);
        return query;
    }

    /**
     * Processes query parameters: resolves `{{query:"..."}}` composition tokens,
     * then applies Nunjucks template substitution for `{{param}}` tokens.
     */
    protected processQueryParameters(
        query: QueryInfo,
        parameters?: Record<string, string>,
        contextUser?: UserInfo,
    ): { finalSQL: string; appliedParameters: Record<string, string> } {
        let finalSQL = query.GetPlatformSQL(this.PlatformKey);
        let appliedParameters: Record<string, string> = {};

        // Step 1: Resolve {{query:"..."}} composition tokens BEFORE Nunjucks processing
        const compositionResult = this._compositionEngine.HasCompositionTokens(finalSQL) && contextUser
            ? this._compositionEngine.ResolveComposition(finalSQL, this.PlatformKey, contextUser, parameters)
            : { ResolvedSQL: finalSQL, CTEs: [], DependencyGraph: new Map<string, string[]>(), HasCompositions: false, AnyDependencyUsesTemplates: false };
        finalSQL = compositionResult.ResolvedSQL;

        // Step 2: Process Nunjucks template parameters.
        // UsesTemplate is transitive: if ANY dependency uses templates, we must run Nunjucks
        // even if the outer query itself has UsesTemplate = false.
        const needsTemplateProcessing = query.UsesTemplate || compositionResult.AnyDependencyUsesTemplates;

        if (needsTemplateProcessing) {
            const processingResult = QueryParameterProcessor.processQueryTemplate(
                query,
                parameters,
                finalSQL,
                compositionResult.AnyDependencyUsesTemplates
            );

            if (!processingResult.success) {
                throw new Error(processingResult.error);
            }

            finalSQL = processingResult.processedSQL;
            appliedParameters = (processingResult.appliedParameters || {}) as Record<string, string>;
        } else if (parameters && Object.keys(parameters).length > 0) {
            LogStatus('Warning: Parameters provided but query does not use templates. Parameters will be ignored.');
        }

        return { finalSQL, appliedParameters };
    }

    /**
     * Lower-layer execution: resolves composition, processes templates, executes SQL.
     * This is the single execution pathway used by both saved queries (via RunQuery upper layer)
     * and transient test queries (via TestQuerySQL resolver).
     *
     * Processing order:
     * 1. Resolve {{query:"..."}} composition tokens → CTEs (inline deps checked first, then Metadata)
     * 2. Process {{ param }} Nunjucks templates (if UsesTemplate or any dependency uses templates)
     * 3. Apply MaxRows safety limit (wrap with TOP/LIMIT if specified)
     * 4. Execute the fully resolved SQL
     * 5. Return results with execution metadata
     */
    protected override async InternalExecuteQueryFromSpec(
        spec: QueryExecutionSpec,
        contextUser?: UserInfo,
    ): Promise<RunQueryResult> {
        try {
            const { finalSQL, appliedParameters } = this.resolveSpecParameters(spec, contextUser);

            // Execute
            const { result, executionTime } = await this.executeQueryWithTiming(finalSQL, contextUser);

            return {
                Success: true,
                QueryID: '',
                QueryName: '',
                Results: result ?? [],
                RowCount: result?.length ?? 0,
                TotalRowCount: result?.length ?? 0,
                ExecutionTime: executionTime,
                ErrorMessage: '',
                AppliedParameters: appliedParameters,
            };
        } catch (e) {
            LogError(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            return {
                Success: false,
                QueryID: '',
                QueryName: '',
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: errorMessage,
            };
        }
    }

    /**
     * Resolves composition tokens and Nunjucks templates for a QueryExecutionSpec.
     * Shared logic used by both `InternalExecuteQueryFromSpec` and can be reused
     * if `processQueryParameters` is refactored in the future.
     */
    private resolveSpecParameters(
        spec: QueryExecutionSpec,
        contextUser?: UserInfo,
    ): { finalSQL: string; appliedParameters: Record<string, string> } {
        let finalSQL = spec.SQL;
        let appliedParameters: Record<string, string> = {};

        // Step 1: Resolve {{query:"..."}} composition tokens (with inline deps support)
        const compositionResult = this._compositionEngine.HasCompositionTokens(finalSQL) && contextUser
            ? this._compositionEngine.ResolveComposition(finalSQL, this.PlatformKey, contextUser, spec.Parameters, spec.Dependencies)
            : { ResolvedSQL: finalSQL, CTEs: [], DependencyGraph: new Map<string, string[]>(), HasCompositions: false, AnyDependencyUsesTemplates: false };
        finalSQL = compositionResult.ResolvedSQL;

        // Step 2: Process Nunjucks templates
        const needsTemplateProcessing = spec.UsesTemplate || compositionResult.AnyDependencyUsesTemplates;
        if (needsTemplateProcessing) {
            const templateInput = {
                SQL: spec.SQL,
                UsesTemplate: spec.UsesTemplate ?? false,
                Parameters: spec.ParameterDefinitions ?? [],
            };
            // Skip unknown-parameter validation when a dependency uses templates (existing behavior)
            // OR when no formal ParameterDefinitions were provided (transient specs from TestQuerySQL
            // don't have definitions — parameters should pass through to Nunjucks without validation).
            const skipUnknownParamCheck = compositionResult.AnyDependencyUsesTemplates || !spec.ParameterDefinitions;
            const processingResult = QueryParameterProcessor.processQueryTemplate(
                templateInput,
                spec.Parameters,
                finalSQL,
                skipUnknownParamCheck
            );
            if (!processingResult.success) {
                throw new Error(processingResult.error);
            }
            finalSQL = processingResult.processedSQL;
            appliedParameters = (processingResult.appliedParameters || {}) as Record<string, string>;
        } else if (spec.Parameters && Object.keys(spec.Parameters).length > 0) {
            LogStatus('Warning: Parameters provided but query does not use templates. Parameters will be ignored.');
        }

        // Step 3: Apply MaxRows safety limit
        if (spec.MaxRows != null && spec.MaxRows > 0) {
            finalSQL = this.wrapWithMaxRows(finalSQL, spec.MaxRows);
        }

        return { finalSQL, appliedParameters };
    }

    /**
     * Wraps SQL with a row limit for safety when testing transient queries.
     * Uses platform-aware syntax: TOP N for SQL Server, LIMIT N for PostgreSQL.
     */
    private wrapWithMaxRows(sql: string, maxRows: number): string {
        const platform = this.PlatformKey as DatabasePlatform;
        const trimmed = sql.trim();

        // Don't wrap if already has a TOP or LIMIT clause
        if (/\bTOP\s+\d/i.test(trimmed) || /\bLIMIT\s+\d/i.test(trimmed)) {
            return sql;
        }

        if (platform === 'postgresql') {
            // Append LIMIT N — handle trailing semicolons
            const withoutSemicolon = trimmed.replace(/;\s*$/, '');
            return `${withoutSemicolon}\nLIMIT ${maxRows}`;
        }

        // SQL Server: inject TOP N after SELECT (handling SELECT DISTINCT)
        return trimmed.replace(
            /^(SELECT\s+(?:DISTINCT\s+)?)/i,
            `$1TOP ${maxRows} `
        );
    }

    /**
     * Checks the query cache for existing results and returns them if valid.
     */
    protected async checkQueryCache(
        query: QueryInfo,
        params: RunQueryParams,
        appliedParameters: Record<string, string>,
    ): Promise<RunQueryResult | null> {
        const cacheConfig = query.CacheConfig;
        if (!cacheConfig?.enabled) {
            return null;
        }

        const cached = await this.QueryCacheMgr.Get(query, params.Parameters || {});
        if (!cached) {
            return null;
        }

        LogStatus(`Cache hit for query ${query.Name} (${query.ID})`);

        const { paginatedResult, totalRowCount } = this.applyQueryPagination(
            cached.results as Record<string, unknown>[], params,
        );

        return {
            Success: true,
            QueryID: query.ID,
            QueryName: query.Name,
            Results: paginatedResult,
            RowCount: paginatedResult.length,
            TotalRowCount: totalRowCount,
            ExecutionTime: 0,
            ErrorMessage: '',
            AppliedParameters: appliedParameters,
            CacheHit: true,
            CacheTTLRemaining: cached.ttlRemainingMs,
        } as RunQueryResult & { CacheHit: boolean; CacheTTLRemaining: number };
    }

    /**
     * Checks the paged cache for a specific page of query results.
     * Returns a full RunQueryResult on hit, null on miss.
     */
    protected async checkPagedQueryCache(
        query: QueryInfo,
        params: RunQueryParams,
        appliedParameters: Record<string, string>,
    ): Promise<RunQueryResult | null> {
        const cacheConfig = query.CacheConfig;
        if (!cacheConfig?.enabled) return null;

        const cached = await this.QueryCacheMgr.GetPaged(
            query, params.Parameters || {}, params.StartRow!, params.MaxRows!,
        );
        if (!cached) return null;

        // Also try to get the cached count
        const cachedCount = await this.QueryCacheMgr.GetTotalRowCount(query, params.Parameters || {});
        const totalRowCount = cachedCount ?? cached.results.length;

        LogStatus(`Paged cache hit for query ${query.Name} (${query.ID}) page ${params.StartRow}+${params.MaxRows}`);

        return {
            Success: true,
            QueryID: query.ID,
            QueryName: query.Name,
            Results: cached.results as Record<string, unknown>[],
            RowCount: cached.results.length,
            TotalRowCount: totalRowCount,
            PageNumber: Math.floor(params.StartRow! / params.MaxRows!) + 1,
            PageSize: params.MaxRows!,
            ExecutionTime: 0,
            ErrorMessage: '',
            AppliedParameters: appliedParameters,
            CacheHit: true,
            CacheTTLRemaining: cached.ttlRemainingMs,
        } as RunQueryResult & { CacheHit: boolean; CacheTTLRemaining: number };
    }

    /**
     * Executes the query SQL and tracks execution time.
     */
    protected async executeQueryWithTiming(
        sql: string,
        contextUser?: UserInfo,
    ): Promise<{ result: Record<string, unknown>[]; executionTime: number }> {
        const start = Date.now();
        const result = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, contextUser);
        const executionTime = Date.now() - start;

        if (!result) {
            throw new Error('Error executing query SQL');
        }

        return { result, executionTime };
    }

    /**
     * Applies in-memory pagination to query results based on StartRow and MaxRows parameters.
     */
    protected applyQueryPagination(
        results: Record<string, unknown>[],
        params: RunQueryParams,
    ): { paginatedResult: Record<string, unknown>[]; totalRowCount: number } {
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
     * Creates an audit log record for query execution (fire-and-forget).
     * Only logs if the query has `AuditQueryRuns` enabled or `ForceAuditLog` is set.
     */
    protected auditQueryExecution(
        query: QueryInfo,
        params: RunQueryParams,
        finalSQL: string,
        rowCount: number,
        totalRowCount: number,
        executionTime: number,
        contextUser?: UserInfo,
    ): void {
        if (!params.ForceAuditLog && !query.AuditQueryRuns) {
            return;
        }

        const user = contextUser || this.CurrentUser;
        if (!user) return;

        this.CreateAuditLogRecord(
            user,
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
                SQL: finalSQL,
            }),
            '',
            query.ID,
            params.AuditLogDescription ?? null,
            { IgnoreDirtyState: true },
        ).catch(error => {
            console.error('Error creating audit log:', error);
        });
    }

    /**
     * Caches query results if caching is enabled for the query.
     * Caches the full result set (before pagination).
     */
    protected async cacheQueryResults(query: QueryInfo, parameters: Record<string, string>, results: Record<string, unknown>[]): Promise<void> {
        const cacheConfig = query.CacheConfig;
        if (!cacheConfig?.enabled) {
            return;
        }

        await this.QueryCacheMgr.Set(query, parameters, results);
        await this.QueryCacheMgr.InvalidateWithDependents(query);
        LogStatus(`Cached results for query ${query.Name} (${query.ID})`);
    }

    /**************************************************************************/
    // Load — Shared Implementation
    /**************************************************************************/

    /**
     * Loads a single entity record by composite key, with optional relationship loading.
     * Uses dialect-neutral quoting for all SQL construction.
     */
    public async Load(
        entity: BaseEntity,
        compositeKey: CompositeKey,
        entityRelationshipsToLoad: string[] | null = null,
        user: UserInfo,
    ): Promise<Record<string, unknown> | null> {
        const entityInfo = entity.EntityInfo;

        // Build WHERE from composite key
        const where = compositeKey.KeyValuePairs.map(val => {
            const pk = entityInfo.PrimaryKeys.find(p => p.Name.trim().toLowerCase() === val.FieldName.trim().toLowerCase());
            if (!pk) throw new Error(`Primary key ${val.FieldName} not found in entity ${entityInfo.Name}`);
            const quotes = pk.NeedsQuotes ? "'" : '';
            return `${this.QuoteIdentifier(pk.CodeName)}=${quotes}${val.Value}${quotes}`;
        }).join(' AND ');

        // Append Read RLS filter if user is not exempt
        let fullWhere = where;
        if (user && !entityInfo.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)) {
            const rlsWhereClause = entityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
            if (rlsWhereClause && rlsWhereClause.length > 0) {
                fullWhere = `${where} AND (${rlsWhereClause})`;
            }
        }

        const sql = `SELECT * FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.BaseView)} WHERE ${fullWhere}`;
        const rawData = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, user);
        const d = await this.PostProcessRows(rawData, entityInfo, user);

        if (d && d.length > 0) {
            const ret = d[0];

            // Trim trailing spaces for fixed-width char fields (char/nchar pad with spaces on both SQL Server and PG)
            for (const field of entityInfo.Fields) {
                if (field.TSType === EntityFieldTSType.String &&
                    field.Type.toLowerCase().includes('char') &&
                    !field.Type.toLowerCase().includes('varchar')) {
                    const val = ret[field.Name];
                    if (typeof val === 'string') ret[field.Name] = val.trimEnd();
                }
            }

            // Load entity relationships if requested
            if (entityRelationshipsToLoad && entityRelationshipsToLoad.length > 0) {
                for (const rel of entityRelationshipsToLoad) {
                    const relInfo = entityInfo.RelatedEntities.find(r => r.RelatedEntity === rel);
                    if (!relInfo) continue;

                    const relEntityInfo = this.Entities.find(e => e.Name.trim().toLowerCase() === relInfo.RelatedEntity.trim().toLowerCase());
                    if (!relEntityInfo) continue;

                    const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
                    const pkValue = ret[entity.FirstPrimaryKey.Name];
                    let relSql: string;

                    if (relInfo.Type.trim().toLowerCase() === 'one to many') {
                        relSql = `SELECT * FROM ${this.QuoteSchemaAndView(relEntityInfo.SchemaName, relInfo.RelatedEntityBaseView)} WHERE ${this.QuoteIdentifier(relInfo.RelatedEntityJoinField)} = ${quotes}${pkValue}${quotes}`;
                    } else {
                        // many to many — use join view
                        relSql = `SELECT _theview.* FROM ${this.QuoteSchemaAndView(relEntityInfo.SchemaName, relInfo.RelatedEntityBaseView)} _theview INNER JOIN ${this.QuoteSchemaAndView(relEntityInfo.SchemaName, relInfo.JoinView)} _jv ON _theview.${this.QuoteIdentifier(relInfo.RelatedEntityJoinField)} = _jv.${this.QuoteIdentifier(relInfo.JoinEntityInverseJoinField)} WHERE _jv.${this.QuoteIdentifier(relInfo.JoinEntityJoinField)} = ${quotes}${pkValue}${quotes}`;
                    }

                    const rawRelData = await this.ExecuteSQL<Record<string, unknown>>(relSql, undefined, undefined, user);
                    if (rawRelData && rawRelData.length > 0) {
                        ret[rel] = await this.PostProcessRows(rawRelData, relEntityInfo, user);
                    }
                }
            }
            return ret;
        }
        return null;
    }

    /**************************************************************************/
    // Row-Level Security Checks
    /**************************************************************************/

    /**
     * Checks whether an existing record passes the RLS filter for a given permission type.
     * Executes: SELECT COUNT(*) AS cnt FROM view WHERE PK=value AND (RLS filter)
     * Returns true if the record matches (cnt > 0), false otherwise.
     */
    protected override async CheckRecordRLS(
        entity: BaseEntity,
        user: UserInfo,
        type: EntityPermissionType
    ): Promise<boolean> {
        const entityInfo = entity.EntityInfo;
        if (entityInfo.UserExemptFromRowLevelSecurity(user, type)) {
            return true;
        }

        const rlsWhereClause = entityInfo.GetUserRowLevelSecurityWhereClause(user, type, '');
        if (!rlsWhereClause || rlsWhereClause.length === 0) {
            return true;
        }

        const pkWhere = entity.PrimaryKeys.map(pk => {
            const fieldInfo = entityInfo.Fields.find(f => f.Name === pk.Name);
            const quotes = fieldInfo?.NeedsQuotes ? "'" : '';
            return `${this.QuoteIdentifier(pk.Name)}=${quotes}${pk.Value}${quotes}`;
        }).join(' AND ');

        const sql = `SELECT COUNT(*) AS cnt FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.BaseView)} WHERE ${pkWhere} AND (${rlsWhereClause})`;
        const result = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, user);
        return result && result.length > 0 && Number(result[0]['cnt']) > 0;
    }

    /**
     * Checks whether a new record's field values pass the Create RLS filter.
     * Builds a synthetic single-row subquery from entity field values, then tests the RLS filter against it.
     */
    protected override async CheckCreateRLS(
        entity: BaseEntity,
        user: UserInfo
    ): Promise<boolean> {
        const entityInfo = entity.EntityInfo;
        if (entityInfo.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Create)) {
            return true;
        }

        const rlsWhereClause = entityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Create, '');
        if (!rlsWhereClause || rlsWhereClause.length === 0) {
            return true;
        }

        const projections = this.BuildCreateRLSProjections(entity, entityInfo);
        const sql = `SELECT CASE WHEN (${rlsWhereClause}) THEN 1 ELSE 0 END AS pass FROM (SELECT ${projections}) AS newrow`;
        const result = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, user);
        return result && result.length > 0 && Number(result[0]['pass']) === 1;
    }

    /**
     * Builds field projections for the Create RLS synthetic row subquery.
     * Only includes non-virtual fields that have non-null values.
     */
    private BuildCreateRLSProjections(entity: BaseEntity, entityInfo: EntityInfo): string {
        const parts: string[] = [];
        for (const field of entityInfo.Fields) {
            if (field.IsVirtual) continue;
            const val = entity.Get(field.Name);
            if (val == null) continue;

            let sqlVal: string;
            if (typeof val === 'boolean') {
                sqlVal = val ? '1' : '0';
            } else if (field.NeedsQuotes) {
                sqlVal = `'${String(val).replace(/'/g, "''")}'`;
            } else {
                sqlVal = String(val);
            }
            parts.push(`${sqlVal} AS ${this.QuoteIdentifier(field.Name)}`);
        }
        return parts.join(', ');
    }

    /**************************************************************************/
    // GetDatasetByName — Shared Implementation
    /**************************************************************************/

    /**
     * Builds a parameter placeholder for parameterized queries.
     * Default: PG-style ($1, $2, ...). SQL Server overrides to @p0, @p1, etc.
     */
    protected BuildParameterPlaceholder(index: number): string {
        return `$${index + 1}`;
    }

    /**
     * Retrieves a dataset by name, executing all item queries via ExecuteSQLBatch
     * and aggregating results. Uses dialect-neutral quoting for all SQL construction.
     *
     * ExecuteSQLBatch gives SQL Server true multi-result-set batching automatically,
     * while PG (and the default) use parallel individual queries.
     */
    public async GetDatasetByName(
        datasetName: string,
        itemFilters?: DatasetItemFilterType[],
        contextUser?: UserInfo,
        providerToUse?: IMetadataProvider,
        forceRefresh?: boolean,
    ): Promise<DatasetResultType> {
        const provider = (providerToUse ?? this) as GenericDatabaseProvider;
        const schema = provider.MJCoreSchemaName;

        // Build metadata SQL with dialect-neutral quoting
        const sSQL = `SELECT di.*, ` +
            `e.${provider.QuoteIdentifier('BaseView')} AS ${provider.QuoteIdentifier('EntityBaseView')}, ` +
            `e.${provider.QuoteIdentifier('SchemaName')} AS ${provider.QuoteIdentifier('EntitySchemaName')}, ` +
            `di.${provider.QuoteIdentifier('__mj_UpdatedAt')} AS ${provider.QuoteIdentifier('DatasetItemUpdatedAt')}, ` +
            `d.${provider.QuoteIdentifier('__mj_UpdatedAt')} AS ${provider.QuoteIdentifier('DatasetUpdatedAt')} ` +
            `FROM ${provider.QuoteSchemaAndView(schema, 'vwDatasets')} d ` +
            `INNER JOIN ${provider.QuoteSchemaAndView(schema, 'vwDatasetItems')} di ON d.${provider.QuoteIdentifier('ID')} = di.${provider.QuoteIdentifier('DatasetID')} ` +
            `INNER JOIN ${provider.QuoteSchemaAndView(schema, 'vwEntities')} e ON di.${provider.QuoteIdentifier('EntityID')} = e.${provider.QuoteIdentifier('ID')} ` +
            `WHERE d.${provider.QuoteIdentifier('Name')} = ${provider.BuildParameterPlaceholder(0)}`;

        const items = await provider.ExecuteSQL<Record<string, unknown>>(sSQL, [datasetName], undefined, contextUser);

        if (!items || items.length === 0) {
            return {
                DatasetID: '',
                DatasetName: datasetName,
                Success: false,
                Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
                LatestUpdateDate: new Date(0),
                Results: [],
            };
        }

        // Phase 1: Check LocalCacheManager for each item, build SQL only for cache misses
        // When forceRefresh is true (e.g. from a hard Refresh() call), skip the cache entirely
        // so we get fresh data from the database.
        const overallStart = performance.now();
        const cache = LocalCacheManager.Instance;
        const cacheAvailable = !forceRefresh && cache.IsInitialized && this.TrustLocalCacheCompletely;

        const errorResults: DatasetItemResultType[] = [];
        const cachedResults: DatasetItemResultType[] = [];
        const uncachedQueries: string[] = [];
        const uncachedItems: Record<string, unknown>[] = [];
        // Track fingerprints for uncached items so we can write-through after SQL
        const uncachedFingerprints: string[] = [];

        let cacheHitCount = 0;
        let cacheMissCount = 0;

        for (const item of items) {
            const entitySchemaName = String(item['EntitySchemaName'] ?? schema);
            const entityBaseView = String(item['EntityBaseView']);
            const code = String(item['Code']);
            const entityName = String(item['Entity']);
            const entityID = String(item['EntityID']);
            const whereClause = item['WhereClause'] ? String(item['WhereClause']) : '';

            // Build effective filter (WhereClause + optional runtime ItemFilter)
            let effectiveFilter = whereClause;
            if (itemFilters && itemFilters.length > 0) {
                const filter = itemFilters.find(f => f.ItemCode === code);
                if (filter) {
                    effectiveFilter = whereClause
                        ? `${whereClause} AND (${filter.Filter})`
                        : filter.Filter;
                }
            }

            // Try cache first
            if (cacheAvailable) {
                const fingerprint = cache.GenerateRunViewFingerprint(
                    { EntityName: entityName, ExtraFilter: effectiveFilter } as RunViewParams,
                    this.InstanceConnectionString
                );
                const cached = await cache.GetRunViewResult(fingerprint);
                if (cached) {
                    cacheHitCount++;
                    const dateFieldToCheck = String(item['DateFieldToCheck'] ?? '__mj_UpdatedAt');
                    const latestUpdateDate = this.computeLatestUpdateDate(cached.results, dateFieldToCheck, item);
                    cachedResults.push({
                        EntityID: entityID,
                        EntityName: entityName,
                        Code: code,
                        Results: cached.results as Record<string, unknown>[],
                        LatestUpdateDate: latestUpdateDate,
                        Success: true,
                    });
                    continue; // Skip SQL for this item
                }
            }

            // Cache miss — validate columns and build SQL
            cacheMissCount++;
            const columns = provider.getColumnsForDatasetItem(item, datasetName);
            if (!columns) {
                errorResults.push({
                    EntityID: entityID,
                    EntityName: entityName,
                    Code: code,
                    Results: [],
                    LatestUpdateDate: undefined,
                    Status: 'Invalid columns specified for dataset item',
                    Success: false,
                });
                continue;
            }

            const filterSQL = effectiveFilter ? 'WHERE ' + effectiveFilter : '';
            uncachedQueries.push(`SELECT ${columns} FROM ${provider.QuoteSchemaAndView(entitySchemaName, entityBaseView)} ${filterSQL}`);
            uncachedItems.push(item);
            // Store fingerprint for write-through caching after SQL
            const fp = cacheAvailable
                ? cache.GenerateRunViewFingerprint(
                    { EntityName: entityName, ExtraFilter: effectiveFilter } as RunViewParams,
                    this.InstanceConnectionString
                )
                : '';
            uncachedFingerprints.push(fp);
        }

        // Phase 2: Execute SQL only for cache misses
        let batchResults: Record<string, unknown>[][] = [];
        if (uncachedQueries.length > 0) {
            try {
                batchResults = await provider.ExecuteSQLBatch(uncachedQueries, undefined, undefined, contextUser);
            } catch (err) {
                LogError(`GetDatasetByName: Batch execution failed: ${err instanceof Error ? err.message : String(err)}`);
                // Fall through with empty results
            }
        }

        // Phase 3: Process SQL results and write-through to cache
        const sqlResults: DatasetItemResultType[] = [];

        for (let i = 0; i < uncachedItems.length; i++) {
            const item = uncachedItems[i];
            const entityName = String(item['Entity']);
            const entityID = String(item['EntityID']);
            const code = String(item['Code']);
            const dateFieldToCheck = String(item['DateFieldToCheck'] ?? '__mj_UpdatedAt');

            let itemData = batchResults[i] || [];

            // Post-process rows for encryption/datetime
            if (itemData.length > 0) {
                const entityInfo = provider.Entities.find(e =>
                    e.Name.trim().toLowerCase() === entityName.trim().toLowerCase(),
                );
                if (entityInfo && contextUser) {
                    itemData = await provider.PostProcessRows(itemData, entityInfo, contextUser);
                }
            }

            const latestUpdateDate = this.computeLatestUpdateDate(itemData, dateFieldToCheck, item);

            // Write-through: cache this result for future requests (including empty results)
            if (cacheAvailable && uncachedFingerprints[i]) {
                const maxUpdatedAt = itemData.length > 0
                    ? this.extractMaxUpdatedAtFromRows(itemData, dateFieldToCheck)
                    : new Date(0).toISOString();
                const syntheticParams = { EntityName: entityName } as RunViewParams;
                await cache.SetRunViewResult(uncachedFingerprints[i], syntheticParams, itemData, maxUpdatedAt);
            }

            sqlResults.push({
                EntityID: entityID,
                EntityName: entityName,
                Code: code,
                Results: itemData,
                LatestUpdateDate: latestUpdateDate,
                Success: itemData !== null && itemData !== undefined,
            });
        }

        // Merge results: errors + cached + SQL (maintain original item order via code matching)
        const results: DatasetItemResultType[] = [];
        for (const item of items) {
            const code = String(item['Code']);
            const found = errorResults.find(r => r.Code === code)
                ?? cachedResults.find(r => r.Code === code)
                ?? sqlResults.find(r => r.Code === code);
            if (found) results.push(found);
        }

        const elapsedMs = (performance.now() - overallStart).toFixed(1);
        LogStatusEx({
            message: `📊 [Dataset] GetDatasetByName("${datasetName}"): ${cacheHitCount} cache hits, ${cacheMissCount} cache misses, ${errorResults.length} errors — ${elapsedMs}ms`,
            verboseOnly: true
        });

        // Aggregate results
        const bSuccess = results.every(result => result.Success);
        const latestUpdateDate = results.reduce(
            (acc, result) => {
                if (result?.LatestUpdateDate) {
                    const theDate = new Date(result.LatestUpdateDate);
                    if (theDate.getTime() > acc.getTime()) return theDate;
                }
                return acc;
            },
            new Date(0),
        );

        return {
            DatasetID: String(items[0]['DatasetID']),
            DatasetName: datasetName,
            Success: bSuccess,
            Status: '',
            LatestUpdateDate: latestUpdateDate,
            Results: results,
        };
    }

    /**************************************************************************/
    // GetDatasetStatusByName — Shared Implementation
    /**************************************************************************/

    /**
     * Retrieves status information for a dataset by name: per-entity row count and
     * latest update date. Uses ExecuteSQLBatch for per-item status queries.
     */
    public async GetDatasetStatusByName(
        datasetName: string,
        itemFilters?: DatasetItemFilterType[],
        contextUser?: UserInfo,
        providerToUse?: IMetadataProvider,
    ): Promise<DatasetStatusResultType> {
        const overallStart = performance.now();
        const provider = (providerToUse ?? this) as GenericDatabaseProvider;
        const schema = provider.MJCoreSchemaName;
        const cache = LocalCacheManager.Instance;
        const cacheAvailable = cache.IsInitialized && this.TrustLocalCacheCompletely;

        // Fetch dataset items metadata (lightweight — just the dataset definition, not entity data)
        const sSQL = `SELECT di.*, ` +
            `e.${provider.QuoteIdentifier('BaseView')} AS ${provider.QuoteIdentifier('EntityBaseView')}, ` +
            `e.${provider.QuoteIdentifier('SchemaName')} AS ${provider.QuoteIdentifier('EntitySchemaName')}, ` +
            `d.${provider.QuoteIdentifier('__mj_UpdatedAt')} AS ${provider.QuoteIdentifier('DatasetUpdatedAt')}, ` +
            `di.${provider.QuoteIdentifier('__mj_UpdatedAt')} AS ${provider.QuoteIdentifier('DatasetItemUpdatedAt')} ` +
            `FROM ${provider.QuoteSchemaAndView(schema, 'vwDatasets')} d ` +
            `INNER JOIN ${provider.QuoteSchemaAndView(schema, 'vwDatasetItems')} di ON d.${provider.QuoteIdentifier('ID')} = di.${provider.QuoteIdentifier('DatasetID')} ` +
            `INNER JOIN ${provider.QuoteSchemaAndView(schema, 'vwEntities')} e ON di.${provider.QuoteIdentifier('EntityID')} = e.${provider.QuoteIdentifier('ID')} ` +
            `WHERE d.${provider.QuoteIdentifier('Name')} = ${provider.BuildParameterPlaceholder(0)}`;

        const items = await provider.ExecuteSQL<Record<string, unknown>>(sSQL, [datasetName], undefined, contextUser);

        if (!items || items.length === 0) {
            return {
                DatasetID: '',
                DatasetName: datasetName,
                Success: false,
                Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
                LatestUpdateDate: new Date(0),
                EntityUpdateDates: [],
            };
        }

        // Phase 1: Try to derive status from cached data for each item
        const updateDates: DatasetStatusEntityUpdateDateType[] = [];
        let overallLatestDate = new Date(1900, 1, 1);
        let cacheHitCount = 0;
        let cacheMissCount = 0;

        // Collect items that need SQL fallback
        const uncachedItems: Record<string, unknown>[] = [];
        const uncachedItemMeta: Array<{ entityID: string; entityName: string; datasetMaxUpdatedAt: string }> = [];

        for (const item of items) {
            const entityID = String(item['EntityID']);
            const entityName = String(item['Entity']);
            const code = String(item['Code']);
            const dateFieldToCheck = String(item['DateFieldToCheck'] ?? '__mj_UpdatedAt');
            const whereClause = item['WhereClause'] ? String(item['WhereClause']) : '';

            // Build effective filter for fingerprint
            let effectiveFilter = whereClause;
            if (itemFilters && itemFilters.length > 0) {
                const filter = itemFilters.find(f => f.ItemCode === code);
                if (filter) {
                    effectiveFilter = whereClause
                        ? `${whereClause} AND (${filter.Filter})`
                        : filter.Filter;
                }
            }

            const itemUpdatedAt = new Date(String(item['DatasetItemUpdatedAt']));
            const datasetUpdatedAt = new Date(String(item['DatasetUpdatedAt']));
            const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime()));

            // Try to derive status from cached data
            if (cacheAvailable) {
                const fingerprint = cache.GenerateRunViewFingerprint(
                    { EntityName: entityName, ExtraFilter: effectiveFilter } as RunViewParams,
                    this.InstanceConnectionString
                );
                const cached = await cache.GetRunViewResult(fingerprint);
                if (cached) {
                    cacheHitCount++;
                    // Derive MAX(dateField) and COUNT(*) directly from cached rows
                    let maxDateFromRows = new Date(1900, 1, 1);
                    for (const row of cached.results) {
                        const record = row as Record<string, unknown>;
                        if (record[dateFieldToCheck]) {
                            const d = new Date(String(record[dateFieldToCheck]));
                            if (d > maxDateFromRows) maxDateFromRows = d;
                        }
                    }
                    const updateDate = maxDateFromRows > datasetMaxUpdatedAt ? maxDateFromRows : datasetMaxUpdatedAt;
                    updateDates.push({
                        EntityID: entityID,
                        EntityName: entityName,
                        RowCount: cached.results.length,
                        UpdateDate: updateDate,
                    });
                    if (updateDate > overallLatestDate) overallLatestDate = updateDate;
                    continue; // No SQL needed for this item
                }
            }

            // Cache miss — need SQL fallback
            cacheMissCount++;
            uncachedItems.push(item);
            uncachedItemMeta.push({ entityID, entityName, datasetMaxUpdatedAt: datasetMaxUpdatedAt.toISOString() });
        }

        // Phase 2: Execute SQL only for cache misses
        if (uncachedItems.length > 0) {
            const queries = uncachedItems.map((item, idx) => {
                const entitySchemaName = String(item['EntitySchemaName'] ?? schema);
                const entityBaseView = String(item['EntityBaseView']);
                const code = String(item['Code']);
                const dateFieldToCheck = String(item['DateFieldToCheck'] ?? '__mj_UpdatedAt');
                const meta = uncachedItemMeta[idx];

                let filterSQL = '';
                if (itemFilters && itemFilters.length > 0) {
                    const filter = itemFilters.find(f => f.ItemCode === code);
                    if (filter) filterSQL = ' WHERE ' + filter.Filter;
                }

                return `SELECT ` +
                    `CASE ` +
                    `WHEN MAX(${provider.QuoteIdentifier(dateFieldToCheck)}) > '${meta.datasetMaxUpdatedAt}' THEN MAX(${provider.QuoteIdentifier(dateFieldToCheck)}) ` +
                    `ELSE '${meta.datasetMaxUpdatedAt}' ` +
                    `END AS ${provider.QuoteIdentifier('UpdateDate')}, ` +
                    `COUNT(*) AS ${provider.QuoteIdentifier('TheRowCount')} ` +
                    `FROM ${provider.QuoteSchemaAndView(entitySchemaName, entityBaseView)}${filterSQL}`;
            });

            let batchResults: Record<string, unknown>[][] = [];
            try {
                batchResults = await provider.ExecuteSQLBatch(queries, undefined, undefined, contextUser);
            } catch (err) {
                LogError(`GetDatasetStatusByName: Batch execution failed: ${err instanceof Error ? err.message : String(err)}`);
            }

            for (let i = 0; i < uncachedItemMeta.length; i++) {
                const meta = uncachedItemMeta[i];
                const statusRows = batchResults[i];
                if (statusRows && statusRows.length > 0) {
                    const updateDate = new Date(String(statusRows[0]['UpdateDate']));
                    updateDates.push({
                        EntityID: meta.entityID,
                        EntityName: meta.entityName,
                        RowCount: Number(statusRows[0]['TheRowCount']),
                        UpdateDate: updateDate,
                    });
                    if (updateDate > overallLatestDate) {
                        overallLatestDate = updateDate;
                    }
                }
            }
        }

        const elapsedMs = (performance.now() - overallStart).toFixed(1);
        LogStatusEx({
            message: `📊 [Dataset Status] GetDatasetStatusByName("${datasetName}"): ${cacheHitCount} cache-derived, ${cacheMissCount} SQL queries — ${elapsedMs}ms`,
            verboseOnly: true
        });

        if (updateDates.length === 0) {
            return {
                DatasetID: String(items[0]['DatasetID']),
                DatasetName: datasetName,
                Success: false,
                Status: 'No update dates found for DatasetName: ' + datasetName,
                LatestUpdateDate: new Date(0),
                EntityUpdateDates: [],
            };
        }

        return {
            DatasetID: String(items[0]['DatasetID']),
            DatasetName: datasetName,
            Success: true,
            Status: '',
            LatestUpdateDate: overallLatestDate,
            EntityUpdateDates: updateDates,
        };
    }

    /**************************************************************************/
    // getColumnsForDatasetItem — Column Validation
    /**************************************************************************/

    /**
     * Validates columns for a dataset item and returns the column list string.
     * Returns null if columns are invalid.
     */
    protected getColumnsForDatasetItem(item: Record<string, unknown>, datasetName: string): string | null {
        const specifiedColumns = item['Columns'] ? String(item['Columns']).split(',').map(col => col.trim()) : [];
        if (specifiedColumns.length > 0) {
            const entity = this.Entities.find(e => UUIDsEqual(e.ID, item['EntityID'] as string));
            if (!entity && this.Entities.length > 0) {
                LogError(`Entity not found for dataset item ${item['Code']} in dataset ${datasetName}`);
                return null;
            }
            if (entity) {
                const invalidColumns: string[] = [];
                specifiedColumns.forEach(col => {
                    if (!entity.Fields.find(f => f.Name.trim().toLowerCase() === col.trim().toLowerCase())) {
                        invalidColumns.push(col);
                    }
                });
                if (invalidColumns.length > 0) {
                    LogError(`Invalid columns specified for dataset item ${item['Code']} in dataset ${datasetName}: ${invalidColumns.join(', ')}`);
                    return null;
                }
            }
            // Ensure DateFieldToCheck is included
            const dateField = item['DateFieldToCheck'] ? String(item['DateFieldToCheck']).trim() : '';
            if (dateField.length > 0 && specifiedColumns.indexOf(dateField) === -1) {
                if (!entity || entity.Fields.find(f => f.Name.trim().toLowerCase() === dateField.toLowerCase()))
                    specifiedColumns.push(dateField);
            }
        }
        return specifiedColumns.length > 0 ? specifiedColumns.map(col => this.QuoteIdentifier(col.trim())).join(',') : '*';
    }

    /**************************************************************************/
    // Dataset Cache Helpers
    /**************************************************************************/

    /**
     * Computes the latest update date for a dataset item from its result rows and dataset metadata.
     * Used by both the cache-hit and cache-miss paths in GetDatasetByName.
     * @param rows - The result rows (from cache or SQL)
     * @param dateFieldToCheck - The field name to scan for latest date
     * @param item - The dataset item metadata row (contains DatasetItemUpdatedAt, DatasetUpdatedAt)
     * @returns The latest date across all rows and dataset metadata
     */
    protected computeLatestUpdateDate(
        rows: unknown[],
        dateFieldToCheck: string,
        item: Record<string, unknown>
    ): Date {
        const itemUpdatedAt = new Date(String(item['DatasetItemUpdatedAt']));
        const datasetUpdatedAt = new Date(String(item['DatasetUpdatedAt']));
        const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime()));

        let latestUpdateDate = new Date(1900, 1, 1);
        if (rows && rows.length > 0) {
            for (const data of rows) {
                const record = data as Record<string, unknown>;
                if (record[dateFieldToCheck]) {
                    const d = new Date(String(record[dateFieldToCheck]));
                    if (d > latestUpdateDate) latestUpdateDate = d;
                }
            }
        }

        if (datasetMaxUpdatedAt > latestUpdateDate) latestUpdateDate = datasetMaxUpdatedAt;
        return latestUpdateDate;
    }

    /**
     * Extracts the MAX value of a specified date field from result rows as an ISO string.
     * Used for write-through caching of dataset item results.
     * @param rows - The result rows
     * @param dateFieldToCheck - The field name to scan
     * @returns ISO string of the max date, or current time if no dates found
     */
    protected extractMaxUpdatedAtFromRows(rows: unknown[], dateFieldToCheck: string): string {
        let maxDate: Date | null = null;
        for (const row of rows) {
            const record = row as Record<string, unknown>;
            const val = record[dateFieldToCheck];
            if (val) {
                const d = val instanceof Date ? val : new Date(val as string);
                if (!isNaN(d.getTime()) && (!maxDate || d > maxDate)) {
                    maxDate = d;
                }
            }
        }
        return maxDate ? maxDate.toISOString() : new Date().toISOString();
    }
}
