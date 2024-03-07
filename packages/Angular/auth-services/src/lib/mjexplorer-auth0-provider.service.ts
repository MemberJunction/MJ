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

  public async logout(): Promise<void> {
    this.auth.logout({ logoutParams: { returnTo: document.location.origin } });
  }

  public async refresh(): Promise<Observable<any>> {
    await this.auth.getAccessTokenSilently();
    return this.auth.idTokenClaims$;
  }

  async getUser(): Promise<Observable<User | null | undefined>> {
    return this.auth.user$;
  }

  async isAuthenticated() {
    return this.auth.isAuthenticated$;
  }

  async getUserClaims(): Promise<Observable<any>> {
    return this.auth.idTokenClaims$;
  }

  checkExpiredTokenError(error: string): boolean {
    return error?.includes('jwt expired');
  }

}
