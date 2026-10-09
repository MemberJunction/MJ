import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JWT, type GoogleAuthOptions } from 'google-auth-library';
import { LiveServerMessage, type Content, type FunctionResponse, type GoogleGenAIOptions, type LiveClientSetup, type LiveConnectParameters, type Blob as GeminiBlob } from '@google/genai';
import {
    BaseRealtimeModel,
    RealtimeProxyRegistry,
    type ClientRealtimeSessionConfig,
    type RealtimeRelayGrant,
    type RealtimeSessionParams,
    type RealtimeToolCall,
} from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { GeminiRealtime, type GeminiLiveSession } from '@memberjunction/ai-gemini';
import { GeminiEnterpriseRealtime, type GeminiEnterpriseLiveClient } from '../models/geminiEnterpriseRealtime';
import type { VertexGoogleAuth } from '../vertexAccessToken';
import { ParseVertexAICredentials } from '../vertexCredentials';

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
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────────

/** The ticket id in a relay URL's path. */
function ticketOf(relayUrl: string): string {
    const match = /\/realtime\/relay\/([^/?#]+)$/.exec(relayUrl);
    if (!match) {
        throw new Error(`not a relay URL: ${relayUrl}`);
    }
    return decodeURIComponent(match[1]);
}

/** Opens the session's fresh connection in the registry, as the relay does at the browser's first frame. */
function openFresh(minted: ClientRealtimeSessionConfig): RealtimeRelayGrant {
    const result = RealtimeProxyRegistry.Instance.OpenRelaySession(ticketOf(minted.EphemeralToken), { ResumeHandle: null, AudioOnly: false });
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

// ── Tests ──────────────────────────────────────────────────────────────────────────────────────────────

describe('GeminiEnterpriseRealtime', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

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
            const info = RealtimeProxyRegistry.Instance.FindRelaySession(ticketOf(Minted.EphemeralToken));
            expect(info?.DriverClass).toBe('GeminiEnterpriseRealtime');
            const grant = openFresh(Minted);
            expect(grant.UserID).toBe('user-1');
            expect(grant.Resumed).toBe(false);
        });

        it('returns the relay URL, with the ticket in the path, as the token, for the gemini-enterprise client', async () => {
            const { Minted } = await mint();
            expect(Minted.Provider).toBe('gemini-enterprise');
            expect(Minted.Model).toBe('gemini-3.8-live');
            expect(Minted.EphemeralToken).toMatch(/^wss:\/\/mjapi\.example\.test\/realtime\/relay\/[0-9a-f-]{36}$/);
            expect(Minted.EphemeralToken).not.toContain('?');
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
            expect(typeof session.OnAvatarOutput).toBe('function');
            const elsewhere = await driver.StartSession(makeParams({ Avatar: { AvatarID: 'Ben' } }));
            expect(elsewhere.AvatarStatus).toEqual({ Requested: true, Granted: false, Reason: 'bridged' });
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
});
