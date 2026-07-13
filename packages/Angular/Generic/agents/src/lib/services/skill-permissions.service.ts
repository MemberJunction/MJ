import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RoleInfo, RunView } from '@memberjunction/core';
import { MJAISkillPermissionEntity, MJAISkillEntity, MJUserEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Enriched permission row for display in the skill permissions panel.
 * Includes resolved names and computed effective permissions.
 */
export interface SkillPermissionRow {
    ID: string;
    SkillID: string;
    UserID: string | null;
    RoleID: string | null;
    GrantedToName: string;
    GrantType: 'user' | 'role';
    CanView: boolean;
    CanRun: boolean;
    CanEdit: boolean;
    CanDelete: boolean;
    EffectiveCanView: boolean;
    EffectiveCanRun: boolean;
    EffectiveCanEdit: boolean;
    EffectiveCanDelete: boolean;
    Comments: string | null;
    /** The underlying entity object for save/delete operations */
    Entity: MJAISkillPermissionEntity;
}

/**
 * Service for loading and managing AI Skill permission data.
 * Decoupled from UI components so it can be reused across
 * panel, dialog, and slideover variants.
 *
 * Multi-provider note: callers under a non-default provider should set
 * `service.Provider = component.ProviderToUse` before invoking any methods.
 */
@Injectable()
export class SkillPermissionsService {
    private users: MJUserEntity[] = [];
    private roles: RoleInfo[] = [];
    private permissions: MJAISkillPermissionEntity[] = [];

    public get Users(): MJUserEntity[] { return this.users; }
    public get Roles(): RoleInfo[] { return this.roles; }
    public get Permissions(): MJAISkillPermissionEntity[] { return this.permissions; }

    private _provider: IMetadataProvider | null = null;

    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    /**
     * Load all data needed for the permissions panel.
     * Fetches permissions, users, and roles in parallel.
     */
    public async LoadAll(skillId: string): Promise<SkillPermissionRow[]> {
        const [perms] = await Promise.all([
            this.loadPermissions(skillId),
            this.loadUsers(),
            this.loadRoles()
        ]);
        this.permissions = perms;
        return this.buildRows();
    }

    /**
     * Reload just the permissions for the given skill.
     */
    public async RefreshPermissions(skillId: string): Promise<SkillPermissionRow[]> {
        this.permissions = await this.loadPermissions(skillId);
        return this.buildRows();
    }

    /**
     * Save a new or existing permission record.
     */
    public async SavePermission(
        skill: MJAISkillEntity,
        grantType: 'user' | 'role',
        granteeId: string,
        canView: boolean,
        canRun: boolean,
        canEdit: boolean,
        canDelete: boolean,
        comments: string | null,
        existingEntity?: MJAISkillPermissionEntity
    ): Promise<boolean> {
        const md = this.Provider;
        const entity = existingEntity ||
            await md.GetEntityObject<MJAISkillPermissionEntity>('MJ: AI Skill Permissions', md.CurrentUser);

        entity.SkillID = skill.ID;
        entity.UserID = grantType === 'user' ? granteeId : null;
        entity.RoleID = grantType === 'role' ? granteeId : null;
        entity.CanView = canView;
        entity.CanRun = canRun;
        entity.CanEdit = canEdit;
        entity.CanDelete = canDelete;
        entity.Comments = comments;

        return entity.Save();
    }

    /**
     * Delete a permission record.
     */
    public async DeletePermission(entity: MJAISkillPermissionEntity): Promise<boolean> {
        return entity.Delete();
    }

    /**
     * Resolve the owner name for a given user ID.
     */
    public async ResolveOwnerName(ownerUserId: string | null): Promise<string> {
        if (!ownerUserId) return 'Not Set';
        const cached = this.users.find(u => UUIDsEqual(u.ID, ownerUserId));
        if (cached) return cached.Name;
        const md = this.Provider;
        const userEntity = await md.GetEntityObject<MJUserEntity>('MJ: Users', md.CurrentUser);
        const loaded = await userEntity.Load(ownerUserId);
        return loaded ? userEntity.Name : 'Unknown';
    }

    private async loadPermissions(skillId: string): Promise<MJAISkillPermissionEntity[]> {
        const rv = RunView.FromMetadataProvider(this.Provider);
        const result = await rv.RunView<MJAISkillPermissionEntity>({
            EntityName: 'MJ: AI Skill Permissions',
            ExtraFilter: `SkillID='${skillId}'`,
            ResultType: 'entity_object'
        });
        return result.Success ? (result.Results || []) : [];
    }

    private async loadUsers(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.Provider);
        const result = await rv.RunView<MJUserEntity>({
            EntityName: 'MJ: Users',
            ExtraFilter: 'IsActive=1',
            OrderBy: 'Name',
            ResultType: 'entity_object'
        });
        if (result.Success && result.Results) {
            this.users = result.Results;
        }
    }

    private async loadRoles(): Promise<void> {
        const md = this.Provider;
        this.roles = md.Roles;
    }

    private buildRows(): SkillPermissionRow[] {
        return this.permissions.map(p => {
            const grantType: 'user' | 'role' = p.UserID ? 'user' : 'role';
            const grantedToName = p.UserID
                ? this.users.find(u => UUIDsEqual(u.ID, p.UserID))?.Name || 'Unknown User'
                : this.roles.find(r => UUIDsEqual(r.ID, p.RoleID))?.Name || 'Unknown Role';

            const effectiveCanDelete = p.CanDelete || false;
            const effectiveCanEdit = effectiveCanDelete || (p.CanEdit || false);
            const effectiveCanRun = effectiveCanEdit || (p.CanRun || false);
            const effectiveCanView = effectiveCanRun || (p.CanView || false);

            return {
                ID: p.ID,
                SkillID: p.SkillID,
                UserID: p.UserID,
                RoleID: p.RoleID,
                GrantedToName: grantedToName,
                GrantType: grantType,
                CanView: p.CanView || false,
                CanRun: p.CanRun || false,
                CanEdit: p.CanEdit || false,
                CanDelete: p.CanDelete || false,
                EffectiveCanView: effectiveCanView,
                EffectiveCanRun: effectiveCanRun,
                EffectiveCanEdit: effectiveCanEdit,
                EffectiveCanDelete: effectiveCanDelete,
                Comments: p.Comments || null,
                Entity: p
            };
        });
    }
}
