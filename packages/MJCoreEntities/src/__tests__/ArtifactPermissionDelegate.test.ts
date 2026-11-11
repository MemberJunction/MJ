import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mjCore from '@memberjunction/core';
import { IMetadataProvider, RunView, RunViewParams, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { ArtifactPermissionEngine } from '../custom/ArtifactPermissionDelegate';

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

        expect(ArtifactPermissionEngine.IsInternalArtifactPermissionQuery(params)).toBe(false);

        ArtifactPermissionEngine.MarkInternalArtifactPermissionQuery(params);

        const store = GetGlobalObjectStore();
        expect(store?.['___MJ_INTERNAL_ARTIFACT_PERMISSION_QUERY_PARAMS___']).toBeInstanceOf(WeakSet);
        expect(ArtifactPermissionEngine.IsInternalArtifactPermissionQuery(params)).toBe(true);

        // ProviderBase.RunView executes `params = { ...params }` before PreRunView / PostRunView hooks.
        const shallowClone: RunViewParams = { ...params };
        expect(ArtifactPermissionEngine.IsInternalArtifactPermissionQuery(shallowClone)).toBe(true);
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

        const provider: Partial<IMetadataProvider> = {
            ProviderType: 'Database',
            Entities: []
        };

        const resolved = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider as IMetadataProvider,
            artifactId,
            viewer
        );

        expect(resolved.CanRead).toBe(false);
        expect(observedParams.length).toBe(3);
        for (const p of observedParams) {
            expect(ArtifactPermissionEngine.IsInternalArtifactPermissionQuery(p)).toBe(true);
            expect(ArtifactPermissionEngine.IsInternalArtifactPermissionQuery({ ...p })).toBe(true);
        }

        expect(logErrorSpy).toHaveBeenCalledTimes(1);
        const loggedMsg = String(logErrorSpy.mock.calls[0]?.[0] ?? '');
        expect(loggedMsg).toContain(artifactId);
        expect(loggedMsg).toContain(viewer.ID);
        expect(loggedMsg).toContain('Simulated collection query failure');
    });
});
