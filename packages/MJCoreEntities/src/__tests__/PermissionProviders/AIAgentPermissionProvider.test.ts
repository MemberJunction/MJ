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

import { AIAgentPermissionProvider } from '../../custom/PermissionProviders/AIAgentPermissionProvider';
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

describe('AIAgentPermissionProvider', () => {
    let provider: AIAgentPermissionProvider;
    beforeEach(() => { provider = new AIAgentPermissionProvider(); });

    describe('CheckPermission', () => {
        it('returns Allowed=false when no resourceId is given', async () => {
            const result = await provider.CheckPermission(USER_A, 'AI Agents', null, 'Read');
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('specific agent ID');
        });

        it('returns Allowed=true when a direct UserID row grants the action', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', AgentID: 'AG1', UserID: 'AAA', RoleID: null,
                    CanView: true, CanRun: true, CanEdit: false, CanDelete: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Agents', 'AG1', 'Execute');
            expect(result.Allowed).toBe(true);
        });

        it('returns Allowed=true when a RoleID row the user holds grants the action', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', AgentID: 'AG1', UserID: null, RoleID: 'ROLE-UI',
                    CanView: true, CanRun: false, CanEdit: false, CanDelete: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Agents', 'AG1', 'Read');
            expect(result.Allowed).toBe(true);
        });

        it('returns Allowed=false when no matching row', async () => {
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'P1', AgentID: 'AG1', UserID: 'OTHER', RoleID: null,
                    CanView: true, CanRun: true, CanEdit: false, CanDelete: false }],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Agents', 'AG1', 'Read');
            expect(result.Allowed).toBe(false);
        });

        it('aggregates actions across multiple matching rows (User + Role OR)', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', AgentID: 'AG1', UserID: 'AAA', RoleID: null,
                        CanView: true, CanRun: false, CanEdit: false, CanDelete: false },
                    { ID: 'P2', AgentID: 'AG1', UserID: null, RoleID: 'ROLE-UI',
                        CanView: false, CanRun: true, CanEdit: false, CanDelete: false },
                ],
            });
            const result = await provider.CheckPermission(USER_A, 'AI Agents', 'AG1', 'Execute');
            expect(result.Allowed).toBe(true);
        });
    });

    describe('GetUserResources', () => {
        it('batches user and role filters and groups rows by AgentID', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', AgentID: 'AG1', UserID: 'AAA', RoleID: null,
                        CanView: true, CanRun: false, CanEdit: false, CanDelete: false },
                    { ID: 'P2', AgentID: 'AG1', UserID: null, RoleID: 'ROLE-UI',
                        CanView: false, CanRun: true, CanEdit: false, CanDelete: false },
                    { ID: 'P3', AgentID: 'AG2', UserID: 'AAA', RoleID: null,
                        CanView: true, CanRun: true, CanEdit: true, CanDelete: false },
                ],
            });
            runViewQueue.push({
                Success: true,
                Results: [{ ID: 'AG1', Name: 'Research' }, { ID: 'AG2', Name: 'Sage' }],
            });

            const result = await provider.GetUserResources(USER_A);
            expect(result).toHaveLength(2);
            const ag1 = result.find((r) => r.ResourceID === 'AG1')!;
            expect(ag1.Actions.sort()).toEqual(['Execute', 'Read']);
            expect(ag1.ResourceName).toBe('Research');
            // Two rows contributed — SourceRecordID is omitted when ambiguous
            expect(ag1.SourceRecordID).toBeUndefined();

            const ag2 = result.find((r) => r.ResourceID === 'AG2')!;
            expect(ag2.Actions.sort()).toEqual(['Execute', 'Read', 'Update']);
            expect(ag2.SourceRecordID).toBe('P3');

            expect(runViewCalls[0].ExtraFilter).toContain(`UserID='AAA'`);
            expect(runViewCalls[0].ExtraFilter).toContain("RoleID IN ('ROLE-UI')");
        });

        it('returns empty on RunView failure', async () => {
            runViewQueue.push({ Success: false, Results: [], ErrorMessage: 'boom' });
            const result = await provider.GetUserResources(USER_A);
            expect(result).toEqual([]);
        });

        it('filters to agent resource types only', async () => {
            const result = await provider.GetUserResources(USER_A, 'Dashboards');
            expect(result).toEqual([]);
            expect(runViewCalls).toHaveLength(0);
        });
    });

    describe('GetResourcePermissions', () => {
        it('enumerates both User and Role grantees on an agent', async () => {
            runViewQueue.push({
                Success: true,
                Results: [
                    { ID: 'P1', AgentID: 'AG1', UserID: 'U1', User: 'Alice', RoleID: null,
                        CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
                    { ID: 'P2', AgentID: 'AG1', UserID: null, RoleID: 'ROLE-UI', Role: 'UI',
                        CanView: true, CanRun: false, CanEdit: false, CanDelete: false },
                ],
            });
            runViewQueue.push({ Success: true, Results: [{ ID: 'AG1', Name: 'Research' }] });

            const result = await provider.GetResourcePermissions('AI Agents', 'AG1');
            expect(result).toHaveLength(2);
            expect(result.find((r) => r.GranteeType === 'User')?.GranteeName).toBe('Alice');
            expect(result.find((r) => r.GranteeType === 'Role')?.GranteeName).toBe('UI');
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
