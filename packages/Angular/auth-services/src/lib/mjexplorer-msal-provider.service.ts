import { Injectable } from '@angular/core';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { BehaviorSubject, Observable, Subject, catchError, filter, from, map, of, throwError, takeUntil, take, firstValueFrom } from 'rxjs';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AccountInfo, AuthenticationResult } from '@azure/msal-common';
import { CacheLookupPolicy, InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { LogError } from '@memberjunction/core';

@Injectable({
  providedIn: 'root'
})
export class MJMSALProvider extends MJAuthBase {

  private readonly _destroying$ = new Subject<void>();
  private readonly _initializationCompleted$ = new BehaviorSubject<boolean>(false);

  constructor(public auth: MsalService, private msalBroadcastService: MsalBroadcastService) {
    super();
    this.initializeMSAL();
  }

  private async initializeMSAL() {
    await this.auth.instance.initialize();
    // After initialization logic
    this.auth.instance.setActiveAccount(this.auth.instance.getAllAccounts()[0] || null);
    this.msalBroadcastService.inProgress$
      .pipe(filter((status: InteractionStatus) => status === InteractionStatus.None), takeUntil(this._destroying$))
      .subscribe(() => {
        this.setAuthenticated(this.auth.instance.getAllAccounts().length > 0);
        this.auth.instance.setActiveAccount(this.auth.instance.getAllAccounts()[0] || null);
      });
    this._initializationCompleted$.next(true); // Signal initialization complete
  }

  // Ensure methods wait for initialization
  private async ensureInitialized() {
    if (!this._initializationCompleted$.value) {
      await firstValueFrom(this._initializationCompleted$.pipe(filter(done => done), take(1)));
    }
  }

  override async login(options?: any): Promise<any> {
    await this.ensureInitialized();
    const silentRequest: any = {
      scopes: ['User.Read','email', 'profile']
    };
    this.auth.loginRedirect(silentRequest).subscribe({ 
      next: () => {
        this.auth.instance.setActiveAccount(this.auth.instance.getAllAccounts()[0] || null);
        window.location.reload();
      }, 
      error: (error) => {
        LogError(error);
      }
    });
  }

  public async logout(): Promise<void> {
    await this.ensureInitialized();
    this.auth.logoutRedirect().subscribe(() => {
      window.location.reload();
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

  async isAuthenticated() {
    await this.ensureInitialized();
    return of(this.auth.instance.getActiveAccount() != null);
  }

  async getUserClaims(): Promise<Observable<any>> {
    await this.ensureInitialized();
    const account = this.auth.instance.getActiveAccount();
    const silentRequest: any = {
      scopes: ['User.Read', 'email', 'profile'],
      account: account,
      cacheLookupPolicy: CacheLookupPolicy.RefreshTokenAndNetwork
    };
    if (account) {
      return from(this.auth.instance.acquireTokenSilent(silentRequest)).pipe(
        map((response: AuthenticationResult) => response),
        catchError((error) => {
          LogError(error);
          if (error instanceof InteractionRequiredAuthError) {
            return from(this.auth.instance.acquireTokenSilent(silentRequest));
          }
          return throwError(error);
        }));
    } else {
      return from(this.auth.instance.acquireTokenSilent(silentRequest));
    }
  }

  checkExpiredTokenError(error: string): boolean {
    return error?.trim().toLowerCase().includes('you need to be authorized to perform');
  }

}
