import {
    GranteeType,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { DashboardEngine, DashboardUserPermissions } from '../../engines/dashboards';

/**
 * Wraps {@link DashboardEngine.GetDashboardPermissions} behind the unified
 * {@link PermissionProviderBase} contract. Dashboard permissions are user-only
 * (no role grants), support Owner / direct / category-inherited sources, and
 * cover Read / Update / Delete / Share.
 *
 * `resourceType` is always `"Dashboards"` (the entity name).
 * `resourceId` is the dashboard ID.
 *
 * The backing {@link DashboardEngine} lazy-initializes via its own `@RegisterForStartup`
 * decorator; this provider reads from it on demand so startup ordering between
 * PermissionEngine and DashboardEngine doesn't matter — whichever configures last wins.
 */
@RegisterClass(PermissionProviderBase, 'MJDashboardPermissionProvider')
export class DashboardPermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'Dashboard Permissions';
    readonly Description =
        'User-level sharing permissions on MJ dashboards; includes category-level inheritance and owner semantics';
    readonly SupportedGranteeTypes: GranteeType[] = ['User'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Update', 'Delete', 'Share'];
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
                Reason: 'Dashboard permissions require a specific dashboard ID',
            };
        }

        const perms = DashboardEngine.Instance.GetDashboardPermissions(resourceId, user.ID);
        const allowed = this.checkActionOnPermission(perms, action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `User has ${action} via ${perms.PermissionSource}`
                : `User has no ${action} permission on dashboard '${resourceId}' (source: ${perms.PermissionSource})`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, _resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const perms = DashboardEngine.Instance.GetDashboardPermissions(resourceId, user.ID);
        const actions = this.resolveActions(perms);
        if (actions.length === 0) return [];

        return [this.buildUserPermission(user, resourceId, perms, actions)];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Dashboards') return [];

        const engine = DashboardEngine.Instance;
        const results: NormalizedPermission[] = [];
        for (const dashboard of engine.Dashboards) {
            const perms = engine.GetDashboardPermissions(dashboard.ID, user.ID);
            const actions = this.resolveActions(perms);
            if (actions.length === 0) continue;

            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Dashboards',
                ResourceID: dashboard.ID,
                ResourceName: dashboard.Name,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
            });
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Dashboards') return [];

        const engine = DashboardEngine.Instance;
        const dashboard = engine.Dashboards.find((d) => UUIDsEqual(d.ID, resourceId));
        if (!dashboard) return [];

        const results: NormalizedPermission[] = [];

        if (dashboard.UserID) {
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Dashboards',
                ResourceID: dashboard.ID,
                ResourceName: dashboard.Name,
                GranteeType: 'User',
                GranteeID: dashboard.UserID,
                GranteeName: dashboard.User,
                Actions: ['Read', 'Update', 'Delete', 'Share'],
                Effect: 'Allow',
            });
        }

        for (const perm of engine.DashboardPermissions.filter((p) => UUIDsEqual(p.DashboardID, resourceId))) {
            const actions: PermissionAction[] = [];
            if (perm.CanRead) actions.push('Read');
            if (perm.CanEdit) actions.push('Update');
            if (perm.CanDelete) actions.push('Delete');
            if (perm.CanShare) actions.push('Share');
            if (actions.length === 0) continue;

            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Dashboards',
                ResourceID: dashboard.ID,
                ResourceName: dashboard.Name,
                GranteeType: 'User',
                GranteeID: perm.UserID,
                GranteeName: perm.User,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: perm.ID,
            });
        }
        return results;
    }

    private checkActionOnPermission(perms: DashboardUserPermissions, action: PermissionAction): boolean {
        switch (action) {
            case 'Read':
                return perms.CanRead;
            case 'Update':
                return perms.CanEdit;
            case 'Delete':
                return perms.CanDelete;
            case 'Share':
                return perms.CanShare;
            default:
                return false;
        }
    }

    private resolveActions(perms: DashboardUserPermissions): PermissionAction[] {
        const actions: PermissionAction[] = [];
        if (perms.CanRead) actions.push('Read');
        if (perms.CanEdit) actions.push('Update');
        if (perms.CanDelete) actions.push('Delete');
        if (perms.CanShare) actions.push('Share');
        return actions;
    }

    private buildUserPermission(
        user: UserInfo,
        dashboardId: string,
        perms: DashboardUserPermissions,
        actions: PermissionAction[]
    ): NormalizedPermission {
        const dashboard = DashboardEngine.Instance.Dashboards.find((d) => UUIDsEqual(d.ID, dashboardId));
        return {
            DomainName: this.DomainName,
            ResourceType: 'Dashboards',
            ResourceID: dashboardId,
            ResourceName: dashboard?.Name,
            GranteeType: 'User',
            GranteeID: user.ID,
            GranteeName: user.Name,
            Actions: actions,
            Effect: 'Allow',
        };
    }
}
