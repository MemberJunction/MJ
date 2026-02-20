import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, UserInfo } from "@memberjunction/core";
import { MJUserViewEntityExtended } from "../custom/MJUserViewEntityExtended";

/**
 * UserViewEngine is a singleton engine that provides centralized access to User Views.
 * It caches all views and provides efficient lookup methods for retrieving views by various criteria.
 *
 * This engine consolidates view loading into a single batched operation, improving performance
 * and enabling local caching for faster subsequent access.
 *
 * Usage:
 * ```typescript
 * // Initialize the engine on-demand before first use
 * await UserViewEngine.Instance.Config(false);
 *
 * // Then access views
 * const myViews = engine.GetViewsForCurrentUser();
 * const entityViews = engine.GetViewsForEntity('entityId');
 * const view = engine.GetViewById('viewId');
 * ```
 *
 * Note: This engine is NOT auto-started at application startup. You must call Config() before use.
 * Views are cached globally. Use the filtering methods to get views for specific users or entities.
 */
export class UserViewEngine extends BaseEngine<UserViewEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application.
     * Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): UserViewEngine {
        return super.getInstance<UserViewEngine>();
    }

    // Private storage for view data
    private _views: MJUserViewEntityExtended[] = [];

    // Track the user ID for filtering purposes
    private _contextUserId: string | null = null;

    /**
     * Configures the engine by loading all User Views from the database.
     * Views are cached locally for performance.
     *
     * @param forceRefresh - If true, forces a refresh from the server even if data is cached
     * @param contextUser - The user context (required for server-side, auto-detected on client)
     * @param provider - Optional custom metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const md = new Metadata();
        const userId = contextUser?.ID || md.CurrentUser?.ID;

        // Store the context user ID for filtering
        this._contextUserId = userId || null;

        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: User Views',
                PropertyName: '_views',
                CacheLocal: true
            }
        ];

        await super.Load(configs, provider, forceRefresh, contextUser);
    }

    // ========================================================================
    // PUBLIC ACCESSORS - ALL VIEWS
    // ========================================================================

    /**
     * Get all views in the cache (unfiltered)
     */
    public get AllViews(): MJUserViewEntityExtended[] {
        return this._views || [];
    }

    /**
     * Get a view by its ID
     * @param viewId - The view ID to find
     * @returns The view entity or undefined if not found
     */
    public GetViewById(viewId: string): MJUserViewEntityExtended | undefined {
        return this.AllViews.find(v => v.ID === viewId);
    }

    /**
     * Get a view by its name
     * @param viewName - The view name to find
     * @returns The view entity or undefined if not found
     */
    public GetViewByName(viewName: string): MJUserViewEntityExtended | undefined {
        return this.AllViews.find(v => v.Name.toLowerCase() === viewName.toLowerCase());
    }

    // ========================================================================
    // FILTERED ACCESSORS - BY ENTITY
    // ========================================================================

    /**
     * Get all views for a specific entity
     * @param entityId - The entity ID to filter by
     * @returns Array of views for the entity
     */
    public GetViewsForEntity(entityId: string): MJUserViewEntityExtended[] {
        return this.AllViews
            .filter(v => v.EntityID === entityId)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    /**
     * Get all views for a specific entity by entity name
     * @param entityName - The entity name to filter by
     * @returns Array of views for the entity
     */
    public GetViewsForEntityByName(entityName: string): MJUserViewEntityExtended[] {
        const md = new Metadata();
        const entity = md.Entities.find(e => e.Name.toLowerCase() === entityName.toLowerCase());
        if (!entity) return [];
        return this.GetViewsForEntity(entity.ID);
    }

    // ========================================================================
    // FILTERED ACCESSORS - BY USER
    // ========================================================================

    /**
     * Get all views owned by the current user (based on context user)
     * @returns Array of views owned by the current user
     */
    public GetViewsForCurrentUser(): MJUserViewEntityExtended[] {
        if (!this._contextUserId) return [];
        return this.GetViewsForUser(this._contextUserId);
    }

    /**
     * Get all views owned by a specific user
     * @param userId - The user ID to filter by
     * @returns Array of views owned by the user
     */
    public GetViewsForUser(userId: string): MJUserViewEntityExtended[] {
        return this.AllViews
            .filter(v => v.UserID === userId)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    /**
     * Get all shared views (views marked as shared that the user doesn't own)
     * @returns Array of shared views
     */
    public GetSharedViews(): MJUserViewEntityExtended[] {
        return this.AllViews
            .filter(v => v.IsShared && v.UserID !== this._contextUserId)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    /**
     * Get all views accessible to the current user for a specific entity
     * (includes owned views and shared views)
     * @param entityId - The entity ID to filter by
     * @returns Array of accessible views for the entity
     */
    public GetAccessibleViewsForEntity(entityId: string): MJUserViewEntityExtended[] {
        if (!this._contextUserId) {
            // No user context - return all views for entity
            return this.GetViewsForEntity(entityId);
        }

        return this.AllViews
            .filter(v =>
                v.EntityID === entityId &&
                (v.UserID === this._contextUserId || v.IsShared)
            )
            .filter(v => v.UserCanView) // Respect permission checks
            .sort((a, b) => {
                // Sort: owned first, then by name
                const aOwned = a.UserID === this._contextUserId;
                const bOwned = b.UserID === this._contextUserId;
                if (aOwned && !bOwned) return -1;
                if (!aOwned && bOwned) return 1;
                return a.Name.localeCompare(b.Name);
            });
    }

    // ========================================================================
    // FILTERED ACCESSORS - COMBINED
    // ========================================================================

    /**
     * Get views for a specific entity owned by the current user
     * @param entityId - The entity ID to filter by
     * @returns Array of views for the entity owned by the current user
     */
    public GetMyViewsForEntity(entityId: string): MJUserViewEntityExtended[] {
        if (!this._contextUserId) return [];
        return this.AllViews
            .filter(v => v.EntityID === entityId && v.UserID === this._contextUserId)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    /**
     * Get shared views for a specific entity (not owned by current user)
     * @param entityId - The entity ID to filter by
     * @returns Array of shared views for the entity
     */
    public GetSharedViewsForEntity(entityId: string): MJUserViewEntityExtended[] {
        return this.AllViews
            .filter(v =>
                v.EntityID === entityId &&
                v.IsShared &&
                v.UserID !== this._contextUserId
            )
            .filter(v => v.UserCanView)
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    /**
     * Get the default view for an entity for the current user
     * @param entityId - The entity ID to find default view for
     * @returns The default view or undefined if none exists
     */
    public GetDefaultViewForEntity(entityId: string): MJUserViewEntityExtended | undefined {
        const myViews = this.GetMyViewsForEntity(entityId);
        return myViews.find(v => v.IsDefault);
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Check if a view exists by ID
     * @param viewId - The view ID to check
     * @returns True if the view exists
     */
    public ViewExists(viewId: string): boolean {
        return this.GetViewById(viewId) !== undefined;
    }

    /**
     * Check if a view with the given name exists for an entity
     * @param entityId - The entity ID
     * @param viewName - The view name to check
     * @returns True if a view with that name exists for the entity
     */
    public ViewNameExistsForEntity(entityId: string, viewName: string): boolean {
        return this.AllViews.some(v =>
            v.EntityID === entityId &&
            v.Name.toLowerCase() === viewName.toLowerCase()
        );
    }

    /**
     * Force refresh the view cache
     * Useful after creating, updating, or deleting a view
     */
    public async RefreshCache(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Config(true, contextUser, provider);
    }

    /**
     * Get the current context user ID
     */
    public get ContextUserId(): string | null {
        return this._contextUserId;
    }
}
