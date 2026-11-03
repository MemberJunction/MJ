/**
 * Unit tests for `MapRealtimeUsageModalityDetail`: the shared mapping of an OpenAI-protocol usage block
 * (`input_token_details` / `output_token_details`) onto the per-modality fields realtime pricing reads.
 */
import { describe, it, expect } from 'vitest';
import { MapRealtimeUsageModalityDetail } from '../generic/realtimeUsage';

describe('MapRealtimeUsageModalityDetail', () => {
    it('maps every field OpenAI reports', () => {
        expect(MapRealtimeUsageModalityDetail({ text_tokens: 20, audio_tokens: 70, image_tokens: 3, cached_tokens: 10 })).toEqual({
            TextTokens: 20,
            AudioTokens: 70,
            ImageTokens: 3,
            CachedTokens: 10,
        });
    });

    it('maps only the fields present, keeping a 0', () => {
        expect(MapRealtimeUsageModalityDetail({ audio_tokens: 5 })).toEqual({ AudioTokens: 5 });
        expect(MapRealtimeUsageModalityDetail({ image_tokens: 2, cached_tokens: 0 })).toEqual({ ImageTokens: 2, CachedTokens: 0 });
    });

    it('ignores nested blocks and unknown keys', () => {
        expect(MapRealtimeUsageModalityDetail({ audio_tokens: 5, cached_tokens_details: { audio_tokens: 1 }, other: 9 })).toEqual({ AudioTokens: 5 });
    });

    it('drops values that are not finite numbers of at least 0', () => {
        expect(MapRealtimeUsageModalityDetail({ text_tokens: '4', audio_tokens: -1, image_tokens: Number.NaN, cached_tokens: Infinity })).toBeUndefined();
        expect(MapRealtimeUsageModalityDetail({ text_tokens: 4, audio_tokens: null })).toEqual({ TextTokens: 4 });
    });

    it('is undefined for an absent, empty or non-object block', () => {
        for (const block of [undefined, null, {}, [], 'x', 7]) {
            expect(MapRealtimeUsageModalityDetail(block)).toBeUndefined();
        }
    });
});
