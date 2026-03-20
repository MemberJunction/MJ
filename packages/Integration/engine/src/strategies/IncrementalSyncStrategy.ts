/**
 * Strategy interfaces for incremental synchronization.
 * Connectors declare per-object watermark types and field names;
 * the engine uses the strategy to build filters and track progress.
 */

import type { ExternalRecord } from '../types.js';

/** Type of watermark used for incremental sync — extended from types.ts WatermarkType */
export type IncrementalWatermarkType = 'Timestamp' | 'Cursor' | 'ChangeToken' | 'Version' | 'None';

/** An incremental sync strategy implementation */
export interface IncrementalSyncStrategy {
    /** The watermark type */
    Type: IncrementalWatermarkType;
    /** The field name used for watermarking (e.g., 'hs_lastmodifieddate', 'SystemModStamp') */
    WatermarkFieldName: string;
    /**
     * Build query parameters to fetch only records modified since the watermark.
     * @param watermark - the last known watermark value, or null for full fetch
     * @returns key-value pairs to add to the API request
     */
    BuildIncrementalFilter(watermark: string | null): Record<string, string>;
    /**
     * Extract the new watermark value from a batch of fetched records.
     * @param records - the records in this batch
     * @returns the new watermark value to persist, or null if unchanged
     */
    ExtractWatermark(records: ExternalRecord[]): string | null;
    /** Whether this strategy can detect deleted records */
    SupportsDeleteDetection: boolean;
}
