import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { LogError } from '@memberjunction/core';
import { VirtualLayout } from 'golden-layout';
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
  addComponent(componentType: string, componentState: Record<string, unknown>, title: string): void;
  setSize(width: number, height: number): void;
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
  private tabDoubleClicked = new Subject<string>();
  private tabRightClicked = new Subject<{ tabId: string; x: number; y: number }>();

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
   * Observable for tab double-click events (to toggle pin status)
   */
  get TabDoubleClicked(): Observable<string> {
    return this.tabDoubleClicked.asObservable();
  }

  /**
   * Observable for tab right-click events (to show context menu)
   */
  get TabRightClicked(): Observable<{ tabId: string; x: number; y: number }> {
    return this.tabRightClicked.asObservable();
  }

  /**
   * Initialize Golden Layout in the specified container element
   */
  Initialize(element: HTMLElement): void {
    this.containerElement = element;

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
      this.bindComponentEventListener.bind(this) as VirtualLayout.BindComponentEventHandler,
      this.unbindComponentEventListener.bind(this) as VirtualLayout.UnbindComponentEventHandler
    ) as unknown as GLVirtualLayout;

    // Enable automatic resize when container size changes
    // This uses Golden Layout's built-in ResizeObserver (default is false for non-body containers)
    (this.layout as unknown as { resizeWithContainerAutomatically: boolean }).resizeWithContainerAutomatically = true;

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

    // Load the empty config to establish root structure
    // This MUST be done before adding any components
    this.layout.loadLayout(config);

    // Configure debounce settings for faster resize response
    // Default resizeDebounceInterval is 100ms, reduce to 50ms for snappier feel
    (this.layout as unknown as { resizeDebounceInterval: number }).resizeDebounceInterval = 50;
    // Disable extended debounce - we want layout to resize during drag, not just after
    (this.layout as unknown as { resizeDebounceExtendedWhenPossible: boolean }).resizeDebounceExtendedWhenPossible = false;

    // CRITICAL: Set the size of Golden Layout to match the container
    // Without this, all internal elements will have height: 0
    const rect = this.containerElement.getBoundingClientRect();
    this.layout.setSize(rect.width, rect.height);

    // Retry setSize after delays to handle timing issues with flexbox layout
    // Initial page load can take time for container to have final dimensions
    // Use increasing delays to catch both fast and slow layout calculations
    setTimeout(() => this.updateSize(), 50);
    setTimeout(() => this.updateSize(), 150);
    setTimeout(() => this.updateSize(), 300);
  }

  /**
   * Update layout size to match container.
   * Call this if the layout appears incorrectly sized.
   * This is useful for handling flexbox timing issues on page load
   * or when the container size changes due to external factors.
   */
  updateSize(): void {
    if (this.layout && this.containerElement) {
      const rect = this.containerElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.layout.setSize(rect.width, rect.height);
      }
    }
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
   * Adds to existing stack if one exists, otherwise creates new stack
   */
  AddTab(state: TabComponentState): void {
    if (!this.layout) {
      LogError('GoldenLayoutManager: Layout not initialized');
      return;
    }

    try {
      // First, check if there's an existing stack to add to
      const existingStack = this.findFirstStack();

      if (existingStack) {
        // Add to existing stack (creates tabbed interface)
        const componentConfig: GLComponentItemConfig = {
          type: 'component',
          componentType: 'tab-content',
          componentState: state as unknown as Record<string, unknown>,
          title: state.title
        };
        existingStack.addItem(componentConfig);
      } else {
        // No existing stack - use addComponent which will create one
        this.layout.addComponent(
          'tab-content',  // componentType
          state as unknown as Record<string, unknown>,  // componentState
          state.title  // title
        );
      }
    } catch (error) {
      LogError('GoldenLayoutManager: Failed to add tab - ' + (error as Error).message);
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
   * @returns true if layout was loaded successfully, false if it failed
   */
  LoadLayout(config: WorkspaceLayoutConfig): boolean {
    if (!this.layout) {
      LogError('GoldenLayoutManager: Layout not initialized');
      return false;
    }

    // Don't load empty or invalid layouts - Golden Layout doesn't handle them well
    if (!config || !config.root || !config.root.content || config.root.content.length === 0) {
      return false;
    }

    try {
      const glConfig = this.convertToGoldenLayoutConfig(config);
      this.layout.loadLayout(glConfig);
      return true;
    } catch (error) {
      LogError('GoldenLayoutManager: Failed to load layout - ' + (error as Error).message);
      return false;
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
   * Mark tab as not loaded (forces reload on next show)
   */
  MarkTabNotLoaded(tabId: string): void {
    this.loadedTabs.delete(tabId);
  }

  /**
   * Get all tab IDs currently in the layout
   */
  GetAllTabIds(): string[] {
    return Array.from(this.containerMap.keys());
  }

  /**
   * Bind component event listener (called by Golden Layout)
   */
  private bindComponentEventListener(
    container: GLComponentContainer,
    itemConfig: { componentState: Record<string, unknown> }
  ): { component: HTMLElement; virtual: boolean } {
    const state = container.state as unknown as TabComponentState;

    // Create a simple div element for tab content
    const element = document.createElement('div');
    element.className = 'tab-content-container';
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.overflow = 'hidden';
    element.style.padding = '0';

    // Temporary placeholder content
    element.innerHTML = `
      <h2>${state?.title || 'Tab Content'}</h2>
      <p>Tab ID: ${state?.tabId || 'unknown'}</p>
      <p>Route: ${state?.route || 'none'}</p>
      <p>App ID: ${state?.appId || 'none'}</p>
    `;

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

    // CRITICAL: Return the bindable component object
    return {
      component: element,
      virtual: false  // false means actual DOM content
    };
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

    // Add event listeners if not already added (use data attribute to track)
    if (!tabElement.hasAttribute('data-events-attached')) {
      tabElement.setAttribute('data-events-attached', 'true');

      // Double-click to toggle pin
      tabElement.addEventListener('dblclick', (e: Event) => {
        e.stopPropagation();
        this.tabDoubleClicked.next(state.tabId);
      });

      // Right-click for context menu
      tabElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.tabRightClicked.next({ tabId: state.tabId, x: e.clientX, y: e.clientY });
      });
    }

    // Handle pin icon
    if (state.isPinned) {
      // Add pin icon if not present
      if (!tabElement.querySelector('.pin-icon')) {
        const pinIcon = document.createElement('i');
        pinIcon.className = 'fa-solid fa-thumbtack pin-icon';
        pinIcon.style.cssText = `
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%) rotate(45deg);
          font-size: 9px;
          color: #9e9e9e;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        `;
        // Click on pin to unpin
        pinIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          this.tabDoubleClicked.next(state.tabId);
        });
        tabElement.appendChild(pinIcon);
      }
    } else {
      // Remove pin icon if present
      const pinIcon = tabElement.querySelector('.pin-icon');
      if (pinIcon) {
        pinIcon.remove();
      }
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
    // Sanitize the root node to ensure size values are valid
    const sanitizedRoot = this.sanitizeLayoutNode(config.root);

    return {
      root: sanitizedRoot as GLLayoutNode,
      header: {
        show: 'top',
        popout: false,
        maximise: false,
        close: 'tab'
      }
    };
  }

  /**
   * Sanitize a layout node to ensure all values are Golden Layout compatible
   */
  private sanitizeLayoutNode(node: LayoutNode): LayoutNode {
    const sanitized: LayoutNode = {
      ...node
    };

    // Cast to any to work with dynamic properties
    const sanitizedAny = sanitized as any;

    // Convert size from number + sizeUnit to Golden Layout format
    // Golden Layout expects strings like "100%" or "1fr", not separate fields
    if (sanitizedAny.size !== undefined && sanitizedAny.sizeUnit !== undefined) {
      if (typeof sanitizedAny.size === 'number') {
        // Combine size and sizeUnit into a single string
        sanitizedAny.size = `${sanitizedAny.size}${sanitizedAny.sizeUnit}`;
        // Remove sizeUnit as it's now part of size
        delete sanitizedAny.sizeUnit;
      }
    }

    // Remove width/height if they exist and are not valid
    // Golden Layout expects strings like "50%" or numbers (pixels)
    // But JSON parsing might give us non-string objects
    if (sanitized.width !== undefined) {
      if (typeof sanitized.width !== 'number' && typeof sanitized.width !== 'string') {
        delete sanitized.width;
      }
    }
    if (sanitized.height !== undefined) {
      if (typeof sanitized.height !== 'number' && typeof sanitized.height !== 'string') {
        delete sanitized.height;
      }
    }

    // Remove other Golden Layout internal fields that shouldn't be in saved config
    delete sanitizedAny.minSizeUnit;

    // Recursively sanitize child nodes
    if (sanitized.content) {
      sanitized.content = sanitized.content.map(child => this.sanitizeLayoutNode(child));
    }

    return sanitized;
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
