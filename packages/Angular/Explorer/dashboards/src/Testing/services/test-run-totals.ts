import type { TestAnalytics } from './testing-instrumentation.service';
import { TestingPassRate } from './testing-pass-rate';

/** One row of the `TestRunTotalsByTest` query: one test's run totals over a window. */
export interface TestRunTotalsRow {
  TestID: string;
  TestName: string;
  TestType: string;
  Runs: number;
  Passed: number;
  /** Failed + Error runs. */
  Failures: number;
  /** Skipped runs: not executed, so out of every rate's denominator. */
  Skipped: number;
  TotalCost: number;
  /** Average duration of the completed runs; 0 when none completed. */
  AvgDurationMs: number;
  /** Longest completed run; 0 when none completed. */
  MaxDurationMs: number;
}

/**
 * Turns the per-test totals the `TestRunTotalsByTest` query returns into the Testing analytics view model.
 * The query groups on the server, so these rows are one per test that ran — never one per run.
 */
export class TestRunTotals {
  /** How many tests each ranking lists. */
  public static readonly TOP_N = 10;

  /**
   * Reads query rows into typed totals. SQL Server returns the numeric columns as numbers but a DECIMAL sum can
   * arrive as a string, and AVG/MAX are NULL for a test with no completed run, so every number is coerced (NULL → 0).
   */
  public static FromQueryRows(rows: Array<Record<string, unknown>>): TestRunTotalsRow[] {
    // unknown: RunQuery rows are untyped column bags; each column is narrowed below.
    const num = (value: unknown): number => Number(value) || 0;
    const text = (value: unknown, fallback: string): string => (typeof value === 'string' && value.length > 0 ? value : fallback);
    return rows.map(row => ({
      TestID: text(row['TestID'], ''),
      TestName: text(row['TestName'], 'Unknown'),
      TestType: text(row['TestType'], 'Unknown'),
      Runs: num(row['Runs']),
      Passed: num(row['Passed']),
      Failures: num(row['Failures']),
      Skipped: num(row['Skipped']),
      TotalCost: num(row['TotalCost']),
      AvgDurationMs: num(row['AvgDurationMs']),
      MaxDurationMs: num(row['MaxDurationMs'])
    }));
  }

  /** The analytics rankings (top {@link TOP_N} each) and the by-type roll-ups. */
  public static ToAnalytics(rows: TestRunTotalsRow[]): TestAnalytics {
    const top = <T>(items: T[], compare: (a: T, b: T) => number): T[] => [...items].sort(compare).slice(0, TestRunTotals.TOP_N);
    const byType = TestRunTotals.RollUpByType(rows);
    return {
      topFailingTests: top(rows.map(r => ({
        testName: r.TestName,
        failureCount: r.Failures,
        failureRate: TestingPassRate.ShareOfExecuted(r.Failures, r.Runs, r.Skipped)
      })), (a, b) => b.failureCount - a.failureCount),
      mostExpensiveTests: top(rows.map(r => ({
        testName: r.TestName,
        totalCost: r.TotalCost,
        avgCost: r.Runs > 0 ? r.TotalCost / r.Runs : 0
      })), (a, b) => b.totalCost - a.totalCost),
      slowestTests: top(rows.map(r => ({
        testName: r.TestName,
        avgDuration: r.AvgDurationMs,
        maxDuration: r.MaxDurationMs
      })), (a, b) => b.avgDuration - a.avgDuration),
      costByType: byType
        .map(t => ({ testType: t.TestType, totalCost: t.TotalCost, testCount: t.Runs }))
        .sort((a, b) => b.totalCost - a.totalCost),
      costBySuite: [], // Would need suite data
      passingRateByType: byType
        .map(t => ({ testType: t.TestType, passRate: TestingPassRate.OfExecuted(t.Passed, t.Runs, t.Skipped), totalTests: t.Runs, Skipped: t.Skipped }))
        .sort((a, b) => a.passRate - b.passRate)
    };
  }

  /** Sums the per-test rows by test type (run counts, passes and cost). */
  protected static RollUpByType(rows: TestRunTotalsRow[]): Array<{ TestType: string; Runs: number; Passed: number; Skipped: number; TotalCost: number }> {
    const byType = new Map<string, { TestType: string; Runs: number; Passed: number; Skipped: number; TotalCost: number }>();
    for (const row of rows) {
      const entry = byType.get(row.TestType) || { TestType: row.TestType, Runs: 0, Passed: 0, Skipped: 0, TotalCost: 0 };
      entry.Runs += row.Runs;
      entry.Passed += row.Passed;
      entry.Skipped += row.Skipped;
      entry.TotalCost += row.TotalCost;
      byType.set(row.TestType, entry);
    }
    return Array.from(byType.values());
  }
}
