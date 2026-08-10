/**
 * @fileoverview MJServer's implementation of the task-graph `TaskPromptRunner` seam.
 *
 * The third sibling of {@link TaskGraphAgentRunner} and {@link TaskGraphActionRunner}, and here for
 * the same reason: the dispatcher knows *when* a prompt-assigned node should run and nothing about
 * how a prompt executes. The AI engine depends on the entity layer the dispatcher also builds on, so
 * importing it into `@memberjunction/task-graph` would make every consumer of durable execution load
 * the prompt engine too.
 *
 * **Why prompt nodes matter enough to have their own runner.** The `User Onboarding Flow Agent`
 * ships with six of them. Until this existed, every one of its steps was refused at submission and
 * the agent could not run at all — the refusal was correct (a persisted step nothing can execute
 * waits forever) but it made a shipped workflow unusable rather than merely unfinished.
 *
 * @module @memberjunction/server
 */
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { TaskPromptRunner, TaskPromptRunParams, TaskPromptRunResult } from '@memberjunction/task-graph';

/** The placeholder a workflow prompt uses to receive the payload (plan §5.7). */
const CURRENT_PAYLOAD_PLACEHOLDER = '_CURRENT_PAYLOAD';

export class TaskGraphPromptRunner implements TaskPromptRunner {
    public async RunPromptForTask(params: TaskPromptRunParams): Promise<TaskPromptRunResult> {
        try {
            await AIEngine.Instance.Config(false, params.ContextUser);
            const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, params.PromptID));
            if (!prompt) {
                return { Success: false, ErrorMessage: `Prompt ${params.PromptID} is not in the engine's metadata.` };
            }

            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.contextUser = params.ContextUser;
            promptParams.data = this.buildData(params);

            const result = await new AIPromptRunner().ExecutePrompt(promptParams);
            if (!result?.success) {
                return {
                    Success: false,
                    ErrorMessage: result?.errorMessage ?? 'The prompt did not return a result.',
                    PromptRunID: result?.promptRun?.ID,
                };
            }

            const parsed = this.parseResponse(result.result);
            return {
                Success: true,
                Output: parsed.payload,
                PromptRunID: result.promptRun?.ID,
                ChatMessage: parsed.chatMessage,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[TaskGraphPromptRunner] Task ${params.TaskID} failed: ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * What the prompt's template can see.
     *
     * The payload arrives under a **placeholder name** rather than being spread across the top level,
     * so a workflow author writes `{{ _CURRENT_PAYLOAD }}` and gets the whole thing — and a payload
     * key can never collide with a template parameter and silently win.
     *
     * `flowContext` carries what the step knows about its own position: what its prerequisites
     * produced. Without it a prompt is reasoning about the payload alone and cannot refer to the step
     * immediately before it.
     */
    private buildData(params: TaskPromptRunParams): Record<string, unknown> {
        const payload = params.InputPayload && typeof params.InputPayload === 'object'
            ? params.InputPayload as Record<string, unknown>
            : {};

        const dependencyOutputs: Record<string, unknown> = {};
        for (const [taskID, output] of params.DependencyOutputs) dependencyOutputs[taskID] = output;

        return {
            ...(params.TemplateParameters ?? {}),
            [CURRENT_PAYLOAD_PLACEHOLDER]: payload,
            flowContext: { dependencyOutputs },
        };
    }

    /**
     * Reads the model's response as a payload update, and notices when it wants to stop.
     *
     * **A prompt is the only node kind that can end the workflow early**, because it is the only one
     * doing open-ended reasoning: it can conclude the remaining steps are unnecessary. That is
     * expressed as a Chat-shaped response, and the dispatcher honours it by skipping what remains and
     * settling the parent Complete — rather than treating an early finish as an abandoned graph.
     *
     * Non-JSON is not an error. A prompt that answers in prose has still answered; it simply carries
     * no structured update, so it becomes a message rather than a payload merge.
     */
    private parseResponse(raw: unknown): { payload?: Record<string, unknown>; chatMessage?: string } {
        if (raw == null) return {};

        if (typeof raw === 'object') {
            return this.interpret(raw as Record<string, unknown>);
        }

        if (typeof raw === 'string') {
            const text = raw.trim();
            const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            try {
                const parsed: unknown = JSON.parse(fenced);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return this.interpret(parsed as Record<string, unknown>);
                }
            } catch {
                // Prose, not JSON — see above.
            }
            return { chatMessage: text };
        }

        return {};
    }

    /** Separates "here is an update" from "we are done, tell them this". */
    private interpret(obj: Record<string, unknown>): { payload?: Record<string, unknown>; chatMessage?: string } {
        const nextStep = obj['nextStep'] as { type?: string } | undefined;
        const wantsChat = nextStep?.type === 'Chat' || obj['taskComplete'] === true;
        const message = typeof obj['message'] === 'string' ? obj['message'] : undefined;

        if (wantsChat && message) {
            // The payload still merges: a prompt that both concluded and produced data should not
            // lose the data because it also had something to say.
            return { payload: obj, chatMessage: message };
        }
        return { payload: obj };
    }
}
