/**
 * @fileoverview Core encryption engine for MemberJunction field-level encryption.
 *
 * The EncryptionEngine is the central class for all encryption and decryption
 * operations. It provides:
 *
 * - AES-256-GCM/CBC encryption with authenticated encryption support
 * - Pluggable key sources via the ClassFactory pattern
 * - Multi-level caching for performance (inherited from EncryptionEngineBase)
 * - Self-describing encrypted value format
 * - Key rotation support with explicit lookup overrides
 *
 * ## Usage
 *
 * ```typescript
 * import { EncryptionEngine } from '@memberjunction/encryption';
 *
 * // First, configure the engine to load metadata
 * await EncryptionEngine.Instance.Config(false, contextUser);
 *
 * // Encrypt a value
 * const encrypted = await EncryptionEngine.Instance.Encrypt(
 *   'sensitive-data',
 *   encryptionKeyId,
 *   contextUser
 * );
 *
 * // Decrypt a value
 * const decrypted = await EncryptionEngine.Instance.Decrypt(encrypted, contextUser);
 *
 * // Check if a value is encrypted
 * if (EncryptionEngine.Instance.IsEncrypted(someValue)) {
 *   // Handle encrypted value
 * }
 * ```
 *
 * ## Security Design
 *
 * - Keys are never stored in memory longer than needed
 * - Authenticated encryption (GCM) prevents tampering
 * - Random IVs for each encryption operation
 * - Self-describing format enables proper key lookup
 * - Secure defaults (fail-safe on errors)
 *
 * @module @memberjunction/encryption
 */

import * as crypto from 'crypto';
import { MJGlobal, ENCRYPTION_MARKER, IsValueEncrypted } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { APIKeyEntity, APIKeyUsageLogEntity, EncryptionEngineBase, UserEntity } from '@memberjunction/core-entities';
import { EncryptionKeySourceBase } from './EncryptionKeySourceBase';
import {
    EncryptedValueParts,
    KeyConfiguration,
    CreateAPIKeyParams,
    CreateAPIKeyResult,
    APIKeyValidationResult,
    ValidateAPIKeyOptions,
    GeneratedAPIKey
} from './interfaces';
import { CredentialEngine } from '@memberjunction/credentials';

/** Regular expression pattern for validating API key format */
const API_KEY_FORMAT_REGEX = /^mj_sk_[a-f0-9]{64}$/;

/**
 * Cache entry with TTL for key material.
 *
 * @internal
 */
interface CacheEntry<T> {
    value: T;
    expiry: Date;
}

/**
 * Default cache time-to-live in milliseconds (5 minutes).
 * Balances security (key changes take effect) with performance.
 */
const DEFAULT_KEY_MATERIAL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Core encryption engine for field-level encryption operations.
 *
 * This class extends EncryptionEngineBase to inherit metadata caching for
 * encryption keys, algorithms, and key sources. It adds the actual
 * encryption/decryption operations using Node.js crypto.
 *
 * Use `EncryptionEngine.Instance` to access the singleton.
 *
 * ## Thread Safety
 *
 * The engine is designed to be safe for concurrent use in async contexts.
 * Cache operations are atomic Map operations and crypto operations
 * use per-call state.
 *
 * ## Error Handling
 *
 * The engine throws descriptive errors for:
 * - Missing keys or configurations
 * - Invalid encrypted value format
 * - Decryption failures (including auth tag mismatch)
 * - Key length mismatches
 *
 * Callers should catch and handle errors appropriately.
 */
export class EncryptionEngine extends EncryptionEngineBase {
    /**
     * Cache for decrypted key material.
     * Maps 'keyId:version' to Buffer.
     * This is separate from the base class caches since key material
     * is sensitive and needs different handling.
     *
     * @private
     */
    private _keyMaterialCache: Map<string, CacheEntry<Buffer>> = new Map();

    /**
     * Cache for initialized key source instances.
     * Maps driver class name to provider instance.
     *
     * @private
     */
    private _keySourceCache: Map<string, EncryptionKeySourceBase> = new Map();

    /**
     * Cache TTL for key material in milliseconds.
     * Can be configured for testing or specific deployment needs.
     *
     * @private
     */
    private readonly _keyMaterialCacheTtlMs: number = DEFAULT_KEY_MATERIAL_CACHE_TTL_MS;

    /**
     * Gets the singleton instance of the encryption engine.
     *
     * The instance is created on first access and reused thereafter.
     *
     * @example
     * ```typescript
     * const engine = EncryptionEngine.Instance;
     * await engine.Config(false, contextUser);
     * const encrypted = await engine.Encrypt(data, keyId, contextUser);
     * ```
     */
    public static override get Instance(): EncryptionEngine {
        return super.getInstance<EncryptionEngine>();
    }

    /**
     * Configures the engine by loading encryption metadata from the database.
     *
     * This overrides the base Config to ensure proper initialization.
     * Must be called before performing encryption/decryption operations.
     *
     * @param forceRefresh - If true, reloads data even if already loaded
     * @param contextUser - User context for database access (required server-side)
     * @param provider - Optional metadata provider override
     */
    public override async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await super.Config(forceRefresh, contextUser, provider);
    }

    /**
     * Encrypts a value using the specified encryption key.
     *
     * The method:
     * 1. Gets the key configuration from cached metadata
     * 2. Retrieves key material from the configured source (cached)
     * 3. Generates a random IV
     * 4. Encrypts the data using the configured algorithm
     * 5. Returns a self-describing encrypted string
     *
     * ## Encrypted Format
     *
     * The result format is:
     * `$ENC$<keyId>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`
     *
     * This format contains all information needed for decryption.
     *
     * @param plaintext - The value to encrypt (string or Buffer)
     * @param encryptionKeyId - UUID of the encryption key to use
     * @param contextUser - User context for database access
     * @returns The encrypted value as a string
     *
     * @throws Error if the key cannot be found or is invalid
     * @throws Error if key material retrieval fails
     *
     * @example
     * ```typescript
     * const encrypted = await engine.Encrypt(
     *   'secret-api-key',
     *   '550e8400-e29b-41d4-a716-446655440000',
     *   currentUser
     * );
     * // Returns: $ENC$550e8400-....$AES-256-GCM$<iv>$<ciphertext>$<authTag>
     * ```
     */
    async Encrypt(
        plaintext: string | Buffer,
        encryptionKeyId: string,
        contextUser?: UserInfo
    ): Promise<string> {
        // Handle null/undefined - return as-is (cannot encrypt nothing)
        if (plaintext === null || plaintext === undefined) {
            return plaintext as unknown as string;
        }

        // Validate the key ID format
        if (!encryptionKeyId || !this.isValidUUID(encryptionKeyId)) {
            throw new Error(
                `Invalid encryption key ID: "${encryptionKeyId}". ` +
                'Must be a valid UUID.'
            );
        }

        // Ensure engine is configured
        await this.ensureConfigured(contextUser);

        // Get key configuration from cached metadata
        const keyConfig = this.buildKeyConfiguration(encryptionKeyId);

        // Get the key material
        const keyMaterial = await this.getKeyMaterial(keyConfig);

        // Perform encryption
        return this.performEncryption(plaintext, keyConfig, keyMaterial);
    }

    /**
     * Decrypts an encrypted value.
     *
     * If the value is not encrypted (doesn't start with marker), returns it unchanged.
     *
     * The method:
     * 1. Parses the encrypted value to extract key ID and parameters
     * 2. Gets the key configuration from cached metadata
     * 3. Retrieves key material from the configured source (cached)
     * 4. Decrypts using the algorithm and IV from the encrypted value
     * 5. Verifies the auth tag for AEAD algorithms
     *
     * @param value - The value to decrypt (may or may not be encrypted)
     * @param contextUser - User context for database access
     * @returns The decrypted plaintext, or original value if not encrypted
     *
     * @throws Error if decryption fails (invalid key, corrupted data, auth tag mismatch)
     *
     * @example
     * ```typescript
     * // Decrypt an encrypted value
     * const plaintext = await engine.Decrypt(encryptedValue, contextUser);
     *
     * // Non-encrypted values pass through unchanged
     * const same = await engine.Decrypt('plain-text', contextUser);
     * // Returns: 'plain-text'
     * ```
     */
    async Decrypt(
        value: string,
        contextUser?: UserInfo
    ): Promise<string> {
        // If not encrypted, return as-is
        if (!this.IsEncrypted(value)) {
            return value;
        }

        // Parse the encrypted value
        const parsed = this.ParseEncryptedValue(value);

        // Ensure engine is configured
        await this.ensureConfigured(contextUser);

        // Get key configuration from cached metadata
        const keyConfig = this.buildKeyConfiguration(parsed.keyId);

        // Get key material
        const keyMaterial = await this.getKeyMaterial(keyConfig);

        // Perform decryption
        return this.performDecryption(parsed, keyConfig, keyMaterial);
    }

    /**
     * Checks if a value is encrypted.
     *
     * Encrypted values start with the marker prefix (default: '$ENC$').
     * This also checks for the encrypted sentinel value.
     * This is a fast, synchronous check that doesn't require database access.
     *
     * @param value - The value to check
     * @param encryptionMarker - Optional custom marker to check for (defaults to '$ENC$')
     * @returns `true` if the value appears to be encrypted or is the sentinel value
     *
     * @example
     * ```typescript
     * if (engine.IsEncrypted(fieldValue)) {
     *   const decrypted = await engine.Decrypt(fieldValue, user);
     * }
     *
     * // With custom marker from key
     * const key = engine.GetKeyByID(keyId);
     * if (engine.IsEncrypted(fieldValue, key?.Marker)) {
     *   const decrypted = await engine.Decrypt(fieldValue, user);
     * }
     * ```
     */
    IsEncrypted(value: unknown, encryptionMarker?: string): boolean {
        return IsValueEncrypted(value as string, encryptionMarker);
    }

    /**
     * Parses an encrypted value string into its component parts.
     *
     * Use this when you need to inspect the encrypted value without decrypting.
     *
     * @param value - The encrypted value string
     * @returns Parsed components (marker, keyId, algorithm, iv, ciphertext, authTag)
     *
     * @throws Error if the format is invalid
     *
     * @example
     * ```typescript
     * const parts = engine.ParseEncryptedValue(encryptedValue);
     * console.log(`Encrypted with key: ${parts.keyId}`);
     * console.log(`Algorithm: ${parts.algorithm}`);
     * ```
     */
    ParseEncryptedValue(value: string): EncryptedValueParts {
        if (!value || typeof value !== 'string') {
            throw new Error('Cannot parse encrypted value: input is null or not a string');
        }

        // Split on $ and filter empty parts
        // Format: $ENC$keyId$algorithm$iv$ciphertext[$authTag]
        const parts = value.split('$').filter(p => p !== '');

        if (parts.length < 5) {
            throw new Error(
                `Invalid encrypted value format: expected at least 5 parts ` +
                `(marker, keyId, algorithm, iv, ciphertext), got ${parts.length}. ` +
                `Value may be corrupted or not properly encrypted.`
            );
        }

        // Validate marker
        if (parts[0] !== 'ENC') {
            throw new Error(
                `Invalid encryption marker: expected "ENC", got "${parts[0]}". ` +
                `Value may not be a properly encrypted MemberJunction field.`
            );
        }

        // Validate key ID looks like a UUID
        if (!this.isValidUUID(parts[1])) {
            throw new Error(
                `Invalid key ID in encrypted value: "${parts[1]}". ` +
                `Expected a valid UUID.`
            );
        }

        return {
            marker: ENCRYPTION_MARKER,
            keyId: parts[1],
            algorithm: parts[2],
            iv: parts[3],
            ciphertext: parts[4],
            authTag: parts[5] // May be undefined for non-AEAD
        };
    }

    /**
     * Validates that key material is accessible at a given lookup value.
     *
     * Used before key rotation to verify the new key exists and is valid.
     * This prevents starting a rotation that would fail mid-way.
     *
     * @param lookupValue - The key source lookup value to validate
     * @param encryptionKeyId - The key ID (to get source configuration)
     * @param contextUser - User context for database access
     *
     * @throws Error if the key material cannot be accessed or is invalid
     *
     * @example
     * ```typescript
     * // Before rotation, validate the new key is ready
     * await engine.ValidateKeyMaterial(
     *   'MJ_ENCRYPTION_KEY_PII_NEW',
     *   existingKeyId,
     *   contextUser
     * );
     * // If no error, safe to proceed with rotation
     * ```
     */
    async ValidateKeyMaterial(
        lookupValue: string,
        encryptionKeyId: string,
        contextUser?: UserInfo
    ): Promise<void> {
        if (!lookupValue || typeof lookupValue !== 'string') {
            throw new Error(
                'Invalid lookup value for key validation. ' +
                'Provide the environment variable name or config key for the new key.'
            );
        }

        // Ensure engine is configured
        await this.ensureConfigured(contextUser);

        // Get the key configuration to know the source type and algorithm
        const keyConfig = this.buildKeyConfiguration(encryptionKeyId);

        // Get or create the key source
        const source = await this.getOrCreateKeySource(keyConfig.source.driverClass);

        // Try to retrieve the key from the new lookup value
        const keyMaterial = await source.GetKey(lookupValue);

        // Validate key length matches algorithm requirements
        const expectedBytes = keyConfig.algorithm.keyLengthBits / 8;
        if (keyMaterial.length !== expectedBytes) {
            throw new Error(
                `Key length mismatch: expected ${expectedBytes} bytes for ${keyConfig.algorithm.name}, ` +
                `got ${keyMaterial.length} bytes. ` +
                `Generate a key with: openssl rand -base64 ${expectedBytes}`
            );
        }
    }

    /**
     * Encrypts a value using a specific key lookup (for key rotation).
     *
     * During key rotation, we need to encrypt with the new key material
     * before updating the key metadata. This method allows specifying
     * an alternate lookup value for the key material.
     *
     * @param plaintext - The value to encrypt
     * @param encryptionKeyId - The key ID (for algorithm/marker config)
     * @param keyLookupValue - Alternate lookup value for key material
     * @param contextUser - User context for database access
     * @returns The encrypted value string
     *
     * @example
     * ```typescript
     * // During rotation, encrypt with new key before metadata update
     * const newEncrypted = await engine.EncryptWithLookup(
     *   decryptedData,
     *   keyId,
     *   'MJ_ENCRYPTION_KEY_PII_NEW',
     *   contextUser
     * );
     * ```
     */
    async EncryptWithLookup(
        plaintext: string | Buffer,
        encryptionKeyId: string,
        keyLookupValue: string,
        contextUser?: UserInfo
    ): Promise<string> {
        // Handle null/undefined
        if (plaintext === null || plaintext === undefined) {
            return plaintext as unknown as string;
        }

        // Ensure engine is configured
        await this.ensureConfigured(contextUser);

        // Get the base configuration
        const keyConfig = this.buildKeyConfiguration(encryptionKeyId);

        // Get key material using the overridden lookup value
        const keyMaterial = await this.getKeyMaterialWithLookup(
            keyConfig,
            keyLookupValue
        );

        // Perform encryption with the overridden key
        return this.performEncryption(plaintext, keyConfig, keyMaterial);
    }

    /**
     * Clears key material and source caches.
     *
     * Call after key rotation or configuration changes to ensure
     * fresh data is loaded. The base class metadata caches are
     * handled separately via RefreshAllItems().
     */
    ClearCaches(): void {
        this._keyMaterialCache.clear();
        // Don't clear source cache - sources can be reused
    }

    /**
     * Clears all caches including base class metadata caches.
     *
     * This is more aggressive than ClearCaches() and should be used
     * when you need to completely refresh all cached data.
     */
    async ClearAllCaches(): Promise<void> {
        this._keyMaterialCache.clear();
        await this.RefreshAllItems();
    }

    // ========================================================================
    // API KEY MANAGEMENT METHODS
    // ========================================================================

    /**
     * Generates a new API key with the standard MemberJunction format.
     *
     * The key consists of:
     * - Prefix: `mj_sk_`
     * - Random data: 64 hexadecimal characters (32 bytes)
     *
     * Returns both the raw key (to show user once) and the hash (for storage).
     *
     * @returns Object containing the raw key and its SHA-256 hash
     *
     * @example
     * ```typescript
     * const { raw, hash } = EncryptionEngine.Instance.GenerateAPIKey();
     * console.log('Give this to the user (once!):', raw);
     * // Store hash in database, never store raw
     * ```
     */
    GenerateAPIKey(): GeneratedAPIKey {
        // Generate 32 bytes of cryptographically secure random data
        const randomData = crypto.randomBytes(32);
        const hexString = randomData.toString('hex'); // 64 hex chars

        const raw = `mj_sk_${hexString}`;
        const hash = crypto.createHash('sha256').update(raw).digest('hex');

        return { raw, hash };
    }

    /**
     * Hashes an API key for storage or comparison.
     *
     * Uses SHA-256 to create a one-way hash of the key.
     * This is what gets stored in the database.
     *
     * @param key - The raw API key to hash
     * @returns The SHA-256 hash as a 64-character hexadecimal string
     *
     * @example
     * ```typescript
     * const hash = EncryptionEngine.Instance.HashAPIKey(rawKey);
     * // Compare with stored hash for validation
     * ```
     */
    HashAPIKey(key: string): string {
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    /**
     * Validates that an API key has the correct format.
     *
     * Valid format: `mj_sk_` followed by exactly 64 hexadecimal characters.
     * Total length: 70 characters.
     *
     * @param key - The API key to validate
     * @returns `true` if the key format is valid
     *
     * @example
     * ```typescript
     * if (!EncryptionEngine.Instance.IsValidAPIKeyFormat(key)) {
     *   throw new Error('Invalid API key format');
     * }
     * ```
     */
    IsValidAPIKeyFormat(key: string): boolean {
        return API_KEY_FORMAT_REGEX.test(key);
    }

    /**
     * Creates a new API key and stores it in the database.
     *
     * This method:
     * 1. Generates a new cryptographically secure API key
     * 2. Hashes the key for secure storage
     * 3. Creates an APIKey entity record in the database
     * 4. Returns the raw key (shown once) and the database ID
     *
     * **CRITICAL**: The raw key is only returned once and cannot be recovered.
     * Instruct users to save it immediately in a secure location.
     *
     * @param params - Configuration for the new API key
     * @param contextUser - User context for database operations (typically the creator)
     * @returns Result with the raw key (show once!) and database ID
     *
     * @example
     * ```typescript
     * const result = await EncryptionEngine.Instance.CreateAPIKey({
     *   userId: 'user-guid-here',
     *   label: 'MCP Server Integration',
     *   description: 'Used for Claude Desktop connections',
     *   expiresAt: new Date('2025-12-31')
     * }, currentUser);
     *
     * if (result.success) {
     *   console.log('Save this key now!', result.rawKey);
     * }
     * ```
     */
    async CreateAPIKey(
        params: CreateAPIKeyParams,
        contextUser: UserInfo
    ): Promise<CreateAPIKeyResult> {
        try {
            // Generate the key
            const { raw, hash } = this.GenerateAPIKey();

            // Create the entity record
            const md = new Metadata();
            const apiKey = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', contextUser);

            apiKey.Hash = hash;
            apiKey.UserID = params.userId;
            apiKey.Label = params.label;
            apiKey.Description = params.description ?? null;
            apiKey.ExpiresAt = params.expiresAt ?? null;
            apiKey.Status = 'Active';
            apiKey.CreatedByUserID = contextUser.ID;

            const success = await apiKey.Save();

            if (!success) {
                return {
                    success: false,
                    error: 'Failed to save API key to database'
                };
            }

            return {
                success: true,
                rawKey: raw,
                apiKeyId: apiKey.ID
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                success: false,
                error: `Failed to create API key: ${message}`
            };
        }
    }

    /**
     * Validates an API key and returns the associated user context.
     *
     * This method:
     * 1. Validates the key format
     * 2. Hashes the key and looks it up in the CredentialEngine cache
     * 3. Checks the key is active and not expired
     * 4. Loads the associated user from the database
     * 5. Updates LastUsedAt and logs usage (logging failures cause validation to fail)
     *
     * For best performance, ensure CredentialEngine is configured before calling.
     *
     * @param options - Validation options including the raw key and request context for logging
     * @param contextUser - System user context for database operations
     * @returns Validation result with user context if valid
     *
     * @example
     * ```typescript
     * const result = await EncryptionEngine.Instance.ValidateAPIKey(
     *   {
     *     rawKey: request.headers['x-api-key'],
     *     endpoint: '/graphql',
     *     method: 'POST',
     *     operation: 'GetUsers',
     *     statusCode: 200,
     *     responseTimeMs: 150,
     *     ipAddress: request.ip,
     *     userAgent: request.headers['user-agent']
     *   },
     *   systemUser
     * );
     *
     * if (result.isValid) {
     *   // Use result.user for authorized operations
     *   await doSomething(result.user);
     * } else {
     *   throw new Error(result.error);
     * }
     * ```
     */
    async ValidateAPIKey(
        options: ValidateAPIKeyOptions,
        contextUser: UserInfo
    ): Promise<APIKeyValidationResult> {
        const { rawKey, endpoint, method, operation, statusCode, responseTimeMs, ipAddress, userAgent } = options;

        // 1. Validate format first (fast fail)
        if (!this.IsValidAPIKeyFormat(rawKey)) {
            return { isValid: false, error: 'Invalid API key format' };
        }

        // 2. Hash the key for cache lookup
        const keyHash = this.HashAPIKey(rawKey);

        // 3. Look up in CredentialEngine cache (fast!)
        const cachedKey = CredentialEngine.Instance.getAPIKeyByHash(keyHash);

        if (!cachedKey) {
            return { isValid: false, error: 'API key not found' };
        }

        // 4. Check if key is active
        if (cachedKey.Status !== 'Active') {
            return { isValid: false, error: 'API key has been revoked' };
        }

        // 5. Check expiration
        if (cachedKey.ExpiresAt && cachedKey.ExpiresAt < new Date()) {
            return { isValid: false, error: 'API key has expired' };
        }

        // 6. Get the user from RunView
        const rv = new RunView();
        const result = await rv.RunView<UserEntity>({
            EntityName: 'Users',
            ExtraFilter: `ID = '${cachedKey.UserID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const userRecord = result.Results ? result.Results[0] : null;
        if (!userRecord) {
            return { isValid: false, error: 'User not found for API key' };
        }

        if (!userRecord.IsActive) {
            return { isValid: false, error: 'User account is inactive' };
        }

        // 7. Update LastUsedAt on the cached key entity
        cachedKey.LastUsedAt = new Date();
        const lastUsedSaved = await cachedKey.Save();
        if (!lastUsedSaved) {
            LogError(`Failed to update LastUsedAt for API key ${cachedKey.ID}`);
            return { isValid: false, error: 'Failed to update API key usage timestamp' };
        }

        // 8. Log usage - logging failures cause validation to fail
        const md = new Metadata();
        const usageLog = await md.GetEntityObject<APIKeyUsageLogEntity>(
            'MJ: API Key Usage Logs',
            contextUser
        );
        usageLog.APIKeyID = cachedKey.ID;
        usageLog.Endpoint = endpoint;
        usageLog.Method = method;
        usageLog.Operation = operation ?? null;
        usageLog.StatusCode = statusCode;
        usageLog.ResponseTimeMs = responseTimeMs ?? null;
        usageLog.IPAddress = ipAddress ?? null;
        usageLog.UserAgent = userAgent ?? null;

        const logSaved = await usageLog.Save();
        if (!logSaved) {
            LogError(`Failed to save API key usage log for key ${cachedKey.ID}: ${usageLog.LatestResult?.Message}`);
            return { isValid: false, error: 'Failed to log API key usage' };
        }

        // 9. Create UserInfo from the entity
        const user = new UserInfo(undefined, userRecord.GetAll());

        return {
            isValid: true,
            user,
            apiKeyId: cachedKey.ID
        };
    }

    /**
     * Revokes an API key, permanently disabling it.
     *
     * Once revoked, an API key cannot be reactivated. Create a new key if needed.
     *
     * @param apiKeyId - The database ID of the API key to revoke
     * @param contextUser - User context for the operation
     * @returns `true` if successfully revoked
     *
     * @example
     * ```typescript
     * const revoked = await EncryptionEngine.Instance.RevokeAPIKey(
     *   keyId,
     *   currentUser
     * );
     * if (revoked) {
     *   console.log('API key has been revoked');
     * }
     * ```
     */
    async RevokeAPIKey(apiKeyId: string, contextUser: UserInfo): Promise<boolean> {
        const md = new Metadata();
        const apiKey = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', contextUser);

        const loaded = await apiKey.Load(apiKeyId);
        if (!loaded) {
            return false;
        }

        apiKey.Status = 'Revoked';
        return await apiKey.Save();
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

    /**
     * Ensures the engine is configured before operations.
     *
     * @private
     */
    private async ensureConfigured(contextUser?: UserInfo): Promise<void> {
        if (!this.Loaded) {
            await this.Config(false, contextUser);
        }
    }

    /**
     * Builds a KeyConfiguration object from the cached metadata.
     *
     * @private
     */
    private buildKeyConfiguration(keyId: string): KeyConfiguration {
        const keyConfig = this.GetKeyConfiguration(keyId);
        if (!keyConfig) {
            throw new Error(
                `Encryption key not found: ${keyId}. ` +
                'Ensure the key exists and the engine is configured.'
            );
        }

        const { key, algorithm, source } = keyConfig;

        // Validate key is usable
        if (key.Status === 'Expired') {
            throw new Error(
                `Encryption key "${key.Name}" has expired. ` +
                'Please rotate to a new key or update the expiration.'
            );
        }

        if (!key.IsActive) {
            throw new Error(
                `Encryption key "${key.Name}" is not active. ` +
                'Activate the key or select a different active key.'
            );
        }

        if (!algorithm.IsActive) {
            throw new Error(
                `Encryption algorithm "${algorithm.Name}" is not active. ` +
                'The key is configured to use a disabled algorithm.'
            );
        }

        if (!source.IsActive) {
            throw new Error(
                `Encryption key source "${source.Name}" is not active. ` +
                'The key is configured to use a disabled source type.'
            );
        }

        return {
            keyId: key.ID,
            keyVersion: key.KeyVersion || '1',
            marker: key.Marker || ENCRYPTION_MARKER,
            algorithm: {
                name: algorithm.Name,
                nodeCryptoName: algorithm.NodeCryptoName,
                keyLengthBits: algorithm.KeyLengthBits,
                ivLengthBytes: algorithm.IVLengthBytes,
                isAEAD: !!algorithm.IsAEAD
            },
            source: {
                driverClass: source.DriverClass,
                lookupValue: key.KeyLookupValue
            }
        };
    }

    /**
     * Performs the actual encryption operation.
     *
     * @private
     */
    private performEncryption(
        plaintext: string | Buffer,
        keyConfig: KeyConfiguration,
        keyMaterial: Buffer
    ): string {
        // Generate random IV
        const iv = crypto.randomBytes(keyConfig.algorithm.ivLengthBytes);

        // Create cipher options
        const cipherOptions: crypto.CipherGCMOptions | undefined =
            keyConfig.algorithm.isAEAD ? { authTagLength: 16 } : undefined;

        // Create cipher
        const cipher = crypto.createCipheriv(
            keyConfig.algorithm.nodeCryptoName,
            keyMaterial,
            iv,
            cipherOptions
        );

        // Convert plaintext to buffer
        const data = typeof plaintext === 'string'
            ? Buffer.from(plaintext, 'utf8')
            : plaintext;

        // Encrypt
        const ciphertext = Buffer.concat([
            cipher.update(data),
            cipher.final()
        ]);

        // Build the serialized format
        const parts: string[] = [
            keyConfig.marker,
            keyConfig.keyId,
            keyConfig.algorithm.name,
            iv.toString('base64'),
            ciphertext.toString('base64')
        ];

        // Add auth tag for AEAD algorithms
        if (keyConfig.algorithm.isAEAD) {
            const authTag = (cipher as crypto.CipherGCM).getAuthTag();
            parts.push(authTag.toString('base64'));
        }

        return parts.join('$');
    }

    /**
     * Performs the actual decryption operation.
     *
     * @private
     */
    private performDecryption(
        parsed: EncryptedValueParts,
        keyConfig: KeyConfiguration,
        keyMaterial: Buffer
    ): string {
        // Decode IV from base64
        const iv = Buffer.from(parsed.iv, 'base64');

        // Validate IV length
        if (iv.length !== keyConfig.algorithm.ivLengthBytes) {
            throw new Error(
                `IV length mismatch: expected ${keyConfig.algorithm.ivLengthBytes} bytes, ` +
                `got ${iv.length} bytes. The encrypted value may be corrupted.`
            );
        }

        // Create decipher options
        const decipherOptions: crypto.CipherGCMOptions | undefined =
            keyConfig.algorithm.isAEAD ? { authTagLength: 16 } : undefined;

        // Create decipher
        const decipher = crypto.createDecipheriv(
            keyConfig.algorithm.nodeCryptoName,
            keyMaterial,
            iv,
            decipherOptions
        );

        // Set auth tag for AEAD algorithms
        if (keyConfig.algorithm.isAEAD) {
            if (!parsed.authTag) {
                throw new Error(
                    `Missing authentication tag for ${keyConfig.algorithm.name}. ` +
                    `The encrypted value may be corrupted or was encrypted with a different algorithm.`
                );
            }

            const authTag = Buffer.from(parsed.authTag, 'base64');
            (decipher as crypto.DecipherGCM).setAuthTag(authTag);
        }

        // Decode ciphertext
        const ciphertext = Buffer.from(parsed.ciphertext, 'base64');

        // Decrypt
        try {
            const plaintext = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final()
            ]);

            return plaintext.toString('utf8');
        } catch (err) {
            // Decryption errors - could be wrong key, corrupted data, or auth tag mismatch
            const message = err instanceof Error ? err.message : String(err);

            if (message.includes('Unsupported state') || message.includes('auth')) {
                throw new Error(
                    'Decryption failed: authentication tag mismatch. ' +
                    'This could mean the data was tampered with, the wrong key was used, ' +
                    'or the encrypted value is corrupted.'
                );
            }

            throw new Error(
                `Decryption failed: ${message}. ` +
                'The key may be incorrect or the encrypted value may be corrupted.'
            );
        }
    }

    /**
     * Gets key material from cache or source.
     *
     * @private
     */
    private async getKeyMaterial(config: KeyConfiguration): Promise<Buffer> {
        const cacheKey = `${config.keyId}:${config.keyVersion}`;

        // Check cache
        const cached = this._keyMaterialCache.get(cacheKey);
        if (cached && cached.expiry > new Date()) {
            return cached.value;
        }

        // Get or create the key source
        const source = await this.getOrCreateKeySource(config.source.driverClass);

        // Get key from source
        const keyMaterial = await source.GetKey(
            config.source.lookupValue,
            config.keyVersion
        );

        // Validate key length
        this.validateKeyLength(keyMaterial, config);

        // Cache it
        this._keyMaterialCache.set(cacheKey, {
            value: keyMaterial,
            expiry: new Date(Date.now() + this._keyMaterialCacheTtlMs)
        });

        return keyMaterial;
    }

    /**
     * Gets key material using an overridden lookup value (for rotation).
     *
     * @private
     */
    private async getKeyMaterialWithLookup(
        config: KeyConfiguration,
        lookupValue: string
    ): Promise<Buffer> {
        // Don't cache - this is for rotation with temporary lookup values
        const source = await this.getOrCreateKeySource(config.source.driverClass);

        const keyMaterial = await source.GetKey(lookupValue, config.keyVersion);

        this.validateKeyLength(keyMaterial, config);

        return keyMaterial;
    }

    /**
     * Gets or creates a key source instance.
     *
     * @private
     */
    private async getOrCreateKeySource(
        driverClass: string
    ): Promise<EncryptionKeySourceBase> {
        // Check cache
        let source = this._keySourceCache.get(driverClass);

        if (source) {
            return source;
        }

        // Create new instance via ClassFactory
        try {
            const result = MJGlobal.Instance.ClassFactory.CreateInstance<EncryptionKeySourceBase>(
                EncryptionKeySourceBase,
                driverClass
            );
            if (result) {
                source = result;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Failed to create key source "${driverClass}": ${message}. ` +
                'Ensure the key source provider is properly registered.'
            );
        }

        if (!source) {
            throw new Error(
                `Key source "${driverClass}" not found. ` +
                'Ensure the provider class is registered with @RegisterClass.'
            );
        }

        // Initialize the source
        await source.Initialize();

        // Validate configuration
        if (!source.ValidateConfiguration()) {
            LogError(
                `Key source "${driverClass}" configuration validation failed. ` +
                'The source may not work correctly.'
            );
        }

        // Cache it
        this._keySourceCache.set(driverClass, source);

        return source;
    }

    /**
     * Validates that key material has the correct length for the algorithm.
     *
     * @private
     */
    private validateKeyLength(keyMaterial: Buffer, config: KeyConfiguration): void {
        const expectedBytes = config.algorithm.keyLengthBits / 8;

        if (keyMaterial.length !== expectedBytes) {
            throw new Error(
                `Key length mismatch for "${config.algorithm.name}": ` +
                `expected ${expectedBytes} bytes (${config.algorithm.keyLengthBits} bits), ` +
                `got ${keyMaterial.length} bytes (${keyMaterial.length * 8} bits). ` +
                `Generate a correct key with: openssl rand -base64 ${expectedBytes}`
            );
        }
    }

    /**
     * Validates that a string is a valid UUID.
     *
     * @private
     */
    private isValidUUID(value: string): boolean {
        if (!value || typeof value !== 'string') {
            return false;
        }

        // Standard UUID format
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidPattern.test(value);
    }
}
