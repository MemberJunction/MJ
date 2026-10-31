/**
 * Shared helpers for the MJ Query language suites: the six dialects, and a linear-time check.
 */
import { expect } from 'vitest';
import { GetQueryDialect } from '@memberjunction/sql-dialect';
import type { ParserDialect } from '@memberjunction/sql-dialect';
import type { Diagnostic } from '../../common/analysis.js';

/** The six dialects the package reads. */
export const DIALECT_KEYS = ['sqlserver', 'postgresql', 'mysql', 'oracle', 'snowflake', 'databricks'] as const;

/** A dialect by key. */
export function Dialect(key: typeof DIALECT_KEYS[number]): ParserDialect {
    return GetQueryDialect(key);
}

export const SS = Dialect('sqlserver');
export const PG = Dialect('postgresql');

/** The codes of a diagnostic list. */
export function Codes(diagnostics: readonly Diagnostic[]): string[] {
    return diagnostics.map(d => d.Code);
}

/** Runs per size; the median is kept so one slow run does not count. */
const RUNS = 5;
/** Linear code grows about 2x per doubling; code that rescans per item grows about 4x. */
const MAX_GROWTH_PER_DOUBLING = 3;
/** A generous ceiling of CPU time for any one size. */
const CEILING_MS = 2000;

/** Options for timing tests: a long timeout and two retries (a quadratic regression fails every attempt). */
export const TIMING_OPTIONS = { timeout: 60_000, retry: 2 };

function cpuMs(run: () => void): number {
    const start = process.cpuUsage();
    run();
    const used = process.cpuUsage(start);
    return (used.user + used.system) / 1000;
}

function medianTimes(sizes: readonly number[], makeRun: (size: number) => () => void): number[] {
    const warm = makeRun(sizes[Math.floor(sizes.length / 2)]);
    for (let i = 0; i < 3; i++) warm();
    const medians: number[] = [];
    for (const size of sizes) {
        const run = makeRun(size);
        const times: number[] = [];
        for (let r = 0; r < RUNS; r++) times.push(cpuMs(run));
        times.sort((a, b) => a - b);
        medians.push(times[Math.floor(times.length / 2)]);
        if (medians[medians.length - 1] > CEILING_MS) break;
    }
    return medians;
}

function growthPerDoubling(sizes: readonly number[], times: readonly number[]): number {
    const x = sizes.map(Math.log2);
    const y = times.map(t => Math.log2(Math.max(t, 0.05)));
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

/** Expects the CPU time of `makeRun(size)()` to grow about linearly over `sizes`. */
export function ExpectLinearTime(sizes: readonly number[], makeRun: (size: number) => () => void): void {
    const times = medianTimes(sizes, makeRun);
    const measured = sizes.slice(0, times.length);
    const report = measured.map((size, i) => `${size}: ${times[i].toFixed(1)} ms`).join(', ');
    expect(times.length, `a size passed ${CEILING_MS} ms (${report})`).toBe(sizes.length);
    expect(growthPerDoubling(measured, times), `growth per doubling (${report})`).toBeLessThan(MAX_GROWTH_PER_DOUBLING);
}
