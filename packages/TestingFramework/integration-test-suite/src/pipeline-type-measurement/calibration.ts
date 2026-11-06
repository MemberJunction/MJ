/**
 * calibration.ts — Decision's calibration (confidence against correctness) and the escalation
 * simulation (plan 5.4): what a Decision pipeline that escalates its borderline records to the LLM
 * pipeline would have scored, at each confidence floor.
 *
 * Pure. The simulation follows `InferProcessor`'s escalation rule: a record escalates when its Decision
 * answer succeeded with a confidence below the floor (or with no confidence at all), and a failed
 * Decision answer fails the record without escalating. An escalated record takes the same rep's LLM
 * answer, and costs its Decision run plus its LLM run.
 */
import { PredictionCost, Per1000 } from './cost-and-time';
import { IsCorrect, Mean, RepNumbers } from './metrics';
import type { MetricContext } from './metrics';
import type { MeasuredPipelineType, PromptRunCost, RecordPrediction } from './types';

/** Equal-width confidence bins over [0, 1]. */
export const CALIBRATION_BINS = 10;

/** One bin of the reliability table. */
export interface ReliabilityBin {
    Lower: number;
    Upper: number;
    Count: number;
    MeanConfidence: number | null;
    Accuracy: number | null;
}

/** How well a type's confidence matches how often it is right. */
export interface CalibrationSummary {
    /** Answers with a confidence, pooled over reps. */
    Points: number;
    /** Answers without one (failed, missing, or no confidence), which calibration cannot use. */
    Excluded: number;
    /** Expected calibration error: the count-weighted mean gap between confidence and accuracy per bin. */
    ECE: number | null;
    Bins: ReliabilityBin[];
}

/** The hybrid at one confidence floor. */
export interface EscalationPoint {
    Floor: number;
    Accuracy: number | null;
    /** Share of answers escalated to the LLM. */
    EscalatedShare: number | null;
    /** Decision cost for every record plus LLM cost for escalated ones; a lower bound when costs are missing. */
    CostPer1000: number | null;
}

/** The floors the simulation reports: 0.50 to 0.95 in steps of 0.05. */
export function EscalationFloors(): number[] {
    return Array.from({ length: 10 }, (_, i) => ((10 + i) * 5) / 100);
}

/** A type's reliability table and ECE, pooled over reps. */
export function SummarizeCalibration(ctx: MetricContext, type: MeasuredPipelineType = 'Decision', binCount = CALIBRATION_BINS): CalibrationSummary {
    const points = calibrationPoints(ctx, type);
    const bins = Array.from({ length: binCount }, (_, b) => buildBin(points, b, binCount));
    const total = points.length;
    const ece = total === 0 ? null : bins.reduce((sum, bin) => sum + (bin.Count / total) * Math.abs((bin.Accuracy ?? 0) - (bin.MeanConfidence ?? 0)), 0);
    return { Points: total, Excluded: ctx.Sample.length * ctx.Reps - total, ECE: ece, Bins: bins };
}

/** Every successful answer with a confidence, as (confidence, correct). */
function calibrationPoints(ctx: MetricContext, type: MeasuredPipelineType): Array<{ Confidence: number; Correct: boolean }> {
    return RepNumbers(ctx.Reps).flatMap((rep) =>
        ctx.Sample.flatMap((record) => {
            const prediction = ctx.Index.Get(type, rep, record.RecordID);
            if (!prediction?.Succeeded || prediction.Confidence === null) {
                return [];
            }
            return [{ Confidence: prediction.Confidence, Correct: IsCorrect(prediction, record.Label) }];
        })
    );
}

/** The bin a confidence falls in; 1.0 falls in the last bin. */
export function BinIndex(confidence: number, binCount: number): number {
    return Math.min(binCount - 1, Math.max(0, Math.floor(confidence * binCount + 1e-9)));
}

function buildBin(points: ReadonlyArray<{ Confidence: number; Correct: boolean }>, bin: number, binCount: number): ReliabilityBin {
    const inBin = points.filter((p) => BinIndex(p.Confidence, binCount) === bin);
    return {
        Lower: round4(bin / binCount),
        Upper: round4((bin + 1) / binCount),
        Count: inBin.length,
        MeanConfidence: Mean(inBin.map((p) => p.Confidence)),
        Accuracy: Mean(inBin.map((p) => (p.Correct ? 1 : 0))),
    };
}

function round4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

/** The hybrid's accuracy, escalated share and cost per 1,000 at each floor. */
export function SimulateEscalation(ctx: MetricContext, costs: ReadonlyMap<string, PromptRunCost>, floors: readonly number[] = EscalationFloors()): EscalationPoint[] {
    return floors.map((floor) => simulateFloor(ctx, costs, floor));
}

/** Which answer the hybrid keeps for one record, and whether it escalated. */
export function HybridAnswer(decision: RecordPrediction | undefined, llm: RecordPrediction | undefined, floor: number): { Answer: RecordPrediction | undefined; Escalated: boolean } {
    if (!decision?.Succeeded) {
        return { Answer: decision, Escalated: false };
    }
    if (decision.Confidence === null || decision.Confidence < floor) {
        return { Answer: llm, Escalated: true };
    }
    return { Answer: decision, Escalated: false };
}

function simulateFloor(ctx: MetricContext, costs: ReadonlyMap<string, PromptRunCost>, floor: number): EscalationPoint {
    let answers = 0;
    let correct = 0;
    let escalated = 0;
    let cost = 0;
    let anyCostKnown = false;
    for (const rep of RepNumbers(ctx.Reps)) {
        for (const record of ctx.Sample) {
            const decision = ctx.Index.Get('Decision', rep, record.RecordID);
            const llm = ctx.Index.Get('LLM', rep, record.RecordID);
            const hybrid = HybridAnswer(decision, llm, floor);
            const runCosts = [PredictionCost(decision, costs), hybrid.Escalated ? PredictionCost(llm, costs) : null].filter((c): c is number => c !== null);
            anyCostKnown ||= runCosts.length > 0;
            cost += runCosts.reduce((sum, c) => sum + c, 0);
            answers += 1;
            correct += IsCorrect(hybrid.Answer, record.Label) ? 1 : 0;
            escalated += hybrid.Escalated ? 1 : 0;
        }
    }
    return {
        Floor: floor,
        Accuracy: answers === 0 ? null : correct / answers,
        EscalatedShare: answers === 0 ? null : escalated / answers,
        CostPer1000: anyCostKnown ? Per1000(cost, answers) : null,
    };
}
