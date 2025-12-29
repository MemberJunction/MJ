import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RegisterForStartup, UserInfo } from "@memberjunction/core";
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

    /**
     * Force refresh all user data
     * @param contextUser - Optional user context for server-side use
     */
    public async Refresh(contextUser?: UserInfo): Promise<void> {
        await this.Config(true, contextUser);
    }
}
