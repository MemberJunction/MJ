import { describe, it, expect } from 'vitest';
import { classifyFailure, isSevereBrowserFault, FailureSignals } from '../test-driver/classify-failure.js';
import type { BrowserDiagnosticEvent } from '@memberjunction/computer-use';

function sig(overrides: Partial<FailureSignals> = {}): FailureSignals {
    return {
        status: 'Failed',
        failureReason: undefined,
        hasCrash: false,
        hasAppError: false,
        settleBudgetExhausted: false,
        tailHashStable: false,
        beaconConfigured: false,
        beaconEverReady: false,
        oraclesFailed: false,
        ...overrides,
    };
}

describe('classifyFailure (CU-F5)', () => {
    it('returns null for a completed run', () => {
        expect(classifyFailure(sig({ status: 'Completed' }))).toBeNull();
    });

    it('classifies a crash / engine error as infra (highest precedence)', () => {
        expect(classifyFailure(sig({ hasCrash: true }))).toBe('infra');
        expect(classifyFailure(sig({ status: 'Error' }))).toBe('infra');
    });

    it('explicit engine terminal verdicts outrank incidental app-error noise (Jul-22 fix)', () => {
        // A flaky agent loop/timeout/cancel/impossible that ALSO logged a severe app
        // fault must classify by the ENGINE's verdict — not be masked as the zero-retry
        // `app-error`, which turned these into hard failures and cratered the pass rate.
        expect(classifyFailure(sig({ hasAppError: true, failureReason: 'LoopDetected' }))).toBe('loop-detected');
        expect(classifyFailure(sig({ hasAppError: true, status: 'TimeBudgetExceeded', tailHashStable: false }))).toBe('timeout-progressing');
        expect(classifyFailure(sig({ hasAppError: true, status: 'Cancelled' }))).toBe('cancelled');
        expect(classifyFailure(sig({ hasAppError: true, status: 'Impossible' }))).toBe('impossible');
    });

    it('app-error still outranks the softer symptom heuristics (stuck-page / judge / assertion)', () => {
        // With no more-specific engine verdict, a severe app fault is the better
        // explanation than "the page looked stuck" or "the judge disagreed".
        expect(classifyFailure(sig({ status: 'Failed', hasAppError: true, settleBudgetExhausted: true, tailHashStable: true }))).toBe('app-error');
        expect(classifyFailure(sig({ status: 'Failed', hasAppError: true, oraclesFailed: true }))).toBe('app-error');
    });

    it('infra still outranks app-error and auth-detour', () => {
        expect(classifyFailure(sig({ hasCrash: true, hasAppError: true }))).toBe('infra');
    });

    it('auth-detour outranks app-error', () => {
        // The detour is the root cause; its own failed auth requests are the symptom.
        expect(classifyFailure(sig({ failureReason: 'AuthDetour', hasAppError: true }))).toBe('auth-detour');
    });

    it('classifies an engine loop terminate as loop-detected', () => {
        expect(classifyFailure(sig({ status: 'Failed', failureReason: 'LoopDetected' }))).toBe('loop-detected');
    });

    it('classifies an auth-detour terminate as auth-detour, outranking its own 401 app-errors', () => {
        // The 401s that caused the detour also set hasAppError — auth-detour is the root cause and wins.
        expect(classifyFailure(sig({ status: 'Failed', failureReason: 'AuthDetour' }))).toBe('auth-detour');
        expect(classifyFailure(sig({ status: 'Failed', failureReason: 'AuthDetour', hasAppError: true }))).toBe('auth-detour');
    });

    it('infra still outranks auth-detour', () => {
        expect(classifyFailure(sig({ hasCrash: true, failureReason: 'AuthDetour' }))).toBe('infra');
    });

    it('classifies cancellation and impossibility', () => {
        expect(classifyFailure(sig({ status: 'Cancelled' }))).toBe('cancelled');
        expect(classifyFailure(sig({ status: 'Impossible' }))).toBe('impossible');
    });

    it('splits time-budget by hash trajectory', () => {
        expect(classifyFailure(sig({ status: 'TimeBudgetExceeded', tailHashStable: true }))).toBe('timeout-stuck');
        expect(classifyFailure(sig({ status: 'TimeBudgetExceeded', tailHashStable: false }))).toBe('timeout-progressing');
    });

    it('classifies a frozen unsettled page as stuck-page', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached', settleBudgetExhausted: true, tailHashStable: true }))).toBe('stuck-page');
    });

    it('classifies a never-ready beacon as env-stall', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached', beaconConfigured: true, beaconEverReady: false }))).toBe('env-stall');
    });

    it('does not call env-stall when the beacon did fire', () => {
        // Beacon fired → not env-stall; falls through to assertion when oracles failed.
        expect(classifyFailure(sig({ status: 'MaxStepsReached', beaconConfigured: true, beaconEverReady: true, oraclesFailed: true }))).toBe('assertion');
    });

    it('classifies an engine Failed terminate as judge-disagreement', () => {
        expect(classifyFailure(sig({ status: 'Failed' }))).toBe('judge-disagreement');
    });

    it('classifies a clean run with failed oracles as assertion', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached', oraclesFailed: true }))).toBe('assertion');
    });

    it('falls back to unknown when no signal matches', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached' }))).toBe('unknown');
    });
});

describe('isSevereBrowserFault (hasAppError tightening — Jul-22 fix)', () => {
    const diag = (o: Partial<BrowserDiagnosticEvent>): BrowserDiagnosticEvent =>
        ({ timestamp: '', type: 'console', message: '', ...o });

    it('counts an uncaught page exception', () => {
        expect(isSevereBrowserFault(diag({ type: 'pageerror', message: 'TypeError: x is undefined' }))).toBe(true);
    });

    it('counts a genuine (non-aborted) request failure', () => {
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_CONNECTION_REFUSED' }))).toBe(true);
    });

    it('ignores navigation-aborted / cancelled requests (routine SPA churn)', () => {
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_ABORTED' }))).toBe(false);
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — NS_BINDING_ABORTED' }))).toBe(false);
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_CANCELED' }))).toBe(false);
    });

    it('ignores console errors (too noisy to imply a deterministic fault)', () => {
        expect(isSevereBrowserFault(diag({ type: 'console', level: 'error', message: 'a component logged an error' }))).toBe(false);
    });

    it('ignores non-fault diagnostics (warnings, crash — crash is handled as infra upstream)', () => {
        expect(isSevereBrowserFault(diag({ type: 'console', level: 'warning', message: 'heads up' }))).toBe(false);
        expect(isSevereBrowserFault(diag({ type: 'crash', message: 'Page crashed' }))).toBe(false);
    });
});
