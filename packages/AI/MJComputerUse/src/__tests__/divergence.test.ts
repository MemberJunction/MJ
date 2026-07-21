import { describe, it, expect } from 'vitest';
import { computeDivergence } from '../test-driver/divergence.js';

describe('computeDivergence (CU-D7)', () => {
    it('all three agreeing (done) is unanimous', () => {
        const r = computeDivergence({ selfReportDone: true, judgeDone: true, oraclesPassed: true });
        expect(r.selfVsJudgeAgree).toBe(true);
        expect(r.judgeVsOracleAgree).toBe(true);
        expect(r.selfVsOracleAgree).toBe(true);
        expect(r.unanimous).toBe(true);
    });

    it('all three agreeing (not done) is unanimous', () => {
        const r = computeDivergence({ selfReportDone: false, judgeDone: false, oraclesPassed: false });
        expect(r.unanimous).toBe(true);
    });

    it('detects self-report inflation vs judge/oracle (the field failure mode)', () => {
        const r = computeDivergence({ selfReportDone: true, judgeDone: false, oraclesPassed: false });
        expect(r.selfVsJudgeAgree).toBe(false);
        expect(r.selfVsOracleAgree).toBe(false);
        expect(r.judgeVsOracleAgree).toBe(true); // judge and oracle still agree with each other
        expect(r.unanimous).toBe(false);
    });

    it('detects judge-vs-oracle disagreement (the judge-error signal)', () => {
        const r = computeDivergence({ selfReportDone: true, judgeDone: true, oraclesPassed: false });
        expect(r.selfVsJudgeAgree).toBe(true);
        expect(r.judgeVsOracleAgree).toBe(false);
        expect(r.unanimous).toBe(false);
    });
});
