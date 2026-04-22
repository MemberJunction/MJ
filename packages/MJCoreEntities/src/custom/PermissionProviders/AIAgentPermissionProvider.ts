import {
    GranteeType,
    LogError,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    RunView,
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

interface AIAgentRow {
    ID: string;
    Name: string | null;
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

        const agent = await this.fetchAgent(resourceId);
        return [
            {
                DomainName: this.DomainName,
                ResourceType: 'AI Agents',
                ResourceID: resourceId,
                ResourceName: agent?.Name ?? undefined,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
            },
        ];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'AI Agents') return [];

        const userRoleIds = (user.UserRoles ?? []).map((ur) => ur.RoleID);
        const rv = new RunView();

        // Load permissions where the user matches OR any of the user's roles match
        const userFilter = `UserID='${user.ID}'`;
        const roleFilter = userRoleIds.length ? `RoleID IN (${userRoleIds.map((r) => `'${r}'`).join(',')})` : null;
        const combinedFilter = roleFilter ? `(${userFilter}) OR (${roleFilter})` : userFilter;

        const result = await rv.RunView<AIAgentPermissionRow>({
            EntityName: 'MJ: AI Agent Permissions',
            ExtraFilter: combinedFilter,
            Fields: ['ID', 'AgentID', 'RoleID', 'UserID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`AIAgentPermissionProvider.GetUserResources: ${result.ErrorMessage}`);
            return [];
        }

        // Group by agent and aggregate actions
        const byAgent = new Map<string, { actions: Set<PermissionAction>; sourceIds: string[] }>();
        for (const row of result.Results ?? []) {
            const bucket = byAgent.get(row.AgentID) ?? { actions: new Set<PermissionAction>(), sourceIds: [] };
            for (const a of this.rowActions(row)) bucket.actions.add(a);
            bucket.sourceIds.push(row.ID);
            byAgent.set(row.AgentID, bucket);
        }
        if (byAgent.size === 0) return [];

        const nameMap = await this.fetchAgentNames(Array.from(byAgent.keys()));

        const results: NormalizedPermission[] = [];
        for (const [agentId, { actions, sourceIds }] of byAgent) {
            if (actions.size === 0) continue;
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'AI Agents',
                ResourceID: agentId,
                ResourceName: nameMap.get(agentId),
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: Array.from(actions),
                Effect: 'Allow',
                SourceRecordID: sourceIds.length === 1 ? sourceIds[0] : undefined,
            });
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'AI Agents') return [];

        const rv = new RunView();
        const result = await rv.RunView<AIAgentPermissionRow>({
            EntityName: 'MJ: AI Agent Permissions',
            ExtraFilter: `AgentID='${resourceId}'`,
            Fields: ['ID', 'AgentID', 'RoleID', 'UserID', 'Role', 'User', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`AIAgentPermissionProvider.GetResourcePermissions: ${result.ErrorMessage}`);
            return [];
        }

        const agent = await this.fetchAgent(resourceId);
        const results: NormalizedPermission[] = [];
        for (const row of result.Results ?? []) {
            const actions = this.rowActions(row);
            if (actions.length === 0) continue;
            const isUser = row.UserID != null;
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'AI Agents',
                ResourceID: resourceId,
                ResourceName: agent?.Name ?? undefined,
                GranteeType: isUser ? 'User' : 'Role',
                GranteeID: isUser ? row.UserID : row.RoleID,
                GranteeName: isUser ? row.User ?? undefined : row.Role ?? undefined,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: row.ID,
            });
        }
        return results;
    }

    private async fetchPermissionsForAgent(agentId: string): Promise<AIAgentPermissionRow[]> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentPermissionRow>({
            EntityName: 'MJ: AI Agent Permissions',
            ExtraFilter: `AgentID='${agentId}'`,
            Fields: ['ID', 'AgentID', 'RoleID', 'UserID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`AIAgentPermissionProvider.fetchPermissionsForAgent: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results ?? [];
    }

    private async fetchAgent(agentId: string): Promise<AIAgentRow | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentRow>({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `ID='${agentId}'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        return result.Success ? result.Results?.[0] ?? null : null;
    }

    private async fetchAgentNames(ids: string[]): Promise<Map<string, string>> {
        if (ids.length === 0) return new Map();
        const rv = new RunView();
        const filter = `ID IN (${ids.map((id) => `'${id}'`).join(',')})`;
        const result = await rv.RunView<AIAgentRow>({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: filter,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        });
        const map = new Map<string, string>();
        if (!result.Success) return map;
        for (const r of result.Results ?? []) {
            if (r.Name) map.set(r.ID, r.Name);
        }
        return map;
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
        const out: PermissionAction[] = [];
        if (row.CanView) out.push('Read');
        if (row.CanRun) out.push('Execute');
        if (row.CanEdit) out.push('Update');
        if (row.CanDelete) out.push('Delete');
        return out;
    }
}

