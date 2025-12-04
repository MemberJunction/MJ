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
import { MJAuthBase } from '@memberjunction/ng-auth-services';
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

  async handleLogin(token: string, claims: any) {
    if (token) {
      const url: string = environment.GRAPHQL_URI;
      const wsurl: string = environment.GRAPHQL_WS_URI;

      try {
        console.log('Setting up GraphQL client...');
        const start = Date.now();
        const config = new GraphQLProviderConfigData(token, url, wsurl, async () => {
          const refresh$ = await this.authBase.refresh();
          const claims = await lastValueFrom(refresh$);
          const token = environment.AUTH_TYPE === 'auth0' ? claims?.__raw : claims?.idToken;
          return token;
        }, environment.MJ_CORE_SCHEMA_NAME);
        await setupGraphQLClient(config);
        const end = Date.now();
        console.log(`GraphQL Client Setup took ${end - start}ms`);

        // const testUrl = 'http://localhost:4050/'
        // const testwSUrl = 'ws://localhost:4050/'
        // const c2 = new GraphQLProviderConfigData(token, testUrl, testwSUrl, async () => {
        //   const refresh$ = await this.authBase.refresh();
        //   const claims = await lastValueFrom(refresh$);
        //   const token = environment.AUTH_TYPE === 'auth0' ? claims?.__raw : claims?.idToken;
        //   return token;
        // }, environment.MJ_CORE_SCHEMA_NAME);
        // const g2 = new GraphQLDataProvider();
        // await g2.Config(c2, true);
        // console.log(g2.Entities);

        const refreshStart = Date.now();
        await SharedService.RefreshData(true);
        const refreshEnd = Date.now();
        console.log(`GetAllMetadata() took ${refreshEnd - refreshStart}ms`);

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
        const expiryError = this.authBase.checkExpiredTokenError((err as any)?.response?.errors?.[0]?.message);

        if (!retriedRecently && expiryError) {
          LogStatus('JWT Expired, retrying once: ' + err);
          localStorage.setItem(retryKey, new Date().toISOString());
          const login$ = await this.authBase.login({ appState: { target: window.location.pathname } });
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

    // Don't await here - let it run asynchronously to avoid blocking app startup
    this.authBase.getUserClaims().then(claims => {
      claims.subscribe((claims: any) => {
      if (claims) {
        const token = environment.AUTH_TYPE === 'auth0' ? claims?.__raw : claims?.idToken;
        const result = claims.idTokenClaims ?
                        {...claims, ...claims.idTokenClaims} : // combine the values from the two claims objects because in auth0 and MSAL they have different structures, this pushes them all together into one
                        claims; // or if idTokenClaims doesn't exist, just use the claims object as is

        this.handleLogin(token, result);
      }
    }, (err: any) => {
      LogError('Error Logging In: ' + err);
      if(err.name){
        if(err.name === 'BrowserAuthError') {
          //if we're using MSAL, then its likely the user has no active accounts
          //signed in
          this.subHeaderText = "Welcome back! Please log in to your account.";
        }
        else if(err.name === 'InteractionRequiredAuthError'){
          //if we're using MSAL, then its likely the user has previously
          //signed in, but the auth token/session has expired
          this.subHeaderText = "Your session has expired. Please log in to your account.";
        }
      }

      this.authBase.authenticated = false;
      });
    }).catch(err => {
      console.error('Error getting user claims:', err);
      this.authBase.authenticated = false;
    });
  
    // Don't await here either - let auth check run async
    this.authBase.isAuthenticated()
      .pipe(take(1)) /* only do this for the first message */
      .subscribe((loggedIn: any) => {
          if (!loggedIn) {
          //this.authBase.login(); 

          //Instead of kicking off the login process,
          //just display the login screen to the user
          this.authBase.authenticated = false;
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