import { BaseEntity, EntityDeleteOptions, EntityPermissionType, EntitySaveOptions, IMetadataProvider, RunView, RunViewParams, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { MJCollectionPermissionEntity } from '../../generated/entity_subclasses';
import { ArtifactPermissionEngine } from '../ArtifactPermissionDelegate';
import {
    AsShareMetadataProvider,
    AssertCallerMayDeleteShare,
    AssertCallerMaySaveShare,
    BuildActionsSummary,
    CheckShareManagePermission,
    DeriveSharePermissionLevel,
    DispatchShareNotificationAfterSave,
    FailShareSave,
    GetStoredShareFieldString,
    HasImmutableShareFieldChanged,
} from './BaseShareEntityExtended';

const MAX_COLLECTION_DESCENDANT_DEPTH = 16;
const COLLECTION_IN_CLAUSE_CHUNK = 200;

function chunkIds(ids: string[], size: number): string[][] {
    if (ids.length <= size) {
        return ids.length === 0 ? [] : [ids];
    }
    const result: string[][] = [];
    for (let i = 0; i < ids.length; i += size) {
        result.push(ids.slice(i, i + size));
    }
    return result;
}

/**
 * Extended Collection Permission entity — same dual-purpose pattern as
 * {@link MJDashboardPermissionEntityExtended}. See that class for rationale.
 *
 * Note: Collections have no entry in the `MJ: Resource Type` catalog, so
 * `ResourceTypeName` is omitted and the notification's `ResourceTypeID` is
 * left null. The bell icon still shows the title/message; click-through
 * deep-linking can be added later if a Collection ResourceType is seeded.
 */
@RegisterClass(BaseEntity, 'MJ: Collection Permissions')
export class MJCollectionPermissionEntityExtended extends MJCollectionPermissionEntity {
    override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (type === EntityPermissionType.Update || type === EntityPermissionType.Delete) {
            const user = this.ActiveUser;
            const storedGrantorId = GetStoredShareFieldString(this, 'SharedByUserID');
            if (user && CheckShareManagePermission(user, storedGrantorId)) return true;
            if (type === EntityPermissionType.Delete && user) {
                const storedTargetUserId = GetStoredShareFieldString(this, 'UserID');
                if (storedTargetUserId && IsValidUUID(storedTargetUserId) && UUIDsEqual(storedTargetUserId, user.ID)) {
                    return true;
                }
            }
        }
        return super.CheckPermissions(type, throwError);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewShare = !this.IsSaved;
        const storedTargetUserId = GetStoredShareFieldString(this, 'UserID');
        const allowed = await AssertCallerMaySaveShare(
            this,
            isNewShare,
            () => this.authorizeCollectionShareSave(isNewShare),
            isNewShare
                ? 'Only the collection owner or someone with Share permission on this collection can create a new share.'
                : 'Only the collection owner or someone with Share permission on this collection can update this share without escalating privileges.'
        );
        if (!allowed) return false;

        const saved = await super.Save(options);
        if (saved) {
            await DispatchShareNotificationAfterSave(this, isNewShare, this.SharedByUserID, async (provider, grantorId) => {
                const collectionName = this.Collection?.trim() ? this.Collection : await this.fetchCollectionName(provider);
                const permissionLevel = DeriveSharePermissionLevel({
                    canEdit: this.CanEdit,
                    canDelete: this.CanDelete,
                    canShare: this.CanShare,
                });
                return {
                    Provider: provider,
                    ContextUser: this.ContextCurrentUser,
                    GrantorUserID: grantorId,
                    GranteeUserID: this.UserID,
                    ResourceTypeLabel: 'Collection',
                    // No ResourceTypeName — Collections aren't in the Resource Type catalog
                    ResourceName: collectionName,
                    ResourceRecordID: this.CollectionID,
                    PermissionLevel: permissionLevel,
                    ActionsSummary: this.actionsSummary(),
                    ExtraConfiguration: {
                        type: 'collection',
                        collectionId: this.CollectionID,
                        ResourceRecordID: this.CollectionID,
                        PermissionID: this.ID,
                        PermissionLevel: permissionLevel,
                    },
                };
            });
            await this.notifyCollectionArtifactPermissionsChanged(this.CollectionID, storedTargetUserId ?? this.UserID);
        }
        return saved;
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const collectionId = GetStoredShareFieldString(this, 'CollectionID') ?? this.CollectionID;
        const targetUserId = GetStoredShareFieldString(this, 'UserID') ?? this.UserID;
        const allowed = await AssertCallerMayDeleteShare(
            this,
            () => this.authorizeCollectionShareDelete(collectionId, targetUserId),
            'Only the collection owner or someone with Share permission on this collection can revoke this share.'
        );
        if (!allowed) return false;

        const deleted = await super.Delete(options);
        if (deleted && collectionId) {
            await this.notifyCollectionArtifactPermissionsChanged(collectionId, targetUserId);
        }
        return deleted;
    }

    private async resolveQueryActor(provider: IMetadataProvider): Promise<UserInfo | null> {
        let queryActor: UserInfo | undefined = this.ContextCurrentUser ?? undefined;
        if (provider.ProviderType === 'Database') {
            const systemUser = await WellKnownUserSource.Instance.GetSystemUser(provider);
            if (!systemUser) {
                return null;
            }
            queryActor = systemUser;
        }
        return queryActor ?? null;
    }

    private async collectDescendantCollectionArtifactIds(
        provider: IMetadataProvider,
        collectionId: string,
        queryActor: UserInfo
    ): Promise<{ Success: boolean; ArtifactIds: string[] }> {
        const rv = RunView.FromMetadataProvider(provider);

        // Walk descendant collections (cycle-guarded up to depth 16) so parent collection changes
        // account for artifacts nested inside child collections as well as direct links.
        const collectionIds: string[] = [collectionId];
        const seenCollections = new Set<string>([NormalizeUUID(collectionId)]);
        let frontier: string[] = [collectionId];
        for (let depth = 0; depth < MAX_COLLECTION_DESCENDANT_DEPTH && frontier.length > 0; depth++) {
            const nextFrontier: string[] = [];
            for (const chunk of chunkIds(frontier, COLLECTION_IN_CLAUSE_CHUNK)) {
                const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
                const childParams: RunViewParams = {
                    EntityName: 'MJ: Collections',
                    ExtraFilter: `ParentID IN (${inList})`,
                    Fields: ['ID'],
                    SkipTotalRowCount: true,
                    ResultType: 'simple',
                };
                ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(childParams);
                const childRes = await rv.RunView<{ ID: string }>(childParams, queryActor);
                if (!childRes.Success) {
                    return { Success: false, ArtifactIds: [] };
                }
                for (const child of childRes.Results ?? []) {
                    const norm = NormalizeUUID(child.ID);
                    if (norm && !seenCollections.has(norm)) {
                        seenCollections.add(norm);
                        collectionIds.push(child.ID);
                        nextFrontier.push(child.ID);
                    }
                }
            }
            frontier = nextFrontier;
        }

        const versionIds: string[] = [];
        const seenVersionIds = new Set<string>();
        for (const colChunk of chunkIds(collectionIds, COLLECTION_IN_CLAUSE_CHUNK)) {
            const colInList = colChunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            const colArtParams: RunViewParams = {
                EntityName: 'MJ: Collection Artifacts',
                ExtraFilter: `CollectionID IN (${colInList})`,
                Fields: ['ArtifactVersionID'],
                SkipTotalRowCount: true,
                ResultType: 'simple',
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(colArtParams);
            const colResult = await rv.RunView<{ ArtifactVersionID: string }>(colArtParams, queryActor);
            if (!colResult.Success) {
                return { Success: false, ArtifactIds: [] };
            }
            for (const row of colResult.Results ?? []) {
                if (row.ArtifactVersionID) {
                    const norm = NormalizeUUID(row.ArtifactVersionID);
                    if (!seenVersionIds.has(norm)) {
                        seenVersionIds.add(norm);
                        versionIds.push(row.ArtifactVersionID);
                    }
                }
            }
        }
        if (versionIds.length === 0) {
            return { Success: true, ArtifactIds: [] };
        }

        const artifactIds: string[] = [];
        const seenArtifactIds = new Set<string>();
        for (const verChunk of chunkIds(versionIds, COLLECTION_IN_CLAUSE_CHUNK)) {
            const inList = verChunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            const verParams: RunViewParams = {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID IN (${inList})`,
                Fields: ['ArtifactID'],
                SkipTotalRowCount: true,
                ResultType: 'simple',
            };
            ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(verParams);
            const verResult = await rv.RunView<{ ArtifactID: string }>(verParams, queryActor);
            if (!verResult.Success) {
                return { Success: false, ArtifactIds: [] };
            }
            for (const row of verResult.Results ?? []) {
                if (row.ArtifactID) {
                    const norm = NormalizeUUID(row.ArtifactID);
                    if (!seenArtifactIds.has(norm)) {
                        seenArtifactIds.add(norm);
                        artifactIds.push(row.ArtifactID);
                    }
                }
            }
        }
        return { Success: true, ArtifactIds: artifactIds };
    }

    private async notifyCollectionArtifactPermissionsChanged(collectionId: string, targetUserId?: string): Promise<void> {
        if (!collectionId || !IsValidUUID(collectionId) || !ArtifactPermissionEngine.Instance.HasChangeListeners) {
            return;
        }
        try {
            const provider = AsShareMetadataProvider(this.ProviderToUse);
            if (!provider) {
                return;
            }
            const queryActor = await this.resolveQueryActor(provider);
            if (!queryActor) {
                return;
            }
            const collected = await this.collectDescendantCollectionArtifactIds(provider, collectionId, queryActor);
            if (!collected.Success) {
                return;
            }
            for (const artifactId of collected.ArtifactIds) {
                await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                    ArtifactID: artifactId,
                    TargetUserID: targetUserId,
                    ChangedByUserID: this.ContextCurrentUser?.ID,
                });
            }
        } catch {
            // Best-effort live room notification; never fail the permission save/delete itself.
        }
    }

    private async fetchCollectionName(provider: IMetadataProvider): Promise<string | null> {
        if (!IsValidUUID(this.CollectionID)) {
            return null;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const queryParams: RunViewParams = {
            EntityName: 'MJ: Collections',
            ExtraFilter: `ID='${EscapeSQLString(this.CollectionID)}'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        };
        ArtifactPermissionEngine.MarkPermissionResolutionRecursionGuard(queryParams);
        const result = await rv.RunView<{ ID: string; Name?: string | null }>(queryParams, this.ContextCurrentUser);
        return result.Success ? result.Results?.[0]?.Name ?? null : null;
    }

    private actionsSummary(): string {
        return BuildActionsSummary({
            view: this.CanRead,
            edit: this.CanEdit,
            delete: this.CanDelete,
            share: this.CanShare,
        });
    }

    private async authorizeCollectionShareDelete(
        collectionId: string | null | undefined,
        targetUserId: string | null | undefined
    ): Promise<boolean> {
        const user = this.ContextCurrentUser;
        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (!user || !provider) return false;

        if (!IsValidUUID(collectionId)) {
            return FailShareSave(this, user, 'CollectionID must be a valid UUID.', 'delete');
        }

        // Allow grantees to delete their own share row ("Leave shared item")
        if (targetUserId && IsValidUUID(targetUserId) && UUIDsEqual(targetUserId, user.ID)) {
            return true;
        }

        const perms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider,
            collectionId,
            user
        );
        return perms.CanShare;
    }

    /**
     * Authorization for creating or updating an `MJ: Collection Permissions` row.
     * Validates UUID shape, forbids re-parenting `CollectionID`, `UserID`, or `SharedByUserID`
     * on updates, enforces `SharedByUserID === caller` on creates, resolves ancestor collection
     * permissions via {@link ArtifactPermissionEngine}, and enforces a grant ceiling across both
     * collection permissions and linked/descendant artifacts when granting `CanDelete`/`CanShare`.
     */
    private async authorizeCollectionShareSave(isNewShare: boolean): Promise<boolean> {
        const user = this.ContextCurrentUser;
        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (!user || !provider) return false;

        const action: 'create' | 'update' = isNewShare ? 'create' : 'update';
        const changedImmutable = HasImmutableShareFieldChanged(this, ['CollectionID', 'UserID', 'SharedByUserID']);
        if (changedImmutable) {
            return FailShareSave(this, user, `Cannot reassign ${changedImmutable} on an existing share.`, action);
        }

        if (isNewShare) {
            const rawGrantor = this.SharedByUserID?.trim() ?? '';
            if (!rawGrantor) {
                this.SharedByUserID = user.ID;
            } else if (!IsValidUUID(rawGrantor) || !UUIDsEqual(rawGrantor, user.ID)) {
                return FailShareSave(this, user, 'SharedByUserID must match the calling user when creating a share.', action);
            }
        }

        if (!IsValidUUID(this.CollectionID) || !IsValidUUID(this.UserID)) {
            return FailShareSave(this, user, 'CollectionID and UserID must be valid UUIDs.', action);
        }

        const perms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            provider,
            this.CollectionID,
            user
        );
        if (!perms.CanShare) {
            return false;
        }

        const withinGrantCeiling =
            (!this.CanRead || perms.CanRead) &&
            (!this.CanEdit || perms.CanEdit) &&
            (!this.CanDelete || perms.CanDelete) &&
            (!this.CanShare || perms.CanShare);
        if (!withinGrantCeiling) {
            return FailShareSave(
                this,
                user,
                'Cannot grant collection permissions that exceed the caller’s own permissions.',
                action
            );
        }

        if (this.CanDelete || this.CanShare) {
            const queryActor = await this.resolveQueryActor(provider);
            if (!queryActor) {
                return FailShareSave(
                    this,
                    user,
                    'Cannot verify linked artifact permissions without a query actor.',
                    action
                );
            }
            const collected = await this.collectDescendantCollectionArtifactIds(provider, this.CollectionID, queryActor);
            if (!collected.Success) {
                return FailShareSave(
                    this,
                    user,
                    'Failed to verify linked artifact permissions for collection share grant ceiling.',
                    action
                );
            }
            for (const artifactId of collected.ArtifactIds) {
                const artPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
                if ((this.CanDelete && !artPerms.CanDelete) || (this.CanShare && !artPerms.CanShare)) {
                    return FailShareSave(
                        this,
                        user,
                        'Cannot grant collection permissions that exceed the caller’s own permissions on linked artifacts.',
                        action
                    );
                }
            }
        }

        return true;
    }
}

/** Tree-shaking prevention — referenced from the custom/Permissions barrel. */
export function LoadMJCollectionPermissionEntityExtended(): void {
    // intentionally empty
}
