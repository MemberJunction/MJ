/**
 * @fileoverview Pure helpers for the Autotagging / Classify Pipeline dashboard's AI-agent
 * integration.
 *
 * Framework-agnostic so they can be unit-tested in isolation. The component
 * ({@link AutotaggingPipelineResourceComponent}) supplies a plain snapshot of its current state
 * and these helpers shape it into the `AgentContext` object flowing to the async chat agent and
 * the realtime co-agent via `NavigationService.SetAgentContext`, plus the id/name resolution
 * backing the surface's client tools.
 *
 * 🔒 SAFETY: shape + resolve only, no mutation. The component's tool layer decides what's exposed
 * (idempotent refresh + tab-switch + filter/search/select/open are safe; RunPipeline /
 * pause/resume/cancel / confirm-dismiss-duplicate are gated — they have real side effects).
 */

/** Upper bound on how many names we publish in a name-list context field. */
export const AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/** The tabs the Classify dashboard supports (used by SwitchClassifyTab). */
export const AUTOTAG_TABS = [
    'pipeline', 'sources', 'types', 'tags', 'taxonomy', 'inbox', 'health', 'history',
] as const;
export type AutotagTab = (typeof AUTOTAG_TABS)[number];

/**
 * Cap an array of names to {@link AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP} entries.
 * Pure + deterministic; never mutates the input.
 */
export function capAutotagNames(names: readonly string[]): string[] {
    return names.slice(0, AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP);
}

/** Type-guard for a Classify tab string — keeps SwitchClassifyTab tolerant of arbitrary input. */
export function isValidAutotagTab(tab: unknown): tab is AutotagTab {
    return typeof tab === 'string' && (AUTOTAG_TABS as readonly string[]).includes(tab);
}

/**
 * A minimal id/name-bearing record descriptor the component supplies so the pure resolver can
 * match agent input (a content source, content item, etc.).
 */
export interface AutotagRecordCandidate {
    ID: string;
    Name: string;
}

/** Outcome of {@link resolveAutotagRecord}: the matched record, or a tolerant error. */
export type AutotagResolveResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied reference to one of the candidate records. Tries, in order
 * (all case-insensitive, trimmed):
 *   1. exact ID
 *   2. exact Name
 *   3. partial (contains) match on Name
 *
 * Pure + deterministic. Returns a tolerant "available names" error on a miss (never throws).
 */
export function resolveAutotagRecord<T extends AutotagRecordCandidate>(
    input: string,
    candidates: readonly T[],
): AutotagResolveResult<T> {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide a record ID or name.' };
    }
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) return { ok: true, value: byId };
    const byName = candidates.find(c => c.Name.trim().toLowerCase() === needle);
    if (byName) return { ok: true, value: byName };
    const byPartial = candidates.find(c => c.Name.toLowerCase().includes(needle));
    if (byPartial) return { ok: true, value: byPartial };
    return { ok: false, error: buildAutotagNotFoundError(input, candidates.map(c => c.Name)) };
}

/** Build a tolerant "not found" error listing a bounded sample of available names. */
export function buildAutotagNotFoundError(input: string, availableNames: readonly string[]): string {
    if (availableNames.length === 0) {
        return `No match for "${input}". No records are loaded.`;
    }
    const sample = capAutotagNames(availableNames).join(', ');
    const more = availableNames.length > AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP
        ? ` (+${availableNames.length - AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP} more)`
        : '';
    return `No record matches "${input}". Available: ${sample}${more}.`;
}

/**
 * The plain, component-supplied snapshot used to build the autotagging agent context.
 */
export interface AutotagAgentContextInput {
    /** Active Classify tab. */
    ActiveTab: AutotagTab;
    /** Number of content sources loaded. */
    SourceCount: number;
    /** Number of content items loaded (capped by page size in the grid). */
    ContentItemCount: number;
    /** True total content-item count from the DB (TotalRowCount). */
    TotalContentItemCount: number;
    /** Number of content-item tags loaded. */
    TagCount: number;
    /** True total tag count from the DB. */
    TotalContentTagCount: number;
    /** Number of content types loaded. */
    ContentTypeCount: number;
    /** Number of run-history rows loaded. */
    RunHistoryCount: number;
    /** Whether the pipeline is currently running. */
    IsRunning: boolean;
    /** Whether a running pipeline is paused. */
    IsPaused: boolean;
    /** Pipeline progress 0-100 (meaningful only while running). */
    PipelineProgress: number;
    /** Current pipeline stage label (meaningful only while running). */
    PipelineStage: string;
    /** Whether the pipeline-config widget is expanded. */
    ShowPipelineConfig: boolean;
    /** Pending tag-suggestion count (inbox badge). */
    InboxPendingCount: number;
    /** Pending health-signal count (health badge). */
    HealthPendingCount: number;
    /** Names of the content sources available (the Filter/Select/OpenSource targets). */
    SourceNames: string[];
    /** Names of the content types available. */
    ContentTypeNames: string[];
}

/**
 * Build the agent-visible context object for the Autotagging / Classify dashboard.
 *
 * Reports the active tab, the source/item/tag/type/run counts (with true DB totals), the live
 * pipeline status + progress + stage, the inbox/health pending badges, and bounded lists of
 * source + content-type names the safe filter/select/open tools can target. Pure function.
 */
export function buildAutotagAgentContext(input: AutotagAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        ActiveTab: input.ActiveTab,
        SourceCount: input.SourceCount,
        ContentItemCount: input.ContentItemCount,
        TotalContentItemCount: input.TotalContentItemCount,
        TagCount: input.TagCount,
        TotalContentTagCount: input.TotalContentTagCount,
        ContentTypeCount: input.ContentTypeCount,
        RunHistoryCount: input.RunHistoryCount,
        PipelineStatus: input.IsRunning ? (input.IsPaused ? 'paused' : 'running') : 'idle',
        PipelineProgress: input.PipelineProgress,
        ShowPipelineConfig: input.ShowPipelineConfig,
        InboxPendingCount: input.InboxPendingCount,
        HealthPendingCount: input.HealthPendingCount,
    };

    if (input.IsRunning && input.PipelineStage) {
        context['PipelineStage'] = input.PipelineStage;
    }

    if (input.SourceNames.length > 0) {
        context['AvailableSourceNames'] = capAutotagNames(input.SourceNames);
        if (input.SourceNames.length > AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['SourceNameCount'] = input.SourceNames.length;
        }
    }

    if (input.ContentTypeNames.length > 0) {
        context['AvailableContentTypeNames'] = capAutotagNames(input.ContentTypeNames);
        if (input.ContentTypeNames.length > AUTOTAG_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['ContentTypeNameCount'] = input.ContentTypeNames.length;
        }
    }

    return context;
}
