import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AUDIO_CHECK_THRESHOLDS,
    DEFAULT_LOUDNESS_TARGET,
    type RenderAudioNarrationTrack,
} from '@memberjunction/video-studio-core';
import {
    CountExpectedPauses,
    EvaluateAudioChecks,
    FindUnexpectedLinePauses,
    MJ_AUDIO_CLIPPING_CODE,
    MJ_AUDIO_LINE_PAUSE_CODE,
    MJ_AUDIO_LOUDNESS_CODE,
    MJ_AUDIO_MISSING_CODE,
    MJ_AUDIO_NARRATION_MASKED_CODE,
    MJ_AUDIO_SOURCE_MISSING_CODE,
    MJ_AUDIO_TRUE_PEAK_CODE,
    ParseAstatsOverall,
    ParseEbur128Summary,
    ParseLoudnormJson,
    ParseSilenceDetect,
    type AudioCheckInput,
} from '../index.js';

const EBUR128_STDERR = `
[Parsed_ebur128_0 @ 0x557d1b280b40] t: 2.9   TARGET:-23 LUFS    M: -26.8 S: -26.8     I: -26.8 LUFS       LRA:   0.0 LU
[Parsed_ebur128_0 @ 0x557d1b280b40] Summary:

  Integrated loudness:
    I:         -14.2 LUFS
    Threshold: -24.5 LUFS

  Loudness range:
    LRA:         6.3 LU
    Threshold: -34.6 LUFS
    LRA low:   -19.0 LUFS
    LRA high:  -12.7 LUFS

  True peak:
    Peak:       -1.7 dBFS
[Parsed_astats_1 @ 0x557d1b283680] Channel: 1
[Parsed_astats_1 @ 0x557d1b283680] Peak level dB: -0.5
[Parsed_astats_1 @ 0x557d1b283680] Overall
[Parsed_astats_1 @ 0x557d1b283680] Peak level dB: -2.103475
[Parsed_astats_1 @ 0x557d1b283680] Peak count: 3.000000
`;

describe('ffmpeg output parsers', () => {
    it('reads the ebur128 summary (not the running frame log)', () => {
        expect(ParseEbur128Summary(EBUR128_STDERR)).toEqual({ IntegratedLufs: -14.2, LoudnessRangeLu: 6.3, TruePeakDb: -1.7 });
    });

    it('maps -inf loudness to -Infinity and a missing summary to undefined', () => {
        expect(ParseEbur128Summary('Summary:\n I:  -inf LUFS\n').IntegratedLufs).toBe(Number.NEGATIVE_INFINITY);
        expect(ParseEbur128Summary('nothing here')).toEqual({ IntegratedLufs: undefined, LoudnessRangeLu: undefined, TruePeakDb: undefined });
    });

    it('reads the astats Overall section only', () => {
        expect(ParseAstatsOverall(EBUR128_STDERR)).toEqual({ PeakLevelDb: -2.103475, PeakCount: 3 });
    });

    it('pairs silence starts and ends, closing an open silence at the end', () => {
        const stderr = [
            '[silencedetect @ 0x1] silence_start: 0',
            '[silencedetect @ 0x1] silence_end: 0.31 | silence_duration: 0.31',
            '[silencedetect @ 0x1] silence_start: 1.42',
            '[silencedetect @ 0x1] silence_end: 1.71 | silence_duration: 0.29',
            '[silencedetect @ 0x1] silence_start: 4.9',
        ].join('\n');
        expect(ParseSilenceDetect(stderr, 6)).toEqual([
            { Start: 0, End: 0.31 },
            { Start: 1.42, End: 1.71 },
            { Start: 4.9, End: 6 },
        ]);
    });

    it('reads the loudnorm JSON block and rejects unmeasurable input', () => {
        const json = `[Parsed_loudnorm_0 @ 0x1]\n{\n "input_i" : "-26.85",\n "input_tp" : "-19.42",\n "input_lra" : "0.00",\n "input_thresh" : "-36.85",\n "target_offset" : "-0.10"\n}\n`;
        expect(ParseLoudnormJson(json)).toEqual({ InputI: -26.85, InputTp: -19.42, InputLra: 0, InputThresh: -36.85, TargetOffset: -0.1 });
        expect(ParseLoudnormJson(json.replace('-26.85', '-inf'))).toBeNull();
        expect(ParseLoudnormJson('no json')).toBeNull();
    });
});

describe('CountExpectedPauses', () => {
    it('counts interior punctuation followed by a space, not dots inside tokens, acronyms, or the final mark', () => {
        expect(CountExpectedPauses('Own your data, own your future.')).toBe(1);
        expect(CountExpectedPauses('Wait — what? Really.')).toBe(2);
        expect(CountExpectedPauses('Version 3.5 ships today.')).toBe(0);
        expect(CountExpectedPauses('Our A.I. tools help.')).toBe(0);
        expect(CountExpectedPauses('"Hello," she said.')).toBe(1);
    });
});

describe('FindUnexpectedLinePauses', () => {
    const base: RenderAudioNarrationTrack = { Key: 'l1', BeatKey: 'b1', Src: 'a.mp3', StartSeconds: 1, DurationSeconds: 3, Text: 'Our A.I. platform, built for you.' };

    it('ignores silence touching the line edges and pauses explained by punctuation (word timings)', () => {
        const line: RenderAudioNarrationTrack = {
            ...base,
            WordTimings: [
                { Word: 'Our', StartSeconds: 1.05, EndSeconds: 1.3 },
                { Word: 'A.I.', StartSeconds: 1.35, EndSeconds: 2.1 },
                { Word: 'platform,', StartSeconds: 2.15, EndSeconds: 2.6 },
                { Word: 'built', StartSeconds: 2.9, EndSeconds: 3.1 },
                { Word: 'for', StartSeconds: 3.12, EndSeconds: 3.3 },
                { Word: 'you.', StartSeconds: 3.32, EndSeconds: 3.7 },
            ],
        };
        const silences = [
            { Start: 0.2, End: 1.04 }, // lead-in: touches the start
            { Start: 1.55, End: 1.8 }, // inside "A.I." -> the "A ... I" defect
            { Start: 2.6, End: 2.9 }, // after "platform," -> expected
            { Start: 3.7, End: 4.4 }, // tail: crosses the end
        ];
        expect(FindUnexpectedLinePauses([line], silences, 0.15)).toEqual([
            { LineKey: 'l1', BeatKey: 'b1', Start: 1.55, End: 1.8, InsideWord: 'A.I.' },
        ]);
    });

    it('attributes a gap between unpunctuated words', () => {
        const line: RenderAudioNarrationTrack = {
            ...base,
            Text: 'Own your data',
            WordTimings: [
                { Word: 'Own', StartSeconds: 1.1, EndSeconds: 1.3 },
                { Word: 'your', StartSeconds: 1.8, EndSeconds: 2 },
                { Word: 'data', StartSeconds: 2.05, EndSeconds: 2.5 },
            ],
        };
        expect(FindUnexpectedLinePauses([line], [{ Start: 1.32, End: 1.78 }], 0.15)).toEqual([
            { LineKey: 'l1', BeatKey: 'b1', Start: 1.32, End: 1.78, Between: ['Own', 'your'] },
        ]);
    });

    it('without word timings, reports only the longest pauses beyond the punctuation count', () => {
        const silences = [
            { Start: 1.5, End: 1.7 },
            { Start: 2.0, End: 2.5 },
            { Start: 3.0, End: 3.18 },
            { Start: 3.4, End: 3.45 }, // shorter than the minimum
        ];
        const found = FindUnexpectedLinePauses([base], silences, 0.15);
        expect(found).toEqual([
            { LineKey: 'l1', BeatKey: 'b1', Start: 1.5, End: 1.7 },
            { LineKey: 'l1', BeatKey: 'b1', Start: 2.0, End: 2.5 },
        ]);
    });
});

describe('EvaluateAudioChecks', () => {
    function input(overrides: Partial<AudioCheckInput> = {}): AudioCheckInput {
        return {
            AudioExpected: true,
            HasAudioStream: true,
            MissingSources: [],
            Loudness: { IntegratedLufs: -14.2, LoudnessRangeLu: 5, TruePeakDb: -1.8 },
            Peaks: { PeakLevelDb: -2, PeakCount: 1 },
            Target: { ...DEFAULT_LOUDNESS_TARGET },
            Masking: [{ LineKey: 'l1', BeatKey: 'b1', StartSeconds: 1, RatioDb: 16 }],
            LinePauses: [],
            Thresholds: { ...DEFAULT_AUDIO_CHECK_THRESHOLDS },
            ...overrides,
        };
    }

    it('passes a clean mix', () => {
        expect(EvaluateAudioChecks(input())).toEqual([]);
    });

    it('reports a missing stream or a silent mix and stops there', () => {
        expect(EvaluateAudioChecks(input({ HasAudioStream: false })).map((i) => i.Code)).toEqual([MJ_AUDIO_MISSING_CODE]);
        expect(
            EvaluateAudioChecks(input({ Loudness: { IntegratedLufs: Number.NEGATIVE_INFINITY }, MissingSources: ['audio/l1.mp3'] })).map((i) => i.Code),
        ).toEqual([MJ_AUDIO_SOURCE_MISSING_CODE, MJ_AUDIO_MISSING_CODE]);
        expect(EvaluateAudioChecks(input({ AudioExpected: false, HasAudioStream: false }))).toEqual([]);
    });

    it('reports loudness, true peak, and clipping', () => {
        const codes = EvaluateAudioChecks(
            input({ Loudness: { IntegratedLufs: -19, TruePeakDb: -0.2 }, Peaks: { PeakLevelDb: 0, PeakCount: 40 } }),
        ).map((i) => i.Code);
        expect(codes).toEqual([MJ_AUDIO_LOUDNESS_CODE, MJ_AUDIO_TRUE_PEAK_CODE, MJ_AUDIO_CLIPPING_CODE]);
    });

    it('skips loudness and true-peak checks when normalization is off', () => {
        const codes = EvaluateAudioChecks(
            input({ Target: { ...DEFAULT_LOUDNESS_TARGET, Enabled: false }, Loudness: { IntegratedLufs: -30, TruePeakDb: -0.2 } }),
        ).map((i) => i.Code);
        expect(codes).toEqual([]);
    });

    it('reports masked narration and unexpected pauses with timestamps and beats', () => {
        const issues = EvaluateAudioChecks(
            input({
                Masking: [{ LineKey: 'l1', BeatKey: 'b1', StartSeconds: 4.25, RatioDb: 6.2 }],
                LinePauses: [{ LineKey: 'l2', BeatKey: 'b2', Start: 7.1234, End: 7.4, InsideWord: 'A.I.' }],
            }),
        );
        expect(issues.map((i) => [i.Code, i.Severity, i.Category, i.TimestampSeconds, i.BeatKey])).toEqual([
            [MJ_AUDIO_NARRATION_MASKED_CODE, 'Error', 'Audio', 4.25, 'b1'],
            [MJ_AUDIO_LINE_PAUSE_CODE, 'Error', 'Audio', 7.123, 'b2'],
        ]);
        expect(issues[1].Message).toContain('inside "A.I."');
    });
});
