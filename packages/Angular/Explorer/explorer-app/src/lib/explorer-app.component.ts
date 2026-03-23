/**
 * MemberJunction Explorer Application Component
 *
 * Complete branded entry point for Explorer-style applications.
 * Provides login screen with MJ branding and wraps mj-shell for authenticated users.
 *
 * Usage:
 *   <mj-explorer-app></mj-explorer-app>
 */

import { Component, OnInit, OnDestroy, Inject, ViewEncapsulation } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';
import { LogError, SetProductionStatus } from '@memberjunction/core';
import { MJAuthBase, StandardUserInfo, AuthErrorType } from '@memberjunction/ng-auth-services';
import { WorkspaceInitializerService } from '@memberjunction/ng-workspace-initializer';
import { MJEnvironmentConfig, MJ_ENVIRONMENT } from '@memberjunction/ng-bootstrap';
import { SystemValidationService } from '@memberjunction/ng-explorer-core';

@Component({
  standalone: false,
  selector: 'mj-explorer-app',
  templateUrl: './explorer-app.component.html',
  styleUrls: ['./explorer-app.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class MJExplorerAppComponent implements OnInit, OnDestroy {
  private static readonly THEME_STORAGE_KEY = 'mj-login-theme';

  public title = 'MJ Explorer';
  public initialPath = '/';
  public HasError = false;
  public ErrorMessage: string = '';
  public subHeaderText: string = "Welcome back! Please log in to your account.";
  public showValidationOnly = false;
  /** True when the current URL is the OAuth callback route - used for conditional rendering */
  public isOAuthCallback = false;
  /** Tracks whether the login page is in dark mode */
  public IsDarkMode = false;

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    @Inject(DOCUMENT) public document: Document,
    @Inject(MJ_ENVIRONMENT) private environment: MJEnvironmentConfig,
    public authBase: MJAuthBase,
    private workspaceInit: WorkspaceInitializerService,
    private validationService: SystemValidationService
  ) {}

  /**
   * Handle successful login and initialize the application
   */
  async handleLogin(token: string, userInfo: StandardUserInfo) {
    if (!token) return;

    try {
      // Delegate all initialization logic to the service
      const result = await this.workspaceInit.initializeWorkspace(token, userInfo, {
        GRAPHQL_URI: this.environment.GRAPHQL_URI,
        GRAPHQL_WS_URI: this.environment.GRAPHQL_WS_URI,
        MJ_CORE_SCHEMA_NAME: this.environment.MJ_CORE_SCHEMA_NAME
      });

      if (result.success) {
        // Navigate to initial route
        if (this.initialPath === '/') {
          // use first nav item url instead
          setTimeout(() => {
            // Find the KendoDrawer element, and simulate a click for the first item
            const drawerElement = this.document.querySelector('li.k-drawer-item.k-level-0') as HTMLElement;
            if (drawerElement) drawerElement.click();
          }, 10); // wait for the drawer to finish rerender and then do this
        } else {
          this.router.navigateByUrl(this.initialPath, { replaceUrl: true });
        }
      } else if (result.error) {
        // Handle errors based on type
        if (result.error.type === 'no_roles') {
          // Show validation banner instead of generic error
          this.showValidationOnly = true;
          this.HasError = true;
          return; // Don't throw, just return to show validation banner
        }

        // Try auth retry for retryable errors
        const retried = await this.workspaceInit.handleAuthRetry(result.error, window.location.pathname);

        if (!retried) {
          // Show error to user
          this.HasError = true;
          this.ErrorMessage = result.error.userMessage || result.error.message;
          LogError('Error Logging In: ' + result.error.message);
          throw new Error(result.error.message);
        }
      }
    } catch (err: unknown) {
      this.HasError = true;
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
      LogError('Error Logging In: ' + this.ErrorMessage);
      throw err;
    }
  }

  async setupAuth() {
    // Auth provider already initialized by APP_INITIALIZER

    // v3.0 API - Clean abstraction using observables
    this.authBase.getUserInfo()
      .pipe(take(1))
      .subscribe({
        next: async (userInfo) => {
          if (userInfo) {
            // v3.0 API - No more provider-specific logic!
            const token = await this.authBase.getIdToken();

            if (token) {
              await this.handleLogin(token, userInfo);
            } else {
              // Token expired or missing — attempt a full refresh which will
              // redirect to the identity provider if interaction is required.
              console.warn('User info available but no token found, attempting refresh...');
              try {
                const refreshedToken = await this.authBase.refreshToken();
                await this.handleLogin(refreshedToken.idToken, userInfo);
              } catch (e) {
                console.error('Token refresh failed, redirecting to login:', e);
                // refreshToken() normally redirects (and never returns) when
                // interaction is required.  If we reach here, force login as
                // a last-resort safety net.
                this.authBase.login().subscribe();
              }
            }
          }
        },
        error: (err: unknown) => {
          LogError('Error Logging In: ' + err);

          // v3.0 API - Use semantic error classification
          const authError = this.authBase.classifyError(err);

          switch (authError.type) {
            case AuthErrorType.NO_ACTIVE_SESSION:
              this.subHeaderText = "Welcome back! Please log in to your account.";
              break;
            case AuthErrorType.INTERACTION_REQUIRED:
            case AuthErrorType.TOKEN_EXPIRED:
              this.subHeaderText = "Your session has expired. Please log in to your account.";
              break;
            default:
              this.subHeaderText = authError.userMessage || "Welcome back! Please log in to your account.";
          }

          // Auth state is managed by the provider itself via observables
        }
      });

    // Check auth state - the provider manages this internally now
    this.authBase.isAuthenticated()
      .pipe(take(1))
      .subscribe((loggedIn: boolean) => {
        if (!loggedIn) {
          // Instead of kicking off the login process,
          // just display the login screen to the user
          // Auth state is already false if we're here
        }
      });

    this.initialPath = window.location.pathname + (window.location.search ? window.location.search : '');
  }

  ngOnInit() {
    SetProductionStatus(this.environment.production);

    // Check if this is the OAuth callback route - used for conditional rendering in template
    // Note: We still run setupAuth() to restore the user's session
    this.isOAuthCallback = window.location.pathname.startsWith('/oauth/callback');

    // Apply saved or OS-preferred theme for the login page
    this.applyLoginTheme();

    // Re-apply login theme when the user logs out (ThemeService.Reset() clears data-theme)
    this.authBase.isAuthenticated()
      .pipe(takeUntil(this.destroy$))
      .subscribe((authenticated: boolean) => {
        if (!authenticated) {
          this.applyThemeToDOM();
        }
      });

    // Validate environment before attempting auth setup
    const envValid = this.validateEnvironment();
    if (!envValid) {
      this.HasError = true;
      this.ErrorMessage = 'Environment configuration is incomplete. See errors above.';
      return;
    }

    // Always run auth setup - this restores the user's session
    // For OAuth callback, once authenticated, the OAuthCallbackComponent handles the code exchange
    this.setupAuth();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Validates that required environment variables are present before auth initialization.
   * Surfaces clear error messages via SystemValidationService instead of letting the app
   * crash with cryptic runtime errors like "can't read endsWith() on undefined".
   */
  private validateEnvironment(): boolean {
    const env = this.environment;
    let valid = true;

    const requiredFields: { key: keyof MJEnvironmentConfig; label: string }[] = [
      { key: 'GRAPHQL_URI', label: 'GraphQL HTTP endpoint URL' },
      { key: 'GRAPHQL_WS_URI', label: 'GraphQL WebSocket endpoint URL' },
      { key: 'AUTH_TYPE', label: 'Authentication provider type (msal or auth0)' },
      { key: 'MJ_CORE_SCHEMA_NAME', label: 'MJ Core schema name' },
    ];

    for (const field of requiredFields) {
      if (!env[field.key]) {
        this.validationService.addIssue({
          id: `env-missing-${String(field.key)}`,
          message: `Missing required environment variable: ${String(field.key)}`,
          severity: 'error',
          details: `The "${String(field.key)}" property is empty or missing in your environment configuration file.`,
          help: `Add ${String(field.key)} (${field.label}) to your environment.ts file. Example files are in src/environments/.`
        });
        valid = false;
      }
    }

    // Conditionally required based on AUTH_TYPE
    const authType = env.AUTH_TYPE?.toLowerCase();
    if (authType === 'msal') {
      valid = this.validateMsalFields(env) && valid;
    } else if (authType === 'auth0') {
      valid = this.validateAuth0Fields(env) && valid;
    }

    return valid;
  }

  private validateMsalFields(env: MJEnvironmentConfig): boolean {
    let valid = true;
    if (!env.CLIENT_ID) {
      this.validationService.addIssue({
        id: 'env-missing-CLIENT_ID',
        message: 'Missing required environment variable: CLIENT_ID',
        severity: 'error',
        details: 'MSAL authentication requires CLIENT_ID (Azure AD/Entra Application Client ID).',
        help: 'Add your Azure AD Application (client) ID to the environment file.'
      });
      valid = false;
    }
    if (!env.TENANT_ID) {
      this.validationService.addIssue({
        id: 'env-missing-TENANT_ID',
        message: 'Missing required environment variable: TENANT_ID',
        severity: 'error',
        details: 'MSAL authentication requires TENANT_ID (Azure AD/Entra Tenant ID).',
        help: 'Add your Azure AD Directory (tenant) ID to the environment file.'
      });
      valid = false;
    }
    return valid;
  }

  private validateAuth0Fields(env: MJEnvironmentConfig): boolean {
    let valid = true;
    if (!env.AUTH0_DOMAIN) {
      this.validationService.addIssue({
        id: 'env-missing-AUTH0_DOMAIN',
        message: 'Missing required environment variable: AUTH0_DOMAIN',
        severity: 'error',
        details: 'Auth0 authentication requires AUTH0_DOMAIN.',
        help: 'Add your Auth0 domain (e.g. myapp.us.auth0.com) to the environment file.'
      });
      valid = false;
    }
    if (!env.AUTH0_CLIENTID) {
      this.validationService.addIssue({
        id: 'env-missing-AUTH0_CLIENTID',
        message: 'Missing required environment variable: AUTH0_CLIENTID',
        severity: 'error',
        details: 'Auth0 authentication requires AUTH0_CLIENTID.',
        help: 'Add your Auth0 Client ID to the environment file.'
      });
      valid = false;
    }
    return valid;
  }

  /**
   * Load saved theme preference from localStorage, falling back to OS preference
   */
  private applyLoginTheme(): void {
    const saved = localStorage.getItem(MJExplorerAppComponent.THEME_STORAGE_KEY);
    if (saved) {
      this.IsDarkMode = saved === 'dark';
    } else {
      this.IsDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.applyThemeToDOM();
  }

  /**
   * Set or remove the data-theme attribute on the document root
   */
  private applyThemeToDOM(): void {
    if (this.IsDarkMode) {
      this.document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      this.document.documentElement.removeAttribute('data-theme');
    }
  }

  /**
   * Toggle between light and dark themes, persisting the choice
   */
  public ToggleTheme(): void {
    this.IsDarkMode = !this.IsDarkMode;
    localStorage.setItem(MJExplorerAppComponent.THEME_STORAGE_KEY, this.IsDarkMode ? 'dark' : 'light');
    this.applyThemeToDOM();
  }
}
