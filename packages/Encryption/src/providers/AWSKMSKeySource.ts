/**
 * @fileoverview AWS KMS encryption key source provider.
 *
 * This provider retrieves encryption keys from AWS Key Management Service (KMS).
 * It supports both symmetric keys and data key encryption using envelope encryption.
 *
 * ## Configuration
 *
 * The provider uses the standard AWS credential chain:
 * - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * - Shared credentials file (~/.aws/credentials)
 * - IAM role (when running on EC2, ECS, Lambda, etc.)
 *
 * ## Usage
 *
 * 1. Create a symmetric key in AWS KMS
 * 2. Store the key ARN or alias as the KeyLookupValue in MemberJunction
 * 3. Ensure the application has kms:Decrypt permission for the key
 *
 * ## Lookup Value Format
 *
 * The KeyLookupValue should be in one of these formats:
 * - Full ARN: `arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012`
 * - Alias ARN: `arn:aws:kms:us-east-1:123456789012:alias/my-key`
 * - Alias name: `alias/my-key` (uses default region)
 *
 * ## Environment Variables
 *
 * - `AWS_REGION` or `AWS_DEFAULT_REGION`: AWS region (required if not in ARN)
 * - `AWS_ACCESS_KEY_ID`: Access key (optional if using IAM role)
 * - `AWS_SECRET_ACCESS_KEY`: Secret key (optional if using IAM role)
 *
 * @module @memberjunction/encryption
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';

// Lazy-load AWS SDK to avoid requiring it when not used
let KMSClient: typeof import('@aws-sdk/client-kms').KMSClient | null = null;
let DecryptCommand: typeof import('@aws-sdk/client-kms').DecryptCommand | null = null;

/**
 * AWS KMS key source provider.
 *
 * Retrieves encryption keys from AWS Key Management Service.
 * The key material is stored encrypted in KMS and decrypted on retrieval.
 *
 * ## Security Notes
 *
 * - Key material never leaves AWS in plaintext until decryption
 * - All operations are logged in CloudTrail
 * - IAM policies control access to keys
 * - Supports key rotation managed by AWS
 *
 * @example
 * ```typescript
 * // In database: KeyLookupValue = 'alias/mj-encryption-key'
 * // The provider will call KMS to decrypt the data key
 * ```
 */
@RegisterClass(EncryptionKeySourceBase, 'AWSKMSKeySource')
export class AWSKMSKeySource extends EncryptionKeySourceBase {
    private _client: InstanceType<typeof import('@aws-sdk/client-kms').KMSClient> | null = null;
    private _initialized = false;

    /**
     * Human-readable name for this key source.
     */
    get SourceName(): string {
        return 'AWS KMS';
    }

    /**
     * Initializes the AWS KMS client.
     *
     * Lazy-loads the AWS SDK to avoid requiring it when not used.
     * Uses the default credential chain for authentication.
     */
    async Initialize(): Promise<void> {
        if (this._initialized) {
            return;
        }

        try {
            // Lazy-load AWS SDK
            const kmsModule = await import('@aws-sdk/client-kms');
            KMSClient = kmsModule.KMSClient;
            DecryptCommand = kmsModule.DecryptCommand;

            // Create client with default credential chain
            const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

            this._client = new KMSClient({
                region: region || undefined
            });

            this._initialized = true;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Failed to initialize AWS KMS client: ${message}. ` +
                'Ensure @aws-sdk/client-kms is installed: npm install @aws-sdk/client-kms'
            );
        }
    }

    /**
     * Validates that the AWS KMS client is properly configured.
     *
     * @returns true if the client is initialized and region is configured
     */
    ValidateConfiguration(): boolean {
        if (!this._initialized || !this._client) {
            return false;
        }

        // Check that we have a region configured
        const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
        if (!region) {
            LogError(
                'AWS KMS key source: No AWS region configured. ' +
                'Set AWS_REGION or AWS_DEFAULT_REGION environment variable.'
            );
            return false;
        }

        return true;
    }

    /**
     * Checks if a key exists in AWS KMS.
     *
     * Note: This only checks if the key ARN/alias format is valid.
     * Actual key existence is verified on GetKey().
     *
     * @param lookupValue - The KMS key ARN or alias
     * @returns true if the lookup value appears to be a valid KMS key reference
     */
    async KeyExists(lookupValue: string): Promise<boolean> {
        if (!lookupValue) {
            return false;
        }

        // Check for valid KMS key reference formats
        // ARN: arn:aws:kms:region:account:key/key-id
        // Alias ARN: arn:aws:kms:region:account:alias/alias-name
        // Alias: alias/alias-name
        const arnPattern = /^arn:aws:kms:[a-z0-9-]+:[0-9]+:(key|alias)\/.+$/;
        const aliasPattern = /^alias\/.+$/;

        return arnPattern.test(lookupValue) || aliasPattern.test(lookupValue);
    }

    /**
     * Retrieves encryption key material from AWS KMS.
     *
     * This method expects the lookupValue to contain a base64-encoded
     * encrypted data key (ciphertext blob) that was encrypted using
     * a KMS customer master key (CMK).
     *
     * For envelope encryption pattern:
     * 1. Generate a data key using KMS GenerateDataKey
     * 2. Store the encrypted data key (CiphertextBlob) as base64 in lookupValue
     * 3. This method decrypts it to get the plaintext key
     *
     * @param lookupValue - Base64-encoded encrypted data key
     * @param _keyVersion - Not used for KMS (versioning handled by KMS)
     * @returns Buffer containing the decrypted key material
     *
     * @throws Error if the key cannot be decrypted
     */
    async GetKey(lookupValue: string, _keyVersion?: string): Promise<Buffer> {
        if (!this._initialized || !this._client) {
            await this.Initialize();
        }

        if (!this._client || !DecryptCommand) {
            throw new Error('AWS KMS client not initialized');
        }

        if (!lookupValue) {
            throw new Error(
                'AWS KMS key source requires a lookup value. ' +
                'Provide the base64-encoded encrypted data key (CiphertextBlob).'
            );
        }

        try {
            // The lookupValue should be a base64-encoded encrypted data key
            // This is the CiphertextBlob from GenerateDataKey
            const ciphertextBlob = Buffer.from(lookupValue, 'base64');

            // Decrypt the data key using KMS
            const command = new DecryptCommand({
                CiphertextBlob: Uint8Array.from(ciphertextBlob)
            });

            const response = await this._client.send(command);

            if (!response.Plaintext) {
                throw new Error('KMS returned empty plaintext');
            }

            // Convert Uint8Array to Buffer
            return Buffer.from(response.Plaintext);

        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);

            // Provide helpful error messages for common issues
            if (message.includes('InvalidCiphertextException')) {
                throw new Error(
                    `AWS KMS decryption failed: Invalid ciphertext. ` +
                    `Ensure the lookup value contains a valid base64-encoded encrypted data key.`
                );
            }

            if (message.includes('AccessDeniedException')) {
                throw new Error(
                    `AWS KMS access denied. ` +
                    `Ensure the application has kms:Decrypt permission for the key.`
                );
            }

            if (message.includes('NotFoundException')) {
                throw new Error(
                    `AWS KMS key not found. ` +
                    `Verify the key ARN/alias exists and is in the correct region.`
                );
            }

            throw new Error(`AWS KMS key retrieval failed: ${message}`);
        }
    }

    /**
     * Cleans up the AWS KMS client.
     */
    async Dispose(): Promise<void> {
        if (this._client) {
            this._client.destroy();
            this._client = null;
        }
        this._initialized = false;
    }
}
