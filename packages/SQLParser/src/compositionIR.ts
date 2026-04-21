/**
 * Composition IR — Typed intermediate representation for the composition engine.
 *
 * This IR is **deliberately not a full SQL AST.** It's a *structural* IR that
 * knows about the bits of SQL the composition pipeline needs to manipulate:
 * - CTEs (hoisting, renaming, dependency ordering)
 * - Top-level ORDER BY (stripping for CTE legality)
 * - Template expressions and block tags (preserved for Nunjucks)
 * - Comments and string literals (context awareness)
 *
 * Expressions are treated as opaque SQL text. The IR's job is to understand
 * *where* template tokens sit in the SQL structure (inside a string literal?
 * inside a CTE body? inside a subquery?) so that composition can work
 * correctly around them.
 *
 * The IR renderer emits SQL with {{ }}/{% %} tokens intact for Nunjucks
 * evaluation downstream.
 */

// ════════════════════════════════════════════════════════════════════
// Fragment types — the building blocks of IR nodes
// ════════════════════════════════════════════════════════════════════

/** Opaque SQL text — treated as-is by the IR */
export interface SQLFragment {
    Kind: 'sql';
    /** Raw SQL text (may contain anything except MJ tokens) */
    Text: string;
}

/** A Nunjucks template expression: {{ variable | filter1 | filter2 }} */
export interface TemplateExprFragment {
    Kind: 'template-expr';
    /** The raw text including {{ and }} */
    Raw: string;
    /** The variable name (first token after {{) */
    Variable: string;
}

/** A Nunjucks block tag region: {% if/for/set %} ... {% endif/endfor %} */
export interface BlockFragment {
    Kind: 'block';
    /** The raw text of the entire block including tags */
    Raw: string;
    /** Block type */
    BlockType: 'if' | 'for' | 'set' | 'other';
}

/** A SQL comment (line or block) */
export interface CommentFragment {
    Kind: 'comment';
    /** Raw comment text including delimiters */
    Raw: string;
}

/** A composition reference: {{query:"..."}} — only present pre-resolution */
export interface CompositionRefFragment {
    Kind: 'composition-ref';
    /** The raw text including {{ and }} */
    Raw: string;
    /** Parsed query path */
    QueryPath: string;
}

/** Union of all fragment types */
export type Fragment =
    | SQLFragment
    | TemplateExprFragment
    | BlockFragment
    | CommentFragment
    | CompositionRefFragment;

// ════════════════════════════════════════════════════════════════════
// Statement-level IR nodes
// ════════════════════════════════════════════════════════════════════

/**
 * A CTE definition in the WITH clause.
 */
export interface CTENode {
    /** Symbol-table-assigned unique identifier */
    Id: string;
    /** The CTE name as it should appear in rendered SQL (may be quoted) */
    Name: string;
    /** The canonical (unquoted, lowercased) name for comparison */
    CanonicalName: string;
    /** The CTE body as a sequence of fragments */
    Body: Fragment[];
    /** Optional column list */
    Columns?: string[];
    /** Provenance: who created this CTE */
    Origin: CTEOrigin;
    /** Whether this CTE has a top-level ORDER BY that was stripped */
    OrderByStripped: boolean;
}

/** Where a CTE came from */
export type CTEOrigin =
    | { Kind: 'composition'; DepName: string; CategoryPath: string }
    | { Kind: 'hoisted'; SourceCTEId: string; DepName: string }
    | { Kind: 'user' }
    | { Kind: 'synthetic' };

/**
 * Top-level IR node — represents the entire SQL statement structure.
 *
 * The composition engine operates on this IR:
 * 1. Parse raw SQL → QueryIR
 * 2. Resolve composition refs → add CTEs, replace refs with CTE names
 * 3. Strip illegal ORDER BYs from CTE bodies
 * 4. Render QueryIR → SQL string (with {{ }}/{% %} intact)
 */
export interface QueryIR {
    /** WITH clause CTEs in dependency order */
    CTEs: CTENode[];
    /** The main statement body as fragments */
    Body: Fragment[];
    /** Whether the original SQL started with a WITH clause */
    HasUserCTEs: boolean;
    /** Trailing ORDER BY (if detected at top level) */
    TrailingOrderBy: Fragment[] | null;
    /** Whether the ORDER BY is legal in CTE context (TOP/OFFSET/FOR XML) */
    OrderByIsLegalInCTE: boolean;
}
