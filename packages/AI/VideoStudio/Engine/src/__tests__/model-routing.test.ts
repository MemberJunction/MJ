import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIConfigurationEntity, MJAIPromptModelEntity } from '@memberjunction/core-entities';
import { ResolvePromptPrimaryModelId } from '../review/model-routing.js';

const PROMPT_ID = 'B72CEB9C-359E-4449-A71B-EA8F7BB44E7A';
const OTHER_PROMPT_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_CONFIG_ID = '22222222-2222-4222-8222-222222222222';
const PARENT_CONFIG_ID = '33333333-3333-4333-8333-333333333333';
const MODEL_GEMINI = '44444444-4444-4444-8444-444444444444';
const MODEL_CLAUDE = '55555555-5555-4555-8555-555555555555';
const MODEL_GPT = '66666666-6666-4666-8666-666666666666';

function makePromptModel(overrides: Partial<MJAIPromptModelEntity>): MJAIPromptModelEntity {
    return {
        ID: '00000000-0000-4000-8000-000000000001',
        PromptID: PROMPT_ID,
        ModelID: MODEL_GEMINI,
        ConfigurationID: null,
        Priority: 1,
        Status: 'Active',
        ...overrides,
    } as unknown as MJAIPromptModelEntity;
}

function makeConfig(id: string): MJAIConfigurationEntity {
    return { ID: id } as unknown as MJAIConfigurationEntity;
}

describe('ResolvePromptPrimaryModelId', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the highest-priority Active/Preview model for null-configuration rows when configurationId is omitted', () => {
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            PromptModels: [
                makePromptModel({ ModelID: MODEL_CLAUDE, Priority: 1, Status: 'Active' }),
                makePromptModel({ ModelID: MODEL_GEMINI, Priority: 5, Status: 'Preview' }),
                makePromptModel({ ModelID: MODEL_GPT, Priority: 10, Status: 'Inactive' }),
            ],
            GetConfigurationChain: vi.fn().mockReturnValue([]),
        } as unknown as AIEngine);

        expect(ResolvePromptPrimaryModelId(PROMPT_ID.toLowerCase())).toBe(MODEL_GEMINI);
    });

    it('walks the configuration inheritance chain (child -> parent) and picks the first config with matching rows', () => {
        const getChain = vi
            .fn()
            .mockReturnValue([makeConfig(CHILD_CONFIG_ID), makeConfig(PARENT_CONFIG_ID)]);

        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            PromptModels: [
                makePromptModel({
                    ModelID: MODEL_GEMINI,
                    ConfigurationID: null,
                    Priority: 100,
                    Status: 'Active',
                }),
                makePromptModel({
                    ModelID: MODEL_CLAUDE,
                    ConfigurationID: PARENT_CONFIG_ID,
                    Priority: 2,
                    Status: 'Active',
                }),
                makePromptModel({
                    ModelID: MODEL_GPT,
                    ConfigurationID: PARENT_CONFIG_ID,
                    Priority: 8,
                    Status: 'Active',
                }),
            ],
            GetConfigurationChain: getChain,
        } as unknown as AIEngine);

        expect(ResolvePromptPrimaryModelId(PROMPT_ID, CHILD_CONFIG_ID)).toBe(MODEL_GPT);
        expect(getChain).toHaveBeenCalledWith(CHILD_CONFIG_ID);
    });

    it('prefers child configuration bindings over parent configuration bindings', () => {
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            PromptModels: [
                makePromptModel({
                    ModelID: MODEL_CLAUDE,
                    ConfigurationID: CHILD_CONFIG_ID,
                    Priority: 1,
                    Status: 'Active',
                }),
                makePromptModel({
                    ModelID: MODEL_GEMINI,
                    ConfigurationID: PARENT_CONFIG_ID,
                    Priority: 99,
                    Status: 'Active',
                }),
            ],
            GetConfigurationChain: vi
                .fn()
                .mockReturnValue([makeConfig(CHILD_CONFIG_ID), makeConfig(PARENT_CONFIG_ID)]),
        } as unknown as AIEngine);

        expect(ResolvePromptPrimaryModelId(PROMPT_ID, CHILD_CONFIG_ID)).toBe(MODEL_CLAUDE);
    });

    it('falls back to null-configuration bindings when no configuration in the chain has matching rows', () => {
        const UNRELATED_CONFIG_ID = '77777777-7777-4777-8777-777777777777';
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            PromptModels: [
                makePromptModel({
                    PromptID: OTHER_PROMPT_ID,
                    ModelID: MODEL_CLAUDE,
                    ConfigurationID: CHILD_CONFIG_ID,
                    Priority: 10,
                    Status: 'Active',
                }),
                makePromptModel({
                    PromptID: PROMPT_ID,
                    ModelID: MODEL_GPT,
                    ConfigurationID: UNRELATED_CONFIG_ID,
                    Priority: 50,
                    Status: 'Active',
                }),
                makePromptModel({
                    PromptID: PROMPT_ID,
                    ModelID: MODEL_GEMINI,
                    ConfigurationID: null,
                    Priority: 3,
                    Status: 'Active',
                }),
            ],
            GetConfigurationChain: vi.fn().mockReturnValue([makeConfig(CHILD_CONFIG_ID)]),
        } as unknown as AIEngine);

        expect(ResolvePromptPrimaryModelId(PROMPT_ID, CHILD_CONFIG_ID)).toBe(MODEL_GEMINI);
    });

    it('returns null when promptId is empty or no Active/Preview rows match', () => {
        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            PromptModels: [
                makePromptModel({
                    PromptID: PROMPT_ID,
                    ModelID: MODEL_GEMINI,
                    Status: 'Inactive',
                }),
            ],
            GetConfigurationChain: vi.fn().mockReturnValue([]),
        } as unknown as AIEngine);

        expect(ResolvePromptPrimaryModelId('')).toBeNull();
        expect(ResolvePromptPrimaryModelId(PROMPT_ID)).toBeNull();
    });
});
