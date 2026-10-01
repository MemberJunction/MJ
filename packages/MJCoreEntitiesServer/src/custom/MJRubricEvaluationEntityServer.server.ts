import { BaseEntity } from '@memberjunction/core';
import { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { submitEvaluation, type PersistedEvaluation, type PersistedScore, type SubmitEvaluationInput } from './rubrics/evaluationSubmit.js';

/**
 * Creates and submits an evaluation.
 *
 * Submit refuses a draft version, a retired version that is not the one being
 * superseded, a score for a criterion outside the version, a level from the
 * wrong scale, a raw value on a levels scale, a client-written computed row,
 * and a missing rationale or evidence when the criterion requires it.
 * It calls RubricScoring.compute and writes that result. It does not reimplement
 * the math. Score rows must be saved while this evaluation is still Draft,
 * because the score trigger rejects writes after submit.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Evaluations')
export class MJRubricEvaluationEntityServer extends MJRubricEvaluationEntity {
    /**
     * Scores the draft and copies the computed fields onto this evaluation,
     * including Status Submitted. Returns the score rows to persist first.
     */
    public submit(input: SubmitEvaluationInput): { evaluation: PersistedEvaluation; scores: PersistedScore[] } {
        const result = submitEvaluation(input);
        const written = result.evaluation;
        this.NormalizedScore = written.normalizedScore;
        this.Completeness = written.completeness;
        this.Outcome = written.outcome;
        this.Passed = written.passed;
        this.GateFailed = written.gateFailed;
        this.PassThresholdApplied = written.passThresholdApplied;
        this.BandID = written.bandId;
        this.Confidence = written.confidence;
        this.ScoringEngineVersion = written.scoringEngineVersion;
        this.Status = 'Submitted';
        return result;
    }
}
