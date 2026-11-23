/**
 * @fileoverview Agent run limits resolution adapters and structured diagnostic snapshot
 * serialization for `@memberjunction/ai-core-plus`.
 *
 * Bridges {@link LimitsConfigResolver} (`@memberjunction/core`) with MJ AI entities
 * (`MJAIAgentEntity`, `MJAIAgentUserPolicyEntity`, `MJAIAgentRunEntityExtended`) and
 * runtime execution parameters (`ExecuteAgentParams`, `ExecuteAgentResult`) so every
 * agent or workflow run can resolve its 5-tier effective limits and persist an auditable
 * provenance snapshot into run diagnostics.
 *
 * @module @memberjunction/ai-core-plus
 */

import {
    CODE_FALLBACK_LIMITS,
    GetLimitsKeyRole,
    LIMITS_KEY_PATHS,
    LIMITS_TIER_PRECEDENCE,
    LimitsConfigResolver,
    NormalizeLimitsInput,
    ValidateLimitsConfig,
    type IMetadataProvider,
    type LimitsKeyPath,
    type LimitsKeyProvenance,
    type LimitsResolveOptions,
    type LimitsScalarValue,
    type LimitsSourceTier,
    type MJLimitsConfig,
    type MJLimitsOverride,
    type MJLimitsResolutionResult,
    type UserInfo,
} from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { IsPlainObject, SafeJSONParse } from '@memberjunction/global';
import type { ExecuteAgentParams } from './agent-types';
import type { MJAIAgentRunEntityExtended } from './MJAIAgentRunEntityExtended';
import type { RunawayJsonObject, RunawayJsonValue } from './runaway-governance';

/** Schema version tag embedded in every serialized {@link LimitsDiagnosticsSnapshot}. */
export const LIMITS_DIAGNOSTICS_SCHEMA_VERSION = 'mj-limits-snapshot/v1' as const;

/** Reserved property key under `AIAgentRun.Data` JSON where the active limits snapshot is stored. */
export const LIMITS_DIAGNOSTICS_DATA_KEY = '__limitsDiagnostics' as const;

/**
 * Identifying run context captured alongside resolved limits in diagnostics.
 */
export interface LimitsDiagnosticsRunContext {
    AgentID?: string;
    AgentName?: string;
    AgentRunID?: string;
    UserID?: string;
    RoutineID?: string;
    ChannelID?: string;
}

/**
 * Structured, serializable diagnostic snapshot of active resolved limits and per-key tier provenance
 * recorded on an agent or workflow run.
 */
export interface LimitsDiagnosticsSnapshot {
    SchemaVersion: typeof LIMITS_DIAGNOSTICS_SCHEMA_VERSION;
    CapturedAtISO: string;
    Context: LimitsDiagnosticsRunContext;
    ResolvedLimits: MJLimitsConfig;
    Provenance: Record<LimitsKeyPath, LimitsKeyProvenance>;
    OverriddenKeys: LimitsKeyPath[];
    ClampedKeys: LimitsKeyPath[];
}

/**
 * Optional workflow or channel metadata fields contributing to Tier 3 (`AgentOrWorkflowMetadata`).
 */
export interface WorkflowLimitsMetadataInput {
    MaxTasksPerAgentGraph?: number | null;
    MaxTasksPerGraph?: number | null;
    WhileLoopMaxIterations?: number | null;
    ForEachMaxIterations?: number | null;
    MaxConsecutiveAgentTurns?: number | null;
    MaxHourlyWakes?: number | null;
    LimitsOverride?: MJLimitsOverride | null;
}

/**
 * Minimal structural subset of `MJAIAgentEntity` needed for Tier 3 limits extraction.
 */
export type AgentLimitsMetadataInput = Pick<
    MJAIAgentEntity,
    'MaxCostPerRun' | 'MaxTimePerRun' | 'MaxTokensPerRun' | 'TypeConfiguration'
>;

/**
 * Minimal structural subset of `MJAIAgentUserPolicyEntity` needed for Tier 4 limits extraction,
 * including persisted configuration/notes JSON envelopes when storing limits without schema changes.
 */
export type UserPolicyLimitsMetadataInput = Pick<MJAIAgentUserPolicyEntity, 'Status'> &
    Partial<
        Pick<
            MJAIAgentUserPolicyEntity,
            'InstructionsOverride' | 'AutoApproveAmountThreshold' | 'ActionPolicyRules' | 'EntityAccessRules'
        >
    > & {
        LimitsOverride?: MJLimitsOverride | string | null;
        Limits?: MJLimitsOverride | string | null;
        LimitsConfiguration?: MJLimitsOverride | string | null;
        Configuration?: MJLimitsOverride | string | null;
        Settings?: MJLimitsOverride | string | null;
        Notes?: string | null;
    };

/**
 * Minimal structural subset of `MJAIAgentRunEntityExtended` needed for diagnostics attachment/extraction.
 */
export type AgentRunLimitsDiagnosticsTarget = Pick<
    MJAIAgentRunEntityExtended,
    'Data' | 'LimitsDiagnosticsSnapshot'
>;

/**
 * Inputs for resolving all 5 precedence tiers for an agent or workflow run.
 */
export interface ResolveAgentRunLimitsInput {
    CodeFallback?: MJLimitsOverride | null;
    MjConfigLimits?: MJLimitsOverride | null;
    Agent?: AgentLimitsMetadataInput | null;
    /**
     * Optional prototype-inheritance ancestor agents ordered `[rootAgent, ..., parentAgent]`
     * (excluding `Agent` itself, or including it — deduplication is harmless under min clamping).
     * Finite budget/iteration bounds on ancestors act as strictest-wins ceilings that descendants
     * can narrow but never widen.
     */
    AncestorAgents?: ReadonlyArray<AgentLimitsMetadataInput> | null;
    WorkflowMetadata?: WorkflowLimitsMetadataInput | null;
    UserPolicy?: UserPolicyLimitsMetadataInput | null;
    /**
     * Optional user policies attached to prototype ancestors ordered `[rootPolicy, ..., parentPolicy]`.
     * Finite bounds act as strictest-wins ceilings over `UserPolicy`.
     */
    AncestorUserPolicies?: ReadonlyArray<UserPolicyLimitsMetadataInput> | null;
    UserPolicyLimitsOverride?: MJLimitsOverride | null;
    RunParams?: Pick<
        ExecuteAgentParams,
        'absoluteMaxIterations' | 'maxExecutionTimeMs' | 'maxTreeCost' | 'maxTreeTokens' | 'maxTreeDurationMs' | 'limitsOverride'
    > | null;
    RunOverride?: MJLimitsOverride | null;
    /** Server-side execution user checked when `RunOverride` attempts to raise enforced ceilings. */
    ContextUser?: UserInfo | null;
    /** Metadata provider supplying `Authorizations` for `ContextUser` ceiling checks. */
    Provider?: IMetadataProvider | null;
    Options?: LimitsResolveOptions;
}

function mergeLimitsOverrides(base: MJLimitsOverride, extra: MJLimitsOverride): MJLimitsOverride {
    return {
        ...base,
        ...extra,
        Budgets: base.Budgets || extra.Budgets
            ? {
                  ...(base.Budgets ?? {}),
                  ...(extra.Budgets ?? {}),
                  PerRun: base.Budgets?.PerRun || extra.Budgets?.PerRun
                      ? { ...(base.Budgets?.PerRun ?? {}), ...(extra.Budgets?.PerRun ?? {}) }
                      : undefined,
                  PerRoutine: base.Budgets?.PerRoutine || extra.Budgets?.PerRoutine
                      ? { ...(base.Budgets?.PerRoutine ?? {}), ...(extra.Budgets?.PerRoutine ?? {}) }
                      : undefined,
                  PerUserPerDay: base.Budgets?.PerUserPerDay || extra.Budgets?.PerUserPerDay
                      ? { ...(base.Budgets?.PerUserPerDay ?? {}), ...(extra.Budgets?.PerUserPerDay ?? {}) }
                      : undefined,
              }
            : undefined,
        ProgressDetector: base.ProgressDetector || extra.ProgressDetector
            ? { ...(base.ProgressDetector ?? {}), ...(extra.ProgressDetector ?? {}) }
            : undefined,
        ResourceGuards: base.ResourceGuards || extra.ResourceGuards
            ? { ...(base.ResourceGuards ?? {}), ...(extra.ResourceGuards ?? {}) }
            : undefined,
        Tuning: base.Tuning || extra.Tuning
            ? { ...(base.Tuning ?? {}), ...(extra.Tuning ?? {}) }
            : undefined,
    };
}

function isJsonObject(value: RunawayJsonValue | undefined): value is RunawayJsonObject {
    return IsPlainObject(value);
}

function extractAgentTypeConfigLimits(typeConfigJson: string | null | undefined): MJLimitsOverride {
    if (typeof typeConfigJson !== 'string' || typeConfigJson.trim().length === 0) {
        return {};
    }
    const parsed = SafeJSONParse<RunawayJsonObject>(typeConfigJson);
    if (!IsPlainObject(parsed)) {
        return {};
    }
    const rawLimits = Object.prototype.hasOwnProperty.call(parsed, 'limits')
        ? parsed['limits']
        : parsed['Limits'];
    return NormalizeLimitsInput(rawLimits);
}

/** Maximum character prefix scanned when extracting limits envelopes (CR-21). */
export const MAX_DIAGNOSTICS_ENVELOPE_SCAN_CHARS = 65_536;

function tryParseJsonObjectCandidate(candidate: string): RunawayJsonObject | null {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return null;
    }
    const parsed = SafeJSONParse<RunawayJsonObject>(trimmed);
    return IsPlainObject(parsed) ? parsed : null;
}

function skipWhitespace(text: string, start: number): number {
    let idx = start;
    while (idx < text.length && /\s/.test(text[idx])) {
        idx++;
    }
    return idx;
}

function scanCommentEnvelope(bounded: string, lower: string): RunawayJsonObject | null {
    let pos = 0;
    while (pos < lower.length) {
        const openIdx = lower.indexOf('<!--', pos);
        if (openIdx === -1) {
            return null;
        }
        const afterOpen = skipWhitespace(lower, openIdx + 4);
        if (lower.startsWith('mj-limits:', afterOpen)) {
            const bodyStart = afterOpen + 10;
            const closeIdx = lower.indexOf('-->', bodyStart);
            if (closeIdx === -1) {
                return null;
            }
            const nextOpenIdx = lower.indexOf('<!--', bodyStart);
            if (nextOpenIdx !== -1 && nextOpenIdx < closeIdx) {
                pos = nextOpenIdx;
                continue;
            }
            const parsed = tryParseJsonObjectCandidate(bounded.slice(bodyStart, closeIdx));
            if (parsed) {
                return parsed;
            }
            pos = closeIdx + 3;
            continue;
        }
        pos = openIdx + 4;
    }
    return null;
}

function scanTagEnvelope(bounded: string, lower: string): RunawayJsonObject | null {
    let pos = 0;
    while (pos < lower.length) {
        const openIdx = lower.indexOf('<limits', pos);
        if (openIdx === -1) {
            return null;
        }
        let cursor = openIdx + 7;
        let closeTag = '</limits>';
        if (lower.startsWith('_json', cursor)) {
            cursor += 5;
            closeTag = '</limits_json>';
        }
        cursor = skipWhitespace(lower, cursor);
        if (lower[cursor] === '>') {
            const bodyStart = cursor + 1;
            const closeIdx = lower.indexOf(closeTag, bodyStart);
            if (closeIdx === -1) {
                return null;
            }
            const nextOpenIdx = lower.indexOf('<limits', bodyStart);
            if (nextOpenIdx !== -1 && nextOpenIdx < closeIdx) {
                pos = nextOpenIdx;
                continue;
            }
            const parsed = tryParseJsonObjectCandidate(bounded.slice(bodyStart, closeIdx));
            if (parsed) {
                return parsed;
            }
            pos = closeIdx + closeTag.length;
            continue;
        }
        pos = cursor > openIdx + 7 ? cursor : openIdx + 7;
    }
    return null;
}

function scanFencedEnvelope(bounded: string, lower: string): RunawayJsonObject | null {
    let pos = 0;
    while (pos < lower.length) {
        const openIdx = lower.indexOf('```', pos);
        if (openIdx === -1) {
            return null;
        }
        const afterTicks = openIdx + 3;
        let langLen = 0;
        if (lower.startsWith('limits', afterTicks)) {
            langLen = 6;
        } else if (lower.startsWith('json', afterTicks)) {
            langLen = 4;
        }
        if (langLen > 0) {
            const afterLang = skipWhitespace(lower, afterTicks + langLen);
            const closeIdx = lower.indexOf('```', afterLang);
            if (closeIdx === -1) {
                return null;
            }
            const parsed = tryParseJsonObjectCandidate(bounded.slice(afterLang, closeIdx));
            if (parsed) {
                return parsed;
            }
            pos = closeIdx + 3;
            continue;
        }
        pos = afterTicks;
    }
    return null;
}

function parseEnvelopeObject(text: string): RunawayJsonObject | null {
    const bounded = text.length > MAX_DIAGNOSTICS_ENVELOPE_SCAN_CHARS
        ? text.slice(0, MAX_DIAGNOSTICS_ENVELOPE_SCAN_CHARS)
        : text;
    const trimmed = bounded.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith('{')) {
        const direct = SafeJSONParse<RunawayJsonObject>(trimmed);
        if (IsPlainObject(direct)) {
            return direct;
        }
    }
    const lower = bounded.toLowerCase();
    return (
        scanCommentEnvelope(bounded, lower) ??
        scanTagEnvelope(bounded, lower) ??
        scanFencedEnvelope(bounded, lower)
    );
}

function extractLimitsFromFieldValue(raw: MJLimitsOverride | string | null | undefined): MJLimitsOverride {
    if (!raw) {
        return {};
    }
    if (typeof raw === 'string') {
        const envelope = parseEnvelopeObject(raw);
        if (!envelope) {
            return {};
        }
        const nested = Object.prototype.hasOwnProperty.call(envelope, 'limits')
            ? envelope['limits']
            : Object.prototype.hasOwnProperty.call(envelope, 'Limits')
                ? envelope['Limits']
                : envelope;
        return NormalizeLimitsInput(nested);
    }
    return NormalizeLimitsInput(raw);
}

function extractAgentEntityColumnLimits(agent: AgentLimitsMetadataInput): MJLimitsOverride {
    const out: MJLimitsOverride = {};
    const perRun: NonNullable<NonNullable<MJLimitsOverride['Budgets']>['PerRun']> = {};
    if (typeof agent.MaxCostPerRun === 'number' && Number.isFinite(agent.MaxCostPerRun) && agent.MaxCostPerRun >= 0) {
        perRun.MaxCostUsd = agent.MaxCostPerRun;
    }
    if (typeof agent.MaxTimePerRun === 'number' && Number.isFinite(agent.MaxTimePerRun) && agent.MaxTimePerRun > 0) {
        perRun.MaxWallClockMs = Math.trunc(agent.MaxTimePerRun * 1000);
    }
    if (typeof agent.MaxTokensPerRun === 'number' && Number.isFinite(agent.MaxTokensPerRun) && agent.MaxTokensPerRun > 0) {
        perRun.MaxTokens = Math.trunc(agent.MaxTokensPerRun);
    }
    if (Object.keys(perRun).length > 0) {
        out.Budgets = { PerRun: perRun };
    }
    return out;
}

function extractWorkflowMetadataLimits(workflow: WorkflowLimitsMetadataInput): MJLimitsOverride {
    const base: MJLimitsOverride = {};
    if (typeof workflow.MaxTasksPerAgentGraph === 'number' && workflow.MaxTasksPerAgentGraph >= 1) {
        base.MaxTasksPerAgentGraph = Math.trunc(workflow.MaxTasksPerAgentGraph);
    }
    if (typeof workflow.MaxTasksPerGraph === 'number' && workflow.MaxTasksPerGraph >= 1) {
        base.MaxTasksPerGraph = Math.trunc(workflow.MaxTasksPerGraph);
    }
    if (typeof workflow.WhileLoopMaxIterations === 'number' && workflow.WhileLoopMaxIterations >= 1) {
        base.WhileLoopMaxIterations = Math.trunc(workflow.WhileLoopMaxIterations);
    }
    if (typeof workflow.ForEachMaxIterations === 'number' && workflow.ForEachMaxIterations >= 1) {
        base.ForEachMaxIterations = Math.trunc(workflow.ForEachMaxIterations);
    }
    if (typeof workflow.MaxConsecutiveAgentTurns === 'number' && workflow.MaxConsecutiveAgentTurns >= 1) {
        base.AgentChannelConsecutiveTurns = Math.trunc(workflow.MaxConsecutiveAgentTurns);
    }
    if (typeof workflow.MaxHourlyWakes === 'number' && workflow.MaxHourlyWakes >= 1) {
        base.AgentChannelWakesPerHour = Math.trunc(workflow.MaxHourlyWakes);
    }
    return workflow.LimitsOverride ? mergeLimitsOverrides(base, workflow.LimitsOverride) : base;
}

/**
 * Extracts Tier 3 (`AgentOrWorkflowMetadata`) overrides from strongly-typed `MJAIAgentEntity`
 * columns (`MaxCostPerRun`, `MaxTimePerRun`, `MaxTokensPerRun`, `TypeConfiguration.limits`)
 * and optional workflow/channel metadata.
 */
export function ExtractAgentMetadataLimitsOverride(
    agent?: AgentLimitsMetadataInput | null,
    workflowMetadata?: WorkflowLimitsMetadataInput | null,
): MJLimitsOverride {
    let result: MJLimitsOverride = {};
    if (agent) {
        const typeCfgLimits = extractAgentTypeConfigLimits(agent.TypeConfiguration);
        const columnLimits = extractAgentEntityColumnLimits(agent);
        result = mergeLimitsOverrides(typeCfgLimits, columnLimits);
    }
    if (workflowMetadata) {
        result = mergeLimitsOverrides(result, extractWorkflowMetadataLimits(workflowMetadata));
    }
    return result;
}

/**
 * Extracts Tier 4 (`UserAgentPolicy`) overrides from a user's agent policy entity and optional
 * structured policy limits configuration. Inactive/disabled policies contribute no overrides.
 */
export function ExtractUserPolicyLimitsOverride(
    policy?: UserPolicyLimitsMetadataInput | null,
    explicitOverride?: MJLimitsOverride | null,
): MJLimitsOverride {
    if (policy && policy.Status !== 'Active') {
        return {};
    }
    let resolved: MJLimitsOverride = {};
    if (policy) {
        const candidates: Array<MJLimitsOverride | string | null | undefined> = [
            policy.Notes,
            policy.InstructionsOverride,
            policy.Configuration,
            policy.Settings,
            policy.LimitsConfiguration,
            policy.Limits,
            policy.LimitsOverride,
        ];
        for (const candidate of candidates) {
            const parsed = extractLimitsFromFieldValue(candidate);
            if (Object.keys(parsed).length > 0) {
                resolved = mergeLimitsOverrides(resolved, parsed);
            }
        }
    }
    if (explicitOverride) {
        resolved = mergeLimitsOverrides(resolved, NormalizeLimitsInput(explicitOverride));
    }
    return resolved;
}

/**
 * Extracts Tier 5 (`RunOverride`) overrides from `ExecuteAgentParams` and an optional explicit
 * override layer.
 */
export function ExtractRunOverrideLimits(
    params?: Pick<
        ExecuteAgentParams,
        'absoluteMaxIterations' | 'maxExecutionTimeMs' | 'maxTreeCost' | 'maxTreeTokens' | 'maxTreeDurationMs' | 'limitsOverride'
    > | null,
    explicitOverride?: MJLimitsOverride | null,
): MJLimitsOverride {
    let result: MJLimitsOverride = {};
    if (params) {
        const fromParams: MJLimitsOverride = {};
        if (typeof params.absoluteMaxIterations === 'number' && params.absoluteMaxIterations >= 1) {
            fromParams.AgentAbsoluteIterations = Math.trunc(params.absoluteMaxIterations);
        }
        const perRun: NonNullable<NonNullable<MJLimitsOverride['Budgets']>['PerRun']> = {};
        if (typeof params.maxTreeCost === 'number' && params.maxTreeCost >= 0) {
            perRun.MaxCostUsd = params.maxTreeCost;
        }
        const wallMs = params.maxExecutionTimeMs ?? params.maxTreeDurationMs;
        if (typeof wallMs === 'number' && wallMs >= 1) {
            perRun.MaxWallClockMs = Math.trunc(wallMs);
        }
        if (typeof params.maxTreeTokens === 'number' && params.maxTreeTokens >= 1) {
            perRun.MaxTokens = Math.trunc(params.maxTreeTokens);
        }
        if (Object.keys(perRun).length > 0) {
            fromParams.Budgets = { PerRun: perRun };
        }
        result = params.limitsOverride
            ? mergeLimitsOverrides(fromParams, NormalizeLimitsInput(params.limitsOverride))
            : fromParams;
    }
    if (explicitOverride) {
        result = mergeLimitsOverrides(result, NormalizeLimitsInput(explicitOverride));
    }
    return result;
}

function minOptionalNumber(a: number | undefined, b: number | undefined): number | undefined {
    if (a !== undefined && b !== undefined) {
        return Math.min(a, b);
    }
    return a !== undefined ? a : b;
}

/**
 * Merges a child `MJLimitsOverride` onto an ancestor ceiling `MJLimitsOverride` using
 * strictest-wins clamping on finite numeric upper bounds (iterations, costs, tokens, durations)
 * so derived instances can narrow limits further but never exceed an ancestor's ceiling.
 */
function clampLimitsOverrideToCeiling(
    ancestor: MJLimitsOverride,
    descendant: MJLimitsOverride
): MJLimitsOverride {
    const merged = mergeLimitsOverrides(ancestor, descendant);

    const clampScalar = (
        key:
            | 'AgentAbsoluteIterations'
            | 'MaxTasksPerAgentGraph'
            | 'MaxTasksPerGraph'
            | 'WhileLoopMaxIterations'
            | 'ForEachMaxIterations'
            | 'AgentChannelConsecutiveTurns'
            | 'AgentChannelWakesPerHour'
    ): void => {
        const clamped = minOptionalNumber(ancestor[key], descendant[key]);
        if (clamped !== undefined) {
            merged[key] = clamped;
        }
    };

    clampScalar('AgentAbsoluteIterations');
    clampScalar('MaxTasksPerAgentGraph');
    clampScalar('MaxTasksPerGraph');
    clampScalar('WhileLoopMaxIterations');
    clampScalar('ForEachMaxIterations');
    clampScalar('AgentChannelConsecutiveTurns');
    clampScalar('AgentChannelWakesPerHour');

    if (ancestor.Budgets?.PerRun || descendant.Budgets?.PerRun) {
        const aPerRun = ancestor.Budgets?.PerRun;
        const dPerRun = descendant.Budgets?.PerRun;
        const maxCostUsd = minOptionalNumber(aPerRun?.MaxCostUsd, dPerRun?.MaxCostUsd);
        const maxTokens = minOptionalNumber(aPerRun?.MaxTokens, dPerRun?.MaxTokens);
        const maxWallClockMs = minOptionalNumber(aPerRun?.MaxWallClockMs, dPerRun?.MaxWallClockMs);
        merged.Budgets = {
            ...(merged.Budgets ?? {}),
            PerRun: {
                ...(merged.Budgets?.PerRun ?? {}),
                ...(maxCostUsd !== undefined ? { MaxCostUsd: maxCostUsd } : {}),
                ...(maxTokens !== undefined ? { MaxTokens: maxTokens } : {}),
                ...(maxWallClockMs !== undefined ? { MaxWallClockMs: maxWallClockMs } : {}),
            },
        };
    }

    if (ancestor.Budgets?.PerRoutine || descendant.Budgets?.PerRoutine) {
        const aPerRoutine = ancestor.Budgets?.PerRoutine;
        const dPerRoutine = descendant.Budgets?.PerRoutine;
        const maxCostUsd = minOptionalNumber(aPerRoutine?.MaxCostUsd, dPerRoutine?.MaxCostUsd);
        const maxWallClockMs = minOptionalNumber(aPerRoutine?.MaxWallClockMs, dPerRoutine?.MaxWallClockMs);
        merged.Budgets = {
            ...(merged.Budgets ?? {}),
            PerRoutine: {
                ...(merged.Budgets?.PerRoutine ?? {}),
                ...(maxCostUsd !== undefined ? { MaxCostUsd: maxCostUsd } : {}),
                ...(maxWallClockMs !== undefined ? { MaxWallClockMs: maxWallClockMs } : {}),
            },
        };
    }

    if (ancestor.Budgets?.PerUserPerDay || descendant.Budgets?.PerUserPerDay) {
        const aPerDay = ancestor.Budgets?.PerUserPerDay;
        const dPerDay = descendant.Budgets?.PerUserPerDay;
        const maxCostUsd = minOptionalNumber(aPerDay?.MaxCostUsd, dPerDay?.MaxCostUsd);
        const maxWallClockMs = minOptionalNumber(aPerDay?.MaxWallClockMs, dPerDay?.MaxWallClockMs);
        merged.Budgets = {
            ...(merged.Budgets ?? {}),
            PerUserPerDay: {
                ...(merged.Budgets?.PerUserPerDay ?? {}),
                ...(maxCostUsd !== undefined ? { MaxCostUsd: maxCostUsd } : {}),
                ...(maxWallClockMs !== undefined ? { MaxWallClockMs: maxWallClockMs } : {}),
            },
        };
    }

    return merged;
}

/**
 * Resolves the 5-tier limits hierarchy for an agent or workflow execution context.
 */
export function ResolveAgentRunLimits(input: ResolveAgentRunLimitsInput): MJLimitsResolutionResult {
    let agentOrWorkflow: MJLimitsOverride = {};
    if (input.AncestorAgents && input.AncestorAgents.length > 0) {
        for (const ancestorAgent of input.AncestorAgents) {
            const ancestorOverride = ExtractAgentMetadataLimitsOverride(ancestorAgent, null);
            agentOrWorkflow = clampLimitsOverrideToCeiling(agentOrWorkflow, ancestorOverride);
        }
    }
    const leafAgentOverride = ExtractAgentMetadataLimitsOverride(input.Agent, input.WorkflowMetadata);
    agentOrWorkflow = clampLimitsOverrideToCeiling(agentOrWorkflow, leafAgentOverride);

    let userPolicy: MJLimitsOverride = {};
    if (input.AncestorUserPolicies && input.AncestorUserPolicies.length > 0) {
        for (const ancestorPolicy of input.AncestorUserPolicies) {
            const ancestorPolicyOverride = ExtractUserPolicyLimitsOverride(ancestorPolicy, null);
            userPolicy = clampLimitsOverrideToCeiling(userPolicy, ancestorPolicyOverride);
        }
    }
    const leafUserPolicyOverride = ExtractUserPolicyLimitsOverride(input.UserPolicy, input.UserPolicyLimitsOverride);
    userPolicy = clampLimitsOverrideToCeiling(userPolicy, leafUserPolicyOverride);
    const runOverride = ExtractRunOverrideLimits(input.RunParams, input.RunOverride);
    const hasActiveUserPolicyLimits = Object.keys(userPolicy).length > 0;
    const contextUser = input.ContextUser ?? input.Options?.ContextUser ?? null;
    const provider = input.Provider ?? input.Options?.Provider ?? null;
    const hasCallerContext = contextUser !== null;
    const effectiveOptions: LimitsResolveOptions = {
        ...input.Options,
        EnforceUserPolicyAsCeiling: input.Options?.EnforceUserPolicyAsCeiling ?? hasActiveUserPolicyLimits,
        EnforceConfiguredCeilings: input.Options?.EnforceConfiguredCeilings ?? hasCallerContext,
        AllowAuthorizedCeilingOverride: input.Options?.AllowAuthorizedCeilingOverride ?? hasCallerContext,
        ...(contextUser ? { ContextUser: contextUser } : {}),
        ...(provider ? { Provider: provider } : {}),
    };

    return LimitsConfigResolver.Instance.Resolve(
        {
            CodeFallback: input.CodeFallback ?? undefined,
            MjConfig: input.MjConfigLimits,
            AgentOrWorkflowMetadata: Object.keys(agentOrWorkflow).length > 0 ? agentOrWorkflow : undefined,
            UserAgentPolicy: hasActiveUserPolicyLimits ? userPolicy : undefined,
            RunOverride: Object.keys(runOverride).length > 0 ? runOverride : undefined,
        },
        effectiveOptions,
    );
}

/**
 * Builds a structured {@link LimitsDiagnosticsSnapshot} from a resolved limits result and run context.
 */
export function BuildLimitsDiagnosticsSnapshot(
    resolution: MJLimitsResolutionResult,
    context: LimitsDiagnosticsRunContext = {},
): LimitsDiagnosticsSnapshot {
    const cleanContext: LimitsDiagnosticsRunContext = {};
    if (context.AgentID) cleanContext.AgentID = context.AgentID;
    if (context.AgentName) cleanContext.AgentName = context.AgentName;
    if (context.AgentRunID) cleanContext.AgentRunID = context.AgentRunID;
    if (context.UserID) cleanContext.UserID = context.UserID;
    if (context.RoutineID) cleanContext.RoutineID = context.RoutineID;
    if (context.ChannelID) cleanContext.ChannelID = context.ChannelID;

    return {
        SchemaVersion: LIMITS_DIAGNOSTICS_SCHEMA_VERSION,
        CapturedAtISO: resolution.ResolvedAtISO,
        Context: cleanContext,
        ResolvedLimits: resolution.Limits,
        Provenance: resolution.Provenance,
        OverriddenKeys: [...resolution.OverriddenKeys],
        ClampedKeys: [...resolution.ClampedKeys],
    };
}

/**
 * Serializes a {@link LimitsDiagnosticsSnapshot} to deterministic JSON for run diagnostics persistence.
 */
export function SerializeLimitsDiagnosticsSnapshot(snapshot: LimitsDiagnosticsSnapshot): string {
    return JSON.stringify(snapshot);
}

function isLimitsSourceTier(value: RunawayJsonValue | undefined): value is LimitsSourceTier {
    return typeof value === 'string' && (LIMITS_TIER_PRECEDENCE as readonly string[]).includes(value);
}

function isLimitsScalarValue(value: RunawayJsonValue | undefined): value is LimitsScalarValue {
    return value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

function isLimitsKeyPath(value: RunawayJsonValue | undefined): value is LimitsKeyPath {
    return typeof value === 'string' && (LIMITS_KEY_PATHS as readonly string[]).includes(value);
}

function parseRunContext(raw: RunawayJsonValue | undefined): LimitsDiagnosticsRunContext {
    if (!isJsonObject(raw)) {
        return {};
    }
    const ctx: LimitsDiagnosticsRunContext = {};
    if (typeof raw['AgentID'] === 'string') ctx.AgentID = raw['AgentID'];
    if (typeof raw['AgentName'] === 'string') ctx.AgentName = raw['AgentName'];
    if (typeof raw['AgentRunID'] === 'string') ctx.AgentRunID = raw['AgentRunID'];
    if (typeof raw['UserID'] === 'string') ctx.UserID = raw['UserID'];
    if (typeof raw['RoutineID'] === 'string') ctx.RoutineID = raw['RoutineID'];
    if (typeof raw['ChannelID'] === 'string') ctx.ChannelID = raw['ChannelID'];
    return ctx;
}

function parseKeyProvenance(
    key: LimitsKeyPath,
    rawEntry: RunawayJsonValue | undefined,
    fallbackVal: LimitsScalarValue,
): LimitsKeyProvenance | null {
    if (!isJsonObject(rawEntry)) {
        return null;
    }
    const rawTier = rawEntry['SourceTier'];
    if (!isLimitsSourceTier(rawTier)) {
        return null;
    }
    const rawValue = rawEntry['Value'];
    const value = isLimitsScalarValue(rawValue) ? rawValue : fallbackVal;
    const tierValues: Partial<Record<LimitsSourceTier, LimitsScalarValue>> = {};
    const rawTierValues = rawEntry['TierValues'];
    if (isJsonObject(rawTierValues)) {
        for (const tier of LIMITS_TIER_PRECEDENCE) {
            const candidate = rawTierValues[tier];
            if (isLimitsScalarValue(candidate)) {
                tierValues[tier] = candidate;
            }
        }
    }
    return {
        Key: key,
        KeyRole: GetLimitsKeyRole(key),
        Value: value,
        SourceTier: rawTier,
        IsOverridden: rawEntry['IsOverridden'] === true,
        TierValues: tierValues,
        WasClampedByPolicyCeiling: rawEntry['WasClampedByPolicyCeiling'] === true,
    };
}

function parseProvenanceMap(
    rawProvenance: RunawayJsonObject,
    resolvedLimits: MJLimitsConfig,
): Record<LimitsKeyPath, LimitsKeyProvenance> | null {
    const fallbackResolution = LimitsConfigResolver.Instance.Resolve({
        CodeFallback: resolvedLimits,
        MjConfig: null,
    });
    const entries: Array<[LimitsKeyPath, LimitsKeyProvenance]> = [];
    for (const key of LIMITS_KEY_PATHS) {
        const parsed = parseKeyProvenance(key, rawProvenance[key], fallbackResolution.Provenance[key].Value);
        if (!parsed) {
            return null;
        }
        entries.push([key, parsed]);
    }
    return Object.fromEntries(entries) as Record<LimitsKeyPath, LimitsKeyProvenance>;
}

/**
 * Parses and validates a serialized {@link LimitsDiagnosticsSnapshot} JSON string.
 * Returns `null` for absent, malformed, or version-incompatible payloads.
 */
export function ParseLimitsDiagnosticsSnapshot(json: string | null | undefined): LimitsDiagnosticsSnapshot | null {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return null;
    }
    const parsed = SafeJSONParse<RunawayJsonValue>(json);
    if (!IsPlainObject(parsed)) {
        return null;
    }
    return ValidateAndHydrateLimitsDiagnosticsSnapshot(parsed);
}

/**
 * Validates and hydrates an already-parsed snapshot object (e.g. extracted from `AIAgentRun.Data`).
 */
export function ValidateAndHydrateLimitsDiagnosticsSnapshot(raw: RunawayJsonValue | undefined): LimitsDiagnosticsSnapshot | null {
    if (!isJsonObject(raw) || raw['SchemaVersion'] !== LIMITS_DIAGNOSTICS_SCHEMA_VERSION) {
        return null;
    }
    const rawResolved = raw['ResolvedLimits'];
    const rawProv = raw['Provenance'];
    if (typeof raw['CapturedAtISO'] !== 'string' || !isJsonObject(rawResolved) || !isJsonObject(rawProv)) {
        return null;
    }
    const normalizedLimits = NormalizeLimitsInput(rawResolved);
    const hydratedResolution = LimitsConfigResolver.Instance.Resolve({
        CodeFallback: { ...CODE_FALLBACK_LIMITS, ...normalizedLimits },
        MjConfig: null,
    });
    const validation = ValidateLimitsConfig(hydratedResolution.Limits);
    if (!validation.Valid) {
        return null;
    }
    const provenance = parseProvenanceMap(rawProv, hydratedResolution.Limits);
    if (!provenance) {
        return null;
    }
    const rawOverridden = raw['OverriddenKeys'];
    const overriddenKeys = Array.isArray(rawOverridden)
        ? rawOverridden.filter(isLimitsKeyPath)
        : [];
    const rawClamped = raw['ClampedKeys'];
    const clampedKeys = Array.isArray(rawClamped)
        ? rawClamped.filter(isLimitsKeyPath)
        : [];

    return {
        SchemaVersion: LIMITS_DIAGNOSTICS_SCHEMA_VERSION,
        CapturedAtISO: raw['CapturedAtISO'],
        Context: parseRunContext(raw['Context']),
        ResolvedLimits: hydratedResolution.Limits,
        Provenance: provenance,
        OverriddenKeys: overriddenKeys,
        ClampedKeys: clampedKeys,
    };
}

/**
 * Attaches a {@link LimitsDiagnosticsSnapshot} under {@link LIMITS_DIAGNOSTICS_DATA_KEY} inside an
 * `AIAgentRun.Data` JSON payload without clobbering existing caller data keys.
 */
export function AttachLimitsDiagnosticsToRunData(
    existingDataJson: string | null | undefined,
    snapshot: LimitsDiagnosticsSnapshot,
): string {
    let baseData: Record<string, LimitsDiagnosticsSnapshot | RunawayJsonValue> = {};
    if (typeof existingDataJson === 'string' && existingDataJson.trim().length > 0) {
        const parsed = SafeJSONParse<RunawayJsonObject>(existingDataJson);
        if (IsPlainObject(parsed)) {
            baseData = { ...parsed };
        }
    }
    baseData[LIMITS_DIAGNOSTICS_DATA_KEY] = snapshot;
    return JSON.stringify(baseData);
}

/**
 * Extracts a validated {@link LimitsDiagnosticsSnapshot} from an `AIAgentRun.Data` JSON string.
 */
export function ExtractLimitsDiagnosticsFromRunData(
    dataJson: string | null | undefined,
): LimitsDiagnosticsSnapshot | null {
    if (typeof dataJson !== 'string' || dataJson.trim().length === 0) {
        return null;
    }
    const parsed = SafeJSONParse<RunawayJsonObject>(dataJson);
    if (!isJsonObject(parsed)) {
        return null;
    }
    return ValidateAndHydrateLimitsDiagnosticsSnapshot(parsed[LIMITS_DIAGNOSTICS_DATA_KEY]);
}

/**
 * Records a {@link LimitsDiagnosticsSnapshot} onto an {@link MJAIAgentRunEntityExtended} instance,
 * updating both its strongly-typed in-memory accessor and its serialized `Data` JSON column.
 */
export function AttachLimitsDiagnosticsToAgentRun(
    agentRun: AgentRunLimitsDiagnosticsTarget,
    snapshot: LimitsDiagnosticsSnapshot,
): void {
    agentRun.LimitsDiagnosticsSnapshot = snapshot;
    agentRun.Data = AttachLimitsDiagnosticsToRunData(agentRun.Data, snapshot);
}

/**
 * Reads the {@link LimitsDiagnosticsSnapshot} attached to an {@link MJAIAgentRunEntityExtended}
 * instance, checking the typed property first and falling back to `agentRun.Data`.
 */
export function ExtractLimitsDiagnosticsFromAgentRun(
    agentRun: AgentRunLimitsDiagnosticsTarget,
): LimitsDiagnosticsSnapshot | null {
    if (agentRun.LimitsDiagnosticsSnapshot) {
        return agentRun.LimitsDiagnosticsSnapshot;
    }
    return ExtractLimitsDiagnosticsFromRunData(agentRun.Data);
}
