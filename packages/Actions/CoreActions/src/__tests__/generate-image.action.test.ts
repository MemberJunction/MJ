import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `Generate Image` goes through `AIImageGenerationRunner`, so every call gets failover and an
 * `MJ: AI Prompt Runs` row. Pinned here: the model is pinned only when the caller names one (so the
 * `Default Image Generation` prompt's failover applies otherwise), the keys it resolves (runtime key,
 * platform key, then the vendor-name fallback) for every driver class the run may reach, the calling
 * agent, and every output param and result code a caller may match on.
 *
 * The runner is mocked whole; its own behaviour is tested in `@memberjunction/ai-prompts`.
 * `GetAIAPIKey` is mocked as the PLATFORM lookup, as in `generate-image-api-key.test.ts`.
 */
const h = vi.hoisted(() => {
    type RunnerResult = {
        Success: boolean;
        ErrorMessage?: string;
        ImageResult?: { success: boolean; images: Array<Record<string, unknown>>; revisedPrompt?: string };
        ModelName?: string;
        ExecutionTimeMS: number;
    };
    return {
        inferenceTypeId: 'VT-INFERENCE-PROVIDER',
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
            IsInferenceProvider: (mv: { TypeID?: string }) => mv.TypeID === h.inferenceTypeId,
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
const DEVELOPER_TYPE_ID = 'VT-MODEL-DEVELOPER';
const contextUser = { ID: 'user-1', Name: 'Test User' } as UserInfo;

/** An inference-provider vendor row for a model. */
function inferenceRow(vendorId: string, driverClass: string, apiName: string, priority = 1): Record<string, unknown> {
    return { VendorID: vendorId, TypeID: h.inferenceTypeId, DriverClass: driverClass, APIName: apiName, Status: 'Active', Priority: priority };
}

/** The seeded catalog shape: a developer row with no driver, then the inference row. */
function seedModels(): void {
    h.vendors = [{ ID: OPENAI, Name: 'OpenAI' }, { ID: BFL, Name: 'Black Forest Labs' }];
    h.models = [
        {
            ID: 'model-flux-2-pro', Name: 'FLUX.2 Pro', APIName: 'flux-2-pro', AIModelType: 'Image Generator', IsActive: true, PowerRank: 10,
            ModelVendors: [inferenceRow(BFL, 'FLUXImageGenerator', 'flux-2-pro')],
        },
        {
            ID: 'model-gpt-image-2', Name: 'GPT Image 2', APIName: null, AIModelType: 'Image Generator', IsActive: true, PowerRank: 19,
            ModelVendors: [
                { VendorID: OPENAI, TypeID: DEVELOPER_TYPE_ID, DriverClass: null, APIName: null, Status: 'Active', Priority: 0 },
                inferenceRow(OPENAI, 'OpenAIImageGenerator', 'gpt-image-2'),
            ],
        },
        { ID: 'model-llm', Name: 'Big LLM', APIName: 'big-llm', AIModelType: 'LLM', IsActive: true, PowerRank: 99, ModelVendors: [] },
    ];
}

function imagesResult(count: number, modelName = 'GPT Image 2'): ReturnType<typeof h.respond> {
    return {
        Success: true,
        ExecutionTimeMS: 5,
        ModelName: modelName,
        ImageResult: {
            success: true,
            images: Array.from({ length: count }, () => ({ base64: 'aW1hZ2U=', format: 'png', width: 1024, height: 1024 })),
            revisedPrompt: 'A revised prompt',
        },
    };
}

function paramsFor(inputs: Record<string, unknown>, resolver?: RuntimeAPIKeyResolver, context?: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
        ContextUser: contextUser,
        RuntimeAPIKeyResolver: resolver,
        Context: context,
    } as RunActionParams;
}

/** The platform keys for both shipped image driver classes, in the order the action resolves them. */
const PLATFORM_KEYS = [
    { driverClass: 'OpenAIImageGenerator', apiKey: 'platform-openai' },
    { driverClass: 'FLUXImageGenerator', apiKey: 'platform-flux' },
];

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

    it("with no Model named, leaves the model to the prompt's bindings, carrying a key for every driver class it may reach", async () => {
        const params = paramsFor({ Prompt: 'A lighthouse at dusk', NumberOfImages: 2 });

        const result = await action.RunForTest(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('IMAGES_GENERATED');
        expect(h.generateCalls).toHaveLength(1);
        expect(h.generateCalls[0]).toStrictEqual({
            ContextUser: contextUser,
            APIKeys: PLATFORM_KEYS,
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

    it('ModelUsed and the message name the model that answered, which after failover is not the first choice', async () => {
        h.respond = () => imagesResult(1, 'FLUX.2 Pro');
        const params = paramsFor({ Prompt: 'x' });

        const result = await action.RunForTest(params);

        expect(outputValue(params, 'ModelUsed')).toBe('FLUX.2 Pro');
        expect(JSON.parse(result.Message ?? '{}').model).toBe('FLUX.2 Pro');
    });

    it('pins the requested model as ModelID, found by name or API name, with its own driver class key', async () => {
        await action.RunForTest(paramsFor({ Prompt: 'x', Model: 'FLUX.2 Pro' }));
        await action.RunForTest(paramsFor({ Prompt: 'x', Model: 'flux-2-pro' }));

        expect(h.generateCalls.map(c => c.ModelID)).toEqual(['model-flux-2-pro', 'model-flux-2-pro']);
        expect(h.generateCalls[0].APIKeys).toEqual([{ driverClass: 'FLUXImageGenerator', apiKey: 'platform-flux' }]);
    });

    it("carries the run's own key for every driver class it resolves, so the key survives failover to the other vendor", async () => {
        const runKeys = new Map([['OpenAIImageGenerator', 'sk-customer-openai'], ['FLUXImageGenerator', 'sk-customer-bfl']]);
        const resolver: RuntimeAPIKeyResolver = (driverClass) => runKeys.get(driverClass);

        await action.RunForTest(paramsFor({ Prompt: 'x' }, resolver));

        expect(h.generateCalls[0].APIKeys).toEqual([
            { driverClass: 'OpenAIImageGenerator', apiKey: 'sk-customer-openai' },
            { driverClass: 'FLUXImageGenerator', apiKey: 'sk-customer-bfl' },
        ]);
    });

    it("asks the run's resolver for each driver class, falling back to the platform key for a class the run does not key", async () => {
        const asked: string[] = [];
        const resolver: RuntimeAPIKeyResolver = (driverClass) => {
            asked.push(driverClass);
            return driverClass === 'OpenAIImageGenerator' ? 'sk-customer' : undefined;
        };

        await action.RunForTest(paramsFor({ Prompt: 'x' }, resolver));

        expect(asked).toEqual(['OpenAIImageGenerator', 'FLUXImageGenerator']);
        expect(h.generateCalls[0].APIKeys).toEqual([
            { driverClass: 'OpenAIImageGenerator', apiKey: 'sk-customer' },
            { driverClass: 'FLUXImageGenerator', apiKey: 'platform-flux' },
        ]);
    });

    it("under a RuntimeOnly scope hands the runner the run's keys alone, and the scope so it skips the rest", async () => {
        const resolver: RuntimeAPIKeyResolver = (driverClass) => (driverClass === 'OpenAIImageGenerator' ? 'sk-customer' : undefined);

        await action.RunForTest({ ...paramsFor({ Prompt: 'x' }, resolver), CredentialScope: 'RuntimeOnly' });

        expect(h.generateCalls[0].APIKeys).toEqual([{ driverClass: 'OpenAIImageGenerator', apiKey: 'sk-customer' }]);
        expect(h.generateCalls[0].CredentialScope).toBe('RuntimeOnly');
    });

    it('a vendor-name-only key still works: it reaches the runner under the driver class', async () => {
        // No key for the driver class anywhere; the platform has one under the vendor's name.
        h.platformKeys = new Map([['OpenAI', 'platform-openai-by-vendor']]);

        const result = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('IMAGES_GENERATED');
        expect(h.generateCalls[0].APIKeys).toEqual([{ driverClass: 'OpenAIImageGenerator', apiKey: 'platform-openai-by-vendor' }]);
    });

    it('with no key it can resolve, the runner still runs (a credential binding may apply), and its failure is GENERATION_FAILED', async () => {
        h.platformKeys = new Map();
        h.respond = () => ({
            Success: false,
            ErrorMessage: "No Image Generator model has credentials available for prompt 'Default Image Generation'",
            ExecutionTimeMS: 5,
        });

        const result = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(h.generateCalls[0].APIKeys).toEqual([]);
        expect(result).toEqual({
            Success: false,
            Message: "Image generation failed: No Image Generator model has credentials available for prompt 'Default Image Generation'",
            ResultCode: 'GENERATION_FAILED',
        });
    });

    it("resolves a driver class's key for the vendor the runner tries first (Priority), not the first in array order", async () => {
        // One model, two inference vendors on the same driver class, each keyed only by vendor name.
        // The array lists the lower-priority vendor first; the runner tries the higher-priority one first.
        const LOW = 'VENDOR-LOW';
        const HIGH = 'VENDOR-HIGH';
        h.vendors.push({ ID: LOW, Name: 'Low Priority Host' }, { ID: HIGH, Name: 'High Priority Host' });
        h.models.push({
            ID: 'model-shared', Name: 'Shared Image Model', APIName: 'shared-image', AIModelType: 'Image Generator', IsActive: true, PowerRank: 5,
            ModelVendors: [
                inferenceRow(LOW, 'SharedImageGenerator', 'shared-image', 1),
                inferenceRow(HIGH, 'SharedImageGenerator', 'shared-image', 5),
                { ...inferenceRow(HIGH, 'InactiveImageGenerator', 'shared-image', 9), Status: 'Inactive' },
            ],
        });
        h.platformKeys = new Map([['Low Priority Host', 'key-low'], ['High Priority Host', 'key-high']]);

        await action.RunForTest(paramsFor({ Prompt: 'x', Model: 'Shared Image Model' }));

        expect(h.generateCalls[0].ModelID).toBe('model-shared');
        expect(h.generateCalls[0].APIKeys).toEqual([{ driverClass: 'SharedImageGenerator', apiKey: 'key-high' }]);
    });

    it('records the calling agent from the context BaseAgent stamps, and nothing outside an agent run', async () => {
        await action.RunForTest(paramsFor({ Prompt: 'x' }, undefined, { AgentID: 'agent-1', ActiveSkillIDs: [] }));
        await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(h.generateCalls[0].AgentID).toBe('agent-1');
        expect(Object.keys(h.generateCalls[1])).not.toContain('AgentID');
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

    it('a source image goes through RunImageEdit with the mask and the same keys', async () => {
        const result = await action.RunForTest(paramsFor({
            Prompt: 'Make it a watercolour', SourceImage: 'c291cmNl', Mask: 'bWFzaw==', OutputFormat: 'url', NegativePrompt: 'blur',
        }));

        expect(result.ResultCode).toBe('IMAGES_GENERATED');
        expect(h.generateCalls).toHaveLength(0);
        expect(h.editCalls[0]).toStrictEqual({
            ContextUser: contextUser,
            APIKeys: PLATFORM_KEYS,
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

    it('keeps ACTION_FAILED for a named model with no active inference provider, and for no image models at all', async () => {
        h.models.push({
            ID: 'model-dev-only', Name: 'Developer Only', APIName: 'dev-only', AIModelType: 'Image Generator', IsActive: true, PowerRank: 1,
            ModelVendors: [{ VendorID: OPENAI, TypeID: DEVELOPER_TYPE_ID, DriverClass: null, APIName: null, Status: 'Active', Priority: 0 }],
        });
        const noProvider = await action.RunForTest(paramsFor({ Prompt: 'x', Model: 'Developer Only' }));

        h.models = h.models.filter(m => m.AIModelType !== 'Image Generator');
        const noModels = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(noProvider).toEqual({
            Success: false,
            Message: "Generate image failed: No active inference provider found for model 'Developer Only'",
            ResultCode: 'ACTION_FAILED',
        });
        expect(noModels).toEqual({
            Success: false,
            Message: 'Generate image failed: No active image generator models found',
            ResultCode: 'ACTION_FAILED',
        });
        expect(h.generateCalls).toHaveLength(0);
    });
});
