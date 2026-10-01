import { RubricScoring, type RubricAnswer, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';

export interface EvidenceRef {
    ref: string;
    quote?: string;
}

/** One leaf the evaluator chose, before the shared scorer turns it into a 0..1 result. */
export interface RubricCandidate {
    criterionId: string;
    scaleLevelId?: string | null;
    rawValue?: number | null;
    isNotApplicable?: boolean;
    rationale: string;
    evidence: EvidenceRef[];
    confidence?: number | null;
}

export interface RubricEvaluatorRequest {
    version: RubricVersionSnapshot;
    subject: { entityName: string; recordId: string };
    content: string;
}

export interface RubricEvaluatorOutput {
    /** 0..1 overall score from RubricScoring. Null when nothing applicable was scored. */
    normalizedScore: number | null;
    rationale: string;
    evidence: EvidenceRef[];
    result: RubricScoreResult;
    answers: RubricAnswer[];
}

/**
 * Turns selected leaf candidates into a scored evaluation.
 *
 * The normalized score, outcome, and per-node contributions come only from
 * {@link RubricScoring.compute}. This class does not reimplement the math.
 * The rationale is the candidates' rationales joined in tree order. Evidence
 * refs are the candidates' refs, in that same order, with duplicates kept
 * because each one is tied to a criterion.
 */
export class RubricEvaluator {
    /**
     * Scores the candidates against the version and returns the normalized
     * score, the combined rationale, and the evidence refs.
     */
    public evaluate(version: RubricVersionSnapshot, candidates: RubricCandidate[]): RubricEvaluatorOutput {
        const answers: RubricAnswer[] = candidates.map(candidate => ({
            criterionId: candidate.criterionId,
            scaleLevelId: candidate.scaleLevelId,
            rawValue: candidate.rawValue,
            isNotApplicable: candidate.isNotApplicable,
            confidence: candidate.confidence,
        }));
        const result = RubricScoring.compute({ version, answers });
        return {
            normalizedScore: result.normalizedScore,
            rationale: candidates.map(candidate => candidate.rationale).filter(text => text.length > 0).join('\n'),
            evidence: candidates.flatMap(candidate => candidate.evidence),
            result,
            answers,
        };
    }
}
