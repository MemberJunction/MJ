// Core engine
export { CredentialEngine } from './CredentialEngine';

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
