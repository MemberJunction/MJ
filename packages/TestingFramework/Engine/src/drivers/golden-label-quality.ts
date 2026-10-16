/**
 * @fileoverview Automated quality check for model-made golden-set labels (no person reviews labels). Labelers A, B and
 * C label every case; per output, A–B and A–C agreement must reach a Wilson 95% lower bound; C decides an A–B
 * disagreement; a case all three disagree on is excluded. The golden-set driver re-checks the stored record.
 * @module @memberjunction/testing-engine
 */
import { ComputeContentHashAsync } from '@memberjunction/global';
import { GoldenSetScorer, type GoldenCase } from './golden-set-scoring';

/** One labeler's answer for one case: per output, the accepted labels (first = primary); null = no valid answer. */
export type LabelerAnswer = Record<string, string[]> | null;
/** Who labeled: the vendor and model, and the SHA-256 of the exact instructions it was given. */
export interface LabelerIdentity {
    /** Which labeler: A (the existing labels), B or C (the two new, independent labelers). */
    ID: 'A' | 'B' | 'C';
    Vendor: string;
    Model: string;
    /** SHA-256 of the instructions the labeler was given; null when they were not recorded (labeler A). */
    PromptSha256: string | null;
}
/** One case with the three labelers' answers (the label-quality rig's input). */
export interface LabelledCase {
    ID: string;
    /** The record fields the pipeline reads; `unknown` for the same reason as `GoldenCase.Input`. */
    Input: Record<string, unknown>;
    A: LabelerAnswer;
    B: LabelerAnswer;
    C: LabelerAnswer;
}
/** The pass condition: the agreement lower bound every pair must reach, and the most cases that may be excluded. */
export interface GoldenLabelPolicy { MinAgreementLower: number; MaxExcluded: number; }
/** Default policy: pairwise agreement lower bound 0.70 (≥ 43/52) and at most 5 of 52 cases excluded. */
export const DEFAULT_GOLDEN_LABEL_POLICY: GoldenLabelPolicy = { MinAgreementLower: 0.7, MaxExcluded: 5 };
/** Agreement of one labeler pair on one output, with its Wilson interval. */
export interface PairAgreement { Agree: number; N: number; Lower: number; Upper: number; }
/** The stored label-quality record of a golden set (`InputDefinition.labelQuality`). */
export interface GoldenLabelQuality {
    Procedure: 'labeler-agreement-with-adjudication';
    Labelers: LabelerIdentity[];
    Policy: GoldenLabelPolicy;
    PerOutput: Record<string, { AB: PairAgreement; AC: PairAgreement }>;
    Consensus: number;
    Adjudicated: number;
    Excluded: Array<{ ID: string; A: LabelerAnswer; B: LabelerAnswer; C: LabelerAnswer }>;
    CasesSha256: string;
    Passed: boolean;
    Problems: string[];
}

/** Per output, how often A agreed with B and with C. */
interface AgreementCounts { AB: Record<string, number>; AC: Record<string, number>; }

/** The automated label-quality procedure for model-made golden labels. */
export class GoldenLabelQualityCheck {
    /** Two answers agree on an output when each one's primary label is among the other's accepted labels (any case). */
    public static LabelsAgree(x: string[] | undefined, y: string[] | undefined): boolean {
        if (!x || x.length === 0 || !y || y.length === 0) {
            return false;
        }
        const xs = x.map(GoldenSetScorer.NormalizeLabel);
        const ys = y.map(GoldenSetScorer.NormalizeLabel);
        // Both directions: one labeler's alternates must not turn the other's different primary into agreement.
        return ys.includes(xs[0]) && xs.includes(ys[0]);
    }

    /** SHA-256 of the labelled cases, so a record is valid only for those exact cases. */
    public static async CasesSha256(cases: GoldenCase[]): Promise<string> {
        return ComputeContentHashAsync({ Cases: cases.map((c) => [c.ID, c.Input, c.Expected, c.LabelSource]) });
    }

    /** Builds the golden cases and their quality record from three labelers' answers. Deterministic. */
    public static async Adjudicate(labelled: LabelledCase[], outputs: string[], labelers: LabelerIdentity[],
        policy: GoldenLabelPolicy = DEFAULT_GOLDEN_LABEL_POLICY): Promise<{ cases: GoldenCase[]; labelQuality: GoldenLabelQuality }> {
        const counts: AgreementCounts = { AB: GoldenLabelQualityCheck.Zeros(outputs), AC: GoldenLabelQualityCheck.Zeros(outputs) };
        const cases: GoldenCase[] = [];
        const excluded: GoldenLabelQuality['Excluded'] = [];
        for (const l of labelled) {
            const decided = GoldenLabelQualityCheck.AdjudicateCase(l, outputs, counts);
            if (decided) {
                cases.push(decided);
            } else {
                excluded.push({ ID: l.ID, A: l.A, B: l.B, C: l.C });
            }
        }
        const pair = (agree: number): PairAgreement => ({ Agree: agree, N: labelled.length, ...GoldenSetScorer.WilsonInterval(agree, labelled.length) });
        const labelQuality: GoldenLabelQuality = {
            Procedure: 'labeler-agreement-with-adjudication', Labelers: labelers, Policy: policy,
            PerOutput: Object.fromEntries(outputs.map((o) => [o, { AB: pair(counts.AB[o]), AC: pair(counts.AC[o]) }])),
            Consensus: cases.filter((c) => c.LabelSource === 'model-consensus').length,
            Adjudicated: cases.filter((c) => c.LabelSource === 'model-adjudicated').length,
            Excluded: excluded, CasesSha256: await GoldenLabelQualityCheck.CasesSha256(cases), Passed: false, Problems: [],
        };
        labelQuality.Problems = await GoldenLabelQualityCheck.Check(cases, labelQuality, policy);
        labelQuality.Passed = labelQuality.Problems.length === 0;
        return { cases, labelQuality };
    }

    /**
     * Why a golden set's labels may not gate a pipeline; empty when they may. Recomputed from the stored counts under
     * the given policy rather than trusting the stored Passed flag.
     */
    public static async Check(cases: GoldenCase[], q: GoldenLabelQuality | undefined,
        policy: GoldenLabelPolicy = DEFAULT_GOLDEN_LABEL_POLICY): Promise<string[]> {
        // An empty set would pass every check below vacuously and then gate a pipeline on a score of nothing.
        if (cases.length === 0) {
            return ['the golden set has no cases'];
        }
        // Specification cases are not labelled, so each must be Required: it can only make the gate stricter.
        const unrequired = cases.filter((c) => c.LabelSource === 'specification' && c.Required !== true);
        if (unrequired.length > 0) {
            return [`specification cases must be Required (they are not labelled): ${unrequired.map((c) => c.ID).join(', ')}`];
        }
        const labelled = GoldenLabelQualityCheck.LabelledCases(cases);
        // Labels an app user entered are product data, accepted as supplied; only model-made labels need the record.
        if (labelled.every((c) => c.LabelSource === 'human')) {
            return [];
        }
        if (!q) {
            return ['the golden set has model-made labels and no labelQuality record'];
        }
        const problems: string[] = [];
        if (q.CasesSha256 !== (await GoldenLabelQualityCheck.CasesSha256(labelled))) {
            problems.push('the cases changed after the label-quality check (CasesSha256 mismatch)');
        }
        problems.push(...GoldenLabelQualityCheck.AgreementProblems(q, policy));
        if (q.Excluded.length > policy.MaxExcluded) {
            problems.push(`${q.Excluded.length} cases excluded (all three labelers disagree) > ${policy.MaxExcluded}`);
        }
        return problems;
    }

    /** The cases labels were given for: every case but the `specification` ones (see {@link Check}). */
    public static LabelledCases(cases: GoldenCase[]): GoldenCase[] {
        return cases.filter((c) => c.LabelSource !== 'specification');
    }

    /**
     * One case's expected labels, counting A–B and A–C agreement per output: A–B agree → A's labels; otherwise C decides
     * between A and B; null when all three disagree on any output.
     */
    protected static AdjudicateCase(l: LabelledCase, outputs: string[], counts: AgreementCounts): GoldenCase | null {
        const agree = GoldenLabelQualityCheck.LabelsAgree;
        const expected: Record<string, string[]> = {};
        let source: GoldenCase['LabelSource'] = 'model-consensus';
        let keep = true;
        for (const o of outputs) {
            const a = l.A?.[o];
            const b = l.B?.[o];
            const c = l.C?.[o];
            if (agree(a, c)) {
                counts.AC[o]++;
            }
            if (a && agree(a, b)) {
                counts.AB[o]++;
                expected[o] = a;
                continue;
            }
            source = 'model-adjudicated';
            const decided = a && agree(c, a) ? a : b && agree(c, b) ? b : undefined;
            if (decided) {
                expected[o] = decided;
            } else {
                keep = false;
            }
        }
        return keep ? { ID: l.ID, Input: l.Input, Expected: expected, LabelSource: source } : null;
    }

    /** Each labeler pair whose agreement's Wilson lower bound, recomputed from the stored counts, is under the policy. */
    protected static AgreementProblems(q: GoldenLabelQuality, policy: GoldenLabelPolicy): string[] {
        const problems: string[] = [];
        for (const [o, a] of Object.entries(q.PerOutput)) {
            for (const [name, p] of [['B', a.AB], ['C', a.AC]] as const) {
                // The lower bound, not the point estimate: 42/52 = 0.81 looks fine but cannot rule out 0.68 agreement.
                const w = GoldenSetScorer.WilsonInterval(p.Agree, p.N);
                if (w.Lower < policy.MinAgreementLower) {
                    problems.push(`${o}: labelers A and ${name} agree on ${p.Agree}/${p.N}, Wilson lower bound ${w.Lower.toFixed(4)} < ${policy.MinAgreementLower}`);
                }
            }
        }
        return problems;
    }

    /** A zero count per output. */
    protected static Zeros(outputs: string[]): Record<string, number> {
        return Object.fromEntries(outputs.map((o) => [o, 0]));
    }
}
