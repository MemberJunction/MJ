import { NgModule } from '@angular/core';
import { RouterModule, Routes, RouteReuseStrategy, DetachedRouteHandle, ActivatedRouteSnapshot } from '@angular/router';
import { AuthGuard } from '@auth0/auth0-angular';
import { NoAccessComponent } from './no-access/no-access.component';
import { SkipComponent } from './skip/skip.component';
import { ReportListComponent } from './report-list/report-list.component';
import { SingleReportComponent } from './single-report/single-report.component';
import { SettingsComponent } from './settings/settings.component';

const routes: Routes = [
  {
    path: 'chat/:conversationId',
    component: SkipComponent,
    canActivate: [AuthGuard], // Protect this route
  },
  {
    path: 'chat',
    component: SkipComponent,
    canActivate: [AuthGuard], // Protect this route
  },
  { 
    path: 'report-list',
    component: ReportListComponent,
    canActivate: [AuthGuard], // Protect this route
  },
  { 
    path: 'report-list/:folderId',
    component: ReportListComponent,
    canActivate: [AuthGuard], // Protect this route
  },
  { 
    path: 'settings',
    component: SettingsComponent,
    canActivate: [AuthGuard], // Protect this route
  },
  { 
    path: 'report/:id',
    component: SingleReportComponent,
    canActivate: [AuthGuard], // Protect this route
  },
  { 
    path: '',
    redirectTo: 'chat', // Default conversation ID or desired route
    pathMatch: 'full' // Ensure exact match for the empty path
  },
  { 
    path: 'no-access',
    component: NoAccessComponent
  },
];


/**
 * Enables route reuse strategy for all routes
 */
export class SkipReuseStrategy implements RouteReuseStrategy {
  private handlers: { [key: string]: DetachedRouteHandle } = {};

  // Determines if a route should be detached for reuse
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return true; // Enable detaching/caching for all routes
  }

  // Stores the detached route
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    this.handlers[this.getRouteKey(route)] = handle;
  }

  // Determines if a route should be reattached
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return !!this.handlers[this.getRouteKey(route)];
  }

  // Retrieves the stored route
  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return this.handlers[this.getRouteKey(route)] || null;
  }

  // Determines if a route should be reused
  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  // Helper to generate a unique key for each route
  private getRouteKey(route: ActivatedRouteSnapshot): string {
    return route.routeConfig?.path || '';
  }
}


@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled',
    anchorScrolling: 'enabled',
  })],
  exports: [RouterModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: SkipReuseStrategy },
  ],
})
export class SkipRoutingModule {}
