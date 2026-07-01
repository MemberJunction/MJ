/**
 * @fileoverview Production clients behind the Teams binding seams — the **Microsoft Graph
 * cloud-communications control plane** ({@link RealGraphCallsClient} over `@microsoft/microsoft-graph-client`)
 * and the **ACS application-hosted-media audio plane** ({@link PumpBackedAcsMedia} over a server-owned
 * per-call audio pump).
 *
 * ## Why this split (mirrors the Twilio REST / Media-Streams split)
 * Just like the Twilio binding — REST in-package ({@link import('./real-twilio-bindings')}) and the
 * bidirectional Media-Streams **websocket** owned by the MJAPI ingress — the Teams binding splits along the
 * same line:
 *  - The **Graph control plane** (`POST /communications/calls`, roster, chat, mute, hangup) is a request/
 *    response REST surface this package can drive directly. {@link RealGraphCallsClient} implements
 *    {@link IGraphCallsLike} over `@microsoft/microsoft-graph-client`.
 *  - The **ACS audio plane** (per-participant inbound PCM + the bot's outbound PCM) is a long-lived
 *    application-hosted-media socket. That socket is a **server** concern (it spans the whole call and the
 *    `ws` / native-media dependency lives in MJServer), so this package exposes the {@link IAcsMediaPump}
 *    seam and a tiny {@link PumpBackedAcsMedia} adapter the server's per-call registry feeds — exactly as
 *    `ITwilioMediaPump` + the server's `TwilioCallMediaRegistry` do for telephony.
 *
 * ## Optional peer SDK (CLAUDE rule 8, category 2)
 * `@microsoft/microsoft-graph-client` is an OPTIONAL PEER SDK — NEVER statically imported, so this provider
 * package builds and unit-tests with no Graph install and no network. It is lazily loaded (once, memoized)
 * at first use via the injectable {@link GraphModuleLoader}; tests inject a fake factory. None of the Graph
 * SDK's own types leak past this file — everything crosses the seam through the minimal structural interfaces
 * below, keeping {@link RealTeamsBindings} SDK-agnostic. The package declares it in `optionalDependencies`.
 *
 * @module @memberjunction/ai-bridge-teams
 * @author MemberJunction.com
 * @see {@link IGraphCallsLike} / {@link IAcsMediaLike} — the seams these implement.
 * @see `/plans/realtime/bridges-and-widget/meeting-vendor-bindings-teams-slack.md` §2 (M1 A).
 */

import type {
    GraphCallParticipant,
    GraphCreateCallRequest,
    GraphCreateCallResult,
    IGraphCallsLike,
    IAcsMediaLike,
    AcsInboundAudioFrame,
} from './real-teams-bindings';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal structural shapes of the `@microsoft/microsoft-graph-client` surface we
// touch. Declared here so the Graph SDK's real types never leak into the package
// and tests can inject a fake. The real `Client` exposes a fluent `api(path)`
// request builder; we use only `post` / `get` / `delete`.
// ──────────────────────────────────────────────────────────────────────────────

/** One fluent Graph request (`client.api(path)`) — the subset of verbs we issue. */
export interface GraphRequestLike {
    /** Issues `POST {path}` with a JSON body; resolves the parsed response. */
    post(body: unknown): Promise<unknown>;
    /** Issues `GET {path}`; resolves the parsed response. */
    get(): Promise<unknown>;
    /** Issues `DELETE {path}`; resolves when the resource is removed. */
    delete(): Promise<unknown>;
}

/** The constructed Graph client surface — just the `api(path)` request-builder entry point. */
export interface GraphClientLike {
    /** Begins a fluent request against a Graph resource path (e.g. `/communications/calls`). */
    api(path: string): GraphRequestLike;
}

/**
 * The `@microsoft/microsoft-graph-client` module surface we use: the `Client.init({ authProvider })`
 * static factory. Declared structurally so the SDK's real `Client` type never leaks.
 */
export interface GraphModuleLike {
    /** The `Client` class with its `init` static factory. */
    Client: {
        /** Constructs an authenticated Graph client from an auth-provider callback. */
        init(options: GraphClientInitOptions): GraphClientLike;
    };
}

/** The `Client.init` options subset we pass — just the bearer-token `authProvider` callback. */
export interface GraphClientInitOptions {
    /**
     * The Graph auth-provider callback. The SDK invokes it for each request and expects the bearer access
     * token (string) via the supplied `done(error, token)` continuation.
     */
    authProvider(done: (error: Error | null, accessToken: string | null) => void): void;
}

/** Loads the `@microsoft/microsoft-graph-client` module. Overridable in tests; defaults to a lazy dynamic import. */
export type GraphModuleLoader = () => Promise<GraphModuleLike>;

/** Credentials {@link RealGraphCallsClient} authenticates Graph with. Resolved upstream via MJ config — never inlined. */
export interface GraphCallsClientCredentials {
    /** A pre-resolved OAuth bearer / application token for the bot's Graph calls (resolved upstream). */
    AccessToken: string;
    /** The Azure tenant id the bot operates in (carried for diagnostics + cross-tenant joins). */
    TenantId?: string;
    /** The bot's Azure AD application (client) id (carried for diagnostics). */
    AppId?: string;
}

/**
 * Lazily loads the `@microsoft/microsoft-graph-client` module exactly once and memoizes it. A static import
 * is impossible here (optional peer SDK, may be uninstalled in non-Teams deployments); the
 * `optionalDependencies` entry keeps it in the dependency graph (CLAUDE rule 8, category 2 — optional peer
 * SDK loaded only when the Teams provider is configured).
 */
export const defaultGraphModuleLoader: GraphModuleLoader = async (): Promise<GraphModuleLike> => {
    try {
        const mod: unknown = await import('@microsoft/microsoft-graph-client');
        const resolved = unwrapGraphModule(mod);
        if (!isGraphModule(resolved)) {
            throw new Error('the @microsoft/microsoft-graph-client module did not export a Client.init factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "RealGraphCallsClient could not load the '@microsoft/microsoft-graph-client' SDK. Install it in the " +
                'deployment that runs the Teams meeting bridge (it is an optional peer dependency). ' +
                `Underlying error: ${message}`,
        );
    }
};

/** Unwraps the Graph module from CJS/ESM interop (`module` or `module.default`). */
function unwrapGraphModule(mod: unknown): unknown {
    if (isGraphModule(mod)) {
        return mod;
    }
    if (mod && typeof mod === 'object' && 'default' in mod) {
        const inner = (mod as { default: unknown }).default;
        if (isGraphModule(inner)) {
            return inner;
        }
    }
    return mod;
}

/** Structural guard: a value is a {@link GraphModuleLike} when it exposes a `Client.init` function. */
function isGraphModule(value: unknown): value is GraphModuleLike {
    if (value == null || typeof value !== 'object') {
        return false;
    }
    const client = (value as { Client?: { init?: unknown } }).Client;
    return client != null && typeof client.init === 'function';
}

/**
 * A real {@link IGraphCallsLike} over the Microsoft Graph cloud-communications REST API
 * (`@microsoft/microsoft-graph-client`).
 *
 * - `CreateCall`           → `POST /communications/calls` with an app-hosted-media join-by-URL body; reads
 *                            the created call id + the bot participant id from the response.
 * - `DeleteCall`           → `DELETE /communications/calls/{id}` (the bot's call-leg hangup).
 * - `GetParticipants`      → `GET /communications/calls/{id}/participants`; maps each to {@link GraphCallParticipant}.
 * - `PostChatMessage`      → `POST /chats/{threadId}/messages` against the meeting thread.
 * - `MuteParticipant`      → `POST /communications/calls/{id}/participants/{pid}/mute`.
 * - `OnParticipantsUpdated`/`OnCallEnded` → arrive over the Graph change-notification **webhook** (the MJAPI
 *                            ingress), not a client subscription; this REST client retains the handlers so the
 *                            ingress can drive them via {@link DriveParticipantsUpdated} / {@link DriveCallEnded}.
 *
 * The constructed Graph client is built once on first use and reused for the life of the instance.
 */
export class RealGraphCallsClient implements IGraphCallsLike {
    private readonly credentials: GraphCallsClientCredentials;
    private readonly loadModule: GraphModuleLoader;
    /** Memoized client-build promise so concurrent callers share one construction. */
    private clientPromise?: Promise<GraphClientLike>;

    /** Retained webhook handlers, keyed by call id — driven by the MJAPI Graph-notification ingress. */
    private readonly participantsHandlers = new Map<string, (participants: GraphCallParticipant[]) => void>();
    private readonly endedHandlers = new Map<string, () => void>();

    /**
     * @param credentials Resolved Graph credentials (bearer token + tenant/app ids).
     * @param loadModule The Graph module loader (defaults to the lazy dynamic import).
     */
    constructor(credentials: GraphCallsClientCredentials, loadModule: GraphModuleLoader = defaultGraphModuleLoader) {
        this.credentials = credentials;
        this.loadModule = loadModule;
    }

    /** @inheritdoc */
    public async CreateCall(request: GraphCreateCallRequest): Promise<GraphCreateCallResult> {
        const client = await this.ensureClient();
        const body = buildGraphCallBody(request);
        const response = await client.api('/communications/calls').post(body);
        return readCreateCallResult(response);
    }

    /** @inheritdoc */
    public async DeleteCall(callId: string): Promise<void> {
        const client = await this.ensureClient();
        await client.api(`/communications/calls/${encodeURIComponent(callId)}`).delete();
    }

    /** @inheritdoc */
    public async GetParticipants(callId: string): Promise<GraphCallParticipant[]> {
        const client = await this.ensureClient();
        const response = await client.api(`/communications/calls/${encodeURIComponent(callId)}/participants`).get();
        return readParticipantsCollection(response);
    }

    /** @inheritdoc */
    public async PostChatMessage(threadId: string, text: string): Promise<void> {
        const client = await this.ensureClient();
        await client.api(`/chats/${encodeURIComponent(threadId)}/messages`).post({ body: { content: text } });
    }

    /** @inheritdoc */
    public async MuteParticipant(callId: string, participantId: string): Promise<void> {
        const client = await this.ensureClient();
        await client
            .api(`/communications/calls/${encodeURIComponent(callId)}/participants/${encodeURIComponent(participantId)}/mute`)
            .post({});
    }

    /** @inheritdoc — retains the handler; the MJAPI Graph-notification ingress drives it via {@link DriveParticipantsUpdated}. */
    public OnParticipantsUpdated(callId: string, handler: (participants: GraphCallParticipant[]) => void): void {
        this.participantsHandlers.set(callId, handler);
    }

    /** @inheritdoc — retains the handler; the MJAPI Graph-notification ingress drives it via {@link DriveCallEnded}. */
    public OnCallEnded(callId: string, handler: () => void): void {
        this.endedHandlers.set(callId, handler);
    }

    /**
     * Drives the retained `participantsUpdated` handler for a call from a Graph change notification (called by
     * the MJAPI ingress — Graph delivers roster changes over the webhook, not a client subscription).
     */
    public DriveParticipantsUpdated(callId: string, participants: GraphCallParticipant[]): void {
        this.participantsHandlers.get(callId)?.(participants);
    }

    /** Drives the retained `callEnded` handler for a call from a Graph change notification (called by the MJAPI ingress). */
    public DriveCallEnded(callId: string): void {
        this.endedHandlers.get(callId)?.();
    }

    /** Builds (once) and returns the constructed Graph client with the bot's bearer-token auth provider. */
    private ensureClient(): Promise<GraphClientLike> {
        if (!this.clientPromise) {
            this.clientPromise = this.buildClient();
        }
        return this.clientPromise;
    }

    /** Constructs the Graph client, supplying the resolved bot bearer token via the SDK's `authProvider` callback. */
    private async buildClient(): Promise<GraphClientLike> {
        const mod = await this.loadModule();
        const token = this.credentials.AccessToken;
        if (!token) {
            throw new Error('RealGraphCallsClient requires a resolved AccessToken (the bot bearer token).');
        }
        return mod.Client.init({ authProvider: (done) => done(null, token) });
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure Graph request/response mapping — isolated from I/O so it unit-tests directly
// and the structural Graph shapes never leak. NO Graph SDK types.
// ──────────────────────────────────────────────────────────────────────────────

/** The Graph `POST /communications/calls` body subset we construct for a join-by-URL app-hosted-media bot call. */
export interface GraphCallPostBody {
    '@odata.type': '#microsoft.graph.call';
    callbackUri?: string;
    mediaConfig: { '@odata.type': '#microsoft.graph.appHostedMediaConfig' };
    chatInfo: { '@odata.type': '#microsoft.graph.chatInfo'; threadId: string };
    meetingInfo: { '@odata.type': '#microsoft.graph.joinMeetingIdMeetingInfo' | '#microsoft.graph.organizerMeetingInfo'; joinWebUrl?: string };
    tenantId?: string;
}

/**
 * **Pure** mapping of the bridge's {@link GraphCreateCallRequest} onto the Graph call POST body. Isolated so
 * the request shape unit-tests directly and the live client reuses it verbatim.
 */
export function buildGraphCallBody(request: GraphCreateCallRequest): GraphCallPostBody {
    return {
        '@odata.type': '#microsoft.graph.call',
        mediaConfig: { '@odata.type': '#microsoft.graph.appHostedMediaConfig' },
        chatInfo: { '@odata.type': '#microsoft.graph.chatInfo', threadId: request.ThreadId },
        meetingInfo: { '@odata.type': '#microsoft.graph.joinMeetingIdMeetingInfo', joinWebUrl: request.JoinWebUrl },
        ...(request.TenantId ? { tenantId: request.TenantId } : {}),
    };
}

/** Reads the `{ id, myParticipantId }` of the created call out of the Graph response, without leaking SDK types. */
export function readCreateCallResult(response: unknown): GraphCreateCallResult {
    const obj = asRecord(response);
    const callId = readString(obj?.id);
    if (!callId) {
        throw new Error('Graph POST /communications/calls returned no call id.');
    }
    const botParticipantId = readString(obj?.myParticipantId) ?? callId;
    return { CallId: callId, BotParticipantId: botParticipantId };
}

/** Reads a Graph participants-collection response (`{ value: [...] }`) into {@link GraphCallParticipant}s. */
export function readParticipantsCollection(response: unknown): GraphCallParticipant[] {
    const obj = asRecord(response);
    const value = obj?.value;
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map(readGraphParticipant);
}

/** Reads one Graph participant resource into the bridge's {@link GraphCallParticipant} shape. */
export function readGraphParticipant(raw: unknown): GraphCallParticipant {
    const p = asRecord(raw);
    const info = asRecord(p?.info);
    const identity = asRecord(info?.identity);
    const user = asRecord(identity?.user);
    const mediaStreams = Array.isArray(p?.mediaStreams) ? p?.mediaStreams : undefined;
    return {
        id: readString(p?.id) ?? '',
        displayName: readString(user?.displayName),
        role: readString(p?.role) ?? readString(p?.meetingRole),
        // Graph marks the bot leg via `isMuted`/`isInLobby` flags; `info.identity.application` distinguishes
        // an application identity (the bot) from a `user` identity.
        isSelf: identity?.application != null && mediaStreams != null,
    };
}

/** Narrows an unknown value to a record, or `undefined`. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/** Reads a value as a non-empty string, or `undefined`. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ──────────────────────────────────────────────────────────────────────────────
// ACS application-hosted-media audio plane — server-owned (like the Twilio media
// pump). The package exposes the seam; the MJServer per-call registry implements it.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The server-owned per-call audio pump the ACS application-hosted-media plane runs on — the analogue of
 * `ITwilioMediaPump` for telephony. The long-lived ACS audio socket is a server concern (it spans the whole
 * call and the native-media / `ws` dependency lives in MJServer), so this seam lets the in-package binding
 * push the bot's outbound PCM and register for inbound per-participant PCM without ever owning the socket.
 * Production wires it over the server's per-call ACS media registry; tests inject a fake.
 */
export interface IAcsMediaPump {
    /** The ACS audio-socket sample rate in Hz (e.g. 16000) — drives T0 resampling in {@link RealTeamsBindings}. */
    readonly SampleRate: number;
    /** Sends one outbound PCM16 frame on the bot's outbound audio socket for the call (the agent's voice). */
    Send(callId: string, pcm: ArrayBuffer): void;
    /** Registers the inbound per-participant audio handler for the call's socket (latest handler wins). */
    OnFrame(callId: string, handler: (frame: AcsInboundAudioFrame) => void): void;
    /**
     * Registers the raised-hand handler for the call when the platform/registry surfaces it. **Optional** —
     * absence is tolerated by {@link RealTeamsBindings} (the handler simply never fires).
     */
    OnHandRaise?(callId: string, handler: (participantId: string, raised: boolean) => void): void;
}

/**
 * Adapts the server-owned per-call {@link IAcsMediaPump} to the call-scoped {@link IAcsMediaLike} surface
 * {@link RealTeamsBindings} drives. The binding supplies the Graph **call id** on every per-frame call (it
 * resolves the id at `join()` and threads it through), so this adapter routes each call straight onto the
 * shared pump keyed by that id — no call-id needs to be known at construction. Mirrors how
 * `TwilioCallMediaRegistry` backs the telephony media seam.
 */
export class PumpBackedAcsMedia implements IAcsMediaLike {
    private readonly pump: IAcsMediaPump;

    /**
     * @param pump The server-owned per-call ACS audio pump (keyed by Graph call id).
     */
    constructor(pump: IAcsMediaPump) {
        this.pump = pump;
    }

    /** @inheritdoc */
    public get SampleRate(): number {
        return this.pump.SampleRate;
    }

    /** @inheritdoc — routes to the pump keyed by the call id the binding supplies. */
    public SendAudioFrame(callId: string, pcm: ArrayBuffer): void {
        this.pump.Send(callId, pcm);
    }

    /** @inheritdoc — routes to the pump keyed by the call id the binding supplies. */
    public OnAudioFrame(callId: string, handler: (frame: AcsInboundAudioFrame) => void): void {
        this.pump.OnFrame(callId, handler);
    }

    /** @inheritdoc — only wires hand-raise when the underlying pump exposes it (tolerated absence). */
    public OnHandRaise(callId: string, handler: (participantId: string, raised: boolean) => void): void {
        this.pump.OnHandRaise?.(callId, handler);
    }
}
