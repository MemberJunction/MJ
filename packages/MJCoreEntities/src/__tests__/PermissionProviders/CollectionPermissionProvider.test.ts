import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => <T extends object>(target: T): T => target,
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

type MockRowRecord = Record<string, string | number | boolean | null | undefined>;
const runViewQueue: Array<{ Success: boolean; Results: MockRowRecord[]; ErrorMessage?: string }> = [];
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
        PermissionProviderBase: buildPermissionProviderBase(MockRunView),
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

const UUID_USER_A = 'aaaa0000-0000-4000-8000-000000000001';
const UUID_USER_B = 'bbbb0000-0000-4000-8000-000000000002';
const UUID_USER_OTHER = 'cccc0000-0000-4000-8000-000000000003';
const UUID_COL_1 = 'c1000000-0000-4000-8000-000000000001';
const UUID_COL_2 = 'c2000000-0000-4000-8000-000000000002';
const UUID_COL_PARENT = 'c3000000-0000-4000-8000-000000000003';
const UUID_COL_CHILD = 'c4000000-0000-4000-8000-000000000004';
const UUID_COL_GRANDCHILD = 'c5000000-0000-4000-8000-000000000005';
const UUID_PERM_1 = 'd1000000-0000-4000-8000-000000000001';
const UUID_PERM_2 = 'd2000000-0000-4000-8000-000000000002';

const USER_A = { ID: UUID_USER_A, Name: 'User A', UserRoles: [] } as UserInfo;
const USER_B = { ID: UUID_USER_B, Name: 'User B', UserRoles: [] } as UserInfo;

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

        it('rejects non-UUID / SQL injection IDs without executing RunView', async () => {
            const result = await provider.CheckPermission(USER_A, 'Collections', `' OR 1=1--`, 'Read');
            expect(result.Allowed).toBe(false);
            expect(runViewCalls).toHaveLength(0);
        });

        it('grants full access when the user is the collection owner', async () => {
            // fetchCollection
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_1, Name: 'My Collection', OwnerID: UUID_USER_A, Owner: 'User A', ParentID: null }],
            });
            const result = await provider.CheckPermission(USER_A, 'Collections', UUID_COL_1, 'Delete');
            expect(result.Allowed).toBe(true);
            expect(result.Reason).toContain('owner');
        });

        it('falls back to direct permission row when not owner', async () => {
            // fetchCollection (not owned by USER_A)
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_1, Name: 'C1', OwnerID: UUID_USER_OTHER, ParentID: null }],
            });
            // fetchPermissionForUser
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_PERM_1, CollectionID: UUID_COL_1, UserID: UUID_USER_A,
                            CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'Collections', UUID_COL_1, 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('honors ParentID collection ancestry for inherited shares and ancestor owners', async () => {
            // Child collection has ParentID -> UUID_COL_PARENT
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_1, Name: 'Child', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_PARENT }],
            });
            // Parent collection (also owned by OTHER, root)
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_PARENT, Name: 'Parent', OwnerID: UUID_USER_OTHER, ParentID: null }],
            });
            // Inherited share on UUID_COL_PARENT
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_PERM_1, CollectionID: UUID_COL_PARENT, UserID: UUID_USER_A,
                            CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'Collections', UUID_COL_1, 'Update');
            expect(result.Allowed).toBe(true);
            expect(result.Reason).toContain('inherited');
        });
    });

    describe('GetPermissionsSharedWithUser', () => {
        it('excludes collections the grantee owns', async () => {
            // ownedResult — grantee owns UUID_COL_1
            runViewQueue.push({ Success: true, Results: [{ ID: UUID_COL_1, Name: 'Mine', OwnerID: UUID_USER_B }] });
            // permsResult — both UUID_COL_1 (owned, should be filtered) and UUID_COL_2
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_PERM_1, CollectionID: UUID_COL_1, UserID: UUID_USER_B, User: 'User B', SharedByUserID: UUID_USER_A,
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                    { ID: UUID_PERM_2, CollectionID: UUID_COL_2, UserID: UUID_USER_B, User: 'User B', SharedByUserID: UUID_USER_A,
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                ],
            });
            // fetchCollectionNames for UUID_COL_2
            runViewQueue.push({ Success: true, Results: [{ ID: UUID_COL_2, Name: 'C2 Name' }] });

            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toHaveLength(1);
            expect(result[0].ResourceID).toBe(UUID_COL_2);
        });

        it('includes the (SharedByUserID IS NULL OR SharedByUserID <> grantee) filter', async () => {
            runViewQueue.push({ Success: true, Results: [] }); // owned
            runViewQueue.push({ Success: true, Results: [] }); // perms

            await provider.GetPermissionsSharedWithUser(USER_B);
            const permsCall = runViewCalls.find((c) => c.EntityName === 'MJ: Collection Permissions');
            expect(permsCall?.ExtraFilter).toContain(`UserID='${UUID_USER_B}'`);
            expect(permsCall?.ExtraFilter).toContain('SharedByUserID IS NULL');
            expect(permsCall?.ExtraFilter).toContain(`SharedByUserID <> '${UUID_USER_B}'`);
        });
    });

    describe('GetPermissionsGrantedByUser', () => {
        it('only includes explicit grants (SharedByUserID = grantor)', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_PERM_1, CollectionID: UUID_COL_1, UserID: UUID_USER_B, User: 'User B', SharedByUserID: UUID_USER_A,
                      CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
                ],
            });
            runViewQueue.push({ Success: true, Results: [{ ID: UUID_COL_1, Name: 'C1 Name' }] });

            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(1);
            expect(runViewCalls[0].ExtraFilter).toBe(`SharedByUserID='${UUID_USER_A}'`);
            expect(result[0].SourceRecordID).toBe(UUID_PERM_1);
            expect(result[0].GranteeID).toBe(UUID_USER_B);
        });

        it('returns empty array on RunView failure', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'db down' });
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
    });

    describe('GetEffectivePermissions (ancestry)', () => {
        it('grants full synthetic permissions when user owns an ancestor collection', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_CHILD, Name: 'Child Col', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_PARENT }],
            });
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_PARENT, Name: 'Parent Col', OwnerID: UUID_USER_A, ParentID: null }],
            });

            const perms = await provider.GetEffectivePermissions(USER_A, 'Collections', UUID_COL_CHILD);
            expect(perms).toHaveLength(1);
            expect(perms[0].ResourceID).toBe(UUID_COL_CHILD);
            expect(perms[0].ResourceName).toBe('Child Col');
            expect(perms[0].Actions).toEqual(['Read', 'Update', 'Delete', 'Share']);
        });

        it('unions inherited and direct grants across ParentID ancestry', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_CHILD, Name: 'Child Col', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_PARENT }],
            });
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_PARENT, Name: 'Parent Col', OwnerID: UUID_USER_OTHER, ParentID: null }],
            });
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_PERM_1, CollectionID: UUID_COL_PARENT, UserID: UUID_USER_A,
                      CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
                    { ID: UUID_PERM_2, CollectionID: UUID_COL_CHILD, UserID: UUID_USER_A,
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: true },
                ],
            });

            const perms = await provider.GetEffectivePermissions(USER_A, 'Collections', UUID_COL_CHILD);
            expect(perms).toHaveLength(1);
            expect(perms[0].Actions).toEqual(['Read', 'Update', 'Share']);
            expect(perms[0].SourceRecordID).toBe(UUID_PERM_2);
        });

        it('terminates ParentID cycles without infinite loops via visited Set + NormalizeUUID', async () => {
            // Cycle with mixed-case UUIDs: CHILD -> PARENT -> CHILD (uppercase)
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_CHILD, Name: 'Cycle A', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_PARENT }],
            });
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_PARENT, Name: 'Cycle B', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_CHILD.toUpperCase() }],
            });
            // No permissions in cycle
            runViewQueue.push({ Success: true, Results: [] });

            const perms = await provider.GetEffectivePermissions(USER_A, 'Collections', UUID_COL_CHILD);
            expect(perms).toEqual([]);
            expect(runViewCalls.filter((c) => c.EntityName === 'MJ: Collections')).toHaveLength(2);
        });
    });

    describe('GetUserResources (ancestry cascade)', () => {
        it('cascades owned root collections and shared parent grants down to descendants and unions permissions', async () => {
            // 1. GetUserResources.direct — user has Read+Update on UUID_COL_PARENT and Read on UUID_COL_1 (which is a child of owned UUID_COL_2)
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_PERM_1, CollectionID: UUID_COL_PARENT, UserID: UUID_USER_A,
                      CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
                    { ID: UUID_PERM_2, CollectionID: UUID_COL_1, UserID: UUID_USER_A,
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                ],
            });
            // 2. GetUserResources.owned — user owns UUID_COL_2
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_2, Name: 'Owned Root', OwnerID: UUID_USER_A }],
            });
            // 3. Descendants depth 0 (ParentID IN (UUID_COL_2, UUID_COL_PARENT, UUID_COL_1))
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_COL_1, Name: 'Owned Descendant', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_2 },
                    { ID: UUID_COL_CHILD, Name: 'Shared Child', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_PARENT },
                ],
            });
            // 4. Descendants depth 1 (ParentID IN (UUID_COL_CHILD))
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_COL_GRANDCHILD, Name: 'Shared Grandchild', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_CHILD },
                ],
            });
            // 5. Descendants depth 2 (ParentID IN (UUID_COL_GRANDCHILD)) -> empty
            runViewQueue.push({ Success: true, Results: [] });
            // 6. bulkLookupNames for missing names (UUID_COL_PARENT)
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_PARENT, Name: 'Shared Parent' }],
            });

            const resources = await provider.GetUserResources(USER_A);
            const byId = new Map(resources.map((r) => [r.ResourceID, r]));

            expect(byId.get(UUID_COL_2)?.Actions).toEqual(['Read', 'Update', 'Delete', 'Share']);
            // Direct Read on UUID_COL_1 is superseded by ancestor owner UUID_COL_2
            expect(byId.get(UUID_COL_1)?.Actions).toEqual(['Read', 'Update', 'Delete', 'Share']);
            expect(byId.get(UUID_COL_1)?.SourceRecordID).toBeUndefined();

            expect(byId.get(UUID_COL_PARENT)?.Actions).toEqual(['Read', 'Update']);
            expect(byId.get(UUID_COL_PARENT)?.ResourceName).toBe('Shared Parent');
            expect(byId.get(UUID_COL_CHILD)?.Actions).toEqual(['Read', 'Update']);
            expect(byId.get(UUID_COL_GRANDCHILD)?.Actions).toEqual(['Read', 'Update']);
            expect(resources).toHaveLength(5);
        });

        it('handles cyclic ParentID relationships during descendant cascade without infinite loops', async () => {
            // direct share on UUID_COL_PARENT
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_PERM_1, CollectionID: UUID_COL_PARENT, UserID: UUID_USER_A,
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                ],
            });
            // owned
            runViewQueue.push({ Success: true, Results: [] });
            // depth 0: PARENT -> CHILD
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_CHILD, Name: 'Cycle Child', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_PARENT }],
            });
            // depth 1: CHILD -> PARENT (cycle back with uppercase UUID!)
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_COL_PARENT.toUpperCase(), Name: 'Cycle Parent', OwnerID: UUID_USER_OTHER, ParentID: UUID_COL_CHILD }],
            });
            // bulkLookupNames if needed (Cycle Parent name was already captured from child row)

            const resources = await provider.GetUserResources(USER_A);
            expect(resources).toHaveLength(2);
            expect(resources.every((r) => r.Actions.includes('Read'))).toBe(true);
        });
    });
});
