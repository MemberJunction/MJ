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

import { RealtimeToolDefinition } from './baseRealtime';

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

    /**
     * **Optional raw per-session config blob** — the verbatim `AIAgentSession.Config_` string the
     * session was created with (the host passes it through; it stays opaque to the contract). A
     * data-aware channel parses out only the keys it owns — e.g. the Media channel reads a per-session
     * `mediaCollectionID` override here. Kept as a plain string (not a typed bag) so the base contract
     * stays free of `@memberjunction/core` and channel-agnostic; `null`/absent when the session carries
     * no config. Channels MUST treat it as untrusted input (validate ids before use).
     */
    SessionConfig?: string | null;

    /**
     * **Optional perception sink** — feeds a background context note into the live realtime model
     * (the server-side counterpart of the client channel's `RealtimeChannelContext.SendContextNote`).
     * The host wires this to `IRealtimeSession.SendContextNote` when the provider supports mid-session
     * context injection; a server-side channel calls it to keep the agent aware of what is happening
     * on its surface (a hand went up, who is speaking, time remaining) WITHOUT forcing a spoken reply.
     *
     * Optional because not every provider supports injecting conversation items into an open session
     * (some only accept media frames + tool results), and because the host may construct the context
     * before a live session exists. Channels MUST call it null-safely (`this.Context?.SendContextNote?.(…)`).
     *
     * @param text The perception note to surface to the model (plain text; the channel owns any framing).
     */
    SendContextNote?(text: string): void;
}

/**
 * The result of a server-side channel tool execution ({@link BaseRealtimeChannelServer.ExecuteServerTool}),
 * fed back to the realtime model as the `tool_response`.
 *
 * Deliberately small and serializable — the host (`RealtimeChannelServerHost`) wraps a thrown error
 * into a `{ Success: false }` result so the model always receives a consistent response, and the
 * transport layer (`RealtimeSessionRunner`) serializes `{ success, output }` to the exact JSON shape
 * the model expects (identical to {@link import('../..').RealtimeToolBrokerDeps} non-target tooling).
 */
export interface ServerChannelToolResult {
    /** Whether the tool executed successfully. */
    Success: boolean;

    /**
     * The textual outcome to feed back to the model: a description of what changed on success, or
     * the error to surface on failure (so the model can narrate it — spoken-error-handling).
     */
    Output: string;
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
 * ### Server-executed tool contribution (Phase 2 — now wired)
 * A server-side channel may contribute a **dynamic, runtime-computed** tool vocabulary the agent can
 * invoke server-side (a bot has no browser, so these execute on the server rather than client-side
 * like the {@link import('../..').BaseRealtimeChannelClient} half). The two hooks:
 *
 * - {@link GetServerToolDefinitions} — returns the channel's server-executed tool declarations. May
 *   be **runtime-computed** (per session / per platform state), not only constants — this is what
 *   lets a bridge-contributed channel (e.g. Meeting Controls, a Zoom native whiteboard) declare a
 *   tool set that only exists because of the live connection. Default: `[]` (a state-only channel
 *   like the whiteboard contributes no server tools).
 * - {@link ExecuteServerTool} — executes ONE of this channel's tools and returns the result. Default:
 *   a structured "not implemented" error (never throws), so a channel that declares tools but forgets
 *   to implement execution fails loudly-but-safely rather than crashing the session.
 *
 * The per-session host ({@link RealtimeChannelServerHost}) aggregates every live plugin's
 * {@link GetServerToolDefinitions} into the session's tool set (feeding
 * `RealtimeSessionRunner.ServerChannelTools`) and routes each `{@link ToolNamePrefix}*` tool call back
 * to the owning plugin's {@link ExecuteServerTool}. Tool-name collisions across channels are avoided
 * by each channel's {@link ToolNamePrefix} (mirroring the client half's `ToolNamePrefix`).
 *
 * @remarks
 * Socket/media members (`OnClientMessage`, `SendToClient`) remain deferred with the unified-transport
 * track — when `ISessionTransport` lands, this class grows an injected-transport overload rather than
 * the plan's raw-socket form.
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
     * The shared name prefix of every server-executed tool this channel contributes (e.g.
     * `'MeetingControls_'`). The host routes any tool call whose name starts with this prefix to
     * THIS plugin's {@link ExecuteServerTool}, which is what prevents tool-name collisions when
     * multiple channels are active in one session. A channel that contributes no server tools may
     * leave the default empty string (the host then never routes any call to it).
     *
     * Mirrors the client half's `ToolNamePrefix`. Default: `''` (no server tools).
     */
    public get ToolNamePrefix(): string {
        return '';
    }

    /**
     * Returns this channel's **server-executed** tool declarations — the tools the agent can invoke
     * on this channel that run server-side (a bot has no browser). May be **runtime-computed**: the
     * returned set can depend on the live session, the connected platform, or current channel state,
     * so a bridge-contributed channel can declare a vocabulary that only exists because of the live
     * connection. Every tool's `Name` SHOULD start with {@link ToolNamePrefix} so the host can route
     * its execution back here unambiguously.
     *
     * Invoked by {@link RealtimeChannelServerHost} when assembling the session's tool set (after the
     * plugin's {@link OnSessionStarted}). Default: `[]` (a state-only channel contributes none).
     *
     * @returns The channel's server-executed tool definitions (possibly empty).
     */
    public GetServerToolDefinitions(): RealtimeToolDefinition[] {
        return [];
    }

    /**
     * Executes ONE of this channel's server-side tools (a tool whose name starts with
     * {@link ToolNamePrefix}) and returns the result fed back to the model as the `tool_response`.
     *
     * Implementations should NOT throw — return a `{ Success: false, Output }` result so the model can
     * narrate the failure. The host additionally wraps anything thrown into a structured error, so a
     * throwing implementation can never break the live session. The default implementation returns a
     * structured "not implemented" error, so a channel that declares tools via
     * {@link GetServerToolDefinitions} but forgets to implement execution fails safely and visibly.
     *
     * @param toolName The full tool name the model invoked (begins with {@link ToolNamePrefix}).
     * @param argsJson The raw arguments JSON string the model emitted for the call.
     * @returns The execution result (or a structured error), synchronously or as a promise.
     */
    public ExecuteServerTool(toolName: string, argsJson: string): ServerChannelToolResult | Promise<ServerChannelToolResult> {
        return { Success: false, Output: `Server tool '${toolName}' is declared by channel '${this.ChannelName}' but has no execution implementation.` };
    }

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
