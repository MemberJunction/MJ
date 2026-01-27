/**
 * @fileoverview OAuth Bearer token validation for MCP Server.
 *
 * Validates OAuth tokens using MJServer's auth provider infrastructure,
 * which supports Auth0, MSAL, Okta, Cognito, and Google providers.
 *
 * Token validation includes:
 * - Signature verification using JWKS
 * - Expiration check
 * - Audience validation against resource identifier
 * - Issuer validation against configured providers
 * - User mapping to MemberJunction User entity
 *
 * @module @memberjunction/ai-mcp-server/auth/TokenValidator
 */

import jwt from 'jsonwebtoken';
import type { JwtPayload, JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import type { UserInfo } from '@memberjunction/core';
import type { OAuthValidationResult, OAuthErrorCode } from './types.js';

// Type definitions for dynamically imported MJServer auth functions
type GetSigningKeysFn = (issuer: string) => (header: JwtHeader, cb: SigningKeyCallback) => void;
type ExtractUserInfoFn = (payload: JwtPayload) => {
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  preferredUsername?: string;
};
type VerifyUserRecordFn = (
  email?: string,
  firstName?: string,
  lastName?: string,
  requestDomain?: string,
  dataSource?: unknown,
  attemptCacheUpdateIfNeeded?: boolean
) => Promise<UserInfo | undefined>;
interface AuthProviderFactoryType {
  getInstance(): {
    getByIssuer(issuer: string): { issuer: string } | undefined;
    hasProviders(): boolean;
    getAllProviders(): Array<{ name: string; issuer: string }>;
  };
}

// Dynamic imports to avoid initialization order issues with dotenv
let getSigningKeys: GetSigningKeysFn;
let extractUserInfoFromPayload: ExtractUserInfoFn;
let verifyUserRecord: VerifyUserRecordFn;
let AuthProviderFactory: AuthProviderFactoryType;

let mjServerImported = false;

/**
 * Ensures MJServer auth functions are imported.
 * Uses dynamic import to ensure proper initialization order.
 */
async function ensureMJServerImported(): Promise<void> {
  if (mjServerImported) return;

  const authModule = await import('@memberjunction/server');
  getSigningKeys = authModule.getSigningKeys as GetSigningKeysFn;
  extractUserInfoFromPayload = authModule.extractUserInfoFromPayload as ExtractUserInfoFn;
  verifyUserRecord = authModule.verifyUserRecord as VerifyUserRecordFn;
  AuthProviderFactory = authModule.AuthProviderFactory as unknown as AuthProviderFactoryType;
  mjServerImported = true;
}

/**
 * Creates a validation error result.
 */
function createError(code: OAuthErrorCode, message: string): OAuthValidationResult {
  return {
    valid: false,
    error: { code, message },
  };
}

/**
 * Checks if a token is expired before full validation.
 * This is a fast-fail check to avoid unnecessary JWKS calls.
 *
 * @param token - The JWT token to check
 * @returns true if the token is expired, false otherwise
 */
function isTokenExpired(token: string): { expired: boolean; exp?: number } {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded.payload === 'string') {
      return { expired: false }; // Can't determine, let full validation handle it
    }

    const exp = decoded.payload.exp;
    if (typeof exp !== 'number') {
      return { expired: false }; // No exp claim
    }

    const now = Math.floor(Date.now() / 1000);
    return { expired: exp < now, exp };
  } catch {
    return { expired: false };
  }
}

/**
 * Validates an OAuth Bearer token and extracts user information.
 *
 * Validation steps:
 * 1. Fast expiration check (before JWKS call)
 * 2. Decode token to get issuer
 * 3. Verify issuer matches a configured provider
 * 4. Verify signature using JWKS
 * 5. Validate audience includes resource identifier
 * 6. Extract user info from claims
 *
 * @param token - The Bearer token (without "Bearer " prefix)
 * @param resourceIdentifier - The expected audience (resource identifier)
 * @returns Validation result with payload and user info if valid
 */
export async function validateBearerToken(
  token: string,
  resourceIdentifier: string
): Promise<OAuthValidationResult> {
  await ensureMJServerImported();

  // 1. Fast expiration check
  const expirationCheck = isTokenExpired(token);
  if (expirationCheck.expired) {
    return createError('expired_token', 'Token has expired');
  }

  // 2. Decode without verification to get issuer
  let decoded: jwt.Jwt | null;
  try {
    decoded = jwt.decode(token, { complete: true });
  } catch {
    return createError('invalid_token', 'Invalid token format');
  }

  if (!decoded || typeof decoded.payload === 'string') {
    return createError('invalid_token', 'Invalid token format');
  }

  const payload = decoded.payload as JwtPayload;
  const issuer = payload.iss;

  if (!issuer) {
    return createError('invalid_token', 'Token missing issuer claim');
  }

  // 3. Verify issuer matches a configured provider
  const factory = AuthProviderFactory.getInstance();
  const provider = factory.getByIssuer(issuer);
  if (!provider) {
    return createError('unknown_issuer', `Unknown token issuer: ${issuer}`);
  }

  // 4. Verify signature using JWKS
  let verifiedPayload: JwtPayload;
  try {
    verifiedPayload = await verifyTokenSignature(token, issuer, resourceIdentifier);
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      return createError('expired_token', 'Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      // Check for audience mismatch
      if (error.message.includes('audience')) {
        return createError('invalid_audience', `Token not issued for this resource: ${resourceIdentifier}`);
      }
      return createError('invalid_token', error.message);
    }
    // Network/JWKS errors
    if (isNetworkError(error)) {
      return createError('provider_unavailable', 'Unable to reach authorization server');
    }
    return createError('invalid_token', error instanceof Error ? error.message : 'Token validation failed');
  }

  // 5. Extract user info from claims
  const userInfo = extractUserInfoFromPayload(verifiedPayload);

  return {
    valid: true,
    payload: verifiedPayload,
    userInfo,
  };
}

/**
 * Verifies the token signature using JWKS from the provider.
 */
async function verifyTokenSignature(
  token: string,
  issuer: string,
  audience: string
): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getSigningKeys(issuer),
      {
        issuer,
        audience,
        clockTolerance: 30, // Allow 30 seconds of clock skew
      },
      (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded as JwtPayload);
        }
      }
    );
  });
}

/**
 * Checks if an error is a network-related error.
 */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const networkErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'];
  const message = error.message.toLowerCase();

  return (
    networkErrorCodes.some(code => message.includes(code.toLowerCase())) ||
    message.includes('socket hang up') ||
    message.includes('network')
  );
}

/**
 * Resolves an OAuth user to a MemberJunction User entity.
 *
 * Looks up the user by email in the MemberJunction database.
 * If the user is not found or inactive, returns an error.
 *
 * @param userInfo - User information extracted from token claims
 * @returns The MemberJunction UserInfo if found and active
 */
export async function resolveOAuthUser(
  userInfo: { email?: string; firstName?: string; lastName?: string }
): Promise<{ user?: UserInfo; error?: { code: OAuthErrorCode; message: string } }> {
  await ensureMJServerImported();

  if (!userInfo.email) {
    return {
      error: {
        code: 'invalid_token',
        message: 'Token missing email claim - cannot identify user',
      },
    };
  }

  try {
    const user = await verifyUserRecord(
      userInfo.email,
      userInfo.firstName,
      userInfo.lastName,
      undefined, // requestDomain - not needed for MCP
      undefined, // dataSource - uses default
      true // attemptCacheUpdateIfNeeded
    );

    if (!user) {
      return {
        error: {
          code: 'user_not_found',
          message: `User not found in MemberJunction: ${userInfo.email}`,
        },
      };
    }

    if (!user.IsActive) {
      return {
        error: {
          code: 'user_inactive',
          message: `User account is inactive: ${userInfo.email}`,
        },
      };
    }

    return { user };
  } catch (error) {
    console.error('[TokenValidator] Error resolving user:', error);
    return {
      error: {
        code: 'user_not_found',
        message: `Failed to resolve user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    };
  }
}

/**
 * Checks if auth providers are configured.
 *
 * @returns true if at least one auth provider is configured
 */
export async function hasAuthProviders(): Promise<boolean> {
  await ensureMJServerImported();
  return AuthProviderFactory.getInstance().hasProviders();
}
