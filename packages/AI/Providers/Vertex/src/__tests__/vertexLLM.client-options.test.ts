import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JWT } from 'google-auth-library';

/**
 * VertexLLM builds its `@google/genai` client through the shared Vertex auth helper: a `JWT` client for an inline
 * service account, Application Default Credentials when the key has none, and a key file only when the key is the
 * environment key (`AI_VENDOR_API_KEY__VertexLLM`).
 */
const sdk = vi.hoisted(() => ({ Options: [] as Array<Record<string, unknown>> }));

vi.mock('@google/genai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@google/genai')>();
    class CapturingGoogleGenAI {
        constructor(options: Record<string, unknown>) {
            sdk.Options.push(options);
        }
    }
    return { ...actual, GoogleGenAI: CapturingGoogleGenAI };
});

import { ChatMessageRole } from '@memberjunction/ai';
import { VertexLLM } from '../models/vertexLLM';
import { VertexCredentialsError } from '../vertexCredentials';

/** Exposes the protected client factory. */
class ClientProbe extends VertexLLM {
    public async Build(): Promise<Record<string, unknown>> {
        await this.createClient();
        return sdk.Options[sdk.Options.length - 1];
    }
}

const STAND_IN_KEY = '-----BEGIN PRIVATE KEY-----\nstand-in\n-----END PRIVATE KEY-----\n';
const FILE_EMAIL = 'file-sa@file-project.iam.gserviceaccount.com';

let dir: string;
let keyFilePath: string;
/** The environment key: it names a key file, which only it may do. */
let environmentKey: string;

function authClientOf(options: Record<string, unknown>): JWT {
    const auth = options['googleAuthOptions'] as { authClient?: unknown } | undefined;
    expect(auth).toEqual({ authClient: expect.any(JWT) });
    return auth?.authClient as JWT;
}

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mj-vertex-llm-'));
    keyFilePath = join(dir, 'service-account.json');
    writeFileSync(keyFilePath, JSON.stringify({ type: 'service_account', project_id: 'file-project', private_key: STAND_IN_KEY, client_email: FILE_EMAIL }));
    environmentKey = JSON.stringify({ project: 'p1', location: 'eu', keyFilePath });
    // Set once for the file: the platform caches environment keys for the life of the process.
    vi.stubEnv('AI_VENDOR_API_KEY__VertexLLM', environmentKey);
});

afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
});

describe('VertexLLM client options', () => {
    beforeEach(() => {
        sdk.Options.length = 0;
    });

    it('Application Default Credentials: Vertex mode, project and location only', async () => {
        const options = await new ClientProbe(JSON.stringify({ project: 'p1' })).Build();
        expect(options).toEqual({ vertexai: true, project: 'p1', location: 'us-central1' });
    });

    it('an inline service account: a JWT client with the cloud-platform scope', async () => {
        const options = await new ClientProbe(
            JSON.stringify({ type: 'service_account', project_id: 'sa', private_key: STAND_IN_KEY, client_email: 'sa@x', location: 'us' })
        ).Build();
        expect(options).toEqual({ vertexai: true, project: 'sa', location: 'us', googleAuthOptions: { authClient: expect.any(JWT) } });
        const jwt = authClientOf(options);
        expect(jwt.email).toBe('sa@x');
        expect(jwt.key).toBe(STAND_IN_KEY);
        expect(jwt.scopes).toEqual(['https://www.googleapis.com/auth/cloud-platform']);
    });

    it('a serviceAccountJson string: a JWT client', async () => {
        const serviceAccount = JSON.stringify({ type: 'service_account', project_id: 'sa', private_key: STAND_IN_KEY, client_email: 'sa@x' });
        const llm = new ClientProbe(JSON.stringify({ project: 'top', serviceAccountJson: serviceAccount }));
        const options = await llm.Build();
        expect(options['project']).toBe('sa');
        expect(options['location']).toBe('us-central1');
        expect(authClientOf(options).key).toBe(STAND_IN_KEY);
        expect(llm.Credentials.project).toBe('sa');
    });

    it('the environment key (AI_VENDOR_API_KEY__VertexLLM) may name a key file, as before', async () => {
        const options = await new ClientProbe(environmentKey).Build();
        expect(options['project']).toBe('p1');
        expect(options['location']).toBe('eu');
        expect(authClientOf(options).email).toBe(FILE_EMAIL);
    });

    it('any other key that names a key file is refused when the client is created, quoting no path', async () => {
        const keys = [
            JSON.stringify({ project: 'p1', keyFilePath }),
            // The environment key's fields in another order: another key.
            JSON.stringify({ location: 'eu', project: 'p1', keyFilePath }),
        ];
        for (const key of keys) {
            const llm = new ClientProbe(key); // constructing never touches the file
            const failure = await llm.Build().then(
                () => null,
                (error: unknown) => error
            );
            expect(failure).toBeInstanceOf(VertexCredentialsError);
            expect((failure as VertexCredentialsError).Problem).toBe('key-file-not-allowed');
            expect((failure as VertexCredentialsError).message).not.toContain(dir);
        }
        expect(sdk.Options).toEqual([]);
    });

    it('a chat with such a key fails with the reason, quoting no path', async () => {
        const result = await new VertexLLM(JSON.stringify({ project: 'p1', keyFilePath })).ChatCompletion({
            model: 'gemini-2.5-flash',
            messages: [{ role: ChatMessageRole.user, content: 'hello' }],
        });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('names a key file');
        expect(result.errorMessage).not.toContain(dir);
        expect(sdk.Options).toEqual([]);
    });
});
