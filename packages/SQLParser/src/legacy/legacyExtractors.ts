import type { ParserDialect } from '@memberjunction/sql-dialect';
import type { Diagnostic } from '../common/analysis.js';
import { SqlDocument } from '../sql/sqlDocument.js';
import type { OutputItem } from '../sql/analyses/analysisTypes.js';
import type { CTEDeclaration, IdentifierNode, ObjectName } from '../sql/sqlNodes.js';
import { SplitLeadingCTEs } from '../sqlShape.js';
import type {
    SQLCTEExtraction, SQLColumnReference, SQLParseResult, SQLSelectColumn, SQLTableReference,
} from '../sql-parser.js';
import { LegacyDefaultSchema, ResolveParserDialect } from './dialectResolution.js';
import type { LegacyDialectInput } from './dialectResolution.js';
import { ReadWithoutErrors, TemplateSqlViews } from './templateSqlViews.js';
import type { SqlView } from './templateSqlViews.js';
import { ExtractCTEsByParenScan, SkipLeadingCommentsAndWhitespace } from './cteParenScan.js';
import { NonQueryTables, PivotInLists } from './nonQueryReads.js';
import type { NamedTable } from './nonQueryReads.js';

/** Select-list columns with whether the SQL could be read completely. */
export interface CheckedSelectColumns {
    /** The columns; empty when the SQL could not be read completely. */
    readonly Columns: SQLSelectColumn[];
    /** Whether every reading of the SQL parsed with no error (a statement that is not a query does not count). */
    readonly Complete: boolean;
    /** What the parser found wrong, from every reading of the SQL. */
    readonly Diagnostics: readonly Diagnostic[];
}

/** Column references with whether the SQL could be read completely. */
export interface CheckedColumnReferences {
    /** The references; empty when the SQL could not be read completely. */
    readonly Columns: SQLColumnReference[];
    /** Whether every reading of the SQL parsed with no error (a statement that is not a query does not count). */
    readonly Complete: boolean;
    /** What the parser found wrong, from every reading of the SQL. */
    readonly Diagnostics: readonly Diagnostic[];
}

/** A placeholder a template render writes for a `{{ }}` hole: never a real table or schema name. */
const TEMPLATE_PLACEHOLDER = /^__MJ[TINQ]_\d+__$/;

/** Function names written right after a call that keep it the whole output expression (`COUNT(*) OVER (…)`). */
const CALL_SUFFIX_KEYWORDS: ReadonlySet<string> = new Set(['OVER', 'WITHIN', 'FILTER']);

function isBlank(sql: string | null | undefined): boolean {
    return typeof sql !== 'string' || sql.trim().length === 0;
}

function viewsFor(sql: string, dialect: LegacyDialectInput): { Views: SqlView[]; Dialect: ParserDialect } {
    const resolved = ResolveParserDialect(dialect);
    return { Views: TemplateSqlViews(sql, resolved), Dialect: resolved };
}

function allDiagnostics(views: readonly SqlView[]): Diagnostic[] {
    return views.flatMap(v => [...v.Document.Diagnostics]);
}

// ─── Table references ───────────────────────────────────────────────────────

/**
 * The tables and views a statement reads, in the legacy `SQLTableReference` shape: every table
 * source of every reading of the SQL (each branch of a template), never a CTE, a table-valued
 * function, or a name inside a comment or string. An unqualified name gets the dialect's default
 * schema. One entry per schema and table, ignoring case, with the alias of its first use.
 */
export function LegacyTableReferences(sql: string, dialect: LegacyDialectInput): SQLTableReference[] {
    if (isBlank(sql)) return [];
    const { Views, Dialect } = viewsFor(sql, dialect);
    return tableReferencesOf(Views, LegacyDefaultSchema(Dialect));
}

function tableReferencesOf(views: readonly SqlView[], defaultSchema: string): SQLTableReference[] {
    const seen = new Set<string>();
    const tables: SQLTableReference[] = [];
    for (const named of views.flatMap(view => namedTables(view.Document))) {
        const tableName = lastPart(named.Name);
        if (TEMPLATE_PLACEHOLDER.test(tableName)) continue;
        const written = schemaPart(named.Name);
        const schemaName = written === null || TEMPLATE_PLACEHOLDER.test(written) ? defaultSchema : written;
        const key = `${schemaName.toLowerCase()}.${tableName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tables.push({ TableName: tableName, SchemaName: schemaName, Alias: named.Alias ?? tableName });
    }
    return tables;
}

/** The tables a document reads: its table sources (CTE references and functions excluded), then the tables of its non-query statements. */
function namedTables(document: SqlDocument): NamedTable[] {
    const sources: NamedTable[] = [];
    for (const ref of document.TableReferences().Value) {
        if (ref.Kind === 'Table' && ref.Source.Kind === 'Table') sources.push({ Name: ref.Name, Alias: ref.Source.Alias?.Value ?? null });
    }
    const nonQuery = NonQueryTables(document);
    return [...sources, ...nonQuery.Tables, ...nonQuery.Queries.flatMap(query => namedTables(query))];
}

/** The schema part of a name: the part before the table; `null` when unqualified. */
function schemaPart(name: ObjectName): string | null {
    return name.Parts.length >= 2 ? name.Parts[name.Parts.length - 2].Value : null;
}

function lastPart(name: ObjectName): string {
    return name.Parts[name.Parts.length - 1]?.Value ?? '';
}

// ─── Column references ──────────────────────────────────────────────────────

/**
 * Every identifier path that can be a column, in every clause and every reading of the SQL, as
 * `{ ColumnName, TableQualifier }` with the qualifier part just before the column. One entry per
 * written `qualifier.column`. Empty, and `Complete: false`, when a reading cannot be parsed
 * completely.
 */
export function LegacyColumnReferencesChecked(sql: string, dialect: LegacyDialectInput): CheckedColumnReferences {
    if (isBlank(sql)) return { Columns: [], Complete: true, Diagnostics: [] };
    const { Views } = viewsFor(sql, dialect);
    const complete = Views.every(v => v.Complete);
    return { Columns: complete ? columnReferencesOf(Views) : [], Complete: complete, Diagnostics: allDiagnostics(Views) };
}

/** A column reference with where it starts, for ordering. */
interface PositionedColumn {
    readonly Start: number;
    readonly Column: SQLColumnReference;
}

function columnReferencesOf(views: readonly SqlView[]): SQLColumnReference[] {
    const seen = new Set<string>();
    const columns: SQLColumnReference[] = [];
    for (const view of views) {
        for (const { Column } of positionedColumns(view.Document)) {
            const key = Column.TableQualifier === null ? Column.ColumnName : `${Column.TableQualifier}.${Column.ColumnName}`;
            if (seen.has(key)) continue;
            seen.add(key);
            columns.push(Column);
        }
    }
    return columns;
}

/**
 * A document's column references plus its stars (`*` and `t.*`, reported as column `*`), in
 * source order, then those of its non-query statements (their WHERE conditions and the queries
 * they hold). Names in a PIVOT's `IN (…)` list name new columns and are left out, as are template
 * placeholders.
 */
function positionedColumns(document: SqlDocument): PositionedColumn[] {
    const pivotLists = PivotInLists(document);
    const outside = (start: number) => !pivotLists.some(span => start >= span.Start && start < span.End);
    const found: PositionedColumn[] = document.ColumnReferences().Value
        .filter(ref => outside(ref.Span.Start) && !TEMPLATE_PLACEHOLDER.test(ref.Column.Value))
        .map(ref => ({
            Start: ref.Span.Start,
            Column: { ColumnName: ref.Column.Value, TableQualifier: ref.Qualifier.length > 0 ? ref.Qualifier[ref.Qualifier.length - 1].Value : null },
        }));
    found.push(...starColumns(document));
    found.sort((a, b) => a.Start - b.Start);
    const nonQuery = NonQueryTables(document);
    const nested = [...nonQuery.Conditions, ...nonQuery.Queries].flatMap(d => positionedColumns(d));
    return [...found, ...nested];
}

/** The `*` and `t.*` items of a document, outside function calls (`COUNT(*)` is not a column). */
function starColumns(document: SqlDocument): PositionedColumn[] {
    const stars: PositionedColumn[] = [];
    for (const context of document.Scope().Expressions) {
        for (const star of context.Expression.Stars()) {
            if (star.FunctionName !== null) continue;
            const qualifier = star.Qualifier === null ? null : lastPart(star.Qualifier);
            stars.push({ Start: star.Span.Start, Column: { ColumnName: '*', TableQualifier: qualifier } });
        }
    }
    return stars;
}

// ─── Select-list columns ────────────────────────────────────────────────────

/**
 * The select list of each query statement (for a set operation, its first branch's), in the
 * legacy `SQLSelectColumn` shape. A template is read through its base render (every first
 * branch). Empty, and `Complete: false`, when that reading cannot be parsed completely.
 */
export function LegacySelectColumnsChecked(sql: string, dialect: LegacyDialectInput): CheckedSelectColumns {
    if (isBlank(sql)) return { Columns: [], Complete: true, Diagnostics: [] };
    const { Views } = viewsFor(sql, dialect);
    const view = Views[0];
    const columns = view.Complete ? queryDocuments(view.Document).flatMap(d => d.OutputItems().Value.Items.map(item => selectColumn(item, d))) : [];
    return { Columns: columns, Complete: view.Complete, Diagnostics: [...view.Document.Diagnostics] };
}

/** One document per query statement: the document itself when it holds one statement, else each query statement on its own. */
function queryDocuments(document: SqlDocument): SqlDocument[] {
    const statements = document.Statements.filter(s => s.StatementKind !== 'Empty');
    if (statements.length <= 1) return [document];
    return statements.filter(s => s.StatementKind === 'Select').map(s => SqlDocument.Parse(document.Text(s.Span), document.Dialect));
}

function selectColumn(item: OutputItem, document: SqlDocument): SQLSelectColumn {
    if (item.IsStar) {
        const qualifier = item.StarQualifier === null ? null : lastPart(item.StarQualifier);
        return { OutputName: '*', SourceColumn: '*', TableQualifier: qualifier, IsExpression: false };
    }
    const path = plainColumnPath(item, document);
    if (path !== null) {
        const column = path[path.length - 1].Value;
        const qualifier = path.length > 1 ? path[path.length - 2].Value : null;
        return { OutputName: item.Alias?.Value ?? column, SourceColumn: column, TableQualifier: qualifier, IsExpression: false };
    }
    const name = item.Alias?.Value ?? expressionName(item);
    return { OutputName: name, SourceColumn: name, TableQualifier: null, IsExpression: true };
}

/**
 * The identifier path a select item is made of, or `null` when it is any other expression. A
 * trailing `COLLATE <collation>` keeps the item a plain column.
 */
function plainColumnPath(item: OutputItem, document: SqlDocument): readonly IdentifierNode[] | null {
    const expression = item.Item.Expression;
    const ids = expression.Identifiers();
    if (ids.length === 0 || expression.FunctionCalls().length > 0) return null;
    const path = ids[0];
    if (path.Span.Start !== expression.Span.Start) return null;
    if (path.Span.End === expression.Span.End && ids.length === 1) return path.Parts;
    const rest = document.Text({ Start: path.Span.End, End: expression.Span.End }).trim();
    return /^COLLATE\s+("[^"]*"|\[[^\]]*\]|[\w$#@]+)$/i.test(rest) ? path.Parts : null;
}

/**
 * The name node-sql-parser gave an unnamed expression column: `NAME(...)` for a function call
 * that makes up the whole item (window and `WITHIN GROUP` suffixes included), `EXPR` otherwise.
 */
function expressionName(item: OutputItem): string {
    const expression = item.Item.Expression;
    const call = expression.FunctionCalls()[0];
    if (call === undefined || call.Span.Start !== expression.Span.Start) return 'EXPR';
    const after = expression.Tokens().find(t => t.Span.Start >= call.Span.End);
    if (after !== undefined && !CALL_SUFFIX_KEYWORDS.has(after.Text.toUpperCase())) return 'EXPR';
    return `${lastPart(call.Name).toUpperCase()}(...)`;
}

// ─── CTEs ───────────────────────────────────────────────────────────────────

/**
 * The leading `WITH` clause of a statement, split into each CTE definition exactly as written
 * (`name [(columns)] AS (body)`) and the statement after it, trimmed. `UsedASTParsing` is true when
 * the statement parsed completely and holds no template tag. Returns `null` when the SQL does not start with `WITH` after
 * leading comments.
 */
export function LegacyCTEExtraction(sql: string, dialect: LegacyDialectInput): SQLCTEExtraction | null {
    if (typeof sql !== 'string') return null;
    const stripped = SkipLeadingCommentsAndWhitespace(sql);
    if (!/^WITH\s/i.test(stripped)) return null;
    const resolved = ResolveParserDialect(dialect);
    const document = SqlDocument.Parse(sql, resolved);
    const leading = document.Statements[0]?.With ?? null;
    if (leading !== null && leading.CTEs.length > 0 && leading.CTEs.every(cte => closesBody(document, cte))) {
        return {
            CTEDefinitions: leading.CTEs.map(cte => document.Text(cte.Span)),
            MainStatement: sql.substring(leading.Span.End).trim(),
            UsedASTParsing: ReadWithoutErrors(document) && !document.Tokens.HasTemplate,
        };
    }
    const split = SplitLeadingCTEs(sql, resolved);
    if (split !== null) {
        return { CTEDefinitions: split.Definitions.map(d => d.Text), MainStatement: split.Main.trim(), UsedASTParsing: false };
    }
    return ExtractCTEsByParenScan(stripped);
}

/** Whether a CTE's span ends with the parenthesis that closes its body. */
function closesBody(document: SqlDocument, cte: CTEDeclaration): boolean {
    return cte.BodySpan.End === cte.Span.End && document.Text(cte.BodySpan).endsWith(')');
}

// ─── Parse ──────────────────────────────────────────────────────────────────

/**
 * Tables and column references together, as the legacy `Parse` returned them. `UsedASTParsing`
 * is true when every reading of the SQL parsed completely.
 */
export function LegacyParse(sql: string, dialect: LegacyDialectInput): SQLParseResult {
    if (isBlank(sql)) return { Tables: [], Columns: [], UsedASTParsing: false };
    const { Views, Dialect } = viewsFor(sql, dialect);
    const complete = Views.every(v => v.Complete);
    return {
        Tables: tableReferencesOf(Views, LegacyDefaultSchema(Dialect)),
        Columns: complete ? columnReferencesOf(Views) : [],
        UsedASTParsing: complete,
    };
}
