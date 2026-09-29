import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `Generate Image` goes through `AIImageGenerationRunner`, so every call gets failover and an
 * `MJ: AI Prompt Runs` row. What must NOT change is pinned here: the model the action chooses, the key
 * it resolves (runtime key, platform key, then the vendor-name fallback), and every output param and
 * result code a caller may match on.
 *
 * The runner is mocked whole; its own behaviour is tested in `@memberjunction/ai-prompts`.
 * `GetAIAPIKey` is mocked as the PLATFORM lookup, as in `generate-image-api-key.test.ts`.
 */
const h = vi.hoisted(() => {
    type RunnerResult = {
        Success: boolean;
        ErrorMessage?: string;
        ImageResult?: { success: boolean; images: Array<Record<string, unknown>>; revisedPrompt?: string };
        ExecutionTimeMS: number;
    };
    return {
        platformKeys: new Map<string, string>(),
        generateCalls: [] as Array<Record<string, unknown>>,
        editCalls: [] as Array<Record<string, unknown>>,
        respond: ((): RunnerResult => ({ Success: true, ExecutionTimeMS: 5 })) as (params: Record<string, unknown>) => RunnerResult,
        engineConfig: vi.fn(),
        models: [] as Array<Record<string, unknown>>,
        vendors: [] as Array<{ ID: string; Name: string }>,
    };
});

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/ai', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/ai');
    return { ...actual, GetAIAPIKey: (driver: string): string => h.platformKeys.get(driver) ?? '' };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: (...args: unknown[]) => h.engineConfig(...args),
            get Models() { return h.models; },
            get Vendors() { return h.vendors; },
        },
    },
}));

// The fake runner is defined INSIDE the factory: vi.mock is hoisted above every top-level statement.
vi.mock('@memberjunction/ai-prompts', () => ({
    AIImageGenerationRunner: class AIImageGenerationRunner {
        public async RunImageGeneration(params: Record<string, unknown>) {
            h.generateCalls.push(params);
            return h.respond(params);
        }
        public async RunImageEdit(params: Record<string, unknown>) {
            h.editCalls.push(params);
            return h.respond(params);
        }
    },
}));

import type { ActionResultSimple, RunActionParams, RuntimeAPIKeyResolver } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import { GenerateImageAction } from '../custom/ai/generate-image.action';

/** Exposes the protected entry point without weakening its type. */
class TestableGenerateImageAction extends GenerateImageAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

const OPENAI = 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
const BFL = 'B1AC0F00-0000-4000-8000-00000000F1A5';
const contextUser = { ID: 'user-1', Name: 'Test User' } as UserInfo;

/** The seeded catalog shape: a developer row with no driver, then the inference row. */
function seedModels(): void {
    h.vendors = [{ ID: OPENAI, Name: 'OpenAI' }, { ID: BFL, Name: 'Black Forest Labs' }];
    h.models = [
        {
            ID: 'model-gpt-image-2', Name: 'GPT Image 2', APIName: null, AIModelType: 'Image Generator', IsActive: true, PowerRank: 19,
            ModelVendors: [
                { VendorID: OPENAI, DriverClass: null, APIName: null, Status: 'Active' },
                { VendorID: OPENAI, DriverClass: 'OpenAIImageGenerator', APIName: 'gpt-image-2', Status: 'Active' },
            ],
        },
        {
            ID: 'model-flux-2-pro', Name: 'FLUX.2 Pro', APIName: 'flux-2-pro', AIModelType: 'Image Generator', IsActive: true, PowerRank: 10,
            ModelVendors: [{ VendorID: BFL, DriverClass: 'FLUXImageGenerator', APIName: 'flux-2-pro', Status: 'Active' }],
        },
        { ID: 'model-llm', Name: 'Big LLM', APIName: 'big-llm', AIModelType: 'LLM', IsActive: true, PowerRank: 99, ModelVendors: [] },
    ];
}

function imagesResult(count: number): ReturnType<typeof h.respond> {
    return {
        Success: true,
        ExecutionTimeMS: 5,
        ImageResult: {
            success: true,
            images: Array.from({ length: count }, () => ({ base64: 'aW1hZ2U=', format: 'png', width: 1024, height: 1024 })),
            revisedPrompt: 'A revised prompt',
        },
    };
}

function paramsFor(inputs: Record<string, unknown>, resolver?: RuntimeAPIKeyResolver): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
        ContextUser: contextUser,
        RuntimeAPIKeyResolver: resolver,
    } as RunActionParams;
}

function outputValue(params: RunActionParams, name: string): unknown {
    return params.Params.find(p => p.Name === name && p.Type === 'Output')?.Value;
}

describe('GenerateImageAction through AIImageGenerationRunner', () => {
    let action: TestableGenerateImageAction;

    beforeEach(() => {
        seedModels();
        h.generateCalls.length = 0;
        h.editCalls.length = 0;
        h.platformKeys = new Map([['OpenAIImageGenerator', 'platform-openai'], ['FLUXImageGenerator', 'platform-flux']]);
        h.respond = () => imagesResult(2);
        action = new TestableGenerateImageAction();
    });

    it('generates through the runner, pinned to the highest-power image model, with the resolved key', async () => {
        const params = paramsFor({ Prompt: 'A lighthouse at dusk', NumberOfImages: 2 });

        const result = await action.RunForTest(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('IMAGES_GENERATED');
        expect(h.generateCalls).toHaveLength(1);
        expect(h.generateCalls[0]).toEqual({
            ContextUser: contextUser,
            ModelID: 'model-gpt-image-2',
            APIKeys: [{ driverClass: 'OpenAIImageGenerator', apiKey: 'platform-openai' }],
            prompt: 'A lighthouse at dusk',
            n: 2,
            size: '1024x1024',
            outputFormat: 'b64_json',
        });
        expect(h.editCalls).toHaveLength(0);
    });

    it('keeps every output param and the response message the same', async () => {
        const params = paramsFor({ Prompt: 'A lighthouse at dusk' });

        const result = await action.RunForTest(params);

        expect(outputValue(params, 'Images')).toEqual([
            { modality: 'Image', mimeType: 'image/png', data: 'aW1hZ2U=', url: undefined, width: 1024, height: 1024, label: 'Generated image 1' },
            { modality: 'Image', mimeType: 'image/png', data: 'aW1hZ2U=', url: undefined, width: 1024, height: 1024, label: 'Generated image 2' },
        ]);
        expect(outputValue(params, 'ImageCount')).toBe(2);
        expect(outputValue(params, 'RevisedPrompt')).toBe('A revised prompt');
        expect(outputValue(params, 'ModelUsed')).toBe('GPT Image 2');
        expect(JSON.parse(result.Message ?? '{}')).toEqual({
            message: 'Successfully generated 2 image(s)',
            model: 'GPT Image 2',
            imageCount: 2,
            revisedPrompt: 'A revised prompt',
        });
    });

    it('passes the requested model as ModelID, found by name or API name, with its own driver class key', async () => {
        await action.RunForTest(paramsFor({ Prompt: 'x', Model: 'FLUX.2 Pro' }));
        await action.RunForTest(paramsFor({ Prompt: 'x', Model: 'flux-2-pro' }));

        expect(h.generateCalls.map(c => c.ModelID)).toEqual(['model-flux-2-pro', 'model-flux-2-pro']);
        expect(h.generateCalls[0].APIKeys).toEqual([{ driverClass: 'FLUXImageGenerator', apiKey: 'platform-flux' }]);
    });

    it("passes the run's runtime key for the driver class through to the runner", async () => {
        const resolver: RuntimeAPIKeyResolver = (driverClass) => (driverClass === 'OpenAIImageGenerator' ? 'sk-customer' : undefined);

        await action.RunForTest(paramsFor({ Prompt: 'x' }, resolver));

        expect(h.generateCalls[0].APIKeys).toEqual([{ driverClass: 'OpenAIImageGenerator', apiKey: 'sk-customer' }]);
    });

    it('a vendor-name-only key still works: it reaches the runner under the driver class', async () => {
        // No key for the driver class anywhere; the platform has one under the vendor's name.
        h.platformKeys = new Map([['OpenAI', 'platform-openai-by-vendor']]);

        const result = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('IMAGES_GENERATED');
        expect(h.generateCalls[0].APIKeys).toEqual([{ driverClass: 'OpenAIImageGenerator', apiKey: 'platform-openai-by-vendor' }]);
    });

    it('with no key anywhere it fails as before, without calling the runner', async () => {
        h.platformKeys = new Map();

        const result = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(result).toEqual({
            Success: false,
            Message: 'Generate image failed: No API key found for OpenAIImageGenerator or vendor OpenAI',
            ResultCode: 'ACTION_FAILED',
        });
        expect(h.generateCalls).toHaveLength(0);
    });

    it('a runner failure maps to GENERATION_FAILED with the same message as a failed generation', async () => {
        h.respond = () => ({ Success: false, ErrorMessage: 'Rate limit exceeded', ExecutionTimeMS: 5 });
        const failed = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        h.respond = () => ({ Success: false, ExecutionTimeMS: 5 });
        const unexplained = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(failed).toEqual({ Success: false, Message: 'Image generation failed: Rate limit exceeded', ResultCode: 'GENERATION_FAILED' });
        expect(unexplained).toEqual({ Success: false, Message: 'Image generation failed: Unknown error', ResultCode: 'GENERATION_FAILED' });
    });

    it('a success with no images is still NO_IMAGES', async () => {
        h.respond = () => imagesResult(0);

        const result = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(result).toEqual({ Success: false, Message: 'No images were generated', ResultCode: 'NO_IMAGES' });
    });

    it('a source image goes through RunImageEdit with the mask and the pinned model', async () => {
        const result = await action.RunForTest(paramsFor({
            Prompt: 'Make it a watercolour', SourceImage: 'c291cmNl', Mask: 'bWFzaw==', OutputFormat: 'url', NegativePrompt: 'blur',
        }));

        expect(result.ResultCode).toBe('IMAGES_GENERATED');
        expect(h.generateCalls).toHaveLength(0);
        expect(h.editCalls[0]).toEqual({
            ContextUser: contextUser,
            ModelID: 'model-gpt-image-2',
            APIKeys: [{ driverClass: 'OpenAIImageGenerator', apiKey: 'platform-openai' }],
            prompt: 'Make it a watercolour',
            image: 'c291cmNl',
            mask: 'bWFzaw==',
            negativePrompt: 'blur',
            n: 1,
            size: '1024x1024',
            outputFormat: 'url',
        });
    });

    it('keeps the missing-prompt and unknown-model result codes', async () => {
        const missing = await action.RunForTest(paramsFor({}));
        const unknown = await action.RunForTest(paramsFor({ Prompt: 'x', Model: 'No Such Model' }));

        expect(missing).toEqual({ Success: false, Message: 'Prompt parameter is required', ResultCode: 'MISSING_PROMPT' });
        expect(unknown).toEqual({
            Success: false,
            Message: "Generate image failed: Image generator model 'No Such Model' not found",
            ResultCode: 'ACTION_FAILED',
        });
        expect(h.generateCalls).toHaveLength(0);
    });
});
