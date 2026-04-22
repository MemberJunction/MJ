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

import { ResourcePermissionEngine } from '../ResourcePermissions/ResourcePermissionEngine';

/**
 * Wraps {@link ResourcePermissionEngine.GetUserResourcePermissionLevel} behind the
 * unified {@link PermissionProviderBase} contract.
 *
 * Resource permissions support both Users and Roles as grantees and use a hierarchical
 * level model (View < Edit < Owner). The provider translates those levels into canonical
 * action sets: View → [Read], Edit → [Read, Update], Owner → [Read, Update, Delete, Share, Admin].
 *
 * `resourceType` is the human-readable name from the `MJ: Resource Types` entity
 * (e.g., `"User Views"`, `"Reports"`). `resourceId` is the target record ID.
 */
@RegisterClass(PermissionProviderBase, 'MJResourcePermissionProvider')
export class ResourcePermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'Resource Permissions';
    readonly Description =
        'Generic resource sharing with User or Role grantees, hierarchical View/Edit/Owner levels, and status workflow';
    readonly SupportedGranteeTypes: GranteeType[] = ['User', 'Role'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Update', 'Delete', 'Share', 'Admin'];
    readonly SupportsDeny = false;

    async CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        if (!resourceId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: 'Resource permissions require a specific resource ID',
            };
        }
        const resourceTypeId = this.resolveResourceTypeId(resourceType);
        if (!resourceTypeId) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: `Unknown resource type '${resourceType}'`,
            };
        }

        const level = ResourcePermissionEngine.Instance.GetUserResourcePermissionLevel(resourceTypeId, resourceId, user);
        const actions = this.actionsForLevel(level);
        const allowed = actions.includes(action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: level
                ? `User has ${level} level permission${allowed ? '' : ` (insufficient for ${action})`}`
                : `No resource permission found for user on '${resourceType}'/'${resourceId}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const resourceTypeId = this.resolveResourceTypeId(resourceType);
        if (!resourceTypeId) return [];

        const level = ResourcePermissionEngine.Instance.GetUserResourcePermissionLevel(resourceTypeId, resourceId, user);
        const actions = this.actionsForLevel(level);
        if (actions.length === 0) return [];

        return [
            {
                DomainName: this.DomainName,
                ResourceType: resourceType,
                ResourceID: resourceId,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
            },
        ];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        const engine = ResourcePermissionEngine.Instance;

        let resourceTypeId: string | undefined;
        if (resourceType) {
            resourceTypeId = this.resolveResourceTypeId(resourceType) ?? undefined;
            if (!resourceTypeId) return [];
        }

        const userPerms = engine.GetUserAvailableResources(user, resourceTypeId);
        const results: NormalizedPermission[] = [];
        for (const p of userPerms) {
            const actions = this.actionsForLevel(p.PermissionLevel);
            if (actions.length === 0) continue;
            const rt = engine.ResourceTypes.find((r) => UUIDsEqual(r.ID, p.ResourceTypeID));
            results.push({
                DomainName: this.DomainName,
                ResourceType: rt?.Name ?? p.ResourceTypeID,
                ResourceID: p.ResourceRecordID,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: p.ID,
                ExpiresAt: p.EndSharingAt ?? undefined,
            });
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]> {
        const resourceTypeId = this.resolveResourceTypeId(resourceType);
        if (!resourceTypeId) return [];

        const engine = ResourcePermissionEngine.Instance;
        const md = new Metadata();
        const rows = engine.GetResourcePermissions(resourceTypeId, resourceId);
        const results: NormalizedPermission[] = [];
        for (const p of rows) {
            const actions = this.actionsForLevel(p.PermissionLevel);
            if (actions.length === 0) continue;

            const isUser = p.Type === 'User';
            const granteeId = isUser ? p.UserID : p.RoleID;
            let granteeName: string | undefined;
            if (isUser) {
                granteeName = undefined; // UserID → name requires user cache lookup; leave blank, UI can hydrate
            } else if (p.RoleID) {
                granteeName = md.Roles.find((r) => UUIDsEqual(r.ID, p.RoleID))?.Name;
            }

            results.push({
                DomainName: this.DomainName,
                ResourceType: resourceType,
                ResourceID: resourceId,
                GranteeType: isUser ? 'User' : 'Role',
                GranteeID: granteeId,
                GranteeName: granteeName,
                Actions: actions,
                Effect: 'Allow',
                SourceRecordID: p.ID,
                ExpiresAt: p.EndSharingAt ?? undefined,
            });
        }
        return results;
    }

    private resolveResourceTypeId(resourceTypeName: string): string | null {
        const rt = ResourcePermissionEngine.Instance.ResourceTypes?.find(
            (t) => t.Name.toLowerCase() === resourceTypeName.toLowerCase()
        );
        return rt?.ID ?? null;
    }

    private actionsForLevel(level: 'View' | 'Edit' | 'Owner' | null): PermissionAction[] {
        switch (level) {
            case 'Owner':
                return ['Read', 'Update', 'Delete', 'Share', 'Admin'];
            case 'Edit':
                return ['Read', 'Update'];
            case 'View':
                return ['Read'];
            default:
                return [];
        }
    }
}
