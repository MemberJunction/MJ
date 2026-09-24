import { Injectable } from '@angular/core';
import { UserInfo, RunView, Metadata, IMetadataProvider } from '@memberjunction/core';
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
    private _provider: IMetadataProvider | null = null;

    /**
     * Set the metadata provider this service should use. When unset, falls back to Metadata.Provider.
     */
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Load all permissions for a collection
     */
    async LoadPermissions(collectionId: string, currentUser: UserInfo): Promise<CollectionPermission[]> {
        const rv = RunView.FromMetadataProvider(this.Provider);
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

    /** @deprecated Use {@link LoadPermissions}. */
    async loadPermissions(collectionId: string, currentUser: UserInfo): Promise<CollectionPermission[]> {
        return this.LoadPermissions(collectionId, currentUser);
    }

    /**
     * Check if user has permission for a collection
     */
    async CheckPermission(
        collectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<CollectionPermission | null> {
        const rv = RunView.FromMetadataProvider(this.Provider);
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

    /** @deprecated Use {@link CheckPermission}. */
    async checkPermission(
        collectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<CollectionPermission | null> {
        return this.CheckPermission(collectionId, userId, currentUser);
    }

    /**
     * Check permissions for multiple collections at once (efficient bulk loading)
     */
    async CheckBulkPermissions(
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
        const rv = RunView.FromMetadataProvider(this.Provider);
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

    /** @deprecated Use {@link CheckBulkPermissions}. */
    async checkBulkPermissions(
        collectionIds: string[],
        userId: string,
        currentUser: UserInfo
    ): Promise<Map<string, CollectionPermission>> {
        return this.CheckBulkPermissions(collectionIds, userId, currentUser);
    }

    /**
     * Grant permission to a user
     */
    async GrantPermission(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<MJCollectionPermissionEntity> {
        const md = this.Provider;
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
            throw new Error(permission.LatestResult?.CompleteMessage || 'Failed to grant permission');
        }

        return permission;
    }

    /** @deprecated Use {@link GrantPermission}. */
    async grantPermission(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<MJCollectionPermissionEntity> {
        return this.GrantPermission(collectionId, userId, permissions, sharedByUserId, currentUser);
    }

    /**
     * Grant permission and cascade to all child collections
     */
    async GrantPermissionCascade(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<void> {
        // Grant permission on current collection
        await this.GrantPermission(collectionId, userId, permissions, sharedByUserId, currentUser);

        // Grant permissions on all child collections recursively
        await this.grantChildPermissions(collectionId, userId, permissions, sharedByUserId, currentUser);
    }

    /** @deprecated Use {@link GrantPermissionCascade}. */
    async grantPermissionCascade(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<void> {
        return this.GrantPermissionCascade(collectionId, userId, permissions, sharedByUserId, currentUser);
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
        const rv = RunView.FromMetadataProvider(this.Provider);
        const childrenResult = await rv.RunView({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ParentID='${parentCollectionId}'`,
            ResultType: 'entity_object'
        }, currentUser);

        if (childrenResult.Success && childrenResult.Results) {
            for (const child of childrenResult.Results) {
                // Check if permission already exists
                const existing = await this.CheckPermission(child.ID, userId, currentUser);

                if (existing) {
                    // Permission exists, update it instead
                    await this.UpdatePermission(existing.id, permissions, currentUser);
                } else {
                    // Grant new permission
                    await this.GrantPermission(child.ID, userId, permissions, sharedByUserId, currentUser);
                }

                // Recursively grant to grandchildren
                await this.grantChildPermissions(child.ID, userId, permissions, sharedByUserId, currentUser);
            }
        }
    }

    /**
     * Update existing permission
     */
    async UpdatePermission(
        permissionId: string,
        permissions: PermissionSet,
        currentUser: UserInfo
    ): Promise<boolean> {
        const md = this.Provider;
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

    /** @deprecated Use {@link UpdatePermission}. */
    async updatePermission(
        permissionId: string,
        permissions: PermissionSet,
        currentUser: UserInfo
    ): Promise<boolean> {
        return this.UpdatePermission(permissionId, permissions, currentUser);
    }

    /**
     * Update permission and cascade to all child collections
     */
    async UpdatePermissionCascade(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        currentUser: UserInfo
    ): Promise<void> {
        // Update permission on current collection
        const permission = await this.CheckPermission(collectionId, userId, currentUser);
        if (permission) {
            await this.UpdatePermission(permission.id, permissions, currentUser);
        }

        // Get all child collections and update recursively
        await this.updateChildPermissions(collectionId, userId, permissions, currentUser);
    }

    /** @deprecated Use {@link UpdatePermissionCascade}. */
    async updatePermissionCascade(
        collectionId: string,
        userId: string,
        permissions: PermissionSet,
        currentUser: UserInfo
    ): Promise<void> {
        return this.UpdatePermissionCascade(collectionId, userId, permissions, currentUser);
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
        const rv = RunView.FromMetadataProvider(this.Provider);
        const childrenResult = await rv.RunView({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ParentID='${parentCollectionId}'`,
            ResultType: 'entity_object'
        }, currentUser);

        if (childrenResult.Success && childrenResult.Results) {
            for (const child of childrenResult.Results) {
                // Update permission if it exists for this user on the child collection
                const childPermission = await this.CheckPermission(child.ID, userId, currentUser);
                if (childPermission) {
                    await this.UpdatePermission(childPermission.id, permissions, currentUser);
                }

                // Recursively update grandchildren
                await this.updateChildPermissions(child.ID, userId, permissions, currentUser);
            }
        }
    }

    /**
     * Revoke permission
     */
    async RevokePermission(permissionId: string, currentUser: UserInfo): Promise<boolean> {
        const md = this.Provider;
        const permission = await md.GetEntityObject<MJCollectionPermissionEntity>(
            'MJ: Collection Permissions',
            currentUser
        );

        await permission.Load(permissionId);
        return await permission.Delete();
    }

    /** @deprecated Use {@link RevokePermission}. */
    async revokePermission(permissionId: string, currentUser: UserInfo): Promise<boolean> {
        return this.RevokePermission(permissionId, currentUser);
    }

    /**
     * Revoke permission and cascade to all child collections
     */
    async RevokePermissionCascade(
        collectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<void> {
        // Revoke permission on current collection
        const permission = await this.CheckPermission(collectionId, userId, currentUser);
        if (permission) {
            await this.RevokePermission(permission.id, currentUser);
        }

        // Revoke permissions on all child collections recursively
        await this.revokeChildPermissions(collectionId, userId, currentUser);
    }

    /** @deprecated Use {@link RevokePermissionCascade}. */
    async revokePermissionCascade(
        collectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<void> {
        return this.RevokePermissionCascade(collectionId, userId, currentUser);
    }

    /**
     * Recursively revoke permissions on all child collections
     */
    private async revokeChildPermissions(
        parentCollectionId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.Provider);
        const childrenResult = await rv.RunView({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ParentID='${parentCollectionId}'`,
            ResultType: 'entity_object'
        }, currentUser);

        if (childrenResult.Success && childrenResult.Results) {
            for (const child of childrenResult.Results) {
                // Revoke permission if it exists for this user on the child collection
                const childPermission = await this.CheckPermission(child.ID, userId, currentUser);
                if (childPermission) {
                    await this.RevokePermission(childPermission.id, currentUser);
                }

                // Recursively revoke from grandchildren
                await this.revokeChildPermissions(child.ID, userId, currentUser);
            }
        }
    }

    /**
     * Validate that requested permissions don't exceed granter's permissions
     */
    ValidatePermissions(
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

    /** @deprecated Use {@link ValidatePermissions}. */
    validatePermissions(
        requested: PermissionSet,
        granter: PermissionSet,
        isOwner: boolean
    ): boolean {
        return this.ValidatePermissions(requested, granter, isOwner);
    }

    /**
     * Get available permissions for a user to grant based on their own permissions
     */
    GetAvailablePermissions(userPermissions: PermissionSet, isOwner: boolean): string[] {
        if (isOwner) {
            return ['Read', 'Share', 'Edit', 'Delete'];
        }

        const available = ['Read']; // Always have read
        if (userPermissions.canShare) available.push('Share');
        if (userPermissions.canEdit) available.push('Edit');
        if (userPermissions.canDelete) available.push('Delete');

        return available;
    }

    /** @deprecated Use {@link GetAvailablePermissions}. */
    getAvailablePermissions(userPermissions: PermissionSet, isOwner: boolean): string[] {
        return this.GetAvailablePermissions(userPermissions, isOwner);
    }

    /**
     * Copy all permissions from parent collection to child collection
     */
    async CopyParentPermissions(
        parentCollectionId: string,
        childCollectionId: string,
        currentUser: UserInfo
    ): Promise<void> {
        const parentPermissions = await this.LoadPermissions(parentCollectionId, currentUser);

        for (const perm of parentPermissions) {
            // Check if permission already exists for this user on the child collection
            const existing = await this.CheckPermission(childCollectionId, perm.userId, currentUser);

            if (existing) {
                // Permission already exists (e.g., owner permission), skip to avoid duplicate
                console.log(`Skipping duplicate permission for user ${perm.userId} on collection ${childCollectionId}`);
                continue;
            }

            await this.GrantPermission(
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

    /** @deprecated Use {@link CopyParentPermissions}. */
    async copyParentPermissions(
        parentCollectionId: string,
        childCollectionId: string,
        currentUser: UserInfo
    ): Promise<void> {
        return this.CopyParentPermissions(parentCollectionId, childCollectionId, currentUser);
    }

    /**
     * Delete all permissions for a collection
     */
    async DeleteAllPermissions(collectionId: string, currentUser: UserInfo): Promise<void> {
        const permissions = await this.LoadPermissions(collectionId, currentUser);

        for (const perm of permissions) {
            await this.RevokePermission(perm.id, currentUser);
        }
    }

    /** @deprecated Use {@link DeleteAllPermissions}. */
    async deleteAllPermissions(collectionId: string, currentUser: UserInfo): Promise<void> {
        return this.DeleteAllPermissions(collectionId, currentUser);
    }

    /**
     * Create owner permission record (all permissions enabled)
     */
    async CreateOwnerPermission(
        collectionId: string,
        ownerId: string,
        currentUser: UserInfo
    ): Promise<void> {
        await this.GrantPermission(
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

    /** @deprecated Use {@link CreateOwnerPermission}. */
    async createOwnerPermission(
        collectionId: string,
        ownerId: string,
        currentUser: UserInfo
    ): Promise<void> {
        return this.CreateOwnerPermission(collectionId, ownerId, currentUser);
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
