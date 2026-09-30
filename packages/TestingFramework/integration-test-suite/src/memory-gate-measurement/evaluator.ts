/**
 * @fileoverview Metrics computation, out-of-fold Platt calibration, scenario-clustered
 * bootstrap confidence intervals, and evaluation for the memory note decision gate measurement.
 *
 * @module @memberjunction/integration-test-suite
 */

import { MEMORY_NOTE_MIN_PROBABILITY } from '@memberjunction/ai-agents';
import {
    ApplyPlatt,
    CreateSeededRandom,
    FitPlatt,
    Quantile,
    RocAuc,
    type LabelledProbability
} from '@memberjunction/testing-engine';
import type {
    ArmEvaluationResult,
    CorpusLabel,
    DecisionObservation,
    MeasurementExclusions,
    MeasurementReportJson,
    OperatingThresholdMetrics
} from './corpus-types';

export const DECISION_SWEEP_THRESHOLDS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90];
export const CONFIDENCE_SWEEP_THRESHOLDS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

export interface EvaluatedNote {
    ScenarioId: string;
    NoteId: string;
    Label: CorpusLabel;
    IsDurable: boolean;
    SelfConfidence: number;
    DecisionRawProbability: number;
    DecisionCalibratedProbability?: number;
    ModelName: string;
}

/**
 * Computes operating point threshold metrics for an arm.
 */
export function ComputeOperatingThresholdMetrics<T extends EvaluatedNote>(
    notes: readonly T[],
    threshold: number,
    getScore: (note: T) => number
): OperatingThresholdMetrics {
    const totalByLabel: Record<CorpusLabel, number> = {
        durable: 0,
        ephemeral: 0,
        wrong: 0,
        speculative: 0
    };
    const keptByLabel: Record<CorpusLabel, number> = {
        durable: 0,
        ephemeral: 0,
        wrong: 0,
        speculative: 0
    };

    let totalKept = 0;
    let durableKept = 0;
    let totalDurable = 0;

    for (const note of notes) {
        totalByLabel[note.Label]++;
        if (note.IsDurable) totalDurable++;

        const score = getScore(note);
        if (score >= threshold) {
            totalKept++;
            keptByLabel[note.Label]++;
            if (note.IsDurable) durableKept++;
        }
    }

    const precision = totalKept > 0 ? durableKept / totalKept : null;
    const recall = totalDurable > 0 ? durableKept / totalDurable : null;
    const f1 = (precision !== null && recall !== null && (precision + recall) > 0)
        ? (2 * precision * recall) / (precision + recall)
        : null;

    const keptShareByLabel: Record<CorpusLabel, number> = {
        durable: totalByLabel.durable > 0 ? keptByLabel.durable / totalByLabel.durable : 0,
        ephemeral: totalByLabel.ephemeral > 0 ? keptByLabel.ephemeral / totalByLabel.ephemeral : 0,
        wrong: totalByLabel.wrong > 0 ? keptByLabel.wrong / totalByLabel.wrong : 0,
        speculative: totalByLabel.speculative > 0 ? keptByLabel.speculative / totalByLabel.speculative : 0
    };

    return {
        Threshold: threshold,
        Precision: precision,
        Recall: recall,
        F1: f1,
        KeptShareByLabel: keptShareByLabel
    };
}

/**
 * Resamples scenarios with replacement to compute bootstrap confidence interval for AUC.
 */
export function ScenarioBootstrapAuc(
    scenarios: ReadonlyArray<{ ScenarioId: string; Notes: ReadonlyArray<LabelledProbability> }>,
    resamples: number = 1000,
    seed: number = 20260929
): { Low: number; High: number } | null {
    if (scenarios.length === 0) return null;
    const rand = CreateSeededRandom(seed);
    const aucScores: number[] = [];

    for (let r = 0; r < resamples; r++) {
        const sampleNotes: LabelledProbability[] = [];
        for (let s = 0; s < scenarios.length; s++) {
            const chosenIdx = Math.floor(rand() * scenarios.length);
            const scenario = scenarios[chosenIdx];
            for (const n of scenario.Notes) {
                sampleNotes.push(n);
            }
        }
        const auc = RocAuc(sampleNotes);
        if (auc !== null) {
            aucScores.push(auc);
        }
    }

    if (aucScores.length === 0) return null;
    aucScores.sort((a, b) => a - b);

    const low = Quantile(aucScores, 0.025);
    const high = Quantile(aucScores, 0.975);
    return (low !== null && high !== null) ? { Low: low, High: high } : null;
}

/** A labelled probability and the scenario (conversation) it came from. */
export interface ScenarioPoint {
    ScenarioId: string;
    Point: LabelledProbability;
}

/**
 * Out-of-fold Platt calibration with whole scenarios dealt into folds, so no fold is calibrated on
 * notes from its own conversations. The scenarios are shuffled with a seeded generator and dealt in
 * turn; each fold is calibrated by the shared `FitPlatt` on the others, through the shared
 * `ApplyPlatt`. Returns the calibrated probabilities in the input's order, or null with fewer than
 * two scenarios, when nothing can be held out.
 *
 * @param points The points, each with its scenario.
 * @param folds The fold count.
 * @param seed The generator's seed.
 */
export function OutOfFoldPlattByScenario(points: readonly ScenarioPoint[], folds: number = 5, seed: number = 20260929): number[] | null {
    const scenarios = [...new Set(points.map(p => p.ScenarioId))];
    if (scenarios.length < 2) {
        return null;
    }
    const rand = CreateSeededRandom(seed);
    for (let i = scenarios.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [scenarios[i], scenarios[j]] = [scenarios[j], scenarios[i]];
    }
    const foldCount = Math.max(2, Math.min(folds, scenarios.length));
    const foldOf = new Map(scenarios.map((id, i) => [id, i % foldCount] as const));
    const calibrated = new Array<number>(points.length);
    for (let fold = 0; fold < foldCount; fold++) {
        const fit = FitPlatt(points.filter(p => foldOf.get(p.ScenarioId) !== fold).map(p => p.Point));
        points.forEach((p, i) => {
            if (foldOf.get(p.ScenarioId) === fold) {
                calibrated[i] = ApplyPlatt(p.Point.Probability, fit);
            }
        });
    }
    return calibrated;
}

/**
 * Per note, the share of its reps whose verdict agrees with the majority, averaged over the notes
 * with at least two answered reps. Only answered reps count: a failed or missing answer has no verdict.
 *
 * @param observations Every rep's observations.
 * @param keeps The verdict: whether a model's raw probability keeps the note.
 */
export function ComputeRepeatabilityAgreement(
    observations: readonly DecisionObservation[],
    keeps: (rawProbability: number, modelName: string) => boolean
): number | null {
    const byNote = new Map<string, boolean[]>();
    for (const obs of observations) {
        if (obs.Outcome === 'answered' && obs.RawProbability !== null) {
            byNote.set(obs.NoteId, [...(byNote.get(obs.NoteId) ?? []), keeps(obs.RawProbability, obs.ModelName)]);
        }
    }
    const agreements = [...byNote.values()]
        .filter(verdicts => verdicts.length > 1)
        .map(verdicts => {
            const kept = verdicts.filter(Boolean).length;
            return Math.max(kept, verdicts.length - kept) / verdicts.length;
        });
    return agreements.length > 0 ? agreements.reduce((sum, a) => sum + a, 0) / agreements.length : null;
}

/**
 * The shipped verdict: the answering model's Platt fit on all points, kept at a calibrated
 * {@link MEMORY_NOTE_MIN_PROBABILITY}. A model with no fit has no shipped verdict, so it never keeps.
 *
 * @param fits Each model's fit on all points.
 * @param threshold The calibrated probability at which a note is kept.
 */
export function ShippedVerdict(
    fits: Readonly<Record<string, { A: number; B: number }>>,
    threshold: number = MEMORY_NOTE_MIN_PROBABILITY
): (rawProbability: number, modelName: string) => boolean {
    return (rawProbability, modelName) => {
        const fit = fits[modelName];
        return !!fit && ApplyPlatt(rawProbability, fit) >= threshold;
    };
}

/** How many calls failed and how many answers were missing, from every rep's observations. */
export function CountDecisionFailures(observations: readonly DecisionObservation[]): Pick<MeasurementExclusions, 'FailedCalls' | 'NoAnswer'> {
    const failedCalls = new Set(observations.filter(o => o.Outcome === 'call-failed').map(o => `${o.ScenarioId}|${o.Rep}`));
    return { FailedCalls: failedCalls.size, NoAnswer: observations.filter(o => o.Outcome === 'no-answer').length };
}

/**
 * Summarizes latency quantiles and cost per 1,000 notes.
 */
export function SummarizeTelemetry(
    observations: ReadonlyArray<Pick<DecisionObservation, 'LatencyMs' | 'CostUsd'>>
): {
    latencyP50Ms: number | null;
    latencyP95Ms: number | null;
    costPerThousandUsd: number | null;
} {
    if (observations.length === 0) {
        return { latencyP50Ms: null, latencyP95Ms: null, costPerThousandUsd: null };
    }

    const latencies = observations.map(o => o.LatencyMs).sort((a, b) => a - b);
    const p50 = Quantile(latencies, 0.5);
    const p95 = Quantile(latencies, 0.95);

    const totalCost = observations.reduce((sum, o) => sum + o.CostUsd, 0);
    const costPerThousand = (totalCost / observations.length) * 1000;

    return {
        latencyP50Ms: p50,
        latencyP95Ms: p95,
        costPerThousandUsd: costPerThousand
    };
}

/**
 * Performs complete evaluation of measurement observations against baseline self-confidence.
 */
export function EvaluateMemoryGateMeasurement(
    evaluatedNotes: readonly EvaluatedNote[],
    observations: readonly DecisionObservation[],
    reps: number,
    excluded: Pick<MeasurementExclusions, 'UnscoredNotes' | 'UnlabelledNotes'> = { UnscoredNotes: 0, UnlabelledNotes: 0 }
): MeasurementReportJson {
    const labelDistribution: Record<CorpusLabel, number> = {
        durable: 0,
        ephemeral: 0,
        wrong: 0,
        speculative: 0
    };
    for (const n of evaluatedNotes) {
        labelDistribution[n.Label]++;
    }

    // 1. Self-confidence Arm
    const confPoints: LabelledProbability[] = evaluatedNotes.map(n => ({
        Probability: n.SelfConfidence / 100,
        Positive: n.IsDurable
    }));
    const confAuc = RocAuc(confPoints);
    const confOperatingPoints = CONFIDENCE_SWEEP_THRESHOLDS.map(th =>
        ComputeOperatingThresholdMetrics(evaluatedNotes, th, n => n.SelfConfidence)
    );

    // 2. Decision Raw Arm
    const rawPoints: LabelledProbability[] = evaluatedNotes.map(n => ({
        Probability: n.DecisionRawProbability,
        Positive: n.IsDurable
    }));
    const rawAuc = RocAuc(rawPoints);
    const byScenarioMap = new Map<string, LabelledProbability[]>();
    for (const n of evaluatedNotes) {
        const arr = byScenarioMap.get(n.ScenarioId) || [];
        arr.push({ Probability: n.DecisionRawProbability, Positive: n.IsDurable });
        byScenarioMap.set(n.ScenarioId, arr);
    }
    const scenarios = Array.from(byScenarioMap.entries()).map(([scenarioId, notes]) => ({
        ScenarioId: scenarioId,
        Notes: notes
    }));
    const rawBootstrapCi = ScenarioBootstrapAuc(scenarios);
    const rawOperatingPoints = DECISION_SWEEP_THRESHOLDS.map(th =>
        ComputeOperatingThresholdMetrics(evaluatedNotes, th, n => n.DecisionRawProbability)
    );

    // 3. Platt Fit & Out-Of-Fold Calibration
    const models = Array.from(new Set(evaluatedNotes.map(n => n.ModelName)));
    const fittedPlattByModel: Record<string, { A: number; B: number }> = {};
    for (const m of models) {
        const modelNotes = rawPoints.filter((_, idx) => evaluatedNotes[idx].ModelName === m);
        if (modelNotes.length > 0) {
            const fit = FitPlatt(modelNotes);
            fittedPlattByModel[m] = { A: fit.A, B: fit.B };
        }
    }

    // 4. Out-of-fold calibration, whole scenarios per fold; with too few scenarios there is no
    //    calibrated arm, rather than raw probabilities reported as calibrated.
    const oofProbabilities = OutOfFoldPlattByScenario(
        evaluatedNotes.map((n, idx) => ({ ScenarioId: n.ScenarioId, Point: rawPoints[idx] }))
    );
    const calibratedArm = oofProbabilities
        ? calibratedArmOf(evaluatedNotes.map((n, idx) => ({ ...n, DecisionCalibratedProbability: oofProbabilities[idx] })))
        : { Name: 'decision-calibrated' as const, Auc: null, AucBootstrapCi: null, OperatingPoints: [] };

    const telemetry = SummarizeTelemetry(observations);
    const repeatability = ComputeRepeatabilityAgreement(observations, ShippedVerdict(fittedPlattByModel));

    return {
        GeneratedAt: new Date().toISOString(),
        ScenarioCount: scenarios.length,
        NoteCount: evaluatedNotes.length,
        LabelDistribution: labelDistribution,
        Models: models,
        Reps: reps,
        FittedPlattByModel: fittedPlattByModel,
        SelfConfidenceArm: {
            Name: 'self-confidence',
            Auc: confAuc,
            OperatingPoints: confOperatingPoints
        },
        DecisionRawArm: {
            Name: 'decision-raw',
            Auc: rawAuc,
            AucBootstrapCi: rawBootstrapCi,
            OperatingPoints: rawOperatingPoints
        },
        DecisionCalibratedArm: calibratedArm,
        Latency: {
            P50Ms: telemetry.latencyP50Ms,
            P95Ms: telemetry.latencyP95Ms
        },
        CostPerThousandNotesUsd: telemetry.costPerThousandUsd,
        RepeatabilityAgreement: repeatability,
        RepeatabilityThreshold: MEMORY_NOTE_MIN_PROBABILITY,
        Exclusions: { ...CountDecisionFailures(observations), UnscoredNotes: excluded.UnscoredNotes, UnlabelledNotes: excluded.UnlabelledNotes }
    };
}

/** The calibrated arm, from notes carrying their out-of-fold calibrated probability. */
function calibratedArmOf(calibratedNotes: ReadonlyArray<EvaluatedNote & { DecisionCalibratedProbability: number }>): ArmEvaluationResult {
    const byScenario = new Map<string, LabelledProbability[]>();
    for (const n of calibratedNotes) {
        byScenario.set(n.ScenarioId, [...(byScenario.get(n.ScenarioId) ?? []), { Probability: n.DecisionCalibratedProbability, Positive: n.IsDurable }]);
    }
    return {
        Name: 'decision-calibrated',
        Auc: RocAuc(calibratedNotes.map(n => ({ Probability: n.DecisionCalibratedProbability, Positive: n.IsDurable }))),
        AucBootstrapCi: ScenarioBootstrapAuc([...byScenario].map(([scenarioId, notes]) => ({ ScenarioId: scenarioId, Notes: notes }))),
        OperatingPoints: DECISION_SWEEP_THRESHOLDS.map(th => ComputeOperatingThresholdMetrics(calibratedNotes, th, n => n.DecisionCalibratedProbability))
    };
}
