import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    ExternalAccountAuthorizedUserClient,
    GdchClient,
    IdentityPoolClient,
    Impersonated,
    JWT,
    UserRefreshClient,
    type AuthClient,
} from 'google-auth-library';
import { GoogleGenAI } from '@google/genai';
import { CreateVertexAuthClient, VERTEX_AI_OAUTH_SCOPE, VertexGenAIOptions } from '../vertexAuthClient';
import { ParseVertexAICredentials, VertexCredentialsError, type VertexAICredentials, type VertexKeySource } from '../vertexCredentials';

// Stand-in keys: never real ones.
const STAND_IN_KEY = '-----BEGIN PRIVATE KEY-----\nstand-in-inline-key\n-----END PRIVATE KEY-----\n';
const FILE_KEY_BODY = 'stand-in-file-key';
const FILE_KEY = `-----BEGIN PRIVATE KEY-----\n${FILE_KEY_BODY}\n-----END PRIVATE KEY-----\n`;
const SA_EMAIL = 'sa@sa-project.iam.gserviceaccount.com';
const FILE_EMAIL = 'file-sa@file-project.iam.gserviceaccount.com';
const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];
const SOURCES: VertexKeySource[] = ['other', 'environment'];

const USER_CREDENTIAL = { type: 'authorized_user', client_id: 'stand-in-client', client_secret: 'stand-in-secret', refresh_token: 'stand-in-refresh' };

let dir: string;
const paths: Record<string, string> = {};

function writeKeyFile(name: string, contents: string): string {
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
}

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mj-vertex-auth-'));
    paths.serviceAccount = writeKeyFile(
        'service-account.json',
        JSON.stringify({ type: 'service_account', project_id: 'file-project', private_key_id: 'file-key-id', private_key: FILE_KEY, client_email: FILE_EMAIL })
    );
    paths.notJson = writeKeyFile('not-json.json', `{"private_key": ${FILE_KEY_BODY}`);
    paths.array = writeKeyFile('array.json', '[]');
    paths.null = writeKeyFile('null.json', 'null');
    paths.noPrivateKey = writeKeyFile('no-private-key.json', JSON.stringify({ type: 'service_account', client_email: FILE_EMAIL }));
    paths.user = writeKeyFile('user.json', JSON.stringify(USER_CREDENTIAL));
    paths.impersonated = writeKeyFile(
        'impersonated.json',
        JSON.stringify({
            type: 'impersonated_service_account',
            service_account_impersonation_url:
                'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/target@stand-in.iam.gserviceaccount.com:generateAccessToken',
            source_credentials: USER_CREDENTIAL,
        })
    );
    paths.externalAccount = writeKeyFile(
        'external-account.json',
        JSON.stringify({
            type: 'external_account',
            audience: '//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/pool/providers/provider',
            subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
            token_url: 'https://sts.googleapis.com/v1/token',
            credential_source: { file: '/var/run/stand-in/token' },
        })
    );
    paths.externalUser = writeKeyFile(
        'external-user.json',
        JSON.stringify({
            type: 'external_account_authorized_user',
            audience: '//iam.googleapis.com/locations/global/workforcePools/pool/providers/provider',
            client_id: 'stand-in-client',
            client_secret: 'stand-in-secret',
            refresh_token: 'stand-in-refresh',
            token_url: 'https://sts.googleapis.com/v1/oauthtoken',
            token_info_url: 'https://sts.googleapis.com/v1/introspect',
        })
    );
    paths.gdch = writeKeyFile(
        'gdch.json',
        JSON.stringify({
            type: 'gdch_service_account',
            format_version: '1',
            project: 'gdch-project',
            private_key_id: 'gdch-key-id',
            private_key: FILE_KEY,
            name: 'gdch-sa',
            token_uri: 'https://gdch.example.test/token',
            ca_cert_path: '/certs/stand-in-ca.pem',
        })
    );
    paths.badExternal = writeKeyFile('bad-external.json', JSON.stringify({ type: 'external_account' }));
    paths.missing = join(dir, 'missing.json');
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

function creds(json: object): VertexAICredentials {
    return ParseVertexAICredentials(JSON.stringify(json));
}

/** The `VertexCredentialsError` a promise rejects with. */
async function refusal(promise: Promise<unknown>): Promise<VertexCredentialsError> {
    try {
        await promise;
    } catch (error: unknown) {
        if (error instanceof VertexCredentialsError) {
            return error;
        }
        throw error;
    }
    throw new Error('expected a VertexCredentialsError');
}

function expectJwt(client: AuthClient | undefined, email: string, key: string): JWT {
    expect(client).toBeInstanceOf(JWT);
    const jwt = client as JWT;
    expect(jwt.email).toBe(email);
    expect(jwt.key).toBe(key);
    expect(jwt.scopes).toEqual(SCOPES);
    return jwt;
}

describe('CreateVertexAuthClient', () => {
    it('the scope is cloud-platform', () => {
        expect(VERTEX_AI_OAUTH_SCOPE).toBe(SCOPES[0]);
    });

    it('an inline service account becomes a JWT client with the cloud-platform scope, from any key', async () => {
        for (const source of SOURCES) {
            const key = creds({ type: 'service_account', project_id: 'sa-project', private_key_id: 'kid', private_key: STAND_IN_KEY, client_email: SA_EMAIL });
            const jwt = expectJwt(await CreateVertexAuthClient(key, source), SA_EMAIL, STAND_IN_KEY);
            expect(jwt.keyId).toBe('kid');
            expect(jwt.projectId).toBe('sa-project');
        }
    });

    it('a serviceAccountJson string becomes a JWT client', async () => {
        const serviceAccount = JSON.stringify({ type: 'service_account', project_id: 'sa-project', private_key: STAND_IN_KEY, client_email: SA_EMAIL });
        expectJwt(await CreateVertexAuthClient(creds({ project: 'top', serviceAccountJson: serviceAccount }), 'other'), SA_EMAIL, STAND_IN_KEY);
    });

    it('Application Default Credentials: no client, from any key, including a service account without a private key', async () => {
        for (const source of SOURCES) {
            expect(await CreateVertexAuthClient(creds({ project: 'p1' }), source)).toBeUndefined();
            expect(await CreateVertexAuthClient(creds({ project: 'p1', type: 'service_account', client_email: SA_EMAIL }), source)).toBeUndefined();
        }
    });

    it('an inline service account without a client_email fails with the library\'s reason', async () => {
        const key = creds({ type: 'service_account', project_id: 'sa-project', private_key: STAND_IN_KEY });
        await expect(CreateVertexAuthClient(key, 'other')).rejects.toThrow('client_email');
    });

    it('the environment key may name a key file: a service account file becomes a JWT client', async () => {
        const jwt = expectJwt(await CreateVertexAuthClient(creds({ project: 'p1', keyFilePath: paths.serviceAccount }), 'environment'), FILE_EMAIL, FILE_KEY);
        expect(jwt.keyId).toBe('file-key-id');
    });

    it('in the environment key, the key file wins over inline service-account fields', async () => {
        const key = creds({ project: 'p1', keyFilePath: paths.serviceAccount, type: 'service_account', private_key: STAND_IN_KEY, client_email: SA_EMAIL });
        expectJwt(await CreateVertexAuthClient(key, 'environment'), FILE_EMAIL, FILE_KEY);
    });

    it('any other key that names a key file is refused before the file is touched, quoting no path', async () => {
        const keys = [
            creds({ project: 'p1', keyFilePath: paths.serviceAccount }),
            // A missing file would fail as unreadable if it were read first.
            creds({ project: 'p1', keyFilePath: paths.missing }),
            // Inline fields beside the key file do not rescue it.
            creds({ project: 'p1', keyFilePath: paths.serviceAccount, type: 'service_account', private_key: STAND_IN_KEY, client_email: SA_EMAIL }),
        ];
        for (const key of keys) {
            const error = await refusal(CreateVertexAuthClient(key, 'other'));
            expect(error.Problem).toBe('key-file-not-allowed');
            expect(error.message).toContain('AI_VENDOR_API_KEY__');
            expect(error.message).not.toContain(dir);
            expect(error.message).not.toContain('.json');
        }
    });

    it('a key file that cannot be read: unreadable-key-file, with the error code and no path', async () => {
        const error = await refusal(CreateVertexAuthClient(creds({ project: 'p1', keyFilePath: paths.missing }), 'environment'));
        expect(error.Problem).toBe('unreadable-key-file');
        expect(error.message).toBe('The Vertex AI key file could not be read (ENOENT).');
    });

    it('a key file that is not a JSON object: invalid-key-file, quoting none of it', async () => {
        for (const path of [paths.notJson, paths.array, paths.null]) {
            const error = await refusal(CreateVertexAuthClient(creds({ project: 'p1', keyFilePath: path }), 'environment'));
            expect(error.Problem).toBe('invalid-key-file');
            expect(error.message).toBe('The Vertex AI key file is not a JSON object.');
        }
    });

    it('a key file the library cannot use: invalid-key-file, with the library\'s reason and no path', async () => {
        for (const [path, reason] of [
            [paths.noPrivateKey, 'private_key'],
            [paths.badExternal, 'not a usable credential'],
        ]) {
            const error = await refusal(CreateVertexAuthClient(creds({ project: 'p1', keyFilePath: path }), 'environment'));
            expect(error.Problem).toBe('invalid-key-file');
            expect(error.message).toContain('The Vertex AI key file is not a usable credential: ');
            expect(error.message).toContain(reason);
            expect(error.message).not.toContain(dir);
            expect(error.message).not.toContain(FILE_KEY_BODY);
        }
    });

    it('other credential types in the environment key\'s file get their own client, as GoogleAuth would pick it', async () => {
        const cases: Array<[string, abstract new (...args: never[]) => AuthClient]> = [
            [paths.user, UserRefreshClient],
            [paths.impersonated, Impersonated],
            [paths.externalAccount, IdentityPoolClient],
            [paths.externalUser, ExternalAccountAuthorizedUserClient],
            [paths.gdch, GdchClient],
        ];
        for (const [path, clientClass] of cases) {
            const client = await CreateVertexAuthClient(creds({ project: 'p1', keyFilePath: path }), 'environment');
            expect(client, path).toBeInstanceOf(clientClass);
            expect(client, path).not.toBeInstanceOf(JWT);
        }
        const external = await CreateVertexAuthClient(creds({ project: 'p1', keyFilePath: paths.externalAccount }), 'environment');
        expect((external as IdentityPoolClient).scopes).toEqual(SCOPES);
    });
});

describe('VertexGenAIOptions', () => {
    it('Application Default Credentials: Vertex mode, the project and the location, no auth options', async () => {
        const options = await VertexGenAIOptions(creds({ project: 'p1', location: 'us' }), 'other');
        expect(options).toEqual({ vertexai: true, project: 'p1', location: 'us' });
        expect('googleAuthOptions' in options).toBe(false);
    });

    it('an inline service account: its JWT client, and nothing else, in the auth options', async () => {
        const options = await VertexGenAIOptions(
            creds({ type: 'service_account', project_id: 'sa-project', private_key: STAND_IN_KEY, client_email: SA_EMAIL, location: 'eu' }),
            'other'
        );
        expect(options).toEqual({ vertexai: true, project: 'sa-project', location: 'eu', googleAuthOptions: { authClient: expect.any(JWT) } });
        expectJwt(options.googleAuthOptions?.authClient, SA_EMAIL, STAND_IN_KEY);
    });

    it('the environment key\'s key file: the file\'s client in the auth options, never the path', async () => {
        const options = await VertexGenAIOptions(creds({ project: 'p1', keyFilePath: paths.serviceAccount }), 'environment');
        expect(options).toEqual({ vertexai: true, project: 'p1', location: 'us-central1', googleAuthOptions: { authClient: expect.any(JWT) } });
        expectJwt(options.googleAuthOptions?.authClient, FILE_EMAIL, FILE_KEY);
    });

    it('another key\'s key file: refused', async () => {
        const error = await refusal(VertexGenAIOptions(creds({ project: 'p1', keyFilePath: paths.serviceAccount }), 'other'));
        expect(error.Problem).toBe('key-file-not-allowed');
    });

    it("a Google Cloud API key: the SDK's API-key mode, the key with no project, location or auth client, which the SDK accepts", async () => {
        const apiKey = 'AIzaStandInKeyNotReal0123456789abcdefgh';
        for (const source of SOURCES) {
            // A key's project and location (Gemini Live's regional route) stay out too: the SDK refuses either beside a key.
            for (const key of [{ apiKey }, { apiKey, project: 'p1', location: 'eu' }]) {
                const options = await VertexGenAIOptions(creds(key), source);
                expect(options).toEqual({ vertexai: true, apiKey });
                expect(() => new GoogleGenAI(options)).not.toThrow();
            }
        }
    });
});
