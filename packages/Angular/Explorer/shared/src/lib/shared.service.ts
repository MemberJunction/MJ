import { ElementRef, Injectable } from '@angular/core';
import { BaseEntity, EntityInfo, LogError, Metadata, RunView } from '@memberjunction/core';
import { ResourcePermissionEngine, ResourceTypeEntity, UserNotificationEntity, ViewColumnInfo } from '@memberjunction/core-entities';
import { MJEventType, MJGlobal, DisplaySimpleNotificationRequestData, ConvertMarkdownStringToHtmlList } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Subject, Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { first, tap } from 'rxjs/operators';
import { NotificationService, NotificationSettings } from "@progress/kendo-angular-notification";
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Injectable({
  providedIn: 'root'
})
export class SharedService {
  private static _instance: SharedService;
  private static _loaded: boolean = false;
  private static _resourceTypes: ResourceTypeEntity[] = [];
  private static isLoading$ = new BehaviorSubject<boolean>(false);
  private tabChange = new Subject();
  tabChange$ = this.tabChange.asObservable();

  constructor(private notificationService: NotificationService, private mjNotificationsService: MJNotificationService) {
    if (SharedService._instance) {
      // return existing instance which will short circuit the creation of a new instance
      return SharedService._instance;
    }
    // first time this has been called, so return ourselves since we're in the constructor
    SharedService._instance = this;

    MJGlobal.Instance.GetEventListener(true).subscribe(async (event) => {
      switch (event.event) {
        case MJEventType.LoggedIn:
          if (SharedService._loaded === false)  {
            const p1 = SharedService.RefreshData(false);
            const p2 = ResourcePermissionEngine.Instance.Config(); // make sure that we get resource permissions configured
            await Promise.all([p1, p2]);
          }
          break;
      }      
    });    
  }

  public static get Instance(): SharedService {
    return SharedService._instance;
  }

  /**
   * Returns the current session ID, which is automatically created when the service is instantiated.
   */
  public get SessionId(): string {
    return (<GraphQLDataProvider>Metadata.Provider).sessionId;
  }

  public get ResourceTypes(): ResourceTypeEntity[] {
    return SharedService._resourceTypes;
  }
  public get ViewResourceType(): ResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'user views')!;
  }
  public get RecordResourceType(): ResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'records')!;
  }
  public get DashboardResourceType(): ResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'dashboards')!;
  }
  public get ReportResourceType(): ResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'reports')!;
  }
  public get SearchResultsResourceType(): ResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'search results')!;
  }
  public get ListResourceType(): ResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'lists')!;
  }
  public ResourceTypeByID(id: string): ResourceTypeEntity | undefined {
    return SharedService._resourceTypes.find(rt => rt.ID === id);
  }
  public ResourceTypeByName(name: string): ResourceTypeEntity | undefined {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === name.trim().toLowerCase());
  }

  /**
   * Refreshes the data for the service. If OnlyIfNeeded is true, then the data is only refreshed if it hasn't been loaded yet.
   */
  public static async RefreshData(OnlyIfNeeded: boolean = false) {
    if (OnlyIfNeeded && SharedService._loaded) {
      return;
    }

    const canProceed$ = SharedService.isLoading$.pipe(
      first(isLoading => !isLoading),
      tap(() => SharedService.isLoading$.next(true))
    );

    await firstValueFrom(canProceed$);

    try {
      // After waiting for the current loading operation to complete, check again
      // if _loaded is true and OnlyIfNeeded is true, return early
      if (OnlyIfNeeded && SharedService._loaded) {
        return;
      }

      await SharedService.handleDataLoading();

      // Mark as loaded
      SharedService._loaded = true;
    } finally {
      // Ensure we always reset the loading flag
      SharedService.isLoading$.next(false);
    }
  }

  private static async handleDataLoading() {
    const md = new Metadata();

    await ResourcePermissionEngine.Instance.Config(); // don't reload if already loaded
    this._resourceTypes = ResourcePermissionEngine.Instance.ResourceTypes;

    await SharedService.RefreshUserNotifications();  
  }  

  FormatColumnValue(col: ViewColumnInfo, value: any, maxLength: number = 0, trailingChars: string = "...") {
    if (value === null || value === undefined)
      return value;

    try {
      const retVal = col.EntityField.FormatValue(value, 0);
      if (maxLength > 0 && retVal && retVal.length > maxLength)
        return retVal.substring(0, maxLength) + trailingChars;
      else
        return retVal;
    }
    catch (e) {
      LogError(e);
      return value;
    }
  }

  public ConvertMarkdownStringToHtmlList(listType: HtmlListType, text: string): string {
    return ConvertMarkdownStringToHtmlList(listType, text);
  }

  
  public InvokeManualResize(delay: number = 50) {
    setTimeout(() => {
      MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ManualResizeRequest,
        eventCode: '',
        args: null,
        component: this
      })
    }, delay ); // give the tabstrip time to render
  }

  public PushStatusUpdates(): Observable<string> {
    const gp: GraphQLDataProvider = <GraphQLDataProvider>Metadata.Provider;
    return gp.PushStatusUpdates();
  }

  private _currentUserImage: string | Blob = '/assets/user.png';
  public get CurrentUserImage(): string | Blob {
    return this._currentUserImage;
  }
  public set CurrentUserImage(value: string | Blob) {
    this._currentUserImage = value;
  }

  /**
   * @deprecated Use MJNotificationService.UserNotifications instead
   */
  public static get UserNotifications(): UserNotificationEntity[] {
    return MJNotificationService.UserNotifications;
  }
  /**
   * @deprecated Use MJNotificationService.UnreadUserNotifications instead
   */
  public static get UnreadUserNotifications(): UserNotificationEntity[] {
    return MJNotificationService.UnreadUserNotifications;
  }
  /**
   * @deprecated Use MJNotificationService.UnreadUserNotificationCount instead
   */
  public static get UnreadUserNotificationCount(): number {
    return MJNotificationService.UnreadUserNotificationCount;
  }

  /**
   * Utility method that returns true if child is a descendant of parent, false otherwise. 
   */
  public static IsDescendant(parent: ElementRef, child: ElementRef) {
    if (parent && child && parent.nativeElement && child.nativeElement) {
      let node = child.nativeElement.parentNode;
      while (node != null) {
        if (node == parent.nativeElement) {
          return true;
        }
        node = node.parentNode;
      }
    }
    return false;
  }


  /**
   * Creates a notification in the database and refreshes the UI. Returns the notification object.
   * @param title 
   * @param message 
   * @param resourceTypeId 
   * @param resourceRecordId 
   * @param resourceConfiguration Any object, it is converted to a string by JSON.stringify and stored in the database
   * @returns 
   * @deprecated Use MJNotificationService.CreateNotification instead
   */
  public async CreateNotification(title: string, message: string, resourceTypeId: string | null, resourceRecordId: string | null, resourceConfiguration: any | null, displayToUser : boolean = true): Promise<UserNotificationEntity> {
    return this.mjNotificationsService.CreateNotification(title, message, resourceTypeId, resourceRecordId, resourceConfiguration, displayToUser);
  }

  /**
   * @deprecated Use MJNotificationService.RefreshUserNotifications instead
   */
  public static async RefreshUserNotifications() {
    MJNotificationService.RefreshUserNotifications();
  }

  /**
   * Creates a message that is not saved to the User Notifications table, but is displayed to the user.
   * @param message - text to display
   * @param style - display styling
   * @param hideAfter - option to auto hide after the specified delay in milliseconds
   * @deprecated Use MJNotificationService.CreateSimpleNotification instead
   */
  public CreateSimpleNotification(message: string, style: "none" | "success" | "error" | "warning" | "info" = "success", hideAfter?: number) {
    return this.mjNotificationsService.CreateSimpleNotification(message, style, hideAfter);
  }



  private _resourceTypeMap = [
    { routeSegment: 'record', name: 'records' },
    { routeSegment: 'view', name: 'user views' },
    { routeSegment: 'search', name: 'search results' },
    { routeSegment: 'report', name: 'reports' },
    { routeSegment: 'query', name: 'queries' },
    { routeSegment: 'dashboard', name: 'dashboards' },
    { routeSegment: 'list', name: 'lists' },
    
  ]
  /**
   * Maps a Resource Type record Name column to the corresponding route segment
   * @param resourceTypeName 
   * @returns 
   */
  public mapResourceTypeNameToRouteSegment(resourceTypeName: string) {
    const item =  this._resourceTypeMap.find(rt => rt.name.trim().toLowerCase() === resourceTypeName.trim().toLowerCase());
    if (item)
      return item.routeSegment;
    else
      return null 
  }

  /**
   * Maps a route segment to the corresponding Resource Type record Name column
   * @param resourceRouteSegment 
   * @returns 
   */
  public mapResourceTypeRouteSegmentToName(resourceRouteSegment: string) {
    const item =  this._resourceTypeMap.find(rt => rt.routeSegment.trim().toLowerCase() === resourceRouteSegment.trim().toLowerCase());
    if (item)
      return item.name;
    else
      return null 
  }
}

export const HtmlListType = {
  Unordered: 'Unordered',
  Ordered: 'Ordered',
} as const;

export type HtmlListType = typeof HtmlListType[keyof typeof HtmlListType];


export const EventCodes = {
  ViewClicked: "ViewClicked",
  EntityRecordClicked: "EntityRecordClicked",
  AddDashboard: "AddDashboard",
  AddReport: "AddReport",
  AddQuery: "AddQuery",
  ViewCreated: "ViewCreated",
  ViewUpdated: "ViewUpdated",
  RunSearch: "RunSearch",
  ViewNotifications: "ViewNotifications",
  PushStatusUpdates: "PushStatusUpdates",
  UserNotificationsUpdated: "UserNotificationsUpdated",
  CloseCurrentTab: "CloseCurrentTab",
  ListCreated: "ListCreated",
  ListClicked: 'ListClicked'
} as const;

export type EventCodes = typeof EventCodes[keyof typeof EventCodes];