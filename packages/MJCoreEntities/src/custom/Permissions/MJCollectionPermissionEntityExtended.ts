import { BaseEntity, EntityPermissionType, EntitySaveOptions, RunView } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { MJCollectionPermissionEntity } from '../../generated/entity_subclasses';
import {
    assertCallerMayCreateShare,
    buildActionsSummary,
    checkShareManagePermission,
    dispatchShareNotificationAfterSave,
} from './BaseShareEntityExtended';

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
            if (user && checkShareManagePermission(user, this.SharedByUserID)) return true;
        }
        return super.CheckPermissions(type, throwError);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewShare = !this.IsSaved;
        const allowed = await assertCallerMayCreateShare(
            this,
            isNewShare,
            () => this.callerMayShareCollection(),
            'Only the collection owner or someone with Share permission on this collection can create a new share.'
        );
        if (!allowed) return false;

        const saved = await super.Save(options);
        if (saved) {
            await dispatchShareNotificationAfterSave(this, isNewShare, this.SharedByUserID, (provider, grantorId) => ({
                Provider: provider,
                ContextUser: this.ContextCurrentUser,
                GrantorUserID: grantorId,
                GranteeUserID: this.UserID,
                ResourceTypeLabel: 'Collection',
                // No ResourceTypeName — Collections aren't in the Resource Type catalog
                ResourceName: this.Collection ?? null,
                ResourceRecordID: this.CollectionID,
                ActionsSummary: this.actionsSummary(),
                ExtraConfiguration: { PermissionID: this.ID },
            }));
        }
        return saved;
    }

    private actionsSummary(): string {
        return buildActionsSummary({
            view: this.CanRead,
            edit: this.CanEdit,
            delete: this.CanDelete,
            share: this.CanShare,
        });
    }

    /**
     * Authorization for CREATING a new CollectionPermission row. Caller must
     * be the collection owner or hold an existing Share-capable grant. Same
     * two-query pattern as {@link MJArtifactPermissionEntityExtended.callerMayShareArtifact}.
     */
    private async callerMayShareCollection(): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!user) return false;
        const rv = new RunView();
        const [ownerResult, grantResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Collections',
                ExtraFilter: `ID='${this.CollectionID}'`,
                Fields: ['ID', 'OwnerID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Collection Permissions',
                ExtraFilter: `CollectionID='${this.CollectionID}' AND UserID='${user.ID}' AND CanShare=1`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
        ]);
        const ownerId = ownerResult.Success
            ? (ownerResult.Results?.[0] as { OwnerID?: string | null } | undefined)?.OwnerID
            : undefined;
        if (ownerId && UUIDsEqual(ownerId, user.ID)) return true;
        return grantResult.Success && (grantResult.Results?.length ?? 0) > 0;
    }
}

/** Tree-shaking prevention — referenced from the custom/Permissions barrel. */
export function LoadMJCollectionPermissionEntityExtended(): void {
    // intentionally empty
}
