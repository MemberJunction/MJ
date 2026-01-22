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
  ViewEncapsulation,
  ChangeDetectorRef,
  HostListener,
  Output,
  EventEmitter
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  GoldenLayoutManager,
  WorkspaceStateManager,
  ApplicationManager,
  TabComponentState,
  TabShownEvent,
  WorkspaceTab,
  LayoutNode
} from '@memberjunction/ng-base-application';
import { MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, ResourceTypeEntity } from '@memberjunction/core-entities';
import { DatasetResultType, LogError, Metadata, RunView } from '@memberjunction/core';
import { ComponentCacheManager } from './component-cache-manager';
import { DashboardResource } from '../../../resource-wrappers/dashboard-resource.component';

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
  @ViewChild('directContentContainer', { static: false }) directContentContainer!: ElementRef<HTMLDivElement>;

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

  private subscriptions: Subscription[] = [];
  private layoutInitRetryCount = 0;
  private readonly MAX_LAYOUT_INIT_RETRIES = 5;
  private hasEmittedFirstLoadComplete = false;
  private layoutInitialized = false;
  private layoutRestorationComplete = false;

  // Track component references for cleanup (legacy - keep for backward compat during transition)
  private componentRefs = new Map<string, ComponentRef<BaseResourceComponent>>();

  // NEW: Smart component cache for preserving state across tab switches
  private cacheManager: ComponentCacheManager;

  // Single-resource mode: render component directly without Golden Layout
  // This avoids the 20px height issue when GL header is hidden
  useSingleResourceMode = false;
  private singleResourceComponentRef: ComponentRef<BaseResourceComponent> | null = null;
  private previousTabBarVisible: boolean | null = null;
  private currentSingleResourceSignature: string | null = null; // Track loaded content signature to avoid unnecessary reloads
  private isCreatingInitialTabs = false; // Flag to prevent syncTabsWithConfiguration during initial tab creation

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
    private environmentInjector: EnvironmentInjector,
    private cdr: ChangeDetectorRef
  ) {
    // Initialize component cache manager
    this.cacheManager = new ComponentCacheManager(this.appRef);
  }

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
      }),
      this.layoutManager.TabDoubleClicked.subscribe(tabId => {
        this.workspaceManager.TogglePin(tabId);
      }),
      this.layoutManager.TabRightClicked.subscribe(event => {
        this.showContextMenu(event.x, event.y, event.tabId);
      })
    );

    // Subscribe to configuration changes to sync tabs
    this.subscriptions.push(
      this.workspaceManager.Configuration.subscribe(config => {
        if (config) {
          if (this.useSingleResourceMode) {
            // In single-resource mode, reload content if the tab content changed
            // The same tab ID can have different content (tab gets reused)
            const activeTab = config.tabs.find(t => t.id === config.activeTabId) || config.tabs[0];
            if (activeTab) {
              const signature = this.getTabContentSignature(activeTab);
              if (signature !== this.currentSingleResourceSignature) {
                this.loadSingleResourceContent();
              }
            }
          } else if (this.layoutRestorationComplete && !this.isCreatingInitialTabs) {
            // In multi-tab mode, sync with Golden Layout
            // IMPORTANT: Only sync AFTER layout restoration is complete to avoid creating duplicate tabs
            // layoutRestorationComplete is set to true only after initializeGoldenLayout finishes
            this.syncTabsWithConfiguration(config.tabs);
          }
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

    // Check if config has no tabs
    if (config.tabs.length === 0) {
      // No tabs to load, but mark restoration as complete
      this.layoutRestorationComplete = true;
      return;
    }

    // Check if we have a saved layout structure with actual content
    const hasSavedLayout = config.layout?.root?.content && config.layout.root.content.length > 0;

    if (hasSavedLayout && !forceCreateTabs && config.layout) {
      // VALIDATE: Check that layout component count matches tabs array count
      const layoutComponentCount = this.countLayoutComponents(config.layout.root);
      if (layoutComponentCount !== config.tabs.length) {
        console.warn(`[TabContainer.initializeGoldenLayout] Layout/tabs mismatch: layout has ${layoutComponentCount} components but tabs array has ${config.tabs.length} tabs. Clearing layout.`);
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
    // Use config.tabs sorted by sequence to build a simple single-stack layout
    const sortedTabs = [...config.tabs].sort((a, b) => a.sequence - b.sequence);

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

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());

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
      this.cdr.detectChanges();

      if (this.useSingleResourceMode) {
        // Transitioning to single-resource mode
        // **CRITICAL FIX**: Wait for the template to render directContentContainer
        // before trying to load content. detectChanges() only marks dirty, doesn't render immediately.
        setTimeout(() => {
          // First, destroy Golden Layout if it was initialized (prevents stale state)
          if (this.layoutInitialized) {
            this.layoutManager.Destroy();
            this.layoutInitialized = false;
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
            // Pin all tabs except the newly active one (which is the temporary tab)
            if (tab.id !== config.activeTabId && !tab.isPinned) {
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
    const activeTab = config.tabs.find(t => t.id === config.activeTabId) || config.tabs[0];
    if (!activeTab) {
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
      console.warn('Direct content container not available yet, retrying...');
      // Retry after view is updated
      setTimeout(() => this.loadSingleResourceContent(), 50);
      return;
    }

    // Create ResourceData from tab
    const resourceData = await this.getResourceDataFromTab(activeTab);
    if (!resourceData) {
      LogError(`Unable to create ResourceData for tab: ${activeTab.title}`);
      return;
    }

    // Get driver class for component lookup
    const driverClass = resourceData.Configuration?.resourceTypeDriverClass || resourceData.ResourceType;

    // **OPTIMIZATION: Check cache first to reuse existing loaded component**
    const cached = this.cacheManager.getCachedComponent(
      driverClass,
      resourceData.ResourceRecordID || '',
      activeTab.applicationId
    );

    if (cached) {
      // Clean up previous single-resource component (if different)
      this.cleanupSingleResourceComponent();

      // Detach from tab tracking (it was attached to a tab in Golden Layout)
      this.cacheManager.markAsDetached(activeTab.id);

      // Reattach the cached wrapper element to single-resource container
      cached.wrapperElement.style.height = "100%"; // Ensure full height
      container.appendChild(cached.wrapperElement);

      // Store reference for cleanup
      this.singleResourceComponentRef = cached.componentRef;

      return;
    }

    // Get the component registration
    const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(
      BaseResourceComponent,
      driverClass
    );

    if (!resourceReg) {
      LogError(`Unable to find resource registration for driver class: ${driverClass}`);
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

    // Get the native element and append to container
    const nativeElement = (componentRef.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes[0];
    container.appendChild(nativeElement);
    // now make sure that the container's direct child is 100% height
    if (container.children?.length > 0) {
      (container.children[0] as any).style.height = "100%";
    }

    // Store reference for cleanup
    this.singleResourceComponentRef = componentRef as ComponentRef<BaseResourceComponent>;
  }

  /**
   * Clean up single-resource mode component
   */
  private cleanupSingleResourceComponent(): void {
    if (this.singleResourceComponentRef) {
      this.appRef.detachView(this.singleResourceComponentRef.hostView);
      this.singleResourceComponentRef.destroy();
      this.singleResourceComponentRef = null;
    }

    // Clear the container
    const container = this.directContentContainer?.nativeElement;
    if (container) {
      container.innerHTML = '';
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
      isLoaded: false
    };

    this.layoutManager.AddTab(state);

    // Load display name in background without loading full component
    this.updateTabDisplayName(tab);
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

      // Clear any existing content from the container (important for tab reuse)
      glContainer.element.innerHTML = '';

      // Get driver class for cache lookup (resolves to actual component class name)
      const driverClass = resourceData.Configuration?.resourceTypeDriverClass || resourceData.ResourceType;

      // Check if we have a cached component for this resource
      const cached = this.cacheManager.getCachedComponent(
        driverClass,
        resourceData.ResourceRecordID || '',
        tab.applicationId
      );

      if (cached) {
        // Reattach the cached wrapper element
        glContainer.element.appendChild(cached.wrapperElement);

        // Mark as attached to this tab
        this.cacheManager.markAsAttached(
          driverClass,
          resourceData.ResourceRecordID || '',
          tab.applicationId,
          tabId
        );

        // Keep legacy componentRefs map updated
        this.componentRefs.set(tabId, cached.componentRef);

        // If resource is already loaded, update tab title immediately
        const instance = cached.componentRef.instance as BaseResourceComponent;
        if (instance.LoadComplete) {
          this.updateTabTitleFromResource(tabId, instance, resourceData);
        }

        return;
      }

      // Get the component registration using the driver class
      const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseResourceComponent,
        driverClass
      );

      if (!resourceReg) {
        LogError(`Unable to find resource registration for driver class: ${driverClass}`);
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

      instance.ResourceRecordSavedEvent = (entity: { Get?: (key: string) => unknown }) => {
        // Update tab title if needed
        if (entity && entity.Get && entity.Get('Name')) {
          // TODO: Implement UpdateTabTitle in WorkspaceStateManager
        }
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
      LogError(e);
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
      const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseResourceComponent,
        driverClass
      );

      if (!resourceReg) {
        return;
      }

      // Create a lightweight instance just to call GetResourceDisplayName
      const tempInstance = new resourceReg.SubClass() as BaseResourceComponent;
      const displayName = await tempInstance.GetResourceDisplayName(resourceData);

      if (displayName && displayName !== tab.title) {
        // Update the tab title in Golden Layout
        this.layoutManager.UpdateTabStyle(tab.id, { title: displayName });

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

    // Include applicationId and driverClass in configuration
    const resourceConfig = {
      ...config,
      applicationId: tab.applicationId,
      resourceTypeDriverClass: driverClass  // Store resolved driver class for component lookup
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
  private async getResourceTypeEntity(resourceType: string): Promise<ResourceTypeEntity | null> {
    const md = new Metadata();
    const ds = TabContainerComponent._resourceTypesDataset || await md.GetDatasetByName("ResourceTypes");
    if (!ds || !ds.Success || ds.Results.length === 0) {
      return null;
    }

    if (!TabContainerComponent._resourceTypesDataset) {
      TabContainerComponent._resourceTypesDataset = ds; // cache for next time
    }

    const result = ds.Results.find(r => r.Code.trim().toLowerCase() === 'resourcetypes');
    if (result && result.Results?.length > 0) {
      const rt = result.Results.find(rt => rt.Name.trim().toLowerCase() === resourceType.trim().toLowerCase()) as ResourceTypeEntity;
      return rt || null;
    }

    return null;
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
   * Cleanup a tab's component
   * Detaches from DOM but keeps in cache for potential reuse
   */
  private cleanupTabComponent(tabId: string): void {
    // First, try to detach from cache (preserves component for reuse)
    const cachedInfo = this.cacheManager.markAsDetached(tabId);

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

        // Update styling for existing tabs
        const app = this.appManager.GetAppById(tab.applicationId);
        this.layoutManager.UpdateTabStyle(tab.id, {
          isPinned: tab.isPinned,
          title: tab.title,
          appColor: app?.GetColor() || '#757575'
        });
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
  showContextMenu(x: number, y: number, tabId: string): void {
    this.contextMenuX = x;
    this.contextMenuY = y;
    this.contextMenuTabId = tabId;
    this.contextMenuVisible = true;

    // Close menu when clicking outside - use setTimeout to avoid immediate trigger
    setTimeout(() => {
      const clickHandler = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.context-menu')) {
          this.hideContextMenu();
          document.removeEventListener('click', clickHandler);
          document.removeEventListener('keydown', keyHandler);
        }
      };

      const keyHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          this.hideContextMenu();
          document.removeEventListener('click', clickHandler);
          document.removeEventListener('keydown', keyHandler);
        }
      };

      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler);
    }, 0);
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
   * While the naming implies this is only invoked once, components we DO NOT CONTROL might have race
   * conditions that result in unpredictable behavior. To avoid those causing loading screen overaly to show
   * forever we emit all events upstream
   */
  private emitFirstLoadCompleteOnce(): void {
    this.firstResourceLoadComplete.emit(); // do this each time to be sure we don't suppress messages
  }
}
