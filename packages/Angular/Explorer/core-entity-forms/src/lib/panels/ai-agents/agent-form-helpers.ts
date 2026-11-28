import { UUIDsEqual, NormalizeUUID, FilterByUUIDs } from '@memberjunction/global';
import type {
    MJActionEntity,
    MJAIAgentActionEntity,
    MJAIAgentEntity,
    MJAIAgentPromptEntity,
    MJAIAgentRelationshipEntity,
    MJAIAgentTypeEntity,
} from '@memberjunction/core-entities';
import {
    ParseAgentConfiguration,
    type AgentHelperPluginEntry,
    type IAgentConfiguration,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { EffectiveAgentProperties } from '@memberjunction/ai-engine-base';

/** Section keys for the modern AI Agent form's first-class left-rail contributions. */
export const AGENT_SECTION_KEYS = {
    Overview: 'agentOverview',
    TypeStudio: 'agentTypeStudio',
    Prompts: 'agentPrompts',
    Capabilities: 'agentCapabilities',
    Knowledge: 'agentKnowledge',
    Guardrails: 'agentGuardrails',
    Runs: 'agentRuns',
    Governance: 'agentGovernance',
    Realtime: 'agentRealtime',
} as const;

/** Resolved metadata for an agent type's custom Studio panel (e.g. Flow Studio). */
export interface AgentStudioDescriptor {
    HasStudio: boolean;
    Title: string;
    Icon: string;
    ClassFactoryKey: string | null;
    TypeName: string | null;
}

/** Minimal agent type fields needed to resolve whether a type ships a Studio panel. */
export type AgentTypeStudioInput = Pick<MJAIAgentTypeEntity, 'Name' | 'UIFormSectionKey'> | null | undefined;

/**
 * Resolves the Studio panel descriptor from an agent type's `UIFormSectionKey`.
 * Keying on `UIFormSectionKey` (rather than hardcoding `'Flow'`) means any future
 * agent type that registers a `BaseFormSectionComponent` gets a Studio panel automatically.
 */
export function ResolveAgentStudioDescriptor(
    agentType: AgentTypeStudioInput,
    hasRecordId: boolean,
): AgentStudioDescriptor {
    const rawKey = agentType?.UIFormSectionKey?.trim() || null;
    const typeName = agentType?.Name?.trim() || null;
    if (!hasRecordId || !rawKey) {
        return {
            HasStudio: false,
            Title: 'Designer',
            Icon: 'fa-solid fa-puzzle-piece',
            ClassFactoryKey: null,
            TypeName: typeName,
        };
    }
    const isFlow = typeName?.toLowerCase() === 'flow';
    const classFactoryKey = rawKey.includes('.') ? rawKey : `AI Agents.${rawKey}`;
    return {
        HasStudio: true,
        Title: typeName ? `${typeName} Studio` : 'Agent Studio',
        Icon: isFlow ? 'fa-solid fa-diagram-project' : 'fa-solid fa-puzzle-piece',
        ClassFactoryKey: classFactoryKey,
        TypeName: typeName,
    };
}

/** Narrowed run row used for overview KPI telemetry and headroom meters. */
export interface AgentRunTelemetryRow {
    ID: string;
    Status: MJAIAgentRunEntityExtended['Status'];
    StartedAt: Date | string | null;
    CompletedAt: Date | string | null;
    TotalTokensUsed: number | null;
    TotalTokensUsedRollup: number | null;
    TotalCost: number | null;
    TotalCostRollup: number | null;
    __mj_CreatedAt?: Date | string | null;
}

/** Aggregated telemetry summary for the Overview Cockpit KPI strip & Guardrail headroom meters. */
export interface AgentTelemetrySummary {
    RunCount: number;
    CompletedCount: number;
    FailedCount: number;
    SuccessRatePct: number | null;
    AvgDurationMs: number | null;
    AvgCost: number | null;
    P95Tokens: number | null;
    CostHeadroomPct: number | null;
    TokenHeadroomPct: number | null;
}

/**
 * Computes overview KPIs and p95 guardrail headroom from recent runs.
 * Pure and safe with empty or partial rows.
 */
export function ComputeAgentTelemetry(
    runs: readonly AgentRunTelemetryRow[],
    limits: { MaxCostPerRun?: number | null; MaxTokensPerRun?: number | null } = {},
): AgentTelemetrySummary {
    if (runs.length === 0) {
        return {
            RunCount: 0,
            CompletedCount: 0,
            FailedCount: 0,
            SuccessRatePct: null,
            AvgDurationMs: null,
            AvgCost: null,
            P95Tokens: null,
            CostHeadroomPct: null,
            TokenHeadroomPct: null,
        };
    }

    let completed = 0;
    let failed = 0;
    const durations: number[] = [];
    const costs: number[] = [];
    const tokens: number[] = [];

    for (const r of runs) {
        if (r.Status === 'Completed') completed++;
        else if (r.Status === 'Failed') failed++;

        if (r.StartedAt && r.CompletedAt) {
            const diff = new Date(r.CompletedAt).getTime() - new Date(r.StartedAt).getTime();
            if (Number.isFinite(diff) && diff >= 0) durations.push(diff);
        }
        const cost = r.TotalCostRollup ?? r.TotalCost;
        if (typeof cost === 'number' && Number.isFinite(cost)) costs.push(cost);

        const tok = r.TotalTokensUsedRollup ?? r.TotalTokensUsed;
        if (typeof tok === 'number' && Number.isFinite(tok) && tok > 0) tokens.push(tok);
    }

    const finished = completed + failed;
    const successRatePct = finished > 0 ? Math.round((completed / finished) * 1000) / 10 : null;
    const avgDurationMs = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;
    const avgCost = costs.length > 0
        ? costs.reduce((a, b) => a + b, 0) / costs.length
        : null;

    tokens.sort((a, b) => a - b);
    const p95Tokens = tokens.length > 0
        ? tokens[Math.min(tokens.length - 1, Math.floor(tokens.length * 0.95))]
        : null;

    const maxCost = limits.MaxCostPerRun;
    const costHeadroomPct = avgCost != null && maxCost != null && maxCost > 0
        ? Math.min(100, Math.round((avgCost / maxCost) * 100))
        : null;

    const maxTokens = limits.MaxTokensPerRun;
    const tokenHeadroomPct = p95Tokens != null && maxTokens != null && maxTokens > 0
        ? Math.min(100, Math.round((p95Tokens / maxTokens) * 100))
        : null;

    return {
        RunCount: runs.length,
        CompletedCount: completed,
        FailedCount: failed,
        SuccessRatePct: successRatePct,
        AvgDurationMs: avgDurationMs,
        AvgCost: avgCost,
        P95Tokens: p95Tokens,
        CostHeadroomPct: costHeadroomPct,
        TokenHeadroomPct: tokenHeadroomPct,
    };
}

/** Narrowed run shape for result extraction (`FinalPayload` preferred over legacy `Result`). */
export interface RunResultSource {
    Status: MJAIAgentRunEntityExtended['Status'] | string | null;
    FinalPayload: MJAIAgentRunEntityExtended['FinalPayload'] | null;
    Result: MJAIAgentRunEntityExtended['Result'] | null;
}

/**
 * Returns true when a run has finished (not `Running`) and has a non-empty `FinalPayload` or legacy `Result`.
 * A running run can already hold a partial `FinalPayload`, so we hide its result until it settles.
 */
export function HasRunResult(run: RunResultSource | null | undefined): boolean {
    if (!run || run.Status === 'Running') return false;
    return Boolean(run.FinalPayload || run.Result);
}

/**
 * Formats a run's result payload, preferring `FinalPayload` and falling back to legacy `Result`.
 * Pretty-prints valid JSON; returns `'No result'` when absent.
 */
export function GetRunResultPreview(run: RunResultSource | null | undefined, truncate = false): string {
    const raw = run?.FinalPayload || run?.Result;
    if (!raw) return 'No result';
    let formatted = raw;
    try {
        const parsed: unknown = JSON.parse(raw);
        formatted = JSON.stringify(parsed, null, 2);
    } catch {
        // Not valid JSON — keep raw string
    }
    if (truncate && formatted.length > 300) {
        return formatted.substring(0, 300) + '...';
    }
    return formatted;
}

/** Formats milliseconds into a compact human-readable duration (e.g. `420ms`, `1.9s`, `2m 14s`). */
export function FormatDurationMs(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return `${mins}m ${secs}s`;
}

/** Formats duration between two timestamps. */
export function FormatDurationBetween(
    startedAt: Date | string | null | undefined,
    completedAt: Date | string | null | undefined,
): string {
    if (!startedAt || !completedAt) return '—';
    const diff = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    return FormatDurationMs(diff);
}

/** Formats token counts compactly (`850`, `12.4K`, `1.2M`). */
export function FormatTokenCount(tokens: number | null | undefined): string {
    if (tokens == null || !Number.isFinite(tokens)) return '0';
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return tokens.toLocaleString();
}

/** Formats USD cost cleanly with adaptive precision (`$0.0042`, `$0.08`, `$1.50`). */
export function FormatCostUsd(cost: number | null | undefined): string {
    if (cost == null || !Number.isFinite(cost)) return '$0.00';
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
}

/**
 * Resolves the prompts and actions linked to a specific agent from cached engine arrays.
 * Preserves engine order, matches UUIDs case-insensitively, and ignores other agents' links.
 */
export function ResolveLinkedPromptsAndActions(
    agentId: string | null | undefined,
    allPrompts: readonly MJAIPromptEntityExtended[],
    allAgentPrompts: readonly Pick<MJAIAgentPromptEntity, 'AgentID' | 'PromptID'>[],
    allActions: readonly MJActionEntity[],
    allAgentActions: readonly Pick<MJAIAgentActionEntity, 'AgentID' | 'ActionID'>[],
): { Prompts: MJAIPromptEntityExtended[]; Actions: MJActionEntity[] } {
    if (!agentId) return { Prompts: [], Actions: [] };

    const promptIds = new Set(
        allAgentPrompts
            .filter((ap) => UUIDsEqual(ap.AgentID, agentId))
            .map((ap) => NormalizeUUID(ap.PromptID)),
    );
    const actionIds = new Set(
        allAgentActions
            .filter((aa) => UUIDsEqual(aa.AgentID, agentId))
            .map((aa) => NormalizeUUID(aa.ActionID)),
    );

    return {
        Prompts: FilterByUUIDs(allPrompts, promptIds, (p) => p.ID),
        Actions: FilterByUUIDs(allActions, actionIds, (a) => a.ID),
    };
}

/** Unified sub-agent item combining direct children (`ParentID`) and relationship-linked sub-agents. */
export interface UnifiedSubAgentItem {
    Agent: MJAIAgentEntityExtended;
    LinkType: 'child' | 'related';
    Relationship?: MJAIAgentRelationshipEntity;
}

/**
 * Combines direct child agents (`ParentID === agentId`) and relationship-linked sub-agents
 * (`MJAIAgentRelationshipEntity` where `AgentID === agentId`) into a single deduplicated list.
 */
export function BuildUnifiedSubAgents(
    agentId: string | null | undefined,
    allAgents: readonly MJAIAgentEntityExtended[],
    relationships: readonly MJAIAgentRelationshipEntity[],
): UnifiedSubAgentItem[] {
    if (!agentId) return [];

    const result: UnifiedSubAgentItem[] = [];
    const seenIds = new Set<string>();

    for (const candidate of allAgents) {
        if (UUIDsEqual(candidate.ParentID, agentId)) {
            result.push({ Agent: candidate, LinkType: 'child' });
            seenIds.add(NormalizeUUID(candidate.ID));
        }
    }

    const agentById = new Map<string, MJAIAgentEntityExtended>(
        allAgents.map((a) => [NormalizeUUID(a.ID), a]),
    );

    for (const rel of relationships) {
        if (!UUIDsEqual(rel.AgentID, agentId)) continue;
        const normSubId = NormalizeUUID(rel.SubAgentID);
        if (seenIds.has(normSubId)) continue;
        const subAgent = agentById.get(normSubId);
        if (subAgent) {
            result.push({ Agent: subAgent, LinkType: 'related', Relationship: rel });
            seenIds.add(normSubId);
        }
    }

    return result;
}

/** Narrowed Flow step row for the Overview Cockpit architecture preview card. */
export interface FlowStepPreviewRow {
    ID: string;
    Name: string;
    StepType: string;
    StartingStep: boolean;
    Status?: string | null;
}

/**
 * Orders Flow agent steps for the Overview architecture preview:
 * starting step(s) first, then remaining active steps alphabetically, capped to `maxSteps`.
 */
export function OrderFlowStepsForPreview(
    steps: readonly FlowStepPreviewRow[],
    maxSteps = 6,
): FlowStepPreviewRow[] {
    return [...steps]
        .filter((s) => !s.Status || s.Status === 'Active')
        .sort((a, b) => {
            if (a.StartingStep !== b.StartingStep) return a.StartingStep ? -1 : 1;
            return (a.Name || '').localeCompare(b.Name || '');
        })
        .slice(0, maxSteps);
}

/** Maps a Flow step type to its semantic Font Awesome icon. */
export function FlowStepTypeIcon(stepType: string | null | undefined, isStart = false): string {
    if (isStart) return 'fa-solid fa-play';
    switch ((stepType ?? '').toLowerCase()) {
        case 'prompt': return 'fa-solid fa-comment-dots';
        case 'action': return 'fa-solid fa-bolt';
        case 'sub-agent':
        case 'subagent': return 'fa-solid fa-sitemap';
        case 'foreach':
        case 'while': return 'fa-solid fa-repeat';
        case 'custom': return 'fa-solid fa-puzzle-piece';
        default: return 'fa-solid fa-circle-nodes';
    }
}

/**
 * Reads the parsed `IAgentConfiguration` JSON bag from an agent record, returning `{}`
 * when `Configuration` is null, empty, or not yet configured.
 */
export function ReadAgentConfig(
    record: Pick<MJAIAgentEntity, 'Configuration'> | null | undefined,
): IAgentConfiguration {
    return ParseAgentConfiguration(record?.Configuration) ?? {};
}

/**
 * Mutates an agent's canonical `Configuration` JSON (`IAgentConfiguration`) cleanly and writes
 * the serialized result back to `record.Configuration` so `MJAIAgentEntityServer.Save()`
 * persists it and bidirectionally syncs legacy v6.x columns automatically.
 */
export function PatchAgentConfig(
    record: Pick<MJAIAgentEntity, 'Configuration'>,
    mutator: (draft: IAgentConfiguration) => void,
): IAgentConfiguration {
    const current = ReadAgentConfig(record);
    const draft = JSON.parse(JSON.stringify(current)) as IAgentConfiguration;
    mutator(draft);

    // Strip empty section objects so the serialized Configuration JSON stays compact and clean
    for (const key of Object.keys(draft) as Array<keyof IAgentConfiguration>) {
        const val = draft[key];
        if (val !== null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) {
            delete draft[key];
        }
    }

    record.Configuration = Object.keys(draft).length > 0 ? JSON.stringify(draft, null, 2) : null;
    return draft;
}

/** Formats a string array (`Configuration.payload.*Paths`) into a comma-separated editable string. */
export function FormatStringList(items: readonly string[] | null | undefined): string {
    if (!items || items.length === 0) return '';
    return items.join(', ');
}

/** Parses a comma- or newline-delimited string into a trimmed `string[]` (or `null` when empty). */
export function ParseStringList(raw: string | null | undefined): string[] | null {
    if (!raw) return null;
    const parts = raw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : null;
}

/** Effective operational configuration values resolved across local edits, 3-table cascade, and legacy fallback. */
export interface EffectiveAgentDisplayValues {
    ModelSelectionMode: MJAIAgentEntity['ModelSelectionMode'];
    SupportsPlanMode: boolean;
    RequirePlanMode: boolean;
    DeclareActionsAsNativeTools: boolean;
    ExecutionMode: MJAIAgentEntity['ExecutionMode'];
    AllowMemoryWrite: boolean;
    SearchScopeAccess: MJAIAgentEntity['SearchScopeAccess'];
    SkillActivationMode: MJAIAgentEntity['SkillActivationMode'];
    AllowEphemeralClientTools: boolean;
    AcceptUnregisteredFiles: boolean;
    ChatHandlingOption: MJAIAgentEntity['ChatHandlingOption'];
    MessageMode: MJAIAgentEntity['MessageMode'];
    MaxMessages: number | null;
    RecordingDefault: MJAIAgentEntity['RecordingDefault'];
    ArtifactCreationMode: MJAIAgentEntity['ArtifactCreationMode'];
    ContextWindowMaxTokens: number | null;
    CompactionTriggerPercent: number | null;
    CompactionTargetPercent: number | null;
    DefaultPromptEffortLevel: number | null;
    MinExecutionsPerRun: number | null;
    MaxExecutionsPerRun: number | null;
    MaxSubAgentConsultRounds: number | null;
    InjectNotes: boolean;
    MaxNotesToInject: number | null;
    NoteInjectionStrategy: MJAIAgentEntity['NoteInjectionStrategy'];
    InjectExamples: boolean;
    MaxExamplesToInject: number | null;
    ExampleInjectionStrategy: MJAIAgentEntity['ExampleInjectionStrategy'];
    HelperPlugins: AgentHelperPluginEntry[];
}

/**
 * Resolves effective display values for an AI Agent across:
 * 1. Explicit unsaved/saved values in `record.Configuration` (`IAgentConfiguration`),
 * 2. The 3-table cascade (`AIEngineBase.ResolveEffectiveAgentProperties`: AgentType → Categories → BaseAgent → Agent),
 * 3. Legacy flat columns on `record` as final fallback for partial/unmigrated rows.
 */
export function ResolveEffectiveDisplayValues(
    record: Partial<MJAIAgentEntity> | null | undefined,
    effective: EffectiveAgentProperties | null | undefined,
): EffectiveAgentDisplayValues {
    const cfg = record?.Configuration ? ReadAgentConfig({ Configuration: record.Configuration }) : {};
    return {
        ModelSelectionMode:
            cfg.execution?.modelSelectionMode ?? effective?.ModelSelectionMode ?? record?.ModelSelectionMode ?? 'Agent Type',
        SupportsPlanMode:
            cfg.execution?.supportsPlanMode ?? effective?.SupportsPlanMode ?? record?.SupportsPlanMode ?? true,
        RequirePlanMode:
            cfg.execution?.requirePlanMode ?? effective?.RequirePlanMode ?? record?.RequirePlanMode ?? false,
        DeclareActionsAsNativeTools:
            cfg.execution?.declareActionsAsNativeTools ?? effective?.DeclareActionsAsNativeTools ?? record?.DeclareActionsAsNativeTools ?? true,
        ExecutionMode:
            cfg.subAgentExecution?.mode ?? effective?.ExecutionMode ?? record?.ExecutionMode ?? 'Sequential',
        AllowMemoryWrite:
            cfg.memory?.allowMemoryWrite ?? effective?.AllowMemoryWrite ?? record?.AllowMemoryWrite ?? true,
        SearchScopeAccess:
            cfg.scope?.searchScopeAccess ?? effective?.SearchScopeAccess ?? record?.SearchScopeAccess ?? 'All',
        SkillActivationMode:
            cfg.skills?.activationMode ?? effective?.SkillActivationMode ?? record?.SkillActivationMode ?? 'Auto',
        AllowEphemeralClientTools:
            cfg.clientTools?.allowEphemeral ?? effective?.AllowEphemeralClientTools ?? record?.AllowEphemeralClientTools ?? true,
        AcceptUnregisteredFiles:
            cfg.attachments?.acceptUnregisteredFiles ?? effective?.AcceptUnregisteredFiles ?? record?.AcceptUnregisteredFiles ?? false,
        ChatHandlingOption:
            cfg.execution?.chatHandlingOption ?? effective?.ChatHandlingOption ?? record?.ChatHandlingOption ?? null,
        MessageMode:
            cfg.attachments?.messageMode ?? effective?.MessageMode ?? record?.MessageMode ?? 'None',
        MaxMessages:
            cfg.attachments?.maxMessages ?? effective?.MaxMessages ?? record?.MaxMessages ?? null,
        RecordingDefault:
            cfg.recording?.defaultMode ?? effective?.RecordingDefault ?? record?.RecordingDefault ?? null,
        ArtifactCreationMode:
            cfg.artifacts?.creationMode ?? effective?.ArtifactCreationMode ?? record?.ArtifactCreationMode ?? 'Always',
        ContextWindowMaxTokens:
            cfg.contextWindow?.maxTokens ?? effective?.ContextWindowMaxTokens ?? record?.ContextWindowMaxTokens ?? null,
        CompactionTriggerPercent:
            cfg.contextWindow?.compactionTriggerPercent ?? effective?.CompactionTriggerPercent ?? record?.CompactionTriggerPercent ?? null,
        CompactionTargetPercent:
            cfg.contextWindow?.compactionTargetPercent ?? effective?.CompactionTargetPercent ?? record?.CompactionTargetPercent ?? null,
        DefaultPromptEffortLevel:
            cfg.execution?.defaultPromptEffortLevel ?? effective?.DefaultPromptEffortLevel ?? record?.DefaultPromptEffortLevel ?? null,
        MinExecutionsPerRun:
            cfg.subAgentExecution?.minExecutionsPerRun ?? effective?.MinExecutionsPerRun ?? record?.MinExecutionsPerRun ?? null,
        MaxExecutionsPerRun:
            cfg.subAgentExecution?.maxExecutionsPerRun ?? effective?.MaxExecutionsPerRun ?? record?.MaxExecutionsPerRun ?? null,
        MaxSubAgentConsultRounds:
            cfg.subAgentExecution?.maxConsultRounds ?? effective?.MaxSubAgentConsultRounds ?? record?.MaxSubAgentConsultRounds ?? null,
        InjectNotes:
            cfg.memory?.injectNotes ?? effective?.InjectNotes ?? record?.InjectNotes ?? true,
        MaxNotesToInject:
            cfg.memory?.maxNotesToInject ?? effective?.MaxNotesToInject ?? record?.MaxNotesToInject ?? null,
        NoteInjectionStrategy:
            cfg.memory?.noteInjectionStrategy ?? effective?.NoteInjectionStrategy ?? record?.NoteInjectionStrategy ?? 'Relevant',
        InjectExamples:
            cfg.memory?.injectExamples ?? effective?.InjectExamples ?? record?.InjectExamples ?? false,
        MaxExamplesToInject:
            cfg.memory?.maxExamplesToInject ?? effective?.MaxExamplesToInject ?? record?.MaxExamplesToInject ?? null,
        ExampleInjectionStrategy:
            cfg.memory?.exampleInjectionStrategy ?? effective?.ExampleInjectionStrategy ?? record?.ExampleInjectionStrategy ?? 'Semantic',
        HelperPlugins: effective?.HelperPlugins ?? cfg.helperPlugins ?? [],
    };
}

/** Maps an Agent Type name to a clean default Font Awesome icon when the agent has no custom IconClass. */
export function DefaultAgentIcon(iconClass: string | null | undefined, typeName: string | null | undefined): string {
    if (iconClass?.trim()) return iconClass.trim();
    switch ((typeName ?? '').toLowerCase()) {
        case 'flow': return 'fa-solid fa-diagram-project';
        case 'realtime': return 'fa-solid fa-tower-broadcast';
        case 'harness': return 'fa-solid fa-terminal';
        default: return 'fa-solid fa-robot';
    }
}

/** Latest run step row shown in the Flow Studio's optional "Overlay Latest Run" trace ribbon. */
export interface LatestRunStepOverlay {
    ID: string;
    StepName: string;
    StepType: string;
    Status: string;
    StartedAt: Date | string | null;
    CompletedAt: Date | string | null;
    ErrorMessage: string | null;
}
