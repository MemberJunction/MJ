import { BaseEntity, EntityPermissionType, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { DashboardEngine } from '../../engines/dashboards';
import { MJDashboardPermissionEntity } from '../../generated/entity_subclasses';
import {
    assertCallerMayCreateShare,
    buildActionsSummary,
    checkShareManagePermission,
    dispatchShareNotificationAfterSave,
} from './BaseShareEntityExtended';

/**
 * Extended Dashboard Permission entity. Adds two behaviors on top of the
 * generated base:
 *
 *  1. **CheckPermissions override** — grantor and dashboard owner can always
 *     Update/Delete their own grant. Without this, UI/Developer users can't
 *     revoke their own shares because neither role has `CanDelete` on
 *     `MJ: Dashboard Permissions`. The owner fallback also covers the
 *     `SharedByUserID IS NULL` legacy case.
 *
 *  2. **Save override** — notifies the grantee via the shared `CreateShareNotification`
 *     pipeline so `NotificationEngine` honors their in-app / email / SMS
 *     preferences uniformly.
 */
@RegisterClass(BaseEntity, 'MJ: Dashboard Permissions')
export class MJDashboardPermissionEntityExtended extends MJDashboardPermissionEntity {
    override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (type === EntityPermissionType.Update || type === EntityPermissionType.Delete) {
            const user = this.ActiveUser;
            if (user && checkShareManagePermission(user, this.SharedByUserID, (userId) => this.isDashboardOwner(userId))) {
                return true;
            }
        }
        return super.CheckPermissions(type, throwError);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewShare = !this.IsSaved;
        const allowed = await assertCallerMayCreateShare(
            this,
            isNewShare,
            () => this.callerMayShareDashboard(),
            'Only the dashboard owner or someone with Share permission on this dashboard can create a new share.'
        );
        if (!allowed) return false;

        const saved = await super.Save(options);
        if (saved) {
            await dispatchShareNotificationAfterSave(this, isNewShare, this.SharedByUserID, (provider, grantorId) => ({
                Provider: provider,
                ContextUser: this.ContextCurrentUser,
                GrantorUserID: grantorId,
                GranteeUserID: this.UserID,
                ResourceTypeLabel: 'Dashboard',
                ResourceTypeName: 'Dashboards',
                ResourceName: this.Dashboard ?? null,
                ResourceRecordID: this.DashboardID,
                ActionsSummary: this.actionsSummary(),
                ExtraConfiguration: { PermissionID: this.ID },
            }));
        }
        return saved;
    }

    private isDashboardOwner(userId: string): boolean {
        const dashboard = DashboardEngine.Instance.Dashboards.find((d) => UUIDsEqual(d.ID, this.DashboardID));
        return !!dashboard?.UserID && UUIDsEqual(dashboard.UserID, userId);
    }

    /**
     * Authorization for CREATING a new DashboardPermission row. Matches the
     * `MJResourcePermissionEntityExtended.callerMayGrantShare` pattern:
     * caller is either the dashboard owner, or holds an existing DashboardPermission
     * on the same dashboard with `CanShare=true`.
     */
    private callerMayShareDashboard(): boolean {
        const user = this.ContextCurrentUser;
        if (!user) return false;
        if (this.isDashboardOwner(user.ID)) return true;
        return DashboardEngine.Instance.DashboardPermissions.some(
            (p) =>
                UUIDsEqual(p.DashboardID, this.DashboardID) &&
                UUIDsEqual(p.UserID, user.ID) &&
                p.CanShare === true
        );
    }

    private actionsSummary(): string {
        return buildActionsSummary({
            view: this.CanRead,
            edit: this.CanEdit,
            delete: this.CanDelete,
            share: this.CanShare,
        });
    }
}

/** Tree-shaking prevention — referenced from the custom/Permissions barrel. */
export function LoadMJDashboardPermissionEntityExtended(): void {
    // intentionally empty
}
