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
 * navigation (expand/collapse a group, select an app to inspect, refresh, export the on-screen
 * matrix). Nothing here, and none of the client tools that consume it, mutates a permission. See
 * the SAFETY BOUNDARY comment in the component for the full exclusion list.
 */

/**
 * Upper bound on how many application IDs we publish in the expanded-ids context field. Keeping the
 * streamed note bounded avoids flooding the co-agent when many groups happen to be expanded at once.
 */
export const AGENT_CONTEXT_ID_LIST_CAP = 50;

/**
 * Upper bound on how many names (application names, role names) we publish in a bounded name-list
 * context field. A companion `*Count` field reports the true total when the list is truncated.
 */
export const AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * A single application-group summary published to the agent: the app name plus how many roles are
 * currently assigned to it and whether its group is expanded in the UI. No permission flags.
 */
export interface ApplicationGroupSummary {
    ApplicationID: string;
    ApplicationName: string;
    RoleCount: number;
    Expanded: boolean;
}

/**
 * The plain, component-supplied snapshot used to build the agent context. Mirrors the salient slice
 * of the component's reactive state — all derived from real component fields, none of them
 * permission-bearing (no CanAccess / CanAdmin flags are ever published).
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
    /** Per-application summaries (name · role count · expanded). Bounded on publish. */
    ApplicationSummaries: ApplicationGroupSummary[];
    /** ID of the application currently selected for inspection, or null. */
    SelectedApplicationId: string | null;
    /** Resolved display name of the selected application, or null. */
    SelectedApplicationName: string | null;
    /** Role names assigned to the selected application (bounded on publish). */
    SelectedApplicationRoleNames: string[];
    /** Total number of distinct roles available in the system (for context). */
    AvailableRoleCount: number;
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
        AvailableRoleCount: input.AvailableRoleCount,
        SelectedApplicationId: input.SelectedApplicationId,
        SelectedApplicationName: input.SelectedApplicationName,
    };
    // When more groups are expanded than we publish ids for, tell the co-agent the true total so it
    // knows the list is truncated.
    if (input.ExpandedApplicationIds.length > AGENT_CONTEXT_ID_LIST_CAP) {
        context['ExpandedApplicationCount'] = input.ExpandedApplicationIds.length;
    }

    // Bounded structured summary of the matrix (name + role count + expanded) so the agent can
    // reason about which apps have roles assigned vs. are open-access (0 roles).
    if (input.ApplicationSummaries.length > 0) {
        context['Applications'] = input.ApplicationSummaries.slice(0, AGENT_CONTEXT_NAME_LIST_CAP).map((a) => ({
            ApplicationName: a.ApplicationName,
            RoleCount: a.RoleCount,
            Expanded: a.Expanded,
        }));
        if (input.ApplicationSummaries.length > AGENT_CONTEXT_NAME_LIST_CAP) {
            context['ApplicationListTruncated'] = true;
        }
    }

    // Selected-app roles (bounded) — only present when an app is selected.
    if (input.SelectedApplicationId && input.SelectedApplicationRoleNames.length > 0) {
        context['SelectedApplicationRoles'] = input.SelectedApplicationRoleNames.slice(0, AGENT_CONTEXT_NAME_LIST_CAP);
        if (input.SelectedApplicationRoleNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
            context['SelectedApplicationRoleCount'] = input.SelectedApplicationRoleNames.length;
        }
    }
    return context;
}

/**
 * A minimal id+name candidate matched by {@link resolveApplicationByIdOrName}.
 */
export interface ApplicationNamedCandidate {
    ApplicationID: string;
    ApplicationName: string;
}

/**
 * Resolve an agent-supplied application reference the way a user names things:
 *   1. exact ID (case-insensitive)
 *   2. exact name (case-insensitive, trimmed)
 *   3. first partial (contains) name match (case-insensitive)
 *
 * Pure + deterministic. Returns the matched candidate, or null on a miss. Never throws.
 */
export function resolveApplicationByIdOrName<T extends ApplicationNamedCandidate>(
    input: string,
    candidates: readonly T[]
): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find((c) => c.ApplicationID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    const byName = candidates.find((c) => c.ApplicationName.trim().toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    return candidates.find((c) => c.ApplicationName.toLowerCase().includes(needle)) ?? null;
}

/**
 * Build a tolerant "not found" error listing a bounded sample of the available application names so
 * the agent can correct itself. Pure + deterministic.
 */
export function buildApplicationNotFoundError(input: string, candidates: readonly ApplicationNamedCandidate[]): string {
    const names = candidates.slice(0, 10).map((c) => c.ApplicationName);
    const sample = names.length > 0 ? ` Applications shown in this matrix include: ${names.join(', ')}.` : '';
    return `No application matches "${input}" in this matrix.${sample}`;
}

/**
 * One row of the Application Roles matrix as exported to CSV. Only the on-screen, non-sensitive
 * facets are exported — the same data the matrix already renders.
 */
export interface ApplicationRoleExportRow {
    ApplicationName: string;
    RoleName: string;
    CanAccess: boolean;
    CanAdmin: boolean;
}

/**
 * Build a CSV string for the Application Roles matrix from the supplied rows. Pure + deterministic
 * (no `document`, no download) so it can be unit-tested; the component handles the Blob/anchor
 * download. Quotes fields and escapes embedded quotes per RFC-4180.
 *
 * 🔒 This only SERIALIZES already-visible matrix data — it performs no mutation and exposes no
 * credential. Apps with no role rows still appear as a single "(open access)" row.
 */
export function buildApplicationRolesCsv(rows: readonly ApplicationRoleExportRow[]): string {
    const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`;
    const header = ['Application', 'Role', 'CanAccess', 'CanAdmin'].map(esc).join(',');
    const body = rows.map((r) =>
        [esc(r.ApplicationName), esc(r.RoleName), esc(r.CanAccess ? 'Yes' : 'No'), esc(r.CanAdmin ? 'Yes' : 'No')].join(',')
    );
    return [header, ...body].join('\n');
}
