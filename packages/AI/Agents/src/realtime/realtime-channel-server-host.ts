/**
 * @fileoverview Process-wide host for SERVER-SIDE interactive-channel plugins — the resolution +
 * per-session lifecycle half of the `BaseRealtimeChannelServer` contract (`@memberjunction/ai`).
 *
 * The base class is deliberately MJ-core-free; this host is the DB-aware piece: it reads the ACTIVE
 * `MJ: AI Agent Channels` registry rows at session start, resolves each row's `ServerPluginClass`
 * through the MJ ClassFactory into a fresh per-session plugin instance (the exact mirror of how
 * `VoiceSessionService.loadActiveChannels` resolves `ClientPluginClass` in the browser), and routes
 * the session lifecycle events into those instances:
 *
 *  - **session started** — `SessionManager.CreateSession` (MJServer) → {@link RealtimeChannelServerHost.OnSessionStarted}
 *  - **channel state saved** — the `SaveSessionChannelState` mutation → {@link RealtimeChannelServerHost.OnChannelStateSave}
 *    (pre-persistence; the plugin may normalize the payload)
 *  - **session closed** — `SessionManager.CloseSession` (every close path: explicit, janitor,
 *    shutdown drain, error teardown) → {@link RealtimeChannelServerHost.OnSessionClosed}
 *
 * **Failure posture:** nothing in here ever throws to a caller. Registry failures degrade to "no
 * server plugins"; a throwing plugin hook is logged and skipped; an unknown session is a no-op.
 * Channel plugins can never break a live call or block persistence.
 *
 * **`BaseSingleton` (per MJ rule #7):** plugin instances are in-memory, per-process state shared
 * between the resolver layer and `SessionManager`/`SessionJanitor` call paths — a plain instance
 * field on either would split the state, so the host is a Global-Object-Store-backed singleton.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import {
    BaseRealtimeChannelServer,
    RealtimeChannelServerContext,
    RealtimeChannelCloseReason,
    RealtimeToolDefinition,
    ServerChannelToolResult,
} from '@memberjunction/ai';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { isRealtimeChannelServerDataAware } from './realtime-channel-server-data-context';

/** Entity name — kept in sync with the session machinery's `MJ:`-prefix convention. */
const CHANNEL_ENTITY = 'MJ: AI Agent Channels';

/** Narrow, read-only registry row shape read at session start from {@link AIEngineBase}'s cached `AgentChannels`. */
interface RealtimeChannelServerDefinitionRow {
    ID: string;
    Name: string;
    ServerPluginClass: string | null;
}

/** Per-session plugin bookkeeping: instances keyed by registry-row channel name (lowercased). */
interface SessionPluginEntry {
    /** channel name (trimmed, lowercased) → the session's one plugin instance for that channel. */
    plugins: Map<string, BaseRealtimeChannelServer>;
    /** Pending deferred-disposal timer once the session closed; null while the session is live. */
    disposeTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Default post-close linger (ms) before plugin instances are disposed. The client's channel-state
 * pipeline debounces saves (~3s) and flushes once at teardown — that final flush legitimately lands
 * AFTER `CloseAgentSession`, and it is the state of record a future resume restores, so it must
 * still route through the plugin's normalization hook. 15s comfortably covers the flush window.
 */
const DEFAULT_DISPOSE_LINGER_MS = 15_000;

/**
 * Singleton host that owns every live `BaseRealtimeChannelServer` instance in this process —
 * one instance per (session × active channel row with a resolvable `ServerPluginClass`).
 *
 * ### Lifecycle routing (who calls what)
 * | Host method | Invoked from | Plugin hook(s) fired |
 * |---|---|---|
 * | {@link OnSessionStarted} | `SessionManager.CreateSession` after the session row persists | `Initialize(ctx)` then `OnSessionStarted()` per resolved plugin |
 * | {@link OnChannelStateSave} | `SaveSessionChannelState` resolver, pre-persistence | the matching channel's `OnChannelStateSave(stateJson)` |
 * | {@link OnSessionClosed} | `SessionManager.CloseSession` (all close provenances) | `OnSessionClosed(reason)` per plugin, then deferred `Dispose()` |
 *
 * ### Janitor / cross-host notes
 * - The janitor's sweeps run on EVERY instance and funnel through `SessionManager.CloseSession`,
 *   so a session whose plugins live in this process is eventually cleaned up here even when its
 *   client vanished — including when ANOTHER instance won the close race (`CloseSession`'s
 *   already-closed path still notifies this host, and an unknown session is a no-op).
 * - A close for a session minted on a different host/boot simply finds no local instances.
 */
export class RealtimeChannelServerHost extends BaseSingleton<RealtimeChannelServerHost> {
    /** session id (lowercased) → that session's plugin instances + disposal state. */
    private sessions = new Map<string, SessionPluginEntry>();

    /**
     * Post-close linger (ms) before {@link BaseRealtimeChannelServer.Dispose} runs, so the client's
     * legitimate post-close state flush still routes through the plugin. `0` disposes immediately
     * (used by tests). Mutable on purpose — a deployment-level knob, not per-session state.
     */
    public DisposeLingerMs = DEFAULT_DISPOSE_LINGER_MS;

    protected constructor() {
        super();
    }

    /** Process-wide singleton accessor (Global Object Store backed via {@link BaseSingleton}). */
    public static get Instance(): RealtimeChannelServerHost {
        return super.getInstance<RealtimeChannelServerHost>();
    }

    /** Number of sessions currently holding live (or close-lingering) plugin instances. */
    public get ActiveSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Returns the live plugin instance for `(agentSessionID, channelName)`, or `null` when none
     * exists (no plugin resolved for that channel, unknown session, or already disposed).
     * Lookup is case/whitespace-insensitive on both keys.
     */
    public GetSessionPlugin(agentSessionID: string, channelName: string): BaseRealtimeChannelServer | null {
        const entry = this.sessions.get(this.sessionKey(agentSessionID));
        return entry?.plugins.get(this.channelKey(channelName)) ?? null;
    }

    // ──────────────────────────────────────────────────────────────────────────────
    // Server-executed channel tools — the deferred "channel tool contribution feeding
    // RealtimeSessionRunner.ExtraTools" the realtime guide flagged. The host aggregates every
    // live plugin's GetServerToolDefinitions and routes each prefixed tool call back to the owner.
    // ──────────────────────────────────────────────────────────────────────────────

    /**
     * Aggregates the **server-executed** tool definitions every live plugin of a session contributes
     * (each plugin's {@link BaseRealtimeChannelServer.GetServerToolDefinitions}, possibly
     * runtime-computed) into one flat set — the per-session server-channel tool vocabulary fed into
     * `RealtimeSessionRunner.ServerChannelTools`.
     *
     * Tolerant by contract: a plugin whose `GetServerToolDefinitions` throws is logged and skipped,
     * never breaking the assembly. An unknown session returns `[]`.
     *
     * @param agentSessionID The session whose channels' server tools to collect.
     * @returns The aggregated tool definitions across all of the session's live channel plugins.
     */
    public GetSessionServerTools(agentSessionID: string): RealtimeToolDefinition[] {
        const entry = this.sessions.get(this.sessionKey(agentSessionID));
        if (!entry) {
            return [];
        }
        const tools: RealtimeToolDefinition[] = [];
        for (const [name, plugin] of entry.plugins) {
            try {
                const channelTools = plugin.GetServerToolDefinitions();
                if (Array.isArray(channelTools)) {
                    tools.push(...channelTools);
                }
            } catch (error) {
                LogError(
                    `[RealtimeChannelServerHost] GetServerToolDefinitions failed for session ${agentSessionID} / ` +
                        `channel '${name}' — skipping its tools: ${this.message(error)}`,
                );
            }
        }
        return tools;
    }

    /**
     * Routes ONE server-executed tool call to the session's plugin that owns it, matched by the
     * plugin's {@link BaseRealtimeChannelServer.ToolNamePrefix}, and returns its result. Resolution
     * picks the plugin whose (non-empty) prefix the tool name starts with — the longest matching
     * prefix wins, so overlapping prefixes resolve deterministically.
     *
     * Never throws: an unowned tool (no channel prefix matches), an unknown session, or a plugin that
     * throws all resolve to a structured `{ Success: false }` result so the model always receives a
     * consistent `tool_response`.
     *
     * @param agentSessionID The session the tool call belongs to.
     * @param toolName The full tool name the model invoked.
     * @param argsJson The raw arguments JSON the model emitted.
     * @returns The execution result (or a structured error).
     */
    public async ExecuteSessionServerTool(
        agentSessionID: string,
        toolName: string,
        argsJson: string,
    ): Promise<ServerChannelToolResult> {
        const plugin = this.resolveToolOwner(agentSessionID, toolName);
        if (!plugin) {
            return { Success: false, Output: `No active channel owns the server tool '${toolName}' for session ${agentSessionID}.` };
        }
        try {
            return await plugin.ExecuteServerTool(toolName, argsJson);
        } catch (error) {
            LogError(
                `[RealtimeChannelServerHost] ExecuteServerTool failed for session ${agentSessionID} / tool '${toolName}': ${this.message(error)}`,
            );
            return { Success: false, Output: `Server tool '${toolName}' failed: ${this.message(error)}` };
        }
    }

    /** Returns `true` when the given tool name is owned by a live channel of the session. */
    public OwnsServerTool(agentSessionID: string, toolName: string): boolean {
        return this.resolveToolOwner(agentSessionID, toolName) !== null;
    }

    /**
     * Finds the live plugin of a session whose {@link BaseRealtimeChannelServer.ToolNamePrefix} the
     * tool name starts with. The longest matching prefix wins so overlapping prefixes
     * (`'Meeting_'` vs `'MeetingControls_'`) resolve to the most specific channel.
     */
    private resolveToolOwner(agentSessionID: string, toolName: string): BaseRealtimeChannelServer | null {
        const entry = this.sessions.get(this.sessionKey(agentSessionID));
        if (!entry) {
            return null;
        }
        let best: BaseRealtimeChannelServer | null = null;
        let bestPrefixLength = -1;
        for (const plugin of entry.plugins.values()) {
            const prefix = plugin.ToolNamePrefix;
            if (prefix && toolName.startsWith(prefix) && prefix.length > bestPrefixLength) {
                best = plugin;
                bestPrefixLength = prefix.length;
            }
        }
        return best;
    }

    /**
     * Session-started entry point. Loads the ACTIVE channel registry rows, resolves each row's
     * `ServerPluginClass` through the ClassFactory into ONE fresh instance for this session, and
     * brackets each with `Initialize(ctx)` + `OnSessionStarted()`. Rows with no registered plugin
     * are skipped with a log; a plugin whose start bracket throws is dropped (logged) without
     * touching its siblings. Never throws — any registry/host failure degrades to "no plugins".
     *
     * Idempotent per session: a second start notification for a session that already holds
     * instances is ignored (logged) rather than double-initializing.
     */
    public async OnSessionStarted(
        ctx: RealtimeChannelServerContext,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        try {
            const key = this.sessionKey(ctx.AgentSessionID);
            if (this.sessions.has(key)) {
                LogStatus(`[RealtimeChannelServerHost] Session ${ctx.AgentSessionID} already has server channel plugins — ignoring duplicate start.`);
                return;
            }
            const rows = await this.fetchChannelDefinitions(contextUser, provider);
            const plugins = await this.instantiateSessionPlugins(rows, ctx, contextUser, provider);
            if (plugins.size > 0) {
                this.sessions.set(key, { plugins, disposeTimer: null });
            }
        } catch (error) {
            LogError(`[RealtimeChannelServerHost] OnSessionStarted failed for session ${ctx.AgentSessionID}: ${this.message(error)}`);
        }
    }

    /**
     * Channel-state-save entry point, invoked PRE-persistence. Routes the payload to the session's
     * matching plugin and returns the string to persist:
     *  - no live plugin for the channel (or unknown session) → the original `stateJson`;
     *  - the plugin returns a non-empty replacement string → that replacement;
     *  - the plugin returns `null`/empty/non-string, or throws (logged) → the original `stateJson`.
     *
     * A plugin can therefore only ever *transform* a save — it can never lose or block one.
     */
    public async OnChannelStateSave(agentSessionID: string, channelName: string, stateJson: string): Promise<string> {
        const plugin = this.GetSessionPlugin(agentSessionID, channelName);
        if (!plugin) {
            return stateJson;
        }
        try {
            const replacement = await plugin.OnChannelStateSave(stateJson);
            if (typeof replacement === 'string' && replacement.length > 0) {
                return replacement;
            }
        } catch (error) {
            LogError(
                `[RealtimeChannelServerHost] OnChannelStateSave plugin failure for session ${agentSessionID} / ` +
                    `channel '${channelName}' — persisting the original state: ${this.message(error)}`,
            );
        }
        return stateJson;
    }

    /**
     * Session-closed entry point — invoked from EVERY close provenance (explicit, janitor sweeps,
     * shutdown drain, error teardown; `SessionManager.CloseSession` is the single funnel). Fires
     * each plugin's `OnSessionClosed(reason)` (failures logged, siblings unaffected), then defers
     * `Dispose()` by {@link DisposeLingerMs} so the client's post-close state flush still routes
     * through the plugins. Idempotent: an unknown session, or one whose close hooks already fired
     * (disposal pending), is a no-op. Never throws.
     */
    public async OnSessionClosed(agentSessionID: string, closeReason: RealtimeChannelCloseReason | null): Promise<void> {
        const key = this.sessionKey(agentSessionID);
        const entry = this.sessions.get(key);
        if (!entry || entry.disposeTimer) {
            return; // unknown session, or close hooks already fired and disposal is pending
        }
        for (const [name, plugin] of entry.plugins) {
            try {
                await plugin.OnSessionClosed(closeReason);
            } catch (error) {
                LogError(
                    `[RealtimeChannelServerHost] OnSessionClosed plugin failure for session ${agentSessionID} / ` +
                        `channel '${name}': ${this.message(error)}`,
                );
            }
        }
        this.scheduleDisposal(key, entry);
    }

    // ----- internals -------------------------------------------------------------------------

    /** Disposes the session's plugins now, or after the linger window when one is configured. */
    private scheduleDisposal(key: string, entry: SessionPluginEntry): void {
        if (this.DisposeLingerMs <= 0) {
            this.disposeSession(key);
            return;
        }
        entry.disposeTimer = setTimeout(() => this.disposeSession(key), this.DisposeLingerMs);
        // Never keep the process alive for a disposal sweep.
        entry.disposeTimer.unref?.();
    }

    /** Disposes and forgets every plugin instance of one session (failures logged per plugin). */
    private disposeSession(key: string): void {
        const entry = this.sessions.get(key);
        if (!entry) {
            return;
        }
        this.sessions.delete(key);
        for (const [name, plugin] of entry.plugins) {
            try {
                plugin.Dispose();
            } catch (error) {
                LogError(`[RealtimeChannelServerHost] Dispose failure for channel '${name}': ${this.message(error)}`);
            }
        }
    }

    /**
     * Reads the ACTIVE `MJ: AI Agent Channels` rows from {@link AIEngineBase}'s cached
     * `AgentChannels` (provider-scoped engine instance, lazy `Config` — no per-session RunView;
     * the engine's BaseEntity-event reactivity keeps the registry fresh) — the server-side mirror
     * of the client's `fetchChannelDefinitions`. Failures are logged and degrade to an empty
     * list; channel availability must never block a session.
     */
    private async fetchChannelDefinitions(
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<RealtimeChannelServerDefinitionRow[]> {
        try {
            const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
            await engine.Config(false, contextUser, provider);
            return (engine.AgentChannels ?? [])
                .filter((c) => c.IsActive)
                .map<RealtimeChannelServerDefinitionRow>((c) => ({
                    ID: c.ID,
                    Name: c.Name,
                    ServerPluginClass: c.ServerPluginClass ?? null,
                }));
        } catch (error) {
            LogError(`[RealtimeChannelServerHost] Failed to load the channel registry from ${CHANNEL_ENTITY}: ${this.message(error)}`);
            return [];
        }
    }

    /** Resolves + start-brackets one fresh plugin instance per resolvable registry row. */
    private async instantiateSessionPlugins(
        rows: RealtimeChannelServerDefinitionRow[],
        ctx: RealtimeChannelServerContext,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<Map<string, BaseRealtimeChannelServer>> {
        const plugins = new Map<string, BaseRealtimeChannelServer>();
        for (const row of rows) {
            const plugin = this.resolveChannelPlugin(row);
            if (!plugin) {
                continue;
            }
            try {
                plugin.Initialize(ctx);
                // Hand the session's MJ data context to channels that need DB access at start
                // (e.g. the Media channel resolving an agent's media kit), BEFORE OnSessionStarted.
                if (isRealtimeChannelServerDataAware(plugin)) {
                    plugin.SetSessionDataContext(contextUser, provider);
                }
                await plugin.OnSessionStarted();
                plugins.set(this.channelKey(row.Name), plugin);
            } catch (error) {
                LogError(
                    `[RealtimeChannelServerHost] Server plugin for channel '${row.Name}' failed during session start ` +
                        `— dropping it for session ${ctx.AgentSessionID}: ${this.message(error)}`,
                );
                this.safeDispose(plugin, row.Name);
            }
        }
        return plugins;
    }

    /**
     * Resolves one registry row's `ServerPluginClass` via the ClassFactory (registration checked
     * first, exactly like the client half and the realtime model drivers) and instantiates a fresh
     * per-session plugin. Returns `null` (logged) when the key is blank, unregistered (e.g. its
     * `Load...()` function was never called server-side), or fails to instantiate.
     */
    private resolveChannelPlugin(row: RealtimeChannelServerDefinitionRow): BaseRealtimeChannelServer | null {
        const key = row.ServerPluginClass?.trim();
        if (!key) {
            LogStatus(`[RealtimeChannelServerHost] Channel '${row.Name}' has no ServerPluginClass — skipping.`);
            return null;
        }
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelServer, key);
        if (!registration) {
            LogStatus(`[RealtimeChannelServerHost] No server plugin registered for channel '${row.Name}' (key '${key}') — skipping.`);
            return null;
        }
        const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(BaseRealtimeChannelServer, key);
        if (!plugin) {
            LogError(`[RealtimeChannelServerHost] Failed to instantiate server plugin for channel '${row.Name}' (key '${key}').`);
            return null;
        }
        if (this.channelKey(plugin.ChannelName) !== this.channelKey(row.Name)) {
            LogError(
                `[RealtimeChannelServerHost] Server plugin '${key}' reports ChannelName '${plugin.ChannelName}' but is ` +
                    `registered on channel row '${row.Name}' — routing by the row name; fix the plugin/registry mismatch.`,
            );
        }
        return plugin;
    }

    /** Disposes a plugin defensively, swallowing (logging) any error. */
    private safeDispose(plugin: BaseRealtimeChannelServer, channelName: string): void {
        try {
            plugin.Dispose();
        } catch (error) {
            LogError(`[RealtimeChannelServerHost] Dispose failure for channel '${channelName}': ${this.message(error)}`);
        }
    }

    /** Canonical map key for a session id (UUID case differs across DB platforms). */
    private sessionKey(agentSessionID: string): string {
        return agentSessionID.trim().toLowerCase();
    }

    /** Canonical map key for a channel name. */
    private channelKey(channelName: string): string {
        return channelName.trim().toLowerCase();
    }

    /** Normalizes an unknown thrown value into a loggable message. */
    private message(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
