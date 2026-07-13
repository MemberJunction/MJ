/**
 * @fileoverview Pure SQL builders for the SQL Server 2025 native colocated vector provider.
 *
 * Functional core — pure functions, no I/O. The provider executes them via the borrowed host
 * connection. SQL Server 2025 introduces the `VECTOR(N)` type, the `VECTOR_SEARCH` DiskANN
 * table-valued function, and `VECTOR_DISTANCE`. Positional params bind as `@p0..@pN` (see
 * `SQLServerDataProvider.RunColocatedSQL`); `@p0` is always the query-vector JSON.
 *
 * The SQL shapes here are backported from a production-verified SQL Server 2025 implementation.
 * Key hard-won lessons encoded below:
 *
 *  - **Use `VECTOR_SEARCH` + `SELECT TOP (N) WITH APPROXIMATE`, never `ORDER BY VECTOR_DISTANCE`.**
 *    The latter does NOT engage the DiskANN vector index — measured >60s vs ~50ms (≈1000×).
 *  - **`SIMILAR_TO` requires a DECLARED `VECTOR` variable**, not an inline `CAST(...)` — the
 *    parser rejects the cast there. So every search batch is `DECLARE @qv ...; SELECT ...`.
 *  - **`TOP (N)` must be a literal**, not a bound parameter (binding throws "Incorrect syntax
 *    near '('"). N is integer-clamped here before interpolation — no injection vector.
 *  - **`WITH APPROXIMATE` is incompatible with `OFFSET/FETCH`** — ANN search can't paginate.
 *  - **Emit only the filter predicates actually in play** — the `(@p IS NULL OR col=@p)` guard
 *    confuses the cardinality estimator into a clustered-index scan (sub-second → 30s+).
 *  - **Filtered ANN convergence**: when a metadata filter's row cluster doesn't intersect the
 *    query vector's neighborhood, DiskANN runs to timeout. Below a cardinality threshold we
 *    switch to an exact `VECTOR_DISTANCE` CTE (brute force over the filtered set) instead.
 *
 * NOTE: this provider is **untested at runtime** pending a SQL Server 2025 instance. The pure
 * builders below are unit-tested for SQL shape; the I/O paths require live verification.
 *
 * @module @memberjunction/ai-vectors-sqlserver
 */
import { ValidateSqlIdentifier } from '@memberjunction/ai-vectordb';

/** SQL Server major version that first ships the native `VECTOR` type (2025). */
export const SQLSERVER_2025_MAJOR_VERSION = 17;

/**
 * Default cardinality threshold for the filtered-query dispatch: at or below this many
 * filter-matching rows, use the exact iterative-filter path; above it, use DiskANN.
 */
export const DEFAULT_ITERATIVE_FILTER_THRESHOLD = 50000;

/** Where the vectors physically live relative to MJ's entities. */
export type SqlServerStorageMode = 'sibling' | 'entityColumn';

/** Map the MJ metric enum to the SQL Server distance-function / index metric name. */
export const METRIC_DISTANCE_FN: Readonly<Record<string, string>> = {
    cosine: 'cosine',
    euclidean: 'euclidean',
    dotproduct: 'dot',
};

/** Resolve the SQL Server distance metric name for a metric, defaulting to cosine. */
export function MetricDistanceFn(metric: string): string {
    return METRIC_DISTANCE_FN[metric] ?? 'cosine';
}

/**
 * Convert a `VECTOR_DISTANCE` value to a similarity score (higher = more similar), mirroring
 * the pgvector provider's semantics so cross-store results are comparable.
 */
export function DistanceToScore(distance: number, metric: string): number {
    switch (metric) {
        case 'euclidean':
            return 1 / (1 + distance);
        case 'dotproduct':
            return -distance;
        case 'cosine':
        default:
            return 1 - distance;
    }
}

/** Format a number array as the JSON-array string SQL Server casts to `VECTOR(N)`. */
export function VectorJson(values: ReadonlyArray<number>): string {
    return JSON.stringify([...values]);
}

/** Parse a SQL Server vector JSON string (e.g. `"[0.1,0.2]"`) into a number array. */
export function ParseVectorJson(value: string | null | undefined): number[] {
    if (!value) {
        return [];
    }
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
        return [];
    }
}

/** System metadata keys excluded from the derived keyword content corpus. */
const NON_CONTENT_KEYS: ReadonlySet<string> = new Set([
    'RecordID', 'Entity', 'TemplateID', 'EntityIcon', '__mj_UpdatedAt', 'SourceType',
]);

/** Derive a keyword corpus from metadata string values (mirrors the pgvector provider). */
export function DeriveContent(metadata: Record<string, unknown> | undefined): string {
    if (!metadata) {
        return '';
    }
    return Object.entries(metadata)
        .filter(([key, value]) => !NON_CONTENT_KEYS.has(key) && value != null)
        .map(([, value]) => (Array.isArray(value) ? value.join(' ') : String(value)))
        .filter(part => part.trim().length > 0)
        .join(' ');
}

/** Clamp a requested topK to a safe positive integer for literal interpolation into `TOP (N)`. */
export function SafeTopK(topK: number, max = 1000): number {
    return Math.max(1, Math.min(max, Math.floor(Number(topK) || 1)));
}

/**
 * Describes the physical target a query runs against — the sibling table MJ manages, or an
 * existing VECTOR column on an entity table (the migration shape for systems that already store
 * embeddings on their own tables).
 */
export interface SqlServerIndexTarget {
    /** Schema-qualified table the vectors live in, already bracket-quoted (e.g. `[__mj].[vec_x]`). */
    qualifiedTable: string;
    /** The VECTOR column name (sibling: `embedding`; entityColumn: e.g. `Embedding`). */
    vectorColumn: string;
    /** The key/id column projected as `id` (sibling: `id`; entityColumn: e.g. `ID`). */
    keyColumn: string;
    /** Extra columns returned with each match (sibling: `['metadata']`; entityColumn: entity cols). */
    selectColumns: ReadonlyArray<string>;
    /** How a filter field resolves to SQL: JSON on the metadata column, or a live entity column. */
    filterMode: 'jsonMetadata' | 'column';
}

/** Validate an entity column/identifier (throws on anything not allow-listed) before bracket-quoting. */
function safeColumn(field: string): string {
    return ValidateSqlIdentifier(field, 'column');
}

/** Build the SQL LHS for a filter field given the target's filter mode (alias is always `c`).
 *  column mode → a live entity column (identifier-validated); jsonMetadata mode → a JSON path on the
 *  `metadata` string column, where the key is data inside a single-quoted literal (quote-doubled, so
 *  no SQL break-out — a bare identifier allow-list there would wrongly reject field names with spaces). */
function filterColumnRef(field: string, mode: 'jsonMetadata' | 'column'): string {
    if (mode === 'column') {
        return `c.[${safeColumn(field)}]`;
    }
    return `JSON_VALUE(c.metadata, '$.${field.replace(/'/g, "''")}')`;
}

/** A parameterized SQL fragment for SQL Server (`@pN` placeholders). */
export interface SqlServerFragment {
    /** Clause text without a leading `WHERE`/`AND`, or empty string if no conditions. */
    clause: string;
    /** Positional parameter values, in `@p${startIndex}` order. */
    params: unknown[];
}

/**
 * Build a metadata `WHERE` fragment. In `jsonMetadata` mode fields resolve via `JSON_VALUE` on
 * the sibling table's `metadata` column; in `column` mode they resolve to live entity columns
 * (`c.[Field]`) — which is what lets entityColumn-mode filters hit current relational values.
 * Supports the `_pgvectorConditions` envelope and the generic `{field:value}` / `{$eq}` / `{$in}`
 * shapes, matching the pgvector provider's filter semantics.
 */
export function BuildFilterFragment(
    filter: object | undefined,
    startParamIndex: number,
    mode: 'jsonMetadata' | 'column'
): SqlServerFragment {
    if (!filter) {
        return { clause: '', params: [] };
    }
    const filterRecord = filter as Record<string, unknown>;
    const parts: string[] = [];
    const params: unknown[] = [];
    let idx = startParamIndex;

    const pushEq = (field: string, value: string): void => {
        parts.push(`${filterColumnRef(field, mode)} = @p${idx}`);
        params.push(value);
        idx += 1;
    };
    const pushIn = (field: string, values: ReadonlyArray<string>): void => {
        const placeholders = values.map(() => `@p${idx++}`).join(', ');
        parts.push(`${filterColumnRef(field, mode)} IN (${placeholders})`);
        params.push(...values);
    };

    if (filterRecord['_pgvectorConditions']) {
        const conditions = filterRecord['_pgvectorConditions'] as Array<{
            Field: string; Operator: string; Value: string | string[] | number;
        }>;
        for (const cond of conditions) {
            switch (cond.Operator) {
                case 'in':
                    if (!Array.isArray(cond.Value)) {
                        throw new Error(`Filter operator 'in' requires an array value for field ${JSON.stringify(cond.Field)}`);
                    }
                    pushIn(cond.Field, cond.Value);
                    break;
                case 'eq':
                case 'contains':
                    pushEq(cond.Field, String(cond.Value));
                    break;
                default:
                    // Never silently drop a condition — that would widen the result set vs. the caller's intent.
                    throw new Error(`Unsupported filter operator ${JSON.stringify(cond.Operator)} for field ${JSON.stringify(cond.Field)}`);
            }
        }
    } else {
        for (const [key, value] of Object.entries(filterRecord)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const opRecord = value as Record<string, unknown>;
                if (opRecord['$eq'] != null) {
                    pushEq(key, String(opRecord['$eq']));
                } else if (Array.isArray(opRecord['$in'])) {
                    pushIn(key, opRecord['$in'] as string[]);
                } else {
                    throw new Error(`Unsupported filter for field ${JSON.stringify(key)}: expected $eq or $in, got ${JSON.stringify(Object.keys(opRecord))}`);
                }
            } else {
                pushEq(key, String(value));
            }
        }
    }

    return { clause: parts.length > 0 ? parts.join(' AND ') : '', params };
}

/** A fully-built parameterized statement. */
export interface BuiltQuery {
    sql: string;
    params: unknown[];
}

/** Shared inputs to the vector query builders. */
export interface SqlServerQueryBuild {
    target: SqlServerIndexTarget;
    dimension: number;
    metric: string;
    vector: ReadonlyArray<number>;
    topK: number;
    filter?: object;
}

/** Render the projected select list (`c.[key] AS id, c.[col] AS [col], ...`) for the TVF/CTE inner select. */
function innerProjection(target: SqlServerIndexTarget): string {
    const cols = target.selectColumns.map(col => `c.[${safeColumn(col)}] AS [${safeColumn(col)}]`);
    return [`c.[${safeColumn(target.keyColumn)}] AS id`, ...cols].join(', ');
}

/** Render the outer projection (column names only) for the exact-CTE outer select. */
function outerProjection(target: SqlServerIndexTarget): string {
    const cols = target.selectColumns.map(col => `[${safeColumn(col)}]`);
    return ['id', ...cols].join(', ');
}

/**
 * Build the **approximate** (DiskANN) vector query using the `VECTOR_SEARCH` TVF. This is the
 * fast path — it engages the vector index. Filters apply as an outer `WHERE` on the TVF row
 * alias `c`. `@p0` is the query-vector JSON; filter params follow at `@p1`.
 */
export function BuildApproximateVectorQuery(build: SqlServerQueryBuild): BuiltQuery {
    const { target } = build;
    const fn = MetricDistanceFn(build.metric);
    const k = SafeTopK(build.topK);
    const filterFrag = BuildFilterFragment(build.filter, 1, target.filterMode);
    const where = filterFrag.clause ? `WHERE ${filterFrag.clause}` : '';

    const sql =
        `DECLARE @qv VECTOR(${build.dimension}) = CAST(@p0 AS VECTOR(${build.dimension}));\n` +
        `SELECT TOP (${k}) WITH APPROXIMATE\n` +
        `  ${innerProjection(target)}, vs.distance AS distance\n` +
        `FROM VECTOR_SEARCH(\n` +
        `  TABLE = ${target.qualifiedTable} AS c,\n` +
        `  COLUMN = [${safeColumn(target.vectorColumn)}],\n` +
        `  SIMILAR_TO = @qv,\n` +
        `  METRIC = '${fn}'\n` +
        `) AS vs\n` +
        `${where}\n` +
        `ORDER BY vs.distance ASC`;

    return { sql, params: [VectorJson(build.vector), ...filterFrag.params] };
}

/**
 * Build the **exact** iterative-filter query: pre-filter on a B-tree index, then compute
 * `VECTOR_DISTANCE` per surviving row in a CTE. Bypasses DiskANN entirely — used when a filter's
 * matching set is small enough that brute force beats ANN's non-convergence on disjoint clusters.
 * The `vectorColumn IS NOT NULL` guard keeps null-embedding rows out. `@p0` is the query vector.
 * `WITH (NOLOCK)` is an intentional perf choice for a read-only similarity scan — it permits dirty
 * reads, acceptable for ranked search where exact transactional consistency isn't required.
 */
export function BuildExactVectorQuery(build: SqlServerQueryBuild): BuiltQuery {
    const { target } = build;
    const fn = MetricDistanceFn(build.metric);
    const k = SafeTopK(build.topK);
    const filterFrag = BuildFilterFragment(build.filter, 1, target.filterMode);
    const innerWhere = [
        `c.[${safeColumn(target.vectorColumn)}] IS NOT NULL`,
        ...(filterFrag.clause ? [filterFrag.clause] : []),
    ].join(' AND ');

    const sql =
        `DECLARE @qv VECTOR(${build.dimension}) = CAST(@p0 AS VECTOR(${build.dimension}));\n` +
        `WITH FilteredCandidates AS (\n` +
        `  SELECT ${innerProjection(target)},\n` +
        `         VECTOR_DISTANCE('${fn}', @qv, c.[${safeColumn(target.vectorColumn)}]) AS distance\n` +
        `  FROM ${target.qualifiedTable} c WITH (NOLOCK)\n` +
        `  WHERE ${innerWhere}\n` +
        `)\n` +
        `SELECT TOP (${k}) ${outerProjection(target)}, distance\n` +
        `FROM FilteredCandidates\n` +
        `ORDER BY distance ASC`;

    return { sql, params: [VectorJson(build.vector), ...filterFrag.params] };
}

/**
 * Build the cardinality COUNT used by the dispatch logic to choose exact vs. approximate.
 * Deliberately omits the `vectorColumn IS NOT NULL` predicate (forcing a per-row lookup of the
 * VECTOR column would defeat the covering index — the missing-vector rows are immaterial to the
 * threshold decision). Returns no params when there's no filter.
 */
export function BuildFilterCountQuery(target: SqlServerIndexTarget, filter: object | undefined): BuiltQuery {
    const filterFrag = BuildFilterFragment(filter, 0, target.filterMode);
    const where = filterFrag.clause ? `WHERE ${filterFrag.clause}` : '';
    const sql =
        `SELECT COUNT(*) AS n FROM ${target.qualifiedTable} c WITH (NOLOCK)\n` +
        `${where}`;
    return { sql, params: filterFrag.params };
}
