import { MaterializedColumnSpec } from './codeGenDatabaseProvider';
import { SQLParser, type SQLSelectColumn } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { isObject, nodeType, columnName, type AstNode } from './materializationSqlAst';

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
    qualifies: boolean;
    /** When `qualifies` is false, a human-readable reason (logged, never guessed-past). */
    reason?: string;
    /** Physical column spec for the materialized table (surrogate PK first, then the query's output columns). */
    columns: MaterializedColumnSpec[];
    /** Name of the synthetic surrogate primary-key column. */
    surrogateColumnName: string;
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
export function analyzeQueryForMaterialization(opts: {
    queryName: string;
    isParameterized: boolean;
    fields: QueryFieldShape[];
    /** Engine-specific surrogate column type; defaults to SQL Server's identity. */
    surrogateSQLType?: string;
}): MaterializationAnalysis {
    const surrogateColumnName = MATERIALIZATION_SURROGATE_COLUMN;
    const surrogateSQLType = opts.surrogateSQLType ?? DEFAULT_SURROGATE_SQL_TYPE;
    const fail = (reason: string): MaterializationAnalysis => ({ qualifies: false, reason, columns: [], surrogateColumnName });

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

    return { qualifies: true, columns: [surrogate, ...dataColumns], surrogateColumnName };
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

/** One parameter's verified classification (input to {@link qualifyParameterizedQuery}). */
export interface ParamClassification {
    /** Parameter name (the Nunjucks variable). */
    name: string;
    /** Verified role. `RowFilter` requires `filterColumn`; `Structural` may carry a bounded domain. */
    role: ParamRole;
    /** Bucket 1: the output column the param filters on (must be present in the materialized output). */
    filterColumn?: string;
    /** Bucket 2: the verifier-bounded value domain (advisory — the runtime guard still recomputes on a miss). */
    boundedDomain?: string[];
}

/** The parameterization-qualification decision for a query. */
export interface ParamQualification {
    /** True only if the query's params are all safely materializable. */
    qualifies: boolean;
    /** When `qualifies` is false, a human-readable reason (logged, never guessed past). */
    reason?: string;
    /** Resolved mode. `None` for an unparameterized query. */
    paramMode: ParamMode;
    /** RowFilterBroad: the columns to apply as read-time predicates against the broad materialized table (§6.4). */
    rowFilterColumns: string[];
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
}): ParamQualification {
    const { queryName, params, outputColumns } = opts;
    const allowPerValueCache = opts.allowPerValueCache ?? false;
    const allowRowFilterBroad = opts.allowRowFilterBroad ?? false;
    const refuse = (reason: string): ParamQualification => ({ qualifies: false, reason, paramMode: 'None', rowFilterColumns: [] });

    if (!params || params.length === 0) {
        return { qualifies: true, paramMode: 'None', rowFilterColumns: [] };
    }

    const outputSet = new Set(outputColumns.map((c) => c.trim().toLowerCase()));
    const rowFilterColumns: string[] = [];
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
        rowFilterColumns.push(p.filterColumn);
    }

    if (rowFilterColumns.length > 0 && hasStructural) {
        return refuse(`query "${queryName}" mixes row-filter and structural params — not modeled in v1; refusing under uncertainty`);
    }
    if (hasStructural) {
        return { qualifies: true, paramMode: 'PerValueCache', rowFilterColumns: [] };
    }
    if (!allowRowFilterBroad) {
        // Phase 2 not shipped: the read-time row-filter predicate isn't auto-injected, so materializing
        // broad would let a caller read the unfiltered set. Refuse (stay live-only) until Phase 2 enables it.
        return refuse(`query "${queryName}" has row-filter parameter(s) on [${rowFilterColumns.join(', ')}] (Bucket 1 / RowFilterBroad) — parameterized row-filter materialization is deferred to Phase 2 and not enabled in this build (the read-time predicate is not auto-injected yet); the query stays live-only`);
    }
    return { qualifies: true, paramMode: 'RowFilterBroad', rowFilterColumns };
}

// AST-walking primitives are shared with the param verifier + broad-render via ./materializationSqlAst
// (single source of truth — see that module's header). extractGroupByTerms is GROUP-BY-specific and stays here.
/** Extracts the top-level GROUP BY term nodes, normalizing node-sql-parser's dialect-varying shapes. */
function extractGroupByTerms(sql: string, dialect: SQLParserDialect): AstNode[] {
    const parsed = SQLParser.Astify(sql, dialect);
    if (!parsed.astParsed || parsed.ast == null) return [];
    const stmt = Array.isArray(parsed.ast) ? (parsed.ast.length === 1 ? parsed.ast[0] : null) : parsed.ast;
    if (!isObject(stmt)) return [];
    const gb = stmt.groupby;
    if (isObject(gb) && Array.isArray(gb.columns)) return gb.columns; // observed shape: { columns: [...] }
    if (Array.isArray(gb)) return gb; // some dialects emit a bare array
    if (isObject(gb) && Array.isArray(gb.value)) return gb.value; // …or { value: [...] }
    return [];
}

/**
 * Phase 3: detect the combined KEY of an aggregation query (for the surrogate hash). Conservative and
 * safe-by-default — returns the grouping columns as the key ONLY when it can confidently identify an
 * aggregation whose key is expressible in the materialized output; ANY ambiguity → null, and the caller
 * then uses the synthetic surrogate + full rebuild (always correct, just not incrementally optimizable —
 * the §10 "refuse under uncertainty" bias applied to keying). See the inline comment for the exact rules;
 * the key is built from the AST GROUP BY terms (not a SELECT-list split), so grouping expressions and
 * grouped-but-unprojected columns both refuse rather than silently producing a too-narrow key.
 */
export function detectAggregationKeyColumns(opts: {
    sql: string;
    dialect: SQLParserDialect;
    fields: QueryFieldShape[];
}): { name: string; type: string }[] | null {
    const { sql, dialect, fields } = opts;
    if (!/\bgroup\s+by\b/i.test(sql)) return null; // no GROUP BY → not an aggregation key

    // AST-level GROUP BY extraction (the "hardening follow-up" the heuristic promised) — robust vs. splitting
    // the SELECT list, which can't tell a grouping EXPRESSION apart from an aggregate measure. Rules, all
    // biased to refuse (null → synthetic surrogate + full rebuild, always correct; §10 "refuse under
    // uncertainty"): (1) every grouping term must be a bare column reference — an expression grouping term
    // (YEAR(date), a+b, CAST(…)) can't be reconstructed from the materialized output columns; (2) there must
    // be at least one aggregate measure; (3) every grouping column must map to exactly one PROJECTED output
    // column (so the key is expressible in the materialized table — a grouped-but-unprojected column would
    // make the surrogate key too narrow and collide).
    let groupByTerms: AstNode[];
    let selectCols: SQLSelectColumn[];
    try {
        groupByTerms = extractGroupByTerms(sql, dialect);
        selectCols = SQLParser.ExtractSelectColumns(sql, dialect);
    } catch {
        return null; // unparseable → not keyed (safe: synthetic surrogate + full rebuild)
    }
    if (groupByTerms.length === 0 || !selectCols || selectCols.length === 0) return null;
    if (groupByTerms.some((t) => nodeType(t) !== 'column_ref')) return null; // expression grouping → bail
    if (!selectCols.some((c) => c.IsExpression)) return null; // no aggregate measure → not an aggregation

    const fieldByOutput = new Map(fields.map((f) => [f.Name.trim().toLowerCase(), f]));
    const key: { name: string; type: string }[] = [];
    for (const term of groupByTerms) {
        const gbName = columnName(term);
        if (gbName == null) return null;
        // The projected (non-expression) SELECT column whose pre-alias source column IS this grouping column.
        const projected = selectCols.filter(
            (c) => !c.IsExpression && c.SourceColumn.trim().toLowerCase() === gbName.trim().toLowerCase(),
        );
        if (projected.length !== 1) return null; // unprojected (0) or ambiguous (>1) → bail
        const f = fieldByOutput.get(projected[0].OutputName.trim().toLowerCase());
        if (!f) return null; // output column not in the materialized field set → bail
        key.push({ name: f.Name, type: f.SQLFullType });
    }
    return key.length > 0 ? key : null;
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
export function detectAdditiveMeasures(sql: string): boolean {
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
