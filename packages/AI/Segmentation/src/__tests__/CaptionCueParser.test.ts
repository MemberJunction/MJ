import { describe, expect, it } from 'vitest';
import { LooksLikeCaptionText, ParseCaptionCues } from '../generic/CaptionCueParser';

describe('ParseCaptionCues', () => {
    it('parses WebVTT, skipping header, NOTE/STYLE/REGION blocks, identifiers and cue settings', () => {
        const vtt = [
            '\uFEFFWEBVTT',
            'Kind: captions',
            '',
            'NOTE recorded live 00:00:00.000 --> 00:00:01.000',
            '',
            'STYLE',
            '::cue { color: yellow }',
            '',
            'REGION',
            'id:top width:40%',
            '',
            'intro',
            '00:00:01.000 --> 00:00:04.500 align:start position:0%',
            'Welcome to the session.',
            '',
            '01:02.250 --> 01:05.000',
            'Hours are optional',
            'and lines join.',
            '',
            '01:00:00.000 --> 01:00:02.000',
            'One hour in.',
        ].join('\n');

        expect(ParseCaptionCues(vtt)).toEqual([
            { StartMs: 1000, EndMs: 4500, Text: 'Welcome to the session.' },
            { StartMs: 62250, EndMs: 65000, Text: 'Hours are optional and lines join.' },
            { StartMs: 3600000, EndMs: 3602000, Text: 'One hour in.' },
        ]);
    });

    it('parses SRT with comma separators and CRLF line endings', () => {
        const srt = [
            '1',
            '00:00:00,500 --> 00:00:02,000',
            'First line.',
            '',
            '2',
            '00:00:02,000 --> 00:00:03,250',
            'Second line.',
            '',
        ].join('\r\n');

        expect(ParseCaptionCues(srt)).toEqual([
            { StartMs: 500, EndMs: 2000, Text: 'First line.' },
            { StartMs: 2000, EndMs: 3250, Text: 'Second line.' },
        ]);
    });

    it('takes the speaker from a voice tag and strips markup, inline timestamps and entities', () => {
        const vtt = [
            'WEBVTT',
            '',
            '00:00.000 --> 00:02.000',
            '<v.loud Roger Bingham>Tom &amp; <i>Jerry</i><00:00:01.000><c> again</c></v>',
        ].join('\n');

        expect(ParseCaptionCues(vtt)).toEqual([
            { StartMs: 0, EndMs: 2000, Text: 'Tom & Jerry again', Speaker: 'Roger Bingham' },
        ]);
    });

    it('keeps the text of a cue that contains a whitespace-only line, as YouTube auto-captions do', () => {
        const vtt = [
            'WEBVTT',
            '',
            '00:00:00.000 --> 00:00:03.270 align:start position:0%',
            ' ',
            'in<00:00:00.539><c> this</c><00:00:00.780><c> video</c>',
            '',
        ].join('\n');

        expect(ParseCaptionCues(vtt)).toEqual([{ StartMs: 0, EndMs: 3270, Text: 'in this video' }]);
    });

    it('does not read an SRT index as text when separator lines hold whitespace', () => {
        const srt = [
            '1',
            '00:00:00,000 --> 00:00:01,000',
            'First.',
            '  ',
            '2',
            '00:00:01,000 --> 00:00:02,000',
            'Second.',
        ].join('\n');

        expect(ParseCaptionCues(srt).map((c) => c.Text)).toEqual(['First.', 'Second.']);
    });

    it('drops cues with no text left after markup is stripped', () => {
        const vtt = ['WEBVTT', '', '00:00.000 --> 00:01.000', '<c></c>', '', '00:01.000 --> 00:02.000', 'Kept.'].join(
            '\n',
        );

        expect(ParseCaptionCues(vtt)).toEqual([{ StartMs: 1000, EndMs: 2000, Text: 'Kept.' }]);
    });

    it('returns no cues for text that is not a caption file and handles adversarial tag inputs linearly', () => {
        expect(ParseCaptionCues('# Heading\n\nJust a paragraph about 10:30 --> 11:00 meetings.')).toEqual([]);
        expect(ParseCaptionCues('')).toEqual([]);

        const unclosedVoice = `WEBVTT\n\n00:00.000 --> 00:01.000\n${'<v.loud '.repeat(500)}Hello`;
        const started = Date.now();
        expect(ParseCaptionCues(unclosedVoice)).toHaveLength(1);
        expect(Date.now() - started).toBeLessThan(100);
    });
});

describe('LooksLikeCaptionText', () => {
    it('detects WebVTT headers and SRT timing blocks while rejecting regular prose', () => {
        expect(LooksLikeCaptionText('WEBVTT\n\n00:00.000 --> 00:01.000\nHi')).toBe(true);
        expect(LooksLikeCaptionText('\uFEFFWEBVTT - Title\n')).toBe(true);
        expect(LooksLikeCaptionText('1\n00:00:01,000 --> 00:00:03,500\nSubtitle line')).toBe(true);
        expect(LooksLikeCaptionText('# Markdown Document\n\n10:30 --> 11:00 agenda item')).toBe(false);
        expect(LooksLikeCaptionText(undefined)).toBe(false);
    });
});
