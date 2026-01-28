/**
 * API Keys Engine Base - Metadata caching for API authorization
 * Can be used anywhere (client or server) for cached access to API scope metadata.
 * @module @memberjunction/api-keys-base
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import {
    APIApplicationEntity,
    APIApplicationScopeEntity,
    APIKeyApplicationEntity,
    APIKeyScopeEntity,
    APIScopeEntity
} from "@memberjunction/core-entities";
import { RegisterForStartup } from "@memberjunction/core";

/**
 * UI configuration for API Scopes.
 * This interface defines the JSON structure stored in the UIConfig field.
 */
export interface APIScopeUIConfig {
    /** Font Awesome icon class (e.g., 'fa-solid fa-database') */
    icon?: string;
    /** Hex color code (e.g., '#6366f1') */
    color?: string;
}

/** Default UI config for scopes without explicit configuration */
const DEFAULT_UI_CONFIG: APIScopeUIConfig = {
    icon: 'fa-solid fa-ellipsis',
    color: '#6b7280'
};

/**
 * Parse the UIConfig JSON string from an APIScopeEntity.
 * Returns default values if parsing fails or value is null.
 * @param scope - The API Scope entity
 * @returns Parsed UIConfig with defaults applied
 */
export function parseAPIScopeUIConfig(scope: APIScopeEntity): APIScopeUIConfig {
    if (!scope.UIConfig) {
        return { ...DEFAULT_UI_CONFIG };
    }
    try {
        const parsed = JSON.parse(scope.UIConfig) as APIScopeUIConfig;
        return {
            icon: parsed.icon || DEFAULT_UI_CONFIG.icon,
            color: parsed.color || DEFAULT_UI_CONFIG.color
        };
    } catch {
        return { ...DEFAULT_UI_CONFIG };
    }
}

/**
 * Base engine for API Keys metadata caching.
 * Provides cached access to API scopes, applications, and key bindings.
 *
 * This class can be used on both client and server. It loads and caches:
 * - API Scopes (hierarchical scope definitions)
 * - API Applications (registered applications)
 * - API Application Scopes (application-level scope ceilings)
 * - API Key Applications (key-to-application bindings)
 * - API Key Scopes (key-level scope rules)
 *
 * @example
 * ```typescript
 * // Initialize the engine
 * await APIKeysEngineBase.Instance.Config(false, contextUser);
 *
 * // Access cached scopes
 * const scopes = APIKeysEngineBase.Instance.Scopes;
 * const entityScope = scopes.find(s => s.FullPath === 'entity:read');
 * ```
 */
@RegisterForStartup()
export class APIKeysEngineBase extends BaseEngine<APIKeysEngineBase> {
    // Cached entity arrays
    private _scopes: APIScopeEntity[] = [];
    private _applications: APIApplicationEntity[] = [];
    private _applicationScopes: APIApplicationScopeEntity[] = [];
    private _keyApplications: APIKeyApplicationEntity[] = [];
    private _keyScopes: APIKeyScopeEntity[] = [];

    // Lookup caches for fast access
    private _scopesByPath: Map<string, APIScopeEntity> = new Map();
    private _scopesById: Map<string, APIScopeEntity> = new Map();
    private _applicationsByName: Map<string, APIApplicationEntity> = new Map();
    private _applicationsById: Map<string, APIApplicationEntity> = new Map();

    /**
     * Configure the engine and load all API key metadata.
     * @param forceRefresh - If true, forces a reload even if already loaded
     * @param contextUser - User context for database operations (required on server)
     * @param provider - Optional metadata provider override
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const params: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                PropertyName: '_scopes',
                EntityName: 'MJ: API Scopes',
                CacheLocal: true
            },
            {
                PropertyName: '_applications',
                EntityName: 'MJ: API Applications',
                CacheLocal: true
            },
            {
                PropertyName: '_applicationScopes',
                EntityName: 'MJ: API Application Scopes',
                CacheLocal: true
            },
            {
                PropertyName: '_keyApplications',
                EntityName: 'MJ: API Key Applications',
                CacheLocal: true
            },
            {
                PropertyName: '_keyScopes',
                EntityName: 'MJ: API Key Scopes',
                CacheLocal: true
            }
        ];

        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    /**
     * Additional processing after data is loaded.
     * Builds lookup maps for fast access.
     */
    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        // Clear and rebuild lookup maps
        this._scopesByPath.clear();
        this._scopesById.clear();
        this._applicationsByName.clear();
        this._applicationsById.clear();

        // Build scope lookup maps
        for (const scope of this._scopes) {
            if (scope.IsActive) {
                this._scopesByPath.set(scope.FullPath, scope);
            }
            this._scopesById.set(scope.ID, scope);
        }

        // Build application lookup maps
        for (const app of this._applications) {
            this._applicationsByName.set(app.Name.toLowerCase(), app);
            this._applicationsById.set(app.ID, app);
        }
    }

    // ========================================================================
    // Public Getters - All Entities
    // ========================================================================

    /**
     * All API Scopes loaded from the database.
     * Scopes define hierarchical access control paths (e.g., 'entity:read', 'agent:execute').
     */
    public get Scopes(): APIScopeEntity[] {
        return this._scopes;
    }

    /**
     * Only active API Scopes.
     */
    public get ActiveScopes(): APIScopeEntity[] {
        return this._scopes.filter(s => s.IsActive);
    }

    /**
     * All API Applications loaded from the database.
     * Applications represent registered clients that can use API keys.
     */
    public get Applications(): APIApplicationEntity[] {
        return this._applications;
    }

    /**
     * All API Application Scopes loaded from the database.
     * These define the scope ceiling for each application.
     */
    public get ApplicationScopes(): APIApplicationScopeEntity[] {
        return this._applicationScopes;
    }

    /**
     * All API Key Application bindings loaded from the database.
     * These define which keys are bound to which applications.
     */
    public get KeyApplications(): APIKeyApplicationEntity[] {
        return this._keyApplications;
    }

    /**
     * All API Key Scopes loaded from the database.
     * These define scope rules for individual API keys.
     */
    public get KeyScopes(): APIKeyScopeEntity[] {
        return this._keyScopes;
    }

    // ========================================================================
    // Lookup Methods
    // ========================================================================

    /**
     * Get a scope by its full path (e.g., 'entity:read').
     * Only returns active scopes.
     * @param fullPath - The full path of the scope
     * @returns The scope entity or undefined if not found
     */
    public GetScopeByPath(fullPath: string): APIScopeEntity | undefined {
        return this._scopesByPath.get(fullPath);
    }

    /**
     * Get a scope by its ID.
     * @param id - The scope ID
     * @returns The scope entity or undefined if not found
     */
    public GetScopeById(id: string): APIScopeEntity | undefined {
        return this._scopesById.get(id);
    }

    /**
     * Get an application by its name (case-insensitive).
     * @param name - The application name
     * @returns The application entity or undefined if not found
     */
    public GetApplicationByName(name: string): APIApplicationEntity | undefined {
        return this._applicationsByName.get(name.toLowerCase());
    }

    /**
     * Get an application by its ID.
     * @param id - The application ID
     * @returns The application entity or undefined if not found
     */
    public GetApplicationById(id: string): APIApplicationEntity | undefined {
        return this._applicationsById.get(id);
    }

    /**
     * Get all application scopes for a specific application.
     * @param applicationId - The application ID
     * @returns Array of application scope entities
     */
    public GetApplicationScopesByApplicationId(applicationId: string): APIApplicationScopeEntity[] {
        return this._applicationScopes.filter(as => as.ApplicationID === applicationId);
    }

    /**
     * Get application scopes for a specific application and scope.
     * @param applicationId - The application ID
     * @param scopeId - The scope ID
     * @returns Array of matching application scope entities
     */
    public GetApplicationScopeRules(applicationId: string, scopeId: string): APIApplicationScopeEntity[] {
        return this._applicationScopes.filter(
            as => as.ApplicationID === applicationId && as.ScopeID === scopeId
        );
    }

    /**
     * Get all applications bound to a specific API key.
     * @param apiKeyId - The API key ID
     * @returns Array of key application binding entities
     */
    public GetKeyApplicationsByKeyId(apiKeyId: string): APIKeyApplicationEntity[] {
        return this._keyApplications.filter(ka => ka.APIKeyID === apiKeyId);
    }

    /**
     * Get all scopes defined for a specific API key.
     * @param apiKeyId - The API key ID
     * @returns Array of key scope entities
     */
    public GetKeyScopesByKeyId(apiKeyId: string): APIKeyScopeEntity[] {
        return this._keyScopes.filter(ks => ks.APIKeyID === apiKeyId);
    }

    /**
     * Get key scopes for a specific key and scope combination.
     * @param apiKeyId - The API key ID
     * @param scopeId - The scope ID
     * @returns Array of matching key scope entities
     */
    public GetKeyScopeRules(apiKeyId: string, scopeId: string): APIKeyScopeEntity[] {
        return this._keyScopes.filter(
            ks => ks.APIKeyID === apiKeyId && ks.ScopeID === scopeId
        );
    }

    /**
     * Check if a key is bound to specific applications.
     * If no bindings exist, the key works with all applications.
     * @param apiKeyId - The API key ID
     * @returns True if the key has application bindings
     */
    public KeyHasApplicationBindings(apiKeyId: string): boolean {
        return this._keyApplications.some(ka => ka.APIKeyID === apiKeyId);
    }

    /**
     * Check if a key is authorized for a specific application.
     * @param apiKeyId - The API key ID
     * @param applicationId - The application ID
     * @returns True if authorized (either bound to app or has no bindings)
     */
    public IsKeyAuthorizedForApplication(apiKeyId: string, applicationId: string): boolean {
        const bindings = this.GetKeyApplicationsByKeyId(apiKeyId);
        // If no bindings, key works with all applications
        if (bindings.length === 0) {
            return true;
        }
        // Otherwise, check if bound to this specific application
        return bindings.some(ka => ka.ApplicationID === applicationId);
    }

    // ========================================================================
    // Singleton
    // ========================================================================

    /**
     * Get the singleton instance of APIKeysEngineBase.
     */
    public static get Instance(): APIKeysEngineBase {
        return super.getInstance<APIKeysEngineBase>();
    }
}
