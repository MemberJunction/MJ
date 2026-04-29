import pg from 'pg';
import {
    DatabasePlatform,
    ExecuteSQLOptions,
    UserInfo,
    EntityInfo,
    EntityFieldInfo,
    ProviderType,
    CompositeKey,
    EntityDependency,
    BaseEntity,
    SaveSQLResult,
    DeleteSQLResult,
    LogError,
    TransactionGroupBase,
    IMetadataProvider,
    RunQuerySQLFilterManager,
    RestoreContext,
    RecordChangePayload,
} from '@memberjunction/core';


import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { PGConnectionManager } from './pgConnectionManager.js';
import { PGQueryParameterProcessor } from './queryParameterProcessor.js';
import { PostgreSQLProviderConfigData } from './types.js';
import { PostgreSQLTransactionGroup } from './PostgreSQLTransactionGroup.js';

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
export class PostgreSQLDataProvider extends GenericDatabaseProvider {
    private _connectionManager: PGConnectionManager = new PGConnectionManager();
    private _configData: PostgreSQLProviderConfigData | null = null;
    private _schemaName: string = '__mj';
    private _transaction: pg.PoolClient | null = null;

    // ─── Platform Identity ───────────────────────────────────────────

    override get PlatformKey(): DatabasePlatform {
        return 'postgresql';
    }

    /**************************************************************************/
    // SQL Dialect Implementations (override abstract methods from DatabaseProviderBase)
    /**************************************************************************/

    public override QuoteIdentifier(name: string): string {
        return pgDialect.QuoteIdentifier(name);
    }

    public override QuoteSchemaAndView(schemaName: string, objectName: string): string {
        return pgDialect.QuoteSchema(schemaName, objectName);
    }

    private static readonly _pgUUIDPattern: RegExp =
        /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;

    private static readonly _pgDefaultPattern: RegExp =
        /^\s*(now|current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp)\s*\(\s*\)\s*$/i;

    protected override get UUIDFunctionPattern(): RegExp {
        return PostgreSQLDataProvider._pgUUIDPattern;
    }

    protected override get DBDefaultFunctionPattern(): RegExp {
        return PostgreSQLDataProvider._pgDefaultPattern;
    }

    protected override BuildChildDiscoverySQL(childEntities: EntityInfo[], recordPKValue: string): string {
        const safePKValue = recordPKValue.replace(/'/g, "''");
        const unionParts = childEntities
            .filter(child => child.PrimaryKeys.length > 0)
            .map(child => {
                const schema = child.SchemaName || '__mj';
                const table = child.BaseTable;
                const pkName = child.PrimaryKeys[0].Name;
                const safeName = child.Name.replace(/'/g, "''");
                const safeSchema = pgDialect.QuoteSchema(schema, table);
                const safePK = pgDialect.QuoteIdentifier(pkName);
                return "SELECT '" + safeName + '\' AS "EntityName" FROM ' + safeSchema + ' WHERE ' + safePK + " = '" + safePKValue + "'";
            });
        if (unionParts.length === 0) return '';
        return unionParts.join(' UNION ALL ');
    }

    protected override BuildHardLinkDependencySQL(entityDependencies: EntityDependency[], compositeKey: CompositeKey): string {
        let sSQL = '';
        for (const dep of entityDependencies) {
            const entityInfo = this.Entities.find(e => e.Name.trim().toLowerCase() === dep.EntityName?.trim().toLowerCase());
            const relatedEntityInfo = this.Entities.find(e => e.Name.trim().toLowerCase() === dep.RelatedEntityName?.trim().toLowerCase());
            if (!entityInfo || !relatedEntityInfo) continue;

            const quotes = entityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : '';
            const pkParts: string[] = [];
            for (const pk of entityInfo.PrimaryKeys) {
                pkParts.push("'" + pk.Name + "' || '|' || CAST(" + pgDialect.QuoteIdentifier(pk.Name) + " AS TEXT)");
            }
            const primaryKeySelectString = pkParts.join(" || '" + CompositeKey.DefaultFieldDelimiter + "' || ");

            if (sSQL.length > 0) sSQL += ' UNION ALL ';
            sSQL += 'SELECT '
                + "'" + dep.EntityName + '\' AS "EntityName", '
                + "'" + dep.RelatedEntityName + '\' AS "RelatedEntityName", '
                + primaryKeySelectString + ' AS "PrimaryKeyValue", '
                + "'" + dep.FieldName + '\' AS "FieldName" '
                + 'FROM ' + pgDialect.QuoteSchema(relatedEntityInfo.SchemaName, relatedEntityInfo.BaseView) + ' '
                + 'WHERE ' + pgDialect.QuoteIdentifier(dep.FieldName) + ' = ' + quotes + compositeKey.GetValueByIndex(0) + quotes;
        }
        return sSQL;
    }

    protected override BuildSoftLinkDependencySQL(entityName: string, compositeKey: CompositeKey): string {
        let sSQL = '';
        this.Entities.forEach(entity => {
            const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
            const pkParts: string[] = [];
            for (const pk of entity.PrimaryKeys) {
                pkParts.push("'" + pk.Name + "' || '|' || CAST(" + pgDialect.QuoteIdentifier(pk.Name) + " AS TEXT)");
            }
            const primaryKeySelectString = pkParts.join(" || '" + CompositeKey.DefaultFieldDelimiter + "' || ");

            entity.Fields.filter(f => f.EntityIDFieldName && f.EntityIDFieldName.length > 0).forEach(f => {
                if (sSQL.length > 0) sSQL += ' UNION ALL ';
                sSQL += 'SELECT '
                    + "'" + entityName + '\' AS "EntityName", '
                    + "'" + entity.Name + '\' AS "RelatedEntityName", '
                    + primaryKeySelectString + ' AS "PrimaryKeyValue", '
                    + "'" + f.Name + '\' AS "FieldName" '
                    + 'FROM ' + pgDialect.QuoteSchema(entity.SchemaName, entity.BaseView) + ' '
                    + 'WHERE ' + pgDialect.QuoteIdentifier(f.EntityIDFieldName) + ' = ' + quotes + entity.ID + quotes
                    + ' AND ' + pgDialect.QuoteIdentifier(f.Name) + ' = ' + quotes + compositeKey.GetValueByIndex(0) + quotes;
            });
        });
        return sSQL;
    }


    get Dialect(): PostgreSQLDialect {
        return pgDialect;
    }

    protected getDialect(): PostgreSQLDialect {
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

    protected get Metadata(): IMetadataProvider {
        return this as unknown as IMetadataProvider;
    }

    async Config(configData: PostgreSQLProviderConfigData): Promise<boolean> {
        try {
            this._configData = configData;
            this._schemaName = configData.MJCoreSchemaName || '__mj';
            await this._connectionManager.Initialize(configData.ConnectionConfig);

            // Set the platform so RunQuerySQLFilterManager produces PG-appropriate
            // filters (e.g. boolean true/false instead of SQL Server 1/0)
            RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');

            return await super.Config(configData);
        } catch (err) {
            LogError(`PostgreSQLDataProvider.Config failed: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    /**
     * Configures this provider to share an existing pool from another PostgreSQLDataProvider.
     * Used for per-request providers that should reuse the primary provider's connection pool.
     */
    async ConfigWithSharedPool(configData: PostgreSQLProviderConfigData, existingPool: pg.Pool): Promise<boolean> {
        try {
            this._configData = configData;
            this._schemaName = configData.MJCoreSchemaName || '__mj';
            this._connectionManager.InitializeWithExistingPool(existingPool, configData.ConnectionConfig);
            return await super.Config(configData);
        } catch (err) {
            LogError(`PostgreSQLDataProvider.ConfigWithSharedPool failed: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    async Dispose(): Promise<void> {
        await this._connectionManager.Close();
    }

    protected override GetTransactionExtraData(_entity: BaseEntity): Record<string, unknown> {
        return { dataSource: this._connectionManager.Pool };
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
        return new PostgreSQLTransactionGroup();
    }

    protected override BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `LIMIT ${maxRows} OFFSET ${startRow}`;
    }

    protected override BuildNonPaginatedLimitSQL(maxRows: number): string {
        return `LIMIT ${maxRows}`;
    }

    /**
     * Transforms user-provided SQL clauses (ExtraFilter, OrderBy) to quote
     * mixed-case identifiers and convert [bracket] notation for PostgreSQL.
     */
    protected override TransformExternalSQLClause(clause: string, entityInfo: EntityInfo): string {
        if (!clause || clause.length === 0) return clause;
        return this.quoteIdentifiersInSQL(clause, entityInfo);
    }

    // ─── Entity Record Names ─────────────────────────────────────────

            // ─── User ────────────────────────────────────────────────────────

    protected async GetCurrentUser(): Promise<UserInfo> {
        return this.CurrentUser;
    }

    // ─── IEntityDataProvider ─────────────────────────────────────────

    /**
     * Public wrapper for GenerateSaveSQL used by PostgreSQLTransactionGroup
     * when transaction variables require regenerating the SQL instruction.
     */
    public async GetSaveSQL(entity: BaseEntity, isNew: boolean, user: UserInfo): Promise<SaveSQLResult> {
        return this.GenerateSaveSQL(entity, isNew, user);
    }

    /**
     * Generates PostgreSQL function-call SQL for Save (Create/Update).
     * Returns parameterized SQL with $1, $2, ... placeholders.
     *
     * When the entity tracks record changes, the resulting SQL is a CTE
     * batch — the CRUD function-call result feeds a second CTE that
     * inserts the RecordChange row using a SQL-side RecordID expression
     * (so the post-INSERT primary key is captured without a JS round-trip).
     * Payload assembly (diff, JSON, lineage) is delegated to the
     * dialect-agnostic `BuildRecordChangePayload` helper on the base.
     */
    protected override async GenerateSaveSQL(entity: BaseEntity, isNew: boolean, user: UserInfo): Promise<SaveSQLResult> {
        const entityInfo = entity.EntityInfo;
        const fnName = this.getCRUDFunctionName(isNew ? 'create' : 'update', entityInfo);
        const { paramValues, paramPlaceholders } = await this.buildCRUDParams(entity, isNew, entityInfo, user);
        const simpleSQL = `SELECT * FROM ${this._schemaName}.${pgDialect.QuoteIdentifier(fnName)}(${paramPlaceholders})`;

        if (this.ShouldTrackRecordChanges(entityInfo)) {
            const newData = entity.GetAll(false);
            const oldData = !isNew ? entity.GetAll(true) : null;
            // Empty recordID — the CTE resolves it via buildRecordIDFromCTE below.
            const payload = this.BuildRecordChangePayload(
                newData,
                oldData,
                '',
                entityInfo,
                isNew ? 'Create' : 'Update',
                user,
                entity.RestoreContext,
                "'",
            );
            if (payload) {
                const s = paramValues.length + 1;
                const recordIDExpr = this.buildRecordIDFromCTE(entityInfo, 'save_result');
                const fullSQL = `WITH save_result AS (
    ${simpleSQL}
),
record_change AS (
    INSERT INTO ${this._schemaName}."RecordChange"
        ("EntityID", "RecordID", "UserID", "Type", "Source", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status", "RestoredFromID", "RestoreReason")
    SELECT $${s}::uuid, ${recordIDExpr}, $${s+1}::uuid, $${s+2}::varchar, $${s+3}::varchar, $${s+4}::text, $${s+5}::text, $${s+6}::text, 'Complete', $${s+7}::uuid, $${s+8}::text
    FROM save_result
    RETURNING "ID"
)
SELECT * FROM save_result`;
                paramValues.push(
                    payload.entityID,
                    payload.userID,
                    payload.type,
                    payload.source,
                    payload.changesJSON,
                    payload.changesDescription,
                    payload.fullRecordJSON,
                    payload.restoredFromID,
                    payload.restoreReason,
                );
                return { fullSQL, simpleSQL, parameters: paramValues };
            }
        }

        return { fullSQL: simpleSQL, simpleSQL, parameters: paramValues };
    }

    /**
     * Generates PostgreSQL function-call SQL for Delete.
     * Returns parameterized SQL with $1, $2, ... placeholders.
     */
    protected override GenerateDeleteSQL(entity: BaseEntity, user: UserInfo): DeleteSQLResult {
        const entityInfo = entity.EntityInfo;
        const fnName = this.getCRUDFunctionName('delete', entityInfo);
        const pkFields = entityInfo.PrimaryKeys;
        if (pkFields.length === 0) {
            throw new Error(`Cannot delete ${entityInfo.Name}: no primary key defined`);
        }
        const paramValues: unknown[] = pkFields.map((f: EntityFieldInfo) => entity.Get(f.Name));
        const paramPlaceholders = paramValues.map((_v: unknown, i: number) => `$${i + 1}`).join(', ');
        const simpleSQL = `SELECT * FROM ${this._schemaName}.${pgDialect.QuoteIdentifier(fnName)}(${paramPlaceholders})`;

        if (this.ShouldTrackRecordChanges(entityInfo)) {
            const oldData = entity.GetAll(false);
            const recordID = this.buildRecordIDFromEntity(entity);
            // Delete: newData is null so the payload renders Source/lineage from
            // the entity's RestoreContext (usually NULL — supported for symmetry).
            const payload = this.BuildRecordChangePayload(
                null,
                oldData,
                recordID,
                entityInfo,
                'Delete',
                user,
                entity.RestoreContext,
                "'",
            );
            if (payload) {
                const s = paramValues.length + 1;
                paramValues.push(
                    payload.entityID,
                    payload.recordID,
                    payload.userID,
                    payload.source,
                    payload.fullRecordJSON,
                    payload.restoredFromID,
                    payload.restoreReason,
                );
                const fullSQL = `WITH delete_result AS (
    ${simpleSQL}
),
record_change AS (
    INSERT INTO ${this._schemaName}."RecordChange"
        ("EntityID", "RecordID", "UserID", "Type", "Source", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status", "RestoredFromID", "RestoreReason")
    SELECT $${s}::uuid, $${s+1}::varchar, $${s+2}::uuid, 'Delete', $${s+3}::varchar, '', 'Record Deleted', $${s+4}::text, 'Complete', $${s+5}::uuid, $${s+6}::text
    FROM delete_result
    WHERE EXISTS (SELECT 1 FROM delete_result)
    RETURNING "ID"
)
SELECT * FROM delete_result`;
                return { fullSQL, simpleSQL, parameters: paramValues };
            }
        }

        return { fullSQL: simpleSQL, simpleSQL, parameters: paramValues };
    }

    // ─── SQL Building Helpers ────────────────────────────────────────

    /**
     * Quotes bare column identifiers in a SQL fragment (e.g. ExtraFilter) so that
     * mixed-case column names work on PostgreSQL.  Already-quoted identifiers
     * (surrounded by double-quotes) and values inside single-quoted strings are
     * left untouched.
     */
    private quoteIdentifiersInSQL(sql: string, entityInfo: EntityInfo): string {
        // Convert SQL Server [bracket] notation to PostgreSQL "double-quote" notation.
        // Core MJ code (entityInfo.ts) generates relationship filters like [ColumnName]
        // and [schema].[viewName] which need to become "ColumnName" and "schema"."viewName".
        sql = sql.replace(/\[(\w[\w\s]*)\]/g, '"$1"');

        // Build a set of field names for this entity
        const fieldNames = new Set(entityInfo.Fields.map(f => f.Name));

        // Tokenise: keep single-quoted strings and double-quoted identifiers
        // as opaque tokens so we only transform bare identifiers.
        const tokens = sql.match(/'[^']*'|"[^"]*"|\S+/g);
        if (!tokens) return sql;

        return tokens.map(token => {
            // Skip string literals and already-quoted identifiers
            if (token.startsWith("'") || token.startsWith('"')) return token;

            // When \S+ captures a token like  RecordID='ID|uuid'  the embedded
            // single-quoted value must NOT be subject to field-name replacement.
            // Split at the first single quote: only the part before it (the
            // identifier portion) gets field names quoted.
            const quoteIdx = token.indexOf("'");
            if (quoteIdx > 0) {
                const identPart = token.substring(0, quoteIdx);
                const valuePart = token.substring(quoteIdx);
                return this.quoteFieldNamesInToken(identPart, fieldNames) + valuePart;
            }

            return this.quoteFieldNamesInToken(token, fieldNames);
        }).join(' ');
    }

    /**
     * Replaces bare field names in a token fragment with double-quoted identifiers.
     * Uses word-boundary matching so that callers who write 'userid' still find 'UserID'.
     */
    /**
     * Converts PascalCase or camelCase to snake_case.
     * Must match CodeGen's PostgreSQLCodeGenProvider.toSnakeCase exactly,
     * otherwise stored function parameter names won't match at call time.
     */
    private toSnakeCase(name: string): string {
        return name
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
            .toLowerCase()
            .replace(/__+/g, '_');
    }

    private quoteFieldNamesInToken(token: string, fieldNames: Set<string>): string {
        for (const fieldName of fieldNames) {
            // Negative lookahead: don't quote words followed by ( — those are function calls
            // (e.g., LENGTH(...), LEFT(...)), not column references. Without this, a field
            // named "Length" causes LENGTH() to be quoted as "Length"() which PG can't resolve.
            const re = new RegExp(`\\b${fieldName}\\b(?!\\s*\\()`, 'gi');
            token = token.replace(re, pgDialect.QuoteIdentifier(fieldName));
        }
        return token;
    }

    // ─── CRUD Function Helpers ───────────────────────────────────────

    // Note: Record Change tracking helpers (`ShouldTrackRecordChanges` and
    // `BuildRecordChangePayload`) live on `DatabaseProviderBase` so SQL Server
    // and PostgreSQL share one implementation. This provider only renders
    // PG-specific SQL on top of the shared payload.

    /**
     * Builds a SQL expression that constructs the RecordID string from primary key columns
     * in a CTE result. Format: "FieldName|Value" for single PK, "F1|V1||F2|V2" for composite.
     */
    private buildRecordIDFromCTE(entityInfo: EntityInfo, cteAlias: string): string {
        const pkFields = entityInfo.PrimaryKeys;
        const parts = pkFields.map(pk =>
            `'${pk.CodeName}' || '|' || ${cteAlias}.${pgDialect.QuoteIdentifier(pk.Name)}::text`
        );
        if (parts.length === 1) return parts[0];
        return parts.join(` || '||' || `);
    }

    /**
     * Builds a RecordID string from the entity's current primary key values.
     * Used for delete operations where PK values are known.
     */
    private buildRecordIDFromEntity(entity: BaseEntity): string {
        return entity.PrimaryKeys.map(pk =>
            `${pk.CodeName}|${pk.Value}`
        ).join('||');
    }

    private getCRUDFunctionName(type: 'create' | 'update' | 'delete', entityInfo: EntityInfo): string {
        // PG CRUD functions on a baseline-managed install follow the same naming
        // convention as SQL Server: sp{Verb}{BaseTableCodeName} (PascalCase),
        // because the baseline ports the CodeGen-emitted sp* shells over directly.
        // Earlier this code defaulted to a fn_<verb>_<snake_case_table> convention
        // (e.g. fn_create_workspace) on the assumption that CodeGen's
        // PostgreSQLCodeGenProvider would maintain those — but in practice no CRUD
        // fn_* functions exist (only fn_mj_geodistance / fn_mj_georecordsnear),
        // so every Save/Create/Delete failed with "function does not exist" until
        // entityInfo.spCreate/spUpdate/spDelete was explicitly populated.
        //
        // Honor the entity's custom sproc override first; otherwise default to
        // the sp* convention that the baseline actually ships.
        const tableCodeName = entityInfo.BaseTableCodeName ?? entityInfo.BaseTable;
        switch (type) {
            case 'create':
                if (entityInfo.spCreate?.length > 0) return entityInfo.spCreate;
                return `spCreate${tableCodeName}`;
            case 'update':
                if (entityInfo.spUpdate?.length > 0) return entityInfo.spUpdate;
                return `spUpdate${tableCodeName}`;
            case 'delete':
                if (entityInfo.spDelete?.length > 0) return entityInfo.spDelete;
                return `spDelete${tableCodeName}`;
        }
    }

    private async buildCRUDParams(
        entity: BaseEntity,
        isNew: boolean,
        entityInfo: EntityInfo,
        contextUser?: UserInfo
    ): Promise<{ paramValues: unknown[]; paramPlaceholders: string }> {
        const fields = this.getWritableFields(entityInfo, isNew);

        // Collect field values into a map for generic encryption processing
        const fieldValueMap = new Map<EntityFieldInfo, unknown>();
        for (const field of fields) {
            let value = entity.Get(field.Name);
            value = this.resolveFieldValue(value, field, isNew);
            fieldValueMap.set(field, value);
        }

        // Encrypt field values using the generic method from GenericDatabaseProvider
        await this.EncryptFieldValuesForSave(entity, fieldValueMap, contextUser);

        // Build parameterized query components from (possibly encrypted) values
        const paramValues: unknown[] = [];
        const placeholders: string[] = [];
        let paramIndex = 0;

        for (const [field, value] of fieldValueMap) {
            paramValues.push(PGQueryParameterProcessor.ProcessParameterValue(value));
            // Use named parameter notation (p_fieldname => $N) to avoid parameter
            // ordering mismatches with the stored functions. The baseline-shipped
            // sp* CRUD functions use `p_{lowercased flat field name}` (no inner
            // separator) — e.g. `p_categoryid` for column "CategoryID", not
            // `p_category_id`. This matches the SQL Server convention the baseline
            // converter ports over. Earlier this used toSnakeCase which produced
            // `p_category_id` and failed every Save against the actual sp* functions.
            const paramName = `p_${field.Name.toLowerCase()}`;
            placeholders.push(`${paramName} => $${paramIndex + 1}`);
            paramIndex++;
        }

        return { paramValues, paramPlaceholders: placeholders.join(', ') };
    }

    /**
     * Resolves a field value that may contain a database function string.
     * - For UUID generation functions (gen_random_uuid, NEWID, etc.): generates a UUID via GenerateNewID()
     * - For other known DB default functions (GETUTCDATE, NOW, etc.): returns null so the DB uses its default
     * - For all other values: returns as-is
     */
    private resolveFieldValue(value: unknown, field: EntityFieldInfo, isNew: boolean): unknown {
        if (typeof value !== 'string') {
            return value;
        }

        if (this.IsUUIDGenerationFunction(value)) {
            // Replace UUID generation function strings with an actual generated UUID.
            // This handles the case where a field's default value is a DB function like
            // gen_random_uuid() or NEWID() — we generate the UUID in TypeScript instead.
            return this.GenerateNewID();
        }

        if (this.IsNonUUIDDatabaseFunction(value)) {
            // For non-UUID database functions (GETUTCDATE, NOW, etc.), send null
            // so the stored function/procedure lets the database use its column default
            return null;
        }

        return value;
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

    // ─── Record Change SQL Builders (abstract method implementations) ───

    /**
     * Builds PostgreSQL INSERT INTO "RecordChange" SQL for record change logging.
     * Uses parameterized queries with $N placeholders.
     *
     * Dialect-agnostic payload assembly (diff, JSON serialization, restore
     * lineage derivation) is hoisted into `DatabaseProviderBase.BuildRecordChangePayload`,
     * so this method only renders the parameterized INSERT.
     *
     * @param restoreContext When non-null, the row is written with
     *   `Source='Restore'`, `RestoredFromID = SourceChangeID`, and
     *   `RestoreReason = Reason`. When null, defaults to `Source='Internal'`
     *   with NULL lineage columns.
     */
    protected override BuildRecordChangeSQL(
        newData: Record<string, unknown> | null,
        oldData: Record<string, unknown> | null,
        entityName: string,
        recordID: string,
        entityInfo: EntityInfo,
        type: 'Create' | 'Update' | 'Delete',
        user: UserInfo,
        restoreContext?: RestoreContext | null,
    ): { sql: string; parameters?: unknown[] } | null {
        const payload = this.BuildRecordChangePayload(
            newData,
            oldData,
            recordID,
            entityInfo,
            type,
            user,
            restoreContext,
            "'",
        );
        if (!payload) return null;

        const sql = `INSERT INTO ${this._schemaName}."RecordChange"
            ("EntityID", "RecordID", "UserID", "Type", "Source", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status", "RestoredFromID", "RestoreReason")
            VALUES ($1::uuid, $2::varchar, $3::uuid, $4::varchar, $5::varchar, $6::text, $7::text, $8::text, 'Complete', $9::uuid, $10::text)
            RETURNING "ID"`;

        const parameters: unknown[] = [
            payload.entityID,
            payload.recordID,
            payload.userID,
            payload.type,
            payload.source,
            payload.changesJSON,
            payload.changesDescription,
            payload.fullRecordJSON,
            payload.restoredFromID,
            payload.restoreReason,
        ];

        return { sql, parameters };
    }

    /**
     * Builds PostgreSQL SQL for a single sibling entity in the Record Change propagation batch.
     * Uses row_to_json to get the full record JSON, then conditionally inserts a Record Change entry.
     */
    protected override BuildSiblingRecordChangeSQL(
        _varName: string,
        entityInfo: EntityInfo,
        safeChangesJSON: string,
        safeChangesDesc: string,
        safePKValue: string,
        safeUserId: string,
    ): string {
        const schema = entityInfo.SchemaName || '__mj';
        const view = entityInfo.BaseView;
        const pkName = entityInfo.PrimaryKeys[0]?.Name ?? 'ID';
        const safeEntityName = entityInfo.Name.replace(/'/g, "''");

        const recordID = entityInfo.PrimaryKeys
            .map(pk => `${pk.CodeName}|${safePKValue}`)
            .join('||');

        return `
INSERT INTO ${this._schemaName}."RecordChange"
    ("EntityID", "RecordID", "UserID", "Type", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status")
SELECT
    '${entityInfo.ID}'::uuid,
    '${recordID}',
    '${safeUserId}'::uuid,
    'Update',
    '${safeChangesJSON}',
    '${safeChangesDesc}',
    row_to_json(r)::text,
    'Complete'
FROM ${pgDialect.QuoteSchema(schema, view)} r
WHERE ${pgDialect.QuoteIdentifier(pkName)} = '${safePKValue}';`;
    }

}
