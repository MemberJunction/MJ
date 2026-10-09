import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import type { GoogleAuthOptions } from 'google-auth-library';
import type { Content, FunctionResponse, GoogleGenAIOptions, LiveClientSetup, LiveConnectParameters, Blob as GeminiBlob } from '@google/genai';
import { RealtimeProxyRegistry, type ClientRealtimeSessionConfig, type RealtimeRelayGrant, type RealtimeSessionParams } from '@memberjunction/ai';
import type { GeminiLiveSession } from '@memberjunction/ai-gemini';
import { GeminiEnterpriseRealtime, type GeminiEnterpriseLiveClient } from '../models/geminiEnterpriseRealtime';
import type { VertexGoogleAuth } from '../vertexAccessToken';

// A Google Cloud API key as the Vertex AI credential (`apiKey`). A file of its own: the platform caches environment keys
// for the life of the process, and here the environment key is an API key that names a Live host.

/** Stand-in keys in the shape Google issues (AIza…, 39 characters): never real ones. */
const RUN_API_KEY = 'AIzaStandInRunKeyNotReal0123456789abcde';
const ENV_API_KEY = 'AIzaStandInEnvKeyNotReal0123456789abcde';
const LIVE_HOST = 'live-gateway.example.test:8443';
const PROJECT = 'stand-in-project';
const GLOBAL_LIVE_URL = 'wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';
const STAND_IN_KEY = '-----BEGIN PRIVATE KEY-----\nMIIstandinPrivateKeyMaterialNotARealKey\n-----END PRIVATE KEY-----\n';

/** `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime`: an API key, with the Live host only the environment key may name. */
const environmentKey = JSON.stringify({ apiKey: ENV_API_KEY, liveHost: `wss://${LIVE_HOST}` });

/** A run's key: an API key alone. */
const runKey = JSON.stringify({ apiKey: RUN_API_KEY });

beforeAll(() => {
    vi.stubEnv('AI_VENDOR_API_KEY__GeminiEnterpriseRealtime', environmentKey);
});

afterAll(() => {
    vi.unstubAllEnvs();
});

class FakeGoogleAuth implements VertexGoogleAuth {
    public readonly Urls: Array<string | URL | undefined> = [];
    public async getRequestHeaders(url?: string | URL): Promise<Headers> {
        this.Urls.push(url);
        return new Headers({ Authorization: 'Bearer ya29.stand-in-access-token' });
    }
}

class FakeLiveSession implements GeminiLiveSession {
    public sendRealtimeInput(_params: { audio?: GeminiBlob; text?: string }): void {}
    public sendClientContent(_params: { turns?: Content[]; turnComplete?: boolean }): void {}
    public sendToolResponse(_params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {}
    public close(): void {}
}

/** The driver over a fake `GoogleAuth` and a fake Vertex client. */
class TestEnterprise extends GeminiEnterpriseRealtime {
    public readonly Auth = new FakeGoogleAuth();
    public readonly AuthOptions: GoogleAuthOptions[] = [];
    public readonly ClientOptions: GoogleGenAIOptions[] = [];
    public readonly Connects: LiveConnectParameters[] = [];

    protected override CreateGoogleAuth(options: GoogleAuthOptions): VertexGoogleAuth {
        this.AuthOptions.push(options);
        return this.Auth;
    }

    protected override CreateVertexClient(options: GoogleGenAIOptions): GeminiEnterpriseLiveClient {
        this.ClientOptions.push(options);
        return {
            live: {
                connect: async (params: LiveConnectParameters): Promise<GeminiLiveSession> => {
                    this.Connects.push(params);
                    return new FakeLiveSession();
                },
            },
        };
    }
}

function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return { Model: 'gemini-3.8-live', SystemPrompt: 'You are the stand-in agent.', Config: { proxyBaseUrl: 'https://mjapi.example.test' }, UserID: 'user-1', ...overrides };
}

function openFresh(minted: ClientRealtimeSessionConfig): RealtimeRelayGrant {
    const ticket = decodeURIComponent(/\/realtime\/relay\/([^/?#]+)$/.exec(minted.EphemeralToken)?.[1] ?? '');
    const result = RealtimeProxyRegistry.Instance.OpenRelaySession(ticket, { ResumeHandle: null, AudioOnly: false });
    if (!('Granted' in result)) {
        throw new Error(`relay session refused: ${result.Refused}`);
    }
    return result.Granted;
}

function openingSetup(grant: RealtimeRelayGrant): LiveClientSetup {
    return (JSON.parse(grant.Policy.OpeningFrames({ ResumeHandle: null, AudioOnly: false })[0]) as { setup: LiveClientSetup }).setup;
}

async function mint(json: string, params = makeParams()): Promise<{ Driver: TestEnterprise; Minted: ClientRealtimeSessionConfig }> {
    const driver = new TestEnterprise(json);
    return { Driver: driver, Minted: await driver.CreateClientSession(params) };
}

describe('GeminiEnterpriseRealtime with a Google Cloud API key (apiKey)', () => {
    let logged: string[];

    beforeEach(() => {
        logged = [];
        const capture = (...args: unknown[]): void => {
            logged.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack ?? ''}` : String(arg))).join(' '));
        };
        for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
            vi.spyOn(console, method).mockImplementation(capture);
        }
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("opens the relay's upstream on Google's global host with the model's short name, as @google/genai does with a key", async () => {
        const { Minted } = await mint(runKey, makeParams({ Avatar: { AvatarID: 'Ben' } }));
        const grant = openFresh(Minted);
        expect(grant.UpstreamUrl).toBe(GLOBAL_LIVE_URL);
        const setup = openingSetup(grant);
        expect(setup.model).toBe('publishers/google/models/gemini-3.8-live');
        expect(setup.avatarConfig).toEqual({ avatarName: 'Ben', videoBitrateBps: 2_000_000 });
        expect(Minted.AvatarStatus).toEqual({ Requested: true, Granted: true });
        expect(logged.filter((line) => line.includes('Location "'))).toEqual([]); // a key names no location to warn about
        expect(logged.filter((line) => line.includes('API key is empty'))).toEqual([]); // the base class's warning for an empty value
    });

    it('sends the key as x-goog-api-key on every upstream open, and never builds a GoogleAuth or mints a token', async () => {
        const { Driver, Minted } = await mint(runKey);
        const grant = openFresh(Minted);
        expect(await grant.Policy.UpstreamHeaders()).toEqual({ 'x-goog-api-key': RUN_API_KEY });
        expect(await grant.Policy.UpstreamHeaders()).toEqual({ 'x-goog-api-key': RUN_API_KEY });
        expect(Driver.AuthOptions).toEqual([]);
        expect(Driver.Auth.Urls).toEqual([]);
    });

    it('keeps the key out of what the browser gets, the pact, the relay URL and the logs', async () => {
        const { Driver, Minted } = await mint(runKey, makeParams({ Avatar: { AvatarID: 'Ben' } }));
        const grant = openFresh(Minted);
        await grant.Policy.UpstreamHeaders();
        await Driver.StartSession(makeParams());
        for (const bad of [JSON.stringify({ apiKey: RUN_API_KEY, location: 'us-central1' }), JSON.stringify({ apiKey: RUN_API_KEY, keyFilePath: '/srv/sa.json' })]) {
            await new TestEnterprise(bad).CreateClientSession(makeParams()).catch((error: unknown) => console.error(error));
        }
        expect(JSON.stringify(Minted)).not.toContain(RUN_API_KEY);
        expect(JSON.stringify(Minted.SessionConfig)).not.toContain(RUN_API_KEY);
        expect(Minted.EphemeralToken).not.toContain(RUN_API_KEY);
        expect(grant.UpstreamUrl).not.toContain(RUN_API_KEY);
        expect(logged.length).toBeGreaterThan(0);
        expect(logged.filter((line) => line.includes(RUN_API_KEY) || line.includes('AIzaStandIn'))).toEqual([]);
    });

    it("opens bridged sessions in the SDK's API-key mode: the key, no project or location, API version v1", async () => {
        const driver = new TestEnterprise(runKey);
        await driver.StartSession(makeParams());
        expect(driver.ClientOptions).toEqual([{ vertexai: true, apiKey: RUN_API_KEY, httpOptions: { apiVersion: 'v1' } }]);
        expect(driver.Connects[0]?.model).toBe('gemini-3.8-live');
        expect(driver.AuthOptions).toEqual([]);
    });

    it("takes the regional route for a key with a project: the location's host, the full model name, the key in the header", async () => {
        const routes: Array<[string | undefined, string, string]> = [
            [undefined, 'us-central1', 'us-central1-aiplatform.googleapis.com'],
            ['us', 'us', 'aiplatform.us.rep.googleapis.com'],
            ['eu', 'eu', 'aiplatform.eu.rep.googleapis.com'],
        ];
        for (const [given, location, host] of routes) {
            const key = JSON.stringify({ apiKey: RUN_API_KEY, project: PROJECT, ...(given ? { location: given } : {}) });
            const { Driver, Minted } = await mint(key, makeParams({ Avatar: { AvatarID: 'Ben' } }));
            const grant = openFresh(Minted);
            expect(grant.UpstreamUrl).toBe(`wss://${host}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`);
            expect(openingSetup(grant).model).toBe(`projects/${PROJECT}/locations/${location}/publishers/google/models/gemini-3.8-live`);
            expect(await grant.Policy.UpstreamHeaders()).toEqual({ 'x-goog-api-key': RUN_API_KEY });
            expect(Driver.AuthOptions).toEqual([]);
            expect(Minted.AvatarStatus).toEqual({ Requested: true, Granted: true });
            expect(JSON.stringify(Minted)).not.toContain(RUN_API_KEY);
        }
    });

    it("opens bridged sessions on the regional route: the SDK gets the key, the location's host and the full model name", async () => {
        const driver = new TestEnterprise(JSON.stringify({ apiKey: RUN_API_KEY, project: PROJECT, location: 'us' }));
        await driver.StartSession(makeParams());
        expect(driver.ClientOptions).toEqual([{ vertexai: true, apiKey: RUN_API_KEY, httpOptions: { apiVersion: 'v1', baseUrl: 'https://aiplatform.us.rep.googleapis.com' } }]);
        expect(driver.Connects[0]?.model).toBe(`projects/${PROJECT}/locations/us/publishers/google/models/gemini-3.8-live`);
        expect(driver.AuthOptions).toEqual([]);
    });

    it("checks the regional route's location as for any key: a bad one fails, one Google does not document warns", async () => {
        const bad = new TestEnterprise(JSON.stringify({ apiKey: RUN_API_KEY, project: PROJECT, location: 'evil.example/x' }));
        await expect(bad.CreateClientSession(makeParams())).rejects.toThrow('is not a Google Cloud location');
        await expect(bad.StartSession(makeParams())).rejects.toThrow('is not a Google Cloud location');
        await mint(JSON.stringify({ apiKey: RUN_API_KEY, project: PROJECT, location: 'europe-west4' }));
        expect(logged.filter((line) => line.includes('Location "europe-west4"'))).toHaveLength(1);
    });

    it("takes the key's liveApiVersion on both paths", async () => {
        const driver = new TestEnterprise(JSON.stringify({ apiKey: RUN_API_KEY, liveApiVersion: 'v1beta1' }));
        const grant = openFresh(await driver.CreateClientSession(makeParams()));
        expect(grant.UpstreamUrl).toBe('wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent');
        await driver.StartSession(makeParams());
        expect(driver.ClientOptions[0].httpOptions).toEqual({ apiVersion: 'v1beta1' });
    });

    it("takes the environment key's liveHost on both paths, with the key in the header", async () => {
        const driver = new TestEnterprise(environmentKey);
        const grant = openFresh(await driver.CreateClientSession(makeParams()));
        expect(grant.UpstreamUrl).toBe(`wss://${LIVE_HOST}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`);
        expect(await grant.Policy.UpstreamHeaders()).toEqual({ 'x-goog-api-key': ENV_API_KEY });
        expect(openingSetup(grant).model).toBe('publishers/google/models/gemini-3.8-live');
        await driver.StartSession(makeParams());
        expect(driver.ClientOptions[0]).toEqual({ vertexai: true, apiKey: ENV_API_KEY, httpOptions: { apiVersion: 'v1', baseUrl: `https://${LIVE_HOST}` } });
    });

    it('refuses a liveHost beside an API key in any other key, issuing nothing', async () => {
        const before = RealtimeProxyRegistry.Instance.RelaySessionCount;
        const driver = new TestEnterprise(JSON.stringify({ apiKey: RUN_API_KEY, liveHost: 'collector.attacker.example' }));
        for (const attempt of [driver.CreateClientSession(makeParams()), driver.StartSession(makeParams())]) {
            await expect(attempt).rejects.toThrow(/names a liveHost, which only the environment key/);
        }
        expect(driver.ClientOptions).toEqual([]);
        expect(RealtimeProxyRegistry.Instance.RelaySessionCount).toBe(before);
    });

    it('fails the session for an apiKey beside another credential, a location without a project, or one that is not a key, quoting none of it', async () => {
        const cases: Array<[string, RegExp]> = [
            [JSON.stringify({ apiKey: RUN_API_KEY, keyFilePath: '/srv/secret-place/sa.json' }), /names an apiKey beside another credential/],
            [JSON.stringify({ apiKey: RUN_API_KEY, type: 'service_account', private_key: STAND_IN_KEY, client_email: 'sa@x.iam.gserviceaccount.com' }), /names an apiKey beside another credential/],
            [JSON.stringify({ apiKey: RUN_API_KEY, location: 'us-central1' }), /names no "project" or "project_id"/],
            [JSON.stringify({ apiKey: `${RUN_API_KEY} trailing-words` }), /has an apiKey that is not an API key/],
        ];
        for (const [key, reason] of cases) {
            for (const attempt of [new TestEnterprise(key).CreateClientSession(makeParams()), new TestEnterprise(key).StartSession(makeParams())]) {
                await expect(attempt).rejects.toThrow(reason);
                await expect(attempt).rejects.not.toThrow(RUN_API_KEY);
                await expect(attempt).rejects.not.toThrow('secret-place');
                await expect(attempt).rejects.not.toThrow('trailing-words');
            }
        }
    });
});
