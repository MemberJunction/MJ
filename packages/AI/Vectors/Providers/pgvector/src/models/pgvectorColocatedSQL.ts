/**
 * @fileoverview Pure SQL builders for the colocated pgvector provider.
 *
 * Functional core: every function here takes data in and returns data out (a
 * `{ sql, params }` pair, a string, a number) with no I/O. The provider
 * (`PgVectorColocatedDatabase`) is the imperative shell that executes them via the
 * borrowed host connection. Keeping the SQL generation pure makes it directly
 * unit-testable with plain assertions and no database.
 *
 * @module @memberjunction/ai-vectors-pgvector
 */

/** Reciprocal-rank-fusion constant. Standard value from the RRF paper (Cormack et al.). */
export const RRF_K = 60;

/** Map from the MJ metric enum to the pgvector distance operator used in `ORDER BY`. */
export const METRIC_OPERATOR_MAP: Readonly<Record<string, string>> = {
    cosine: '<=>',
    euclidean: '<->',
    dotproduct: '<#>',
};

/** Map from the MJ metric enum to the pgvector HNSW index operator class. */
export const METRIC_OPS_CLASS_MAP: Readonly<Record<string, string>> = {
    cosine: 'vector_cosine_ops',
    euclidean: 'vector_l2_ops',
    dotproduct: 'vector_ip_ops',
};

/** System metadata keys excluded from the derived keyword content corpus. */
const NON_CONTENT_KEYS: ReadonlySet<string> = new Set([
    'RecordID', 'Entity', 'TemplateID', 'EntityIcon', '__mj_UpdatedAt', 'SourceType',
]);

/** Resolve the distance operator for a metric, defaulting to cosine's. */
export function MetricOperator(metric: string): string {
    return METRIC_OPERATOR_MAP[metric] ?? '<=>';
}

/** Resolve the HNSW operator class for a metric, defaulting to cosine's. */
export function MetricOpsClass(metric: string): string {
    return METRIC_OPS_CLASS_MAP[metric] ?? 'vector_cosine_ops';
}

/** Format a number array as a pgvector literal, e.g. `[0.1,0.2,0.3]`. */
export function VectorLiteral(values: ReadonlyArray<number>): string {
    return `[${values.join(',')}]`;
}

/** Clamp a row limit to a safe positive integer before interpolating into `LIMIT N`
 *  (guards against NaN/float/negative/Infinity producing malformed SQL). */
export function SafeTopK(topK: number, max = 10000): number {
    return Math.max(1, Math.min(max, Math.floor(Number(topK) || 1)));
}

/** Parse a pgvector text representation like `"[0.1,0.2,0.3]"` into a number array. */
export function ParseVectorString(vectorStr: string | null | undefined): number[] {
    if (!vectorStr) {
        return [];
    }
    const trimmed = vectorStr.replace(/^\[/, '').replace(/\]$/, '');
    return trimmed.length === 0 ? [] : trimmed.split(',').map(Number);
}

/**
 * Convert a raw distance value to a similarity score (higher = more similar).
 *  - cosine distance [0,2] → 1 - distance
 *  - euclidean distance [0,∞) → 1 / (1 + distance)
 *  - dotproduct: pgvector `<#>` returns the negative inner product, so negate it
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

/**
 * Derive a keyword-search corpus from a record's metadata by concatenating its
 * human-readable string values, skipping system keys. Used to populate the `content`
 * column when the sync pipeline doesn't supply an explicit document text.
 */
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

/** A parameterized SQL fragment: a clause string plus its ordered parameter values. */
export interface SqlFragment {
    /** The clause text (without a leading `WHERE`), or empty string if no conditions. */
    clause: string;
    /** Positional parameter values, in `$startIndex` order. */
    params: unknown[];
}

/**
 * Build a metadata `WHERE` fragment from a filter object against the JSONB `metadata` column.
 * Supports the internal `_pgvectorConditions` envelope (from `BuildMetadataFilter`) and the
 * generic `{ field: value }` / `{ field: { $eq | $in } }` shapes. Mirrors the external
 * `PgVectorDatabase.BuildFilterClause` semantics so colocated and external results match.
 *
 * @param filter The opaque filter object from the query options.
 * @param startParamIndex The first `$N` index available for this fragment's params.
 */
export function BuildFilterFragment(filter: object | undefined, startParamIndex: number): SqlFragment {
    if (!filter) {
        return { clause: '', params: [] };
    }

    const filterRecord = filter as Record<string, unknown>;
    const parts: string[] = [];
    const params: unknown[] = [];
    let idx = startParamIndex;

    if (filterRecord['_pgvectorConditions']) {
        const conditions = filterRecord['_pgvectorConditions'] as Array<{
            Field: string; Operator: string; Value: string | string[] | number;
        }>;
        for (const cond of conditions) {
            switch (cond.Operator) {
                case 'in': {
                    if (!Array.isArray(cond.Value)) {
                        throw new Error(`Filter operator 'in' requires an array value for field ${JSON.stringify(cond.Field)}`);
                    }
                    const placeholders = cond.Value.map((_v, i) => `$${idx + i}`).join(', ');
                    parts.push(`metadata->>$${idx + cond.Value.length} IN (${placeholders})`);
                    params.push(...cond.Value, cond.Field);
                    idx += cond.Value.length + 1;
                    break;
                }
                case 'eq':
                case 'contains':
                    parts.push(`metadata->>$${idx} = $${idx + 1}`);
                    params.push(cond.Field, String(cond.Value));
                    idx += 2;
                    break;
                default:
                    // Never silently drop a condition — that would widen the result set vs. intent.
                    throw new Error(`Unsupported filter operator ${JSON.stringify(cond.Operator)} for field ${JSON.stringify(cond.Field)}`);
            }
        }
    } else {
        for (const [key, value] of Object.entries(filterRecord)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const opRecord = value as Record<string, unknown>;
                if (opRecord['$eq'] != null) {
                    parts.push(`metadata->>$${idx} = $${idx + 1}`);
                    params.push(key, String(opRecord['$eq']));
                    idx += 2;
                } else if (Array.isArray(opRecord['$in'])) {
                    const values = opRecord['$in'] as string[];
                    const placeholders = values.map((_v, i) => `$${idx + 1 + i}`).join(', ');
                    parts.push(`metadata->>$${idx} IN (${placeholders})`);
                    params.push(key, ...values);
                    idx += 1 + values.length;
                } else {
                    throw new Error(`Unsupported filter for field ${JSON.stringify(key)}: expected $eq or $in, got ${JSON.stringify(Object.keys(opRecord))}`);
                }
            } else {
                parts.push(`metadata->>$${idx} = $${idx + 1}`);
                params.push(key, String(value));
                idx += 2;
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

/** Inputs to {@link BuildColocatedQuery}. `qualifiedTable` is the schema-qualified table name. */
export interface ColocatedQueryBuild {
    qualifiedTable: string;
    metric: string;
    vector?: ReadonlyArray<number>;
    keyword?: string;
    topK: number;
    filter?: object;
    fusion?: 'rrf' | 'vector-only' | 'keyword-only';
    includeValues?: boolean;
    includeMetadata?: boolean;
}

/** Decide which fusion mode actually applies given the inputs present. */
export function ResolveFusion(build: ColocatedQueryBuild): 'rrf' | 'vector-only' | 'keyword-only' {
    const hasVector = !!build.vector && build.vector.length > 0;
    const hasKeyword = !!build.keyword && build.keyword.trim().length > 0;
    if (build.fusion === 'vector-only' || (!hasKeyword && hasVector)) {
        return 'vector-only';
    }
    if (build.fusion === 'keyword-only' || (!hasVector && hasKeyword)) {
        return 'keyword-only';
    }
    return 'rrf';
}

/**
 * Build the colocated query SQL + params. Returns one of three shapes depending on which
 * components are present: pure vector ANN, pure keyword full-text, or an RRF-fused hybrid.
 *
 * The result rows always expose `id`, `score`, and (unless suppressed) `metadata`; when
 * `includeValues` is set they also expose `embedding_text`.
 */
export function BuildColocatedQuery(build: ColocatedQueryBuild): BuiltQuery {
    const mode = ResolveFusion(build);
    const tbl = build.qualifiedTable;
    const includeMetadata = build.includeMetadata !== false;
    const includeValues = build.includeValues === true;
    const metaSelect = includeMetadata ? ', metadata' : '';
    const valSelect = includeValues ? ', embedding::text AS embedding_text' : '';
    const k = SafeTopK(build.topK);

    if (mode === 'vector-only') {
        const op = MetricOperator(build.metric);
        const filterFrag = BuildFilterFragment(build.filter, 2);
        const where = filterFrag.clause ? `WHERE ${filterFrag.clause}` : '';
        const sql =
            `SELECT id${metaSelect}${valSelect}, embedding ${op} $1::vector AS distance\n` +
            `FROM ${tbl}\n` +
            `${where}\n` +
            `ORDER BY embedding ${op} $1::vector\n` +
            `LIMIT ${k}`;
        return { sql, params: [VectorLiteral(build.vector ?? []), ...filterFrag.params] };
    }

    if (mode === 'keyword-only') {
        const filterFrag = BuildFilterFragment(build.filter, 2);
        const extra = filterFrag.clause ? `AND ${filterFrag.clause}` : '';
        const sql =
            `SELECT id${metaSelect}${valSelect}, ts_rank(tsv, q) AS score\n` +
            `FROM ${tbl}, websearch_to_tsquery('english', $1) q\n` +
            `WHERE tsv @@ q ${extra}\n` +
            `ORDER BY score DESC\n` +
            `LIMIT ${k}`;
        return { sql, params: [build.keyword ?? '', ...filterFrag.params] };
    }

    // ── Hybrid: RRF fuse a vector ANN list and a keyword full-text list ──
    // Params: $1 vector, $2 keyword, then the filter params duplicated across both CTEs.
    const op = MetricOperator(build.metric);
    const innerK = SafeTopK(build.topK * 4);
    const vecFilter = BuildFilterFragment(build.filter, 3);
    const kwFilter = BuildFilterFragment(build.filter, 3 + vecFilter.params.length);
    const vecWhere = vecFilter.clause ? `WHERE ${vecFilter.clause}` : '';
    const kwWhere = kwFilter.clause ? `AND ${kwFilter.clause}` : '';
    const finalVal = includeValues ? ', t.embedding::text AS embedding_text' : '';
    const finalMeta = includeMetadata ? ', t.metadata' : '';

    const sql =
        `WITH vec AS (\n` +
        `  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding ${op} $1::vector) AS rnk\n` +
        `  FROM ${tbl}\n` +
        `  ${vecWhere}\n` +
        `  ORDER BY embedding ${op} $1::vector\n` +
        `  LIMIT ${innerK}\n` +
        `),\n` +
        `kw AS (\n` +
        `  SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank(tsv, q) DESC) AS rnk\n` +
        `  FROM ${tbl}, websearch_to_tsquery('english', $2) q\n` +
        `  WHERE tsv @@ q ${kwWhere}\n` +
        `  ORDER BY ts_rank(tsv, q) DESC\n` +
        `  LIMIT ${innerK}\n` +
        `)\n` +
        `SELECT t.id${finalMeta}${finalVal},\n` +
        `       COALESCE(1.0/(${RRF_K} + vec.rnk), 0) + COALESCE(1.0/(${RRF_K} + kw.rnk), 0) AS score\n` +
        `FROM ${tbl} t\n` +
        `LEFT JOIN vec ON vec.id = t.id\n` +
        `LEFT JOIN kw ON kw.id = t.id\n` +
        `WHERE vec.id IS NOT NULL OR kw.id IS NOT NULL\n` +
        `ORDER BY score DESC\n` +
        `LIMIT ${k}`;

    return {
        sql,
        params: [VectorLiteral(build.vector ?? []), build.keyword ?? '', ...vecFilter.params, ...kwFilter.params],
    };
}
