import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mjCore from '@memberjunction/core';
import { EntityInfo, IMetadataProvider, RunView, RunViewParams, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { ArtifactDelegateContext, ArtifactPermissionEngine, DelegatePermissionDecision, IArtifactPermissionDelegate } from '../custom/ArtifactPermissionDelegate';

function createTestUser(id: string, email: string): UserInfo {
    return new UserInfo(null, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: []
    });
}

function createEntityInfoStub(id: string, name: string): EntityInfo {
    return { ID: id, Name: name } as EntityInfo;
}

function extractInQuotedIds(filter: RunViewParams['ExtraFilter']): string[] {
    if (typeof filter !== 'string' || !filter) return [];
    const match = /IN\s*\(([^)]+)\)/i.exec(filter);
    if (!match?.[1]) return [];
    return match[1]
        .split(',')
        .map((part) => part.trim().replace(/^'+|'+$/g, ''))
        .filter((part) => part.length > 0);
}

function extractEqUuid(filter: RunViewParams['ExtraFilter'], column: string): string | null {
    if (typeof filter !== 'string' || !filter) return null;
    const escapedCol = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedCol}\\s*=\\s*'([^']+)'`, 'i');
    return regex.exec(filter)?.[1] ?? null;
}

function extraFilterText(filter: RunViewParams['ExtraFilter']): string {
    return typeof filter === 'string' ? filter : '';
}

describe('ArtifactPermissionEngine Round 8 safeguards', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('marks internal RunViewParams in GetGlobalObjectStore WeakSet and survives ProviderBase shallow clone', () => {
        const params: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: "ArtifactID='11111111-1111-4111-8111-111111111111'",
            Fields: ['ID'],
            ResultType: 'simple'
        };

        expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params)).toBe(false);

        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(params);

        const store = GetGlobalObjectStore();
        expect(store?.['___MJ_INTERNAL_ARTIFACT_PERMISSION_QUERY_PARAMS___']).toBeInstanceOf(WeakSet);
        expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(params)).toBe(true);

        // ProviderBase.RunView executes `params = { ...params }` before PreRunView / PostRunView hooks.
        const shallowClone: RunViewParams = { ...params };
        expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(shallowClone)).toBe(true);
        // JSON serialization must not leak internal marker symbols.
        expect(Object.keys(shallowClone)).toEqual(['EntityName', 'ExtraFilter', 'Fields', 'ResultType']);
    });

    it('marks inner RunViewParams in ResolvePermissions and logs errors in loadCollectionPermissionRows catch block', async () => {
        const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');
        const systemActor = createTestUser('99999999-9999-4999-8999-999999999999', 'custom-sys@example.com');

        const observedParams: RunViewParams[] = [];
        const logErrorSpy = vi.spyOn(mjCore, 'LogError').mockImplementation(() => {});
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemActor);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                observedParams.push(params);
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artifactId, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    return {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                throw new Error('Simulated collection query failure');
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const entities: EntityInfo[] = [];
        const provider: Partial<IMetadataProvider> = {
            ProviderType: 'Database',
            Entities: entities,
            EntityByID: (id: string) => entities.find((e) => e.ID === id)
        };

        const resolved = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider as IMetadataProvider,
            artifactId,
            viewer
        );

        expect(resolved.CanRead).toBe(false);
        expect(observedParams.length).toBe(3);
        for (const p of observedParams) {
            expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(p)).toBe(true);
            expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard({ ...p })).toBe(true);
        }

        expect(logErrorSpy).toHaveBeenCalledTimes(1);
        const loggedMsg = String(logErrorSpy.mock.calls[0]?.[0] ?? '');
        expect(loggedMsg).toContain(artifactId);
        expect(loggedMsg).toContain(viewer.ID);
        expect(loggedMsg).toContain('Simulated collection query failure');
    });
});

describe('ArtifactPermissionEngine Defer Fallback, >500 Items, Collection Ancestry & Readable Set', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('falls back to MJ: Collection Permissions when delegate returns partial Defer', async () => {
        const artifactId = 'aaaa1111-1111-4111-8111-111111111111';
        const versionId = 'bbbb1111-1111-4111-8111-111111111111';
        const collectionId = 'cccc1111-1111-4111-8111-111111111111';
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');
        const delegateEntityId = 'dddd1111-1111-4111-8111-111111111111';
        const delegateEntityName = 'Test: Partial Defer Host';

        const partialDeferDelegate: IArtifactPermissionDelegate = {
            async CanRead(_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> {
                return 'Allow';
            },
            async CanEdit(_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> {
                return 'Defer';
            },
            async CanDelete(_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> {
                return 'Deny';
            },
            async CanShare(_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> {
                return 'Defer';
            }
        };
        ArtifactPermissionEngine.Instance.RegisterDelegate(delegateEntityName, partialDeferDelegate);

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{
                            ID: artifactId,
                            UserID: ownerId,
                            DelegateEntityID: delegateEntityId,
                            DelegateRecordID: 'eeee1111-1111-4111-8111-111111111111'
                        }],
                        RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return { Success: true, Results: [{ ID: versionId }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Collection Artifacts') {
                    return { Success: true, Results: [{ CollectionID: collectionId }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Collections') {
                    return { Success: true, Results: [{ ID: collectionId, OwnerID: ownerId, ParentID: null }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    return {
                        Success: true,
                        Results: [{ CollectionID: collectionId, CanRead: true, CanEdit: true, CanDelete: true, CanShare: true }],
                        RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const entities = [createEntityInfoStub(delegateEntityId, delegateEntityName)];
        const provider: Partial<IMetadataProvider> = {
            ProviderType: 'Network',
            Entities: entities,
            EntityByID: (id: string) => entities.find((e) => e.ID === id),
            EntityByName: (name: string) => entities.find((e) => e.Name === name)
        };

        const resolved = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider as IMetadataProvider,
            artifactId,
            viewer
        );

        expect(resolved.CanRead).toBe(true);
        expect(resolved.CanEdit).toBe(true);   // Deferred -> resolved from MJ: Collection Permissions
        expect(resolved.CanShare).toBe(true);  // Deferred -> resolved from MJ: Collection Permissions
        expect(resolved.CanDelete).toBe(false); // Explicitly denied by delegate even though collection granted CanDelete
        expect(resolved.Source).toBe('Delegate');
    });

    it('resolves collection grants beyond 500 artifact versions without MaxRows truncation', async () => {
        const artifactId = 'aaaa2222-2222-4222-8222-222222222222';
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');
        const targetCollectionId = 'cccc2222-2222-4222-8222-222222222222';

        const totalVersions = 620;
        const versionRows = Array.from({ length: totalVersions }, (_, i) => ({
            ID: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
        }));
        const lastVersionId = versionRows[totalVersions - 1]!.ID;

        const observedParams: RunViewParams[] = [];
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                observedParams.push(params);
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artifactId, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: versionRows,
                        RowCount: versionRows.length, TotalRowCount: versionRows.length, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                if (params.EntityName === 'MJ: Collection Artifacts') {
                    const queriedIds = extractInQuotedIds(params.ExtraFilter);
                    const hit = queriedIds.includes(lastVersionId) ? [{ CollectionID: targetCollectionId }] : [];
                    return { Success: true, Results: hit, RowCount: hit.length, TotalRowCount: hit.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Collections') {
                    return {
                        Success: true,
                        Results: [{ ID: targetCollectionId, OwnerID: ownerId, ParentID: null }],
                        RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    return {
                        Success: true,
                        Results: [{ CollectionID: targetCollectionId, CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }],
                        RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const provider: Partial<IMetadataProvider> = { ProviderType: 'Network', Entities: [] };
        const resolved = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider as IMetadataProvider,
            artifactId,
            viewer
        );

        expect(resolved.CanRead).toBe(true);
        expect(resolved.CanEdit).toBe(true);
        expect(resolved.Source).toBe('CollectionPermission');
        // No 500-row cap should be imposed on internal version/collection queries
        for (const p of observedParams.filter((q) => q.EntityName !== 'MJ: Artifacts')) {
            expect(p.MaxRows).toBeUndefined();
        }
    });

    it('ResolveCollectionAncestryPermissions resolves 3-hop ancestor owner, ancestor share, terminates cycles, enforces depth 16, and denies outsiders', async () => {
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const ancestorOwner = createTestUser('11111111-1111-4111-8111-111111111111', 'owner@example.com');
        const sharedUser = createTestUser('22222222-2222-4222-8222-222222222222', 'shared@example.com');
        const outsider = createTestUser('33333333-3333-4333-8333-333333333333', 'outsider@example.com');
        const otherUserId = '44444444-4444-4444-8444-444444444444';

        const colRoot = 'c0000000-0000-4000-8000-000000000001';
        const colMid = 'c0000000-0000-4000-8000-000000000002';
        const colLeaf = 'c0000000-0000-4000-8000-000000000003';

        // 2-node cycle
        const cycA = 'c1000000-0000-4000-8000-000000000001';
        const cycB = 'c1000000-0000-4000-8000-000000000002';

        // Deep chain (18 hops: depth 0..17, ancestor grant placed at hop 17 beyond depth-16 limit)
        const deepIds = Array.from({ length: 18 }, (_, i) => `c2000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

        const collectionsMap = new Map<string, { ID: string; OwnerID: string; ParentID: string | null }>([
            [colRoot, { ID: colRoot, OwnerID: ownerId, ParentID: null }],
            [colMid, { ID: colMid, OwnerID: otherUserId, ParentID: colRoot }],
            [colLeaf, { ID: colLeaf, OwnerID: otherUserId, ParentID: colMid }],
            [cycA, { ID: cycA, OwnerID: otherUserId, ParentID: cycB }],
            [cycB, { ID: cycB, OwnerID: otherUserId, ParentID: cycA }],
            ...deepIds.map((id, idx) => [
                id,
                {
                    ID: id,
                    OwnerID: idx === 17 ? ownerId : otherUserId,
                    ParentID: idx < 17 ? deepIds[idx + 1]! : null
                }
            ] as const)
        ]);

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Collections') {
                    const id = extractEqUuid(params.ExtraFilter, 'ID');
                    const row = id ? collectionsMap.get(id) : undefined;
                    return {
                        Success: true,
                        Results: row ? [row] : [],
                        RowCount: row ? 1 : 0, TotalRowCount: row ? 1 : 0, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    const userId = extractEqUuid(params.ExtraFilter, 'UserID');
                    const queriedIds = extractInQuotedIds(params.ExtraFilter);
                    if (userId === sharedUser.ID && queriedIds.includes(colRoot)) {
                        return {
                            Success: true,
                            Results: [{ CollectionID: colRoot, CanRead: true, CanEdit: true, CanDelete: false, CanShare: true }],
                            RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: ''
                        };
                    }
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const provider: Partial<IMetadataProvider> = { ProviderType: 'Network', Entities: [] };

        const directOwnerRes = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider as IMetadataProvider,
            colRoot,
            ancestorOwner
        );
        expect(directOwnerRes.CanRead).toBe(true);
        expect(directOwnerRes.Source).toBe('Owner');

        const ancestorOwnerRes = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider as IMetadataProvider,
            colLeaf,
            ancestorOwner
        );
        expect(ancestorOwnerRes.CanRead).toBe(true);
        expect(ancestorOwnerRes.CanShare).toBe(true);
        expect(ancestorOwnerRes.Source).toBe('AncestorCollection');

        const ancestorShareRes = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider as IMetadataProvider,
            colLeaf,
            sharedUser
        );
        expect(ancestorShareRes.CanRead).toBe(true);
        expect(ancestorShareRes.CanEdit).toBe(true);
        expect(ancestorShareRes.CanShare).toBe(true);
        expect(ancestorShareRes.Source).toBe('AncestorCollection');

        const outsiderRes = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider as IMetadataProvider,
            colLeaf,
            outsider
        );
        expect(outsiderRes.CanRead).toBe(false);
        expect(outsiderRes.Source).toBe('Denied');

        const cycleRes = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider as IMetadataProvider,
            cycA,
            outsider
        );
        expect(cycleRes.CanRead).toBe(false);
        expect(cycleRes.Source).toBe('Denied');

        // Depth-16 cap: hop 17 owner is unreachable from depth 0
        const tooDeepRes = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider as IMetadataProvider,
            deepIds[0]!,
            ancestorOwner
        );
        expect(tooDeepRes.CanRead).toBe(false);
        expect(tooDeepRes.Source).toBe('Denied');
    });

    it('BuildReadableArtifactIdSet returns owned + direct + descendant collection artifacts while excluding delegate Deny', async () => {
        const user = createTestUser('22222222-2222-4222-8222-222222222222', 'reader@example.com');
        const otherId = '11111111-1111-4111-8111-111111111111';
        const denyEntityId = 'dddd3333-3333-4333-8333-333333333333';
        const denyEntityName = 'Test: BuildReadable Deny Host';

        ArtifactPermissionEngine.Instance.RegisterDelegate(denyEntityName, {
            async CanRead(): Promise<DelegatePermissionDecision> {
                return 'Deny';
            },
            async CanEdit(): Promise<DelegatePermissionDecision> {
                return 'Deny';
            }
        });

        const ownedArt = 'aaaa0001-0000-4000-8000-000000000001';
        const directArt = 'aaaa0002-0000-4000-8000-000000000002';
        const descendantArt = 'aaaa0003-0000-4000-8000-000000000003';
        const deniedOwnedArt = 'aaaa0004-0000-4000-8000-000000000004';
        const descVersion = 'bbbb0003-0000-4000-8000-000000000003';

        const parentCol = 'cccc0001-0000-4000-8000-000000000001';
        const childCol = 'cccc0002-0000-4000-8000-000000000002';

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    const eqId = extractEqUuid(params.ExtraFilter, 'ID');
                    if (eqId === ownedArt) {
                        return { Success: true, Results: [{ ID: ownedArt, UserID: user.ID, DelegateEntityID: null, DelegateRecordID: null }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    if (eqId === deniedOwnedArt) {
                        return { Success: true, Results: [{ ID: deniedOwnedArt, UserID: user.ID, DelegateEntityID: denyEntityId, DelegateRecordID: 'eeee0004-0000-4000-8000-000000000004' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    if (eqId === directArt) {
                        return { Success: true, Results: [{ ID: directArt, UserID: otherId, DelegateEntityID: null, DelegateRecordID: null }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    if (eqId === descendantArt) {
                        return { Success: true, Results: [{ ID: descendantArt, UserID: otherId, DelegateEntityID: null, DelegateRecordID: null }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    // Seed owned artifacts
                    return {
                        Success: true,
                        Results: [{ ID: ownedArt }, { ID: deniedOwnedArt }],
                        RowCount: 2, TotalRowCount: 2, ExecutionTime: 1, ErrorMessage: ''
                    };
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    const artId = extractEqUuid(params.ExtraFilter, 'ArtifactID');
                    if (!artId) {
                        return { Success: true, Results: [{ ArtifactID: directArt }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    if (artId === directArt) {
                        return { Success: true, Results: [{ CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Collections') {
                    const filterStr = extraFilterText(params.ExtraFilter);
                    if (filterStr.includes('OwnerID=')) {
                        return { Success: true, Results: [{ ID: parentCol }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    if (filterStr.includes('ParentID IN')) {
                        const parents = extractInQuotedIds(params.ExtraFilter);
                        if (parents.includes(parentCol)) {
                            return { Success: true, Results: [{ ID: childCol }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                        }
                        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    const queried = extractInQuotedIds(params.ExtraFilter);
                    const rows: Array<{ ID: string; OwnerID: string; ParentID: string | null }> = [];
                    if (queried.includes(childCol)) rows.push({ ID: childCol, OwnerID: otherId, ParentID: parentCol });
                    if (queried.includes(parentCol)) rows.push({ ID: parentCol, OwnerID: user.ID, ParentID: null });
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Collection Artifacts') {
                    const filterStr = extraFilterText(params.ExtraFilter);
                    const queriedIds = extractInQuotedIds(params.ExtraFilter);
                    const hitByCollection = filterStr.includes('CollectionID') && queriedIds.includes(childCol);
                    const hitByVersion = filterStr.includes('ArtifactVersionID') && queriedIds.includes(descVersion);
                    const hits = hitByCollection || hitByVersion ? [{ CollectionID: childCol, ArtifactVersionID: descVersion }] : [];
                    return { Success: true, Results: hits, RowCount: hits.length, TotalRowCount: hits.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    const artId = extractEqUuid(params.ExtraFilter, 'ArtifactID');
                    if (artId === descendantArt) {
                        return { Success: true, Results: [{ ID: descVersion }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    return { Success: true, Results: [{ ID: descVersion, ArtifactID: descendantArt }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const entities = [createEntityInfoStub(denyEntityId, denyEntityName)];
        const provider: Partial<IMetadataProvider> = {
            ProviderType: 'Network',
            Entities: entities,
            EntityByID: (id: string) => entities.find((e) => e.ID === id),
            EntityByName: (name: string) => entities.find((e) => e.Name === name)
        };

        const readable = await ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(
            provider as IMetadataProvider,
            user
        );

        expect(readable.has(ownedArt)).toBe(true);
        expect(readable.has(directArt)).toBe(true);
        expect(readable.has(descendantArt)).toBe(true);
        expect(readable.has(deniedOwnedArt)).toBe(false);
        expect(readable.size).toBe(3);
    });

    it('TryBuildReadableArtifactIdSet returns null when any sub-query fails (R7-4)', async () => {
        const user: UserInfo = {
            ID: '11111111-1111-4111-8111-111111111111',
            Name: 'Test User',
            Email: 'test@example.com'
        } as UserInfo;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: 'Transient DB timeout' };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const provider: Partial<IMetadataProvider> = {
            ProviderType: 'Network',
            Entities: []
        };

        const result = await ArtifactPermissionEngine.Instance.TryBuildReadableArtifactIdSet(
            provider as IMetadataProvider,
            user
        );
        expect(result).toBeNull();
    });

    it('TryBuildReadableArtifactIdSet fails closed (returns null) when ResolvePermissions sub-query fails (R8-1)', async () => {
        const actorId = '11111111-1111-4111-8111-111111111111';
        const candidateArtId = '22222222-2222-4222-8222-222222222222';
        const user: UserInfo = {
            ID: actorId,
            Name: 'Actor',
            Email: 'actor@example.com'
        } as UserInfo;

        let artQueryCount = 0;
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    artQueryCount++;
                    // 1st query is step 1 (owned artifacts); 2nd query is step 4 ResolvePermissions loadArtifactRow
                    if (artQueryCount === 1) {
                        return {
                            Success: true,
                            Results: [{ ID: candidateArtId }],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: ''
                        };
                    }
                    return {
                        Success: false,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: 'Transient DB failure inside ResolvePermissions'
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const provider: Partial<IMetadataProvider> = {
            ProviderType: 'Network',
            Entities: []
        };

        const result = await ArtifactPermissionEngine.Instance.TryBuildReadableArtifactIdSet(
            provider as IMetadataProvider,
            user
        );
        expect(result).toBeNull();
    });
});
