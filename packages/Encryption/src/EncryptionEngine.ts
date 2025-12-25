/**
 * @fileoverview Core encryption engine for MemberJunction field-level encryption.
 *
 * The EncryptionEngine is the central class for all encryption and decryption
 * operations. It provides:
 *
 * - AES-256-GCM/CBC encryption with authenticated encryption support
 * - Pluggable key sources via the ClassFactory pattern
 * - Multi-level caching for performance
 * - Self-describing encrypted value format
 * - Key rotation support with explicit lookup overrides
 *
 * ## Usage
 *
 * ```typescript
 * import { EncryptionEngine } from '@memberjunction/encryption';
 *
 * const engine = EncryptionEngine.Instance;
 *
 * // Encrypt a value
 * const encrypted = await engine.Encrypt(
 *   'sensitive-data',
 *   encryptionKeyId,
 *   contextUser
 * );
 *
 * // Decrypt a value
 * const decrypted = await engine.Decrypt(encrypted, contextUser);
 *
 * // Check if a value is encrypted
 * if (engine.IsEncrypted(someValue)) {
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
import { MJGlobal, ENCRYPTION_MARKER } from '@memberjunction/global';
import { LogError, RunView, UserInfo } from '@memberjunction/core';
import { EncryptionKeySourceBase } from './EncryptionKeySourceBase';
import {
    EncryptedValueParts,
    KeyConfiguration
} from './interfaces';

/**
 * Cache entry with TTL for key material and configurations.
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
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Core encryption engine for field-level encryption operations.
 *
 * This is a singleton class - use `EncryptionEngine.Instance` to access.
 * The engine handles:
 *
 * - Loading key configurations from the database
 * - Retrieving key material from configured sources
 * - Performing encryption/decryption with Node.js crypto
 * - Caching configurations and key material for performance
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
export class EncryptionEngine {
    /**
     * Singleton instance of the encryption engine.
     *
     * @private
     */
    private static _instance: EncryptionEngine;

    /**
     * Cache for decrypted key material.
     * Maps 'keyId:version' to Buffer.
     *
     * @private
     */
    private _keyMaterialCache: Map<string, CacheEntry<Buffer>> = new Map();

    /**
     * Cache for key configurations loaded from database.
     * Maps keyId to KeyConfiguration.
     *
     * @private
     */
    private _keyConfigCache: Map<string, CacheEntry<KeyConfiguration>> = new Map();

    /**
     * Cache for initialized key source instances.
     * Maps driver class name to provider instance.
     *
     * @private
     */
    private _keySourceCache: Map<string, EncryptionKeySourceBase> = new Map();

    /**
     * Cache TTL in milliseconds.
     * Can be configured for testing or specific deployment needs.
     *
     * @private
     */
    private readonly _cacheTtlMs: number = DEFAULT_CACHE_TTL_MS;

    /**
     * Private constructor - use Instance getter.
     */
    private constructor() {
        // Private to enforce singleton pattern
    }

    /**
     * Gets the singleton instance of the encryption engine.
     *
     * The instance is created on first access and reused thereafter.
     *
     * @example
     * ```typescript
     * const engine = EncryptionEngine.Instance;
     * const encrypted = await engine.Encrypt(data, keyId);
     * ```
     */
    static get Instance(): EncryptionEngine {
        if (!this._instance) {
            this._instance = new EncryptionEngine();
        }
        return this._instance;
    }

    /**
     * Encrypts a value using the specified encryption key.
     *
     * The method:
     * 1. Loads the key configuration from database (cached)
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
     * @throws Error if the key cannot be loaded
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

        // Load key configuration
        const keyConfig = await this.getKeyConfiguration(encryptionKeyId, contextUser);

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
     * 2. Loads the key configuration from database (cached)
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

        // Load key configuration
        const keyConfig = await this.getKeyConfiguration(parsed.keyId, contextUser);

        // Get key material
        const keyMaterial = await this.getKeyMaterial(keyConfig);

        // Perform decryption
        return this.performDecryption(parsed, keyConfig, keyMaterial);
    }

    /**
     * Checks if a value is encrypted.
     *
     * Encrypted values start with the marker prefix (default: '$ENC$').
     * This is a fast, synchronous check that doesn't require database access.
     *
     * @param value - The value to check
     * @returns `true` if the value appears to be encrypted
     *
     * @example
     * ```typescript
     * if (engine.IsEncrypted(fieldValue)) {
     *   const decrypted = await engine.Decrypt(fieldValue, user);
     * }
     * ```
     */
    IsEncrypted(value: unknown): boolean {
        return typeof value === 'string' && value.startsWith(ENCRYPTION_MARKER);
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

        // Get the key configuration to know the source type and algorithm
        const keyConfig = await this.getKeyConfiguration(encryptionKeyId, contextUser);

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

        // Get the base configuration
        const keyConfig = await this.getKeyConfiguration(encryptionKeyId, contextUser);

        // Get key material using the overridden lookup value
        const keyMaterial = await this.getKeyMaterialWithLookup(
            keyConfig,
            keyLookupValue
        );

        // Perform encryption with the overridden key
        return this.performEncryption(plaintext, keyConfig, keyMaterial);
    }

    /**
     * Clears all caches.
     *
     * Call after key rotation or configuration changes to ensure
     * fresh data is loaded. Normally not needed as caches have TTL.
     */
    ClearCaches(): void {
        this._keyMaterialCache.clear();
        this._keyConfigCache.clear();
        // Don't clear source cache - sources can be reused
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

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
     * Gets the key configuration from cache or database.
     *
     * @private
     */
    private async getKeyConfiguration(
        keyId: string,
        contextUser?: UserInfo
    ): Promise<KeyConfiguration> {
        // Check cache first
        const cacheKey = keyId;
        const cached = this._keyConfigCache.get(cacheKey);

        if (cached && cached.expiry > new Date()) {
            return cached.value;
        }

        // Load from database
        const config = await this.loadKeyConfiguration(keyId, contextUser);

        // Cache it
        this._keyConfigCache.set(cacheKey, {
            value: config,
            expiry: new Date(Date.now() + this._cacheTtlMs)
        });

        return config;
    }

    /**
     * Loads key configuration from the database.
     *
     * @private
     */
    private async loadKeyConfiguration(
        keyId: string,
        contextUser?: UserInfo
    ): Promise<KeyConfiguration> {
        const rv = new RunView();

        // Load the encryption key
        const keyResult = await rv.RunView({
            EntityName: 'MJ: Encryption Keys',
            ExtraFilter: `ID = '${keyId}'`,
            ResultType: 'simple'
        }, contextUser);

        if (!keyResult.Success || keyResult.Results.length === 0) {
            throw new Error(
                `Encryption key not found: ${keyId}. ` +
                'Ensure the key exists in the "MJ: Encryption Keys" table and is active.'
            );
        }

        const key = keyResult.Results[0];

        // Check key status
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

        // Load the algorithm
        const algoResult = await rv.RunView({
            EntityName: 'MJ: Encryption Algorithms',
            ExtraFilter: `ID = '${key.EncryptionAlgorithmID}'`,
            ResultType: 'simple'
        }, contextUser);

        if (!algoResult.Success || algoResult.Results.length === 0) {
            throw new Error(
                `Encryption algorithm not found: ${key.EncryptionAlgorithmID}. ` +
                'The algorithm configuration may have been deleted.'
            );
        }

        const algo = algoResult.Results[0];

        if (!algo.IsActive) {
            throw new Error(
                `Encryption algorithm "${algo.Name}" is not active. ` +
                'The key is configured to use a disabled algorithm.'
            );
        }

        // Load the source
        const sourceResult = await rv.RunView({
            EntityName: 'MJ: Encryption Key Sources',
            ExtraFilter: `ID = '${key.EncryptionKeySourceID}'`,
            ResultType: 'simple'
        }, contextUser);

        if (!sourceResult.Success || sourceResult.Results.length === 0) {
            throw new Error(
                `Encryption key source not found: ${key.EncryptionKeySourceID}. ` +
                'The key source configuration may have been deleted.'
            );
        }

        const source = sourceResult.Results[0];

        if (!source.IsActive) {
            throw new Error(
                `Encryption key source "${source.Name}" is not active. ` +
                'The key is configured to use a disabled source type.'
            );
        }

        // Build and return the configuration
        return {
            keyId: key.ID,
            keyVersion: key.KeyVersion || '1',
            marker: key.Marker || ENCRYPTION_MARKER,
            algorithm: {
                name: algo.Name,
                nodeCryptoName: algo.NodeCryptoName,
                keyLengthBits: algo.KeyLengthBits,
                ivLengthBytes: algo.IVLengthBytes,
                isAEAD: !!algo.IsAEAD
            },
            source: {
                driverClass: source.DriverClass,
                lookupValue: key.KeyLookupValue
            }
        };
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
            expiry: new Date(Date.now() + this._cacheTtlMs)
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
