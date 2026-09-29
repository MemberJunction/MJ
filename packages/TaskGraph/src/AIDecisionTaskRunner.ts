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
            decisionParams.Questions = AgentDecisionService.ToDecisionQuestions(params.Questions);

            const result = await new AIDecisionRunner().ExecuteDecision(decisionParams);
            if (!result.success) {
                return {
                    Success: false,
                    ErrorMessage: result.errorMessage || 'The decision call failed.',
                    PromptRunID: result.promptRun?.ID,
                };
            }
            return { Success: true, Answers: SummarizeDecisionAnswers(result.Answers), PromptRunID: result.promptRun?.ID };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[AIDecisionTaskRunner] Task ${params.TaskID} failed: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }
}
