import { describe, it, expect, beforeEach, vi } from 'vitest';

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
        Metadata: class {},
        BaseEngine: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        RunView: MockRunView,
    };
});

import { CollectionPermissionProvider } from '../../custom/PermissionProviders/CollectionPermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = { ID: 'AAA', Name: 'User A', UserRoles: [] } as unknown as UserInfo;
const USER_B = { ID: 'BBB', Name: 'User B', UserRoles: [] } as unknown as UserInfo;

beforeEach(() => {
    runViewQueue.length = 0;
    runViewCalls.length = 0;
});

describe('CollectionPermissionProvider', () => {
    let provider: CollectionPermissionProvider;
    beforeEach(() => { provider = new CollectionPermissionProvider(); });

    describe('CheckPermission', () => {
        it('returns Allowed=false without resourceId', async () => {
            const result = await provider.CheckPermission(USER_A, 'Collections', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('require a specific collection ID');
        });

        it('grants full access when the user is the collection owner', async () => {
            // fetchCollection
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'C1', Name: 'My Collection', OwnerID: 'AAA', Owner: 'User A' }],
            });
            const result = await provider.CheckPermission(USER_A, 'Collections', 'C1', 'Delete');
            expect(result.Allowed).toBe(true);
            expect(result.Reason).toContain('owner');
        });

        it('falls back to direct permission row when not owner', async () => {
            // fetchCollection (not owned by USER_A)
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'C1', Name: 'C1', OwnerID: 'XXX' }],
            });
            // fetchPermissionForUser
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', CollectionID: 'C1', UserID: 'AAA',
                            CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'Collections', 'C1', 'Read');
            expect(result.Allowed).toBe(true);
        });
    });

    describe('GetPermissionsSharedWithUser', () => {
        it('excludes collections the grantee owns', async () => {
            // ownedResult — grantee owns C1
            runViewQueue.push({ Success: true, Results: [{ ID: 'C1', Name: 'Mine', OwnerID: 'BBB' }] });
            // permsResult — both C1 (owned, should be filtered) and C2
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', CollectionID: 'C1', UserID: 'BBB', User: 'User B', SharedByUserID: 'AAA',
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                    { ID: 'P2', CollectionID: 'C2', UserID: 'BBB', User: 'User B', SharedByUserID: 'AAA',
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                ],
            });
            // fetchCollectionNames for C2
            runViewQueue.push({ Success: true, Results: [{ ID: 'C2', Name: 'C2 Name' }] });

            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toHaveLength(1);
            expect(result[0].ResourceID).toBe('C2');
        });

        it('includes the (SharedByUserID IS NULL OR SharedByUserID <> grantee) filter', async () => {
            runViewQueue.push({ Success: true, Results: [] }); // owned
            runViewQueue.push({ Success: true, Results: [] }); // perms

            await provider.GetPermissionsSharedWithUser(USER_B);
            const permsCall = runViewCalls.find((c) => c.EntityName === 'MJ: Collection Permissions');
            expect(permsCall?.ExtraFilter).toContain("UserID='BBB'");
            expect(permsCall?.ExtraFilter).toContain('SharedByUserID IS NULL');
            expect(permsCall?.ExtraFilter).toContain("SharedByUserID <> 'BBB'");
        });
    });

    describe('GetPermissionsGrantedByUser', () => {
        it('only includes explicit grants (SharedByUserID = grantor)', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', CollectionID: 'C1', UserID: 'BBB', User: 'User B', SharedByUserID: 'AAA',
                      CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
                ],
            });
            runViewQueue.push({ Success: true, Results: [{ ID: 'C1', Name: 'C1 Name' }] });

            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(1);
            expect(runViewCalls[0].ExtraFilter).toBe(`SharedByUserID='AAA'`);
            expect(result[0].SourceRecordID).toBe('P1');
            expect(result[0].GranteeID).toBe('BBB');
        });

        it('returns empty array on RunView failure', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'db down' });
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
    });
});
