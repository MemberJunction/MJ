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
    IMetadataProvider,
    UserInfo,
    LogError,
    LogStatus,
    StripStopWords,
} from '@memberjunction/core';

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
 * GenericDatabaseProvider is an intermediate abstract class that implements shared
 * entity action, AI action, encryption, and view WHERE clause rendering logic.
 *
 * Platform-specific providers should extend this class instead of DatabaseProviderBase
 * to inherit these shared behaviors.
 */
export abstract class GenericDatabaseProvider extends DatabaseProviderBase {

    /**************************************************************************/
    // Entity Actions & AI Actions (Concrete Implementations)
    /**************************************************************************/

    /**
     * Returns AI actions configured for the given entity and timing.
     * Uses AIEngine metadata to find matching EntityAIAction records.
     */
    protected override GetEntityAIActions(entityInfo: EntityInfo, before: boolean): MJEntityAIActionEntity[] {
        return AIEngine.Instance.EntityAIActions.filter(
            (a) => a.EntityID === entityInfo.ID && a.TriggerEvent.toLowerCase().trim() === (before ? 'before save' : 'after save'),
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
    // PostProcessRows — Encryption Decryption
    /**************************************************************************/

    /**
     * Post-processes rows to handle field-level decryption for encrypted fields.
     * Platform-specific datetime processing should be handled by provider subclasses
     * which call super.PostProcessRows() and then apply their own datetime logic.
     */
    protected override async PostProcessRows(
        rows: Record<string, unknown>[],
        entityInfo: EntityInfo,
        user: UserInfo,
    ): Promise<Record<string, unknown>[]> {
        if (!rows || rows.length === 0) return rows;

        const encryptedFields = entityInfo.Fields.filter((field) => field.Encrypt && field.EncryptionKeyID);
        if (encryptedFields.length === 0) return rows;

        const encryptionEngine = EncryptionEngine.Instance;
        await encryptionEngine.Config(false, user);

        return Promise.all(rows.map(async (row) => {
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

    /**************************************************************************/
    // RenderViewWhereClause — View Template Rendering
    /**************************************************************************/

    /**************************************************************************/
    // InternalRunView — Shared View Execution Engine
    /**************************************************************************/

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
                entityInfo = this.Entities.find((e) => e.ID === viewEntity!.EntityID) ?? null;
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

            // Separate items that need cache check from those that don't
            const itemsNeedingCacheCheck: Array<{ index: number; item: RunViewWithCacheCheckParams; entityInfo: EntityInfo; whereSQL: string }> = [];
            const itemsWithoutCacheCheck: Array<{ index: number; item: RunViewWithCacheCheckParams }> = [];
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
                    const whereSQL = await this.buildWhereClauseForCacheCheck(item.params, entityInfo, user);
                    itemsNeedingCacheCheck.push({ index: i, item, entityInfo, whereSQL });
                } catch (e) {
                    errorResults.push({ viewIndex: i, status: 'error', errorMessage: e instanceof Error ? e.message : String(e) });
                }
            }

            // Execute batched cache status check
            const cacheStatusResults = await this.getBatchedServerCacheStatus(itemsNeedingCacheCheck, contextUser);

            // Determine which items are current vs stale, and whether they support differential updates
            const differentialItems: Array<{
                index: number; params: RunViewParams; entityInfo: EntityInfo; whereSQL: string;
                clientMaxUpdatedAt: string; clientRowCount: number;
                serverStatus: { maxUpdatedAt?: string; rowCount?: number };
            }> = [];
            const staleItemsNoTracking: Array<{ index: number; params: RunViewParams }> = [];
            const currentResults: RunViewWithCacheCheckResult<T>[] = [];

            for (const { index, item, entityInfo, whereSQL } of itemsNeedingCacheCheck) {
                const serverStatus = cacheStatusResults.get(index);
                if (!serverStatus || !serverStatus.success) {
                    errorResults.push({ viewIndex: index, status: 'error', errorMessage: serverStatus?.errorMessage || 'Failed to get cache status' });
                    continue;
                }

                if (this.isCacheCurrent(item.cacheStatus!, serverStatus)) {
                    currentResults.push({ viewIndex: index, status: 'current' });
                } else if (entityInfo.TrackRecordChanges) {
                    differentialItems.push({
                        index, params: item.params, entityInfo, whereSQL,
                        clientMaxUpdatedAt: item.cacheStatus!.maxUpdatedAt,
                        clientRowCount: item.cacheStatus!.rowCount,
                        serverStatus,
                    });
                } else {
                    staleItemsNoTracking.push({ index, params: item.params });
                }
            }

            // Run queries in parallel
            const queryPromises: Promise<RunViewWithCacheCheckResult<T>>[] = [
                ...itemsWithoutCacheCheck.map(({ index, item }) =>
                    this.runFullQueryAndReturn<T>(item.params, index, contextUser),
                ),
                ...staleItemsNoTracking.map(({ index, params: viewParams }) =>
                    this.runFullQueryAndReturn<T>(viewParams, index, contextUser),
                ),
                ...differentialItems.map(({ index, params: viewParams, entityInfo, whereSQL, clientMaxUpdatedAt, clientRowCount, serverStatus }) =>
                    this.runDifferentialQueryAndReturn<T>(viewParams, entityInfo, clientMaxUpdatedAt, clientRowCount, serverStatus, whereSQL, index, contextUser),
                ),
            ];

            const fullQueryResults = await Promise.all(queryPromises);
            const allResults = [...errorResults, ...currentResults, ...fullQueryResults];
            allResults.sort((a, b) => a.viewIndex - b.viewIndex);

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

        if (params.QueryID) return this.Queries.find(q => q.ID === params.QueryID);

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
                const byId = matchingQueries.find(q => q.CategoryID === params.CategoryID);
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
                    const byPath = matches.find(q => q.CategoryID === resolvedCategoryId);
                    if (byPath) return byPath;
                }
            }
            return matches[0];
        }

        return null;
    }

    /**
     * Creates a fresh QueryInfo from a MJQueryEntity and patches the ProviderBase cache.
     */
    protected refreshQueryInfoFromEntity(entity: MJQueryEntity): QueryInfo {
        const freshInfo = new QueryInfo(entity.GetAll());
        const existingIndex = this.Queries.findIndex(q => q.ID === freshInfo.ID);
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
                cat.Name.trim().toLowerCase() === segment.toLowerCase() && cat.ParentID === parentId,
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

        const sql = `SELECT * FROM ${this.QuoteSchemaAndView(entityInfo.SchemaName, entityInfo.BaseView)} WHERE ${where}`;
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
     * Retrieves a dataset by name, executing all item queries and aggregating results.
     * Uses dialect-neutral quoting for all SQL construction.
     */
    public async GetDatasetByName(
        datasetName: string,
        itemFilters?: DatasetItemFilterType[],
        contextUser?: UserInfo,
        providerToUse?: IMetadataProvider,
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

        if (items && items.length > 0) {
            const results: DatasetItemResultType[] = [];

            for (const item of items) {
                const entitySchemaName = String(item['EntitySchemaName'] ?? schema);
                const entityBaseView = String(item['EntityBaseView']);
                const code = String(item['Code']);
                const entityName = String(item['Entity']);
                const entityID = String(item['EntityID']);
                const dateFieldToCheck = String(item['DateFieldToCheck'] ?? '__mj_UpdatedAt');
                const whereClause = item['WhereClause'] ? String(item['WhereClause']) : '';

                // Build filter SQL
                let filterSQL = '';
                if (itemFilters && itemFilters.length > 0) {
                    const filter = itemFilters.find(f => f.ItemCode === code);
                    if (filter) filterSQL = (whereClause ? ' AND ' : ' WHERE ') + '(' + filter.Filter + ')';
                }

                // Validate columns if specified
                const columns = provider.getColumnsForDatasetItem(item, datasetName);
                if (!columns) {
                    results.push({
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

                const itemSQL = `SELECT ${columns} FROM ${provider.QuoteSchemaAndView(entitySchemaName, entityBaseView)} ${whereClause ? 'WHERE ' + whereClause : ''}${filterSQL}`;

                try {
                    let itemData = await provider.ExecuteSQL<Record<string, unknown>>(itemSQL, undefined, undefined, contextUser);

                    // Post-process rows for encryption/datetime
                    if (itemData.length > 0) {
                        const entityInfo = provider.Entities.find(e =>
                            e.Name.trim().toLowerCase() === entityName.trim().toLowerCase(),
                        );
                        if (entityInfo && contextUser) {
                            itemData = await provider.PostProcessRows(itemData, entityInfo, contextUser);
                        }
                    }

                    const itemUpdatedAt = new Date(String(item['DatasetItemUpdatedAt']));
                    const datasetUpdatedAt = new Date(String(item['DatasetUpdatedAt']));
                    const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime()));

                    let latestUpdateDate = new Date(1900, 1, 1);
                    if (itemData && itemData.length > 0) {
                        for (const data of itemData) {
                            if (data[dateFieldToCheck] && new Date(String(data[dateFieldToCheck])) > latestUpdateDate) {
                                latestUpdateDate = new Date(String(data[dateFieldToCheck]));
                            }
                        }
                    }

                    if (datasetMaxUpdatedAt > latestUpdateDate) latestUpdateDate = datasetMaxUpdatedAt;

                    results.push({
                        EntityID: entityID,
                        EntityName: entityName,
                        Code: code,
                        Results: itemData,
                        LatestUpdateDate: latestUpdateDate,
                        Success: itemData !== null && itemData !== undefined,
                    });
                } catch (err) {
                    LogError(`GetDatasetByName: Error fetching item ${code}: ${err instanceof Error ? err.message : String(err)}`);
                    results.push({
                        EntityID: entityID,
                        EntityName: entityName,
                        Code: code,
                        Results: [],
                        LatestUpdateDate: undefined,
                        Status: err instanceof Error ? err.message : String(err),
                        Success: false,
                    });
                }
            }

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
        } else {
            return {
                DatasetID: '',
                DatasetName: datasetName,
                Success: false,
                Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
                LatestUpdateDate: new Date(0),
                Results: [],
            };
        }
    }

    /**
     * Validates columns for a dataset item and returns the column list string.
     * Returns null if columns are invalid.
     */
    protected getColumnsForDatasetItem(item: Record<string, unknown>, datasetName: string): string | null {
        const specifiedColumns = item['Columns'] ? String(item['Columns']).split(',').map(col => col.trim()) : [];
        if (specifiedColumns.length > 0) {
            const entity = this.Entities.find(e => e.ID === item['EntityID']);
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
}
