import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @memberjunction/global so @RegisterClass is a no-op decorator (ToJSONSafe rides along for
// the OpenAI provider's LLM module, which the driver's base-class import chain loads).
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    ToJSONSafe: (value: unknown) => value,
}));

// Mock @memberjunction/ai — the driver subclasses the OpenAI provider's OpenAIRealtime, and
// importing `@memberjunction/ai-openai` evaluates that package's whole index, so every base class
// its modules EXTEND at module-evaluation time must exist here. Mirrors the xAI driver's spec.
vi.mock('@memberjunction/ai', async () => {
    class BaseModel {
        private _apiKey: string;
        constructor(apiKey: string) {
            this._apiKey = apiKey;
        }
        // The real BaseModel exposes the key through this protected getter; the driver reads it to
        // send `xi-api-key`.
        protected get apiKey(): string {
            return this._apiKey;
        }
    }
    class BaseRealtimeModel extends BaseModel {
        public get SupportsClientDirect(): boolean {
            return false;
        }
        // Same body as the real BaseRealtimeModel.ClampSessionSeconds (the real module cannot be imported here; see RealtimeDriverFactsOf below).
        protected ClampSessionSeconds(...candidates: ReadonlyArray<number | undefined>): number | undefined {
            let smallest: number | undefined;
            for (const c of candidates) {
                if (typeof c !== 'number' || !Number.isInteger(c) || c <= 0) continue;
                if (smallest === undefined || c < smallest) smallest = c;
            }
            return smallest;
        }
        public async CreateClientSession(): Promise<never> {
            throw new Error(`${this.constructor.name} does not support client-direct realtime sessions`);
        }
    }
    class BaseLLM extends BaseModel {}
    class BaseEmbeddings extends BaseModel {}
    class BaseAudioGenerator extends BaseModel {}
    class BaseTextToSpeech extends BaseModel {}
    class BaseSpeechToText extends BaseModel {}
    class BaseImageGenerator extends BaseModel {}
    class BaseDecision extends BaseModel {}
    class BaseSystemOneDecision extends BaseDecision {}
    class ErrorAnalyzer {
        public static analyzeError(): Record<string, never> {
            return {};
        }
    }
    const RealtimeDiagLog = () => { /* no-op in tests */ };
    // Pure, dependency-free helpers — the REAL implementations, so this spec asserts shipped behavior.
    const { IsTranscriptContinuation } = await import('../../../../Core/src/generic/transcriptContinuation');
    const { ResolveResponseDoneUsage } = await import('../../../../Core/src/generic/realtimeUsage');
    const { RealtimeDroppedInputReporter } = await import('../../../../Core/src/generic/realtimeDroppedInputReporter');
    // Same body as the real RealtimeDriverFactsOf (baseRealtime.ts). The real module cannot be imported here: it pulls in
    // @memberjunction/global, which these suites mock. The mocked BaseRealtimeModel has no static, so only drivers declaring their own resolve.
    const RealtimeDriverFactsOf = (driver: object): object => (driver.constructor as { DriverFacts: object }).DriverFacts;
    return { BaseModel, BaseRealtimeModel, BaseLLM, BaseEmbeddings, BaseAudioGenerator, BaseTextToSpeech, BaseSpeechToText, BaseImageGenerator, BaseDecision, BaseSystemOneDecision, ErrorAnalyzer, RealtimeDiagLog, IsTranscriptContinuation, ResolveResponseDoneUsage, RealtimeDroppedInputReporter, RealtimeDriverFactsOf };
});

// The SDK socket: never touches the network; records what it was opened with.
const webSocketCtor = vi.fn();
vi.mock('openai/realtime/websocket', () => ({
    OpenAIRealtimeWebSocket: vi.fn().mockImplementation(function (this: Record<string, unknown>, props: Record<string, unknown>, client: Record<string, unknown>) {
        webSocketCtor(props, client);
        return this;
    }),
}));

// The SDK client: records its options, and exposes a controllable client-secrets endpoint.
const openAICtor = vi.fn();
const clientSecretsCreate = vi.fn();
vi.mock('openai', () => ({
    OpenAI: vi.fn().mockImplementation(function (this: Record<string, unknown>, opts: Record<string, unknown>) {
        openAICtor(opts);
        this.Options = opts;
        this.realtime = { clientSecrets: { create: clientSecretsCreate } };
        return this;
    }),
}));

import {
    ElevenRealtime,
    ElevenRealtimeSession,
    ELEVEN_REALTIME_BASE_URL,
    ELEVEN_REALTIME_PROFILE,
    BuildElevenRealtimeTurnDetection,
    MapElevenRealtimeEagerness,
    NormalizeEpochToSeconds,
} from '../elevenRealtime';
import type { IOpenAIRealtimeConnection } from '@memberjunction/ai-openai';
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type { RealtimeServerEvent, RealtimeClientEvent, RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime';
import type { ClientSecretCreateParams, ClientSecretCreateResponse } from 'openai/resources/realtime/client-secrets';
import type { RealtimeSessionParams } from '@memberjunction/ai';

/** In-memory connection: records sends and lets tests fire server events. No network. */
class FakeConnection implements IOpenAIRealtimeConnection {
    public Sent: RealtimeClientEvent[] = [];
    public Closed = false;
    private listeners: Array<(event: RealtimeServerEvent) => void> = [];
    private errorListeners: Array<(error: OpenAIRealtimeError) => void> = [];

    public on(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    public on(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    public on(event: 'event' | 'error', listener: ((event: RealtimeServerEvent) => void) | ((error: OpenAIRealtimeError) => void)): void {
        if (event === 'event') {
            this.listeners.push(listener as (event: RealtimeServerEvent) => void);
        } else {
            this.errorListeners.push(listener as (error: OpenAIRealtimeError) => void);
        }
    }
    public off(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    public off(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    public off(event: 'event' | 'error', listener: ((event: RealtimeServerEvent) => void) | ((error: OpenAIRealtimeError) => void)): void {
        if (event === 'event') {
            this.listeners = this.listeners.filter((l) => l !== listener);
        } else {
            this.errorListeners = this.errorListeners.filter((l) => l !== listener);
        }
    }
    public send(event: RealtimeClientEvent): void {
        this.Sent.push(event);
    }
    public close(): void {
        this.Closed = true;
    }
    public Fire(event: RealtimeServerEvent): void {
        for (const l of [...this.listeners]) {
            l(event);
        }
    }
    /** The first `session.update` sent, or undefined. */
    public get SessionUpdate(): RealtimeSessionCreateRequest | undefined {
        const frame = this.Sent.find((e) => e.type === 'session.update');
        return frame && frame.type === 'session.update' ? frame.session as RealtimeSessionCreateRequest : undefined;
    }
}

/** A minimal `session.created` frame — all the deferred config apply looks at is its type. */
const SESSION_CREATED = { type: 'session.created', event_id: 'evt_1', session: { type: 'realtime' } } as RealtimeServerEvent;

/**
 * Driver subclass with both network seams stubbed: minting records its request and returns a fixed
 * secret, and the socket is a {@link FakeConnection}.
 */
class TestableElevenRealtime extends ElevenRealtime {
    public Fake = new FakeConnection();
    public MintBodies: ClientSecretCreateParams[] = [];
    public ConnectedWith: { model: string; secret: string } | null = null;
    public ExpiresAt = 1_893_456_000;

    protected override async mintClientSecret(body: ClientSecretCreateParams): Promise<ClientSecretCreateResponse> {
        this.MintBodies.push(body);
        return { value: 'ek_eleven_123', expires_at: this.ExpiresAt, session: { type: 'realtime' } as ClientSecretCreateResponse['session'] };
    }
    protected override createAuthenticatedConnection(model: string, clientSecret: string): IOpenAIRealtimeConnection {
        this.ConnectedWith = { model, secret: clientSecret };
        return this.Fake;
    }
}

/** Exposes the production minting and connection seams (the SDK itself is mocked above). */
class SeamExposingElevenRealtime extends ElevenRealtime {
    public Mint(body: ClientSecretCreateParams): Promise<ClientSecretCreateResponse> {
        return this.mintClientSecret(body);
    }
    public Connect(model: string, secret: string): IOpenAIRealtimeConnection {
        return this.createAuthenticatedConnection(model, secret);
    }
}

function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return {
        Model: 'eleven_realtime_v1_max',
        SystemPrompt: 'You are the MJ co-agent.',
        Tools: [{ Name: 'lookup', Description: 'Looks a record up', ParametersSchema: { type: 'object', properties: {} } }],
        ...overrides,
    } as RealtimeSessionParams;
}

describe('ElevenRealtime', () => {
    beforeEach(() => {
        openAICtor.mockClear();
        webSocketCtor.mockClear();
        clientSecretsCreate.mockReset();
    });

    describe('construction', () => {
        it('points the OpenAI SDK at the Eleven Realtime base URL', () => {
            new TestableElevenRealtime('xi-key');
            expect(openAICtor).toHaveBeenCalledWith({ apiKey: 'xi-key', baseURL: ELEVEN_REALTIME_BASE_URL });
            expect(ELEVEN_REALTIME_BASE_URL).toBe('https://api.elevenlabs.io/v1/convai');
        });

        it('supports client-direct sessions and dynamic tool sets', () => {
            const driver = new TestableElevenRealtime('xi-key');
            expect(driver.SupportsClientDirect).toBe(true);
            expect(ElevenRealtime.SupportsDynamicToolSet).toBe(true);
        });

        it('offers the ElevenLabs premade voices, by voice id', () => {
            const voices = new TestableElevenRealtime('xi-key').SupportedVoices;
            expect(voices.length).toBeGreaterThan(0);
            expect(voices).toContainEqual({ ID: '21m00Tcm4TlvDq8ikWAM', Name: 'Rachel' });
        });
    });

    describe('mintClientSecret (production seam)', () => {
        it('sends xi-api-key and removes the bearer header', async () => {
            clientSecretsCreate.mockResolvedValue({ value: 'ek_1', expires_at: 1_893_456_000, session: { type: 'realtime' } });
            const driver = new SeamExposingElevenRealtime('xi-key');
            const body: ClientSecretCreateParams = { session: { type: 'realtime', model: 'eleven_realtime_v1_mini' } };
            await driver.Mint(body);
            expect(clientSecretsCreate).toHaveBeenCalledWith(body, { headers: { 'xi-api-key': 'xi-key', Authorization: null } });
        });

        it('keeps an expires_at already in seconds', async () => {
            clientSecretsCreate.mockResolvedValue({ value: 'ek_1', expires_at: 1_893_456_000, session: { type: 'realtime' } });
            const response = await new SeamExposingElevenRealtime('xi-key').Mint({});
            expect(response.expires_at).toBe(1_893_456_000);
        });

        it('converts an expires_at in milliseconds to seconds', async () => {
            clientSecretsCreate.mockResolvedValue({ value: 'ek_1', expires_at: 1_893_456_000_123, session: { type: 'realtime' } });
            const response = await new SeamExposingElevenRealtime('xi-key').Mint({});
            expect(response.expires_at).toBe(1_893_456_000);
            expect(response.value).toBe('ek_1');
        });

        it('lets a minting failure propagate', async () => {
            clientSecretsCreate.mockRejectedValue(new Error('401 invalid api key'));
            await expect(new SeamExposingElevenRealtime('xi-key').Mint({})).rejects.toThrow('401 invalid api key');
        });
    });

    describe('createAuthenticatedConnection (production seam)', () => {
        it('opens the SDK socket with the minted secret as its key, against the Eleven base URL', () => {
            const driver = new SeamExposingElevenRealtime('xi-key');
            openAICtor.mockClear();
            driver.Connect('eleven_realtime_v1_mini', 'ek_secret');
            expect(openAICtor).toHaveBeenCalledWith({ apiKey: 'ek_secret', baseURL: ELEVEN_REALTIME_BASE_URL });
            expect(webSocketCtor).toHaveBeenCalledTimes(1);
            expect(webSocketCtor.mock.calls[0][0]).toEqual({ model: 'eleven_realtime_v1_mini' });
            expect((webSocketCtor.mock.calls[0][1] as { Options: unknown }).Options).toEqual({ apiKey: 'ek_secret', baseURL: ELEVEN_REALTIME_BASE_URL });
        });
    });

    describe('StartSession (server-bridged)', () => {
        it('mints a model-only secret and opens the socket with it — never with the API key', async () => {
            const driver = new TestableElevenRealtime('xi-key');
            await driver.StartSession(makeParams());
            expect(driver.MintBodies).toEqual([{ session: { type: 'realtime', model: 'eleven_realtime_v1_max' } }]);
            expect(driver.ConnectedWith).toEqual({ model: 'eleven_realtime_v1_max', secret: 'ek_eleven_123' });
        });

        it('returns an Eleven-branded session', async () => {
            const session = await new TestableElevenRealtime('xi-key').StartSession(makeParams());
            expect(session).toBeInstanceOf(ElevenRealtimeSession);
        });

        it('waits for session.created before sending the session config', async () => {
            const driver = new TestableElevenRealtime('xi-key');
            await driver.StartSession(makeParams());
            expect(driver.Fake.Sent).toHaveLength(0);
            driver.Fake.Fire(SESSION_CREATED);
            const update = driver.Fake.SessionUpdate;
            expect(update?.instructions).toBe('You are the MJ co-agent.');
            expect(update?.tools).toEqual([{ type: 'function', name: 'lookup', description: 'Looks a record up', parameters: { type: 'object', properties: {} } }]);
        });

        it('sends no transcription model — the cascade transcribes the user itself', async () => {
            const driver = new TestableElevenRealtime('xi-key');
            await driver.StartSession(makeParams());
            driver.Fake.Fire(SESSION_CREATED);
            expect(driver.Fake.SessionUpdate?.audio).toBeUndefined();
        });

        it('drops reasoning effort and parallel tool calls, keeps MCP tools and the voice', async () => {
            const driver = new TestableElevenRealtime('xi-key');
            const mcp = { type: 'mcp', server_label: 'crm', server_url: 'https://mcp.example.com', require_approval: 'never' };
            await driver.StartSession(makeParams({
                Config: { reasoningEffort: 'high', parallelToolCalls: true, mcpTools: [mcp], voice: 'pNInz6obpgDQGcFmaJgB' },
            }));
            driver.Fake.Fire(SESSION_CREATED);
            const update = driver.Fake.SessionUpdate as RealtimeSessionCreateRequest & { reasoning?: unknown; parallel_tool_calls?: unknown };
            expect(update.reasoning).toBeUndefined();
            expect(update.parallel_tool_calls).toBeUndefined();
            expect(update.tools).toContainEqual(mcp);
            expect(update.audio?.output?.voice).toBe('pNInz6obpgDQGcFmaJgB');
        });

        it("maps MJ's 'auto' eagerness to Eleven's 'medium'", async () => {
            const driver = new TestableElevenRealtime('xi-key');
            await driver.StartSession(makeParams({ Config: { turnDetection: { Mode: 'semanticVad', Eagerness: 'auto' } } }));
            driver.Fake.Fire(SESSION_CREATED);
            expect(driver.Fake.SessionUpdate?.audio?.input?.turn_detection).toEqual({
                type: 'semantic_vad', eagerness: 'medium', create_response: true, interrupt_response: true,
            });
        });

        it('passes the max_duration_seconds extension through untouched', async () => {
            const driver = new TestableElevenRealtime('xi-key');
            await driver.StartSession(makeParams({ Config: { max_duration_seconds: 600 } }));
            driver.Fake.Fire(SESSION_CREATED);
            expect((driver.Fake.SessionUpdate as Record<string, unknown>)['max_duration_seconds']).toBe(600);
        });

        describe('max_duration_seconds is min(provider cap, MaxSessionSeconds, bag)', () => {
            const sentOnBridge = async (params: Partial<RealtimeSessionParams>): Promise<Record<string, unknown>> => {
                const driver = new TestableElevenRealtime('xi-key');
                await driver.StartSession(makeParams(params));
                driver.Fake.Fire(SESSION_CREATED);
                return driver.Fake.SessionUpdate as Record<string, unknown>;
            };
            const minted = async (params: Partial<RealtimeSessionParams>): Promise<Record<string, unknown>> => {
                const driver = new TestableElevenRealtime('xi-key');
                await driver.CreateClientSession(makeParams(params));
                return driver.MintBodies[0].session as Record<string, unknown>;
            };

            it('MaxSessionSeconds 900, no bag -> 900 on both paths', async () => {
                expect((await sentOnBridge({ MaxSessionSeconds: 900 }))['max_duration_seconds']).toBe(900);
                expect((await minted({ MaxSessionSeconds: 900 }))['max_duration_seconds']).toBe(900);
            });

            it('bag 600 wins when smaller', async () => {
                const params = { MaxSessionSeconds: 900, Config: { max_duration_seconds: 600 } };
                expect((await sentOnBridge(params))['max_duration_seconds']).toBe(600);
                expect((await minted(params))['max_duration_seconds']).toBe(600);
            });

            it('bag 1200 loses to MaxSessionSeconds 900', async () => {
                const params = { MaxSessionSeconds: 900, Config: { max_duration_seconds: 1200 } };
                expect((await sentOnBridge(params))['max_duration_seconds']).toBe(900);
                expect((await minted(params))['max_duration_seconds']).toBe(900);
            });

            it('ignores a non-number bag value and never sends it as-is', async () => {
                const params = { MaxSessionSeconds: 900, Config: { max_duration_seconds: '600' } };
                expect((await sentOnBridge(params))['max_duration_seconds']).toBe(900);
                expect((await minted(params))['max_duration_seconds']).toBe(900);
                const bagOnly = { Config: { max_duration_seconds: '600' } };
                expect('max_duration_seconds' in (await sentOnBridge(bagOnly))).toBe(false);
                expect('max_duration_seconds' in (await minted(bagOnly))).toBe(false);
            });

            it('ClientConfig MaxSessionSeconds equals the wire max_duration_seconds, bag clamp included', async () => {
                const cases: Array<[Partial<RealtimeSessionParams>, number | undefined]> = [
                    [{ MaxSessionSeconds: 900 }, 900],
                    [{ MaxSessionSeconds: 900, Config: { max_duration_seconds: 600 } }, 600],
                    [{ MaxSessionSeconds: 900, Config: { max_duration_seconds: 1200 } }, 900],
                    [{ Config: { max_duration_seconds: 600 } }, 600],
                    [{}, undefined],
                ];
                for (const [params, expected] of cases) {
                    const driver = new TestableElevenRealtime('xi-key');
                    const cfg = await driver.CreateClientSession(makeParams(params));
                    expect(cfg.MaxSessionSeconds).toBe(expected);
                    expect((driver.MintBodies[0].session as Record<string, unknown>)['max_duration_seconds']).toBe(expected);
                }
            });

            it('no MaxSessionSeconds and no bag -> field absent', async () => {
                expect('max_duration_seconds' in (await sentOnBridge({}))).toBe(false);
                expect('max_duration_seconds' in (await minted({}))).toBe(false);
            });

            it('does not mutate the caller Config bag', async () => {
                const config = { max_duration_seconds: 1200 };
                await sentOnBridge({ MaxSessionSeconds: 900, Config: config });
                expect(config.max_duration_seconds).toBe(1200);
            });
        });

        it('does not open a socket when minting fails', async () => {
            class FailingMint extends TestableElevenRealtime {
                protected override async mintClientSecret(): Promise<ClientSecretCreateResponse> {
                    throw new Error('quota exceeded');
                }
            }
            const driver = new FailingMint('xi-key');
            await expect(driver.StartSession(makeParams())).rejects.toThrow('quota exceeded');
            expect(driver.ConnectedWith).toBeNull();
        });
    });

    describe('CreateClientSession (client-direct)', () => {
        it("stamps the 'eleven-realtime' provider key and returns the minted secret", async () => {
            const config = await new TestableElevenRealtime('xi-key').CreateClientSession(makeParams());
            expect(config.Provider).toBe('eleven-realtime');
            expect(config.Model).toBe('eleven_realtime_v1_max');
            expect(config.EphemeralToken).toBe('ek_eleven_123');
            expect(config.ExpiresAt).toBe(new Date(1_893_456_000 * 1000).toISOString());
        });

        it('mints with the full server-authored session', async () => {
            const driver = new TestableElevenRealtime('xi-key');
            const config = await driver.CreateClientSession(makeParams({ Config: { voice: 'EXAVITQu4vr4xnSDxMaL' } }));
            const minted = driver.MintBodies[0].session as RealtimeSessionCreateRequest;
            expect(minted.model).toBe('eleven_realtime_v1_max');
            expect(minted.instructions).toBe('You are the MJ co-agent.');
            expect(minted.audio).toEqual({ output: { voice: 'EXAVITQu4vr4xnSDxMaL' } });
            expect(config.SessionConfig).toEqual(JSON.parse(JSON.stringify(minted)));
        });

        it('omits the audio block entirely when nothing configures it', async () => {
            const driver = new TestableElevenRealtime('xi-key');
            await driver.CreateClientSession(makeParams());
            expect((driver.MintBodies[0].session as RealtimeSessionCreateRequest).audio).toBeUndefined();
        });
    });
});

describe('ELEVEN_REALTIME_PROFILE', () => {
    it('gates the features to what the echoed Eleven session keeps', () => {
        expect(ELEVEN_REALTIME_PROFILE.providerKey).toBe('eleven-realtime');
        expect(ELEVEN_REALTIME_PROFILE.inputTranscriptionModel).toBeUndefined();
        expect(ELEVEN_REALTIME_PROFILE.supportsReasoningEffort).toBe(false);
        expect(ELEVEN_REALTIME_PROFILE.supportsParallelToolCalls).toBe(false);
        expect(ELEVEN_REALTIME_PROFILE.supportsMcpTools).toBe(true);
        expect(ELEVEN_REALTIME_PROFILE.supportsVoiceOutput).toBe(true);
        expect(ELEVEN_REALTIME_PROFILE.deferInitialConfigUntilSessionCreated).toBe(true);
        expect(ELEVEN_REALTIME_PROFILE.supportedTurnModes).toEqual(['serverVad', 'semanticVad']);
    });
});

describe('BuildElevenRealtimeTurnDetection', () => {
    it("omits the block when nothing is requested, leaving ElevenLabs' own turn-taking", () => {
        expect(BuildElevenRealtimeTurnDetection(false, undefined)).toBeUndefined();
        expect(BuildElevenRealtimeTurnDetection(false, { Mode: 'default' })).toBeUndefined();
    });

    it('disables auto-response in meeting mode while keeping detection and barge-in', () => {
        expect(BuildElevenRealtimeTurnDetection(true, undefined)).toEqual({
            type: 'semantic_vad', create_response: false, interrupt_response: true,
        });
    });

    it.each([
        ['low', 'low'],
        ['auto', 'medium'],
        ['high', 'high'],
    ] as const)("maps semanticVad eagerness '%s' to '%s'", (mj, eleven) => {
        expect(BuildElevenRealtimeTurnDetection(false, { Mode: 'semanticVad', Eagerness: mj })).toEqual({
            type: 'semantic_vad', eagerness: eleven, create_response: true, interrupt_response: true,
        });
    });

    it('sends semanticVad without eagerness when none is requested', () => {
        expect(BuildElevenRealtimeTurnDetection(true, { Mode: 'semanticVad' })).toEqual({
            type: 'semantic_vad', create_response: false, interrupt_response: true,
        });
    });

    it('maps serverVad with its tuning knobs, and never leaks eagerness onto it', () => {
        expect(BuildElevenRealtimeTurnDetection(false, { Mode: 'serverVad', Threshold: 0.6, SilenceDurationMs: 700, Eagerness: 'high' })).toEqual({
            type: 'server_vad', threshold: 0.6, silence_duration_ms: 700, create_response: true, interrupt_response: true,
        });
    });

    it("falls back for 'native', which Eleven Realtime has no mode for", () => {
        expect(BuildElevenRealtimeTurnDetection(false, { Mode: 'native' })).toBeUndefined();
        expect(BuildElevenRealtimeTurnDetection(true, { Mode: 'native' })).toEqual({
            type: 'semantic_vad', create_response: false, interrupt_response: true,
        });
    });
});

describe('MapElevenRealtimeEagerness', () => {
    it('returns undefined for absent input', () => {
        expect(MapElevenRealtimeEagerness(undefined)).toBeUndefined();
    });
});

describe('NormalizeEpochToSeconds', () => {
    it('leaves seconds alone and converts milliseconds', () => {
        expect(NormalizeEpochToSeconds(1_893_456_000)).toBe(1_893_456_000);
        expect(NormalizeEpochToSeconds(1_893_456_000_999)).toBe(1_893_456_000);
    });
});
