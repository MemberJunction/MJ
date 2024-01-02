import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export abstract class MJAuthBase {
  authenticated: boolean = false;

  constructor() { }
  abstract login(options?: any): any;
  abstract logout(): any;
  abstract isAuthenticated(): any;
  abstract getUser(): any;
  abstract getUserClaims(): Observable<any>;
  abstract checkExpiredTokenError(error: string): boolean;

  protected setAuthenticated(value: boolean): void {
    this.authenticated = value;
  }
}
