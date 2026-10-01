/**
 * @fileoverview The decision measurement statistics, each against values computed by hand on small arrays.
 */
import { describe, it, expect } from 'vitest';
import { ApplyPlattCalibration, PLATT_LOGIT_CLAMP } from '@memberjunction/ai';
import {
    ApplyPlatt,
    BrierScore,
    CalibrationBins,
    ClampedLogit,
    CreateSeededRandom,
    DECISION_EVAL_LOGIT_CLAMP,
    FitPlatt,
    OutOfFoldPlatt,
    Quantile,
    RocAuc,
    type LabelledProbability
} from '../decision-eval/metrics';

const point = (probability: number, positive: boolean): LabelledProbability => ({ Probability: probability, Positive: positive });

/** 0.9 positive ✓, 0.6 negative ✗, 0.4 positive ✗, 0.2 negative ✓ at 0.5. */
const MIXED = [point(0.9, true), point(0.6, false), point(0.4, true), point(0.2, false)];

/** A deliberately overconfident predictor: the true probability, sharpened three times on the logit scale. */
function overconfidentSet(count: number, seed: number): LabelledProbability[] {
    const random = CreateSeededRandom(seed);
    return Array.from({ length: count }, () => {
        const truth = 0.05 + 0.9 * random();
        const positive = random() < truth;
        return point(1 / (1 + Math.exp(-3 * Math.log(truth / (1 - truth)))), positive);
    });
}

/**
 * A decision model's coarse probabilities (a few levels, as a model states them) over `count` cases,
 * with labels drawn from a known Platt map (A 0.7, B 0.9).
 */
function coarseSet(count: number, seed: number): LabelledProbability[] {
    const levels = [0.05, 0.1, 0.2, 0.3, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95];
    const random = CreateSeededRandom(seed);
    return Array.from({ length: count }, () => {
        const p = levels[Math.floor(random() * levels.length)];
        const truth = 1 / (1 + Math.exp(-(0.7 * Math.log(p / (1 - p)) + 0.9)));
        return point(p, random() < truth);
    });
}

/** The gradient of Platt's loss at a fit, per case: zero at the maximum-likelihood fit. */
function plattGradientPerCase(points: readonly LabelledProbability[], a: number, b: number): [number, number] {
    const positives = points.filter(p => p.Positive).length;
    const high = (positives + 1) / (positives + 2);
    const low = 1 / (points.length - positives + 2);
    let gA = 0;
    let gB = 0;
    for (const p of points) {
        const x = ClampedLogit(p.Probability);
        const residual = 1 / (1 + Math.exp(-(a * x + b))) - (p.Positive ? high : low);
        gA += residual * x;
        gB += residual;
    }
    return [gA / points.length, gB / points.length];
}

describe('decision measurement statistics', () => {
    describe('basic statistics', () => {
        it('Quantile interpolates linearly between order statistics', () => {
            expect(Quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
            expect(Quantile([1, 2, 3, 4], 0.95)).toBeCloseTo(3.85, 10);
            expect(Quantile([7], 0.95)).toBe(7);
            expect(Quantile([], 0.5)).toBeNull();
        });
    });

    describe('RocAuc', () => {
        it('counts the pairs a positive outranks: 3 of 4', () => {
            expect(RocAuc(MIXED)).toBe(0.75);
        });

        it('counts a tie as half a pair', () => {
            // (0.5,0.5) tie = 0.5; (0.5,0.3), (0.8,0.5), (0.8,0.3) = 3 → 3.5 / 4.
            expect(RocAuc([point(0.5, true), point(0.5, false), point(0.8, true), point(0.3, false)])).toBe(0.875);
        });

        it('is 0.5 when every probability ties, and 1 when the classes separate', () => {
            expect(RocAuc([point(0.5, true), point(0.5, false), point(0.5, true)])).toBe(0.5);
            expect(RocAuc([point(0.2, false), point(0.3, false), point(0.7, true)])).toBe(1);
        });

        it('is undefined with one class', () => {
            expect(RocAuc([point(0.9, true), point(0.1, true)])).toBeNull();
        });
    });

    describe('BrierScore', () => {
        it('is the mean squared error against 1 and 0', () => {
            // 0.01 + 0.36 + 0.36 + 0.04 = 0.77, over 4.
            expect(BrierScore(MIXED)).toBeCloseTo(0.1925, 12);
            expect(BrierScore([])).toBeNull();
        });
    });

    describe('CalibrationBins (ECE)', () => {
        it('bins by tenths, with the last bin holding 1, and weights each gap by its bin', () => {
            const { ECE, Bins } = CalibrationBins([point(0.05, false), point(0.15, true), point(0.15, false), point(1, true)]);
            expect(Bins).toHaveLength(10);
            expect(Bins[0]).toEqual({ Lower: 0, Upper: 0.1, Count: 1, MeanPredicted: 0.05, ObservedRate: 0 });
            expect(Bins[1]).toMatchObject({ Count: 2, ObservedRate: 0.5 });
            expect(Bins[1].MeanPredicted).toBeCloseTo(0.15, 12);
            expect(Bins[9]).toMatchObject({ Count: 1, MeanPredicted: 1, ObservedRate: 1 });
            expect(Bins[5]).toMatchObject({ Count: 0, MeanPredicted: null, ObservedRate: null });
            // (1/4)(0.05) + (2/4)(0.35) + (1/4)(0) = 0.1875.
            expect(ECE).toBeCloseTo(0.1875, 12);
        });

        it('puts a bin edge in the upper bin', () => {
            const { Bins } = CalibrationBins([point(0.1, true), point(0.3, true), point(0.7, false)]);
            expect([Bins[1].Count, Bins[3].Count, Bins[7].Count]).toEqual([1, 1, 1]);
        });

        it('matches the hand value on the mixed set', () => {
            // |0.9−1| + |0.6−0| + |0.4−1| + |0.2−0| = 1.5, over 4.
            expect(CalibrationBins(MIXED).ECE).toBeCloseTo(0.375, 12);
            expect(CalibrationBins([]).ECE).toBeNull();
        });
    });

    describe('CreateSeededRandom', () => {
        it('repeats its sequence for a seed', () => {
            const a = CreateSeededRandom(9);
            const b = CreateSeededRandom(9);
            const draws = Array.from({ length: 5 }, () => a());
            expect(draws).toEqual(Array.from({ length: 5 }, () => b()));
            expect(draws.every(d => d >= 0 && d < 1)).toBe(true);
        });
    });

    describe('Platt scaling', () => {
        it('fits and applies on production\'s scale: its clamp, and its transform', () => {
            expect(DECISION_EVAL_LOGIT_CLAMP).toBe(PLATT_LOGIT_CLAMP);
            const fit = FitPlatt(overconfidentSet(60, 13));
            for (const p of [0, 1e-9, 0.02, 0.3, 0.5, 0.77, 0.999, 1]) {
                expect(ApplyPlatt(p, fit)).toBe(ApplyPlattCalibration(p, fit));
            }
        });

        it('the clamped logit stays finite at 0 and 1', () => {
            expect(ClampedLogit(0)).toBeCloseTo(Math.log(1e-6 / (1 - 1e-6)), 10);
            expect(ClampedLogit(1)).toBeCloseTo(-ClampedLogit(0), 10);
        });

        it('fits a separable-ish set to a finite, increasing map', () => {
            const probabilities = [0.05, 0.1, 0.2, 0.3, 0.35, 0.6, 0.7, 0.8, 0.9, 0.95];
            const labels = [false, false, false, false, true, false, true, true, true, true];
            const fit = FitPlatt(probabilities.map((p, i) => point(p, labels[i])));
            expect(fit.Converged).toBe(true);
            expect(fit.A).toBeGreaterThan(0);
            const calibrated = [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99].map(p => ApplyPlatt(p, fit));
            for (let i = 1; i < calibrated.length; i++) {
                expect(calibrated[i]).toBeGreaterThan(calibrated[i - 1]);
            }
        });

        it('converges on a large set of coarse probabilities, where float rounding stalls the gradient', () => {
            // On this set the gradient stalls around 1e-6, above the 1e-9 tolerance, because the line
            // search can no longer see the loss fall; before the fix it ran to the 100-iteration cap.
            const set = coarseSet(300, 3);
            const fit = FitPlatt(set);
            expect(fit.Converged).toBe(true);
            expect(fit.Iterations).toBeLessThan(20);
            // And it is the maximum-likelihood fit: the gradient there is zero to float precision.
            const [gA, gB] = plattGradientPerCase(set, fit.A, fit.B);
            expect(Math.abs(gA)).toBeLessThan(1e-8);
            expect(Math.abs(gB)).toBeLessThan(1e-8);
        });

        it('stays finite on a perfectly separable set', () => {
            const fit = FitPlatt([point(0.1, false), point(0.2, false), point(0.8, true), point(0.9, true)]);
            expect(Number.isFinite(fit.A) && Number.isFinite(fit.B)).toBe(true);
            expect(fit.Converged).toBe(true);
        });

        it('recovers the scale of a deliberately overconfident input, and out of fold lowers its ECE', () => {
            const set = overconfidentSet(200, 7);
            const fit = FitPlatt(set);
            // The input is the truth sharpened three times on the logit scale, so A should be near 1/3.
            expect(fit.A).toBeGreaterThan(0.2);
            expect(fit.A).toBeLessThan(0.5);
            const calibrated = OutOfFoldPlatt(set, 5, 11);
            expect(calibrated).not.toBeNull();
            const rawECE = CalibrationBins(set).ECE ?? 1;
            const calibratedECE = CalibrationBins(set.map((p, i) => ({ ...p, Probability: calibrated?.[i] ?? 0 }))).ECE ?? 1;
            expect(calibratedECE).toBeLessThan(rawECE);
        });

        it('out of fold is deterministic under a seed, and needs two cases', () => {
            const set = overconfidentSet(40, 5);
            expect(OutOfFoldPlatt(set, 5, 3)).toEqual(OutOfFoldPlatt(set, 5, 3));
            expect(OutOfFoldPlatt([point(0.4, true)], 5, 3)).toBeNull();
            expect(OutOfFoldPlatt([point(0.4, true), point(0.6, false)], 5, 3)).toHaveLength(2);
        });
    });

    describe('out of fold is out of sample', () => {
        // With as many folds as cases, each case is its own fold: leave one out, checkable by hand.
        const set = overconfidentSet(14, 21);
        const leaveOneOut = (cases: readonly LabelledProbability[]) => OutOfFoldPlatt(cases, cases.length, 4);
        const fitWithout = (i: number) => FitPlatt(set.filter((_, j) => j !== i));

        it('the set is one where in-sample and out-of-fold calibration differ', () => {
            const inSample = FitPlatt(set);
            const gaps = set.map((p, i) => Math.abs(ApplyPlatt(p.Probability, inSample) - ApplyPlatt(p.Probability, fitWithout(i))));
            expect(set.some(p => p.Positive) && set.some(p => !p.Positive)).toBe(true);
            expect(Math.max(...gaps)).toBeGreaterThan(0.01);
        });

        it('calibrates each case with a fit on the other cases only', () => {
            const calibrated = leaveOneOut(set);
            set.forEach((p, i) => {
                expect(calibrated?.[i]).toBeCloseTo(ApplyPlatt(p.Probability, fitWithout(i)), 12);
            });
        });

        it('a case\'s calibrated value does not move when its own label flips', () => {
            const calibrated = leaveOneOut(set);
            set.forEach((p, i) => {
                const flipped = set.map((q, j) => (j === i ? { ...q, Positive: !q.Positive } : q));
                expect(leaveOneOut(flipped)?.[i]).toBeCloseTo(calibrated?.[i] ?? Number.NaN, 12);
            });
        });
    });
});
