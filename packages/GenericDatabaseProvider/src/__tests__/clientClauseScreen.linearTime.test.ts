/**
 * `ClientClauseScreen.CollectStatementReads` walks every client clause and ad-hoc statement, and
 * one request body can hold megabytes of SQL. Each test doubles the statement several times and
 * checks that the walk's time grows about linearly, well under the 4x per doubling of a walk that
 * copies the CTE names in scope for each CTE body or subquery. The statements read only constants.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect, type SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '@memberjunction/sql-parser';
import { ClientClauseScreen } from '../clientClauseScreen';

/** Runs per size. The median is kept, so one slow run (a GC pause) does not count. */
const RUNS = 5;
/** Linear code grows about 2x per doubling; code that copies per item grows about 4x. */
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

/** Times the walk of the statement `sql(size)` builds, over `sizes`, and expects linear growth and no size over the ceiling. */
function expectLinearWalk(sizes: readonly number[], sql: (size: number) => string, dialect: SQLParserDialect): void {
    const times = timesBySize(sizes, (size) => {
        const parser = new SQLParser(sql(size), dialect);
        expect(parser.IsValid).toBe(true);
        return () => ClientClauseScreen.CollectStatementReads(parser);
    });
    const measured = sizes.slice(0, times.length);
    const report = `time by size: ${measured.map((size, i) => `${size}: ${times[i].toFixed(1)} ms`).join(', ')}`;
    expect(times.length, report).toBeGreaterThan(1);
    expect(growthPerDoubling(measured, times), report).toBeLessThan(MAX_GROWTH_PER_DOUBLING);
    expect(Math.max(...times), report).toBeLessThan(CEILING_MS);
}

/** `count` CTEs `c0`, `c1`, … that each select a constant. */
const cteList = (count: number): string => Array.from({ length: count }, (_, i) => `c${i} AS (SELECT 1 AS a)`).join(', ');

const DIALECTS: Array<[string, SQLParserDialect]> = [['PostgreSQL', new PostgreSQLDialect()], ['SQL Server', new SQLServerDialect()]];

describe.each(DIALECTS)('ClientClauseScreen.CollectStatementReads takes time linear in the statement (%s)', (_dialectName, dialect) => {
    it('with many CTEs in one WITH list', () => {
        expectLinearWalk([2000, 4000, 8000, 16000], (count) => `WITH ${cteList(count)} SELECT a FROM c${count - 1}`, dialect);
    }, TIMEOUT_MS);

    it('with many subqueries that each declare a CTE, under a long WITH list', () => {
        const subqueries = (count: number): string => Array.from({ length: count }, () => '(WITH s AS (SELECT 1 AS a) SELECT a FROM s)').join(', ');
        expectLinearWalk([500, 1000, 2000, 4000], (count) => `WITH ${cteList(count)} SELECT ${subqueries(count)} FROM c0`, dialect);
    }, TIMEOUT_MS);
});
