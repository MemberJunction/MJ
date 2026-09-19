import { describe, it, expect, vi } from 'vitest';

/**
 * `Generate Image` and the run's runtime API keys.
 *
 * Prompts have always resolved their key with `GetAIAPIKey(driverClass, params.apiKeys)`; this
 * action called `GetAIAPIKey(driverClass)` with no second argument, so a run on a customer's OpenAI
 * key generated its images on the platform's. These cases pin the two halves of the fix: the run's
 * keys are read from the action Context BaseAgent stamps, and they take precedence per driver class
 * with the platform key as the fallback — the same order prompts use.
 *
 * `GetAIAPIKey` is mocked whole, reproducing its documented order (runtime list first, platform
 * second). It cannot be mocked at just the platform boundary: `GetAIAPIKey` calls `GetAIAPIKeyGlobal`
 * through a same-module binding that a module mock does not intercept. What is under test is
 * therefore the action's side of the contract — WHICH keys it hands over and what it does with the
 * answer — not `GetAIAPIKey`'s internals, which have their own tests in @memberjunction/ai.
 */
vi.mock('@memberjunction/ai', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/ai');
    return {
        ...actual,
        // The platform (env) lookup — what GetAIAPIKey falls back to when no runtime key matches.
        GetAIAPIKeyGlobal: (driver: string): string => (driver === 'OpenAIImageGenerator' ? 'platform-openai' : driver === 'OpenAI' ? 'platform-openai-by-vendor' : ''),
        GetAIAPIKey: (driver: string, keys?: Array<{ driverClass: string; apiKey: string }>): string => {
            const local = keys?.find((k) => k.driverClass === driver);
            if (local) return local.apiKey;
            return driver === 'OpenAIImageGenerator' ? 'platform-openai' : driver === 'OpenAI' ? 'platform-openai-by-vendor' : '';
        },
    };
});

import { ReadRuntimeAPIKeys, ResolveImageGenerationAPIKey } from '../custom/ai/generate-image.action';

describe('Generate Image — runtime API keys', () => {
    it('reads the run\'s keys from the Context BaseAgent stamps, and nothing from anything else', () => {
        const keys = [{ driverClass: 'OpenAIImageGenerator', apiKey: 'sk-customer' }];
        expect(ReadRuntimeAPIKeys({ AgentID: 'A', ActiveSkillIDs: [], apiKeys: keys })).toEqual(keys);
        expect(ReadRuntimeAPIKeys({ AgentID: 'A', ActiveSkillIDs: [] })).toBeUndefined();
        expect(ReadRuntimeAPIKeys({ apiKeys: [] })).toBeUndefined();
        expect(ReadRuntimeAPIKeys(undefined)).toBeUndefined();
        expect(ReadRuntimeAPIKeys('not an object')).toBeUndefined();
    });

    it('uses the customer\'s key for the driver class when the run carries one', () => {
        const key = ResolveImageGenerationAPIKey('OpenAIImageGenerator', 'OpenAI', [{ driverClass: 'OpenAIImageGenerator', apiKey: 'sk-customer' }]);
        expect(key).toBe('sk-customer');
    });

    it('falls back to the platform key for a driver class the run has no key for — optional, per driver class', () => {
        // A customer who keyed only their LLM still gets images, on ours. Same rule prompts follow.
        const key = ResolveImageGenerationAPIKey('OpenAIImageGenerator', 'OpenAI', [{ driverClass: 'OpenAILLM', apiKey: 'sk-customer-llm' }]);
        expect(key).toBe('platform-openai');
    });

    it('behaves exactly as before when the run has no runtime keys at all', () => {
        expect(ResolveImageGenerationAPIKey('OpenAIImageGenerator', 'OpenAI', undefined)).toBe('platform-openai');
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
