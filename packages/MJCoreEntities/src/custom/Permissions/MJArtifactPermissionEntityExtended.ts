import { BaseEntity, EntityPermissionType, EntitySaveOptions, RunView } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { MJArtifactPermissionEntity } from '../../generated/entity_subclasses';
import {
    assertCallerMayCreateShare,
    buildActionsSummary,
    checkShareManagePermission,
    dispatchShareNotificationAfterSave,
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
            if (user && checkShareManagePermission(user, this.SharedByUserID)) return true;
        }
        return super.CheckPermissions(type, throwError);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewShare = !this.IsSaved;
        const allowed = await assertCallerMayCreateShare(
            this,
            isNewShare,
            () => this.callerMayShareArtifact(),
            'Only the artifact owner or someone with Share permission on this artifact can create a new share.'
        );
        if (!allowed) return false;

        const saved = await super.Save(options);
        if (saved) {
            await dispatchShareNotificationAfterSave(this, isNewShare, this.SharedByUserID, async (provider, grantorId) => {
                // The Artifact view doesn't denormalize Name onto the permission row — look it up.
                const artifactName = await this.fetchArtifactName();
                return {
                    Provider: provider,
                    ContextUser: this.ContextCurrentUser,
                    GrantorUserID: grantorId,
                    GranteeUserID: this.UserID,
                    ResourceTypeLabel: 'Artifact',
                    ResourceTypeName: 'Artifacts',
                    ResourceName: artifactName,
                    ResourceRecordID: this.ArtifactID,
                    ActionsSummary: this.actionsSummary(),
                    ExtraConfiguration: { PermissionID: this.ID },
                };
            });
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
     * Authorization for CREATING a new ArtifactPermission row.
     * Same pattern as MJDashboardPermissionEntityExtended.callerMayShareDashboard
     * but without an in-memory engine — we fetch the artifact and the caller's
     * existing grant row directly.
     */
    private async callerMayShareArtifact(): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!user) return false;
        const rv = new RunView();
        // One round-trip: fetch the artifact's owner AND any existing Share-capable
        // permission row for this caller on this artifact.
        const [ownerResult, grantResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID='${this.ArtifactID}'`,
                Fields: ['ID', 'UserID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Artifact Permissions',
                ExtraFilter: `ArtifactID='${this.ArtifactID}' AND UserID='${user.ID}' AND CanShare=1`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
        ]);
        const ownerId = ownerResult.Success
            ? (ownerResult.Results?.[0] as { UserID?: string } | undefined)?.UserID
            : undefined;
        if (ownerId && UUIDsEqual(ownerId, user.ID)) return true;
        return grantResult.Success && (grantResult.Results?.length ?? 0) > 0;
    }

    private async fetchArtifactName(): Promise<string | null> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string; Name?: string | null }>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID='${this.ArtifactID}'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        return result.Success ? result.Results?.[0]?.Name ?? null : null;
    }
}

/** Tree-shaking prevention — referenced from the custom/Permissions barrel. */
export function LoadMJArtifactPermissionEntityExtended(): void {
    // intentionally empty
}
