import { ElementRef, Injectable } from '@angular/core';
import { BaseEntity, EntityInfo, LogError, Metadata, RunView } from '@memberjunction/core';
import { ResourceTypeEntity, UserNotificationEntity, ViewColumnInfo } from '@memberjunction/core-entities';
import { MJEventType, MJGlobal, DisplaySimpleNotificationRequestData } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Subject, Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { first, tap } from 'rxjs/operators';
import { NotificationService, NotificationSettings } from "@progress/kendo-angular-notification";

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

  constructor(private notificationService: NotificationService) {
    if (SharedService._instance) {
      // return existing instance which will short circuit the creation of a new instance
      return SharedService._instance;
    }
    // first time this has been called, so return ourselves since we're in the constructor
    SharedService._instance = this;

    MJGlobal.Instance.GetEventListener(true).subscribe( (event) => {
      switch (event.event) {
        case MJEventType.DisplaySimpleNotificationRequest: 
          // received the message to display a notification to the user, so do that...
          const messageData: DisplaySimpleNotificationRequestData = <DisplaySimpleNotificationRequestData>event.args;
          this.CreateSimpleNotification(messageData.message,messageData.style, messageData.DisplayDuration);
          break;
        case MJEventType.ComponentEvent:
          if (event.eventCode === EventCodes.UserNotificationsUpdated) {
            // refresh the user notifications
            SharedService.RefreshUserNotifications();
          }
          break;
        case MJEventType.LoggedIn:
          if (SharedService._loaded === false) 
            SharedService.RefreshData(true);

          // got the login, now subscribe to push status updates here so we can then raise them as events in MJ Global locally
          this.PushStatusUpdates().subscribe( (status: any) => {
            const statusObj = JSON.parse(status.message);

            // pass along as an event so anyone else who wants to know about the push status update can do stuff
            MJGlobal.Instance.RaiseEvent({
              event: MJEventType.ComponentEvent,
              eventCode: EventCodes.PushStatusUpdates,
              args: statusObj,
              component: this
            })

            if (statusObj.type?.trim().toLowerCase() === 'usernotifications') {
              if (statusObj.details && statusObj.details.action?.trim().toLowerCase() === 'create') { 
                // we have changes to user notifications, so refresh them
                this.CreateSimpleNotification('New Notification Available', "success", 2000)
                SharedService.RefreshUserNotifications();
              }
            }
            else {
              // otherwise just post it as a simple notification, except Skip messages, we will let Skip handle those
              if (statusObj.type?.trim().toLowerCase() !== 'askskip')  {
                this.CreateSimpleNotification(statusObj.message, "success", 2500);
              }
            }
          });
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

    const rtResult = await md.GetAndCacheDatasetByName('ResourceTypes');
    if (rtResult && rtResult.Success) {
      const data = rtResult.Results.find(r => r.EntityName === 'Resource Types');
      if (data) {
        SharedService._resourceTypes = <ResourceTypeEntity[]>data.Results;
      }
    }

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
    const listTag = listType === HtmlListType.Unordered ? 'ul' : 'ol';
    if (!text.includes('\n')) {
        return text;
    }
    const listItems = text.split('\n').map(line => `<li>${line.trim().replace(/^-\s*/, '')}</li>`).join('');
    return `<${listTag}>${listItems}</${listTag}>`;
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

  private static _userNotifications: UserNotificationEntity[] = [];
  public static get UserNotifications(): UserNotificationEntity[] {
    return SharedService._userNotifications;
  }
  public static get UnreadUserNotifications(): UserNotificationEntity[] {
    return SharedService._userNotifications.filter(n => n.Unread);
  }
  public static get UnreadUserNotificationCount(): number {
    return SharedService.UnreadUserNotifications.length;
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
   */
  public async CreateNotification(title: string, message: string, resourceTypeId: string | null, resourceRecordId: string | null, resourceConfiguration: any | null): Promise<UserNotificationEntity> {
    const md = new Metadata();
    const notification = <UserNotificationEntity>await md.GetEntityObject('User Notifications');
    notification.Title = title;
    notification.Message = message;
    if (resourceTypeId)
      notification.ResourceTypeID = resourceTypeId;
    if (resourceRecordId)
      notification.ResourceRecordID = resourceRecordId as any; //TODO - fix the ResourceRecordID type and remove this
    if (resourceConfiguration)
      notification.ResourceConfiguration = JSON.stringify(resourceConfiguration);
  
    notification.UserID = md.CurrentUser.ID;
    notification.Unread = true;
    const result = await notification.Save();
    if (result) {
      SharedService.RefreshUserNotifications();
    }

    // test
    this.CreateSimpleNotification(notification.Message, "success", 2500);

    return notification;
  }

  public static async RefreshUserNotifications() {
    try {
      const rv = new RunView();
      const md = new Metadata();
      const result = await rv.RunView({
          EntityName: 'User Notifications',
          ExtraFilter: `UserID='${md.CurrentUser.ID}'`,
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object' /* we want the entity objects, this has a little bit of overhead cost, but since we'll want to be able to modify the unread state it is helpful to have these ready to go */
      })
      if (result && result.Success) {
          SharedService._userNotifications = result.Results;
      }
    }
    catch (e) {
      LogError(e);
    }
  }

  /**
   * Creates a message that is not saved to the User Notifications table, but is displayed to the user.
   * @param message - text to display
   * @param style - display styling
   * @param hideAfter - option to auto hide after the specified delay in milliseconds
   */
  public CreateSimpleNotification(message: string, style: "none" | "success" | "error" | "warning" | "info" = "success", hideAfter?: number) {
    const props: NotificationSettings = {
      content: message,
      cssClass: "button-notification",
      animation: { type: "slide", duration: 400 },
      position: { horizontal: "center", vertical: "top" },
      type: { style: style, icon: true }
    }
    if (hideAfter)
      props.hideAfter = hideAfter;
    else
      props.closable = true;

    this.notificationService.show(props);
  }



  private _resourceTypeMap = [
    { routeSegment: 'record', name: 'records' },
    { routeSegment: 'view', name: 'user views' },
    { routeSegment: 'search', name: 'search results' },
    { routeSegment: 'report', name: 'reports' },
    { routeSegment: 'query', name: 'queries' },
    { routeSegment: 'dashboard', name: 'dashboards' }
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
  CloseCurrentTab: "CloseCurrentTab"
} as const;

export type EventCodes = typeof EventCodes[keyof typeof EventCodes];