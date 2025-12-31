/**
 * @fileoverview Environment variable key source provider.
 *
 * This provider retrieves encryption keys from environment variables.
 * It's the simplest and most commonly used key source for development
 * and containerized deployments.
 *
 * ## Usage
 *
 * 1. Generate a key: `openssl rand -base64 32`
 * 2. Set environment variable: `export MJ_ENCRYPTION_KEY_PII="<base64-key>"`
 * 3. Configure in database with KeyLookupValue = 'MJ_ENCRYPTION_KEY_PII'
 *
 * ## Key Format
 *
 * Keys must be base64-encoded. For AES-256, generate with:
 * ```bash
 * openssl rand -base64 32
 * ```
 *
 * For AES-128:
 * ```bash
 * openssl rand -base64 16
 * ```
 *
 * ## Key Rotation
 *
 * During rotation, store the new key in a separate variable:
 * ```bash
 * export MJ_ENCRYPTION_KEY_PII="<current-key>"
 * export MJ_ENCRYPTION_KEY_PII_NEW="<new-key>"
 * ```
 *
 * After rotation completes, remove the old key and optionally
 * rename the new key to the original variable name.
 *
 * ## Security Considerations
 *
 * - Environment variables may be logged or visible to child processes
 * - Consider using secrets managers for production deployments
 * - Ensure proper access controls on the runtime environment
 * - Never commit keys to source control
 *
 * @module @memberjunction/encryption
 */

import { RegisterClass } from '@memberjunction/global';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';

/**
 * Encryption key source that retrieves keys from environment variables.
 *
 * This is the default and recommended key source for:
 * - Development environments
 * - Docker/Kubernetes deployments with secret injection
 * - Serverless functions with environment configuration
 *
 * Keys are expected to be base64-encoded strings in the environment.
 * The provider decodes them to raw bytes for crypto operations.
 *
 * @example
 * ```typescript
 * // The provider is automatically instantiated by ClassFactory
 * // based on database configuration. For manual usage:
 *
 * import { EnvVarKeySource } from '@memberjunction/encryption';
 *
 * const source = new EnvVarKeySource();
 *
 * // Check if key exists
 * if (await source.KeyExists('MJ_ENCRYPTION_KEY_PII')) {
 *   const keyBytes = await source.GetKey('MJ_ENCRYPTION_KEY_PII');
 *   console.log(`Key length: ${keyBytes.length} bytes`);
 * }
 * ```
 */
@RegisterClass(EncryptionKeySourceBase, 'EnvVarKeySource')
export class EnvVarKeySource extends EncryptionKeySourceBase {
    /**
     * Human-readable name for this source.
     */
    get SourceName(): string {
        return 'Environment Variable';
    }

    /**
     * Validates the source configuration.
     *
     * For environment variables, configuration is always valid as
     * keys are validated at lookup time. This allows the source
     * to be used dynamically for any environment variable.
     *
     * @returns Always returns `true`
     */
    ValidateConfiguration(): boolean {
        // Environment variable source is always valid
        // Keys are validated at lookup time, not configuration time
        return true;
    }

    /**
     * Checks if an environment variable containing a key exists.
     *
     * @param lookupValue - The environment variable name to check
     * @returns Promise resolving to `true` if the variable is defined
     */
    async KeyExists(lookupValue: string): Promise<boolean> {
        if (!lookupValue || typeof lookupValue !== 'string') {
            return false;
        }

        // Validate the lookup value format (env var name)
        if (!this.isValidEnvVarName(lookupValue)) {
            return false;
        }

        return process.env[lookupValue] !== undefined;
    }

    /**
     * Retrieves key material from an environment variable.
     *
     * The environment variable should contain a base64-encoded key.
     * For versioned keys, the version is appended with an underscore:
     * - `KEY_NAME` for version 1 (default)
     * - `KEY_NAME_V2` for version 2
     * - etc.
     *
     * @param lookupValue - The environment variable name
     * @param keyVersion - Optional version number (defaults to '1')
     * @returns Promise resolving to the decoded key bytes
     *
     * @throws Error if the environment variable is not set
     * @throws Error if the value is not valid base64
     *
     * @example
     * ```typescript
     * // Get current key
     * const key = await source.GetKey('MJ_ENCRYPTION_KEY_PII');
     *
     * // Get specific version during rotation
     * const oldKey = await source.GetKey('MJ_ENCRYPTION_KEY_PII', '1');
     * const newKey = await source.GetKey('MJ_ENCRYPTION_KEY_PII', '2');
     * // The above looks for MJ_ENCRYPTION_KEY_PII_V2
     * ```
     */
    async GetKey(lookupValue: string, keyVersion?: string): Promise<Buffer> {
        // Validate lookup value
        if (!lookupValue || typeof lookupValue !== 'string') {
            throw new Error(
                'Invalid lookup value: environment variable name is required. ' +
                'Provide the name of the environment variable containing the base64-encoded key.'
            );
        }

        // Validate env var name format to prevent injection
        if (!this.isValidEnvVarName(lookupValue)) {
            throw new Error(
                `Invalid environment variable name: "${lookupValue}". ` +
                'Names must start with a letter or underscore and contain only ' +
                'letters, numbers, and underscores.'
            );
        }

        // Build the full environment variable name
        // For versions other than '1', append _V{version}
        const envVarName = this.buildEnvVarName(lookupValue, keyVersion);

        // Retrieve the value
        const keyValue = process.env[envVarName];

        if (keyValue === undefined || keyValue === null) {
            throw new Error(
                `Encryption key not found in environment variable: "${envVarName}". ` +
                'Ensure the environment variable is set with a base64-encoded key value. ' +
                'Generate a key with: openssl rand -base64 32'
            );
        }

        if (keyValue.trim() === '') {
            throw new Error(
                `Encryption key in environment variable "${envVarName}" is empty. ` +
                'The variable must contain a non-empty base64-encoded key value.'
            );
        }

        // Decode from base64
        try {
            const keyBytes = Buffer.from(keyValue, 'base64');

            // Verify we got actual bytes (empty buffer check)
            if (keyBytes.length === 0) {
                throw new Error('Decoded key is empty');
            }

            // Validate it was actually valid base64
            // by checking the round-trip
            const roundTrip = keyBytes.toString('base64');
            const normalized = keyValue.replace(/\s+/g, '');
            if (roundTrip !== normalized && roundTrip + '=' !== normalized && roundTrip + '==' !== normalized) {
                // If they don't match, the input wasn't valid base64
                // (We allow for padding differences)
                throw new Error('Input does not appear to be valid base64 encoding');
            }

            return keyBytes;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Invalid base64 encoding for encryption key in "${envVarName}". ` +
                `The value must be a valid base64-encoded string. Error: ${message}. ` +
                'Generate a valid key with: openssl rand -base64 32'
            );
        }
    }

    /**
     * Builds the full environment variable name with optional version suffix.
     *
     * @param baseName - The base environment variable name
     * @param keyVersion - Optional version number
     * @returns The full environment variable name
     *
     * @private
     */
    private buildEnvVarName(baseName: string, keyVersion?: string): string {
        // No version or version '1' = use base name
        if (!keyVersion || keyVersion === '1') {
            return baseName;
        }

        // For other versions, append _V{version}
        return `${baseName}_V${keyVersion}`;
    }

    /**
     * Validates that a string is a valid environment variable name.
     *
     * Valid names:
     * - Start with a letter (A-Z, a-z) or underscore (_)
     * - Contain only letters, numbers, and underscores
     *
     * This prevents injection attacks where malicious lookupValues
     * could be crafted to access unintended variables.
     *
     * @param name - The name to validate
     * @returns `true` if the name is valid
     *
     * @private
     */
    private isValidEnvVarName(name: string): boolean {
        // Must be non-empty
        if (!name || name.length === 0) {
            return false;
        }

        // Maximum reasonable length to prevent DoS
        if (name.length > 256) {
            return false;
        }

        // Standard environment variable naming rules
        // Must start with letter or underscore
        // Can contain letters, numbers, underscores
        const envVarPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
        return envVarPattern.test(name);
    }
}
