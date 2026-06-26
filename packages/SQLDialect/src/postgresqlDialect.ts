import { DataTypeMap, MappedType } from './dataTypeMap.js';
import {
    SQLDialect,
    DatabasePlatform,
    LimitClauseResult,
    SchemaIntrospectionSQL,
    TriggerOptions,
    IndexOptions,
    ColumnDDLOptions,
    AlterColumnOptions,
    ResolveTypeOptions,
} from './sqlDialect.js';

/**
 * PostgreSQL data type mapping.
 * Maps SQL Server types to their PostgreSQL equivalents.
 */
class PostgreSQLDataTypeMap implements DataTypeMap {
    MapType(sourceType: string, sourceLength?: number, sourcePrecision?: number, sourceScale?: number): MappedType {
        const normalized = sourceType.toUpperCase().trim();

        switch (normalized) {
            case 'UNIQUEIDENTIFIER':
                return { typeName: 'UUID', supportsLength: false, supportsPrecisionScale: false };
            case 'NVARCHAR':
                return this.mapNVarchar(sourceLength);
            case 'VARCHAR':
                return this.mapVarchar(sourceLength);
            case 'NCHAR':
            case 'CHAR':
                return { typeName: 'CHAR', supportsLength: true, supportsPrecisionScale: false, defaultLength: sourceLength ?? 1 };
            case 'INT':
            case 'INTEGER':
                return { typeName: 'INTEGER', supportsLength: false, supportsPrecisionScale: false };
            case 'BIGINT':
                return { typeName: 'BIGINT', supportsLength: false, supportsPrecisionScale: false };
            case 'SMALLINT':
                return { typeName: 'SMALLINT', supportsLength: false, supportsPrecisionScale: false };
            case 'TINYINT':
                return { typeName: 'SMALLINT', supportsLength: false, supportsPrecisionScale: false };
            case 'BIT':
                return { typeName: 'BOOLEAN', supportsLength: false, supportsPrecisionScale: false };
            case 'DECIMAL':
            case 'NUMERIC':
                return { typeName: 'NUMERIC', supportsLength: false, supportsPrecisionScale: true };
            case 'FLOAT':
                return this.mapFloat(sourcePrecision);
            case 'REAL':
                return { typeName: 'REAL', supportsLength: false, supportsPrecisionScale: false };
            case 'MONEY':
                return { typeName: 'NUMERIC(19,4)', supportsLength: false, supportsPrecisionScale: false };
            case 'SMALLMONEY':
                return { typeName: 'NUMERIC(10,4)', supportsLength: false, supportsPrecisionScale: false };
            case 'DATE':
                return { typeName: 'DATE', supportsLength: false, supportsPrecisionScale: false };
            case 'DATETIME':
            case 'DATETIME2':
                return { typeName: 'TIMESTAMP', supportsLength: false, supportsPrecisionScale: false };
            case 'DATETIMEOFFSET':
                return { typeName: 'TIMESTAMPTZ', supportsLength: false, supportsPrecisionScale: false };
            case 'SMALLDATETIME':
                return { typeName: 'TIMESTAMP(0)', supportsLength: false, supportsPrecisionScale: false };
            case 'TIME':
                return { typeName: 'TIME', supportsLength: false, supportsPrecisionScale: false };
            case 'TEXT':
            case 'NTEXT':
                return { typeName: 'TEXT', supportsLength: false, supportsPrecisionScale: false };
            case 'IMAGE':
                return { typeName: 'BYTEA', supportsLength: false, supportsPrecisionScale: false };
            case 'VARBINARY':
                return { typeName: 'BYTEA', supportsLength: false, supportsPrecisionScale: false };
            case 'BINARY':
                return { typeName: 'BYTEA', supportsLength: false, supportsPrecisionScale: false };
            case 'XML':
                return { typeName: 'XML', supportsLength: false, supportsPrecisionScale: false };
            // PostgreSQL native types (pass through)
            case 'UUID':
                return { typeName: 'UUID', supportsLength: false, supportsPrecisionScale: false };
            case 'BOOLEAN':
                return { typeName: 'BOOLEAN', supportsLength: false, supportsPrecisionScale: false };
            case 'TIMESTAMPTZ':
                return { typeName: 'TIMESTAMPTZ', supportsLength: false, supportsPrecisionScale: false };
            case 'TIMESTAMP':
                return { typeName: 'TIMESTAMP', supportsLength: false, supportsPrecisionScale: false };
            case 'BYTEA':
                return { typeName: 'BYTEA', supportsLength: false, supportsPrecisionScale: false };
            case 'JSONB':
                return { typeName: 'JSONB', supportsLength: false, supportsPrecisionScale: false };
            case 'JSON':
                return { typeName: 'JSON', supportsLength: false, supportsPrecisionScale: false };
            case 'SERIAL':
                return { typeName: 'SERIAL', supportsLength: false, supportsPrecisionScale: false };
            case 'BIGSERIAL':
                return { typeName: 'BIGSERIAL', supportsLength: false, supportsPrecisionScale: false };
            case 'DOUBLE PRECISION':
                return { typeName: 'DOUBLE PRECISION', supportsLength: false, supportsPrecisionScale: false };
            default:
                return { typeName: normalized, supportsLength: false, supportsPrecisionScale: false };
        }
    }

    MapTypeToString(sourceType: string, sourceLength?: number, sourcePrecision?: number, sourceScale?: number): string {
        const mapped = this.MapType(sourceType, sourceLength, sourcePrecision, sourceScale);
        return formatTypeString(mapped, sourceLength, sourcePrecision, sourceScale);
    }

    private mapNVarchar(length?: number): MappedType {
        if (length === -1 || length === undefined) {
            return { typeName: 'TEXT', supportsLength: false, supportsPrecisionScale: false };
        }
        return { typeName: 'VARCHAR', supportsLength: true, supportsPrecisionScale: false, defaultLength: length };
    }

    private mapVarchar(length?: number): MappedType {
        if (length === -1 || length === undefined) {
            return { typeName: 'TEXT', supportsLength: false, supportsPrecisionScale: false };
        }
        return { typeName: 'VARCHAR', supportsLength: true, supportsPrecisionScale: false, defaultLength: length };
    }

    private mapFloat(precision?: number): MappedType {
        // SQL Server FLOAT(1-24) = REAL, FLOAT(25-53) = DOUBLE PRECISION
        if (precision != null && precision <= 24) {
            return { typeName: 'REAL', supportsLength: false, supportsPrecisionScale: false };
        }
        return { typeName: 'DOUBLE PRECISION', supportsLength: false, supportsPrecisionScale: false };
    }
}

/**
 * Helper to format a MappedType into a full SQL type string.
 */
function formatTypeString(mapped: MappedType, length?: number, precision?: number, scale?: number): string {
    if (mapped.supportsPrecisionScale && precision != null) {
        return scale != null
            ? `${mapped.typeName}(${precision},${scale})`
            : `${mapped.typeName}(${precision})`;
    }
    if (mapped.supportsLength) {
        const len = length ?? mapped.defaultLength;
        if (len != null) {
            return len === -1 ? 'TEXT' : `${mapped.typeName}(${len})`;
        }
    }
    return mapped.typeName;
}

/**
 * PostgreSQL dialect implementation.
 * Uses "double-quote" identifiers, LIMIT/OFFSET pagination, native BOOLEAN, PL/pgSQL functions.
 */
export class PostgreSQLDialect extends SQLDialect {
    get PlatformKey(): DatabasePlatform {
        return 'postgresql';
    }

    get ParserDialect(): string {
        return 'PostgresQL';
    }

    /**
     * PostgreSQL has no in-row row-size limit (TOAST stores oversized variable-length values
     * out-of-line), so {@link MaxInRowSizeBytes} stays `null` (inherited). It does enforce a
     * hard 1600-column-per-table cap.
     */
    override get MaxColumnCount(): number { return 1600; }

    // ─── Identifier Quoting ──────────────────────────────────────────

    QuoteIdentifier(name: string): string {
        return `"${name}"`;
    }

    QuoteSchema(schema: string, object: string): string {
        return `${schema}."${object}"`;
    }

    /**
     * PostgreSQL folds unquoted identifiers to lowercase, which would turn
     * `AS EntityName` into the result column `entityname`. Quoting the
     * alias preserves the requested casing for callers that key off the
     * column name (e.g. when consuming results into a TypeScript object
     * with a PascalCase property).
     */
    QuoteColumnAlias(aliasName: string): string {
        return `"${aliasName}"`;
    }

    /**
     * PostgreSQL folds unquoted identifiers to lowercase, so the physical schema an
     * unquoted `CREATE SCHEMA __mj_BizAppsCommon` produces is `__mj_bizappscommon`.
     * Canonicalize to that lowercase form so the engine's quoted operations target the
     * same physical schema as the app's (typically unquoted) migration DDL.
     */
    CanonicalSchemaName(name: string): string {
        return name.toLowerCase();
    }

    // ─── Pagination ──────────────────────────────────────────────────

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        const parts = [`LIMIT ${limit}`];
        if (offset != null) {
            parts.push(`OFFSET ${offset}`);
        }
        return { prefix: '', suffix: parts.join(' ') };
    }

    // ─── Literals & Expressions ──────────────────────────────────────

    BooleanLiteral(value: boolean): string {
        return value ? 'true' : 'false';
    }

    BooleanParameterType(): string {
        return 'boolean';
    }

    /**
     * PostgreSQL has no `ISNULL` keyword; the standard is `COALESCE` (which
     * SQL Server also supports). PG generated SPs/functions emit COALESCE
     * everywhere a null-coalescing wrap is needed.
     */
    IsNull(expr: string, fallback: string): string {
        return `COALESCE(${expr}, ${fallback})`;
    }

    /**
     * PostgreSQL's n-ary null-coalescing is also `COALESCE`. Same form as
     * the two-arg `IsNull` since PG has no `ISNULL` to differentiate from.
     */
    Coalesce(expr: string, fallback: string): string {
        return `COALESCE(${expr}, ${fallback})`;
    }

    /**
     * PostgreSQL function parameters use a `p_<flat lowercase>` convention
     * (no `@`-prefix syntax in PG). This matches the baseline-ported SP names
     * (which lowercased SQL Server's PascalCase parameter names without
     * separators — e.g. `@CompanyID` → `p_companyid`) and the runtime
     * PostgreSQLDataProvider, which calls procs with `p_${field.Name.toLowerCase()}`.
     *
     * Earlier this used a snake_case transform (`p_company_id`), which
     * produced functions the runtime could never invoke. Underscores already
     * in the input (e.g. the `_Clear` companion suffix) are preserved.
     */
    ParameterRef(name: string): string {
        return `p_${name.toLowerCase()}`;
    }

    /**
     * PostgreSQL functions use the `DEFAULT <value>` clause for parameter defaults.
     */
    ParameterDefault(value: string): string {
        return ` DEFAULT ${value}`;
    }

    CurrentTimestampUTC(): string {
        return "(NOW() AT TIME ZONE 'UTC')";
    }

    // ─── Type-Name Sets ──────────────────────────────────────────────
    // PostgreSQL's column-type names as they appear in `pg_catalog` /
    // `information_schema` / `EntityField.Type` for entities backed by PG.
    // Includes both the formal name (`character varying`) and the internal
    // / short alias (`varchar`, `bpchar`) since both surface depending on
    // the metadata source.

    private static readonly _BooleanTypeNames = ['bool', 'boolean'] as const;
    private static readonly _StringTypeNames = ['text', 'varchar', 'char', 'character', 'character varying', 'bpchar', 'citext', 'name'] as const;
    /**
     * PG fixed-width / space-padded char types. `character` (without `varying`)
     * and `bpchar` are the formal/internal names; `char` is the short alias.
     * Note: `character varying` is NOT included — it's variable-width.
     */
    private static readonly _FixedWidthStringTypeNames = ['char', 'character', 'bpchar'] as const;
    private static readonly _DateTypeNames = ['date', 'time', 'time without time zone', 'time with time zone', 'timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone'] as const;
    private static readonly _IntegerTypeNames = ['int', 'int2', 'int4', 'int8', 'integer', 'bigint', 'smallint', 'serial', 'bigserial', 'smallserial', 'oid'] as const;
    private static readonly _FloatTypeNames = ['decimal', 'numeric', 'real', 'double precision', 'float4', 'float8'] as const;
    private static readonly _UuidTypeNames = ['uuid'] as const;
    private static readonly _BinaryTypeNames = ['bytea'] as const;
    private static readonly _JsonTypeNames = ['json', 'jsonb', 'xml'] as const;
    private static readonly _CurrencyTypeNames = ['money'] as const;
    private static readonly _IntervalTypeNames = ['interval'] as const;
    private static readonly _NetworkTypeNames = ['inet', 'cidr', 'macaddr', 'macaddr8'] as const;

    get BooleanTypeNames(): readonly string[]  { return PostgreSQLDialect._BooleanTypeNames; }
    get StringTypeNames(): readonly string[]   { return PostgreSQLDialect._StringTypeNames; }
    get FixedWidthStringTypeNames(): readonly string[] { return PostgreSQLDialect._FixedWidthStringTypeNames; }
    get DateTypeNames(): readonly string[]     { return PostgreSQLDialect._DateTypeNames; }
    get IntegerTypeNames(): readonly string[]  { return PostgreSQLDialect._IntegerTypeNames; }
    get FloatTypeNames(): readonly string[]    { return PostgreSQLDialect._FloatTypeNames; }
    get UuidTypeNames(): readonly string[]     { return PostgreSQLDialect._UuidTypeNames; }
    get BinaryTypeNames(): readonly string[]   { return PostgreSQLDialect._BinaryTypeNames; }
    get JsonTypeNames(): readonly string[]     { return PostgreSQLDialect._JsonTypeNames; }
    get CurrencyTypeNames(): readonly string[] { return PostgreSQLDialect._CurrencyTypeNames; }
    get IntervalTypeNames(): readonly string[] { return PostgreSQLDialect._IntervalTypeNames; }
    get NetworkTypeNames(): readonly string[]  { return PostgreSQLDialect._NetworkTypeNames; }

    NewUUID(): string {
        return 'gen_random_uuid()';
    }

    CastToText(expr: string): string {
        return `CAST(${expr} AS TEXT)`;
    }

    /**
     * PostgreSQL-specific Flyway escape. PostgreSQL string concatenation uses
     * `||` (not `+`), and TEXT has no length cap — so a simple split with `||`
     * suffices and no cast-to-MAX dance is needed (unlike SQL Server, which
     * silently truncates `NVARCHAR(N) + NVARCHAR(M)` past 4,000 chars).
     * PostgreSQL string literals don't take an `N` prefix either; everything
     * is already Unicode.
     */
    EscapeFlywayStringInterpolation(sql: string): string {
        return sql.replaceAll(/\$\{/g, "$$'||'{");
    }

    CastToUUID(expr: string): string {
        return `CAST(${expr} AS UUID)`;
    }

    /**
     * PostgreSQL strict typing requires an explicit `::UUID` cast when
     * comparing the empty-GUID sentinel against a UUID-typed column.
     * Without it, PG raises "operator does not exist: uuid = text".
     */
    EmptyUUIDLiteral(): string {
        return `${super.EmptyUUIDLiteral()}::UUID`;
    }

    // ─── INSERT/UPDATE Return Patterns ───────────────────────────────

    ReturnInsertedClause(columns?: string[]): string {
        if (columns && columns.length > 0) {
            const cols = columns.map(c => `"${c}"`).join(', ');
            return `RETURNING ${cols}`;
        }
        return 'RETURNING *';
    }

    AutoIncrementPKExpression(): string {
        return 'GENERATED ALWAYS AS IDENTITY';
    }

    UUIDPKDefault(): string {
        return 'gen_random_uuid()';
    }

    ScopeIdentityExpression(): string {
        return 'lastval()';
    }

    RowCountExpression(): string {
        // In PL/pgSQL, use GET DIAGNOSTICS row_count = ROW_COUNT
        return 'ROW_COUNT';
    }

    // ─── Batch & DDL Control ─────────────────────────────────────────

    BatchSeparator(): string {
        return ''; // PostgreSQL does not need batch separators
    }

    /**
     * Splits an oversized SQL batch into individual statements on `;`+EOL
     * boundaries — but NEVER inside a PostgreSQL dollar-quoted block
     * (`$$ … $$` or `$tag$ … $tag$`), whose body legitimately contains
     * `;`+newline (DO blocks, PL/pgSQL function bodies, the integration
     * view-drop guard `$mj_dropviews$`). A naive `split(/;\s*\n/g)` tears
     * those apart. Outside dollar blocks the boundary semantics mirror the
     * base `split(/;\s*\n/g)` (a `;` then optional inline whitespace then a
     * newline). Each returned statement ends with `;`.
     */
    SplitStatements(batch: string): string[] {
        const statements: string[] = [];
        let current = '';
        let dollarTag: string | null = null;   // active dollar-quote tag (e.g. '$$' or '$fn$'), or null
        const isTagChar = (c: string) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '_';
        for (let i = 0; i < batch.length; i++) {
            const ch = batch[i];
            if (ch === '$') {
                // Scan a dollar-quote tag: `$` [A-Za-z0-9_]* `$`.
                let j = i + 1;
                while (j < batch.length && isTagChar(batch[j])) j++;
                if (batch[j] === '$') {
                    const tag = batch.slice(i, j + 1);
                    if (dollarTag === null) dollarTag = tag;          // entering a dollar-quoted block
                    else if (dollarTag === tag) dollarTag = null;     // matching close → exiting
                    current += tag;
                    i = j;
                    continue;
                }
            }
            if (ch === ';' && dollarTag === null) {
                // Boundary = `;` then optional spaces/tabs/CR then a newline — only OUTSIDE a dollar block.
                let j = i + 1;
                while (j < batch.length && (batch[j] === ' ' || batch[j] === '\t' || batch[j] === '\r')) j++;
                if (j < batch.length && batch[j] === '\n') {
                    current += ';';
                    const trimmed = current.trim();
                    if (trimmed.length > 0) statements.push(trimmed);
                    current = '';
                    i = j;   // skip the inline whitespace; the loop's i++ steps past the newline
                    continue;
                }
            }
            current += ch;
        }
        const tail = current.trim();
        if (tail.length > 0) statements.push(tail);
        return statements.map((s) => (s.endsWith(';') ? s : s + ';'));
    }

    ExistenceCheckSQL(objectType: string, schema: string, name: string): string {
        const normalizedType = objectType.toUpperCase();
        switch (normalizedType) {
            case 'TABLE':
                return `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = '${schema}' AND tablename = '${name}')`;
            case 'VIEW':
                return `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_views WHERE schemaname = '${schema}' AND viewname = '${name}')`;
            case 'FUNCTION':
                return `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${schema}' AND p.proname = '${name}')`;
            case 'PROCEDURE':
                return `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${schema}' AND p.proname = '${name}' AND p.prokind = 'p')`;
            case 'TRIGGER':
                return `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = '${name}')`;
            default:
                return `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = '${schema}' AND c.relname = '${name}')`;
        }
    }

    CreateOrReplaceSupported(objectType: string): boolean {
        const normalized = objectType.toUpperCase();
        return normalized === 'FUNCTION' || normalized === 'VIEW' || normalized === 'PROCEDURE';
    }

    // ─── Full-Text Search ────────────────────────────────────────────

    FullTextSearchPredicate(column: string, searchTerm: string): string {
        return `${column} @@ plainto_tsquery('english', ${searchTerm})`;
    }

    FullTextIndexDDL(table: string, columns: string[], _catalog?: string): string {
        const colList = columns.map(c => `"${c}"`).join(', ');
        const cleanTable = table.replace(/"/g, '');
        const triggerCols = columns.map(c => `"${c}"`).join(', ');
        const lines: string[] = [];

        // Add tsvector column
        lines.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS __mj_fts_vector TSVECTOR;`);
        lines.push('');

        // Create GIN index on the tsvector column
        lines.push(`CREATE INDEX IF NOT EXISTS idx_fts_${cleanTable.replace(/\./g, '_')} ON ${table} USING GIN(__mj_fts_vector);`);
        lines.push('');

        // Create update trigger
        lines.push(`CREATE OR REPLACE FUNCTION ${this.extractSchema(table)}.fn_trg_fts_${this.extractName(table)}()`);
        lines.push('RETURNS TRIGGER AS $$');
        lines.push('BEGIN');
        lines.push(`    NEW.__mj_fts_vector := to_tsvector('english', ${columns.map(c => `COALESCE(NEW."${c}", '')`).join(" || ' ' || ")});`);
        lines.push('    RETURN NEW;');
        lines.push('END;');
        lines.push('$$ LANGUAGE plpgsql;');
        lines.push('');

        lines.push(`DROP TRIGGER IF EXISTS trg_fts_${this.extractName(table)} ON ${table};`);
        lines.push(`CREATE TRIGGER trg_fts_${this.extractName(table)}`);
        lines.push(`    BEFORE INSERT OR UPDATE ON ${table}`);
        lines.push(`    FOR EACH ROW EXECUTE FUNCTION ${this.extractSchema(table)}.fn_trg_fts_${this.extractName(table)}();`);

        return lines.join('\n');
    }

    // ─── CTE / Recursion ─────────────────────────────────────────────

    RecursiveCTESyntax(): string {
        return 'WITH RECURSIVE';
    }

    get AllowsOrderByInCTE(): boolean {
        return true;
    }

    get DefaultPagingOrderBy(): string {
        return '1';
    }

    // ─── Data Types ──────────────────────────────────────────────────

    get TypeMap(): DataTypeMap {
        return new PostgreSQLDataTypeMap();
    }

    // ─── Parameters ──────────────────────────────────────────────────

    ParameterPlaceholder(index: number): string {
        return `$${index + 1}`; // PostgreSQL uses 1-based indexing
    }

    ConcatOperator(): string {
        return '||';
    }

    // ─── String Functions ────────────────────────────────────────────

    StringSplitFunction(value: string, delimiter: string): string {
        return `unnest(string_to_array(${value}, ${delimiter}))`;
    }

    JsonExtract(column: string, path: string): string {
        // PostgreSQL JSONB operator for text extraction
        return `${column}->>'${path}'`;
    }

    // ─── Procedure / Function Calls ──────────────────────────────────

    ProcedureCallSyntax(schema: string, name: string, params: string[]): string {
        const paramList = params.join(', ');
        return `SELECT * FROM ${schema}."${name}"(${paramList})`;
    }

    // ─── DDL Generation (Schema/Table) ──────────────────────────────

    CreateSchemaDDL(schemaName: string): string {
        return `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`;
    }

    // ─── DDL Generation (Conditional/Procedural) ────────────────────

    DateAddExpression(unit: 'MINUTE' | 'HOUR' | 'DAY', amount: number, baseExpr: string): string {
        const pgUnit = unit.toLowerCase() + 's'; // MINUTE -> minutes, HOUR -> hours, DAY -> days
        return `${baseExpr} + INTERVAL '${amount} ${pgUnit}'`;
    }

    CreateTableIfNotExistsDDL(schema: string, tableName: string, columnsDDL: string): string {
        const quotedTable = this.QuoteSchema(schema, tableName);
        return [
            `CREATE TABLE IF NOT EXISTS ${quotedTable} (`,
            columnsDDL,
            `);`,
        ].join('\n');
    }

    ConditionalBlock(condition: string, thenSQL: string, elseSQL?: string): string {
        const lines = [
            `DO $$`,
            `BEGIN`,
            `  IF ${condition} THEN`,
            `    ${thenSQL};`,
        ];
        if (elseSQL) {
            lines.push(`  ELSE`);
            lines.push(`    ${elseSQL};`);
        }
        lines.push(`  END IF;`);
        lines.push(`END $$;`);
        return lines.join('\n');
    }

    RaiseSignalSQL(message: string): string {
        return `RAISE NOTICE '${message}'`;
    }

    // ─── DDL Generation (Schema/Table continued) ────────────────────

    AddColumnClause(col: ColumnDDLOptions): string {
        const nullable = col.nullable ? 'NULL' : 'NOT NULL';
        const defaultExpr = col.defaultValue != null ? ` DEFAULT ${col.defaultValue}` : '';
        return `ADD COLUMN "${col.name}" ${col.sqlType} ${nullable}${defaultExpr}`;
    }

    AlterColumnDDL(quotedTable: string, options: AlterColumnOptions): string {
        const col = `"${options.columnName}"`;
        // PostgreSQL refuses to change a column's type when the old type cannot be
        // *implicitly* cast to the new one (e.g. text → boolean, text → integer):
        //   "column ... cannot be cast automatically to type boolean".
        // A `USING <col>::<newtype>` expression makes the conversion explicit. It is
        // valid for every type change (a no-op cast when the types already match), so
        // we always emit it. SQL Server has no such requirement (handled in its own
        // dialect), so this is PG-only.
        return (
            `ALTER TABLE ${quotedTable}\n` +
            `    ALTER COLUMN ${col} TYPE ${options.newType} USING ${col}::${options.newType},\n` +
            `    ALTER COLUMN ${col} ${options.newNullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`
        );
    }

    CommentOnColumn(schema: string, table: string, column: string, comment: string): string {
        const escaped = comment.replace(/'/g, "''");
        return `COMMENT ON COLUMN "${schema}"."${table}"."${column}" IS '${escaped}';`;
    }

    FallbackType(): string {
        return 'TEXT';
    }

    // ─── DDL Generation (Triggers/Indexes) ──────────────────────────

    TriggerDDL(options: TriggerOptions): string {
        const events = options.events.join(' OR ');
        const forEach = options.forEach ?? 'ROW';
        const funcName = options.functionName ?? `fn_${options.triggerName}`;
        const lines: string[] = [];

        // PostgreSQL triggers require a companion function
        lines.push(`CREATE OR REPLACE FUNCTION ${options.schema}."${funcName}"()`);
        lines.push('RETURNS TRIGGER AS $$');
        lines.push('BEGIN');
        lines.push(`    ${options.body}`);
        lines.push('END;');
        lines.push('$$ LANGUAGE plpgsql;');
        lines.push('');

        lines.push(`DROP TRIGGER IF EXISTS "${options.triggerName}" ON ${options.schema}."${options.tableName}";`);
        lines.push(`CREATE TRIGGER "${options.triggerName}"`);
        lines.push(`    ${options.timing} ${events} ON ${options.schema}."${options.tableName}"`);
        lines.push(`    FOR EACH ${forEach}`);
        lines.push(`    EXECUTE FUNCTION ${options.schema}."${funcName}"();`);

        return lines.join('\n');
    }

    IndexDDL(options: IndexOptions): string {
        const unique = options.unique ? 'UNIQUE ' : '';
        const method = options.method ? ` USING ${options.method}` : '';
        const cols = options.columns.map(c => `"${c}"`).join(', ');
        let ddl = `CREATE ${unique}INDEX IF NOT EXISTS "${options.indexName}" ON ${options.schema}."${options.tableName}"${method}(${cols})`;
        if (options.where) {
            ddl += ` WHERE ${options.where}`;
        }
        return ddl;
    }

    // ─── Permissions ─────────────────────────────────────────────────

    GrantPermission(permission: string, _objectType: string, schema: string, object: string, role: string): string {
        return `GRANT ${permission} ON ${schema}."${object}" TO "${role}"`;
    }

    CommentOnObject(objectType: string, schema: string, name: string, comment: string): string {
        const escapedComment = comment.replace(/'/g, "''");
        const normalizedType = objectType.toUpperCase();
        return `COMMENT ON ${normalizedType} ${schema}."${name}" IS '${escapedComment}'`;
    }

    // ─── Schema Introspection ────────────────────────────────────────

    SchemaIntrospectionQueries(): SchemaIntrospectionSQL {
        return {
            listTables: `
                SELECT schemaname AS schema_name, tablename AS table_name
                FROM pg_catalog.pg_tables
                WHERE schemaname = $1
                ORDER BY tablename`,
            listColumns: `
                SELECT c.column_name, c.data_type, c.character_maximum_length AS max_length,
                       c.numeric_precision AS precision, c.numeric_scale AS scale,
                       c.is_nullable, c.column_default AS default_value,
                       CASE WHEN c.column_default LIKE '%nextval%' THEN true ELSE false END AS is_identity
                FROM information_schema.columns c
                WHERE c.table_schema = $1 AND c.table_name = $2
                ORDER BY c.ordinal_position`,
            listConstraints: `
                SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                WHERE tc.table_schema = $1 AND tc.table_name = $2
                ORDER BY tc.constraint_type, kcu.ordinal_position`,
            listForeignKeys: `
                SELECT
                    tc.constraint_name AS fk_name,
                    tc.table_schema AS source_schema,
                    tc.table_name AS source_table,
                    kcu.column_name AS source_column,
                    ccu.table_schema AS target_schema,
                    ccu.table_name AS target_table,
                    ccu.column_name AS target_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
                ORDER BY tc.constraint_name`,
            listIndexes: `
                SELECT
                    i.relname AS index_name,
                    ix.indisunique AS is_unique,
                    am.amname AS type_desc,
                    a.attname AS column_name,
                    false AS is_included_column
                FROM pg_catalog.pg_index ix
                JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
                JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
                JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
                JOIN pg_catalog.pg_am am ON am.oid = i.relam
                JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                WHERE n.nspname = $1 AND t.relname = $2
                ORDER BY i.relname`,
            objectExists: `
                SELECT EXISTS (
                    SELECT 1 FROM pg_catalog.pg_class c
                    JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
                    WHERE n.nspname = $1 AND c.relname = $2
                ) AS exists`,
        };
    }

    // ─── IIF ─────────────────────────────────────────────────────────

    IIF(condition: string, trueVal: string, falseVal: string): string {
        return `CASE WHEN ${condition} THEN ${trueVal} ELSE ${falseVal} END`;
    }

    // ─── Abstract Type Resolution ─────────────────────────────────────

    ResolveAbstractType(options: ResolveTypeOptions): string {
        switch (options.type) {
            case 'string':
                return this.resolveStringType(options.maxLength);
            case 'text':
                return 'TEXT';
            case 'integer':
                return 'INTEGER';
            case 'bigint':
                return 'BIGINT';
            case 'decimal':
                return `NUMERIC(${options.precision ?? 18},${options.scale ?? 2})`;
            case 'boolean':
                return 'BOOLEAN';
            case 'datetime':
                return 'TIMESTAMPTZ';
            case 'date':
                return 'DATE';
            case 'uuid':
                return 'UUID';
            case 'json':
                return 'JSONB';
            case 'float':
                return 'DOUBLE PRECISION';
            case 'time':
                return 'TIME';
            default:
                return this.FallbackType();
        }
    }

    private resolveStringType(maxLength?: number): string {
        if (maxLength != null && maxLength > 0) {
            return `VARCHAR(${maxLength})`;
        }
        return 'VARCHAR(255)';
    }

    // ─── Error Classification ────────────────────────────────────────

    IsConnectionError(e: unknown): boolean {
        if (!(e instanceof Error)) return false;

        // pg driver throws plain Error with Node.js network error codes for
        // connection failures. DatabaseError (from pg-protocol) is for
        // server-side SQL errors, which are NOT connection errors.
        if (e.name === 'DatabaseError') return false;

        const code = (e as { code?: string }).code ?? '';
        return (
            code === 'ECONNREFUSED' ||
            code === 'ECONNRESET' ||
            code === 'ETIMEDOUT' ||
            code === 'ENOTFOUND' ||
            code === 'EPIPE' ||
            e.message.includes('Connection terminated') ||
            e.message.includes('connection is insecure')
        );
    }

    // ─── Private Helpers ─────────────────────────────────────────────

    private extractSchema(qualifiedName: string): string {
        const dotIndex = qualifiedName.indexOf('.');
        if (dotIndex === -1) return 'public';
        return qualifiedName.substring(0, dotIndex).replace(/"/g, '');
    }

    private extractName(qualifiedName: string): string {
        const dotIndex = qualifiedName.indexOf('.');
        if (dotIndex === -1) return qualifiedName.replace(/"/g, '');
        return qualifiedName.substring(dotIndex + 1).replace(/"/g, '');
    }
}
