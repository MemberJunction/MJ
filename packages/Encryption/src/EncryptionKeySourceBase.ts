/**
 * @fileoverview Abstract base class for encryption key source providers.
 *
 * This module defines the extensible provider pattern for retrieving encryption
 * key material from various sources (environment variables, vault services,
 * configuration files, etc.).
 *
 * ## Implementing a Custom Key Source
 *
 * To add a new key source:
 *
 * 1. Create a class extending `EncryptionKeySourceBase`
 * 2. Decorate with `@RegisterClass(EncryptionKeySourceBase, 'YourSourceName')`
 * 3. Implement all abstract methods
 * 4. Register in the database `EncryptionKeySource` table
 *
 * @example
 * ```typescript
 * import { RegisterClass } from '@memberjunction/global';
 * import { EncryptionKeySourceBase } from '@memberjunction/encryption';
 *
 * @RegisterClass(EncryptionKeySourceBase, 'CustomVaultKeySource')
 * export class CustomVaultKeySource extends EncryptionKeySourceBase {
 *   get SourceName(): string { return 'Custom Vault'; }
 *
 *   ValidateConfiguration(): boolean {
 *     return !!this._config.additionalConfig?.vaultUrl;
 *   }
 *
 *   async GetKey(lookupValue: string): Promise<Buffer> {
 *     // Retrieve key from vault...
 *   }
 *
 *   async KeyExists(lookupValue: string): Promise<boolean> {
 *     // Check if key exists in vault...
 *   }
 * }
 * ```
 *
 * @module @memberjunction/encryption
 */

import { EncryptionKeySourceConfig } from './interfaces';

/**
 * Abstract base class for encryption key source providers.
 *
 * Key sources are responsible for securely retrieving encryption key material
 * from various backends. The MemberJunction encryption system uses the
 * ClassFactory pattern to instantiate the appropriate provider based on
 * database configuration.
 *
 * ## Security Considerations
 *
 * - **Never log or expose key material** - Key bytes should only be returned
 *   via the GetKey() method and immediately used for crypto operations.
 *
 * - **Validate inputs** - Always validate lookupValue parameters to prevent
 *   injection attacks against your backend.
 *
 * - **Use secure connections** - For network-based sources (vaults, KMS),
 *   always use TLS and verify certificates.
 *
 * - **Handle errors securely** - Don't expose internal details in error
 *   messages that could help attackers.
 *
 * ## Lifecycle
 *
 * 1. **Construction** - Provider is instantiated with config
 * 2. **Initialize()** - Called once before first use (async setup)
 * 3. **GetKey()/KeyExists()** - Called for each operation
 * 4. **Dispose()** - Called during cleanup (close connections)
 *
 * @abstract
 */
export abstract class EncryptionKeySourceBase {
    /**
     * Configuration passed during instantiation.
     * Contains lookupValue and any source-specific additional config.
     *
     * @protected
     */
    protected _config: EncryptionKeySourceConfig;

    /**
     * Creates a new key source instance.
     *
     * Note: The config may be empty/undefined when using ClassFactory.
     * Configuration is typically loaded from the database and passed
     * when retrieving keys.
     *
     * @param config - Optional configuration for the key source
     */
    constructor(config?: EncryptionKeySourceConfig) {
        this._config = config || {};
    }

    /**
     * Human-readable name of this key source.
     *
     * Used for logging, error messages, and UI display.
     * Should be concise but descriptive.
     *
     * @example 'Environment Variable', 'AWS KMS', 'HashiCorp Vault'
     */
    abstract get SourceName(): string;

    /**
     * Validates that the source is properly configured.
     *
     * Called before attempting key operations to fail fast on
     * misconfiguration. Check for:
     * - Required config values are present
     * - Config values are in expected format
     * - Connectivity to backend (for network sources)
     *
     * @returns `true` if configuration is valid, `false` otherwise
     */
    abstract ValidateConfiguration(): boolean;

    /**
     * Retrieves the raw key material for the given lookup value.
     *
     * ## Security Requirements
     *
     * - Return key bytes directly, don't cache them in the provider
     * - Never log the key material
     * - Throw descriptive errors on failure (without exposing secrets)
     * - Validate lookupValue format before using it
     *
     * ## Key Format
     *
     * Keys should be base64-encoded in the source storage.
     * The provider decodes and returns raw bytes.
     *
     * @param lookupValue - Identifier for the key in this source
     *   - Env vars: the variable name (e.g., 'MJ_ENCRYPTION_KEY_PII')
     *   - Config files: the key name (e.g., 'pii_master_key')
     *   - Vaults: the secret path (e.g., '/secrets/encryption/pii')
     *
     * @param keyVersion - Optional version for versioned key stores.
     *   Some sources (like vaults) maintain multiple versions.
     *   If not specified, returns the current/latest version.
     *
     * @returns Promise resolving to raw key bytes as a Buffer.
     *   The buffer length must match the algorithm's KeyLengthBits/8.
     *
     * @throws Error if the key cannot be retrieved with a descriptive message
     *
     * @example
     * ```typescript
     * // Simple retrieval
     * const key = await source.GetKey('MJ_ENCRYPTION_KEY_PII');
     *
     * // With version for rotation
     * const oldKey = await source.GetKey('MJ_ENCRYPTION_KEY_PII', '1');
     * const newKey = await source.GetKey('MJ_ENCRYPTION_KEY_PII', '2');
     * ```
     */
    abstract GetKey(lookupValue: string, keyVersion?: string): Promise<Buffer>;

    /**
     * Checks if a key exists without retrieving it.
     *
     * Used for validation before operations that would fail on missing keys.
     * More efficient than GetKey() when you only need existence check.
     *
     * @param lookupValue - Identifier for the key in this source
     * @returns Promise resolving to `true` if key exists, `false` otherwise
     *
     * @example
     * ```typescript
     * if (await source.KeyExists('NEW_ROTATION_KEY')) {
     *   // Safe to proceed with key rotation
     * } else {
     *   throw new Error('New key must be set before rotation');
     * }
     * ```
     */
    abstract KeyExists(lookupValue: string): Promise<boolean>;

    /**
     * Optional async initialization for sources that need setup.
     *
     * Called once by the encryption engine before first use.
     * Use this for:
     * - Loading config files
     * - Establishing connections to vault services
     * - Authenticating with cloud key management
     * - Caching frequently-accessed metadata
     *
     * The default implementation is a no-op for simple sources.
     *
     * @virtual Override in subclasses that need async initialization
     */
    async Initialize(): Promise<void> {
        // Default implementation - no initialization needed
        // Subclasses can override for async setup
    }

    /**
     * Optional cleanup for sources with connections or resources.
     *
     * Called during graceful shutdown to release resources.
     * Use this for:
     * - Closing vault connections
     * - Releasing pooled resources
     * - Flushing any pending operations
     *
     * The default implementation is a no-op for stateless sources.
     *
     * @virtual Override in subclasses that hold resources
     */
    async Dispose(): Promise<void> {
        // Default implementation - no cleanup needed
        // Subclasses can override for resource cleanup
    }
}
