/**
 * The input / output / avatar video split of one prompt run's cost, for the agent-run analytics cost card.
 *
 * The card prices input and output from the run's cost row, per token. A realtime run may be priced in several lines
 * (written into its details as `CostLines` when it was priced): the cost row over its tokens, less the output tokens
 * the provider counted as video and the audio tokens priced at an audio rate, plus a line per audio direction and the
 * avatar video line. Pricing every token at the row's rates would disagree with the run's `Cost`; so when the run has
 * lines beyond the default one, the split prices only the tokens the default line priced, adds each audio line's cost
 * to its direction (input or output), and reads the video line's cost as it is.
 *
 * A realtime run's cache hits sit in its record (`RealtimeUsage.Input.CachedTokens`), not in `TokensCacheRead`; the
 * split moves them to the cache-read bucket with the rule pricing uses (`MoveCachedInputTokens`).
 */
import {
    AUDIO_COST_LINE_MODALITY,
    AVATAR_VIDEO_COST_LINE_MODALITY,
    MoveCachedInputTokens,
    ReadCostLines,
    ReadRealtimeUsageRecord,
    type NormalizedUsage,
} from '@memberjunction/ai-engine-base';

/** A model + vendor's token rates, in currency per token. */
export interface PromptRunTokenRates {
    InputRate: number;
    OutputRate: number;
    CacheReadRate: number;
    CacheWriteRate: number;
}

/** The prompt run fields the split reads. Deliberately not the full entity. */
export type PromptRunCostSplitFields = {
    TokensPrompt?: number | null;
    TokensCompletion?: number | null;
    TokensCacheRead?: number | null;
    TokensCacheWrite?: number | null;
    ModelSpecificResponseDetails?: string | null;
};

/** One run's share of the cost card. */
export interface PromptRunCostSplit {
    /** Uncached input, cache reads and cache writes, each at its own rate, plus the input audio line's cost. */
    InputCost: number;
    /** The output tokens the cost row priced, at the output rate, plus the output audio line's cost. */
    OutputCost: number;
    /** What caching saved against pricing every input token at the full input rate. */
    Savings: number;
    /** The avatar video line's cost, from the run's cost lines; 0 for a run without one. */
    AvatarVideoCost: number;
}

/**
 * Splits one prompt run's cost into input, output and avatar video.
 *
 * @param run The prompt run's token columns and details.
 * @param rate Its model + vendor's token rates.
 */
export function SplitPromptRunCost(run: PromptRunCostSplitFields, rate: PromptRunTokenRates): PromptRunCostSplit {
    const lines = ReadCostLines(run.ModelSpecificResponseDetails);
    const defaultLine = lines.find((line) => line.Modality === null);
    const videoLines = lines.filter((line) => line.Modality === AVATAR_VIDEO_COST_LINE_MODALITY);
    const audioLines = lines.filter((line) => line.Modality === AUDIO_COST_LINE_MODALITY);
    const columns: NormalizedUsage = {
        input: run.TokensPrompt ?? 0,
        output: run.TokensCompletion ?? 0,
        cacheRead: run.TokensCacheRead ?? 0,
        cacheWrite: run.TokensCacheWrite ?? 0,
    };
    // Only a run priced with cost lines had its cache hits moved; a run without them was priced from its columns.
    const usage = defaultLine ? MoveCachedInputTokens(columns, ReadRealtimeUsageRecord(run.ModelSpecificResponseDetails)).Usage : columns;
    const cacheReadTokens = usage.cacheRead ?? 0;
    const cacheWriteTokens = usage.cacheWrite ?? 0;
    const audioInputTokens = audioLines.reduce((total, line) => total + line.Input, 0);
    const hasSplitLines = videoLines.length > 0 || audioLines.length > 0;
    // Without a video or audio line every token was priced at the row's rates, as it always was.
    const inputTokens = hasSplitLines ? Math.max(0, usage.input - audioInputTokens) : usage.input;
    const outputTokens = hasSplitLines && defaultLine ? defaultLine.Output : usage.output;
    const audioInputCost = audioLines.reduce((total, line) => total + (line.Input > 0 ? line.Cost : 0), 0);
    const audioOutputCost = audioLines.reduce((total, line) => total + (line.Input > 0 ? 0 : line.Cost), 0);
    return {
        InputCost: inputTokens * rate.InputRate + cacheReadTokens * rate.CacheReadRate + cacheWriteTokens * rate.CacheWriteRate + audioInputCost,
        OutputCost: outputTokens * rate.OutputRate + audioOutputCost,
        Savings: cacheReadTokens * (rate.InputRate - rate.CacheReadRate) + cacheWriteTokens * (rate.InputRate - rate.CacheWriteRate),
        AvatarVideoCost: videoLines.reduce((total, line) => total + line.Cost, 0),
    };
}
