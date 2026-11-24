/**
 * @fileoverview Unified action-result lifecycle resolution and lazy artifact spillover manager.
 *
 * Centralizes:
 * - Action-level result expiration, compaction, and per-run execution limit resolution across
 *   run overrides (`ExecuteAgentParams.messageExpirationOverride`), active per-agent
 *   `MJAIAgentActionEntity` rows, and action metadata defaults (`Action.Config_Object`), so
 *   directly-attached (`AIAgentAction`) and skill-bundled (`AISkillAction`) actions share one path.
 * - Lazy, KV-cache-preserving artifact spillover queueing and materialization into
 *   {@link ArtifactToolManager}, deferring full serialization and manifest mutation until inline
 *   content is actually truncated, stubbed, or removed.
 * - Metadata merging when adjacent native `role: 'tool'` turns are combined.
 *
 * @module @memberjunction/ai-agents
 */

import { CleanAndParseJSON, IndexByUUID, NormalizeUUID, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import type { MJAIAgentActionEntity, MJActionEntity_IActionConfiguration } from '@memberjunction/core-entities';
import type { ActionOutputTrustLevel, ActionParam, MJActionEntityExtended } from '@memberjunction/actions-base';
import type {
    AgentChatMessage,
    AgentChatMessageMetadata,
    ExecuteAgentParams,
    InputArtifact,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { ArtifactToolManager } from './ArtifactToolManager';

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

/**
 * Character and row thresholds deciding when an action output warrants spillover registration
 * in `ArtifactToolManager`.
 */
export interface ActionSpilloverThresholds {
    CharThreshold: number;
    RowThreshold: number;
}

/**
 * Inputs for queuing or registering spillover artifacts for an action output.
 */
export interface ActionOutputSpilloverInput {
    ActionName: string;
    OutputParams: ActionParam[];
    Message?: string;
    StepNumber: number;
    ExpirationConfig?: ResolvedActionExpirationConfig;
    TrustLevel?: ActionOutputTrustLevel;
    /** Explicit external provenance label (e.g. from an extracted `<untrusted_external_data>` envelope). */
    SourceName?: string;
}

/** Tracks `normalizedActionId:reason` keys already warned about incomplete `Action.Config` metadata. */
const warnedIncompleteActionExpirationConfigs = new Set<string>();

/** Process-wide monotonic sequence counter for deferred spillover tokens across agent runs/instances. */
let deferredSpilloverSequence = 0;

const SPILLOVER_COMPACT_LENGTH_FALLBACK = 500;
const SPILLOVER_COMPACT_CHAR_RATIO = 0.75;
const SPILLOVER_COMPACT_MIN_CHARS = 200;
const SPILLOVER_EXPIRING_CHAR_THRESHOLD = 500;
const SPILLOVER_PERSISTENT_CHAR_THRESHOLD = 4000;
const SPILLOVER_EXPIRING_ROW_THRESHOLD = 5;
const SPILLOVER_PERSISTENT_ROW_THRESHOLD = 25;

/**
 * Clears cached one-time incomplete `Action.Config` expiration warnings (primarily for test isolation).
 */
export function ClearIncompleteActionExpirationWarnings(): void {
    warnedIncompleteActionExpirationConfigs.clear();
}

/**
 * Reads the parsed `IActionConfiguration` JSON object from an `MJActionEntityExtended` instance.
 * Supports hydrated `Config_Object` and raw `Config_` JSON strings.
 */
export function GetActionConfigObject(
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
            `GetActionConfigObject: malformed Action.Config JSON on '${actionEntity.Name}': ${err instanceof Error ? err.message : String(err)}`
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
 * Returns the effective `MJAIAgentActionEntity` rows for `agentId`, walking `BaseAgentID`
 * prototype inheritance via `AIEngine.Instance.GetEffectiveAgentActions` when available and
 * falling back to `AIEngine.Instance.AgentActions` only for lightweight test mocks that omit
 * `GetEffectiveAgentActions`.
 */
function resolveEffectiveAgentActions(agentId: string): MJAIAgentActionEntity[] {
    const engine = AIEngine.Instance;
    if (typeof engine?.GetEffectiveAgentActions === 'function') {
        return engine.GetEffectiveAgentActions(agentId);
    }
    return (engine?.AgentActions ?? []).filter(aa => UUIDsEqual(aa.AgentID, agentId));
}

/**
 * Indexes already-resolved effective `MJAIAgentActionEntity` rows (which may include rows
 * inherited from a `BaseAgentID` ancestor) by `ActionID` for O(1) case-insensitive UUID lookup.
 */
export function IndexEffectiveAgentActions(
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
export function IndexActiveAgentActions(
    agentId: string,
    agentActions?: readonly MJAIAgentActionEntity[]
): UUIDMap<MJAIAgentActionEntity> {
    if (agentActions !== undefined) {
        const active = agentActions.filter(
            aa => UUIDsEqual(aa.AgentID, agentId) && (!aa.Status || aa.Status === 'Active')
        );
        return IndexByUUID(active, aa => aa.ActionID);
    }
    return IndexEffectiveAgentActions(resolveEffectiveAgentActions(agentId));
}

function findActiveAgentAction(
    agentId: string,
    actionId: string,
    agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
): MJAIAgentActionEntity | undefined {
    if (agentActionsByActionId) {
        return agentActionsByActionId.Get(actionId);
    }
    return resolveEffectiveAgentActions(agentId).find(
        aa => UUIDsEqual(aa.ActionID, actionId) && (!aa.Status || aa.Status === 'Active')
    );
}

function resolveOverrideExpiration(
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

function resolveAgentActionExpiration(
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

function warnIncompleteActionConfigOnce(
    actionEntity: MJActionEntityExtended,
    reason: 'missing-mode' | 'missing-turns',
    detail: string
): void {
    const warnKey = `${NormalizeUUID(actionEntity.ID)}:${reason}`;
    if (!warnedIncompleteActionExpirationConfigs.has(warnKey)) {
        warnedIncompleteActionExpirationConfigs.add(warnKey);
        LogError(
            `ResolveActionExpirationConfig: Action '${actionEntity.Name}' (${actionEntity.ID}) ${detail}; expiration is inactive.`
        );
    }
}

function resolveActionConfigExpiration(
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
            warnIncompleteActionConfigOnce(
                actionEntity,
                'missing-mode',
                `sets Action.Config.resultExpirationTurns=${actionConfig.resultExpirationTurns} without resultExpirationMode ('Compact' or 'Remove')`
            );
        }
        return undefined;
    }

    if (actionConfig.resultExpirationMode === 'Compact' || actionConfig.resultExpirationMode === 'Remove') {
        warnIncompleteActionConfigOnce(
            actionEntity,
            'missing-turns',
            `sets Action.Config.resultExpirationMode='${actionConfig.resultExpirationMode}' without resultExpirationTurns`
        );
    }
    return undefined;
}

/**
 * Resolves result-expiration and compaction settings for an action across a single unified
 * hierarchy so directly-attached actions (`AIAgentAction`) and skill-bundled actions
 * (`AISkillAction`) behave identically.
 *
 * Precedence:
 * 1. Run-level override (`params.messageExpirationOverride`), including explicit `expirationMode: 'None'` opt-out
 * 2. Active per-agent `MJAIAgentActionEntity` row when `ResultExpirationTurns != null`
 * 3. Action metadata defaults (`Action.Config_Object`, falling back to `Action.DefaultCompactPromptID`)
 */
export function ResolveActionExpirationConfig(
    actionEntity: MJActionEntityExtended | undefined,
    agentId: string,
    params?: ExecuteAgentParams,
    agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
): ResolvedActionExpirationConfig | undefined {
    const fromOverride = resolveOverrideExpiration(params?.messageExpirationOverride);
    if (fromOverride) {
        return fromOverride;
    }
    if (!actionEntity) {
        return undefined;
    }

    const actionConfig = GetActionConfigObject(actionEntity);
    const defaultPromptId = actionConfig?.compactPromptId ?? actionEntity.DefaultCompactPromptID ?? undefined;

    const agentAction = findActiveAgentAction(agentId, actionEntity.ID, agentActionsByActionId);
    if (agentAction && agentAction.ResultExpirationTurns != null) {
        return resolveAgentActionExpiration(agentAction, actionConfig, defaultPromptId);
    }

    return actionConfig ? resolveActionConfigExpiration(actionEntity, actionConfig, defaultPromptId) : undefined;
}

function lookupDynamicActionLimit(
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

/**
 * Resolves the maximum executions per run for an action across active per-agent `AIAgentAction`
 * rows, dynamic `actionChanges` limits, and `Action.Config_Object?.maxExecutionsPerRun`.
 */
export function ResolveActionMaxExecutionsPerRun(
    actionEntity: MJActionEntityExtended,
    agentId: string,
    dynamicActionLimits?: Readonly<Record<string, number>>,
    agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
): number | null {
    const dbAgentAction = findActiveAgentAction(agentId, actionEntity.ID, agentActionsByActionId);
    if (dbAgentAction?.MaxExecutionsPerRun != null) {
        return dbAgentAction.MaxExecutionsPerRun;
    }
    const dynamicLimit = lookupDynamicActionLimit(dynamicActionLimits, actionEntity.ID);
    if (dynamicLimit != null) {
        return dynamicLimit;
    }
    const actionConfig = GetActionConfigObject(actionEntity);
    if (typeof actionConfig?.maxExecutionsPerRun === 'number' && actionConfig.maxExecutionsPerRun > 0) {
        return actionConfig.maxExecutionsPerRun;
    }
    return null;
}

interface ComparableExpiration {
    ExpirationTurns: number;
    ExpirationMode: ActionExpirationMode;
    CompactLength?: number;
}

function isMoreRestrictiveExpiration(candidate: ComparableExpiration, current: ComparableExpiration): boolean {
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

/**
 * Picks the most restrictive active expiration config from one or more resolved action configs,
 * ignoring `undefined` and `'None'` entries.
 *
 * Precedence on ties:
 * 1. Shorter `ExpirationTurns`
 * 2. `'Remove'` over `'Compact'`
 * 3. Smaller `CompactLength` when both are `'Compact'`
 */
export function PickMostRestrictiveExpirationConfig(
    configs: readonly (ResolvedActionExpirationConfig | undefined)[]
): ResolvedActionExpirationConfig | undefined {
    let best: ResolvedActionExpirationConfig | undefined;
    for (const cfg of configs) {
        if (!cfg || cfg.ExpirationTurns == null || cfg.ExpirationMode === 'None') {
            continue;
        }
        if (!best || isMoreRestrictiveExpiration(cfg, best)) {
            best = cfg;
        }
    }
    return best;
}

type ExpirationMetadataFields = Pick<
    AgentChatMessageMetadata,
    'expirationTurns' | 'expirationMode' | 'compactMode' | 'compactLength' | 'compactPromptId'
>;

/**
 * Projects an active `ResolvedActionExpirationConfig` onto `AgentChatMessageMetadata` expiration
 * fields, returning an empty object when the config is absent or inactive (`'None'`).
 */
export function ExpirationConfigToMetadataFields(
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
export function MetadataToExpirationConfig(
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

function normalizeMatchedActions(
    matchedActions?: MJActionEntityExtended | readonly (MJActionEntityExtended | undefined)[]
): MJActionEntityExtended[] {
    if (Array.isArray(matchedActions)) {
        return matchedActions.filter((a): a is MJActionEntityExtended => a != null);
    }
    return matchedActions ? [matchedActions as MJActionEntityExtended] : [];
}

/**
 * Resolves conversation message expiration metadata for a `ForEach`/`While` loop result message
 * using the unified `ResolveActionExpirationConfig` hierarchy across one or more loop-body actions.
 * Explicit `'None'` opt-outs disable expiration; unconfigured actions fall back to 3-turn `'Remove'`
 * so loop summaries stay bounded.
 */
export function ResolveLoopExpirationMetadata(
    params: ExecuteAgentParams,
    turnAdded: number,
    matchedActions?: MJActionEntityExtended | readonly (MJActionEntityExtended | undefined)[],
    agentActionsByActionId?: UUIDMap<MJAIAgentActionEntity>
): AgentChatMessageMetadata {
    const baseMetadata: AgentChatMessageMetadata = {
        turnAdded,
        messageType: 'loop-result',
    };

    const fromOverride = resolveOverrideExpiration(params.messageExpirationOverride);
    if (fromOverride) {
        return { ...baseMetadata, ...ExpirationConfigToMetadataFields(fromOverride) };
    }

    const actions = normalizeMatchedActions(matchedActions);
    if (actions.length > 0) {
        const indexedActions = agentActionsByActionId ?? IndexActiveAgentActions(params.agent.ID);
        const resolvedList = actions.map(action =>
            ResolveActionExpirationConfig(action, params.agent.ID, params, indexedActions)
        );
        const mostRestrictive = PickMostRestrictiveExpirationConfig(resolvedList);
        if (mostRestrictive) {
            return { ...baseMetadata, ...ExpirationConfigToMetadataFields(mostRestrictive) };
        }
        if (resolvedList.every(r => r?.ExpirationMode === 'None')) {
            return baseMetadata;
        }
    }

    return { ...baseMetadata, expirationTurns: 3, expirationMode: 'Remove' };
}

function pickMoreRestrictiveExpiration(
    a: AgentChatMessageMetadata,
    b: AgentChatMessageMetadata
): ExpirationMetadataFields {
    const isActive = (m: AgentChatMessageMetadata): boolean =>
        m.expirationTurns != null && m.expirationMode != null && m.expirationMode !== 'None';
    const aActive = isActive(a);
    const bActive = isActive(b);
    if (aActive && bActive) {
        const bWins = isMoreRestrictiveExpiration(
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

function stripExpirationFields(
    meta: AgentChatMessageMetadata
): Omit<AgentChatMessageMetadata, keyof ExpirationMetadataFields> {
    const { expirationTurns: _t, expirationMode: _m, compactMode: _cm, compactLength: _cl, compactPromptId: _cp, ...rest } = meta;
    return rest;
}

/**
 * Merges conversation metadata when two `role: 'tool'` turns answering the same assistant call
 * turn are combined into one provider-valid tool turn. Preserves active expiration rules
 * (preferring the shorter `expirationTurns`, ignoring `'None'`) and unions artifact/spillover IDs.
 */
export function MergeToolTurnMetadata(
    a?: AgentChatMessageMetadata,
    b?: AgentChatMessageMetadata
): AgentChatMessageMetadata | undefined {
    if (!a || !b) {
        return a ?? b;
    }
    const mergeStringArrays = (x?: string[], y?: string[]): string[] | undefined => {
        const combined = [...(x ?? []), ...(y ?? [])];
        return combined.length > 0 ? Array.from(new Set(combined)) : undefined;
    };
    const exp = pickMoreRestrictiveExpiration(a, b);
    const artifactIds = mergeStringArrays(a.artifactIds, b.artifactIds);
    const pendingSpilloverIds = mergeStringArrays(a.pendingSpilloverIds, b.pendingSpilloverIds);
    return {
        ...stripExpirationFields(a),
        ...stripExpirationFields(b),
        turnAdded: Math.min(a.turnAdded ?? b.turnAdded ?? 0, b.turnAdded ?? a.turnAdded ?? 0),
        messageType: a.messageType || b.messageType,
        ...(exp.expirationTurns !== undefined ? { expirationTurns: exp.expirationTurns } : {}),
        ...(exp.expirationMode !== undefined ? { expirationMode: exp.expirationMode } : {}),
        ...(exp.compactMode !== undefined ? { compactMode: exp.compactMode } : {}),
        ...(exp.compactLength !== undefined ? { compactLength: exp.compactLength } : {}),
        ...(exp.compactPromptId !== undefined ? { compactPromptId: exp.compactPromptId } : {}),
        ...(artifactIds ? { artifactIds } : {}),
        ...(pendingSpilloverIds ? { pendingSpilloverIds } : {}),
    };
}

/**
 * Formats the standardized inline hint reminding the model which materialized artifact handle(s)
 * hold the full queryable output after compaction or stubbing.
 */
export function FormatArtifactSpilloverHint(
    artifactIds: readonly string[] | undefined,
    hasArtifacts: boolean,
    style: 'sentence' | 'semicolon' = 'sentence'
): string {
    if (!hasArtifacts || !artifactIds || artifactIds.length === 0) {
        return '';
    }
    const joined = artifactIds.join(', ');
    return style === 'semicolon'
        ? `; full output remains queryable via artifact tools on Artifact ${joined}`
        : ` Full output remains queryable via artifact tools on Artifact ${joined}.`;
}

/**
 * Computes character and row spillover thresholds from resolved action expiration settings.
 * In `Compact` mode, only large outputs that compaction (`CompactLength`) would truncate
 * spill over into artifacts, keeping tiny lookup results out of `_ARTIFACT_MANIFEST`.
 */
export function ResolveActionSpilloverThresholds(
    expirationConfig?: ResolvedActionExpirationConfig
): ActionSpilloverThresholds {
    const willExpire = expirationConfig != null && expirationConfig.ExpirationMode !== 'None';
    const isCompact = willExpire && expirationConfig.ExpirationMode === 'Compact';
    const CharThreshold = isCompact
        ? Math.max(
            Math.floor(
                (expirationConfig.CompactLength ?? SPILLOVER_COMPACT_LENGTH_FALLBACK) *
                    SPILLOVER_COMPACT_CHAR_RATIO
            ),
            SPILLOVER_COMPACT_MIN_CHARS
        )
        : willExpire
            ? SPILLOVER_EXPIRING_CHAR_THRESHOLD
            : SPILLOVER_PERSISTENT_CHAR_THRESHOLD;
    const RowThreshold = isCompact
        ? Number.MAX_SAFE_INTEGER
        : willExpire
            ? SPILLOVER_EXPIRING_ROW_THRESHOLD
            : SPILLOVER_PERSISTENT_ROW_THRESHOLD;
    return { CharThreshold, RowThreshold };
}

function isTabularRowArray(val: unknown): val is Array<Record<string, unknown>> {
    return (
        Array.isArray(val) &&
        val.length > 0 &&
        val.every(r => r !== null && typeof r === 'object' && !Array.isArray(r))
    );
}

function isSpilloverStringParam(val: unknown, charThreshold: number): val is string {
    return (
        typeof val === 'string' &&
        val.length >= charThreshold &&
        !val.startsWith('[Media output') &&
        !val.startsWith('[File output')
    );
}

function estimatePrimitiveJsonChars(node: unknown): number | null {
    if (node === null || node === undefined) {
        return 4;
    }
    if (typeof node === 'string') {
        return node.length + 2;
    }
    if (typeof node === 'number' || typeof node === 'boolean') {
        return String(node).length;
    }
    if (node instanceof Date) {
        return 26;
    }
    return typeof node === 'object' ? null : 0;
}

/**
 * Estimates whether pretty-printed JSON (`JSON.stringify(val, null, 2)`) meets `charThreshold`
 * using an incremental walk that stops as soon as the budget is crossed, avoiding eager full
 * serialization of huge nested objects at spillover queue time. Tracks active ancestors so cycles
 * are skipped without undercounting valid shared DAG object references.
 */
function exceedsJsonCharBudget(val: unknown, charThreshold: number): boolean {
    const state = { chars: 0, ancestors: new Set<object>() };
    const visit = (node: unknown, depth: number): boolean => {
        if (state.chars >= charThreshold) {
            return true;
        }
        const primitiveChars = estimatePrimitiveJsonChars(node);
        if (primitiveChars !== null) {
            state.chars += primitiveChars;
            return state.chars >= charThreshold;
        }
        const obj = node as object;
        if (state.ancestors.has(obj)) {
            return false;
        }
        state.ancestors.add(obj);
        try {
            state.chars += 2;
            if (Array.isArray(obj)) {
                return obj.some(item => {
                    state.chars += 2 + depth * 2;
                    return visit(item, depth + 1);
                });
            }
            const record = obj as Record<string, unknown>;
            return Object.keys(record).some(k => {
                state.chars += k.length + 5 + depth * 2;
                return visit(record[k], depth + 1);
            });
        } finally {
            state.ancestors.delete(obj);
        }
    };
    return visit(val, 1);
}

/**
 * Serializes an action output payload to JSON without allowing circular references or `BigInt`
 * values to crash compaction or context recovery.
 */
function safeJsonStringify(value: unknown, pretty: boolean, contextLabel: string): string | undefined {
    try {
        // fls-guard: action output params already scoped to the run's contextUser and audience in ExecuteSingleAction
        return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    } catch (err) {
        LogError(
            `ActionResultSpilloverManager: skipping non-JSON-serializable ${contextLabel}: ${err instanceof Error ? err.message : String(err)}`
        );
        return undefined;
    }
}

/**
 * Cheap strict-JSON check for spilled string payloads: verifies matching `{...}` or `[...]`
 * delimiters before parsing so large bracket-prefixed logs or markdown skip JSON parsing entirely.
 */
function isJsonStringPayload(trimmed: string): boolean {
    const hasObjectDelimiters = trimmed.startsWith('{') && trimmed.endsWith('}');
    const hasArrayDelimiters = trimmed.startsWith('[') && trimmed.endsWith(']');
    if (!hasObjectDelimiters && !hasArrayDelimiters) {
        return false;
    }
    try {
        const parsed: unknown = JSON.parse(trimmed);
        return parsed !== null && typeof parsed === 'object';
    } catch {
        return false;
    }
}

function wouldTabularRowsSpillOver(
    rows: Array<Record<string, unknown>>,
    thresholds: ActionSpilloverThresholds
): boolean {
    if (rows.length >= thresholds.RowThreshold) {
        return true;
    }
    let approxChars = 2;
    for (let i = 0; i < rows.length; i++) {
        const rowJson = safeJsonStringify(rows[i], false, 'tabular row');
        if (rowJson === undefined) {
            return false;
        }
        approxChars += rowJson.length + (i > 0 ? 1 : 0);
        if (approxChars >= thresholds.CharThreshold) {
            return true;
        }
    }
    return false;
}

function inferSnapshotColumns(
    firstRow: Record<string, unknown>,
    rawColumns?: Array<Record<string, unknown>>
): Array<{ field: string; sqlBaseType: string }> {
    if (rawColumns && rawColumns.length > 0) {
        return rawColumns
            .map(c => ({
                field: String(c.ColumnName ?? c.field ?? c.Name ?? ''),
                sqlBaseType: String(c.DataType ?? c.sqlBaseType ?? 'nvarchar'),
            }))
            .filter(c => c.field.length > 0);
    }
    return Object.keys(firstRow).map(field => ({
        field,
        sqlBaseType:
            typeof firstRow[field] === 'number'
                ? 'float'
                : typeof firstRow[field] === 'boolean'
                    ? 'bit'
                    : 'nvarchar',
    }));
}

type SpilloverTrustMetadata = Partial<Pick<InputArtifact, 'trustLevel' | 'sourceName'>>;

function extractRawColumnsMetadata(outputParams: ActionParam[]): Array<Record<string, unknown>> | undefined {
    const columnsParam = outputParams.find(
        p => p.Name?.trim().toLowerCase() === 'columns' && Array.isArray(p.Value)
    );
    return Array.isArray(columnsParam?.Value)
        ? (columnsParam.Value as Array<Record<string, unknown>>)
        : undefined;
}

function buildTabularSpilloverArtifacts(
    actionName: string,
    outputParams: ActionParam[],
    stepNumber: number,
    thresholds: ActionSpilloverThresholds,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact[] {
    const rawColumns = extractRawColumnsMetadata(outputParams);
    const artifacts: InputArtifact[] = [];

    for (const param of outputParams) {
        if (param.Name?.trim().toLowerCase() === 'columns' || !isTabularRowArray(param.Value)) {
            continue;
        }
        const rows = param.Value;
        if (!wouldTabularRowsSpillOver(rows, thresholds)) {
            continue;
        }
        const tableName = param.Name || 'Results';
        const columns = inferSnapshotColumns(rows[0], rawColumns);
        const snapshotJson = safeJsonStringify(
            { tables: [{ name: tableName, columns, rows, metadata: { rowCount: rows.length } }] },
            false,
            `tabular spillover for '${actionName}.${tableName}'`
        );
        if (!snapshotJson) {
            continue;
        }
        artifacts.push({
            name: `${actionName} — ${tableName} (Step ${stepNumber})`,
            typeName: 'Data Snapshot',
            toolLibraryClass: 'DataSnapshotToolLibrary',
            mimeType: 'application/json',
            content: snapshotJson,
            description: `${rows.length} row(s) returned by action "${actionName}" (${tableName}). Queryable via get_tables, get_schema, get_rows, search_rows, filter, aggregate, group_aggregate, compute, or get_full.`,
            deliveryMode: 'ToolsOnly',
            forceToolsOnly: true,
            ...trustMetadata,
        });
    }
    return artifacts;
}

function buildStringSpilloverArtifact(
    actionName: string,
    paramName: string,
    val: string,
    stepNumber: number,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact {
    const lowerName = paramName.trim().toLowerCase();
    const trimmed = val.trim();
    const isJsonString = isJsonStringPayload(trimmed);
    const isCsv =
        !isJsonString &&
        (lowerName.includes('csv') ||
            (lowerName === 'formattedresults' && trimmed.includes(',') && trimmed.includes('\n')));
    return {
        name: `${actionName} — ${paramName} (Step ${stepNumber})`,
        typeName: isJsonString ? 'JSON' : isCsv ? 'CSV' : 'Text',
        toolLibraryClass: isJsonString ? 'JSONToolLibrary' : isCsv ? 'CSVToolLibrary' : 'TextToolLibrary',
        mimeType: isJsonString ? 'application/json' : isCsv ? 'text/csv' : 'text/plain',
        content: val,
        description: `Output from action "${actionName}" (${paramName}, ${val.length} chars).`,
        deliveryMode: 'ToolsOnly',
        forceToolsOnly: true,
        ...trustMetadata,
    };
}

function buildSingleParamSpilloverArtifact(
    actionName: string,
    param: ActionParam,
    stepNumber: number,
    charThreshold: number,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact | undefined {
    const val = param.Value;
    if (val == null || isTabularRowArray(val)) {
        return undefined;
    }
    if (typeof val === 'object') {
        const serialized = safeJsonStringify(val, true, `object spillover for '${actionName}.${param.Name}'`);
        if (!serialized || serialized.length < charThreshold) {
            return undefined;
        }
        return {
            name: `${actionName} — ${param.Name} (Step ${stepNumber})`,
            typeName: 'JSON',
            toolLibraryClass: 'JSONToolLibrary',
            mimeType: 'application/json',
            content: serialized,
            description: `Structured JSON output from action "${actionName}" (${param.Name}). Queryable via json_path, json_keys, json_search, json_iterate, or get_full.`,
            deliveryMode: 'ToolsOnly',
            forceToolsOnly: true,
            ...trustMetadata,
        };
    }
    if (!isSpilloverStringParam(val, charThreshold)) {
        return undefined;
    }
    return buildStringSpilloverArtifact(actionName, param.Name || 'Output', val, stepNumber, trustMetadata);
}

function buildParamSpilloverArtifacts(
    actionName: string,
    outputParams: ActionParam[],
    stepNumber: number,
    charThreshold: number,
    skipTabularDuplicates: boolean,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact[] {
    const artifacts: InputArtifact[] = [];
    for (const param of outputParams) {
        const lowerName = (param.Name || '').trim().toLowerCase();
        if (lowerName === 'columns' || (skipTabularDuplicates && (lowerName === 'formattedresults' || lowerName === 'results'))) {
            continue;
        }
        const artifact = buildSingleParamSpilloverArtifact(actionName, param, stepNumber, charThreshold, trustMetadata);
        if (artifact) {
            artifacts.push(artifact);
        }
    }
    return artifacts;
}

function buildMessageSpilloverArtifact(
    actionName: string,
    message: string | undefined,
    stepNumber: number,
    charThreshold: number,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact | undefined {
    if (typeof message !== 'string' || message.length < charThreshold) {
        return undefined;
    }
    const isJsonString = isJsonStringPayload(message.trim());
    return {
        name: `${actionName} — Output (Step ${stepNumber})`,
        typeName: isJsonString ? 'JSON' : 'Text',
        toolLibraryClass: isJsonString ? 'JSONToolLibrary' : 'TextToolLibrary',
        mimeType: isJsonString ? 'application/json' : 'text/plain',
        content: message,
        description: `Full message output from action "${actionName}" (${message.length} chars). Queryable via grep, get_lines, or get_full.`,
        deliveryMode: 'ToolsOnly',
        forceToolsOnly: true,
        ...trustMetadata,
    };
}

function isParamEligibleForSpillover(
    param: ActionParam,
    thresholds: ActionSpilloverThresholds
): boolean {
    const lowerName = (param.Name || '').trim().toLowerCase();
    if (lowerName === 'columns') {
        return false;
    }
    const val = param.Value;
    if (val == null) {
        return false;
    }
    if (isTabularRowArray(val)) {
        return wouldTabularRowsSpillOver(val, thresholds);
    }
    if (typeof val === 'object') {
        return exceedsJsonCharBudget(val, thresholds.CharThreshold);
    }
    return isSpilloverStringParam(val, thresholds.CharThreshold);
}

/**
 * Manages lazy, KV-cache-preserving spillover of large or expirable action outputs into an
 * {@link ArtifactToolManager}. Keeps `_ARTIFACT_MANIFEST` untouched while full results stay
 * inline, and materializes artifacts only when inline content is compacted, stubbed, or removed.
 */
export class ActionResultSpilloverManager {
    private deferredSpillovers: Map<string, () => string[]> = new Map();

    /** Number of unmaterialized deferred spillover closures currently queued for this run. */
    public get PendingCount(): number {
        return this.deferredSpillovers.size;
    }

    /** True when `message` references at least one deferred spillover token owned by this manager. */
    public HasOwnedPending(message?: AgentChatMessage): boolean {
        return Boolean(message?.metadata?.pendingSpilloverIds?.some(token => this.deferredSpillovers.has(token)));
    }

    /** Discards all unmaterialized deferred spillover closures (called on run start/end). */
    public Clear(): void {
        this.deferredSpillovers.clear();
    }

    /**
     * Pure predicate indicating whether the given action output warrants spillover registration,
     * using incremental sizing to avoid eager serialization of large arrays or nested objects.
     */
    public WouldSpillOver(
        outputParams: ActionParam[],
        message: string | undefined,
        expirationConfig?: ResolvedActionExpirationConfig
    ): boolean {
        const thresholds = ResolveActionSpilloverThresholds(expirationConfig);
        for (const param of outputParams) {
            if (isParamEligibleForSpillover(param, thresholds)) {
                return true;
            }
        }
        return typeof message === 'string' && message.length >= thresholds.CharThreshold;
    }

    /**
     * Builds the `InputArtifact` definitions that would be registered for an action output.
     */
    public CollectCandidates(input: ActionOutputSpilloverInput): InputArtifact[] {
        const trustLevel = input.TrustLevel ?? 'Trusted';
        const trustMetadata: SpilloverTrustMetadata =
            trustLevel !== 'Trusted'
                ? { trustLevel, sourceName: input.SourceName ?? `action:${input.ActionName}` }
                : {};
        const thresholds = ResolveActionSpilloverThresholds(input.ExpirationConfig);
        const tabular = buildTabularSpilloverArtifacts(
            input.ActionName,
            input.OutputParams,
            input.StepNumber,
            thresholds,
            trustMetadata
        );
        const paramArtifacts = buildParamSpilloverArtifacts(
            input.ActionName,
            input.OutputParams,
            input.StepNumber,
            thresholds.CharThreshold,
            tabular.length > 0,
            trustMetadata
        );
        const combined = [...tabular, ...paramArtifacts];
        if (combined.length > 0) {
            return combined;
        }
        const msgArtifact = buildMessageSpilloverArtifact(
            input.ActionName,
            input.Message,
            input.StepNumber,
            thresholds.CharThreshold,
            trustMetadata
        );
        return msgArtifact ? [msgArtifact] : [];
    }

    /**
     * Defers artifact spillover registration until the inline message is compacted, removed, or
     * recovered. Returns an opaque token stored on `metadata.pendingSpilloverIds`, or `undefined`
     * when the output does not exceed spillover thresholds.
     */
    public QueueDeferred(
        input: ActionOutputSpilloverInput,
        artifactManager: ArtifactToolManager
    ): string | undefined {
        if (!this.WouldSpillOver(input.OutputParams, input.Message, input.ExpirationConfig)) {
            return undefined;
        }
        const capturedInput: ActionOutputSpilloverInput = {
            ...input,
            OutputParams: input.OutputParams.map(param => ({ ...param })),
        };
        const token = `spillover_${++deferredSpilloverSequence}_${Math.random().toString(36).slice(2, 10)}`;
        this.deferredSpillovers.set(token, () =>
            this.CollectCandidates(capturedInput).map(candidate => artifactManager.RegisterArtifact(candidate))
        );
        return token;
    }

    /**
     * Materializes deferred spillovers owned by this manager from `message.metadata.pendingSpilloverIds`,
     * populates `message.metadata.artifactIds`, and preserves any tokens owned by another run/parent.
     */
    public Materialize(message?: AgentChatMessage): string[] {
        const existing = message?.metadata?.artifactIds ?? [];
        const pending = message?.metadata?.pendingSpilloverIds;
        if (!pending || pending.length === 0) {
            return existing;
        }

        const materialized: string[] = [...existing];
        const unconsumed: string[] = [];
        for (const token of pending) {
            const callback = this.deferredSpillovers.get(token);
            if (callback) {
                this.deferredSpillovers.delete(token);
                for (const id of callback()) {
                    if (!materialized.includes(id)) {
                        materialized.push(id);
                    }
                }
            } else {
                unconsumed.push(token);
            }
        }

        if (message?.metadata) {
            if (unconsumed.length > 0) {
                message.metadata.pendingSpilloverIds = unconsumed;
            } else {
                delete message.metadata.pendingSpilloverIds;
            }
            if (materialized.length > 0) {
                message.metadata.artifactIds = materialized;
            }
        }

        return materialized;
    }

    /**
     * Immediately registers spillover artifacts into `artifactManager` (useful for callers/tests
     * that intentionally materialize outside the deferred compaction lifecycle).
     */
    public RegisterImmediate(
        input: ActionOutputSpilloverInput,
        artifactManager: ArtifactToolManager
    ): string[] {
        return this.CollectCandidates(input).map(candidate => artifactManager.RegisterArtifact(candidate));
    }
}
