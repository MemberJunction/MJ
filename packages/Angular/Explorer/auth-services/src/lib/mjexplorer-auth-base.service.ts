import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { IAngularAuthProvider, AngularAuthProviderConfig } from './IAuthProvider';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  TokenRefreshResult
} from './auth-types';

/**
 * Base class for Angular authentication providers - v3.0.0
 *
 * Provides common functionality and enforces the provider interface.
 * All concrete providers (MSAL, Auth0, Okta) should extend this class.
 *
 * ## Key Improvements in v3.0:
 * - Proper abstraction - no more leaky provider-specific logic
 * - Standardized types - no more `any` types
 * - Clean token access - no more `__raw || idToken` patterns
 * - Semantic error handling - no more provider-specific error checks
 *
 * ## For Provider Implementers:
 * Extend this class and implement the abstract methods:
 * - `extractIdTokenInternal()` - Extract token from provider storage
 * - `extractTokenInfoInternal()` - Extract full token info
 * - `extractUserInfoInternal()` - Map claims to StandardUserInfo
 * - `refreshTokenInternal()` - Implement refresh mechanism
 * - `classifyErrorInternal()` - Map errors to AuthErrorType
 *
 * @version 3.0.0
 */
@Injectable()
export abstract class MJAuthBase implements IAngularAuthProvider {
  protected config: AngularAuthProviderConfig;

  // State management with proper types (no more 'any'!)
  protected isAuthenticated$ = new BehaviorSubject<boolean>(false);
  protected userInfo$ = new BehaviorSubject<StandardUserInfo | null>(null);
  protected userEmail$ = new BehaviorSubject<string>('');

  private _initialPath: string | null = null;
  private _initialSearch: string | null = null;

  /**
   * Contains the initial path from window.location.pathname before any work was done by auth services
   */
  get initialPath(): string | null {
    return this._initialPath;
  }

  /**
   * Contains the initial search/query string from window.location.search before any work was done by auth services
   */
  get initialSearch(): string | null {
    return this._initialSearch;
  }

  /**
   * Provider type identifier
   * Must be implemented by concrete providers
   */
  abstract readonly type: string;

  constructor(config: AngularAuthProviderConfig) {
    this.config = config;
    this._initialPath = window.location.pathname;
    this._initialSearch = window.location.search;
  }

  // ============================================================================
  // ABSTRACT METHODS (Must be implemented by concrete providers)
  // ============================================================================

  /**
   * Initialize the provider
   *
   * Subclasses should override to set up provider-specific initialization,
   * handle redirect callbacks, restore sessions, etc.
   */
  abstract initialize(): Promise<void>;

  /**
   * Internal login implementation
   *
   * Subclasses implement provider-specific login flow.
   * This is called by the public login() method.
   */
  protected abstract loginInternal(options?: Record<string, unknown>): Promise<void>;

  /**
   * Logout implementation
   *
   * Subclasses implement provider-specific logout flow.
   */
  abstract logout(): Promise<void>;

  /**
   * Handle OAuth callback
   *
   * Subclasses implement provider-specific callback handling.
   */
  abstract handleCallback(): Promise<void>;

  /**
   * Extract ID token from provider-specific storage
   *
   * This is where providers hide their implementation details.
   * - Auth0: Extracts from claims.__raw
   * - MSAL: Extracts from response.idToken
   * - Okta: Extracts from authState.idToken
   *
   * @returns Promise resolving to token string or null if not authenticated
   */
  protected abstract extractIdTokenInternal(): Promise<string | null>;

  /**
   * Extract complete token info from provider-specific storage
   *
   * Maps provider-specific token structure to StandardAuthToken.
   *
   * @returns Promise resolving to StandardAuthToken or null if not authenticated
   */
  protected abstract extractTokenInfoInternal(): Promise<StandardAuthToken | null>;

  /**
   * Extract user info from provider-specific claims
   *
   * Maps provider-specific claim structure to StandardUserInfo.
   * This is where providers translate their claims (sub, email, name, etc.)
   * into the standard structure.
   *
   * @returns Promise resolving to StandardUserInfo or null if not authenticated
   */
  protected abstract extractUserInfoInternal(): Promise<StandardUserInfo | null>;

  /**
   * Refresh token using provider-specific mechanism
   *
   * Implements the provider's token refresh logic.
   * - Auth0: Uses getAccessTokenSilently with ignoreCache
   * - MSAL: Uses acquireTokenSilent with forceRefresh
   * - Okta: Uses tokenManager.renew
   *
   * @returns Promise resolving to TokenRefreshResult indicating success/failure
   */
  protected abstract refreshTokenInternal(): Promise<TokenRefreshResult>;

  /**
   * Classify provider-specific error into standard error type
   *
   * Maps provider-specific errors to semantic AuthErrorType values.
   * Examples:
   * - Auth0: "jwt expired" → TOKEN_EXPIRED
   * - MSAL: BrowserAuthError → NO_ACTIVE_SESSION
   * - MSAL: InteractionRequiredAuthError → INTERACTION_REQUIRED
   *
   * @param error The error to classify
   * @returns StandardAuthError with categorized type and user-friendly message
   */
  protected abstract classifyErrorInternal(error: unknown): StandardAuthError;

  // ============================================================================
  // PUBLIC API (Concrete implementations using abstract internals)
  // ============================================================================

  /**
   * Public login method with Observable wrapper for backward compatibility
   *
   * Consumers can use either:
   * - `await this.authBase.login()` (Promise)
   * - `this.authBase.login().subscribe()` (Observable)
   */
  login(options?: Record<string, unknown>): Observable<void> {
    return from(this.loginInternal(options));
  }

  /**
   * Check if user is authenticated (Observable stream)
   *
   * Returns a reactive stream that emits authentication state changes.
   * Consumers can subscribe to react to login/logout events.
   */
  isAuthenticated(): Observable<boolean> {
    return this.isAuthenticated$.asObservable();
  }

  /**
   * Get user info as Observable stream
   *
   * Returns standardized user info, hiding provider-specific claim structures.
   * No more need for consumers to merge claims or check provider-specific fields!
   */
  getUserInfo(): Observable<StandardUserInfo | null> {
    return this.userInfo$.asObservable();
  }

  /**
   * Get user email as Observable stream
   */
  getUserEmail(): Observable<string> {
    return this.userEmail$.asObservable();
  }

  /**
   * Get ID token string (primary token method)
   *
   * This is the clean abstraction - no provider-specific logic needed!
   * Replaces the old pattern of: `claims?.__raw || claims?.idToken`
   *
   * @example
   * ```typescript
   * const token = await this.authBase.getIdToken();
   * if (token) {
   *   setupGraphQLClient(token, apiUrl);
   * }
   * ```
   */
  async getIdToken(): Promise<string | null> {
    return this.extractIdTokenInternal();
  }

  /**
   * Get complete token information
   *
   * Returns full token details including expiration and scopes.
   * Use this when you need more than just the token string.
   */
  async getTokenInfo(): Promise<StandardAuthToken | null> {
    return this.extractTokenInfoInternal();
  }

  /**
   * Refresh authentication token
   *
   * Attempts to refresh the token without user interaction.
   * Returns a result object indicating success or failure with details.
   *
   * @example
   * ```typescript
   * const result = await this.authBase.refreshToken();
   * if (result.success && result.token) {
   *   return result.token.idToken;
   * } else {
   *   throw new Error(result.error?.userMessage || 'Refresh failed');
   * }
   * ```
   */
  async refreshToken(): Promise<TokenRefreshResult> {
    const result = await this.refreshTokenInternal();

    // Update state if refresh succeeded
    if (result.success && result.token) {
      // Optionally refresh user info to keep it in sync
      try {
        const userInfo = await this.extractUserInfoInternal();
        if (userInfo) {
          this.updateUserInfo(userInfo);
        }
      } catch {
        // User info update failed, but token refresh succeeded
        // Don't fail the entire refresh for this
      }
    }

    return result;
  }

  /**
   * Classify an error into standard error type
   *
   * Converts provider-specific errors into semantic categories.
   * Eliminates need for consumers to check error.name or error types.
   *
   * @example
   * ```typescript
   * const authError = this.authBase.classifyError(err);
   * if (authError.type === AuthErrorType.TOKEN_EXPIRED) {
   *   this.showMessage(authError.userMessage);
   * }
   * ```
   */
  classifyError(error: unknown): StandardAuthError {
    return this.classifyErrorInternal(error);
  }

  // ============================================================================
  // HELPER METHODS (For subclasses to update state)
  // ============================================================================

  /**
   * Update authentication state
   *
   * Subclasses should call this when authentication state changes
   * (after login, logout, session check, etc.)
   */
  protected updateAuthState(isAuthenticated: boolean): void {
    this.isAuthenticated$.next(isAuthenticated);
  }

  /**
   * Update user info
   *
   * Subclasses should call this when user info is retrieved or updated.
   * This automatically updates the email stream as well.
   */
  protected updateUserInfo(userInfo: StandardUserInfo | null): void {
    this.userInfo$.next(userInfo);

    if (userInfo?.email) {
      this.userEmail$.next(userInfo.email);
    } else {
      this.userEmail$.next('');
    }
  }

  // ============================================================================
  // CONFIGURATION & VALIDATION
  // ============================================================================

  /**
   * Get required configuration fields
   *
   * Default implementation requires clientId.
   * Subclasses can override to add provider-specific requirements.
   */
  getRequiredConfig(): string[] {
    return ['clientId'];
  }

  /**
   * Validate provider configuration
   *
   * Checks that all required fields are present and non-empty.
   * Subclasses can override to add custom validation logic.
   */
  validateConfig(config: Record<string, unknown>): boolean {
    const requiredFields = this.getRequiredConfig();
    return requiredFields.every(field =>
      config[field] !== undefined && config[field] !== ''
    );
  }
}
