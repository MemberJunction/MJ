import type { BaseLLM } from '@memberjunction/ai';
import { AnthropicLLM } from '@memberjunction/ai-anthropic';
import { OpenAILLM } from '@memberjunction/ai-openai';
import { GeminiLLM } from '@memberjunction/ai-gemini';
import type { Vendor } from '../types';

/** The environment variable that holds each vendor's API key. */
export const VENDOR_KEY_ENV: Record<Vendor, string> = { Anthropic: 'ANTHROPIC_API_KEY', OpenAI: 'OPENAI_API_KEY', Gemini: 'GEMINI_API_KEY' };

/** MJ provider classes constructed directly from keys, with no database (D16). Throws when the vendor's key variable is not set. */
export function CreateLLM(vendor: Vendor, env: NodeJS.ProcessEnv = process.env): BaseLLM {
    const key = env[VENDOR_KEY_ENV[vendor]];
    if (!key) throw new Error(`${VENDOR_KEY_ENV[vendor]} is not set`);
    switch (vendor) {
        case 'Anthropic': return new AnthropicLLM(key);
        case 'OpenAI': return new OpenAILLM(key);
        case 'Gemini': return new GeminiLLM(key);
    }
}
