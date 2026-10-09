/**
 * Unit tests for the avatar video line of a realtime run's cost: when the configured per-minute price prices the run's
 * stored video seconds, when the video stays priced as before (and why), how the video tokens leave the default line's
 * output bucket, and how the cost lines are written into and read from `ModelSpecificResponseDetails`.
 *
 * The numbers follow the video price design's worked example: one speaking minute of Gemini 3.8 Live on Vertex AI at
 * $0.75 / $4.50 per 1M tokens, the avatar's video at $0.37152 per minute.
 */
import { describe, it, expect } from 'vitest';
import type { AIModelConfiguration } from '@memberjunction/ai';
import {
    BuildCostLines,
    ExcludeAvatarVideoTokens,
    PriceAvatarVideoOutput,
    ReadCostLines,
    RoundCost,
    WriteCostLines,
    type PricedAvatarVideo,
} from '../RealtimeCostLines';
import type { RealtimeUsageRecord } from '../RealtimeUsageRecord';

const VIDEO_PRICE: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: { Price: 0.37152, Unit: 'Per Minute', Currency: 'USD' } } } };
/** One speaking minute: 60 s of avatar video that Google counted as 371,520 output tokens. */
const ONE_MINUTE: RealtimeUsageRecord = { Input: { TextTokens: 7900, AudioTokens: 2100 }, Output: { AudioTokens: 2000, VideoTokens: 371520, VideoSeconds: 60 } };

/** A configuration as stored JSON may hold it, whatever the type says. */
function storedConfiguration(price: object): AIModelConfiguration {
    return JSON.parse(JSON.stringify({ Realtime: { Pricing: { AvatarVideoOutput: price } } })) as AIModelConfiguration;
}

describe('PriceAvatarVideoOutput', () => {
    it("prices the stored output video seconds at the configuration's per-minute price", () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, VIDEO_PRICE, 'USD')).toEqual({ Priced: true, Seconds: 60, Cost: 0.37152, VideoTokens: 371520 });
        expect(PriceAvatarVideoOutput({ Output: { VideoSeconds: 90 } }, VIDEO_PRICE, 'USD')).toMatchObject({ Priced: true, Cost: 0.55728, VideoTokens: 0 });
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
        for (const price of [{ Unit: 'Per Minute', Currency: 'USD' }, { Price: 0.35, Currency: 'USD' }, { Price: 0.35, Unit: 'Per Minute' }, { Price: 0.35, Unit: 'Per Minute', Currency: null }]) {
            expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration(price), 'USD')).toEqual({ Priced: false, Reason: 'no-price' });
        }
    });

    it("does not price the video at a unit other than 'Per Minute'", () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 22, Unit: 'Per Hour', Currency: 'USD' }), 'USD')).toEqual({ Priced: false, Reason: 'unit' });
    });

    it("does not price the video in another currency than the cost row's, but matches its case loosely", () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 0.35, Unit: 'Per Minute', Currency: 'EUR' }), 'USD')).toEqual({ Priced: false, Reason: 'currency' });
        expect(PriceAvatarVideoOutput(ONE_MINUTE, VIDEO_PRICE, ' usd ')).toMatchObject({ Priced: true });
    });

    it('does not price video tokens without seconds: the price is per minute', () => {
        expect(PriceAvatarVideoOutput({ Output: { VideoTokens: 6192 } }, VIDEO_PRICE, 'USD')).toEqual({ Priced: false, Reason: 'no-seconds' });
    });

    it('prices a free video line at a price of 0', () => {
        expect(PriceAvatarVideoOutput(ONE_MINUTE, storedConfiguration({ Price: 0, Unit: 'Per Minute', Currency: 'USD' }), 'USD')).toMatchObject({ Priced: true, Cost: 0 });
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
    const video: PricedAvatarVideo = { Priced: true, Seconds: 60, Cost: 0.37152, VideoTokens: 371520 };

    it('writes the default line from the cost row, then the video line', () => {
        const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 10000, output: 2000, cacheRead: 0, cacheWrite: 0 }, Cost: 0.0165 }, video);
        expect(lines).toEqual([
            { Modality: null, CostRowID: 'row-1', Measure: 'Tokens', Input: 10000, Output: 2000, Cost: 0.0165 },
            { Modality: 'Video', CostRowID: null, Measure: 'Seconds', Input: 0, Output: 60, Cost: 0.37152 },
        ]);
    });

    it('writes the default line alone without a priced video line, counting cache reads and writes as input', () => {
        const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 4 }, Cost: 1 / 3 }, null);
        expect(lines).toEqual([{ Modality: null, CostRowID: 'row-1', Measure: 'Tokens', Input: 134, Output: 20, Cost: 0.33333333 }]);
    });
});

describe('WriteCostLines and ReadCostLines', () => {
    const lines = BuildCostLines({ CostRowID: 'row-1', Measure: 'Tokens', Usage: { input: 10, output: 2 }, Cost: 0.5 }, { Priced: true, Seconds: 6, Cost: 0.25, VideoTokens: 0 });

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
