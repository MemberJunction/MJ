import type { SQLStatementKind } from '../sql-parser.js';

/** One FROM item a parsed statement reads: a table or view, or a table function. */
export interface StrictRelation {
    /**
     * The schema of the table or function as written, without quotes; empty when unqualified. A
     * three-part name keeps its database (`database.schema`), so it never matches a view in this
     * database.
     */
    SchemaName: string;
    /** The table or view name without quotes; empty when the item is not a table or view. */
    TableName: string;
    /** The table function's name; empty when the item is not a function call. */
    FunctionName: string;
    /**
     * True when the item names a CTE that is in scope where it is read: an unqualified name that
     * matches, by the dialect's identifier rules, a CTE declared by its own SELECT or an enclosing
     * one. A schema, `dbo` included, always makes the item a real table or view.
     */
    IsCTEReference: boolean;
}

/** Every FROM item a parsed statement reads, and how many SELECTs its parse tree holds. */
export interface StrictStatementReads {
    /** Every FROM item, repeats included. Derived tables and VALUES lists add none of their own. */
    Relations: StrictRelation[];
    /** The SELECT nodes in the tree, each counted once. */
    SelectCount: number;
}

/**
 * Why {@link StrictValidationResult.IsValid} is false, checked in this order:
 * - `'NoGrammar'`: the dialect has no grammar the strict parser can read it with;
 * - `'Unparseable'`: the grammar could not read the text;
 * - `'WriteStatement'`: a top-level statement writes, changes the schema or changes permissions;
 * - `'NotPlainSelect'`: the statement is not one plain SELECT (a set operation, SELECT … INTO, …);
 * - `'NestedWrite'`: a write or DDL statement sits somewhere inside it (a CTE body, a subquery).
 */
export type StrictRefusal = 'NoGrammar' | 'Unparseable' | 'WriteStatement' | 'NotPlainSelect' | 'NestedWrite';

/** How the strict parser may read the text. */
export interface StrictParseOptions {
    /**
     * Whether a text the grammar cannot read directly is read again after the parser's fallbacks
     * (renaming bracket identifiers the grammar rejects, setting aside a trailing query-hint
     * clause). Defaults to true. False keeps the single direct reading.
     */
    AllowFallbackParse?: boolean;
    /**
     * Collects {@link StrictValidationResult.Reads} when the text is valid. Defaults to false.
     */
    CollectReads?: boolean;
    /**
     * Collects {@link StrictValidationResult.ColumnReferences} when the text parses. Defaults to
     * false.
     */
    CollectColumnReferences?: boolean;
}

/** How {@link StrictParseOptions} apply to a WHERE fragment. */
export interface StrictFilterOptions extends StrictParseOptions {
    /**
     * Where the fragment is placed after the WHERE of the statement the parser reads.
     * `'Enclosed'` (the default) puts it inside its own parentheses, so a complete predicate
     * parses whatever its top-level operators. `'AsWritten'` places it directly after WHERE, so a
     * fragment that closes a parenthesis it did not open does not parse.
     */
    Placement?: 'Enclosed' | 'AsWritten';
}

/** What the strict parser found in a fragment or statement. */
export interface StrictValidationResult {
    /**
     * True when the text parsed as exactly one plain read: no top-level write, a plain SELECT,
     * and no write or DDL statement at any depth.
     */
    IsValid: boolean;
    /** Why the text is not valid; `null` when it is. */
    Refusal: StrictRefusal | null;
    /** A sentence saying why the text is not valid; `null` when it is. */
    Reason: string | null;
    /**
     * The text the parser read: a fragment inside its parse wrapper (`SELECT 1 FROM
     * __mj_clause_screen WHERE (…)`), or a statement as given.
     */
    ParsedSQL: string;
    /** Whether the grammar read the text (directly, or after the fallbacks when they are allowed). */
    Parsed: boolean;
    /** The kind of the top-level statement; `'other'` when the text did not parse. */
    StatementKind: SQLStatementKind;
    /** Whether a top-level statement writes, changes the schema or changes permissions. */
    HasWriteStatement: boolean;
    /** Whether a write, DDL or DCL statement appears anywhere in the parse tree. */
    ContainsNestedWrite: boolean;
    /** Whether the parse is exactly one statement of a recognised kind. */
    IsSingleTypedStatement: boolean;
    /**
     * The FROM items the text reads, when {@link StrictParseOptions.CollectReads} was set and the
     * text is valid; otherwise `null`. A fragment's own parse wrapper is not among them.
     */
    Reads: StrictStatementReads | null;
    /**
     * The column references in the WHERE clause of each parsed statement, in the order first met,
     * each once: `table.column` when qualified, the column alone otherwise. Set when
     * {@link StrictParseOptions.CollectColumnReferences} was set and the text parsed; otherwise
     * `null`.
     */
    ColumnReferences: string[] | null;
}

/** What {@link StrictFragmentValidator.ValidateAggregateExpression} decided. */
export interface StrictAggregateResult {
    /** Whether the expression may be placed as one item of an aggregate SELECT list. */
    IsValid: boolean;
    /** Why the expression was refused; `null` when it is allowed. */
    Reason: string | null;
    /**
     * The SQL to run in place of the caller's text: the expression rebuilt from its checked parse
     * tree, with the dialect's quoting. `null` when the expression is refused.
     */
    SQL: string | null;
}
