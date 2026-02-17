import pg from 'pg';
import {
    DatabaseProviderBase,
    DatabasePlatform,
    ExecuteSQLOptions,
    RunViewResult,
    RunViewParams,
    RunQueryResult,
    RunQueryParams,
    UserInfo,
    EntityInfo,
    EntityFieldInfo,
    ProviderType,
    CompositeKey,
    EntityRecordNameInput,
    EntityRecordNameResult,
    RecordChange,
    RecordDependency,
    BaseEntity,
    EntitySaveOptions,
    EntityDeleteOptions,
    LogError,
    PotentialDuplicateRequest,
    PotentialDuplicateResponse,
    RecordMergeRequest,
    RecordMergeResult,
    RunReportParams,
    RunReportResult,
    DatasetResultType,
    DatasetStatusResultType,
    DatasetItemFilterType,
    RunViewWithCacheCheckParams,
    RunViewsWithCacheCheckResponse,
    EntityMergeOptions,
    IEntityDataProvider,
    IRunReportProvider,
    TransactionGroupBase,
    ILocalStorageProvider,
    IMetadataProvider,
    InMemoryLocalStorageProvider,
} from '@memberjunction/core';

import { PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { PGConnectionManager } from './pgConnectionManager.js';
import { PGQueryParameterProcessor } from './queryParameterProcessor.js';
import { PostgreSQLProviderConfigData } from './types.js';

const pgDialect = new PostgreSQLDialect();

/**
 * PostgreSQL data provider for MemberJunction.
 *
 * Implements the full DatabaseProviderBase interface using the `pg` driver.
 * Key differences from SQL Server:
 * - Uses LIMIT/OFFSET instead of TOP/OFFSET-FETCH
 * - Uses $1, $2 positional parameters instead of @p0, @p1
 * - Calls functions (SELECT * FROM fn_name()) instead of EXEC sp_name
 * - Boolean columns use true/false instead of 1/0
 * - Identifier quoting uses "double quotes" instead of [brackets]
 */
export class PostgreSQLDataProvider extends DatabaseProviderBase implements IEntityDataProvider, IRunReportProvider {
    private _connectionManager: PGConnectionManager = new PGConnectionManager();
    private _configData: PostgreSQLProviderConfigData | null = null;
    private _schemaName: string = '__mj';
    private _transaction: pg.PoolClient | null = null;
    private _localStorageProvider: ILocalStorageProvider = new InMemoryLocalStorageProvider();

    // ─── Platform Identity ───────────────────────────────────────────

    override get PlatformKey(): DatabasePlatform {
        return 'postgresql';
    }

    get Dialect(): PostgreSQLDialect {
        return pgDialect;
    }

    // ─── Configuration & Lifecycle ───────────────────────────────────

    get ConfigData(): PostgreSQLProviderConfigData {
        if (!this._configData) {
            throw new Error('PostgreSQLDataProvider is not configured. Call Config() first.');
        }
        return this._configData;
    }

    get DatabaseConnection(): pg.Pool {
        return this._connectionManager.Pool;
    }

    get InstanceConnectionString(): string {
        const cfg = this._configData?.ConnectionConfig;
        if (!cfg) return '';
        return `postgresql://${cfg.User}@${cfg.Host}:${cfg.Port ?? 5432}/${cfg.Database}`;
    }

    protected get AllowRefresh(): boolean {
        return this._configData != null && this._configData.CheckRefreshIntervalSeconds > 0;
    }

    get ProviderType(): ProviderType {
        return ProviderType.Database;
    }

    get MJCoreSchemaName(): string {
        return this._schemaName;
    }

    get LocalStorageProvider(): ILocalStorageProvider {
        return this._localStorageProvider;
    }

    protected get Metadata(): IMetadataProvider {
        return this as unknown as IMetadataProvider;
    }

    async Config(configData: PostgreSQLProviderConfigData): Promise<boolean> {
        try {
            this._configData = configData;
            this._schemaName = configData.MJCoreSchemaName || '__mj';
            await this._connectionManager.Initialize(configData.ConnectionConfig);
            return await super.Config(configData);
        } catch (err) {
            LogError(`PostgreSQLDataProvider.Config failed: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    async Dispose(): Promise<void> {
        await this._connectionManager.Close();
    }

    // ─── SQL Execution ───────────────────────────────────────────────

    async ExecuteSQL<T>(
        query: string,
        parameters?: unknown[],
        options?: ExecuteSQLOptions,
        _contextUser?: UserInfo
    ): Promise<Array<T>> {
        const processedParams = PGQueryParameterProcessor.ProcessParameters(parameters);
        try {
            const source = this._transaction ?? this._connectionManager.Pool;
            const result = await source.query(query, processedParams);
            return result.rows as T[];
        } catch (err) {
            const desc = options?.description ? ` [${options.description}]` : '';
            LogError(`PostgreSQLDataProvider.ExecuteSQL failed${desc}: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }

    // ─── Transaction Management ──────────────────────────────────────

    async BeginTransaction(): Promise<void> {
        if (this._transaction) {
            throw new Error('A transaction is already active. Nested transactions are not yet supported in the PostgreSQL provider.');
        }
        this._transaction = await this._connectionManager.AcquireClient();
        await this._transaction.query('BEGIN');
    }

    async CommitTransaction(): Promise<void> {
        if (!this._transaction) {
            throw new Error('No active transaction to commit.');
        }
        try {
            await this._transaction.query('COMMIT');
        } finally {
            this._transaction.release();
            this._transaction = null;
        }
    }

    async RollbackTransaction(): Promise<void> {
        if (!this._transaction) {
            throw new Error('No active transaction to rollback.');
        }
        try {
            await this._transaction.query('ROLLBACK');
        } finally {
            this._transaction.release();
            this._transaction = null;
        }
    }

    async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        throw new Error('TransactionGroup not yet implemented for PostgreSQL provider.');
    }

    // ─── RunView Implementation ──────────────────────────────────────

    protected async InternalRunView<T>(
        params: RunViewParams,
        contextUser?: UserInfo
    ): Promise<RunViewResult<T>> {
        const entityInfo = this.resolveEntityInfo(params);
        if (!entityInfo) {
            return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'Entity not found for params' };
        }

        const startTime = Date.now();
        const fields = this.buildFieldList(params, entityInfo);
        const whereSQL = this.buildWhereClause(params, entityInfo, contextUser);
        const orderBySQL = this.resolveOrderBy(params, entityInfo);
        const selectSQL = this.buildSelectSQL(entityInfo, fields, whereSQL, orderBySQL, params.MaxRows, params.StartRow);

        try {
            const rows = await this.ExecuteSQL<T>(selectSQL, undefined, { description: `RunView: ${entityInfo.Name}` }, contextUser);

            let totalRowCount = rows.length;
            if (params.MaxRows && rows.length >= params.MaxRows) {
                totalRowCount = await this.executeCountQuery(entityInfo, whereSQL, contextUser);
            }

            return {
                Success: true,
                Results: rows,
                RowCount: rows.length,
                TotalRowCount: totalRowCount,
                ExecutionTime: Date.now() - startTime,
                ErrorMessage: '',
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: Date.now() - startTime, ErrorMessage: msg };
        }
    }

    protected async InternalRunViews<T>(
        params: RunViewParams[],
        contextUser?: UserInfo
    ): Promise<RunViewResult<T>[]> {
        return Promise.all(params.map(p => this.InternalRunView<T>(p, contextUser)));
    }

    // ─── RunQuery Implementation ─────────────────────────────────────

    protected async InternalRunQuery(
        params: RunQueryParams,
        contextUser?: UserInfo
    ): Promise<RunQueryResult> {
        const startTime = Date.now();
        const queryId = params.QueryID ?? '';
        const queryName = params.QueryName ?? '';
        const emptyResult: RunQueryResult = {
            QueryID: queryId,
            QueryName: queryName,
            Success: false,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 0,
            ErrorMessage: '',
        };

        try {
            // Look up the query from metadata
            const queryInfo = this.Queries.find(q =>
                (params.QueryID && q.ID === params.QueryID) ||
                (params.QueryName && q.Name === params.QueryName)
            );
            if (!queryInfo) {
                return { ...emptyResult, ErrorMessage: `Query not found: ${queryId || queryName}` };
            }

            const querySQL = queryInfo.SQL;
            if (!querySQL) {
                return { ...emptyResult, ErrorMessage: 'No SQL defined for query' };
            }

            const rows = await this.ExecuteSQL<Record<string, unknown>>(querySQL, undefined, { description: `RunQuery: ${queryInfo.Name}` }, contextUser);
            return {
                QueryID: queryInfo.ID,
                QueryName: queryInfo.Name,
                Success: true,
                Results: rows,
                RowCount: rows.length,
                TotalRowCount: rows.length,
                ExecutionTime: Date.now() - startTime,
                ErrorMessage: '',
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ...emptyResult, ExecutionTime: Date.now() - startTime, ErrorMessage: msg };
        }
    }

    protected async InternalRunQueries(
        params: RunQueryParams[],
        contextUser?: UserInfo
    ): Promise<RunQueryResult[]> {
        return Promise.all(params.map(p => this.InternalRunQuery(p, contextUser)));
    }

    // ─── Entity Record Names ─────────────────────────────────────────

    protected async InternalGetEntityRecordName(
        entityName: string,
        compositeKey: CompositeKey,
        contextUser?: UserInfo
    ): Promise<string> {
        const entityInfo = this.Entities.find(e => e.Name === entityName);
        if (!entityInfo) return '';
        const nameField = entityInfo.NameField;
        if (!nameField) return compositeKey.ToString();

        const whereClause = this.buildPKWhereClause(entityInfo, compositeKey);
        const sql = `SELECT ${pgDialect.QuoteIdentifier(nameField.Name)} FROM ${this.viewName(entityInfo)} WHERE ${whereClause}`;
        const rows = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, contextUser);
        if (rows.length > 0 && rows[0][nameField.Name] != null) {
            return String(rows[0][nameField.Name]);
        }
        return compositeKey.ToString();
    }

    protected async InternalGetEntityRecordNames(
        info: EntityRecordNameInput[],
        contextUser?: UserInfo
    ): Promise<EntityRecordNameResult[]> {
        const results: EntityRecordNameResult[] = [];
        for (const item of info) {
            const name = await this.InternalGetEntityRecordName(item.EntityName, item.CompositeKey, contextUser);
            const result = new EntityRecordNameResult();
            result.EntityName = item.EntityName;
            result.CompositeKey = item.CompositeKey;
            result.Success = true;
            result.Status = 'OK';
            result.RecordName = name;
            results.push(result);
        }
        return results;
    }

    // ─── User ────────────────────────────────────────────────────────

    protected async GetCurrentUser(): Promise<UserInfo> {
        // In server context, this is resolved via the contextUser parameter.
        // Return a placeholder for now; actual implementation depends on auth integration.
        throw new Error('GetCurrentUser requires auth context. Use contextUser parameter on individual methods.');
    }

    // ─── IEntityDataProvider ─────────────────────────────────────────

    async Load(
        entity: BaseEntity,
        compositeKey: CompositeKey,
        _EntityRelationshipsToLoad: string[],
        user: UserInfo
    ): Promise<Record<string, unknown>> {
        const entityInfo = entity.EntityInfo;
        const whereClause = this.buildPKWhereClause(entityInfo, compositeKey);
        const sql = `SELECT * FROM ${this.viewName(entityInfo)} WHERE ${whereClause}`;

        const rows = await this.ExecuteSQL<Record<string, unknown>>(sql, undefined, { description: `Load: ${entityInfo.Name}` }, user);
        if (rows.length === 0) {
            throw new Error(`Record not found: ${entityInfo.Name} [${compositeKey.ToString()}]`);
        }
        return rows[0];
    }

    async Save(
        entity: BaseEntity,
        user: UserInfo,
        _options: EntitySaveOptions
    ): Promise<Record<string, unknown>> {
        const entityInfo = entity.EntityInfo;
        const isNew = entity.IsSaved === false;
        const fnName = this.getCRUDFunctionName(isNew ? 'create' : 'update', entityInfo);

        const { paramValues, paramPlaceholders } = this.buildCRUDParams(entity, isNew, entityInfo);
        const sql = `SELECT * FROM ${this._schemaName}.${pgDialect.QuoteIdentifier(fnName)}(${paramPlaceholders})`;

        const rows = await this.ExecuteSQL<Record<string, unknown>>(
            sql,
            paramValues,
            { description: `Save ${isNew ? '(create)' : '(update)'}: ${entityInfo.Name}`, isMutation: true },
            user
        );

        if (rows.length === 0) {
            throw new Error(`Save failed for ${entityInfo.Name}: no record returned from ${fnName}`);
        }
        return rows[0];
    }

    async Delete(
        entity: BaseEntity,
        _options: EntityDeleteOptions,
        user: UserInfo
    ): Promise<boolean> {
        const entityInfo = entity.EntityInfo;
        const fnName = this.getCRUDFunctionName('delete', entityInfo);
        const pkFields = entityInfo.PrimaryKeys;

        if (pkFields.length === 0) {
            throw new Error(`Cannot delete ${entityInfo.Name}: no primary key defined`);
        }

        const paramValues = pkFields.map((f: EntityFieldInfo) => entity.Get(f.Name));
        const paramPlaceholders = paramValues.map((_v: unknown, i: number) => `$${i + 1}`).join(', ');
        const sql = `SELECT * FROM ${this._schemaName}.${pgDialect.QuoteIdentifier(fnName)}(${paramPlaceholders})`;

        await this.ExecuteSQL<Record<string, unknown>>(
            sql,
            paramValues,
            { description: `Delete: ${entityInfo.Name}`, isMutation: true },
            user
        );
        return true;
    }

    async GetRecordChanges(
        _entityName: string,
        _compositeKey: CompositeKey,
        _contextUser?: UserInfo
    ): Promise<RecordChange[]> {
        return [];
    }

    async GetRecordFavoriteStatus(
        _userId: string,
        _entityName: string,
        _CompositeKey: CompositeKey,
        _contextUser?: UserInfo
    ): Promise<boolean> {
        return false;
    }

    async SetRecordFavoriteStatus(
        _userId: string,
        _entityName: string,
        _CompositeKey: CompositeKey,
        _isFavorite: boolean,
        _contextUser: UserInfo
    ): Promise<void> {
        // Favorites - initial stub
    }

    async GetRecordDependencies(
        _entityName: string,
        _CompositeKey: CompositeKey,
        _contextUser?: UserInfo
    ): Promise<RecordDependency[]> {
        return [];
    }

    async GetRecordDuplicates(
        _params: PotentialDuplicateRequest,
        _contextUser?: UserInfo
    ): Promise<PotentialDuplicateResponse> {
        const response = new PotentialDuplicateResponse();
        response.Status = 'Error';
        response.ErrorMessage = 'Not yet implemented for PostgreSQL';
        response.PotentialDuplicateResult = [];
        return response;
    }

    async MergeRecords(
        _request: RecordMergeRequest,
        _contextUser?: UserInfo,
        _options?: EntityMergeOptions
    ): Promise<RecordMergeResult> {
        return {
            Success: false,
            OverallStatus: 'Error',
            RecordStatus: [],
            Request: _request,
            RecordMergeLogID: '',
        };
    }

    async FindISAChildEntity(
        _entityInfo: EntityInfo,
        _recordPKValue: string,
        _contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string } | null> {
        return null;
    }

    async FindISAChildEntities(
        _entityInfo: EntityInfo,
        _recordPKValue: string,
        _contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string }[]> {
        return [];
    }

    // ─── IRunReportProvider ──────────────────────────────────────────

    async RunReport(
        _params: RunReportParams,
        _contextUser?: UserInfo
    ): Promise<RunReportResult> {
        return { Success: false, Results: [], ReportID: '', RowCount: 0, ExecutionTime: 0, ErrorMessage: 'Not yet implemented for PostgreSQL' };
    }

    // ─── Dataset Methods ─────────────────────────────────────────────

    async GetDatasetByName(
        _datasetName: string,
        _itemFilters?: DatasetItemFilterType[],
        _contextUser?: UserInfo
    ): Promise<DatasetResultType> {
        return { DatasetID: '', DatasetName: '', Success: false, Status: 'Not implemented', LatestUpdateDate: new Date(), Results: [] };
    }

    async GetDatasetStatusByName(
        _datasetName: string,
        _itemFilters?: DatasetItemFilterType[],
        _contextUser?: UserInfo
    ): Promise<DatasetStatusResultType> {
        return { DatasetID: '', DatasetName: '', Success: false, Status: 'Not implemented', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }

    // ─── Cache Check Methods ─────────────────────────────────────────

    async RunViewsWithCacheCheck<T>(
        _params: RunViewWithCacheCheckParams[],
        _contextUser?: UserInfo
    ): Promise<RunViewsWithCacheCheckResponse<T>> {
        return { success: false, results: [], errorMessage: 'Not yet implemented for PostgreSQL' };
    }

    // ─── SQL Building Helpers ────────────────────────────────────────

    private buildSelectSQL(
        entityInfo: EntityInfo,
        fields: string[],
        whereSQL: string,
        orderBySQL: string,
        maxRows?: number,
        startRow?: number
    ): string {
        const fieldList = fields.map(f => pgDialect.QuoteIdentifier(f)).join(', ');
        let sql = `SELECT ${fieldList} FROM ${this.viewName(entityInfo)}`;

        if (whereSQL) sql += ` WHERE ${whereSQL}`;
        if (orderBySQL) sql += ` ORDER BY ${orderBySQL}`;

        if (maxRows != null) {
            const lc = pgDialect.LimitClause(maxRows, startRow);
            if (lc.suffix) sql += ` ${lc.suffix}`;
        }

        return sql;
    }

    private buildCountSQL(entityInfo: EntityInfo, whereSQL: string): string {
        let sql = `SELECT COUNT(*) AS count FROM ${this.viewName(entityInfo)}`;
        if (whereSQL) sql += ` WHERE ${whereSQL}`;
        return sql;
    }

    private async executeCountQuery(entityInfo: EntityInfo, whereSQL: string, contextUser?: UserInfo): Promise<number> {
        const sql = this.buildCountSQL(entityInfo, whereSQL);
        const rows = await this.ExecuteSQL<{ count: string }>(sql, undefined, { description: `Count: ${entityInfo.Name}` }, contextUser);
        return rows.length > 0 ? parseInt(rows[0].count, 10) : 0;
    }

    private resolveEntityInfo(params: RunViewParams): EntityInfo | undefined {
        if (params.EntityName) {
            return this.Entities.find(e => e.Name === params.EntityName);
        }
        return undefined;
    }

    private buildFieldList(params: RunViewParams, entityInfo: EntityInfo): string[] {
        if (params.Fields && params.Fields.length > 0) {
            return params.Fields;
        }
        return entityInfo.Fields.map(f => f.Name);
    }

    private buildWhereClause(params: RunViewParams, _entityInfo: EntityInfo, _contextUser?: UserInfo): string {
        const parts: string[] = [];
        const extraFilter = this.ResolveSQL(params.ExtraFilter ?? '');
        if (extraFilter) parts.push(extraFilter);
        return parts.join(' AND ');
    }

    private resolveOrderBy(params: RunViewParams, entityInfo: EntityInfo): string {
        const orderBy = this.ResolveSQL(params.OrderBy ?? '');
        if (orderBy) return orderBy;

        // Default: order by first PK field
        const pks = entityInfo.PrimaryKeys;
        if (pks.length > 0) {
            return pgDialect.QuoteIdentifier(pks[0].Name);
        }
        return '';
    }

    private buildPKWhereClause(entityInfo: EntityInfo, compositeKey: CompositeKey): string {
        const conditions: string[] = [];
        for (const keyValue of compositeKey.KeyValuePairs) {
            const field = entityInfo.Fields.find(f => f.Name === keyValue.FieldName);
            if (!field) continue;
            const value = this.formatFieldValue(field, keyValue.Value);
            conditions.push(`${pgDialect.QuoteIdentifier(keyValue.FieldName)} = ${value}`);
        }
        return conditions.join(' AND ');
    }

    private formatFieldValue(field: EntityFieldInfo, value: unknown): string {
        if (value == null) return 'NULL';
        const tsType = field.TSType;
        if (tsType === 'number') return String(value);
        if (tsType === 'boolean') return pgDialect.BooleanLiteral(Boolean(value));
        const strValue = String(value).replace(/'/g, "''");
        return `'${strValue}'`;
    }

    private viewName(entityInfo: EntityInfo): string {
        const schema = entityInfo.SchemaName || this._schemaName;
        return pgDialect.QuoteSchema(schema, entityInfo.BaseView);
    }

    // ─── CRUD Function Helpers ───────────────────────────────────────

    private getCRUDFunctionName(type: 'create' | 'update' | 'delete', entityInfo: EntityInfo): string {
        const tableName = this.toSnakeCase(entityInfo.BaseTable);
        switch (type) {
            case 'create': return `fn_create_${tableName}`;
            case 'update': return `fn_update_${tableName}`;
            case 'delete': return `fn_delete_${tableName}`;
        }
    }

    private buildCRUDParams(
        entity: BaseEntity,
        isNew: boolean,
        entityInfo: EntityInfo
    ): { paramValues: unknown[]; paramPlaceholders: string } {
        const fields = this.getWritableFields(entityInfo, isNew);
        const paramValues: unknown[] = [];
        const placeholders: string[] = [];

        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const value = entity.Get(field.Name);
            paramValues.push(PGQueryParameterProcessor.ProcessParameterValue(value));
            placeholders.push(`$${i + 1}`);
        }

        return { paramValues, paramPlaceholders: placeholders.join(', ') };
    }

    private getWritableFields(entityInfo: EntityInfo, isNew: boolean): EntityFieldInfo[] {
        return entityInfo.Fields.filter((f: EntityFieldInfo) => {
            if (f.IsVirtual) return false;
            if (f.Name === '__mj_CreatedAt' || f.Name === '__mj_UpdatedAt') return false;
            if (isNew && f.AutoIncrement) return false;
            if (!isNew && f.IsPrimaryKey) return true;
            if (f.ReadOnly && !f.IsPrimaryKey) return false;
            return true;
        });
    }

    private toSnakeCase(name: string): string {
        return name
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '')
            .replace(/ /g, '_');
    }
}
