import { SQLParser } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import type { ParamRole } from './materializationAnalysis';

/**
 * Phase 2b — the render-and-diff verifier (the AST oracle for query parameterization).
 *
 * This is the **soundness-critical** core of parameterized materialization (plan
 * /plans/query-entity-materialization.md §9 Bucket 1, §10 asymmetric-risk). Given a stored
 * query's templated SQL rendered with the **same** parameter set except for **one** parameter
 * varied across ≥2 distinct values, it decides that parameter's {@link ParamRole}:
 *
 *   - `RowFilter`  — varying the value changes only a literal at a *clean* top-level `WHERE`
 *                    predicate on a single column (so the query can be materialized broad and
 *                    that column filtered at read time — Phase 2d).
 *   - `Structural` — varying the value changes the SQL *shape* (different branch / columns /
 *                    joins). Not a row filter; may be per-value-cacheable later (Bucket 2).
 *   - `Unbounded`  — anything we cannot prove safe: a parse failure, no observable effect, a
 *                    literal that varies outside a clean top-level conjunctive `WHERE` equality
 *                    (projection, `OR`/`NOT`, subquery, function, `JOIN ... ON`), or a value that
 *                    touches more than one column. **Default to this when unsure.**
 *
 * The verifier observes *actual rendered behavior* — it never trusts the template author's intent.
 * Its output ({@link VerifiedParamRole}) feeds `qualifyParameterizedQuery` in materializationAnalysis.
 *
 * **Why "clean top-level conjunctive WHERE" is mandatory:** read-time row filtering re-applies the
 * predicate against the *broad* materialization. That is only equivalent to the live parameterized
 * query when the predicate is ANDed into the outer WHERE on a materialized column. Under an `OR`
 * (`WHERE Status = {{s}} OR IsAdmin = 1`), re-filtering by `Status` would wrongly drop the `IsAdmin`
 * rows; inside a subquery / function / JOIN it may not correspond to an output column at all. Those
 * all *taint* the site → refuse.
 *
 * Pure — no DB / IO / LLM. The render step (turning a template + values into these SQL strings)
 * lives in the Phase 2c adapter; this module only consumes already-rendered SQL, so it is fully
 * unit-testable with hand-written SQL pairs.
 */

/** The verifier's verdict for a single parameter. */
export interface VerifiedParamRole {
    /** Proven role under the §10 asymmetric-risk posture. */
    role: ParamRole;
    /** For `RowFilter`: the single column the value filters on (as written in the predicate). */
    filterColumn?: string;
    /** Human-readable justification (logged; never guessed past). */
    reason: string;
}

// node-sql-parser emits a loosely-typed JSON AST (a discriminated-ish union of dozens of node
// shapes). Walking it generically is the correct use of `unknown` + type guards, not a lazy escape:
// we narrow every access. A node is either a scalar, an array, or a keyed object with an optional
// `type` discriminant.
type AstNode = unknown;
type AstObject = Record<string, unknown>;

/** Literal-leaf node types whose `value` is the substituted parameter (the only thing allowed to vary). */
const LITERAL_NODE_TYPES = new Set<string>([
    'single_quote_string',
    'double_quote_string',
    'backticks_quote_string',
    'string',
    'number',
    'bool',
    'boolean',
    'null',
    'date',
    'datetime',
    'time',
    'timestamp',
    'hex_string',
    'bit_string',
]);

/** Comparison operators whose `column <op> value` form is a re-applicable read-time row filter. */
const COMPARISON_OPS = new Set<string>([
    '=', '!=', '<>', '<', '>', '<=', '>=',
    'IN', 'NOT IN', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT', 'BETWEEN', 'NOT BETWEEN',
]);

/** Walk context: where in the tree we are, w.r.t. clean read-time-filterable position. */
interface WalkCtx {
    /** Inside the top-level SELECT's WHERE subtree (not a subquery / other clause). */
    topWhere: boolean;
    /** Reached only through `AND` nodes from the WHERE root (no `OR`/`NOT` above us). */
    conjClean: boolean;
    /** When set, we are the *value* operand of a `column <op> value` predicate on this column. */
    predColumn: string | null;
}

/** A literal (or all-literal `IN`/`BETWEEN` bag) whose value differs between two variants. */
interface VaryingSite {
    /** Bound column when the site is a clean top-level conjunctive WHERE predicate; null = tainted. */
    column: string | null;
}

interface PairDiff {
    /** True when the two ASTs are identical except for literal *values* (structure preserved). */
    structurallyEqual: boolean;
    /** Sites whose literal value actually differs between the two variants. */
    varyingSites: VaryingSite[];
    /** Set (with a reason) when the pair cannot be analyzed safely — forces a hard refuse. */
    hardRefuse?: string;
}

function isObject(v: AstNode): v is AstObject {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nodeType(v: AstNode): string | undefined {
    return isObject(v) && typeof v.type === 'string' ? v.type : undefined;
}

function isLiteralNode(v: AstNode): boolean {
    const t = nodeType(v);
    return t !== undefined && LITERAL_NODE_TYPES.has(t);
}

/**
 * Resolves a `column_ref` node's bare column name across dialects. SQL Server emits
 * `column` as a string; PostgreSQL emits `column: { expr: { type: 'default', value: 'X' } }`.
 * Returns null for computed/expression columns (which are not clean filter columns).
 */
function columnName(v: AstNode): string | null {
    if (nodeType(v) !== 'column_ref' || !isObject(v)) {
        return null;
    }
    const col = v.column;
    if (typeof col === 'string') {
        return col;
    }
    if (isObject(col) && isObject(col.expr) && typeof col.expr.value === 'string') {
        return col.expr.value;
    }
    return null;
}

/** True when every element of an `expr_list` value array is a literal leaf (an all-literal bag). */
function isAllLiteralBag(v: AstNode): boolean {
    if (nodeType(v) !== 'expr_list' || !isObject(v) || !Array.isArray(v.value)) {
        return false;
    }
    return v.value.length > 0 && v.value.every(isLiteralNode);
}

/** The column attributed to a varying site, given the context it was found in. */
function siteColumn(ctx: WalkCtx): string | null {
    return ctx.topWhere && ctx.conjClean ? ctx.predColumn : null;
}

/** Whether a bag's literal contents differ (length or any element value) between two variants. */
function bagVaries(a: AstObject, b: AstObject): boolean {
    const av = a.value as unknown[];
    const bv = b.value as unknown[];
    if (av.length !== bv.length) {
        return true;
    }
    for (let i = 0; i < av.length; i++) {
        const ai = av[i];
        const bi = bv[i];
        if (isObject(ai) && isObject(bi) && ai.value !== bi.value) {
            return true;
        }
    }
    return false;
}

/** Recursively diffs two AST nodes in lockstep, collecting varying-literal sites. Returns structural equality. */
function walk(a: AstNode, b: AstNode, ctx: WalkCtx, sites: VaryingSite[]): boolean {
    // Both absent.
    if (a == null && b == null) {
        return true;
    }
    if (a == null || b == null) {
        return false;
    }
    // Scalars (operator names, aliases, flags). A mismatch here is a structural difference.
    if (!isObject(a) && !Array.isArray(a)) {
        return a === b;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return walkArray(a, b, ctx, sites);
    }
    // Both objects from here on.
    if (isLiteralNode(a) && isLiteralNode(b)) {
        return walkLiteral(a as AstObject, b as AstObject, ctx, sites);
    }
    if (isAllLiteralBag(a) && isAllLiteralBag(b)) {
        return walkBag(a as AstObject, b as AstObject, ctx, sites);
    }
    const ta = nodeType(a);
    const tb = nodeType(b);
    if (ta !== tb) {
        return false; // shape change (e.g., column_ref → number, select → binary_expr)
    }
    if (ta === 'binary_expr') {
        return walkBinaryExpr(a as AstObject, b as AstObject, ctx, sites);
    }
    if (ta === 'select') {
        // A nested SELECT (subquery / derived table) — its insides are never the top-level WHERE.
        return walkObjectKeys(a as AstObject, b as AstObject, plainSubtreeCtx(), sites);
    }
    return walkObjectKeys(a as AstObject, b as AstObject, plainSubtreeCtx(), sites);
}

/** A context for any subtree that cannot host a clean read-time filter (resets all flags). */
function plainSubtreeCtx(): WalkCtx {
    return { topWhere: false, conjClean: false, predColumn: null };
}

function walkArray(a: AstNode, b: AstNode, ctx: WalkCtx, sites: VaryingSite[]): boolean {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
    }
    let ok = true;
    for (let i = 0; i < a.length; i++) {
        ok = walk(a[i], b[i], ctx, sites) && ok;
    }
    return ok;
}

function walkLiteral(a: AstObject, b: AstObject, ctx: WalkCtx, sites: VaryingSite[]): boolean {
    if (a.type !== b.type) {
        return false; // literal category changed (string ↔ number) — treat as structural
    }
    if (a.value !== b.value) {
        sites.push({ column: siteColumn(ctx) });
    }
    return true;
}

function walkBag(a: AstObject, b: AstObject, ctx: WalkCtx, sites: VaryingSite[]): boolean {
    // Collapse the bag: a differing length/content is allowed *literal* variation, not a shape change.
    if (bagVaries(a, b)) {
        sites.push({ column: siteColumn(ctx) });
    }
    return true;
}

/** Context for the value operand of a clean comparison: keep AND/where flags, attach the column. */
function valueOperandCtx(ctx: WalkCtx, column: string): WalkCtx {
    return { topWhere: ctx.topWhere, conjClean: ctx.conjClean, predColumn: column };
}

/** Context for the column operand (and any non-value child): keep flags, no predicate column. */
function plainOperandCtx(ctx: WalkCtx): WalkCtx {
    return { topWhere: ctx.topWhere, conjClean: ctx.conjClean, predColumn: null };
}

/** Context below a non-AND combinator (`OR`, etc.): still in where, but no longer conjunctive-clean. */
function disjunctiveCtx(ctx: WalkCtx): WalkCtx {
    return { topWhere: ctx.topWhere, conjClean: false, predColumn: null };
}

function walkBinaryExpr(a: AstObject, b: AstObject, ctx: WalkCtx, sites: VaryingSite[]): boolean {
    const op = a.operator;
    if (op !== b.operator || typeof op !== 'string') {
        return false; // operator change is structural
    }
    if (op === 'AND') {
        // Conjunction preserves clean context down both sides.
        const left = walk(a.left, b.left, ctx, sites);
        const right = walk(a.right, b.right, ctx, sites);
        return left && right;
    }
    if (COMPARISON_OPS.has(op)) {
        return walkComparison(a, b, ctx, sites);
    }
    // OR / XOR / any other combinator → descendants are not conjunctive-clean.
    const c = disjunctiveCtx(ctx);
    const left = walk(a.left, b.left, c, sites);
    const right = walk(a.right, b.right, c, sites);
    return left && right;
}

function walkComparison(a: AstObject, b: AstObject, ctx: WalkCtx, sites: VaryingSite[]): boolean {
    const leftCol = columnName(a.left);
    const rightCol = columnName(a.right);
    let leftCtx = plainOperandCtx(ctx);
    let rightCtx = plainOperandCtx(ctx);
    // Attach the predicate column to the *value* side only when exactly one side is a plain column_ref.
    if (leftCol && !rightCol) {
        rightCtx = valueOperandCtx(ctx, leftCol);
    } else if (rightCol && !leftCol) {
        leftCtx = valueOperandCtx(ctx, rightCol);
    }
    const left = walk(a.left, b.left, leftCtx, sites);
    const right = walk(a.right, b.right, rightCtx, sites);
    return left && right;
}

/** Generic structural recursion over an object's keys (ignoring source-location noise). */
function walkObjectKeys(a: AstObject, b: AstObject, childCtx: WalkCtx, sites: VaryingSite[]): boolean {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
    keys.delete('loc');
    let ok = true;
    for (const k of keys) {
        ok = walk(a[k], b[k], childCtx, sites) && ok;
    }
    return ok;
}

/** True for a single plain SELECT that can host a clean top-level WHERE (not a set-op / SELECT INTO). */
function isSimpleSelect(node: AstNode): boolean {
    if (nodeType(node) !== 'select' || !isObject(node)) {
        return false;
    }
    if (node.set_op != null || node._next != null) {
        return false;
    }
    // node-sql-parser always emits `into: { position: null }` on a plain SELECT; only a real
    // SELECT ... INTO sets `into.position`. Treat only the latter as disqualifying.
    const into = node.into;
    if (isObject(into) && into.position != null) {
        return false;
    }
    return true;
}

/** Diffs the two statement roots, applying top-WHERE context only to a simple SELECT's `where`. */
function walkRoot(a: AstNode, b: AstNode, sites: VaryingSite[]): boolean {
    if (nodeType(a) !== nodeType(b)) {
        return false;
    }
    if (isSimpleSelect(a) && isSimpleSelect(b) && isObject(a) && isObject(b)) {
        const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
        keys.delete('loc');
        let ok = true;
        for (const k of keys) {
            const ctx: WalkCtx =
                k === 'where'
                    ? { topWhere: true, conjClean: true, predColumn: null }
                    : plainSubtreeCtx();
            ok = walk(a[k], b[k], ctx, sites) && ok;
        }
        return ok;
    }
    // Non-simple root (set-op, mutation, etc.) — no position can be a clean read-time filter.
    return walk(a, b, plainSubtreeCtx(), sites);
}

/**
 * Returns the sole statement of an AST, or null if it is not exactly one statement.
 * A multi-statement render (e.g. `SELECT …; SELECT …`) cannot be analyzed from one statement —
 * the parameter might act anywhere in the rest — so we refuse rather than inspect only the first.
 */
function soleStatement(ast: AstNode): AstNode | null {
    if (Array.isArray(ast)) {
        return ast.length === 1 ? ast[0] : null;
    }
    return ast;
}

/** Parses and diffs one pair of rendered variants. */
function diffVariantPair(sqlA: string, sqlB: string, dialect: SQLParserDialect): PairDiff {
    const ra = SQLParser.Astify(sqlA, dialect);
    const rb = SQLParser.Astify(sqlB, dialect);
    if (!ra.astParsed || !rb.astParsed || ra.ast == null || rb.ast == null) {
        return { structurallyEqual: false, varyingSites: [], hardRefuse: 'a rendered variant failed to parse — cannot verify; refusing under uncertainty' };
    }
    const aStmt = soleStatement(ra.ast);
    const bStmt = soleStatement(rb.ast);
    if (aStmt == null || bStmt == null) {
        return { structurallyEqual: false, varyingSites: [], hardRefuse: 'a rendered variant is multi-statement — cannot verify a single row-filter; refusing under uncertainty' };
    }
    const sites: VaryingSite[] = [];
    const structurallyEqual = walkRoot(aStmt, bStmt, sites);
    return { structurallyEqual, varyingSites: sites };
}

/**
 * Verifies a single parameter's {@link ParamRole} from ≥2 full-query SQL variants — the same query
 * template rendered with the same values for every parameter *except* this one, which is varied
 * across distinct values. Pure; the Phase 2c adapter supplies the rendered strings.
 *
 * Decision (refuse-under-uncertainty, §10):
 *  - <2 variants, or any variant fails to parse → `Unbounded`.
 *  - any pair differs structurally → `Structural` (shape depends on the value; possibly Bucket 2).
 *  - all pairs structurally equal but no literal varied → `Unbounded` (no observable effect to prove).
 *  - a varying literal is tainted (projection / `OR` / subquery / function / non-top-WHERE) → `Unbounded`.
 *  - varying literals touch >1 column → `Unbounded` (multi-column not modeled in v1).
 *  - else → `RowFilter` on the single bound column.
 */
export function verifyParamRole(variants: string[], dialect: SQLParserDialect): VerifiedParamRole {
    if (!variants || variants.length < 2) {
        return { role: 'Unbounded', reason: 'need at least 2 distinct rendered variants to verify a parameter' };
    }

    const pairs: PairDiff[] = [];
    for (let i = 1; i < variants.length; i++) {
        pairs.push(diffVariantPair(variants[0], variants[i], dialect));
    }

    const refused = pairs.find((p) => p.hardRefuse);
    if (refused) {
        return { role: 'Unbounded', reason: refused.hardRefuse as string };
    }
    if (pairs.some((p) => !p.structurallyEqual)) {
        return { role: 'Structural', reason: 'varying the value changes the SQL shape (different branch/columns/joins) — structural, not a row filter' };
    }

    const allSites = pairs.flatMap((p) => p.varyingSites);
    if (allSites.length === 0) {
        return { role: 'Unbounded', reason: 'varying the value produced no observable SQL change — cannot prove a pure row filter; refusing under uncertainty' };
    }
    if (allSites.some((s) => s.column == null)) {
        return { role: 'Unbounded', reason: 'value varies outside a clean top-level conjunctive WHERE predicate (projection, OR/NOT, subquery, function, or JOIN ON) — not a safe read-time row filter' };
    }

    const distinct = new Map<string, string>(); // lowercased → original casing
    for (const s of allSites) {
        const col = s.column as string;
        const key = col.trim().toLowerCase();
        if (!distinct.has(key)) {
            distinct.set(key, col);
        }
    }
    if (distinct.size > 1) {
        return { role: 'Unbounded', reason: `value affects multiple columns (${[...distinct.values()].join(', ')}) — not modeled in v1; refusing under uncertainty` };
    }

    const filterColumn = [...distinct.values()][0];
    return { role: 'RowFilter', filterColumn, reason: `value varies only a literal at a clean top-level WHERE predicate on "${filterColumn}"` };
}
