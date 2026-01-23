import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, IStartupSink, RegisterForStartup, UserInfo } from "@memberjunction/core";
import { DashboardEntityExtended } from "../custom/DashboardEntityExtended";
import {
    DashboardCategoryEntity,
    DashboardPartTypeEntity,
    DashboardUserPreferenceEntity,
    DashboardUserStateEntity,
    DashboardPermissionEntity,
    DashboardCategoryPermissionEntity,
    DashboardCategoryLinkEntity
} from "../generated/entity_subclasses";

/**
 * Represents the effective permissions a user has on a dashboard
 */
export interface DashboardUserPermissions {
    /** The dashboard ID these permissions apply to */
    DashboardID: string;
    /** Whether the user can view the dashboard */
    CanRead: boolean;
    /** Whether the user can modify the dashboard */
    CanEdit: boolean;
    /** Whether the user can delete the dashboard */
    CanDelete: boolean;
    /** Whether the user can share the dashboard with others */
    CanShare: boolean;
    /** Whether the user is the owner of the dashboard */
    IsOwner: boolean;
    /** Source of the permission: 'owner', 'direct', 'category', or 'none' */
    PermissionSource: 'owner' | 'direct' | 'category' | 'none';
}

/**
 * Represents the effective permissions a user has on a dashboard category
 */
export interface DashboardCategoryUserPermissions {
    /** The category ID these permissions apply to */
    CategoryID: string;
    /** Whether the user can view dashboards in the category */
    CanRead: boolean;
    /** Whether the user can modify dashboards in the category */
    CanEdit: boolean;
    /** Whether the user can add/remove dashboards in the category */
    CanAddRemove: boolean;
    /** Whether the user can share the category with others */
    CanShare: boolean;
    /** Whether the user is the owner of the category */
    IsOwner: boolean;
    /** Source of the permission: 'owner', 'direct', or 'none' */
    PermissionSource: 'owner' | 'direct' | 'none';
}

/**
 * Caching of metadata for dashboards and related data, including permission management
 */
@RegisterForStartup()
export class DashboardEngine extends BaseEngine<DashboardEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): DashboardEngine {
       return super.getInstance<DashboardEngine>();
    }

    private _dashboards: DashboardEntityExtended[] = [];
    private _partTypes: DashboardPartTypeEntity[] = [];
    private _dashboardUserPreferences: DashboardUserPreferenceEntity[] = [];
    private _dashboardCategories: DashboardCategoryEntity[] = [];
    private _dashboardUserStates: DashboardUserStateEntity[] = [];
    private _dashboardPermissions: DashboardPermissionEntity[] = [];
    private _dashboardCategoryPermissions: DashboardCategoryPermissionEntity[] = [];
    private _dashboardCategoryLinks: DashboardCategoryLinkEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: "MJ: Dashboard Part Types",
                PropertyName: "_partTypes",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'Dashboards',
                PropertyName: "_dashboards",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Dashboard User Preferences',
                PropertyName: "_dashboardUserPreferences",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'Dashboard Categories',
                PropertyName: "_dashboardCategories",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Dashboard User States',
                PropertyName: "_dashboardUserStates",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Dashboard Permissions',
                PropertyName: "_dashboardPermissions",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Dashboard Category Permissions',
                PropertyName: "_dashboardCategoryPermissions",
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Dashboard Category Links',
                PropertyName: "_dashboardCategoryLinks",
                CacheLocal: true
            }
        ]
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    // ========================================
    // Getters for cached data
    // ========================================

    public get Dashboards(): DashboardEntityExtended[] {
        return this._dashboards;
    }

    public get DashboardPartTypes(): DashboardPartTypeEntity[] {
        return this._partTypes;
    }

    public get DashboardUserPreferences(): DashboardUserPreferenceEntity[] {
        return this._dashboardUserPreferences;
    }

    public get DashboardCategories(): DashboardCategoryEntity[] {
        return this._dashboardCategories;
    }

    public get DashboardUserStates(): DashboardUserStateEntity[] {
        return this._dashboardUserStates;
    }

    public get DashboardPermissions(): DashboardPermissionEntity[] {
        return this._dashboardPermissions;
    }

    public get DashboardCategoryPermissions(): DashboardCategoryPermissionEntity[] {
        return this._dashboardCategoryPermissions;
    }

    public get DashboardCategoryLinks(): DashboardCategoryLinkEntity[] {
        return this._dashboardCategoryLinks;
    }

    // ========================================
    // Permission Checking Methods
    // ========================================

    /**
     * Gets the effective permissions for a user on a specific dashboard.
     * Permission priority: Owner > Direct Permission > Category Permission
     * @param dashboardId - The ID of the dashboard
     * @param userId - The ID of the user to check permissions for
     * @returns The effective permissions for the user on this dashboard
     */
    public GetDashboardPermissions(dashboardId: string, userId: string): DashboardUserPermissions {
        const dashboard = this._dashboards.find(d => d.ID === dashboardId);

        // Default: no permissions
        const noPermissions: DashboardUserPermissions = {
            DashboardID: dashboardId,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            IsOwner: false,
            PermissionSource: 'none'
        };

        if (!dashboard) {
            return noPermissions;
        }

        // Check if user is the owner - owners have full permissions
        if (dashboard.UserID === userId) {
            return {
                DashboardID: dashboardId,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                IsOwner: true,
                PermissionSource: 'owner'
            };
        }

        // Check for direct dashboard permission
        const directPermission = this._dashboardPermissions.find(
            p => p.DashboardID === dashboardId && p.UserID === userId
        );

        if (directPermission) {
            return {
                DashboardID: dashboardId,
                CanRead: directPermission.CanRead,
                CanEdit: directPermission.CanEdit,
                CanDelete: directPermission.CanDelete,
                CanShare: directPermission.CanShare,
                IsOwner: false,
                PermissionSource: 'direct'
            };
        }

        // Check for category-level permission (if dashboard has a category)
        if (dashboard.CategoryID) {
            const categoryPermission = this.GetCategoryPermissions(dashboard.CategoryID, userId);
            if (categoryPermission.PermissionSource !== 'none') {
                return {
                    DashboardID: dashboardId,
                    CanRead: categoryPermission.CanRead,
                    CanEdit: categoryPermission.CanEdit,
                    // Category permissions don't grant delete on individual dashboards
                    CanDelete: false,
                    CanShare: false,
                    IsOwner: false,
                    PermissionSource: 'category'
                };
            }
        }

        return noPermissions;
    }

    /**
     * Gets the effective permissions for a user on a specific dashboard category.
     * @param categoryId - The ID of the category
     * @param userId - The ID of the user to check permissions for
     * @returns The effective permissions for the user on this category
     */
    public GetCategoryPermissions(categoryId: string, userId: string): DashboardCategoryUserPermissions {
        const category = this._dashboardCategories.find(c => c.ID === categoryId);

        // Default: no permissions
        const noPermissions: DashboardCategoryUserPermissions = {
            CategoryID: categoryId,
            CanRead: false,
            CanEdit: false,
            CanAddRemove: false,
            CanShare: false,
            IsOwner: false,
            PermissionSource: 'none'
        };

        if (!category) {
            return noPermissions;
        }

        // Check if user is the owner - owners have full permissions
        if (category.UserID === userId) {
            return {
                CategoryID: categoryId,
                CanRead: true,
                CanEdit: true,
                CanAddRemove: true,
                CanShare: true,
                IsOwner: true,
                PermissionSource: 'owner'
            };
        }

        // Check for direct category permission
        const directPermission = this._dashboardCategoryPermissions.find(
            p => p.DashboardCategoryID === categoryId && p.UserID === userId
        );

        if (directPermission) {
            return {
                CategoryID: categoryId,
                CanRead: directPermission.CanRead,
                CanEdit: directPermission.CanEdit,
                CanAddRemove: directPermission.CanAddRemove,
                CanShare: directPermission.CanShare,
                IsOwner: false,
                PermissionSource: 'direct'
            };
        }

        return noPermissions;
    }

    /**
     * Checks if a user can read/view a dashboard
     * @param dashboardId - The ID of the dashboard
     * @param userId - The ID of the user
     * @returns true if the user can read the dashboard
     */
    public CanUserReadDashboard(dashboardId: string, userId: string): boolean {
        return this.GetDashboardPermissions(dashboardId, userId).CanRead;
    }

    /**
     * Checks if a user can edit a dashboard
     * @param dashboardId - The ID of the dashboard
     * @param userId - The ID of the user
     * @returns true if the user can edit the dashboard
     */
    public CanUserEditDashboard(dashboardId: string, userId: string): boolean {
        return this.GetDashboardPermissions(dashboardId, userId).CanEdit;
    }

    /**
     * Checks if a user can delete a dashboard
     * @param dashboardId - The ID of the dashboard
     * @param userId - The ID of the user
     * @returns true if the user can delete the dashboard
     */
    public CanUserDeleteDashboard(dashboardId: string, userId: string): boolean {
        return this.GetDashboardPermissions(dashboardId, userId).CanDelete;
    }

    /**
     * Checks if a user can share a dashboard
     * @param dashboardId - The ID of the dashboard
     * @param userId - The ID of the user
     * @returns true if the user can share the dashboard
     */
    public CanUserShareDashboard(dashboardId: string, userId: string): boolean {
        return this.GetDashboardPermissions(dashboardId, userId).CanShare;
    }

    /**
     * Gets all dashboards the user has read access to (owned or shared)
     * @param userId - The ID of the user
     * @returns Array of dashboards the user can read
     */
    public GetAccessibleDashboards(userId: string): DashboardEntityExtended[] {
        return this._dashboards.filter(dashboard =>
            this.CanUserReadDashboard(dashboard.ID, userId)
        );
    }

    /**
     * Gets all dashboard category links for a user (shared dashboards linked to their folder structure)
     * @param userId - The ID of the user
     * @returns Array of category links for the user
     */
    public GetUserCategoryLinks(userId: string): DashboardCategoryLinkEntity[] {
        return this._dashboardCategoryLinks.filter(link => link.UserID === userId);
    }

    /**
     * Gets the dashboards shared with a specific user (excludes owned dashboards)
     * @param userId - The ID of the user
     * @returns Array of dashboards shared with the user
     */
    public GetSharedDashboards(userId: string): DashboardEntityExtended[] {
        return this._dashboards.filter(dashboard => {
            // Exclude owned dashboards
            if (dashboard.UserID === userId) {
                return false;
            }
            // Check if user has read permission
            return this.CanUserReadDashboard(dashboard.ID, userId);
        });
    }

    /**
     * Gets the users a dashboard is shared with and their permissions
     * @param dashboardId - The ID of the dashboard
     * @returns Array of permission records for this dashboard
     */
    public GetDashboardShares(dashboardId: string): DashboardPermissionEntity[] {
        return this._dashboardPermissions.filter(p => p.DashboardID === dashboardId);
    }

    /**
     * Gets the users a category is shared with and their permissions
     * @param categoryId - The ID of the category
     * @returns Array of permission records for this category
     */
    public GetCategoryShares(categoryId: string): DashboardCategoryPermissionEntity[] {
        return this._dashboardCategoryPermissions.filter(p => p.DashboardCategoryID === categoryId);
    }

    /**
     * Checks if a user can access a category (view it in their category list).
     * A user can access a category if they:
     * 1. Own the category (category.UserID === userId)
     * 2. Have direct permission on the category
     * @param categoryId - The ID of the category
     * @param userId - The ID of the user
     * @returns true if the user can access the category
     */
    public CanUserAccessCategory(categoryId: string, userId: string): boolean {
        const permissions = this.GetCategoryPermissions(categoryId, userId);
        return permissions.PermissionSource !== 'none';
    }

    /**
     * Gets all categories the user has access to (owned or shared).
     * Only returns categories the user explicitly owns or has permissions on.
     * @param userId - The ID of the user
     * @returns Array of categories the user can access
     */
    public GetAccessibleCategories(userId: string): DashboardCategoryEntity[] {
        return this._dashboardCategories.filter(category =>
            this.CanUserAccessCategory(category.ID, userId)
        );
    }
}
