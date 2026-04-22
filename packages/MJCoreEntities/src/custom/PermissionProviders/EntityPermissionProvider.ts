import {
    EntityPermissionInfo,
    EntityUserPermissionInfo,
    GranteeType,
    Metadata,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    PermissionProviderBase,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

/**
 * Wraps the {@link Metadata} + `EntityInfo.GetUserPermisions()` path behind the
 * unified {@link PermissionProviderBase} contract. Entity permissions are role-only,
 * additive (OR across roles), and cover the CRUD action set only.
 *
 * `resourceType` is the entity name (e.g., `"Users"`).
 * `resourceId` is unused — entity permissions are domain-wide per entity, not per-row.
 * Row-level filters are a separate concern handled by the RLS system.
 */
@RegisterClass(PermissionProviderBase, 'MJEntityPermissionProvider')
export class EntityPermissionProvider extends PermissionProviderBase {
    readonly DomainName = 'Entity Permissions';
    readonly Description = 'CRUD permissions on MJ entities, role-based with optional row-level security filters and explicit Allow/Deny rows';
    readonly SupportedGranteeTypes: GranteeType[] = ['Role'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Create', 'Update', 'Delete'];
    readonly SupportsDeny = true;

    async CheckPermission(
        user: UserInfo,
        resourceType: string,
        _resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult> {
        const md = new Metadata();
        const entity = md.EntityByName(resourceType);
        if (!entity) {
            return {
                Allowed: false,
                DomainName: this.DomainName,
                Reason: `Entity '${resourceType}' not found in metadata`,
            };
        }

        const perms = entity.GetUserPermisions(user);
        const allowed = this.checkActionOnPermission(perms, action);
        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed
                ? `Role grants ${action} on entity '${resourceType}'`
                : `No role grants ${action} on entity '${resourceType}'`,
        };
    }

    async GetEffectivePermissions(user: UserInfo, resourceType: string, _resourceId: string): Promise<NormalizedPermission[]> {
        const md = new Metadata();
        const entity = md.EntityByName(resourceType);
        if (!entity) return [];

        const perms = entity.GetUserPermisions(user);
        const actions = this.resolveActions(perms);
        if (actions.length === 0) return [];

        return [
            {
                DomainName: this.DomainName,
                ResourceType: resourceType,
                ResourceID: null,
                ResourceName: resourceType,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
            },
        ];
    }

    async GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]> {
        const md = new Metadata();
        const entities = resourceType
            ? md.Entities.filter((e) => e.Name === resourceType)
            : md.Entities;

        const results: NormalizedPermission[] = [];
        for (const entity of entities) {
            const perms = entity.GetUserPermisions(user);
            const actions = this.resolveActions(perms);
            if (actions.length === 0) continue;

            results.push({
                DomainName: this.DomainName,
                ResourceType: entity.Name,
                ResourceID: null,
                ResourceName: entity.Name,
                GranteeType: 'User',
                GranteeID: user.ID,
                GranteeName: user.Name,
                Actions: actions,
                Effect: 'Allow',
            });
        }
        return results;
    }

    async GetResourcePermissions(resourceType: string, _resourceId: string): Promise<NormalizedPermission[]> {
        const md = new Metadata();
        const entity = md.EntityByName(resourceType);
        if (!entity) return [];

        const results: NormalizedPermission[] = [];
        for (const ep of entity.Permissions) {
            const actions = this.resolveActions(ep);
            if (actions.length === 0) continue;

            const role = md.Roles.find((r) => UUIDsEqual(r.ID, ep.RoleID));
            const isDeny = (ep.Type || 'Allow').trim().toLowerCase() === 'deny';
            results.push({
                DomainName: this.DomainName,
                ResourceType: resourceType,
                ResourceID: null,
                ResourceName: resourceType,
                GranteeType: 'Role',
                GranteeID: ep.RoleID,
                GranteeName: role?.Name ?? ep.RoleID,
                Actions: actions,
                Effect: isDeny ? 'Deny' : 'Allow',
                SourceRecordID: ep.ID,
            });
        }
        return results;
    }

    private checkActionOnPermission(
        perms: EntityUserPermissionInfo | EntityPermissionInfo,
        action: PermissionAction
    ): boolean {
        switch (action) {
            case 'Read':
                return perms.CanRead;
            case 'Create':
                return perms.CanCreate;
            case 'Update':
                return perms.CanUpdate;
            case 'Delete':
                return perms.CanDelete;
            default:
                return false;
        }
    }

    private resolveActions(perms: EntityUserPermissionInfo | EntityPermissionInfo): PermissionAction[] {
        const actions: PermissionAction[] = [];
        if (perms.CanRead) actions.push('Read');
        if (perms.CanCreate) actions.push('Create');
        if (perms.CanUpdate) actions.push('Update');
        if (perms.CanDelete) actions.push('Delete');
        return actions;
    }
}
