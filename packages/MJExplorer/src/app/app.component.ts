import { DOCUMENT } from '@angular/common';
import { Component, Inject, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { LogError, LogStatus, Metadata, SetProductionStatus } from '@memberjunction/core';
import { setupGraphQLClient, GraphQLProviderConfigData, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { lastValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { StartupValidationService } from '@memberjunction/ng-explorer-core';
import { LoadGeneratedEntities } from 'mj_generatedentities'
import { MJAuthBase, StandardUserInfo, AuthErrorType } from '@memberjunction/ng-auth-services';
import { SharedService } from '@memberjunction/ng-shared';
LoadGeneratedEntities(); // forces the generated entities library to load up, sometimes tree shaking in the build process can break this, so this is a workaround that ensures it always happens

@Component({
  encapsulation: ViewEncapsulation.None,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  public title = 'MJ Explorer';
  public initalPath = '/';
  public HasError = false;
  public ErrorMessage: any = '';
  public environment = environment;
  public subHeaderText: string = "Welcome back! Please log in to your account.";
  public showValidationOnly = false;


  constructor(
    private router: Router, 
    @Inject(DOCUMENT) public document: Document, 
    public authBase: MJAuthBase,
    private startupValidationService: StartupValidationService
  ) { }

  async handleLogin(token: string, userInfo: StandardUserInfo) {
    if (token) {
      const url: string = environment.GRAPHQL_URI;
      const wsurl: string = environment.GRAPHQL_WS_URI;

      try {
        const start = Date.now();
        const config = new GraphQLProviderConfigData(token, url, wsurl, async () => {
          // v3.0 API - clean abstraction, no provider-specific logic!
          // refreshToken() handles all provider differences internally:
          // - Auth0/Okta: Silent refresh with refresh tokens
          // - MSAL: Silent refresh, falls back to redirect if needed
          const token = await this.authBase.refreshToken();
          return token.idToken;
        }, environment.MJ_CORE_SCHEMA_NAME);
        await setupGraphQLClient(config);
        const end = Date.now();
        console.log(`Client Setup Complete:  ${end - start}ms`);

        await SharedService.RefreshData(true);

        // Check to see if the user has access... 
        const md = new Metadata();
        
        if (!md.CurrentUser) {
          // if user doens't have access do this stuff
          this.HasError = true;
          this.ErrorMessage = `You don't have access to the application, contact your system administrator.`
          throw this.ErrorMessage;
        }
        
        // We need a small delay to ensure everything is initialized
        setTimeout(() => {
          // Run validation checks to identify potential issues
          this.startupValidationService.validateSystemSetup();
        }, 500);


        localStorage.removeItem('jwt-retry-ts');
        if (this.initalPath === '/') {
          // use first nav item url instead
          //this.nav.drawerItems[0].selected = true;
          setTimeout(() => {
            // Find the KendoDrawer element, and simulate a click for the first item
            const drawerElement = this.document.querySelector('li.k-drawer-item.k-level-0') as any;

            if (drawerElement) drawerElement.click();
          }, 10); // wait for the drawer to finish rerender and then do this
        } else {
          this.router.navigateByUrl(this.initalPath, { replaceUrl: true });
        }
      } catch (err: any) {
        const retryKey = 'auth-retry-dt';
        const lastRetryDateTime = localStorage.getItem(retryKey);
        const yesterday = +new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

        // First, check if this is related to missing user roles
        // Using our enhanced error checking function
        const isNoRolesError = this.isNoUserRolesError(err);
        
        if (isNoRolesError) {
          
          // Instead of showing a generic error message, use our validation service
          this.showValidationOnly = true;
          this.HasError = true; // Still set HasError to hide the navigation
          
          // Add the validation issue through our service
          this.startupValidationService.addNoRolesValidationIssue();
          
          // Don't throw, just return to allow the UI to show our validation banner
          return;
        }

        const retriedRecently = lastRetryDateTime && +new Date(lastRetryDateTime) > yesterday;

        // v3.0 API - use semantic error classification
        const authError = this.authBase.classifyError(err);
        const isTokenExpired = authError.type === AuthErrorType.TOKEN_EXPIRED;

        if (!retriedRecently && isTokenExpired) {
          LogStatus('JWT Expired, retrying once: ' + err);
          localStorage.setItem(retryKey, new Date().toISOString());
          const login$ = this.authBase.login({ appState: { target: window.location.pathname } });
          await lastValueFrom(login$);
        } else {
          this.HasError = true;
          this.ErrorMessage = err;
          LogError('Error Logging In: ' + err);
          throw err;
        }
      }
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

    this.initalPath = window.location.pathname + (window.location.search ? window.location.search : '');
  }

  ngOnInit() {
    SetProductionStatus(environment.production)
    this.setupAuth();
  }
 

  
  /**
   * Helper function to safely check if an error is related to missing user roles
   */
  private isNoUserRolesError(err: any): boolean {
    try {
      // Check if error has response with errors array
      if (!err || typeof err !== 'object') return false;
      
      // Check for GraphQL-style errors
      if (err.response && Array.isArray(err.response.errors)) {
        return err.response.errors.some((e: any) => 
          e && e.message && typeof e.message === 'string' && 
          e.message.includes('does not have read permissions on User Roles')
        );
      }
      
      // Check for specific "ResourceTypes" error which happens when user has no roles
      if (err.toString && typeof err.toString === 'function') {
        const errorString = err.toString();
        
        // This is the specific error we're seeing that indicates no roles
        if (errorString.includes("Cannot read properties of undefined (reading 'ResourceTypes')")) {
          return true;
        }
      }
      
      // Check for error message directly on the error object
      if (err.message && typeof err.message === 'string') {
        const message = err.message;
        return message.includes('does not have read permissions on User Roles') || 
               message.includes("Cannot read properties of undefined (reading 'ResourceTypes')");
      }
      
      // Check for nested error object
      if (err.error && typeof err.error === 'object') {
        return this.isNoUserRolesError(err.error);
      }
      
      return false;
    } catch (e) {
      console.error('Error while checking for user roles error:', e);
      return false;
    }
  }
}