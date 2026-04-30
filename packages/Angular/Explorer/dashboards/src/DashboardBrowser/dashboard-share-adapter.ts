import { IMetadataProvider, Metadata } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DashboardEngine, MJDashboardPermissionEntity, MJUserEntity } from '@memberjunction/core-entities';
import {
    ResourceShareAdapter,
    ResourceShareContext,
    ResourceShareLevel,
    ResourceSharePermissionModel
} from '@memberjunction/ng-resource-permissions';

/**
 * Bridges {@link GenericShareDialogComponent} to the dashboard permission model.
 * `MJ: Dashboard Permissions` stores four independent `Can*` booleans; we fold
 * them into the dialog's three-tier `Level` enum and fan back out on save:
 *
 *   View  → CanRead only
 *   Edit  → CanRead + CanEdit
 *   Owner → CanRead + CanEdit + CanDelete + CanShare
 *
 * Refreshes the {@link DashboardEngine} cache after save so downstream
 * consumers see the new grants immediately.
 */
export class DashboardShareAdapter implements ResourceShareAdapter {
    private _provider: IMetadataProvider | null = null;
    public get Provider(): IMetadataProvider { return this._provider ?? Metadata.Provider; }
    public set Provider(value: IMetadataProvider | null) { this._provider = value; }

    async LoadShares(context: ResourceShareContext): Promise<ResourceSharePermissionModel[]> {
        const existing = DashboardEngine.Instance.GetDashboardShares(context.ResourceID);
        const rows: ResourceSharePermissionModel[] = [];
        const md = this.Provider;
        for (const permission of existing) {
            const user = await md.GetEntityObject<MJUserEntity>('MJ: Users');
            await user.Load(permission.UserID);
            rows.push({
                PermissionEntity: permission,
                UserID: permission.UserID,
                User: user,
                Level: this.flagsToLevel(permission),
                IsNew: false,
                MarkedForRemoval: false
            });
        }
        return rows;
    }

    async CreateShare(context: ResourceShareContext, user: MJUserEntity): Promise<ResourceSharePermissionModel> {
        const md = this.Provider;
        const permission = await md.GetEntityObject<MJDashboardPermissionEntity>('MJ: Dashboard Permissions');
        permission.NewRecord();
        permission.DashboardID = context.ResourceID;
        permission.UserID = user.ID;
        this.applyLevelToPermission(permission, 'View');
        if (context.CurrentUserID) {
            permission.SharedByUserID = context.CurrentUserID;
        }
        return {
            PermissionEntity: permission,
            UserID: user.ID,
            User: user,
            Level: 'View',
            IsNew: true,
            MarkedForRemoval: false
        };
    }

    SyncLevelToEntity(row: ResourceSharePermissionModel): void {
        this.applyLevelToPermission(row.PermissionEntity as MJDashboardPermissionEntity, row.Level);
    }

    async AfterSave(_context: ResourceShareContext): Promise<void> {
        await DashboardEngine.Instance.Config(true);
    }

    /** Resolve the owner's display name for a dashboard by owner user ID. */
    static resolveOwnerName(ownerUserID: string | null | undefined): string | null {
        if (!ownerUserID) return null;
        const dashboards = DashboardEngine.Instance.Dashboards;
        const match = dashboards.find((d) => d.UserID && UUIDsEqual(d.UserID, ownerUserID));
        return match?.User ?? null;
    }

    private flagsToLevel(permission: MJDashboardPermissionEntity): ResourceShareLevel {
        if (permission.CanDelete || permission.CanShare) return 'Owner';
        if (permission.CanEdit) return 'Edit';
        return 'View';
    }

    private applyLevelToPermission(permission: MJDashboardPermissionEntity, level: ResourceShareLevel): void {
        switch (level) {
            case 'Owner':
                permission.CanRead = true;
                permission.CanEdit = true;
                permission.CanDelete = true;
                permission.CanShare = true;
                break;
            case 'Edit':
                permission.CanRead = true;
                permission.CanEdit = true;
                permission.CanDelete = false;
                permission.CanShare = false;
                break;
            case 'View':
            default:
                permission.CanRead = true;
                permission.CanEdit = false;
                permission.CanDelete = false;
                permission.CanShare = false;
                break;
        }
    }
}
