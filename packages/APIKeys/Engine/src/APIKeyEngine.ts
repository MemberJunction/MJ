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
import {
    RunView,
    Metadata,
    UserInfo,
    IMetadataProvider,
    LogError,
    type APIKeyActingContext,
    type APIKeyRowFilterBinding,
    type RowLevelSecurityFilterInfo
} from '@memberjunction/core';
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
    EffectiveFilterEntry,
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
 * Scope paths whose data path executes raw SQL and therefore BYPASSES row-level
 * security entirely (plan §5.10): saved/tested queries run verbatim via
 * ExecuteSQL with no RLS clause and a user-agnostic cache; dataset reads build
 * per-item SELECTs without the RLS clause; reports execute stored SQL verbatim.
 * A key carrying ANY row-filtered scope rule is denied these scopes — a filtered
 * key that can run raw SQL against the filtered entity reads it unfiltered,
 * making the filter decoration.
 */
const RLS_BYPASSING_SCOPE_PATHS: ReadonlySet<string> = new Set(['query:run', 'query:test', 'dataset:read', 'report:run']);

/** GUID shape accepted for the GUID-typed acting tokens. */
const GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Bounded-identifier shape accepted for {{ActingScopeID}}. */
const ACTING_SCOPE_ID_PATTERN = /^[A-Za-z0-9_.\-]{1,128}$/;

/**
 * Fixed scope-path → EntityPermissionType mapping for row-filter bindings
 * (plan §5.5.1). Reads reach the data layer via more than one scope, so both
 * `entity:read` and `view:run` map to Read. Any OTHER scope path carrying a
 * filtered matching rule has no coherent permission type and is denied.
 */
function mapScopePathToPermissionType(scopePath: string): APIKeyRowFilterBinding['PermissionType'] | undefined {
    switch (scopePath) {
        case 'entity:read':
        case 'view:run':
            return 'Read';
        case 'entity:create':
            return 'Create';
        case 'entity:update':
            return 'Update';
        case 'entity:delete':
            return 'Delete';
        default:
            return undefined;
    }
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
    /**
     * Cache of the {{Token}} names parsed from each referenced filter's
     * FilterText, keyed by FilterID. Templates are principal-independent, so
     * the PARSED TOKEN SET is safe to cache; RESOLVED filter values are
     * principal-specific and are never cached here. The source text is stored
     * alongside so an edited filter re-parses instead of serving stale tokens.
     */
    private _filterTokenCache: Map<string, { text: string; tokens: string[] }> = new Map();

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

        // Startup invariant (plan §5.6 rows 3/4): the presence of ANY row-filtered
        // scope rule requires the engine to be enforcing and default-deny. A warning
        // here would be fail-open — refuse startup instead.
        this.assertRowFilterStartupInvariant();

        this._configured = true;

        // Check for config drift against existing keys
        if (contextUser) {
            await this.warnIfConfigDiffers(contextUser);
        }
    }

    /**
     * Throws when any cached key-scope or application-scope rule carries a
     * RowFilterID while the engine configuration would silently bypass it:
     * `enforcementEnabled: false` allows everything unconditionally, and
     * `defaultBehaviorNoScopes: 'allow'` lets a key with no rules for a scope
     * through unfiltered. Either combination makes a deliberately-configured
     * row filter silently absent — the fail-open case this feature exists to
     * prevent — so startup is refused with the offending setting named.
     */
    private assertRowFilterStartupInvariant(): void {
        const filteredKeyRules = this.Base.KeyScopes.filter(ks => ks.RowFilterID != null);
        const filteredAppRules = this.Base.ApplicationScopes.filter(as => as.RowFilterID != null);
        if (filteredKeyRules.length === 0 && filteredAppRules.length === 0) {
            return;
        }

        const where =
            `${filteredKeyRules.length} API Key Scope rule(s) and ${filteredAppRules.length} ` +
            `API Application Scope rule(s) carry a RowFilterID`;

        if (this._config.enforcementEnabled === false) {
            throw new Error(
                `[APIKeyEngine] Startup refused: ${where}, but 'enforcementEnabled' is false. ` +
                `With enforcement disabled every request is allowed unconditionally, so the configured row filter(s) ` +
                `would be silently bypassed. Remedy: set 'enforcementEnabled' to true, or remove the RowFilterID ` +
                `from the affected scope rules.`
            );
        }
        if (this._config.defaultBehaviorNoScopes === 'allow') {
            throw new Error(
                `[APIKeyEngine] Startup refused: ${where}, but 'defaultBehaviorNoScopes' is 'allow'. ` +
                `A default-allow engine grants unfiltered access whenever a key has no rules for a scope, so the ` +
                `configured row filter(s) would be silently bypassable. Remedy: set 'defaultBehaviorNoScopes' to ` +
                `'deny' (the engine default), or remove the RowFilterID from the affected scope rules.`
            );
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
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<CreateAPIKeyResult> {
        try {
            const { Raw, Hash } = this.GenerateAPIKey();

            const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
            const apiKey = await md.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', contextUser);

            apiKey.Hash = Hash;
            apiKey.KeyPrefix = Raw.substring(0, this._keyGenConfig.prefix.length + 4);
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
    public async RevokeAPIKey(apiKeyId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<boolean> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
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
        },
        options?: {
            /** When true, skip writing to the usage log. Useful for speculative
             *  checks (e.g. full_access probe) that are not the real authorization decision. */
            skipLogging?: boolean;
            /**
             * Server-derived acting context for this request (plan §5.2/§5.8).
             * Required when a matching allow rule carries a row filter whose
             * FilterText references {{Acting*}} tokens; every required token
             * must be present and type-valid or the request is denied.
             * MUST originate server-side — never from client input.
             */
            actingContext?: APIKeyActingContext;
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

        // 3. If enforcement is disabled, allow everything — EXCEPT for a key
        // carrying a row-filtered rule. The startup invariant refuses that
        // combination at Config() time, but a filtered rule saved at runtime
        // (the base cache refreshes on entity events) could otherwise slip
        // through this early return unfiltered. Fail closed instead.
        if (!this._config.enforcementEnabled) {
            const hasFilteredRule = this.Base.GetKeyScopesByKeyId(keyValidation.APIKey.ID)
                .some(r => r.RowFilterID != null);
            if (hasFilteredRule) {
                return {
                    Allowed: false,
                    Reason:
                        'Denied: this API key carries a row filter, but scope enforcement is disabled ' +
                        '(enforcementEnabled: false), so the filter cannot be enforced. This configuration is ' +
                        'refused at startup; a rule added at runtime fails closed here. Remedy: enable enforcement ' +
                        'or remove the row filter.',
                    EvaluatedRules: []
                };
            }
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
            Resource: resource,
            ActingContext: options?.actingContext
        };

        let result = await this._scopeEvaluator.EvaluateAccess(request, contextUser);

        // 4b. Row-filter enforcement layer (plan §5.6.1, §5.10, §5.4) — all fail-closed.
        result = this.applyRowFilterAuthorization(result, request);

        const responseTimeMs = Date.now() - startTime;

        // 5. Log the authorization decision (unless caller opted out for speculative checks)
        let logId: string | undefined;
        if (!options?.skipLogging) {
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
                        contextUser,
                        result.EffectiveFilter
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
                        contextUser,
                        result.EffectiveFilter
                    )) || undefined;
                }
            } catch {
                // Non-fatal - continue even if logging fails
            }
        }

        return { ...result, LogId: logId };
    }

    // =========================================================================
    // ROW-FILTER AUTHORIZATION (plan §5.4, §5.6.1, §5.10)
    // =========================================================================

    /**
     * Applies the row-filter authorization layer on top of the scope-evaluation
     * result. All branches fail closed:
     *
     * 1. §5.6.1 backstop — a key carrying ANY row-filtered scope rule is denied
     *    `full_access` outright (the combination is invalid configuration; the
     *    authoring-time rejection cannot catch stale caches or independent edits).
     * 2. §5.10 — the same key is denied every scope whose data path bypasses RLS
     *    (`query:run`, `query:test`, `dataset:read`, `report:run`).
     * 3. §5.4 — for an otherwise-allowed request, every RowFilterID on a MATCHING
     *    allow rule is resolved (rule → entity → permission type → filter), its
     *    required {{Acting*}} tokens are validated against the request's acting
     *    context, and the resulting bindings + effective filter are attached to
     *    the result. Any resolution or validation failure denies with a reason.
     */
    private applyRowFilterAuthorization(
        result: AuthorizationResult,
        request: AuthorizationRequest
    ): AuthorizationResult {
        // Computed over ALL of this key's scope rules — not just matched ones. A
        // filtered rule anywhere on the key is what makes full_access / raw-SQL
        // scopes incoherent for it.
        const keyScopeRules = this.Base.GetKeyScopesByKeyId(request.APIKeyId);
        const filteredRules = keyScopeRules.filter(r => r.RowFilterID != null);
        const keyHasRowFilteredRule = filteredRules.length > 0;

        if (!keyHasRowFilteredRule) {
            return result;
        }

        const filteredEntityNames = [...new Set(filteredRules.map(r => r.ResourcePattern ?? '(unspecified)'))].sort().join(', ');

        // 1. full_access backstop (§5.6.1) — deny regardless of evaluation outcome.
        if (request.ScopePath === 'full_access') {
            return {
                ...result,
                Allowed: false,
                Reason:
                    `Denied: this API key carries a row filter (on ${filteredEntityNames}), and full_access is ` +
                    `unrestricted by definition — the two cannot both be honored, so the combination is invalid ` +
                    `configuration and is refused rather than silently resolved. Remedy: remove the full_access ` +
                    `grant or the row filter, or split the key in two (one broad key without filters, one filtered key ` +
                    `with enumerated scopes).`
            };
        }

        // 2. RLS-bypassing scopes (§5.10) — deny key-wide, naming cause and remedy.
        if (RLS_BYPASSING_SCOPE_PATHS.has(request.ScopePath)) {
            return {
                ...result,
                Allowed: false,
                Reason:
                    `Denied: this API key carries a row filter (on ${filteredEntityNames}), which is incompatible ` +
                    `with '${request.ScopePath}' because that path executes raw SQL and bypasses row-level security — ` +
                    `a filtered key that can run it would read the filtered entity unfiltered. Remedy: split the key ` +
                    `(one key for '${request.ScopePath}' without row filters, one filtered key for entity access), or ` +
                    `remove the row filter.`
            };
        }

        // 3. Resolve bindings for the filters carried by MATCHING allow rules.
        if (!result.Allowed || !result.MatchedRowFilterIDs || result.MatchedRowFilterIDs.length === 0) {
            return result;
        }
        return this.resolveRowFilterBindings(result, request);
    }

    /**
     * Resolves each filtered MATCHING key-level allow rule into a concrete
     * binding (EntityID + PermissionType + FilterID) and the observability
     * EffectiveFilter entries, validating required acting tokens along the way.
     * Every unresolvable step denies (fail closed): non-exact/unresolvable
     * entity, dangling filter ID, scope path with no coherent permission type,
     * missing or type-invalid acting token.
     */
    private resolveRowFilterBindings(
        result: AuthorizationResult,
        request: AuthorizationRequest
    ): AuthorizationResult {
        const deny = (reason: string): AuthorizationResult => ({ ...result, Allowed: false, Reason: reason });

        const permissionType = mapScopePathToPermissionType(request.ScopePath);
        if (!permissionType) {
            return deny(
                `Denied: a row-filtered scope rule matched this request, but scope '${request.ScopePath}' has no ` +
                `coherent permission type for row-level enforcement (only entity:read, view:run, entity:create, ` +
                `entity:update, and entity:delete do). Remove the row filter from the rule or grant a supported scope.`
            );
        }

        // The matching filtered allow rules, from the evaluator's full evaluation record.
        const filteredMatches = result.EvaluatedRules.filter(
            er => er.Level === 'key' && er.Matched && er.Result === 'Allowed' && er.Rule.RowFilterID != null
        );

        const md = new Metadata(); // global-provider-ok: server-side engine resolving entities under the server's single default provider
        const bindings: APIKeyRowFilterBinding[] = [];
        const effective: EffectiveFilterEntry[] = [];
        const seen = new Set<string>();

        for (const match of filteredMatches) {
            const filterId = match.Rule.RowFilterID as string; // non-null by the filter above
            const pattern = match.Rule.Pattern;
            if (!pattern) {
                return deny(
                    `Denied: row-filtered scope rule ${match.Rule.Id} has no ResourcePattern — a filtered rule must ` +
                    `name a single exact entity. This is invalid configuration; fix the rule.`
                );
            }
            const entity = md.EntityByName(pattern);
            if (!entity) {
                return deny(
                    `Denied: row-filtered scope rule ${match.Rule.Id} names resource '${pattern}', which does not ` +
                    `resolve to an entity. A filtered rule's ResourcePattern must be an exact entity name; failing ` +
                    `closed rather than granting unfiltered access.`
                );
            }
            const filter = this.getRowLevelSecurityFilterById(filterId);
            if (!filter) {
                return deny(
                    `Denied: row filter ${filterId} referenced by scope rule ${match.Rule.Id} was not found in ` +
                    `metadata (dangling or not yet loaded). Failing closed.`
                );
            }

            const tokenError = this.validateRequiredActingTokens(filter, request.ActingContext);
            if (tokenError) {
                return deny(tokenError);
            }

            const dedupeKey = `${entity.ID}|${permissionType}|${filterId}`;
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                bindings.push({ EntityID: entity.ID, PermissionType: permissionType, FilterID: filterId });
                effective.push({ EntityName: entity.Name, FilterID: filterId, FilterText: filter.FilterText });
            }
        }

        if (bindings.length === 0) {
            return result;
        }
        return { ...result, RowFilterBindings: bindings, EffectiveFilter: effective };
    }

    /**
     * Validates that the acting context supplies every {{Acting*}} token the
     * filter's template requires, with a type-valid value. {{User*}} and
     * {{Scope*}} tokens resolve from the session user and need no acting
     * context. Returns a denial reason NAMING the offending token, or null when
     * everything required is present and valid.
     */
    private validateRequiredActingTokens(
        filter: RowLevelSecurityFilterInfo,
        actingContext: APIKeyActingContext | undefined
    ): string | null {
        const actingTokens = this.getFilterTokens(filter).filter(t => t.startsWith('Acting'));
        for (const token of actingTokens) {
            const error = this.validateActingToken(token, actingContext);
            if (error) {
                return `Denied: row filter '${filter.Name}' requires the {{${token}}} token, ${error}`;
            }
        }
        return null;
    }

    /**
     * Per-token validation for the registered {{Acting*}} vocabulary. Returns an
     * error fragment (appended after the token name) or null when valid.
     */
    private validateActingToken(token: string, ctx: APIKeyActingContext | undefined): string | null {
        switch (token) {
            case 'ActingOrganizationID':
            case 'ActingPersonID': {
                const value = token === 'ActingOrganizationID' ? ctx?.ActingOrganizationID : ctx?.ActingPersonID;
                if (value == null || value.length === 0) {
                    return `but no ${token} value was supplied in the acting context. Failing closed.`;
                }
                if (!GUID_PATTERN.test(value)) {
                    return `but the supplied ${token} value is not a valid GUID. Values are not coerced; failing closed.`;
                }
                return null;
            }
            case 'ActingScopeID': {
                const value = ctx?.ActingScopeID;
                if (value == null || value.length === 0) {
                    return `but no ActingScopeID value was supplied in the acting context. Failing closed.`;
                }
                if (!ACTING_SCOPE_ID_PATTERN.test(value)) {
                    return `but the supplied ActingScopeID value is not a valid bounded identifier ` +
                        `(1-128 chars of A-Z, a-z, 0-9, '_', '.', '-'). Failing closed.`;
                }
                return null;
            }
            case 'ActingCompanyIDs': {
                const value = ctx?.ActingCompanyIDs;
                if (!value || value.length === 0) {
                    return `but no ActingCompanyIDs values were supplied in the acting context (a non-empty array ` +
                        `of GUIDs is required). Failing closed.`;
                }
                const bad = value.find(v => !GUID_PATTERN.test(v));
                if (bad !== undefined) {
                    return `but an element of the supplied ActingCompanyIDs is not a valid GUID. Values are not ` +
                        `coerced; failing closed.`;
                }
                return null;
            }
            default:
                // An Acting-prefixed token outside the registered vocabulary is
                // invalid configuration (save-time validation rejects it); if it
                // reaches here through a stale cache, fail closed.
                return `but {{${token}}} is not a registered acting token. Failing closed.`;
        }
    }

    /**
     * Parses (and caches) the {{Token}} names out of a filter's FilterText.
     * Cached per FilterID keyed to the exact text it was parsed from — templates
     * are principal-independent so the parse is safe to cache; resolved values
     * never are and never enter this cache.
     */
    private getFilterTokens(filter: RowLevelSecurityFilterInfo): string[] {
        const text = filter.FilterText ?? '';
        const cached = this._filterTokenCache.get(filter.ID);
        if (cached && cached.text === text) {
            return cached.tokens;
        }
        const tokens: string[] = [];
        const pattern = /\{\{(\w+)\}\}/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            if (!tokens.includes(match[1])) {
                tokens.push(match[1]);
            }
        }
        this._filterTokenCache.set(filter.ID, { text, tokens });
        return tokens;
    }

    /**
     * Resolves a RowLevelSecurityFilter by ID from the metadata provider's
     * filter catalog (the same catalog role RLS uses).
     */
    private getRowLevelSecurityFilterById(filterId: string): RowLevelSecurityFilterInfo | undefined {
        return Metadata.Provider?.RowLevelSecurityFilters?.find(f => UUIDsEqual(f.ID, filterId)); // global-provider-ok: same resolution path EntityInfo uses for RLS filters
    }

    /**
     * Resolves the row-filter bindings for ALL of a key's scope rules that carry
     * a RowFilterID — the per-request stamp `context.ts` places on the cloned
     * session UserInfo (plan §5.5.1). Uses the same rule → entity →
     * permission-type mapping as authorization. Fail-closed per rule: a rule
     * whose entity, scope, or permission type cannot be resolved — or that is a
     * deny/Exclude rule, which cannot coherently carry a filter — produces NO
     * binding and logs an error (save-time validation makes these unreachable in
     * practice). Throws when the base engine has not loaded yet: returning an
     * empty binding set for a filtered key would be fail-open (plan §5.6 row 7).
     */
    public GetRowFilterBindingsForKey(apiKeyId: string): APIKeyRowFilterBinding[] {
        if (!this.Base.Loaded) {
            throw new Error(
                `[APIKeyEngine] GetRowFilterBindingsForKey called before APIKeysEngineBase loaded. ` +
                `Refusing to return an empty binding set — a filtered key would get unfiltered access. ` +
                `Ensure APIKeyEngine.Config() runs at server startup before requests are served.`
            );
        }

        const md = new Metadata(); // global-provider-ok: server-side stamp resolution under the server's single default provider
        const bindings: APIKeyRowFilterBinding[] = [];
        const seen = new Set<string>();

        for (const rule of this.Base.GetKeyScopesByKeyId(apiKeyId)) {
            if (rule.RowFilterID == null) {
                continue;
            }
            if (rule.IsDeny || rule.PatternType === 'Exclude') {
                LogError(
                    `[APIKeyEngine] Scope rule ${rule.ID} carries RowFilterID ${rule.RowFilterID} on a ` +
                    `${rule.IsDeny ? 'deny' : 'Exclude'} rule — invalid configuration; no binding produced.`
                );
                continue;
            }
            const scope = this.Base.GetScopeById(rule.ScopeID);
            const permissionType = scope ? mapScopePathToPermissionType(scope.FullPath) : undefined;
            if (!permissionType) {
                LogError(
                    `[APIKeyEngine] Scope rule ${rule.ID} carries RowFilterID ${rule.RowFilterID} on scope ` +
                    `'${scope?.FullPath ?? rule.ScopeID}', which maps to no permission type — invalid ` +
                    `configuration; no binding produced.`
                );
                continue;
            }
            const entity = rule.ResourcePattern ? md.EntityByName(rule.ResourcePattern) : undefined;
            if (!entity) {
                LogError(
                    `[APIKeyEngine] Scope rule ${rule.ID} carries RowFilterID ${rule.RowFilterID} but its ` +
                    `ResourcePattern '${rule.ResourcePattern ?? ''}' does not resolve to an entity — invalid ` +
                    `configuration; no binding produced.`
                );
                continue;
            }
            const dedupeKey = `${entity.ID}|${permissionType}|${rule.RowFilterID}`;
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                bindings.push({ EntityID: entity.ID, PermissionType: permissionType, FilterID: rule.RowFilterID });
            }
        }

        // Deterministic order — the binding set participates in downstream
        // deterministic clause assembly (INV-2).
        return bindings.sort((a, b) =>
            a.EntityID.localeCompare(b.EntityID) ||
            a.PermissionType.localeCompare(b.PermissionType) ||
            a.FilterID.localeCompare(b.FilterID)
        );
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
        // The hash is always a SHA-256 hex digest. Enforce that at this public entry point so the
        // guarantee holds at the SQL sink (ExtraFilter is a raw SQL fragment) regardless of caller —
        // a non-conforming value can never carry a quote and therefore cannot inject.
        if (!/^[a-f0-9]{64}$/i.test(hash)) {
            return { Valid: false, Reason: 'API key not found' };
        }
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
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        try {
            const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
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
