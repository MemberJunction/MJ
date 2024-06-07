import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export abstract class MJAuthBase {
  authenticated: boolean = false;

  constructor() { }
  abstract login(options?: any): Promise<any>;
  abstract logout(): Promise<any>;
  abstract refresh(): Promise<Observable<any>>;
  abstract isAuthenticated(): Promise<any>;
  abstract getUser(): Promise<any>;
  abstract getUserClaims(): Promise<Observable<any>>;
  abstract checkExpiredTokenError(error: string): boolean;

  protected setAuthenticated(value: boolean): void {
    this.authenticated = value;
  }
}
