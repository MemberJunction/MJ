import { Injectable } from '@angular/core';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { Observable, Subject, catchError, filter, from, map, of, throwError } from 'rxjs';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AccountInfo, AuthenticationResult } from '@azure/msal-common';
import { CacheLookupPolicy, InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { LogError } from '@memberjunction/core';

@Injectable({
  providedIn: 'root'
})
export class MJMSALProvider extends MJAuthBase {

  private readonly _destroying$ = new Subject<void>();

  constructor(public auth: MsalService, private msalBroadcastService: MsalBroadcastService) {
    super();

    this.auth.instance.setActiveAccount(this.auth.instance.getAllAccounts()[0] || null);
    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None)
      )
      .subscribe(() => {
        this.setAuthenticated(this.auth.instance.getAllAccounts().length > 0);
        this.auth.instance.setActiveAccount(this.auth.instance.getAllAccounts()[0] || null);
      });
  }

  override async login(options?: any): Promise<any> {
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

  public logout(): void {
    this.auth.logoutRedirect().subscribe(() => {
      window.location.reload();
    });
  }

  getUser(): AccountInfo | null {
    return this.auth.instance.getActiveAccount();
  }

  isAuthenticated() {
    return of(this.auth.instance.getActiveAccount() != null);
  }

  getUserClaims(): Observable<any> {
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
