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
} from './public-api';
import { SettingsComponent } from '@memberjunction/ng-explorer-settings';
import { LogError, Metadata } from '@memberjunction/core';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { EventCodes, SharedService, BaseNavigationComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';
import { SkipChatWrapperComponent } from '@memberjunction/ng-ask-skip';

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
  constructor(private sharedService: SharedService, private router: Router) {
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
    let resourceType = route.params['resourceType'];
    const resourceRecordId = route.params['resourceRecordId'];
    if (resourceType !== undefined && resourceRecordId !== undefined) {
      resourceType = this.sharedService.mapResourceTypeRouteSegmentToName(resourceType);

      const data: ResourceData = new ResourceData({
        Name: '',
        ResourceRecordID: resourceRecordId,
        ResourceTypeID: this.sharedService.ResourceTypeByName(resourceType)?.ID,
        Configuration: {},
      });

      let code: EventCodes = EventCodes.AddDashboard;
      const entityNameDecoded = decodeURIComponent(route.queryParams['Entity'] || route.queryParams['entity']);
      const md = new Metadata();
      switch (resourceType.trim().toLowerCase()) {
        case 'lists':
          code = EventCodes.ListClicked
          break;
        case 'user views':
          code = EventCodes.ViewClicked;
          break;
        case 'dashboards':
          code = EventCodes.AddDashboard;
          break;
        case 'reports':
          code = EventCodes.AddReport;
          break;
        case 'queries':
          code = EventCodes.AddQuery;
          break;
        case 'records':
          code = EventCodes.EntityRecordClicked;
          data.Configuration.Entity = entityNameDecoded; // Entity or entity is specified for this resource type since resource record id isn't good enough
          const newRecordVals = route.queryParams['NewRecordValues'] || route.queryParams['newRecordValues'];
          if (newRecordVals) {
            data.Configuration.NewRecordValues = decodeURIComponent(newRecordVals);  
          }
          data.Configuration.___rawQueryParams = route.queryParams;
          if (data.Configuration.Entity === undefined || data.Configuration.Entity === null) {
            LogError('No Entity provided in the URL, must have Entity as a query parameter for this resource type');
            return;  
          }
          else {
            const entityInfo = md.Entities.find(e => e.Name.trim().toLowerCase() === data.Configuration.Entity.trim().toLowerCase());
            if (!entityInfo) {
              LogError(`Entity ${data.Configuration.Entity} not found in metadata`);
              return;
            }
          }
          break;
        case 'search results':
          code = EventCodes.RunSearch;
          data.Configuration.Entity = entityNameDecoded;
          data.Configuration.SearchInput = resourceRecordId;
          data.ResourceRecordID = 0; /*tell nav to create new tab*/
          break;
        default:
          LogError(`Unsupported resource type: ${resourceType}`);
          // Handle the unsupported resource type error appropriately
          return;           
      }
      MJGlobal.Instance.RaiseEvent({
        component: this,
        event: MJEventType.ComponentEvent,
        eventCode: code,
        args: data,
      });
    } else {
      LogError(`ResourceType: ${resourceType} or ResourceRecordId: ${resourceRecordId} is undefined in the route parameters`);
    }
  }
}

const routes: Routes = [
  { path: '', component: HomeWrapperComponent, canActivate: [AuthGuard] },
  { path: 'home', component: HomeWrapperComponent, canActivate: [AuthGuard] },
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
  { path: 'app/:appName', component: SingleApplicationComponent, canActivate: [AuthGuard] },
  { path: 'app/:appName/:entityName', component: SingleApplicationComponent, canActivate: [AuthGuard] },
  { path: 'app/:appName/:entityName/:folderID', component: SingleApplicationComponent, canActivate: [AuthGuard] },
  { path: 'entity/:entityName', component: SingleEntityComponent, canActivate: [AuthGuard] },
  {
    path: 'resource/:resourceType/:resourceRecordId',
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
