import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    EntityFieldInfo,
    EntityInfo,
    EntityUserPermissionInfo,
    IMetadataProvider,
    RunView,
    RunViewParams,
    UserInfo
} from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    ArtifactDelegateContext,
    ArtifactPermissionEngine,
    DelegatePermissionDecision,
    IArtifactPermissionDelegate
} from '../custom/ArtifactPermissionDelegate';
import { MJRecordArtifactEntity } from '../generated/entities/__mj';
import { MJRecordArtifactSchema } from '../generated/schemas/__mj';

function createUser(id: string, email: string): UserInfo {
    return new UserInfo(null, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: []
    });
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

interface MockEntityConfig {
    ID: string;
    Name: string;
    PrimaryKeyNames?: string[];
    ResolvePermissions: (user: UserInfo) => EntityUserPermissionInfo;
}

function createMockEntityInfo(config: MockEntityConfig): EntityInfo {
    const pkNames = config.PrimaryKeyNames ?? ['ID'];
    const primaryKeys = pkNames.map((name) => ({ Name: name, IsPrimaryKey: true } as EntityFieldInfo));
    return {
        ID: config.ID,
        Name: config.Name,
        PrimaryKeys: primaryKeys,
        FirstPrimaryKey: primaryKeys[0],
        GetUserPermisions: vi.fn((user: UserInfo) => config.ResolvePermissions(user))
    } as Pick<EntityInfo, 'ID' | 'Name' | 'PrimaryKeys' | 'FirstPrimaryKey' | 'GetUserPermisions'> as EntityInfo;
}

interface MockProviderFixture {
    Provider: IMetadataProvider;
    RunViewSpy: ReturnType<typeof vi.fn>;
    ObservedActors: Array<{ EntityName: string; ActorId: string | undefined; Params: RunViewParams }>;
}

function createProviderFixture(options: {
    Entities: EntityInfo[];
    Artifacts: Array<{
        ID: string;
        UserID: string;
        DelegateEntityID: string | null;
        DelegateRecordID: string | null;
    }>;
    HostRecordsByEntity: Record<string, Array<Record<string, string | number>>>;
    FailHostQuery?: boolean;
}): MockProviderFixture {
    const observedActors: Array<{ EntityName: string; ActorId: string | undefined; Params: RunViewParams }> = [];
    const runViewSpy = vi.fn(async (params: RunViewParams, contextUser?: UserInfo) => {
        observedActors.push({
            EntityName: params.EntityName ?? '',
            ActorId: contextUser?.ID,
            Params: params
        });

        if (params.EntityName === 'MJ: Artifacts') {
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            const rows = options.Artifacts.filter((a) => filter.toLowerCase().includes(a.ID.toLowerCase()));
            return {
                Success: true,
                Results: rows,
                RowCount: rows.length,
                TotalRowCount: rows.length,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        }

        if (options.FailHostQuery) {
            return {
                Success: false,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: 'Simulated host RLS query failure'
            };
        }

        const hostRows = options.HostRecordsByEntity[params.EntityName ?? ''] ?? [];
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter.toLowerCase() : '';
        const matched = hostRows.filter((row) =>
            Object.values(row).some((val) => filter.includes(String(val).toLowerCase()))
        );
        return {
            Success: true,
            Results: matched,
            RowCount: matched.length,
            TotalRowCount: matched.length,
            ExecutionTime: 1,
            ErrorMessage: ''
        };
    });

    const provider: Partial<IMetadataProvider> = {
        ProviderType: 'Database',
        Entities: options.Entities,
        EntityByID: (id: string) => options.Entities.find((e) => UUIDsEqual(e.ID, id)),
        EntityByName: (name: string) =>
            options.Entities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase())
    };

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: runViewSpy
    } as Pick<RunView, 'RunView'> as RunView);

    return {
        Provider: provider as IMetadataProvider,
        RunViewSpy: runViewSpy,
        ObservedActors: observedActors
    };
}

describe('ArtifactPermissionEngine — Default Entity-Level Read/Update Delegation Fallback (P0.1)', () => {
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const editorUser = createUser('22222222-2222-4222-8222-222222222222', 'editor@example.com');
    const readerUser = createUser('33333333-3333-4333-8333-333333333333', 'reader@example.com');
    const unauthorizedUser = createUser('44444444-4444-4444-8444-444444444444', 'outsider@example.com');
    const projectsEntityId = 'e1111111-1111-4111-8111-111111111111';
    const dealsEntityId = 'e2222222-2222-4222-8222-222222222222';
    const unknownEntityId = 'e9999999-9999-4999-8999-999999999999';
    const projectRecordId = 'b1111111-1111-4111-8111-111111111111';
    const rlsHiddenRecordId = 'b2222222-2222-4222-8222-222222222222';
    const artifactId = 'a1111111-1111-4111-8111-111111111111';

    afterEach(() => {
        vi.restoreAllMocks();
        ArtifactPermissionEngine.Instance.UnregisterDelegate('Test: Precedence Projects');
        ArtifactPermissionEngine.Instance.UnregisterDelegate(projectsEntityId);
    });

    it('(a) custom registered IArtifactPermissionDelegate retains strict precedence over default entity fallback', async () => {
        const entityInfo = createMockEntityInfo({
            ID: projectsEntityId,
            Name: 'Test: Precedence Projects',
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: true, CanDelete: true })
        });

        const customDelegate: IArtifactPermissionDelegate = {
            CanRead: vi.fn(async (_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> => 'Allow'),
            CanEdit: vi.fn(async (_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> => 'Deny'),
            CanDelete: vi.fn(async (_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> => 'Deny'),
            CanShare: vi.fn(async (_ctx: ArtifactDelegateContext): Promise<DelegatePermissionDecision> => 'Deny')
        };
        ArtifactPermissionEngine.Instance.RegisterDelegate('Test: Precedence Projects', customDelegate);

        const fixture = createProviderFixture({
            Entities: [entityInfo],
            Artifacts: [
                {
                    ID: artifactId,
                    UserID: ownerId,
                    DelegateEntityID: projectsEntityId,
                    DelegateRecordID: projectRecordId
                }
            ],
            HostRecordsByEntity: {
                'Test: Precedence Projects': [{ ID: projectRecordId }]
            }
        });

        const resolved = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            fixture.Provider,
            artifactId,
            editorUser
        );

        expect(resolved.CanRead).toBe(true);
        expect(resolved.CanEdit).toBe(false);
        expect(resolved.CanDelete).toBe(false);
        expect(resolved.CanShare).toBe(false);
        expect(resolved.Source).toBe('Delegate');
        expect(customDelegate.CanRead).toHaveBeenCalledTimes(1);
        expect(customDelegate.CanEdit).toHaveBeenCalledTimes(1);
        expect(entityInfo.GetUserPermisions).not.toHaveBeenCalled();
    });

    it('(b) default fallback grants Read + Edit + Share when user has entity Read + Update permissions and host record passes RLS', async () => {
        const entityInfo = createMockEntityInfo({
            ID: projectsEntityId,
            Name: 'Test: Fallback Projects',
            ResolvePermissions: (u) =>
                UUIDsEqual(u.ID, editorUser.ID)
                    ? createEntityPermissions({ CanRead: true, CanUpdate: true, CanDelete: false })
                    : createEntityPermissions({})
        });

        const fixture = createProviderFixture({
            Entities: [entityInfo],
            Artifacts: [
                {
                    ID: artifactId,
                    UserID: ownerId,
                    DelegateEntityID: projectsEntityId,
                    DelegateRecordID: projectRecordId
                }
            ],
            HostRecordsByEntity: {
                'Test: Fallback Projects': [{ ID: projectRecordId }]
            }
        });

        const resolved = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            fixture.Provider,
            artifactId,
            editorUser
        );

        expect(resolved).toMatchObject({
            ArtifactID: artifactId,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: true,
            Source: 'Delegate'
        });
        expect(resolved.Reason).toContain('default entity-level fallback');
        expect(await ArtifactPermissionEngine.Instance.CheckPermission(fixture.Provider, artifactId, editorUser, 'Edit')).toBe(true);
    });

    it('(c) default fallback grants Read-only access when user has entity Read but NOT Update', async () => {
        const entityInfo = createMockEntityInfo({
            ID: projectsEntityId,
            Name: 'Test: Fallback Projects',
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: false, CanDelete: false })
        });

        const fixture = createProviderFixture({
            Entities: [entityInfo],
            Artifacts: [
                {
                    ID: artifactId,
                    UserID: ownerId,
                    DelegateEntityID: projectsEntityId,
                    DelegateRecordID: projectRecordId
                }
            ],
            HostRecordsByEntity: {
                'Test: Fallback Projects': [{ ID: projectRecordId }]
            }
        });

        const resolved = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            fixture.Provider,
            artifactId,
            readerUser
        );

        expect(resolved).toMatchObject({
            ArtifactID: artifactId,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Delegate'
        });
        expect(await ArtifactPermissionEngine.Instance.CheckPermission(fixture.Provider, artifactId, readerUser, 'Read')).toBe(true);
        expect(await ArtifactPermissionEngine.Instance.CheckPermission(fixture.Provider, artifactId, readerUser, 'Edit')).toBe(false);
    });

    it('(d) default fallback denies all permissions when user lacks entity Read permission or host record is hidden by RLS', async () => {
        const entityInfo = createMockEntityInfo({
            ID: projectsEntityId,
            Name: 'Test: Fallback Projects',
            ResolvePermissions: (u) =>
                UUIDsEqual(u.ID, unauthorizedUser.ID)
                    ? createEntityPermissions({ CanRead: false, CanUpdate: false, CanDelete: false })
                    : createEntityPermissions({ CanRead: true, CanUpdate: true, CanDelete: true })
        });

        const rlsHiddenArtifactId = 'a2222222-2222-4222-8222-222222222222';
        const fixture = createProviderFixture({
            Entities: [entityInfo],
            Artifacts: [
                {
                    ID: artifactId,
                    UserID: unauthorizedUser.ID, // even artifact owner must not bypass entity delegation denial
                    DelegateEntityID: projectsEntityId,
                    DelegateRecordID: projectRecordId
                },
                {
                    ID: rlsHiddenArtifactId,
                    UserID: ownerId,
                    DelegateEntityID: projectsEntityId,
                    DelegateRecordID: rlsHiddenRecordId
                }
            ],
            HostRecordsByEntity: {
                'Test: Fallback Projects': [{ ID: projectRecordId }] // rlsHiddenRecordId absent (filtered out by RLS)
            }
        });

        const noPerm = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            fixture.Provider,
            artifactId,
            unauthorizedUser
        );
        expect(noPerm).toMatchObject({
            ArtifactID: artifactId,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Denied'
        });

        const rlsDenied = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            fixture.Provider,
            rlsHiddenArtifactId,
            editorUser
        );
        expect(rlsDenied).toMatchObject({
            ArtifactID: rlsHiddenArtifactId,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Denied'
        });
    });

    it('(e) fails closed when DelegateEntityID references an unknown entity or user is missing', async () => {
        const fixture = createProviderFixture({
            Entities: [],
            Artifacts: [
                {
                    ID: artifactId,
                    UserID: ownerId,
                    DelegateEntityID: unknownEntityId,
                    DelegateRecordID: projectRecordId
                }
            ],
            HostRecordsByEntity: {}
        });

        const unknownRes = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            fixture.Provider,
            artifactId,
            editorUser
        );
        expect(unknownRes).toMatchObject({
            ArtifactID: artifactId,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Denied'
        });
        expect(unknownRes.Reason).toContain('was not found in metadata');

        const missingUserRes = await ArtifactPermissionEngine.Instance.EvaluateDefaultEntityFallback(
            fixture.Provider,
            projectsEntityId,
            projectRecordId,
            null,
            artifactId
        );
        expect(missingUserRes.CanRead).toBe(false);
        expect(missingUserRes.Source).toBe('Denied');
    });

    it('(f) forwards explicit contextUser to GetUserPermisions and host-record RunView (including composite primary keys and batched lookups)', async () => {
        const compositeEntity = createMockEntityInfo({
            ID: dealsEntityId,
            Name: 'Test: Composite Deals',
            PrimaryKeyNames: ['OrgID', 'DealNo'],
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: true, CanDelete: false })
        });
        const projectsEntity = createMockEntityInfo({
            ID: projectsEntityId,
            Name: 'Test: Fallback Projects',
            ResolvePermissions: () => createEntityPermissions({ CanRead: true, CanUpdate: false, CanDelete: false })
        });

        const art1 = 'a3111111-1111-4111-8111-111111111111';
        const art2 = 'a3222222-2222-4222-8222-222222222222';
        const art3 = 'a3333333-3333-4333-8333-333333333333';
        const proj2Id = 'b3222222-2222-4222-8222-222222222222';

        const fixture = createProviderFixture({
            Entities: [projectsEntity, compositeEntity],
            Artifacts: [
                { ID: art1, UserID: ownerId, DelegateEntityID: projectsEntityId, DelegateRecordID: projectRecordId },
                { ID: art2, UserID: ownerId, DelegateEntityID: projectsEntityId, DelegateRecordID: proj2Id },
                { ID: art3, UserID: ownerId, DelegateEntityID: dealsEntityId, DelegateRecordID: 'OrgID|acme||DealNo|42' }
            ],
            HostRecordsByEntity: {
                'Test: Fallback Projects': [{ ID: projectRecordId }, { ID: proj2Id }],
                'Test: Composite Deals': [{ OrgID: 'acme', DealNo: 42 }]
            }
        });

        const batch = await ArtifactPermissionEngine.Instance.ResolvePermissionsBatch(
            fixture.Provider,
            [art1, art2, art3],
            editorUser
        );

        expect(batch.get(art1)).toMatchObject({ CanRead: true, CanEdit: false, Source: 'Delegate' });
        expect(batch.get(art2)).toMatchObject({ CanRead: true, CanEdit: false, Source: 'Delegate' });
        expect(batch.get(art3)).toMatchObject({ CanRead: true, CanEdit: true, Source: 'Delegate' });

        // Both entity metadata permission checks received the explicit contextUser
        expect(projectsEntity.GetUserPermisions).toHaveBeenCalledWith(editorUser);
        expect(compositeEntity.GetUserPermisions).toHaveBeenCalledWith(editorUser);

        // Both host-record RunView calls forwarded the exact explicit contextUser (never ambient/system user)
        // and batched the two project records into a single IN-clause query
        const projectQueries = fixture.ObservedActors.filter((c) => c.EntityName === 'Test: Fallback Projects');
        expect(projectQueries).toHaveLength(1);
        expect(projectQueries[0].ActorId).toBe(editorUser.ID);
        expect(projectQueries[0].Params.ResultType).toBe('simple');
        expect(projectQueries[0].Params.Fields).toEqual(['ID']);

        const dealQueries = fixture.ObservedActors.filter((c) => c.EntityName === 'Test: Composite Deals');
        expect(dealQueries).toHaveLength(1);
        expect(dealQueries[0].ActorId).toBe(editorUser.ID);
        expect(dealQueries[0].Params.Fields).toEqual(['OrgID', 'DealNo']);

        // Direct EvaluateDefaultEntityFallback also forwards contextUser
        const directRes = await ArtifactPermissionEngine.Instance.EvaluateDefaultEntityFallback(
            fixture.Provider,
            dealsEntityId,
            'OrgID|acme||DealNo|42',
            editorUser,
            art3
        );
        expect(directRes).toMatchObject({ CanRead: true, CanEdit: true, Source: 'Delegate' });
    });

    it('(g) MJRecordArtifactEntity is registered for MJ: Record Artifacts and exposes strongly typed fields and schema', () => {
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, 'MJ: Record Artifacts');
        expect(reg).toBeDefined();
        expect(reg?.SubClass).toBe(MJRecordArtifactEntity);

        const now = new Date('2026-11-26T12:00:00.000Z');
        const parsed = MJRecordArtifactSchema.parse({
            ID: 'f1111111-1111-4111-8111-111111111111',
            EntityID: projectsEntityId,
            RecordID: projectRecordId,
            ArtifactID: artifactId,
            PinnedArtifactVersionID: null,
            Role: 'General',
            Sequence: 0,
            ContextDescription: 'Primary account brief',
            LinkedByUserID: editorUser.ID,
            __mj_CreatedAt: now,
            __mj_UpdatedAt: now,
            Entity: 'MJ: Companies',
            Artifact: 'Account Brief',
            PinnedArtifactVersion: null,
            LinkedByUser: editorUser.Email
        });
        expect(parsed.Role).toBe('General');
        expect(parsed.Sequence).toBe(0);
        expect(parsed.PinnedArtifactVersionID).toBeNull();
        expect(parsed.ContextDescription).toBe('Primary account brief');

        // Reject missing/null Role (NOT NULL constraint mirrored in generated Zod schema)
        expect(() =>
            MJRecordArtifactSchema.parse({
                ...parsed,
                Role: null
            })
        ).toThrow();
    });
});
