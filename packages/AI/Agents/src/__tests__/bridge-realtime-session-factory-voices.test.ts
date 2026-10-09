import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetRealtimeModelVoices } from '../realtime/bridge-realtime-session-factory';

const mockModels = [
    { ID: 'm1', Name: 'GPT-Live-1', IsActive: true, AIModelType: 'Realtime', PowerRank: 10 },
    { ID: 'm2', Name: 'Legacy Realtime', IsActive: true, AIModelType: 'Realtime', PowerRank: 5 },
    { ID: 'm3', Name: 'Inactive Model', IsActive: false, AIModelType: 'Realtime', PowerRank: 1 },
    { ID: 'm4', Name: 'Vendorless Realtime', IsActive: true, AIModelType: 'Realtime', PowerRank: 0 },
    { ID: 'm5', Name: 'Shared Voice Realtime', IsActive: true, AIModelType: 'Realtime', PowerRank: 3 },
];

const PERSONA_ALLOY = { ID: 'p-alloy', Name: 'Alloy', PreviewImageURL: null };
const PERSONA_ECHO = { ID: 'p-echo', Name: 'Echo', PreviewImageURL: '   ' };
const PERSONA_AVERY = { ID: 'p-avery', Name: 'Avery', PreviewImageURL: '  https://img.example.test/avery.png  ' };
const PERSONA_CASEY = { ID: 'p-casey', Name: 'Casey', PreviewImageURL: null };
const PERSONA_QUINN = { ID: 'p-quinn', Name: 'Quinn', PreviewImageURL: null };
const PERSONA_PUCK = { ID: 'p-puck', Name: 'Puck', PreviewImageURL: null };
const PERSONA_BEN = { ID: 'p-ben', Name: 'Ben', PreviewImageURL: null };

const PRESET = { Avatar: { Kind: 'preset' } };
const CUSTOM = { Avatar: { Kind: 'custom', ReferenceImageFileID: 'file-1' } };

/**
 * Persona bindings by model, modality and vendor: a stand-in for the engine's persona resolution, which returns the
 * bindings on the given vendor, or on every vendor of the model when none is given.
 */
const BINDINGS = [
    { ModelID: 'm1', Modality: 'Audio', VendorID: 'v1', Persona: PERSONA_ALLOY, APIName: 'alloy', Settings: null },
    { ModelID: 'm1', Modality: 'Audio', VendorID: 'v1', Persona: PERSONA_ECHO, APIName: 'echo', Settings: null },
    { ModelID: 'm1', Modality: 'Audio', VendorID: 'v1', Persona: PERSONA_AVERY, APIName: 'Puck', Settings: null },
    { ModelID: 'm1', Modality: 'Audio', VendorID: 'v1', Persona: PERSONA_CASEY, APIName: 'casey', Settings: null },
    // Avery's face carries no settings: a preset by default.
    { ModelID: 'm1', Modality: 'Video', VendorID: 'v1', Persona: PERSONA_AVERY, APIName: ' Avery ', Settings: null },
    // Casey's face is a custom avatar, which a session can't show.
    { ModelID: 'm1', Modality: 'Video', VendorID: 'v1', Persona: PERSONA_CASEY, APIName: 'CaseyFace', Settings: CUSTOM },
    // Echo has a face, but only on another vendor of the same model.
    { ModelID: 'm1', Modality: 'Video', VendorID: 'v2', Persona: PERSONA_ECHO, APIName: 'EchoFace', Settings: null },
    { ModelID: 'm4', Modality: 'Audio', VendorID: 'v1', Persona: PERSONA_QUINN, APIName: 'quinn', Settings: null },
    { ModelID: 'm4', Modality: 'Video', VendorID: 'v1', Persona: PERSONA_QUINN, APIName: 'QuinnFace', Settings: null },
    // Two personas sharing one voice: Puck, and Ben (Puck's voice with a face).
    { ModelID: 'm5', Modality: 'Audio', VendorID: 'v5', Persona: PERSONA_PUCK, APIName: 'Puck', Settings: null },
    { ModelID: 'm5', Modality: 'Audio', VendorID: 'v5', Persona: PERSONA_BEN, APIName: 'Puck', Settings: null },
    { ModelID: 'm5', Modality: 'Video', VendorID: 'v5', Persona: PERSONA_BEN, APIName: 'Ben', Settings: PRESET },
];

const mockGetModelPersonas = vi.fn((modelId: string, modality = 'Audio', vendorId?: string) =>
    BINDINGS
        .filter((b) => b.ModelID === modelId && b.Modality === modality && (!vendorId || b.VendorID === vendorId))
        .map((b) => ({ Persona: b.Persona, PersonaVendor: { APIName: b.APIName, VendorSettingsObject: b.Settings } })),
);

const mockModelPersonas = [
    { ModelID: 'm1', PersonaID: 'p-fable', IsSupported: false },
];

const mockPersonaVendors = [
    { PersonaID: 'p-fable', VendorID: 'v1', APIName: 'fable' },
];

/** The Video modality, and the `MJ: AI Model Modalities` rows the avatar gate reads (none unless a test adds some). */
const VIDEO_MODALITY = { ID: 'modality-video', Name: 'Video' };
const mockModelModalities: Array<{ ModelID: string; ModalityID: string; Direction: 'Input' | 'Output'; IsSupported: boolean }> = [];

const mockGetModelPersonaExclusions = vi.fn((modelId: string, _modality?: string, _vendorId?: string) => {
    if (modelId === 'm1') {
        return ['fable'];
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
                GetModelPersonaExclusions: mockGetModelPersonaExclusions,
                ModelPersonas: mockModelPersonas,
                PersonaVendors: mockPersonaVendors,
                ModelModalities: mockModelModalities,
                GetModalityByName: (name: string) => (name.toLowerCase() === 'video' ? VIDEO_MODALITY : undefined),
            };
        },
    },
}));

vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        ...actual,
        GetAIAPIKey: vi.fn(() => 'mock-api-key'),
        // Overridden alongside GetAIAPIKey: MakeAIAPIKeyResolver reaches it through a same-module
        // binding, so spreading `actual` would otherwise run the real environment lookup.
        MakeAIAPIKeyResolver: () => () => 'mock-api-key',
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
        if (modelId === 'm4') {
            // A vendor row without a vendor id: there is no "same vendor" for a face to be on.
            return { VendorID: '', ModelVendorID: 'mv4', DriverClass: 'LegacyDriver', APIName: 'vendorless' };
        }
        if (modelId === 'm5') {
            return { VendorID: 'v5', ModelVendorID: 'mv5', DriverClass: 'LiveDriver', APIName: 'shared-voice-live' };
        }
        return null;
    },
}));

let createInstanceCalls = 0;
/**
 * The vendor API names whose driver renders an avatar on its endpoint (`SupportsAvatarOutput`). Every model with a face
 * renders one unless a test says otherwise.
 */
const AVATAR_MODEL_API_NAMES = new Set<string>();
const ALL_AVATAR_MODEL_API_NAMES = ['gpt-live-1', 'vendorless', 'shared-voice-live'];
/** Every API name the drivers were asked about. */
const avatarQuestions: string[] = [];
/** Driver classes the ClassFactory can't create (it returns null). */
const UNCREATABLE_DRIVERS = new Set<string>();
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: (_base: unknown, driverClass: string) => {
                        createInstanceCalls++;
                        if (UNCREATABLE_DRIVERS.has(driverClass)) {
                            return null;
                        }
                        return {
                            SupportsAvatarOutput: (apiName: string): boolean => {
                                avatarQuestions.push(apiName);
                                return AVATAR_MODEL_API_NAMES.has(apiName);
                            },
                            SupportedVoices: [
                                { ID: 'fallback-voice', Name: 'Fallback Voice' },
                                { ID: 'fable', Name: 'Fable (Excluded on m1)' },
                                // A driver voice named like an avatar, and one that even declares an avatar: driver
                                // voices have no persona, so neither may be marked.
                                { ID: 'Avery', Name: 'Avery (driver)' },
                                { ID: 'driver-face', Name: 'Driver Face', AvatarID: 'Avery', PreviewImageURL: 'https://img.example.test/driver.png' },
                                { ID: 'Puck', Name: 'Puck (driver)' },
                            ],
                        };
                    },
                },
            },
        },
    };
});

/** The voices of one model. */
async function voicesOf(modelId: string) {
    const model = (await GetRealtimeModelVoices()).find((r) => r.ModelID === modelId);
    expect(model).toBeDefined();
    return model!.Voices;
}

describe('GetRealtimeModelVoices', () => {
    beforeEach(() => {
        createInstanceCalls = 0;
        mockGetModelPersonas.mockClear();
        avatarQuestions.length = 0;
        UNCREATABLE_DRIVERS.clear();
        mockModelModalities.length = 0;
        AVATAR_MODEL_API_NAMES.clear();
        ALL_AVATAR_MODEL_API_NAMES.forEach((name) => AVATAR_MODEL_API_NAMES.add(name));
    });

    it('emits metadata personas first and unions driver SupportedVoices as a superset', async () => {
        const result = await GetRealtimeModelVoices();
        expect(result.map((r) => r.ModelID)).toEqual(['m1', 'm2', 'm5', 'm4']);

        // m1 has personas in metadata, and driver voices no persona offers plainly are appended, skipping explicitly
        // excluded voices (fable)
        const m1Result = result.find(r => r.ModelID === 'm1');
        expect(m1Result).toBeDefined();
        expect(m1Result!.ModelName).toBe('GPT-Live-1');
        expect(m1Result!.Voices.map((v) => v.ID)).toEqual(['alloy', 'echo', 'Puck', 'casey', 'fallback-voice', 'Avery', 'driver-face', 'Puck']);
        expect(m1Result!.Voices.some(v => v.ID === 'fable')).toBe(false);

        // m2 has no personas in metadata, includes all driver SupportedVoices
        const m2Result = result.find(r => r.ModelID === 'm2');
        expect(m2Result).toBeDefined();
        expect(m2Result!.ModelName).toBe('Legacy Realtime');
        expect(m2Result!.Voices).toEqual([
            { ID: 'fallback-voice', Name: 'Fallback Voice' },
            { ID: 'fable', Name: 'Fable (Excluded on m1)' },
            { ID: 'Avery', Name: 'Avery (driver)' },
            { ID: 'driver-face', Name: 'Driver Face' },
            { ID: 'Puck', Name: 'Puck (driver)' },
        ]);

        // Guard: for every model whose driver returns voices, the emitted set is a superset of non-excluded driver voices
        for (const res of result) {
            expect(res.Voices.some(v => v.ID === 'fallback-voice')).toBe(true);
        }
        expect(createInstanceCalls).toBe(4);
    });

    it('marks a persona voice with the APIName of its Video binding on the same vendor, keyed by its persona', async () => {
        const voices = await voicesOf('m1');
        expect(voices.find((v) => v.PersonaID === 'p-avery')).toEqual({
            ID: 'Puck',
            Name: 'Avery',
            PersonaID: 'p-avery',
            AvatarID: 'Avery',
            PreviewImageURL: 'https://img.example.test/avery.png',
        });
        // The faces come from the model's resolved vendor, never from every vendor of the model.
        expect(mockGetModelPersonas).toHaveBeenCalledWith('m1', 'Video', 'v1');
    });

    it('does not mark a persona whose only Video binding is on another vendor', async () => {
        const voices = await voicesOf('m1');
        expect(voices.find((v) => v.ID === 'echo')).toEqual({ ID: 'echo', Name: 'Echo', PersonaID: 'p-echo' });
        expect(voices.find((v) => v.ID === 'alloy')).toEqual({ ID: 'alloy', Name: 'Alloy', PersonaID: 'p-alloy' });
    });

    it('does not mark a persona whose face is a custom avatar; a face without settings is a preset', async () => {
        const voices = await voicesOf('m1');
        expect(voices.find((v) => v.ID === 'casey')).toEqual({ ID: 'casey', Name: 'Casey', PersonaID: 'p-casey' });
        expect(voices.find((v) => v.PersonaID === 'p-avery')?.AvatarID).toBe('Avery');
        expect((await voicesOf('m5')).find((v) => v.PersonaID === 'p-ben')?.AvatarID).toBe('Ben');
    });

    it('never marks a voice only the driver declares, even one named like an avatar or declaring one', async () => {
        const voices = await voicesOf('m1');
        expect(voices.find((v) => v.ID === 'Avery')).toEqual({ ID: 'Avery', Name: 'Avery (driver)' });
        expect(voices.find((v) => v.ID === 'driver-face')).toEqual({ ID: 'driver-face', Name: 'Driver Face' });
        expect(voices.filter((v) => v.AvatarID).map((v) => v.PersonaID)).toEqual(['p-avery']);
    });

    it('carries a persona preview image only when one is set', async () => {
        const voices = await voicesOf('m1');
        expect(voices.filter((v) => v.PreviewImageURL).map((v) => v.PersonaID)).toEqual(['p-avery']);
        // A blank image (Echo's) is no image.
        expect('PreviewImageURL' in voices.find((v) => v.ID === 'echo')!).toBe(false);
    });

    it('marks nothing when the vendor row names no vendor', async () => {
        const voices = await voicesOf('m4');
        expect(voices.find((v) => v.ID === 'quinn')).toEqual({ ID: 'quinn', Name: 'Quinn', PersonaID: 'p-quinn' });
        expect(mockGetModelPersonas.mock.calls.some(([model, modality]) => model === 'm4' && modality === 'Video')).toBe(false);
    });

    it('lists two personas that share a voice, each keyed by its persona; the plain one stands in for the driver voice', async () => {
        const voices = await voicesOf('m5');
        expect(voices.slice(0, 2)).toEqual([
            { ID: 'Puck', Name: 'Puck', PersonaID: 'p-puck' },
            { ID: 'Puck', Name: 'Ben', PersonaID: 'p-ben', AvatarID: 'Ben' },
        ]);
        expect(voices.filter((v) => v.ID === 'Puck')).toHaveLength(2);
    });

    it('still lists the plain voice when the only persona with that voice comes with a face', async () => {
        const puck = (await voicesOf('m1')).filter((v) => v.ID === 'Puck');
        expect(puck).toEqual([
            { ID: 'Puck', Name: 'Avery', PersonaID: 'p-avery', AvatarID: 'Avery', PreviewImageURL: 'https://img.example.test/avery.png' },
            { ID: 'Puck', Name: 'Puck (driver)' },
        ]);
    });

    describe('on a model that renders no avatar on its endpoint', () => {
        beforeEach(() => {
            AVATAR_MODEL_API_NAMES.delete('gpt-live-1');
        });

        it('marks no voice, even one whose persona has a preset face on the vendor, and looks for no faces', async () => {
            const voices = await voicesOf('m1');
            expect(voices.filter((v) => v.AvatarID)).toEqual([]);
            expect(voices.find((v) => v.PersonaID === 'p-avery')).toEqual({
                ID: 'Puck',
                Name: 'Avery',
                PersonaID: 'p-avery',
                PreviewImageURL: 'https://img.example.test/avery.png',
            });
            expect(mockGetModelPersonas.mock.calls.some(([model, modality]) => model === 'm1' && modality === 'Video')).toBe(false);
        });

        it("lets the persona's plain voice stand in for the driver's voice of the same id", async () => {
            const voices = await voicesOf('m1');
            expect(voices.map((v) => v.ID)).toEqual(['alloy', 'echo', 'Puck', 'casey', 'fallback-voice', 'Avery', 'driver-face']);
        });

        it('still marks the voices of a model that renders avatars', async () => {
            expect((await voicesOf('m5')).find((v) => v.PersonaID === 'p-ben')?.AvatarID).toBe('Ben');
        });
    });

    describe("by the model's Video/Output row (the Modalities gate)", () => {
        const videoOutputRow = (modelId: string, isSupported: boolean): void => {
            mockModelModalities.push({ ModelID: modelId, ModalityID: VIDEO_MODALITY.ID, Direction: 'Output', IsSupported: isSupported });
        };

        it('marks no voice on a model whose row turns video off, though its driver renders avatars, and looks for no faces', async () => {
            videoOutputRow('m1', false);
            const voices = await voicesOf('m1');
            expect(voices.filter((v) => v.AvatarID)).toEqual([]);
            expect(mockGetModelPersonas.mock.calls.some(([model, modality]) => model === 'm1' && modality === 'Video')).toBe(false);
            // Another model's row decides nothing here.
            expect((await voicesOf('m5')).find((v) => v.PersonaID === 'p-ben')?.AvatarID).toBe('Ben');
        });

        it('marks the voices of a model whose row allows video and whose driver renders avatars', async () => {
            videoOutputRow('m1', true);
            expect((await voicesOf('m1')).filter((v) => v.AvatarID).map((v) => v.PersonaID)).toEqual(['p-avery']);
        });

        it('marks no voice on a model whose row allows video when its driver renders none on the endpoint', async () => {
            videoOutputRow('m1', true);
            AVATAR_MODEL_API_NAMES.delete('gpt-live-1');
            expect((await voicesOf('m1')).filter((v) => v.AvatarID)).toEqual([]);
        });

        it("ignores an input row and another modality's output row", async () => {
            mockModelModalities.push({ ModelID: 'm1', ModalityID: VIDEO_MODALITY.ID, Direction: 'Input', IsSupported: false });
            mockModelModalities.push({ ModelID: 'm1', ModalityID: 'modality-audio', Direction: 'Output', IsSupported: false });
            expect((await voicesOf('m1')).filter((v) => v.AvatarID).map((v) => v.PersonaID)).toEqual(['p-avery']);
        });
    });

    it("marks no voice when the model's driver can't be created: nothing says it renders avatars", async () => {
        UNCREATABLE_DRIVERS.add('LiveDriver');
        const voices = await voicesOf('m1');
        expect(voices.filter((v) => v.AvatarID)).toEqual([]);
        expect(voices.map((v) => v.ID)).toEqual(['alloy', 'echo', 'Puck', 'casey']);
    });

    it("asks each model's driver whether it renders avatars by the vendor's API name for the model", async () => {
        await GetRealtimeModelVoices();
        expect([...avatarQuestions].sort()).toEqual(['gpt-4o-realtime', 'gpt-live-1', 'shared-voice-live', 'vendorless']);
    });
});
