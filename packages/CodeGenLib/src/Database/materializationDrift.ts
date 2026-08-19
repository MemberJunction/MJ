/**
 * Phase 4: materialization drift detection (plan §13 + §17.2 "flag-and-hold").
 *
 * A materialization snapshots a specific source shape. When CodeGen re-syncs entity metadata to the
 * live schema, a source entity/field a materialization depends on may have been dropped, renamed, or
 * reshaped — leaving the materialized table out of sync with what its source now produces. Per §17.2
 * the policy is FLAG-AND-HOLD: mark the row `DriftHold` and stop refreshing (surface for review),
 * never silently auto-rebuild.
 *
 * This module is the pure decision core: given already-resolved existence facts (gathered against the
 * freshly-synced metadata by the CodeGen orchestration), decide whether a materialization has drifted
 * and why. No DB/IO — fully unit-testable.
 */

/** Resolved drift-relevant facts for one materialization (gathered against current metadata). */
export interface MaterializationDriftFacts {
    sourceType: 'Query' | 'EntityBaseView';
    /** EntityBaseView case (1:1 copy of a source entity). */
    baseView?: {
        /** The source entity (SourceEntityID) still resolves in current metadata. */
        sourceEntityExists: boolean;
        /** Current field names on the source entity. */
        currentEntityFields: string[];
        /** The materialized table's current columns (what the snapshot was actually built with). */
        materializedColumns: string[];
    };
    /** Query case (provenance via QueryEntity / QueryField / QueryDependency). */
    query?: {
        /** Names/IDs of QueryEntity source entities that no longer exist. */
        missingSourceEntities: string[];
        /** `Entity.Field` provenance refs (QueryField.SourceEntityID+SourceFieldName) that no longer resolve. */
        missingSourceFields: string[];
        /** Composed inner queries (QueryDependency.DependsOnQueryID) that no longer exist. */
        missingComposedQueries: string[];
        /** The query's CURRENT declared output column names (MJ: Query Fields). Empty when unknown / not yet
         *  analyzed — the output-shape check is then skipped (can't judge → don't false-flag). */
        currentOutputColumns: string[];
        /** The materialized table's current DATA columns, with the synthetic surrogate PK and any `__mj_*`
         *  system columns already excluded. Empty when the table can't be introspected — shape check skipped. */
        materializedColumns: string[];
    };
}

/** The drift verdict for one materialization. */
export interface MaterializationDriftVerdict {
    drift: boolean;
    reason?: string;
}

const lc = (s: string) => s.trim().toLowerCase();

/**
 * Decides whether a materialization has drifted from its source. Pure.
 *
 * Base-view (1:1): drift if the source entity is gone, or its current field set no longer matches the
 * columns the snapshot was built with (a field added/removed/renamed on the source).
 * Query: drift if any provenance dependency is broken — a source entity removed, a mapped source field
 * removed/renamed, or a composed inner query removed. Provenance refs with unknown source (no
 * SourceEntityID/SourceFieldName) are NOT judged here (the orchestration excludes them) to avoid false
 * positives from incomplete provenance — the §10 bias runs the other way for drift (only flag on a
 * definite broken dependency).
 */
export function evaluateMaterializationDrift(facts: MaterializationDriftFacts): MaterializationDriftVerdict {
    if (facts.sourceType === 'EntityBaseView' && facts.baseView) {
        const bv = facts.baseView;
        if (!bv.sourceEntityExists) {
            return { drift: true, reason: 'source entity no longer exists' };
        }
        // Skip the shape comparison when EITHER set is empty (mirrors the Query branch): an empty
        // materializedColumns — the table couldn't be introspected under the CodeGen connection (transient
        // failure, permission/visibility edge) — would otherwise make every source field look 'added' and
        // false-flag DriftHold on a materialization that has not actually drifted (§10: only flag on a
        // definite mismatch). currentEntityFields is never empty for a resolved entity, but guard it for symmetry.
        if (bv.materializedColumns.length === 0 || bv.currentEntityFields.length === 0) {
            return { drift: false };
        }
        const cur = new Set(bv.currentEntityFields.map(lc));
        const mat = new Set(bv.materializedColumns.map(lc));
        const added = [...cur].filter((c) => !mat.has(c));
        const removed = [...mat].filter((c) => !cur.has(c));
        if (added.length || removed.length) {
            return {
                drift: true,
                reason: `base-view shape changed vs the snapshot (source added: [${added.join(', ')}]; snapshot has orphaned: [${removed.join(', ')}])`,
            };
        }
        return { drift: false };
    }

    if (facts.sourceType === 'Query' && facts.query) {
        const q = facts.query;
        if (q.missingSourceEntities.length) {
            return { drift: true, reason: `source entit${q.missingSourceEntities.length === 1 ? 'y' : 'ies'} removed: [${q.missingSourceEntities.join(', ')}]` };
        }
        if (q.missingSourceFields.length) {
            return { drift: true, reason: `source field${q.missingSourceFields.length === 1 ? '' : 's'} removed/renamed: [${q.missingSourceFields.join(', ')}]` };
        }
        if (q.missingComposedQueries.length) {
            return { drift: true, reason: `composed inner quer${q.missingComposedQueries.length === 1 ? 'y' : 'ies'} removed: [${q.missingComposedQueries.join(', ')}]` };
        }
        // Output-shape drift: the physical table is create-if-absent (no ALTER path), so an edit to the query's
        // SELECT list (add/rename/remove an output column) while all source entities/fields still exist would
        // otherwise go undetected and serve the OLD column set forever. Compare the query's current output
        // columns against the snapshot's data columns — but ONLY when both are known (skip if either is empty:
        // a query whose fields aren't analyzed yet, or a table we couldn't introspect, must not be false-flagged
        // — the §10 "only flag on a definite mismatch" bias).
        if (q.currentOutputColumns.length && q.materializedColumns.length) {
            const cur = new Set(q.currentOutputColumns.map(lc));
            const mat = new Set(q.materializedColumns.map(lc));
            const added = [...cur].filter((c) => !mat.has(c));
            const removed = [...mat].filter((c) => !cur.has(c));
            if (added.length || removed.length) {
                return {
                    drift: true,
                    reason: `query output shape changed vs the snapshot (query added: [${added.join(', ')}]; snapshot has orphaned: [${removed.join(', ')}]) — the create-if-absent table was not rebuilt`,
                };
            }
        }
        return { drift: false };
    }

    return { drift: false };
}
