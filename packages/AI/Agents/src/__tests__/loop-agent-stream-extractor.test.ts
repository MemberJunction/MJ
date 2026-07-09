/**
 * @fileoverview Tests for LoopAgentStreamExtractor — the incremental parser that
 * pulls the user-facing reply (root-level `message` on a `taskComplete:true` turn)
 * out of a Loop agent's STREAMED JSON envelope so it can be re-emitted as
 * `kind:'final-response'` deltas. Exercises chunk-boundary robustness (including
 * escapes split across chunks), field-order tolerance, non-final turns, nested
 * `message` keys, markdown fences, and the LoopAgentType factory override.
 */
import { describe, it, expect } from 'vitest';

import { LoopAgentStreamExtractor } from '../agent-types/loop-agent-stream-extractor';
import { LoopAgentType } from '../agent-types/loop-agent-type';

/** Feed `text` in fixed-size chunks, returning everything the extractor emits. */
function feedChunked(extractor: LoopAgentStreamExtractor, text: string, chunkSize: number): string {
    let emitted = '';
    for (let i = 0; i < text.length; i += chunkSize) {
        emitted += extractor.Feed(text.slice(i, i + chunkSize));
    }
    return emitted;
}

describe('LoopAgentStreamExtractor', () => {
    const FINAL_ENVELOPE =
        '{"taskComplete": true, "message": "Here is your answer.", "reasoning": "done"}';

    it('emits the final-turn message text and nothing else', () => {
        const x = new LoopAgentStreamExtractor();
        expect(feedChunked(x, FINAL_ENVELOPE, 8)).toBe('Here is your answer.');
        expect(x.HasEmitted).toBe(true);
    });

    it('is chunk-boundary safe — one character at a time yields identical output', () => {
        const x = new LoopAgentStreamExtractor();
        expect(feedChunked(x, FINAL_ENVELOPE, 1)).toBe('Here is your answer.');
    });

    it('emits message deltas incrementally as they arrive (typing effect)', () => {
        const x = new LoopAgentStreamExtractor();
        expect(x.Feed('{"taskComplete": true, "message": "Hel')).toBe('Hel');
        expect(x.Feed('lo wor')).toBe('lo wor');
        expect(x.Feed('ld"}')).toBe('ld');
    });

    it('unescapes JSON string escapes, including \\uXXXX split across chunks', () => {
        const envelope = '{"taskComplete": true, "message": "line1\\nline2 \\"q\\" \\\\ \\u00e9!"}';
        const whole = new LoopAgentStreamExtractor();
        expect(feedChunked(whole, envelope, envelope.length)).toBe('line1\nline2 "q" \\ é!');
        const split = new LoopAgentStreamExtractor();
        expect(feedChunked(split, envelope, 3)).toBe('line1\nline2 "q" \\ é!');
    });

    it('emits nothing for a non-final turn (taskComplete false)', () => {
        const x = new LoopAgentStreamExtractor();
        const envelope = '{"taskComplete": false, "message": "Searching for more results", "nextStep": {"type": "Actions"}}';
        expect(feedChunked(x, envelope, 5)).toBe('');
        expect(x.HasEmitted).toBe(false);
    });

    it('buffers a message that precedes taskComplete and flushes it once finality is known', () => {
        const x = new LoopAgentStreamExtractor();
        expect(x.Feed('{"message": "The answer is 42.", ')).toBe('');
        expect(x.Feed('"taskComplete": true}')).toBe('The answer is 42.');
        expect(x.HasEmitted).toBe(true);
    });

    it('discards a buffered message when the turn proves non-final', () => {
        const x = new LoopAgentStreamExtractor();
        x.Feed('{"message": "still working", ');
        expect(x.Feed('"taskComplete": false}')).toBe('');
        expect(x.HasEmitted).toBe(false);
    });

    it('ignores message keys nested inside other values', () => {
        const x = new LoopAgentStreamExtractor();
        const envelope =
            '{"taskComplete": true, "payloadChangeRequest": {"updateElements": {"message": "NESTED"}}, "message": "Real reply"}';
        expect(feedChunked(x, envelope, 4)).toBe('Real reply');
    });

    it('tolerates markdown fences / prose around the envelope and ignores trailing text', () => {
        const x = new LoopAgentStreamExtractor();
        const output = 'Sure! Here it is:\n```json\n' + FINAL_ENVELOPE + '\n```\nHope that helps.';
        expect(feedChunked(x, output, 7)).toBe('Here is your answer.');
    });

    it('is not confused by braces and quotes inside other string values', () => {
        const x = new LoopAgentStreamExtractor();
        const envelope =
            '{"taskComplete": true, "reasoning": "tricky: {\\"message\\": \\"fake\\"} }{", "message": "clean"}';
        expect(feedChunked(x, envelope, 6)).toBe('clean');
    });

    it('emits nothing when there is no message field or it is empty', () => {
        const noMessage = new LoopAgentStreamExtractor();
        expect(noMessage.Feed('{"taskComplete": true, "reasoning": "quiet"}')).toBe('');
        expect(noMessage.HasEmitted).toBe(false);

        const emptyMessage = new LoopAgentStreamExtractor();
        expect(emptyMessage.Feed('{"taskComplete": true, "message": ""}')).toBe('');
        expect(emptyMessage.HasEmitted).toBe(false);
    });

    it('handles whitespace-heavy formatting', () => {
        const x = new LoopAgentStreamExtractor();
        const envelope = '{\n  "taskComplete" : true ,\n  "message" :\n    "spaced out"\n}';
        expect(feedChunked(x, envelope, 3)).toBe('spaced out');
    });

    it('decodes surrogate-pair escapes (emoji) fed whole', () => {
        const x = new LoopAgentStreamExtractor();
        const envelope = '{"taskComplete": true, "message": "hi \\ud83d\\ude00!"}';
        expect(feedChunked(x, envelope, envelope.length)).toBe('hi 😀!');
    });

    it('never returns a lone high surrogate when an emoji splits across Feed boundaries', () => {
        const x = new LoopAgentStreamExtractor();
        const envelope = '{"taskComplete": true, "message": "hi \\ud83d\\ude00!"}';
        let combined = '';
        for (let i = 0; i < envelope.length; i += 2) {
            const emitted = x.Feed(envelope.slice(i, i + 2));
            if (emitted) {
                const last = emitted.charCodeAt(emitted.length - 1);
                expect(last >= 0xd800 && last <= 0xdbff).toBe(false); // well-formed UTF-16 always
            }
            combined += emitted;
        }
        expect(combined).toBe('hi 😀!');
    });

    it('recovers from a malformed \\u escape without swallowing the closing quote', () => {
        const x = new LoopAgentStreamExtractor();
        const envelope = '{"taskComplete": true, "message": "bad\\u12", "secret": "internal"}';
        const emitted = feedChunked(x, envelope, 5);
        expect(emitted).toBe('bad'); // bogus escape dropped, string still closed correctly
        expect(emitted).not.toContain('internal'); // the next field's value must never leak
    });

    it('emits nothing when message is not a string (null, number, object)', () => {
        for (const value of ['null', '42', '{"text": "nope"}']) {
            const x = new LoopAgentStreamExtractor();
            expect(x.Feed(`{"taskComplete": true, "message": ${value}}`)).toBe('');
            expect(x.HasEmitted).toBe(false);
        }
    });

    it('treats an envelope wrapped in a root array as the envelope (documented behavior)', () => {
        const x = new LoopAgentStreamExtractor();
        expect(feedChunked(x, '[{"taskComplete": true, "message": "in array"}]', 6)).toBe('in array');
    });

    it('returns empty string for empty feeds and after the envelope closes', () => {
        const x = new LoopAgentStreamExtractor();
        expect(x.Feed('')).toBe('');
        feedChunked(x, FINAL_ENVELOPE, 10);
        expect(x.Feed('{"taskComplete": true, "message": "second envelope"}')).toBe('');
    });
});

describe('agent-type wiring', () => {
    it('LoopAgentType returns a fresh extractor per call', () => {
        const type = new LoopAgentType();
        const a = type.CreateFinalResponseStreamExtractor();
        const b = type.CreateFinalResponseStreamExtractor();
        expect(a).toBeInstanceOf(LoopAgentStreamExtractor);
        expect(b).toBeInstanceOf(LoopAgentStreamExtractor);
        expect(a).not.toBe(b);
    });
});
