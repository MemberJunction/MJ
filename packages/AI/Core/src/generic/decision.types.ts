/**
 * @fileoverview Core type definitions for the MemberJunction AI Decision system.
 *
 * These types define the contract for typed decision operations across all providers
 * (LLM-based, purpose-built decision models, etc.) and are used by the BaseDecision abstract class.
 *
 * @module @memberjunction/ai
 */

import { BaseResult, ModelUsage } from './baseModel';

/**
 * A decision question with a yes/no outcome, asking whether a statement is true.
 * Returns a LikelihoodAnswer with a single probability in [0, 1].
 * The probability is the confidence; there is no separate confidence field.
 */
export interface LikelihoodQuestion {
    /**
     * Discriminator identifying this as a likelihood question.
     */
    Kind: 'Likelihood';

    /**
     * Instructions describing what statement is being evaluated.
     * Question keys are identifiers for code, not instructions to the model.
     */
    Instructions: string;
}

/**
 * An individual option for a ChoiceQuestion.
 */
export interface ChoiceOption {
    /**
     * Identifier value for code. Option values are identifiers for code
     * and carry no meaning to the model.
     */
    Value: string;

    /**
     * Description read by the model explaining what this option represents.
     */
    Description: string;
}

/**
 * A decision question selecting one label from an enumerated set of options.
 * Requires at least 2 options with unique, non-empty values and non-empty descriptions.
 */
export interface ChoiceQuestion {
    /**
     * Discriminator identifying this as a choice question.
     */
    Kind: 'Choice';

    /**
     * Instructions describing the selection criteria.
     * Question keys are identifiers for code, not instructions to the model.
     */
    Instructions: string;

    /**
     * Candidate options to choose from (minimum 2).
     */
    Options: ChoiceOption[];
}

/**
 * A decision question placing the state on an ordered rubric scale.
 * Requires at least 2 levels ordered from lowest to highest.
 */
export interface ScoreQuestion {
    /**
     * Discriminator identifying this as a score question.
     */
    Kind: 'Score';

    /**
     * Instructions describing the scoring rubric.
     * Question keys are identifiers for code, not instructions to the model.
     */
    Instructions: string;

    /**
     * Ordered rubric levels from lowest to highest (minimum 2).
     */
    Levels: string[];
}

/**
 * Union of all supported decision question types.
 */
export type DecisionQuestion = LikelihoodQuestion | ChoiceQuestion | ScoreQuestion;

/**
 * Discriminator kind for decision questions ('Likelihood' | 'Choice' | 'Score').
 */
export type DecisionQuestionKind = DecisionQuestion['Kind'];

/**
 * Parameters for a decision operation.
 */
export interface DecisionParams {
    /**
     * Provider API name (AIModelVendor.APIName) passed to the driver.
     */
    Model: string;

    /**
     * The state the questions are asked about. Keep it narrow to avoid state projection degradation.
     * Can be a non-empty string or an object with at least one key.
     */
    State: string | Record<string, unknown>;

    /**
     * Named questions, answered in one call.
     * Question keys identify answers in code and are NOT instructions to the model.
     */
    Questions: Record<string, DecisionQuestion>;

    /**
     * Optional cancellation token / AbortSignal to abort execution.
     */
    CancellationToken?: AbortSignal;
}

/**
 * Answer to a LikelihoodQuestion.
 */
export interface LikelihoodAnswer {
    /**
     * Discriminator identifying this as a likelihood answer.
     */
    Kind: 'Likelihood';

    /**
     * Probability that the statement is true, in [0, 1].
     * The probability is the confidence; there is no separate confidence field.
     */
    Probability: number;
}

/**
 * Answer to a ChoiceQuestion.
 */
export interface ChoiceAnswer {
    /**
     * Discriminator identifying this as a choice answer.
     */
    Kind: 'Choice';

    /**
     * The selected option value (matches one of the ChoiceOption.Value identifiers).
     */
    Value: string;

    /**
     * Probability distribution keyed by option Value.
     * Probabilities must sum to 1 within +-0.01.
     */
    Probabilities: Record<string, number>;

    /**
     * Confidence score in [0, 1] for the choice.
     */
    Confidence: number;
}

/**
 * Answer to a ScoreQuestion.
 */
export interface ScoreAnswer {
    /**
     * Discriminator identifying this as a score answer.
     */
    Kind: 'Score';

    /**
     * Continuous position from 0 (the first level) to Levels.length - 1 (the last level).
     * Drivers map any vendor scale onto this.
     */
    Value: number;

    /**
     * Probability distribution keyed by level name.
     * Probabilities must sum to 1 within +-0.01.
     */
    Probabilities: Record<string, number>;

    /**
     * Confidence score in [0, 1] for the score.
     */
    Confidence: number;
}

/**
 * Union of all supported decision answer types.
 */
export type DecisionAnswer = LikelihoodAnswer | ChoiceAnswer | ScoreAnswer;

/**
 * Result of a decision operation, extending BaseResult with decision answers and telemetry.
 */
export class DecisionResult extends BaseResult {
    /**
     * Map of answers matching the input Questions by key.
     * Empty on failure so consumers never act on partial or malformed answers.
     */
    Answers: Record<string, DecisionAnswer> = {};

    /**
     * Optional token or unit usage details for cost tracking.
     */
    Usage?: ModelUsage;

    /**
     * The vendor's dated or concrete model identifier when the request used an alias.
     */
    ResolvedModel?: string;

    /**
     * Creates a new DecisionResult instance.
     * @param success Whether the decision operation was successful.
     * @param startTime Execution start timestamp.
     * @param endTime Execution end timestamp.
     */
    constructor(success: boolean, startTime: Date, endTime: Date) {
        super(success, startTime, endTime);
    }
}
