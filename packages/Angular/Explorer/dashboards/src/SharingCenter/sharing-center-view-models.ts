import { NormalizedPermission, PermissionAction, PermissionAuditEntry } from '@memberjunction/core';

import { PermissionsDomainGroup } from '../Permissions/permissions-shared';

/** Source labels shown by the read-only My Access report. */
export type SharingCenterAccessSource = 'Owner' | 'Direct' | 'Role' | 'Public';

const OWNER_ACTIONS: PermissionAction[] = ['Read', 'Update', 'Delete', 'Share'];

/**
 * Derive the best available explanation for an effective permission. The
 * normalized contract does not yet expose a dedicated provenance field, so a
 * user-grantee row is only called Owner when it is a synthetic full-access row
 * with no backing permission record. All other user rows are accurately shown
 * as Direct rather than implying ownership.
 */
export function getSharingCenterAccessSource(row: NormalizedPermission): SharingCenterAccessSource {
    switch (row.GranteeType) {
        case 'Role':
            return 'Role';
        case 'Everyone':
        case 'Public':
            return 'Public';
        case 'User':
            return isSyntheticOwnerPermission(row) ? 'Owner' : 'Direct';
    }
}

/** Human-readable source label used by the access badge. */
export function getSharingCenterAccessSourceLabel(source: SharingCenterAccessSource): string {
    return source === 'Public' ? 'Public / Everyone' : source;
}

/** Filter domain groups without mutating the permission data or expansion state. */
export function filterSharingCenterPermissionGroups(
    groups: PermissionsDomainGroup[],
    searchTerm: string,
    domainFilter: string
): PermissionsDomainGroup[] {
    const normalizedSearch = normalizeSearch(searchTerm);
    const normalizedDomain = normalizeSearch(domainFilter);
    if (!normalizedSearch && !normalizedDomain) {
        return groups;
    }

    const filtered: PermissionsDomainGroup[] = [];
    for (const group of groups) {
        if (normalizedDomain && normalizeSearch(group.DomainName) !== normalizedDomain) {
            continue;
        }

        const rows = group.Rows.filter((row) => matchesPermission(row, normalizedSearch));
        if (rows.length > 0) {
            filtered.push({ ...group, Rows: rows, Count: rows.length });
        }
    }
    return filtered;
}

/** Filter timeline entries with the dashboard's shared search and domain state. */
export function filterSharingCenterActivityEntries(
    entries: PermissionAuditEntry[],
    searchTerm: string,
    domainFilter: string
): PermissionAuditEntry[] {
    const normalizedSearch = normalizeSearch(searchTerm);
    const normalizedDomain = normalizeSearch(domainFilter);
    return entries.filter((entry) => {
        if (normalizedDomain && normalizeSearch(entry.DomainName) !== normalizedDomain) {
            return false;
        }
        if (!normalizedSearch) {
            return true;
        }
        return [
            entry.ChangedByUserName,
            entry.ChangedByUserID,
            entry.DomainName,
            entry.EntityName,
            entry.RecordID,
            entry.ChangeType,
            entry.Summary,
        ].some((value) => normalizeSearch(value ?? '').includes(normalizedSearch));
    });
}

/** Count grants that will expire between now and the next thirty days. */
export function countSharingCenterExpiringSoon(rows: NormalizedPermission[], now: Date): number {
    const nowTime = now.getTime();
    const threshold = nowTime + 30 * 24 * 60 * 60 * 1000;
    return rows.filter((row) => {
        if (!row.ExpiresAt) {
            return false;
        }
        const expiresAt = row.ExpiresAt.getTime();
        return expiresAt >= nowTime && expiresAt <= threshold;
    }).length;
}

function isSyntheticOwnerPermission(row: NormalizedPermission): boolean {
    return !row.SourceRecordID && OWNER_ACTIONS.every((action) => row.Actions.includes(action));
}

function matchesPermission(row: NormalizedPermission, normalizedSearch: string): boolean {
    if (!normalizedSearch) {
        return true;
    }
    return [
        row.DomainName,
        row.ResourceName,
        row.ResourceID,
        row.ResourceType,
        row.GranteeName,
        row.GranteeID,
        row.GranteeType,
        row.Actions.join(' '),
        row.Effect,
    ].some((value) => normalizeSearch(value ?? '').includes(normalizedSearch));
}

function normalizeSearch(value: string): string {
    return value.trim().toLocaleLowerCase();
}
