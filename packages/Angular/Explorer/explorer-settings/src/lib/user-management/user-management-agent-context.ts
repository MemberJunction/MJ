/**
 * @fileoverview Pure helpers for the User Management admin surface's AI-agent integration.
 *
 * 🔒 READ-ONLY / GOVERNANCE SURFACE. These helpers shape a non-sensitive snapshot of the
 * user-management screen into the key-value `AgentContext` object and back agent-supplied
 * user references with tolerant id→name→contains resolution. They are intentionally free of
 * Angular / component dependencies so they can be unit-tested in isolation (mirrors the
 * Data Explorer's {@link ../../../../dashboards/src/DataExplorer/data-explorer-agent-context}
 * pattern), and they NEVER surface passwords, tokens, or other secrets — only counts,
 * filter state, and display names/emails the user already sees on screen.
 */

/** The three user-status filter values the surface supports. */
export const VALID_USER_STATUS_FILTERS = ['all', 'active', 'inactive'] as const;
export type UserStatusFilter = (typeof VALID_USER_STATUS_FILTERS)[number];

/**
 * Upper bound on how many user/role display values we publish in a name-list context field
 * (VisibleUserNames, VisibleUserEmails, AvailableRoleNames, VisibleColumns). Keeps the
 * streamed note bounded even when hundreds of rows are loaded; a companion total-count field
 * reports the true number when the list is truncated.
 */
export const USER_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/** Type-guard for a user-status filter string. Keeps the SwitchUserStatusFilter tool tolerant. */
export function isValidUserStatusFilter(value: unknown): value is UserStatusFilter {
    return typeof value === 'string' && (VALID_USER_STATUS_FILTERS as readonly string[]).includes(value);
}

/** Cap a list of names to {@link USER_AGENT_CONTEXT_NAME_LIST_CAP}. Pure + deterministic. */
export function capUserNames(names: readonly string[]): string[] {
    return names.slice(0, USER_AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * A minimal, NON-SENSITIVE descriptor of a user, supplied by the component so the pure
 * resolver can match agent input against what the user sees. Mirrors the salient slice of
 * `MJUserEntity` — never includes credentials.
 */
export interface UserNameCandidate {
    ID: string;
    Name: string;
    Email?: string | null;
    FirstName?: string | null;
    LastName?: string | null;
}

/** A minimal, NON-SENSITIVE descriptor of a role (id + display name). */
export interface RoleNameCandidate {
    ID: string;
    Name: string;
}

/** Outcome of a tolerant id→name→contains resolution. */
export type NamedLookupResult<T> =
    | { ok: true; match: T }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied user reference against the loaded users, tolerantly:
 *   1. exact ID match (case-insensitive)
 *   2. exact display-name / email match (case-insensitive)
 *   3. first case-insensitive *contains* match on name, email, or "First Last"
 *
 * Pure + deterministic over the supplied candidate list. On a miss, returns a clear error
 * listing a sample of available names so the agent can correct itself.
 */
export function resolveUserByIDOrName(input: string, candidates: readonly UserNameCandidate[]): NamedLookupResult<UserNameCandidate> {
    const needle = input.trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide a user ID or name to select.' };
    }
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return { ok: true, match: byId };
    }
    const exact = candidates.find(c => fullNameForms(c).some(form => form === needle));
    if (exact) {
        return { ok: true, match: exact };
    }
    const contains = candidates.find(c => fullNameForms(c).some(form => form.includes(needle)));
    if (contains) {
        return { ok: true, match: contains };
    }
    const sample = candidates.slice(0, 5).map(c => c.Name).join(', ');
    return { ok: false, error: `No user matches "${input}". Available users include: ${sample || '(none loaded)'}.` };
}

/**
 * Resolve an agent-supplied role reference (id or display name) against the loaded roles,
 * tolerantly: exact ID → exact name → first contains. Backs FilterUsersByRole so the agent
 * can say either the role name or the role id.
 */
export function resolveRoleByIDOrName(input: string, candidates: readonly RoleNameCandidate[]): NamedLookupResult<RoleNameCandidate> {
    const needle = input.trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide a role ID or name.' };
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

/** The lowercased forms a user can be matched against (display name, email, "First Last"). */
function fullNameForms(c: UserNameCandidate): string[] {
    const forms: string[] = [];
    if (c.Name) {
        forms.push(c.Name.toLowerCase());
    }
    if (c.Email) {
        forms.push(c.Email.toLowerCase());
    }
    const combined = `${c.FirstName ?? ''} ${c.LastName ?? ''}`.trim().toLowerCase();
    if (combined) {
        forms.push(combined);
    }
    return forms;
}

/**
 * The plain, component-supplied snapshot used to build the user-management agent context.
 * NON-SENSITIVE by construction — counts, filter state, and on-screen display values only.
 */
export interface UserManagementAgentContextInput {
    /** Total users loaded (unfiltered). */
    TotalUserCount: number;
    /** Users currently visible after status/role/search filters. */
    FilteredUserCount: number;
    /** Count of active users (across the unfiltered set). */
    ActiveUserCount: number;
    /** Count of inactive users (across the unfiltered set). */
    InactiveUserCount: number;
    /** Active status filter. */
    StatusFilter: UserStatusFilter;
    /** Active role-filter id, or null when no role filter is applied. */
    RoleFilterId: string | null;
    /** Resolved display name for {@link RoleFilterId}, or null. */
    RoleFilterName: string | null;
    /** Current free-text search string. */
    SearchText: string;
    /** Display name of the currently selected user, or null. */
    SelectedUserId: string | null;
    /** Display name of the currently selected user, or null. NEVER a credential. */
    SelectedUserName: string | null;
    /** Display names of the currently visible (filtered) users, in list order. */
    VisibleUserNames: string[];
    /** Emails of the currently visible (filtered) users, in list order. */
    VisibleUserEmails: string[];
    /** Names of the roles available as filter options. */
    AvailableRoleNames: string[];
    /** Column/field labels currently shown in the user grid. */
    VisibleColumns: string[];
}

/**
 * Build the agent-visible context object for User Management. Pure (no `this`) so the shape
 * stays unit-testable and decoupled from change-detection timing. Bounds every name list and
 * emits a companion total-count when truncated.
 */
export function buildUserManagementAgentContext(input: UserManagementAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        TotalUserCount: input.TotalUserCount,
        FilteredUserCount: input.FilteredUserCount,
        ActiveUserCount: input.ActiveUserCount,
        InactiveUserCount: input.InactiveUserCount,
        StatusFilter: input.StatusFilter,
        RoleFilterId: input.RoleFilterId,
        RoleFilterName: input.RoleFilterName,
        SearchText: input.SearchText,
        SelectedUserId: input.SelectedUserId,
        SelectedUserName: input.SelectedUserName,
    };

    appendBoundedList(context, 'VisibleUserNames', 'VisibleUserNameCount', input.VisibleUserNames);
    appendBoundedList(context, 'VisibleUserEmails', 'VisibleUserEmailCount', input.VisibleUserEmails);
    appendBoundedList(context, 'AvailableRoleNames', 'AvailableRoleCount', input.AvailableRoleNames);
    appendBoundedList(context, 'VisibleColumns', 'VisibleColumnCount', input.VisibleColumns);

    return context;
}

/** Add a capped name list under `listKey`, plus a `countKey` total when the source was truncated. */
function appendBoundedList(target: Record<string, unknown>, listKey: string, countKey: string, source: readonly string[]): void {
    if (source.length === 0) {
        return;
    }
    target[listKey] = capUserNames(source);
    if (source.length > USER_AGENT_CONTEXT_NAME_LIST_CAP) {
        target[countKey] = source.length;
    }
}
