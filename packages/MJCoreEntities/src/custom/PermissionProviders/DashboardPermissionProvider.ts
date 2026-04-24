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

    override GetResourceTypes(): string[] {
        return ['Dashboards'];
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
        return [this.buildDashboardPermission(resourceId, {
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Dashboards') return [];

        const engine = DashboardEngine.Instance;
        const results: NormalizedPermission[] = [];
        for (const dashboard of engine.Dashboards) {
            const perms = engine.GetDashboardPermissions(dashboard.ID, user.ID);
            const actions = this.resolveActions(perms);
            if (actions.length === 0) continue;

            results.push(this.buildNormalizedPermission({
                resourceType: 'Dashboards', resourceId: dashboard.ID, resourceName: dashboard.Name,
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
            }));
        }
        return results;
    }

    /**
     * Dashboards shared with `grantee` by someone else. Excludes dashboards the
     * user owns and excludes permission rows the user created themselves.
     *
     * Permission rows whose dashboard no longer exists in the engine cache are
     * skipped — covers the window between a DB cascade delete (cleaning up
     * DashboardPermission rows) and the engine cache being refreshed.
     */
    override async GetPermissionsSharedWithUser(grantee: UserInfo): Promise<NormalizedPermission[]> {
        const engine = DashboardEngine.Instance;
        const dashboardsById = new Map(engine.Dashboards.map((d) => [d.ID, d]));
        const ownedDashboardIds = new Set(
            engine.Dashboards
                .filter((d) => d.UserID && UUIDsEqual(d.UserID, grantee.ID))
                .map((d) => d.ID)
        );

        const results: NormalizedPermission[] = [];
        for (const perm of engine.DashboardPermissions) {
            if (!UUIDsEqual(perm.UserID, grantee.ID)) continue;
            const dashboard = dashboardsById.get(perm.DashboardID);
            if (!dashboard) continue;
            if (ownedDashboardIds.has(perm.DashboardID)) continue;
            if (perm.SharedByUserID && UUIDsEqual(perm.SharedByUserID, grantee.ID)) continue;

            const actions = this.permRowActions(perm);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Dashboards', resourceId: perm.DashboardID, resourceName: dashboard.Name,
                granteeType: 'User', granteeId: grantee.ID, granteeName: grantee.Name, actions,
                sourceRecordId: perm.ID,
            }));
        }
        return results;
    }

    /**
     * Every DashboardPermission row where this user is the effective grantor —
     * either explicitly (`SharedByUserID === grantor.ID`) or implicitly (the user
     * owns the dashboard and `SharedByUserID` is NULL — legacy shape from before
     * the grantor column was captured).
     */
    override async GetPermissionsGrantedByUser(grantor: UserInfo): Promise<NormalizedPermission[]> {
        const engine = DashboardEngine.Instance;
        const dashboardsById = new Map(engine.Dashboards.map((d) => [d.ID, d]));
        const ownedDashboardIds = new Set(
            engine.Dashboards
                .filter((d) => d.UserID && UUIDsEqual(d.UserID, grantor.ID))
                .map((d) => d.ID)
        );

        const results: NormalizedPermission[] = [];
        for (const perm of engine.DashboardPermissions) {
            const dashboard = dashboardsById.get(perm.DashboardID);
            if (!dashboard) continue;
            const explicit = perm.SharedByUserID && UUIDsEqual(perm.SharedByUserID, grantor.ID);
            const implicit = !perm.SharedByUserID && ownedDashboardIds.has(perm.DashboardID);
            if (!explicit && !implicit) continue;
            if (UUIDsEqual(perm.UserID, grantor.ID)) continue;

            const actions = this.permRowActions(perm);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Dashboards', resourceId: perm.DashboardID, resourceName: dashboard.Name,
                granteeType: 'User', granteeId: perm.UserID, granteeName: perm.User, actions,
                sourceRecordId: perm.ID,
            }));
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
            results.push(this.buildNormalizedPermission({
                resourceType: 'Dashboards', resourceId: dashboard.ID, resourceName: dashboard.Name,
                granteeType: 'User', granteeId: dashboard.UserID, granteeName: dashboard.User,
                actions: ['Read', 'Update', 'Delete', 'Share'],
            }));
        }

        for (const perm of engine.DashboardPermissions.filter((p) => UUIDsEqual(p.DashboardID, resourceId))) {
            const actions = this.permRowActions(perm);
            if (actions.length === 0) continue;

            results.push(this.buildNormalizedPermission({
                resourceType: 'Dashboards', resourceId: dashboard.ID, resourceName: dashboard.Name,
                granteeType: 'User', granteeId: perm.UserID, granteeName: perm.User, actions,
                sourceRecordId: perm.ID,
            }));
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
        return this.boolsToActions({
            Read: perms.CanRead,
            Update: perms.CanEdit,
            Delete: perms.CanDelete,
            Share: perms.CanShare,
        });
    }

    private permRowActions(perm: { CanRead: boolean; CanEdit: boolean; CanDelete: boolean; CanShare: boolean }): PermissionAction[] {
        return this.boolsToActions({
            Read: perm.CanRead,
            Update: perm.CanEdit,
            Delete: perm.CanDelete,
            Share: perm.CanShare,
        });
    }

    private buildDashboardPermission(
        dashboardId: string,
        args: { granteeType: GranteeType; granteeId: string | null; granteeName?: string; actions: PermissionAction[] }
    ): NormalizedPermission {
        const dashboard = DashboardEngine.Instance.Dashboards.find((d) => UUIDsEqual(d.ID, dashboardId));
        return this.buildNormalizedPermission({
            resourceType: 'Dashboards', resourceId: dashboardId, resourceName: dashboard?.Name,
            ...args,
        });
    }
}
