import { BaseAction } from '@memberjunction/actions';
import type { RunActionParams, ActionResultSimple, ActionParam } from '@memberjunction/actions-base';
import { LogError, LogStatus } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { ChatMessage } from '@memberjunction/ai';

/**
 * Action: BLA - Execute Prompt
 *
 * Inputs (typically wired from BLA - Assemble Prompt's outputs via Flow agent payload):
 *   - ResolvedPromptID       (required) the __mj.AIPrompt.ID to execute
 *   - AssembledSystemText    (required) string that fills the seed Template's {{BettyPrompt}} placeholder
 *   - AssembledMessages      (required) JSON ChatMessage[] passed to AIPromptParams.conversationMessages
 *   - ConfigurationID        (optional) AI Configuration override
 *
 * Outputs:
 *   - ResponseText           the raw model output text
 *   - PromptRunID            the __mj.AIPromptRun row for traceability
 *   - PromptTokens, CompletionTokens, TokensUsed
 *   - Cost                   if provided by the model vendor
 *   - ExecutionTimeMs
 *
 * Critical detail: `templateMessageRole = 'none'` so the rendered template is
 * NOT injected as an extra message in the conversation. The structured
 * AssembledMessages already carry every role-tagged block in the right order;
 * the seed Template's text only serves as an audit artifact captured on the
 * AIPromptRun row.
 */
@RegisterClass(BaseAction, '__BLA_ExecutePrompt')
export class BLAExecutePromptAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const resolvedPromptID = this.getStringParam(params, 'ResolvedPromptID');
            if (!resolvedPromptID) {
                return { Success: false, ResultCode: 'MISSING_PROMPT_ID', Message: "Required parameter 'ResolvedPromptID' was not provided." };
            }

            const assembledSystemText = this.getStringParam(params, 'AssembledSystemText') ?? '';
            const assembledMessages = this.parseMessages(params);
            const configurationID = this.getStringParam(params, 'ConfigurationID');

            if (!params.ContextUser) {
                return { Success: false, ResultCode: 'MISSING_USER_CONTEXT', Message: 'User context is required to execute the prompt.' };
            }

            // Ensure AIEngine is hydrated so we can resolve the prompt entity from cache
            await AIEngine.Instance.Config(false, params.ContextUser);

            const prompt = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, resolvedPromptID));
            if (!prompt) {
                return { Success: false, ResultCode: 'PROMPT_NOT_FOUND', Message: `AIEngine.Instance.Prompts has no row matching ID '${resolvedPromptID}'. The prompt may exist in the DB but not be Active.` };
            }

            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = { BettyPrompt: assembledSystemText };
            promptParams.conversationMessages = assembledMessages;
            // The rendered template is not added as a chat message — it's only
            // used to populate the AIPromptRun's audit-text view. The structured
            // conversationMessages above carry the actual content to the model.
            promptParams.templateMessageRole = 'none';
            promptParams.contextUser = params.ContextUser;
            if (configurationID) {
                promptParams.configurationId = configurationID;
            }

            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt(promptParams);

            const responseText = result.rawResult ?? '';
            const promptRunID = result.promptRun?.ID ?? null;

            this.addOutputParam(params, 'ResponseText', responseText);
            this.addOutputParam(params, 'PromptRunID', promptRunID);
            this.addOutputParam(params, 'PromptTokens', result.promptTokens ?? null);
            this.addOutputParam(params, 'CompletionTokens', result.completionTokens ?? null);
            this.addOutputParam(params, 'TokensUsed', result.tokensUsed ?? null);
            this.addOutputParam(params, 'Cost', result.cost ?? null);
            this.addOutputParam(params, 'ExecutionTimeMs', result.executionTimeMS ?? null);

            if (!result.success) {
                LogError(`[BLA_ExecutePrompt] ExecutePrompt returned success=false: ${result.errorMessage ?? '(no error message)'}`);
                return {
                    Success: false,
                    ResultCode: 'EXECUTION_FAILED',
                    Message: result.errorMessage ?? 'AIPromptRunner.ExecutePrompt returned success=false with no error message.',
                };
            }

            LogStatus(`[BLA_ExecutePrompt] Prompt ${prompt.Name} executed — ${result.tokensUsed ?? 0} tokens, ${result.executionTimeMS ?? 0}ms, run=${promptRunID ?? '<no run>'}`);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: responseText,
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[BLA_ExecutePrompt] Unexpected failure: ${msg}`);
            return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: msg };
        }
    }

    private parseMessages(params: RunActionParams): ChatMessage[] {
        const raw = this.getStringParam(params, 'AssembledMessages');
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
        } catch (e) {
            LogError(`[BLA_ExecutePrompt] AssembledMessages was not valid JSON; treating as empty: ${e instanceof Error ? e.message : String(e)}`);
            return [];
        }
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const found = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!found || found.Value === undefined || found.Value === null) return undefined;
        const value = String(found.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find(p => p.Name === name);
        if (existing) {
            existing.Value = value;
            existing.Type = 'Output';
            return;
        }
        params.Params.push({ Name: name, Type: 'Output', Value: value } as ActionParam);
    }
}
