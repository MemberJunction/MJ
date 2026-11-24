/**
 * @fileoverview Unified action-result lifecycle, expiration, execution-limit, and tool-turn
 * metadata resolver shared across directly-attached (`AIAgentAction`) and skill-bundled
 * (`AISkillAction`) action invocations.
 *
 * Centralizes resolution across:
 * 1. Run-level override (`ExecuteAgentParams.messageExpirationOverride`), including explicit
 *    `expirationMode: 'None'` opt-out
 * 2. Active per-agent `MJAIAgentActionEntity` rows (including `BaseAgentID`-inherited rows)
 * 3. Action metadata defaults (`Action.Config_Object` / `IActionConfiguration`)
 *
 * @module @memberjunction/ai-agents
 */

import { CleanAndParseJSON, IndexByUUID, NormalizeUUID, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import type { MJAIAgentActionEntity, MJActionEntity_IActionConfiguration } from '@memberjunction/core-entities';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { AgentChatMessageMetadata, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

/** Allowed result-expiration modes derived directly from the `MJ: AI Agent Actions` entity. */
export type ActionExpirationMode = MJAIAgentActionEntity['ResultExpirationMode'];

/** Allowed result-compaction modes derived directly from the `MJ: AI Agent Actions` entity. */
export type ActionCompactMode = NonNullable<MJAIAgentActionEntity['CompactMode']>;

/**
 * Resolved result-expiration and compaction configuration for an action execution,
 * unified across run overrides (`ExecuteAgentParams.messageExpirationOverride`),
 * per-agent `MJAIAgentActionEntity` rows, and action-level defaults (`Action.Config`).
 */
export interface ResolvedActionExpirationConfig {
    ExpirationTurns: number;
    ExpirationMode: ActionExpirationMode;
    CompactMode?: ActionCompactMode;
    CompactLength?: number;
    CompactPromptID?: string;
}

type ExpirationMetadataFields = Pick<
    AgentChatMessageMetadata,
    'expirationTurns' | 'expirationMode' | 'compactMode' | 'compactLength' | 'compactPromptId'
>;

interface ComparableExpiration {
    ExpirationTurns: number;
    ExpirationMode: ActionExpirationMode;
    CompactLength?: number;
}

/**
 * Stateless utility owning action-result lifecycle resolution (expiration, compaction, per-run
 * execution limits, loop expiration metadata, and merged native tool-turn metadata).
 *
 * Encapsulates a per-process warning deduplication set so misconfigured `Action.Config` rows log
 * once rather than on every turn.
 */
export class ActionLifecycleResolver {
    /** Tracks `normalizedActionId:reason` keys already warned about incomplete `Action.Config` metadata. */
    private static readonly warnedIncompleteConfigs = new Set<string>();

    /**
     * Clears cached one-time incomplete `Action.Config` expiration warnings (primarily for test isolation).
     */
    public static ClearIncompleteConfigWarnings(): void {
        ActionLifecycleResolver.warnedIncompleteConfigs.clear();
    }

    /**
     * Reads the parsed `IActionConfiguration` JSON object from an `MJActionEntityExtended` instance.
     * Supports hydrated `Config_Object` and raw `Config_` JSON strings.
     */
    public static GetActionConfigObject(
        actionEntity?: MJActionEntityExtended
    ): MJActionEntity_IActionConfiguration | undefined {
        if (!actionEntity) {
            return undefined;
        }
        try {
            if (actionEntity.Config_Object && typeof actionEntity.Config_Object === 'object') {
                return actionEntity.Config_Object;
            }
        } catch (err) {
            LogError(
                `ActionLifecycleResolver.GetActionConfigObject: malformed Action.Config JSON on '${actionEntity.Name}': ${err instanceof Error ? err.message : String(err)}`
            );
        }
        const rawConfig = actionEntity.Config_;
        if (typeof rawConfig === 'string' && rawConfig.trim().length > 0) {
            const parsed = CleanAndParseJSON<MJActionEntity_IActionConfiguration>(rawConfig, false);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        }
        return undefined;
    }

    /**
     * Indexes already-resolved effective `MJAIAgentActionEntity` rows (which may include rows
     * inherited from a `BaseAgentID` ancestor) by `ActionID` for O(1) case-insensitive UUID lookup.
     */
    public static IndexEffectiveAgentActions(
        agentActions: readonly MJAIAgentActionEntity[]
    ): UUIDMap<MJAIAgentActionEntity> {
        const active = agentActions.filter(aa => !aa.Status || aa.Status === 'Active');
        return IndexByUUID(active, aa => aa.ActionID);
    }

    /**
     * Indexes effective active `MJAIAgentActionEntity` rows for a single agent by `ActionID`
     * in one linear pass so loops over actions perform O(1) case-insensitive UUID lookups.
     *
     * When `agentActions` is provided, filters that collection to active rows belonging to `agentId`.
     * When omitted, resolves effective rows (including `BaseAgentID` inheritance) via `AIEngine`.
     */
    public static IndexActiveAgentActions(
        agentId: string,
        agentActions?: readonly MJAIAgentActionEntity[]
    ): UUIDMap<MJAIAgentActionEntity> {
        if (agentActions !== undefined) {
            const active = agentActions.filter(
                aa => UUIDsEqual(aa.AgentID, agentId) && (!aa.Status || aa.Status === 'Active')
            );
            return IndexByUUID(active, aa => aa.ActionID);
        }
        return ActionLifecycleResolver.IndexEffectiveAgentActions(
            ActionLifecycleResolver.resolveEffectiveAgentActions(agentId)
        );
    }

    /**
     * Resolves result-expiration and compaction settings for an action across a single unified
     * hierarchy so directly-attached actions (`AIAgentAction`) and skill-bundled actions
     * (`AISkillAction`) behave identically.
     *
     * Precedence:
     * 1. Run-level override (`params.messageExpirationOverride`), including explicit `expirationMode: 'None'` opt-out.
     * 2. Active per-agent `MJAIAgentActionEntity` row when `ResultExpirationTurns != null`.
     *    Note: existing rows default to `ResultExpirationMode = 'None'` with `ResultExpirationTurns = NULL`,
     *    which inherits `Action.Config` defaults; to opt a specific agent out of an `Action.Config` default
     *    via `AIAgentAction`, set `ResultExpirationMode = 'None'` with a non-null `ResultExpirationTurns` (e.g. `0`).
     * 3. Action metadata defaults (`Action.Config_Object`, falling back to `Action.DefaultCompactPromptID`).
     */
    public static ResolveExpirationConfig(
        actionEntity: MJActionEntityExtended | undefined,
        agentId: string,
        params?: ExecuteAgentParams,
        agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
    ): ResolvedActionExpirationConfig | undefined {
        const fromOverride = ActionLifecycleResolver.resolveOverrideExpiration(params?.messageExpirationOverride);
        if (fromOverride) {
            return fromOverride;
        }
        if (!actionEntity) {
            return undefined;
        }

        const actionConfig = ActionLifecycleResolver.GetActionConfigObject(actionEntity);
        const defaultPromptId = actionConfig?.compactPromptId ?? actionEntity.DefaultCompactPromptID ?? undefined;

        const agentAction = ActionLifecycleResolver.findActiveAgentAction(agentId, actionEntity.ID, agentActionsByActionId);
        if (agentAction && agentAction.ResultExpirationTurns != null) {
            return ActionLifecycleResolver.resolveAgentActionExpiration(agentAction, actionConfig, defaultPromptId);
        }

        return actionConfig
            ? ActionLifecycleResolver.resolveActionConfigExpiration(actionEntity, actionConfig, defaultPromptId)
            : undefined;
    }

    /**
     * Resolves the maximum executions per run for an action across active per-agent `AIAgentAction`
     * rows, dynamic `actionChanges` limits, and `Action.Config_Object?.maxExecutionsPerRun`.
     */
    public static ResolveMaxExecutionsPerRun(
        actionEntity: MJActionEntityExtended,
        agentId: string,
        dynamicActionLimits?: Readonly<Record<string, number>>,
        agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
    ): number | null {
        const dbAgentAction = ActionLifecycleResolver.findActiveAgentAction(agentId, actionEntity.ID, agentActionsByActionId);
        if (dbAgentAction?.MaxExecutionsPerRun != null) {
            return dbAgentAction.MaxExecutionsPerRun;
        }
        const dynamicLimit = ActionLifecycleResolver.lookupDynamicActionLimit(dynamicActionLimits, actionEntity.ID);
        if (dynamicLimit != null) {
            return dynamicLimit;
        }
        const actionConfig = ActionLifecycleResolver.GetActionConfigObject(actionEntity);
        if (typeof actionConfig?.maxExecutionsPerRun === 'number' && actionConfig.maxExecutionsPerRun > 0) {
            return actionConfig.maxExecutionsPerRun;
        }
        return null;
    }

    /**
     * Picks the most restrictive active expiration config from one or more resolved action configs,
     * ignoring `undefined` and `'None'` entries.
     *
     * Precedence on ties:
     * 1. Shorter `ExpirationTurns`
     * 2. `'Remove'` over `'Compact'`
     * 3. Smaller `CompactLength` when both are `'Compact'`
     */
    public static PickMostRestrictiveExpiration(
        configs: readonly (ResolvedActionExpirationConfig | undefined)[]
    ): ResolvedActionExpirationConfig | undefined {
        let best: ResolvedActionExpirationConfig | undefined;
        for (const cfg of configs) {
            if (!cfg || cfg.ExpirationTurns == null || cfg.ExpirationMode === 'None') {
                continue;
            }
            if (!best || ActionLifecycleResolver.isMoreRestrictiveExpiration(cfg, best)) {
                best = cfg;
            }
        }
        return best;
    }

    /**
     * Projects an active `ResolvedActionExpirationConfig` onto `AgentChatMessageMetadata` expiration
     * fields, returning an empty object when the config is absent or inactive (`'None'`).
     */
    public static ExpirationToMetadataFields(
        config?: ResolvedActionExpirationConfig
    ): Partial<ExpirationMetadataFields> {
        if (!config || config.ExpirationMode === 'None') {
            return {};
        }
        return {
            expirationTurns: config.ExpirationTurns,
            expirationMode: config.ExpirationMode,
            compactMode: config.CompactMode,
            compactLength: config.CompactLength,
            compactPromptId: config.CompactPromptID,
        };
    }

    /**
     * Extracts a `ResolvedActionExpirationConfig` from `AgentChatMessageMetadata` when expiration
     * settings are present.
     */
    public static MetadataToExpirationConfig(
        metadata?: AgentChatMessageMetadata
    ): ResolvedActionExpirationConfig | undefined {
        if (metadata?.expirationTurns == null || !metadata.expirationMode) {
            return undefined;
        }
        return {
            ExpirationTurns: metadata.expirationTurns,
            ExpirationMode: metadata.expirationMode,
            CompactMode: metadata.compactMode,
            CompactLength: metadata.compactLength,
            CompactPromptID: metadata.compactPromptId,
        };
    }

    /**
     * Resolves conversation message expiration metadata for a `ForEach`/`While` loop result message
     * using the unified `ResolveExpirationConfig` hierarchy across one or more loop-body actions.
     * Explicit `'None'` opt-outs disable expiration; unconfigured actions fall back to 3-turn `'Remove'`
     * so loop summaries stay bounded.
     */
    public static ResolveLoopExpirationMetadata(
        params: ExecuteAgentParams,
        turnAdded: number,
        matchedActions?: MJActionEntityExtended | readonly (MJActionEntityExtended | undefined)[],
        agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
    ): AgentChatMessageMetadata {
        const baseMetadata: AgentChatMessageMetadata = {
            turnAdded,
            messageType: 'loop-result',
        };

        const fromOverride = ActionLifecycleResolver.resolveOverrideExpiration(params.messageExpirationOverride);
        if (fromOverride) {
            return { ...baseMetadata, ...ActionLifecycleResolver.ExpirationToMetadataFields(fromOverride) };
        }

        const actions = ActionLifecycleResolver.normalizeMatchedActions(matchedActions);
        if (actions.length > 0) {
            const indexedActions = agentActionsByActionId ?? ActionLifecycleResolver.IndexActiveAgentActions(params.agent.ID);
            const resolvedList = actions.map(action =>
                ActionLifecycleResolver.ResolveExpirationConfig(action, params.agent.ID, params, indexedActions)
            );
            const mostRestrictive = ActionLifecycleResolver.PickMostRestrictiveExpiration(resolvedList);
            if (mostRestrictive) {
                return { ...baseMetadata, ...ActionLifecycleResolver.ExpirationToMetadataFields(mostRestrictive) };
            }
            if (resolvedList.every(r => r?.ExpirationMode === 'None')) {
                return baseMetadata;
            }
        }

        return { ...baseMetadata, expirationTurns: 3, expirationMode: 'Remove' };
    }

    /**
     * Merges conversation metadata when two `role: 'tool'` turns answering the same assistant call
     * turn are combined into one provider-valid tool turn. Preserves active expiration rules
     * (preferring the most restrictive active config without leaking losing `compact*` fields) and
     * unions materialized `artifactIds`.
     */
    public static MergeToolTurnMetadata(
        a?: AgentChatMessageMetadata,
        b?: AgentChatMessageMetadata
    ): AgentChatMessageMetadata | undefined {
        if (!a || !b) {
            return a ?? b;
        }
        const exp = ActionLifecycleResolver.pickMoreRestrictiveExpiration(a, b);
        const combinedArtifactIds = [...(a.artifactIds ?? []), ...(b.artifactIds ?? [])];
        const artifactIds = combinedArtifactIds.length > 0 ? Array.from(new Set(combinedArtifactIds)) : undefined;
        return {
            ...ActionLifecycleResolver.stripExpirationFields(a),
            ...ActionLifecycleResolver.stripExpirationFields(b),
            turnAdded: Math.min(a.turnAdded ?? b.turnAdded ?? 0, b.turnAdded ?? a.turnAdded ?? 0),
            messageType: a.messageType || b.messageType,
            ...(exp.expirationTurns !== undefined ? { expirationTurns: exp.expirationTurns } : {}),
            ...(exp.expirationMode !== undefined ? { expirationMode: exp.expirationMode } : {}),
            ...(exp.compactMode !== undefined ? { compactMode: exp.compactMode } : {}),
            ...(exp.compactLength !== undefined ? { compactLength: exp.compactLength } : {}),
            ...(exp.compactPromptId !== undefined ? { compactPromptId: exp.compactPromptId } : {}),
            ...(artifactIds ? { artifactIds } : {}),
        };
    }

    private static resolveEffectiveAgentActions(agentId: string): MJAIAgentActionEntity[] {
        const engine = AIEngine.Instance;
        if (typeof engine?.GetEffectiveAgentActions === 'function') {
            return engine.GetEffectiveAgentActions(agentId);
        }
        return (engine?.AgentActions ?? []).filter(aa => UUIDsEqual(aa.AgentID, agentId));
    }

    private static findActiveAgentAction(
        agentId: string,
        actionId: string,
        agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
    ): MJAIAgentActionEntity | undefined {
        if (agentActionsByActionId) {
            return agentActionsByActionId.Get(actionId);
        }
        return ActionLifecycleResolver.resolveEffectiveAgentActions(agentId).find(
            aa => UUIDsEqual(aa.ActionID, actionId) && (!aa.Status || aa.Status === 'Active')
        );
    }

    private static resolveOverrideExpiration(
        override: ExecuteAgentParams['messageExpirationOverride']
    ): ResolvedActionExpirationConfig | undefined {
        if (!override) {
            return undefined;
        }
        if (override.expirationMode === 'None') {
            return {
                ExpirationTurns: override.expirationTurns ?? 0,
                ExpirationMode: 'None',
            };
        }
        if (override.expirationTurns != null) {
            const mode: ActionExpirationMode = override.expirationMode || 'Remove';
            return {
                ExpirationTurns: override.expirationTurns,
                ExpirationMode: mode,
                CompactMode: override.compactMode ?? (mode === 'Compact' ? 'First N Chars' : undefined),
                CompactLength: override.compactLength,
                CompactPromptID: override.compactPromptId,
            };
        }
        return undefined;
    }

    private static resolveAgentActionExpiration(
        agentAction: MJAIAgentActionEntity,
        actionConfig: MJActionEntity_IActionConfiguration | undefined,
        defaultPromptId: string | undefined
    ): ResolvedActionExpirationConfig {
        const mode: ActionExpirationMode = agentAction.ResultExpirationMode || 'None';
        return {
            ExpirationTurns: agentAction.ResultExpirationTurns!,
            ExpirationMode: mode,
            CompactMode:
                agentAction.CompactMode ??
                actionConfig?.compactMode ??
                (mode === 'Compact' ? 'First N Chars' : undefined),
            CompactLength: agentAction.CompactLength ?? actionConfig?.compactLength ?? undefined,
            CompactPromptID: agentAction.CompactPromptID ?? defaultPromptId,
        };
    }

    private static warnIncompleteActionConfigOnce(
        actionEntity: MJActionEntityExtended,
        reason: 'missing-mode' | 'missing-turns',
        detail: string
    ): void {
        const warnKey = `${NormalizeUUID(actionEntity.ID)}:${reason}`;
        if (!ActionLifecycleResolver.warnedIncompleteConfigs.has(warnKey)) {
            ActionLifecycleResolver.warnedIncompleteConfigs.add(warnKey);
            LogError(
                `ActionLifecycleResolver.ResolveExpirationConfig: Action '${actionEntity.Name}' (${actionEntity.ID}) ${detail}; expiration is inactive.`
            );
        }
    }

    private static resolveActionConfigExpiration(
        actionEntity: MJActionEntityExtended,
        actionConfig: MJActionEntity_IActionConfiguration,
        defaultPromptId: string | undefined
    ): ResolvedActionExpirationConfig | undefined {
        if (actionConfig.resultExpirationTurns != null) {
            const mode: ActionExpirationMode = actionConfig.resultExpirationMode ?? 'None';
            if (mode !== 'None') {
                return {
                    ExpirationTurns: actionConfig.resultExpirationTurns,
                    ExpirationMode: mode,
                    CompactMode: actionConfig.compactMode ?? (mode === 'Compact' ? 'First N Chars' : undefined),
                    CompactLength: actionConfig.compactLength,
                    CompactPromptID: defaultPromptId,
                };
            }
            if (actionConfig.resultExpirationMode === undefined) {
                ActionLifecycleResolver.warnIncompleteActionConfigOnce(
                    actionEntity,
                    'missing-mode',
                    `sets Action.Config.resultExpirationTurns=${actionConfig.resultExpirationTurns} without resultExpirationMode ('Compact' or 'Remove')`
                );
            }
            return undefined;
        }

        if (actionConfig.resultExpirationMode === 'Compact' || actionConfig.resultExpirationMode === 'Remove') {
            ActionLifecycleResolver.warnIncompleteActionConfigOnce(
                actionEntity,
                'missing-turns',
                `sets Action.Config.resultExpirationMode='${actionConfig.resultExpirationMode}' without resultExpirationTurns`
            );
        }
        return undefined;
    }

    private static lookupDynamicActionLimit(
        dynamicActionLimits: Readonly<Record<string, number>> | undefined,
        actionId: string
    ): number | undefined {
        if (!dynamicActionLimits) {
            return undefined;
        }
        if (dynamicActionLimits[actionId] != null) {
            return dynamicActionLimits[actionId];
        }
        for (const [key, limit] of Object.entries(dynamicActionLimits)) {
            if (UUIDsEqual(key, actionId)) {
                return limit;
            }
        }
        return undefined;
    }

    private static isMoreRestrictiveExpiration(candidate: ComparableExpiration, current: ComparableExpiration): boolean {
        if (candidate.ExpirationTurns !== current.ExpirationTurns) {
            return candidate.ExpirationTurns < current.ExpirationTurns;
        }
        if (candidate.ExpirationMode !== current.ExpirationMode) {
            return candidate.ExpirationMode === 'Remove';
        }
        if (candidate.ExpirationMode === 'Compact') {
            const candidateLen = candidate.CompactLength ?? Number.POSITIVE_INFINITY;
            const currentLen = current.CompactLength ?? Number.POSITIVE_INFINITY;
            return candidateLen < currentLen;
        }
        return false;
    }

    private static isActionArray(
        val: MJActionEntityExtended | readonly (MJActionEntityExtended | undefined)[]
    ): val is readonly (MJActionEntityExtended | undefined)[] {
        return Array.isArray(val);
    }

    private static normalizeMatchedActions(
        matchedActions?: MJActionEntityExtended | readonly (MJActionEntityExtended | undefined)[]
    ): MJActionEntityExtended[] {
        if (!matchedActions) {
            return [];
        }
        if (ActionLifecycleResolver.isActionArray(matchedActions)) {
            return matchedActions.filter((a): a is MJActionEntityExtended => a != null);
        }
        return [matchedActions];
    }

    private static pickMoreRestrictiveExpiration(
        a: AgentChatMessageMetadata,
        b: AgentChatMessageMetadata
    ): ExpirationMetadataFields {
        const isActive = (m: AgentChatMessageMetadata): boolean =>
            m.expirationTurns != null && m.expirationMode != null && m.expirationMode !== 'None';
        const aActive = isActive(a);
        const bActive = isActive(b);
        if (aActive && bActive) {
            const bWins = ActionLifecycleResolver.isMoreRestrictiveExpiration(
                { ExpirationTurns: b.expirationTurns!, ExpirationMode: b.expirationMode!, CompactLength: b.compactLength },
                { ExpirationTurns: a.expirationTurns!, ExpirationMode: a.expirationMode!, CompactLength: a.compactLength }
            );
            const chosen = bWins ? b : a;
            return {
                expirationTurns: chosen.expirationTurns,
                expirationMode: chosen.expirationMode,
                compactMode: chosen.compactMode,
                compactLength: chosen.compactLength,
                compactPromptId: chosen.compactPromptId,
            };
        }
        const active = bActive ? b : aActive ? a : undefined;
        return {
            expirationTurns: active ? active.expirationTurns : (a.expirationTurns ?? b.expirationTurns),
            expirationMode: active ? active.expirationMode : (a.expirationMode ?? b.expirationMode),
            compactMode: active ? active.compactMode : (a.compactMode ?? b.compactMode),
            compactLength: active ? active.compactLength : (a.compactLength ?? b.compactLength),
            compactPromptId: active ? active.compactPromptId : (a.compactPromptId ?? b.compactPromptId),
        };
    }

    private static stripExpirationFields(
        meta: AgentChatMessageMetadata
    ): Omit<AgentChatMessageMetadata, keyof ExpirationMetadataFields> {
        const { expirationTurns: _t, expirationMode: _m, compactMode: _cm, compactLength: _cl, compactPromptId: _cp, ...rest } = meta;
        return rest;
    }
}
