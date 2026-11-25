/**
 * @fileoverview Default-agent resolution chain.
 *
 * Replaces the hardcoded `Agents.find(a => a.Name === 'Sage')` lookup that previously lived
 * in three places inside `@memberjunction/ng-conversations` with a metadata-driven chain
 * routed through `UserInfoEngine` and `MJ: Application Settings`.
 *
 * Resolution order on every {@link DefaultAgentResolver.Resolve} / {@link DefaultAgentResolver.ResolveWithDetails} call:
 *
 * 1. **Explicit `explicitAgentId`** on the call (matches the widget's `[DefaultAgentId]`
 *    `@Input` — already works today, preserved here for layering).
 * 2. **User's chosen default** — `UserInfoEngine.Instance.GetSetting('Conversations.DefaultAgentID')`
 *    (with read-only fallback to legacy `'chat.defaultAgentId'`), validated to be `Active`,
 *    not an uninstantiated `Required` template, and runnable by `contextUser` across its
 *    entire `BaseAgentID` ancestor chain. If configured but unavailable/revoked, falls through
 *    cleanly without throwing and flags `userDefaultUnavailable` on the detailed result.
 * 3. **User's primary instance (`IsPrimaryInstance = 1`)** of the resolved org/app default
 *    template (when that template uses Agent Instances — `InstantiationMode` is `'Required'`
 *    or `'Optional'` — and the user has an active, runnable primary derived instance).
 * 4. **Org / App default**:
 *    - 4a. **`Application.AgentSettings.DefaultAgentID`** — the app's own agent config bag
 *      (`MJApplicationEntity.AgentSettingsObject.DefaultAgentID`).
 *    - 4b. **App-scoped → Global `MJ: Application Settings`** row
 *      (`Name = 'Conversations.DefaultAgentID'`).
 * 5. **Code-const fallback** — `Agents.find(a => a.Name === 'Sage')`. Safety net for
 *    installs where no settings exist; preserves today's behavior so the system never
 *    silently fails to route a turn.
 *
 * @module @memberjunction/conversations-runtime
 */

import { IMetadataProvider, IRunViewProvider, UserInfo, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ApplicationSettingEngine, MJApplicationEntity, UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Which tier in the {@link DefaultAgentResolver} chain produced the resolved agent.
 */
export type DefaultAgentResolutionSource =
    | 'explicit'
    | 'user-setting'
    | 'user-primary-instance'
    | 'app-agent-settings'
    | 'app-or-global-setting'
    | 'code-fallback';

/**
 * Detailed outcome returned by {@link DefaultAgentResolver.ResolveWithDetails}.
 * Exposes provenance and whether the user's saved default agent had to be bypassed
 * because it was missing, deactivated, or lacked `CanRun` permission across its ancestor chain.
 */
export interface DefaultAgentResolutionResult {
    /** The resolved active conversation manager / default agent. */
    agent: MJAIAgentEntityExtended;

    /** Which tier in the resolution chain produced {@link agent}. */
    source: DefaultAgentResolutionSource;

    /**
     * `true` when the user had a saved `Conversations.DefaultAgentID` preference in
     * `UserInfoEngine` that could not be used (missing, inactive, or lacking `CanRun`),
     * causing resolution to fall through cleanly to the org/app default.
     */
    userDefaultUnavailable?: boolean;

    /** Human-readable explanation when {@link userDefaultUnavailable} is `true`. */
    userDefaultUnavailableReason?: string;

    /** The configured user default agent ID that could not be used, when applicable. */
    unavailableUserDefaultAgentId?: string;
}

/**
 * Options accepted by {@link DefaultAgentResolver.Resolve} and {@link DefaultAgentResolver.ResolveWithDetails}.
 * Every field is optional; callers typically pass `applicationId` when an embedder has app context,
 * and `contextUser` so per-user default preferences, primary instances, and `CanRun` checks apply.
 */
export interface DefaultAgentResolveOptions {
    /**
     * If supplied AND a matching active agent exists, this wins immediately (step 1).
     * Mirrors the widget's `[DefaultAgentId]` `@Input` — used by Form Builder, Component
     * Studio AI Assistant, and any future embedder that pins a specific agent.
     */
    explicitAgentId?: string | null;

    /**
     * Application context for the conversation. When supplied, an app-scoped
     * `AgentSettings.DefaultAgentID` or Application Setting takes precedence over the global default.
     */
    applicationId?: string | null;

    /** Context user — used for `UserInfoEngine` preferences, primary instances, and `CanRun` checks. */
    contextUser?: UserInfo;

    /** Metadata provider to bind to — falls back to `Metadata.Provider`. */
    provider?: IMetadataProvider;

    /**
     * When `true`, skips the per-user preference step (step 2) and resolves strictly from
     * explicit / app / org defaults. Useful when inspecting the org fallback target.
     */
    ignoreUserDefault?: boolean;
}

interface UserDefaultUnavailableInfo {
    userDefaultUnavailable: true;
    userDefaultUnavailableReason: string;
    unavailableUserDefaultAgentId: string;
}

/**
 * Resolves the default agent for a conversation turn.
 *
 * Usually accessed via `ConversationsRuntime.Instance.DefaultAgent`. Stateless beyond
 * lazy delegation to `UserInfoEngine`, `ApplicationSettingEngine`, and `AIEngineBase`.
 */
export class DefaultAgentResolver {
    /** Canonical setting key consulted in both `UserInfoEngine` (step 2) and `ApplicationSettingEngine` (step 4b). */
    public static readonly SETTING_NAME = 'Conversations.DefaultAgentID';

    /**
     * Legacy user setting key written prior to unifying on {@link SETTING_NAME}.
     * Consulted read-only as a fallback if {@link SETTING_NAME} is not set in `UserInfoEngine`.
     */
    public static readonly LEGACY_USER_SETTING_NAME = 'chat.defaultAgentId';

    /**
     * Last-resort fallback agent name (step 5). Kept as a constant rather than another
     * setting so the system has a hard floor even if metadata sync has never run on a
     * fresh install — preserves today's "Sage is the default" behavior unconditionally.
     */
    public static readonly FALLBACK_AGENT_NAME = 'Sage';

    /**
     * Resolve the default agent for this turn. Walks the full resolution chain; throws a descriptive
     * error if every step misses.
     */
    public async Resolve(options: DefaultAgentResolveOptions = {}): Promise<MJAIAgentEntityExtended> {
        const result = await this.ResolveWithDetails(options);
        return result.agent;
    }

    /**
     * Resolve the default agent along with provenance and any user-default fallback details
     * (so UI surfaces can display a one-time non-blocking notice if the user's saved default
     * was deactivated or revoked).
     */
    public async ResolveWithDetails(
        options: DefaultAgentResolveOptions = {}
    ): Promise<DefaultAgentResolutionResult> {
        const { explicitAgentId, applicationId, contextUser, provider, ignoreUserDefault } = options;

        const aiEngine = this.getAIEngine(provider);
        const appSettingEngine = this.getApplicationSettingEngine(provider);
        const userInfoEngine = this.getUserInfoEngine(provider);

        // Lazy-config the engines we depend on. All `Config(false, ...)` calls are
        // idempotent — first caller pays the load cost, others are cache hits.
        await aiEngine.Config(false, contextUser, provider);
        await appSettingEngine.Config(false, contextUser, provider);
        if (userInfoEngine && !ignoreUserDefault) {
            try {
                await userInfoEngine.Config(false, contextUser, provider);
            } catch (e) {
                console.warn(
                    `DefaultAgentResolver: UserInfoEngine.Config failed — continuing without user preference: ${e instanceof Error ? e.message : String(e)}`
                );
            }
        }

        // Step 1: explicit ID wins if it resolves to an active known agent.
        if (explicitAgentId) {
            const explicit = this.findAgentById(aiEngine, explicitAgentId);
            if (explicit && this.isAgentActive(explicit)) {
                return { agent: explicit, source: 'explicit' };
            }
            console.warn(
                `DefaultAgentResolver: explicitAgentId "${explicitAgentId}" did not match any active known agent — falling through to user/org default chain.`
            );
        }

        // Step 2: per-user chosen default stored in UserInfoEngine under Conversations.DefaultAgentID
        // (with backwards-compatible fallback to legacy 'chat.defaultAgentId').
        let unavailableInfo: UserDefaultUnavailableInfo | null = null;
        if (!ignoreUserDefault && userInfoEngine) {
            const rawUserDefault = this.readUserDefaultSetting(userInfoEngine);
            if (rawUserDefault) {
                const validation = this.validateCandidateAgent(aiEngine, rawUserDefault, contextUser);
                if (validation.valid) {
                    return { agent: validation.agent, source: 'user-setting' };
                }
                unavailableInfo = {
                    userDefaultUnavailable: true,
                    userDefaultUnavailableReason: validation.reason,
                    unavailableUserDefaultAgentId: rawUserDefault,
                };
                console.warn(
                    `DefaultAgentResolver: user default "${rawUserDefault}" is unavailable (${validation.reason}) — falling through to org default.`
                );
            }
        }

        // Step 4a & 4b (org/app default resolution), interleaved with Step 3 (user's primary
        // instance of the resolved org/app default template when it uses Agent Instances).
        let orgDefault: MJAIAgentEntityExtended | undefined;
        let orgDefaultSource: 'app-agent-settings' | 'app-or-global-setting' = 'app-or-global-setting';
        let settingValue: string | undefined;

        // 4a: Application.AgentSettings.DefaultAgentID (first-class app config).
        if (applicationId) {
            const fromAppSettings = await this.getAppDefaultAgentId(applicationId, contextUser, provider);
            if (fromAppSettings) {
                const resolved = this.findAgentById(aiEngine, fromAppSettings);
                if (resolved && this.isAgentActive(resolved)) {
                    orgDefault = resolved;
                    orgDefaultSource = 'app-agent-settings';
                } else {
                    console.warn(
                        `DefaultAgentResolver: Application.AgentSettings.DefaultAgentID = "${fromAppSettings}" did not resolve to an active agent — falling through to the settings chain.`
                    );
                }
            }
        }

        // 4b: App-scoped -> Global Application Setting (`Conversations.DefaultAgentID`).
        if (!orgDefault) {
            settingValue = appSettingEngine.GetSetting(
                DefaultAgentResolver.SETTING_NAME,
                applicationId ?? undefined
            );
            if (settingValue) {
                const fromSetting = this.findAgentById(aiEngine, settingValue);
                if (fromSetting && this.isAgentActive(fromSetting)) {
                    orgDefault = fromSetting;
                    orgDefaultSource = 'app-or-global-setting';
                } else {
                    console.warn(
                        `DefaultAgentResolver: Application Setting "${DefaultAgentResolver.SETTING_NAME}" resolved to "${settingValue}" but no active matching agent was found — falling through to code-const fallback.`
                    );
                }
            }
        }

        // Step 3: When the resolved org/app default is an instantiable template, prefer the
        // user's active primary instance (`IsPrimaryInstance = 1`) that the user can run.
        if (orgDefault) {
            const primaryInstance = this.findUserPrimaryInstance(aiEngine, orgDefault, contextUser);
            if (primaryInstance) {
                return {
                    agent: primaryInstance,
                    source: 'user-primary-instance',
                    ...(unavailableInfo ?? {}),
                };
            }
            return {
                agent: orgDefault,
                source: orgDefaultSource,
                ...(unavailableInfo ?? {}),
            };
        }

        // Step 5: code-const fallback. Find the active agent named `Sage` and return it.
        const fallback = this.getSearchableAgents(aiEngine).find(
            (a) => a.Name === DefaultAgentResolver.FALLBACK_AGENT_NAME && this.isAgentActive(a)
        );
        if (fallback) {
            return {
                agent: fallback,
                source: 'code-fallback',
                ...(unavailableInfo ?? {}),
            };
        }

        // No agent at any layer — descriptive error so the call site sees the misconfiguration.
        throw new Error(
            `DefaultAgentResolver: could not resolve a default conversation manager agent. ` +
                `Tried (1) explicitAgentId=${explicitAgentId ?? 'null'}, ` +
                `(2) UserInfoEngine "${DefaultAgentResolver.SETTING_NAME}"=${unavailableInfo?.unavailableUserDefaultAgentId ?? 'null'}, ` +
                `(3) user primary instance of org default template, ` +
                `(4a) Application.AgentSettings.DefaultAgentID (applicationId=${applicationId ?? 'null'}), ` +
                `(4b) Application Setting "${DefaultAgentResolver.SETTING_NAME}" = "${settingValue ?? 'undefined'}", ` +
                `(5) code-const fallback agent name = "${DefaultAgentResolver.FALLBACK_AGENT_NAME}". ` +
                `Configure Application.AgentSettings, the Application Setting, or seed the fallback agent.`
        );
    }

    /** @deprecated Use {@link Resolve}. */
    public async resolve(options: DefaultAgentResolveOptions = {}): Promise<MJAIAgentEntityExtended> {
        return this.Resolve(options);
    }

    private getAIEngine(provider?: IMetadataProvider): AIEngineBase {
        if (provider && typeof AIEngineBase.GetProviderInstance === 'function') {
            return AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
        }
        return AIEngineBase.Instance;
    }

    private getApplicationSettingEngine(provider?: IMetadataProvider): ApplicationSettingEngine {
        if (provider && typeof ApplicationSettingEngine.GetProviderInstance === 'function') {
            return ApplicationSettingEngine.GetProviderInstance<ApplicationSettingEngine>(
                provider,
                ApplicationSettingEngine
            ) as ApplicationSettingEngine;
        }
        return ApplicationSettingEngine.Instance;
    }

    private getUserInfoEngine(provider?: IMetadataProvider): UserInfoEngine | null {
        if (!UserInfoEngine) {
            return null;
        }
        if (provider && typeof UserInfoEngine.GetProviderInstance === 'function') {
            return UserInfoEngine.GetProviderInstance<UserInfoEngine>(provider, UserInfoEngine) as UserInfoEngine;
        }
        return UserInfoEngine.Instance ?? null;
    }

    private readUserDefaultSetting(userInfoEngine: UserInfoEngine): string | null {
        if (typeof userInfoEngine.GetSetting !== 'function') {
            return null;
        }
        const primary = userInfoEngine.GetSetting(DefaultAgentResolver.SETTING_NAME)?.trim();
        if (primary) {
            return primary;
        }
        const legacy = userInfoEngine.GetSetting(DefaultAgentResolver.LEGACY_USER_SETTING_NAME)?.trim();
        return legacy || null;
    }

    private validateCandidateAgent(
        aiEngine: AIEngineBase,
        agentId: string,
        contextUser?: UserInfo
    ): { valid: true; agent: MJAIAgentEntityExtended } | { valid: false; reason: string } {
        const agent = this.findAgentById(aiEngine, agentId);
        if (!agent) {
            return { valid: false, reason: 'agent no longer exists or is not visible' };
        }
        if (!this.isAgentActive(agent)) {
            return { valid: false, reason: `agent "${agent.Name}" is inactive (${agent.Status})` };
        }
        if (agent.InstantiationMode === 'Required') {
            return {
                valid: false,
                reason: `agent "${agent.Name}" is a template that requires a personal instance`,
            };
        }
        if (contextUser && !this.canUserRunAgent(aiEngine, agent, contextUser)) {
            return {
                valid: false,
                reason: `you no longer have run permission for "${agent.Name}"`,
            };
        }
        return { valid: true, agent };
    }

    /**
     * Finds the user's active primary instance (`IsPrimaryInstance = true`) descending from
     * `templateAgent` when `templateAgent` is an instantiable template (`Required` or `Optional`).
     * Validates that the primary instance is `Active` and the user holds `CanRun` across its
     * `BaseAgentID` ancestor chain.
     */
    private findUserPrimaryInstance(
        aiEngine: AIEngineBase,
        templateAgent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): MJAIAgentEntityExtended | null {
        if (!contextUser) {
            return null;
        }
        const mode = templateAgent.InstantiationMode;
        if (mode !== 'Required' && mode !== 'Optional') {
            return null;
        }

        const candidates = this.getUserDerivedAgentsForTemplate(aiEngine, templateAgent.ID, contextUser);
        const primary = candidates.find(
            (a) =>
                a.IsPrimaryInstance === true &&
                this.isAgentActive(a) &&
                UUIDsEqual(a.OwnerUserID, contextUser.ID) &&
                this.canUserRunAgent(aiEngine, a, contextUser)
        );
        return primary ?? null;
    }

    private getUserDerivedAgentsForTemplate(
        aiEngine: AIEngineBase,
        templateId: string,
        contextUser: UserInfo
    ): MJAIAgentEntityExtended[] {
        if (typeof aiEngine.GetUserDerivedAgents === 'function') {
            return aiEngine.GetUserDerivedAgents(contextUser, templateId);
        }
        const all = this.getSearchableAgents(aiEngine);
        return all.filter((a) => {
            if (!a.BaseAgentID || !this.isAgentActive(a)) {
                return false;
            }
            if (UUIDsEqual(a.BaseAgentID, templateId)) {
                return true;
            }
            if (typeof aiEngine.GetRootAgent === 'function') {
                const root = aiEngine.GetRootAgent(a.ID);
                return root ? UUIDsEqual(root.ID, templateId) : false;
            }
            return false;
        });
    }

    private isAgentActive(agent: MJAIAgentEntityExtended): boolean {
        // Legacy test fixtures sometimes omit Status; treat undefined as Active while
        // rejecting any explicit non-Active status (Disabled, Pending, etc.).
        return agent.Status === undefined || agent.Status === 'Active';
    }

    private canUserRunAgent(
        aiEngine: AIEngineBase,
        agent: MJAIAgentEntityExtended,
        contextUser: UserInfo
    ): boolean {
        if (typeof aiEngine.CanUserRunAgentSync === 'function') {
            return aiEngine.CanUserRunAgentSync(agent, contextUser);
        }
        return true;
    }

    /**
     * Read `Application.AgentSettings.DefaultAgentID` for the given app via a targeted
     * `RunView` (single row by ID, `entity_object` so the typed `AgentSettingsObject`
     * accessor is available). Returns `undefined` when the app, the column, or the field
     * is absent.
     */
    private async getAppDefaultAgentId(
        applicationId: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string | undefined> {
        try {
            const rvProvider = DefaultAgentResolver.asRunViewProvider(provider);
            const rv = new RunView(rvProvider);
            const result = await rv.RunView<MJApplicationEntity>(
                {
                    EntityName: 'MJ: Applications',
                    ExtraFilter: `ID = '${applicationId}'`,
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (!result.Success || !result.Results || result.Results.length === 0) {
                return undefined;
            }
            return result.Results[0].AgentSettingsObject?.DefaultAgentID ?? undefined;
        } catch (e) {
            console.warn(
                `DefaultAgentResolver: failed to read Application.AgentSettings for applicationId="${applicationId}": ${e instanceof Error ? e.message : String(e)}`
            );
            return undefined;
        }
    }

    /**
     * Narrow an {@link IMetadataProvider} to an {@link IRunViewProvider} when the concrete
     * instance implements RunView (all MJ data providers do). Returns `undefined` otherwise
     * so {@link RunView} falls back to the global default provider.
     */
    private static asRunViewProvider(provider?: IMetadataProvider): IRunViewProvider | undefined {
        const candidate = provider as Partial<IRunViewProvider> | undefined;
        return candidate && typeof candidate.RunView === 'function'
            ? (provider as IMetadataProvider & IRunViewProvider)
            : undefined;
    }

    private getSearchableAgents(aiEngine: AIEngineBase): MJAIAgentEntityExtended[] {
        return aiEngine.ReadableAgents ?? aiEngine.Agents ?? [];
    }

    /**
     * Find an agent by ID from the AIEngineBase cache. Returns `undefined` if not found.
     * Uses {@link UUIDsEqual} per the standing rule about comparing UUIDs across
     * SQL Server / Postgres (case differences would silently miss).
     */
    private findAgentById(aiEngine: AIEngineBase, id: string): MJAIAgentEntityExtended | undefined {
        const searchable = this.getSearchableAgents(aiEngine);
        const fromReadable = searchable.find((a) => UUIDsEqual(a.ID, id));
        if (fromReadable) {
            return fromReadable;
        }
        if (typeof aiEngine.GetAgentByID === 'function') {
            return aiEngine.GetAgentByID(id);
        }
        return undefined;
    }
}
