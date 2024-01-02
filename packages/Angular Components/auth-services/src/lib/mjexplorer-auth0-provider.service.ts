import { Injectable } from '@angular/core';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { AuthService, IdToken, User } from '@auth0/auth0-angular';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MJAuth0Provider extends MJAuthBase {

  constructor(public auth: AuthService) {
    super();
    this.auth.isAuthenticated$.subscribe((loggedIn) => {
      this.setAuthenticated(loggedIn);
    });
  }

  override login(options?: any): any {
    this.auth.loginWithRedirect(options);
  }

  public logout(): void {
    this.auth.logout({ logoutParams: { returnTo: document.location.origin } });
  }

  getUser(): Observable<User | null | undefined> {
    return this.auth.user$;
  }

  isAuthenticated() {
    return this.auth.isAuthenticated$;
  }

  getUserClaims(): Observable<any> {
    return this.auth.idTokenClaims$;
  }

  checkExpiredTokenError(error: string): boolean {
    return error?.includes('jwt expired');
  }

}
