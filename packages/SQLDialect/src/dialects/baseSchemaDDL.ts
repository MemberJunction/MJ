import type { DataTypeMap } from '../dataTypeMap.js';
import type { DialectWriter } from '../facets/dialectWriter.js';
import type {
    DialectSchemaDDL,
    SchemaIntrospectionSQL,
    ColumnDDLOptions,
    AlterColumnOptions,
    TriggerOptions,
    IndexOptions,
    ResolveTypeOptions,
} from '../facets/dialectSchemaDDL.js';

/**
 * Base for a platform's {@link DialectSchemaDDL}: the members with a sensible default live here,
 * the platform supplies the rest. Built over the platform's {@link DialectWriter}, which it uses
 * for quoting and literals.
 */
export abstract class BaseSchemaDDL implements DialectSchemaDDL {
    constructor(protected readonly Writer: DialectWriter) {}

    abstract CanonicalSchemaName(name: string): string;
    abstract BooleanParameterType(): string;
    abstract ParameterRef(name: string): string;
    abstract ParameterDefault(value: string): string;
    abstract NewUUID(): string;
    abstract CastToUUID(expr: string): string;
    abstract StringSplitFunction(value: string, delimiter: string): string;
    abstract FullTextSearchPredicate(column: string, searchTerm: string): string;
    abstract AffectedRowCountSQL(dmlStatement: string, alias: string): string;
    abstract get TypeMap(): DataTypeMap;
    abstract ReturnInsertedClause(columns?: string[]): string;
    abstract AutoIncrementPKExpression(): string;
    abstract UUIDPKDefault(): string;
    abstract ScopeIdentityExpression(): string;
    abstract RowCountExpression(): string;
    abstract BatchSeparator(): string;
    abstract ExistenceCheckSQL(objectType: string, schema: string, name: string): string;
    abstract CreateOrReplaceSupported(objectType: string): boolean;
    abstract FullTextIndexDDL(table: string, columns: string[], catalog?: string): string;
    abstract EscapeFlywayStringInterpolation(sql: string): string;
    abstract ProcedureCallSyntax(schema: string, name: string, params: string[]): string;
    abstract CreateSchemaDDL(schemaName: string): string;
    abstract AddColumnClause(col: ColumnDDLOptions): string;
    abstract AlterColumnDDL(quotedTable: string, options: AlterColumnOptions): string;
    abstract CommentOnColumn(schema: string, table: string, column: string, comment: string): string;
    abstract FallbackType(): string;
    abstract ResolveAbstractType(options: ResolveTypeOptions): string;
    abstract CreateTableIfNotExistsDDL(schema: string, tableName: string, columnsDDL: string): string;
    abstract ConditionalBlock(condition: string, thenSQL: string, elseSQL?: string): string;
    abstract RaiseSignalSQL(message: string): string;
    abstract TriggerDDL(options: TriggerOptions): string;
    abstract IndexDDL(options: IndexOptions): string;
    abstract GrantPermission(permission: string, objectType: string, schema: string, object: string, role: string): string;
    abstract CommentOnObject(objectType: string, schema: string, name: string, comment: string): string;
    abstract SchemaIntrospectionQueries(): SchemaIntrospectionSQL;
    abstract ForeignKeyGraphSQL(schema: string): string;
    abstract AtomicBatchScript(statements: string[]): string;
    abstract CreateSavepointSQL(name: string): string;
    abstract ReleaseSavepointSQL(name: string): string | null;
    abstract RollbackToSavepointSQL(name: string): string;

    /** No practical declare-time cap on an index key string; a platform overrides it where one exists. */
    get MaxKeyStringLength(): number {
        return Number.MAX_SAFE_INTEGER;
    }

    /** No in-row size limit by default. */
    get MaxInRowSizeBytes(): number | null {
        return null;
    }

    /** No column-count cap by default. */
    get MaxColumnCount(): number | null {
        return null;
    }

    /** A conservative off-row-pointer floor of 24 bytes. */
    EstimateInRowBytes(_rawSqlType: string): number {
        return 24;
    }

    /** The empty-GUID literal as a plain quoted string. */
    EmptyUUIDLiteral(): string {
        return `'00000000-0000-0000-0000-000000000000'`;
    }

    /** `CAST(expr AS <bounded string type>)`, defaulting to MJ's 450-character indexable width. */
    CastToBoundedString(expr: string, maxLength: number = 450): string {
        const sqlType = this.ResolveAbstractType({ type: 'string', maxLength });
        return `CAST(${expr} AS ${sqlType})`;
    }

    /** No cap by default. */
    CapIndexableType(rawSqlType: string): string {
        return rawSqlType;
    }

    /**
     * Splits on a `;` followed by optional inline whitespace and a newline, trims each fragment,
     * drops empties, and ends each statement with `;`.
     */
    SplitStatements(batch: string): string[] {
        return batch
            .split(/;\s*\n/g)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .map((s) => (s.endsWith(';') ? s : s + ';'));
    }

    /** `CREATE TABLE IF NOT EXISTS <fullTable> (...);` as a single statement. */
    CreateTableIfAbsent(fullTable: string, columnsBody: string): string {
        return `CREATE TABLE IF NOT EXISTS ${fullTable} (\n${columnsBody}\n);`;
    }

    /** {@link CommentOnObject} terminated with `;`, for platforms whose comment statement is idempotent. */
    CommentOnObjectIfAbsent(objectType: string, schema: string, name: string, comment: string): string {
        return this.CommentOnObject(objectType, schema, name, comment) + ';';
    }

    /** {@link CommentOnColumn} unchanged, for platforms whose comment statement is idempotent. */
    CommentOnColumnIfAbsent(schema: string, table: string, column: string, comment: string): string {
        return this.CommentOnColumn(schema, table, column, comment);
    }
}
