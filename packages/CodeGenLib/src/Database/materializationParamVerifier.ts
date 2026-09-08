import { SQLParser } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import type { ParamRole } from './materializationAnalysis';
import {
    COMPARISON_OPS, isObject, nodeType, isLiteralNode, columnName, isAllLiteralBag,
    type AstNode, type AstObject,
} from './materializationSqlAst';

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

/** Comparison operator of a proven row filter, normalized so it always reads `column <op> value`. */
export type FilterOperator = '=' | '!=' | '<>' | '<' | '>' | '<=' | '>=' | 'IN' | 'NOT IN' | 'LIKE' | 'NOT LIKE' | 'IS' | 'IS NOT' | 'BETWEEN' | 'NOT BETWEEN';

/** Shape of a proven row-filter value: a single scalar vs. an all-literal list bag (`IN`/`NOT IN`). */
export type FilterKind = 'scalar' | 'list';

/** The verifier's verdict for a single parameter. */
export interface VerifiedParamRole {
    /** Proven role under the §10 asymmetric-risk posture. */
    role: ParamRole;
    /** For `RowFilter`: the single column the value filters on (as written in the predicate). */
    filterColumn?: string;
    /**
     * For `RowFilter`: the comparison operator, **normalized to the `column <op> value` reading** — if the
     * predicate was written `value < column`, the operator is flipped (`>`) so read-time injection can emit
     * `column > value` faithfully. This is the Phase-2 metadata that `filterColumn` alone cannot supply
     * (`Score >= x` vs `Score = x` are otherwise indistinguishable). Absent for non-RowFilter verdicts.
     */
    filterOperator?: FilterOperator;
    /** For `RowFilter`: whether the value is a single scalar or an `IN`/`NOT IN` list bag. */
    filterKind?: FilterKind;
    /** Human-readable justification (logged; never guessed past). */
    reason: string;
}

/** Flips a scalar comparison operator so a `value <op> column` predicate reads canonically as `column <flip> value`. */
function flipOperator(op: string): string {
    switch (op) {
        case '<': return '>';
        case '>': return '<';
        case '<=': return '>=';
        case '>=': return '<=';
        // =, !=, <> are symmetric so need no flip. IN/BETWEEN/IS never appear as `value <op> column`.
        // NOTE: LIKE is NOT symmetric (`value LIKE column` ≠ `column LIKE value`), so this default would
        // MIS-normalize a column-on-right LIKE — safe only because LIKE is excluded from
        // SAFE_READ_FILTER_OPERATORS (refused → live-only) and never reaches read-time injection. If LIKE
        // (or any non-symmetric op) is ever whitelisted, handle its column-on-right form explicitly here.
        default: return op;
    }
}

// AST-walking primitives (AstNode/AstObject, LITERAL_NODE_TYPES, COMPARISON_OPS, isObject, nodeType,
// isLiteralNode, columnName, isAllLiteralBag) live in ./materializationSqlAst — a single source of truth
// shared with broad-render so the "clean RowFilter" classification and the predicate stripper can never
// drift apart (see that module's header).

/** Walk context: where in the tree we are, w.r.t. clean read-time-filterable position. */
interface WalkCtx {
    /** Inside the top-level SELECT's WHERE subtree (not a subquery / other clause). */
    topWhere: boolean;
    /** Reached only through `AND` nodes from the WHERE root (no `OR`/`NOT` above us). */
    conjClean: boolean;
    /** When set, we are the *value* operand of a `column <op> value` predicate on this column. */
    predColumn: string | null;
    /** The comparison operator of the enclosing predicate, normalized to the `column <op> value` reading. */
    predOperator: string | null;
}

/** A literal (or all-literal `IN`/`BETWEEN` bag) whose value differs between two variants. */
interface VaryingSite {
    /** Bound column when the site is a clean top-level conjunctive WHERE predicate; null = tainted. */
    column: string | null;
    /** Normalized `column <op> value` operator for a clean site; null when tainted. */
    operator: string | null;
    /** Whether the varying value is a scalar literal or an all-literal list bag. */
    kind: FilterKind;
}

interface PairDiff {
    /** True when the two ASTs are identical except for literal *values* (structure preserved). */
    structurallyEqual: boolean;
    /** Sites whose literal value actually differs between the two variants. */
    varyingSites: VaryingSite[];
    /** Set (with a reason) when the pair cannot be analyzed safely — forces a hard refuse. */
    hardRefuse?: string;
}

/** The column attributed to a varying site, given the context it was found in. */
function siteColumn(ctx: WalkCtx): string | null {
    return ctx.topWhere && ctx.conjClean ? ctx.predColumn : null;
}

/**
 * Builds a varying site from the walk context. A site is *clean* (read-time-filterable) only inside the
 * top-level conjunctive WHERE as the value operand of a `column <op> value` predicate; otherwise its
 * column/operator are null (tainted → the parameter becomes Unbounded). `kind` records scalar vs list bag.
 */
function makeSite(ctx: WalkCtx, kind: FilterKind): VaryingSite {
    const clean = ctx.topWhere && ctx.conjClean;
    return {
        column: clean ? ctx.predColumn : null,
        operator: clean ? ctx.predOperator : null,
        kind,
    };
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
    return { topWhere: false, conjClean: false, predColumn: null, predOperator: null };
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
        sites.push(makeSite(ctx, 'scalar'));
    }
    return true;
}

function walkBag(a: AstObject, b: AstObject, ctx: WalkCtx, sites: VaryingSite[]): boolean {
    // Collapse the bag: a differing length/content is allowed *literal* variation, not a shape change.
    if (bagVaries(a, b)) {
        sites.push(makeSite(ctx, 'list'));
    }
    return true;
}

/** Context for the value operand of a clean comparison: keep AND/where flags, attach the column + normalized operator. */
function valueOperandCtx(ctx: WalkCtx, column: string, operator: string | null): WalkCtx {
    return { topWhere: ctx.topWhere, conjClean: ctx.conjClean, predColumn: column, predOperator: operator };
}

/** Context for the column operand (and any non-value child): keep flags, no predicate column/operator. */
function plainOperandCtx(ctx: WalkCtx): WalkCtx {
    return { topWhere: ctx.topWhere, conjClean: ctx.conjClean, predColumn: null, predOperator: null };
}

/** Context below a non-AND combinator (`OR`, etc.): still in where, but no longer conjunctive-clean. */
function disjunctiveCtx(ctx: WalkCtx): WalkCtx {
    return { topWhere: ctx.topWhere, conjClean: false, predColumn: null, predOperator: null };
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
    const op = typeof a.operator === 'string' ? a.operator : null;
    const leftCol = columnName(a.left);
    const rightCol = columnName(a.right);
    let leftCtx = plainOperandCtx(ctx);
    let rightCtx = plainOperandCtx(ctx);
    // Attach the predicate column + operator to the *value* side only when exactly one side is a plain
    // column_ref. Normalize the operator to the `column <op> value` reading: when the column is on the
    // RIGHT (`value < column`), flip it so read-time injection emits `column > value` — an un-flipped
    // operator here would invert the predicate and silently over/under-scope the materialized read.
    if (leftCol && !rightCol) {
        rightCtx = valueOperandCtx(ctx, leftCol, op); // column on left → operator as written
    } else if (rightCol && !leftCol) {
        leftCtx = valueOperandCtx(ctx, rightCol, op == null ? null : flipOperator(op));
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
                    ? { topWhere: true, conjClean: true, predColumn: null, predOperator: null }
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

    // Derive the single operator + kind for read-time reconstruction (Phase 2). All clean sites for one
    // parameter must agree — a single parameter can only occupy one predicate position, so >1 distinct
    // operator/kind means our AST reading is ambiguous → refuse under uncertainty (§10) rather than guess.
    const distinctOps = new Set(allSites.map((s) => s.operator).filter((o): o is string => o != null));
    const distinctKinds = new Set(allSites.map((s) => s.kind));
    if (distinctOps.size !== 1 || distinctKinds.size !== 1) {
        return { role: 'Unbounded', reason: `value varies on "${filterColumn}" but the predicate operator/shape is ambiguous (ops: [${[...distinctOps].join(', ')}], kinds: [${[...distinctKinds].join(', ')}]) — refusing under uncertainty` };
    }
    const filterOperator = [...distinctOps][0] as FilterOperator;
    const filterKind = [...distinctKinds][0];
    return { role: 'RowFilter', filterColumn, filterOperator, filterKind, reason: `value varies only a literal at a clean top-level WHERE predicate "${filterColumn} ${filterOperator} <value>" (${filterKind})` };
}
