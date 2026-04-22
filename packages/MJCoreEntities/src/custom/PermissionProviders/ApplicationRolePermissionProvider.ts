import {
    GranteeType,
    Metadata,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { UserInfoEngine } from '../../engines/UserInfoEngine';

/**
 * Wraps the Phase 1 {@link UserInfoEngine} application-access logic behind the
 * unified {@link PermissionProviderBase} contract. Unlike `UserHasApplicationAccess`
 * which operates on the *current* user only, this provider reasons about arbitrary
 * users by inspecting the raw ApplicationRole catalog.
 *
 * Mapping: `Read` = CanAccess, `Admin` = CanAdmin.
 *
 * `resourceType` is always `"Applications"`. `resourceId` is the application ID.
 *
 * An application with zero ApplicationRole records is "open access" — every user
 * has Read (but not Admin) on it.
 */
@RegisterClass(PermissionProviderBase, 'MJApplicationRolePermissionProvider')
export class ApplicationRolePermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'Application Roles';
    readonly Description =
        'Role-based authorization for MJ applications (Phase 1). Apps with no ApplicationRole records are open-access.';
    readonly SupportedGranteeTypes: GranteeType[] = ['Role'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Admin'];
    readonly SupportsDeny = false;

    async CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        if (resourceType !== 'Applications') {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: `Unsupported resource type '${resourceType}'; expected 'Applications'`,
            };
        }
        if (!resourceId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'Application permissions require a specific application ID',
            };
        }

        const actions = this.actionsForUserApp(user, resourceId);
        const allowed = actions.includes(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `User has ${action} on application '${resourceId}'`
                : `User lacks ${action} on application '${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Applications') return [];
        const actions = this.actionsForUserApp(user, resourceId);
        if (actions.length === 0) return [];
        return [this.buildUserPermission(user, resourceId, actions)];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Applications') return [];

        const md = new Metadata();
        const results: NormalizedPermission[] = [];
        for (const app of md.Applications) {
            const actions = this.actionsForUserApp(user, app.ID);
            if (actions.length === 0) continue;
            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Applications',
                ResourceID: app.ID,
                ResourceName: app.Name,
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
        if (resourceType !== 'Applications') return [];

        const md = new Metadata();
        const app = md.Applications.find((a) => UUIDsEqual(a.ID, resourceId));
        if (!app) return [];

        const appRoles = UserInfoEngine.Instance.ApplicationRoles.filter((ar) =>
            UUIDsEqual(ar.ApplicationID, resourceId)
        );

        // Open access: return a synthetic "Everyone" row so the Sharing Center
        // can visually distinguish unrestricted apps from explicitly-granted ones.
        if (appRoles.length === 0) {
            return [
                {
                    DomainName: this.DomainName,
                    ResourceType: 'Applications',
                    ResourceID: app.ID,
                    ResourceName: app.Name,
                    GranteeType: 'Everyone',
                    GranteeID: null,
                    GranteeName: 'All authenticated users',
                    Actions: ['Read'],
                    Effect: 'Allow',
                },
            ];
        }

        const results: NormalizedPermission[] = [];
        for (const ar of appRoles) {
            const actions: PermissionAction[] = [];
            if (ar.CanAccess) actions.push('Read');
            if (ar.CanAdmin) actions.push('Admin');
            if (actions.length === 0) continue;

            results.push({
                DomainName: this.DomainName,
                ResourceType: 'Applications',
                ResourceID: app.ID,
                ResourceName: app.Name,
                GranteeType: 'Role',
                GranteeID: ar.RoleID,
                GranteeName: ar.Role,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: ar.ID,
            });
        }
        return results;
    }

    private actionsForUserApp(user: UserInfo, applicationId: string): PermissionAction[] {
        const appRoles = UserInfoEngine.Instance.ApplicationRoles.filter((ar) =>
            UUIDsEqual(ar.ApplicationID, applicationId)
        );

        // Open access semantics (Phase 1): no rows = every authenticated user has Read.
        if (appRoles.length === 0) {
            return ['Read'];
        }

        if (!user.UserRoles?.length) return [];

        let canAccess = false;
        let canAdmin = false;
        for (const ur of user.UserRoles) {
            for (const ar of appRoles) {
                if (UUIDsEqual(ar.RoleID, ur.RoleID)) {
                    if (ar.CanAccess) canAccess = true;
                    if (ar.CanAdmin) canAdmin = true;
                }
            }
        }
        const actions: PermissionAction[] = [];
        if (canAccess) actions.push('Read');
        if (canAdmin) actions.push('Admin');
        return actions;
    }

    private buildUserPermission(user: UserInfo, applicationId: string, actions: PermissionAction[]): NormalizedPermission {
        const md = new Metadata();
        const app = md.Applications.find((a) => UUIDsEqual(a.ID, applicationId));
        return {
            DomainName: this.DomainName,
            ResourceType: 'Applications',
            ResourceID: applicationId,
            ResourceName: app?.Name,
            GranteeType: 'User',
            GranteeID: user.ID,
            GranteeName: user.Name,
            Actions: actions,
            Effect: 'Allow',
        };
    }
}
