import { Injectable, OnDestroy } from '@angular/core';
import { SkipComponentChildSpec, SkipComponentRootSpec } from '@memberjunction/skip-types';

interface RegisteredComponent {
  component: any;
  context: string;
  version: string;
  usageCount: number;
}

/**
 * Service to manage component registration with cleanup support
 */
@Injectable({ providedIn: 'root' })
export class ComponentRegistryService implements OnDestroy {
  private registry = new Map<string, RegisteredComponent>();
  private readonly cleanupThreshold = 10; // Clean up components not used after 10 checks

  ngOnDestroy(): void {
    this.clear();
  }

  /**
   * Register a component with metadata
   */
  register(
    componentName: string,
    component: any,
    context: string = 'Global',
    version: string = 'v1'
  ): void {
    const key = this.createKey(componentName, context, version);
    this.registry.set(key, {
      component,
      context,
      version,
      usageCount: 0
    });
  }

  /**
   * Get a component with fallback to global context
   */
  get(
    componentName: string,
    context: string = 'Global',
    version: string = 'v1'
  ): any {
    // Try specific context first
    const specificKey = this.createKey(componentName, context, version);
    const specific = this.registry.get(specificKey);
    if (specific) {
      specific.usageCount++;
      return specific.component;
    }

    // Fall back to global context
    const globalKey = this.createKey(componentName, 'Global', version);
    const global = this.registry.get(globalKey);
    if (global) {
      global.usageCount++;
      return global.component;
    }

    return null;
  }

  /**
   * Get all components required by a component spec
   */
  getComponentsForSpec(spec: SkipComponentRootSpec): Record<string, any> {
    const components: Record<string, any> = {};
    const componentNames = this.collectComponentNames(spec);

    for (const name of componentNames) {
      const component = this.get(name);
      if (component) {
        components[name] = component;
      }
    }

    return components;
  }

  /**
   * Unregister a specific component
   */
  unregister(
    componentName: string,
    context: string = 'Global',
    version: string = 'v1'
  ): void {
    const key = this.createKey(componentName, context, version);
    this.registry.delete(key);
  }

  /**
   * Clear all registered components
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Clean up unused components
   */
  cleanupUnused(): void {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.registry.entries()) {
      if (entry.usageCount === 0) {
        keysToDelete.push(key);
      } else {
        // Reset usage count for next cleanup cycle
        entry.usageCount = 0;
      }
    }

    for (const key of keysToDelete) {
      this.registry.delete(key);
    }
  }

  /**
   * Get registry size for monitoring
   */
  getSize(): number {
    return this.registry.size;
  }

  /**
   * Get all registered component names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.registry.keys()).map(key => {
      const [name] = key.split('::');
      return name;
    });
  }

  private createKey(name: string, context: string, version: string): string {
    return `${name}::${context}::${version}`;
  }

  private collectComponentNames(spec: SkipComponentRootSpec): Set<string> {
    const names = new Set<string>();
    
    const collectFromChildren = (children: SkipComponentChildSpec[]) => {
      for (const child of children) {
        names.add(child.componentName);
        if (child.components?.length) {
          collectFromChildren(child.components);
        }
      }
    };

    if (spec.childComponents?.length) {
      collectFromChildren(spec.childComponents);
    }

    return names;
  }
}