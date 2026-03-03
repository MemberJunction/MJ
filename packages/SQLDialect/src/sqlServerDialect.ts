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
 * SQL Server-specific data type mapping.
 * Maps SQL Server types to themselves (identity mapping) since
 * SQL Server is the canonical source type in MemberJunction.
 */
class SQLServerDataTypeMap implements DataTypeMap {
    MapType(sourceType: string, sourceLength?: number, sourcePrecision?: number, sourceScale?: number): MappedType {
        const normalized = sourceType.toUpperCase().trim();

        switch (normalized) {
            case 'UNIQUEIDENTIFIER':
                return { typeName: 'UNIQUEIDENTIFIER', supportsLength: false, supportsPrecisionScale: false };
            case 'NVARCHAR':
                return this.buildNVarcharType(sourceLength);
            case 'VARCHAR':
                return this.buildVarcharType(sourceLength);
            case 'NCHAR':
            case 'CHAR':
                return { typeName: normalized, supportsLength: true, supportsPrecisionScale: false, defaultLength: sourceLength ?? 1 };
            case 'INT':
            case 'INTEGER':
                return { typeName: 'INT', supportsLength: false, supportsPrecisionScale: false };
            case 'BIGINT':
                return { typeName: 'BIGINT', supportsLength: false, supportsPrecisionScale: false };
            case 'SMALLINT':
                return { typeName: 'SMALLINT', supportsLength: false, supportsPrecisionScale: false };
            case 'TINYINT':
                return { typeName: 'TINYINT', supportsLength: false, supportsPrecisionScale: false };
            case 'BIT':
                return { typeName: 'BIT', supportsLength: false, supportsPrecisionScale: false };
            case 'DECIMAL':
            case 'NUMERIC':
                return { typeName: normalized, supportsLength: false, supportsPrecisionScale: true };
            case 'FLOAT':
                return { typeName: 'FLOAT', supportsLength: false, supportsPrecisionScale: false };
            case 'REAL':
                return { typeName: 'REAL', supportsLength: false, supportsPrecisionScale: false };
            case 'MONEY':
                return { typeName: 'MONEY', supportsLength: false, supportsPrecisionScale: false };
            case 'SMALLMONEY':
                return { typeName: 'SMALLMONEY', supportsLength: false, supportsPrecisionScale: false };
            case 'DATE':
                return { typeName: 'DATE', supportsLength: false, supportsPrecisionScale: false };
            case 'DATETIME':
                return { typeName: 'DATETIME', supportsLength: false, supportsPrecisionScale: false };
            case 'DATETIME2':
                return { typeName: 'DATETIME2', supportsLength: false, supportsPrecisionScale: false };
            case 'DATETIMEOFFSET':
                return { typeName: 'DATETIMEOFFSET', supportsLength: false, supportsPrecisionScale: false };
            case 'SMALLDATETIME':
                return { typeName: 'SMALLDATETIME', supportsLength: false, supportsPrecisionScale: false };
            case 'TIME':
                return { typeName: 'TIME', supportsLength: false, supportsPrecisionScale: false };
            case 'TEXT':
            case 'NTEXT':
                return { typeName: normalized, supportsLength: false, supportsPrecisionScale: false };
            case 'IMAGE':
                return { typeName: 'IMAGE', supportsLength: false, supportsPrecisionScale: false };
            case 'VARBINARY':
                return { typeName: 'VARBINARY', supportsLength: true, supportsPrecisionScale: false, defaultLength: sourceLength };
            case 'BINARY':
                return { typeName: 'BINARY', supportsLength: true, supportsPrecisionScale: false, defaultLength: sourceLength ?? 1 };
            case 'XML':
                return { typeName: 'XML', supportsLength: false, supportsPrecisionScale: false };
            default:
                return { typeName: normalized, supportsLength: false, supportsPrecisionScale: false };
        }
    }

    MapTypeToString(sourceType: string, sourceLength?: number, sourcePrecision?: number, sourceScale?: number): string {
        const mapped = this.MapType(sourceType, sourceLength, sourcePrecision, sourceScale);
        return formatTypeString(mapped, sourceLength, sourcePrecision, sourceScale);
    }

    private buildNVarcharType(length?: number): MappedType {
        if (length === -1 || length === undefined) {
            return { typeName: 'NVARCHAR(MAX)', supportsLength: false, supportsPrecisionScale: false };
        }
        return { typeName: 'NVARCHAR', supportsLength: true, supportsPrecisionScale: false, defaultLength: length };
    }

    private buildVarcharType(length?: number): MappedType {
        if (length === -1 || length === undefined) {
            return { typeName: 'VARCHAR(MAX)', supportsLength: false, supportsPrecisionScale: false };
        }
        return { typeName: 'VARCHAR', supportsLength: true, supportsPrecisionScale: false, defaultLength: length };
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
            return len === -1 ? `${mapped.typeName}(MAX)` : `${mapped.typeName}(${len})`;
        }
    }
    return mapped.typeName;
}

/**
 * SQL Server dialect implementation.
 * Uses [bracket] quoting, TOP for pagination, BIT for booleans, T-SQL functions.
 */
export class SQLServerDialect extends SQLDialect {
    get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    // ─── Identifier Quoting ──────────────────────────────────────────

    QuoteIdentifier(name: string): string {
        return `[${name}]`;
    }

    QuoteSchema(schema: string, object: string): string {
        return `[${schema}].[${object}]`;
    }

    // ─── Pagination ──────────────────────────────────────────────────

    LimitClause(limit: number, offset?: number): LimitClauseResult {
        if (offset != null) {
            return { prefix: '', suffix: `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY` };
        }
        return { prefix: `TOP ${limit}`, suffix: '' };
    }

    // ─── Literals & Expressions ──────────────────────────────────────

    BooleanLiteral(value: boolean): string {
        return value ? '1' : '0';
    }

    CurrentTimestampUTC(): string {
        return 'GETUTCDATE()';
    }

    NewUUID(): string {
        return 'NEWID()';
    }

    CastToText(expr: string): string {
        return `CAST(${expr} AS NVARCHAR(MAX))`;
    }

    CastToUUID(expr: string): string {
        return `CAST(${expr} AS UNIQUEIDENTIFIER)`;
    }

    // ─── INSERT/UPDATE Return Patterns ───────────────────────────────

    ReturnInsertedClause(columns?: string[]): string {
        if (columns && columns.length > 0) {
            const cols = columns.map(c => `INSERTED.[${c}]`).join(', ');
            return `OUTPUT ${cols}`;
        }
        return 'OUTPUT INSERTED.*';
    }

    AutoIncrementPKExpression(): string {
        return 'IDENTITY(1,1)';
    }

    UUIDPKDefault(): string {
        return 'NEWSEQUENTIALID()';
    }

    ScopeIdentityExpression(): string {
        return 'SCOPE_IDENTITY()';
    }

    RowCountExpression(): string {
        return '@@ROWCOUNT';
    }

    // ─── Batch & DDL Control ─────────────────────────────────────────

    BatchSeparator(): string {
        return 'GO';
    }

    ExistenceCheckSQL(objectType: string, schema: string, name: string): string {
        const normalizedType = objectType.toUpperCase();
        switch (normalizedType) {
            case 'TABLE':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'U') IS NOT NULL`;
            case 'VIEW':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'V') IS NOT NULL`;
            case 'PROCEDURE':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'P') IS NOT NULL`;
            case 'FUNCTION':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'FN') IS NOT NULL`;
            case 'TRIGGER':
                return `IF OBJECT_ID('[${schema}].[${name}]', 'TR') IS NOT NULL`;
            default:
                return `IF OBJECT_ID('[${schema}].[${name}]') IS NOT NULL`;
        }
    }

    CreateOrReplaceSupported(_objectType: string): boolean {
        return false; // SQL Server does not support CREATE OR REPLACE
    }

    // ─── Full-Text Search ────────────────────────────────────────────

    FullTextSearchPredicate(column: string, searchTerm: string): string {
        return `CONTAINS(${this.QuoteIdentifier(column)}, ${searchTerm})`;
    }

    FullTextIndexDDL(table: string, columns: string[], catalog?: string): string {
        const catName = catalog ?? 'MJ_FTS';
        const cols = columns.map(c => this.QuoteIdentifier(c)).join(', ');
        const lines: string[] = [];
        lines.push(`IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = '${catName}')`);
        lines.push(`    CREATE FULLTEXT CATALOG [${catName}];`);
        lines.push('');
        lines.push(`CREATE FULLTEXT INDEX ON ${table}(${cols})`);
        lines.push(`    KEY INDEX PK_${table.replace(/[\[\].]/g, '')} ON [${catName}];`);
        return lines.join('\n');
    }

    // ─── CTE / Recursion ─────────────────────────────────────────────

    RecursiveCTESyntax(): string {
        return 'WITH';
    }

    // ─── Data Types ──────────────────────────────────────────────────

    get TypeMap(): DataTypeMap {
        return new SQLServerDataTypeMap();
    }

    // ─── Parameters ──────────────────────────────────────────────────

    ParameterPlaceholder(index: number): string {
        return `@p${index}`;
    }

    ConcatOperator(): string {
        return '+';
    }

    // ─── String Functions ────────────────────────────────────────────

    StringSplitFunction(value: string, delimiter: string): string {
        return `STRING_SPLIT(${value}, ${delimiter})`;
    }

    JsonExtract(column: string, path: string): string {
        return `JSON_VALUE(${column}, '${path}')`;
    }

    // ─── Procedure / Function Calls ──────────────────────────────────

    ProcedureCallSyntax(schema: string, name: string, params: string[]): string {
        const paramList = params.join(', ');
        return `EXEC [${schema}].[${name}] ${paramList}`;
    }

    // ─── DDL Generation ──────────────────────────────────────────────

    TriggerDDL(options: TriggerOptions): string {
        const events = options.events.join(', ');
        const lines: string[] = [];
        lines.push(`CREATE TRIGGER [${options.schema}].[${options.triggerName}]`);
        lines.push(`ON [${options.schema}].[${options.tableName}]`);
        lines.push(`${options.timing} ${events}`);
        lines.push('AS');
        lines.push('BEGIN');
        lines.push('    SET NOCOUNT ON;');
        lines.push(`    ${options.body}`);
        lines.push('END');
        return lines.join('\n');
    }

    IndexDDL(options: IndexOptions): string {
        const unique = options.unique ? 'UNIQUE ' : '';
        const cols = options.columns.map(c => `[${c}]`).join(', ');
        let ddl = `CREATE ${unique}INDEX [${options.indexName}] ON [${options.schema}].[${options.tableName}](${cols})`;
        if (options.includeColumns && options.includeColumns.length > 0) {
            const inc = options.includeColumns.map(c => `[${c}]`).join(', ');
            ddl += ` INCLUDE (${inc})`;
        }
        return ddl;
    }

    // ─── Permissions ─────────────────────────────────────────────────

    GrantPermission(permission: string, _objectType: string, schema: string, object: string, role: string): string {
        return `GRANT ${permission} ON [${schema}].[${object}] TO [${role}]`;
    }

    CommentOnObject(objectType: string, schema: string, name: string, comment: string): string {
        const escapedComment = comment.replace(/'/g, "''");
        const level1Type = this.objectTypeToLevel1Type(objectType);
        return [
            `EXEC sp_addextendedproperty`,
            `    @name = N'MS_Description',`,
            `    @value = N'${escapedComment}',`,
            `    @level0type = N'SCHEMA', @level0name = N'${schema}',`,
            `    @level1type = N'${level1Type}', @level1name = N'${name}'`,
        ].join('\n');
    }

    // ─── Schema Introspection ────────────────────────────────────────

    SchemaIntrospectionQueries(): SchemaIntrospectionSQL {
        return {
            listTables: `
                SELECT s.name AS schema_name, t.name AS table_name
                FROM sys.tables t
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = @schema
                ORDER BY t.name`,
            listColumns: `
                SELECT c.name AS column_name, ty.name AS data_type,
                       c.max_length, c.precision, c.scale, c.is_nullable,
                       c.is_identity, dc.definition AS default_value
                FROM sys.columns c
                INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
                LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
                WHERE c.object_id = OBJECT_ID(@table)
                ORDER BY c.column_id`,
            listConstraints: `
                SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, kcu.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                WHERE tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @table
                ORDER BY tc.CONSTRAINT_TYPE, kcu.ORDINAL_POSITION`,
            listForeignKeys: `
                SELECT fk.name AS fk_name,
                       OBJECT_SCHEMA_NAME(fk.parent_object_id) AS source_schema,
                       OBJECT_NAME(fk.parent_object_id) AS source_table,
                       COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS source_column,
                       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS target_schema,
                       OBJECT_NAME(fk.referenced_object_id) AS target_table,
                       COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS target_column
                FROM sys.foreign_keys fk
                INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) = @schema
                ORDER BY fk.name`,
            listIndexes: `
                SELECT i.name AS index_name, i.is_unique, i.type_desc,
                       COL_NAME(ic.object_id, ic.column_id) AS column_name,
                       ic.is_included_column
                FROM sys.indexes i
                INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                WHERE i.object_id = OBJECT_ID(@table) AND i.name IS NOT NULL
                ORDER BY i.name, ic.key_ordinal`,
            objectExists: `SELECT OBJECT_ID(@objectName) AS object_id`,
        };
    }

    // ─── IIF ─────────────────────────────────────────────────────────

    IIF(condition: string, trueVal: string, falseVal: string): string {
        return `IIF(${condition}, ${trueVal}, ${falseVal})`;
    }

    // ─── Private Helpers ─────────────────────────────────────────────

    private objectTypeToLevel1Type(objectType: string): string {
        switch (objectType.toUpperCase()) {
            case 'TABLE': return 'TABLE';
            case 'VIEW': return 'VIEW';
            case 'PROCEDURE': return 'PROCEDURE';
            case 'FUNCTION': return 'FUNCTION';
            default: return objectType.toUpperCase();
        }
    }
}
