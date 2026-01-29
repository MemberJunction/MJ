import { JwtHeader, JwtPayload, SigningKeyCallback } from 'jsonwebtoken';
import { AuthProviderConfig, AuthUserInfo } from '@memberjunction/core';

/**
 * Interface for authentication providers in MemberJunction
 * Enables support for any OAuth 2.0/OIDC compliant provider
 */
export interface IAuthProvider {
  /**
   * Unique name identifier for this provider
   */
  name: string;

  /**
   * The issuer URL for this provider (must match the 'iss' claim in tokens)
   */
  issuer: string;

  /**
   * The expected audience for tokens from this provider
   */
  audience: string;

  /**
   * The JWKS endpoint URL for retrieving signing keys
   */
  jwksUri: string;

  /**
   * OAuth client ID for this provider (optional, used by OAuth proxy for upstream authentication)
   */
  clientId?: string;

  /**
   * Validates that the provider configuration is complete and valid
   */
  validateConfig(): boolean;

  /**
   * Gets the signing key for token verification
   */
  getSigningKey(header: JwtHeader, callback: SigningKeyCallback): void;

  /**
   * Extracts user information from the JWT payload
   * Different providers use different claim names
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo;

  /**
   * Checks if a given issuer URL belongs to this provider
   */
  matchesIssuer(issuer: string): boolean;
}