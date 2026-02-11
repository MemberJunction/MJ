/**
 * Unit tests for AIAgentPermissionHelper
 * Tests permission hierarchy logic, owner checks, and default behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a mock AIEngineBase Instance
const mockAgents: Array<{ ID: string; OwnerUserID: string }> = [];
const mockAgentPermissions: Array<{
    AgentID: string;
    UserID: string | null;
    RoleID: string | null;
    CanView: boolean;
    CanRun: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
}> = [];

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    UserInfo: class {
        ID: string = '';
        UserRoles: Array<{ RoleID: string }> = [];
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    AIAgentEntity: class {},
}));

vi.mock('../BaseAIEngine', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Agents() { return mockAgents; },
            get AgentPermissions() { return mockAgentPermissions; },
        }
    }
}));

import { AIAgentPermissionHelper, EffectiveAgentPermissions } from '../AIAgentPermissionHelper';

function createUser(id: string, roleIds: string[] = []): { ID: string; UserRoles: Array<{ RoleID: string }> } {
    return {
        ID: id,
        UserRoles: roleIds.map(rid => ({ RoleID: rid })),
    };
}

describe('AIAgentPermissionHelper', () => {
    beforeEach(() => {
        mockAgents.length = 0;
        mockAgentPermissions.length = 0;
    });

    describe('GetEffectivePermissions', () => {
        it('should grant all permissions to owner', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'user-1' });
            const user = createUser('user-1');

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            expect(perms).toEqual({
                canView: true,
                canRun: true,
                canEdit: true,
                canDelete: true,
                isOwner: true,
            });
        });

        it('should grant view and run by default when no permission records exist', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            const user = createUser('user-2');

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            expect(perms.canView).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
            expect(perms.isOwner).toBe(false);
        });

        it('should deny all permissions when agent not found', async () => {
            const user = createUser('user-1');
            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('non-existent', user as never);
            expect(perms.canView).toBe(false);
            expect(perms.canRun).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
        });

        it('should apply hierarchical logic: delete implies edit, run, view', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: 'user-2',
                RoleID: null,
                CanView: false,
                CanRun: false,
                CanEdit: false,
                CanDelete: true,
            });
            const user = createUser('user-2');

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            expect(perms.canDelete).toBe(true);
            expect(perms.canEdit).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canView).toBe(true);
        });

        it('should apply hierarchical logic: edit implies run and view', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: 'user-2',
                RoleID: null,
                CanView: false,
                CanRun: false,
                CanEdit: true,
                CanDelete: false,
            });
            const user = createUser('user-2');

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            expect(perms.canDelete).toBe(false);
            expect(perms.canEdit).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canView).toBe(true);
        });

        it('should apply hierarchical logic: run implies view', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: 'user-2',
                RoleID: null,
                CanView: false,
                CanRun: true,
                CanEdit: false,
                CanDelete: false,
            });
            const user = createUser('user-2');

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            expect(perms.canDelete).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canRun).toBe(true);
            expect(perms.canView).toBe(true);
        });

        it('should grant view-only permissions', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: 'user-2',
                RoleID: null,
                CanView: true,
                CanRun: false,
                CanEdit: false,
                CanDelete: false,
            });
            const user = createUser('user-2');

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            expect(perms.canView).toBe(true);
            expect(perms.canRun).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
        });

        it('should match permissions by role', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: null,
                RoleID: 'role-admin',
                CanView: true,
                CanRun: true,
                CanEdit: true,
                CanDelete: false,
            });
            const user = createUser('user-2', ['role-admin']);

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            expect(perms.canView).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canEdit).toBe(true);
            expect(perms.canDelete).toBe(false);
        });

        it('should combine user and role permissions with OR logic', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            // User permission: view only
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: 'user-2',
                RoleID: null,
                CanView: true,
                CanRun: false,
                CanEdit: false,
                CanDelete: false,
            });
            // Role permission: run only
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: null,
                RoleID: 'role-runner',
                CanView: false,
                CanRun: true,
                CanEdit: false,
                CanDelete: false,
            });
            const user = createUser('user-2', ['role-runner']);

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            // Combined: view (user) + run (role) + hierarchical (run->view)
            expect(perms.canView).toBe(true);
            expect(perms.canRun).toBe(true);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
        });

        it('should not match permissions for a different agent', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-2',  // Different agent
                UserID: 'user-2',
                RoleID: null,
                CanView: true,
                CanRun: true,
                CanEdit: true,
                CanDelete: true,
            });
            const user = createUser('user-2');

            // Agent-1 has no permissions for user-2, so default behavior applies
            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            // With permission records existing (for agent-2), agent-1 has none matching
            // But we only filter by agentId, so agent-2 permissions aren't matched
            // Default behavior: open view/run
            expect(perms.canView).toBe(true);
            expect(perms.canRun).toBe(true);
        });

        it('should deny all when no matching user or role permissions exist for the agent', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: 'other-user',
                RoleID: null,
                CanView: true,
                CanRun: true,
                CanEdit: true,
                CanDelete: true,
            });
            const user = createUser('user-2');

            const perms = await AIAgentPermissionHelper.GetEffectivePermissions('agent-1', user as never);
            // Permissions exist for agent-1 but not for user-2, so no match found
            // No matching permissions = all false
            expect(perms.canView).toBe(false);
            expect(perms.canRun).toBe(false);
            expect(perms.canEdit).toBe(false);
            expect(perms.canDelete).toBe(false);
        });
    });

    describe('HasPermission', () => {
        it('should return true for owner with any permission', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'user-1' });
            const user = createUser('user-1');

            expect(await AIAgentPermissionHelper.HasPermission('agent-1', user as never, 'view')).toBe(true);
            expect(await AIAgentPermissionHelper.HasPermission('agent-1', user as never, 'run')).toBe(true);
            expect(await AIAgentPermissionHelper.HasPermission('agent-1', user as never, 'edit')).toBe(true);
            expect(await AIAgentPermissionHelper.HasPermission('agent-1', user as never, 'delete')).toBe(true);
        });

        it('should return false for delete when user only has edit permission', async () => {
            mockAgents.push({ ID: 'agent-1', OwnerUserID: 'owner-1' });
            mockAgentPermissions.push({
                AgentID: 'agent-1',
                UserID: 'user-2',
                RoleID: null,
                CanView: true,
                CanRun: true,
                CanEdit: true,
                CanDelete: false,
            });
            const user = createUser('user-2');

            expect(await AIAgentPermissionHelper.HasPermission('agent-1', user as never, 'delete')).toBe(false);
            expect(await AIAgentPermissionHelper.HasPermission('agent-1', user as never, 'edit')).toBe(true);
        });
    });
});
