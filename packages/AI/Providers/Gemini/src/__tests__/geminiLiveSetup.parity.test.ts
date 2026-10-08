/**
 * Parity between MJ's Live setup writer and the installed `@google/genai`: the node SDK's `live.connect` runs against an
 * in-process websocket server (a minimal one on `node:http`, see `websocket-capture-test-helpers.ts`), in Developer mode
 * (a dummy key) and in Enterprise (Vertex) mode (a custom base URL and no auth, which the SDK sends to verbatim), and the
 * server captures the `setup` message it sends. `BuildGeminiLiveSetup` must write the same setup, except the model: in
 * Enterprise mode without a project the SDK writes `publishers/google/models/<id>`, and MJ writes the project and
 * location in front of it.
 *
 * This is what catches a mapping the SDK changes on an upgrade.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import {
    Behavior,
    GoogleGenAI,
    HarmBlockMethod,
    HarmBlockThreshold,
    HarmCategory,
    MediaResolution,
    Modality,
    StartSensitivity,
    TurnCoverage,
    type LiveClientSetup,
    type LiveConnectConfig,
} from '@google/genai';
import type { RealtimeSessionParams } from '@memberjunction/ai';
import { GeminiRealtime } from '../geminiRealtime';
import type { GeminiLiveEndpoint } from '../geminiLiveProfiles';
import { BuildGeminiLiveSetup } from '../geminiLiveSetup';
import { CaptureWebSocketServer } from './websocket-capture-test-helpers';

const PROJECT = 'mj-parity';
const LOCATION = 'us-central1';

/** Environment the SDK reads at construction; cleared so only the options below decide its mode and URL. */
const SDK_ENV = [
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_LOCATION',
    'GOOGLE_GENAI_USE_VERTEXAI',
    'GOOGLE_GENAI_USE_ENTERPRISE',
    'GOOGLE_VERTEX_BASE_URL',
    'GOOGLE_GEMINI_BASE_URL',
];

let server: CaptureWebSocketServer;
let baseUrl = '';
const savedEnv = new Map<string, string | undefined>();

beforeAll(async () => {
    for (const name of SDK_ENV) {
        savedEnv.set(name, process.env[name]);
        delete process.env[name];
    }
    server = await CaptureWebSocketServer.Start();
    baseUrl = server.BaseUrl;
});

beforeEach(() => {
    // The driver logs its avatar and legality decisions, the SDK its mode choices; neither is under test here.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
    server.CloseConnections();
});

afterAll(async () => {
    await server.Stop();
    for (const [name, value] of savedEnv) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

/** A client in the endpoint's mode, pointed at the capture server. */
function sdkClient(endpoint: GeminiLiveEndpoint): GoogleGenAI {
    return endpoint === 'developer'
        ? new GoogleGenAI({ apiKey: 'parity-test-key', httpOptions: { baseUrl } })
        : new GoogleGenAI({ vertexai: true, httpOptions: { baseUrl } });
}

/** The setup the installed SDK sends for `config` in the endpoint's mode. */
async function sdkSetup(endpoint: GeminiLiveEndpoint, model: string, config: LiveConnectConfig): Promise<LiveClientSetup> {
    const captured = server.NextMessage();
    const session = await sdkClient(endpoint).live.connect({ model, config: structuredClone(config), callbacks: { onmessage: () => undefined } });
    const text = await captured;
    session.close();
    return (JSON.parse(text) as { setup: LiveClientSetup }).setup;
}

/** Asserts MJ's setup equals the SDK's in the endpoint's mode, with the model path the endpoint needs. */
async function expectParity(endpoint: GeminiLiveEndpoint, model: string, config: LiveConnectConfig): Promise<void> {
    const sdk = await sdkSetup(endpoint, model, config);
    const ours = BuildGeminiLiveSetup({ Endpoint: endpoint, Model: model, Project: PROJECT, Location: LOCATION }, config);
    const { model: sdkModel, ...sdkRest } = sdk;
    const { model: ourModel, ...ourRest } = ours;
    expect(ourRest).toStrictEqual(sdkRest);
    if (endpoint === 'developer') {
        expect(ourModel).toBe(sdkModel);
    } else {
        expect(sdkModel).toBe(`publishers/google/models/${model}`);
        expect(ourModel).toBe(`projects/${PROJECT}/locations/${LOCATION}/${sdkModel}`);
    }
}

/** A Gemini driver on either endpoint that exposes the connect config it builds. */
class ConfigProbe extends GeminiRealtime {
    constructor(private readonly endpoint: GeminiLiveEndpoint) {
        super('parity-test-key');
    }

    protected override get Endpoint(): GeminiLiveEndpoint {
        return this.endpoint;
    }

    public Build(params: RealtimeSessionParams): LiveConnectConfig {
        return this.BuildConnectConfig(params);
    }
}

const LOOKUP_TOOL = {
    Name: 'LookupRecord',
    Description: 'Looks a record up by id',
    ParametersSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
};

const MJ_SESSIONS: Array<[string, RealtimeSessionParams]> = [
    [
        'an audio session with tools, a voice and a temperature',
        {
            Model: 'gemini-3.8-live',
            SystemPrompt: 'You are a helpful agent.',
            Tools: [LOOKUP_TOOL],
            Config: { voice: 'Kore', temperature: 0.4, turnDetection: { Coverage: 'audioActivityAndAllVideo' } },
        },
    ],
    ['an avatar session', { Model: 'gemini-3.8-live', SystemPrompt: 'You are Ben.', Avatar: { AvatarID: 'Ben', PersonaName: 'Ben' } }],
    [
        'a meeting session with zero data retention',
        { Model: 'gemini-3.8-live', SystemPrompt: 'Meeting agent.', ZeroDataRetention: true, Config: { disableAutoResponse: true } },
    ],
    [
        'Extended Thinking with thought summaries',
        {
            Model: 'gemini-3.8-live-extended-thinking',
            SystemPrompt: 'Think first.',
            Tools: [LOOKUP_TOOL],
            Config: { reasoning: { Effort: 'high', IncludeThoughtSummaries: true } },
        },
    ],
];

/** Every key the builder maps that both endpoints accept. */
const EVERY_SHARED_KEY: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 1024,
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
    seed: 7,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }, languageCode: 'en-US' },
    thinkingConfig: { thinkingBudget: 512, includeThoughts: true },
    enableAffectiveDialog: false,
    systemInstruction: { role: 'user', parts: [{ text: 'First paragraph.' }, { text: 'Second paragraph.' }] },
    tools: [
        { functionDeclarations: [{ name: 'lookup', description: 'Looks up', parametersJsonSchema: { type: 'object' }, behavior: Behavior.NON_BLOCKING }] },
        { googleSearch: {} },
    ],
    sessionResumption: {},
    contextWindowCompression: { triggerTokens: '25600', slidingWindow: { targetTokens: '12800' } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
        automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW, silenceDurationMs: 500 },
        turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
    },
    proactivity: { proactiveAudio: true },
    avatarConfig: { avatarName: 'Ben', videoBitrateBps: 2_000_000, audioBitrateBps: 64_000 },
    safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }],
};

describe.each<GeminiLiveEndpoint>(['developer', 'enterprise'])('BuildGeminiLiveSetup matches the installed SDK (%s mode)', (endpoint) => {
    it.each(MJ_SESSIONS)("for %s, as GeminiRealtime.BuildConnectConfig builds it", async (_label, params) => {
        const config = new ConfigProbe(endpoint).Build(params);
        await expectParity(endpoint, params.Model, config);
    });

    it('for every key both endpoints take', async () => {
        await expectParity(endpoint, 'gemini-3.8-live', EVERY_SHARED_KEY);
    });

    it('for a config with no modalities', async () => {
        await expectParity(endpoint, 'gemini-3.8-live', { systemInstruction: 'Hello.' });
    });

    it.each<[string, LiveConnectConfig['systemInstruction']]>([
        ['a string', 'Be brief.'],
        ['a list of strings and parts', ['One.', { text: 'Two.' }]],
        ['one part', { text: 'Only part.' }],
        ['a Content without a role', { parts: [{ text: 'No role.' }] }],
    ])('for a system instruction given as %s', async (_label, systemInstruction) => {
        await expectParity(endpoint, 'gemini-3.8-live', { responseModalities: [Modality.AUDIO], systemInstruction });
    });

    it('for a system instruction over 64 KiB (a long agent prompt)', async () => {
        await expectParity(endpoint, 'gemini-3.8-live', { responseModalities: [Modality.AUDIO], systemInstruction: 'Follow the policy. '.repeat(4_000) });
    });

    it('for null values, which the SDK skips', async () => {
        const config = JSON.parse('{"responseModalities":["AUDIO"],"temperature":null,"avatarConfig":null,"tools":null}') as LiveConnectConfig;
        await expectParity(endpoint, 'gemini-3.8-live', config);
    });

    it('for modalities set to null (Enterprise mode defaults only an absent key)', async () => {
        const config = JSON.parse('{"responseModalities":null,"temperature":0.5}') as LiveConnectConfig;
        await expectParity(endpoint, 'gemini-3.8-live', config);
    });
});

describe('BuildGeminiLiveSetup matches the installed SDK on keys only one endpoint takes', () => {
    it('Enterprise mode: explicitVadSignal, transparent resumption, transcription language codes, a safety method', async () => {
        await expectParity('enterprise', 'gemini-3.8-live', {
            responseModalities: [Modality.VIDEO],
            explicitVadSignal: true,
            sessionResumption: { transparent: true },
            inputAudioTranscription: { languageCodes: ['en-US'] },
            outputAudioTranscription: { languageCodes: ['en-US'] },
            safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH, method: HarmBlockMethod.SEVERITY }],
        });
    });

    it('Developer mode: translationConfig under generationConfig', async () => {
        await expectParity('developer', 'gemini-3.8-live', { responseModalities: [Modality.AUDIO], translationConfig: { targetLanguageCode: 'es' } });
    });

    it.each<[GeminiLiveEndpoint, string, LiveConnectConfig]>([
        ['developer', 'explicitVadSignal', { explicitVadSignal: true }],
        ['developer', 'transparent', { sessionResumption: { transparent: true } }],
        ['developer', 'languageCodes', { inputAudioTranscription: { languageCodes: ['en-US'] } }],
        ['enterprise', 'translationConfig', { translationConfig: { targetLanguageCode: 'es' } }],
        ['enterprise', 'multiSpeakerVoiceConfig', { speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [] } } }],
    ])('where the SDK refuses a key (%s mode: %s), the setup leaves it out instead', async (endpoint, key, config) => {
        await expect(sdkClient(endpoint).live.connect({ model: 'gemini-3.8-live', config: structuredClone(config), callbacks: { onmessage: () => undefined } })).rejects.toThrow(key);
        const setup = BuildGeminiLiveSetup({ Endpoint: endpoint, Model: 'gemini-3.8-live', Project: PROJECT, Location: LOCATION }, config);
        expect(JSON.stringify(setup)).not.toContain(key);
    });
});
