/**
 * @fileoverview Scoring for Feature Pipeline golden sets: per-output accuracy (alternates accepted, case-insensitive)
 * or macro-F1 over primary labels, Wilson 95% intervals, and the pipeline result = the lowest output, or 0 when a
 * required case is wrong. A case can expect an abstention (the output withheld below its confidence floor, or no answer).
 * @module @memberjunction/testing-engine
 */
import type { MJFeaturePipelineVersionEntity } from '@memberjunction/core-entities';
import type { RequiredCaseFailure } from '@memberjunction/feature-pipelines';

/** One golden case (stored in the test's InputDefinition): the record input and, per output, the accepted labels. */
export interface GoldenCase {
    /** Stable case ID, e.g. "g01". */
    ID: string;
    /**
     * The record fields the pipeline reads. `unknown` because the values are whatever column types the pipeline's
     * entity has; the scorer never reads them, it only passes them to the pipeline and hashes them.
     */
    Input: Record<string, unknown>;
    /**
     * Per output, the accepted labels; the first is the primary. For an output in {@link ExpectAbstain} these are the
     * accepted abstain values (e.g. "Unknown"), and may be empty.
     */
    Expected: Record<string, string[]>;
    /**
     * Outputs whose correct answer is an abstention: the output was withheld below its confidence floor, or answered
     * nothing (null, an empty list), or answered one of its `Expected` labels. A record that failed for another reason is
     * not an abstention. An output listed here is scored even when its `Expected` list is empty.
     */
    ExpectAbstain?: string[];
    /**
     * A must-pass case: when any output it scores is wrong, the golden set fails whatever its accuracy (the gate value is
     * 0, so the version is refused), and the result names the case ({@link GoldenSetScore.RequiredFailures}).
     */
    Required?: boolean;
    /**
     * Where the labels came from: `human` = entered by an app user (product data, accepted as supplied);
     * `model-consensus` = two independent model labelers agreed; `model-adjudicated` = a third labeler decided;
     * `specification` = fixed by the pipeline's written rule rather than judged (an injection attempt must abstain or be
     * ignored), so no labeler labels it and the label-quality record does not cover it.
     */
    LabelSource: 'human' | 'model-consensus' | 'model-adjudicated' | 'specification';
}
/** The pipeline's answer to one case, per output (null when the record failed). */
export interface GoldenAnswer {
    /** The `GoldenCase.ID` this answers. */
    CaseID: string;
    /** Per output, the comparable answer (null when that output had none); null when the record failed. */
    Values: Record<string, string | null> | null;
    /** Outputs the pipeline withheld below their confidence floor; absent when none. */
    Withheld?: string[];
}
/** One output's score: correct answers of N, the metric value and its Wilson interval (accuracy only). */
export interface OutputScore { Correct: number; N: number; Value: number; Lower: number | null; Upper: number | null; }
/** A golden set's score: per output, and the pipeline's result (its lowest output, or 0 when a required case is wrong). */
export interface GoldenSetScore {
    Metric: NonNullable<MJFeaturePipelineVersionEntity['Metric']>;
    PerOutput: Record<string, OutputScore>;
    /** The gate value: {@link MeasuredValue}, or 0 when any required case is wrong. */
    Value: number;
    /** The lowest output's interval; null when a required case is wrong (the gate value is not a measurement then). */
    Lower: number | null;
    Upper: number | null;
    /** The lowest output's value, before the required-case rule. */
    MeasuredValue: number;
    /** The required cases answered wrong, in case order; empty when every required case is right. */
    RequiredFailures: RequiredCaseFailure[];
    N: number;
    LabelSources: Record<string, number>;
}

/** One scored case of one output: the truth and prediction as compared (abstentions as {@link ABSTAIN}) and the verdict. */
interface ScoredPair { CaseID: string; truth: string; predicted: string | null; correct: boolean; }

/** The class an abstention scores as under macro-F1: the expected and the given abstention compare equal. */
const ABSTAIN = '(abstain)';

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

    /**
     * Scores a golden set. Outputs are those named in the cases' `Expected` or `ExpectAbstain`; a failed record counts as
     * wrong (except an output it was failed on below its confidence floor, when the case expects that output to abstain).
     */
    public static Score(cases: GoldenCase[], answers: GoldenAnswer[], metric: GoldenSetScore['Metric']): GoldenSetScore {
        const byCase = new Map(answers.map((a) => [a.CaseID, a]));
        const outputs = [...new Set(cases.flatMap((c) => [...Object.keys(c.Expected), ...(c.ExpectAbstain || [])]))];
        const perOutput: Record<string, OutputScore> = {};
        const wrongByCase = new Map<string, string[]>();
        for (const output of outputs) {
            const pairs = GoldenSetScorer.ScoredPairs(cases, byCase, output);
            perOutput[output] = GoldenSetScorer.ScoreOutput(pairs, metric);
            for (const p of pairs.filter((x) => !x.correct)) {
                wrongByCase.set(p.CaseID, [...(wrongByCase.get(p.CaseID) || []), output]);
            }
        }
        // The pipeline is only as good as its weakest output: a gate on the mean would let one strong output hide a bad one.
        const lowest = Object.values(perOutput).reduce<OutputScore | null>((min, s) => (min === null || s.Value < min.Value ? s : min), null);
        const requiredFailures = cases.filter((c) => c.Required === true && wrongByCase.has(c.ID))
            .map((c) => ({ CaseID: c.ID, Outputs: wrongByCase.get(c.ID) || [] }));
        // A must-pass case is a rule, not a sample: no accuracy makes up for breaking it, so the gate value is 0
        const failed = requiredFailures.length > 0;
        const measured = lowest ? lowest.Value : 0;
        return {
            Metric: metric, PerOutput: perOutput, Value: failed ? 0 : measured, Lower: !failed && lowest ? lowest.Lower : null,
            Upper: !failed && lowest ? lowest.Upper : null, MeasuredValue: measured, RequiredFailures: requiredFailures,
            N: cases.length, LabelSources: GoldenSetScorer.CountLabelSources(cases),
        };
    }

    /** The cases that score an output (it has `Expected` labels or expects an abstention), each with its verdict. */
    protected static ScoredPairs(cases: GoldenCase[], byCase: Map<string, GoldenAnswer>, output: string): ScoredPair[] {
        const norm = GoldenSetScorer.NormalizeLabel;
        return cases.filter((c) => (c.Expected[output] || []).length > 0 || (c.ExpectAbstain || []).includes(output)).map((c): ScoredPair => {
            const answer = byCase.get(c.ID);
            const accepted = (c.Expected[output] || []).map(norm);
            const predicted = answer?.Values?.[output] || null;
            if ((c.ExpectAbstain || []).includes(output)) {
                const withheld = (answer?.Withheld || []).includes(output);
                // An answered record that gave nothing abstained; a record that failed for another reason did not answer at all
                const abstained = withheld || (!!answer?.Values && (predicted === null || accepted.includes(norm(predicted))));
                return { CaseID: c.ID, truth: ABSTAIN, predicted: abstained ? ABSTAIN : predicted, correct: abstained };
            }
            return { CaseID: c.ID, truth: c.Expected[output][0], predicted, correct: predicted !== null && accepted.includes(norm(predicted)) };
        });
    }

    /** One output's score over its scored cases. */
    protected static ScoreOutput(pairs: ScoredPair[], metric: GoldenSetScore['Metric']): OutputScore {
        const correct = pairs.filter((p) => p.correct).length;
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
