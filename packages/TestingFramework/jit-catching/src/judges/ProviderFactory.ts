import type { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { AnthropicLLM } from '@memberjunction/ai-anthropic';
import { OpenAILLM } from '@memberjunction/ai-openai';
import { GeminiLLM } from '@memberjunction/ai-gemini';
import type { Vendor } from '../types';

const ENV: Record<Vendor, string> = { Anthropic: 'ANTHROPIC_API_KEY', OpenAI: 'OPENAI_API_KEY', Gemini: 'GEMINI_API_KEY' };

/** The outcome of {@link SafeChat}: the successful result, or the provider's error message. */
export type SafeChatResult = { Ok: true; Result: ChatResult } | { Ok: false; Error: string };

/** MJ provider classes constructed directly from keys, with no database (D16). Throws when the vendor's key variable is not set. */
export function CreateLLM(vendor: Vendor, env: NodeJS.ProcessEnv = process.env): BaseLLM {
    const key = env[ENV[vendor]];
    if (!key) throw new Error(`${ENV[vendor]} is not set`);
    switch (vendor) {
        case 'Anthropic': return new AnthropicLLM(key);
        case 'OpenAI': return new OpenAILLM(key);
        case 'Gemini': return new GeminiLLM(key);
    }
}

/** One ChatCompletion call that never throws. OpenAILLM throws on an API error; AnthropicLLM returns `success: false`. Both become `{ Ok: false }`. */
export async function SafeChat(llm: BaseLLM, params: ChatParams): Promise<SafeChatResult> {
    try {
        const r = await llm.ChatCompletion(params);
        return r.success ? { Ok: true, Result: r } : { Ok: false, Error: r.errorMessage || 'provider returned success: false' };
    } catch (e) {
        return { Ok: false, Error: e instanceof Error ? e.message : String(e) };
    }
}
