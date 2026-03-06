import { Injectable, Inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { AngularAuthProviderConfig } from '../IAuthProvider';
import OktaAuth, { OktaAuthOptions, IDToken, AccessToken } from '@okta/okta-auth-js';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  AuthErrorType,
  TokenRefreshResult
} from '../auth-types';
/**
 * Okta authentication provider implementation - v3.0.0
 *
 * Implements the abstract methods from MJAuthBase to hide Okta-specific details.
 * The key abstraction is that Okta stores the JWT in IDToken.idToken,
 * but consumers never need to know this detail.
 */
@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'okta')
export class MJOktaProvider extends MJAuthBase {
  static readonly PROVIDER_TYPE = 'okta';
  readonly type = MJOktaProvider.PROVIDER_TYPE;
  private oktaAuth: OktaAuth;
  private isRefreshing = false;

  /**
   * Factory function to provide Angular dependencies required by Okta
   * Stored as a static property for the factory to access without instantiation
   */
  static angularProviderFactory = (environment: Record<string, unknown>) => [
    {
      provide: 'oktaConfig',
      useValue: {
        clientId: environment['OKTA_CLIENTID'],
        domain: environment['OKTA_DOMAIN'],
        issuer: environment['OKTA_ISSUER'] || `https://${environment['OKTA_DOMAIN']}/oauth2/default`,
        redirectUri: environment['OKTA_REDIRECT_URI'] || window.location.origin,
        scopes: environment['OKTA_SCOPES'] || ['openid', 'profile', 'email']
      }
    }
  ];

  constructor(@Inject('oktaConfig') private oktaConfig: OktaAuthOptions & { domain?: string }) {
    const config: AngularAuthProviderConfig = {
      name: MJOktaProvider.PROVIDER_TYPE,
      type: MJOktaProvider.PROVIDER_TYPE
    };
    super(config);

    // Build configuration with defaults
    const oktaAuthConfig: OktaAuthOptions = {
      clientId: this.oktaConfig.clientId,
      redirectUri: this.oktaConfig.redirectUri || window.location.origin + '/callback',
      scopes: this.oktaConfig.scopes || ['openid', 'profile', 'email'],
      pkce: true, // Use PKCE for security
      ...this.oktaConfig,
      // Set issuer after spread to ensure it's not overwritten if not present in config
      issuer: this.oktaConfig.issuer || (this.oktaConfig.domain ? `https://${this.oktaConfig.domain}/oauth2/default` : '')
    };

    this.oktaAuth = new OktaAuth(oktaAuthConfig);

    // Listen for token events
    this.oktaAuth.authStateManager.subscribe((authState: unknown) => {
      const state = authState as { isAuthenticated?: boolean; idToken?: IDToken };
      this.updateAuthState(state.isAuthenticated || false);

      // Don't update user info if we're in the middle of a refresh
      if (!this.isRefreshing) {
        if (state.isAuthenticated && state.idToken) {
          const userInfo = this.mapOktaTokenToStandard(state.idToken);
          this.updateUserInfo(userInfo);
        } else {
          this.updateUserInfo(null);
        }
      }
    });
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  async initialize(): Promise<void> {
    // Check URL for logout indicator
    const urlParams = new URLSearchParams(window.location.search);
    const isPostLogout = urlParams.has('logout');

    if (isPostLogout) {
      // We're returning from a logout, clear the URL and stay logged out
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check if we're returning from a login redirect
    // Note: handleRedirect() is the modern v7.x replacement for deprecated handleLoginRedirect()
    if (this.oktaAuth.isLoginRedirect()) {
      try {
        await this.oktaAuth.handleRedirect();

        // After handling redirect, check if we're authenticated
        const authState = await this.oktaAuth.authStateManager.getAuthState();

        if (authState?.isAuthenticated) {
          this.updateAuthState(true);

          // Get and update user info
          const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
          if (idToken) {
            const userInfo = this.mapOktaTokenToStandard(idToken);
            this.updateUserInfo(userInfo);
          }
        }
      } catch (error) {
        console.error('[Okta] Initialization redirect handling error:', error);
      }
      return; // Don't check for existing session after handling redirect
    }

    // Only check for existing session if not a redirect
    try {
      const isAuthenticated = await this.oktaAuth.isAuthenticated();

      if (isAuthenticated) {
        // Double-check we actually have valid tokens
        const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;

        if (idToken?.idToken) {
          this.updateAuthState(true);

          // Update user info from cached token
          const userInfo = this.mapOktaTokenToStandard(idToken);
          this.updateUserInfo(userInfo);
        } else {
          // No valid tokens, stay logged out
          this.updateAuthState(false);
        }
      }
    } catch (error) {
      console.warn('[Okta] Error checking authentication status:', error);
    }
  }

  protected async loginInternal(options?: Record<string, unknown>): Promise<void> {
    try {
      // Check if we're in a redirect callback
      // Note: handleRedirect() is the modern v7.x replacement for deprecated handleLoginRedirect()
      if (this.oktaAuth.isLoginRedirect()) {
        await this.oktaAuth.handleRedirect();
        return;
      }

      // Start the login flow
      await this.oktaAuth.signInWithRedirect({
        originalUri: (options?.['targetUrl'] as string) || '/',
        ...options
      });
    } catch (error) {
      console.error('[Okta] Login error:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      // Clear the local authentication state immediately
      this.updateAuthState(false);
      this.updateUserInfo(null);

      // Clear all tokens from local storage
      await this.oktaAuth.tokenManager.clear();

      // Sign out from Okta completely
      await this.oktaAuth.signOut({
        postLogoutRedirectUri: window.location.origin,
        clearTokensBeforeRedirect: true
      });

      // Note: The signOut call will redirect the browser, so code after this won't execute
    } catch (error) {
      console.error('[Okta] Logout error:', error);
      // If logout fails, at least clear local state and reload
      window.location.href = window.location.origin;
    }
  }

  async handleCallback(): Promise<void> {
    try {
      // Note: handleRedirect() is the modern v7.x replacement for deprecated handleLoginRedirect()
      if (this.oktaAuth.isLoginRedirect()) {
        await this.oktaAuth.handleRedirect();

        // After handling redirect, check if we're authenticated
        const authState = await this.oktaAuth.authStateManager.getAuthState();
        if (authState?.isAuthenticated) {
          // Do a controlled reload after successful login
          setTimeout(() => {
            window.location.href = window.location.origin;
          }, 100);
        }
      }
    } catch (error) {
      console.error('[Okta] Callback handling error:', error);
      throw error;
    }
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS (v3.0.0)
  // ============================================================================

  /**
   * Extract ID token from Okta's storage
   *
   * Okta stores the JWT in IDToken.idToken
   * This is the key abstraction - consumers never need to know about Okta's structure!
   */
  protected async extractIdTokenInternal(): Promise<string | null> {
    try {
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      // Okta-specific detail: JWT is in idToken property
      return idToken?.idToken || null;
    } catch (error) {
      console.error('[Okta] Error extracting ID token:', error);
      return null;
    }
  }

  /**
   * Extract complete token info from Okta
   *
   * Maps Okta's token structure to StandardAuthToken
   */
  protected async extractTokenInfoInternal(): Promise<StandardAuthToken | null> {
    try {
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      const accessToken = await this.oktaAuth.tokenManager.get('accessToken') as AccessToken;

      if (!idToken?.idToken) {
        return null;
      }

      return {
        idToken: idToken.idToken,
        accessToken: accessToken?.accessToken,
        expiresAt: idToken.expiresAt ? idToken.expiresAt * 1000 : 0, // Convert to milliseconds
        scopes: idToken.scopes
      };
    } catch (error) {
      console.error('[Okta] Error extracting token info:', error);
      return null;
    }
  }

  /**
   * Extract user info from Okta claims
   *
   * Maps Okta's IDToken structure to StandardUserInfo
   */
  protected async extractUserInfoInternal(): Promise<StandardUserInfo | null> {
    try {
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      if (!idToken) {
        return null;
      }

      return this.mapOktaTokenToStandard(idToken);
    } catch (error) {
      console.error('[Okta] Error extracting user info:', error);
      return null;
    }
  }

  /**
   * Refresh token using Okta's token renewal
   *
   * Uses renewTokens() to get new tokens silently
   */
  protected async refreshTokenInternal(): Promise<TokenRefreshResult> {
    try {
      console.log('[Okta] Attempting to refresh token...');

      // Set flag to prevent authStateManager from triggering updates
      this.isRefreshing = true;

      // First check if we're authenticated
      const isAuthenticated = await this.oktaAuth.isAuthenticated();

      if (!isAuthenticated) {
        this.isRefreshing = false;
        return {
          success: false,
          error: {
            type: AuthErrorType.NO_ACTIVE_SESSION,
            message: 'User is not authenticated',
            userMessage: 'You need to log in to continue.'
          }
        };
      }

      // Check if tokens exist
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      const accessToken = await this.oktaAuth.tokenManager.get('accessToken') as AccessToken;

      if (!idToken || !accessToken) {
        this.isRefreshing = false;
        return {
          success: false,
          error: {
            type: AuthErrorType.NO_ACTIVE_SESSION,
            message: 'No tokens available to refresh',
            userMessage: 'Session not found. Please log in again.'
          }
        };
      }

      // Attempt to renew tokens
      const renewedTokens = await this.oktaAuth.token.renewTokens();

      if (renewedTokens.idToken) {
        // Store the renewed tokens
        this.oktaAuth.tokenManager.setTokens(renewedTokens);

        // Wait a moment before resetting the flag
        await new Promise(resolve => setTimeout(resolve, 100));

        this.isRefreshing = false;

        const newIdToken = renewedTokens.idToken as IDToken;
        console.log('[Okta] Token refresh successful', {
          expiresAt: newIdToken.expiresAt ? new Date(newIdToken.expiresAt * 1000).toISOString() : 'N/A'
        });

        const token: StandardAuthToken = {
          idToken: newIdToken.idToken || '',
          accessToken: renewedTokens.accessToken?.accessToken,
          expiresAt: newIdToken.expiresAt ? newIdToken.expiresAt * 1000 : 0,
          scopes: newIdToken.scopes
        };

        return {
          success: true,
          token
        };
      }

      this.isRefreshing = false;
      return {
        success: false,
        error: {
          type: AuthErrorType.NO_ACTIVE_SESSION,
          message: 'Token renewal succeeded but no ID token returned',
          userMessage: 'Session refresh failed. Please log in again.'
        }
      };
    } catch (error) {
      console.error('[Okta] Token refresh failed:', error);
      this.isRefreshing = false;

      return {
        success: false,
        error: this.classifyErrorInternal(error)
      };
    }
  }

  /**
   * Classify Okta-specific errors into semantic types
   *
   * Maps Okta error patterns to AuthErrorType enum.
   * Updated for okta-auth-js v7.x error codes.
   *
   * Error sources:
   * - errorCode: From Okta SDK errors (AuthSdkError, AuthApiError)
   * - error: From OAuth /token endpoint responses (invalid_grant, access_denied, etc.)
   */
  protected classifyErrorInternal(error: unknown): StandardAuthError {
    const errorObj = error as Record<string, unknown>;
    const message = errorObj?.['message'] as string || 'Unknown error';
    const errorCode = errorObj?.['errorCode'] as string || '';
    // OAuth errors from /token endpoint use 'error' field instead of 'errorCode'
    const oauthError = errorObj?.['error'] as string || '';

    // Handle invalid_grant - refresh token is invalid or expired
    // This is a common error when refresh tokens expire or are revoked
    if (errorCode === 'invalid_grant' || oauthError === 'invalid_grant' ||
        message.includes('refresh token is invalid or expired')) {
      return {
        type: AuthErrorType.TOKEN_EXPIRED,
        message,
        originalError: error,
        userMessage: 'Your session has expired. Please log in again.'
      };
    }

    // Handle access_denied - user or server denied the request
    if (errorCode === 'access_denied' || oauthError === 'access_denied' ||
        message.includes('access_denied')) {
      return {
        type: AuthErrorType.USER_CANCELLED,
        message,
        originalError: error,
        userMessage: 'Access was denied. Please try again.'
      };
    }

    // Check for specific Okta error patterns
    if (errorCode === 'login_required' || oauthError === 'login_required' ||
        message.includes('login_required')) {
      return {
        type: AuthErrorType.NO_ACTIVE_SESSION,
        message,
        originalError: error,
        userMessage: 'You need to log in to continue.'
      };
    }

    if (message.includes('not to prompt') || message.includes('consent_required') ||
        oauthError === 'consent_required') {
      return {
        type: AuthErrorType.INTERACTION_REQUIRED,
        message,
        originalError: error,
        userMessage: 'Additional authentication is required. Please log in again.'
      };
    }

    // Handle both user_cancelled (SDK) and user_canceled_request (OAuth redirect)
    if (errorCode === 'user_cancelled' || errorCode === 'user_canceled_request' ||
        oauthError === 'user_canceled_request' ||
        message.includes('user cancelled') || message.includes('user canceled')) {
      return {
        type: AuthErrorType.USER_CANCELLED,
        message,
        originalError: error,
        userMessage: 'Login was cancelled.'
      };
    }

    if (message.includes('token expired') || message.includes('invalid_token') || message.includes('unauthorized')) {
      return {
        type: AuthErrorType.TOKEN_EXPIRED,
        message,
        originalError: error,
        userMessage: 'Your session has expired. Please log in again.'
      };
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('Load failed')) {
      return {
        type: AuthErrorType.NETWORK_ERROR,
        message,
        originalError: error,
        userMessage: 'Network error. Please check your connection and try again.'
      };
    }

    // Default to unknown error
    return {
      type: AuthErrorType.UNKNOWN_ERROR,
      message,
      originalError: error,
      userMessage: 'An unexpected error occurred. Please try again.'
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Map Okta IDToken to StandardUserInfo
   */
  private mapOktaTokenToStandard(idToken: IDToken): StandardUserInfo {
    const claims = idToken.claims;

    return {
      id: claims.sub || '',
      email: claims.email as string || '',
      name: claims.name as string || '',
      givenName: claims.given_name as string,
      familyName: claims.family_name as string,
      preferredUsername: claims.preferred_username as string,
      emailVerified: claims.email_verified as boolean
    };
  }

  /**
   * Get profile picture URL from Okta
   *
   * Okta may include picture URL in user claims, similar to Auth0.
   * If available, we can also fetch from Okta's /userinfo endpoint.
   */
  protected async getProfilePictureUrlInternal(): Promise<string | null> {
    try {
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      if (!idToken) {
        return null;
      }

      // Check if picture is in claims
      const pictureUrl = idToken.claims.picture as string;
      if (pictureUrl) {
        return pictureUrl;
      }

      // Alternatively, fetch from userinfo endpoint
      const user = await this.oktaAuth.getUser();
      return (user?.picture as string) || null;
    } catch (error) {
      console.error('[Okta] Error getting profile picture:', error);
      return null;
    }
  }

  /**
   * Handle session expiry - no-op for Okta
   *
   * Okta uses refresh tokens, so it doesn't need interactive re-authentication
   * when tokens expire. If refresh fails, the base class will throw an error
   * and the user must log out/in manually.
   */
  protected async handleSessionExpiryInternal(): Promise<void> {
    // No-op - Okta doesn't need interactive re-auth
    return;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  override getRequiredConfig(): string[] {
    return ['clientId', 'domain'];
  }

  override validateConfig(config: Record<string, unknown>): boolean {
    return !!(config['clientId'] && (config['domain'] || config['issuer']));
  }
}
