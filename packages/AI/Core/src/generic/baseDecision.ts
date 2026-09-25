/**
 * @fileoverview Base class for MemberJunction AI Decision providers.
 *
 * This abstract class defines the contract for typed decision models that return
 * enumerated answers with probabilities instead of free text.
 *
 * @module @memberjunction/ai
 */

import { BaseModel } from './baseModel';
import { ErrorAnalyzer } from './errorAnalyzer';
import {
    ChoiceAnswer,
    ChoiceQuestion,
    DecisionAnswer,
    DecisionParams,
    DecisionQuestion,
    DecisionResult,
    LikelihoodAnswer,
    ScoreAnswer,
    ScoreQuestion,
} from './decision.types';

/**
 * Abstract base class for typed decision model implementations.
 * Subclasses wrap provider APIs to produce structured Likelihood, Choice, and Score answers.
 */
export abstract class BaseDecision extends BaseModel {
    /**
     * Creates an instance of BaseDecision.
     * @param apiKey The API key for the decision service provider.
     */
    constructor(apiKey: string) {
        super(apiKey);
    }

    /**
     * Executes a typed decision request across one or more questions about a given state.
     * This method wraps driver execution with input validation, output verification,
     * execution timing, and structured error handling. It never throws.
     *
     * @param params Decision request parameters including state, questions, and model.
     * @returns A Promise resolving to a DecisionResult.
     */
    public async Decide(params: DecisionParams): Promise<DecisionResult> {
        const startTime = new Date();
        try {
            const inputErrors = this.ValidateParams(params);
            if (inputErrors.length > 0) {
                const endTime = new Date();
                const failure = new DecisionResult(false, startTime, endTime);
                failure.errorMessage = inputErrors.join('; ');
                failure.Answers = {};
                return failure;
            }

            const result = await this.DoDecide(params);

            const endTime = new Date();
            if (!result || result.success === false) {
                if (result) {
                    result.startTime = startTime;
                    result.endTime = endTime;
                    return result;
                }
                const failure = new DecisionResult(false, startTime, endTime);
                failure.errorMessage = 'Driver returned null or undefined result';
                failure.Answers = {};
                return failure;
            }

            const outputErrors = this.ValidateAnswers(params, result);
            if (outputErrors.length > 0) {
                const failure = new DecisionResult(false, startTime, endTime);
                failure.errorMessage = outputErrors.join('; ');
                failure.Answers = {};
                failure.Usage = result.Usage;
                failure.ResolvedModel = result.ResolvedModel;
                return failure;
            }

            result.startTime = startTime;
            result.endTime = endTime;
            return result;
        } catch (error: unknown) {
            const endTime = new Date();
            const failure = new DecisionResult(false, startTime, endTime);
            failure.errorMessage = error instanceof Error ? error.message : String(error);
            failure.exception = error;
            failure.errorInfo = ErrorAnalyzer.AnalyzeError(error, this.constructor.name);
            failure.Answers = {};
            return failure;
        }
    }

    /**
     * Driver-specific implementation of the decision logic.
     * Must be implemented by concrete provider subclasses.
     * Returned probabilities must already be normalised, in range, and keyed correctly.
     *
     * @param params Decision parameters to evaluate.
     * @returns A Promise resolving to a DecisionResult.
     */
    protected abstract DoDecide(params: DecisionParams): Promise<DecisionResult>;

    /**
     * Validates input DecisionParams against the decision contract.
     *
     * @param params Parameters to validate.
     * @returns An array of error descriptions, empty if valid.
     */
    protected ValidateParams(params: DecisionParams): string[] {
        const errors: string[] = [];
        if (!params || typeof params !== 'object') {
            return ['DecisionParams must be an object'];
        }

        errors.push(...this.validateState(params.State));
        errors.push(...this.validateQuestions(params.Questions));
        return errors;
    }

    /**
     * Validates that State is a non-empty string once trimmed, or an object with at least one key.
     */
    private validateState(state: unknown): string[] {
        if (typeof state === 'string') {
            if (state.trim().length === 0) {
                return ['State must be a non-empty string once trimmed, or an object with at least one key'];
            }
            return [];
        }
        if (typeof state === 'object' && state !== null && !Array.isArray(state)) {
            if (Object.keys(state).length === 0) {
                return ['State must be a non-empty string once trimmed, or an object with at least one key'];
            }
            return [];
        }
        return ['State must be a non-empty string once trimmed, or an object with at least one key'];
    }

    /**
     * Validates the Questions map.
     */
    private validateQuestions(questions: unknown): string[] {
        if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
            return ['Questions must have at least one entry'];
        }
        const keys = Object.keys(questions);
        if (keys.length === 0) {
            return ['Questions must have at least one entry'];
        }

        const errors: string[] = [];
        const record = questions as Record<string, unknown>;
        for (const key of keys) {
            if (key.trim().length === 0) {
                errors.push('Question key must be a non-empty string once trimmed');
            }
            const q = record[key];
            errors.push(...this.validateSingleQuestion(key, q));
        }
        return errors;
    }

    /**
     * Validates a single question definition.
     */
    private validateSingleQuestion(key: string, q: unknown): string[] {
        if (!q || typeof q !== 'object') {
            return [`Question '${key}': Question definition must be an object`];
        }
        const question = q as Record<string, unknown>;
        const errors: string[] = [];

        if (typeof question.Instructions !== 'string' || question.Instructions.trim().length === 0) {
            errors.push(`Question '${key}': Instructions must be a non-empty string once trimmed`);
        }

        switch (question.Kind) {
            case 'Likelihood':
                break;
            case 'Choice':
                errors.push(...this.validateChoiceQuestion(key, q as ChoiceQuestion));
                break;
            case 'Score':
                errors.push(...this.validateScoreQuestion(key, q as ScoreQuestion));
                break;
            default:
                errors.push(`Question '${key}': Unknown question Kind '${String(question.Kind)}'`);
                break;
        }
        return errors;
    }

    /**
     * Validates a ChoiceQuestion's options (>= 2 options, unique non-empty Values, non-empty Descriptions).
     */
    private validateChoiceQuestion(key: string, q: ChoiceQuestion): string[] {
        const errors: string[] = [];
        if (!Array.isArray(q.Options) || q.Options.length < 2) {
            errors.push(`Question '${key}': Choice question must have at least 2 options`);
            return errors;
        }

        const seenValues = new Set<string>();
        for (const opt of q.Options) {
            if (!opt || typeof opt !== 'object') {
                errors.push(`Question '${key}': Choice option must be an object`);
                continue;
            }
            if (typeof opt.Value !== 'string' || opt.Value.trim().length === 0) {
                errors.push(`Question '${key}': Choice option Value must be a non-empty string`);
            } else if (seenValues.has(opt.Value)) {
                errors.push(`Question '${key}': Duplicate Choice option Value '${opt.Value}'`);
            } else {
                seenValues.add(opt.Value);
            }

            if (typeof opt.Description !== 'string' || opt.Description.trim().length === 0) {
                errors.push(`Question '${key}': Choice option Description must be a non-empty string`);
            }
        }
        return errors;
    }

    /**
     * Validates a ScoreQuestion's levels (>= 2 levels, unique non-empty levels).
     */
    private validateScoreQuestion(key: string, q: ScoreQuestion): string[] {
        const errors: string[] = [];
        if (!Array.isArray(q.Levels) || q.Levels.length < 2) {
            errors.push(`Question '${key}': Score question must have at least 2 levels`);
            return errors;
        }

        const seenLevels = new Set<string>();
        for (const level of q.Levels) {
            if (typeof level !== 'string' || level.trim().length === 0) {
                errors.push(`Question '${key}': Score level must be a non-empty string`);
            } else if (seenLevels.has(level)) {
                errors.push(`Question '${key}': Duplicate Score level '${level}'`);
            } else {
                seenLevels.add(level);
            }
        }
        return errors;
    }

    /**
     * Validates driver output DecisionResult against the requested questions.
     *
     * @param params Original decision request parameters.
     * @param result Result returned by the driver.
     * @returns An array of error descriptions, empty if valid.
     */
    protected ValidateAnswers(params: DecisionParams, result: DecisionResult): string[] {
        const errors: string[] = [];
        if (!result || !result.Answers || typeof result.Answers !== 'object' || Array.isArray(result.Answers)) {
            return ['Result Answers must be an object'];
        }
        if (!params || !params.Questions || typeof params.Questions !== 'object') {
            return ['Params Questions must be an object'];
        }

        const questionKeys = Object.keys(params.Questions);
        const answerKeys = Object.keys(result.Answers);

        // Every question key has exactly one answer
        for (const qKey of questionKeys) {
            if (!(qKey in result.Answers) || result.Answers[qKey] === undefined) {
                errors.push(`Question '${qKey}': Missing answer`);
            }
        }

        // No answers for keys that were not asked
        for (const aKey of answerKeys) {
            if (!(aKey in params.Questions)) {
                errors.push(`Answer provided for unexpected question '${aKey}'`);
            }
        }

        // Validate each answered question
        for (const qKey of questionKeys) {
            if (qKey in result.Answers && result.Answers[qKey] !== undefined) {
                const question = params.Questions[qKey];
                const answer = result.Answers[qKey];
                errors.push(...this.validateSingleAnswer(qKey, question, answer));
            }
        }

        return errors;
    }

    /**
     * Validates a single answer against its corresponding question.
     */
    private validateSingleAnswer(key: string, question: DecisionQuestion, answer: DecisionAnswer): string[] {
        if (!answer || typeof answer !== 'object') {
            return [`Question '${key}': Answer must be an object`];
        }

        if (answer.Kind !== question.Kind) {
            return [`Question '${key}': Answer Kind '${answer.Kind}' does not match question Kind '${question.Kind}'`];
        }

        switch (question.Kind) {
            case 'Likelihood':
                return this.validateLikelihoodAnswer(key, answer as LikelihoodAnswer);
            case 'Choice':
                return this.validateChoiceAnswer(key, question, answer as ChoiceAnswer);
            case 'Score':
                return this.validateScoreAnswer(key, question, answer as ScoreAnswer);
        }
    }

    /**
     * Validates a LikelihoodAnswer (Probability in [0, 1]).
     */
    private validateLikelihoodAnswer(key: string, answer: LikelihoodAnswer): string[] {
        const errors: string[] = [];
        if (!this.isProbabilityInUnitInterval(answer.Probability)) {
            errors.push(`Question '${key}': Likelihood Probability must be a finite number in [0, 1], got ${answer.Probability}`);
        }
        return errors;
    }

    /**
     * Validates a ChoiceAnswer (Value in options, Confidence in [0, 1], Probabilities match options and sum to 1 +-0.01).
     */
    private validateChoiceAnswer(key: string, question: ChoiceQuestion, answer: ChoiceAnswer): string[] {
        const errors: string[] = [];
        if (!this.isProbabilityInUnitInterval(answer.Confidence)) {
            errors.push(`Question '${key}': Choice Confidence must be a finite number in [0, 1], got ${answer.Confidence}`);
        }

        const validOptionValues = new Set(question.Options.map(o => o.Value));
        if (typeof answer.Value !== 'string' || !validOptionValues.has(answer.Value)) {
            errors.push(`Question '${key}': Choice value '${answer.Value}' is not one of the options`);
        }

        errors.push(...this.validateProbabilityDistribution(
            key,
            'option',
            question.Options.map(o => o.Value),
            answer.Probabilities
        ));
        return errors;
    }

    /**
     * Validates a ScoreAnswer (Value in [0, Levels.length - 1], Confidence in [0, 1], Probabilities match levels and sum to 1 +-0.01).
     */
    private validateScoreAnswer(key: string, question: ScoreQuestion, answer: ScoreAnswer): string[] {
        const errors: string[] = [];
        if (!this.isProbabilityInUnitInterval(answer.Confidence)) {
            errors.push(`Question '${key}': Score Confidence must be a finite number in [0, 1], got ${answer.Confidence}`);
        }

        const maxLevel = question.Levels.length - 1;
        if (typeof answer.Value !== 'number' || !Number.isFinite(answer.Value) || answer.Value < 0 || answer.Value > maxLevel) {
            errors.push(`Question '${key}': Score value ${answer.Value} must be a finite number in [0, ${maxLevel}]`);
        }

        errors.push(...this.validateProbabilityDistribution(
            key,
            'level',
            question.Levels,
            answer.Probabilities
        ));
        return errors;
    }

    /**
     * Validates that a probability distribution exactly matches the expected keys,
     * has valid numbers in [0, 1], and sums to 1 within +-0.01 tolerance.
     */
    private validateProbabilityDistribution(
        key: string,
        entityName: 'option' | 'level',
        expectedKeys: string[],
        probabilities: Record<string, number>
    ): string[] {
        const errors: string[] = [];
        if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) {
            return [`Question '${key}': Probabilities must be an object`];
        }

        const expectedSet = new Set(expectedKeys);
        const actualKeys = Object.keys(probabilities);

        for (const expectedKey of expectedKeys) {
            if (!(expectedKey in probabilities)) {
                errors.push(`Question '${key}': Probabilities missing key for ${entityName} '${expectedKey}'`);
            }
        }

        for (const actualKey of actualKeys) {
            if (!expectedSet.has(actualKey)) {
                errors.push(`Question '${key}': Probabilities contains unexpected key '${actualKey}'`);
            }
        }

        let sum = 0;
        let allValidNumbers = true;
        for (const actualKey of actualKeys) {
            const prob = probabilities[actualKey];
            if (!this.isProbabilityInUnitInterval(prob)) {
                errors.push(`Question '${key}': Probability for ${entityName} '${actualKey}' must be a finite number in [0, 1], got ${prob}`);
                allValidNumbers = false;
            } else {
                sum += prob;
            }
        }

        if (allValidNumbers && actualKeys.length > 0) {
            if (Math.abs(sum - 1) > 0.01 + 1e-9) {
                const formattedSum = Number(sum.toFixed(6));
                errors.push(`Question '${key}': Probabilities sum to ${formattedSum}, which is outside tolerance [0.99, 1.01]`);
            }
        }

        return errors;
    }

    /**
     * Checks if a value is a finite number in [0, 1].
     */
    private isProbabilityInUnitInterval(val: unknown): val is number {
        return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 1;
    }
}
