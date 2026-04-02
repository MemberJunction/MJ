/**
 * @fileoverview React root lifecycle management for preventing memory leaks
 * @module @memberjunction/react-runtime/runtime
 */

import { resourceManager } from '../utilities/resource-manager';

export interface ManagedReactRoot {
  id: string;
  root: any; // React root instance
  container: HTMLElement;
  isRendering: boolean;
  lastRenderTime?: Date;
  componentId?: string;
}

/**
 * Manages React root instances to prevent memory leaks and ensure proper cleanup.
 * Handles safe rendering and unmounting with protection against concurrent operations.
 */
export class ReactRootManager {
  private roots = new Map<string, ManagedReactRoot>();
  private renderingRoots = new Set<string>();
  private unmountQueue = new Map<string, () => void>();
  private dropdownObserver: MutationObserver | null = null;
  
  /**
   * Create a new managed React root
   * @param container - The DOM container element
   * @param createRootFn - Function to create the React root (e.g., ReactDOM.createRoot)
   * @param componentId - Optional component ID for resource tracking
   * @returns The root ID for future operations
   */
  createRoot(
    container: HTMLElement,
    createRootFn: (container: HTMLElement) => any,
    componentId?: string
  ): string {
    // Initialize the dropdown position fix on first root creation
    this.initDropdownPositionFix();

    const rootId = `react-root-${Date.now()}-${Math.random()}`;
    const root = createRootFn(container);
    
    const managedRoot: ManagedReactRoot = {
      id: rootId,
      root,
      container,
      isRendering: false,
      componentId
    };
    
    this.roots.set(rootId, managedRoot);
    
    // Register with resource manager if component ID provided
    if (componentId) {
      resourceManager.registerReactRoot(
        componentId,
        root,
        () => this.unmountRoot(rootId)
      );
    }
    
    return rootId;
  }
  
  /**
   * Safely render content to a React root
   * @param rootId - The root ID
   * @param element - React element to render
   * @param onComplete - Optional callback when render completes
   */
  render(
    rootId: string,
    element: any,
    onComplete?: () => void
  ): void {
    const managedRoot = this.roots.get(rootId);
    if (!managedRoot) {
      console.warn(`React root ${rootId} not found`);
      return;
    }
    
    // Don't render if we're already unmounting
    if (this.unmountQueue.has(rootId)) {
      console.warn(`React root ${rootId} is being unmounted, skipping render`);
      return;
    }
    
    // Mark as rendering
    managedRoot.isRendering = true;
    this.renderingRoots.add(rootId);
    
    try {
      managedRoot.root.render(element);
      managedRoot.lastRenderTime = new Date();
      
      // Use microtask to ensure React has completed its work
      Promise.resolve().then(() => {
        managedRoot.isRendering = false;
        this.renderingRoots.delete(rootId);
        
        // Process any pending unmount
        const pendingUnmount = this.unmountQueue.get(rootId);
        if (pendingUnmount) {
          this.unmountQueue.delete(rootId);
          pendingUnmount();
        }
        
        if (onComplete) {
          onComplete();
        }
      });
    } catch (error) {
      // Clean up rendering state on error
      managedRoot.isRendering = false;
      this.renderingRoots.delete(rootId);
      throw error;
    }
  }
  
  /**
   * Safely unmount a React root
   * @param rootId - The root ID
   * @param force - Force unmount even if rendering
   */
  unmountRoot(rootId: string, force: boolean = false): Promise<void> {
    return new Promise((resolve) => {
      const managedRoot = this.roots.get(rootId);
      if (!managedRoot) {
        resolve();
        return;
      }
      
      const performUnmount = () => {
        try {
          managedRoot.root.unmount();
          this.roots.delete(rootId);
          this.renderingRoots.delete(rootId);
          
          // Clean up container to ensure no dangling references
          if (managedRoot.container) {
            // Clear React's internal references
            delete (managedRoot.container as any)._reactRootContainer;
            // Clear the container content without replacing the node
            managedRoot.container.innerHTML = '';
          }
          
          resolve();
        } catch (error) {
          console.error(`Error unmounting React root ${rootId}:`, error);
          // Still clean up our tracking even if unmount failed
          this.roots.delete(rootId);
          this.renderingRoots.delete(rootId);
          resolve();
        }
      };
      
      // If not rendering or force unmount, unmount immediately
      if (!managedRoot.isRendering || force) {
        performUnmount();
      } else {
        // Queue unmount for after rendering completes
        this.unmountQueue.set(rootId, () => {
          performUnmount();
        });
      }
    });
  }
  
  /**
   * Unmount all roots associated with a component
   * @param componentId - The component ID
   */
  async unmountComponentRoots(componentId: string): Promise<void> {
    const rootIds: string[] = [];
    
    for (const [rootId, managedRoot] of this.roots) {
      if (managedRoot.componentId === componentId) {
        rootIds.push(rootId);
      }
    }
    
    await Promise.all(rootIds.map(id => this.unmountRoot(id)));
  }
  
  /**
   * Check if a root is currently rendering
   * @param rootId - The root ID
   * @returns true if rendering
   */
  isRendering(rootId: string): boolean {
    return this.renderingRoots.has(rootId);
  }
  
  /**
   * Get statistics about managed roots
   */
  getStats(): {
    totalRoots: number;
    renderingRoots: number;
    pendingUnmounts: number;
  } {
    return {
      totalRoots: this.roots.size,
      renderingRoots: this.renderingRoots.size,
      pendingUnmounts: this.unmountQueue.size
    };
  }
  
  /**
   * Initializes a global fix for antd dropdown positioning.
   *
   * antd's popup positioning (via rc-trigger / dom-align) calculates wrong
   * coordinates in the Angular host, rendering dropdowns thousands of pixels
   * off-screen. This fix:
   *
   * 1. Injects a CSS rule that uses !important with CSS custom properties to
   *    override antd's inline left/top values. The fallback (-9999px) hides
   *    dropdowns until positioned, preventing flash-of-wrong-position.
   *
   * 2. A MutationObserver catches dropdown elements when added to the DOM
   *    and sets the CSS variables to the correct viewport-relative coordinates
   *    based on the trigger element's position.
   *
   * Uses position:absolute (antd's default) rather than position:fixed to
   * preserve antd's virtual scroll behavior inside dropdown panels.
   */
  private initDropdownPositionFix(): void {
    if (this.dropdownObserver) return;
    if (typeof document === 'undefined') return;

    const DROPDOWN_SELECTOR = '.ant-select-dropdown, .ant-picker-dropdown, .ant-cascader-dropdown';
    const TRIGGER_SELECTOR = '.ant-select-open, .ant-picker-focused, .ant-dropdown-open';

    // CSS !important overrides antd's inline left/top permanently.
    // CSS custom properties (--dd-left, --dd-top) are set per-element from JS.
    // Fallback of -9999px hides dropdowns until the observer positions them.
    const style = document.createElement('style');
    style.textContent = DROPDOWN_SELECTOR + ' { left: var(--dd-left, -9999px) !important; top: var(--dd-top, -9999px) !important; z-index: 99999 !important; }';
    document.head.appendChild(style);

    const fixDropdown = (dd: HTMLElement) => {
      if (dd.hasAttribute('data-pos-fixed')) return;
      const trigger = document.querySelector(TRIGGER_SELECTOR);
      if (!trigger) return;

      const tRect = trigger.getBoundingClientRect();
      const op = dd.offsetParent as HTMLElement | null;

      if (op) {
        // Position relative to offset parent (keeps position:absolute working)
        const opRect = op.getBoundingClientRect();
        dd.style.setProperty('--dd-left', `${tRect.left - opRect.left}px`);
        dd.style.setProperty('--dd-top', `${tRect.bottom - opRect.top + 2}px`);
      } else {
        // No offset parent — fall back to viewport coordinates
        dd.style.setProperty('--dd-left', `${tRect.left}px`);
        dd.style.setProperty('--dd-top', `${tRect.bottom + 2}px`);
      }
      dd.setAttribute('data-pos-fixed', '1');
    };

    // Watch for dropdown elements being added to the DOM.
    // Only watches childList (not attributes) to avoid firing during scroll/hover.
    this.dropdownObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const addedNodes = Array.from(m.addedNodes);
        for (const node of addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as HTMLElement;

          // Check if the added node itself is a dropdown
          if (el.className && typeof el.className === 'string' && /\bant-(select|picker|cascader)-dropdown\b/.test(el.className)) {
            fixDropdown(el);
          }

          // Check descendants (dropdown may be nested inside a wrapper)
          if (el.querySelectorAll) {
            const nested = el.querySelectorAll(DROPDOWN_SELECTOR);
            nested.forEach((n) => fixDropdown(n as HTMLElement));
          }
        }
      }
    });

    this.dropdownObserver.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Clean up all roots (for testing or shutdown)
   */
  async cleanup(): Promise<void> {
    this.dropdownObserver?.disconnect();
    this.dropdownObserver = null;
    const allRootIds = Array.from(this.roots.keys());
    await Promise.all(allRootIds.map(id => this.unmountRoot(id, true)));
  }
}

// Singleton instance
export const reactRootManager = new ReactRootManager();