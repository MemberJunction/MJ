/**
 * @fileoverview Metrics computation, out-of-fold Platt calibration, scenario-clustered
 * bootstrap confidence intervals, and evaluation for the memory note decision gate measurement.
 *
 * @module @memberjunction/integration-test-suite
 */

import {
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
export function ComputeOperatingThresholdMetrics(
    notes: readonly EvaluatedNote[],
    threshold: number,
    getScore: (note: EvaluatedNote) => number
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

/**
 * 5-fold stratified cross-validation fitting Platt scaling to get out-of-fold calibrated probabilities.
 */
export function OutOfFoldPlatt(
    points: readonly LabelledProbability[],
    folds: number = 5,
    seed: number = 20260929
): number[] | null {
    if (points.length < folds * 2) return null;
    const positives = points.map((p, i) => ({ ...p, i })).filter(p => p.Positive);
    const negatives = points.map((p, i) => ({ ...p, i })).filter(p => !p.Positive);
    if (positives.length < folds || negatives.length < folds) return null;

    const rand = CreateSeededRandom(seed);
    const shuffle = <T>(arr: T[]) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    const shuffPos = shuffle(positives);
    const shuffNeg = shuffle(negatives);

    const foldAssignments = new Array<number>(points.length);
    shuffPos.forEach((p, idx) => { foldAssignments[p.i] = idx % folds; });
    shuffNeg.forEach((p, idx) => { foldAssignments[p.i] = idx % folds; });

    const oof = new Array<number>(points.length);

    for (let f = 0; f < folds; f++) {
        const trainPoints = points.filter((_, idx) => foldAssignments[idx] !== f);
        const testIndices = points.map((_, idx) => idx).filter(idx => foldAssignments[idx] === f);

        const params = FitPlatt(trainPoints);
        for (const idx of testIndices) {
            const raw = points[idx].Probability;
            const logit = Math.log(Math.max(1e-12, Math.min(1 - 1e-12, raw)) / (1 - Math.max(1e-12, Math.min(1 - 1e-12, raw))));
            oof[idx] = 1 / (1 + Math.exp(-(params.A * logit + params.B)));
        }
    }

    return oof;
}

/**
 * Computes repeatability agreement across repetitions: share of decisions that agree across reps.
 */
export function ComputeRepeatabilityAgreement(
    observations: readonly DecisionObservation[],
    threshold: number = 0.5
): number | null {
    if (observations.length === 0) return null;
    const byNote = new Map<string, number[]>();
    for (const obs of observations) {
        const list = byNote.get(obs.NoteId) || [];
        list.push(obs.RawProbability);
        byNote.set(obs.NoteId, list);
    }

    let noteCount = 0;
    let agreementSum = 0;

    for (const probs of byNote.values()) {
        if (probs.length <= 1) continue;
        const decisions = probs.map(p => p >= threshold);
        const countTrue = decisions.filter(Boolean).length;
        const countFalse = decisions.length - countTrue;
        // Agreement is max majority share
        const agreement = Math.max(countTrue, countFalse) / decisions.length;
        agreementSum += agreement;
        noteCount++;
    }

    return noteCount > 0 ? agreementSum / noteCount : 1.0;
}

/**
 * Summarizes latency quantiles and cost per 1,000 notes.
 */
export function SummarizeTelemetry(
    observations: readonly DecisionObservation[]
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
    reps: number
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

    // 4. Out-of-fold calibration
    const oofProbabilities = OutOfFoldPlatt(rawPoints, 5, 20260929);
    const calibratedNotes: EvaluatedNote[] = evaluatedNotes.map((n, idx) => ({
        ...n,
        DecisionCalibratedProbability: oofProbabilities ? oofProbabilities[idx] : n.DecisionRawProbability
    }));

    const calPoints: LabelledProbability[] = calibratedNotes.map(n => ({
        Probability: n.DecisionCalibratedProbability ?? n.DecisionRawProbability,
        Positive: n.IsDurable
    }));
    const calAuc = RocAuc(calPoints);
    const calBootstrapCi = ScenarioBootstrapAuc(
        Array.from(byScenarioMap.entries()).map(([scenarioId, _]) => ({
            ScenarioId: scenarioId,
            Notes: calibratedNotes
                .filter(cn => cn.ScenarioId === scenarioId)
                .map(cn => ({ Probability: cn.DecisionCalibratedProbability ?? cn.DecisionRawProbability, Positive: cn.IsDurable }))
        }))
    );
    const calOperatingPoints = DECISION_SWEEP_THRESHOLDS.map(th =>
        ComputeOperatingThresholdMetrics(calibratedNotes, th, n => n.DecisionCalibratedProbability ?? n.DecisionRawProbability)
    );

    const telemetry = SummarizeTelemetry(observations);
    const repeatability = ComputeRepeatabilityAgreement(observations);

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
        DecisionCalibratedArm: {
            Name: 'decision-calibrated',
            Auc: calAuc,
            AucBootstrapCi: calBootstrapCi,
            OperatingPoints: calOperatingPoints
        },
        Latency: {
            P50Ms: telemetry.latencyP50Ms,
            P95Ms: telemetry.latencyP95Ms
        },
        CostPerThousandNotesUsd: telemetry.costPerThousandUsd,
        RepeatabilityAgreement: repeatability
    };
}
