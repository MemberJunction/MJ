/**
 * @fileoverview Statistics for measuring a typed decision's probabilities against labels: ROC AUC,
 * the Brier score, reliability bins and expected calibration error, and Platt scaling fitted on all
 * the cases or out of fold. Pure and deterministic: every random draw comes from a seeded generator.
 *
 * The duplicate-check measurement in `@memberjunction/integration-test-suite` uses them to fit and
 * check the calibrations `@memberjunction/ai-vector-dupe` ships.
 *
 * @module @memberjunction/testing-engine
 */

import { ApplyPlattCalibration, PLATT_LOGIT_CLAMP } from '@memberjunction/ai';

/** The seed for every random draw unless told otherwise. */
export const DECISION_EVAL_SEED = 20260929;

/** The calibration fold count unless told otherwise. */
export const DECISION_EVAL_CALIBRATION_FOLDS = 5;

/** The number of equal-width reliability bins. */
export const DECISION_EVAL_ECE_BINS = 10;

/**
 * How far a probability is clamped from 0 and 1 before its logit is taken: production's
 * `PLATT_LOGIT_CLAMP` (`@memberjunction/ai`), so parameters fitted here are applied there on the
 * same scale.
 */
export const DECISION_EVAL_LOGIT_CLAMP = PLATT_LOGIT_CLAMP;

/** How many Newton iterations a Platt fit may take. */
const PLATT_MAX_ITERATIONS = 100;

/** A Platt fit stops when its gradient is this small. */
const PLATT_GRADIENT_TOLERANCE = 1e-9;

/**
 * The smallest fall in a Platt fit's summed loss, relative to the loss, that its line search can
 * see through float rounding. A Newton step predicted to lower the loss by less is taken whole.
 * Without this, a fit on hundreds of points stalls a hair from its optimum, with the gradient around
 * 1e-6 and every step refused, and reports that it did not converge.
 */
const PLATT_LOSS_RESOLUTION = 1e-12;

/** Ridge added to the Platt Hessian, so a flat input cannot make it singular. */
const PLATT_HESSIAN_RIDGE = 1e-12;

/** One probability with its true class. */
export interface LabelledProbability {
    /** The positive-class probability. */
    Probability: number;
    /** True for the positive class. */
    Positive: boolean;
}

/** A 95% interval. */
export interface ConfidenceInterval {
    Lower: number;
    Upper: number;
}

/** One reliability bin: its probability range, how many cases fell in it, and how they came out. */
export interface ReliabilityBin {
    Lower: number;
    Upper: number;
    Count: number;
    /** Mean predicted probability in the bin, or null when it is empty. */
    MeanPredicted: number | null;
    /** Share of the bin's cases that are positive, or null when it is empty. */
    ObservedRate: number | null;
}

/** Expected calibration error and the reliability table behind it. */
export interface CalibrationSummary {
    /** Σ (bin count / n) × |mean predicted − observed rate|, or null with no cases. */
    ECE: number | null;
    Bins: ReliabilityBin[];
}

/** Platt parameters: calibrated p = 1 / (1 + exp(−(A · logit(p) + B))). */
export interface PlattParameters {
    A: number;
    B: number;
    Iterations: number;
    Converged: boolean;
}

/**
 * A seeded pseudo-random generator (mulberry32) returning numbers in [0, 1).
 *
 * @param seed Any 32-bit integer.
 */
export function CreateSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The mean, or null for no values. */
export function Mean(values: readonly number[]): number | null {
    return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * The q-quantile with linear interpolation between order statistics (R type 7, NumPy's default),
 * or null for no values.
 *
 * @param values The values, in any order.
 * @param q The quantile, in [0, 1].
 */
export function Quantile(values: readonly number[], q: number): number | null {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * ROC AUC: the probability that a random positive case scores above a random negative one, with
 * ties counting half (the Mann-Whitney U statistic over average ranks). Null unless both classes
 * are present.
 */
export function RocAuc(points: readonly LabelledProbability[]): number | null {
    const positives = points.filter(p => p.Positive).length;
    const negatives = points.length - positives;
    if (positives === 0 || negatives === 0) {
        return null;
    }
    const ranks = averageRanks(points.map(p => p.Probability));
    const positiveRankSum = points.reduce((sum, p, i) => sum + (p.Positive ? ranks[i] : 0), 0);
    return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** Mean squared difference between the probability and the class (1 or 0). Null with no cases. */
export function BrierScore(points: readonly LabelledProbability[]): number | null {
    return Mean(points.map(p => (p.Probability - (p.Positive ? 1 : 0)) ** 2));
}

/**
 * Expected calibration error over equal-width bins, and the reliability table. Bin i holds
 * probabilities in [i/b, (i+1)/b); the last bin also holds 1.
 *
 * @param points The cases.
 * @param binCount The number of bins.
 */
export function CalibrationBins(points: readonly LabelledProbability[], binCount: number = DECISION_EVAL_ECE_BINS): CalibrationSummary {
    const members: LabelledProbability[][] = Array.from({ length: binCount }, () => []);
    for (const point of points) {
        members[Math.min(Math.floor(point.Probability * binCount), binCount - 1)].push(point);
    }
    const bins = members.map((inBin, i) => reliabilityBin(inBin, i, binCount));
    if (points.length === 0) {
        return { ECE: null, Bins: bins };
    }
    const ece = bins.reduce((sum, bin) =>
        bin.MeanPredicted === null || bin.ObservedRate === null
            ? sum
            : sum + (bin.Count / points.length) * Math.abs(bin.MeanPredicted - bin.ObservedRate), 0);
    return { ECE: ece, Bins: bins };
}

/**
 * The logit of a probability clamped to [ε, 1 − ε].
 *
 * @param probability The probability.
 */
export function ClampedLogit(probability: number): number {
    const p = Math.min(Math.max(probability, DECISION_EVAL_LOGIT_CLAMP), 1 - DECISION_EVAL_LOGIT_CLAMP);
    return Math.log(p / (1 - p));
}

/**
 * Fits Platt scaling: a logistic regression of the class on logit(p), by Newton's method with a
 * backtracking line search, at most 100 iterations. The targets are Platt's smoothed ones,
 * (N₊ + 1) / (N₊ + 2) for a positive case and 1 / (N₋ + 2) for a negative one, so a separable set
 * still has a finite fit. It has converged when the gradient is below 1e-9.
 *
 * @param points The cases to fit on.
 */
export function FitPlatt(points: readonly LabelledProbability[]): PlattParameters {
    const x = points.map(p => ClampedLogit(p.Probability));
    const targets = plattTargets(points);
    const positives = points.filter(p => p.Positive).length;
    let a = 0;
    let b = Math.log((positives + 1) / (points.length - positives + 1));
    for (let iteration = 1; iteration <= PLATT_MAX_ITERATIONS; iteration++) {
        const newton = newtonStep(x, targets, a, b);
        if (newton === null) {
            return { A: a, B: b, Iterations: iteration - 1, Converged: true };
        }
        [a, b] = lineSearch(x, targets, a, b, newton);
    }
    return { A: a, B: b, Iterations: PLATT_MAX_ITERATIONS, Converged: newtonStep(x, targets, a, b) === null };
}

/**
 * A probability through fitted Platt parameters, by production's own `ApplyPlattCalibration`
 * (`@memberjunction/ai`), so the eval scores exactly the transform a consumer applies.
 *
 * @param probability The raw probability.
 * @param parameters The fit.
 */
export function ApplyPlatt(probability: number, parameters: Pick<PlattParameters, 'A' | 'B'>): number {
    return ApplyPlattCalibration(probability, parameters);
}

/**
 * Out-of-fold Platt calibration: the cases are shuffled within each class with a seeded generator
 * and dealt into folds in turn (so each fold holds both classes where it can); each fold is
 * calibrated by a fit on the others, so no case's calibrated value depends on its own label.
 * Returns the calibrated probabilities in the input's order, or null with fewer than two cases.
 * With fewer cases than folds, each case is its own fold (leave one out).
 *
 * The shuffle is by position, so the folds depend on the input's order as well as the seed: pass
 * the cases in a stable order.
 *
 * @param points The cases.
 * @param folds The fold count.
 * @param seed The generator's seed.
 */
export function OutOfFoldPlatt(points: readonly LabelledProbability[], folds: number, seed: number): number[] | null {
    if (points.length < 2) {
        return null;
    }
    const foldCount = Math.max(2, Math.min(folds, points.length));
    const assignment = assignFolds(points, foldCount, seed);
    const calibrated = new Array<number>(points.length);
    for (let fold = 0; fold < foldCount; fold++) {
        const training = points.filter((_, i) => assignment[i] !== fold);
        const fit = FitPlatt(training);
        points.forEach((point, i) => {
            if (assignment[i] === fold) {
                calibrated[i] = ApplyPlatt(point.Probability, fit);
            }
        });
    }
    return calibrated;
}

/** One reliability bin from its members. */
function reliabilityBin(members: readonly LabelledProbability[], index: number, binCount: number): ReliabilityBin {
    return {
        Lower: index / binCount,
        Upper: (index + 1) / binCount,
        Count: members.length,
        MeanPredicted: Mean(members.map(m => m.Probability)),
        ObservedRate: Mean(members.map(m => (m.Positive ? 1 : 0)))
    };
}

/** 1-based ranks, with tied values given the mean of the ranks they span. */
function averageRanks(values: readonly number[]): number[] {
    const order = values.map((value, index) => ({ value, index })).sort((x, y) => x.value - y.value);
    const ranks = new Array<number>(values.length);
    let start = 0;
    while (start < order.length) {
        let end = start;
        while (end + 1 < order.length && order[end + 1].value === order[start].value) {
            end++;
        }
        const rank = (start + end) / 2 + 1;
        for (let k = start; k <= end; k++) {
            ranks[order[k].index] = rank;
        }
        start = end + 1;
    }
    return ranks;
}

/** The logistic function. */
function sigmoid(z: number): number {
    return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

/** Platt's smoothed targets. */
function plattTargets(points: readonly LabelledProbability[]): number[] {
    const positives = points.filter(p => p.Positive).length;
    const negatives = points.length - positives;
    const high = (positives + 1) / (positives + 2);
    const low = 1 / (negatives + 2);
    return points.map(p => (p.Positive ? high : low));
}

/** The cross-entropy of the targets under σ(a·x + b). */
function plattLoss(x: readonly number[], targets: readonly number[], a: number, b: number): number {
    return x.reduce((sum, xi, i) => {
        const z = a * xi + b;
        // log(1 + e^z) − t·z, written to stay finite for large |z|.
        const softplus = z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
        return sum + softplus - targets[i] * z;
    }, 0);
}

/** One Newton step: its direction, and the Newton decrement gᵀH⁻¹g, twice the loss fall it predicts. */
interface NewtonStep {
    Step: [number, number];
    Decrement: number;
}

/** The Newton step at (a, b), or null when the gradient is already below tolerance. */
function newtonStep(x: readonly number[], targets: readonly number[], a: number, b: number): NewtonStep | null {
    let gA = 0, gB = 0, hAA = PLATT_HESSIAN_RIDGE, hAB = 0, hBB = PLATT_HESSIAN_RIDGE;
    x.forEach((xi, i) => {
        const q = sigmoid(a * xi + b);
        const residual = q - targets[i];
        const weight = q * (1 - q);
        gA += residual * xi;
        gB += residual;
        hAA += weight * xi * xi;
        hAB += weight * xi;
        hBB += weight;
    });
    if (Math.abs(gA) < PLATT_GRADIENT_TOLERANCE && Math.abs(gB) < PLATT_GRADIENT_TOLERANCE) {
        return null;
    }
    const determinant = hAA * hBB - hAB * hAB;
    const step: [number, number] = [(hBB * gA - hAB * gB) / determinant, (hAA * gB - hAB * gA) / determinant];
    return { Step: step, Decrement: gA * step[0] + gB * step[1] };
}

/**
 * Takes the Newton step, halving it until the loss does not rise. A step predicted to lower the loss
 * by less than float rounding can show ({@link PLATT_LOSS_RESOLUTION}) is taken whole: that close to
 * the optimum Newton's step is exact to rounding, and comparing losses would only refuse it.
 */
function lineSearch(
    x: readonly number[],
    targets: readonly number[],
    a: number,
    b: number,
    newton: NewtonStep
): [number, number] {
    const { Step: step, Decrement: decrement } = newton;
    const current = plattLoss(x, targets, a, b);
    if (decrement / 2 <= PLATT_LOSS_RESOLUTION * Math.max(1, Math.abs(current))) {
        return [a - step[0], b - step[1]];
    }
    for (let size = 1; size > 1e-10; size /= 2) {
        const nextA = a - size * step[0];
        const nextB = b - size * step[1];
        if (plattLoss(x, targets, nextA, nextB) <= current) {
            return [nextA, nextB];
        }
    }
    return [a, b];
}

/** Each case's fold: classes shuffled apart with a seeded generator, then dealt out in turn. */
function assignFolds(points: readonly LabelledProbability[], folds: number, seed: number): number[] {
    const random = CreateSeededRandom(seed);
    const positives = shuffle(points.flatMap((p, i) => (p.Positive ? [i] : [])), random);
    const negatives = shuffle(points.flatMap((p, i) => (p.Positive ? [] : [i])), random);
    const assignment = new Array<number>(points.length);
    [...positives, ...negatives].forEach((index, turn) => {
        assignment[index] = turn % folds;
    });
    return assignment;
}

/** A Fisher-Yates shuffle with the given generator. */
function shuffle<T>(items: T[], random: () => number): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
