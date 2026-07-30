import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  ApplicationRef,
  EnvironmentInjector,
  runInInjectionContext,
  createComponent,
  ComponentRef,
  ViewEncapsulation,
  ChangeDetectorRef,
  HostListener,
  Output,
  EventEmitter,
  inject
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  GoldenLayoutManager,
  WorkspaceStateManager,
  ApplicationManager,
  TabComponentState,
  TabShownEvent,
  WorkspaceTab,
  LayoutNode,
  FlattenLayoutToSingleStack
} from '@memberjunction/ng-base-application';
import { MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent, HomeAppPinService, NavigationService, IsRecordTabsStyle, IsRecordsTabConfiguration, IsRecordsRegionTab, IsRecordDockedToWorkspace, RECORD_DOCKED_TO_WORKSPACE_KEY, GetRecordSourceContext, SafeDetectChanges, ExplorerBreakpointService, ResolveRecordTypeIcon } from '@memberjunction/ng-shared';
import { ResourceData, MJResourceTypeEntity, ResourcePermissionEngine } from '@memberjunction/core-entities';
import { RecordOriginCrumbComponent } from '../record-open/record-origin-crumb.component';
import { RecordSwitcherService } from '../record-open/record-switcher.service';
import { RecordSwitcherEntry } from '../record-open/record-switcher-sheet.component';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { BaseEntity, DatasetResultType, LogError, Metadata } from '@memberjunction/core';
import { ComponentCacheManager, CachedComponentInfo } from './component-cache-manager';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/** Fallback tab accent when an app has no color (matches pre-existing usage) */
const DEFAULT_APP_COLOR = '#757575';
/**
 * Container for Golden Layout tabs with app-colored styling.
 *
 * Handles:
 * - Golden Layout initialization
 * - Tab creation and styling
 * - Lazy loading of tab content
 * - Context menu for pin/close
 * - Layout persistence
 */
@Component({
  standalone: false,
  selector: 'mj-tab-container',
  templateUrl: './tab-container.component.html',
  styleUrls: ['./tab-container.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class TabContainerComponent extends BaseAngularComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('glContainer', { static: false }) glContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('directContentContainer', { static: false }) directContentContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('recordsGlContainer', { static: false }) recordsGlContainer?: ElementRef<HTMLDivElement>;

  /**
   * Emitted when the first resource component finishes loading.
   * This allows the shell to keep showing its loading indicator until the first
   * resource is ready, eliminating the visual gap between shell loading and resource loading.
   */
  @Output() firstResourceLoadComplete = new EventEmitter<void>();

  /**
   * Emitted when Golden Layout fails to initialize after multiple retries.
   * The shell can use this to show an error dialog and redirect.
   */
  @Output() layoutInitError = new EventEmitter<void>();

  private pinService = inject(HomeAppPinService);
  private navigationService = inject(NavigationService);
  private recordSwitcher = inject(RecordSwitcherService);
  private subscriptions: Subscription[] = [];
  private layoutInitRetryCount = 0;
  private readonly MAX_LAYOUT_INIT_RETRIES = 5;
  private layoutInitialized = false;
  private layoutRestorationComplete = false; // True only AFTER layout is fully restored/created

  // Track component references for cleanup (legacy - keep for backward compat during transition)
  private componentRefs = new Map<string, ComponentRef<BaseResourceComponent>>();
  /** Pane-level origin crumbs, one per record pane (see RecordOriginCrumbComponent) */
  private originCrumbRefs = new Map<string, ComponentRef<RecordOriginCrumbComponent>>();

  // Guard against concurrent loadTabContent calls for the same tab.
  // When a tab's content changes while active, both the reload path (workspace config subscription)
  // and onTabShown can race to call loadTabContent, resulting in duplicate component rendering.
  private tabsCurrentlyLoading = new Set<string>();

  // NEW: Smart component cache for preserving state across tab switches
  private cacheManager: ComponentCacheManager;

  // Single-resource mode: render component directly without Golden Layout
  // This avoids the 20px height issue when GL header is hidden
  useSingleResourceMode = false;
  private singleResourceComponentRef: ComponentRef<BaseResourceComponent> | null = null;
  /** Cache identity of the current single-resource component for detachment */
  private singleResourceCacheIdentity: { driverClass: string; recordId: string; appId: string; tabId: string; discriminator?: string } | null = null;
  private previousTabBarVisible: boolean | null = null;
  private currentSingleResourceSignature: string | null = null; // Track loaded content signature to avoid unnecessary reloads
  private isCreatingInitialTabs = false; // Flag to prevent syncTabsWithConfiguration during initial tab creation

  // Context menu state
  contextMenuVisible = false;
  contextMenuX = 0;
  contextMenuY = 0;
  contextMenuTabId: string | null = null;
  /** The control that opened the context menu — focus returns here on close */
  private contextMenuAnchor: HTMLElement | null = null;

  // ---- RECORDS region (records-style record opens) ----
  /**
   * A SEPARATE Golden Layout instance hosting only record tabs. Instantiated
   * directly (not DI) — GoldenLayoutManager has no constructor dependencies
   * and the root-provided instance belongs to the MAIN region. Records get
   * native GL tabs (close/drag-to-split/pin) without ever appearing in the
   * main workspace's tab bar.
   */
  private recordsLayoutManager = new GoldenLayoutManager();
  private recordsLayoutInitialized = false;
  /** Last active tab id reported by the records GL (guards focus feedback loops) */
  private recordsRegionActiveTabId: string | null = null;
  /**
   * True while records-GL tabs are being created/restored in a batch. GL
   * fires an activation event for EVERY tab it creates; letting those write
   * back into the workspace during init steals focus from the tab the user
   * actually asked for (and persists junk layouts mid-build). Suppress both
   * write-backs while set; the batch ends with one explicit focus.
   */
  private recordsCreatingTabs = false;

  /** Shell mobile breakpoint (768px) — drives the records mobile surface */
  private breakpoint = inject(ExplorerBreakpointService);
  /**
   * True while the records surface renders MOBILE chrome: strip hidden
   * (headerless GL), record bar shown, splits flattened at render, layout
   * persistence suppressed (see the LayoutChanged guard), move actions
   * hidden. Mirrors the breakpoint; flips via rebuildRecordsLayoutForBreakpoint.
   */
  private mobileRecordsActive = this.breakpoint.IsMobile;
  /**
   * True only synchronously around Destroy() during a breakpoint-crossing
   * rebuild. Destroy fires TabClosed for EVERY live pane; without this guard
   * the records TabClosed handler would CloseTab each one — a crossing would
   * close every open record. cleanupTabComponent still runs (the cache
   * detach is what lets the re-init reattach content).
   */
  private recordsRebuilding = false;

  /** True when the deployment runs the records-style record-open model */
  public get RecordsStyleActive(): boolean {
    return IsRecordTabsStyle();
  }

  /** Records surface is in mobile chrome (record bar instead of tab strip) */
  public get IsMobileRecords(): boolean {
    return this.RecordsStyleActive && this.mobileRecordsActive;
  }

  // ---- Mobile record bar state (computed by updateRecordSurfaceState) ----
  /** Active record's title, entity icon, and app color for the mobile bar */
  public RecordBarTitle = '';
  public RecordBarIcon = 'fa-regular fa-file-lines';
  public RecordBarColor = DEFAULT_APP_COLOR;
  /**
   * ALL open records — region AND docked — matching the switcher sheet's
   * row count (docked/region composition is a desktop concept; on mobile
   * they're one list).
   */
  public OpenRecordCount = 0;
  /** Record switcher sheet visibility (mobile) */
  public RecordSwitcherVisible = false;
  /** Rows for the record switcher sheet (region + docked records, by sequence) */
  public SwitcherEntries: RecordSwitcherEntry[] = [];

  /** Open the record switcher sheet (record bar tap / drawer pill) */
  public OpenRecordSwitcher(): void {
    if (this.OpenRecordCount === 0) {
      return;
    }
    this.RecordSwitcherVisible = true;
    this.flushRegionCd();
  }

  /** Sheet row tapped: activate — same contract as the pill (sync drives GL focus) */
  public OnSwitcherActivate(tabId: string): void {
    this.RecordSwitcherVisible = false;
    this.flushRegionCd();
    // Guard against a stale row (SetActiveTab doesn't validate existence —
    // stamping a closed tab's id would leave no resolvable active tab)
    if (this.workspaceManager.GetTab(tabId)) {
      this.workspaceManager.SetActiveTab(tabId);
    }
  }

  /**
   * Sheet row ✕: close the record through the SAME path as the tab context
   * menu — GL RemoveTab → TabClosed handler (workspace bookkeeping, close
   * guards, cache eviction all apply). The workspace-level fallback covers
   * the edge where GL never held the tab (zero-height init refusal).
   * The sheet stays open; entries recompute on the config emission.
   */
  public OnSwitcherClose(tabId: string): void {
    const tab = this.workspaceManager.GetTab(tabId);
    const manager = tab && this.isRecordTab(tab) ? this.recordsLayoutManager : this.layoutManager;
    if (manager.GetContainer(tabId)) {
      manager.RemoveTab(tabId);
    } else if (tab) {
      // GL never held this tab (e.g. docked record in single-resource mode) —
      // run the same cleanup the GL close path does (cache detach, origin
      // crumb destroy) or the crumb ComponentRef leaks in originCrumbRefs.
      this.cleanupTabComponent(tabId);
      this.workspaceManager.CloseTab(tabId);
    }
  }

  public OnSwitcherVisibleChange(visible: boolean): void {
    this.RecordSwitcherVisible = visible;
  }

  /**
   * Recompute the mobile record-surface state (bar inputs + count) from a
   * workspace configuration emission. Cheap and unconditional — the values
   * only render while IsMobileRecords, but keeping them current at all
   * widths makes the breakpoint flip instant.
   */
  private updateRecordSurfaceState(config: { tabs: WorkspaceTab[]; activeTabId: string | null }): void {
    if (!this.RecordsStyleActive) {
      return;
    }
    const previous = `${this.RecordBarTitle}|${this.RecordBarIcon}|${this.RecordBarColor}|${this.OpenRecordCount}`;
    const allRecords = config.tabs
      .filter(t => IsRecordsTabConfiguration(t.configuration))
      .sort((a, b) => a.sequence - b.sequence);
    this.OpenRecordCount = allRecords.length;
    this.SwitcherEntries = allRecords.map(tab => this.buildSwitcherEntry(tab, config.activeTabId));
    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (activeTab && this.isRecordTab(activeTab)) {
      const app = this.appManager.GetAppById(activeTab.applicationId);
      this.RecordBarTitle = activeTab.title;
      this.RecordBarIcon = ResolveRecordTypeIcon(activeTab.configuration, this.ProviderToUse);
      this.RecordBarColor = app?.GetColor() || DEFAULT_APP_COLOR;
    }
    // If the active tab is NOT a region record the bar isn't visible (the
    // records region is hidden) — stale bar values are harmless.
    if (this.RecordSwitcherVisible && this.OpenRecordCount === 0) {
      // Last record closed from the sheet — nothing left to switch to
      this.RecordSwitcherVisible = false;
    }
    const current = `${this.RecordBarTitle}|${this.RecordBarIcon}|${this.RecordBarColor}|${this.OpenRecordCount}`;
    // Always flush while the sheet is OPEN: its rows carry state the bar hash
    // can't see (row titles, origins, IsActive) — an activation or async
    // title change with identical bar values would otherwise render stale.
    if (this.RecordSwitcherVisible || (this.mobileRecordsActive && current !== previous)) {
      this.flushRegionCd();
    }
  }

  /** One switcher sheet row: identity + origin subtitle (crumb semantics) */
  private buildSwitcherEntry(tab: WorkspaceTab, activeTabId: string | null): RecordSwitcherEntry {
    const app = this.appManager.GetAppById(tab.applicationId);
    const origin = GetRecordSourceContext(tab.configuration);
    const originLabel = origin
      ? (origin.sourceLabel ?? ([origin.sourceAppName, origin.sourceNavLabel].filter(Boolean).join(' › ') || null))
      : null;
    return {
      TabId: tab.id,
      Title: tab.title,
      Icon: ResolveRecordTypeIcon(tab.configuration, this.ProviderToUse),
      Color: app?.GetColor() || DEFAULT_APP_COLOR,
      OriginLabel: originLabel,
      IsActive: tab.id === activeTabId
    };
  }

  /** True while the RECORDS region is the visible surface (active tab is a record) */
  public ShowRecordsRegion = false;


  /**
   * A tab belongs to the records REGION (not the main workspace layout).
   * Records docked to the workspace ("Move to Workspace") fail this check —
   * they are main-layout tabs everywhere this predicate gates.
   */
  private isRecordTab(tab: WorkspaceTab): boolean {
    return this.RecordsStyleActive && IsRecordsRegionTab(tab.configuration);
  }

  /**
   * Synchronous, exception-safe change-detection flush. Zoneless + OnPush
   * ancestors make RxJS-driven mutations invisible until SOMETHING runs CD;
   * detectChanges throws when a pass is already in flight, and an unguarded
   * throw inside a promise/subscription silently kills the update (the
   * original "clicked the pill, nothing happened for seconds" bug). markForCheck
   * first so even the re-entrant case gets picked up by the in-flight pass.
   */
  private flushRegionCd(): void {
    SafeDetectChanges(this.cdr);
  }

  /**
   * Keep the RECORDS region in lockstep with the workspace configuration:
   * resolve region visibility (active tab is a record), lazily initialize the
   * records layout on first show (restoring the persisted records layout when
   * it matches the tab set), add/remove record tabs, and focus the active one.
   */
  private syncRecordsRegion(config: { tabs: WorkspaceTab[]; activeTabId: string | null }): void {
    if (!this.RecordsStyleActive) {
      // Defense in depth: if the style ever resolves to classic AFTER a
      // records-style pass set the flag (e.g. late instance-config load),
      // un-hide the main region — otherwise it stays invisible forever.
      if (this.ShowRecordsRegion) {
        this.ShowRecordsRegion = false;
        this.flushRegionCd();
      }
      return;
    }
    const recordTabs = config.tabs.filter(t => this.isRecordTab(t));
    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    const showing = !!activeTab && this.isRecordTab(activeTab);

    // EAGER init + sync on EVERY emission. The region container always keeps
    // its full layout box (visibility-hidden, never display:none — see the
    // component CSS), so the records GL can initialize and reconcile even
    // while the region isn't the visible surface. This is what keeps the
    // strip, the pill, and the workspace from ever drifting apart: closed
    // records leave the strip immediately, new ones appear immediately,
    // whether or not the user is looking at the region.
    if (!this.recordsLayoutInitialized && recordTabs.length > 0) {
      this.ensureRecordsLayoutInitialized(recordTabs);
    }
    if (this.recordsLayoutInitialized) {
      this.syncRecordsTabs(recordTabs);
    }

    if (showing !== this.ShowRecordsRegion) {
      this.ShowRecordsRegion = showing;
      // Flush NOW — the visibility class must land in this pass, not
      // whenever the next unrelated emission happens to run CD.
      this.flushRegionCd();
    }

    if (showing && activeTab && this.recordsLayoutInitialized) {
      this.focusRecordsTab(activeTab.id);
    }
  }

  /** Add/remove/style record tabs in the records GL to match the configuration */
  private syncRecordsTabs(recordTabs: WorkspaceTab[]): void {
    if (!this.recordsLayoutInitialized) {
      return;
    }
    const existingIds = this.recordsLayoutManager.GetAllTabIds();
    const configIds = recordTabs.map(t => t.id);
    existingIds.forEach(id => {
      if (!configIds.includes(id)) {
        this.recordsLayoutManager.RemoveTab(id);
      }
    });
    const toCreate = recordTabs.filter(t => !existingIds.includes(t.id));
    if (toCreate.length > 0) {
      this.recordsCreatingTabs = true;
      try {
        toCreate.forEach(tab => this.createRecordsRegionTab(tab));
      } finally {
        this.recordsCreatingTabs = false;
      }
    }
    recordTabs.forEach(tab => {
      if (existingIds.includes(tab.id)) {
        const app = this.appManager.GetAppById(tab.applicationId);
        this.recordsLayoutManager.UpdateTabStyle(tab.id, {
          isPinned: tab.isPinned,
          title: tab.title,
          appColor: app?.GetColor() || DEFAULT_APP_COLOR,
          typeIcon: this.resolveTabTypeIcon(tab)
        });
        // Origin can change on re-open re-capture — keep the pane crumb live
        this.updateOriginCrumb(tab);
      }
    });
  }

  /** Focus a records-region tab without feeding back into SetActiveTab loops */
  private focusRecordsTab(tabId: string): void {
    if (this.recordsRegionActiveTabId !== tabId) {
      this.recordsLayoutManager.FocusTab(tabId);
    }
  }

  /**
   * Initialize the records Golden Layout as soon as record tabs exist —
   * EAGERLY, whether or not the region is visible (its container always has
   * a full layout box). Restores the persisted records layout when its
   * component count matches the current record-tab set; otherwise builds
   * tabs fresh. Creation/restore runs with activation write-backs
   * suppressed (see recordsCreatingTabs).
   */
  private ensureRecordsLayoutInitialized(recordTabs: WorkspaceTab[]): void {
    if (this.recordsLayoutInitialized) {
      return;
    }
    const container = this.recordsGlContainer?.nativeElement;
    if (!container) {
      return; // Template not settled yet — the next sync pass retries
    }
    // NEVER initialize GL inside a zero-size (hidden) container — it bakes a
    // 0x0 internal size into every stack it later creates and the region
    // renders collapsed forever. Happens when the region flip is reverted
    // (activation stolen) before this deferred init runs; staying
    // uninitialized is safe — the next real show retries.
    if (container.getBoundingClientRect().height === 0) {
      return;
    }
    // Mobile: headerless GL — the record bar replaces the strip
    this.recordsLayoutManager.Initialize(container, { HideHeaders: this.mobileRecordsActive });
    this.recordsLayoutInitialized = true;

    this.recordsCreatingTabs = true;
    try {
      const config = this.workspaceManager.GetConfiguration();
      const savedLayout = config?.recordsLayout;
      // Mobile renders the persisted layout FLATTENED to one stack — a clone;
      // the persisted recordsLayout is never touched (and never written back
      // while mobile — see the LayoutChanged guard). Flattening preserves
      // components, so the restore gate below is unaffected.
      const layoutToLoad = this.mobileRecordsActive ? FlattenLayoutToSingleStack(savedLayout) : savedLayout;
      // Restore gate: the persisted layout must cover EXACTLY the current tab
      // set — identity, not count. Counts can match while identities diverge
      // (open one + close one during a persistence-suppressed mobile session);
      // loading such a layout would render a ghost pane for a closed record.
      if (layoutToLoad?.root && recordTabs.length > 0 && this.layoutCoversExactTabSet(layoutToLoad.root, recordTabs)) {
        if (this.recordsLayoutManager.LoadLayout(layoutToLoad)) {
          return;
        }
      }
      // No (or mismatched) saved layout — create record tabs fresh
      [...recordTabs]
        .sort((a, b) => a.sequence - b.sequence)
        .forEach(tab => this.createRecordsRegionTab(tab));
    } finally {
      this.recordsCreatingTabs = false;
    }
  }

  /**
   * Breakpoint crossing: tear the records GL down and let the next sync pass
   * rebuild it in the other chrome mode (mobile: headerless + flattened;
   * desktop: full strip + restored splits). The teardown runs under
   * recordsRebuilding — Destroy() fires TabClosed per pane, and without the
   * guard those events would CloseTab every open record (see the guard's
   * field comment). Content survives via the component cache: cleanup
   * detaches each pane's component, and the re-init's first-show reattaches.
   */
  private rebuildRecordsLayoutForBreakpoint(): void {
    // The switcher sheet is MOBILE chrome — never let it survive a crossing
    // (it would overlay the desktop UI and its entries stop re-rendering)
    this.RecordSwitcherVisible = false;
    // Template state first (bar/strip @if flips, region height settles)
    this.flushRegionCd();
    if (!this.recordsLayoutInitialized) {
      return; // GL not built yet — the next sync initializes in the new mode
    }
    this.recordsRebuilding = true;
    try {
      this.recordsLayoutManager.Destroy();
    } finally {
      // ALL teardown state resets live in the finally: if Destroy() throws
      // mid-walk, leaving recordsLayoutInitialized=true over a half-destroyed
      // GL would corrupt every subsequent sync pass.
      this.recordsRebuilding = false;
      this.recordsLayoutInitialized = false;
      this.recordsRegionActiveTabId = null;
    }
    // Defer re-init one macrotask so the flipped template has painted and
    // the GL container has its final (bar-adjusted) height before Initialize
    // measures it — same reason handleTabBarVisibilityChange defers.
    setTimeout(() => {
      const config = this.workspaceManager.GetConfiguration();
      if (config) {
        this.syncRecordsRegion(config);
      }
    }, 0);
  }

  /** Create a record tab in the RECORDS layout (mirror of createTab for main) */
  private createRecordsRegionTab(tab: WorkspaceTab): void {
    const app = this.appManager.GetAppById(tab.applicationId);
    const state: TabComponentState = {
      tabId: tab.id,
      appId: tab.applicationId,
      appColor: app?.GetColor() || DEFAULT_APP_COLOR,
      title: tab.title,
      route: tab.configuration['route'] as string || '',
      isPinned: tab.isPinned,
      isLoaded: false,
      typeIcon: this.resolveTabTypeIcon(tab)
    };
    this.recordsLayoutManager.AddTab(state);
    this.updateTabDisplayName(tab);
  }


  constructor(
    private layoutManager: GoldenLayoutManager,
    private workspaceManager: WorkspaceStateManager,
    private appManager: ApplicationManager,
    private appRef: ApplicationRef,
    private environmentInjector: EnvironmentInjector,
    private cdr: ChangeDetectorRef
  ) {
    super();
    // Initialize component cache manager
    this.cacheManager = new ComponentCacheManager(this.appRef, this.navigationService);
  }

  ngOnInit(): void {
    // Subscribe to tab events
    this.subscriptions.push(
      this.layoutManager.TabShown.subscribe(event => {
        this.onTabShown(event);
      }),
      this.layoutManager.TabClosed.subscribe(tabId => {
        this.cleanupTabComponent(tabId);
        // DEMOTE guard ("Move to Records"): the tab was removed from the
        // main GL because its region membership changed — it's still in the
        // workspace config and the records region is about to pick it up.
        // Closing it here would destroy the tab the user asked to keep.
        // cleanupTabComponent above still runs: the cache detach is what
        // lets the records GL reattach the component with state intact.
        const movedTab = this.workspaceManager.GetTab(tabId);
        if (movedTab && this.isRecordTab(movedTab)) {
          return;
        }
        this.workspaceManager.CloseTab(tabId);
      }),
      this.layoutManager.LayoutChanged.subscribe(event => {
        const layout = this.layoutManager.SaveLayout();
        this.workspaceManager.UpdateLayout(layout);
      }),
      this.layoutManager.ActiveTab.subscribe(tabId => {
        if (tabId) {
          this.workspaceManager.SetActiveTab(tabId);
        }
      }),
      this.layoutManager.TabDoubleClicked.subscribe(tabId => {
        this.workspaceManager.TogglePin(tabId);
      }),
      this.layoutManager.TabRightClicked.subscribe(event => {
        this.showContextMenu(event.x, event.y, event.tabId, event.anchorEl);
      })
    );

    this.wireRecordsLayoutEvents();

    // Breakpoint crossings rebuild the records GL in the other chrome mode
    // (headerless+flattened vs full strip+splits). Skip-if-equal: the
    // BehaviorSubject replays the current value on subscribe.
    this.subscriptions.push(
      this.breakpoint.IsMobile$.subscribe(isMobile => {
        // Exception-guarded like the Configuration subscription: a throw from
        // one crossing (e.g. a cached component's ngOnDestroy during the GL
        // teardown) would otherwise unsubscribe the stream permanently and
        // brick breakpoint handling until reload.
        try {
          if (isMobile === this.mobileRecordsActive) {
            return;
          }
          this.mobileRecordsActive = isMobile;
          this.rebuildRecordsLayoutForBreakpoint();
        } catch (err) {
          LogError(err);
        }
      }),
      // Open requests from surfaces outside this component (drawer pill)
      this.recordSwitcher.OpenRequested.subscribe(() => {
        this.OpenRecordSwitcher();
      })
    );

    // Subscribe to configuration changes to sync tabs.
    // The callback is exception-guarded: an error thrown from ONE emission
    // would otherwise unsubscribe the stream permanently — after which the
    // regions silently stop tracking the workspace (tabs drift, content
    // stops loading) with no visible failure.
    this.subscriptions.push(
      this.workspaceManager.Configuration.subscribe(config => {
        try {
        if (config) {
          // Keep the RECORDS region in sync first — it also resolves whether
          // the region is the visible surface for this configuration.
          this.syncRecordsRegion(config);
          this.updateRecordSurfaceState(config);

          if (this.useSingleResourceMode) {
            // In single-resource mode, reload content if the tab content changed
            // The same tab ID can have different content (tab gets reused)
            const activeTab = config.tabs.find(t => t.id === config.activeTabId) || config.tabs[0];
            if (activeTab && this.isRecordTab(activeTab)) {
              // Active tab is a RECORD — the records region owns it. Leave the
              // main region's content (the last nav page) untouched behind it.
            } else if (activeTab) {
              const signature = this.getTabContentSignature(activeTab);
              if (signature !== this.currentSingleResourceSignature) {
                // DO NOT call saveCurrentComponentQueryParams() here — by the time this
                // subscription fires, OpenTab has already replaced the tab config with the
                // new nav item's config, so queryParams are gone. The cache entry already
                // has the correct queryParams from the most recent unchanged-signature save.
                this.loadSingleResourceContent();
              } else {
                // Signature unchanged — sync queryParams to cache entry so it stays current.
                // This catches incremental queryParam updates (e.g., user selects a conversation).
                this.saveCurrentComponentQueryParams();
              }
            }
          } else if (this.layoutRestorationComplete && !this.isCreatingInitialTabs) {
            // In multi-tab mode, sync with Golden Layout.
            // Record tabs live in the records region — never in the main layout.
            // IMPORTANT: Only sync AFTER layout restoration is complete to avoid creating duplicate tabs
            // layoutRestorationComplete is set to true only after initializeGoldenLayout finishes
            this.syncTabsWithConfiguration(config.tabs.filter(t => !this.isRecordTab(t)));
          }
        }
        } catch (err) {
          // Never let one bad emission kill the stream — see comment above.
          LogError(err);
        }
      })
    );

    // Subscribe to tab bar visibility changes for single-resource mode
    this.subscriptions.push(
      this.workspaceManager.TabBarVisible.subscribe(tabBarVisible => {
        this.handleTabBarVisibilityChange(tabBarVisible);
      })
    );
  }


  /**
   * RECORDS region event wiring: the separate layout's events route through
   * the SAME handlers as the main layout — content loading, close, pin, and
   * context menu are layout-agnostic; only layout persistence targets its
   * own slot. Activation + persistence write-backs are suppressed during
   * batch creation/restore (recordsCreatingTabs) so GL's per-tab-created
   * events can't steal focus or persist half-built layouts.
   */
  private wireRecordsLayoutEvents(): void {
    this.subscriptions.push(
      this.recordsLayoutManager.TabShown.subscribe(async event => {
        if (event.isFirstShow) {
          await this.loadTabContent(event.tabId, event.container);
          // Mark loaded ONLY when content actually attached to the LIVE
          // container. During layout restore, GL can re-render item elements
          // while an async load is in flight — the load appends into a
          // detached element and the visible pane stays blank. Leaving the
          // tab unmarked lets the next show retry, which hits the component
          // cache and reattaches instantly into the live element.
          const live = this.recordsLayoutManager.GetContainer(event.tabId);
          if (live?.element && live.element.childElementCount > 0) {
            this.recordsLayoutManager.MarkTabLoaded(event.tabId);
          }
        }
      }),
      this.recordsLayoutManager.TabClosed.subscribe(async tabId => {
        this.cleanupTabComponent(tabId);
        // REBUILD guard (breakpoint crossing): Destroy() fires TabClosed for
        // every pane. The tabs are NOT closing — the layout is being rebuilt
        // in the other chrome mode. Cache detach above is exactly what the
        // re-init needs; everything below (CloseTab, backfill) must not run.
        if (this.recordsRebuilding) {
          return;
        }
        const closedTab = this.workspaceManager.GetTab(tabId);
        // PROMOTE guard ("Move to Workspace"): the tab left the records GL
        // because its region membership changed — it's still in the
        // workspace config and the MAIN layout is about to pick it up.
        // Closing it here would destroy the tab the user just promoted.
        // cleanupTabComponent above still runs: the cache detach is what
        // lets the main GL reattach the component with state intact.
        if (closedTab && !this.isRecordTab(closedTab)) {
          return;
        }
        // Guard: a configuration sync that removed this tab already updated
        // the workspace — closing again would re-emit an unchanged config
        // from inside a subscription pass.
        if (closedTab) {
          this.workspaceManager.CloseTab(tabId);
        }
        // Records close OUTRIGHT (no keep-last-tab-alive rule) — if that
        // emptied the workspace, land the user on the active app's default
        // tab instead of a blank shell.
        await this.backfillEmptyWorkspace();
      }),
      this.recordsLayoutManager.ActiveTab.subscribe(tabId => {
        this.recordsRegionActiveTabId = tabId;
        if (tabId && this.ShowRecordsRegion && !this.recordsCreatingTabs && !this.recordsRebuilding) {
          this.workspaceManager.SetActiveTab(tabId);
        }
      }),
      this.recordsLayoutManager.LayoutChanged.subscribe(() => {
        // MOBILE suppression: the mobile surface renders a FLATTENED clone of
        // the persisted layout — persisting it would destroy the user's
        // desktop splits (GL fires stateChanged on load/resize/tab ops, so
        // the clobber would land within the 500ms persist debounce of the
        // first mobile render). While suppressed, tab opens/closes still
        // persist via the tab LIST; on the next desktop init a changed tab
        // count hits the existing count-mismatch restore path (fresh
        // sequential creation — splits lost gracefully, records kept).
        if (this.recordsLayoutInitialized && !this.recordsCreatingTabs && !this.recordsRebuilding && !this.mobileRecordsActive) {
          this.workspaceManager.UpdateRecordsLayout(this.recordsLayoutManager.SaveLayout());
        }
      }),
      this.recordsLayoutManager.TabDoubleClicked.subscribe(tabId => {
        this.workspaceManager.TogglePin(tabId);
      }),
      this.recordsLayoutManager.TabRightClicked.subscribe(event => {
        this.showContextMenu(event.x, event.y, event.tabId, event.anchorEl);
      })
    );
  }

  ngAfterViewInit(): void {
    // Initialize Golden Layout only if we're not in single-resource mode
    if (!this.useSingleResourceMode) {
      this.initializeGoldenLayout();
    } else {
      // In single-resource mode, load content directly
      this.loadSingleResourceContent();
    }
  }

  /**
   * Initialize Golden Layout and load tabs
   * @param forceCreateTabs - If true, always creates tabs fresh from config.tabs instead of restoring saved layout
   */
  private initializeGoldenLayout(forceCreateTabs = false): void {
    // If we are in single resource mode we do NOT need to do this work as golden layout should not exist in that state
    if (this.useSingleResourceMode)
      return;

    if (!this.glContainer?.nativeElement) {
      this.layoutInitRetryCount++;

      if (this.layoutInitRetryCount > this.MAX_LAYOUT_INIT_RETRIES) {
        console.error(`Golden Layout container not available after ${this.MAX_LAYOUT_INIT_RETRIES} retries, emitting error`);
        this.layoutInitError.emit();
        return;
      }

      console.warn(`Golden Layout container not available, retry ${this.layoutInitRetryCount}/${this.MAX_LAYOUT_INIT_RETRIES}...`);
      setTimeout(() => this.initializeGoldenLayout(forceCreateTabs), 50);
      return;
    }

    // Reset retry counter on success
    this.layoutInitRetryCount = 0;

    if (this.layoutInitialized) {
      return; // Already initialized
    }

    // Check if configuration is available
    // If not, wait for it to be loaded before proceeding
    const config = this.workspaceManager.GetConfiguration();
    if (!config) {
      // Configuration not loaded yet - wait for it
      const configSub = this.workspaceManager.Configuration.subscribe(loadedConfig => {
        if (loadedConfig) {
          configSub.unsubscribe();
          // Re-call initializeGoldenLayout now that config is available
          this.initializeGoldenLayout(forceCreateTabs);
        }
      });
      return;
    }

    // Initialize Golden Layout (we have config now)
    this.layoutManager.Initialize(this.glContainer.nativeElement);

    // Mark layout as initialized
    this.layoutInitialized = true;

    // The MAIN layout hosts only non-record tabs — record tabs live in the
    // separate records region (no-op filter under classic style).
    const mainTabs = config.tabs.filter(t => !this.isRecordTab(t));

    // Check if config has no tabs
    if (mainTabs.length === 0) {
      // No tabs to load, but mark restoration as complete
      this.layoutRestorationComplete = true;
      return;
    }

    // Check if we have a saved layout structure with actual content
    const hasSavedLayout = config.layout?.root?.content && config.layout.root.content.length > 0;

    if (hasSavedLayout && !forceCreateTabs && config.layout) {
      // VALIDATE: Check that layout component count matches tabs array count
      const layoutComponentCount = this.countLayoutComponents(config.layout.root);
      if (layoutComponentCount !== mainTabs.length) {
        console.warn(`[TabContainer.initializeGoldenLayout] Layout/tabs mismatch: layout has ${layoutComponentCount} components but tabs array has ${mainTabs.length} tabs. Clearing layout.`);
        this.workspaceManager.ClearLayout();
        // Fall through to create fresh tabs
      } else {
        // RESTORE SAVED LAYOUT - preserves drag/drop arrangements (stacks, columns, rows)
        // This is the single source of truth for visual arrangement
        const layoutLoaded = this.layoutManager.LoadLayout(config.layout);

        if (layoutLoaded) {
          // Mark layout restoration as complete AFTER layout is loaded
          this.layoutRestorationComplete = true;

          // Focus active tab and ensure proper sizing
          // Also trigger updateSize() to force Golden Layout to fire 'show' events
          // for the active tab in ALL stacks (not just the globally active tab)
          setTimeout(() => {
            if (config.activeTabId) {
              this.layoutManager.FocusTab(config.activeTabId);
            }
            // Trigger resize to ensure all visible tabs in all stacks render their content
            this.layoutManager.updateSize();
          }, 50);
          return; // Layout restored successfully
        }

        // Layout load FAILED - clear the corrupted layout and fall through to create tabs fresh
        console.warn('[TabContainer] Saved layout was corrupted, clearing and recreating tabs');
        this.workspaceManager.ClearLayout();
      }
    }

    // CREATE FRESH - no saved layout, forceCreateTabs=true, or layout load failed
    // Use the main (non-record) tabs sorted by sequence for a single-stack layout
    const sortedTabs = [...mainTabs].sort((a, b) => a.sequence - b.sequence);

    this.isCreatingInitialTabs = true;
    try {
      sortedTabs.forEach(tab => {
        this.createTab(tab);
      });
    } finally {
      this.isCreatingInitialTabs = false;
    }

    // Mark layout restoration as complete AFTER tabs are created
    this.layoutRestorationComplete = true;

    setTimeout(() => {
      if (config.activeTabId) {
        this.layoutManager.FocusTab(config.activeTabId);
      }
    }, 50);
  }

  /**
   * Clear cached components matching a predicate. Components that match are
   * destroyed; others are kept. Use for tenant switching — clear org-scoped
   * components while keeping system/global components alive.
   *
   * @param predicate Return true for components that should be destroyed.
   *                  If omitted, clears ALL cached components.
   * @returns Number of components destroyed.
   */
  public ClearComponentCache(predicate?: (info: CachedComponentInfo) => boolean): number {
    if (predicate) {
      return this.cacheManager.ClearCacheByPredicate(predicate);
    }
    const stats = this.cacheManager.getCacheStats();
    this.cacheManager.clearCache();
    return stats.total;
  }

  /**
   * Destroy all cached components and reload open tabs.
   *
   * In single-resource mode: clears the signature to force a reload, then
   * re-invokes loadSingleResourceContent().
   *
   * In multi-tab mode: destroys all cached components, marks all tabs as
   * not-loaded, then reloads the currently active tab immediately. Other
   * tabs reload lazily when the user switches to them (onTabShown fires
   * with isFirstShow=true after MarkTabNotLoaded).
   *
   * Use this for tenant switching — tabs stay open but their components
   * are recreated fresh with the new org context.
   */
  public async ReloadAllTabs(): Promise<void> {
    // Destroy all cached component instances
    this.cacheManager.clearCache();

    if (this.useSingleResourceMode) {
      // Force reload by clearing the signature check
      this.currentSingleResourceSignature = null;
      this.singleResourceComponentRef = null;
      this.singleResourceCacheIdentity = null;
      await this.loadSingleResourceContent();
    } else {
      // Mark all tabs as not-loaded so onTabShown will trigger loadTabContent
      const tabIds = this.layoutManager.GetAllTabIds();
      for (const tabId of tabIds) {
        this.layoutManager.MarkTabNotLoaded(tabId);
      }

      // Reload the currently active tab immediately
      const activeTabId = this.workspaceManager.GetActiveTabId();
      if (activeTabId && this.layoutManager.IsInitialized) {
        const container = this.layoutManager.GetContainer(activeTabId);
        if (container) {
          await this.loadTabContent(activeTabId, container);
          this.layoutManager.MarkTabLoaded(activeTabId);
        }
      }
    }

    // The RECORDS region is a separate layout with the same destroyed-cache
    // problem — sweep it in BOTH main modes or every record pane stays
    // permanently blank after a tenant switch (marked loaded, component gone).
    await this.reloadRecordsRegionTabs();
  }

  /** Mark all records-region tabs not-loaded and reload the active one (tenant switch) */
  private async reloadRecordsRegionTabs(): Promise<void> {
    if (!this.recordsLayoutInitialized) {
      return;
    }
    for (const tabId of this.recordsLayoutManager.GetAllTabIds()) {
      this.recordsLayoutManager.MarkTabNotLoaded(tabId);
    }
    const activeTabId = this.workspaceManager.GetActiveTabId();
    const activeTab = activeTabId ? this.workspaceManager.GetTab(activeTabId) : undefined;
    if (activeTab && this.isRecordTab(activeTab)) {
      const container = this.recordsLayoutManager.GetContainer(activeTab.id);
      if (container) {
        await this.loadTabContent(activeTab.id, container);
        this.recordsLayoutManager.MarkTabLoaded(activeTab.id);
      }
    }
  }

  /**
   * If the workspace has no tabs left (closing the last record empties it —
   * records skip the manager's keep-last-tab-alive rule), open the active
   * app's default tab so the user lands on a meaningful surface.
   */
  private async backfillEmptyWorkspace(): Promise<void> {
    const config = this.workspaceManager.GetConfiguration();
    if (!config || config.tabs.length > 0) {
      return;
    }
    const app = this.appManager.GetActiveApp();
    if (!app) {
      return;
    }
    const request = await app.CreateDefaultTab();
    if (request) {
      this.workspaceManager.OpenTab(request, app.GetColor());
    }
  }

  ngOnDestroy(): void {
    // Pane crumbs are appRef-attached views — destroy them or they stay in
    // every CD pass after the container is gone (logout/tenant teardown).
    this.originCrumbRefs.forEach(ref => ref.destroy());
    this.originCrumbRefs.clear();
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Tear down the records region's layout
    if (this.recordsLayoutInitialized) {
      this.recordsLayoutManager.Destroy();
      this.recordsLayoutInitialized = false;
    }

    // Cleanup single-resource mode component if exists
    this.cleanupSingleResourceComponent();

    // Clear the component cache (destroys all components)
    this.cacheManager.clearCache();

    // Cleanup any legacy componentRefs
    this.componentRefs.forEach((ref, _tabId) => {
      this.appRef.detachView(ref.hostView);
      ref.destroy();
    });
    this.componentRefs.clear();
  }

  /**
   * Handle window resize events as a fallback safety mechanism.
   * Golden Layout's ResizeObserver should handle most cases, but this
   * ensures the layout is properly sized after browser window changes.
   */
  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.layoutInitialized && !this.useSingleResourceMode) {
      this.layoutManager.updateSize();
    }
  }

  /**
   * Handle changes to tab bar visibility - switches between single-resource and multi-tab modes
   */
  private handleTabBarVisibilityChange(tabBarVisible: boolean): void {
    // Skip if no change
    if (this.previousTabBarVisible === tabBarVisible) {
      return;
    }
    this.previousTabBarVisible = tabBarVisible;

    // Determine if we should use single-resource mode
    const shouldUseSingleResourceMode = !tabBarVisible;

    if (shouldUseSingleResourceMode !== this.useSingleResourceMode) {
      this.useSingleResourceMode = shouldUseSingleResourceMode;
      // Defer detectChanges to next microtask to avoid ExpressionChangedAfterItHasBeenCheckedError
      // when this handler fires during an already-running change detection cycle.
      Promise.resolve().then(() => this.cdr.detectChanges());

      if (this.useSingleResourceMode) {
        // Transitioning to single-resource mode
        // **CRITICAL FIX**: Wait for the template to render directContentContainer
        // before trying to load content. detectChanges() only marks dirty, doesn't render immediately.
        setTimeout(() => {
          // First, destroy Golden Layout if it was initialized (prevents stale state)
          if (this.layoutInitialized) {
            this.layoutManager.Destroy();
            this.layoutInitialized = false;
            // Reset restoration flag too — otherwise a subsequent flip back to multi-tab
            // mode will let the Configuration subscription take the "restoration-complete"
            // branch and try to mutate a non-existent layout, producing
            // "GoldenLayoutManager: Layout not initialized" on the next AddTab.
            this.layoutRestorationComplete = false;
          }
          // Load the active tab's content directly (now container will exist)
          this.loadSingleResourceContent();
        }, 0);
      } else {
        // Transitioning to multi-tab mode
        // Pin the previously displayed tab (it was the "current" content in single-resource mode)
        // This ensures we only have ONE temporary tab at a time
        const config = this.workspaceManager.GetConfiguration();
        if (config && config.tabs.length > 0) {
          // The new tab (just added via OpenTabForced) is now the activeTabId
          // All OTHER unpinned tabs should be pinned since they represent content
          // the user explicitly kept open
          const updatedTabs = config.tabs.map(tab => {
            // Pin all MAIN-layout tabs except the newly active one (which is
            // the temporary tab). Record tabs are exempt — their pin state is
            // user-owned (PreservePinState), and force-pinning them makes the
            // temp-tab semantics path-dependent.
            if (tab.id !== config.activeTabId && !tab.isPinned && !this.isRecordTab(tab)) {
              return { ...tab, isPinned: true };
            }
            return tab;
          });

          // Only update if we actually changed something
          const hasChanges = updatedTabs.some((tab, i) => tab.isPinned !== config.tabs[i].isPinned);
          if (hasChanges) {
            this.workspaceManager.UpdateConfiguration({
              ...config,
              tabs: updatedTabs
            });
          }
        }

        // Clean up direct component, Golden Layout will handle tabs
        this.cleanupSingleResourceComponent();
        this.currentSingleResourceSignature = null; // Reset tracking

        // Reset layout initialized flag since we're switching from single-resource mode
        // The gl-container is a new DOM element (due to @if), so we need fresh initialization
        this.layoutInitialized = false;
        // Restoration is also undone — see comment above on the single-resource branch.
        this.layoutRestorationComplete = false;

        // Initialize Golden Layout - use setTimeout to allow the template to update first
        // and ensure the gl-container div exists in the DOM
        // IMPORTANT: Use forceCreateTabs=true to create tabs fresh from config.tabs
        // instead of restoring potentially stale saved layout structure
        setTimeout(() => {
          this.initializeGoldenLayout(true /* forceCreateTabs */);
        }, 0);
      }
    }
  }

  /**
   * Load content directly for single-resource mode (bypasses Golden Layout)
   */
  private async loadSingleResourceContent(): Promise<void> {
    // Wait for next tick to ensure the container is rendered
    await Promise.resolve();

    const config = this.workspaceManager.GetConfiguration();
    if (!config || config.tabs.length === 0) {
      return;
    }

    // Get the active tab (or first tab)
    let activeTab = config.tabs.find(t => t.id === config.activeTabId) || config.tabs[0];

    // Records style: record tabs render in the RECORDS region, never here.
    // When the active tab is a record (e.g. reloading the app while viewing
    // one), the main region shows the most recently used NAV tab behind it.
    if (activeTab && this.isRecordTab(activeTab)) {
      const navTabs = config.tabs.filter(t => !this.isRecordTab(t));
      activeTab = [...navTabs].sort((a, b) => (b.lastAccessedAt || '').localeCompare(a.lastAccessedAt || ''))[0];
      if (!activeTab) {
        // Only record tabs exist — the records region owns first-load
        return;
      }
    }

    if (!activeTab) {
      // Config has tabs but none match activeTabId and the array fallback failed.
      // This shouldn't happen, but if it does, unblock the loading screen.
      this.emitFirstLoadCompleteOnce();
      return;
    }

    // Track which content we're loading (signature includes resource type and record ID)
    const newSignature = this.getTabContentSignature(activeTab);
    if (this.currentSingleResourceSignature === newSignature) {
      // Content already loaded, no action needed
      return;
    }
    this.currentSingleResourceSignature = newSignature;

    // Get the container element
    const container = this.directContentContainer?.nativeElement;
    if (!container) {
      // Retry after view is updated
      setTimeout(() => this.loadSingleResourceContent(), 50);
      return;
    }

    // Create ResourceData from tab
    const resourceData = await this.getResourceDataFromTab(activeTab);
    if (!resourceData) {
      LogError(`Unable to create ResourceData for tab: ${activeTab.title}`);
      // Unblock the shell's loading overlay — stale or malformed tab config shouldn't
      // leave the user stuck on the loading screen forever
      this.emitFirstLoadCompleteOnce();
      return;
    }

    // Get driver class for component lookup
    const driverClass = resourceData.Configuration?.resourceTypeDriverClass || resourceData.ResourceType;
    // Entity name discriminates between "new record" tabs of different entities (all
    // have empty ResourceRecordID otherwise). For non-Records resources this is undefined.
    const cacheDiscriminator = resourceData.Configuration?.Entity as string | undefined;

    // **OPTIMIZATION: Check cache first to reuse existing loaded component**
    const cached = this.cacheManager.getCachedComponent(
      driverClass,
      resourceData.ResourceRecordID || '',
      activeTab.applicationId,
      cacheDiscriminator
    );

    if (cached) {
      // Clean up previous single-resource component (if different)
      this.cleanupSingleResourceComponent();

      // Mark cached component as attached to this tab (it was detached / available for reuse).
      // IMPORTANT: We use markAsAttached here, NOT markAsDetached — the component is being
      // reattached to the DOM and should NOT be eligible for LRU eviction.
      this.cacheManager.markAsAttached(
        driverClass,
        resourceData.ResourceRecordID || '',
        activeTab.applicationId,
        activeTab.id,
        cacheDiscriminator
      );

      // Record panes lead with their origin crumb
      this.ensureRecordOriginCrumb(activeTab, container);

      // Re-home the component's tab binding (see loadTabContent's cached
      // branch — same cross-tab reattach hazard).
      (cached.componentRef.instance as BaseResourceComponent).RebindTabId(activeTab.id);

      // Reattach the cached wrapper element to single-resource container
      // (sizing via the pane-layout CSS: crumb fixed, content flex-fills)
      container.appendChild(cached.wrapperElement);

      // Store reference and identity for cleanup/detachment
      this.singleResourceComponentRef = cached.componentRef;
      this.singleResourceCacheIdentity = { driverClass, recordId: resourceData.ResourceRecordID || '', appId: activeTab.applicationId, tabId: activeTab.id, discriminator: cacheDiscriminator };

      // Reconcile the cached component's preserved queryParams with any INCOMING navigation
      // intent already on the tab config (e.g. a Home pin / deep link that targeted a specific
      // conversation via SwitchToApp before we got here).
      //
      // - If the tab has incoming queryParams, those are the source of truth: keep them and
      //   sync the cache's snapshot to match. The component's reactive query-param subscription
      //   (alive while detached) delivers them, so it switches to the requested state. Restoring
      //   savedQueryParams here instead would clobber the navigation intent — the bug where two
      //   conversation pins both reopened whatever chat was already cached.
      // - Only when there's NO incoming intent (a plain tab re-focus) do we restore the
      //   component's own preserved params so the URL reflects its retained state.
      const incomingQP = activeTab.configuration?.['queryParams'] as Record<string, string> | undefined;
      const hasIncomingQP = incomingQP != null && Object.keys(incomingQP).length > 0;
      if (hasIncomingQP) {
        cached.savedQueryParams = { ...incomingQP };
      } else if (cached.savedQueryParams) {
        this.workspaceManager.UpdateTabConfiguration(activeTab.id, {
          queryParams: cached.savedQueryParams
        });
        // Do NOT clear savedQueryParams here — the else branch (unchanged-signature saves)
        // will keep it current while the component is active. Clearing it would cause the
        // queryParams to be lost on the next detach/reattach cycle.
      }

      // Cached component is already loaded — emit load-complete so the shell clears its
      // loading overlay. Without this, single-tab mode navigation to a cached resource
      // leaves the overlay blocking all user interaction.
      this.emitFirstLoadCompleteOnce();

      return;
    }

    // Get the component registration (with lazy loading fallback via ClassFactory)
    const resourceReg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
      BaseResourceComponent,
      driverClass
    );

    if (!resourceReg) {
      LogError(`Unable to find resource registration for driver class: ${driverClass}`);
      // Show the user something actionable instead of an empty pane, and unblock the
      // shell's first-load gate so the loading overlay clears.
      this.cleanupSingleResourceComponent();
      this.renderMissingResourceError(container, driverClass, {
        mode: 'single-resource',
        appId: activeTab.applicationId,
        tabId: activeTab.id,
        resourceType: resourceData.ResourceType,
        recordId: resourceData.ResourceRecordID || null,
      });
      return;
    }

    // Clean up previous component if any
    this.cleanupSingleResourceComponent();

    // Create the component dynamically
    const componentRef = createComponent(resourceReg.SubClass, {
      environmentInjector: this.environmentInjector
    });

    // Attach to Angular's change detection
    this.appRef.attachView(componentRef.hostView);

    // Set the resource data on the component
    const instance = componentRef.instance as BaseResourceComponent;
    instance.Data = resourceData;

    // Wire up events
    instance.LoadCompleteEvent = () => {
      this.emitFirstLoadCompleteOnce();
    };

    // Wire up display name change for single-resource mode.
    // Guard: only update the title if THIS component is the currently displayed one.
    // Without this guard, cached components (detached but alive) can fire this callback
    // and overwrite the active tab's title with a stale name.
    // CRITICAL: rename the tab this component was RENDERED FOR — never
    // GetActiveTabId(). Under the records style the active tab can be a
    // record (region showing) while the main region keeps a SUBSTITUTE nav
    // component alive underneath; its emission was renaming the user's
    // record tab (an Action Params record ended up titled "Data").
    const renderedTabId = activeTab.id;
    instance.DisplayNameChangedEvent = (newName: string) => {
      if (this.singleResourceComponentRef?.instance === instance) {
        this.workspaceManager.UpdateTabTitle(renderedTabId, newName);
      }
    };

    // When a record is saved, re-key the tab and cache (new-record → saved transition)
    // and refresh the tab title to reflect the entity's current display name.
    instance.ResourceRecordSavedEvent = (entity: BaseEntity) => {
      this.handleResourceRecordSaved(driverClass, activeTab.applicationId, activeTab.id, instance, entity);
    };

    // Resource asked to be closed (e.g., user discarded a brand-new record — there's
    // no actual record to view, so leaving the tab open serves no purpose and would
    // also poison the cache for the next "Create New" click of the same entity).
    instance.ResourceCloseRequestedEvent = () => {
      this.handleResourceCloseRequested(activeTab.id, instance);
    };

    // Record panes lead with their origin crumb
    this.ensureRecordOriginCrumb(activeTab, container);

    // Get the native element and append to container
    // (sizing via the pane-layout CSS: crumb fixed, content flex-fills)
    const nativeElement = (componentRef.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes[0];
    container.appendChild(nativeElement);

    // Cache the component for reuse when switching between nav items within the same app.
    // Without this, every nav switch creates a brand new component from scratch.
    const wrapperElement = nativeElement;
    this.cacheManager.cacheComponent(
      componentRef as ComponentRef<BaseResourceComponent>,
      wrapperElement,
      resourceData,
      activeTab.id
    );

    // Store reference and identity for cleanup/detachment
    this.singleResourceComponentRef = componentRef as ComponentRef<BaseResourceComponent>;
    this.singleResourceCacheIdentity = { driverClass, recordId: resourceData.ResourceRecordID || '', appId: activeTab.applicationId, tabId: activeTab.id, discriminator: cacheDiscriminator };
  }

  /**
   * Clean up single-resource mode component
   */
  /**
   * Detaches the current single-resource component from the DOM and marks it as
   * available for reuse in the component cache.
   *
   * ╔══════════════════════════════════════════════════════════════════════════╗
   * ║  ⚠️  DO NOT DESTROY THE COMPONENT HERE — INTENTIONAL DESIGN CHOICE  ⚠️  ║
   * ║                                                                        ║
   * ║  The component is DETACHED from the DOM, NOT destroyed. It stays alive ║
   * ║  in the ComponentCacheManager with its full Angular state preserved     ║
   * ║  (properties, subscriptions, loaded data, scroll position, etc).       ║
   * ║                                                                        ║
   * ║  When the user returns to this tab, the cached component is reattached ║
   * ║  instantly — no data reload, no API calls, no flash of empty content.  ║
   * ║                                                                        ║
   * ║  Destroying components here "for memory optimization" is a net         ║
   * ║  NEGATIVE: the reload on return is far more expensive (DB queries,     ║
   * ║  API calls, re-rendering) than keeping the component in memory.        ║
   * ║  The LRU eviction in ComponentCacheManager handles memory limits —     ║
   * ║  when MaxDetachedComponents is exceeded, the LEAST recently used       ║
   * ║  components are evicted automatically.                                 ║
   * ║                                                                        ║
   * ║  If you think memory is a problem, adjust MaxDetachedComponents        ║
   * ║  instead of destroying components here.                                ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  /**
   * Save the currently displayed component's queryParams to its cache entry.
   * Called on every config change so the cache entry always has the latest queryParams,
   * even after the tab config is overwritten by a new nav item.
   */
  private saveCurrentComponentQueryParams(): void {
    if (!this.singleResourceCacheIdentity) return;

    const { tabId } = this.singleResourceCacheIdentity;
    const tab = this.workspaceManager.GetTab(tabId);
    const qp = tab?.configuration?.['queryParams'] as Record<string, string> | undefined;
    const cached = this.cacheManager.getComponentByTabId(tabId);
    if (cached) {
      cached.savedQueryParams = (qp && Object.keys(qp).length > 0) ? { ...qp } : undefined;
    }
  }

  private cleanupSingleResourceComponent(): void {
    if (this.singleResourceComponentRef) {
      if (this.singleResourceCacheIdentity) {
        const { driverClass, recordId, appId, discriminator } = this.singleResourceCacheIdentity;
        // Mark as DETACHED by resource identity — the ONE consistent key used everywhere.
        this.cacheManager.markAsDetached(driverClass, recordId, appId, discriminator);
      }
      this.singleResourceComponentRef = null;
      this.singleResourceCacheIdentity = null;
    }

    // Remove children from the container. This detaches the wrapper DOM element
    // without destroying the Angular component — it lives on in the cache.
    // Using removeChild (not innerHTML='') to avoid aggressive DOM cleanup.
    const container = this.directContentContainer?.nativeElement;
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
  }

  /**
   * Handle a record-saved event from a hosted resource component.
   *
   * Does two things on every save:
   *
   * 1. **Re-key new-record tabs.** When a tab opened as "Create New Record" (empty
   *    `resourceRecordId`) transitions to a saved record, we update both the workspace
   *    tab's id and the component-cache key to the new PK. Without this, the next
   *    `OpenNewEntityRecord(<sameEntity>)` would match this tab (both have empty
   *    `resourceRecordId`) and focus the stale form instead of opening a fresh one.
   *    For existing records being re-saved, this step is a no-op.
   *
   * 2. **Refresh the tab title.** Whether new or existing, the entity's display name
   *    (typically its `Name` field) may have changed. We call the resource component's
   *    `GetResourceDisplayName` and push the result to the tab — so a tab that read
   *    "New Foo Record" before save now reads the actual entered name.
   */
  private handleResourceRecordSaved(
    driverClass: string,
    appId: string,
    tabId: string,
    instance: BaseResourceComponent,
    entity: BaseEntity
  ): void {
    const tab = this.workspaceManager.GetTab(tabId);
    if (!tab) {
      return;
    }

    const oldRecordId = tab.resourceRecordId || '';
    // ToURLSegment, NOT ToString — must match the format NavigationService.OpenEntityRecord
    // uses and that EntityRecordResource.GetPrimaryKey expects via LoadFromURLSegment.
    const newRecordId = entity?.PrimaryKey?.ToURLSegment?.() ?? '';
    const isNewRecordTransition = oldRecordId === '' && !!newRecordId;
    // The cache entry for an empty-recordId tab was keyed with the entity name as
    // discriminator (to avoid new-record collisions across entities). Re-key has to
    // pass that same old discriminator to find the entry. After save the record has
    // a real PK, so the new key needs no discriminator.
    const oldDiscriminator = tab.configuration?.['Entity'] as string | undefined;

    if (isNewRecordTransition) {
      // Re-key the cache entry first, so when the workspace config emission triggers
      // signature/needsReload checks below, the cache lookup at the new id succeeds.
      this.cacheManager.rekeyComponent(driverClass, oldRecordId, newRecordId, appId, oldDiscriminator, undefined);

      // Keep the in-memory single-resource identity in sync so detach uses the correct key.
      if (this.singleResourceCacheIdentity?.tabId === tabId) {
        this.singleResourceCacheIdentity = {
          ...this.singleResourceCacheIdentity,
          recordId: newRecordId,
          discriminator: undefined
        };
      }

      // Pre-compute and stamp the new signature so the configuration-subscription path
      // in single-resource mode doesn't see a "content changed" delta and trigger a
      // needless reload cycle (which would destroy the currently attached component).
      if (this.useSingleResourceMode && this.currentSingleResourceSignature !== null) {
        const updatedTab: WorkspaceTab = {
          ...tab,
          resourceRecordId: newRecordId,
          configuration: { ...tab.configuration, recordId: newRecordId, isNew: undefined }
        };
        this.currentSingleResourceSignature = this.getTabContentSignature(updatedTab);
      }

      // Propagate the new id to the workspace tab.
      this.workspaceManager.UpdateTabResourceRecordId(tabId, newRecordId);
    }

    // Always refresh the tab title — the entity's display-name field (typically Name)
    // may have just been set or changed. Done after the rekey so the resource component's
    // Data.ResourceRecordID reflects the saved PK before GetResourceDisplayName reads it.
    //
    // ProviderBase caches GetEntityRecordName results, so a plain call here would return
    // the pre-edit name. Pre-warm the cache with a forceRefresh so the downstream read
    // inside GetResourceDisplayName picks up the saved name. Only meaningful for entity
    // records with a PK; other resource types' GetResourceDisplayName doesn't hit the
    // record-name cache and will work either way.
    void this.refreshTabTitleAfterSave(tabId, instance, entity);
  }

  /**
   * After a save, invalidate the entity-record-name cache for the saved record and then
   * push the resource component's current display name into the tab title.
   *
   * Errors are swallowed (logged via the inner call paths) — failing to refresh a tab
   * title should never break the save flow.
   */
  private async refreshTabTitleAfterSave(
    tabId: string,
    instance: BaseResourceComponent,
    entity: BaseEntity
  ): Promise<void> {
    try {
      const entityName = entity?.EntityInfo?.Name;
      const pk = entity?.PrimaryKey;
      if (entityName && pk?.HasValue) {
        // forceRefresh: true overwrites the cached (pre-edit) name with the fresh one.
        // GetResourceDisplayName (called next) reads the same cache and now sees fresh data.
        const md = instance.ProviderToUse;
        await md.GetEntityRecordName(entityName, pk, md.CurrentUser, true);
      }
    } catch {
      // Cache pre-warm failures are non-fatal — the title update below will fall back
      // to whatever the cache has and the user can still interact with the form.
    }
    await this.updateTabTitleFromResource(tabId, instance, instance.Data);
  }

  /**
   * A resource component asked to be dismissed — typically the user clicked Discard
   * on a brand-new record. Behavior depends on workspace state:
   *
   * - **Multi-tab mode (or > 1 tab)**: just close the tab. `WorkspaceStateManager.CloseTab`
   *   activates the next tab, `syncTabsWithConfiguration` removes the tab from Golden
   *   Layout, and the user lands on whatever tab was previously active.
   *
   * - **Last tab in the workspace**: `CloseTab` intentionally keeps the last tab around
   *   (just unpins it) so the workspace is never empty — correct for the
   *   user-clicked-X-button case, wrong here. We want the user OFF this discarded form.
   *   Workaround: `CloseTab` makes the tab unpinned (= a temp tab), then we open the
   *   app's default tab via `CreateDefaultTab()` which goes through `OpenTab` and
   *   replaces the now-temp tab. End result: user lands on the app's home/default view.
   */
  private async handleResourceCloseRequested(tabId: string, _instance: BaseResourceComponent): Promise<void> {
    const config = this.workspaceManager.GetConfiguration();
    const tab = config?.tabs.find(t => t.id === tabId);
    const isLastTab = config?.tabs.length === 1 && config.tabs[0].id === tabId;

    // DESTROY (not just detach) the cached component before closing. The default
    // tab-close path detaches and keeps components alive for reuse — but the
    // discarded form is exactly what we DON'T want to keep: it holds a stale
    // BaseEntity in view mode. The next "Create New Record" click for the same
    // entity would otherwise hit the cache discriminator lookup, find this stale
    // component, and reattach it — surfacing a blank form in view mode instead
    // of a fresh edit-mode form. Destroy here forces a cache miss on the next click.
    if (this.singleResourceCacheIdentity?.tabId === tabId) {
      // Single-resource mode: the component is tracked via singleResource* fields,
      // and its cache entry is currently marked attached. Use the identity directly
      // to destroy it (markAsDetached would clear attachedToTabId and break a
      // subsequent destroyComponentByTabId lookup).
      const { driverClass, recordId, appId, discriminator } = this.singleResourceCacheIdentity;
      this.cacheManager.destroyComponent(driverClass, recordId, appId, discriminator);
      this.singleResourceComponentRef = null;
      this.singleResourceCacheIdentity = null;
      // Clear the host container's DOM so the user isn't briefly looking at the
      // destroyed component's wrapper between CloseTab and the default-tab load.
      const directContainer = this.directContentContainer?.nativeElement;
      if (directContainer) {
        while (directContainer.firstChild) directContainer.removeChild(directContainer.firstChild);
      }
    } else {
      // Multi-tab mode: cache entry is keyed by attachedToTabId; the convenience
      // method handles the lookup.
      this.cacheManager.destroyComponentByTabId(tabId);
      this.componentRefs.delete(tabId);
    }

    this.workspaceManager.CloseTab(tabId);

    if (isLastTab && tab) {
      // CloseTab kept the tab around but unpinned it. Replace it with the app's
      // default tab so the user lands on a meaningful surface (typically the
      // home dashboard) instead of staying on the discarded form.
      const app = this.appManager.GetAppById(tab.applicationId);
      if (app) {
        const defaultTabRequest = await app.CreateDefaultTab();
        if (defaultTabRequest) {
          this.workspaceManager.OpenTab(defaultTabRequest, app.GetColor());
        }
      }
    }
  }

  /**
   * Generate a signature for tab content to detect when content changes
   * This is needed because in single-resource mode, the same tab ID can have different content
   */
  private getTabContentSignature(tab: WorkspaceTab): string {
    // Include key identifying fields that determine what component/content is shown
    // IMPORTANT: Check both resourceRecordId AND configuration.recordId
    // because for nav items, the recordId is stored in configuration, not resourceRecordId
    const effectiveRecordId = tab.resourceRecordId || (tab.configuration?.recordId as string) || '';
    const parts = [
      tab.applicationId,
      tab.configuration?.resourceType || '',
      tab.configuration?.driverClass || '',
      tab.configuration?.Entity || '',  // Include Entity name for Records resource type
      effectiveRecordId,
      tab.configuration?.route || ''
    ];
    return parts.join('|');
  }

  /**
   * Create a tab in Golden Layout from workspace tab data
   */
  private createTab(tab: WorkspaceTab): void {
    const app = this.appManager.GetAppById(tab.applicationId);
    const appColor = app?.GetColor() || '#757575';

    const state: TabComponentState = {
      tabId: tab.id,
      appId: tab.applicationId,
      appColor,
      title: tab.title,
      route: tab.configuration['route'] as string || '',
      isPinned: tab.isPinned,
      isLoaded: false,
      typeIcon: this.resolveTabTypeIcon(tab)
    };

    this.layoutManager.AddTab(state);

    // Nav-item icons live behind an async lookup — upgrade in the background
    void this.upgradeNavTabIcon(tab, this.layoutManager);

    // Load display name in background without loading full component
    this.updateTabDisplayName(tab);
  }

  /**
   * Synchronous best-effort TYPE icon for a tab (the app-colored icon in
   * the tab's type slot — see TabComponentState.typeIcon). Record tabs
   * resolve fully here (entity metadata is loaded); nav tabs start with the
   * app's icon and get upgraded to the nav item's own icon asynchronously
   * (upgradeNavTabIcon).
   */
  private resolveTabTypeIcon(tab: WorkspaceTab): string {
    if (IsRecordsTabConfiguration(tab.configuration)) {
      // Shared helper — the record bar and switcher sheet resolve through the
      // same function so a record shows one icon everywhere
      return ResolveRecordTypeIcon(tab.configuration, this.ProviderToUse);
    }
    const app = this.appManager.GetAppById(tab.applicationId);
    return app?.Icon || 'fa-regular fa-file';
  }

  /**
   * Resolve and apply a NAV tab's type icon — the async owner of nav-tab
   * icons (GetNavItems is a cached JSON parse: near-instant, but async by
   * contract). Ladder: nav item's own icon → app icon → generic. No-op for
   * record tabs (their icons resolve synchronously). Idempotent: the slot
   * only touches the DOM when the class actually changes.
   */
  private async upgradeNavTabIcon(tab: WorkspaceTab, manager: GoldenLayoutManager): Promise<void> {
    if (IsRecordsTabConfiguration(tab.configuration)) {
      return;
    }
    const app = this.appManager.GetAppById(tab.applicationId);
    let navItemIcon: string | undefined;
    const navItemName = tab.configuration?.['navItemName'];
    if (app && typeof navItemName === 'string' && navItemName) {
      try {
        const navItems = await app.GetNavItems();
        navItemIcon = navItems.find(i => i.Label === navItemName)?.Icon;
      } catch {
        // Icon resolution is cosmetic — fall through to the app fallback.
      }
    }
    manager.UpdateTabStyle(tab.id, { typeIcon: navItemIcon || app?.Icon || 'fa-regular fa-file' });
  }

  /**
   * Handle tab shown event for lazy loading
   */
  private async onTabShown(event: TabShownEvent): Promise<void> {
    if (event.isFirstShow) {
      // Load content for this tab
      await this.loadTabContent(event.tabId, event.container);
      this.layoutManager.MarkTabLoaded(event.tabId);
    }
  }

  /**
   * Load content into a tab container
   * Uses component cache to reuse components for same resources
   */
  private async loadTabContent(tabId: string, container: unknown): Promise<void> {
    // Per-tab guard: prevent concurrent loads of the same tab content.
    // This can happen when a tab's content changes while active — both the workspace
    // config subscription reload path and onTabShown can race to call this method.
    if (this.tabsCurrentlyLoading.has(tabId)) {
      return;
    }
    this.tabsCurrentlyLoading.add(tabId);

    try {
      const tab = this.workspaceManager.GetTab(tabId);
      if (!tab) {
        LogError(`Tab not found: ${tabId}`);
        this.emitFirstLoadCompleteOnce();
        return;
      }

      // Get the container element from Golden Layout
      const glContainer = container as { element: HTMLElement };
      if (!glContainer?.element) {
        LogError('Golden Layout container element not found');
        this.emitFirstLoadCompleteOnce();
        return;
      }

      // Extract resource data from tab configuration
      const resourceData = await this.getResourceDataFromTab(tab);
      if (!resourceData) {
        LogError(`Unable to create ResourceData for tab: ${tab.title}`);
        this.emitFirstLoadCompleteOnce();
        return;
      }

      // Clear any existing content from the container (important for tab reuse)
      glContainer.element.innerHTML = '';

      // Record panes lead with their origin crumb — BEFORE content attaches
      // (fresh or cached), so it is always the pane's first element.
      this.ensureRecordOriginCrumb(tab, glContainer.element);

      // Get driver class for cache lookup (resolves to actual component class name)
      const driverClass = resourceData.Configuration?.resourceTypeDriverClass || resourceData.ResourceType;
      // Discriminate distinct "new record" tabs of different entities (all have empty
      // ResourceRecordID otherwise — would silently collide in the cache).
      const cacheDiscriminator = resourceData.Configuration?.Entity as string | undefined;

      // Check if we have a cached component for this resource
      const cached = this.cacheManager.getCachedComponent(
        driverClass,
        resourceData.ResourceRecordID || '',
        tab.applicationId,
        cacheDiscriminator
      );

      if (cached) {
        // Reattach the cached wrapper element
        glContainer.element.appendChild(cached.wrapperElement);

        // Mark as attached to this tab
        this.cacheManager.markAsAttached(
          driverClass,
          resourceData.ResourceRecordID || '',
          tab.applicationId,
          tabId,
          cacheDiscriminator
        );

        // RE-HOME the component's tab binding: the cache keys on
        // driver+record+app, so this component may have been born under a
        // DIFFERENT tab id — without the rebind its query-param
        // subscription listens to the dead tab forever and deliveries to
        // this tab are lost.
        (cached.componentRef.instance as BaseResourceComponent).RebindTabId(tabId);

        // Keep legacy componentRefs map updated
        this.componentRefs.set(tabId, cached.componentRef);

        // If resource is already loaded, update tab title immediately and signal
        // load-complete so the shell clears any loading overlay.
        const instance = cached.componentRef.instance as BaseResourceComponent;
        if (instance.LoadComplete) {
          this.updateTabTitleFromResource(tabId, instance, resourceData);
          this.emitFirstLoadCompleteOnce();
        }

        return;
      }

      // Get the component registration using the driver class (with lazy loading fallback via ClassFactory)
      const resourceReg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
        BaseResourceComponent,
        driverClass
      );

      if (!resourceReg) {
        LogError(`Unable to find resource registration for driver class: ${driverClass}`);
        // Render an in-tab error instead of leaving the pane blank. The container was
        // already cleared above on line 754, so we just append the error UI here.
        this.renderMissingResourceError(glContainer.element, driverClass, {
          mode: 'multi-tab',
          appId: tab.applicationId,
          tabId,
          resourceType: resourceData.ResourceType,
          recordId: resourceData.ResourceRecordID || null,
        });
        return;
      }

      // Create the component dynamically
      const componentRef = createComponent(resourceReg.SubClass, {
        environmentInjector: this.environmentInjector
      });

      // Attach to Angular's change detection
      this.appRef.attachView(componentRef.hostView);

      // Set the resource data on the component
      const instance = componentRef.instance as BaseResourceComponent;
      instance.Data = resourceData;

      // Wire up events
      instance.LoadCompleteEvent = () => {
        // Tab content loaded - update tab title with resource display name
        this.updateTabTitleFromResource(tabId, instance, resourceData);
        this.emitFirstLoadCompleteOnce();
      };

      instance.ResourceRecordSavedEvent = (entity: BaseEntity) => {
        this.handleResourceRecordSaved(driverClass, tab.applicationId, tabId, instance, entity);
      };

      // Resource asked to be closed (e.g., user discarded a brand-new record).
      instance.ResourceCloseRequestedEvent = () => {
        this.handleResourceCloseRequested(tabId, instance);
      };

      // Wire up display name change notifications (routed to whichever
      // Golden Layout hosts this tab)
      instance.DisplayNameChangedEvent = (newName: string) => {
        const t = this.workspaceManager.GetTab(tabId);
        const manager = t && this.isRecordTab(t) ? this.recordsLayoutManager : this.layoutManager;
        manager.UpdateTabStyle(tabId, { title: newName });
        this.workspaceManager.UpdateTabTitle(tabId, newName);
      };

      // Create a container div for the component
      const componentElement = document.createElement('div');
      componentElement.className = 'tab-content-wrapper';
      componentElement.style.cssText = 'width: 100%; height: 100%;';

      // Append the component's native element
      const nativeElement = (componentRef.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes[0];
      componentElement.appendChild(nativeElement);

      // Add to Golden Layout container
      glContainer.element.appendChild(componentElement);

      // Cache the component for future reuse
      this.cacheManager.cacheComponent(
        componentRef as ComponentRef<BaseResourceComponent>,
        componentElement,
        resourceData,
        tabId
      );

      // Store reference for cleanup (legacy)
      this.componentRefs.set(tabId, componentRef as ComponentRef<BaseResourceComponent>);

    } catch (e) {
      // A tab whose resource can't resolve (e.g. a persisted tab referencing an
      // unknown ResourceType) must NEVER brick the shell: log, signal load-complete
      // so the boot loading screen clears, and close the poisoned tab so it doesn't
      // re-fail on every boot from restored workspace state.
      LogError(e);
      this.emitFirstLoadCompleteOnce();
      try {
        this.workspaceManager.CloseTab(tabId);
      } catch {
        // best-effort — leaving the tab is still recoverable via manual close
      }
    } finally {
      this.tabsCurrentlyLoading.delete(tabId);
    }
  }

  /**
   * Update tab display name in background without loading full component
   * This ensures all tabs show proper names immediately, not just when clicked
   */
  private async updateTabDisplayName(tab: WorkspaceTab): Promise<void> {
    try {
      // Only update display names for resource-based tabs
      const resourceType = tab.configuration['resourceType'] as string;
      if (!resourceType) {
        return;
      }

      // Get ResourceData from tab
      const resourceData = await this.getResourceDataFromTab(tab);
      if (!resourceData) {
        return;
      }

      // Get the resource registration to access GetResourceDisplayName without loading full component
      const driverClass = resourceData.Configuration?.resourceTypeDriverClass || resourceData.ResourceType;
      const resourceReg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
        BaseResourceComponent,
        driverClass
      );

      if (!resourceReg) {
        return;
      }

      // Create a lightweight instance just to call GetResourceDisplayName.
      // Must run inside an injection context because BaseResourceComponent
      // uses inject() field initializers (e.g. NavigationService).
      const tempInstance = runInInjectionContext(
        this.environmentInjector,
        () => new resourceReg.SubClass() as BaseResourceComponent
      );
      const displayName = await tempInstance.GetResourceDisplayName(resourceData);

      if (displayName && displayName !== tab.title) {
        // Update the tab title in whichever Golden Layout hosts this tab
        const targetManager = this.isRecordTab(tab) ? this.recordsLayoutManager : this.layoutManager;
        targetManager.UpdateTabStyle(tab.id, { title: displayName });

        // Update the tab title in workspace configuration for persistence
        this.workspaceManager.UpdateTabTitle(tab.id, displayName);
      }
    } catch (error) {
      console.error('[TabContainer.updateTabDisplayName] Error updating tab display name:', error);
    }
  }

  /**
   * Update tab title with resource display name after resource loads
   */
  private async updateTabTitleFromResource(
    tabId: string,
    resourceComponent: BaseResourceComponent,
    resourceData: ResourceData
  ): Promise<void> {
    try {
      // Get the display name from the resource component
      const displayName = await resourceComponent.GetResourceDisplayName(resourceData);

      if (!displayName) {
        return;
      }

      // Update the tab title in Golden Layout
      this.layoutManager.UpdateTabStyle(tabId, { title: displayName });

      // Update the tab title in workspace configuration for persistence
      this.workspaceManager.UpdateTabTitle(tabId, displayName);

    } catch (error) {
      console.error('[TabContainer.updateTabTitleFromResource] Error updating tab title:', error);
    }
  }

  /**
   * Convert tab configuration to ResourceData
   */
  private async getResourceDataFromTab(tab: WorkspaceTab): Promise<ResourceData | null> {
    const config = tab.configuration;

    // Extract resource type from configuration or route
    let resourceType = config['resourceType'] as string;

    if (!resourceType && config['route']) {
      // Parse route to determine resource type
      resourceType = this.getResourceTypeFromRoute(config['route'] as string);
    }

    if (!resourceType) {
      console.error('[TabContainer.getResourceDataFromTab] No resourceType found in config or route');
      return null;
    }

    // Determine the driver class to use for component instantiation
    let driverClass = resourceType; // Default: use resourceType as driver class

    // For Custom resource type, get DriverClass from configuration or ResourceType metadata
    if (resourceType.toLowerCase() === 'custom') {
      // Custom resource type uses NavItem's DriverClass
      driverClass = config['driverClass'] as string;

      if (!driverClass) {
        LogError('Custom resource type requires driverClass in configuration');
        console.error('[TabContainer.getResourceDataFromTab] Missing driverClass for Custom resource type');
        return null;
      }
    } else {
      // For standard resource types, look up DriverClass from metadata
      const resourceTypeEntity = await this.getResourceTypeEntity(resourceType);

      if (resourceTypeEntity?.DriverClass) {
        driverClass = resourceTypeEntity.DriverClass;
      } 
      // If no DriverClass in metadata, fall back to resourceType (backward compatibility)
    }

    // Include applicationId, driverClass, and tabId in configuration
    const resourceConfig = {
      ...config,
      applicationId: tab.applicationId,
      resourceTypeDriverClass: driverClass,  // Store resolved driver class for component lookup
      tabId: tab.id  // Needed for query param notification scoping in BaseResourceComponent
    };

    // Get ResourceRecordID from config or fall back to tab.resourceRecordId
    // Important: Some tabs store the record ID in config['recordId'], others in tab.resourceRecordId
    const resourceRecordId = (config['recordId'] as string) || tab.resourceRecordId || '';

    const resourceData = new ResourceData({
      ResourceTypeID: await this.getResourceTypeId(resourceType),
      ResourceRecordID: resourceRecordId,
      Configuration: resourceConfig
    });

    return resourceData;
  }

  private static _resourceTypesDataset: DatasetResultType | null = null;

  /**
   * Get ResourceType entity by name (includes DriverClass field)
   */
  private async getResourceTypeEntity(resourceType: string): Promise<MJResourceTypeEntity | null> {
    // Use ResourcePermissionEngine's cached data instead of fetching the dataset again.
    // The engine loads ResourceTypes during startup and keeps them in memory.
    const resourceTypes = ResourcePermissionEngine.Instance.ResourceTypes;
    if (resourceTypes && resourceTypes.length > 0) {
      return TabContainerComponent.findResourceTypeTolerant(resourceTypes, resourceType);
    }

    // Fallback: if engine hasn't loaded yet (shouldn't happen in normal flow),
    // fetch the dataset directly
    const md = this.ProviderToUse;
    const ds = TabContainerComponent._resourceTypesDataset || await md.GetDatasetByName("ResourceTypes");
    if (!ds || !ds.Success || ds.Results.length === 0) {
      return null;
    }

    if (!TabContainerComponent._resourceTypesDataset) {
      TabContainerComponent._resourceTypesDataset = ds; // cache for next time
    }

    const result = ds.Results.find(r => r.Code.trim().toLowerCase() === 'resourcetypes');
    if (result && result.Results?.length > 0) {
      return TabContainerComponent.findResourceTypeTolerant(result.Results as MJResourceTypeEntity[], resourceType);
    }

    return null;
  }

  /**
   * Resolve a resource type BY NAME, tolerant of the 'MJ: ' prefix in EITHER
   * direction — core ResourceType rows predate the prefix convention ('User Views'),
   * while newer callers may pass 'MJ: User Views' (and vice versa). Exact match wins;
   * prefix-normalized is the fallback, so historical and prefixed names both resolve.
   */
  private static findResourceTypeTolerant(rows: MJResourceTypeEntity[], resourceType: string): MJResourceTypeEntity | null {
    const wanted = resourceType.trim().toLowerCase();
    const normalize = (name: string) => name.trim().toLowerCase().replace(/^mj:\s*/, '');
    return rows.find(r => r.Name.trim().toLowerCase() === wanted)
      ?? rows.find(r => normalize(r.Name) === normalize(wanted))
      ?? null;
  }

  private async getResourceTypeId(resourceType: string): Promise<string> {
    const rt = await this.getResourceTypeEntity(resourceType);
    if (rt) {
      return rt.ID;
    }
    throw new Error(`ResourceType ID not found for type: ${resourceType}`);
  }

  /**
   * Determine resource type from route
   */
  private getResourceTypeFromRoute(route: string): string {
    // Parse route segments to determine resource type
    const segments = route.split('/').filter(s => s);

    if (segments.length === 0) {
      return 'home';
    }

    // Common route patterns
    if (route.includes('/record/')) {
      return 'record';
    }
    if (route.includes('/view/')) {
      return 'view';
    }
    if (route.includes('/dashboard/')) {
      return 'dashboard';
    }
    if (route.includes('/report/')) {
      return 'report';
    }
    if (route.includes('/search')) {
      return 'search';
    }
    if (route.includes('/query/')) {
      return 'query';
    }

    // Default based on first segment
    return segments[0] || 'home';
  }

  /**
   * Count the number of component nodes in a layout tree.
   * Used to validate that saved layout matches the tabs array before restoring.
   */
  private countLayoutComponents(node: LayoutNode): number {
    if (!node) {
      return 0;
    }

    // If this is a component node, count it
    if (node.type === 'component') {
      return 1;
    }

    // If this node has children (row, column, stack), recursively count them
    if (node.content && Array.isArray(node.content)) {
      return node.content.reduce((count, child) => count + this.countLayoutComponents(child), 0);
    }

    return 0;
  }

  /**
   * A saved records layout is restorable only when its component tabIds are
   * EXACTLY the current record-tab set. Count equality is not enough: a
   * persistence-suppressed mobile session can open one record and close
   * another, leaving a same-sized layout that references a closed tab —
   * restoring it renders a ghost pane (content load fails) until the next
   * sync sweeps it.
   */
  private layoutCoversExactTabSet(root: LayoutNode, recordTabs: WorkspaceTab[]): boolean {
    const layoutIds = new Set<string>();
    const collect = (node: LayoutNode | undefined): void => {
      if (!node) {
        return;
      }
      if (node.type === 'component') {
        const id = node.componentState?.['tabId'];
        if (typeof id === 'string') {
          layoutIds.add(id);
        }
        return;
      }
      node.content?.forEach(collect);
    };
    collect(root);
    return layoutIds.size === recordTabs.length && recordTabs.every(t => layoutIds.has(t.id));
  }

  /**
   * Cleanup a tab's component
   * Detaches from DOM but keeps in cache for potential reuse
   */
  /**
   * Ensure a record pane's FIRST element is its origin crumb (Matt's
   * pane-level placement — correct in splits, docked panes, and
   * single-resource, unlike the old region-level bar). Recreated on every
   * content attach: the pane container is cleared/re-homed on loads,
   * cache reattaches, and promote/demote moves.
   */
  private ensureRecordOriginCrumb(tab: WorkspaceTab, containerEl: HTMLElement): void {
    this.destroyOriginCrumb(tab.id);
    // The single-resource container is REUSED across tabs — sweep any crumb
    // element a previous tab left behind before (maybe) adding ours.
    containerEl.querySelectorAll('mj-record-origin-crumb').forEach(e => e.remove());
    if (!this.RecordsStyleActive || !IsRecordsTabConfiguration(tab.configuration)) {
      return;
    }
    const origin = GetRecordSourceContext(tab.configuration);
    if (!origin) {
      return; // No captured origin (deep link, history re-open) — no crumb.
    }
    const ref = createComponent(RecordOriginCrumbComponent, {
      environmentInjector: this.environmentInjector
    });
    ref.setInput('Origin', origin);
    this.appRef.attachView(ref.hostView);
    const el = (ref.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes[0];
    containerEl.insertBefore(el, containerEl.firstChild);
    this.originCrumbRefs.set(tab.id, ref);
  }

  /**
   * Refresh a pane crumb's origin after a config change (re-open
   * re-capture). Also handles the CREATE case: a record first opened
   * WITHOUT an origin (deep link, history recreate) whose re-open just
   * captured one — the pane is already attached, so ensureRecordOriginCrumb
   * never runs again; build the crumb into the live pane here.
   */
  private updateOriginCrumb(tab: WorkspaceTab): void {
    const ref = this.originCrumbRefs.get(tab.id);
    const origin = GetRecordSourceContext(tab.configuration);
    if (ref) {
      ref.setInput('Origin', origin);
      return;
    }
    if (origin && this.RecordsStyleActive && IsRecordsTabConfiguration(tab.configuration)) {
      const paneEl = this.recordsLayoutManager.GetContainer(tab.id)?.element
        ?? this.layoutManager.GetContainer(tab.id)?.element;
      if (paneEl && paneEl.childElementCount > 0) {
        this.ensureRecordOriginCrumb(tab, paneEl);
      }
    }
  }

  private destroyOriginCrumb(tabId: string): void {
    const ref = this.originCrumbRefs.get(tabId);
    if (ref) {
      ref.destroy();
      this.originCrumbRefs.delete(tabId);
    }
  }

  private cleanupTabComponent(tabId: string): void {
    // The pane crumb belongs to the pane, not the cached component — always
    // destroyed here; the next attach recreates it in the new pane.
    this.destroyOriginCrumb(tabId);
    // First, try to detach from cache (preserves component for reuse)
    const cachedInfo = this.cacheManager.findAndDetachByTabId(tabId);

    if (cachedInfo) {
      // Remove from legacy componentRefs but keep in cache
      this.componentRefs.delete(tabId);
    } else {
      // Fallback: destroy if not in cache (shouldn't happen in normal flow)
      const componentRef = this.componentRefs.get(tabId);
      if (componentRef) {
        this.appRef.detachView(componentRef.hostView);
        componentRef.destroy();
        this.componentRefs.delete(tabId);
      }
    }
  }

  /**
   * Sync tabs with configuration changes
   */
  private syncTabsWithConfiguration(tabs: WorkspaceTab[]): void {
    // Defense in depth: skip syncing if Golden Layout isn't actually live. This can
    // happen when the visibility-mode transition has flipped `useSingleResourceMode`
    // to false and scheduled `initializeGoldenLayout(true)` via setTimeout(0), but the
    // Configuration subscription fires in the same tick before that init runs. The
    // deferred init will rebuild tabs from config via forceCreateTabs anyway.
    if (!this.layoutInitialized || !this.layoutManager.IsInitialized) {
      return;
    }

    // Get existing tab IDs from Golden Layout
    const existingTabIds = this.layoutManager.GetAllTabIds();

    // Get tab IDs from configuration
    const configTabIds = tabs.map(tab => tab.id);

    // Remove tabs that are no longer in configuration
    existingTabIds.forEach(tabId => {
      if (!configTabIds.includes(tabId)) {
        this.layoutManager.RemoveTab(tabId);
      }
    });

    // Create tabs that don't exist yet
    tabs.forEach(tab => {
      if (!existingTabIds.includes(tab.id)) {
        this.createTab(tab);
      } else {
        // Check if tab content needs to be reloaded (app or resource type changed)
        const existingComponentRef = this.componentRefs.get(tab.id);
        if (existingComponentRef) {
          const existingResourceData = existingComponentRef.instance.Data;

          // For Custom resource types, also check driverClass to distinguish between different custom resources
          const existingDriverClass = existingResourceData?.Configuration?.driverClass || existingResourceData?.Configuration?.resourceTypeDriverClass;
          const newDriverClass = tab.configuration['driverClass'] || tab.configuration['resourceTypeDriverClass'];

          // Normalize record IDs for comparison (treat null/undefined as empty string)
          // IMPORTANT: Check both tab.resourceRecordId AND tab.configuration['recordId']
          // because for nav items, the recordId is stored in configuration, not resourceRecordId
          const existingRecordId = existingResourceData?.ResourceRecordID || '';
          const newRecordId = tab.resourceRecordId || tab.configuration['recordId'] as string || '';

          const needsReload = existingResourceData?.ResourceType !== tab.configuration['resourceType'] ||
                             existingResourceData?.Configuration?.applicationId !== tab.applicationId ||
                             existingRecordId !== newRecordId ||
                             (tab.configuration['resourceType'] === 'Custom' && existingDriverClass !== newDriverClass);

          if (needsReload) {
            // Clean up old component
            this.cleanupTabComponent(tab.id);

            // Mark tab as not loaded so it will reload when shown
            this.layoutManager.MarkTabNotLoaded(tab.id);

            // Update display name in background
            this.updateTabDisplayName(tab);

            // If this tab is currently active, reload it immediately
            const config = this.workspaceManager.GetConfiguration();
            if (config?.activeTabId === tab.id) {
              const glContainer = this.layoutManager.GetContainer(tab.id);
              if (glContainer) {
                this.loadTabContent(tab.id, glContainer);
              }
            }
          }
        }

        // Update styling for existing tabs. typeIcon ownership is split:
        // record tabs resolve synchronously here; NAV tab icons are owned
        // by upgradeNavTabIcon (async ladder) — setting the sync fallback
        // here too would downgrade an upgraded icon every emission and
        // flicker. Restored nav tabs never pass through createTab, so the
        // upgrade call here is also their FIRST icon application.
        const app = this.appManager.GetAppById(tab.applicationId);
        const styleUpdate: Partial<TabComponentState> = {
          isPinned: tab.isPinned,
          title: tab.title,
          appColor: app?.GetColor() || DEFAULT_APP_COLOR
        };
        if (IsRecordsTabConfiguration(tab.configuration)) {
          styleUpdate.typeIcon = this.resolveTabTypeIcon(tab);
        }
        this.layoutManager.UpdateTabStyle(tab.id, styleUpdate);
        void this.upgradeNavTabIcon(tab, this.layoutManager);
        this.updateOriginCrumb(tab);
      }
    });

    // Focus the active tab
    const config = this.workspaceManager.GetConfiguration();
    if (config?.activeTabId) {
      this.layoutManager.FocusTab(config.activeTabId);
    }
  }


  /**
   * Show context menu
   */
  showContextMenu(x: number, y: number, tabId: string, anchorEl?: HTMLElement): void {
    this.contextMenuX = x;
    this.contextMenuY = y;
    this.contextMenuTabId = tabId;
    this.contextMenuVisible = true;
    // Remember the invoking control so closing can hand focus back (the
    // slot button passes itself; right-click falls back to whatever was
    // focused). aria-expanded reflects the open menu on the anchor.
    this.contextMenuAnchor = anchorEl ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (this.contextMenuAnchor?.classList.contains('mj-tab-type-slot')) {
      this.contextMenuAnchor.setAttribute('aria-expanded', 'true');
    }
    // GL tab events (right-click, type-slot click) originate OUTSIDE any
    // Angular CD trigger — zoneless: without an explicit flush the flag
    // flips but the menu never renders.
    SafeDetectChanges(this.cdr);
    // Menu-pattern focus: land on the first enabled item so arrow keys work
    // immediately (rAF — the flush above just created the DOM).
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLButtonElement>('.context-menu [role="menuitem"]:not([disabled])');
      first?.focus();
    });

    // Close menu when clicking outside - use setTimeout to avoid immediate trigger.
    // CAPTURE phase: bubble-phase closers are blind to clicks whose
    // propagation something stopped (the origin crumb stops its clicks so
    // GL pane-focus can't stomp navigation) — the menu stayed open when the
    // outside click landed on such an element.
    setTimeout(() => {
      const clickHandler = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.context-menu')) {
          this.hideContextMenu();
          document.removeEventListener('click', clickHandler, true);
          document.removeEventListener('keydown', keyHandler, true);
        }
      };

      const keyHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          this.hideContextMenu();
          document.removeEventListener('click', clickHandler, true);
          document.removeEventListener('keydown', keyHandler, true);
        }
      };

      document.addEventListener('click', clickHandler, true);
      document.addEventListener('keydown', keyHandler, true);
    }, 0);
  }

  /**
   * Hide context menu
   */
  hideContextMenu(restoreFocus = true): void {
    this.contextMenuVisible = false;
    this.contextMenuTabId = null;
    const anchor = this.contextMenuAnchor;
    this.contextMenuAnchor = null;
    if (anchor?.classList.contains('mj-tab-type-slot')) {
      anchor.setAttribute('aria-expanded', 'false');
    }
    // Outside-click/Escape teardown also runs outside CD — flush so the
    // menu actually disappears (see showContextMenu).
    SafeDetectChanges(this.cdr);
    // Menu-pattern focus return (app-switcher precedent). Actions that
    // deliberately move the user to another surface pass restoreFocus=false
    // and let the destination own focus.
    if (restoreFocus && anchor?.isConnected) {
      requestAnimationFrame(() => anchor.focus());
    }
  }

  /**
   * role="menu" keyboard model: ArrowUp/Down rove (wrapping) over enabled
   * items, Home/End jump, Escape closes with focus return, Tab dismisses
   * (native menus don't trap Tab).
   */
  onMenuKeydown(event: KeyboardEvent): void {
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('.context-menu [role="menuitem"]:not([disabled])'));
    if (items.length === 0) {
      return;
    }
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(idx + 1) % items.length].focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(idx - 1 + items.length) % items.length].focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0].focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1].focus();
        break;
      case 'Escape':
        // Handle here (with stopPropagation) so Escape works even before the
        // deferred document-level teardown listener attaches.
        event.preventDefault();
        event.stopPropagation();
        this.hideContextMenu();
        break;
      case 'Tab':
        this.hideContextMenu(false);
        break;
    }
  }

  /**
   * Check if context menu tab is pinned
   */
  get isContextTabPinned(): boolean {
    if (!this.contextMenuTabId) return false;
    const tab = this.workspaceManager.GetTab(this.contextMenuTabId);
    return tab?.isPinned || false;
  }

  /** Context tab is a records-REGION record — eligible for "Move to Workspace" */
  get canContextMoveToWorkspace(): boolean {
    // Docked/region composition is a DESKTOP concept — no move actions on mobile
    if (!this.contextMenuTabId || !this.RecordsStyleActive || this.mobileRecordsActive) return false;
    const tab = this.workspaceManager.GetTab(this.contextMenuTabId);
    return !!tab && IsRecordsRegionTab(tab.configuration);
  }

  /** Context tab is a DOCKED record — eligible for "Move to Records" */
  get canContextMoveToRecords(): boolean {
    if (!this.contextMenuTabId || !this.RecordsStyleActive || this.mobileRecordsActive) return false;
    const tab = this.workspaceManager.GetTab(this.contextMenuTabId);
    return !!tab && IsRecordsTabConfiguration(tab.configuration) && IsRecordDockedToWorkspace(tab.configuration);
  }

  /**
   * Promote: records region → main workspace layout ("Move to Workspace").
   * ORDER MATTERS: activate FIRST, then flip the flag. With the tab already
   * active, (a) the moved tab stays the user's focus through the membership
   * flip (syncTabsWithConfiguration's tail focuses config.activeTabId), and
   * (b) a single-resource→multi-tab transition triggered by the flip exempts
   * it from the force-pin sweep (it IS the activeTabId).
   */
  onContextMoveToWorkspace(): void {
    const tabId = this.contextMenuTabId;
    this.hideContextMenu(false);
    if (!tabId) return;
    this.workspaceManager.SetActiveTab(tabId);
    this.workspaceManager.UpdateTabConfiguration(tabId, { [RECORD_DOCKED_TO_WORKSPACE_KEY]: true });
    this.assertMovedTabActivation(tabId);
  }

  /**
   * Demote: main workspace layout → records region ("Move to Records").
   * Same activate-first ordering: the flip's emission then computes
   * showing=true in syncRecordsRegion, so the region surfaces focused on
   * the returned tab. `false` (not undefined) so the choice is explicit in
   * the persisted configuration.
   */
  onContextMoveToRecords(): void {
    const tabId = this.contextMenuTabId;
    this.hideContextMenu(false);
    if (!tabId) return;
    this.workspaceManager.SetActiveTab(tabId);
    this.workspaceManager.UpdateTabConfiguration(tabId, { [RECORD_DOCKED_TO_WORKSPACE_KEY]: false });
    this.assertMovedTabActivation(tabId);
  }

  /**
   * A move's SOURCE layout auto-activates its next tab when the moved tab is
   * removed, and that GL activation WRITES BACK into the workspace — stomping
   * the moved tab's activation (demote left the user staring at the main
   * layout while the record surfaced in the records region). Re-assert after
   * the removal cascade settles — the assertRecordActivation pattern.
   */
  private assertMovedTabActivation(tabId: string): void {
    setTimeout(() => {
      const config = this.workspaceManager.GetConfiguration();
      if (config?.tabs.some(t => t.id === tabId) && config.activeTabId !== tabId) {
        this.workspaceManager.SetActiveTab(tabId);
      }
    }, 0);
  }

  /**
   * Toggle pin from context menu
   */
  onContextPin(): void {
    if (this.contextMenuTabId) {
      this.workspaceManager.TogglePin(this.contextMenuTabId);
    }
    this.hideContextMenu();
  }

  /**
   * Close tab from context menu
   */
  onContextClose(): void {
    if (this.contextMenuTabId) {
      const tab = this.workspaceManager.GetTab(this.contextMenuTabId);
      const manager = tab && this.isRecordTab(tab) ? this.recordsLayoutManager : this.layoutManager;
      manager.RemoveTab(this.contextMenuTabId);
    }
    // The anchor lives on the closed tab — nothing to return focus to.
    this.hideContextMenu(false);
  }

  /**
   * Close all other tabs from context menu
   */
  onContextCloseOthers(): void {
    if (this.contextMenuTabId) {
      this.workspaceManager.CloseOtherTabs(this.contextMenuTabId);
    }
    this.hideContextMenu();
  }

  /**
   * Close tabs to the right from context menu
   */
  onContextCloseToRight(): void {
    if (this.contextMenuTabId) {
      this.workspaceManager.CloseTabsToRight(this.contextMenuTabId);
    }
    this.hideContextMenu();
  }

  /**
   * Check if context menu tab is pinned to Home dashboard
   */
  get isContextTabPinnedToHome(): boolean {
    if (!this.contextMenuTabId) return false;
    const tab = this.workspaceManager.GetTab(this.contextMenuTabId);
    if (!tab) return false;
    const resourceType = this.resolveResourceType(tab);
    return this.pinService.IsPinned(resourceType, tab.configuration as Record<string, unknown>);
  }

  /**
   * Pin current context menu tab to Home dashboard
   */
  async onContextPinToHome(): Promise<void> {
    if (this.isContextTabPinnedToHome) {
      this.hideContextMenu();
      return;
    }
    if (!this.contextMenuTabId) {
      this.hideContextMenu();
      return;
    }

    const tab = this.workspaceManager.GetTab(this.contextMenuTabId);
    if (!tab) {
      this.hideContextMenu();
      return;
    }

    const resourceType = this.resolveResourceType(tab);
    const activeApp = this.appManager.GetActiveApp();

    // Resolve nav item icon for Custom pins
    let pinIcon: string | undefined;
    if (resourceType === 'Custom' && activeApp) {
      const navItemName = tab.configuration?.['navItemName'] as string;
      if (navItemName) {
        const navItems = await activeApp.GetNavItems();
        const navItem = navItems.find(ni => ni.Label === navItemName);
        pinIcon = navItem?.Icon || undefined;
      }
    }

    const added = this.pinService.AddPin({
      DisplayName: tab.title || 'Untitled',
      ResourceType: resourceType,
      ApplicationID: tab.applicationId || activeApp?.ID,
      ApplicationName: activeApp?.Name,
      Icon: pinIcon,
      Color: activeApp?.GetColor() || undefined,
      Configuration: tab.configuration as Record<string, unknown>,
    });

    if (added) {
      MJNotificationService.Instance.CreateSimpleNotification(
        `Pinned "${tab.title}" to Home`, 'success', 2000
      );
      this.captureContextTabThumbnail(tab);
    } else {
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${tab.title}" is already pinned to Home`, 'info', 3000
      );
    }

    this.hideContextMenu();
  }

  /**
   * Resolve a WorkspaceTab's resource type string for pin matching
   */
  private resolveResourceType(tab: WorkspaceTab): string {
    const config = tab.configuration;
    const rt = (config.resourceType as string) || '';
    if (rt === 'Dashboards' || config['dashboardId']) return 'Dashboards';
    if (rt === 'User Views' || rt === 'MJ: User Views' || config['viewId']) return 'User Views';
    if (rt === 'Queries' || config['queryId']) return 'Queries';
    if (rt === 'Reports' || config['reportId']) return 'Reports';
    if (rt === 'Records' || (config['entity'] && config['recordId'])) return 'Records';
    if (rt === 'Custom' || config['navItemName']) return 'Custom';
    return rt || 'Custom';
  }

  /**
   * Capture thumbnail for a just-pinned tab (async, non-blocking)
   */
  private async captureContextTabThumbnail(tab: WorkspaceTab): Promise<void> {
    try {
      // Find the active content element — differs by mode
      let contentEl: HTMLElement | null = null;
      if (this.useSingleResourceMode) {
        contentEl = this.directContentContainer?.nativeElement ?? null;
      } else {
        // In Golden Layout mode, find the active tab's content pane
        contentEl = this.glContainer?.nativeElement?.querySelector(
          '.lm_item_container .lm_content'
        ) as HTMLElement | null;
      }
      if (!contentEl) return;

      const thumbnail = await this.pinService.CaptureThumbnail(contentEl);
      if (thumbnail) {
        const resourceType = this.resolveResourceType(tab);
        const pin = this.pinService.FindPin(resourceType, tab.configuration as Record<string, unknown>);
        if (pin) {
          this.pinService.UpdatePin(pin.Id, { Thumbnail: thumbnail });
        }
      }
    } catch {
      // Thumbnail capture is best-effort
    }
  }

  /**
   * Public method for external callers (e.g. shell) to capture a thumbnail
   * of the currently visible content, regardless of mode.
   */
  public async CaptureActiveThumbnail(): Promise<string | undefined> {
    try {
      let contentEl: HTMLElement | null = null;
      if (this.useSingleResourceMode) {
        contentEl = this.directContentContainer?.nativeElement ?? null;
      } else {
        contentEl = this.glContainer?.nativeElement?.querySelector(
          '.lm_item_container .lm_content'
        ) as HTMLElement | null;
      }
      if (!contentEl) return undefined;
      return await this.pinService.CaptureThumbnail(contentEl);
    } catch {
      return undefined;
    }
  }

  /**
   * While the naming implies this is only invoked once, components we DO NOT CONTROL might have race
   * conditions that result in unpredictable behavior. To avoid those causing loading screen overaly to show
   * forever we emit all events upstream
   */
  private emitFirstLoadCompleteOnce(): void {
    this.firstResourceLoadComplete.emit(); // do this each time to be sure we don't suppress messages
  }

  /**
   * Render an inline "missing resource component" error into a host element when
   * ClassFactory has no registration for the requested driver class. Used when a
   * dashboard / nav item references a component class that isn't built into this
   * Angular bundle (e.g. an app-specific dashboard defined outside the running app).
   *
   * Logs a structured console.error with context for developers, and ensures the
   * shell's first-resource-load gate is satisfied so the loading overlay clears.
   */
  private renderMissingResourceError(host: HTMLElement, driverClass: string, context: Record<string, unknown>): void {
    console.error(
      `[TabContainer] No resource component registered for driver class "${driverClass}".\n` +
        `MemberJunction's ClassFactory has no @RegisterClass(BaseResourceComponent, '${driverClass}') in this build. ` +
        `Either the package providing this resource is not included in the running Explorer bundle, ` +
        `the registration manifest is stale (run \`npm run mj:manifest\`), or the driver class name in metadata is wrong.\n` +
        `Context: ${JSON.stringify(context, null, 2)}`
    );

    // Clear the host before injecting the error UI.
    host.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'tab-content-wrapper missing-resource-error';
    wrapper.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 32px; box-sizing: border-box;';
    wrapper.setAttribute('role', 'alert');

    const card = document.createElement('div');
    card.style.cssText = [
      'max-width: 720px',
      'width: 100%',
      'padding: 32px',
      'background: var(--mj-bg-surface)',
      'border: 1px solid var(--mj-status-warning-border)',
      'border-radius: 8px',
      'text-align: center',
      'color: var(--mj-text-primary)',
      'font-family: inherit',
    ].join(';');

    const icon = document.createElement('div');
    icon.innerHTML = '<i class="fa-solid fa-puzzle-piece"></i>';
    icon.style.cssText = 'font-size: 32px; color: var(--mj-status-warning); margin-bottom: 12px;';

    const title = document.createElement('h2');
    title.textContent = 'This view isn’t available in the running build.';
    title.style.cssText = 'font-size: 18px; font-weight: 600; margin: 0 0 12px 0; color: var(--mj-status-warning-text);';

    const detail = document.createElement('p');
    detail.textContent = `No component is registered for driver class "${driverClass}". The Angular package that provides this view likely isn't bundled into this Explorer build.`;
    detail.style.cssText = 'font-size: 14px; line-height: 1.5; color: var(--mj-text-secondary); margin: 0 0 12px 0;';

    const hint = document.createElement('p');
    hint.textContent = 'See browser console for technical details (driver class, application, nav item).';
    hint.style.cssText = 'font-size: 12px; color: var(--mj-text-muted); margin: 0; font-style: italic;';

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(detail);
    card.appendChild(hint);
    wrapper.appendChild(card);
    host.appendChild(wrapper);

    // Unblock the shell's first-load gate so the loading overlay clears.
    this.emitFirstLoadCompleteOnce();
  }
}
