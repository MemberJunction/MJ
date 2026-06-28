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
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Dependency Graph state: the currently
 * selected entity, the graph-wide counts, the active search/schema filters, the
 * count of visible (filtered) entities, and the names available for selection /
 * schema filtering.
 */
export interface VersionHistoryGraphAgentContextInput {
    /** Name of the currently selected entity, or null when none is selected. */
    SelectedEntityName: string | null;
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
    return context;
}
