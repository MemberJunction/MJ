import {
    GranteeType,
    IMetadataProvider,
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

    override GetResourceTypes(): string[] {
        return ['Applications'];
    }

    async CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction,
        _provider?: IMetadataProvider
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

    async GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Applications') return [];
        const actions = this.actionsForUserApp(user, resourceId);
        if (actions.length === 0) return [];

        const app = (provider ?? new Metadata()).Applications.find((a) => UUIDsEqual(a.ID, resourceId));
        return [this.buildNormalizedPermission({
            resourceType: 'Applications', resourceId, resourceName: app?.Name,
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        if (resourceType && resourceType !== 'Applications') return [];

        const md = provider ?? new Metadata();
        const results: NormalizedPermission[] = [];
        for (const app of md.Applications) {
            const actions = this.actionsForUserApp(user, app.ID);
            if (actions.length === 0) continue;
            results.push(this.buildNormalizedPermission({
                resourceType: 'Applications', resourceId: app.ID, resourceName: app.Name,
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        if (resourceType !== 'Applications') return [];

        const md = provider ?? new Metadata();
        const app = md.Applications.find((a) => UUIDsEqual(a.ID, resourceId));
        if (!app) return [];

        const appRoles = UserInfoEngine.Instance.ApplicationRoles.filter((ar) =>
            UUIDsEqual(ar.ApplicationID, resourceId)
        );

        // Open access: return a synthetic "Everyone" row so the Sharing Center
        // can visually distinguish unrestricted apps from explicitly-granted ones.
        if (appRoles.length === 0) {
            return [this.buildNormalizedPermission({
                resourceType: 'Applications', resourceId: app.ID, resourceName: app.Name,
                granteeType: 'Everyone', granteeId: null, granteeName: 'All authenticated users',
                actions: ['Read'],
            })];
        }

        const results: NormalizedPermission[] = [];
        for (const ar of appRoles) {
            const actions = this.boolsToActions({ Read: ar.CanAccess, Admin: ar.CanAdmin });
            if (actions.length === 0) continue;

            results.push(this.buildNormalizedPermission({
                resourceType: 'Applications', resourceId: app.ID, resourceName: app.Name,
                granteeType: 'Role', granteeId: ar.RoleID, granteeName: ar.Role, actions,
                sourceRecordId: ar.ID,
            }));
        }
        return results;
    }

    private actionsForUserApp(user: UserInfo, applicationId: string): PermissionAction[] {
        const appRoles = UserInfoEngine.Instance.ApplicationRoles.filter((ar) =>
            UUIDsEqual(ar.ApplicationID, applicationId)
        );

        // Open access semantics (Phase 1): no rows = every authenticated user has Read.
        if (appRoles.length === 0) return ['Read'];
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
        return this.boolsToActions({ Read: canAccess, Admin: canAdmin });
    }
}
