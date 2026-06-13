/**
 * @fileoverview Base class for SERVER-SIDE interactive-channel plugins — the server half of the
 * channel plugin registry (`MJ: AI Agent Channels.ServerPluginClass`), mirroring the client half
 * (`BaseRealtimeChannelClient` in `@memberjunction/ng-conversations`, resolved from the same
 * registry's `ClientPluginClass`).
 *
 * Lives beside {@link import('./baseRealtime').BaseRealtimeModel} because it is a server-side
 * realtime primitive with the same constraint: zero MJ dependencies past `@memberjunction/global`.
 * The DB-aware resolution/orchestration half (reading the channel registry, one-instance-per-session
 * bookkeeping) lives in `@memberjunction/ai-agents` (`RealtimeChannelServerHost`).
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

/**
 * Why an agent session was closed — the server-side channel plugin's view of the session-close
 * provenance. Mirrors the `MJ: AI Agent Sessions.CloseReason` value list (`SessionCloseReason` in
 * `@memberjunction/server`): `'Explicit'` (user hang-up), `'Janitor'` (orphan reconciliation),
 * `'Shutdown'` (graceful host drain), `'Error'` (failure-path teardown). `null` reaches the plugin
 * only for legacy rows closed before the column existed (or when the reason was never stamped).
 */
export type RealtimeChannelCloseReason = 'Explicit' | 'Janitor' | 'Shutdown' | 'Error';

/**
 * Immutable session facts handed to a {@link BaseRealtimeChannelServer} at
 * {@link BaseRealtimeChannelServer.Initialize}. Deliberately **plain data** (string ids, no entity
 * or `UserInfo` objects) so the base contract stays free of `@memberjunction/core` — concrete
 * plugins that need richer server context load it themselves in the packages they ship in.
 */
export interface RealtimeChannelServerContext {
    /** The durable `MJ: AI Agent Sessions` row id this plugin instance is bound to. */
    AgentSessionID: string;

    /** The session's agent id (`AIAgentSession.AgentID` — the co-agent on realtime voice sessions). */
    AgentID: string;

    /** The owning user's id (`AIAgentSession.UserID`) — ownership is enforced host-side on every relay. */
    UserID: string;

    /** The conversation the session is attached to, or `null` when the session carries none. */
    ConversationID: string | null;
}

/**
 * Base class for SERVER-SIDE interactive-channel plugins (per `plans/ai-agent-sessions.md` →
 * "Pluggable Interfaces (`IAgentChannelServer` & `IAgentChannelClient`)").
 *
 * ### Relationship to the plan's `IAgentChannelServer`
 * The plan's interface anticipates **server-bridged media** — a channel that owns sockets, receives
 * demultiplexed `OnClientMessage` payloads from a unified `ISessionTransport`, and streams data back.
 * That transport plane is an independent, not-yet-built track. What exists TODAY is the
 * **client-direct** topology: channel plugins execute in the browser
 * (`BaseRealtimeChannelClient`), and the server's per-channel touchpoints are the durable lifecycle
 * events — session minted, channel state-of-record saved, session closed. This base class is the
 * pragmatic adaptation to that reality:
 *
 * - `Initialize(ctx)` / `Dispose()` keep the plan's lifecycle bracket (and mirror the client half).
 * - `OnClientMessage` / `SendToClient` / socket ownership are **deferred** with the transport track —
 *   when `ISessionTransport` lands, this class grows an injected-transport overload rather than the
 *   plan's raw-socket form (the plan itself refines them away; see its "Unified Session Transport").
 * - The lifecycle hooks below ({@link OnSessionStarted} / {@link OnChannelStateSave} /
 *   {@link OnSessionClosed}) are the events the shipping session machinery actually emits.
 *
 * ### Registration & resolution (mirrors the client half exactly)
 * Concrete plugins are `@RegisterClass(BaseRealtimeChannelServer, '<ServerPluginClass>')` and are
 * resolved at session start from the ACTIVE `MJ: AI Agent Channels` rows: each row's
 * `ServerPluginClass` is the ClassFactory key. Rows whose key has no registration are skipped with
 * a log — never fatal; a session always proceeds with whatever server plugins resolve. Ship a
 * `Load<YourChannel>Server()` no-op beside the class and call it from a static code path so
 * bundlers cannot tree-shake the registration away.
 *
 * ### Lifecycle — ONE INSTANCE PER SESSION (not a singleton)
 * `ClassFactory.CreateInstance` → {@link Initialize}(ctx) → {@link OnSessionStarted} → zero or more
 * {@link OnChannelStateSave} calls (one per debounced client state-save landing on the server) →
 * {@link OnSessionClosed}(reason) → {@link Dispose}. Disposal is deliberately **deferred briefly**
 * after close by the host so the client's final post-close state flush (a legitimate, contract-
 * sanctioned late save) still routes through the plugin.
 *
 * ### Failure tolerance (hard contract)
 * Every hook is invoked inside a host-side try/catch: a throwing plugin is logged and the session
 * proceeds untouched — a channel plugin can never break a live call or block persistence.
 * Implementations should still prefer returning benign results over throwing.
 *
 * @remarks
 * **TODO (documented seam, not yet wired): server-executed tool contribution.** The server-bridged
 * topology's `RealtimeSessionRunner` accepts extra tools via `RealtimeSessionRunnerDeps.ExtraTools`,
 * which is the natural place for a channel server to contribute server-executed tools. It is NOT
 * wired here because today no code path gives that runner per-session channel plugin instances:
 * server-bridged runs do not mint `AIAgentSession` rows through `SessionManager`, and client-direct
 * sessions (which do) never construct a server-side runner. When the server-bridged path adopts
 * SessionManager-minted sessions, add `GetServerToolDefinitions()` / `ExecuteServerTool()` hooks
 * here and feed them into the runner's tool set.
 */
export abstract class BaseRealtimeChannelServer {
    /**
     * The bound session context, available from {@link Initialize} until {@link Dispose}.
     * `null` outside that window — guard with `?.` in any code that can run early/late.
     */
    protected Context: RealtimeChannelServerContext | null = null;

    /**
     * The channel definition name — MUST match the `MJ: AI Agent Channels` row's `Name`
     * (e.g. `'Whiteboard'`). The host routes {@link OnChannelStateSave} by the registry row's
     * name and warns when a resolved plugin's `ChannelName` disagrees with its row.
     */
    public abstract get ChannelName(): string;

    /**
     * Binds the session context and invokes the {@link OnInitialize} hook. Called exactly once per
     * session by the host, right after ClassFactory instantiation and before any lifecycle hook.
     */
    public Initialize(ctx: RealtimeChannelServerContext): void {
        this.Context = ctx;
        this.OnInitialize();
    }

    /**
     * Subclass hook invoked from {@link Initialize} once {@link Context} is bound — allocate any
     * per-session state here. Default: no-op.
     */
    protected OnInitialize(): void {
        // default: nothing to initialize
    }

    /**
     * Invoked by the host immediately after {@link Initialize}, when the durable session record has
     * been persisted (`Status = 'Active'`) — the session id, agent, and conversation are all in
     * {@link Context}. Default: no-op.
     */
    public async OnSessionStarted(): Promise<void> {
        // default: nothing to do at session start
    }

    /**
     * Invoked when the client's debounced channel-state save for THIS channel lands on the server,
     * BEFORE the state is persisted onto the session's `MJ: AI Agent Session Channels` row.
     *
     * The plugin may **validate/normalize** the payload: return a replacement JSON string to persist
     * instead of `stateJson`, or `null` to persist the original unchanged (the default). The host
     * treats a thrown error, a non-string, or an empty string as "keep the original" — a plugin can
     * therefore never lose a state save, only improve it.
     *
     * @param stateJson The raw state-of-record payload the client submitted (already size-capped
     *   host-side).
     * @returns The normalized payload to persist, or `null` to keep `stateJson` as-is.
     */
    public async OnChannelStateSave(stateJson: string): Promise<string | null> {
        return null; // default: persist the client's payload untouched
    }

    /**
     * Invoked when the session is closed — from ANY close path: the user's explicit hang-up, the
     * janitor's orphan/staleness sweeps, the graceful shutdown drain, or an error-path teardown
     * (the reason says which). Fired once per session; {@link Dispose} follows after the host's
     * brief post-close linger window (during which late state saves still route here first).
     * Default: no-op.
     *
     * @param closeReason The persisted close provenance, or `null` for legacy/unstamped rows.
     */
    public async OnSessionClosed(closeReason: RealtimeChannelCloseReason | null): Promise<void> {
        // default: nothing to do at session close
    }

    /**
     * Tears the plugin down: release any per-session resources, then drop the context. Subclasses
     * overriding this MUST call `super.Dispose()`. Invoked by the host after the post-close linger
     * window elapses (or immediately when the host is configured with no linger).
     */
    public Dispose(): void {
        this.Context = null;
    }
}
