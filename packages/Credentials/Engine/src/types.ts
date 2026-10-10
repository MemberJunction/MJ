import { UserInfo } from "@memberjunction/core";
import { MJCredentialEntity } from "@memberjunction/core-entities";
import { CredentialExpirationPolicy, CredentialExpirationStatus } from "./expiration";

/**
 * Options for resolving credentials.
 */
export interface CredentialResolutionOptions {
    /**
     * Optional: Specific credential ID to retrieve.
     * Takes precedence over credentialName lookup.
     */
    credentialId?: string;

    /**
     * Optional: Override the credential name to look up.
     * If not provided, uses the name passed to getCredential().
     */
    credentialName?: string;

    /**
     * Optional: Direct values to use instead of database lookup.
     * Takes precedence over all other options. Useful for testing
     * or when credentials are provided via other means.
     */
    directValues?: Record<string, string>;

    /**
     * Required on server-side: The user context for the operation.
     * Used for audit logging and database access.
     */
    contextUser?: UserInfo;

    /**
     * Optional: Subsystem name for audit logging.
     * Helps identify where credentials are being used.
     */
    subsystem?: string;

    /**
     * Optional: Override the engine-wide expiration policy for this one call.
     *
     * Pass `'warn'` for the narrow set of callers that legitimately need to read
     * a credential *because* it has expired — chiefly credential rotation and
     * administration tooling, which must load the stale value in order to
     * replace it. Ordinary consumers should leave this unset and inherit the
     * engine's configured policy.
     */
    expirationPolicy?: CredentialExpirationPolicy;
}

/**
 * The resolved credential with its values and source information.
 *
 * @template T - The shape of the credential values (defaults to Record<string, string>)
 */
export interface ResolvedCredential<T extends Record<string, string> = Record<string, string>> {
    /**
     * The credential entity if loaded from database.
     * Will be null if directValues was provided.
     */
    credential: MJCredentialEntity | null;

    /**
     * The decrypted credential values, typed according to the credential type's FieldSchema.
     *
     * For example, for an "API Key" type credential:
     * ```typescript
     * interface APIKeyValues {
     *     apiKey: string;
     * }
     * const cred = await engine.getCredential<APIKeyValues>('OpenAI', options);
     * console.log(cred.values.apiKey); // Strongly typed!
     * ```
     */
    values: T;

    /**
     * Where the credential came from.
     * - 'database': Loaded from the Credentials table
     * - 'request': Provided via directValues option
     */
    source: 'database' | 'request';

    /**
     * Optional expiration date from the credential.
     * Null if no expiration is set.
     */
    expiresAt?: Date | null;

    /**
     * The credential's lifecycle state at the moment it was resolved.
     *
     * Credentials supplied via `directValues` always report `'valid'` — the
     * caller owns their lifetime and the engine knows nothing about it.
     *
     * A resolved credential can legitimately be `'expired'` here: that happens
     * under a `'warn'` policy, or inside the configured grace period. Callers
     * that want to refuse such a credential should check this field rather than
     * assuming a successful resolve implies a live credential.
     */
    expirationStatus: CredentialExpirationStatus;

    /**
     * Whole days until the credential expires, negative once it has expired,
     * and null when the credential has no expiry. Useful for surfacing
     * "expires in N days" without re-deriving it from `expiresAt`.
     */
    daysUntilExpiration?: number | null;
}

/**
 * Options for storing a new credential.
 */
export interface StoreCredentialOptions {
    /**
     * If true, this credential will be set as the default for its type.
     */
    isDefault?: boolean;

    /**
     * Optional: Category ID to organize the credential.
     */
    categoryId?: string;

    /**
     * Optional: Icon class for UI display.
     */
    iconClass?: string;

    /**
     * Optional: Description for the credential.
     */
    description?: string;

    /**
     * Optional: Expiration date.
     */
    expiresAt?: Date;
}

/**
 * Result of credential validation.
 */
export interface CredentialValidationResult {
    /**
     * Whether the credential is valid.
     */
    isValid: boolean;

    /**
     * Errors encountered during validation.
     */
    errors: string[];

    /**
     * Non-fatal warnings.
     */
    warnings: string[];

    /**
     * When the validation occurred.
     */
    validatedAt: Date;
}

/**
 * Details logged for credential access.
 */
export interface CredentialAccessDetails {
    /**
     * The type of operation performed.
     */
    operation: 'Decrypt' | 'Create' | 'Update' | 'Delete' | 'Validate';

    /**
     * The subsystem that accessed the credential.
     */
    subsystem?: string;

    /**
     * Whether the operation succeeded.
     */
    success: boolean;

    /**
     * Error message if the operation failed.
     */
    errorMessage?: string;

    /**
     * Time taken for the operation in milliseconds.
     */
    durationMs?: number;

    /**
     * The credential's lifecycle state at the time of the operation.
     *
     * Recorded in the audit log so an auditor can answer "was any credential
     * used while expired?" — which matters under a `'warn'` policy or a grace
     * period, where such a use succeeds rather than failing loudly.
     */
    expirationStatus?: CredentialExpirationStatus;
}

// ============================================================================
// Common Credential Value Interfaces
// ============================================================================
// These interfaces match the FieldSchema definitions in the credential types.
// Use them as generic type parameters for getCredential<T>() for type safety.

/**
 * Values for "API Key" credential type.
 * Used by: OpenAI, Anthropic, Groq, Mistral, Google Gemini, SendGrid, etc.
 */
export interface APIKeyCredentialValues {
    apiKey: string;
}

/**
 * Values for "API Key with Endpoint" credential type.
 * Used by: Azure OpenAI, custom API endpoints
 */
export interface APIKeyWithEndpointCredentialValues {
    apiKey: string;
    endpoint: string;
}

/**
 * Values for "OAuth2 Client Credentials" credential type.
 */
export interface OAuth2ClientCredentialValues {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    scope?: string;
}

/**
 * Values for "Basic Auth" credential type.
 */
export interface BasicAuthCredentialValues {
    username: string;
    password: string;
}

/**
 * Values for "Azure Service Principal" credential type.
 * Used by: Microsoft Graph, Azure OpenAI, Azure Blob Storage
 */
export interface AzureServicePrincipalCredentialValues {
    tenantId: string;
    clientId: string;
    clientSecret: string;
}

/**
 * Values for "AWS IAM" credential type.
 * Used by: S3, SES, Lambda, other AWS services
 */
export interface AWSIAMCredentialValues {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

/**
 * Values for "Database Connection" credential type.
 */
export interface DatabaseConnectionCredentialValues {
    host: string;
    port?: number;
    database: string;
    username: string;
    password: string;
}

/**
 * Values for "Twilio" credential type.
 */
export interface TwilioCredentialValues {
    accountSid: string;
    authToken: string;
}
