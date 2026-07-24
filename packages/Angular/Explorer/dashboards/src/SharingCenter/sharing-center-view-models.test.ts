import { describe, expect, it } from 'vitest';
import { NormalizedPermission, PermissionAuditEntry } from '@memberjunction/core';

import { PermissionsDomainGroup } from '../Permissions/permissions-shared';
import {
    countSharingCenterExpiringSoon,
    filterSharingCenterActivityEntries,
    filterSharingCenterPermissionGroups,
    getSharingCenterAccessSource,
    getSharingCenterAccessSourceLabel,
} from './sharing-center-view-models';

function permission(overrides: Partial<NormalizedPermission> = {}): NormalizedPermission {
    return {
        DomainName: 'Dashboard Permissions',
        ResourceType: 'Dashboards',
        ResourceID: 'dashboard-1',
        ResourceName: 'Sales Dashboard',
        GranteeType: 'User',
        GranteeID: 'user-1',
        GranteeName: 'Taylor',
        Actions: ['Read'],
        Effect: 'Allow',
        SourceRecordID: 'permission-1',
        ...overrides,
    };
}

function group(overrides: Partial<PermissionsDomainGroup> = {}): PermissionsDomainGroup {
    return {
        DomainName: 'Dashboard Permissions',
        Icon: 'fa-solid fa-chart-line',
        Count: 1,
        Expanded: true,
        Rows: [permission()],
        ...overrides,
    };
}

function activity(overrides: Partial<PermissionAuditEntry> = {}): PermissionAuditEntry {
    return {
        ChangedAt: new Date('2026-07-24T12:00:00.000Z'),
        ChangedByUserID: 'user-1',
        ChangedByUserName: 'Taylor',
        DomainName: 'Dashboard Permissions',
        EntityName: 'MJ: Dashboard Permissions',
        RecordID: 'permission-1',
        ChangeType: 'Create',
        Summary: 'Granted read access to Sales Dashboard',
        SourceRecordChangeID: 'change-1',
        ...overrides,
    };
}

describe('sharing-center-view-models', () => {
    it('derives only evidence-backed access-source labels', () => {
        expect(getSharingCenterAccessSource(permission())).toBe('Direct');
        expect(getSharingCenterAccessSource(permission({ GranteeType: 'Role' }))).toBe('Role');
        expect(getSharingCenterAccessSource(permission({ GranteeType: 'Everyone', GranteeID: null }))).toBe('Public');
        expect(
            getSharingCenterAccessSource(
                permission({
                    SourceRecordID: undefined,
                    Actions: ['Read', 'Update', 'Delete', 'Share'],
                })
            )
        ).toBe('Owner');
        expect(getSharingCenterAccessSourceLabel('Public')).toBe('Public / Everyone');
    });

    it('filters access groups by shared search and exact domain without changing the source group', () => {
        const groups = [
            group({
                Rows: [permission(), permission({ ResourceID: 'dashboard-2', ResourceName: 'Executive Overview' })],
                Count: 2,
            }),
            group({
                DomainName: 'Query Permissions',
                Rows: [permission({ DomainName: 'Query Permissions', ResourceName: 'Pipeline Query' })],
            }),
        ];

        const filtered = filterSharingCenterPermissionGroups(groups, 'executive', 'Dashboard Permissions');

        expect(filtered).toHaveLength(1);
        expect(filtered[0].Rows).toHaveLength(1);
        expect(filtered[0].Rows[0].ResourceName).toBe('Executive Overview');
        expect(filtered[0].Count).toBe(1);
        expect(groups[0].Rows).toHaveLength(2);
        expect(groups[0].Count).toBe(2);
    });

    it('filters activity entries by the same domain and search criteria', () => {
        const entries = [
            activity(),
            activity({
                DomainName: 'Query Permissions',
                EntityName: 'MJ: Query Permissions',
                ChangeType: 'Delete',
                Summary: 'Revoked execute access',
                SourceRecordChangeID: 'change-2',
            }),
        ];

        expect(filterSharingCenterActivityEntries(entries, 'revoked', '')).toEqual([entries[1]]);
        expect(filterSharingCenterActivityEntries(entries, '', 'Dashboard Permissions')).toEqual([entries[0]]);
    });

    it('counts only future grants expiring within thirty days', () => {
        const now = new Date('2026-07-24T00:00:00.000Z');
        const rows = [
            permission({ ExpiresAt: new Date('2026-07-25T00:00:00.000Z') }),
            permission({ ResourceID: '2', ExpiresAt: new Date('2026-08-23T00:00:00.000Z') }),
            permission({ ResourceID: '3', ExpiresAt: new Date('2026-08-24T00:00:00.000Z') }),
            permission({ ResourceID: '4', ExpiresAt: new Date('2026-07-23T00:00:00.000Z') }),
        ];

        expect(countSharingCenterExpiringSoon(rows, now)).toBe(2);
    });
});
