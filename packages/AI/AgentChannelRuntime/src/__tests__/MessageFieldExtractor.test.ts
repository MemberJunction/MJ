/**
 * Tests for `MessageFieldExtractor` — the streaming JSON path filter that
 * pulls only the `message` field's value out of a streaming LoopAgentResponse
 * for TTS consumption.
 *
 * Key invariants under test:
 *   - Only characters inside the value of the top-level `message` field are
 *     emitted; everything else (keys, syntax, other fields) is suppressed.
 *   - Streaming works at *any* chunk boundary: feeding the input one byte at
 *     a time produces the same output as feeding it whole.
 *   - Escape sequences are translated correctly inside the message value.
 *   - Reset() restores the parser for the next agent step's envelope.
 */
import { describe, it, expect } from 'vitest';
import { MessageFieldExtractor } from '../_internal/MessageFieldExtractor';

function feedAll(input: string, chunkSize = input.length): string {
    const ex = new MessageFieldExtractor('message');
    let out = '';
    for (let i = 0; i < input.length; i += chunkSize) {
        out += ex.Feed(input.slice(i, i + chunkSize));
    }
    return out;
}

describe('MessageFieldExtractor', () => {
    describe('happy path', () => {
        it('extracts message value from a simple LoopAgentResponse', () => {
            const json = '{"taskComplete":true,"message":"Hi there!","reasoning":"none"}';
            expect(feedAll(json)).toBe('Hi there!');
        });

        it('handles message field not in first position', () => {
            const json = '{"reasoning":"thinking","taskComplete":false,"message":"Working on it","nextStep":{"type":"Chat"}}';
            expect(feedAll(json)).toBe('Working on it');
        });

        it('ignores message keys nested inside other objects', () => {
            // Only the depth-1 message field counts. A nested object's "message"
            // key (e.g. inside nextStep.subAgent) must NOT be spoken.
            const json = '{"nextStep":{"subAgent":{"message":"sub-agent instructions, do not speak"}},"message":"top level message"}';
            expect(feedAll(json)).toBe('top level message');
        });

        it('returns empty when no message field present', () => {
            const json = '{"taskComplete":false,"reasoning":"x","nextStep":{"type":"Actions"}}';
            expect(feedAll(json)).toBe('');
        });
    });

    describe('chunking', () => {
        const json = '{"taskComplete":true,"message":"streaming works at any boundary","reasoning":"ok"}';
        const expected = 'streaming works at any boundary';

        it('produces same output when fed one char at a time', () => {
            expect(feedAll(json, 1)).toBe(expected);
        });

        it('produces same output when fed in chunks of 3', () => {
            expect(feedAll(json, 3)).toBe(expected);
        });

        it('produces same output when fed in chunks of 7', () => {
            expect(feedAll(json, 7)).toBe(expected);
        });

        it('splits even on escape boundary mid-message', () => {
            // Chunk boundary lands inside the \" escape — parser must hold state.
            const input = '{"message":"line one\\nline two"}';
            const ex = new MessageFieldExtractor('message');
            // Feed exactly up to (and not including) the backslash.
            const splitAt = input.indexOf('\\');
            const first = ex.Feed(input.slice(0, splitAt));
            const second = ex.Feed(input.slice(splitAt));
            expect(first + second).toBe('line one\nline two');
        });
    });

    describe('escape sequences', () => {
        it('translates \\n, \\t, \\", \\\\, \\/', () => {
            const json = '{"message":"a\\nb\\tc\\"d\\\\e\\/f"}';
            expect(feedAll(json)).toBe('a\nb\tc"d\\e/f');
        });

        it('translates \\uXXXX BMP escapes', () => {
            // é is é, — is — (em dash)
            const json = '{"message":"caf\\u00e9\\u2014time"}';
            expect(feedAll(json)).toBe('café—time');
        });

        it('handles unicode escape split across chunks', () => {
            const ex = new MessageFieldExtractor('message');
            const a = ex.Feed('{"message":"caf\\u00');
            const b = ex.Feed('e9!"}');
            expect(a + b).toBe('café!');
        });
    });

    describe('robustness', () => {
        it('skips leading ```json code fence', () => {
            const json = '```json\n{"taskComplete":true,"message":"hello fenced"}\n```';
            expect(feedAll(json)).toBe('hello fenced');
        });

        it('handles whitespace and indentation freely', () => {
            const json = `{
                "taskComplete": true,
                "message": "  spaced out  ",
                "reasoning": "x"
            }`;
            expect(feedAll(json)).toBe('  spaced out  ');
        });

        it('does not emit message field if its value is non-string (number, etc.)', () => {
            // Defensive: a malformed response with `"message": 42` should not
            // crash and should not emit "42". The parser only emits chars
            // inside a STRING value at depth 1 keyed by `message`.
            const json = '{"message":42,"reasoning":"oops"}';
            expect(feedAll(json)).toBe('');
        });

        it('Reset() lets the parser handle a fresh envelope', () => {
            const ex = new MessageFieldExtractor('message');
            const first = ex.Feed('{"message":"step one done","taskComplete":false}');
            expect(first).toBe('step one done');
            expect(ex.IsDone).toBe(true);

            ex.Reset();
            expect(ex.IsDone).toBe(false);

            const second = ex.Feed('{"message":"step two done","taskComplete":true}');
            expect(second).toBe('step two done');
        });

        it('returns empty after IsDone for the same envelope', () => {
            const ex = new MessageFieldExtractor('message');
            ex.Feed('{"message":"once","reasoning":"');
            // Continued feeding more of the same envelope shouldn't re-emit.
            expect(ex.Feed('after message"}')).toBe('');
        });
    });

    describe('configurable target key', () => {
        it('respects a custom target key', () => {
            const ex = new MessageFieldExtractor('spokenText');
            const out = ex.Feed('{"spokenText":"custom field works","other":"no"}');
            expect(out).toBe('custom field works');
        });
    });
});
