import { describe, it, expect } from 'vitest';
import { summarizeSuiteResults } from '../engine/suite-tally';
import type { TestRunResult } from '../types';

/**
 * The suite tally is what CI gates on: `mj test suite` exits non-zero iff `failedTests > 0`.
 * Every status that is neither a pass nor a deliberate skip MUST land in `failedTests`, or a
 * run that never produced a verdict reports green — the exact false-green class the Skipped
 * status was introduced to eliminate.
 */
function result(status: TestRunResult['status'], score = 0): TestRunResult {
    return { status, score, totalCost: 0 } as Partial<TestRunResult> as TestRunResult;
}

describe('summarizeSuiteResults', () => {
    it('counts Error as a failure — a bundle that threw produced no verdict', () => {
        const tally = summarizeSuiteResults([result('Passed', 1), result('Error')]);
        expect(tally.failedTests).toBe(1);
    });

    it('counts Timeout as a failure — a hung check produced no verdict either', () => {
        const tally = summarizeSuiteResults([result('Passed', 1), result('Timeout')]);
        expect(tally.failedTests).toBe(1);
    });

    it('counts Failed as a failure', () => {
        expect(summarizeSuiteResults([result('Failed')]).failedTests).toBe(1);
    });

    it('does NOT count Skipped as a failure — a declared non-applicable bundle is not a defect', () => {
        const tally = summarizeSuiteResults([result('Passed', 1), result('Skipped')]);
        expect(tally.failedTests).toBe(0);
        expect(tally.skippedTests).toBe(1);
        expect(tally.passedTests).toBe(1);
    });

    it('excludes skips from averageScore rather than scoring them 0 or 1', () => {
        // One pass (score 1) + one skip. Averaging the skip in as 0 would report 0.5 and
        // understate the test that actually ran.
        expect(summarizeSuiteResults([result('Passed', 1), result('Skipped')]).averageScore).toBe(1);
    });

    it('reports averageScore 0 for an all-skipped suite without dividing by zero', () => {
        const tally = summarizeSuiteResults([result('Skipped'), result('Skipped')]);
        expect(tally.averageScore).toBe(0);
        expect(tally.failedTests).toBe(0);
        expect(tally.executedTests).toBe(0);
    });

    it('reports an empty suite as all-zero rather than NaN', () => {
        const tally = summarizeSuiteResults([]);
        expect(tally.averageScore).toBe(0);
        expect(tally.totalTests).toBe(0);
        expect(tally.failedTests).toBe(0);
    });

    // MJTestSuiteRun carries a dedicated ErrorTests column that the engine had never populated,
    // so a persisted run could not distinguish "asserted and was wrong" from "never produced a
    // verdict". Both still gate CI via failedTests; only the persisted breakdown differs.
    it('separates Error and Timeout into errorTests while still counting them as failures', () => {
        const tally = summarizeSuiteResults([result('Failed'), result('Error'), result('Timeout')]);
        expect(tally.errorTests).toBe(2);
        expect(tally.failedTests).toBe(3);
    });

    it('reports errorTests 0 when every failure was a genuine assertion failure', () => {
        expect(summarizeSuiteResults([result('Failed'), result('Failed')]).errorTests).toBe(0);
    });

    // The persisted MJTestSuiteRun columns are rendered as FIVE SIBLING TILES
    // (Passed | Failed | Errors | Skipped | Total). They must therefore partition the run: if
    // FailedTests includes errors AND ErrorTests reports them again, the tile row sums past Total
    // and one test appears twice.
    it('partitions every test into exactly one of passed / assertionFailures / errorTests / skipped', () => {
        const results = [
            result('Passed', 1), result('Passed', 1), result('Failed'),
            result('Error'), result('Timeout'), result('Skipped'),
        ];
        const t = summarizeSuiteResults(results);
        expect(t.passedTests + t.assertionFailures + t.errorTests + t.skippedTests).toBe(t.totalTests);
        expect(t.assertionFailures).toBe(1);
        expect(t.errorTests).toBe(2);
    });

    it('keeps the gate value failedTests as the SUM of the two failure buckets', () => {
        const t = summarizeSuiteResults([result('Failed'), result('Error'), result('Timeout')]);
        expect(t.failedTests).toBe(t.assertionFailures + t.errorTests);
        expect(t.failedTests).toBe(3);
    });

    it('tallies a realistic mixed CI run: some pass, some error, one platform skip', () => {
        const tally = summarizeSuiteResults([
            result('Passed', 1), result('Passed', 1), result('Error'), result('Timeout'), result('Skipped'),
        ]);
        expect(tally.totalTests).toBe(5);
        expect(tally.passedTests).toBe(2);
        expect(tally.failedTests).toBe(2);
        expect(tally.skippedTests).toBe(1);
        // The whole point: this run must NOT be able to exit 0.
        expect(tally.failedTests).toBeGreaterThan(0);
    });
});
