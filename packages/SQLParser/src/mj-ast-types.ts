/**
 * MJ SQL Parser AST Type Definitions
 *
 * These types extend the node-sql-parser AST with MemberJunction-specific nodes
 * for Nunjucks templates, composition tokens, and other MJ SQL extensions.
 */

// ═══════════════════════════════════════════════════
// MJ-specific AST node types
// ═══════════════════════════════════════════════════

/** Discriminated union of all MJ node types */
export type MJNode =
    | MJTemplateExpr
    | MJCompositionRef
    | MJConditionalBlock
    | MJLoopBlock
    | MJComment
    | MJSetBlock
    | MJRawSQL;

/** Discriminated union of all MJ node type strings */
export type MJNodeType =
    | 'mj_template_expr'
    | 'mj_composition_ref'
    | 'mj_conditional'
    | 'mj_loop'
    | 'mj_comment'
    | 'mj_set'
    | 'mj_raw_sql';

/** A {{ variable | filter1 | filter2 }} expression */
export interface MJTemplateExpr {
    type: 'mj_template_expr';
    /** The variable name (e.g., "Region", "MinActivityCount") */
    variable: string;
    /** Filter chain applied to the variable */
    filters: MJFilter[];
    /** Original raw text including delimiters */
    raw: string;
}

/** A single Nunjucks filter with optional arguments */
export interface MJFilter {
    /** Filter name (e.g., "sqlString", "sqlNumber", "default") */
    name: string;
    /** Filter arguments (e.g., for default('N/A') → args: ['N/A']) */
    args: (string | number)[];
}

/** A {{query:"path/Name(params)"}} composition reference */
export interface MJCompositionRef {
    type: 'mj_composition_ref';
    /** Category path segments (e.g., "Engagement Analytics") */
    categoryPath: string;
    /** Query name (e.g., "Member Activity Counts") */
    queryName: string;
    /** Parameters passed to the referenced query */
    parameters: MJCompositionParam[];
    /** Original raw text including delimiters */
    raw: string;
}

/** A single parameter in a composition reference */
export interface MJCompositionParam {
    /** Parameter key name */
    key: string;
    /** Parameter value (literal string or variable name) */
    value: string;
    /** true if value is a pass-through variable name, false if literal */
    isPassThrough: boolean;
}

/** A {% if %}...{% elif %}...{% else %}...{% endif %} block */
export interface MJConditionalBlock {
    type: 'mj_conditional';
    /** Ordered branches: first is the if, middle are elifs, last may be else */
    branches: MJBranch[];
    /** Original raw text of the entire block */
    raw: string;
}

/** A single branch within a conditional block */
export interface MJBranch {
    /** Condition expression string, or null for {% else %} */
    condition: string | null;
    /** SQL content inside this branch */
    body: MJSQLFragment;
}

/** A {% for x in arr %}...{% endfor %} loop */
export interface MJLoopBlock {
    type: 'mj_loop';
    /** Loop variable name (e.g., "status") */
    variable: string;
    /** Iterable expression (e.g., "statusList") */
    iterable: string;
    /** SQL content inside the loop body */
    body: MJSQLFragment;
    /** Original raw text of the entire block */
    raw: string;
}

/** A {# comment #} */
export interface MJComment {
    type: 'mj_comment';
    /** Comment text (without delimiters) */
    text: string;
    /** Original raw text including delimiters */
    raw: string;
}

/** A {% set var = expr %} assignment */
export interface MJSetBlock {
    type: 'mj_set';
    /** Variable name being assigned */
    variable: string;
    /** Expression being assigned */
    expression: string;
    /** Original raw text including delimiters */
    raw: string;
}

/**
 * SQL fragment inside conditional/loop blocks.
 * May be incomplete SQL (e.g., "AND Status = {{ Status | sqlString }}").
 * Stored as raw text with extracted MJ tokens.
 */
export interface MJSQLFragment {
    /** Original raw SQL text (may contain MJ tokens) */
    raw: string;
    /** Ordered list of MJ nodes found within this fragment */
    nodes: MJNode[];
}

/** Unparseable SQL text preserved verbatim */
export interface MJRawSQL {
    type: 'mj_raw_sql';
    /** The raw SQL text */
    text: string;
}

// ═══════════════════════════════════════════════════
// Lexer Token Types (intermediate representation)
// ═══════════════════════════════════════════════════

/** Discriminated union of all lexer token types */
export type MJTokenType =
    | 'MJ_TEMPLATE_EXPR'
    | 'MJ_COMPOSITION_REF'
    | 'MJ_IF_OPEN'
    | 'MJ_ELIF'
    | 'MJ_ELSE'
    | 'MJ_ENDIF'
    | 'MJ_FOR_OPEN'
    | 'MJ_ENDFOR'
    | 'MJ_SET'
    | 'MJ_COMMENT'
    | 'SQL_TEXT';

/** A single lexer token with position tracking */
export interface MJToken {
    /** Token type */
    type: MJTokenType;
    /** Start position in original SQL (inclusive) */
    start: number;
    /** End position in original SQL (exclusive) */
    end: number;
    /** Original raw text */
    raw: string;
    /** Parsed content specific to the token type */
    parsed: MJTokenParsedContent;
}

/** Union of parsed content types for each token type */
export type MJTokenParsedContent =
    | MJTemplateExprContent
    | MJCompositionRefContent
    | MJBlockTagContent
    | MJCommentContent
    | MJSetContent
    | MJSQLTextContent;

/** Parsed content for MJ_TEMPLATE_EXPR tokens */
export interface MJTemplateExprContent {
    kind: 'template_expr';
    variable: string;
    filters: MJFilter[];
}

/** Parsed content for MJ_COMPOSITION_REF tokens */
export interface MJCompositionRefContent {
    kind: 'composition_ref';
    categoryPath: string;
    queryName: string;
    parameters: MJCompositionParam[];
}

/** Parsed content for block tags (if/elif/else/endif/for/endfor) */
export interface MJBlockTagContent {
    kind: 'block_tag';
    /** The condition expression for if/elif, loop variable for for, null for else/endif/endfor */
    expression: string | null;
    /** For {% for %}: the loop variable name */
    loopVariable?: string;
    /** For {% for %}: the iterable expression */
    loopIterable?: string;
}

/** Parsed content for MJ_COMMENT tokens */
export interface MJCommentContent {
    kind: 'comment';
    text: string;
}

/** Parsed content for MJ_SET tokens */
export interface MJSetContent {
    kind: 'set';
    variable: string;
    expression: string;
}

/** Parsed content for SQL_TEXT tokens */
export interface MJSQLTextContent {
    kind: 'sql_text';
    text: string;
}

// ═══════════════════════════════════════════════════
// Placeholder types
// ═══════════════════════════════════════════════════

/** The SQL context in which a placeholder appears */
export type PlaceholderContext =
    | 'string'      // Used for sqlString, sqlDate, bare {{ var }}
    | 'number'      // Used for sqlNumber
    | 'identifier'  // Used for sqlIdentifier, sqlNoKeywordsExpression
    | 'in_list'     // Used for sqlIn
    | 'boolean';    // Used for sqlBoolean

/** A single placeholder entry in the position map */
export interface PlaceholderEntry {
    /** The placeholder string inserted into SQL (e.g., "'__MJT_001__'", "42001") */
    placeholder: string;
    /** The original MJ token that was replaced */
    originalToken: MJToken;
    /** The SQL context type of this placeholder */
    context: PlaceholderContext;
}

/** Result of placeholder substitution */
export interface PlaceholderSubstitutionResult {
    /** Clean SQL with all MJ tokens replaced by SQL-safe placeholders */
    cleanSQL: string;
    /** Map from placeholder string to the original token info */
    positionMap: Map<string, PlaceholderEntry>;
    /** Tokens that were NOT substituted (block tags, comments) — they were stripped */
    strippedTokens: MJToken[];
}

// ═══════════════════════════════════════════════════
// Public API result types
// ═══════════════════════════════════════════════════

/** Result of the full MJ SQL parsing pipeline */
export interface MJParseResult {
    /** All MJ tokens found in the SQL, in source order */
    tokens: MJToken[];
    /** Whether the SQL contains any MJ extensions */
    hasMJExtensions: boolean;
    /** Whether the SQL contains Nunjucks template expressions */
    hasTemplateExpressions: boolean;
    /** Whether the SQL contains composition references */
    hasCompositionRefs: boolean;
    /** Whether the SQL contains conditional blocks */
    hasConditionalBlocks: boolean;
    /** Whether the SQL contains loop blocks */
    hasLoopBlocks: boolean;
}

// ═══════════════════════════════════════════════════
// AST Annotation types (from AST Walker)
// ═══════════════════════════════════════════════════

/** The SQL clause where an MJ node was found */
export type SQLClauseContext =
    | 'select'       // In the SELECT column list
    | 'from'         // In the FROM clause (table position)
    | 'where'        // In the WHERE condition
    | 'join_on'      // In a JOIN ON condition
    | 'group_by'     // In GROUP BY
    | 'order_by'     // In ORDER BY
    | 'having'       // In HAVING
    | 'cte'          // Inside a CTE body
    | 'subquery'     // Inside a subquery
    | 'unknown';     // Could not determine context

/** An annotation mapping a placeholder in the AST to its original MJ node */
export interface MJASTAnnotation {
    /** Dot-separated path in the AST (e.g., "where.right", "columns[0].expr") */
    path: string;
    /** The placeholder value found in the AST */
    placeholder: string;
    /** The SQL clause context where this placeholder appears */
    clauseContext: SQLClauseContext;
    /** The resolved MJ template expression (if this is a template expr placeholder) */
    templateExpr: MJTemplateExpr | null;
    /** The resolved MJ composition ref (if this is a composition ref placeholder) */
    compositionRef: MJCompositionRef | null;
    /** The placeholder context type (string, number, identifier, etc.) */
    placeholderContext: PlaceholderContext;
    /** The raw AST node that contains the placeholder */
    astNode: Record<string, unknown>;
}

/** Result of walking the AST to annotate MJ placeholder positions */
export interface MJASTWalkResult {
    /** All annotations found, in walk order */
    annotations: MJASTAnnotation[];
    /** Annotations grouped by SQL clause context */
    byClause: Map<SQLClauseContext, MJASTAnnotation[]>;
    /** Annotations indexed by placeholder string for quick lookup */
    byPlaceholder: Map<string, MJASTAnnotation>;
    /** Annotations for template expressions only */
    templateExprs: MJASTAnnotation[];
    /** Annotations for composition refs only */
    compositionRefs: MJASTAnnotation[];
}
