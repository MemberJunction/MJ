import { MaterializedColumnSpec } from './codeGenDatabaseProvider';
import { SQLParser, SqlDocument, type FromSource, type SQLSelectColumn, type SelectCore, type SqlExpression } from '@memberjunction/sql-parser';
import type { SQLDialect, SQLParserDialect } from '@memberjunction/sql-dialect';
import { IdentifiersEqual, ParseSoleSelect, PathColumn, PathQualifier, type SoleSelect } from './materializationSqlAst';

/**
 * Result-shape + key analysis for query materialization (CodeGen materialization phase,
 * sub-step C — plan/query-entity-materialization.md §4.2 / §5 / §9).
 *
 * This is the deterministic, engine-agnostic core: given a query's declared output shape
 * (its `MJ: Query Fields`) and whether it is parameterized, decide whether it qualifies for
 * materialization in v1 and produce the physical column spec for its materialized table.
 *
 * **v1 scope (Phase 1):** only **unparameterized** queries materialize; parameterized ones
 * are deferred to Phase 2 (row-filter) / later. The single-column key is a **synthetic
 * surrogate** (full-rebuild compatible) — the deterministic combined-key-set hashing in §5
 * is Phase 3 and will replace the surrogate when incremental refresh lands.
 */

/** A query's declared output column (subset of `MJ: Query Fields` relevant to the shape). */
export interface QueryFieldShape {
    /** Output column name. */
    Name: string;
    /** Engine-native SQL type for the column (from `QueryField.SQLFullType`). */
    SQLFullType: string;
    /** Whether the column is a computed expression (informational; still materializable as a snapshot column). */
    IsComputed?: boolean;
}

/** The outcome of analyzing a query for materialization. */
export interface MaterializationAnalysis {
    /** True only if the query can be materialized in v1. */
    qualifies: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** When `qualifies` is false, a human-readable reason (logged, never guessed-past). */
    reason?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    /** Physical column spec for the materialized table (surrogate PK first, then the query's output columns). */
    Columns: MaterializedColumnSpec[];
    /** Name of the synthetic surrogate primary-key column. */
    SurrogateColumnName: string;
}

/**
 * Name of the synthetic surrogate key column added to every query-materialized table in v1.
 * Namespaced to avoid colliding with a query's own output columns.
 */
export const MATERIALIZATION_SURROGATE_COLUMN = '__mj_MaterializedRowID';

/** Default surrogate column SQL type (SQL Server). Callers on other engines pass their own. */
export const DEFAULT_SURROGATE_SQL_TYPE = 'int IDENTITY(1,1)';

/**
 * Analyzes a query for v1 materialization. Pure function — no DB/IO — so it is fully unit-testable.
 *
 * Qualifying rule (§9 / §10, asymmetric-risk: default to NOT materializable when unsure):
 *   - parameterized queries do not qualify in v1 (deferred);
 *   - a query with no declared output fields does not qualify (run query analysis first);
 *   - a query whose output already contains a column named like the surrogate does not qualify
 *     (we won't silently shadow it).
 *
 * On success, returns the column spec with a synthetic surrogate PK prepended; the query's
 * own output columns are emitted as nullable snapshot columns (a snapshot may contain NULLs).
 */
export function AnalyzeQueryForMaterialization(opts: {
    queryName: string;
    isParameterized: boolean;
    fields: QueryFieldShape[];
    /** Engine-specific surrogate column type; defaults to SQL Server's identity. */
    surrogateSQLType?: string;
}): MaterializationAnalysis {
    const surrogateColumnName = MATERIALIZATION_SURROGATE_COLUMN;
    const surrogateSQLType = opts.surrogateSQLType ?? DEFAULT_SURROGATE_SQL_TYPE;
    const fail = (reason: string): MaterializationAnalysis => ({ qualifies: false, reason, Columns: [], SurrogateColumnName: surrogateColumnName });

    if (opts.isParameterized) {
        return fail(`query "${opts.queryName}" is parameterized — not materializable in v1 (deferred to Phase 2)`);
    }
    if (!opts.fields || opts.fields.length === 0) {
        return fail(`query "${opts.queryName}" has no declared output fields — run query field analysis before materializing`);
    }
    if (opts.fields.some((f) => f.Name.trim().toLowerCase() === surrogateColumnName.toLowerCase())) {
        return fail(`query "${opts.queryName}" already has an output column named "${surrogateColumnName}" — cannot add the surrogate key without shadowing it`);
    }

    const surrogate: MaterializedColumnSpec = {
        Name: surrogateColumnName,
        SQLType: surrogateSQLType,
        Nullable: false,
        IsPrimaryKey: true,
    };
    // Query output columns become nullable snapshot columns (the result set may contain NULLs).
    const dataColumns: MaterializedColumnSpec[] = opts.fields.map((f) => ({
        Name: f.Name,
        SQLType: f.SQLFullType,
        Nullable: true,
        IsPrimaryKey: false,
    }));

    return { qualifies: true, Columns: [surrogate, ...dataColumns], SurrogateColumnName: surrogateColumnName };
}

/** @deprecated Use {@link AnalyzeQueryForMaterialization}. */
export function analyzeQueryForMaterialization(opts: {
    queryName: string;
    isParameterized: boolean;
    fields: QueryFieldShape[];
    /** Engine-specific surrogate column type; defaults to SQL Server's identity. */
    surrogateSQLType?: string;
}): MaterializationAnalysis {
    return AnalyzeQueryForMaterialization(opts);
}

// ─── Phase 2: parameterization qualifying (§9 buckets + §10 refuse-under-uncertainty) ─────────

/**
 * Verified role of a single query parameter, produced by the render-and-diff verifier (Phase 2b)
 * with an LLM proposer (Phase 2c). The verifier is the oracle; this module only consumes its
 * verdict — so `RowFilter` here means *proven* row-filter (the render-and-diff confirmed the only
 * difference across param values is a substituted literal at a WHERE predicate on `filterColumn`).
 */
export type ParamRole = 'RowFilter' | 'Structural' | 'Unbounded';

/** Persisted parameterization mode (mirrors the `MaterializedResult.ParamMode` CHECK values). */
export type ParamMode = 'None' | 'RowFilterBroad' | 'PerValueCache' | 'BoundFixed';

/**
 * Phase 2 read-time-injectable operators — the SAFE whitelist. A `column <op> value` predicate in this
 * set can be faithfully re-applied against the broad materialized table with a bound parameter (§3 of the
 * Phase-2 plan). `LIKE`/`IS`/`BETWEEN` and their negations are intentionally EXCLUDED in v1 (subtler
 * pattern/null/two-operand semantics) — a query using them stays live-only, which is harmless (§10).
 */
export const SAFE_READ_FILTER_OPERATORS: ReadonlySet<string> = new Set<string>([
    '=', '!=', '<>', '<', '>', '<=', '>=', 'IN', 'NOT IN',
]);

/**
 * One read-time filter predicate persisted as the contract between CodeGen (classify-time) and the runtime
 * provider (read-time): `column <operator> value(s)` against the broad materialized table. Self-sufficient —
 * the provider consumes this JSON directly and never re-parses the query. Values are ALWAYS bound as SQL
 * parameters at read time (never interpolated), so `column`/`operator` are the only trusted-from-here fields.
 */
export interface ReadFilterSpecEntry {
    /** The materialized output column to filter (proven present in the output at qualify time). */
    column: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The normalized `column <op> value` operator — always one of {@link SAFE_READ_FILTER_OPERATORS}. */
    operator: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** The `MJ: Query Parameter` name whose incoming value binds into this predicate. */
    paramName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** `scalar` → single bound value; `list` → `IN (@p0,@p1,…)` bound element-wise. */
    kind: 'scalar' | 'list';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** One parameter's verified classification (input to {@link qualifyParameterizedQuery}). */
export interface ParamClassification {
    /** Parameter name (the Nunjucks variable). */
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Verified role. `RowFilter` requires `filterColumn`; `Structural` may carry a bounded domain. */
    role: ParamRole;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Bucket 1: the output column the param filters on (must be present in the materialized output). */
    filterColumn?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Bucket 1: the normalized `column <op> value` operator (Phase 2 — required to reconstruct the predicate). */
    filterOperator?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Bucket 1: scalar vs. list (`IN`/`NOT IN`) value shape. */
    filterKind?: 'scalar' | 'list';  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Bucket 2: the verifier-bounded value domain (advisory — the runtime guard still recomputes on a miss). */
    boundedDomain?: string[];  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** The parameterization-qualification decision for a query. */
export interface ParamQualification {
    /** True only if the query's params are all safely materializable. */
    qualifies: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** When `qualifies` is false, a human-readable reason (logged, never guessed past). */
    reason?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
    /** Resolved mode. `None` for an unparameterized query. */
    paramMode: ParamMode;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** RowFilterBroad: the columns to apply as read-time predicates against the broad materialized table (§6.4). */
    rowFilterColumns: string[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /**
     * RowFilterBroad: the structured, self-sufficient predicate spec the runtime provider injects at read time
     * (Phase 2). Empty for every other mode. Persisted as JSON on `MJ: Materialized Results . ReadFilterSpec`.
     */
    readFilterSpec: ReadFilterSpecEntry[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

/**
 * Decides the {@link ParamMode} for a (possibly parameterized) query from its per-param
 * classifications — the §9 qualifying rule under the §10 asymmetric-risk posture
 * (**default to NOT materializable unless every param is provably safe**). Pure — no DB/IO/LLM.
 *
 * Rules:
 *  - no params → `None` (qualifies; caller materializes the static query).
 *  - any `Unbounded` param (Bucket 3) → refuse (author can bind it to a fixed value → BoundFixed,
 *    which arrives here as effectively unparameterized).
 *  - `RowFilter` (Bucket 1) → the `filterColumn` MUST be present in the materialized output, else
 *    refuse (filtering on a projected-away column would be unsound).
 *  - `Structural` (Bucket 2) → only when `allowPerValueCache` is enabled AND the verifier bounded
 *    the domain; otherwise refuse (recompute live). Open decision §17 — defaults OFF.
 *  - a mix of row-filter and structural params is not modeled in v1 → refuse.
 */
export function QualifyParameterizedQuery(opts: {
    queryName: string;
    params: ParamClassification[];
    /** The query's materialized output column names (for the Bucket-1 column-presence check). */
    outputColumns: string[];
    /** Whether Bucket-2 per-value cache is supported in this build (default false → structural recomputes). */
    allowPerValueCache?: boolean;
    /**
     * Whether Bucket-1 row-filter broad materialization is enabled in this build (default false).
     * Phase 2 is not shipped: the read-time row-filter predicate is NOT auto-injected by the provider,
     * so a caller reading a RowFilterBroad materialization must supply the filter themselves (via
     * ExtraFilter) or they get the broad/unfiltered set. To avoid that footgun, parameterized row-filter
     * queries are refused (stay live-only) unless a build explicitly opts in. Flipping this to true is the
     * Phase-2 enablement switch (finalize the read-time predicate injection first).
     */
    allowRowFilterBroad?: boolean;
    /**
     * The query's **rendered** SQL (a concrete instance — parameters already substituted). REQUIRED to
     * qualify a `RowFilter` param: the verifier reports `filterColumn` as a BARE column name, and matching
     * that name against the output-column list alone cannot tell `o.Status` (the predicate) apart from
     * `c.Status` (the projected output) in a join, nor `BillRegion` (an alias over `ShipRegion`) apart from
     * a real `BillRegion` column. Both mis-matches produce a materialized read that filters on a DIFFERENT
     * column than the live query, with no error and no count-guard signal. See
     * {@link proveFilterColumnBinding}. When omitted, RowFilter params are REFUSED (fail closed, §10) —
     * the query stays live-only, which is always correct.
     */
    sql?: string;
    /** Dialect used to parse {@link sql}. Required alongside it; RowFilter params refuse without both. */
    dialect?: SQLParserDialect;
}): ParamQualification {
    const { queryName, params, outputColumns } = opts;
    const allowPerValueCache = opts.allowPerValueCache ?? false;
    const allowRowFilterBroad = opts.allowRowFilterBroad ?? false;
    const refuse = (reason: string): ParamQualification => ({ qualifies: false, reason, paramMode: 'None', rowFilterColumns: [], readFilterSpec: [] });

    if (!params || params.length === 0) {
        return { qualifies: true, paramMode: 'None', rowFilterColumns: [], readFilterSpec: [] };
    }

    const outputSet = new Set(outputColumns.map((c) => c.trim().toLowerCase()));
    const rowFilterColumns: string[] = [];
    const readFilterSpec: ReadFilterSpecEntry[] = [];
    let hasStructural = false;

    for (const p of params) {
        if (p.role === 'Unbounded') {
            return refuse(`query "${queryName}" param "${p.name}" is unbounded/arbitrary structural (Bucket 3) — not materializable; bind it to a fixed value (BoundFixed) to materialize a specific instance`);
        }
        if (p.role === 'Structural') {
            hasStructural = true;
            if (!allowPerValueCache) {
                return refuse(`query "${queryName}" param "${p.name}" is structural (Bucket 2) and per-value cache is disabled — recompute live, not materializable`);
            }
            if (!p.boundedDomain || p.boundedDomain.length === 0) {
                return refuse(`query "${queryName}" param "${p.name}" is structural with no bounded domain — cannot enumerate a per-value cache safely`);
            }
            continue;
        }
        // RowFilter (Bucket 1): the filter column must be physically present in the materialized output (§9/§10).
        if (!p.filterColumn) {
            return refuse(`query "${queryName}" param "${p.name}" classified RowFilter but no filter column was resolved — refusing under uncertainty`);
        }
        if (!outputSet.has(p.filterColumn.trim().toLowerCase())) {
            return refuse(`query "${queryName}" param "${p.name}" filters on column "${p.filterColumn}", which is not in the materialized output — disqualify (or project that column into the query)`);
        }
        // Phase 2 read-time-safety gate: only mint a RowFilterBroad materialization when the operator is
        // provably reconstructable against the broad table with a bound param (§3). Anything outside the
        // whitelist (LIKE/IS/BETWEEN, or an unresolved operator) stays live-only — harmless (§10).
        const op = p.filterOperator;
        if (!op || !SAFE_READ_FILTER_OPERATORS.has(op)) {
            return refuse(`query "${queryName}" param "${p.name}" filters on "${p.filterColumn}" with operator "${op ?? '(unresolved)'}", which is not in the read-time-safe operator set {${[...SAFE_READ_FILTER_OPERATORS].join(', ')}} — deferred; the query stays live-only`);
        }
        // Operator/value-shape consistency: IN/NOT IN must carry a list value; every other op a scalar.
        // A mismatch means our reading is inconsistent → refuse under uncertainty rather than guess.
        const isListOp = op === 'IN' || op === 'NOT IN';
        const expectedKind = isListOp ? 'list' : 'scalar';
        if (p.filterKind !== expectedKind) {
            return refuse(`query "${queryName}" param "${p.name}" operator "${op}" expects a ${expectedKind} value but the verifier reported "${p.filterKind ?? '(none)'}" — refusing under uncertainty`);
        }
        // Qualifier-aware binding proof: the predicate's SOURCE column must provably be the very column the
        // identically-named materialized OUTPUT column carries. A bare-name match is not that proof (join
        // collision / alias rebinding) — and neither is broad-render's removal count, which is exactly 1 in
        // both wrong cases. Without the rendered SQL there is nothing to prove it with → refuse (§10).
        if (!opts.sql || !opts.dialect) {
            return refuse(`query "${queryName}" param "${p.name}" filters on "${p.filterColumn}" but no rendered SQL was supplied to prove that predicate binds to the materialized output column of the same name — refusing under uncertainty (the query stays live-only)`);
        }
        const binding = ProveFilterColumnBinding({ sql: opts.sql, dialect: opts.dialect, filterColumn: p.filterColumn });
        if (!binding.provable) {
            return refuse(`query "${queryName}" param "${p.name}" filters on "${p.filterColumn}" but that predicate cannot be proven to bind to the materialized output column of the same name: ${binding.reason} — a materialized read would filter a different column than the live query. Refusing (the query stays live-only).`);
        }
        rowFilterColumns.push(p.filterColumn);
        readFilterSpec.push({ column: p.filterColumn, operator: op, paramName: p.name, kind: expectedKind });
    }

    if (rowFilterColumns.length > 0 && hasStructural) {
        return refuse(`query "${queryName}" mixes row-filter and structural params — not modeled in v1; refusing under uncertainty`);
    }
    if (hasStructural) {
        return { qualifies: true, paramMode: 'PerValueCache', rowFilterColumns: [], readFilterSpec: [] };
    }
    if (!allowRowFilterBroad) {
        // Enablement switch (Phase 2). When off, refuse row-filter queries to live-only — a defense-in-depth
        // kill switch even though the read-time predicate injection is now implemented in the provider.
        return refuse(`query "${queryName}" has row-filter parameter(s) on [${rowFilterColumns.join(', ')}] (Bucket 1 / RowFilterBroad) — parameterized row-filter materialization is not enabled in this build; the query stays live-only`);
    }
    return { qualifies: true, paramMode: 'RowFilterBroad', rowFilterColumns, readFilterSpec };
}

/** @deprecated Use {@link QualifyParameterizedQuery}. */
export function qualifyParameterizedQuery(opts: {
    queryName: string;
    params: ParamClassification[];
    /** The query's materialized output column names (for the Bucket-1 column-presence check). */
    outputColumns: string[];
    /** Whether Bucket-2 per-value cache is supported in this build (default false → structural recomputes). */
    allowPerValueCache?: boolean;
    /**
     * Whether Bucket-1 row-filter broad materialization is enabled in this build (default false).
     * Phase 2 is not shipped: the read-time row-filter predicate is NOT auto-injected by the provider,
     * so a caller reading a RowFilterBroad materialization must supply the filter themselves (via
     * ExtraFilter) or they get the broad/unfiltered set. To avoid that footgun, parameterized row-filter
     * queries are refused (stay live-only) unless a build explicitly opts in. Flipping this to true is the
     * Phase-2 enablement switch (finalize the read-time predicate injection first).
     */
    allowRowFilterBroad?: boolean;
    /**
     * The query's **rendered** SQL (a concrete instance — parameters already substituted). REQUIRED to
     * qualify a `RowFilter` param: the verifier reports `filterColumn` as a BARE column name, and matching
     * that name against the output-column list alone cannot tell `o.Status` (the predicate) apart from
     * `c.Status` (the projected output) in a join, nor `BillRegion` (an alias over `ShipRegion`) apart from
     * a real `BillRegion` column. Both mis-matches produce a materialized read that filters on a DIFFERENT
     * column than the live query, with no error and no count-guard signal. See
     * {@link proveFilterColumnBinding}. When omitted, RowFilter params are REFUSED (fail closed, §10) —
     * the query stays live-only, which is always correct.
     */
    sql?: string;
    /** Dialect used to parse {@link sql}. Required alongside it; RowFilter params refuse without both. */
    dialect?: SQLParserDialect;
}): ParamQualification {
    return QualifyParameterizedQuery(opts);
}

/** A GROUP BY term that is a plain column reference, split into its qualifier and column. */
interface GroupingColumn {
    /** Table alias / table name qualifying the reference (`o` in `o.Region`); null when unqualified. */
    Qualifier: string | null;
    /** Bare column name (`Region` in `o.Region`). */
    Column: string;
}

/** GROUP BY forms whose grouping sets are not the plain list of terms (rollups, cubes, grouping sets, ALL/DISTINCT). */
const NON_PLAIN_GROUPING = /\b(ROLLUP|CUBE|GROUPING\s+SETS)\b|^\s*GROUP\s+BY\s+(ALL|DISTINCT)\b/i;

/** The column an expression consists of exactly, or null when it is anything else (a function, an operator, a literal). */
function plainGroupingColumn(term: SqlExpression): GroupingColumn | null {
    const paths = term.Identifiers();
    if (paths.length !== 1 || term.FunctionCalls().length > 0) return null;
    const path = paths[0];
    if (path.Span.Start !== term.Span.Start || path.Span.End !== term.Span.End) return null;
    return { Qualifier: PathQualifier(path), Column: PathColumn(path) };
}

/**
 * Reads a SELECT block's GROUP BY terms as plain column references. Returns `[]` (→ no key → full rebuild)
 * when there is no GROUP BY or its form is not a plain list, and null when any term is an expression
 * (`YEAR(date)`, `a + b`, an ordinal) that cannot be reconstructed from the materialized output columns.
 *
 * **Set-operation refusal (soundness-critical)** happens before this is reached, in {@link ParseSoleSelect}:
 * a `UNION` / `EXCEPT` / `INTERSECT` has no single block whose GROUP BY describes the combined result,
 * which legitimately contains one row per (branch × group). Keying the first branch's grouping columns
 * would let the branches collide on the same surrogate hash under the MERGE-upsert Incremental path, and
 * one would silently overwrite the other.
 */
function groupingColumns(sole: SoleSelect): GroupingColumn[] | null {
    const groupBy = sole.Select.GroupBy;
    if (groupBy === null || NON_PLAIN_GROUPING.test(sole.Document.Text(groupBy))) return [];
    const columns: GroupingColumn[] = [];
    for (const term of groupBy.Items) {
        const column = plainGroupingColumn(term);
        if (column === null) return null;
        columns.push(column);
    }
    return columns;
}

/** Number of relations a FROM source reads: each table, derived table or function of a join tree counts. */
function sourceRelationCount(source: FromSource): number {
    switch (source.Kind) {
        case 'Join':
        case 'Apply':
            return sourceRelationCount(source.Left) + sourceRelationCount(source.Right);
        case 'ParenthesizedSource':
            return sourceRelationCount(source.Inner);
        case 'Pivot':
            return sourceRelationCount(source.Source);
        default:
            return 1;
    }
}

/** Number of relations in a SELECT's FROM clause (each JOIN / comma source counts). 0 when there is no FROM. */
function fromSourceCount(select: SelectCore): number {
    return select.From === null ? 0 : select.From.Sources.reduce((sum, source) => sum + sourceRelationCount(source), 0);
}

/**
 * Whether a SELECT-list column reference and another reference to the same bare name (a GROUP BY term, a
 * WHERE predicate operand) provably denote the SAME source column.
 *
 * With a SINGLE FROM relation, every reference to a given name necessarily resolves to that one relation,
 * so the qualifier carries no information and the bare-name match is already a proof. With a JOIN the bare
 * name is ambiguous — `o.Status` and `c.Status` are different columns — so BOTH sides must carry the same
 * explicit qualifier; an unqualified reference on either side is unprovable and refuses (§10).
 */
function sourceRefsMatch(selectQualifier: string | null, refQualifier: string | null, singleSource: boolean): boolean {
    if (singleSource) return true;
    return IdentifiersEqual(selectQualifier, refQualifier);
}

/** Verdict of {@link proveFilterColumnBinding}: provable, or refused with the precise reason. */
export interface FilterColumnBindingProof {
    /** True ONLY when the predicate column is proven to be the same source column the output column carries. */
    provable: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** When not provable, the precise reason (logged; never guessed past). */
    reason?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/**
 * The table qualifiers of every reference to `column` inside the block's WHERE clause (subqueries in it
 * included), in text order. A `null` entry means an unqualified reference. Used to read the WHERE
 * clause's view of a filter column.
 */
function whereColumnQualifiers(sole: SoleSelect, column: string): (string | null)[] {
    const where = sole.Select.Where;
    if (where === null) return [];
    return sole.Document.ColumnReferences().Value
        .filter((ref) => ref.Span.Start >= where.Span.Start && ref.Span.End <= where.Span.End && IdentifiersEqual(ref.Column.Value, column))
        .sort((x, y) => x.Span.Start - y.Span.Start)
        .map((ref) => (ref.Qualifier.length > 0 ? ref.Qualifier[ref.Qualifier.length - 1].Value : null));
}

/**
 * Proves that a verified row-filter predicate on `filterColumn` refers to **exactly** the materialized
 * output column of that same name — the gap a bare-name `outputColumns.includes(filterColumn)` check leaves
 * open, and which nothing downstream can close.
 *
 * Two silently-wrong-data cases motivate it, both of which pass every existing guard (in particular the
 * broad-render count guard, since exactly ONE predicate is stripped in each):
 *
 *  - **Join collision** — `SELECT o.ID, c.Status FROM Orders o JOIN Customers c … WHERE o.Status = {{s}}`.
 *    The output `Status` is the CUSTOMER's; the predicate is the ORDER's. The materialized read emits
 *    `WHERE [Status] = @p0` against the customer's value.
 *  - **Alias rebinding** — `SELECT ID, ShipRegion AS BillRegion FROM Orders WHERE BillRegion = {{r}}` on a
 *    table that has BOTH columns. The materialized `BillRegion` column holds `ShipRegion` values, so the
 *    read filters `ShipRegion = 'East'` while live filters `BillRegion = 'East'`.
 *
 * Refuses (never guesses) unless ALL of the following hold — falling back to the live query, always correct:
 *  1. `sql` parses to a single plain SELECT (not multi-statement, not a set operation — no single branch
 *     of a `UNION` describes the whole result, so nothing about it can be proven from one branch);
 *  2. the SELECT list is readable and not a wildcard (`SELECT *` hides the real output↔source mapping);
 *  3. exactly ONE output column is named `filterColumn` (two would make the read-time predicate ambiguous);
 *  4. that output column is a plain column reference, not a computed expression;
 *  5. it projects the SAME source column name (no alias rebinding);
 *  6. the WHERE clause references `filterColumn` under a single, consistent qualifier; and
 *  7. that qualifier provably denotes the same relation as the output column's — trivially true for a
 *     single-relation FROM, otherwise both must carry the same explicit qualifier ({@link sourceRefsMatch}).
 *
 * Pure — no DB/IO.
 */
export function ProveFilterColumnBinding(opts: {
    /** The query's RENDERED SQL (parameters substituted), still carrying the row-filter predicate. */
    sql: string;
    /** Dialect to parse with. */
    dialect: SQLParserDialect;
    /** The verifier-reported bare filter column name. */
    filterColumn: string;
}): FilterColumnBindingProof {
    const { sql, dialect, filterColumn } = opts;
    const refuse = (reason: string): FilterColumnBindingProof => ({ provable: false, reason });
    if (!sql || sql.trim().length === 0) return refuse('no rendered SQL to analyze');

    const root = ParseSoleSelect(sql, dialect);
    if (root == null) {
        return refuse('the rendered SQL is not a single plain SELECT (multi-statement, non-SELECT, or a UNION/EXCEPT/INTERSECT whose branches are not all visible)');
    }
    const selectCols = SQLParser.ExtractSelectColumnsChecked(sql, dialect).Columns;
    const outputCheck = resolveProvableOutputColumn(selectCols, filterColumn);
    if (!outputCheck.provable) return refuse(outputCheck.reason);
    const output = outputCheck.column;

    const qualifiers = whereColumnQualifiers(root, filterColumn);
    if (qualifiers.length === 0) {
        return refuse(`the WHERE clause of the rendered SQL has no reference to a column named "${filterColumn}"`);
    }
    const distinct = new Set(qualifiers.map((q) => (q == null ? '' : q.trim().toLowerCase())));
    if (distinct.size > 1) {
        return refuse(`the WHERE clause references "${filterColumn}" under ${distinct.size} different table qualifiers — the parameter's predicate cannot be attributed to one of them`);
    }
    const predicateQualifier = qualifiers[0];

    const singleSource = fromSourceCount(root.Select) === 1;
    if (!singleSource && (predicateQualifier == null || output.TableQualifier == null)) {
        return refuse(`the query reads ${fromSourceCount(root.Select)} relations and the ${predicateQualifier == null ? 'WHERE predicate on' : 'SELECT-list projection of'} "${filterColumn}" is unqualified, so the name cannot be attributed to a single source`);
    }
    if (!sourceRefsMatch(output.TableQualifier, predicateQualifier, singleSource)) {
        return refuse(`the WHERE predicate filters "${predicateQualifier}.${filterColumn}" but the output column "${filterColumn}" projects "${output.TableQualifier}.${filterColumn}" — a different source column`);
    }
    return { provable: true };
}

/** @deprecated Use {@link ProveFilterColumnBinding}. */
export function proveFilterColumnBinding(opts: {
    /** The query's RENDERED SQL (parameters substituted), still carrying the row-filter predicate. */
    sql: string;
    /** Dialect to parse with. */
    dialect: SQLParserDialect;
    /** The verifier-reported bare filter column name. */
    filterColumn: string;
}): FilterColumnBindingProof {
    return ProveFilterColumnBinding(opts);
}

/** Either the proven output column, or the reason the projection could not be proven. */
type OutputColumnResolution =
    | { provable: true; column: SQLSelectColumn }
    | { provable: false; reason: string };

/**
 * Resolves the single SELECT-list output column that a read-time filter on `filterColumn` would target,
 * or the reason it is not provably that source column (wildcard projection, duplicate/absent name,
 * computed expression, or an alias rebinding a differently-named source column).
 */
function resolveProvableOutputColumn(selectCols: SQLSelectColumn[], filterColumn: string): OutputColumnResolution {
    const no = (reason: string): OutputColumnResolution => ({ provable: false, reason });
    if (!selectCols || selectCols.length === 0) {
        return no('the SELECT list could not be read');
    }
    if (selectCols.some((c) => c.OutputName === '*')) {
        return no('the query projects a wildcard (SELECT *), so the output-to-source column mapping is unknown');
    }
    const matches = selectCols.filter((c) => IdentifiersEqual(c.OutputName, filterColumn));
    if (matches.length === 0) {
        return no(`no SELECT-list output column is named "${filterColumn}"`);
    }
    if (matches.length > 1) {
        return no(`the SELECT list projects ${matches.length} output columns named "${filterColumn}"`);
    }
    const output = matches[0];
    if (output.IsExpression) {
        return no(`the output column "${filterColumn}" is a computed expression, not a plain projection of a source column`);
    }
    if (!IdentifiersEqual(output.SourceColumn, filterColumn)) {
        return no(`the output column "${filterColumn}" is an ALIAS over source column "${output.SourceColumn}", so filtering the materialized "${filterColumn}" is not the same predicate as the live "${filterColumn}"`);
    }
    return { provable: true, column: output };
}

/**
 * Phase 3: detect the combined KEY of an aggregation query (for the surrogate hash). Conservative and
 * safe-by-default — returns the grouping columns as the key ONLY when it can confidently identify an
 * aggregation whose key is expressible in the materialized output; ANY ambiguity → null, and the caller
 * then uses the synthetic surrogate + full rebuild (always correct, just not incrementally optimizable —
 * the §10 "refuse under uncertainty" bias applied to keying). See the inline comment for the exact rules;
 * the key is built from the parsed GROUP BY terms (not a SELECT-list split), so grouping expressions and
 * grouped-but-unprojected columns both refuse rather than silently producing a too-narrow key.
 */
export function DetectAggregationKeyColumns(opts: {
    sql: string;
    dialect: SQLParserDialect;
    fields: QueryFieldShape[];
}): { name: string; type: string }[] | null {
    const { sql, dialect, fields } = opts;
    if (!/\bgroup\s+by\b/i.test(sql)) return null; // no GROUP BY → not an aggregation key

    // Structural GROUP BY reading — robust vs. splitting
    // the SELECT list, which can't tell a grouping EXPRESSION apart from an aggregate measure. Rules, all
    // biased to refuse (null → synthetic surrogate + full rebuild, always correct; §10 "refuse under
    // uncertainty"): (1) every grouping term must be a bare column reference — an expression grouping term
    // (YEAR(date), a+b, CAST(…)) can't be reconstructed from the materialized output columns; (2) there must
    // be at least one aggregate measure; (3) every grouping column must map to exactly one PROJECTED output
    // column (so the key is expressible in the materialized table — a grouped-but-unprojected column would
    // make the surrogate key too narrow and collide).
    const root = ParseSoleSelect(sql, dialect);
    if (root == null) return null; // unreadable / multi-statement / non-SELECT / set operation → refuse
    const groupByTerms = groupingColumns(root); // null: an expression grouping term → bail
    const selectCols = SQLParser.ExtractSelectColumnsChecked(sql, dialect).Columns;
    if (groupByTerms === null || groupByTerms.length === 0 || selectCols.length === 0) return null;
    if (!selectCols.some((c) => c.IsExpression)) return null; // no aggregate measure → not an aggregation

    // (4) A grouping term is matched to a projected output column by SOURCE COLUMN NAME — which is ambiguous
    // across a join (`GROUP BY o.Region` vs. a projected `c.Region` are different columns). Require the table
    // qualifiers to agree whenever there is more than one FROM relation; see sourceRefsMatch.
    const singleSource = fromSourceCount(root.Select) === 1;
    const fieldByOutput = new Map(fields.map((f) => [f.Name.trim().toLowerCase(), f]));
    const key: { name: string; type: string }[] = [];
    for (const gb of groupByTerms) {
        // The projected (non-expression) SELECT column whose pre-alias source column IS this grouping column.
        const projected = selectCols.filter(
            (c) => !c.IsExpression
                && IdentifiersEqual(c.SourceColumn, gb.Column)
                && sourceRefsMatch(c.TableQualifier, gb.Qualifier, singleSource),
        );
        if (projected.length !== 1) return null; // unprojected (0) or ambiguous (>1) → bail
        const f = fieldByOutput.get(projected[0].OutputName.trim().toLowerCase());
        if (!f) return null; // output column not in the materialized field set → bail
        key.push({ name: f.Name, type: f.SQLFullType });
    }
    return key.length > 0 ? key : null;
}

/** @deprecated Use {@link DetectAggregationKeyColumns}. */
export function detectAggregationKeyColumns(opts: {
    sql: string;
    dialect: SQLParserDialect;
    fields: QueryFieldShape[];
}): { name: string; type: string }[] | null {
    return DetectAggregationKeyColumns(opts);
}

/**
 * Phase 4: is an aggregation's measure set PURELY ADDITIVE (only SUM / plain COUNT)? Drives the
 * refresh-strategy choice: additive keyed aggregations use the MERGE-upsert `Incremental` path
 * (in-place measure update, no row churn), non-additive ones use `DirtyGroupRecompute` (whole-group
 * delete+reinsert). Conservative and safe-by-default: returns false on ANY sign of a non-additive
 * aggregate (`AVG`/`MIN`/`MAX`/`STDEV*`/`VAR*`/`MEDIAN`/`PERCENTILE`/`*_AGG`, or `COUNT(DISTINCT …)`),
 * and requires at least one additive aggregate to be present — anything ambiguous → false (the caller
 * then uses DirtyGroupRecompute, which is correct for all measure types). Regex-based because the SQL
 * parser doesn't expose per-measure expression text; the bias is toward the safe (non-additive) answer.
 */
export function DetectAdditiveMeasures(sql: string): boolean {
    if (!sql) return false;
    const s = sql.replace(/\s+/g, ' ');
    // Any non-additive aggregate present → not purely additive.
    const nonAdditive = /\b(AVG|MIN|MAX|STDEV|STDEVP|VAR|VARP|VARIANCE|MEDIAN|PERCENTILE_CONT|PERCENTILE_DISC|STRING_AGG|ARRAY_AGG|GROUP_CONCAT)\s*\(/i;
    if (nonAdditive.test(s)) return false;
    // SUM(DISTINCT ...) and COUNT(DISTINCT ...) are non-additive — their per-group value can't be delta-combined
    // for an in-place incremental upsert — even though SUM(x)/COUNT(*) are. (AVG/MIN/MAX/etc. are already
    // rejected above regardless of DISTINCT.)
    if (/\b(SUM|COUNT)\s*\(\s*DISTINCT\b/i.test(s)) return false;
    // Require at least one genuinely additive aggregate.
    return /\b(SUM|COUNT)\s*\(/i.test(s);
}

/** @deprecated Use {@link DetectAdditiveMeasures}. */
export function detectAdditiveMeasures(sql: string): boolean {
    return DetectAdditiveMeasures(sql);
}

/** How a materialized query result is refreshed. */
export type MaterializationRefreshStrategy = 'FullRebuild' | 'DirtyGroupRecompute' | 'Incremental';

/**
 * The refresh strategy CodeGen records for a materialized query. A keyed aggregation over exactly
 * one source table can be refreshed in place (`Incremental` when its measures are purely additive,
 * `DirtyGroupRecompute` otherwise); everything else is rebuilt in full. A query that starts with a
 * WITH clause is always rebuilt in full: one watermark on the table its CTEs read cannot localize
 * the groups the outer query builds from them.
 */
export function ChooseMaterializationRefreshStrategy(opts: {
    sql: string;
    dialect: SQLDialect;
    isKeyed: boolean;
}): MaterializationRefreshStrategy {
    const { sql, dialect, isKeyed } = opts;
    if (!isKeyed || !sql) return 'FullRebuild';
    const document = SqlDocument.Parse(sql, dialect);
    // Explicit rule: a CTE-headed query is always rebuilt in full, even over a single table.
    const cteHeaded = document.CTEs().Value.some((cte) => cte.Leading);
    if (cteHeaded || distinctTableCount(document, dialect) !== 1) return 'FullRebuild';
    return DetectAdditiveMeasures(sql) ? 'Incremental' : 'DirtyGroupRecompute';
}

/**
 * How many distinct tables or views a document reads, anywhere in it: CTE references and table-valued
 * functions are not tables, and an unqualified name counts as the dialect's default schema (`dbo` when
 * the dialect names none), so `Orders` and `dbo.Orders` are one table.
 */
function distinctTableCount(document: SqlDocument, dialect: SQLDialect): number {
    const defaultSchema = (dialect.Grammar.DefaultSchema ?? 'dbo').toLowerCase();
    const keys = new Set<string>();
    for (const ref of document.TableReferences().Value) {
        if (ref.Kind !== 'Table' || ref.Source.Kind !== 'Table') continue;
        const table = ref.Name.Parts[ref.Name.Parts.length - 1].Value.toLowerCase();
        keys.add(`${(ref.Schema ?? defaultSchema).toLowerCase()}.${table}`);
    }
    return keys.size;
}
