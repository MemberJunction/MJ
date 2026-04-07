/**
 * @fileoverview Compare command — compares two test suite runs to detect regressions
 * @module @memberjunction/testing-cli
 */

import { RunView, Metadata, UserInfo } from '@memberjunction/core';
import { MJTestSuiteRunEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { CompareFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';

/** Result of comparing a single test across two suite runs */
interface TestComparison {
    TestID: string;
    TestName: string;
    PreviousStatus: string | null;
    CurrentStatus: string | null;
    PreviousScore: number | null;
    CurrentScore: number | null;
    ScoreDelta: number | null;
    PreviousDurationS: number | null;
    CurrentDurationS: number | null;
    Change: 'regression' | 'improvement' | 'unchanged' | 'new' | 'removed';
}

/** Aggregate comparison result */
interface ComparisonResult {
    PreviousRunId: string;
    CurrentRunId: string;
    PreviousSuiteName: string;
    CurrentSuiteName: string;
    PreviousDate: string;
    CurrentDate: string;
    Regressions: number;
    Improvements: number;
    Unchanged: number;
    NewTests: number;
    RemovedTests: number;
    Tests: TestComparison[];
}

/**
 * Compare command — Compare two test suite runs to detect regressions
 */
export class CompareCommand {
    async execute(
        runId1: string | undefined,
        runId2: string | undefined,
        flags: CompareFlags,
        contextUser?: UserInfo
    ): Promise<void> {
        try {
            await initializeMJProvider();
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const rv = new RunView();
            let previousRunId: string;
            let currentRunId: string;

            if (runId1 && runId2) {
                // Explicit two-run comparison
                previousRunId = runId1;
                currentRunId = runId2;
            } else if (flags.latest) {
                // Find the two most recent completed suite runs
                const runs = await rv.RunView<MJTestSuiteRunEntity>({
                    EntityName: 'MJ: Test Suite Runs',
                    ExtraFilter: "Status IN ('Completed', 'Failed')",
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 2,
                    ResultType: 'entity_object'
                }, contextUser);

                if (!runs.Success || runs.Results.length < 2) {
                    console.error(OutputFormatter.formatError('Need at least 2 completed suite runs for --latest comparison'));
                    process.exit(2);
                }
                currentRunId = runs.Results[0].ID;
                previousRunId = runs.Results[1].ID;
            } else {
                console.error(OutputFormatter.formatError(
                    'Provide two run IDs or use --latest\n' +
                    '  mj test compare <run-id-1> <run-id-2>\n' +
                    '  mj test compare --latest'
                ));
                process.exit(1);
            }

            // Load both suite runs
            const md = new Metadata();
            const previousRun = await md.GetEntityObject<MJTestSuiteRunEntity>('MJ: Test Suite Runs', contextUser);
            const currentRun = await md.GetEntityObject<MJTestSuiteRunEntity>('MJ: Test Suite Runs', contextUser);

            const prevLoaded = await previousRun.Load(previousRunId);
            const currLoaded = await currentRun.Load(currentRunId);

            if (!prevLoaded) {
                console.error(OutputFormatter.formatError(`Suite run not found: ${previousRunId}`));
                process.exit(2);
            }
            if (!currLoaded) {
                console.error(OutputFormatter.formatError(`Suite run not found: ${currentRunId}`));
                process.exit(2);
            }

            // Load test runs for both suite runs
            const [prevTestsResult, currTestsResult] = await Promise.all([
                rv.RunView<MJTestRunEntity>({
                    EntityName: 'MJ: Test Runs',
                    ExtraFilter: `TestSuiteRunID='${previousRunId}'`,
                    OrderBy: 'Sequence',
                    ResultType: 'entity_object'
                }, contextUser),
                rv.RunView<MJTestRunEntity>({
                    EntityName: 'MJ: Test Runs',
                    ExtraFilter: `TestSuiteRunID='${currentRunId}'`,
                    OrderBy: 'Sequence',
                    ResultType: 'entity_object'
                }, contextUser)
            ]);

            const prevTests = prevTestsResult.Success ? prevTestsResult.Results : [];
            const currTests = currTestsResult.Success ? currTestsResult.Results : [];

            // Build lookup maps by TestID
            const prevMap = new Map<string, MJTestRunEntity>();
            for (const t of prevTests) prevMap.set(t.TestID, t);
            const currMap = new Map<string, MJTestRunEntity>();
            for (const t of currTests) currMap.set(t.TestID, t);

            // Compare
            const allTestIds = new Set([...prevMap.keys(), ...currMap.keys()]);
            const comparisons: TestComparison[] = [];

            for (const testId of allTestIds) {
                const prev = prevMap.get(testId);
                const curr = currMap.get(testId);

                const prevScore = prev?.Score ?? null;
                const currScore = curr?.Score ?? null;
                const prevStatus = prev?.Status ?? null;
                const currStatus = curr?.Status ?? null;
                const scoreDelta = (prevScore != null && currScore != null) ? currScore - prevScore : null;

                let change: TestComparison['Change'];
                if (!prev) {
                    change = 'new';
                } else if (!curr) {
                    change = 'removed';
                } else if (prevStatus === 'Passed' && currStatus !== 'Passed') {
                    change = 'regression';
                } else if (prevStatus !== 'Passed' && currStatus === 'Passed') {
                    change = 'improvement';
                } else if (scoreDelta != null && scoreDelta < -0.1) {
                    change = 'regression';
                } else if (scoreDelta != null && scoreDelta > 0.1) {
                    change = 'improvement';
                } else {
                    change = 'unchanged';
                }

                comparisons.push({
                    TestID: testId,
                    TestName: curr?.Test ?? prev?.Test ?? testId,
                    PreviousStatus: prevStatus,
                    CurrentStatus: currStatus,
                    PreviousScore: prevScore,
                    CurrentScore: currScore,
                    ScoreDelta: scoreDelta,
                    PreviousDurationS: prev?.DurationSeconds ?? null,
                    CurrentDurationS: curr?.DurationSeconds ?? null,
                    Change: change,
                });
            }

            // Sort: regressions first, then improvements, then unchanged
            const order: Record<string, number> = { regression: 0, improvement: 1, new: 2, removed: 3, unchanged: 4 };
            comparisons.sort((a, b) => order[a.Change] - order[b.Change]);

            const result: ComparisonResult = {
                PreviousRunId: previousRunId,
                CurrentRunId: currentRunId,
                PreviousSuiteName: previousRun.Suite,
                CurrentSuiteName: currentRun.Suite,
                PreviousDate: previousRun.StartedAt?.toISOString().split('T')[0] ?? 'unknown',
                CurrentDate: currentRun.StartedAt?.toISOString().split('T')[0] ?? 'unknown',
                Regressions: comparisons.filter(c => c.Change === 'regression').length,
                Improvements: comparisons.filter(c => c.Change === 'improvement').length,
                Unchanged: comparisons.filter(c => c.Change === 'unchanged').length,
                NewTests: comparisons.filter(c => c.Change === 'new').length,
                RemovedTests: comparisons.filter(c => c.Change === 'removed').length,
                Tests: comparisons,
            };

            // Format output
            const format = flags.format || 'console';
            const output = this.formatComparison(result, format, flags.diffOnly);

            console.log(output);

            if (flags.output) {
                OutputFormatter.writeToFile(output, flags.output);
            }

            await closeMJProvider();

            // Exit codes: 0 = no regressions, 1 = regressions detected, 2 = data error
            process.exit(result.Regressions > 0 ? 1 : 0);

        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to compare test runs', error as Error));
            try { await closeMJProvider(); } catch { /* ignore */ }
            process.exit(2);
        }
    }

    private formatComparison(result: ComparisonResult, format: string, diffOnly?: boolean): string {
        if (format === 'json') {
            return JSON.stringify(diffOnly ? { ...result, Tests: result.Tests.filter(t => t.Change !== 'unchanged') } : result, null, 2);
        }

        const lines: string[] = [];
        const tests = diffOnly ? result.Tests.filter(t => t.Change !== 'unchanged') : result.Tests;

        if (format === 'markdown') {
            lines.push('# Regression Comparison');
            lines.push('');
            lines.push(`**Previous**: ${result.PreviousSuiteName} (${result.PreviousDate}, run ${result.PreviousRunId.substring(0, 8)})`);
            lines.push(`**Current**: ${result.CurrentSuiteName} (${result.CurrentDate}, run ${result.CurrentRunId.substring(0, 8)})`);
            lines.push('');
            lines.push('## Summary');
            lines.push('');
            lines.push(`- **Regressions**: ${result.Regressions}`);
            lines.push(`- **Improvements**: ${result.Improvements}`);
            lines.push(`- **Unchanged**: ${result.Unchanged}`);
            if (result.NewTests > 0) lines.push(`- **New tests**: ${result.NewTests}`);
            if (result.RemovedTests > 0) lines.push(`- **Removed tests**: ${result.RemovedTests}`);
            lines.push('');

            if (result.Regressions > 0) {
                lines.push('## Regressions');
                lines.push('');
                lines.push('| Test | Previous | Current | Delta |');
                lines.push('|------|----------|---------|-------|');
                for (const t of tests.filter(t => t.Change === 'regression')) {
                    const prev = t.PreviousScore != null ? `${(t.PreviousScore * 100).toFixed(0)}% ${t.PreviousStatus}` : '-';
                    const curr = t.CurrentScore != null ? `${(t.CurrentScore * 100).toFixed(0)}% ${t.CurrentStatus}` : '-';
                    const delta = t.ScoreDelta != null ? `${t.ScoreDelta > 0 ? '+' : ''}${(t.ScoreDelta * 100).toFixed(0)}%` : '-';
                    lines.push(`| ${t.TestName} | ${prev} | ${curr} | ${delta} |`);
                }
                lines.push('');
            }

            if (result.Improvements > 0) {
                lines.push('## Improvements');
                lines.push('');
                lines.push('| Test | Previous | Current | Delta |');
                lines.push('|------|----------|---------|-------|');
                for (const t of tests.filter(t => t.Change === 'improvement')) {
                    const prev = t.PreviousScore != null ? `${(t.PreviousScore * 100).toFixed(0)}% ${t.PreviousStatus}` : '-';
                    const curr = t.CurrentScore != null ? `${(t.CurrentScore * 100).toFixed(0)}% ${t.CurrentStatus}` : '-';
                    const delta = t.ScoreDelta != null ? `+${(t.ScoreDelta * 100).toFixed(0)}%` : '-';
                    lines.push(`| ${t.TestName} | ${prev} | ${curr} | ${delta} |`);
                }
                lines.push('');
            }

            if (!diffOnly) {
                lines.push('## All Tests');
                lines.push('');
                lines.push('| Test | Previous | Current | Delta | Change |');
                lines.push('|------|----------|---------|-------|--------|');
                for (const t of tests) {
                    const prev = t.PreviousScore != null ? `${(t.PreviousScore * 100).toFixed(0)}%` : '-';
                    const curr = t.CurrentScore != null ? `${(t.CurrentScore * 100).toFixed(0)}%` : '-';
                    const delta = t.ScoreDelta != null ? `${t.ScoreDelta > 0 ? '+' : ''}${(t.ScoreDelta * 100).toFixed(0)}%` : '-';
                    lines.push(`| ${t.TestName} | ${prev} | ${curr} | ${delta} | ${t.Change} |`);
                }
                lines.push('');
            }

            lines.push('---');
            lines.push('*Generated by MJ Regression Test Runner*');
        } else {
            // Console format
            const hasRegressions = result.Regressions > 0;
            lines.push('');
            lines.push(`  Regression Comparison`);
            lines.push(`  ─────────────────────────────────────────`);
            lines.push(`  Previous: ${result.PreviousDate} (${result.PreviousRunId.substring(0, 8)})`);
            lines.push(`  Current:  ${result.CurrentDate} (${result.CurrentRunId.substring(0, 8)})`);
            lines.push('');
            lines.push(`  Regressions:  ${result.Regressions}${hasRegressions ? ' ⚠️' : ''}`);
            lines.push(`  Improvements: ${result.Improvements}`);
            lines.push(`  Unchanged:    ${result.Unchanged}`);
            lines.push('');

            for (const t of tests) {
                if (diffOnly && t.Change === 'unchanged') continue;
                const icon = t.Change === 'regression' ? '▼' : t.Change === 'improvement' ? '▲' : t.Change === 'new' ? '+' : t.Change === 'removed' ? '-' : ' ';
                const prev = t.PreviousScore != null ? `${(t.PreviousScore * 100).toFixed(0)}%` : '  -';
                const curr = t.CurrentScore != null ? `${(t.CurrentScore * 100).toFixed(0)}%` : '  -';
                const delta = t.ScoreDelta != null ? `${t.ScoreDelta > 0 ? '+' : ''}${(t.ScoreDelta * 100).toFixed(0)}%` : '   -';
                lines.push(`  ${icon} ${t.TestName.padEnd(45)} ${prev.padStart(4)} → ${curr.padStart(4)}  (${delta.padStart(5)})  ${t.Change}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}
