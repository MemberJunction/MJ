import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

import type { PermissionRowRecord } from './_mockPermissionProviderBase';

interface MockRunViewResponse {
    Success: boolean;
    Results: PermissionRowRecord[];
    ErrorMessage?: string;
}

const {
    sharedGlobalStore,
    runViewQueue,
    runViewCalls,
    runViewState,
    mockGetSystemUser,
} = vi.hoisted(() => ({
    sharedGlobalStore: {} as Record<string, object>,
    runViewQueue: [] as Array<{ Success: boolean; Results: PermissionRowRecord[]; ErrorMessage?: string }>,
    runViewCalls: [] as Array<{ EntityName: string; ExtraFilter?: string }>,
    runViewState: {
        customHandler: null as ((args: { EntityName: string; ExtraFilter?: string }) => Promise<{ Success: boolean; Results: PermissionRowRecord[]; ErrorMessage?: string }>) | null,
    },
    mockGetSystemUser: vi.fn<() => Promise<UserInfo | null>>(async () => null),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        GetGlobalObjectStore: () => sharedGlobalStore,
        RegisterClass: () => <T>(target: T): T => target,
        UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
            !!a && !!b && a.toLowerCase() === b.toLowerCase(),
        MJGlobal: {
            Instance: {
                GetGlobalObjectStore: () => sharedGlobalStore,
                ClassFactory: { CreateInstance: vi.fn(() => null) },
            },
        },
    };
});

vi.mock('@memberjunction/core', async () => {
    const { buildPermissionProviderBase } = await import('./_mockPermissionProviderBase');
    class MockRunView {
        static FromMetadataProvider() {
            return new MockRunView();
        }
        async RunView(args: { EntityName: string; ExtraFilter?: string }): Promise<MockRunViewResponse> {
            runViewCalls.push({ EntityName: args.EntityName, ExtraFilter: args.ExtraFilter });
            if (runViewState.customHandler) {
                return runViewState.customHandler(args);
            }
            return runViewQueue.shift() ?? { Success: true, Results: [], ErrorMessage: '' };
        }
    }
    return {
        PermissionProviderBase: buildPermissionProviderBase(MockRunView),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class MockUserInfo {
            ID = '';
            Name = '';
            UserRoles: Array<{ RoleID: string; Role: string }> = [];
        },
        Metadata: class {
            static Provider = { ProviderType: 'Database' as const, Entities: [] };
        },
        BaseEngine: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        RunView: MockRunView,
        WellKnownUserSource: {
            Instance: {
                GetSystemUser: mockGetSystemUser,
            },
        },
    };
});

// ---------------------------------------------------------------------------

import { ArtifactPermissionProvider } from '../../custom/PermissionProviders/ArtifactPermissionProvider';
import { ArtifactPermissionEngine } from '../../custom/ArtifactPermissionDelegate';
import { Metadata, UserInfo, type IMetadataProvider } from '@memberjunction/core';

const UUID_USER_A = 'aaaa0000-0000-4000-8000-000000000001';
const UUID_USER_B = 'bbbb0000-0000-4000-8000-000000000002';
const UUID_USER_C = 'cccc0000-0000-4000-8000-000000000003';
const UUID_ART_1 = 'a1000000-0000-4000-8000-000000000001';
const UUID_ART_2 = 'a2000000-0000-4000-8000-000000000002';
const UUID_PERM_1 = 'd1000000-0000-4000-8000-000000000001';
const UUID_PERM_2 = 'd2000000-0000-4000-8000-000000000002';

function makeMockUser(id: string, name: string): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Name = name;
    return user;
}

const USER_A = makeMockUser(UUID_USER_A, 'User A');
const USER_B = makeMockUser(UUID_USER_B, 'User B');

beforeEach(() => {
    runViewQueue.length = 0;
    runViewCalls.length = 0;
    runViewState.customHandler = null;
    mockGetSystemUser.mockReset();
    mockGetSystemUser.mockResolvedValue(null);
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

        it('rejects non-UUID / SQL injection IDs without executing RunView', async () => {
            const badRes = await provider.CheckPermission(USER_A, 'Artifacts', `' OR 1=1--`, 'Read');
            expect(badRes.Allowed).toBe(false);
            expect(runViewCalls).toHaveLength(0);
        });

        it('grants the requested action when the row has it', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_PERM_1, ArtifactID: UUID_ART_1, UserID: UUID_USER_A, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'Artifacts', UUID_ART_1, 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('denies actions the row does not include', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: UUID_PERM_1, ArtifactID: UUID_ART_1, UserID: UUID_USER_A, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'Artifacts', UUID_ART_1, 'Share');
            expect(result.Allowed).toBe(false);
        });
    });

    describe('GetPermissionsSharedWithUser', () => {
        it('queries the sharing filter and returns rows shared by others', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_PERM_1, ArtifactID: UUID_ART_1, UserID: UUID_USER_B, User: 'User B', SharedByUserID: UUID_USER_A,
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: false },
                ],
            });
            // Second call: fetchArtifactNames for [UUID_ART_1]
            runViewQueue.push({ Success: true, Results: [{ ID: UUID_ART_1, Name: 'My Artifact' }] });

            const result = await provider.GetPermissionsSharedWithUser(USER_B);
            expect(result).toHaveLength(1);
            expect(result[0].ResourceID).toBe(UUID_ART_1);
            expect(result[0].ResourceName).toBe('My Artifact');
            expect(result[0].SourceRecordID).toBe(UUID_PERM_1);
            expect(runViewCalls[0].ExtraFilter).toContain(`UserID='${UUID_USER_B}'`);
            expect(runViewCalls[0].ExtraFilter).toContain('SharedByUserID IS NULL');
            expect(runViewCalls[0].ExtraFilter).toContain(`SharedByUserID <> '${UUID_USER_B}'`);
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
                    { ID: UUID_PERM_1, ArtifactID: UUID_ART_1, UserID: UUID_USER_B, User: 'User B', SharedByUserID: UUID_USER_A,
                      CanRead: true, CanEdit: true, CanDelete: false, CanShare: false },
                    { ID: UUID_PERM_2, ArtifactID: UUID_ART_2, UserID: UUID_USER_C, User: 'User C', SharedByUserID: UUID_USER_A,
                      CanRead: true, CanEdit: false, CanDelete: false, CanShare: true },
                ],
            });
            // Names lookup
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: UUID_ART_1, Name: 'Artifact 1' },
                    { ID: UUID_ART_2, Name: 'Artifact 2' },
                ],
            });

            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toHaveLength(2);
            expect(runViewCalls[0].ExtraFilter).toBe(`SharedByUserID='${UUID_USER_A}'`);
            expect(result.map((r) => r.GranteeID).sort()).toEqual([UUID_USER_B, UUID_USER_C].sort());
        });

        it('returns empty when RunView fails', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'boom' });
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
    });

    describe('ArtifactPermissionEngine concurrent & Database fail-closed resolution (R7-2)', () => {
        const ARTIFACT_ID = '11111111-2222-3333-4444-555555555555';

        function createDatabaseProviderStub(): IMetadataProvider {
            return Object.assign({}, Metadata.Provider, {
                ProviderType: 'Database' as const,
                Entities: [],
            });
        }

        it('resolves three concurrent ResolvePermissions calls for the artifact owner as Owner (never Denied)', async () => {
            const dbProvider = createDatabaseProviderStub();
            const sysUser = Object.assign({}, USER_A, { ID: 'SYS-USER' });
            mockGetSystemUser.mockResolvedValue(sysUser);

            runViewState.customHandler = async (args) => {
                // Yield an async tick so all three ResolvePermissions calls interleave concurrently
                await Promise.resolve();
                if (args.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: ARTIFACT_ID,
                                UserID: USER_A.ID,
                                DelegateEntityID: null,
                                DelegateRecordID: null,
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            };

            const engine = ArtifactPermissionEngine.Instance;
            const [r1, r2, r3] = await Promise.all([
                engine.ResolvePermissions(dbProvider, ARTIFACT_ID, USER_A),
                engine.ResolvePermissions(dbProvider, ARTIFACT_ID, USER_A),
                engine.ResolvePermissions(dbProvider, ARTIFACT_ID, USER_A),
            ]);

            expect([r1.Source, r2.Source, r3.Source]).toEqual(['Owner', 'Owner', 'Owner']);
            for (const res of [r1, r2, r3]) {
                expect(res.CanRead).toBe(true);
                expect(res.CanEdit).toBe(true);
                expect(res.CanDelete).toBe(true);
                expect(res.CanShare).toBe(true);
            }
        });

        it('on Database provider with GetSystemUser() === null, owner still resolves Owner while non-owner resolves Denied with zero recursion', async () => {
            const dbProvider = createDatabaseProviderStub();
            mockGetSystemUser.mockResolvedValue(null);

            let versionQueries = 0;
            runViewState.customHandler = async (args) => {
                await Promise.resolve();
                if (args.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: ARTIFACT_ID,
                                UserID: USER_A.ID,
                                DelegateEntityID: null,
                                DelegateRecordID: null,
                            },
                        ],
                    };
                }
                if (args.EntityName === 'MJ: Artifact Versions') {
                    versionQueries++;
                }
                return { Success: true, Results: [] };
            };

            const engine = ArtifactPermissionEngine.Instance;
            const ownerRes = await engine.ResolvePermissions(dbProvider, ARTIFACT_ID, USER_A);
            expect(ownerRes.Source).toBe('Owner');
            expect(ownerRes.CanRead).toBe(true);
            expect(ownerRes.CanEdit).toBe(true);

            const nonOwnerRes = await engine.ResolvePermissions(dbProvider, ARTIFACT_ID, USER_B);
            expect(nonOwnerRes.Source).toBe('Denied');
            expect(nonOwnerRes.CanRead).toBe(false);
            expect(nonOwnerRes.CanEdit).toBe(false);
            expect(versionQueries).toBe(0);
        });
    });
});
