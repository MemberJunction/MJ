import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanMatchFn, RedirectFunction, Route } from '@angular/router';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { ResolveMovedNavItem } from '@memberjunction/ng-shared';

/**
 * True when a request for the nav item moves for this user: the old app no longer has the nav item and the user has
 * the new app ({@link ResolveMovedNavItem}, the rule NavigationService.SwitchToApp uses). Waits for the user's app list.
 */
async function movedNavItemApplies(appManager: ApplicationManager, fromApplication: string, fromNavItem: string): Promise<boolean> {
  await appManager.WhenReady();
  return (await ResolveMovedNavItem(fromApplication, fromNavItem, appManager.GetAllApps())) !== null;
}

/**
 * A `canMatch` guard that matches only when the nav item's move applies for the user: the old app no longer has the
 * nav item and the user has the new app (`MOVED_NAV_ITEMS` in ng-shared). It waits for the user's app list, so a
 * cold load decides on the loaded list.
 */
export function MovedNavItemGuard(fromApplication: string, fromNavItem: string): CanMatchFn {
  return () => movedNavItemApplies(inject(ApplicationManager), fromApplication, fromNavItem);
}

/** A redirect to `url` that keeps the link's query params and fragment. */
function redirectKeepingQueryParams(url: string): RedirectFunction {
  return ({ queryParams, fragment }) => inject(Router).createUrlTree([url], { queryParams, fragment: fragment ?? undefined });
}

/**
 * A link to Data Explorer's Dashboards page opens the Library of the Dashboards app when the move applies: Data
 * Explorer no longer has a Dashboards nav item and the user has the Dashboards app. Otherwise the guard does not
 * match, and the link goes on to the app navigation route.
 * The redirect is in a child route because Angular runs no guard on a route that has `redirectTo`.
 */
export const DATA_EXPLORER_DASHBOARDS_ROUTE: Route = {
  path: 'app/data-explorer/Dashboards',
  pathMatch: 'full',
  canMatch: [MovedNavItemGuard('Data Explorer', 'Dashboards')],
  children: [{ path: '', pathMatch: 'full', redirectTo: redirectKeepingQueryParams('/app/dashboards/Library') }],
};
