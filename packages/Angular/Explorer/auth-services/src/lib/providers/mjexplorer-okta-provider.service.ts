import { Injectable, Inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { AngularAuthProviderConfig } from '../IAuthProvider';
import OktaAuth, { OktaAuthOptions, IDToken, AccessToken } from '@okta/okta-auth-js';

// Prevent tree-shaking by explicitly referencing the class
export function LoadMJOktaProvider() {
  // This function ensures the class is included in the bundle
  return MJOktaProvider;
}

/**
 * Okta authentication provider for MemberJunction Explorer
 */
@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'okta')
export class MJOktaProvider extends MJAuthBase {
  type = 'okta';
  private oktaAuth: OktaAuth;
  private userClaims$ = new BehaviorSubject<IDToken | null>(null);
  
  /**
   * Factory function to provide Angular dependencies required by Okta
   * Stored as a static property for the factory to access without instantiation
   */
  static angularProviderFactory = (environment: any) => [
    {
      provide: 'oktaConfig',
      useValue: {
        clientId: environment.OKTA_CLIENTID,
        domain: environment.OKTA_DOMAIN,
        issuer: environment.OKTA_ISSUER || `https://${environment.OKTA_DOMAIN}/oauth2/default`,
        redirectUri: environment.OKTA_REDIRECT_URI || window.location.origin,
        scopes: environment.OKTA_SCOPES || ['openid', 'profile', 'email']
      }
    }
  ];
  
  constructor(@Inject('oktaConfig') private oktaConfig: OktaAuthOptions & { domain?: string }) {
    // Create config for parent constructor
    const config: AngularAuthProviderConfig = { type: 'okta' };
    super(config);
    
    // Build configuration with defaults first, then spread oktaConfig to override
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
    this.oktaAuth.authStateManager.subscribe((authState: any) => {
      this.updateAuthState(authState.isAuthenticated || false);
      
      if (authState.isAuthenticated && authState.idToken) {
        this.userClaims$.next(authState.idToken as IDToken);
      } else {
        this.userClaims$.next(null);
      }
    });
  }

  override login(options?: any): Observable<void> {
    // Convert Promise to Observable
    return from(this.loginAsync(options));
  }

  private async loginAsync(options?: any): Promise<void> {
    try {
      // Check if we're in a redirect callback
      if (this.oktaAuth.isLoginRedirect()) {
        await this.oktaAuth.handleLoginRedirect();
        return;
      }

      // Start the login flow
      await this.oktaAuth.signInWithRedirect({
        originalUri: options?.targetUrl || '/',
        ...options
      });
    } catch (error) {
      console.error('Okta login error:', error);
      throw error;
    }
  }

  async logout(): Promise<any> {
    try {
      // Clear local tokens
      await this.oktaAuth.signOut({
        postLogoutRedirectUri: window.location.origin
      });
      
      this.updateAuthState(false);
      this.userClaims$.next(null);
    } catch (error) {
      console.error('Okta logout error:', error);
      throw error;
    }
  }

  async refresh(): Promise<Observable<any>> {
    try {
      // Refresh tokens
      await this.oktaAuth.tokenManager.renew('idToken');
      await this.oktaAuth.tokenManager.renew('accessToken');
      
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      if (idToken) {
        this.userClaims$.next(idToken);
      }
      
      return this.userClaims$.asObservable();
    } catch (error) {
      console.error('Okta token refresh error:', error);
      throw error;
    }
  }

  override isAuthenticated(): Observable<boolean> {
    // Convert Promise to Observable
    return from(this.isAuthenticatedAsync());
  }

  private async isAuthenticatedAsync(): Promise<boolean> {
    try {
      const authState = await this.oktaAuth.authStateManager.getAuthState();
      this.updateAuthState(authState?.isAuthenticated || false);
      return authState?.isAuthenticated || false;
    } catch (error) {
      console.error('Okta authentication check error:', error);
      return false;
    }
  }

  async getUser(): Promise<any> {
    try {
      if (!await this.isAuthenticated()) {
        return null;
      }

      // Get user info from Okta
      const user = await this.oktaAuth.getUser();
      return user;
    } catch (error) {
      console.error('Okta get user error:', error);
      return null;
    }
  }

  async getUserClaims(): Promise<Observable<any>> {
    try {
      const authState = await this.oktaAuth.authStateManager.getAuthState();
      
      if (authState?.isAuthenticated && authState.idToken) {
        this.userClaims$.next(authState.idToken as IDToken);
      }
      
      return this.userClaims$.asObservable();
    } catch (error) {
      console.error('Okta get user claims error:', error);
      return from([null]);
    }
  }

  checkExpiredTokenError(error: string): boolean {
    // Check for Okta-specific token expiration errors
    const errorLower = error.toLowerCase();
    return errorLower.includes('token expired') ||
           errorLower.includes('invalid_token') ||
           errorLower.includes('token_expired') ||
           errorLower.includes('unauthorized');
  }

  /**
   * Handle callback after redirect from Okta
   */
  async handleCallback(): Promise<void> {
    try {
      if (this.oktaAuth.isLoginRedirect()) {
        await this.oktaAuth.handleLoginRedirect();
      }
    } catch (error) {
      console.error('Okta callback handling error:', error);
      throw error;
    }
  }

  /**
   * Get the access token for API calls
   */
  async getAccessToken(): Promise<string | undefined> {
    try {
      const accessToken = await this.oktaAuth.tokenManager.get('accessToken') as AccessToken;
      return accessToken?.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      return undefined;
    }
  }

  /**
   * Get the ID token
   */
  async getIdToken(): Promise<string | undefined> {
    try {
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      return idToken?.idToken;
    } catch (error) {
      console.error('Error getting ID token:', error);
      return undefined;
    }
  }

  // Add required methods for the new interface
  async initialize(): Promise<void> {
    // Check if we're returning from a redirect
    if (this.oktaAuth.isLoginRedirect()) {
      await this.handleCallback();
    }
    // Check authentication status
    const isAuthenticated = await this.oktaAuth.isAuthenticated();
    this.updateAuthState(isAuthenticated);
  }

  protected async loginInternal(options?: any): Promise<void> {
    await this.loginAsync(options);
  }

  async getToken(): Promise<string | null> {
    const token = await this.getAccessToken();
    return token || null;
  }

  getRequiredConfig(): string[] {
    return ['clientId', 'domain'];
  }

  validateConfig(_config: any): boolean {
    // Prefix with underscore to indicate intentionally unused
    return _config.clientId && (_config.domain || _config.issuer);
  }
}