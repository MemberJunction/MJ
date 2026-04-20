/**
 * @fileoverview JWT Issuer for OAuth Proxy
 *
 * Signs proxy JWTs using HS256 with a configured secret. These tokens provide
 * a consistent format regardless of which upstream provider authenticated the user.
 *
 * @module @memberjunction/ai-mcp-server/auth/JWTIssuer
 */

import jwt from 'jsonwebtoken';
import type { ProxyJWTClaims, SignProxyJWTOptions } from './types.js';

/**
 * Configuration for the JWT Issuer.
 */
export interface JWTIssuerConfig {
  /** HS256 signing secret (must be at least 32 bytes) */
  signingSecret: string;
  /** Token expiration time (e.g., '1h', '30m', '1d') */
  expiresIn: string;
  /** Issuer claim value */
  issuer: string;
  /** Audience claim value (usually the resourceIdentifier) */
  audience: string;
}

/**
 * Result of signing a JWT.
 */
export interface SignJWTResult {
  /** The signed JWT string */
  token: string;
  /** Expiration time as Date */
  expiresAt: Date;
  /** Expiration time in seconds from now */
  expiresIn: number;
}

/**
 * Creates a JWT Issuer for signing proxy tokens.
 *
 * @param config - JWT issuer configuration
 * @returns Object with sign and verify methods
 *
 * @example
 * ```typescript
 * const issuer = createJWTIssuer({
 *   signingSecret: process.env.MCP_JWT_SECRET!,
 *   expiresIn: '1h',
 *   issuer: 'urn:mj:mcp-server',
 *   audience: 'http://localhost:3100',
 * });
 *
 * const result = issuer.sign({
 *   email: 'user@example.com',
 *   mjUserId: 'uuid-here',
 *   scopes: ['entity:read'],
 *   upstreamProvider: 'azure-ad',
 *   upstreamSub: 'azure-user-id',
 * });
 * ```
 */
export function createJWTIssuer(config: JWTIssuerConfig) {
  const { signingSecret, expiresIn, issuer, audience } = config;

  /**
   * Signs a proxy JWT with the provided claims.
   */
  function sign(options: SignProxyJWTOptions): SignJWTResult {
    const now = Math.floor(Date.now() / 1000);
    const expiresInSeconds = parseExpiresIn(expiresIn);
    const exp = now + expiresInSeconds;

    const claims: ProxyJWTClaims = {
      iss: issuer,
      sub: options.email,
      aud: audience,
      iat: now,
      exp,
      email: options.email,
      mjUserId: options.mjUserId,
      scopes: options.scopes,
      upstreamProvider: options.upstreamProvider,
      upstreamSub: options.upstreamSub,
    };

    const token = jwt.sign(claims, signingSecret, {
      algorithm: 'HS256',
    });

    return {
      token,
      expiresAt: new Date(exp * 1000),
      expiresIn: expiresInSeconds,
    };
  }

  /**
   * Verifies a proxy JWT and returns the claims.
   *
   * @param token - The JWT to verify
   * @returns The decoded claims if valid
   * @throws Error if token is invalid, expired, or has wrong issuer/audience
   */
  function verify(token: string): ProxyJWTClaims {
    const decoded = jwt.verify(token, signingSecret, {
      algorithms: ['HS256'],
      issuer,
      audience,
    });

    return decoded as ProxyJWTClaims;
  }

  /**
   * Checks if a token is a proxy-issued JWT (has our issuer).
   * Does NOT validate the token - just checks the issuer claim.
   *
   * @param token - The JWT to check
   * @returns true if this is a proxy-issued token
   */
  function isProxyToken(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as { iss?: string } | null;
      return decoded?.iss === issuer;
    } catch {
      return false;
    }
  }

  return {
    sign,
    verify,
    isProxyToken,
    config: {
      issuer,
      audience,
      expiresIn,
    },
  };
}

/**
 * Parses an expiration string (e.g., '1h', '30m', '1d') to seconds.
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    // Default to 1 hour if invalid format
    console.warn(`[JWT Issuer] Invalid expiresIn format: ${expiresIn}, defaulting to 1h`);
    return 3600;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 3600;
  }
}

/**
 * Validates that a signing secret is strong enough.
 *
 * @param secret - The secret to validate
 * @returns Object with valid flag and error message if invalid
 */
export function validateSigningSecret(secret: string): {
  valid: boolean;
  error?: string;
} {
  if (!secret) {
    return { valid: false, error: 'JWT signing secret is required' };
  }

  // Try to decode as base64 to check actual length
  let secretBytes: Buffer;
  try {
    // Check if it's base64 encoded
    if (/^[A-Za-z0-9+/=]+$/.test(secret) && secret.length >= 32) {
      secretBytes = Buffer.from(secret, 'base64');
      // If decoded length is reasonable, it was likely base64
      if (secretBytes.length >= 24 && secretBytes.length < secret.length) {
        // It's base64 encoded
      } else {
        // Treat as raw string
        secretBytes = Buffer.from(secret, 'utf-8');
      }
    } else {
      secretBytes = Buffer.from(secret, 'utf-8');
    }
  } catch {
    secretBytes = Buffer.from(secret, 'utf-8');
  }

  if (secretBytes.length < 32) {
    return {
      valid: false,
      error: `JWT signing secret must be at least 32 bytes (256 bits), got ${secretBytes.length} bytes`,
    };
  }

  return { valid: true };
}

export type JWTIssuer = ReturnType<typeof createJWTIssuer>;
