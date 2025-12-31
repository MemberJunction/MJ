/**
 * @fileoverview Azure Key Vault encryption key source provider.
 *
 * This provider retrieves encryption keys from Azure Key Vault secrets.
 * Keys are stored as base64-encoded strings in Key Vault secrets.
 *
 * ## Configuration
 *
 * The provider uses DefaultAzureCredential which supports:
 * - Environment variables (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
 * - Managed Identity (when running on Azure)
 * - Azure CLI credentials
 * - Visual Studio Code credentials
 *
 * ## Usage
 *
 * 1. Create a Key Vault in Azure
 * 2. Store the encryption key as a base64-encoded secret
 * 3. Set the KeyLookupValue to the vault URL and secret name
 * 4. Ensure the application has Secret Get permission
 *
 * ## Lookup Value Format
 *
 * The KeyLookupValue should be in the format:
 * `https://your-vault-name.vault.azure.net/secrets/secret-name`
 *
 * Or just the secret name if AZURE_KEYVAULT_URL is set:
 * `my-encryption-key`
 *
 * ## Environment Variables
 *
 * - `AZURE_KEYVAULT_URL`: Default Key Vault URL (optional)
 * - `AZURE_CLIENT_ID`: Service principal client ID (optional if using managed identity)
 * - `AZURE_CLIENT_SECRET`: Service principal secret (optional if using managed identity)
 * - `AZURE_TENANT_ID`: Azure AD tenant ID (optional if using managed identity)
 *
 * @module @memberjunction/encryption
 */

import { RegisterClass } from '@memberjunction/global';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';

// Lazy-load Azure SDK to avoid requiring it when not used
let SecretClient: typeof import('@azure/keyvault-secrets').SecretClient | null = null;
let DefaultAzureCredential: typeof import('@azure/identity').DefaultAzureCredential | null = null;

/**
 * Azure Key Vault key source provider.
 *
 * Retrieves encryption keys from Azure Key Vault secrets.
 * Secrets should contain base64-encoded key material.
 *
 * ## Security Notes
 *
 * - Keys are stored encrypted at rest in Key Vault
 * - Access is controlled by Azure RBAC or Key Vault access policies
 * - All operations are logged in Azure Monitor
 * - Supports secret versioning and soft-delete
 *
 * @example
 * ```typescript
 * // In database: KeyLookupValue = 'https://my-vault.vault.azure.net/secrets/mj-encryption-key'
 * // Or if AZURE_KEYVAULT_URL is set: KeyLookupValue = 'mj-encryption-key'
 * ```
 */
@RegisterClass(EncryptionKeySourceBase, 'AzureKeyVaultKeySource')
export class AzureKeyVaultKeySource extends EncryptionKeySourceBase {
    private _clients: Map<string, InstanceType<typeof import('@azure/keyvault-secrets').SecretClient>> = new Map();
    private _initialized = false;
    private _defaultVaultUrl: string | null = null;

    /**
     * Human-readable name for this key source.
     */
    get SourceName(): string {
        return 'Azure Key Vault';
    }

    /**
     * Initializes the Azure Key Vault client.
     *
     * Lazy-loads the Azure SDK to avoid requiring it when not used.
     * Uses DefaultAzureCredential for authentication.
     */
    async Initialize(): Promise<void> {
        if (this._initialized) {
            return;
        }

        try {
            // Lazy-load Azure SDKs
            const secretsModule = await import('@azure/keyvault-secrets');
            const identityModule = await import('@azure/identity');

            SecretClient = secretsModule.SecretClient;
            DefaultAzureCredential = identityModule.DefaultAzureCredential;

            // Get default vault URL if configured
            this._defaultVaultUrl = process.env.AZURE_KEYVAULT_URL || null;

            this._initialized = true;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Failed to initialize Azure Key Vault client: ${message}. ` +
                'Ensure @azure/keyvault-secrets and @azure/identity are installed: ' +
                'npm install @azure/keyvault-secrets @azure/identity'
            );
        }
    }

    /**
     * Validates that the Azure Key Vault client is properly configured.
     *
     * @returns true if the client is initialized
     */
    ValidateConfiguration(): boolean {
        if (!this._initialized) {
            return false;
        }

        // Configuration is valid - credentials will be validated on first use
        return true;
    }

    /**
     * Checks if a secret name/URL appears to be valid.
     *
     * @param lookupValue - The secret URL or name
     * @returns true if the lookup value appears valid
     */
    async KeyExists(lookupValue: string): Promise<boolean> {
        if (!lookupValue) {
            return false;
        }

        // Check for valid patterns
        // Full URL: https://vault-name.vault.azure.net/secrets/secret-name
        // Secret name only: my-secret-name (requires AZURE_KEYVAULT_URL)
        const urlPattern = /^https:\/\/[a-zA-Z0-9-]+\.vault\.azure\.net\/secrets\/[a-zA-Z0-9-]+/;
        const namePattern = /^[a-zA-Z0-9-]+$/;

        if (urlPattern.test(lookupValue)) {
            return true;
        }

        if (namePattern.test(lookupValue) && this._defaultVaultUrl) {
            return true;
        }

        return false;
    }

    /**
     * Retrieves encryption key material from Azure Key Vault.
     *
     * @param lookupValue - Secret URL or name (if AZURE_KEYVAULT_URL is set)
     * @param keyVersion - Optional secret version (uses latest if not specified)
     * @returns Buffer containing the key material
     *
     * @throws Error if the secret cannot be retrieved
     */
    async GetKey(lookupValue: string, keyVersion?: string): Promise<Buffer> {
        if (!this._initialized) {
            await this.Initialize();
        }

        if (!SecretClient || !DefaultAzureCredential) {
            throw new Error('Azure Key Vault client not initialized');
        }

        if (!lookupValue) {
            throw new Error(
                'Azure Key Vault key source requires a lookup value. ' +
                'Provide the secret URL or name.'
            );
        }

        try {
            // Parse the lookup value to get vault URL and secret name
            const { vaultUrl, secretName } = this.parseLookupValue(lookupValue);

            // Get or create client for this vault
            let client = this._clients.get(vaultUrl);
            if (!client) {
                const credential = new DefaultAzureCredential();
                client = new SecretClient(vaultUrl, credential);
                this._clients.set(vaultUrl, client);
            }

            // Build secret options
            const options = keyVersion ? { version: keyVersion } : {};

            // Get the secret
            const secret = await client.getSecret(secretName, options);

            if (!secret.value) {
                throw new Error(`Secret "${secretName}" has no value`);
            }

            // Secret value should be base64-encoded key material
            try {
                return Buffer.from(secret.value, 'base64');
            } catch {
                throw new Error(
                    `Secret "${secretName}" is not valid base64. ` +
                    'Encryption keys must be stored as base64-encoded strings in Key Vault.'
                );
            }

        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);

            // Provide helpful error messages for common issues
            if (message.includes('SecretNotFound')) {
                throw new Error(
                    `Azure Key Vault secret not found: ${lookupValue}. ` +
                    `Verify the secret exists in the vault.`
                );
            }

            if (message.includes('Forbidden') || message.includes('AccessDenied')) {
                throw new Error(
                    `Azure Key Vault access denied for: ${lookupValue}. ` +
                    `Ensure the application has Secret Get permission.`
                );
            }

            if (message.includes('AuthenticationError')) {
                throw new Error(
                    `Azure authentication failed. ` +
                    `Ensure credentials are configured (managed identity, service principal, or Azure CLI).`
                );
            }

            throw new Error(`Azure Key Vault key retrieval failed: ${message}`);
        }
    }

    /**
     * Parses a lookup value into vault URL and secret name.
     *
     * @private
     */
    private parseLookupValue(lookupValue: string): { vaultUrl: string; secretName: string } {
        // Full URL format: https://vault-name.vault.azure.net/secrets/secret-name[/version]
        const urlMatch = lookupValue.match(
            /^(https:\/\/[a-zA-Z0-9-]+\.vault\.azure\.net)\/secrets\/([a-zA-Z0-9-]+)/
        );

        if (urlMatch) {
            return {
                vaultUrl: urlMatch[1],
                secretName: urlMatch[2]
            };
        }

        // Simple name format (requires AZURE_KEYVAULT_URL)
        if (this._defaultVaultUrl) {
            return {
                vaultUrl: this._defaultVaultUrl,
                secretName: lookupValue
            };
        }

        throw new Error(
            `Invalid Key Vault lookup value: "${lookupValue}". ` +
            `Expected format: https://vault-name.vault.azure.net/secrets/secret-name ` +
            `or set AZURE_KEYVAULT_URL and provide just the secret name.`
        );
    }

    /**
     * Cleans up Azure Key Vault clients.
     */
    async Dispose(): Promise<void> {
        this._clients.clear();
        this._initialized = false;
    }
}
