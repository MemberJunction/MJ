/**
 * The cost card's split of a prompt run: input and output from the cost row's token rates, avatar video from the run's
 * cost lines. An avatar call's output figure used to price every output token at the text rate, Google's video tokens
 * included, so the card said output cost $1.68 for a call whose whole cost was $0.388.
 *
 * One speaking minute of Gemini 3.8 Live on Vertex AI: $0.75 / $4.50 per 1M tokens, 371,520 of the 373,520 output
 * tokens are the avatar's video, priced at $0.37152 per minute on its own line.
 */
import { describe, expect, it } from 'vitest';
import { SplitPromptRunCost, type PromptRunTokenRates } from '../agent-run-cost-split';

const RATES: PromptRunTokenRates = { InputRate: 0.75e-6, OutputRate: 4.5e-6, CacheReadRate: 0.075e-6, CacheWriteRate: 0.75e-6 };

const AVATAR_RUN = {
    TokensPrompt: 10000,
    TokensCompletion: 373520,
    TokensCacheRead: 0,
    TokensCacheWrite: 0,
    ModelSpecificResponseDetails: JSON.stringify({
        RealtimeUsage: { Output: { AudioTokens: 2000, VideoTokens: 371520, VideoSeconds: 60 } },
        CostLines: [
            { Modality: null, CostRowID: 'row', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.0165 },
            { Modality: 'Video', CostRowID: null, Measure: 'Seconds', Input: 0, Output: 60, Cost: 0.37152 },
        ],
    }),
};

describe('SplitPromptRunCost', () => {
    it("prices only the output tokens the cost row's line priced, and takes the video from its line", () => {
        const split = SplitPromptRunCost(AVATAR_RUN, RATES);

        expect(split.InputCost).toBeCloseTo(0.0075, 12);
        expect(split.OutputCost).toBeCloseTo(0.009, 12);
        expect(split.AvatarVideoCost).toBe(0.37152);
        // The parts add up to the run's cost.
        expect(split.InputCost + split.OutputCost + split.AvatarVideoCost).toBeCloseTo(0.38802, 10);
    });

    it('splits a run without cost lines exactly as before: every output token at the output rate', () => {
        const split = SplitPromptRunCost({ TokensPrompt: 10000, TokensCompletion: 373520 }, RATES);

        expect(split.OutputCost).toBeCloseTo(373520 * 4.5e-6, 12);
        expect(split.AvatarVideoCost).toBe(0);
    });

    it('prices every output token when the run has a default line but no video line', () => {
        const details = JSON.stringify({ CostLines: [{ Modality: null, CostRowID: 'row', Measure: 'Tokens', Input: 10, Output: 5, Cost: 1 }] });
        const split = SplitPromptRunCost({ TokensPrompt: 10, TokensCompletion: 7, ModelSpecificResponseDetails: details }, RATES);

        expect(split.OutputCost).toBeCloseTo(7 * 4.5e-6, 12);
    });

    it('prices cache reads and writes at their own rates and counts what caching saved', () => {
        const split = SplitPromptRunCost({ TokensPrompt: 1000, TokensCacheRead: 4000, TokensCacheWrite: 500, TokensCompletion: 0 }, RATES);

        expect(split.InputCost).toBeCloseTo(1000 * 0.75e-6 + 4000 * 0.075e-6 + 500 * 0.75e-6, 12);
        expect(split.Savings).toBeCloseTo(4000 * (0.75e-6 - 0.075e-6), 12);
    });

    it('reads malformed details as no cost lines', () => {
        const split = SplitPromptRunCost({ TokensPrompt: 1, TokensCompletion: 2, ModelSpecificResponseDetails: '{broken' }, RATES);

        expect(split.OutputCost).toBeCloseTo(2 * 4.5e-6, 12);
        expect(split.AvatarVideoCost).toBe(0);
    });
});
