import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { BaseApplication, NavItem, WorkspaceStateManager } from '@memberjunction/ng-base-application';

/**
 * Event emitted when a nav item is clicked
 */
export interface NavItemClickEvent {
  item: NavItem;
  shiftKey: boolean;
}

/**
 * Horizontal navigation items for the current app.
 */
@Component({
  selector: 'mj-app-nav',
  templateUrl: './app-nav.component.html',
  styleUrls: ['./app-nav.component.scss']
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
   * Get navigation items for current app
   */
  get navItems(): NavItem[] {
    const items = this.app?.GetNavItems() || [];
    return items;
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
      shiftKey: event?.shiftKey || false
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
      // Simple route matching
      return (item.Route && activeTab.configuration['route'] === item.Route) ||
             activeTab.title === item.Label;
    }
    return false;
  }
}
