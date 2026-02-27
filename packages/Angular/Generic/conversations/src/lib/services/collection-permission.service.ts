import { Injectable } from '@angular/core';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { MJCollectionPermissionEntity } from '@memberjunction/core-entities';

export interface CollectionPermission {
    id: string;
    collectionId: string;
    userId: string;
    userName: string;
    canRead: boolean;
    canShare: boolean;
    canEdit: boolean;
    canDelete: boolean;
    sharedByUserId: string | null;
    sharedByUserName: string | null;
    sharedAt: Date;
}

export interface PermissionSet {
    canRead: boolean;
    canShare: boolean;
    canEdit: boolean;
    canDelete: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class CollectionPermissionService {

    /**
     * Load all permissions for a collection
     */
    async loadPermissions(collectionId: string, currentUser: UserInfo): Promise<CollectionPermission[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJCollectionPermissionEntity>({
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `CollectionID='${collectionId}'`,
            OrderBy: '__mj_CreatedAt ASC',
            ResultType: 'entity_object'
        }, currentUser);

        if (result.Success && result.Results) {
            return result.Results.map(p => this.mapToPermission(p));
        }
        return [];
    }

    /**
     * Check if user has permission for a collection
     */
    async checkPermission(
        collectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<CollectionPermission | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJCollectionPermissionEntity>({
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `CollectionID='${collectionId}' AND UserID='${userId}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        }, currentUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return this.mapToPermission(result.Results[0]);
        }
        return null;
    }

    /**
     * Check permissions for multiple collections at once (efficient bulk loading)
     */
    async checkBulkPermissions(
        collectionIds: string[],
        userId: string,
        currentUser: UserInfo
    ): Promise<Map<string, CollectionPermission>> {
        const resultMap = new Map<string, CollectionPermission>();

        if (collectionIds.length === 0) {
            return resultMap;
        }

        // Build filter for all collection IDs
        const collectionFilter = collectionIds.map(id => `CollectionID='${id}'`).join(' OR ');
        const rv = new RunView();
        const result = await rv.RunView<MJCollectionPermissionEntity>({
            EntityName: 'MJ: Collection Permissions',
            ExtraFilter: `(${collectionFilter}) AND UserID='${userId}'`,
            ResultType: 'entity_object'
        }, currentUser);

        if (result.Success && result.Results) {
            for (const entity of result.Results) {
                const permission = this.mapToPermission(entity);
                resultMap.set(entity.CollectionID, permission);
            }
        }

        return resultMap;
    }

    /**
     * Grant permission to a user
     */
    async grantPermission(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<MJCollectionPermissionEntity> {
        const md = new Metadata();
        const permission = await md.GetEntityObject<MJCollectionPermissionEntity>(
            'MJ: Collection Permissions',
            currentUser
        );

        permission.CollectionID = collectionId;
        permission.UserID = userId;
        permission.CanRead = permissions.canRead;
        permission.CanShare = permissions.canShare;
        permission.CanEdit = permissions.canEdit;
        permission.CanDelete = permissions.canDelete;
        permission.SharedByUserID = sharedByUserId;

        const saved = await permission.Save();
        if (!saved) {
            throw new Error(permission.LatestResult?.Message || 'Failed to grant permission');
        }

        return permission;
    }

    /**
     * Grant permission and cascade to all child collections
     */
    async grantPermissionCascade(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<void> {
        // Grant permission on current collection
        await this.grantPermission(collectionId, userId, permissions, sharedByUserId, currentUser);

        // Grant permissions on all child collections recursively
        await this.grantChildPermissions(collectionId, userId, permissions, sharedByUserId, currentUser);
    }

    /**
     * Recursively grant permissions on all child collections
     */
    private async grantChildPermissions(
        parentCollectionId: string,
        userId: string,
        permissions: PermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<void> {
        const rv = new RunView();
        const childrenResult = await rv.RunView({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ParentID='${parentCollectionId}'`,
            ResultType: 'entity_object'
        }, currentUser);

        if (childrenResult.Success && childrenResult.Results) {
            for (const child of childrenResult.Results) {
                // Check if permission already exists
                const existing = await this.checkPermission(child.ID, userId, currentUser);

                if (existing) {
                    // Permission exists, update it instead
                    await this.updatePermission(existing.id, permissions, currentUser);
                } else {
                    // Grant new permission
                    await this.grantPermission(child.ID, userId, permissions, sharedByUserId, currentUser);
                }

                // Recursively grant to grandchildren
                await this.grantChildPermissions(child.ID, userId, permissions, sharedByUserId, currentUser);
            }
        }
    }

    /**
     * Update existing permission
     */
    async updatePermission(
        permissionId: string,
        permissions: PermissionSet,
        currentUser: UserInfo
    ): Promise<boolean> {
        const md = new Metadata();
        const permission = await md.GetEntityObject<MJCollectionPermissionEntity>(
            'MJ: Collection Permissions',
            currentUser
        );

        await permission.Load(permissionId);
        permission.CanRead = permissions.canRead;
        permission.CanShare = permissions.canShare;
        permission.CanEdit = permissions.canEdit;
        permission.CanDelete = permissions.canDelete;

        return await permission.Save();
    }

    /**
     * Update permission and cascade to all child collections
     */
    async updatePermissionCascade(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        currentUser: UserInfo
    ): Promise<void> {
        // Update permission on current collection
        const permission = await this.checkPermission(collectionId, userId, currentUser);
        if (permission) {
            await this.updatePermission(permission.id, permissions, currentUser);
        }

        // Get all child collections and update recursively
        await this.updateChildPermissions(collectionId, userId, permissions, currentUser);
    }

    /**
     * Recursively update permissions on all child collections
     */
    private async updateChildPermissions(
        parentCollectionId: string,
        userId: string,
        permissions: PermissionSet,
        currentUser: UserInfo
    ): Promise<void> {
        const rv = new RunView();
        const childrenResult = await rv.RunView({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ParentID='${parentCollectionId}'`,
            ResultType: 'entity_object'
        }, currentUser);

        if (childrenResult.Success && childrenResult.Results) {
            for (const child of childrenResult.Results) {
                // Update permission if it exists for this user on the child collection
                const childPermission = await this.checkPermission(child.ID, userId, currentUser);
                if (childPermission) {
                    await this.updatePermission(childPermission.id, permissions, currentUser);
                }

                // Recursively update grandchildren
                await this.updateChildPermissions(child.ID, userId, permissions, currentUser);
            }
        }
    }

    /**
     * Revoke permission
     */
    async revokePermission(permissionId: string, currentUser: UserInfo): Promise<boolean> {
        const md = new Metadata();
        const permission = await md.GetEntityObject<MJCollectionPermissionEntity>(
            'MJ: Collection Permissions',
            currentUser
        );

        await permission.Load(permissionId);
        return await permission.Delete();
    }

    /**
     * Revoke permission and cascade to all child collections
     */
    async revokePermissionCascade(
        collectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<void> {
        // Revoke permission on current collection
        const permission = await this.checkPermission(collectionId, userId, currentUser);
        if (permission) {
            await this.revokePermission(permission.id, currentUser);
        }

        // Revoke permissions on all child collections recursively
        await this.revokeChildPermissions(collectionId, userId, currentUser);
    }

    /**
     * Recursively revoke permissions on all child collections
     */
    private async revokeChildPermissions(
        parentCollectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<void> {
        const rv = new RunView();
        const childrenResult = await rv.RunView({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ParentID='${parentCollectionId}'`,
            ResultType: 'entity_object'
        }, currentUser);

        if (childrenResult.Success && childrenResult.Results) {
            for (const child of childrenResult.Results) {
                // Revoke permission if it exists for this user on the child collection
                const childPermission = await this.checkPermission(child.ID, userId, currentUser);
                if (childPermission) {
                    await this.revokePermission(childPermission.id, currentUser);
                }

                // Recursively revoke from grandchildren
                await this.revokeChildPermissions(child.ID, userId, currentUser);
            }
        }
    }

    /**
     * Validate that requested permissions don't exceed granter's permissions
     */
    validatePermissions(
        requested: PermissionSet,
        granter: PermissionSet,
        isOwner: boolean
    ): boolean {
        if (isOwner) return true; // Owner can grant anything

        // Can't grant permissions you don't have
        if (requested.canShare && !granter.canShare) return false;
        if (requested.canEdit && !granter.canEdit) return false;
        if (requested.canDelete && !granter.canDelete) return false;

        return true;
    }

    /**
     * Get available permissions for a user to grant based on their own permissions
     */
    getAvailablePermissions(userPermissions: PermissionSet, isOwner: boolean): string[] {
        if (isOwner) {
            return ['Read', 'Share', 'Edit', 'Delete'];
        }

        const available = ['Read']; // Always have read
        if (userPermissions.canShare) available.push('Share');
        if (userPermissions.canEdit) available.push('Edit');
        if (userPermissions.canDelete) available.push('Delete');

        return available;
    }

    /**
     * Copy all permissions from parent collection to child collection
     */
    async copyParentPermissions(
        parentCollectionId: string,
        childCollectionId: string,
        currentUser: UserInfo
    ): Promise<void> {
        const parentPermissions = await this.loadPermissions(parentCollectionId, currentUser);

        for (const perm of parentPermissions) {
            // Check if permission already exists for this user on the child collection
            const existing = await this.checkPermission(childCollectionId, perm.userId, currentUser);

            if (existing) {
                // Permission already exists (e.g., owner permission), skip to avoid duplicate
                console.log(`Skipping duplicate permission for user ${perm.userId} on collection ${childCollectionId}`);
                continue;
            }

            await this.grantPermission(
                childCollectionId,
                perm.userId,
                {
                    canRead: perm.canRead,
                    canShare: perm.canShare,
                    canEdit: perm.canEdit,
                    canDelete: perm.canDelete
                },
                perm.sharedByUserId || currentUser.ID,
                currentUser
            );
        }
    }

    /**
     * Delete all permissions for a collection
     */
    async deleteAllPermissions(collectionId: string, currentUser: UserInfo): Promise<void> {
        const permissions = await this.loadPermissions(collectionId, currentUser);

        for (const perm of permissions) {
            await this.revokePermission(perm.id, currentUser);
        }
    }

    /**
     * Create owner permission record (all permissions enabled)
     */
    async createOwnerPermission(
        collectionId: string,
        ownerId: string,
        currentUser: UserInfo
    ): Promise<void> {
        await this.grantPermission(
            collectionId,
            ownerId,
            {
                canRead: true,
                canShare: true,
                canEdit: true,
                canDelete: true
            },
            ownerId, // Owner grants to themselves
            currentUser
        );
    }

    private mapToPermission(entity: MJCollectionPermissionEntity): CollectionPermission {
        return {
            id: entity.ID,
            collectionId: entity.CollectionID,
            userId: entity.UserID,
            userName: entity.User || '',
            canRead: entity.CanRead,
            canShare: entity.CanShare,
            canEdit: entity.CanEdit,
            canDelete: entity.CanDelete,
            sharedByUserId: entity.SharedByUserID || null,
            sharedByUserName: entity.SharedByUser || null,
            sharedAt: entity.__mj_CreatedAt
        };
    }
}
