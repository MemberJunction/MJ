import { Injectable, OnDestroy } from '@angular/core';
import { WorkspaceStateManager, NavItem, DynamicNavItem, TabRequest, ApplicationManager, WorkspaceTab } from '@memberjunction/ng-base-application';
import { NavigationOptions } from './navigation.interfaces';
import { CompositeKey } from '@memberjunction/core';
import { fromEvent, BehaviorSubject, Subject, Subscription, Observable } from 'rxjs';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from './base-resource-component';

/**
 * Event emitted when query params change on a tab (e.g., from browser back/forward).
 * Includes the tab ID so that only the component in the affected tab reacts,
 * preventing cross-tab leakage in multi-tab scenarios.
 */
export interface QueryParamChangeEvent {
    TabId: string;
    Params: Record<string, string>;
}

/**
 * Event emitted when a resource component reports its agent context or tools.
 * The shell (which owns the ComponentCacheManager) subscribes to these events
 * and updates the cache + active AppContextSnapshot accordingly.
 */
export interface AgentContextUpdate {
    /** The component instance that reported the update */
    Caller: BaseResourceComponent;
    /** Dashboard-specific context for the agent (undefined = no change) */
    AgentContext?: Record<string, unknown>;
    /** Client tools available from this dashboard (undefined = no change) */
    AgentClientTools?: Array<{
        Name: string;
        Description: string;
        ParameterSchema: Record<string, unknown>;
        Handler: (params: Record<string, unknown>) => Promise<unknown>;
    }>;
}

/**
 * System application ID for non-app-specific resources (fallback only)
 * Uses double underscore prefix to indicate system-level resource
 * @deprecated Prefer using NavigationService.getDefaultApplicationId() instead
 */
export const SYSTEM_APP_ID = '__explorer';

/**
 * Neutral color for fallback when no app is available
 */
const NEUTRAL_APP_COLOR = '#9E9E9E'; // Material Design Gray 500

/**
 * Centralized navigation service that handles all navigation operations
 * with automatic shift-key detection for power user workflows
 */
@Injectable({
  providedIn: 'root'
})
export class NavigationService implements OnDestroy {
  private shiftKeyPressed = false;
  private subscriptions: Subscription[] = [];

  private queryParamChanged$ = new Subject<QueryParamChangeEvent>();
  /** Observable that emits when query params change on a tab (back/forward navigation). */
  public QueryParamChanged$ = this.queryParamChanged$.asObservable();

  /** Cached Home app ID (null means not found, undefined means not checked) */
  private _homeAppId: string | null | undefined = undefined;
  /** Cached Home app color */
  private _homeAppColor: string | null = null;

  constructor(
    private workspaceManager: WorkspaceStateManager,
    private appManager: ApplicationManager
  ) {
    this.setupGlobalShiftKeyDetection();
  }

  /**
   * Get the neutral color used for system-wide resources (entities, views, dashboards)
   * Returns a light neutral gray
   * @deprecated Use getDefaultAppColor() for better UX with Home app integration
   */
  get ExplorerAppColor(): string {
    return NEUTRAL_APP_COLOR;
  }

  /**
   * Gets the default application ID for orphan resources.
   * Priority: Home app > Active app > SYSTEM_APP_ID
   *
   * This ensures orphan resources (entity records, dashboards, views opened directly)
   * are grouped under the Home app instead of being orphaned in the tab system.
   */
  private getDefaultApplicationId(): string {
    // Check cache first
    if (this._homeAppId !== undefined) {
      if (this._homeAppId !== null) {
        return this._homeAppId;
      }
      // Home app not found, check active app
      const activeApp = this.appManager.GetActiveApp();
      if (activeApp) {
        return activeApp.ID;
      }
      return SYSTEM_APP_ID;
    }

    // First time - look for Home app
    const homeApp = this.appManager.GetAppByName('Home');
    if (homeApp) {
      this._homeAppId = homeApp.ID;
      this._homeAppColor = homeApp.GetColor();
      return homeApp.ID;
    }

    // Cache that Home app doesn't exist
    this._homeAppId = null;

    // Fall back to currently active app
    const activeApp = this.appManager.GetActiveApp();
    if (activeApp) {
      return activeApp.ID;
    }

    // Last resort - system app ID
    return SYSTEM_APP_ID;
  }

  /**
   * Gets the default app color for orphan resources.
   * Returns Home app color if available, otherwise neutral gray.
   */
  private getDefaultAppColor(): string {
    // Ensure cache is populated
    this.getDefaultApplicationId();

    // If Home app exists, use its color
    if (this._homeAppColor) {
      return this._homeAppColor;
    }

    // Check active app
    const activeApp = this.appManager.GetActiveApp();
    if (activeApp) {
      return activeApp.GetColor();
    }

    // Fall back to neutral color
    return NEUTRAL_APP_COLOR;
  }

  /**
   * Clears the cached Home app info.
   * Call this if apps are reloaded or user logs out.
   */
  public clearHomeAppCache(): void {
    this._homeAppId = undefined;
    this._homeAppColor = null;
  }

  // ════════════════════════════════════════════
  // Agent Context & Client Tools
  // ════════════════════════════════════════════

  /**
   * Observable stream of agent context updates from resource components.
   * The shell subscribes to this to update the ComponentCacheManager and
   * push changes to the chat overlay's AppContextSnapshot.DashboardContext.
   */
  public readonly AgentContextUpdated$ = new Subject<AgentContextUpdate>();

  /** The client tools currently surfaced to the agent (the most recent SetAgentClientTools set). */
  private currentAgentTools: NonNullable<AgentContextUpdate['AgentClientTools']> = [];

  /**
   * Tools captured for each cached resource component at the moment it was DETACHED, keyed by that
   * component (the one the cache manager tracks). Replayed on reattach. Captured at detach time (vs.
   * keyed by the registering component) so it works even when a resource WRAPPER component is what's
   * cached/reattached while an INNER child component is what actually called SetAgentClientTools
   * (e.g. Data Explorer's resource wrapper hosting its dashboard) — keying by the registerer would
   * miss on reattach. This keeps the agent's live tool set a function of the CURRENTLY attached
   * surface, fixing the staleness where a previous app's tools lingered after navigation.
   */
  private readonly agentToolsByDetachedResource = new Map<BaseResourceComponent, NonNullable<AgentContextUpdate['AgentClientTools']>>();

  /**
   * Latest `AppContextSnapshot` published by the Explorer app shell.
   *
   * Why: any embedded `<mj-conversation-chat-area>` instance outside the
   * floating chat overlay (Form Builder cockpit, future domain dashboards
   * that pop their own AI pane) needs to feed the SAME context the overlay
   * does so the agent sees what app + view + dashboard state the user is
   * looking at. Without this, the agent only sees the embedder's narrow
   * `AdditionalContext` slice and treats the user as if they have no app
   * context at all — which is the bug we just fixed.
   *
   * `MJExplorerAppComponent` is the canonical publisher (it owns the
   * snapshot construction); consumers SUBSCRIBE and bind the value to
   * their chat-area's `[appContext]`. Non-Explorer apps (custom MJ apps
   * that don't include explorer-app at all) build their own snapshot via
   * `BuildAppContextSnapshot()` in `@memberjunction/ai-core-plus`.
   *
   * Initial value is `null`; the publisher emits the first real snapshot
   * after the active app + nav state resolve on bootstrap.
   */
  public readonly AppContextSnapshot$ = new BehaviorSubject<AppContextSnapshot | null>(null);

  /**
   * Push a fresh AppContextSnapshot. Called by MJExplorerAppComponent
   * after each (a) app/tab change, (b) `handleAgentContextUpdate`
   * merging in `AdditionalContext` from a dashboard. Idempotent — no
   * de-duplication; embedders should treat the stream as "the latest
   * value is canonical."
   */
  public PublishAppContextSnapshot(snapshot: AppContextSnapshot | null): void {
    this.AppContextSnapshot$.next(snapshot);
  }

  /**
   * Report the current agent-visible state from a resource component.
   * Call this whenever the dashboard's internal state changes (tab switch,
   * filter change, pipeline status change, drill-down, etc.).
   *
   * @param caller - Pass `this` from the calling component. Used to match
   *   against the ComponentCacheManager to identify which cached component
   *   this update belongs to.
   * @param context - Key-value pairs representing dashboard state the agent
   *   should know about. Each dashboard defines its own shape.
   */
  public SetAgentContext(caller: BaseResourceComponent, context: Record<string, unknown>): void {
    this.AgentContextUpdated$.next({ Caller: caller, AgentContext: context });
  }

  /**
   * Register the client tools available from a resource component.
   * Call this on component init and whenever the available tools change.
   * Tools are automatically unregistered when the component becomes inactive
   * (tab switch) and re-registered when it becomes active again.
   *
   * @param caller - Pass `this` from the calling component.
   * @param tools - Array of tool definitions with Name, Description,
   *   ParameterSchema (JSON Schema), and Handler function.
   */
  public SetAgentClientTools(caller: BaseResourceComponent, tools: Array<{
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
  }>): void {
    this.currentAgentTools = tools;
    this.AgentContextUpdated$.next({ Caller: caller, AgentClientTools: tools });
  }

  /**
   * Re-publish a cached resource component's tools when its tab is re-focused. Cached components keep
   * their Angular instance but do NOT re-run `ngAfterViewInit`, so they never re-register on reattach
   * — the shell calls this so the just-reactivated surface's tools become the agent's active set
   * again. Replays the set captured for this component at its last detach; no-op (lets a fresh
   * component register itself) when none was captured (e.g. a component's very first attach).
   */
  public NotifyResourceReattached(caller: BaseResourceComponent): void {
    const tools = this.agentToolsByDetachedResource.get(caller);
    if (tools === undefined) {
      return;
    }
    this.currentAgentTools = tools;
    this.AgentContextUpdated$.next({ Caller: caller, AgentClientTools: tools });
  }

  /**
   * Capture + clear the active client tools when a resource component's tab is detached (navigated
   * away from), so the previous surface's tools aren't offered to the agent on the next surface. We
   * snapshot whatever tools are CURRENTLY active and key them by the detaching component, so
   * {@link NotifyResourceReattached} can replay them — robust to a wrapper component being the one
   * cached/reattached while an inner child actually registered the tools (e.g. Data Explorer).
   */
  public NotifyResourceDetached(caller: BaseResourceComponent): void {
    this.agentToolsByDetachedResource.set(caller, this.currentAgentTools);
    this.currentAgentTools = [];
    this.AgentContextUpdated$.next({ Caller: caller, AgentClientTools: [] });
  }

  /**
   * Drop a destroyed component's captured tools (e.g. on LRU eviction), so the map doesn't retain
   * references to dead component instances.
   */
  public ForgetResource(caller: BaseResourceComponent): void {
    this.agentToolsByDetachedResource.delete(caller);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Set up global keyboard event listeners to track shift key state
   */
  private setupGlobalShiftKeyDetection(): void {
    // Track shift key via mousedown events (capture phase) instead of keydown/keyup.
    // This is more reliable because:
    // 1. MouseEvent.shiftKey always reflects the actual modifier state at click time
    // 2. No risk of "stuck" state from missed keyup events (focus loss, tab switch, etc.)
    // 3. Navigation is always triggered by a click, so the shift state is read
    //    at exactly the right moment
    this.subscriptions.push(
      fromEvent<MouseEvent>(document, 'mousedown', { capture: true }).subscribe(event => {
        this.shiftKeyPressed = event.shiftKey;
      })
    );
  }

  /**
   * Get current shift key state
   */
  private isShiftPressed(): boolean {
    return this.shiftKeyPressed;
  }

  /**
   * Determine if a new tab should be forced based on options and shift key state
   */
  private shouldForceNewTab(options?: NavigationOptions): boolean {
    // If forceNewTab is explicitly set, use that
    if (options?.forceNewTab !== undefined) {
      return options.forceNewTab;
    }

    // Otherwise, use global shift key detection
    return this.isShiftPressed();
  }

  /**
   * Returns whether the caller should use OpenTabForced (force-new path) or
   * OpenTab (replace-temp path).
   *
   * Rule: only honor an explicit force-new request — from the user via
   * shift+click, or from the caller via `options.forceNewTab`. We deliberately
   * do NOT apply heuristics that auto-switch the workspace out of
   * single-resource mode on cross-resource navigation. A previous version of
   * this method tried to do that ("force new if single-resource + different
   * resource") and it caused a regression: every plain hyperlink click on a
   * record opened a new tab and dropped the user into multi-tab mode, even
   * though they didn't ask for it. That violated the principle that mode
   * transitions are user-driven (shift) or explicitly requested (options).
   *
   * If a particular caller really needs the parent context preserved when
   * creating/navigating to a child resource (e.g. "+New" on a related-entity
   * grid inside an open record), the caller should pass `forceNewTab: true`
   * in `NavigationOptions`. That keeps intent explicit at the call site
   * instead of buried in a global heuristic.
   */
  private handleSingleResourceModeTransition(forceNew: boolean, _newRequest: TabRequest): boolean {
    return forceNew;
  }

  /**
   * Check if a tab request matches an existing tab's resource
   */
  private isSameResource(tab: any, request: TabRequest): boolean {
    // Different apps = different resources
    if (tab.applicationId !== request.ApplicationId) {
      return false;
    }

    // For resource-based tabs, compare resourceType and recordId
    if (request.Configuration?.resourceType) {
      const requestRecordId = request.ResourceRecordId || '';
      const tabRecordId = tab.resourceRecordId || '';
      return tab.configuration?.resourceType === request.Configuration.resourceType &&
             tabRecordId === requestRecordId;
    }

    // For app nav items, compare appName and navItemName
    if (request.Configuration?.appName && request.Configuration?.navItemName) {
      return tab.configuration?.appName === request.Configuration.appName &&
             tab.configuration?.navItemName === request.Configuration.navItemName;
    }

    // Fallback to basic comparison
    return false;
  }

  /**
   * Open a navigation item within an app
   */
  public OpenNavItem(appId: string, navItem: NavItem, appColor: string, options?: NavigationOptions): string {
    let forceNew = this.shouldForceNewTab(options);

    // Get the app to find its name
    const app = this.appManager.GetAppById(appId);
    const appName = app?.Name || '';

    // Dynamic nav items (e.g. orphan entity records) carry their original tab Configuration
    // and should NOT get navItemName stamped on them — that would cause buildResourceUrl
    // to produce a nav-item-style URL like /app/home/<label> instead of the correct
    // resource-type URL like /app/home/record/Entity/ID|...
    const isDynamic = (navItem as DynamicNavItem).isDynamic === true;

    const request: TabRequest = {
      ApplicationId: appId,
      Title: navItem.Label,
      ResourceRecordId: navItem.RecordID || '',  // Also store at top level for consistent tab matching
      Configuration: {
        route: navItem.Route,
        resourceType: navItem.ResourceType,
        driverClass: navItem.DriverClass,  // Pass through DriverClass for Custom resource type
        recordId: navItem.RecordID,
        appName: appName,  // Store app name for URL building
        appId: appId,
        ...(isDynamic ? {} : { navItemName: navItem.Label }),  // Only set for static nav items
        ...(navItem.Configuration || {})
      },
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    let tabId: string;
    if (forceNew) {
      // Always create a new tab
      tabId = this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      // Use existing OpenTab logic (may replace temporary tab)
      tabId = this.workspaceManager.OpenTab(request, appColor);
    }

    // Apply query params to the newly opened/activated tab if provided
    if (options?.queryParams) {
      this.applyQueryParamsToTab(tabId, options.queryParams);
    }

    return tabId;
  }

  /**
   * Open an entity record view
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenEntityRecord(
    entityName: string,
    recordPkey: CompositeKey,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();

    let forceNew = this.shouldForceNewTab(options);

    const recordId = recordPkey.ToURLSegment();
    const existingRecordTab = this.findExistingRecordTab(appId, entityName, recordId);
    const returnToTabId = options?.returnToTabId || this.workspaceManager.GetActiveTabId() || undefined;
    const shouldMarkTransient = options?.transient === true && !existingRecordTab;
    const request: TabRequest = {
      ApplicationId: appId,
      Title: `${entityName} - ${recordId}`,
      Configuration: {
        resourceType: 'Records',
        Entity: entityName,  // Must use 'Entity' (capital E) - expected by record-resource.component
        recordId: recordId,  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
        queryParams: undefined,
        ...(shouldMarkTransient ? {
          isTransient: true,
          returnToTabId
        } : {})
      },
      ResourceRecordId: recordId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    let tabId: string;
    if (forceNew) {
      tabId = this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      tabId = this.workspaceManager.OpenTab(request, appColor);
    }

    return tabId;
  }

  private findExistingRecordTab(appId: string, entityName: string, recordId: string): WorkspaceTab | null {
    const config = this.workspaceManager.GetConfiguration();
    const entityKey = entityName.trim().toLowerCase();
    return config?.tabs.find(tab => {
      if (tab.applicationId !== appId) {
        return false;
      }
      const tabConfig = tab.configuration || {};
      if (tabConfig['resourceType'] !== 'Records') {
        return false;
      }
      const tabEntity = ((tabConfig['Entity'] || tabConfig['entity']) as string | undefined)?.trim().toLowerCase() || '';
      const tabRecordId = tab.resourceRecordId || (tabConfig['recordId'] as string | undefined) || '';
      return tabEntity === entityKey && tabRecordId === recordId;
    }) || null;
  }

  /**
   * Open a view
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenView(
    viewId: string,
    viewName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    let forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: viewName,
      Configuration: {
        resourceType: 'MJ: User Views',
        viewId,
        recordId: viewId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: viewId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a dashboard
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenDashboard(
    dashboardId: string,
    dashboardName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    let forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: dashboardName,
      Configuration: {
        resourceType: 'Dashboards',
        dashboardId,
        recordId: dashboardId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: dashboardId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a report
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenReport(
    reportId: string,
    reportName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    let forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: reportName,
      Configuration: {
        resourceType: 'Reports',
        reportId,
        recordId: reportId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: reportId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open an artifact
   * Artifacts are versioned content containers (reports, dashboards, UI components, etc.)
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenArtifact(
    artifactId: string,
    artifactName?: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    let forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: artifactName || `Artifact - ${artifactId}`,
      Configuration: {
        resourceType: 'Artifacts',
        artifactId,
        recordId: artifactId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: artifactId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a dynamic view
   * Dynamic views are entity-based views with custom filters, not saved views
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenDynamicView(
    entityName: string,
    extraFilter?: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    let forceNew = this.shouldForceNewTab(options);

    const filterSuffix = extraFilter ? ' (Filtered)' : '';
    const request: TabRequest = {
      ApplicationId: appId,
      Title: `${entityName}${filterSuffix}`,
      Configuration: {
        resourceType: 'MJ: User Views',
        Entity: entityName,
        ExtraFilter: extraFilter,
        isDynamic: true,
        recordId: 'dynamic'  // Special marker for dynamic views
      },
      ResourceRecordId: 'dynamic',
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a query
   * Uses Home app if available, otherwise falls back to active app or system app
   */
  public OpenQuery(
    queryId: string,
    queryName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    let forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: queryName,
      Configuration: {
        resourceType: 'Queries',
        queryId,
        recordId: queryId  // Also needed in Configuration for tab-container.component to populate ResourceRecordID
      },
      ResourceRecordId: queryId,
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a new entity record creation form
   * Uses Home app if available, otherwise falls back to active app or system app
   * @param entityName The name of the entity to create a new record for
   * @param options Navigation options including optional newRecordValues for pre-populating fields
   */
  public OpenNewEntityRecord(
    entityName: string,
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();

    let forceNew = this.shouldForceNewTab(options);

    const request: TabRequest = {
      ApplicationId: appId,
      Title: `New ${entityName}`,
      Configuration: {
        resourceType: 'Records',
        Entity: entityName,  // Must use 'Entity' (capital E) - expected by record-resource.component
        recordId: '',        // Empty recordId indicates new record
        isNew: true,         // Flag to indicate this is a new record
        NewRecordValues: options?.newRecordValues  // Pass through initial values if provided
      },
      ResourceRecordId: '',  // Empty for new records
      IsPinned: options?.pinTab || false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Open a universal search results tab for the given query.
   * This is the primary way to open search results from anywhere in the application.
   *
   * @param query The search query text
   * @param searchOptions Optional search-specific options (e.g., minRelevance, scopeIDs)
   * @param options Navigation options
   */
  public OpenSearch(
    query: string,
    searchOptions?: { minRelevance?: number; scopeIDs?: string[] },
    options?: NavigationOptions
  ): string {
    const appId = this.getDefaultApplicationId();
    const appColor = this.getDefaultAppColor();
    let forceNew = this.shouldForceNewTab(options);

    const config: Record<string, unknown> = {
      resourceType: 'Search Results',
      Query: query,
      SearchInput: query,
      recordId: `search-${query}`
    };
    if (searchOptions?.minRelevance != null) {
      config['MinRelevance'] = searchOptions.minRelevance;
    }
    if (searchOptions?.scopeIDs && searchOptions.scopeIDs.length > 0) {
      config['ScopeIDs'] = searchOptions.scopeIDs;
    }

    const request: TabRequest = {
      ApplicationId: appId,
      Title: `Search: ${query}`,
      Configuration: config,
      ResourceRecordId: `search-${query}`,
      IsPinned: false
    };

    // Handle transition from single-resource mode
    forceNew = this.handleSingleResourceModeTransition(forceNew, request);

    if (forceNew) {
      return this.workspaceManager.OpenTabForced(request, appColor);
    } else {
      return this.workspaceManager.OpenTab(request, appColor);
    }
  }

  /**
   * Navigate to a nav item by name within the current or specified application.
   * Allows passing additional configuration parameters to merge with the nav item's config.
   * This is useful for cross-resource navigation where a component needs to navigate
   * to another nav item with specific parameters (e.g., navigate to Conversations with a specific conversationId).
   *
   * @param navItemName The label/name of the nav item to navigate to
   * @param configuration Additional configuration to merge (e.g., conversationId, artifactId)
   * @param appId Optional app ID (defaults to current active app)
   * @param options Navigation options
   * @returns The tab ID if successful, null if nav item not found
   */
  public async OpenNavItemByName(
    navItemName: string,
    configuration?: Record<string, unknown>,
    appId?: string,
    options?: NavigationOptions
  ): Promise<string | null> {
    // Get app (use provided or current active)
    const targetAppId = appId || this.appManager.GetActiveApp()?.ID;
    if (!targetAppId) {
      return null;
    }

    const app = this.appManager.GetAppById(targetAppId);
    if (!app) {
      return null;
    }

    // Find the nav item by name
    const navItems = await app.GetNavItems();
    const navItem = navItems.find(item => item.Label === navItemName);
    if (!navItem) {
      return null;
    }

    // Create a merged nav item with additional configuration
    const mergedNavItem: NavItem = {
      ...navItem,
      Configuration: {
        ...(navItem.Configuration || {}),
        ...(configuration || {})
      }
    };

    // Use existing OpenNavItem
    return this.OpenNavItem(targetAppId, mergedNavItem, app.GetColor(), options);
  }

  /**
   * Switch to an application by ID.
   * This sets the app as active and either opens a specific nav item or creates a default tab.
   * If the requested nav item already has an open tab, switches to that tab instead of creating a new one.
   * @param appId The application ID to switch to
   * @param navItemName Optional name of a nav item to open within the app. If provided, opens that nav item.
   * @param queryParams Optional query params to apply to the target tab. Applied SYNCHRONOUSLY once the
   *                    target tab is active — critical when navigating (e.g. from a Home pin) to an
   *                    app whose resource component is cached: the params must be in the tab config
   *                    BEFORE the tab-container reattaches the cached component, otherwise the cache
   *                    restores its own (stale) saved params and the navigation intent is lost.
   */
  async SwitchToApp(appId: string, navItemName?: string, queryParams?: Record<string, string | null>): Promise<void> {
    await this.appManager.SetActiveApp(appId);

    const app = this.appManager.GetAllApps().find(a => UUIDsEqual(a.ID, appId));
    if (!app) {
      return;
    }

    const appTabs = this.workspaceManager.GetAppTabs(appId);

    // If a specific nav item is requested
    if (navItemName) {
      const navItems = await app.GetNavItems();
      const navItem = navItems.find(item => item.Label === navItemName);
      if (navItem) {
        // Check if there's already a tab for this nav item
        const existingTab = appTabs.find(tab =>
          tab.title === navItem.Label ||
          (tab.configuration?.['route'] === navItem.Route && navItem.Route)
        );

        if (existingTab) {
          // Switch to existing tab
          this.workspaceManager.SetActiveTab(existingTab.id);
        } else {
          // Open new tab for this nav item
          this.OpenNavItem(appId, navItem, app.GetColor());
        }
        // Apply the requested query params to whichever tab is now active — synchronously,
        // so they're present before the (possibly cached) resource component reattaches.
        if (queryParams && Object.keys(queryParams).length > 0) {
          const targetTabId = this.workspaceManager.GetActiveTabId();
          if (targetTabId) {
            this.applyQueryParamsToTab(targetTabId, queryParams);
          }
        }
        return;
      }
      // Nav item not found, fall through to default behavior
    }

    // No specific nav item requested - check if app has any tabs
    if (appTabs.length === 0) {
      // Create default tab
      const tabRequest = await app.CreateDefaultTab();
      if (tabRequest) {
        this.workspaceManager.OpenTab(tabRequest, app.GetColor());
      }
    } else {
      // App has tabs - switch to the first one (or active one if exists)
      const config = this.workspaceManager.GetConfiguration();
      const activeAppTab = appTabs.find(t => t.id === config?.activeTabId);
      if (!activeAppTab) {
        // No active tab for this app, switch to first tab
        this.workspaceManager.SetActiveTab(appTabs[0].id);
      }
    }
  }

  /**
   * Update the query params for the currently active tab.
   * This updates the tab's configuration and triggers a URL sync via the shell's
   * workspace configuration subscription.
   *
   * Use this instead of directly calling router.navigate() to ensure proper
   * URL management that respects app-scoped routes.
   *
   * @param queryParams Object containing query param key-value pairs.
   *                    Use null values to remove a query param.
   * @example
   * // Add or update query params
   * navigationService.UpdateActiveTabQueryParams({ category: 'abc123', dashboard: 'xyz789' });
   *
   * // Remove a query param
   * navigationService.UpdateActiveTabQueryParams({ category: null });
   */
  UpdateActiveTabQueryParams(queryParams: Record<string, string | null>): void {
    const activeTabId = this.workspaceManager.GetActiveTabId();
    if (!activeTabId) {
      console.warn('NavigationService.UpdateActiveTabQueryParams: No active tab');
      return;
    }

    this.applyQueryParamsToTab(activeTabId, queryParams);
  }

  /**
   * Notify subscribers that query params changed on a specific tab.
   * Called by the shell when back/forward navigation changes query params on the active tab.
   * The notification includes the tab ID so only the component in that tab reacts.
   */
  NotifyQueryParamsChanged(tabId: string, params: Record<string, string>): void {
    this.queryParamChanged$.next({ TabId: tabId, Params: params });
  }

  /**
   * Reactively observe the query params for a specific tab.
   *
   * Backed by the workspace BehaviorSubject, so a subscriber receives the current
   * params *immediately* on subscribe AND every subsequent change — including the
   * deep-link params that the ResourceResolver merges into the tab configuration on
   * a cold/direct URL load.
   *
   * This is the race-free counterpart to {@link NotifyQueryParamsChanged} (a plain
   * Subject that drops events fired before a component has subscribed). A resource
   * component that mounts from workspace restoration can subscribe here and still
   * pick up its initial deep-link state regardless of whether the params landed in
   * the tab config before or after it mounted.
   */
  public ObserveTabQueryParams(tabId: string): Observable<Record<string, string>> {
    return this.workspaceManager.Configuration.pipe(
      map(config => {
        const tab = config?.tabs?.find(t => t.id === tabId);
        return (tab?.configuration?.['queryParams'] || {}) as Record<string, string>;
      }),
      distinctUntilChanged((a, b) => this.shallowParamsEqual(a, b))
    );
  }

  private shallowParamsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every(key => a[key] === b[key]);
  }

  /**
   * Apply query params to a specific tab by ID.
   * Merges with any existing query params on the tab. Use null values to remove params.
   */
  private applyQueryParamsToTab(tabId: string, queryParams: Record<string, string | null>): void {
    const tab = this.workspaceManager.GetTab(tabId);
    if (!tab) {
      console.warn('NavigationService.applyQueryParamsToTab: Tab not found:', tabId);
      return;
    }

    // Get existing queryParams from tab configuration
    const existingQueryParams = (tab.configuration?.['queryParams'] || {}) as Record<string, string | null>;

    // Merge with new query params
    const mergedQueryParams: Record<string, string> = {};

    // Start with existing params (excluding nulls)
    for (const [key, value] of Object.entries(existingQueryParams)) {
      if (value !== null) {
        mergedQueryParams[key] = value;
      }
    }

    // Apply new params (null means remove)
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === null) {
        delete mergedQueryParams[key];
      } else {
        mergedQueryParams[key] = value;
      }
    }

    // Update the tab configuration
    this.workspaceManager.UpdateTabConfiguration(tabId, {
      queryParams: Object.keys(mergedQueryParams).length > 0 ? mergedQueryParams : undefined
    });
  }
}
