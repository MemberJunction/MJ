import { Injectable } from '@angular/core';
import { Router, CanActivate } from '@angular/router';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { Observable, map } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class AuthGuardService implements CanActivate {
  constructor(private authBase: MJAuthBase, public router: Router) {}

  canActivate(): Observable<boolean> {
    // v3.0 API - use observable instead of property
    return this.authBase.isAuthenticated().pipe(
      map(isAuthenticated => {
        if (!isAuthenticated) {
          return false;
        }
        return true;
      })
    );
  }
}