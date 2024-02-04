import {Injectable, NgModule} from '@angular/core';
import {
  Routes,
  RouterModule,
  Resolve,
  ActivatedRouteSnapshot,
  RouterStateSnapshot
} from '@angular/router';
import { SingleApplicationComponent, SingleEntityComponent, SingleRecordComponent, HomeComponent, 
         UserNotificationsComponent, SettingsComponent, DataBrowserComponent, ReportBrowserComponent, 
         DashboardBrowserComponent, AuthGuardService as AuthGuard } from "@memberjunction/ng-explorer-core";
import { LogError} from "@memberjunction/core";
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { QueryBrowserComponent } from '@memberjunction/ng-explorer-core';
import { AskSkipComponent} from '@memberjunction/ng-ask-skip'
import { EventCodes, SharedService, ResourceData } from '@memberjunction/ng-shared'


@Injectable({
  providedIn: 'root',
})
export class ResourceResolver implements Resolve<void> {
  constructor(private sharedService: SharedService) {}  

  resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): void {
    let resourceType = route.params['resourceType'];
    const resourceRecordId = route.params['resourceRecordId'];
    if (resourceType !== undefined && resourceRecordId !== undefined) {
      resourceType = this.sharedService.mapResourceTypeRouteSegmentToName(resourceType); 

      const data: ResourceData = new ResourceData( {
        Name: '',
        ResourceRecordID: resourceRecordId,
        ResourceTypeID: this.sharedService.ResourceTypeByName(resourceType)?.ID,
        Configuration: {}
      });

      let code: EventCodes = EventCodes.AddDashboard;
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
          data.Configuration.Entity = route.queryParams['Entity'] || route.queryParams['entity']; // Entity or entity is specified for this resource type since resource record id isn't good enough

          if (data.Configuration.Entity === undefined || data.Configuration.Entity === null) {
            LogError('No Entity provided in the URL, must have Entity as a query parameter for this resource type');
            return; // should handle the error better - TO-DO
          }
          break;
        case 'search results':
          code = EventCodes.RunSearch;
          data.Configuration.Entity = route.queryParams['Entity'] || route.queryParams['entity'];
          data.Configuration.SearchInput = resourceRecordId;
          data.ResourceRecordID = 0; /*tell nav to create new tab*/
          break;
        default: 
          // unsupported resource type
          return; // should handle the error better - TO-DO
      }
      MJGlobal.Instance.RaiseEvent({
        component: this,
        event: MJEventType.ComponentEvent,
        eventCode: code,
        args: data
      })
    }
    else {
      // to-do - handle error
    }
  }
}




const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'home', component: HomeComponent, canActivate: [AuthGuard] },  
  { path: 'askskip', component: AskSkipComponent, canActivate: [AuthGuard] },
  { path: 'askskip/:conversationId', component: AskSkipComponent, canActivate: [AuthGuard] },
  { path: 'dashboards', component: DashboardBrowserComponent, canActivate: [AuthGuard] },  
  { path: 'reports', component: ReportBrowserComponent, canActivate: [AuthGuard] },  
  { path: 'queries', component: QueryBrowserComponent, canActivate: [AuthGuard] },  
  { path: 'data', component: DataBrowserComponent, canActivate: [AuthGuard] },  
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },  
  { path: 'notifications', component: UserNotificationsComponent, canActivate: [AuthGuard] },  
  { path: 'app/:appName', component: SingleApplicationComponent, canActivate: [AuthGuard] },
  { path: 'entity/:entityName', component: SingleEntityComponent, canActivate: [AuthGuard] },
  { 
    path: 'resource/:resourceType/:resourceRecordId', 
    resolve: { data: ResourceResolver },
    canActivate: [AuthGuard] ,
    component: SingleRecordComponent
  },
  {
    path: '**', redirectTo: 'home'
  } 
];


@NgModule({
  imports: [RouterModule.forRoot(routes, { initialNavigation: 'disabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }

