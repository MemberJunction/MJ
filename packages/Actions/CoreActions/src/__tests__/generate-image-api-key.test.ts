import { describe, it, expect, vi } from 'vitest';

/**
 * `Generate Image` and the run's runtime API keys.
 *
 * Prompts have always resolved their key with `GetAIAPIKey(driverClass, params.apiKeys)`; this
 * action called `GetAIAPIKey(driverClass)` with no second argument, so a run on a customer's OpenAI
 * key generated its images on the platform's. These cases pin the action's half of the fix: it asks
 * the run's RESOLVER for the one driver class it needs (never a list), takes that answer first, and
 * falls back to the platform key — the same order prompts use — when there is no resolver or the
 * resolver answers nothing. The resolver arrives per dispatch on `RunActionParams.RuntimeAPIKeyResolver`.
 *
 * `GetAIAPIKey` is mocked whole as the PLATFORM lookup: inside a run the resolver has already done
 * the runtime-first resolution (that is BaseAgent's contract, tested in ai-agents), so what is under
 * test here is what the action does with the two answers, not GetAIAPIKey's internals.
 */
vi.mock('@memberjunction/ai', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/ai');
    return {
        ...actual,
        GetAIAPIKey: (driver: string): string =>
            driver === 'OpenAIImageGenerator' ? 'platform-openai' : driver === 'OpenAI' ? 'platform-openai-by-vendor' : '',
    };
});

import type { RuntimeAPIKeyResolver } from '@memberjunction/actions-base';
import { ResolveImageGenerationAPIKey } from '../custom/ai/generate-image.action';

/** A run resolver over a fixed key list — runtime key first, else the platform's, else undefined. */
function runResolver(keys: Array<{ driverClass: string; apiKey: string }>): RuntimeAPIKeyResolver {
    return (driverClass) => keys.find((k) => k.driverClass === driverClass)?.apiKey
        ?? (driverClass === 'OpenAIImageGenerator' ? 'platform-openai' : undefined);
}

describe('Generate Image — runtime API keys', () => {
    it('uses the customer\'s key for the driver class when the run carries one', () => {
        const key = ResolveImageGenerationAPIKey('OpenAIImageGenerator', 'OpenAI', runResolver([{ driverClass: 'OpenAIImageGenerator', apiKey: 'sk-customer' }]));
        expect(key).toBe('sk-customer');
    });

    it('asks the resolver for ITS driver class only — it never sees, and cannot use, another class\'s key', () => {
        // A customer who keyed only their LLM still gets images, on ours. Same rule prompts follow.
        const asked: string[] = [];
        const resolve: RuntimeAPIKeyResolver = (dc) => { asked.push(dc); return runResolver([{ driverClass: 'OpenAILLM', apiKey: 'sk-customer-llm' }])(dc); };
        const key = ResolveImageGenerationAPIKey('OpenAIImageGenerator', 'OpenAI', resolve);
        expect(key).toBe('platform-openai');
        expect(asked).toEqual(['OpenAIImageGenerator']);
        expect(key).not.toBe('sk-customer-llm');
    });

    it('behaves exactly as before when there is no resolver at all (outside a run, or a run with no keys)', () => {
        expect(ResolveImageGenerationAPIKey('OpenAIImageGenerator', 'OpenAI', undefined)).toBe('platform-openai');
    });

    it('a resolver that REFUSES (answers undefined) leaves the action on the platform key, not on an error', () => {
        const refused: RuntimeAPIKeyResolver = () => undefined;
        expect(ResolveImageGenerationAPIKey('OpenAIImageGenerator', 'OpenAI', refused)).toBe('platform-openai');
    });

    it('the vendor-name fallback now actually reaches the generator', () => {
        // The old code found this key and then passed the empty driver-class result on. This is the
        // bug fix riding along: a driver class with no key of its own, a vendor that has one.
        expect(ResolveImageGenerationAPIKey('SomeNewImageDriver', 'OpenAI', undefined)).toBe('platform-openai-by-vendor');
    });

    it('throws, naming both lookups, only when neither the run nor the platform has a key', () => {
        expect(() => ResolveImageGenerationAPIKey('UnknownDriver', 'UnknownVendor', undefined))
            .toThrow('No API key found for UnknownDriver or vendor UnknownVendor');
    });
});
