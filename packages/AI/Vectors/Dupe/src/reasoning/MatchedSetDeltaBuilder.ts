/**
 * @fileoverview Projects a matched set's field-level comparison into the lean shape the
 * reasoning template expects ({@link ReasoningFieldDelta}).
 *
 * The record loading + field selection + delta computation lives **once** in
 * `RecordComparisonEngine` (`@memberjunction/record-comparison`) — a low-level package
 * both this dupe package and the server/UI comparison path can depend on without a build
 * cycle. This adapter is the thin dupe-specific projection over that single engine:
 *
 *   - it calls {@link RecordComparisonEngine.CompareRecordsForEntity} with the already-resolved
 *     `EntityInfo` and the detector's request-scoped `RunView` (so no redundant metadata
 *     lookup and no second RunView), then
 *   - keeps only the **differing** fields (the reasoner wants signal, not noise — the engine
 *     already drops fields that are empty across every record) and
 *   - flattens each cell to `{ RecordID: <key string>, Value: <stringified> }`.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { RunView, CompositeKey, EntityInfo, UserInfo } from '@memberjunction/core';
import {
    RecordComparisonEngine,
    RecordComparisonResult,
    RecordFieldValue,
} from '@memberjunction/record-comparison';
import { ReasoningFieldDelta } from './DuplicateReasoningTypes';

/**
 * The result of building a matched set's deltas: the differing-field deltas the reasoner
 * consumes, plus a record-id → human label map (derived from the same loaded records) so the
 * caller can give the source AND candidates real names instead of raw GUIDs in the prompt.
 */
export interface MatchedSetDelta {
    /** Differing-field deltas (the reasoning payload). */
    FieldDeltas: ReasoningFieldDelta[];
    /** record-key string ({@link CompositeKey.Values}) → display label (name-field value, else key). */
    Labels: Map<string, string>;
}

/**
 * Builds the differing-field deltas for a matched set by delegating to the shared
 * {@link RecordComparisonEngine} and projecting the result into {@link ReasoningFieldDelta}.
 */
export class MatchedSetDeltaBuilder {
    private readonly runView: RunView;

    /**
     * @param runView a RunView bound to the detector's request-scoped provider; threaded
     *   into the comparison engine so the load happens on the correct connection.
     */
    constructor(runView: RunView) {
        this.runView = runView;
    }

    /**
     * Build the field deltas for a matched set.
     *
     * @param entityInfo the entity being deduped (already resolved by the detector)
     * @param keys the source key first, then each candidate key (order preserved)
     * @param contextUser the run's context user
     * @returns the differing-field deltas plus a record-id → label map; empty on load failure
     */
    public async Build(
        entityInfo: EntityInfo,
        keys: CompositeKey[],
        contextUser?: UserInfo
    ): Promise<MatchedSetDelta> {
        if (keys.length === 0) {
            return { FieldDeltas: [], Labels: new Map() };
        }
        const engine = new RecordComparisonEngine();
        const result = await engine.CompareRecordsForEntity(entityInfo, keys, contextUser, {
            RunViewInstance: this.runView,
        });
        if (!result.Success) {
            return { FieldDeltas: [], Labels: new Map() };
        }
        return { FieldDeltas: this.project(result), Labels: this.buildLabels(result) };
    }

    /**
     * Map each loaded record's key string to its display label (the engine resolves the
     * name-field value, falling back to the key). Lets the reasoner address records by name.
     */
    protected buildLabels(result: RecordComparisonResult): Map<string, string> {
        const labels = new Map<string, string>();
        for (const record of result.Records) {
            labels.set(record.Key.Values(), record.Label);
        }
        return labels;
    }

    /**
     * Project the engine's rich delta matrix into the reasoning contract: differing fields
     * only, each cell flattened to its record-key string + stringified value.
     */
    protected project(result: RecordComparisonResult): ReasoningFieldDelta[] {
        // Column index → record-key string. This is the same addressing the reasoner uses to
        // refer back to records (CompositeKey.Values()), so field choices resolve cleanly.
        const recordIdByColumn = result.Records.map(r => r.Key.Values());

        const deltas: ReasoningFieldDelta[] = [];
        for (const field of result.Fields) {
            if (!field.Differs) {
                continue;
            }
            deltas.push({
                FieldName: field.FieldName,
                Values: field.Cells.map(cell => ({
                    RecordID: recordIdByColumn[cell.ColumnIndex],
                    Value: this.toStringValue(cell.Value),
                })),
            });
        }
        return deltas;
    }

    /** Stringify a loaded value for the prompt; null/undefined → null. */
    protected toStringValue(value: RecordFieldValue): string | null {
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }
}
