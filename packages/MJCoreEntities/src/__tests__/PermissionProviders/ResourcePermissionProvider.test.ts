import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
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

const metadataState = {
    Roles: [] as Array<{ ID: string; Name: string }>,
};

vi.mock('@memberjunction/core', async () => {
    const { buildPermissionProviderBase } = await import('./_mockPermissionProviderBase');
    class MockRunView { async RunView() { return { Success: true, Results: [] }; } }
    return {
        PermissionProviderBase: buildPermissionProviderBase(MockRunView as any),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class {},
        RunView: MockRunView,
        BaseEngine: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: class { get Roles() { return metadataState.Roles; } },
    };
});

// Drive the ResourcePermissionEngine through a state object so tests can program
// its getters + per-user permission-level lookup.
interface PermRow {
    ID: string;
    ResourceTypeID: string;
    ResourceRecordID: string;
    Type: 'Role' | 'User';
    UserID?: string | null;
    User?: string | null;
    RoleID?: string | null;
    SharedByUserID?: string | null;
    PermissionLevel: 'View' | 'Edit' | 'Owner' | null;
    Status: 'Approved' | 'Rejected' | 'Requested' | 'Revoked';
    EndSharingAt?: Date | null;
}

const engineState = {
    ResourceTypes: [] as Array<{ ID: string; Name: string }>,
    Permissions: [] as PermRow[],
    /** Per-user permission level as a Map keyed by "rtId|recId|userId" → level. */
    levels: new Map<string, 'View' | 'Edit' | 'Owner' | null>(),
};

vi.mock('../../custom/ResourcePermissions/ResourcePermissionEngine', () => {
    return {
        ResourcePermissionEngine: {
            get Instance() {
                return {
                    get ResourceTypes() { return engineState.ResourceTypes; },
                    get Permissions() { return engineState.Permissions; },
                    GetUserResourcePermissionLevel: (rtId: string, recId: string, user: { ID: string }) =>
                        engineState.levels.get(`${rtId}|${recId}|${user.ID}`) ?? null,
                    GetUserAvailableResources: (user: { ID: string }, rtId?: string) =>
                        engineState.Permissions.filter((p) =>
                            p.Type === 'User' &&
                            p.UserID === user.ID &&
                            (!rtId || p.ResourceTypeID === rtId) &&
                            p.Status === 'Approved'
                        ),
                    GetResourcePermissions: (rtId: string, recId: string) =>
                        engineState.Permissions.filter((p) =>
                            p.ResourceTypeID === rtId && p.ResourceRecordID === recId
                        ),
                };
            },
        },
    };
});

// ---------------------------------------------------------------------------

import { ResourcePermissionProvider } from '../../custom/PermissionProviders/ResourcePermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = { ID: 'AAA', Name: 'User A', UserRoles: [] } as unknown as UserInfo;

function resetEngineState() {
    engineState.ResourceTypes = [];
    engineState.Permissions = [];
    engineState.levels = new Map();
    metadataState.Roles = [];
}

describe('ResourcePermissionProvider', () => {
    let provider: ResourcePermissionProvider;
    beforeEach(() => {
        resetEngineState();
        provider = new ResourcePermissionProvider();
    });

    describe('CheckPermission', () => {
        it('returns Allowed=false when resourceId is missing', async () => {
            const result = await provider.CheckPermission(USER_A, 'User Views', null, 'Read');
            expect(result.Allowed).toBe(false);
        });

        it('returns Allowed=false when the resource type is unknown', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            const result = await provider.CheckPermission(USER_A, 'Unknown Type', 'R1', 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain("Unknown resource type");
        });

        it('maps Owner to the full action set', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            engineState.levels.set('RT-UV|R1|AAA', 'Owner');
            const admin = await provider.CheckPermission(USER_A, 'User Views', 'R1', 'Admin');
            const share = await provider.CheckPermission(USER_A, 'User Views', 'R1', 'Share');
            expect(admin.Allowed).toBe(true);
            expect(share.Allowed).toBe(true);
        });

        it('maps View to Read-only', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            engineState.levels.set('RT-UV|R1|AAA', 'View');
            const read = await provider.CheckPermission(USER_A, 'User Views', 'R1', 'Read');
            const update = await provider.CheckPermission(USER_A, 'User Views', 'R1', 'Update');
            expect(read.Allowed).toBe(true);
            expect(update.Allowed).toBe(false);
        });

        it('returns Allowed=false with a helpful reason when no level is found', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            const result = await provider.CheckPermission(USER_A, 'User Views', 'R1', 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('No resource permission');
        });
    });

    describe('GetEffectivePermissions', () => {
        it('surfaces the permission level as a NormalizedPermission', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            engineState.levels.set('RT-UV|R1|AAA', 'Edit');
            const result = await provider.GetEffectivePermissions(USER_A, 'User Views', 'R1');
            expect(result).toHaveLength(1);
            expect(result[0].Actions.sort()).toEqual(['Read', 'Update']);
        });

        it('returns empty when there is no level', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            const result = await provider.GetEffectivePermissions(USER_A, 'User Views', 'R1');
            expect(result).toEqual([]);
        });
    });

    describe('GetUserResources', () => {
        it('returns Approved User rows the user has access to', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            engineState.Permissions = [
                { ID: 'RP1', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R1', Type: 'User', UserID: 'AAA',
                    PermissionLevel: 'View', Status: 'Approved' },
                { ID: 'RP2', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R2', Type: 'User', UserID: 'AAA',
                    PermissionLevel: null, Status: 'Approved' }, // no actions → dropped
            ];
            const result = await provider.GetUserResources(USER_A);
            expect(result).toHaveLength(1);
            expect(result[0].ResourceID).toBe('R1');
        });

        it('filters to a requested resource type', async () => {
            engineState.ResourceTypes = [
                { ID: 'RT-UV', Name: 'User Views' },
                { ID: 'RT-RP', Name: 'Reports' },
            ];
            engineState.Permissions = [
                { ID: 'RP1', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R1', Type: 'User', UserID: 'AAA',
                    PermissionLevel: 'View', Status: 'Approved' },
                { ID: 'RP2', ResourceTypeID: 'RT-RP', ResourceRecordID: 'R2', Type: 'User', UserID: 'AAA',
                    PermissionLevel: 'Edit', Status: 'Approved' },
            ];
            const result = await provider.GetUserResources(USER_A, 'Reports');
            expect(result).toHaveLength(1);
            expect(result[0].ResourceType).toBe('Reports');
        });

        it('returns empty when resource type is unknown', async () => {
            const result = await provider.GetUserResources(USER_A, 'Phantom Type');
            expect(result).toEqual([]);
        });
    });

    describe('GetResourcePermissions', () => {
        it('resolves role names via Metadata.Roles and returns mixed grantees', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            engineState.Permissions = [
                { ID: 'RP1', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R1', Type: 'User', UserID: 'U1',
                    PermissionLevel: 'View', Status: 'Approved' },
                { ID: 'RP2', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R1', Type: 'Role', RoleID: 'ROLE-UI',
                    PermissionLevel: 'Edit', Status: 'Approved' },
            ];
            metadataState.Roles = [{ ID: 'ROLE-UI', Name: 'UI User' }];
            const result = await provider.GetResourcePermissions('User Views', 'R1');
            expect(result).toHaveLength(2);
            const role = result.find((r) => r.GranteeType === 'Role')!;
            expect(role.GranteeName).toBe('UI User');
            expect(role.Actions.sort()).toEqual(['Read', 'Update']);
        });
    });

    describe('GetPermissionsGrantedByUser (SharedByUserID-backed)', () => {
        it('returns direct Approved User grants where SharedByUserID is the grantor', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-UV', Name: 'User Views' }];
            engineState.Permissions = [
                { ID: 'RP1', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R1', Type: 'User', UserID: 'BBB', User: 'User B',
                    SharedByUserID: 'AAA', PermissionLevel: 'View', Status: 'Approved' },
                // wrong grantor — excluded
                { ID: 'RP2', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R2', Type: 'User', UserID: 'BBB',
                    SharedByUserID: 'CCC', PermissionLevel: 'View', Status: 'Approved' },
                // Requested status — excluded
                { ID: 'RP3', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R3', Type: 'User', UserID: 'BBB',
                    SharedByUserID: 'AAA', PermissionLevel: 'View', Status: 'Requested' },
                // Role type — excluded
                { ID: 'RP4', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R4', Type: 'Role', RoleID: 'ROLE-X',
                    SharedByUserID: 'AAA', PermissionLevel: 'View', Status: 'Approved' },
                // self-grant — excluded
                { ID: 'RP5', ResourceTypeID: 'RT-UV', ResourceRecordID: 'R5', Type: 'User', UserID: 'AAA',
                    SharedByUserID: 'AAA', PermissionLevel: 'Owner', Status: 'Approved' },
            ];
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(1);
            expect(result[0].SourceRecordID).toBe('RP1');
            expect(result[0].GranteeID).toBe('BBB');
            expect(result[0].GranteeName).toBe('User B');
            expect(result[0].ResourceType).toBe('User Views');
        });

        it('returns empty when the grantor has granted nothing', async () => {
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
    });

    describe('GetPermissionsSharedWithUser (SharedByUserID-backed)', () => {
        it('returns direct Approved User grants where the user is the grantee and someone else is the grantor', async () => {
            engineState.ResourceTypes = [{ ID: 'RT-CV', Name: 'Conversations' }];
            engineState.Permissions = [
                // current user is grantee, someone else is grantor — included
                { ID: 'RP1', ResourceTypeID: 'RT-CV', ResourceRecordID: 'C1', Type: 'User', UserID: 'AAA', User: 'User A',
                    SharedByUserID: 'BBB', PermissionLevel: 'View', Status: 'Approved' },
                // current user is the grantor, not the grantee — excluded
                { ID: 'RP2', ResourceTypeID: 'RT-CV', ResourceRecordID: 'C2', Type: 'User', UserID: 'CCC',
                    SharedByUserID: 'AAA', PermissionLevel: 'View', Status: 'Approved' },
                // self-grant (grantor === grantee) — excluded
                { ID: 'RP3', ResourceTypeID: 'RT-CV', ResourceRecordID: 'C3', Type: 'User', UserID: 'AAA',
                    SharedByUserID: 'AAA', PermissionLevel: 'Owner', Status: 'Approved' },
                // missing SharedByUserID — excluded (legacy/role-only)
                { ID: 'RP4', ResourceTypeID: 'RT-CV', ResourceRecordID: 'C4', Type: 'User', UserID: 'AAA',
                    SharedByUserID: null, PermissionLevel: 'View', Status: 'Approved' },
                // Requested status — excluded
                { ID: 'RP5', ResourceTypeID: 'RT-CV', ResourceRecordID: 'C5', Type: 'User', UserID: 'AAA',
                    SharedByUserID: 'BBB', PermissionLevel: 'View', Status: 'Requested' },
                // Role grant — excluded (role-inherited access doesn't belong in personal "Shared with me")
                { ID: 'RP6', ResourceTypeID: 'RT-CV', ResourceRecordID: 'C6', Type: 'Role', RoleID: 'ROLE-X',
                    SharedByUserID: 'BBB', PermissionLevel: 'View', Status: 'Approved' },
            ];
            const result = await provider.GetPermissionsSharedWithUser(USER_A);
            expect(result).toHaveLength(1);
            expect(result[0].SourceRecordID).toBe('RP1');
            expect(result[0].GranteeID).toBe('AAA');
            expect(result[0].ResourceType).toBe('Conversations');
            expect(result[0].ResourceID).toBe('C1');
            expect(result[0].Actions).toEqual(['Read']);
        });

        it('returns empty when nothing has been shared with the user', async () => {
            const result = await provider.GetPermissionsSharedWithUser(USER_A);
            expect(result).toEqual([]);
        });
    });

    describe('GetResourceTypes', () => {
        it('lists the catalog resource type names, sorted', async () => {
            engineState.ResourceTypes = [
                { ID: 'RT-B', Name: 'User Views' },
                { ID: 'RT-A', Name: 'Reports' },
            ];
            expect(provider.GetResourceTypes()).toEqual(['Reports', 'User Views']);
        });
    });
});
