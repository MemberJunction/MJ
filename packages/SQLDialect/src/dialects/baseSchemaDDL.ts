import { EscapeSQLString } from '@memberjunction/global';
import type { DataTypeMap } from '../dataTypeMap.js';
import type { DialectLexicalRules, StringLiteralForm } from '../facets/dialectLexicalRules.js';
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
import { ANSI_LEXICAL } from './ansi.js';

/**
 * Base for a platform's {@link DialectSchemaDDL}: the members with a sensible default live here,
 * the platform supplies the rest. Built over the platform's {@link DialectWriter} (quoting and
 * literals) and {@link DialectLexicalRules} (comment, string, identifier, and dollar-quote scanning).
 */
export abstract class BaseSchemaDDL implements DialectSchemaDDL {
    constructor(
        protected readonly Writer: DialectWriter,
        protected readonly Lexical: DialectLexicalRules = ANSI_LEXICAL,
    ) {}

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
     * skipping strings, quoted identifiers, comments, and dollar-quoted blocks per {@link Lexical}.
     * Returns the non-empty script as a single batch when the dialect defines no batch separator.
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
     * boundaries, skipping string literals, quoted identifiers, line/block comments, and
     * dollar-quoted blocks per {@link Lexical}. Trims each fragment, drops empties, and ensures
     * every returned statement ends with `;`.
     */
    SplitStatements(batch: string): string[] {
        const statements: string[] = [];
        let stmtStart = 0;
        let i = 0;
        while (i < batch.length) {
            const tokenEnd = this.scanProtectedTokenEnd(batch, i);
            if (tokenEnd !== null) {
                i = tokenEnd;
                continue;
            }
            if (batch[i] === ';') {
                const boundaryEnd = this.findSemicolonNewlineEnd(batch, i);
                if (boundaryEnd !== null) {
                    const trimmed = batch.slice(stmtStart, i).trim();
                    if (trimmed.length > 0) statements.push(`${trimmed};`);
                    stmtStart = boundaryEnd;
                    i = boundaryEnd;
                    continue;
                }
            }
            i++;
        }
        const tail = batch.slice(stmtStart).trim();
        if (tail.length > 0) {
            statements.push(tail.endsWith(';') ? tail : `${tail};`);
        }
        return statements;
    }

    private splitOnSeparatorLines(sql: string, separator: string): string[] {
        const batches: string[] = [];
        let batchStart = 0;
        let i = 0;
        let atLineStart = true;
        while (i < sql.length) {
            if (atLineStart) {
                const sepEnd = this.matchBatchSeparatorLine(sql, i, separator);
                if (sepEnd !== null) {
                    const trimmed = sql.slice(batchStart, i).trim();
                    if (trimmed.length > 0) batches.push(trimmed);
                    batchStart = sepEnd;
                    i = sepEnd;
                    atLineStart = true;
                    continue;
                }
            }
            const tokenEnd = this.scanProtectedTokenEnd(sql, i);
            if (tokenEnd !== null) {
                atLineStart = sql[tokenEnd - 1] === '\n';
                i = tokenEnd;
                continue;
            }
            atLineStart = sql[i] === '\n';
            i++;
        }
        const tail = sql.slice(batchStart).trim();
        if (tail.length > 0) batches.push(tail);
        return batches;
    }

    private scanProtectedTokenEnd(sql: string, i: number): number | null {
        const lineCommentEnd = this.scanLineCommentEnd(sql, i);
        if (lineCommentEnd !== null) return lineCommentEnd;
        if (sql[i] === '/' && sql[i + 1] === '*') {
            return this.scanBlockCommentEnd(sql, i);
        }
        const quotedIdEnd = this.scanQuotedIdentifierEnd(sql, i);
        if (quotedIdEnd !== null) return quotedIdEnd;
        const stringEnd = this.scanStringLiteralEnd(sql, i);
        if (stringEnd !== null) return stringEnd;
        if (this.Lexical.DollarQuotedStrings !== 'none' && sql[i] === '$') {
            return this.scanDollarQuotedEnd(sql, i);
        }
        return null;
    }

    private scanLineCommentEnd(sql: string, start: number): number | null {
        for (const form of this.Lexical.LineComments) {
            if (!sql.startsWith(form.Opener, start)) continue;
            if (form.RequiresWhitespaceAfter) {
                const nextCode = sql.charCodeAt(start + form.Opener.length);
                if (!Number.isNaN(nextCode) && nextCode > 0x20 && nextCode !== 0x7f) continue;
            }
            let i = start + form.Opener.length;
            while (i < sql.length && sql[i] !== '\n') i++;
            return i < sql.length ? i + 1 : i;
        }
        return null;
    }

    private scanBlockCommentEnd(sql: string, start: number): number {
        const nested = this.Lexical.BlockComments.Nested;
        let i = start + 2;
        let depth = 1;
        while (i < sql.length && depth > 0) {
            if (nested && sql[i] === '/' && sql[i + 1] === '*') {
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

    private scanQuotedIdentifierEnd(sql: string, start: number): number | null {
        const ch = sql[start];
        for (const form of this.Lexical.IdentifierQuotes) {
            if (ch === form.Open) {
                return this.scanDelimitedSpan(sql, start, form.Close, form.DoubledCloseEscape, false);
            }
        }
        return null;
    }

    private scanStringLiteralEnd(sql: string, quoteIndex: number): number | null {
        const form = this.matchStringLiteralForm(sql, quoteIndex, sql[quoteIndex]);
        if (!form) return null;
        return this.scanDelimitedSpan(sql, quoteIndex, form.Quote, form.DoubledQuoteEscape, form.BackslashEscape);
    }

    private matchStringLiteralForm(sql: string, quoteIndex: number, quoteChar: string): StringLiteralForm | null {
        let bestForm: StringLiteralForm | null = null;
        let bestPrefixLen = -1;
        for (const form of this.Lexical.StringLiterals) {
            if (form.Quote !== quoteChar) continue;
            for (const prefix of form.Prefixes) {
                if (prefix.length > bestPrefixLen && this.hasPrefixBefore(sql, quoteIndex, prefix)) {
                    bestPrefixLen = prefix.length;
                    bestForm = form;
                }
            }
        }
        return bestForm;
    }

    private hasPrefixBefore(sql: string, quoteIndex: number, prefix: string): boolean {
        if (prefix.length === 0) return true;
        const start = quoteIndex - prefix.length;
        if (start < 0) return false;
        if (sql.slice(start, quoteIndex).toUpperCase() !== prefix.toUpperCase()) return false;
        return start === 0 || !this.isIdentifierContinueChar(sql[start - 1]);
    }

    private scanDelimitedSpan(
        sql: string,
        openIndex: number,
        closeChar: string,
        doubledCloseEscape: boolean,
        backslashEscape: boolean,
    ): number {
        let i = openIndex + 1;
        while (i < sql.length) {
            if (backslashEscape && sql[i] === '\\' && i + 1 < sql.length) {
                i += 2;
                continue;
            }
            if (sql[i] === closeChar) {
                if (doubledCloseEscape && sql[i + 1] === closeChar) {
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
        // In PostgreSQL, `$` after an identifier character (`a$b$c`, `foo$$`) is part of that identifier, not a dollar-quote opener.
        if (start > 0 && this.isIdentifierContinueChar(sql[start - 1])) return null;
        let j = start + 1;
        if (this.Lexical.DollarQuotedStrings === 'tagged' && j < sql.length && sql[j] !== '$') {
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

    private isTagStartChar(ch: string): boolean {
        const code = ch.charCodeAt(0);
        return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || code >= 0x80;
    }

    private isTagContinueChar(ch: string): boolean {
        return this.isTagStartChar(ch) || (ch >= '0' && ch <= '9');
    }

    private isIdentifierContinueChar(ch: string): boolean {
        return this.isTagContinueChar(ch) || ch === '$';
    }

    private truncateComment(value: string, maxChars: number): string {
        if (value.length <= maxChars) {
            return value;
        }
        const ellipsis = '...';
        if (maxChars <= ellipsis.length) {
            return value.slice(0, Math.max(0, maxChars));
        }
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
