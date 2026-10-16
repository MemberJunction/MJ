import { describe, expect, it } from 'vitest';
import {
    AudioCue,
    NarrationLine,
    ValidateVideoGenerationSpec,
    VIDEO_STUDIO_SPEC_VERSION,
    VideoBeat,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    FitTimelineToNarration,
    NARRATION_LEAD_IN_SECONDS,
    NARRATION_LINE_GAP_SECONDS,
    NARRATION_TAIL_SECONDS,
} from '../narration/narration-timeline.js';

function makeBeat(key: string, start: number, end: number, narrationKey?: string): VideoBeat {
    return {
        Key: key,
        Label: `Beat ${key}`,
        StartSeconds: start,
        EndSeconds: end,
        EntryState: 'Initial canvas',
        ExitState: 'Resolved frame',
        Purpose: `Purpose for ${key}`,
        OnScreenText: [`Title ${key}`],
        NarrationKey: narrationKey,
        DataRefs: [],
        AssetRefs: ['brand-logo'],
        LayoutNotes: { '16:9': 'Centered' },
    };
}

function makePreProducedSpecWithThreeBeats(): VideoGenerationSpec {
    return {
        SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
        Status: 'PreProduced',
        Archetype: { Name: 'MetricStory' },
        BrandKitID: 'bk-001',
        Film: {
            OneSentence: 'Show quarterly metrics clearly.',
            Audience: 'Leadership',
            Purpose: 'Executive briefing',
            DurationSeconds: 14,
            Formats: ['16:9'],
        },
        Assets: {
            Required: [],
            Approved: [
                {
                    Key: 'brand-logo',
                    Kind: 'Logo',
                    Source: 'Primary Logo',
                    FileID: 'file-logo',
                    Provenance: 'BrandKit',
                    Usage: 'Watermark',
                    MustUse: true,
                },
                {
                    Key: 'brand-font',
                    Kind: 'Font',
                    Source: 'Display Font',
                    FileID: 'file-font',
                    Provenance: 'BrandKit',
                    Usage: 'Headlines',
                    MustUse: true,
                },
                {
                    Key: 'whoosh-sfx',
                    Kind: 'SoundEffect',
                    Source: 'Whoosh SFX',
                    FileID: 'file-sfx',
                    Provenance: 'Supplied',
                    Usage: 'Transition accent',
                    MustUse: false,
                },
            ],
            Generate: [],
            NeverInvent: ['logo'],
        },
        Style: {
            Palette: [
                { Name: 'Surface', Value: '#0F172A', Usage: 'Background' },
                { Name: 'Ink', Value: '#F8FAFC', Usage: 'PrimaryText' },
            ],
            Typography: [
                {
                    Role: 'Display',
                    FontFamily: 'Inter',
                    Weight: 700,
                    FontAssetKey: 'brand-font',
                    SizeByFormat: { '16:9': '64px' },
                },
            ],
            Composition: 'Clean layout',
            Pacing: {
                AvgSecondsBetweenChanges: 4,
                HoldRules: 'Hold metrics for 1.5s',
            },
            MotionRules: [
                {
                    ObjectClass: 'DataMetric',
                    Easing: 'ease-out',
                    DurationMs: 500,
                    Notes: 'Smooth entry',
                },
            ],
            Keep: ['High contrast'],
            Avoid: ['Clutter'],
            References: [],
        },
        Beats: [
            makeBeat('beat-1', 0, 4, 'line-1'),
            makeBeat('beat-2', 4, 10, 'line-2'),
            makeBeat('beat-3', 10, 14, 'line-3'),
        ],
        StateList: [],
        DataBindings: [],
        DataSnapshot: {
            AsOf: '2026-10-16T00:00:00Z',
            Inline: {},
            Sources: [],
        },
        Audio: {
            Narration: {
                VoiceID: 'voice-1',
                Provider: 'ElevenLabs',
                Script: [
                    {
                        Key: 'line-1',
                        BeatKey: 'beat-1',
                        Text: 'First beat narration.',
                        DurationSeconds: 4.2,
                        WordTimings: [
                            { Word: 'First', StartSeconds: 0.0, EndSeconds: 1.2 },
                            { Word: 'beat', StartSeconds: 1.3, EndSeconds: 2.5 },
                            { Word: 'narration.', StartSeconds: 2.6, EndSeconds: 4.2 },
                        ],
                    },
                    {
                        Key: 'line-2',
                        BeatKey: 'beat-2',
                        Text: 'Second beat narration.',
                        DurationSeconds: 6.0,
                        WordTimings: [
                            { Word: 'Second', StartSeconds: 0.0, EndSeconds: 2.0 },
                            { Word: 'beat', StartSeconds: 2.1, EndSeconds: 4.0 },
                            { Word: 'narration.', StartSeconds: 4.1, EndSeconds: 6.0 },
                        ],
                    },
                    {
                        Key: 'line-3',
                        BeatKey: 'beat-3',
                        Text: 'Third beat narration.',
                        DurationSeconds: 3.1,
                        WordTimings: [
                            { Word: 'Third', StartSeconds: 0.0, EndSeconds: 1.0 },
                            { Word: 'beat', StartSeconds: 1.1, EndSeconds: 2.0 },
                            { Word: 'narration.', StartSeconds: 2.1, EndSeconds: 3.1 },
                        ],
                    },
                ],
            },
            Captions: 'Burned',
            Cues: [
                {
                    Key: 'cue-mid-b2',
                    TimestampSeconds: 7,
                    Kind: 'Sfx',
                    AssetKey: 'whoosh-sfx',
                    BeatKey: 'beat-2',
                },
            ],
        },
        Render: {
            Renderer: 'HyperFrames',
            RendererVersion: '0.1.8',
            Fps: 30,
            Seed: 1,
            Quality: 'standard',
        },
        Deliverables: {
            Formats: ['16:9'],
            Poster: true,
            ContactSheets: true,
            Source: true,
            Captions: true,
        },
        Interaction: {
            Mode: 'Autonomous',
            MaxRepairRounds: 2,
        },
        Review: {
            Gates: [],
            Rounds: [],
        },
    };
}

describe('FitTimelineToNarration', () => {
    it('exports expected padding constants', () => {
        expect(NARRATION_LEAD_IN_SECONDS).toBe(0.3);
        expect(NARRATION_TAIL_SECONDS).toBe(0.5);
        expect(NARRATION_LINE_GAP_SECONDS).toBe(0.2);
    });

    it('fits 3 beats (0-4, 4-10, 10-14) with 4.2s / 6.0s / 3.1s lines to 5.0 / 6.8 / 3.9s (total 15.7s) and shifts word timings', () => {
        const spec = makePreProducedSpecWithThreeBeats();
        const inputBeats = spec.Beats;
        const inputLines = spec.Audio.Narration!.Script;
        const inputCues = spec.Audio.Cues;

        const snapshotBefore = structuredClone({ inputBeats, inputLines, inputCues });

        const result = FitTimelineToNarration({
            Beats: inputBeats,
            Lines: inputLines,
            Cues: inputCues,
            Pacing: spec.Style.Pacing,
        });

        expect({ inputBeats, inputLines, inputCues }).toEqual(snapshotBefore);
        expect(result.Issues).toEqual([]);
        expect(result.DurationSeconds).toBe(15.7);

        expect(result.Beats.map((b) => ({ Key: b.Key, Start: b.StartSeconds, End: b.EndSeconds }))).toEqual([
            { Key: 'beat-1', Start: 0, End: 5.0 },
            { Key: 'beat-2', Start: 5.0, End: 11.8 },
            { Key: 'beat-3', Start: 11.8, End: 15.7 },
        ]);

        expect(result.Lines[0].StartSeconds).toBe(0.3);
        expect(result.Lines[1].StartSeconds).toBe(5.3);
        expect(result.Lines[2].StartSeconds).toBe(12.1);

        expect(result.Lines[0].WordTimings).toEqual([
            { Word: 'First', StartSeconds: 0.3, EndSeconds: 1.5 },
            { Word: 'beat', StartSeconds: 1.6, EndSeconds: 2.8 },
            { Word: 'narration.', StartSeconds: 2.9, EndSeconds: 4.5 },
        ]);
        expect(result.Lines[1].WordTimings?.[0]).toEqual({
            Word: 'Second',
            StartSeconds: 5.3,
            EndSeconds: 7.3,
        });
        expect(result.Lines[2].WordTimings?.[2]).toEqual({
            Word: 'narration.',
            StartSeconds: 14.2,
            EndSeconds: 15.2,
        });

        spec.Beats = result.Beats;
        spec.Audio.Narration!.Script = result.Lines;
        spec.Audio.Cues = result.Cues;
        spec.Film.DurationSeconds = result.DurationSeconds;

        const validation = ValidateVideoGenerationSpec(spec, 'PreProduced');
        expect(validation.Valid).toBe(true);
        expect(validation.Errors).toEqual([]);
    });

    it('preserves storyboard length on beats with no narration line and sequences multiple lines with 0.2s gap', () => {
        const beats: VideoBeat[] = [
            makeBeat('beat-1', 0, 3.5),
            makeBeat('beat-2', 3.5, 8.5, 'line-2a'),
        ];
        const lines: NarrationLine[] = [
            {
                Key: 'line-2a',
                BeatKey: 'beat-2',
                Text: 'Part A.',
                DurationSeconds: 2.0,
                WordTimings: [{ Word: 'Part', StartSeconds: 0, EndSeconds: 2.0 }],
            },
            {
                Key: 'line-2b',
                BeatKey: 'beat-2',
                Text: 'Part B.',
                DurationSeconds: 1.5,
                WordTimings: [{ Word: 'B.', StartSeconds: 0, EndSeconds: 1.5 }],
            },
        ];

        const result = FitTimelineToNarration({
            Beats: beats,
            Lines: lines,
            Cues: [],
        });

        expect(result.Beats[0].StartSeconds).toBe(0);
        expect(result.Beats[0].EndSeconds).toBe(3.5);
        // beat-2 length = 0.3 + 2.0 + 0.2 + 1.5 + 0.5 = 4.5
        expect(result.Beats[1].StartSeconds).toBe(3.5);
        expect(result.Beats[1].EndSeconds).toBe(8.0);
        expect(result.DurationSeconds).toBe(8.0);

        expect(result.Lines[0].StartSeconds).toBe(3.8);
        expect(result.Lines[0].WordTimings).toEqual([{ Word: 'Part', StartSeconds: 3.8, EndSeconds: 5.8 }]);
        expect(result.Lines[1].StartSeconds).toBe(6.0);
        expect(result.Lines[1].WordTimings).toEqual([{ Word: 'B.', StartSeconds: 6.0, EndSeconds: 7.5 }]);
    });

    it('raises short beats to MinBeatDurationSeconds and emits NarrationExceedsBeatMax without cutting speech', () => {
        const beats: VideoBeat[] = [
            makeBeat('beat-short', 0, 4, 'line-short'),
            makeBeat('beat-long', 4, 8, 'line-long'),
        ];
        const lines: NarrationLine[] = [
            { Key: 'line-short', BeatKey: 'beat-short', Text: 'Short.', DurationSeconds: 1.0 },
            { Key: 'line-long', BeatKey: 'beat-long', Text: 'Very long speech.', DurationSeconds: 7.0 },
        ];

        const result = FitTimelineToNarration({
            Beats: beats,
            Lines: lines,
            Cues: [],
            Pacing: {
                AvgSecondsBetweenChanges: 4,
                HoldRules: 'Hold',
                MinBeatDurationSeconds: 3.0,
                MaxBeatDurationSeconds: 6.0,
            },
        });

        // beat-short raw = 1.8s -> raised to 3.0s
        expect(result.Beats[0].StartSeconds).toBe(0);
        expect(result.Beats[0].EndSeconds).toBe(3.0);
        // beat-long raw = 7.8s > 6.0s -> kept at 7.8s, warning emitted
        expect(result.Beats[1].StartSeconds).toBe(3.0);
        expect(result.Beats[1].EndSeconds).toBe(10.8);
        expect(result.Issues).toHaveLength(1);
        expect(result.Issues[0]).toMatchObject({
            Code: 'NarrationExceedsBeatMax',
            Severity: 'Warning',
            BeatKey: 'beat-long',
        });
    });

    it('re-times cues proportionally, prioritizes BeatKey over old timestamp position, and flags out-of-bounds film duration', () => {
        const beats: VideoBeat[] = [
            makeBeat('beat-1', 0, 4, 'line-1'),
            makeBeat('beat-2', 4, 10, 'line-2'),
            makeBeat('beat-3', 10, 14, 'line-3'),
        ];
        const lines: NarrationLine[] = [
            { Key: 'line-1', BeatKey: 'beat-1', Text: 'One', DurationSeconds: 4.2 },
            { Key: 'line-2', BeatKey: 'beat-2', Text: 'Two', DurationSeconds: 6.0 },
            { Key: 'line-3', BeatKey: 'beat-3', Text: 'Three', DurationSeconds: 3.1 },
        ];
        const cues: AudioCue[] = [
            // 50% into old beat-2 (4..10 => 7.0s) by position alone
            { Key: 'cue-pos', TimestampSeconds: 7.0, Kind: 'Sfx', AssetKey: 'sfx-1' },
            // Explicitly pinned to beat-1 via BeatKey even though timestamp 7.0 lies in beat-2 (4..10) by position
            { Key: 'cue-key', TimestampSeconds: 7.0, Kind: 'Sfx', BeatKey: 'beat-1' },
            // Unknown BeatKey -> warning, timestamp unchanged
            { Key: 'cue-missing', TimestampSeconds: 2.5, Kind: 'MusicDuck', BeatKey: 'beat-nonexistent' },
        ];

        const result = FitTimelineToNarration({
            Beats: beats,
            Lines: lines,
            Cues: cues,
            FilmBounds: { MinSeconds: 20, MaxSeconds: 30 },
        });

        // New beat-2 is 5.0..11.8 (length 6.8), 50% => 8.4s
        expect(result.Cues[0].TimestampSeconds).toBe(8.4);
        // Pinned to beat-1 (old 0..4, new 0..5.0); 7.0 clamps to fraction 1.0 of beat-1 => 5.0s (not 8.4s from beat-2)
        expect(result.Cues[1].TimestampSeconds).toBe(5.0);
        // Unmatched cue stays at 2.5s
        expect(result.Cues[2].TimestampSeconds).toBe(2.5);

        const issueCodes = result.Issues.map((i) => i.Code);
        expect(issueCodes).toContain('CueBeatNotFound');
        expect(issueCodes).toContain('FilmDurationOutOfBounds');
    });
});
