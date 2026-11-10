import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
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
