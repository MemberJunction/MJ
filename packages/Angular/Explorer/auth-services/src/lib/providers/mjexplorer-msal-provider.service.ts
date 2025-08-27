import { Injectable } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import { BehaviorSubject, Observable, Subject, catchError, filter, from, map, of, throwError, takeUntil, take, firstValueFrom } from 'rxjs';
import { MsalBroadcastService, MsalService, MSAL_INSTANCE, MSAL_GUARD_CONFIG, MSAL_INTERCEPTOR_CONFIG, MsalGuard } from '@azure/msal-angular';
import { AccountInfo, AuthenticationResult } from '@azure/msal-common';
import { CacheLookupPolicy, InteractionRequiredAuthError, InteractionStatus, PublicClientApplication, InteractionType } from '@azure/msal-browser';
import { LogError } from '@memberjunction/core';
import { AngularAuthProviderConfig } from '../IAuthProvider';

// Prevent tree-shaking by explicitly referencing the class
export function LoadMJMSALProvider() {
  // This function ensures the class is included in the bundle
  return MJMSALProvider;
}

@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'msal')
export class MJMSALProvider extends MJAuthBase {
  static readonly PROVIDER_TYPE = 'msal';
  type = MJMSALProvider.PROVIDER_TYPE;

  private readonly _destroying$ = new Subject<void>();
  private readonly _initializationCompleted$ = new BehaviorSubject<boolean>(false);
  private _initPromise: Promise<void> | null = null;

  /**
   * Factory function to provide Angular dependencies required by MSAL
   * Stored as a static property for the factory to access without instantiation
   */
  static angularProviderFactory = (environment: any) => [
    {
      provide: MSAL_INSTANCE,
      useValue: new PublicClientApplication({
        auth: {
          clientId: environment.CLIENT_ID,
          authority: environment.CLIENT_AUTHORITY,
          redirectUri: window.location.origin,
        },
        cache: {
          cacheLocation: 'localStorage',
          storeAuthStateInCookie: false,
        },
      }),
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useValue: {
        interactionType: InteractionType.Redirect,
        authRequest: {
          scopes: ['User.Read'],
        },
      },
    },
    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      useValue: {
        interactionType: InteractionType.Redirect,
        protectedResourceMap: new Map([['https://graph.microsoft.com/v1.0/me', ['user.read']]]),
      },
    },
    MsalService,
    MsalGuard,
    MsalBroadcastService
  ];

  constructor(public auth: MsalService, private msalBroadcastService: MsalBroadcastService) {
    const config: AngularAuthProviderConfig = { 
      name: MJMSALProvider.PROVIDER_TYPE, 
      type: MJMSALProvider.PROVIDER_TYPE 
    };
    super(config);
    // Defer initialization to avoid blocking app startup
    // This will be called lazily when auth is actually needed
  }

  private async initializeMSAL(): Promise<void> {
    // Only initialize once
    if (this._initPromise) {
      return this._initPromise;
    }
    
    this._initPromise = this._performInitialization();
    return this._initPromise;
  }
  
  private async _performInitialization(): Promise<void> {
    
    await this.auth.instance.initialize();
    
    // Handle redirect immediately after initialization
    const redirectResponse = await this.auth.instance.handleRedirectPromise();
    if (redirectResponse && redirectResponse.account) {
      // User just logged in via redirect
      this.auth.instance.setActiveAccount(redirectResponse.account);
      this.updateAuthState(true);
      this.authenticated = true;
      this._initializationCompleted$.next(true); // Signal initialization complete
      
      // Do a controlled reload after successful login
      // This ensures the app fully reinitializes with the authenticated state
      setTimeout(() => {
        window.location.href = window.location.origin;
      }, 100);
      return;
    } else {
      // Set active account if we have one
      const accounts = this.auth.instance.getAllAccounts();
      
      if (accounts.length > 0) {
        this.auth.instance.setActiveAccount(accounts[0]);
        this.updateAuthState(true);
        this.authenticated = true;
        this._initializationCompleted$.next(true);
      } else {
      }
    }
    
    // Subscribe to broadcast service for ongoing auth state changes
    this.msalBroadcastService.inProgress$
      .pipe(filter((status: InteractionStatus) => status === InteractionStatus.None), takeUntil(this._destroying$))
      .subscribe(() => {
        const isAuth = this.auth.instance.getAllAccounts().length > 0;
        this.updateAuthState(isAuth);
        this.authenticated = isAuth;
        if (isAuth) {
          this.auth.instance.setActiveAccount(this.auth.instance.getAllAccounts()[0]);
        }
        this._initializationCompleted$.next(true);
      });
  }

  // Ensure methods wait for initialization
  private async ensureInitialized() {
    // Trigger lazy initialization if not started
    if (!this._initPromise) {
      await this.initializeMSAL();
    } else if (!this._initializationCompleted$.value) {
      // Waiting for existing initialization to complete...
      await this._initPromise;
    }
  }

  override login(options?: any): Observable<void> {
    const silentRequest: any = {
      scopes: ['User.Read','email', 'profile'],
      ...options
    };
    
    this.auth.loginRedirect(silentRequest).subscribe({ 
      next: () => {
        this.auth.instance.setActiveAccount(this.auth.instance.getAllAccounts()[0] || null);
        // Don't reload here - let the redirect handler manage the flow
      }, 
      error: (error) => {
        LogError(error);
      }
    });
    
    return of(void 0);
  }

  public async logout(): Promise<void> {
    await this.ensureInitialized();
    this.auth.logoutRedirect().subscribe(() => {
      // Logout will trigger a redirect
    });
  }

  public async refresh(): Promise<Observable<any>> {
    await this.ensureInitialized();
    const silentRequest: any = {
      scopes: ['User.Read', 'email', 'profile'],
      cacheLookupPolicy: CacheLookupPolicy.RefreshTokenAndNetwork,
    };
    return from(this.auth.instance.acquireTokenSilent(silentRequest));
  }

  async getUser(): Promise<AccountInfo | null> {
    await this.ensureInitialized();
    return this.auth.instance.getActiveAccount();
  }

  override isAuthenticated(): Observable<boolean> {
    // Return the base class observable which is being updated in initializeMSAL
    return this.isAuthenticated$.asObservable();
  }

  async getUserClaims(): Promise<Observable<any>> {
    await this.ensureInitialized();
    const account = this.auth.instance.getActiveAccount();
    
    if (!account) {
      // No account, return null observable
      return of(null);
    }
    
    const silentRequest: any = {
      scopes: ['User.Read', 'email', 'profile'],
      account: account,
      cacheLookupPolicy: CacheLookupPolicy.RefreshTokenAndNetwork
    };
    
    return from(this.auth.instance.acquireTokenSilent(silentRequest)).pipe(
      map((response: AuthenticationResult) => response),
      catchError((error) => {
        LogError(error);
        if (error instanceof InteractionRequiredAuthError) {
          // Try popup as fallback
          return from(this.auth.instance.acquireTokenPopup({
            scopes: ['User.Read', 'email', 'profile']
          }));
        }
        this.authenticated = false;
        return throwError(() => error);
      })
    );
  }

  checkExpiredTokenError(error: string): boolean {
    return error?.trim().toLowerCase().includes('you need to be authorized to perform');
  }

  // Required methods for the new interface
  async initialize(): Promise<void> {
    await this.initializeMSAL();
  }

  protected async loginInternal(options?: any): Promise<void> {
    await this.ensureInitialized();
    const silentRequest: any = {
      scopes: ['User.Read','email', 'profile'],
      ...options
    };
    
    return new Promise((resolve, reject) => {
      this.auth.loginRedirect(silentRequest).subscribe({ 
        next: () => {
          resolve();
        }, 
        error: (error) => {
          LogError(error);
          reject(error);
        }
      });
    });
  }

  async getToken(): Promise<string | null> {
    await this.ensureInitialized();
    try {
      const account = this.auth.instance.getActiveAccount();
      if (!account) {
        return null;
      }
      
      const response = await this.auth.instance.acquireTokenSilent({
        scopes: ['User.Read'],
        account: account,
        forceRefresh: false
      });
      return response.accessToken;
    } catch (error: any) {
      if (error instanceof InteractionRequiredAuthError) {
        // Try interactive login if silent acquisition fails
        try {
          const response = await this.auth.instance.acquireTokenPopup({
            scopes: ['User.Read']
          });
          return response.accessToken;
        } catch (popupError) {
          console.error('Failed to acquire token via popup:', popupError);
        }
      }
      return null;
    }
  }

  async handleCallback(): Promise<void> {
    // MSAL Angular handles callbacks internally through its broadcast service
    // The handleRedirectPromise is called in initializeMSAL
    await this.ensureInitialized();
  }

  getRequiredConfig(): string[] {
    return ['clientId', 'tenantId'];
  }

  validateConfig(_config: any): boolean {
    // MSAL configuration is handled by Angular module providers
    return true;
  }
}