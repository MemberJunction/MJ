/**
 * @fileoverview Pure helpers for the Tags / Classify dashboard's AI-agent integration.
 *
 * Framework-agnostic so they can be unit-tested in isolation. The component
 * ({@link TagsResourceComponent}) supplies a plain snapshot of its current state and these
 * helpers shape it into the `AgentContext` object flowing to the async chat agent and the
 * realtime co-agent via `NavigationService.SetAgentContext`, plus the tag/taxonomy resolution
 * backing the surface's client tools.
 *
 * 🔒 SAFETY: shape + resolve only, no mutation. The component's tool layer decides what's exposed
 * (idempotent refresh + tab-switch + tag search/select + open-record are safe; create / edit /
 * delete / merge / move tag, promote-to-global, run-pipeline are gated — destructive taxonomy
 * mutations).
 */

/** Upper bound on how many names we publish in a name-list context field. */
export const TAGS_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/** The tabs the Tags dashboard supports (used by SwitchClassifyTab). */
export const TAGS_TABS = [
    'pipeline', 'sources', 'types', 'tags', 'taxonomy', 'history', 'suggestions', 'health',
] as const;
export type TagsTab = (typeof TAGS_TABS)[number];

/**
 * Cap an array of names to {@link TAGS_AGENT_CONTEXT_NAME_LIST_CAP} entries.
 * Pure + deterministic; never mutates the input.
 */
export function capTagNames(names: readonly string[]): string[] {
    return names.slice(0, TAGS_AGENT_CONTEXT_NAME_LIST_CAP);
}

/** Type-guard for a Tags tab string — keeps SwitchClassifyTab tolerant of arbitrary input. */
export function isValidTagsTab(tab: unknown): tab is TagsTab {
    return typeof tab === 'string' && (TAGS_TABS as readonly string[]).includes(tab);
}

/**
 * A minimal taxonomy-node descriptor the component supplies so the pure resolver can match
 * agent input against the taxonomy tree. Mirrors the salient slice of the component's
 * `TaxTreeNode` (ID + Name + DisplayName).
 */
export interface TaxNodeCandidate {
    ID: string;
    Name: string;
    DisplayName: string;
}

/** Outcome of {@link resolveTaxNode}: the matched node, or a tolerant error. */
export type TagsResolveResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied taxonomy reference to one of the tree nodes. Tries, in order
 * (all case-insensitive, trimmed):
 *   1. exact ID
 *   2. exact Name, then exact DisplayName
 *   3. partial (contains) match on Name, then DisplayName
 *
 * Pure + deterministic. Returns a tolerant "available tags" error on a miss (never throws).
 */
export function resolveTaxNode<T extends TaxNodeCandidate>(
    input: string,
    nodes: readonly T[],
): TagsResolveResult<T> {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide a tag ID or name.' };
    }
    const byId = nodes.find(n => n.ID.toLowerCase() === needle);
    if (byId) return { ok: true, value: byId };
    const byName = nodes.find(n => n.Name.trim().toLowerCase() === needle);
    if (byName) return { ok: true, value: byName };
    const byDisplay = nodes.find(n => (n.DisplayName ?? '').trim().toLowerCase() === needle);
    if (byDisplay) return { ok: true, value: byDisplay };
    const byPartial = nodes.find(
        n => n.Name.toLowerCase().includes(needle) || (n.DisplayName ?? '').toLowerCase().includes(needle),
    );
    if (byPartial) return { ok: true, value: byPartial };
    return { ok: false, error: buildTagsNotFoundError(input, nodes.map(n => n.DisplayName || n.Name)) };
}

/** Build a tolerant "not found" error listing a bounded sample of available tag names. */
export function buildTagsNotFoundError(input: string, availableNames: readonly string[]): string {
    if (availableNames.length === 0) {
        return `No match for "${input}". No tags are loaded.`;
    }
    const sample = capTagNames(availableNames).join(', ');
    const more = availableNames.length > TAGS_AGENT_CONTEXT_NAME_LIST_CAP
        ? ` (+${availableNames.length - TAGS_AGENT_CONTEXT_NAME_LIST_CAP} more)`
        : '';
    return `No tag matches "${input}". Available: ${sample}${more}.`;
}

/**
 * The plain, component-supplied snapshot used to build the tags agent context.
 */
export interface TagsAgentContextInput {
    /** Active dashboard tab. */
    ActiveTab: TagsTab;
    /** Number of content sources loaded. */
    SourceCount: number;
    /** Number of content items loaded. */
    ContentItemCount: number;
    /** Number of content-item tags loaded. */
    ContentTagCount: number;
    /** Number of distinct tags in the tag library. */
    TagLibraryCount: number;
    /** Number of tags shown after the current library search filter. */
    FilteredTagCount: number;
    /** The active tag-library search query. */
    TagSearchQuery: string;
    /** Number of nodes in the taxonomy tree. */
    TaxonomyNodeCount: number;
    /** Currently selected taxonomy node id, or null. */
    SelectedTaxNodeID: string | null;
    /** Resolved display name for the selected taxonomy node, or null. */
    SelectedTaxNodeName: string | null;
    /** Number of pending suggestions in the inbox. */
    SuggestionCount: number;
    /** Whether the pipeline is currently running. */
    IsRunning: boolean;
    /** Pipeline progress 0-100. */
    PipelineProgress: number;
    /** Whether the pipeline-config widget is expanded. */
    ShowPipelineConfig: boolean;
    /** Names of the top tags in the library (the SearchClassifyTags targets). */
    TagLibraryNames: string[];
    /** Names of the taxonomy nodes (the SelectTag / OpenTag targets). */
    TaxonomyNodeNames: string[];
}

/**
 * Build the agent-visible context object for the Tags / Classify dashboard.
 *
 * Reports the active tab, the source/item/tag counts, the tag-library search + filtered count,
 * the taxonomy node count + selected node (id + resolved name), the suggestion-inbox count, the
 * live pipeline status, and bounded lists of tag-library + taxonomy names the safe
 * search/select/open tools can target. Pure function.
 */
export function buildTagsAgentContext(input: TagsAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        ActiveTab: input.ActiveTab,
        SourceCount: input.SourceCount,
        ContentItemCount: input.ContentItemCount,
        ContentTagCount: input.ContentTagCount,
        TagLibraryCount: input.TagLibraryCount,
        FilteredTagCount: input.FilteredTagCount,
        TaxonomyNodeCount: input.TaxonomyNodeCount,
        SelectedTaxNodeID: input.SelectedTaxNodeID,
        SelectedTaxNodeName: input.SelectedTaxNodeName,
        SuggestionCount: input.SuggestionCount,
        PipelineStatus: input.IsRunning ? 'running' : 'idle',
        PipelineProgress: input.PipelineProgress,
        ShowPipelineConfig: input.ShowPipelineConfig,
    };

    if (input.TagSearchQuery) {
        context['TagSearchQuery'] = input.TagSearchQuery;
    }

    if (input.TagLibraryNames.length > 0) {
        context['TopTagNames'] = capTagNames(input.TagLibraryNames);
        if (input.TagLibraryNames.length > TAGS_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['TagLibraryNameCount'] = input.TagLibraryNames.length;
        }
    }

    if (input.TaxonomyNodeNames.length > 0) {
        context['TaxonomyNodeNames'] = capTagNames(input.TaxonomyNodeNames);
        if (input.TaxonomyNodeNames.length > TAGS_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['TaxonomyNodeNameCount'] = input.TaxonomyNodeNames.length;
        }
    }

    return context;
}
