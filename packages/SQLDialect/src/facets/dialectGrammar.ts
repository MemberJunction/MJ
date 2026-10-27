/**
 * A way to cap the rows a query returns: `'top'` (`SELECT TOP n`), `'limit-offset'`
 * (`LIMIT n OFFSET m`) or `'offset-fetch'` (`OFFSET m ROWS FETCH FIRST n ROWS ONLY`).
 */
export type RowCapForm = 'top' | 'limit-offset' | 'offset-fetch';

/**
 * How a dialect joins a table to a correlated row source: `'apply'` (`CROSS/OUTER APPLY`),
 * `'lateral'` (`LATERAL`), `'both'` or `'none'`.
 */
export type CorrelatedJoinForm = 'apply' | 'lateral' | 'both' | 'none';

/**
 * A select-list alias form besides `expr [AS] alias`: `'equals'` (`alias = expr`, SQL Server) or
 * `'string'` (`expr 'alias'`, a string literal used as the alias).
 */
export type ColumnAliasForm = 'equals' | 'string';

/**
 * Facts about a dialect's statement grammar that code rewriting or screening SQL needs.
 */
export interface DialectGrammar {
    /**
     * The node-sql-parser grammar (its `database` option) that reads this dialect, such as
     * `'TransactSQL'`, `'PostgresQL'`, `'MySQL'`, `'Snowflake'` or `'Hive'`; `null` when
     * node-sql-parser has none.
     */
    readonly ParserGrammar: string | null;
    /** The row-cap forms the dialect accepts. */
    readonly RowCapForms: readonly RowCapForm[];
    /** Whether ORDER BY is legal inside a CTE definition without TOP, OFFSET or FOR XML. */
    readonly AllowsOrderByInCTE: boolean;
    /** Whether ORDER BY is legal inside a derived table without TOP, OFFSET or FOR XML. */
    readonly AllowsOrderByInDerivedTable: boolean;
    /** Whether a WITH clause may appear inside a CTE body or a subquery. */
    readonly SupportsNestedWith: boolean;
    /** The keyword after WITH that marks a recursive CTE, such as `'RECURSIVE'`; `null` when plain WITH is used. */
    readonly RecursiveKeyword: string | null;
    /** The keyword that opens a statement's trailing query-hint clause, such as `'OPTION'`; `null` when there is none. */
    readonly QueryHintKeyword: string | null;
    /** Trailing clauses that make a SELECT return a document rather than rows, such as `'FOR JSON'` and `'FOR XML'`. */
    readonly DocumentTailClauses: readonly string[];
    /** The set-operation keywords the dialect accepts, upper case (`UNION`, `INTERSECT`, `EXCEPT`, `MINUS`). */
    readonly SetOperatorKeywords: readonly string[];
    /** How the dialect joins a correlated row source. */
    readonly CorrelatedJoin: CorrelatedJoinForm;
    /** Upper-case keywords that begin a statement that writes data, changes the schema or runs code. */
    readonly WriteStatementKeywords: readonly string[];
    /**
     * Functions SQL a caller supplied may not call, lower case; a trailing `*` matches every name
     * with that prefix. They run SQL passed as a string, read files or other databases, act on the
     * server, or pause the query.
     */
    readonly CallerSQLForbiddenFunctions: readonly string[];
    /** The ORDER BY expression used to page a query that has none. */
    readonly DefaultPagingOrderBy: string;
    /**
     * The ORDER BY expression for paging a set operation or a `SELECT DISTINCT` without an ORDER
     * BY, where only select-list items are accepted; `null` when {@link DefaultPagingOrderBy} works there too.
     */
    readonly SelectListPagingOrderBy: string | null;
    /** Whether skipping rows for a page requires an ORDER BY. */
    readonly PagingRequiresOrderBy: boolean;
    /** Select-list alias forms the dialect accepts besides `expr [AS] alias`; none when absent. */
    readonly ExtraColumnAliasForms?: readonly ColumnAliasForm[];
    /**
     * Whether a FROM source's name used as a value stands for the whole row, as in PostgreSQL's
     * `SELECT t FROM t` and `row_to_json(t)`. False when absent.
     */
    readonly SourceNameIsRowValue?: boolean;
}
