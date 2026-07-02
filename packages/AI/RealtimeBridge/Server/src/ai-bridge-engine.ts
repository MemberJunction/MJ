import {
    IMetadataProvider,
    IStartupSink,
    UserInfo,
    LogError,
    LogStatus,
    LogStatusEx,
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
    BridgeNativeSdkRegistry,
    BridgeNativeSdkBinding,
} from '@memberjunction/ai-bridge-base';
import { MultiAgentRoomCoordinator } from './multi-agent-room-coordinator';

/**
 * Entity names — centralised so the `MJ:`-prefix convention is applied in exactly one place.
 */
const SESSION_BRIDGE_ENTITY = 'MJ: AI Agent Session Bridges';
const SESSION_BRIDGE_PARTICIPANT_ENTITY = 'MJ: AI Agent Session Bridge Participants';

/**
 * Grace window after the last human leaves a room before the bot auto-leaves. Long enough that a page
 * refresh (participant briefly drops + rejoins) does NOT kill the agent, short enough that an abandoned
 * room frees its model session + finalizes its run promptly. See {@link AIBridgeEngine.evaluateRoomOccupancy}.
 */
const ROOM_EMPTY_GRACE_MS = 15000;

/**
 * Max time a meeting agent may hold the speaking floor before the engine force-releases it — a safety
 * valve so a missed end-of-speech signal can't wedge a multi-agent room's floor closed. The normal release
 * (the agent's own final transcript) fires well within this. See {@link AIBridgeEngine.releaseRoomFloor}.
 */
const FLOOR_MAX_HOLD_MS = 20000;

/**
 * Window for collapsing duplicate transcriptions of the SAME user utterance across a room's agents. When
 * several agents transcribe the user (slightly apart), only the first dispatch within this window drives the
 * room's addressing gate; later identical-text dispatches are dropped. See {@link AIBridgeEngine.dispatchUserTurn}.
 */
const ROOM_TURN_DEDUP_MS = 2500;

/** Upper bound on the per-room diarized lookback the engine retains in memory (the moderator narrows this further). */
const ROOM_LOOKBACK_MAX_TURNS = 50;

/** Hard cap on chars stored per lookback turn (memory bound; the moderator clips again to its configured budget). */
const ROOM_LOOKBACK_MAX_CHARS = 600;

/**
 * Runaway breaker: max consecutive agent-only turns (no human between) before the engine pauses agent↔agent
 * continuation regardless of the configurable {@link RealtimeModeratorConfig.maxConsecutiveAgentOnlyTurns}
 * (which defaults to no cap). Set high — real discussions don't approach it — purely to stop a pathological loop.
 */
const ROOM_AGENT_TURN_HARD_CEILING = 30;

/**
 * Stale-session sweep thresholds (the SAME-process complement to {@link AIBridgeEngine.ReconcileOrphans},
 * which handles prior-boot orphans). A live session is reaped when it has been **idle** (no inbound
 * transcript) for longer than the idle TTL, OR has simply run past the absolute max duration — covering a
 * missed leave event, a rosterless transport with no occupancy signal, and "the bot joined a scheduled
 * meeting but nobody ever came." The reap routes through the normal stop, so the co-agent run finalizes.
 */
const SESSION_IDLE_TTL_MS = 10 * 60 * 1000; // 10 min with no transcript activity
const SESSION_MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4 h absolute cap
const STALE_SWEEP_INTERVAL_MS = 60 * 1000; // sweep cadence when self-scheduled

/** Context note injected into a re-gated agent so it knows it's now in a meeting (its prompt predates it). */
const MEETING_REGATE_CONTEXT_NOTE =
    'You are now in a multi-party meeting with other people and agents. Stop responding to everything you ' +
    'hear — listen, and speak only when you are addressed by name or the conversation clearly needs your ' +
    'expertise. Never talk over others, and keep your replies brief.';

/**
 * Finalizes the co-agent observability run(s) for an agent session when a bridge is torn down WITHOUT a
 * live in-memory session — a prior-boot orphan or a cross-host reap, where the agent layer's `Close()`-wrapped
 * finalizer can't run, so the co-agent `AIAgentRun` would otherwise dangle in `Running` forever. The agent
 * layer registers it via {@link AIBridgeEngine.SetSessionRunFinalizer} at startup (it lives in
 * `@memberjunction/ai-agents`, not reachable from this package). **Idempotent**: for a clean same-process
 * teardown the run is already `Completed`, so this is a harmless no-op.
 */
export type BridgeSessionRunFinalizer = (
    agentSessionID: string,
    success: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
) => Promise<void>;

/**
 * One final transcript line from a room's **scribe** session (the single elected per-room writer). The
 * engine knows the room topology + owns the transcript tap; the SINK owns *where* it persists (e.g. an
 * `MJ: Conversations` "Meeting Room" + `MJ: Conversation Details`). Keeping the Conversations/app specifics
 * out of the engine — the engine only emits these neutral lines. See `plans/realtime/...followups.md` §5.
 */
export interface BridgeTranscriptLine {
    /** The room grouping (driver `ExternalConnectionId`) — one room = one unified transcript. */
    RoomKey: string;
    /** The scribe's agent-session id (stamped on the scribe's OWN speech lines). */
    AgentSessionID: string;
    /** The scribe's agent id, when known (attribution for its own speech). */
    AgentID?: string;
    /** `true` for the scribe's OWN speech (`assistant`), `false` for anything it heard (`user`). */
    IsAgentSpeech: boolean;
    /** The speaker's participant id — the scribe's own bot id for its speech; absent for heard speech. */
    SpeakerParticipantID?: string;
    /** The final transcript text for the turn. */
    Text: string;
}

/**
 * Registered by the app layer to persist the unified room transcript. The engine calls it for each FINAL
 * transcript line from a room's scribe, passing the scribe session's `contextUser` + `provider` so the sink
 * can write entities under the right identity. Bound once at startup (see `AIBridgeEngine.SetTranscriptSink`).
 */
export type BridgeTranscriptSink = (
    line: BridgeTranscriptLine,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
) => void | Promise<void>;

/** One diarized turn in the moderator's lookback window (oldest→newest). */
export interface ModeratorLookbackTurn {
    /** Display name of who spoke (agent name or participant label). */
    Speaker: string;
    /** Whether the speaker was an agent (vs a human participant). */
    IsAgent: boolean;
    /** The agent's id when {@link ModeratorLookbackTurn.IsAgent}. */
    AgentID?: string;
    /** What was said (engine stores a memory-bounded copy; the moderator clips further per its config). */
    Text: string;
}

/** One agent eligible to speak in a room, as the turn moderator sees it. */
export interface ModeratorRosterAgent {
    /** The bridge's `AIAgentSession` id — the stable identifier the moderator returns to route a turn. */
    AgentSessionID: string;
    /** The co-agent's `MJ: AI Agents` id (the generic Realtime voice agent). */
    AgentID?: string;
    /** The TARGET agent this co-agent voices (the role/identity the user hears), when distinct from {@link ModeratorRosterAgent.AgentID}. */
    TargetAgentID?: string;
    /** Names/aliases the agent answers to. */
    Names: string[];
    /** Short role/description for relevance judgement (the moderator plugin resolves the live value from the agent). */
    Role?: string;
    /** Participation style — `'addressed-only'` agents are routed only on a direct address (resolved live by the plugin). */
    Mode: 'proactive' | 'addressed-only';
}

/**
 * The context handed to the room {@link TurnModerator} for ONE decision: the roster, the recent diarized
 * lookback (incl. the triggering turn), and the bookkeeping the moderator needs to honor progress/observability.
 */
export interface TurnModeratorContext {
    /** The external room key. */
    RoomKey: string;
    /** Every agent currently in the room. */
    Roster: ModeratorRosterAgent[];
    /** Recent diarized turns oldest→newest (the engine's bounded buffer; the moderator narrows per its config). */
    Lookback: ModeratorLookbackTurn[];
    /** The turn that triggered this decision (also the last element of {@link TurnModeratorContext.Lookback}). */
    LatestTurn: ModeratorLookbackTurn;
    /** Consecutive agent-only turns since the last human turn (for the optional ping-pong backstop). */
    ConsecutiveAgentOnlyTurns: number;
    /** A representative co-agent run id to tie the moderator prompt run to (observability). */
    AgentRunID?: string;
    /** The representative (scribe) bridge's `AIAgentSession` id — the plugin uses it to resolve the co-agent run id for observability when {@link TurnModeratorContext.AgentRunID} is absent. */
    RepAgentSessionID?: string;
    /** The context user + provider for the moderator's own metadata/prompt operations. */
    ContextUser?: UserInfo;
    Provider?: IMetadataProvider;
}

/**
 * The room turn **moderator** — injected (like the transcript sink / run finalizer) so the engine stays
 * framework-agnostic. Given one turn's context, it returns the **ordered** `AgentSessionID`s that should
 * speak next (empty = nobody; the room goes quiet / hands back to the human). The engine triggers them
 * **serially** via the floor. The agent-layer implementation is a fast LLM prompt run; see
 * `@memberjunction/ai-agents` `RealtimeTurnModerator`. When no moderator is set the engine falls back to the
 * per-agent addressed matchers.
 */
export type TurnModerator = (ctx: TurnModeratorContext) => Promise<string[]>;

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

    /** The voicing agent's `MJ: AI Agents` id — used only to attribute this agent's transcript lines. */
    AgentID?: string;

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

    /**
     * **Multi-agent meeting mode.** When `true`, the realtime model's blind auto-response was disabled at
     * session start (the agent layer set `disableAutoResponse` on the model session), so the BRIDGE is the
     * sole speech trigger: on a `Speak` turn decision the engine issues exactly one `RequestSpokenUpdate`.
     * When `false`/absent the model auto-responds and the engine must NOT also trigger (it would double-fire).
     * Must agree with what the session was opened with. See `plans/realtime/multi-agent-meeting-turn-taking.md`.
     */
    DisableAutoResponse?: boolean;

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

    /**
     * Optional per-session override for binding the driver's SDK factory, applied to the resolved driver
     * just before `Connect`. When supplied it takes precedence over the {@link BridgeNativeSdkRegistry}
     * default — use it to choose a non-default binding for a provider that has more than one (e.g. Zoom's
     * RTMS receive-only binding instead of the native two-way default) or to inject a fake in a test.
     * When omitted, the engine applies the provider's registered native binding (if any).
     */
    BindSdk?: BridgeNativeSdkBinding;

    /**
     * This agent's participation style in a MULTI-agent room, surfaced to the room turn moderator:
     * `'proactive'` (default) may jump in unaddressed when judged relevant; `'addressed-only'` speaks only
     * when directly addressed. Ignored in single-agent rooms.
     */
    ParticipationMode?: 'proactive' | 'addressed-only';

    /** The names/aliases this agent answers to — the moderator's roster entry + the addressed-only fallback. */
    AgentNames?: string[];

    /** A short role/description of the voiced agent — context the moderator uses to judge relevance. */
    AgentRole?: string;

    /** The voiced agent's `MJ: AI Agent Runs` id — tied to each moderator prompt run for observability. */
    AgentRunID?: string;

    /**
     * The TARGET agent this co-agent voices (the role/identity the user hears — e.g. Sage), when distinct from
     * {@link StartBridgeSessionParams.AgentID} (the generic co-agent). The moderator resolves the agent's role
     * + per-agent `turnTaking.mode` from this agent's config.
     */
    TargetAgentID?: string;
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

    /** The voicing agent's `MJ: AI Agents` id — stamped on this agent's transcript lines for attribution. */
    AgentID?: string;

    /** The concrete driver instance transporting media. */
    Bridge: BaseRealtimeBridge;

    /** The realtime session the driver's media plane is wired to. */
    RealtimeSession: IRealtimeSession;

    /** The per-session turn-taking policy gating generation. */
    TurnPolicy: TurnTakingPolicy;

    /**
     * Whether the model's blind auto-response is OFF for this session (multi-agent meeting). When `true`
     * the bridge is the sole speech trigger — a `Speak` decision issues one `RequestSpokenUpdate`. When
     * `false` the model auto-responds and the engine stays hands-off (forcing would double-fire).
     */
    DisableAutoResponse: boolean;

    /**
     * Whether at least one HUMAN participant has been seen in the room. Auto-leave only fires after a human
     * was present and then all humans left — so a bot that joins ahead of anyone (or a momentarily bot-only
     * roster at startup) is never reaped prematurely. Set by the occupancy check off the driver roster.
     */
    HasSeenHuman: boolean;

    /**
     * Pending grace timer started when the last human leaves. If a human rejoins within the grace window
     * (e.g. a page refresh) it is cleared; otherwise it fires {@link AIBridgeEngine.StopBridgeSession} so the
     * bot leaves the empty room and its co-agent run finalizes. Cleared on any teardown.
     */
    LeaveGraceTimer?: ReturnType<typeof setTimeout>;

    /** The room key (driver `ExternalConnectionId`) this session is in — the unified-transcript room grouping. */
    RoomKey?: string;

    /** This session's own bot participant id on the endpoint — the speaker label on its own transcript lines. */
    BotParticipantID?: string;

    /**
     * Whether THIS session is the room's transcript **scribe**. Exactly one session per room writes the
     * unified meeting transcript (its own speech + everything it hears), so a multi-agent room records one
     * copy, not N. Elected at connect (first session in the room); re-elected if the scribe leaves.
     */
    IsTranscriptScribe: boolean;

    /**
     * Whether this session currently holds the room's speaking floor (multi-agent floor control). Set when
     * the engine claims the floor before triggering speech in meeting mode, cleared when the agent's own
     * final transcript lands (it finished) or on teardown. Single-agent rooms always hold trivially.
     */
    HoldsFloor: boolean;

    /**
     * Safety timer that force-releases a held floor after {@link FLOOR_MAX_HOLD_MS} in case the agent's
     * final transcript never arrives — so one agent can't wedge the room's floor closed. Cleared on a
     * normal release.
     */
    FloorReleaseTimer?: ReturnType<typeof setTimeout>;

    /** Epoch-ms when this session connected — drives the max-session-duration cap of the stale sweep. */
    ConnectedAtMs: number;

    /** Epoch-ms of the last inbound activity (transcript) — drives the idle cap of the stale sweep. */
    LastActivityMs: number;

    /**
     * The participant identity of the most-recent inbound AUDIO frame (when the provider diarizes). Used to
     * attribute a 'user' transcript to the speaker who produced it — since the model transcript itself has
     * no speaker label. Approximate (single-speaker-at-a-time); `undefined` until the first diarized frame.
     */
    LastInboundSpeaker?: string;

    /** This agent's participation style for the room moderator (`'proactive'` | `'addressed-only'`). */
    ParticipationMode: 'proactive' | 'addressed-only';

    /** The names/aliases this agent answers to (moderator roster + addressed-only fallback). */
    AgentNames: string[];

    /** A short role/description of the voiced agent (moderator relevance context). */
    AgentRole?: string;

    /** The voiced agent's `MJ: AI Agent Runs` id — tied to each moderator prompt run for observability. */
    AgentRunID?: string;

    /** The TARGET agent this co-agent voices (role/identity source for the moderator), when distinct from {@link ActiveBridgeSession.AgentID}. */
    TargetAgentID?: string;

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
    /** Registered by the agent layer; finalizes dangling co-agent runs on orphan/cross-host teardown. */
    private runFinalizer?: BridgeSessionRunFinalizer;

    /** Interval handle for the self-scheduled stale-session sweep (started via {@link StartStaleSessionSweep}). */
    private staleSweepTimer?: ReturnType<typeof setInterval>;

    // Session timing thresholds (defaults from the module consts; overridable via {@link ConfigureSessionTimings}).
    private idleTtlMs = SESSION_IDLE_TTL_MS;
    private maxDurationMs = SESSION_MAX_DURATION_MS;
    private emptyGraceMs = ROOM_EMPTY_GRACE_MS;
    private floorMaxHoldMs = FLOOR_MAX_HOLD_MS;

    /** Registered by the app layer; persists the unified per-room transcript from the elected scribe. */
    private transcriptSink?: BridgeTranscriptSink;

    /** roomKey (lowercased) → the bridge id of that room's current transcript scribe. Election dedup. */
    private readonly roomScribes = new Map<string, string>();
    /** Diagnostic: session ids that have already logged their first inbound / outbound media frame. */
    private diagInbound = new Set<string>();
    private diagOutbound = new Set<string>();
    /** In-memory registry of bridged sessions this process currently hosts, keyed by bridge id (lowercased). */
    private activeSessions = new Map<string, ActiveBridgeSession>();

    /** Per-room, per-utterance-text last-dispatch timestamps — collapses duplicate transcriptions (see {@link ROOM_TURN_DEDUP_MS}). */
    private recentRoomTurnDispatch = new Map<string, number>();

    /** Optional injected room turn moderator (LLM router). When set, multi-agent rooms use it instead of per-agent matchers. */
    private turnModerator?: TurnModerator;

    /** Per-room rolling diarized lookback the moderator reads. Bounded to {@link ROOM_LOOKBACK_MAX_TURNS}. */
    private roomLookback = new Map<string, ModeratorLookbackTurn[]>();

    /** Per-room ordered queue of `AgentSessionID`s the moderator decided should speak, drained serially via the floor. */
    private roomSpeakerQueue = new Map<string, string[]>();

    /** Per-room count of consecutive agent-only turns since the last human turn (optional ping-pong backstop). */
    private roomConsecutiveAgentTurns = new Map<string, number>();

    /** Rooms with a moderator decision in flight — prevents overlapping moderator calls for one room. */
    private roomModeratorBusy = new Set<string>();

    /** Per-room latest turn that arrived while the moderator was busy — run once the in-flight call finishes (no turn lost). */
    private roomPendingTurn = new Map<string, ModeratorLookbackTurn>();

    /** Host-instance identity provider; injected by the host application or defaulted for standalone use. */
    private hostIdentity: IHostInstanceIdentity = new DefaultHostInstanceIdentity();

    /**
     * Coordinates speaking discipline when MULTIPLE agent bridge sessions share one room (§4c —
     * "1+ agents in a shared room"). Single-agent sessions never touch it; it is engaged only via the
     * additive {@link RegisterRoomParticipant} / {@link UnregisterRoomParticipant} hooks, so the default
     * single-agent path is wholly unaffected.
     */
    private readonly roomCoordinator = new MultiAgentRoomCoordinator();

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
        // Begin reaping stale live sessions (idle / over-duration) — the same-process backstop to the
        // occupancy auto-leave + the prior-boot orphan reconcile. Idempotent.
        this.StartStaleSessionSweep();
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

    /**
     * Registers the {@link BridgeSessionRunFinalizer} this engine calls when a bridge is marked disconnected
     * without a live in-memory session (orphan/cross-host reap) — so the co-agent run finalizes there too,
     * not only on the same-process `Close()` path. Bound once at startup by the agent layer. Idempotent.
     *
     * @param finalizer The finalizer (from `@memberjunction/ai-agents`).
     */
    public SetSessionRunFinalizer(finalizer: BridgeSessionRunFinalizer): void {
        this.runFinalizer = finalizer;
    }

    /**
     * Overrides the session timing thresholds (the idle/max-duration sweep caps, the empty-room auto-leave
     * grace, and the floor max-hold). Any omitted value keeps its default. Call once at startup to tune for a
     * deployment (e.g. shorter idle TTL for a high-churn telephony host).
     *
     * @param timings The thresholds to override (ms).
     */
    public ConfigureSessionTimings(timings: { IdleTtlMs?: number; MaxDurationMs?: number; EmptyGraceMs?: number; FloorMaxHoldMs?: number }): void {
        if (timings.IdleTtlMs != null) { this.idleTtlMs = timings.IdleTtlMs; }
        if (timings.MaxDurationMs != null) { this.maxDurationMs = timings.MaxDurationMs; }
        if (timings.EmptyGraceMs != null) { this.emptyGraceMs = timings.EmptyGraceMs; }
        if (timings.FloorMaxHoldMs != null) { this.floorMaxHoldMs = timings.FloorMaxHoldMs; }
    }

    /**
     * Registers the {@link BridgeTranscriptSink} that persists the unified per-room transcript. The engine
     * elects one scribe per room and feeds its final transcript lines here; the sink owns *where* they land
     * (e.g. an `MJ: Conversations` "Meeting Room"). Bound once at startup by the app layer. Without it, no
     * transcript is persisted (the engine still elects a scribe but emits nothing).
     *
     * @param sink The transcript sink (from the app layer).
     */
    public SetTranscriptSink(sink: BridgeTranscriptSink): void {
        this.transcriptSink = sink;
    }

    /**
     * Injects the room turn {@link TurnModerator} (the LLM router). When set, a MULTI-agent room routes each
     * turn through it (who speaks next, serialized via the floor) instead of evaluating per-agent matchers.
     * Single-agent rooms and the no-moderator case are unaffected (they keep using the matcher path).
     *
     * @param moderator The moderator function, or `undefined` to clear it.
     */
    public SetTurnModerator(moderator: TurnModerator | undefined): void {
        this.turnModerator = moderator;
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
    // Multi-party — shared-room coordination (§4c). Additive; single-agent unaffected.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * The {@link MultiAgentRoomCoordinator} this engine uses for inter-agent floor arbitration when
     * multiple agent bridge sessions share one room. Exposed so the runner-constructing layer can run
     * `CanTakeFloor` / `TakeFloor` / `ReleaseFloor` around an agent's generation in a multi-agent room.
     */
    public get RoomCoordinator(): MultiAgentRoomCoordinator {
        return this.roomCoordinator;
    }

    /**
     * Ties a bridge session into the multi-agent room coordinator when it joins a SHARED room (§4c). Call
     * this for an agent session whose bridge connects into a room that other agent sessions may also
     * inhabit — keyed by the shared external room id (the driver's `ExternalConnectionID` / the
     * ConversationID). Once 2+ agents are registered on the same room, floor arbitration keeps exactly one
     * agent speaking at a time across agents; combined with passive turn-taking, two agents are loop-safe.
     *
     * **Additive and opt-in.** A normal single-agent bridge never calls this and is wholly unaffected —
     * the coordinator only matters once two sessions name the same room. Designating `isFacilitator`
     * marks the agent (typically the one running the Meeting Controls channel) as the room's arbiter,
     * which may override the floor to call on a specific agent.
     *
     * @param roomId The shared external room id all co-located agents key on.
     * @param agentSessionId The agent session joining the room.
     * @param isFacilitator Whether this agent is the room's facilitator (may override the floor).
     */
    public RegisterRoomParticipant(roomId: string, agentSessionId: string, isFacilitator = false): void {
        this.roomCoordinator.RegisterRoomParticipant(roomId, agentSessionId, isFacilitator);
        LogStatus(
            `[AIBridgeEngine] Agent session ${agentSessionId} registered in shared room ${roomId}` +
                `${isFacilitator ? ' (facilitator)' : ''}; multi-agent=${this.roomCoordinator.IsMultiAgentRoom(roomId)}.`,
        );
    }

    /**
     * Removes a bridge session from the multi-agent room coordinator (its bridge stopped / it left the
     * room). Releases the floor if the leaving agent held it and clears the facilitator slot if it was
     * the facilitator. Safe to call unconditionally on teardown — a no-op for sessions that were never
     * registered as room participants.
     *
     * @param roomId The shared room the agent is leaving.
     * @param agentSessionId The agent session leaving.
     */
    public UnregisterRoomParticipant(roomId: string, agentSessionId: string): void {
        this.roomCoordinator.UnregisterRoomParticipant(roomId, agentSessionId);
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
            // Bind the driver's SDK factory BEFORE Connect (Connect constructs the SDK from it). A
            // per-session BindSdk override wins; otherwise apply the provider's registered native binding.
            // Resolved drivers start with a default factory that throws "no SDK bound", so this is what
            // makes a real provider session actually connect.
            this.bindDriverSdk(params, driver);
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
                AgentID: params.AgentID,
                Bridge: driver,
                RealtimeSession: params.RealtimeSession,
                TurnPolicy: turnPolicy,
                DisableAutoResponse: params.DisableAutoResponse === true,
                HasSeenHuman: false,
                RoomKey: result.ExternalConnectionId,
                BotParticipantID: result.BotParticipantId,
                IsTranscriptScribe: false,
                HoldsFloor: false,
                ConnectedAtMs: Date.now(),
                LastActivityMs: Date.now(),
                ParticipationMode: params.ParticipationMode ?? 'proactive',
                AgentNames: params.AgentNames ?? [],
                AgentRole: params.AgentRole,
                AgentRunID: params.AgentRunID,
                TargetAgentID: params.TargetAgentID,
                Provider: params.Provider,
                ContextUser: params.ContextUser,
                MetadataProvider: params.MetadataProvider,
                ChannelHost: params.ChannelHost,
                ServerChannelTools: [],
            };

            this.electTranscriptScribe(active);
            // Join the room's floor-control roster (keyed on the shared room). For a single-agent room this
            // is a 1-member room where the floor is always free — so floor control is a no-op until a 2nd
            // agent joins, at which point they take turns. Unregistered on teardown.
            if (active.RoomKey) {
                this.roomCoordinator.RegisterRoomParticipant(active.RoomKey, active.AgentSessionID);
            }
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

        // Inbound: endpoint media → the agent hears (and, for a video model, SEES) it. The frame's
        // Track tags the plane, so a human's camera (`video-in`) reaches the model as a `video` frame.
        Bridge.OnMedia((frame: BridgeMediaFrame) => {
            // DIARIZATION: the inbound frame carries the speaking participant's identity (when the provider
            // supports it). The realtime model's transcript has no speaker label, so we remember the
            // most-recent inbound audio speaker here and attribute the next 'user' transcript to them — a
            // single-speaker-at-a-time approximation that's right for the common case. See emitTranscriptLine.
            if (frame.Track === 'audio-in' && frame.SpeakerLabel) {
                active.LastInboundSpeaker = frame.SpeakerLabel;
            }
            const chunk = this.frameToArrayBuffer(frame);
            if (chunk) {
                if (!this.diagInbound.has(active.SessionBridgeID)) {
                    this.diagInbound.add(active.SessionBridgeID);
                    LogStatusEx({ message: `[AIBridgeEngine][diag] FIRST inbound media frame reached the agent (bridge ${active.SessionBridgeID}, track=${frame.Track}). The agent is HEARING you.`, verboseOnly: true });
                }
                RealtimeSession.SendInput(chunk, frame.Track === 'video-in' ? 'video' : 'audio');
            }
        });

        // Outbound: the agent speaks → into the meeting/call.
        RealtimeSession.OnOutput((chunk: ArrayBuffer) => {
            if (!this.diagOutbound.has(active.SessionBridgeID)) {
                this.diagOutbound.add(active.SessionBridgeID);
                LogStatusEx({ message: `[AIBridgeEngine][diag] FIRST outbound audio from the agent (bridge ${active.SessionBridgeID}). The agent is SPEAKING into the room.`, verboseOnly: true });
            }
            const track: BridgeMediaTrackKind = 'audio-out';
            Bridge.SendMedia(track, this.arrayBufferToFrame(chunk, track));
        });

        // Outbound VIDEO: a video-capable session ALSO emits a synced avatar/video track. Optional —
        // audio-only sessions don't implement OnVideoOutput, so call it null-safely. The bridge driver
        // gates the actual publish on its `VideoOut` capability.
        RealtimeSession.OnVideoOutput?.((chunk: ArrayBuffer) => {
            const track: BridgeMediaTrackKind = 'video-out';
            Bridge.SendMedia(track, this.arrayBufferToFrame(chunk, track));
        });

        // Barge-in: on a TRUE interruption (the user speaks over the agent), the model stops generating —
        // but the driver may still hold queued outbound audio that would keep playing. Flush it so the
        // agent goes quiet immediately. Without this, interruption "doesn't work" on the bridge surface.
        RealtimeSession.OnInterruption(() => {
            if (this.diagOutbound.has(active.SessionBridgeID)) {
                LogStatusEx({ message: `[AIBridgeEngine][diag] barge-in — flushing the agent's queued audio (bridge ${active.SessionBridgeID}).`, verboseOnly: true });
            }
            Bridge.FlushOutboundMedia();
            // A human cut in → any moderator decision staged for the prior turn is now stale. Drop the queued
            // speakers (the human's new turn will drive a fresh decision); also free the floor this agent held.
            if (active.RoomKey) {
                this.clearRoomModeratorState(active.RoomKey, false);
                if (active.HoldsFloor) {
                    this.releaseRoomFloor(active);
                }
            }
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
                // Auto-leave an emptied room: the dominant teardown path (the user just closes the tab never
                // calls StopBridgeSession), so without this the bot lingers Connected and its co-agent run
                // dangles in Running forever. Routed through the normal stop, so the run finalizes cleanly.
                this.evaluateRoomOccupancy(active, participants);
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
     * Decides whether an emptied room should auto-leave. Marks {@link ActiveBridgeSession.HasSeenHuman}
     * once any human is present; when a human WAS present and the roster drops to agents-only, it arms a
     * grace timer ({@link ROOM_EMPTY_GRACE_MS}) that stops the session (so a page-refresh re-join cancels
     * it). The stop routes through {@link StopBridgeSession} → driver disconnect → realtime `Close()`, which
     * finalizes the co-agent run — so a closed tab no longer leaves a `Connected` bridge + `Running` run.
     *
     * Only providers with a roster (diarization) reach here; rosterless transports rely on the host janitor.
     *
     * @param active The live bridged session.
     * @param participants The current roster from the driver.
     */
    private evaluateRoomOccupancy(active: ActiveBridgeSession, participants: BridgeParticipantInfo[]): void {
        const humanPresent = participants.some(p => !p.IsAgent);
        if (humanPresent) {
            active.HasSeenHuman = true;
            if (active.LeaveGraceTimer) {
                clearTimeout(active.LeaveGraceTimer);
                active.LeaveGraceTimer = undefined;
            }
            return;
        }
        // Agents-only roster. Never reaped unless a human was actually here first (so a bot that joins ahead
        // of anyone isn't killed), and only one countdown at a time.
        if (!active.HasSeenHuman || active.LeaveGraceTimer) {
            return;
        }
        active.LeaveGraceTimer = setTimeout(() => {
            active.LeaveGraceTimer = undefined;
            // A re-join cleared this timer; a prior stop removed the session. Only act if it's still live.
            if (this.activeSessions.has(active.SessionBridgeID.toLowerCase())) {
                LogStatus(`[AIBridgeEngine] All humans left bridge ${active.SessionBridgeID}; auto-leaving (grace elapsed).`);
                void this.StopBridgeSession(active.SessionBridgeID, 'HostEnded', active.ContextUser, active.MetadataProvider);
            }
        }, this.emptyGraceMs);
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
        // Persist IsAgent ONLY for THIS bridge's own bot — the row-level invariant is "one bot per bridge".
        // In a multi-agent room the live roster (driver-side `p.IsAgent`) flags OTHER agents too (turn-taking
        // + occupancy need that), but on THIS bridge's persisted roster they are remote participants, not its
        // bot. Diarization still resolves them: each agent's OWN bridge marks itself, and the transcript
        // viewer OR-reduces IsAgent per identity across all of the room's bridges.
        row.IsAgent =
            active.BotParticipantID != null && p.ExternalId.toLowerCase() === active.BotParticipantID.toLowerCase();
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
            active.LastActivityMs = Date.now(); // any transcript = the session is alive (drives the idle sweep)
            if (!t.IsFinal) {
                return; // partials fire per-word — act only on a completed turn (and don't flood the log)
            }
            LogStatusEx({ message: `[AIBridgeEngine][diag] transcript(final): role=${t.Role} text="${(t.Text ?? '').slice(0, 80)}" (bridge ${active.SessionBridgeID})`, verboseOnly: true });
            // Persist the unified room transcript (scribe only — emits both roles).
            this.emitTranscriptLine(active, t);
            // Record into the room's diarized lookback so the moderator (and observability) see the full thread.
            this.recordRoomTurn(active, t);

            if (t.Role === 'assistant') {
                // The agent finished its own turn → release the room floor so the next can speak. Then advance:
                // run the moderator for "who responds to this agent?" (the agent↔agent + pre-stage path) — this
                // executes while the agent's audio is still playing out, hiding the moderator latency.
                if (active.HoldsFloor) {
                    this.releaseRoomFloor(active);
                }
                this.onAgentTurnCompleted(active, t.Text ?? '');
                return;
            }
            if (t.Role === 'user') {
                this.dispatchUserTurn(active, t.Text ?? '');
            }
        });
    }

    /**
     * Routes a completed human turn to the addressing gate(s). In a **single-agent** room (or 1:1) only the
     * source agent evaluates. In a **multi-agent** room the user's utterance is the SAME for everyone, so we
     * broadcast it to EVERY agent's `TurnPolicy` — each independently decides "was I addressed?". This is the
     * fix for agents whose own model can't transcribe in meeting mode (e.g. Gemini with automatic activity
     * detection disabled): whichever agent CAN transcribe the room (e.g. the GPT agent, or the scribe) drives
     * the addressing decision for all of them. The audio plane is untouched — every agent already hears the
     * raw audio; this only decides WHEN each is triggered to commit + speak.
     *
     * Dedup: the same utterance may be transcribed by several agents (slightly apart). A per-room, per-text
     * time window collapses those re-transcriptions so each real utterance dispatches to the room once.
     *
     * @param source The bridge whose session produced the transcript.
     * @param text The final user-turn text.
     */
    private dispatchUserTurn(source: ActiveBridgeSession, text: string): void {
        const peers = source.RoomKey ? this.roomAgents(source.RoomKey) : [source];
        // Only a REAL human turn counts as presence. In a multi-agent room every agent transcribes its peers'
        // speech as a 'user' turn (it has no other role to assign overheard audio); if those counted as a human,
        // an agents-only room would keep cancelling its own auto-leave and babble forever after the humans left —
        // burning realtime tokens at full cost. The diarized inbound speaker tells us: an `agent-…` identity is a
        // peer agent, NOT a human, so it must NOT keep the room alive.
        const overheardAgent = source.LastInboundSpeaker?.toLowerCase().startsWith('agent-') === true;
        if (!overheardAgent) {
            // A real human just spoke → definitive presence for EVERY agent in the room. Cancel any pending
            // empty-room auto-leave + reset the consecutive-agent-only counter.
            for (const peer of peers) {
                this.noteHumanPresence(peer);
            }
        }
        if (source.RoomKey) {
            this.roomConsecutiveAgentTurns.set(source.RoomKey.toLowerCase(), 0);
        }

        if (peers.length <= 1) {
            this.evaluateUserTurnForAgent(source, text); // 1:1 / solo room — no broadcast, no dedup
            return;
        }
        const now = Date.now();
        const dedupKey = `${source.RoomKey!.toLowerCase()}\n${text.trim().toLowerCase()}`;
        if (now - (this.recentRoomTurnDispatch.get(dedupKey) ?? 0) < ROOM_TURN_DEDUP_MS) {
            return; // a peer already dispatched this same utterance to the room
        }
        this.recentRoomTurnDispatch.set(dedupKey, now);
        if (this.recentRoomTurnDispatch.size > 512) {
            this.recentRoomTurnDispatch.clear(); // bounded — dedup only needs the last few seconds
        }

        // MODERATOR PATH: one LLM decision routes the turn to 0+ agents (serialized via the floor). FALLBACK
        // (no moderator configured): each agent independently evaluates its own addressed-matcher (broadcast).
        if (this.turnModerator) {
            void this.runRoomModerator(source.RoomKey!, { Speaker: this.speakerLabel(source, false), IsAgent: false, Text: text });
            return;
        }
        LogStatusEx({ message: `[AIBridgeEngine][diag] broadcasting user turn "${text.slice(0, 60)}" to ${peers.length} room agents for addressing (source bridge ${source.SessionBridgeID})`, verboseOnly: true });
        for (const peer of peers) {
            this.evaluateUserTurnForAgent(peer, text);
        }
    }

    /** Marks a human as present on a session: remembers it + cancels any pending empty-room auto-leave. */
    private noteHumanPresence(active: ActiveBridgeSession): void {
        active.HasSeenHuman = true;
        if (active.LeaveGraceTimer) {
            clearTimeout(active.LeaveGraceTimer);
            active.LeaveGraceTimer = undefined;
            LogStatusEx({ message: `[AIBridgeEngine][diag] cancelled pending auto-leave for bridge ${active.SessionBridgeID} — a human is actively speaking`, verboseOnly: true });
        }
    }

    /** Evaluates ONE agent's addressed-matcher against a user utterance and acts on the decision (fallback path). */
    private evaluateUserTurnForAgent(active: ActiveBridgeSession, text: string): void {
        const segment: TurnTranscriptSegment = { Text: text, IsAgent: false, EndMs: Date.now() };
        const decision = active.TurnPolicy.EvaluateTurn({ Segment: segment });
        LogStatusEx({ message: `[AIBridgeEngine][diag] turn decision=${decision.Action} for user turn "${(text ?? '').slice(0, 60)}" (bridge ${active.SessionBridgeID})`, verboseOnly: true });
        this.applyTurnDecision(active, decision.Action);
    }

    /** All active bridged sessions sharing a room (by external room key), case-insensitive. */
    private roomAgents(roomKey: string): ActiveBridgeSession[] {
        const key = roomKey.toLowerCase();
        const out: ActiveBridgeSession[] = [];
        for (const s of this.activeSessions.values()) {
            if (s.RoomKey && s.RoomKey.toLowerCase() === key) {
                out.push(s);
            }
        }
        return out;
    }

    // ── Room turn moderator (LLM router) — the multi-agent path used when SetTurnModerator is wired ─────────

    /** A diarized speaker label for a session (the agent's first name, or a generic human label). */
    private speakerLabel(active: ActiveBridgeSession, isAgent: boolean): string {
        if (isAgent) {
            return active.AgentNames[0] ?? 'Agent';
        }
        return active.LastInboundSpeaker ?? 'Participant';
    }

    /**
     * Appends one final turn to the room's bounded, clipped diarized lookback (oldest→newest). Sourcing rules
     * keep the thread clean in a multi-agent room (where EVERY agent's session independently transcribes what
     * it hears):
     * - **Agent (assistant) turns** are recorded from the speaking agent's OWN bridge (correct, no duplication).
     * - **Human (user) turns** are recorded ONLY by the room **scribe** (one canonical hearer → no N-fold
     *   duplication), and ONLY when the diarized inbound speaker is a human — a `user` transcript whose speaker
     *   is another AGENT (the scribe overhearing a peer agent) is dropped here, since that agent's own bridge
     *   already recorded it as its assistant turn.
     */
    private recordRoomTurn(active: ActiveBridgeSession, t: RealtimeTranscript): void {
        if (!active.RoomKey) {
            return;
        }
        const isAgent = t.Role === 'assistant';
        if (!isAgent) {
            if (!active.IsTranscriptScribe) {
                return; // only the scribe records human turns (avoids one copy per transcribing agent)
            }
            if (active.LastInboundSpeaker?.toLowerCase().startsWith('agent-')) {
                return; // the scribe is overhearing another agent — that agent's own bridge records it
            }
        }
        const key = active.RoomKey.toLowerCase();
        const buf = this.roomLookback.get(key) ?? [];
        buf.push({
            Speaker: this.speakerLabel(active, isAgent),
            IsAgent: isAgent,
            AgentID: isAgent ? active.AgentID : undefined,
            Text: (t.Text ?? '').slice(0, ROOM_LOOKBACK_MAX_CHARS),
        });
        while (buf.length > ROOM_LOOKBACK_MAX_TURNS) {
            buf.shift();
        }
        this.roomLookback.set(key, buf);
    }

    /**
     * Called when an agent finishes a turn. Advances a multi-agent room: increments the consecutive-agent-only
     * counter and — if a moderator is wired and the room's speaker queue is empty — runs the moderator to decide
     * whether (and who) continues the discussion. Because this fires on the agent's FINAL TEXT (its audio is
     * still playing out), the moderator's latency is hidden behind playback. No-op for single-agent rooms.
     */
    private onAgentTurnCompleted(active: ActiveBridgeSession, text: string): void {
        if (!active.RoomKey || !this.turnModerator || this.roomAgents(active.RoomKey).length <= 1) {
            return;
        }
        const key = active.RoomKey.toLowerCase();
        const consecutive = (this.roomConsecutiveAgentTurns.get(key) ?? 0) + 1;
        this.roomConsecutiveAgentTurns.set(key, consecutive);
        // Runaway breaker: even with the configurable cap left null (the user wants free-flowing agent↔agent
        // discussion), a hard ceiling stops a pathological loop from burning tokens forever with no human. Real
        // discussions don't run this many agent turns without a human; a human turn resets the counter.
        if (consecutive >= ROOM_AGENT_TURN_HARD_CEILING) {
            LogStatus(`[AIBridgeEngine] room ${active.RoomKey} hit the agent-turn hard ceiling (${ROOM_AGENT_TURN_HARD_CEILING}) — pausing agent↔agent continuation until a human speaks`);
            return;
        }
        // Run the continuation ONLY when the room is fully idle: no more queued speakers AND nobody currently
        // holds the floor. This handler fires AFTER `releaseRoomFloor` has already drained the next queued
        // speaker (which now holds the floor), so without the floor check we'd re-route to an agent that's
        // mid-response — double-speaking. The continuation then fires once, when the last speaker finishes.
        if ((this.roomSpeakerQueue.get(key)?.length ?? 0) > 0 || this.roomAgents(active.RoomKey).some((a) => a.HoldsFloor)) {
            return;
        }
        void this.runRoomModerator(active.RoomKey, { Speaker: this.speakerLabel(active, true), IsAgent: true, AgentID: active.AgentID, Text: text }, true);
    }

    /**
     * Runs the room turn moderator for one decision: builds the context, calls the injected moderator, sets the
     * room's ordered speaker queue to its result, and drains it (serialized via the floor). Guards against
     * overlapping calls per room and against an unproductive agent-only loop via the optional consecutive cap.
     *
     * @param roomKey The external room key.
     * @param latest The turn that triggered this decision.
     * @param isContinuation True when triggered by an agent turn (vs a fresh human turn).
     */
    private async runRoomModerator(roomKey: string, latest: ModeratorLookbackTurn, isContinuation = false): Promise<void> {
        const key = roomKey.toLowerCase();
        if (!this.turnModerator) {
            return;
        }
        if (this.roomModeratorBusy.has(key)) {
            // A decision is already in flight for this room → remember the LATEST turn so it isn't dropped
            // (e.g. a human speaks while a continuation is mid-call); it runs as soon as the current one finishes.
            this.roomPendingTurn.set(key, latest);
            return;
        }
        const ctx = this.buildModeratorContext(roomKey, latest);
        if (ctx.Roster.length <= 1) {
            return; // not a multi-agent room
        }
        this.roomModeratorBusy.add(key);
        try {
            const sessionIds = await this.turnModerator(ctx);
            const valid = sessionIds.filter((id) => ctx.Roster.some((r) => r.AgentSessionID.toLowerCase() === id.toLowerCase()));
            LogStatusEx({ message: `[AIBridgeEngine][diag] moderator${isContinuation ? '(continuation)' : ''} routed turn "${latest.Text.slice(0, 50)}" → [${valid.map((id) => this.agentSessionLabel(id)).join(', ') || 'nobody'}]`, verboseOnly: true });
            // Moderator chose to go quiet → the (possible) agent↔agent exchange ended; reset the consecutive
            // counter so a later resumption starts fresh rather than near the hard ceiling.
            if (valid.length === 0) {
                this.roomConsecutiveAgentTurns.set(key, 0);
            }
            this.roomSpeakerQueue.set(key, valid);
            this.drainSpeakerQueue(roomKey);
        } catch (err) {
            LogError(`[AIBridgeEngine] turn moderator failed for room ${roomKey}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.roomModeratorBusy.delete(key);
            // Process the latest turn that arrived while we were busy (if any) so no turn is lost.
            const pending = this.roomPendingTurn.get(key);
            if (pending) {
                this.roomPendingTurn.delete(key);
                void this.runRoomModerator(roomKey, pending, pending.IsAgent);
            }
        }
    }

    /** Builds the {@link TurnModeratorContext} for a room from the live roster + diarized lookback. */
    private buildModeratorContext(roomKey: string, latest: ModeratorLookbackTurn): TurnModeratorContext {
        const key = roomKey.toLowerCase();
        const agents = this.roomAgents(roomKey);
        const roster: ModeratorRosterAgent[] = agents.map((a) => ({
            AgentSessionID: a.AgentSessionID,
            AgentID: a.AgentID,
            TargetAgentID: a.TargetAgentID,
            Names: a.AgentNames,
            Role: a.AgentRole,
            Mode: a.ParticipationMode,
        }));
        // A representative session for observability/provider context (the scribe if we have it, else the first).
        const rep = agents.find((a) => a.IsTranscriptScribe) ?? agents[0];
        return {
            RoomKey: roomKey,
            Roster: roster,
            Lookback: this.roomLookback.get(key) ?? [latest],
            LatestTurn: latest,
            ConsecutiveAgentOnlyTurns: this.roomConsecutiveAgentTurns.get(key) ?? 0,
            AgentRunID: rep?.AgentRunID,
            RepAgentSessionID: rep?.AgentSessionID,
            ContextUser: rep?.ContextUser,
            Provider: rep?.MetadataProvider,
        };
    }

    /** Triggers the next queued speaker for a room (serialized — only when the floor is free). */
    private drainSpeakerQueue(roomKey: string): void {
        const key = roomKey.toLowerCase();
        const queue = this.roomSpeakerQueue.get(key);
        if (!queue || queue.length === 0) {
            return;
        }
        // Don't start the next speaker while someone in the room still holds the floor.
        if (this.roomAgents(roomKey).some((a) => a.HoldsFloor)) {
            return;
        }
        const nextSessionId = queue.shift()!;
        this.roomSpeakerQueue.set(key, queue);
        const next = this.roomAgents(roomKey).find((a) => a.AgentSessionID.toLowerCase() === nextSessionId.toLowerCase());
        if (!next) {
            this.drainSpeakerQueue(roomKey); // session gone — skip to the next
            return;
        }
        // If the trigger didn't actually start a turn (driver skipped → floor already freed by
        // triggerMeetingSpeak), advance to the next queued speaker rather than stalling the queue. A floor
        // DENIAL re-enters here too, but the holds-floor guard above makes the recursion a safe no-op (it waits
        // for the holder's release to drive the next drain).
        if (!this.triggerMeetingSpeak(next)) {
            this.drainSpeakerQueue(roomKey);
        }
    }

    /**
     * Claims the room floor and triggers the model to speak exactly one turn (meeting mode). Returns `false`
     * (stays silent) when another agent holds the floor. Shared by the matcher path and the moderator drainer.
     */
    private triggerMeetingSpeak(active: ActiveBridgeSession): boolean {
        if (active.RoomKey) {
            const floor = this.roomCoordinator.TakeFloor(active.RoomKey, active.AgentSessionID);
            if (!floor.Granted) {
                LogStatus(`[AIBridgeEngine] floor denied (${floor.Reason}) for bridge ${active.SessionBridgeID} — staying silent`);
                return false;
            }
            LogStatusEx({ message: `[AIBridgeEngine][diag] floor GRANTED to bridge ${active.SessionBridgeID} — triggering the model to speak`, verboseOnly: true });
            this.armFloorHold(active);
        }
        LogStatusEx({ message: `[AIBridgeEngine][diag] meeting trigger → RequestSpokenUpdate for bridge ${active.SessionBridgeID}`, verboseOnly: true });
        // The trigger can be SKIPPED by the driver (a response already in flight) or commit nothing — in which
        // case no assistant transcript will ever arrive to release the floor. If the driver reports "not sent"
        // (explicit `false`), release the floor immediately so the room doesn't wedge until the safety timer,
        // and advance the queue. `undefined`/`true` ⇒ a turn was triggered, so hold the floor as normal.
        const sent = active.RealtimeSession.RequestSpokenUpdate?.('');
        if (sent === false) {
            LogStatusEx({ message: `[AIBridgeEngine][diag] trigger NOT sent (driver skipped) for bridge ${active.SessionBridgeID} — releasing floor + advancing`, verboseOnly: true });
            this.releaseRoomFloor(active, /*skipDrain*/ true); // the drainSpeakerQueue caller advances the queue
            return false;
        }
        return true;
    }

    /** A short label for an `AgentSessionID` (the agent's first name) for diagnostics. */
    private agentSessionLabel(sessionId: string): string {
        for (const s of this.activeSessions.values()) {
            if (s.AgentSessionID.toLowerCase() === sessionId.toLowerCase()) {
                return s.AgentNames[0] ?? s.AgentSessionID.slice(0, 8);
            }
        }
        return sessionId.slice(0, 8);
    }

    /** Clears a room's moderator state (lookback, queue, counter) — on barge-in (queue only) or teardown (all). */
    private clearRoomModeratorState(roomKey: string, full: boolean): void {
        const key = roomKey.toLowerCase();
        this.roomSpeakerQueue.delete(key);
        this.roomPendingTurn.delete(key); // a barge-in/teardown invalidates any turn staged behind an in-flight call
        if (full) {
            this.roomLookback.delete(key);
            this.roomConsecutiveAgentTurns.delete(key);
            this.roomModeratorBusy.delete(key);
        }
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
                if (active.DisableAutoResponse) {
                    this.triggerMeetingSpeak(active);
                } else {
                    // 1:1 CALL: the model has server-VAD auto-response on (same as the browser client-direct
                    // path), so it ALREADY answered this turn — one clean stream. Forcing a second
                    // `RequestSpokenUpdate` here would race the auto-response (double-answer + overlap/chop).
                    // Rely on auto-response.
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

    /**
     * Retroactively switches an already-running session into **meeting mode** (auto-response off +
     * addressed-only) — used when a room becomes multi-agent and the first (1:1) agent must stop
     * auto-responding. **Capability-gated**: only sessions whose provider reports
     * {@link RealtimeSessionCapabilities.CanReconfigureTurnMode} can change turn mode on a live socket;
     * others (e.g. Gemini, fixed at connect) are left in their start mode — no dead-method call. Idempotent.
     *
     * @param sessionBridgeID The bridge to re-gate.
     * @param matcher The addressed-matcher (the agent's names) the re-gated session should speak on.
     * @returns `true` if now in meeting mode (or already was); `false` if the session is unknown or the
     *   provider can't reconfigure mid-session.
     */
    public ReconfigureSessionToMeeting(sessionBridgeID: string, matcher: IAddressedMatcher): boolean {
        const active = this.activeSessions.get(sessionBridgeID.toLowerCase());
        if (!active) {
            return false;
        }
        if (active.DisableAutoResponse) {
            return true; // already meeting mode — nothing to do
        }
        if (active.RealtimeSession.Capabilities?.CanReconfigureTurnMode !== true) {
            // LOUD: this agent was the FIRST in the room (1:1 auto-response) and its provider can't switch a
            // live socket to meeting mode (e.g. Gemini). It will keep auto-responding to ALL room audio,
            // bypassing the turn moderator and likely talking over the other agents. The robust fix is to
            // reconnect it in meeting mode; until then, prefer a re-configurable provider (OpenAI) as the FIRST
            // agent in a room that will become multi-agent. See the Bridges guide §9.
            LogError(
                `[AIBridgeEngine] ⚠️ bridge ${sessionBridgeID} CANNOT re-gate to meeting mode mid-session ` +
                    `(provider config fixed at connect, e.g. Gemini). It stays in 1:1 auto-response and will ` +
                    `respond to ALL room audio, bypassing the moderator — use an OpenAI-realtime agent as the ` +
                    `first agent in multi-agent rooms.`,
            );
            return false;
        }
        active.RealtimeSession.Reconfigure?.({ DisableAutoResponse: true });
        active.DisableAutoResponse = true;
        active.TurnPolicy = new TurnTakingPolicy({ Mode: 'Passive', Matcher: matcher });
        // The agent started 1:1, so its system prompt has no meeting-discipline clause. The Reconfigure flips
        // the ENFORCEMENT (auto-response off + addressed gate), but tell the agent too so its replies are
        // meeting-appropriate. A context note is additive (doesn't clobber the prompt) — no-op if unsupported.
        active.RealtimeSession.SendContextNote?.(MEETING_REGATE_CONTEXT_NOTE);
        LogStatus(`[AIBridgeEngine] re-gated bridge ${sessionBridgeID} to meeting mode (room became multi-agent)`);
        return true;
    }

    /**
     * Marks the session as holding the room floor and arms the safety release timer (so a missed
     * end-of-speech can't wedge the floor closed). Called right after a granted {@link TakeFloor}.
     *
     * @param active The session that just claimed the floor.
     */
    private armFloorHold(active: ActiveBridgeSession): void {
        active.HoldsFloor = true;
        if (active.FloorReleaseTimer) {
            clearTimeout(active.FloorReleaseTimer);
        }
        LogStatusEx({ message: `[AIBridgeEngine][diag] floor HELD by bridge ${active.SessionBridgeID} (agentSession ${active.AgentSessionID}) — safety release in ${this.floorMaxHoldMs}ms if no assistant transcript`, verboseOnly: true });
        active.FloorReleaseTimer = setTimeout(() => {
            LogStatusEx({ message: `[AIBridgeEngine][diag] floor SAFETY-RELEASE fired for bridge ${active.SessionBridgeID} — it held the floor for ${this.floorMaxHoldMs}ms without producing a reply (the triggered turn never yielded audio)`, verboseOnly: true });
            this.releaseRoomFloor(active);
        }, this.floorMaxHoldMs);
    }

    /**
     * Releases the room floor this session holds (if any) and clears the safety timer. Idempotent and safe
     * for non-room / single-agent sessions (a no-op when the session never held the floor). Called on the
     * agent's own final transcript, the safety timeout, and teardown.
     *
     * @param active The session to release the floor for.
     */
    private releaseRoomFloor(active: ActiveBridgeSession, skipDrain = false): void {
        if (active.FloorReleaseTimer) {
            clearTimeout(active.FloorReleaseTimer);
            active.FloorReleaseTimer = undefined;
        }
        const held = active.HoldsFloor;
        if (active.RoomKey && held) {
            this.roomCoordinator.ReleaseFloor(active.RoomKey, active.AgentSessionID);
            LogStatusEx({ message: `[AIBridgeEngine][diag] floor RELEASED by bridge ${active.SessionBridgeID} (agentSession ${active.AgentSessionID}) — next addressed agent can now take it`, verboseOnly: true });
        }
        active.HoldsFloor = false;
        // Floor freed → trigger the next agent the moderator queued for this turn (serialized speaking). Skipped
        // when the caller (a skipped trigger inside drainSpeakerQueue) will itself advance the queue — avoids a
        // double drain.
        if (active.RoomKey && held && !skipDrain) {
            this.drainSpeakerQueue(active.RoomKey);
        }
    }

    /**
     * Elects this session as its room's transcript **scribe** iff a transcript sink is registered, the
     * session has a room key, and no scribe exists for that room yet. Exactly one scribe per room writes the
     * unified transcript, so a multi-agent room records one copy (the scribe hears everyone), not N.
     *
     * @param active The freshly connected session.
     */
    private electTranscriptScribe(active: ActiveBridgeSession): void {
        if (!this.transcriptSink || !active.RoomKey) {
            return;
        }
        const roomKey = active.RoomKey.toLowerCase();
        if (!this.roomScribes.has(roomKey)) {
            this.roomScribes.set(roomKey, active.SessionBridgeID);
            active.IsTranscriptScribe = true;
            LogStatus(`[AIBridgeEngine] Bridge ${active.SessionBridgeID} is the transcript scribe for its room.`);
        }
    }

    /**
     * Releases this session's scribe role on teardown and HANDS OFF to another live session in the same
     * room (so the transcript continues when the original scribe leaves a still-occupied room). No-op when
     * the session wasn't the scribe. Called during disconnect while the session is still in the active map.
     *
     * @param active The session being torn down.
     */
    private releaseTranscriptScribe(active: ActiveBridgeSession): void {
        if (!active.RoomKey) {
            return;
        }
        const roomKey = active.RoomKey.toLowerCase();
        if (this.roomScribes.get(roomKey) !== active.SessionBridgeID) {
            return; // not the scribe
        }
        this.roomScribes.delete(roomKey);
        active.IsTranscriptScribe = false;
        for (const other of this.activeSessions.values()) {
            if (other !== active && other.RoomKey?.toLowerCase() === roomKey) {
                this.roomScribes.set(roomKey, other.SessionBridgeID);
                other.IsTranscriptScribe = true;
                LogStatus(`[AIBridgeEngine] Transcript scribe handed to bridge ${other.SessionBridgeID} (prior scribe left).`);
                return;
            }
        }
    }

    /**
     * Emits one FINAL transcript line to the registered sink — only from the room's scribe, so the room
     * gets a single unified transcript. The scribe's OWN speech (`assistant`) is attributed to it; everything
     * it hears (`user`) is recorded as heard. Best-effort: a sink failure is logged, never fatal to media.
     *
     * @param active The scribe session.
     * @param t The final transcript line.
     */
    private emitTranscriptLine(active: ActiveBridgeSession, t: RealtimeTranscript): void {
        if (!active.IsTranscriptScribe || !this.transcriptSink || !active.RoomKey) {
            return;
        }
        const text = (t.Text ?? '').trim();
        if (!text) {
            return;
        }
        const isAgentSpeech = t.Role === 'assistant';
        void Promise.resolve(
            this.transcriptSink(
                {
                    RoomKey: active.RoomKey,
                    AgentSessionID: active.AgentSessionID,
                    AgentID: active.AgentID,
                    IsAgentSpeech: isAgentSpeech,
                    // The bot's own speech is labeled with its participant id; a 'user' line is attributed to
                    // the last inbound speaker (diarization) so the transcript records WHO said it, not just
                    // "a user". Falls back to undefined when the provider doesn't diarize.
                    SpeakerParticipantID: isAgentSpeech ? active.BotParticipantID : active.LastInboundSpeaker,
                    Text: text,
                },
                active.ContextUser,
                active.MetadataProvider,
            ),
        ).catch((err) =>
            LogError(
                `[AIBridgeEngine] transcript sink failed for bridge ${active.SessionBridgeID}: ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            ),
        );
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
    // Janitor — orphan reconciliation + stale-session sweep.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Reaps **live, same-process** sessions that have gone stale — idle past {@link SESSION_IDLE_TTL_MS}
     * (no inbound transcript) or running past {@link SESSION_MAX_DURATION_MS}. This is the same-process
     * complement to {@link ReconcileOrphans} (prior-boot orphans): it covers a missed leave event, a
     * rosterless transport with no occupancy signal, and "the bot joined but nobody came." Each reap routes
     * through {@link StopBridgeSession} using the session's own user/provider, so the co-agent run finalizes.
     *
     * Tolerant: a single failed stop is logged and the sweep continues. Safe to call on any cadence.
     *
     * @param nowMs Current epoch-ms (injectable for tests; defaults to `Date.now()`).
     * @returns The number of stale sessions reaped.
     */
    public async SweepStaleSessions(nowMs: number = Date.now()): Promise<number> {
        const stale = [...this.activeSessions.values()].filter(
            (s) => nowMs - s.LastActivityMs > this.idleTtlMs || nowMs - s.ConnectedAtMs > this.maxDurationMs,
        );
        let reaped = 0;
        for (const active of stale) {
            const idle = nowMs - active.LastActivityMs > this.idleTtlMs;
            LogStatus(
                `[AIBridgeEngine] Stale sweep reaping bridge ${active.SessionBridgeID} ` +
                    `(${idle ? 'idle' : 'max-duration'}) — auto-leaving.`,
            );
            try {
                await this.StopBridgeSession(active.SessionBridgeID, 'HostEnded', active.ContextUser, active.MetadataProvider);
                reaped++;
            } catch (err) {
                LogError(
                    `[AIBridgeEngine] stale sweep stop failed for ${active.SessionBridgeID}: ` +
                        `${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
        return reaped;
    }

    /**
     * Starts the self-scheduled stale-session sweep ({@link SweepStaleSessions} every
     * {@link STALE_SWEEP_INTERVAL_MS}). Idempotent — calling again is a no-op while a sweep is scheduled.
     * The host opts in once at startup; {@link StopStaleSessionSweep} cancels it (e.g. for tests/shutdown).
     */
    public StartStaleSessionSweep(intervalMs: number = STALE_SWEEP_INTERVAL_MS): void {
        if (this.staleSweepTimer) {
            return;
        }
        this.staleSweepTimer = setInterval(() => {
            void this.SweepStaleSessions().catch((err) =>
                LogError(`[AIBridgeEngine] stale sweep tick failed: ${err instanceof Error ? err.message : String(err)}`),
            );
        }, intervalMs);
        // Don't keep the process alive solely for the sweep (Node-only; guarded for non-Node hosts).
        (this.staleSweepTimer as { unref?: () => void })?.unref?.();
    }

    /** Cancels the self-scheduled stale-session sweep, if running. */
    public StopStaleSessionSweep(): void {
        if (this.staleSweepTimer) {
            clearInterval(this.staleSweepTimer);
            this.staleSweepTimer = undefined;
        }
    }

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
     * Binds the SDK factory onto a resolved driver before `Connect`. Precedence: a per-session
     * {@link StartBridgeSessionParams.BindSdk} override wins; otherwise the provider's registered native
     * binding from the {@link BridgeNativeSdkRegistry} is applied. When neither exists the driver keeps its
     * default factory (which fails loudly at connect if it actually needs an SDK — e.g. LoopbackBridge has
     * no SDK and needs no binding, so this is a harmless no-op for it).
     *
     * @param params The start params (its `BindSdk` is the override).
     * @param driver The resolved driver to bind onto.
     */
    private bindDriverSdk(params: StartBridgeSessionParams, driver: BaseRealtimeBridge): void {
        const override: BridgeNativeSdkBinding | undefined = params.BindSdk;
        if (override) {
            override(driver);
            return;
        }
        BridgeNativeSdkRegistry.Instance.Apply(params.Provider.DriverClass, driver);
    }

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
        // Carry the realtime model's audio format down to the media-transport driver so it resamples to the
        // rate the model actually consumes/emits (OpenAI 24 kHz; Gemini Live 16 kHz IN). Without this a
        // bridge feeds e.g. Gemini 24 kHz audio it can't parse and the agent never responds. Defaults keep
        // every existing driver/model on 24 kHz. See plans/realtime/realtime-core-host-convergence.md.
        return {
            Features: params.Provider.SupportedFeaturesObject ?? {},
            ProviderName: params.Provider.Name,
            Address: params.Address,
            Configuration: {
                ...params.Configuration,
                InboundSampleRate: params.RealtimeSession.InputSampleRate ?? 24000,
                OutboundSampleRate: params.RealtimeSession.OutputSampleRate ?? 24000,
            },
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
        // Cancel any pending auto-leave timer so it can't fire against an already-torn-down session.
        if (active.LeaveGraceTimer) {
            clearTimeout(active.LeaveGraceTimer);
            active.LeaveGraceTimer = undefined;
        }
        // Hand the transcript scribe role to another live session in the room (if this was the scribe), so a
        // multi-agent room keeps recording after the first agent leaves. Done before the active map removal.
        this.releaseTranscriptScribe(active);
        // Drop out of the floor-control roster: release the floor if held (so a remaining agent isn't
        // blocked) and unregister so the room's membership count stays accurate.
        this.releaseRoomFloor(active);
        if (active.RoomKey) {
            this.roomCoordinator.UnregisterRoomParticipant(active.RoomKey, active.AgentSessionID);
            // Last agent out → drop the room's moderator state (lookback/queue/counter). A still-occupied room
            // keeps its lookback so the conversation thread survives one agent leaving.
            if (this.roomAgents(active.RoomKey).filter((a) => a.SessionBridgeID !== active.SessionBridgeID).length === 0) {
                this.clearRoomModeratorState(active.RoomKey, true);
            }
        }
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
        // Close the realtime model session too — releases the provider connection AND triggers the
        // co-agent run/prompt-run finalizer the agent layer wrapped onto Close() (otherwise the run dangles
        // in `Running` and the model socket leaks). Tolerant: a provider Close error must not block teardown.
        try {
            await active.RealtimeSession.Close();
        } catch (err) {
            LogError(
                `[AIBridgeEngine] realtime session Close failed for bridge ${active.SessionBridgeID}: ` +
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
        const agentSessionID = row.AgentSessionID;
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
        // Finalize the co-agent run(s) for this session on EVERY teardown path. The same-process `Close()`
        // already finalized them (so this is a no-op there), but the orphan/cross-host reaps reach here
        // WITHOUT a live session — this is the only place their dangling `Running` co-agent run gets closed.
        // Tolerant: a finalizer failure must never block the disconnect bookkeeping.
        if (saved && this.runFinalizer && agentSessionID) {
            try {
                await this.runFinalizer(agentSessionID, reason !== 'Error', contextUser, provider);
            } catch (err) {
                LogError(
                    `[AIBridgeEngine] session run finalizer failed for ${sessionBridgeID}: ` +
                        `${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
        return saved;
    }

    /** Escapes single quotes for safe embedding inside an `ExtraFilter` literal. */
    private escapeSql(value: string): string {
        return value.replace(/'/g, "''");
    }
}
