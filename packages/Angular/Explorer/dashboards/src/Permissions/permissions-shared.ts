import { IMetadataProvider, Metadata, NormalizedPermission, RunView, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { PERMISSION_DOMAIN_ICONS, PermissionEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Narrow shape the Permissions admin resource components need when rendering a user picker.
 * We only pull the handful of columns used in dropdown labels and UserInfo hydration.
 */
export interface PermissionsUserOption {
    ID: string;
    Name: string;
    Email: string;
}

/**
 * Domain-to-icon lookup used by the User Access Report and the Audit Log tabs.
 * Re-exports the shared constant from `@memberjunction/core-entities` so the admin
 * dashboard and the end-user Sharing Center always render the same glyph. Add new
 * domains in `core-entities/src/engines/PermissionEngine.ts`, not here.
 */
export const PERMISSIONS_DOMAIN_ICONS = PERMISSION_DOMAIN_ICONS;

/**
 * A single domain section in the User Access Report — used by the UI to render
 * collapsible groups of {@link NormalizedPermission} rows.
 */
export interface PermissionsDomainGroup {
    DomainName: string;
    Icon: string;
    Count: number;
    Expanded: boolean;
    Rows: NormalizedPermission[];
}

/**
 * Load every user from `MJ: Users` with just the columns the Permissions admin
 * dropdowns need. Sorted by Name.
 */
export async function loadPermissionsUsers(provider?: IMetadataProvider): Promise<PermissionsUserOption[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<PermissionsUserOption>({
        EntityName: 'MJ: Users',
        Fields: ['ID', 'Name', 'Email'],
        OrderBy: 'Name',
        ResultType: 'simple',
    });
    if (!result.Success) {
        throw new Error(result.ErrorMessage ?? 'Failed to load users');
    }
    return result.Results ?? [];
}

/**
 * Hydrate a full `UserInfo` for the user we want to report against. When the target
 * is the current user we reuse `Metadata.CurrentUser` directly (it already has
 * roles loaded). Otherwise we hit `MJ: User Roles` to assemble a UserInfo-shaped
 * object with the target user's roles attached, because every provider needs roles
 * to evaluate access correctly.
 */
export async function resolvePermissionsUser(
    userId: string,
    userDropdown: PermissionsUserOption[],
    provider?: IMetadataProvider
): Promise<UserInfo | null> {
    const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
    if (md.CurrentUser && UUIDsEqual(md.CurrentUser.ID, userId)) {
        return md.CurrentUser;
    }

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const rolesResult = await rv.RunView<{
        ID: string;
        UserID: string;
        RoleID: string;
        Role: string;
    }>({
        EntityName: 'MJ: User Roles',
        ExtraFilter: `UserID='${userId}'`,
        Fields: ['ID', 'UserID', 'RoleID', 'Role'],
        ResultType: 'simple',
    });

    const hit = userDropdown.find((u) => UUIDsEqual(u.ID, userId));
    if (!hit) return null;

    const userRoles: UserRoleInfo[] = (rolesResult.Results ?? []).map(
        (r) =>
            new UserRoleInfo({
                ID: r.ID,
                UserID: r.UserID,
                RoleID: r.RoleID,
                Role: r.Role,
            })
    );

    return new UserInfo(undefined, {
        ID: hit.ID,
        Name: hit.Name,
        Email: hit.Email,
        UserRoles: userRoles,
    });
}

/**
 * Normalized, validated string filter values for the Audit Log timeline query,
 * derived from raw (untrusted) AI-agent tool params. All fields are the same
 * string shape the component's filter inputs bind to (date fields are
 * `YYYY-MM-DD` strings; empty string means "no filter on this field").
 */
export interface AuditFilterParams {
    DomainName: string;
    ChangedByUserID: string;
    StartDate: string;
    EndDate: string;
}

/**
 * Pure, framework-agnostic parser for the `RunAuditTimelineQuery` agent tool.
 *
 * 🚨 READ-ONLY: this only PARSES and VALIDATES filter input for a read-only
 * timeline query — it performs no mutation and has no side effects.
 *
 * Validates that any supplied date is a real, parseable `YYYY-MM-DD` value and
 * that `StartDate <= EndDate` when both are present. Unknown/empty fields collapse
 * to empty strings (no filter). Returns the normalized filter on success, or a
 * human-readable error string on invalid input. Never throws.
 *
 * @param raw the untrusted tool params object (may have missing/non-string fields)
 */
export function parseAuditFilterParams(
    raw: Record<string, unknown> | null | undefined
): { ok: true; value: AuditFilterParams } | { ok: false; error: string } {
    const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

    const domainName = asString(raw?.['domainName']);
    const changedByUserID = asString(raw?.['userId']);
    const startDate = asString(raw?.['startDate']);
    const endDate = asString(raw?.['endDate']);

    const startMs = validateAuditDate(startDate);
    if (startDate && startMs === null) {
        return { ok: false, error: `Invalid startDate "${startDate}". Expected a YYYY-MM-DD date.` };
    }
    const endMs = validateAuditDate(endDate);
    if (endDate && endMs === null) {
        return { ok: false, error: `Invalid endDate "${endDate}". Expected a YYYY-MM-DD date.` };
    }
    if (startMs !== null && endMs !== null && startMs > endMs) {
        return { ok: false, error: 'startDate must be on or before endDate.' };
    }

    return {
        ok: true,
        value: { DomainName: domainName, ChangedByUserID: changedByUserID, StartDate: startDate, EndDate: endDate },
    };
}

/**
 * Returns the epoch-ms for a `YYYY-MM-DD` string, or `null` if the string is
 * empty or not a valid calendar date. Used by {@link parseAuditFilterParams}.
 */
function validateAuditDate(value: string): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Bucket a flat list of {@link NormalizedPermission} into {@link PermissionsDomainGroup}s,
 * sorted by each domain's catalog DisplayOrder (falling back to alpha when the
 * engine's domain catalog doesn't know the domain).
 *
 * @param domainOrderMap map of domain name → DisplayOrder, typically built from
 *        `PermissionEngine.Instance.Domains`.
 */
export function groupPermissionsByDomain(
    rows: NormalizedPermission[],
    domainOrderMap: Map<string, number>
): PermissionsDomainGroup[] {
    const bucket = new Map<string, NormalizedPermission[]>();
    for (const row of rows) {
        const list = bucket.get(row.DomainName) ?? [];
        list.push(row);
        bucket.set(row.DomainName, list);
    }

    const groups: PermissionsDomainGroup[] = [];
    for (const [domainName, list] of bucket) {
        groups.push({
            DomainName: domainName,
            Icon: PermissionEngine.DomainIconFor(domainName),
            Count: list.length,
            Expanded: list.length <= 10,
            Rows: list.sort((a, b) => (a.ResourceName ?? '').localeCompare(b.ResourceName ?? '')),
        });
    }

    groups.sort((a, b) => (domainOrderMap.get(a.DomainName) ?? 999) - (domainOrderMap.get(b.DomainName) ?? 999));
    return groups;
}
