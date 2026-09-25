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
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * The issuer URL for this provider (must match the 'iss' claim in tokens)
   */
  issuer: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * The expected audience for tokens from this provider
   */
  audience: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * The JWKS endpoint URL for retrieving signing keys
   */
  jwksUri: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * OAuth client ID for this provider (optional, used by OAuth proxy for upstream authentication)
   */
  clientId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * Provider domain, where the provider hosts its OAuth endpoints somewhere other than its
   * issuer (optional, used by the OAuth proxy). Cognito is the case that needs it: its issuer
   * is the user-pool URL, but /authorize and /token live on the hosted-UI domain.
   */
  domain?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * Validates that the provider configuration is complete and valid
   */
  validateConfig(): boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * Gets the signing key for token verification
   */
  getSigningKey(header: JwtHeader, callback: SigningKeyCallback): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * Extracts user information from the JWT payload
   * Different providers use different claim names
   */
  extractUserInfo(payload: JwtPayload): AuthUserInfo;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * Releases any resources (keep-alive HTTP agent, JWKS client) this provider instance holds.
   * Optional so implementations with nothing to release don't need a no-op override. Called by
   * {@link AuthProviderFactory} before an existing provider is replaced (`register()`) or the
   * registry is torn down (`clear()`), so a discarded provider's socket pool doesn't stay open
   * until its own idle timeout.
   */
  Dispose?(): void;

  /**
   * Checks if a given issuer URL belongs to this provider
   */
  matchesIssuer(issuer: string): boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}