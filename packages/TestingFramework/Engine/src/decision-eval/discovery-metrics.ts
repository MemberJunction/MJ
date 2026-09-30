/**
 * @fileoverview Decision Eval metrics for the `agent-discovery` decision, per matrix cell. Pure and
 * deterministic: every random draw comes from a seeded generator.
 *
 * Definitions (all on the cell's runs):
 * - A **case** is one corpus request; its repeats are the cell's runs of it.
 * - A decision run is **usable** when it has a chosen agent, a Choice confidence and an
 *   `anyApplies` probability, and was not answered by a model other than the pinned one in a cell
 *   that disallowed failover. A baseline run is usable when its search ran. Other runs are counted,
 *   never scored.
 * - A run is **correct** when its label is `agent` and it chose the labelled agent.
 * - Metrics are over **runs**: each run is one request production would have seen. Intervals
 *   resample **cases** (a cluster bootstrap), so a case's repeats move together, and calibration
 *   folds are dealt by case, so no case's repeats are both fitted and scored. The runs are put in a
 *   canonical order first (by case ID, then by what each recorded), so every figure depends on the
 *   runs, not on the order they were read in.
 * - **Top-1 accuracy**: among usable `agent` runs, the share that are correct.
 * - **Choice confidence calibration**: the Choice's confidence as P(correct), over usable `agent`
 *   runs.
 * - **`anyApplies` calibration**: the Likelihood as P(label is `agent`), over all usable runs.
 * - Calibration is Platt scaling on logit(p): out of fold for the calibrated metrics, and fitted on
 *   all the data for the parameters a consumer would ship. It is fitted on every usable answer, on
 *   time or not: when an answer arrived does not change what it says.
 * - **On time**: the discovery (the options, their semantic search, and the call) finished within
 *   production's timeout. Production gives up at the timeout and injects nothing, so a late run is
 *   never injected, at any threshold.
 * - **Injection** at threshold T: the run is on time, and the confidence and `anyApplies` are both at
 *   or above T. Coverage is the share of `agent` runs injected; precision the share of injected
 *   `agent` runs naming the labelled agent (and, counting injections on `none` runs as wrong, the
 *   share of all injections that are right); the false-injection rate the share of `none` runs
 *   injected. Late runs stay in the denominators: they are requests production saw and let pass.
 *
 * @module @memberjunction/testing-engine
 */

import { UUIDsEqual } from '@memberjunction/global';
import { DECISION_DISCOVERY_MIN_CONFIDENCE } from '@memberjunction/ai-agents';
import {
    ApplyPlatt,
    BrierScore,
    CalibrationBins,
    CreateSeededRandom,
    DECISION_EVAL_BOOTSTRAP_RESAMPLES,
    DECISION_EVAL_CALIBRATION_FOLDS,
    DECISION_EVAL_SEED,
    FitPlatt,
    Mean,
    PopulationStdDev,
    Quantile,
    RocAuc,
    type ConfidenceInterval,
    type CostSummary,
    type LabelledProbability,
    type LatencySummary,
    type PlattParameters,
    type ReliabilityBin
} from './metrics';
import {
    type DiscoveryEvalArm,
    type DiscoveryEvalLabel,
    type DiscoveryNoneKind
} from './discovery-types';

/** The injection thresholds: 0.50 to 0.95 in steps of 0.05. */
export const DISCOVERY_INJECTION_THRESHOLDS: readonly number[] =
    Array.from({ length: 10 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);

/** One run of one request in one cell, as the metrics read it. */
export interface DiscoveryEvalObservation {
    /** The corpus request's ID. */
    CaseId: string;
    Label: DiscoveryEvalLabel;
    /** A `none` label's kind, or null. */
    Kind: DiscoveryNoneKind | null;
    /** An `agent` label's agent, or null. */
    ExpectedAgentId: string | null;
    /** What the run measured, or null when it recorded no output. */
    Arm: DiscoveryEvalArm | null;
    /** The Choice's agent (decision), or the baseline's first row, or null. */
    ChosenAgentId: string | null;
    /** The baseline's best-ranked candidate regardless of the floor, or null. */
    TopRankedAgentId: string | null;
    Confidence: number | null;
    AnyApplies: number | null;
    /** Whether production would suggest the chosen agent, as the driver judged it; null without an answer. */
    WouldInject: boolean | null;
    /** For an `agent` label: whether the labelled agent could be chosen at all. */
    LabelledAgentOffered: boolean | null;
    /** The decision call's latency, or the baseline's search. */
    LatencyMs: number | null;
    /** The whole discovery's latency (options, search and call), or null when not recorded. */
    DiscoveryLatencyMs: number | null;
    /** Whether the discovery finished within production's timeout; null without an answer. */
    WithinProductionTimeout: boolean | null;
    CostUSD: number | null;
    FailedOver: boolean;
    FailoverAllowed: boolean;
}

/** One usable decision run, reduced to what injection reads. */
export interface InjectionRun {
    Label: DiscoveryEvalLabel;
    /** Chose the labelled agent. Always false on a `none` run. */
    Correct: boolean;
    Confidence: number;
    AnyApplies: number;
    /** Finished within production's timeout ({@link IsDiscoveryOnTime}). A late run is never injected. */
    OnTime: boolean;
}

/** What injecting at one threshold would do. Ratios are null without a denominator. */
export interface InjectionOperatingPoint {
    Threshold: number;
    /** Runs injected, of any label. */
    Injected: number;
    /** Injected `agent` runs / `agent` runs. */
    Coverage: number | null;
    /** Injected `agent` runs naming the labelled agent / injected `agent` runs. */
    Precision: number | null;
    /** Injected runs naming the labelled agent / all injected runs (a `none` injection is wrong). */
    PrecisionAllInjections: number | null;
    /** Injected `none` runs / `none` runs. */
    FalseInjectionRate: number | null;
}

/** One probability's calibration: how well it ranks and how well its value matches the rate. */
export interface DiscoveryProbabilityCalibration {
    /** Runs scored. */
    N: number;
    RocAuc: number | null;
    Brier: number | null;
    ECE: number | null;
    Bins: ReliabilityBin[];
}

/** A probability, raw and calibrated out of fold, with the Platt parameters fitted on all the data. */
export interface DiscoveryCalibrationSummary {
    Raw: DiscoveryProbabilityCalibration;
    /** On out-of-fold Platt-calibrated values, or null with fewer than two cases. */
    Calibrated: DiscoveryProbabilityCalibration | null;
    /** Fitted on all the runs, or null with fewer than two. */
    Platt: PlattParameters | null;
}

/** Top-1 accuracy on `agent` runs. */
export interface DiscoveryTop1Summary {
    /** Usable `agent` runs. */
    N: number;
    Accuracy: number | null;
    /** 95% cluster-bootstrap interval over cases. */
    AccuracyCI: ConfidenceInterval | null;
}

/** How the `none` runs of one kind came out. */
export interface DiscoveryNoneKindSummary {
    Runs: number;
    /** Runs production would have injected a suggestion into. */
    Injected: number;
    Rate: number | null;
}

/** The baseline's `none` runs where no candidate passes the similarity floor, so the action lists nothing. */
export interface DiscoveryNoneBelowFloorSummary {
    Runs: number;
    /** `none` runs with no candidate at or above the floor: the runs the action gets right. */
    BelowFloor: number;
    Rate: number | null;
}

/** How many answers came within production's discovery timeout. */
export interface DiscoveryOnTimeSummary {
    /** Runs whose timing was recorded. */
    Runs: number;
    OnTime: number;
    Rate: number | null;
}

/** What production's current rule (the driver's `WouldInject`, on time) did. */
export interface DiscoveryProductionVerdict {
    /** The threshold production uses today, on calibrated answers. */
    MinConfidence: number;
    Coverage: number | null;
    Precision: number | null;
    FalseInjectionRate: number | null;
    NoneByKind: Record<DiscoveryNoneKind, DiscoveryNoneKindSummary>;
}

/** One case's repeatability. */
export interface DiscoveryCaseRepeatability {
    CaseId: string;
    Repeats: number;
    /** The share of repeats that chose the case's most-chosen agent. */
    ChoiceAgreement: number;
    ConfidenceStdDev: number;
    AnyAppliesStdDev: number;
    /** The share of repeats whose `WouldInject` matches the case's majority. */
    InjectAgreement: number;
}

/** A cell's repeatability, over cases with at least two usable repeats. */
export interface DiscoveryRepeatabilitySummary {
    Cases: number;
    MeanChoiceAgreement: number | null;
    MeanConfidenceStdDev: number | null;
    MeanAnyAppliesStdDev: number | null;
    MeanInjectAgreement: number | null;
    /** The least repeatable cases (lowest choice agreement, then highest confidence spread), by ID only. */
    Worst: DiscoveryCaseRepeatability[];
}

/** Counts of a cell's runs. */
export interface DiscoveryRunCounts {
    Runs: number;
    UsableRuns: number;
    /** Runs with no usable answer (decision) or no search (baseline). */
    NoAnswerRuns: number;
    FailoverRuns: number;
    ExcludedFailoverRuns: number;
    /** Usable `agent` runs whose labelled agent could not be chosen: not an option, or not in the catalog. */
    LabelledAgentNotOffered: number;
}

/** Everything the scorecard reports for a decision cell. */
export interface DiscoveryDecisionCellMetrics {
    Arm: 'decision';
    Counts: DiscoveryRunCounts;
    Top1: DiscoveryTop1Summary;
    ConfidenceCalibration: DiscoveryCalibrationSummary;
    AnyAppliesCalibration: DiscoveryCalibrationSummary;
    /**
     * The injection operating table, raw and on out-of-fold calibrated values (null with fewer than
     * two cases). A run that finished after production's timeout is never injected.
     */
    Injection: { Raw: InjectionOperatingPoint[]; Calibrated: InjectionOperatingPoint[] | null };
    Production: DiscoveryProductionVerdict;
    Repeatability: DiscoveryRepeatabilitySummary;
    /**
     * The decision call's latency; `Discovery`, the whole discovery's (options, search and call), the
     * span production's timeout bounds; and the share of runs that finished within it.
     */
    Latency: LatencySummary & { Discovery: LatencySummary; WithinProductionTimeoutRate: number | null };
    Cost: CostSummary;
}

/** Everything the scorecard reports for a `semantic-search` baseline cell. */
export interface DiscoveryBaselineCellMetrics {
    Arm: 'semantic-search';
    Counts: DiscoveryRunCounts;
    /** Accuracy of the action's first row (after its floor). */
    Top1: DiscoveryTop1Summary;
    /** Accuracy of the best-ranked candidate, ignoring the floor. */
    TopRankedAccuracy: number | null;
    /** `none` runs where no candidate passes the floor, so the action lists nothing. */
    NoneBelowFloor: DiscoveryNoneBelowFloorSummary;
    /** `none` runs per kind; `Injected` counts runs where some candidate passes the floor. */
    NoneByKind: Record<DiscoveryNoneKind, DiscoveryNoneKindSummary>;
    Latency: LatencySummary;
}

/** Either cell's metrics. */
export type DiscoveryCellMetrics = DiscoveryDecisionCellMetrics | DiscoveryBaselineCellMetrics;

/** Options for the discovery metrics. Every one has a default. */
export interface DiscoveryMetricOptions {
    BootstrapResamples?: number;
    Seed?: number;
    CalibrationFolds?: number;
    WorstCaseCount?: number;
    Thresholds?: readonly number[];
}

/** A usable decision run with the values the metrics read, and its case. */
export interface DiscoveryScoredRun extends InjectionRun {
    CaseId: string;
}

/**
 * Whether a run chose the labelled agent. False on a `none` label.
 *
 * @param observation The run.
 * @param agentId The agent to compare with the label: by default the chosen one.
 */
export function IsDiscoveryCorrect(observation: Pick<DiscoveryEvalObservation, 'Label' | 'ExpectedAgentId' | 'ChosenAgentId'>, agentId: string | null = observation.ChosenAgentId): boolean {
    return observation.Label === 'agent' && !!agentId && !!observation.ExpectedAgentId && UUIDsEqual(agentId, observation.ExpectedAgentId);
}

/**
 * Whether a run's discovery finished within production's timeout. A run with no recorded timing
 * counts as on time; a usable decision run always has one.
 *
 * @param observation The run.
 */
export function IsDiscoveryOnTime(observation: Pick<DiscoveryEvalObservation, 'WithinProductionTimeout'>): boolean {
    return observation.WithinProductionTimeout !== false;
}

/**
 * Whether production would have injected the run's suggestion: the driver's `WouldInject`, and only
 * when the run was on time. New runs already record a late one as not injected; this also holds
 * for runs recorded before the driver applied the timeout.
 *
 * @param observation The run.
 */
export function WouldInjectOnTime(observation: Pick<DiscoveryEvalObservation, 'WouldInject' | 'WithinProductionTimeout'>): boolean {
    return observation.WouldInject === true && IsDiscoveryOnTime(observation);
}

/**
 * What injecting would do at each threshold: a run is injected when it was on time and its
 * confidence and its `anyApplies` are both at or above the threshold.
 *
 * @param runs The usable decision runs.
 * @param thresholds The thresholds.
 */
export function InjectionOperatingPoints(
    runs: readonly InjectionRun[],
    thresholds: readonly number[] = DISCOVERY_INJECTION_THRESHOLDS
): InjectionOperatingPoint[] {
    const agentRuns = runs.filter(r => r.Label === 'agent').length;
    const noneRuns = runs.length - agentRuns;
    return thresholds.map(threshold => {
        const injected = runs.filter(r => r.OnTime && r.Confidence >= threshold && r.AnyApplies >= threshold);
        const injectedAgent = injected.filter(r => r.Label === 'agent');
        const right = injectedAgent.filter(r => r.Correct).length;
        return {
            Threshold: threshold,
            Injected: injected.length,
            Coverage: ratio(injectedAgent.length, agentRuns),
            Precision: ratio(right, injectedAgent.length),
            PrecisionAllInjections: ratio(right, injected.length),
            FalseInjectionRate: ratio(injected.length - injectedAgent.length, noneRuns)
        };
    });
}

/**
 * A percentile bootstrap interval that resamples cases, not runs: `resamples` draws of as many
 * cases as there are, with replacement, each bringing all its runs, and the 2.5th and 97.5th
 * percentiles of the statistic. Draws where the statistic is undefined are skipped. Null with no
 * runs, or when no draw defines it.
 *
 * @param runs The runs, each with its case.
 * @param statistic The statistic to bound.
 * @param resamples How many resamples.
 * @param seed The generator's seed.
 */
export function CaseBootstrapInterval<T extends { CaseId: string }>(
    runs: readonly T[],
    statistic: (sample: readonly T[]) => number | null,
    resamples: number,
    seed: number
): ConfidenceInterval | null {
    const cases = [...groupByCase(runs).values()];
    if (cases.length === 0) {
        return null;
    }
    const random = CreateSeededRandom(seed);
    const values: number[] = [];
    for (let r = 0; r < resamples; r++) {
        const sample = Array.from({ length: cases.length }, () => cases[Math.floor(random() * cases.length)]).flat();
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
 * Deals cases into calibration folds: `agent` cases and `none` cases are each put in ID order,
 * shuffled with a seeded generator, then dealt out in turn, so each fold holds both labels where it
 * can. With fewer cases than folds, each case is its own fold (and never fewer than two folds).
 *
 * @param cases Each case's ID and label, once each.
 * @param folds The fold count.
 * @param seed The generator's seed.
 */
export function AssignCaseFolds(
    cases: ReadonlyArray<{ CaseId: string; Label: DiscoveryEvalLabel }>,
    folds: number,
    seed: number
): Map<string, number> {
    const foldCount = Math.max(2, Math.min(folds, cases.length));
    const random = CreateSeededRandom(seed);
    // In ID order before the shuffle, so the folds do not depend on the order the cases came in.
    const idsOf = (label: DiscoveryEvalLabel): string[] => cases.filter(c => c.Label === label).map(c => c.CaseId).sort(compareIds);
    const agentCases = shuffle(idsOf('agent'), random);
    const noneCases = shuffle(idsOf('none'), random);
    return new Map([...agentCases, ...noneCases].map((caseId, turn) => [caseId, turn % foldCount]));
}

/**
 * Every metric for a decision cell, from its runs.
 *
 * @param observations The cell's runs.
 * @param options Bootstrap, seed, folds, worst-case count and thresholds; each has a default.
 */
export function ComputeDiscoveryDecisionMetrics(
    observations: readonly DiscoveryEvalObservation[],
    options: DiscoveryMetricOptions = {}
): DiscoveryDecisionCellMetrics {
    const resamples = options.BootstrapResamples ?? DECISION_EVAL_BOOTSTRAP_RESAMPLES;
    const seed = options.Seed ?? DECISION_EVAL_SEED;
    const usable = inCanonicalOrder(observations.filter(IsUsableDiscoveryDecisionRun));
    const scored = usable.map(toScoredRun);
    const calibrated = CalibrateDiscoveryOutOfFold(scored, options.CalibrationFolds ?? DECISION_EVAL_CALIBRATION_FOLDS, seed);
    const thresholds = options.Thresholds ?? DISCOVERY_INJECTION_THRESHOLDS;
    return {
        Arm: 'decision',
        Counts: countRuns(observations, usable),
        Top1: top1(usable, o => o.ChosenAgentId, resamples, seed),
        ConfidenceCalibration: calibrationSummary(
            scored.filter(r => r.Label === 'agent').map(r => ({ Probability: r.Confidence, Positive: r.Correct })),
            calibrated?.filter(r => r.Label === 'agent').map(r => ({ Probability: r.Confidence, Positive: r.Correct })) ?? null),
        AnyAppliesCalibration: calibrationSummary(
            scored.map(r => ({ Probability: r.AnyApplies, Positive: r.Label === 'agent' })),
            calibrated?.map(r => ({ Probability: r.AnyApplies, Positive: r.Label === 'agent' })) ?? null),
        Injection: {
            Raw: InjectionOperatingPoints(scored, thresholds),
            Calibrated: calibrated ? InjectionOperatingPoints(calibrated, thresholds) : null
        },
        Production: productionVerdict(usable),
        Repeatability: summarizeRepeatability(usable, options.WorstCaseCount ?? 10),
        Latency: {
            ...summarizeLatency(usable, o => o.LatencyMs),
            Discovery: summarizeLatency(usable, o => o.DiscoveryLatencyMs),
            WithinProductionTimeoutRate: SummarizeDiscoveryOnTime(usable).Rate
        },
        Cost: summarizeCost(usable)
    };
}

/**
 * Every metric for a `semantic-search` baseline cell, from its runs.
 *
 * @param observations The cell's runs.
 * @param options Bootstrap and seed; each has a default.
 */
export function ComputeDiscoveryBaselineMetrics(
    observations: readonly DiscoveryEvalObservation[],
    options: DiscoveryMetricOptions = {}
): DiscoveryBaselineCellMetrics {
    const usable = inCanonicalOrder(observations.filter(o => o.Arm === 'semantic-search' && o.WouldInject !== null));
    const agentRuns = usable.filter(o => o.Label === 'agent');
    const noneRuns = usable.filter(o => o.Label === 'none');
    const below = noneRuns.filter(o => o.WouldInject === false).length;
    return {
        Arm: 'semantic-search',
        Counts: countRuns(observations, usable),
        Top1: top1(usable, o => o.ChosenAgentId, options.BootstrapResamples ?? DECISION_EVAL_BOOTSTRAP_RESAMPLES, options.Seed ?? DECISION_EVAL_SEED),
        TopRankedAccuracy: ratio(agentRuns.filter(o => IsDiscoveryCorrect(o, o.TopRankedAgentId)).length, agentRuns.length),
        NoneBelowFloor: { Runs: noneRuns.length, BelowFloor: below, Rate: ratio(below, noneRuns.length) },
        NoneByKind: noneByKind(noneRuns),
        Latency: summarizeLatency(usable, o => o.LatencyMs)
    };
}

/**
 * A cell's metrics: the baseline's when its runs are a baseline's (some ran the baseline and none
 * the decision; a run that recorded no output has no arm), else the decision's.
 *
 * @param observations The cell's runs.
 * @param options The metric options.
 */
export function ComputeDiscoveryCellMetrics(
    observations: readonly DiscoveryEvalObservation[],
    options: DiscoveryMetricOptions = {}
): DiscoveryCellMetrics {
    const isBaseline = observations.some(o => o.Arm === 'semantic-search') && !observations.some(o => o.Arm === 'decision');
    return isBaseline ? ComputeDiscoveryBaselineMetrics(observations, options) : ComputeDiscoveryDecisionMetrics(observations, options);
}

/**
 * Whether a decision run is scored: it has an agent, a confidence and `anyApplies`, and did not fail
 * over in a cell that forbade it.
 *
 * @param o The run.
 */
export function IsUsableDiscoveryDecisionRun(o: DiscoveryEvalObservation): boolean {
    return o.Arm === 'decision' && o.ChosenAgentId !== null && o.Confidence !== null && o.AnyApplies !== null
        && !(o.FailedOver && !o.FailoverAllowed);
}

/** A usable decision run, reduced. */
function toScoredRun(o: DiscoveryEvalObservation): DiscoveryScoredRun {
    return {
        CaseId: o.CaseId, Label: o.Label, Correct: IsDiscoveryCorrect(o),
        Confidence: o.Confidence ?? 0, AnyApplies: o.AnyApplies ?? 0, OnTime: IsDiscoveryOnTime(o)
    };
}

/** Top-1 accuracy of an agent pick over the usable `agent` runs, with its cluster-bootstrap interval. */
function top1(
    usable: readonly DiscoveryEvalObservation[],
    pick: (o: DiscoveryEvalObservation) => string | null,
    resamples: number,
    seed: number
): DiscoveryTop1Summary {
    const agentRuns = usable.filter(o => o.Label === 'agent');
    const accuracy = (sample: readonly DiscoveryEvalObservation[]): number | null =>
        ratio(sample.filter(o => IsDiscoveryCorrect(o, pick(o))).length, sample.length);
    return { N: agentRuns.length, Accuracy: accuracy(agentRuns), AccuracyCI: CaseBootstrapInterval(agentRuns, accuracy, resamples, seed) };
}

/**
 * Each usable run with its confidence and `anyApplies` calibrated out of fold: the cases are dealt
 * into folds ({@link AssignCaseFolds}), and each fold's runs are calibrated by two Platt fits on the
 * other folds' runs only (the confidence on their `agent` runs). No run is scored by a fit that saw
 * it. Null with fewer than two cases.
 *
 * @param runs The usable runs.
 * @param folds The fold count.
 * @param seed The fold generator's seed.
 */
export function CalibrateDiscoveryOutOfFold(runs: readonly DiscoveryScoredRun[], folds: number, seed: number): DiscoveryScoredRun[] | null {
    const cases = [...groupByCase(runs)].map(([caseKey, caseRuns]) => ({ CaseId: caseKey, Label: caseRuns[0].Label }));
    if (cases.length < 2) {
        return null;
    }
    const assignment = AssignCaseFolds(cases, folds, seed);
    const foldOf = (run: DiscoveryScoredRun): number => assignment.get(run.CaseId.toUpperCase()) ?? 0;
    const calibrated = runs.map(run => ({ ...run }));
    for (const fold of new Set(assignment.values())) {
        const training = runs.filter(run => foldOf(run) !== fold);
        const confidenceFit = FitPlatt(training.filter(r => r.Label === 'agent').map(r => ({ Probability: r.Confidence, Positive: r.Correct })));
        const appliesFit = FitPlatt(training.map(r => ({ Probability: r.AnyApplies, Positive: r.Label === 'agent' })));
        runs.forEach((run, i) => {
            if (foldOf(run) === fold) {
                calibrated[i].Confidence = ApplyPlatt(run.Confidence, confidenceFit);
                calibrated[i].AnyApplies = ApplyPlatt(run.AnyApplies, appliesFit);
            }
        });
    }
    return calibrated;
}

/** A probability's raw and calibrated calibration, and its Platt fit on all the points. */
function calibrationSummary(raw: readonly LabelledProbability[], calibrated: readonly LabelledProbability[] | null): DiscoveryCalibrationSummary {
    return {
        Raw: probabilityCalibration(raw),
        Calibrated: calibrated ? probabilityCalibration(calibrated) : null,
        Platt: raw.length >= 2 ? FitPlatt(raw) : null
    };
}

/** How one set of probabilities is calibrated. */
function probabilityCalibration(points: readonly LabelledProbability[]): DiscoveryProbabilityCalibration {
    const bins = CalibrationBins(points);
    return { N: points.length, RocAuc: RocAuc(points), Brier: BrierScore(points), ECE: bins.ECE, Bins: bins.Bins };
}

/** What production's current rule did, from each run's recorded `WouldInject`, on time. */
function productionVerdict(usable: readonly DiscoveryEvalObservation[]): DiscoveryProductionVerdict {
    const agentRuns = usable.filter(o => o.Label === 'agent');
    const noneRuns = usable.filter(o => o.Label === 'none');
    const injectedAgent = agentRuns.filter(WouldInjectOnTime);
    return {
        MinConfidence: DECISION_DISCOVERY_MIN_CONFIDENCE,
        Coverage: ratio(injectedAgent.length, agentRuns.length),
        Precision: ratio(injectedAgent.filter(o => IsDiscoveryCorrect(o)).length, injectedAgent.length),
        FalseInjectionRate: ratio(noneRuns.filter(WouldInjectOnTime).length, noneRuns.length),
        NoneByKind: noneByKind(noneRuns)
    };
}

/** The `none` runs per kind, and how many were injected (on time). */
function noneByKind(noneRuns: readonly DiscoveryEvalObservation[]): Record<DiscoveryNoneKind, DiscoveryNoneKindSummary> {
    const ofKind = (kind: DiscoveryNoneKind): DiscoveryNoneKindSummary => {
        const runs = noneRuns.filter(o => o.Kind === kind);
        const injected = runs.filter(WouldInjectOnTime).length;
        return { Runs: runs.length, Injected: injected, Rate: ratio(injected, runs.length) };
    };
    return { chat: ofKind('chat'), direct: ofKind('direct'), workflow: ofKind('workflow') };
}

/** The repeatability of the cases with at least two usable runs. */
function summarizeRepeatability(usable: readonly DiscoveryEvalObservation[], worstCount: number): DiscoveryRepeatabilitySummary {
    const cases = [...groupByCase(usable).values()].filter(runs => runs.length >= 2).map(caseRepeatability);
    const worst = [...cases]
        .sort((x, y) => x.ChoiceAgreement - y.ChoiceAgreement || y.ConfidenceStdDev - x.ConfidenceStdDev || x.CaseId.localeCompare(y.CaseId))
        .slice(0, worstCount);
    return {
        Cases: cases.length,
        MeanChoiceAgreement: Mean(cases.map(c => c.ChoiceAgreement)),
        MeanConfidenceStdDev: Mean(cases.map(c => c.ConfidenceStdDev)),
        MeanAnyAppliesStdDev: Mean(cases.map(c => c.AnyAppliesStdDev)),
        MeanInjectAgreement: Mean(cases.map(c => c.InjectAgreement)),
        Worst: worst
    };
}

/** One case's repeatability from its usable runs. */
function caseRepeatability(runs: readonly DiscoveryEvalObservation[]): DiscoveryCaseRepeatability {
    const choices = new Map<string, number>();
    for (const run of runs) {
        const key = (run.ChosenAgentId ?? '').toUpperCase();
        choices.set(key, (choices.get(key) ?? 0) + 1);
    }
    const injected = runs.filter(WouldInjectOnTime).length;
    return {
        CaseId: runs[0].CaseId,
        Repeats: runs.length,
        ChoiceAgreement: Math.max(...choices.values()) / runs.length,
        ConfidenceStdDev: PopulationStdDev(runs.map(r => r.Confidence ?? 0)) ?? 0,
        AnyAppliesStdDev: PopulationStdDev(runs.map(r => r.AnyApplies ?? 0)) ?? 0,
        InjectAgreement: Math.max(injected, runs.length - injected) / runs.length
    };
}

/** The run counts. */
function countRuns(observations: readonly DiscoveryEvalObservation[], usable: readonly DiscoveryEvalObservation[]): DiscoveryRunCounts {
    const scored = new Set(usable);
    return {
        Runs: observations.length,
        UsableRuns: usable.length,
        NoAnswerRuns: observations.filter(o => !scored.has(o) && !(o.FailedOver && !o.FailoverAllowed)).length,
        FailoverRuns: observations.filter(o => o.FailedOver).length,
        ExcludedFailoverRuns: observations.filter(o => o.FailedOver && !o.FailoverAllowed).length,
        LabelledAgentNotOffered: usable.filter(o => o.Label === 'agent' && o.LabelledAgentOffered === false).length
    };
}

/** Latency percentiles of one timing, over the usable runs that recorded it. */
function summarizeLatency(usable: readonly DiscoveryEvalObservation[], timing: (o: DiscoveryEvalObservation) => number | null): LatencySummary {
    const latencies = usable.map(timing).filter((l): l is number => l !== null);
    return { Runs: latencies.length, P50: Quantile(latencies, 0.5), P95: Quantile(latencies, 0.95) };
}

/**
 * How many runs finished within production's discovery timeout, of those whose timing was recorded.
 *
 * @param runs The runs: a cell's usable decision runs, or one answering model's.
 */
export function SummarizeDiscoveryOnTime(runs: readonly Pick<DiscoveryEvalObservation, 'WithinProductionTimeout'>[]): DiscoveryOnTimeSummary {
    const recorded = runs.filter(o => o.WithinProductionTimeout !== null);
    const onTime = recorded.filter(o => o.WithinProductionTimeout === true).length;
    return { Runs: recorded.length, OnTime: onTime, Rate: ratio(onTime, recorded.length) };
}

/** Mean cost per thousand answered decisions, over the usable runs that recorded a cost. */
function summarizeCost(usable: readonly DiscoveryEvalObservation[]): CostSummary {
    const costs = usable.map(o => o.CostUSD).filter((c): c is number => c !== null);
    const mean = Mean(costs);
    return { RunsWithCost: costs.length, CostPer1kUSD: mean === null ? null : mean * 1000 };
}

/** Runs grouped by case, in case-ID order, so nothing downstream depends on the order runs were read in. */
function groupByCase<T extends { CaseId: string }>(runs: readonly T[]): Map<string, T[]> {
    const cases = new Map<string, T[]>();
    for (const run of runs) {
        const key = run.CaseId.toUpperCase();
        cases.set(key, [...(cases.get(key) ?? []), run]);
    }
    return new Map([...cases].sort(([x], [y]) => compareIds(x, y)));
}

/** Orders two IDs by code unit: the same order in every locale. */
function compareIds(x: string, y: string): number {
    return x < y ? -1 : x > y ? 1 : 0;
}

/** Orders two optional numbers, a missing one first. */
function compareNumbers(x: number | null, y: number | null): number {
    return x === y ? 0 : x === null ? -1 : y === null ? 1 : x - y;
}

/**
 * The runs in a canonical order: by case ID, then by what each run recorded. Nothing downstream then
 * depends on the order they were read in: not the folds or the bootstrap draws, which pick by
 * position, and not a floating-point sum, whose last bits depend on its order.
 */
function inCanonicalOrder(observations: readonly DiscoveryEvalObservation[]): DiscoveryEvalObservation[] {
    return [...observations].sort((x, y) =>
        compareIds(x.CaseId.toUpperCase(), y.CaseId.toUpperCase())
        || compareNumbers(x.Confidence, y.Confidence)
        || compareNumbers(x.AnyApplies, y.AnyApplies)
        || compareIds((x.ChosenAgentId ?? '').toUpperCase(), (y.ChosenAgentId ?? '').toUpperCase())
        || compareNumbers(x.DiscoveryLatencyMs, y.DiscoveryLatencyMs)
        || compareNumbers(x.LatencyMs, y.LatencyMs)
        || compareNumbers(x.CostUSD, y.CostUSD));
}

/** A ratio, or null when the denominator is zero. */
function ratio(numerator: number, denominator: number): number | null {
    return denominator === 0 ? null : numerator / denominator;
}

/** A Fisher-Yates shuffle with the given generator. */
function shuffle<T>(items: T[], random: () => number): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
