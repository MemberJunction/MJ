/**
 * metrics.ts — accuracy, per-value recall, agreement between the types, and repeatability.
 *
 * Pure. Every rate is over the sampled records, and a failed or missing answer counts as wrong (and as
 * a disagreement), so a type cannot look better by failing on its hard records.
 */
import { CreateSeededRandom } from './sampling';
import type { LabeledRecord, MeasuredPipelineType, RecordPrediction } from './types';

/** Bootstrap resamples for the accuracy interval. */
export const BOOTSTRAP_RESAMPLES = 2000;

/** Predictions looked up by type, rep and record. */
export class PredictionIndex {
    private readonly byKey = new Map<string, RecordPrediction>();

    constructor(predictions: readonly RecordPrediction[]) {
        for (const prediction of predictions) {
            this.byKey.set(PredictionIndex.key(prediction.Type, prediction.Rep, prediction.RecordID), prediction);
        }
    }

    /** The prediction for one record in one rep of one type, when there is one. */
    public Get(type: MeasuredPipelineType, rep: number, recordID: string): RecordPrediction | undefined {
        return this.byKey.get(PredictionIndex.key(type, rep, recordID));
    }

    private static key(type: MeasuredPipelineType, rep: number, recordID: string): string {
        return `${type}|${rep}|${recordID}`;
    }
}

/** What every metric reads: the sample, the number of reps, and the predictions. */
export interface MetricContext {
    Sample: readonly LabeledRecord[];
    Reps: number;
    Index: PredictionIndex;
}

/** One answer: a type in a rep. */
export interface AnswerSource {
    Type: MeasuredPipelineType;
    Rep: number;
}

/** A 95% (or other level) interval. */
export interface Interval {
    Low: number;
    High: number;
}

/** A type's accuracy against the labels. */
export interface AccuracySummary {
    /** Mean over records of the share of reps that answered the label. */
    Accuracy: number | null;
    /** Percentile bootstrap interval, resampling records. */
    CI95: Interval | null;
    /** Accuracy in each rep (index 0 is rep 1). */
    PerRep: Array<number | null>;
    /** Records with no successful answer in each rep. */
    FailuresPerRep: number[];
}

/** A value's recall: of the records labelled with it, the share (over reps) answered with it. */
export interface ValueRecall {
    Value: string;
    /** Sampled records with this label. */
    Support: number;
    Recall: number | null;
}

/** Agreement between the two types, rep by rep. */
export interface TypeAgreement {
    PerRep: Array<number | null>;
    Mean: number | null;
}

/** Whether an answer is the record's label. A failed or missing answer is wrong. */
export function IsCorrect(prediction: RecordPrediction | undefined, label: string): boolean {
    return !!prediction && prediction.Succeeded && prediction.Predicted === label;
}

/** The arithmetic mean, or null for no values. */
export function Mean(values: readonly number[]): number | null {
    return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** The 1-based reps, `[1, …, reps]`. */
export function RepNumbers(reps: number): number[] {
    return Array.from({ length: reps }, (_, i) => i + 1);
}

/** Each sampled record's score for a type: the share of its reps that answered its label. */
export function RecordAccuracyScores(ctx: MetricContext, type: MeasuredPipelineType): number[] {
    const reps = RepNumbers(ctx.Reps);
    return ctx.Sample.map((record) => reps.filter((rep) => IsCorrect(ctx.Index.Get(type, rep, record.RecordID), record.Label)).length / reps.length);
}

/**
 * The nearest-rank quantile of ascending values: the smallest value with at least `q` of the values at
 * or below it. The small epsilon keeps a product like 0.975 × 2000 from rounding up a rank.
 */
export function NearestRankQuantile(sorted: readonly number[], q: number): number {
    const rank = Math.ceil(q * sorted.length - 1e-9);
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** A seeded percentile-bootstrap interval for the mean of `scores`, resampling them with replacement. */
export function BootstrapInterval(scores: readonly number[], resamples: number, seed: number, level = 0.95): Interval | null {
    if (scores.length === 0 || resamples < 1) {
        return null;
    }
    const random = CreateSeededRandom(seed);
    const means: number[] = [];
    for (let b = 0; b < resamples; b++) {
        let sum = 0;
        for (let i = 0; i < scores.length; i++) {
            sum += scores[Math.floor(random() * scores.length)];
        }
        means.push(sum / scores.length);
    }
    means.sort((a, b) => a - b);
    const alpha = (1 - level) / 2;
    return { Low: NearestRankQuantile(means, alpha), High: NearestRankQuantile(means, 1 - alpha) };
}

/** A type's accuracy overall (with its bootstrap interval) and in each rep, and its failures per rep. */
export function SummarizeAccuracy(ctx: MetricContext, type: MeasuredPipelineType, seed: number, resamples = BOOTSTRAP_RESAMPLES): AccuracySummary {
    const scores = RecordAccuracyScores(ctx, type);
    const reps = RepNumbers(ctx.Reps);
    return {
        Accuracy: Mean(scores),
        CI95: BootstrapInterval(scores, resamples, seed),
        PerRep: reps.map((rep) => Mean(ctx.Sample.map((r) => (IsCorrect(ctx.Index.Get(type, rep, r.RecordID), r.Label) ? 1 : 0)))),
        FailuresPerRep: reps.map((rep) => ctx.Sample.filter((r) => !ctx.Index.Get(type, rep, r.RecordID)?.Succeeded).length),
    };
}

/** Each value's recall for a type, pooled over reps, in `values` order. */
export function PerValueRecall(ctx: MetricContext, type: MeasuredPipelineType, values: readonly string[]): ValueRecall[] {
    const reps = RepNumbers(ctx.Reps);
    return values.map((value) => {
        const records = ctx.Sample.filter((r) => r.Label === value);
        const hits = records.flatMap((r) => reps.map((rep) => (IsCorrect(ctx.Index.Get(type, rep, r.RecordID), value) ? 1 : 0)));
        return { Value: value, Support: records.length, Recall: Mean(hits) };
    });
}

/** The share of the sample where two answers both succeeded and gave the same value. */
export function AgreementRate(ctx: MetricContext, a: AnswerSource, b: AnswerSource): number | null {
    return Mean(ctx.Sample.map((record) => {
        const first = ctx.Index.Get(a.Type, a.Rep, record.RecordID);
        const second = ctx.Index.Get(b.Type, b.Rep, record.RecordID);
        const agree = !!first?.Succeeded && !!second?.Succeeded && first.Predicted !== null && first.Predicted === second.Predicted;
        return agree ? 1 : 0;
    }));
}

/** How often LLM and Decision agree in each rep, and on average. */
export function AgreementBetweenTypes(ctx: MetricContext): TypeAgreement {
    const perRep = RepNumbers(ctx.Reps).map((rep) => AgreementRate(ctx, { Type: 'LLM', Rep: rep }, { Type: 'Decision', Rep: rep }));
    return { PerRep: perRep, Mean: Mean(perRep.filter((rate): rate is number => rate !== null)) };
}

/** A type's repeatability: how often rep 1 and rep 2 agree. Null with fewer than two reps. */
export function Repeatability(ctx: MetricContext, type: MeasuredPipelineType): number | null {
    return ctx.Reps < 2 ? null : AgreementRate(ctx, { Type: type, Rep: 1 }, { Type: type, Rep: 2 });
}
