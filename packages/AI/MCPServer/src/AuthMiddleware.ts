import { UserInfo } from '@memberjunction/core';
import { APIKeyService, APIKeyValidationResult } from './APIKeyService.js';

/**
 * Authentication context for MCP requests
 */
export interface AuthContext {
    authenticated: boolean;
    user?: UserInfo;
    scopes?: string[];
    apiKeyId?: string;
    errorMessage?: string;
}

/**
 * Authentication middleware for MCP server
 *
 * Extracts API key from Authorization header, validates it, and returns authentication context.
 * Supports both Bearer token format and direct API key.
 */
export class AuthMiddleware {
    /**
     * Extract API key from Authorization header
     * Supports formats:
     * - "Bearer mj_sk_..."
     * - "mj_sk_..."
     *
     * @param authHeader - The Authorization header value
     * @returns Extracted API key or null
     */
    static ExtractAPIKey(authHeader?: string): string | null {
        if (!authHeader) {
            return null;
        }

        const trimmed = authHeader.trim();

        // Check for Bearer token format
        if (trimmed.toLowerCase().startsWith('bearer ')) {
            return trimmed.substring(7).trim();
        }

        // Direct API key format
        if (trimmed.startsWith('mj_sk_')) {
            return trimmed;
        }

        return null;
    }

    /**
     * Authenticate a request using API key
     *
     * @param authHeader - The Authorization header value
     * @param contextUser - Optional context user for database operations
     * @returns Authentication context with user and scopes if valid
     */
    static async Authenticate(
        authHeader?: string,
        contextUser?: UserInfo
    ): Promise<AuthContext> {
        // Extract API key from header
        const apiKey = this.ExtractAPIKey(authHeader);

        if (!apiKey) {
            return {
                authenticated: false,
                errorMessage: 'Missing or invalid Authorization header. Expected format: "Bearer mj_sk_..." or "mj_sk_..."'
            };
        }

        // Validate API key
        const validationResult = await APIKeyService.ValidateAPIKey(apiKey, contextUser);

        if (!validationResult.valid) {
            return {
                authenticated: false,
                errorMessage: validationResult.errorMessage || 'Invalid API key'
            };
        }

        return {
            authenticated: true,
            user: validationResult.userInfo,
            scopes: validationResult.scopes,
            apiKeyId: validationResult.keyId
        };
    }

    /**
     * Check if authentication context has a required scope
     *
     * @param authContext - Authentication context
     * @param requiredScope - The scope to check for (e.g., 'entities:read')
     * @returns True if authenticated and has scope
     */
    static HasScope(authContext: AuthContext, requiredScope: string): boolean {
        if (!authContext.authenticated || !authContext.scopes) {
            return false;
        }

        return APIKeyService.HasScope(authContext.scopes, requiredScope);
    }

    /**
     * Create an authorization error response
     *
     * @param message - Error message
     * @returns Standardized error response
     */
    static CreateAuthError(message: string): { error: string; statusCode: number } {
        return {
            error: message,
            statusCode: 401
        };
    }

    /**
     * Create a forbidden (insufficient permissions) error response
     *
     * @param requiredScope - The scope that was required
     * @returns Standardized error response
     */
    static CreateForbiddenError(requiredScope: string): { error: string; statusCode: number } {
        return {
            error: `Insufficient permissions. Required scope: ${requiredScope}`,
            statusCode: 403
        };
    }
}

/**
 * Decorator for requiring specific scopes on tool operations
 * This is a helper for tool implementations to check scopes
 */
export function RequireScope(scope: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            // First argument should be the authentication context
            const authContext = args[0] as AuthContext;

            if (!authContext || !authContext.authenticated) {
                throw new Error('Authentication required');
            }

            if (!AuthMiddleware.HasScope(authContext, scope)) {
                throw new Error(`Insufficient permissions. Required scope: ${scope}`);
            }

            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}
