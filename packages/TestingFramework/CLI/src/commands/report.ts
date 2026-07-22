/**
 * @fileoverview Report command implementation (DR-G6)
 * @module @memberjunction/testing-cli
 */

import { RunView, UserInfo } from '@memberjunction/core';
import { ReportFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import {
    TestRunRow,
    TestRunStatus,
    RunAggregate,
    RunMeta,
    aggregateRun,
    flakyTestIds,
    COST_CAPTURE_PENDING_NOTE,
} from '../utils/history-aggregation';

/** Number of most-recent suite runs pulled for the cross-run trend. */
const TREND_WINDOW = 10;

/** Narrowed suite-run row (read-only). */
interface SuiteRunQueryRow {
    ID: string;
    Suite: string;
    SuiteID: string;
    StartedAt: string | Date | null;
    Status: string;
}

/** Narrowed test-run row, including the parent run id for grouping. */
interface TestRunQueryRow {
    TestSuiteRunID: string | null;
    TestID: string;
    Test: string;
    Status: TestRunStatus;
    DurationSeconds: number | null;
    CostUSD: number | null;
}

/**
 * Report command — per-run aggregate (status counts, pass rate, duration) plus
 * a cross-run trend when the suite has multiple runs.
 *
 * Flaky counts are derived from cross-run outcome inconsistency across the trend
 * window (0 when only a single run exists). Cost is 0 until CU-plan telemetry
 * lands and is shown as n/a with a note.
 */
export class ReportCommand {
    async execute(flags: ReportFlags, contextUser?: UserInfo): Promise<void> {
        try {
            await initializeMJProvider();
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const rv = new RunView();
            const target = await this.resolveTargetRun(rv, flags, contextUser);
            if (!target) {
                const scope = flags.baseline ? `run '${flags.baseline}'` : flags.suite ? `suite '${flags.suite}'` : 'any suite run';
                console.error(OutputFormatter.formatError(`No completed suite run found for ${scope}.`));
                await closeMJProvider();
                process.exit(1);
            }

            const windowRuns = await this.loadTrendWindow(rv, target, contextUser);
            const runsById = this.indexRuns(windowRuns, target);
            const runRows = await this.loadTestRunsForRuns(rv, [...runsById.keys()], contextUser);

            const rowsByRun = this.groupByRun(runRows);
            const flakySet = flakyTestIds(runRows.map(this.toRow));

            const targetAggregate = this.aggregate(target.ID, runsById, rowsByRun, flakySet);
            const trend = [...runsById.values()]
                .map(meta => this.aggregate(meta.SuiteRunID, runsById, rowsByRun, flakySet))
                .sort((a, b) => (b.StartedAt ?? '').localeCompare(a.StartedAt ?? ''));

            const format = flags.format || 'console';
            const output =
                format === 'json'
                    ? this.formatJson(targetAggregate, trend)
                    : this.formatConsole(targetAggregate, trend, runRows.length);

            console.log(output);
            if (flags.output) {
                OutputFormatter.writeToFile(output, flags.output);
            }

            await closeMJProvider();
        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to generate report', error as Error));
            try {
                await closeMJProvider();
            } catch {
                /* ignore cleanup errors */
            }
            process.exit(1);
        }
    }

    /** Resolve the run to report on: an explicit --baseline id, else the latest completed run. */
    private async resolveTargetRun(
        rv: RunView,
        flags: ReportFlags,
        contextUser: UserInfo
    ): Promise<SuiteRunQueryRow | null> {
        const fields = ['ID', 'Suite', 'SuiteID', 'StartedAt', 'Status'];
        if (flags.baseline) {
            const result = await rv.RunView<SuiteRunQueryRow>(
                {
                    EntityName: 'MJ: Test Suite Runs',
                    Fields: fields,
                    ExtraFilter: `ID='${this.escape(flags.baseline)}'`,
                    ResultType: 'simple',
                },
                contextUser
            );
            return result.Success && result.Results.length > 0 ? result.Results[0] : null;
        }

        let filter = "Status IN ('Completed', 'Failed')";
        if (flags.suite) {
            filter += ` AND Suite='${this.escape(flags.suite)}'`;
        }
        const result = await rv.RunView<SuiteRunQueryRow>(
            {
                EntityName: 'MJ: Test Suite Runs',
                Fields: fields,
                ExtraFilter: filter,
                OrderBy: 'StartedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser
        );
        return result.Success && result.Results.length > 0 ? result.Results[0] : null;
    }

    /** Load the most recent suite runs of the same suite for the trend view. */
    private async loadTrendWindow(
        rv: RunView,
        target: SuiteRunQueryRow,
        contextUser: UserInfo
    ): Promise<SuiteRunQueryRow[]> {
        const result = await rv.RunView<SuiteRunQueryRow>(
            {
                EntityName: 'MJ: Test Suite Runs',
                Fields: ['ID', 'Suite', 'SuiteID', 'StartedAt', 'Status'],
                ExtraFilter: `SuiteID='${this.escape(target.SuiteID)}' AND Status IN ('Completed', 'Failed')`,
                OrderBy: 'StartedAt DESC',
                MaxRows: TREND_WINDOW,
                ResultType: 'simple',
            },
            contextUser
        );
        return result.Success ? result.Results : [];
    }

    /** Build a runId → RunMeta map from the window plus the target (target always included). */
    private indexRuns(windowRuns: SuiteRunQueryRow[], target: SuiteRunQueryRow): Map<string, RunMeta> {
        const map = new Map<string, RunMeta>();
        for (const run of [...windowRuns, target]) {
            if (!map.has(run.ID)) {
                map.set(run.ID, {
                    SuiteRunID: run.ID,
                    SuiteName: run.Suite ?? null,
                    StartedAt: this.dateOnly(run.StartedAt),
                });
            }
        }
        return map;
    }

    /** Load every test run belonging to the given suite-run IDs in one query. */
    private async loadTestRunsForRuns(
        rv: RunView,
        runIds: string[],
        contextUser: UserInfo
    ): Promise<TestRunQueryRow[]> {
        if (runIds.length === 0) return [];
        const idList = runIds.map(id => `'${this.escape(id)}'`).join(',');
        const result = await rv.RunView<TestRunQueryRow>(
            {
                EntityName: 'MJ: Test Runs',
                Fields: ['TestSuiteRunID', 'TestID', 'Test', 'Status', 'DurationSeconds', 'CostUSD'],
                ExtraFilter: `TestSuiteRunID IN (${idList})`,
                ResultType: 'simple',
            },
            contextUser
        );
        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'RunView failed loading test runs');
        }
        return result.Results;
    }

    private groupByRun(rows: TestRunQueryRow[]): Map<string, TestRunQueryRow[]> {
        const map = new Map<string, TestRunQueryRow[]>();
        for (const row of rows) {
            const key = row.TestSuiteRunID ?? '';
            const existing = map.get(key);
            if (existing) existing.push(row);
            else map.set(key, [row]);
        }
        return map;
    }

    /** Aggregate one run, counting its flaky (cross-run-inconsistent) tests. */
    private aggregate(
        runId: string,
        runsById: Map<string, RunMeta>,
        rowsByRun: Map<string, TestRunQueryRow[]>,
        flakySet: Set<string>
    ): RunAggregate {
        const rows = rowsByRun.get(runId) ?? [];
        const meta = runsById.get(runId) ?? { SuiteRunID: runId, SuiteName: null, StartedAt: null };
        const flakyCount = rows.filter(r => flakySet.has(r.TestID)).length;
        return aggregateRun(meta, rows.map(this.toRow), flakyCount);
    }

    /** Project a query row onto the helper's TestRunRow shape. */
    private toRow(r: TestRunQueryRow): TestRunRow {
        return {
            TestID: r.TestID,
            TestName: r.Test,
            Status: r.Status,
            DurationSeconds: r.DurationSeconds,
            CostUSD: r.CostUSD,
        };
    }

    private escape(value: string): string {
        return value.replace(/'/g, "''");
    }

    /** Normalize a datetimeoffset (string or Date) to YYYY-MM-DD, or null. */
    private dateOnly(value: string | Date | null): string | null {
        if (!value) return null;
        if (value instanceof Date) return value.toISOString().split('T')[0];
        return value.split('T')[0];
    }

    private formatJson(target: RunAggregate, trend: RunAggregate[]): string {
        const anyCost = trend.some(r => r.TotalCostUSD > 0);
        return JSON.stringify(
            {
                run: target,
                trend: trend.length > 1 ? trend : [],
                costCapturePending: !anyCost,
            },
            null,
            2
        );
    }

    private formatConsole(target: RunAggregate, trend: RunAggregate[], analyzedRows: number): string {
        const lines: string[] = [];
        lines.push('');
        lines.push('  Test Run Report');
        lines.push('  ────────────────────────────────────────────────────────────────────');
        lines.push(`  Suite:    ${target.SuiteName ?? 'unknown'}`);
        lines.push(`  Run:      ${target.SuiteRunID.substring(0, 8)}${target.StartedAt ? `  (${target.StartedAt})` : ''}`);
        lines.push('');
        lines.push(`  Total:    ${target.Total}`);
        lines.push(`  Passed:   ${target.Passed}`);
        lines.push(`  Failed:   ${target.Failed}`);
        lines.push(`  Error:    ${target.Error}`);
        lines.push(`  Timeout:  ${target.Timeout}`);
        lines.push(`  Skipped:  ${target.Skipped}`);
        if (target.Pending > 0) lines.push(`  Pending:  ${target.Pending}`);
        if (target.Running > 0) lines.push(`  Running:  ${target.Running}`);
        lines.push(`  Flaky:    ${target.Flaky}${trend.length > 1 ? ' (cross-run)' : ' (n/a — needs ≥2 runs)'}`);
        lines.push('');
        lines.push(`  Pass rate:      ${this.pct(target.PassRate)}`);
        lines.push(`  Total duration: ${target.TotalDurationSeconds.toFixed(1)}s`);
        lines.push(`  Total cost:     ${this.cost(target.TotalCostUSD)}`);
        lines.push('');

        if (trend.length > 1) {
            lines.push('  Cross-run trend (newest first)');
            const header =
                '  ' +
                'Date'.padEnd(12) +
                'Run'.padEnd(10) +
                'Pass/Total'.padStart(11) +
                'Pass%'.padStart(7) +
                'Flaky'.padStart(7) +
                'Dur(s)'.padStart(9);
            lines.push(header);
            lines.push('  ' + '─'.repeat(header.length - 2));
            for (const r of trend) {
                const marker = r.SuiteRunID === target.SuiteRunID ? '*' : ' ';
                lines.push(
                    '  ' +
                        (r.StartedAt ?? '-').padEnd(12) +
                        (marker + r.SuiteRunID.substring(0, 8)).padEnd(10) +
                        `${r.Passed}/${r.Total}`.padStart(11) +
                        this.pct(r.PassRate).padStart(7) +
                        String(r.Flaky).padStart(7) +
                        r.TotalDurationSeconds.toFixed(1).padStart(9)
                );
            }
            lines.push('  (* = this run)');
        } else {
            lines.push('  Cross-run trend: only one run available for this suite.');
        }

        lines.push('');
        lines.push(`  Analyzed ${analyzedRows} test-run record(s) across ${trend.length} run(s).`);
        if (!trend.some(r => r.TotalCostUSD > 0)) {
            lines.push('  ' + COST_CAPTURE_PENDING_NOTE);
        }
        lines.push('');
        return lines.join('\n');
    }

    private pct(value: number | null): string {
        return value != null ? `${(value * 100).toFixed(0)}%` : '-';
    }

    private cost(value: number): string {
        return value > 0 ? `$${value.toFixed(4)}` : 'n/a';
    }
}
