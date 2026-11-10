import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CompositeKey,
    IMetadataProvider,
    IRunViewProvider,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    ArtifactVersionPostRunViewHook,
    ArtifactVersionPreRunViewHook,
    CalculateContentSizeBytes,
    MJArtifactVersionEntityServer
} from '../custom/MJArtifactVersionEntityServer.server';

function makeUser(id: string, email: string): UserInfo {
    return new UserInfo(null, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: []
    });
}

describe('CalculateContentSizeBytes', () => {
    it('returns 0 for empty string', () => {
        expect(CalculateContentSizeBytes('')).toBe(0);
    });

    it('returns character count for ASCII-only content', () => {
        expect(CalculateContentSizeBytes('hello')).toBe(5);
        expect(CalculateContentSizeBytes('{"a":1}')).toBe(7);
    });

    it('returns UTF-8 byte count (not character count) for multi-byte content', () => {
        expect(CalculateContentSizeBytes('héllo')).toBe(6);
        expect('héllo'.length).toBe(5);
    });

    it('handles 4-byte UTF-8 sequences (emoji)', () => {
        expect(CalculateContentSizeBytes('🎉')).toBe(4);
    });

    it('matches byte length of a stringified JSON payload', () => {
        const snapshot = { title: 'Q1 Revenue', rows: [{ id: 1, value: 100 }] };
        const json = JSON.stringify(snapshot);
        expect(CalculateContentSizeBytes(json)).toBe(Buffer.byteLength(json, 'utf8'));
    });
});

describe('MJArtifactVersionEntityServer permission enforcement (Blocker 2)', () => {
    const systemUser = makeUser('00000000-0000-4000-8000-000000000001', 'sys.user@yourdomain.com');
    const readerUser = makeUser('11111111-1111-4111-8111-111111111111', 'reader@example.com');
    const editorUser = makeUser('22222222-2222-4222-8222-222222222222', 'editor@example.com');
    const ownerUser = makeUser('33333333-3333-4333-8333-333333333333', 'owner@example.com');
    const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fakeProvider = { Entities: [] } as unknown as IMetadataProvider;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeProvider, configurable: true });
        Object.defineProperty(editorUser, 'OwningProvider', { value: fakeProvider, configurable: true });
        Object.defineProperty(ownerUser, 'OwningProvider', { value: fakeProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId, user) => {
                const isOwner = user.ID === ownerUser.ID;
                const isEditor = isOwner || user.ID === editorUser.ID;
                const isReader = isEditor || user.ID === readerUser.ID;
                return {
                    ArtifactID: targetArtifactId,
                    CanRead: isReader,
                    CanEdit: isEditor,
                    CanDelete: isOwner,
                    CanShare: isOwner,
                    Source: isReader ? 'ArtifactPermission' : 'Denied',
                    Reason: isReader ? 'Allowed' : 'Denied'
                };
            }
        );
    });

    it('rejects Save() for read-only users and allows Save() for editors and systemUser', async () => {
        const superSaveSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactVersionEntityServer.prototype), 'Save')
            .mockResolvedValue(true);

        const entity = Object.create(MJArtifactVersionEntityServer.prototype) as MJArtifactVersionEntityServer;
        const history = [] as MJArtifactVersionEntityServer['ResultHistory'];
        Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
        Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
        Object.defineProperty(entity, 'ArtifactID', { value: artifactId, writable: true });
        Object.defineProperty(entity, 'Content', { value: '', writable: true });
        Object.defineProperty(entity, 'ProviderToUse', { value: fakeProvider, configurable: true });
        Object.defineProperty(entity, 'GetFieldByName', {
            value: () => ({ Dirty: false }),
            configurable: true
        });

        Object.defineProperty(entity, 'ContextCurrentUser', { value: readerUser, writable: true });
        expect(await entity.Save()).toBe(false);
        expect(history[0]?.Message).toContain('does not hold Edit permission');
        expect(superSaveSpy).not.toHaveBeenCalled();

        Object.defineProperty(entity, 'ContextCurrentUser', { value: editorUser, writable: true });
        expect(await entity.Save()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(1);

        Object.defineProperty(entity, 'ContextCurrentUser', { value: systemUser, writable: true });
        expect(await entity.Save()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects Delete() for editors without CanDelete and allows Delete() for owner', async () => {
        const superDeleteSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactVersionEntityServer.prototype), 'Delete')
            .mockResolvedValue(true);

        const entity = Object.create(MJArtifactVersionEntityServer.prototype) as MJArtifactVersionEntityServer;
        const history = [] as MJArtifactVersionEntityServer['ResultHistory'];
        Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
        Object.defineProperty(entity, 'ArtifactID', { value: artifactId, writable: true });
        Object.defineProperty(entity, 'ProviderToUse', { value: fakeProvider, configurable: true });

        Object.defineProperty(entity, 'ContextCurrentUser', { value: editorUser, writable: true });
        expect(await entity.Delete()).toBe(false);
        expect(history[0]?.Message).toContain('does not hold Delete permission');
        expect(superDeleteSpy).not.toHaveBeenCalled();

        Object.defineProperty(entity, 'ContextCurrentUser', { value: ownerUser, writable: true });
        expect(await entity.Delete()).toBe(true);
        expect(superDeleteSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects InnerLoad() when caller lacks CanRead on ArtifactID and resets record via NewRecord()', async () => {
        vi.spyOn(Object.getPrototypeOf(MJArtifactVersionEntityServer.prototype), 'InnerLoad').mockResolvedValue(true);

        const outsider = makeUser('99999999-9999-4999-8999-999999999999', 'outsider@example.com');
        Object.defineProperty(outsider, 'OwningProvider', { value: fakeProvider, configurable: true });

        const entity = Object.create(MJArtifactVersionEntityServer.prototype) as MJArtifactVersionEntityServer;
        const newRecordSpy = vi.fn();
        Object.defineProperty(entity, 'NewRecord', { value: newRecordSpy, configurable: true });
        Object.defineProperty(entity, 'ArtifactID', { value: artifactId, writable: true });
        Object.defineProperty(entity, 'ProviderToUse', { value: fakeProvider, configurable: true });
        Object.defineProperty(entity, 'ContextCurrentUser', { value: outsider, writable: true });

        const key = new CompositeKey([{ FieldName: 'ID', Value: 'ver-1' }]);
        expect(await entity.InnerLoad(key)).toBe(false);
        expect(newRecordSpy).toHaveBeenCalledTimes(1);
    });
});

describe('ArtifactVersionPreRunViewHook & ArtifactVersionPostRunViewHook narrow Fields & collection sharing (B3)', () => {
    const systemUser = makeUser('00000000-0000-4000-8000-000000000001', 'sys.user@yourdomain.com');
    const readerUser = makeUser('11111111-1111-4111-8111-111111111111', 'reader@example.com');
    const outsiderUser = makeUser('99999999-9999-4999-8999-999999999999', 'outsider@example.com');
    const allowedArtifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const deniedArtifactId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const allowedVersionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const deniedVersionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
    });

    it('augments narrow Fields in PreRunView, filters unauthorized rows in PostRunView, and strips synthetic ArtifactID', async () => {
        const fakeDbProvider = { ProviderType: 'Database', Entities: [] } as unknown as IMetadataProvider;
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId) => ({
                ArtifactID: targetArtifactId,
                CanRead: targetArtifactId === allowedArtifactId,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: targetArtifactId === allowedArtifactId ? 'ArtifactPermission' : 'Denied',
                Reason: targetArtifactId === allowedArtifactId ? 'Allowed' : 'Denied'
            })
        );

        const callerParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            Fields: ['ID', 'VersionNumber'],
            ResultType: 'simple'
        };
        const hookedParams = await ArtifactVersionPreRunViewHook(callerParams, readerUser);
        expect(hookedParams.Fields).toEqual(['ID', 'VersionNumber', 'ArtifactID']);
        expect(callerParams.Fields).toEqual(['ID', 'VersionNumber']);

        const projectedResults: RunViewResult = {
            Success: true,
            Results: [
                { ID: allowedVersionId, VersionNumber: 3, ArtifactID: allowedArtifactId },
                { ID: deniedVersionId, VersionNumber: 1, ArtifactID: deniedArtifactId }
            ],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const filtered = await ArtifactVersionPostRunViewHook(hookedParams, projectedResults, readerUser);
        expect(filtered.Results).toEqual([{ ID: allowedVersionId, VersionNumber: 3 }]);
        expect(Object.prototype.hasOwnProperty.call(filtered.Results[0], 'ArtifactID')).toBe(false);
        expect(filtered.RowCount).toBe(1);
        expect(filtered.TotalRowCount).toBe(1);
    });

    it('classifies narrow VersionNumber-only projections from single-artifact ExtraFilter without dropping readable rows', async () => {
        const fakeDbProvider = { ProviderType: 'Database', Entities: [] } as unknown as IMetadataProvider;
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });
        Object.defineProperty(outsiderUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId, user) => ({
                ArtifactID: targetArtifactId,
                CanRead: targetArtifactId === allowedArtifactId && user.ID === readerUser.ID,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: user.ID === readerUser.ID ? 'ArtifactPermission' : 'Denied',
                Reason: user.ID === readerUser.ID ? 'Allowed' : 'Denied'
            })
        );

        const maxVerParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID='${allowedArtifactId}'`,
            Fields: ['VersionNumber'],
            ResultType: 'simple'
        };
        const rawResults: RunViewResult = {
            Success: true,
            Results: [{ VersionNumber: 1 }, { VersionNumber: 2 }],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const allowed = await ArtifactVersionPostRunViewHook(maxVerParams, rawResults, readerUser);
        expect(allowed.Results).toEqual([{ VersionNumber: 1 }, { VersionNumber: 2 }]);

        const denied = await ArtifactVersionPostRunViewHook(maxVerParams, rawResults, outsiderUser);
        expect(denied.Results).toEqual([]);
        expect(denied.RowCount).toBe(0);
    });

    it('hydrates ArtifactID by version ID when PostRunView receives narrow ID-only rows without PreRunView', async () => {
        const runViewFn = vi.fn(async (params: RunViewParams, user?: UserInfo): Promise<RunViewResult> => {
            expect(user?.ID).toBe(systemUser.ID);
            expect(params.EntityName).toBe('MJ: Artifact Versions');
            return {
                Success: true,
                Results: [
                    { ID: allowedVersionId, ArtifactID: allowedArtifactId },
                    { ID: deniedVersionId, ArtifactID: deniedArtifactId }
                ],
                RowCount: 2,
                TotalRowCount: 2,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        });

        const fakeDbProvider = {
            ProviderType: 'Database',
            Entities: [],
            RunView: runViewFn
        } as unknown as IMetadataProvider & IRunViewProvider;
        Object.defineProperty(readerUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, targetArtifactId) => ({
                ArtifactID: targetArtifactId,
                CanRead: targetArtifactId === allowedArtifactId,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: targetArtifactId === allowedArtifactId ? 'ArtifactPermission' : 'Denied',
                Reason: targetArtifactId === allowedArtifactId ? 'Allowed' : 'Denied'
            })
        );

        const narrowParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: 'VersionNumber >= 1',
            Fields: ['ID'],
            ResultType: 'simple'
        };
        const narrowResults: RunViewResult = {
            Success: true,
            Results: [{ ID: allowedVersionId }, { ID: deniedVersionId }],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const filtered = await ArtifactVersionPostRunViewHook(narrowParams, narrowResults, readerUser);
        expect(runViewFn).toHaveBeenCalledTimes(1);
        expect(filtered.Results).toEqual([{ ID: allowedVersionId }]);
    });

    it('resolves collection-shared CanRead & CanEdit without recursing through ArtifactVersionPostRunViewHook', async () => {
        const collectionGrantee = makeUser('44444444-4444-4444-8444-444444444444', 'col@example.com');
        const ownerId = '33333333-3333-4333-8333-333333333333';
        const collectionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

        const mockProvider = {
            ProviderType: 'Database',
            Entities: [],
            RunView: vi.fn(async (rawParams: RunViewParams, actor?: UserInfo): Promise<RunViewResult> => {
                const hooked = await ArtifactVersionPreRunViewHook(rawParams, actor);
                let res: RunViewResult;
                if (hooked.EntityName === 'MJ: Artifacts') {
                    res = {
                        Success: true,
                        Results: [
                            {
                                ID: allowedArtifactId,
                                UserID: ownerId,
                                DelegateEntityID: null,
                                DelegateRecordID: null
                            }
                        ],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Artifact Permissions') {
                    res = {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Artifact Versions') {
                    const row: Record<string, unknown> = { ID: allowedVersionId };
                    if (hooked.Fields?.includes('ArtifactID')) {
                        row['ArtifactID'] = allowedArtifactId;
                    }
                    res = {
                        Success: true,
                        Results: [row],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Collection Artifacts') {
                    res = {
                        Success: true,
                        Results: [{ CollectionID: collectionId }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else if (hooked.EntityName === 'MJ: Collection Permissions') {
                    res = {
                        Success: true,
                        Results: [{ CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                } else {
                    res = {
                        Success: true,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 1,
                        ErrorMessage: ''
                    };
                }
                return ArtifactVersionPostRunViewHook(hooked, res, actor);
            })
        } as unknown as IMetadataProvider & IRunViewProvider;

        Object.defineProperty(collectionGrantee, 'OwningProvider', {
            value: mockProvider,
            configurable: true
        });

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            mockProvider,
            allowedArtifactId,
            collectionGrantee
        );
        expect(perms.CanRead).toBe(true);
        expect(perms.CanEdit).toBe(true);
        expect(perms.Source).toBe('CollectionPermission');

        // Also verify collectionGrantee can run a narrow `Fields: ['ID']` query on MJ: Artifact Versions directly
        const narrowRes = await mockProvider.RunView(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID='${allowedArtifactId}'`,
                Fields: ['ID'],
                ResultType: 'simple'
            },
            collectionGrantee
        );
        expect(narrowRes.Results).toEqual([{ ID: allowedVersionId }]);
    });
});
