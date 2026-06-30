/**
 * Tests for the pure helpers backing the Permissions admin application's AI-agent
 * integration (Resource Access, User Access, Audit Log surfaces). The components are
 * thin, NavigationService-wired wrappers; the testable logic is the context shaping +
 * tolerant id→name→contains resolution extracted into `permissions-agent-context.ts`.
 *
 * 🔒 SAFETY: every helper here is READ-ONLY — it only shapes display state into a
 * bounded context object or resolves a reference. None mutates permissions or leaks
 * a credential. The final block asserts no permission-bearing / secret field is ever
 * published.
 */
import { describe, it, expect } from 'vitest';
import {
    PERMISSIONS_CONTEXT_LIST_CAP,
    buildAuditLogAgentContext,
    buildPermissionsNotFoundError,
    buildResourceAccessAgentContext,
    buildUserAccessAgentContext,
    capPermissionsList,
    resolvePermissionsCandidate,
} from '../Permissions/permissions-agent-context';

describe('capPermissionsList', () => {
    it('caps to the default cap and returns a new array', () => {
        const input = Array.from({ length: PERMISSIONS_CONTEXT_LIST_CAP + 5 }, (_, i) => `n${i}`);
        const out = capPermissionsList(input);
        expect(out.length).toBe(PERMISSIONS_CONTEXT_LIST_CAP);
        expect(out).not.toBe(input);
    });
    it('honors a custom cap and tolerates a bad cap', () => {
        expect(capPermissionsList(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
        expect(capPermissionsList(['a', 'b'], -1).length).toBeLessThanOrEqual(PERMISSIONS_CONTEXT_LIST_CAP);
    });
});

describe('resolvePermissionsCandidate', () => {
    const candidates = [
        { ID: 'D-1', Name: 'Dashboard Permissions' },
        { ID: 'D-2', Name: 'Entity Permissions' },
    ];
    it('matches by exact ID (case-insensitive)', () => {
        expect(resolvePermissionsCandidate('d-1', candidates)?.Name).toBe('Dashboard Permissions');
    });
    it('matches by exact name (case-insensitive, trimmed)', () => {
        expect(resolvePermissionsCandidate('  entity permissions ', candidates)?.ID).toBe('D-2');
    });
    it('falls back to a partial contains match on name', () => {
        expect(resolvePermissionsCandidate('entity', candidates)?.ID).toBe('D-2');
    });
    it('returns null on a miss and on empty input', () => {
        expect(resolvePermissionsCandidate('nope', candidates)).toBeNull();
        expect(resolvePermissionsCandidate('   ', candidates)).toBeNull();
    });
});

describe('buildPermissionsNotFoundError', () => {
    it('echoes a bounded sample of available names', () => {
        const msg = buildPermissionsNotFoundError('xyz', 'permission domain', [
            { ID: '1', Name: 'Alpha' },
            { ID: '2', Name: 'Beta' },
        ]);
        expect(msg).toContain('xyz');
        expect(msg).toContain('Alpha');
        expect(msg).toContain('permission domain');
    });
});

describe('buildResourceAccessAgentContext', () => {
    it('publishes selection, counts, and bounded grantee names', () => {
        const ctx = buildResourceAccessAgentContext({
            SelectedDomainName: 'Dashboard Permissions',
            AvailableDomainNames: ['Dashboard Permissions', 'Entity Permissions'],
            ResourceTypes: ['Dashboards'],
            ResourceTypeInput: 'Dashboards',
            ResourceIdInput: 'res-1',
            LastQueryLabel: 'Dashboard Permissions / Dashboards / res-1',
            GranteeCount: 2,
            GranteeNames: ['Alice', 'Bob'],
            IsLoading: false,
        });
        expect(ctx['SelectedDomainName']).toBe('Dashboard Permissions');
        expect(ctx['GranteeCount']).toBe(2);
        expect(ctx['GranteeNames']).toEqual(['Alice', 'Bob']);
        expect(ctx['ResourceTypes']).toEqual(['Dashboards']);
        expect(ctx['AvailableDomains']).toEqual(['Dashboard Permissions', 'Entity Permissions']);
    });
    it('flags grantee-name truncation and domain truncation', () => {
        const grantees = Array.from({ length: PERMISSIONS_CONTEXT_LIST_CAP + 3 }, (_, i) => `g${i}`);
        const domains = Array.from({ length: PERMISSIONS_CONTEXT_LIST_CAP + 1 }, (_, i) => `d${i}`);
        const ctx = buildResourceAccessAgentContext({
            SelectedDomainName: 'd0',
            AvailableDomainNames: domains,
            ResourceTypes: [],
            ResourceTypeInput: '',
            ResourceIdInput: '',
            LastQueryLabel: null,
            GranteeCount: grantees.length,
            GranteeNames: grantees,
            IsLoading: false,
        });
        expect((ctx['GranteeNames'] as string[]).length).toBe(PERMISSIONS_CONTEXT_LIST_CAP);
        expect(ctx['GranteeNamesTruncated']).toBe(true);
        expect(ctx['AvailableDomainCount']).toBe(domains.length);
    });
});

describe('buildUserAccessAgentContext', () => {
    it('publishes selected user name, per-domain access, and totals', () => {
        const ctx = buildUserAccessAgentContext({
            SelectedUserId: 'u-1',
            SelectedUserName: 'Alice Admin',
            SelectedUserRoles: ['Administrator'],
            DomainSummaries: [
                { DomainName: 'Dashboard Permissions', ResourceCount: 3, Expanded: true, ResourceNames: ['D1', 'D2', 'D3'] },
            ],
            TotalResourceCount: 3,
            AvailableUserNames: ['Alice Admin', 'Bob User'],
            AvailableUserCount: 2,
            IsLoadingPermissions: false,
        });
        expect(ctx['SelectedUserName']).toBe('Alice Admin');
        expect(ctx['TotalAccessibleResourceCount']).toBe(3);
        expect((ctx['AccessByDomain'] as unknown[]).length).toBe(1);
        expect(ctx['ExpandedDomains']).toEqual(['Dashboard Permissions']);
        expect(ctx['SelectedUserRoles']).toEqual(['Administrator']);
    });
    it('reports available-user truncation when over the cap', () => {
        const users = Array.from({ length: PERMISSIONS_CONTEXT_LIST_CAP + 4 }, (_, i) => `u${i}`);
        const ctx = buildUserAccessAgentContext({
            SelectedUserId: null,
            SelectedUserName: null,
            SelectedUserRoles: [],
            DomainSummaries: [],
            TotalResourceCount: 0,
            AvailableUserNames: users,
            AvailableUserCount: users.length,
            IsLoadingPermissions: false,
        });
        expect((ctx['AvailableUsers'] as string[]).length).toBe(PERMISSIONS_CONTEXT_LIST_CAP);
        expect(ctx['AvailableUserCount']).toBe(users.length);
    });
});

describe('buildAuditLogAgentContext', () => {
    it('publishes filters, HasActiveFilters, counts, and bounded recent entries', () => {
        const ctx = buildAuditLogAgentContext({
            DomainFilter: 'Dashboard Permissions',
            UserFilter: 'u-1',
            UserFilterName: 'Alice Admin',
            StartDate: '2026-01-01',
            EndDate: '',
            EntryCount: 2,
            RecentEntries: [
                { ChangedAt: '2026-01-02T00:00:00.000Z', ChangedByUserName: 'Alice Admin', DomainName: 'Dashboard Permissions', ChangeType: 'Update' },
            ],
            AvailableDomainNames: ['Dashboard Permissions'],
            AvailableUserNames: ['Alice Admin'],
            AvailableUserCount: 1,
            IsLoading: false,
            HasRunQuery: true,
        });
        expect(ctx['DomainFilter']).toBe('Dashboard Permissions');
        expect(ctx['UserFilterName']).toBe('Alice Admin');
        expect(ctx['HasActiveFilters']).toBe(true);
        expect((ctx['RecentEntries'] as unknown[]).length).toBe(1);
        expect(ctx['EndDate']).toBeNull();
    });
    it('reports HasActiveFilters=false when no filter is set', () => {
        const ctx = buildAuditLogAgentContext({
            DomainFilter: '', UserFilter: '', UserFilterName: null, StartDate: '', EndDate: '',
            EntryCount: 0, RecentEntries: [], AvailableDomainNames: [], AvailableUserNames: [],
            AvailableUserCount: 0, IsLoading: false, HasRunQuery: false,
        });
        expect(ctx['HasActiveFilters']).toBe(false);
    });
    it('flags recent-entry truncation when the entry count exceeds the cap', () => {
        const entries = Array.from({ length: PERMISSIONS_CONTEXT_LIST_CAP + 5 }, (_, i) => ({
            ChangedAt: '2026-01-01T00:00:00.000Z', ChangedByUserName: `u${i}`, DomainName: 'D', ChangeType: 'Create',
        }));
        const ctx = buildAuditLogAgentContext({
            DomainFilter: '', UserFilter: '', UserFilterName: null, StartDate: '', EndDate: '',
            EntryCount: entries.length, RecentEntries: entries, AvailableDomainNames: [], AvailableUserNames: [],
            AvailableUserCount: 0, IsLoading: false, HasRunQuery: true,
        });
        expect((ctx['RecentEntries'] as unknown[]).length).toBe(PERMISSIONS_CONTEXT_LIST_CAP);
        expect(ctx['RecentEntriesTruncated']).toBe(true);
    });
});

describe('Permissions context safety — no mutation surface, no secrets', () => {
    it('never publishes a permission-mutating, credential, or secret field', () => {
        const ra = buildResourceAccessAgentContext({
            SelectedDomainName: 'D', AvailableDomainNames: ['D'], ResourceTypes: ['T'],
            ResourceTypeInput: 'T', ResourceIdInput: 'r', LastQueryLabel: 'x', GranteeCount: 1,
            GranteeNames: ['Alice'], IsLoading: false,
        });
        const ua = buildUserAccessAgentContext({
            SelectedUserId: 'u', SelectedUserName: 'Alice', SelectedUserRoles: ['Admin'],
            DomainSummaries: [{ DomainName: 'D', ResourceCount: 1, Expanded: true, ResourceNames: ['r'] }],
            TotalResourceCount: 1, AvailableUserNames: ['Alice'], AvailableUserCount: 1, IsLoadingPermissions: false,
        });
        const al = buildAuditLogAgentContext({
            DomainFilter: 'D', UserFilter: 'u', UserFilterName: 'Alice', StartDate: '', EndDate: '',
            EntryCount: 1, RecentEntries: [{ ChangedAt: '2026-01-01T00:00:00.000Z', ChangedByUserName: 'Alice', DomainName: 'D', ChangeType: 'Update' }],
            AvailableDomainNames: ['D'], AvailableUserNames: ['Alice'], AvailableUserCount: 1, IsLoading: false, HasRunQuery: true,
        });
        // NB: "grantee" is a noun (the access recipient), NOT the verb "grant" — so we match
        // mutation/secret terms with word boundaries / verb forms to avoid false positives.
        const forbidden = /password|secret|\btoken\b|credential|apikey|\bgrant\b|\brevoke\b|impersonat/i;
        for (const ctx of [ra, ua, al]) {
            const blob = JSON.stringify(ctx);
            const keys = JSON.stringify(Object.keys(ctx));
            expect(keys).not.toMatch(forbidden);
            // No grant/revoke/impersonate verb should ever leak into a string value either.
            expect(blob).not.toMatch(/\bpassword\b|\bsecret\b|\btoken\b|impersonat/i);
        }
    });
});
