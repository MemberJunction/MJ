import { Injectable } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { AuthService, IdToken, User, AuthGuard, AuthConfigService, Auth0ClientService, Auth0ClientFactory, AuthClientConfig } from '@auth0/auth0-angular';
import { Observable, of } from 'rxjs';
import { AngularAuthProviderConfig } from '../IAuthProvider';

// Prevent tree-shaking by explicitly referencing the class
export function LoadMJAuth0Provider() {
  // This function ensures the class is included in the bundle
  return MJAuth0Provider;
}

@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'auth0')
export class MJAuth0Provider extends MJAuthBase {
  type = 'auth0';

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
        },
        cacheLocation: 'localstorage',
      },
    },
    {
      provide: Auth0ClientService,
      useFactory: Auth0ClientFactory.createClient,
      deps: [AuthClientConfig],
    }
  ];

  constructor(public auth: AuthService) {
    // Create a dummy config to satisfy the parent constructor if it needs it
    const config: AngularAuthProviderConfig = { type: 'auth0' };
    super(config);
    this.auth.isAuthenticated$.subscribe((loggedIn) => {
      this.updateAuthState(loggedIn);
    });
  }

  override login(options?: any): Observable<void> {
    // Auth0's loginWithRedirect executes immediately
    this.auth.loginWithRedirect(options);
    // Return an observable for backward compatibility
    return of(void 0);
  }

  public async logout(): Promise<void> {
    this.auth.logout({ logoutParams: { returnTo: document.location.origin } });
  }

  public async refresh(): Promise<Observable<any>> {
    await this.auth.getAccessTokenSilently();
    return this.auth.idTokenClaims$;
  }

  async getUser(): Promise<Observable<User | null | undefined>> {
    return this.auth.user$;
  }

  override isAuthenticated(): Observable<boolean> {
    return this.auth.isAuthenticated$;
  }

  async getUserClaims(): Promise<Observable<any>> {
    return this.auth.idTokenClaims$;
  }

  checkExpiredTokenError(error: string): boolean {
    return error?.includes('jwt expired');
  }

  // Add required methods for the new interface
  async initialize(): Promise<void> {
    // Auth0 Angular SDK handles initialization internally
    // Just subscribe to authentication state
    this.auth.isAuthenticated$.subscribe((loggedIn) => {
      this.updateAuthState(loggedIn);
    });
  }

  protected async loginInternal(options?: any): Promise<void> {
    this.auth.loginWithRedirect(options);
  }

  async getToken(): Promise<string | null> {
    try {
      const token = await this.auth.getAccessTokenSilently().toPromise();
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
