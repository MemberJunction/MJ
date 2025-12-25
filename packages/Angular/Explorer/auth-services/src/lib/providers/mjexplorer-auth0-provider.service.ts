import { Injectable } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { AuthService, IdToken, User, AuthGuard, AuthConfigService, Auth0ClientService, Auth0ClientFactory, AuthClientConfig } from '@auth0/auth0-angular';
import { Observable, of, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AngularAuthProviderConfig } from '../IAuthProvider';

// Prevent tree-shaking by explicitly referencing the class
export function LoadMJAuth0Provider() {
}

@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'auth0')
export class MJAuth0Provider extends MJAuthBase {
  static readonly PROVIDER_TYPE = 'auth0';
  type = MJAuth0Provider.PROVIDER_TYPE;
  private _initialized = false;

  /**
   * Factory function to provide Angular dependencies required by Auth0
   * Stored as a static property for the factory to access without instantiation
   */
  static angularProviderFactory = (environment: any) => [
    AuthService,
    AuthGuard,
    {
      provide: AuthConfigService,
      useValue: {
        domain: environment.AUTH0_DOMAIN,
        clientId: environment.AUTH0_CLIENTID,
        authorizationParams: {
          redirect_uri: window.location.origin,
          // No audience parameter - uses ID tokens (matches pre-refactor behavior)
          // ID tokens have aud=clientId by default and contain user claims
        },
        cacheLocation: 'localstorage',
        // Enable refresh tokens so we can refresh without relying on Auth0 session cookies
        useRefreshTokens: true,
        // Use rotating refresh tokens for better security
        useRefreshTokensFallback: true,
      },
    },
    {
      provide: Auth0ClientService,
      useFactory: Auth0ClientFactory.createClient,
      deps: [AuthClientConfig],
    }
  ];

  constructor(public auth: AuthService) {
    const config: AngularAuthProviderConfig = { 
      name: MJAuth0Provider.PROVIDER_TYPE, 
      type: MJAuth0Provider.PROVIDER_TYPE 
    };
    super(config);
    // Defer subscription to avoid blocking app startup
  }

  override login(options?: any): Observable<void> {
    // Ensure initialized before login
    this.ensureInitialized();
    // Auth0's loginWithRedirect executes immediately
    this.auth.loginWithRedirect(options);
    // Return an observable for backward compatibility
    return of(void 0);
  }
  
  private async ensureInitialized(): Promise<void> {
    if (!this._initialized) {
      await this.initialize();
    }
  }

  public async logout(): Promise<void> {
    this.auth.logout({ logoutParams: { returnTo: document.location.origin } });
  }

  public async refresh(): Promise<Observable<any>> {
    try {
      console.log('[Auth0] refresh() - Attempting to refresh session...');

      // Force token refresh using refresh tokens (if available) or silent auth
      // ignoreCache forces fetching new tokens instead of returning cached ones
      await firstValueFrom(this.auth.getAccessTokenSilently({
        cacheMode: 'off',
        authorizationParams: {
          ignoreCache: true
        }
      }));

      console.log('[Auth0] refresh() - getAccessTokenSilently completed');

      // Small delay to ensure Auth0 SDK has updated idTokenClaims$ observable
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get fresh ID token claims after session refresh
      const freshClaims = await firstValueFrom(this.auth.idTokenClaims$);

      console.log('[Auth0] refresh() - Got fresh ID token', {
        exp: freshClaims?.exp,
        expiryDate: freshClaims?.exp ? new Date(freshClaims.exp * 1000).toISOString() : 'N/A'
      });

      // Return the fresh claims
      return of(freshClaims);
    } catch (error) {
      console.error('[Auth0] refresh() - Session refresh failed:', error);
      // Re-throw to trigger re-login
      throw error;
    }
  }

  async getUser(): Promise<Observable<User | null | undefined>> {
    return this.auth.user$;
  }

  override isAuthenticated(): Observable<boolean> {
    // Don't initialize just for checking auth state
    // Auth0 SDK handles this internally
    return this.auth.isAuthenticated$;
  }

  async getUserClaims(): Promise<Observable<any>> {
    await this.ensureInitialized();

    console.log('[Auth0] getUserClaims: Getting ID token claims...');

    // Get ID token claims (matches pre-refactor behavior)
    // These always contain user information
    const idTokenClaims = await firstValueFrom(this.auth.idTokenClaims$);

    console.log('[Auth0] Got ID token claims');

    // Return claims with __raw containing the JWT string
    return of(idTokenClaims);
  }

  checkExpiredTokenError(error: string): boolean {
    return error?.includes('jwt expired');
  }

  // Add required methods for the new interface
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }
    
    // Auth0 Angular SDK handles initialization internally
    // Just subscribe to authentication state once
    this.auth.isAuthenticated$.subscribe((loggedIn) => {
      this.updateAuthState(loggedIn);
    });
    
    this._initialized = true;
  }

  protected async loginInternal(options?: any): Promise<void> {
    this.auth.loginWithRedirect(options);
  }

  async getToken(): Promise<string | null> {
    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());
      return token || null;
    } catch (error) {
      console.error('Error getting Auth0 token:', error);
      return null;
    }
  }

  async handleCallback(): Promise<void> {
    // Auth0 Angular SDK handles callbacks internally
    // This method is here for interface compatibility
  }

  getRequiredConfig(): string[] {
    return ['clientId', 'domain'];
  }

  validateConfig(_config: any): boolean {
    // Auth0 configuration is handled by Angular module providers
    // Prefix with underscore to indicate intentionally unused
    return true;
  }
}
