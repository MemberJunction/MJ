/**
 * @fileoverview Pure helpers for the Role Management admin surface's AI-agent integration.
 *
 * 🔒 READ-ONLY / GOVERNANCE SURFACE. These helpers shape a non-sensitive snapshot of the
 * role-management screen into the key-value `AgentContext` object and back agent-supplied
 * role references with tolerant id→name→contains resolution. They are intentionally free of
 * Angular / component dependencies so they can be unit-tested in isolation (mirrors the
 * Data Explorer agent-context pattern). Permission information is surfaced as a READ-ONLY
 * summary (counts only) — no grant/revoke surface, no secrets.
 */

/** The three role-type filter values the surface supports. */
export const VALID_ROLE_TYPE_FILTERS = ['all', 'system', 'custom'] as const;
export type RoleTypeFilter = (typeof VALID_ROLE_TYPE_FILTERS)[number];

/**
 * Upper bound on how many role names we publish in a name-list context field
 * (VisibleRoleNames). Keeps the streamed note bounded; a companion total-count field reports
 * the true number when the list is truncated.
 */
export const ROLE_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/** Type-guard for a role-type filter string. Keeps the FilterRolesByType tool tolerant. */
export function isValidRoleTypeFilter(value: unknown): value is RoleTypeFilter {
    return typeof value === 'string' && (VALID_ROLE_TYPE_FILTERS as readonly string[]).includes(value);
}

/** Cap a list of names to {@link ROLE_AGENT_CONTEXT_NAME_LIST_CAP}. Pure + deterministic. */
export function capRoleNames(names: readonly string[]): string[] {
    return names.slice(0, ROLE_AGENT_CONTEXT_NAME_LIST_CAP);
}

/** A minimal descriptor of a role (id + display name) supplied by the component. */
export interface RoleNameCandidate {
    ID: string;
    Name: string;
}

/** Outcome of a tolerant id→name→contains role resolution. */
export type RoleLookupResult =
    | { ok: true; match: RoleNameCandidate }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied role reference against the loaded roles, tolerantly:
 *   1. exact ID match (case-insensitive)
 *   2. exact display-name match (case-insensitive)
 *   3. first case-insensitive *contains* match on name
 *
 * Pure + deterministic. On a miss, returns a clear error listing a sample of available role
 * names so the agent can correct itself.
 */
export function resolveRoleByIDOrName(input: string, candidates: readonly RoleNameCandidate[]): RoleLookupResult {
    const needle = input.trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide a role ID or name to select.' };
    }
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return { ok: true, match: byId };
    }
    const exact = candidates.find(c => c.Name.toLowerCase() === needle);
    if (exact) {
        return { ok: true, match: exact };
    }
    const contains = candidates.find(c => c.Name.toLowerCase().includes(needle));
    if (contains) {
        return { ok: true, match: contains };
    }
    const sample = candidates.slice(0, 8).map(c => c.Name).join(', ');
    return { ok: false, error: `No role matches "${input}". Available roles: ${sample || '(none loaded)'}.` };
}

/**
 * Read-only permission summary for the selected role, derived from the role's
 * entity-permission rows. Counts only — describes the breadth of access the role has been
 * granted without exposing any mutation surface.
 */
export interface RolePermissionSummary {
    /** Number of entities for which the role has at least one permission row. */
    EntityCount: number;
    /** Number of entities the role can read. */
    ReadCount: number;
    /** Number of entities the role can create. */
    CreateCount: number;
    /** Number of entities the role can update. */
    UpdateCount: number;
    /** Number of entities the role can delete. */
    DeleteCount: number;
}

/**
 * The plain, component-supplied snapshot used to build the role-management agent context.
 * NON-SENSITIVE by construction — counts, filter state, and on-screen display values only.
 */
export interface RoleManagementAgentContextInput {
    /** Total roles loaded (unfiltered). */
    TotalRoleCount: number;
    /** Roles currently visible after type/search filters. */
    FilteredRoleCount: number;
    /** Count of system roles (across the unfiltered set). */
    SystemRoleCount: number;
    /** Count of custom roles (across the unfiltered set). */
    CustomRoleCount: number;
    /** Active role-type filter. */
    TypeFilter: RoleTypeFilter;
    /** Current free-text search string. */
    SearchText: string;
    /** ID of the currently selected (expanded) role, or null. */
    SelectedRoleId: string | null;
    /** Display name of the currently selected role, or null. */
    SelectedRoleName: string | null;
    /** Display names of the currently visible (filtered) roles, in list order. */
    VisibleRoleNames: string[];
    /** Read-only permission summary for the selected role, or null when none selected / not loaded. */
    SelectedRolePermissions: RolePermissionSummary | null;
}

/**
 * Build the agent-visible context object for Role Management. Pure (no `this`). Bounds the
 * role-name list and emits a companion total-count when truncated; surfaces the read-only
 * permission summary only when a role is selected and its permissions have been loaded.
 */
export function buildRoleManagementAgentContext(input: RoleManagementAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        TotalRoleCount: input.TotalRoleCount,
        FilteredRoleCount: input.FilteredRoleCount,
        SystemRoleCount: input.SystemRoleCount,
        CustomRoleCount: input.CustomRoleCount,
        TypeFilter: input.TypeFilter,
        SearchText: input.SearchText,
        SelectedRoleId: input.SelectedRoleId,
        SelectedRoleName: input.SelectedRoleName,
    };

    if (input.VisibleRoleNames.length > 0) {
        context['VisibleRoleNames'] = capRoleNames(input.VisibleRoleNames);
        if (input.VisibleRoleNames.length > ROLE_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['VisibleRoleCount'] = input.VisibleRoleNames.length;
        }
    }

    // Read-only permission summary — surfaced ONLY when a role is selected AND its
    // permissions have been loaded (never fabricated zeros for an unselected role).
    if (input.SelectedRolePermissions) {
        context['SelectedRolePermissions'] = { ...input.SelectedRolePermissions };
    }

    return context;
}
