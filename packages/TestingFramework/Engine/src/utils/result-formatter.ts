/**
 * @fileoverview Result formatting utilities for test output
 * @module @memberjunction/testing-engine
 */

import { TestRunResult, TestSuiteRunResult, OracleResult } from '../types';
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
    lines.push(`Tests: ${result.passedTests}/${result.totalTests} passed`);
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
export function formatTestSummary(result: TestRunResult, indent: string = ''): string {
    const status = result.status === 'Passed' ? '✓' : '✗';
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
    lines.push(`**Status:** ${result.status === 'Passed' ? '✅ Passed' : '❌ Failed'}`);
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
    lines.push(`**Tests:** ${result.passedTests}/${result.totalTests} passed`);
    lines.push(`**Average Score:** ${(result.averageScore * 100).toFixed(1)}%`);
    lines.push(`**Duration:** ${formatDuration(result.durationMs)}`);
    lines.push(`**Cost:** ${formatCost(result.totalCost)}\n`);

    if (result.testResults.length > 0) {
        lines.push('## Test Results\n');
        lines.push('| Test | Status | Score | Checks |');
        lines.push('|------|--------|-------|--------|');

        for (const test of result.testResults) {
            const status = test.status === 'Passed' ? '✅' : '❌';
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
    passRate: number;
    averageScore: number;
    totalDuration: number;
    totalCost: number;
    avgDuration: number;
    avgCost: number;
} {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.status === 'Passed').length;
    const failedTests = totalTests - passedTests;
    const passRate = totalTests > 0 ? passedTests / totalTests : 0;

    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const averageScore = totalTests > 0 ? totalScore / totalTests : 0;

    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    const totalCost = results.reduce((sum, r) => sum + r.totalCost, 0);

    const avgDuration = totalTests > 0 ? totalDuration / totalTests : 0;
    const avgCost = totalTests > 0 ? totalCost / totalTests : 0;

    return {
        totalTests,
        passedTests,
        failedTests,
        passRate,
        averageScore,
        totalDuration,
        totalCost,
        avgDuration,
        avgCost
    };
}
