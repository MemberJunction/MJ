import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { IAngularAuthProvider, AngularAuthProviderConfig } from './IAuthProvider';

/**
 * Base class for Angular authentication providers
 * Provides common functionality and enforces the provider interface
 */
@Injectable()
export abstract class MJAuthBase implements IAngularAuthProvider {
  protected config: AngularAuthProviderConfig;
  protected isAuthenticated$ = new BehaviorSubject<boolean>(false);
  protected userProfile$ = new BehaviorSubject<any>(null);
  protected userEmail$ = new BehaviorSubject<string>('');

  private _initialPath: string | null = null;
  private _initialSearch: string | null = null;
  /**
   * Contains the initial path from window.location.pathname before any work was done by auth services
   */
  get initialPath(): string | null {
    return this._initialPath;
  }
  /**
   * Contains the initial search/query string from window.location.search before any work was done by auth services
   */
  get initialSearch(): string | null {
    return this._initialSearch;
  }

  abstract type: string;

  constructor(config: AngularAuthProviderConfig) {
    this.config = config;
    this._initialPath = window.location.pathname;
    this._initialSearch = window.location.search;
  }

  /**
   * Initialize the authentication provider
   * Override in subclasses to setup provider-specific initialization
   */
  abstract initialize(): Promise<void>;

  /**
   * Login the user - internal implementation
   * Override to implement provider-specific login flow
   */
  protected abstract loginInternal(options?: any): Promise<void>;

  /**
   * Login the user - public API that returns Observable for backward compatibility
   */
  login(options?: any): Observable<void> {
    return from(this.loginInternal(options));
  }

  /**
   * Logout the user
   * Override to implement provider-specific logout flow
   */
  abstract logout(): Promise<void>;

  /**
   * Get the current access token
   * Override to retrieve token from provider-specific storage
   */
  abstract getToken(): Promise<string | null>;

  /**
   * Handle callback after redirect
   * Override to process provider-specific callback logic
   */
  abstract handleCallback(): Promise<void>;

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): Observable<boolean> {
    return this.isAuthenticated$.asObservable();
  }

  /**
   * Get user profile information
   */
  getUserProfile(): Observable<any> {
    return this.userProfile$.asObservable();
  }

  /**
   * Get user email
   */
  getUserEmail(): Observable<string> {
    return this.userEmail$.asObservable();
  }

  /**
   * Get provider-specific configuration requirements
   * Override to specify required config fields
   */
  getRequiredConfig(): string[] {
    return ['clientId'];
  }

  /**
   * Validate provider configuration
   * Override to add provider-specific validation
   */
  validateConfig(config: any): boolean {
    const requiredFields = this.getRequiredConfig();
    return requiredFields.every(field => config[field] !== undefined && config[field] !== '');
  }

  /**
   * Helper method to update authentication state
   */
  protected updateAuthState(isAuthenticated: boolean): void {
    this.isAuthenticated$.next(isAuthenticated);
  }

  /**
   * Helper method to update user profile
   */
  protected updateUserProfile(profile: any): void {
    this.userProfile$.next(profile);
    if (profile?.email) {
      this.userEmail$.next(profile.email);
    }
  }

  // Backward compatibility methods for existing code
  
  /**
   * Legacy property for authentication state
   */
  get authenticated(): boolean {
    return this.isAuthenticated$.value;
  }

  /**
   * Legacy setter for authentication state
   * Used by MJExplorer for backward compatibility
   */
  set authenticated(value: boolean) {
    this.updateAuthState(value);
  }

  /**
   * Legacy method to get user
   */
  async getUser(): Promise<any> {
    return this.userProfile$.value;
  }

  /**
   * Legacy method to get user claims
   */
  async getUserClaims(): Promise<Observable<any>> {
    return this.userProfile$.asObservable();
  }

  /**
   * Legacy method to check expired token error
   */
  checkExpiredTokenError(error: string): boolean {
    // Check for common token expiration error messages
    return error?.toLowerCase().includes('expired') || 
           error?.toLowerCase().includes('invalid token') ||
           error?.toLowerCase().includes('unauthorized');
  }

  /**
   * Legacy refresh method
   */
  async refresh(): Promise<Observable<any>> {
    // Try to get a new token
    await this.getToken();
    return this.userProfile$.asObservable();
  }
}
