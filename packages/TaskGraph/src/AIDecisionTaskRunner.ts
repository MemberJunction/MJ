/**
 * The default runner for Decision steps: one `AIDecisionRunner` call per step.
 *
 * It does for a Decision node what `TaskGraphPromptRunner` does for a Prompt node — find the prompt
 * the row names and run it — with one difference that matters: every question the node asks goes in
 * the same call. The questions a fork needs are about one state, and asking them together costs about
 * what one question does.
 *
 * @module @memberjunction/task-graph
 */
import { AgentDecisionService } from '@memberjunction/ai-agents';
import { SummarizeDecisionAnswers } from '@memberjunction/ai-core-plus';
import { AIDecisionParams, AIDecisionRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { TaskDecisionRunner, TaskDecisionRunParams, TaskDecisionRunResult } from './types';

/** Runs a Decision node's questions through `AIDecisionRunner`, once. */
export class AIDecisionTaskRunner implements TaskDecisionRunner {
    /** Answers the node's questions in one call. Never throws: a failure is a result. */
    public async RunDecisionForTask(params: TaskDecisionRunParams): Promise<TaskDecisionRunResult> {
        try {
            await AIEngine.Instance.Config(false, params.ContextUser);
            const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, params.PromptID));
            if (!prompt) {
                return { Success: false, ErrorMessage: `Decision prompt ${params.PromptID} is not in the engine's metadata.` };
            }

            const decisionParams = new AIDecisionParams();
            decisionParams.prompt = prompt;
            decisionParams.contextUser = params.ContextUser;
            decisionParams.State = params.State;
            // The node's options are read from its configuration on every dispatch, never cached: the
            // same options the validator checked the fork's coverage against.
            const mapping = AgentDecisionService.ToDecisionQuestions(params.Questions);
            if (mapping.Invalid.length > 0) {
                // The validator checks every question at submit, so this is a configuration that
                // bypassed it. Refuse rather than drop a question an edge may read.
                return { Success: false, ErrorMessage: `The Decision node's questions are invalid: ${mapping.Invalid.join('; ')}` };
            }
            decisionParams.Questions = mapping.Questions;

            const result = await new AIDecisionRunner().ExecuteDecision(decisionParams);
            const costUsd = typeof result.promptRun?.TotalCost === 'number' && Number.isFinite(result.promptRun.TotalCost) && result.promptRun.TotalCost > 0
                ? result.promptRun.TotalCost
                : (typeof result.cost === 'number' && Number.isFinite(result.cost) ? Math.max(0, result.cost) : undefined);
            const tokensUsed = typeof result.promptRun?.TokensUsedRollup === 'number' && Number.isFinite(result.promptRun.TokensUsedRollup) && result.promptRun.TokensUsedRollup > 0
                ? result.promptRun.TokensUsedRollup
                : (typeof result.promptRun?.TokensUsed === 'number' && Number.isFinite(result.promptRun.TokensUsed) && result.promptRun.TokensUsed > 0
                    ? result.promptRun.TokensUsed
                    : (typeof result.tokensUsed === 'number' && Number.isFinite(result.tokensUsed) ? Math.max(0, result.tokensUsed) : undefined));
            if (!result.success) {
                return {
                    Success: false,
                    ErrorMessage: result.errorMessage || 'The decision call failed.',
                    PromptRunID: result.promptRun?.ID,
                    ...(costUsd !== undefined ? { CostUsd: costUsd } : {}),
                    ...(tokensUsed !== undefined ? { TokensUsed: tokensUsed } : {}),
                };
            }
            return {
                Success: true,
                Answers: SummarizeDecisionAnswers(result.Answers),
                PromptRunID: result.promptRun?.ID,
                ...(costUsd !== undefined ? { CostUsd: costUsd } : {}),
                ...(tokensUsed !== undefined ? { TokensUsed: tokensUsed } : {}),
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[AIDecisionTaskRunner] Task ${params.TaskID} failed: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }
}
