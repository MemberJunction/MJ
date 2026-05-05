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
    // Publish to a well-known global so introspection tools (e.g. the Admin
    // app's "Lazy Loading" inspector in ng-dashboards) can read the snapshot
    // without creating a hard package dependency on explorer-core. Dev tools only.
    (globalThis as { __mj_lazy_registry__?: LazyModuleRegistry }).__mj_lazy_registry__ = this;
  }

  /**
   * Read-only snapshot of the registry state — for diagnostic tools.
   * Groups compound keys by chunk (the underlying loader function) so
   * inspectors can show "X chunks, Y loaded" plus the keys covered by each.
   */
  GetSnapshot(): {
    registered: string[];
    loaded: string[];
    chunks: Array<{ chunkId: string; loaded: boolean; keys: string[] }>;
    chunkCount: number;
  } {
    const byChunk = new Map<string, string[]>();
    for (const [compoundKey, loader] of this.registry.entries()) {
      const id = loader.toString();
      const arr = byChunk.get(id) ?? [];
      arr.push(compoundKey);
      byChunk.set(id, arr);
    }

    const chunks = Array.from(byChunk.entries())
      .map(([chunkId, keys]) => ({
        chunkId,
        loaded: this.loadedChunks.has(chunkId),
        keys: keys.sort()
      }))
      .sort((a, b) => b.keys.length - a.keys.length);

    const loaded: string[] = [];
    for (const c of chunks) {
      if (c.loaded) loaded.push(...c.keys);
    }

    return {
      registered: Array.from(this.registry.keys()).sort(),
      loaded: loaded.sort(),
      chunks,
      chunkCount: this.loadedChunks.size
    };
  }

  /**
   * Programmatically trigger a lazy chunk load by compound key. Returns true
   * on success. Useful for dev tools that want to "preload" a chunk.
   */
  async ForceLoad(compoundKey: string): Promise<boolean> {
    return this.Load(compoundKey);
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
