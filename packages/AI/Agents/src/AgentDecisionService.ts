/**
 * @fileoverview Service for executing decision questions on behalf of agents.
 *
 * Wraps AIDecisionRunner and resolves decision prompts from the AIEngine catalog.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.132.0
 */

import { AIEngine } from '@memberjunction/aiengine';
import { UserInfo } from '@memberjunction/core';
import { DecisionQuestion, DecisionAnswer } from '@memberjunction/ai';
import { AIDecisionRunner, AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { AgentDecisionAnswerSummary, PickPromptExecutionScope, type AIPromptExecutionScope } from '@memberjunction/ai-core-plus';

/**
 * Parameters for the AgentDecisionService.Ask method.
 */
export interface AgentDecisionAskParams {
    /**
     * The state the questions are asked about.
     */
    State: string | Record<string, unknown>;

    /**
     * Named questions to evaluate.
     */
    Questions: Record<string, DecisionQuestion>;

    /**
     * Context user executing the decision.
     */
    ContextUser: UserInfo;

    /**
     * Optional agent ID initiating the decision.
     */
    AgentID?: string;

    /**
     * Optional prompt name to resolve from AIEngine. Defaults to 'Default Decision'.
     */
    PromptName?: string;

    /**
     * The asking run's execution scope — its configuration, runtime API keys and credential scope.
     * Without it a decision resolves no run key and, under the default scope, answers on the
     * platform's keys inside a customer's run; under `'RuntimeOnly'` that is exactly what must not
     * happen. `ContextUser` still names the user.
     */
    ExecutionScope?: AIPromptExecutionScope;

    /**
     * Optional cancellation token to abort execution.
     */
    CancellationToken?: AbortSignal;
}

/**
 * The questions of one decision request after their shapes are checked: the valid ones mapped onto
 * BaseDecision's shape, and why each invalid one was dropped.
 */
export interface DecisionQuestionMapping {
    /** The valid questions, keyed as the agent keyed them, in BaseDecision's (PascalCase) shape. */
    Questions: Record<string, DecisionQuestion>;

    /** One reason per dropped question, naming its key. Empty when every question was valid. */
    Invalid: string[];
}

/** A plain object, as opposed to null, an array or a primitive. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An array whose every item passes `guard`. */
function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
    return Array.isArray(value) && value.every(item => guard(item));
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

/** One option of a Choice question, as the model writes it. */
function isChoiceOption(value: unknown): value is { value: string; description: string } {
    return isPlainObject(value) && typeof value.value === 'string' && typeof value.description === 'string';
}

/**
 * Asks decision questions for an agent run through AIDecisionRunner and the configured decision prompt.
 */
export class AgentDecisionService {
    /**
     * The decision prompt used when none is configured.
     */
    public static readonly DEFAULT_PROMPT_NAME = 'Default Decision';

    /**
     * Evaluates decision questions against the provided state using the configured decision prompt.
     * Never throws: on failure or missing prompt, returns a failed AIDecisionRunResult.
     */
    public async Ask(args: AgentDecisionAskParams): Promise<AIDecisionRunResult> {
        try {
            await AIEngine.Instance.Config(false, args.ContextUser);
            const targetName = (args.PromptName ?? AgentDecisionService.DEFAULT_PROMPT_NAME).trim().toLowerCase();
            const prompt = AIEngine.Instance.Prompts?.find(p => (p.Name ?? '').trim().toLowerCase() === targetName);

            if (!prompt) {
                return {
                    success: false,
                    errorMessage: `Decision prompt "${args.PromptName ?? AgentDecisionService.DEFAULT_PROMPT_NAME}" not found`,
                    Answers: {},
                };
            }

            const params = new AIDecisionParams();
            if (args.ExecutionScope) {
                Object.assign(params, PickPromptExecutionScope(args.ExecutionScope));
            }
            params.prompt = prompt;
            params.contextUser = args.ContextUser;
            params.State = args.State;
            params.Questions = args.Questions;
            params.cancellationToken = args.CancellationToken;
            params.agentId = args.AgentID;
            return await new AIDecisionRunner().ExecuteDecision(params);
        } catch (error) {
            return {
                success: false,
                errorMessage: `The decision call failed: ${error instanceof Error ? error.message : String(error)}`,
                Answers: {},
            };
        }
    }

    /**
     * Checks each question's shape and maps the valid ones from the LLM-facing shape (camelCase) onto
     * BaseDecision's (PascalCase). The questions are unchecked model output, so an invalid one is
     * dropped, with its reason, rather than failing the others.
     */
    public static ToDecisionQuestions(questions: Record<string, unknown>): DecisionQuestionMapping {
        const mapping: DecisionQuestionMapping = { Questions: {}, Invalid: [] };
        for (const [key, candidate] of Object.entries(questions)) {
            const mapped = AgentDecisionService.toDecisionQuestion(candidate);
            if (typeof mapped === 'string') {
                mapping.Invalid.push(`Question "${key}" ${mapped}`);
            } else {
                mapping.Questions[key] = mapped;
            }
        }
        return mapping;
    }

    /** Maps one question, or returns why it is invalid. */
    private static toDecisionQuestion(candidate: unknown): DecisionQuestion | string {
        if (!isPlainObject(candidate)) {
            return 'is not an object';
        }
        if (typeof candidate.instructions !== 'string') {
            return 'has no "instructions" string';
        }
        switch (candidate.kind) {
            case 'Likelihood':
                return { Kind: 'Likelihood', Instructions: candidate.instructions };
            case 'Choice':
                return AgentDecisionService.toChoiceQuestion(candidate.instructions, candidate.options);
            case 'Score':
                return AgentDecisionService.toScoreQuestion(candidate.instructions, candidate.levels);
            default:
                return `has an unknown kind "${String(candidate.kind)}" (use Likelihood, Choice or Score)`;
        }
    }

    /** A Choice needs a non-empty `options` array of `{ value, description }` strings. */
    private static toChoiceQuestion(instructions: string, options: unknown): DecisionQuestion | string {
        if (!isArrayOf(options, isChoiceOption) || options.length === 0) {
            return 'is a Choice without a non-empty "options" array of { value, description } strings';
        }
        return {
            Kind: 'Choice',
            Instructions: instructions,
            Options: options.map(opt => ({
                Value: opt.value,
                Description: opt.description,
            })),
        };
    }

    /** A Score needs a non-empty `levels` array of strings, lowest first. */
    private static toScoreQuestion(instructions: string, levels: unknown): DecisionQuestion | string {
        if (!isArrayOf(levels, isString) || levels.length === 0) {
            return 'is a Score without a non-empty "levels" array of strings';
        }
        return { Kind: 'Score', Instructions: instructions, Levels: [...levels] };
    }

    /**
     * Summarises answers for the model: probability, or value and confidence.
     */
    public static SummarizeAnswers(answers: Record<string, DecisionAnswer>): Record<string, AgentDecisionAnswerSummary> {
        const result: Record<string, AgentDecisionAnswerSummary> = {};
        for (const [key, a] of Object.entries(answers)) {
            switch (a.Kind) {
                case 'Likelihood':
                    result[key] = {
                        probability: a.Probability,
                    };
                    break;
                case 'Choice':
                    result[key] = {
                        value: a.Value,
                        confidence: a.Confidence,
                    };
                    break;
                case 'Score':
                    result[key] = {
                        value: a.Value,
                        confidence: a.Confidence,
                    };
                    break;
            }
        }
        return result;
    }
}
