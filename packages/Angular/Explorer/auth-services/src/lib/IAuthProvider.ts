import { Observable } from 'rxjs';
import { AuthProviderConfig } from '@memberjunction/core';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  TokenRefreshResult
} from './auth-types';

// Create an alias for Angular-specific config that extends the base
export interface AngularAuthProviderConfig extends AuthProviderConfig {
  // Angular-specific extensions can be added here if needed
}

/**
 * Interface for Angular authentication providers - v3.0.0
 *
 * This interface defines the contract that all auth providers must implement.
 * It ensures consistent behavior across different OAuth providers while hiding
 * provider-specific implementation details.
 *
 * ## Breaking Changes from v2.x:
 * - Removed: getUserProfile() - Use getUserInfo() instead
 * - Removed: getUser() - Use getUserInfo() instead
 * - Removed: getUserClaims() - Use getTokenInfo() instead
 * - Removed: getToken() - Use getIdToken() instead
 * - Removed: refresh() - Use refreshToken() instead
 * - Removed: checkExpiredTokenError() - Use classifyError() instead
 *
 * @version 3.0.0
 */
export interface IAngularAuthProvider {
  /**
   * Provider type identifier (e.g., 'msal', 'auth0', 'okta')
   */
  readonly type: string;

  // ============================================================================
  // CORE AUTHENTICATION METHODS
  // ============================================================================

  /**
   * Initialize the authentication provider
   *
   * This should handle callback processing, session restoration, etc.
   * Called automatically during app startup.
   */
  initialize(): Promise<void>;

  /**
   * Initiate login flow
   *
   * @param options Optional provider-specific login options
   * @returns Observable for backward compatibility, can also return Promise
   *
   * @example
   * ```typescript
   * await this.authBase.login({ appState: { target: '/dashboard' } });
   * ```
   */
  login(options?: Record<string, unknown>): Observable<void> | Promise<void>;

  /**
   * Log out the current user
   *
   * Clears local session and redirects to provider's logout endpoint.
   *
   * @example
   * ```typescript
   * await this.authBase.logout();
   * ```
   */
  logout(): Promise<void>;

  /**
   * Handle OAuth callback after redirect
   *
   * This is called automatically by the redirect component.
   * Application code typically doesn't need to call this directly.
   */
  handleCallback(): Promise<void>;

  // ============================================================================
  // AUTHENTICATION STATE (Observable Streams)
  // ============================================================================

  /**
   * Observable stream of authentication state
   *
   * Emits true when user is authenticated, false otherwise.
   * Subscribe to this for reactive UI updates.
   *
   * @example
   * ```typescript
   * this.authBase.isAuthenticated().subscribe(isAuth => {
   *   this.showLoginButton = !isAuth;
   * });
   * ```
   */
  isAuthenticated(): Observable<boolean>;

  /**
   * Observable stream of user profile information
   *
   * Emits StandardUserInfo when authenticated, null otherwise.
   * This replaces the old getUserProfile() which returned 'any'.
   *
   * @example
   * ```typescript
   * this.authBase.getUserInfo().subscribe(user => {
   *   if (user) {
   *     console.log(`Welcome ${user.name}!`);
   *   }
   * });
   * ```
   */
  getUserInfo(): Observable<StandardUserInfo | null>;

  /**
   * Observable stream of user's email address
   *
   * Emits email string when authenticated, empty string otherwise.
   *
   * @example
   * ```typescript
   * this.userEmail$ = this.authBase.getUserEmail();
   * ```
   */
  getUserEmail(): Observable<string>;

  // ============================================================================
  // TOKEN MANAGEMENT (v3.0.0 - Fixes Leaky Abstraction)
  // ============================================================================

  /**
   * Get the current ID token as a string
   *
   * This is the primary method applications should use to get the token
   * for backend API calls. It abstracts away provider-specific token storage
   * (Auth0's __raw vs MSAL's idToken).
   *
   * @returns Promise resolving to the ID token string, or null if not authenticated
   *
   * @example
   * ```typescript
   * const token = await this.authBase.getIdToken();
   * if (token) {
   *   // Use token for GraphQL or REST API calls
   *   setupGraphQLClient(token, apiUrl);
   * }
   * ```
   */
  getIdToken(): Promise<string | null>;

  /**
   * Get complete token information
   *
   * Returns a standardized token object with ID token, access token, and expiration.
   * Use this when you need more than just the token string.
   *
   * @returns Promise resolving to StandardAuthToken or null if not authenticated
   *
   * @example
   * ```typescript
   * const tokenInfo = await this.authBase.getTokenInfo();
   * if (tokenInfo) {
   *   console.log(`Token expires at: ${new Date(tokenInfo.expiresAt)}`);
   * }
   * ```
   */
  getTokenInfo(): Promise<StandardAuthToken | null>;

  /**
   * Refresh the current authentication token
   *
   * Attempts to obtain a fresh authentication token using the provider's
   * refresh mechanism. If silent refresh fails due to session expiry, the
   * provider will handle re-authentication automatically (which may involve
   * redirecting to the auth provider's login page).
   *
   * Returns a fresh token on success, or throws on complete failure.
   *
   * IMPORTANT: If the provider requires interactive re-authentication (redirect
   * or popup), this method may never return. The app will reload after
   * authentication completes and re-initialize with a fresh token.
   *
   * @returns Promise resolving to StandardAuthToken or throws on failure
   *
   * @example
   * ```typescript
   * const token = await this.authBase.refreshToken();
   * return token.idToken; // Always succeeds or throws
   * ```
   */
  refreshToken(): Promise<StandardAuthToken>;

  // ============================================================================
  // ERROR HANDLING (v3.0.0 - Fixes Error Type Leakage)
  // ============================================================================

  /**
   * Classify an error into a standard error type
   *
   * This method converts provider-specific errors into semantic error types
   * that application code can handle consistently. Eliminates the need for
   * consumers to check provider-specific error names like 'BrowserAuthError'.
   *
   * @param error The error to classify (can be any type)
   * @returns StandardAuthError with categorized error type
   *
   * @example
   * ```typescript
   * try {
   *   await this.authBase.login();
   * } catch (err) {
   *   const authError = this.authBase.classifyError(err);
   *
   *   switch (authError.type) {
   *     case AuthErrorType.TOKEN_EXPIRED:
   *       // Show "session expired" message
   *       break;
   *     case AuthErrorType.USER_CANCELLED:
   *       // User cancelled - don't show error
   *       break;
   *     default:
   *       // Show generic error
   *       alert(authError.userMessage);
   *   }
   * }
   * ```
   */
  classifyError(error: unknown): StandardAuthError;

  // ============================================================================
  // CONFIGURATION & VALIDATION
  // ============================================================================

  /**
   * Get list of required configuration fields for this provider
   *
   * @returns Array of required config field names
   *
   * @example
   * ```typescript
   * // Auth0 requires: ['clientId', 'domain']
   * // MSAL requires: ['clientId', 'tenantId']
   * ```
   */
  getRequiredConfig(): string[];

  /**
   * Validate provider configuration
   *
   * @param config Configuration object to validate
   * @returns True if configuration is valid
   */
  validateConfig(config: Record<string, unknown>): boolean;
}