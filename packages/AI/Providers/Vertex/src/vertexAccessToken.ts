/**
 * @fileoverview OAuth access to Vertex AI from the Vertex AI credential shapes, through `google-auth-library`.
 *
 * MJAPI's realtime relay opens each upstream Gemini Live connection with these headers. The token never leaves MJAPI:
 * the browser talks to the relay, and the relay adds the headers on its own upstream socket.
 *
 * @module @memberjunction/ai-vertex
 * @author MemberJunction.com
 */

import { GoogleAuth, type GoogleAuthOptions } from 'google-auth-library';
import { CreateVertexAuthClient, VERTEX_AI_OAUTH_SCOPE } from './vertexAuthClient';
import type { VertexAICredentials, VertexKeySource } from './vertexCredentials';

/** The part of `GoogleAuth` the provider uses. Tests pass a fake. */
export type VertexGoogleAuth = Pick<GoogleAuth, 'getRequestHeaders'>;

/** Creates the `GoogleAuth` for a set of options. */
export type VertexGoogleAuthFactory = (options: GoogleAuthOptions) => VertexGoogleAuth;

/**
 * Mints the request headers that authorize a call to Vertex AI. The `GoogleAuth` wraps the client
 * `CreateVertexAuthClient` builds (an inline service account, or a key file from the environment key), or, with no
 * credentials, resolves Application Default Credentials (workload identity on GKE and Cloud Run, the metadata server on
 * GCE, `GOOGLE_APPLICATION_CREDENTIALS`), always with the `cloud-platform` scope. It is created on first use and kept,
 * so the library caches the token until shortly before it expires.
 */
export class VertexAccessTokenProvider {
    private readonly credentials: VertexAICredentials;
    private readonly source: VertexKeySource;
    private readonly createAuth: VertexGoogleAuthFactory;
    private auth: Promise<VertexGoogleAuth> | null = null;

    /**
     * @param credentials Credentials from `ParseVertexAICredentials`.
     * @param source Where the key came from (`VertexKeySourceOf`); only the environment key may name a key file.
     * @param createAuth Creates the `GoogleAuth`; the default is `google-auth-library`'s.
     */
    constructor(credentials: VertexAICredentials, source: VertexKeySource, createAuth: VertexGoogleAuthFactory = (options) => new GoogleAuth(options)) {
        this.credentials = credentials;
        this.source = source;
        this.createAuth = createAuth;
    }

    /**
     * The headers that authorize one request, with lower-case names: `authorization: Bearer <token>`, plus
     * `x-goog-user-project` when the credentials name a quota project. Only a new or expiring token costs a round trip
     * to Google.
     *
     * @param url The request URL; the library uses it as the audience of a self-signed JWT.
     * @throws When no token can be had (no Application Default Credentials, a refused or unreadable key file, a refused
     *   grant).
     */
    public async GetRequestHeaders(url: string): Promise<Record<string, string>> {
        const auth = await this.ensureAuth();
        const headers = await auth.getRequestHeaders(url);
        const record: Record<string, string> = {};
        headers.forEach((value, name) => {
            record[name] = value; // a Headers object yields lower-case names
        });
        if (!record['authorization']) {
            throw new Error('Vertex AI authentication returned no bearer token.');
        }
        return record;
    }

    /** The provider's `GoogleAuth`, built on first use; a build that fails is retried on the next call. */
    private ensureAuth(): Promise<VertexGoogleAuth> {
        if (!this.auth) {
            const building = this.buildAuth();
            this.auth = building;
            building.catch(() => {
                if (this.auth === building) {
                    this.auth = null;
                }
            });
        }
        return this.auth;
    }

    private async buildAuth(): Promise<VertexGoogleAuth> {
        const authClient = await CreateVertexAuthClient(this.credentials, this.source);
        return this.createAuth(authClient ? { authClient, scopes: [VERTEX_AI_OAUTH_SCOPE] } : { scopes: [VERTEX_AI_OAUTH_SCOPE] });
    }
}
