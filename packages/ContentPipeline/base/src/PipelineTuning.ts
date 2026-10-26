/**
 * @fileoverview Operational knobs a Record Process's `Options.Tuning` may override. Confidence scores are
 * not here — see `ConfidenceScale`.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** The knobs a run may override. All optional. */
export interface PipelineTuning {
    /** How often Discover reports progress, in items. Default 25. */
    ProgressEveryItems?: number;
    /** Share of a last-resort plain-text read that must be printable, 0–1. Default 0.85. */
    MinimumPrintableRatio?: number;
    /** Most characters an extractor returns for one block. Unset means no limit. */
    MaxBlockCharacters?: number;
    /** Most members an archive tree may unpack into. No default: an archive is refused rather than unpacked unbounded. */
    MaxArchiveMembers?: number;
    /** Most bytes an archive tree may expand to. No default, for the same reason. */
    MaxArchiveBytes?: number;
    /** Deepest nesting an archive tree may reach (a `.tar.gz` is depth 2). Default 3. */
    MaxArchiveDepth?: number;
    /** Highest share of a source's live top-level items a Sync run may mark for deletion, 0–1. Default 0.5. */
    MaxSyncRemovalShare?: number;
    /**
     * Clock-skew overlap subtracted from `LastDiscoveredAt` when computing `Since`, and subtracted from
     * `walkStartedAt` when Sync compares `__mj_CreatedAt` to spare concurrently created items. Default 60000 (60s).
     */
    ClockSkewOverlapMs?: number;
}

/** A run's tuning with defaults applied; knobs without a default are null when unset. */
export type ResolvedPipelineTuning = Required<Omit<PipelineTuning, 'MaxBlockCharacters' | 'MaxArchiveMembers' | 'MaxArchiveBytes'>> & {
    MaxBlockCharacters: number | null;
    MaxArchiveMembers: number | null;
    MaxArchiveBytes: number | null;
};

/** Defaults for the knobs that have one. */
export const DefaultPipelineTuning: Omit<ResolvedPipelineTuning, 'MaxArchiveMembers' | 'MaxArchiveBytes'> = {
    ProgressEveryItems: 25,
    MinimumPrintableRatio: 0.85,
    MaxBlockCharacters: null,
    MaxArchiveDepth: 3,
    MaxSyncRemovalShare: 0.5,
    ClockSkewOverlapMs: 60_000,
};

/**
 * Read a run's tuning, merging one or more configuration objects from lowest precedence to highest
 * (e.g. Content Source Type → Content Source → Run Configuration). An invalid value falls back to its
 * default rather than failing the run.
 */
export function ResolveTuning(...configurations: (Readonly<Record<string, unknown>> | undefined)[]): ResolvedPipelineTuning {
    const raw: PipelineTuning = {};
    for (const configuration of configurations) {
        if (!configuration) {
            continue;
        }
        const optionsObj = configuration.Options as Record<string, unknown> | undefined;
        const candidate = (configuration.Tuning ?? optionsObj?.Tuning) as PipelineTuning | undefined;
        if (candidate && typeof candidate === 'object') {
            Object.assign(raw, candidate);
        }
    }
    return {
        ProgressEveryItems: positiveInteger(raw.ProgressEveryItems) ?? DefaultPipelineTuning.ProgressEveryItems,
        MinimumPrintableRatio: ratio(raw.MinimumPrintableRatio) ?? DefaultPipelineTuning.MinimumPrintableRatio,
        MaxBlockCharacters: positiveInteger(raw.MaxBlockCharacters),
        MaxArchiveMembers: positiveInteger(raw.MaxArchiveMembers),
        MaxArchiveBytes: positiveInteger(raw.MaxArchiveBytes),
        MaxArchiveDepth: positiveInteger(raw.MaxArchiveDepth) ?? DefaultPipelineTuning.MaxArchiveDepth,
        MaxSyncRemovalShare: ratio(raw.MaxSyncRemovalShare) ?? DefaultPipelineTuning.MaxSyncRemovalShare,
        ClockSkewOverlapMs: nonNegativeInteger(raw.ClockSkewOverlapMs) ?? DefaultPipelineTuning.ClockSkewOverlapMs,
    };
}

function positiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function nonNegativeInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function ratio(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
