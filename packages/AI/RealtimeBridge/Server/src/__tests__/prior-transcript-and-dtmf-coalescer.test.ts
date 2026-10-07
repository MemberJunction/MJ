import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AppendTranscriptTurn,
    BridgeTranscriptTurn,
    BuildPriorTranscript,
    PRIOR_TRANSCRIPT_MAX_CHARS,
    PRIOR_TRANSCRIPT_MAX_TURNS,
    TRANSCRIPT_TAIL_MAX_TURNS,
} from '../bridge-prior-transcript';
import { DTMF_MAX_BUFFERED_DIGITS, DtmfCoalescer } from '../dtmf-coalescer';

describe('BuildPriorTranscript', () => {
    it('formats role-tagged lines oldest first and skips blank turns', () => {
        const turns: BridgeTranscriptTurn[] = [
            { Role: 'user', Text: ' Hello ' },
            { Role: 'assistant', Text: '   ' },
            { Role: 'assistant', Text: 'Hi, how can I help?' },
        ];
        expect(BuildPriorTranscript(turns)).toBe('User: Hello\nAssistant: Hi, how can I help?');
    });

    it('returns an empty string when there is nothing to carry', () => {
        expect(BuildPriorTranscript([])).toBe('');
    });

    it('keeps only the newest turns when there are too many', () => {
        const turns: BridgeTranscriptTurn[] = Array.from({ length: PRIOR_TRANSCRIPT_MAX_TURNS + 5 }, (_, i) => ({
            Role: 'user' as const,
            Text: `turn ${i}`,
        }));
        const lines = BuildPriorTranscript(turns).split('\n');
        expect(lines).toHaveLength(PRIOR_TRANSCRIPT_MAX_TURNS);
        expect(lines[lines.length - 1]).toBe(`User: turn ${PRIOR_TRANSCRIPT_MAX_TURNS + 4}`);
        expect(lines[0]).toBe('User: turn 5');
    });

    it('drops the oldest turns past the character budget but always keeps the newest', () => {
        const big = 'x'.repeat(PRIOR_TRANSCRIPT_MAX_CHARS - 100);
        const turns: BridgeTranscriptTurn[] = [
            { Role: 'user', Text: big },
            { Role: 'assistant', Text: 'y'.repeat(500) },
        ];
        const text = BuildPriorTranscript(turns);
        expect(text).toBe(`Assistant: ${'y'.repeat(500)}`);

        const single = BuildPriorTranscript([{ Role: 'user', Text: 'z'.repeat(PRIOR_TRANSCRIPT_MAX_CHARS + 50) }]);
        expect(single.startsWith('User: z')).toBe(true);
    });
});

describe('AppendTranscriptTurn', () => {
    it('ignores blank text and trims the tail to its cap', () => {
        const tail: BridgeTranscriptTurn[] = [];
        AppendTranscriptTurn(tail, { Role: 'user', Text: '  ' });
        expect(tail).toHaveLength(0);

        for (let i = 0; i < TRANSCRIPT_TAIL_MAX_TURNS + 10; i++) {
            AppendTranscriptTurn(tail, { Role: 'user', Text: `t${i}` });
        }
        expect(tail).toHaveLength(TRANSCRIPT_TAIL_MAX_TURNS);
        expect(tail[0].Text).toBe('t10');
    });
});

describe('DtmfCoalescer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('gathers presses and flushes them together after the keypad goes quiet', () => {
        const flushed: string[] = [];
        const coalescer = new DtmfCoalescer((d) => flushed.push(d), 1000);
        coalescer.Push('1');
        vi.advanceTimersByTime(500);
        coalescer.Push('23');
        vi.advanceTimersByTime(900);
        expect(flushed).toEqual([]);
        vi.advanceTimersByTime(200);
        expect(flushed).toEqual(['123']);
    });

    it('ignores empty input', () => {
        const flushed: string[] = [];
        const coalescer = new DtmfCoalescer((d) => flushed.push(d), 100);
        coalescer.Push('');
        vi.advanceTimersByTime(500);
        expect(flushed).toEqual([]);
    });

    it('forces a flush when the buffer reaches its cap', () => {
        const flushed: string[] = [];
        const coalescer = new DtmfCoalescer((d) => flushed.push(d), 100000);
        coalescer.Push('5'.repeat(DTMF_MAX_BUFFERED_DIGITS));
        expect(flushed).toEqual(['5'.repeat(DTMF_MAX_BUFFERED_DIGITS)]);
    });

    it('discards anything buffered on Dispose', () => {
        const flushed: string[] = [];
        const coalescer = new DtmfCoalescer((d) => flushed.push(d), 100);
        coalescer.Push('9');
        coalescer.Dispose();
        vi.advanceTimersByTime(1000);
        expect(flushed).toEqual([]);
    });
});
