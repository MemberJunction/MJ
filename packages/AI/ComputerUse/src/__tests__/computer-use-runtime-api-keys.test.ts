import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `RunComputerUseParams.APIKeyResolver` — the key seam on the engine's direct-LLM funnel.
 *
 * Both the controller and the judge LLM are instantiated through one funnel (`createLLMInstance`)
 * when the caller pins their models. A caller that supplies a resolver is asked for the ONE driver
 * class that funnel needs, and its answer is the key the LLM is constructed with; with no resolver,
 * or no answer for that class, the platform key applies exactly as before. These cases assert on the
 * key actually handed to the driver constructor, not merely on what the lookup was asked.
 *
 * (Not wired in MJ yet: nothing in `ComputerUseAction` sets the field, and `MJComputerUseEngine`'s
 * stored-prompt path goes through `AIPromptRunner` instead of this funnel.)
 */
const platformLookups: string[] = [];

vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        ...actual,
        GetAIAPIKey: (driverClass: string) => {
            platformLookups.push(driverClass);
            return 'platform-key';
        },
    };
});

import { MJGlobal } from '@memberjunction/global';
import { ComputerUseEngine } from '../engine/ComputerUseEngine';
import type { RunComputerUseParams } from '../types/params';

/** The (driver class, key) pairs the funnel constructed an LLM with. */
const constructed: Array<{ driverClass: string; apiKey: unknown }> = [];

/** Drives the private LLM funnel the way the engine does, with `activeParams` set as a run would. */
function resolveThroughFunnel(params: Partial<RunComputerUseParams> | undefined): void {
    const engine = new ComputerUseEngine();
    (engine as unknown as { activeParams?: Partial<RunComputerUseParams> }).activeParams = params;
    (engine as unknown as { createLLMInstance: (c: unknown) => unknown }).createLLMInstance({
        Vendor: 'OpenAI', Model: 'gpt-x', DriverClass: 'OpenAILLM',
    });
}

describe('Computer Use — APIKeyResolver on the direct-LLM funnel', () => {
    beforeEach(() => {
        platformLookups.length = 0;
        constructed.length = 0;
        // Capture what the funnel constructs the LLM with, and hand back a stand-in so no driver is needed.
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
            (_base: unknown, driverClass?: string | null, ...args: unknown[]) => {
                constructed.push({ driverClass: driverClass ?? '', apiKey: args[0] });
                return { stub: true };
            },
        );
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('constructs the LLM with the resolver\'s key, asking it for the driver class it needs', () => {
        const asked: string[] = [];
        resolveThroughFunnel({
            APIKeyResolver: (driverClass) => { asked.push(driverClass); return driverClass === 'OpenAILLM' ? 'sk-customer' : undefined; },
        });
        expect(asked).toEqual(['OpenAILLM']);
        expect(constructed).toEqual([{ driverClass: 'OpenAILLM', apiKey: 'sk-customer' }]);
        expect(platformLookups).toEqual([]);   // the platform key is not even looked up
    });

    it('falls back to the platform key when the resolver has none for that class (or refuses)', () => {
        resolveThroughFunnel({ APIKeyResolver: () => undefined });
        expect(constructed).toEqual([{ driverClass: 'OpenAILLM', apiKey: 'platform-key' }]);
        expect(platformLookups).toEqual(['OpenAILLM']);
    });

    it('uses the platform key with no resolver — unchanged for every caller that does not set one', () => {
        resolveThroughFunnel({});
        expect(constructed).toEqual([{ driverClass: 'OpenAILLM', apiKey: 'platform-key' }]);
    });

    it('uses the platform key when there are no active params at all', () => {
        resolveThroughFunnel(undefined);
        expect(constructed).toEqual([{ driverClass: 'OpenAILLM', apiKey: 'platform-key' }]);
    });
});
