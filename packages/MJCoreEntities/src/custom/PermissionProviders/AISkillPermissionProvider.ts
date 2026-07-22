import {
    GranteeType,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

interface AISkillPermissionRow {
    ID: string;
    SkillID: string;
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
 * Wraps `MJ: AI Skill Permissions` behind the unified {@link PermissionProviderBase} contract —
 * the closed-by-default, explicit-grants view that powers the Sharing Center and audit.
 *
 * This is the skill sibling of `AIAgentPermissionProvider`. AISkillPermission rows grant either a
 * User (via UserID) or a Role (via RoleID) — never both; the server entity enforces this. Action
 * mapping:
 * - CanView → `Read`
 * - CanRun  → `Execute`  (request/activate the skill at agent runtime)
 * - CanEdit → `Update`
 * - CanDelete → `Delete`
 *
 * User+Role grants for the same user are OR-aggregated (any grant of an action suffices).
 *
 * `resourceType` is `"AI Skills"`. `resourceId` is the skill ID. NOTE: this provider reports only
 * explicit grants; the open-by-default runtime behavior (no rows → View+Run for everyone) lives in
 * `AISkillPermissionHelper` — see guides/UNIFIED_PERMISSIONS_GUIDE.md for why the two paths differ.
 */
@RegisterClass(PermissionProviderBase, 'MJAISkillPermissionProvider')
export class AISkillPermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'AI Skill Permissions';
    readonly Description =
        'User- or role-level permissions on AI skills. Actions: View (Read), Run (Execute), Edit (Update), Delete.';
    readonly SupportedGranteeTypes: GranteeType[] = ['User', 'Role'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Execute', 'Update', 'Delete'];
    readonly SupportsDeny = false;

    override GetResourceTypes(): string[] {
        return ['AI Skills'];
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
                Reason: 'AI Skill permissions require a specific skill ID',
            };
        }

        const rows = await this.fetchPermissionsForSkill(resourceId);
        const actions = this.actionsForUser(user, rows);
        const allowed = actions.includes(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `User has ${action} via user or role grant on skill '${resourceId}'`
                : `User has no ${action} permission on skill '${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, _resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const rows = await this.fetchPermissionsForSkill(resourceId);
        const actions = this.actionsForUser(user, rows);
        if (actions.length === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: AI Skills', [resourceId]);
        return [this.buildNormalizedPermission({
            resourceType: 'AI Skills', resourceId, resourceName: nameMap.get(resourceId),
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'AI Skills') return [];

        const userRoleIds = (user.UserRoles ?? []).map((ur) => ur.RoleID);
        const userFilter = `UserID='${user.ID}'`;
        const roleFilter = userRoleIds.length ? `RoleID IN (${userRoleIds.map((r) => `'${r}'`).join(',')})` : null;
        const combinedFilter = roleFilter ? `(${userFilter}) OR (${roleFilter})` : userFilter;

        const rows = await this.fetchRows<AISkillPermissionRow>(
            'MJ: AI Skill Permissions',
            combinedFilter,
            ['ID', 'SkillID', 'RoleID', 'UserID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            'GetUserResources'
        );

        // Group by skill and aggregate actions.
        const bySkill = new Map<string, { actions: Set<PermissionAction>; sourceIds: string[] }>();
        for (const row of rows) {
            const bucket = bySkill.get(row.SkillID) ?? { actions: new Set<PermissionAction>(), sourceIds: [] };
            for (const a of this.rowActions(row)) bucket.actions.add(a);
            bucket.sourceIds.push(row.ID);
            bySkill.set(row.SkillID, bucket);
        }
        if (bySkill.size === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: AI Skills', Array.from(bySkill.keys()));
        const results: NormalizedPermission[] = [];
        for (const [skillId, { actions, sourceIds }] of bySkill) {
            if (actions.size === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'AI Skills', resourceId: skillId, resourceName: nameMap.get(skillId),
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions: Array.from(actions),
                sourceRecordId: sourceIds.length === 1 ? sourceIds[0] : undefined,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'AI Skills') return [];

        const rows = await this.fetchRows<AISkillPermissionRow>(
            'MJ: AI Skill Permissions',
            `SkillID='${resourceId}'`,
            ['ID', 'SkillID', 'RoleID', 'UserID', 'Role', 'User', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            'GetResourcePermissions'
        );
        if (rows.length === 0) return [];

        const nameMap = await this.bulkLookupNames('MJ: AI Skills', [resourceId]);
        const resourceName = nameMap.get(resourceId);
        const results: NormalizedPermission[] = [];
        for (const row of rows) {
            const actions = this.rowActions(row);
            if (actions.length === 0) continue;
            const isUser = row.UserID != null;
            results.push(this.buildNormalizedPermission({
                resourceType: 'AI Skills', resourceId, resourceName,
                granteeType: isUser ? 'User' : 'Role',
                granteeId: isUser ? row.UserID : row.RoleID,
                granteeName: isUser ? row.User ?? undefined : row.Role ?? undefined,
                actions,
                sourceRecordId: row.ID,
            }));
        }
        return results;
    }

    private async fetchPermissionsForSkill(skillId: string): Promise<AISkillPermissionRow[]> {
        return this.fetchRows<AISkillPermissionRow>(
            'MJ: AI Skill Permissions',
            `SkillID='${skillId}'`,
            ['ID', 'SkillID', 'RoleID', 'UserID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
            'fetchPermissionsForSkill'
        );
    }

    private actionsForUser(user: UserInfo, rows: AISkillPermissionRow[]): PermissionAction[] {
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

    private rowActions(row: AISkillPermissionRow): PermissionAction[] {
        return this.boolsToActions({
            Read: row.CanView,
            Execute: row.CanRun,
            Update: row.CanEdit,
            Delete: row.CanDelete,
        });
    }
}
