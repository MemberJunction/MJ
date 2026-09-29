import { describe, it, expect } from 'vitest';
import { ContainsInOrderOnOneLine, FirstBraceSpanOnOneLine } from '../generic/linearTextScan';

/** Deterministic pseudo-random strings over a small alphabet, so equivalence runs are reproducible. */
function corpus(alphabet: readonly string[], count: number, maxLength: number): string[] {
    let seed = 42;
    // 32-bit LCG in integer arithmetic. A plain multiply overflows 2^53 and rounds away the low bits,
    // so the sequence repeats early and `% n` sees a skewed distribution; the high 16 bits are the good ones.
    const next = (): number => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return seed >>> 16;
    };
    const out: string[] = [];
    for (let n = 0; n < count; n++) {
        const length = next() % (maxLength + 1);
        let s = '';
        for (let i = 0; i < length; i++) {
            s += alphabet[next() % alphabet.length];
        }
        out.push(s);
    }
    return out;
}

/** Budget for inputs the old regexes took quadratic time on. Linear code finishes in well under this. */
const LINEAR_BUDGET_MS = 250;

function elapsedMs(run: () => void): number {
    const start = performance.now();
    run();
    return performance.now() - start;
}

describe('ContainsInOrderOnOneLine', () => {
    const missingThenField = (s: string): boolean => ContainsInOrderOnOneLine(s, ['missing'], ['field', 'property']);
    const fieldThenMissing = (s: string): boolean => ContainsInOrderOnOneLine(s, ['field', 'property'], ['missing']);

    it.each([
        ['missing field x', true, false],
        ['field x is missing', false, true],
        ['property y missing', false, true],
        ['missingfield', true, false],
        ['missing\nfield', false, false],
        ['missing\r\nfield', false, false],
        ['missing\u2028field', false, false],
        ['field missing\nproperty', false, true],
        ['nothing here', false, false],
        ['', false, false],
    ])('%j → missing-then-field %s, field-then-missing %s', (input, a, b) => {
        expect(missingThenField(input)).toBe(a);
        expect(fieldThenMissing(input)).toBe(b);
    });

    it('matches the regexes it replaces on a random corpus', () => {
        const alphabet = ['missing', 'field', 'property', 'miss', 'fie', ' ', 'x', '\n', '\r', '\u2029'];
        for (const s of corpus(alphabet, 3000, 12)) {
            expect(missingThenField(s)).toBe(/missing.*(?:field|property)/.test(s));
            expect(fieldThenMissing(s)).toBe(/(?:field|property).*missing/.test(s));
        }
    });

    it('stays linear on the inputs CodeQL flagged (many repetitions of "missing" / "field")', () => {
        const manyMissing = 'missing'.repeat(40_000);
        const manyField = 'field'.repeat(40_000);
        expect(elapsedMs(() => missingThenField(manyMissing))).toBeLessThan(LINEAR_BUDGET_MS);
        expect(elapsedMs(() => fieldThenMissing(manyField))).toBeLessThan(LINEAR_BUDGET_MS);
    });
});

describe('FirstBraceSpanOnOneLine', () => {
    it.each([
        ['error: {"code":"x"}', '{"code":"x"}'],
        ['a {b} c {d} e', '{b} c {d}'],
        ['{ no close\n{"code":"y"}', '{"code":"y"}'],
        ['{\n}', null],
        ['} before {', null],
        ['no braces', null],
        ['{}', '{}'],
        ['{{x}}', '{{x}}'],
        ['', null],
    ])('%j → %j', (input, expected) => {
        expect(FirstBraceSpanOnOneLine(input)).toBe(expected);
    });

    it('matches /\\{.*\\}/ on a random corpus', () => {
        const alphabet = ['{', '}', 'a', ' ', '"', '\n', '\r', '\u2028'];
        for (const s of corpus(alphabet, 3000, 14)) {
            expect(FirstBraceSpanOnOneLine(s)).toBe(s.match(/\{.*\}/)?.[0] ?? null);
        }
    });

    it('stays linear on the input CodeQL flagged (many repetitions of "{{")', () => {
        const manyOpen = '{{'.repeat(60_000);
        expect(elapsedMs(() => FirstBraceSpanOnOneLine(manyOpen))).toBeLessThan(LINEAR_BUDGET_MS);
    });

    it('stays linear on many lines that each open a brace but never close it', () => {
        const manyUnclosedLines = '{\n'.repeat(200_000) + '}';
        expect(FirstBraceSpanOnOneLine(manyUnclosedLines)).toBeNull();
        expect(elapsedMs(() => FirstBraceSpanOnOneLine(manyUnclosedLines))).toBeLessThan(LINEAR_BUDGET_MS);
    });
});
