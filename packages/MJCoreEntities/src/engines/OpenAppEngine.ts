/**
 * @fileoverview Open App Engine for caching installed MJ Open App data
 *
 * Provides centralized caching for Open App entities.
 * Install history records are NOT cached here - they should be loaded on-demand via RunView.
 *
 * @module @memberjunction/core-entities/OpenAppEngine
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import {
    OpenAppEntity,
    OpenAppDependencyEntity,
} from "../generated/entity_subclasses";

/**
 * OpenAppEngine provides centralized caching for Open App entities.
 *
 * Cached entities:
 * - MJ: Open Apps: Installed app records with manifest, status, and publisher info
 * - MJ: Open App Dependencies: Dependency relationships between installed apps
 *
 * NOT cached (load on-demand):
 * - MJ: Open App Install Histories: Audit trail data that should be queried as needed
 *
 * @example
 * ```typescript
 * // Initialize the engine
 * await OpenAppEngine.Instance.Config(false, contextUser);
 *
 * // Access cached data
 * const apps = OpenAppEngine.Instance.Apps;
 * const deps = OpenAppEngine.Instance.Dependencies;
 *
 * // Find a specific app
 * const app = OpenAppEngine.Instance.GetAppByName('acme-crm');
 *
 * // Get dependencies for an app
 * const appDeps = OpenAppEngine.Instance.GetDependenciesByApp(appId);
 *
 * // Force refresh
 * await OpenAppEngine.Instance.Config(true, contextUser);
 * ```
 */
export class OpenAppEngine extends BaseEngine<OpenAppEngine> {
    /**
     * Configures and loads the Open App engine data.
     *
     * @param forceRefresh - If true, forces a refresh of cached data
     * @param contextUser - User context for data loading (required for server-side)
     * @param provider - Optional metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Open Apps',
                PropertyName: '_Apps',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Open App Dependencies',
                PropertyName: '_Dependencies',
                CacheLocal: true,
            },
        ];

        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /**
     * Gets the singleton instance of OpenAppEngine
     */
    public static get Instance(): OpenAppEngine {
        return super.getInstance<OpenAppEngine>();
    }

    // ========================================
    // Private Storage
    // ========================================

    private _Apps: OpenAppEntity[] = [];
    private _Dependencies: OpenAppDependencyEntity[] = [];

    // ========================================
    // Public Getters
    // ========================================

    /**
     * Gets all cached Open Apps
     */
    public get Apps(): OpenAppEntity[] {
        return this._Apps;
    }

    /**
     * Gets all cached Open App Dependencies
     */
    public get Dependencies(): OpenAppDependencyEntity[] {
        return this._Dependencies;
    }

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * Gets an app by ID
     */
    public GetAppById(appId: string): OpenAppEntity | undefined {
        return this._Apps.find(a => a.ID === appId);
    }

    /**
     * Gets an app by name
     */
    public GetAppByName(appName: string): OpenAppEntity | undefined {
        return this._Apps.find(a => a.Name === appName);
    }

    /**
     * Gets all dependencies for a specific app
     */
    public GetDependenciesByApp(appId: string): OpenAppDependencyEntity[] {
        return this._Dependencies.filter(d => d.OpenAppID === appId);
    }

    /**
     * Gets all apps that depend on the given app name
     */
    public GetDependentApps(appName: string): OpenAppDependencyEntity[] {
        return this._Dependencies.filter(d => d.DependsOnAppName === appName);
    }

    /**
     * Gets only active apps
     */
    public get ActiveApps(): OpenAppEntity[] {
        return this._Apps.filter(a => a.Status === 'Active');
    }

    /**
     * Gets only disabled apps
     */
    public get DisabledApps(): OpenAppEntity[] {
        return this._Apps.filter(a => a.Status === 'Disabled');
    }

    /**
     * Gets apps with errors
     */
    public get ErrorApps(): OpenAppEntity[] {
        return this._Apps.filter(a => a.Status === 'Error');
    }

    /**
     * Gets the display name for a given app ID
     */
    public GetAppDisplayName(appId: string): string {
        const app = this.GetAppById(appId);
        return app?.DisplayName ?? 'Unknown';
    }
}
