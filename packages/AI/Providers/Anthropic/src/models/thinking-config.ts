import { OutputConfig, ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * The `output_config.effort` values Anthropic accepts, in ascending order.
 */
export const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'max'] as const;
export type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number];

/**
 * Whether a Claude model takes the ADAPTIVE thinking form — `thinking: { type: 'adaptive' }` plus
 * `output_config: { effort }` — rather than the manual budget form `thinking: { type: 'enabled',
 * budget_tokens }`.
 *
 * Adaptive thinking arrived with Claude 4.6. The Claude 5 family REJECTS the budget form outright:
 * observed on `claude-sonnet-5`, HTTP 400 `"thinking.type.enabled" is not supported for
 * this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.`
 * Every request that carried an effort level failed before reaching the model, which turned an
 * evaluation cell into 80% infrastructure loss. Claude 4.5 and earlier (including
 * `claude-haiku-4-5-20251001`) only know the budget form, so the split has to be by version.
 *
 * Version parsing: model ids put the numbers either after the family (`claude-sonnet-4-6`,
 * `claude-fable-5-1`, `claude-haiku-4-5-20251001`) or before it (`claude-3-7-sonnet-20250219`).
 * The first numeric token is the major version and the second, when present, the minor; a trailing
 * 8-digit date is not a version. A name with no version number keeps the budget form, which is the
 * behaviour every existing caller already had.
 */
export function UsesAdaptiveThinking(model: string): boolean {
    const tokens = model.toLowerCase().replace(/^claude-/, '').split('-').filter((t) => !/^\d{8}$/.test(t));
    const numeric = tokens.filter((t) => /^\d+$/.test(t)).map((t) => Number.parseInt(t, 10));
    if (numeric.length === 0) return false;
    const major = numeric[0];
    const minor = numeric[1] ?? 0;
    return major >= 5 || (major === 4 && minor >= 6);
}

/**
 * Converts MJ's effort level to an Anthropic `output_config.effort` value.
 *
 * Numeric 1-100 uses the same three bands as the OpenAI, Groq and Cerebras drivers (≤33 low,
 * ≤66 medium, else high) so an `effortLevel: 50` means the same thing on every provider. Named
 * values pass through, which is the only way to reach `'max'`. `'none'` — OpenAI's vocabulary for
 * "do not reason" — has no Anthropic equivalent and is answered by omitting thinking altogether;
 * callers see that as `undefined` here.
 */
export function MapEffortLevelToAnthropicEffort(effortLevel: string): AnthropicEffort | undefined {
    const numValue = Number.parseInt(effortLevel, 10);
    if (Number.isNaN(numValue)) {
        const level = effortLevel.trim().toLowerCase();
        if (level === 'none') return undefined;
        if ((ANTHROPIC_EFFORTS as readonly string[]).includes(level)) {
            return level as AnthropicEffort;
        }
        throw new Error(`Invalid effortLevel: ${effortLevel} (expected 1-100, 'none', or one of ${ANTHROPIC_EFFORTS.join(', ')})`);
    }
    if (numValue <= 33) return 'low';
    if (numValue <= 66) return 'medium';
    return 'high';
}

export interface AnthropicThinkingInput {
    /** Model id as sent to the API. */
    model: string;
    /** MJ effort level — numeric string 1-100, a named level, or absent. */
    effortLevel?: string | null;
    /**
     * The manual thinking budget the caller has already resolved for the BUDGET form, or `undefined`
     * when the caller decided the budget form does not apply (no budget given, budget too small).
     * Ignored for adaptive models, which have no budget.
     */
    budgetTokens?: number;
}

export interface AnthropicThinkingRequest {
    thinking?: ThinkingConfigParam;
    output_config?: OutputConfig;
}

/**
 * The request fields that switch thinking on for one call, in whichever form the model accepts.
 * Returns an empty object when thinking should be off — no effort level, effort `'none'`, or a
 * budget-form model with no usable budget — so callers can spread the result onto the request.
 */
export function BuildAnthropicThinking(input: AnthropicThinkingInput): AnthropicThinkingRequest {
    if (!input.effortLevel) return {};
    if (UsesAdaptiveThinking(input.model)) {
        const effort = MapEffortLevelToAnthropicEffort(input.effortLevel);
        if (!effort) return {};
        return { thinking: { type: 'adaptive' }, output_config: { effort } };
    }
    if (input.budgetTokens === undefined) return {};
    // The budget form carries no effort name, so only 'none' matters here; any other value keeps
    // the lenient pre-existing behaviour (a truthy effort level switches thinking on).
    if (input.effortLevel.trim().toLowerCase() === 'none') return {};
    return { thinking: { type: 'enabled', budget_tokens: input.budgetTokens } };
}
