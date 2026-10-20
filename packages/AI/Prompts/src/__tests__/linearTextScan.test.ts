import { describe, it, expect } from 'vitest';
import { ParseManifestEntryMime, TrimSpacesAndTabs } from '../linearTextScan';

/** Deterministic pseudo-random strings over a small alphabet, so equivalence runs are reproducible. */
function corpus(alphabet: readonly string[], count: number, maxLength: number): string[] {
    let seed = 7;
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

const ENTRY_REGEX = /^\*\*[A-Z]+\*\* — .+? \[(?<mime>[^\]]+)\]/;

describe('TrimSpacesAndTabs', () => {
    it.each([
        ['  ###  ', '###'],
        ['\t\n```\t', '\n```'],
        ['\n\n', '\n\n'],
        ['   ', ''],
        ['a b', 'a b'],
        ['', ''],
    ])('%j → %j', (input, expected) => {
        expect(TrimSpacesAndTabs(input)).toBe(expected);
    });

    it('keeps the newline that makes "\\n```" a closing-fence stop', () => {
        expect(' \n``` '.split(',').map(TrimSpacesAndTabs)).toEqual(['\n```']);
    });

    it('matches /^[ \\t]+|[ \\t]+$/g on a random corpus', () => {
        for (const s of corpus([' ', '\t', '\n', 'a', '`', ','], 3000, 12)) {
            expect(TrimSpacesAndTabs(s)).toBe(s.replace(/^[ \t]+|[ \t]+$/g, ''));
        }
    });

    it('stays linear on the input CodeQL flagged (many repetitions of "\\t")', () => {
        const manyTabsThenText = '\t'.repeat(100_000) + 'x' + '\t'.repeat(100_000) + 'y';
        expect(elapsedMs(() => TrimSpacesAndTabs(manyTabsThenText))).toBeLessThan(LINEAR_BUDGET_MS);
    });
});

describe('ParseManifestEntryMime', () => {
    it.each([
        ['**A** — report.pdf [application/pdf]', 'application/pdf'],
        ['**B** — photo [image/png] (2 MB)', 'image/png'],
        ['**C** — a [b] c [image/jpeg]', 'b'],
        ['**D** — name [] then [audio/mpeg]', 'audio/mpeg'],
        ['**E** — [image/png]', null],
        ['**e** — name [image/png]', null],
        ['** — name [image/png]', null],
        ['**F** - name [image/png]', null],
        ['**G** — name [image/png', null],
        ['**H** — na\rme [image/png]', null],
        ['**I** — x [mime with\rterminator]', 'mime with\rterminator'],
        ['## Available Artifacts', null],
        ['', null],
    ])('%j → %j', (input, expected) => {
        expect(ParseManifestEntryMime(input)).toBe(expected);
    });

    it('matches the regex it replaces on a random corpus', () => {
        const alphabet = ['**A** — ', '**', 'Z', ' [', '[', ']', ' ', 'x', '/', '\r', '—'];
        for (const s of corpus(alphabet, 5000, 10)) {
            expect(ParseManifestEntryMime(s)).toBe(ENTRY_REGEX.exec(s)?.groups?.mime ?? null);
        }
    });

    it('stays linear on the input CodeQL flagged (repeated "\\ [\\" after the entry prefix)', () => {
        const pathological = '**A** — a [' + '\\ [\\'.repeat(60_000);
        expect(elapsedMs(() => ParseManifestEntryMime(pathological))).toBeLessThan(LINEAR_BUDGET_MS);
    });
});
