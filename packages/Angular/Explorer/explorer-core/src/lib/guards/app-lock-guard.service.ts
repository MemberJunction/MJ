import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Confines app-locked sessions (e.g. magic-link) to a single application.
 *
 * When the auth provider reports a session scope locked to one app
 * (`GetSessionScope().restrictedToApplicationId`), this guard blocks activation
 * of any `/app/:appName` route that isn't the scoped app and redirects back to
 * it — including the always-accessible Home system app. Because it runs as a
 * CanActivate guard, the off-scope component never mounts, so there's no
 * transient render/error before the redirect.
 *
 * No-op for normal (unconstrained) sessions, so it's safe on every /app route.
 */
@Injectable({
  providedIn: 'root',
})
export class AppLockGuardService implements CanActivate {
  constructor(
    private authBase: MJAuthBase,
    private appManager: ApplicationManager,
    private router: Router,
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const lockedId = this.authBase.GetSessionScope()?.restrictedToApplicationId;
    if (!lockedId) {
      return true; // unconstrained session
    }

    const scopedApp = this.appManager.GetAppById(lockedId);
    if (!scopedApp) {
      // Apps not resolvable yet (e.g. very first load) — allow; the shell's
      // initial-load logic forces the scoped app once the app list is ready.
      return true;
    }

    const targetAppName = route.paramMap.get('appName');
    const targetApp = targetAppName ? this.appManager.GetAppByPath(targetAppName) : undefined;
    if (targetApp && UUIDsEqual(targetApp.ID, lockedId)) {
      return true; // already navigating within the scoped app
    }

    return this.router.parseUrl(this.appManager.GetAppUrl(scopedApp));
  }
}
