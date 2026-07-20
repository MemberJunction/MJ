import { describe, it, expect } from 'vitest';
import { classifyFailure, FailureSignals } from '../test-driver/classify-failure.js';

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

    it('app-error outranks loop / stuck symptoms (risk-note precedence)', () => {
        // An app error that also tripped the loop detector reports as the cause.
        expect(classifyFailure(sig({ hasAppError: true, failureReason: 'LoopDetected' }))).toBe('app-error');
        expect(classifyFailure(sig({ hasAppError: true, settleBudgetExhausted: true, tailHashStable: true }))).toBe('app-error');
    });

    it('infra still outranks app-error', () => {
        expect(classifyFailure(sig({ hasCrash: true, hasAppError: true }))).toBe('infra');
    });

    it('classifies an engine loop terminate as loop-detected', () => {
        expect(classifyFailure(sig({ status: 'Failed', failureReason: 'LoopDetected' }))).toBe('loop-detected');
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
