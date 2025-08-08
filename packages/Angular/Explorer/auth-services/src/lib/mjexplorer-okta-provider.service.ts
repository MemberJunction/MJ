import { Injectable, Inject } from '@angular/core';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import OktaAuth, { OktaAuthOptions, TokenManager, IDToken } from '@okta/okta-auth-js';

/**
 * Okta authentication provider for MemberJunction Explorer
 */
@Injectable({
  providedIn: 'root'
})
export class MJOktaProvider extends MJAuthBase {
  private oktaAuth: OktaAuth;
  private userClaims$ = new BehaviorSubject<IDToken | null>(null);
  
  constructor(@Inject('oktaConfig') private config: OktaAuthOptions) {
    super();
    
    this.oktaAuth = new OktaAuth({
      issuer: config.issuer || `https://${config.domain}/oauth2/default`,
      clientId: config.clientId,
      redirectUri: config.redirectUri || window.location.origin + '/callback',
      scopes: config.scopes || ['openid', 'profile', 'email'],
      pkce: true, // Use PKCE for security
      ...config
    });

    // Listen for token events
    this.oktaAuth.authStateManager.subscribe((authState) => {
      this.setAuthenticated(authState.isAuthenticated || false);
      
      if (authState.isAuthenticated && authState.idToken) {
        this.userClaims$.next(authState.idToken as IDToken);
      } else {
        this.userClaims$.next(null);
      }
    });
  }

  async login(options?: any): Promise<any> {
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
      
      this.setAuthenticated(false);
      this.userClaims$.next(null);
    } catch (error) {
      console.error('Okta logout error:', error);
      throw error;
    }
  }

  async refresh(): Promise<Observable<any>> {
    try {
      // Refresh tokens
      const tokenManager: TokenManager = this.oktaAuth.tokenManager;
      await tokenManager.renew('idToken');
      await tokenManager.renew('accessToken');
      
      const idToken = await tokenManager.get('idToken');
      if (idToken && idToken.value) {
        this.userClaims$.next(idToken as IDToken);
      }
      
      return this.userClaims$.asObservable();
    } catch (error) {
      console.error('Okta token refresh error:', error);
      throw error;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const authState = await this.oktaAuth.authStateManager.getAuthState();
      this.setAuthenticated(authState?.isAuthenticated || false);
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
      const accessToken = await this.oktaAuth.tokenManager.get('accessToken');
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
      const idToken = await this.oktaAuth.tokenManager.get('idToken');
      return idToken?.idToken;
    } catch (error) {
      console.error('Error getting ID token:', error);
      return undefined;
    }
  }
}