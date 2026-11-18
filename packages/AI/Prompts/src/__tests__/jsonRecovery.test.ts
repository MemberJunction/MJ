import { describe, it, expect } from 'vitest';
import { ExtractLeadingJSONValue } from '../jsonRecovery';

describe('ExtractLeadingJSONValue (#3065)', () => {
    it('reads the production shape: a complete object followed by a duplicated closing fragment', () => {
        const reply = '{\n  "taskComplete": true,\n  "message": "Done"\n}\n  "message": "Done"\n}';
        const result = ExtractLeadingJSONValue(reply);
        expect(result?.Value).toEqual({ taskComplete: true, message: 'Done' });
        expect(result?.Tail.trim()).toBe('"message": "Done"\n}');
    });

    it('skips braces, brackets and escaped quotes inside strings', () => {
        const reply = '{"a":"x } ] {","b":"say \\"}\\" now"} extra';
        expect(ExtractLeadingJSONValue(reply)?.Value).toEqual({ a: 'x } ] {', b: 'say "}" now' });
    });

    it('handles nesting', () => {
        expect(ExtractLeadingJSONValue('{"a":{"b":[1,{"c":2}]}} trailing')?.Value).toEqual({ a: { b: [1, { c: 2 }] } });
    });

    it('reads an array with a tail', () => {
        const result = ExtractLeadingJSONValue('  [1,2,3]]');
        expect(result?.Value).toEqual([1, 2, 3]);
        expect(result?.Tail).toBe(']');
    });

    it('returns null for a truncated body (never repairs)', () => {
        expect(ExtractLeadingJSONValue('{"a":1,"b":{"c":2}')).toBeNull();
    });

    it('returns null when nothing but whitespace follows', () => {
        expect(ExtractLeadingJSONValue('{"a":1}\n  ')).toBeNull();
    });

    it('returns null when the closed span is not valid JSON', () => {
        expect(ExtractLeadingJSONValue("{a:1} tail")).toBeNull();
    });

    it('returns null when text precedes the value', () => {
        expect(ExtractLeadingJSONValue('Here you go: {"a":1} tail')).toBeNull();
    });
});
