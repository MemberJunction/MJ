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
    const rv = new RunView();
    const result = await rv.RunView<WorkspaceEntity>({
      EntityName: 'Workspaces',
      ExtraFilter: `UserID='${userId}'`,
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results.length > 0) {
      const workspace = result.Results[0];
      this.workspace$.next(workspace);

      // Parse configuration or create default
      const configJson = workspace.Get('Configuration') as string;
      const config = configJson
        ? JSON.parse(configJson) as WorkspaceConfiguration
        : createDefaultWorkspaceConfiguration();

      this.configuration$.next(config);
    } else {
      // Create new workspace for user
      const md = new Metadata();
      const workspace = await md.GetEntityObject<WorkspaceEntity>('Workspaces');
      workspace.UserID = userId;
      workspace.Name = 'Default';
      workspace.Set('Configuration', JSON.stringify(createDefaultWorkspaceConfiguration()));

      if (await workspace.Save()) {
        this.workspace$.next(workspace);
        this.configuration$.next(createDefaultWorkspaceConfiguration());
      } else {
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
    const config = this.configuration$.value;
    if (!config) {
      throw new Error('Configuration not initialized');
    }

    // Check for existing tab - match by resource type and record ID
    const existingTab = config.tabs.find(tab => {
      if (tab.applicationId !== request.ApplicationId) return false;

      // For resource-based tabs, match by resourceType in configuration
      if (request.Configuration?.resourceType) {
        const requestRecordId = request.ResourceRecordId || '';
        const tabRecordId = tab.resourceRecordId || '';
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
      // Focus existing tab instead of creating duplicate
      const updatedConfig = {
        ...config,
        activeTabId: existingTab.id
      };
      this.UpdateConfiguration(updatedConfig);
      return existingTab.id;
    }

    // ALWAYS create new tab - never replace temporary tabs
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

    this.UpdateConfiguration({
      ...config,
      tabs: [...config.tabs, newTab],
      activeTabId: newTab.id
    });

    return newTab.id;
  }

  /**
   * Open a tab (new or focus existing)
   */
  OpenTab(request: TabRequest, appColor: string): string {
    const config = this.configuration$.value;
    if (!config) {
      throw new Error('Configuration not initialized');
    }

    // Check for existing tab - match by resource type and record ID for resource-based tabs
    const existingTab = config.tabs.find(tab => {
      if (tab.applicationId !== request.ApplicationId) return false;

      // For resource-based tabs, match by resourceType in configuration
      if (request.Configuration?.resourceType) {
        // Normalize empty/null/undefined to empty string for comparison
        const requestRecordId = request.ResourceRecordId || '';
        const tabRecordId = tab.resourceRecordId || '';
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
      // Focus existing tab
      const updatedConfig = {
        ...config,
        activeTabId: existingTab.id
      };
      this.UpdateConfiguration(updatedConfig);
      return existingTab.id;
    }

    // Find temporary tab (unpinned tab from ANY app) to replace
    const tempTab = config.tabs.find(tab => !tab.isPinned);

    if (tempTab) {
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
      return tempTab.id;
    }

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
