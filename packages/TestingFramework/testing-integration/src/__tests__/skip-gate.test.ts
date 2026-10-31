import { describe, it, expect, beforeAll } from 'vitest';
import type { OracleResult, TestRunResult } from '@memberjunction/testing-engine';
import { EvaluateSkipGate, ExpectedCheckIds, FormatSkipGateReport, INTEGRATION_TARGET_TYPE } from '../skip-gate';
import { IntegrationCheckRegistry } from '../check-registry';

function ran(id: string, passed = true): OracleResult {
    return { oracleType: id, passed, score: passed ? 1 : 0, message: id, details: { DurationMs: 1 } };
}

function skipped(id: string, allowed: boolean): OracleResult {
    return {
        oracleType: id,
        passed: true,
        score: 0,
        message: `SKIPPED: ${id} precondition missing`,
        details: allowed
            ? { DurationMs: 0, Skipped: true, SkipAllowed: true, SkipGate: 'credentials', SkipAllowReason: 'needs a key' }
            : { DurationMs: 0, Skipped: true, SkipAllowed: false }
    };
}

function result(oracleResults: OracleResult[], overrides: Partial<TestRunResult> = {}): TestRunResult {
    return {
        testRunId: 'run-1',
        testId: 'test-1',
        testName: 'IT99 - Unit',
        status: 'Passed',
        score: 1,
        passedChecks: 0,
        failedChecks: 0,
        totalChecks: 0,
        oracleResults,
        targetType: INTEGRATION_TARGET_TYPE,
        targetLogId: 'run-1',
        durationMs: 1,
        ...overrides
    } as TestRunResult;
}

describe('EvaluateSkipGate', () => {
    it('passes a run with no skips', () => {
        const report = EvaluateSkipGate([result([ran('b.A'), ran('b.B')])]);
        expect(report.Passed).toBe(true);
        expect(FormatSkipGateReport(report)).toBe('');
    });

    it('fails on a skip that is not on the allowlist', () => {
        const report = EvaluateSkipGate([result([ran('b.A'), skipped('b.B', false)])]);
        expect(report.Passed).toBe(false);
        expect(report.Unexpected.map(e => e.CheckId)).toEqual(['b.B']);
        expect(FormatSkipGateReport(report)).toContain('Unexpected skips (1)');
    });

    it('passes an allowed skip and lists it with its reason', () => {
        const report = EvaluateSkipGate([result([ran('b.A'), skipped('b.B', true)])]);
        expect(report.Passed).toBe(true);
        expect(report.Allowed.map(e => e.CheckId)).toEqual(['b.B']);
        const output = FormatSkipGateReport(report);
        expect(output).toContain('Allowed skips (1)');
        expect(output).toContain('[credentials] needs a key');
    });

    it('fails a bundle whose every check skipped unless every skip is allowed', () => {
        const mixed = EvaluateSkipGate([result([skipped('b.A', true), skipped('b.B', false)])]);
        expect(mixed.Passed).toBe(false);
        expect(mixed.SkippedBundles).toEqual([{ TestName: 'IT99 - Unit', Bundle: 'b', Checks: 2, Allowed: false }]);

        const allAllowed = EvaluateSkipGate([result([skipped('b.A', true), skipped('b.B', true)])]);
        expect(allAllowed.Passed).toBe(true);
        expect(allAllowed.SkippedBundles[0].Allowed).toBe(true);
    });

    it('fails when a registered check of a selected bundle produced no result', () => {
        const report = EvaluateSkipGate([result([ran('b.A')])], new Map([['test-1', ['b.A', 'b.B']]]));
        expect(report.Passed).toBe(false);
        expect(report.Missing).toEqual([{ TestName: 'IT99 - Unit', CheckId: 'b.B' }]);
    });

    it('does not compare checks for a test the driver skipped or errored as a whole', () => {
        const gated = result([skipped('gate', true)], { status: 'Skipped' });
        const report = EvaluateSkipGate([gated], new Map([['test-1', ['b.A']]]));
        expect(report.Missing).toEqual([]);
        expect(report.Passed).toBe(true);
    });

    it('judges a whole-test skip by its allowance', () => {
        const unreachable = result([skipped('gate', false)], { status: 'Skipped' });
        expect(EvaluateSkipGate([unreachable]).Passed).toBe(false);
    });

    it('ignores results from other test types', () => {
        const other = result([skipped('x.A', false)], { targetType: 'Agent' });
        expect(EvaluateSkipGate([other]).Passed).toBe(true);
    });
});

describe('ExpectedCheckIds', () => {
    beforeAll(() => {
        IntegrationCheckRegistry.Instance.Register({ Id: 'unitexpect.A', Name: 'A', Fn: async () => { /* pass */ } });
        IntegrationCheckRegistry.Instance.Register({ Id: 'unitexpect.B', Name: 'B', Fn: async () => { /* pass */ } });
    });

    it('lists every registered check of every selected bundle', () => {
        expect(ExpectedCheckIds(JSON.stringify({ checks: [{ type: 'unitexpect' }] }))).toEqual(['unitexpect.A', 'unitexpect.B']);
    });

    it('returns nothing for a missing or malformed Configuration', () => {
        expect(ExpectedCheckIds(null)).toEqual([]);
        expect(ExpectedCheckIds('{not json')).toEqual([]);
    });
});
