/**
 * @fileoverview Type definitions and interfaces for the MemberJunction encryption system.
 *
 * This module defines the core types used throughout the encryption package:
 * - Configuration interfaces for key sources
 * - Parsed encrypted value structure
 * - Key configuration for runtime operations
 *
 * @module @memberjunction/encryption
 * @see {@link EncryptionEngine} for the main encryption/decryption API
 * @see {@link EncryptionKeySourceBase} for implementing custom key sources
 */

/**
 * Configuration passed to encryption key source providers during instantiation.
 *
 * Key sources use this configuration to understand how to retrieve key material.
 * The specific properties used depend on the key source implementation.
 *
 * @example
 * ```typescript
 * // Environment variable source config
 * const envConfig: EncryptionKeySourceConfig = {
 *   lookupValue: 'MJ_ENCRYPTION_KEY_PII'
 * };
 *
 * // Config file source config
 * const fileConfig: EncryptionKeySourceConfig = {
 *   lookupValue: 'pii_master_key'
 * };
 * ```
 */
export interface EncryptionKeySourceConfig {
    /**
     * The identifier used to look up the key from the source.
     * - For env vars: the environment variable name
     * - For config files: the key name in the encryptionKeys section
     * - For vaults: the secret path
     */
    lookupValue?: string;

    /**
     * Optional additional configuration specific to the key source.
     * Providers can cast this to their specific config type.
     */
    additionalConfig?: Record<string, unknown>;
}

/**
 * Represents the parsed components of an encrypted value string.
 *
 * Encrypted values follow the format:
 * `$ENC$<keyId>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`
 *
 * This structure allows the encryption engine to:
 * 1. Identify which key was used for encryption
 * 2. Determine the algorithm for decryption
 * 3. Extract the IV and ciphertext for the crypto operation
 * 4. Verify authenticity with the auth tag (for AEAD algorithms)
 *
 * @example
 * ```typescript
 * const parts = engine.ParseEncryptedValue(encryptedValue);
 * console.log(parts.keyId); // UUID of the encryption key
 * console.log(parts.algorithm); // 'AES-256-GCM'
 * ```
 */
export interface EncryptedValueParts {
    /**
     * The encryption marker prefix (always '$ENC$').
     * Used for quick detection of encrypted values.
     */
    marker: string;

    /**
     * The UUID of the encryption key used.
     * References the EncryptionKey entity in the database.
     */
    keyId: string;

    /**
     * The algorithm name used for encryption.
     * Matches the Name field in the EncryptionAlgorithm entity.
     * @example 'AES-256-GCM', 'AES-256-CBC'
     */
    algorithm: string;

    /**
     * Base64-encoded initialization vector.
     * Randomly generated for each encryption operation.
     */
    iv: string;

    /**
     * Base64-encoded encrypted data.
     */
    ciphertext: string;

    /**
     * Base64-encoded authentication tag for AEAD algorithms.
     * Only present for algorithms like AES-GCM that provide authentication.
     * Undefined for non-AEAD algorithms like AES-CBC.
     */
    authTag?: string;
}

/**
 * Complete key configuration loaded from the database.
 *
 * This structure contains everything needed to perform encryption
 * or decryption operations, cached for performance.
 *
 * @internal Used by EncryptionEngine for key management
 */
export interface KeyConfiguration {
    /** The encryption key's unique identifier (UUID) */
    keyId: string;

    /**
     * Current version of the key for this configuration.
     * Incremented during key rotation operations.
     */
    keyVersion: string;

    /**
     * Prefix marker for encrypted values.
     * Defaults to '$ENC$' but can be customized per key.
     */
    marker: string;

    /** Algorithm configuration */
    algorithm: {
        /** Display name of the algorithm (e.g., 'AES-256-GCM') */
        name: string;

        /** Node.js crypto module algorithm identifier (e.g., 'aes-256-gcm') */
        nodeCryptoName: string;

        /** Required key length in bits (e.g., 256 for AES-256) */
        keyLengthBits: number;

        /** Required IV length in bytes (e.g., 12 for GCM, 16 for CBC) */
        ivLengthBytes: number;

        /**
         * Whether the algorithm provides Authenticated Encryption with Associated Data.
         * AEAD algorithms (like AES-GCM) provide both confidentiality and integrity.
         */
        isAEAD: boolean;
    };

    /** Key source configuration for retrieving key material */
    source: {
        /**
         * The registered class name of the key source provider.
         * Used with ClassFactory to instantiate the provider.
         */
        driverClass: string;

        /**
         * The lookup value passed to the key source.
         * Interpretation depends on the source type.
         */
        lookupValue: string;
    };
}

/**
 * Result structure returned by key rotation operations.
 *
 * @see {@link RotateEncryptionKeyAction} for the rotation action
 */
export interface RotateKeyResult {
    /** Whether the rotation completed successfully */
    success: boolean;

    /** Total number of records that were re-encrypted */
    recordsProcessed: number;

    /**
     * List of fields that were processed.
     * Format: 'EntityName.FieldName'
     */
    fieldsProcessed: string[];

    /** Error message if rotation failed */
    error?: string;
}

/**
 * Parameters for key rotation operations.
 *
 * @see {@link RotateEncryptionKeyAction} for the rotation action
 */
export interface RotateKeyParams {
    /** UUID of the encryption key to rotate */
    encryptionKeyId: string;

    /**
     * Lookup value for the new key material.
     * The new key must be accessible via the key source before rotation.
     */
    newKeyLookupValue: string;

    /**
     * Number of records to process per batch.
     * Larger batches are faster but use more memory.
     * @default 100
     */
    batchSize?: number;
}

/**
 * Result structure for field encryption operations.
 *
 * @see {@link EnableFieldEncryptionAction}
 */
export interface EnableFieldEncryptionResult {
    /** Whether the operation completed successfully */
    success: boolean;

    /** Number of records that were encrypted */
    recordsEncrypted: number;

    /** Number of records that were already encrypted (skipped) */
    recordsSkipped: number;

    /** Error message if the operation failed */
    error?: string;
}

/**
 * Parameters for enabling encryption on existing data.
 *
 * @see {@link EnableFieldEncryptionAction}
 */
export interface EnableFieldEncryptionParams {
    /** UUID of the EntityField to encrypt */
    entityFieldId: string;

    /**
     * Number of records to process per batch.
     * @default 100
     */
    batchSize?: number;
}
