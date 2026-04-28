import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
            !!a && !!b && a.toLowerCase() === b.toLowerCase(),
        MJGlobal: {
            Instance: {
                GetGlobalObjectStore: () => ({}),
                ClassFactory: { CreateInstance: vi.fn(() => null) },
            },
        },
    };
});

vi.mock('@memberjunction/core', async () => {
    const { buildPermissionProviderBase } = await import('./_mockPermissionProviderBase');
    class MockRunView { async RunView() { return { Success: true, Results: [] }; } }
    return {
        PermissionProviderBase: buildPermissionProviderBase(MockRunView as any),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class {},
        RunView: MockRunView,
        Metadata: class {},
        BaseEngine: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
    };
});

// Stub the DashboardEngine module — we drive the cache via the test fixture below.
const dashboardEngineState = {
    Dashboards: [] as Array<{ ID: string; UserID?: string | null; User?: string | null; Name?: string | null }>,
    DashboardPermissions: [] as Array<{
        ID: string;
        DashboardID: string;
        UserID: string;
        User?: string | null;
        SharedByUserID?: string | null;
        CanRead: boolean;
        CanEdit: boolean;
        CanDelete: boolean;
        CanShare: boolean;
    }>,
    perms: new Map<string, {
        DashboardID: string;
        CanRead: boolean;
        CanEdit: boolean;
        CanDelete: boolean;
        CanShare: boolean;
        IsOwner: boolean;
        PermissionSource: 'owner' | 'direct' | 'category' | 'none';
    }>(),
};

vi.mock('../../engines/dashboards', () => {
    return {
        DashboardEngine: {
            get Instance() {
                return {
                    get Dashboards() { return dashboardEngineState.Dashboards; },
                    get DashboardPermissions() { return dashboardEngineState.DashboardPermissions; },
                    GetDashboardPermissions: (dashboardId: string, userId: string) => {
                        const key = `${dashboardId}|${userId}`;
                        return (
                            dashboardEngineState.perms.get(key) ?? {
                                DashboardID: dashboardId,
                                CanRead: false,
                                CanEdit: false,
                                CanDelete: false,
                                CanShare: false,
                                IsOwner: false,
                                PermissionSource: 'none' as const,
                            }
                        );
                    },
                };
            },
        },
    };
});

// ---------------------------------------------------------------------------

import { DashboardPermissionProvider } from '../../custom/PermissionProviders/DashboardPermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = { ID: 'AAA', Name: 'User A', UserRoles: [] } as unknown as UserInfo;
const USER_B = { ID: 'BBB', Name: 'User B', UserRoles: [] } as unknown as UserInfo;

function resetEngineState() {
    dashboardEngineState.Dashboards = [];
    dashboardEngineState.DashboardPermissions = [];
    dashboardEngineState.perms = new Map();
}

describe('DashboardPermissionProvider', () => {
    let provider: DashboardPermissionProvider;
    beforeEach(() => {
        resetEngineState();
        provider = new DashboardPermissionProvider();
    });

    describe('CheckPermission', () => {
        it('returns Allowed=false when no resourceId is given', async () => {
            const result = await provider.CheckPermission(USER_A, 'Dashboards', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('require a specific dashboard ID');
        });

        it('returns Allowed=true when the engine reports the action is granted', async () => {
            dashboardEngineState.perms.set('D1|AAA', {
                DashboardID: 'D1',
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                IsOwner: false,
                PermissionSource: 'direct',
            });
            const result = await provider.CheckPermission(USER_A, 'Dashboards', 'D1', 'Read');
            expect(result.Allowed).toBe(true);
            expect(result.Reason).toContain('direct');
        });

        it('returns Allowed=false when the engine reports no permission', async () => {
            const result = await provider.CheckPermission(USER_A, 'Dashboards', 'D1', 'Share');
            expect(result.Allowed).toBe(false);
        });
    });

    describe('GetPermissionsSharedWithUser', () => {
        it('returns rows where grantee is direct user and not the owner/grantor', async () => {
            dashboardEngineState.Dashboards = [
                { ID: 'D1', UserID: 'AAA', Name: 'A-Dashboard' }, // owned by A
                { ID: 'D2', UserID: 'CCC', Name: 'C-Dashboard' }, // owned by someone else
            ];
            dashboardEngineState.DashboardPermissions = [
                // B is direct grantee, A is grantor — should appear
                { ID: 'P1', DashboardID: 'D2', UserID: 'BBB', SharedByUserID: 'AAA',
                  CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                // B owns D-self ⇒ excluded (own dashboard)
                { ID: 'P2', DashboardID: 'D1', UserID: 'BBB', SharedByUserID: null,
                  CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
                // B granted themselves ⇒ excluded
                { ID: 'P3', DashboardID: 'D2', UserID: 'BBB', SharedByUserID: 'BBB',
                  CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
            ];
            // BBB owns D1 (matches Dashboards[0] — but UserID points to AAA so BBB doesn't own).
            // Adjust: make sure ownership rule actually triggers.
            dashboardEngineState.Dashboards[0] = { ID: 'D1', UserID: 'BBB', Name: 'B-Dashboard' };

            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toHaveLength(1);
            expect(result[0].ResourceID).toBe('D2');
            expect(result[0].GranteeID).toBe('BBB');
            expect(result[0].SourceRecordID).toBe('P1');
        });

        it('returns empty when grantee has no shared rows', async () => {
            dashboardEngineState.Dashboards = [];
            dashboardEngineState.DashboardPermissions = [];
            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toEqual([]);
        });
    });

    describe('GetPermissionsGrantedByUser', () => {
        it('includes explicit grants where SharedByUserID === grantor', async () => {
            dashboardEngineState.Dashboards = [
                { ID: 'D1', UserID: 'XXX', Name: 'D1' },
            ];
            dashboardEngineState.DashboardPermissions = [
                { ID: 'P1', DashboardID: 'D1', UserID: 'BBB', User: 'User B', SharedByUserID: 'AAA',
                  CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
            ];
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(1);
            expect(result[0].SourceRecordID).toBe('P1');
            expect(result[0].Actions).toContain('Read');
            expect(result[0].Actions).toContain('Update');
        });

        it('includes implicit owner-shares (SharedByUserID NULL on dashboards owned by grantor)', async () => {
            dashboardEngineState.Dashboards = [
                { ID: 'D1', UserID: 'AAA', Name: 'A-Dashboard' }, // A owns it
            ];
            dashboardEngineState.DashboardPermissions = [
                { ID: 'P-implicit', DashboardID: 'D1', UserID: 'BBB', User: 'User B', SharedByUserID: null,
                  CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
            ];
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(1);
            expect(result[0].SourceRecordID).toBe('P-implicit');
        });

        it('excludes self-grants (grantor === grantee)', async () => {
            dashboardEngineState.Dashboards = [{ ID: 'D1', UserID: 'XXX', Name: 'D1' }];
            dashboardEngineState.DashboardPermissions = [
                { ID: 'P1', DashboardID: 'D1', UserID: 'AAA', SharedByUserID: 'AAA',
                  CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
            ];
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });

        it('excludes implicit shares on dashboards the grantor does NOT own', async () => {
            dashboardEngineState.Dashboards = [
                { ID: 'D1', UserID: 'CCC', Name: 'C-Dashboard' }, // C owns, not A
            ];
            dashboardEngineState.DashboardPermissions = [
                { ID: 'P1', DashboardID: 'D1', UserID: 'BBB', SharedByUserID: null,
                  CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
            ];
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
    });
});
