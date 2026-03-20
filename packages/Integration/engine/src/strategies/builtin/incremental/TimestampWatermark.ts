/**
 * Timestamp-based watermark strategy for incremental sync.
 * Uses a datetime field on external records to filter for records modified
 * since the last sync. Extracts the maximum timestamp as the new watermark.
 */
import type { IncrementalSyncStrategy } from '../../IncrementalSyncStrategy.js';
import type { ExternalRecord } from '../../../types.js';

export class TimestampWatermark implements IncrementalSyncStrategy {
    public readonly Type = 'Timestamp' as const;
    public readonly WatermarkFieldName: string;
    public readonly SupportsDeleteDetection = false;

    private readonly filterParamName: string;

    /**
     * @param watermarkFieldName - the field name on external records that holds the last-modified timestamp
     *                             (e.g., 'hs_lastmodifieddate', 'SystemModStamp')
     * @param filterParamName - the query parameter name to use when filtering by watermark
     *                          (defaults to the same value as watermarkFieldName)
     */
    constructor(watermarkFieldName: string, filterParamName?: string) {
        this.WatermarkFieldName = watermarkFieldName;
        this.filterParamName = filterParamName ?? watermarkFieldName;
    }

    public BuildIncrementalFilter(watermark: string | null): Record<string, string> {
        if (watermark != null) {
            return { [this.filterParamName]: watermark };
        }
        return {};
    }

    public ExtractWatermark(records: ExternalRecord[]): string | null {
        if (records.length === 0) {
            return null;
        }

        let maxTimestamp: Date | null = null;

        for (const record of records) {
            const fieldValue = record.Fields[this.WatermarkFieldName];
            const timestamp = this.parseTimestamp(fieldValue);
            if (timestamp != null && (maxTimestamp == null || timestamp > maxTimestamp)) {
                maxTimestamp = timestamp;
            }
        }

        if (maxTimestamp != null) {
            return maxTimestamp.toISOString();
        }
        return null;
    }

    /**
     * Attempt to parse a field value into a Date.
     * Handles ISO strings, numeric timestamps (epoch millis), and Date objects.
     */
    private parseTimestamp(value: unknown): Date | null {
        if (value == null) {
            return null;
        }
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        if (typeof value === 'number') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        return null;
    }
}
