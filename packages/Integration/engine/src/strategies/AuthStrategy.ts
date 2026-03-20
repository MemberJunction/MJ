/**
 * Strategy interfaces for API authentication.
 * Each connector declares its auth strategy; the engine calls
 * Authenticate() once per sync and passes the context to all requests.
 */

import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

/** Supported authentication types */
export type AuthType = 'Bearer' | 'Session' | 'OAuth2' | 'APIKey' | 'JWT' | 'Custom';

/** Authentication context returned by Authenticate(). Extended by concrete strategies. */
export interface AuthContext {
    /** Bearer or session token */
    Token?: string;
    /** Session ID for session-based APIs */
    SessionID?: string;
    /** When the auth token expires */
    ExpiresAt?: Date;
    /** Allow strategy-specific auth properties */
    [key: string]: unknown;
}

/** An authentication strategy implementation */
export interface AuthStrategy {
    /** The authentication type */
    Type: AuthType;
    /**
     * Authenticate with the external system.
     * @param companyIntegration - connection details and credentials
     * @param contextUser - the user initiating the sync
     * @returns auth context to pass to subsequent requests
     */
    Authenticate(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<AuthContext>;
    /**
     * Build HTTP headers including auth credentials.
     * @param auth - the auth context from Authenticate()
     * @returns headers to include in API requests
     */
    BuildHeaders(auth: AuthContext): Record<string, string>;
    /**
     * Check whether the auth context has expired.
     * @param auth - the auth context to check
     * @returns true if expired and needs refresh
     */
    IsExpired(auth: AuthContext): boolean;
    /**
     * Refresh an expired auth context.
     * @param auth - the expired auth context
     * @param companyIntegration - connection details for re-auth
     * @returns refreshed auth context
     */
    Refresh(auth: AuthContext, companyIntegration: MJCompanyIntegrationEntity): Promise<AuthContext>;
}
