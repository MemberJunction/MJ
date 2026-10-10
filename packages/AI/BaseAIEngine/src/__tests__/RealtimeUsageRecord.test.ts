/**
 * Unit tests for the realtime usage record: how usage updates add up (amounts sum, inbound running totals keep the
 * larger value), how the record is read from and merged into a prompt run's `ModelSpecificResponseDetails`, and the caps
 * on stored output video seconds and output video tokens.
 */
import { describe, it, expect } from 'vitest';
import {
    AddRealtimeUsageRecord,
    HasRealtimeUsage,
    MergeRealtimeUsageRecord,
    ParseRealtimeUsageRecord,
    ReadRealtimeUsageRecord,
    REALTIME_USAGE_DETAILS_KEY,
} from '../RealtimeUsageRecord';

/** The record a merge stored, parsed back out of the details JSON. */
function storedRecord(details: string | undefined): unknown {
    return details ? (JSON.parse(details) as Record<string, unknown>)[REALTIME_USAGE_DETAILS_KEY] : undefined;
}

describe('AddRealtimeUsageRecord', () => {
    it('adds token amounts in both directions', () => {
        const sum = AddRealtimeUsageRecord(
            { Input: { TextTokens: 100, AudioTokens: 50 }, Output: { AudioTokens: 20 } },
            { Input: { TextTokens: 10, ImageTokens: 5 }, Output: { AudioTokens: 2, TextTokens: 3, VideoTokens: 7 } }
        );
        expect(sum).toEqual({
            Input: { TextTokens: 110, AudioTokens: 50, ImageTokens: 5 },
            Output: { AudioTokens: 22, TextTokens: 3, VideoTokens: 7 },
        });
    });

    it('adds output video seconds: each update is the video generated since the last one', () => {
        const sum = AddRealtimeUsageRecord({ Output: { VideoSeconds: 4.5 } }, { Output: { VideoSeconds: 2.25 } });
        expect(sum.Output?.VideoSeconds).toBe(6.75);
    });

    it('keeps the larger inbound VideoFrames and VideoSeconds: they are running totals, not amounts', () => {
        const sum = AddRealtimeUsageRecord({ Input: { VideoFrames: 40, VideoSeconds: 20 } }, { Input: { VideoFrames: 46, VideoSeconds: 23 } });
        expect(sum.Input).toEqual({ VideoFrames: 46, VideoSeconds: 23 });
        expect(AddRealtimeUsageRecord(sum, { Input: { VideoFrames: 12 } }).Input?.VideoFrames).toBe(46);
    });

    it('keeps seconds to the millisecond and counts as whole numbers', () => {
        const sum = AddRealtimeUsageRecord({ Output: { VideoSeconds: 1 / 24, AudioTokens: 3 } }, { Output: { VideoSeconds: 1 / 24, AudioTokens: 2.9 } });
        expect(sum.Output).toEqual({ VideoSeconds: 0.083, AudioTokens: 5 });
    });

    it('ignores values that are not finite numbers of at least 0', () => {
        const update = { Output: { VideoSeconds: Number.NaN, AudioTokens: -5, TextTokens: Number.POSITIVE_INFINITY } };
        expect(AddRealtimeUsageRecord({ Output: { AudioTokens: 1 } }, update)).toEqual({ Output: { AudioTokens: 1 } });
    });

    it('changes neither argument', () => {
        const record = { Output: { VideoSeconds: 1 } };
        const update = { Output: { VideoSeconds: 2 } };
        AddRealtimeUsageRecord(record, update);
        expect(record).toEqual({ Output: { VideoSeconds: 1 } });
        expect(update).toEqual({ Output: { VideoSeconds: 2 } });
    });

    it('starts from nothing', () => {
        expect(AddRealtimeUsageRecord(null, { Input: { AudioTokens: 9 } })).toEqual({ Input: { AudioTokens: 9 } });
        expect(AddRealtimeUsageRecord(undefined, {})).toEqual({});
    });

    it('keeps the larger session duration: a running total, to the millisecond', () => {
        expect(AddRealtimeUsageRecord({ DurationSeconds: 45 }, { DurationSeconds: 40 })).toEqual({ DurationSeconds: 45 });
        expect(AddRealtimeUsageRecord({ DurationSeconds: 45 }, { DurationSeconds: 50.12345 })).toEqual({ DurationSeconds: 50.123 });
        expect(AddRealtimeUsageRecord(null, { DurationSeconds: -1 })).toEqual({});
    });
});

describe('HasRealtimeUsage', () => {
    it('is true for any field above 0, a seconds-only update included', () => {
        expect(HasRealtimeUsage({ Output: { VideoSeconds: 0.5 } })).toBe(true);
        expect(HasRealtimeUsage({ Input: { TextTokens: 1 } })).toBe(true);
    });

    it('is false for nothing, empty blocks or zeros', () => {
        expect(HasRealtimeUsage(null)).toBe(false);
        expect(HasRealtimeUsage({ Input: {}, Output: { AudioTokens: 0 } })).toBe(false);
        expect(HasRealtimeUsage({ DurationSeconds: 0 })).toBe(false);
    });

    it('is true for a session duration alone', () => {
        expect(HasRealtimeUsage({ DurationSeconds: 12 })).toBe(true);
    });
});

describe('ParseRealtimeUsageRecord', () => {
    it('keeps only the fields a modality block defines, with usable values', () => {
        const json = JSON.stringify({
            Input: { TextTokens: 10, Bogus: 5, AudioTokens: 'many' },
            Output: { VideoSeconds: 3.25, VideoTokens: -1 },
            Extra: { TextTokens: 1 },
        });
        expect(ParseRealtimeUsageRecord(json)).toEqual({ Input: { TextTokens: 10 }, Output: { VideoSeconds: 3.25 } });
    });

    it('is null for absent, blank, malformed or empty input', () => {
        for (const json of [null, undefined, '', '  ', '{broken', '[1,2]', '"text"', '{}', '{"Input":{"Bogus":1}}']) {
            expect(ParseRealtimeUsageRecord(json)).toBeNull();
        }
    });

    it('drops a relayed DurationSeconds: only a server-side session writes it', () => {
        expect(ParseRealtimeUsageRecord(JSON.stringify({ Output: { AudioTokens: 3 }, DurationSeconds: 99 }))).toEqual({ Output: { AudioTokens: 3 } });
        expect(ParseRealtimeUsageRecord(JSON.stringify({ DurationSeconds: 99 }))).toBeNull();
    });
});

describe('ReadRealtimeUsageRecord', () => {
    it('reads the record under RealtimeUsage', () => {
        const details = JSON.stringify({ RealtimeUsage: { Output: { VideoSeconds: 60, VideoTokens: 371520 } }, CostLines: [] });
        expect(ReadRealtimeUsageRecord(details)).toEqual({ Output: { VideoSeconds: 60, VideoTokens: 371520 } });
    });

    it('reads a stored session duration, to the millisecond', () => {
        expect(ReadRealtimeUsageRecord(JSON.stringify({ RealtimeUsage: { DurationSeconds: 42 } }))).toEqual({ DurationSeconds: 42 });
        expect(ReadRealtimeUsageRecord(JSON.stringify({ RealtimeUsage: { DurationSeconds: 42.00049 } }))).toEqual({ DurationSeconds: 42 });
    });

    it('is null, never a throw, for details that are malformed or hold no record', () => {
        for (const details of [null, '', '{not json', '42', JSON.stringify({ Other: 1 }), JSON.stringify({ RealtimeUsage: [1] })]) {
            expect(ReadRealtimeUsageRecord(details)).toBeNull();
        }
    });
});

describe('MergeRealtimeUsageRecord', () => {
    it('starts the record in empty details', () => {
        const merged = MergeRealtimeUsageRecord(null, { Output: { VideoSeconds: 2 } });
        expect(merged).toEqual({ Details: JSON.stringify({ RealtimeUsage: { Output: { VideoSeconds: 2 } } }), ClampedVideoSeconds: 0, ClampedVideoTokens: 0 });
    });

    it('adds into the stored record and keeps CostLines and every other key', () => {
        const details = JSON.stringify({ Provider: 'x', RealtimeUsage: { Output: { VideoSeconds: 10, AudioTokens: 100 } }, CostLines: [{ Cost: 1 }] });
        const merged = MergeRealtimeUsageRecord(details, { Output: { VideoSeconds: 5, VideoTokens: 30960 } });
        expect(JSON.parse(merged?.Details ?? '{}')).toEqual({
            Provider: 'x',
            RealtimeUsage: { Output: { VideoSeconds: 15, AudioTokens: 100, VideoTokens: 30960 } },
            CostLines: [{ Cost: 1 }],
        });
    });

    it("keeps keys of the stored record and its blocks that it does not define (another writer's)", () => {
        const details = JSON.stringify({ RealtimeUsage: { Writer: 'other', Output: { AudioTokens: 1, Note: 'kept' } } });
        const merged = MergeRealtimeUsageRecord(details, { Output: { AudioTokens: 2 } });
        expect(storedRecord(merged?.Details)).toEqual({ Writer: 'other', Output: { AudioTokens: 3, Note: 'kept' } });
    });

    it('stores the session duration, keeping the larger value', () => {
        const details = JSON.stringify({ RealtimeUsage: { DurationSeconds: 61 } });
        expect(storedRecord(MergeRealtimeUsageRecord(details, { DurationSeconds: 50, Output: { AudioTokens: 1 } })?.Details))
            .toEqual({ DurationSeconds: 61, Output: { AudioTokens: 1 } });
        expect(storedRecord(MergeRealtimeUsageRecord(details, { DurationSeconds: 70 })?.Details)).toEqual({ DurationSeconds: 70 });
    });

    it('caps the stored output video seconds and reports what it dropped', () => {
        const details = JSON.stringify({ RealtimeUsage: { Output: { VideoSeconds: 80 } } });
        const merged = MergeRealtimeUsageRecord(details, { Output: { VideoSeconds: 30 } }, { MaxOutputVideoSeconds: 95.5 });
        expect(storedRecord(merged?.Details)).toEqual({ Output: { VideoSeconds: 95.5 } });
        expect(merged?.ClampedVideoSeconds).toBe(14.5);
    });

    it('leaves seconds under the cap alone', () => {
        const merged = MergeRealtimeUsageRecord(null, { Output: { VideoSeconds: 30 } }, { MaxOutputVideoSeconds: 95.5 });
        expect(storedRecord(merged?.Details)).toEqual({ Output: { VideoSeconds: 30 } });
        expect(merged?.ClampedVideoSeconds).toBe(0);
    });

    it('caps the stored output video tokens at a whole number and reports what it dropped', () => {
        const details = JSON.stringify({ RealtimeUsage: { Output: { VideoTokens: 500000, AudioTokens: 10 } } });
        const merged = MergeRealtimeUsageRecord(details, { Output: { VideoTokens: 100000 } }, { MaxOutputVideoTokens: 557280.5 });
        expect(storedRecord(merged?.Details)).toEqual({ Output: { VideoTokens: 557280, AudioTokens: 10 } });
        expect(merged?.ClampedVideoTokens).toBe(42720);
    });

    it('caps output video seconds and tokens each by its own limit, and never the input', () => {
        const update = { Input: { VideoTokens: 9000000, VideoSeconds: 400 }, Output: { VideoSeconds: 120, VideoTokens: 6192 } };
        const merged = MergeRealtimeUsageRecord(null, update, { MaxOutputVideoSeconds: 90, MaxOutputVideoTokens: 557280 });
        expect(storedRecord(merged?.Details)).toEqual({ Input: { VideoTokens: 9000000, VideoSeconds: 400 }, Output: { VideoSeconds: 90, VideoTokens: 6192 } });
        expect(merged).toMatchObject({ ClampedVideoSeconds: 30, ClampedVideoTokens: 0 });
    });

    it('never overwrites details that are not a JSON object', () => {
        expect(MergeRealtimeUsageRecord('{broken', { Output: { VideoSeconds: 1 } })).toBeNull();
        expect(MergeRealtimeUsageRecord('[1]', { Output: { VideoSeconds: 1 } })).toBeNull();
    });
});
