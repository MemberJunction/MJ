import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetRealtimeModelVoices } from '../realtime/bridge-realtime-session-factory';

const mockModels = [
    { ID: 'm1', Name: 'GPT-Live-1', IsActive: true, AIModelType: 'Realtime', PowerRank: 10 },
    { ID: 'm2', Name: 'Legacy Realtime', IsActive: true, AIModelType: 'Realtime', PowerRank: 5 },
    { ID: 'm3', Name: 'Inactive Model', IsActive: false, AIModelType: 'Realtime', PowerRank: 1 },
];

const mockGetModelPersonas = vi.fn((modelId: string, _modality: string, _vendorId?: string) => {
    if (modelId === 'm1') {
        return [
            {
                Persona: { Name: 'Alloy' },
                PersonaVendor: { APIName: 'alloy' },
            },
            {
                Persona: { Name: 'Echo' },
                PersonaVendor: { APIName: 'echo' },
            },
        ];
    }
    return [];
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Models: mockModels,
                Config: vi.fn(async () => undefined),
                GetModelPersonas: mockGetModelPersonas,
            };
        },
    },
}));

vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        ...actual,
        GetAIAPIKey: vi.fn(() => 'mock-api-key'),
    };
});

vi.mock('../realtime/realtime-vendor-resolution', () => ({
    SelectRealtimeVendorForModel: (modelId: string) => {
        if (modelId === 'm1') {
            return { VendorID: 'v1', ModelVendorID: 'mv1', DriverClass: 'LiveDriver', APIName: 'gpt-live-1' };
        }
        if (modelId === 'm2') {
            return { VendorID: 'v1', ModelVendorID: 'mv2', DriverClass: 'LegacyDriver', APIName: 'gpt-4o-realtime' };
        }
        return null;
    },
}));

let createInstanceCalls = 0;
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: (_base: unknown, _driverClass: string) => {
                        createInstanceCalls++;
                        return {
                            SupportedVoices: [{ ID: 'fallback-voice', Name: 'Fallback Voice' }],
                        };
                    },
                },
            },
        },
    };
});

describe('GetRealtimeModelVoices', () => {
    beforeEach(() => {
        createInstanceCalls = 0;
        mockGetModelPersonas.mockClear();
    });

    it('reads voices from metadata personas first, avoiding driver instantiation', async () => {
        const result = await GetRealtimeModelVoices();
        expect(result).toHaveLength(2);

        // m1 has personas in metadata
        const m1Result = result.find(r => r.ModelID === 'm1');
        expect(m1Result).toBeDefined();
        expect(m1Result!.ModelName).toBe('GPT-Live-1');
        expect(m1Result!.Voices).toEqual([
            { ID: 'alloy', Name: 'Alloy' },
            { ID: 'echo', Name: 'Echo' },
        ]);

        // m2 has no personas in metadata, falls back to driver SupportedVoices
        const m2Result = result.find(r => r.ModelID === 'm2');
        expect(m2Result).toBeDefined();
        expect(m2Result!.ModelName).toBe('Legacy Realtime');
        expect(m2Result!.Voices).toEqual([
            { ID: 'fallback-voice', Name: 'Fallback Voice' },
        ]);

        // ClassFactory.CreateInstance should only have been called ONCE (for m2), not for m1
        expect(createInstanceCalls).toBe(1);
    });
});
