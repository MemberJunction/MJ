import { describe, it, expect } from 'vitest';
import { ThinkingStreamExtractor } from '../generic/thinkingStreamExtractor';

describe('ThinkingStreamExtractor', () => {
    it('extracts a complete thinking block and visible content within a single chunk', () => {
        const extractor = new ThinkingStreamExtractor();
        const res = extractor.ProcessChunk('<think>step 1</think>final answer');

        expect(res.contentDelta).toBe('final answer');
        expect(res.thinkingDelta).toBe('step 1');
        expect(extractor.AccumulatedThinking).toBe('step 1');
        expect(extractor.ThinkingComplete).toBe(true);
        expect(extractor.InThinkingBlock).toBe(false);
    });

    it('handles content before, inside, and after a thinking block in one chunk', () => {
        const extractor = new ThinkingStreamExtractor();
        const res = extractor.ProcessChunk('prefix <think>reasoning</think> suffix');

        expect(res.contentDelta).toBe('prefix  suffix');
        expect(res.thinkingDelta).toBe('reasoning');
        expect(extractor.AccumulatedThinking).toBe('reasoning');
    });

    it('handles open and close tags split at every single-character boundary', () => {
        const input = 'Hello <think>deep thought</think> World!';
        for (let split = 1; split < input.length; split++) {
            const extractor = new ThinkingStreamExtractor();
            const first = extractor.ProcessChunk(input.slice(0, split));
            const second = extractor.ProcessChunk(input.slice(split));
            const tail = extractor.Flush();

            expect(first.contentDelta + second.contentDelta + tail).toBe('Hello  World!');
            expect(extractor.AccumulatedThinking).toBe('deep thought');
        }
    });

    it('supports custom tag pairs (<thinking>...</thinking>) and case-insensitive matching', () => {
        const extractor = new ThinkingStreamExtractor({ open: '<thinking>', close: '</thinking>' });
        const c1 = extractor.ProcessChunk('<THINKING>plan A');
        const c2 = extractor.ProcessChunk(' and B</ThInKiNg>result');

        expect(c1.contentDelta).toBe('');
        expect(c2.contentDelta).toBe('result');
        expect(extractor.AccumulatedThinking).toBe('plan A and B');
    });

    it('flushes held-back partial open-tag text at end-of-stream without leaking unterminated thinking blocks', () => {
        const visibleTail = new ThinkingStreamExtractor();
        const c1 = visibleTail.ProcessChunk('value <th');
        expect(c1.contentDelta).toBe('value ');
        expect(visibleTail.Flush()).toBe('<th');

        const unterminated = new ThinkingStreamExtractor();
        const u1 = unterminated.ProcessChunk('<think>still reasoning</thi');
        expect(u1.contentDelta).toBe('');
        expect(unterminated.Flush()).toBe('');
        expect(unterminated.InThinkingBlock).toBe(true);
    });

    it('supports out-of-band AppendThinking and cleanly resets state via Reset()', () => {
        const extractor = new ThinkingStreamExtractor();
        extractor.AppendThinking('native delta 1 ');
        extractor.AppendThinking('native delta 2');
        expect(extractor.AccumulatedThinking).toBe('native delta 1 native delta 2');

        extractor.Reset();
        expect(extractor.AccumulatedThinking).toBe('');
        expect(extractor.InThinkingBlock).toBe(false);
        expect(extractor.ThinkingComplete).toBe(false);
        expect(extractor.PendingContent).toBe('');
    });
});
