/**
 * @fileoverview Pure helpers for the Vector Management dashboard's AI-agent integration.
 *
 * Framework-agnostic so they can be unit-tested in isolation. The component
 * ({@link VectorManagementResourceComponent}) supplies a plain snapshot of its current state and
 * these helpers shape it into the `AgentContext` object flowing to the async chat agent and the
 * realtime co-agent via `NavigationService.SetAgentContext`, plus the entity-name resolution
 * backing the surface's client tools.
 *
 * 🔒 SAFETY: shape + resolve only, no mutation. The component's tool layer decides what's exposed
 * (idempotent refresh + sync-for-entity + filter/select are safe; delete entity doc / delete
 * vectors / schedule-mutation are gated — see the component's SAFETY BOUNDARY comment).
 */

/** Upper bound on how many names we publish in a name-list context field. */
export const VECTOR_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/** Per-entity sync status values surfaced in the breakdown. */
export type VectorSyncStatus = 'Synced' | 'Syncing' | 'Error' | 'Pending';

/**
 * Cap an array of names to {@link VECTOR_AGENT_CONTEXT_NAME_LIST_CAP} entries.
 * Pure + deterministic; never mutates the input.
 */
export function capVectorNames(names: readonly string[]): string[] {
    return names.slice(0, VECTOR_AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * A minimal per-entity sync-row descriptor the component supplies so the pure resolver can
 * match agent input against what the user sees. Mirrors the salient slice of the component's
 * `EntitySyncRow`.
 */
export interface VectorSyncRowCandidate {
    EntityDocumentID: string;
    EntityName: string;
    DocumentName: string;
    VectorCount: number;
    Status: VectorSyncStatus;
}

/** Outcome of {@link resolveSyncRow}: the matched row, or a tolerant error. */
export type VectorResolveResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied entity reference to one of the vector sync rows. Tries, in order
 * (all case-insensitive, trimmed):
 *   1. exact EntityDocumentID
 *   2. exact entity Name
 *   3. exact document Name
 *   4. partial (contains) match on entity Name, then document Name
 *
 * Pure + deterministic over the supplied row list. Returns a tolerant "available entities"
 * error on a miss (never throws).
 */
export function resolveSyncRow<T extends VectorSyncRowCandidate>(
    input: string,
    rows: readonly T[],
): VectorResolveResult<T> {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide an entity name or entity document ID.' };
    }

    const byId = rows.find(r => r.EntityDocumentID.toLowerCase() === needle);
    if (byId) return { ok: true, value: byId };

    const byEntity = rows.find(r => r.EntityName.trim().toLowerCase() === needle);
    if (byEntity) return { ok: true, value: byEntity };

    const byDoc = rows.find(r => r.DocumentName.trim().toLowerCase() === needle);
    if (byDoc) return { ok: true, value: byDoc };

    const byPartial = rows.find(
        r => r.EntityName.toLowerCase().includes(needle) || r.DocumentName.toLowerCase().includes(needle),
    );
    if (byPartial) return { ok: true, value: byPartial };

    return { ok: false, error: buildVectorNotFoundError(input, rows.map(r => r.EntityName)) };
}

/**
 * Build a tolerant "not found" error listing a bounded sample of available entity names.
 * Pure + deterministic.
 */
export function buildVectorNotFoundError(input: string, availableNames: readonly string[]): string {
    if (availableNames.length === 0) {
        return `No match for "${input}". No vector entity documents are configured.`;
    }
    const sample = capVectorNames(availableNames).join(', ');
    const more = availableNames.length > VECTOR_AGENT_CONTEXT_NAME_LIST_CAP
        ? ` (+${availableNames.length - VECTOR_AGENT_CONTEXT_NAME_LIST_CAP} more)`
        : '';
    return `No vector entity document matches "${input}". Available: ${sample}${more}.`;
}

/**
 * A per-entity breakdown row published in the agent context. Mirrors the salient, non-sensitive
 * slice of the component's `EntitySyncRow` (no template content, no DB credentials).
 */
export interface VectorEntityBreakdown {
    EntityName: string;
    DocumentName: string;
    VectorCount: number;
    Status: VectorSyncStatus;
}

/**
 * The plain, component-supplied snapshot used to build the vector-management agent context.
 */
export interface VectorAgentContextInput {
    /** Total vector count across all entities. */
    TotalVectors: number;
    /** Number of configured vector entity documents. */
    EntityDocumentCount: number;
    /** Number of entities currently syncing. */
    SyncingCount: number;
    /** Name of the configured vector database. */
    VectorDBName: string;
    /** Vector DB health indicator. */
    VectorDBStatus: 'Healthy' | 'Degraded' | 'Offline';
    /** Current embedding model display name. */
    EmbeddingModelName: string;
    /** Whether the configuration prerequisites (vector DB + embedding model) are met. */
    PrerequisitesMet: boolean;
    /** Active view mode ('index' vs 'operations'). */
    ViewMode: 'index' | 'operations';
    /** Entity-picker search text (only meaningful when the suggestion dialog is open). */
    EntitySearchText: string;
    /** The full per-entity breakdown (this helper bounds it). */
    Entities: VectorEntityBreakdown[];
}

/**
 * Build the agent-visible context object for the Vector Management dashboard.
 *
 * Reports the total vectors, entity-document + syncing counts, vector-DB health + embedding
 * model, prerequisite + view state, a bounded per-entity breakdown (entity · vector count ·
 * status), and the list of entity names the SyncVectorsForEntity / SelectVectorEntity tools
 * can target. Pure function (no `this`) for unit-testability.
 */
export function buildVectorAgentContext(input: VectorAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        TotalVectors: input.TotalVectors,
        EntityDocumentCount: input.EntityDocumentCount,
        SyncingCount: input.SyncingCount,
        VectorDBName: input.VectorDBName,
        VectorDBStatus: input.VectorDBStatus,
        EmbeddingModel: input.EmbeddingModelName,
        PrerequisitesMet: input.PrerequisitesMet,
        ViewMode: input.ViewMode,
    };

    if (input.EntitySearchText) {
        context['EntitySearchText'] = input.EntitySearchText;
    }

    if (input.Entities.length > 0) {
        context['Entities'] = input.Entities.slice(0, VECTOR_AGENT_CONTEXT_NAME_LIST_CAP).map(e => ({
            EntityName: e.EntityName,
            VectorCount: e.VectorCount,
            Status: e.Status,
        }));
        context['AvailableEntityNames'] = capVectorNames(input.Entities.map(e => e.EntityName));
        if (input.Entities.length > VECTOR_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['EntityBreakdownCount'] = input.Entities.length;
        }
    }

    return context;
}
