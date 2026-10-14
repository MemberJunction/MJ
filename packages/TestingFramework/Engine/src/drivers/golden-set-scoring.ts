/**
 * @fileoverview Scoring for Feature Pipeline golden sets: per-output accuracy (alternates accepted, case-insensitive)
 * or macro-F1 over primary labels, Wilson 95% intervals, and the pipeline result = the lowest output.
 * @module @memberjunction/testing-engine
 */
import type { MJFeaturePipelineVersionEntity } from '@memberjunction/core-entities';

/** One golden case (stored in the test's InputDefinition): the record input and, per output, the accepted labels. */
export interface GoldenCase {
    /** Stable case ID, e.g. "g01". */
    ID: string;
    /**
     * The record fields the pipeline reads. `unknown` because the values are whatever column types the pipeline's
     * entity has; the scorer never reads them, it only passes them to the pipeline and hashes them.
     */
    Input: Record<string, unknown>;
    /** Per output, the accepted labels; the first is the primary. */
    Expected: Record<string, string[]>;
    /**
     * Where the labels came from: `human` = entered by an app user (product data, accepted as supplied);
     * `model-consensus` = two independent model labelers agreed; `model-adjudicated` = a third labeler decided.
     */
    LabelSource: 'human' | 'model-consensus' | 'model-adjudicated';
}
/** The pipeline's answer to one case, per output (null when the record failed). */
export interface GoldenAnswer {
    /** The `GoldenCase.ID` this answers. */
    CaseID: string;
    /** Per output, the comparable answer (null when that output had none); null when the record failed. */
    Values: Record<string, string | null> | null;
}
/** One output's score: correct answers of N, the metric value and its Wilson interval (accuracy only). */
export interface OutputScore { Correct: number; N: number; Value: number; Lower: number | null; Upper: number | null; }
/** A golden set's score: per output, and the pipeline's result (its lowest output). */
export interface GoldenSetScore {
    Metric: NonNullable<MJFeaturePipelineVersionEntity['Metric']>;
    PerOutput: Record<string, OutputScore>;
    Value: number;
    Lower: number | null;
    Upper: number | null;
    N: number;
    LabelSources: Record<string, number>;
}

/** Golden-set scoring; pure and deterministic. */
export class GoldenSetScorer {
    /** z for a two-sided 95% interval. */
    private static readonly Z95 = 1.959963984540054;

    /** 95% Wilson score interval for k successes out of n ({0, 0} when n = 0). */
    public static WilsonInterval(k: number, n: number): { Lower: number; Upper: number } {
        if (n === 0) {
            return { Lower: 0, Upper: 0 };
        }
        const z = GoldenSetScorer.Z95;
        const p = k / n;
        const denom = 1 + (z * z) / n;
        const centre = (p + (z * z) / (2 * n)) / denom;
        const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
        return { Lower: centre - half, Upper: centre + half };
    }

    /** Scores a golden set. Outputs are those named in the cases' `Expected`; a failed record counts as wrong. */
    public static Score(cases: GoldenCase[], answers: GoldenAnswer[], metric: GoldenSetScore['Metric']): GoldenSetScore {
        const byCase = new Map(answers.map((a) => [a.CaseID, a.Values]));
        const outputs = [...new Set(cases.flatMap((c) => Object.keys(c.Expected)))];
        const perOutput: Record<string, OutputScore> = {};
        for (const output of outputs) {
            perOutput[output] = GoldenSetScorer.ScoreOutput(cases, byCase, output, metric);
        }
        // The pipeline is only as good as its weakest output: a gate on the mean would let one strong output hide a bad one.
        const lowest = Object.values(perOutput).reduce<OutputScore | null>((min, s) => (min === null || s.Value < min.Value ? s : min), null);
        return {
            Metric: metric, PerOutput: perOutput, Value: lowest ? lowest.Value : 0, Lower: lowest ? lowest.Lower : null,
            Upper: lowest ? lowest.Upper : null, N: cases.length, LabelSources: GoldenSetScorer.CountLabelSources(cases),
        };
    }

    /** One output's score over the cases that label it. */
    protected static ScoreOutput(cases: GoldenCase[], byCase: Map<string, Record<string, string | null> | null>, output: string,
        metric: GoldenSetScore['Metric']): OutputScore {
        const pairs = cases.filter((c) => (c.Expected[output] || []).length > 0).map((c) => ({
            truth: c.Expected[output][0], accepted: c.Expected[output].map(GoldenSetScorer.NormalizeLabel), predicted: byCase.get(c.ID)?.[output] || null,
        }));
        const correct = pairs.filter((p) => p.predicted !== null && p.accepted.includes(GoldenSetScorer.NormalizeLabel(p.predicted))).length;
        if (metric === 'macro-f1') {
            return { Correct: correct, N: pairs.length, Value: GoldenSetScorer.MacroF1(pairs), Lower: null, Upper: null };
        }
        const w = GoldenSetScorer.WilsonInterval(correct, pairs.length);
        return { Correct: correct, N: pairs.length, Value: pairs.length > 0 ? correct / pairs.length : 0, Lower: w.Lower, Upper: w.Upper };
    }

    /** Macro-averaged F1 over the primary labels (alternates are not accepted: F1 is per class). */
    protected static MacroF1(pairs: Array<{ truth: string; predicted: string | null }>): number {
        const norm = GoldenSetScorer.NormalizeLabel;
        const classes = [...new Set(pairs.map((p) => norm(p.truth)))];
        const f1s = classes.map((c) => {
            const tp = pairs.filter((p) => norm(p.truth) === c && norm(p.predicted) === c).length;
            const fp = pairs.filter((p) => norm(p.truth) !== c && norm(p.predicted) === c).length;
            const fn = pairs.filter((p) => norm(p.truth) === c && norm(p.predicted) !== c).length;
            return tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
        });
        return f1s.length === 0 ? 0 : f1s.reduce((a, b) => a + b, 0) / f1s.length;
    }

    /** How many cases came from each label source. */
    protected static CountLabelSources(cases: GoldenCase[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const c of cases) {
            counts[c.LabelSource] = (counts[c.LabelSource] || 0) + 1;
        }
        return counts;
    }

    /**
     * A label as every golden-set comparison sees it: trimmed and lower-cased; null is ''. The one normalisation for
     * scoring and for labeler agreement, so the two can never disagree about whether two labels are the same.
     */
    public static NormalizeLabel(s: string | null): string {
        return (s || '').trim().toLowerCase();
    }
}
