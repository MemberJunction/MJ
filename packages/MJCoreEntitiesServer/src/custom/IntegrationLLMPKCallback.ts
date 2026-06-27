/**
 * LLM PK inference callback used by SoftPKClassifier's LLM tier.
 *
 * The classifier cascade is:
 *   universal-convention  →  naming-heuristic  →  statistical  →  LLM  →  none
 *
 * When the deterministic tiers all yield no confident nominee, this callback
 * gets called with the object name + field list (plus sample rows when
 * available) and returns the LLM's best guess of a primary-key field.  If
 * the LLM also can't identify one, the verdict comes back `none` and the
 * pipeline drops the IO (only for `MetadataSource='Discovered'`).
 *
 * Model selection: highest-priority active LanguageModel from AIEngine.
 * API key: resolved via the central AIAPIKeys registry (no AI vendor key
 * reading happens in this file — `GetAIAPIKeyGlobal` is the central
 * server-side gate).
 *
 * If AIEngine has no active language model, or the model's driver can't be
 * resolved, the callback returns a `nominee: null, confidence: 0`
 * (skip-the-LLM-tier) result — never a fabricated PK.
 */
import { LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { GetAIAPIKeyGlobal } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type {
    LLMOneShotCallback,
    LLMPrompt,
    LLMResponse,
} from '@memberjunction/integration-pk-classifier';

/**
 * Builds an `LLMOneShotCallback` that calls a server-side LLM to infer a PK.
 * Returns `null` if AIEngine isn't loadable or no language model is active —
 * pipeline silently skips the LLM tier in that case (verdict cascades to `none`).
 */
export async function buildIntegrationLLMPKCallback(
    contextUser: UserInfo,
): Promise<LLMOneShotCallback | null> {
    try {
        await AIEngine.Instance.Config(false, contextUser);
    } catch (err) {
        LogError(`[IntegrationLLMPKCallback] AIEngine.Config failed; LLM PK tier disabled: ${err instanceof Error ? err.message : err}`);
        return null;
    }

    const models = AIEngine.Instance.LanguageModels.filter(m => m.IsActive === true);
    if (models.length === 0) {
        LogStatus(`[IntegrationLLMPKCallback] No active language model registered; LLM PK tier disabled.`);
        return null;
    }

    // Highest PowerRank wins (or first if rank not set).  The classifier doesn't
    // need a frontier model — a cheap, fast chat model is perfectly capable of
    // "given these field names + types, which is the PK?"  Sort descending so
    // priority-marked models surface first.
    const sorted = [...models].sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0));
    const model = sorted[0];
    const driverClass = model.DriverClass;
    const apiName = model.APINameOrName;
    if (!driverClass) {
        LogStatus(`[IntegrationLLMPKCallback] Selected model "${model.Name}" has no DriverClass; LLM PK tier disabled.`);
        return null;
    }

    const apiKey = GetAIAPIKeyGlobal(driverClass);
    if (!apiKey) {
        LogStatus(`[IntegrationLLMPKCallback] No API key registered for driver "${driverClass}"; LLM PK tier disabled.`);
        return null;
    }

    const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
        BaseLLM,
        driverClass,
        apiKey,
    );
    if (!llm) {
        LogStatus(`[IntegrationLLMPKCallback] ClassFactory could not instantiate BaseLLM driver "${driverClass}"; LLM PK tier disabled.`);
        return null;
    }

    LogStatus(`[IntegrationLLMPKCallback] LLM PK tier active using ${driverClass} / ${apiName}.`);

    return async function llmPKInference(prompt: LLMPrompt): Promise<LLMResponse> {
        const systemMsg =
            `You are a database schema expert. Given a table's field list (and optional sample rows), ` +
            `identify the single field most likely to be the primary key. ` +
            `A primary key is unique, non-null, and immutable. ` +
            `Common patterns: an "Id"/"<TableName>Id"/"UUID"/"GUID" field, ` +
            `a system-generated identifier, or an int/long that's required + read-only + unique. ` +
            `If no field plausibly qualifies (e.g. all fields are descriptive text, the table looks like a view or value list), ` +
            `return nominee=null. NEVER guess a non-existent field name.`;

        const userMsg =
            `Table: ${prompt.objectName}\n` +
            `Fields (${prompt.fields.length}):\n` +
            prompt.fields
                .map(
                    f =>
                        `  - ${f.name}` +
                        `${f.type ? ` (${f.type})` : ''}` +
                        `${f.length != null ? ` length=${f.length}` : ''}` +
                        `${f.isUnique ? ' UNIQUE' : ''}`,
                )
                .join('\n') +
            (prompt.sampleSnippet
                ? `\n\nSample rows (JSON, may be truncated):\n${prompt.sampleSnippet}`
                : '') +
            `\n\nReturn STRICT JSON ONLY with this exact shape:\n` +
            `{"nominee": "<field-name-or-null>", "confidence": <0..1>, "reason": "<one-line>"}`;

        const params: ChatParams = {
            model: apiName,
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg },
            ],
            temperature: 0.1,
            responseFormat: 'JSON',
        };

        try {
            const result: ChatResult = await llm.ChatCompletion(params);
            if (!result.success) {
                LogStatus(`[IntegrationLLMPKCallback] LLM call for "${prompt.objectName}" failed: ${result.errorMessage}`);
                return { nominee: null, confidence: 0, reason: `LLM call failed: ${result.errorMessage ?? 'unknown'}` };
            }
            const content = result.data.choices?.[0]?.message?.content;
            if (!content) {
                return { nominee: null, confidence: 0, reason: 'LLM returned no content.' };
            }
            const parsed = JSON.parse(content) as Partial<LLMResponse>;
            const nominee = parsed.nominee && prompt.fields.some(f => f.name === parsed.nominee)
                ? parsed.nominee
                : null;
            const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
            const reason = typeof parsed.reason === 'string' ? parsed.reason : 'LLM verdict.';
            return { nominee, confidence, reason };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogStatus(`[IntegrationLLMPKCallback] LLM call threw for "${prompt.objectName}": ${msg}`);
            return { nominee: null, confidence: 0, reason: `Exception during LLM inference: ${msg}` };
        }
    };
}
