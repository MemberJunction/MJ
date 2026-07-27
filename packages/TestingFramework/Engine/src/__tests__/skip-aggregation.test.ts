/**
 * skip-aggregation.test.ts — a skipped test is neither a pass nor a failure.
 *
 * `'Skipped'` was added to the driver result status so a gated tier or a platform-excluded
 * bundle stops reporting as `'Passed'`. Every aggregator that partitions results has to learn
 * the third case; the failure mode if one doesn't is silent and directional — folding skips
 * into `failedTests` reds a healthy run, folding them into `passedTests` pads it.
 */
import { describe, it, expect } from 'vitest';
import {
    generateSummaryStatistics,
    formatTestSummary,
    formatTestRunResultAsMarkdown,
} from '../utils/result-formatter';
import type { TestRunResult } from '@memberjunction/testing-engine-base';

function result(status: TestRunResult['status'], score: number): TestRunResult {
    return {
        status,
        score,
        durationMs: 1000,
        totalCost: 0,
    } as Partial<TestRunResult> as TestRunResult;
}

describe('generateSummaryStatistics — skip handling', () => {
    it('should count skips separately from passes and failures', () => {
        const stats = generateSummaryStatistics([
            result('Passed', 1),
            result('Failed', 0),
            result('Skipped', 0),
        ]);

        expect(stats.totalTests).toBe(3);
        expect(stats.passedTests).toBe(1);
        expect(stats.failedTests).toBe(1);
        expect(stats.skippedTests).toBe(1);
    });

    it('should not count a skip as a failure', () => {
        // The pre-change `failedTests = totalTests - passedTests` reported 1 failure here, which
        // is how a PostgreSQL run with one dialect-impossible bundle would have looked broken.
        const stats = generateSummaryStatistics([result('Passed', 1), result('Skipped', 0)]);

        expect(stats.failedTests).toBe(0);
        expect(stats.skippedTests).toBe(1);
    });

    it('should compute the pass rate over executed tests only', () => {
        const stats = generateSummaryStatistics([result('Passed', 1), result('Skipped', 0)]);

        // 1 of 1 executed = 100%, not 1 of 2 = 50%.
        expect(stats.passRate).toBe(1);
    });

    it('should exclude skips from the average score rather than averaging their zero in', () => {
        const stats = generateSummaryStatistics([
            result('Passed', 1),
            result('Passed', 0.5),
            result('Skipped', 0),
        ]);

        expect(stats.averageScore).toBeCloseTo(0.75);
    });

    it('should still count Error and Timeout as failures', () => {
        // Only 'Skipped' is exempt — widening the union must not accidentally excuse these.
        const stats = generateSummaryStatistics([result('Error', 0), result('Timeout', 0)]);

        expect(stats.failedTests).toBe(2);
        expect(stats.skippedTests).toBe(0);
    });

    it('should not divide by zero when every test was skipped', () => {
        const stats = generateSummaryStatistics([result('Skipped', 0), result('Skipped', 0)]);

        expect(stats.passRate).toBe(0);
        expect(stats.averageScore).toBe(0);
        expect(stats.skippedTests).toBe(2);
        expect(stats.failedTests).toBe(0);
    });

    it('should report zeros for an empty result set', () => {
        const stats = generateSummaryStatistics([]);

        expect(stats.totalTests).toBe(0);
        expect(stats.skippedTests).toBe(0);
        expect(stats.passRate).toBe(0);
    });
});

/**
 * These renderers are exported from the published @memberjunction/testing-engine package, so
 * they are what a non-CLI consumer sees. Painting a skip as ✗ / "❌ Failed" is a false RED —
 * it reports a bundle that correctly declined to run as a product defect.
 */
describe('result renderers — a skip is neither a pass nor a failure', () => {
    function runResult(status: TestRunResult['status']): TestRunResult {
        return {
            status, score: 0, testName: 'IT24 - Metadata Consistency', passedChecks: 0,
            totalChecks: 0, durationMs: 0, totalCost: 0, oracleResults: [], logs: [],
        } as Partial<TestRunResult> as TestRunResult;
    }

    it('marks a skipped test with its own glyph in the one-line summary, not the failure glyph', () => {
        const skipped = formatTestSummary(runResult('Skipped'));
        expect(skipped).not.toContain('✗');
        expect(skipped).toContain('⊘');
    });

    it('still marks a genuine failure with the failure glyph', () => {
        expect(formatTestSummary(runResult('Failed'))).toContain('✗');
    });

    it('does not label a skipped run "Failed" in the markdown report', () => {
        const md = formatTestRunResultAsMarkdown(runResult('Skipped'));
        expect(md).not.toContain('❌ Failed');
        expect(md).toContain('Skipped');
    });

    it('still labels an errored run as a failure in the markdown report', () => {
        expect(formatTestRunResultAsMarkdown(runResult('Error'))).toContain('❌');
    });
});
