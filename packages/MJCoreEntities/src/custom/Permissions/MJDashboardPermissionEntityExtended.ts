import { BaseEntity, EntityPermissionType, EntitySaveOptions, IMetadataProvider, RunView } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';

import { DashboardEngine } from '../../engines/dashboards';
import { MJDashboardPermissionEntity } from '../../generated/entity_subclasses';
import {
    AsShareMetadataProvider,
    AssertCallerMayCreateShare,
    BuildActionsSummary,
    CheckShareManagePermission,
    DeriveSharePermissionLevel,
    DispatchShareNotificationAfterSave,
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
            if (user && CheckShareManagePermission(user, this.SharedByUserID, (userId) => this.isDashboardOwner(userId))) {
                return true;
            }
        }
        return super.CheckPermissions(type, throwError);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewShare = !this.IsSaved;
        const allowed = await AssertCallerMayCreateShare(
            this,
            isNewShare,
            () => this.callerMayShareDashboard(),
            'Only the dashboard owner or someone with Share permission on this dashboard can create a new share.'
        );
        if (!allowed) return false;

        const saved = await super.Save(options);
        if (saved) {
            await DispatchShareNotificationAfterSave(this, isNewShare, this.SharedByUserID, async (provider, grantorId) => {
                const dashboardName = this.Dashboard?.trim() ? this.Dashboard : await this.fetchDashboardName(provider);
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
                    ResourceTypeLabel: 'Dashboard',
                    ResourceTypeName: 'Dashboards',
                    ResourceName: dashboardName,
                    ResourceRecordID: this.DashboardID,
                    PermissionLevel: permissionLevel,
                    ActionsSummary: this.actionsSummary(),
                    ExtraConfiguration: {
                        type: 'dashboard',
                        dashboardId: this.DashboardID,
                        ResourceRecordID: this.DashboardID,
                        PermissionID: this.ID,
                        PermissionLevel: permissionLevel,
                    },
                };
            });
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
     * on the same dashboard with `CanShare=true`. Falls back to direct `RunView`
     * queries if `DashboardEngine.Instance` has not been loaded yet.
     */
    private async callerMayShareDashboard(): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!user) return false;
        if (this.isDashboardOwner(user.ID)) return true;
        if (DashboardEngine.Instance.DashboardPermissions.some(
            (p) =>
                UUIDsEqual(p.DashboardID, this.DashboardID) &&
                UUIDsEqual(p.UserID, user.ID) &&
                p.CanShare === true
        )) {
            return true;
        }

        const provider = AsShareMetadataProvider(this.ProviderToUse);
        if (!provider || !IsValidUUID(this.DashboardID)) {
            return false;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const escapedDashId = EscapeSQLString(this.DashboardID);
        const dashRes = await rv.RunView<{ ID: string; UserID?: string | null }>({
            EntityName: 'MJ: Dashboards',
            ExtraFilter: `ID='${escapedDashId}'`,
            Fields: ['ID', 'UserID'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        }, user);
        const ownerId = dashRes.Success ? dashRes.Results?.[0]?.UserID : null;
        if (ownerId && UUIDsEqual(ownerId, user.ID)) {
            return true;
        }

        const permRes = await rv.RunView<{ ID: string; CanShare?: boolean }>({
            EntityName: 'MJ: Dashboard Permissions',
            ExtraFilter: `DashboardID='${escapedDashId}' AND UserID='${EscapeSQLString(user.ID)}' AND CanShare=1`,
            Fields: ['ID', 'CanShare'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        }, user);
        return Boolean(permRes.Success && permRes.Results?.some((r) => r.CanShare === true));
    }

    private async fetchDashboardName(provider: IMetadataProvider): Promise<string | null> {
        const cached = DashboardEngine.Instance.Dashboards?.find((d) => UUIDsEqual(d.ID, this.DashboardID));
        if (cached?.Name) {
            return cached.Name;
        }
        if (!IsValidUUID(this.DashboardID)) {
            return null;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const res = await rv.RunView<{ ID: string; Name?: string | null }>({
            EntityName: 'MJ: Dashboards',
            ExtraFilter: `ID='${EscapeSQLString(this.DashboardID)}'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        }, this.ContextCurrentUser);
        return res.Success ? res.Results?.[0]?.Name ?? null : null;
    }

    private actionsSummary(): string {
        return BuildActionsSummary({
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
