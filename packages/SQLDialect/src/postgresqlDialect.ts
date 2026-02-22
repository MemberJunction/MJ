import { DataTypeMap, MappedType } from './dataTypeMap.js';
import {
    SQLDialect,
    DatabasePlatform,
    LimitClauseResult,
    SchemaIntrospectionSQL,
    TriggerOptions,
    IndexOptions,
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

    // ─── Identifier Quoting ──────────────────────────────────────────

    QuoteIdentifier(name: string): string {
        return `"${name}"`;
    }

    QuoteSchema(schema: string, object: string): string {
        return `${schema}."${object}"`;
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

    CurrentTimestampUTC(): string {
        return "NOW() AT TIME ZONE 'UTC'";
    }

    NewUUID(): string {
        return 'gen_random_uuid()';
    }

    CastToText(expr: string): string {
        return `CAST(${expr} AS TEXT)`;
    }

    CastToUUID(expr: string): string {
        return `CAST(${expr} AS UUID)`;
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

    // ─── DDL Generation ──────────────────────────────────────────────

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
