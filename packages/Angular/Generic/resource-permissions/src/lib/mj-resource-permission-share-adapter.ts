import { Metadata, RunView } from '@memberjunction/core';
import { MJResourcePermissionEntity, MJUserEntity } from '@memberjunction/core-entities';
import {
    ResourceShareAdapter,
    ResourceShareContext,
    ResourceShareLevel,
    ResourceSharePermissionModel
} from './resource-share-adapter';

/**
 * Generic share adapter for any resource whose permissions live in the
 * polymorphic `MJ: Resource Permissions` table (Conversations, Reports, Queries,
 * and anything else seeded in the `MJ: Resource Types` catalog). The entity's
 * `PermissionLevel` column is already a 3-value enum, so the mapping is trivial
 * — `Level` is set and read directly with no translation.
 *
 * Construct with the target `ResourceTypeID`:
 * ```ts
 * const adapter = new MJResourcePermissionShareAdapter(CONVERSATIONS_RESOURCE_TYPE_ID);
 * ```
 */
export class MJResourcePermissionShareAdapter implements ResourceShareAdapter {
    constructor(private readonly resourceTypeId: string) {}

    async LoadShares(context: ResourceShareContext): Promise<ResourceSharePermissionModel[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJResourcePermissionEntity>({
            EntityName: 'MJ: Resource Permissions',
            ExtraFilter:
                `ResourceTypeID='${this.resourceTypeId}' ` +
                `AND ResourceRecordID='${context.ResourceID}' ` +
                `AND Type='User' AND Status='Approved'`,
            ResultType: 'entity_object'
        });
        if (!result.Success) return [];

        const rows: ResourceSharePermissionModel[] = [];
        for (const perm of result.Results) {
            if (!perm.UserID) continue;
            const user = await this.loadUser(perm.UserID);
            if (!user) continue;
            rows.push({
                PermissionEntity: perm,
                UserID: perm.UserID,
                User: user,
                Level: (perm.PermissionLevel as ResourceShareLevel | null) ?? 'View',
                IsNew: false,
                MarkedForRemoval: false
            });
        }
        return rows;
    }

    async CreateShare(context: ResourceShareContext, user: MJUserEntity): Promise<ResourceSharePermissionModel> {
        const md = new Metadata();
        const perm = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions');
        perm.NewRecord();
        perm.ResourceTypeID = this.resourceTypeId;
        perm.ResourceRecordID = context.ResourceID;
        perm.Type = 'User';
        perm.UserID = user.ID;
        perm.PermissionLevel = 'View';
        perm.Status = 'Approved';
        if (context.CurrentUserID) {
            perm.SharedByUserID = context.CurrentUserID;
        }
        return {
            PermissionEntity: perm,
            UserID: user.ID,
            User: user,
            Level: 'View',
            IsNew: true,
            MarkedForRemoval: false
        };
    }

    SyncLevelToEntity(row: ResourceSharePermissionModel): void {
        const perm = row.PermissionEntity as MJResourcePermissionEntity;
        perm.PermissionLevel = row.Level;
    }

    private async loadUser(userId: string): Promise<MJUserEntity | null> {
        const md = new Metadata();
        const user = await md.GetEntityObject<MJUserEntity>('MJ: Users');
        const loaded = await user.Load(userId);
        return loaded ? user : null;
    }
}
