/**
 * @fileoverview Fits Platt calibrations for any decision use and any model, from labelled points,
 * and emits them in the shape the model catalog stores: `ModelConfiguration.Decision.Calibrations`
 * on the `MJ: AI Models` row of the decision model that answered.
 *
 * A point is one answered question: the raw probability the model gave (a Likelihood's probability,
 * or a Choice's or Score's confidence) and whether the thing it predicts was true. Points are
 * grouped by (use, question, model, resolved model), because a fit holds only for the exact model
 * and question it was made on; each group is fitted with {@link FitPlatt}, scored out of fold, and,
 * when asked, re-targeted to the class mix production sees (see {@link ShiftPlattIntercept}).
 *
 * Pure: no I/O. `rigs/fit-decision-calibration.ts` in `@memberjunction/integration-test-suite`
 * reads the points and writes what this returns.
 *
 * @module @memberjunction/testing-engine
 */

import type { DecisionCalibrationEntry } from '@memberjunction/ai';
import {
    ApplyPlatt,
    BalancedAccuracy,
    BrierScore,
    CalibrationBins,
    ClampedLogit,
    DECISION_EVAL_CALIBRATION_FOLDS,
    DECISION_EVAL_DEFAULT_THRESHOLD,
    DECISION_EVAL_SEED,
    FitPlatt,
    OutOfFoldPlatt,
    type LabelledProbability,
    type PlattParameters
} from './metrics';

/** The fewest points a group needs before it is fitted, unless the caller sets another floor. */
export const CALIBRATION_FIT_DEFAULT_MIN_POINTS = 30;

/** The fewest points of each class a group needs before it is fitted, unless the caller sets another floor. */
export const CALIBRATION_FIT_DEFAULT_MIN_PER_CLASS = 5;

/** One answered question, labelled. */
export interface CalibrationPoint {
    /** The decision use, such as `conversation-routing` or `memory-note-gate`. */
    Use: string;
    /** The question's key in that use. */
    Question: string;
    /** The MJ decision model that answered (`Jev`, `LLM Decision`): the `MJ: AI Models` row the fit belongs on. */
    ModelName: string;
    /** The exact model behind it, as the driver reports it (`DecisionResult.ResolvedModel`). */
    ResolvedModel: string;
    /** The raw probability: a Likelihood's probability, or a Choice's or Score's confidence. */
    RawProbability: number;
    /** Whether the predicted thing was true: the statement held, or the chosen value was right. */
    Label: boolean;
    /** How many times the point counts: a positive integer, 1 when absent. */
    Weight?: number;
    /**
     * The fold the point is held out in when the group is scored out of fold. Give every repeat of
     * one case the same fold, so no case is scored by a fit that saw it. When any point of a group
     * lacks one, the group's folds are dealt at random instead.
     */
    Fold?: number;
}

/** The calibrations for one decision model: what goes into its `Decision.Calibrations`. */
export interface ModelCalibrationEntries {
    /** The `MJ: AI Models` row they belong on. */
    ModelName: string;
    Calibrations: DecisionCalibrationEntry[];
}

/** A target class mix: one prior for every group, or one per use (keyed by use, `*` for the rest). */
export type CalibrationTargetPrior = number | Readonly<Record<string, number>>;

/** Options for {@link FitDecisionCalibrations}. Every one has a default. */
export interface CalibrationFitOptions {
    /** The fewest points (weights counted) a group needs. Default {@link CALIBRATION_FIT_DEFAULT_MIN_POINTS}. */
    MinPoints?: number;
    /** The fewest points of each class a group needs. Default {@link CALIBRATION_FIT_DEFAULT_MIN_PER_CLASS}. */
    MinPerClass?: number;
    /** The share of positives production sees, to re-target each fit to. Absent: the corpus's own mix. */
    TargetPrior?: CalibrationTargetPrior;
    /** Folds for the out-of-fold scores when the points carry none. Default {@link DECISION_EVAL_CALIBRATION_FOLDS}. */
    Folds?: number;
    /** Seed for the random folds. Default {@link DECISION_EVAL_SEED}. */
    Seed?: number;
    /** The threshold balanced accuracy is scored at. Default {@link DECISION_EVAL_DEFAULT_THRESHOLD}. */
    Threshold?: number;
    /** Names the corpus in each entry's `FittedOn`, such as `routing corpus 08dd187a`. */
    CorpusLabel?: string;
    /** The date written into `FittedOn`. Default: now. */
    FittedAt?: Date;
}

/** The scores of one set of probabilities against their labels. */
export interface CalibrationScores {
    BalancedAccuracy: number | null;
    ECE: number | null;
    Brier: number | null;
}

/** One group's fit, or the reason it was not fitted. */
export interface CalibrationGroupResult {
    Use: string;
    Question: string;
    ModelName: string;
    ResolvedModel: string;
    /** Points, weights counted. */
    N: number;
    Positives: number;
    /** The share of positives in the points. */
    SamplePrior: number | null;
    /** The share the shipped intercept is shifted to, or null when it is not shifted. */
    TargetPrior: number | null;
    /** The fit on every point, before any shift. Null when the group was refused. */
    Fit: PlattParameters | null;
    /** The raw probabilities' scores. */
    Raw: CalibrationScores;
    /** The out-of-fold calibrated scores, at the corpus's own mix. Null when the group was refused. */
    Calibrated: CalibrationScores | null;
    /** What to store. Absent when the group was refused. */
    Entry?: DecisionCalibrationEntry;
    /** Why the group was not fitted. */
    Refused?: string;
}

/** A point left out before grouping, and why. */
export interface SkippedCalibrationPoint {
    Index: number;
    Reason: string;
}

/** What {@link FitDecisionCalibrations} returns. */
export interface CalibrationFitResult {
    Groups: CalibrationGroupResult[];
    /** The fitted entries, grouped by the model row they belong on. */
    Entries: ModelCalibrationEntries[];
    Skipped: SkippedCalibrationPoint[];
}

/** The key one group is fitted under. */
export interface CalibrationGroupKey {
    Use: string;
    Question: string;
    ModelName: string;
    ResolvedModel: string;
}

/** One group's points, expanded by weight, with their folds when every point has one. */
export interface CalibrationPointGroup extends CalibrationGroupKey {
    Points: LabelledProbability[];
    Folds: number[] | null;
}

/**
 * Fits a calibration for every (use, question, model, resolved model) the points cover.
 *
 * Points with an unusable probability, label, weight or name are skipped and listed; a group is
 * refused when it has too few points, too few of either class, or its fit does not converge.
 *
 * @param points The labelled points.
 * @param options Floors, target prior, folds and the `FittedOn` text.
 */
export function FitDecisionCalibrations(points: readonly CalibrationPoint[], options: CalibrationFitOptions = {}): CalibrationFitResult {
    assertTargetPrior(options.TargetPrior);
    const { Groups, Skipped } = GroupCalibrationPoints(points);
    const results = Groups.map(group => fitGroup(group, options));
    return { Groups: results, Entries: collectEntries(results), Skipped };
}

/**
 * Groups points by (use, question, model, resolved model), in first-seen order, expanding each by its
 * weight, and lists the points that cannot be used.
 *
 * @param points The labelled points.
 */
export function GroupCalibrationPoints(points: readonly CalibrationPoint[]): { Groups: CalibrationPointGroup[]; Skipped: SkippedCalibrationPoint[] } {
    const groups = new Map<string, CalibrationPointGroup & { AllHaveFolds: boolean }>();
    const skipped: SkippedCalibrationPoint[] = [];
    points.forEach((point, index) => {
        const problem = pointProblem(point);
        if (problem) {
            skipped.push({ Index: index, Reason: problem });
            return;
        }
        const key = groupKey(point);
        const id = JSON.stringify([key.Use, key.Question, key.ModelName, key.ResolvedModel]);
        const group = groups.get(id) ?? { ...key, Points: [], Folds: [], AllHaveFolds: true };
        groups.set(id, group);
        const weight = point.Weight ?? 1;
        for (let i = 0; i < weight; i++) {
            group.Points.push({ Probability: point.RawProbability, Positive: point.Label });
            group.Folds?.push(point.Fold ?? -1);
        }
        group.AllHaveFolds = group.AllHaveFolds && point.Fold !== undefined;
    });
    const result = [...groups.values()].map(({ AllHaveFolds, ...group }) => ({ ...group, Folds: AllHaveFolds ? group.Folds : null }));
    return { Groups: result, Skipped: skipped };
}

/**
 * The Platt intercept re-targeted from the class mix it was fitted at to another.
 *
 * A Platt fit approximates the posterior log-odds at the corpus's mix:
 * `logit P(y=1 | p) = A · logit(p) + B`. By Bayes' rule the posterior odds are the likelihood ratio
 * times the prior odds, so when only the class mix changes (the score distribution within each class
 * stays the same, the label-shift assumption) the log-odds move by the change in the prior's log-odds:
 * `B' = B + logit(targetPrior) − logit(samplePrior)`. `A` is unchanged.
 *
 * @param b The fitted intercept.
 * @param samplePrior The share of positives the fit was made on, in (0, 1).
 * @param targetPrior The share of positives to re-target to, in (0, 1).
 */
export function ShiftPlattIntercept(b: number, samplePrior: number, targetPrior: number): number {
    if (!isOpenUnitInterval(samplePrior) || !isOpenUnitInterval(targetPrior)) {
        throw new Error(`Priors must be in (0, 1); got sample ${samplePrior} and target ${targetPrior}`);
    }
    return b + ClampedLogit(targetPrior) - ClampedLogit(samplePrior);
}

/**
 * The target prior for one use: a single number for every use, or the use's own entry, or `*`.
 * Null when none applies.
 *
 * @param target The option as given.
 * @param use The decision use.
 */
export function ResolveTargetPrior(target: CalibrationTargetPrior | undefined, use: string): number | null {
    if (target === undefined) {
        return null;
    }
    if (typeof target === 'number') {
        return target;
    }
    const prior = Object.hasOwn(target, use) ? target[use] : Object.hasOwn(target, '*') ? target['*'] : undefined;
    return prior ?? null;
}

/** Throws when a target prior is not a share in (0, 1), before anything is fitted. */
function assertTargetPrior(target: CalibrationTargetPrior | undefined): void {
    const priors = target === undefined ? [] : typeof target === 'number' ? [['', target] as const] : Object.entries(target);
    for (const [use, prior] of priors) {
        if (!isOpenUnitInterval(prior)) {
            throw new Error(`The target prior${use ? ` for '${use}'` : ''} must be a share in (0, 1), got ${String(prior)}`);
        }
    }
}

/** Why a point cannot be used, or undefined when it can. */
function pointProblem(point: CalibrationPoint): string | undefined {
    for (const field of ['Use', 'Question', 'ModelName', 'ResolvedModel'] as const) {
        if (typeof point[field] !== 'string' || point[field].trim().length === 0) {
            return `${field} is missing: a calibration is keyed on the use, the question, the model and the exact model behind it`;
        }
    }
    if (typeof point.RawProbability !== 'number' || !Number.isFinite(point.RawProbability) || point.RawProbability < 0 || point.RawProbability > 1) {
        return `RawProbability must be a finite number in [0, 1], got ${String(point.RawProbability)}`;
    }
    if (typeof point.Label !== 'boolean') {
        return `Label must be true or false, got ${String(point.Label)}`;
    }
    if (point.Weight !== undefined && (!Number.isInteger(point.Weight) || point.Weight < 1)) {
        return `Weight must be a positive integer (a repetition count), got ${String(point.Weight)}`;
    }
    if (point.Fold !== undefined && (!Number.isInteger(point.Fold) || point.Fold < 0)) {
        return `Fold must be a non-negative integer, got ${String(point.Fold)}`;
    }
    return undefined;
}

function groupKey(point: CalibrationPoint): CalibrationGroupKey {
    return { Use: point.Use.trim(), Question: point.Question.trim(), ModelName: point.ModelName.trim(), ResolvedModel: point.ResolvedModel.trim() };
}

/** Fits, scores and shifts one group, or refuses it. */
function fitGroup(group: CalibrationPointGroup, options: CalibrationFitOptions): CalibrationGroupResult {
    const base = describeGroup(group, options);
    const refusal = groupRefusal(group.Points, options);
    if (refusal) {
        return { ...base, Refused: refusal };
    }
    const fit = FitPlatt(group.Points);
    if (!fit.Converged) {
        return { ...base, Fit: fit, Refused: `the fit did not converge after ${fit.Iterations} iterations` };
    }
    const calibrated = scoreOutOfFold(group, options);
    if (!calibrated) {
        return { ...base, Fit: fit, Refused: 'the out-of-fold scores need at least two folds with points in them' };
    }
    const b = base.TargetPrior !== null && base.SamplePrior !== null ? ShiftPlattIntercept(fit.B, base.SamplePrior, base.TargetPrior) : fit.B;
    const entry: DecisionCalibrationEntry = {
        Use: group.Use,
        Question: group.Question,
        ResolvedModel: group.ResolvedModel,
        A: roundParameter(fit.A),
        B: roundParameter(b),
        FittedOn: describeFit(base, calibrated, options)
    };
    return { ...base, Fit: fit, Calibrated: calibrated, Entry: entry };
}

/** The parts of a group's result that don't depend on its fit. */
function describeGroup(group: CalibrationPointGroup, options: CalibrationFitOptions): CalibrationGroupResult {
    const positives = group.Points.filter(p => p.Positive).length;
    const n = group.Points.length;
    const target = ResolveTargetPrior(options.TargetPrior, group.Use);
    return {
        Use: group.Use,
        Question: group.Question,
        ModelName: group.ModelName,
        ResolvedModel: group.ResolvedModel,
        N: n,
        Positives: positives,
        SamplePrior: n > 0 ? positives / n : null,
        TargetPrior: target,
        Fit: null,
        Raw: scorePoints(group.Points, options),
        Calibrated: null
    };
}

/** Why a group can't be fitted: too few points, too few of a class, or a bad target prior. */
function groupRefusal(points: readonly LabelledProbability[], options: CalibrationFitOptions): string | undefined {
    const minPoints = options.MinPoints ?? CALIBRATION_FIT_DEFAULT_MIN_POINTS;
    const minPerClass = options.MinPerClass ?? CALIBRATION_FIT_DEFAULT_MIN_PER_CLASS;
    const positives = points.filter(p => p.Positive).length;
    const negatives = points.length - positives;
    if (points.length < minPoints) {
        return `${points.length} points, fewer than the ${minPoints} a fit needs`;
    }
    if (positives === 0 || negatives === 0) {
        return `every point is ${positives === 0 ? 'negative' : 'positive'}: a fit needs both classes`;
    }
    if (positives < minPerClass || negatives < minPerClass) {
        return `${positives} positive and ${negatives} negative points; each class needs at least ${minPerClass}`;
    }
    return undefined;
}

/** The out-of-fold calibrated scores: the caller's folds when every point has one, random folds otherwise. */
function scoreOutOfFold(group: CalibrationPointGroup, options: CalibrationFitOptions): CalibrationScores | null {
    const calibrated = group.Folds
        ? outOfFoldByAssignment(group.Points, group.Folds)
        : OutOfFoldPlatt(group.Points, options.Folds ?? DECISION_EVAL_CALIBRATION_FOLDS, options.Seed ?? DECISION_EVAL_SEED);
    if (!calibrated) {
        return null;
    }
    return scorePoints(group.Points.map((p, i) => ({ Probability: calibrated[i], Positive: p.Positive })), options);
}

/**
 * Out-of-fold calibration with the caller's folds: each fold is calibrated by a fit on the others.
 * Null when fewer than two folds hold points.
 */
function outOfFoldByAssignment(points: readonly LabelledProbability[], folds: readonly number[]): number[] | null {
    const distinct = [...new Set(folds)];
    if (distinct.length < 2) {
        return null;
    }
    const calibrated = new Array<number>(points.length);
    for (const fold of distinct) {
        const fit = FitPlatt(points.filter((_, i) => folds[i] !== fold));
        points.forEach((point, i) => {
            if (folds[i] === fold) {
                calibrated[i] = ApplyPlatt(point.Probability, fit);
            }
        });
    }
    return calibrated;
}

function scorePoints(points: readonly LabelledProbability[], options: CalibrationFitOptions): CalibrationScores {
    return {
        BalancedAccuracy: BalancedAccuracy(points, options.Threshold ?? DECISION_EVAL_DEFAULT_THRESHOLD),
        ECE: CalibrationBins(points).ECE,
        Brier: BrierScore(points)
    };
}

/** The `FittedOn` text: the corpus, the date, the counts and the out-of-fold scores, and any shift. */
function describeFit(group: CalibrationGroupResult, calibrated: CalibrationScores, options: CalibrationFitOptions): string {
    const date = (options.FittedAt ?? new Date()).toISOString().slice(0, 10);
    const parts = [
        `${options.CorpusLabel ? `${options.CorpusLabel}, ` : ''}fitted ${date}: n=${group.N} (${group.Positives} positive)`,
        `out of fold, balanced accuracy ${formatScore(group.Raw.BalancedAccuracy)} raw → ${formatScore(calibrated.BalancedAccuracy)}`,
        `ECE ${formatScore(group.Raw.ECE)} → ${formatScore(calibrated.ECE)}`,
        `Brier ${formatScore(group.Raw.Brier)} → ${formatScore(calibrated.Brier)}`
    ];
    if (group.TargetPrior !== null && group.SamplePrior !== null) {
        parts.push(`intercept shifted from the corpus mix ${formatScore(group.SamplePrior)} to ${formatScore(group.TargetPrior)}`);
    }
    return parts.join('; ');
}

function collectEntries(groups: readonly CalibrationGroupResult[]): ModelCalibrationEntries[] {
    const byModel = new Map<string, DecisionCalibrationEntry[]>();
    for (const group of groups) {
        if (group.Entry) {
            byModel.set(group.ModelName, [...(byModel.get(group.ModelName) ?? []), group.Entry]);
        }
    }
    return [...byModel.entries()].map(([ModelName, Calibrations]) => ({ ModelName, Calibrations }));
}

/**
 * The fit as a markdown report: one row per group, with its counts, scores and parameters or the
 * reason it was refused, then the skipped points.
 *
 * @param result What {@link FitDecisionCalibrations} returned.
 */
export function RenderCalibrationFitReport(result: CalibrationFitResult): string {
    const lines = [
        '# Decision calibration fit',
        '',
        'Scores are out of fold, at the corpus\'s own class mix. Paste each model\'s entries into',
        '`ModelConfiguration.Decision.Calibrations` on its `MJ: AI Models` row (`calibrations.json`).',
        '',
        '| Use | Question | Model | Resolved model | n | Positive | BA raw → cal | ECE raw → cal | Brier raw → cal | A | B | Status |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|'
    ];
    for (const group of result.Groups) {
        lines.push(renderGroupRow(group));
    }
    if (result.Skipped.length > 0) {
        lines.push('', `## Skipped points (${result.Skipped.length})`, '');
        for (const skip of result.Skipped.slice(0, 50)) {
            lines.push(`- point ${skip.Index}: ${skip.Reason}`);
        }
        if (result.Skipped.length > 50) {
            lines.push(`- … and ${result.Skipped.length - 50} more`);
        }
    }
    return `${lines.join('\n')}\n`;
}

function renderGroupRow(group: CalibrationGroupResult): string {
    const scores = (key: keyof CalibrationScores): string =>
        `${formatScore(group.Raw[key])} → ${group.Calibrated ? formatScore(group.Calibrated[key]) : '—'}`;
    const status = group.Refused
        ? `refused: ${group.Refused}`
        : group.TargetPrior !== null ? `fitted; B shifted to prior ${formatScore(group.TargetPrior)}` : 'fitted';
    const cells = [
        group.Use, group.Question, group.ModelName, group.ResolvedModel, String(group.N), String(group.Positives),
        scores('BalancedAccuracy'), scores('ECE'), scores('Brier'),
        group.Entry ? String(group.Entry.A) : '—', group.Entry ? String(group.Entry.B) : '—', status
    ];
    return `| ${cells.map(cell => cell.replace(/\|/g, '\\|')).join(' | ')} |`;
}

function formatScore(value: number | null): string {
    return value === null ? 'n/a' : value.toFixed(3);
}

/** Four decimal places, as the shipped fits are written. */
function roundParameter(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

function isOpenUnitInterval(value: number): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1;
}
