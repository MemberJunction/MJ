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
    Applications: [] as Array<{ ID: string; Name: string }>,
};

const userInfoEngineState = {
    ApplicationRoles: [] as Array<{
        ID: string;
        ApplicationID: string;
        RoleID: string;
        Role?: string | null;
        CanAccess: boolean;
        CanAdmin: boolean;
    }>,
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
        Metadata: class {
            get Applications() { return metadataState.Applications; }
        },
    };
});

vi.mock('../../engines/UserInfoEngine', () => {
    return {
        UserInfoEngine: {
            get Instance() {
                return {
                    get ApplicationRoles() { return userInfoEngineState.ApplicationRoles; },
                };
            },
        },
    };
});

// ---------------------------------------------------------------------------

import { ApplicationRolePermissionProvider } from '../../custom/PermissionProviders/ApplicationRolePermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_WITH_UI = { ID: 'UUU', Name: 'UI User', UserRoles: [{ RoleID: 'ROLE-UI' }] } as unknown as UserInfo;
const USER_WITH_ADMIN = { ID: 'AAA', Name: 'Admin User', UserRoles: [{ RoleID: 'ROLE-ADMIN' }] } as unknown as UserInfo;
const USER_NO_ROLES = { ID: 'NNN', Name: 'Roleless', UserRoles: [] } as unknown as UserInfo;

function resetState() {
    metadataState.Applications = [];
    userInfoEngineState.ApplicationRoles = [];
}

describe('ApplicationRolePermissionProvider', () => {
    let provider: ApplicationRolePermissionProvider;
    beforeEach(() => {
        resetState();
        provider = new ApplicationRolePermissionProvider();
    });

    describe('CheckPermission', () => {
        it('rejects non-Applications resource types', async () => {
            const result = await provider.CheckPermission(USER_WITH_UI, 'Dashboards', 'APP1', 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain("Unsupported resource type");
        });

        it('returns Allowed=false when no resourceId is given', async () => {
            const result = await provider.CheckPermission(USER_WITH_UI, 'Applications', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('specific application ID');
        });

        it('grants Read on open-access apps (no ApplicationRole rows)', async () => {
            metadataState.Applications = [{ ID: 'APP1', Name: 'Open App' }];
            const result = await provider.CheckPermission(USER_WITH_UI, 'Applications', 'APP1', 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('denies Admin on open-access apps', async () => {
            metadataState.Applications = [{ ID: 'APP1', Name: 'Open App' }];
            const result = await provider.CheckPermission(USER_WITH_UI, 'Applications', 'APP1', 'Admin');
            expect(result.Allowed).toBe(false);
        });

        it('grants Read when user holds a role with CanAccess', async () => {
            userInfoEngineState.ApplicationRoles = [
                { ID: 'AR1', ApplicationID: 'APP1', RoleID: 'ROLE-UI', CanAccess: true, CanAdmin: false },
            ];
            const result = await provider.CheckPermission(USER_WITH_UI, 'Applications', 'APP1', 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('grants Admin when user holds a role with CanAdmin', async () => {
            userInfoEngineState.ApplicationRoles = [
                { ID: 'AR1', ApplicationID: 'APP1', RoleID: 'ROLE-ADMIN', CanAccess: true, CanAdmin: true },
            ];
            const result = await provider.CheckPermission(USER_WITH_ADMIN, 'Applications', 'APP1', 'Admin');
            expect(result.Allowed).toBe(true);
        });

        it('denies access when user has no overlapping role', async () => {
            userInfoEngineState.ApplicationRoles = [
                { ID: 'AR1', ApplicationID: 'APP1', RoleID: 'ROLE-ADMIN', CanAccess: true, CanAdmin: false },
            ];
            const result = await provider.CheckPermission(USER_WITH_UI, 'Applications', 'APP1', 'Read');
            expect(result.Allowed).toBe(false);
        });

        it('denies access for a roleless user on a restricted app', async () => {
            userInfoEngineState.ApplicationRoles = [
                { ID: 'AR1', ApplicationID: 'APP1', RoleID: 'ROLE-UI', CanAccess: true, CanAdmin: false },
            ];
            const result = await provider.CheckPermission(USER_NO_ROLES, 'Applications', 'APP1', 'Read');
            expect(result.Allowed).toBe(false);
        });
    });

    describe('GetUserResources', () => {
        it('lists every application the user has any action on', async () => {
            metadataState.Applications = [
                { ID: 'APP1', Name: 'Restricted' },
                { ID: 'APP2', Name: 'Open' },
                { ID: 'APP3', Name: 'Forbidden' },
            ];
            userInfoEngineState.ApplicationRoles = [
                { ID: 'AR1', ApplicationID: 'APP1', RoleID: 'ROLE-UI', CanAccess: true, CanAdmin: false },
                // APP2 has no rows → open access, still in the list
                { ID: 'AR3', ApplicationID: 'APP3', RoleID: 'ROLE-ADMIN', CanAccess: true, CanAdmin: false },
            ];
            const result = await provider.GetUserResources(USER_WITH_UI);
            expect(result.map((r) => r.ResourceID).sort()).toEqual(['APP1', 'APP2']);
        });

        it('filters to Applications only when resourceType is supplied', async () => {
            metadataState.Applications = [{ ID: 'APP1', Name: 'Open' }];
            const resultMatch = await provider.GetUserResources(USER_WITH_UI, 'Applications');
            expect(resultMatch).toHaveLength(1);
            const resultMismatch = await provider.GetUserResources(USER_WITH_UI, 'Dashboards');
            expect(resultMismatch).toEqual([]);
        });
    });

    describe('GetResourcePermissions', () => {
        it('returns a synthetic Everyone row for open-access apps', async () => {
            metadataState.Applications = [{ ID: 'APP1', Name: 'Open App' }];
            const result = await provider.GetResourcePermissions('Applications', 'APP1');
            expect(result).toHaveLength(1);
            expect(result[0].GranteeType).toBe('Everyone');
            expect(result[0].Actions).toEqual(['Read']);
        });

        it('returns one row per ApplicationRole when restricted', async () => {
            metadataState.Applications = [{ ID: 'APP1', Name: 'Restricted' }];
            userInfoEngineState.ApplicationRoles = [
                { ID: 'AR1', ApplicationID: 'APP1', RoleID: 'ROLE-UI', Role: 'UI', CanAccess: true, CanAdmin: false },
                { ID: 'AR2', ApplicationID: 'APP1', RoleID: 'ROLE-ADMIN', Role: 'Admin', CanAccess: true, CanAdmin: true },
            ];
            const result = await provider.GetResourcePermissions('Applications', 'APP1');
            expect(result).toHaveLength(2);
            const adminRow = result.find((r) => r.GranteeID === 'ROLE-ADMIN')!;
            expect(adminRow.Actions.sort()).toEqual(['Admin', 'Read']);
        });

        it('returns empty when the application is unknown', async () => {
            const result = await provider.GetResourcePermissions('Applications', 'NOPE');
            expect(result).toEqual([]);
        });
    });
});
