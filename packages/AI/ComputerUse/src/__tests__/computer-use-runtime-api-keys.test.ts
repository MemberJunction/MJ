import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The browser agent's controller and judge LLMs run on the RUN'S API key.
 *
 * Both models are instantiated through one funnel (`createLLMInstance`), which resolved against the
 * environment alone — so a run started on a customer's credential drove the browser on the
 * platform's. `RunComputerUseParams.APIKeys` closes that, and these cases pin that the keys reach
 * the resolution rather than merely existing on the params object.
 */
const keyLookups: Array<{ driverClass: string; apiKeys: unknown }> = [];

vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        ...actual,
        GetAIAPIKey: (driverClass: string, apiKeys?: unknown) => {
            keyLookups.push({ driverClass, apiKeys });
            return 'resolved-key';
        },
    };
});

import { ComputerUseEngine } from '../engine/ComputerUseEngine';
import type { RunComputerUseParams } from '../types/params';

/** Drives the private LLM funnel the way the engine does, with `activeParams` set as a run would. */
function resolveThroughFunnel(params: Partial<RunComputerUseParams>): void {
    const engine = new ComputerUseEngine();
    (engine as unknown as { activeParams?: Partial<RunComputerUseParams> }).activeParams = params;
    try {
        (engine as unknown as { createLLMInstance: (c: unknown) => unknown }).createLLMInstance({
            Vendor: 'OpenAI', Model: 'gpt-x', DriverClass: 'OpenAILLM',
        });
    } catch {
        // The ClassFactory has no driver registered in a unit test, so instantiation fails AFTER the
        // key is resolved. The lookup is what is under test, and it has already been recorded.
    }
}

describe('Computer Use — runtime API keys', () => {
    beforeEach(() => { keyLookups.length = 0; });

    it('hands the run\'s keys to the key lookup for the driver class it needs', () => {
        const APIKeys = [{ driverClass: 'OpenAILLM', apiKey: 'sk-customer' }];
        resolveThroughFunnel({ APIKeys });
        expect(keyLookups).toHaveLength(1);
        expect(keyLookups[0].driverClass).toBe('OpenAILLM');
        expect(keyLookups[0].apiKeys).toEqual(APIKeys);
    });

    it('passes undefined when the run has no keys — the platform lookup, exactly as before', () => {
        resolveThroughFunnel({});
        expect(keyLookups).toHaveLength(1);
        expect(keyLookups[0].apiKeys).toBeUndefined();
    });

    it('passes undefined when there are no active params at all', () => {
        const engine = new ComputerUseEngine();
        try {
            (engine as unknown as { createLLMInstance: (c: unknown) => unknown }).createLLMInstance({
                Vendor: 'OpenAI', Model: 'gpt-x', DriverClass: 'OpenAILLM',
            });
        } catch { /* see above */ }
        expect(keyLookups[0].apiKeys).toBeUndefined();
    });
});
