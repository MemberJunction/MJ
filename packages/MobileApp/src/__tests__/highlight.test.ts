import { describe, it, expect } from 'vitest';
import { highlightCode, type HighlightRun } from '@/components/markdown/highlight';
import { Colors } from '@/theme/tokens';

/** The plain, un-tokenized color the module uses for fallbacks. */
const PLAIN = Colors.ink;

/** Concatenate run text — must always reconstruct the original source exactly. */
function joined(runs: HighlightRun[]): string {
    return runs.map((r) => r.text).join('');
}

describe('highlightCode', () => {
    describe('fallbacks', () => {
        it('returns a single plain run for an unknown language', () => {
            const runs = highlightCode('hello world', 'klingon');
            expect(runs).toEqual([{ text: 'hello world', color: PLAIN }]);
        });

        it('returns a single plain run when no language is given', () => {
            const runs = highlightCode('plain text', undefined);
            expect(runs).toEqual([{ text: 'plain text', color: PLAIN }]);
        });

        it('returns a single (empty) plain run for empty input with a known grammar', () => {
            const runs = highlightCode('', 'json');
            expect(runs).toEqual([{ text: '', color: PLAIN }]);
        });
    });

    describe('tokenization', () => {
        it('highlights JSON: property + number get distinct token colors', () => {
            const code = '{"a": 1}';
            const runs = highlightCode(code, 'json');
            expect(joined(runs)).toBe(code);
            const colors = runs.map((r) => r.color);
            // "a" is a JSON property -> brand; 1 is a number -> agentAnalyst.
            expect(colors).toContain(Colors.brand);
            expect(colors).toContain(Colors.agentAnalyst);
        });

        it('highlights TypeScript keywords via the "ts" alias', () => {
            const code = 'const x = 1;';
            const runs = highlightCode(code, 'ts');
            expect(joined(runs)).toBe(code);
            // `const` is a keyword -> agentResearch.
            expect(runs.map((r) => r.color)).toContain(Colors.agentResearch);
        });

        it('normalizes language hints (trim + case + alias) before lookup', () => {
            const code = 'SELECT 1';
            const runs = highlightCode(code, '  SQL ');
            expect(joined(runs)).toBe(code);
            expect(runs.length).toBeGreaterThan(1); // actually tokenized, not a single plain run
        });

        it('preserves source exactly across several languages (concatenation invariant)', () => {
            const cases: Array<[string, string]> = [
                ['python', 'def f(x):\n    return x + 1\n'],
                ['bash', 'echo "hi" | grep h'],
                ['yaml', 'name: test\nvalue: 42\n'],
                ['javascript', 'function g() { return [1, 2, 3]; }'],
            ];
            for (const [lang, code] of cases) {
                const runs = highlightCode(code, lang);
                expect(joined(runs)).toBe(code);
                expect(runs.length).toBeGreaterThan(0);
            }
        });

        it('emits at least one non-plain colored run for real code', () => {
            const runs = highlightCode('# a comment\nx = 5', 'python');
            expect(runs.some((r) => r.color !== PLAIN)).toBe(true);
        });
    });
});
