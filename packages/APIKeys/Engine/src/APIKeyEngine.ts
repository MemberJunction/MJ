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
import { cosmiconfigSync } from 'cosmiconfig';
import { RunView, Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import {
    MJAPIKeyEntity,
    MJAPIApplicationEntity,
    MJAPIKeyApplicationEntity,
    MJAPIScopeEntity,
    MJUserEntity
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { APIKeysEngineBase } from '@memberjunction/api-keys-base';
import { ScopeEvaluator } from './ScopeEvaluator';
import { UsageLogger } from './UsageLogger';
import { PatternMatcher } from './PatternMatcher';
import {
    AuthorizationRequest,
    AuthorizationResult,
    APIKeyEngineConfig,
    APIKeyGenerationConfig,
    APIKeyEncoding,
    GeneratedAPIKey,
    CreateAPIKeyParams,
    CreateAPIKeyResult,
    APIKeyValidationOptions,
    APIKeyValidationResult
} from './interfaces';

// =========================================================================
// API KEY GENERATION DEFAULTS
// =========================================================================

/** Default prefix prepended to generated API keys */
export const DEFAULT_KEY_PREFIX = 'mj_sk_';
/** Default number of random bytes used for key entropy */
export const DEFAULT_ENTROPY_BYTES = 32;
/** Default encoding for the random portion of the key body */
export const DEFAULT_KEY_ENCODING: APIKeyEncoding = 'hex';
/** Default hash algorithm used for key storage */
export const DEFAULT_HASH_ALGORITHM = 'sha256';

/**
 * Computes the expected encoded string length for a given byte count and encoding.
 */
function computeEncodedLength(entropyBytes: number, encoding: APIKeyEncoding): number {
    if (encoding === 'base64url') {
        return Math.ceil(entropyBytes * 4 / 3);
    }
    return entropyBytes * 2; // hex: 2 chars per byte
}

/**
 * Builds a format-validation regex from the configured prefix, entropy bytes, and encoding.
 */
function buildFormatRegex(prefix: string, entropyBytes: number, encoding: APIKeyEncoding): RegExp {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const encodedLength = computeEncodedLength(entropyBytes, encoding);
    const charClass = encoding === 'base64url' ? '[A-Za-z0-9_-]' : '[a-f0-9]';
    return new RegExp(`^${escapedPrefix}${charClass}{${encodedLength}}$`);
}

/**
 * Reads the `apiKeyGeneration` section from the MJ config file (mj.config.cjs / .mjrc).
 * Uses cosmiconfigSync for synchronous access in the constructor.
 *
 * Returns undefined if no config file is found, the file has no `apiKeyGeneration`
 * section, or any error occurs during reading.
 */
function loadFileKeyGenerationConfig(): APIKeyGenerationConfig | undefined {
    try {
        const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
        const result = explorer.search(process.cwd());
        if (result && !result.isEmpty && result.config?.apiKeyGeneration) {
            return result.config.apiKeyGeneration as APIKeyGenerationConfig;
        }
    } catch {
        // Non-fatal: config file errors should never prevent engine construction
    }
    return undefined;
}

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
    private _config: Required<Omit<APIKeyEngineConfig, 'keyGeneration'>>;
    private _keyGenConfig: Required<APIKeyGenerationConfig>;
    private _formatRegex: RegExp;
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

        // Read config file as middle tier: explicit > file > defaults
        const fileConfig = loadFileKeyGenerationConfig();

        this._keyGenConfig = {
            prefix: config.keyGeneration?.prefix ?? fileConfig?.prefix ?? DEFAULT_KEY_PREFIX,
            entropyBytes: config.keyGeneration?.entropyBytes ?? fileConfig?.entropyBytes ?? DEFAULT_ENTROPY_BYTES,
            encoding: config.keyGeneration?.encoding ?? fileConfig?.encoding ?? DEFAULT_KEY_ENCODING,
            hashAlgorithm: config.keyGeneration?.hashAlgorithm ?? fileConfig?.hashAlgorithm ?? DEFAULT_HASH_ALGORITHM,
        };

        this._formatRegex = buildFormatRegex(
            this._keyGenConfig.prefix,
            this._keyGenConfig.entropyBytes,
            this._keyGenConfig.encoding
        );

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

        // Check for config drift against existing keys
        if (contextUser) {
            await this.warnIfConfigDiffers(contextUser);
        }
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
     * Generates a new API key using the configured generation parameters.
     *
     * The key format is: `{prefix}{encodedRandomBytes}`
     * - Prefix, entropy size, encoding, and hash algorithm are all configurable
     * - Defaults: `mj_sk_` prefix, 32 bytes entropy, hex encoding, SHA-256 hash
     *
     * @returns Object containing the raw key and its hash (hash always hex-encoded)
     *
     * @example
     * ```typescript
     * const { Raw, Hash } = engine.GenerateAPIKey();
     * // Raw: 'mj_sk_a1b2c3...' (show to user once)
     * // Hash: '7f83b1657ff1...' (store in database)
     * ```
     */
    public GenerateAPIKey(): GeneratedAPIKey {
        const randomData = randomBytes(this._keyGenConfig.entropyBytes);
        const encodedBody = this.encodeBytes(randomData);
        const raw = `${this._keyGenConfig.prefix}${encodedBody}`;
        const hash = createHash(this._keyGenConfig.hashAlgorithm).update(raw).digest('hex');

        return { Raw: raw, Hash: hash };
    }

    /**
     * Hashes an API key for storage or comparison.
     *
     * Uses the configured hash algorithm to create a one-way hash of the key.
     * The hash is always output as a hex string regardless of the key encoding.
     *
     * @param key - The raw API key to hash
     * @returns The hash as a hex string
     */
    public HashAPIKey(key: string): string {
        return createHash(this._keyGenConfig.hashAlgorithm).update(key).digest('hex');
    }

    /**
     * Validates that an API key has the correct format.
     *
     * Checks that the key matches the configured prefix, encoding character set,
     * and expected length derived from the entropy bytes.
     * This is a quick syntactic check before attempting database validation.
     *
     * @param key - The API key to validate
     * @returns True if the format is valid, false otherwise
     */
    public IsValidAPIKeyFormat(key: string): boolean {
        return this._formatRegex.test(key);
    }

    /** The configured API key prefix (e.g., `'mj_sk_'`). */
    public get KeyPrefix(): string {
        return this._keyGenConfig.prefix;
    }

    /** The full resolved key generation config (read-only). */
    public get KeyGenerationConfig(): Readonly<Required<APIKeyGenerationConfig>> {
        return this._keyGenConfig;
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
                const boundToThisApp = keyApps.some((ka: MJAPIKeyApplicationEntity) => UUIDsEqual(ka.ApplicationID, appId));
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

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    /**
     * Encodes random bytes using the configured encoding format.
     * - `hex`: lowercase hexadecimal string
     * - `base64url`: URL-safe Base64 without padding
     */
    private encodeBytes(data: Buffer): string {
        if (this._keyGenConfig.encoding === 'base64url') {
            return data.toString('base64url');
        }
        return data.toString('hex');
    }

    /**
     * Checks if the current key generation config differs from defaults and
     * warns if active API keys already exist in the database.
     * Changing generation parameters after keys exist will invalidate them.
     */
    private async warnIfConfigDiffers(contextUser: UserInfo): Promise<void> {
        const configDiffersFromDefaults =
            this._keyGenConfig.prefix !== DEFAULT_KEY_PREFIX ||
            this._keyGenConfig.entropyBytes !== DEFAULT_ENTROPY_BYTES ||
            this._keyGenConfig.encoding !== DEFAULT_KEY_ENCODING ||
            this._keyGenConfig.hashAlgorithm !== DEFAULT_HASH_ALGORITHM;

        if (!configDiffersFromDefaults) {
            return;
        }

        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: API Keys',
                ExtraFilter: `Status = 'Active'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple'
            }, contextUser);

            if (result.Success && result.Results.length > 0) {
                const changes: string[] = [];
                if (this._keyGenConfig.prefix !== DEFAULT_KEY_PREFIX) {
                    changes.push(`prefix="${this._keyGenConfig.prefix}" (default: "${DEFAULT_KEY_PREFIX}")`);
                }
                if (this._keyGenConfig.entropyBytes !== DEFAULT_ENTROPY_BYTES) {
                    changes.push(`entropyBytes=${this._keyGenConfig.entropyBytes} (default: ${DEFAULT_ENTROPY_BYTES})`);
                }
                if (this._keyGenConfig.encoding !== DEFAULT_KEY_ENCODING) {
                    changes.push(`encoding="${this._keyGenConfig.encoding}" (default: "${DEFAULT_KEY_ENCODING}")`);
                }
                if (this._keyGenConfig.hashAlgorithm !== DEFAULT_HASH_ALGORITHM) {
                    changes.push(`hashAlgorithm="${this._keyGenConfig.hashAlgorithm}" (default: "${DEFAULT_HASH_ALGORITHM}")`);
                }

                console.warn(
                    `[APIKeyEngine] WARNING: API key generation config differs from defaults ` +
                    `and active API keys exist in the database. Changed: ${changes.join(', ')}. ` +
                    `Existing keys generated with different parameters will be INVALIDATED.`
                );
            }
        } catch {
            // Non-fatal — don't block startup if this check fails
        }
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
