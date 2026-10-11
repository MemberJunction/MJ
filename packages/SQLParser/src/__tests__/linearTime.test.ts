/**
 * The clause screens and the ad-hoc query path run these functions on SQL a client sends, and one
 * request body can hold megabytes of it. Each test doubles the input several times and checks
 * that the time grows about linearly, well under the 4x per doubling of a scan that rereads the
 * text once per item. Inputs are harmless.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';
import { FindForbiddenFunctionCalls } from '../callerSqlFunctions';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

/** Runs per size. The median is kept, so one slow run (a GC pause) does not count. */
const RUNS = 5;
/** Linear code grows about 2x per doubling; code that rescans per item grows about 4x. */
const MAX_GROWTH_PER_DOUBLING = 3;
/** A generous limit for any one size. Linear code takes a small part of it. */
const CEILING_MS = 1000;
const TIMEOUT_MS = 60_000;

/**
 * The median time of `run` at each size, after one warm-up run. Stops after the first size whose
 * time passes {@link CEILING_MS}, so a quadratic regression fails fast.
 */
function timesBySize(sizes: readonly number[], makeRun: (size: number) => () => void): number[] {
    makeRun(sizes[0])();
    const medians: number[] = [];
    for (const size of sizes) {
        const run = makeRun(size);
        const times: number[] = [];
        for (let r = 0; r < RUNS; r++) {
            const start = performance.now();
            run();
            times.push(performance.now() - start);
            if (times[times.length - 1] > CEILING_MS) break;
        }
        times.sort((a, b) => a - b);
        medians.push(times[Math.floor(times.length / 2)]);
        if (medians[medians.length - 1] > CEILING_MS) break;
    }
    return medians;
}

/** Growth per doubling of size: 2 to the slope of a least-squares fit of log2(time) on log2(size). */
function growthPerDoubling(sizes: readonly number[], times: readonly number[]): number {
    const x = sizes.map(Math.log2);
    const y = times.map((t) => Math.log2(Math.max(t, 0.01)));
    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    let num = 0;
    let den = 0;
    x.forEach((xi, i) => {
        num += (xi - meanX) * (y[i] - meanY);
        den += (xi - meanX) ** 2;
    });
    return 2 ** (num / den);
}

/** Times `makeRun` over `sizes` and expects linear growth and no size over the ceiling. */
function expectLinearTime(sizes: readonly number[], makeRun: (size: number) => () => void): void {
    const times = timesBySize(sizes, makeRun);
    const measured = sizes.slice(0, times.length);
    const report = `time by size: ${measured.map((size, i) => `${size}: ${times[i].toFixed(1)} ms`).join(', ')}`;
    expect(times.length, report).toBeGreaterThan(1);
    expect(growthPerDoubling(measured, times), report).toBeLessThan(MAX_GROWTH_PER_DOUBLING);
    expect(Math.max(...times), report).toBeLessThan(CEILING_MS);
}

describe('SQLParser fallback renaming takes time linear in the SQL', () => {
    // These texts do not parse. The direct parse fails at the second name after `1`, so the parser
    // renames the bracket identifiers and tries again, and that retry fails just as early. Only the
    // renaming scan reads the whole text.

    it('when the SQL holds every alias prefix up to the n-th: _mjid_, _mjid1_, _mjid2_, …', () => {
        const sql = (n: number): string =>
            `SELECT 1 FROM t WHERE ([x] = 1 _mjid_ ${Array.from({ length: n }, (_, k) => `_mjid${k + 1}_`).join(' ')})`;
        expectLinearTime([4000, 8000, 16000, 32000, 64000], (n) => {
            const text = sql(n);
            return () => new SQLParser(text, ss);
        });
    }, TIMEOUT_MS);

    it('when the SQL holds many bracket identifiers', () => {
        const sql = (n: number): string => `SELECT 1 FROM t WHERE ([x] = 1 ${'[a b] '.repeat(n)})`;
        expectLinearTime([8000, 16000, 32000, 64000, 128000], (n) => {
            const text = sql(n);
            return () => new SQLParser(text, ss);
        });
    }, TIMEOUT_MS);
});

describe('FindForbiddenFunctionCalls takes time linear in the SQL', () => {
    it('when the SQL calls many different forbidden names', () => {
        const sql = (n: number): string => `SELECT ${Array.from({ length: n }, (_, k) => `lo_x${k}()`).join(', ')}`;
        expect(FindForbiddenFunctionCalls(`${sql(3)}, lo_x1()`, pg)).toEqual(['lo_x0', 'lo_x1', 'lo_x2']);
        expectLinearTime([8000, 16000, 32000, 64000, 128000], (n) => {
            const text = sql(n);
            return () => FindForbiddenFunctionCalls(text, pg);
        });
    }, TIMEOUT_MS);
});
