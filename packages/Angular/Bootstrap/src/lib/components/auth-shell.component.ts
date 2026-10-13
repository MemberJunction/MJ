/**
 * MemberJunction Auth Shell Component
 *
 * Handles authentication flow and initialization for MJ applications.
 * This component encapsulates all the auth logic that was previously in app.component.ts
 */

import { Component, OnInit, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { take } from 'rxjs/operators';
import { SetProductionStatus, LogError, LogStatus } from '@memberjunction/core';
import { MJAuthBase, StandardUserInfo, AuthErrorType } from '@memberjunction/ng-auth-services';
import { MJInitializationService } from '../services/initialization.service';
import { MJEnvironmentConfig, MJ_ENVIRONMENT } from '../bootstrap.types';

@Component({
  standalone: false,
  selector: 'mj-auth-shell',
  template: `
    <div class="mj-auth-shell">
      @if (!HasError || showValidationOnly) {
        <ng-content></ng-content>
      }
    
      @if (HasError && !showValidationOnly) {
        <div class="error-container">
          <h2>Error</h2>
          <p>{{ ErrorMessage }}</p>
        </div>
      }
    </div>
    `,
  styles: [`
    .mj-auth-shell {
      width: 100%;
      height: 100%;
      display: block;
    }

    .error-container {
      padding: 20px;
      text-align: center;
    }

    .error-container h2 {
      color: var(--mj-status-error);
      margin-bottom: 10px;
    }
  `]
})
export class MJAuthShellComponent implements OnInit {
  public HasError = false;
  public ErrorMessage: any = '';
  public ShowValidationOnly = false;

  /** @deprecated Use {@link ShowValidationOnly}. */
  public get showValidationOnly() {
    return this.ShowValidationOnly;
  }
  /** @deprecated Use {@link ShowValidationOnly}. */
  public set showValidationOnly(value) {
    this.ShowValidationOnly = value;
  }
  public SubHeaderText: string = "Welcome back! Please log in to your account.";

  /** @deprecated Use {@link SubHeaderText}. */
  public get subHeaderText(): string {
    return this.SubHeaderText;
  }
  /** @deprecated Use {@link SubHeaderText}. */
  public set subHeaderText(value: string) {
    this.SubHeaderText = value;
  }

  private initialPath = '/';

  constructor(
    private router: Router,
    @Inject(DOCUMENT) public Document: Document,
    public AuthBase: MJAuthBase,
    private initService: MJInitializationService,
    @Inject(MJ_ENVIRONMENT) private environment: MJEnvironmentConfig
  ) {}

  /** @deprecated Use {@link Document} instead. */
  get document(): Document {
    return this.Document;
  }

  /** @deprecated Use {@link AuthBase}. */
  public get authBase(): MJAuthBase {
    return this.AuthBase;
  }
  /** @deprecated Use {@link AuthBase}. */
  public set authBase(value: MJAuthBase) {
    this.AuthBase = value;
  }

  async ngOnInit() {
    console.log('🚀 MemberJunction - Auth Shell Initializing');

    SetProductionStatus(this.environment.production);
    this.initialPath = window.location.pathname + (window.location.search ? window.location.search : '');

    await this.SetupAuth();
  }

  /**
   * Handle successful login and initialize the application
   */
  async HandleLogin(token: string, userInfo: StandardUserInfo): Promise<void> {
    if (!token) return;

    try {
      // Initialize GraphQL client
      await this.initService.initializeGraphQL(token, this.environment);

      // Validate user access and refresh data
      const validationResult = await this.initService.validateUserAccess();

      if (!validationResult.success) {
        this.HasError = true;
        this.ErrorMessage = validationResult.error!.message;
        throw new Error(this.ErrorMessage);
      }

      // Run startup validation checks
      this.initService.runValidationChecks();

      // Navigate to initial route
      this.initService.navigateToInitialRoute(this.initialPath, this.Document);

    } catch (err: any) {
      // Check for no roles error
      if (this.initService.isNoUserRolesError(err)) {
        this.ShowValidationOnly = true;
        this.HasError = true;
        const result = this.initService.handleNoRolesError();
        return; // Don't throw, allow UI to show validation banner
      }

      // Try auth retry if applicable
      const retried = await this.initService.handleAuthRetry(err);
      if (retried) {
        return; // Retry initiated
      }

      // Show error
      this.HasError = true;
      this.ErrorMessage = err;
      LogError('Error Logging In: ' + err);
      throw err;
    }
  }

  /** @deprecated Use {@link HandleLogin}. */
  async handleLogin(token: string, userInfo: StandardUserInfo): Promise<void> {
    return this.HandleLogin(token, userInfo);
  }

  /**
   * Setup authentication and handle auth state changes
   */
  async SetupAuth(): Promise<void> {
    // Auth provider already initialized by APP_INITIALIZER

    // Listen for user info changes
    this.AuthBase.getUserInfo()
      .pipe(take(1))
      .subscribe({
        next: async (userInfo) => {
          if (userInfo) {
            const token = await this.AuthBase.getIdToken();

            if (token) {
              await this.HandleLogin(token, userInfo);
            } else {
              console.error('User info available but no token found');
            }
          }
        },
        error: (err: unknown) => {
          LogError('Error Logging In: ' + err);
          this.SubHeaderText = this.initService.getAuthErrorMessage(err);
        }
      });

    // Check if user is authenticated
    this.AuthBase.isAuthenticated()
      .pipe(take(1))
      .subscribe((loggedIn: boolean) => {
        if (!loggedIn) {
          // Display login screen - auth state is managed by provider
          console.log('User not authenticated, showing login screen');
        }
      });
  }

  /** @deprecated Use {@link SetupAuth}. */
  async setupAuth(): Promise<void> {
    return this.SetupAuth();
  }
}
