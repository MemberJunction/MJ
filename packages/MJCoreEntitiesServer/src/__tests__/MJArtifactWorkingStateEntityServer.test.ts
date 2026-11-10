import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    ArtifactWorkingStatePostRunViewHook,
    MJArtifactWorkingStateEntityServer
} from '../custom/MJArtifactWorkingStateEntityServer.server';

function makeUser(id: string, email: string): UserInfo {
    const u = new UserInfo(null, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: []
    });
    return u;
}

describe('MJArtifactWorkingStateEntityServer & ArtifactWorkingStatePostRunViewHook (B1)', () => {
    const systemUser = makeUser('00000000-0000-4000-8000-000000000001', 'sys.user@yourdomain.com');
    const devUser = makeUser('11111111-1111-4111-8111-111111111111', 'dev@example.com');
    const allowedArtifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const deniedArtifactId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
    });

    it('blocks non-system Save() and Delete() while allowing systemUser writes', async () => {
        const superSaveSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactWorkingStateEntityServer.prototype), 'Save')
            .mockResolvedValue(true);
        const superDeleteSpy = vi
            .spyOn(Object.getPrototypeOf(MJArtifactWorkingStateEntityServer.prototype), 'Delete')
            .mockResolvedValue(true);

        const entity = Object.create(MJArtifactWorkingStateEntityServer.prototype) as MJArtifactWorkingStateEntityServer;
        const history = [] as MJArtifactWorkingStateEntityServer['ResultHistory'];
        Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
        Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
        Object.defineProperty(entity, 'ContextCurrentUser', { value: devUser, writable: true });

        expect(await entity.Save()).toBe(false);
        expect(history[0]?.Message).toContain('server-managed');
        expect(await entity.Delete()).toBe(false);
        expect(history[1]?.Message).toContain('server-managed');
        expect(superSaveSpy).not.toHaveBeenCalled();
        expect(superDeleteSpy).not.toHaveBeenCalled();

        Object.defineProperty(entity, 'ContextCurrentUser', { value: systemUser, writable: true });
        expect(await entity.Save()).toBe(true);
        expect(await entity.Delete()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(1);
        expect(superDeleteSpy).toHaveBeenCalledTimes(1);
    });

    it('filters non-system RunView rows on MJ: Artifact Working States through ArtifactPermissionEngine', async () => {
        const fakeDbProvider = { ProviderType: 'Database' } as unknown as IMetadataProvider;
        Object.defineProperty(devUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, artifactId) => ({
                CanRead: artifactId === allowedArtifactId,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                IsOwner: false,
                Source: artifactId === allowedArtifactId ? 'DirectPermission' : 'Denied'
            })
        );

        const params: RunViewParams = {
            EntityName: 'MJ: Artifact Working States',
            ResultType: 'simple'
        };
        const rawResults: RunViewResult = {
            Success: true,
            Results: [
                { ID: 'ws-1', ArtifactID: allowedArtifactId, YjsState: 'AQID' },
                { ID: 'ws-2', ArtifactID: deniedArtifactId, YjsState: 'SECRET' }
            ],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const filteredForDev = await ArtifactWorkingStatePostRunViewHook(params, rawResults, devUser);
        expect(filteredForDev.Results).toHaveLength(1);
        expect((filteredForDev.Results[0] as { ArtifactID: string }).ArtifactID).toBe(allowedArtifactId);
        expect(filteredForDev.RowCount).toBe(1);
        expect(filteredForDev.TotalRowCount).toBe(1);

        const unfilteredForSystem = await ArtifactWorkingStatePostRunViewHook(params, rawResults, systemUser);
        expect(unfilteredForSystem.Results).toHaveLength(2);
    });
});
