/**
 * MemberJunction Explorer Application Component
 *
 * Complete branded entry point for Explorer-style applications.
 * Provides login screen with MJ branding and wraps mj-shell for authenticated users.
 *
 * Usage:
 *   <mj-explorer-app></mj-explorer-app>
 */

import { Component, OnInit, Inject, ViewEncapsulation } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { LogError, SetProductionStatus } from '@memberjunction/core';
import { MJAuthBase, StandardUserInfo, AuthErrorType } from '@memberjunction/ng-auth-services';
import { WorkspaceInitializerService } from '@memberjunction/ng-workspace-initializer';
import { MJEnvironmentConfig, MJ_ENVIRONMENT } from '@memberjunction/ng-bootstrap';

@Component({
  selector: 'mj-explorer-app',
  templateUrl: './explorer-app.component.html',
  styleUrls: ['./explorer-app.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class MJExplorerAppComponent implements OnInit {
  public title = 'MJ Explorer';
  public initialPath = '/';
  public HasError = false;
  public ErrorMessage: any = '';
  public subHeaderText: string = "Welcome back! Please log in to your account.";
  public showValidationOnly = false;
  /** True when the current URL is the OAuth callback route - used for conditional rendering */
  public isOAuthCallback = false;

  constructor(
    private router: Router,
    @Inject(DOCUMENT) public document: Document,
    @Inject(MJ_ENVIRONMENT) private environment: MJEnvironmentConfig,
    public authBase: MJAuthBase,
    private workspaceInit: WorkspaceInitializerService
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
          this.ErrorMessage = result.error.userMessage;
          LogError('Error Logging In: ' + result.error.message);
          throw new Error(result.error.message);
        }
      }
    } catch (err: any) {
      this.HasError = true;
      this.ErrorMessage = err;
      LogError('Error Logging In: ' + err);
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
              this.handleLogin(token, userInfo);
            } else {
              console.error('User info available but no token found');
              // Auth state is managed by the provider itself via observables
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

    // Always run auth setup - this restores the user's session
    // For OAuth callback, once authenticated, the OAuthCallbackComponent handles the code exchange
    this.setupAuth();
  }
}
