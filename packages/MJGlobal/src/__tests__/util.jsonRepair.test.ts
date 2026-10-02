import { describe, it, expect } from 'vitest';
import { CleanJSON, RepairJSONEscaping } from '../util';

/**
 * A response shaped like the ones that motivated this work: a JSON envelope whose string value
 * holds fenced markdown, with the quotes inside the fence left unescaped. Everything else in the
 * document — including the newlines — is escaped correctly, which is what makes the defect so
 * narrow and so recoverable.
 */
const mermaidLabels = [
    'vwMembers ||--o{ vwInvoices : "has invoices"',
    'vwInvoices ||--o{ vwLineItems : "contains items"',
].join('\\n    ');
const brokenEnvelope =
    '{"title":"Report","functionalRequirements":"## Data\\n\\n```mermaid\\nerDiagram\\n    ' +
    mermaidLabels +
    '\\n```\\n\\nDone."}';

describe('CleanJSON — interior markdown fences', () => {
    it('does not extract a fence that lives inside a string value', () => {
        // The whole point: a ```mermaid fence inside a string value belongs to the value, not to
        // the response. Extracting it silently discarded the entire document.
        let thrown: Error | null = null;
        try {
            CleanJSON(brokenEnvelope);
        } catch (error) {
            thrown = error as Error;
        }

        expect(thrown).not.toBeNull();
        // The real defect must surface — not a phantom error about the fence contents.
        expect(thrown!.message).not.toContain('mermaid');
        expect(thrown!.message).toMatch(/position \d+/);
    });

    it('exposes the untouched top-level parse error as `cause`', () => {
        let thrown: Error | null = null;
        try {
            CleanJSON(brokenEnvelope);
        } catch (error) {
            thrown = error as Error;
        }

        const cause = thrown!.cause as Error | undefined;
        expect(cause).toBeInstanceOf(Error);
        expect(cause!.message).toMatch(/position \d+/);
    });

    it('still extracts JSON from a genuinely fence-wrapped response', () => {
        const result = CleanJSON('```json\n{"extracted": true}\n```');
        expect(JSON.parse(result!)).toEqual({ extracted: true });
    });

    it('still extracts JSON buried in surrounding prose', () => {
        const result = CleanJSON('Some text ```json\n{"extracted": true}\n``` more text');
        expect(JSON.parse(result!)).toEqual({ extracted: true });
    });

    it('leaves a valid document containing a fence completely alone', () => {
        const valid = JSON.stringify({ text: '```mermaid\nerDiagram\n  A ||--o{ B : label\n```' });
        const result = CleanJSON(valid);
        expect(JSON.parse(result!)).toEqual(JSON.parse(valid));
    });
});

describe('RepairJSONEscaping', () => {
    it('escapes unescaped quotes inside a string value and preserves the content', () => {
        const result = RepairJSONEscaping(brokenEnvelope);

        expect(result.repaired).toBe(true);
        // Two quoted labels, two quotes each.
        expect(result.repairedOffsets).toHaveLength(4);
        expect(result.value.title).toBe('Report');
        // The diagram survives verbatim — repair adds escapes, it never rewrites content.
        expect(result.value.functionalRequirements).toContain('vwMembers ||--o{ vwInvoices : "has invoices"');
        expect(result.value.functionalRequirements).toContain('vwInvoices ||--o{ vwLineItems : "contains items"');
    });

    it('escapes raw control characters inside a string value', () => {
        const result = RepairJSONEscaping('{"a":"line one\nline two"}');

        expect(result.repaired).toBe(true);
        expect(result.value.a).toBe('line one\nline two');
    });

    it('reports repaired: false for already-valid JSON, leaving it untouched', () => {
        // Valid input needs no repair; `repaired` marks whether anything was changed.
        const result = RepairJSONEscaping('{"a":1}');

        expect(result.repaired).toBe(false);
        expect(result.repairedOffsets).toHaveLength(0);
        expect(result.value).toEqual({ a: 1 });
    });

    it('gives up rather than guessing on input that is not JSON at all', () => {
        const result = RepairJSONEscaping('I am executing the action now.');

        expect(result.repaired).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.reason).toBeTruthy();
    });

    it('gives up on truncated output instead of fabricating structure', () => {
        // A response cut off mid-string cannot be recovered by escaping, and must not be
        // "fixed" into something that parses but misrepresents what the model said.
        const result = RepairJSONEscaping('{"a":"unterminated');

        expect(result.repaired).toBe(false);
        expect(result.value).toBeUndefined();
    });

    it('respects the repair ceiling', () => {
        const result = RepairJSONEscaping(brokenEnvelope, 1);

        expect(result.repaired).toBe(false);
        expect(result.reason).toContain('after 1 repairs');
    });

    it('does not treat an already-escaped quote as needing repair', () => {
        // `\\"` is a literal backslash followed by a real string terminator — the quote is NOT
        // escaped. Miscounting the backslash run would corrupt the document.
        const valid = JSON.stringify({ path: 'C:\\' });
        const result = RepairJSONEscaping(valid);

        expect(result.repaired).toBe(false);
        expect(result.value).toEqual({ path: 'C:\\' });
    });

    it('handles null and empty input', () => {
        expect(RepairJSONEscaping(null).repaired).toBe(false);
        expect(RepairJSONEscaping('').repaired).toBe(false);
    });
});
