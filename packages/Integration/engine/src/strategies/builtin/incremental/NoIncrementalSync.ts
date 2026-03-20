/**
 * No incremental sync strategy.
 * Always performs a full fetch with no watermark filtering.
 * Used when the external system does not support incremental queries.
 */
import type { IncrementalSyncStrategy } from '../../IncrementalSyncStrategy.js';
import type { ExternalRecord } from '../../../types.js';

export class NoIncrementalSync implements IncrementalSyncStrategy {
    public readonly Type = 'None' as const;
    public readonly WatermarkFieldName = '';
    public readonly SupportsDeleteDetection = false;

    public BuildIncrementalFilter(_watermark: string | null): Record<string, string> {
        return {};
    }

    public ExtractWatermark(_records: ExternalRecord[]): string | null {
        return null;
    }
}
