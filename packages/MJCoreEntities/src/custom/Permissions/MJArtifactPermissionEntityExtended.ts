import { BaseEntity, EntityDeleteOptions, EntityPermissionType, EntitySaveOptions, RunView } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { MJArtifactPermissionEntity } from '../../generated/entity_subclasses';
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

/**
 * Extended Artifact Permission entity — same dual-purpose pattern as
 * {@link MJDashboardPermissionEntityExtended}. See that class for rationale.
 */
@RegisterClass(BaseEntity, 'MJ: Artifact Permissions')
export class MJArtifactPermissionEntityExtended extends MJArtifactPermissionEntity {
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
            () => this.authorizeArtifactShareSave(isNewShare),
            isNewShare
                ? 'Only the artifact owner or someone with Share permission on this artifact can create a new share.'
                : 'Only the artifact owner or someone with Share permission on this artifact can update this share without escalating privileges.'
        );
        if (!allowed) return false;

        const saved = await super.Save(options);
        if (saved) {
            await DispatchShareNotificationAfterSave(this, isNewShare, this.SharedByUserID, async (provider, grantorId) => {
                // The Artifact view doesn't denormalize Name onto the permission row — look it up.
                const artifactName = (await this.fetchArtifactName()) ?? this.Artifact ?? null;
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
                    ResourceTypeLabel: 'Artifact',
                    ResourceTypeName: 'Artifacts',
                    ResourceName: artifactName,
                    ResourceRecordID: this.ArtifactID,
                    PermissionLevel: permissionLevel,
                    ActionsSummary: this.actionsSummary(),
                    ExtraConfiguration: {
                        type: 'artifact',
                        artifactId: this.ArtifactID,
                        ResourceRecordID: this.ArtifactID,
                        PermissionID: this.ID,
                        PermissionLevel: permissionLevel,
                    },
                };
            });
            await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                ArtifactID: this.ArtifactID,
                TargetUserID: storedTargetUserId ?? this.UserID,
                ChangedByUserID: this.ContextCurrentUser?.ID,
            });
        }
        return saved;
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const artifactId = GetStoredShareFieldString(this, 'ArtifactID') ?? this.ArtifactID;
        const targetUserId = GetStoredShareFieldString(this, 'UserID') ?? this.UserID;
        const allowed = await AssertCallerMayDeleteShare(
            this,
            () => this.authorizeArtifactShareDelete(artifactId, targetUserId),
            'Only the artifact owner or someone with Share permission on this artifact can revoke this share.'
        );
        if (!allowed) return false;

        const deleted = await super.Delete(options);
        if (deleted && artifactId) {
            await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
                ArtifactID: artifactId,
                TargetUserID: targetUserId,
                ChangedByUserID: this.ContextCurrentUser?.ID,
            });
        }
        return deleted;
    }

    private actionsSummary(): string {
        return BuildActionsSummary({
            view: this.CanRead,
            edit: this.CanEdit,
            delete: this.CanDelete,
            share: this.CanShare,
        });
    }

    private async authorizeArtifactShareDelete(
        artifactId: string | null | undefined,
        targetUserId: string | null | undefined
    ): Promise<boolean> {
        const user = this.ContextCurrentUser;
        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (!user || !provider) return false;

        if (!IsValidUUID(artifactId)) {
            return FailShareSave(this, user, 'ArtifactID must be a valid UUID.', 'delete');
        }

        // Allow grantees to delete their own share row ("Leave shared item")
        if (targetUserId && IsValidUUID(targetUserId) && UUIDsEqual(targetUserId, user.ID)) {
            return true;
        }

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
        return perms.CanShare;
    }

    /**
     * Authorization for creating or updating an `MJ: Artifact Permissions` row.
     * Validates UUID shape, forbids re-parenting `ArtifactID`, `UserID`, or `SharedByUserID`
     * on updates, enforces `SharedByUserID === caller` on creates, resolves effective
     * permissions via {@link ArtifactPermissionEngine}, and enforces a grant ceiling.
     */
    private async authorizeArtifactShareSave(isNewShare: boolean): Promise<boolean> {
        const user = this.ContextCurrentUser;
        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (!user || !provider) return false;

        const action: 'create' | 'update' = isNewShare ? 'create' : 'update';
        const changedImmutable = HasImmutableShareFieldChanged(this, ['ArtifactID', 'UserID', 'SharedByUserID']);
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

        if (!IsValidUUID(this.ArtifactID) || !IsValidUUID(this.UserID)) {
            return FailShareSave(this, user, 'ArtifactID and UserID must be valid UUIDs.', action);
        }

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, this.ArtifactID, user);
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
                'Cannot grant artifact permissions that exceed the caller’s own permissions.',
                action
            );
        }

        return true;
    }

    private async fetchArtifactName(): Promise<string | null> {
        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (!provider || !IsValidUUID(this.ArtifactID)) {
            return null;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{ ID: string; Name?: string | null }>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID='${EscapeSQLString(this.ArtifactID)}'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        }, this.ContextCurrentUser);
        return result.Success ? result.Results?.[0]?.Name ?? null : null;
    }
}

/** Tree-shaking prevention — referenced from the custom/Permissions barrel. */
export function LoadMJArtifactPermissionEntityExtended(): void {
    // intentionally empty
}
