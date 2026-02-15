import { Injectable } from '@angular/core';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { MJArtifactPermissionEntity, MJArtifactEntity, MJCollectionArtifactEntity } from '@memberjunction/core-entities';
import { CollectionPermissionService } from './collection-permission.service';

export interface ArtifactPermission {
    id: string;
    artifactId: string;
    userId: string;
    userName: string;
    canRead: boolean;
    canEdit: boolean;
    canShare: boolean;
    sharedByUserId: string | null;
    sharedByUserName: string | null;
    sharedAt: Date;
}

export interface EffectivePermission extends ArtifactPermission {
    source: 'owner' | 'explicit' | 'collection';
    collectionName?: string; // If inherited from collection
}

export interface ArtifactPermissionSet {
    canRead: boolean;
    canEdit: boolean;
    canShare: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ArtifactPermissionService {

    constructor(
        private collectionPermissionService: CollectionPermissionService
    ) {}

    /**
     * Load all explicit permissions for an artifact
     */
    async loadPermissions(artifactId: string, currentUser: UserInfo): Promise<ArtifactPermission[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJArtifactPermissionEntity>({
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `ArtifactID='${artifactId}'`,
            OrderBy: '__mj_CreatedAt ASC',
            ResultType: 'entity_object'
        }, currentUser);

        if (result.Success && result.Results) {
            return result.Results.map(p => this.mapToPermission(p));
        }
        return [];
    }

    /**
     * Check if user has specific permission for an artifact (HYBRID CHECK)
     * Checks in order: Owner > Explicit Permission > Collection Inheritance
     */
    async checkPermission(
        artifactId: string,
        userId: string,
        permission: 'read' | 'edit' | 'share',
        currentUser: UserInfo
    ): Promise<boolean> {
        // 1. Check ownership - owner has all permissions
        const artifact = await this.getArtifact(artifactId, currentUser);
        if (artifact && artifact.UserID === userId) {
            return true;
        }

        // 2. Check explicit artifact permission
        const explicit = await this.getExplicitPermission(artifactId, userId, currentUser);
        if (explicit) {
            return this.hasPermission(explicit, permission);
        }

        // 3. Check collection permission inheritance
        const collections = await this.getArtifactCollections(artifactId, currentUser);
        for (const collection of collections) {
            const collectionPermission = await this.collectionPermissionService.checkPermission(
                collection.CollectionID,
                userId,
                currentUser
            );

            if (collectionPermission && this.hasCollectionPermission(collectionPermission, permission)) {
                return true; // Inherited from collection
            }
        }

        // 4. No access
        return false;
    }

    /**
     * Get explicit permission record for a user on an artifact
     */
    async getExplicitPermission(
        artifactId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<ArtifactPermission | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJArtifactPermissionEntity>({
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `ArtifactID='${artifactId}' AND UserID='${userId}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        }, currentUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return this.mapToPermission(result.Results[0]);
        }
        return null;
    }

    /**
     * Get all effective permissions for an artifact (owner + explicit + inherited)
     */
    async getEffectiveUsers(artifactId: string, currentUser: UserInfo): Promise<EffectivePermission[]> {
        const effectivePermissions: EffectivePermission[] = [];
        const seenUsers = new Set<string>();

        // 1. Add owner
        const artifact = await this.getArtifact(artifactId, currentUser);
        if (artifact && artifact.UserID) {
            effectivePermissions.push({
                id: '', // No permission record for owner
                artifactId: artifactId,
                userId: artifact.UserID,
                userName: artifact.User || 'Owner',
                canRead: true,
                canEdit: true,
                canShare: true,
                sharedByUserId: null,
                sharedByUserName: null,
                sharedAt: artifact.__mj_CreatedAt,
                source: 'owner'
            });
            seenUsers.add(artifact.UserID);
        }

        // 2. Add explicit permissions
        const explicitPerms = await this.loadPermissions(artifactId, currentUser);
        for (const perm of explicitPerms) {
            if (!seenUsers.has(perm.userId)) {
                effectivePermissions.push({
                    ...perm,
                    source: 'explicit'
                });
                seenUsers.add(perm.userId);
            }
        }

        // 3. Add collection-inherited permissions
        const collections = await this.getArtifactCollections(artifactId, currentUser);
        for (const collection of collections) {
            const collectionPerms = await this.collectionPermissionService.loadPermissions(
                collection.CollectionID,
                currentUser
            );

            for (const collPerm of collectionPerms) {
                if (!seenUsers.has(collPerm.userId)) {
                    effectivePermissions.push({
                        id: '',
                        artifactId: artifactId,
                        userId: collPerm.userId,
                        userName: collPerm.userName,
                        canRead: collPerm.canRead,
                        canEdit: collPerm.canEdit,
                        canShare: collPerm.canShare,
                        sharedByUserId: collPerm.sharedByUserId,
                        sharedByUserName: collPerm.sharedByUserName,
                        sharedAt: collPerm.sharedAt,
                        source: 'collection',
                        collectionName: collection.Collection || 'Unknown Collection'
                    });
                    seenUsers.add(collPerm.userId);
                }
            }
        }

        return effectivePermissions;
    }

    /**
     * Grant explicit permission to a user
     */
    async grantPermission(
        artifactId: string,
        userId: string,
        permissions: ArtifactPermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<MJArtifactPermissionEntity> {
        const md = new Metadata();
        const permission = await md.GetEntityObject<MJArtifactPermissionEntity>(
            'MJ: Artifact Permissions',
            currentUser
        );

        permission.ArtifactID = artifactId;
        permission.UserID = userId;
        permission.CanRead = permissions.canRead;
        permission.CanEdit = permissions.canEdit;
        permission.CanShare = permissions.canShare;
        permission.SharedByUserID = sharedByUserId;

        const saved = await permission.Save();
        if (!saved) {
            throw new Error(permission.LatestResult?.Message || 'Failed to grant permission');
        }

        return permission;
    }

    /**
     * Update existing permission
     */
    async updatePermission(
        permissionId: string,
        permissions: ArtifactPermissionSet,
        currentUser: UserInfo
    ): Promise<boolean> {
        const md = new Metadata();
        const permission = await md.GetEntityObject<MJArtifactPermissionEntity>(
            'MJ: Artifact Permissions',
            currentUser
        );

        await permission.Load(permissionId);
        permission.CanRead = permissions.canRead;
        permission.CanEdit = permissions.canEdit;
        permission.CanShare = permissions.canShare;

        return await permission.Save();
    }

    /**
     * Revoke explicit permission
     */
    async revokePermission(permissionId: string, currentUser: UserInfo): Promise<boolean> {
        const md = new Metadata();
        const permission = await md.GetEntityObject<MJArtifactPermissionEntity>(
            'MJ: Artifact Permissions',
            currentUser
        );

        await permission.Load(permissionId);
        return await permission.Delete();
    }

    /**
     * Validate that requested permissions don't exceed granter's permissions
     */
    validatePermissions(
        requested: ArtifactPermissionSet,
        granter: ArtifactPermissionSet,
        isOwner: boolean
    ): boolean {
        if (isOwner) return true; // Owner can grant anything

        // Can't grant permissions you don't have
        if (requested.canEdit && !granter.canEdit) return false;
        if (requested.canShare && !granter.canShare) return false;

        return true;
    }

    /**
     * Get available permissions for a user to grant based on their own permissions
     */
    getAvailablePermissions(userPermissions: ArtifactPermissionSet, isOwner: boolean): string[] {
        if (isOwner) {
            return ['Read', 'Edit', 'Share'];
        }

        const available = ['Read']; // Always have read
        if (userPermissions.canEdit) available.push('Edit');
        if (userPermissions.canShare) available.push('Share');

        return available;
    }

    /**
     * Check if user is owner of artifact
     */
    async isOwner(artifactId: string, userId: string, currentUser: UserInfo): Promise<boolean> {
        const artifact = await this.getArtifact(artifactId, currentUser);
        return artifact ? artifact.UserID === userId : false;
    }

    /**
     * Get all permissions for current user on an artifact (convenience method for UI)
     */
    async getUserPermissions(artifactId: string, currentUser: UserInfo): Promise<ArtifactPermissionSet> {
        const [canRead, canEdit, canShare] = await Promise.all([
            this.checkPermission(artifactId, currentUser.ID, 'read', currentUser),
            this.checkPermission(artifactId, currentUser.ID, 'edit', currentUser),
            this.checkPermission(artifactId, currentUser.ID, 'share', currentUser)
        ]);

        return { canRead, canEdit, canShare };
    }

    /**
     * Helper: Get artifact record
     */
    private async getArtifact(artifactId: string, currentUser: UserInfo): Promise<MJArtifactEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJArtifactEntity>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID='${artifactId}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        }, currentUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0];
        }
        return null;
    }

    /**
     * Helper: Get all collections containing this artifact
     */
    private async getArtifactCollections(
        artifactId: string,
        currentUser: UserInfo
    ): Promise<MJCollectionArtifactEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJCollectionArtifactEntity>({
            EntityName: 'MJ: Collection Artifacts',
            ExtraFilter: `ArtifactVersionID IN (
                SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${artifactId}'
            )`,
            ResultType: 'entity_object'
        }, currentUser);

        return result.Success && result.Results ? result.Results : [];
    }

    /**
     * Helper: Check if permission set has specific permission
     */
    private hasPermission(permission: ArtifactPermission, type: 'read' | 'edit' | 'share'): boolean {
        switch (type) {
            case 'read':
                return permission.canRead;
            case 'edit':
                return permission.canEdit;
            case 'share':
                return permission.canShare;
            default:
                return false;
        }
    }

    /**
     * Helper: Check if collection permission has specific permission
     */
    private hasCollectionPermission(
        permission: { canRead: boolean; canEdit: boolean; canShare: boolean },
        type: 'read' | 'edit' | 'share'
    ): boolean {
        switch (type) {
            case 'read':
                return permission.canRead;
            case 'edit':
                return permission.canEdit;
            case 'share':
                return permission.canShare;
            default:
                return false;
        }
    }

    private mapToPermission(entity: MJArtifactPermissionEntity): ArtifactPermission {
        return {
            id: entity.ID,
            artifactId: entity.ArtifactID,
            userId: entity.UserID,
            userName: entity.User || '',
            canRead: entity.CanRead,
            canEdit: entity.CanEdit,
            canShare: entity.CanShare,
            sharedByUserId: entity.SharedByUserID || null,
            sharedByUserName: entity.SharedByUser || null,
            sharedAt: entity.__mj_CreatedAt
        };
    }
}
