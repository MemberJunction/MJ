import { Injectable, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { BehaviorSubject, Observable, Subject, catchError, filter, from, map, of, throwError, takeUntil, take, firstValueFrom } from 'rxjs';
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

// Prevent tree-shaking by explicitly referencing the class
export function LoadMJMSALProvider() {
}

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
          storeAuthStateInCookie: false,
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
    await this.auth.instance.initialize();

    // Handle redirect immediately after initialization
    const redirectResponse = await this.auth.instance.handleRedirectPromise();

    if (redirectResponse && redirectResponse.account) {
      // User just logged in via redirect
      this.auth.instance.setActiveAccount(redirectResponse.account);
      this.updateAuthState(true);

      // Update user info from account
      const userInfo = this.mapMSALAccountToStandard(redirectResponse.account);
      this.updateUserInfo(userInfo);

      this._initializationCompleted$.next(true);
    } else {
      // Set active account if we have one from cache
      const accounts = this.auth.instance.getAllAccounts();

      if (accounts.length > 0) {
        this.auth.instance.setActiveAccount(accounts[0]);
        this.updateAuthState(true);

        // Update user info from cached account
        const userInfo = this.mapMSALAccountToStandard(accounts[0]);
        this.updateUserInfo(userInfo);

        this._initializationCompleted$.next(true);
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

      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read', 'email', 'profile'],
        account: account,
        forceRefresh: false
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

      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read', 'email', 'profile'],
        account: account,
        forceRefresh: false
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
      console.error('[MSAL] Error extracting token info:', error);
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
   * Uses acquireTokenSilent with forceRefresh to get new tokens
   */
  protected async refreshTokenInternal(): Promise<TokenRefreshResult> {
    try {
      console.log('[MSAL] Attempting to refresh token...');

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

      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read', 'email', 'profile'],
        account: account,
        cacheLookupPolicy: CacheLookupPolicy.RefreshTokenAndNetwork
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

      console.log('[MSAL] Token refresh successful', {
        expiresOn: response.expiresOn?.toISOString()
      });

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

      return {
        success: false,
        error: this.classifyErrorInternal(error)
      };
    }
  }

  /**
   * Classify MSAL-specific errors into semantic types
   *
   * Maps MSAL error classes to AuthErrorType enum
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
      // Check specific error codes
      if (errorCode === 'user_cancelled' || message.includes('user cancelled')) {
        return {
          type: AuthErrorType.USER_CANCELLED,
          message,
          originalError: error,
          userMessage: 'Login was cancelled.'
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