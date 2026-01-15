import crypto from 'crypto';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { APIKeyEntity, APIScopeEntity, APIKeyScopeEntity, APIKeyUsageLogEntity } from '@memberjunction/core-entities';

/**
 * Result of API key generation including the plaintext key (only returned once)
 */
export interface APIKeyGenerationResult {
    success: boolean;
    apiKey?: string;  // Format: mj_sk_[64 hex chars] - ONLY returned on generation
    keyId?: string;
    hash?: string;
    errorMessage?: string;
}

/**
 * Result of API key validation
 */
export interface APIKeyValidationResult {
    valid: boolean;
    userInfo?: UserInfo;
    scopes?: string[];
    keyId?: string;
    errorMessage?: string;
}

/**
 * Options for logging API key usage
 */
export interface APIKeyUsageLogOptions {
    apiKeyId: string;
    endpoint?: string;
    operationName?: string;
    httpMethod?: string;
    statusCode?: number;
    responseTimeMs?: number;
    clientIp?: string;
    userAgent?: string;
    errorMessage?: string;
}

/**
 * Service for managing API keys for MCP server authentication
 *
 * Key Features:
 * - Generates cryptographically secure API keys with format: mj_sk_[64 hex chars]
 * - Stores only SHA-256 hashes, never plaintext keys
 * - Validates keys against stored hashes
 * - Manages scope-based permissions
 * - Logs all API key usage
 * - Handles key expiration and revocation
 */
export class APIKeyService {
    private static readonly KEY_PREFIX = 'mj_sk_';
    private static readonly KEY_BYTES = 32; // 256 bits
    private static readonly HASH_ALGORITHM = 'sha256';

    /**
     * Generate a new API key for a user with specified scopes
     *
     * @param userId - The user ID this key belongs to
     * @param scopeNames - Array of scope names (e.g., ['entities:read', 'agents:execute'])
     * @param createdByUserId - The user creating this key
     * @param name - Optional friendly name for the key
     * @param expiresAt - Optional expiration date
     * @param contextUser - User context for database operations
     * @returns APIKeyGenerationResult with the plaintext key (ONLY TIME IT'S AVAILABLE)
     */
    static async GenerateAPIKey(
        userId: string,
        scopeNames: string[],
        createdByUserId: string,
        name?: string,
        expiresAt?: Date,
        contextUser?: UserInfo
    ): Promise<APIKeyGenerationResult> {
        try {
            // Generate cryptographically secure random bytes
            const randomBytes = crypto.randomBytes(this.KEY_BYTES);
            const hexString = randomBytes.toString('hex');
            const apiKey = `${this.KEY_PREFIX}${hexString}`;

            // Generate SHA-256 hash for storage
            const hash = this.HashAPIKey(apiKey);

            // Create APIKey entity
            const md = new Metadata();
            const keyEntity = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', contextUser);

            keyEntity.Hash = hash;
            keyEntity.UserID = userId;
            keyEntity.CreatedByUserID = createdByUserId;
            keyEntity.Status = 'Active';

            if (name) {
                keyEntity.Name = name;
            }
            if (expiresAt) {
                keyEntity.ExpiresAt = expiresAt;
            }

            const saved = await keyEntity.Save();
            if (!saved) {
                return {
                    success: false,
                    errorMessage: `Failed to save API key: ${keyEntity.LatestResult?.Message || 'Unknown error'}`
                };
            }

            // Associate scopes with the key
            const scopeAssociationResult = await this.AssociateScopesWithKey(
                keyEntity.ID,
                scopeNames,
                contextUser
            );

            if (!scopeAssociationResult.success) {
                // Rollback: Delete the key if scope association failed
                await keyEntity.Delete();
                return {
                    success: false,
                    errorMessage: `Failed to associate scopes: ${scopeAssociationResult.errorMessage}`
                };
            }

            return {
                success: true,
                apiKey,  // ONLY time plaintext key is returned
                keyId: keyEntity.ID,
                hash
            };
        } catch (error) {
            return {
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Hash an API key using SHA-256
     * @param apiKey - Plaintext API key
     * @returns 64-character hex hash
     */
    static HashAPIKey(apiKey: string): string {
        return crypto
            .createHash(this.HASH_ALGORITHM)
            .update(apiKey)
            .digest('hex');
    }

    /**
     * Validate an API key and return associated user and scopes
     *
     * @param apiKey - Plaintext API key to validate
     * @param contextUser - User context for database operations
     * @returns APIKeyValidationResult with user info and scopes if valid
     */
    static async ValidateAPIKey(
        apiKey: string,
        contextUser?: UserInfo
    ): Promise<APIKeyValidationResult> {
        try {
            // Hash the provided key
            const hash = this.HashAPIKey(apiKey);

            // Look up key by hash
            const rv = new RunView();
            const keyResult = await rv.RunView<APIKeyEntity>({
                EntityName: 'MJ: API Keys',
                ExtraFilter: `Hash='${hash}' AND Status='Active'`,
                Fields: ['ID', 'UserID', 'ExpiresAt', 'LastUsedAt'],
                ResultType: 'entity_object'
            }, contextUser);

            if (!keyResult.Success || !keyResult.Results || keyResult.Results.length === 0) {
                return {
                    valid: false,
                    errorMessage: 'Invalid or inactive API key'
                };
            }

            const keyEntity = keyResult.Results[0];

            // Check expiration
            if (keyEntity.ExpiresAt && new Date(keyEntity.ExpiresAt) < new Date()) {
                return {
                    valid: false,
                    errorMessage: 'API key has expired'
                };
            }

            // Load associated scopes
            const scopesResult = await this.GetKeyScopeNames(keyEntity.ID, contextUser);
            if (!scopesResult.success) {
                return {
                    valid: false,
                    errorMessage: `Failed to load scopes: ${scopesResult.errorMessage}`
                };
            }

            // Load user info
            const md = new Metadata();
            const userEntity = await md.GetEntityObject<any>('Users', contextUser);
            const userLoaded = await userEntity.Load(keyEntity.UserID);

            if (!userLoaded) {
                return {
                    valid: false,
                    errorMessage: 'User not found for this API key'
                };
            }

            // Update LastUsedAt timestamp asynchronously (don't wait)
            this.UpdateLastUsedAt(keyEntity.ID, contextUser).catch(err => {
                console.error('Failed to update LastUsedAt:', err);
            });

            // Convert to UserInfo using constructor with data
            const userInfo = new UserInfo(undefined, userEntity.GetAll());

            return {
                valid: true,
                userInfo,
                scopes: scopesResult.scopes || [],
                keyId: keyEntity.ID
            };
        } catch (error) {
            return {
                valid: false,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Associate scopes with an API key
     */
    private static async AssociateScopesWithKey(
        apiKeyId: string,
        scopeNames: string[],
        contextUser?: UserInfo
    ): Promise<{ success: boolean; errorMessage?: string }> {
        try {
            // Load scope IDs
            const rv = new RunView();
            const scopesResult = await rv.RunView<APIScopeEntity>({
                EntityName: 'MJ: API Scopes',
                ExtraFilter: `Name IN ('${scopeNames.join("','")}')`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple'
            }, contextUser);

            if (!scopesResult.Success) {
                return {
                    success: false,
                    errorMessage: `Failed to load scopes: ${scopesResult.ErrorMessage}`
                };
            }

            const foundScopes = scopesResult.Results || [];
            if (foundScopes.length !== scopeNames.length) {
                const foundNames = foundScopes.map(s => s.Name);
                const missing = scopeNames.filter(n => !foundNames.includes(n));
                return {
                    success: false,
                    errorMessage: `Scopes not found: ${missing.join(', ')}`
                };
            }

            // Create APIKeyScope records
            const md = new Metadata();
            for (const scope of foundScopes) {
                const keyScopeEntity = await md.GetEntityObject<APIKeyScopeEntity>(
                    'MJ: API Key Scopes',
                    contextUser
                );
                keyScopeEntity.APIKeyID = apiKeyId;
                keyScopeEntity.APIScopeID = scope.ID;

                const saved = await keyScopeEntity.Save();
                if (!saved) {
                    return {
                        success: false,
                        errorMessage: `Failed to save scope association: ${keyScopeEntity.LatestResult?.Message}`
                    };
                }
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get scope names for an API key
     */
    private static async GetKeyScopeNames(
        apiKeyId: string,
        contextUser?: UserInfo
    ): Promise<{ success: boolean; scopes?: string[]; errorMessage?: string }> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ Name: string }>({
                EntityName: 'MJ: API Key Scopes',
                ExtraFilter: `APIKeyID='${apiKeyId}'`,
                Fields: ['Scope'], // Assuming view includes Scope name via FK
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success) {
                return {
                    success: false,
                    errorMessage: result.ErrorMessage
                };
            }

            const scopes = (result.Results || []).map(r => r.Name);
            return { success: true, scopes };
        } catch (error) {
            return {
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Update the LastUsedAt timestamp for an API key
     */
    private static async UpdateLastUsedAt(
        apiKeyId: string,
        contextUser?: UserInfo
    ): Promise<void> {
        try {
            const md = new Metadata();
            const keyEntity = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', contextUser);
            const loaded = await keyEntity.Load(apiKeyId);

            if (loaded) {
                keyEntity.LastUsedAt = new Date();
                await keyEntity.Save();
            }
        } catch (error) {
            // Silent failure for non-critical operation
            console.error('Failed to update LastUsedAt:', error);
        }
    }

    /**
     * Revoke an API key (set status to 'Revoked')
     *
     * @param apiKeyId - The key ID to revoke
     * @param contextUser - User context
     * @returns Success status
     */
    static async RevokeAPIKey(
        apiKeyId: string,
        contextUser?: UserInfo
    ): Promise<{ success: boolean; errorMessage?: string }> {
        try {
            const md = new Metadata();
            const keyEntity = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', contextUser);
            const loaded = await keyEntity.Load(apiKeyId);

            if (!loaded) {
                return {
                    success: false,
                    errorMessage: 'API key not found'
                };
            }

            keyEntity.Status = 'Revoked';
            const saved = await keyEntity.Save();

            if (!saved) {
                return {
                    success: false,
                    errorMessage: `Failed to revoke key: ${keyEntity.LatestResult?.Message}`
                };
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Log API key usage to the APIKeyUsageLog table
     *
     * @param options - Usage log options
     * @param contextUser - User context
     */
    static async LogAPIKeyUsage(
        options: APIKeyUsageLogOptions,
        contextUser?: UserInfo
    ): Promise<void> {
        try {
            const md = new Metadata();
            const logEntity = await md.GetEntityObject<APIKeyUsageLogEntity>(
                'MJ: API Key Usage Logs',
                contextUser
            );

            logEntity.APIKeyID = options.apiKeyId;
            logEntity.Endpoint = options.endpoint || null;
            logEntity.OperationName = options.operationName || null;
            logEntity.HTTPMethod = options.httpMethod || null;
            logEntity.StatusCode = options.statusCode || null;
            logEntity.ResponseTimeMS = options.responseTimeMs || null;
            logEntity.ClientIP = options.clientIp || null;
            logEntity.UserAgent = options.userAgent || null;
            logEntity.ErrorMessage = options.errorMessage || null;

            await logEntity.Save();
        } catch (error) {
            // Silent failure for logging - don't break the request
            console.error('Failed to log API key usage:', error);
        }
    }

    /**
     * Check if an API key has a specific scope
     *
     * @param scopes - Array of scope names the key has
     * @param requiredScope - The scope to check for
     * @returns True if key has the scope (supports wildcards like admin:*)
     */
    static HasScope(scopes: string[], requiredScope: string): boolean {
        // Check for exact match
        if (scopes.includes(requiredScope)) {
            return true;
        }

        // Check for admin:* wildcard
        if (scopes.includes('admin:*')) {
            return true;
        }

        // Check for category wildcards (e.g., entities:* grants entities:read and entities:write)
        const requiredParts = requiredScope.split(':');
        if (requiredParts.length === 2) {
            const categoryWildcard = `${requiredParts[0]}:*`;
            if (scopes.includes(categoryWildcard)) {
                return true;
            }
        }

        return false;
    }
}
