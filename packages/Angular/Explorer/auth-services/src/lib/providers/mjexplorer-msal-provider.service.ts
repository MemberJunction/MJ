import { Injectable, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { BehaviorSubject, Observable, Subject, catchError, filter, from, map, of, throwError, takeUntil, take } from 'rxjs';
import { MsalBroadcastService, MsalService, MSAL_INSTANCE, MSAL_GUARD_CONFIG, MSAL_INTERCEPTOR_CONFIG, MsalGuard } from '@azure/msal-angular';
import { AccountInfo, AuthenticationResult } from '@azure/msal-common';
import { CacheLookupPolicy, InteractionRequiredAuthError, InteractionStatus, PublicClientApplication, InteractionType, BrowserAuthError } from '@azure/msal-browser';
import { LogError } from '@memberjunction/core';
import { AngularAuthProviderConfig } from '../IAuthProvider';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  AuthErrorType,
  TokenRefreshResult
} from '../auth-types';
/**
 * MSAL (Microsoft Authentication Library) provider implementation - v3.0.0
 *
 * Implements the abstract methods from MJAuthBase to hide MSAL-specific details.
 * The key abstraction is that MSAL stores the JWT in AuthenticationResult.idToken,
 * but consumers never need to know this detail.
 */
@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'msal')
export class MJMSALProvider extends MJAuthBase implements OnDestroy {
  static readonly PROVIDER_TYPE = 'msal';
  readonly type = MJMSALProvider.PROVIDER_TYPE;

  private readonly _destroying$ = new Subject<void>();
  private readonly _initializationCompleted$ = new BehaviorSubject<boolean>(false);
  private _initPromise: Promise<void> | null = null;

  /**
   * Factory function to provide Angular dependencies required by MSAL
   * Stored as a static property for the factory to access without instantiation
   */
  static angularProviderFactory = (environment: Record<string, unknown>) => [
    {
      provide: MSAL_INSTANCE,
      useValue: new PublicClientApplication({
        auth: {
          clientId: environment['CLIENT_ID'] as string,
          authority: environment['CLIENT_AUTHORITY'] as string,
          redirectUri: window.location.origin,
        },
        cache: {
          cacheLocation: 'localStorage',
        },
      }),
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useValue: {
        interactionType: InteractionType.Redirect,
        authRequest: {
          scopes: ['User.Read'],
        },
      },
    },
    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      useValue: {
        interactionType: InteractionType.Redirect,
        protectedResourceMap: new Map([['https://graph.microsoft.com/v1.0/me', ['user.read']]]),
      },
    },
    MsalService,
    MsalGuard,
    MsalBroadcastService
  ];

  constructor(public auth: MsalService, private msalBroadcastService: MsalBroadcastService) {
    const config: AngularAuthProviderConfig = {
      name: MJMSALProvider.PROVIDER_TYPE,
      type: MJMSALProvider.PROVIDER_TYPE
    };
    super(config);
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  async initialize(): Promise<void> {
    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._performInitialization();
    return this._initPromise;
  }

  private async _performInitialization(): Promise<void> {
    console.log('[MSAL] Starting initialization...');
    await this.auth.instance.initialize();
    console.log('[MSAL] MSAL instance initialized');

    // Handle redirect immediately after initialization
    const redirectResponse = await this.auth.instance.handleRedirectPromise();
    console.log('[MSAL] Redirect response:', redirectResponse ? 'Found' : 'None');

    if (redirectResponse && redirectResponse.account) {
      // User just logged in via redirect
      console.log('[MSAL] Processing redirect login');
      this.auth.instance.setActiveAccount(redirectResponse.account);
      this.updateAuthState(true);

      // Update user info from account
      const userInfo = this.mapMSALAccountToStandard(redirectResponse.account);
      this.updateUserInfo(userInfo);

      this._initializationCompleted$.next(true);
      console.log('[MSAL] Initialization completed (redirect login)');
    } else {
      // Set active account if we have one from cache
      const accounts = this.auth.instance.getAllAccounts();
      console.log('[MSAL] Cached accounts found:', accounts.length);

      if (accounts.length > 0) {
        console.log('[MSAL] Restoring session from cached account:', accounts[0].username);
        this.auth.instance.setActiveAccount(accounts[0]);
        this.updateAuthState(true);

        // Update user info from cached account
        const userInfo = this.mapMSALAccountToStandard(accounts[0]);
        this.updateUserInfo(userInfo);

        // Proactively refresh tokens to extend the interaction-free period
        // This uses refreshTokenExpirationOffsetSeconds to ensure tokens remain valid
        // for at least 2 hours without requiring user interaction
        this.performProactiveRefresh(accounts[0]).catch((err: unknown) => {
          // Log but don't fail initialization - cached tokens may still be valid
          console.warn('[MSAL] Proactive token refresh failed during init:', err);
        });

        this._initializationCompleted$.next(true);
        console.log('[MSAL] Initialization completed (cached session restored)');
      } else {
        console.log('[MSAL] No cached accounts, user needs to log in');
      }
    }

    // Subscribe to broadcast service for ongoing auth state changes
    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None),
        takeUntil(this._destroying$)
      )
      .subscribe(() => {
        const accounts = this.auth.instance.getAllAccounts();
        const isAuth = accounts.length > 0;

        this.updateAuthState(isAuth);

        if (isAuth) {
          this.auth.instance.setActiveAccount(accounts[0]);
          const userInfo = this.mapMSALAccountToStandard(accounts[0]);
          this.updateUserInfo(userInfo);
        } else {
          this.updateUserInfo(null);
        }

        this._initializationCompleted$.next(true);
      });
  }

  protected async loginInternal(options?: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized();

    const silentRequest = {
      scopes: ['User.Read', 'email', 'profile'],
      ...options
    };

    return new Promise((resolve, reject) => {
      this.auth.loginRedirect(silentRequest).subscribe({
        next: () => {
          resolve();
        },
        error: (error) => {
          LogError(error);
          reject(error);
        }
      });
    });
  }

  async logout(): Promise<void> {
    await this.ensureInitialized();
    this.auth.logoutRedirect().subscribe(() => {
      // Logout will trigger a redirect
    });
  }

  async handleCallback(): Promise<void> {
    // MSAL Angular handles callbacks internally through its broadcast service
    // The handleRedirectPromise is called in initialize()
    await this.ensureInitialized();
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS (v3.0.0)
  // ============================================================================

  /**
   * Extract ID token from MSAL's storage
   *
   * MSAL stores the JWT in AuthenticationResult.idToken
   * This is the key abstraction - consumers never need to know about MSAL's structure!
   */
  protected async extractIdTokenInternal(): Promise<string | null> {
    try {
      await this.ensureInitialized();

      const account = this.auth.instance.getActiveAccount();
      if (!account) {
        return null;
      }

      // First try to get cached token from account
      // This avoids unnecessary iframe calls that can timeout
      if (account.idToken) {
        return account.idToken;
      }

      // If not in account, try silent token acquisition from cache only
      // Use CacheLookupPolicy.AccessToken to avoid iframe calls
      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read', 'email', 'profile'],
        account: account,
        cacheLookupPolicy: CacheLookupPolicy.AccessToken
      });

      // MSAL-specific detail: JWT is in idToken property
      return response.idToken || null;
    } catch (error) {
      console.error('[MSAL] Error extracting ID token:', error);
      return null;
    }
  }

  /**
   * Extract complete token info from MSAL
   *
   * Maps MSAL's AuthenticationResult to StandardAuthToken
   */
  protected async extractTokenInfoInternal(): Promise<StandardAuthToken | null> {
    try {
      await this.ensureInitialized();

      const account = this.auth.instance.getActiveAccount();
      if (!account) {
        return null;
      }

      // Use cache-only lookup to avoid iframe timeouts during normal token extraction
      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read', 'email', 'profile'],
        account: account,
        cacheLookupPolicy: CacheLookupPolicy.AccessToken
      });

      if (!response.idToken) {
        return null;
      }

      return {
        idToken: response.idToken,
        accessToken: response.accessToken,
        expiresAt: response.expiresOn ? response.expiresOn.getTime() : 0,
        scopes: response.scopes
      };
    } catch (error) {
      // If acquireTokenSilent fails (e.g., iframe timeout), try to use cached account data
      console.error('[MSAL] Error extracting token info:', error);

      const account = this.auth.instance.getActiveAccount();
      if (account?.idToken) {
        // Return basic token info from account if available
        return {
          idToken: account.idToken,
          expiresAt: 0, // Unknown from account alone
          scopes: []
        };
      }

      return null;
    }
  }

  /**
   * Extract user info from MSAL account
   *
   * Maps MSAL's AccountInfo structure to StandardUserInfo
   */
  protected async extractUserInfoInternal(): Promise<StandardUserInfo | null> {
    try {
      await this.ensureInitialized();

      const account = this.auth.instance.getActiveAccount();
      if (!account) {
        return null;
      }

      return this.mapMSALAccountToStandard(account);
    } catch (error) {
      console.error('[MSAL] Error extracting user info:', error);
      return null;
    }
  }

  /**
   * Refresh token using MSAL's silent token acquisition
   *
   * MSAL 5.x Best Practices:
   * - Pass account parameter for reliable silent acquisition
   * - Use CacheLookupPolicy.Default for efficient cache → refresh token → iframe chain
   * - Handle MSAL 5.x specific error codes (timed_out, no_tokens_found, etc.)
   */
  protected async refreshTokenInternal(): Promise<TokenRefreshResult> {
    try {
      await this.ensureInitialized();

      const account = this.auth.instance.getActiveAccount();
      if (!account) {
        return {
          success: false,
          error: {
            type: AuthErrorType.NO_ACTIVE_SESSION,
            message: 'No active account found',
            userMessage: 'You need to log in to continue.'
          }
        };
      }

      // MSAL 5.x: Pass account for reliable silent acquisition
      // Use Default policy for efficient cache → refresh token → iframe chain
      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read', 'email', 'profile'],
        account: account,
        cacheLookupPolicy: CacheLookupPolicy.Default
      });

      if (!response.idToken) {
        return {
          success: false,
          error: {
            type: AuthErrorType.NO_ACTIVE_SESSION,
            message: 'Token refresh succeeded but no ID token returned',
            userMessage: 'Session refresh failed. Please log in again.'
          }
        };
      }

      const token: StandardAuthToken = {
        idToken: response.idToken,
        accessToken: response.accessToken,
        expiresAt: response.expiresOn ? response.expiresOn.getTime() : 0,
        scopes: response.scopes
      };

      return {
        success: true,
        token
      };
    } catch (error) {
      console.error('[MSAL] Token refresh failed:', error);

      // Handle MSAL 5.x error codes that require user interaction
      // - timed_out: MSAL 5.x iframe timeout (replaces monitor_window_timeout from 3.x)
      // - monitor_window_timeout: Legacy MSAL 3.x iframe timeout
      // - no_tokens_found: No cached tokens available
      // - no_account_error: Account not found in cache
      // - InteractionRequiredAuthError: Server requires user interaction
      const errorCode = (error as Record<string, unknown>)?.errorCode as string | undefined;
      const interactionRequiredCodes = [
        'monitor_window_timeout',
        'timed_out',
        'no_tokens_found',
        'no_account_error',
        'login_required',
        'consent_required'
      ];

      if (interactionRequiredCodes.includes(errorCode || '') || error instanceof InteractionRequiredAuthError) {
        // Return INTERACTION_REQUIRED error - base class will call handleSessionExpiryInternal
        return {
          success: false,
          error: {
            type: AuthErrorType.INTERACTION_REQUIRED,
            message: `Silent token refresh failed - interaction required (${errorCode || 'unknown'})`,
            userMessage: 'Your session has expired. Redirecting to login...',
            originalError: error
          }
        };
      }

      return {
        success: false,
        error: this.classifyErrorInternal(error)
      };
    }
  }

  /**
   * Classify MSAL-specific errors into semantic types
   *
   * Maps MSAL error classes to AuthErrorType enum.
   * Updated for MSAL 5.x error codes.
   */
  protected classifyErrorInternal(error: unknown): StandardAuthError {
    const errorObj = error as Record<string, unknown>;
    const message = errorObj?.['message'] as string || 'Unknown error';
    const errorCode = errorObj?.['errorCode'] as string || '';

    // Check for specific MSAL error types
    if (error instanceof InteractionRequiredAuthError) {
      return {
        type: AuthErrorType.INTERACTION_REQUIRED,
        message,
        originalError: error,
        userMessage: 'Additional authentication is required. Please log in again.'
      };
    }

    if (error instanceof BrowserAuthError) {
      // Check specific error codes - MSAL 5.x codes
      if (errorCode === 'user_cancelled' || message.includes('user cancelled')) {
        return {
          type: AuthErrorType.USER_CANCELLED,
          message,
          originalError: error,
          userMessage: 'Login was cancelled.'
        };
      }

      // MSAL 5.x timeout and session errors that require interaction
      const interactionRequiredCodes = [
        'timed_out',
        'monitor_window_timeout',
        'no_tokens_found',
        'no_account_error',
        'login_required',
        'consent_required'
      ];
      if (interactionRequiredCodes.includes(errorCode)) {
        return {
          type: AuthErrorType.INTERACTION_REQUIRED,
          message,
          originalError: error,
          userMessage: 'Your session has expired. Please log in again.'
        };
      }

      return {
        type: AuthErrorType.NO_ACTIVE_SESSION,
        message,
        originalError: error,
        userMessage: 'Authentication error. Please log in again.'
      };
    }

    // Check message patterns
    if (message.includes('token') && message.includes('expired')) {
      return {
        type: AuthErrorType.TOKEN_EXPIRED,
        message,
        originalError: error,
        userMessage: 'Your session has expired. Please log in again.'
      };
    }

    if (message.includes('network') || message.includes('fetch')) {
      return {
        type: AuthErrorType.NETWORK_ERROR,
        message,
        originalError: error,
        userMessage: 'Network error. Please check your connection and try again.'
      };
    }

    if (message.includes('you need to be authorized')) {
      return {
        type: AuthErrorType.TOKEN_EXPIRED,
        message,
        originalError: error,
        userMessage: 'Your session has expired. Please log in again.'
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

  private async ensureInitialized(): Promise<void> {
    if (!this._initPromise) {
      await this.initialize();
    } else if (!this._initializationCompleted$.value) {
      await this._initPromise;
    }
  }

  /**
   * Proactively refresh tokens to extend the interaction-free period
   *
   * MSAL 5.x Best Practice: Use refreshTokenExpirationOffsetSeconds to get tokens
   * that will remain valid for a specified duration. This is called:
   * - On initialization (to ensure fresh tokens at app startup)
   * - Can be called manually before important operations
   *
   * @param account - The account to refresh tokens for
   * @param offsetSeconds - How long tokens should remain valid (default: 2 hours)
   */
  private async performProactiveRefresh(account: AccountInfo, offsetSeconds: number = 7200): Promise<void> {
    try {
      console.log(`[MSAL] Performing proactive token refresh (offset: ${offsetSeconds}s)...`);

      // Use forceRefresh with refreshTokenExpirationOffsetSeconds to get fresh tokens
      // that will be valid for at least the specified offset period
      await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read', 'email', 'profile'],
        account: account,
        forceRefresh: true,
        refreshTokenExpirationOffsetSeconds: offsetSeconds
      });

      console.log('[MSAL] Proactive token refresh successful');
    } catch (error) {
      // Don't treat proactive refresh failures as critical - the app can still
      // function with existing cached tokens until they expire
      console.warn('[MSAL] Proactive token refresh failed (will use cached tokens):', error);
      throw error; // Re-throw so caller can decide how to handle
    }
  }

  /**
   * Map MSAL AccountInfo to StandardUserInfo
   */
  private mapMSALAccountToStandard(account: AccountInfo): StandardUserInfo {
    return {
      id: account.localAccountId || account.homeAccountId,
      email: account.username || '',
      name: account.name || account.username || '',
      givenName: account.idTokenClaims?.['given_name'] as string,
      familyName: account.idTokenClaims?.['family_name'] as string,
      preferredUsername: account.username,
      emailVerified: true // MSAL doesn't provide this, assume true
    };
  }

  /**
   * Get profile picture URL from Microsoft Graph API
   *
   * MSAL requires fetching the photo from Microsoft Graph.
   * This is the key advantage of encapsulation - consumers don't need
   * to know about Graph API, they just call getProfilePictureUrl()!
   */
  protected async getProfilePictureUrlInternal(): Promise<string | null> {
    try {
      await this.ensureInitialized();

      const account = this.auth.instance.getActiveAccount();
      if (!account) {
        return null;
      }

      // Get access token for Microsoft Graph
      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read'],
        account: account,
        forceRefresh: false
      });

      if (!response.accessToken) {
        return null;
      }

      // Fetch photo from Microsoft Graph
      const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
        headers: { 'Authorization': `Bearer ${response.accessToken}` }
      });

      if (graphResponse.ok) {
        const blob = await graphResponse.blob();
        return URL.createObjectURL(blob);
      }

      return null;
    } catch (error) {
      console.error('[MSAL] Error getting profile picture:', error);
      return null;
    }
  }

  /**
   * Handle session expiry by redirecting to Microsoft login
   *
   * This method is called by the base class when silent token refresh fails
   * with INTERACTION_REQUIRED error. It redirects to Microsoft login and never returns.
   * After authentication, the app will reload and re-initialize with a fresh token.
   */
  protected async handleSessionExpiryInternal(): Promise<void> {
    console.log('[MSAL] Redirecting to Microsoft login for re-authentication...');

    // Initiate redirect authentication - page will navigate away
    this.auth.loginRedirect({
      scopes: ['User.Read', 'email', 'profile'],
      prompt: 'select_account'
    }).subscribe({
      error: (redirectError) => {
        console.error('[MSAL] Redirect initiation failed:', redirectError);
      }
    });

    // Return a promise that never resolves - page will navigate before this matters
    return new Promise<void>(() => {});
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  override getRequiredConfig(): string[] {
    return ['clientId', 'tenantId'];
  }

  override validateConfig(_config: Record<string, unknown>): boolean {
    // MSAL configuration is handled by Angular module providers
    return true;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  ngOnDestroy(): void {
    this._destroying$.next();
    this._destroying$.complete();
    this._initPromise = null;
    this._initializationCompleted$.complete();
  }
}