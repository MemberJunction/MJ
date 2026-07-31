import { describe, it, expect } from 'vitest';
import {
    median,
    durationStats,
    flakeStats,
    summarizeHistory,
    flakyTestIds,
    aggregateRun,
    isFailLike,
    TestRunRow,
    TestRunStatus,
} from '../utils/history-aggregation';

/** Build a synthetic test-run row without touching the DB. */
const row = (
    TestID: string,
    TestName: string,
    Status: TestRunStatus,
    DurationSeconds: number | null = 1,
    CostUSD: number | null = 0
): TestRunRow => ({ TestID, TestName, Status, DurationSeconds, CostUSD });

describe('median', () => {
    it('odd-length picks the middle value', () => {
        expect(median([3, 1, 2])).toBe(2);
    });
    it('even-length averages the two middle values', () => {
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });
    it('empty is null', () => {
        expect(median([])).toBeNull();
    });
});

describe('isFailLike', () => {
    it('Failed / Error / Timeout are fail-like; Passed / Skipped are not', () => {
        expect(isFailLike('Failed')).toBe(true);
        expect(isFailLike('Error')).toBe(true);
        expect(isFailLike('Timeout')).toBe(true);
        expect(isFailLike('Passed')).toBe(false);
        expect(isFailLike('Skipped')).toBe(false);
    });
});

describe('durationStats (newest-first)', () => {
    it('computes min/median/max over non-null and last = newest recorded', () => {
        const stats = durationStats([null, 5, 3, 9]);
        expect(stats.count).toBe(3);
        expect(stats.min).toBe(3);
        expect(stats.median).toBe(5); // sorted [3,5,9] → 5
        expect(stats.max).toBe(9);
        expect(stats.last).toBe(5); // first non-null in newest-first order
    });

    it('all-null yields nulls and zero count', () => {
        const stats = durationStats([null, null]);
        expect(stats).toEqual({ count: 0, min: null, median: null, max: null, last: null });
    });

    it('single value is min = median = max = last', () => {
        expect(durationStats([4])).toEqual({ count: 1, min: 4, median: 4, max: 4, last: 4 });
    });
});

describe('flakeStats', () => {
    it('all pass → not flaky, rate 0', () => {
        expect(flakeStats(['Passed', 'Passed', 'Passed'])).toEqual({
            pass: 3,
            fail: 0,
            isFlaky: false,
            flakeRate: 0,
        });
    });

    it('all fail → not flaky, rate 0', () => {
        expect(flakeStats(['Failed', 'Failed'])).toEqual({ pass: 0, fail: 2, isFlaky: false, flakeRate: 0 });
    });

    it('even split → flaky, rate 0.5', () => {
        expect(flakeStats(['Passed', 'Passed', 'Failed', 'Failed'])).toEqual({
            pass: 2,
            fail: 2,
            isFlaky: true,
            flakeRate: 0.5,
        });
    });

    it('mostly-pass with one fail → flaky, rate = minority share (1/5)', () => {
        const fs = flakeStats(['Passed', 'Passed', 'Passed', 'Passed', 'Failed']);
        expect(fs.isFlaky).toBe(true);
        expect(fs.flakeRate).toBeCloseTo(0.2, 10);
    });

    it('Error and Timeout count as fail-like', () => {
        const fs = flakeStats(['Passed', 'Error', 'Timeout']);
        expect(fs).toMatchObject({ pass: 1, fail: 2, isFlaky: true });
        expect(fs.flakeRate).toBeCloseTo(1 / 3, 10);
    });

    it('Skipped is excluded from pass/fail math', () => {
        expect(flakeStats(['Passed', 'Skipped', 'Skipped'])).toEqual({
            pass: 1,
            fail: 0,
            isFlaky: false,
            flakeRate: 0,
        });
    });
});

describe('summarizeHistory', () => {
    // Rows are supplied newest-first, mixing two tests.
    const rows: TestRunRow[] = [
        row('A', 'Alpha', 'Passed', 2), // newest for A
        row('B', 'Bravo', 'Passed', 10), // newest for B
        row('A', 'Alpha', 'Failed', 4),
        row('B', 'Bravo', 'Passed', 12),
        row('A', 'Alpha', 'Passed', 6),
    ];

    it('groups by test and counts pass/fail/skip', () => {
        const summaries = summarizeHistory(rows);
        const alpha = summaries.find(s => s.TestID === 'A')!;
        const bravo = summaries.find(s => s.TestID === 'B')!;

        expect(alpha.Runs).toBe(3);
        expect(alpha.Passed).toBe(2);
        expect(alpha.Failed).toBe(1);
        expect(alpha.Skipped).toBe(0);
        expect(alpha.PassRate).toBeCloseTo(2 / 3, 10);

        expect(bravo.Runs).toBe(2);
        expect(bravo.Passed).toBe(2);
        expect(bravo.Failed).toBe(0);
        expect(bravo.PassRate).toBe(1);
    });

    it('computes flake-rate per test and marks flaky', () => {
        const summaries = summarizeHistory(rows);
        const alpha = summaries.find(s => s.TestID === 'A')!;
        const bravo = summaries.find(s => s.TestID === 'B')!;

        expect(alpha.IsFlaky).toBe(true);
        expect(alpha.FlakeRate).toBeCloseTo(1 / 3, 10); // min(2,1)/3
        expect(bravo.IsFlaky).toBe(false);
        expect(bravo.FlakeRate).toBe(0);
    });

    it('computes duration min/median/max/last per test', () => {
        const summaries = summarizeHistory(rows);
        const alpha = summaries.find(s => s.TestID === 'A')!;

        // A durations newest-first: [2, 4, 6]
        expect(alpha.Duration.min).toBe(2);
        expect(alpha.Duration.max).toBe(6);
        expect(alpha.Duration.median).toBe(4);
        expect(alpha.Duration.last).toBe(2);
    });

    it('sorts flakiest-first', () => {
        const summaries = summarizeHistory(rows);
        expect(summaries[0].TestID).toBe('A'); // flaky test surfaces first
    });
});

describe('flakyTestIds', () => {
    it('flags tests with both a pass and a fail across runs', () => {
        const rows: TestRunRow[] = [
            row('X', 'X', 'Passed'),
            row('X', 'X', 'Failed'),
            row('Y', 'Y', 'Passed'),
            row('Y', 'Y', 'Passed'),
        ];
        const flaky = flakyTestIds(rows);
        expect(flaky.has('X')).toBe(true);
        expect(flaky.has('Y')).toBe(false);
    });
});

describe('aggregateRun', () => {
    const meta = { SuiteRunID: 'run-1', SuiteName: 'Nightly', StartedAt: '2026-07-20' };
    const rows: TestRunRow[] = [
        row('t1', 't1', 'Passed', 1.0),
        row('t2', 't2', 'Passed', 2.0),
        row('t3', 't3', 'Failed', 3.0),
        row('t4', 't4', 'Error', 4.0),
        row('t5', 't5', 'Timeout', 5.0),
        row('t6', 't6', 'Skipped', 0),
    ];

    it('counts statuses from the individual rows and carries meta', () => {
        const agg = aggregateRun(meta, rows, 2);
        expect(agg.SuiteRunID).toBe('run-1');
        expect(agg.SuiteName).toBe('Nightly');
        expect(agg.StartedAt).toBe('2026-07-20');
        expect(agg.Total).toBe(6);
        expect(agg.Passed).toBe(2);
        expect(agg.Failed).toBe(1);
        expect(agg.Error).toBe(1);
        expect(agg.Timeout).toBe(1);
        expect(agg.Skipped).toBe(1);
        expect(agg.Flaky).toBe(2); // supplied by caller
    });

    it('pass rate excludes skipped (passed / terminal outcomes)', () => {
        const agg = aggregateRun(meta, rows);
        // terminal = 2 pass + 1 failed + 1 error + 1 timeout = 5
        expect(agg.PassRate).toBeCloseTo(2 / 5, 10);
    });

    it('sums duration and reports zero cost (capture pending)', () => {
        const agg = aggregateRun(meta, rows);
        expect(agg.TotalDurationSeconds).toBeCloseTo(15.0, 10);
        expect(agg.TotalCostUSD).toBe(0);
    });

    it('null pass rate when no terminal outcomes', () => {
        const agg = aggregateRun(meta, [row('s', 's', 'Skipped', 0)]);
        expect(agg.PassRate).toBeNull();
    });
});
