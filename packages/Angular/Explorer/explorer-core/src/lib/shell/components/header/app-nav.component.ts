import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { BaseApplication, NavItem, WorkspaceStateManager } from '@memberjunction/ng-base-application';

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
  @Output() navItemClick = new EventEmitter<NavItem>();

  constructor(private workspaceManager: WorkspaceStateManager) {}

  ngOnInit(): void {
    console.log('[AppNav] Component initialized, app:', this.app?.Name);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['app']) {
      console.log('[AppNav] App input changed to:', this.app?.Name);
      console.log('[AppNav] Nav items:', this.app?.GetNavItems());
    }
  }

  /**
   * Get navigation items for current app
   */
  get navItems(): NavItem[] {
    const items = this.app?.GetNavItems() || [];
    console.log('[AppNav] navItems getter called, returning', items.length, 'items:', items);
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
  onNavClick(item: NavItem): void {
    console.log('[AppNav] Nav item clicked:', item.Label, item);
    this.navItemClick.emit(item);
    console.log('[AppNav] Event emitted');
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
