import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { BaseApplication, NavItem, WorkspaceStateManager } from '@memberjunction/ng-base-application';

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
  selector: 'mj-app-nav',
  templateUrl: './app-nav.component.html',
  styleUrls: ['./app-nav.component.css']
})
export class AppNavComponent implements OnInit, OnChanges {
  @Input() app: BaseApplication | null = null;
  @Output() navItemClick = new EventEmitter<NavItemClickEvent>();

  constructor(private workspaceManager: WorkspaceStateManager) {}

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['app']) {
    }
  }

  /**
   * Get navigation items for current app.
   * Filters out items that are not Active (Pending or Disabled).
   */
  get navItems(): NavItem[] {
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
    if (!activeTab || activeTab.applicationId !== this.app.ID) return false;

    // Use more robust matching hierarchy
    // 1. Check navItemName if available (most reliable)
    const navItemName = activeTab.configuration?.['navItemName'] as string | undefined;
    if (navItemName && navItemName === item.Label) {
      return true;
    }

    // 2. Check route if available
    const route = activeTab.configuration?.['route'] as string | undefined;
    if (item.Route && route && route === item.Route) {
      return true;
    }

    // 3. Fallback to case-insensitive, trimmed title match
    const activeTitle = (activeTab.title || '').trim().toLowerCase();
    const itemLabel = (item.Label || '').trim().toLowerCase();
    return activeTitle === itemLabel;
  }
}
