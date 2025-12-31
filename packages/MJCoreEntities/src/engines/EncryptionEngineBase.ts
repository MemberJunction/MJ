/**
 * @fileoverview Base encryption engine for MemberJunction field-level encryption.
 *
 * The EncryptionEngineBase provides metadata caching for encryption-related entities
 * (keys, algorithms, sources) and can be used by both client and server code.
 * Server-side implementations should extend this class to add the actual
 * encryption/decryption operations.
 *
 * ## Usage
 *
 * ```typescript
 * import { EncryptionEngineBase } from '@memberjunction/core-entities';
 *
 * // Configure the engine (loads metadata)
 * await EncryptionEngineBase.Instance.Config(false, contextUser);
 *
 * // Access cached metadata
 * const key = EncryptionEngineBase.Instance.GetKeyByID(keyId);
 * const algorithm = EncryptionEngineBase.Instance.GetAlgorithmByID(algoId);
 * ```
 *
 * @module @memberjunction/core-entities
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, RegisterForStartup } from "@memberjunction/core";
import { ENCRYPTION_MARKER } from "@memberjunction/global";
import {
    EncryptionKeyEntity,
    EncryptionAlgorithmEntity,
    EncryptionKeySourceEntity
} from "../generated/entity_subclasses";

/**
 * Configuration for a loaded encryption key, combining key, algorithm, and source data.
 * This is a convenience type that aggregates related encryption configuration.
 */
export interface EncryptionKeyConfiguration {
    /** The encryption key entity */
    key: EncryptionKeyEntity;
    /** The encryption algorithm entity */
    algorithm: EncryptionAlgorithmEntity;
    /** The key source entity */
    source: EncryptionKeySourceEntity;
    /** The marker to use for encrypted values (from key or default) */
    marker: string;
}

/**
 * Base engine class for encryption metadata caching.
 *
 * This class extends BaseEngine to provide automatic caching of encryption-related
 * entities with auto-refresh when those entities are modified. It can be used in
 * both client and server contexts.
 *
 * ## Features
 *
 * - Caches all encryption keys, algorithms, and sources
 * - Auto-refreshes when entity data changes
 * - Provides convenient lookup methods
 * - Works in both client and server environments
 *
 * ## For Server-Side Encryption
 *
 * For actual encryption/decryption operations, use or extend the EncryptionEngine
 * class in the @memberjunction/encryption package, which extends this base class.
 */
@RegisterForStartup()
export class EncryptionEngineBase extends BaseEngine<EncryptionEngineBase> {
    /**
     * Cached array of encryption keys loaded from the database.
     * @private
     */
    private _encryptionKeys: EncryptionKeyEntity[] = [];

    /**
     * Cached array of encryption algorithms loaded from the database.
     * @private
     */
    private _encryptionAlgorithms: EncryptionAlgorithmEntity[] = [];

    /**
     * Cached array of encryption key sources loaded from the database.
     * @private
     */
    private _encryptionKeySources: EncryptionKeySourceEntity[] = [];

    /**
     * Gets the singleton instance of the encryption engine base.
     *
     * @example
     * ```typescript
     * const engine = EncryptionEngineBase.Instance;
     * await engine.Config(false, contextUser);
     * const keys = engine.EncryptionKeys;
     * ```
     */
    public static get Instance(): EncryptionEngineBase {
        return super.getInstance<EncryptionEngineBase>();
    }

    /**
     * Configures the engine by loading encryption metadata from the database.
     *
     * This method should be called before accessing any cached data. It loads
     * all encryption keys, algorithms, and key sources into memory.
     *
     * @param forceRefresh - If true, reloads data even if already loaded
     * @param contextUser - User context for database access (required server-side)
     * @param provider - Optional metadata provider override
     *
     * @example
     * ```typescript
     * // Initial load
     * await EncryptionEngineBase.Instance.Config(false, contextUser);
     *
     * // Force refresh after external changes
     * await EncryptionEngineBase.Instance.Config(true, contextUser);
     * ```
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                PropertyName: '_encryptionKeys',
                EntityName: 'MJ: Encryption Keys',
                CacheLocal: true
            },
            {
                PropertyName: '_encryptionAlgorithms',
                EntityName: 'MJ: Encryption Algorithms',
                CacheLocal: true
            },
            {
                PropertyName: '_encryptionKeySources',
                EntityName: 'MJ: Encryption Key Sources',
                CacheLocal: true
            }
        ];

        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ========================================================================
    // GETTERS FOR CACHED DATA
    // ========================================================================

    /**
     * Gets all cached encryption keys.
     *
     * @returns Array of all encryption key entities
     */
    public get EncryptionKeys(): EncryptionKeyEntity[] {
        return this._encryptionKeys;
    }

    /**
     * Gets only active encryption keys.
     *
     * @returns Array of encryption keys where IsActive is true
     */
    public get ActiveEncryptionKeys(): EncryptionKeyEntity[] {
        return this._encryptionKeys.filter(k => k.IsActive);
    }

    /**
     * Gets all cached encryption algorithms.
     *
     * @returns Array of all encryption algorithm entities
     */
    public get EncryptionAlgorithms(): EncryptionAlgorithmEntity[] {
        return this._encryptionAlgorithms;
    }

    /**
     * Gets only active encryption algorithms.
     *
     * @returns Array of encryption algorithms where IsActive is true
     */
    public get ActiveEncryptionAlgorithms(): EncryptionAlgorithmEntity[] {
        return this._encryptionAlgorithms.filter(a => a.IsActive);
    }

    /**
     * Gets all cached encryption key sources.
     *
     * @returns Array of all encryption key source entities
     */
    public get EncryptionKeySources(): EncryptionKeySourceEntity[] {
        return this._encryptionKeySources;
    }

    /**
     * Gets only active encryption key sources.
     *
     * @returns Array of encryption key sources where IsActive is true
     */
    public get ActiveEncryptionKeySources(): EncryptionKeySourceEntity[] {
        return this._encryptionKeySources.filter(s => s.IsActive);
    }

    // ========================================================================
    // LOOKUP METHODS
    // ========================================================================

    /**
     * Gets an encryption key by its ID.
     *
     * @param keyId - The UUID of the encryption key
     * @returns The encryption key entity, or undefined if not found
     *
     * @example
     * ```typescript
     * const key = engine.GetKeyByID('550e8400-e29b-41d4-a716-446655440000');
     * if (key) {
     *   console.log(`Key: ${key.Name}, Status: ${key.Status}`);
     * }
     * ```
     */
    public GetKeyByID(keyId: string): EncryptionKeyEntity | undefined {
        return this._encryptionKeys.find(k => k.ID === keyId);
    }

    /**
     * Gets an encryption key by its name.
     *
     * @param name - The name of the encryption key (case-insensitive)
     * @returns The encryption key entity, or undefined if not found
     */
    public GetKeyByName(name: string): EncryptionKeyEntity | undefined {
        const lowerName = name.trim().toLowerCase();
        return this._encryptionKeys.find(k => k.Name.trim().toLowerCase() === lowerName);
    }

    /**
     * Gets an encryption algorithm by its ID.
     *
     * @param algorithmId - The UUID of the encryption algorithm
     * @returns The encryption algorithm entity, or undefined if not found
     */
    public GetAlgorithmByID(algorithmId: string): EncryptionAlgorithmEntity | undefined {
        return this._encryptionAlgorithms.find(a => a.ID === algorithmId);
    }

    /**
     * Gets an encryption algorithm by its name.
     *
     * @param name - The name of the algorithm (e.g., 'AES-256-GCM')
     * @returns The encryption algorithm entity, or undefined if not found
     */
    public GetAlgorithmByName(name: string): EncryptionAlgorithmEntity | undefined {
        const lowerName = name.trim().toLowerCase();
        return this._encryptionAlgorithms.find(a => a.Name.trim().toLowerCase() === lowerName);
    }

    /**
     * Gets an encryption key source by its ID.
     *
     * @param sourceId - The UUID of the key source
     * @returns The encryption key source entity, or undefined if not found
     */
    public GetKeySourceByID(sourceId: string): EncryptionKeySourceEntity | undefined {
        return this._encryptionKeySources.find(s => s.ID === sourceId);
    }

    /**
     * Gets an encryption key source by its driver class name.
     *
     * @param driverClass - The driver class name (e.g., 'EnvVarKeySource')
     * @returns The encryption key source entity, or undefined if not found
     */
    public GetKeySourceByDriverClass(driverClass: string): EncryptionKeySourceEntity | undefined {
        const lowerClass = driverClass.trim().toLowerCase();
        return this._encryptionKeySources.find(s => s.DriverClass.trim().toLowerCase() === lowerClass);
    }

    // ========================================================================
    // CONVENIENCE METHODS
    // ========================================================================

    /**
     * Gets the full configuration for an encryption key, including its algorithm and source.
     *
     * This method aggregates the key, its associated algorithm, and source into
     * a single configuration object for convenience.
     *
     * @param keyId - The UUID of the encryption key
     * @returns The full key configuration, or undefined if key not found
     * @throws Error if the key's algorithm or source cannot be found
     *
     * @example
     * ```typescript
     * const config = engine.GetKeyConfiguration(keyId);
     * if (config) {
     *   console.log(`Algorithm: ${config.algorithm.Name}`);
     *   console.log(`Source: ${config.source.DriverClass}`);
     *   console.log(`Marker: ${config.marker}`);
     * }
     * ```
     */
    public GetKeyConfiguration(keyId: string): EncryptionKeyConfiguration | undefined {
        const key = this.GetKeyByID(keyId);
        if (!key) {
            return undefined;
        }

        const algorithm = this.GetAlgorithmByID(key.EncryptionAlgorithmID);
        if (!algorithm) {
            throw new Error(
                `Encryption algorithm not found for key "${key.Name}": ${key.EncryptionAlgorithmID}. ` +
                'The algorithm may have been deleted.'
            );
        }

        const source = this.GetKeySourceByID(key.EncryptionKeySourceID);
        if (!source) {
            throw new Error(
                `Encryption key source not found for key "${key.Name}": ${key.EncryptionKeySourceID}. ` +
                'The key source may have been deleted.'
            );
        }

        return {
            key,
            algorithm,
            source,
            marker: key.Marker || ENCRYPTION_MARKER
        };
    }

    /**
     * Validates that a key is usable for encryption operations.
     *
     * Checks that the key, its algorithm, and its source are all active and valid.
     *
     * @param keyId - The UUID of the encryption key to validate
     * @returns Object with isValid boolean and optional error message
     *
     * @example
     * ```typescript
     * const result = engine.ValidateKey(keyId);
     * if (!result.isValid) {
     *   console.error(`Key validation failed: ${result.error}`);
     * }
     * ```
     */
    public ValidateKey(keyId: string): { isValid: boolean; error?: string } {
        const key = this.GetKeyByID(keyId);
        if (!key) {
            return { isValid: false, error: `Encryption key not found: ${keyId}` };
        }

        if (!key.IsActive) {
            return { isValid: false, error: `Encryption key "${key.Name}" is not active` };
        }

        if (key.Status === 'Expired') {
            return { isValid: false, error: `Encryption key "${key.Name}" has expired` };
        }

        const algorithm = this.GetAlgorithmByID(key.EncryptionAlgorithmID);
        if (!algorithm) {
            return { isValid: false, error: `Algorithm not found for key "${key.Name}"` };
        }

        if (!algorithm.IsActive) {
            return { isValid: false, error: `Algorithm "${algorithm.Name}" is not active` };
        }

        const source = this.GetKeySourceByID(key.EncryptionKeySourceID);
        if (!source) {
            return { isValid: false, error: `Key source not found for key "${key.Name}"` };
        }

        if (!source.IsActive) {
            return { isValid: false, error: `Key source "${source.Name}" is not active` };
        }

        return { isValid: true };
    }

    /**
     * Gets the marker prefix for a specific encryption key.
     *
     * @param keyId - The UUID of the encryption key
     * @returns The marker string (from key or default ENCRYPTION_MARKER)
     */
    public GetKeyMarker(keyId: string): string {
        const key = this.GetKeyByID(keyId);
        return key?.Marker || ENCRYPTION_MARKER;
    }
}

/**
 * Tree-shaking prevention function.
 * Call this to ensure the EncryptionEngineBase class is included in the build.
 */
export function LoadEncryptionEngineBase(): void {
    // This function exists to prevent tree-shaking from removing the class
}
