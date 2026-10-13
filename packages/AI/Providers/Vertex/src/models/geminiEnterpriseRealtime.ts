/**
 * @fileoverview Gemini Live on Gemini Enterprise (Vertex AI): the server driver `GeminiEnterpriseRealtime`.
 *
 * Gemini Enterprise has no browser-safe credential for the Live API, so a client-direct session runs through MJAPI's
 * realtime relay: the mint issues a relay session whose policy writes the setup and adds a fresh OAuth bearer (or the
 * key's Google Cloud API key) to each upstream connection, and hands the browser the relay URL. A server-side (bridged) session opens the Live socket with
 * `@google/genai` in Vertex mode. Everything else (the connect config, the legality rules, the avatar rule, the session
 * translation) is `GeminiRealtime`'s, on the `'enterprise'` endpoint.
 *
 * @module @memberjunction/ai-vertex
 * @author MemberJunction.com
 */

import { GoogleGenAI, Modality, type GoogleGenAIOptions, type LiveConnectConfig, type LiveConnectParameters } from '@google/genai';
import { GoogleAuth, type GoogleAuthOptions } from 'google-auth-library';
import {
    BaseRealtimeModel,
    BuildRealtimeRelayUrl,
    RealtimeProxyRegistry,
    ResolveRealtimeProxyBaseWsUrl,
    type ClientRealtimeSessionConfig,
    type IRealtimeSession,
    type RealtimeSessionParams,
} from '@memberjunction/ai';
import {
    BuildGeminiLiveModelPath,
    BuildGeminiLiveSetup,
    GeminiLiveRelayPolicy,
    GeminiRealtime,
    type GeminiConnectArgs,
    type GeminiLiveEndpoint,
    type GeminiLiveSession,
    type GeminiLiveSetupTarget,
} from '@memberjunction/ai-gemini';
import { RegisterClass } from '@memberjunction/global';
import {
    AssertVertexKeyFileAllowed,
    AssertVertexLiveHostAllowed,
    ParseVertexAICredentials,
    VertexCredentialsError,
    VertexKeySourceOf,
    type VertexAICredentials,
    type VertexKeySource,
} from '../vertexCredentials';
import { VertexGenAIOptions } from '../vertexAuthClient';
import { VertexAccessTokenProvider, type VertexGoogleAuth } from '../vertexAccessToken';

/** The ClassFactory key, which is also the `MJ: AI Model Vendors` DriverClass and the `AI_VENDOR_API_KEY__` suffix. */
const DRIVER_CLASS = 'GeminiEnterpriseRealtime';

/** The provider key on the minted session config; the browser driver registered under it opens the session. */
const CLIENT_PROVIDER = 'gemini-enterprise';

/** The Vertex AI API version of the Live socket, on the relay and on bridged sessions, unless the key names another. */
const VERTEX_LIVE_API_VERSION = 'v1';

/** Where Google documents Gemini 3.8 Live: the `us` and `eu` multi-regions and `us-central1`. */
const DOCUMENTED_LIVE_LOCATIONS: ReadonlySet<string> = new Set(['us', 'eu', 'us-central1']);

/** Multi-region locations, served from `aiplatform.<location>.rep.googleapis.com` (as `@google/genai` maps them). */
const MULTI_REGION_LOCATIONS: ReadonlySet<string> = new Set(['us', 'eu']);

/** Google's global Vertex AI host: the `global` location's, and where `@google/genai` sends a Google Cloud API key. */
const GLOBAL_VERTEX_HOST = 'aiplatform.googleapis.com';

/** The header a Google Cloud API key travels in, as `@google/genai` sends it in Vertex mode. */
const API_KEY_HEADER = 'x-goog-api-key';

/**
 * What the base class holds in place of the project for an API key on Google's global route, which names none: the base
 * class warns about an empty value, and this driver never reads it.
 */
const GLOBAL_API_KEY_ROUTE_LABEL = 'api-key-global-route';

/** A Google Cloud location as it may appear in a host name. */
const LOCATION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The Live socket's path, as `@google/genai` writes it after its base URL: what comes before it (a path prefix) and the
 * API version it names.
 */
const LIVE_SOCKET_PATH = /^(.*)\/ws\/google\.cloud\.aiplatform\.([^/]+)\.LlmBidiService\/BidiGenerateContent$/;

/** The schemes of a Live URL a bridged session can open: `@google/genai` opens `ws` from `http` and `wss` from `https`. */
const LIVE_URL_SCHEMES: ReadonlySet<string> = new Set(['ws:', 'wss:', 'http:', 'https:']);

/** What is wrong with a key, in words that quote none of it. */
const CREDENTIALS_PROBLEMS: Readonly<Record<VertexCredentialsError['Problem'], string>> = {
    'invalid-json': 'is not valid JSON',
    'invalid-service-account-json': 'has a serviceAccountJson that is not valid JSON',
    'missing-project': 'names no "project" or "project_id"',
    'key-file-not-allowed': `names a key file, which only the environment key (AI_VENDOR_API_KEY__${DRIVER_CLASS}) may do`,
    'unreadable-key-file': 'names a key file that cannot be read',
    'invalid-key-file': 'names a key file that is not a usable credential',
    'invalid-live-host': 'has a liveHost that is not a host name (use host or host:port, bare or after https:// or wss://, with nothing after it)',
    'invalid-live-api-version': 'has a liveApiVersion that is not an API version such as v1 or v1beta1',
    'live-host-not-allowed': `names a liveHost, which only the environment key (AI_VENDOR_API_KEY__${DRIVER_CLASS}) may do`,
    'invalid-api-key': 'has an apiKey that is not an API key (visible characters only, no spaces)',
    'api-key-with-credentials': 'names an apiKey beside another credential (a key file, a service account or serviceAccountJson); give one',
};

/** The client-level HTTP options of a bridged session's `@google/genai` client. */
type LiveHttpOptions = NonNullable<GoogleGenAIOptions['httpOptions']>;

/** The part of a `@google/genai` client a bridged session uses. Tests pass a fake. */
export interface GeminiEnterpriseLiveClient {
    /** The SDK's Live module; only `connect` is used. */
    live: { connect(params: LiveConnectParameters): Promise<GeminiLiveSession> }; // case-violation-ok-legacy-back-compat: mirrors @google/genai's client
}

/**
 * Gemini Live on **Gemini Enterprise** (Vertex AI), with live avatars where the model renders them.
 *
 * Registered as `GeminiEnterpriseRealtime`. Its key (`AI_VENDOR_API_KEY__GeminiEnterpriseRealtime`, or the run's key) is
 * a JSON string in one of the `VertexAICredentials` shapes: an inline service account (a `JWT` client), a key-file path
 * (only in the environment key; any other key that names one is refused), neither for Application Default Credentials,
 * or a Google Cloud API key (`apiKey`). Tokens are minted with `google-auth-library` on each upstream open, never at the
 * mint; an API key is sent as `x-goog-api-key` on each upstream open. Neither leaves MJAPI. The Live socket is
 * `wss://<host>/ws/google.cloud.aiplatform.<version>.LlmBidiService/BidiGenerateContent`: the location's host and `v1`,
 * unless the key names `liveHost` (environment key only) or `liveApiVersion`, or a subclass overrides {@link LiveUrl}.
 * An API key picks its route by its key:
 * - alone, Google's global route, as `@google/genai`'s API-key mode does: the global host and the model's short name
 *   (`publishers/google/models/<id>`);
 * - with a `project` (and a `location`), the regional route: the location's host and the model's full
 *   `projects/<p>/locations/<l>/…` name, as for the other credentials. The SDK has no mode for it, so a bridged session
 *   gives the SDK the host and the full name itself.
 *
 * - **Client-direct** ({@link CreateClientSession}): MJ writes the Live setup from the connect config, MJAPI's relay
 *   sends it upstream with a bearer token (or the key's API key) and filters what the browser sends after it, and the
 *   browser gets a relay session (`Transport` `'relay'`, the relay URL as `RelayUrl`, with the ticket in its path) and a
 *   pact with a minimal config: no system prompt and no tools.
 * - **Bridged** ({@link StartSession}): `@google/genai` in Vertex mode; audio only, unless the host publishes the avatar
 *   into a meeting room (`RealtimeAvatarSettings.Delivery` `'room'`): then the model renders it and the session sends its
 *   pieces to the host as frames through `OnVideoFrame`.
 */
@RegisterClass(BaseRealtimeModel, 'GeminiEnterpriseRealtime')
export class GeminiEnterpriseRealtime extends GeminiRealtime {
    private readonly credentials: VertexAICredentials | null;
    private readonly credentialsProblem: string | null;
    /** Whether the key is the platform's environment key, the only key that may name a key file. */
    private readonly keySource: VertexKeySource;
    private tokenProvider: VertexAccessTokenProvider | null = null;
    private vertexClient: Promise<GeminiEnterpriseLiveClient> | null = null;

    /**
     * @param credentialsJson The Vertex AI key. Never throws: a key that cannot be read fails the session it is used for,
     *   so code that constructs a driver per key without opening a session (the voice list) keeps working.
     */
    constructor(credentialsJson: string) {
        const read = GeminiEnterpriseRealtime.readCredentials(credentialsJson);
        super(read.Credentials ? read.Credentials.project || GLOBAL_API_KEY_ROUTE_LABEL : '');
        this.credentials = read.Credentials;
        this.credentialsProblem = read.Problem;
        this.keySource = VertexKeySourceOf(DRIVER_CLASS, credentialsJson);
    }

    /** Gemini Enterprise: what a model renders (live avatars) is looked up on this endpoint. */
    protected override get Endpoint(): GeminiLiveEndpoint {
        return 'enterprise';
    }

    /**
     * Mints a client-direct session through MJAPI's relay: a relay session whose policy opens every upstream connection
     * with the setup written from the connect config and a fresh bearer token (or the key's API key); `Transport`
     * `'relay'` with the relay URL as `RelayUrl` and an empty `EphemeralToken` (the browser holds no Google credential;
     * the URL carries the ticket); a pact whose config holds only what the browser needs to state (the response
     * modalities, and the avatar's name when one is granted); and, when the session asked for an avatar, the avatar status
     * the call reads to say why it shows none.
     *
     * @param params The session parameters (model, system prompt, tools, config bag, avatar request).
     * @throws When the key cannot be read or names a location that is not a Google Cloud location.
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const credentials = this.requireCredentials();
        const location = GeminiEnterpriseRealtime.sessionLocation(credentials);
        const config = this.BuildConnectConfig(params);
        const upstreamUrl = this.LiveUrl(credentials, location);
        const policy = new GeminiLiveRelayPolicy({
            Setup: BuildGeminiLiveSetup(GeminiEnterpriseRealtime.setupTarget(credentials, params.Model, location), config),
            UpstreamHeaders: () => this.upstreamHeaders(upstreamUrl),
        });
        const ticket = RealtimeProxyRegistry.Instance.IssueRelaySession({
            UpstreamUrl: upstreamUrl,
            Policy: policy,
            UserID: params.UserID,
            DriverClass: DRIVER_CLASS,
            MaxSessionSeconds: params.MaxSessionSeconds,
        });
        const avatarStatus = this.AvatarStatusFor(params, config);
        return {
            Provider: CLIENT_PROVIDER,
            Model: params.Model,
            EphemeralToken: '',
            ExpiresAt: ticket.ExpiresAt,
            Transport: 'relay',
            // The ticket is in the path: the web SDK appends its own path to this URL. A resume reuses it.
            RelayUrl: BuildRealtimeRelayUrl(ResolveRealtimeProxyBaseWsUrl(params), ticket.ID),
            SessionConfig: this.SessionPactFor(params.Model, config, GeminiEnterpriseRealtime.browserConnectConfig(config)),
            ...(avatarStatus ? { AvatarStatus: avatarStatus } : {}),
        };
    }

    /**
     * Opens a server-side (bridged) session through `@google/genai` in Vertex mode: audio only, or with the avatar when
     * its host publishes it into a meeting room (`RealtimeAvatarSettings.Delivery` `'room'`; see `GeminiRealtime`).
     *
     * @throws When the key cannot be read or names a location that is not a Google Cloud location.
     */
    public override async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        GeminiEnterpriseRealtime.sessionLocation(this.requireCredentials());
        return super.StartSession(params);
    }

    /**
     * Opens one Live connection of a bridged session on Gemini Enterprise. The SDK writes the model's resource name from
     * its project and location, or the short name in API-key mode; for an API key on the regional route it gets the full
     * name, which it keeps as given.
     */
    protected override async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        const client = await this.ensureVertexClient();
        const credentials = this.requireCredentials();
        const model = GeminiEnterpriseRealtime.usesRegionalApiKey(credentials)
            ? BuildGeminiLiveModelPath({ Endpoint: 'enterprise', Model: args.Model, Project: credentials.project, Location: credentials.location })
            : args.Model;
        return client.live.connect({
            model,
            config: args.Config,
            callbacks: {
                onmessage: args.OnMessage,
                onerror: args.OnError,
                onclose: args.OnClose,
            },
        });
    }

    /** Gemini Enterprise has no ephemeral tokens; a client-direct session goes through the relay instead. */
    protected override async mintAuthToken(): Promise<never> {
        throw new Error(`${DRIVER_CLASS} mints no Gemini Developer API tokens; its client-direct sessions go through MJAPI's relay.`);
    }

    /**
     * Creation seam for the `GoogleAuth` that mints this driver's tokens (tests return a fake).
     *
     * @param options The credentials' `google-auth-library` options, with the `cloud-platform` scope.
     */
    protected CreateGoogleAuth(options: GoogleAuthOptions): VertexGoogleAuth {
        return new GoogleAuth(options);
    }

    /**
     * Creation seam for the Vertex-mode `@google/genai` client of bridged sessions (tests return a fake).
     *
     * @param options The credentials' Vertex options (`VertexGenAIOptions`), with the Live API version and any Live base
     *   URL (see {@link LiveUrl}).
     */
    protected CreateVertexClient(options: GoogleGenAIOptions): GeminiEnterpriseLiveClient {
        return new GoogleGenAI(options);
    }

    /**
     * The Vertex AI Live websocket a session connects to. MJAPI's relay opens each upstream connection of a client-direct
     * session on this URL. A bridged session's `@google/genai` client opens it too; the driver reads it once, when it
     * builds that client, and gives the SDK everything before the socket path
     * (`/ws/google.cloud.aiplatform.<version>.LlmBidiService/BidiGenerateContent`) as its base URL, path prefix included,
     * with the version the socket path names. The SDK writes the socket path back after it; with nothing before the
     * socket path, it writes `//ws/…`, as it does on Google's own hosts. By default: the key's `liveHost` when it names
     * one, else the host `@google/genai` picks for the location (Google's global host for an API key without a project),
     * with the key's `liveApiVersion`, else `v1`.
     *
     * A seam for a subclass registered at a higher priority (a mock upstream, a private endpoint, a proxy), not a setting.
     * Both paths send the session's credential to the host returned (an OAuth bearer token, or the key's API key), without
     * TLS over `ws://`. The token does not depend on the URL: the auth clients on both paths ask for the `cloud-platform`
     * scope, so `google-auth-library` fetches an access token and never makes the URL its audience.
     *
     * @param credentials The session's key, checked.
     * @param location The session's location, checked; `null` for an API key on Google's global route.
     * @returns A `wss://` URL, or `ws://` for a host without TLS, that ends in the socket path. A bridged session fails on
     *   a moved URL the SDK cannot open as given: one without the socket path at its end, or with a user, a query or a
     *   fragment.
     */
    protected LiveUrl(credentials: VertexAICredentials, location: string | null): string {
        return GeminiEnterpriseRealtime.defaultLiveUrl(credentials, location);
    }

    /**
     * The headers for one upstream open: the key's Google Cloud API key as `x-goog-api-key`, as `@google/genai` sends it
     * in Vertex mode; else a bearer token, minted (or taken from the library's cache) now.
     */
    private async upstreamHeaders(url: string): Promise<Record<string, string>> {
        const credentials = this.requireCredentials();
        if (credentials.apiKey) {
            return { [API_KEY_HEADER]: credentials.apiKey };
        }
        if (!this.tokenProvider) {
            this.tokenProvider = new VertexAccessTokenProvider(credentials, this.keySource, (options) => this.CreateGoogleAuth(options));
        }
        return this.tokenProvider.GetRequestHeaders(url);
    }

    /** The bridged sessions' client, built once; a build that fails (an unreadable key file) is retried next time. */
    private ensureVertexClient(): Promise<GeminiEnterpriseLiveClient> {
        if (!this.vertexClient) {
            const building = this.buildVertexClient(this.requireCredentials());
            this.vertexClient = building;
            building.catch(() => {
                if (this.vertexClient === building) {
                    this.vertexClient = null;
                }
            });
        }
        return this.vertexClient;
    }

    private async buildVertexClient(credentials: VertexAICredentials): Promise<GeminiEnterpriseLiveClient> {
        const options: GoogleGenAIOptions = { ...(await VertexGenAIOptions(credentials, this.keySource)), httpOptions: this.liveHttpOptions(credentials) };
        return this.CreateVertexClient(options);
    }

    /**
     * The credentials, or the reason they cannot be used: a key that cannot be read, or one that names a key file or a
     * Live host without being the environment key (refused here, at the mint or the start, never later in the relay).
     */
    private requireCredentials(): VertexAICredentials {
        if (!this.credentials) {
            throw new Error(`${DRIVER_CLASS} cannot open a session: its Vertex AI key ${this.credentialsProblem ?? 'is missing'}.`);
        }
        try {
            AssertVertexKeyFileAllowed(this.credentials, this.keySource);
            AssertVertexLiveHostAllowed(this.credentials, this.keySource);
        } catch (error: unknown) {
            const problem = error instanceof VertexCredentialsError ? error.Problem : null;
            const advice = problem === 'key-file-not-allowed' ? ' Use an inline service account or Application Default Credentials.' : '';
            throw new Error(`${DRIVER_CLASS} cannot open a session: its Vertex AI key ${problem ? CREDENTIALS_PROBLEMS[problem] : 'is not usable'}.${advice}`);
        }
        return this.credentials;
    }

    /** Reads the key without throwing; the problem is described without quoting the key. */
    private static readCredentials(credentialsJson: string): { Credentials: VertexAICredentials | null; Problem: string | null } {
        try {
            return { Credentials: ParseVertexAICredentials(credentialsJson), Problem: null };
        } catch (error: unknown) {
            const problem = error instanceof VertexCredentialsError ? CREDENTIALS_PROBLEMS[error.Problem] : 'is not a JSON object';
            return { Credentials: null, Problem: problem };
        }
    }

    /**
     * The session's location, checked; `null` for a Google Cloud API key on Google's global route (no project), which names
     * none: `@google/genai` sends such a key to Google's global endpoint with the model's short name.
     */
    private static sessionLocation(credentials: VertexAICredentials): string | null {
        return credentials.apiKey && !credentials.project ? null : GeminiEnterpriseRealtime.checkedLocation(credentials.location);
    }

    /** A Google Cloud API key with a project: the regional route (the location's host and the model's full name). */
    private static usesRegionalApiKey(credentials: VertexAICredentials): boolean {
        return Boolean(credentials.apiKey && credentials.project);
    }

    /** Where the relay's setup names the model: under the key's project and location, or by its short name on the global route. */
    private static setupTarget(credentials: VertexAICredentials, model: string, location: string | null): GeminiLiveSetupTarget {
        return location === null
            ? { Endpoint: 'enterprise', Model: model, UsesApiKey: true }
            : { Endpoint: 'enterprise', Model: model, Project: credentials.project, Location: location };
    }

    /**
     * The location, checked: one that cannot be a host name part throws; one where Google does not document Gemini 3.8
     * Live gets one warning, since Google refuses the session at setup if the model is not served there.
     */
    private static checkedLocation(location: string | undefined): string {
        const value = location ?? '';
        if (!LOCATION_PATTERN.test(value)) {
            throw new Error(`${DRIVER_CLASS}: "${value}" is not a Google Cloud location (for example us-central1, us or eu).`);
        }
        if (!DOCUMENTED_LIVE_LOCATIONS.has(value)) {
            console.warn(
                `[${DRIVER_CLASS}] Location "${value}" is not one where Google documents Gemini 3.8 Live (us, eu, us-central1); ` +
                    'Google refuses the session at setup if the model is not served there.'
            );
        }
        return value;
    }

    /**
     * The session's location as `sessionLocation` returns it, without checking or warning again: a bridged session's
     * client is built after `StartSession` has checked it.
     */
    private static liveLocation(credentials: VertexAICredentials): string | null {
        return credentials.apiKey && !credentials.project ? null : credentials.location ?? null;
    }

    /**
     * The default {@link LiveUrl}: on the key's `liveHost` when it names one, else on the host `@google/genai` picks for
     * the location (Google's global host for an API key without one); with the key's `liveApiVersion`, else `v1`.
     */
    private static defaultLiveUrl(credentials: VertexAICredentials, location: string | null): string {
        const host = credentials.liveHost ?? (location === null ? GLOBAL_VERTEX_HOST : GeminiEnterpriseRealtime.locationHost(location));
        const version = credentials.liveApiVersion ?? VERTEX_LIVE_API_VERSION;
        return `wss://${host}/ws/google.cloud.aiplatform.${version}.LlmBidiService/BidiGenerateContent`;
    }

    /** The Vertex AI host `@google/genai` picks for a location. */
    private static locationHost(location: string): string {
        if (location === 'global') {
            return GLOBAL_VERTEX_HOST;
        }
        return MULTI_REGION_LOCATIONS.has(location) ? `aiplatform.${location}.rep.googleapis.com` : `${location}-aiplatform.googleapis.com`;
    }

    /**
     * The bridged client's HTTP options. For a {@link LiveUrl} a subclass moved: the base URL and API version from which
     * the SDK opens that same URL. Else the key's `liveApiVersion` (else `v1`) and, as the base URL, the key's `liveHost`,
     * or the location's host for an API key on the regional route (in API-key mode the SDK would pick the global host).
     * With neither there is no base URL, and the SDK picks the location's host itself.
     */
    private liveHttpOptions(credentials: VertexAICredentials): LiveHttpOptions {
        const moved = this.movedLiveHttpOptions(credentials);
        if (moved) {
            return moved;
        }
        const apiVersion = credentials.liveApiVersion ?? VERTEX_LIVE_API_VERSION;
        const baseUrl = GeminiEnterpriseRealtime.keyLiveBaseUrl(credentials);
        return baseUrl ? { apiVersion, baseUrl } : { apiVersion };
    }

    /**
     * The SDK options of a {@link LiveUrl} a subclass moved, or `null` while it returns the default. Comparing with the
     * default keeps the options of a driver no subclass moved exactly as they were: without a base URL, the SDK applies
     * its own defaults.
     */
    private movedLiveHttpOptions(credentials: VertexAICredentials): LiveHttpOptions | null {
        const location = GeminiEnterpriseRealtime.liveLocation(credentials);
        const liveUrl = this.LiveUrl(credentials, location);
        return liveUrl === GeminiEnterpriseRealtime.defaultLiveUrl(credentials, location) ? null : GeminiEnterpriseRealtime.sdkLiveHttpOptions(liveUrl);
    }

    /** The bridged base URL the key names: its `liveHost`, or the location's host for an API key on the regional route. */
    private static keyLiveBaseUrl(credentials: VertexAICredentials): string | null {
        const host =
            credentials.liveHost ??
            (GeminiEnterpriseRealtime.usesRegionalApiKey(credentials) ? GeminiEnterpriseRealtime.locationHost(credentials.location ?? '') : null);
        return host ? `https://${host}` : null;
    }

    /**
     * The `@google/genai` options that open a Live socket URL as given. The SDK writes
     * `/ws/google.cloud.aiplatform.<apiVersion>.LlmBidiService/BidiGenerateContent` after its base URL, so the base URL
     * is everything before that path (scheme, host, port and path prefix), over `http` for a `ws://` URL and `https` for
     * `wss://` (the SDK opens `ws` from `http` and `wss` from anything else), and the API version is the one the path
     * names.
     *
     * @throws When the URL cannot be read, or the SDK cannot open it as given: it does not end in the socket path; it has
     *   a query or a fragment, which the SDK cannot keep, since it writes the socket path after its whole base URL; it has
     *   a user or password, which `ws` would send as a second credential; or its scheme is not ws, wss, http or https. No
     *   message quotes the URL, since a URL can carry a key.
     */
    private static sdkLiveHttpOptions(liveUrl: string): LiveHttpOptions {
        let url: URL;
        try {
            url = new URL(liveUrl);
        } catch {
            throw new Error(`${DRIVER_CLASS}: its Live URL (LiveUrl) is not a URL.`);
        }
        const socket = LIVE_SOCKET_PATH.exec(url.pathname);
        if (!socket || !LIVE_URL_SCHEMES.has(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new Error(
                `${DRIVER_CLASS}: a bridged session cannot open its Live URL (LiveUrl) as given: @google/genai opens a ws:// or ` +
                    'wss:// URL that ends in /ws/google.cloud.aiplatform.<version>.LlmBidiService/BidiGenerateContent and has no user, query or fragment.'
            );
        }
        const [, pathPrefix, apiVersion] = socket;
        const scheme = url.protocol === 'ws:' || url.protocol === 'http:' ? 'http' : 'https';
        return { apiVersion, baseUrl: `${scheme}://${url.host}${pathPrefix}` };
    }

    /**
     * The config the browser passes to `live.connect`. The relay writes the setup and reads only two things from the
     * browser's: a resumption handle and a request for audio only. So the browser states the response modalities (the
     * web SDK would fill AUDIO, which the relay reads as a downgrade) and, for its log, the avatar's name; never the system
     * prompt, the tools or anything else.
     */
    private static browserConnectConfig(config: LiveConnectConfig): LiveConnectConfig {
        const browser: LiveConnectConfig = { responseModalities: config.responseModalities ?? [Modality.AUDIO] };
        const avatarName = config.avatarConfig?.avatarName;
        if (avatarName) {
            browser.avatarConfig = { avatarName };
        }
        return browser;
    }
}
