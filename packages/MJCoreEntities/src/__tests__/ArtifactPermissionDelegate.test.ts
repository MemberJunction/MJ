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
                    const filterStr = extraFilterText(params.ExtraFilter);
                    const allArtifactRows = [
                        { ID: ownedArt, UserID: user.ID, DelegateEntityID: null, DelegateRecordID: null },
                        { ID: deniedOwnedArt, UserID: user.ID, DelegateEntityID: denyEntityId, DelegateRecordID: 'eeee0004-0000-4000-8000-000000000004' },
                        { ID: directArt, UserID: otherId, DelegateEntityID: null, DelegateRecordID: null },
                        { ID: descendantArt, UserID: otherId, DelegateEntityID: null, DelegateRecordID: null }
                    ];
                    if (filterStr.startsWith('UserID=')) {
                        return {
                            Success: true,
                            Results: [{ ID: ownedArt }, { ID: deniedOwnedArt }],
                            RowCount: 2, TotalRowCount: 2, ExecutionTime: 1, ErrorMessage: ''
                        };
                    }
                    if (filterStr.includes('DelegateEntityID IN (')) {
                        const entityIds = extractInQuotedIds(params.ExtraFilter);
                        const hits = allArtifactRows.filter((r) => r.DelegateEntityID && entityIds.includes(r.DelegateEntityID));
                        return { Success: true, Results: hits, RowCount: hits.length, TotalRowCount: hits.length, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    const inIds = extractInQuotedIds(params.ExtraFilter);
                    const eqId = extractEqUuid(params.ExtraFilter, 'ID');
                    const targetIds = inIds.length > 0 ? inIds : eqId ? [eqId] : [];
                    const rows = allArtifactRows.filter((r) => targetIds.includes(r.ID));
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Artifact Permissions') {
                    const inIds = extractInQuotedIds(params.ExtraFilter);
                    const eqArtId = extractEqUuid(params.ExtraFilter, 'ArtifactID');
                    const targetIds = inIds.length > 0 ? inIds : eqArtId ? [eqArtId] : [];
                    if (targetIds.length === 0) {
                        return { Success: true, Results: [{ ArtifactID: directArt }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    if (targetIds.includes(directArt)) {
                        return { Success: true, Results: [{ ArtifactID: directArt, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
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

    it('TryBuildReadableArtifactIdSet forwards strictThrowOnQueryError through parent-artifact delegate recursion (R9 Should-fix)', async () => {
        const actorId = '11111111-1111-4111-8111-111111111111';
        const childArtId = '22222222-2222-4222-8222-222222222222';
        const parentArtId = '33333333-3333-4333-8333-333333333333';
        const artEntityId = '44444444-4444-4444-8444-444444444444';
        const user: UserInfo = {
            ID: actorId,
            Name: 'Actor',
            Email: 'actor@example.com'
        } as UserInfo;

        const entities = [{ ID: artEntityId, Name: 'MJ: Artifacts' }];
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    const f = String(params.ExtraFilter ?? '');
                    if (f.includes(`UserID='${actorId}'`)) {
                        return { Success: true, Results: [{ ID: childArtId }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                    }
                    if (f.includes(`ID='${childArtId}'`)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: childArtId,
                                    UserID: actorId,
                                    DelegateEntityID: artEntityId,
                                    DelegateRecordID: parentArtId
                                }
                            ],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: ''
                        };
                    }
                    if (f.includes(`ID='${parentArtId}'`)) {
                        return {
                            Success: false,
                            Results: [],
                            RowCount: 0,
                            TotalRowCount: 0,
                            ExecutionTime: 1,
                            ErrorMessage: 'Parent DB failure'
                        };
                    }
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            })
        } as Pick<RunView, 'RunView'> as RunView);

        const provider = {
            ProviderType: 'Network',
            Entities: entities,
            EntityByID: (id: string) => entities.find((e) => e.ID === id),
            EntityByName: (name: string) => entities.find((e) => e.Name === name)
        } as unknown as IMetadataProvider;

        const result = await ArtifactPermissionEngine.Instance.TryBuildReadableArtifactIdSet(provider, user);
        expect(result).toBeNull();
    });
});

describe('ArtifactPermissionEngine.ResolvePermissionsBatch', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        ArtifactPermissionEngine.Instance.UnregisterDelegate('Test: Batch Deny Host');
        ArtifactPermissionEngine.Instance.UnregisterDelegate('Test: Batch Partial Defer Host');
        ArtifactPermissionEngine.Instance.UnregisterDelegate('Test: Batch All Defer Host');
        ArtifactPermissionEngine.Instance.UnregisterDelegate('Test: Batch Parent Chain Spy Host');
        ArtifactPermissionEngine.Instance.UnregisterDelegate('Test: Batch Parent Chain BackEdge Host');
    });

    interface BatchFixtureData {
        artifacts: Array<{ ID: string; UserID: string; DelegateEntityID: string | null; DelegateRecordID: string | null }>;
        directPerms: Array<{ ID: string; ArtifactID: string; UserID: string; CanRead: boolean; CanEdit: boolean; CanDelete: boolean; CanShare: boolean }>;
        versions: Array<{ ID: string; ArtifactID: string }>;
        collectionArtifacts: Array<{ ArtifactVersionID: string; CollectionID: string }>;
        collections: Array<{ ID: string; OwnerID: string | null; ParentID: string | null }>;
        collectionPerms: Array<{ CollectionID: string; UserID: string; CanRead: boolean; CanEdit: boolean; CanDelete: boolean; CanShare: boolean }>;
        entities: EntityInfo[];
    }

    function createBatchProvider(data: BatchFixtureData) {
        const runViewCalls: RunViewParams[] = [];
        const runViewsCalls: RunViewParams[][] = [];

        const matchIds = (filter: RunViewParams['ExtraFilter'], column: string): string[] => {
            const inIds = extractInQuotedIds(filter);
            if (inIds.length > 0) {
                return inIds.map((id) => id.toLowerCase());
            }
            const eqId = extractEqUuid(filter, column);
            return eqId ? [eqId.toLowerCase()] : [];
        };

        const execute = (params: RunViewParams) => {
            const filter = extraFilterText(params.ExtraFilter);
            if (params.EntityName === 'MJ: Artifacts') {
                if (filter.startsWith('DelegateEntityID IN (')) {
                    const entIds = new Set(extractInQuotedIds(filter).map((id) => id.toLowerCase()));
                    const rows = data.artifacts.filter((a) => a.DelegateEntityID != null && entIds.has(a.DelegateEntityID.toLowerCase()));
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                const delegateEntId = extractEqUuid(filter, 'DelegateEntityID')?.toLowerCase();
                if (delegateEntId) {
                    const parentIds = new Set(matchIds(filter, 'DelegateRecordID'));
                    const rows = data.artifacts.filter(
                        (a) =>
                            a.DelegateEntityID?.toLowerCase() === delegateEntId &&
                            a.DelegateRecordID != null &&
                            parentIds.has(a.DelegateRecordID.toLowerCase())
                    );
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (filter.startsWith('UserID=')) {
                    const ownerFilterId = extractEqUuid(filter, 'UserID')?.toLowerCase();
                    const rows = data.artifacts.filter((a) => ownerFilterId != null && a.UserID.toLowerCase() === ownerFilterId);
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                const ids = new Set(matchIds(filter, 'ID'));
                const rows = data.artifacts.filter((a) => ids.has(a.ID.toLowerCase()));
                return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: Artifact Permissions') {
                const ids = new Set(matchIds(filter, 'ArtifactID'));
                const uid = extractEqUuid(filter, 'UserID')?.toLowerCase();
                const rows = data.directPerms.filter(
                    (p) => (ids.size === 0 || ids.has(p.ArtifactID.toLowerCase())) && (!uid || p.UserID.toLowerCase() === uid)
                );
                return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                const ids = new Set(matchIds(filter, 'ArtifactID'));
                const rows = data.versions.filter((v) => ids.has(v.ArtifactID.toLowerCase()));
                return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: Collection Artifacts') {
                const verIds = new Set(matchIds(filter, 'ArtifactVersionID'));
                const rows = data.collectionArtifacts.filter((ca) => verIds.has(ca.ArtifactVersionID.toLowerCase()));
                return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: Collections') {
                const colIds = new Set(matchIds(filter, 'ID'));
                const rows = data.collections.filter((c) => colIds.has(c.ID.toLowerCase()));
                return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                const colIds = new Set(matchIds(filter, 'CollectionID'));
                const uid = extractEqUuid(filter, 'UserID')?.toLowerCase();
                const rows = data.collectionPerms.filter(
                    (cp) => colIds.has(cp.CollectionID.toLowerCase()) && (!uid || cp.UserID.toLowerCase() === uid)
                );
                return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
        };

        const provider = {
            ProviderType: 'Network',
            Entities: data.entities,
            EntityByID: (id: string) => data.entities.find((e) => e.ID.toLowerCase() === id.toLowerCase()),
            EntityByName: (name: string) => data.entities.find((e) => e.Name.toLowerCase() === name.toLowerCase()),
            RunView: vi.fn(async (params: RunViewParams) => {
                runViewCalls.push(params);
                return execute(params);
            }),
            RunViews: vi.fn(async (paramsList: RunViewParams[]) => {
                runViewsCalls.push(paramsList);
                return paramsList.map((p) => execute(p));
            })
        } as unknown as IMetadataProvider;

        return { provider, runViewCalls, runViewsCalls };
    }

    it('resolves all-owner batches in 1 MJ: Artifacts query, mixed uncollected in O(1), collected in O(depth), and sets BypassCache:true on every query', async () => {
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');
        const colChild = 'c1111111-1111-4111-8111-111111111111';
        const colParent = 'c2222222-2222-4222-8222-222222222222';

        // 1. All-owner batch (N=5 vs N=20): strictly ONE RunViews call with ONLY MJ: Artifacts
        const makeAllOwnedRun = async (count: number) => {
            const ids = Array.from({ length: count }, (_, i) => `a1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
            const fixture = createBatchProvider({
                artifacts: ids.map((id) => ({ ID: id, UserID: viewer.ID, DelegateEntityID: null, DelegateRecordID: null })),
                directPerms: [],
                versions: [],
                collectionArtifacts: [],
                collections: [],
                collectionPerms: [],
                entities: []
            });
            const res = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(fixture.provider, ids, viewer);
            return { ids, res, fixture };
        };
        const owned5 = await makeAllOwnedRun(5);
        const owned20 = await makeAllOwnedRun(20);
        expect(owned5.fixture.runViewsCalls).toHaveLength(1);
        expect(owned5.fixture.runViewCalls).toHaveLength(0);
        expect(owned20.fixture.runViewsCalls).toHaveLength(1);
        expect(owned20.fixture.runViewCalls).toHaveLength(0);
        expect(owned20.fixture.runViewsCalls[0].map((p) => p.EntityName)).toEqual(['MJ: Artifacts']);
        expect(owned20.fixture.runViewsCalls[0][0].BypassCache).toBe(true);
        expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(owned20.fixture.runViewsCalls[0][0])).toBe(true);

        // 2. Mixed owned + non-owned uncollected batch (N=5 vs N=20): strictly 2 RunViews calls regardless of N
        const makeUncollectedRun = async (count: number) => {
            const ids = Array.from({ length: count }, (_, i) => `a0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
            const fixture = createBatchProvider({
                artifacts: ids.map((id, i) => ({
                    ID: id,
                    UserID: i % 2 === 0 ? viewer.ID : ownerId,
                    DelegateEntityID: null,
                    DelegateRecordID: null
                })),
                directPerms: ids
                    .filter((_, i) => i % 2 === 1 && i < Math.ceil(count / 2))
                    .map((id, idx) => ({
                        ID: `p0000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
                        ArtifactID: id,
                        UserID: viewer.ID,
                        CanRead: true,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false
                    })),
                versions: [],
                collectionArtifacts: [],
                collections: [],
                collectionPerms: [],
                entities: []
            });
            const res = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(fixture.provider, ids, viewer);
            return { ids, res, fixture };
        };

        const run5 = await makeUncollectedRun(5);
        const run20 = await makeUncollectedRun(20);

        expect(run5.fixture.runViewsCalls).toHaveLength(2);
        expect(run5.fixture.runViewCalls).toHaveLength(0);
        expect(run20.fixture.runViewsCalls).toHaveLength(2);
        expect(run20.fixture.runViewCalls).toHaveLength(0);
        expect(run20.fixture.runViewsCalls[0].map((p) => p.EntityName)).toEqual(['MJ: Artifacts']);
        expect(run20.fixture.runViewsCalls[1].map((p) => p.EntityName)).toEqual([
            'MJ: Artifact Permissions',
            'MJ: Artifact Versions'
        ]);
        for (const batch of run20.fixture.runViewsCalls) {
            for (const p of batch) {
                expect(p.BypassCache).toBe(true);
                expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(p)).toBe(true);
            }
        }
        expect(run20.res.get(run20.ids[0])?.Source).toBe('Owner');
        expect(run20.res.get(run20.ids[1])?.Source).toBe('ArtifactPermission');
        expect(run20.res.get(run20.ids[19])?.CanRead).toBe(false);

        // 3. O(depth) collection ancestry walk for N=4 vs N=12 collected artifacts across a 2-level hierarchy
        const makeCollectedRun = async (count: number) => {
            const ids = Array.from({ length: count }, (_, i) => `b0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
            const fixture = createBatchProvider({
                artifacts: ids.map((id) => ({ ID: id, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null })),
                directPerms: [],
                versions: ids.map((id, i) => ({
                    ID: `v0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
                    ArtifactID: id
                })),
                collectionArtifacts: ids.map((_, i) => ({
                    ArtifactVersionID: `v0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
                    CollectionID: colChild
                })),
                collections: [
                    { ID: colChild, OwnerID: ownerId, ParentID: colParent },
                    { ID: colParent, OwnerID: ownerId, ParentID: null }
                ],
                collectionPerms: [
                    { CollectionID: colParent, UserID: viewer.ID, CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }
                ],
                entities: []
            });
            const res = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(fixture.provider, ids, viewer);
            return { ids, res, fixture };
        };

        const colRun4 = await makeCollectedRun(4);
        const colRun12 = await makeCollectedRun(12);

        // Exact same number of DB round-trips for N=4 and N=12 (2 RunViews + 1 Collection Artifacts + 2 ancestry levels + 1 Collection Perms).
        expect(colRun4.fixture.runViewsCalls.length).toBe(2);
        expect(colRun12.fixture.runViewsCalls.length).toBe(2);
        expect(colRun12.fixture.runViewCalls.length).toBe(colRun4.fixture.runViewCalls.length);
        expect(colRun12.fixture.runViewCalls.map((p) => p.EntityName)).toEqual([
            'MJ: Collection Artifacts',
            'MJ: Collections',
            'MJ: Collections',
            'MJ: Collection Permissions'
        ]);
        for (const p of colRun12.fixture.runViewCalls) {
            expect(p.BypassCache).toBe(true);
            expect(ArtifactPermissionEngine.IsPermissionResolutionRecursionGuard(p)).toBe(true);
        }
        for (const id of colRun12.ids) {
            expect(colRun12.res.get(id)).toMatchObject({ CanRead: true, CanEdit: true, CanDelete: false, Source: 'CollectionPermission' });
        }
    });

    it('matches explicit pre-PR golden expectations across every permission fixture in both batch and single-item calls', async () => {
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');

        const entArtifactsId = 'e1000000-0000-4000-8000-000000000001';
        const entDenyId = 'e2000000-0000-4000-8000-000000000002';
        const entDeferId = 'e3000000-0000-4000-8000-000000000003';
        const entAllDeferId = 'e4000000-0000-4000-8000-000000000004';

        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Batch Deny Host', {
            async CanRead(): Promise<DelegatePermissionDecision> { return 'Deny'; },
            async CanEdit(): Promise<DelegatePermissionDecision> { return 'Deny'; }
        });
        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Batch Partial Defer Host', {
            async CanRead(): Promise<DelegatePermissionDecision> { return 'Allow'; },
            async CanEdit(): Promise<DelegatePermissionDecision> { return 'Defer'; },
            async CanDelete(): Promise<DelegatePermissionDecision> { return 'Deny'; },
            async CanShare(): Promise<DelegatePermissionDecision> { return 'Defer'; }
        });
        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Batch All Defer Host', {
            async CanRead(): Promise<DelegatePermissionDecision> { return 'Defer'; },
            async CanEdit(): Promise<DelegatePermissionDecision> { return 'Defer'; },
            async CanDelete(): Promise<DelegatePermissionDecision> { return 'Defer'; },
            async CanShare(): Promise<DelegatePermissionDecision> { return 'Defer'; }
        });

        const artOwned = 'a1000000-0000-4000-8000-000000000001';
        const artDirectRead = 'a2000000-0000-4000-8000-000000000002';
        const artDirectPlusColEdit = 'a3000000-0000-4000-8000-000000000003';
        const artNestedCol = 'a4000000-0000-4000-8000-000000000004';
        const artDelegateDeniedOwner = 'a5000000-0000-4000-8000-000000000005';
        const artPartialDefer = 'a6000000-0000-4000-8000-000000000006';
        const artAllDeferFallback = 'ac000000-0000-4000-8000-000000000012';
        const artParentChildAllow = 'a7000000-0000-4000-8000-000000000007';
        const artParentChildDeny = 'a8000000-0000-4000-8000-000000000008';
        const artUnreadable = 'a9000000-0000-4000-8000-000000000009';
        const artMissing = 'aa000000-0000-4000-8000-000000000010';
        const artExternalParent = 'ab000000-0000-4000-8000-000000000011';

        const colEdit = 'c1000000-0000-4000-8000-000000000001';
        const colLeaf = 'c2000000-0000-4000-8000-000000000002';
        const colMid = 'c3000000-0000-4000-8000-000000000003';
        const colRootOwned = 'c4000000-0000-4000-8000-000000000004';

        const data: BatchFixtureData = {
            entities: [
                createEntityInfoStub(entArtifactsId, 'MJ: Artifacts'),
                createEntityInfoStub(entDenyId, 'Test: Batch Deny Host'),
                createEntityInfoStub(entDeferId, 'Test: Batch Partial Defer Host'),
                createEntityInfoStub(entAllDeferId, 'Test: Batch All Defer Host')
            ],
            artifacts: [
                { ID: artOwned, UserID: viewer.ID, DelegateEntityID: null, DelegateRecordID: null },
                { ID: artDirectRead, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null },
                { ID: artDirectPlusColEdit, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null },
                { ID: artNestedCol, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null },
                { ID: artDelegateDeniedOwner, UserID: viewer.ID, DelegateEntityID: entDenyId, DelegateRecordID: 'd1000000-0000-4000-8000-000000000001' },
                { ID: artPartialDefer, UserID: ownerId, DelegateEntityID: entDeferId, DelegateRecordID: 'd2000000-0000-4000-8000-000000000002' },
                { ID: artAllDeferFallback, UserID: ownerId, DelegateEntityID: entAllDeferId, DelegateRecordID: 'd3000000-0000-4000-8000-000000000003' },
                { ID: artParentChildAllow, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: artExternalParent },
                { ID: artParentChildDeny, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: artUnreadable },
                { ID: artUnreadable, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null },
                { ID: artExternalParent, UserID: viewer.ID, DelegateEntityID: null, DelegateRecordID: null }
            ],
            directPerms: [
                { ID: 'p1000000-0000-4000-8000-000000000001', ArtifactID: artDirectRead, UserID: viewer.ID, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                { ID: 'p2000000-0000-4000-8000-000000000002', ArtifactID: artDirectPlusColEdit, UserID: viewer.ID, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                { ID: 'p3000000-0000-4000-8000-000000000003', ArtifactID: artAllDeferFallback, UserID: viewer.ID, CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }
            ],
            versions: [
                { ID: 'v1000000-0000-4000-8000-000000000001', ArtifactID: artDirectPlusColEdit },
                { ID: 'v2000000-0000-4000-8000-000000000002', ArtifactID: artNestedCol },
                { ID: 'v3000000-0000-4000-8000-000000000003', ArtifactID: artPartialDefer }
            ],
            collectionArtifacts: [
                { ArtifactVersionID: 'v1000000-0000-4000-8000-000000000001', CollectionID: colEdit },
                { ArtifactVersionID: 'v2000000-0000-4000-8000-000000000002', CollectionID: colLeaf },
                { ArtifactVersionID: 'v3000000-0000-4000-8000-000000000003', CollectionID: colEdit }
            ],
            collections: [
                { ID: colEdit, OwnerID: ownerId, ParentID: null },
                { ID: colLeaf, OwnerID: ownerId, ParentID: colMid },
                { ID: colMid, OwnerID: ownerId, ParentID: colRootOwned },
                { ID: colRootOwned, OwnerID: viewer.ID, ParentID: null }
            ],
            collectionPerms: [
                { CollectionID: colEdit, UserID: viewer.ID, CanRead: true, CanEdit: true, CanDelete: false, CanShare: true }
            ]
        };

        // Explicit golden table authored from pre-PR ResolvePermissions semantics (not derived from ResolvePermissions at runtime).
        const goldenExpectations: Array<{
            id: string;
            expected: { ArtifactID: string; CanRead: boolean; CanEdit: boolean; CanDelete: boolean; CanShare: boolean; Source: string };
        }> = [
            { id: artOwned, expected: { ArtifactID: artOwned, CanRead: true, CanEdit: true, CanDelete: true, CanShare: true, Source: 'Owner' } },
            { id: artDirectRead, expected: { ArtifactID: artDirectRead, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false, Source: 'ArtifactPermission' } },
            { id: artDirectPlusColEdit, expected: { ArtifactID: artDirectPlusColEdit, CanRead: true, CanEdit: true, CanDelete: false, CanShare: true, Source: 'CollectionPermission' } },
            { id: artNestedCol, expected: { ArtifactID: artNestedCol, CanRead: true, CanEdit: true, CanDelete: true, CanShare: true, Source: 'CollectionPermission' } },
            { id: artDelegateDeniedOwner, expected: { ArtifactID: artDelegateDeniedOwner, CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, Source: 'Denied' } },
            { id: artPartialDefer, expected: { ArtifactID: artPartialDefer, CanRead: true, CanEdit: true, CanDelete: false, CanShare: true, Source: 'Delegate' } },
            { id: artAllDeferFallback, expected: { ArtifactID: artAllDeferFallback, CanRead: true, CanEdit: true, CanDelete: false, CanShare: false, Source: 'ArtifactPermission' } },
            { id: artParentChildAllow, expected: { ArtifactID: artParentChildAllow, CanRead: true, CanEdit: true, CanDelete: true, CanShare: true, Source: 'Delegate' } },
            { id: artParentChildDeny, expected: { ArtifactID: artParentChildDeny, CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, Source: 'Denied' } },
            { id: artUnreadable, expected: { ArtifactID: artUnreadable, CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, Source: 'Denied' } },
            { id: artMissing, expected: { ArtifactID: artMissing, CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, Source: 'Denied' } },
            { id: 'not-a-valid-uuid', expected: { ArtifactID: 'not-a-valid-uuid', CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, Source: 'Denied' } }
        ];

        const testIds = goldenExpectations.map((g) => g.id);
        const batchFixture = createBatchProvider(data);
        const batchResults = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(batchFixture.provider, testIds, viewer);

        for (const { id, expected } of goldenExpectations) {
            expect(batchResults.get(id)).toMatchObject(expected);

            const singleFixture = createBatchProvider(data);
            const singleResult = await ArtifactPermissionEngine.Instance.ResolvePermissions(singleFixture.provider, id, viewer);
            expect(singleResult).toMatchObject(expected);
        }

        // Non-deferring custom delegate (Deny) must NOT issue MJ: Artifact Permissions or MJ: Artifact Versions queries.
        const denyOnlyFixture = createBatchProvider(data);
        const denyOnlyRes = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(denyOnlyFixture.provider, [artDelegateDeniedOwner], viewer);
        expect(denyOnlyRes.get(artDelegateDeniedOwner)).toMatchObject({ CanRead: false, Source: 'Denied' });
        expect(denyOnlyFixture.runViewsCalls).toHaveLength(1);
        expect(denyOnlyFixture.runViewsCalls[0].map((p) => p.EntityName)).toEqual(['MJ: Artifacts']);
        expect(denyOnlyFixture.runViewCalls).toHaveLength(0);

        // Magic-link / anonymous principal fails closed for every ID with zero DB queries
        const anonFixture = createBatchProvider(data);
        const anonUser = Object.assign(createTestUser('33333333-3333-4333-8333-333333333333', 'guest@example.com'), {
            IsMagicLinkAnonymous: true
        });
        const anonResults = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(anonFixture.provider, testIds, anonUser);
        expect(anonFixture.runViewCalls).toHaveLength(0);
        expect(anonFixture.runViewsCalls).toHaveLength(0);
        for (const id of testIds) {
            expect(anonResults.get(id)).toMatchObject({
                ArtifactID: id,
                CanRead: false,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: 'Denied'
            });
        }
    });

    it('BuildReadableArtifactIdSet keeps query count flat as candidate count grows (step 4 uses one ResolvePermissionsBatch)', async () => {
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');
        const entArtifactsId = 'e1000000-0000-4000-8000-000000000001';
        const entDenyId = 'e2000000-0000-4000-8000-000000000002';

        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Batch Deny Host', {
            async CanRead(): Promise<DelegatePermissionDecision> { return 'Deny'; },
            async CanEdit(): Promise<DelegatePermissionDecision> { return 'Deny'; }
        });

        const runLibrary = async (count: number) => {
            // Half owned by viewer, half direct-shared with viewer; first owned artifact is denied by delegate;
            // plus 2 parent-delegated child artifacts pointing to owned artifacts.
            const ownedIds = Array.from({ length: count }, (_, i) => `a2000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
            const sharedIds = Array.from({ length: count }, (_, i) => `a3000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
            const childIds = Array.from({ length: Math.min(count, 4) }, (_, i) => `a4000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

            const fixture = createBatchProvider({
                entities: [
                    createEntityInfoStub(entArtifactsId, 'MJ: Artifacts'),
                    createEntityInfoStub(entDenyId, 'Test: Batch Deny Host')
                ],
                artifacts: [
                    ...ownedIds.map((id, idx) => ({
                        ID: id,
                        UserID: viewer.ID,
                        DelegateEntityID: idx === 0 ? entDenyId : null,
                        DelegateRecordID: idx === 0 ? 'd9000000-0000-4000-8000-000000000001' : null
                    })),
                    ...sharedIds.map((id) => ({
                        ID: id,
                        UserID: ownerId,
                        DelegateEntityID: null,
                        DelegateRecordID: null
                    })),
                    ...childIds.map((id, idx) => ({
                        ID: id,
                        UserID: ownerId,
                        DelegateEntityID: entArtifactsId,
                        DelegateRecordID: ownedIds[idx + 1]
                    }))
                ],
                directPerms: sharedIds.map((id, idx) => ({
                    ID: `p9000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
                    ArtifactID: id,
                    UserID: viewer.ID,
                    CanRead: true,
                    CanEdit: false,
                    CanDelete: false,
                    CanShare: false
                })),
                versions: [],
                collectionArtifacts: [],
                collections: [],
                collectionPerms: []
            });

            const readable = await ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(fixture.provider, viewer);
            const totalQueries = fixture.runViewCalls.length + fixture.runViewsCalls.reduce((sum, b) => sum + b.length, 0);
            const totalRoundTrips = fixture.runViewCalls.length + fixture.runViewsCalls.length;
            return { ownedIds, sharedIds, childIds, readable, fixture, totalQueries, totalRoundTrips };
        };

        const small = await runLibrary(5);
        const large = await runLibrary(25);

        // Query count and round-trip count stay strictly flat between 14 candidates and 54 candidates!
        expect(large.totalRoundTrips).toBe(small.totalRoundTrips);
        expect(large.totalQueries).toBe(small.totalQueries);
        // Delegate-denied owned artifact excluded; all other owned, shared, and parent-delegated children included.
        expect(large.readable.has(large.ownedIds[0].toLowerCase())).toBe(false);
        expect(large.readable.has(large.ownedIds[1].toLowerCase())).toBe(true);
        expect(large.readable.has(large.sharedIds[24].toLowerCase())).toBe(true);
        expect(large.readable.has(large.childIds[0].toLowerCase())).toBe(true);
        expect(large.readable.size).toBe(25 - 1 + 25 + 4);
    });

    it('propagates accumulated Depth and VisitedArtifactIDs when a ParentArtifactPermissionDelegate chain reaches a custom delegate', async () => {
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');
        const entArtifactsId = 'e1000000-0000-4000-8000-000000000001';
        const entSpyId = 'e5000000-0000-4000-8000-000000000005';
        const entBackEdgeId = 'e6000000-0000-4000-8000-000000000006';

        const childId = 'a5000001-0000-4000-8000-000000000001';
        const midId = 'a5000002-0000-4000-8000-000000000002';
        const customRootId = 'a5000003-0000-4000-8000-000000000003';
        const backChildId = 'a5000004-0000-4000-8000-000000000004';
        const backCustomId = 'a5000005-0000-4000-8000-000000000005';

        const observed: Array<{ depth: number; visited: string[] }> = [];
        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Batch Parent Chain Spy Host', {
            async CanRead(ctx): Promise<DelegatePermissionDecision> {
                observed.push({ depth: ctx.Depth, visited: Array.from(ctx.VisitedArtifactIDs) });
                return 'Allow';
            },
            async CanEdit(): Promise<DelegatePermissionDecision> { return 'Allow'; },
            async CanDelete(): Promise<DelegatePermissionDecision> { return 'Deny'; },
            async CanShare(): Promise<DelegatePermissionDecision> { return 'Deny'; }
        });

        let backEdgeResult: { CanRead: boolean; Reason: string } | null = null;
        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Batch Parent Chain BackEdge Host', {
            async CanRead(ctx, u): Promise<DelegatePermissionDecision> {
                const rec = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                    ctx.Provider,
                    backChildId,
                    u,
                    ctx.Depth + 1,
                    ctx.VisitedArtifactIDs,
                    ctx.Memo
                );
                backEdgeResult = { CanRead: rec.CanRead, Reason: rec.Reason };
                return rec.CanRead ? 'Allow' : 'Deny';
            },
            async CanEdit(): Promise<DelegatePermissionDecision> { return 'Deny'; }
        });

        const data: BatchFixtureData = {
            entities: [
                createEntityInfoStub(entArtifactsId, 'MJ: Artifacts'),
                createEntityInfoStub(entSpyId, 'Test: Batch Parent Chain Spy Host'),
                createEntityInfoStub(entBackEdgeId, 'Test: Batch Parent Chain BackEdge Host')
            ],
            artifacts: [
                // 2-hop parent chain ending at custom delegate: child -> mid -> customRoot
                { ID: childId, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: midId },
                { ID: midId, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: customRootId },
                { ID: customRootId, UserID: ownerId, DelegateEntityID: entSpyId, DelegateRecordID: 'd5000000-0000-4000-8000-000000000001' },
                // Back-edge cycle through custom delegate: backChild -> backCustom -> (calls ResolvePermissions on backChild)
                { ID: backChildId, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: backCustomId },
                { ID: backCustomId, UserID: ownerId, DelegateEntityID: entBackEdgeId, DelegateRecordID: 'd6000000-0000-4000-8000-000000000001' }
            ],
            directPerms: [],
            versions: [],
            collectionArtifacts: [],
            collections: [],
            collectionPerms: []
        };

        const fixture = createBatchProvider(data);
        const res = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(fixture.provider, [childId, backChildId], viewer);

        expect(res.get(childId)).toMatchObject({ CanRead: true, CanEdit: true, CanDelete: false, CanShare: false, Source: 'Delegate' });
        expect(observed).toHaveLength(1);
        expect(observed[0].depth).toBe(2);
        expect(observed[0].visited).toEqual(expect.arrayContaining([childId, midId, customRootId]));

        // Back-edge recursion detects the cycle immediately because backChildId is in ctx.VisitedArtifactIDs!
        expect(res.get(backChildId)).toMatchObject({ CanRead: false, Source: 'Denied' });
        expect(backEdgeResult).toEqual({
            CanRead: false,
            Reason: 'Circular artifact permission delegation detected.'
        });

        // Neither custom delegate deferred -> zero MJ: Artifact Permissions or MJ: Artifact Versions queries issued.
        const allQueriedEntities = [
            ...fixture.runViewCalls.map((p) => p.EntityName),
            ...fixture.runViewsCalls.flatMap((b) => b.map((p) => p.EntityName))
        ];
        expect(allQueriedEntities).not.toContain('MJ: Artifact Permissions');
        expect(allQueriedEntities).not.toContain('MJ: Artifact Versions');
    });

    it('handles multi-hop intra-batch chains, order independence, indirect sibling chains without memo deadlock, depth>8 caps, and Database-provider user actor separation', async () => {
        const ownerId = '11111111-1111-4111-8111-111111111111';
        const viewer = createTestUser('22222222-2222-4222-8222-222222222222', 'viewer@example.com');
        const systemActor = createTestUser('99999999-9999-4999-8999-999999999999', 'sys@example.com');
        const entArtifactsId = 'e1000000-0000-4000-8000-000000000001';

        const idA = 'a0000001-0000-4000-8000-000000000001';
        const idB = 'a0000002-0000-4000-8000-000000000002';
        const idC = 'a0000003-0000-4000-8000-000000000003';
        const idP1 = 'a0000004-0000-4000-8000-000000000004';
        const idCycX = 'a0000005-0000-4000-8000-000000000005';
        const idCycY = 'a0000006-0000-4000-8000-000000000006';
        const idNonOwned = 'a0000007-0000-4000-8000-000000000007';

        // 10-hop chain: hop[0] (root owned) <- hop[1] <- ... <- hop[9] (depth 9 > MAX_DELEGATE_DEPTH 8)
        const hops = Array.from({ length: 10 }, (_, i) => `a0000010-0000-4000-8000-${String(i).padStart(12, '0')}`);

        const data: BatchFixtureData = {
            entities: [createEntityInfoStub(entArtifactsId, 'MJ: Artifacts')],
            artifacts: [
                // 2-hop chain: A -> B -> C (owned)
                { ID: idA, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: idB },
                { ID: idB, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: idC },
                { ID: idC, UserID: viewer.ID, DelegateEntityID: null, DelegateRecordID: null },
                // External bridge: P1 -> C (owned) so [P1, C] tests indirect sibling with shared memo
                { ID: idP1, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: idC },
                // Mutual cycle: X -> Y -> X
                { ID: idCycX, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: idCycY },
                { ID: idCycY, UserID: ownerId, DelegateEntityID: entArtifactsId, DelegateRecordID: idCycX },
                // Non-owned artifact to exercise direct permissions + versions actor separation on Database provider
                { ID: idNonOwned, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null },
                // 10-hop chain
                { ID: hops[0], UserID: viewer.ID, DelegateEntityID: null, DelegateRecordID: null },
                ...hops.slice(1).map((id, idx) => ({
                    ID: id,
                    UserID: ownerId,
                    DelegateEntityID: entArtifactsId,
                    DelegateRecordID: hops[idx]
                }))
            ],
            directPerms: [
                { ID: 'p0000007-0000-4000-8000-000000000007', ArtifactID: idNonOwned, UserID: viewer.ID, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }
            ],
            versions: [],
            collectionArtifacts: [],
            collections: [],
            collectionPerms: []
        };

        // 1. 2-hop external chain [A, B] where C is external: both A and B must succeed
        const twoHop = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(
            createBatchProvider(data).provider,
            [idA, idB],
            viewer
        );
        expect(twoHop.get(idA)?.CanRead).toBe(true);
        expect(twoHop.get(idB)?.CanRead).toBe(true);

        // 2. Order independence: [A, B, C] === [C, B, A]
        const fwd = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(
            createBatchProvider(data).provider,
            [idA, idB, idC],
            viewer
        );
        const rev = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(
            createBatchProvider(data).provider,
            [idC, idB, idA],
            viewer
        );
        expect(fwd.get(idA)).toEqual(rev.get(idA));
        expect(fwd.get(idB)).toEqual(rev.get(idB));
        expect(fwd.get(idC)).toEqual(rev.get(idC));
        expect(fwd.get(idA)?.CanRead).toBe(true);

        // 3. Shared memo & indirect sibling + mutual cycle: settles without deadlock
        const sharedMemo = new Map<string, Promise<import('../custom/ArtifactPermissionDelegate').ResolvedArtifactPermissions>>();
        const mixed = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(
            createBatchProvider(data).provider,
            [idA, idP1, idC, idCycX, idCycY],
            viewer,
            0,
            undefined,
            sharedMemo
        );
        expect(mixed.get(idA)?.CanRead).toBe(true);
        expect(mixed.get(idP1)?.CanRead).toBe(true);
        expect(mixed.get(idC)?.CanRead).toBe(true);
        expect(mixed.get(idCycX)?.CanRead).toBe(false);
        expect(mixed.get(idCycY)?.CanRead).toBe(false);

        // 4. MAX_DELEGATE_DEPTH = 8 enforced identically inside a single batch
        const depthBatch = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(
            createBatchProvider(data).provider,
            hops,
            viewer
        );
        expect(depthBatch.get(hops[8])?.CanRead).toBe(true);
        expect(depthBatch.get(hops[9])?.CanRead).toBe(false);
        const singleHop9 = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            createBatchProvider(data).provider,
            hops[9],
            viewer
        );
        expect(depthBatch.get(hops[9])).toEqual(singleHop9);

        // 5. Database provider preserves `viewer` actor on MJ: Artifacts / MJ: Artifact Permissions and uses `systemUser` on MJ: Artifact Versions
        const getSystemUserSpy = vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemActor);
        const observedActors: Array<{ entities: string[]; bypassCache: boolean[]; actorId: string | undefined }> = [];
        const baseDb = createBatchProvider(data);
        const dbProvider = {
            ...baseDb.provider,
            ProviderType: 'Database',
            RunView: vi.fn(async (p: RunViewParams, actor?: UserInfo) => {
                observedActors.push({ entities: [p.EntityName ?? ''], bypassCache: [Boolean(p.BypassCache)], actorId: actor?.ID });
                return (baseDb.provider as unknown as { RunView: (p: RunViewParams) => Promise<unknown> }).RunView(p);
            }),
            RunViews: vi.fn(async (list: RunViewParams[], actor?: UserInfo) => {
                observedActors.push({
                    entities: list.map((p) => p.EntityName ?? ''),
                    bypassCache: list.map((p) => Boolean(p.BypassCache)),
                    actorId: actor?.ID
                });
                return (baseDb.provider as unknown as { RunViews: (l: RunViewParams[]) => Promise<unknown[]> }).RunViews(list);
            })
        } as unknown as IMetadataProvider;

        // First: all-owner + parent-delegated-to-owner batch never even touches GetSystemUser!
        const ownedOnlyRes = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(dbProvider, [idC, idB], viewer);
        expect(ownedOnlyRes.get(idC)?.CanRead).toBe(true);
        expect(ownedOnlyRes.get(idB)?.CanRead).toBe(true);
        expect(getSystemUserSpy).not.toHaveBeenCalled();

        // Second: batch with a non-owned artifact uses `viewer` for MJ: Artifacts & MJ: Artifact Permissions, `systemActor` for MJ: Artifact Versions.
        observedActors.length = 0;
        const dbRes = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(dbProvider, [idC, idNonOwned], viewer);
        expect(dbRes.get(idC)?.CanRead).toBe(true);
        expect(dbRes.get(idNonOwned)?.CanRead).toBe(true);
        const artBatch = observedActors.find((a) => a.entities.includes('MJ: Artifacts'));
        const directBatch = observedActors.find((a) => a.entities.includes('MJ: Artifact Permissions'));
        const verBatch = observedActors.find((a) => a.entities.includes('MJ: Artifact Versions'));
        expect(artBatch?.actorId).toBe(viewer.ID);
        expect(directBatch?.actorId).toBe(viewer.ID);
        expect(verBatch?.actorId).toBe(systemActor.ID);
        for (const call of observedActors) {
            expect(call.bypassCache.every(Boolean)).toBe(true);
        }
    });
});
