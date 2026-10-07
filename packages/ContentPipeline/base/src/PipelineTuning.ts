/**
 * @fileoverview Operational knobs, resolved from a Record Process's configuration.
 *
 * Everything here is a number someone may legitimately want different for their source without
 * waiting on a release: how chatty a long walk is, how strict the plain-text sanity check is. Each
 * has a documented default, so an unset value behaves exactly as before.
 *
 * **Confidence scores are deliberately NOT here** — see {@link ConfidenceScale}.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** The operational knobs a run may override. All optional. */
export interface PipelineTuning {
    /**
     * How often Discover reports progress while walking, in items. Default 25.
     *
     * Lower for a slow source where you want to watch it move; higher for a fast one where a report
     * per 25 items is noise.
     */
    ProgressEveryItems?: number;
    /**
     * How much of a last-resort plain-text read must be printable before it is accepted, 0–1.
     * Default 0.85.
     *
     * Raise it for a source that should only ever yield clean text; lower it for one whose documents
     * legitimately carry unusual characters and are being rejected.
     */
    MinimumPrintableRatio?: number;
    /**
     * Maximum characters a extractor should return for one block. Unset means no limit.
     *
     * A guard for a source that occasionally serves something enormous, where the cost lands in
     * tagging and embedding rather than in the read itself.
     */
    MaxBlockCharacters?: number;
}

/** The defaults every knob falls back to. */
export const DefaultPipelineTuning: Required<Omit<PipelineTuning, 'MaxBlockCharacters'>> & {
    MaxBlockCharacters: number | null;
} = {
    ProgressEveryItems: 25,
    MinimumPrintableRatio: 0.85,
    MaxBlockCharacters: null,
};

/**
 * Read the tuning out of a run's configuration, falling back to the defaults.
 *
 * Invalid values fall back rather than throwing: a typo in configuration should not take a run down,
 * and the default is always a sane number.
 */
export function ResolveTuning(configuration: Readonly<Record<string, unknown>> | undefined): Required<
    Omit<PipelineTuning, 'MaxBlockCharacters'>
> & { MaxBlockCharacters: number | null } {
    const raw = (configuration?.Tuning ?? {}) as PipelineTuning;
    return {
        ProgressEveryItems: positiveInteger(raw.ProgressEveryItems, DefaultPipelineTuning.ProgressEveryItems),
        MinimumPrintableRatio: ratio(raw.MinimumPrintableRatio, DefaultPipelineTuning.MinimumPrintableRatio),
        MaxBlockCharacters: positiveIntegerOrNull(raw.MaxBlockCharacters),
    };
}

/** A positive integer, or the default. */
function positiveInteger(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** A positive integer, or null when unset. */
function positiveIntegerOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/** A ratio in 0–1, or the default. */
function ratio(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}
