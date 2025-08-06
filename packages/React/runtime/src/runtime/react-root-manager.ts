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
   * Clean up all roots (for testing or shutdown)
   */
  async cleanup(): Promise<void> {
    const allRootIds = Array.from(this.roots.keys());
    await Promise.all(allRootIds.map(id => this.unmountRoot(id, true)));
  }
}

// Singleton instance
export const reactRootManager = new ReactRootManager();