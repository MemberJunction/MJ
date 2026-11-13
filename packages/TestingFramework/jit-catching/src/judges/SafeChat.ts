import type { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';

/** Start of a judge's `Reason` when the judge got no usable answer (provider error or no logprobs). */
export const JUDGE_ERROR_PREFIX = 'error: ';

/** The outcome of {@link SafeChat}: the successful result, or the provider's error message. */
export type SafeChatResult = { Ok: true; Result: ChatResult } | { Ok: false; Error: string };

/** One ChatCompletion call that never throws. OpenAILLM throws on an API error; AnthropicLLM returns `success: false`. Both become `{ Ok: false }`. */
export async function SafeChat(llm: BaseLLM, params: ChatParams): Promise<SafeChatResult> {
    try {
        const r = await llm.ChatCompletion(params);
        return r.success ? { Ok: true, Result: r } : { Ok: false, Error: r.errorMessage || 'provider returned success: false' };
    } catch (e) {
        return { Ok: false, Error: e instanceof Error ? e.message : String(e) };
    }
}
