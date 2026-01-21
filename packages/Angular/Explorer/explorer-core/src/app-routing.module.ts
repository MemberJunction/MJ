import { ComponentRef, Injectable, NgModule } from '@angular/core';
import { Routes, RouterModule, Resolve, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import {
  SingleRecordComponent,
  AuthGuardService as AuthGuard
} from './public-api';
import { LogError, Metadata, StartupManager } from '@memberjunction/core';
import { SharedService, SYSTEM_APP_ID } from '@memberjunction/ng-shared';
import { DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';
import { ApplicationManager, TabService } from '@memberjunction/ng-base-application';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { firstValueFrom, filter, take } from 'rxjs';

export class CustomReuseStrategy implements RouteReuseStrategy {
  storedRoutes: { [key: string]: DetachedRouteHandleExt | null } = {};

  // Determines if a route should be detached and stored
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    // removed reference to the skip stuff from here - we don't use the skip stuff anymore, using generic conversations/chat now
    return false;
  }

  // Stores the detached route
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandleExt | null): void {
    if(!handle){
      return;
    }

    if (route.routeConfig && route.routeConfig.path) {
      this.storedRoutes[route.routeConfig.path] = handle;
      this.callHook(handle, 'ngOnDetach');
    }
  }

  // Determines if a stored route should be reattached
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    // Reattach if we have a stored route for the incoming route
    if (route.routeConfig?.path) {
      return !!route.routeConfig && !!this.storedRoutes[route.routeConfig.path];
    }

    else return false;
  }

  // Retrieves the stored route; null means no stored route for this path
  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    if (!route.routeConfig || (route.routeConfig.path && !this.storedRoutes[route.routeConfig.path])) {
      return null;
    } 
    else if (route.routeConfig.path) {
      const path = this.storedRoutes[route.routeConfig.path];
      if(path){
        this.callHook(path, 'ngOnAttach');
        return path;
      }
    }

    return null;
  }

  // Determines if the route should be reused
  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    // we need to compare the params object from future and curr and see if any differences
    // and do the same for the queryParams object from each
    // if there are differences, return false, otherwise return true
    const futureParams = future.params;
    const currParams = curr.params;
    const futureQueryParams = future.queryParams;
    const currQueryParams = curr.queryParams;

    // only reuse (e.g. return true) when all of these comparisons are the same
    return this.objectContentsEqual(futureParams, currParams) &&  // route params are the same
           this.objectContentsEqual(futureQueryParams, currQueryParams) &&  // query params are the same
           future.routeConfig === curr.routeConfig; // route config object is the same
  }

  objectContentsEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) {
      return true; // exact same object
    }

    if (obj1 === null && obj2 !== null) {
      return false; // not the same object
    }

    if (obj1 === undefined && obj2 !== undefined) {
      return false; // not the same object
    }

    if (typeof obj1 === 'object' || typeof obj2 === 'object') {
      if (Object.keys(obj1).length !== Object.keys(obj2).length) {
        return false; // different number of keys
      }
  
      for (const key in obj1) {
        // check to see the type of the key, if it is an object, then we call this function recursively 
        // otherwise we do simple comparison
        if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
          if (!this.objectContentsEqual(obj1[key], obj2[key])) {
            return false; // any individual key not matching means the objects are different
          }
        }
        else if (obj1[key] !== obj2[key]) {
          return false; // any individual key not matching means the objects are different
        }
      }  
    }

    return true;
  }

  private callHook(detachedTree: DetachedRouteHandleExt, hookName: 'ngOnDetach' | 'ngOnAttach'): void {
    if(!detachedTree || !hookName){
      return;
    }

    const componentRef = detachedTree.componentRef;
    if (componentRef && componentRef.instance && typeof componentRef.instance[hookName] === 'function') {
      componentRef.instance[hookName]();
    }
  }
}

@Injectable({
  providedIn: 'root',
})
export class ResourceResolver implements Resolve<void> {
  private processedUrls = new Map<string, number>();
  private readonly URL_DEBOUNCE_MS = 100; // Allow same URL after 100ms
  private loggedInPromise: Promise<void> | null = null;

  constructor(
    private sharedService: SharedService,
    private router: Router,
    private appManager: ApplicationManager,
    private tabService: TabService
  ) {
    // Create a promise that resolves when the user is logged in and metadata is loaded
    this.loggedInPromise = this.waitForLogin();
  }

  /**
   * Wait for the LoggedIn event which indicates metadata is loaded.
   * Uses replay (true) to catch the event even if it already fired.
   */
  private async waitForLogin(): Promise<void> {
    await firstValueFrom(
      MJGlobal.Instance.GetEventListener(true).pipe(
        filter(event => event.event === MJEventType.LoggedIn),
        take(1)
      )
    );

    await StartupManager.Instance.Startup();
  }

  async resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<void> {
    // Wait for login/metadata to be ready before processing
    if (this.loggedInPromise) {
      await this.loggedInPromise;
    }

    // Prevent duplicate processing of the same URL within a short time window
    // This allows legitimate re-navigation to the same URL (like app switching)
    // while preventing rapid duplicate calls
    const now = Date.now();
    const lastProcessed = this.processedUrls.get(state.url);

    if (lastProcessed && (now - lastProcessed) < this.URL_DEBOUNCE_MS) {
      return;
    }

    this.processedUrls.set(state.url, now);

    // Check if this resolve should be suppressed (URL sync from tab click, not real navigation)
    if (this.tabService.ShouldSuppressResolve()) {
      this.tabService.ClearSuppressFlag();
      return;
    }

    const md = new Metadata();
    const applications = md.Applications;

    // Known resource types for app-scoped resource URLs
    const KNOWN_RESOURCE_TYPES = ['dashboard', 'record', 'view', 'query', 'report', 'artifact', 'search'];

    // Handle app-scoped resource navigation: /app/:appName/:resourceType/:param1/:param2?
    // This pattern supports resources opened within an app context (e.g., /app/home/dashboard/abc123)
    // Only handle if the second path segment is a known resource type
    if (route.params['appName'] !== undefined &&
        route.params['resourceType'] !== undefined &&
        KNOWN_RESOURCE_TYPES.includes(route.params['resourceType'].toLowerCase())) {
      const appName = decodeURIComponent(route.params['appName']);
      const resourceType = route.params['resourceType'].toLowerCase();
      const param1 = route.params['param1'];
      const param2 = route.params['param2'];

      // Check app access
      const accessResult = this.appManager.CheckAppAccess(appName);
      if (accessResult.status !== 'accessible') {
        console.log(`[ResourceResolver] User cannot access app "${appName}": ${accessResult.status}`);
        return;
      }

      // Get the app for its ID
      const app = this.appManager.GetAppByPath(appName) || this.appManager.GetAppByName(appName);
      if (!app) {
        LogError(`Application ${appName} not found in metadata`);
        return;
      }

      // Handle based on resource type
      switch (resourceType) {
        case 'dashboard': {
          // /app/:appName/dashboard/:dashboardId
          const dashboardId = param1;
          this.tabService.OpenTab({
            ApplicationId: app.ID,
            Title: `Dashboard - ${dashboardId}`,
            Configuration: {
              resourceType: 'Dashboards',
              dashboardId,
              recordId: dashboardId,
              appName: appName,
              appId: app.ID
            },
            ResourceRecordId: dashboardId,
            IsPinned: false
          });
          return;
        }

        case 'record': {
          // /app/:appName/record/:entityName/:recordId
          const entityName = decodeURIComponent(param1);
          const recordId = param2;

          const entityInfo = md.Entities.find(e => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase());
          if (!entityInfo) {
            LogError(`Entity ${entityName} not found in metadata`);
            return;
          }

          this.tabService.OpenTab({
            ApplicationId: app.ID,
            Title: `${entityName} - ${recordId}`,
            Configuration: {
              resourceType: 'Records',
              Entity: entityName,
              recordId: recordId,
              appName: appName,
              appId: app.ID
            },
            ResourceRecordId: recordId,
            IsPinned: false
          });
          return;
        }

        case 'view': {
          // /app/:appName/view/:viewId OR /app/:appName/view/dynamic/:entityName
          if (param1 === 'dynamic' && param2) {
            // Dynamic view: /app/:appName/view/dynamic/:entityName
            const entityName = decodeURIComponent(param2);
            const extraFilter = route.queryParams['ExtraFilter'] || route.queryParams['extraFilter'];
            const filterSuffix = extraFilter ? ' (Filtered)' : '';

            this.tabService.OpenTab({
              ApplicationId: app.ID,
              Title: `${entityName}${filterSuffix}`,
              Configuration: {
                resourceType: 'User Views',
                Entity: entityName,
                ExtraFilter: extraFilter,
                isDynamic: true,
                recordId: 'dynamic',
                appName: appName,
                appId: app.ID
              },
              ResourceRecordId: 'dynamic',
              IsPinned: false
            });
          } else {
            // Saved view: /app/:appName/view/:viewId
            const viewId = param1;

            this.tabService.OpenTab({
              ApplicationId: app.ID,
              Title: `View - ${viewId}`,
              Configuration: {
                resourceType: 'User Views',
                viewId,
                recordId: viewId,
                appName: appName,
                appId: app.ID
              },
              ResourceRecordId: viewId,
              IsPinned: false
            });
          }
          return;
        }

        case 'query': {
          // /app/:appName/query/:queryId
          const queryId = param1;

          this.tabService.OpenTab({
            ApplicationId: app.ID,
            Title: `Query - ${queryId}`,
            Configuration: {
              resourceType: 'Queries',
              queryId,
              recordId: queryId,
              appName: appName,
              appId: app.ID
            },
            ResourceRecordId: queryId,
            IsPinned: false
          });
          return;
        }

        case 'report': {
          // /app/:appName/report/:reportId
          const reportId = param1;

          this.tabService.OpenTab({
            ApplicationId: app.ID,
            Title: `Report - ${reportId}`,
            Configuration: {
              resourceType: 'Reports',
              reportId,
              recordId: reportId,
              appName: appName,
              appId: app.ID
            },
            ResourceRecordId: reportId,
            IsPinned: false
          });
          return;
        }

        case 'artifact': {
          // /app/:appName/artifact/:artifactId
          const artifactId = param1;

          this.tabService.OpenTab({
            ApplicationId: app.ID,
            Title: `Artifact - ${artifactId}`,
            Configuration: {
              resourceType: 'Artifacts',
              artifactId,
              recordId: artifactId,
              appName: appName,
              appId: app.ID
            },
            ResourceRecordId: artifactId,
            IsPinned: false
          });
          return;
        }

        case 'search': {
          // /app/:appName/search/:searchInput
          const searchInput = decodeURIComponent(param1);
          const entityName = route.queryParams['Entity'] || '';

          this.tabService.OpenTab({
            ApplicationId: app.ID,
            Title: `Search: ${searchInput}`,
            Configuration: {
              resourceType: 'Search Results',
              Entity: entityName,
              SearchInput: searchInput,
              recordId: searchInput,
              appName: appName,
              appId: app.ID
            },
            ResourceRecordId: searchInput,
            IsPinned: false
          });
          return;
        }

        default:
          LogError(`Unknown resource type in app-scoped URL: ${resourceType}`);
          return;
      }
    }

    // Handle app-level navigation: /app/:appName (no nav item - app default)
    if (route.params['appName'] !== undefined && route.params['navItemName'] === undefined) {
      const appName = decodeURIComponent(route.params['appName']);

      // IMPORTANT: Check if user has access to this app BEFORE proceeding
      // Use the ApplicationManager's access check which respects UserApplication records
      const accessResult = this.appManager.CheckAppAccess(appName);

      if (accessResult.status !== 'accessible') {
        // User doesn't have access - let the shell component handle the error dialog
        // Don't create any tabs here
        console.log(`[ResourceResolver] User cannot access app "${appName}": ${accessResult.status}`);
        return;
      }

      // Let the app create its default tab (will load default dashboard if no nav items)
      // The shell component will handle this after setting the active app
      // We don't need to do anything here - just return to allow the app to activate
      return;
    }

    // Handle app navigation: /app/:appName/:navItemName
    if (route.params['appName'] !== undefined && route.params['navItemName'] !== undefined) {
      const appName = decodeURIComponent(route.params['appName']);
      const navItemName = decodeURIComponent(route.params['navItemName']);

      // IMPORTANT: Check if user has access to this app BEFORE proceeding
      // Use the ApplicationManager's access check which respects UserApplication records
      const accessResult = this.appManager.CheckAppAccess(appName);

      if (accessResult.status !== 'accessible') {
        // User doesn't have access - let the shell component handle the error dialog
        // Don't create any tabs here
        console.log(`[ResourceResolver] User cannot access app "${appName}": ${accessResult.status}`);
        return;
      }

      // Find the app in metadata for nav item details
      const app = applications.find(a =>
        a.Path.trim().toLowerCase() === appName.trim().toLowerCase()  ||
        a.Name.trim().toLowerCase() === appName.trim().toLowerCase()
      );

      if (!app) {
        LogError(`Application ${appName} not found in metadata`);
        return;
      }

      // Get nav items from the app's DefaultNavItems JSON
      let navItems: any[] = [];
      if (app.DefaultNavItems) {
        try {
          navItems = JSON.parse(app.DefaultNavItems);
        } catch (e) {
          LogError(`Failed to parse DefaultNavItems for app ${appName}`);
          console.error(e);
          return;
        }
      }

      // Find the nav item by label (case-insensitive)
      const navItem = navItems.find(item =>
        item.Label?.trim().toLowerCase() === navItemName.trim().toLowerCase()
      );

      if (!navItem) {
        LogError(`Nav item ${navItemName} not found in app ${appName}`);
        return;
      }

      // Get the resource type from the nav item
      if (!navItem.ResourceType) {
        LogError(`Nav item ${navItemName} has no ResourceType defined`);
        return;
      }

      // NOTE: Don't set active app here - the shell component handles that
      // based on the URL to avoid navigation loops

      // Queue tab request via TabService
      // Build configuration - include DriverClass for Custom resource types
      const config: any = {
        route: navItem.Route,
        resourceType: navItem.ResourceType,
        recordId: navItem.RecordID,
        appName: appName,
        appId: app.ID,
        navItemName: navItem.Label,
        ...(navItem.Configuration || {}),
        queryParams: route.queryParams
      };

      // For Custom resource types, include the DriverClass
      if (navItem.ResourceType === 'Custom' && navItem.DriverClass) {
        config.driverClass = navItem.DriverClass;
      }

      this.tabService.OpenTab({
        ApplicationId: app.ID,
        Title: navItem.Label,
        Configuration: config,
        IsPinned: false
      });

      return;
    }

    // Determine resource type and record ID based on the route path
    if (route.params['recordId'] !== undefined && route.params['entityName'] !== undefined) {
      // /resource/record/:entityName/:recordId
      const entityName = decodeURIComponent(route.params['entityName']);
      const recordId = route.params['recordId'];

      const entityInfo = md.Entities.find(e => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase());
      if (!entityInfo) {
        LogError(`Entity ${entityName} not found in metadata`);
        return;
      }

      // Queue tab request via TabService
      this.tabService.OpenTab({
        ApplicationId: SYSTEM_APP_ID,
        Title: `${entityName} - ${recordId}`,
        Configuration: {
          resourceType: 'Records',
          Entity: entityName,
          recordId: recordId
        },
        ResourceRecordId: recordId,
        IsPinned: false
      });
      return;
    }

    if (route.params['viewId'] !== undefined) {
      // /resource/view/:viewId (saved views)
      const viewId = route.params['viewId'];

      // Queue tab request via TabService
      this.tabService.OpenTab({
        ApplicationId: SYSTEM_APP_ID,
        Title: `View - ${viewId}`,
        Configuration: {
          resourceType: 'User Views',
          viewId,
          recordId: viewId
        },
        ResourceRecordId: viewId,
        IsPinned: false
      });
      return;
    }

    if (route.url.length >= 3 && route.url[1].path === 'view' && route.url[2].path === 'dynamic') {
      // /resource/view/dynamic/:entityName
      const entityName = decodeURIComponent(route.params['entityName']);
      const extraFilter = route.queryParams['ExtraFilter'] || route.queryParams['extraFilter'];

      const filterSuffix = extraFilter ? ' (Filtered)' : '';

      // Queue tab request via TabService
      this.tabService.OpenTab({
        ApplicationId: SYSTEM_APP_ID,
        Title: `${entityName}${filterSuffix}`,
        Configuration: {
          resourceType: 'User Views',
          Entity: entityName,
          ExtraFilter: extraFilter,
          isDynamic: true,
          recordId: 'dynamic'
        },
        ResourceRecordId: 'dynamic',
        IsPinned: false
      });
      return;
    }

    if (route.params['dashboardId'] !== undefined) {
      // /resource/dashboard/:dashboardId
      const dashboardId = route.params['dashboardId'];

      // Queue tab request via TabService
      this.tabService.OpenTab({
        ApplicationId: SYSTEM_APP_ID,
        Title: `Dashboard - ${dashboardId}`,
        Configuration: {
          resourceType: 'Dashboards',
          dashboardId,
          recordId: dashboardId
        },
        ResourceRecordId: dashboardId,
        IsPinned: false
      });
      return;
    }

    if (route.params['artifactId'] !== undefined) {
      // /resource/artifact/:artifactId
      const artifactId = route.params['artifactId'];

      // Queue tab request via TabService
      this.tabService.OpenTab({
        ApplicationId: SYSTEM_APP_ID,
        Title: `Artifact - ${artifactId}`,
        Configuration: {
          resourceType: 'Artifacts',
          artifactId,
          recordId: artifactId
        },
        ResourceRecordId: artifactId,
        IsPinned: false
      });
      return;
    }

    if (route.params['queryId'] !== undefined) {
      // /resource/query/:queryId
      const queryId = route.params['queryId'];

      // Queue tab request via TabService
      this.tabService.OpenTab({
        ApplicationId: SYSTEM_APP_ID,
        Title: `Query - ${queryId}`,
        Configuration: {
          resourceType: 'Queries',
          queryId,
          recordId: queryId
        },
        ResourceRecordId: queryId,
        IsPinned: false
      });
      return;
    }

    if (route.params['searchInput'] !== undefined) {
      // /resource/search/:searchInput
      const searchInput = decodeURIComponent(route.params['searchInput']);
      const entityName = route.queryParams['Entity'] || '';

      // Queue tab request via TabService
      this.tabService.OpenTab({
        ApplicationId: SYSTEM_APP_ID,
        Title: `Search: ${searchInput}`,
        Configuration: {
          resourceType: 'Search Results',
          Entity: entityName,
          SearchInput: searchInput,
          recordId: searchInput
        },
        ResourceRecordId: searchInput,
        IsPinned: false
      });
      return;
    }

    LogError(`Unable to parse resource route parameters from URL: ${state.url}`);
  }
}

const routes: Routes = [
  // App-scoped resource routes (new pattern)
  // These must come BEFORE app/:appName/:navItemName to be matched first
  {
    path: 'app/:appName/view/dynamic/:param2',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
    data: { resourceType: 'view' }
  },
  {
    path: 'app/:appName/record/:param1/:param2',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
    data: { resourceType: 'record' }
  },
  {
    path: 'app/:appName/:resourceType/:param1',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  // App navigation routes
  {
    path: 'app/:appName/:navItemName',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  {
    path: 'app/:appName',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  // Legacy resource routes (kept for backward compatibility, will redirect in future)
  {
    path: 'resource/record/:entityName/:recordId',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  {
    path: 'resource/view/dynamic/:entityName',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  {
    path: 'resource/view/:viewId',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  {
    path: 'resource/dashboard/:dashboardId',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  {
    path: 'resource/artifact/:artifactId',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  {
    path: 'resource/query/:queryId',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  },
  {
    path: 'resource/search/:searchInput',
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard],
    component: SingleRecordComponent,
  } 
];

interface DetachedRouteHandleExt extends DetachedRouteHandle {
  componentRef: ComponentRef<any>;
}

@NgModule({
  imports: [RouterModule.forRoot(routes, { onSameUrlNavigation: 'reload' })],
  exports: [RouterModule],
})
export class AppRoutingModule {
  // NOTE - in MJ Explorer 3.0 and beyond we do NOT use Explorer Navigation Items anymore and
  // this allows us to remove the dyanmic route stuff entirely here. The NEW paradigm is 
  // everything beyond resource navigation is an app and apps have the ability to define 
  // nav items which is a superset of functionality compared to the old Explorer Nav Items.
}