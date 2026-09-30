/**
 * metrics.ts — how well the finishIf gate would have done on the replayed rounds.
 *
 * Definitions, per arm:
 * - A rep's **gate score** is the minimum probability over the round's questions, which is what
 *   `JudgeFinishIf` gates on: every question reaches the threshold exactly when the minimum does. A
 *   rep is **usable** when every question has a numeric probability.
 * - A round's score is the mean of its usable reps' scores, as the Decision Eval harness scores a
 *   case. A round with no usable rep never passes.
 * - At a threshold, a round **passes** when its score reaches it. The **skippable share** is the share
 *   of `finish` rounds that pass; the **false-finish rate** is the share of `continue` rounds that
 *   pass; the **precision** is the share of passes that are `finish`.
 * - **Net savings per 1,000 rounds**: the label turn's latency and cost over the passing `finish`
 *   rounds, less the gate's own latency and cost over every decided round (the gate runs on each), per
 *   1,000 decided rounds. A false finish saves nothing: it ends a run that had work left.
 * - AUC takes `finish` as the positive class. Its interval resamples agent runs, not rounds, since
 *   the rounds of one run are not independent.
 *
 * The statistics themselves are the Decision Eval harness's (`@memberjunction/testing-engine`).
 */
import { DEFAULT_LOOP_AGENT_PROMPT_PARAMS } from '@memberjunction/ai-agents';
import {
    BootstrapInterval,
    CalibrationBins,
    FitPlatt,
    OutOfFoldPlatt,
    Quantile,
    RocAuc,
    SummarizeRepeatability,
    type ConfidenceInterval,
    type LabelledProbability
} from '@memberjunction/testing-engine';
import type { FinishIfReplayArm, FinishIfReplayLabel, GateObservation, LabelCounts, ReplayRound, RoundSavings } from './types';

/** The threshold production gates on. */
export const FINISH_IF_PRODUCTION_THRESHOLD = DEFAULT_LOOP_AGENT_PROMPT_PARAMS.finishIfThreshold;

/** The thresholds the sweep reports: 0.50 to 0.95 in steps of 0.05. */
export const FINISH_IF_SWEEP_THRESHOLDS: readonly number[] = Array.from({ length: 10 }, (_, i) => Math.round((0.5 + 0.05 * i) * 100) / 100);

/** The model name the all-models Platt fit is reported under. */
export const ALL_MODELS = 'All models';

/** A round's decisions in one arm, reduced to what the metrics read. */
export interface RoundOutcome {
    RoundId: string;
    AgentRunID: string;
    Label: FinishIfReplayLabel;
    /** The mean of the usable reps' gate scores; null when no rep is usable. */
    Score: number | null;
    Reps: number;
    UsableReps: number;
    /** The reps `JudgeFinishIf` passed at the production threshold. */
    Passes: number;
    /** The mean latency of the round's decision calls. */
    GateLatencyMs: number;
    /** The mean cost of the round's decision calls that have one; null when none has. */
    GateCostUSD: number | null;
    Savings: RoundSavings;
}

/** The gate at one threshold. */
export interface SweepRow {
    Threshold: number;
    Passes: number;
    FinishPasses: number;
    ContinuePasses: number;
    SkippableShare: number | null;
    FalseFinishRate: number | null;
    Precision: number | null;
    NetLatencySavedMsPer1k: number | null;
    NetCostSavedUSDPer1k: number | null;
    /** Tokens of the skipped `finish` turns, per 1,000 decided rounds; the gate's own are not netted. */
    TokensSavedPer1k: number | null;
}

/** A Platt fit on all of one answering model's points, for production to apply. */
export interface ModelPlattFit {
    Model: string;
    Points: number;
    Finish: number;
    Continue: number;
    /** Null unless the model has both classes. */
    A: number | null;
    B: number | null;
    Converged: boolean | null;
}

/** The production verdicts across every rep, as `JudgeFinishIf` gave them. A failed call is a fail. */
export interface PerRepVerdicts {
    Threshold: number;
    FinishReps: number;
    FinishPasses: number;
    ContinueReps: number;
    ContinuePasses: number;
    SkippableShare: number | null;
    FalseFinishRate: number | null;
}

/** How often a round's verdict repeats across reps. */
export interface VerdictRepeatability {
    /** Rounds with at least two reps. */
    Rounds: number;
    /** Per round, the share of reps agreeing with its majority verdict, averaged. */
    MeanVerdictAgreement: number | null;
    /** The share of rounds whose reps all gave the same verdict. */
    UnanimousShare: number | null;
    /** Per round, the standard deviation of its usable reps' scores, averaged. */
    MeanScoreStdDev: number | null;
}

/** What the gate itself costs. */
export interface GateCostSummary {
    LatencyP50Ms: number | null;
    LatencyP95Ms: number | null;
    LatencyMsPer1k: number | null;
    CostUSDPer1k: number | null;
    /** Decision calls whose cost could not be read back. */
    CallsWithoutCost: number;
}

/** The production threshold, called out. */
export interface ProductionCallout {
    Threshold: number;
    Raw: SweepRow;
    Calibrated: SweepRow | null;
    PerRep: PerRepVerdicts;
}

/** Every metric of one arm. */
export interface ArmMetrics {
    Arm: FinishIfReplayArm;
    /** Rounds with at least one decision call. */
    Rounds: number;
    ScoredRounds: number;
    Labels: LabelCounts;
    Calls: number;
    FailedCalls: number;
    UnusableReps: number;
    Auc: number | null;
    AucCI: ConfidenceInterval | null;
    CalibratedAuc: number | null;
    Ece: number | null;
    CalibratedEce: number | null;
    Gate: GateCostSummary;
    Sweep: SweepRow[];
    CalibratedSweep: SweepRow[] | null;
    Platt: ModelPlattFit[];
    Production: ProductionCallout;
    Repeatability: VerdictRepeatability;
}

/** The knobs of the metrics. */
export interface ArmMetricOptions {
    Seed: number;
    BootstrapResamples: number;
    CalibrationFolds: number;
    Thresholds: readonly number[];
    ProductionThreshold: number;
}

function mean(values: readonly number[]): number | null {
    return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function ratio(numerator: number, denominator: number): number | null {
    return denominator === 0 ? null : numerator / denominator;
}

function per1k(total: number, rounds: number): number | null {
    return rounds === 0 ? null : (total / rounds) * 1000;
}

/**
 * The gate score of one decision: the minimum probability over the questions asked, or null unless
 * every question has a finite probability.
 *
 * @param probabilities The answered probabilities, by question key.
 * @param questionKeys The keys of the questions asked.
 */
export function GateScore(probabilities: Record<string, number>, questionKeys: readonly string[]): number | null {
    if (questionKeys.length === 0) {
        return null;
    }
    const values = questionKeys.map(key => probabilities[key]);
    return values.every(v => typeof v === 'number' && Number.isFinite(v)) ? Math.min(...values) : null;
}

/** One round's reps reduced to its outcome. */
function roundOutcome(round: Pick<ReplayRound, 'RoundId' | 'AgentRunID' | 'Label'>, reps: readonly GateObservation[], savings: RoundSavings): RoundOutcome {
    const scores = reps.map(r => r.Score).filter((s): s is number => s !== null);
    const costs = reps.map(r => r.CostUSD).filter((c): c is number => c !== null);
    return {
        RoundId: round.RoundId,
        AgentRunID: round.AgentRunID,
        Label: round.Label,
        Score: mean(scores),
        Reps: reps.length,
        UsableReps: scores.length,
        Passes: reps.filter(r => r.Passed).length,
        GateLatencyMs: mean(reps.map(r => r.LatencyMs)) ?? 0,
        GateCostUSD: mean(costs),
        Savings: savings
    };
}

/**
 * Each round's outcome in one arm, for the rounds with at least one observation, in round order.
 *
 * @param rounds The rounds.
 * @param observations The arm's observations.
 * @param savings Each round's savings, by round ID.
 */
export function SummarizeRoundOutcomes(
    rounds: ReadonlyArray<Pick<ReplayRound, 'RoundId' | 'AgentRunID' | 'Label'>>,
    observations: readonly GateObservation[],
    savings: ReadonlyMap<string, RoundSavings>
): RoundOutcome[] {
    const byRound = groupBy(observations, o => o.RoundId);
    const none: RoundSavings = { LatencyMs: null, CostUSD: null, Tokens: null };
    return rounds
        .filter(round => (byRound.get(round.RoundId)?.length ?? 0) > 0)
        .map(round => roundOutcome(round, byRound.get(round.RoundId) ?? [], savings.get(round.RoundId) ?? none));
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const group = groups.get(key(item)) ?? [];
        group.push(item);
        groups.set(key(item), group);
    }
    return groups;
}

/**
 * The gate at one threshold.
 *
 * @param outcomes The decided rounds.
 * @param scores Each round's score, aligned with `outcomes`; null never passes.
 * @param threshold The threshold.
 */
export function SweepRowAt(outcomes: readonly RoundOutcome[], scores: ReadonlyArray<number | null>, threshold: number): SweepRow {
    const passing = outcomes.filter((_, i) => { const s = scores[i]; return s !== null && s >= threshold; });
    const finishPassing = passing.filter(o => o.Label === 'finish');
    const finish = outcomes.filter(o => o.Label === 'finish').length;
    const gateLatency = outcomes.reduce((sum, o) => sum + o.GateLatencyMs, 0);
    const gateCost = outcomes.reduce((sum, o) => sum + (o.GateCostUSD ?? 0), 0);
    const savedLatency = finishPassing.reduce((sum, o) => sum + (o.Savings.LatencyMs ?? 0), 0);
    const savedCost = finishPassing.reduce((sum, o) => sum + (o.Savings.CostUSD ?? 0), 0);
    return {
        Threshold: threshold,
        Passes: passing.length,
        FinishPasses: finishPassing.length,
        ContinuePasses: passing.length - finishPassing.length,
        SkippableShare: ratio(finishPassing.length, finish),
        FalseFinishRate: ratio(passing.length - finishPassing.length, outcomes.length - finish),
        Precision: ratio(finishPassing.length, passing.length),
        NetLatencySavedMsPer1k: per1k(savedLatency - gateLatency, outcomes.length),
        NetCostSavedUSDPer1k: per1k(savedCost - gateCost, outcomes.length),
        TokensSavedPer1k: per1k(finishPassing.reduce((sum, o) => sum + (o.Savings.Tokens ?? 0), 0), outcomes.length)
    };
}

/** The gate at each threshold. */
export function SweepThresholds(outcomes: readonly RoundOutcome[], scores: ReadonlyArray<number | null>, thresholds: readonly number[]): SweepRow[] {
    return thresholds.map(threshold => SweepRowAt(outcomes, scores, threshold));
}

/** A labelled point per scored round, with the run it belongs to. */
function scoredPoints(outcomes: readonly RoundOutcome[]): Array<{ Point: LabelledProbability; AgentRunID: string; Index: number }> {
    return outcomes.flatMap((o, index) => o.Score === null
        ? []
        : [{ Point: { Probability: o.Score, Positive: o.Label === 'finish' }, AgentRunID: o.AgentRunID, Index: index }]);
}

/**
 * A percentile bootstrap interval for the AUC that resamples clusters (agent runs) rather than
 * points. `BootstrapInterval` draws one stand-in per cluster; the statistic expands each drawn
 * stand-in to its cluster's points.
 *
 * @param points The points, each with its cluster.
 * @param resamples How many resamples.
 * @param seed The generator's seed.
 */
export function ClusteredAucInterval(
    points: ReadonlyArray<{ Point: LabelledProbability; Cluster: string }>,
    resamples: number,
    seed: number
): ConfidenceInterval | null {
    const members = new Map<LabelledProbability, LabelledProbability[]>();
    for (const cluster of groupBy(points, p => p.Cluster).values()) {
        members.set({ ...cluster[0].Point }, cluster.map(p => p.Point));
    }
    const standIns = [...members.keys()];
    return BootstrapInterval(standIns, sample => RocAuc(sample.flatMap(standIn => members.get(standIn) ?? [])), resamples, seed);
}

/** A Platt fit on the given points, or nulls unless both classes are present. */
function plattFit(model: string, points: readonly LabelledProbability[]): ModelPlattFit {
    const finish = points.filter(p => p.Positive).length;
    const base = { Model: model, Points: points.length, Finish: finish, Continue: points.length - finish };
    if (finish === 0 || finish === points.length) {
        return { ...base, A: null, B: null, Converged: null };
    }
    const fit = FitPlatt(points);
    return { ...base, A: fit.A, B: fit.B, Converged: fit.Converged };
}

/**
 * Platt fits on all points, per answering model and for all models together. A model's point for a
 * round is the mean of that model's usable reps of it.
 *
 * @param outcomes The decided rounds.
 * @param observations The arm's observations.
 */
export function FitPlattByModel(outcomes: readonly RoundOutcome[], observations: readonly GateObservation[]): ModelPlattFit[] {
    const labels = new Map(outcomes.map(o => [o.RoundId, o.Label] as const));
    const usable = observations.filter(o => o.Score !== null && o.ModelName !== null && labels.has(o.RoundId));
    const fits: ModelPlattFit[] = [];
    for (const [model, modelObservations] of [...groupBy(usable, o => o.ModelName ?? '')].sort(([a], [b]) => a.localeCompare(b))) {
        const points = [...groupBy(modelObservations, o => o.RoundId)].map(([roundId, reps]) => ({
            Probability: mean(reps.map(r => r.Score ?? 0)) ?? 0,
            Positive: labels.get(roundId) === 'finish'
        }));
        fits.push(plattFit(model, points));
    }
    fits.push(plattFit(ALL_MODELS, scoredPoints(outcomes).map(p => p.Point)));
    return fits;
}

/** The production verdicts across every rep. */
export function PerRepVerdictsOf(outcomes: readonly RoundOutcome[], observations: readonly GateObservation[], threshold: number): PerRepVerdicts {
    const labels = new Map(outcomes.map(o => [o.RoundId, o.Label] as const));
    const finish = observations.filter(o => labels.get(o.RoundId) === 'finish');
    const cont = observations.filter(o => labels.get(o.RoundId) === 'continue');
    const finishPasses = finish.filter(o => o.Passed).length;
    const continuePasses = cont.filter(o => o.Passed).length;
    return {
        Threshold: threshold,
        FinishReps: finish.length,
        FinishPasses: finishPasses,
        ContinueReps: cont.length,
        ContinuePasses: continuePasses,
        SkippableShare: ratio(finishPasses, finish.length),
        FalseFinishRate: ratio(continuePasses, cont.length)
    };
}

/** How often each round's production verdict repeats across its reps. */
export function VerdictRepeatabilityOf(observations: readonly GateObservation[], threshold: number): VerdictRepeatability {
    const repeated = [...groupBy(observations, o => o.RoundId).values()].filter(reps => reps.length >= 2);
    const agreements = repeated.map(reps => {
        const passes = reps.filter(r => r.Passed).length;
        return Math.max(passes, reps.length - passes) / reps.length;
    });
    const scores = new Map(repeated.map(reps => [reps[0].RoundId, reps.map(r => r.Score).filter((s): s is number => s !== null)] as const));
    return {
        Rounds: repeated.length,
        MeanVerdictAgreement: mean(agreements),
        UnanimousShare: ratio(agreements.filter(a => a === 1).length, agreements.length),
        MeanScoreStdDev: SummarizeRepeatability(scores, threshold, 0).MeanStdDev
    };
}

/** What the gate itself costs, from every decision call. */
export function GateCostSummaryOf(outcomes: readonly RoundOutcome[], observations: readonly GateObservation[]): GateCostSummary {
    const latencies = observations.map(o => o.LatencyMs);
    return {
        LatencyP50Ms: Quantile(latencies, 0.5),
        LatencyP95Ms: Quantile(latencies, 0.95),
        LatencyMsPer1k: per1k(outcomes.reduce((sum, o) => sum + o.GateLatencyMs, 0), outcomes.length),
        CostUSDPer1k: per1k(outcomes.reduce((sum, o) => sum + (o.GateCostUSD ?? 0), 0), outcomes.length),
        CallsWithoutCost: observations.filter(o => o.CostUSD === null).length
    };
}

/** Out-of-fold calibrated scores aligned with `outcomes`, or null with too few scored rounds. */
function calibratedScores(outcomes: readonly RoundOutcome[], options: ArmMetricOptions): Array<number | null> | null {
    const scored = scoredPoints(outcomes);
    const calibrated = OutOfFoldPlatt(scored.map(s => s.Point), options.CalibrationFolds, options.Seed);
    if (!calibrated) {
        return null;
    }
    const scores: Array<number | null> = outcomes.map(() => null);
    scored.forEach((s, i) => { scores[s.Index] = calibrated[i]; });
    return scores;
}

/** AUC and ECE of some scores aligned with `outcomes`. */
function discrimination(outcomes: readonly RoundOutcome[], scores: ReadonlyArray<number | null>): { Auc: number | null; Ece: number | null } {
    const points = outcomes.flatMap((o, i) => { const s = scores[i]; return s === null ? [] : [{ Probability: s, Positive: o.Label === 'finish' }]; });
    return { Auc: RocAuc(points), Ece: points.length === 0 ? null : CalibrationBins(points).ECE };
}

function labelCounts(outcomes: readonly RoundOutcome[]): LabelCounts {
    const finish = outcomes.filter(o => o.Label === 'finish').length;
    return { Finish: finish, Continue: outcomes.length - finish };
}

/**
 * Every metric of one arm.
 *
 * @param arm The arm.
 * @param outcomes Its decided rounds, from {@link SummarizeRoundOutcomes}.
 * @param observations Its observations.
 * @param options The knobs.
 */
export function ComputeArmMetrics(
    arm: FinishIfReplayArm,
    outcomes: readonly RoundOutcome[],
    observations: readonly GateObservation[],
    options: ArmMetricOptions
): ArmMetrics {
    const raw = outcomes.map(o => o.Score);
    const calibrated = calibratedScores(outcomes, options);
    const rawFit = discrimination(outcomes, raw);
    const calibratedFit = calibrated ? discrimination(outcomes, calibrated) : { Auc: null, Ece: null };
    const sweep = SweepThresholds(outcomes, raw, options.Thresholds);
    const calibratedSweep = calibrated ? SweepThresholds(outcomes, calibrated, options.Thresholds) : null;
    const clustered = scoredPoints(outcomes).map(s => ({ Point: s.Point, Cluster: s.AgentRunID }));
    return {
        Arm: arm,
        Rounds: outcomes.length,
        ScoredRounds: clustered.length,
        Labels: labelCounts(outcomes),
        Calls: observations.length,
        FailedCalls: observations.filter(o => !o.CallSucceeded).length,
        UnusableReps: observations.filter(o => o.Score === null).length,
        Auc: rawFit.Auc,
        AucCI: ClusteredAucInterval(clustered, options.BootstrapResamples, options.Seed),
        CalibratedAuc: calibratedFit.Auc,
        Ece: rawFit.Ece,
        CalibratedEce: calibratedFit.Ece,
        Gate: GateCostSummaryOf(outcomes, observations),
        Sweep: sweep,
        CalibratedSweep: calibratedSweep,
        Platt: FitPlattByModel(outcomes, observations),
        Production: {
            Threshold: options.ProductionThreshold,
            Raw: SweepRowAt(outcomes, raw, options.ProductionThreshold),
            Calibrated: calibrated ? SweepRowAt(outcomes, calibrated, options.ProductionThreshold) : null,
            PerRep: PerRepVerdictsOf(outcomes, observations, options.ProductionThreshold)
        },
        Repeatability: VerdictRepeatabilityOf(observations, options.ProductionThreshold)
    };
}
