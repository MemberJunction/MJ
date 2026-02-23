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
import jwksClient from 'jwks-rsa';
import type { UserInfo } from '@memberjunction/core';
import type { OAuthValidationResult, OAuthErrorCode, ProxyJWTClaims } from './types.js';

/**
 * Configuration for proxy token validation.
 * Set via setProxyTokenConfig() when OAuth proxy JWT signing is enabled.
 */
interface ProxyTokenConfig {
  signingSecret: string;
  issuer: string;
  audience: string;
}

let proxyTokenConfig: ProxyTokenConfig | undefined;

/**
 * Configures the proxy token validation settings.
 * Called by Server.ts when OAuth proxy with JWT signing is enabled.
 *
 * @param config - Proxy token configuration
 */
export function setProxyTokenConfig(config: ProxyTokenConfig): void {
  proxyTokenConfig = config;
  console.log(`[TokenValidator] Proxy token validation configured (issuer: ${config.issuer})`);
}

/**
 * Clears the proxy token configuration (for testing).
 */
export function clearProxyTokenConfig(): void {
  proxyTokenConfig = undefined;
}

/**
 * Checks if a token appears to be a proxy-issued JWT.
 * Does NOT validate the token - just checks the issuer claim.
 *
 * @param token - The JWT to check
 * @returns true if this appears to be a proxy-issued token
 */
export function isProxyToken(token: string): boolean {
  if (!proxyTokenConfig) {
    return false;
  }
  try {
    const decoded = jwt.decode(token) as { iss?: string } | null;
    return decoded?.iss === proxyTokenConfig.issuer;
  } catch {
    return false;
  }
}

/**
 * Validates a proxy-issued JWT token.
 *
 * @param token - The proxy JWT to validate
 * @returns Validation result with payload and user info if valid
 */
export async function validateProxyToken(token: string): Promise<OAuthValidationResult> {
  if (!proxyTokenConfig) {
    return createError('invalid_token', 'Proxy token validation not configured');
  }

  try {
    const payload = jwt.verify(token, proxyTokenConfig.signingSecret, {
      algorithms: ['HS256'],
      issuer: proxyTokenConfig.issuer,
      audience: proxyTokenConfig.audience,
    }) as ProxyJWTClaims;

    // Extract user info from proxy claims
    const userInfo = {
      email: payload.email,
      firstName: undefined,
      lastName: undefined,
      fullName: undefined,
      preferredUsername: payload.email,
    };

    return {
      valid: true,
      payload: payload as unknown as JwtPayload,
      userInfo,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return createError('expired_token', 'Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      if (error.message.includes('audience')) {
        return createError('invalid_audience', 'Token not issued for this resource');
      }
      return createError('invalid_token', error.message);
    }
    return createError('invalid_token', error instanceof Error ? error.message : 'Token validation failed');
  }
}

// Cache for Azure AD v1 JWKS clients (by tenant ID)
const azureAdV1JwksClients: Map<string, jwksClient.JwksClient> = new Map();

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
  Instance: {
    getByIssuer(issuer: string): { issuer: string; audience: string } | undefined;
    hasProviders(): boolean;
    getAllProviders(): Array<{ name: string; issuer: string; audience: string }>;
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
 * Extracts Azure AD tenant ID from an issuer URL.
 * Supports both v1 and v2 issuer formats:
 * - v1: https://sts.windows.net/{tenant}/
 * - v2: https://login.microsoftonline.com/{tenant}/v2.0
 */
function extractAzureAdTenantId(issuer: string): string | null {
  // v1 format: https://sts.windows.net/{tenant}/
  const v1Match = issuer.match(/^https:\/\/sts\.windows\.net\/([a-f0-9-]+)\/?$/i);
  if (v1Match) {
    return v1Match[1];
  }

  // v2 format: https://login.microsoftonline.com/{tenant}/v2.0
  const v2Match = issuer.match(/^https:\/\/login\.microsoftonline\.com\/([a-f0-9-]+)\/v2\.0\/?$/i);
  if (v2Match) {
    return v2Match[1];
  }

  return null;
}

/**
 * Gets all possible Azure AD issuer variants for a given issuer.
 * This handles the case where tokens might use v1 issuer but
 * the auth provider is configured with v2 issuer, or vice versa.
 */
function getAzureAdIssuerVariants(issuer: string): string[] {
  const tenantId = extractAzureAdTenantId(issuer);
  if (!tenantId) {
    return [issuer]; // Not an Azure AD issuer, return as-is
  }

  // Return both v1 and v2 formats
  return [
    `https://sts.windows.net/${tenantId}/`,
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
  ];
}

/**
 * Checks if an issuer is an Azure AD v1 issuer.
 */
function isAzureAdV1Issuer(issuer: string): boolean {
  return issuer.startsWith('https://sts.windows.net/');
}

/**
 * Gets or creates a JWKS client for Azure AD v1 tokens.
 * Azure AD v1 tokens need to be verified using the v1 JWKS endpoint.
 */
function getAzureAdV1JwksClient(tenantId: string): jwksClient.JwksClient {
  let client = azureAdV1JwksClients.get(tenantId);
  if (!client) {
    // Azure AD v1 JWKS endpoint
    const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/keys`;
    client = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
      timeout: 30000,
    });
    azureAdV1JwksClients.set(tenantId, client);
  }
  return client;
}

/**
 * Gets signing keys for Azure AD v1 tokens directly (bypassing MJServer).
 */
function getAzureAdV1SigningKeys(tenantId: string): (header: JwtHeader, cb: SigningKeyCallback) => void {
  const client = getAzureAdV1JwksClient(tenantId);
  return (header: JwtHeader, cb: SigningKeyCallback) => {
    client.getSigningKey(header.kid)
      .then((key) => {
        const signingKey = 'publicKey' in key ? key.publicKey : key.rsaPublicKey;
        cb(null, signingKey);
      })
      .catch((err) => {
        console.error(`[TokenValidator] Error getting signing key for kid ${header.kid}:`, err);
        cb(err);
      });
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
 * Supports both:
 * - Proxy-signed JWTs (HS256, issuer "urn:mj:mcp-server")
 * - Upstream provider tokens (RS256/ES256, various issuers)
 *
 * Audience validation uses the same approach as MJExplorer - the expected
 * audience is derived from the auth provider's configuration, which is
 * auto-populated from environment variables (WEB_CLIENT_ID for Azure AD).
 *
 * Validation steps:
 * 1. Check if this is a proxy-issued token (fast path)
 * 2. Fast expiration check (before JWKS call)
 * 3. Decode token to get issuer
 * 4. Verify issuer matches a configured provider
 * 5. Verify signature using JWKS
 * 6. Validate audience against provider's configured audience
 * 7. Extract user info from claims
 *
 * @param token - The Bearer token (without "Bearer " prefix)
 * @returns Validation result with payload and user info if valid
 */
export async function validateBearerToken(token: string): Promise<OAuthValidationResult> {
  // Check if this is a proxy-issued token (fast path)
  if (isProxyToken(token)) {
    return validateProxyToken(token);
  }

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

  // 3. Verify issuer matches a configured provider and get audience
  // For Azure AD, try both v1 and v2 issuer formats since the token might
  // use a different format than what the provider is configured with
  const factory = AuthProviderFactory.Instance;
  const issuerVariants = getAzureAdIssuerVariants(issuer);
  let provider: { issuer: string; audience: string } | undefined;

  for (const variant of issuerVariants) {
    provider = factory.getByIssuer(variant);
    if (provider) {
      break;
    }
  }

  if (!provider) {
    return createError('unknown_issuer', `Unknown token issuer: ${issuer}`);
  }

  // Check if we matched via a variant (Azure AD v1/v2 normalization)
  const matchedViaVariant = issuer !== provider.issuer;

  // Check if this is an Azure AD v1 token that needs special handling
  const isV1Token = isAzureAdV1Issuer(issuer);
  const v1TenantId = isV1Token ? extractAzureAdTenantId(issuer) : null;

  // Use provider's audience - same as MJExplorer
  // For Azure AD: this is WEB_CLIENT_ID from environment
  const expectedAudience = provider.audience;

  // 4. Verify signature using JWKS and validate audience
  // For Azure AD v1 tokens: use v1 JWKS endpoint directly
  // For other tokens: use MJServer's provider lookup
  let verifiedPayload: JwtPayload;
  try {
    if (isV1Token && v1TenantId) {
      // Azure AD v1 token - use v1 JWKS endpoint directly
      verifiedPayload = await verifyTokenSignatureWithKeys(
        token,
        getAzureAdV1SigningKeys(v1TenantId),
        expectedAudience
      );
    } else {
      // Standard token - use MJServer provider lookup
      verifiedPayload = await verifyTokenSignature(token, provider.issuer, expectedAudience, matchedViaVariant);
    }
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      return createError('expired_token', 'Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      // Check for audience mismatch
      if (error.message.includes('audience')) {
        return createError('invalid_audience', `Token not issued for this resource: ${expectedAudience}`);
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
 *
 * @param token - The JWT token
 * @param providerIssuer - The provider's issuer (used for JWKS lookup via MJServer)
 * @param audience - Expected audience
 * @param skipIssuerValidation - Skip issuer validation (when we've already validated via variants)
 */
async function verifyTokenSignature(
  token: string,
  providerIssuer: string,
  audience: string,
  skipIssuerValidation: boolean = false
): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    const verifyOptions: jwt.VerifyOptions = {
      audience,
      clockTolerance: 30, // Allow 30 seconds of clock skew
    };

    // Only validate issuer if we haven't already done variant matching
    // When matching via variant, the token's issuer differs from provider's issuer
    if (!skipIssuerValidation) {
      verifyOptions.issuer = providerIssuer;
    }

    jwt.verify(
      token,
      getSigningKeys(providerIssuer),
      verifyOptions,
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
 * Verifies the token signature using a provided signing key function.
 * Used for Azure AD v1 tokens that need to be verified with the v1 JWKS endpoint.
 *
 * @param token - The JWT token
 * @param getKey - Function to get signing keys
 * @param audience - Expected audience
 */
async function verifyTokenSignatureWithKeys(
  token: string,
  getKey: (header: JwtHeader, cb: SigningKeyCallback) => void,
  audience: string
): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    const verifyOptions: jwt.VerifyOptions = {
      audience,
      clockTolerance: 30, // Allow 30 seconds of clock skew
      // Don't validate issuer - we've already matched it
    };

    jwt.verify(
      token,
      getKey,
      verifyOptions,
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
  return AuthProviderFactory.Instance.hasProviders();
}
