/**
 * suite-sharding-skip-gate.test.ts — verifies that EvaluateSuiteSkipGate evaluates only the
 * tests executed by the current shard (`result.testResults`) and does not report other shards'
 * tests as missing, while still catching unexpected skips or missing checks inside the shard.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationCheckRegistry, INTEGRATION_TARGET_TYPE } from '@memberjunction/testing-integration';
import type { TestSuiteRunResult, TestRunResult } from '@memberjunction/testing-engine';
import { EvaluateSuiteSkipGate, type SkipGateTest } from '../commands/suite-skip-gate';

const BUNDLE_SHARD_A = 'unit-test-shard-bundle-a';
const BUNDLE_SHARD_B = 'unit-test-shard-bundle-b';

describe('EvaluateSuiteSkipGate on sharded suite runs', () => {
    beforeEach(() => {
        if (IntegrationCheckRegistry.Instance.GetBundle(BUNDLE_SHARD_A).length === 0) {
            IntegrationCheckRegistry.Instance.Register({
                Id: `${BUNDLE_SHARD_A}.A1`,
                Name: 'A1',
                Fn: async () => undefined,
            });
            IntegrationCheckRegistry.Instance.Register({
                Id: `${BUNDLE_SHARD_A}.A2`,
                Name: 'A2',
                Fn: async () => undefined,
            });
        }
        if (IntegrationCheckRegistry.Instance.GetBundle(BUNDLE_SHARD_B).length === 0) {
            IntegrationCheckRegistry.Instance.Register({
                Id: `${BUNDLE_SHARD_B}.B1`,
                Name: 'B1',
                Fn: async () => undefined,
            });
        }
    });

    const allSuiteTests: SkipGateTest[] = [
        {
            ID: '11111111-1111-1111-1111-111111111111',
            Configuration: JSON.stringify({ transport: 'server', checks: [{ type: BUNDLE_SHARD_A }] }),
        },
        {
            ID: '22222222-2222-2222-2222-222222222222',
            Configuration: JSON.stringify({ transport: 'server', checks: [{ type: BUNDLE_SHARD_B }] }),
        },
    ];

    function makeSuiteResult(testResults: TestRunResult[]): TestSuiteRunResult {
        return {
            suiteRunId: 'sr-1',
            suiteId: 'suite-1',
            suiteName: 'Integration Tests — Deterministic',
            status: 'Completed',
            passedTests: testResults.length,
            failedTests: 0,
            skippedTests: 0,
            totalTests: testResults.length,
            averageScore: 1,
            testResults,
            durationMs: 100,
            totalCost: 0,
            startedAt: new Date(),
            completedAt: new Date(),
        };
    }

    it('passes when Shard 1/2 executes only Test 1 and all of Test 1 checks ran (Test 2 in Shard 2/2 is not flagged missing)', () => {
        const shard1Result = makeSuiteResult([
            {
                testRunId: 'tr-1',
                testId: '11111111-1111-1111-1111-111111111111',
                testName: 'IT-A',
                status: 'Passed',
                score: 1,
                passedChecks: 2,
                failedChecks: 0,
                totalChecks: 2,
                targetType: INTEGRATION_TARGET_TYPE,
                targetLogId: 'tr-1',
                durationMs: 50,
                totalCost: 0,
                startedAt: new Date(),
                completedAt: new Date(),
                oracleResults: [
                    { oracleType: `${BUNDLE_SHARD_A}.A1`, passed: true, score: 1, message: 'A1' },
                    { oracleType: `${BUNDLE_SHARD_A}.A2`, passed: true, score: 1, message: 'A2' },
                ],
            },
        ]);

        const report = EvaluateSuiteSkipGate(shard1Result, allSuiteTests);
        expect(report.Passed).toBe(true);
        expect(report.Missing).toEqual([]);
        expect(report.Unexpected).toEqual([]);
    });

    it('fails when an executed test in the shard is missing one of its registered checks', () => {
        const shard1IncompleteResult = makeSuiteResult([
            {
                testRunId: 'tr-1',
                testId: '11111111-1111-1111-1111-111111111111',
                testName: 'IT-A',
                status: 'Passed',
                score: 1,
                passedChecks: 1,
                failedChecks: 0,
                totalChecks: 1,
                targetType: INTEGRATION_TARGET_TYPE,
                targetLogId: 'tr-1',
                durationMs: 50,
                totalCost: 0,
                startedAt: new Date(),
                completedAt: new Date(),
                oracleResults: [
                    { oracleType: `${BUNDLE_SHARD_A}.A1`, passed: true, score: 1, message: 'A1' },
                ],
            },
        ]);

        const report = EvaluateSuiteSkipGate(shard1IncompleteResult, allSuiteTests);
        expect(report.Passed).toBe(false);
        expect(report.Missing).toEqual([{ TestName: 'IT-A', CheckId: `${BUNDLE_SHARD_A}.A2` }]);
    });
});
