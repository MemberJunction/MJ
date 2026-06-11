/**
 * @fileoverview Top-level runtime singleton for the conversations stack.
 *
 * `ConversationsRuntime` is the single composition root for the orchestration concerns of
 * MJ's conversational AI experiences. It holds and exposes the sub-components (mentions,
 * bridge, default-agent resolver, client-tool registry, sessions observer, streaming,
 * agent runner) and provides a lazy `Config()` for boot-time loading of the engines
 * it depends on.
 *
 * It follows MJ's established `BaseEngine` / `BaseSingleton` idiom — singleton via the
 * global object store, idempotent lazy `Config()`, and an explicit `Instance` accessor.
 *
 * **Two engines, two concerns.** This runtime is NOT a wrapper around `ConversationEngine`
 * (data layer in `@memberjunction/core-entities`). Data CRUD goes through
 * `ConversationEngine.Instance`; orchestration goes through `ConversationsRuntime.Instance`.
 * The runtime delegates to the data engine where needed but does not re-export its API.
 *
 * **Adapter pattern.** The runtime is framework-agnostic but needs to surface
 * notifications and clear running tasks in the host's UI. Hosts inject adapters via
 * {@link UseNotificationAdapter} / {@link UseActiveTaskTracker} at bootstrap. Defaults
 * (`ConsoleNotificationAdapter`, `NoOpActiveTaskTracker`) keep the runtime usable
 * out of the box for server-side / headless callers.
 *
 * @module @memberjunction/conversations-runtime
 */

import { BaseEngine, IMetadataProvider, IStartupSink, RegisterForStartup, UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ApplicationSettingEngine, ConversationEngine } from '@memberjunction/core-entities';
import { ClientToolRegistry } from '@memberjunction/ai-agent-client';

import { MentionParser } from './mentions/MentionParser';
import { ConversationBridge } from './bridge/ConversationBridge';
import { DefaultAgentResolver } from './default-agent/DefaultAgentResolver';
import { SessionsObserver } from './sessions/SessionsObserver';
import { ConversationStreaming } from './streaming/ConversationStreaming';
import { ConversationAgentRunner } from './agent-runner/ConversationAgentRunner';
import {
    INotificationAdapter,
    ConsoleNotificationAdapter,
} from './adapters/INotificationAdapter';
import {
    IActiveTaskTracker,
    NoOpActiveTaskTracker,
} from './adapters/IActiveTaskTracker';
import { IConversationsRuntimeContext } from './context/IConversationsRuntimeContext';

/**
 * The framework-agnostic conversations runtime.
 *
 * **Lifecycle:** call `Config(false, contextUser, provider)` at every entry point that
 * uses the runtime — it's idempotent, so only the first caller pays the load cost. The
 * rest are O(1) cache hits.
 *
 * **Adapters:** at host bootstrap, supply UI adapters via
 * {@link UseNotificationAdapter} / {@link UseActiveTaskTracker}. Until you do, the
 * defaults log to the console and no-op respectively.
 *
 * **Multi-provider:** when an explicit provider is passed to `Config()`, the runtime
 * scopes its dependent engines (`AIEngineBase`, `ApplicationSettingEngine`,
 * `ConversationEngine`) to that provider. Single-provider apps omit the parameter and
 * get the global default.
 *
 * @example
 * ```typescript
 * import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
 *
 * // At every entry point (no-op after the first call)
 * await ConversationsRuntime.Instance.Config(false, contextUser);
 *
 * // Wire UI adapters once at bootstrap
 * ConversationsRuntime.Instance.UseNotificationAdapter({
 *     Notify: (level, msg, ttl) =>
 *         MJNotificationService.Instance.CreateSimpleNotification(msg, level, ttl ?? 5000),
 * });
 *
 * // Process a message through the default conversation manager agent
 * const result = await ConversationsRuntime.Instance.AgentRunner.processMessage({
 *     conversationId,
 *     message,
 *     conversationDetailId,
 *     applicationId,
 * });
 * ```
 */
@RegisterForStartup({
    deferred: true,
    deferredDelay: 5000,
    severity: 'warn',
    description: 'Conversations runtime (mentions, default-agent, agent runner) pre-warming'
})
export class ConversationsRuntime
    extends BaseEngine<ConversationsRuntime>
    implements IConversationsRuntimeContext, IStartupSink
{
    /**
     * The singleton instance. Backed by the Global Object Store so the same instance is
     * shared even when bundlers duplicate this module across code splits.
     */
    public static get Instance(): ConversationsRuntime {
        return super.getInstance<ConversationsRuntime>();
    }

    // ────────────────────────────────────────────────────────────────────
    // Adapter slots — replaceable at host bootstrap. Defaults below.
    // ────────────────────────────────────────────────────────────────────

    private _notification: INotificationAdapter = new ConsoleNotificationAdapter();
    private _tasks: IActiveTaskTracker = new NoOpActiveTaskTracker();

    /**
     * Currently registered notification adapter — used by sub-components to surface
     * user-visible messages. Defaults to {@link ConsoleNotificationAdapter}.
     *
     * Implements {@link IConversationsRuntimeContext.Notification}.
     */
    public get Notification(): INotificationAdapter {
        return this._notification;
    }

    /**
     * Currently registered active-task tracker — used by `ConversationStreaming` to
     * clear running tasks when an agent run completes. Defaults to
     * {@link NoOpActiveTaskTracker}.
     *
     * Implements {@link IConversationsRuntimeContext.Tasks}.
     */
    public get Tasks(): IActiveTaskTracker {
        return this._tasks;
    }

    /**
     * Register a notification adapter — typically called once at host bootstrap.
     * The new adapter takes effect immediately; sub-components read it from the
     * context on every call.
     */
    public UseNotificationAdapter(adapter: INotificationAdapter): void {
        this._notification = adapter;
    }

    /**
     * Register an active-task tracker — typically called once at host bootstrap.
     * The new tracker takes effect immediately.
     */
    public UseActiveTaskTracker(tracker: IActiveTaskTracker): void {
        this._tasks = tracker;
    }

    // ────────────────────────────────────────────────────────────────────
    // Sub-components — eagerly constructed (cheap) so the Instance accessor
    // always returns a ready runtime.
    // ────────────────────────────────────────────────────────────────────

    private readonly _mentions = new MentionParser();
    private readonly _bridge = new ConversationBridge();
    private readonly _tools = new ClientToolRegistry();
    private readonly _defaultAgent = new DefaultAgentResolver();
    private readonly _sessions = new SessionsObserver();

    // Streaming + agent runner are constructed lazily because they hold references
    // back to `this` (for adapter access) and we want all field initializers to
    // complete before they capture us.
    private _streaming?: ConversationStreaming;
    private _agentRunner?: ConversationAgentRunner;

    /** Mention parser — pure string logic. See {@link MentionParser}. */
    public get Mentions(): MentionParser {
        return this._mentions;
    }

    /** Overlay ⇄ workspace coordination bus. See {@link ConversationBridge}. */
    public get Bridge(): ConversationBridge {
        return this._bridge;
    }

    /**
     * Shared client-tool registry — the same `ClientToolRegistry` from
     * `@memberjunction/ai-agent-client` that `AgentClientSession` consumes. Apps register
     * tools here once at startup; every session sees them.
     */
    public get Tools(): ClientToolRegistry {
        return this._tools;
    }

    /** Default-agent resolution chain. See {@link DefaultAgentResolver}. */
    public get DefaultAgent(): DefaultAgentResolver {
        return this._defaultAgent;
    }

    /**
     * Sessions/Channels lifecycle observer — stub today, wired in once PR #2787 lands.
     * See {@link SessionsObserver}.
     */
    public get Sessions(): SessionsObserver {
        return this._sessions;
    }

    /**
     * PubSub streaming layer — routes progress and completion events from the server
     * to per-message callbacks. See {@link ConversationStreaming}.
     *
     * Hosts must call `.initialize()` once after `Config()` to open the subscription.
     */
    public get Streaming(): ConversationStreaming {
        if (!this._streaming) {
            this._streaming = new ConversationStreaming(this);
        }
        return this._streaming;
    }

    /**
     * Agent-run orchestrator — wraps `AgentClientSession.RunAgentFromConversationDetail`
     * with default-agent resolution and permission-filtered candidate lists. See
     * {@link ConversationAgentRunner}.
     */
    public get AgentRunner(): ConversationAgentRunner {
        if (!this._agentRunner) {
            this._agentRunner = new ConversationAgentRunner(this, this._tools, this._defaultAgent);
        }
        return this._agentRunner;
    }

    // ────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ────────────────────────────────────────────────────────────────────

    /**
     * Lazy-load the engines this runtime depends on (`AIEngineBase`,
     * `ApplicationSettingEngine`, `ConversationEngine`). Safe to call from every entry
     * point — only the first invocation pays the load cost.
     *
     * The runtime itself currently has no `BaseEnginePropertyConfig` entries — the data
     * lives in the dependent engines. We override `Config()` rather than delegating to
     * `super.Load()` because we're a composition root, not a data cache.
     *
     * @param forceRefresh Refresh the dependent engines' caches.
     * @param contextUser Required on the server; ignored when omitted on the browser.
     * @param provider Bind to a specific metadata provider; falls back to `Metadata.Provider`.
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        // Run dependent-engine configs in parallel — they're independent, and the first
        // call to each is what pays the cost. Subsequent calls are no-ops.
        await Promise.all([
            AIEngineBase.Instance.Config(forceRefresh, contextUser, provider),
            ApplicationSettingEngine.Instance.Config(forceRefresh, contextUser, provider),
            ConversationEngine.Instance.Config(forceRefresh, contextUser, provider),
        ]);
    }

    /**
     * {@link IStartupSink} entry point fired by the MJ startup manager when this class
     * is registered via `@RegisterForStartup`. Pre-warms the runtime so the first user
     * to open a conversations surface doesn't pay the load cost. Deferred + non-blocking
     * per the decorator config — failures are logged (`severity: 'warn'`) but never
     * block app boot.
     */
    public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Config(false, contextUser, provider);
    }

    /**
     * Tear down sub-components that hold subscriptions. Safe to call at app shutdown or
     * in tests between cases.
     */
    public Dispose(): void {
        this._sessions.Dispose();
        if (this._streaming) {
            this._streaming.Dispose();
            this._streaming = undefined;
        }
        this._agentRunner = undefined;
    }
}
