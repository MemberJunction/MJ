import { describe, expect, it, beforeAll } from 'vitest';
import { IntegrationCheckRegistry, INTEGRATION_TARGET_TYPE } from '@memberjunction/testing-integration';
import type { OracleResult, TestRunResult, TestSuiteRunResult } from '@memberjunction/testing-engine';
import { EvaluateSuiteSkipGate } from './suite-skip-gate.js';

const TEST_ID = '8A1C6E3B-0D7A-4B7F-9E21-3C5D7F9A1B2C';

function testResult(oracleResults: OracleResult[]): TestRunResult {
    return {
        testRunId: 'run-1', testId: TEST_ID.toLowerCase(), testName: 'IT99 - CLI unit', status: 'Passed', score: 1,
        passedChecks: 1, failedChecks: 0, totalChecks: 1, oracleResults, targetType: INTEGRATION_TARGET_TYPE,
        targetLogId: 'run-1', durationMs: 1
    } as TestRunResult;
}

function suite(results: TestRunResult[]): TestSuiteRunResult {
    return {
        suiteRunId: 's', suiteId: 's', suiteName: 'unit', status: 'Completed', passedTests: results.length,
        failedTests: 0, totalTests: results.length, averageScore: 1, testResults: results, durationMs: 1
    } as TestSuiteRunResult;
}

const tests = [{ ID: TEST_ID, Configuration: JSON.stringify({ checks: [{ type: 'cligate' }] }) }];

describe('EvaluateSuiteSkipGate', () => {
    beforeAll(() => {
        IntegrationCheckRegistry.Instance.Register({ Id: 'cligate.A', Name: 'A', Fn: async () => { /* pass */ } });
        IntegrationCheckRegistry.Instance.Register({ Id: 'cligate.B', Name: 'B', Fn: async () => { /* pass */ } });
    });

    it('passes when every registered check of the selected bundles reported', () => {
        const ran: OracleResult[] = ['cligate.A', 'cligate.B'].map(id => ({ oracleType: id, passed: true, score: 1, message: id }));
        expect(EvaluateSuiteSkipGate(suite([testResult(ran)]), tests).Passed).toBe(true);
    });

    it('fails when a registered check never reported, matching the test by UUID regardless of case', () => {
        const report = EvaluateSuiteSkipGate(suite([testResult([{ oracleType: 'cligate.A', passed: true, score: 1, message: 'A' }])]), tests);
        expect(report.Passed).toBe(false);
        expect(report.Missing.map(m => m.CheckId)).toEqual(['cligate.B']);
    });

    it('fails on a skip that is not allowed', () => {
        const report = EvaluateSuiteSkipGate(suite([testResult([
            { oracleType: 'cligate.A', passed: true, score: 1, message: 'A' },
            { oracleType: 'cligate.B', passed: true, score: 0, message: 'SKIPPED: fixture missing', details: { DurationMs: 0, Skipped: true, SkipAllowed: false } }
        ])]), tests);
        expect(report.Passed).toBe(false);
        expect(report.Unexpected.map(e => e.CheckId)).toEqual(['cligate.B']);
    });
});
