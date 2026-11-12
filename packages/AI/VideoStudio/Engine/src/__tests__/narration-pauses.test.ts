import { describe, expect, it } from 'vitest';
import type { NarrationLine, VideoBeat } from '@memberjunction/video-studio-core';
import {
    FitTimelineToNarration,
    NARRATION_LEAD_IN_SECONDS,
    NARRATION_LINE_GAP_SECONDS,
    NARRATION_TAIL_SECONDS,
    ResolveBeatLinePauses,
} from '../narration/narration-timeline.js';

function beat(key: string, start: number, end: number): VideoBeat {
    return {
        Key: key,
        Label: key,
        StartSeconds: start,
        EndSeconds: end,
        EntryState: 'a',
        ExitState: 'b',
        Purpose: 'p',
        OnScreenText: [],
        DataRefs: [],
        AssetRefs: [],
        LayoutNotes: { '16:9': 'x' },
    };
}

function line(key: string, beatKey: string, duration: number, extra: Partial<NarrationLine> = {}): NarrationLine {
    return { Key: key, BeatKey: beatKey, Text: key, DurationSeconds: duration, ...extra };
}

describe('ResolveBeatLinePauses', () => {
    it('keeps the defaults when no line sets a pause', () => {
        expect(ResolveBeatLinePauses([{}, {}, {}])).toEqual({
            LeadInSeconds: NARRATION_LEAD_IN_SECONDS,
            GapSeconds: [NARRATION_LINE_GAP_SECONDS, NARRATION_LINE_GAP_SECONDS],
            TailSeconds: NARRATION_TAIL_SECONDS,
        });
        expect(ResolveBeatLinePauses([])).toEqual({ LeadInSeconds: 0, GapSeconds: [], TailSeconds: 0 });
    });

    it('replaces a default on its side and adds two explicit sides together', () => {
        expect(
            ResolveBeatLinePauses([
                { PauseBeforeSeconds: 1 },
                { PauseBeforeSeconds: 1.2 },
                { PauseAfterSeconds: 0.4 },
                { PauseBeforeSeconds: 0.6, PauseAfterSeconds: 0 },
            ]),
        ).toEqual({ LeadInSeconds: 1, GapSeconds: [1.2, NARRATION_LINE_GAP_SECONDS, 1], TailSeconds: 0 });
    });

    it('clamps out-of-range values to 0..3 and ignores non-finite ones', () => {
        expect(ResolveBeatLinePauses([{ PauseBeforeSeconds: 9, PauseAfterSeconds: -1 }])).toEqual({
            LeadInSeconds: 3,
            GapSeconds: [],
            TailSeconds: 0,
        });
        expect(ResolveBeatLinePauses([{ PauseBeforeSeconds: Number.NaN }]).LeadInSeconds).toBe(NARRATION_LEAD_IN_SECONDS);
    });
});

describe('FitTimelineToNarration with per-line pauses', () => {
    it('is unchanged when no pauses are set', () => {
        const result = FitTimelineToNarration({
            Beats: [beat('b1', 0, 5)],
            Lines: [line('l1', 'b1', 2), line('l2', 'b1', 1)],
            Cues: [],
        });
        expect(result.Lines.map((l) => l.StartSeconds)).toEqual([0.3, 2.5]);
        expect(result.DurationSeconds).toBe(4);
    });

    it('holds a dramatic beat before a reveal and shifts everything after it', () => {
        const result = FitTimelineToNarration({
            Beats: [beat('b1', 0, 5), beat('b2', 5, 10)],
            Lines: [
                line('l1', 'b1', 2, { WordTimings: [{ Word: 'w', StartSeconds: 0.1, EndSeconds: 0.4 }] }),
                line('reveal', 'b1', 1, { PauseBeforeSeconds: 1.5, PauseAfterSeconds: 1 }),
                line('l3', 'b2', 1),
            ],
            Cues: [],
        });
        // b1: 0.3 lead-in + 2 + 1.5 pause + 1 + 1.0 tail = 5.8
        expect(result.Lines.map((l) => l.StartSeconds)).toEqual([0.3, 3.8, 6.1]);
        expect(result.Lines[0].WordTimings?.[0]).toEqual({ Word: 'w', StartSeconds: 0.4, EndSeconds: 0.7 });
        expect(result.Beats.map((b) => [b.StartSeconds, b.EndSeconds])).toEqual([
            [0, 5.8],
            [5.8, 7.6],
        ]);
        expect(result.DurationSeconds).toBe(7.6);
    });
});
