/**
 * @fileoverview Result formatting utilities for test output
 * @module @memberjunction/testing-engine
 */

import { TestRunResult, TestSuiteRunResult, OracleResult } from '../types';
import { summarizeSuiteResults } from '../engine/suite-tally';
import { formatCost } from './cost-calculator';

/**
 * Format test run result as human-readable text.
 *
 * @param result - Test run result
 * @returns Formatted text output
 */
export function formatTestRunResult(result: TestRunResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`Test: ${result.testName}`);
    lines.push(`Status: ${result.status}`);
    lines.push(`Score: ${(result.score * 100).toFixed(1)}%`);
    lines.push(`Checks: ${result.passedChecks}/${result.totalChecks} passed`);
    lines.push(`Duration: ${formatDuration(result.durationMs)}`);
    lines.push(`Cost: ${formatCost(result.totalCost)}`);
    lines.push('='.repeat(80));

    if (result.oracleResults.length > 0) {
        lines.push('\nOracle Results:');
        for (const oracle of result.oracleResults) {
            lines.push(formatOracleResult(oracle, '  '));
        }
    }

    return lines.join('\n');
}

/**
 * Format test suite run result as human-readable text.
 *
 * @param result - Test suite run result
 * @returns Formatted text output
 */
export function formatSuiteRunResult(result: TestSuiteRunResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`Test Suite: ${result.suiteName}`);
    lines.push(`Status: ${result.status}`);
    lines.push(`Tests: ${formatTestTally(result)}`);
    lines.push(`Average Score: ${(result.averageScore * 100).toFixed(1)}%`);
    lines.push(`Duration: ${formatDuration(result.durationMs)}`);
    lines.push(`Cost: ${formatCost(result.totalCost)}`);
    lines.push('='.repeat(80));

    if (result.testResults.length > 0) {
        lines.push('\nTest Results:');
        for (const test of result.testResults) {
            lines.push(formatTestSummary(test, '  '));
        }
    }

    return lines.join('\n');
}

/**
 * Format oracle result as human-readable text.
 *
 * @param result - Oracle result
 * @param indent - Indentation prefix
 * @returns Formatted text output
 */
export function formatOracleResult(result: OracleResult, indent: string = ''): string {
    const status = result.passed ? '✓' : '✗';
    const lines: string[] = [];

    lines.push(`${indent}${status} ${result.oracleType}: ${result.message}`);
    lines.push(`${indent}  Score: ${(result.score * 100).toFixed(1)}%`);

    if (result.details) {
        lines.push(`${indent}  Details: ${JSON.stringify(result.details, null, 2)}`);
    }

    return lines.join('\n');
}

/**
 * Format test summary (for suite results).
 *
 * @param result - Test run result
 * @param indent - Indentation prefix
 * @returns Formatted text output
 */
/**
 * "X/Y passed" over EXECUTED tests, with the skip count called out separately when non-zero.
 * Using totalTests as the denominator reports a suite that skipped half its members as though
 * it had failed them.
 */
function formatTestTally(result: TestSuiteRunResult): string {
    const skipped = result.skippedTests;
    const executed = result.totalTests - skipped;
    const base = `${result.passedTests}/${executed} passed`;
    return skipped > 0 ? `${base} (${skipped} skipped, ${result.totalTests} total)` : base;
}

/**
 * Glyph for a test status. Three-way, not two-way: a skipped test never executed, so rendering
 * it as ✗ reports a bundle that correctly declined to run (wrong platform, unmet tier gate,
 * absent MJAPI) as a product defect. Centralised so a status added to the union has exactly one
 * place to be handled rather than four.
 */
function statusGlyph(status: TestRunResult['status'], skip: string, pass: string, fail: string): string {
    if (status === 'Skipped') return skip;
    return status === 'Passed' ? pass : fail;
}

export function formatTestSummary(result: TestRunResult, indent: string = ''): string {
    const status = statusGlyph(result.status, '⊘', '✓', '✗');
    return `${indent}${status} ${result.testName}: ${(result.score * 100).toFixed(1)}% (${result.passedChecks}/${result.totalChecks})`;
}

/**
 * Format test run result as JSON.
 *
 * @param result - Test run result
 * @param pretty - Whether to pretty-print (default: true)
 * @returns JSON string
 */
export function formatTestRunResultAsJSON(
    result: TestRunResult,
    pretty: boolean = true
): string {
    return JSON.stringify(result, null, pretty ? 2 : 0);
}

/**
 * Format test suite run result as JSON.
 *
 * @param result - Test suite run result
 * @param pretty - Whether to pretty-print (default: true)
 * @returns JSON string
 */
export function formatSuiteRunResultAsJSON(
    result: TestSuiteRunResult,
    pretty: boolean = true
): string {
    return JSON.stringify(result, null, pretty ? 2 : 0);
}

/**
 * Format test run result as markdown.
 *
 * @param result - Test run result
 * @returns Markdown output
 */
export function formatTestRunResultAsMarkdown(result: TestRunResult): string {
    const lines: string[] = [];

    lines.push(`# Test: ${result.testName}\n`);
    lines.push(`**Status:** ${statusGlyph(result.status, '⊘ Skipped', '✅ Passed', `❌ ${result.status}`)}`);
    lines.push(`**Score:** ${(result.score * 100).toFixed(1)}%`);
    lines.push(`**Checks:** ${result.passedChecks}/${result.totalChecks} passed`);
    lines.push(`**Duration:** ${formatDuration(result.durationMs)}`);
    lines.push(`**Cost:** ${formatCost(result.totalCost)}\n`);

    if (result.oracleResults.length > 0) {
        lines.push('## Oracle Results\n');
        lines.push('| Oracle | Status | Score | Message |');
        lines.push('|--------|--------|-------|---------|');

        for (const oracle of result.oracleResults) {
            const status = oracle.passed ? '✅' : '❌';
            const score = `${(oracle.score * 100).toFixed(1)}%`;
            lines.push(`| ${oracle.oracleType} | ${status} | ${score} | ${oracle.message} |`);
        }
    }

    return lines.join('\n');
}

/**
 * Format test suite run result as markdown.
 *
 * @param result - Test suite run result
 * @returns Markdown output
 */
export function formatSuiteRunResultAsMarkdown(result: TestSuiteRunResult): string {
    const lines: string[] = [];

    lines.push(`# Test Suite: ${result.suiteName}\n`);
    lines.push(`**Status:** ${result.status === 'Completed' ? '✅ Completed' : `❌ ${result.status}`}`);
    lines.push(`**Tests:** ${formatTestTally(result)}`);
    lines.push(`**Average Score:** ${(result.averageScore * 100).toFixed(1)}%`);
    lines.push(`**Duration:** ${formatDuration(result.durationMs)}`);
    lines.push(`**Cost:** ${formatCost(result.totalCost)}\n`);

    if (result.testResults.length > 0) {
        lines.push('## Test Results\n');
        lines.push('| Test | Status | Score | Checks |');
        lines.push('|------|--------|-------|--------|');

        for (const test of result.testResults) {
            const status = statusGlyph(test.status, '⊘', '✅', '❌');
            const score = `${(test.score * 100).toFixed(1)}%`;
            const checks = `${test.passedChecks}/${test.totalChecks}`;
            lines.push(`| ${test.testName} | ${status} | ${score} | ${checks} |`);
        }
    }

    return lines.join('\n');
}

/**
 * Format test run result as CSV.
 *
 * @param results - Array of test run results
 * @param includeHeaders - Whether to include CSV headers (default: true)
 * @returns CSV output
 */
export function formatTestRunResultsAsCSV(
    results: TestRunResult[],
    includeHeaders: boolean = true
): string {
    const lines: string[] = [];

    if (includeHeaders) {
        lines.push('TestName,Status,Score,PassedChecks,TotalChecks,DurationMs,TotalCost');
    }

    for (const result of results) {
        lines.push([
            escapeCSV(result.testName),
            result.status,
            result.score.toFixed(4),
            result.passedChecks,
            result.totalChecks,
            result.durationMs,
            result.totalCost.toFixed(6)
        ].join(','));
    }

    return lines.join('\n');
}

/**
 * Format duration in milliseconds as human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }

    if (ms < 60000) {
        return `${(ms / 1000).toFixed(2)}s`;
    }

    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
}

/**
 * Escape CSV field value.
 *
 * @param value - Field value
 * @returns Escaped value
 */
function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Generate summary statistics from multiple test results.
 *
 * @param results - Array of test run results
 * @returns Summary statistics
 */
export function generateSummaryStatistics(results: TestRunResult[]): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    passRate: number;
    averageScore: number;
    totalDuration: number;
    totalCost: number;
    avgDuration: number;
    avgCost: number;
} {
    // Delegated, NOT reimplemented. This function previously carried its own copy of the
    // pass/fail/skip bucketing and the skip-excluded average — a second definition of "failed"
    // living one module away from the engine's. That is exactly the divergence this release
    // fixes between RunSuite and updateSuiteRun; duplicating it here would reintroduce it the
    // next time a status is added to the union or a bucket is split.
    const { totalTests, passedTests, failedTests, skippedTests, executedTests, averageScore } =
        summarizeSuiteResults(results);
    const passRate = executedTests > 0 ? passedTests / executedTests : 0;

    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    const totalCost = results.reduce((sum, r) => sum + r.totalCost, 0);

    const avgDuration = totalTests > 0 ? totalDuration / totalTests : 0;
    const avgCost = totalTests > 0 ? totalCost / totalTests : 0;

    return {
        totalTests,
        passedTests,
        failedTests,
        skippedTests,
        passRate,
        averageScore,
        totalDuration,
        totalCost,
        avgDuration,
        avgCost
    };
}
