import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    EntityFieldInfo,
    EntityInfo,
    EntityUserPermissionInfo,
    IMetadataProvider,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ARTIFACT_PERMISSION_IN_CLAUSE_CHUNK_SIZE,
    ArtifactDelegateContext,
    ArtifactPermissionEngine,
    DelegatePermissionDecision,
    IArtifactPermissionDelegate,
} from '../custom/ArtifactPermissionDelegate';

interface SearchCandidate {
    ArtifactID: string;
    Score: number;
    Snippet: string;
}

interface MockArtifactRow {
    ID: string;
    UserID: string;
    DelegateEntityID: string | null;
    DelegateRecordID: string | null;
}

interface MockDirectPermRow {
    ID: string;
    ArtifactID: string;
    UserID: string;
    CanRead: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    CanShare: boolean;
}

function makeUuid(prefix: string, index: number): string {
    const suffix = index.toString(16).padStart(12, '0');
    return `${prefix}-7005-4005-8005-${suffix}`;
}

function createUser(
    id: string,
    email: string,
    overrides?: { IsActive?: boolean; IsMagicLinkAnonymous?: boolean; MagicLinkScope?: UserInfo['MagicLinkScope'] }
): UserInfo {
    const user = new UserInfo(null, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: overrides?.IsActive ?? true,
        Type: 'User',
        UserRoles: [],
    });
    if (overrides?.IsMagicLinkAnonymous) {
        user.IsMagicLinkAnonymous = true;
    }
    if (overrides?.MagicLinkScope) {
        user.MagicLinkScope = overrides.MagicLinkScope;
    }
    return user;
}

function createEntityPermissions(
    flags: Partial<Pick<EntityUserPermissionInfo, 'CanRead' | 'CanCreate' | 'CanUpdate' | 'CanDelete'>>
): EntityUserPermissionInfo {
    const perms = new EntityUserPermissionInfo();
    perms.CanRead = Boolean(flags.CanRead);
    perms.CanCreate = Boolean(flags.CanCreate);
    perms.CanUpdate = Boolean(flags.CanUpdate);
    perms.CanDelete = Boolean(flags.CanDelete);
    return perms;
}

function createMockEntityInfo(config: {
    ID: string;
    Name: string;
    ResolvePermissions: (user: UserInfo) => EntityUserPermissionInfo;
}): EntityInfo {
    const pkField = { Name: 'ID', IsPrimaryKey: true } as EntityFieldInfo;
    return {
        ID: config.ID,
        Name: config.Name,
        PrimaryKeys: [pkField],
        FirstPrimaryKey: pkField,
        GetUserPermisions: vi.fn((user: UserInfo) => config.ResolvePermissions(user)),
    } as Pick<EntityInfo, 'ID' | 'Name' | 'PrimaryKeys' | 'FirstPrimaryKey' | 'GetUserPermisions'> as EntityInfo;
}

function extractInClauseIds(filter: RunViewParams['ExtraFilter']): string[] {
    if (typeof filter !== 'string' || !filter) {
        return [];
    }
    const matches = filter.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
    return matches ?? [];
}

interface ProviderHarness {
    Provider: IMetadataProvider;
    ObservedQueries: Array<{ EntityName: string; ActorID: string | undefined; Params: RunViewParams }>;
    GetEntityObjectSpy: ReturnType<typeof vi.fn>;
}

function createProviderHarness(options: {
    Entities: EntityInfo[];
    Artifacts: MockArtifactRow[];
    DirectPermissions?: MockDirectPermRow[];
    HostRecordsByEntity: Record<string, Array<{ ID: string }>>;
}): ProviderHarness {
    const observedQueries: Array<{ EntityName: string; ActorID: string | undefined; Params: RunViewParams }> = [];

    const executeQuery = async (params: RunViewParams, contextUser?: UserInfo) => {
        observedQueries.push({
            EntityName: params.EntityName ?? '',
            ActorID: contextUser?.ID,
            Params: params,
        });

        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        const filterLower = filter.toLowerCase();

        if (params.EntityName === 'MJ: Artifacts') {
            const ids = extractInClauseIds(filter).map((id) => id.toLowerCase());
            const idSet = new Set(ids);
            const rows = options.Artifacts.filter((a) => idSet.has(a.ID.toLowerCase()));
            return {
                Success: true,
                Results: rows,
                RowCount: rows.length,
                TotalRowCount: rows.length,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        }

        if (params.EntityName === 'MJ: Artifact Permissions') {
            const rows = (options.DirectPermissions ?? []).filter(
                (p) => filterLower.includes(p.ArtifactID.toLowerCase()) && filterLower.includes(p.UserID.toLowerCase())
            );
            return {
                Success: true,
                Results: rows,
                RowCount: rows.length,
                TotalRowCount: rows.length,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        }

        if (
            params.EntityName === 'MJ: Artifact Versions' ||
            params.EntityName === 'MJ: Collection Artifacts' ||
            params.EntityName === 'MJ: Collections' ||
            params.EntityName === 'MJ: Collection Permissions'
        ) {
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: '',
            };
        }

        const hostRows = options.HostRecordsByEntity[params.EntityName ?? ''] ?? [];
        const ids = extractInClauseIds(filter).map((id) => id.toLowerCase());
        const idSet = new Set(ids);
        const matched = hostRows.filter((row) => idSet.has(row.ID.toLowerCase()));
        return {
            Success: true,
            Results: matched,
            RowCount: matched.length,
            TotalRowCount: matched.length,
            ExecutionTime: 1,
            ErrorMessage: '',
        };
    };

    const getEntityObjectSpy = vi.fn(async () => {
        throw new Error('GetEntityObject must NEVER be called during batched permission filtering');
    });

    const provider: Partial<IMetadataProvider> = {
        ProviderType: 'Network',
        Entities: options.Entities,
        EntityByID: (id: string) => options.Entities.find((e) => UUIDsEqual(e.ID, id)),
        EntityByName: (name: string) =>
            options.Entities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
        GetEntityObject: getEntityObjectSpy,
    };

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(executeQuery),
        RunViews: vi.fn(async (paramsList: RunViewParams[], contextUser?: UserInfo) =>
            Promise.all(paramsList.map((p) => executeQuery(p, contextUser)))
        ),
    } as Pick<RunView, 'RunView' | 'RunViews'> as RunView);

    return {
        Provider: provider as IMetadataProvider,
        ObservedQueries: observedQueries,
        GetEntityObjectSpy: getEntityObjectSpy,
    };
}

describe('ArtifactPermissionEngine — Batched DelegateEntityID Permission Filter (P0.5)', () => {
    const ownerId = makeUuid('11110000', 1);
    const editorUser = createUser(makeUuid('22220000', 1), 'editor@example.com');
    const readerUser = createUser(makeUuid('22220000', 2), 'reader@example.com');
    const noAccessUser = createUser(makeUuid('22220000', 3), 'noaccess@example.com');
    const inactiveUser = createUser(makeUuid('22220000', 4), 'inactive@example.com', { IsActive: false });
    const magicLinkUser = createUser(makeUuid('22220000', 5), 'guest@example.com', {
        IsMagicLinkAnonymous: true,
        MagicLinkScope: { ResourceID: makeUuid('99990000', 1), ResourceType: 'MJ: Artifacts' },
    });

    const projectsEntityId = makeUuid('e1000000', 1);
    const companiesEntityId = makeUuid('e2000000', 1);
    const unknownEntityId = makeUuid('e9990000', 1);

    afterEach(() => {
        vi.restoreAllMocks();
        ArtifactPermissionEngine.Instance.UnregisterDelegate('Test: Custom Projects');
        ArtifactPermissionEngine.Instance.UnregisterDelegate(projectsEntityId);
    });

    it('filters mixed batches across custom delegate, default entity fallback, standalone owner/shared/unshared, unknown entity, and RLS-hidden records while preserving order without mutating input', async () => {
        const customProjectsEntity = createMockEntityInfo({
            ID: projectsEntityId,
            Name: 'Test: Custom Projects',
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: true }),
        });
        const fallbackCompaniesEntity = createMockEntityInfo({
            ID: companiesEntityId,
            Name: 'Test: Fallback Companies',
            ResolvePermissions: (u) => {
                if (UUIDsEqual(u.ID, editorUser.ID)) {
                    return createEntityPermissions({ CanRead: true, CanUpdate: true, CanDelete: false });
                }
                if (UUIDsEqual(u.ID, readerUser.ID)) {
                    return createEntityPermissions({ CanRead: true, CanUpdate: false, CanDelete: false });
                }
                return createEntityPermissions({ CanRead: false, CanUpdate: false, CanDelete: false });
            },
        });

        const allowedProjectRec = makeUuid('b1000000', 1);
        const deniedProjectRec = makeUuid('b1000000', 2);
        const visibleCompanyRec = makeUuid('b2000000', 1);
        const rlsHiddenCompanyRec = makeUuid('b2000000', 99);

        const customDelegate: IArtifactPermissionDelegate = {
            CanRead: vi.fn(async (ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> =>
                UUIDsEqual(ctx.DelegateRecordID, allowedProjectRec) ? 'Allow' : 'Deny'
            ),
            CanEdit: vi.fn(async (ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> =>
                UUIDsEqual(ctx.DelegateRecordID, allowedProjectRec) ? 'Allow' : 'Deny'
            ),
        };
        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Custom Projects', customDelegate);

        const artCustomAllow = makeUuid('a0000001', 1);
        const artCustomDeny = makeUuid('a0000001', 2);
        const artFallbackVisible = makeUuid('a0000001', 3);
        const artFallbackHidden = makeUuid('a0000001', 4);
        const artUnknownEntity = makeUuid('a0000001', 5);
        const artStandaloneOwned = makeUuid('a0000001', 6);
        const artStandaloneShared = makeUuid('a0000001', 7);
        const artStandalonePrivate = makeUuid('a0000001', 8);

        const harness = createProviderHarness({
            Entities: [customProjectsEntity, fallbackCompaniesEntity],
            Artifacts: [
                { ID: artCustomAllow, UserID: ownerId, DelegateEntityID: projectsEntityId, DelegateRecordID: allowedProjectRec },
                { ID: artCustomDeny, UserID: editorUser.ID, DelegateEntityID: projectsEntityId, DelegateRecordID: deniedProjectRec },
                { ID: artFallbackVisible, UserID: ownerId, DelegateEntityID: companiesEntityId, DelegateRecordID: visibleCompanyRec },
                { ID: artFallbackHidden, UserID: ownerId, DelegateEntityID: companiesEntityId, DelegateRecordID: rlsHiddenCompanyRec },
                { ID: artUnknownEntity, UserID: ownerId, DelegateEntityID: unknownEntityId, DelegateRecordID: visibleCompanyRec },
                { ID: artStandaloneOwned, UserID: editorUser.ID, DelegateEntityID: null, DelegateRecordID: null },
                { ID: artStandaloneShared, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null },
                { ID: artStandalonePrivate, UserID: ownerId, DelegateEntityID: null, DelegateRecordID: null },
            ],
            DirectPermissions: [
                {
                    ID: makeUuid('d0000001', 1),
                    ArtifactID: artStandaloneShared,
                    UserID: editorUser.ID,
                    CanRead: true,
                    CanEdit: false,
                    CanDelete: false,
                    CanShare: false,
                },
            ],
            HostRecordsByEntity: {
                'Test: Fallback Companies': [{ ID: visibleCompanyRec }],
            },
        });

        const candidates: ReadonlyArray<SearchCandidate> = Object.freeze([
            Object.freeze({ ArtifactID: artStandalonePrivate, Score: 0.99, Snippet: 'private' }),
            Object.freeze({ ArtifactID: artCustomAllow, Score: 0.97, Snippet: 'custom allow' }),
            Object.freeze({ ArtifactID: artUnknownEntity, Score: 0.95, Snippet: 'unknown entity' }),
            Object.freeze({ ArtifactID: artFallbackVisible.toUpperCase(), Score: 0.93, Snippet: 'fallback visible uppercase' }),
            Object.freeze({ ArtifactID: artCustomDeny, Score: 0.91, Snippet: 'custom deny' }),
            Object.freeze({ ArtifactID: artStandaloneOwned, Score: 0.89, Snippet: 'standalone owned' }),
            Object.freeze({ ArtifactID: artFallbackHidden, Score: 0.87, Snippet: 'rls hidden' }),
            Object.freeze({ ArtifactID: artStandaloneShared, Score: 0.85, Snippet: 'standalone shared' }),
        ]);

        const res = await ArtifactPermissionEngine.Instance.FilterArtifactsByPermissionBatch(
            harness.Provider,
            candidates,
            (c) => c.ArtifactID,
            editorUser
        );

        expect(res.TotalCount).toBe(8);
        expect(res.AllowedCount).toBe(4);
        expect(res.DeniedCount).toBe(4);
        expect(res.Allowed.map((c) => c.Snippet)).toEqual([
            'custom allow',
            'fallback visible uppercase',
            'standalone owned',
            'standalone shared',
        ]);
        expect(res.Denied.map((c) => c.Snippet)).toEqual([
            'private',
            'unknown entity',
            'custom deny',
            'rls hidden',
        ]);
        expect(res.Outcomes).toHaveLength(8);
        expect(res.Outcomes.map((o) => o.Allowed)).toEqual([false, true, false, true, false, true, false, true]);
        expect(res.PermissionsByArtifactID.get(artFallbackVisible.toUpperCase())?.Source).toBe('Delegate');
        expect(res.PermissionsByArtifactID.get(artUnknownEntity)?.Source).toBe('Denied');
        expect(harness.GetEntityObjectSpy).not.toHaveBeenCalled();

        // RequiredAction: 'Edit' strips read-only direct share while retaining custom-allow, fallback-editor, and owner
        const editRes = await ArtifactPermissionEngine.Instance.FilterArtifactsByPermissionBatch(
            harness.Provider,
            candidates,
            (c) => c.ArtifactID,
            editorUser,
            { RequiredAction: 'Edit' }
        );
        expect(editRes.Allowed.map((c) => c.Snippet)).toEqual([
            'custom allow',
            'fallback visible uppercase',
            'standalone owned',
        ]);

        // Read-only user sees fallback artifact on Read, gets empty on Edit
        const readerRead = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
            harness.Provider,
            [artFallbackVisible, artFallbackHidden],
            readerUser
        );
        expect(readerRead.AllowedIDs).toEqual([artFallbackVisible]);
        expect(readerRead.DeniedIDs).toEqual([artFallbackHidden]);

        const readerEdit = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
            harness.Provider,
            [artFallbackVisible],
            readerUser,
            { RequiredAction: 'Edit' }
        );
        expect(readerEdit.AllowedIDs).toEqual([]);
        expect(readerEdit.DeniedIDs).toEqual([artFallbackVisible]);

        // No-Access user is denied even on visible host record
        const noAccessRes = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
            harness.Provider,
            [artFallbackVisible],
            noAccessUser
        );
        expect(noAccessRes.AllowedIDs).toEqual([]);
        expect(noAccessRes.DeniedIDs).toEqual([artFallbackVisible]);
    });

    it('chunks > 200 delegated candidates (450 IDs) into 3 bounded IN-clause queries of <= 200 IDs each with ResultType simple and zero N+1 loops', async () => {
        expect(ARTIFACT_PERMISSION_IN_CLAUSE_CHUNK_SIZE).toBe(200);

        const totalCandidates = 450;
        const companiesEntity = createMockEntityInfo({
            ID: companiesEntityId,
            Name: 'Test: Bulk Companies',
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: false }),
        });

        const artifacts: MockArtifactRow[] = [];
        const visibleHostRecords: Array<{ ID: string }> = [];
        const candidateIds: string[] = [];

        for (let i = 1; i <= totalCandidates; i++) {
            const artId = makeUuid('a4500000', i);
            const recId = makeUuid('b4500000', i);
            candidateIds.push(artId);
            artifacts.push({
                ID: artId,
                UserID: ownerId,
                DelegateEntityID: companiesEntityId,
                DelegateRecordID: recId,
            });
            // Make every odd-indexed host record visible under RLS; even-indexed records hidden
            if (i % 2 === 1) {
                visibleHostRecords.push({ ID: recId });
            }
        }

        const harness = createProviderHarness({
            Entities: [companiesEntity],
            Artifacts: artifacts,
            HostRecordsByEntity: {
                'Test: Bulk Companies': visibleHostRecords,
            },
        });

        const result = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
            harness.Provider,
            candidateIds,
            readerUser
        );

        expect(result.AllowedIDs).toHaveLength(225);
        expect(result.DeniedIDs).toHaveLength(225);
        expect(result.AllowedIDs[0]).toBe(makeUuid('a4500000', 1));
        expect(result.AllowedIDs[224]).toBe(makeUuid('a4500000', 449));

        const artifactQueries = harness.ObservedQueries.filter((q) => q.EntityName === 'MJ: Artifacts');
        expect(artifactQueries).toHaveLength(3);
        const artifactChunkSizes = artifactQueries.map((q) => extractInClauseIds(q.Params.ExtraFilter).length);
        expect(artifactChunkSizes).toEqual([200, 200, 50]);
        for (const q of artifactQueries) {
            expect(q.Params.ResultType).toBe('simple');
            expect(q.ActorID).toBe(readerUser.ID);
        }

        const hostQueries = harness.ObservedQueries.filter((q) => q.EntityName === 'Test: Bulk Companies');
        expect(hostQueries).toHaveLength(3);
        const hostChunkSizes = hostQueries.map((q) => extractInClauseIds(q.Params.ExtraFilter).length);
        expect(hostChunkSizes).toEqual([200, 200, 50]);
        for (const q of hostQueries) {
            expect(q.Params.ResultType).toBe('simple');
            expect(q.Params.Fields).toEqual(['ID']);
            expect(q.ActorID).toBe(readerUser.ID);
        }
        expect(harness.GetEntityObjectSpy).not.toHaveBeenCalled();
    });

    it('fails closed with zero DB queries when contextUser is null, undefined, inactive, magic-link-scoped, or invalid UUID', async () => {
        const companiesEntity = createMockEntityInfo({
            ID: companiesEntityId,
            Name: 'Test: Fallback Companies',
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: true }),
        });
        const artId = makeUuid('a9990000', 1);
        const recId = makeUuid('b9990000', 1);

        const harness = createProviderHarness({
            Entities: [companiesEntity],
            Artifacts: [
                { ID: artId, UserID: ownerId, DelegateEntityID: companiesEntityId, DelegateRecordID: recId },
            ],
            HostRecordsByEntity: {
                'Test: Fallback Companies': [{ ID: recId }],
            },
        });

        const invalidUsers: Array<UserInfo | null | undefined> = [
            null,
            undefined,
            inactiveUser,
            magicLinkUser,
            createUser('not-a-valid-uuid', 'bad@example.com'),
        ];

        for (const badUser of invalidUsers) {
            const res = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
                harness.Provider,
                [artId],
                badUser
            );
            expect(res.AllowedIDs).toEqual([]);
            expect(res.DeniedIDs).toEqual([artId]);
            expect(res.PermissionsByArtifactID.get(artId)?.Source).toBe('Denied');
        }

        expect(harness.ObservedQueries).toHaveLength(0);
    });

    it('handles empty candidate lists, invalid UUID entries alongside valid ones, and case-insensitive UUID deduplication', async () => {
        const companiesEntity = createMockEntityInfo({
            ID: companiesEntityId,
            Name: 'Test: Dedup Companies',
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: false }),
        });
        const artLower = makeUuid('a7770000', 1);
        const artUpper = artLower.toUpperCase();
        const recId = makeUuid('b7770000', 1);

        const harness = createProviderHarness({
            Entities: [companiesEntity],
            Artifacts: [
                { ID: artLower, UserID: ownerId, DelegateEntityID: companiesEntityId, DelegateRecordID: recId },
            ],
            HostRecordsByEntity: {
                'Test: Dedup Companies': [{ ID: recId }],
            },
        });

        const empty = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
            harness.Provider,
            [],
            readerUser
        );
        expect(empty.AllowedIDs).toEqual([]);
        expect(empty.DeniedIDs).toEqual([]);
        expect(harness.ObservedQueries).toHaveLength(0);

        const mixed = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
            harness.Provider,
            ['', 'not-a-uuid', artUpper, artLower],
            readerUser
        );
        expect(mixed.AllowedIDs).toEqual([artUpper]);
        expect(mixed.DeniedIDs).toEqual(['', 'not-a-uuid']);

        // Only 1 artifact query with 1 deduplicated UUID issued despite both upper & lower variants
        const artifactQueries = harness.ObservedQueries.filter((q) => q.EntityName === 'MJ: Artifacts');
        expect(artifactQueries).toHaveLength(1);
        expect(extractInClauseIds(artifactQueries[0].Params.ExtraFilter)).toHaveLength(1);
    });
});
