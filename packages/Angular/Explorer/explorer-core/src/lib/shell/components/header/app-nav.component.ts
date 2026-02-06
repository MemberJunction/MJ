import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { BaseApplication, NavItem, WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';

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
 */
@Component({
  standalone: false,
  selector: 'mj-app-nav',
  templateUrl: './app-nav.component.html',
  styleUrls: ['./app-nav.component.css']
})
export class AppNavComponent implements OnInit, OnChanges {
  @Input() app: BaseApplication | null = null;
  @Output() navItemClick = new EventEmitter<NavItemClickEvent>();

  constructor(
    private workspaceManager: WorkspaceStateManager,
    private sharedService: SharedService
  ) {}

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['app']) {
    }
  }

  /**
   * Get navigation items for current app.
   * Filters out items that are not Active (Pending or Disabled).
   * For HomeApplication, also injects required services for dynamic nav items.
   */
  get navItems(): NavItem[] {
    if (this.app) {
      // Inject services for apps that need them (e.g., HomeApplication for dynamic nav items)
      // These setters are optional - only defined on apps that need dynamic behavior
      const appWithServices = this.app as BaseApplication & {
        SetWorkspaceManager?: (manager: WorkspaceStateManager) => void;
        SetSharedService?: (service: SharedService) => void;
      };

      if (typeof appWithServices.SetWorkspaceManager === 'function') {
        appWithServices.SetWorkspaceManager(this.workspaceManager);
      }
      if (typeof appWithServices.SetSharedService === 'function') {
        appWithServices.SetSharedService(this.sharedService);
      }
    }

    const items = this.app?.GetNavItems() || [];
    // Only show items with Status 'Active' or undefined (default to Active)
    return items.filter(item => !item.Status || item.Status === 'Active');
  }

  /**
   * Get app color for theming
   */
  get appColor(): string {
    return this.app?.GetColor() || '#1976d2';
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

  /**
   * Check if nav item is active (has matching tab)
   */
  isActive(item: NavItem): boolean {
    const config = this.workspaceManager.GetConfiguration();
    if (!config || !this.app) return false;

    // Check if active tab matches this nav item
    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (activeTab && activeTab.applicationId === this.app.ID) {
      // Check if nav item has a custom matching function (for dynamic items)
      const dynamicItem = item as NavItem & { isActiveMatch?: (tab: unknown) => boolean };
      if (dynamicItem.isActiveMatch && typeof dynamicItem.isActiveMatch === 'function') {
        return dynamicItem.isActiveMatch(activeTab);
      }

      // Standard matching: route or label
      return (item.Route && activeTab.configuration['route'] === item.Route) ||
             activeTab.title === item.Label;
    }
    return false;
  }
}
