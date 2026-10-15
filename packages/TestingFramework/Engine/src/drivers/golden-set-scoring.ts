/**
 * @fileoverview Scoring for Feature Pipeline golden sets: per-output accuracy (alternates accepted, case-insensitive)
 * with Wilson 95% intervals, and the pipeline result = the lowest output, or 0 when a required case is wrong. A case
 * can expect an abstention.
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
    /** Per output, the accepted labels (first = primary); for an {@link ExpectAbstain} output, accepted abstain values. */
    Expected: Record<string, string[]>;
    /** Outputs whose correct answer is an abstention: withheld below the confidence floor, no answer, or an `Expected` label. */
    ExpectAbstain?: string[];
    /** A must-pass case: when any output it scores is wrong, the gate value is 0 whatever the accuracy. */
    Required?: boolean;
    /**
     * Where the labels came from: `human` (an app user), `model-consensus` (two model labelers agreed),
     * `model-adjudicated` (a third labeler decided), `specification` (fixed by the pipeline's written rule, not labelled).
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
/** One output's score: correct answers of N, the accuracy and its Wilson interval. */
export interface OutputScore { Correct: number; N: number; Value: number; Lower: number; Upper: number; }
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

/** One scored case of one output and its verdict. */
interface ScoredPair { CaseID: string; correct: boolean; }

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

    /** Scores a golden set. Outputs are those named in the cases' `Expected` or `ExpectAbstain`; a failed record is wrong. */
    public static Score(cases: GoldenCase[], answers: GoldenAnswer[], metric: GoldenSetScore['Metric']): GoldenSetScore {
        const byCase = new Map(answers.map((a) => [a.CaseID, a]));
        const outputs = [...new Set(cases.flatMap((c) => [...Object.keys(c.Expected), ...(c.ExpectAbstain || [])]))];
        const perOutput: Record<string, OutputScore> = {};
        const wrongByCase = new Map<string, string[]>();
        for (const output of outputs) {
            const pairs = GoldenSetScorer.ScoredPairs(cases, byCase, output);
            perOutput[output] = GoldenSetScorer.ScoreOutput(pairs);
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
                return { CaseID: c.ID, correct: abstained };
            }
            return { CaseID: c.ID, correct: predicted !== null && accepted.includes(norm(predicted)) };
        });
    }

    /** One output's accuracy over its scored cases. */
    protected static ScoreOutput(pairs: ScoredPair[]): OutputScore {
        const correct = pairs.filter((p) => p.correct).length;
        const w = GoldenSetScorer.WilsonInterval(correct, pairs.length);
        return { Correct: correct, N: pairs.length, Value: pairs.length > 0 ? correct / pairs.length : 0, Lower: w.Lower, Upper: w.Upper };
    }

    /** How many cases came from each label source. */
    protected static CountLabelSources(cases: GoldenCase[]): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const c of cases) {
            counts[c.LabelSource] = (counts[c.LabelSource] || 0) + 1;
        }
        return counts;
    }

    /** A label as every golden-set comparison (scoring and labeler agreement) sees it: trimmed, lower-cased; null is ''. */
    public static NormalizeLabel(s: string | null): string {
        return (s || '').trim().toLowerCase();
    }
}
