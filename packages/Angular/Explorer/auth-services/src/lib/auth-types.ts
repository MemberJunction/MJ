/**
 * Standardized authentication types for v3.0.0
 *
 * These types ensure consistent interfaces across all auth providers,
 * eliminating leaky abstractions where consumers needed to know about
 * provider-specific token storage (__raw vs idToken) or claim structures.
 *
 * @module @memberjunction/ng-auth-services
 * @version 3.0.0
 */

/**
 * Standardized user information returned by all auth providers
 *
 * Maps provider-specific claims to a consistent structure.
 * Each provider implements extractUserInfoInternal() to convert their
 * claim format to this standard structure.
 *
 * @example
 * ```typescript
 * const userInfo = await firstValueFrom(this.authBase.getUserInfo());
 * console.log(`Welcome ${userInfo.name}!`);
 * console.log(`Email: ${userInfo.email}`);
 * ```
 */
export interface StandardUserInfo {
  /**
   * Unique user identifier from the auth provider
   * (e.g., Auth0: user.sub, MSAL: account.localAccountId)
   */
  id: string;

  /**
   * User's email address
   */
  email: string;

  /**
   * User's full display name
   */
  name: string;

  /**
   * User's given name / first name
   */
  givenName?: string;

  /**
   * User's family name / last name
   */
  familyName?: string;

  /**
   * Preferred username or handle
   * Often the same as email for most providers
   */
  preferredUsername?: string;

  /**
   * URL to user's profile picture (if available)
   */
  pictureUrl?: string;

  /**
   * User's locale/language preference
   * (e.g., "en-US", "fr-FR")
   */
  locale?: string;

  /**
   * Email verification status
   * True if the auth provider has verified the user's email
   */
  emailVerified?: boolean;
}

/**
 * Standardized token information returned by all auth providers
 *
 * Provides access to tokens without exposing provider-specific claim structures.
 * Each provider implements extractTokenInfoInternal() to extract tokens from
 * their specific storage format.
 *
 * @example
 * ```typescript
 * const tokenInfo = await this.authBase.getTokenInfo();
 * console.log(`Token expires at: ${new Date(tokenInfo.expiresAt)}`);
 * ```
 */
export interface StandardAuthToken {
  /**
   * The ID token as a JWT string
   *
   * This is what should be sent to the backend GraphQL API in the
   * Authorization header as "Bearer {idToken}"
   */
  idToken: string;

  /**
   * Access token for calling APIs (if different from ID token)
   *
   * Some providers (like Auth0) use the same token for both authentication
   * and API access. Others (like MSAL) provide separate tokens.
   */
  accessToken?: string;

  /**
   * Token expiration timestamp (milliseconds since epoch)
   *
   * Use this to determine if the token needs to be refreshed.
   *
   * @example
   * ```typescript
   * const isExpired = Date.now() >= tokenInfo.expiresAt;
   * if (isExpired) {
   *   await this.authBase.refreshToken();
   * }
   * ```
   */
  expiresAt: number;

  /**
   * OAuth scopes granted with this token
   *
   * @example ["openid", "profile", "email", "User.Read"]
   */
  scopes?: string[];
}

/**
 * Standardized authentication error types
 *
 * Abstracts provider-specific error names (like "BrowserAuthError",
 * "InteractionRequiredAuthError") into semantic categories that
 * application code can handle consistently.
 *
 * This eliminates the need for consumers to check provider-specific
 * error properties like `err.name === 'BrowserAuthError'`.
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
 *       this.showMessage('Session expired. Please log in again.');
 *       break;
 *     case AuthErrorType.USER_CANCELLED:
 *       // User cancelled - don't show error
 *       break;
 *     default:
 *       this.showError(authError.userMessage);
 *   }
 * }
 * ```
 */
export enum AuthErrorType {
  /**
   * Token has expired - user needs to refresh or re-authenticate
   *
   * Mapped from:
   * - Auth0: "jwt expired", "token expired"
   * - MSAL: InteractionRequiredAuthError (when token expired)
   * - Okta: "token_expired"
   */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  /**
   * No active user session found - user needs to log in
   *
   * Mapped from:
   * - Auth0: "login_required", "no active session"
   * - MSAL: BrowserAuthError (no accounts)
   * - Okta: "login_required"
   */
  NO_ACTIVE_SESSION = 'NO_ACTIVE_SESSION',

  /**
   * User interaction required (e.g., consent, MFA)
   *
   * Mapped from:
   * - Auth0: "consent_required", "interaction_required"
   * - MSAL: InteractionRequiredAuthError
   * - Okta: "consent_required"
   */
  INTERACTION_REQUIRED = 'INTERACTION_REQUIRED',

  /**
   * User cancelled the authentication flow
   *
   * Typically doesn't require showing an error message to the user,
   * as the cancellation was intentional.
   */
  USER_CANCELLED = 'USER_CANCELLED',

  /**
   * Network error communicating with auth provider
   *
   * Could be DNS failure, timeout, or other connectivity issues.
   */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /**
   * Invalid configuration or setup error
   *
   * Usually indicates a problem with the auth provider configuration
   * (wrong client ID, invalid redirect URI, etc.)
   */
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

  /**
   * Generic/unknown error
   *
   * Used when the error doesn't fit into any other category.
   * The error message and originalError should provide more details.
   */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Standardized auth error with categorization
 *
 * Provides both machine-readable error types and human-readable messages.
 * Each provider implements classifyErrorInternal() to map their specific
 * errors to this standard format.
 *
 * @example
 * ```typescript
 * const authError = this.authBase.classifyError(err);
 *
 * // Log for debugging
 * console.error(`Auth error (${authError.type}):`, authError.message);
 *
 * // Show to user
 * this.showErrorMessage(authError.userMessage || authError.message);
 *
 * // Access original error for detailed debugging
 * if (environment.debug) {
 *   console.error('Original error:', authError.originalError);
 * }
 * ```
 */
export interface StandardAuthError {
  /**
   * Semantic error type for programmatic handling
   *
   * Use this in switch statements or if conditions to handle
   * different error scenarios appropriately.
   */
  type: AuthErrorType;

  /**
   * Technical error message
   *
   * Suitable for logging and debugging. May contain technical details
   * not appropriate for end users.
   */
  message: string;

  /**
   * Original error from the provider (for debugging)
   *
   * Preserved for detailed error analysis and debugging.
   * Can be any type (Error, object, string, etc.)
   */
  originalError?: unknown;

  /**
   * User-friendly error message
   *
   * A message suitable for displaying to end users.
   * Explains the error in plain language and may suggest next steps.
   *
   * @example "Your session has expired. Please log in again."
   */
  userMessage?: string;
}

/**
 * Token refresh result
 *
 * Returned by refreshToken() to indicate success or failure.
 * Consumers should check the success property before accessing the token.
 *
 * @example
 * ```typescript
 * const result = await this.authBase.refreshToken();
 *
 * if (result.success && result.token) {
 *   // Use the refreshed token
 *   const newIdToken = result.token.idToken;
 *   await this.updateGraphQLClient(newIdToken);
 * } else {
 *   // Handle refresh failure
 *   console.error('Token refresh failed:', result.error?.message);
 *
 *   if (result.error?.type === AuthErrorType.TOKEN_EXPIRED) {
 *     // Token is expired and can't be refreshed - need re-login
 *     await this.authBase.login();
 *   }
 * }
 * ```
 */
export interface TokenRefreshResult {
  /**
   * Whether the refresh was successful
   *
   * If true, the token property will contain the new token.
   * If false, the error property will explain why.
   */
  success: boolean;

  /**
   * New token if refresh succeeded
   *
   * Only present when success is true.
   */
  token?: StandardAuthToken;

  /**
   * Error if refresh failed
   *
   * Only present when success is false.
   * Contains details about why the refresh failed.
   */
  error?: StandardAuthError;
}

/**
 * Authentication state snapshot
 *
 * Represents the current authentication state of the application.
 * This is useful for components that need to react to auth state changes.
 *
 * @example
 * ```typescript
 * // Subscribe to complete auth state
 * this.authState$ = this.authBase.getAuthState();
 *
 * this.authState$.subscribe(state => {
 *   if (state.isLoading) {
 *     this.showLoadingSpinner();
 *   } else if (state.isAuthenticated && state.user) {
 *     this.showWelcomeMessage(state.user.name);
 *   } else if (state.error) {
 *     this.showError(state.error.userMessage);
 *   }
 * });
 * ```
 */
export interface AuthState {
  /**
   * Whether user is currently authenticated
   */
  isAuthenticated: boolean;

  /**
   * Current user info (if authenticated)
   *
   * Undefined if not authenticated or still loading.
   */
  user?: StandardUserInfo;

  /**
   * Whether auth state is still being determined
   *
   * True during initial authentication check or token refresh.
   * Useful for showing loading spinners.
   */
  isLoading: boolean;

  /**
   * Current error (if any)
   *
   * Present if there was an error during authentication or token refresh.
   */
  error?: StandardAuthError;
}
