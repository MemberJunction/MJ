/**
 * @fileoverview Pure aggregation helpers for the `history` and `report` commands (DR-G6).
 *
 * These functions turn raw TestRun rows (as loaded via RunView) into the
 * per-test and per-run statistics the CLI renders. They are deliberately
 * DB-free and side-effect-free so they can be unit-tested against synthetic
 * rows without a database or MJ provider.
 *
 * @module @memberjunction/testing-cli
 */

// Type-only import: derive the Status union from the generated entity so it
// tracks the CodeGen CHECK-constraint union forever (CLAUDE.md rule 2c). This
// import is erased at compile time — no runtime dependency on core-entities.
import type { MJTestRunEntity } from '@memberjunction/core-entities';

/** The set of statuses a test run can end in (derived from the entity). */
export type TestRunStatus = MJTestRunEntity['Status'];

/**
 * Minimal shape the aggregation helpers operate on — decoupled from the
 * BaseEntity/RunView row so tests can construct plain objects.
 */
export interface TestRunRow {
    /** FK to the test definition — the grouping key for history. */
    TestID: string;
    /** Denormalized test name for display. */
    TestName: string;
    Status: TestRunStatus;
    /** Wall-clock duration in seconds (decimal in the DB); null when not recorded. */
    DurationSeconds: number | null;
    /** Cost in USD; 0 everywhere today (CU-plan telemetry pending). */
    CostUSD: number | null;
}

/**
 * Statuses treated as a "fail-like" terminal outcome for pass-rate and flake
 * math. Skipped/Pending/Running are non-terminal and excluded from those
 * denominators. Defined over the entity union so adding a new status forces a
 * compile-time decision here.
 */
const FAIL_LIKE_STATUSES: ReadonlySet<TestRunStatus> = new Set<TestRunStatus>([
    'Failed',
    'Error',
    'Timeout',
]);

/** True when the status is a terminal failure (Failed / Error / Timeout). */
export function isFailLike(status: TestRunStatus): boolean {
    return FAIL_LIKE_STATUSES.has(status);
}

/**
 * One-line note surfaced whenever no cost has been captured. Cost/token capture
 * depends on a CU-plan telemetry item (see DR-G6); until it lands CostUSD is 0
 * in every row, so cost is shown as "n/a" rather than a fabricated number.
 */
export const COST_CAPTURE_PENDING_NOTE =
    'Note: cost/token capture is pending (CU-plan telemetry) — CostUSD is 0 in all rows, shown as n/a.';

/** Median of a numeric list (average of the two middle values when even). */
export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Duration statistics for a single test across its runs (all in seconds). */
export interface DurationStats {
    /** Number of runs with a recorded (non-null) duration. */
    count: number;
    min: number | null;
    median: number | null;
    max: number | null;
    /** Most recent recorded duration (first non-null in newest-first order). */
    last: number | null;
}

/**
 * Compute min/median/max/last over durations supplied in newest-first order.
 * Null durations are ignored for min/median/max; `last` is the most recent
 * non-null value (so an errored latest run doesn't blank out the trend).
 */
export function durationStats(durationsNewestFirst: Array<number | null>): DurationStats {
    const nonNull = durationsNewestFirst.filter((d): d is number => d != null);
    const last = durationsNewestFirst.find((d): d is number => d != null) ?? null;
    return {
        count: nonNull.length,
        min: nonNull.length > 0 ? Math.min(...nonNull) : null,
        median: median(nonNull),
        max: nonNull.length > 0 ? Math.max(...nonNull) : null,
        last,
    };
}

/** Pass/fail tallies and the derived flakiness of a single test. */
export interface FlakeStats {
    pass: number;
    fail: number;
    /** True when the test shows BOTH a pass and a fail-like outcome in the window. */
    isFlaky: boolean;
    /**
     * Minority-outcome share: min(pass, fail) / (pass + fail). 0 when all runs
     * agree, up to 0.5 for an even split. This is the cross-run flake signal we
     * can derive today; a stricter "passed-only-on-retry" definition needs the
     * per-attempt lineage column (DR-D8), which isn't in the DB yet.
     */
    flakeRate: number;
}

/** Reduce a list of statuses to pass/fail tallies + flake signal. */
export function flakeStats(statuses: TestRunStatus[]): FlakeStats {
    let pass = 0;
    let fail = 0;
    for (const status of statuses) {
        if (status === 'Passed') pass++;
        else if (isFailLike(status)) fail++;
    }
    const terminal = pass + fail;
    return {
        pass,
        fail,
        isFlaky: pass > 0 && fail > 0,
        flakeRate: terminal > 0 ? Math.min(pass, fail) / terminal : 0,
    };
}

/** Per-test rollup across recent runs (the `history` command's row). */
export interface TestHistorySummary {
    TestID: string;
    TestName: string;
    /** Total runs analyzed for this test. */
    Runs: number;
    Passed: number;
    /** Fail-like runs (Failed + Error + Timeout). */
    Failed: number;
    Skipped: number;
    /** Passed / (Passed + Failed); null when the test never reached a terminal outcome. */
    PassRate: number | null;
    IsFlaky: boolean;
    FlakeRate: number;
    Duration: DurationStats;
    /** Sum of CostUSD across runs (0 today). */
    TotalCostUSD: number;
    /** Mean CostUSD per run (0 today); null when no runs. */
    AvgCostUSD: number | null;
}

/**
 * Group rows by test and compute per-test history. Rows must be supplied
 * newest-first (so `Duration.last` is the most recent run). Output is sorted
 * flakiest-first, then by name, to surface unstable tests at the top.
 */
export function summarizeHistory(rows: TestRunRow[]): TestHistorySummary[] {
    const byTest = new Map<string, TestRunRow[]>();
    for (const row of rows) {
        const existing = byTest.get(row.TestID);
        if (existing) existing.push(row);
        else byTest.set(row.TestID, [row]);
    }

    const summaries: TestHistorySummary[] = [];
    for (const [testId, testRows] of byTest) {
        const fs = flakeStats(testRows.map(r => r.Status));
        const skipped = testRows.filter(r => r.Status === 'Skipped').length;
        const totalCost = testRows.reduce((sum, r) => sum + (r.CostUSD ?? 0), 0);
        const terminal = fs.pass + fs.fail;
        summaries.push({
            TestID: testId,
            TestName: testRows[0].TestName,
            Runs: testRows.length,
            Passed: fs.pass,
            Failed: fs.fail,
            Skipped: skipped,
            PassRate: terminal > 0 ? fs.pass / terminal : null,
            IsFlaky: fs.isFlaky,
            FlakeRate: fs.flakeRate,
            Duration: durationStats(testRows.map(r => r.DurationSeconds)),
            TotalCostUSD: totalCost,
            AvgCostUSD: testRows.length > 0 ? totalCost / testRows.length : null,
        });
    }

    summaries.sort((a, b) => b.FlakeRate - a.FlakeRate || a.TestName.localeCompare(b.TestName));
    return summaries;
}

/**
 * Identify the tests that are flaky across a window of runs (both a pass and a
 * fail-like outcome present). Used by `report` to count how many of a run's
 * tests are historically unstable.
 */
export function flakyTestIds(rows: TestRunRow[]): Set<string> {
    const statusesByTest = new Map<string, TestRunStatus[]>();
    for (const row of rows) {
        const existing = statusesByTest.get(row.TestID);
        if (existing) existing.push(row.Status);
        else statusesByTest.set(row.TestID, [row.Status]);
    }
    const flaky = new Set<string>();
    for (const [testId, statuses] of statusesByTest) {
        if (flakeStats(statuses).isFlaky) flaky.add(testId);
    }
    return flaky;
}

/** Identifying metadata for a single suite run (from the suite-run entity). */
export interface RunMeta {
    SuiteRunID: string;
    SuiteName: string | null;
    /** ISO date (YYYY-MM-DD) or null when unknown. */
    StartedAt: string | null;
}

/** Per-run aggregate (the `report` command's row). */
export interface RunAggregate extends RunMeta {
    Total: number;
    Passed: number;
    Failed: number;
    Error: number;
    Timeout: number;
    Skipped: number;
    Pending: number;
    Running: number;
    /** Cross-run flaky tests present in this run (supplied by the caller; 0 when a single run). */
    Flaky: number;
    /** Passed / (Passed + Failed + Error + Timeout); null when no terminal outcomes. */
    PassRate: number | null;
    TotalDurationSeconds: number;
    /** Sum of CostUSD (0 today). */
    TotalCostUSD: number;
}

/**
 * Aggregate one run's test rows into status counts, pass rate, duration and
 * cost. Counts come from the individual rows' Status (accurate) rather than the
 * suite-run's denormalized columns, which lump all non-passes into "failed".
 */
export function aggregateRun(meta: RunMeta, rows: TestRunRow[], flakyCount = 0): RunAggregate {
    // Record over the full status union so a new CodeGen status forces an update here.
    const counts: Record<TestRunStatus, number> = {
        Error: 0,
        Failed: 0,
        Passed: 0,
        Pending: 0,
        Running: 0,
        Skipped: 0,
        Timeout: 0,
    };
    let duration = 0;
    let cost = 0;
    for (const row of rows) {
        counts[row.Status]++;
        duration += row.DurationSeconds ?? 0;
        cost += row.CostUSD ?? 0;
    }
    const terminal = counts.Passed + counts.Failed + counts.Error + counts.Timeout;
    return {
        SuiteRunID: meta.SuiteRunID,
        SuiteName: meta.SuiteName,
        StartedAt: meta.StartedAt,
        Total: rows.length,
        Passed: counts.Passed,
        Failed: counts.Failed,
        Error: counts.Error,
        Timeout: counts.Timeout,
        Skipped: counts.Skipped,
        Pending: counts.Pending,
        Running: counts.Running,
        Flaky: flakyCount,
        PassRate: terminal > 0 ? counts.Passed / terminal : null,
        TotalDurationSeconds: duration,
        TotalCostUSD: cost,
    };
}
