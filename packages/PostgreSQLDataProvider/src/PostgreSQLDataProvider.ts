import pg from 'pg';
import {
    DatabasePlatform,
    ExecuteSQLOptions,
    UserInfo,
    EntityInfo,
    EntityFieldInfo,
    EntityFieldTSType,
    ProviderType,
    CompositeKey,
    EntityDependency,
    BaseEntity,
    BaseEntityResult,
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

    // Nested-transaction tracking, mirrors SQLServerDataProvider's pattern.
    // PG implements nesting via SAVEPOINT / RELEASE SAVEPOINT / ROLLBACK TO
    // SAVEPOINT, so depth==1 maps to a real BEGIN/COMMIT/ROLLBACK and depth>1
    // maps to a savepoint operation on the same client connection.
    private _transactionDepth: number = 0;
    private _savepointStack: string[] = [];
    private _savepointCounter: number = 0;

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
        // Auto-quote PascalCase identifiers in raw SQL. MJ has lots of hand-written
        // SQL across resolvers, engines, and dashboard components that uses
        // unquoted PascalCase identifiers (e.g. `FROM __mj.vwAIAgentRuns`,
        // `WHERE TestRun IS NULL`). On SQL Server those work because it folds
        // case-insensitively; on PG they fail because PG folds unquoted
        // identifiers to lowercase and the actual columns/views are mixed-case.
        // Tokenizer-based quoting matches what PostgreSQLCodeGenProvider already
        // does for codegen-time SQL — runtime gets the same treatment.
        const quotedQuery = this.autoQuoteIdentifiers(query);
        try {
            const source = this._transaction ?? this._connectionManager.Pool;
            const result = await source.query(quotedQuery, processedParams);
            return result.rows as T[];
        } catch (err) {
            const desc = options?.description ? ` [${options.description}]` : '';
            LogError(`PostgreSQLDataProvider.ExecuteSQL failed${desc}: ${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    }

    // ─── Transaction Management ──────────────────────────────────────

    public override get IsInTransaction(): boolean {
        return this._transaction !== null;
    }

    /**
     * Current transaction nesting depth.
     * 0 = no active transaction; 1 = outermost real BEGIN; 2+ = nested via SAVEPOINTs.
     */
    public get TransactionDepth(): number {
        return this._transactionDepth;
    }

    /**
     * BeginTransaction with nested-transaction support via SAVEPOINTs.
     *
     * - First call: AcquireClient + BEGIN.
     * - Subsequent calls (within the same provider instance): emit a uniquely-named
     *   SAVEPOINT on the same client. PG savepoints are arbitrary-depth, so
     *   nesting from frameworks like TransactionGroups composes correctly.
     *
     * Mirrors SQLServerDataProvider's depth/savepoint-stack model so that any
     * caller treating the provider polymorphically gets identical semantics
     * across both backends.
     */
    async BeginTransaction(): Promise<void> {
        // Stage state mutations so the catch block can fully revert. The
        // previous implementation only rolled back `_transactionDepth` on
        // failure — it left the pushed name on `_savepointStack` and the
        // bumped `_savepointCounter` in place. When the SAVEPOINT query
        // failed (e.g. the transaction was already in PG's "aborted" state
        // because of an earlier per-record error inside `mj sync push`), the
        // next nested BeginTransaction would generate `mj_sp_(N+1)`, push it,
        // and the corresponding RollbackTransaction would `ROLLBACK TO
        // SAVEPOINT mj_sp_(N+1)` — which PG had never created, raising
        // `savepoint "mj_sp_(N+1)" does not exist` and tearing down the
        // entire push.
        let savepointName: string | null = null;
        let pushedSavepoint = false;
        let bumpedCounter = false;
        let depthIncreased = false;

        this._transactionDepth++;
        depthIncreased = true;

        try {
            if (this._transactionDepth === 1) {
                this._transaction = await this._connectionManager.AcquireClient();
                await this._transaction.query('BEGIN');
            } else {
                if (!this._transaction) {
                    // Defensive: depth got out of sync with client state. Reset and surface.
                    throw new Error(`PostgreSQLDataProvider transaction state corrupted: depth=${this._transactionDepth} but no active client. Reset and rethrowing.`);
                }
                savepointName = `mj_sp_${++this._savepointCounter}`;
                bumpedCounter = true;
                this._savepointStack.push(savepointName);
                pushedSavepoint = true;
                // PG savepoint identifiers are unquoted; we only ever generate
                // ASCII-only names so quoting isn't required.
                await this._transaction.query(`SAVEPOINT ${savepointName}`);
            }
        } catch (e) {
            // Full rollback of staged state — leaving any of these set on
            // failure causes the savepoint stack and PG's actual savepoint
            // state to drift, which surfaces later as "savepoint X does not
            // exist" during rollback.
            if (pushedSavepoint) this._savepointStack.pop();
            if (bumpedCounter) this._savepointCounter--;
            if (depthIncreased) this._transactionDepth--;
            throw e;
        }
    }

    /**
     * CommitTransaction with savepoint-aware semantics.
     *
     * - Outermost (depth was 1): real COMMIT and release the client.
     * - Nested (depth > 1): RELEASE SAVEPOINT, drop from stack, decrement depth.
     *   Releasing a savepoint discards it but does NOT commit anything yet —
     *   the work it represents is folded into the enclosing transaction and
     *   only persists when that enclosing transaction commits.
     */
    async CommitTransaction(): Promise<void> {
        if (!this._transaction) {
            throw new Error('No active transaction to commit.');
        }
        if (this._transactionDepth === 0) {
            // Defensive: client present but depth says no transaction. Surface explicitly.
            throw new Error('PostgreSQLDataProvider transaction depth mismatch — no transaction to commit.');
        }
        try {
            if (this._transactionDepth === 1) {
                try {
                    await this._transaction.query('COMMIT');
                } finally {
                    this._transaction.release();
                    this._transaction = null;
                    this._transactionDepth = 0;
                    this._savepointStack = [];
                    this._savepointCounter = 0;
                }
            } else {
                const savepointName = this._savepointStack[this._savepointStack.length - 1];
                if (!savepointName) {
                    throw new Error(`PostgreSQLDataProvider savepoint stack mismatch — expected savepoint at depth ${this._transactionDepth}.`);
                }
                await this._transaction.query(`RELEASE SAVEPOINT ${savepointName}`);
                this._savepointStack.pop();
                this._transactionDepth--;
            }
        } catch (e) {
            // If COMMIT itself failed at depth 1 the connection is in a bad state.
            // Force a rollback + release so we don't leak the client back into the pool
            // mid-transaction (would block subsequent queries on that client).
            if (this._transactionDepth === 1 && this._transaction) {
                try { await this._transaction.query('ROLLBACK'); } catch { /* swallow — surfacing primary error */ }
                this._transaction.release();
                this._transaction = null;
                this._transactionDepth = 0;
                this._savepointStack = [];
                this._savepointCounter = 0;
            }
            throw e;
        }
    }

    /**
     * RollbackTransaction with savepoint-aware semantics.
     *
     * - Outermost (depth was 1): real ROLLBACK and release the client.
     * - Nested (depth > 1): ROLLBACK TO SAVEPOINT (which keeps the savepoint
     *   itself active but discards work done after it), then RELEASE SAVEPOINT
     *   to drop it. Combining the two matches what callers usually mean by
     *   "undo this nested operation entirely".
     */
    async RollbackTransaction(): Promise<void> {
        if (!this._transaction) {
            throw new Error('No active transaction to rollback.');
        }
        if (this._transactionDepth === 0) {
            throw new Error('PostgreSQLDataProvider transaction depth mismatch — no transaction to rollback.');
        }
        try {
            if (this._transactionDepth === 1) {
                try {
                    await this._transaction.query('ROLLBACK');
                } finally {
                    this._transaction.release();
                    this._transaction = null;
                    this._transactionDepth = 0;
                    this._savepointStack = [];
                    this._savepointCounter = 0;
                }
            } else {
                const savepointName = this._savepointStack[this._savepointStack.length - 1];
                if (!savepointName) {
                    throw new Error(`PostgreSQLDataProvider savepoint stack mismatch — expected savepoint at depth ${this._transactionDepth}.`);
                }
                await this._transaction.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                await this._transaction.query(`RELEASE SAVEPOINT ${savepointName}`);
                this._savepointStack.pop();
                this._transactionDepth--;
            }
        } catch (e) {
            // If ROLLBACK failed at depth 1, the client state is unknown.
            // Force-release to avoid leaking a poisoned client back to the pool.
            if (this._transactionDepth === 1 && this._transaction) {
                this._transaction.release();
                this._transaction = null;
                this._transactionDepth = 0;
                this._savepointStack = [];
                this._savepointCounter = 0;
            }
            throw e;
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
     * Also coerces SQL Server bit literals (`= 1` / `= 0`) on boolean fields
     * to PG boolean literals (`= TRUE` / `= FALSE`), since hand-written
     * filters across the codebase (engines, dashboards, agents) use SQL
     * Server's bit-as-integer convention. Without this, PG rejects the
     * comparison with `operator does not exist: boolean = integer`.
     */
    protected override TransformExternalSQLClause(clause: string, entityInfo: EntityInfo): string {
        if (!clause || clause.length === 0) return clause;
        const quoted = this.quoteIdentifiersInSQL(clause, entityInfo);
        return this.coerceBooleanLiteralsInSQL(quoted, entityInfo);
    }

    /**
     * Rewrites bit-style boolean comparisons in a quoted SQL fragment so they
     * type-check on PostgreSQL. For each boolean column on the entity, finds
     * `"Col" {= | != | <>} {0|1|'0'|'1'}` (any whitespace, case-insensitive
     * operator) and substitutes `TRUE` / `FALSE`. Operates on the already-
     * identifier-quoted output of `quoteIdentifiersInSQL` so the column-name
     * regex anchor is unambiguous.
     */
    private coerceBooleanLiteralsInSQL(sql: string, entityInfo: EntityInfo): string {
        const boolFields = entityInfo.Fields.filter(f => f.TSType === EntityFieldTSType.Boolean);
        if (boolFields.length === 0) return sql;

        let out = sql;
        for (const field of boolFields) {
            // Match `"FieldName" <op> <int-or-quoted-int>`. We only rewrite when
            // the literal is a bare 0/1 (or '0'/'1') — anything else (NULL,
            // another column, parameter) is left alone so we don't accidentally
            // mangle TRUE/FALSE the caller already wrote.
            const ident = pgDialect.QuoteIdentifier(field.Name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(${ident})\\s*(=|!=|<>)\\s*'?([01])'?(?=\\s|$|\\)|,)`, 'g');
            out = out.replace(re, (_m, col: string, op: string, val: string) =>
                `${col} ${op} ${val === '1' ? 'TRUE' : 'FALSE'}`
            );
        }
        return out;
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

    /**
     * PostgreSQL spDelete sprocs return a single-column result that confirms the delete.
     * Two shapes coexist in the wild:
     *   - Legacy (baseline migration V202602170015): `RETURNS TABLE("_result_id" UUID)` —
     *     uses `_result_id` because PL/pgSQL flagged the natural `RETURNS TABLE("ID")`
     *     against `WHERE "ID" = p_id` as ambiguous before `#variable_conflict use_column`
     *     was adopted in the codegen template. Most existing PG installs still have these.
     *   - Current codegen output: `RETURNS TABLE("<PKName>" UUID)` (matches framework
     *     contract directly) — emitted only after a fresh codegen pass replaces the
     *     baseline sproc.
     *
     * The base `ValidateDeleteResult` only knows the second shape, so deletes against
     * legacy sprocs return false despite the row actually being deleted. This override
     * accepts either shape: a single non-null UUID column whose value matches the
     * expected primary key counts as success.
     */
    protected override ValidateDeleteResult(
        entity: BaseEntity,
        rawResult: Record<string, unknown>[],
        entityResult: BaseEntityResult,
    ): boolean {
        if (!rawResult || rawResult.length === 0) return false;
        const deletedRecord = rawResult[0];

        // Compound PK: every PK column must be present and match. Legacy `_result_id`
        // shape doesn't apply here — only single-PK entities use it.
        if (entity.PrimaryKeys.length > 1) {
            for (const key of entity.PrimaryKeys) {
                if (key.Value !== deletedRecord[key.Name]) {
                    entityResult.Message = `Delete failed: record with primary key ${key.Name}=${key.Value} not found`;
                    return false;
                }
            }
            return true;
        }

        // Single PK: accept either the PK-named column (current codegen) or `_result_id`
        // (legacy baseline sproc). A null value in either means the sproc reported zero
        // rows affected — record was already gone.
        const pk = entity.PrimaryKeys[0];
        const pkValue = deletedRecord[pk.Name];
        const legacyValue = deletedRecord['_result_id'];
        if (pkValue === pk.Value || legacyValue === pk.Value) {
            return true;
        }
        entityResult.Message = `Delete failed: record with primary key ${pk.Name}=${pk.Value} not found`;
        return false;
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

    /**
     * PG-specific narrow rule for whether to send a `_Clear` companion param
     * on save. Mirrors `PostgreSQLCodeGenProvider.needsClearCompanion`: a
     * `_Clear` is emitted iff the column is nullable AND has a non-NULL DB
     * default. PG has a hard 100-argument limit per function, so we cannot
     * use the broader `EntityFieldInfo.NeedsClearCompanion` rule here without
     * busting that ceiling on wide tables. Both ends (codegen-emit + runtime-
     * call) must agree on the same predicate or callers will pass `_Clear`
     * params the SP doesn't accept (or vice versa).
     */
    private pgNeedsClearCompanion(field: EntityFieldInfo): boolean {
        if (!field.AllowsNull || !field.HasDefaultValue) return false;
        const dv = (field.DefaultValue ?? '').toString().trim();
        if (dv.length === 0) return false;
        return dv.toUpperCase() !== 'NULL';
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

            // Pillar 1 (tolerant SPs): when caller intentionally sets a
            // nullable column with a non-NULL DB default to NULL, signal the
            // SP's `_Clear` companion. Otherwise the SP body's COALESCE merge
            // (update) or default-substitution (create) silently keeps the
            // existing value or applies the default — a literal NULL could
            // never be persisted.
            //
            // PG-specific narrow rule (deviates from EntityFieldInfo.NeedsClearCompanion):
            // PG has a hard 100-argument limit per function. The broadened
            // `_Clear`-for-all-nullable-columns rule from PR #2533 doubles the
            // param count of CRUD SPs; entities with 80+ nullable columns
            // (AIPromptRun: 165, AIAgent: 123, AIPrompt: 103) overshoot the
            // limit. Use the original narrow rule here (only fields with a
            // non-NULL DB default) so the SP signatures stay under 100 params.
            // Mirrored in PostgreSQLCodeGenProvider.needsClearCompanion to keep
            // the runtime call site aligned with the codegen-emitted signature.
            if ((value === null || value === undefined) && this.pgNeedsClearCompanion(field)) {
                const clearParamName = pgDialect.ParameterRef(field.CodeName + '_Clear');
                paramValues.push(true);
                placeholders.push(`${clearParamName} => $${paramIndex + 1}`);
                paramIndex++;
            }
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

    // ─── SQL Auto-Quoting (runtime PG identifier safety) ─────────────
    //
    // MJ has many hand-written SQL strings across resolvers, engines, and
    // dashboard components that use unquoted PascalCase identifiers. On PG,
    // unquoted identifiers fold to lowercase, which doesn't match the
    // PascalCase columns/views that codegen creates. We auto-quote those
    // identifiers at runtime so existing SQL works on both dialects.
    //
    // The tokenizer mirrors PostgreSQLCodeGenProvider.quoteSQLForExecution
    // so codegen-time and runtime apply the same rules. If the codegen
    // tokenizer changes, this should change too (or be refactored to share).

    private static readonly _SQL_KEYWORDS = new Set([
        // DML/DDL keywords
        'SELECT', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
        'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'ON', 'AS', 'SET',
        'VALUES', 'NULL', 'LIKE', 'IN', 'EXISTS', 'BETWEEN', 'CASE', 'WHEN', 'THEN',
        'ELSE', 'END', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION',
        'ALL', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW', 'EXEC', 'DECLARE',
        'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'TRUE', 'FALSE', 'IS', 'ASC', 'DESC',
        'DISTINCT', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT',
        'IF', 'OBJECT', 'TOP', 'WITH', 'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK',
        'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'ROWS', 'RANGE',
        'PRECEDING', 'FOLLOWING', 'UNBOUNDED', 'CURRENT', 'ROW', 'FETCH', 'NEXT', 'ONLY',
        'SCHEMA', 'CASCADE', 'RESTRICT', 'NO', 'ACTION', 'TRIGGER', 'FUNCTION', 'PROCEDURE',
        'RETURNS', 'RETURN', 'RETURNING', 'EXECUTE', 'CALL', 'RAISE', 'NOTICE', 'EXCEPTION', 'PERFORM',
        'GRANT', 'REVOKE', 'TO', 'USAGE', 'PRIVILEGES', 'OWNER',
        'WINDOW', 'FILTER', 'EXCEPT', 'INTERSECT', 'COLLATE', 'TABLESAMPLE',
        // DDL sub-keywords
        'ADD', 'COLUMN', 'DO', 'RENAME', 'COMMENT', 'UNIQUE', 'CHECK',
        'CONFLICT', 'NOTHING', 'EXCLUDED', 'ZONE', 'AT', 'FOR', 'EACH', 'OF',
        'BEFORE', 'AFTER', 'INSTEAD', 'USING', 'ANY', 'SOME',
        'ENABLE', 'DISABLE', 'GENERATED', 'ALWAYS', 'IDENTITY',
        'SECURITY', 'DEFINER', 'INVOKER', 'FORCE', 'COPY',
        'TEMPORARY', 'TEMP', 'RECURSIVE', 'MATERIALIZED', 'CONCURRENTLY',
        // PL/pgSQL control flow
        'NEW', 'OLD', 'FOUND', 'LOOP', 'WHILE', 'EXIT', 'CONTINUE',
        'ELSIF', 'ELSEIF', 'STRICT',
        // SQL Server types (still appear in raw SQL fragments at runtime)
        'NVARCHAR', 'VARCHAR', 'UNIQUEIDENTIFIER', 'DATETIMEOFFSET', 'DATETIME', 'DATETIME2',
        'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'REAL', 'DECIMAL', 'NUMERIC', 'MONEY',
        'BIT', 'INT', 'TEXT', 'NTEXT', 'IMAGE', 'BINARY', 'VARBINARY', 'CHAR', 'NCHAR',
        'XML', 'GEOGRAPHY', 'GEOMETRY', 'HIERARCHYID', 'SQL_VARIANT', 'SYSNAME',
        'NEWSEQUENTIALID', 'NEWID', 'GETUTCDATE', 'GETDATE', 'SYSDATETIMEOFFSET',
        'OBJECT_ID', 'SCOPE_IDENTITY',
        // Aggregate / scalar functions
        'COUNT', 'MAX', 'MIN', 'SUM', 'AVG', 'COALESCE', 'CAST', 'CONVERT', 'ISNULL',
        'LEN', 'LENGTH', 'DATALENGTH', 'LOWER', 'UPPER', 'LTRIM', 'RTRIM', 'TRIM', 'REPLACE',
        'SUBSTRING', 'CHARINDEX', 'PATINDEX', 'STUFF', 'CONCAT', 'FORMAT',
        'POSITION', 'OVERLAY', 'EXTRACT', 'GREATEST', 'LEAST',
        'DATEADD', 'DATEDIFF', 'DATEPART', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE',
        'SECOND', 'NOW', 'CURRENT_TIMESTAMP',
        // PostgreSQL specific
        'BOOLEAN', 'SERIAL', 'BIGSERIAL', 'UUID', 'JSONB', 'JSON', 'ARRAY', 'TIMESTAMPTZ',
        'TIMESTAMP', 'DATE', 'TIME', 'INTERVAL', 'CITEXT', 'INET', 'MACADDR',
        // PG type names that show up in CAST(... AS T) and ::T expressions in
        // hand-written SQL across the codebase. Without these in the keyword
        // set the tokenizer emits "INTEGER" / "DOUBLE" / "BYTEA" as quoted
        // identifiers and PG rejects them as unknown user-defined types.
        'INTEGER', 'DOUBLE', 'PRECISION', 'BYTEA', 'OID', 'REGCLASS', 'REGPROC', 'NAME',
        'GEN_RANDOM_UUID', 'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP', 'TO_NUMBER',
        'STRING_AGG', 'ARRAY_AGG', 'UNNEST', 'LATERAL', 'ILIKE',
        'LANGUAGE', 'PLPGSQL', 'VOLATILE', 'STABLE', 'IMMUTABLE', 'SETOF', 'RECORD',
        'INOUT', 'OUT', 'VARIADIC', 'PARALLEL', 'SAFE', 'UNSAFE',
        // information_schema column names
        'TABLE_SCHEMA', 'TABLE_NAME', 'TABLE_CATALOG', 'COLUMN_NAME', 'DATA_TYPE',
        'IS_NULLABLE', 'COLUMN_DEFAULT', 'CHARACTER_MAXIMUM_LENGTH', 'NUMERIC_PRECISION',
        'NUMERIC_SCALE', 'ORDINAL_POSITION', 'COLUMN_COMMENT',
        // MJ SQL constructs
        'INFORMATION_SCHEMA', 'COLUMNS', 'TABLES', 'ROUTINES',
    ]);

    /**
     * Quotes mixed-case identifiers in a raw SQL string for PostgreSQL.
     * Walks the string token by token, skipping string literals, dollar-quoted
     * blocks, already-quoted identifiers, square-bracketed identifiers, and
     * @-prefixed parameters. Any remaining word that starts with uppercase and
     * isn't a known SQL keyword gets wrapped in double quotes so PG preserves
     * the case when resolving it against the schema.
     *
     * Idempotent — safe to call on already-quoted SQL (those identifiers are
     * skipped by `skipDoubleQuotedIdentifier`).
     */
    public autoQuoteIdentifiers(sql: string): string {
        const result: string[] = [];
        let i = 0;
        const len = sql.length;

        while (i < len) {
            const ch = sql[i];

            if (ch === "'") {
                i = this.skipSingleQuotedString(sql, i, len, result);
                continue;
            }
            if (ch === '$') {
                i = this.skipDollarQuotedBlock(sql, i, len, result);
                continue;
            }
            if (ch === '"') {
                i = this.skipDoubleQuotedIdentifier(sql, i, len, result);
                continue;
            }
            if (ch === '[') {
                i = this.skipBracketedIdentifier(sql, i, len, result);
                continue;
            }
            if (ch === '@') {
                i = this.skipAtParameter(sql, i, len, result);
                continue;
            }
            if (/[a-zA-Z_]/.test(ch)) {
                i = this.processWord(sql, i, len, result);
                continue;
            }

            result.push(ch);
            i++;
        }

        return result.join('');
    }

    /** Skips a single-quoted string literal, handling escaped quotes ('') */
    private skipSingleQuotedString(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len) {
            if (sql[j] === "'" && j + 1 < len && sql[j + 1] === "'") {
                j += 2;
            } else if (sql[j] === "'") {
                j++;
                break;
            } else {
                j++;
            }
        }
        result.push(sql.substring(start, j));
        return j;
    }

    /**
     * Skips a dollar-quoted block ($$ ... $$ or $tag$ ... $tag$).
     * Falls through to literal `$` for PG positional params ($1, $2, etc.):
     * those start with `$` followed by a digit then a non-`$` character, so
     * the tag-detection scan finds no closing `$` and we push the lone `$`.
     */
    private skipDollarQuotedBlock(sql: string, start: number, len: number, result: string[]): number {
        let tagEnd = start + 1;
        if (tagEnd < len && sql[tagEnd] === '$') {
            // Simple $$ tag
            tagEnd = start + 2;
        } else {
            // Look for $identifier$ pattern
            while (tagEnd < len && /[a-zA-Z0-9_]/.test(sql[tagEnd])) tagEnd++;
            if (tagEnd < len && sql[tagEnd] === '$') {
                tagEnd++;
            } else {
                // Not a dollar-quote, just a $ character (e.g. PG positional param $1)
                result.push(sql[start]);
                return start + 1;
            }
        }
        const tag = sql.substring(start, tagEnd);
        const closePos = sql.indexOf(tag, tagEnd);
        if (closePos !== -1) {
            const blockEnd = closePos + tag.length;
            result.push(sql.substring(start, blockEnd));
            return blockEnd;
        }
        // No closing tag found, pass through rest of string
        result.push(sql.substring(start));
        return len;
    }

    /** Skips an already double-quoted identifier */
    private skipDoubleQuotedIdentifier(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && sql[j] !== '"') j++;
        if (j < len) j++;
        result.push(sql.substring(start, j));
        return j;
    }

    /** Skips a square-bracketed identifier (SQL Server style; passed through verbatim) */
    private skipBracketedIdentifier(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && sql[j] !== ']') j++;
        if (j < len) j++;
        result.push(sql.substring(start, j));
        return j;
    }

    /** Skips an @-prefixed parameter (e.g. @userId for legacy SQL Server-style params) */
    private skipAtParameter(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && /[a-zA-Z0-9_]/.test(sql[j])) j++;
        result.push(sql.substring(start, j));
        return j;
    }

    /**
     * Processes a word token — quotes it if it's a mixed-case identifier likely
     * to be a column or object reference.
     *
     * Quoting rules:
     *  - PascalCase (starts with uppercase) → quote (e.g. `TestRun`, `UserID`)
     *  - lowercase-first BUT preceded by `.` → quote (e.g. `vwAIAgentRuns`
     *    in `__mj.vwAIAgentRuns`). MJ's view convention is `vwXxxYyy` —
     *    we have to recognize them as identifiers even though they don't
     *    start with uppercase. The `.` prefix tells us we're looking at a
     *    column/object ref, not an alias.
     *
     * camelCase tokens NOT preceded by `.` are left bare so column aliases
     * (`SELECT count(*) AS myCount`) keep their existing case-folded behavior.
     * SQL keywords and MJ-internal `__mj_*` names are also passed through.
     */
    private processWord(sql: string, start: number, len: number, result: string[]): number {
        let j = start + 1;
        while (j < len && /[a-zA-Z0-9_]/.test(sql[j])) j++;
        const word = sql.substring(start, j);

        const isKeyword = PostgreSQLDataProvider._SQL_KEYWORDS.has(word.toUpperCase());
        const isAllLower = word === word.toLowerCase();
        const isMJInternal = word.startsWith('__mj_');
        const startsUpper = /^[A-Z]/.test(word);
        const precededByDot = start > 0 && sql[start - 1] === '.';

        const isQuotableIdentifier = !isKeyword && !isAllLower && !isMJInternal
            && (startsUpper || precededByDot);

        if (isQuotableIdentifier) {
            result.push(pgDialect.QuoteIdentifier(word));
        } else {
            result.push(word);
        }
        return j;
    }

}
