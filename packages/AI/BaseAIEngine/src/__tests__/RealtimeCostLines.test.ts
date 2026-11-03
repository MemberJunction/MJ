/**
 * Unit tests for the avatar video and audio lines of a realtime run's cost (audio at the end of the file): when the configured price prices the run's stored
 * video seconds (per minute) or its video tokens (per 1M tokens), when the video stays priced as before (and why), how
 * the video tokens leave the default line's output bucket, and how the cost lines are written into and read from
 * `ModelSpecificResponseDetails`.
 *
 * The numbers follow the video price design's worked example: one speaking minute of Gemini 3.8 Live on Vertex AI at
 * $0.75 / $4.50 per 1M tokens, the avatar's video at $0.37152 per minute, or at Google's $1.00 per 1M video tokens.
 */
import { describe, it, expect } from 'vitest';
import type { AIModelConfiguration } from '@memberjunction/ai';
import {
    BuildCostLines,
    ExcludeAudioTokens,
    ExcludeAvatarVideoTokens,
    PriceAudioTokens,
    PriceAvatarVideoOutput,
    ReadCostLines,
    RoundCost,
    WriteCostLines,
    type PricedAudioTokens,
    type PricedAvatarVideo,
} from '../RealtimeCostLines';
import type { RealtimeUsageRecord } from '../RealtimeUsageRecord';

const VIDEO_PRICE: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: { Price: 0.37152, Unit: 'Per Minute', Currency: 'USD' } } } };
/** Google's list price for avatar video output tokens. */
const TOKEN_PRICE: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: { Price: 1, Unit: 'Per 1M Tokens', Currency: 'USD' } } } };
/** One speaking minute: 60 s of avatar video that Google counted as 371,520 output tokens. */
const ONE_MINUTE: RealtimeUsageRecord = { Input: { TextTokens: 7900, AudioTokens: 2100 }, Output: { AudioTokens: 2000, VideoTokens: 371520, VideoSeconds: 60 } };
/** The 10.6-minute Vertex AI call of 2026-10-09 (#5312): 617.79 s of avatar video streamed, 460,530 VIDEO tokens reported. */
const TEN_MINUTE_CALL: RealtimeUsageRecord = { Output: { VideoSeconds: 617.79, VideoTokens: 460530 } };

/** A configuration as stored JSON may hold it, whatever the type says. */
function storedConfiguration(price: object): AIModelConfiguration {
    return JSON.parse(JSON.stringify({ Realtime: { Pricing: { AvatarVideoOutput: price } } })) as AIModelConfiguration;
}

describe('PriceAvatarVideoOutput', () => {
    it("prices the stored output video seconds at the configuration's per-minute price", () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, VIDEO_PRICE, 'USD')).toEqual({ Priced: true, Measure: 'Seconds', Seconds: 60, Cost: 0.37152, VideoTokens: 371520 });
        expect(PriceAvatarVideoOutput({ Output: { VideoSeconds: 90 } }, VIDEO_PRICE, 'USD')).toMatchObject({ Priced: true, Measure: 'Seconds', Cost: 0.55728, VideoTokens: 0 });
    });

    it('prices the stored output video tokens at a per-1M-token price, and keeps the seconds', () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, TOKEN_PRICE, 'USD')).toEqual({ Priced: true, Measure: 'Tokens', Seconds: 60, Cost: 0.37152, VideoTokens: 371520 });
        expect(PriceAvatarVideoOutput({ Output: { VideoTokens: 6192 } }, TOKEN_PRICE, 'USD')).toEqual({ Priced: true, Measure: 'Tokens', Seconds: 0, Cost: 0.006192, VideoTokens: 6192 });
    });

    it("prices the 10-minute call's VIDEO tokens at a per-token price, and its streamed seconds at the per-minute price", () => {
        expect(PriceAvatarVideoOutput(TEN_MINUTE_CALL, TOKEN_PRICE, 'USD')).toMatchObject({ Priced: true, Measure: 'Tokens', Cost: 0.46053 });
        expect(PriceAvatarVideoOutput(TEN_MINUTE_CALL, VIDEO_PRICE, 'USD')).toMatchObject({ Priced: true, Measure: 'Seconds', Cost: 3.82535568 });
    });

    it('is null when the run stored no avatar video', () => {
        expect(PriceAvatarVideoOutput(null, VIDEO_PRICE, 'USD')).toBeNull();
        expect(PriceAvatarVideoOutput({ Output: { AudioTokens: 2000 }, Input: { VideoSeconds: 30 } }, VIDEO_PRICE, 'USD')).toBeNull();
    });

    it('does not price the video without a usable price', () => {
        for (const configuration of [null, {}, { Realtime: { Pricing: {} } }, storedConfiguration({ Price: -1, Unit: 'Per Minute', Currency: 'USD' })]) {
            expect(PriceAvatarVideoOutput(ONE_MINUTE, configuration, 'USD')).toEqual({ Priced: false, Reason: 'no-price' });
        }
    });

    it('counts a partial price as none: a missing or null price, unit or currency', () => {
        const partials = [
            { Unit: 'Per Minute', Currency: 'USD' },
            { Price: 0.35, Currency: 'USD' },
            { Price: 0.35, Unit: 'Per Minute' },
            { Price: 0.35, Unit: 'Per Minute', Currency: null },
            { Price: 1, Unit: 'Per 1M Tokens' },
        ];
        for (const price of partials) {
            expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration(price), 'USD')).toEqual({ Priced: false, Reason: 'no-price' });
        }
    });

    it("does not price the video at a unit other than 'Per Minute' or 'Per 1M Tokens'", () => {
        for (const unit of ['Per Hour', 'Per 1K Tokens', 'per 1m tokens']) {
            expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 22, Unit: unit, Currency: 'USD' }), 'USD')).toEqual({ Priced: false, Reason: 'unit' });
        }
    });

    it("does not price the video in another currency than the cost row's, but matches its case loosely", () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 0.35, Unit: 'Per Minute', Currency: 'EUR' }), 'USD')).toEqual({ Priced: false, Reason: 'currency' });
        expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 1, Unit: 'Per 1M Tokens', Currency: 'EUR' }), 'USD')).toEqual({ Priced: false, Reason: 'currency' });
        expect(PriceAvatarVideoOutput(ONE_MINUTE, VIDEO_PRICE, ' usd ')).toMatchObject({ Priced: true });
    });

    it('does not price video tokens without seconds: the price is per minute', () => {
        expect(PriceAvatarVideoOutput({ Output: { VideoTokens: 6192 } }, VIDEO_PRICE, 'USD')).toEqual({ Priced: false, Reason: 'no-seconds' });
    });

    it('does not price video seconds without tokens: the price is per token', () => {
        expect(PriceAvatarVideoOutput({ Output: { VideoSeconds: 30 } }, TOKEN_PRICE, 'USD')).toEqual({ Priced: false, Reason: 'no-tokens' });
    });

    it('prices a free video line at a price of 0', () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 0, Unit: 'Per Minute', Currency: 'USD' }), 'USD')).toMatchObject({ Priced: true, Cost: 0 });
        expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 0, Unit: 'Per 1M Tokens', Currency: 'USD' }), 'USD')).toMatchObject({ Priced: true, Cost: 0 });
    });
});

describe('ExcludeAvatarVideoTokens', () => {
    it("takes the video tokens out of the output bucket and nothing else", () => {
        const usage = { input: 10000, output: 373520, cacheRead: 5, cacheWrite: 6 };
        expect(ExcludeAvatarVideoTokens(usage, 371520)).toEqual({ Usage: { input: 10000, output: 2000, cacheRead: 5, cacheWrite: 6 }, Clamped: false });
    });

    it('stops the bucket at 0 and says so when the video tokens are more than it holds', () => {
        expect(ExcludeAvatarVideoTokens({ input: 10, output: 500 }, 700)).toEqual({ Usage: { input: 10, output: 0 }, Clamped: true });
    });

    it('takes nothing for no video tokens', () => {
        expect(ExcludeAvatarVideoTokens({ input: 10, output: 500 }, 0)).toEqual({ Usage: { input: 10, output: 500 }, Clamped: false });
    });
});

describe('BuildCostLines', () => {
    const video: PricedAvatarVideo = { Priced: true, Measure: 'Seconds', Seconds: 60, Cost: 0.37152, VideoTokens: 371520 };

    it('writes the default line from the cost row, then the video line', () => {
        const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 10000, output: 2000, cacheRead: 0, cacheWrite: 0 }, Cost: 0.0165 }, video);
        expect(lines).toEqual([
            { Modality: null, CostRowID: 'row-1', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.0165 },
            { Modality: 'Video', CostRowID: null, Measure: 'Seconds', Input: 0, Output: 60, Cost: 0.37152 },
        ]);
    });

    it('writes a video line priced per token in tokens', () => {
        const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 10000, output: 2000 }, Cost: 0.0165 }, { ...video, Measure: 'Tokens' });
        expect(lines[1]).toEqual({ Modality: 'Video', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 371520, Cost: 0.37152 });
    });

    it('writes the default line alone without a priced video line, counting cache reads and writes as input', () => {
        const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 4 }, Cost: 1 / 3 }, null);
        expect(lines).toEqual([{ Modality: null, CostRowID: 'row-1', Measure: 'Tokens', Input: 134, Output: 20, Cost: 0.33333333 }]);
    });
});

describe('WriteCostLines and ReadCostLines', () => {
    const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 10, output: 2 }, Cost: 0.5 }, { Priced: true, Measure: 'Seconds', Seconds: 6, Cost: 0.25, VideoTokens: 0 });

    it('writes the lines and keeps the rest of the details, the usage record included', () => {
        const details = JSON.stringify({ RealtimeUsage: { Output: { VideoSeconds: 6 } }, CostLines: [{ Cost: 99 }] });
        const written = WriteCostLines(details, lines);
        expect(JSON.parse(written ?? '{}')).toEqual({ RealtimeUsage: { Output: { VideoSeconds: 6 } }, CostLines: lines });
        expect(ReadCostLines(written)).toEqual(lines);
    });

    it('writes into empty details, and never over details that are not a JSON object', () => {
        expect(ReadCostLines(WriteCostLines(null, lines))).toEqual(lines);
        expect(WriteCostLines('{broken', lines)).toBeNull();
    });

    it('reads nothing from details without lines or malformed ones, and skips a line without a cost', () => {
        for (const details of [null, '', '{broken', JSON.stringify({ CostLines: 'x' }), JSON.stringify({ RealtimeUsage: {} })]) {
            expect(ReadCostLines(details)).toEqual([]);
        }
        const mixed = JSON.stringify({ CostLines: [{ Modality: 'Video', Output: 6 }, 'line', { Modality: 'Video', Cost: 0.25, Output: 6 }] });
        expect(ReadCostLines(mixed)).toEqual([{ Modality: 'Video', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 6, Cost: 0.25 }]);
    });
});

describe('RoundCost', () => {
    it('rounds to 8 decimals, the precision of AIPromptRun.Cost', () => {
        expect(RoundCost(0.123456789)).toBe(0.12345679);
        expect(RoundCost(0.0165 + 0.37152)).toBe(0.38802);
    });
});

describe('PriceAudioTokens', () => {
    const AUDIO_PRICES: AIModelConfiguration = {
        Realtime: { Pricing: { AudioInput: { Price: 32, Unit: 'Per 1M Tokens', Currency: 'USD' }, AudioOutput: { Price: 64, Unit: 'Per 1M Tokens', Currency: 'USD' } } },
    };
    const CALL: RealtimeUsageRecord = { Input: { TextTokens: 2000, AudioTokens: 8000 }, Output: { TextTokens: 500, AudioTokens: 1500 } };

    function audioConfiguration(input: object | null, output: object | null): AIModelConfiguration {
        return JSON.parse(JSON.stringify({ Realtime: { Pricing: { AudioInput: input, AudioOutput: output } } })) as AIModelConfiguration;
    }

    it('prices each direction at its own per-1M-token price', () => {
        expect(PriceAudioTokens(CALL, AUDIO_PRICES, 'USD')).toEqual({
            Input: { Priced: true, Direction: 'Input', Tokens: 8000, Cost: 0.256 },
            Output: { Priced: true, Direction: 'Output', Tokens: 1500, Cost: 0.096 },
        });
    });

    it('is null for a direction without audio tokens, and for no record', () => {
        expect(PriceAudioTokens({ Input: { AudioTokens: 10 }, Output: { TextTokens: 5 } }, AUDIO_PRICES, 'USD').Output).toBeNull();
        expect(PriceAudioTokens(null, AUDIO_PRICES, 'USD')).toEqual({ Input: null, Output: null });
    });

    it('says no-price without a usable price: none, a partial one, or a negative amount', () => {
        for (const configuration of [null, {}, audioConfiguration({ Price: 32, Unit: 'Per 1M Tokens' }, { Price: -1, Unit: 'Per 1M Tokens', Currency: 'USD' })]) {
            const pricing = PriceAudioTokens(CALL, configuration, 'USD');
            expect(pricing.Input).toEqual({ Priced: false, Direction: 'Input', Tokens: 8000, Reason: 'no-price' });
            expect(pricing.Output).toEqual({ Priced: false, Direction: 'Output', Tokens: 1500, Reason: 'no-price' });
        }
    });

    it("refuses any unit but 'Per 1M Tokens', a per-minute price included", () => {
        const pricing = PriceAudioTokens(CALL, audioConfiguration({ Price: 0.06, Unit: 'Per Minute', Currency: 'USD' }, { Price: 64, Unit: 'Per 1K Tokens', Currency: 'USD' }), 'USD');
        expect(pricing.Input).toMatchObject({ Priced: false, Reason: 'unit' });
        expect(pricing.Output).toMatchObject({ Priced: false, Reason: 'unit' });
    });

    it("refuses a currency other than the cost row's, but matches its case loosely", () => {
        expect(PriceAudioTokens(CALL, audioConfiguration({ Price: 32, Unit: 'Per 1M Tokens', Currency: 'EUR' }, null), 'USD').Input).toMatchObject({ Priced: false, Reason: 'currency' });
        expect(PriceAudioTokens(CALL, AUDIO_PRICES, ' usd ').Input).toMatchObject({ Priced: true });
    });

    it('prices a free audio line at a price of 0', () => {
        expect(PriceAudioTokens(CALL, audioConfiguration({ Price: 0, Unit: 'Per 1M Tokens', Currency: 'USD' }, null), 'USD').Input).toMatchObject({ Priced: true, Cost: 0 });
    });
});

describe('ExcludeAudioTokens', () => {
    it('takes the audio tokens out of the input and output buckets and leaves the cache buckets', () => {
        expect(ExcludeAudioTokens({ input: 10000, output: 2000, cacheRead: 300, cacheWrite: 4 }, 8000, 1500)).toEqual({
            Usage: { input: 2000, output: 500, cacheRead: 300, cacheWrite: 4 },
            ClampedInput: false,
            ClampedOutput: false,
        });
    });

    it('stops each bucket at 0 and says which ran out', () => {
        expect(ExcludeAudioTokens({ input: 100, output: 50 }, 120, 10)).toEqual({ Usage: { input: 0, output: 40 }, ClampedInput: true, ClampedOutput: false });
        expect(ExcludeAudioTokens({ input: 100, output: 50 }, 0, 60)).toEqual({ Usage: { input: 100, output: 0 }, ClampedInput: false, ClampedOutput: true });
    });

    it('takes nothing for no audio tokens, or a negative count', () => {
        expect(ExcludeAudioTokens({ input: 100, output: 50 }, 0, -5)).toEqual({ Usage: { input: 100, output: 50 }, ClampedInput: false, ClampedOutput: false });
    });
});

describe('BuildCostLines with audio', () => {
    const audio: PricedAudioTokens[] = [
        { Priced: true, Direction: 'Input', Tokens: 8000, Cost: 0.256 },
        { Priced: true, Direction: 'Output', Tokens: 1500, Cost: 0.096 },
    ];

    it('writes an Audio line per priced direction after the default line, and the video line last', () => {
        const video: PricedAvatarVideo = { Priced: true, Measure: 'Tokens', Seconds: 60, Cost: 0.37152, VideoTokens: 371520 };
        const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 2000, output: 500 }, Cost: 0.016 }, video, audio);
        expect(lines).toEqual([
            { Modality: null, CostRowID: 'row-1', Measure: 'Tokens', Input: 2000, Output: 500, Cost: 0.016 },
            { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 8000, Output: 0, Cost: 0.256 },
            { Modality: 'Audio', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 1500, Cost: 0.096 },
            { Modality: 'Video', CostRowID: null, Measure: 'Tokens', Input: 0, Output: 371520, Cost: 0.37152 },
        ]);
    });

    it('marks a blended default line, and writes and reads the mark back', () => {
        const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 10000, output: 2000 }, Cost: 0.072, Blended: true }, null);
        expect(lines).toEqual([{ Modality: null, CostRowID: 'row-1', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.072, Blended: true }]);
        const written = WriteCostLines(null, lines);
        expect(JSON.parse(written ?? '{}').CostLines[0].Blended).toBe(true);
        expect(ReadCostLines(written)).toEqual(lines);
    });

    it('writes no mark on a line that is not blended, and reads only a true mark', () => {
        const written = WriteCostLines(null, BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 1, output: 1 }, Cost: 1, Blended: false }, null));
        expect(JSON.parse(written ?? '{}').CostLines[0]).not.toHaveProperty('Blended');
        expect(ReadCostLines(JSON.stringify({ CostLines: [{ Cost: 1, Blended: 'yes' }] }))[0]).not.toHaveProperty('Blended');
    });
});
