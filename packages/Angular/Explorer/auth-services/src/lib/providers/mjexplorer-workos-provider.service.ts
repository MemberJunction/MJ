import { Injectable, Inject, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { AngularAuthProviderConfig } from '../IAuthProvider';
import {
  createClient,
  getClaims,
  User,
  LoginRequiredError,
  NoSessionError,
  RefreshTimeoutError
} from '@workos-inc/authkit-js';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  AuthErrorType,
  TokenRefreshResult
} from '../auth-types';

/**
 * The AuthKit client instance type. The `@workos-inc/authkit-js` package does not export its
 * `Client` class directly, so we derive the type from `createClient`'s resolved return value.
 */
type WorkOSClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolved configuration for the WorkOS AuthKit client.
 * Provided via the `'workosConfig'` injection token (see `angularProviderFactory`).
 */
export interface WorkOSAuthConfig {
  /** WorkOS AuthKit client ID (e.g. `client_01H...`). Required. */
  clientId: string;
  /** OAuth redirect URI registered in the WorkOS dashboard. Defaults to `window.location.origin`. */
  redirectUri?: string;
  /** Override the WorkOS API hostname (rarely needed; for proxies / custom domains). */
  apiHostname?: string;
  /** Enables AuthKit dev mode (localStorage session, no third-party cookies). */
  devMode?: boolean;
}

/**
 * WorkOS (AuthKit) authentication provider — browser side.
 *
 * Wraps the vanilla-JS `@workos-inc/authkit-js` SDK behind {@link MJAuthBase} so the rest of
 * MemberJunction never sees WorkOS-specific details. AuthKit issues a JWT **access token**
 * (returned by `getAccessToken()`) that MJ sends to the GraphQL API as a Bearer token; the
 * server validates it via `@memberjunction/auth-providers`' `WorkOSProvider`.
 *
 * Unlike the Auth0/MSAL/Okta providers, AuthKit is not an Angular library — there is no module
 * to import. This provider creates the client itself in {@link initialize} using config supplied
 * through the `'workosConfig'` injection token.
 *
 * > **Email note:** `getUser()` always returns the user's email for display here, but the
 * > **access token** only carries `email` if a WorkOS JWT Template adds it. MJ resolves users by
 * > email server-side, so configuring that template is required. See `WORKOS.md` in
 * > `@memberjunction/auth-providers`.
 */
@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'workos')
export class MJWorkOSProvider extends MJAuthBase implements OnDestroy {
  static readonly PROVIDER_TYPE = 'workos';
  readonly type = MJWorkOSProvider.PROVIDER_TYPE;

  private client: WorkOSClient | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Factory function to provide the Angular dependencies required by WorkOS.
   * Stored as a static property so the factory can read it without instantiation.
   */
  static angularProviderFactory = (environment: Record<string, unknown>) => [
    {
      provide: 'workosConfig',
      useValue: {
        clientId: environment['WORKOS_CLIENTID'] as string,
        redirectUri: (environment['WORKOS_REDIRECT_URI'] as string) || window.location.origin,
        apiHostname: environment['WORKOS_API_HOSTNAME'] as string | undefined,
        devMode: (environment['WORKOS_DEV_MODE'] as boolean | undefined) ?? false
      } satisfies WorkOSAuthConfig
    }
  ];

  constructor(@Inject('workosConfig') private workosConfig: WorkOSAuthConfig) {
    const config: AngularAuthProviderConfig = {
      name: MJWorkOSProvider.PROVIDER_TYPE,
      type: MJWorkOSProvider.PROVIDER_TYPE
    };
    super(config);
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Initialize the AuthKit client. `createClient()` constructs the client AND processes any
   * pending OAuth redirect (it reads the `code` from the URL and exchanges it), so once it
   * resolves the session — if any — is already established and `getUser()` is populated.
   *
   * Idempotent and concurrency-safe: parallel callers share a single in-flight promise.
   */
  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.createAndSyncClient();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async createAndSyncClient(): Promise<void> {
    this.client = await createClient(this.workosConfig.clientId, {
      redirectUri: this.workosConfig.redirectUri,
      apiHostname: this.workosConfig.apiHostname,
      devMode: this.workosConfig.devMode,
      // Keep MJ's reactive auth state in lockstep with AuthKit's silent refresh cycle.
      onRefresh: () => this.syncSessionState(),
      onRefreshFailure: () => {
        this.updateAuthState(false);
        this.updateUserInfo(null);
      }
    });

    this.syncSessionState();
  }

  /**
   * Pushes the current AuthKit session into MJ's reactive streams.
   */
  private syncSessionState(): void {
    const user = this.client?.getUser() ?? null;
    if (user) {
      this.updateAuthState(true);
      this.updateUserInfo(this.mapWorkOSUserToStandard(user));
    } else {
      this.updateAuthState(false);
      this.updateUserInfo(null);
    }
  }

  protected async loginInternal(options?: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized();
    // signIn redirects the browser to the WorkOS hosted login page. Any caller-supplied
    // options (loginHint, organizationId, state, …) are passed straight through.
    await this.client!.signIn(options);
  }

  protected async logoutInternal(): Promise<void> {
    // signOut clears the AuthKit session and redirects to the app's configured Logout URI.
    // If there is no active session it throws NoSessionError — provide returnTo so the user is
    // still returned to the app rather than left on a dead page.
    this.updateAuthState(false);
    this.updateUserInfo(null);
    try {
      this.client?.signOut({ returnTo: this.workosConfig.redirectUri || window.location.origin });
    } catch (error) {
      // NoSessionError (no active session) — just hard-redirect home.
      if (error instanceof NoSessionError) {
        window.location.href = window.location.origin;
      } else {
        throw error;
      }
    }
  }

  async handleCallback(): Promise<void> {
    // AuthKit's createClient() processes the redirect internally during initialize().
    // This method exists for interface compatibility (mirrors the Auth0 provider).
    await this.ensureInitialized();
  }

  ngOnDestroy(): void {
    // Release the AuthKit refresh timer / listeners.
    this.client?.dispose();
    this.client = null;
  }

  // ============================================================================
  // ABSTRACT METHOD IMPLEMENTATIONS
  // ============================================================================

  /**
   * Extract the access token (a JWT) from AuthKit. `getAccessToken()` returns a valid token,
   * silently refreshing first if the current one is near expiry. Throws when there is no
   * session — we translate that to `null` so callers can treat it as "not authenticated".
   */
  protected async extractIdTokenInternal(): Promise<string | null> {
    if (!this.client) {
      return null;
    }
    try {
      return await this.client.getAccessToken();
    } catch (error) {
      if (error instanceof LoginRequiredError) {
        return null;
      }
      console.error('[WorkOS] Error extracting access token:', error);
      return null;
    }
  }

  /**
   * Extract complete token info. The expiry comes from the JWT's `exp` claim, decoded with the
   * SDK's `getClaims()` helper.
   */
  protected async extractTokenInfoInternal(): Promise<StandardAuthToken | null> {
    const accessToken = await this.extractIdTokenInternal();
    if (!accessToken) {
      return null;
    }

    let expiresAt = 0;
    try {
      const claims = getClaims(accessToken);
      expiresAt = claims.exp ? claims.exp * 1000 : 0; // exp is seconds → milliseconds
    } catch (error) {
      console.warn('[WorkOS] Could not decode access token claims:', error);
    }

    return {
      idToken: accessToken,
      accessToken,
      expiresAt
    };
  }

  /**
   * Extract user info from AuthKit's in-memory user (always populated when authenticated,
   * regardless of which claims the access token carries).
   */
  protected async extractUserInfoInternal(): Promise<StandardUserInfo | null> {
    const user = this.client?.getUser() ?? null;
    return user ? this.mapWorkOSUserToStandard(user) : null;
  }

  /**
   * Force a token refresh through AuthKit's refresh-token rotation.
   */
  protected async refreshTokenInternal(): Promise<TokenRefreshResult> {
    if (!this.client) {
      return {
        success: false,
        error: {
          type: AuthErrorType.NO_ACTIVE_SESSION,
          message: 'WorkOS client not initialized',
          userMessage: 'You need to log in to continue.'
        }
      };
    }

    try {
      const accessToken = await this.client.getAccessToken({ forceRefresh: true });
      this.syncSessionState();

      let expiresAt = 0;
      try {
        const claims = getClaims(accessToken);
        expiresAt = claims.exp ? claims.exp * 1000 : 0;
      } catch {
        // exp decode is best-effort; a missing value just means the consumer can't pre-empt expiry.
      }

      return {
        success: true,
        token: { idToken: accessToken, accessToken, expiresAt }
      };
    } catch (error) {
      return {
        success: false,
        error: this.classifyErrorInternal(error)
      };
    }
  }

  /**
   * Map WorkOS / AuthKit SDK errors to semantic `AuthErrorType` values.
   */
  protected classifyErrorInternal(error: unknown): StandardAuthError {
    if (error instanceof LoginRequiredError || error instanceof NoSessionError) {
      return {
        type: AuthErrorType.NO_ACTIVE_SESSION,
        message: (error as Error).message,
        originalError: error,
        userMessage: 'You need to log in to continue.'
      };
    }

    // RefreshTimeoutError is exported; its parent `RefreshError` is not, so we also match by
    // constructor name to catch any non-timeout refresh failure.
    if (error instanceof RefreshTimeoutError || (error as Error)?.name === 'RefreshError') {
      return {
        type: AuthErrorType.TOKEN_EXPIRED,
        message: (error as Error).message,
        originalError: error,
        userMessage: 'Your session has expired. Please log in again.'
      };
    }

    const message = (error as { message?: string })?.message || 'Unknown error';
    if (message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch')) {
      return {
        type: AuthErrorType.NETWORK_ERROR,
        message,
        originalError: error,
        userMessage: 'Network error. Please check your connection and try again.'
      };
    }

    return {
      type: AuthErrorType.UNKNOWN_ERROR,
      message,
      originalError: error,
      userMessage: 'An unexpected error occurred. Please try again.'
    };
  }

  /**
   * WorkOS includes the profile picture URL on the user object — no extra API call needed.
   */
  protected async getProfilePictureUrlInternal(): Promise<string | null> {
    return this.client?.getUser()?.profilePictureUrl ?? null;
  }

  /**
   * No-op. WorkOS uses rotating refresh tokens, so it doesn't need interactive
   * re-authentication when an access token expires; if refresh fails the base class surfaces
   * the error and the user re-logs in manually.
   */
  protected async handleSessionExpiryInternal(): Promise<void> {
    return;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.client) {
      await this.initialize();
    }
  }

  /**
   * Map a WorkOS `User` to the framework-standard `StandardUserInfo`.
   * WorkOS exposes `firstName`/`lastName` as `string | null`; we normalize null → undefined.
   */
  private mapWorkOSUserToStandard(user: User): StandardUserInfo {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return {
      id: user.id,
      email: user.email,
      name: fullName || user.email,
      givenName: user.firstName ?? undefined,
      familyName: user.lastName ?? undefined,
      preferredUsername: user.email,
      pictureUrl: user.profilePictureUrl ?? undefined,
      emailVerified: user.emailVerified
    };
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  override getRequiredConfig(): string[] {
    return ['clientId'];
  }

  override validateConfig(config: Record<string, unknown>): boolean {
    // The real config arrives via the 'workosConfig' injection token; the only hard
    // requirement is a clientId.
    return !!this.workosConfig?.clientId || !!config['clientId'];
  }
}
