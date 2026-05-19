import { Injectable, Inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { AngularAuthProviderConfig } from '../IAuthProvider';
import { Amplify } from 'aws-amplify';
import {
  signInWithRedirect,
  signOut,
  fetchAuthSession,
  getCurrentUser,
  fetchUserAttributes
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  AuthErrorType,
  TokenRefreshResult
} from '../auth-types';

/**
 * Configuration interface for the Cognito provider.
 * Populated from environment config via the `angularProviderFactory`.
 */
interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  region?: string;
  /** Cognito Hosted UI domain, e.g. 'myapp.auth.us-east-1.amazoncognito.com' */
  domain: string;
  /** OAuth redirect URI. Defaults to window.location.origin */
  redirectUri?: string;
  /** OAuth scopes. Defaults to ['openid', 'profile', 'email'] */
  scopes?: string[];
  /** When true, skips redirect callback processing (for MCP OAuth callback path) */
  skipRedirectCallback?: boolean;
}

/**
 * AWS Cognito authentication provider implementation - v3.0.0
 *
 * Implements the abstract methods from MJAuthBase to hide Cognito-specific details.
 * Uses AWS Amplify v6 (tree-shakeable subpath imports) for authentication.
 *
 * Key abstraction: Cognito stores tokens in Amplify's internal storage, accessed
 * via `fetchAuthSession().tokens?.idToken?.toString()`. Consumers never need to
 * know this detail.
 *
 * ## Cognito Hosted UI Flow
 * This provider uses the Cognito Hosted UI for login via `signInWithRedirect()`.
 * The flow is: redirect to Hosted UI -> user authenticates -> redirect back with
 * authorization code -> Amplify exchanges code for tokens (PKCE).
 */
@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'cognito')
export class MJCognitoProvider extends MJAuthBase {
  static readonly PROVIDER_TYPE = 'cognito';
  readonly type = MJCognitoProvider.PROVIDER_TYPE;
  private _initialized = false;
  private _hubListenerCancel: (() => void) | null = null;

  /**
   * Factory function to provide Angular dependencies required by the Cognito provider.
   * Returns a config injection token following the Okta provider pattern.
   */
  static angularProviderFactory = (environment: Record<string, unknown>) => {
    const isMCPOAuthCallback = window.location.pathname.startsWith('/oauth/callback');

    return [
      {
        provide: 'cognitoConfig',
        useValue: {
          userPoolId: environment['COGNITO_USER_POOL_ID'],
          userPoolClientId: environment['COGNITO_CLIENT_ID'] || environment['COGNITO_CLIENTID'],
          region: environment['COGNITO_REGION'] || environment['AWS_REGION'],
          domain: environment['COGNITO_DOMAIN'],
          redirectUri: environment['COGNITO_REDIRECT_URI'] || window.location.origin,
          scopes: environment['COGNITO_SCOPES'] || ['openid', 'profile', 'email', 'aws.cognito.signin.user.admin'],
          skipRedirectCallback: isMCPOAuthCallback,
        } as CognitoConfig
      }
    ];
  };

  constructor(@Inject('cognitoConfig') private cognitoConfig: CognitoConfig) {
    const config: AngularAuthProviderConfig = {
      name: MJCognitoProvider.PROVIDER_TYPE,
      type: MJCognitoProvider.PROVIDER_TYPE
    };
    super(config);

    // Configure Amplify with the existing Cognito User Pool
    const redirectUri = this.cognitoConfig.redirectUri || window.location.origin;
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: this.cognitoConfig.userPoolId,
          userPoolClientId: this.cognitoConfig.userPoolClientId,
          loginWith: {
            oauth: {
              domain: this.cognitoConfig.domain,
              scopes: this.cognitoConfig.scopes || ['openid', 'profile', 'email', 'aws.cognito.signin.user.admin'],
              redirectSignIn: [redirectUri],
              redirectSignOut: [redirectUri],
              responseType: 'code', // Authorization code + PKCE for refresh tokens
            }
          }
        }
      }
    });
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    // CRITICAL: Skip Amplify's redirect handling on the MCP OAuth callback path.
    // The /oauth/callback path is used by MCP OAuth, not Cognito. If we don't skip,
    // Amplify will consume the authorization code and prevent the MCP OAuth flow.
    if (this.cognitoConfig.skipRedirectCallback) {
      this._initialized = true;
      return;
    }

    // Set up Hub listener for reactive auth events
    this._hubListenerCancel = Hub.listen('auth', async ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
          this.updateAuthState(true);
          await this.refreshUserInfo();
          break;
        case 'signedOut':
          this.updateAuthState(false);
          this.updateUserInfo(null);
          break;
        case 'tokenRefresh':
          console.log('[Cognito] Token refreshed successfully');
          break;
        case 'tokenRefresh_failure':
          console.warn('[Cognito] Token refresh failed');
          break;
        case 'signInWithRedirect':
          console.log('[Cognito] OAuth redirect sign-in completed');
          break;
        case 'signInWithRedirect_failure':
          console.error('[Cognito] OAuth redirect sign-in failed');
          break;
      }
    });

    // Check for existing session (page refresh or returning from redirect)
    try {
      const user = await getCurrentUser();
      if (user) {
        this.updateAuthState(true);
        await this.refreshUserInfo();
      }
    } catch {
      // Not authenticated — this is expected on fresh visits
      this.updateAuthState(false);
    }

    this._initialized = true;
  }

  protected async loginInternal(_options?: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized();
    // Redirect to Cognito Hosted UI. This navigates the browser and never returns.
    await signInWithRedirect();
  }

  protected async logoutInternal(): Promise<void> {
    this.updateAuthState(false);
    this.updateUserInfo(null);

    // Cancel Hub listener before sign-out to avoid race conditions
    this.cancelHubListener();

    await signOut();
    // signOut() clears local tokens. With Hosted UI, it also redirects to the
    // Cognito logout endpoint to clear the Hosted UI session cookie.
  }

  async handleCallback(): Promise<void> {
    // Amplify v6 handles OAuth code exchange automatically when it detects
    // ?code= and ?state= in the URL during initialization. The Hub listener
    // catches 'signInWithRedirect' events. This method exists for interface
    // compatibility.
    try {
      const user = await getCurrentUser();
      if (user) {
        this.updateAuthState(true);
        await this.refreshUserInfo();
      }
    } catch {
      // Not authenticated after callback
    }
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS (v3.0.0)
  // ============================================================================

  /**
   * Extract ID token from Cognito via Amplify's fetchAuthSession.
   *
   * Cognito stores the JWT in session.tokens.idToken. The .toString()
   * call extracts the raw JWT string. Consumers never need to know this detail.
   */
  protected async extractIdTokenInternal(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() || null;
    } catch (error) {
      console.error('[Cognito] Error extracting ID token:', error);
      return null;
    }
  }

  /**
   * Extract complete token info from Cognito session.
   * Maps Amplify's token structure to StandardAuthToken.
   */
  protected async extractTokenInfoInternal(): Promise<StandardAuthToken | null> {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (!idToken) {
        return null;
      }

      const payload = idToken.payload;
      const accessToken = session.tokens?.accessToken;

      return {
        idToken: idToken.toString(),
        accessToken: accessToken?.toString(),
        expiresAt: payload?.exp ? (payload.exp as number) * 1000 : 0, // Convert to ms
        scopes: this.extractScopes(accessToken)
      };
    } catch (error) {
      console.error('[Cognito] Error extracting token info:', error);
      return null;
    }
  }

  /**
   * Extract user info from Cognito user attributes.
   * Maps Cognito's attribute structure to StandardUserInfo.
   */
  protected async extractUserInfoInternal(): Promise<StandardUserInfo | null> {
    try {
      const user = await getCurrentUser();
      const attributes = await fetchUserAttributes();

      return this.mapCognitoAttributesToStandard(user, attributes);
    } catch (error) {
      console.error('[Cognito] Error extracting user info:', error);
      return null;
    }
  }

  /**
   * Refresh token using Amplify's fetchAuthSession with forceRefresh.
   *
   * Amplify v6 handles the entire refresh token exchange internally:
   * fetchAuthSession({ forceRefresh: true }) uses the stored refresh token
   * to obtain new ID and access tokens from Cognito.
   */
  protected async refreshTokenInternal(): Promise<TokenRefreshResult> {
    try {
      console.log('[Cognito] Attempting to refresh token...');

      const session = await fetchAuthSession({ forceRefresh: true });
      const idToken = session.tokens?.idToken;

      if (!idToken) {
        return {
          success: false,
          error: {
            type: AuthErrorType.NO_ACTIVE_SESSION,
            message: 'Token refresh succeeded but no ID token returned',
            userMessage: 'Session refresh failed. Please log in again.'
          }
        };
      }

      const payload = idToken.payload;
      const accessToken = session.tokens?.accessToken;

      console.log('[Cognito] Token refresh successful', {
        expiresAt: payload?.exp ? new Date((payload.exp as number) * 1000).toISOString() : 'N/A'
      });

      return {
        success: true,
        token: {
          idToken: idToken.toString(),
          accessToken: accessToken?.toString(),
          expiresAt: payload?.exp ? (payload.exp as number) * 1000 : 0,
          scopes: this.extractScopes(accessToken)
        }
      };
    } catch (error) {
      console.error('[Cognito] Token refresh failed:', error);
      return {
        success: false,
        error: this.classifyErrorInternal(error)
      };
    }
  }

  /**
   * Classify Cognito/Amplify-specific errors into semantic types.
   *
   * Maps Amplify v6 error names and messages to AuthErrorType enum.
   */
  protected classifyErrorInternal(error: unknown): StandardAuthError {
    const errorObj = error as Record<string, unknown>;
    const message = (errorObj?.['message'] as string) || 'Unknown error';
    const name = (errorObj?.['name'] as string) || '';

    // Not authenticated / no session
    if (name === 'UserUnAuthenticatedException' ||
        message.includes('not authenticated') ||
        message.includes('No current user') ||
        name === 'UserNotFoundException') {
      return {
        type: AuthErrorType.NO_ACTIVE_SESSION,
        message,
        originalError: error,
        userMessage: 'You need to log in to continue.'
      };
    }

    // Token expired / invalid refresh token
    if (name === 'NotAuthorizedException' ||
        message.includes('not authorized') ||
        message.includes('Invalid Refresh Token') ||
        message.includes('expired') ||
        message.includes('invalid_grant')) {
      return {
        type: AuthErrorType.TOKEN_EXPIRED,
        message,
        originalError: error,
        userMessage: 'Your session has expired. Please log in again.'
      };
    }

    // User cancelled login
    if (message.includes('cancelled') || message.includes('canceled') ||
        message.includes('user denied')) {
      return {
        type: AuthErrorType.USER_CANCELLED,
        message,
        originalError: error,
        userMessage: 'Login was cancelled.'
      };
    }

    // Network errors
    if (message.includes('network') || message.includes('fetch') ||
        message.includes('Network') || message.includes('Load failed')) {
      return {
        type: AuthErrorType.NETWORK_ERROR,
        message,
        originalError: error,
        userMessage: 'Network error. Please check your connection and try again.'
      };
    }

    // OAuth configuration errors
    if (name === 'OAuthNotConfigureException' ||
        name === 'AuthTokenConfigException' ||
        message.includes('OAuth') || message.includes('configuration')) {
      return {
        type: AuthErrorType.CONFIGURATION_ERROR,
        message,
        originalError: error,
        userMessage: 'Authentication configuration error. Please contact support.'
      };
    }

    // Default to unknown
    return {
      type: AuthErrorType.UNKNOWN_ERROR,
      message,
      originalError: error,
      userMessage: 'An unexpected error occurred. Please try again.'
    };
  }

  /**
   * Get profile picture URL from Cognito user attributes.
   *
   * Cognito can store a `picture` attribute if configured in the user pool.
   * Returns null if the attribute is not set.
   */
  protected async getProfilePictureUrlInternal(): Promise<string | null> {
    try {
      const attributes = await fetchUserAttributes();
      return attributes.picture || null;
    } catch (error) {
      console.error('[Cognito] Error getting profile picture:', error);
      return null;
    }
  }

  /**
   * Handle session expiry by redirecting to Cognito Hosted UI.
   *
   * Cognito uses refresh tokens (responseType: 'code'), so silent refresh
   * usually works. If it fails, we redirect to the Hosted UI for
   * re-authentication. This will navigate the browser and may never return.
   */
  protected async handleSessionExpiryInternal(): Promise<void> {
    console.log('[Cognito] Session expired, redirecting to Hosted UI for re-authentication');
    await signInWithRedirect();
    // This redirects the page and never returns
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this._initialized) {
      await this.initialize();
    }
  }

  /**
   * Refresh user info from Cognito and update the reactive state.
   */
  private async refreshUserInfo(): Promise<void> {
    try {
      const userInfo = await this.extractUserInfoInternal();
      if (userInfo) {
        this.updateUserInfo(userInfo);
      }
    } catch (error) {
      console.warn('[Cognito] Failed to refresh user info:', error);
    }
  }

  /**
   * Map Cognito user attributes to StandardUserInfo.
   *
   * Cognito attributes use snake_case keys (email, given_name, family_name, etc.)
   * and all values are strings (including booleans like email_verified = 'true').
   */
  private mapCognitoAttributesToStandard(
    user: { userId: string; username: string; signInDetails?: { loginId?: string } },
    attributes: Partial<Record<string, string>>
  ): StandardUserInfo {
    const givenName = attributes['given_name'];
    const familyName = attributes['family_name'];
    const fullName = attributes['name'] ||
      (givenName && familyName ? `${givenName} ${familyName}` : givenName || familyName || '');

    return {
      id: user.userId || user.username,
      email: attributes['email'] || '',
      name: fullName,
      givenName,
      familyName,
      preferredUsername: attributes['preferred_username'] || user.username,
      pictureUrl: attributes['picture'],
      emailVerified: attributes['email_verified'] === 'true',
      locale: attributes['locale'],
    };
  }

  /**
   * Extract OAuth scopes from an access token's payload.
   */
  private extractScopes(accessToken: { payload?: Record<string, unknown> } | undefined): string[] | undefined {
    const scope = accessToken?.payload?.['scope'];
    if (typeof scope === 'string') {
      return scope.split(' ');
    }
    return undefined;
  }

  /**
   * Cancel the Hub event listener if active.
   */
  private cancelHubListener(): void {
    if (this._hubListenerCancel) {
      this._hubListenerCancel();
      this._hubListenerCancel = null;
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  override getRequiredConfig(): string[] {
    return ['userPoolId', 'userPoolClientId', 'domain'];
  }

  override validateConfig(config: Record<string, unknown>): boolean {
    return !!(config['userPoolId'] && config['userPoolClientId'] && config['domain']);
  }
}
