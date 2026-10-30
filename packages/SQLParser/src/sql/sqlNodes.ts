import type { Span } from '../common/analysis.js';
import type { SqlExpression } from './sqlExpression.js';

/**
 * The node tree of a {@link SqlDocument}. Every node has a `Kind` and a `Span` covering a range of
 * whole tokens of the input; `SqlDocument.Text(node)` is that slice of the text.
 *
 * The tree is read-only. Kinds and optional fields may be added in later releases, so code that
 * switches on `Kind` must handle a kind it does not know (treat it as opaque). Nothing is ever
 * removed or given a new meaning.
 */

/** A node the parser could not read: an unrecognised clause, statement or source. */
export interface UnknownNode {
    readonly Kind: 'Unknown';
    readonly Span: Span;
    /** Why the text could not be read, in a sentence. */
    readonly Reason: string;
}

/** One name part, such as `dbo`, `[Order Details]` or `"x"`. */
export interface IdentifierNode {
    readonly Kind: 'Identifier';
    /** The name with its quotes removed and doubled closing quotes undone. */
    readonly Value: string;
    /** Whether the name was written quoted. */
    readonly Quoted: boolean;
    readonly Span: Span;
}

/** A dotted name such as `SalesDb.dbo.Orders`, its parts as written. */
export interface ObjectName {
    readonly Kind: 'ObjectName';
    /** The parts in order; an omitted part (`db..table`) is an empty, unquoted identifier. */
    readonly Parts: readonly IdentifierNode[];
    readonly Span: Span;
}

/**
 * What a statement does, read from its leading keyword. `Select` covers every read query
 * (`SELECT`, `WITH … SELECT`, `VALUES`, a parenthesized query). `Other` is any statement whose
 * keyword is not listed; `Empty` is a statement with no tokens.
 */
export type SqlStatementKind =
    | 'Select' | 'Insert' | 'Update' | 'Delete' | 'Merge' | 'Execute' | 'Call' | 'Declare' | 'Set'
    | 'Create' | 'Alter' | 'Drop' | 'Truncate' | 'Grant' | 'Revoke' | 'Deny' | 'Use' | 'Other' | 'Empty';

/** One statement of a document, up to its terminating semicolon. */
export interface StatementNode {
    readonly Kind: 'Statement';
    readonly Span: Span;
    readonly StatementKind: SqlStatementKind;
    /** The leading `WITH` clause; `null` when there is none. */
    readonly With: WithClause | null;
    /** The query; an {@link UnknownNode} for a statement that is not a query. */
    readonly Body: QueryExpression | UnknownNode;
    /** Text after the query that could not be attached to it. */
    readonly Tail: readonly UnknownNode[];
    /** The `;` that ends the statement; `null` when there is none. */
    readonly Terminator: Span | null;
}

/** A nested query: a CTE body, a derived table, a subquery or a parenthesized query. */
export interface QueryNode {
    readonly Kind: 'Query';
    readonly Span: Span;
    readonly StatementKind: SqlStatementKind;
    /** A `WITH` clause inside the parentheses (PostgreSQL); `null` when there is none. */
    readonly With: WithClause | null;
    /** The query; an {@link UnknownNode} for a body that is not a query (`DELETE … RETURNING`). */
    readonly Body: QueryExpression | UnknownNode;
    /** Text after the query that could not be attached to it. */
    readonly Tail: readonly UnknownNode[];
}

/** `WITH [RECURSIVE] cte, …`. */
export interface WithClause {
    readonly Kind: 'With';
    readonly Span: Span;
    /** Whether the clause carries the dialect's recursive keyword. */
    readonly Recursive: boolean;
    readonly CTEs: readonly CTEDeclaration[];
}

/** `name [(columns)] AS [[NOT] MATERIALIZED] (body)`. */
export interface CTEDeclaration {
    readonly Kind: 'CTE';
    readonly Span: Span;
    readonly Name: IdentifierNode;
    /** The column list; `null` when there is none. */
    readonly ColumnList: readonly IdentifierNode[] | null;
    /** `MATERIALIZED` / `NOT MATERIALIZED` (PostgreSQL); `null` when not written. */
    readonly Materialized: 'Materialized' | 'NotMaterialized' | null;
    /** The body, without its parentheses. */
    readonly Body: QueryNode;
    /** The body's parentheses, included. */
    readonly BodySpan: Span;
}

/** The clauses that may follow a query expression at any level. */
export interface QueryTailClauses {
    readonly OrderBy: OrderByClause | null;
    readonly Limit: LimitClause | null;
    readonly Offset: OffsetClause | null;
    readonly Fetch: FetchClause | null;
    readonly For: ForClause | null;
    readonly Option: OptionClause | null;
}

/** A query expression: a select, a set operation, a parenthesized query or a `VALUES` list. */
export type QueryExpression = SelectCore | SetOperationNode | ParenthesizedQuery | ValuesQuery | UnknownNode;

/** One `SELECT … FROM … WHERE …` block. */
export interface SelectCore extends QueryTailClauses {
    readonly Kind: 'Select';
    readonly Span: Span;
    readonly Distinct: DistinctClause | null;
    readonly Top: TopClause | null;
    readonly SelectList: readonly SelectItem[];
    /** The select list's extent, from its first item to its last. */
    readonly SelectListSpan: Span;
    readonly Into: IntoClause | null;
    readonly From: FromClause | null;
    readonly Where: ConditionClause | null;
    readonly GroupBy: GroupByClause | null;
    readonly Having: ConditionClause | null;
    readonly Window: WindowClause | null;
    /** `QUALIFY condition` (Snowflake, Databricks). */
    readonly Qualify: ConditionClause | null;
    /** Clauses inside the block that could not be read. */
    readonly Unrecognized: readonly UnknownNode[];
}

/** The set operators. */
export type SetOperator = 'Union' | 'Intersect' | 'Except' | 'Minus';

/** `left UNION [ALL] right`, and the other set operators. */
export interface SetOperationNode extends QueryTailClauses {
    readonly Kind: 'SetOperation';
    readonly Span: Span;
    readonly Operator: SetOperator;
    /** Whether `ALL` was written. */
    readonly All: boolean;
    /** The operator keyword (and `ALL` / `DISTINCT`). */
    readonly OperatorSpan: Span;
    readonly Left: QueryExpression;
    readonly Right: QueryExpression;
}

/** `(query)` used as a query expression, with its own tail clauses. */
export interface ParenthesizedQuery extends QueryTailClauses {
    readonly Kind: 'Parenthesized';
    readonly Span: Span;
    readonly Query: QueryNode;
}

/** `VALUES (…), (…)` used as a query expression. */
export interface ValuesQuery extends QueryTailClauses {
    readonly Kind: 'Values';
    readonly Span: Span;
    /** One expression per row, including its parentheses. */
    readonly Rows: readonly SqlExpression[];
}

/** `DISTINCT`, `DISTINCT ON (…)` or `ALL` after SELECT. */
export interface DistinctClause {
    readonly Kind: 'Distinct';
    readonly Span: Span;
    readonly Form: 'Distinct' | 'DistinctOn' | 'All';
    /** The `ON (…)` expressions; empty unless the form is `DistinctOn`. */
    readonly On: readonly SqlExpression[];
}

/** `TOP n [PERCENT] [WITH TIES]`. */
export interface TopClause {
    readonly Kind: 'Top';
    readonly Span: Span;
    /** The row count, without parentheses. */
    readonly Value: SqlExpression;
    /** Whether the count is written in parentheses. */
    readonly Parenthesized: boolean;
    readonly Percent: boolean;
    readonly WithTies: boolean;
}

/** One select-list item. */
export interface SelectItem {
    readonly Kind: 'SelectItem';
    readonly Span: Span;
    /** The expression, without the alias. For a star item it covers the star. */
    readonly Expression: SqlExpression;
    /** The alias; `null` when none is written. */
    readonly Alias: IdentifierNode | null;
    /** How the alias is written: `expr AS a`, `expr a`, `a = expr` or `expr 'a'`. */
    readonly AliasForm: 'As' | 'Bare' | 'Equals' | 'String' | null;
    /** Whether the item is `*` or `qualifier.*`. */
    readonly IsStar: boolean;
    /** The qualifier of `qualifier.*`; `null` for `*` and for other items. */
    readonly StarQualifier: ObjectName | null;
}

/** `INTO target` in a select block. */
export interface IntoClause {
    readonly Kind: 'Into';
    readonly Span: Span;
    /** The table written into; `null` when the target is not a name (variables, `OUTFILE`). */
    readonly Target: ObjectName | null;
}

/** `FROM source, …`. */
export interface FromClause {
    readonly Kind: 'From';
    readonly Span: Span;
    /** The comma-separated sources; each may be a join tree. */
    readonly Sources: readonly FromSource[];
}

/** A row source in a FROM clause. */
export type FromSource =
    | TableSource | DerivedSource | FunctionSource | ValuesSource | JoinSource | ApplySource
    | PivotSource | ParenthesizedSource | UnknownNode;

/** Alias parts shared by the sources that can carry one. */
export interface SourceAlias {
    /** The alias; `null` when none is written. */
    readonly Alias: IdentifierNode | null;
    /** The column aliases after the alias, `x(a, b)`; empty when none. */
    readonly ColumnAliases: readonly IdentifierNode[];
}

/** A table, view or CTE named in FROM. */
export interface TableSource extends SourceAlias {
    readonly Kind: 'Table';
    readonly Span: Span;
    readonly Name: ObjectName;
    /** Table hints, sampling and temporal clauses after the name (`WITH (NOLOCK)`); `null` when none. */
    readonly Hints: Span | null;
}

/** `(query) alias` in FROM. */
export interface DerivedSource extends SourceAlias {
    readonly Kind: 'Derived';
    readonly Span: Span;
    readonly Query: QueryNode;
    /** Whether `LATERAL` precedes it. */
    readonly Lateral: boolean;
}

/** A table-valued function call in FROM, such as `OPENJSON(x)` or `generate_series(1, 3)`. */
export interface FunctionSource extends SourceAlias {
    readonly Kind: 'Function';
    readonly Span: Span;
    readonly Name: ObjectName;
    /** The arguments, without the parentheses. */
    readonly Arguments: SqlExpression;
    /** Whether `LATERAL` precedes it. */
    readonly Lateral: boolean;
    /** A trailing schema or option clause (`WITH (…)`, `WITH ORDINALITY`); `null` when none. */
    readonly Options: Span | null;
}

/** `(VALUES (…), …) alias(columns)` in FROM. */
export interface ValuesSource extends SourceAlias {
    readonly Kind: 'ValuesSource';
    readonly Span: Span;
    readonly Rows: readonly SqlExpression[];
}

/** The join kinds. */
export type JoinKind = 'Inner' | 'Left' | 'Right' | 'Full' | 'Cross';

/** `left [NATURAL] kind JOIN right [ON … | USING (…)]`. */
export interface JoinSource {
    readonly Kind: 'Join';
    readonly Span: Span;
    readonly JoinKind: JoinKind;
    readonly Natural: boolean;
    /** The join keywords, from the first to `JOIN`. */
    readonly KeywordSpan: Span;
    readonly Left: FromSource;
    readonly Right: FromSource;
    readonly On: SqlExpression | null;
    readonly Using: readonly IdentifierNode[] | null;
}

/** `left CROSS APPLY right` / `left OUTER APPLY right` (SQL Server). */
export interface ApplySource {
    readonly Kind: 'Apply';
    readonly Span: Span;
    readonly ApplyKind: 'Cross' | 'Outer';
    readonly Left: FromSource;
    readonly Right: FromSource;
}

/** `source PIVOT (…) alias` / `source UNPIVOT (…) alias`. */
export interface PivotSource extends SourceAlias {
    readonly Kind: 'Pivot';
    readonly Span: Span;
    readonly Form: 'Pivot' | 'Unpivot';
    readonly Source: FromSource;
    /** The text inside the parentheses. */
    readonly Body: SqlExpression;
}

/** `(source)`: a parenthesized join tree. */
export interface ParenthesizedSource extends SourceAlias {
    readonly Kind: 'ParenthesizedSource';
    readonly Span: Span;
    readonly Inner: FromSource;
}

/** `WHERE`, `HAVING` or `QUALIFY` with its condition. */
export interface ConditionClause {
    readonly Kind: 'Where' | 'Having' | 'Qualify';
    readonly Span: Span;
    readonly Condition: SqlExpression;
}

/** `GROUP BY [ALL | DISTINCT] items [WITH ROLLUP | WITH CUBE]`. */
export interface GroupByClause {
    readonly Kind: 'GroupBy';
    readonly Span: Span;
    readonly Items: readonly SqlExpression[];
}

/** `WINDOW name AS (…), …`. */
export interface WindowClause {
    readonly Kind: 'Window';
    readonly Span: Span;
    readonly Definitions: readonly WindowDefinition[];
}

/** One named window. */
export interface WindowDefinition {
    readonly Kind: 'WindowDefinition';
    readonly Span: Span;
    readonly Name: IdentifierNode;
    /** The specification, without its parentheses. */
    readonly Specification: SqlExpression;
}

/** `ORDER BY item, …`. */
export interface OrderByClause {
    readonly Kind: 'OrderBy';
    readonly Span: Span;
    readonly Items: readonly OrderByItem[];
}

/** One ORDER BY item. */
export interface OrderByItem {
    readonly Kind: 'OrderByItem';
    readonly Span: Span;
    readonly Expression: SqlExpression;
    readonly Direction: 'Asc' | 'Desc' | null;
    readonly Nulls: 'First' | 'Last' | null;
    /** Whether the expression is a column position, such as `ORDER BY 2`. */
    readonly IsOrdinal: boolean;
}

/** `LIMIT n`, `LIMIT ALL` or MySQL's `LIMIT offset, n`. */
export interface LimitClause {
    readonly Kind: 'Limit';
    readonly Span: Span;
    /** The row count; `null` for `LIMIT ALL`. */
    readonly Value: SqlExpression | null;
    /** The skip count of `LIMIT offset, n`; `null` otherwise. */
    readonly LeadingOffset: SqlExpression | null;
}

/** `OFFSET n [ROW | ROWS]`. */
export interface OffsetClause {
    readonly Kind: 'Offset';
    readonly Span: Span;
    readonly Value: SqlExpression;
}

/** `FETCH {FIRST | NEXT} [n [PERCENT]] {ROW | ROWS} {ONLY | WITH TIES}`. */
export interface FetchClause {
    readonly Kind: 'Fetch';
    readonly Span: Span;
    /** The row count; `null` when omitted (one row). */
    readonly Value: SqlExpression | null;
    readonly Percent: boolean;
    readonly WithTies: boolean;
}

/** What a `FOR` clause asks for. */
export type ForClauseForm = 'Json' | 'Xml' | 'Browse' | 'Update' | 'Share' | 'NoKeyUpdate' | 'KeyShare' | 'ReadOnly' | 'Other';

/** `FOR JSON …`, `FOR XML …` (SQL Server) or a row-locking `FOR UPDATE` / `FOR SHARE`. */
export interface ForClause {
    readonly Kind: 'For';
    readonly Span: Span;
    readonly Form: ForClauseForm;
}

/** `OPTION (hint, …)`: the dialect's query-hint clause. */
export interface OptionClause {
    readonly Kind: 'Option';
    readonly Span: Span;
    /** The hints, without the parentheses. */
    readonly Hints: SqlExpression;
    /** The parentheses, included. */
    readonly ListSpan: Span;
}

/** Any node of the tree. */
export type SqlNode =
    | StatementNode | QueryNode | WithClause | CTEDeclaration | QueryExpression | SelectItem | DistinctClause | TopClause
    | IntoClause | FromClause | FromSource | ConditionClause | GroupByClause | WindowClause | WindowDefinition
    | OrderByClause | OrderByItem | LimitClause | OffsetClause | FetchClause | ForClause | OptionClause
    | IdentifierNode | ObjectName | SqlExpression;
