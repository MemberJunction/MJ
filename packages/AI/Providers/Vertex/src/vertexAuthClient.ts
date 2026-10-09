/**
 * @fileoverview The `google-auth-library` client for Vertex AI credentials, built by MJ.
 *
 * `google-auth-library` 10 deprecates its `keyFile`, `keyFilename` and `credentials` options and `GoogleAuth.fromJSON`:
 * they load any credential type from any source without validation. MJ builds the client itself instead:
 * - an inline service account becomes a `JWT` client;
 * - a key file, only from the platform's environment key, is read and parsed here and becomes the client for its
 *   `type` (the same dispatch `GoogleAuth.fromJSON` performs, through the type-specific constructors);
 * - no credentials means Application Default Credentials, which the library resolves itself.
 *
 * @module @memberjunction/ai-vertex
 * @author MemberJunction.com
 */

import { readFile } from 'node:fs/promises';
import type { GoogleGenAIOptions } from '@google/genai';
import {
    ExternalAccountAuthorizedUserClient,
    ExternalAccountClient,
    GdchClient,
    GoogleAuth,
    JWT,
    UserRefreshClient,
    type AuthClient,
    type ExternalAccountAuthorizedUserClientOptions,
    type ExternalAccountClientOptions,
    type GdchCredentialsInput,
    type JWTInput,
} from 'google-auth-library';
import { AssertVertexKeyFileAllowed, VertexCredentialsError, type VertexAICredentials, type VertexKeySource } from './vertexCredentials';

/** The OAuth scope Vertex AI requires, the one `@google/genai` asks for. */
export const VERTEX_AI_OAUTH_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/** An impersonated service account's JSON (`google-auth-library` does not export the type by name). */
type ImpersonatedJWTInput = Parameters<GoogleAuth['fromImpersonatedJSON']>[0];

/** A key file's JSON: any of the shapes `google-auth-library` reads. Its `type` picks the client. */
type VertexKeyFileJson = (JWTInput | ImpersonatedJWTInput | GdchCredentialsInput | ExternalAccountClientOptions | ExternalAccountAuthorizedUserClientOptions) & {
    type?: string;
};

/**
 * The auth client for Vertex AI credentials, with the `cloud-platform` scope where the credential type takes scopes:
 * the key file's client when the key names one (environment keys only), else a `JWT` client for an inline service
 * account, else `undefined` for Application Default Credentials.
 *
 * @param credentials Credentials from `ParseVertexAICredentials`.
 * @param source Where the key came from (`VertexKeySourceOf`).
 * @throws {VertexCredentialsError} `key-file-not-allowed` for a key file in a key that is not the environment key
 *   (before the file is touched); `unreadable-key-file` or `invalid-key-file` for a key file that cannot be read or is
 *   not a credential. No message quotes the path or a private key; `invalid-key-file` passes on the library's reason
 *   (a missing field, an unsupported configuration).
 * @throws The library's error for an inline service account it cannot use (no `client_email`).
 */
export async function CreateVertexAuthClient(credentials: VertexAICredentials, source: VertexKeySource): Promise<AuthClient | undefined> {
    AssertVertexKeyFileAllowed(credentials, source);
    if (credentials.keyFilePath) {
        return keyFileClient(await readKeyFile(credentials.keyFilePath));
    }
    if (credentials.type === 'service_account' && credentials.private_key) {
        return serviceAccountClient(inlineServiceAccount(credentials, credentials.private_key));
    }
    return undefined;
}

/**
 * The options for a `@google/genai` client in Vertex mode: the project, the location and the auth client from
 * {@link CreateVertexAuthClient}; none for Application Default Credentials, which the SDK then resolves.
 *
 * @param credentials Credentials from `ParseVertexAICredentials`.
 * @param source Where the key came from (`VertexKeySourceOf`).
 * @throws {VertexCredentialsError} As {@link CreateVertexAuthClient}.
 */
export async function VertexGenAIOptions(credentials: VertexAICredentials, source: VertexKeySource): Promise<GoogleGenAIOptions> {
    const options: GoogleGenAIOptions = {
        vertexai: true,
        project: credentials.project,
        location: credentials.location ?? 'us-central1',
    };
    const authClient = await CreateVertexAuthClient(credentials, source);
    if (authClient) {
        options.googleAuthOptions = { authClient };
    }
    return options;
}

/** A `JWT` client for service-account JSON, with the `cloud-platform` scope. */
function serviceAccountClient(json: JWTInput): JWT {
    const client = new JWT({ scopes: [VERTEX_AI_OAUTH_SCOPE] });
    client.fromJSON(json);
    return client;
}

/**
 * The inline service account as a key file would hold it: the fields a `JWT` client reads. (`JWT` reads no endpoints
 * or client id from a key, so the defaults `VertexLLM` used to fill in for them had no effect.)
 */
function inlineServiceAccount(credentials: VertexAICredentials, privateKey: string): JWTInput {
    return {
        type: 'service_account',
        project_id: credentials.project,
        private_key_id: credentials.private_key_id,
        private_key: privateKey,
        client_email: credentials.client_email,
    };
}

/** Reads and parses a key file. Errors name the failure, never the path or the contents. */
async function readKeyFile(path: string): Promise<VertexKeyFileJson> {
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    } catch (error: unknown) {
        const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unreadable';
        throw new VertexCredentialsError('unreadable-key-file', `The Vertex AI key file could not be read (${code}).`);
    }
    let json: VertexKeyFileJson | null = null;
    try {
        json = JSON.parse(text) as VertexKeyFileJson | null;
    } catch {
        json = null;
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new VertexCredentialsError('invalid-key-file', 'The Vertex AI key file is not a JSON object.');
    }
    return json;
}

/** The client for a key file's credential type, as `GoogleAuth.fromJSON` picks it; a service account by default. */
function keyFileClient(json: VertexKeyFileJson): AuthClient {
    try {
        switch (json.type) {
            case 'authorized_user':
                return userRefreshClient(json as JWTInput);
            case 'impersonated_service_account':
                return new GoogleAuth({ scopes: [VERTEX_AI_OAUTH_SCOPE] }).fromImpersonatedJSON(json as ImpersonatedJWTInput);
            case 'external_account':
                return externalAccountClient(json as ExternalAccountClientOptions);
            case 'external_account_authorized_user':
                return new ExternalAccountAuthorizedUserClient(json as ExternalAccountAuthorizedUserClientOptions);
            case 'gdch_service_account':
                return gdchClient(json as GdchCredentialsInput);
            default:
                return serviceAccountClient(json as JWTInput);
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new VertexCredentialsError('invalid-key-file', `The Vertex AI key file is not a usable credential: ${message}`);
    }
}

/** A user credential (`gcloud auth application-default login`'s file). */
function userRefreshClient(json: JWTInput): UserRefreshClient {
    const client = new UserRefreshClient();
    client.fromJSON(json);
    return client;
}

/** Workload identity federation, with the `cloud-platform` scope. */
function externalAccountClient(json: ExternalAccountClientOptions): AuthClient {
    const client = ExternalAccountClient.fromJSON(json);
    if (!client) {
        throw new Error('the external account configuration is not one google-auth-library supports');
    }
    client.scopes = [VERTEX_AI_OAUTH_SCOPE];
    return client;
}

/** A Google Distributed Cloud Hosted service account. */
function gdchClient(json: GdchCredentialsInput): GdchClient {
    const client = new GdchClient();
    client.fromJSON(json);
    return client;
}
