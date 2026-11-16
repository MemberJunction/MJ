import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    EntityInfo,
    IMetadataProvider,
    IRunViewProvider,
    Metadata,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import {
    ArtifactPermissionEngine,
    type MJConversationEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GetGlobalObjectStore, UUIDsEqual } from '@memberjunction/global';
import {
    CollectionPreRunViewHook,
    CollectionPostRunViewHook,
    EnsureCollectionReadHookRegistered,
    MJCollectionEntityServer
} from '../custom/MJCollectionEntityServer.server';
import {
    ArtifactPermissionPreRunViewHook,
    ArtifactPermissionPostRunViewHook,
    EnsureArtifactPermissionReadHookRegistered,
    MJArtifactPermissionEntityServer
} from '../custom/MJArtifactPermissionEntityServer.server';
import {
    CollectionPermissionPreRunViewHook,
    CollectionPermissionPostRunViewHook,
    EnsureCollectionPermissionReadHookRegistered,
    MJCollectionPermissionEntityServer
} from '../custom/MJCollectionPermissionEntityServer.server';
import {
    ArtifactVersionAttributePreRunViewHook,
    ArtifactVersionAttributePostRunViewHook,
    EnsureArtifactVersionAttributeReadHookRegistered,
    MJArtifactVersionAttributeEntityServer
} from '../custom/MJArtifactVersionAttributeEntityServer.server';
import {
    CollectionArtifactPreRunViewHook,
    CollectionArtifactPostRunViewHook
} from '../custom/MJCollectionArtifactEntityServer.server';
import {
    ArtifactGuestShareLinkPreRunViewHook,
    ArtifactGuestShareLinkPostRunViewHook
} from '../custom/MJArtifactGuestShareLinkEntityServer.server';
import {
    GetRegisteredRestrictedFieldLLMClassifier,
    InspectAndStampRestrictedFieldsForComment,
    RegisterRestrictedFieldLLMClassifier
} from '../custom/RestrictedFieldCommentClassifier';

const SYSTEM_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const COL_ALLOWED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const COL_DENIED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const COL_PARENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const COL_CHILD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
const ART_ALLOWED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const ART_DENIED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const VER_ALLOWED_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const VER_DENIED_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const LINK_ALLOWED_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const LINK_DENIED_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const ATTR_ALLOWED_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const ATTR_DENIED_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
const PERM_ALLOWED_ID = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
const PERM_DENIED_ID = 'ffffffff-ffff-4fff-8fff-fffffffffff2';

function makeUser(id: string, email: string): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Email = email;
    user.Name = email;
    user.IsActive = true;
    return user;
}

type RunViewHandler = (params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult>;

function createMockSecurityProvider(
    handler: RunViewHandler,
    providerType: 'Database' | 'Network' = 'Database'
): IMetadataProvider & IRunViewProvider {
    const provider: Partial<IMetadataProvider & IRunViewProvider> = {
        ProviderType: providerType,
        Entities: [],
        EntityByName: () => undefined,
        RunView: (async <T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> => {
            return (await handler(params, contextUser)) as RunViewResult<T>;
        }) as IRunViewProvider['RunView'],
        RunViews: (async <T>(paramsArray: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> => {
            const results: RunViewResult<T>[] = [];
            for (const params of paramsArray) {
                results.push((await handler(params, contextUser)) as RunViewResult<T>);
            }
            return results;
        }) as IRunViewProvider['RunViews']
    };
    return provider as IMetadataProvider & IRunViewProvider;
}

function attachFieldHistory<T extends BaseEntity>(
    entity: T,
    fields: Array<{ Name: string; OldValue: string | null }>
): void {
    Object.defineProperty(entity, 'Fields', {
        value: fields,
        configurable: true
    });
}

function createCollectionEntity(
    provider: IMetadataProvider,
    actor: UserInfo,
    options: {
        id: string;
        ownerId: string | null;
        parentId?: string | null;
        oldOwnerId?: string | null;
        oldParentId?: string | null;
        isSaved: boolean;
    }
): { entity: MJCollectionEntityServer; history: MJCollectionEntityServer['ResultHistory'] } {
    const entity = Object.create(MJCollectionEntityServer.prototype) as MJCollectionEntityServer;
    const history: MJCollectionEntityServer['ResultHistory'] = [];
    Object.defineProperty(entity, '_resultHistory', { value: history, writable: true });
    Object.defineProperty(entity, 'ResultHistory', { get: () => history, configurable: true });
    Object.defineProperty(entity, 'IsSaved', { value: options.isSaved, writable: true });
    Object.defineProperty(entity, 'ID', { value: options.id, writable: true });
    Object.defineProperty(entity, 'OwnerID', { value: options.ownerId, writable: true });
    Object.defineProperty(entity, 'ParentID', { value: options.parentId ?? null, writable: true });
    Object.defineProperty(entity, 'ContextCurrentUser', { value: actor, writable: true });
    Object.defineProperty(entity, 'ProviderToUse', { value: provider, configurable: true });
    Object.defineProperty(entity, 'NewRecord', {
        value: vi.fn(() => {
            Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
            Object.defineProperty(entity, 'ID', { value: '', writable: true });
        }),
        configurable: true
    });
    attachFieldHistory(entity, [
        { Name: 'OwnerID', OldValue: options.oldOwnerId ?? null },
        { Name: 'ParentID', OldValue: options.oldParentId ?? null }
    ]);
    return { entity, history };
}

describe('MJCollectionEntityServer, Permissions, Attributes & Paged TotalRowCount Security', () => {
    const sysUser = makeUser(SYSTEM_ID, 'system@example.com');
    const ownerUser = makeUser(OWNER_ID, 'owner@example.com');
    const outsiderUser = makeUser(OTHER_USER_ID, 'outsider@example.com');

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u) => Boolean(u && UUIDsEqual(u.ID, SYSTEM_ID))
        );
    });

    afterEach(() => {
        RegisterRestrictedFieldLLMClassifier(null);
        vi.restoreAllMocks();
    });

    it('MJCollectionEntityServer enforces PreRunView/PostRunView CanRead, paged TotalRowCount, count_only fail-closed, and InnerLoad gate', async () => {
        EnsureCollectionReadHookRegistered();

        const provider = createMockSecurityProvider(async () => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions').mockImplementation(
            async (_prov, colId, user) => ({
                CollectionID: colId,
                CanRead: Boolean(user && UUIDsEqual(user.ID, ownerUser.ID) && UUIDsEqual(colId, COL_ALLOWED_ID)),
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: UUIDsEqual(colId, COL_ALLOWED_ID) ? 'Owner' : 'Denied',
                Reason: 'Test'
            })
        );

        const partialParams: RunViewParams = {
            EntityName: 'MJ: Collections',
            Fields: ['Name'],
            MaxRows: 1,
            ResultType: 'simple'
        };
        const preParams = CollectionPreRunViewHook(partialParams, ownerUser, provider);
        expect(preParams.Fields).toEqual(['Name', 'ID']);

        const rawPaged: RunViewResult = {
            Success: true,
            Results: [
                { ID: COL_ALLOWED_ID, Name: 'Allowed' },
                { ID: COL_DENIED_ID, Name: 'Secret' }
            ],
            RowCount: 2,
            TotalRowCount: 42,
            ExecutionTime: 1,
            ErrorMessage: ''
        };
        const filtered = await CollectionPostRunViewHook(preParams, rawPaged, ownerUser, provider);
        expect(filtered.Results).toHaveLength(1);
        expect(filtered.Results[0]).toEqual({ Name: 'Allowed' });
        expect(filtered.RowCount).toBe(1);
        expect(filtered.TotalRowCount).toBe(1);

        const countOnlyRes = await CollectionPostRunViewHook(
            { EntityName: 'MJ: Collections', ResultType: 'count_only' },
            { Success: true, Results: [], RowCount: 0, TotalRowCount: 15, ExecutionTime: 1, ErrorMessage: '' },
            ownerUser,
            provider
        );
        expect(countOnlyRes.TotalRowCount).toBe(0);

        const superInnerLoadSpy = vi
            .spyOn(Object.getPrototypeOf(MJCollectionEntityServer.prototype), 'InnerLoad')
            .mockResolvedValue(true);

        const deniedCol = createCollectionEntity(provider, outsiderUser, {
            id: COL_DENIED_ID,
            ownerId: OWNER_ID,
            isSaved: true
        });
        expect(await deniedCol.entity.InnerLoad(CompositeKey.FromID(COL_DENIED_ID))).toBe(false);
        expect(deniedCol.entity.ID).toBe('');

        const allowedCol = createCollectionEntity(provider, ownerUser, {
            id: COL_ALLOWED_ID,
            ownerId: OWNER_ID,
            isSaved: true
        });
        expect(await allowedCol.entity.Load(COL_ALLOWED_ID)).toBe(true);
        expect(superInnerLoadSpy).toHaveBeenCalledTimes(2);
    });

    it('MJCollectionEntityServer enforces OwnerID auto-stamp/immutability, cycle rejection, reparent anti-escalation, and CanDelete', async () => {
        const provider = createMockSecurityProvider(async (params) => {
            if (params.EntityName === 'MJ: Collections') {
                const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                if (filter.includes(COL_CHILD_ID)) {
                    return {
                        Success: true,
                        Results: [{ ID: COL_CHILD_ID, OwnerID: OWNER_ID, ParentID: COL_PARENT_ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                if (filter.includes(`ParentID IN ('${COL_PARENT_ID}')`)) {
                    return {
                        Success: true,
                        Results: [{ ID: COL_CHILD_ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                return {
                    Success: true,
                    Results: [{ ID: COL_PARENT_ID, OwnerID: OWNER_ID, ParentID: null }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Collection Artifacts') {
                return {
                    Success: true,
                    Results: [{ ArtifactVersionID: VER_ALLOWED_ID }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [{ ID: VER_ALLOWED_ID, ArtifactID: ART_ALLOWED_ID }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
        });

        const superSaveSpy = vi
            .spyOn(Object.getPrototypeOf(MJCollectionEntityServer.prototype), 'Save')
            .mockResolvedValue(true);
        const superDeleteSpy = vi
            .spyOn(Object.getPrototypeOf(MJCollectionEntityServer.prototype), 'Delete')
            .mockResolvedValue(true);
        const notifySpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'NotifyPermissionsChanged').mockResolvedValue();

        const colPermsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions')
            .mockResolvedValue({
                CollectionID: COL_PARENT_ID,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                Source: 'Owner',
                Reason: 'Owner'
            });
        const artPermsSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: ART_ALLOWED_ID,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: true,
            Source: 'ArtifactPermission',
            Reason: 'Share without Edit'
        });

        // Create with null OwnerID auto-stamps actor.ID
        const autoOwner = createCollectionEntity(provider, ownerUser, {
            id: COL_ALLOWED_ID,
            ownerId: null,
            isSaved: false
        });
        expect(await autoOwner.entity.Save()).toBe(true);
        expect(autoOwner.entity.OwnerID).toBe(OWNER_ID);
        expect(superSaveSpy).toHaveBeenCalledTimes(1);

        // Create with spoofed OwnerID fails
        const spoofCreate = createCollectionEntity(provider, outsiderUser, {
            id: COL_ALLOWED_ID,
            ownerId: OWNER_ID,
            isSaved: false
        });
        expect(await spoofCreate.entity.Save()).toBe(false);
        expect(spoofCreate.history[0]?.Message).toContain('OwnerID must match');

        // Update changing OwnerID fails for non-system user
        const ownerMutation = createCollectionEntity(provider, ownerUser, {
            id: COL_ALLOWED_ID,
            ownerId: OTHER_USER_ID,
            oldOwnerId: OWNER_ID,
            isSaved: true
        });
        expect(await ownerMutation.entity.Save()).toBe(false);
        expect(ownerMutation.history[0]?.Message).toContain('cannot be reassigned');

        // Self-parenting rejected
        const selfParent = createCollectionEntity(provider, ownerUser, {
            id: COL_PARENT_ID,
            ownerId: OWNER_ID,
            parentId: COL_PARENT_ID,
            oldOwnerId: OWNER_ID,
            oldParentId: null,
            isSaved: true
        });
        expect(await selfParent.entity.Save()).toBe(false);
        expect(selfParent.history[0]?.Message).toContain('own ParentID');

        // Cycle ParentID (parent -> child -> parent) rejected
        const cyclicParent = createCollectionEntity(provider, ownerUser, {
            id: COL_PARENT_ID,
            ownerId: OWNER_ID,
            parentId: COL_CHILD_ID,
            oldOwnerId: OWNER_ID,
            oldParentId: null,
            isSaved: true
        });
        expect(await cyclicParent.entity.Save()).toBe(false);
        expect(cyclicParent.history[0]?.Message).toContain('cycle');

        // Reparenting under an owned parent when descendant artifact only has CanShare (no CanEdit) is blocked
        const escalationReparent = createCollectionEntity(provider, ownerUser, {
            id: COL_CHILD_ID,
            ownerId: OWNER_ID,
            parentId: COL_PARENT_ID,
            oldOwnerId: OWNER_ID,
            oldParentId: null,
            isSaved: true
        });
        expect(await escalationReparent.entity.Save()).toBe(false);
        expect(escalationReparent.history[0]?.Message).toContain('exceeding caller permissions');

        // Full artifact perms allow Delete and notify affected artifacts
        artPermsSpy.mockResolvedValue({
            ArtifactID: ART_ALLOWED_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Source: 'Owner',
            Reason: 'Owner'
        });
        colPermsSpy.mockResolvedValueOnce({
            CollectionID: COL_CHILD_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'CollectionPermission',
            Reason: 'No delete'
        });
        const deniedDelete = createCollectionEntity(provider, outsiderUser, {
            id: COL_CHILD_ID,
            ownerId: OWNER_ID,
            isSaved: true
        });
        expect(await deniedDelete.entity.Delete()).toBe(false);
        expect(superDeleteSpy).not.toHaveBeenCalled();

        colPermsSpy.mockResolvedValueOnce({
            CollectionID: COL_CHILD_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Source: 'Owner',
            Reason: 'Owner'
        });
        const allowedDelete = createCollectionEntity(provider, ownerUser, {
            id: COL_CHILD_ID,
            ownerId: OWNER_ID,
            isSaved: true
        });
        expect(await allowedDelete.entity.Delete()).toBe(true);
        expect(superDeleteSpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith({ ArtifactID: ART_ALLOWED_ID, ChangedByUserID: OWNER_ID });
    });

    it('MJArtifactPermissionEntityServer and MJCollectionPermissionEntityServer enforce Pre/PostRunView, count_only, and InnerLoad CanRead', async () => {
        EnsureArtifactPermissionReadHookRegistered();
        EnsureCollectionPermissionReadHookRegistered();

        const provider = createMockSecurityProvider(async (params) => {
            if (params.EntityName === 'MJ: Artifact Permissions') {
                return {
                    Success: true,
                    Results: [
                        { ID: PERM_ALLOWED_ID, ArtifactID: ART_ALLOWED_ID },
                        { ID: PERM_DENIED_ID, ArtifactID: ART_DENIED_ID }
                    ],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            if (params.EntityName === 'MJ: Collection Permissions') {
                return {
                    Success: true,
                    Results: [
                        { ID: PERM_ALLOWED_ID, CollectionID: COL_ALLOWED_ID },
                        { ID: PERM_DENIED_ID, CollectionID: COL_DENIED_ID }
                    ],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
        });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_prov, artId) => ({
                ArtifactID: artId,
                CanRead: UUIDsEqual(artId, ART_ALLOWED_ID),
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: UUIDsEqual(artId, ART_ALLOWED_ID) ? 'Owner' : 'Denied',
                Reason: 'Test'
            })
        );
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions').mockImplementation(
            async (_prov, colId) => ({
                CollectionID: colId,
                CanRead: UUIDsEqual(colId, COL_ALLOWED_ID),
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: UUIDsEqual(colId, COL_ALLOWED_ID) ? 'Owner' : 'Denied',
                Reason: 'Test'
            })
        );

        const artPre = ArtifactPermissionPreRunViewHook(
            { EntityName: 'MJ: Artifact Permissions', Fields: ['CanShare'], MaxRows: 1, ResultType: 'simple' },
            ownerUser,
            provider
        );
        expect(artPre.Fields).toEqual(['CanShare', 'ID', 'ArtifactID']);
        const artFiltered = await ArtifactPermissionPostRunViewHook(
            artPre,
            {
                Success: true,
                Results: [
                    { ID: PERM_ALLOWED_ID, ArtifactID: ART_ALLOWED_ID, CanShare: true },
                    { ID: PERM_DENIED_ID, ArtifactID: ART_DENIED_ID, CanShare: false }
                ],
                RowCount: 2,
                TotalRowCount: 25,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            ownerUser,
            provider
        );
        expect(artFiltered.Results).toEqual([{ CanShare: true }]);
        expect(artFiltered.TotalRowCount).toBe(1);

        const colPre = CollectionPermissionPreRunViewHook(
            { EntityName: 'MJ: Collection Permissions', Fields: ['CanEdit'], ResultType: 'simple' },
            ownerUser,
            provider
        );
        expect(colPre.Fields).toEqual(['CanEdit', 'ID', 'CollectionID']);
        const colFiltered = await CollectionPermissionPostRunViewHook(
            colPre,
            {
                Success: true,
                Results: [
                    { ID: PERM_ALLOWED_ID, CollectionID: COL_ALLOWED_ID, CanEdit: true },
                    { ID: PERM_DENIED_ID, CollectionID: COL_DENIED_ID, CanEdit: false }
                ],
                RowCount: 2,
                TotalRowCount: 2,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            ownerUser,
            provider
        );
        expect(colFiltered.Results).toEqual([{ CanEdit: true }]);

        // count_only denies unfiltered multi-target queries
        const deniedArtCount = await ArtifactPermissionPostRunViewHook(
            { EntityName: 'MJ: Artifact Permissions', ResultType: 'count_only' },
            { Success: true, Results: [], RowCount: 0, TotalRowCount: 8, ExecutionTime: 1, ErrorMessage: '' },
            ownerUser,
            provider
        );
        expect(deniedArtCount.TotalRowCount).toBe(0);

        const superArtInnerLoad = vi
            .spyOn(Object.getPrototypeOf(MJArtifactPermissionEntityServer.prototype), 'InnerLoad')
            .mockResolvedValue(true);
        const deniedArtPerm = Object.create(
            MJArtifactPermissionEntityServer.prototype
        ) as MJArtifactPermissionEntityServer;
        Object.defineProperty(deniedArtPerm, 'ContextCurrentUser', { value: outsiderUser, writable: true });
        Object.defineProperty(deniedArtPerm, 'ProviderToUse', { value: provider, configurable: true });
        Object.defineProperty(deniedArtPerm, 'ArtifactID', { value: ART_DENIED_ID, writable: true });
        const newRecSpy = vi.fn();
        Object.defineProperty(deniedArtPerm, 'NewRecord', { value: newRecSpy, configurable: true });
        expect(await deniedArtPerm.InnerLoad(CompositeKey.FromID(PERM_DENIED_ID))).toBe(false);
        expect(newRecSpy).toHaveBeenCalledTimes(1);
        expect(superArtInnerLoad).toHaveBeenCalledTimes(1);

        vi.spyOn(Object.getPrototypeOf(MJCollectionPermissionEntityServer.prototype), 'InnerLoad').mockResolvedValue(
            true
        );
        const deniedColPerm = Object.create(
            MJCollectionPermissionEntityServer.prototype
        ) as MJCollectionPermissionEntityServer;
        Object.defineProperty(deniedColPerm, 'ContextCurrentUser', { value: outsiderUser, writable: true });
        Object.defineProperty(deniedColPerm, 'ProviderToUse', { value: provider, configurable: true });
        Object.defineProperty(deniedColPerm, 'CollectionID', { value: COL_DENIED_ID, writable: true });
        const colNewRecSpy = vi.fn();
        Object.defineProperty(deniedColPerm, 'NewRecord', { value: colNewRecSpy, configurable: true });
        expect(await deniedColPerm.InnerLoad(CompositeKey.FromID(PERM_DENIED_ID))).toBe(false);
        expect(colNewRecSpy).toHaveBeenCalledTimes(1);
    });

    it('MJArtifactVersionAttributeEntityServer enforces CanRead filtering, InnerLoad, CanEdit on Save/Delete, and immutable ArtifactVersionID', async () => {
        EnsureArtifactVersionAttributeReadHookRegistered();

        const provider = createMockSecurityProvider(async (params) => {
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [
                        { ID: VER_ALLOWED_ID, ArtifactID: ART_ALLOWED_ID },
                        { ID: VER_DENIED_ID, ArtifactID: ART_DENIED_ID }
                    ],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
        });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_prov, artId, user) => ({
                ArtifactID: artId,
                CanRead: UUIDsEqual(artId, ART_ALLOWED_ID),
                CanEdit: Boolean(user && UUIDsEqual(user.ID, ownerUser.ID) && UUIDsEqual(artId, ART_ALLOWED_ID)),
                CanDelete: false,
                CanShare: false,
                Source: UUIDsEqual(artId, ART_ALLOWED_ID) ? 'Owner' : 'Denied',
                Reason: 'Test'
            })
        );

        const attrPre = ArtifactVersionAttributePreRunViewHook(
            { EntityName: 'MJ: Artifact Version Attributes', Fields: ['Name'], ResultType: 'simple' },
            ownerUser,
            provider
        );
        expect(attrPre.Fields).toEqual(['Name', 'ID', 'ArtifactVersionID']);

        const attrFiltered = await ArtifactVersionAttributePostRunViewHook(
            attrPre,
            {
                Success: true,
                Results: [
                    { ID: ATTR_ALLOWED_ID, ArtifactVersionID: VER_ALLOWED_ID, Name: 'PublicAttr' },
                    { ID: ATTR_DENIED_ID, ArtifactVersionID: VER_DENIED_ID, Name: 'HiddenAttr' }
                ],
                RowCount: 2,
                TotalRowCount: 10,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            ownerUser,
            provider
        );
        expect(attrFiltered.Results).toEqual([{ Name: 'PublicAttr' }]);
        expect(attrFiltered.TotalRowCount).toBe(1);

        const superSave = vi
            .spyOn(Object.getPrototypeOf(MJArtifactVersionAttributeEntityServer.prototype), 'Save')
            .mockResolvedValue(true);
        const superDelete = vi
            .spyOn(Object.getPrototypeOf(MJArtifactVersionAttributeEntityServer.prototype), 'Delete')
            .mockResolvedValue(true);

        const makeAttr = (actor: UserInfo, verId: string, isSaved: boolean, oldVerId?: string) => {
            const entity = Object.create(
                MJArtifactVersionAttributeEntityServer.prototype
            ) as MJArtifactVersionAttributeEntityServer;
            const history: MJArtifactVersionAttributeEntityServer['ResultHistory'] = [];
            Object.defineProperty(entity, '_resultHistory', { value: history, writable: true });
            Object.defineProperty(entity, 'ResultHistory', { get: () => history, configurable: true });
            Object.defineProperty(entity, 'IsSaved', { value: isSaved, writable: true });
            Object.defineProperty(entity, 'ArtifactVersionID', { value: verId, writable: true });
            Object.defineProperty(entity, 'ContextCurrentUser', { value: actor, writable: true });
            Object.defineProperty(entity, 'ProviderToUse', { value: provider, configurable: true });
            attachFieldHistory(entity, [{ Name: 'ArtifactVersionID', OldValue: oldVerId ?? null }]);
            return { entity, history };
        };

        const deniedSave = makeAttr(outsiderUser, VER_ALLOWED_ID, false);
        expect(await deniedSave.entity.Save()).toBe(false);
        expect(deniedSave.history[0]?.Message).toContain('Edit permission');
        expect(superSave).not.toHaveBeenCalled();

        const immutableSave = makeAttr(ownerUser, VER_DENIED_ID, true, VER_ALLOWED_ID);
        expect(await immutableSave.entity.Save()).toBe(false);
        expect(immutableSave.history[0]?.Message).toContain('cannot be reassigned');

        const allowedSave = makeAttr(ownerUser, VER_ALLOWED_ID, false);
        expect(await allowedSave.entity.Save()).toBe(true);
        expect(superSave).toHaveBeenCalledTimes(1);

        const deniedDelete = makeAttr(outsiderUser, VER_ALLOWED_ID, true, VER_ALLOWED_ID);
        expect(await deniedDelete.entity.Delete()).toBe(false);
        expect(superDelete).not.toHaveBeenCalled();

        const allowedDelete = makeAttr(ownerUser, VER_ALLOWED_ID, true, VER_ALLOWED_ID);
        expect(await allowedDelete.entity.Delete()).toBe(true);
        expect(superDelete).toHaveBeenCalledTimes(1);
    });

    it('CollectionArtifactPostRunViewHook and ArtifactGuestShareLinkPostRunViewHook do not leak unfiltered TotalRowCount on MaxRows pages', async () => {
        const provider = createMockSecurityProvider(async (params) => {
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [
                        { ID: VER_ALLOWED_ID, ArtifactID: ART_ALLOWED_ID },
                        { ID: VER_DENIED_ID, ArtifactID: ART_DENIED_ID }
                    ],
                    RowCount: 2,
                    TotalRowCount: 2,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
        });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_prov, artId) => ({
                ArtifactID: artId,
                CanRead: UUIDsEqual(artId, ART_ALLOWED_ID),
                CanEdit: false,
                CanDelete: false,
                CanShare: UUIDsEqual(artId, ART_ALLOWED_ID),
                Source: UUIDsEqual(artId, ART_ALLOWED_ID) ? 'Owner' : 'Denied',
                Reason: 'Test'
            })
        );
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions').mockImplementation(
            async (_prov, colId) => ({
                CollectionID: colId,
                CanRead: UUIDsEqual(colId, COL_ALLOWED_ID),
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: UUIDsEqual(colId, COL_ALLOWED_ID) ? 'Owner' : 'Denied',
                Reason: 'Test'
            })
        );

        const caParams: RunViewParams = {
            EntityName: 'MJ: Collection Artifacts',
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple'
        };
        CollectionArtifactPreRunViewHook(caParams, ownerUser, provider);
        const caResult = await CollectionArtifactPostRunViewHook(
            caParams,
            {
                Success: true,
                Results: [{ ID: 'ca-1', CollectionID: COL_DENIED_ID, ArtifactVersionID: VER_DENIED_ID }],
                RowCount: 1,
                TotalRowCount: 99,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            ownerUser,
            provider
        );
        expect(caResult.Results).toHaveLength(0);
        expect(caResult.TotalRowCount).toBe(0);

        const gslParams: RunViewParams = {
            EntityName: 'MJ: Artifact Guest Share Links',
            Fields: ['ID', 'TokenHash'],
            MaxRows: 1,
            ResultType: 'simple'
        };
        ArtifactGuestShareLinkPreRunViewHook(gslParams, ownerUser, provider);
        const gslResult = await ArtifactGuestShareLinkPostRunViewHook(
            gslParams,
            {
                Success: true,
                Results: [
                    { ID: LINK_ALLOWED_ID, ArtifactID: ART_ALLOWED_ID, TokenHash: 'secret-hash' },
                    { ID: LINK_DENIED_ID, ArtifactID: ART_DENIED_ID, TokenHash: 'other-secret' }
                ],
                RowCount: 2,
                TotalRowCount: 50,
                ExecutionTime: 1,
                ErrorMessage: ''
            },
            ownerUser,
            provider
        );
        expect(gslResult.Results).toEqual([{ ID: LINK_ALLOWED_ID, TokenHash: '' }]);
        expect(gslResult.TotalRowCount).toBe(1);
    });

    it('RestrictedFieldCommentClassifier uses GetGlobalObjectStore and provider-scoped AIEngineBase', async () => {
        const customClassifier = vi.fn(async () => ['Salary']);
        RegisterRestrictedFieldLLMClassifier(customClassifier);
        expect(GetRegisteredRestrictedFieldLLMClassifier()).toBe(customClassifier);
        const store = GetGlobalObjectStore();
        expect(store?.['___MJ_RESTRICTED_FIELD_LLM_CLASSIFIER_STATE__']).toBeDefined();

        RegisterRestrictedFieldLLMClassifier(null);
        expect(GetRegisteredRestrictedFieldLLMClassifier()).toBeNull();

        const tenantProvider = createMockSecurityProvider(async () => ({
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: ''
        }));

        const scopedEngine = AIEngineBase.GetProviderInstance<AIEngineBase>(tenantProvider, AIEngineBase);
        const getProviderSpy = vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue(scopedEngine);
        const configSpy = vi.spyOn(scopedEngine, 'Config').mockResolvedValue();
        vi.spyOn(scopedEngine, 'Loaded', 'get').mockReturnValue(true);
        vi.spyOn(scopedEngine, 'Prompts', 'get').mockReturnValue([]);
        vi.spyOn(scopedEngine, 'LanguageModels', 'get').mockReturnValue([]);
        const runnerSpy = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt');

        const mockEntityInfo = Object.create(EntityInfo.prototype) as EntityInfo;
        Object.defineProperty(mockEntityInfo, 'Name', { value: 'Employees', configurable: true });
        Object.defineProperty(mockEntityInfo, 'DisplayName', { value: 'Employees', configurable: true });
        Object.defineProperty(mockEntityInfo, 'FieldLevelSecurityApplies', { value: true, configurable: true });
        Object.defineProperty(mockEntityInfo, 'Fields', {
            value: [
                {
                    Name: 'Salary',
                    DisplayName: 'Salary',
                    Description: 'Annual compensation',
                    HasFieldPermissions: true
                }
            ],
            configurable: true
        });
        Object.defineProperty(mockEntityInfo, 'GetDeniedReadFields', {
            value: () => new Set<string>(),
            configurable: true
        });

        const fakeConv = {
            ID: 'conv-1',
            LinkedRecordID: 'emp-1',
            AnchorType: 'Section',
            AnchorMetadata: null,
            AnchorMetadataObject: {}
        } as MJConversationEntity;

        const metadataSpy = vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(tenantProvider);
        const res = await InspectAndStampRestrictedFieldsForComment({
            Provider: tenantProvider,
            ContextUser: ownerUser,
            Conversation: fakeConv,
            EntityInfo: mockEntityInfo,
            MessageText: 'Compensation discussion',
            RecordValues: {}
        });
        metadataSpy.mockRestore();
        configSpy.mockRestore();

        expect(res.Allowed).toBe(true);
        expect(getProviderSpy).toHaveBeenCalledWith(tenantProvider, AIEngineBase);
        expect(runnerSpy).not.toHaveBeenCalled();
    });

    it('P0-P3-2a: requires CanDelete (or owner) on child AND CanEdit on oldParentId to detach or reparent an existing collection', async () => {
        const ATTACKER_PARENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
        const provider = createMockSecurityProvider(async (params) => {
            if (params.EntityName === 'MJ: Collections') {
                const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                if (filter.includes(COL_CHILD_ID)) {
                    return {
                        Success: true,
                        Results: [{ ID: COL_CHILD_ID, OwnerID: OWNER_ID, ParentID: COL_PARENT_ID }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                if (filter.includes(ATTACKER_PARENT_ID)) {
                    return {
                        Success: true,
                        Results: [{ ID: ATTACKER_PARENT_ID, OwnerID: OTHER_USER_ID, ParentID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                return {
                    Success: true,
                    Results: [{ ID: COL_PARENT_ID, OwnerID: OWNER_ID, ParentID: null }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: ''
                };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
        });

        const superSaveSpy = vi
            .spyOn(Object.getPrototypeOf(MJCollectionEntityServer.prototype), 'Save')
            .mockResolvedValue(true);

        // Collaborator has CanEdit=1, CanDelete=0 on Child, CanEdit=0 on oldParentId, CanEdit=1 on attacker parent
        const permsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions')
            .mockImplementation(async (_prov, colId) => {
                if (UUIDsEqual(colId, COL_CHILD_ID)) {
                    return {
                        CollectionID: colId,
                        CanRead: true,
                        CanEdit: true,
                        CanDelete: false,
                        CanShare: false,
                        Source: 'CollectionPermission',
                        Reason: 'Editor without delete'
                    };
                }
                if (UUIDsEqual(colId, COL_PARENT_ID)) {
                    return {
                        CollectionID: colId,
                        CanRead: true,
                        CanEdit: false,
                        CanDelete: false,
                        CanShare: false,
                        Source: 'CollectionPermission',
                        Reason: 'Read-only on old parent'
                    };
                }
                return {
                    CollectionID: colId,
                    CanRead: true,
                    CanEdit: true,
                    CanDelete: true,
                    CanShare: true,
                    Source: 'Owner',
                    Reason: 'Attacker owns target parent'
                };
            });

        // 1. Collaborator with CanEdit=1, CanDelete=0 cannot detach (ParentID = null)
        const detachAttempt = createCollectionEntity(provider, outsiderUser, {
            id: COL_CHILD_ID,
            ownerId: OWNER_ID,
            parentId: null,
            oldOwnerId: OWNER_ID,
            oldParentId: COL_PARENT_ID,
            isSaved: true
        });
        expect(await detachAttempt.entity.Save()).toBe(false);
        expect(detachAttempt.history[0]?.Message).toContain('Delete permission');
        expect(superSaveSpy).not.toHaveBeenCalled();

        // 2. Collaborator with CanEdit=1, CanDelete=0 cannot reparent under attacker-owned collection
        const reparentAttempt = createCollectionEntity(provider, outsiderUser, {
            id: COL_CHILD_ID,
            ownerId: OWNER_ID,
            parentId: ATTACKER_PARENT_ID,
            oldOwnerId: OWNER_ID,
            oldParentId: COL_PARENT_ID,
            isSaved: true
        });
        expect(await reparentAttempt.entity.Save()).toBe(false);
        expect(reparentAttempt.history[0]?.Message).toContain('Delete permission');
        expect(superSaveSpy).not.toHaveBeenCalled();

        // 3. Even with CanDelete=1 on Child, CanEdit=0 on oldParentId still blocks detach/reparent
        permsSpy.mockImplementation(async (_prov, colId) => {
            if (UUIDsEqual(colId, COL_CHILD_ID)) {
                return {
                    CollectionID: colId,
                    CanRead: true,
                    CanEdit: true,
                    CanDelete: true,
                    CanShare: false,
                    Source: 'CollectionPermission',
                    Reason: 'CanDelete on child'
                };
            }
            if (UUIDsEqual(colId, COL_PARENT_ID)) {
                return {
                    CollectionID: colId,
                    CanRead: true,
                    CanEdit: false,
                    CanDelete: false,
                    CanShare: false,
                    Source: 'CollectionPermission',
                    Reason: 'No Edit on old parent'
                };
            }
            return {
                CollectionID: colId,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                Source: 'Owner',
                Reason: 'Owner of target parent'
            };
        });

        const noOldParentEdit = createCollectionEntity(provider, outsiderUser, {
            id: COL_CHILD_ID,
            ownerId: OWNER_ID,
            parentId: null,
            oldOwnerId: OWNER_ID,
            oldParentId: COL_PARENT_ID,
            isSaved: true
        });
        expect(await noOldParentEdit.entity.Save()).toBe(false);
        expect(noOldParentEdit.history[0]?.Message).toContain('current parent collection');
        expect(superSaveSpy).not.toHaveBeenCalled();

        // 4. With CanDelete=1 on Child AND CanEdit=1 on oldParentId, detach succeeds
        permsSpy.mockImplementation(async (_prov, colId) => ({
            CollectionID: colId,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: false,
            Source: 'CollectionPermission',
            Reason: 'Authorized'
        }));
        const authorizedDetach = createCollectionEntity(provider, outsiderUser, {
            id: COL_CHILD_ID,
            ownerId: OWNER_ID,
            parentId: null,
            oldOwnerId: OWNER_ID,
            oldParentId: COL_PARENT_ID,
            isSaved: true
        });
        expect(await authorizedDetach.entity.Save()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(1);
    });
});
