import { BaseLLM, ChatMessageRole, ChatParams, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import {
    BaseRemotableOperation,
    type IMetadataProvider,
    LogError,
    RemoteOperationError,
    type RemoteOpServerContext,
    type UserInfo,
} from '@memberjunction/core';
import {
    ARTIFACT_EVALUATE_AI_FORMULA_KEY,
    type ArtifactAiFormulaCellRequest,
    type ArtifactAiFormulaCellResult,
    type ArtifactEvaluateAiFormulaInput,
    ArtifactEvaluateAiFormulaOperation,
    type ArtifactEvaluateAiFormulaOutput,
    ArtifactPermissionEngine,
    MAX_AI_FORMULA_BATCH_CELLS,
} from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';

/**
 * Pluggable LLM completion callback used by {@link ArtifactEvaluateAiFormulaServerOperation}
 * (overridable in unit tests without live AI provider credentials).
 */
export type AiFormulaCompletionFn = (
    prompt: string,
    contextValuesJson: string,
    user: UserInfo,
    modelOverride?: string | null,
) => Promise<string>;

const AI_FORMULA_SYSTEM_PROMPT = [
    'You are evaluating an explicit spreadsheet cell formula of the form =MJ.AI(prompt, [context]).',
    'Return ONLY the concise scalar cell result (a short string, number, boolean, or concise phrase).',
    'Do not include markdown code fences, explanations, headings, or conversational preamble.',
].join(' ');

/**
 * Server-side Remote Operation implementing `Artifact.EvaluateAiFormula` (`§5.2b`).
 *
 * Enforces `MAX_AI_FORMULA_BATCH_CELLS` (`50`), `CanEdit` permission when `ArtifactID` is given,
 * deduplicates identical prompts/context inputs within the batch, and executes via `AIEngine` / `BaseLLM`.
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_EVALUATE_AI_FORMULA_KEY)
export class ArtifactEvaluateAiFormulaServerOperation extends ArtifactEvaluateAiFormulaOperation {
    private static _customCompletionRunner: AiFormulaCompletionFn | null = null;

    /** Sets (or resets when `null`) an override completion handler for automated testing. */
    public static SetCompletionRunnerForTest(fn: AiFormulaCompletionFn | null): void {
        ArtifactEvaluateAiFormulaServerOperation._customCompletionRunner = fn;
    }

    protected override async Authorize(
        input: ArtifactEvaluateAiFormulaInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        const provider = context?.provider;
        if (!provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }
        if (!Array.isArray(input.Cells)) {
            throw new RemoteOperationError('INVALID_INPUT', 'Cells array is required.');
        }
        if (input.Cells.length > MAX_AI_FORMULA_BATCH_CELLS) {
            throw new RemoteOperationError(
                'BATCH_LIMIT_EXCEEDED',
                `=MJ.AI() batch evaluation is capped at ${MAX_AI_FORMULA_BATCH_CELLS} cells per request (received ${input.Cells.length}).`,
            );
        }

        const artifactId = (input.ArtifactID ?? '').trim();
        if (artifactId) {
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
            if (!perms.CanEdit) {
                throw new RemoteOperationError(
                    'ACCESS_DENIED',
                    perms.Reason || `Edit permission on artifact '${artifactId}' is required to evaluate =MJ.AI() formulas.`,
                );
            }
        }
        return true;
    }

    protected override async InternalExecute(
        input: ArtifactEvaluateAiFormulaInput,
        _provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ArtifactEvaluateAiFormulaOutput> {
        const results: ArtifactAiFormulaCellResult[] = [];
        const dedupedCache = new Map<string, Promise<string>>();

        for (const cell of input.Cells) {
            const cacheKey = `${cell.InputHash}::${input.ModelOverride ?? ''}`;
            let valuePromise = dedupedCache.get(cacheKey);
            if (!valuePromise) {
                valuePromise = this.evaluateSingleCell(cell, user, input.ModelOverride);
                dedupedCache.set(cacheKey, valuePromise);
            }

            try {
                const value = await valuePromise;
                results.push({
                    SheetID: cell.SheetID,
                    Address: cell.Address,
                    InputHash: cell.InputHash,
                    Value: value,
                    ErrorMessage: null,
                });
            } catch (err) {
                results.push({
                    SheetID: cell.SheetID,
                    Address: cell.Address,
                    InputHash: cell.InputHash,
                    Value: '',
                    ErrorMessage: err instanceof Error ? err.message : String(err),
                });
            }
        }

        return { Results: results };
    }

    private async evaluateSingleCell(
        cell: ArtifactAiFormulaCellRequest,
        user: UserInfo,
        modelOverride?: string | null,
    ): Promise<string> {
        const promptText = (cell.Prompt ?? '').trim();
        if (!promptText) {
            throw new Error('=MJ.AI() requires a non-empty prompt string.');
        }

        if (ArtifactEvaluateAiFormulaServerOperation._customCompletionRunner) {
            return await ArtifactEvaluateAiFormulaServerOperation._customCompletionRunner(
                promptText,
                cell.ContextValuesJSON ?? '[]',
                user,
                modelOverride,
            );
        }

        return await this.runDirectCellLlm(promptText, cell.ContextValuesJSON ?? '[]', user, modelOverride);
    }

    private async runDirectCellLlm(
        prompt: string,
        contextValuesJson: string,
        user: UserInfo,
        modelOverride?: string | null,
    ): Promise<string> {
        try {
            await AIEngine.Instance.Config(false, user);
            const activeModels = (AIEngine.Instance.Models ?? []).filter(
                (m) => m.AIModelType?.trim().toLowerCase() === 'llm' && m.IsActive && m.DriverClass,
            );
            const keyReadyModels = activeModels.filter((m) => {
                try {
                    const key = GetAIAPIKey(m.DriverClass);
                    return Boolean(key && key.trim().length > 0);
                } catch {
                    return false;
                }
            });
            if (keyReadyModels.length === 0) {
                throw new Error('No active LLM provider API key is configured for =MJ.AI() evaluation.');
            }

            const requestedName = (modelOverride ?? '').trim().toLowerCase();
            const model =
                (requestedName
                    ? keyReadyModels.find(
                          (m) =>
                              (m.Name ?? '').trim().toLowerCase() === requestedName ||
                              (m.APIName ?? '').trim().toLowerCase() === requestedName,
                      )
                    : undefined) ||
                keyReadyModels.find((m) => m.DriverClass === 'OpenAILLM') ||
                keyReadyModels.find((m) => m.DriverClass === 'AnthropicLLM') ||
                keyReadyModels.find((m) => m.DriverClass === 'GeminiLLM') ||
                keyReadyModels[0];

            const apiKey = GetAIAPIKey(model.DriverClass);
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);
            if (!llm) {
                throw new Error(`Unable to instantiate LLM driver '${model.DriverClass}'.`);
            }

            const userMessage = [
                `Prompt: ${prompt}`,
                `Referenced cell/range values JSON: ${contextValuesJson || '[]'}`,
            ].join('\n');

            const chatParams = new ChatParams();
            chatParams.model = model.APIName;
            chatParams.messages = [
                { role: ChatMessageRole.system, content: AI_FORMULA_SYSTEM_PROMPT },
                { role: ChatMessageRole.user, content: userMessage },
            ];

            const result = await llm.ChatCompletion(chatParams);
            const raw = result?.data?.choices?.[0]?.message?.content?.trim() ?? '';
            if (!raw) {
                throw new Error('AI model returned an empty response.');
            }
            return raw;
        } catch (err) {
            LogError(
                `ArtifactEvaluateAiFormulaServerOperation failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            throw err;
        }
    }
}

/** Ensures {@link ArtifactEvaluateAiFormulaServerOperation} is retained by tree-shakers and registered in ClassFactory. */
export function LoadArtifactEvaluateAiFormulaOperation(): void {
    void ArtifactEvaluateAiFormulaServerOperation;
}
