import { ElementRef, Injectable, Injector } from '@angular/core';
import { CompositeKey, IMetadataProvider, LocalCacheManager, LogError, Metadata, StartupManager } from '@memberjunction/core';
import { ArtifactMetadataEngine, DashboardEngine, ResourcePermissionEngine, MJResourceTypeEntity, MJUserNotificationEntity, ViewColumnInfo } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";
import { MJEventType, MJGlobal, ConvertMarkdownStringToHtmlList, InvokeManualResize, UUIDsEqual, GetGlobalObjectStore } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Subject, Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { first, tap } from 'rxjs/operators';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { IsDescendantElement } from '@memberjunction/ng-shared-generic';
import { RecordNavigationAdapter } from '@memberjunction/ng-base-types';
import { NavigationService } from './navigation.service';
import type { NavigationOptions } from './navigation.interfaces';

@Injectable({
  providedIn: 'root'
})
export class SharedService {
  private static readonly _globalStoreKey = '___SINGLETON__SharedService';
  private static _loaded: boolean = false;
  private static _resourceTypes: MJResourceTypeEntity[] = [];
  private static isLoading$ = new BehaviorSubject<boolean>(false);
  private tabChange = new Subject();
  tabChange$ = this.tabChange.asObservable();
  private _navigationService: NavigationService | null = null;

  constructor(
    private mjNotificationsService: MJNotificationService,
    private injector: Injector
  ) {
    const g = GetGlobalObjectStore()!;
    if (g[SharedService._globalStoreKey]) {
      return g[SharedService._globalStoreKey] as SharedService;
    }
    g[SharedService._globalStoreKey] = this;

    // Supply record navigation to Generic widgets that need it but must not import Explorer.
    // The widget calls RecordNavigationAdapter.OpenEntityRecord(...); this is what makes that
    // resolve to an Explorer tab. Registered here because SharedService is constructed once per
    // app and is already the Explorer-side owner of OpenEntityRecord.
    // See guides/UI_LAYERING_GUIDE.md §3 and the adapter's own docs.
    RecordNavigationAdapter.Register({
      OpenEntityRecord: (entityName, recordKey) => this.OpenEntityRecord(entityName, recordKey),
      OpenNewEntityRecord: (entityName, options) => this.OpenNewEntityRecord(entityName, options as NavigationOptions),
    });

    MJGlobal.Instance.GetEventListener(true).subscribe(async (event) => {
      switch (event.event) {
        case MJEventType.LoggedIn:
          if (SharedService._loaded === false)  {
            // Pre-warm non-critical engines IMMEDIATELY on LoggedIn, before
            // StartupManager.Startup() completes. These engines only need
            // Metadata.Provider (set during setupGraphQLClient's provider.Config()).
            // Firing them here allows their RunViews calls to be coalesced with
            // the startup engines' calls into fewer mega-batched GraphQL requests.
            SharedService.preWarmEngines();

            // Handle app startup — joins the same Startup() promise that
            // setupGraphQLClient kicked off.
            await StartupManager.Instance.Startup();

            await SharedService.RefreshData(false);
          }
        break;
      }
    });    
  }

  public static get Instance(): SharedService {
    return GetGlobalObjectStore()![SharedService._globalStoreKey] as SharedService;
  }

  /**
   * Optional explicit metadata provider. Set via `setProvider()` from a caller
   * with provider context (e.g. the shell). Falls back to `Metadata.Provider`
   * when not set.
   */
  private _provider: IMetadataProvider | null = null;

  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
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

    // ArtifactMetadataEngine.Config() loads only the artifact-type registry —
    // a small, fixed set. Artifacts and versions (whose Content can be huge) are
    // fetched on demand per-artifact, so this pre-warm stays cheap and bounded.
    // Used by Conversations and the Artifact viewer.
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
    return (<GraphQLDataProvider>this.Provider).sessionId;
  }

  public get ResourceTypes(): MJResourceTypeEntity[] {
    return SharedService._resourceTypes;
  }
  public get ViewResourceType(): MJResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'user views')!;
  }
  public get RecordResourceType(): MJResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'records')!;
  }
  public get DashboardResourceType(): MJResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'dashboards')!;
  }
  public get SearchResultsResourceType(): MJResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'search results')!;
  }
  public get ListResourceType(): MJResourceTypeEntity {
    return SharedService._resourceTypes.find(rt => rt.Name.trim().toLowerCase() === 'lists')!;
  }
  public ResourceTypeByID(id: string): MJResourceTypeEntity | undefined {
    return SharedService._resourceTypes.find(rt => UUIDsEqual(rt.ID, id));
  }
  public ResourceTypeByName(name: string): MJResourceTypeEntity | undefined {
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
    // make sure startup is done
    await StartupManager.Instance.Startup();

    this._resourceTypes = ResourcePermissionEngine.Instance.ResourceTypes;

    // Note: RefreshUserNotifications() removed here because MJNotificationService
    // already handles it via its own MJEventType.LoggedIn subscription. Calling it
    // from both places caused a duplicate User Notifications GraphQL request on login.
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
    return ConvertMarkdownStringToHtmlList(listType, text) ?? text;
  }

  
  public InvokeManualResize(delay: number = 50) {
    return InvokeManualResize(delay, this);
  }

  public PushStatusUpdates(): Observable<string> {
    const gp: GraphQLDataProvider = <GraphQLDataProvider>this.Provider;
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
  public static get UserNotifications(): MJUserNotificationEntity[] {
    return MJNotificationService.UserNotifications;
  }
  /**
   * @deprecated Use MJNotificationService.UnreadUserNotifications instead
   */
  public static get UnreadUserNotifications(): MJUserNotificationEntity[] {
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
  /**
   * @deprecated Use `IsDescendantElement` from `@memberjunction/ng-shared-generic`. This is a pure
   * DOM predicate with no Explorer coupling; keeping it here forced widgets that wanted it to
   * depend on Explorer. Delegates so existing callers are unaffected.
   */
  public static IsDescendant(parent: ElementRef, child: ElementRef) {
    return IsDescendantElement(parent, child);
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
  public async CreateNotification(title: string, message: string, resourceTypeId: string | null, resourceRecordId: string | null, resourceConfiguration: any | null, displayToUser : boolean = true): Promise<MJUserNotificationEntity> {
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

  /**
   * Opens a blank new entity record creation form in a new tab.
   */
  public OpenNewEntityRecord(entityName: string, options?: NavigationOptions) {
    try {
      this.navigationService.OpenNewEntityRecord(entityName, options);
    }
    catch (e) {
      console.error('Error in OpenNewEntityRecord:', e);
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