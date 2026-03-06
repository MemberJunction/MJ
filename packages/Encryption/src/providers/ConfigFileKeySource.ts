/**
 * @fileoverview Configuration file key source provider.
 *
 * This provider retrieves encryption keys from MemberJunction's
 * configuration file (mj.config.cjs or other cosmiconfig-compatible formats).
 *
 * ## Usage
 *
 * 1. Add keys to your mj.config.cjs:
 *    ```javascript
 *    module.exports = {
 *      encryptionKeys: {
 *        pii_master: 'K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=',
 *        api_secrets: 'aW5kZXhfbmV3X2tleV9mb3JfdjJfcm90YXRpb24='
 *      }
 *    };
 *    ```
 *
 * 2. Configure in database with:
 *    - EncryptionKeySourceID pointing to 'Configuration File' source
 *    - KeyLookupValue = 'pii_master' (the key name in the config)
 *
 * ## Key Format
 *
 * Keys must be base64-encoded strings. Generate with:
 * ```bash
 * openssl rand -base64 32  # For AES-256
 * openssl rand -base64 16  # For AES-128
 * ```
 *
 * ## Security Considerations
 *
 * - Config files should have restricted file permissions (600 or 640)
 * - Don't commit config files with keys to source control
 * - Consider using .gitignore for mj.config.cjs
 * - For production, prefer environment variables or secrets managers
 *
 * ## Key Rotation
 *
 * Add the new key with a versioned name:
 * ```javascript
 * encryptionKeys: {
 *   pii_master: '<current-key>',
 *   pii_master_v2: '<new-key>'
 * }
 * ```
 *
 * @module @memberjunction/encryption
 */

import { RegisterClass } from '@memberjunction/global';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';
import { cosmiconfigSync } from 'cosmiconfig';

// Type for cosmiconfig result
interface CosmiconfigResult {
    config: Record<string, unknown>;
    filepath: string;
}

interface CosmiconfigExplorer {
    search(): CosmiconfigResult | null;
}

/**
 * Encryption key source that retrieves keys from configuration files.
 *
 * Uses cosmiconfig to locate configuration in standard locations:
 * - mj.config.cjs (recommended)
 * - mj.config.js
 * - .mjrc.json
 * - .mjrc.yaml
 *
 * Keys are read from the `encryptionKeys` section of the configuration.
 *
 * @example
 * ```typescript
 * // Configuration file (mj.config.cjs):
 * module.exports = {
 *   encryptionKeys: {
 *     pii_master: 'base64-encoded-key-here',
 *     financial_data: 'another-base64-key'
 *   }
 * };
 *
 * // Usage (typically automatic via ClassFactory):
 * const source = new ConfigFileKeySource();
 * await source.Initialize(); // Load the config file
 *
 * const key = await source.GetKey('pii_master');
 * ```
 */
@RegisterClass(EncryptionKeySourceBase, 'ConfigFileKeySource')
export class ConfigFileKeySource extends EncryptionKeySourceBase {
    /**
     * Loaded configuration from the config file.
     * Set during Initialize(), null if not yet loaded.
     *
     * @private
     */
    private _loadedConfig: Record<string, string> | null = null;

    /**
     * Path to the loaded config file (for error messages).
     *
     * @private
     */
    private _configFilePath: string | null = null;

    /**
     * Human-readable name for this source.
     */
    get SourceName(): string {
        return 'Configuration File';
    }

    /**
     * Initializes the key source by loading the configuration file.
     *
     * Uses cosmiconfig to search for configuration in standard locations.
     * Must be called before any key operations.
     *
     * @throws Error if cosmiconfig module cannot be loaded
     */
    async Initialize(): Promise<void> {
        try {
            const explorer: CosmiconfigExplorer = cosmiconfigSync('mj', {
                searchStrategy: 'global'
            });

            const result = explorer.search();

            if (result?.config?.encryptionKeys) {
                const keys = result.config.encryptionKeys;

                // Validate that encryptionKeys is an object with string values
                if (typeof keys !== 'object' || keys === null) {
                    throw new Error(
                        'Invalid encryptionKeys configuration: expected an object with string values'
                    );
                }

                // Type check all values
                for (const [keyName, keyValue] of Object.entries(keys as Record<string, unknown>)) {
                    if (typeof keyValue !== 'string') {
                        throw new Error(
                            `Invalid key "${keyName}" in encryptionKeys: ` +
                            `expected base64 string, got ${typeof keyValue}`
                        );
                    }
                }

                this._loadedConfig = keys as Record<string, string>;
                this._configFilePath = result.filepath;
            }
        } catch (err) {
            // If cosmiconfig is not available or fails, log but don't crash
            // The ValidateConfiguration check will fail appropriately
            const message = err instanceof Error ? err.message : String(err);
            console.warn(
                `ConfigFileKeySource: Failed to load configuration: ${message}`
            );
        }
    }

    /**
     * Validates that the configuration file was loaded successfully.
     *
     * @returns `true` if the config file was loaded and contains encryptionKeys
     */
    ValidateConfiguration(): boolean {
        return this._loadedConfig !== null;
    }

    /**
     * Checks if a key exists in the configuration file.
     *
     * @param lookupValue - The key name to check
     * @returns Promise resolving to `true` if the key exists
     */
    async KeyExists(lookupValue: string): Promise<boolean> {
        if (!this._loadedConfig) {
            return false;
        }

        if (!lookupValue || typeof lookupValue !== 'string') {
            return false;
        }

        // Validate key name format
        if (!this.isValidKeyName(lookupValue)) {
            return false;
        }

        return this._loadedConfig[lookupValue] !== undefined;
    }

    /**
     * Retrieves key material from the configuration file.
     *
     * Keys should be stored as base64-encoded strings in the encryptionKeys
     * section of the configuration file.
     *
     * For versioned keys, the version is appended with an underscore:
     * - `key_name` for version 1 (default)
     * - `key_name_v2` for version 2
     *
     * @param lookupValue - The key name in the configuration
     * @param keyVersion - Optional version number (defaults to '1')
     * @returns Promise resolving to the decoded key bytes
     *
     * @throws Error if Initialize() was not called
     * @throws Error if the key is not found
     * @throws Error if the value is not valid base64
     *
     * @example
     * ```typescript
     * // Config file has: encryptionKeys: { pii_master: '...' }
     * const key = await source.GetKey('pii_master');
     *
     * // For versioned keys during rotation:
     * // Config has: pii_master, pii_master_v2
     * const newKey = await source.GetKey('pii_master', '2');
     * ```
     */
    async GetKey(lookupValue: string, keyVersion?: string): Promise<Buffer> {
        // Check if initialized
        if (!this._loadedConfig) {
            const configPath = this._configFilePath || 'mj.config.cjs';
            throw new Error(
                `Configuration file not loaded. Ensure Initialize() was called and ` +
                `the configuration file (${configPath}) exists with an "encryptionKeys" section. ` +
                `Example:\n` +
                `module.exports = {\n` +
                `  encryptionKeys: {\n` +
                `    your_key_name: 'base64-encoded-key'\n` +
                `  }\n` +
                `};`
            );
        }

        // Validate lookup value
        if (!lookupValue || typeof lookupValue !== 'string') {
            throw new Error(
                'Invalid lookup value: key name is required. ' +
                'Provide the name of the key as defined in the encryptionKeys section.'
            );
        }

        // Validate key name format
        if (!this.isValidKeyName(lookupValue)) {
            throw new Error(
                `Invalid key name: "${lookupValue}". ` +
                'Key names must start with a letter or underscore and contain only ' +
                'letters, numbers, and underscores.'
            );
        }

        // Build the full key name with version
        const keyName = this.buildKeyName(lookupValue, keyVersion);

        // Retrieve the value
        const keyValue = this._loadedConfig[keyName];

        if (keyValue === undefined || keyValue === null) {
            throw new Error(
                `Encryption key "${keyName}" not found in configuration file. ` +
                `Add it to the "encryptionKeys" section of ${this._configFilePath || 'mj.config.cjs'}. ` +
                `Example:\n` +
                `encryptionKeys: {\n` +
                `  "${keyName}": "base64-encoded-key"\n` +
                `}\n\n` +
                `Generate a key with: openssl rand -base64 32`
            );
        }

        if (keyValue.trim() === '') {
            throw new Error(
                `Encryption key "${keyName}" in configuration file is empty. ` +
                'The value must be a non-empty base64-encoded key.'
            );
        }

        // Decode from base64
        try {
            const keyBytes = Buffer.from(keyValue, 'base64');

            if (keyBytes.length === 0) {
                throw new Error('Decoded key is empty');
            }

            return keyBytes;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Invalid base64 encoding for key "${keyName}" in configuration file. ` +
                `The value must be a valid base64-encoded string. Error: ${message}. ` +
                'Generate a valid key with: openssl rand -base64 32'
            );
        }
    }

    /**
     * Cleans up resources (no-op for config file source).
     */
    async Dispose(): Promise<void> {
        this._loadedConfig = null;
        this._configFilePath = null;
    }

    /**
     * Builds the full key name with optional version suffix.
     *
     * @param baseName - The base key name
     * @param keyVersion - Optional version number
     * @returns The full key name
     *
     * @private
     */
    private buildKeyName(baseName: string, keyVersion?: string): string {
        // No version or version '1' = use base name
        if (!keyVersion || keyVersion === '1') {
            return baseName;
        }

        // For other versions, append _v{version} (lowercase for config files)
        return `${baseName}_v${keyVersion}`;
    }

    /**
     * Validates that a string is a valid configuration key name.
     *
     * @param name - The name to validate
     * @returns `true` if the name is valid
     *
     * @private
     */
    private isValidKeyName(name: string): boolean {
        if (!name || name.length === 0) {
            return false;
        }

        if (name.length > 256) {
            return false;
        }

        // Allow alphanumeric, underscores, and hyphens
        // Must start with letter or underscore
        const keyNamePattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;
        return keyNamePattern.test(name);
    }
}
