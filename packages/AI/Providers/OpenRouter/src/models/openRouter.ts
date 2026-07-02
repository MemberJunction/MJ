import { BaseLLM, ChatParams } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const __openRouterURL: string = 'https://openrouter.ai/api/v1'

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
     * Request OpenRouter's usage accounting so the response includes `usage.cost` and
     * `usage.cost_details`. The OpenAI SDK forwards this extra body param unchanged.
     * @see https://openrouter.ai/docs/use-cases/usage-accounting
     */
    protected override getProviderRequestExtras(params: ChatParams): Record<string, unknown> {
        return { usage: { include: true } };
    }
}
