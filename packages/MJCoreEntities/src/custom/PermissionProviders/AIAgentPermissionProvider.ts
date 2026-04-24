import {
    GranteeType,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

interface AIAgentPermissionRow {
    ID: string;
    AgentID: string;
    RoleID: string | null;
    UserID: string | null;
    Role?: string | null;
    User?: string | null;
    CanView: boolean;
    CanRun: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
}

/**
 * Wraps `MJ: AI Agent Permissions` behind the unified {@link PermissionProviderBase} contract.
 *
 * AIAgentPermission rows grant either a User (via UserID) or a Role (via RoleID) — never both;
 * the underlying entity enforces this via a table-level validator. Action mapping:
 * - CanView → `Read`
 * - CanRun  → `Execute`
 * - CanEdit → `Update`
 * - CanDelete → `Delete`
 *
 * User+Role grants for the same user are OR-aggregated (any grant of an action suffices).
 *
 * `resourceType` is `"AI Agents"`. `resourceId` is the agent ID.
 */
@RegisterClass(PermissionProviderBase, 'MJAIAgentPermissionProvider')
export class AIAgentPermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'AI Agent Permissions';
    readonly Description =
        'User- or role-level permissions on AI agents. Actions: View (Read), Run (Execute), Edit (Update), Delete.';
    readonly SupportedGranteeTypes: GranteeType[] = ['User', 'Role'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Execute', 'Update', 'Delete'];
    readonly SupportsDeny = false;

    override GetResourceTypes(): string[] {
        return ['AI Agents'];
    }

    async CheckPermission(
        user: UserInfo,
        _resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        if (!resourceId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'AI Agent permissions require a specific agent ID',
            };
        }

        const rows = await this.fetchPermissionsForAgent(resourceId);
        const actions = this.actionsForUser(user, rows);
        const allowed = actions.includes(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `User has ${action} via user or role grant on agent '${resourceId}'`
                : `User has no ${action} permission on agent '${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, _resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const rows = await this.fetchPermissionsForAgent(resourceId);
        const actions = this.actionsForUser(user, rows);
        if (actions.length === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: AI Agents', [resourceId]);
        return [this.buildNormalizedPermission({
            resourceType: 'AI Agents', resourceId, resourceName: nameMap.get(resourceId),
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'AI Agents') return [];

        const userRoleIds = (user.UserRoles ?? []).map((ur) => ur.RoleID);
        const userFilter = `UserID='${user.ID}'`;
        const roleFilter = userRoleIds.length ? `RoleID IN (${userRoleIds.map((r) => `'${r}'`).join(',')})` : null;
        const combinedFilter = roleFilter ? `(${userFilter}) OR (${roleFilter})` : userFilter;

        const rows = await this.fetchRows<AIAgentPermissionRow>(
            'MJ: AI Agent Permissions',
            combinedFilter,
            ['ID', 'AgentID', 'RoleID', 'UserID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            'GetUserResources'
        );

        // Group by agent and aggregate actions
        const byAgent = new Map<string, { actions: Set<PermissionAction>; sourceIds: string[] }>();
        for (const row of rows) {
            const bucket = byAgent.get(row.AgentID) ?? { actions: new Set<PermissionAction>(), sourceIds: [] };
            for (const a of this.rowActions(row)) bucket.actions.add(a);
            bucket.sourceIds.push(row.ID);
            byAgent.set(row.AgentID, bucket);
        }
        if (byAgent.size === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: AI Agents', Array.from(byAgent.keys()));
        const results: NormalizedPermission[] = [];
        for (const [agentId, { actions, sourceIds }] of byAgent) {
            if (actions.size === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'AI Agents', resourceId: agentId, resourceName: nameMap.get(agentId),
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions: Array.from(actions),
                sourceRecordId: sourceIds.length === 1 ? sourceIds[0] : undefined,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'AI Agents') return [];

        const rows = await this.fetchRows<AIAgentPermissionRow>(
            'MJ: AI Agent Permissions',
            `AgentID='${resourceId}'`,
            ['ID', 'AgentID', 'RoleID', 'UserID', 'Role', 'User', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            'GetResourcePermissions'
        );
        if (rows.length === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: AI Agents', [resourceId]);
        const resourceName = nameMap.get(resourceId);
        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.rowActions(row);
            if (actions.length === 0) continue;
            const isUser = row.UserID != null;
            results.push(this.buildNormalizedPermission({
                resourceType: 'AI Agents', resourceId, resourceName,
                granteeType: isUser ? 'User' : 'Role',
                granteeId: isUser ? row.UserID : row.RoleID,
                granteeName: isUser ? row.User ?? undefined : row.Role ?? undefined,
                actions,
                sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    private async fetchPermissionsForAgent(agentId: string): Promise<AIAgentPermissionRow[]> {
        return this.fetchRows<AIAgentPermissionRow>(
            'MJ: AI Agent Permissions',
            `AgentID='${agentId}'`,
            ['ID', 'AgentID', 'RoleID', 'UserID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            'fetchPermissionsForAgent'
        );
    }

    private actionsForUser(user: UserInfo, rows: AIAgentPermissionRow[]): PermissionAction[] {
        const set = new Set<PermissionAction>();
        for (const row of rows) {
            const matches =
                (row.UserID && UUIDsEqual(row.UserID, user.ID)) ||
                (row.RoleID && user.UserRoles?.some((ur) => UUIDsEqual(ur.RoleID, row.RoleID!)));
            if (!matches) continue;
            for (const a of this.rowActions(row)) set.add(a);
        }
        return Array.from(set);
    }

    private rowActions(row: AIAgentPermissionRow): PermissionAction[] {
        return this.boolsToActions({
            Read: row.CanView,
            Execute: row.CanRun,
            Update: row.CanEdit,
            Delete: row.CanDelete,
        });
    }
}
