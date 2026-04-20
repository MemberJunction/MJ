import { Injectable } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';

/**
 * Registry that maps compound keys (BaseClassName::Key) to dynamic import() loaders.
 *
 * Wired to ClassFactory via `WireToClassFactory()` so that any `GetRegistrationAsync()`
 * or `CreateInstanceAsync()` call that misses synchronously will automatically trigger
 * the correct lazy chunk load. This replaces the previous pattern where individual
 * components (ResourceContainerComponent, TabContainerComponent, etc.) each had their
 * own retry logic.
 */
@Injectable({ providedIn: 'root' })
export class LazyModuleRegistry {
  private registry = new Map<string, () => Promise<void>>();
  private loadedChunks = new Set<string>();
  private pendingLoads = new Map<string, Promise<void>>();

  /**
   * Register a single compound key with its loader function.
   * @param compoundKey Format: "BaseClassName::Key" (e.g., "BaseResourceComponent::HomeDashboard")
   * @param loader Dynamic import function that loads the chunk containing the class
   */
  Register(compoundKey: string, loader: () => Promise<void>): void {
    this.registry.set(compoundKey, loader);
  }

  /**
   * Register multiple compound keys at once (from the generated LAZY_FEATURE_CONFIG).
   */
  RegisterBulk(mappings: Record<string, () => Promise<void>>): void {
    for (const [compoundKey, loader] of Object.entries(mappings)) {
      this.registry.set(compoundKey, loader);
    }
  }

  /**
   * Wires this registry to ClassFactory as a lazy loader.
   * After calling this, any `ClassFactory.GetRegistrationAsync()` or `CreateInstanceAsync()`
   * that fails to find a registration synchronously will call back into this registry
   * with the compound key (baseClassName::key) to trigger lazy loading.
   */
  WireToClassFactory(): void {
    MJGlobal.Instance.ClassFactory.RegisterLazyLoader(
      (baseClassName: string, key: string) => this.Load(`${baseClassName}::${key}`)
    );
  }

  /**
   * Attempt to lazy-load the chunk for a given compound key.
   * Returns true if the key was found in the registry and loaded.
   * Deduplicates concurrent loads of the same chunk.
   *
   * @param compoundKey Format: "BaseClassName::Key" (e.g., "BaseResourceComponent::HomeDashboard")
   */
  async Load(compoundKey: string): Promise<boolean> {
    const loader = this.registry.get(compoundKey);
    if (!loader) return false;

    // Use the loader function's string representation as chunk key for deduplication
    // (multiple compound keys can share the same loader/chunk)
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
