/**
 * API Key Engine - Main orchestrator for API key operations and authorization
 *
 * This is the primary interface for all API key operations including:
 * - Key generation, creation, validation, and revocation
 * - Scope-based authorization with pattern matching
 * - Usage logging and audit trails
 *
 * Server-side only. Uses APIKeysEngineBase for cached metadata access.
 *
 * @module @memberjunction/api-keys
 */

import { createHash, randomBytes } from 'crypto';
import { RunView, Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import {
    MJAPIKeyEntity,
    MJAPIApplicationEntity,
    MJAPIKeyApplicationEntity,
    MJAPIScopeEntity,
    MJUserEntity
} from '@memberjunction/core-entities';
import { APIKeysEngineBase } from '@memberjunction/api-keys-base';
import { ScopeEvaluator } from './ScopeEvaluator';
import { UsageLogger } from './UsageLogger';
import { PatternMatcher } from './PatternMatcher';
import {
    AuthorizationRequest,
    AuthorizationResult,
    APIKeyEngineConfig,
    GeneratedAPIKey,
    CreateAPIKeyParams,
    CreateAPIKeyResult,
    APIKeyValidationOptions,
    APIKeyValidationResult
} from './interfaces';

/** Regular expression pattern for validating API key format */
const API_KEY_FORMAT_REGEX = /^mj_sk_[a-f0-9]{64}$/;

/**
 * Result of validating an API key by hash (internal validation)
 */
export interface KeyHashValidationResult {
    /** Whether the key is valid */
    Valid: boolean;
    /** The API key entity if valid */
    APIKey?: MJAPIKeyEntity;
    /** The reason if invalid */
    Reason?: string;
}

/**
 * Main orchestrator for API key operations and authorization
 *
 * Provides methods for:
 * - Generating, creating, and revoking API keys
 * - Validating API keys and returning user context
 * - Authorizing requests against scope rules
 * - Logging API key usage
 *
 * @example
 * ```typescript
 * const engine = GetAPIKeyEngine();
 *
 * // Create a new API key
 * const result = await engine.CreateAPIKey({
 *     userId: 'user-guid',
 *     label: 'My Integration'
 * }, contextUser);
 *
 * // Validate and authorize a request
 * const authResult = await engine.Authorize(
 *     hash, 'MJAPI', 'view:run', 'Users', contextUser
 * );
 * ```
 */
export class APIKeyEngine {
    private _config: Required<APIKeyEngineConfig>;
    private _scopeEvaluator: ScopeEvaluator;
    private _usageLogger: UsageLogger;
    private _configured: boolean = false;

    constructor(config: APIKeyEngineConfig = {}) {
        this._config = {
            enforcementEnabled: config.enforcementEnabled ?? true,
            loggingEnabled: config.loggingEnabled ?? true,
            defaultBehaviorNoScopes: config.defaultBehaviorNoScopes ?? 'deny',
            scopeCacheTTLMs: config.scopeCacheTTLMs ?? 60000
        };

        this._scopeEvaluator = new ScopeEvaluator(this._config.defaultBehaviorNoScopes);
        this._usageLogger = new UsageLogger();
    }

    /**
     * Access to the cached metadata from APIKeysEngineBase.
     * This allows direct access to cached scopes, applications, and key bindings.
     */
    protected get Base(): APIKeysEngineBase {
        return APIKeysEngineBase.Instance;
    }

    /**
     * Configure the engine and ensure the base engine is loaded.
     * This should be called during server startup to preload all metadata.
     *
     * @param forceRefresh - If true, forces a reload even if already loaded
     * @param contextUser - User context for database operations
     * @param provider - Optional metadata provider override
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        await this.Base.Config(forceRefresh, contextUser, provider);
        this._configured = true;
    }

    /**
     * Check if the engine has been configured.
     */
    public get IsConfigured(): boolean {
        return this._configured;
    }

    // =========================================================================
    // DELEGATED GETTERS FROM BASE ENGINE
    // =========================================================================

    /**
     * All cached API Scopes from the base engine.
     */
    public get Scopes(): MJAPIScopeEntity[] {
        return this.Base.Scopes;
    }

    /**
     * All cached API Applications from the base engine.
     */
    public get Applications(): MJAPIApplicationEntity[] {
        return this.Base.Applications;
    }

    // =========================================================================
    // API KEY GENERATION AND MANAGEMENT
    // =========================================================================

    /**
     * Generates a new API key with the standard MemberJunction format.
     *
     * The key format is: `mj_sk_[64 hex characters]`
     * - `mj_sk_` prefix identifies it as a MemberJunction secret key
     * - 64 hex characters = 32 bytes of cryptographically secure random data
     *
     * @returns Object containing the raw key and its SHA-256 hash
     *
     * @example
     * ```typescript
     * const { raw, hash } = engine.GenerateAPIKey();
     * // raw: 'mj_sk_a1b2c3...' (show to user once)
     * // hash: '7f83b1657ff1...' (store in database)
     * ```
     */
    public GenerateAPIKey(): GeneratedAPIKey {
        const randomData = randomBytes(32);
        const hexString = randomData.toString('hex');
        const raw = `mj_sk_${hexString}`;
        const hash = createHash('sha256').update(raw).digest('hex');

        return { Raw: raw, Hash: hash };
    }

    /**
     * Hashes an API key for storage or comparison.
     *
     * Uses SHA-256 to create a one-way hash of the key.
     * This hash is what gets stored in the database and used for lookups.
     *
     * @param key - The raw API key to hash
     * @returns The SHA-256 hash as a hex string (64 characters)
     */
    public HashAPIKey(key: string): string {
        return createHash('sha256').update(key).digest('hex');
    }

    /**
     * Validates that an API key has the correct format.
     *
     * Checks that the key matches the pattern: `mj_sk_[64 hex characters]`
     * This is a quick syntactic check before attempting database validation.
     *
     * @param key - The API key to validate
     * @returns True if the format is valid, false otherwise
     */
    public IsValidAPIKeyFormat(key: string): boolean {
        return API_KEY_FORMAT_REGEX.test(key);
    }

    /**
     * Creates a new API key and stores it in the database.
     *
     * This method:
     * 1. Generates a new cryptographically secure API key
     * 2. Hashes it for secure storage
     * 3. Creates an APIKey entity record in the database
     *
     * **IMPORTANT**: The raw key is only returned once. Store it securely
     * or show it to the user immediately - it cannot be recovered later.
     *
     * @param params - Configuration for the new API key
     * @param contextUser - User context for database operations
     * @returns Result containing the raw key (if successful) or error
     *
     * @example
     * ```typescript
     * const result = await engine.CreateAPIKey({
     *     userId: 'user-guid-here',
     *     label: 'MCP Server Integration',
     *     description: 'Used for Claude Desktop MCP connections',
     *     expiresAt: new Date('2025-12-31')
     * }, contextUser);
     *
     * if (result.Success) {
     *     console.log('Save this key:', result.RawKey);
     * }
     * ```
     */
    public async CreateAPIKey(
        params: CreateAPIKeyParams,
        contextUser: UserInfo
    ): Promise<CreateAPIKeyResult> {
        try {
            const { Raw, Hash } = this.GenerateAPIKey();

            const md = new Metadata();
            const apiKey = await md.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', contextUser);

            apiKey.Hash = Hash;
            apiKey.UserID = params.UserId;
            apiKey.Label = params.Label;
            apiKey.Description = params.Description ?? null;
            apiKey.ExpiresAt = params.ExpiresAt ?? null;
            apiKey.Status = 'Active';
            apiKey.CreatedByUserID = contextUser.ID;

            const success = await apiKey.Save();

            if (!success) {
                return {
                    Success: false,
                    Error: 'Failed to save API key to database'
                };
            }

            return {
                Success: true,
                RawKey: Raw,
                APIKeyId: apiKey.ID
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                Success: false,
                Error: `Failed to create API key: ${message}`
            };
        }
    }

    /**
     * Validates an API key and returns the associated user context.
     *
     * This is the main entry point for API key authentication. It:
     * 1. Validates the key format
     * 2. Hashes the key and looks it up in the database
     * 3. Checks key status (active vs revoked)
     * 4. Checks expiration
     * 5. Checks application binding (if ApplicationId/ApplicationName provided)
     * 6. Retrieves and validates the associated user
     * 7. Logs the usage (if logging is enabled)
     *
     * @param options - Validation options including the raw key and request context
     * @param contextUser - User context for database operations
     * @returns Validation result with user context if valid
     *
     * @example
     * ```typescript
     * const result = await engine.ValidateAPIKey({
     *     RawKey: request.headers['x-api-key'],
     *     ApplicationName: 'MCPServer', // Check if key is valid for MCP
     *     Endpoint: '/graphql',
     *     Method: 'POST',
     *     Operation: 'GetUsersRecord',
     *     StatusCode: 200,
     *     IPAddress: request.ip,
     *     UserAgent: request.headers['user-agent']
     * }, systemUser);
     *
     * if (result.IsValid) {
     *     // Proceed with the user context
     *     // Use result.APIKeyHash for subsequent Authorize() calls
     *     return result.User;
     * }
     * ```
     */
    public async ValidateAPIKey(
        options: APIKeyValidationOptions,
        contextUser: UserInfo
    ): Promise<APIKeyValidationResult> {
        const { RawKey } = options;

        // 1. Validate format first (fast fail)
        if (!this.IsValidAPIKeyFormat(RawKey)) {
            return { IsValid: false, Error: 'Invalid API key format' };
        }

        // 2. Hash the key for lookup
        const keyHash = this.HashAPIKey(RawKey);

        // 3. Validate the key by hash
        const keyValidation = await this.ValidateKeyByHash(keyHash, contextUser);
        if (!keyValidation.Valid || !keyValidation.APIKey) {
            return { IsValid: false, Error: keyValidation.Reason || 'Invalid API key' };
        }

        const apiKey = keyValidation.APIKey;

        // 4. Check application binding (if ApplicationId or ApplicationName provided)
        if (options.ApplicationId || options.ApplicationName) {
            let appId = options.ApplicationId;

            // Look up app by name if only name provided
            if (!appId && options.ApplicationName) {
                const app = await this.GetApplicationByName(options.ApplicationName, contextUser);
                if (!app) {
                    return { IsValid: false, Error: `Unknown application: ${options.ApplicationName}` };
                }
                appId = app.ID;
            }

            // Check if key is bound to specific applications
            const keyApps = await this._scopeEvaluator.GetKeyApplications(apiKey.ID, contextUser);

            if (keyApps.length > 0) {
                // Key has app restrictions - check if this app is allowed
                const boundToThisApp = keyApps.some((ka: MJAPIKeyApplicationEntity) => ka.ApplicationID === appId);
                if (!boundToThisApp) {
                    return { IsValid: false, Error: 'API key not authorized for this application' };
                }
            }
            // If keyApps is empty, key works with all apps (global key)
        }

        // 5. Get the user
        const rv = new RunView();
        const userResult = await rv.RunView<MJUserEntity>({
            EntityName: 'MJ: Users',
            ExtraFilter: `ID = '${apiKey.UserID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const userRecord = userResult.Results?.[0];
        if (!userRecord) {
            return { IsValid: false, Error: 'User not found for API key' };
        }

        if (!userRecord.IsActive) {
            return { IsValid: false, Error: 'User account is inactive' };
        }

        // 6. Update LastUsedAt
        try {
            apiKey.LastUsedAt = new Date();
            await apiKey.Save();
        } catch {
            // Non-fatal - continue even if LastUsedAt update fails
        }

        // 7. Log usage if enabled and logging options provided
        if (this._config.loggingEnabled && options.Endpoint) {
            try {
                await this._usageLogger.LogSuccess(
                    apiKey.ID,
                    null, // No application ID for basic validation
                    options.Endpoint,
                    options.Operation || null,
                    options.Method || 'POST',
                    options.StatusCode || 200,
                    options.ResponseTimeMs || null,
                    null, // No resource for basic validation
                    [],
                    options.IPAddress || null,
                    options.UserAgent || null,
                    contextUser
                );
            } catch {
                // Non-fatal - continue even if logging fails
            }
        }

        // 8. Create UserInfo from the entity
        const user = new UserInfo(undefined, userRecord.GetAll());

        return {
            IsValid: true,
            User: user,
            APIKeyId: apiKey.ID,
            APIKeyHash: keyHash
        };
    }

    /**
     * Revokes an API key, permanently disabling it.
     *
     * Once revoked, an API key cannot be reactivated. Create a new key if needed.
     *
     * @param apiKeyId - The database ID of the API key to revoke
     * @param contextUser - User context for database operations
     * @returns True if revocation succeeded, false otherwise
     */
    public async RevokeAPIKey(apiKeyId: string, contextUser: UserInfo): Promise<boolean> {
        const md = new Metadata();
        const apiKey = await md.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', contextUser);

        const loaded = await apiKey.Load(apiKeyId);
        if (!loaded) {
            return false;
        }

        apiKey.Status = 'Revoked';
        return await apiKey.Save();
    }

    // =========================================================================
    // AUTHORIZATION
    // =========================================================================

    /**
     * Validate and authorize an API key request against scope rules.
     * This method ALWAYS logs the authorization decision for audit purposes.
     *
     * This implements the three-tier permission model:
     * 1. User Permissions - What the user can do (already checked by authentication)
     * 2. Application Ceiling - Maximum scope the application allows
     * 3. API Key Scopes - Specific scopes granted to this key
     *
     * @param apiKeyHash - The SHA-256 hash of the API key
     * @param applicationName - The name of the calling application (e.g., 'MJAPI', 'MCPServer')
     * @param scopePath - The scope being requested (e.g., 'view:run')
     * @param resource - The specific resource (e.g., entity name)
     * @param contextUser - User context for database operations
     * @param requestContext - Optional request context for logging (endpoint, method, etc.)
     * @returns Authorization result with optional log ID
     */
    public async Authorize(
        apiKeyHash: string,
        applicationName: string,
        scopePath: string,
        resource: string,
        contextUser: UserInfo,
        requestContext?: {
            endpoint?: string;
            method?: string;
            operation?: string | null;
            ipAddress?: string | null;
            userAgent?: string | null;
        }
    ): Promise<AuthorizationResult & { LogId?: string }> {
        const startTime = Date.now();

        // 1. Validate the API key
        const keyValidation = await this.ValidateKeyByHash(apiKeyHash, contextUser);
        if (!keyValidation.Valid || !keyValidation.APIKey) {
            return {
                Allowed: false,
                Reason: keyValidation.Reason || 'Invalid API key',
                EvaluatedRules: []
            };
        }

        // 2. Get the application
        const app = await this.GetApplicationByName(applicationName, contextUser);
        if (!app) {
            return {
                Allowed: false,
                Reason: `Unknown application: ${applicationName}`,
                EvaluatedRules: []
            };
        }

        if (!app.IsActive) {
            return {
                Allowed: false,
                Reason: `Application is not active: ${applicationName}`,
                EvaluatedRules: []
            };
        }

        // 3. If enforcement is disabled, allow everything
        if (!this._config.enforcementEnabled) {
            return {
                Allowed: true,
                Reason: 'Enforcement disabled',
                EvaluatedRules: []
            };
        }

        // 4. Evaluate scopes
        const request: AuthorizationRequest = {
            APIKeyId: keyValidation.APIKey.ID,
            UserId: keyValidation.APIKey.UserID,
            ApplicationId: app.ID,
            ScopePath: scopePath,
            Resource: resource
        };

        const result = await this._scopeEvaluator.EvaluateAccess(request, contextUser);

        const responseTimeMs = Date.now() - startTime;

        // 5. Always log the authorization decision
        let logId: string | undefined;
        try {
            const endpoint = requestContext?.endpoint || `/${applicationName.toLowerCase()}`;
            const method = requestContext?.method || 'POST';
            const operation = requestContext?.operation || `${scopePath}:${resource}`;
            const statusCode = result.Allowed ? 200 : 403;

            if (result.Allowed) {
                logId = (await this._usageLogger.LogSuccess(
                    keyValidation.APIKey.ID,
                    app.ID,
                    endpoint,
                    operation,
                    method,
                    statusCode,
                    responseTimeMs,
                    resource,
                    result.EvaluatedRules,
                    requestContext?.ipAddress || null,
                    requestContext?.userAgent || null,
                    contextUser
                )) || undefined;
            } else {
                logId = (await this._usageLogger.LogDenied(
                    keyValidation.APIKey.ID,
                    app.ID,
                    endpoint,
                    operation,
                    method,
                    statusCode,
                    responseTimeMs,
                    resource,
                    result.EvaluatedRules,
                    result.Reason,
                    requestContext?.ipAddress || null,
                    requestContext?.userAgent || null,
                    contextUser
                )) || undefined;
            }
        } catch {
            // Non-fatal - continue even if logging fails
        }

        return { ...result, LogId: logId };
    }

    /**
     * Authorize and log the request.
     * @deprecated Use Authorize() instead - it now always logs.
     * This method is kept for backward compatibility.
     */
    public async AuthorizeAndLog(
        apiKeyHash: string,
        applicationName: string,
        scopePath: string,
        resource: string,
        endpoint: string,
        method: string,
        operation: string | null,
        ipAddress: string | null,
        userAgent: string | null,
        contextUser: UserInfo
    ): Promise<AuthorizationResult & { LogId?: string }> {
        return this.Authorize(
            apiKeyHash,
            applicationName,
            scopePath,
            resource,
            contextUser,
            {
                endpoint,
                method,
                operation,
                ipAddress,
                userAgent
            }
        );
    }

    /**
     * Validate an API key by its hash (internal method).
     */
    public async ValidateKeyByHash(
        hash: string,
        contextUser: UserInfo
    ): Promise<KeyHashValidationResult> {
        const rv = new RunView();
        const result = await rv.RunView<MJAPIKeyEntity>({
            EntityName: 'MJ: API Keys',
            ExtraFilter: `Hash='${hash}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success || result.Results.length === 0) {
            return { Valid: false, Reason: 'API key not found' };
        }

        const apiKey = result.Results[0];

        // Check status
        if (apiKey.Status !== 'Active') {
            return { Valid: false, Reason: 'API key is revoked' };
        }

        // Check expiry
        if (apiKey.ExpiresAt) {
            const expiryDate = new Date(apiKey.ExpiresAt);
            if (expiryDate < new Date()) {
                return { Valid: false, Reason: 'API key has expired' };
            }
        }

        return { Valid: true, APIKey: apiKey };
    }

    // =========================================================================
    // APPLICATION MANAGEMENT
    // =========================================================================

    /**
     * Get application by name.
     * Uses cached data from APIKeysEngineBase.
     * @param name - The application name (case-insensitive)
     * @param _contextUser - Kept for API compatibility
     */
    public async GetApplicationByName(
        name: string,
        _contextUser: UserInfo
    ): Promise<MJAPIApplicationEntity | null> {
        // Use cached data from Base engine
        const app = this.Base.GetApplicationByName(name);
        return app || null;
    }

    /**
     * Get application by ID.
     * Uses cached data from APIKeysEngineBase.
     * @param id - The application ID
     * @param _contextUser - Kept for API compatibility
     */
    public async GetApplicationById(
        id: string,
        _contextUser: UserInfo
    ): Promise<MJAPIApplicationEntity | null> {
        // Use cached data from Base engine
        const app = this.Base.GetApplicationById(id);
        return app || null;
    }

    /**
     * Update LastUsedAt for an API key.
     */
    public async UpdateLastUsed(
        apiKeyId: string,
        contextUser: UserInfo
    ): Promise<boolean> {
        try {
            const md = new Metadata();
            const apiKey = await md.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', contextUser);

            if (await apiKey.Load(apiKeyId)) {
                apiKey.LastUsedAt = new Date();
                return await apiKey.Save();
            }
            return false;
        } catch {
            return false;
        }
    }

    // =========================================================================
    // CACHE AND UTILITY
    // =========================================================================

    /**
     * Clear all caches and force a refresh of the base engine.
     * @param contextUser - User context for database operations (required for refresh)
     */
    public async RefreshCache(contextUser: UserInfo): Promise<void> {
        await this.Base.Config(true, contextUser);
    }

    /**
     * Clear all caches.
     * @deprecated Use RefreshCache(contextUser) instead to force a refresh
     */
    public ClearCache(): void {
        this._scopeEvaluator.ClearCache();
        // Note: Base engine cache is managed by calling Config(true, contextUser)
    }

    /**
     * Get the scope evaluator for direct access if needed.
     */
    public GetScopeEvaluator(): ScopeEvaluator {
        return this._scopeEvaluator;
    }

    /**
     * Get the usage logger for direct access if needed.
     */
    public GetUsageLogger(): UsageLogger {
        return this._usageLogger;
    }

    /**
     * Get the pattern matcher utility.
     */
    public GetPatternMatcher(): typeof PatternMatcher {
        return PatternMatcher;
    }
}

/**
 * Singleton instance of the API Key Engine
 */
let defaultEngine: APIKeyEngine | null = null;

/**
 * Get the default API Key Engine instance.
 */
export function GetAPIKeyEngine(config?: APIKeyEngineConfig): APIKeyEngine {
    if (!defaultEngine) {
        defaultEngine = new APIKeyEngine(config);
    }
    return defaultEngine;
}

/**
 * Reset the default API Key Engine instance.
 * Useful for testing or reconfiguration.
 */
export function ResetAPIKeyEngine(): void {
    defaultEngine = null;
}
