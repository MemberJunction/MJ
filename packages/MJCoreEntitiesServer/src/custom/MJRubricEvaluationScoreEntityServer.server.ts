import { BaseEntity, type ValidationResult } from '@memberjunction/core';
import { MJRubricEvaluationScoreEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { validateEvaluationScores, type SubmitEvaluationInput } from './rubrics/evaluationSubmit.js';

/**
 * Validates one score row against its version.
 *
 * Refuses a criterion that is not on the version, a group row written by the
 * client, a scale level that is not on the criterion's scale, and a raw value
 * on a scale that is not numeric. The evaluation server writes computed group
 * rows while the evaluation is still Draft.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Evaluation Scores')
export class MJRubricEvaluationScoreEntityServer extends MJRubricEvaluationScoreEntity {
    /** Throws RubricEvaluationError when this row is not a legal client write. */
    public assertWritable(input: SubmitEvaluationInput): void {
        validateEvaluationScores(input);
    }

    /**
     * Refuses a client-written computed row on every save. The evaluation
     * server writes those rows itself while the evaluation is still Draft.
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsComputed) {
            result.Success = false;
            result.Errors.push({ Message: 'Computed score rows are written by the server.', FieldName: 'IsComputed' } as never);
        }
        return result;
    }
}
