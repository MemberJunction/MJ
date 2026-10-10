import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JWT, type GoogleAuthOptions } from 'google-auth-library';
import { VertexAccessTokenProvider, type VertexGoogleAuth } from '../vertexAccessToken';
import { VERTEX_AI_OAUTH_SCOPE } from '../vertexAuthClient';
import { ParseVertexAICredentials, VertexCredentialsError, type VertexKeySource } from '../vertexCredentials';

const STAND_IN_KEY = '-----BEGIN PRIVATE KEY-----\nstand-in\n-----END PRIVATE KEY-----\n';
const FILE_EMAIL = 'file-sa@file-project.iam.gserviceaccount.com';

/** A fake `GoogleAuth`: counts calls and returns the headers it is given. */
class FakeGoogleAuth implements VertexGoogleAuth {
    public readonly Urls: Array<string | URL | undefined> = [];
    constructor(private readonly headers: Record<string, string> | Error = { Authorization: 'Bearer stand-in-token' }) {}
    public async getRequestHeaders(url?: string | URL): Promise<Headers> {
        this.Urls.push(url);
        if (this.headers instanceof Error) {
            throw this.headers;
        }
        return new Headers(this.headers);
    }
}

/** A provider over a fake `GoogleAuth`, recording the options each creation got. */
function providerFor(json: string, source: VertexKeySource = 'other', auth = new FakeGoogleAuth()) {
    const created: GoogleAuthOptions[] = [];
    const provider = new VertexAccessTokenProvider(ParseVertexAICredentials(json), source, (options) => {
        created.push(options);
        return auth;
    });
    return { provider, created, auth };
}

const URL_ = 'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';

let dir: string;
let serviceAccountPath: string;

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mj-vertex-token-'));
    serviceAccountPath = join(dir, 'service-account.json');
    writeFileSync(serviceAccountPath, JSON.stringify({ type: 'service_account', project_id: 'file-project', private_key: STAND_IN_KEY, client_email: FILE_EMAIL }));
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('VertexAccessTokenProvider', () => {
    it('creates no GoogleAuth until headers are asked for', () => {
        const { created } = providerFor(JSON.stringify({ project: 'p1' }));
        expect(created).toEqual([]);
    });

    it('returns the bearer header, lower-cased, for the URL it is given', async () => {
        const { provider, auth } = providerFor(JSON.stringify({ project: 'p1' }));
        expect(await provider.GetRequestHeaders(URL_)).toEqual({ authorization: 'Bearer stand-in-token' });
        expect(auth.Urls).toEqual([URL_]);
    });

    it('keeps one GoogleAuth across calls, so the library caches the token', async () => {
        const { provider, created, auth } = providerFor(JSON.stringify({ project: 'p1' }));
        await provider.GetRequestHeaders(URL_);
        await provider.GetRequestHeaders(URL_);
        expect(created).toHaveLength(1);
        expect(auth.Urls).toHaveLength(2);
    });

    it('passes a quota-project header through', async () => {
        const auth = new FakeGoogleAuth({ authorization: 'Bearer t', 'x-goog-user-project': 'billing-project' });
        const { provider } = providerFor(JSON.stringify({ project: 'p1' }), 'other', auth);
        expect(await provider.GetRequestHeaders(URL_)).toEqual({ authorization: 'Bearer t', 'x-goog-user-project': 'billing-project' });
    });

    it('Application Default Credentials: the cloud-platform scope only, from any key', async () => {
        for (const source of ['other', 'environment'] as const) {
            const { provider, created } = providerFor(JSON.stringify({ project: 'p1' }), source);
            await provider.GetRequestHeaders(URL_);
            expect(created).toEqual([{ scopes: [VERTEX_AI_OAUTH_SCOPE] }]);
        }
    });

    it('an inline service account: its JWT client and the scope, never the key itself', async () => {
        const json = JSON.stringify({ type: 'service_account', project_id: 'sa', private_key: STAND_IN_KEY, client_email: 'sa@x' });
        const { provider, created } = providerFor(json);
        await provider.GetRequestHeaders(URL_);
        expect(created).toEqual([{ authClient: expect.any(JWT), scopes: [VERTEX_AI_OAUTH_SCOPE] }]);
        const jwt = created[0].authClient as JWT;
        expect(jwt.email).toBe('sa@x');
        expect(jwt.key).toBe(STAND_IN_KEY);
        expect(jwt.scopes).toEqual([VERTEX_AI_OAUTH_SCOPE]);
    });

    it('the environment key\'s key file: the file\'s client and the scope', async () => {
        const { provider, created } = providerFor(JSON.stringify({ project: 'p1', keyFilePath: serviceAccountPath }), 'environment');
        await provider.GetRequestHeaders(URL_);
        expect(created).toEqual([{ authClient: expect.any(JWT), scopes: [VERTEX_AI_OAUTH_SCOPE] }]);
        expect((created[0].authClient as JWT).email).toBe(FILE_EMAIL);
    });

    it('another key\'s key file: refused on every call, creating no GoogleAuth and quoting no path', async () => {
        const { provider, created } = providerFor(JSON.stringify({ project: 'p1', keyFilePath: serviceAccountPath }), 'other');
        for (let call = 0; call < 2; call++) {
            const failure = await provider.GetRequestHeaders(URL_).then(
                () => null,
                (error: unknown) => error
            );
            expect(failure).toBeInstanceOf(VertexCredentialsError);
            expect((failure as VertexCredentialsError).Problem).toBe('key-file-not-allowed');
            expect((failure as VertexCredentialsError).message).not.toContain(dir);
        }
        expect(created).toEqual([]);
    });

    it('retries a build that failed: a key file that appears later is used', async () => {
        const latePath = join(dir, 'late.json');
        const { provider, created } = providerFor(JSON.stringify({ project: 'p1', keyFilePath: latePath }), 'environment');
        await expect(provider.GetRequestHeaders(URL_)).rejects.toThrow('could not be read (ENOENT)');
        writeFileSync(latePath, JSON.stringify({ type: 'service_account', private_key: STAND_IN_KEY, client_email: FILE_EMAIL }));
        expect(await provider.GetRequestHeaders(URL_)).toEqual({ authorization: 'Bearer stand-in-token' });
        expect(created).toHaveLength(1);
    });

    it('throws when the library returns no bearer token', async () => {
        const { provider } = providerFor(JSON.stringify({ project: 'p1' }), 'other', new FakeGoogleAuth({ 'x-goog-user-project': 'b' }));
        await expect(provider.GetRequestHeaders(URL_)).rejects.toThrow('no bearer token');
    });

    it('passes the library\'s error through (no credentials found, a refused grant)', async () => {
        const failure = new Error('Could not load the default credentials.');
        const { provider } = providerFor(JSON.stringify({ project: 'p1' }), 'other', new FakeGoogleAuth(failure));
        await expect(provider.GetRequestHeaders(URL_)).rejects.toBe(failure);
    });
});
