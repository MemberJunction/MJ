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
import { AgentDecisionQuestion, AgentDecisionAnswerSummary } from '@memberjunction/ai-core-plus';

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
     * Optional cancellation token to abort execution.
     */
    CancellationToken?: AbortSignal;
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
        params.prompt = prompt;
        params.contextUser = args.ContextUser;
        params.State = args.State;
        params.Questions = args.Questions;
        params.cancellationToken = args.CancellationToken;
        params.agentId = args.AgentID;
        return await new AIDecisionRunner().ExecuteDecision(params);
    }

    /**
     * Maps the LLM-facing question shape (camelCase) onto BaseDecision's (PascalCase).
     */
    public static ToDecisionQuestions(questions: Record<string, AgentDecisionQuestion>): Record<string, DecisionQuestion> {
        const result: Record<string, DecisionQuestion> = {};
        for (const [key, q] of Object.entries(questions)) {
            switch (q.kind) {
                case 'Likelihood':
                    result[key] = {
                        Kind: 'Likelihood',
                        Instructions: q.instructions,
                    };
                    break;
                case 'Choice':
                    result[key] = {
                        Kind: 'Choice',
                        Instructions: q.instructions,
                        Options: q.options.map(opt => ({
                            Value: opt.value,
                            Description: opt.description,
                        })),
                    };
                    break;
                case 'Score':
                    result[key] = {
                        Kind: 'Score',
                        Instructions: q.instructions,
                        Levels: [...q.levels],
                    };
                    break;
            }
        }
        return result;
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
