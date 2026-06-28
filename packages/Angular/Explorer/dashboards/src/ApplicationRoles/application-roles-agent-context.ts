/**
 * @fileoverview Pure helpers for the Application Roles dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they can be
 * unit-tested in isolation. The component ({@link ApplicationRolesResourceComponent}) supplies a
 * plain snapshot of its current state and {@link buildApplicationRolesAgentContext} shapes it into
 * the key-value `AgentContext` object that flows to the async chat agent and the realtime co-agent
 * via `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY BOUNDARY: the Application Roles surface manages permission assignments (which roles can
 * access / administer each application). The agent-facing integration is READ-ONLY plus benign UI
 * navigation (expand/collapse a group). Nothing here, and none of the client tools that consume it,
 * mutates a permission. See the SAFETY BOUNDARY comment in the component for the full exclusion list.
 */

/**
 * Upper bound on how many application IDs we publish in the expanded-ids context field. Keeping the
 * streamed note bounded avoids flooding the co-agent when many groups happen to be expanded at once.
 */
export const AGENT_CONTEXT_ID_LIST_CAP = 50;

/**
 * The plain, component-supplied snapshot used to build the agent context. Mirrors the salient slice
 * of the component's reactive state — all derived from real component fields, none of them
 * permission-bearing.
 */
export interface ApplicationRolesAgentContextInput {
    /** Number of application groups currently shown in the matrix. */
    ApplicationGroupCount: number;
    /** Total number of role assignments across every application group. */
    TotalRoleAssignmentCount: number;
    /** Whether there are pending, unsaved edits the user has made in the grid. */
    HasUnsavedChanges: boolean;
    /** Whether the surface is currently (re)loading its data. */
    IsLoading: boolean;
    /** IDs of the application groups that are currently expanded in the UI. */
    ExpandedApplicationIds: string[];
}

/**
 * Build the agent-visible context object for the Application Roles surface.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable and decouples it
 * from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildApplicationRolesAgentContext(input: ApplicationRolesAgentContextInput): Record<string, unknown> {
    const expanded = input.ExpandedApplicationIds.slice(0, AGENT_CONTEXT_ID_LIST_CAP);
    const context: Record<string, unknown> = {
        ApplicationGroupCount: input.ApplicationGroupCount,
        TotalRoleAssignmentCount: input.TotalRoleAssignmentCount,
        HasUnsavedChanges: input.HasUnsavedChanges,
        IsLoading: input.IsLoading,
        ExpandedApplicationIds: expanded,
    };
    // When more groups are expanded than we publish ids for, tell the co-agent the true total so it
    // knows the list is truncated.
    if (input.ExpandedApplicationIds.length > AGENT_CONTEXT_ID_LIST_CAP) {
        context['ExpandedApplicationCount'] = input.ExpandedApplicationIds.length;
    }
    return context;
}
