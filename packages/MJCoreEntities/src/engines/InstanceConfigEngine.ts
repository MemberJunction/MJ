import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { MJInstanceConfigurationEntity } from "../generated/entity_subclasses";

/**
 * InstanceConfigEngine provides centralized, cached access to instance-level feature configuration.
 * It loads all MJ: Instance Configurations records into memory and provides typed getters
 * for boolean, number, string, and JSON values by FeatureKey.
 *
 * Uses BaseEngine for automatic caching and entity-event-based auto-refresh so that
 * configuration changes are reflected without requiring a manual reload.
 *
 * Usage:
 * ```typescript
 * const engine = InstanceConfigEngine.Instance;
 * await engine.Config(false, contextUser);
 *
 * // Read a boolean flag
 * const searchEnabled = engine.GetBoolean('Shell.SearchBar.Enabled');
 *
 * // Read a number with a custom default
 * const maxResults = engine.GetNumber('Search.MaxResults', 50);
 *
 * // Read a JSON object
 * const uiConfig = engine.GetJSON<{ theme: string }>('UI.DefaultConfig');
 *
 * // Admin: update a setting
 * await engine.Set('Shell.SearchBar.Enabled', 'true', contextUser);
 * ```
 */
export class InstanceConfigEngine extends BaseEngine<InstanceConfigEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there
     * is only one instance of it in the application. Do not directly create new instances
     * of it, always use this method to get the instance.
     */
    public static get Instance(): InstanceConfigEngine {
        return super.getInstance<InstanceConfigEngine>();
    }

    private _configs: MJInstanceConfigurationEntity[] = [];

    /**
     * Configures the engine by loading all instance configuration records from the database.
     * @param forceRefresh - If true, forces a refresh from the database even if data is cached
     * @param contextUser - Optional user context for server-side operations
     * @param provider - Optional metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Instance Configurations',
                PropertyName: '_configs',
                CacheLocal: true
            }
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ================================================================
    // Cached data getter
    // ================================================================

    /** All instance configuration records */
    public get InstanceConfigs(): MJInstanceConfigurationEntity[] {
        return this._configs || [];
    }

    // ================================================================
    // Lookup helpers
    // ================================================================

    /**
     * Find a configuration record by its FeatureKey.
     * @param featureKey - The dot-notation feature key (e.g. 'Shell.SearchBar.Enabled')
     * @returns The configuration entity, or undefined if not found
     */
    public GetConfigByKey(featureKey: string): MJInstanceConfigurationEntity | undefined {
        if (!featureKey) return undefined;
        return this._configs.find(c => c.FeatureKey === featureKey);
    }

    /**
     * Get all configuration records for a given category.
     * @param category - The category to filter by (e.g. 'General', 'Search')
     * @returns Array of matching configuration entities
     */
    public GetConfigsByCategory(category: string): MJInstanceConfigurationEntity[] {
        if (!category) return [];
        const lower = category.trim().toLowerCase();
        return this._configs.filter(c => c.Category?.trim().toLowerCase() === lower);
    }

    // ================================================================
    // Typed value getters
    // ================================================================

    /**
     * Get the raw string value for a feature key. Returns the record's Value if non-empty,
     * otherwise falls back to DefaultValue, then to undefined.
     * @param featureKey - The dot-notation feature key
     * @returns The value string, or undefined if the key is not found
     */
    public Get(featureKey: string): string | undefined {
        const config = this.GetConfigByKey(featureKey);
        if (!config) return undefined;
        return this.ResolveValue(config);
    }

    /**
     * Get a boolean value for a feature key. Interprets 'true' (case-insensitive) as true,
     * everything else as false. Returns the provided default if the key is not found.
     * @param featureKey - The dot-notation feature key
     * @param defaultValue - Value to return if the key is not found (defaults to true)
     */
    public GetBoolean(featureKey: string, defaultValue: boolean = true): boolean {
        const raw = this.Get(featureKey);
        if (raw === undefined) return defaultValue;
        return raw.trim().toLowerCase() === 'true';
    }

    /**
     * Get a numeric value for a feature key. Returns the provided default if the key
     * is not found or the value cannot be parsed as a number.
     * @param featureKey - The dot-notation feature key
     * @param defaultValue - Value to return if the key is not found or unparseable (defaults to 0)
     */
    public GetNumber(featureKey: string, defaultValue: number = 0): number {
        const raw = this.Get(featureKey);
        if (raw === undefined) return defaultValue;
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Get a JSON-parsed value for a feature key. Returns the provided default if the key
     * is not found or the value cannot be parsed as JSON.
     * @param featureKey - The dot-notation feature key
     * @param defaultValue - Value to return if the key is not found or unparseable
     */
    public GetJSON<T>(featureKey: string, defaultValue?: T): T | undefined {
        const raw = this.Get(featureKey);
        if (raw === undefined) return defaultValue;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return defaultValue;
        }
    }

    // ================================================================
    // Admin setter
    // ================================================================

    /**
     * Update the Value of an existing configuration record. This method updates the
     * record in the database and refreshes the local cache entry.
     *
     * Note: This only updates existing records. To create new configuration entries,
     * use the standard entity creation workflow.
     *
     * @param featureKey - The dot-notation feature key to update
     * @param value - The new value string
     * @param contextUser - Optional user context (required on server-side)
     * @returns true if the save succeeded, false otherwise
     */
    public async Set(featureKey: string, value: string, contextUser?: UserInfo): Promise<boolean> {
        const config = this.GetConfigByKey(featureKey);
        if (!config) {
            console.error(`InstanceConfigEngine.Set: FeatureKey '${featureKey}' not found`);
            return false;
        }

        try {
            config.Value = value;
            const saved = await config.Save();
            if (saved) {
                return true;
            } else {
                console.error('InstanceConfigEngine.Set: Failed to save:', config.LatestResult?.Message);
                return false;
            }
        } catch (error) {
            console.error('InstanceConfigEngine.Set: Error:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    // ================================================================
    // Private helpers
    // ================================================================

    /**
     * Resolve the effective value for a configuration record. Returns Value if
     * it is non-empty, otherwise falls back to DefaultValue.
     */
    private ResolveValue(config: MJInstanceConfigurationEntity): string {
        const val = config.Value;
        if (val != null && val.trim().length > 0) {
            return val;
        }
        return config.DefaultValue;
    }
}
