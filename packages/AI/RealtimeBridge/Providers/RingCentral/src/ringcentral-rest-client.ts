/**
 * @fileoverview Production REST half of the RingCentral binding: a real {@link IRingCentralCallControlLike}
 * over the `@ringcentral/sdk` **Call Control API** (telephony sessions + party answer / drop / DTMF /
 * transfer).
 *
 * The `@ringcentral/sdk` package is an OPTIONAL PEER SDK (CLAUDE rule 8, category 2) — it is NEVER statically
 * imported, so this provider package builds and unit-tests with no `@ringcentral/sdk` install and no network.
 * The SDK is lazily loaded (once, memoized) at first use via the injectable {@link RingCentralModuleLoader};
 * tests inject a fake factory instead. None of the `@ringcentral/sdk` SDK's own types leak past this file —
 * everything crosses the seam through the minimal structural interfaces below, keeping
 * {@link RealRingCentralCallControlClient} SDK-agnostic.
 *
 * The OTHER half — the bidirectional media stream ({@link IRingCentralMediaPump}) — is owned by the MJAPI
 * telephony ingress, not this package: the carrier media stream is a server concern and one stream spans a
 * call's whole media plane. This file is REST only.
 *
 * ## How the interface maps onto the Call Control REST API
 * - `CreateSession` → `platform.post('/restapi/v1.0/account/~/telephony/sessions', payload)`; resolves the
 *   created telephony session id (and the primary party id is cached so party-scoped ops can address it).
 * - `AnswerParty`   → `platform.post('/restapi/v1.0/account/~/telephony/sessions/{id}/parties/{partyId}/answer')`.
 * - `DropSession`   → `platform.delete('/restapi/v1.0/account/~/telephony/sessions/{id}')`.
 * - `PlayDigits`    → `platform.post('/restapi/v1.0/account/~/telephony/sessions/{id}/parties/{partyId}/dtmf', { dtmf })`.
 * - `TransferParty` → `platform.post('/restapi/v1.0/account/~/telephony/sessions/{id}/parties/{partyId}/transfer', payload)`.
 *
 * Auth (OAuth — JWT for server-to-server, or a pre-obtained access token) rides the SDK's `platform().login`
 * and is resolved upstream via MJ config — never inlined here.
 *
 * @module @memberjunction/ai-bridge-ringcentral
 */

import type {
    CreateSessionPayload,
    IRingCentralCallControlLike,
    TransferPartyPayload,
} from './real-ringcentral-bindings';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal structural shapes of the `@ringcentral/sdk` surface we touch. Declared here
// so the SDK's real types never leak into the package and so tests can inject a fake.
// ──────────────────────────────────────────────────────────────────────────────

/** The login arguments the SDK's `platform().login(...)` accepts (the auth forms we drive). */
export interface RingCentralLoginParams {
    /** A RingCentral JWT for server-to-server (JWT) auth — preferred when present. */
    jwt?: string;
    /** A pre-obtained OAuth access token (used when no JWT is supplied). */
    access_token?: string;
}

/** The minimal `fetch`-style `Response` the SDK's HTTP methods resolve to (we only read JSON). */
export interface RingCentralResponseLike {
    /** Parses the response body as JSON. The Call Control session shape is read by {@link readSessionId}/{@link readPrimaryPartyId}. */
    json(): Promise<unknown>;
}

/**
 * The subset of the SDK `platform()` object we drive: OAuth login plus the REST verbs the Call Control API
 * uses. `post`/`delete` mirror the real SDK signatures (URL, optional body, optional query).
 */
export interface RingCentralPlatformLike {
    /** Performs OAuth login (JWT or access-token). Resolves once the client is authenticated. */
    login(params: RingCentralLoginParams): Promise<unknown>;
    /** Issues a REST `POST` to a Call Control path with an optional JSON body. */
    post(url: string, body?: unknown): Promise<RingCentralResponseLike>;
    /** Issues a REST `DELETE` to a Call Control path. */
    delete(url: string): Promise<RingCentralResponseLike>;
}

/** The subset of a constructed `@ringcentral/sdk` `SDK` instance we drive (just its `platform()`). */
export interface RingCentralSdkLike {
    /** Returns the platform client carrying the authenticated REST verbs. */
    platform(): RingCentralPlatformLike;
}

/** The SDK constructor options we set — server URL + app credentials (resolved upstream, never inlined). */
export interface RingCentralSdkOptions {
    /** The RingCentral platform server URL (sandbox vs production). */
    server: string;
    /** The RingCentral app client id. */
    clientId: string;
    /** The RingCentral app client secret. */
    clientSecret: string;
}

/**
 * The `@ringcentral/sdk` module's `SDK` constructor: `new SDK({ server, clientId, clientSecret })`. Typed as a
 * structural constructor so the SDK's own class type never leaks into the package.
 */
export type RingCentralSdkConstructor = new (options: RingCentralSdkOptions) => RingCentralSdkLike;

/** Loads the `@ringcentral/sdk` module's `SDK` constructor. Overridable in tests; defaults to a lazy dynamic import. */
export type RingCentralModuleLoader = () => Promise<RingCentralSdkConstructor>;

/**
 * Credentials the REST client constructs the `@ringcentral/sdk` SDK + authenticates with. Resolved upstream
 * via MJ config — never inlined.
 */
export interface RingCentralRestCredentials {
    /** The RingCentral platform server URL (sandbox vs production). Required to construct the SDK. */
    ServerUrl: string;
    /** The RingCentral app client id. Required to construct the SDK. */
    ClientId: string;
    /** The RingCentral app client secret. Required to construct the SDK. */
    ClientSecret: string;
    /** A RingCentral JWT for server-to-server auth — preferred over an access token when present. */
    Jwt?: string;
    /** A pre-obtained OAuth access token — used when no JWT is supplied. */
    AccessToken?: string;
}

/** Where in the Call Control REST tree the account-scoped telephony sessions live. */
const SESSIONS_BASE = '/restapi/v1.0/account/~/telephony/sessions';

/**
 * Lazily loads the `@ringcentral/sdk` module's `SDK` constructor exactly once and memoizes it. A static import
 * is impossible here (optional peer SDK, may be uninstalled in non-telephony deployments); the
 * `optionalDependencies` entry keeps it in the dependency graph (CLAUDE rule 8, category 2).
 */
export const defaultRingCentralModuleLoader: RingCentralModuleLoader = async (): Promise<RingCentralSdkConstructor> => {
    try {
        const mod: unknown = await import('@ringcentral/sdk');
        const ctor = unwrapRingCentralSdk(mod);
        if (typeof ctor !== 'function') {
            throw new Error('the @ringcentral/sdk module did not export an SDK constructor');
        }
        return ctor as RingCentralSdkConstructor;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "RealRingCentralCallControlClient could not load the '@ringcentral/sdk' SDK. Install it in the " +
                'deployment that runs the RingCentral telephony bridge (it is an optional peer dependency). ' +
                `Underlying error: ${message}`,
        );
    }
};

/** Unwraps the `SDK` constructor from CJS/ESM interop (`module.SDK`, `module.default`, or the module itself). */
function unwrapRingCentralSdk(mod: unknown): unknown {
    if (mod && typeof mod === 'object') {
        const named = (mod as { SDK?: unknown }).SDK;
        if (typeof named === 'function') {
            return named;
        }
        const dflt = (mod as { default?: unknown }).default;
        if (typeof dflt === 'function') {
            return dflt;
        }
    }
    return mod;
}

/**
 * A real {@link IRingCentralCallControlLike} over the `@ringcentral/sdk` Call Control REST API.
 *
 * The constructed + authenticated client is built once on first use (memoized) and reused for the life of the
 * instance. Party-scoped operations (answer / DTMF / transfer) need a party id; the primary party id from the
 * `CreateSession` response is cached per session so those operations can address it without re-fetching.
 */
export class RealRingCentralCallControlClient implements IRingCentralCallControlLike {
    private readonly credentials: RingCentralRestCredentials;
    private readonly loadModule: RingCentralModuleLoader;
    /** Memoized authenticated-platform promise so concurrent callers share one construction + login. */
    private platformPromise?: Promise<RingCentralPlatformLike>;
    /** Session id → primary party id, captured from the `CreateSession`/answer responses for party-scoped ops. */
    private readonly partyBySession = new Map<string, string>();

    /**
     * @param credentials Resolved RingCentral credentials (server URL + app client id/secret + JWT or access token).
     * @param loadModule The `@ringcentral/sdk` module loader (defaults to the lazy dynamic import).
     */
    constructor(
        credentials: RingCentralRestCredentials,
        loadModule: RingCentralModuleLoader = defaultRingCentralModuleLoader,
    ) {
        this.credentials = credentials;
        this.loadModule = loadModule;
    }

    /** @inheritdoc */
    public async CreateSession(payload: CreateSessionPayload): Promise<string> {
        const platform = await this.ensurePlatform();
        const response = await platform.post(SESSIONS_BASE, payload);
        const body = await response.json();
        const sessionId = readSessionId(body);
        if (!sessionId) {
            throw new Error('RingCentral CreateSession returned no telephony session id.');
        }
        this.cachePrimaryParty(sessionId, body);
        return sessionId;
    }

    /** @inheritdoc */
    public async AnswerParty(sessionId: string): Promise<void> {
        const platform = await this.ensurePlatform();
        const partyId = await this.resolvePartyId(platform, sessionId);
        const response = await platform.post(`${SESSIONS_BASE}/${sessionId}/parties/${partyId}/answer`);
        this.cachePrimaryParty(sessionId, await response.json());
    }

    /** @inheritdoc */
    public async DropSession(sessionId: string): Promise<void> {
        const platform = await this.ensurePlatform();
        await platform.delete(`${SESSIONS_BASE}/${sessionId}`);
        this.partyBySession.delete(sessionId);
    }

    /** @inheritdoc */
    public async PlayDigits(sessionId: string, digits: string): Promise<void> {
        const platform = await this.ensurePlatform();
        const partyId = await this.resolvePartyId(platform, sessionId);
        await platform.post(`${SESSIONS_BASE}/${sessionId}/parties/${partyId}/dtmf`, { dtmf: digits });
    }

    /** @inheritdoc */
    public async TransferParty(sessionId: string, payload: TransferPartyPayload): Promise<void> {
        const platform = await this.ensurePlatform();
        const partyId = await this.resolvePartyId(platform, sessionId);
        await platform.post(`${SESSIONS_BASE}/${sessionId}/parties/${partyId}/transfer`, payload);
    }

    /** Builds (once) and returns the authenticated platform client, choosing JWT auth when available. */
    private ensurePlatform(): Promise<RingCentralPlatformLike> {
        if (!this.platformPromise) {
            this.platformPromise = this.buildPlatform();
        }
        return this.platformPromise;
    }

    /** Constructs the SDK, logs in (JWT when present, else access token), and returns the platform client. */
    private async buildPlatform(): Promise<RingCentralPlatformLike> {
        const Sdk = await this.loadModule();
        const { ServerUrl, ClientId, ClientSecret } = this.credentials;
        const sdk = new Sdk({ server: ServerUrl, clientId: ClientId, clientSecret: ClientSecret });
        const platform = sdk.platform();
        await platform.login(this.buildLoginParams());
        return platform;
    }

    /** Selects the OAuth login form: JWT (server-to-server) when present, else a pre-obtained access token. */
    private buildLoginParams(): RingCentralLoginParams {
        const { Jwt, AccessToken } = this.credentials;
        if (Jwt) {
            return { jwt: Jwt };
        }
        if (AccessToken) {
            return { access_token: AccessToken };
        }
        throw new Error(
            'RealRingCentralCallControlClient requires either a JWT (Jwt) or a pre-obtained access token (AccessToken) for OAuth login.',
        );
    }

    /** Returns the cached primary party id for a session, or throws — answer/DTMF/transfer are party-scoped. */
    private async resolvePartyId(platform: RingCentralPlatformLike, sessionId: string): Promise<string> {
        const cached = this.partyBySession.get(sessionId);
        if (cached) {
            return cached;
        }
        const fetched = await this.fetchPrimaryParty(platform, sessionId);
        if (!fetched) {
            throw new Error(`RingCentral session '${sessionId}' has no addressable party for the requested operation.`);
        }
        return fetched;
    }

    /** Fetches the session resource and caches/returns its primary party id (for sessions created elsewhere). */
    private async fetchPrimaryParty(platform: RingCentralPlatformLike, sessionId: string): Promise<string | undefined> {
        const response = await platform.post(`${SESSIONS_BASE}/${sessionId}`);
        return this.cachePrimaryParty(sessionId, await response.json());
    }

    /** Reads the primary party id out of a session response body and caches it; returns the id (or undefined). */
    private cachePrimaryParty(sessionId: string, body: unknown): string | undefined {
        const partyId = readPrimaryPartyId(body);
        if (partyId) {
            this.partyBySession.set(sessionId, partyId);
        }
        return partyId;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure readers for the Call Control session response shape (id + parties[].id).
// Kept tiny + defensive so a malformed body yields undefined, never a crash.
// ──────────────────────────────────────────────────────────────────────────────

/** The Call Control session-resource subset we read (its id + the parties list). */
interface SessionResponseShape {
    id?: unknown;
    parties?: unknown;
}

/** One party-resource subset we read (its id). */
interface PartyShape {
    id?: unknown;
}

/** Reads the telephony session id from a Call Control session response body, or `undefined`. */
function readSessionId(body: unknown): string | undefined {
    if (body && typeof body === 'object') {
        const id = (body as SessionResponseShape).id;
        if (typeof id === 'string' && id.length > 0) {
            return id;
        }
    }
    return undefined;
}

/** Reads the first party id from a Call Control session response body's `parties[]`, or `undefined`. */
function readPrimaryPartyId(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') {
        return undefined;
    }
    const parties = (body as SessionResponseShape).parties;
    if (!Array.isArray(parties)) {
        return undefined;
    }
    for (const party of parties) {
        if (party && typeof party === 'object') {
            const id = (party as PartyShape).id;
            if (typeof id === 'string' && id.length > 0) {
                return id;
            }
        }
    }
    return undefined;
}
