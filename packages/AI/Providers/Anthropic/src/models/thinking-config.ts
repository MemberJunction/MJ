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
 * `claude-haiku-4-5-20251001`) only know the budget form, so the split has to be by version (see
 * `ParseClaudeVersion`). A name with no version number keeps the budget form, which is the behaviour
 * every existing caller already had.
 *
 * This answers only "which thinking form". Whether a model rejects sampling parameters is a separate
 * question with a different cutoff — see {@link RejectsSamplingParams}.
 */
export function UsesAdaptiveThinking(model: string): boolean {
    const version = ParseClaudeVersion(model);
    if (!version) return false;
    return version.major >= 5 || (version.major === 4 && version.minor >= 6);
}

/**
 * Whether a Claude model rejects non-default sampling parameters (`temperature`, `top_p`, `top_k`) on EVERY
 * request, whether or not thinking is on.
 *
 * This is a different cutoff from {@link UsesAdaptiveThinking}, and the two must not be conflated. Anthropic's
 * list of always-reject models is Claude Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Mythos Preview, Opus 5.5,
 * Opus 5, Opus 4.8, Opus 4.7, Sonnet 5.5, Sonnet 5 and Haiku 5.5. Claude Opus 4.6 and Sonnet 4.6 take adaptive
 * thinking but are NOT on that list: thinking is off there until requested, and while it is off they accept a
 * caller's temperature. Dropping it on 4.6 silently changes sampling with nothing in the response to show it.
 *
 * Expressed as a version cutoff (4.7+, plus the unversioned Mythos Preview name) rather than an explicit id list
 * on purpose: a new Claude 5 model added to metadata is covered on day one. An id list would leave a new model
 * sending its temperature and taking a 400 on every request until someone extended the list, which is the exact
 * outage class this predicate exists to prevent. The cutoff is pinned per model in the unit tests, so a change
 * to the docs list shows up as a test to update rather than a production 400.
 *
 * Docs: https://platform.claude.com/docs/en/build-with-claude/thinking#limits-and-feature-compatibility ("Sampling parameters")
 */
export function RejectsSamplingParams(model: string): boolean {
    if (model.toLowerCase().includes('mythos-preview')) return true;
    const version = ParseClaudeVersion(model);
    if (!version) return false;
    return version.major >= 5 || (version.major === 4 && version.minor >= 7);
}

/**
 * Reads the major/minor version out of a Claude model id. Model ids put the numbers either after the family
 * (`claude-sonnet-4-6`, `claude-fable-5-1`, `claude-haiku-4-5-20251001`) or before it (`claude-3-7-sonnet-20250219`).
 * The first numeric token is the major version and the second, when present, the minor; a trailing 8-digit date
 * is not a version. Returns `undefined` for a name with no version number.
 */
function ParseClaudeVersion(model: string): { major: number; minor: number } | undefined {
    const tokens = model.toLowerCase().replace(/^claude-/, '').split('-').filter((t) => !/^\d{8}$/.test(t));
    const numeric = tokens.filter((t) => /^\d+$/.test(t)).map((t) => Number.parseInt(t, 10));
    if (numeric.length === 0) return undefined;
    return { major: numeric[0], minor: numeric[1] ?? 0 };
}

/** The sampling parameters a caller asked for, in MJ's vocabulary. */
export interface SamplingInput {
    temperature?: number | null;
    topP?: number | null;
    topK?: number | null;
}

/** The sampling fields that may be put on the Anthropic request. Absent means "do not send". */
export interface SamplingRequestFields {
    temperature?: number;
    top_p?: number;
    top_k?: number;
}

/**
 * Decides which of the caller's sampling parameters the Anthropic request may carry for `model`, given whether
 * this request thinks. Both the non-streaming and streaming paths go through here so they cannot drift.
 *
 * Rules, from the "Sampling parameters" section of the thinking docs:
 *  - Always-reject models ({@link RejectsSamplingParams}): a non-default `temperature`, `top_p` or `top_k` is a
 *    400 on every request. `temperature: 1` (the default) is accepted on its own — but "a request that includes
 *    both `temperature` and `top_p`, even at their defaults" is a 400, and the `top_p` default there is 0.99, so
 *    `top_p` is never sent to these models. Nor is `top_k`.
 *  - Older models while thinking is on: `temperature` and `top_k` are incompatible with thinking; `top_p` is
 *    allowed at values between 0.95 and 1. `temperature: 1` is kept, as it was before.
 *  - Older models with thinking off: everything passes through.
 *
 * Keeping `temperature: 1` relies on the SDK's pinned API version (`anthropic-version: 2023-06-01`, which the
 * driver does not override). From API version `2026-10-21` any sampling parameter at any value is a 400 on every
 * model, so a version bump must revisit this and drop the default too.
 *
 * Docs: https://platform.claude.com/docs/en/build-with-claude/thinking#limits-and-feature-compatibility ("Sampling parameters")
 */
export function ResolveSamplingParams(model: string, thinkingOn: boolean, input: SamplingInput): SamplingRequestFields {
    const alwaysRejects = RejectsSamplingParams(model);
    const restricted = alwaysRejects || thinkingOn;
    const fields: SamplingRequestFields = {};

    if (input.temperature != null) {
        if (!restricted || input.temperature === 1) {
            fields.temperature = input.temperature;
        }
    }
    if (input.topK != null && !restricted) {
        fields.top_k = input.topK;
    }
    if (input.topP != null && !alwaysRejects) {
        if (!thinkingOn || (input.topP >= 0.95 && input.topP <= 1)) {
            fields.top_p = input.topP;
        }
    }
    return fields;
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
        const raw = effortLevel.trim().toLowerCase();
        // `effortLevel` is a single prompt/agent-level setting with no per-vendor scoping, and
        // model selection or failover can land the same value on any provider. OpenAI spells the
        // top band `xhigh` where Anthropic spells it `max`; treat them as the synonyms they are
        // rather than failing a run for using the other vendor's word for "most effort".
        const level = raw === 'xhigh' ? 'max' : raw;
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
