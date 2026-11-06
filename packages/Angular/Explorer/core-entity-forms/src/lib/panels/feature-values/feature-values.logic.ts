/**
 * Pure logic for the generic Feature Values panel. No Angular imports so it is
 * unit-testable in isolation.
 */
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';

/** One row of the `MJ: Feature Values` view as returned by a simple RunView. */
export interface FeatureValueRow {
    ID: string;
    RecordProcessID: string;
    /** The producing pipeline's display name. */
    RecordProcess: string | null;
    FeatureName: string;
    ValueText: string | null;
    ValueNumeric: number | null;
    ValueBoolean: boolean | number | string | null;
    ValueDate: string | Date | null;
    ValueJSON: string | null;
    Source: MJFeatureValueEntity['Source'];
    Confidence: number | null;
    PipelineVersion: number | null;
    ComputedAt: string | Date | null;
    Reasoning: string | null;
    ProcessRunID: string | null;
}

/** The latest value of one feature from one pipeline, ready to render. */
export interface FeatureValueCard {
    Key: string;
    Pipeline: string;
    RecordProcessID: string;
    FeatureName: string;
    /** The value to show; "no value" when the pipeline's latest answer withheld or cleared the value. */
    DisplayValue: string;
    /** False when the latest row is valueless (an abstention or a cleared value). */
    HasValue: boolean;
    Source: MJFeatureValueEntity['Source'];
    Confidence: number | null;
    PipelineVersion: number | null;
    ComputedAt: Date | null;
    Reasoning: string | null;
    RowID: string;
}

/** True for null and undefined alike. `unknown` because a view row's column may be absent as well as null. */
function isNullish(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

function toDate(value: string | Date | null | undefined): Date | null {
    if (isNullish(value)) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function time(row: FeatureValueRow): number {
    return toDate(row.ComputedAt)?.getTime() ?? 0;
}

function keyOf(recordProcessID: string, featureName: string): string {
    return `${recordProcessID}|${featureName}`;
}

export class FeatureValuesPanelModel {
    /** Human-readable value: number, Yes/No, ISO date part, compact JSON, or text. Empty when valueless. */
    public static DisplayValue(row: FeatureValueRow): string {
        if (!isNullish(row.ValueNumeric)) return String(row.ValueNumeric);
        if (!isNullish(row.ValueBoolean)) {
            const v: boolean | number | string = row.ValueBoolean;
            return v === true || v === 1 || v === '1' ? 'Yes' : 'No';
        }
        if (!isNullish(row.ValueDate)) {
            const d = toDate(row.ValueDate);
            return d ? d.toISOString().slice(0, 10) : String(row.ValueDate);
        }
        if (!isNullish(row.ValueJSON) && row.ValueJSON !== '') {
            const parsed = SafeJSONParse<unknown>(row.ValueJSON);
            return parsed !== null ? JSON.stringify(parsed) : row.ValueJSON;
        }
        if (!isNullish(row.ValueText)) return row.ValueText;
        return '';
    }

    /** A row's display value; "no value" for a valueless row (an abstention or a cleared value). */
    public static HistoryValue(row: FeatureValueRow): string {
        return FeatureValuesPanelModel.hasValue(row) ? FeatureValuesPanelModel.DisplayValue(row) : 'no value';
    }

    private static hasValue(row: FeatureValueRow): boolean {
        return !isNullish(row.ValueNumeric) || !isNullish(row.ValueBoolean) || !isNullish(row.ValueDate)
            || (!isNullish(row.ValueJSON) && row.ValueJSON !== '') || !isNullish(row.ValueText);
    }

    /**
     * Newest row per (RecordProcessID, FeatureName), valued or not. A valueless row is the
     * pipeline's latest answer too — it withheld (below its confidence floor, or the input no
     * longer states the fact) or a person cleared the value — so it supersedes an older value
     * rather than letting that value stand as if it were current. The card then reads
     * "no value" and carries the row's reasoning and confidence.
     */
    public static Latest(rows: FeatureValueRow[]): FeatureValueCard[] {
        const best = new Map<string, FeatureValueRow>();
        for (const row of rows) {
            const key = keyOf(row.RecordProcessID, row.FeatureName);
            const current = best.get(key);
            if (!current || time(row) > time(current)) best.set(key, row);
        }
        return [...best.entries()].map(([key, row]) => ({
            Key: key,
            Pipeline: row.RecordProcess ?? '',
            RecordProcessID: row.RecordProcessID,
            FeatureName: row.FeatureName,
            DisplayValue: FeatureValuesPanelModel.HistoryValue(row),
            HasValue: FeatureValuesPanelModel.hasValue(row),
            Source: row.Source,
            Confidence: row.Confidence,
            PipelineVersion: row.PipelineVersion,
            ComputedAt: toDate(row.ComputedAt),
            Reasoning: row.Reasoning,
            RowID: row.ID,
        }));
    }

    /** Other rows for the card's pipeline+feature, newest first, excluding the card's own row. */
    public static History(rows: FeatureValueRow[], card: FeatureValueCard): FeatureValueRow[] {
        return rows
            .filter(r => !UUIDsEqual(r.ID, card.RowID) && keyOf(r.RecordProcessID, r.FeatureName) === card.Key)
            .sort((a, b) => time(b) - time(a));
    }
}
