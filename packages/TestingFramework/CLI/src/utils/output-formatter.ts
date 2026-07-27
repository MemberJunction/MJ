/**
 * @fileoverview Output formatting utilities for CLI
 * @module @memberjunction/testing-cli
 */

import chalk from 'chalk';
import { TestRunResult, TestSuiteRunResult } from '@memberjunction/testing-engine';
import { OutputFormat } from '../types';
import * as fs from 'fs';

/**
 * Format test result for display
 */
export class OutputFormatter {
    /**
     * True when a test's status represents a real failure the operator must act on.
     *
     * `'Skipped'` is neither a pass nor a failure — it means the test never executed, because a
     * tier gate was closed or the bundle cannot apply to the active database platform. Rendering
     * it as FAIL would make a correctly-configured PostgreSQL run look broken; rendering it as
     * PASS is the false green this reporting exists to eliminate. It gets its own label.
     */
    public static isTestFailure(status: TestRunResult['status']): boolean {
        return status !== 'Passed' && status !== 'Skipped';
    }

    /**
     * Format test run result based on output format
     */
    static formatTestResult(result: TestRunResult, format: OutputFormat): string {
        switch (format) {
            case 'json':
                return this.formatJSON(result);
            case 'markdown':
                return this.formatMarkdown(result);
            case 'console':
            default:
                return this.formatConsole(result);
        }
    }

    /**
     * Format suite result based on output format
     */
    static formatSuiteResult(result: TestSuiteRunResult, format: OutputFormat): string {
        switch (format) {
            case 'json':
                return this.formatSuiteJSON(result);
            case 'markdown':
                return this.formatSuiteMarkdown(result);
            case 'console':
            default:
                return this.formatSuiteConsole(result);
        }
    }

    /**
     * Format test result as JSON
     */
    private static formatJSON(result: TestRunResult): string {
        return JSON.stringify(result, null, 2);
    }

    /**
     * Format test result as Markdown
     */
    private static formatMarkdown(result: TestRunResult): string {
        const status = result.status === 'Passed' ? 'PASSED ✓'
            : result.status === 'Skipped' ? 'SKIPPED ⊘'
            : 'FAILED ✗';
        const scorePercent = (result.score * 100).toFixed(1);

        let md = `# Test Run: ${result.testName}\n`;
        md += `**Status:** ${status}\n`;
        md += `**Score:** ${result.score.toFixed(4)} (${scorePercent}%)\n`;
        md += `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s\n`;
        md += `**Cost:** $${result.totalCost.toFixed(4)}\n`;

        md += '\n## Oracle Results\n';
        for (const oracle of result.oracleResults) {
            const symbol = oracle.passed ? '✓' : '✗';
            md += `- ${symbol} ${oracle.oracleType}: ${oracle.message}\n`;
        }

        if (result.errorMessage) {
            md += '\n## Error\n';
            md += `\`\`\`\n${result.errorMessage}\n\`\`\`\n`;
        }

        return md;
    }

    /**
     * Format test result for console output
     */
    private static formatConsole(result: TestRunResult): string {
        const lines: string[] = [];

        // Header
        lines.push(chalk.bold(`\n[TEST_START] ${result.testName}`));
        lines.push(chalk.gray(`[TARGET] ${result.targetType}`));

        if (result.targetLogId) {
            lines.push(chalk.cyan(`[TARGET_ID] ${result.targetLogId}`));
        }

        lines.push('');

        // Oracle results
        if (result.oracleResults.length > 0) {
            lines.push(chalk.bold(`[ORACLES] Running ${result.oracleResults.length} validation(s)`));
            for (const oracle of result.oracleResults) {
                const symbol = oracle.passed ? chalk.green('✓') : chalk.red('✗');
                const scoreStr = oracle.score != null ? ` (score: ${oracle.score.toFixed(4)})` : '';
                lines.push(`${symbol} ${oracle.oracleType}${scoreStr}: ${oracle.message}`);
            }
            lines.push('');
        }

        // Score
        const scorePercent = (result.score * 100).toFixed(1);
        lines.push(chalk.bold('[SCORE]'));
        lines.push(`  Overall: ${result.score.toFixed(4)} (${scorePercent}%)`);
        lines.push(`  Checks: ${result.passedChecks}/${result.totalChecks} passed`);
        lines.push(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
        lines.push(`  Cost: $${result.totalCost.toFixed(4)}`);

        // Final status
        lines.push('');
        if (result.status === 'Passed') {
            lines.push(chalk.green.bold(`[TEST_PASS] ${result.testName}`));
        } else if (result.status === 'Skipped') {
            lines.push(chalk.yellow.bold(`[TEST_SKIP] ${result.testName}`));
        } else {
            lines.push(chalk.red.bold(`[TEST_FAIL] ${result.testName}`));
        }

        if (result.errorMessage) {
            lines.push('');
            lines.push(chalk.red.bold('[ERROR]'));
            lines.push(chalk.red(result.errorMessage));
        }

        return lines.join('\n');
    }

    /**
     * Format suite result as JSON
     */
    private static formatSuiteJSON(result: TestSuiteRunResult): string {
        return JSON.stringify(result, null, 2);
    }

    /**
     * Format suite result as Markdown
     */
    private static formatSuiteMarkdown(result: TestSuiteRunResult): string {
        // Pass rate is over the tests that actually EXECUTED. Dividing by totalTests would
        // silently depress the rate on a platform where some bundles legitimately do not apply.
        const executedTests = result.totalTests - result.skippedTests;
        const passRate = executedTests > 0 ? (result.passedTests / executedTests * 100).toFixed(1) : '0.0';

        let md = `# Test Suite: ${result.suiteName}\n`;
        md += `**Total Tests:** ${result.totalTests}\n`;
        md += `**Passed:** ${result.passedTests}\n`;
        md += `**Failed:** ${result.failedTests}\n`;
        md += `**Skipped:** ${result.skippedTests}\n`;
        md += `**Pass Rate:** ${passRate}% (of ${executedTests} executed)\n`;
        md += `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s\n`;
        md += `**Total Cost:** $${result.totalCost.toFixed(4)}\n`;

        md += '\n## Test Results\n';
        md += '| Test | Status | Score | Duration | Cost |\n';
        md += '|------|--------|-------|----------|------|\n';

        for (const testResult of result.testResults) {
            const status = testResult.status === 'Passed' ? '✓ PASS'
                : testResult.status === 'Skipped' ? '⊘ SKIP'
                : '✗ FAIL';
            const cost = `$${testResult.totalCost.toFixed(4)}`;
            md += `| ${testResult.testName} | ${status} | ${testResult.score.toFixed(4)} | ${(testResult.durationMs / 1000).toFixed(1)}s | ${cost} |\n`;
        }

        const skipped = result.testResults.filter(t => t.status === 'Skipped');
        if (skipped.length > 0) {
            md += '\n## Skipped\n';
            for (const testResult of skipped) {
                // The gate oracle carries the reason — surface it, so a skip is always explainable.
                const reason = testResult.oracleResults.find(o => o.oracleType === 'gate')?.message ?? 'no reason recorded';
                md += `- **${testResult.testName}** — ${reason}\n`;
            }
        }

        const failedTests = result.testResults.filter(t => OutputFormatter.isTestFailure(t.status));
        if (failedTests.length > 0) {
            md += '\n## Failures\n';
            for (const testResult of failedTests) {
                md += `\n### ${testResult.testName}\n`;
                md += `- **Score:** ${testResult.score.toFixed(4)}\n`;

                for (const oracle of testResult.oracleResults) {
                    if (!oracle.passed) {
                        md += `- **Failed Oracle:** ${oracle.oracleType} - ${oracle.message}\n`;
                    }
                }

                if (testResult.errorMessage) {
                    md += `- **Error:** ${testResult.errorMessage}\n`;
                }
            }
        }

        return md;
    }

    /**
     * Format suite result for console output
     */
    private static formatSuiteConsole(result: TestSuiteRunResult): string {
        const lines: string[] = [];

        // Header
        lines.push(chalk.bold(`\n[SUITE_START] ${result.suiteName}`));
        lines.push(chalk.gray(`[TESTS] ${result.totalTests} tests queued`));
        lines.push('');

        // Individual test results
        for (let i = 0; i < result.testResults.length; i++) {
            const testResult = result.testResults[i];
            const number = chalk.gray(`[${i + 1}/${result.totalTests}]`);
            const failed = OutputFormatter.isTestFailure(testResult.status);
            const isSkipped = testResult.status === 'Skipped';
            const symbol = isSkipped ? chalk.yellow('⊘') : failed ? chalk.red('✗') : chalk.green('✓');
            const status = isSkipped ? chalk.yellow('SKIPPED') : failed ? chalk.red('FAILED') : chalk.green('PASSED');
            const cost = `$${testResult.totalCost.toFixed(4)}`;

            lines.push(`${number} ${testResult.testName}`);
            lines.push(`${symbol} ${status} (${(testResult.durationMs / 1000).toFixed(1)}s, score: ${testResult.score.toFixed(4)}, cost: ${cost})`);

            if (isSkipped) {
                const reason = testResult.oracleResults.find(o => o.oracleType === 'gate')?.message;
                if (reason) {
                    lines.push(chalk.yellow(`  - ${reason}`));
                }
            }

            if (failed) {
                for (const oracle of testResult.oracleResults) {
                    if (!oracle.passed) {
                        lines.push(chalk.red(`  - Oracle '${oracle.oracleType}' failed: ${oracle.message}`));
                    }
                }
                if (testResult.errorMessage) {
                    lines.push(chalk.red(`  - Error: ${testResult.errorMessage}`));
                }
            }

            lines.push('');
        }

        // Summary. The pass rate is over EXECUTED tests — see formatSuiteMarkdown.
        const executedTests = result.totalTests - result.skippedTests;
        const passRate = executedTests > 0 ? (result.passedTests / executedTests * 100).toFixed(1) : '0.0';
        lines.push(chalk.bold('[SUITE_COMPLETE] ' + result.suiteName));
        lines.push(chalk.bold(`[SUMMARY] ${result.passedTests}/${executedTests} executed tests passed (${passRate}%)`));
        lines.push(chalk.bold(`[DURATION] ${(result.durationMs / 1000).toFixed(1)}s`));
        lines.push(chalk.bold(`[COST] $${result.totalCost.toFixed(4)}`));

        if (result.skippedTests > 0) {
            lines.push(chalk.yellow.bold(`[SKIPPED] ${result.skippedTests} test(s) did not execute - see details above`));
        }

        if (result.failedTests > 0) {
            lines.push(chalk.red.bold(`[FAILURES] ${result.failedTests} test(s) failed - see details above`));
        }

        return lines.join('\n');
    }

    /**
     * Write output to file if specified
     */
    static writeToFile(content: string, filePath?: string): void {
        if (!filePath) {
            return;
        }

        try {
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(chalk.green(`✓ Output saved to ${filePath}`));
        } catch (error) {
            console.error(chalk.red(`✗ Failed to write to ${filePath}: ${(error as Error).message}`));
        }
    }

    /**
     * Format error message
     */
    static formatError(message: string, error?: Error): string {
        const lines: string[] = [];
        lines.push(chalk.red.bold('✗ Error: ' + message));

        if (error) {
            lines.push('');
            lines.push(chalk.red(error.message));

            if (error.stack) {
                lines.push('');
                lines.push(chalk.gray(error.stack));
            }
        }

        return lines.join('\n');
    }

    /**
     * Format success message
     */
    static formatSuccess(message: string): string {
        return chalk.green.bold('✓ ' + message);
    }

    /**
     * Format warning message
     */
    static formatWarning(message: string): string {
        return chalk.yellow.bold('⚠ ' + message);
    }

    /**
     * Format info message
     */
    static formatInfo(message: string): string {
        return chalk.blue.bold('ℹ ' + message);
    }
}
