import { BaseAgent } from '@memberjunction/ai-agents';
import type { ChatMessage } from '@memberjunction/ai';
import {
    AIPromptParams,
    type ExecuteAgentParams,
    type MJAIAgentRunStepEntityExtended,
    type MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Structured result returned by {@link VideoStudioAgentBase.RunStudioPrompt}.
 */
export interface StudioPromptRunOutcome<T> {
    Result: T | null;
    PromptRunID?: string;
    ErrorMessage?: string;
}

/**
 * Shared base class for Video Studio stage agents that invoke standalone prompts
 * (`VideoStudioMotionEngineerAgent`, `VideoStudioCriticAgent`, `VideoStudioArtDirectorAgent`).
 *
 * Centralizes prompt execution via {@link RunStudioPrompt} so every prompt call:
 * - Resolves the prompt from `AIEngine.Instance.Prompts`
 * - Records a `'Prompt'` step on the agent's own run (`targetId` = prompt ID, `targetLogId` = prompt run ID)
 * - Forwards the full execution scope (`configurationId`, `apiKeys`, `CredentialScope`, `provider`,
 *   `cancellationToken`, `contextUser`) onto {@link AIPromptParams}
 * - Catches all errors into `ErrorMessage` without throwing
 */
export abstract class VideoStudioAgentBase extends BaseAgent {
    /**
     * Factory seam for constructing an {@link AIPromptRunner} instance.
     * Override or spy in unit tests to script prompt outcomes without live model calls.
     */
    protected CreatePromptRunner(): AIPromptRunner {
        return new AIPromptRunner();
    }

    /**
     * Runs a named prompt within the current agent's execution scope and records a `'Prompt'` run step.
     */
    protected async RunStudioPrompt<T>(
        params: ExecuteAgentParams,
        promptName: string,
        stepName: string,
        data: Record<string, unknown>,
        messages?: ChatMessage[],
    ): Promise<StudioPromptRunOutcome<T>> {
        let stepEntity: MJAIAgentRunStepEntityExtended | null = null;
        try {
            const prompts: MJAIPromptEntityExtended[] = Array.isArray(AIEngine.Instance?.Prompts)
                ? AIEngine.Instance.Prompts
                : [];
            const prompt = prompts.find((p) => p.Name === promptName);
            if (!prompt) {
                return {
                    Result: null,
                    ErrorMessage: `Prompt "${promptName}" was not found in AIEngine.Instance.Prompts.`,
                };
            }

            stepEntity = await this.createStepEntity({
                stepType: 'Prompt',
                stepName,
                contextUser: params.contextUser,
                targetId: prompt.ID,
                inputData: {
                    promptId: prompt.ID,
                    promptName: prompt.Name,
                    dataKeys: Object.keys(data ?? {}),
                    messageCount: messages?.length ?? 0,
                },
            });

            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = data;
            if (messages !== undefined) {
                promptParams.conversationMessages = messages;
            }
            promptParams.attemptJSONRepair = true;
            promptParams.contextUser = params.contextUser;
            promptParams.configurationId = params.configurationId;
            promptParams.apiKeys = params.apiKeys;
            promptParams.CredentialScope = params.CredentialScope;
            promptParams.provider = params.provider;
            promptParams.cancellationToken = params.cancellationToken;

            const runner = this.CreatePromptRunner();
            const runResult = await runner.ExecutePrompt<T>(promptParams);
            const promptRunId = runResult?.promptRun?.ID ?? undefined;

            if (stepEntity && promptRunId) {
                stepEntity.TargetLogID = promptRunId;
            }

            if (!runResult || !runResult.success) {
                const errorMessage =
                    runResult?.errorMessage || `Prompt "${promptName}" execution failed.`;
                if (stepEntity) {
                    await this.finalizeStepEntity(stepEntity, false, errorMessage, {
                        promptName,
                        promptRunId,
                        targetLogId: promptRunId,
                        success: false,
                    });
                }
                return {
                    Result: null,
                    ...(promptRunId ? { PromptRunID: promptRunId } : {}),
                    ErrorMessage: errorMessage,
                };
            }

            const extracted = this.extractPromptResult<T>(runResult.result, runResult.rawResult);
            if (extracted === null || extracted === undefined) {
                const errorMessage = `Prompt "${promptName}" succeeded but returned an empty or unparseable result.`;
                if (stepEntity) {
                    await this.finalizeStepEntity(stepEntity, false, errorMessage, {
                        promptName,
                        promptRunId,
                        targetLogId: promptRunId,
                        success: false,
                    });
                }
                return {
                    Result: null,
                    ...(promptRunId ? { PromptRunID: promptRunId } : {}),
                    ErrorMessage: errorMessage,
                };
            }

            if (stepEntity) {
                await this.finalizeStepEntity(stepEntity, true, undefined, {
                    promptName,
                    promptRunId,
                    targetLogId: promptRunId,
                    success: true,
                    summary: this.summarizePromptOutput(extracted),
                });
            }

            return {
                Result: extracted,
                ...(promptRunId ? { PromptRunID: promptRunId } : {}),
            };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (stepEntity) {
                try {
                    await this.finalizeStepEntity(stepEntity, false, errorMessage, {
                        promptName,
                        success: false,
                    });
                } catch {
                    // Ignore secondary step finalization errors
                }
            }
            return {
                Result: null,
                ErrorMessage: errorMessage,
            };
        }
    }

    private extractPromptResult<T>(result: T | undefined, rawResult?: string): T | null {
        if (result !== undefined && result !== null) {
            if (typeof result === 'string') {
                const parsed = this.tryParseJson<T>(result);
                return parsed !== null ? parsed : (result as unknown as T);
            }
            return result;
        }
        if (typeof rawResult === 'string' && rawResult.trim().length > 0) {
            return this.tryParseJson<T>(rawResult);
        }
        return null;
    }

    private tryParseJson<T>(raw: string): T | null {
        const trimmed = raw.trim();
        const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
        const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
        try {
            return JSON.parse(candidate) as T;
        } catch {
            return null;
        }
    }

    private summarizePromptOutput(value: unknown): Record<string, unknown> {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const record = value as Record<string, unknown>;
            const summary: Record<string, unknown> = {
                keys: Object.keys(record),
            };
            if (Array.isArray(record.Files)) {
                summary.fileCount = record.Files.length;
            }
            if (typeof record.Notes === 'string') {
                summary.notes = record.Notes;
            }
            if (typeof record.Summary === 'string') {
                summary.summaryText = record.Summary;
            }
            return summary;
        }
        return { type: typeof value };
    }
}
