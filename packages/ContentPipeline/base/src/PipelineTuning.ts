/**
 * @fileoverview Operational knobs a Record Process's `Options.Tuning` may override. Confidence scores are
 * not here — see `ConfidenceScale`.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { DEFAULT_EMPTY_PAGE_TEXT_CHARS } from './render/BasePageRenderer.js';

/** The knobs a run may override. All optional. */
export interface PipelineTuning {
    /** How often Discover reports progress, in items. Default 25. */
    ProgressEveryItems?: number;
    /** Share of a last-resort plain-text read that must be printable, 0–1. Default 0.85. */
    MinimumPrintableRatio?: number;
    /**
     * Below this many characters of visible text, an HTML page counts as an empty shell its scripts fill in: the
     * `WhenEmpty` render policy renders it. Default 200.
     */
    EmptyPageTextChars?: number;
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
    /**
     * How long a record waits after its first Retry outcome before a stage may pick it up again, in ms.
     * Each Retry in a row doubles the wait, up to {@link RetryBackoffMaxMs}. Default 60000 (1 minute).
     */
    RetryBackoffBaseMs?: number;
    /** The longest a record waits between retries, in ms. Default 3600000 (1 hour). */
    RetryBackoffMaxMs?: number;
    /**
     * How long one Discover walk may run, in ms, before the driver is asked to stop and return a resume token
     * (`DiscoverRequest.Deadline`); the next walk carries on from it. Unset means no deadline.
     */
    DiscoverWalkBudgetMs?: number;
}

/** A run's tuning with defaults applied; knobs without a default are null when unset. */
export type ResolvedPipelineTuning = Required<
    Omit<PipelineTuning, 'MaxBlockCharacters' | 'MaxArchiveMembers' | 'MaxArchiveBytes' | 'DiscoverWalkBudgetMs'>
> & {
    MaxBlockCharacters: number | null;
    MaxArchiveMembers: number | null;
    MaxArchiveBytes: number | null;
    DiscoverWalkBudgetMs: number | null;
};

/** Defaults for the knobs that have one. */
export const DefaultPipelineTuning: Omit<ResolvedPipelineTuning, 'MaxArchiveMembers' | 'MaxArchiveBytes' | 'DiscoverWalkBudgetMs'> = {
    ProgressEveryItems: 25,
    MinimumPrintableRatio: 0.85,
    EmptyPageTextChars: DEFAULT_EMPTY_PAGE_TEXT_CHARS,
    MaxBlockCharacters: null,
    MaxArchiveDepth: 3,
    MaxSyncRemovalShare: 0.5,
    ClockSkewOverlapMs: 60_000,
    RetryBackoffBaseMs: 60_000,
    RetryBackoffMaxMs: 3_600_000,
};

/** Whether a configured value sets anything: not null, undefined or a blank string. */
export function IsSetValue(value: unknown): boolean {
    return value !== undefined && value !== null && !(typeof value === 'string' && value.trim().length === 0);
}

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
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            // Only what a layer actually sets: a null or blank value leaves the layers below to decide.
            for (const [key, value] of Object.entries(candidate)) {
                if (IsSetValue(value)) {
                    (raw as Record<string, unknown>)[key] = value;
                }
            }
        }
    }
    return {
        ProgressEveryItems: PositiveInteger(raw.ProgressEveryItems) ?? DefaultPipelineTuning.ProgressEveryItems,
        MinimumPrintableRatio: ratio(raw.MinimumPrintableRatio) ?? DefaultPipelineTuning.MinimumPrintableRatio,
        EmptyPageTextChars: PositiveInteger(raw.EmptyPageTextChars) ?? DefaultPipelineTuning.EmptyPageTextChars,
        MaxBlockCharacters: PositiveInteger(raw.MaxBlockCharacters),
        MaxArchiveMembers: PositiveInteger(raw.MaxArchiveMembers),
        MaxArchiveBytes: PositiveInteger(raw.MaxArchiveBytes),
        MaxArchiveDepth: PositiveInteger(raw.MaxArchiveDepth) ?? DefaultPipelineTuning.MaxArchiveDepth,
        MaxSyncRemovalShare: ratio(raw.MaxSyncRemovalShare) ?? DefaultPipelineTuning.MaxSyncRemovalShare,
        ClockSkewOverlapMs: nonNegativeInteger(raw.ClockSkewOverlapMs) ?? DefaultPipelineTuning.ClockSkewOverlapMs,
        RetryBackoffBaseMs: PositiveInteger(raw.RetryBackoffBaseMs) ?? DefaultPipelineTuning.RetryBackoffBaseMs,
        RetryBackoffMaxMs: PositiveInteger(raw.RetryBackoffMaxMs) ?? DefaultPipelineTuning.RetryBackoffMaxMs,
        DiscoverWalkBudgetMs: PositiveInteger(raw.DiscoverWalkBudgetMs),
    };
}

/** The two knobs that set a record's wait after a Retry. */
export type RetryBackoff = Pick<ResolvedPipelineTuning, 'RetryBackoffBaseMs' | 'RetryBackoffMaxMs'>;

/**
 * How long a record waits before its next attempt, given how many Retry outcomes it has had in a row
 * (1 for the first). The wait doubles each time: base, 2×base, 4×base, … never more than the maximum.
 */
export function RetryDelayMs(retryCount: number, tuning: RetryBackoff): number {
    const attempt = Math.max(1, Math.floor(retryCount));
    const max = Math.max(tuning.RetryBackoffBaseMs, tuning.RetryBackoffMaxMs);
    // Past 2^30 the doubling only overflows; the maximum has long since been reached.
    const doublings = Math.min(attempt - 1, 30);
    return Math.min(tuning.RetryBackoffBaseMs * 2 ** doublings, max);
}

/** A positive number, floored to an integer, else null: how a configured count or duration is read. */
export function PositiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function nonNegativeInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function ratio(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
