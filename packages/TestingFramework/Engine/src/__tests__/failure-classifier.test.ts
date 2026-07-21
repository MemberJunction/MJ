import { describe, it, expect } from 'vitest';
import { TestRunResult, OracleResult } from '@memberjunction/testing-engine-base';
import { classifyFailure, normalizeFailureClass } from '../engine/failure-classifier';

function result(status: TestRunResult['status'], errorMessage?: string, oracleResults: OracleResult[] = []): TestRunResult {
    return {
        testRunId: 'tr', testId: 't', testName: 'T', status,
        score: status === 'Passed' ? 1 : 0,
        passedChecks: 0, failedChecks: 0, totalChecks: 0, oracleResults,
        targetType: 'Computer Use', targetLogId: 'l',
        durationMs: 1, totalCost: 0, startedAt: new Date(0), completedAt: new Date(0),
        errorMessage,
    };
}

describe('normalizeFailureClass', () => {
    it('returns undefined for empty input', () => {
        expect(normalizeFailureClass(undefined)).toBeUndefined();
        expect(normalizeFailureClass('')).toBeUndefined();
        expect(normalizeFailureClass('   ')).toBeUndefined();
    });

    it('passes canonical values through', () => {
        expect(normalizeFailureClass('timeout')).toBe('timeout');
        expect(normalizeFailureClass('app-error')).toBe('app-error');
        expect(normalizeFailureClass('nav-loop')).toBe('nav-loop');
    });

    it('maps CU-taxonomy synonyms to canonical categories', () => {
        expect(normalizeFailureClass('stuck-page')).toBe('blank-page');
        expect(normalizeFailureClass('env-stall')).toBe('infra');
        expect(normalizeFailureClass('navLoop')).toBe('nav-loop');
        expect(normalizeFailureClass('server_error')).toBe('app-error');
        expect(normalizeFailureClass('infeasible')).toBe('impossible');
    });

    it('is case- and punctuation-insensitive', () => {
        expect(normalizeFailureClass('Blank Page')).toBe('blank-page');
        expect(normalizeFailureClass('AUTH')).toBe('auth-detour');
    });

    it('returns unknown for an unrecognized class', () => {
        expect(normalizeFailureClass('kablooey')).toBe('unknown');
    });
});

describe('classifyFailure', () => {
    it('returns undefined for passing/skipped results', () => {
        expect(classifyFailure(result('Passed'))).toBeUndefined();
        expect(classifyFailure(result('Skipped'))).toBeUndefined();
    });

    it('prefers the driver failureClass over the message regex', () => {
        // errorMessage screams "timeout" but the driver classified app-error → driver wins.
        expect(classifyFailure(result('Failed', 'operation timed out'), 'app-error')).toBe('app-error');
    });

    it('falls back to the message regex when the driver did not classify', () => {
        expect(classifyFailure(result('Timeout', 'Request timed out after 300s'))).toBe('timeout');
        expect(classifyFailure(result('Failed', 'Returned HTTP 500 internal server error'))).toBe('app-error');
        expect(classifyFailure(result('Failed', 'Redirected to the login page unexpectedly'))).toBe('auth-detour');
        expect(classifyFailure(result('Failed', 'The agent kept clicking the same button in a navigation loop'))).toBe('nav-loop');
        expect(classifyFailure(result('Failed', 'ECONNREFUSED connecting to database'))).toBe('infra');
    });

    it('classifies from failing-oracle text when errorMessage is empty', () => {
        const oracle: OracleResult = {
            oracleType: 'goal-completion', passed: false, score: 0,
            message: 'Goal not met', details: { reason: 'The task is impossible to complete on this screen' },
        };
        expect(classifyFailure(result('Failed', undefined, [oracle]))).toBe('impossible');
    });

    it('ignores PASSING oracles when classifying', () => {
        const passing: OracleResult = { oracleType: 'goal-completion', passed: true, score: 1, message: 'timed out earlier but recovered' };
        // Only passing-oracle text mentions timeout; nothing else → unknown, not timeout.
        expect(classifyFailure(result('Failed', undefined, [passing]))).toBe('unknown');
    });

    it('returns unknown when nothing matches', () => {
        expect(classifyFailure(result('Failed', 'something inexplicable happened'))).toBe('unknown');
        expect(classifyFailure(result('Failed'))).toBe('unknown');
    });

    it('honors an unrecognized driver class only as a last resort', () => {
        // Driver said "weird", no message → falls through to the driver's unknown.
        expect(classifyFailure(result('Failed'), 'weird')).toBe('unknown');
    });
});
