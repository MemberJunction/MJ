import { describe, it, expect } from 'vitest';
import { ReadRealtimeTurnDetection, DescribeUnappliedTurnDetection } from '../generic/realtimeTurnDetection';

describe('ReadRealtimeTurnDetection', () => {
    it('keeps every recognized, correctly typed setting', () => {
        expect(
            ReadRealtimeTurnDetection({ Mode: 'serverVad', Eagerness: 'low', Threshold: 0.5, SilenceDurationMs: 800, Coverage: 'audioActivityOnly' }),
        ).toEqual({ Mode: 'serverVad', Eagerness: 'low', Threshold: 0.5, SilenceDurationMs: 800, Coverage: 'audioActivityOnly' });
    });

    it('drops unrecognized values and wrong types', () => {
        expect(ReadRealtimeTurnDetection({ Mode: 'fast', Eagerness: 'medium', Threshold: '0.5', SilenceDurationMs: Number.NaN, Coverage: 'all' })).toBeUndefined();
        expect(ReadRealtimeTurnDetection({ Eagerness: 'high', Extra: 1 })).toEqual({ Eagerness: 'high' });
    });

    it('returns undefined for a value that is not a plain object', () => {
        expect(ReadRealtimeTurnDetection(undefined)).toBeUndefined();
        expect(ReadRealtimeTurnDetection(null)).toBeUndefined();
        expect(ReadRealtimeTurnDetection(['Eagerness'])).toBeUndefined();
        expect(ReadRealtimeTurnDetection('low')).toBeUndefined();
    });
});

describe('DescribeUnappliedTurnDetection', () => {
    it('names each unapplied setting that was requested, with its value and the reason', () => {
        const line = DescribeUnappliedTurnDetection('TestRealtime', { Threshold: 0.4, Eagerness: 'low' }, ['Threshold', 'SilenceDurationMs'], 'no wire field');
        expect(line).toBe('[TestRealtime] Turn-detection setting(s) not applied: Threshold=0.4 — no wire field');
    });

    it('returns undefined when nothing requested was left out', () => {
        expect(DescribeUnappliedTurnDetection('TestRealtime', { Eagerness: 'low' }, ['Threshold'], 'x')).toBeUndefined();
    });

    it("does not report Mode 'default', which is no request at all", () => {
        expect(DescribeUnappliedTurnDetection('TestRealtime', { Mode: 'default' }, ['Mode'], 'x')).toBeUndefined();
    });
});
