import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import type { GoogleAuthOptions } from 'google-auth-library';
import type { Content, FunctionResponse, GoogleGenAIOptions, LiveClientSetup, LiveConnectParameters, Blob as GeminiBlob } from '@google/genai';
import { RealtimeProxyRegistry, type ClientRealtimeSessionConfig, type RealtimeRelayGrant, type RealtimeSessionParams } from '@memberjunction/ai';
import type { GeminiLiveSession } from '@memberjunction/ai-gemini';
import { GeminiEnterpriseRealtime, type GeminiEnterpriseLiveClient } from '../models/geminiEnterpriseRealtime';
import type { VertexGoogleAuth } from '../vertexAccessToken';

// The Live socket's host and API version from the key (`liveHost`, `liveApiVersion`). A file of its own: the platform
// caches environment keys for the life of the process, and here the environment key names a Live host.

const PROJECT = 'stand-in-project';
const LIVE_HOST = 'live-gateway.example.test:8443';
const STAND_IN_KEY = '-----BEGIN PRIVATE KEY-----\nMIIstandinPrivateKeyMaterialNotARealKey\n-----END PRIVATE KEY-----\n';
const ACCESS_TOKEN = 'ya29.stand-in-access-token';
const HOST_NOT_ALLOWED = /its Vertex AI key names a liveHost, which only the environment key \(AI_VENDOR_API_KEY__GeminiEnterpriseRealtime\) may do/;

/** `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime`: an inline service account, with the Live host and version it names. */
const environmentKey = JSON.stringify({
    type: 'service_account',
    project_id: PROJECT,
    private_key: STAND_IN_KEY,
    client_email: 'relay-sa@stand-in-project.iam.gserviceaccount.com',
    location: 'us-central1',
    liveHost: `wss://${LIVE_HOST}`,
    liveApiVersion: 'v1beta1',
});

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
        return new Headers({ Authorization: `Bearer ${ACCESS_TOKEN}` });
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

    protected override CreateGoogleAuth(options: GoogleAuthOptions): VertexGoogleAuth {
        this.AuthOptions.push(options);
        return this.Auth;
    }

    protected override CreateVertexClient(options: GoogleGenAIOptions): GeminiEnterpriseLiveClient {
        this.ClientOptions.push(options);
        return { live: { connect: async (_params: LiveConnectParameters): Promise<GeminiLiveSession> => new FakeLiveSession() } };
    }
}

function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return { Model: 'gemini-3.8-live', SystemPrompt: 'You are the stand-in agent.', Config: { proxyBaseUrl: 'https://mjapi.example.test' }, UserID: 'user-1', ...overrides };
}

function openFresh(minted: ClientRealtimeSessionConfig): RealtimeRelayGrant {
    const ticket = decodeURIComponent(/\/realtime\/relay\/([^/?#]+)$/.exec(minted.RelayUrl ?? '')?.[1] ?? '');
    const result = RealtimeProxyRegistry.Instance.OpenRelaySession(ticket, { ResumeHandle: null, AudioOnly: false });
    if (!('Granted' in result)) {
        throw new Error(`relay session refused: ${result.Refused}`);
    }
    return result.Granted;
}

function openingSetup(grant: RealtimeRelayGrant): LiveClientSetup {
    return (JSON.parse(grant.Policy.OpeningFrames({ ResumeHandle: null, AudioOnly: false })[0]) as { setup: LiveClientSetup }).setup;
}

describe("GeminiEnterpriseRealtime: the Live socket's host and API version from the key", () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("opens the relay's upstream on the environment key's liveHost, with its liveApiVersion", async () => {
        const minted = await new TestEnterprise(environmentKey).CreateClientSession(makeParams());
        expect(openFresh(minted).UpstreamUrl).toBe(`wss://${LIVE_HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`);
    });

    it('mints the bearer token for that socket, and keeps the model path on the key\'s project and location', async () => {
        const driver = new TestEnterprise(environmentKey);
        const grant = openFresh(await driver.CreateClientSession(makeParams()));
        expect(await grant.Policy.UpstreamHeaders()).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
        expect(driver.Auth.Urls).toEqual([grant.UpstreamUrl]);
        expect(openingSetup(grant).model).toBe(`projects/${PROJECT}/locations/us-central1/publishers/google/models/gemini-3.8-live`);
    });

    it('connects server-side (bridged) sessions to the same host and version: the SDK base URL https://<liveHost>', async () => {
        const driver = new TestEnterprise(environmentKey);
        await driver.StartSession(makeParams());
        expect(driver.ClientOptions).toHaveLength(1);
        expect(driver.ClientOptions[0].httpOptions).toEqual({ apiVersion: 'v1beta1', baseUrl: `https://${LIVE_HOST}` });
        expect(driver.ClientOptions[0].location).toBe('us-central1');
    });

    it("takes a liveApiVersion from any key, on the location's host", async () => {
        const runKey = JSON.stringify({ project: PROJECT, location: 'us', liveApiVersion: 'v1beta1' });
        const driver = new TestEnterprise(runKey);
        const minted = await driver.CreateClientSession(makeParams());
        expect(openFresh(minted).UpstreamUrl).toBe('wss://aiplatform.us.rep.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent');
        await driver.StartSession(makeParams());
        expect(driver.ClientOptions[0].httpOptions).toEqual({ apiVersion: 'v1beta1' });
    });

    it('refuses a liveHost in any other key, at the mint and the start, quoting no host and issuing nothing', async () => {
        const before = RealtimeProxyRegistry.Instance.RelaySessionCount;
        const runKey = JSON.stringify({ project: PROJECT, liveHost: 'collector.attacker.example' });
        const driver = new TestEnterprise(runKey);
        for (const attempt of [driver.CreateClientSession(makeParams()), driver.StartSession(makeParams())]) {
            await expect(attempt).rejects.toThrow(HOST_NOT_ALLOWED);
            await expect(attempt).rejects.not.toThrow('attacker');
        }
        expect(driver.AuthOptions).toEqual([]);
        expect(driver.ClientOptions).toEqual([]);
        expect(RealtimeProxyRegistry.Instance.RelaySessionCount).toBe(before);
    });

    it('fails the session for a liveHost or liveApiVersion that is not one, quoting none of it', async () => {
        const cases: Array<[string, RegExp]> = [
            [JSON.stringify({ project: PROJECT, liveHost: 'http://plain.example.test' }), /its Vertex AI key has a liveHost that is not a host name/],
            [JSON.stringify({ project: PROJECT, liveHost: 'wss://gw.example.test/path?key=leak' }), /its Vertex AI key has a liveHost that is not a host name/],
            [JSON.stringify({ project: PROJECT, liveApiVersion: 'v1/../leak' }), /its Vertex AI key has a liveApiVersion that is not an API version/],
        ];
        for (const [key, reason] of cases) {
            const minted = new TestEnterprise(key).CreateClientSession(makeParams());
            await expect(minted).rejects.toThrow(reason);
            await expect(minted).rejects.not.toThrow('leak');
            await expect(minted).rejects.not.toThrow('example.test');
        }
    });
});
