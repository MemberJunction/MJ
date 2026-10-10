import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleAuth, JWT, type GoogleAuthOptions } from 'google-auth-library';
import {
    GoogleGenAI,
    LiveServerMessage,
    type Content,
    type FunctionResponse,
    type GoogleGenAIOptions,
    type Live,
    type LiveClientSetup,
    type LiveConnectParameters,
    type Blob as GeminiBlob,
} from '@google/genai';
import {
    BaseRealtimeModel,
    RealtimeProxyRegistry,
    type ClientRealtimeSessionConfig,
    type RealtimeRelayGrant,
    type RealtimeRelayOpenIntent,
    type RealtimeSessionParams,
    type RealtimeToolCall,
} from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { GeminiRealtime, type GeminiLiveSession } from '@memberjunction/ai-gemini';
import { GeminiEnterpriseRealtime, type GeminiEnterpriseLiveClient } from '../models/geminiEnterpriseRealtime';
import type { VertexGoogleAuth } from '../vertexAccessToken';
import { ParseVertexAICredentials, type VertexAICredentials } from '../vertexCredentials';

// ── Stand-in credentials (none of them real) ──────────────────────────────────────────────────────────

const PRIVATE_KEY_BODY = 'MIIstandinPrivateKeyMaterialNotARealKey';
/** The part of the key a JSON parser's message would quote. */
const KEY_FRAGMENT = PRIVATE_KEY_BODY.slice(0, 10);
const STAND_IN_KEY = `-----BEGIN PRIVATE KEY-----\n${PRIVATE_KEY_BODY}\n-----END PRIVATE KEY-----\n`;
const SA_EMAIL = 'relay-sa@stand-in-project.iam.gserviceaccount.com';
const KEY_ID = 'stand-in-key-id-123';
const PROJECT = 'stand-in-project';
const ACCESS_TOKEN = 'ya29.stand-in-access-token';
const SYSTEM_PROMPT = 'You are the stand-in agent. The secret word is pineapple.';
const TOOL = { Name: 'lookup_order', Description: 'Looks up an order by its number', ParametersSchema: { type: 'object', properties: { number: { type: 'string' } } } };
const MJAPI = 'https://mjapi.example.test';
const AVATAR_TYPE = 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const FILE_EMAIL = 'file-sa@stand-in-project.iam.gserviceaccount.com';
const KEY_FILE_PROBLEM = /its Vertex AI key names a key file, which only the environment key \(AI_VENDOR_API_KEY__GeminiEnterpriseRealtime\) may do/;
/** The turn coverage Vertex AI refuses at setup (1007), and the one it accepts. */
const ALL_VIDEO_COVERAGE = 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO';
const ONLY_ACTIVITY_COVERAGE = 'TURN_INCLUDES_ONLY_ACTIVITY';
const ENTERPRISE_COVERAGE_LINE =
    '[GeminiRealtime] Turn coverage "audioActivityAndAllVideo" is not one Gemini Enterprise accepts for gemini-3.8-live ' +
    '(it accepts audioActivityOnly); sent "audioActivityOnly" (TURN_INCLUDES_ONLY_ACTIVITY) instead.';
/** Where a subclass points the Live socket: a mock upstream on this machine, without TLS. */
const MOCK_LIVE_URL = 'ws://127.0.0.1:9000/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';
/** A Google Cloud API key in Google's shape (AIza…): a stand-in, never a real one. */
const STAND_IN_API_KEY = 'AIzaStandInSeamKeyNotReal0123456789abcd';

let keyDir: string;
let keyFilePath: string;
/** `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime`: it names a key file, which only it may do. */
let environmentKey: string;

beforeAll(() => {
    keyDir = mkdtempSync(join(tmpdir(), 'mj-gemini-enterprise-'));
    keyFilePath = join(keyDir, 'relay-sa.json');
    writeFileSync(keyFilePath, JSON.stringify({ type: 'service_account', project_id: PROJECT, private_key: STAND_IN_KEY, client_email: FILE_EMAIL }));
    environmentKey = JSON.stringify({ project: PROJECT, location: 'us-central1', keyFilePath });
    // Set once for the file: the platform caches environment keys for the life of the process.
    vi.stubEnv('AI_VENDOR_API_KEY__GeminiEnterpriseRealtime', environmentKey);
});

afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(keyDir, { recursive: true, force: true });
});

/** An inline service-account key, as `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` would hold it. */
function serviceAccountKey(overrides: Record<string, string> = {}): string {
    return JSON.stringify({
        type: 'service_account',
        project_id: PROJECT,
        private_key: STAND_IN_KEY,
        private_key_id: KEY_ID,
        client_email: SA_EMAIL,
        location: 'us-central1',
        ...overrides,
    });
}

function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return {
        Model: 'gemini-3.8-live',
        SystemPrompt: SYSTEM_PROMPT,
        Tools: [TOOL],
        Config: { proxyBaseUrl: MJAPI },
        UserID: 'user-1',
        ...overrides,
    };
}

// ── Fakes ──────────────────────────────────────────────────────────────────────────────────────────────

/** A fake `GoogleAuth`: counts token requests. */
class FakeGoogleAuth implements VertexGoogleAuth {
    public readonly Urls: Array<string | URL | undefined> = [];
    public async getRequestHeaders(url?: string | URL): Promise<Headers> {
        this.Urls.push(url);
        return new Headers({ Authorization: `Bearer ${ACCESS_TOKEN}` });
    }
}

/** A fake Live session: records sends. */
class FakeLiveSession implements GeminiLiveSession {
    public readonly ToolResponses: Array<{ functionResponses: FunctionResponse[] | FunctionResponse }> = [];
    public Closed = false;
    public sendRealtimeInput(_params: { audio?: GeminiBlob; text?: string }): void {}
    public sendClientContent(_params: { turns?: Content[]; turnComplete?: boolean }): void {}
    public sendToolResponse(params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {
        this.ToolResponses.push(params);
    }
    public close(): void {
        this.Closed = true;
    }
}

/** The driver over a fake `GoogleAuth` and a fake Vertex client. */
class TestEnterprise extends GeminiEnterpriseRealtime {
    public readonly AuthOptions: GoogleAuthOptions[] = [];
    public readonly Auth = new FakeGoogleAuth();
    public readonly ClientOptions: GoogleGenAIOptions[] = [];
    public readonly Connects: LiveConnectParameters[] = [];
    public readonly Session = new FakeLiveSession();
    /** When set, the next Vertex client creation fails once. */
    public FailNextClient = false;

    protected override CreateGoogleAuth(options: GoogleAuthOptions): VertexGoogleAuth {
        this.AuthOptions.push(options);
        return this.Auth;
    }

    protected override CreateVertexClient(options: GoogleGenAIOptions): GeminiEnterpriseLiveClient {
        this.ClientOptions.push(options);
        if (this.FailNextClient) {
            this.FailNextClient = false;
            throw new Error('stand-in client failure');
        }
        return {
            live: {
                connect: async (params: LiveConnectParameters): Promise<GeminiLiveSession> => {
                    this.Connects.push(params);
                    return this.Session;
                },
            },
        };
    }

    /** The protected Developer-token seam, which this driver refuses. */
    public async MintDeveloperToken(): Promise<never> {
        return this.mintAuthToken();
    }

    /** The protected Live URL seam, as this driver answers it. */
    public LiveUrlOf(credentials: VertexAICredentials, location: string | null): string {
        return this.LiveUrl(credentials, location);
    }
}

/** A subclass that moves the Live socket (to a mock upstream, a proxy) and records what it was asked. */
class MovedEnterprise extends TestEnterprise {
    public readonly LiveUrlCalls: Array<{ Project: string; Location: string | null }> = [];
    private readonly movedUrl: string;

    constructor(credentialsJson: string, movedUrl: string) {
        super(credentialsJson);
        this.movedUrl = movedUrl;
    }

    protected override LiveUrl(credentials: VertexAICredentials, location: string | null): string {
        this.LiveUrlCalls.push({ Project: credentials.project, Location: location });
        return this.movedUrl;
    }
}

/**
 * The real `GoogleAuth` over the key's own `JWT` client, holding a token already, so no call reaches Google. What it
 * returns for a URL is what `google-auth-library` would put on the upstream open.
 */
function cachedTokenAuth(options: GoogleAuthOptions): VertexGoogleAuth {
    (options.authClient as JWT).setCredentials({ access_token: ACCESS_TOKEN, expiry_date: Date.now() + 60 * 60 * 1000 });
    return new GoogleAuth(options);
}

/** `@google/genai`'s websocket factory, a type the SDK declares without exporting it. */
type SdkWebSocketFactory = ConstructorParameters<typeof Live>[2];

/** A Live socket `@google/genai` asked its websocket factory for: the URL it built, its headers and what it sent. */
interface SdkSocket {
    Url: string;
    Headers: Record<string, string>;
    Sent: string[];
}

/**
 * The driver over the real `@google/genai` client, with the SDK's websocket factory swapped for one that records each
 * socket and connects nothing, and the key's `JWT` holding a token already: a bridged session reaches no network, and
 * each recorded URL is the one the SDK built from the driver's options. With `movedUrl`, a subclass that moves `LiveUrl`.
 */
class SdkEnterprise extends GeminiEnterpriseRealtime {
    public readonly Sockets: SdkSocket[] = [];
    private readonly movedUrl: string | null;

    constructor(credentialsJson: string, movedUrl: string | null = null) {
        super(credentialsJson);
        this.movedUrl = movedUrl;
    }

    protected override LiveUrl(credentials: VertexAICredentials, location: string | null): string {
        return this.movedUrl ?? super.LiveUrl(credentials, location);
    }

    protected override CreateVertexClient(options: GoogleGenAIOptions): GeminiEnterpriseLiveClient {
        const authClient = options.googleAuthOptions?.authClient;
        if (authClient instanceof JWT) {
            authClient.setCredentials({ access_token: ACCESS_TOKEN, expiry_date: Date.now() + 60 * 60 * 1000 });
        }
        const client = new GoogleGenAI(options);
        // The factory is a private field of the SDK's Live module: if a release renames it, fail here rather than open a real socket.
        if (!('webSocketFactory' in client.live)) {
            throw new Error('@google/genai keeps its websocket factory somewhere else now; this test cannot record its sockets');
        }
        const recorder: SdkWebSocketFactory = {
            create: (url, headers, callbacks) => {
                const socket: SdkSocket = { Url: url, Headers: headers, Sent: [] };
                this.Sockets.push(socket);
                return {
                    connect: () => callbacks.onopen(),
                    send: (message: string) => {
                        socket.Sent.push(message);
                    },
                    close: () => undefined,
                };
            },
        };
        Object.defineProperty(client.live, 'webSocketFactory', { value: recorder });
        return client;
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────────

/** The ticket id in a minted session's relay URL path. */
function ticketOf(minted: ClientRealtimeSessionConfig): string {
    const match = /\/realtime\/relay\/([^/?#]+)$/.exec(minted.RelayUrl ?? '');
    if (!match) {
        throw new Error('the minted session has no relay URL');
    }
    return decodeURIComponent(match[1]);
}

/** Opens the session's fresh connection in the registry, as the relay does at the browser's first frame. */
function openFresh(minted: ClientRealtimeSessionConfig): RealtimeRelayGrant {
    const result = RealtimeProxyRegistry.Instance.OpenRelaySession(ticketOf(minted), { ResumeHandle: null, AudioOnly: false });
    if (!('Granted' in result)) {
        throw new Error(`relay session refused: ${result.Refused}`);
    }
    return result.Granted;
}

/** The setup the relay sends first on a connection. */
function openingSetup(grant: RealtimeRelayGrant, audioOnly = false): LiveClientSetup {
    const [frame] = grant.Policy.OpeningFrames({ ResumeHandle: null, AudioOnly: audioOnly });
    return (JSON.parse(frame) as { setup: LiveClientSetup }).setup;
}

async function mint(json = serviceAccountKey(), params = makeParams()): Promise<{ Driver: TestEnterprise; Minted: ClientRealtimeSessionConfig }> {
    const driver = new TestEnterprise(json);
    return { Driver: driver, Minted: await driver.CreateClientSession(params) };
}

/** The one socket the real SDK opened for a bridged session. */
async function sdkSocketOf(driver: SdkEnterprise): Promise<SdkSocket> {
    const session = await driver.StartSession(makeParams());
    await session.Close();
    expect(driver.Sockets).toHaveLength(1);
    return driver.Sockets[0];
}

// ── Tests ──────────────────────────────────────────────────────────────────────────────────────────────

describe('GeminiEnterpriseRealtime', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    /** The warnings so far that are about turn coverage. */
    const coverageLines = (): string[] => warn.mock.calls.map((call: unknown[]) => String(call[0])).filter((line: string) => line.includes('Turn coverage'));

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('registration and construction', () => {
        it('is registered as GeminiEnterpriseRealtime, beside GeminiRealtime', () => {
            const factory = MJGlobal.Instance.ClassFactory;
            expect(factory.GetRegistration(BaseRealtimeModel, 'GeminiEnterpriseRealtime')?.SubClass).toBe(GeminiEnterpriseRealtime);
            expect(factory.GetRegistration(BaseRealtimeModel, 'GeminiRealtime')?.SubClass).toBe(GeminiRealtime);
            const created = factory.CreateInstance<BaseRealtimeModel>(BaseRealtimeModel, 'GeminiEnterpriseRealtime', serviceAccountKey());
            expect(created).toBeInstanceOf(GeminiEnterpriseRealtime);
            expect(created?.SupportsClientDirect).toBe(true);
        });

        it('never throws on a key it cannot read, so the voice list still works', () => {
            for (const key of ['not json', 'null', JSON.stringify({ location: 'us' }), JSON.stringify({ project: 'p', serviceAccountJson: '{x' })]) {
                expect(() => new TestEnterprise(key)).not.toThrow();
                expect(new TestEnterprise(key).SupportedVoices.length).toBeGreaterThan(0);
            }
        });

        it('fails the session with a reason that quotes none of the key', async () => {
            const leaky = `{"project":"p1","private_key": ${PRIVATE_KEY_BODY}}`;
            const cases: Array<[string, RegExp]> = [
                [leaky, /its Vertex AI key is not valid JSON/],
                ['null', /its Vertex AI key is not a JSON object/],
                [JSON.stringify({ location: 'us' }), /its Vertex AI key names no "project" or "project_id"/],
                [JSON.stringify({ project: 'p', serviceAccountJson: `{"private_key": ${PRIVATE_KEY_BODY}` }), /has a serviceAccountJson that is not valid JSON/],
            ];
            // The JSON parser's own message quotes the text around the error, which here is the private key.
            expect(() => ParseVertexAICredentials(leaky)).toThrow(KEY_FRAGMENT);
            for (const [key, reason] of cases) {
                const minted = new TestEnterprise(key).CreateClientSession(makeParams());
                await expect(minted).rejects.toThrow(reason);
                await expect(minted).rejects.not.toThrow(KEY_FRAGMENT);
                const started = new TestEnterprise(key).StartSession(makeParams());
                await expect(started).rejects.toThrow(reason);
                await expect(started).rejects.not.toThrow(KEY_FRAGMENT);
            }
        });

        it('mints no Gemini Developer API token', async () => {
            await expect(new TestEnterprise(serviceAccountKey()).MintDeveloperToken()).rejects.toThrow('mints no Gemini Developer API tokens');
        });
    });

    describe('client-direct mint', () => {
        it('issues one relay session for the call, for this user and driver', async () => {
            const before = RealtimeProxyRegistry.Instance.RelaySessionCount;
            const { Minted } = await mint();
            expect(RealtimeProxyRegistry.Instance.RelaySessionCount).toBe(before + 1);
            const info = RealtimeProxyRegistry.Instance.FindRelaySession(ticketOf(Minted));
            expect(info?.DriverClass).toBe('GeminiEnterpriseRealtime');
            const grant = openFresh(Minted);
            expect(grant.UserID).toBe('user-1');
            expect(grant.Resumed).toBe(false);
        });

        it('returns a relay session for the gemini-enterprise client: the relay URL, with the ticket in the path, and no token', async () => {
            const { Minted } = await mint();
            expect(Minted.Provider).toBe('gemini-enterprise');
            expect(Minted.Model).toBe('gemini-3.8-live');
            expect(Minted.Transport).toBe('relay');
            expect(Minted.RelayUrl).toMatch(/^wss:\/\/mjapi\.example\.test\/realtime\/relay\/[0-9a-f-]{36}$/);
            expect(Minted.RelayUrl).not.toContain('?');
            expect(Minted.EphemeralToken).toBe('');
        });

        it('puts the ticket only in the relay URL: not in the pact, the avatar status or anything else the browser gets', async () => {
            const { Minted } = await mint(serviceAccountKey(), makeParams({ Avatar: { AvatarID: 'Ben', PersonaName: 'Ben' } }));
            const ticket = ticketOf(Minted);
            const { RelayUrl: _relayUrl, ...rest } = Minted;
            expect(JSON.stringify(rest)).not.toContain(ticket);
        });

        it('logs nothing that carries the relay URL or its ticket, also when the mint warns about the location', async () => {
            const spies = [warn, ...(['log', 'info', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined))];
            const minted = [(await mint()).Minted, (await mint(serviceAccountKey({ location: 'europe-west4' }))).Minted];
            const logged = spies.flatMap((spy) => spy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')));
            expect(logged.some((line) => line.includes('Location "europe-west4"'))).toBe(true); // the mint did log
            for (const session of minted) {
                expect(logged.filter((line) => line.includes(ticketOf(session)))).toEqual([]);
            }
        });

        it('expires with the relay session: 30 minutes, or the session cap when shorter', async () => {
            const start = Date.now();
            const { Minted } = await mint();
            const expires = new Date(Minted.ExpiresAt).getTime();
            expect(expires).toBeGreaterThanOrEqual(start + 30 * 60 * 1000);
            expect(expires).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
            const capped = await mint(serviceAccountKey(), makeParams({ MaxSessionSeconds: 120 }));
            expect(new Date(capped.Minted.ExpiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 120 * 1000);
        });

        it('connects upstream to the Live socket on the location\'s host, API version v1', async () => {
            const hosts: Array<[string, string]> = [
                ['us-central1', 'us-central1-aiplatform.googleapis.com'],
                ['us', 'aiplatform.us.rep.googleapis.com'],
                ['eu', 'aiplatform.eu.rep.googleapis.com'],
                ['global', 'aiplatform.googleapis.com'],
                ['europe-west4', 'europe-west4-aiplatform.googleapis.com'],
            ];
            for (const [location, host] of hosts) {
                const { Minted } = await mint(serviceAccountKey({ location }));
                expect(openFresh(Minted).UpstreamUrl).toBe(`wss://${host}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`);
            }
        });

        it('defaults the location to us-central1', async () => {
            const { Minted } = await mint(JSON.stringify({ project: PROJECT }));
            expect(openFresh(Minted).UpstreamUrl).toBe('wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent');
        });

        it('warns at the mint when Google does not document Gemini 3.8 Live in the location', async () => {
            for (const location of ['us', 'eu', 'us-central1']) {
                await mint(serviceAccountKey({ location }));
            }
            expect(warn.mock.calls.filter((call) => String(call[0]).includes('Location "'))).toEqual([]);
            await mint(serviceAccountKey({ location: 'europe-west4' }));
            const lines = warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('Location "europe-west4"'));
            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain('us, eu, us-central1');
        });

        it('refuses a location that is not a Google Cloud location, issuing nothing', async () => {
            const before = RealtimeProxyRegistry.Instance.RelaySessionCount;
            for (const location of ['evil.example.test/x', 'us central1', 'US', ' us', 'us-']) {
                const driver = new TestEnterprise(serviceAccountKey({ location }));
                await expect(driver.CreateClientSession(makeParams())).rejects.toThrow('is not a Google Cloud location');
            }
            expect(RealtimeProxyRegistry.Instance.RelaySessionCount).toBe(before);
        });

        it('mints no token at the mint; each upstream open gets one, from one GoogleAuth', async () => {
            const { Driver, Minted } = await mint();
            expect(Driver.AuthOptions).toEqual([]);
            expect(Driver.Auth.Urls).toEqual([]);
            const grant = openFresh(Minted);
            expect(await grant.Policy.UpstreamHeaders()).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
            expect(await grant.Policy.UpstreamHeaders()).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
            expect(Driver.Auth.Urls).toEqual([grant.UpstreamUrl, grant.UpstreamUrl]);
            expect(Driver.AuthOptions).toHaveLength(1);
            expect(Driver.AuthOptions[0].scopes).toEqual(['https://www.googleapis.com/auth/cloud-platform']);
        });

        it('mints tokens from each credential shape: an inline service account (JWT), the environment key\'s key file, Application Default Credentials', async () => {
            const shapes: Array<[string, string | null]> = [
                [serviceAccountKey(), SA_EMAIL],
                [environmentKey, FILE_EMAIL],
                [JSON.stringify({ project: PROJECT }), null],
            ];
            for (const [key, email] of shapes) {
                const { Driver, Minted } = await mint(key);
                await openFresh(Minted).Policy.UpstreamHeaders();
                if (email === null) {
                    expect(Driver.AuthOptions).toEqual([{ scopes: [SCOPE] }]);
                    continue;
                }
                expect(Driver.AuthOptions).toEqual([{ authClient: expect.any(JWT), scopes: [SCOPE] }]);
                const jwt = Driver.AuthOptions[0].authClient as JWT;
                expect(jwt.email).toBe(email);
                expect(jwt.scopes).toEqual([SCOPE]);
            }
        });

        it('refuses a run key that names a key file, at the mint and the start, quoting no path and issuing nothing', async () => {
            const before = RealtimeProxyRegistry.Instance.RelaySessionCount;
            // The same file the environment key names, and a missing one: neither is read.
            for (const path of [keyFilePath, join(keyDir, 'missing.json')]) {
                const driver = new TestEnterprise(JSON.stringify({ project: PROJECT, keyFilePath: path }));
                for (const attempt of [driver.CreateClientSession(makeParams()), driver.StartSession(makeParams())]) {
                    await expect(attempt).rejects.toThrow(KEY_FILE_PROBLEM);
                    await expect(attempt).rejects.not.toThrow(keyDir);
                }
                expect(driver.AuthOptions).toEqual([]);
                expect(driver.ClientOptions).toEqual([]);
            }
            expect(RealtimeProxyRegistry.Instance.RelaySessionCount).toBe(before);
        });

        it('puts no credential, token, private key, system prompt or tool in the pact or the URL', async () => {
            const { Minted } = await mint();
            await openFresh(Minted).Policy.UpstreamHeaders(); // a token now exists; it must not reach the browser either
            const browserSees = JSON.stringify(Minted);
            for (const secret of [PRIVATE_KEY_BODY, 'PRIVATE KEY', SA_EMAIL, KEY_ID, ACCESS_TOKEN, 'Bearer', 'uthorization', SYSTEM_PROMPT, 'pineapple', TOOL.Name, TOOL.Description, PROJECT]) {
                expect(browserSees, secret).not.toContain(secret);
            }
            expect(Minted.SessionConfig['config']).toEqual({ responseModalities: ['AUDIO'] });
        });

        it('carries the model\'s facts in the pact, as the Gemini pact does', async () => {
            const { Minted } = await mint();
            expect(Minted.SessionConfig).toMatchObject({ model: 'gemini-3.8-live', idleSignal: 'turnComplete', supportsInboundVideo: true });
            expect(Minted.SessionConfig['avatar']).toBeUndefined();
        });

        it('has the relay write the setup: the full resource name, the system prompt and the tools reach Google only there', async () => {
            const { Minted } = await mint();
            const setup = openingSetup(openFresh(Minted));
            expect(setup.model).toBe(`projects/${PROJECT}/locations/us-central1/publishers/google/models/gemini-3.8-live`);
            expect(setup.systemInstruction).toEqual({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
            expect(JSON.stringify(setup.tools)).toContain(TOOL.Name);
            expect(setup.generationConfig?.responseModalities).toEqual(['AUDIO']);
            expect(setup.sessionResumption).toEqual({});
        });

        it('a granted avatar: VIDEO and the avatar\'s name in the pact config, the avatar block, and the avatar in the setup', async () => {
            const { Minted } = await mint(serviceAccountKey(), makeParams({ Avatar: { AvatarID: 'Ben', PersonaName: 'Ben' } }));
            expect(Minted.SessionConfig['config']).toEqual({ responseModalities: ['VIDEO'], avatarConfig: { avatarName: 'Ben' } });
            expect(Minted.SessionConfig['avatar']).toEqual({ output: true, encoding: AVATAR_TYPE, audioMuxed: true });
            const grant = openFresh(Minted);
            const setup = openingSetup(grant);
            expect(setup.generationConfig?.responseModalities).toEqual(['VIDEO']);
            expect(setup.avatarConfig).toEqual({ avatarName: 'Ben', videoBitrateBps: 2_000_000 });
            // A host that shows no avatar asks for audio; the relay writes the same setup without video.
            const downgraded = openingSetup(grant, true);
            expect(downgraded.generationConfig?.responseModalities).toEqual(['AUDIO']);
            expect(downgraded.avatarConfig).toBeUndefined();
        });

        it("writes the bitrate MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS names into the relay's setup, and leaves the field out for 0", async () => {
            const key = 'MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS';
            const saved = process.env[key];
            try {
                process.env[key] = '1500000';
                const custom = await mint(serviceAccountKey(), makeParams({ Avatar: { AvatarID: 'Ben' } }));
                expect(openingSetup(openFresh(custom.Minted)).avatarConfig).toEqual({ avatarName: 'Ben', videoBitrateBps: 1_500_000 });
                process.env[key] = '0';
                const omitted = await mint(serviceAccountKey(), makeParams({ Avatar: { AvatarID: 'Ben' } }));
                const setup = openingSetup(openFresh(omitted.Minted));
                expect(setup.avatarConfig).toEqual({ avatarName: 'Ben' });
                expect(setup.generationConfig?.responseModalities).toEqual(['VIDEO']);
            } finally {
                if (saved === undefined) delete process.env[key];
                else process.env[key] = saved;
            }
        });

        it('renders the avatar for a model id MJ_GEMINI_LIVE_MODEL_ALIASES maps to gemini-3.8-live, and still sends Google that id', async () => {
            const key = 'MJ_GEMINI_LIVE_MODEL_ALIASES';
            const saved = process.env[key];
            const model = 'gemini-live-3.8-stand-in';
            try {
                const plain = await mint(serviceAccountKey(), makeParams({ Model: model, Avatar: { AvatarID: 'Ben' } }));
                expect(plain.Minted.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'endpoint' });
                process.env[key] = `${model}=gemini-3.8-live`;
                const { Driver, Minted } = await mint(serviceAccountKey(), makeParams({ Model: model, Avatar: { AvatarID: 'Ben' } }));
                expect(Minted.AvatarStatus).toEqual({ Requested: true, Granted: true });
                expect(Driver.SupportsAvatarOutput(model)).toBe(true);
                expect(Minted.SessionConfig['avatar']).toEqual({ output: true, encoding: AVATAR_TYPE, audioMuxed: true });
                const setup = openingSetup(openFresh(Minted));
                expect(setup.model).toBe(`projects/${PROJECT}/locations/us-central1/publishers/google/models/${model}`);
                expect(setup.avatarConfig?.avatarName).toBe('Ben');
            } finally {
                if (saved === undefined) delete process.env[key];
                else process.env[key] = saved;
            }
        });

        it('says whether the avatar shows: granted on 3.8 Live, and why not for a custom avatar or a model without avatars', async () => {
            const granted = await mint(serviceAccountKey(), makeParams({ Avatar: { AvatarID: 'Ben', PersonaName: 'Ben' } }));
            expect(granted.Minted.AvatarStatus).toEqual({ Requested: true, Granted: true });
            expect(granted.Driver.SupportsAvatarOutput('gemini-3.8-live')).toBe(true);

            const custom = await mint(serviceAccountKey(), makeParams({ Avatar: { AvatarID: 'Mine', Kind: 'custom' } }));
            expect(custom.Minted.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'custom-disabled' });

            const thinking = await mint(serviceAccountKey(), makeParams({ Model: 'gemini-3.8-live-extended-thinking', Avatar: { AvatarID: 'Ben' } }));
            expect(thinking.Minted.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'endpoint' });
            expect(thinking.Driver.SupportsAvatarOutput('gemini-3.8-live-extended-thinking')).toBe(false);
        });

        it('never asks Vertex AI for TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO, which it refuses at setup: every setup the relay can send has only activity', async () => {
            const params = makeParams({ Config: { proxyBaseUrl: MJAPI, turnDetection: { Coverage: 'audioActivityAndAllVideo' } }, Avatar: { AvatarID: 'Ben', PersonaName: 'Ben' } });
            const { Minted } = await mint(serviceAccountKey(), params);
            const grant = openFresh(Minted);
            const intents: RealtimeRelayOpenIntent[] = [
                { ResumeHandle: null, AudioOnly: false },
                { ResumeHandle: null, AudioOnly: true },
                { ResumeHandle: 'stand-in-handle', AudioOnly: false },
                { ResumeHandle: 'stand-in-handle', AudioOnly: true },
            ];
            for (const intent of intents) {
                const [frame] = grant.Policy.OpeningFrames(intent);
                expect(frame, JSON.stringify(intent)).not.toContain(ALL_VIDEO_COVERAGE);
                expect((JSON.parse(frame) as { setup: LiveClientSetup }).setup.realtimeInputConfig?.turnCoverage, JSON.stringify(intent)).toBe(ONLY_ACTIVITY_COVERAGE);
            }
            expect(JSON.stringify(Minted)).not.toContain(ALL_VIDEO_COVERAGE);
            expect(coverageLines()).toEqual([ENTERPRISE_COVERAGE_LINE]);
        });

        it('sends only activity, and says nothing about it, when the session asks for no coverage', async () => {
            const { Minted } = await mint();
            expect(openingSetup(openFresh(Minted)).realtimeInputConfig?.turnCoverage).toBe(ONLY_ACTIVITY_COVERAGE);
            expect(coverageLines()).toEqual([]);
        });

        it('returns no avatar status when the session asked for none, and never puts it in the pact', async () => {
            const { Minted } = await mint();
            expect('AvatarStatus' in Minted).toBe(false);
            const asked = await mint(serviceAccountKey(), makeParams({ Avatar: { AvatarID: 'Ben' } }));
            for (const key of ['AvatarStatus', 'Granted', 'Requested']) {
                expect(JSON.stringify(asked.Minted.SessionConfig), key).not.toContain(key);
            }
        });
    });

    describe('bridged sessions', () => {
        it('connects through @google/genai in Vertex mode with the key\'s JWT client and API version v1', async () => {
            const driver = new TestEnterprise(serviceAccountKey({ location: 'us' }));
            await driver.StartSession(makeParams());
            expect(driver.ClientOptions).toEqual([
                {
                    vertexai: true,
                    project: PROJECT,
                    location: 'us',
                    googleAuthOptions: { authClient: expect.any(JWT) },
                    httpOptions: { apiVersion: 'v1' },
                },
            ]);
            const jwt = driver.ClientOptions[0].googleAuthOptions?.authClient as JWT;
            expect(jwt.email).toBe(SA_EMAIL);
            expect(jwt.key).toBe(STAND_IN_KEY);
            expect(driver.AuthOptions).toEqual([]); // the SDK authenticates a bridged session itself
        });

        it('uses the environment key\'s key file, and Application Default Credentials when the key has no credentials', async () => {
            const fromFile = new TestEnterprise(environmentKey);
            await fromFile.StartSession(makeParams());
            expect((fromFile.ClientOptions[0].googleAuthOptions?.authClient as JWT).email).toBe(FILE_EMAIL);
            const adc = new TestEnterprise(JSON.stringify({ project: PROJECT }));
            await adc.StartSession(makeParams());
            expect(adc.ClientOptions).toEqual([{ vertexai: true, project: PROJECT, location: 'us-central1', httpOptions: { apiVersion: 'v1' } }]);
        });

        it('opens the Live session with the model, the full config (audio only) and the session callbacks', async () => {
            const driver = new TestEnterprise(serviceAccountKey());
            const session = await driver.StartSession(makeParams({ Avatar: { AvatarID: 'Ben' } }));
            expect(driver.Connects).toHaveLength(1);
            const connect = driver.Connects[0];
            expect(connect.model).toBe('gemini-3.8-live');
            expect(connect.config?.systemInstruction).toBe(SYSTEM_PROMPT);
            expect(connect.config?.responseModalities).toEqual(['AUDIO']);
            expect(connect.config?.avatarConfig).toBeUndefined();

            const calls: RealtimeToolCall[] = [];
            session.OnToolCall((call) => calls.push(call));
            connect.callbacks.onmessage(Object.assign(new LiveServerMessage(), { toolCall: { functionCalls: [{ id: 'c1', name: TOOL.Name, args: { number: '7' } }] } }));
            expect(calls).toEqual([{ CallID: 'c1', ToolName: TOOL.Name, Arguments: '{"number":"7"}' }]);
            await session.Close();
            expect(driver.Session.Closed).toBe(true);
        });

        it("renders the avatar for a meeting host that publishes it (Delivery 'room'): VIDEO and the avatar at 2 Mbps, granted on the session", async () => {
            const driver = new TestEnterprise(serviceAccountKey());
            const session = await driver.StartSession(makeParams({ Avatar: { AvatarID: 'Ben', Delivery: 'room' } }));
            const config = driver.Connects[0].config;
            expect(config?.responseModalities).toEqual(['VIDEO']);
            expect(config?.avatarConfig).toEqual({ avatarName: 'Ben', videoBitrateBps: 2_000_000 });
            expect(session.AvatarStatus).toEqual({ Requested: true, Granted: true });
            expect(typeof session.OnVideoFrame).toBe('function');
            const elsewhere = await driver.StartSession(makeParams({ Avatar: { AvatarID: 'Ben' } }));
            expect(elsewhere.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'bridged' });
        });

        it('never asks Vertex AI for TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO on a bridged session: audio, the room avatar, and a resumed connection', async () => {
            const driver = new TestEnterprise(serviceAccountKey());
            const asks = (avatar?: RealtimeSessionParams['Avatar']): RealtimeSessionParams =>
                makeParams({ Config: { proxyBaseUrl: MJAPI, turnDetection: { Coverage: 'audioActivityAndAllVideo' } }, Avatar: avatar });
            await driver.StartSession(asks());
            await driver.StartSession(asks({ AvatarID: 'Ben', Delivery: 'room' }));
            // Google ends the room session's connection; the session resumes on a new one with the same config.
            const room = driver.Connects[1].callbacks;
            room.onmessage(Object.assign(new LiveServerMessage(), { sessionResumptionUpdate: { newHandle: 'stand-in-handle', resumable: true } }));
            room.onmessage(Object.assign(new LiveServerMessage(), { goAway: { timeLeft: '60s' } }));
            await vi.waitFor(() => expect(driver.Connects).toHaveLength(3));
            expect(driver.Connects[2].config?.sessionResumption).toEqual({ handle: 'stand-in-handle' });
            for (const connect of driver.Connects) {
                expect(connect.config?.realtimeInputConfig?.turnCoverage).toBe(ONLY_ACTIVITY_COVERAGE);
                expect(JSON.stringify(connect.config)).not.toContain(ALL_VIDEO_COVERAGE);
            }
            expect(driver.Connects[1].config?.avatarConfig?.avatarName).toBe('Ben');
            expect(coverageLines()).toEqual([ENTERPRISE_COVERAGE_LINE, ENTERPRISE_COVERAGE_LINE]); // one per session
        });

        it('builds the bridged client again after a build that failed, and keeps one that worked', async () => {
            const driver = new TestEnterprise(serviceAccountKey());
            driver.FailNextClient = true;
            await expect(driver.StartSession(makeParams())).rejects.toThrow('stand-in client failure');
            await driver.StartSession(makeParams());
            await driver.StartSession(makeParams());
            expect(driver.ClientOptions).toHaveLength(2);
            expect(driver.Connects).toHaveLength(2);
        });

        it('warns about an undocumented location for bridged sessions too', async () => {
            await new TestEnterprise(serviceAccountKey({ location: 'asia-east1' })).StartSession(makeParams());
            expect(warn.mock.calls.some((call) => String(call[0]).includes('Location "asia-east1"'))).toBe(true);
        });
    });

    describe('the Live URL seam (LiveUrl)', () => {
        it("returns Google's Live socket by default: the relay opens it, and bridged sessions keep the SDK's own host", async () => {
            const cases: Array<[string, string | null, string]> = [
                [serviceAccountKey(), 'us-central1', 'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent'],
                [serviceAccountKey({ location: 'eu' }), 'eu', 'wss://aiplatform.eu.rep.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent'],
                [JSON.stringify({ apiKey: STAND_IN_API_KEY }), null, 'wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent'],
            ];
            for (const [key, location, url] of cases) {
                const driver = new TestEnterprise(key);
                expect(driver.LiveUrlOf(ParseVertexAICredentials(key), location)).toBe(url);
                expect(openFresh(await driver.CreateClientSession(makeParams())).UpstreamUrl).toBe(url);
                await driver.StartSession(makeParams());
                expect(driver.ClientOptions[0].httpOptions).toEqual({ apiVersion: 'v1' });
            }
        });

        it('moves the relay for a subclass that overrides it: the upstream opens there, with the same token request, setup and browser view', async () => {
            const driver = new MovedEnterprise(serviceAccountKey({ location: 'us' }), MOCK_LIVE_URL);
            const minted = await driver.CreateClientSession(makeParams());
            const grant = openFresh(minted);
            expect(grant.UpstreamUrl).toBe(MOCK_LIVE_URL);
            expect(driver.LiveUrlCalls).toEqual([{ Project: PROJECT, Location: 'us' }]);
            expect(await grant.Policy.UpstreamHeaders()).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
            expect(driver.Auth.Urls).toEqual([MOCK_LIVE_URL]); // as before, the token is asked for with the URL the relay opens
            expect(openingSetup(grant).model).toBe(`projects/${PROJECT}/locations/us/publishers/google/models/gemini-3.8-live`);
            expect(minted.RelayUrl).toMatch(/^wss:\/\/mjapi\.example\.test\/realtime\/relay\//);
            expect(JSON.stringify(minted)).not.toContain('127.0.0.1');
        });

        it("moves bridged sessions with it: the SDK's base URL is all of it before the socket path, its API version the one that path names, and the credential options stay as they were", async () => {
            const cases: Array<[string, string, string]> = [
                [MOCK_LIVE_URL, 'http://127.0.0.1:9000', 'v1'],
                ['wss://live-proxy.example.test:8443/vertex/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent', 'https://live-proxy.example.test:8443/vertex', 'v1'],
                ['wss://live-proxy.example.test:443/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent', 'https://live-proxy.example.test', 'v1'],
                ['wss://live-proxy.example.test/a/b/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent', 'https://live-proxy.example.test/a/b', 'v1beta1'],
            ];
            for (const [liveUrl, baseUrl, apiVersion] of cases) {
                const driver = new MovedEnterprise(serviceAccountKey(), liveUrl);
                await driver.StartSession(makeParams());
                expect(driver.ClientOptions).toEqual([
                    { vertexai: true, project: PROJECT, location: 'us-central1', googleAuthOptions: { authClient: expect.any(JWT) }, httpOptions: { apiVersion, baseUrl } },
                ]);
                expect(driver.LiveUrlCalls).toEqual([{ Project: PROJECT, Location: 'us-central1' }]);
            }
            const keyed = new MovedEnterprise(JSON.stringify({ apiKey: STAND_IN_API_KEY }), MOCK_LIVE_URL);
            await keyed.StartSession(makeParams());
            expect(keyed.ClientOptions).toEqual([{ vertexai: true, apiKey: STAND_IN_API_KEY, httpOptions: { apiVersion: 'v1', baseUrl: 'http://127.0.0.1:9000' } }]);
            expect(keyed.LiveUrlCalls).toEqual([{ Project: '', Location: null }]);
        });

        it("leaves the bearer token as it was: the key's scoped JWT client never makes the URL its audience", async () => {
            class CachedTokenDefault extends TestEnterprise {
                protected override CreateGoogleAuth(options: GoogleAuthOptions): VertexGoogleAuth {
                    return cachedTokenAuth(options);
                }
            }
            class CachedTokenMoved extends MovedEnterprise {
                protected override CreateGoogleAuth(options: GoogleAuthOptions): VertexGoogleAuth {
                    return cachedTokenAuth(options);
                }
            }
            const headersOf = async (driver: TestEnterprise): Promise<Record<string, string>> =>
                openFresh(await driver.CreateClientSession(makeParams())).Policy.UpstreamHeaders();
            const google = await headersOf(new CachedTokenDefault(serviceAccountKey()));
            const moved = await headersOf(new CachedTokenMoved(serviceAccountKey(), MOCK_LIVE_URL));
            expect(google).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
            expect(moved).toEqual(google);
        });

        it('fails a bridged session whose LiveUrl is not a URL, quoting none of it', async () => {
            const started = new MovedEnterprise(serviceAccountKey(), 'not a url?key=leak').StartSession(makeParams());
            await expect(started).rejects.toThrow('GeminiEnterpriseRealtime: its Live URL (LiveUrl) is not a URL.');
            await expect(started).rejects.not.toThrow('leak');
        });

        it("opens a moved LiveUrl through @google/genai as given: its path prefix and its API version reach the SDK's socket URL", async () => {
            const cases: Array<[string, string]> = [
                // A path prefix.
                [
                    'wss://live-proxy.example.test:8443/vertex-live/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent',
                    'wss://live-proxy.example.test:8443/vertex-live/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent',
                ],
                // Another API version than the key's (v1).
                [
                    'wss://live-proxy.example.test:8443/vertex-live/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent',
                    'wss://live-proxy.example.test:8443/vertex-live/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent',
                ],
                // Another API version and no prefix: the SDK writes its own slash before ws/, as on Google's hosts.
                [
                    'ws://127.0.0.1:9000/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent',
                    'ws://127.0.0.1:9000//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent',
                ],
            ];
            for (const [liveUrl, socketUrl] of cases) {
                const socket = await sdkSocketOf(new SdkEnterprise(serviceAccountKey(), liveUrl));
                expect(socket.Url, liveUrl).toBe(socketUrl);
                // The SDK added the token itself: with a project and location it never takes its proxy branch, which sends no credential.
                expect(socket.Headers['authorization'], liveUrl).toBe(`Bearer ${ACCESS_TOKEN}`);
            }
        });

        it("leaves the SDK's socket URL as it was for a driver no subclass moved: the route's Google host and the key's API version", async () => {
            // The SDK reads a base URL from GOOGLE_VERTEX_BASE_URL when the driver passes none.
            const saved = process.env['GOOGLE_VERTEX_BASE_URL'];
            delete process.env['GOOGLE_VERTEX_BASE_URL'];
            try {
                const cases: Array<[string, string]> = [
                    [serviceAccountKey(), 'wss://us-central1-aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent'],
                    [serviceAccountKey({ liveApiVersion: 'v1beta1' }), 'wss://us-central1-aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent'],
                    [JSON.stringify({ apiKey: STAND_IN_API_KEY }), 'wss://aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent'],
                    [JSON.stringify({ apiKey: STAND_IN_API_KEY, project: PROJECT, location: 'us' }), 'wss://aiplatform.us.rep.googleapis.com//ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent'],
                ];
                for (const [key, socketUrl] of cases) {
                    expect((await sdkSocketOf(new SdkEnterprise(key))).Url, key).toBe(socketUrl);
                }
            } finally {
                if (saved !== undefined) process.env['GOOGLE_VERTEX_BASE_URL'] = saved;
            }
        });

        it('fails a bridged session whose moved LiveUrl @google/genai cannot open as given, quoting none of it', async () => {
            const socketPath = '/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';
            const unopenable = [
                'wss://live-proxy.example.test/leak/live', // no socket path at its end
                `wss://live-proxy.example.test${socketPath}?key=leak`, // a query
                `wss://live-proxy.example.test${socketPath}#leak`, // a fragment
                `wss://proxy-user:leak@live-proxy.example.test${socketPath}`, // a user and password
                `ftp://leak.example.test${socketPath}`, // a scheme the SDK cannot open
            ];
            for (const liveUrl of unopenable) {
                const driver = new MovedEnterprise(serviceAccountKey(), liveUrl);
                const started = driver.StartSession(makeParams());
                await expect(started, liveUrl).rejects.toThrow('GeminiEnterpriseRealtime: a bridged session cannot open its Live URL (LiveUrl) as given');
                await expect(started, liveUrl).rejects.not.toThrow('leak');
                expect(driver.ClientOptions, liveUrl).toEqual([]);
            }
        });
    });
});
