/**
 * @fileoverview Platform-agnostic component registry for managing compiled React components.
 * Provides storage, retrieval, and lifecycle management for components with namespace support.
 * @module @memberjunction/react-runtime/registry
 */

import { 
  RegistryEntry, 
  ComponentMetadata, 
  RegistryConfig 
} from '../types';
import { ComponentObject } from '@memberjunction/interactive-component-types';
import { resourceManager } from '../utilities/resource-manager';

/**
 * Default registry configuration
 */
const DEFAULT_REGISTRY_CONFIG: RegistryConfig = {
  maxComponents: 1000,
  cleanupInterval: 60000, // 1 minute
  useLRU: true,
  enableNamespaces: true
};

/**
 * Platform-agnostic component registry.
 * Manages compiled React components with namespace isolation and lifecycle management.
 */
export class ComponentRegistry {
  private registry: Map<string, RegistryEntry>;
  private config: RegistryConfig;
  private cleanupTimer?: NodeJS.Timeout | number;
  public readonly registryId: string;
  
  /**
   * Creates a new ComponentRegistry instance
   * @param config - Optional registry configuration
   */
  constructor(config?: Partial<RegistryConfig>) {
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
    this.registry = new Map();
    this.registryId = `component-registry-${Date.now()}`;
    
    // Start cleanup timer if configured
    if (this.config.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * Registers a compiled component
   * @param name - Component name
   * @param component - Compiled component object
   * @param namespace - Component namespace (default: 'Global')
   * @param version - Component version (default: 'v1')
   * @param contentHash - Optional content fingerprint. When provided, the entry
   *   is keyed by `(name, namespace, version, contentHash)` so multiple specs
   *   that share `(name, namespace, version)` but carry different `code` (e.g.
   *   a registry-reference stub vs. an inline-code Studio export of the same
   *   artifact) coexist in the cache instead of clobbering each other.
   * @param tags - Optional tags for categorization
   * @returns The registered component's metadata
   */
  register(
    name: string,
    component: ComponentObject,
    namespace: string = 'Global',
    version: string = 'v1',
    contentHash?: string,
    tags?: string[]
  ): ComponentMetadata {
    const id = this.generateRegistryKey(name, namespace, version, contentHash);

    // Create metadata
    const metadata: ComponentMetadata = {
      id,
      name,
      version,
      namespace,
      registeredAt: new Date(),
      tags
    };

    // Create registry entry
    const entry: RegistryEntry = {
      component,
      metadata,
      lastAccessed: new Date(),
      refCount: 0
    };

    // Check capacity
    if (this.registry.size >= this.config.maxComponents && this.config.useLRU) {
      this.evictLRU();
    }

    // Store in registry
    this.registry.set(id, entry);

    return metadata;
  }

  /**
   * Gets a component from the registry
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version
   * @param contentHash - Optional content fingerprint. When provided, looks up
   *   the exact `(name, namespace, version, contentHash)` entry. When omitted,
   *   falls back to the most recently registered entry matching the other keys
   *   (existing behavior).
   * @returns The component object if found, undefined otherwise
   */
  get(name: string, namespace: string = 'Global', version?: string, contentHash?: string): ComponentObject | undefined {
    const id = this.resolveLookupKey(name, namespace, version, contentHash);

    if (!id) return undefined;

    const entry = this.registry.get(id);
    if (entry) {
      // Update access time and increment ref count
      entry.lastAccessed = new Date();
      entry.refCount++;
      return entry.component;
    }

    return undefined;
  }

  /**
   * Checks if a component exists in the registry
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version
   * @param contentHash - Optional content fingerprint (see {@link get})
   * @returns true if the component exists
   */
  has(name: string, namespace: string = 'Global', version?: string, contentHash?: string): boolean {
    const id = this.resolveLookupKey(name, namespace, version, contentHash);
    return id ? this.registry.has(id) : false;
  }

  /**
   * Removes a component from the registry
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version
   * @param contentHash - Optional content fingerprint (see {@link get})
   * @returns true if the component was removed
   */
  unregister(name: string, namespace: string = 'Global', version?: string, contentHash?: string): boolean {
    const id = this.resolveLookupKey(name, namespace, version, contentHash);
    if (!id) return false;
    return this.registry.delete(id);
  }

  /**
   * Gets all components in a namespace
   * @param namespace - Namespace to query
   * @returns Array of components in the namespace
   */
  getNamespace(namespace: string): ComponentMetadata[] {
    const components: ComponentMetadata[] = [];
    
    for (const entry of this.registry.values()) {
      if (entry.metadata.namespace === namespace) {
        components.push(entry.metadata);
      }
    }

    return components;
  }

  /**
   * Gets all components in a namespace and version as a map
   * @param namespace - Namespace to query (default: 'Global')
   * @param version - Version to query (default: 'v1')
   * @returns Object mapping component names to component objects
   */
  getAll(namespace: string = 'Global', version: string = 'v1'): Record<string, ComponentObject> {
    const components: Record<string, ComponentObject> = {};
    
    for (const entry of this.registry.values()) {
      if (entry.metadata.namespace === namespace && entry.metadata.version === version) {
        components[entry.metadata.name] = entry.component;
      }
    }

    return components;
  }

  /**
   * Gets all registered namespaces
   * @returns Array of unique namespace names
   */
  getNamespaces(): string[] {
    const namespaces = new Set<string>();
    
    for (const entry of this.registry.values()) {
      namespaces.add(entry.metadata.namespace);
    }

    return Array.from(namespaces);
  }

  /**
   * Gets components by tags
   * @param tags - Tags to search for
   * @returns Array of components matching any of the tags
   */
  getByTags(tags: string[]): ComponentMetadata[] {
    const components: ComponentMetadata[] = [];
    
    for (const entry of this.registry.values()) {
      if (entry.metadata.tags?.some(tag => tags.includes(tag))) {
        components.push(entry.metadata);
      }
    }

    return components;
  }

  /**
   * Decrements reference count for a component
   * @param name - Component name
   * @param namespace - Component namespace
   * @param version - Component version
   * @param contentHash - Optional content fingerprint (see {@link get})
   */
  release(name: string, namespace: string = 'Global', version?: string, contentHash?: string): void {
    const id = this.resolveLookupKey(name, namespace, version, contentHash);
    if (!id) return;

    const entry = this.registry.get(id);
    if (entry && entry.refCount > 0) {
      entry.refCount--;
    }
  }

  /**
   * Clears all components from the registry
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Clear all components in a specific namespace
   * @param namespace - Namespace to clear (default: 'Global')
   * @returns Number of components removed
   */
  clearNamespace(namespace: string = 'Global'): number {
    const toRemove: string[] = [];
    for (const [key, entry] of this.registry) {
      if (entry.metadata.namespace === namespace) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.registry.delete(key);
    }
    return toRemove.length;
  }

  /**
   * Force clear all components and reset registry
   * Used for development/testing scenarios
   */
  forceClear(): void {
    this.stopCleanupTimer();
    this.registry.clear();
    console.log('🧹 Registry force cleared - all components removed');
  }

  /**
   * Gets the current size of the registry
   * @returns Number of registered components
   */
  size(): number {
    return this.registry.size;
  }

  /**
   * Performs cleanup of unused components
   * @param force - Force cleanup regardless of reference count
   * @returns Number of components removed
   */
  cleanup(force: boolean = false): number {
    const toRemove: string[] = [];
    const now = Date.now();

    for (const [id, entry] of this.registry) {
      // Remove if no references and hasn't been accessed recently
      const timeSinceAccess = now - entry.lastAccessed.getTime();
      const isUnused = entry.refCount === 0 && timeSinceAccess > this.config.cleanupInterval;

      if (force || isUnused) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.registry.delete(id);
    }

    return toRemove.length;
  }

  /**
   * Gets registry statistics
   * @returns Object containing registry stats
   */
  getStats(): {
    totalComponents: number;
    namespaces: number;
    totalRefCount: number;
    oldestComponent?: Date;
    newestComponent?: Date;
  } {
    let totalRefCount = 0;
    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const entry of this.registry.values()) {
      totalRefCount += entry.refCount;
      
      if (!oldest || entry.metadata.registeredAt < oldest) {
        oldest = entry.metadata.registeredAt;
      }
      
      if (!newest || entry.metadata.registeredAt > newest) {
        newest = entry.metadata.registeredAt;
      }
    }

    return {
      totalComponents: this.registry.size,
      namespaces: this.getNamespaces().length,
      totalRefCount,
      oldestComponent: oldest,
      newestComponent: newest
    };
  }

  /**
   * Destroys the registry and cleans up resources
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
    // Clean up any resources associated with this registry
    resourceManager.cleanupComponent(this.registryId);
  }

  /**
   * Generates a unique registry key. When `contentHash` is supplied, it is
   * appended so two specs that share `(name, namespace, version)` but have
   * different code body don't collide.
   */
  private generateRegistryKey(name: string, namespace: string, version: string, contentHash?: string): string {
    const base = this.config.enableNamespaces ? `${namespace}::${name}@${version}` : `${name}@${version}`;
    return contentHash ? `${base}#${contentHash}` : base;
  }

  /**
   * Resolves a lookup to an exact internal key. Centralizes the four
   * lookup-shape variants used by `get`, `has`, `unregister`, and `release`:
   *
   * - hash + version  → exact hash-suffixed key
   * - version only    → latest entry matching `(name, namespace, version)` across all hashes
   * - hash only       → no version → fall back to latest version (hash isn't enough alone)
   * - neither         → latest entry matching `(name, namespace)`
   */
  private resolveLookupKey(name: string, namespace: string, version?: string, contentHash?: string): string | undefined {
    if (version && contentHash) {
      return this.generateRegistryKey(name, namespace, version, contentHash);
    }
    if (version) {
      return this.findLatestForVersion(name, namespace, version);
    }
    return this.findLatestVersion(name, namespace);
  }

  /**
   * Find the most recently registered entry whose metadata matches
   * `(name, namespace, version)`. Different content hashes for the same
   * version are scanned and the newest by `registeredAt` wins.
   */
  private findLatestForVersion(name: string, namespace: string, version: string): string | undefined {
    let latestKey: string | undefined;
    let latestDate: Date | undefined;

    for (const [key, entry] of this.registry) {
      if (entry.metadata.name === name &&
          entry.metadata.namespace === namespace &&
          entry.metadata.version === version) {
        if (!latestDate || entry.metadata.registeredAt > latestDate) {
          latestDate = entry.metadata.registeredAt;
          latestKey = key;
        }
      }
    }

    return latestKey;
  }

  /**
   * Finds the latest version of a component
   * @param name - Component name
   * @param namespace - Component namespace
   * @returns Registry key of latest version or undefined
   */
  private findLatestVersion(name: string, namespace: string): string | undefined {
    let latestKey: string | undefined;
    let latestDate: Date | undefined;

    for (const [key, entry] of this.registry) {
      if (entry.metadata.name === name &&
          entry.metadata.namespace === namespace) {
        if (!latestDate || entry.metadata.registeredAt > latestDate) {
          latestDate = entry.metadata.registeredAt;
          latestKey = key;
        }
      }
    }

    return latestKey;
  }

  /**
   * Evicts the least recently used component
   */
  private evictLRU(): void {
    let lruKey: string | undefined;
    let lruTime: Date | undefined;

    for (const [key, entry] of this.registry) {
      // Skip components with active references
      if (entry.refCount > 0) continue;

      if (!lruTime || entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.registry.delete(lruKey);
    }
  }

  /**
   * Starts the automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = resourceManager.setInterval(
      this.registryId,
      () => {
        this.cleanup();
      },
      this.config.cleanupInterval,
      { purpose: 'component-registry-cleanup' }
    );
  }

  /**
   * Stops the automatic cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      resourceManager.clearInterval(this.registryId, this.cleanupTimer as number);
      this.cleanupTimer = undefined;
    }
  }
}