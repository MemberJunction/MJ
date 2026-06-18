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


import { GenericDatabaseProvider, SaveCoercedValue, SaveCallBinding, SaveSQLFragment } from '@memberjunction/generic-database-provider';
import type { IColocatedVectorHost } from '@memberjunction/ai-vectordb';
import { PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { PGConnectionManager } from './pgConnectionManager.js';
import { PGQueryParameterProcessor } from './queryParameterProcessor.js';
import { PostgreSQLProviderConfigData } from './types.js';
import { PostgreSQLTransactionGroup } from './PostgreSQLTransactionGroup.js';

const pgDialect = new PostgreSQLDialect();

/**
 * Soft ceiling on PostgreSQL CRUD sproc parameter counts. PG's hard
 * `FUNC_MAX_ARGS` is 100 (compiled into the server, not adjustable on managed
 * services). 90 leaves 10 args of headroom so adding a column to an entity
 * near the limit doesn't unexpectedly flip its sproc shape between releases.
 *
 * Single source of truth for both runtime (`PostgreSQLDataProvider.ProcedureParamLimit`)
 * and CodeGen (which doesn't have a live provider instance to query at codegen
 * time). Bumping this value should regenerate sprocs for any entity newly
 * crossing the threshold.
 *
 * Lives in the PG provider package because it's a PG-specific platform
 * constant; consumers in other packages (CodeGenLib's PG provider, the rules
 * module via callers passing it as a `paramLimit` arg) import it from here.
 */
export const POSTGRESQL_PROCEDURE_PARAM_LIMIT = 90;

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
export class PostgreSQLDataProvider extends GenericDatabaseProvider implements IColocatedVectorHost {
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

    /**
     * PostgreSQL's `FUNC_MAX_ARGS` is 100 (compiled into the server, not configurable on managed
     * services like RDS/Aurora/Cloud SQL). When a CRUD sproc would exceed this, CodeGen emits a
     * JSON-arg shape instead of typed args.
     *
     * The actual value lives as the exported `POSTGRESQL_PROCEDURE_PARAM_LIMIT` constant at the
     * top of this file, so runtime and codegen-time both reference one number — drift between
     * them silently breaks CRUD calls.
     *
     * See [plans/json-arg-crud-sprocs.md](../../../../plans/json-arg-crud-sprocs.md) and
     * GitHub issue #2552.
     */
    public override get ProcedureParamLimit(): number {
        return POSTGRESQL_PROCEDURE_PARAM_LIMIT;
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

    /**
     * Probes each child entity's BaseView (not BaseTable) so the runtime SQL
     * identity — which has SELECT only on views — can execute the union. All
     * identifier and string-literal formatting goes through the dialect.
     */
    protected override BuildChildDiscoverySQL(childEntities: EntityInfo[], recordPKValue: string): string {
        const pkValueLit = pgDialect.QuoteStringLiteral(recordPKValue);
        const aliasName = pgDialect.QuoteColumnAlias('EntityName');
        const unionParts = childEntities
            .filter(child => child.PrimaryKeys.length > 0)
            .map(child => {
                const schema = child.SchemaName || '__mj';
                const sourceRef = pgDialect.QuoteSchema(schema, child.BaseView);
                const pkRef = pgDialect.QuoteIdentifier(child.PrimaryKeys[0].Name);
                const nameLit = pgDialect.QuoteStringLiteral(child.Name);
                return `SELECT ${nameLit} AS ${aliasName} FROM ${sourceRef} WHERE ${pkRef} = ${pkValueLit}`;
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

            // Reuse the existing pool if Config() is being called for a metadata
            // refresh against the same connection settings (e.g. ProviderBase.Refresh()
            // → Config() invoked from MJQueryEntityServer.RefreshRelatedMetadata(true)).
            // Recreating the pool on every refresh is wasteful and races under
            // parallel sync-push batches: two concurrent Refresh()es each pump the
            // pool through Close()→new Pool, which produced
            //   `Called end on pool more than once`
            // and stranded the in-flight transaction. Only re-init when there's no
            // pool yet or the connection config actually changed.
            const cm = this._connectionManager;
            const sameConn = cm.IsConnected && this.connectionConfigsEqual(cm.Config, configData.ConnectionConfig);
            if (!sameConn) {
                await cm.Initialize(configData.ConnectionConfig);
            }

            // Set the platform so RunQuerySQLFilterManager produces PG-appropriate
            // filters (e.g. boolean true/false instead of SQL Server 1/0)
            RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');

            return await super.Config(configData);
        } catch (err) {
            LogError(`PostgreSQLDataProvider.Config failed: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    private connectionConfigsEqual(a: unknown, b: unknown): boolean {
        if (!a || !b) return false;
        const ka = a as Record<string, unknown>;
        const kb = b as Record<string, unknown>;
        return ka.Host === kb.Host
            && ka.Port === kb.Port
            && ka.Database === kb.Database
            && ka.User === kb.User
            && ka.Password === kb.Password;
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

    // ─── Colocated vector host (IColocatedVectorHost) ────────────────
    // Lets a colocated vector provider (e.g. PgVectorColocated) store and query vectors
    // in THIS database, reusing this connection — and, when a transaction is open, the
    // same transaction — instead of opening a separate pool to a remote vector store.

    public get ColocatedDialect(): DatabasePlatform {
        return 'postgresql';
    }

    public get ColocatedSchema(): string {
        return this._schemaName;
    }

    /**
     * Execute a parameterized statement for a colocated vector provider against this
     * connection. Uses the active transaction client when one is open (so vector writes
     * commit/rollback with the entity write), otherwise the shared pool. Placeholders use
     * PG's native `$1..$n`. Deliberately bypasses {@link ExecuteSQL}'s PascalCase
     * auto-quoting — the vector provider emits its own correctly-quoted SQL.
     */
    public async RunColocatedSQL<T = Record<string, unknown>>(sql: string, params?: ReadonlyArray<unknown>): Promise<T[]> {
        const source = this._transaction ?? this._connectionManager.Pool;
        const result = await source.query(sql, params ? [...params] : undefined);
        return result.rows as T[];
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
     * Mutex serializing Begin/Commit/Rollback. Prior implementations had no
     * locking around `_savepointCounter`, `_savepointStack`, and
     * `_transactionDepth` — under concurrent callers (e.g. `mj sync push`
     * processing 178 records with parallel BaseEntity.Save() calls), three
     * BeginTransaction invocations would each `++this._savepointCounter` and
     * `push` to the stack between their respective SAVEPOINT awaits, then
     * subsequent CommitTransaction/RollbackTransaction would read a stack-top
     * that didn't match what PG actually had on its savepoint list. The
     * symptom was `savepoint "mj_sp_X" does not exist` mid-push, after the
     * SECOND duplicate ROLLBACK TO same savepoint.
     *
     * The mutex turns the entire begin/commit/rollback operation into a
     * critical section. The underlying PG client serializes its own queries,
     * so we only need to protect the JS-side state mutations and the
     * matching SAVEPOINT/RELEASE/ROLLBACK TO commands as a single
     * indivisible unit.
     */
    private _txMutex: Promise<void> = Promise.resolve();

    private async _withTxLock<T>(fn: () => Promise<T>): Promise<T> {
        const previous = this._txMutex;
        let release!: () => void;
        this._txMutex = new Promise<void>((resolve) => { release = resolve; });
        try {
            await previous;
            return await fn();
        } finally {
            release();
        }
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
        return this._withTxLock(async () => this._beginTransactionLocked());
    }

    private async _beginTransactionLocked(): Promise<void> {
        // Stage state mutations so the catch block can fully revert. Without
        // the mutex protecting concurrent callers, this catch path was the
        // ONLY guard against state drift, but it couldn't help when the race
        // happened during the `await SAVEPOINT` itself (other parallel
        // BeginTransactions would push their savepoints onto the same stack
        // and bump the same counter between this one's push and SAVEPOINT
        // command). The mutex now ensures Begin/Commit/Rollback are
        // serialized; this catch handles the much narrower case of the
        // SAVEPOINT command itself failing (e.g. PG transaction in aborted
        // state from a prior per-record error).
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
        return this._withTxLock(async () => this._commitTransactionLocked());
    }

    private async _commitTransactionLocked(): Promise<void> {
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
        return this._withTxLock(async () => this._rollbackTransactionLocked());
    }

    private async _rollbackTransactionLocked(): Promise<void> {
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
     * PostgreSQL per-field search predicate. The base (SQL Server) form emits
     * `N'...'` string literals and `ESCAPE '\'` on LIKE — both invalid on PostgreSQL
     * (`N'...'` is not a PG literal prefix, and the auto-quoting wraps the bare `ESCAPE`
     * keyword, producing `syntax error at or near "ESCAPE"`). PostgreSQL's default
     * backslash-escape behavior in LIKE makes the explicit ESCAPE clause unnecessary,
     * so we emit plain quoted literals with no `N` prefix and no `ESCAPE`.
     */
    protected override buildPerFieldSearchPredicate(field: EntityFieldInfo, escapedTerm: string, rawSafeTerm: string): string {
        if (field.UserSearchParamFormatAPI && field.UserSearchParamFormatAPI.length > 0) {
            return field.UserSearchParamFormatAPI.replace('{0}', rawSafeTerm);
        }
        if (!this.isTextSearchableType(field)) return '';
        const pred = (field.UserSearchPredicateAPI ?? 'Contains').trim();
        switch (pred) {
            case 'Exact':
                return ` = '${rawSafeTerm}'`;
            case 'BeginsWith':
                return ` LIKE '${escapedTerm}%'`;
            case 'EndsWith':
                return ` LIKE '%${escapedTerm}'`;
            case 'Contains':
            default:
                return ` LIKE '%${escapedTerm}%'`;
        }
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

    // GenerateSaveSQL is now inherited from GenericDatabaseProvider — the
    // dialect-driven concrete builder. PG-specific binding,
    // result-capture, and record-change CTE rendering live in
    // CoerceSaveFieldValue / RenderSaveCallBinding / WrapSaveCallForResult /
    // WrapSaveCallWithRecordChange below. See
    // plans/sp-save-builder-generic-layer-refactor.md (rev 4).

    /**
     * PostgreSQL per-field value transform. Replaces DB function-literal
     * strings (`gen_random_uuid()`, `NOW()`, etc.) with their effective
     * values so the caller binds a real argument instead of inserting the
     * literal string. UUID generators produce a fresh UUID; non-UUID
     * defaults bind `null` so the SP body lets the column default fire.
     */
    protected override CoerceSaveFieldValue(
        field: EntityFieldInfo,
        value: unknown,
        _isUpdate: boolean,
    ): SaveCoercedValue {
        if (typeof value !== 'string') return { kind: 'use', value };
        if (this.IsUUIDGenerationFunction(value)) {
            return { kind: 'use', value: this.GenerateNewID() };
        }
        if (this.IsNonUUIDDatabaseFunction(value)) {
            return { kind: 'use', value: null };
        }
        return { kind: 'use', value };
    }

    /**
     * Renders the PostgreSQL binding for a save call. Picks between two
     * shapes:
     *
     * - **pg-json-arg** (wide entities ≥ `ProcedureParamLimit` typed args):
     *   a single `$1::jsonb` payload keyed by field name. Binary fields
     *   serialize as base64; key-presence semantics on the SP side
     *   interpret missing keys as "leave unchanged" and explicit nulls as
     *   "clear" — no `_Clear` companions needed.
     * - **pg-positional** (default): typed `$N` placeholders, named
     *   `p_<lowercase-field-name>` to match the CodeGen-emitted SP
     *   signature. `_Clear` companion args emitted for nullable columns
     *   set explicitly to NULL.
     */
    protected override RenderSaveCallBinding(
        entity: BaseEntity,
        fieldValues: Map<EntityFieldInfo, unknown>,
        isUpdate: boolean,
        _spName: string,
    ): SaveCallBinding {
        if (this.UseJsonArgShape(entity.EntityInfo, isUpdate ? 'update' : 'create')) {
            const payload: Record<string, unknown> = {};
            for (const [field, value] of fieldValues) {
                const processed = PGQueryParameterProcessor.ProcessParameterValue(value);
                if (this.isBinaryField(field) && processed !== null && processed !== undefined) {
                    payload[field.Name] = this.encodeBinaryToBase64(processed);
                } else {
                    payload[field.Name] = processed;
                }
            }
            // UPDATE: orchestrator skips PK fields (see GenericDatabaseProvider.GenerateSaveSQL),
            // so we append them from the loaded entity. JSON-arg sproc bodies hard-check
            // `RAISE EXCEPTION 'sp*: p_data must include "<PK>"'` when the key is absent.
            if (isUpdate) {
                for (const pkv of entity.PrimaryKey.KeyValuePairs) {
                    payload[pkv.FieldName] = pkv.Value;
                }
            }
            return {
                kind: 'pg-json-arg',
                callArgsSQL: 'p_data => $1::jsonb',
                values: [JSON.stringify(payload)],
            };
        }

        const values: unknown[] = [];
        const placeholders: string[] = [];
        let paramIndex = 0;
        for (const [field, value] of fieldValues) {
            values.push(PGQueryParameterProcessor.ProcessParameterValue(value));
            // Baseline-shipped sp* CRUD functions use `p_<lowercased flat field name>`
            // (no inner separator) — e.g. `p_categoryid` for column "CategoryID".
            // toSnakeCase would produce `p_category_id` and fail every Save.
            placeholders.push(`p_${field.Name.toLowerCase()} => $${paramIndex + 1}`);
            paramIndex++;

            if ((value === null || value === undefined) && field.NeedsClearCompanion) {
                values.push(true);
                placeholders.push(`${pgDialect.ParameterRef(field.CodeName + '_Clear')} => $${paramIndex + 1}`);
                paramIndex++;
            }
        }
        // UPDATE: tail-append PK named-args from the loaded entity. Matches the
        // SQL Server renderer's tail-append pattern; required because the
        // orchestrator skips PK fields in the main fieldValues iteration.
        if (isUpdate) {
            for (const pkv of entity.PrimaryKey.KeyValuePairs) {
                values.push(PGQueryParameterProcessor.ProcessParameterValue(pkv.Value));
                placeholders.push(`p_${pkv.FieldName.toLowerCase()} => $${paramIndex + 1}`);
                paramIndex++;
            }
        }
        return {
            kind: 'pg-positional',
            callArgsSQL: placeholders.join(', '),
            values,
        };
    }

    /**
     * Wraps a PG binding with the bare `SELECT * FROM schema.fn(...)`
     * result-capture pattern. PG returns the row directly; no
     * @ResultTable equivalent.
     */
    protected override WrapSaveCallForResult(
        binding: SaveCallBinding,
        entity: BaseEntity,
        spName: string,
    ): SaveSQLFragment {
        if (binding.kind !== 'pg-positional' && binding.kind !== 'pg-json-arg') {
            throw new Error(`PostgreSQLDataProvider.WrapSaveCallForResult: unexpected binding kind '${binding.kind}'`);
        }
        // CRUD functions live in the entity's OWN schema (e.g. hubspot.spCreatecontacts),
        // not the MJ core schema. Codegen emits them via QuoteSchema(entity.SchemaName, fn),
        // so the runtime must resolve the same schema or the function is "does not exist".
        const sql = `SELECT * FROM ${pgDialect.QuoteSchema(entity.EntityInfo.SchemaName, spName)}(${binding.callArgsSQL})`;
        return { sql, parameters: [...binding.values] };
    }

    /**
     * Wraps a PG save SQL with the record-change CTE chain. The
     * `save_result` CTE captures the inserted/updated row; `record_change`
     * inserts the audit row with the SQL-side `RecordID` expression
     * derived from `save_result`'s PK column(s).
     */
    protected override WrapSaveCallWithRecordChange(
        saveSQL: SaveSQLFragment,
        binding: SaveCallBinding,
        payload: RecordChangePayload,
        entity: BaseEntity,
    ): SaveSQLFragment {
        if (binding.kind !== 'pg-positional' && binding.kind !== 'pg-json-arg') {
            throw new Error(`PostgreSQLDataProvider.WrapSaveCallWithRecordChange: unexpected binding kind '${binding.kind}'`);
        }
        const baseValues = saveSQL.parameters ?? [];
        const recordIDExpr = this.buildRecordIDFromCTE(entity.EntityInfo, 'save_result');
        const s = baseValues.length + 1;
        const fullSQL = `WITH save_result AS (
    ${saveSQL.sql}
),
record_change AS (
    INSERT INTO ${this._schemaName}."RecordChange"
        ("EntityID", "RecordID", "UserID", "Type", "Source", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status", "RestoredFromID", "RestoreReason")
    SELECT $${s}::uuid, ${recordIDExpr}, $${s + 1}::uuid, $${s + 2}::varchar, $${s + 3}::varchar, $${s + 4}::text, $${s + 5}::text, $${s + 6}::text, 'Complete', $${s + 7}::uuid, $${s + 8}::text
    FROM save_result
    RETURNING "ID"
)
SELECT * FROM save_result`;
        const parameters = [
            ...baseValues,
            payload.entityID,
            payload.userID,
            payload.type,
            payload.source,
            payload.changesJSON,
            payload.changesDescription,
            payload.fullRecordJSON,
            payload.restoredFromID,
            payload.restoreReason,
        ];
        return { sql: fullSQL, parameters };
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
        // Delete function lives in the entity's own schema, mirroring codegen output.
        const simpleSQL = `SELECT * FROM ${pgDialect.QuoteSchema(entityInfo.SchemaName, fnName)}(${paramPlaceholders})`;

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

        // Walk the SQL with a tiny state machine so string literals and
        // already-quoted identifiers are preserved as opaque ranges.
        //
        // Why not the previous `match(/'[^']*'|"[^"]*"|\S+/g)` token approach?
        // It split the string on whitespace BEFORE the alternation could see
        // an opening single-quote that lives inside a non-whitespace prefix —
        // e.g. `LOWER('Loop Agent Type: System Prompt')` tokenized into
        // `LOWER('Loop`, `Agent`, `Type:`, `System`, `Prompt')`. The middle
        // tokens were treated as bare-identifier code, so `Type` (a real
        // entity field) got quoted INSIDE the string literal, producing
        // `LOWER('Loop Agent "Type": System Prompt')`. PG then matched on
        // the corrupted text and `mj sync push` saw `rows=0` for a row that
        // plainly existed in the DB. The state machine below tracks `'…'`
        // (with `''` escape) and `"…"` ranges across whitespace, so any
        // `'…'` literal stays intact regardless of its surroundings.
        let out = '';
        let i = 0;
        const n = sql.length;
        let codeBuf = '';

        const flushCode = () => {
            if (codeBuf.length === 0) return;
            out += this.quoteFieldNamesInToken(codeBuf, fieldNames);
            codeBuf = '';
        };

        while (i < n) {
            const ch = sql[i];
            if (ch === "'") {
                // Flush any pending code before opening the literal.
                flushCode();
                let j = i + 1;
                let lit = "'";
                while (j < n) {
                    if (sql[j] === "'") {
                        // SQL-style escaped quote: '' inside a literal stays inside.
                        if (j + 1 < n && sql[j + 1] === "'") {
                            lit += "''";
                            j += 2;
                            continue;
                        }
                        lit += "'";
                        j++;
                        break;
                    }
                    lit += sql[j];
                    j++;
                }
                out += lit;
                i = j;
                continue;
            }
            if (ch === '"') {
                // Already-quoted identifier — pass through untouched.
                flushCode();
                let j = i + 1;
                let id = '"';
                while (j < n && sql[j] !== '"') {
                    id += sql[j];
                    j++;
                }
                if (j < n) { id += '"'; j++; }
                out += id;
                i = j;
                continue;
            }
            codeBuf += ch;
            i++;
        }
        flushCode();
        return out;
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

    // buildCRUDParams / buildJsonArgCRUDParams have moved into the
    // dialect-driven save pipeline:
    //   - GenericDatabaseProvider.GenerateSaveSQL — orchestration + iteration
    //   - RenderSaveCallBinding (above) — binding shape (positional / JSON-arg)
    //   - WrapSaveCallForResult (above) — bare SELECT * FROM fn(...) wrap
    //   - WrapSaveCallWithRecordChange (above) — CTE record-change wrap
    // See plans/sp-save-builder-generic-layer-refactor.md (rev 4).

    /** Field-type predicate for BYTEA / varbinary / image columns. Used by JSON-arg payload. */
    private isBinaryField(field: EntityFieldInfo): boolean {
        const t = (field.Type || '').toLowerCase().trim();
        return t === 'bytea' || t.startsWith('varbinary') || t.startsWith('image');
    }

    private encodeBinaryToBase64(value: unknown): string {
        if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
        if (Buffer.isBuffer(value)) return value.toString('base64');
        if (typeof value === 'string') return value; // already encoded
        // Fallback — coerce via Buffer.from; throws on incompatible types,
        // surfacing the encoding failure at save time rather than silent corruption.
        return Buffer.from(value as ArrayBufferLike).toString('base64');
    }

    // resolveFieldValue moved to CoerceSaveFieldValue (above).
    // getWritableFields removed — the generic orchestrator filters via
    // `EntityFieldInfo.IsSPParameter` directly.

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
     * Keywords that are ONLY recognized when they appear in ALL-CAPS — matched
     * case-sensitively, unlike `_SQL_KEYWORDS` (which is matched via
     * `word.toUpperCase()`). These are reserved words that collide with very
     * common PascalCase MJ column names, so they must NOT suppress quoting of
     * the column form:
     *   - `TYPE` — `ALTER COLUMN <c> TYPE <t>` / `CREATE TYPE`; but `Type` is a
     *     column on RecordChange and many other entities.
     *   - `DATA` — `ALTER COLUMN <c> SET DATA TYPE <t>`; but `Data` is a column
     *     on several entities.
     * Putting these in the case-insensitive set would fold `Type`/`Data` column
     * refs to lowercase on PG ("column does not exist"). All-caps-only matching
     * recognizes the DDL keyword form (dialects always emit keywords upper-case)
     * while leaving the mixed-case column form quotable.
     */
    private static readonly _SQL_KEYWORDS_UPPERCASE_ONLY = new Set([
        'TYPE', 'DATA',
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

        // All-caps-only keywords (TYPE/DATA) are matched case-sensitively so the
        // DDL keyword form is recognized while the PascalCase column form stays quotable.
        const isUpperCaseOnlyKeyword = word === word.toUpperCase()
            && PostgreSQLDataProvider._SQL_KEYWORDS_UPPERCASE_ONLY.has(word);
        const isKeyword = isUpperCaseOnlyKeyword
            || PostgreSQLDataProvider._SQL_KEYWORDS.has(word.toUpperCase());
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
