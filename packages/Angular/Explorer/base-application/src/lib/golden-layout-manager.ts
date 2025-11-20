import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { WorkspaceConfiguration, LayoutConfig as WorkspaceLayoutConfig, LayoutNode } from './interfaces/workspace-configuration.interface';

// Golden Layout interfaces - defined here to avoid compile-time dependency
// These match the Golden Layout 2.6.0 API
interface GLComponentContainer {
  state: Record<string, unknown>;
  tab?: { element: HTMLElement };
  on(event: string, callback: () => void): void;
  close(): void;
  focus(): void;
  setTitle(title: string): void;
}

interface GLVirtualLayout {
  rootItem: GLLayoutItem | null;
  on(event: string, callback: (item?: unknown) => void): void;
  destroy(): void;
  loadLayout(config: GLLayoutConfig): void;
  saveLayout(): GLResolvedLayoutConfig;
  addItemAtLocation(config: GLComponentItemConfig, location: Array<{ typeId: number }>): void;
}

interface GLLayoutItem {
  type: string;
  contentItems?: GLLayoutItem[];
  container?: GLComponentContainer;
  addItem(config: GLComponentItemConfig): void;
}

interface GLLayoutConfig {
  root: GLLayoutNode;
  header?: {
    show: string;
    popout: boolean;
    maximise: boolean;
    close: string;
  };
}

interface GLResolvedLayoutConfig {
  root: GLLayoutNode;
}

interface GLLayoutNode {
  type: string;
  content?: GLLayoutNode[];
  componentType?: string;
  componentState?: Record<string, unknown>;
  width?: number;
  height?: number;
  isClosable?: boolean;
  title?: string;
}

interface GLComponentItemConfig {
  type: 'component';
  componentType: string;
  componentState: Record<string, unknown>;
  title: string;
}

/**
 * State stored in each Golden Layout component
 */
export interface TabComponentState {
  tabId: string;
  appId: string;
  appColor: string;
  title: string;
  route: string;
  isPinned: boolean;
  isLoaded: boolean;
}

/**
 * Event emitted when a tab is shown
 */
export interface TabShownEvent {
  tabId: string;
  container: GLComponentContainer;
  isFirstShow: boolean;
}

/**
 * Event emitted when layout changes
 */
export interface LayoutChangedEvent {
  layout: GLResolvedLayoutConfig;
}

/**
 * Manages Golden Layout instance and provides Angular integration.
 *
 * Handles:
 * - Layout initialization and destruction
 * - Tab creation with app-specific styling
 * - Lazy loading of tab content
 * - Layout serialization/deserialization
 * - Tab events (show, hide, close)
 */
@Injectable({
  providedIn: 'root'
})
export class GoldenLayoutManager {
  private layout: GLVirtualLayout | null = null;
  private containerElement: HTMLElement | null = null;

  // Event subjects
  private tabShown$ = new Subject<TabShownEvent>();
  private tabClosed$ = new Subject<string>();
  private layoutChanged$ = new Subject<LayoutChangedEvent>();
  private activeTab$ = new BehaviorSubject<string | null>(null);

  // Track loaded tabs for lazy loading
  private loadedTabs = new Set<string>();

  // Track component containers by tab ID
  private containerMap = new Map<string, GLComponentContainer>();

  /**
   * Observable for tab shown events (for lazy loading)
   */
  get TabShown(): Observable<TabShownEvent> {
    return this.tabShown$.asObservable();
  }

  /**
   * Observable for tab closed events
   */
  get TabClosed(): Observable<string> {
    return this.tabClosed$.asObservable();
  }

  /**
   * Observable for layout changed events
   */
  get LayoutChanged(): Observable<LayoutChangedEvent> {
    return this.layoutChanged$.asObservable();
  }

  /**
   * Observable for active tab changes
   */
  get ActiveTab(): Observable<string | null> {
    return this.activeTab$.asObservable();
  }

  /**
   * Initialize Golden Layout in the specified container element
   */
  Initialize(element: HTMLElement): void {
    this.containerElement = element;

    // Import Golden Layout dynamically at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VirtualLayout } = require('golden-layout');

    // Create layout with empty config
    const config: GLLayoutConfig = {
      root: {
        type: 'row',
        content: []
      },
      header: {
        show: 'top',
        popout: false,
        maximise: false,
        close: 'tab'
      }
    };

    this.layout = new VirtualLayout(
      this.containerElement,
      this.bindComponentEventListener.bind(this),
      this.unbindComponentEventListener.bind(this)
    ) as GLVirtualLayout;

    // Subscribe to state changes
    this.layout.on('stateChanged', () => {
      if (this.layout) {
        this.layoutChanged$.next({
          layout: this.layout.saveLayout()
        });
        this.refreshAllTabStyles();
      }
    });

    this.layout.on('activeContentItemChanged', (item: unknown) => {
      const typedItem = item as { container?: { state?: TabComponentState } };
      const state = typedItem?.container?.state;
      if (state?.tabId) {
        this.activeTab$.next(state.tabId);
      }
    });
  }

  /**
   * Destroy the Golden Layout instance
   */
  Destroy(): void {
    if (this.layout) {
      this.layout.destroy();
      this.layout = null;
    }
    this.containerMap.clear();
    this.loadedTabs.clear();
  }

  /**
   * Add a new tab to the layout
   */
  AddTab(state: TabComponentState): void {
    if (!this.layout) {
      console.error('Layout not initialized');
      return;
    }

    const componentConfig: GLComponentItemConfig = {
      type: 'component',
      componentType: 'tab-content',
      componentState: state as unknown as Record<string, unknown>,
      title: state.title
    };

    // Find or create a stack to add to
    const targetStack = this.findFirstStack();

    if (targetStack) {
      targetStack.addItem(componentConfig);
    } else {
      // No stack exists, add to root
      this.layout.addItemAtLocation(componentConfig, [{ typeId: 1 }]);
    }
  }

  /**
   * Remove a tab from the layout
   */
  RemoveTab(tabId: string): void {
    const container = this.containerMap.get(tabId);
    if (container) {
      container.close();
    }
  }

  /**
   * Focus a tab by ID
   */
  FocusTab(tabId: string): void {
    const container = this.containerMap.get(tabId);
    if (container) {
      container.focus();
    }
  }

  /**
   * Update tab style (pin state, title, etc.)
   */
  UpdateTabStyle(tabId: string, state: Partial<TabComponentState>): void {
    const container = this.containerMap.get(tabId);
    if (!container) return;

    // Update state
    const currentState = container.state as unknown as TabComponentState;
    Object.assign(currentState, state);

    // Update title if changed
    if (state.title) {
      container.setTitle(state.title);
    }

    // Apply visual styles
    this.applyTabStyles(container, currentState);
  }

  /**
   * Load layout from configuration
   */
  LoadLayout(config: WorkspaceLayoutConfig): void {
    if (!this.layout) {
      console.error('Layout not initialized');
      return;
    }

    try {
      const glConfig = this.convertToGoldenLayoutConfig(config);
      this.layout.loadLayout(glConfig);
    } catch (error) {
      console.error('Failed to load layout:', error);
    }
  }

  /**
   * Save current layout to configuration format
   */
  SaveLayout(): WorkspaceLayoutConfig {
    if (!this.layout) {
      return { root: { type: 'row', content: [] } };
    }

    const resolved = this.layout.saveLayout();
    return this.convertFromGoldenLayoutConfig(resolved);
  }

  /**
   * Get container for a tab
   */
  GetContainer(tabId: string): GLComponentContainer | undefined {
    return this.containerMap.get(tabId);
  }

  /**
   * Check if tab content has been loaded
   */
  IsTabLoaded(tabId: string): boolean {
    return this.loadedTabs.has(tabId);
  }

  /**
   * Mark tab as loaded
   */
  MarkTabLoaded(tabId: string): void {
    this.loadedTabs.add(tabId);
  }

  /**
   * Bind component event listener (called by Golden Layout)
   */
  private bindComponentEventListener(
    container: GLComponentContainer,
    itemConfig: { componentState: Record<string, unknown> }
  ): void {
    const state = container.state as unknown as TabComponentState;
    if (state?.tabId) {
      this.containerMap.set(state.tabId, container);

      // Apply initial styles
      this.applyTabStyles(container, state);

      // Listen for show events
      container.on('show', () => {
        const isFirstShow = !this.loadedTabs.has(state.tabId);
        this.tabShown$.next({
          tabId: state.tabId,
          container,
          isFirstShow
        });
      });

      // Listen for close events
      container.on('beforeComponentRelease', () => {
        this.containerMap.delete(state.tabId);
        this.loadedTabs.delete(state.tabId);
        this.tabClosed$.next(state.tabId);
      });
    }
  }

  /**
   * Unbind component event listener (called by Golden Layout)
   */
  private unbindComponentEventListener(container: GLComponentContainer): void {
    // Cleanup handled in beforeComponentRelease
  }

  /**
   * Apply visual styles to a tab
   */
  private applyTabStyles(container: GLComponentContainer, state: TabComponentState): void {
    const tabElement = container.tab?.element;
    if (!tabElement) return;

    // Set app color CSS variable
    tabElement.style.setProperty('--app-color', state.appColor);

    // Add/remove pinned class
    if (state.isPinned) {
      tabElement.classList.add('pinned');
    } else {
      tabElement.classList.remove('pinned');
    }

    // Set italic font for temporary tabs
    const titleElement = tabElement.querySelector('.lm_title') as HTMLElement;
    if (titleElement) {
      titleElement.style.fontStyle = state.isPinned ? 'normal' : 'italic';
    }
  }

  /**
   * Refresh styles for all tabs (after drag/drop)
   */
  private refreshAllTabStyles(): void {
    setTimeout(() => {
      this.containerMap.forEach((container, tabId) => {
        const state = container.state as unknown as TabComponentState;
        if (state) {
          this.applyTabStyles(container, state);
        }
      });
    }, 50);
  }

  /**
   * Find first stack in layout
   */
  private findFirstStack(): GLLayoutItem | null {
    if (!this.layout || !this.layout.rootItem) return null;

    const findStack = (item: GLLayoutItem): GLLayoutItem | null => {
      if (item.type === 'stack') {
        return item;
      }
      if (item.contentItems) {
        for (const child of item.contentItems) {
          const found = findStack(child);
          if (found) return found;
        }
      }
      return null;
    };

    return findStack(this.layout.rootItem);
  }

  /**
   * Convert workspace layout config to Golden Layout config
   */
  private convertToGoldenLayoutConfig(config: WorkspaceLayoutConfig): GLLayoutConfig {
    return {
      root: config.root as GLLayoutNode,
      header: {
        show: 'top',
        popout: false,
        maximise: false,
        close: 'tab'
      }
    };
  }

  /**
   * Convert Golden Layout config to workspace layout config
   */
  private convertFromGoldenLayoutConfig(resolved: GLResolvedLayoutConfig): WorkspaceLayoutConfig {
    return {
      root: resolved.root as unknown as LayoutNode
    };
  }
}
