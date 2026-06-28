/**
 * @fileoverview Pure helpers for the Database Designer dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they
 * can be unit-tested in isolation. The component
 * ({@link DatabaseDesignerDashboardComponent}) supplies a plain snapshot of its current
 * schema-browsing state and these helpers shape it into the key-value `AgentContext`
 * object that flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY BOUNDARY: The Database Designer surface CAN mutate the database schema
 * (create entities, alter tables, add/remove fields, run the DDL pipeline). The context
 * shaped here describes ONLY what the user is BROWSING — the accessible-entity list, the
 * current search/selection, and whether the modify panel is open. No helper in this file
 * describes — and no tool may perform — any schema mutation. The agent browses the schema;
 * the user makes changes from the wizard / modify panel.
 */

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Database Designer dashboard's browse state.
 */
export interface DatabaseDesignerAgentContextInput {
    /** Total number of entities the current user can access in the designer. */
    EntityCount: number;
    /** Current free-text search term applied to the entity list (empty when none). */
    SearchText: string;
    /** ID of the entity whose detail panel is open, or null. */
    SelectedEntityId: string | null;
    /** Name of the entity whose detail panel is open, or null. */
    SelectedEntityName: string | null;
    /** Whether the entity detail (modify) panel is currently open. */
    ShowModifyPanel: boolean;
    /** Whether the accessible-entity list is currently loading. */
    IsLoading: boolean;
}

/**
 * Build the agent-visible context object for the Database Designer schema browser.
 *
 * Reports how many entities are available, the current search term, what (if anything)
 * is selected, whether the detail panel is open, and whether data is still loading.
 * `HasSearch` is derived so the agent can tell the user is looking at a filtered subset
 * without re-deriving it.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable and
 * decouples it from change-detection timing.
 *
 * @param input - the component's current browse-state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildDatabaseDesignerAgentContext(
    input: DatabaseDesignerAgentContextInput,
): Record<string, unknown> {
    return {
        EntityCount: input.EntityCount,
        SearchText: input.SearchText,
        SelectedEntityId: input.SelectedEntityId,
        SelectedEntityName: input.SelectedEntityName,
        ShowModifyPanel: input.ShowModifyPanel,
        IsLoading: input.IsLoading,
        HasSearch: input.SearchText.trim().length > 0,
    };
}
