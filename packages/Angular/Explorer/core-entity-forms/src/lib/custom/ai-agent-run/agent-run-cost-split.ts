/**
 * The input / output / avatar video split of one prompt run's cost, for the agent-run analytics cost card.
 *
 * The card prices input and output from the run's cost row, per token. A realtime run with a generated avatar is
 * priced in two lines (written into its details as `CostLines` when it was priced): the cost row over its tokens, less
 * the output tokens the provider counted as video, plus the avatar video at its per-minute price. Pricing every output
 * token at the output rate would charge that video at the text rate and disagree with the run's `Cost`; so the split
 * prices only the output tokens the cost row's line priced, and reads the video line's cost as it is.
 */
import { AVATAR_VIDEO_COST_LINE_MODALITY, ReadCostLines } from '@memberjunction/ai-engine-base';

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
    /** Uncached input, cache reads and cache writes, each at its own rate. */
    InputCost: number;
    /** The output tokens the cost row priced, at the output rate. */
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
    const inputTokens = run.TokensPrompt ?? 0;
    const cacheReadTokens = run.TokensCacheRead ?? 0;
    const cacheWriteTokens = run.TokensCacheWrite ?? 0;
    // Without a video line every output token was priced at the output rate, as it always was.
    const outputTokens = videoLines.length > 0 && defaultLine ? defaultLine.Output : (run.TokensCompletion ?? 0);
    return {
        InputCost: inputTokens * rate.InputRate + cacheReadTokens * rate.CacheReadRate + cacheWriteTokens * rate.CacheWriteRate,
        OutputCost: outputTokens * rate.OutputRate,
        Savings: cacheReadTokens * (rate.InputRate - rate.CacheReadRate) + cacheWriteTokens * (rate.InputRate - rate.CacheWriteRate),
        AvatarVideoCost: videoLines.reduce((total, line) => total + line.Cost, 0),
    };
}
