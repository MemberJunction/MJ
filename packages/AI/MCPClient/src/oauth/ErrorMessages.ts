/**
 * @fileoverview User-friendly error message mapping for OAuth errors
 *
 * Maps technical OAuth error codes to human-readable messages with
 * actionable guidance for users and administrators.
 *
 * @module @memberjunction/ai-mcp-client/oauth/ErrorMessages
 */

/**
 * OAuth error code to user message mapping
 */
interface OAuthErrorMapping {
    /** User-friendly message */
    userMessage: string;
    /** Whether the error is retryable */
    isRetryable: boolean;
    /** Whether re-authorization is required */
    requiresReauthorization: boolean;
    /** Technical details for logging */
    technicalDetails?: string;
}

/**
 * Provides user-friendly error messages for OAuth errors.
 *
 * Maps technical OAuth error codes to messages that help users understand
 * what went wrong and what they can do about it.
 *
 * @example
 * ```typescript
 * try {
 *     await tokenManager.refreshTokens();
 * } catch (error) {
 *     const mapped = OAuthErrorMessages.mapError(error.message);
 *     showUserNotification(mapped.userMessage);
 *     if (mapped.requiresReauthorization) {
 *         promptForReauthorization();
 *     }
 * }
 * ```
 */
export class OAuthErrorMessages {
    /** Error mappings for standard OAuth error codes */
    private static readonly errorMappings: Record<string, OAuthErrorMapping> = {
        // Authorization errors
        'access_denied': {
            userMessage: 'Access was denied by the authorization server. Contact your administrator if you believe this is an error.',
            isRetryable: true,
            requiresReauthorization: true
        },
        'invalid_request': {
            userMessage: 'The authorization request was invalid. Please try connecting again.',
            isRetryable: true,
            requiresReauthorization: true
        },
        'unauthorized_client': {
            userMessage: 'This application is not authorized to connect to this service. Contact your administrator.',
            isRetryable: false,
            requiresReauthorization: false,
            technicalDetails: 'Client not registered or client credentials invalid'
        },
        'unsupported_response_type': {
            userMessage: 'Connection configuration error. Please contact your administrator.',
            isRetryable: false,
            requiresReauthorization: false,
            technicalDetails: 'Authorization server does not support required response type'
        },
        'invalid_scope': {
            userMessage: 'The requested permissions are not available. Contact your administrator to adjust the configuration.',
            isRetryable: false,
            requiresReauthorization: false
        },
        'server_error': {
            userMessage: 'The authorization server is temporarily unavailable. Please try again later.',
            isRetryable: true,
            requiresReauthorization: false
        },
        'temporarily_unavailable': {
            userMessage: 'The authorization server is temporarily unavailable. Please try again later.',
            isRetryable: true,
            requiresReauthorization: false
        },

        // Token errors
        'invalid_grant': {
            userMessage: 'Your session has expired. Please reconnect to continue.',
            isRetryable: false,
            requiresReauthorization: true,
            technicalDetails: 'Authorization code expired or refresh token invalid/expired'
        },
        'invalid_client': {
            userMessage: 'Connection configuration error. Please contact your administrator.',
            isRetryable: false,
            requiresReauthorization: false,
            technicalDetails: 'Client authentication failed'
        },
        'unsupported_grant_type': {
            userMessage: 'Connection configuration error. Please contact your administrator.',
            isRetryable: false,
            requiresReauthorization: false,
            technicalDetails: 'Authorization server does not support required grant type'
        },

        // DCR errors
        'invalid_redirect_uri': {
            userMessage: 'Automatic registration failed. Your administrator may need to configure this connection manually.',
            isRetryable: false,
            requiresReauthorization: false,
            technicalDetails: 'Redirect URI not acceptable to authorization server'
        },
        'invalid_client_metadata': {
            userMessage: 'Automatic registration failed. Your administrator may need to configure this connection manually.',
            isRetryable: false,
            requiresReauthorization: false,
            technicalDetails: 'Client metadata rejected by authorization server'
        },
        'registration_not_supported': {
            userMessage: 'This server requires manual client registration. Contact your administrator.',
            isRetryable: false,
            requiresReauthorization: false,
            technicalDetails: 'Authorization server does not support Dynamic Client Registration'
        },

        // Network/general errors
        'network_error': {
            userMessage: 'Could not reach the authorization server. Check your network connection.',
            isRetryable: true,
            requiresReauthorization: false
        },
        'timeout': {
            userMessage: 'The authorization server took too long to respond. Please try again.',
            isRetryable: true,
            requiresReauthorization: false
        },
        'metadata_discovery_failed': {
            userMessage: 'Could not connect to the authorization server. The server configuration may be incorrect.',
            isRetryable: true,
            requiresReauthorization: false,
            technicalDetails: 'Failed to fetch authorization server metadata from .well-known endpoint'
        },
        'authorization_timeout': {
            userMessage: 'Authorization timed out. Please try connecting again.',
            isRetryable: true,
            requiresReauthorization: true
        },
        'state_mismatch': {
            userMessage: 'Authorization verification failed. Please try connecting again.',
            isRetryable: true,
            requiresReauthorization: true,
            technicalDetails: 'State parameter mismatch - possible CSRF attack or stale authorization'
        },
        'pkce_verification_failed': {
            userMessage: 'Authorization verification failed. Please try connecting again.',
            isRetryable: true,
            requiresReauthorization: true,
            technicalDetails: 'PKCE code_verifier did not match code_challenge'
        }
    };

    /** Default error mapping for unknown errors */
    private static readonly defaultMapping: OAuthErrorMapping = {
        userMessage: 'An unexpected error occurred. Please try again or contact your administrator.',
        isRetryable: true,
        requiresReauthorization: false
    };

    /**
     * Maps an OAuth error code to user-friendly error information.
     *
     * @param errorCode - The OAuth error code or error message
     * @returns Error information with user message and retry guidance
     */
    public static mapError(errorCode: string): OAuthErrorMapping {
        // Normalize the error code to lowercase
        const normalizedCode = errorCode.toLowerCase().trim();

        // Check for exact match
        if (this.errorMappings[normalizedCode]) {
            return this.errorMappings[normalizedCode];
        }

        // Check for partial matches (error might be embedded in message)
        for (const [code, mapping] of Object.entries(this.errorMappings)) {
            if (normalizedCode.includes(code)) {
                return mapping;
            }
        }

        // Return default mapping for unknown errors
        return { ...this.defaultMapping, technicalDetails: errorCode };
    }

    /**
     * Gets a user-friendly message for an OAuth error.
     *
     * @param errorCode - The OAuth error code or error message
     * @returns User-friendly error message
     */
    public static getUserMessage(errorCode: string): string {
        return this.mapError(errorCode).userMessage;
    }

    /**
     * Checks if an error indicates re-authorization is required.
     *
     * @param errorCode - The OAuth error code or error message
     * @returns true if re-authorization is required
     */
    public static requiresReauthorization(errorCode: string): boolean {
        return this.mapError(errorCode).requiresReauthorization;
    }

    /**
     * Checks if an error is retryable.
     *
     * @param errorCode - The OAuth error code or error message
     * @returns true if the operation can be retried
     */
    public static isRetryable(errorCode: string): boolean {
        return this.mapError(errorCode).isRetryable;
    }

    /**
     * Creates an error message from an OAuth error response.
     *
     * @param error - OAuth error code
     * @param description - Optional error description from server
     * @returns Combined error message for logging
     */
    public static formatErrorForLogging(error: string, description?: string): string {
        const mapped = this.mapError(error);
        let message = `OAuth Error [${error}]: ${mapped.userMessage}`;

        if (description) {
            message += ` Server message: ${description}`;
        }

        if (mapped.technicalDetails) {
            message += ` Technical: ${mapped.technicalDetails}`;
        }

        return message;
    }
}
