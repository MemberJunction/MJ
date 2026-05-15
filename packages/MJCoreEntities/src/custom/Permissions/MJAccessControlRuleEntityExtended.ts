import { BaseEntity, EntityPermissionType, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';

import { MJAccessControlRuleEntity } from '../../generated/entity_subclasses';
import {
    buildActionsSummary,
    checkShareManagePermission,
    dispatchShareNotificationAfterSave,
} from './BaseShareEntityExtended';

/**
 * Extended Access Control Rule entity — same dual-purpose pattern as
 * {@link MJDashboardPermissionEntityExtended}, with two differences:
 *
 *  - Uses `GrantedByUserID` instead of `SharedByUserID` (ACR column naming).
 *  - Only notifies when `GranteeType === 'User'` and `GranteeID` is populated.
 *    Role / Everyone / Public grants don't have a single identifiable recipient,
 *    so the payload builder returns `null` to skip.
 *
 * Notifications use the generic `Records` Resource Type from the catalog because
 * ACRs target arbitrary entities — there's no single ResourceType that fits.
 */
@RegisterClass(BaseEntity, 'MJ: Access Control Rules')
export class MJAccessControlRuleEntityExtended extends MJAccessControlRuleEntity {
    override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (type === EntityPermissionType.Update || type === EntityPermissionType.Delete) {
            const user = this.ActiveUser;
            if (user && checkShareManagePermission(user, this.GrantedByUserID)) return true;
        }
        return super.CheckPermissions(type, throwError);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewShare = !this.IsSaved;
        const saved = await super.Save(options);
        if (saved) {
            await dispatchShareNotificationAfterSave(this, isNewShare, this.GrantedByUserID, (provider, grantorId) => {
                // Only user grantees get individual notifications.
                if (this.GranteeType !== 'User' || !this.GranteeID) return null;

                const entityInfo = provider.EntityByID(this.EntityID);
                return {
                    Provider: provider,
                    ContextUser: this.ContextCurrentUser,
                    GrantorUserID: grantorId,
                    GranteeUserID: this.GranteeID,
                    ResourceTypeLabel: entityInfo?.Name ?? 'Record',
                    ResourceTypeName: 'Records',
                    ResourceName: null,
                    ResourceRecordID: this.RecordID,
                    ActionsSummary: this.actionsSummary(),
                    ExtraConfiguration: { AccessControlRuleID: this.ID, EntityID: this.EntityID },
                };
            });
        }
        return saved;
    }

    private actionsSummary(): string {
        return buildActionsSummary({
            view: this.CanRead,
            create: this.CanCreate,
            edit: this.CanUpdate,
            delete: this.CanDelete,
            share: this.CanShare,
        });
    }
}

/** Tree-shaking prevention — referenced from the custom/Permissions barrel. */
export function LoadMJAccessControlRuleEntityExtended(): void {
    // intentionally empty
}
