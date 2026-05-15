/**
 * @fileoverview Compare command — compares two test suite runs to detect regressions
 * @module @memberjunction/testing-cli
 */

import * as fs from 'fs';
import * as path from 'path';
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

/** Normalized shape of a suite run — works whether sourced from DB or results.json */
interface SuiteRunSummary {
    RunId: string;
    SuiteName: string;
    StartedAt: string;      // ISO date string (YYYY-MM-DD)
    Tests: TestRunSummary[];
}

/** Normalized shape of a single test run */
interface TestRunSummary {
    TestID: string;
    TestName: string;
    Status: string;
    Score: number | null;
    DurationSeconds: number | null;
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
        // --from-json: compare two results.json files directly (no DB required).
        // Designed for comparing Docker regression runs where the DB is ephemeral.
        //
        // Accepts either:
        //   - Two file paths:  --from-json PREV.json --from-json CURR.json
        //   - One directory:   --from-json <dir>  (picks two newest results-*.json by mtime)
        if (flags.fromJson && flags.fromJson.length > 0) {
            if (flags.tag) {
                console.warn(
                    `Warning: --tag is ignored with --from-json — results.json does not currently emit the Tags field. ` +
                        `Use DB mode (drop --from-json) to filter by tag.`,
                );
            }
            const resolved = this.resolveFromJsonPaths(flags.fromJson);
            if (resolved) {
                return this.executeFromJson(resolved.previous, resolved.current, flags);
            }
        }

        try {
            await initializeMJProvider();
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const rv = new RunView();
            let previousRunId: string;
            let currentRunId: string;

            // Detect if user provided any explicit selector
            const hasVersionFlag = flags.version && flags.version.length >= 2;
            const hasCommitFlag = flags.commit && flags.commit.length >= 2;
            const hasExplicitIds = Boolean(runId1 && runId2);

            if (hasExplicitIds) {
                // Explicit two-run comparison
                previousRunId = runId1!;
                currentRunId = runId2!;
            } else if (hasVersionFlag) {
                // Compare by version: -v <previous> -v <current>
                const [prevRun, currRun] = await Promise.all([
                    this.findLatestSuiteRunBy(rv, 'AgentVersion', flags.version![0], contextUser, flags.tag),
                    this.findLatestSuiteRunBy(rv, 'AgentVersion', flags.version![1], contextUser, flags.tag),
                ]);
                if (!prevRun) {
                    console.error(OutputFormatter.formatError(`No completed suite run found with AgentVersion='${flags.version![0]}'`));
                    process.exit(2);
                }
                if (!currRun) {
                    console.error(OutputFormatter.formatError(`No completed suite run found with AgentVersion='${flags.version![1]}'`));
                    process.exit(2);
                }
                previousRunId = prevRun.ID;
                currentRunId = currRun.ID;
            } else if (hasCommitFlag) {
                // Compare by git commit: -c <previous> -c <current>
                const [prevRun, currRun] = await Promise.all([
                    this.findLatestSuiteRunBy(rv, 'GitCommit', flags.commit![0], contextUser, flags.tag),
                    this.findLatestSuiteRunBy(rv, 'GitCommit', flags.commit![1], contextUser, flags.tag),
                ]);
                if (!prevRun) {
                    console.error(OutputFormatter.formatError(`No completed suite run found with GitCommit='${flags.commit![0]}'`));
                    process.exit(2);
                }
                if (!currRun) {
                    console.error(OutputFormatter.formatError(`No completed suite run found with GitCommit='${flags.commit![1]}'`));
                    process.exit(2);
                }
                previousRunId = prevRun.ID;
                currentRunId = currRun.ID;
            } else {
                // Default behavior: compare the two most recent completed suite runs.
                // Triggered by --latest OR by running `mj test compare` with no args.
                // When --tag is provided, restrict to runs whose Tags JSON array
                // includes the tag. Tags is stored as a JSON array string like
                // `["staging-nightly","sonnet-4.6"]`, so we LIKE-match the quoted
                // form to avoid false-positives where the tag is a substring of
                // another tag (e.g. "prod" matching "production").
                let extraFilter = "Status IN ('Completed', 'Failed')";
                if (flags.tag) {
                    const escaped = flags.tag.replace(/'/g, "''");
                    extraFilter += ` AND Tags LIKE '%"${escaped}"%'`;
                }
                const runs = await rv.RunView<MJTestSuiteRunEntity>({
                    EntityName: 'MJ: Test Suite Runs',
                    ExtraFilter: extraFilter,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 2,
                    ResultType: 'entity_object'
                }, contextUser);

                if (!runs.Success || runs.Results.length < 2) {
                    const tagSuffix = flags.tag ? ` matching tag '${flags.tag}'` : '';
                    console.error(OutputFormatter.formatError(
                        `Need at least 2 completed suite runs to compare${tagSuffix} (found ${runs.Results?.length ?? 0})`
                    ));
                    process.exit(2);
                }
                currentRunId = runs.Results[0].ID;
                previousRunId = runs.Results[1].ID;
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

            // Normalize to SuiteRunSummary shape so we can share comparison logic with --from-json path
            const previousSummary: SuiteRunSummary = {
                RunId: previousRunId,
                SuiteName: previousRun.Suite,
                StartedAt: previousRun.StartedAt?.toISOString().split('T')[0] ?? 'unknown',
                Tests: (prevTestsResult.Success ? prevTestsResult.Results : []).map(t => ({
                    TestID: t.TestID,
                    TestName: t.Test,
                    Status: t.Status,
                    Score: t.Score,
                    DurationSeconds: t.DurationSeconds,
                })),
            };
            const currentSummary: SuiteRunSummary = {
                RunId: currentRunId,
                SuiteName: currentRun.Suite,
                StartedAt: currentRun.StartedAt?.toISOString().split('T')[0] ?? 'unknown',
                Tests: (currTestsResult.Success ? currTestsResult.Results : []).map(t => ({
                    TestID: t.TestID,
                    TestName: t.Test,
                    Status: t.Status,
                    Score: t.Score,
                    DurationSeconds: t.DurationSeconds,
                })),
            };

            const result = this.buildComparisonResult(previousSummary, currentSummary);

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

    /**
     * Resolve --from-json flag values into a {previous, current} file pair.
     *
     * Supports two modes:
     *   - Two file paths  → returns them in declared order
     *   - One directory   → finds two newest regression runs by mtime, looking for:
     *                         (a) <dir>/run-* /results.json   — per-run folder pattern (current)
     *                         (b) <dir>/results-*.json         — flat archive pattern (legacy)
     *                       Both patterns are scanned together and sorted by mtime,
     *                       so a directory with a mix works fine.
     *
     * Returns null (and prints an error) if the inputs can't be resolved.
     */
    private resolveFromJsonPaths(inputs: string[]): { previous: string; current: string } | null {
        if (inputs.length >= 2) {
            return { previous: inputs[0], current: inputs[1] };
        }

        // Single argument — must be a directory
        const candidate = path.resolve(inputs[0]);
        if (!fs.existsSync(candidate)) {
            console.error(OutputFormatter.formatError(`Path does not exist: ${candidate}`));
            process.exit(2);
        }

        const stats = fs.statSync(candidate);
        if (!stats.isDirectory()) {
            console.error(OutputFormatter.formatError(
                `--from-json needs either two file paths or one directory (got one file: ${candidate})`
            ));
            process.exit(2);
        }

        const entries = fs.readdirSync(candidate, { withFileTypes: true });
        const found: Array<{ path: string; mtime: number }> = [];

        for (const entry of entries) {
            // Per-run folder pattern: <dir>/run-*/results.json
            if (entry.isDirectory() && entry.name.startsWith('run-')) {
                const resultsFile = path.join(candidate, entry.name, 'results.json');
                if (fs.existsSync(resultsFile)) {
                    found.push({ path: resultsFile, mtime: fs.statSync(resultsFile).mtimeMs });
                }
            }
            // Flat archive pattern: <dir>/results-*.json (legacy)
            else if (entry.isFile() && /^results-.*\.json$/.test(entry.name)) {
                const full = path.join(candidate, entry.name);
                found.push({ path: full, mtime: fs.statSync(full).mtimeMs });
            }
        }

        found.sort((a, b) => b.mtime - a.mtime);

        if (found.length < 2) {
            console.error(OutputFormatter.formatError(
                `Need at least 2 archived regression runs in ${candidate} (found ${found.length}). ` +
                `Looked for: run-*/results.json and results-*.json`
            ));
            process.exit(2);
        }

        // Newest is "current", second-newest is "previous"
        return { previous: found[1].path, current: found[0].path };
    }

    /**
     * Compare two results.json files directly without querying the database.
     * Used when the Docker regression DB is ephemeral and results are archived
     * as JSON artifacts instead.
     */
    private async executeFromJson(
        previousJsonPath: string,
        currentJsonPath: string,
        flags: CompareFlags
    ): Promise<void> {
        try {
            const previous = this.parseResultsJson(previousJsonPath);
            const current = this.parseResultsJson(currentJsonPath);

            const result = this.buildComparisonResult(previous, current);

            const format = flags.format || 'console';
            const output = this.formatComparison(result, format, flags.diffOnly);

            console.log(output);

            if (flags.output) {
                OutputFormatter.writeToFile(output, flags.output);
            }

            // Exit codes: 0 = no regressions, 1 = regressions detected, 2 = data error
            process.exit(result.Regressions > 0 ? 1 : 0);
        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to compare results.json files', error as Error));
            process.exit(2);
        }
    }

    /**
     * Parse a results.json file into the normalized SuiteRunSummary shape.
     * Expected shape matches what `mj test suite --format=json --output=...` produces.
     */
    private parseResultsJson(filePath: string): SuiteRunSummary {
        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Results file not found: ${resolvedPath}`);
        }

        let raw: unknown;
        try {
            raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
        } catch (e) {
            throw new Error(`Invalid JSON in ${resolvedPath}: ${(e as Error).message}`);
        }

        const data = raw as {
            suiteRunId?: string;
            suiteName?: string;
            startedAt?: string;
            testResults?: Array<{
                testRunId?: string;
                testId?: string;
                testName?: string;
                status?: string;
                score?: number | null;
                durationMs?: number | null;
            }>;
        };

        if (!data || !Array.isArray(data.testResults)) {
            throw new Error(`${resolvedPath} does not look like a suite results file (missing testResults array)`);
        }

        const startedAt = data.startedAt ? data.startedAt.split('T')[0] : 'unknown';

        return {
            RunId: data.suiteRunId ?? path.basename(resolvedPath),
            SuiteName: data.suiteName ?? 'unknown',
            StartedAt: startedAt,
            Tests: data.testResults.map(t => ({
                TestID: t.testId ?? t.testName ?? 'unknown',
                TestName: t.testName ?? t.testId ?? 'unknown',
                Status: t.status ?? 'Unknown',
                Score: typeof t.score === 'number' ? t.score : null,
                DurationSeconds: typeof t.durationMs === 'number' ? t.durationMs / 1000 : null,
            })),
        };
    }

    /**
     * Core comparison logic — takes two normalized suite runs and produces the
     * full ComparisonResult. Shared between the DB path and the JSON path.
     */
    private buildComparisonResult(previous: SuiteRunSummary, current: SuiteRunSummary): ComparisonResult {
        const prevMap = new Map<string, TestRunSummary>();
        for (const t of previous.Tests) prevMap.set(t.TestID, t);
        const currMap = new Map<string, TestRunSummary>();
        for (const t of current.Tests) currMap.set(t.TestID, t);

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
                TestName: curr?.TestName ?? prev?.TestName ?? testId,
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

        const order: Record<string, number> = { regression: 0, improvement: 1, new: 2, removed: 3, unchanged: 4 };
        comparisons.sort((a, b) => order[a.Change] - order[b.Change]);

        return {
            PreviousRunId: previous.RunId,
            CurrentRunId: current.RunId,
            PreviousSuiteName: previous.SuiteName,
            CurrentSuiteName: current.SuiteName,
            PreviousDate: previous.StartedAt,
            CurrentDate: current.StartedAt,
            Regressions: comparisons.filter(c => c.Change === 'regression').length,
            Improvements: comparisons.filter(c => c.Change === 'improvement').length,
            Unchanged: comparisons.filter(c => c.Change === 'unchanged').length,
            NewTests: comparisons.filter(c => c.Change === 'new').length,
            RemovedTests: comparisons.filter(c => c.Change === 'removed').length,
            Tests: comparisons,
        };
    }

    /**
     * Find the most recent completed suite run matching a given field/value.
     * Used to resolve --version and --commit flags to concrete run IDs.
     */
    private async findLatestSuiteRunBy(
        rv: RunView,
        fieldName: 'AgentVersion' | 'GitCommit',
        value: string,
        contextUser: UserInfo,
        tag?: string,
    ): Promise<MJTestSuiteRunEntity | null> {
        // Escape single quotes for SQL safety
        const safeValue = value.replace(/'/g, "''");
        let extraFilter = `${fieldName}='${safeValue}' AND Status IN ('Completed', 'Failed')`;
        if (tag) {
            const safeTag = tag.replace(/'/g, "''");
            extraFilter += ` AND Tags LIKE '%"${safeTag}"%'`;
        }
        const result = await rv.RunView<MJTestSuiteRunEntity>({
            EntityName: 'MJ: Test Suite Runs',
            ExtraFilter: extraFilter,
            OrderBy: 'StartedAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object'
        }, contextUser);
        return result.Success && result.Results.length > 0 ? result.Results[0] : null;
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
