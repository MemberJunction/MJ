// Core engine
export { CredentialEngine } from './CredentialEngine';

// Expiration policy, evaluation, and typed resolution errors
export {
    evaluateExpiration,
    isExpired,
    DEFAULT_EXPIRATION_CONFIG,
    DEFAULT_EXPIRATION_WARNING_WINDOW_MS,
    CredentialResolutionError,
    CredentialExpiredError,
    CredentialNotFoundError
} from './expiration';

export type {
    CredentialExpirationPolicy,
    CredentialExpirationStatus,
    CredentialExpirationConfig,
    CredentialExpirationEvaluation
} from './expiration';

// Types
export {
    CredentialResolutionOptions,
    ResolvedCredential,
    StoreCredentialOptions,
    CredentialValidationResult,
    CredentialAccessDetails,
    // Pre-defined credential value interfaces for type safety
    APIKeyCredentialValues,
    APIKeyWithEndpointCredentialValues,
    OAuth2ClientCredentialValues,
    BasicAuthCredentialValues,
    AzureServicePrincipalCredentialValues,
    AWSIAMCredentialValues,
    DatabaseConnectionCredentialValues,
    TwilioCredentialValues
} from './types';

// Re-export entity types for convenience
export {
    MJCredentialEntity,
    MJCredentialTypeEntity,
    MJCredentialCategoryEntity
} from '@memberjunction/core-entities';
