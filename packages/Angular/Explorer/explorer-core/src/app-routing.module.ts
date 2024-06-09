import { ComponentRef, Injectable, NgModule } from '@angular/core';
import { Routes, RouterModule, Resolve, ActivatedRouteSnapshot, RouterStateSnapshot, Router, NavigationEnd, NavigationError, NavigationCancel } from '@angular/router';
import {
  SingleApplicationComponent,
  SingleEntityComponent,
  SingleRecordComponent,
  HomeComponent,
  UserNotificationsComponent,
  DataBrowserComponent,
  ReportBrowserComponent,
  DashboardBrowserComponent,
  AuthGuardService as AuthGuard,
  FilesComponent,
  QueryBrowserComponent,
  ListViewComponent,
  SingleListDetailComponent
} from './public-api';
import { SettingsComponent } from '@memberjunction/ng-explorer-settings';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { SkipChatComponent } from '@memberjunction/ng-ask-skip';
import { EventCodes, SharedService, ResourceData } from '@memberjunction/ng-shared';
import { DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

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
    return future.routeConfig === curr.routeConfig;
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
      if (event instanceof NavigationEnd) {
        LogStatus('NavigationEnd:', event.url);
      }
      if (event instanceof NavigationError) {
        LogError(`NavigationError: ${event.error}`);
      }
      if (event instanceof NavigationCancel) {
        LogError(`NavigationCancel: ${event.reason}`);
      }
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
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'home', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'askskip', component: SkipChatComponent, canActivate: [AuthGuard] },
  { path: 'askskip/:conversationId', component: SkipChatComponent, canActivate: [AuthGuard] },
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
  { path: 'listdetails/:listID', component: SingleListDetailComponent, canActivate: [AuthGuard] },
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
  imports: [RouterModule.forRoot(routes, { initialNavigation: 'disabled' })],
  exports: [RouterModule],
})

export class AppRoutingModule {}
