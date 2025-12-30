import { ApplicationInfo, BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RegisterForStartup, UserInfo } from "@memberjunction/core";

/**
 * Status indicating why a user can or cannot access an application.
 * - 'installed_active': User has UserApplication record with IsActive=true
 * - 'installed_inactive': User has UserApplication record with IsActive=false
 * - 'not_installed': User has no UserApplication record for this app
 */
export type UserApplicationAccessStatus = 'installed_active' | 'installed_inactive' | 'not_installed';
import {
    UserNotificationEntity,
    WorkspaceEntity,
    UserApplicationEntity,
    UserFavoriteEntity,
    UserRecordLogEntity,
    UserSettingEntity
} from "../generated/entity_subclasses";

/**
 * UserInfoEngine is a singleton engine that provides centralized access to user-specific data
 * including notifications, workspaces, applications, favorites, and record logs.
 *
 * This engine consolidates multiple user-related RunView calls into a single batched load,
 * improving performance and enabling local caching for faster subsequent access.
 *
 * Usage:
 * ```typescript
 * // Get the instance (auto-configured on startup)
 * const engine = UserInfoEngine.Instance;
 *
 * // Access user data
 * const notifications = engine.UserNotifications;
 * const workspace = engine.CurrentWorkspace;
 * const apps = engine.UserApplications;
 * ```
 *
 * Note: This engine filters all data by the current user's ID automatically.
 * On the server side, you must call Config() with contextUser to specify which user's data to load.
 */
@RegisterForStartup()
export class UserInfoEngine extends BaseEngine<UserInfoEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application.
     * Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): UserInfoEngine {
        return super.getInstance<UserInfoEngine>();
    }

    // Private storage for entity data
    private _UserNotifications: UserNotificationEntity[] = [];
    private _Workspaces: WorkspaceEntity[] = [];
    private _UserApplications: UserApplicationEntity[] = [];
    private _UserFavorites: UserFavoriteEntity[] = [];
    private _UserRecordLogs: UserRecordLogEntity[] = [];
    private _UserSettings: UserSettingEntity[] = [];

    // Track the user ID we loaded data for
    private _loadedForUserId: string | null = null;

    /**
     * Configures the engine by loading user-specific metadata from the database.
     * All entities are filtered by the current user's ID and cached locally for performance.
     *
     * @param forceRefresh - If true, forces a refresh from the server even if data is cached
     * @param contextUser - The user context (required for server-side, auto-detected on client)
     * @param provider - Optional custom metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const md = new Metadata();
        const userId = contextUser?.ID || md.CurrentUser?.ID;

        if (!userId) {
            console.warn('UserInfoEngine: No user context available, skipping configuration');
            return;
        }

        // Check if we need to reload due to user change
        if (this._loadedForUserId && this._loadedForUserId !== userId) {
            forceRefresh = true; // Force refresh if user changed
        }

        const userFilter = `UserID='${userId}'`;

        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'User Notifications',
                PropertyName: '_UserNotifications',
                Filter: userFilter,
                OrderBy: '__mj_CreatedAt DESC',
                CacheLocal: true 
            },
            {
                Type: 'entity',
                EntityName: 'Workspaces',
                PropertyName: '_Workspaces',
                Filter: userFilter,
                CacheLocal: true 
            },
            {
                Type: 'entity',
                EntityName: 'MJ: User Settings',
                PropertyName: '_UserSettings',
                Filter: userFilter,
                CacheLocal: true 
            },
            {
                Type: 'entity',
                EntityName: 'User Applications',
                PropertyName: '_UserApplications',
                Filter: userFilter,
                OrderBy: 'Sequence, Application',
                CacheLocal: true 
            },
            {
                Type: 'entity',
                EntityName: 'User Favorites',
                PropertyName: '_UserFavorites',
                Filter: userFilter,
                OrderBy: '__mj_CreatedAt DESC',
                CacheLocal: true 
            },
            {
                Type: 'entity',
                EntityName: 'User Record Logs',
                PropertyName: '_UserRecordLogs',
                Filter: userFilter,
                OrderBy: 'LatestAt DESC',
                CacheLocal: true 
            }
        ];

        await super.Load(configs, provider, forceRefresh, contextUser);
        this._loadedForUserId = userId;
    }

    // ========================================================================
    // PUBLIC ACCESSORS
    // ========================================================================

    /**
     * Get all notifications for the current user, ordered by creation date (newest first)
     */
    public get UserNotifications(): UserNotificationEntity[] {
        return this._UserNotifications || [];
    }

    /**
     * Get all settings for the current user
     */
    public get UserSettings(): UserSettingEntity[] {
        return this._UserSettings || [];
    }

    /**
     * Get unread notifications for the current user
     */
    public get UnreadNotifications(): UserNotificationEntity[] {
        return this.UserNotifications.filter(n => n.Unread);
    }

    /**
     * Get the count of unread notifications
     */
    public get UnreadNotificationCount(): number {
        return this.UnreadNotifications.length;
    }

    /**
     * Get all workspaces for the current user
     */
    public get Workspaces(): WorkspaceEntity[] {
        return this._Workspaces || [];
    }

    /**
     * Get the current user's primary workspace (first one if multiple exist)
     */
    public get CurrentWorkspace(): WorkspaceEntity | null {
        return this._Workspaces?.length > 0 ? this._Workspaces[0] : null;
    }

    /**
     * Get all applications enabled for the current user, ordered by sequence
     */
    public get UserApplications(): UserApplicationEntity[] {
        return this._UserApplications || [];
    }

    /**
     * Get all favorites for the current user, ordered by creation date (newest first)
     */
    public get UserFavorites(): UserFavoriteEntity[] {
        return this._UserFavorites || [];
    }

    /**
     * Get all record logs for the current user (recent record access), ordered by LatestAt (most recent first)
     */
    public get UserRecordLogs(): UserRecordLogEntity[] {
        return this._UserRecordLogs || [];
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get a notification by ID
     * @param notificationId - The notification ID to find
     */
    public GetNotificationById(notificationId: string): UserNotificationEntity | undefined {
        return this.UserNotifications.find(n => n.ID === notificationId);
    }

    /**
     * Get a user application by application ID
     * @param applicationId - The application ID to find
     */
    public GetUserApplicationByAppId(applicationId: string): UserApplicationEntity | undefined {
        return this.UserApplications.find(ua => ua.ApplicationID === applicationId);
    }

    /**
     * Get favorites for a specific entity
     * @param entityId - The entity ID to filter by
     */
    public GetFavoritesForEntity(entityId: string): UserFavoriteEntity[] {
        return this.UserFavorites.filter(f => f.EntityID === entityId);
    }

    /**
     * Get recent record logs for a specific entity
     * @param entityId - The entity ID to filter by
     * @param maxItems - Maximum number of items to return (default: 10)
     */
    public GetRecentRecordsForEntity(entityId: string, maxItems: number = 10): UserRecordLogEntity[] {
        return this.UserRecordLogs
            .filter(r => r.EntityID === entityId)
            .slice(0, maxItems);
    }

    /**
     * Check if a record is in the user's favorites
     * @param entityId - The entity ID
     * @param recordId - The record ID
     */
    public IsRecordFavorite(entityId: string, recordId: string): boolean {
        return this.UserFavorites.some(f => f.EntityID === entityId && f.RecordID === recordId);
    }

    /**
     * Get the user ID this engine was loaded for
     */
    public get LoadedForUserId(): string | null {
        return this._loadedForUserId;
    }

    // ========================================================================
    // ACCESS CHECKING METHODS
    // ========================================================================

    /**
     * Check the user's access status for an application.
     * @param applicationId - The application ID to check
     * @returns The user's access status for this application
     */
    public CheckUserApplicationAccess(applicationId: string): UserApplicationAccessStatus {
        const userApp = this.GetUserApplicationByAppId(applicationId);

        if (!userApp) {
            return 'not_installed';
        }

        return userApp.IsActive ? 'installed_active' : 'installed_inactive';
    }

    /**
     * Check if an application is inactive in the system metadata.
     * @param applicationId - The application ID to check
     */
    public IsApplicationInactive(applicationId: string): boolean {
        const md = new Metadata();
        const appInfo = md.Applications.find(a => a.ID === applicationId);
        return appInfo != null && appInfo.Status !== 'Active';
    }

    /**
     * Get application info by ID from metadata.
     * @param applicationId - The application ID to find
     */
    public GetApplicationInfo(applicationId: string): ApplicationInfo | undefined {
        const md = new Metadata();
        return md.Applications.find(a => a.ID === applicationId);
    }

    /**
     * Find application info by path or name (case-insensitive).
     * @param pathOrName - The path or name to search for
     */
    public FindApplicationByPathOrName(pathOrName: string): ApplicationInfo | undefined {
        const normalized = pathOrName.trim().toLowerCase();
        const md = new Metadata();

        // First try path match
        const pathMatch = md.Applications.find(a =>
            a.Path?.toLowerCase() === normalized
        );
        if (pathMatch) {
            return pathMatch;
        }

        // Fallback to name match
        return md.Applications.find(a =>
            a.Name.trim().toLowerCase() === normalized
        );
    }

    /**
     * Force refresh all user data
     * @param contextUser - Optional user context for server-side use
     */
    public async Refresh(contextUser?: UserInfo): Promise<void> {
        await this.Config(true, contextUser);
    }

    // ========================================================================
    // APPLICATION MANAGEMENT METHODS
    // ========================================================================

    /**
     * Get only the active user applications (IsActive = true)
     */
    public get ActiveUserApplications(): UserApplicationEntity[] {
        return this.UserApplications.filter(ua => ua.IsActive);
    }

    /**
     * Check if user has a specific application installed (has UserApplication record)
     * @param applicationId - The application ID to check
     */
    public HasApplication(applicationId: string): boolean {
        return this.UserApplications.some(ua => ua.ApplicationID === applicationId);
    }

    /**
     * Check if user has a specific application active (installed AND IsActive = true)
     * @param applicationId - The application ID to check
     */
    public HasActiveApplication(applicationId: string): boolean {
        const userApp = this.GetUserApplicationByAppId(applicationId);
        return userApp != null && userApp.IsActive;
    }

    /**
     * Install an application for the current user by creating a UserApplication record.
     * The new record is automatically added to the cached UserApplications array.
     * @param applicationId - The application ID to install
     * @param contextUser - Optional user context for server-side use
     * @returns The newly created UserApplicationEntity, or null if failed
     */
    public async InstallApplication(applicationId: string, contextUser?: UserInfo): Promise<UserApplicationEntity | null> {
        const md = new Metadata();
        const userId = contextUser?.ID || md.CurrentUser?.ID;

        if (!userId) {
            console.error('UserInfoEngine.InstallApplication: No user context available');
            return null;
        }

        // Check if already installed
        if (this.HasApplication(applicationId)) {
            console.warn(`UserInfoEngine.InstallApplication: Application ${applicationId} is already installed`);
            return this.GetUserApplicationByAppId(applicationId) || null;
        }

        // Get the next sequence number
        const nextSequence = this.UserApplications.length;

        try {
            const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications', contextUser);
            userApp.NewRecord();
            userApp.UserID = userId;
            userApp.ApplicationID = applicationId;
            userApp.Sequence = nextSequence;
            userApp.IsActive = true;

            const saved = await userApp.Save();
            if (saved) {
                // Add to cached array
                this._UserApplications.push(userApp);
                console.log(`UserInfoEngine.InstallApplication: Installed application ${applicationId} for user ${userId}`);
                return userApp;
            } else {
                console.error('UserInfoEngine.InstallApplication: Failed to save:', userApp.LatestResult);
                return null;
            }
        } catch (error) {
            console.error('UserInfoEngine.InstallApplication: Error:', error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    /**
     * Enable a disabled application for the current user (set IsActive = true).
     * @param applicationId - The application ID to enable
     * @param contextUser - Optional user context for server-side use
     * @returns true if successful, false otherwise
     */
    public async EnableApplication(applicationId: string, contextUser?: UserInfo): Promise<boolean> {
        const userApp = this.GetUserApplicationByAppId(applicationId);

        if (!userApp) {
            console.warn(`UserInfoEngine.EnableApplication: No UserApplication record found for ${applicationId}`);
            return false;
        }

        if (userApp.IsActive) {
            console.log(`UserInfoEngine.EnableApplication: Application ${applicationId} is already active`);
            return true;
        }

        try {
            userApp.IsActive = true;
            const saved = await userApp.Save();
            if (saved) {
                console.log(`UserInfoEngine.EnableApplication: Enabled application ${applicationId}`);
                return true;
            } else {
                console.error('UserInfoEngine.EnableApplication: Failed to save:', userApp.LatestResult);
                return false;
            }
        } catch (error) {
            console.error('UserInfoEngine.EnableApplication: Error:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    /**
     * Disable an application for the current user (set IsActive = false).
     * This does not delete the UserApplication record, just deactivates it.
     * @param applicationId - The application ID to disable
     * @param contextUser - Optional user context for server-side use
     * @returns true if successful, false otherwise
     */
    public async DisableApplication(applicationId: string, contextUser?: UserInfo): Promise<boolean> {
        const userApp = this.GetUserApplicationByAppId(applicationId);

        if (!userApp) {
            console.warn(`UserInfoEngine.DisableApplication: No UserApplication record found for ${applicationId}`);
            return false;
        }

        if (!userApp.IsActive) {
            console.log(`UserInfoEngine.DisableApplication: Application ${applicationId} is already disabled`);
            return true;
        }

        try {
            userApp.IsActive = false;
            const saved = await userApp.Save();
            if (saved) {
                console.log(`UserInfoEngine.DisableApplication: Disabled application ${applicationId}`);
                return true;
            } else {
                console.error('UserInfoEngine.DisableApplication: Failed to save:', userApp.LatestResult);
                return false;
            }
        } catch (error) {
            console.error('UserInfoEngine.DisableApplication: Error:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    /**
     * Uninstall an application by deleting the UserApplication record.
     * @param applicationId - The application ID to uninstall
     * @param contextUser - Optional user context for server-side use
     * @returns true if successful, false otherwise
     */
    public async UninstallApplication(applicationId: string, contextUser?: UserInfo): Promise<boolean> {
        const userApp = this.GetUserApplicationByAppId(applicationId);

        if (!userApp) {
            console.warn(`UserInfoEngine.UninstallApplication: No UserApplication record found for ${applicationId}`);
            return false;
        }

        try {
            const deleted = await userApp.Delete();
            if (deleted) {
                // Remove from cached array
                const index = this._UserApplications.findIndex(ua => ua.ApplicationID === applicationId);
                if (index >= 0) {
                    this._UserApplications.splice(index, 1);
                }
                console.log(`UserInfoEngine.UninstallApplication: Uninstalled application ${applicationId}`);
                return true;
            } else {
                console.error('UserInfoEngine.UninstallApplication: Failed to delete:', userApp.LatestResult);
                return false;
            }
        } catch (error) {
            console.error('UserInfoEngine.UninstallApplication: Error:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    /**
     * Create default UserApplication records for apps marked with DefaultForNewUser=true.
     * This is called automatically when a user has no UserApplication records.
     * @param contextUser - Optional user context for server-side use
     * @returns Array of created UserApplicationEntity records
     */
    public async CreateDefaultApplications(contextUser?: UserInfo): Promise<UserApplicationEntity[]> {
        const md = new Metadata();
        const userId = contextUser?.ID || md.CurrentUser?.ID;

        if (!userId) {
            console.error('UserInfoEngine.CreateDefaultApplications: No user context available');
            return [];
        }

        // Filter to Active apps with DefaultForNewUser=true, sorted by DefaultSequence
        const defaultApps = md.Applications
            .filter(a => a.DefaultForNewUser && a.Status === 'Active')
            .sort((a, b) => (a.DefaultSequence ?? 100) - (b.DefaultSequence ?? 100));

        console.log(`UserInfoEngine.CreateDefaultApplications: Found ${defaultApps.length} default apps to install`);

        const createdUserApps: UserApplicationEntity[] = [];

        for (const [index, appInfo] of defaultApps.entries()) {
            try {
                const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications', contextUser);
                userApp.NewRecord();
                userApp.UserID = userId;
                userApp.ApplicationID = appInfo.ID;
                userApp.Sequence = index;
                userApp.IsActive = true;

                const saved = await userApp.Save();
                if (saved) {
                    this._UserApplications.push(userApp);
                    createdUserApps.push(userApp);
                    console.log(`UserInfoEngine.CreateDefaultApplications: Created UserApplication for ${appInfo.Name}`);
                } else {
                    console.error(`UserInfoEngine.CreateDefaultApplications: Failed to create for ${appInfo.Name}:`, userApp.LatestResult);
                }
            } catch (error) {
                console.error(`UserInfoEngine.CreateDefaultApplications: Error for ${appInfo.Name}:`, error instanceof Error ? error.message : String(error));
            }
        }

        return createdUserApps;
    }
}
