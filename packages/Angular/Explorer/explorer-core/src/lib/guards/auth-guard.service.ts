import { Injectable } from '@angular/core';
import { Router, CanActivate } from '@angular/router';
import { MJAuthBase } from '@memberjunction/ng-auth-services';

@Injectable({
    providedIn: 'root',
})
export class AuthGuardService implements CanActivate {
  constructor(private authBase: MJAuthBase, public router: Router) {}
  canActivate(): boolean {
    if (!this.authBase.authenticated) {
      return false;
    }
    return true;
  }
}