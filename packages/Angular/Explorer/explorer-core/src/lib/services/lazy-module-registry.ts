import { Injectable } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';

/**
 * One lazy-loadable chunk: a stable identity plus the dynamic import that loads it.
 *
 * Many compound keys map to the same chunk, so `chunkId` is what the registry dedupes
 * loads by — it must uniquely identify the chunk. The generated LAZY_FEATURE_CONFIG
 * uses the dynamic import specifier (e.g. '@memberjunction/ng-dashboards/ai-dashboards.module').
 */
export interface LazyFeatureChunk {
  /** Stable, unique chunk identity. Also the label dev tools show for the chunk. */
  readonly chunkId: string;
  /** Imports the chunk, which runs the `@RegisterClass` decorators inside it. */
  readonly load: () => Promise<void>;
}

/** Extracts the subclass-key half of a `"BaseClassName::Key"` compound key. */
function subclassKeyOf(compoundKey: string): string {
  const separator = compoundKey.indexOf('::');
  return separator < 0 ? compoundKey : compoundKey.slice(separator + 2);
}

/**
 * Registry that maps compound keys (BaseClassName::Key) to the chunk that provides them.
 *
 * Wired to ClassFactory via `WireToClassFactory()` so that any `GetRegistrationAsync()`
 * or `CreateInstanceAsync()` call that misses synchronously will automatically trigger
 * the correct lazy chunk load. This replaces the previous pattern where individual
 * components (ResourceContainerComponent, TabContainerComponent, etc.) each had their
 * own retry logic.
 */
@Injectable({ providedIn: 'root' })
export class LazyModuleRegistry {
  private registry = new Map<string, LazyFeatureChunk>();
  /**
   * Secondary index: subclass key → (compound key → chunk), ignoring the base-class half.
   *
   * Needed because the base-class half of a compound key is NOT stable at runtime. ClassFactory
   * builds the lookup from `baseClass.name`, but the emitted identifier varies by build mode —
   * for the same `BaseResourceComponent` we have observed `_BaseResourceComponent` (unminified,
   * Angular's named class expression) and `BaseResourceComponent2` (minified, esbuild's collision
   * rename) — while the generated LAZY_FEATURE_CONFIG keys use the TypeScript source name. Any
   * mismatch made the primary lookup miss, so NO chunk was ever imported and every lazily
   * provided class silently failed to resolve.
   *
   * The inner map is keyed by compound key (not a flat Set of chunks) so that re-registering a
   * compound key replaces its contribution here too, matching `registry`'s replace semantics.
   */
  private chunksBySubclassKey = new Map<string, Map<string, LazyFeatureChunk>>();
  /** chunkIds that have finished loading. */
  private loadedChunks = new Set<string>();
  /** In-flight loads, keyed by chunkId, so concurrent callers share one import. */
  private pendingLoads = new Map<string, Promise<void>>();

  /**
   * Register a single compound key with the chunk that provides it.
   * @param compoundKey Format: "BaseClassName::Key" (e.g., "BaseResourceComponent::HomeDashboard")
   * @param chunk The chunk descriptor (stable id + dynamic import)
   */
  Register(compoundKey: string, chunk: LazyFeatureChunk): void {
    this.registry.set(compoundKey, chunk);
    const subclassKey = subclassKeyOf(compoundKey);
    const byCompoundKey = this.chunksBySubclassKey.get(subclassKey) ?? new Map<string, LazyFeatureChunk>();
    byCompoundKey.set(compoundKey, chunk);
    this.chunksBySubclassKey.set(subclassKey, byCompoundKey);
  }

  /**
   * Register multiple compound keys at once (from the generated LAZY_FEATURE_CONFIG).
   */
  RegisterBulk(mappings: Record<string, LazyFeatureChunk>): void {
    for (const [compoundKey, chunk] of Object.entries(mappings)) {
      this.Register(compoundKey, chunk);
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
   * Groups compound keys by `chunkId` so inspectors can show "X chunks, Y loaded"
   * plus the keys covered by each.
   */
  GetSnapshot(): {
    registered: string[];
    loaded: string[];
    chunks: Array<{ chunkId: string; loaded: boolean; keys: string[] }>;
    /** How many chunks have finished loading. The total is `chunks.length`. */
    loadedChunkCount: number;
  } {
    const byChunk = new Map<string, string[]>();
    for (const [compoundKey, chunk] of this.registry.entries()) {
      const arr = byChunk.get(chunk.chunkId) ?? [];
      arr.push(compoundKey);
      byChunk.set(chunk.chunkId, arr);
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
      loadedChunkCount: this.loadedChunks.size
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
    // Primary: exact compound key. Correct and precise when the runtime base-class name
    // happens to match the generated config.
    const exact = this.registry.get(compoundKey);
    if (exact) {
      await this.loadChunk(exact);
      return true;
    }

    // Fallback: match on the subclass key alone, because the base-class half is not stable
    // across build modes (see `chunksBySubclassKey`). Subclass keys are unique per chunk in
    // practice; if several chunks ever claim one, load them all so resolution can't silently
    // pick wrong — ClassFactory still decides the winner by base class afterwards.
    const candidates = this.candidateChunksFor(subclassKeyOf(compoundKey));
    if (candidates.length === 0) return false;

    // One candidate failing must not skip the rest — a later one may hold the class. Only
    // surface a failure if NOTHING loaded, so a partial failure can't mask a success.
    const errors: unknown[] = [];
    let loaded = false;
    for (const chunk of candidates) {
      try {
        await this.loadChunk(chunk);
        loaded = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (!loaded) throw errors[0];
    return true;
  }

  /**
   * The distinct chunks (by `chunkId`) registered under a subclass key, in registration order.
   */
  private candidateChunksFor(subclassKey: string): LazyFeatureChunk[] {
    const byCompoundKey = this.chunksBySubclassKey.get(subclassKey);
    if (!byCompoundKey) return [];

    const distinct = new Map<string, LazyFeatureChunk>();
    for (const chunk of byCompoundKey.values()) {
      distinct.set(chunk.chunkId, chunk);
    }
    return Array.from(distinct.values());
  }

  /**
   * Imports a chunk once, sharing in-flight loads and remembering completed ones.
   * Resolves when the chunk is loaded; rejects if the import fails.
   */
  private async loadChunk(chunk: LazyFeatureChunk): Promise<void> {
    // Dedupe on the chunk's declared id — multiple compound keys share one chunk.
    // This MUST be a value that differs between chunks; deriving it from the loader
    // function (e.g. Function.toString()) collapses every chunk into one, so the first
    // chunk loaded makes all the others look already-loaded and their classes never register.
    const chunkKey = chunk.chunkId;

    if (this.loadedChunks.has(chunkKey)) return;

    // Deduplicate concurrent loads
    const pending = this.pendingLoads.get(chunkKey);
    if (pending) {
      await pending;
      return;
    }

    const loadPromise = chunk.load().then(
      () => {
        this.loadedChunks.add(chunkKey);
        this.pendingLoads.delete(chunkKey);
      },
      (error: unknown) => {
        // Drop the failed attempt so a later navigation retries. Chunk fetches fail
        // transiently in normal use — a dev-server rebuild renames every lazy chunk, so a
        // page loaded before the rebuild 404s once. Left in `pendingLoads`, the rejected
        // promise would be re-awaited (and re-thrown) forever, killing the chunk for the
        // rest of the page session. The rejection still propagates to this caller.
        this.pendingLoads.delete(chunkKey);
        throw error;
      }
    );

    this.pendingLoads.set(chunkKey, loadPromise);
    await loadPromise;
  }
}
