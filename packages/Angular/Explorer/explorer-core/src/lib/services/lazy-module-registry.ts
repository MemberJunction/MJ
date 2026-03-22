import { Injectable } from '@angular/core';

/**
 * Registry that maps resource type strings to dynamic import() loaders.
 * When ResourceContainerComponent cannot find a resource type in ClassFactory,
 * it asks this registry to lazy-load the chunk containing that resource type.
 */
@Injectable({ providedIn: 'root' })
export class LazyModuleRegistry {
  private registry = new Map<string, () => Promise<void>>();
  private loadedChunks = new Set<string>();
  private pendingLoads = new Map<string, Promise<void>>();

  /**
   * Register a single resource type with its loader function.
   */
  Register(resourceType: string, loader: () => Promise<void>): void {
    this.registry.set(resourceType, loader);
  }

  /**
   * Register multiple resource types at once.
   */
  RegisterBulk(mappings: Record<string, () => Promise<void>>): void {
    for (const [resourceType, loader] of Object.entries(mappings)) {
      this.registry.set(resourceType, loader);
    }
  }

  /**
   * Attempt to lazy-load the chunk for a given resource type.
   * Returns true if the resource type was found in the registry and loaded.
   * Deduplicates concurrent loads of the same chunk.
   */
  async Load(resourceType: string): Promise<boolean> {
    const loader = this.registry.get(resourceType);
    if (!loader) return false;

    // Use the loader function's string representation as chunk key for deduplication
    const chunkKey = loader.toString();

    if (this.loadedChunks.has(chunkKey)) return true;

    // Deduplicate concurrent loads
    const pending = this.pendingLoads.get(chunkKey);
    if (pending) {
      await pending;
      return true;
    }

    const loadPromise = loader().then(() => {
      this.loadedChunks.add(chunkKey);
      this.pendingLoads.delete(chunkKey);
    });

    this.pendingLoads.set(chunkKey, loadPromise);
    await loadPromise;
    return true;
  }
}
