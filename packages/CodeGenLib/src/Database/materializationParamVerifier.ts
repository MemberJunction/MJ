import { SqlDocument, type IdentifierPath, type SqlToken } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import type { ParamRole } from './materializationAnalysis';
import {
    IsReadableCondition, LiteralCategoryOf, LiteralListClose, PathColumn, ReadComparison, ReadConditionTree, ToParserDialect,
    type ConditionLeaf, type ConditionNode,
} from './materializationSqlAst';

/**
 * Phase 2b — the render-and-diff verifier (the structural oracle for query parameterization).
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
    role: ParamRole;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** For `RowFilter`: the single column the value filters on (as written in the predicate). */
    filterColumn?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /**
     * For `RowFilter`: the comparison operator, **normalized to the `column <op> value` reading** — if the
     * predicate was written `value < column`, the operator is flipped (`>`) so read-time injection can emit
     * `column > value` faithfully. This is the Phase-2 metadata that `filterColumn` alone cannot supply
     * (`Score >= x` vs `Score = x` are otherwise indistinguishable). Absent for non-RowFilter verdicts.
     */
    filterOperator?: FilterOperator;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** For `RowFilter`: whether the value is a single scalar or an `IN`/`NOT IN` list bag. */
    filterKind?: FilterKind;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Human-readable justification (logged; never guessed past). */
    reason: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

// The conjunct reader (ReadConditionTree / ReadComparison) and the literal readers live in
// ./materializationSqlAst — a single source of truth shared with broad-render, so the "clean RowFilter"
// classification and the predicate remover can never drift apart (see that module's header).

/** A literal (or all-literal `IN (…)` list) whose value differs between two variants. */
interface VaryingSite {
    /** Bound column when the site is a clean top-level conjunctive WHERE predicate; null = tainted. */
    column: string | null;
    /** Normalized `column <op> value` operator for a clean site; null when tainted. */
    operator: string | null;
    /** Whether the varying value is a scalar literal or a list of literals. */
    kind: FilterKind;
}

interface PairDiff {
    /** True when the two variants are identical except for literal *values* (structure preserved). */
    structurallyEqual: boolean;
    /** Sites whose literal value actually differs between the two variants. */
    varyingSites: VaryingSite[];
    /** Set (with a reason) when the pair cannot be analyzed safely — forces a hard refuse. */
    hardRefuse?: string;
}

/** The top-level WHERE of a variant whose statement is one plain SELECT block (no set operation, no INTO). */
interface CleanWhere {
    /** The condition's significant tokens. */
    Tokens: readonly SqlToken[];
    /** The condition read as AND-ed conjuncts. */
    Tree: ConditionNode;
    /** The condition's identifier paths (nested subqueries excluded). */
    Paths: readonly IdentifierPath[];
}

/** One parsed variant: its significant tokens, and its top-level WHERE when a literal there can be a clean row filter. */
interface ParsedVariant {
    Tokens: readonly SqlToken[];
    Where: CleanWhere | null;
}

/** A literal position whose value differs: its index in the first variant's tokens, and its shape. */
interface DiffSite {
    Index: number;
    Kind: FilterKind;
}

/** Result of comparing two variants' tokens. */
interface TokenDiff {
    /** True when the tokens agree everywhere except literal values. */
    Equal: boolean;
    Sites: DiffSite[];
}

/** One aligned step of a token comparison: where each side continues, and whether a literal value differed. */
interface DiffStep {
    NextA: number;
    NextB: number;
    Varies: boolean;
    Kind: FilterKind;
}

/**
 * The top-level WHERE of a document whose statement is one plain SELECT block; null for anything else
 * (a set operation, `SELECT … INTO`, a statement that is not a query, a SELECT with no WHERE or with a
 * WHERE that is not one condition). A literal
 * outside the returned condition is never a clean read-time filter.
 */
function cleanWhereOf(document: SqlDocument): CleanWhere | null {
    const statement = document.Statements[0];
    const top = document.TopLevelQuery();
    if (statement === undefined || statement.StatementKind !== 'Select' || top === null || top.Kind !== 'Select') {
        return null;
    }
    if (top.Into !== null || top.Where === null) {
        return null;
    }
    const tokens = top.Where.Condition.Tokens();
    if (!IsReadableCondition(tokens)) {
        return null;
    }
    return { Tokens: tokens, Tree: ReadConditionTree(tokens), Paths: top.Where.Condition.Identifiers() };
}

/**
 * Keywords that can stand before a `(` without making it an argument list. A literal list after one of
 * these is compared token by token (so `WHERE ('a') = Status` against `WHERE ('a', 'b') = Status` is a
 * change of shape), never as one list whose length may vary.
 */
const NON_LIST_KEYWORDS = new Set<string>([
    'SELECT', 'WHERE', 'AND', 'OR', 'NOT', 'ON', 'HAVING', 'QUALIFY', 'WHEN', 'THEN', 'ELSE', 'CASE', 'LIKE',
    'BETWEEN', 'IS', 'AS', 'FROM', 'JOIN', 'BY', 'TOP', 'DISTINCT', 'ALL', 'ANY', 'SOME', 'EXISTS', 'UNION',
    'EXCEPT', 'INTERSECT', 'RETURN',
]);

/**
 * Where a list of literals starting at `open` closes, when it is a list whose length a varying value may
 * change: the list of `IN (…)`, `VALUES (…)` or a function call's arguments. -1 otherwise.
 */
function literalListAt(tokens: readonly SqlToken[], open: number): number {
    const before = tokens[open - 1];
    const listOpener = before !== undefined
        && (before.Kind === 'QuotedIdentifier' || (before.Kind === 'Word' && !NON_LIST_KEYWORDS.has(before.Text.toUpperCase())));
    return listOpener ? LiteralListClose(tokens, open) : -1;
}

/** When the tokens at `i` are the literal bounds `a AND b` of a `BETWEEN`, the index after them; -1 otherwise. */
function betweenBoundsAt(tokens: readonly SqlToken[], i: number): number {
    const before = tokens[i - 1];
    if (before === undefined || before.Kind !== 'Word' || before.Text.toUpperCase() !== 'BETWEEN') {
        return -1;
    }
    const and = tokens[i + 1];
    const bounded = LiteralCategoryOf(tokens[i]) !== null && and !== undefined && and.Kind === 'Word'
        && and.Text.toUpperCase() === 'AND' && LiteralCategoryOf(tokens[i + 2]) !== null;
    return bounded ? i + 3 : -1;
}

/** The end of a literal unit compared as a whole at `i` (a literal list, or BETWEEN bounds); -1 when none starts there. */
function literalUnitEnd(tokens: readonly SqlToken[], i: number): number {
    const listClose = literalListAt(tokens, i);
    return listClose >= 0 ? listClose + 1 : betweenBoundsAt(tokens, i);
}

function tokenTexts(tokens: readonly SqlToken[], start: number, end: number): string {
    return tokens.slice(start, end).map((t) => t.Text).join('\u0000');
}

/**
 * Compares the tokens at `a[i]` and `b[j]`. A literal list (`IN (…)`, a call's arguments) and the literal
 * bounds of a `BETWEEN` are each compared as one unit, so a list's length may vary; two literals of the
 * same category may differ in value; anything else must be identical. Returns null on a difference of shape.
 */
function diffStep(a: readonly SqlToken[], i: number, b: readonly SqlToken[], j: number): DiffStep | null {
    const unitA = literalUnitEnd(a, i);
    const unitB = literalUnitEnd(b, j);
    if (unitA >= 0 && unitB >= 0) {
        const varies = tokenTexts(a, i, unitA) !== tokenTexts(b, j, unitB);
        return { NextA: unitA, NextB: unitB, Varies: varies, Kind: 'list' };
    }
    const categoryA = LiteralCategoryOf(a[i]);
    const categoryB = LiteralCategoryOf(b[j]);
    if (categoryA !== null && categoryB !== null) {
        // A literal whose category changes (string ↔ number) is a change of shape.
        return categoryA === categoryB ? { NextA: i + 1, NextB: j + 1, Varies: a[i].Text !== b[j].Text, Kind: 'scalar' } : null;
    }
    const same = a[i].Kind === b[j].Kind && a[i].Text === b[j].Text;
    return same ? { NextA: i + 1, NextB: j + 1, Varies: false, Kind: 'scalar' } : null;
}

/** Walks two variants' significant tokens in lockstep, collecting the literal positions whose value differs. */
function diffTokens(a: readonly SqlToken[], b: readonly SqlToken[]): TokenDiff {
    const sites: DiffSite[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        const step = diffStep(a, i, b, j);
        if (step === null) {
            return { Equal: false, Sites: sites };
        }
        if (step.Varies) {
            sites.push({ Index: i, Kind: step.Kind });
        }
        i = step.NextA;
        j = step.NextB;
    }
    return { Equal: i === a.length && j === b.length, Sites: sites };
}

/** The leaf conjunct holding token `index`, or null when the index is not inside one. */
function leafContaining(node: ConditionNode, index: number): ConditionLeaf | null {
    if (node.Kind === 'Leaf') {
        return node;
    }
    const child = node.Children.find((c) => index >= c.Start && index < c.End);
    return child === undefined ? null : leafContaining(child, index);
}

/**
 * Attributes a varying literal to its predicate. It is *clean* (read-time-filterable) only as the value
 * side of a `column <op> literal` conjunct reached from the top-level WHERE through AND alone; anywhere
 * else (projection, `OR`/`NOT`, subquery, function, `JOIN … ON`, HAVING) its column and operator are null.
 */
function siteAt(variant: ParsedVariant, site: DiffSite): VaryingSite {
    const tainted: VaryingSite = { column: null, operator: null, kind: site.Kind };
    const where = variant.Where;
    if (where === null) {
        return tainted;
    }
    const offset = variant.Tokens[site.Index].Span.Start;
    const local = where.Tokens.findIndex((t) => t.Span.Start === offset);
    const leaf = local < 0 ? null : leafContaining(where.Tree, local);
    const predicate = leaf === null ? null : ReadComparison(where.Tokens, leaf.InnerStart, leaf.InnerEnd, where.Paths);
    if (predicate === null || local < predicate.ValueStart || local >= predicate.ValueEnd) {
        return tainted;
    }
    return { column: PathColumn(predicate.Column), operator: predicate.Operator, kind: predicate.ValueKind };
}

function parseVariant(sql: string, dialect: SQLParserDialect): SqlDocument {
    return SqlDocument.Parse(sql, ToParserDialect(dialect));
}

/** Parses and diffs one pair of rendered variants. */
function diffVariantPair(sqlA: string, sqlB: string, dialect: SQLParserDialect): PairDiff {
    const docA = parseVariant(sqlA, dialect);
    const docB = parseVariant(sqlB, dialect);
    if (!docA.IsComplete || !docB.IsComplete) {
        return { structurallyEqual: false, varyingSites: [], hardRefuse: 'a rendered variant failed to parse — cannot verify; refusing under uncertainty' };
    }
    // A multi-statement render (e.g. `SELECT …; SELECT …`) cannot be analyzed from one statement — the
    // parameter might act anywhere in the rest — so refuse rather than inspect only the first.
    if (docA.HasStackedStatements().Value || docB.HasStackedStatements().Value) {
        return { structurallyEqual: false, varyingSites: [], hardRefuse: 'a rendered variant is multi-statement — cannot verify a single row-filter; refusing under uncertainty' };
    }
    const variantA: ParsedVariant = { Tokens: docA.Tokens.Significant(), Where: cleanWhereOf(docA) };
    const diff = diffTokens(variantA.Tokens, docB.Tokens.Significant());
    return { structurallyEqual: diff.Equal, varyingSites: diff.Sites.map((s) => siteAt(variantA, s)) };
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
export function VerifyParamRole(variants: string[], dialect: SQLParserDialect): VerifiedParamRole {
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
    // operator/kind means our reading is ambiguous → refuse under uncertainty (§10) rather than guess.
    const distinctOps = new Set(allSites.map((s) => s.operator).filter((o): o is string => o != null));
    const distinctKinds = new Set(allSites.map((s) => s.kind));
    if (distinctOps.size !== 1 || distinctKinds.size !== 1) {
        return { role: 'Unbounded', reason: `value varies on "${filterColumn}" but the predicate operator/shape is ambiguous (ops: [${[...distinctOps].join(', ')}], kinds: [${[...distinctKinds].join(', ')}]) — refusing under uncertainty` };
    }
    const filterOperator = [...distinctOps][0] as FilterOperator;
    const filterKind = [...distinctKinds][0];
    return { role: 'RowFilter', filterColumn, filterOperator, filterKind, reason: `value varies only a literal at a clean top-level WHERE predicate "${filterColumn} ${filterOperator} <value>" (${filterKind})` };
}

/** @deprecated Use {@link VerifyParamRole}. */
export function verifyParamRole(variants: string[], dialect: SQLParserDialect): VerifiedParamRole {
    return VerifyParamRole(variants, dialect);
}
