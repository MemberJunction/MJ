/**
 * Credential utilities for MemberJunction Communication providers.
 *
 * This module provides interim credential management functionality that allows
 * per-request credential overrides while maintaining backward compatibility
 * with environment variable-based configuration.
 *
 * @module CredentialUtils
 */

/**
 * Base interface for provider credentials.
 * Each provider extends this with their specific credential fields.
 *
 * @remarks
 * **TEMPORARY INTERFACE**: This interface is an interim solution for the 2.x patch release.
 * In a future release, this will be replaced by a more comprehensive credential management
 * system with database storage, encryption, and multi-tenancy support. The replacement
 * interface will be located in `@memberjunction/credentials` or `@memberjunction/core`.
 *
 * This interface is designed to be forward-compatible with the 3.0 `CredentialResolutionOptions`
 * system. When migrating to 3.0, credential objects passed using this interface will work
 * with the new system's `directValues` parameter.
 *
 * @see plans/3_0_credentials_design.md for the full 3.0 credential system design
 *
 * @example
 * ```typescript
 * // Provider-specific credentials extend this base
 * interface SendGridCredentials extends ProviderCredentialsBase {
 *     apiKey?: string;
 * }
 *
 * // Usage with fallback enabled (default)
 * await provider.SendSingleMessage(message, { apiKey: 'SG.xxx' });
 *
 * // Usage with fallback disabled
 * await provider.SendSingleMessage(message, {
 *     apiKey: 'SG.xxx',
 *     disableEnvironmentFallback: true
 * });
 * ```
 */
export interface ProviderCredentialsBase {
    /**
     * When true, environment variable fallback is DISABLED for this request.
     * If credentials are incomplete and this is true, the request will fail
     * rather than falling back to environment variables.
     *
     * @default false (fallback enabled for backward compatibility)
     *
     * @example
     * ```typescript
     * // With fallback (default) - uses env var if apiKey not provided
     * await provider.SendSingleMessage(message, {});
     *
     * // Without fallback - fails if apiKey not provided
     * await provider.SendSingleMessage(message, {
     *     disableEnvironmentFallback: true
     * });
     * ```
     */
    disableEnvironmentFallback?: boolean;
}

/**
 * Resolves a single credential value by checking the request value first,
 * then falling back to the environment value if allowed.
 *
 * @param requestValue - Value provided in the request (takes precedence)
 * @param envValue - Value from environment variable (fallback)
 * @param disableFallback - If true, don't use the environment value
 * @returns The resolved value, or undefined if not available
 *
 * @example
 * ```typescript
 * const apiKey = resolveCredentialValue(
 *     credentials?.apiKey,           // From request
 *     process.env.SENDGRID_API_KEY,  // From environment
 *     credentials?.disableEnvironmentFallback ?? false
 * );
 * ```
 */
export function resolveCredentialValue<T>(
    requestValue: T | undefined,
    envValue: T | undefined,
    disableFallback: boolean
): T | undefined {
    // Request value takes precedence if it's a non-empty value
    if (requestValue !== undefined && requestValue !== null && requestValue !== '') {
        return requestValue;
    }

    // Fall back to environment value if allowed
    if (!disableFallback) {
        return envValue;
    }

    return undefined;
}

/**
 * Validates that all required credential fields are present in the resolved credentials.
 * Throws an error if any required fields are missing.
 *
 * @param resolved - Object containing resolved credential values
 * @param requiredFields - Array of field names that must be present
 * @param providerName - Name of the provider (for error messages)
 * @throws Error if any required fields are missing
 *
 * @example
 * ```typescript
 * const resolved = {
 *     apiKey: resolveCredentialValue(creds?.apiKey, envApiKey, disableFallback)
 * };
 *
 * validateRequiredCredentials(resolved, ['apiKey'], 'SendGrid');
 * // Throws: "Missing required credentials for SendGrid: apiKey. Provide in request or set environment variables."
 * ```
 */
export function validateRequiredCredentials(
    resolved: Record<string, unknown>,
    requiredFields: string[],
    providerName: string
): void {
    const missing = requiredFields.filter(
        field => resolved[field] === undefined || resolved[field] === null || resolved[field] === ''
    );

    if (missing.length > 0) {
        throw new Error(
            `Missing required credentials for ${providerName}: ${missing.join(', ')}. ` +
            `Provide in request or set environment variables.`
        );
    }
}

/**
 * Result of credential resolution, tracking where each value came from.
 * Useful for debugging and audit logging.
 *
 * @remarks
 * This interface is designed to be forward-compatible with the 3.0 credential
 * system's `ResolvedCredential` interface.
 */
export interface CredentialResolutionResult<T extends Record<string, unknown>> {
    /**
     * The resolved credential values
     */
    values: T;

    /**
     * Source of the credentials: 'request', 'environment', or 'mixed'
     */
    source: 'request' | 'environment' | 'mixed';

    /**
     * Which fields came from request vs environment (for debugging)
     */
    fieldSources: Record<keyof T, 'request' | 'environment'>;
}

/**
 * Resolves multiple credential fields at once, tracking the source of each value.
 *
 * @param requestCredentials - Credentials provided in the request
 * @param envCredentials - Credentials from environment variables
 * @param fieldNames - Array of field names to resolve
 * @param disableFallback - If true, don't use environment values
 * @returns Resolution result with values and source tracking
 *
 * @example
 * ```typescript
 * const result = resolveCredentials(
 *     credentials,
 *     { tenantId: process.env.AZURE_TENANT_ID, clientId: process.env.AZURE_CLIENT_ID },
 *     ['tenantId', 'clientId', 'clientSecret'],
 *     credentials?.disableEnvironmentFallback ?? false
 * );
 *
 * console.log(result.source); // 'mixed' if some from request, some from env
 * console.log(result.fieldSources); // { tenantId: 'request', clientId: 'environment', ... }
 * ```
 */
export function resolveCredentials<T extends Record<string, unknown>>(
    requestCredentials: Partial<T> | undefined,
    envCredentials: Partial<T>,
    fieldNames: (keyof T)[],
    disableFallback: boolean
): CredentialResolutionResult<Partial<T>> {
    const values: Partial<T> = {};
    const fieldSources: Record<string, 'request' | 'environment'> = {};

    let hasRequest = false;
    let hasEnv = false;

    for (const field of fieldNames) {
        const requestValue = requestCredentials?.[field];
        const envValue = envCredentials[field];

        // Check if request has a valid value
        const requestHasValue = requestValue !== undefined && requestValue !== null && requestValue !== '';
        const envHasValue = envValue !== undefined && envValue !== null && envValue !== '';

        if (requestHasValue) {
            values[field] = requestValue;
            fieldSources[field as string] = 'request';
            hasRequest = true;
        } else if (envHasValue && !disableFallback) {
            values[field] = envValue;
            fieldSources[field as string] = 'environment';
            hasEnv = true;
        }
    }

    const source = hasRequest && hasEnv ? 'mixed' :
                   hasRequest ? 'request' : 'environment';

    return {
        values,
        source,
        fieldSources: fieldSources as Record<keyof T, 'request' | 'environment'>
    };
}
