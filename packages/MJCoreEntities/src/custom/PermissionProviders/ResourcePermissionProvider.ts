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

    override GetResourceTypes(): string[] {
        // Live list from the MJ: Resource Types catalog. Sorted for stable UI output.
        return ResourcePermissionEngine.Instance.ResourceTypes
            .map((rt) => rt.Name)
            .filter((name): name is string => !!name)
            .sort((a, b) => a.localeCompare(b));
    }

    async CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction,
        _provider?: IMetadataProvider
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

    async GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string, _provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        const resourceTypeId = this.resolveResourceTypeId(resourceType);
        if (!resourceTypeId) return [];

        const level = ResourcePermissionEngine.Instance.GetUserResourcePermissionLevel(resourceTypeId, resourceId, user);
        const actions = this.actionsForLevel(level);
        if (actions.length === 0) return [];

        return [this.buildNormalizedPermission({
            resourceType, resourceId,
            granteeType: 'User', granteeId: user.ID, granteeName: user.Name, actions,
        })];
    }

    async GetUserResources(user: UserInfo, resourceType?: string, _provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
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
            results.push(this.buildNormalizedPermission({
                resourceType: rt?.Name ?? p.ResourceTypeID,
                resourceId: p.ResourceRecordID,
                granteeType: 'User', granteeId: user.ID, granteeName: user.Name,
                actions,
                sourceRecordId: p.ID,
                expiresAt: p.EndSharingAt ?? undefined,
            }));
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        const resourceTypeId = this.resolveResourceTypeId(resourceType);
        if (!resourceTypeId) return [];

        const engine = ResourcePermissionEngine.Instance;
        const md = provider ?? new Metadata();
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

            results.push(this.buildNormalizedPermission({
                resourceType, resourceId,
                granteeType: isUser ? 'User' : 'Role',
                granteeId, granteeName, actions,
                sourceRecordId: p.ID,
                expiresAt: p.EndSharingAt ?? undefined,
            }));
        }
        return results;
    }

    /**
     * Rows granted directly by this user to *other* users. Uses the
     * `SharedByUserID` column (added in migration
     * `V202604231235__v5.29.x__ResourcePermission_SharedByUserID.sql`) so every
     * resource type that writes through `MJ: Resource Permissions` surfaces
     * correctly in the end-user Sharing Center's "Shared by me" tab.
     *
     * Only Approved, User-grantee rows are returned — pending requests
     * (`Status === 'Requested'`) and Role grants don't belong in a personal
     * sharing view.
     */
    override async GetPermissionsGrantedByUser(grantor: UserInfo): Promise<NormalizedPermission[]> {
        const engine = ResourcePermissionEngine.Instance;
        const results: NormalizedPermission[] = [];
        for (const p of engine.Permissions ?? []) {
            if (!p.SharedByUserID || !UUIDsEqual(p.SharedByUserID, grantor.ID)) continue;
            if (p.Type !== 'User' || !p.UserID) continue;
            if (p.Status !== 'Approved') continue;
            if (UUIDsEqual(p.UserID, grantor.ID)) continue;

            const actions = this.actionsForLevel(p.PermissionLevel);
            if (actions.length === 0) continue;
            const rt = engine.ResourceTypes.find((r) => UUIDsEqual(r.ID, p.ResourceTypeID));
            results.push(this.buildNormalizedPermission({
                resourceType: rt?.Name ?? p.ResourceTypeID,
                resourceId: p.ResourceRecordID,
                granteeType: 'User', granteeId: p.UserID, granteeName: p.User ?? undefined,
                actions,
                sourceRecordId: p.ID,
                expiresAt: p.EndSharingAt ?? undefined,
            }));
        }
        return results;
    }

    /**
     * Rows where this user is the direct grantee AND someone else is the grantor —
     * the inverse of {@link GetPermissionsGrantedByUser}. Powers the Sharing
     * Center's "Shared with me" tab for every resource type that writes through
     * `MJ: Resource Permissions` (Conversations, Reports, User Views, etc.).
     *
     * Only Approved, User-grantee rows are returned. Role-inherited access is
     * intentionally excluded — a personal "Shared with me" view shouldn't surface
     * org-wide role grants. Self-grants (user shared a resource with themselves)
     * are also filtered out.
     */
    override async GetPermissionsSharedWithUser(grantee: UserInfo): Promise<NormalizedPermission[]> {
        const engine = ResourcePermissionEngine.Instance;
        const results: NormalizedPermission[] = [];
        for (const p of engine.Permissions ?? []) {
            if (p.Type !== 'User' || !p.UserID) continue;
            if (!UUIDsEqual(p.UserID, grantee.ID)) continue;
            if (p.Status !== 'Approved') continue;
            if (!p.SharedByUserID || UUIDsEqual(p.SharedByUserID, grantee.ID)) continue;

            const actions = this.actionsForLevel(p.PermissionLevel);
            if (actions.length === 0) continue;
            const rt = engine.ResourceTypes.find((r) => UUIDsEqual(r.ID, p.ResourceTypeID));
            results.push(this.buildNormalizedPermission({
                resourceType: rt?.Name ?? p.ResourceTypeID,
                resourceId: p.ResourceRecordID,
                granteeType: 'User', granteeId: p.UserID, granteeName: p.User ?? undefined,
                actions,
                sourceRecordId: p.ID,
                expiresAt: p.EndSharingAt ?? undefined,
            }));
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
