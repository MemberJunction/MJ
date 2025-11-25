import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import { WorkspaceEntity } from '@memberjunction/core-entities';
import {
  WorkspaceConfiguration,
  WorkspaceTab,
  createDefaultWorkspaceConfiguration
} from './interfaces/workspace-configuration.interface';
import { TabRequest } from './interfaces/tab-request.interface';

/**
 * Manages workspace state including tabs, layout, and persistence.
 *
 * Uses a single Workspace.Configuration JSON blob for all state,
 * with debounced saves to minimize database writes.
 */
@Injectable({
  providedIn: 'root'
})
export class WorkspaceStateManager {
  private workspace$ = new BehaviorSubject<WorkspaceEntity | null>(null);
  private configuration$ = new BehaviorSubject<WorkspaceConfiguration | null>(null);
  private saveRequest$ = new Subject<void>();
  private loading$ = new BehaviorSubject<boolean>(false);
  private tabBarVisible$ = new BehaviorSubject<boolean>(true);
  private initialized = false;

  constructor() {
    // Set up debounced saves
    this.saveRequest$.pipe(
      debounceTime(500) // Wait 500ms after last change
    ).subscribe(() => {
      this.persistConfiguration();
    });

    // Update tab bar visibility whenever configuration changes
    this.configuration$.subscribe(config => {
      if (config) {
        const shouldShow = this.shouldShowTabs(config);
        this.tabBarVisible$.next(shouldShow);
      }
    });
  }

  /**
   * Observable of the current workspace configuration
   */
  get Configuration(): Observable<WorkspaceConfiguration | null> {
    return this.configuration$.asObservable();
  }

  /**
   * Observable of loading state
   */
  get Loading(): Observable<boolean> {
    return this.loading$.asObservable();
  }

  /**
   * Observable of tab bar visibility
   * Returns false when only 1 tab exists and no tabs are pinned
   * Returns true when 2+ tabs exist OR any tabs are pinned
   */
  get TabBarVisible(): Observable<boolean> {
    return this.tabBarVisible$.asObservable();
  }

  /**
   * Get current configuration synchronously
   */
  GetConfiguration(): WorkspaceConfiguration | null {
    return this.configuration$.value;
  }

  /**
   * Determine if tab bar should be visible
   * - Hide if only 1 tab and no pinned tabs (single-resource view)
   * - Show if 2+ tabs OR any pinned tabs exist
   */
  private shouldShowTabs(config: WorkspaceConfiguration): boolean {
    const tabs = config.tabs || [];

    // Always hide if no tabs (shouldn't happen, but defensive)
    if (tabs.length === 0) {
      return false;
    }

    // Check if any tabs are pinned
    const hasPinnedTabs = tabs.some(tab => tab.isPinned);

    // Show tabs if:
    // - 2 or more tabs exist, OR
    // - Any tab is pinned (user wants persistent workspace)
    return tabs.length > 1 || hasPinnedTabs;
  }

  /**
   * Initialize the workspace state for a user
   */
  async Initialize(userId: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.loading$.next(true);

    try {
      await this.loadWorkspace(userId);
      this.initialized = true;
    } finally {
      this.loading$.next(false);
    }
  }

  /**
   * Load workspace from database
   */
  private async loadWorkspace(userId: string): Promise<void> {
    console.log('[WorkspaceStateManager.loadWorkspace] Loading workspace for user:', userId);

    const rv = new RunView();
    const result = await rv.RunView<WorkspaceEntity>({
      EntityName: 'Workspaces',
      ExtraFilter: `UserID='${userId}'`,
      ResultType: 'entity_object'
    });

    console.log('[WorkspaceStateManager.loadWorkspace] RunView result:', {
      success: result.Success,
      count: result.Results?.length || 0,
      errorMessage: result.ErrorMessage
    });

    if (result.Success && result.Results.length > 0) {
      const workspace = result.Results[0];
      console.log('[WorkspaceStateManager.loadWorkspace] Found existing workspace:', workspace.ID);
      this.workspace$.next(workspace);

      // Parse configuration or create default
      const configJson = workspace.Get('Configuration') as string;
      console.log('[WorkspaceStateManager.loadWorkspace] Configuration JSON length:', configJson?.length || 0);

      const config = configJson
        ? JSON.parse(configJson) as WorkspaceConfiguration
        : createDefaultWorkspaceConfiguration();

      console.log('[WorkspaceStateManager.loadWorkspace] Loaded configuration with', config.tabs?.length || 0, 'tabs');
      this.configuration$.next(config);
    } else {
      // Create new workspace for user
      console.log('[WorkspaceStateManager.loadWorkspace] No workspace found, creating new one');
      console.log('[WorkspaceStateManager.loadWorkspace] RunView error:', result.ErrorMessage);

      const md = new Metadata();
      const workspace = await md.GetEntityObject<WorkspaceEntity>('Workspaces');
      workspace.UserID = userId;
      workspace.Name = 'Default';
      workspace.Set('Configuration', JSON.stringify(createDefaultWorkspaceConfiguration()));

      console.log('[WorkspaceStateManager.loadWorkspace] Saving new workspace...');
      const saveResult = await workspace.Save();
      console.log('[WorkspaceStateManager.loadWorkspace] Save result:', saveResult);

      if (saveResult) {
        this.workspace$.next(workspace);
        this.configuration$.next(createDefaultWorkspaceConfiguration());
        console.log('[WorkspaceStateManager.loadWorkspace] New workspace created successfully');
      } else {
        console.error('[WorkspaceStateManager.loadWorkspace] Failed to save workspace');
        throw new Error('Failed to create default workspace');
      }
    }
  }

  /**
   * Persist configuration to database (debounced)
   */
  private async persistConfiguration(): Promise<void> {
    const workspace = this.workspace$.value;
    const config = this.configuration$.value;

    if (workspace && config) {
      workspace.Set('Configuration', JSON.stringify(config));
      await workspace.Save();
    }
  }

  /**
   * Request a save (will be debounced)
   */
  private requestSave(): void {
    this.saveRequest$.next();
  }

  /**
   * Update configuration and request save
   */
  UpdateConfiguration(config: WorkspaceConfiguration): void {
    this.configuration$.next(config);
    this.requestSave();
  }

  /**
   * Force creation of a new tab, never replacing temporary tabs
   * Used for Shift+Click behavior and power user workflows
   */
  OpenTabForced(request: TabRequest, appColor: string): string {
    console.log('[WorkspaceStateManager.OpenTabForced] ALWAYS creating new tab:', {
      appId: request.ApplicationId,
      title: request.Title,
      config: request.Configuration
    });

    const config = this.configuration$.value;
    if (!config) {
      throw new Error('Configuration not initialized');
    }

    // OpenTabForced ALWAYS creates a new tab, even if one exists for this resource
    // This is the whole point of "Forced" - for shift+click to open multiple tabs of same resource
    const newTab: WorkspaceTab = {
      id: this.generateUUID(),
      applicationId: request.ApplicationId,
      title: request.Title,
      resourceTypeId: request.ResourceTypeId || '',
      resourceRecordId: request.ResourceRecordId || '',
      isPinned: request.IsPinned || false,
      sequence: config.tabs.length,
      lastAccessedAt: new Date().toISOString(),
      configuration: request.Configuration || {}
    };

    console.log('[WorkspaceStateManager.OpenTabForced] Created new tab:', newTab.id);

    // CRITICAL: If creating a temporary tab, pin all existing temporary tabs first
    // This ensures only ONE temporary tab exists at any time
    const updatedTabs = !newTab.isPinned
      ? config.tabs.map(tab => !tab.isPinned ? { ...tab, isPinned: true } : tab)
      : config.tabs;

    this.UpdateConfiguration({
      ...config,
      tabs: [...updatedTabs, newTab],
      activeTabId: newTab.id
    });

    return newTab.id;
  }

  /**
   * Open a tab (new or focus existing)
   */
  OpenTab(request: TabRequest, appColor: string): string {
    console.log('[WorkspaceStateManager.OpenTab] Opening tab:', {
      appId: request.ApplicationId,
      title: request.Title,
      config: request.Configuration
    });

    const config = this.configuration$.value;
    if (!config) {
      throw new Error('Configuration not initialized');
    }

    console.log('[WorkspaceStateManager.OpenTab] Current tabs:', config.tabs.length);

    // Check for existing tab - match by resource type and record ID for resource-based tabs
    const existingTab = config.tabs.find(tab => {
      if (tab.applicationId !== request.ApplicationId) return false;

      // For resource-based tabs, match by resourceType in configuration
      if (request.Configuration?.resourceType) {
        // Normalize empty/null/undefined to empty string for comparison
        const requestRecordId = request.ResourceRecordId || '';
        const tabRecordId = tab.resourceRecordId || '';

        // For Custom resource types, also compare navItemName or driverClass
        // to distinguish between different custom resources (Monitor vs Prompts vs Agents, etc.)
        if (request.Configuration.resourceType === 'Custom') {
          const requestNavItem = request.Configuration.navItemName || '';
          const tabNavItem = tab.configuration?.navItemName || '';
          const requestDriverClass = request.Configuration.driverClass || '';
          const tabDriverClass = tab.configuration?.driverClass || '';

          return tab.configuration.resourceType === request.Configuration.resourceType &&
                 tabRecordId === requestRecordId &&
                 (requestNavItem === tabNavItem || requestDriverClass === tabDriverClass);
        }

        // For standard resource types, match by resourceType and recordId
        return tab.configuration.resourceType === request.Configuration.resourceType &&
               tabRecordId === requestRecordId;
      }

      // Legacy: match by entity and viewId
      const requestRecordId = request.ResourceRecordId || '';
      const tabRecordId = tab.resourceRecordId || '';
      return tab.configuration.entity === request.Configuration?.entity &&
             tab.configuration.viewId === request.Configuration?.viewId &&
             tabRecordId === requestRecordId;
    });

    if (existingTab) {
      console.log('[WorkspaceStateManager.OpenTab] Found existing tab, activating:', existingTab.title);
      // Focus existing tab
      const updatedConfig = {
        ...config,
        activeTabId: existingTab.id
      };
      this.UpdateConfiguration(updatedConfig);
      return existingTab.id;
    }

    console.log('[WorkspaceStateManager.OpenTab] No existing tab found');

    // Find temporary tab (unpinned tab from ANY app) to replace
    const tempTab = config.tabs.find(tab => !tab.isPinned);

    if (tempTab) {
      console.log('[WorkspaceStateManager.OpenTab] Found temp tab to replace:', tempTab.title);
      // Replace temporary tab
      const updatedTabs = config.tabs.map(tab =>
        tab.id === tempTab.id
          ? {
              ...tab,
              applicationId: request.ApplicationId,  // Update app ID for cross-app navigation
              title: request.Title,
              resourceTypeId: request.ResourceTypeId || '',
              resourceRecordId: request.ResourceRecordId || '',
              configuration: request.Configuration || {},
              lastAccessedAt: new Date().toISOString()
            }
          : tab
      );
      this.UpdateConfiguration({
        ...config,
        tabs: updatedTabs,
        activeTabId: tempTab.id
      });
      console.log('[WorkspaceStateManager.OpenTab] Replaced temp tab');
      return tempTab.id;
    }

    console.log('[WorkspaceStateManager.OpenTab] No temp tab found, creating new tab');

    // Create new tab
    const newTab: WorkspaceTab = {
      id: this.generateUUID(),
      applicationId: request.ApplicationId,
      title: request.Title,
      resourceTypeId: request.ResourceTypeId || '',
      resourceRecordId: request.ResourceRecordId || '',
      isPinned: false,
      sequence: config.tabs.length,
      lastAccessedAt: new Date().toISOString(),
      configuration: request.Configuration || {}
    };

    this.UpdateConfiguration({
      ...config,
      tabs: [...config.tabs, newTab],
      activeTabId: newTab.id
    });

    console.log('[WorkspaceStateManager.OpenTab] Created new tab:', newTab.title);
    return newTab.id;
  }

  /**
   * Close a tab
   */
  CloseTab(tabId: string): void {
    const config = this.configuration$.value;
    if (!config) return;

    const updatedTabs = config.tabs.filter(tab => tab.id !== tabId);

    // Update active tab if needed
    let activeTabId = config.activeTabId;
    if (activeTabId === tabId) {
      // Find next tab to activate
      const closedIndex = config.tabs.findIndex(tab => tab.id === tabId);
      const nextTab = updatedTabs[closedIndex] || updatedTabs[closedIndex - 1];
      activeTabId = nextTab?.id || null;
    }

    this.UpdateConfiguration({
      ...config,
      tabs: updatedTabs,
      activeTabId
    });
  }

  /**
   * Close all tabs except the specified one
   */
  CloseOtherTabs(tabId: string): void {
    console.log('[WorkspaceStateManager.CloseOtherTabs] Closing all tabs except:', tabId);
    const config = this.configuration$.value;
    if (!config) return;

    // Keep only the specified tab
    const updatedTabs = config.tabs.filter(tab => tab.id === tabId);

    this.UpdateConfiguration({
      ...config,
      tabs: updatedTabs,
      activeTabId: tabId
    });
  }

  /**
   * Close all tabs to the right of the specified tab
   */
  CloseTabsToRight(tabId: string): void {
    console.log('[WorkspaceStateManager.CloseTabsToRight] Closing tabs to the right of:', tabId);
    const config = this.configuration$.value;
    if (!config) return;

    const tabIndex = config.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    // Keep only tabs up to and including the specified tab
    const updatedTabs = config.tabs.slice(0, tabIndex + 1);

    // Update active tab if it was closed
    let activeTabId = config.activeTabId;
    if (!updatedTabs.find(tab => tab.id === activeTabId)) {
      activeTabId = tabId;
    }

    this.UpdateConfiguration({
      ...config,
      tabs: updatedTabs,
      activeTabId
    });
  }

  /**
   * Toggle pin state of a tab
   */
  TogglePin(tabId: string): void {
    const config = this.configuration$.value;
    if (!config) return;

    const updatedTabs = config.tabs.map(tab =>
      tab.id === tabId
        ? { ...tab, isPinned: !tab.isPinned }
        : tab
    );

    this.UpdateConfiguration({
      ...config,
      tabs: updatedTabs
    });
  }

  /**
   * Set active tab
   */
  SetActiveTab(tabId: string): void {
    const config = this.configuration$.value;
    if (!config) return;

    // Update last accessed time
    const updatedTabs = config.tabs.map(tab =>
      tab.id === tabId
        ? { ...tab, lastAccessedAt: new Date().toISOString() }
        : tab
    );

    this.UpdateConfiguration({
      ...config,
      tabs: updatedTabs,
      activeTabId: tabId
    });
  }

  /**
   * Update tab sequences after reorder
   */
  UpdateTabSequences(tabIds: string[]): void {
    const config = this.configuration$.value;
    if (!config) return;

    const updatedTabs = config.tabs.map(tab => {
      const newSequence = tabIds.indexOf(tab.id);
      return newSequence >= 0 ? { ...tab, sequence: newSequence } : tab;
    }).sort((a, b) => a.sequence - b.sequence);

    this.UpdateConfiguration({
      ...config,
      tabs: updatedTabs
    });
  }

  /**
   * Update layout configuration
   */
  UpdateLayout(layout: WorkspaceConfiguration['layout']): void {
    const config = this.configuration$.value;
    if (!config) return;

    this.UpdateConfiguration({
      ...config,
      layout
    });
  }

  /**
   * Get tab by ID
   */
  GetTab(tabId: string): WorkspaceTab | undefined {
    return this.configuration$.value?.tabs.find(tab => tab.id === tabId);
  }

  /**
   * Get tabs for a specific application
   */
  GetAppTabs(appId: string): WorkspaceTab[] {
    return this.configuration$.value?.tabs.filter(tab => tab.applicationId === appId) || [];
  }

  /**
   * Generate UUID for new tabs
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
