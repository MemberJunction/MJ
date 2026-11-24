import { EscapeSQLString } from '@memberjunction/global';
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

    /** No comment-length cap by default (override where the platform enforces one, e.g. SQL Server `sql_variant`). */
    get MaxCommentLength(): number | null {
        return null;
    }

    /** Whether this dialect supports PostgreSQL-style `$$…$$` / `$tag$…$tag$` dollar-quoted blocks. */
    protected get SupportsDollarQuotedStrings(): boolean {
        return false;
    }

    /** Whether this dialect supports PostgreSQL-style `E'...'` backslash-escaped string literals. */
    protected get SupportsEscapeStringLiterals(): boolean {
        return false;
    }

    /**
     * Strip NUL bytes, cap to {@link MaxCommentLength} UTF-16 code units (surrogate-pair safe)
     * when the dialect declares a limit, and escape single quotes for SQL string literals.
     */
    protected EscapeComment(comment: string): string {
        const withoutNulls = comment.replace(/\0/g, '');
        const capped = this.MaxCommentLength != null
            ? this.truncateComment(withoutNulls, this.MaxCommentLength)
            : withoutNulls;
        return EscapeSQLString(capped);
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
     * Splits a SQL script on standalone batch separator lines (e.g. `GO` on SQL Server) while
     * skipping strings, comments, and dollar-quoted blocks. Returns the non-empty script as a
     * single batch when the dialect defines no batch separator.
     */
    SplitBatches(sql: string): string[] {
        const separator = this.BatchSeparator().trim();
        if (separator.length === 0) {
            const trimmed = sql.trim();
            return trimmed.length > 0 ? [trimmed] : [];
        }
        return this.splitOnSeparatorLines(sql, separator);
    }

    /**
     * Splits an oversized SQL batch into individual statements on top-level `;` + end-of-line
     * boundaries, skipping single-quoted strings (`'...'` with `''` escapes, plus `E'...'` when
     * enabled), line/block comments, and dollar-quoted blocks (when enabled). Trims each fragment,
     * drops empties, and ensures every returned statement ends with `;`.
     */
    SplitStatements(batch: string): string[] {
        const statements: string[] = [];
        let current = '';
        let i = 0;
        while (i < batch.length) {
            const tokenEnd = this.scanProtectedTokenEnd(batch, i);
            if (tokenEnd !== null) {
                current += batch.slice(i, tokenEnd);
                i = tokenEnd;
                continue;
            }
            if (batch[i] === ';') {
                const boundaryEnd = this.findSemicolonNewlineEnd(batch, i);
                if (boundaryEnd !== null) {
                    const trimmed = current.trim();
                    if (trimmed.length > 0) statements.push(`${trimmed};`);
                    current = '';
                    i = boundaryEnd;
                    continue;
                }
            }
            current += batch[i];
            i++;
        }
        const tail = current.trim();
        if (tail.length > 0) statements.push(tail);
        return statements.map((s) => (s.endsWith(';') ? s : s + ';'));
    }

    private splitOnSeparatorLines(sql: string, separator: string): string[] {
        const batches: string[] = [];
        let current = '';
        let i = 0;
        let atLineStart = true;
        while (i < sql.length) {
            if (atLineStart) {
                const sepEnd = this.matchBatchSeparatorLine(sql, i, separator);
                if (sepEnd !== null) {
                    const trimmed = current.trim();
                    if (trimmed.length > 0) batches.push(trimmed);
                    current = '';
                    i = sepEnd;
                    atLineStart = true;
                    continue;
                }
            }
            const tokenEnd = this.scanProtectedTokenEnd(sql, i);
            if (tokenEnd !== null) {
                const chunk = sql.slice(i, tokenEnd);
                current += chunk;
                atLineStart = chunk.endsWith('\n');
                i = tokenEnd;
                continue;
            }
            const ch = sql[i];
            current += ch;
            atLineStart = ch === '\n';
            i++;
        }
        const tail = current.trim();
        if (tail.length > 0) batches.push(tail);
        return batches;
    }

    private scanProtectedTokenEnd(sql: string, i: number): number | null {
        const ch = sql[i];
        if (ch === '-' && sql[i + 1] === '-') {
            return this.scanLineCommentEnd(sql, i);
        }
        if (ch === '/' && sql[i + 1] === '*') {
            return this.scanBlockCommentEnd(sql, i);
        }
        if (ch === "'") {
            return this.scanSingleQuotedStringEnd(sql, i);
        }
        if (this.SupportsDollarQuotedStrings && ch === '$') {
            return this.scanDollarQuotedEnd(sql, i);
        }
        return null;
    }

    private scanLineCommentEnd(sql: string, start: number): number {
        let i = start + 2;
        while (i < sql.length && sql[i] !== '\n') i++;
        return i < sql.length ? i + 1 : i;
    }

    private scanBlockCommentEnd(sql: string, start: number): number {
        let i = start + 2;
        let depth = 1;
        while (i < sql.length && depth > 0) {
            if (sql[i] === '/' && sql[i + 1] === '*') {
                depth++;
                i += 2;
            } else if (sql[i] === '*' && sql[i + 1] === '/') {
                depth--;
                i += 2;
            } else {
                i++;
            }
        }
        return i;
    }

    private scanSingleQuotedStringEnd(sql: string, quoteIndex: number): number {
        const isEscape = this.SupportsEscapeStringLiterals && this.isEscapeStringPrefix(sql, quoteIndex);
        let i = quoteIndex + 1;
        while (i < sql.length) {
            if (isEscape && sql[i] === '\\' && i + 1 < sql.length) {
                i += 2;
                continue;
            }
            if (sql[i] === "'") {
                if (sql[i + 1] === "'") {
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        return sql.length;
    }

    private scanDollarQuotedEnd(sql: string, start: number): number | null {
        let j = start + 1;
        if (j < sql.length && sql[j] !== '$') {
            if (!this.isTagStartChar(sql[j])) return null;
            j++;
            while (j < sql.length && this.isTagContinueChar(sql[j])) j++;
        }
        if (j >= sql.length || sql[j] !== '$') return null;
        const tag = sql.slice(start, j + 1);
        const closeIdx = sql.indexOf(tag, j + 1);
        return closeIdx === -1 ? sql.length : closeIdx + tag.length;
    }

    private findSemicolonNewlineEnd(sql: string, semiIndex: number): number | null {
        let j = semiIndex + 1;
        while (j < sql.length && (sql[j] === ' ' || sql[j] === '\t' || sql[j] === '\r')) j++;
        return j < sql.length && sql[j] === '\n' ? j + 1 : null;
    }

    private matchBatchSeparatorLine(sql: string, lineStart: number, separator: string): number | null {
        let j = lineStart;
        while (j < sql.length && (sql[j] === ' ' || sql[j] === '\t')) j++;
        if (sql.slice(j, j + separator.length).toUpperCase() !== separator.toUpperCase()) {
            return null;
        }
        j += separator.length;
        while (j < sql.length && (sql[j] === ' ' || sql[j] === '\t' || sql[j] === '\r')) j++;
        if (j === sql.length) return j;
        return sql[j] === '\n' ? j + 1 : null;
    }

    private isEscapeStringPrefix(sql: string, quoteIndex: number): boolean {
        if (quoteIndex === 0) return false;
        const prev = sql[quoteIndex - 1];
        if (prev !== 'E' && prev !== 'e') return false;
        if (quoteIndex === 1) return true;
        const before = sql[quoteIndex - 2];
        return !this.isTagContinueChar(before) && before !== '$';
    }

    private isTagStartChar(ch: string): boolean {
        return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
    }

    private isTagContinueChar(ch: string): boolean {
        return this.isTagStartChar(ch) || (ch >= '0' && ch <= '9');
    }

    private truncateComment(value: string, maxChars: number): string {
        if (value.length <= maxChars) {
            return value;
        }
        const ellipsis = '...';
        let cut = maxChars - ellipsis.length;
        const lastCode = value.charCodeAt(cut - 1);
        if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
            cut--;
        }
        return value.slice(0, cut) + ellipsis;
    }

    /** `CREATE TABLE IF NOT EXISTS <fullTable> (...);` as a single statement. */
    CreateTableIfAbsent(fullTable: string, columnsBody: string): string {
        return `CREATE TABLE IF NOT EXISTS ${fullTable} (\n${columnsBody}\n);`;
    }

    /** `CREATE [UNIQUE] INDEX IF NOT EXISTS ...;` as a single statement. */
    CreateIndexIfAbsent(options: IndexOptions): string {
        const ddl = this.IndexDDL(options);
        return ddl.endsWith(';') ? ddl : `${ddl};`;
    }

    /** `DROP INDEX IF EXISTS <schema>.<indexName>;` as a single statement. */
    DropIndexIfExists(schema: string, _tableName: string, indexName: string): string {
        return `DROP INDEX IF EXISTS ${this.Writer.QuoteSchema(schema, indexName)};`;
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
