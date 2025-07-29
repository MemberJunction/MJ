/**
 * @fileoverview Centralized resource management for React Runtime
 * Handles timers, DOM elements, event listeners, and other resources that need cleanup
 * @module @memberjunction/react-runtime/utilities
 */

export interface ManagedResource {
  type: 'timer' | 'interval' | 'animationFrame' | 'eventListener' | 'domElement' | 'observable' | 'reactRoot';
  id: string | number;
  cleanup: () => void;
  metadata?: Record<string, any>;
}

/**
 * ResourceManager provides centralized management of resources that need cleanup.
 * This prevents memory leaks by ensuring all resources are properly disposed.
 */
export class ResourceManager {
  private resources = new Map<string, Set<ManagedResource>>();
  private globalResources = new Set<ManagedResource>();
  private cleanupCallbacks = new Map<string, (() => void)[]>();

  /**
   * Register a timeout with automatic cleanup
   */
  setTimeout(
    componentId: string,
    callback: () => void,
    delay: number,
    metadata?: Record<string, any>
  ): number {
    const id = window.setTimeout(() => {
      this.removeResource(componentId, 'timer', id);
      callback();
    }, delay);

    this.addResource(componentId, {
      type: 'timer',
      id,
      cleanup: () => window.clearTimeout(id),
      metadata
    });

    return id;
  }

  /**
   * Register an interval with automatic cleanup
   */
  setInterval(
    componentId: string,
    callback: () => void,
    delay: number,
    metadata?: Record<string, any>
  ): number {
    const id = window.setInterval(callback, delay);

    this.addResource(componentId, {
      type: 'interval',
      id,
      cleanup: () => window.clearInterval(id),
      metadata
    });

    return id;
  }

  /**
   * Register an animation frame with automatic cleanup
   */
  requestAnimationFrame(
    componentId: string,
    callback: FrameRequestCallback,
    metadata?: Record<string, any>
  ): number {
    const id = window.requestAnimationFrame((time) => {
      this.removeResource(componentId, 'animationFrame', id);
      callback(time);
    });

    this.addResource(componentId, {
      type: 'animationFrame',
      id,
      cleanup: () => window.cancelAnimationFrame(id),
      metadata
    });

    return id;
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(componentId: string, id: number): void {
    window.clearTimeout(id);
    this.removeResource(componentId, 'timer', id);
  }

  /**
   * Clear a specific interval
   */
  clearInterval(componentId: string, id: number): void {
    window.clearInterval(id);
    this.removeResource(componentId, 'interval', id);
  }

  /**
   * Cancel a specific animation frame
   */
  cancelAnimationFrame(componentId: string, id: number): void {
    window.cancelAnimationFrame(id);
    this.removeResource(componentId, 'animationFrame', id);
  }

  /**
   * Register an event listener with automatic cleanup
   */
  addEventListener(
    componentId: string,
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, listener, options);
    
    const resourceId = `${type}-${Date.now()}-${Math.random()}`;
    this.addResource(componentId, {
      type: 'eventListener',
      id: resourceId,
      cleanup: () => target.removeEventListener(type, listener, options),
      metadata: { target, type, options }
    });
  }

  /**
   * Register a DOM element that needs cleanup
   */
  registerDOMElement(
    componentId: string,
    element: HTMLElement,
    cleanup?: () => void
  ): void {
    const resourceId = `dom-${Date.now()}-${Math.random()}`;
    this.addResource(componentId, {
      type: 'domElement',
      id: resourceId,
      cleanup: () => {
        if (cleanup) {
          cleanup();
        }
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      },
      metadata: { element }
    });
  }

  /**
   * Register a React root for cleanup
   */
  registerReactRoot(
    componentId: string,
    root: any,
    unmountFn: () => void
  ): void {
    this.addResource(componentId, {
      type: 'reactRoot',
      id: `react-root-${componentId}`,
      cleanup: unmountFn,
      metadata: { root }
    });
  }

  /**
   * Register a generic cleanup callback for a component
   */
  registerCleanup(componentId: string, cleanup: () => void): void {
    if (!this.cleanupCallbacks.has(componentId)) {
      this.cleanupCallbacks.set(componentId, []);
    }
    this.cleanupCallbacks.get(componentId)!.push(cleanup);
  }

  /**
   * Register a global resource (not tied to a specific component)
   */
  registerGlobalResource(resource: ManagedResource): void {
    this.globalResources.add(resource);
  }

  /**
   * Add a resource to be managed
   */
  private addResource(componentId: string, resource: ManagedResource): void {
    if (!this.resources.has(componentId)) {
      this.resources.set(componentId, new Set());
    }
    this.resources.get(componentId)!.add(resource);
  }

  /**
   * Remove a specific resource
   */
  private removeResource(
    componentId: string,
    type: ManagedResource['type'],
    id: string | number
  ): void {
    const componentResources = this.resources.get(componentId);
    if (componentResources) {
      const toRemove = Array.from(componentResources).find(
        r => r.type === type && r.id === id
      );
      if (toRemove) {
        componentResources.delete(toRemove);
      }
    }
  }

  /**
   * Clean up all resources for a specific component
   */
  cleanupComponent(componentId: string): void {
    // Clean up tracked resources
    const componentResources = this.resources.get(componentId);
    if (componentResources) {
      componentResources.forEach(resource => {
        try {
          resource.cleanup();
        } catch (error) {
          console.error(`Error cleaning up ${resource.type} resource:`, error);
        }
      });
      this.resources.delete(componentId);
    }

    // Execute cleanup callbacks
    const callbacks = this.cleanupCallbacks.get(componentId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error executing cleanup callback:', error);
        }
      });
      this.cleanupCallbacks.delete(componentId);
    }
  }

  /**
   * Clean up all global resources
   */
  cleanupGlobal(): void {
    this.globalResources.forEach(resource => {
      try {
        resource.cleanup();
      } catch (error) {
        console.error(`Error cleaning up global ${resource.type} resource:`, error);
      }
    });
    this.globalResources.clear();
  }

  /**
   * Clean up all resources (components and global)
   */
  cleanupAll(): void {
    // Clean up all component resources
    for (const componentId of this.resources.keys()) {
      this.cleanupComponent(componentId);
    }

    // Clean up global resources
    this.cleanupGlobal();
  }

  /**
   * Get resource statistics for debugging
   */
  getStats(): {
    componentCount: number;
    resourceCounts: Record<string, number>;
    globalResourceCount: number;
  } {
    const resourceCounts: Record<string, number> = {};
    
    for (const resources of this.resources.values()) {
      resources.forEach(resource => {
        resourceCounts[resource.type] = (resourceCounts[resource.type] || 0) + 1;
      });
    }

    return {
      componentCount: this.resources.size,
      resourceCounts,
      globalResourceCount: this.globalResources.size
    };
  }
}

// Singleton instance
export const resourceManager = new ResourceManager();