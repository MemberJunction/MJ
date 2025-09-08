import { Injectable, Inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { AngularAuthProviderConfig } from '../IAuthProvider';
import OktaAuth, { OktaAuthOptions, IDToken, AccessToken } from '@okta/okta-auth-js';

// Prevent tree-shaking by explicitly referencing the class
export function LoadMJOktaProvider() {
}

/**
 * Okta authentication provider for MemberJunction Explorer
 */
@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'okta')
export class MJOktaProvider extends MJAuthBase {
  static readonly PROVIDER_TYPE = 'okta';
  type = MJOktaProvider.PROVIDER_TYPE;
  private oktaAuth: OktaAuth;
  private userClaims$ = new BehaviorSubject<any>(null);
  private isRefreshing = false; // Flag to prevent re-triggering during refresh
  
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
    const config: AngularAuthProviderConfig = { 
      name: MJOktaProvider.PROVIDER_TYPE, 
      type: MJOktaProvider.PROVIDER_TYPE 
    };
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
      
      // Don't update claims if we're in the middle of a refresh operation
      // to avoid triggering handleLogin in app.component
      if (!this.isRefreshing) {
        if (authState.isAuthenticated && authState.idToken) {
          this.userClaims$.next(authState.idToken as IDToken);
        } else {
          this.userClaims$.next(null);
        }
      }
    });
    
    // Initialize Okta authentication state
    this.initializeOkta();
  }
  
  private async initializeOkta() {
    // Start with unauthenticated state
    this.authenticated = false;
    this.updateAuthState(false);
    
    // Check URL for logout indicator
    const urlParams = new URLSearchParams(window.location.search);
    const isPostLogout = urlParams.has('logout');
    
    if (isPostLogout) {
      // We're returning from a logout, clear the URL and stay logged out
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    // Check if we're returning from a login redirect
    if (this.oktaAuth.isLoginRedirect()) {
      try {
        await this.oktaAuth.handleLoginRedirect();
        
        // After handling redirect, check if we're authenticated
        const authState = await this.oktaAuth.authStateManager.getAuthState();
        
        if (authState?.isAuthenticated) {
          this.updateAuthState(true);
          this.authenticated = true;
          this.isAuthenticated$.next(true);
          
          // Get and emit the ID token with proper format
          const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
          const accessToken = await this.oktaAuth.tokenManager.get('accessToken') as AccessToken;
          if (idToken) {
            const claims = {
              ...idToken.claims,
              idToken: idToken.idToken, // The actual token string
              accessToken: accessToken?.accessToken,
            };
            this.userClaims$.next(claims);
          }
        }
      } catch (error) {
        console.error('Okta initialization redirect handling error:', error);
      }
      return; // Don't check for existing session after handling redirect
    }
    
    // Only check for existing session if not a redirect
    // This prevents auto-login after logout
    try {
      const isAuthenticated = this.oktaAuth ? await this.oktaAuth.isAuthenticated() : false;
      
      if (isAuthenticated && this.oktaAuth) {
        // Double-check we actually have valid tokens
        const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
        const accessToken = await this.oktaAuth.tokenManager.get('accessToken') as AccessToken;
        
        if (idToken && idToken.idToken) {
          // Format claims to match what app.component expects
          const claims = {
            ...idToken.claims,
            idToken: idToken.idToken, // The actual token string
            accessToken: accessToken?.accessToken,
          };
          this.userClaims$.next(claims);
          
          // Ensure the authenticated state is properly set
          this.authenticated = true;
          this.updateAuthState(true);
          
          // Force the BehaviorSubject to emit the new value
          this.isAuthenticated$.next(true);
        } else {
          // No valid tokens, stay logged out
          this.authenticated = false;
          this.updateAuthState(false);
        }
      }
    } catch (error) {
      // If there's an error checking authentication, stay logged out
      console.warn('Error checking Okta authentication status:', error);
    }
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
      // Clear the local authentication state immediately
      this.updateAuthState(false);
      this.authenticated = false;
      this.isAuthenticated$.next(false);
      this.userClaims$.next(null);
      
      // Clear all tokens from local storage
      await this.oktaAuth.tokenManager.clear();
      
      // Get the ID token to pass to logout (needed for proper logout)
      let idToken: string | undefined;
      try {
        const token = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
        idToken = token?.idToken;
      } catch {
        // Token might already be cleared
      }
      
      // Sign out from Okta completely
      // The clearTokensBeforeRedirect ensures tokens are cleared before redirect
      await this.oktaAuth.signOut({
        postLogoutRedirectUri: window.location.origin,
        clearTokensBeforeRedirect: true
      });
      
      // Note: The signOut call will redirect the browser, so code after this won't execute
    } catch (error) {
      console.error('Okta logout error:', error);
      // If logout fails, at least clear local state and reload
      window.location.href = window.location.origin;
    }
  }

  async refresh(): Promise<Observable<any>> {
    try {
      // Set flag to prevent authStateManager from updating userClaims$
      this.isRefreshing = true;
      
      // First check if we're authenticated
      const isAuthenticated = await this.oktaAuth.isAuthenticated();
      
      if (!isAuthenticated) {
        // Not authenticated, can't refresh - return empty observable
        console.warn('Cannot refresh tokens - user is not authenticated');
        this.isRefreshing = false;
        // Don't update the claims observable to avoid triggering handleLogin
        return from([null]);
      }
      
      // Check if tokens exist and are not expired
      const idToken = await this.oktaAuth.tokenManager.get('idToken') as IDToken;
      const accessToken = await this.oktaAuth.tokenManager.get('accessToken') as AccessToken;
      
      if (!idToken || !accessToken) {
        console.warn('No tokens available to refresh');
        this.isRefreshing = false;
        // Don't update the claims observable to avoid triggering handleLogin
        return from([null]);
      }
      
      // Attempt to renew tokens using the refresh token if available
      // Note: For PKCE flow (which we're using), Okta will try to use refresh tokens if configured
      // If refresh tokens aren't available, it will attempt silent authentication via iframe
      const renewedTokens = await this.oktaAuth.token.renewTokens();
      
      // Store the renewed tokens - this will trigger authStateManager but we'll ignore it
      if (renewedTokens.idToken) {
        this.oktaAuth.tokenManager.setTokens(renewedTokens);
        
        // Update user claims with renewed token - but DON'T emit to userClaims$ 
        // to avoid triggering handleLogin in app.component
        const newIdToken = renewedTokens.idToken as IDToken;
        const claims = {
          ...newIdToken.claims,
          idToken: newIdToken.idToken,
          accessToken: renewedTokens.accessToken?.accessToken,
        };
        
        // Wait a moment before resetting the flag to ensure authStateManager event is handled
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reset flag after tokens are set
        this.isRefreshing = false;
        
        // Return the claims directly without updating the BehaviorSubject
        // This prevents the app component from re-initializing GraphQL
        return from([claims]);
      }
      
      this.isRefreshing = false;
      return from([null]);
    } catch (error: any) {
      console.error('Okta token refresh error:', error);
      this.isRefreshing = false; // Reset flag on error
      
      // Check if the error is due to expired session or no prompt allowed
      if (error?.errorCode === 'login_required' || 
          error?.message?.includes('not to prompt') ||
          error?.message?.includes('login_required')) {
        // Session has expired, user needs to re-authenticate
        console.warn('Session expired - user needs to re-authenticate');
        
        // Don't update the claims observable to avoid triggering handleLogin
        return from([null]);
      }
      
      // For other errors, still throw
      throw error;
    }
  }

  override isAuthenticated(): Observable<boolean> {
    // Return the BehaviorSubject as an observable to ensure consistency
    // This way all consumers get the same state
    return this.isAuthenticated$.asObservable();
  }

  async getUser(): Promise<any> {
    try {
      const isAuth = await this.oktaAuth.isAuthenticated();
      if (!isAuth) {
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
        const idToken = authState.idToken as IDToken;
        // Format the claims to match what the app expects
        // The app.component expects claims.idToken to contain the actual token string
        const claims = {
          ...idToken.claims,
          idToken: idToken.idToken, // Add the actual token string
          accessToken: authState.accessToken?.accessToken,
        };
        this.userClaims$.next(claims);
      } else {
        this.userClaims$.next(null);
      }
      
      return this.userClaims$.asObservable();
    } catch (error) {
      console.error('Okta get user claims error:', error);
      return from([null]);
    }
  }

  checkExpiredTokenError(error: string): boolean {
    // Check for Okta-specific token expiration errors
    if (!error || typeof error !== 'string') {
      return false;
    }
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
        
        // After handling redirect, check if we're authenticated
        const authState = await this.oktaAuth.authStateManager.getAuthState();
        if (authState?.isAuthenticated) {
          // Do a controlled reload after successful login
          // This ensures the app fully reinitializes with the authenticated state
          setTimeout(() => {
            window.location.href = window.location.origin;
          }, 100);
        }
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
      try {
        await this.oktaAuth.handleLoginRedirect();
        
        // After handling redirect, check if we're authenticated
        const authState = await this.oktaAuth.authStateManager.getAuthState();
        if (authState?.isAuthenticated) {
          this.updateAuthState(true);
          
          // Do a controlled reload after successful login
          // This ensures the app fully reinitializes with the authenticated state
          setTimeout(() => {
            window.location.href = window.location.origin;
          }, 100);
          return; // Exit early since we're reloading
        }
      } catch (error) {
        console.error('Okta initialization redirect handling error:', error);
      }
    }
    
    // Check authentication status
    const isAuthenticated = this.oktaAuth ? await this.oktaAuth.isAuthenticated() : false;
    this.updateAuthState(isAuthenticated);
  }

  protected async loginInternal(options?: any): Promise<void> {
    await this.loginAsync(options);
  }

  async getToken(): Promise<string | null> {
    // For Okta, we need to return the ID token (not access token) for backend authentication
    // The ID token contains the user claims that the backend expects
    const idToken = await this.getIdToken();
    return idToken || null;
  }

  getRequiredConfig(): string[] {
    return ['clientId', 'domain'];
  }

  validateConfig(_config: any): boolean {
    // Prefix with underscore to indicate intentionally unused
    return _config.clientId && (_config.domain || _config.issuer);
  }
}