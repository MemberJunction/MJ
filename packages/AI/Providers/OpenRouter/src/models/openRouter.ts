import { BaseLLM, ChatParams } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const __openRouterURL: string = 'https://openrouter.ai/api/v1'

/**
 * The environment variable naming an ordered model preference for OpenRouter.
 *
 * Comma-separated, highest preference first, e.g.
 *   MJ_OPENROUTER_MODEL_PREFERENCE="google/gemini-3.8-flash,anthropic/claude-3-5-haiku"
 *
 * WHY AN ENVIRONMENT VARIABLE. This preference has to reach three consumers that
 * configure themselves in three different ways — a long-running server, a CodeGen
 * run, and the standalone `db-auto-doc` CLI, which builds this very class through
 * MJGlobal's ClassFactory and takes its own configuration from a JSON file it is
 * handed. The environment is the only channel all three share.
 *
 * Unset changes nothing: the request body is byte-for-byte what it was before.
 */
export const OPENROUTER_MODEL_PREFERENCE_ENV = 'MJ_OPENROUTER_MODEL_PREFERENCE';

/**
 * OpenRouter implementation is just a sub-class of the OpenAILLM that overrides the base url.
 *
 * OpenRouter routes the same model across many upstream providers at varying prices and returns the
 * authoritative dollar cost of each call directly in the response — but only when usage accounting
 * is explicitly requested. We opt in here so the inherited OpenAILLM usage normalization surfaces
 * `usage.cost` as `ModelUsage.cost`; the prompt-cost pipeline then uses that verbatim and skips
 * rate-table estimation. This means OpenRouter-routed models need no `AIModelCost` rows at all.
 */
@RegisterClass(BaseLLM, 'OpenRouterLLM')
export class OpenRouterLLM extends OpenAILLM {
    constructor(apiKey: string) {
        super(apiKey, __openRouterURL);
    }

    /**
     * The configured preference order, or an empty array when none is set.
     *
     * Read at CALL time rather than construction: a long-running server is not
     * the only consumer, and a process that configures its environment after
     * importing this module must still see the preference.
     */
    protected getModelPreference(env: NodeJS.ProcessEnv = process.env): string[] {
        const raw = env[OPENROUTER_MODEL_PREFERENCE_ENV];
        if (typeof raw !== 'string') {
            return [];
        }
        return raw
            .split(',')
            .map(m => m.trim())
            .filter(m => m.length > 0);
    }

    /**
     * Request OpenRouter's usage accounting so the response includes `usage.cost` and
     * `usage.cost_details`. The OpenAI SDK forwards this extra body param unchanged.
     * @see https://openrouter.ai/docs/use-cases/usage-accounting
     *
     * ORDERED MODEL PREFERENCE. When {@link OPENROUTER_MODEL_PREFERENCE_ENV} is set,
     * the request also carries OpenRouter's `models` array: an ordered list it walks
     * on ANY error from the one before — downtime, rate limiting, moderation, and
     * context-length validation. Billing follows the model that actually answered,
     * not the ones that failed.
     *
     * The caller's own model is always appended last, so a preference can never make
     * a deliberately chosen model unreachable — it only gets tried after the
     * preferred ones decline. That also makes the context-length case degrade
     * correctly: a prompt sized for a large-context model overflows the preferred
     * small one, OpenRouter treats that as an error, and the fall-through lands on
     * the model the caller asked for in the first place.
     *
     * `model` IS SET AS WELL, to the head of the same list, and that is deliberate
     * rather than redundant. OpenRouter documents both fields but never states which
     * wins when both are present. Setting them consistently means the same model
     * leads under either reading, instead of the behaviour depending on an ambiguity
     * in someone else's documentation.
     */
    protected override getProviderRequestExtras(params: ChatParams): Record<string, unknown> {
        const extras: Record<string, unknown> = { usage: { include: true } };

        const preference = this.getModelPreference();
        if (preference.length === 0) {
            // Byte-identical to the request this class has always sent.
            return extras;
        }

        // Preferred models first, the caller's model last. De-duplicated, because a
        // caller whose model is already in the preference list must not make the
        // list walk the same model twice — a repeat costs a whole failed attempt.
        const callerModel = typeof params?.model === 'string' ? params.model.trim() : '';
        const ordered: string[] = [];
        for (const m of [...preference, callerModel]) {
            if (m && !ordered.includes(m)) {
                ordered.push(m);
            }
        }

        extras.models = ordered;
        extras.model = ordered[0];
        return extras;
    }
}
