/**
 * @fileoverview Pure, framework-agnostic helpers for the Lists dashboard's
 * AI-agent integration (Browse, Categories, Operations/Venn, My Lists).
 *
 * These functions are intentionally free of Angular / component dependencies
 * so they can be unit-tested in isolation (see {@link ./lists-agent-context.test.ts}).
 * Each component supplies a plain snapshot of its current state and these
 * helpers shape it into the key-value context object that flows to the async
 * chat agent and the realtime co-agent via `NavigationService.SetAgentContext`,
 * and resolve agent-supplied names/ids to concrete records for the client tools.
 *
 * 🔒 SAFETY: every function here is read-only and side-effect-free. They only
 * shape context and match strings — they never mutate, query, or render
 * anything. The destructive/append safety boundary is enforced by the
 * components, not here.
 *
 * The Venn region resolver lives separately in {@link ./components/lists-operations-region-resolver.ts}
 * (it predates this module); the Operations context builder below complements it.
 */

/**
 * Upper bound on how many names we publish in a name-list context field
 * (e.g. VisibleListNames, CategoryNames, OperandNames). Keeping the streamed
 * note bounded avoids flooding the co-agent with hundreds of names; when the
 * underlying list is larger the builder surfaces a companion total-count field.
 */
export const LISTS_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to at most {@link LISTS_AGENT_CONTEXT_NAME_LIST_CAP}
 * entries. Pure + deterministic; never mutates the input (returns a new array).
 *
 * @param names - the full list of names (caller owns de-duplication / ordering)
 * @returns the first N names, where N is the cap
 */
export function capListNames(names: readonly string[]): string[] {
    return names.slice(0, LISTS_AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * A minimal name-and-id descriptor, supplied by the component so the pure
 * resolver can match an agent-supplied reference against what the user sees.
 * Mirrors the salient slice of any list/category/entity row.
 */
export interface NamedRecord {
    ID: string;
    Name: string;
}

/**
 * Resolve an agent-supplied reference to one of the available records, the way
 * a user names things. The agent may pass an exact ID, an exact name, or a
 * partial name — so we try, in order:
 *   1. exact ID match (case-insensitive, to tolerate UUID-casing differences)
 *   2. exact name match (case-insensitive, whitespace-trimmed)
 *   3. first case-insensitive *contains* match on the name
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable
 * in isolation. Returns the matched record, or null on a miss.
 *
 * @param input - whatever the agent passed (an ID or a list/category name)
 * @param candidates - the records available on this surface
 */
export function resolveNamedRecord<T extends NamedRecord>(input: string, candidates: readonly T[]): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    // 1. exact ID match (case-insensitive — SQL Server upper- vs PG lower-case UUIDs).
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    // 2. exact name match.
    const byName = candidates.find(c => c.Name.trim().toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    // 3. first contains match on the name.
    const byContains = candidates.find(c => c.Name.toLowerCase().includes(needle));
    return byContains ?? null;
}

/**
 * Build a tolerant "not found" error message that lists a few of the available
 * names, so the agent can correct itself. Pure + deterministic.
 *
 * @param input - the agent-supplied reference that didn't resolve
 * @param candidates - the available records (their names are sampled)
 * @param noun - the kind of thing (e.g. "list", "category") for the message
 */
export function buildNotFoundError(input: string, candidates: readonly NamedRecord[], noun: string): string {
    const sample = candidates.slice(0, 6).map(c => c.Name).join(', ');
    return `No ${noun} matching "${input}" is available. Available ${noun}s include: ${sample || '(none)'}.`;
}

// ============================================================================
// BROWSE / MY-LISTS context
// ============================================================================

/** Component-supplied snapshot for the Browse / My-Lists list-browsing context. */
export interface ListBrowseAgentContextInput {
    /** Active search term applied to the visible lists. */
    SearchTerm: string;
    /** Active list-view mode (e.g. table/card/hierarchy or grid/list). */
    ViewMode: string;
    /** Total number of lists loaded on this surface (unfiltered). */
    AllListCount: number;
    /** Number of lists after the current filter/search is applied. */
    FilteredListCount: number;
    /** Names of the currently-visible (filtered) lists, in display order. */
    VisibleListNames: string[];
    /** Active sort field, or null when the surface has no sort control. */
    SelectedSort?: string | null;
    /** Active count of applied filters (drives the agent's awareness of narrowing). */
    ActiveFilterCount?: number | null;
    /** Active owner filter (e.g. "mine" | "all" | "others"), or null. */
    SelectedOwner?: string | null;
    /** Active entity filter (an entity name or "all"), or null. */
    SelectedEntity?: string | null;
    /** Whether the favorites-only filter is active, or null when unsupported. */
    ShowOnlyFavorites?: boolean | null;
}

/**
 * Build the agent context for a list-browsing surface (Browse / My Lists).
 * Bounds the visible-name list and surfaces a companion total when truncated,
 * and only includes the optional filter fields the surface actually supplies.
 */
export function buildListBrowseAgentContext(input: ListBrowseAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        SearchTerm: input.SearchTerm,
        ViewMode: input.ViewMode,
        AllListCount: input.AllListCount,
        FilteredListCount: input.FilteredListCount,
        VisibleListNames: capListNames(input.VisibleListNames),
    };
    if (input.VisibleListNames.length > LISTS_AGENT_CONTEXT_NAME_LIST_CAP) {
        context['VisibleListNameCount'] = input.VisibleListNames.length;
    }
    if (input.SelectedSort != null) {
        context['SelectedSort'] = input.SelectedSort;
    }
    if (input.ActiveFilterCount != null) {
        context['ActiveFilterCount'] = input.ActiveFilterCount;
    }
    if (input.SelectedOwner != null) {
        context['SelectedOwner'] = input.SelectedOwner;
    }
    if (input.SelectedEntity != null) {
        context['SelectedEntity'] = input.SelectedEntity;
    }
    if (input.ShowOnlyFavorites != null) {
        context['ShowOnlyFavorites'] = input.ShowOnlyFavorites;
    }
    return context;
}

// ============================================================================
// CATEGORIES context
// ============================================================================

/** A summary of one category node shown in the Categories tree. */
export interface CategoryNodeSummary {
    Name: string;
    /** Number of member lists directly under this category. */
    ListCount: number;
    /** Whether the node is currently expanded in the tree. */
    Expanded: boolean;
}

/** Component-supplied snapshot for the Categories context. */
export interface ListCategoriesAgentContextInput {
    /** ID of the selected category, or null. */
    SelectedCategoryId: string | null;
    /** Name of the selected category, or null. */
    SelectedCategoryName: string | null;
    /** Total number of categories loaded. */
    CategoryCount: number;
    /** Number of member lists under the selected category. */
    SelectedCategoryListCount: number;
    /** Names of the member lists under the selected category (bounded). */
    SelectedCategoryListNames: string[];
    /** The category tree as a flat, bounded list of node summaries. */
    CategoryNodes: CategoryNodeSummary[];
}

/**
 * Build the agent context for the Categories surface: the selection (id+name),
 * counts, the bounded member-list names of the selection, and a bounded view of
 * the category tree (names / list counts / expanded), plus the names of the
 * groups currently expanded.
 */
export function buildListCategoriesAgentContext(input: ListCategoriesAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        SelectedCategoryId: input.SelectedCategoryId,
        SelectedCategoryName: input.SelectedCategoryName,
        CategoryCount: input.CategoryCount,
        SelectedCategoryListCount: input.SelectedCategoryListCount,
    };
    if (input.SelectedCategoryListNames.length > 0) {
        context['SelectedCategoryListNames'] = capListNames(input.SelectedCategoryListNames);
        if (input.SelectedCategoryListNames.length > LISTS_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['SelectedCategoryListNameCount'] = input.SelectedCategoryListNames.length;
        }
    }
    if (input.CategoryNodes.length > 0) {
        context['CategoryNodes'] = input.CategoryNodes.slice(0, LISTS_AGENT_CONTEXT_NAME_LIST_CAP);
        context['ExpandedCategoryNames'] = input.CategoryNodes.filter(n => n.Expanded).map(n => n.Name);
        if (input.CategoryNodes.length > LISTS_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['CategoryNodeCount'] = input.CategoryNodes.length;
        }
    }
    return context;
}

// ============================================================================
// OPERATIONS (Venn) context
// ============================================================================

/** A summary of one operand (list or view) currently on the Venn canvas. */
export interface OperandSummary {
    /** The operand's display name. */
    Name: string;
    /** 'list' | 'view' — the operand source kind. */
    Kind: 'list' | 'view';
    /** The denormalized entity-type name of the operand. */
    EntityName: string;
}

/** A summary of one available Venn region the agent can select. */
export interface VennRegionSummary {
    Label: string;
    /** Number of records in the region. */
    Size: number;
}

/** Component-supplied snapshot for the Operations (Venn) context. */
export interface ListOperationsAgentContextInput {
    /** The operands currently on the canvas (lists + views). */
    Operands: OperandSummary[];
    /** Number of list operands. */
    ListOperandCount: number;
    /** Number of view operands. */
    ViewOperandCount: number;
    /** Total operand count (lists + views). */
    TotalOperandCount: number;
    /** Maximum operands the surface allows. */
    MaxOperands: number;
    /** Name of the entity all operands are locked to, or null. */
    LockedEntityName: string | null;
    /** The compose operation currently chosen (union/intersection/difference/…). */
    ComposeOp: string;
    /** Names of the entities available in the operand-filter dropdown (bounded). */
    AvailableEntityNames: string[];
    /** The Venn regions currently available to select (bounded). */
    AvailableRegions: VennRegionSummary[];
    /** Label of the selected Venn region, or null. */
    SelectedRegionLabel: string | null;
    /** Record count of the selected Venn region, or null. */
    SelectedRegionSize: number | null;
    /** Display values of a preview sample of the selected region's records (bounded). */
    PreviewRecordNames: string[];
    /** The last computed set operation + its result count, or null. */
    LastOperation: { operation: string; resultCount: number } | null;
}

/**
 * Build the agent context for the Operations (Venn) surface: the operands
 * (names / kind / entity), counts, the locked entity, the compose op, the
 * available entity-filter names, the available regions, the selected region +
 * a preview of its records, and the last computed operation. All name lists are
 * bounded with companion counts when truncated.
 */
export function buildListOperationsAgentContext(input: ListOperationsAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        ListOperandCount: input.ListOperandCount,
        ViewOperandCount: input.ViewOperandCount,
        TotalOperandCount: input.TotalOperandCount,
        MaxOperands: input.MaxOperands,
        LockedEntityName: input.LockedEntityName,
        ComposeOp: input.ComposeOp,
        SelectedRegionLabel: input.SelectedRegionLabel,
        SelectedRegionSize: input.SelectedRegionSize,
        LastOperation: input.LastOperation,
    };
    if (input.Operands.length > 0) {
        context['Operands'] = input.Operands.slice(0, LISTS_AGENT_CONTEXT_NAME_LIST_CAP);
    }
    if (input.AvailableEntityNames.length > 0) {
        context['AvailableEntityNames'] = capListNames(input.AvailableEntityNames);
        if (input.AvailableEntityNames.length > LISTS_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['AvailableEntityNameCount'] = input.AvailableEntityNames.length;
        }
    }
    if (input.AvailableRegions.length > 0) {
        context['AvailableRegions'] = input.AvailableRegions.slice(0, LISTS_AGENT_CONTEXT_NAME_LIST_CAP);
        if (input.AvailableRegions.length > LISTS_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['AvailableRegionCount'] = input.AvailableRegions.length;
        }
    }
    if (input.PreviewRecordNames.length > 0) {
        context['PreviewRecordNames'] = capListNames(input.PreviewRecordNames);
    }
    return context;
}
