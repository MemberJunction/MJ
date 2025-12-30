import { ElementRef, Injectable, Injector } from '@angular/core';
import { CompositeKey, LocalCacheManager, LogError, Metadata, StartupManager } from '@memberjunction/core';
import { ArtifactMetadataEngine, DashboardEngine, ResourcePermissionEngine, ResourceTypeEntity, UserNotificationEntity, ViewColumnInfo } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";
import { MJEventType, MJGlobal, ConvertMarkdownStringToHtmlList, InvokeManualResize } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Subject, Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { first, tap } from 'rxjs/operators';
import { NotificationService } from "@progress/kendo-angular-notification";
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationService } from './navigation.service';

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
  private _navigationService: NavigationService | null = null;

  constructor(
    private notificationService: NotificationService,
    private mjNotificationsService: MJNotificationService,
    private injector: Injector
  ) {
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
            // Handle app startup
            await StartupManager.Instance.Startup();          

            await SharedService.RefreshData(false);

            // Pre-warm other engines in the background (fire and forget)
            // These are not needed immediately but will be ready when user navigates to
            // Conversations, Dashboards, or Artifacts. The BaseEngine pattern ensures
            // subsequent callers will wait for the existing load rather than starting a new one.
            SharedService.preWarmEngines();
          }
        break;
      }
    });    
  }

  public static get Instance(): SharedService {
    return SharedService._instance;
  }

  /**
   * Pre-warms commonly used engines in the background after login.
   * This reduces perceived latency when users navigate to features like
   * Conversations, Dashboards, or Artifacts. Fire-and-forget pattern -
   * errors are logged but don't block the UI.
   */
  private static preWarmEngines(): void {
    // AIEngineBase is the slowest - loads agents, models, prompts, etc.
    // Critical for Conversations feature
    AIEngineBase.Instance.Config(false).catch(err =>
      LogError(`Failed to pre-warm AIEngineBase: ${err}`)
    );

    // ArtifactMetadataEngine is lightweight (just artifact types)
    // Used by Conversations and Artifact viewer
    ArtifactMetadataEngine.Instance.Config(false).catch(err =>
      LogError(`Failed to pre-warm ArtifactMetadataEngine: ${err}`)
    );

    // DashboardEngine loads dashboard metadata
    // Used when viewing dashboards
    DashboardEngine.Instance.Config(false).catch(err =>
      LogError(`Failed to pre-warm DashboardEngine: ${err}`)
    );

    EntityCommunicationsEngineBase.Instance.Config(false).catch(err =>
      LogError(`Failed to pre-warm DashboardEngine: ${err}`)
    );
  }

  /**
   * Get the NavigationService singleton instance
   * Lazy-loaded to avoid circular dependency issues
   */
  private get navigationService(): NavigationService {
    if (!this._navigationService) {
      this._navigationService = this.injector.get(NavigationService);
    }
    return this._navigationService;
  }

  /**
   * Get the neutral color used for system-wide resources
   */
  public get ExplorerAppColor(): string {
    return this.navigationService.ExplorerAppColor;
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

    // make sure startup is done
    await StartupManager.Instance.Startup();          

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
    return InvokeManualResize(delay, this);
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

  /**
   * Opens an entity record in a new or existing tab
   * Uses the modern NavigationService for tab-based navigation
   */
  public OpenEntityRecord(entityName: string, recordPkey: CompositeKey) {
    try {
      console.log('SharedService.OpenEntityRecord called:', entityName, recordPkey.ToURLSegment());
      // Use NavigationService to open in new tab-based UX
      this.navigationService.OpenEntityRecord(entityName, recordPkey);
    }
    catch (e) {
      console.error('Error in OpenEntityRecord:', e);
      LogError(e);
    }
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
  ListClicked: 'ListClicked',
  AvatarUpdated: 'AvatarUpdated'
} as const;

export type EventCodes = typeof EventCodes[keyof typeof EventCodes];