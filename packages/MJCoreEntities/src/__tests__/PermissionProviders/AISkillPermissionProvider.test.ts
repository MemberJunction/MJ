import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — mirror AIAgentPermissionProvider.test.ts exactly (shared base stub +
// per-file RunView queue/recorder). Adapted Agent→Skill vocabulary.
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

import { AISkillPermissionProvider } from '../../custom/PermissionProviders/AISkillPermissionProvider';
import type { UserInfo } from '@memberjunction/core';

const USER_A = {
    ID: 'AAA',
    Name: 'User A',
    UserRoles: [{ RoleID: 'ROLE-UI' }],
} as unknown as UserInfo;

beforeEach(() => {
    runViewQueue.length = 0;
    runViewCalls.length = 0;
});

describe('AISkillPermissionProvider', () => {
    let provider: AISkillPermissionProvider;
    beforeEach(() => { provider = new AISkillPermissionProvider(); });

    describe('metadata surface', () => {
        it('exposes the AI Skill Permissions domain and its resource type', () => {
            expect(provider.DomainName).toBe('AI Skill Permissions');
            expect(provider.GetResourceTypes()).toEqual(['AI Skills']);
        });

        it('supports the mapped actions Read / Execute / Update / Delete', () => {
            expect([...provider.SupportedActions].sort()).toEqual(['Delete', 'Execute', 'Read', 'Update']);
        });
    });

    describe('CheckPermission', () => {
        it('returns Allowed=false when no resourceId is given', async () => {
            const result = await provider.CheckPermission(USER_A, 'AI Skills', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('specific skill ID');
        });

        it('returns Allowed=true when a direct UserID row grants the action (CanRun→Execute)', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', SkillID: 'SK1', UserID: 'AAA', RoleID: null,
                    CanView: true, CanRun: true, CanEdit: false, CanDelete: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Skills', 'SK1', 'Execute');
            expect(result.Allowed).toBe(true);
        });

        it('returns Allowed=true when a RoleID row the user holds grants the action', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', SkillID: 'SK1', UserID: null, RoleID: 'ROLE-UI',
                    CanView: true, CanRun: false, CanEdit: false, CanDelete: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Skills', 'SK1', 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('returns Allowed=false when no matching row', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', SkillID: 'SK1', UserID: 'OTHER', RoleID: null,
                    CanView: true, CanRun: true, CanEdit: false, CanDelete: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Skills', 'SK1', 'Read');
            expect(result.Allowed).toBe(false);
        });

        it('aggregates actions across multiple matching rows (User + Role OR)', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', SkillID: 'SK1', UserID: 'AAA', RoleID: null,
                        CanView: true, CanRun: false, CanEdit: false, CanDelete: false },
                    { ID: 'P2', SkillID: 'SK1', UserID: null, RoleID: 'ROLE-UI',
                        CanView: false, CanRun: true, CanEdit: false, CanDelete: false },
                ],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Skills', 'SK1', 'Execute');
            expect(result.Allowed).toBe(true);
        });
    });

    describe('GetEffectivePermissions', () => {
        it('returns a single normalized permission naming the user grantee and mapped actions', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', SkillID: 'SK1', UserID: 'AAA', RoleID: null,
                    CanView: true, CanRun: true, CanEdit: false, CanDelete: false }],
            });
            runViewQueue.push({ Success: true, Results: [{ ID: 'SK1', Name: 'Summarizer' }] });

            const result = await provider.GetEffectivePermissions(USER_A, 'AI Skills', 'SK1');
            expect(result).toHaveLength(1);
            expect(result[0].ResourceID).toBe('SK1');
            expect(result[0].ResourceName).toBe('Summarizer');
            expect(result[0].GranteeType).toBe('User');
            expect(result[0].GranteeID).toBe('AAA');
            expect(result[0].Actions.sort()).toEqual(['Execute', 'Read']);
        });

        it('returns [] when the user has no effective actions on the skill', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', SkillID: 'SK1', UserID: 'OTHER', RoleID: null,
                    CanView: true, CanRun: true, CanEdit: true, CanDelete: true }],
            });
            const result = await provider.GetEffectivePermissions(USER_A, 'AI Skills', 'SK1');
            expect(result).toEqual([]);
        });
    });

    describe('GetUserResources', () => {
        it('batches user and role filters and groups rows by SkillID', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', SkillID: 'SK1', UserID: 'AAA', RoleID: null,
                        CanView: true, CanRun: false, CanEdit: false, CanDelete: false },
                    { ID: 'P2', SkillID: 'SK1', UserID: null, RoleID: 'ROLE-UI',
                        CanView: false, CanRun: true, CanEdit: false, CanDelete: false },
                    { ID: 'P3', SkillID: 'SK2', UserID: 'AAA', RoleID: null,
                        CanView: true, CanRun: true, CanEdit: true, CanDelete: false },
                ],
            });
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'SK1', Name: 'Summarizer' }, { ID: 'SK2', Name: 'Translator' }],
            });

            const result = await provider.GetUserResources(USER_A);
            expect(result).toHaveLength(2);
            const sk1 = result.find((r) => r.ResourceID === 'SK1')!;
            expect(sk1.Actions.sort()).toEqual(['Execute', 'Read']);
            expect(sk1.ResourceName).toBe('Summarizer');
            // Two rows contributed — SourceRecordID is omitted when ambiguous
            expect(sk1.SourceRecordID).toBeUndefined();

            const sk2 = result.find((r) => r.ResourceID === 'SK2')!;
            expect(sk2.Actions.sort()).toEqual(['Execute', 'Read', 'Update']);
            expect(sk2.SourceRecordID).toBe('P3');

            expect(runViewCalls[0].ExtraFilter).toContain(`UserID='AAA'`);
            expect(runViewCalls[0].ExtraFilter).toContain("RoleID IN ('ROLE-UI')");
        });

        it('returns empty on RunView failure', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'boom' });
            const result = await provider.GetUserResources(USER_A);
            expect(result).toEqual([]);
        });

        it('filters to skill resource types only', async () => {
            const result = await provider.GetUserResources(USER_A, 'Dashboards');
            expect(result).toEqual([]);
            expect(runViewCalls).toHaveLength(0);
        });
    });

    describe('GetResourcePermissions', () => {
        it('enumerates both User and Role grantees on a skill', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', SkillID: 'SK1', UserID: 'U1', User: 'Alice', RoleID: null,
                        CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
                    { ID: 'P2', SkillID: 'SK1', UserID: null, RoleID: 'ROLE-UI', Role: 'UI',
                        CanView: true, CanRun: false, CanEdit: false, CanDelete: false },
                ],
            });
            runViewQueue.push({ Success: true, Results: [{ ID: 'SK1', Name: 'Summarizer' }] });

            const result = await provider.GetResourcePermissions('AI Skills', 'SK1');
            expect(result).toHaveLength(2);
            const userGrant = result.find((r) => r.GranteeType === 'User')!;
            expect(userGrant.GranteeName).toBe('Alice');
            expect(userGrant.Actions.sort()).toEqual(['Execute', 'Read']);
            const roleGrant = result.find((r) => r.GranteeType === 'Role')!;
            expect(roleGrant.GranteeName).toBe('UI');
            expect(roleGrant.Actions).toEqual(['Read']);
        });

        it('rejects wrong resourceType', async () => {
            const result = await provider.GetResourcePermissions('Dashboards', 'X');
            expect(result).toEqual([]);
            expect(runViewCalls).toHaveLength(0);
        });
    });

    describe('inherited share-center methods', () => {
        it('GetPermissionsGrantedByUser returns [] (role-only share semantics)', async () => {
            const result = await provider.GetPermissionsGrantedByUser(USER_A);
            expect(result).toEqual([]);
        });
        it('GetPermissionsSharedWithUser returns [] (role-only share semantics)', async () => {
            const result = await provider.GetPermissionsSharedWithUser(USER_A);
            expect(result).toEqual([]);
        });
    });
});
