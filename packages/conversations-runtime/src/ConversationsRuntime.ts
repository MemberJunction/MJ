/**
 * @fileoverview Top-level runtime singleton for the conversations stack.
 *
 * `ConversationsRuntime` is the single composition root for the orchestration concerns of
 * MJ's conversational AI experiences. It holds and exposes the sub-components (mentions,
 * bridge, default-agent resolver, client-tool registry, sessions observer) and provides a
 * lazy `Config()` for boot-time loading of the engines it depends on.
 *
 * It follows MJ's established `BaseEngine` / `BaseSingleton` idiom — singleton via the
 * global object store, idempotent lazy `Config()`, and an explicit `Instance` accessor.
 *
 * **Two engines, two concerns.** This runtime is NOT a wrapper around `ConversationEngine`
 * (data layer in `@memberjunction/core-entities`). Data CRUD goes through
 * `ConversationEngine.Instance`; orchestration goes through `ConversationsRuntime.Instance`.
 * The runtime delegates to the data engine where needed but does not re-export its API.
 *
 * @module @memberjunction/conversations-runtime
 */

import { BaseEngine, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ApplicationSettingEngine, ConversationEngine } from '@memberjunction/core-entities';
import { ClientToolRegistry } from '@memberjunction/ai-agent-client';

import { MentionParser } from './mentions/MentionParser';
import { ConversationBridge } from './bridge/ConversationBridge';
import { DefaultAgentResolver } from './default-agent/DefaultAgentResolver';
import { SessionsObserver } from './sessions/SessionsObserver';

/**
 * The framework-agnostic conversations runtime.
 *
 * **Lifecycle:** call `Config(false, contextUser, provider)` at every entry point that
 * uses the runtime — it's idempotent, so only the first caller pays the load cost. The
 * rest are O(1) cache hits.
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
 * // Parse a mention
 * const parsed = ConversationsRuntime.Instance.Mentions.parseMentions(
 *     '@Sage help me',
 *     AIEngineBase.Instance.Agents
 * );
 *
 * // Resolve the default agent for an app context
 * const agent = await ConversationsRuntime.Instance.DefaultAgent.resolve({
 *     applicationId: currentAppId,
 *     contextUser,
 * });
 *
 * // Register a client tool
 * ConversationsRuntime.Instance.Tools.Register({
 *     Name: 'NavigateToRecord',
 *     Description: 'Open an entity record in the UI',
 *     ParameterSchema: { type: 'object', properties: { EntityName: { type: 'string' } } },
 *     Handler: async (params) => ({ Success: true }),
 * });
 * ```
 */
export class ConversationsRuntime extends BaseEngine<ConversationsRuntime> {
    /**
     * The singleton instance. Backed by the Global Object Store so the same instance is
     * shared even when bundlers duplicate this module across code splits.
     */
    public static get Instance(): ConversationsRuntime {
        return super.getInstance<ConversationsRuntime>();
    }

    // Sub-components are constructed eagerly because they're cheap (constructors do no I/O)
    // and the Instance accessor expects them to be ready without a separate Config() call.
    private readonly _mentions = new MentionParser();
    private readonly _bridge = new ConversationBridge();
    private readonly _tools = new ClientToolRegistry();
    private readonly _defaultAgent = new DefaultAgentResolver();
    private readonly _sessions = new SessionsObserver();

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
     * Tear down sub-components that hold subscriptions. Safe to call at app shutdown or
     * in tests between cases.
     */
    public Dispose(): void {
        this._sessions.Dispose();
    }
}
