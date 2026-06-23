import { MaterializedColumnSpec } from './codeGenDatabaseProvider';

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
