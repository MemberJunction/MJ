import { Injectable } from '@angular/core';
import { UserInfo, RunView, Metadata, IMetadataProvider } from '@memberjunction/core';
import { MJArtifactPermissionEntity, MJArtifactEntity, MJCollectionArtifactEntity } from '@memberjunction/core-entities';
import type { MJArtifactVersionEntity, MJCollectionPermissionEntity } from '@memberjunction/core-entities';
import { CollectionPermissionService } from './collection-permission.service';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

type ArtifactGrantRow = Pick<MJArtifactPermissionEntity, 'ArtifactID' | 'CanRead'>;
type CollectionGrantRow = Pick<MJCollectionPermissionEntity, 'CollectionID'>;
type CollectionArtifactRow = Pick<MJCollectionArtifactEntity, 'ArtifactVersionID'>;
type ArtifactVersionRow = Pick<MJArtifactVersionEntity, 'ArtifactID'>;

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
    private _provider: IMetadataProvider | null = null;

    constructor(
        private collectionPermissionService: CollectionPermissionService
    ) {}

    /**
     * The metadata provider this service uses. When unset, falls back to Metadata.Provider.
     * Setting it also propagates to the collection-permission service this depends on.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
        if (value !== null) {
            this.collectionPermissionService.Provider = value;
        }
    }

    /**
     * Load all explicit permissions for an artifact
     */
    async LoadPermissions(artifactId: string, currentUser: UserInfo): Promise<ArtifactPermission[]> {
        const rv = RunView.FromMetadataProvider(this.Provider);
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

    /** @deprecated Use {@link LoadPermissions}. */
    async loadPermissions(artifactId: string, currentUser: UserInfo): Promise<ArtifactPermission[]> {
        return this.LoadPermissions(artifactId, currentUser);
    }

    /**
     * Check if user has specific permission for an artifact (HYBRID CHECK)
     * Checks in order: Owner > Explicit Permission > Collection Inheritance
     */
    async CheckPermission(
        artifactId: string,
        userId: string,
        permission: 'read' | 'edit' | 'share',
        currentUser: UserInfo
    ): Promise<boolean> {
        // 1. Check ownership - owner has all permissions
        const artifact = await this.getArtifact(artifactId, currentUser);
        if (artifact && UUIDsEqual(artifact.UserID, userId)) {
            return true;
        }

        // 2. Check explicit artifact permission
        const explicit = await this.GetExplicitPermission(artifactId, userId, currentUser);
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

    /** @deprecated Use {@link CheckPermission}. */
    async checkPermission(
        artifactId: string,
        userId: string,
        permission: 'read' | 'edit' | 'share',
        currentUser: UserInfo
    ): Promise<boolean> {
        return this.CheckPermission(artifactId, userId, permission, currentUser);
    }

    /**
     * Get explicit permission record for a user on an artifact
     */
    async GetExplicitPermission(
        artifactId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<ArtifactPermission | null> {
        const rv = RunView.FromMetadataProvider(this.Provider);
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

    /** @deprecated Use {@link GetExplicitPermission}. */
    async getExplicitPermission(
        artifactId: string,
        userId: string,
        currentUser: UserInfo
    ): Promise<ArtifactPermission | null> {
        return this.GetExplicitPermission(artifactId, userId, currentUser);
    }

    /**
     * Get all effective permissions for an artifact (owner + explicit + inherited)
     */
    async GetEffectiveUsers(artifactId: string, currentUser: UserInfo): Promise<EffectivePermission[]> {
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
        const explicitPerms = await this.LoadPermissions(artifactId, currentUser);
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

    /** @deprecated Use {@link GetEffectiveUsers}. */
    async getEffectiveUsers(artifactId: string, currentUser: UserInfo): Promise<EffectivePermission[]> {
        return this.GetEffectiveUsers(artifactId, currentUser);
    }

    /**
     * Grant explicit permission to a user
     */
    async GrantPermission(
        artifactId: string,
        userId: string,
        permissions: ArtifactPermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<MJArtifactPermissionEntity> {
        const md = this.Provider;
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

    /** @deprecated Use {@link GrantPermission}. */
    async grantPermission(
        artifactId: string,
        userId: string,
        permissions: ArtifactPermissionSet,
        sharedByUserId: string,
        currentUser: UserInfo
    ): Promise<MJArtifactPermissionEntity> {
        return this.GrantPermission(artifactId, userId, permissions, sharedByUserId, currentUser);
    }

    /**
     * Update existing permission
     */
    async UpdatePermission(
        permissionId: string,
        permissions: ArtifactPermissionSet,
        currentUser: UserInfo
    ): Promise<boolean> {
        const md = this.Provider;
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

    /** @deprecated Use {@link UpdatePermission}. */
    async updatePermission(
        permissionId: string,
        permissions: ArtifactPermissionSet,
        currentUser: UserInfo
    ): Promise<boolean> {
        return this.UpdatePermission(permissionId, permissions, currentUser);
    }

    /**
     * Revoke explicit permission
     */
    async RevokePermission(permissionId: string, currentUser: UserInfo): Promise<boolean> {
        const md = this.Provider;
        const permission = await md.GetEntityObject<MJArtifactPermissionEntity>(
            'MJ: Artifact Permissions',
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
     * Validate that requested permissions don't exceed granter's permissions
     */
    ValidatePermissions(
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

    /** @deprecated Use {@link ValidatePermissions}. */
    validatePermissions(
        requested: ArtifactPermissionSet,
        granter: ArtifactPermissionSet,
        isOwner: boolean
    ): boolean {
        return this.ValidatePermissions(requested, granter, isOwner);
    }

    /**
     * Get available permissions for a user to grant based on their own permissions
     */
    GetAvailablePermissions(userPermissions: ArtifactPermissionSet, isOwner: boolean): string[] {
        if (isOwner) {
            return ['Read', 'Edit', 'Share'];
        }

        const available = ['Read']; // Always have read
        if (userPermissions.canEdit) available.push('Edit');
        if (userPermissions.canShare) available.push('Share');

        return available;
    }

    /** @deprecated Use {@link GetAvailablePermissions}. */
    getAvailablePermissions(userPermissions: ArtifactPermissionSet, isOwner: boolean): string[] {
        return this.GetAvailablePermissions(userPermissions, isOwner);
    }

    /**
     * Check if user is owner of artifact
     */
    async IsOwner(artifactId: string, userId: string, currentUser: UserInfo): Promise<boolean> {
        const artifact = await this.getArtifact(artifactId, currentUser);
        return artifact ? UUIDsEqual(artifact.UserID, userId) : false;
    }

    /** @deprecated Use {@link IsOwner}. */
    async isOwner(artifactId: string, userId: string, currentUser: UserInfo): Promise<boolean> {
        return this.IsOwner(artifactId, userId, currentUser);
    }

    /**
     * Get all permissions for current user on an artifact (convenience method for UI)
     */
    async GetUserPermissions(artifactId: string, currentUser: UserInfo): Promise<ArtifactPermissionSet> {
        const [canRead, canEdit, canShare] = await Promise.all([
            this.CheckPermission(artifactId, currentUser.ID, 'read', currentUser),
            this.CheckPermission(artifactId, currentUser.ID, 'edit', currentUser),
            this.CheckPermission(artifactId, currentUser.ID, 'share', currentUser)
        ]);

        return { canRead, canEdit, canShare };
    }

    /** @deprecated Use {@link GetUserPermissions}. */
    async getUserPermissions(artifactId: string, currentUser: UserInfo): Promise<ArtifactPermissionSet> {
        return this.GetUserPermissions(artifactId, currentUser);
    }

    /**
     * Returns an `ExtraFilter` for `MJ: Artifacts` that matches the artifacts the user can read,
     * by the same rule as {@link CheckPermission}: the user owns it, else an explicit grant
     * decides, else a read grant on a collection that holds a version of it.
     *
     * Each lookup runs against its own entity, so the filter holds only `UserID` and IDs.
     */
    async GetReadableArtifactsFilter(userId: string, currentUser: UserInfo): Promise<string> {
        const ownerOnly = `(UserID='${userId}')`;
        const rv = RunView.FromMetadataProvider(this.Provider);
        const [grantResult, collectionResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Artifact Permissions',
                ExtraFilter: `UserID='${userId}'`,
                Fields: ['ArtifactID', 'CanRead'],
                ResultType: 'simple'
            },
            {
                EntityName: 'MJ: Collection Permissions',
                ExtraFilter: `UserID='${userId}' AND CanRead=1`,
                Fields: ['CollectionID'],
                ResultType: 'simple'
            }
        ], currentUser);

        // Without the explicit grants, a grant that withholds read is unknown, so collection
        // access cannot be applied safely.
        if (!grantResult.Success) {
            console.error('Failed to load artifact grants:', grantResult.ErrorMessage);
            return ownerOnly;
        }

        const grants = (grantResult.Results ?? []) as ArtifactGrantRow[];
        const collectionIds = collectionResult.Success
            ? ((collectionResult.Results ?? []) as CollectionGrantRow[]).map(r => r.CollectionID)
            : [];
        const collectionArtifactIds = await this.getArtifactIdsInCollections(collectionIds, currentUser);

        const readableIds = this.resolveReadableArtifactIds(grants, collectionArtifactIds);
        return readableIds.length > 0
            ? `(UserID='${userId}' OR ID IN (${readableIds.map(id => `'${id}'`).join(',')}))`
            : ownerOnly;
    }

    /**
     * IDs of artifacts that have at least one version in any of the given collections.
     */
    private async getArtifactIdsInCollections(collectionIds: string[], currentUser: UserInfo): Promise<string[]> {
        if (collectionIds.length === 0) {
            return [];
        }

        const rv = RunView.FromMetadataProvider(this.Provider);
        const versionResult = await rv.RunView<CollectionArtifactRow>({
            EntityName: 'MJ: Collection Artifacts',
            ExtraFilter: `CollectionID IN (${collectionIds.map(id => `'${id}'`).join(',')})`,
            Fields: ['ArtifactVersionID'],
            ResultType: 'simple'
        }, currentUser);
        const versionIds = versionResult.Success ? (versionResult.Results ?? []).map(r => r.ArtifactVersionID) : [];
        if (versionIds.length === 0) {
            return [];
        }

        const artifactResult = await rv.RunView<ArtifactVersionRow>({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${versionIds.map(id => `'${id}'`).join(',')})`,
            Fields: ['ArtifactID'],
            ResultType: 'simple'
        }, currentUser);
        return artifactResult.Success ? (artifactResult.Results ?? []).map(r => r.ArtifactID) : [];
    }

    /**
     * Applies the grant order: an explicit grant decides for its artifact; collection access
     * counts only for artifacts that have no explicit grant.
     */
    private resolveReadableArtifactIds(grants: ArtifactGrantRow[], collectionArtifactIds: string[]): string[] {
        const explicitRead = new Map<string, { id: string; canRead: boolean }>();
        for (const grant of grants) {
            const key = NormalizeUUID(grant.ArtifactID);
            const canRead = (explicitRead.get(key)?.canRead ?? false) || !!grant.CanRead;
            explicitRead.set(key, { id: grant.ArtifactID, canRead });
        }

        const readable = new Map<string, string>();
        for (const { id, canRead } of explicitRead.values()) {
            if (canRead) {
                readable.set(NormalizeUUID(id), id);
            }
        }
        for (const id of collectionArtifactIds) {
            const key = NormalizeUUID(id);
            if (!explicitRead.has(key) && !readable.has(key)) {
                readable.set(key, id);
            }
        }
        return [...readable.values()];
    }

    /**
     * Helper: Get artifact record
     */
    private async getArtifact(artifactId: string, currentUser: UserInfo): Promise<MJArtifactEntity | null> {
        const rv = RunView.FromMetadataProvider(this.Provider);
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
        const rv = RunView.FromMetadataProvider(this.Provider);
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
