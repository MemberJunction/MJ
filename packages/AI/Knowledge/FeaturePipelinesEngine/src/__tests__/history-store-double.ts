/**
 * A Feature Value history double for tests: it keeps each record's last written outputs and reports a write of the
 * same outputs as Unchanged, as `FeatureValueCacheService.RecordFeatureValues` does (same value, reasoning and
 * confidence; empty reasoning and no reasoning are the same, and so are no confidence and null).
 */
import type { RecordFeatureValuesOutcome, RecordFeatureValuesParams } from '@memberjunction/feature-pipelines';

/** Records written per record, and the write function to install as the `RecordFeatureValues` mock. */
export class HistoryStoreDouble {
    /** Each record's last written outputs, normalised as the real store compares them. */
    public readonly Rows = new Map<string, string>();

    /** What the real store compares for one write: each output's value, reasoning and confidence. */
    public static Comparable(params: RecordFeatureValuesParams): string {
        return JSON.stringify(params.outputs.map((o) => [o.featureName, o.value === undefined ? null : o.value, o.reasoning || null, o.confidence ?? null]));
    }

    /** Writes a record's outputs: Unchanged when they equal what the record last held, else Upserted. */
    public readonly Write = async (params: RecordFeatureValuesParams): Promise<RecordFeatureValuesOutcome> => {
        const next = HistoryStoreDouble.Comparable(params);
        const same = this.Rows.get(params.recordID) === next;
        this.Rows.set(params.recordID, next);
        const n = params.outputs.length;
        return same ? { Upserted: 0, Unchanged: n, Previous: {} } : { Upserted: n, Unchanged: 0, Previous: {} };
    };
}
