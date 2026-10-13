import { describe, it, expect, vi, type MockInstance } from 'vitest';
import {
    Behavior,
    HarmBlockMethod,
    HarmBlockThreshold,
    HarmCategory,
    MediaResolution,
    Modality,
    TurnCoverage,
    type LiveClientSetup,
    type LiveConnectConfig,
} from '@google/genai';
import { BuildGeminiLiveAudioOnlySetup, BuildGeminiLiveModelPath, BuildGeminiLiveSetup, type GeminiLiveSetupTarget } from '../geminiLiveSetup';

const DEVELOPER: GeminiLiveSetupTarget = { Endpoint: 'developer', Model: 'gemini-3.8-live' };
const ENTERPRISE: GeminiLiveSetupTarget = { Endpoint: 'enterprise', Model: 'gemini-3.8-live', Project: 'mj-test', Location: 'us-central1' };

/** The warning lines the builder logged, in order. */
function warnings(spy: MockInstance<typeof console.warn>): string[] {
    return spy.mock.calls.map((call) => String(call[0]));
}

describe('BuildGeminiLiveSetup: the model path', () => {
    it('writes models/<id> on the Developer API, and keeps a name that already has a prefix', () => {
        expect(BuildGeminiLiveSetup(DEVELOPER, {}).model).toBe('models/gemini-3.8-live');
        expect(BuildGeminiLiveSetup({ ...DEVELOPER, Model: 'models/gemini-3.8-live' }, {}).model).toBe('models/gemini-3.8-live');
        expect(BuildGeminiLiveSetup({ ...DEVELOPER, Model: 'tunedModels/abc' }, {}).model).toBe('tunedModels/abc');
    });

    it('writes the full publisher path on Gemini Enterprise', () => {
        expect(BuildGeminiLiveSetup(ENTERPRISE, {}).model).toBe('projects/mj-test/locations/us-central1/publishers/google/models/gemini-3.8-live');
        expect(BuildGeminiLiveSetup({ ...ENTERPRISE, Model: 'publishers/google/models/gemini-3.8-live' }, {}).model).toBe(
            'projects/mj-test/locations/us-central1/publishers/google/models/gemini-3.8-live'
        );
        expect(BuildGeminiLiveSetup({ ...ENTERPRISE, Model: 'acme/custom-live' }, {}).model).toBe(
            'projects/mj-test/locations/us-central1/publishers/acme/models/custom-live'
        );
    });

    it('keeps a full Enterprise resource name as given, with or without a project', () => {
        const name = 'projects/other/locations/eu/publishers/google/models/gemini-3.8-live';
        expect(BuildGeminiLiveSetup({ Endpoint: 'enterprise', Model: name }, {}).model).toBe(name);
    });

    it('writes the model without a project or location for a Google Cloud API key, as @google/genai does', () => {
        expect(BuildGeminiLiveSetup({ Endpoint: 'enterprise', Model: 'gemini-3.8-live', UsesApiKey: true }, {}).model).toBe('publishers/google/models/gemini-3.8-live');
        expect(BuildGeminiLiveSetup({ Endpoint: 'enterprise', Model: 'acme/custom-live', UsesApiKey: true }, {}).model).toBe('publishers/acme/models/custom-live');
        const name = 'projects/other/locations/eu/publishers/google/models/gemini-3.8-live';
        expect(BuildGeminiLiveSetup({ Endpoint: 'enterprise', Model: name, UsesApiKey: true }, {}).model).toBe(name);
        // A project and location next to an API key are ignored, as the SDK clears them in API-key mode.
        expect(BuildGeminiLiveSetup({ ...ENTERPRISE, UsesApiKey: true }, {}).model).toBe('publishers/google/models/gemini-3.8-live');
    });

    it('BuildGeminiLiveModelPath gives the model the setup carries, for every target', () => {
        const targets: GeminiLiveSetupTarget[] = [
            { Endpoint: 'developer', Model: 'gemini-3.8-live' },
            ENTERPRISE,
            { Endpoint: 'enterprise', Model: 'gemini-3.8-live', UsesApiKey: true },
            { ...ENTERPRISE, Model: 'acme/custom-live' },
        ];
        for (const target of targets) {
            expect(BuildGeminiLiveModelPath(target)).toBe(BuildGeminiLiveSetup(target, {}).model);
        }
        expect(BuildGeminiLiveModelPath(ENTERPRISE)).toBe('projects/mj-test/locations/us-central1/publishers/google/models/gemini-3.8-live');
        expect(() => BuildGeminiLiveModelPath({ Endpoint: 'enterprise', Model: 'gemini-3.8-live' })).toThrow(/project and location/);
    });

    it('refuses an Enterprise target without a project or location', () => {
        expect(() => BuildGeminiLiveSetup({ Endpoint: 'enterprise', Model: 'gemini-3.8-live' }, {})).toThrow(/project and location/);
        expect(() => BuildGeminiLiveSetup({ Endpoint: 'enterprise', Model: 'gemini-3.8-live', Project: 'p' }, {})).toThrow(/project and location/);
    });

    it('refuses an empty or malformed model id (as the SDK does)', () => {
        for (const model of ['', 'models/../x', 'gemini?key=1', 'a&b']) {
            expect(() => BuildGeminiLiveSetup({ ...DEVELOPER, Model: model }, {}), model).toThrow(/empty or malformed/);
        }
    });
});

describe('BuildGeminiLiveSetup: where each key goes', () => {
    const generation: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        temperature: 0.4,
        topP: 0.9,
        topK: 32,
        maxOutputTokens: 512,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        seed: 7,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, languageCode: 'en-US' },
        thinkingConfig: { thinkingBudget: 256 },
        enableAffectiveDialog: false,
    };

    it('puts the generation keys under generationConfig, never at the top level', () => {
        for (const target of [DEVELOPER, ENTERPRISE]) {
            const setup = BuildGeminiLiveSetup(target, generation);
            expect(setup.generationConfig).toEqual(generation);
            expect(Object.keys(setup).sort()).toEqual(['generationConfig', 'model']);
        }
    });

    it('writes the system instruction as a Content: a string becomes a user turn of one text part', () => {
        const setup = BuildGeminiLiveSetup(DEVELOPER, { systemInstruction: 'You are MJ.' });
        expect(setup.systemInstruction).toEqual({ parts: [{ text: 'You are MJ.' }], role: 'user' });
    });

    it('writes parts and a Content the way the SDK does', () => {
        expect(BuildGeminiLiveSetup(DEVELOPER, { systemInstruction: ['One.', { text: 'Two.' }] }).systemInstruction).toEqual({
            parts: [{ text: 'One.' }, { text: 'Two.' }],
            role: 'user',
        });
        expect(BuildGeminiLiveSetup(DEVELOPER, { systemInstruction: { text: 'Part.' } }).systemInstruction).toEqual({ parts: [{ text: 'Part.' }], role: 'user' });
        expect(BuildGeminiLiveSetup(ENTERPRISE, { systemInstruction: { parts: [{ text: 'A.' }, { text: 'B.' }] } }).systemInstruction).toEqual({
            parts: [{ text: 'A.' }, { text: 'B.' }],
        });
    });

    it('keeps only text parts in the system instruction, and says so', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const setup = BuildGeminiLiveSetup(DEVELOPER, {
            systemInstruction: { role: 'user', parts: [{ text: 'Keep.' }, { inlineData: { data: 'AA', mimeType: 'image/png' } }, { text: 'Also.', thought: true }] },
        });
        expect(setup.systemInstruction).toEqual({ parts: [{ text: 'Keep.' }, { text: 'Also.' }], role: 'user' });
        expect(warnings(warn).join('\n')).toMatch(/systemInstruction\.parts/);
    });

    it('sends tools as given and shares no object with the config', () => {
        const config: LiveConnectConfig = {
            tools: [
                { functionDeclarations: [{ name: 'lookup', description: 'Looks up', parametersJsonSchema: { type: 'object' }, behavior: Behavior.NON_BLOCKING }] },
                { googleSearch: {} },
            ],
        };
        const setup = BuildGeminiLiveSetup(ENTERPRISE, config);
        expect(setup.tools).toEqual(config.tools);
        expect(setup.tools).not.toBe(config.tools);
    });

    it('names a declaration that uses `parameters`, which goes as given where the SDK would rewrite it', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        // A JSON schema in `parameters` (a type list), which the SDK's processJsonSchema would rewrite.
        const config = JSON.parse(
            '{"tools":[{"functionDeclarations":[{"name":"raw","parameters":{"type":"object","properties":{"id":{"type":["string","null"]}}}}]}]}'
        ) as LiveConnectConfig;
        const setup = BuildGeminiLiveSetup(DEVELOPER, config);
        expect(JSON.stringify(setup.tools)).toContain('"parameters"');
        expect(warnings(warn)).toEqual([expect.stringContaining('raw')]);
    });

    it('puts the session keys at the top level as given on Gemini Enterprise', () => {
        const config: LiveConnectConfig = {
            realtimeInputConfig: { automaticActivityDetection: { disabled: true }, turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY },
            sessionResumption: { transparent: true },
            contextWindowCompression: { triggerTokens: '25600', slidingWindow: { targetTokens: '12800' } },
            inputAudioTranscription: { languageCodes: ['en-US'] },
            outputAudioTranscription: {},
            proactivity: { proactiveAudio: true },
            explicitVadSignal: true,
            avatarConfig: { avatarName: 'Ben', videoBitrateBps: 2_000_000 },
            safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH, method: HarmBlockMethod.SEVERITY }],
        };
        const { model, generationConfig, ...rest } = BuildGeminiLiveSetup(ENTERPRISE, config);
        expect(model).toContain('projects/mj-test');
        expect(generationConfig).toEqual({ responseModalities: [Modality.AUDIO] });
        expect(rest).toEqual(config);
    });

    it('narrows the session keys to what the Developer API takes, and names each key it leaves out', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const setup = BuildGeminiLiveSetup(DEVELOPER, {
            sessionResumption: { handle: 'h', transparent: true },
            inputAudioTranscription: { languageCodes: ['en-US'] },
            outputAudioTranscription: {},
            explicitVadSignal: true,
            safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH, method: HarmBlockMethod.SEVERITY }],
        });
        expect(setup.sessionResumption).toEqual({ handle: 'h' });
        expect(setup.inputAudioTranscription).toEqual({});
        expect(setup.outputAudioTranscription).toEqual({});
        expect(setup.explicitVadSignal).toBeUndefined();
        expect(setup.safetySettings).toEqual([{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }]);
        const logged = warnings(warn);
        expect(logged).toHaveLength(1);
        for (const key of ['explicitVadSignal', 'sessionResumption.transparent', 'inputAudioTranscription.languageCodes', 'safetySettings.method']) {
            expect(logged[0]).toContain(key);
        }
    });

    it('defaults the modalities to AUDIO on Gemini Enterprise only, as the SDK does', () => {
        expect(BuildGeminiLiveSetup(ENTERPRISE, {}).generationConfig).toEqual({ responseModalities: [Modality.AUDIO] });
        expect(BuildGeminiLiveSetup(DEVELOPER, {}).generationConfig).toBeUndefined();
        expect(BuildGeminiLiveSetup(ENTERPRISE, { responseModalities: [Modality.VIDEO] }).generationConfig).toEqual({ responseModalities: [Modality.VIDEO] });
    });

    it('adds no AUDIO default for modalities set to null, as the SDK does (it defaults only an absent key)', () => {
        const config = JSON.parse('{"responseModalities":null}') as LiveConnectConfig;
        expect(BuildGeminiLiveSetup(ENTERPRISE, config).generationConfig).toBeUndefined();
    });

    it('writes translationConfig under generationConfig on the Developer API and leaves it out on Gemini Enterprise', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const config: LiveConnectConfig = { translationConfig: { targetLanguageCode: 'es' } };
        expect(BuildGeminiLiveSetup(DEVELOPER, config).generationConfig).toEqual({ translationConfig: { targetLanguageCode: 'es' } });
        expect(warn).not.toHaveBeenCalled();
        expect(BuildGeminiLiveSetup(ENTERPRISE, config).generationConfig).toEqual({ responseModalities: [Modality.AUDIO] });
        expect(warnings(warn)).toEqual([expect.stringContaining('translationConfig')]);
    });

    it('leaves out multiSpeakerVoiceConfig on both endpoints (the Live API refuses it)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const speechConfig = { languageCode: 'en-US', multiSpeakerVoiceConfig: { speakerVoiceConfigs: [] } };
        for (const target of [DEVELOPER, ENTERPRISE]) {
            expect(BuildGeminiLiveSetup(target, { speechConfig }).generationConfig?.speechConfig).toEqual({ languageCode: 'en-US' });
        }
        expect(warnings(warn).every((line) => line.includes('speechConfig.multiSpeakerVoiceConfig'))).toBe(true);
    });

    it('skips null values, as the SDK does', () => {
        const config = JSON.parse('{"temperature":null,"systemInstruction":null,"tools":null,"avatarConfig":null,"responseModalities":["AUDIO"]}') as LiveConnectConfig;
        expect(BuildGeminiLiveSetup(DEVELOPER, config)).toEqual({ model: 'models/gemini-3.8-live', generationConfig: { responseModalities: [Modality.AUDIO] } });
    });

    it('leaves out keys that are not Live setup fields and logs their names, never their values', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const config = { responseModalities: [Modality.AUDIO], generationConfig: { temperature: 1 }, secretSetting: 'sk-not-for-logs', httpOptions: { timeout: 1 } } as LiveConnectConfig;
        const setup = BuildGeminiLiveSetup(DEVELOPER, config);
        expect(Object.keys(setup).sort()).toEqual(['generationConfig', 'model']);
        expect(setup.generationConfig).toEqual({ responseModalities: [Modality.AUDIO] });
        const logged = warnings(warn);
        expect(logged).toHaveLength(1);
        expect(logged[0]).toMatch(/generationConfig, secretSetting, httpOptions/);
        expect(logged[0]).not.toContain('sk-not-for-logs');
    });

    it('logs nothing for a config with only Live setup fields', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        BuildGeminiLiveSetup(ENTERPRISE, { responseModalities: [Modality.AUDIO], systemInstruction: 'Hi', sessionResumption: {}, inputAudioTranscription: {} });
        expect(warn).not.toHaveBeenCalled();
    });

    it('shares no object with the config in either direction', () => {
        const config: LiveConnectConfig = { realtimeInputConfig: { automaticActivityDetection: { disabled: true } }, avatarConfig: { avatarName: 'Ben' } };
        const setup = BuildGeminiLiveSetup(ENTERPRISE, config);
        config.avatarConfig!.avatarName = 'Changed';
        expect(setup.avatarConfig).toEqual({ avatarName: 'Ben' });
        setup.realtimeInputConfig!.automaticActivityDetection!.disabled = false;
        expect(config.realtimeInputConfig?.automaticActivityDetection?.disabled).toBe(true);
    });
});

describe('BuildGeminiLiveAudioOnlySetup', () => {
    const video: LiveClientSetup = {
        model: 'models/gemini-3.8-live',
        generationConfig: { responseModalities: [Modality.VIDEO], temperature: 0.3 },
        systemInstruction: { parts: [{ text: 'Hi' }], role: 'user' },
        avatarConfig: { avatarName: 'Ben' },
    };

    it('turns video output into audio and removes the avatar, keeping everything else', () => {
        expect(BuildGeminiLiveAudioOnlySetup(video)).toEqual({
            model: 'models/gemini-3.8-live',
            generationConfig: { responseModalities: [Modality.AUDIO], temperature: 0.3 },
            systemInstruction: { parts: [{ text: 'Hi' }], role: 'user' },
        });
        expect(video.avatarConfig).toEqual({ avatarName: 'Ben' });
    });

    it('returns a setup without video unchanged (never an upgrade or a change of kind)', () => {
        const audio: LiveClientSetup = { model: 'm', generationConfig: { responseModalities: [Modality.AUDIO] } };
        const text: LiveClientSetup = { model: 'm', generationConfig: { responseModalities: [Modality.TEXT] } };
        expect(BuildGeminiLiveAudioOnlySetup(audio)).toEqual(audio);
        expect(BuildGeminiLiveAudioOnlySetup(text)).toEqual(text);
        expect(BuildGeminiLiveAudioOnlySetup(audio)).not.toBe(audio);
    });

    it('removes a stray avatarConfig from an audio setup', () => {
        const stray: LiveClientSetup = { model: 'm', generationConfig: { responseModalities: [Modality.AUDIO] }, avatarConfig: { avatarName: 'Ben' } };
        expect(BuildGeminiLiveAudioOnlySetup(stray)).toEqual({ model: 'm', generationConfig: { responseModalities: [Modality.AUDIO] } });
    });
});
