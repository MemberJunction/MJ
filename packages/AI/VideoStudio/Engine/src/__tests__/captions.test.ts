import { describe, expect, it } from 'vitest';
import { NarrationLine } from '@memberjunction/video-studio-core';
import { BuildWebVtt, FormatWebVttTimestamp } from '../narration/captions.js';

describe('BuildWebVtt', () => {
    it('returns header-only WebVTT for empty input', () => {
        expect(BuildWebVtt([])).toBe('WEBVTT\n');
    });

    it('breaks cues after sentence-ending punctuation (. ? !)', () => {
        const lines: NarrationLine[] = [
            {
                Key: 'line-1',
                BeatKey: 'beat-1',
                Text: 'Revenue grew. Margins expanded! Ready now?',
                WordTimings: [
                    { Word: 'Revenue', StartSeconds: 0.3, EndSeconds: 0.8 },
                    { Word: 'grew.', StartSeconds: 0.9, EndSeconds: 1.4 },
                    { Word: 'Margins', StartSeconds: 1.6, EndSeconds: 2.1 },
                    { Word: 'expanded!', StartSeconds: 2.2, EndSeconds: 2.9 },
                    { Word: 'Ready', StartSeconds: 3.1, EndSeconds: 3.4 },
                    { Word: 'now?', StartSeconds: 3.5, EndSeconds: 4.0 },
                ],
            },
        ];

        const vtt = BuildWebVtt(lines);
        expect(vtt).toBe(
            [
                'WEBVTT',
                '',
                '00:00:00.300 --> 00:00:01.400',
                'Revenue grew.',
                '',
                '00:00:01.600 --> 00:00:02.900',
                'Margins expanded!',
                '',
                '00:00:03.100 --> 00:00:04.000',
                'Ready now?',
                '',
            ].join('\n'),
        );
    });

    it('starts a new cue at 7 words when no sentence punctuation occurs first', () => {
        const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
        const lines: NarrationLine[] = [
            {
                Key: 'line-7w',
                BeatKey: 'beat-1',
                Text: words.join(' '),
                WordTimings: words.map((w, idx) => ({
                    Word: w,
                    StartSeconds: idx * 0.5,
                    EndSeconds: idx * 0.5 + 0.4,
                })),
            },
        ];

        const vtt = BuildWebVtt(lines);
        expect(vtt).toContain('00:00:00.000 --> 00:00:03.400\none two three four five six seven');
        expect(vtt).toContain('00:00:03.500 --> 00:00:04.400\neight nine');
    });

    it('starts a new cue when adding the next word would exceed 42 characters', () => {
        const lines: NarrationLine[] = [
            {
                Key: 'line-42c',
                BeatKey: 'beat-1',
                Text: 'Extraordinarily comprehensive transformation accelerates',
                WordTimings: [
                    // 15 + 1 + 13 + 1 + 14 = 44 chars (> 42 on the 3rd word)
                    { Word: 'Extraordinarily', StartSeconds: 1.0, EndSeconds: 2.0 },
                    { Word: 'comprehensive', StartSeconds: 2.1, EndSeconds: 3.0 },
                    { Word: 'transformation', StartSeconds: 3.1, EndSeconds: 4.0 },
                    { Word: 'accelerates', StartSeconds: 4.1, EndSeconds: 5.0 },
                ],
            },
        ];

        const vtt = BuildWebVtt(lines);
        expect(vtt).toBe(
            [
                'WEBVTT',
                '',
                '00:00:01.000 --> 00:00:03.000',
                'Extraordinarily comprehensive',
                '',
                '00:00:03.100 --> 00:00:05.000',
                'transformation accelerates',
                '',
            ].join('\n'),
        );
    });

    it('formats HH:MM:SS.mmm timestamps over one hour and falls back to whole-line cue when WordTimings are absent', () => {
        expect(FormatWebVttTimestamp(3661.045)).toBe('01:01:01.045');

        const lines: NarrationLine[] = [
            {
                Key: 'line-fallback',
                BeatKey: 'beat-1',
                Text: 'Whole line fallback caption over one hour.',
                StartSeconds: 3661.045,
                DurationSeconds: 4.205,
            },
        ];

        const vtt = BuildWebVtt(lines);
        expect(vtt).toBe(
            [
                'WEBVTT',
                '',
                '01:01:01.045 --> 01:01:05.250',
                'Whole line fallback caption over one hour.',
                '',
            ].join('\n'),
        );
    });
});
