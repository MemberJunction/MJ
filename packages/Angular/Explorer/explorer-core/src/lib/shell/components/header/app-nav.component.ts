import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseApplication, DynamicNavItem, NavItem, WorkspaceStateManager, WorkspaceConfiguration } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { Subject, takeUntil } from 'rxjs';

/**
 * Event emitted when a nav item is clicked
 */
export interface NavItemClickEvent {
  item: NavItem;
  shiftKey: boolean;
  dblClick: boolean;
}

/**
 * Horizontal navigation items for the current app.
 * Uses OnPush change detection and reactive state management for optimal performance.
 */
@Component({
  standalone: false,
  selector: 'mj-app-nav',
  templateUrl: './app-nav.component.html',
  styleUrls: ['./app-nav.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppNavComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private _app: BaseApplication | null = null;
  private _cachedNavItems: NavItem[] = [];
  private _cachedAppColor: string = '#1976d2';
  private _servicesInjected = false;

  /**
   * Monotonically increasing counter used to detect and discard stale async results.
   *
   * Because GetNavItems() is async (HomeApplication does a DB lookup for record names),
   * and RxJS subscribe() does NOT serialize async callbacks, multiple calls to
   * updateCachedData() can overlap. Without this guard, a slow call (e.g., Home app
   * doing a DB lookup) that started BEFORE a fast call (e.g., switching to App B)
   * could resolve AFTER the fast call and overwrite the correct nav items with stale ones.
   *
   * How it works:
   *   1. Each updateCachedData() call increments this counter and captures it as `gen`
   *   2. After the await, it checks: does `gen` still match `_updateGeneration`?
   *   3. If not, a newer call started while we were waiting — discard our stale results
   */
  private _updateGeneration = 0;

  // Map of nav item key (Route or Label) to active state
  private activeStateMap = new Map<string, boolean>();

  @Output() navItemClick = new EventEmitter<NavItemClickEvent>();
  @Output() navItemDismiss = new EventEmitter<NavItem>();

  constructor(
    private workspaceManager: WorkspaceStateManager,
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {}

  /**
   * Input setter for app - triggers cache update when app changes
   */
  @Input()
  set app(value: BaseApplication | null) {
    if (this._app !== value) {
      this._app = value;
      this._cachedNavItems = []; // Clear stale items immediately so previous app's items don't flash
      this.activeStateMap.clear();
      this._servicesInjected = false; // Reset injection flag
      this.updateCachedData();
      this.cdr.markForCheck();
    }
  }

  get app(): BaseApplication | null {
    return this._app;
  }

  ngOnInit(): void {
    // Subscribe to workspace configuration changes.
    // Must rebuild nav items (not just active states) because dynamic nav items
    // are generated based on the currently active tab - when a user navigates
    // from one record to another (e.g., via OpenEntityRecord), the active tab
    // changes and the dynamic nav item needs to reflect the new record.
    this.workspaceManager.Configuration
      .pipe(takeUntil(this.destroy$))
      .subscribe(async () => {
        await this.updateCachedData();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Update cached nav items and app color when app changes
   */
  private async updateCachedData(): Promise<void> {
    // Capture the current generation before any async work.
    // See _updateGeneration JSDoc for full explanation of the race condition this prevents.
    const gen = ++this._updateGeneration;

    if (this._app) {
      // Inject services once for apps that need them (e.g., HomeApplication for dynamic nav items)
      if (!this._servicesInjected) {
        const appWithServices = this._app as BaseApplication & {
          SetWorkspaceManager?: (manager: WorkspaceStateManager) => void;
          SetSharedService?: (service: SharedService) => void;
        };

        if (typeof appWithServices.SetWorkspaceManager === 'function') {
          appWithServices.SetWorkspaceManager(this.workspaceManager);
        }
        if (typeof appWithServices.SetSharedService === 'function') {
          appWithServices.SetSharedService(this.sharedService);
        }
        this._servicesInjected = true;
      }

      const items = await this._app.GetNavItems() || [];

      // If a newer call started while we were awaiting, our results are stale — bail out
      // so we don't overwrite the newer call's (correct) results.
      if (gen !== this._updateGeneration) {
        return;
      }

      // Only show items with Status 'Active' or undefined (default to Active)
      this._cachedNavItems = items.filter(item => !item.Status || item.Status === 'Active');

      this._cachedAppColor = this._app.GetColor() || '#1976d2';
    } else {
      this._cachedNavItems = [];
      this._cachedAppColor = '#1976d2';
    }

    // Update active states after nav items change
    const config = this.workspaceManager.GetConfiguration();
    this.updateActiveStates(config);
    this.cdr.markForCheck();
  }

  /**
   * Update active state map based on current workspace configuration
   */
  private updateActiveStates(config: WorkspaceConfiguration | null): void {
    this.activeStateMap.clear();

    if (!config || !this._app) {
      return;
    }

    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (!activeTab || activeTab.applicationId !== this._app.ID) {
      return;
    }

    // Compute active state for each nav item once
    for (const item of this._cachedNavItems) {
      const key = this.getItemKey(item);
      const isActive = this.computeIsActive(item, activeTab);
      this.activeStateMap.set(key, isActive);
    }
  }

  /**
   * Get unique key for nav item (used for tracking and active state).
   * Prefers RecordID for dynamic items to avoid label collisions.
   */
  private getItemKey(item: NavItem): string {
    return item.RecordID || item.Route || item.Label || '';
  }

  /**
   * Check if a nav item is dynamic (generated from recent orphan resources)
   */
  isDynamic(item: NavItem): boolean {
    return (item as DynamicNavItem).isDynamic === true;
  }

  /**
   * Compute if nav item is active based on active tab
   */
  private computeIsActive(item: NavItem, activeTab: any): boolean {
    // Check if nav item has a custom matching function (for dynamic items)
    const dynamicItem = item as NavItem & { isActiveMatch?: (tab: unknown) => boolean };
    if (dynamicItem.isActiveMatch && typeof dynamicItem.isActiveMatch === 'function') {
      return dynamicItem.isActiveMatch(activeTab);
    }

    // Standard matching: route or label
    return (item.Route && activeTab.configuration['route'] === item.Route) ||
           activeTab.title === item.Label;
  }

  /**
   * Get cached navigation items (no computation in getter)
   */
  get navItems(): NavItem[] {
    return this._cachedNavItems;
  }

  /**
   * Get cached app color (no computation in getter)
   */
  get appColor(): string {
    return this._cachedAppColor;
  }

  /**
   * Check if nav item is active (uses cached state from Map)
   */
  isActive(item: NavItem): boolean {
    const key = this.getItemKey(item);
    return this.activeStateMap.get(key) || false;
  }

  /**
   * Track function for @for to optimize rendering
   */
  trackByNavItem(_index: number, item: NavItem): string {
    return this.getItemKey(item);
  }

  /**
   * Handle nav item click
   */
  onNavClick(item: NavItem, event?: MouseEvent): void {
    this.navItemClick.emit({
      item,
      shiftKey: event?.shiftKey || false,
      dblClick: false
    });
  }

  /**
   * Handle dismiss click on a dynamic nav item.
   * Removes from the app's recent stack and refreshes nav items immediately.
   * Stops propagation so the nav click handler doesn't fire.
   */
  onDismiss(item: NavItem, event: MouseEvent): void {
    event.stopPropagation();

    // Remove from the app's recent stack directly so we can refresh immediately
    if (this._app) {
      const appWithRemove = this._app as BaseApplication & {
        RemoveDynamicNavItem?: (navItem: NavItem) => void;
      };
      if (typeof appWithRemove.RemoveDynamicNavItem === 'function') {
        appWithRemove.RemoveDynamicNavItem(item);
        this.updateCachedData();
      }
    }

    this.navItemDismiss.emit(item);
  }

  /**
   * Handle nav item double-click (opens in new tab)
   */
  onNavDblClick(item: NavItem, event?: MouseEvent): void {
    event?.preventDefault();
    this.navItemClick.emit({
      item,
      shiftKey: event?.shiftKey || false,
      dblClick: true
    });
  }
}
