import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { BaseApplication, DynamicNavItem, NavItem, WorkspaceStateManager, WorkspaceConfiguration } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { Subject, takeUntil } from 'rxjs';

/**
 * Event emitted when a nav item is clicked
 */
export interface NavItemClickEvent {
  item: NavItem;
  shiftKey: boolean;
}

/**
 * Horizontal navigation items for the current app.
 * Uses OnPush change detection and reactive state management for optimal performance.
 *
 * Overflow behavior (priority+ pattern): when the header can't fit every nav item,
 * trailing items collapse into a "More" dropdown instead of squeezing the header's
 * action cluster off-screen. Item widths are measured once per nav-items change
 * (all items render for one frame, widths are cached), then every resize recomputes
 * the fit from the cache — no re-measure, no layout thrash.
 */
@Component({
  standalone: false,
  selector: 'mj-app-nav',
  templateUrl: './app-nav.component.html',
  styleUrls: ['./app-nav.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppNavComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private _app: BaseApplication | null = null;
  private _cachedNavItems: NavItem[] = [];
  private _cachedAppColor: string = 'var(--mj-brand-primary)';
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

  // ---- Overflow (priority+) state ----
  /** Cached natural pixel width of each nav item, parallel to navItems order */
  private itemWidths: number[] = [];
  /** Measured width of the More button (fallback used until first render) */
  private moreBtnWidth = 120;
  /** Left offset (px, relative to host) where the More dropdown anchors */
  public MoreDropdownLeft = 0;
  /** True when even one item + More can't fit — the lone visible pill
   *  shrinks with an ellipsis instead of clipping the More button. */
  public Tight = false;
  /** Flex gap between nav items — must match --mj-space-1 in the CSS */
  private static readonly ITEM_GAP = 4;
  /** How many leading nav items are currently visible inline */
  public VisibleCount = Number.MAX_SAFE_INTEGER;
  /** Whether the More dropdown is open */
  public MoreOpen = false;
  /** True while nav items are being (re)loaded for skeleton display */
  public Loading = false;

  private resizeObserver: ResizeObserver | null = null;
  private _overflowEnabled = true;

  @ViewChild('navList') private navListRef?: ElementRef<HTMLElement>;
  @ViewChild('moreBtn') private moreBtnRef?: ElementRef<HTMLElement>;

  @Output() navItemClick = new EventEmitter<NavItemClickEvent>();
  @Output() navItemDismiss = new EventEmitter<NavItem>();

  /**
   * Disable the priority+ overflow behavior. Used by the mobile drawer instance,
   * where items stack vertically and can never overflow horizontally.
   */
  @Input()
  set overflowEnabled(value: boolean) {
    this._overflowEnabled = value;
    if (!value) {
      this.VisibleCount = Number.MAX_SAFE_INTEGER;
    }
  }
  get overflowEnabled(): boolean {
    return this._overflowEnabled;
  }

  constructor(
    private workspaceManager: WorkspaceStateManager,
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>
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
      this.Loading = value != null; // Skeleton until GetNavItems resolves
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

  ngAfterViewInit(): void {
    if (this._overflowEnabled && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.recomputeFit());
      this.resizeObserver.observe(this.host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
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

      this._cachedAppColor = this._app.GetColor() || 'var(--mj-brand-primary)';
    } else {
      this._cachedNavItems = [];
      this._cachedAppColor = 'var(--mj-brand-primary)';
    }

    this.Loading = false;

    // Update active states after nav items change
    const config = this.workspaceManager.GetConfiguration();
    this.updateActiveStates(config);

    // New item set: show everything for one frame so natural widths can be
    // measured (the row clips, so the temporary full row is invisible),
    // then collapse to fit. Tight mode MUST be off during measurement — its
    // flex-shrink would record squeezed widths and poison the fit arithmetic.
    this.VisibleCount = Number.MAX_SAFE_INTEGER;
    this.MoreOpen = false;
    this.Tight = false;
    this.cdr.markForCheck();

    // In Angular 21 zoneless mode, markForCheck() alone is unreliable when the trigger
    // is an RxJS subscription (workspaceManager.Configuration here) not tracked by the
    // zoneless scheduler — the dirty flag is set but no follow-up tick is scheduled.
    // detectChanges() runs CD synchronously on this view, rendering the new data
    // immediately. Wrapped because detectChanges throws if invoked re-entrantly during
    // another in-flight CD pass — harmless if so.
    try {
      this.cdr.detectChanges();
    } catch {
      // Re-entrant CD — harmless, the in-flight pass picks up our markForCheck.
    }

    if (this._overflowEnabled) {
      requestAnimationFrame(() => {
        this.measureItemWidths();
        this.recomputeFit();
      });
    }
  }

  /**
   * Cache the natural width of every nav item. Called in the frame after a new
   * item set renders (all items visible, flex-shrink: 0, so widths are natural
   * even if the row is clipped by overflow: hidden).
   */
  private measureItemWidths(): void {
    const list = this.navListRef?.nativeElement;
    if (!list) {
      return;
    }
    const els = Array.from(list.querySelectorAll<HTMLElement>('.nav-item:not(.nav-more-btn)'));
    if (els.length !== this._cachedNavItems.length) {
      return; // View out of sync (mid-CD) — the next update cycle re-measures
    }
    this.itemWidths = els.map(el => el.offsetWidth);
  }

  /**
   * Decide how many items fit in the host's current width; the rest collapse
   * into the More dropdown. Pure arithmetic over cached widths — safe to call
   * on every resize.
   */
  private recomputeFit(): void {
    if (!this._overflowEnabled || this._cachedNavItems.length === 0) {
      return;
    }
    const hostWidth = this.host.nativeElement.clientWidth;
    if (hostWidth === 0) {
      return; // Hidden (mobile breakpoint) — leave state alone
    }
    // Self-heal: if the width cache is stale or missing (the measurement
    // frame can race the first render after a reload/app switch), expand to
    // the full item set, re-measure, and retry next frame until it converges.
    if (this.itemWidths.length !== this._cachedNavItems.length) {
      if (this.VisibleCount < this._cachedNavItems.length || this.Tight) {
        this.VisibleCount = Number.MAX_SAFE_INTEGER;
        this.Tight = false; // Never measure with tight-mode shrink applied
        this.cdr.markForCheck();
        try {
          this.cdr.detectChanges();
        } catch {
          // Re-entrant CD — harmless.
        }
      }
      this.measureItemWidths();
      if (this.itemWidths.length !== this._cachedNavItems.length) {
        requestAnimationFrame(() => this.recomputeFit());
        return;
      }
    }
    if (this.moreBtnRef?.nativeElement) {
      this.moreBtnWidth = this.moreBtnRef.nativeElement.offsetWidth || this.moreBtnWidth;
    }

    const gap = AppNavComponent.ITEM_GAP;
    const n = this.itemWidths.length;
    const totalAll = this.itemWidths.reduce((a, b) => a + b, 0) + gap * (n - 1);

    let newCount: number;
    let tight = false;
    if (totalAll <= hostWidth) {
      newCount = Number.MAX_SAFE_INTEGER; // Everything fits
    } else {
      // Reserve room for the More button, then fit as many leading items as possible
      let used = this.moreBtnWidth;
      let fit = 0;
      for (let i = 0; i < n; i++) {
        const next = used + gap + this.itemWidths[i];
        if (next > hostWidth) {
          break;
        }
        used = next;
        fit++;
      }
      newCount = Math.max(1, fit); // Never collapse below one visible item
      tight = fit === 0; // Even one item + More overflows — shrink the lone pill
    }

    if (newCount !== this.VisibleCount || tight !== this.Tight) {
      this.VisibleCount = newCount;
      this.Tight = tight;
      if (this.OverflowItems.length === 0) {
        this.MoreOpen = false;
      }
      this.cdr.markForCheck();
      try {
        this.cdr.detectChanges();
      } catch {
        // Re-entrant CD — harmless.
      }
    }
  }

  /** Items rendered inline in the header row */
  get InlineItems(): NavItem[] {
    return this._cachedNavItems.slice(0, this.VisibleCount);
  }

  /** Items collapsed into the More dropdown */
  get OverflowItems(): NavItem[] {
    return this.VisibleCount >= this._cachedNavItems.length
      ? []
      : this._cachedNavItems.slice(this.VisibleCount);
  }

  /** True when any overflowed item is the active one (More button shows active tint) */
  get OverflowHasActive(): boolean {
    return this.OverflowItems.some(item => this.isActive(item));
  }

  ToggleMore(event: MouseEvent): void {
    event.stopPropagation();
    this.MoreOpen = !this.MoreOpen;
    if (this.MoreOpen) {
      // Anchor the dropdown under the More button; once the dropdown has
      // rendered, clamp it so its right edge stays inside the host.
      this.MoreDropdownLeft = this.moreBtnRef?.nativeElement?.offsetLeft ?? 0;
      requestAnimationFrame(() => {
        const dropdown = this.host.nativeElement.querySelector<HTMLElement>('.nav-more-dropdown');
        if (dropdown) {
          const maxLeft = this.host.nativeElement.clientWidth - dropdown.offsetWidth;
          this.MoreDropdownLeft = Math.max(0, Math.min(this.MoreDropdownLeft, maxLeft));
          this.cdr.markForCheck();
          try {
            this.cdr.detectChanges();
          } catch {
            // Re-entrant CD — harmless.
          }
        }
      });
    }
    this.cdr.markForCheck();
  }

  /** Close the More dropdown on any outside click or Escape */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.MoreOpen && !this.host.nativeElement.contains(event.target as Node)) {
      this.MoreOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.MoreOpen) {
      this.MoreOpen = false;
      this.cdr.markForCheck();
    }
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

    const config = activeTab.configuration || {};

    // Match by DriverClass (most reliable for Custom resource types — always set correctly)
    if (item.DriverClass && (config['driverClass'] === item.DriverClass || config['resourceTypeDriverClass'] === item.DriverClass)) {
      return true;
    }

    // Match by navItemName from config (reliable — set when nav item opens)
    if (config['navItemName'] && config['navItemName'] === item.Label) {
      return true;
    }

    // Match by route (for route-based nav items)
    if (item.Route && config['route'] === item.Route) {
      return true;
    }

    // NOTE: We intentionally do NOT match by activeTab.title here.
    // Tab titles can be stale (updated asynchronously by DisplayNameChangedEvent
    // from cached components) and cause double-matches where two nav items
    // both appear active. DriverClass and navItemName are sufficient.
    return false;
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
    this.MoreOpen = false;
    this.navItemClick.emit({
      item,
      shiftKey: event?.shiftKey || false
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

}
