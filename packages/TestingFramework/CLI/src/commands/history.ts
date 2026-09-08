/**
 * @fileoverview History command implementation
 * @module @memberjunction/testing-cli
 */

import { RunView, UserInfo } from '@memberjunction/core';
import { HistoryFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import {
    TestRunRow,
    TestRunStatus,
    TestHistorySummary,
    summarizeHistory,
    COST_CAPTURE_PENDING_NOTE,
} from '../utils/history-aggregation';

/** Default number of recent test-run records analyzed when --limit is omitted. */
const DEFAULT_LIMIT = 50;

/** Narrowed shape read from the MJ: Test Runs view (read-only, ResultType 'simple'). */
interface TestRunQueryRow {
    TestID: string;
    Test: string;
    Status: TestRunStatus;
    DurationSeconds: number | null;
    CostUSD: number | null;
}

/**
 * History command — per-test duration and flake history across recent runs.
 *
 * Flake is derived from cross-run outcome inconsistency (a test that both
 * passes and fails in the window); the per-attempt "passed-only-on-retry"
 * column is not yet in the DB. Cost is 0 everywhere until CU-plan
 * telemetry lands, so it is shown as n/a with a note.
 */
export class HistoryCommand {
    async execute(flags: HistoryFlags, contextUser?: UserInfo): Promise<void> {
        try {
            await initializeMJProvider();
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const rv = new RunView();
            const limit = flags.limit && flags.limit > 0 ? flags.limit : DEFAULT_LIMIT;
            const rows = await this.loadRows(rv, flags, limit, contextUser);

            if (rows.length === 0) {
                console.log(OutputFormatter.formatInfo('No test runs found matching the given filters.'));
                await closeMJProvider();
                return;
            }

            const summaries = summarizeHistory(rows);
            const format = flags.format || 'console';
            const output =
                format === 'json'
                    ? this.formatJson(summaries, rows.length, limit)
                    : this.formatConsole(summaries, rows.length, flags);

            console.log(output);
            if (flags.output) {
                OutputFormatter.writeToFile(output, flags.output);
            }

            await closeMJProvider();
        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to show history', error as Error));
            try {
                await closeMJProvider();
            } catch {
                /* ignore cleanup errors */
            }
            process.exit(1);
        }
    }

    /**
     * Load recent test-run rows, applying --test and/or --suite filters. `--limit`
     * caps the number of newest records analyzed.
     */
    private async loadRows(
        rv: RunView,
        flags: HistoryFlags,
        limit: number,
        contextUser: UserInfo
    ): Promise<TestRunRow[]> {
        const filters: string[] = [];

        if (flags.test) {
            filters.push(`Test='${this.escape(flags.test)}'`);
        }

        if (flags.suite) {
            const suiteRunIds = await this.resolveSuiteRunIds(rv, flags.suite, contextUser);
            if (suiteRunIds.length === 0) {
                return [];
            }
            const idList = suiteRunIds.map(id => `'${this.escape(id)}'`).join(',');
            filters.push(`TestSuiteRunID IN (${idList})`);
        }

        const result = await rv.RunView<TestRunQueryRow>(
            {
                EntityName: 'MJ: Test Runs',
                Fields: ['TestID', 'Test', 'Status', 'DurationSeconds', 'CostUSD'],
                ExtraFilter: filters.join(' AND '),
                OrderBy: 'StartedAt DESC',
                MaxRows: limit,
                ResultType: 'simple',
            },
            contextUser
        );

        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'RunView failed loading test runs');
        }

        return result.Results.map(r => ({
            TestID: r.TestID,
            TestName: r.Test,
            Status: r.Status,
            DurationSeconds: r.DurationSeconds,
            CostUSD: r.CostUSD,
        }));
    }

    /** Resolve a suite NAME to the set of its suite-run IDs (recent first, capped). */
    private async resolveSuiteRunIds(rv: RunView, suiteName: string, contextUser: UserInfo): Promise<string[]> {
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Test Suite Runs',
                Fields: ['ID'],
                ExtraFilter: `Suite='${this.escape(suiteName)}'`,
                OrderBy: 'StartedAt DESC',
                MaxRows: 200,
                ResultType: 'simple',
            },
            contextUser
        );
        return result.Success ? result.Results.map(r => r.ID) : [];
    }

    /** Escape single quotes for safe inline SQL string literals. */
    private escape(value: string): string {
        return value.replace(/'/g, "''");
    }

    private formatJson(summaries: TestHistorySummary[], rowCount: number, limit: number): string {
        return JSON.stringify(
            {
                analyzedRuns: rowCount,
                limit,
                costCapturePending: !summaries.some(s => s.TotalCostUSD > 0),
                tests: summaries,
            },
            null,
            2
        );
    }

    private formatConsole(summaries: TestHistorySummary[], rowCount: number, flags: HistoryFlags): string {
        const lines: string[] = [];
        lines.push('');
        lines.push('  Test History');
        lines.push('  ────────────────────────────────────────────────────────────────────');
        const scope: string[] = [];
        if (flags.test) scope.push(`test="${flags.test}"`);
        if (flags.suite) scope.push(`suite="${flags.suite}"`);
        lines.push(`  Analyzed ${rowCount} recent run(s)${scope.length ? ` (${scope.join(', ')})` : ''}, ${summaries.length} test(s)`);
        lines.push('');

        const header =
            '  ' +
            'Test'.padEnd(40) +
            'Runs'.padStart(5) +
            'Pass'.padStart(5) +
            'Fail'.padStart(5) +
            'Skip'.padStart(5) +
            'Pass%'.padStart(7) +
            'Flake%'.padStart(8) +
            'Min(s)'.padStart(8) +
            'Med(s)'.padStart(8) +
            'Max(s)'.padStart(8) +
            'Last(s)'.padStart(9) +
            'Cost'.padStart(7);
        lines.push(header);
        lines.push('  ' + '─'.repeat(header.length - 2));

        for (const s of summaries) {
            const flag = s.IsFlaky ? '≈ ' : '  ';
            const name = this.truncate(s.TestName, 38);
            lines.push(
                '  ' +
                    (flag + name).padEnd(40) +
                    String(s.Runs).padStart(5) +
                    String(s.Passed).padStart(5) +
                    String(s.Failed).padStart(5) +
                    String(s.Skipped).padStart(5) +
                    this.pct(s.PassRate).padStart(7) +
                    this.pct(s.FlakeRate).padStart(8) +
                    this.sec(s.Duration.min).padStart(8) +
                    this.sec(s.Duration.median).padStart(8) +
                    this.sec(s.Duration.max).padStart(8) +
                    this.sec(s.Duration.last).padStart(9) +
                    this.cost(s.TotalCostUSD).padStart(7)
            );
        }

        lines.push('');
        lines.push('  Flake% = min(pass,fail)/(pass+fail) across the window; ≈ marks flaky tests.');
        if (!summaries.some(s => s.TotalCostUSD > 0)) {
            lines.push('  ' + COST_CAPTURE_PENDING_NOTE);
        }
        lines.push('');
        return lines.join('\n');
    }

    private truncate(value: string, max: number): string {
        return value.length > max ? value.substring(0, max - 1) + '…' : value;
    }

    private pct(value: number | null): string {
        return value != null ? `${(value * 100).toFixed(0)}%` : '-';
    }

    private sec(value: number | null): string {
        return value != null ? value.toFixed(1) : '-';
    }

    private cost(value: number): string {
        return value > 0 ? `$${value.toFixed(4)}` : 'n/a';
    }
}
