import { ApplicationInfo, BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RegisterForStartup, UserInfo, RunView } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";

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
    UserSettingEntity,
    UserNotificationTypeEntity,
    UserNotificationPreferenceEntity
} from "../generated/entity_subclasses";

export interface CachedUserNotificationPreference {
    ID: string;
    UserID: string;
    NotificationTypeID: string;
    Enabled: boolean;
    InAppEnabled: boolean | null;
    EmailEnabled: boolean | null;
    SMSEnabled: boolean | null;
}

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

    private static readonly CACHE_KEY_NOTIFICATION_TYPES = 'MJ_NotificationTypes';
    private static readonly CACHE_KEY_NOTIFICATION_TYPES_BY_ID = 'MJ_NotificationTypesById';
    private static readonly CACHE_KEY_NOTIFICATION_TYPES_BY_NAME = 'MJ_NotificationTypesByName';

    // Private storage for entity data
    private _UserNotifications: UserNotificationEntity[] = [];
    private _Workspaces: WorkspaceEntity[] = [];
    private _UserApplications: UserApplicationEntity[] = [];
    private _UserFavorites: UserFavoriteEntity[] = [];
    private _UserRecordLogs: UserRecordLogEntity[] = [];
    private _UserSettings: UserSettingEntity[] = [];

    // Notification metadata
    private _NotificationTypes: UserNotificationTypeEntity[] = [];
    private _UserNotificationPreferences: CachedUserNotificationPreference[] = [];

    // Notification type lookups
    private _notificationTypesByName: Map<string, UserNotificationTypeEntity> = new Map();
    private _notificationTypesById: Map<string, UserNotificationTypeEntity> = new Map();

    // Track the user ID we loaded data for
    private _loadedForUserId: string | null = null;

    // Track in-progress CreateDefaultApplications call to prevent duplicate execution
    private _createDefaultAppsPromise: Promise<UserApplicationEntity[]> | null = null;

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

        // Note: We intentionally do NOT use Filter or OrderBy in configs.
        // This allows BaseEngine to use immediate array mutations for better performance.
        // Filtering by user and sorting is done in the getter methods instead.
        // This also makes the engine reusable for server-side admin scenarios where
        // all users' data might be needed.
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'User Notifications',
                PropertyName: '_UserNotifications',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'Workspaces',
                PropertyName: '_Workspaces',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: User Settings',
                PropertyName: '_UserSettings',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'User Applications',
                PropertyName: '_UserApplications',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'User Favorites',
                PropertyName: '_UserFavorites',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'User Record Logs',
                PropertyName: '_UserRecordLogs',
                CacheLocal: true
            }
        ];

        await super.Load(configs, provider, forceRefresh, contextUser);
        this._loadedForUserId = userId;

        // Load global notification types into cache (shared across all users)
        await this.ensureNotificationTypesLoaded(contextUser);

        // Load user-specific notification preferences
        const prefRV = new RunView();
        const prefResult = await prefRV.RunView<UserNotificationPreferenceEntity>({
            EntityName: 'MJ: User Notification Preferences',
            ExtraFilter: `UserID='${userId}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (prefResult.Success) {
            // Convert entity objects to plain cached objects
            this._UserNotificationPreferences = (prefResult.Results || []).map(p => ({
                ID: p.ID,
                UserID: p.UserID,
                NotificationTypeID: p.NotificationTypeID,
                Enabled: p.Enabled,
                InAppEnabled: p.InAppEnabled,
                EmailEnabled: p.EmailEnabled,
                SMSEnabled: p.SMSEnabled
            }));
        }
    }

    // ========================================================================
    // PUBLIC ACCESSORS
    // ========================================================================

    /**
     * Get all notifications for the current user, ordered by creation date (newest first)
     */
    public get UserNotifications(): UserNotificationEntity[] {
        if (!this._loadedForUserId) return [];
        return (this._UserNotifications || [])
            .filter(n => n.UserID === this._loadedForUserId)
            .sort((a, b) => new Date(b.Get('__mj_CreatedAt')).getTime() - new Date(a.Get('__mj_CreatedAt')).getTime());
    }

    /**
     * Get all settings for the current user
     */
    public get UserSettings(): UserSettingEntity[] {
        if (!this._loadedForUserId) return [];
        return (this._UserSettings || []).filter(s => s.UserID === this._loadedForUserId);
    }

    /**
     * Get a user setting value by key.
     * @param settingKey - The setting key to find (e.g., "default-view-setting/Contacts")
     * @returns The setting value string, or undefined if not found
     */
    public GetSetting(settingKey: string): string | undefined {
        const setting = this.UserSettings.find(s => s.Setting === settingKey);
        return setting?.Value ?? undefined;
    }

    /**
     * Get a user setting entity by key.
     * @param settingKey - The setting key to find
     * @returns The UserSettingEntity, or undefined if not found
     */
    public GetSettingEntity(settingKey: string): UserSettingEntity | undefined {
        return this.UserSettings.find(s => s.Setting === settingKey);
    }

    /**
     * Set a user setting by key. Creates a new setting if it doesn't exist.
     * @param settingKey - The setting key (e.g., "default-view-setting/Contacts")
     * @param value - The setting value (string, typically JSON for complex data)
     * @param contextUser - Optional user context for server-side use
     * @returns true if successful, false otherwise
     */
    public async SetSetting(settingKey: string, value: string, contextUser?: UserInfo): Promise<boolean> {
        const md = new Metadata();
        const userId = contextUser?.ID || md.CurrentUser?.ID;

        if (!userId) {
            console.error('UserInfoEngine.SetSetting: No user context available');
            return false;
        }

        try {
            // Try to find existing setting
            let setting = this.GetSettingEntity(settingKey);

            if (setting) {
                // Update existing setting
                setting.Value = value;
            } else {
                // Create new setting
                setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings', contextUser);
                setting.NewRecord();
                setting.UserID = userId;
                setting.Setting = settingKey;
                setting.Value = value;
            }

            const saved = await setting.Save();
            if (saved) {
                // If it was a new record, add to cache
                if (!this._UserSettings.some(s => s.ID === setting!.ID)) {
                    this._UserSettings.push(setting);
                }
                return true;
            } else {
                console.error('UserInfoEngine.SetSetting: Failed to save:', setting.LatestResult?.Message);
                return false;
            }
        } catch (error) {
            console.error('UserInfoEngine.SetSetting: Error:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    /**
     * Delete a user setting by key.
     * @param settingKey - The setting key to delete
     * @returns true if successful (or setting didn't exist), false on error
     */
    public async DeleteSetting(settingKey: string): Promise<boolean> {
        const setting = this.GetSettingEntity(settingKey);

        if (!setting) {
            // Setting doesn't exist, consider it a success
            return true;
        }

        try {
            const deleted = await setting.Delete();
            if (deleted) {
                // Remove from cache
                const index = this._UserSettings.findIndex(s => s.ID === setting.ID);
                if (index >= 0) {
                    this._UserSettings.splice(index, 1);
                }
                return true;
            } else {
                console.error('UserInfoEngine.DeleteSetting: Failed to delete:', setting.LatestResult?.Message);
                return false;
            }
        } catch (error) {
            console.error('UserInfoEngine.DeleteSetting: Error:', error instanceof Error ? error.message : String(error));
            return false;
        }
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
        if (!this._loadedForUserId) return [];
        return (this._Workspaces || []).filter(w => w.UserID === this._loadedForUserId);
    }

    /**
     * Get the current user's primary workspace (first one if multiple exist)
     */
    public get CurrentWorkspace(): WorkspaceEntity | null {
        const workspaces = this.Workspaces;
        return workspaces.length > 0 ? workspaces[0] : null;
    }

    /**
     * Get all applications enabled for the current user, ordered by sequence then application name
     */
    public get UserApplications(): UserApplicationEntity[] {
        if (!this._loadedForUserId) return [];
        return (this._UserApplications || [])
            .filter(ua => ua.UserID === this._loadedForUserId)
            .sort((a, b) => {
                // Sort by Sequence first, then by Application name
                if (a.Sequence !== b.Sequence) {
                    return a.Sequence - b.Sequence;
                }
                return (a.Application || '').localeCompare(b.Application || '');
            });
    }

    /**
     * Get all favorites for the current user, ordered by creation date (newest first)
     */
    public get UserFavorites(): UserFavoriteEntity[] {
        if (!this._loadedForUserId) return [];
        return (this._UserFavorites || [])
            .filter(f => f.UserID === this._loadedForUserId)
            .sort((a, b) => new Date(b.Get('__mj_CreatedAt')).getTime() - new Date(a.Get('__mj_CreatedAt')).getTime());
    }

    /**
     * Get all record logs for the current user (recent record access), ordered by LatestAt (most recent first)
     */
    public get UserRecordLogs(): UserRecordLogEntity[] {
        if (!this._loadedForUserId) return [];
        return (this._UserRecordLogs || [])
            .filter(r => r.UserID === this._loadedForUserId)
            .sort((a, b) => new Date(b.LatestAt).getTime() - new Date(a.LatestAt).getTime());
    }

    // ========================================================================
    // RAW DATA ACCESSORS (unfiltered, for admin/server scenarios)
    // ========================================================================

    /**
     * Get ALL notifications in the cache (unfiltered by user).
     * Useful for server-side admin scenarios.
     */
    public get AllNotifications(): UserNotificationEntity[] {
        return this._UserNotifications || [];
    }

    /**
     * Get ALL user applications in the cache (unfiltered by user).
     * Useful for server-side admin scenarios.
     */
    public get AllUserApplications(): UserApplicationEntity[] {
        return this._UserApplications || [];
    }

    /**
     * Get notifications for a specific user
     * @param userId - The user ID to filter by
     */
    public GetNotificationsForUser(userId: string): UserNotificationEntity[] {
        return (this._UserNotifications || [])
            .filter(n => n.UserID === userId)
            .sort((a, b) => new Date(b.Get('__mj_CreatedAt')).getTime() - new Date(a.Get('__mj_CreatedAt')).getTime());
    }

    /**
     * Get user applications for a specific user
     * @param userId - The user ID to filter by
     */
    public GetUserApplicationsForUser(userId: string): UserApplicationEntity[] {
        return (this._UserApplications || [])
            .filter(ua => ua.UserID === userId)
            .sort((a, b) => {
                if (a.Sequence !== b.Sequence) {
                    return a.Sequence - b.Sequence;
                }
                return (a.Application || '').localeCompare(b.Application || '');
            });
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
     *
     * This method is safe to call multiple times concurrently - it will return the same
     * promise if already in progress, and will skip apps that already have UserApplication records.
     *
     * @param contextUser - Optional user context for server-side use
     * @returns Array of created UserApplicationEntity records
     */
    public async CreateDefaultApplications(contextUser?: UserInfo): Promise<UserApplicationEntity[]> {
        // If already in progress, return the existing promise to prevent duplicate execution
        if (this._createDefaultAppsPromise) {
            console.log('UserInfoEngine.CreateDefaultApplications: Already in progress, returning existing promise');
            return this._createDefaultAppsPromise;
        }

        // Create and store the promise, then clear it when done
        this._createDefaultAppsPromise = this.doCreateDefaultApplications(contextUser);

        try {
            return await this._createDefaultAppsPromise;
        } finally {
            // Clear the promise when done (success or failure)
            this._createDefaultAppsPromise = null;
        }
    }

    /**
     * Internal implementation of CreateDefaultApplications.
     * Separated to allow the public method to manage the promise state.
     */
    private async doCreateDefaultApplications(contextUser?: UserInfo): Promise<UserApplicationEntity[]> {
        const md = new Metadata();
        const userId = contextUser?.ID || md.CurrentUser?.ID;

        if (!userId) {
            console.error('UserInfoEngine.CreateDefaultApplications: No user context available');
            return [];
        }

        // Get existing UserApplication records for this user to prevent duplicates
        const existingAppIds = new Set(
            this._UserApplications
                .filter(ua => ua.UserID === userId)
                .map(ua => ua.ApplicationID)
        );

        // Filter to Active apps with DefaultForNewUser=true, sorted by DefaultSequence
        // Exclude apps that already have UserApplication records
        const defaultApps = md.Applications
            .filter(a => a.DefaultForNewUser && a.Status === 'Active' && !existingAppIds.has(a.ID))
            .sort((a, b) => (a.DefaultSequence ?? 100) - (b.DefaultSequence ?? 100));

        if (defaultApps.length === 0) {
            console.log('UserInfoEngine.CreateDefaultApplications: No new apps to install (all defaults already exist)');
            return [];
        }

        console.log(`UserInfoEngine.CreateDefaultApplications: Found ${defaultApps.length} default apps to install`);

        const createdUserApps: UserApplicationEntity[] = [];

        // Calculate starting sequence based on existing apps
        const maxExistingSequence = this._UserApplications
            .filter(ua => ua.UserID === userId)
            .reduce((max, ua) => Math.max(max, ua.Sequence), -1);

        for (const [index, appInfo] of defaultApps.entries()) {
            try {
                const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications', contextUser);
                userApp.NewRecord();
                userApp.UserID = userId;
                userApp.ApplicationID = appInfo.ID;
                userApp.Sequence = maxExistingSequence + 1 + index;
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

    // ========================================================================
    // NOTIFICATION TYPE METHODS
    // ========================================================================

    private async ensureNotificationTypesLoaded(contextUser?: UserInfo): Promise<void> {
        // Check if already cached globally
        const cached = MJGlobal.Instance.ObjectCache.Find<UserNotificationTypeEntity[]>(
            UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES
        );

        //for cache hits

        if (cached && cached.length > 0) {
            // Already loaded - set local references
            this._NotificationTypes = cached;

            // Restore lookup maps from global cache
            this._notificationTypesById = MJGlobal.Instance.ObjectCache.Find<Map<string, UserNotificationTypeEntity>>(
                UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES_BY_ID
            ) || new Map();

            this._notificationTypesByName = MJGlobal.Instance.ObjectCache.Find<Map<string, UserNotificationTypeEntity>>(
                UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES_BY_NAME
            ) || new Map();

            return; // Already cached, nothing to do
        }

        // Skip database load if no context user - will load on first authenticated user request
        // This prevents errors during server startup when @RegisterForStartup calls Config()
        if (!contextUser) {
            console.log('UserInfoEngine: Skipping notification types load - no user context (will load on first authenticated request)');
            return;
        }

        //Below are for cache misses

        // Load from database (first time only, with valid user context)
        const rv = new RunView();
        const result = await rv.RunView<UserNotificationTypeEntity>({
            EntityName: 'MJ: User Notification Types',
            ResultType: 'entity_object',
            OrderBy: 'Name'
        }, contextUser);

        if (result.Success) {
            const types = result.Results || [];

            // Build lookup maps
            const byId = new Map<string, UserNotificationTypeEntity>();
            const byName = new Map<string, UserNotificationTypeEntity>();

            for (const type of types) {
                byId.set(type.ID, type);
                byName.set(type.Name.toLowerCase(), type);
            }

            // Store in global cache (persists across user switches)
            MJGlobal.Instance.ObjectCache.Replace(UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES, types);
            MJGlobal.Instance.ObjectCache.Replace(UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES_BY_ID, byId);
            MJGlobal.Instance.ObjectCache.Replace(UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES_BY_NAME, byName);

            // Set local references
            this._NotificationTypes = types;
            this._notificationTypesById = byId;
            this._notificationTypesByName = byName;
        }
    }

    /**
     * Clears the global notification types cache.
     * Likely an admin feature but can be done with metadata->mj sync
     */
    public static ClearNotificationTypesCache(): void {
        MJGlobal.Instance.ObjectCache.Remove(UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES);
        MJGlobal.Instance.ObjectCache.Remove(UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES_BY_ID);
        MJGlobal.Instance.ObjectCache.Remove(UserInfoEngine.CACHE_KEY_NOTIFICATION_TYPES_BY_NAME);
    }

    /**
     * Fast O(1) lookup of notification type by ID
     */
    public GetNotificationTypeById(id: string): UserNotificationTypeEntity | undefined {
        return this._notificationTypesById.get(id);
    }

    /**
     * Fast O(1) lookup of notification type by name (case-insensitive)
     */
    public GetNotificationTypeByName(name: string): UserNotificationTypeEntity | undefined {
        return this._notificationTypesByName.get(name.toLowerCase());
    }

    /**
     * Get notification type by either ID or name
     */
    public GetNotificationType(idOrName: string): UserNotificationTypeEntity | undefined {
        return this.GetNotificationTypeById(idOrName) ||
               this.GetNotificationTypeByName(idOrName);
    }

    /**
     * Get all notification types (global, not user-specific)
     */
    public get NotificationTypes(): UserNotificationTypeEntity[] {
        return this._NotificationTypes || [];
    }

    /**
     * Get all notification preferences for the current user
     */
    public get NotificationPreferences(): CachedUserNotificationPreference[] {
        if (!this._loadedForUserId) return [];
        return (this._UserNotificationPreferences || []).filter(p => p.UserID === this._loadedForUserId);
    }

    /**
     * Update a notification preference in the cache (arrow-shot-through pattern).
     * This is called BEFORE the database write to ensure immediate cache consistency.
     *
     * @param id - The preference ID
     * @param userId - The user ID
     * @param notificationTypeId - The notification type ID
     * @param enabled - Overall enabled flag
     * @param inAppEnabled - In-app notification enabled
     * @param emailEnabled - Email notification enabled
     * @param smsEnabled - SMS notification enabled
     */
    public UpdatePreferenceInCache(
        id: string,
        userId: string,
        notificationTypeId: string,
        enabled: boolean,
        inAppEnabled: boolean | null,
        emailEnabled: boolean | null,
        smsEnabled: boolean | null
    ): void {
        if (!id) return;

        // Find existing preference in cache by ID
        const existingIndex = this._UserNotificationPreferences.findIndex(p => p.ID === id);

        // Create the new preference object
        const newPref: CachedUserNotificationPreference = {
            ID: id,
            UserID: userId,
            NotificationTypeID: notificationTypeId,
            Enabled: enabled,
            InAppEnabled: inAppEnabled,
            EmailEnabled: emailEnabled,
            SMSEnabled: smsEnabled
        };

        if (existingIndex >= 0) {
            // REPLACE the entire object instead of mutating BaseEntity properties
            // BaseEntity getters/setters don't work correctly when mutating cached instances
            this._UserNotificationPreferences[existingIndex] = newPref;
        } else {
            // Add new preference to cache
            this._UserNotificationPreferences.push(newPref);
        }
    }

    /**
     * Remove a preference from the cache.
     * Called BEFORE database delete.
     *
     * @param preferenceId - The ID of the preference to remove
     */
    public RemovePreferenceFromCache(preferenceId: string): void {
        const index = this._UserNotificationPreferences.findIndex(p => p.ID === preferenceId);
        if (index >= 0) {
            this._UserNotificationPreferences.splice(index, 1);
        }
    }

    public GetUserPreferenceForType(userId: string, typeId: string): CachedUserNotificationPreference | undefined {
        return (this._UserNotificationPreferences || [])
            .find(p => p.UserID === userId && p.NotificationTypeID === typeId);
    }

    /**
     * Get current user's preference for a specific notification type
     */
    public GetCurrentUserPreferenceForType(typeId: string): CachedUserNotificationPreference | undefined {
        if (!this._loadedForUserId) return undefined;
        return this.GetUserPreferenceForType(this._loadedForUserId, typeId);
    }
}
