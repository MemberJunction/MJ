import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
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

// Drives every RunView call from the provider. Tests set the next response(s)
// and the mock pops them in FIFO order. If the queue is empty we return an empty success.
const runViewQueue: Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }> = [];
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
        PermissionProviderBase: buildPermissionProviderBase(MockRunView as any),
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

// ---------------------------------------------------------------------------

import { ArtifactPermissionProvider } from '../../custom/PermissionProviders/ArtifactPermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = { ID: 'AAA', Name: 'User A', UserRoles: [] } as unknown as UserInfo;
const USER_B = { ID: 'BBB', Name: 'User B', UserRoles: [] } as unknown as UserInfo;

beforeEach(() => {
    runViewQueue.length = 0;
    runViewCalls.length = 0;
});

describe('ArtifactPermissionProvider', () => {
    let provider: ArtifactPermissionProvider;
    beforeEach(() => { provider = new ArtifactPermissionProvider(); });

    describe('CheckPermission', () => {
        it('returns Allowed=false without resourceId', async () => {
            const result = await provider.CheckPermission(USER_A, 'Artifacts', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('require a specific artifact ID');
        });

        it('grants the requested action when the row has it', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', ArtifactID: 'A1', UserID: 'AAA', CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'Artifacts', 'A1', 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('denies actions the row does not include', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', ArtifactID: 'A1', UserID: 'AAA', CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'Artifacts', 'A1', 'Share');
            expect(result.Allowed).toBe(false);
        });
    });

    describe('GetPermissionsSharedWithUser', () => {
        it('queries the sharing filter and returns rows shared by others', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', ArtifactID: 'A1', UserID: 'BBB', User: 'User B', SharedByUserID: 'AAA',
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                ],
            });
            // Second call: fetchArtifactNames for ['A1']
            runViewQueue.push({ Success: true, Results: [{ ID: 'A1', Name: 'My Artifact' }] });

            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toHaveLength(1);
            expect(result[0].ResourceID).toBe('A1');
            expect(result[0].ResourceName).toBe('My Artifact');
            expect(result[0].SourceRecordID).toBe('P1');
            expect(runViewCalls[0].ExtraFilter).toContain("UserID='BBB'");
            expect(runViewCalls[0].ExtraFilter).toContain('SharedByUserID IS NULL');
            expect(runViewCalls[0].ExtraFilter).toContain("SharedByUserID <> 'BBB'");
        });

        it('returns empty when no rows exist', async () => {
            runViewQueue.push({ Success: true, Results: [] });
            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toEqual([]);
        });
    });

    describe('GetPermissionsGrantedByUser', () => {
        it('queries by SharedByUserID and returns the granted rows', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', ArtifactID: 'A1', UserID: 'BBB', User: 'User B', SharedByUserID: 'AAA',
                      CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
                    { ID: 'P2', ArtifactID: 'A2', UserID: 'CCC', User: 'User C', SharedByUserID: 'AAA',
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: true },
                ],
            });
            // Names lookup
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'A1', Name: 'Artifact 1' },
                    { ID: 'A2', Name: 'Artifact 2' },
                ],
            });

            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(2);
            expect(runViewCalls[0].ExtraFilter).toBe(`SharedByUserID='AAA'`);
            expect(result.map((r) => r.GranteeID).sort()).toEqual(['BBB', 'CCC']);
        });

        it('returns empty when RunView fails', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'boom' });
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
    });
});
