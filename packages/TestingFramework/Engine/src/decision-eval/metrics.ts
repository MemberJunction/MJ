/**
 * @fileoverview Decision Eval metrics: agreement with labels, repeatability and calibration, per
 * matrix cell. Pure and deterministic: every random draw comes from a seeded generator, and
 * {@link ComputeCellMetrics} puts the cases in case-ID order before any draw, so the same runs give
 * the same scorecard in whatever order they are read.
 *
 * Definitions (all on the cell's observations):
 * - A **case** is one corpus point. Its repeats are the cell's runs of it.
 * - A run is **usable** when it produced a probability and was not answered by a model other than
 *   the pinned one in a cell that disallowed failover. Other runs are counted, never scored.
 * - **Accuracy-type metrics** (accuracy, balanced accuracy, AUC, Brier, ECE, switch recall,
 *   operating points) use one probability per case: the mean of its usable repeats. They cover
 *   cases labelled `continue` (positive) or `switch` (negative); `ambiguous` cases are reported
 *   apart, as the rate kept with the previous agent.
 * - **Repeatability** uses the individual repeats: per case, the population standard deviation of
 *   the probability, and the verdict agreement (the share of repeats whose verdict at the threshold
 *   matches the case's majority verdict). Cases with fewer than two usable repeats are left out.
 * - **Signal value** is accuracy × mean verdict agreement (plan §2: agreement with labels ×
 *   repeatability).
 * - **Calibration** is Platt scaling on logit(p), fitted out of fold, with the parameters also
 *   fitted on all the data.
 *
 * @module @memberjunction/testing-engine
 */

import { ApplyPlattCalibration, PLATT_LOGIT_CLAMP } from '@memberjunction/ai';
import type { DecisionEvalLabel } from './types';

/** The threshold the metrics use unless told otherwise. */
export const DECISION_EVAL_DEFAULT_THRESHOLD = 0.5;

/** The bootstrap's resample count unless told otherwise. */
export const DECISION_EVAL_BOOTSTRAP_RESAMPLES = 1000;

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

/** The operating-point thresholds: 0.30 to 0.90 in steps of 0.05. */
export const DECISION_EVAL_OPERATING_THRESHOLDS: readonly number[] =
    Array.from({ length: 13 }, (_, i) => Math.round((0.3 + i * 0.05) * 100) / 100);

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

/** One run of one case in one cell. */
export interface DecisionEvalObservation {
    /** The corpus point's ID. */
    CaseId: string;
    /** The point's label. */
    Label: DecisionEvalLabel;
    /** The positive-class probability (the `continues` Likelihood), or null when the run produced none. */
    Probability: number | null;
    /** Latency of the decision call in milliseconds, when recorded. */
    LatencyMs: number | null;
    /** The run's cost in USD, when known. */
    CostUSD: number | null;
    /** True when a pinned run was answered by another model or vendor. */
    FailedOver: boolean;
    /** Whether the cell allowed failover. A failed-over run in a cell that didn't is not scored. */
    FailoverAllowed: boolean;
}

/** One probability with its true class. */
export interface LabelledProbability {
    /** The positive-class probability. */
    Probability: number;
    /** True for the positive class (`continue`). */
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

/** Precision and recall of each class at one threshold. Null where the ratio has no denominator. */
export interface OperatingPoint {
    Threshold: number;
    ContinuePrecision: number | null;
    ContinueRecall: number | null;
    SwitchPrecision: number | null;
    SwitchRecall: number | null;
}

/** The accuracy-type metrics of one set of per-case probabilities. */
export interface ProbabilityMetrics {
    /** Cases scored. */
    N: number;
    Accuracy: number | null;
    AccuracyCI: ConfidenceInterval | null;
    BalancedAccuracy: number | null;
    BalancedAccuracyCI: ConfidenceInterval | null;
    RocAuc: number | null;
    Brier: number | null;
    Calibration: CalibrationSummary;
    SwitchRecall: number | null;
    OperatingPoints: OperatingPoint[];
}

/** Platt parameters: calibrated p = 1 / (1 + exp(−(A · logit(p) + B))). */
export interface PlattParameters {
    A: number;
    B: number;
    Iterations: number;
    Converged: boolean;
}

/** One case's repeatability. */
export interface CaseRepeatability {
    CaseId: string;
    Repeats: number;
    StdDev: number;
    VerdictAgreement: number;
}

/** A cell's repeatability. */
export interface RepeatabilitySummary {
    /** Cases with at least two usable repeats. */
    Cases: number;
    MeanStdDev: number | null;
    MeanVerdictAgreement: number | null;
    /** The least repeatable cases (lowest agreement, then highest spread), by ID only. */
    Worst: CaseRepeatability[];
}

/** Counts of a cell's runs. */
export interface RunCounts {
    Runs: number;
    UsableRuns: number;
    /** Runs that produced no probability. */
    NoProbabilityRuns: number;
    /** Runs answered by a model other than the pinned one, allowed or not. */
    FailoverRuns: number;
    /** Failed-over runs in a cell that disallowed failover: not scored. */
    ExcludedFailoverRuns: number;
}

/** How `ambiguous` cases came out. */
export interface AmbiguousSummary {
    Cases: number;
    /** Cases whose mean probability is at or above the threshold: kept with the previous agent. */
    KeptWithPreviousAgent: number;
    Rate: number | null;
}

/** Latency percentiles over the runs that produced a probability. */
export interface LatencySummary {
    Runs: number;
    P50: number | null;
    P95: number | null;
}

/** Cost per thousand runs, from the runs whose cost is known. */
export interface CostSummary {
    RunsWithCost: number;
    CostPer1kUSD: number | null;
}

/** Everything the scorecard reports for one cell. */
export interface DecisionEvalCellMetrics {
    Threshold: number;
    Counts: RunCounts;
    Raw: ProbabilityMetrics;
    /** The same metrics on out-of-fold Platt-calibrated probabilities, or null with fewer than two cases. */
    Calibrated: ProbabilityMetrics | null;
    /** Platt parameters fitted on all the cases: what a consumer would ship. */
    Platt: PlattParameters | null;
    Repeatability: RepeatabilitySummary;
    /** Accuracy × mean verdict agreement. */
    SignalValue: number | null;
    Latency: LatencySummary;
    Cost: CostSummary;
    Ambiguous: AmbiguousSummary;
}

/** Options for {@link ComputeCellMetrics}. Every one has a default. */
export interface DecisionEvalMetricOptions {
    Threshold?: number;
    BootstrapResamples?: number;
    Seed?: number;
    CalibrationFolds?: number;
    WorstCaseCount?: number;
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

/** The population standard deviation (divides by n), or null for no values. */
export function PopulationStdDev(values: readonly number[]): number | null {
    const mean = Mean(values);
    if (mean === null) {
        return null;
    }
    return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
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

/** The share of cases whose verdict at the threshold matches the class, or null with none. */
export function Accuracy(points: readonly LabelledProbability[], threshold: number): number | null {
    if (points.length === 0) {
        return null;
    }
    return points.filter(p => (p.Probability >= threshold) === p.Positive).length / points.length;
}

/**
 * The recall of one class: among its cases, the share the threshold assigns to it. Null when the
 * class has no cases.
 *
 * @param points The cases.
 * @param threshold At or above it predicts the positive class.
 * @param positive Which class: true for `continue`, false for `switch`.
 */
export function ClassRecall(points: readonly LabelledProbability[], threshold: number, positive: boolean): number | null {
    const members = points.filter(p => p.Positive === positive);
    if (members.length === 0) {
        return null;
    }
    return members.filter(p => (p.Probability >= threshold) === positive).length / members.length;
}

/** The mean of the two classes' recalls, over the classes present. Null with no cases. */
export function BalancedAccuracy(points: readonly LabelledProbability[], threshold: number): number | null {
    const recalls = [ClassRecall(points, threshold, true), ClassRecall(points, threshold, false)]
        .filter((r): r is number => r !== null);
    return Mean(recalls);
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
 * A percentile bootstrap interval for a statistic of the cases: `resamples` draws of n cases with
 * replacement, from a generator seeded with `seed`, and the 2.5th and 97.5th percentiles of the
 * statistic. Draws where the statistic is undefined are skipped. Null when none is defined.
 *
 * The draws pick cases by position, so the interval depends on the input's order as well as the
 * seed: pass the cases in a stable order ({@link ComputeCellMetrics} sorts them by case ID).
 *
 * @param points The cases.
 * @param statistic The statistic to bound.
 * @param resamples How many resamples.
 * @param seed The generator's seed.
 */
export function BootstrapInterval(
    points: readonly LabelledProbability[],
    statistic: (sample: readonly LabelledProbability[]) => number | null,
    resamples: number,
    seed: number
): ConfidenceInterval | null {
    if (points.length === 0) {
        return null;
    }
    const random = CreateSeededRandom(seed);
    const values: number[] = [];
    for (let r = 0; r < resamples; r++) {
        const sample = Array.from({ length: points.length }, () => points[Math.floor(random() * points.length)]);
        const value = statistic(sample);
        if (value !== null) {
            values.push(value);
        }
    }
    const lower = Quantile(values, 0.025);
    const upper = Quantile(values, 0.975);
    return lower === null || upper === null ? null : { Lower: lower, Upper: upper };
}

/**
 * Precision and recall of each class at each threshold. `continue` is predicted at or above the
 * threshold, `switch` below it.
 *
 * @param points The cases.
 * @param thresholds The thresholds.
 */
export function OperatingPoints(
    points: readonly LabelledProbability[],
    thresholds: readonly number[] = DECISION_EVAL_OPERATING_THRESHOLDS
): OperatingPoint[] {
    return thresholds.map(threshold => {
        const counts = confusion(points, threshold);
        return {
            Threshold: threshold,
            ContinuePrecision: ratio(counts.TruePositive, counts.TruePositive + counts.FalsePositive),
            ContinueRecall: ratio(counts.TruePositive, counts.TruePositive + counts.FalseNegative),
            SwitchPrecision: ratio(counts.TrueNegative, counts.TrueNegative + counts.FalseNegative),
            SwitchRecall: ratio(counts.TrueNegative, counts.TrueNegative + counts.FalsePositive)
        };
    });
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
 * the cases in a stable order ({@link ComputeCellMetrics} sorts them by case ID).
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

/**
 * One case's repeatability: the population standard deviation of its repeats' probabilities, and
 * the share of repeats whose verdict at the threshold matches the majority verdict.
 *
 * @param caseId The case.
 * @param probabilities Its repeats' probabilities.
 * @param threshold At or above it the verdict is positive.
 */
export function MeasureCaseRepeatability(caseId: string, probabilities: readonly number[], threshold: number): CaseRepeatability {
    const positives = probabilities.filter(p => p >= threshold).length;
    return {
        CaseId: caseId,
        Repeats: probabilities.length,
        StdDev: PopulationStdDev(probabilities) ?? 0,
        VerdictAgreement: probabilities.length === 0 ? 0 : Math.max(positives, probabilities.length - positives) / probabilities.length
    };
}

/**
 * A cell's repeatability over the cases with at least two repeats, and its least repeatable cases:
 * lowest verdict agreement first, then highest spread, then ID.
 *
 * @param repeatsByCase Each case's repeats' probabilities.
 * @param threshold At or above it the verdict is positive.
 * @param worstCount How many of the least repeatable cases to list.
 */
export function SummarizeRepeatability(
    repeatsByCase: ReadonlyMap<string, readonly number[]>,
    threshold: number,
    worstCount: number = 10
): RepeatabilitySummary {
    const cases = [...repeatsByCase]
        .filter(([, probabilities]) => probabilities.length >= 2)
        .map(([caseId, probabilities]) => MeasureCaseRepeatability(caseId, probabilities, threshold));
    const worst = [...cases]
        .sort((x, y) => x.VerdictAgreement - y.VerdictAgreement || y.StdDev - x.StdDev || x.CaseId.localeCompare(y.CaseId))
        .slice(0, worstCount);
    return {
        Cases: cases.length,
        MeanStdDev: Mean(cases.map(c => c.StdDev)),
        MeanVerdictAgreement: Mean(cases.map(c => c.VerdictAgreement)),
        Worst: worst
    };
}

/**
 * The accuracy-type metrics of a set of per-case probabilities.
 *
 * @param points The cases.
 * @param threshold At or above it predicts `continue`.
 * @param resamples The bootstrap's resample count.
 * @param seed The bootstrap's seed.
 */
export function ComputeProbabilityMetrics(
    points: readonly LabelledProbability[],
    threshold: number,
    resamples: number,
    seed: number
): ProbabilityMetrics {
    return {
        N: points.length,
        Accuracy: Accuracy(points, threshold),
        AccuracyCI: BootstrapInterval(points, sample => Accuracy(sample, threshold), resamples, seed),
        BalancedAccuracy: BalancedAccuracy(points, threshold),
        BalancedAccuracyCI: BootstrapInterval(points, sample => BalancedAccuracy(sample, threshold), resamples, seed),
        RocAuc: RocAuc(points),
        Brier: BrierScore(points),
        Calibration: CalibrationBins(points),
        SwitchRecall: ClassRecall(points, threshold, false),
        OperatingPoints: OperatingPoints(points)
    };
}

/**
 * Every metric for one cell, from its runs. The runs may come in any order: the cases are put in
 * case-ID order, and each case's repeats in ascending order, before anything is summed or drawn,
 * so the folds, the bootstrap draws and every figure are the same for any order of the same runs.
 *
 * @param observations The cell's runs.
 * @param options Threshold, bootstrap, seed, folds and worst-case count; each has a default.
 */
export function ComputeCellMetrics(
    observations: readonly DecisionEvalObservation[],
    options: DecisionEvalMetricOptions = {}
): DecisionEvalCellMetrics {
    const threshold = options.Threshold ?? DECISION_EVAL_DEFAULT_THRESHOLD;
    const resamples = options.BootstrapResamples ?? DECISION_EVAL_BOOTSTRAP_RESAMPLES;
    const seed = options.Seed ?? DECISION_EVAL_SEED;
    const usable = observations.filter(isUsable);
    const cases = groupCases(usable);
    const scored = [...cases.values()].filter(c => c.Label !== 'ambiguous');
    const points = scored.map(c => ({ Probability: meanOf(c.Probabilities), Positive: c.Label === 'continue' }));
    const raw = ComputeProbabilityMetrics(points, threshold, resamples, seed);
    const calibrated = OutOfFoldPlatt(points, options.CalibrationFolds ?? DECISION_EVAL_CALIBRATION_FOLDS, seed);
    const repeatability = SummarizeRepeatability(
        new Map(scored.map(c => [c.CaseId, c.Probabilities])), threshold, options.WorstCaseCount ?? 10);
    return {
        Threshold: threshold,
        Counts: countRuns(observations, usable.length),
        Raw: raw,
        Calibrated: calibrated
            ? ComputeProbabilityMetrics(points.map((p, i) => ({ ...p, Probability: calibrated[i] })), threshold, resamples, seed)
            : null,
        Platt: points.length >= 2 ? FitPlatt(points) : null,
        Repeatability: repeatability,
        SignalValue: raw.Accuracy !== null && repeatability.MeanVerdictAgreement !== null
            ? raw.Accuracy * repeatability.MeanVerdictAgreement
            : null,
        Latency: summarizeLatency(usable),
        Cost: summarizeCost(usable),
        Ambiguous: summarizeAmbiguous([...cases.values()], threshold)
    };
}

/** One case's usable repeats. */
interface CaseRepeats {
    CaseId: string;
    Label: DecisionEvalLabel;
    Probabilities: number[];
}

/** A run is scored when it has a probability and did not fail over in a cell that forbade it. */
function isUsable(observation: DecisionEvalObservation): boolean {
    return observation.Probability !== null && !(observation.FailedOver && !observation.FailoverAllowed);
}

/**
 * The usable runs, grouped by case, in case-ID order, each case's probabilities ascending. Nothing
 * downstream then depends on the order the runs were read in: not the folds or the bootstrap draws,
 * which pick by position, and not a floating-point sum, whose last bits depend on its order.
 */
function groupCases(usable: readonly DecisionEvalObservation[]): Map<string, CaseRepeats> {
    const cases = new Map<string, CaseRepeats>();
    for (const run of usable) {
        const entry = cases.get(run.CaseId) ?? { CaseId: run.CaseId, Label: run.Label, Probabilities: [] };
        entry.Probabilities.push(run.Probability ?? 0);
        cases.set(run.CaseId, entry);
    }
    const sorted = [...cases.values()].sort((x, y) => compareOrdinal(x.CaseId, y.CaseId));
    return new Map(sorted.map(c => [c.CaseId, { ...c, Probabilities: [...c.Probabilities].sort((a, b) => a - b) }]));
}

/** Compares two strings by code unit, the same on every machine and locale. */
function compareOrdinal(x: string, y: string): number {
    return x < y ? -1 : x > y ? 1 : 0;
}

/** The mean of a non-empty list. */
function meanOf(values: readonly number[]): number {
    return Mean(values) ?? 0;
}

/** The run counts. */
function countRuns(observations: readonly DecisionEvalObservation[], usable: number): RunCounts {
    return {
        Runs: observations.length,
        UsableRuns: usable,
        NoProbabilityRuns: observations.filter(o => o.Probability === null).length,
        FailoverRuns: observations.filter(o => o.FailedOver).length,
        ExcludedFailoverRuns: observations.filter(o => o.FailedOver && !o.FailoverAllowed).length
    };
}

/** Latency percentiles over the usable runs that recorded one. */
function summarizeLatency(usable: readonly DecisionEvalObservation[]): LatencySummary {
    const latencies = usable.map(o => o.LatencyMs).filter((l): l is number => l !== null);
    return { Runs: latencies.length, P50: Quantile(latencies, 0.5), P95: Quantile(latencies, 0.95) };
}

/**
 * Mean cost per thousand **answered** decisions, over the usable runs that recorded a cost. A run
 * that failed before the model answered records a cost of 0, and averaging it in would understate
 * what a decision costs: a cell with many failed calls looked several times cheaper.
 */
function summarizeCost(usable: readonly DecisionEvalObservation[]): CostSummary {
    // Summed in ascending order, so the mean does not depend on the order the runs were read in.
    const costs = usable.map(o => o.CostUSD).filter((c): c is number => c !== null).sort((a, b) => a - b);
    const mean = Mean(costs);
    return { RunsWithCost: costs.length, CostPer1kUSD: mean === null ? null : mean * 1000 };
}

/** How the ambiguous cases came out, on each case's mean probability. */
function summarizeAmbiguous(cases: readonly CaseRepeats[], threshold: number): AmbiguousSummary {
    const ambiguous = cases.filter(c => c.Label === 'ambiguous');
    const kept = ambiguous.filter(c => meanOf(c.Probabilities) >= threshold).length;
    return { Cases: ambiguous.length, KeptWithPreviousAgent: kept, Rate: ratio(kept, ambiguous.length) };
}

/** A ratio, or null when the denominator is zero. */
function ratio(numerator: number, denominator: number): number | null {
    return denominator === 0 ? null : numerator / denominator;
}

/** The four confusion counts at a threshold. */
function confusion(points: readonly LabelledProbability[], threshold: number): {
    TruePositive: number; FalsePositive: number; TrueNegative: number; FalseNegative: number;
} {
    const counts = { TruePositive: 0, FalsePositive: 0, TrueNegative: 0, FalseNegative: 0 };
    for (const point of points) {
        const predicted = point.Probability >= threshold;
        if (predicted) {
            counts[point.Positive ? 'TruePositive' : 'FalsePositive']++;
        } else {
            counts[point.Positive ? 'FalseNegative' : 'TrueNegative']++;
        }
    }
    return counts;
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
