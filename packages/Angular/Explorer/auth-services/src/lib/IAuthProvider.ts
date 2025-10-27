import { Observable } from 'rxjs';
import { AuthProviderConfig } from '@memberjunction/global';

// Create an alias for Angular-specific config that extends the base
export interface AngularAuthProviderConfig extends AuthProviderConfig {
  // Angular-specific extensions can be added here if needed
}

/**
 * Interface for Angular authentication providers
 * Mirrors the backend IAuthProvider pattern for consistency
 */
export interface IAngularAuthProvider {
  /**
   * Provider type identifier (e.g., 'msal', 'auth0', 'okta')
   */
  type: string;

  /**
   * Initialize the authentication provider
   */
  initialize(): Promise<void>;

  /**
   * Login the user
   */
  login(options?: any): Observable<void> | Promise<void>;

  /**
   * Logout the user
   */
  logout(): Promise<void>;

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): Observable<boolean>;

  /**
   * Get the current access token
   */
  getToken(): Promise<string | null>;

  /**
   * Get user profile information
   */
  getUserProfile(): Observable<any>;

  /**
   * Get user email
   */
  getUserEmail(): Observable<string>;

  /**
   * Handle callback after redirect
   */
  handleCallback(): Promise<void>;

  /**
   * Get provider-specific configuration requirements
   */
  getRequiredConfig(): string[];

  /**
   * Validate provider configuration
   */
  validateConfig(config: any): boolean;
}
