/**
 * @fileoverview Pure helpers for the Version History Dependency Graph surface's
 * AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link ./components/graph-resource.component.ts VersionHistoryGraphResourceComponent})
 * supplies a plain snapshot of its current state and these helpers shape it into
 * the key-value `AgentContext` object that flows to the async chat agent and the
 * realtime co-agent via `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY: the Dependency Graph surface is purely a browse/filter/inspect view
 * over entity-relationship metadata. It exposes ONLY read-only / filter / search /
 * select tools to the agent — no mutation of any kind. These helpers shape
 * read-only context; they perform no mutation.
 */

/**
 * Upper bound on how many entity names we publish in a name-list context field
 * (AvailableEntities, AvailableSchemas). Keeping the streamed note bounded avoids
 * flooding the co-agent with hundreds of names; when the underlying list is
 * larger we surface a companion total-count field instead.
 */
export const VERSION_HISTORY_GRAPH_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to {@link VERSION_HISTORY_GRAPH_NAME_LIST_CAP} entries.
 * Pure + deterministic so the context shape stays unit-testable.
 *
 * @param names - the full list of names (already de-duplicated by the caller)
 * @returns the first N names, where N is the cap
 */
function capNames(names: readonly string[]): string[] {
    return names.slice(0, VERSION_HISTORY_GRAPH_NAME_LIST_CAP);
}

/**
 * A read-only dependency summary for the currently selected entity: its id +
 * name + schema, the counts of entities that reference it (it is the "one" side)
 * and the entities it depends on (it is the "many" side), plus bounded lists of
 * those neighbour names so the co-agent can describe the entity's place in the
 * graph and offer them as next selections.
 */
export interface VersionHistoryGraphSelectedEntitySummary {
    /** The selected entity's ID. */
    ID: string;
    /** The selected entity's name. */
    Name: string;
    /** The selected entity's schema. */
    SchemaName: string;
    /** Number of entities that reference the selected entity (its dependents). */
    ReferencedByCount: number;
    /** Number of entities the selected entity depends on. */
    DependsOnCount: number;
    /**
     * Names of the entities that reference the selected entity. The component
     * supplies the full list; this helper bounds it — see
     * {@link VERSION_HISTORY_GRAPH_NAME_LIST_CAP}.
     */
    ReferencedByEntityNames: string[];
    /**
     * Names of the entities the selected entity depends on. The component supplies
     * the full list; this helper bounds it.
     */
    DependsOnEntityNames: string[];
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Dependency Graph state: the currently
 * selected entity (id + name + dependency summary), the graph-wide counts, the
 * active search/schema filters, the count of visible (filtered) entities, and
 * the names available for selection / schema filtering.
 */
export interface VersionHistoryGraphAgentContextInput {
    /** Name of the currently selected entity, or null when none is selected. */
    SelectedEntityName: string | null;
    /** ID of the currently selected entity, or null when none is selected. */
    SelectedEntityId: string | null;
    /**
     * The selected entity's dependency summary, or null when no entity is
     * selected. Surfaced only when present (never fabricated for the no-selection
     * state). See {@link VersionHistoryGraphSelectedEntitySummary}.
     */
    SelectedEntitySummary: VersionHistoryGraphSelectedEntitySummary | null;
    /** Total number of entities in the graph. */
    TotalEntities: number;
    /** Number of entities that have at least one dependent (referenced by others). */
    EntitiesWithDependents: number;
    /** Total number of one-to-many relationships across the graph. */
    TotalRelationships: number;
    /** The entity-name search text currently applied ('' = no search). */
    SearchText: string;
    /** The schema filter currently applied ('' = no schema filter). */
    SchemaFilter: string;
    /** Number of entities visible after the current search + schema filters. */
    VisibleEntityCount: number;
    /**
     * Names of the entities currently visible (so the co-agent can select one via
     * SelectEntityForDependencyView). The component supplies the full filtered
     * list; this helper bounds it — see {@link VERSION_HISTORY_GRAPH_NAME_LIST_CAP}.
     */
    VisibleEntityNames: string[];
    /**
     * Names of the schemas available for filtering (so the co-agent can filter via
     * FilterEntitiesBySchema). The component supplies the full list; this helper
     * bounds it.
     */
    AvailableSchemas: string[];
}

/**
 * Build the agent-visible context object for the Version History Dependency Graph.
 *
 * Reports the selected entity, the graph-wide counts (entities, entities with
 * dependents, relationships), the active search + schema filters, the count of
 * visible entities, and bounded lists of selectable entity names + filterable
 * schema names. Keeping this a pure function (no `this`) makes the context shape
 * unit-testable and decoupled from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildVersionHistoryGraphAgentContext(
    input: VersionHistoryGraphAgentContextInput,
): Record<string, unknown> {
    const context: Record<string, unknown> = {
        SelectedEntityName: input.SelectedEntityName,
        SelectedEntityId: input.SelectedEntityId,
        TotalEntities: input.TotalEntities,
        EntitiesWithDependents: input.EntitiesWithDependents,
        TotalRelationships: input.TotalRelationships,
        SearchText: input.SearchText,
        SchemaFilter: input.SchemaFilter,
        VisibleEntityCount: input.VisibleEntityCount,
        VisibleEntities: capNames(input.VisibleEntityNames),
        AvailableSchemas: capNames(input.AvailableSchemas),
    };
    // When the filtered list is larger than we publish names for, tell the
    // co-agent the true total so it knows the list is truncated.
    if (input.VisibleEntityNames.length > VERSION_HISTORY_GRAPH_NAME_LIST_CAP) {
        context['VisibleEntityNameCount'] = input.VisibleEntityNames.length;
    }
    if (input.AvailableSchemas.length > VERSION_HISTORY_GRAPH_NAME_LIST_CAP) {
        context['AvailableSchemaCount'] = input.AvailableSchemas.length;
    }

    // The selected entity's dependency summary — surfaced ONLY when an entity is
    // selected (never fabricated zeros for the no-selection state).
    const summary = input.SelectedEntitySummary;
    if (summary) {
        context['SelectedEntity'] = {
            ID: summary.ID,
            Name: summary.Name,
            SchemaName: summary.SchemaName,
            ReferencedByCount: summary.ReferencedByCount,
            DependsOnCount: summary.DependsOnCount,
            ReferencedByEntities: capNames(summary.ReferencedByEntityNames),
            DependsOnEntities: capNames(summary.DependsOnEntityNames),
        };
        if (summary.ReferencedByEntityNames.length > VERSION_HISTORY_GRAPH_NAME_LIST_CAP) {
            (context['SelectedEntity'] as Record<string, unknown>)['ReferencedByEntityCount'] =
                summary.ReferencedByEntityNames.length;
        }
        if (summary.DependsOnEntityNames.length > VERSION_HISTORY_GRAPH_NAME_LIST_CAP) {
            (context['SelectedEntity'] as Record<string, unknown>)['DependsOnEntityCount'] =
                summary.DependsOnEntityNames.length;
        }
    }
    return context;
}

/** Minimal name/id-bearing entity descriptor for {@link resolveGraphEntity}. */
export interface GraphEntityCandidate {
    ID: string;
    Name: string;
}

/** Outcome of {@link resolveGraphEntity}: a matched entity, or a tolerant error. */
export type GraphEntityResolution<T extends GraphEntityCandidate> =
    | { ok: true; entity: T }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied entity reference (an ID or a name) to one of the
 * graph's entities, in order: exact ID (case-insensitive) → exact name
 * (case-insensitive) → first name-contains match. Pure + deterministic over the
 * supplied candidate list, so it's unit-testable in isolation. Returns a tolerant
 * error listing a sample of available names on a miss.
 *
 * @param reference - whatever the agent passed (an entity ID or name)
 * @param candidates - the entities available in the graph
 * @returns the matched entity, or a clear error message
 */
export function resolveGraphEntity<T extends GraphEntityCandidate>(
    reference: string,
    candidates: readonly T[],
): GraphEntityResolution<T> {
    const needle = reference.trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'An entity ID or name is required.' };
    }
    const byId = candidates.find((c) => c.ID.toLowerCase() === needle);
    if (byId) {
        return { ok: true, entity: byId };
    }
    const byName = candidates.find((c) => c.Name.toLowerCase() === needle);
    if (byName) {
        return { ok: true, entity: byName };
    }
    const byContains = candidates.find((c) => c.Name.toLowerCase().includes(needle));
    if (byContains) {
        return { ok: true, entity: byContains };
    }
    const sample = capNames(candidates.map((c) => c.Name)).join(', ');
    return { ok: false, error: `Entity "${reference}" was not found in the dependency graph. Available entities include: ${sample}.` };
}
