import { describe, it, expect } from 'vitest';
import { HeardText, IsBackchannel, SentenceChunker, ToSpeakableText, type SpokenSegment } from '../voice/voiceText';

function chunk(...pushes: string[]): string[] {
    const c = new SentenceChunker();
    const out = pushes.flatMap((p) => c.Push(p));
    const rest = c.Flush();
    return rest ? [...out, rest] : out;
}

describe('SentenceChunker', () => {
    it('releases a sentence once the text after it starts', () => {
        const c = new SentenceChunker();
        expect(c.Push('Paris is the capital.')).toEqual([]);
        expect(c.Push(' It is')).toEqual(['Paris is the capital.']);
        expect(c.Flush()).toBe('It is');
    });

    it('joins text split mid-word across deltas', () => {
        expect(chunk('Hel', 'lo the', 're. How are', ' you?')).toEqual(['Hello there.', 'How are you?']);
    });

    it.each([
        ['Dr. Smith is here. Come in.', ['Dr. Smith is here.', 'Come in.']],
        ['It costs 3.5 dollars today. Fine.', ['It costs 3.5 dollars today.', 'Fine.']],
        ['The U.S. economy grew. Good news.', ['The U.S. economy grew.', 'Good news.']],
    ])('does not split inside %j', (text, expected) => {
        expect(chunk(text)).toEqual(expected);
    });

    it('treats a newline as a sentence end', () => {
        expect(chunk('First line\nSecond line')).toEqual(['First line', 'Second line']);
    });

    it('splits the first long clause at a comma so speech starts early', () => {
        const c = new SentenceChunker();
        expect(c.Push('If you look at the quarterly numbers for this region, you will see that')).toEqual(['If you look at the quarterly numbers for this region,']);
    });

    it('does not split a short clause at a comma', () => {
        expect(chunk('Well, yes.')).toEqual(['Well, yes.']);
    });

    it('splits text with no punctuation before it exceeds the provider frame limit', () => {
        const parts = chunk('word '.repeat(600));
        expect(parts.length).toBeGreaterThan(1);
        expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(400);
        expect(parts.join(' ').split(/\s+/).length).toBe(600);
    });

    it('returns null when there is nothing left', () => {
        expect(new SentenceChunker().Flush()).toBeNull();
    });
});

describe('ToSpeakableText', () => {
    it.each([
        ['**Bold** and _soft_ text', 'Bold and soft text'],
        ['# Heading', 'Heading'],
        ['- first item', 'first item'],
        ['1. first item', 'first item'],
        ['See [the docs](https://example.com/x)', 'See the docs'],
        ['Run `npm test` now', 'Run npm test now'],
        ['Great job 🎉👍🏽!', 'Great job !'],
        ['snake_case_name stays', 'snake_case_name stays'],
        ['5 * 3 is 15', '5 * 3 is 15'],
        ['  spaced   out  ', 'spaced out'],
        ['🎉', ''],
        ['```', ''],
    ])('%j -> %j', (input, expected) => {
        expect(ToSpeakableText(input)).toBe(expected);
    });

    it('stays fast on a long run of one marker', () => {
        const started = Date.now();
        ToSpeakableText('*'.repeat(50_000) + '['.repeat(50_000) + '`'.repeat(50_001));
        expect(Date.now() - started).toBeLessThan(500);
    });
});

describe('IsBackchannel', () => {
    it.each(['mm-hm', 'Mhm.', 'uh huh', 'Yeah.', 'Okay, yeah', 'Right.', 'Um', 'Oh, okay.'])('%j is one', (t) => expect(IsBackchannel(t)).toBe(true));
    it.each(['Stop.', 'Yes.', 'No.', 'Wait', 'Yeah but what about Tuesday', 'Okay stop', '', '   '])('%j is not', (t) => expect(IsBackchannel(t)).toBe(false));
});

describe('HeardText', () => {
    const seg = (Text: string, StartMs: number, EndMs: number, Done = true): SpokenSegment => ({ Text, StartMs, EndMs, Done });

    it('keeps the segments that finished playing', () => {
        expect(HeardText([seg('One two.', 0, 1000), seg('Three four.', 1000, 2000)], 1000)).toBe('One two.');
    });

    it('keeps the played share of the words in a segment cut off part way', () => {
        expect(HeardText([seg('one two three four five six seven eight nine ten', 0, 1000)], 500)).toBe('one two three four five');
    });

    it('is empty before playback starts', () => {
        expect(HeardText([seg('Hello there.', 500, 900)], 400)).toBe('');
    });

    it('ignores a segment that has no audio yet', () => {
        expect(HeardText([seg('Heard this.', 0, 1000), { Text: 'Not this.', StartMs: null, EndMs: 0, Done: false }], 5000)).toBe('Heard this.');
    });

    it('does not credit the whole text of a segment whose audio is still arriving', () => {
        const text = 'This is a long sentence whose audio has only just started to arrive from the provider';
        const heard = HeardText([seg(text, 0, 400, false)], 400);
        expect(heard.length).toBeGreaterThan(0);
        expect(heard.length).toBeLessThan(text.length / 3);
    });
});
