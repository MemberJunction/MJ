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

const runViewQueue: Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }> = [];
const runViewCalls: Array<{ EntityName: string; ExtraFilter?: string }> = [];
const metadataState = {
    Roles: [] as Array<{ ID: string; Name: string }>,
};

vi.mock('@memberjunction/core', async () => {
    const { buildPermissionProviderBase } = await import('./_mockPermissionProviderBase');
    class MockRunView {
        async RunView(args: { EntityName: string; ExtraFilter?: string }) {
            runViewCalls.push({ EntityName: args.EntityName, ExtraFilter: args.ExtraFilter });
            return runViewQueue.shift() ?? { Success: true, Results: [], ErrorMessage: '' };
        }
    }
    return {
        PermissionProviderBase: buildPermissionProviderBase(MockRunView as any),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class {},
        BaseEngine: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        RunView: MockRunView,
        Metadata: class {
            get Roles() { return metadataState.Roles; }
        },
    };
});

// ---------------------------------------------------------------------------

import { QueryPermissionProvider } from '../../custom/PermissionProviders/QueryPermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = {
    ID: 'AAA',
    Name: 'User A',
    UserRoles: [{ RoleID: 'ROLE-UI' }, { RoleID: 'ROLE-DEV' }],
} as unknown as UserInfo;
const USER_NO_ROLES = { ID: 'NNN', Name: 'Nobody', UserRoles: [] } as unknown as UserInfo;

beforeEach(() => {
    runViewQueue.length = 0;
    runViewCalls.length = 0;
    metadataState.Roles = [];
});

describe('QueryPermissionProvider', () => {
    let provider: QueryPermissionProvider;
    beforeEach(() => { provider = new QueryPermissionProvider(); });

    describe('CheckPermission', () => {
        it('rejects non-Execute actions', async () => {
            const result = await provider.CheckPermission(USER_A, 'Queries', 'Q1', 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('only support Execute');
        });

        it('returns Allowed=false without resourceId', async () => {
            const result = await provider.CheckPermission(USER_A, 'Queries', null, 'Execute');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('specific query ID');
        });

        it('grants Execute when a user role matches a permission row', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'QP1', QueryID: 'Q1', RoleID: 'ROLE-UI' }],
            });
            const result = await provider.CheckPermission(USER_A, 'Queries', 'Q1', 'Execute');
            expect(result.Allowed).toBe(true);
        });

        it('denies Execute when no user role matches', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'QP1', QueryID: 'Q1', RoleID: 'ROLE-ADMIN' }],
            });
            const result = await provider.CheckPermission(USER_A, 'Queries', 'Q1', 'Execute');
            expect(result.Allowed).toBe(false);
        });

        it('denies Execute when the query has no permission rows (existence semantics)', async () => {
            runViewQueue.push({ Success: true, Results: [] });
            const result = await provider.CheckPermission(USER_A, 'Queries', 'Q1', 'Execute');
            expect(result.Allowed).toBe(false);
        });

        it('denies a roleless user', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'QP1', QueryID: 'Q1', RoleID: 'ROLE-UI' }],
            });
            const result = await provider.CheckPermission(USER_NO_ROLES, 'Queries', 'Q1', 'Execute');
            expect(result.Allowed).toBe(false);
        });
    });

    describe('GetUserResources', () => {
        it('short-circuits for a roleless user (no role IN filter possible)', async () => {
            const result = await provider.GetUserResources(USER_NO_ROLES);
            expect(result).toEqual([]);
            expect(runViewCalls).toHaveLength(0);
        });

        it('deduplicates queries granted by multiple roles', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'QP1', QueryID: 'Q1', RoleID: 'ROLE-UI', Query: 'Get Users' },
                    { ID: 'QP2', QueryID: 'Q1', RoleID: 'ROLE-DEV', Query: 'Get Users' },
                    { ID: 'QP3', QueryID: 'Q2', RoleID: 'ROLE-DEV', Query: 'Get Items' },
                ],
            });
            const result = await provider.GetUserResources(USER_A);
            expect(result).toHaveLength(2);
            expect(result.map((r) => r.ResourceID).sort()).toEqual(['Q1', 'Q2']);
            // filter used role IN
            expect(runViewCalls[0].ExtraFilter).toContain('ROLE-UI');
            expect(runViewCalls[0].ExtraFilter).toContain('ROLE-DEV');
        });

        it('filters to Queries only when resourceType is supplied', async () => {
            const result = await provider.GetUserResources(USER_A, 'Dashboards');
            expect(result).toEqual([]);
        });

        it('returns empty on RunView failure', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'boom' });
            const result = await provider.GetUserResources(USER_A);
            expect(result).toEqual([]);
        });
    });

    describe('GetResourcePermissions', () => {
        it('resolves role names from Metadata.Roles', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'QP1', QueryID: 'Q1', RoleID: 'ROLE-UI', Role: null }],
            });
            runViewQueue.push({ Success: true, Results: [{ ID: 'Q1', Name: 'Get Users' }] });
            metadataState.Roles = [{ ID: 'ROLE-UI', Name: 'UI User' }];
            const result = await provider.GetResourcePermissions('Queries', 'Q1');
            expect(result).toHaveLength(1);
            expect(result[0].GranteeName).toBe('UI User');
            expect(result[0].GranteeType).toBe('Role');
            expect(result[0].Actions).toEqual(['Execute']);
        });

        it('rejects wrong resourceType', async () => {
            const result = await provider.GetResourcePermissions('Dashboards', 'D1');
            expect(result).toEqual([]);
        });
    });

    describe('inherited share-center methods', () => {
        it('role-only provider returns [] for grantor/grantee aggregations', async () => {
            expect(await provider.GetPermissionsGrantedByUser(USER_A)).toEqual([]);
            expect(await provider.GetPermissionsSharedWithUser(USER_A)).toEqual([]);
        });
    });
});
