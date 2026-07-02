/**
 * @fileoverview Pure, framework-agnostic helpers for the Permissions admin application's
 * AI-agent integration (Resource Access, User Access, Audit Log surfaces).
 *
 * These functions are intentionally free of Angular / component dependencies so they can be
 * unit-tested in isolation. Each Permissions resource component supplies a plain snapshot of
 * its current state and these helpers shape it into the key-value `AgentContext` object that
 * flows to the async chat agent and the realtime co-agent via `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY BOUNDARY: the Permissions surfaces reveal WHO can access WHAT, the resources a user
 * can reach, and the history of permission changes. The agent-facing integration is strictly
 * READ-ONLY (lookup / filter / select / search). NOTHING here, and none of the client tools that
 * consume it, grants/revokes access, mutates a domain, impersonates a user, or edits an audit
 * record. Published context carries only display names, counts, active filter selections, and
 * BOUNDED samples of grantee / resource / entry names — never credentials, tokens, or secrets.
 */

/**
 * Upper bound on how many names / summaries each Permissions surface publishes in a bounded
 * list field. Keeping the streamed note bounded avoids flooding the co-agent with hundreds of
 * grantee or entry names; a companion `*Count` field reports the true total when truncated.
 */
export const PERMISSIONS_CONTEXT_LIST_CAP = 25;

/**
 * Cap a list of strings to {@link PERMISSIONS_CONTEXT_LIST_CAP} (or a caller-supplied cap).
 * Pure + deterministic; returns a new array and never mutates the input. Tolerates a
 * non-finite / negative cap by falling back to the default.
 */
export function capPermissionsList(values: readonly string[], cap: number = PERMISSIONS_CONTEXT_LIST_CAP): string[] {
    const safeCap = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : PERMISSIONS_CONTEXT_LIST_CAP;
    return values.slice(0, safeCap);
}

/**
 * A minimal id+name candidate the tolerant resolver matches against. Mirrors the salient slice
 * of the richer rows each surface holds (domains, users, grantees).
 */
export interface PermissionsNamedCandidate {
    ID: string;
    Name: string;
}

/**
 * Resolve an agent-supplied reference to a single candidate, the way a user names things:
 *   1. exact ID (case-insensitive)
 *   2. exact Name (case-insensitive, trimmed)
 *   3. first partial (contains) Name match (case-insensitive)
 *
 * Pure + deterministic over the supplied candidate list. Returns the matched candidate, or null
 * on a miss (callers turn the miss into a tolerant "available names" error). Never throws.
 *
 * @param input - whatever the agent passed (an ID or a display name)
 * @param candidates - the candidates available on this surface
 */
export function resolvePermissionsCandidate<T extends PermissionsNamedCandidate>(
    input: string,
    candidates: readonly T[]
): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find((c) => c.ID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    const byName = candidates.find((c) => c.Name.trim().toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    return candidates.find((c) => c.Name.toLowerCase().includes(needle)) ?? null;
}

/**
 * Build a tolerant "not found" error message that lists a bounded sample of the available
 * candidate names so the agent can correct itself. Pure + deterministic.
 *
 * @param input - the unresolved reference the agent supplied
 * @param noun - what kind of thing wasn't found (e.g. "permission domain", "user")
 * @param candidates - the available candidates (a bounded sample of names is echoed back)
 */
export function buildPermissionsNotFoundError(
    input: string,
    noun: string,
    candidates: readonly PermissionsNamedCandidate[]
): string {
    const names = capPermissionsList(candidates.map((c) => c.Name), 10);
    const sample = names.length > 0 ? ` Available ${noun}s include: ${names.join(', ')}.` : '';
    return `No ${noun} matches "${input}".${sample}`;
}

// ===================================================================================
// Resource Access Report
// ===================================================================================

/**
 * Component-supplied snapshot for the Resource Access surface. All fields derive from real
 * component state; none is permission-bearing.
 */
export interface ResourceAccessAgentContextInput {
    /** Currently selected permission domain name, or null. */
    SelectedDomainName: string | null;
    /** Bounded list of available permission domain names. */
    AvailableDomainNames: string[];
    /** Resource types supported by the selected domain (empty when the adapter doesn't enumerate). */
    ResourceTypes: string[];
    /** The resource-type the user/agent has entered for the next/last lookup. */
    ResourceTypeInput: string;
    /** The resource ID the user/agent has entered for the next/last lookup. */
    ResourceIdInput: string;
    /** A label describing the last completed lookup, or null when none has run. */
    LastQueryLabel: string | null;
    /** Number of grantee rows the last lookup returned. */
    GranteeCount: number;
    /** Display names of the grantees from the last lookup, in display order. */
    GranteeNames: string[];
    /** Whether a lookup is currently in flight. */
    IsLoading: boolean;
}

/** Build the agent-visible context object for the Resource Access surface. */
export function buildResourceAccessAgentContext(input: ResourceAccessAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        SelectedDomainName: input.SelectedDomainName,
        ResourceTypeInput: input.ResourceTypeInput || null,
        ResourceIdInput: input.ResourceIdInput || null,
        LastQueryLabel: input.LastQueryLabel,
        GranteeCount: input.GranteeCount,
        IsLoading: input.IsLoading,
        AvailableDomains: capPermissionsList(input.AvailableDomainNames),
    };
    if (input.AvailableDomainNames.length > PERMISSIONS_CONTEXT_LIST_CAP) {
        context['AvailableDomainCount'] = input.AvailableDomainNames.length;
    }
    if (input.ResourceTypes.length > 0) {
        context['ResourceTypes'] = capPermissionsList(input.ResourceTypes);
        if (input.ResourceTypes.length > PERMISSIONS_CONTEXT_LIST_CAP) {
            context['ResourceTypeCount'] = input.ResourceTypes.length;
        }
    }
    if (input.GranteeNames.length > 0) {
        context['GranteeNames'] = capPermissionsList(input.GranteeNames);
        if (input.GranteeNames.length > PERMISSIONS_CONTEXT_LIST_CAP) {
            // GranteeCount already reports the true total; this flag makes truncation explicit.
            context['GranteeNamesTruncated'] = true;
        }
    }
    return context;
}

// ===================================================================================
// User Access Report
// ===================================================================================

/**
 * One domain summary in the User Access report — how many resources the selected user can reach
 * within a single permission domain, plus a bounded sample of those resource names.
 */
export interface UserAccessDomainSummary {
    DomainName: string;
    ResourceCount: number;
    Expanded: boolean;
    ResourceNames: string[];
}

/** Component-supplied snapshot for the User Access surface. */
export interface UserAccessAgentContextInput {
    /** Currently selected user ID, or null. */
    SelectedUserId: string | null;
    /** Resolved display name of the selected user (NEVER a credential), or null. */
    SelectedUserName: string | null;
    /** Role names attached to the selected user (a bounded sample). */
    SelectedUserRoles: string[];
    /** Per-domain accessible-resource summaries for the selected user. */
    DomainSummaries: UserAccessDomainSummary[];
    /** Total accessible-resource count across all domains. */
    TotalResourceCount: number;
    /** Bounded list of available user display names. */
    AvailableUserNames: string[];
    /** Total number of selectable users (for truncation reporting). */
    AvailableUserCount: number;
    /** Whether the per-user permission load is in flight. */
    IsLoadingPermissions: boolean;
}

/** Build the agent-visible context object for the User Access surface. */
export function buildUserAccessAgentContext(input: UserAccessAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        SelectedUserId: input.SelectedUserId,
        SelectedUserName: input.SelectedUserName,
        DomainGroupCount: input.DomainSummaries.length,
        TotalAccessibleResourceCount: input.TotalResourceCount,
        IsLoadingPermissions: input.IsLoadingPermissions,
        AvailableUsers: capPermissionsList(input.AvailableUserNames),
    };
    if (input.AvailableUserCount > input.AvailableUserNames.length || input.AvailableUserNames.length > PERMISSIONS_CONTEXT_LIST_CAP) {
        context['AvailableUserCount'] = Math.max(input.AvailableUserCount, input.AvailableUserNames.length);
    }
    if (input.SelectedUserRoles.length > 0) {
        context['SelectedUserRoles'] = capPermissionsList(input.SelectedUserRoles);
        if (input.SelectedUserRoles.length > PERMISSIONS_CONTEXT_LIST_CAP) {
            context['SelectedUserRoleCount'] = input.SelectedUserRoles.length;
        }
    }
    if (input.DomainSummaries.length > 0) {
        context['AccessByDomain'] = input.DomainSummaries.slice(0, PERMISSIONS_CONTEXT_LIST_CAP).map((d) => ({
            DomainName: d.DomainName,
            ResourceCount: d.ResourceCount,
            Expanded: d.Expanded,
            ResourceNames: capPermissionsList(d.ResourceNames),
            ResourceNamesTruncated: d.ResourceNames.length > PERMISSIONS_CONTEXT_LIST_CAP,
        }));
        const expanded = input.DomainSummaries.filter((d) => d.Expanded).map((d) => d.DomainName);
        context['ExpandedDomains'] = capPermissionsList(expanded);
    }
    return context;
}

// ===================================================================================
// Audit Log
// ===================================================================================

/**
 * One recent audit entry summary published to the agent. Carries only the human-readable facets
 * of a change (no diff bodies, no record internals).
 */
export interface AuditEntrySummary {
    /** ISO timestamp of the change. */
    ChangedAt: string;
    /** Display name of the user who made the change, or null when system-generated. */
    ChangedByUserName: string | null;
    /** The permission domain the entry belongs to. */
    DomainName: string;
    /** Create / Update / Delete / Snapshot. */
    ChangeType: string;
}

/** Component-supplied snapshot for the Audit Log surface. */
export interface AuditLogAgentContextInput {
    /** Active domain filter (empty = no filter). */
    DomainFilter: string;
    /** Active user-ID filter (empty = no filter). */
    UserFilter: string;
    /** Resolved display name for the active user filter, or null. */
    UserFilterName: string | null;
    /** Active start-date filter (YYYY-MM-DD, empty = none). */
    StartDate: string;
    /** Active end-date filter (YYYY-MM-DD, empty = none). */
    EndDate: string;
    /** Number of entries the last query returned. */
    EntryCount: number;
    /** Bounded sample of the most recent entries from the last query. */
    RecentEntries: AuditEntrySummary[];
    /** Bounded list of available permission domain names. */
    AvailableDomainNames: string[];
    /** Bounded list of available user display names. */
    AvailableUserNames: string[];
    /** Total number of selectable users (for truncation reporting). */
    AvailableUserCount: number;
    /** Whether a query is in flight. */
    IsLoading: boolean;
    /** Whether a query has been run since the last reset. */
    HasRunQuery: boolean;
}

/** Build the agent-visible context object for the Audit Log surface. */
export function buildAuditLogAgentContext(input: AuditLogAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        DomainFilter: input.DomainFilter || null,
        UserFilter: input.UserFilter || null,
        UserFilterName: input.UserFilterName,
        StartDate: input.StartDate || null,
        EndDate: input.EndDate || null,
        EntryCount: input.EntryCount,
        IsLoading: input.IsLoading,
        HasRunQuery: input.HasRunQuery,
        HasActiveFilters: Boolean(input.DomainFilter || input.UserFilter || input.StartDate || input.EndDate),
        AvailableDomains: capPermissionsList(input.AvailableDomainNames),
        AvailableUsers: capPermissionsList(input.AvailableUserNames),
    };
    if (input.AvailableDomainNames.length > PERMISSIONS_CONTEXT_LIST_CAP) {
        context['AvailableDomainCount'] = input.AvailableDomainNames.length;
    }
    if (input.AvailableUserCount > input.AvailableUserNames.length || input.AvailableUserNames.length > PERMISSIONS_CONTEXT_LIST_CAP) {
        context['AvailableUserCount'] = Math.max(input.AvailableUserCount, input.AvailableUserNames.length);
    }
    if (input.RecentEntries.length > 0) {
        context['RecentEntries'] = input.RecentEntries.slice(0, PERMISSIONS_CONTEXT_LIST_CAP);
        if (input.EntryCount > PERMISSIONS_CONTEXT_LIST_CAP) {
            context['RecentEntriesTruncated'] = true;
        }
    }
    return context;
}
