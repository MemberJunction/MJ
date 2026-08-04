/**
 * @fileoverview Pure helpers for the Duplicate Detection dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they can be
 * unit-tested in isolation. The component ({@link DuplicateDetectionResourceComponent}) supplies
 * a plain snapshot of its current state and these helpers shape it into the key-value
 * `AgentContext` object that flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`, plus the id/name resolution backing the surface's
 * client tools.
 *
 * 🔒 SAFETY: these helpers VALIDATE and SHAPE only — no mutation, no side effects. The component's
 * tool layer is what decides which operations are exposed (idempotent detection runs + refresh +
 * filter/select are safe; group approve/reject + merge are gated — see the component's
 * SAFETY BOUNDARY comment).
 */

/** Upper bound on how many names we publish in a name-list context field. Keeps the streamed note bounded. */
export const DUPE_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/** The three approval columns a duplicate group can occupy. */
export const DUPE_APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type DupeApprovalStatus = (typeof DUPE_APPROVAL_STATUSES)[number];

/** The two board display modes. */
export const DUPE_DISPLAY_MODES = ['kanban', 'table'] as const;
export type DupeDisplayMode = (typeof DUPE_DISPLAY_MODES)[number];

/**
 * Cap an array of names to {@link DUPE_AGENT_CONTEXT_NAME_LIST_CAP} entries.
 * Pure + deterministic; never mutates the input.
 */
export function capDupeNames(names: readonly string[]): string[] {
    return names.slice(0, DUPE_AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * A minimal entity-document descriptor the component supplies so the pure resolver can
 * match agent input against what the user sees in the picker. Mirrors the salient slice
 * of the component's `EntityDocumentOption`.
 */
export interface DupeEntityDocCandidate {
    ID: string;
    Name: string;
    EntityName: string;
}

/** Outcome of {@link resolveEntityDoc}: the matched candidate, or a tolerant error. */
export type DupeResolveResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied entity-document reference to one of the available documents.
 * Tries, in order (all case-insensitive, trimmed):
 *   1. exact ID
 *   2. exact document Name
 *   3. exact entity Name (the underlying entity the doc targets)
 *   4. partial (contains) match on document Name, then entity Name
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable in isolation.
 * Returns a tolerant "available documents" error on a miss (never throws).
 */
export function resolveEntityDoc<T extends DupeEntityDocCandidate>(
    input: string,
    candidates: readonly T[],
): DupeResolveResult<T> {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide an entity document ID, document name, or entity name.' };
    }

    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) return { ok: true, value: byId };

    const byDocName = candidates.find(c => c.Name.trim().toLowerCase() === needle);
    if (byDocName) return { ok: true, value: byDocName };

    const byEntity = candidates.find(c => c.EntityName.trim().toLowerCase() === needle);
    if (byEntity) return { ok: true, value: byEntity };

    const byPartial = candidates.find(
        c => c.Name.toLowerCase().includes(needle) || c.EntityName.toLowerCase().includes(needle),
    );
    if (byPartial) return { ok: true, value: byPartial };

    return { ok: false, error: buildDupeNotFoundError(input, candidates.map(c => c.Name)) };
}

/**
 * Build a tolerant "not found" error that lists a bounded sample of the available names,
 * so the agent can recover by picking a real one. Pure + deterministic.
 */
export function buildDupeNotFoundError(input: string, availableNames: readonly string[]): string {
    if (availableNames.length === 0) {
        return `No match for "${input}". There are no entity documents loaded.`;
    }
    const sample = capDupeNames(availableNames).join(', ');
    const more = availableNames.length > DUPE_AGENT_CONTEXT_NAME_LIST_CAP
        ? ` (+${availableNames.length - DUPE_AGENT_CONTEXT_NAME_LIST_CAP} more)`
        : '';
    return `No entity document matches "${input}". Available: ${sample}${more}.`;
}

/**
 * Type-guard for an entity-name filter against the loaded entity-name list. An empty string is
 * the valid "All entities" sentinel. Used to keep the FilterDuplicatesByEntity tool tolerant.
 * Pure + deterministic; comparison is case-insensitive/trimmed and returns the canonical
 * (registered-case) entity name on success.
 */
export function resolveEntityFilter(
    input: string,
    entityNames: readonly string[],
): DupeResolveResult<string> {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle || needle === 'all') {
        return { ok: true, value: '' }; // '' = no entity filter ("All")
    }
    const exact = entityNames.find(n => n.trim().toLowerCase() === needle);
    if (exact) return { ok: true, value: exact };
    const partial = entityNames.find(n => n.toLowerCase().includes(needle));
    if (partial) return { ok: true, value: partial };
    return { ok: false, error: buildDupeNotFoundError(input, entityNames) };
}

/**
 * The plain, component-supplied snapshot used to build the duplicate-detection agent context.
 * Mirrors the salient slice of {@link DuplicateDetectionResourceComponent} state.
 */
export interface DuplicateAgentContextInput {
    /** Whether a detection run is currently executing. */
    IsDetecting: boolean;
    /** Detection progress 0-100 (meaningful only while detecting). */
    DetectionProgress: number;
    /** Human-readable current detection stage (meaningful only while detecting). */
    DetectionStage: string;
    /** Total number of duplicate groups across all columns (unfiltered). */
    TotalGroupCount: number;
    /** Number of groups currently in the Pending column (after filters). */
    PendingCount: number;
    /** Number of groups currently in the Approved column (after filters). */
    ApprovedCount: number;
    /** Number of groups currently in the Rejected column (after filters). */
    RejectedCount: number;
    /** Currently selected entity document ID, or null. */
    SelectedEntityDocID: string | null;
    /** Resolved display name for the selected entity document, or null. */
    SelectedEntityDocName: string | null;
    /** Active board display mode. */
    DisplayMode: DupeDisplayMode;
    /** Active entity-name filter ('' = All). */
    EntityFilter: string;
    /** Minimum match-score filter (0 = no lower bound). */
    MinScore: number;
    /** Maximum match-score filter (1 = no upper bound). */
    MaxScore: number;
    /** From-date filter (YYYY-MM-DD or ''). */
    DateFrom: string;
    /** To-date filter (YYYY-MM-DD or ''). */
    DateTo: string;
    /** Whether any non-default filter is active. */
    HasActiveFilters: boolean;
    /** Distinct entity names present in the loaded groups (the FilterDuplicatesByEntity targets). */
    EntityNames: string[];
    /** Names of the entity documents available in the picker (the SelectEntityDocument targets). */
    EntityDocNames: string[];
    /** Whether record merging is enabled for the selected entity (informational — merge is still UI-gated). */
    MergeEnabled: boolean;
}

/**
 * Build the agent-visible context object for the Duplicate Detection board.
 *
 * Reports the live detection status + progress, the per-column group counts, the selected
 * entity document (id + resolved name), the active display mode + filters, and bounded name
 * lists (available entities + entity documents) so the co-agent can drive the safe filter /
 * select / refresh / run-detection tools.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable and decouples
 * it from change-detection timing.
 */
export function buildDuplicateAgentContext(input: DuplicateAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        DetectionStatus: input.IsDetecting ? 'running' : 'idle',
        DetectionProgress: input.DetectionProgress,
        TotalGroupCount: input.TotalGroupCount,
        PendingCount: input.PendingCount,
        ApprovedCount: input.ApprovedCount,
        RejectedCount: input.RejectedCount,
        SelectedEntityDocID: input.SelectedEntityDocID,
        SelectedEntityDocName: input.SelectedEntityDocName,
        DisplayMode: input.DisplayMode,
        EntityFilter: input.EntityFilter || 'All',
        HasActiveFilters: input.HasActiveFilters,
        MergeEnabled: input.MergeEnabled,
    };

    if (input.IsDetecting && input.DetectionStage) {
        context['DetectionStage'] = input.DetectionStage;
    }

    // Score/date filters — only surfaced when set, to keep the note compact.
    if (input.MinScore > 0) context['MinScore'] = input.MinScore;
    if (input.MaxScore > 0 && input.MaxScore < 1) context['MaxScore'] = input.MaxScore;
    if (input.DateFrom) context['DateFrom'] = input.DateFrom;
    if (input.DateTo) context['DateTo'] = input.DateTo;

    if (input.EntityNames.length > 0) {
        context['AvailableEntities'] = capDupeNames(input.EntityNames);
        if (input.EntityNames.length > DUPE_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['AvailableEntityCount'] = input.EntityNames.length;
        }
    }

    if (input.EntityDocNames.length > 0) {
        context['AvailableEntityDocuments'] = capDupeNames(input.EntityDocNames);
        if (input.EntityDocNames.length > DUPE_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['AvailableEntityDocumentCount'] = input.EntityDocNames.length;
        }
    }

    return context;
}
