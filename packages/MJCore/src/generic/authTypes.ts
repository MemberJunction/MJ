/**
 * Common authentication types shared between frontend and backend authentication systems
 * This file provides type definitions used by both JWT validation (backend) and OAuth flows (frontend)
 */

/**
 * Standard authentication provider types
 */
export const AUTH_PROVIDER_TYPES = {
  MSAL: 'msal',
  AUTH0: 'auth0',
  OKTA: 'okta',
  COGNITO: 'cognito',
  GOOGLE: 'google',
  WORKOS: 'workos',
  CUSTOM: 'custom'
} as const;

/**
 * Type for authentication provider identifiers
 */
export type AuthProviderType = typeof AUTH_PROVIDER_TYPES[keyof typeof AUTH_PROVIDER_TYPES];

/**
 * Base configuration for authentication providers
 * Used by both backend (JWT validation) and frontend (OAuth flows)
 */
export interface AuthProviderConfig {
  /**
   * Unique name identifier for this provider instance
   */
  name: string;
  
  /**
   * Type of authentication provider (e.g., 'msal', 'auth0', 'okta')
   */
  type: AuthProviderType | string;
  
  /**
   * OAuth client ID
   */
  clientId?: string;
  
  /**
   * OAuth client secret (backend only, never expose to frontend)
   */
  clientSecret?: string;
  
  /**
   * Provider domain (e.g., 'your-domain.auth0.com')
   */
  domain?: string;
  
  /**
   * Tenant ID for multi-tenant providers (e.g., Azure AD)
   */
  tenantId?: string;
  
  /**
   * Token issuer URL (must match 'iss' claim in JWT)
   */
  issuer?: string;
  
  /**
   * Expected audience for tokens
   */
  audience?: string;
  
  /**
   * JWKS endpoint URL for retrieving signing keys
   */
  jwksUri?: string;
  
  /**
   * OAuth redirect URI for callback after authentication
   */
  redirectUri?: string;
  
  /**
   * OAuth scopes to request
   */
  scopes?: string[];
  
  /**
   * Authority URL for providers that use it (e.g., MSAL)
   */
  authority?: string;
  
  /**
   * Allow provider-specific configuration fields
   */
  [key: string]: any;
}

/**
 * Flat key/value configuration handed to a BROWSER auth driver.
 *
 * Deliberately flat and primitive-valued: every value here is published in the
 * unauthenticated pre-auth provider catalog, so the shape doubles as a reminder
 * that nothing structured or sensitive belongs in it. Nested objects would make
 * it easy to smuggle a credential blob into a "config" field.
 */
export type PublicAuthProviderClientConfig = Record<string, string | number | boolean | null>;

/**
 * The PUBLIC description of one authentication provider, as published by the
 * server's unauthenticated catalog endpoint (`GET /auth/providers`) and consumed
 * by the browser before any user is signed in.
 *
 * This type is the trust boundary made explicit. It contains ONLY fields that are
 * safe for an anonymous caller to read — the same values a single-provider SPA
 * already had compiled into its `environment.ts`. It intentionally has no `ID`,
 * no `credentialID`, and no server-side configuration, so a provider row cannot
 * leak secret material by being published.
 *
 * @see AuthProviderConfig for the richer SERVER-side config used to validate tokens.
 */
export interface PublicAuthProviderInfo {
  /**
   * Unique provider name — matches the name the server registered with
   * `AuthProviderFactory`, and is what the browser persists when a user picks
   * a provider from the login picker.
   */
  name: string;

  /**
   * ClassFactory resolution key. The browser resolves its `MJAuthBase` subclass
   * from this key exactly as the server resolves its `BaseAuthProvider` subclass,
   * so a driver ships as a server/browser pair under one name.
   */
  driverClass: string;

  /**
   * Label for the login button (rendered as "Continue with {displayName}").
   * The server falls back to `name` when the row has no DisplayName.
   */
  displayName: string;

  /** Font Awesome class or known brand-logo key for the button's icon chip. */
  icon?: string;

  /** Ascending sort order within the picker. */
  sequence: number;

  /** True when this provider is pre-highlighted, and used directly when it is the only one. */
  isDefault: boolean;

  /** Public OAuth client ID. */
  clientId?: string;

  /** Expected token issuer. */
  issuer?: string;

  /** Provider domain (e.g. an Auth0/Okta tenant domain). */
  domain?: string;

  /** Space-delimited OAuth scopes to request. */
  scopes?: string;

  /** Driver-specific browser settings (redirect URI, API hostname, region, ...). */
  clientConfiguration?: PublicAuthProviderClientConfig;
}

/**
 * Response body of the unauthenticated `GET /auth/providers` catalog endpoint.
 */
export interface PublicAuthProviderCatalog {
  /** Active, client-visible providers, already sorted by `sequence` then `displayName`. */
  providers: PublicAuthProviderInfo[];
}

/**
 * User information extracted from authentication tokens or user profiles
 */
export interface AuthUserInfo {
  /**
   * User's email address
   */
  email?: string;
  
  /**
   * User's first name
   */
  firstName?: string;
  
  /**
   * User's last name
   */
  lastName?: string;
  
  /**
   * User's full display name
   */
  fullName?: string;
  
  /**
   * Preferred username or handle
   */
  preferredUsername?: string;
  
  /**
   * Unique user identifier from the auth provider
   */
  userId?: string;
  
  /**
   * User's roles or groups
   */
  roles?: string[];
  
  /**
   * Additional provider-specific claims
   */
  [key: string]: any;
}

/**
 * Token information structure
 */
export interface AuthTokenInfo {
  /**
   * OAuth access token for API calls
   */
  accessToken?: string;
  
  /**
   * ID token containing user claims
   */
  idToken?: string;
  
  /**
   * Refresh token for obtaining new access tokens
   */
  refreshToken?: string;
  
  /**
   * Token expiration time
   */
  expiresAt?: Date;
  
  /**
   * Token type (usually 'Bearer')
   */
  tokenType?: string;
}

/**
 * JWT payload structure based on standard OIDC claims
 */
export interface AuthJwtPayload {
  /**
   * Subject - unique identifier for the user
   */
  sub?: string;
  
  /**
   * Email address
   */
  email?: string;
  
  /**
   * Given/first name
   */
  given_name?: string;
  
  /**
   * Family/last name
   */
  family_name?: string;
  
  /**
   * Full name
   */
  name?: string;
  
  /**
   * Preferred username
   */
  preferred_username?: string;
  
  /**
   * Token issuer
   */
  iss?: string;
  
  /**
   * Token audience
   */
  aud?: string | string[];
  
  /**
   * Expiration time (seconds since epoch)
   */
  exp?: number;
  
  /**
   * Issued at time (seconds since epoch)
   */
  iat?: number;
  
  /**
   * Not before time (seconds since epoch)
   */
  nbf?: number;
  
  /**
   * Additional claims
   */
  [key: string]: any;
}