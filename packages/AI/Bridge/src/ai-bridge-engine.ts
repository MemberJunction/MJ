import {
    IMetadataProvider,
    IStartupSink,
    UserInfo,
    LogError,
    LogStatus,
    RunView,
    RegisterForStartup,
} from '@memberjunction/core';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import {
    IRealtimeSession,
    RealtimeTranscript,
} from '@memberjunction/ai';
import {
    MJAIBridgeProviderEntity,
    MJAIBridgeAgentIdentityEntity,
    MJAIBridgeProviderChannelEntity,
    MJAIAgentSessionBridgeEntity,
    MJAIAgentSessionBridgeParticipantEntity,
} from '@memberjunction/core-entities';
import {
    AIBridgeEngineBase,
    BaseRealtimeBridge,
    BridgeMediaFrame,
    BridgeMediaTrackKind,
    BridgeParticipantInfo,
    BridgeDisconnectReason,
    RealtimeBridgeContext,
    TurnTakingPolicy,
    TurnTakingPolicyConfig,
    TurnTranscriptSegment,
    BridgeTurnMode,
    IAddressedMatcher,
    IWorthSayingScorer,
    IBridgeChannelHost,
    BridgeChannelToolDefinition,
    BridgeChannelToolResult,
} from '@memberjunction/ai-bridge-base';

/**
 * Entity names — centralised so the `MJ:`-prefix convention is applied in exactly one place.
 */
const SESSION_BRIDGE_ENTITY = 'MJ: AI Agent Session Bridges';
const SESSION_BRIDGE_PARTICIPANT_ENTITY = 'MJ: AI Agent Session Bridge Participants';

/**
 * The host-instance identity provider the engine uses to stamp `HostInstanceID` for node affinity
 * and orphan reconciliation. Mirrors `@memberjunction/server`'s `HostInstance` helper but is
 * **injected** so this server-tier engine has no hard dependency on MJServer (which would create a
 * layering inversion) and so tests can supply a deterministic identity.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §10 (host affinity + janitor).
 */
export interface IHostInstanceIdentity {
    /** Returns this process's stable host-instance identity (`hostname:pid:bootId`). */
    GetHostInstanceID(): string;

    /** Returns the host-name prefix (`hostname:`) matching ANY boot of this OS host. */
    GetHostNamePrefix(): string;
}

/**
 * A default {@link IHostInstanceIdentity} for standalone use (and a sane fallback when the host
 * application does not inject one). Generates a stable `unknown-host:pid:bootId` identity at module
 * load. Production hosts (MJServer) inject the real `HostInstance` helper so the janitor's host
 * affinity matches across the whole deployment.
 */
export class DefaultHostInstanceIdentity implements IHostInstanceIdentity {
    private readonly hostName: string;
    private readonly instanceId: string;

    constructor() {
        const pid = typeof process !== 'undefined' && process.pid ? process.pid : 0;
        // A cheap, dependency-free random boot id; good enough for the fallback path.
        const bootId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        this.hostName = 'unknown-host';
        this.instanceId = `${this.hostName}:${pid}:${bootId}`;
    }

    /** @inheritdoc */
    public GetHostInstanceID(): string {
        return this.instanceId;
    }

    /** @inheritdoc */
    public GetHostNamePrefix(): string {
        return `${this.hostName}:`;
    }
}

/**
 * Parameters for {@link AIBridgeEngine.StartBridgeSession}.
 *
 * The engine does NOT construct the realtime model — the caller injects the already-open
 * {@link IRealtimeSession} (or a session factory) so the engine stays testable without a real
 * provider and so the realtime model's lifecycle stays owned by the agent/session layer above.
 */
export interface StartBridgeSessionParams {
    /** The `MJ: AI Agent Sessions` row this bridge attaches to (the session IS the existing session). */
    AgentSessionID: string;

    /** The bridge provider to transport through (resolved to its `DriverClass` for ClassFactory). */
    Provider: MJAIBridgeProviderEntity;

    /**
     * The live realtime session the bridge media plane wires to. Injected (not constructed here) so
     * the engine never depends on a concrete realtime provider — the transport seam is the only
     * coupling, and it is to the {@link IRealtimeSession} interface.
     */
    RealtimeSession: IRealtimeSession;

    /**
     * The endpoint address — a meeting join URL/ID (meetings) or a phone number (telephony).
     */
    Address: string;

    /** Connection direction. Defaults to `'Outbound'`. */
    Direction?: 'Inbound' | 'Outbound';

    /** How the agent connected. Defaults to `'OnDemand'`. */
    JoinMethod?: 'InMeetingCommand' | 'InboundRoute' | 'Invite' | 'NativeInvite' | 'OnDemand' | 'Scheduled';

    /**
     * Turn-taking mode for the session. Defaults to `'Passive'` (speak only when addressed). The
     * engine builds a {@link TurnTakingPolicy} from this and {@link StartBridgeSessionParams.TurnMatcher}/
     * {@link StartBridgeSessionParams.TurnScorer}.
     */
    TurnMode?: BridgeTurnMode;

    /**
     * The addressed-matcher for Passive/Hybrid turn-taking (e.g. a {@link RegexAddressedMatcher}
     * built from the agent's name + aliases). Required for Passive/Hybrid to ever speak.
     */
    TurnMatcher?: IAddressedMatcher;

    /** The "worth saying" scorer for Active/Hybrid turn-taking. */
    TurnScorer?: IWorthSayingScorer;

    /** Optional extra turn-taking tuning (silence window, throttle, score threshold, clock). */
    TurnTuning?: Partial<Omit<TurnTakingPolicyConfig, 'Mode' | 'Matcher' | 'Scorer'>>;

    /** Per-session bridge configuration (resolved credential refs, region, …) passed to the driver. */
    Configuration?: Record<string, unknown>;

    /**
     * Optional server-side channel-plane host (Part A — the generic channel wiring). When supplied,
     * the engine starts the session's channels through it at connect, constructs a Meeting Controls
     * channel from the driver's {@link BaseRealtimeBridge.GetMeetingControlsEventSource} (when the
     * driver contributes one), feeds the realtime session's `SendContextNote` perception sink into the
     * channel context, and surfaces the contributed server tools + executor onto the returned
     * {@link ActiveBridgeSession} so the runner-constructing layer binds them to
     * `RealtimeSessionRunner.ServerChannelTools` / `ExecuteServerChannelTool`.
     *
     * Additive and optional: `IRealtimeSession`-only callers (no channel plane) keep working untouched.
     * In production this is an adapter (in `@memberjunction/ai-agents`, which owns `RealtimeChannelServerHost`)
     * over the channel host; here the engine depends only on the {@link IBridgeChannelHost} interface so
     * it takes no heavy dependency on the agents package.
     */
    ChannelHost?: IBridgeChannelHost;

    /** The MJ user the bridge session runs as; every session is owned + audited by a user. */
    ContextUser?: UserInfo;

    /** The request-scoped metadata provider for all entity operations (multi-provider safe). */
    MetadataProvider?: IMetadataProvider;
}

/**
 * The live, in-memory handle for one running bridged session held by the engine. Carries the driver,
 * the wired realtime session, the per-session turn-taking policy, and the persisted bridge row id so
 * teardown can reach all of them.
 */
export interface ActiveBridgeSession {
    /** The `AIAgentSessionBridge` row id (the durable record). */
    SessionBridgeID: string;

    /** The `MJ: AI Agent Sessions` row id the bridge is attached to. */
    AgentSessionID: string;

    /** The concrete driver instance transporting media. */
    Bridge: BaseRealtimeBridge;

    /** The realtime session the driver's media plane is wired to. */
    RealtimeSession: IRealtimeSession;

    /** The per-session turn-taking policy gating generation. */
    TurnPolicy: TurnTakingPolicy;

    /** The provider row backing this session. */
    Provider: MJAIBridgeProviderEntity;

    /** The context user the session runs as (for participant upserts / teardown writes). */
    ContextUser?: UserInfo;

    /** The metadata provider bound to this session's entity operations. */
    MetadataProvider?: IMetadataProvider;

    /**
     * The server-side channel host wired for this session (Part A), or `undefined` when the caller
     * supplied none. Held so teardown can close the session's channels.
     */
    ChannelHost?: IBridgeChannelHost;

    /**
     * The server-executed tool definitions the session's channels contributed at connect (e.g. the
     * Meeting Controls facilitator tools). Empty when no channel host / no contributing channels. The
     * runner-constructing layer registers these as `RealtimeSessionRunner.ServerChannelTools`.
     */
    ServerChannelTools: BridgeChannelToolDefinition[];

    /**
     * Executes ONE server-channel tool call for this session, routed through the channel host. Bound by
     * the runner-constructing layer to `RealtimeSessionRunner.ExecuteServerChannelTool`. `undefined`
     * when no channel host was supplied. Never throws — resolves to a structured failure.
     */
    ExecuteServerChannelTool?: (toolName: string, argsJson: string) => Promise<BridgeChannelToolResult>;
}

/**
 * Server-tier engine for the Realtime Bridge plane — **coordination + execution**.
 *
 * `AIBridgeEngine` **composes** {@link AIBridgeEngineBase} (the metadata-only cache of providers /
 * identities / provider-channels) rather than extending it — exactly mirroring how the server
 * `AIEngine` builds on `AIEngineBase` via containment. The base is itself a `BaseEngine` singleton
 * keyed by class name, so *inheriting* from it would make the startup manager instantiate **two**
 * separate engines (the base AND this subclass), each loading and event-subscribing its own copy of
 * the same caches. Composition keeps exactly **one** `BaseEngine` cache — {@link AIBridgeEngineBase.Instance}
 * — which this engine warms once via {@link HandleStartup} and reads through the delegating accessors
 * below. This server engine then adds everything that actually *runs* a bridged session:
 *
 * - **The transport seam** (Phase 0, the deferred unification): {@link wireTransportSeam} connects
 *   the driver's media plane to the realtime session — inbound `OnMedia` → `SendInput`, outbound
 *   `OnOutput` → `SendMedia`. This is the "no client-facing pipe" gap the realtime guide flagged;
 *   the bridge IS that pipe.
 * - **Bot-session lifecycle** — {@link StartBridgeSession} / {@link StopBridgeSession} drive the
 *   `AIAgentSessionBridge` status state machine (Pending → Connecting → Connected → Disconnected),
 *   stamp `HostInstanceID` for node affinity, and resolve the driver via the `ClassFactory`.
 * - **Participant tracking** — subscribes the driver's roster events (when supported) and upserts
 *   `AIAgentSessionBridgeParticipant` rows.
 * - **Turn-taking integration** — holds a {@link TurnTakingPolicy} per session and feeds diarized
 *   transcript segments through it, acting on the decision (Speak / PostToChat / Silent).
 * - **Janitor scaffold** — {@link ReconcileOrphans} force-closes Connected bridges left by a dead
 *   host, following the `SessionJanitor` shape.
 *
 * The engine never constructs the realtime model: the {@link IRealtimeSession} is injected via
 * {@link StartBridgeSessionParams}, keeping the only coupling the transport seam itself and making
 * the whole engine unit-testable with a mock session + the {@link LoopbackBridge}.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §2 (layer cake), §7 (lifecycle), §10 (security/janitor).
 */
@RegisterForStartup({
    deferred: true,
    deferredDelay: 15000,
    description: 'Server-side AI Bridge Engine (realtime bridge coordination + transport seam)',
})
export class AIBridgeEngine extends BaseSingleton<AIBridgeEngine> implements IStartupSink {
    /** In-memory registry of bridged sessions this process currently hosts, keyed by bridge id (lowercased). */
    private activeSessions = new Map<string, ActiveBridgeSession>();

    /** Host-instance identity provider; injected by the host application or defaulted for standalone use. */
    private hostIdentity: IHostInstanceIdentity = new DefaultHostInstanceIdentity();

    /**
     * The singleton accessor. Keyed by THIS class's name in the Global Object Store (via
     * {@link BaseSingleton}), distinct from {@link AIBridgeEngineBase.Instance} — which this engine
     * composes rather than inherits.
     */
    public static get Instance(): AIBridgeEngine {
        return super.getInstance<AIBridgeEngine>();
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Composed base — the ONE BaseEngine cache. All metadata is read through this.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * The single underlying {@link AIBridgeEngineBase} instance whose `BaseEngine` cache holds the
     * bridge registry (providers / identities / provider-channels). Composed (not inherited) so the
     * startup manager warms exactly one cache. All metadata reads on this engine delegate here.
     */
    protected get Base(): AIBridgeEngineBase {
        return AIBridgeEngineBase.Instance;
    }

    /**
     * Deferred-startup entry point (per {@link IStartupSink}). Warms the ONE composed base cache by
     * delegating to {@link AIBridgeEngineBase.Config}; mirrors `AIEngine.HandleStartup`. No double
     * load — there is only the base's cache to warm.
     *
     * @param contextUser The boot/system user context.
     * @param provider Optional metadata provider override (multi-provider scenarios).
     */
    public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Config(false, contextUser, provider);
    }

    /**
     * Loads (or refreshes) the composed base's bridge metadata cache. Delegates to
     * {@link AIBridgeEngineBase.Config} so the warming path matches `AIEngine`'s shape and there is
     * never a second cache to load. Idempotent — a no-op when already loaded unless `forceRefresh`.
     *
     * @param forceRefresh When `true`, reloads even if already loaded.
     * @param contextUser Required server-side for proper data isolation.
     * @param provider Optional explicit metadata provider (multi-provider scenarios).
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        await this.Base.Config(forceRefresh, contextUser, provider);
    }

    /** Returns `true` once the composed base cache is loaded. */
    public get Loaded(): boolean {
        return this.Base.Loaded;
    }

    // ── Delegated metadata surface (reads the ONE base cache) ──────────────────────

    /** All cached `MJ: AI Bridge Providers` rows. @see AIBridgeEngineBase.Providers */
    public get Providers(): MJAIBridgeProviderEntity[] {
        return this.Base.Providers;
    }

    /** All cached `MJ: AI Bridge Agent Identities` rows. @see AIBridgeEngineBase.AgentIdentities */
    public get AgentIdentities(): MJAIBridgeAgentIdentityEntity[] {
        return this.Base.AgentIdentities;
    }

    /** All cached `MJ: AI Bridge Provider Channels` rows. @see AIBridgeEngineBase.ProviderChannels */
    public get ProviderChannels(): MJAIBridgeProviderChannelEntity[] {
        return this.Base.ProviderChannels;
    }

    /** Resolves a provider by display name. @see AIBridgeEngineBase.ProviderByName */
    public ProviderByName(name: string): MJAIBridgeProviderEntity | undefined {
        return this.Base.ProviderByName(name);
    }

    /** Resolves a provider by `DriverClass`. @see AIBridgeEngineBase.ProviderByDriverClass */
    public ProviderByDriverClass(driverClass: string): MJAIBridgeProviderEntity | undefined {
        return this.Base.ProviderByDriverClass(driverClass);
    }

    /** Resolves an agent identity by its address value. @see AIBridgeEngineBase.IdentityByValue */
    public IdentityByValue(identityValue: string, providerId?: string): MJAIBridgeAgentIdentityEntity | undefined {
        return this.Base.IdentityByValue(identityValue, providerId);
    }

    /** Returns the active identities for an agent. @see AIBridgeEngineBase.IdentitiesForAgent */
    public IdentitiesForAgent(agentId: string, providerId?: string): MJAIBridgeAgentIdentityEntity[] {
        return this.Base.IdentitiesForAgent(agentId, providerId);
    }

    /** Returns a provider's channels ordered by sequence. @see AIBridgeEngineBase.ChannelsForProvider */
    public ChannelsForProvider(providerId: string): MJAIBridgeProviderChannelEntity[] {
        return this.Base.ChannelsForProvider(providerId);
    }

    /** Returns a provider's auto-attach (default) channels. @see AIBridgeEngineBase.DefaultChannelsForProvider */
    public DefaultChannelsForProvider(providerId: string): MJAIBridgeProviderChannelEntity[] {
        return this.Base.DefaultChannelsForProvider(providerId);
    }

    /**
     * Injects the host-instance identity provider used for `HostInstanceID` stamping and janitor
     * affinity. Production hosts (MJServer) call this once at boot with the real `HostInstance`
     * helper; standalone callers can rely on the {@link DefaultHostInstanceIdentity}.
     *
     * @param identity The identity provider to use.
     */
    public SetHostInstanceIdentity(identity: IHostInstanceIdentity): void {
        this.hostIdentity = identity;
    }

    /**
     * The bridged sessions this process currently hosts (read-only snapshot).
     */
    public get ActiveSessions(): ReadonlyArray<ActiveBridgeSession> {
        return Array.from(this.activeSessions.values());
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Lifecycle — start / stop a bridged session.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Starts a bridged session: resolves + connects the driver, drives the bridge row through its
     * status state machine, and **wires the transport seam** between the driver and the injected
     * realtime session.
     *
     * Flow (mirrors the §7 state machine):
     * 1. Create the `AIAgentSessionBridge` row as `Pending`, stamped with this host.
     * 2. Resolve the driver via `ClassFactory.CreateInstance(BaseRealtimeBridge, provider.DriverClass)`.
     * 3. Transition to `Connecting`, build the {@link RealtimeBridgeContext}, call `driver.Connect`.
     * 4. On success: persist the platform handles, transition to `Connected`, wire the transport seam,
     *    wire participant tracking + turn-taking, register the live session.
     * 5. On failure: transition to `Failed` and rethrow.
     *
     * @param params The session parameters (including the injected {@link IRealtimeSession}).
     * @returns The live {@link ActiveBridgeSession} handle.
     * @throws When the driver cannot be resolved or `Connect` fails (the row is stamped `Failed`).
     */
    public async StartBridgeSession(params: StartBridgeSessionParams): Promise<ActiveBridgeSession> {
        const bridgeRow = await this.createBridgeRow(params);

        try {
            // Resolve the driver inside the try so a resolution failure still stamps the row Failed
            // (the row already exists at this point — it must not be left dangling as Pending).
            const driver = this.resolveDriver(params.Provider);
            await this.transitionStatus(bridgeRow, 'Connecting', params);
            const ctx = this.buildBridgeContext(params);
            const result = await driver.Connect(ctx);

            bridgeRow.ExternalConnectionID = result.ExternalConnectionId;
            bridgeRow.BotParticipantID = result.BotParticipantId;
            bridgeRow.ConnectedAt = new Date();
            await this.transitionStatus(bridgeRow, 'Connected', params);

            const turnPolicy = this.buildTurnPolicy(params);
            const active: ActiveBridgeSession = {
                SessionBridgeID: bridgeRow.ID,
                AgentSessionID: params.AgentSessionID,
                Bridge: driver,
                RealtimeSession: params.RealtimeSession,
                TurnPolicy: turnPolicy,
                Provider: params.Provider,
                ContextUser: params.ContextUser,
                MetadataProvider: params.MetadataProvider,
                ChannelHost: params.ChannelHost,
                ServerChannelTools: [],
            };

            this.wireTransportSeam(active);
            this.wireParticipantTracking(active);
            this.wireTurnTaking(active);
            await this.wireChannelPlane(active);

            this.activeSessions.set(bridgeRow.ID.toLowerCase(), active);
            LogStatus(`[AIBridgeEngine] Bridge session ${bridgeRow.ID} connected via ${params.Provider.Name}`);
            return active;
        } catch (err) {
            await this.failBridgeRow(bridgeRow, params, err);
            throw err;
        }
    }

    /**
     * Stops a bridged session: disconnects the driver, tears down the wired listeners, and transitions
     * the bridge row to `Disconnected` with the supplied `CloseReason`. Idempotent — stopping a
     * session this process no longer holds still attempts to reconcile the durable row.
     *
     * @param sessionBridgeID The `AIAgentSessionBridge` row id to stop.
     * @param reason Why the bridge is closing (mirrors `CloseReason`).
     * @param contextUser Required server-side for the durable-row write when the live session is gone.
     * @param provider Required metadata provider when the live session is gone.
     * @returns `true` when the durable row reached a `Disconnected` state.
     */
    public async StopBridgeSession(
        sessionBridgeID: string,
        reason: BridgeDisconnectReason,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<boolean> {
        const key = sessionBridgeID.toLowerCase();
        const active = this.activeSessions.get(key);

        if (active) {
            await this.disconnectDriver(active, reason);
            this.activeSessions.delete(key);
            return this.markBridgeDisconnected(
                sessionBridgeID,
                reason,
                active.ContextUser ?? contextUser,
                active.MetadataProvider ?? provider,
            );
        }

        // Not held by this process — still reconcile the durable row (janitor / cross-host close).
        return this.markBridgeDisconnected(sessionBridgeID, reason, contextUser, provider);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // THE TRANSPORT SEAM — the deferred "unified-transport track" completed here.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Wires the bidirectional media transport seam between a bridge driver and a realtime session —
     * the single piece of code that completes the realtime engine's deferred server-bridged media
     * transport (the guide's "`SendInput`/`OnOutput` have no client-facing pipe" gap). The bridge IS
     * that pipe.
     *
     * Two hooks, one per direction:
     * - **Inbound** (`bridge.OnMedia` → `session.SendInput`): what the agent HEARS. Each inbound
     *   {@link BridgeMediaFrame} from the endpoint is unwrapped to its raw `ArrayBuffer` payload and
     *   streamed straight to the model.
     * - **Outbound** (`session.OnOutput` → `bridge.SendMedia`): what the agent SAYS. Each model
     *   output `ArrayBuffer` is wrapped in an outbound audio {@link BridgeMediaFrame} and sent into
     *   the meeting/call.
     *
     * Audio is the first track lit up, so the outbound direction is wired as `audio-out`; video/screen
     * tracks ride the same `SendMedia` method once the model emits them.
     *
     * @param active The live bridged session whose driver and realtime session are wired together.
     */
    private wireTransportSeam(active: ActiveBridgeSession): void {
        const { Bridge, RealtimeSession } = active;

        // Inbound: endpoint media → the agent hears it.
        Bridge.OnMedia((frame: BridgeMediaFrame) => {
            const chunk = this.frameToArrayBuffer(frame);
            if (chunk) {
                RealtimeSession.SendInput(chunk);
            }
        });

        // Outbound: the agent speaks → into the meeting/call.
        RealtimeSession.OnOutput((chunk: ArrayBuffer) => {
            const track: BridgeMediaTrackKind = 'audio-out';
            Bridge.SendMedia(track, this.arrayBufferToFrame(chunk, track));
        });
    }

    /**
     * Unwraps a {@link BridgeMediaFrame} to the raw `ArrayBuffer` the realtime session consumes,
     * preferring the binary `Bytes` payload and decoding `Base64` when only that is present. Returns
     * `undefined` when the frame carries no payload (defensive — never forwards an empty frame).
     *
     * @param frame The inbound media frame.
     * @returns The raw frame bytes, or `undefined` when the frame has no payload.
     */
    private frameToArrayBuffer(frame: BridgeMediaFrame): ArrayBuffer | undefined {
        if (frame.Bytes) {
            return frame.Bytes;
        }
        if (frame.Base64) {
            return this.decodeBase64(frame.Base64);
        }
        return undefined;
    }

    /**
     * Wraps a raw model-output `ArrayBuffer` in an outbound {@link BridgeMediaFrame} on the given
     * track, using the fast binary payload path.
     *
     * @param chunk The raw output frame from the model.
     * @param track The outbound track to stamp on the frame.
     * @returns The outbound media frame.
     */
    private arrayBufferToFrame(chunk: ArrayBuffer, track: BridgeMediaTrackKind): BridgeMediaFrame {
        return { Track: track, Bytes: chunk, TimestampMs: Date.now() };
    }

    /**
     * Decodes a base64 string into an `ArrayBuffer`. Uses Node's `Buffer` when available (the
     * server tier) and falls back to `atob` otherwise so the seam stays environment-agnostic.
     *
     * @param base64 The base64-encoded payload.
     * @returns The decoded `ArrayBuffer`.
     */
    private decodeBase64(base64: string): ArrayBuffer {
        if (typeof Buffer !== 'undefined') {
            const buf = Buffer.from(base64, 'base64');
            // Copy into a fresh ArrayBuffer (Buffer.buffer is ArrayBufferLike under newer @types/node).
            const out = new Uint8Array(buf.byteLength);
            out.set(buf);
            return out.buffer;
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Participant tracking.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Subscribes the driver's roster-change stream (when the provider supports diarization/roster)
     * and upserts `AIAgentSessionBridgeParticipant` rows on each change. Capability-gated: a driver
     * without roster support throws from `OnParticipantChange`, which is caught and treated as
     * "no participant tracking for this provider" rather than failing the session.
     *
     * @param active The live bridged session to track participants for.
     */
    private wireParticipantTracking(active: ActiveBridgeSession): void {
        if (active.Provider.SupportedFeaturesObject?.SpeakerDiarization !== true) {
            return; // provider metadata says no roster — never call the driver (defense-in-depth gate).
        }
        try {
            active.Bridge.OnParticipantChange((participants: BridgeParticipantInfo[]) => {
                void this.upsertParticipants(active, participants);
            });
        } catch (err) {
            // The driver did not actually implement roster despite the flag — log and continue.
            LogError(
                `[AIBridgeEngine] Participant tracking unavailable for bridge ${active.SessionBridgeID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /**
     * Upserts the supplied participants onto the bridge as `AIAgentSessionBridgeParticipant` rows,
     * matching existing rows by `ExternalParticipantID`. Best-effort: a failed write is logged and
     * never propagates to the live media plane.
     *
     * @param active The live bridged session the participants belong to.
     * @param participants The current roster from the driver.
     */
    private async upsertParticipants(
        active: ActiveBridgeSession,
        participants: BridgeParticipantInfo[],
    ): Promise<void> {
        const provider = active.MetadataProvider;
        if (!provider) {
            return;
        }
        try {
            const existing = await this.loadParticipants(active, provider);
            for (const p of participants) {
                await this.upsertOneParticipant(active, p, existing, provider);
            }
        } catch (err) {
            LogError(
                `[AIBridgeEngine] upsertParticipants failed for bridge ${active.SessionBridgeID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /** Loads the existing participant rows for a bridge, keyed (lowercased) by `ExternalParticipantID`. */
    private async loadParticipants(
        active: ActiveBridgeSession,
        provider: IMetadataProvider,
    ): Promise<Map<string, MJAIAgentSessionBridgeParticipantEntity>> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJAIAgentSessionBridgeParticipantEntity>(
            {
                EntityName: SESSION_BRIDGE_PARTICIPANT_ENTITY,
                ExtraFilter: `SessionBridgeID='${active.SessionBridgeID}'`,
                ResultType: 'entity_object',
            },
            active.ContextUser,
        );
        const map = new Map<string, MJAIAgentSessionBridgeParticipantEntity>();
        if (result.Success) {
            for (const row of result.Results) {
                if (row.ExternalParticipantID) {
                    map.set(row.ExternalParticipantID.toLowerCase(), row);
                }
            }
        }
        return map;
    }

    /** Inserts a new participant row or updates the matched existing one in place. */
    private async upsertOneParticipant(
        active: ActiveBridgeSession,
        p: BridgeParticipantInfo,
        existing: Map<string, MJAIAgentSessionBridgeParticipantEntity>,
        provider: IMetadataProvider,
    ): Promise<void> {
        const key = p.ExternalId.toLowerCase();
        let row = existing.get(key);
        if (!row) {
            row = await provider.GetEntityObject<MJAIAgentSessionBridgeParticipantEntity>(
                SESSION_BRIDGE_PARTICIPANT_ENTITY,
                active.ContextUser,
            );
            row.NewRecord();
            row.SessionBridgeID = active.SessionBridgeID;
            row.ExternalParticipantID = p.ExternalId;
            row.JoinedAt = new Date();
            existing.set(key, row);
        }
        row.DisplayName = p.DisplayName ?? null;
        row.Role = p.Role;
        row.IsAgent = p.IsAgent;
        const saved = await row.Save();
        if (!saved) {
            LogError(
                `[AIBridgeEngine] participant upsert save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Turn-taking integration.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Wires the session's turn-taking policy to its inbound transcript stream. Each diarized
     * transcript segment is fed to {@link TurnTakingPolicy.EvaluateTurn} and the decision is acted
     * on: `Speak` lets the realtime session take the floor (via {@link IRealtimeSession.RequestSpokenUpdate}
     * when available, else a context note), `PostToChat` is delegated to the bridge chat path
     * (currently a documented hook), and `Silent` does nothing.
     *
     * Only the realtime session's *user* transcripts drive turn-taking — assistant transcripts are
     * the agent's own speech and would otherwise self-trigger.
     *
     * @param active The live bridged session.
     */
    private wireTurnTaking(active: ActiveBridgeSession): void {
        active.RealtimeSession.OnTranscript((t: RealtimeTranscript) => {
            if (t.Role !== 'user' || !t.IsFinal) {
                return; // act only on a completed human turn
            }
            const segment: TurnTranscriptSegment = {
                Text: t.Text,
                IsAgent: false,
                EndMs: Date.now(),
            };
            const decision = active.TurnPolicy.EvaluateTurn({ Segment: segment });
            this.applyTurnDecision(active, decision.Action);
        });
    }

    /**
     * Acts on a turn-taking decision. Kept behind the injected {@link IRealtimeSession} interface so
     * the actual model trigger stays the session's concern and the engine remains testable.
     *
     * @param active The live bridged session.
     * @param action The decided action (`Speak` / `PostToChat` / `Silent`).
     */
    private applyTurnDecision(active: ActiveBridgeSession, action: 'Speak' | 'PostToChat' | 'Silent'): void {
        switch (action) {
            case 'Speak':
                // Let the session respond. Prefer an instructed spoken update when the provider
                // supports it; otherwise the inbound media already reached the model and it will
                // respond on its own turn — nothing further to force.
                if (active.RealtimeSession.RequestSpokenUpdate) {
                    active.RealtimeSession.RequestSpokenUpdate('Respond to the participant who just addressed you.');
                }
                break;
            case 'PostToChat':
                // Bridge chat is a Phase 2 channel surface; the hook is here so the wiring is complete.
                // A chat-capable driver/channel will consume this once the server-side channel plane lands.
                LogStatus(`[AIBridgeEngine] Turn decision PostToChat for bridge ${active.SessionBridgeID} (chat hook).`);
                break;
            case 'Silent':
            default:
                break;
        }
    }

    /**
     * Builds the per-session {@link TurnTakingPolicy} from the start params.
     *
     * @param params The session parameters.
     * @returns The configured turn-taking policy.
     */
    private buildTurnPolicy(params: StartBridgeSessionParams): TurnTakingPolicy {
        const config: TurnTakingPolicyConfig = {
            Mode: params.TurnMode ?? 'Passive',
            Matcher: params.TurnMatcher,
            Scorer: params.TurnScorer,
            ...(params.TurnTuning ?? {}),
        };
        return new TurnTakingPolicy(config);
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // THE CHANNEL PLANE — Part A: generic wiring of the Phase 2 server-side channels.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Wires the session's server-side channel plane (Phase 2's `RealtimeChannelServerHost` +
     * `MeetingControlsChannelServer`) to this bridged session — the generic, platform-agnostic
     * integration the Phase 2 agent flagged as the bridge-server follow-up.
     *
     * When a {@link IBridgeChannelHost} was supplied, this:
     * 1. Resolves the driver's optional Meeting Controls event source
     *    ({@link BaseRealtimeBridge.GetMeetingControlsEventSource}) — non-null only for drivers that
     *    contribute a facilitator surface.
     * 2. Captures the realtime session's `SendContextNote` perception sink (when the provider supports
     *    mid-session context injection) so channel perception reaches the model.
     * 3. Calls {@link IBridgeChannelHost.StartSessionChannels} to register the session's channels and
     *    construct + bind the Meeting Controls channel to the event source.
     * 4. Reads the contributed server-channel tools and binds the per-session executor onto the
     *    {@link ActiveBridgeSession}, so the runner-constructing layer registers them as
     *    `RealtimeSessionRunner.ServerChannelTools` and routes `ExecuteServerChannelTool` here.
     *
     * Failure posture mirrors the channel plane itself: a channel-host error is logged and never
     * propagates — the live media plane (the call/meeting) must not break because a channel failed.
     *
     * @param active The live bridged session to wire channels for.
     */
    private async wireChannelPlane(active: ActiveBridgeSession): Promise<void> {
        const host = active.ChannelHost;
        if (!host) {
            return; // IRealtimeSession-only caller — no channel plane to wire (back-compat).
        }
        try {
            const meetingControls = active.Bridge.GetMeetingControlsEventSource();
            // The model perceives channel events via SendContextNote when the provider supports it.
            const sink = active.RealtimeSession.SendContextNote
                ? (text: string) => active.RealtimeSession.SendContextNote?.(text)
                : undefined;

            await host.StartSessionChannels(active.AgentSessionID, meetingControls, sink);

            active.ServerChannelTools = host.GetSessionServerTools(active.AgentSessionID) ?? [];
            active.ExecuteServerChannelTool = (toolName: string, argsJson: string) =>
                host.ExecuteSessionServerTool(active.AgentSessionID, toolName, argsJson);

            LogStatus(
                `[AIBridgeEngine] Channel plane wired for bridge ${active.SessionBridgeID}: ` +
                    `${active.ServerChannelTools.length} server-channel tool(s)` +
                    `${meetingControls ? ' (incl. Meeting Controls)' : ''}.`,
            );
        } catch (err) {
            LogError(
                `[AIBridgeEngine] Channel-plane wiring failed for bridge ${active.SessionBridgeID} ` +
                    `(media plane unaffected): ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /**
     * Closes the session's server-side channels through the channel host (best-effort; teardown must
     * never throw). Invoked from {@link disconnectDriver} so every stop path — explicit, janitor,
     * shutdown — releases the channel plane.
     *
     * @param active The live bridged session whose channels to close.
     */
    private async closeChannelPlane(active: ActiveBridgeSession): Promise<void> {
        if (!active.ChannelHost) {
            return;
        }
        try {
            await active.ChannelHost.CloseSessionChannels(active.AgentSessionID);
        } catch (err) {
            LogError(
                `[AIBridgeEngine] Channel-plane close failed for bridge ${active.SessionBridgeID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Janitor — orphan reconciliation (scaffold; scheduling is a host-provided hook).
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Force-closes `Connected`/`Connecting` bridges left behind by a **previous boot of this host**
     * (matching hostname prefix, differing instance id), stamping `CloseReason = 'Janitor'`. Mirrors
     * `SessionJanitor.RunStartupRecovery`: a crash/redeploy vaporizes the in-memory driver sockets
     * but leaves the durable rows reading `Connected` forever; this reconciles them.
     *
     * The actual *scheduling* (run once at boot + periodic sweep) is intentionally left to the host
     * application (MJServer's startup + janitor timer) so this engine package carries no timer/IO of
     * its own; call this method from that scheduler.
     *
     * @param contextUser The system user the reconciliation writes run as.
     * @param provider The metadata provider for the reconciliation reads/writes.
     * @returns The number of orphaned bridges closed.
     */
    public async ReconcileOrphans(contextUser: UserInfo, provider: IMetadataProvider): Promise<number> {
        const prefix = this.escapeSql(this.hostIdentity.GetHostNamePrefix());
        const current = this.escapeSql(this.hostIdentity.GetHostInstanceID());
        const filter =
            `Status IN ('Connecting','Connected') ` +
            `AND HostInstanceID LIKE '${prefix}%' ` +
            `AND HostInstanceID <> '${current}'`;

        const rows = await this.loadOrphanRows(filter, contextUser, provider);
        let closed = 0;
        for (const row of rows) {
            const ok = await this.markBridgeDisconnected(row.ID, 'Janitor', contextUser, provider);
            if (ok) {
                closed++;
            }
        }
        if (closed > 0) {
            LogStatus(`[AIBridgeEngine] Janitor reconciled ${closed} orphaned bridge(s) from a prior boot of this host`);
        }
        return closed;
    }

    /** Loads the orphaned bridge rows matching the janitor filter. */
    private async loadOrphanRows(
        filter: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<MJAIAgentSessionBridgeEntity[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJAIAgentSessionBridgeEntity>(
            {
                EntityName: SESSION_BRIDGE_ENTITY,
                ExtraFilter: filter,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`[AIBridgeEngine] ReconcileOrphans load failed: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Driver resolution + bridge-row persistence.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Resolves the concrete bridge driver for a provider via the MJ `ClassFactory`, keyed by the
     * provider's `DriverClass`.
     *
     * @param provider The provider whose `DriverClass` selects the driver.
     * @returns The instantiated driver.
     * @throws When no driver is registered under the provider's `DriverClass`.
     */
    private resolveDriver(provider: MJAIBridgeProviderEntity): BaseRealtimeBridge {
        const driverClass = provider.DriverClass;
        // ClassFactory.CreateInstance FALLS BACK to the (abstract) base class when no driver is
        // registered under the key — it never returns null for a non-null base. So we must verify a
        // concrete registration exists first, otherwise we'd return an unusable abstract instance and
        // fail later with an opaque "Connect is not a function".
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeBridge, driverClass);
        if (!registration) {
            throw new Error(
                `No bridge driver registered for DriverClass '${driverClass}' (provider '${provider.Name}').`,
            );
        }
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeBridge>(
            BaseRealtimeBridge,
            driverClass,
        );
        if (!driver) {
            throw new Error(
                `Failed to instantiate bridge driver '${driverClass}' (provider '${provider.Name}').`,
            );
        }
        return driver;
    }

    /**
     * Builds the {@link RealtimeBridgeContext} handed to the driver's `Connect` from the start params
     * and the provider's typed `SupportedFeatures`.
     *
     * @param params The session parameters.
     * @returns The bridge context.
     */
    private buildBridgeContext(params: StartBridgeSessionParams): RealtimeBridgeContext {
        return {
            Features: params.Provider.SupportedFeaturesObject ?? {},
            ProviderName: params.Provider.Name,
            Address: params.Address,
            Configuration: params.Configuration,
            ContextUser: params.ContextUser,
        };
    }

    /**
     * Creates the `AIAgentSessionBridge` row as `Pending`, stamped with the host instance for affinity.
     *
     * @param params The session parameters.
     * @returns The saved bridge row.
     * @throws When the row cannot be created (no metadata provider, or save failure).
     */
    private async createBridgeRow(params: StartBridgeSessionParams): Promise<MJAIAgentSessionBridgeEntity> {
        const provider = params.MetadataProvider;
        if (!provider) {
            throw new Error('AIBridgeEngine.StartBridgeSession requires a MetadataProvider.');
        }
        const row = await provider.GetEntityObject<MJAIAgentSessionBridgeEntity>(
            SESSION_BRIDGE_ENTITY,
            params.ContextUser,
        );
        row.NewRecord();
        row.AgentSessionID = params.AgentSessionID;
        row.ProviderID = params.Provider.ID;
        row.Direction = params.Direction ?? 'Outbound';
        row.JoinMethod = params.JoinMethod ?? 'OnDemand';
        row.TurnMode = params.TurnMode ?? 'Passive';
        row.Address = params.Address;
        row.Status = 'Pending';
        row.HostInstanceID = this.hostIdentity.GetHostInstanceID();

        const saved = await row.Save();
        if (!saved) {
            throw new Error(
                `Failed to create AIAgentSessionBridge: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return row;
    }

    /**
     * Transitions a bridge row to a new `Status` and persists it.
     *
     * @param row The bridge row to transition.
     * @param status The target status.
     * @param params The session parameters (carry the context user for the save).
     */
    private async transitionStatus(
        row: MJAIAgentSessionBridgeEntity,
        status: MJAIAgentSessionBridgeEntity['Status'],
        params: StartBridgeSessionParams,
    ): Promise<void> {
        row.Status = status;
        const saved = await row.Save();
        if (!saved) {
            throw new Error(
                `Failed to transition bridge ${row.ID} to '${status}': ` +
                    `${row.LatestResult?.CompleteMessage ?? 'unknown error'} (user ${params.ContextUser?.Email ?? 'n/a'})`,
            );
        }
    }

    /** Stamps a bridge row `Failed` (best-effort) after a connect failure, logging the cause. */
    private async failBridgeRow(
        row: MJAIAgentSessionBridgeEntity,
        params: StartBridgeSessionParams,
        cause: unknown,
    ): Promise<void> {
        LogError(
            `[AIBridgeEngine] Bridge ${row.ID} failed to connect via ${params.Provider.Name}: ` +
                `${cause instanceof Error ? cause.message : String(cause)}`,
        );
        try {
            row.Status = 'Failed';
            row.CloseReason = 'Error';
            row.DisconnectedAt = new Date();
            await row.Save();
        } catch (err) {
            LogError(`[AIBridgeEngine] failed to stamp bridge ${row.ID} as Failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Disconnects the driver of a live session, tolerant of driver teardown errors, and closes its channels. */
    private async disconnectDriver(active: ActiveBridgeSession, reason: BridgeDisconnectReason): Promise<void> {
        // Close the channel plane first so its post-close hooks see the session still mid-teardown,
        // then release the driver's media plane.
        await this.closeChannelPlane(active);
        try {
            await active.Bridge.Disconnect(reason);
        } catch (err) {
            LogError(
                `[AIBridgeEngine] driver Disconnect failed for bridge ${active.SessionBridgeID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /**
     * Loads a bridge row and transitions it to `Disconnected` with the supplied `CloseReason`,
     * stamping `DisconnectedAt`. Idempotent — an already-`Disconnected`/`Failed` row is left untouched
     * and reported as success.
     *
     * @param sessionBridgeID The bridge row id.
     * @param reason The close reason to stamp.
     * @param contextUser The user the write runs as.
     * @param provider The metadata provider for the load/save.
     * @returns `true` when the row is (or already was) in a terminal disconnected state.
     */
    private async markBridgeDisconnected(
        sessionBridgeID: string,
        reason: BridgeDisconnectReason,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<boolean> {
        if (!provider) {
            LogError(`[AIBridgeEngine] markBridgeDisconnected requires a metadata provider (bridge ${sessionBridgeID}).`);
            return false;
        }
        const row = await provider.GetEntityObject<MJAIAgentSessionBridgeEntity>(SESSION_BRIDGE_ENTITY, contextUser);
        const loaded = await row.Load(sessionBridgeID);
        if (!loaded) {
            return false;
        }
        if (row.Status === 'Disconnected' || row.Status === 'Failed') {
            return true; // idempotent — already terminal, keep the original reason.
        }
        row.Status = 'Disconnected';
        row.CloseReason = reason;
        row.DisconnectedAt = new Date();
        const saved = await row.Save();
        if (!saved) {
            LogError(
                `[AIBridgeEngine] markBridgeDisconnected save failed for ${sessionBridgeID}: ` +
                    `${row.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return saved;
    }

    /** Escapes single quotes for safe embedding inside an `ExtraFilter` literal. */
    private escapeSql(value: string): string {
        return value.replace(/'/g, "''");
    }
}
