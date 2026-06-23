/**
 * @fileoverview Suite command implementation
 * @module @memberjunction/testing-cli
 */

import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';
import { SuiteFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { SpinnerManager } from '../utils/spinner-manager';
import { loadCLIConfig } from '../utils/config-loader';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import { parseVariableFlags } from '../utils/variable-parser';
import { loadOraclesModule } from '../utils/oracle-module-loader';
import { installInstrumentedCacheFirst } from '@memberjunction/testing-integration';

/**
 * Suite command - Execute a test suite
 */
export class SuiteCommand {
    private spinner = new SpinnerManager();

    /**
     * Execute the suite command
     *
     * @param suiteId - Test suite ID to run
     * @param flags - Command flags
     * @param contextUser - Optional user context (will be fetched if not provided)
     */
    async execute(suiteId: string | undefined, flags: SuiteFlags, contextUser?: UserInfo): Promise<void> {
        try {
            // Integration tests must install the instrumented cache as the FIRST caller
            // (before any provider setup) or its counters are a silent no-op. Opt-in via
            // MJ_INTEGRATION_TEST=1 so every other suite run is byte-for-byte unchanged.
            if (process.env.MJ_INTEGRATION_TEST === '1') {
                await installInstrumentedCacheFirst();
            }

            // Initialize MJ provider (database connection and metadata)
            console.log('Initializing MJ provider...');
            await initializeMJProvider();
            console.log('MJ provider initialized successfully');

            // Get context user after initialization if not provided
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const config = loadCLIConfig();
            const format = flags.format || config.defaultFormat || 'console';

            // Get engine instance
            console.log('Getting TestEngine instance...');
            const engine = TestEngine.Instance;
            console.log('Configuring TestEngine...');
            await engine.Config(false, contextUser);
            console.log(`TestEngine configured. Test Types loaded: ${engine.TestTypes?.length || 0}`);
            console.log(`Test Suites loaded: ${engine.TestSuites?.length || 0}`);
            console.log(`Tests loaded: ${engine.Tests?.length || 0}`);

            // Plug in user-supplied oracles before resolving the suite. They
            // register at the engine level via `engine.RegisterOracle()` and
            // become available to every test in the suite that references the
            // matching oracle `type`.
            if (flags.oraclesModule) {
                const summary = await loadOraclesModule(flags.oraclesModule, engine);
                console.log(
                    `Loaded oracle module ${summary.modulePath} ` +
                        `(registered: ${summary.registered.join(', ') || 'none'}` +
                        (summary.skipped.length ? `; skipped: ${summary.skipped.length}` : '') +
                        ')',
                );
            }

            let suite;

            if (suiteId) {
                // Run specific suite by ID
                console.log(`Looking for suite by ID: ${suiteId}`);
                suite = engine.GetTestSuiteByID(suiteId);
                if (!suite) {
                    console.error(OutputFormatter.formatError(`Test suite not found: ${suiteId}`));
                    console.error(`Available suites: ${engine.TestSuites?.map(s => s.Name).join(', ') || 'none'}`);
                    process.exit(1);
                }
            } else if (flags.name) {
                // Run suite by name
                console.log(`Looking for suite by name: ${flags.name}`);
                suite = engine.GetTestSuiteByName(flags.name);
                if (!suite) {
                    console.error(OutputFormatter.formatError(`Test suite not found: ${flags.name}`));
                    console.error(`Available suites: ${engine.TestSuites?.map(s => s.Name).join(', ') || 'none'}`);
                    process.exit(1);
                }
            } else {
                console.error(OutputFormatter.formatError('Must specify suite ID or --name'));
                process.exit(1);
            }

            // Parse variables from --var flags
            // Note: Suite variables apply to all tests - type conversion happens per-test
            const variables = parseVariableFlags(flags.var);

            // Execute suite
            const flakyMsg = flags.flakyCheck && flags.flakyCheck > 1
                ? ` (flaky-check: each test ×${flags.flakyCheck})`
                : '';
            this.spinner.start(`Running test suite: ${suite.Name}${flakyMsg}...`);

            const result = await engine.RunSuite(suite.ID, {
                verbose: flags.verbose,
                variables,
                delayBetweenTests: flags.delay,
                parallel: flags.parallel,
                maxParallel: flags.maxParallel,
                repeatCountOverride: flags.flakyCheck && flags.flakyCheck > 1 ? flags.flakyCheck : undefined,
            }, contextUser);

            this.spinner.stop();

            // If --flaky-check was used, compute per-test variance and report flaky tests.
            // The engine returns multiple results per test (one per iteration); we group by
            // testId and compute score variance to identify inconsistent tests.
            let flakyReport = '';
            if (flags.flakyCheck && flags.flakyCheck > 1) {
                flakyReport = this.buildFlakyReport(result.testResults, flags.flakyCheck);
            }

            // Format and display result
            const output = OutputFormatter.formatSuiteResult(result, format);
            console.log(output);
            if (flakyReport) console.log(flakyReport);

            // Write to file if requested (include flaky report in markdown/console output)
            const fileOutput = flakyReport && format !== 'json' ? output + '\n' + flakyReport : output;
            OutputFormatter.writeToFile(fileOutput, flags.output);

            // Clean up resources
            await closeMJProvider();

            // Exit with appropriate code (non-zero if any test failed)
            process.exit(result.failedTests === 0 ? 0 : 1);

        } catch (error) {
            this.spinner.fail();
            console.error(OutputFormatter.formatError('Failed to run test suite', error as Error));

            // Clean up resources before exit
            try {
                await closeMJProvider();
            } catch {
                // Ignore cleanup errors
            }

            process.exit(1);
        }
    }

    /**
     * Build a flaky-test summary by grouping iteration results by testId and
     * computing score variance. A test is "flaky" if its scores vary by more
     * than VARIANCE_THRESHOLD across iterations OR if its statuses are mixed
     * (some Passed, some Failed).
     *
     * Variance threshold of 0.3 is the plan-recommended cutoff — small enough
     * to catch real instability, large enough to ignore minor LLM judge noise.
     */
    private buildFlakyReport(testResults: Array<{ testId: string; testName: string; score: number; status: string }>, iterations: number): string {
        const VARIANCE_THRESHOLD = 0.3;

        // Group by testId — when --flaky-check N is used, each test produces N entries
        const byTest = new Map<string, { name: string; scores: number[]; statuses: string[] }>();
        for (const r of testResults) {
            const entry = byTest.get(r.testId) ?? { name: r.testName, scores: [], statuses: [] };
            entry.scores.push(r.score);
            entry.statuses.push(r.status);
            byTest.set(r.testId, entry);
        }

        // Compute variance + status mixing per test
        type FlakyRow = { name: string; scores: number[]; statuses: string[]; variance: number; mixedStatus: boolean; flaky: boolean };
        const rows: FlakyRow[] = [];
        for (const [, entry] of byTest) {
            // Skip tests that didn't actually run multiple times (e.g. if an iteration errored)
            if (entry.scores.length < 2) continue;

            const max = Math.max(...entry.scores);
            const min = Math.min(...entry.scores);
            const variance = max - min;
            const uniqueStatuses = new Set(entry.statuses);
            const mixedStatus = uniqueStatuses.size > 1;
            const flaky = variance > VARIANCE_THRESHOLD || mixedStatus;
            rows.push({ ...entry, variance, mixedStatus, flaky });
        }

        const flakyRows = rows.filter(r => r.flaky).sort((a, b) => b.variance - a.variance);

        const lines: string[] = [];
        lines.push('');
        lines.push('  Flaky Test Detection');
        lines.push('  ─────────────────────────────────────────');
        lines.push(`  Each test ran ${iterations}× (variance threshold: ${VARIANCE_THRESHOLD})`);
        lines.push('');

        if (flakyRows.length === 0) {
            lines.push('  ✓ No flaky tests detected — all tests produced consistent results.');
            lines.push('');
            return lines.join('\n');
        }

        lines.push(`  ⚠ ${flakyRows.length} flaky test(s) detected:`);
        lines.push('');
        for (const r of flakyRows) {
            const reasons: string[] = [];
            if (r.variance > VARIANCE_THRESHOLD) {
                reasons.push(`variance ${(r.variance * 100).toFixed(0)}%`);
            }
            if (r.mixedStatus) {
                reasons.push(`mixed: ${r.statuses.join('/')}`);
            }
            const scoresStr = r.scores.map(s => (s * 100).toFixed(0) + '%').join(', ');
            lines.push(`  [FLAKY] ${r.name}`);
            lines.push(`          scores: ${scoresStr}  (${reasons.join(', ')})`);
        }
        lines.push('');

        return lines.join('\n');
    }
}
