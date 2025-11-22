import { ComponentRef, Injectable, NgModule } from '@angular/core';
import { Routes, RouterModule, Resolve, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import {
  SingleApplicationComponent,
  SingleEntityComponent,
  SingleRecordComponent,
  HomeWrapperComponent,
  UserNotificationsComponent,
  DataBrowserComponent,
  ReportBrowserComponent,
  DashboardBrowserComponent,
  AuthGuardService as AuthGuard,
  FilesComponent,
  QueryBrowserComponent,
  ListViewComponent,
  ChatWrapperComponent,
} from './public-api';
import { StyleGuideTestComponent } from './lib/style-guide-test/style-guide-test.component';
import { SettingsComponent } from '@memberjunction/ng-explorer-settings';
import { CompositeKey, LogError, Metadata } from '@memberjunction/core';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { EventCodes, SharedService, BaseNavigationComponent, NavigationService, SYSTEM_APP_ID } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';
import { SkipChatWrapperComponent } from '@memberjunction/ng-ask-skip';
import { ApplicationManager, TabService } from '@memberjunction/ng-base-application';

export class CustomReuseStrategy implements RouteReuseStrategy {
  storedRoutes: { [key: string]: DetachedRouteHandleExt | null } = {};

  // Determines if a route should be detached and stored
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    // Store the route if it's an "askskip" route
    return route.routeConfig && route.routeConfig.path?.includes('askskip') ? true : false;
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
  private processedUrls = new Set<string>();

  constructor(
    private sharedService: SharedService,
    private router: Router,
    private appManager: ApplicationManager,
    private tabService: TabService
  ) {
    // Subscribe to router events
    this.router.events.subscribe(event => {
      // if (event instanceof NavigationEnd) {
      //   LogStatus('NavigationEnd:', event.url);
      // }
      // if (event instanceof NavigationError) {
      //   LogError(`NavigationError: ${event.error}`);
      // }
      // if (event instanceof NavigationCancel) {
      //   LogError(`NavigationCancel: ${event.reason}`);
      // }
    });
  }

  resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): void {
    console.log('[ResourceResolver.resolve] Called with URL:', state.url);

    // Prevent duplicate processing of the same URL
    if (this.processedUrls.has(state.url)) {
      console.log('[ResourceResolver.resolve] Already processed URL:', state.url);
      return;
    }
    this.processedUrls.add(state.url);
    console.log('[ResourceResolver.resolve] Processing URL for first time:', state.url);

    const md = new Metadata();

    // Handle app-level navigation: /app/:appName (no nav item - app default)
    if (route.params['appName'] !== undefined && route.params['navItemName'] === undefined) {
      const appName = decodeURIComponent(route.params['appName']);
      console.log('[ResourceResolver.resolve] App-only URL detected:', appName);

      // Find the app
      const app = md.Applications.find(a =>
        a.Name.trim().toLowerCase() === appName.trim().toLowerCase()
      );

      if (!app) {
        LogError(`Application ${appName} not found in metadata`);
        return;
      }

      console.log('[ResourceResolver.resolve] Found app:', app.Name, 'ID:', app.ID);
      console.log('[ResourceResolver.resolve] Letting shell handle default tab creation');

      // Let the app create its default tab (will load default dashboard if no nav items)
      // The shell component will handle this after setting the active app
      // We don't need to do anything here - just return to allow the app to activate
      return;
    }

    // Handle app navigation: /app/:appName/:navItemName
    if (route.params['appName'] !== undefined && route.params['navItemName'] !== undefined) {
      const appName = decodeURIComponent(route.params['appName']);
      const navItemName = decodeURIComponent(route.params['navItemName']);

      console.log('[ResourceResolver.resolve] App nav item URL detected:', appName, '/', navItemName);

      // Find the app
      const app = md.Applications.find(a =>
        a.Name.trim().toLowerCase() === appName.trim().toLowerCase()
      );

      if (!app) {
        LogError(`Application ${appName} not found in metadata`);
        return;
      }

      console.log('[ResourceResolver.resolve] Found app:', app.Name, 'ID:', app.ID);

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

      console.log('[ResourceResolver.resolve] Nav items count:', navItems.length);

      // Find the nav item by label (case-insensitive)
      const navItem = navItems.find(item =>
        item.Label?.trim().toLowerCase() === navItemName.trim().toLowerCase()
      );

      if (!navItem) {
        LogError(`Nav item ${navItemName} not found in app ${appName}`);
        return;
      }

      console.log('[ResourceResolver.resolve] Found nav item:', navItem.Label, 'ResourceType:', navItem.ResourceType);

      // Get the resource type from the nav item
      if (!navItem.ResourceType) {
        LogError(`Nav item ${navItemName} has no ResourceType defined`);
        return;
      }

      // NOTE: Don't set active app here - the shell component handles that
      // based on the URL to avoid navigation loops

      // Queue tab request via TabService
      console.log('[ResourceResolver.resolve] Queuing tab request via TabService');
      this.tabService.OpenTab({
        ApplicationId: app.ID,
        Title: navItem.Label,
        Configuration: {
          route: navItem.Route,
          resourceType: navItem.ResourceType,
          recordId: navItem.RecordId,
          appName: appName,
          appId: app.ID,
          navItemName: navItem.Label,
          ...(navItem.Configuration || {}),
          queryParams: route.queryParams
        },
        IsPinned: false
      });
      console.log('[ResourceResolver.resolve] Tab request queued');
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

    LogError(`Unable to parse resource route parameters from URL: ${state.url}`);
  }
}

const routes: Routes = [
  { path: '', component: HomeWrapperComponent, canActivate: [AuthGuard] },
  { path: 'home', component: HomeWrapperComponent, canActivate: [AuthGuard] },
  { path: 'chat', component: ChatWrapperComponent, canActivate: [AuthGuard] },
  { path: 'chat/:conversationId', component: ChatWrapperComponent, canActivate: [AuthGuard] },
  { path: 'askskip', component: SkipChatWrapperComponent, canActivate: [AuthGuard] },
  { path: 'askskip/:conversationId', component: SkipChatWrapperComponent, canActivate: [AuthGuard] },
  { path: 'dashboards', component: DashboardBrowserComponent, canActivate: [AuthGuard] },
  { path: 'dashboards/:folderID', component: DashboardBrowserComponent, canActivate: [AuthGuard] },
  { path: 'reports', component: ReportBrowserComponent, canActivate: [AuthGuard] },
  { path: 'reports/:folderID', component: ReportBrowserComponent, canActivate: [AuthGuard] },
  { path: 'queries', component: QueryBrowserComponent, canActivate: [AuthGuard] },
  { path: 'queries/:folderID', component: QueryBrowserComponent, canActivate: [AuthGuard] },
  { path: 'data', component: DataBrowserComponent, canActivate: [AuthGuard] },
  { path: 'files', component: FilesComponent, canActivate: [AuthGuard] },
  { path: 'lists', component: ListViewComponent, canActivate: [AuthGuard] },
  { path: 'lists/:folderID', component: ListViewComponent, canActivate: [AuthGuard] },
  {
    path: 'settings',
    component: SettingsComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        component: SettingsComponent,
        pathMatch: 'full',
      },
      {
        path: '**',
        component: SettingsComponent,
      },
    ],
  },
  { path: 'notifications', component: UserNotificationsComponent, canActivate: [AuthGuard] },
  { path: 'style-guide-test', component: StyleGuideTestComponent, canActivate: [AuthGuard] },
  { path: 'entity/:entityName', component: SingleEntityComponent, canActivate: [AuthGuard] },
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
    path: '**',
    redirectTo: 'home',
  },
];

interface DetachedRouteHandleExt extends DetachedRouteHandle {
  componentRef: ComponentRef<any>;
}

@NgModule({
  imports: [RouterModule.forRoot(routes, { initialNavigation: 'disabled', onSameUrlNavigation: 'reload' })],
  exports: [RouterModule],
})
export class AppRoutingModule {
  constructor(private router: Router) {
    this.loadDynamicRoutes();
  }

  loadDynamicRoutes() {
    MJGlobal.Instance.GetEventListener(true) // true gets us replay of past events so we can "catch up" as needed
      .subscribe((event: MJEvent) => {
          // event handler
          switch (event.event) {
            case MJEventType.LoggedIn:
              this.innerLoadDynamicRoutes();
          }
      });
  }

  protected async innerLoadDynamicRoutes() {
    // gets called after we're logged in
    const md = new Metadata();
    const dynamicRoutes: Routes = md.VisibleExplorerNavigationItems.map(item => {
      const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseNavigationComponent, item.Name)
      if (registration) {
        // remove the leading slash from the route if it exists
        const route = item.Route.startsWith('/') ? item.Route.substring(1) : item.Route;
        return {
          path: route,
          component: registration.SubClass,
          canActivate: [AuthGuard],  
        }
      }
      else {
        throw new Error(`No registration found for Explorer Navigation Item: ${item.Name}`);
      }
    });

    // Find and remove the wildcard route
    const wildcardRouteIndex = routes.findIndex(route => route.path?.trim() === '**');
    const wildcardRoute = routes[wildcardRouteIndex];
    if (wildcardRouteIndex > -1) {
      routes.splice(wildcardRouteIndex, 1);
    }

    // create a combined routes array and make sure that we filter out any dynamic routes that are ALREADY in the router config
    const newCombinedRoutes = [...routes, ...dynamicRoutes.filter(route => !routes.some(r => r.path?.trim().toLowerCase() === route.path?.trim().toLowerCase()))];

    // Re-add the wildcard route at the end
    if (wildcardRoute) {
      newCombinedRoutes.push(wildcardRoute);
    }

    this.router.resetConfig(newCombinedRoutes);
  }
}
