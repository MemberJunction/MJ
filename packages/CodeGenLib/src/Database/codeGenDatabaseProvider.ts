import { EntityInfo, EntityFieldInfo, EntityPermissionInfo } from '@memberjunction/core';
import { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

// ─── CONNECTION ABSTRACTION ──────────────────────────────────────────────────

/**
 * Represents a single row from a query result.
 *
 * NOTE: This is typed as `any` for backward compatibility with the existing codebase,
 * which extensively accesses recordset rows with inline type annotations and untyped
 * property access inherited from the mssql driver's `IRecordSet<any>`. As individual
 * call sites are migrated to proper typing, this can be narrowed to
 * `Record<string, unknown>` or a generic parameter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CodeGenQueryRow = any;

/**
 * Result from executing a SQL query through a CodeGenConnection.
 * Normalizes the result shapes from different database drivers (mssql, pg, etc.)
 * into a single interface that the orchestrator code can rely on.
 */
export interface CodeGenQueryResult {
    /** The array of rows returned by the query. Empty array if no rows. */
    recordset: CodeGenQueryRow[];
}

/**
 * A database transaction handle that supports query execution, commit, and rollback.
 * Obtained from CodeGenConnection.beginTransaction().
 */
export interface CodeGenTransaction {
    /**
     * Executes a SQL query within this transaction.
     * @param sql The SQL statement to execute.
     * @returns The query result.
     */
    query(sql: string): Promise<CodeGenQueryResult>;

    /**
     * Commits the transaction. After commit, this transaction handle must not be reused.
     */
    commit(): Promise<void>;

    /**
     * Rolls back the transaction. After rollback, this transaction handle must not be reused.
     */
    rollback(): Promise<void>;
}

/**
 * Database-agnostic connection interface for CodeGen operations.
 *
 * This interface abstracts the underlying database driver (mssql.ConnectionPool,
 * pg.Pool, etc.) so that the orchestration code in SQLCodeGenBase, ManageMetadataBase,
 * and related classes can work with any supported database platform.
 *
 * ## Usage Patterns
 *
 * **Simple query (no parameters):**
 * ```typescript
 * const result = await conn.query("SELECT ID, Name FROM MyTable WHERE Status = Active");
 * const rows = result.recordset;
 * ```
 *
 * **Parameterized query (safe from SQL injection):**
 * ```typescript
 * const result = await conn.queryWithParams(
 *     "SELECT ID FROM MyTable WHERE Name = @Name AND SchemaName = @Schema",
 *     { Name: Users, Schema: dbo }
 * );
 * ```
 *
 * **Stored procedure / function call:**
 * ```typescript
 * const result = await conn.executeStoredProcedure(
 *     "[dbo].[spCreateEntity]",
 *     { Name: NewEntity, SchemaName: dbo }
 * );
 * ```
 *
 * **Transaction:**
 * ```typescript
 * const tx = await conn.beginTransaction();
 * try {
 *     await tx.query("INSERT INTO ...");
 *     await tx.query("UPDATE ...");
 *     await tx.commit();
 * } catch (e) {
 *     await tx.rollback();
 *     throw e;
 * }
 * ```
 *
 * ## Implementations
 * - `SQLServerCodeGenConnection` wraps `mssql.ConnectionPool` (in CodeGenLib)
 * - `PostgreSQLCodeGenConnection` wraps `pg.Pool` (in PostgreSQLDataProvider)
 */
export interface CodeGenConnection {
    /**
     * Executes a SQL query without parameters.
     * @param sql The SQL statement to execute.
     * @returns The query result with a `recordset` array.
     */
    query(sql: string): Promise<CodeGenQueryResult>;

    /**
     * Executes a SQL query with named parameters.
     * Parameters are passed as key-value pairs and the implementation is responsible
     * for binding them safely (e.g., @Name for SQL Server, $1/$2 for PostgreSQL).
     *
     * For SQL Server, the parameter names in the SQL should use @-prefix notation
     * matching the keys in the params object.
     * For PostgreSQL, the implementation translates @-prefixed names to $N notation.
     *
     * @param sql The SQL statement with parameter placeholders.
     * @param params Named parameters as key-value pairs.
     * @returns The query result with a `recordset` array.
     */
    queryWithParams(sql: string, params: Record<string, unknown>): Promise<CodeGenQueryResult>;

    /**
     * Executes a stored procedure (SQL Server) or function call (PostgreSQL).
     * @param name The fully qualified routine name (e.g., "[dbo].[spCreateEntity]").
     * @param params Named parameters for the routine.
     * @returns The query result with a `recordset` array.
     */
    executeStoredProcedure(name: string, params: Record<string, unknown>): Promise<CodeGenQueryResult>;

    /**
     * Begins a new database transaction.
     * @returns A CodeGenTransaction handle for executing queries within the transaction.
     */
    beginTransaction(): Promise<CodeGenTransaction>;
}


/**
 * Union type for stored procedure / function types (Create, Update, Delete).
 */
export const CRUDType = {
    Create: 'Create',
    Update: 'Update',
    Delete: 'Delete',
} as const;
export type CRUDType = (typeof CRUDType)[keyof typeof CRUDType];

/**
 * One missing CRUD routine reported by the post-generation validator. The
 * validator (see `CodeGenDatabaseProvider.validateExpectedCRUDFunctions`)
 * cross-checks the entity-level Allow*API/sp*Generated configuration against
 * what's actually present in the target database after CodeGen finishes. Each
 * entry represents a routine the runtime will try to invoke at Save/Delete
 * time but which doesn't exist — i.e. a silent generation gap that would
 * otherwise be invisible until the first user-driven mutation crashed.
 */
export interface CRUDValidationMissing {
    /** Entity.Name (e.g. "MJ: AI Agents") */
    entity: string;
    /** Entity.SchemaName (e.g. "__mj") */
    schema: string;
    /** Operation whose routine is missing. */
    type: 'create' | 'update' | 'delete';
    /** Routine the runtime will look up — custom name from entity.spCreate/Update/Delete
     *  if set, otherwise the dialect-generated default (e.g. `spCreateUser` for SQL Server,
     *  `fn_create_user` for PostgreSQL). */
    expectedRoutine: string;
}

/**
 * Result from full-text search SQL generation.
 */
export interface FullTextSearchResult {
    /** The complete SQL string for creating the FTS objects */
    sql: string;
    /** The name of the generated search function */
    functionName: string;
}

/**
 * Options for generating a base view.
 */
export interface BaseViewGenerationContext {
    /** Entity to generate the view for */
    entity: EntityInfo;
    /** Related field SELECT expressions (e.g., joined name fields) */
    relatedFieldsSelect: string;
    /** JOIN clauses for related entities */
    relatedFieldsJoins: string;
    /** IS-A parent entity field SELECTs */
    parentFieldsSelect: string;
    /** IS-A parent entity JOIN clauses */
    parentJoins: string;
    /** Root ID field SELECTs (for recursive FKs) */
    rootFieldsSelect: string;
    /** Root ID JOIN clauses (for recursive FKs) */
    rootJoins: string;
}

/**
 * Options for cascade delete generation.
 */
export interface CascadeDeleteContext {
    /** The parent entity being deleted */
    parentEntity: EntityInfo;
    /** The related entity whose records must be cascaded */
    relatedEntity: EntityInfo;
    /** The FK field on the related entity pointing to the parent */
    fkField: EntityFieldInfo;
    /** The operation to perform: 'delete' cascades by deleting records, 'update' sets the FK to NULL */
    operation: 'delete' | 'update';
}

/**
 * Abstract base class for database-specific code generation providers.
 *
 * Each database platform (SQL Server, PostgreSQL, etc.) implements this class
 * to generate the appropriate DDL for views, CRUD routines, triggers, indexes,
 * full-text search, permissions, and other database objects.
 *
 * The orchestrator (SQLCodeGenBase) calls these methods to produce platform-specific
 * SQL while keeping the high-level generation logic database-agnostic.
 */
export abstract class CodeGenDatabaseProvider {
    /**
     * The SQL dialect instance for this provider.
     */
    abstract get Dialect(): SQLDialect;

    /**
     * The database platform key (e.g., 'sqlserver', 'postgresql').
     */
    abstract get PlatformKey(): DatabasePlatform;

    /**
     * Whether this dialect can handle a base view that LEFT-JOINs itself to read
     * a virtual computed column (e.g. `vwRecordChanges` joining to itself for the
     * `RestoredFromID` virtual NameField lookup).
     *
     * Default: `false`. No shipped provider currently supports this pattern:
     * - PostgreSQL: `CREATE OR REPLACE VIEW` resolves view names against catalog
     *   state at parse time, so a self-reference fails with `42P01
     *   undefined_table`. A `CREATE OR REPLACE` retry against a NULL-typed stub
     *   then fails with `cannot change data type of view column ... from text
     *   to character varying(N)` because PG enforces strict column-type compat.
     * - SQL Server: the base view emitter uses `DROP VIEW` then `CREATE VIEW`,
     *   and SQL Server resolves view-body references at parse/bind time — there
     *   is no deferred name resolution for view bodies the way there is for
     *   stored procedures. After the DROP, the post-DROP self-reference fails
     *   with error 208 "Invalid object name".
     *
     * With the default of `false`, `sql_codegen.ts` skips the self-virtual-
     * NameField join entirely for self-FK + virtual-NameField cases. The trade-
     * off: the corresponding virtual lookup column (e.g. `RestoredFrom` on
     * `vwRecordChanges`, or `Parent` on a `vwTags`-style view if the Name Field
     * were computed) is not emitted on the base view. Matches the baseline-
     * shipped view shapes.
     *
     * Subclasses can override to return `true` if a future dialect (or a
     * provider that switches to a different emit pattern, e.g. stub-then-alter)
     * can support the self-reference. The fix for the underlying conflation
     * between SQL Server computed columns and view-only columns under
     * `IsVirtual = 1` would let the join target the base table instead,
     * removing the need for this capability flag entirely.
     */
    canSelfJoinViewForVirtualNameField(): boolean {
        return false;
    }

    // ─── DROP GUARDS ─────────────────────────────────────────────────────

    /**
     * Generates a conditional DROP + CREATE guard for a database object.
     * For SQL Server: `IF OBJECT_ID(...) IS NOT NULL DROP ...`
     * For PostgreSQL: `DROP ... IF EXISTS ...` or `CREATE OR REPLACE ...`
     */
    abstract generateDropGuard(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION' | 'TRIGGER', schema: string, name: string): string;

    // ─── BASE VIEWS ──────────────────────────────────────────────────────

    /**
     * Generates the complete base view DDL for an entity, including the DROP guard.
     * The orchestrator provides pre-computed context (related fields, joins, parent joins, etc.)
     * so the provider only needs to assemble the platform-specific SQL.
     */
    abstract generateBaseView(context: BaseViewGenerationContext): string;

    // ─── CRUD ROUTINES ───────────────────────────────────────────────────

    /**
     * Generates the CREATE stored procedure or function for an entity.
     * SQL Server: `CREATE PROCEDURE [schema].[spCreate...]`
     * PostgreSQL: `CREATE OR REPLACE FUNCTION schema.fn_create_...()`
     */
    abstract generateCRUDCreate(entity: EntityInfo): string;

    /**
     * Generates the UPDATE stored procedure or function for an entity.
     * Includes the updated-at trigger generation.
     */
    abstract generateCRUDUpdate(entity: EntityInfo): string;

    /**
     * Generates the DELETE stored procedure or function for an entity.
     * Handles both hard and soft delete types, and includes cascade delete logic.
     */
    abstract generateCRUDDelete(entity: EntityInfo, cascadeSQL: string): string;

    // ─── TRIGGERS ────────────────────────────────────────────────────────

    /**
     * Generates the __mj_UpdatedAt timestamp trigger for an entity.
     * SQL Server: single AFTER UPDATE trigger.
     * PostgreSQL: companion function + BEFORE UPDATE trigger.
     */
    abstract generateTimestampTrigger(entity: EntityInfo): string;

    // ─── INDEXES ─────────────────────────────────────────────────────────

    /**
     * Generates CREATE INDEX statements for all foreign key columns on an entity.
     * Returns an array of individual index DDL strings.
     */
    abstract generateForeignKeyIndexes(entity: EntityInfo): string[];

    // ─── FULL-TEXT SEARCH ────────────────────────────────────────────────

    /**
     * Generates full-text search infrastructure for an entity:
     * SQL Server: FULLTEXT CATALOG + INDEX + inline TVF
     * PostgreSQL: tsvector column + GIN index + trigger + search function
     */
    abstract generateFullTextSearch(entity: EntityInfo, searchFields: EntityFieldInfo[], primaryKeyIndexName: string): FullTextSearchResult;

    // ─── RECURSIVE FUNCTIONS (ROOT ID) ───────────────────────────────────

    /**
     * Generates a recursive root-ID function for a self-referencing FK field.
     * SQL Server: inline TVF with recursive CTE + OUTER APPLY in view.
     * PostgreSQL: scalar function with recursive CTE + LEFT JOIN LATERAL in view.
     */
    abstract generateRootIDFunction(entity: EntityInfo, field: EntityFieldInfo): string;

    /**
     * Generates the SELECT expression for a root ID field in a base view.
     * SQL Server: `rootFn.RootID AS [FieldRoot...]`
     * PostgreSQL: `root_fn.root_id AS "FieldRoot..."`
     */
    abstract generateRootFieldSelect(entity: EntityInfo, field: EntityFieldInfo, alias: string): string;

    /**
     * Generates the JOIN clause for a root ID function in a base view.
     * SQL Server: `OUTER APPLY [schema].[fnTable_GetRootID](t.ID) AS rootFn`
     * PostgreSQL: `LEFT JOIN LATERAL schema.fn_table_get_root_id(t."ID") AS root_fn ON true`
     */
    abstract generateRootFieldJoin(entity: EntityInfo, field: EntityFieldInfo, alias: string): string;

    // ─── PERMISSIONS ─────────────────────────────────────────────────────

    /**
     * Generates GRANT SELECT permission for a base view.
     */
    abstract generateViewPermissions(entity: EntityInfo): string;

    /**
     * Generates GRANT EXECUTE permission for a CRUD routine.
     */
    abstract generateCRUDPermissions(entity: EntityInfo, routineName: string, type: CRUDType): string;

    /**
     * Generates GRANT EXECUTE permission for a full-text search function.
     */
    abstract generateFullTextSearchPermissions(entity: EntityInfo, functionName: string): string;

    // ─── CASCADE DELETES ─────────────────────────────────────────────────

    /**
     * Generates the cascade delete/update SQL for a single related entity.
     * Called by the orchestrator for each FK relationship when CascadeDeletes is true.
     */
    abstract generateSingleCascadeOperation(context: CascadeDeleteContext): string;

    // ─── TIMESTAMP COLUMNS ───────────────────────────────────────────────

    /**
     * Generates ALTER TABLE statements to add __mj_CreatedAt and __mj_UpdatedAt columns.
     */
    abstract generateTimestampColumns(schema: string, tableName: string): string;

    // ─── PARAMETER / FIELD HELPERS ───────────────────────────────────────

    /**
     * Returns true when codegen should emit a `<Param>_Clear` companion
     * parameter for the given field. The companion lets callers
     * disambiguate "leave unchanged / apply DB default" (omit the
     * parameter) from "explicitly set this column to NULL"
     * (`<Param>_Clear = 1`). Required only for nullable columns whose
     * database default is itself non-NULL — without the companion, a
     * caller could not preserve a literal NULL because the dialect's
     * `IsNull` wrap would always substitute the default.
     *
     * Routes the NULL-literal check through the dialect so future
     * dialects can override what "this value is NULL" looks like in
     * their generated SQL. Pure decision logic — no rendering.
     */
    protected needsClearCompanion(ef: EntityFieldInfo): boolean {
        return ef.AllowsNull;
    }

    /**
     * Builds the EXEC parameter fragment(s) for a single field when calling a
     * tolerant update SP. Returns an array of `@ParamName = value` strings.
     *
     * For most fields this is just `['@FieldName = @variable']`. But when
     * `clearValue` is true and the field has a `_Clear` companion (see
     * {@link needsClearCompanion}), an additional `@FieldName_Clear = 1` is
     * prepended so the tolerant SP actually sets the column to NULL instead
     * of treating the NULL parameter as "leave unchanged".
     *
     * **This is the single source of truth for the calling convention of
     * tolerant update SPs.** All codepaths that generate EXEC calls to
     * spUpdate — cascade-update cursors, future SP-to-SP calls, etc. —
     * should use this method to stay in sync with the SP declaration logic
     * in {@link generateCRUDParamString}.
     *
     * @param ef         The entity field being passed
     * @param valueExpr  The SQL expression for the value (e.g. `@prefixed_var`)
     * @param clearValue Whether this field is being explicitly set to NULL
     */
    protected buildExecParamForField(ef: EntityFieldInfo, valueExpr: string, clearValue: boolean = false): string[] {
        const parts: string[] = [];
        if (clearValue && this.needsClearCompanion(ef)) {
            parts.push(`@${ef.CodeName}_Clear = 1`);
        }
        parts.push(`@${ef.CodeName} = ${valueExpr}`);
        return parts;
    }

    /**
     * Returns true when this field should appear in the parameter list of
     * a CRUD routine for the given operation (`isUpdate` true → spUpdate,
     * false → spCreate). Pure decision logic shared across all dialects:
     * filters out virtual fields, special-date fields, auto-increment PKs
     * on create, etc. Subclasses that need additional dialect-specific
     * exclusion criteria can override.
     */
    protected shouldIncludeFieldInParams(ef: EntityFieldInfo, isUpdate: boolean): boolean {
        const autoGeneratedPrimaryKey = ef.AutoIncrement;
        if (ef.IsVirtual) return false;
        if (ef.IsSpecialDateField) return false;
        if (ef.IsPrimaryKey) {
            // PK on update: always included. On create: included only if NOT auto-increment.
            return isUpdate || !autoGeneratedPrimaryKey;
        }
        // Non-PK: must be writable via API.
        return ef.AllowUpdateAPI;
    }

    /**
     * Tolerant-SP semantics: returns true when this parameter must be
     * provided by every caller (no default, no fallback). Pure decision
     * logic — Pillar 1 of the cross-app migration architecture.
     *
     * - PKs: required on update, optional on non-AutoIncrement create
     *   (codegen emits a default that lets the database supply the value).
     * - Non-PK on update: never required (merge semantics).
     * - Non-PK on create: required only when the column is NOT NULL with
     *   no database default — i.e. a value the DB has no way to fill in.
     */
    protected isParamRequired(ef: EntityFieldInfo, isUpdate: boolean): boolean {
        if (ef.IsPrimaryKey) {
            return isUpdate; // required on update, optional on create
        }
        if (isUpdate) {
            return false; // every non-PK update param is optional (merge semantics)
        }
        // Create: required only if NOT NULL with no DB default
        return !ef.AllowsNull && !ef.HasDefaultValue;
    }

    /**
     * Render hook: returns the SQL type token that should appear in a CRUD
     * parameter declaration for the given field. SQL Server emits the
     * entity-field's `SQLFullType` directly (T-SQL native); PostgreSQL maps
     * it through its type mapper. Override per dialect if your generated
     * SP signatures need a transformed type.
     */
    protected renderParameterType(ef: EntityFieldInfo): string {
        return ef.SQLFullType;
    }

    /**
     * Render hook: returns the default value for a field formatted for
     * embedding in a generated INSERT statement. The base implementation
     * delegates to `formatDefaultValue` (which handles SQL functions, quoted
     * literals, etc.). Dialects with type-strict semantics may need to
     * massage the value further — for example, PostgreSQL maps SQL Server
     * `BIT` literal defaults (`0`/`1`) to PG `BOOLEAN` literals
     * (`FALSE`/`TRUE`) so that `COALESCE(boolean_param, 0)` doesn't fail
     * with a type-mismatch error.
     */
    protected formatInsertDefaultValue(ef: EntityFieldInfo): string {
        return this.formatDefaultValue(ef.DefaultValue, ef.NeedsQuotes);
    }

    /**
     * Generates the parameter list string for a CRUD routine with tolerant
     * SP signatures (Pillar 1 of the cross-app migration architecture).
     *
     * Structural logic — what's required, what's optional, when a `_Clear`
     * companion appears — lives here in the base class and is shared across
     * dialects. The dialect-specific syntax (parameter prefix, default
     * keyword, type rendering) is delegated to:
     *   - `Dialect.ParameterRef(name)` — `@Name` vs. `p_name`
     *   - `Dialect.ParameterDefault(value)` — ` = NULL` vs. ` DEFAULT NULL`
     *   - `Dialect.NullLiteral` — `NULL` literal
     *   - `renderParameterType(ef)` — type formatting (T-SQL native vs. PG-mapped)
     *
     * Subclasses can override the hooks above without re-implementing the
     * full method. Subclasses can also override the method itself if their
     * dialect imposes additional constraints not modelable through hooks
     * (e.g. PostgreSQL's "all params after the first DEFAULT must also have
     * DEFAULTs" rule, which the PostgreSQL provider handles via override).
     */
    generateCRUDParamString(entityFields: EntityFieldInfo[], isUpdate: boolean): string {
        const dialect = this.Dialect;
        const nullDefault = dialect.ParameterDefault(dialect.NullLiteral);
        const parts: string[] = [];
        for (const ef of entityFields) {
            if (!this.shouldIncludeFieldInParams(ef, isUpdate)) continue;

            // _Clear companion is emitted immediately before its main parameter
            // for nullable columns whose database default is non-NULL.
            if (!ef.IsPrimaryKey && this.needsClearCompanion(ef)) {
                parts.push(`${dialect.ParameterRef(ef.CodeName + '_Clear')} ${dialect.BooleanParameterType()}${dialect.ParameterDefault(dialect.BooleanLiteral(false))}`);
            }

            const defaultClause = this.isParamRequired(ef, isUpdate) ? '' : nullDefault;
            parts.push(`${dialect.ParameterRef(ef.CodeName)} ${this.renderParameterType(ef)}${defaultClause}`);
        }
        return parts.join(',\n    ');
    }

    /**
     * Generates the column-list or value-list portion of an INSERT
     * statement, depending on whether `prefix` is empty (column names)
     * or non-empty (parameter values).
     *
     * **Empty `prefix`** — produces dialect-quoted column names suitable
     * for the `INSERT INTO ... (col1, col2)` clause.
     *
     * **Non-empty `prefix`** — produces the parameter-value list suitable
     * for the `VALUES (...)` clause, with tolerant-SP behavior:
     *   - Special-date fields are substituted with the dialect's
     *     `CurrentTimestampUTC()` (created/updated) or `NullLiteral`
     *     (deleted-at).
     *   - GUID fields with database defaults emit a `CASE` that detects
     *     the empty-GUID sentinel and falls back to the database default;
     *     otherwise wraps with `IsNull`.
     *   - Non-nullable fields with defaults are wrapped in
     *     `IsNull(@Param, default)`.
     *   - Nullable fields with non-NULL defaults emit a `_Clear`
     *     companion CASE so callers can distinguish "leave default"
     *     from "explicitly NULL."
     *   - Plain nullable fields with no default pass the parameter
     *     reference through directly (NULL flows through).
     *
     * Skips auto-increment, virtual, and non-updatable fields. The PK
     * column can be optionally excluded (used by the two-branch GUID-PK
     * insert pattern in `generateCRUDCreate`).
     *
     * Dialect-specific syntax is fully delegated to:
     *   - `Dialect.QuoteIdentifier`, `Dialect.ParameterRef`,
     *   - `Dialect.IsNull`, `Dialect.NullLiteral`,
     *   - `Dialect.CurrentTimestampUTC`, `Dialect.EmptyUUIDLiteral`,
     *   - `formatInsertDefaultValue(ef)` render hook (for type-strict
     *     dialects that need to massage default values).
     */
    generateInsertFieldString(entity: EntityInfo, entityFields: EntityFieldInfo[], prefix: string, excludePrimaryKey: boolean = false): string {
        const dialect = this.Dialect;
        const autoGeneratedPrimaryKey = entity.FirstPrimaryKey.AutoIncrement;
        const usingParameterPrefix = !!prefix && prefix.length > 0;
        const parts: string[] = [];
        for (const ef of entityFields) {
            if (
                (excludePrimaryKey && ef.IsPrimaryKey) ||
                (ef.IsPrimaryKey && autoGeneratedPrimaryKey) ||
                ef.IsVirtual ||
                !ef.AllowUpdateAPI ||
                ef.AutoIncrement
            ) {
                continue;
            }

            if (!usingParameterPrefix) {
                // Column-name list: emit dialect-quoted identifier.
                parts.push(dialect.QuoteIdentifier(ef.Name));
                continue;
            }

            // Parameter-value list (tolerant-SP semantics)
            if (ef.IsSpecialDateField) {
                if (ef.IsCreatedAtField || ef.IsUpdatedAtField) {
                    parts.push(dialect.CurrentTimestampUTC());
                } else {
                    parts.push(dialect.NullLiteral);
                }
                continue;
            }

            const paramRef = dialect.ParameterRef(ef.CodeName);

            if (ef.HasDefaultValue && !ef.AllowsNull && ef.IsUniqueIdentifier) {
                // GUID-PK insert: detect empty-sentinel and fall back to DB default
                const formattedDefault = this.formatInsertDefaultValue(ef);
                parts.push(`CASE WHEN ${paramRef} = ${dialect.EmptyUUIDLiteral()} THEN ${formattedDefault} ELSE ${dialect.IsNull(paramRef, formattedDefault)} END`);
            } else if (ef.HasDefaultValue && !ef.AllowsNull) {
                // Non-nullable with default: ISNULL/COALESCE merge
                const formattedDefault = this.formatInsertDefaultValue(ef);
                parts.push(dialect.IsNull(paramRef, formattedDefault));
            } else if (!ef.IsPrimaryKey && this.needsClearCompanion(ef)) {
                // Nullable with non-NULL default: _Clear companion CASE
                const formattedDefault = this.formatInsertDefaultValue(ef);
                const clearRef = dialect.ParameterRef(ef.CodeName + '_Clear');
                parts.push(`CASE WHEN ${clearRef} = ${dialect.BooleanLiteral(true)} THEN ${dialect.NullLiteral} ELSE ${dialect.IsNull(paramRef, formattedDefault)} END`);
            } else {
                // Plain pass-through (PKs, plain nullables, non-defaulted required fields)
                parts.push(paramRef);
            }
        }
        return parts.join(',\n                ');
    }

    /**
     * Generates the SET clause body for an UPDATE statement with tolerant
     * merge semantics. Each non-PK column wraps the parameter with the
     * dialect's null-coalescing call against the column's existing value
     * (`SET [Col] = ISNULL(@Param, [Col])` on SQL Server,
     * `SET "col" = COALESCE(p_col, "col")` on PostgreSQL) so omitting a
     * parameter preserves the existing row value. Nullable columns whose
     * database default is non-NULL also emit a `_Clear` companion branch
     * that lets callers distinguish "leave unchanged" from "explicitly NULL."
     *
     * The full structural logic lives here in the base class; only the
     * per-line render is dialect-specific and that's resolved through the
     * `Dialect` accessor's helpers (`QuoteIdentifier`, `ParameterRef`,
     * `IsNull`, `NullLiteral`). Subclasses can override to customize line
     * formatting if a future dialect needs something different.
     */
    generateUpdateFieldString(entityFields: EntityFieldInfo[]): string {
        const dialect = this.Dialect;
        const parts: string[] = [];
        for (const ef of entityFields) {
            if (
                ef.IsPrimaryKey ||
                ef.IsVirtual ||
                !ef.AllowUpdateAPI ||
                ef.AutoIncrement ||
                ef.IsSpecialDateField
            ) {
                continue;
            }
            const colRef = dialect.QuoteIdentifier(ef.Name);
            const paramRef = dialect.ParameterRef(ef.CodeName);
            if (this.needsClearCompanion(ef)) {
                const clearRef = dialect.ParameterRef(ef.CodeName + '_Clear');
                parts.push(`${colRef} = CASE WHEN ${clearRef} = ${dialect.BooleanLiteral(true)} THEN ${dialect.NullLiteral} ELSE ${dialect.IsNull(paramRef, colRef)} END`);
            } else {
                parts.push(`${colRef} = ${dialect.IsNull(paramRef, colRef)}`);
            }
        }
        return parts.join(',\n        ');
    }

    // ─── ROUTINE NAMING ──────────────────────────────────────────────────

    /**
     * Returns the name of the CRUD routine for an entity.
     * SQL Server: `spCreateEntityName`
     * PostgreSQL: `fn_create_entity_name`
     */
    abstract getCRUDRoutineName(entity: EntityInfo, type: CRUDType): string;

    // ─── SQL HEADERS ─────────────────────────────────────────────────────

    /**
     * Generates a comment header for a generated SQL file.
     */
    abstract generateSQLFileHeader(entity: EntityInfo, itemName: string): string;

    /**
     * Generates a comment header for the combined all-entities SQL file.
     */
    abstract generateAllEntitiesSQLFileHeader(): string;

    // ─── UTILITY ─────────────────────────────────────────────────────────

    /**
     * Formats a default value for use in generated SQL.
     * Handles SQL functions (GETUTCDATE, gen_random_uuid, etc.) and literal values.
     */
    abstract formatDefaultValue(defaultValue: string, needsQuotes: boolean): string;

    /**
     * Builds primary key variable declarations, select fields, fetch-into, and SP param strings
     * for use in cursor-based cascade operations.
     */
    abstract buildPrimaryKeyComponents(entity: EntityInfo, prefix?: string): {
        varDeclarations: string;
        selectFields: string;
        fetchInto: string;
        routineParams: string;
    };

    // ─── DATABASE INTROSPECTION ──────────────────────────────────────────

    /**
     * Returns a SQL query string to retrieve the current view definition from the database.
     * SQL Server: `SELECT OBJECT_DEFINITION(OBJECT_ID('[schema].[viewName]')) AS ViewDefinition`
     * PostgreSQL: `SELECT pg_get_viewdef('"schema"."viewName"'::regclass, true) AS "ViewDefinition"`
     *
     * The result set must include a column named `ViewDefinition`.
     */
    abstract getViewDefinitionSQL(schema: string, viewName: string): string;

    /**
     * Returns a SQL query string to retrieve the primary key index name for a table.
     * SQL Server: queries `sys.indexes` + `sys.key_constraints`
     * PostgreSQL: queries `pg_index` + `pg_class`
     *
     * The result set must include a column named `IndexName`.
     */
    abstract getPrimaryKeyIndexNameSQL(schema: string, tableName: string): string;

    /**
     * Returns a SQL query string to check if a given column is part of a composite unique constraint.
     * The query should accept the schema, table, and column name as parameters (platform-specific).
     *
     * The orchestrator checks `result.recordset.length > 0` to determine if the column
     * participates in a multi-column unique index.
     *
     * Note: Implementations should return the SQL query string. The orchestrator is responsible
     * for executing the query with proper parameterization for the target database platform.
     */
    abstract getCompositeUniqueConstraintCheckSQL(schema: string, tableName: string, columnName: string): string;

    /**
     * Returns a SQL query string to check if a foreign key index already exists.
     * Used by the orchestrator to conditionally create FK indexes.
     * SQL Server: queries `sys.indexes` with OBJECT_ID
     * PostgreSQL: queries `pg_indexes`
     *
     * The result set should return rows if the index exists (length > 0 means exists).
     */
    abstract getForeignKeyIndexExistsSQL(schema: string, tableName: string, indexName: string): string;

    /**
     * Returns the batch separator for the database platform.
     * SQL Server: 'GO'
     * PostgreSQL: '' (empty string, uses semicolons)
     */
    get BatchSeparator(): string {
        return this.Dialect.BatchSeparator();
    }

    // ─── METADATA MANAGEMENT: STORED PROCEDURE CALLS ─────────────────

    /**
     * Generates SQL to invoke a stored procedure or function.
     * SQL Server: `EXEC [schema].[spName] @Param1='val1', @Param2='val2'`
     * PostgreSQL: `SELECT * FROM schema."spName"('val1', 'val2')`
     *
     * @param schema The schema containing the routine.
     * @param routineName The routine name (e.g., `spUpdateExistingEntitiesFromSchema`).
     * @param params Ordered array of parameter values as pre-formatted SQL strings.
     *              For SQL Server these become `@ParamName='value'` pairs;
     *              for PostgreSQL they become positional arguments.
     * @param paramNames Optional parameter names for SQL Server's `@Name=value` syntax.
     *                   Ignored on PostgreSQL.
     */
    abstract callRoutineSQL(schema: string, routineName: string, params: string[], paramNames?: string[]): string;

    // ─── METADATA MANAGEMENT: CONDITIONAL INSERT ─────────────────────

    /**
     * Generates a conditional INSERT statement (insert only if not exists).
     * SQL Server: `IF NOT EXISTS (checkQuery) BEGIN insertSQL END`
     * PostgreSQL: `DO $$ BEGIN IF NOT EXISTS (checkQuery) THEN insertSQL; END IF; END $$`
     *
     * @param checkQuery The SELECT query to check for existence.
     * @param insertSQL The INSERT statement to execute if the check returns no rows.
     */
    abstract conditionalInsertSQL(checkQuery: string, insertSQL: string): string;

    /**
     * Wraps an INSERT statement with a conditional existence check at the statement level.
     * SQL Server: Adds `IF NOT EXISTS (...) BEGIN` prefix and `END` suffix.
     * PostgreSQL: Adds `ON CONFLICT DO NOTHING` suffix (no prefix needed).
     *
     * @param conflictCheckSQL The SQL Server existence check query. Ignored on PostgreSQL.
     * @returns An object with `prefix` and `suffix` strings to wrap around the INSERT.
     */
    abstract wrapInsertWithConflictGuard(conflictCheckSQL: string): { prefix: string; suffix: string };

    // ─── METADATA MANAGEMENT: DDL OPERATIONS ─────────────────────────

    /**
     * Generates ALTER TABLE ... ADD COLUMN SQL.
     * SQL Server: `ALTER TABLE [schema].[table] ADD colName TYPE [NOT] NULL [DEFAULT expr]`
     * PostgreSQL: `ALTER TABLE schema."table" ADD COLUMN "colName" TYPE [NOT] NULL [DEFAULT expr]`
     */
    abstract addColumnSQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean, defaultExpression?: string): string;

    /**
     * Generates ALTER TABLE ... ALTER COLUMN to change type and nullability.
     * SQL Server: `ALTER TABLE ... ALTER COLUMN col TYPE NULL|NOT NULL`
     * PostgreSQL: `ALTER TABLE ... ALTER COLUMN "col" TYPE type, ALTER COLUMN "col" SET|DROP NOT NULL`
     */
    abstract alterColumnTypeAndNullabilitySQL(schema: string, tableName: string, columnName: string, dataType: string, nullable: boolean): string;

    /**
     * Generates SQL to add a default constraint/value to a column.
     * SQL Server: `ALTER TABLE ... ADD CONSTRAINT DF_name DEFAULT expr FOR [col]`
     * PostgreSQL: `ALTER TABLE ... ALTER COLUMN "col" SET DEFAULT expr`
     */
    abstract addDefaultConstraintSQL(schema: string, tableName: string, columnName: string, defaultExpression: string): string;

    /**
     * Generates SQL to drop an existing default constraint from a column.
     * SQL Server: Dynamic lookup of constraint name from sys catalog + DROP.
     * PostgreSQL: Dynamic lookup from pg_catalog + ALTER COLUMN DROP DEFAULT.
     */
    abstract dropDefaultConstraintSQL(schema: string, tableName: string, columnName: string): string;

    /**
     * Generates a DROP statement for a database object (view/procedure/function).
     * SQL Server: `IF OBJECT_ID('...', 'P') IS NOT NULL DROP PROCEDURE ...`
     * PostgreSQL: `DROP FUNCTION IF EXISTS ... CASCADE`
     *
     * Note: This differs from `generateDropGuard()` which is used for CREATE OR REPLACE
     * patterns. This method is used for cleanup operations.
     */
    abstract dropObjectSQL(objectType: 'VIEW' | 'PROCEDURE' | 'FUNCTION', schema: string, name: string): string;

    // ─── METADATA MANAGEMENT: VIEW INTROSPECTION ─────────────────────

    /**
     * Returns SQL to check if a view exists.
     * The query uses `@ViewName` and `@SchemaName` as named parameters.
     * Returns 1 row if the view exists.
     */
    abstract getViewExistsSQL(): string;

    /**
     * Returns SQL to get column metadata for a view or table.
     * Result columns: FieldName, Type, Length, Precision, Scale, AllowsNull.
     */
    abstract getViewColumnsSQL(schema: string, viewName: string): string;

    // ─── METADATA MANAGEMENT: TYPE SYSTEM ────────────────────────────

    /**
     * Returns the native timestamp-with-timezone type name for this platform.
     * SQL Server: `DATETIMEOFFSET`
     * PostgreSQL: `TIMESTAMPTZ`
     */
    abstract get TimestampType(): string;

    /**
     * Compares two data type names, accounting for platform-specific aliases.
     * For example, PostgreSQL reports `timestamp with time zone` in information_schema
     * but DDL uses `timestamptz`.
     *
     * @param reported The type name as reported by the database catalog.
     * @param expected The expected type name (from DDL or configuration).
     * @returns True if the types are equivalent.
     */
    abstract compareDataTypes(reported: string, expected: string): boolean;

    // ─── METADATA MANAGEMENT: PLATFORM CONFIGURATION ─────────────────

    /**
     * Returns an array of system schema names that should be excluded from
     * metadata synchronization. Empty array if the platform has no system
     * schemas that need excluding.
     * SQL Server: `[]` (no system schemas need excluding)
     * PostgreSQL: `['information_schema', 'pg_catalog', 'pg_toast', ...]`
     */
    abstract getSystemSchemasToExclude(): string[];

    /**
     * Whether this platform needs explicit view refresh after schema changes.
     * SQL Server: `true` (uses `sp_refreshview`)
     * PostgreSQL: `false` (views resolve at query time)
     */
    abstract get NeedsViewRefresh(): boolean;

    /**
     * Generates SQL to refresh/recompile a view.
     * SQL Server: `EXEC sp_refreshview 'schema.viewName';`
     * PostgreSQL: returns empty string (no-op).
     */
    abstract generateViewRefreshSQL(schema: string, viewName: string): string;

    /**
     * Generates a simple test query to validate a view is functional.
     * SQL Server: `SELECT TOP 1 * FROM [schema].[viewName]`
     * PostgreSQL: `SELECT * FROM "schema"."viewName" LIMIT 1`
     */
    abstract generateViewTestQuerySQL(schema: string, viewName: string): string;

    /**
     * Whether this platform needs a post-sync fix for virtual field nullability.
     * SQL Server: `false`
     * PostgreSQL: `true` (PG view columns always report attnotnull=false)
     */
    abstract get NeedsVirtualFieldNullabilityFix(): boolean;

    // ─── METADATA MANAGEMENT: SQL QUOTING ────────────────────────────

    /**
     * Quotes mixed-case identifiers in a raw SQL string for execution.
     * SQL Server: returns the SQL unchanged (case-insensitive identifiers).
     * PostgreSQL: double-quotes PascalCase identifiers to preserve case.
     */
    abstract quoteSQLForExecution(sql: string): string;

    // ─── METADATA MANAGEMENT: DEFAULT VALUE PARSING ──────────────────

    /**
     * Parses a raw default-value string from the database catalog into a clean value.
     * SQL Server: strips wrapping parens and N'' prefix, e.g. `(getdate())` → `getdate()`
     * PostgreSQL: strips `::type` casts, recognizes `nextval()` as auto-increment (returns null).
     *
     * @returns The cleaned default value, or `null` if the column has no meaningful default.
     */
    abstract parseColumnDefaultValue(sqlDefaultValue: string): string | null;

    // ─── METADATA MANAGEMENT: COMPLEX SQL GENERATION ─────────────────

    /**
     * Generates the SQL to retrieve pending entity fields that exist in the database
     * but not yet in the MJ metadata. This is a large, platform-specific query.
     *
     * @param mjCoreSchema The MJ core schema name (e.g., `__mj`).
     * @param entityIDs Optional list of entity UUIDs to scope the query to. When provided,
     *   the query filters to fields belonging to those entities only — used by Pass 2 to
     *   avoid re-scanning the entire schema for entities that haven't changed. `undefined`
     *   or empty preserves the prior unscoped behavior.
     */
    abstract getPendingEntityFieldsSQL(mjCoreSchema: string, entityIDs?: string[]): string;

    /**
     * Returns an additional WHERE clause fragment for the check-constraints query.
     * SQL Server: ` WHERE SchemaName NOT IN (...)` when excludeSchemas is provided.
     * PostgreSQL: empty string (the PG view already handles schema filtering).
     */
    abstract getCheckConstraintsSchemaFilter(excludeSchemas: string[]): string;

    /**
     * Returns an additional WHERE clause fragment for the missing-base-tables query.
     * SQL Server: ` WHERE VirtualEntity=0`
     * PostgreSQL: empty string (PG query doesn't need this filter).
     */
    abstract getEntitiesWithMissingBaseTablesFilter(): string;

    /**
     * Generates SQL to fix virtual field nullability after metadata sync.
     * PostgreSQL: Updates AllowsNull for virtual fields based on the FK column's nullability.
     * SQL Server: returns empty string (no fix needed).
     *
     * @param mjCoreSchema The MJ core schema name.
     */
    abstract getFixVirtualFieldNullabilitySQL(mjCoreSchema: string): string;

    // ─── METADATA MANAGEMENT: SQL FILE EXECUTION ─────────────────────

    /**
     * Executes a SQL file using the platform's native CLI tool (sqlcmd/psql).
     * The implementation is responsible for reading connection configuration
     * from the environment or config objects.
     *
     * @param filePath Path to the SQL file to execute.
     * @returns True if execution succeeded, false otherwise.
     */
    abstract executeSQLFileViaShell(filePath: string): Promise<boolean>;

    /**
     * Optional — dialect-specific fast path for regenerating a single entity's
     * base view with recovery logic.
     *
     * When provided, the orchestration layer (sql.ts regenerateFailedBaseViews)
     * will route regeneration through this method instead of the generic
     * write-temp-file-and-shell-out path. Implementations can add capture/
     * recovery behavior around the `CREATE OR REPLACE VIEW` — e.g. PG's 42P16
     * capture-and-restore fallback that preserves dependent views, functions,
     * grants, comments, and ownership across the unavoidable DROP CASCADE.
     *
     * @param entity The entity whose base view is being regenerated.
     * @param viewSQL The full output of generateBaseView for this entity.
     * @param willRegenerate Optional set of `"schema.viewName"` strings for
     *                       views the caller will regenerate later in the same
     *                       run — implementations may skip restoring those
     *                       dependents since CodeGen will recreate them.
     * @throws Error on failure — callers should treat this identically to any
     *               other per-entity regeneration failure (collected into the
     *               batch summary, halts the install in strict mode).
     */
    regenerateBaseView?(
        entity: EntityInfo,
        viewSQL: string,
        willRegenerate?: Set<string>
    ): Promise<void>;

    /**
     * Optional — dialect-specific phased execution of a single entity's full
     * CodeGen SQL package (view, CRUD functions, permissions) for the main
     * per-entity run path.
     *
     * Default path concatenates all the SQL and hands it to the shell executor,
     * which runs it as a single multi-statement query. When any statement
     * fails, pg's simple-query protocol aborts the rest of the batch — so a
     * view that fails 42P16 silently blocks the CREATE FUNCTIONs that follow
     * for the same entity.
     *
     * Providers that implement this method run the pieces in separate phases
     * so a failure in phase 1 prevents phase 2 from producing functions that
     * reference a missing or stale view. PG's implementation additionally
     * routes the view phase through the 42P16 capture/restore fallback.
     *
     * Phasing contract:
     *   Phase 0 = TVF DDL (tvfSQL) — root-ID functions for recursive FKs that
     *             the base view references. Must run before phase 1 or PG
     *             rejects the view with `function does not exist`.
     *   Phase 1 = view DDL (viewSQL) — may invoke provider-specific recovery.
     *   Phase 2 = CRUD function DDL — ONLY runs if phase 1 succeeded.
     *   Phase 3 = view permissions (viewPermSQL) — runs only if phase 2 succeeded.
     * The `success`/`phase` pair in the result identifies exactly where things
     * fell over so the caller doesn't have to bisect.
     */
    executeEntityPhased?(opts: {
        entity: EntityInfo;
        /** Root-ID TVF DDL emitted ahead of the view. Empty when the entity
         *  has no recursive ParentID FKs. */
        tvfSQL: string;
        viewSQL: string;
        crudCreateSQL: string;
        crudUpdateSQL: string;
        crudDeleteSQL: string;
        viewPermSQL: string;
        willRegenerate?: Set<string>;
    }): Promise<PhasedExecutionResult>;

    // ─── POST-RUN VALIDATION ─────────────────────────────────────────────

    /**
     * Returns a SQL query that lists every stored procedure / function name in
     * the given schemas. Used by the post-run CRUD validator to diff expected
     * vs actual routine presence in one round trip.
     *
     * The result set must contain exactly two columns:
     *   `schema_name` — the schema the routine lives in
     *   `routine_name` — the proc/function name as stored in the catalog
     *
     * SQL Server: queries `sys.objects` for procedures and functions.
     * PostgreSQL: queries `pg_proc` joined to `pg_namespace`.
     *
     * Default: returns empty string. Providers that don't implement this opt
     * out of the post-run CRUD validator (the validator returns no missing
     * when this returns empty), preserving backwards compatibility for
     * downstream subclasses that haven't been updated.
     *
     * @param schemas List of schemas to scan. Empty array returns no rows.
     */
    getRoutineNamesBySchemaSQL(_schemas: string[]): string {
        return '';
    }

    /**
     * Cross-checks the entity-level Allow*API/sp*Generated/sp* configuration
     * against the routines actually present in the database after CodeGen
     * finishes. Returns one entry per missing routine.
     *
     * **Why this exists:** silent generation gaps (e.g. an entity dropped
     * because an upstream batch errored, or stale entity-field metadata
     * causing the PK check to fail) historically reported success at the
     * pipeline level while leaving runtime CRUD broken. This validator turns
     * that into a loud, actionable failure list before the install pipeline
     * exits.
     *
     * **What's expected per entity:**
     * - Skip virtual entities (no DB-backed routines).
     * - For each of Create / Update / Delete:
     *   - Skip when the corresponding `Allow{Type}API` flag is false.
     *   - Look up the routine name via `getCRUDRoutineName` (which honors
     *     `entity.spCreate`/`spUpdate`/`spDelete` overrides; otherwise returns
     *     the dialect-generated default).
     *   - Report it as missing when not found in the DB catalog.
     *
     * Schema-level case sensitivity: SQL Server is case-insensitive,
     * PostgreSQL is case-preserving. Both lookups normalize via lowercase to
     * keep the validator dialect-agnostic.
     *
     * Default implementation works for both dialects via the
     * `getRoutineNamesBySchemaSQL` helper. Providers may override to add
     * platform-specific shortcuts (e.g. checking only `sys.procedures` on
     * SQL Server) but the default is fine for all current dialects.
     */
    async validateExpectedCRUDFunctions(
        pool: CodeGenConnection,
        entities: EntityInfo[],
    ): Promise<CRUDValidationMissing[]> {
        // Build the expected list: one entry per entity × Create/Update/Delete
        // where the entity opts in via Allow{Type}API and isn't a virtual entity.
        const expected: CRUDValidationMissing[] = [];
        const schemas = new Set<string>();
        for (const entity of entities) {
            if (entity.VirtualEntity) continue;
            schemas.add(entity.SchemaName);
            if (entity.AllowCreateAPI) {
                expected.push({
                    entity: entity.Name,
                    schema: entity.SchemaName,
                    type: 'create',
                    expectedRoutine: this.getCRUDRoutineName(entity, CRUDType.Create),
                });
            }
            if (entity.AllowUpdateAPI) {
                expected.push({
                    entity: entity.Name,
                    schema: entity.SchemaName,
                    type: 'update',
                    expectedRoutine: this.getCRUDRoutineName(entity, CRUDType.Update),
                });
            }
            if (entity.AllowDeleteAPI) {
                expected.push({
                    entity: entity.Name,
                    schema: entity.SchemaName,
                    type: 'delete',
                    expectedRoutine: this.getCRUDRoutineName(entity, CRUDType.Delete),
                });
            }
        }

        if (expected.length === 0) return [];

        // One round-trip to fetch every routine in the relevant schemas.
        const sql = this.getRoutineNamesBySchemaSQL(Array.from(schemas));
        if (!sql || !sql.trim()) return [];
        const result = await pool.query(sql);
        const existing = new Set<string>();
        for (const row of result.recordset) {
            const schemaName = String(row.schema_name ?? '').toLowerCase();
            const routineName = String(row.routine_name ?? '').toLowerCase();
            if (schemaName && routineName) {
                existing.add(`${schemaName}.${routineName}`);
            }
        }

        return expected.filter(e =>
            !existing.has(`${e.schema.toLowerCase()}.${e.expectedRoutine.toLowerCase()}`)
        );
    }
}

/**
 * Result of a phased per-entity SQL execution. Reports which phase (if any)
 * failed so the caller can aggregate a per-entity diagnostic without bisecting.
 */
export interface PhasedExecutionResult {
    /** True only when every requested phase succeeded. */
    success: boolean;
    /** Which phase failed. Null when `success` is true. */
    phase: 'tvf' | 'view' | 'functions' | 'permissions' | null;
    /** Underlying error when `success` is false. */
    error?: Error;
}
