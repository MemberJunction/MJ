/**
 * @fileoverview MemberJunction Field-Level Encryption Package
 *
 * This package provides field-level encryption capabilities for MemberJunction
 * entities. It enables encrypting sensitive data at rest in the database while
 * providing transparent decryption for authorized access.
 *
 * ## Features
 *
 * - **AES-256-GCM/CBC encryption** - Industry-standard authenticated encryption
 * - **Pluggable key sources** - Environment variables, config files, or custom providers
 * - **Declarative configuration** - Enable encryption via EntityField metadata
 * - **Transparent operation** - Automatic encrypt on save, decrypt on load
 * - **Key rotation support** - Full re-encryption with transactional safety
 *
 * ## Quick Start
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
 * // Check if value is encrypted
 * if (engine.IsEncrypted(someValue)) {
 *   // Handle encrypted value
 * }
 * ```
 *
 * ## Key Source Providers
 *
 * Built-in providers:
 * - `EnvVarKeySource` - Reads keys from environment variables
 * - `ConfigFileKeySource` - Reads keys from mj.config.cjs
 *
 * To create a custom provider, extend `EncryptionKeySourceBase`.
 *
 * ## Security Considerations
 *
 * - Keys are never stored in the database
 * - Authenticated encryption (GCM) prevents tampering
 * - Random IVs for each encryption operation
 * - Cached key material has configurable TTL
 *
 * @module @memberjunction/encryption
 * @packageDocumentation
 */

// Core interfaces and types
export {
    EncryptionKeySourceConfig,
    EncryptedValueParts,
    KeyConfiguration,
    RotateKeyParams,
    RotateKeyResult,
    EnableFieldEncryptionParams,
    EnableFieldEncryptionResult,
    // API Key interfaces
    CreateAPIKeyParams,
    CreateAPIKeyResult,
    APIKeyValidationResult,
    GeneratedAPIKey
} from './interfaces';

// Base class for key source providers
export { EncryptionKeySourceBase } from './EncryptionKeySourceBase';

// Core encryption engine
export { EncryptionEngine } from './EncryptionEngine';

// Built-in key source providers
export { EnvVarKeySource } from './providers/EnvVarKeySource';
export { ConfigFileKeySource } from './providers/ConfigFileKeySource';

// Cloud key source providers (require optional dependencies)
export { AWSKMSKeySource } from './providers/AWSKMSKeySource';
export { AzureKeyVaultKeySource } from './providers/AzureKeyVaultKeySource';

// Actions for key management and data migration
export { RotateEncryptionKeyAction } from './actions/RotateEncryptionKeyAction';
export { EnableFieldEncryptionAction } from './actions/EnableFieldEncryptionAction';

// API Key utilities (legacy functions - prefer EncryptionEngine methods)
// These are maintained for backwards compatibility but the OOP methods on
// EncryptionEngine (GenerateAPIKey, HashAPIKey, CreateAPIKey, ValidateAPIKey, etc.)
// are the preferred approach.
export {
    generateAPIKey,
    hashAPIKey,
    isValidAPIKeyFormat,
    validateAPIKey
} from './apiKeyUtils';