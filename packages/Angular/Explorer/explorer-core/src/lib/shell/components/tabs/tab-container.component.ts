import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  ApplicationRef,
  EnvironmentInjector,
  createComponent,
  ComponentRef,
  ViewEncapsulation
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  GoldenLayoutManager,
  WorkspaceStateManager,
  ApplicationManager,
  TabComponentState,
  TabShownEvent,
  WorkspaceTab
} from '@memberjunction/ng-base-application';
import { MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, ResourceTypeEntity } from '@memberjunction/core-entities';
import { DatasetResultType, LogError, Metadata, RunView } from '@memberjunction/core';

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
  templateUrl: './tab-container.component.html',
  styleUrls: ['./tab-container.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class TabContainerComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('glContainer', { static: false }) glContainer!: ElementRef<HTMLDivElement>;

  private subscriptions: Subscription[] = [];
  private layoutInitialized = false;

  // Track component references for cleanup
  private componentRefs = new Map<string, ComponentRef<BaseResourceComponent>>();

  // Context menu state
  contextMenuVisible = false;
  contextMenuX = 0;
  contextMenuY = 0;
  contextMenuTabId: string | null = null;

  constructor(
    private layoutManager: GoldenLayoutManager,
    private workspaceManager: WorkspaceStateManager,
    private appManager: ApplicationManager,
    private appRef: ApplicationRef,
    private environmentInjector: EnvironmentInjector
  ) {}

  ngOnInit(): void {
    // Subscribe to tab events
    this.subscriptions.push(
      this.layoutManager.TabShown.subscribe(event => {
        this.onTabShown(event);
      }),
      this.layoutManager.TabClosed.subscribe(tabId => {
        this.cleanupTabComponent(tabId);
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
        console.log('[TabContainer] Configuration changed, layoutInitialized:', this.layoutInitialized);
        if (config && this.layoutInitialized) {
          this.syncTabsWithConfiguration(config.tabs);
        }
      })
    );
  }

  ngAfterViewInit(): void {
    console.log('[TabContainer] ngAfterViewInit - initializing Golden Layout');
    // Initialize Golden Layout
    this.layoutManager.Initialize(this.glContainer.nativeElement);

    // Mark layout as initialized
    this.layoutInitialized = true;

    // Add a test tab to verify Golden Layout is working
    console.log('[TabContainer] Adding test "Hello World" tab');
    this.layoutManager.AddTab({
      tabId: 'test-hello-world',
      appId: 'test',
      appColor: '#ff0000',
      title: 'Hello World Test',
      route: '',
      isPinned: false,
      isLoaded: false
    });

    // Load saved layout
    const config = this.workspaceManager.GetConfiguration();
    if (config) {
      console.log('[TabContainer] Loading initial configuration with', config.tabs.length, 'tabs');
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

    // Cleanup all dynamic components
    this.componentRefs.forEach((ref, tabId) => {
      this.cleanupTabComponent(tabId);
    });
    this.componentRefs.clear();
  }

  /**
   * Create a tab in Golden Layout from workspace tab data
   */
  private createTab(tab: WorkspaceTab): void {
    console.log('[TabContainer] createTab called for:', tab.id, tab.title);
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

    console.log('[TabContainer] Adding tab to layout manager:', state);
    this.layoutManager.AddTab(state);
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
   */
  private async loadTabContent(tabId: string, container: unknown): Promise<void> {
    try {
      const tab = this.workspaceManager.GetTab(tabId);
      if (!tab) {
        LogError(`Tab not found: ${tabId}`);
        return;
      }

      // Get the container element from Golden Layout
      const glContainer = container as { element: HTMLElement };
      if (!glContainer?.element) {
        LogError('Golden Layout container element not found');
        return;
      }

      // Extract resource data from tab configuration
      const resourceData = await this.getResourceDataFromTab(tab);
      if (!resourceData) {
        LogError(`Unable to create ResourceData for tab: ${tab.title}`);
        return;
      }

      // Get the component registration for this resource type
      const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseResourceComponent,
        resourceData.ResourceType
      );

      if (!resourceReg) {
        LogError(`Unable to find resource registration for ${resourceData.ResourceType}`);
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
        console.log('Tab content loaded:', tab.title);
      };

      instance.ResourceRecordSavedEvent = (entity: { Get?: (key: string) => unknown }) => {
        // Update tab title if needed
        if (entity && entity.Get && entity.Get('Name')) {
          // TODO: Implement UpdateTabTitle in WorkspaceStateManager
          console.log('Tab record saved:', entity.Get('Name'));
        }
      };

      // Create a container div for the component
      const componentElement = document.createElement('div');
      componentElement.className = 'tab-content-wrapper';
      componentElement.style.cssText = 'width: 100%; height: 100%; overflow: auto;';

      // Append the component's native element
      const nativeElement = (componentRef.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes[0];
      componentElement.appendChild(nativeElement);

      // Add to Golden Layout container
      glContainer.element.appendChild(componentElement);

      // Store reference for cleanup
      this.componentRefs.set(tabId, componentRef as ComponentRef<BaseResourceComponent>);

    } catch (e) {
      LogError(e);
    }
  }

  /**
   * Convert tab configuration to ResourceData
   */
  private async getResourceDataFromTab(tab: WorkspaceTab): Promise<ResourceData | null> {
    const config = tab.configuration;
    console.log('[TabContainer] getResourceDataFromTab - config:', config);

    // Extract resource type from configuration or route
    let resourceType = config['resourceType'] as string;
    console.log('[TabContainer] getResourceDataFromTab - resourceType from config:', resourceType);

    if (!resourceType && config['route']) {
      // Parse route to determine resource type
      resourceType = this.getResourceTypeFromRoute(config['route'] as string);
      console.log('[TabContainer] getResourceDataFromTab - resourceType from route:', resourceType);
    }

    if (!resourceType) {
      console.log('[TabContainer] getResourceDataFromTab - NO resourceType found, returning null');
      return null;
    }

    const resourceData = new ResourceData({
      ResourceTypeID: await this.getResourceTypeId(resourceType),
      ResourceType: resourceType,
      ResourceRecordID: config['recordId'] as string || '',
      Configuration: config
    });

    console.log('[TabContainer] getResourceDataFromTab - created ResourceData:', resourceData);
    return resourceData;
  }

  private static _resourceTypesDataset: DatasetResultType | null = null;
  private async getResourceTypeId(resourceType: string): Promise<string> {
    // use the cached dataset for this
    const md = new Metadata();
    const ds = TabContainerComponent._resourceTypesDataset || await md.GetDatasetByName("ResourceTypes");
    if (!ds || !ds.Success || ds.Results.length === 0) {
      throw new Error('ResourceTypes dataset not found');
    }
    else {
      if (!TabContainerComponent._resourceTypesDataset)
        TabContainerComponent._resourceTypesDataset = ds; // store this for next time
  
      const result = ds.Results.find(r => r.Code.trim().toLowerCase() === 'resourcetypes') 
      if (result && result.Results?.length > 0) {
        const rt = result.Results.find(rt => rt.Name.trim().toLowerCase() === resourceType.trim().toLowerCase());
        if (rt) {
          return rt.ID;
        }
      }
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
   * Cleanup a tab's component
   */
  private cleanupTabComponent(tabId: string): void {
    const componentRef = this.componentRefs.get(tabId);
    if (componentRef) {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
      this.componentRefs.delete(tabId);
    }
  }

  /**
   * Sync tabs with configuration changes
   */
  private syncTabsWithConfiguration(tabs: WorkspaceTab[]): void {
    console.log('[TabContainer] syncTabsWithConfiguration called with', tabs.length, 'tabs');

    // Get existing tab IDs from Golden Layout
    const existingTabIds = this.layoutManager.GetAllTabIds();
    console.log('[TabContainer] Existing tabs in layout:', existingTabIds);

    // Create tabs that don't exist yet
    tabs.forEach(tab => {
      if (!existingTabIds.includes(tab.id)) {
        console.log('[TabContainer] Creating new tab:', tab.id, tab.title);
        this.createTab(tab);
      } else {
        console.log('[TabContainer] Updating existing tab:', tab.id);
        // Update styling for existing tabs
        const app = this.appManager.GetAppById(tab.applicationId);
        this.layoutManager.UpdateTabStyle(tab.id, {
          isPinned: tab.isPinned,
          title: tab.title,
          appColor: app?.GetColor() || '#757575'
        });
      }
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
