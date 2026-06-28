/**
 * @fileoverview Pure helpers for the Entity Admin dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they
 * can be unit-tested in isolation. The component ({@link EntityAdminDashboardComponent})
 * supplies a plain snapshot of its current ERD-browser state and these helpers shape it
 * into the key-value `AgentContext` object that flows to the async chat agent and the
 * realtime co-agent via `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY BOUNDARY: The Entity Admin surface is a metadata BROWSER (the ERD entity
 * explorer). Both the context shaped here and the tools wired in the component are
 * strictly read-only / navigational. No helper in this file describes — and no tool may
 * perform — entity-metadata create/edit/delete, schema changes, or any other mutation.
 */

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Entity Admin dashboard's ERD-browser state.
 */
export interface EntityAdminAgentContextInput {
    /** Total unfiltered entity count available in the ERD. */
    TotalEntityCount: number;
    /** Entity count after the current ERD filter is applied. */
    FilteredEntityCount: number;
    /** ID of the currently selected entity in the ERD, or null. */
    SelectedEntityId: string | null;
    /** Name of the currently selected entity in the ERD, or null. */
    SelectedEntityName: string | null;
    /** Whether the ERD filter panel is currently visible. */
    FilterPanelVisible: boolean;
}

/**
 * Build the agent-visible context object for the Entity Admin ERD browser.
 *
 * Reports how the ERD is currently scoped (total vs. filtered entity counts, whether a
 * filter is narrowing the set), what (if anything) is selected, and whether the filter
 * panel is open. `HasActiveFilters` is derived from the count delta so the agent can tell
 * the user is looking at a subset without re-deriving it.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable and
 * decouples it from change-detection timing.
 *
 * @param input - the component's current ERD-browser state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildEntityAdminAgentContext(input: EntityAdminAgentContextInput): Record<string, unknown> {
    return {
        TotalEntityCount: input.TotalEntityCount,
        FilteredEntityCount: input.FilteredEntityCount,
        SelectedEntityId: input.SelectedEntityId,
        SelectedEntityName: input.SelectedEntityName,
        FilterPanelVisible: input.FilterPanelVisible,
        HasActiveFilters: input.FilteredEntityCount < input.TotalEntityCount,
    };
}
