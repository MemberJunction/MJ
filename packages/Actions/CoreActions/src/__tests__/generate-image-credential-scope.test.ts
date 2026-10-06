/**
 * Generate Image is never handed the calling run's API keys on this release line: every key it can
 * find is the platform's. Under a 'RuntimeOnly' credential scope it must therefore refuse before
 * looking up a key or creating a generator, and say why; under 'Any' it carries on as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    getAIAPIKey: vi.fn(),
    createInstance: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    // The real module for @memberjunction/ai's own imports; only the class factory is observed.
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
    MJGlobal: { Instance: { ClassFactory: { CreateInstance: h.createInstance } } },
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/core', () => ({ RunView: class RunView {} }));
vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        // The real scope rule: the test is about this action consulting it, not about the rule itself.
        CredentialScopeAllows: actual.CredentialScopeAllows,
        BaseImageGenerator: class BaseImageGenerator {},
        GetAIAPIKey: h.getAIAPIKey,
    };
});
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Models: [{
                ID: 'model-1',
                Name: 'Test Image Model',
                APIName: 'image-test',
                AIModelType: 'Image Generator',
                IsActive: true,
                PowerRank: 1,
                ModelVendors: [{ DriverClass: 'OpenAIImageGenerator', APIName: 'image-test', Status: 'Active', VendorID: 'vendor-1' }],
            }],
            Vendors: [{ ID: 'vendor-1', Name: 'OpenAI' }],
        },
    },
}));

import { GenerateImageAction } from '../custom/ai/generate-image.action';

type Param = { Name: string; Type: string; Value: unknown };
type ActionParams = { Params: Param[]; ContextUser: { ID: string }; CredentialScope?: 'Any' | 'RuntimeOnly' };
type Runnable = { InternalRunAction(params: ActionParams): Promise<{ Success: boolean; Message?: string; ResultCode?: string }> };

function run(credentialScope: 'Any' | 'RuntimeOnly'): Promise<{ Success: boolean; Message?: string; ResultCode?: string }> {
    const action = new GenerateImageAction() as unknown as Runnable;
    return action.InternalRunAction({
        Params: [{ Name: 'Prompt', Type: 'Input', Value: 'A lighthouse at dusk' }],
        ContextUser: { ID: 'u-1' },
        CredentialScope: credentialScope,
    });
}

describe('Generate Image credential scope', () => {
    beforeEach(() => {
        h.getAIAPIKey.mockReset();
        h.createInstance.mockReset();
    });

    it('under RuntimeOnly, fails naming the scope and never looks up a key or creates a generator', async () => {
        const r = await run('RuntimeOnly');

        expect(r.Success).toBe(false);
        expect(r.Message).toContain('credential scope is RuntimeOnly');
        expect(h.getAIAPIKey).not.toHaveBeenCalled();
        expect(h.createInstance).not.toHaveBeenCalled();
    });

    it('under Any, goes on to look up the platform key for the driver class', async () => {
        // No platform key either, so it stops at the next check — past the scope guard.
        h.getAIAPIKey.mockReturnValue(undefined);

        const r = await run('Any');

        expect(h.getAIAPIKey).toHaveBeenCalledWith('OpenAIImageGenerator');
        expect(r.Success).toBe(false);
        expect(r.Message).not.toContain('credential scope');
        expect(r.Message).toContain('No API key found for OpenAIImageGenerator');
    });
});
