/**
 * @fileoverview Default-agent resolution chain.
 *
 * Replaces the hardcoded `Agents.find(a => a.Name === 'Sage')` lookup that previously lived
 * in three places inside `@memberjunction/ng-conversations` with a metadata-driven chain
 * routed through `MJ: Application Settings`.
 *
 * Resolution order on every {@link DefaultAgentResolver.resolve} call:
 *
 * 1. **Explicit `explicitAgentId`** on the call (matches the widget's `[DefaultAgentId]`
 *    `@Input` — already works today, preserved here for layering).
 * 2. **App-scoped `MJ: Application Settings`** row (`ApplicationID = <current app>`,
 *    `Name = 'Conversations.DefaultAgentID'`, `Value = <agent ID>`).
 * 3. **Global `MJ: Application Settings`** row (`ApplicationID IS NULL`, same name).
 *    Ships as a metadata seed pointing at Sage on a fresh install.
 * 4. **Code-const fallback** — `Agents.find(a => a.Name === 'Sage')`. Safety net for
 *    installs where the seed was skipped; preserves today's behavior so the system never
 *    silently fails to route a turn.
 *
 * Steps 2 and 3 are handled by `ApplicationSettingEngine.GetSetting` in one call — that API
 * already does app-scoped-first / global-fallback resolution internally.
 *
 * @module @memberjunction/conversations-runtime
 */

import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ApplicationSettingEngine } from '@memberjunction/core-entities';

/**
 * Options accepted by {@link DefaultAgentResolver.resolve}. Every field is optional;
 * callers typically pass `applicationId` when an embedder has app context, and the rest
 * fall through to defaults.
 */
export interface DefaultAgentResolveOptions {
    /**
     * If supplied AND a matching agent exists, this wins immediately (step 1).
     * Mirrors the widget's `[DefaultAgentId]` `@Input` — used by Form Builder, Component
     * Studio AI Assistant, and any future embedder that pins a specific agent.
     */
    explicitAgentId?: string | null;

    /**
     * Application context for the conversation. When supplied, an app-scoped Application
     * Setting (step 2) takes precedence over the global default (step 3).
     */
    applicationId?: string | null;

    /** Context user — passed to engines that need it on the server side. */
    contextUser?: UserInfo;

    /** Metadata provider to bind to — falls back to `Metadata.Provider`. */
    provider?: IMetadataProvider;
}

/**
 * Resolves the default agent for a conversation turn.
 *
 * Usually accessed via `ConversationsRuntime.Instance.DefaultAgent`. Stateless beyond
 * lazy delegation to `ApplicationSettingEngine` and `AIEngineBase`.
 */
export class DefaultAgentResolver {
    /** Application Setting key consulted in steps 2 and 3. */
    public static readonly SETTING_NAME = 'Conversations.DefaultAgentID';

    /**
     * Last-resort fallback agent name (step 4). Kept as a constant rather than another
     * setting so the system has a hard floor even if metadata sync has never run on a
     * fresh install — preserves today's "Sage is the default" behavior unconditionally.
     */
    public static readonly FALLBACK_AGENT_NAME = 'Sage';

    /**
     * Resolve the default agent for this turn. Walks the 4-step chain; throws a descriptive
     * error if every step misses (vs. the previous code path's silent `null` return, which
     * made misconfigurations hard to spot at the call site).
     *
     * @example
     * ```typescript
     * const agent = await runtime.DefaultAgent.resolve({
     *     explicitAgentId: widgetInput.DefaultAgentId,   // wins if non-null and matches
     *     applicationId: currentAppId,                    // scopes the settings lookup
     *     contextUser: this.ProviderToUse.CurrentUser,
     *     provider: this.ProviderToUse,
     * });
     * ```
     */
    public async resolve(options: DefaultAgentResolveOptions = {}): Promise<MJAIAgentEntityExtended> {
        const { explicitAgentId, applicationId, contextUser, provider } = options;

        // Lazy-config the engines we depend on. Both `Config(false, ...)` calls are
        // idempotent — first caller pays the load cost, others are cache hits.
        await AIEngineBase.Instance.Config(false, contextUser, provider);
        await ApplicationSettingEngine.Instance.Config(false, contextUser, provider);

        // Step 1: explicit ID wins if it resolves to a real agent.
        if (explicitAgentId) {
            const explicit = this.findAgentById(explicitAgentId);
            if (explicit) return explicit;
            // If an explicit ID was supplied but doesn't resolve, fall through — this is
            // surprising enough to warrant a warning but not surprising enough to throw
            // (the rest of the chain may still produce a sensible default).
            console.warn(
                `DefaultAgentResolver: explicitAgentId "${explicitAgentId}" did not match any known agent — falling through to settings chain.`
            );
        }

        // Steps 2 + 3: Application Setting resolution. `GetSetting` already does
        // app-scoped-first / global-fallback in one call.
        const settingValue = ApplicationSettingEngine.Instance.GetSetting(
            DefaultAgentResolver.SETTING_NAME,
            applicationId ?? undefined
        );
        if (settingValue) {
            const fromSetting = this.findAgentById(settingValue);
            if (fromSetting) return fromSetting;
            console.warn(
                `DefaultAgentResolver: Application Setting "${DefaultAgentResolver.SETTING_NAME}" resolved to "${settingValue}" but no matching agent was found — falling through to code-const fallback.`
            );
        }

        // Step 4: code-const fallback. Find the agent named `Sage` and return it.
        const fallback = AIEngineBase.Instance.Agents.find(
            (a) => a.Name === DefaultAgentResolver.FALLBACK_AGENT_NAME
        );
        if (fallback) return fallback;

        // No agent at any layer — descriptive error so the call site sees the misconfiguration.
        throw new Error(
            `DefaultAgentResolver: could not resolve a default conversation manager agent. ` +
                `Tried (1) explicitAgentId=${explicitAgentId ?? 'null'}, ` +
                `(2)+(3) Application Setting "${DefaultAgentResolver.SETTING_NAME}" (applicationId=${applicationId ?? 'null'}) = "${settingValue ?? 'undefined'}", ` +
                `(4) code-const fallback agent name = "${DefaultAgentResolver.FALLBACK_AGENT_NAME}". ` +
                `Configure the Application Setting or seed the fallback agent.`
        );
    }

    /**
     * Find an agent by ID from the AIEngineBase cache. Returns `undefined` if not found.
     * Uses {@link UUIDsEqual} per the standing rule about comparing UUIDs across
     * SQL Server / Postgres (case differences would silently miss).
     */
    private findAgentById(id: string): MJAIAgentEntityExtended | undefined {
        return AIEngineBase.Instance.Agents.find((a) => UUIDsEqual(a.ID, id));
    }
}
