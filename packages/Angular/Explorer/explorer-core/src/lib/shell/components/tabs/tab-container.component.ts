import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  ViewContainerRef,
  ComponentRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  GoldenLayoutManager,
  WorkspaceStateManager,
  ApplicationManager,
  TabComponentState,
  TabShownEvent,
  WorkspaceTab
} from '@memberjunction/ng-base-application';

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
  selector: 'mj-tab-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tab-container.component.html',
  styleUrls: ['./tab-container.component.scss']
})
export class TabContainerComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('glContainer', { static: true }) glContainer!: ElementRef<HTMLDivElement>;

  private subscriptions: Subscription[] = [];

  // Context menu state
  contextMenuVisible = false;
  contextMenuX = 0;
  contextMenuY = 0;
  contextMenuTabId: string | null = null;

  constructor(
    private layoutManager: GoldenLayoutManager,
    private workspaceManager: WorkspaceStateManager,
    private appManager: ApplicationManager
  ) {}

  ngOnInit(): void {
    // Subscribe to tab events
    this.subscriptions.push(
      this.layoutManager.TabShown.subscribe(event => {
        this.onTabShown(event);
      }),
      this.layoutManager.TabClosed.subscribe(tabId => {
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
      })
    );

    // Subscribe to configuration changes to sync tabs
    this.subscriptions.push(
      this.workspaceManager.Configuration.subscribe(config => {
        if (config) {
          this.syncTabsWithConfiguration(config.tabs);
        }
      })
    );
  }

  ngAfterViewInit(): void {
    // Initialize Golden Layout
    this.layoutManager.Initialize(this.glContainer.nativeElement);

    // Load saved layout
    const config = this.workspaceManager.GetConfiguration();
    if (config) {
      this.layoutManager.LoadLayout(config.layout);

      // Create tabs from configuration
      config.tabs.forEach(tab => {
        this.createTab(tab);
      });

      // Focus active tab
      if (config.activeTabId) {
        this.layoutManager.FocusTab(config.activeTabId);
      }
    }

    // Set up event listeners for tab interactions
    this.setupTabEventListeners();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
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
      isLoaded: false
    };

    this.layoutManager.AddTab(state);
  }

  /**
   * Handle tab shown event for lazy loading
   */
  private onTabShown(event: TabShownEvent): void {
    if (event.isFirstShow) {
      // Load content for this tab
      this.loadTabContent(event.tabId, event.container);
      this.layoutManager.MarkTabLoaded(event.tabId);
    }
  }

  /**
   * Load content into a tab container
   */
  private loadTabContent(tabId: string, container: unknown): void {
    // TODO: Implement dynamic component loading based on route
    // This will use Angular's ViewContainerRef to create components
    const tab = this.workspaceManager.GetTab(tabId);
    if (tab) {
      console.log('Loading content for tab:', tab.title, tab.configuration);
    }
  }

  /**
   * Sync tabs with configuration changes
   */
  private syncTabsWithConfiguration(tabs: WorkspaceTab[]): void {
    // Update styling for existing tabs
    tabs.forEach(tab => {
      const app = this.appManager.GetAppById(tab.applicationId);
      this.layoutManager.UpdateTabStyle(tab.id, {
        isPinned: tab.isPinned,
        title: tab.title,
        appColor: app?.GetColor() || '#757575'
      });
    });
  }

  /**
   * Set up event listeners for tab interactions
   */
  private setupTabEventListeners(): void {
    const container = this.glContainer.nativeElement;

    // Double-click to toggle pin
    container.addEventListener('dblclick', (e: MouseEvent) => {
      const tabElement = (e.target as HTMLElement).closest('.lm_tab');
      if (tabElement) {
        const tabId = this.getTabIdFromElement(tabElement as HTMLElement);
        if (tabId) {
          this.workspaceManager.TogglePin(tabId);
        }
      }
    });

    // Right-click for context menu
    container.addEventListener('contextmenu', (e: MouseEvent) => {
      const tabElement = (e.target as HTMLElement).closest('.lm_tab');
      if (tabElement) {
        e.preventDefault();
        const tabId = this.getTabIdFromElement(tabElement as HTMLElement);
        if (tabId) {
          this.showContextMenu(e.clientX, e.clientY, tabId);
        }
      }
    });

    // Click on pin icon to unpin
    container.addEventListener('click', (e: MouseEvent) => {
      const pinIcon = (e.target as HTMLElement).closest('.pin-icon');
      if (pinIcon) {
        const tabElement = pinIcon.closest('.lm_tab');
        if (tabElement) {
          const tabId = this.getTabIdFromElement(tabElement as HTMLElement);
          if (tabId) {
            this.workspaceManager.TogglePin(tabId);
          }
        }
      }
    });

    // Close context menu on outside click
    document.addEventListener('click', () => {
      this.contextMenuVisible = false;
    });
  }

  /**
   * Get tab ID from tab element
   */
  private getTabIdFromElement(element: HTMLElement): string | null {
    // Get from container state
    const container = this.layoutManager.GetContainer(element.dataset['tabId'] || '');
    if (container) {
      const state = (container as { state: unknown }).state as unknown as TabComponentState;
      return state?.tabId || null;
    }
    return element.dataset['tabId'] || null;
  }

  /**
   * Show context menu
   */
  showContextMenu(x: number, y: number, tabId: string): void {
    this.contextMenuX = x;
    this.contextMenuY = y;
    this.contextMenuTabId = tabId;
    this.contextMenuVisible = true;
  }

  /**
   * Hide context menu
   */
  hideContextMenu(): void {
    this.contextMenuVisible = false;
    this.contextMenuTabId = null;
  }

  /**
   * Check if context menu tab is pinned
   */
  get isContextTabPinned(): boolean {
    if (!this.contextMenuTabId) return false;
    const tab = this.workspaceManager.GetTab(this.contextMenuTabId);
    return tab?.isPinned || false;
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
      this.layoutManager.RemoveTab(this.contextMenuTabId);
    }
    this.hideContextMenu();
  }
}
