import { describe, it, expect } from 'vitest';
import { ApplyPlattCalibration, PLATT_LOGIT_CLAMP } from '../generic/decision.types';

describe('ApplyPlattCalibration', () => {
    it('is the identity for A = 1, B = 0', () => {
        for (const p of [0.05, 0.3, 0.5, 0.8, 0.99]) {
            expect(ApplyPlattCalibration(p, { A: 1, B: 0 })).toBeCloseTo(p, 10);
        }
    });

    it('computes sigmoid(A · logit(p) + B)', () => {
        // logit(0.5) = 0, so the result is sigmoid(B)
        expect(ApplyPlattCalibration(0.5, { A: 1.5035, B: -2.1629 })).toBeCloseTo(1 / (1 + Math.exp(2.1629)), 10);
        // logit(0.8) = ln 4
        expect(ApplyPlattCalibration(0.8, { A: 2, B: 0 })).toBeCloseTo(16 / 17, 10);
    });

    it('is monotone in p for A > 0', () => {
        const calibration = { A: 1.65, B: -2.9 };
        const values = [0.01, 0.2, 0.4, 0.6, 0.8, 0.99].map(p => ApplyPlattCalibration(p, calibration));
        for (let i = 1; i < values.length; i++) {
            expect(values[i]).toBeGreaterThan(values[i - 1]);
        }
    });

    it('clamps 0 and 1 so the logit stays finite', () => {
        const atZero = ApplyPlattCalibration(0, { A: 1, B: 0 });
        const atOne = ApplyPlattCalibration(1, { A: 1, B: 0 });
        expect(atZero).toBeCloseTo(PLATT_LOGIT_CLAMP, 12);
        expect(atOne).toBeCloseTo(1 - PLATT_LOGIT_CLAMP, 12);
        expect(Number.isFinite(atZero) && Number.isFinite(atOne)).toBe(true);
    });
});
