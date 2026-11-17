import { createHash } from 'node:crypto';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
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
import { GetGlobalObjectStore, IsValidUUID, NormalizeUUID, RegisterClass, UUIDSet, UUIDsEqual } from '@memberjunction/global';

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

const GLOBAL_KEY_COMPLETION_RUNNER = '__MJ_AI_FORMULA_COMPLETION_RUNNER__';
const GLOBAL_KEY_AI_FORMULA_RATE_LIMIT = '___SINGLETON__MJ_AI_FORMULA_RATE_LIMIT_MAP';
const AI_FORMULA_PROMPT_NAME = 'Spreadsheet MJ.AI Formula Evaluator';
const MAX_AI_FORMULA_PROMPT_BYTES = 16_384;
const MAX_AI_FORMULA_CONTEXT_BYTES = 65_536;
const MAX_AI_FORMULA_BATCH_TOTAL_BYTES = 262_144;
const MAX_AI_FORMULA_CONCURRENCY = 6;
const AI_FORMULA_RATE_WINDOW_MS = 60_000;
const AI_FORMULA_MAX_REQUESTS_PER_USER = 30;
const AI_FORMULA_MAX_CELLS_PER_USER = 200;
const AI_FORMULA_MAX_RATE_KEYS = 5_000;

interface AiFormulaRateLimitEntry {
    RequestCount: number;
    CellCount: number;
    ResetAt: number;
}

function getAiFormulaRateLimitMap(): Map<string, AiFormulaRateLimitEntry> {
    const store = GetGlobalObjectStore();
    if (!store[GLOBAL_KEY_AI_FORMULA_RATE_LIMIT]) {
        store[GLOBAL_KEY_AI_FORMULA_RATE_LIMIT] = new Map<string, AiFormulaRateLimitEntry>();
    }
    return store[GLOBAL_KEY_AI_FORMULA_RATE_LIMIT] as Map<string, AiFormulaRateLimitEntry>;
}

function consumeAiFormulaUserRateQuota(userId: string, cellCount: number): boolean {
    const key = NormalizeUUID(userId);
    const map = getAiFormulaRateLimitMap();
    const now = Date.now();
    const normalizedCells = Math.max(1, cellCount);
    if (map.size >= AI_FORMULA_MAX_RATE_KEYS) {
        for (const [k, entry] of map.entries()) {
            if (entry.ResetAt <= now) {
                map.delete(k);
            }
        }
        while (map.size >= AI_FORMULA_MAX_RATE_KEYS) {
            const oldestKey = map.keys().next().value as string | undefined;
            if (!oldestKey) {
                break;
            }
            map.delete(oldestKey);
        }
    }
    const existing = map.get(key);
    if (!existing || existing.ResetAt <= now) {
        if (normalizedCells > AI_FORMULA_MAX_CELLS_PER_USER) {
            return false;
        }
        map.set(key, {
            RequestCount: 1,
            CellCount: normalizedCells,
            ResetAt: now + AI_FORMULA_RATE_WINDOW_MS,
        });
        return true;
    }
    if (
        existing.RequestCount >= AI_FORMULA_MAX_REQUESTS_PER_USER ||
        existing.CellCount + normalizedCells > AI_FORMULA_MAX_CELLS_PER_USER
    ) {
        return false;
    }
    existing.RequestCount += 1;
    existing.CellCount += normalizedCells;
    return true;
}

function computeServerAiFormulaInputHash(
    prompt: string,
    contextValuesJson: string,
    modelOverride: string | null | undefined,
): string {
    return createHash('sha256')
        .update(`${prompt}\0${contextValuesJson}\0${(modelOverride ?? '').trim()}`, 'utf8')
        .digest('hex');
}

/**
 * Server-side Remote Operation implementing `Artifact.EvaluateAiFormula` (`§5.2b`).
 *
 * Enforces `MAX_AI_FORMULA_BATCH_CELLS` (`50`), `CanEdit` permission on a valid `ArtifactID` UUID,
 * per-user rate limiting, prompt/context byte budgets, server-computed SHA-256 deduplication,
 * bounded concurrency (`6`), and governed execution via `AIPromptRunner.ExecutePrompt`.
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_EVALUATE_AI_FORMULA_KEY)
export class ArtifactEvaluateAiFormulaServerOperation extends ArtifactEvaluateAiFormulaOperation {
    public override get DisallowMagicLinkScope(): boolean {
        return true;
    }

    public override GetScopeResourceIds(input: ArtifactEvaluateAiFormulaInput): string[] {
        return input?.ArtifactID ? [input.ArtifactID] : [];
    }

    /** Resets per-user =MJ.AI() rate limiting state (for automated tests). */
    public static ResetRateLimitForTest(): void {
        getAiFormulaRateLimitMap().clear();
    }
    /** Sets (or resets when `null`) an override completion handler for automated testing. */
    public static SetCompletionRunnerForTest(fn: AiFormulaCompletionFn | null): void {
        const store = GetGlobalObjectStore();
        if (store) {
            store[GLOBAL_KEY_COMPLETION_RUNNER] = fn;
        }
    }

    private static getCompletionRunnerForTest(): AiFormulaCompletionFn | null {
        const store = GetGlobalObjectStore();
        const candidate = store ? store[GLOBAL_KEY_COMPLETION_RUNNER] : null;
        return typeof candidate === 'function' ? (candidate as AiFormulaCompletionFn) : null;
    }

    protected override async Authorize(
        input: ArtifactEvaluateAiFormulaInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            throw new RemoteOperationError('FORBIDDEN', 'Magic Link sessions cannot evaluate =MJ.AI() spreadsheet formulas.');
        }
        const provider = context?.provider;
        if (!provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }
        const artifactId = (input.ArtifactID ?? '').trim();
        if (!artifactId || !IsValidUUID(artifactId)) {
            throw new RemoteOperationError('INVALID_INPUT', 'A valid ArtifactID UUID is required.');
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

        let totalBytes = 0;
        for (const cell of input.Cells) {
            const promptBytes = Buffer.byteLength(cell.Prompt ?? '', 'utf8');
            const ctxBytes = Buffer.byteLength(cell.ContextValuesJSON ?? '[]', 'utf8');
            if (promptBytes > MAX_AI_FORMULA_PROMPT_BYTES) {
                throw new RemoteOperationError(
                    'INPUT_TOO_LARGE',
                    `Cell prompt exceeds maximum allowed size (${MAX_AI_FORMULA_PROMPT_BYTES} bytes).`,
                );
            }
            if (ctxBytes > MAX_AI_FORMULA_CONTEXT_BYTES) {
                throw new RemoteOperationError(
                    'INPUT_TOO_LARGE',
                    `Cell context exceeds maximum allowed size (${MAX_AI_FORMULA_CONTEXT_BYTES} bytes).`,
                );
            }
            totalBytes += promptBytes + ctxBytes;
        }
        if (totalBytes > MAX_AI_FORMULA_BATCH_TOTAL_BYTES) {
            throw new RemoteOperationError(
                'INPUT_TOO_LARGE',
                `Combined batch payload exceeds maximum allowed size (${MAX_AI_FORMULA_BATCH_TOTAL_BYTES} bytes).`,
            );
        }

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
        if (!perms.CanEdit) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                perms.Reason || `Edit permission on artifact '${artifactId}' is required to evaluate =MJ.AI() formulas.`,
            );
        }
        if (!user?.ID || !consumeAiFormulaUserRateQuota(user.ID, input.Cells.length)) {
            throw new RemoteOperationError(
                'RATE_LIMITED',
                'Too many =MJ.AI() formula evaluation requests or cells. Please wait a minute before retrying.',
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: ArtifactEvaluateAiFormulaInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ArtifactEvaluateAiFormulaOutput> {
        interface UniqueWorkItem {
            CacheKey: string;
            Cell: ArtifactAiFormulaCellRequest;
            Value?: string;
            ErrorMessage?: string | null;
        }

        const workMap = new Map<string, UniqueWorkItem>();
        const cellKeys: string[] = [];

        for (const cell of input.Cells) {
            const promptText = (cell.Prompt ?? '').trim();
            const ctxJson = cell.ContextValuesJSON ?? '[]';
            const serverKey = computeServerAiFormulaInputHash(promptText, ctxJson, input.ModelOverride);
            cellKeys.push(serverKey);
            if (!workMap.has(serverKey)) {
                workMap.set(serverKey, { CacheKey: serverKey, Cell: cell });
            }
        }

        const uniqueItems = Array.from(workMap.values());
        let cursor = 0;
        const workerCount = Math.min(MAX_AI_FORMULA_CONCURRENCY, uniqueItems.length);
        const workers: Promise<void>[] = [];
        for (let w = 0; w < workerCount; w++) {
            workers.push(
                (async () => {
                    while (cursor < uniqueItems.length) {
                        const idx = cursor++;
                        const item = uniqueItems[idx];
                        try {
                            item.Value = await this.evaluateSingleCell(item.Cell, provider, user, input.ModelOverride);
                            item.ErrorMessage = null;
                        } catch (err) {
                            item.Value = '';
                            item.ErrorMessage = err instanceof Error ? err.message : String(err);
                        }
                    }
                })(),
            );
        }
        await Promise.all(workers);

        const results: ArtifactAiFormulaCellResult[] = input.Cells.map((cell, index) => {
            const item = workMap.get(cellKeys[index])!;
            return {
                SheetID: cell.SheetID,
                Address: cell.Address,
                InputHash: cell.InputHash,
                Value: item.Value ?? '',
                ErrorMessage: item.ErrorMessage ?? null,
            };
        });

        return { Results: results };
    }

    private async evaluateSingleCell(
        cell: ArtifactAiFormulaCellRequest,
        provider: IMetadataProvider,
        user: UserInfo,
        modelOverride?: string | null,
    ): Promise<string> {
        const promptText = (cell.Prompt ?? '').trim();
        if (!promptText) {
            throw new Error('=MJ.AI() requires a non-empty prompt string.');
        }

        const testRunner = ArtifactEvaluateAiFormulaServerOperation.getCompletionRunnerForTest();
        if (testRunner) {
            return await testRunner(
                promptText,
                cell.ContextValuesJSON ?? '[]',
                user,
                modelOverride,
            );
        }

        return await this.runDirectCellLlm(promptText, cell.ContextValuesJSON ?? '[]', provider, user, modelOverride);
    }

    private async runDirectCellLlm(
        prompt: string,
        contextValuesJson: string,
        provider: IMetadataProvider,
        user: UserInfo,
        modelOverride?: string | null,
    ): Promise<string> {
        try {
            await AIEngine.Instance.Config(false, user, provider);
            const promptEntity = (AIEngine.Instance.Prompts ?? []).find(
                (p) => p.Name?.trim().toLowerCase() === AI_FORMULA_PROMPT_NAME.toLowerCase(),
            );
            if (!promptEntity) {
                throw new Error(
                    `Governed AI prompt '${AI_FORMULA_PROMPT_NAME}' is not available in MJ AI Prompts metadata.`,
                );
            }

            const params = new AIPromptParams();
            params.prompt = promptEntity;
            params.contextUser = user;
            const safeContextJson = (contextValuesJson || '[]').replace(/<\/cell_values_json>/gi, '');
            params.data = {
                prompt,
                contextValuesJson: safeContextJson,
            };

            const requestedName = (modelOverride ?? '').trim().toLowerCase();
            if (requestedName) {
                const allowedModelIds = new UUIDSet(
                    (AIEngine.Instance.PromptModels ?? [])
                        .filter((pm) => UUIDsEqual(pm.PromptID, promptEntity.ID) && pm.Status === 'Active')
                        .map((pm) => pm.ModelID),
                );
                const matchedModel = (AIEngine.Instance.Models ?? []).find(
                    (m) =>
                        m.IsActive &&
                        m.AIModelType?.trim().toLowerCase() === 'llm' &&
                        ((m.Name ?? '').trim().toLowerCase() === requestedName ||
                            (m.APIName ?? '').trim().toLowerCase() === requestedName) &&
                        allowedModelIds.Has(m.ID),
                );
                if (!matchedModel) {
                    throw new Error(
                        `Requested model override '${modelOverride}' is not configured for prompt '${AI_FORMULA_PROMPT_NAME}'.`,
                    );
                }
                params.override = { modelId: matchedModel.ID };
            }

            const result = await new AIPromptRunner().ExecutePrompt(params);
            if (!result.success) {
                throw new Error(result.errorMessage || 'Governed AI prompt execution failed.');
            }
            const raw =
                typeof result.rawResult === 'string'
                    ? result.rawResult.trim()
                    : String(result.rawResult ?? '').trim();
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
