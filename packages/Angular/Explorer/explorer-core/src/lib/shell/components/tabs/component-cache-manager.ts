import { ComponentRef, ApplicationRef } from '@angular/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

/**
 * Metadata about a cached component
 */
export interface CachedComponentInfo {
  // The Angular component reference
  componentRef: ComponentRef<BaseResourceComponent>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // The wrapper DOM element (for detaching/reattaching)
  wrapperElement: HTMLElement;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Resource identity (the ONLY key used for cache operations)
  resourceType: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  resourceRecordId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  applicationId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Optional tiebreaker used when recordId is empty (e.g., "new record" tabs for
  // different entities all have recordId='' but must NOT share a cache entry).
  // For entity-record resources this is the entity name; null/undefined for
  // resource types that don't need disambiguation.
  keyDiscriminator?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Usage tracking
  isAttached: boolean;        // Currently attached to a tab/container? — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  attachedToTabId: string | null;  // Which tab is it attached to? (metadata only, NOT used for lookup) — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Lifecycle tracking
  lastUsed: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  createdAt: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Resource data snapshot (for comparison)
  resourceData: ResourceData;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Saved query params from the tab config at detach time.
  // Restored to the tab config when the component is reattached,
  // so the URL reflects the component's preserved state.
  savedQueryParams?: Record<string, string>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Agent context reported by this component via NavigationService.SetAgentContext()
  // Cached so it can be restored when the component becomes active again.
  AgentContext?: Record<string, unknown>;

  // Agent client tools registered by this component via NavigationService.SetAgentClientTools()
  // Cached so they can be re-registered when the component becomes active again.
  AgentClientTools?: { Name: string; Description: string; ParameterSchema: Record<string, unknown>; Handler: (params: Record<string, unknown>) => Promise<unknown> }[];
}

/**
 * Smart component cache manager that preserves component state across tab switches.
 *
 * ALL cache operations use a consistent identity key: `appId::resourceType::recordId`.
 * This key is the same regardless of whether the component is in Golden Layout (tabbed)
 * mode or Single Resource mode, ensuring components are reusable across both modes.
 *
 * The `attachedToTabId` field is metadata for debugging/display — it is NEVER used
 * as a lookup key. This prevents bugs where multiple resources sharing the same tab ID
 * (e.g., nav items within a single-resource app) interfere with each other's cache state.
 *
 * Features:
 * - Caches components by resource identity (appId + resourceType + recordId)
 * - Tracks component usage to prevent double-attachment
 * - Detaches/reattaches DOM elements without destroying Angular components
 * - LRU eviction when detached component count exceeds MaxDetachedComponents
 */
export class ComponentCacheManager {
  private cache = new Map<string, CachedComponentInfo>();

  /**
   * Maximum number of detached (not currently visible) components to keep
   * cached.  When exceeded, least-recently-used detached components are
   * evicted.  Set to 0 to disable eviction (legacy behavior).  Default: 20.
   */
  public static MaxDetachedComponents: number = 20;

  /**
   * @param navigationService Optional — when provided, the cache manager keeps the AI agent's live
   *   client-tool set in sync with the attached surface: it replays a reattached component's tools
   *   ({@link NavigationService.NotifyResourceReattached}) and clears them on detach
   *   ({@link NavigationService.NotifyResourceDetached}), since cached components don't re-run
   *   `ngAfterViewInit`. Centralizing it here covers BOTH single-resource and Golden Layout paths.
   */
  constructor(private appRef: ApplicationRef, private navigationService?: NavigationService) {}

  /**
   * Generate a unique cache key from resource identity.
   * This is the ONE canonical key format used by ALL cache operations.
   *
   * `discriminator` is appended into the recordId slot when the recordId alone does not
   * identify the resource:
   * - **Empty recordId** — distinct "new record" tabs, e.g. a new MJ:Companies form and a new
   *   MJ:Employees form, would otherwise both cache at `appId::RecordResource::__no_record__`
   *   and clobber each other.
   * - **The `'dynamic'` view marker** — `NavigationService.OpenDynamicView` stamps every
   *   dynamic view with that same recordId, so without the entity every dynamic view in an app
   *   shares one key. A reload from `#Accounts` to `#Contacts` would then get a cache hit on the
   *   Accounts component, which never has its `Data` rebound, so the tab keeps showing Accounts
   *   and the tab-container's entity check fires again on every emission.
   *
   * Passing the entity name as discriminator keeps them separate. Whatever the tab-container's
   * reload check compares has to be part of this key, or a reload is handed back the component
   * it just detached.
   */
  private getCacheKey(resourceType: string, recordId: string, appId: string, discriminator?: string): string {
    let normalizedRecordId: string;
    if (!recordId) {
      normalizedRecordId = discriminator ? `__new__::${discriminator}` : '__no_record__';
    } else if (discriminator && ComponentCacheManager.IsDynamicViewMarker(recordId)) {
      normalizedRecordId = `dynamic::${discriminator}`;
    } else {
      normalizedRecordId = recordId;
    }
    return `${appId}::${resourceType}::${normalizedRecordId}`;
  }

  /**
   * Whether a recordId is the `'dynamic'` marker `NavigationService.OpenDynamicView` stamps on a
   * dynamic view, which is not a saved-view ID. Matched the way `ViewResourceComponent` matches it
   * (trimmed, case-insensitive), so the cache and the view agree on what counts as dynamic.
   */
  public static IsDynamicViewMarker(recordId: string | null | undefined): boolean {
    return typeof recordId === 'string' && recordId.trim().toLowerCase() === 'dynamic';
  }

  /**
   * Check if a component exists in cache and is available for reuse.
   */
  HasAvailableComponent(resourceType: string, recordId: string, appId: string, discriminator?: string): boolean {
    const key = this.getCacheKey(resourceType, recordId, appId, discriminator);
    const info = this.cache.get(key);
    return info !== undefined && !info.isAttached;
  }

  /** @deprecated Use {@link HasAvailableComponent}. */
  hasAvailableComponent(resourceType: string, recordId: string, appId: string, discriminator?: string): boolean {
    return this.HasAvailableComponent(resourceType, recordId, appId, discriminator);
  }

  /**
   * Get a cached component if available (not currently attached).
   * Lookup is by resource identity, not tab ID.
   */
  GetCachedComponent(resourceType: string, recordId: string, appId: string, discriminator?: string): CachedComponentInfo | null {
    const key = this.getCacheKey(resourceType, recordId, appId, discriminator);
    const info = this.cache.get(key);

    if (!info) {
      return null;
    }

    // Can only reuse if not currently attached elsewhere
    if (info.isAttached) {
      return null;
    }

    return info;
  }

  /** @deprecated Use {@link GetCachedComponent}. */
  getCachedComponent(resourceType: string, recordId: string, appId: string, discriminator?: string): CachedComponentInfo | null {
    return this.GetCachedComponent(resourceType, recordId, appId, discriminator);
  }

  /**
   * Store a component in the cache and mark as attached.
   */
  CacheComponent(
    componentRef: ComponentRef<BaseResourceComponent>,
    wrapperElement: HTMLElement,
    resourceData: ResourceData,
    tabId: string
  ): void {
    // Use driverClass (the actual component class name) as the resourceType for the cache key,
    // NOT resourceData.ResourceType (which is often just "Custom" for dashboard resources).
    // This must match the lookup key used in getCachedComponent/markAsAttached/markAsDetached.
    const resolvedResourceType = resourceData.Configuration?.resourceTypeDriverClass
      || resourceData.Configuration?.driverClass
      || resourceData.ResourceType;
    // Entity name discriminates between distinct "new record" tabs (empty recordId).
    // For non-Records resource types this is undefined, leaving the key unchanged.
    const discriminator = resourceData.Configuration?.Entity as string | undefined;
    const key = this.getCacheKey(
      resolvedResourceType,
      resourceData.ResourceRecordID || '',
      resourceData.Configuration?.applicationId || '',
      discriminator
    );

    const info: CachedComponentInfo = {
      componentRef,
      wrapperElement,
      resourceType: resolvedResourceType,
      resourceRecordId: resourceData.ResourceRecordID || '',
      applicationId: resourceData.Configuration?.applicationId || '',
      keyDiscriminator: discriminator,
      isAttached: true,
      attachedToTabId: tabId,
      lastUsed: new Date(),
      createdAt: new Date(),
      resourceData
    };

    this.cache.set(key, info);
  }

  /** @deprecated Use {@link CacheComponent}. */
  cacheComponent(
    componentRef: ComponentRef<BaseResourceComponent>,
    wrapperElement: HTMLElement,
    resourceData: ResourceData,
    tabId: string
  ): void {
    return this.CacheComponent(componentRef, wrapperElement, resourceData, tabId);
  }

  /**
   * Mark a component as attached. Lookup by resource identity.
   */
  MarkAsAttached(resourceType: string, recordId: string, appId: string, tabId: string, discriminator?: string): void {
    const key = this.getCacheKey(resourceType, recordId, appId, discriminator);
    const info = this.cache.get(key);

    if (info) {
      info.isAttached = true;
      info.attachedToTabId = tabId;
      info.lastUsed = new Date();
      // Replay this surface's agent client tools to the AI agent on reattach (cached components keep
      // their instance but never re-run ngAfterViewInit, so they don't re-register on their own).
      this.navigationService?.NotifyResourceReattached(info.componentRef.instance);
    }
  }

  /** @deprecated Use {@link MarkAsAttached}. */
  markAsAttached(resourceType: string, recordId: string, appId: string, tabId: string, discriminator?: string): void {
    return this.MarkAsAttached(resourceType, recordId, appId, tabId, discriminator);
  }

  /**
   * Mark a component as detached (available for reuse). Lookup by resource identity.
   *
   * This is the ONLY way to detach a component. Both single-resource mode and
   * Golden Layout mode use this same method to ensure consistent cache behavior.
   */
  MarkAsDetached(resourceType: string, recordId: string, appId: string, discriminator?: string): CachedComponentInfo | null {
    const key = this.getCacheKey(resourceType, recordId, appId, discriminator);
    const info = this.cache.get(key);
    if (!info) return null;

    info.isAttached = false;
    info.attachedToTabId = null;
    info.lastUsed = new Date();
    // Clear this surface's agent client tools on detach so the previous app's tools aren't offered to
    // the AI agent on the next surface. NotifyResourceReattached replays them if the user returns.
    this.navigationService?.NotifyResourceDetached(info.componentRef.instance);
    this.evictIfNeeded();
    return info;
  }

  /** @deprecated Use {@link MarkAsDetached}. */
  markAsDetached(resourceType: string, recordId: string, appId: string, discriminator?: string): CachedComponentInfo | null {
    return this.MarkAsDetached(resourceType, recordId, appId, discriminator);
  }

  /**
   * Re-key a cached component when its underlying record identity changes.
   *
   * Used when a "new record" component (cached at `recordId = ''`) becomes a saved record
   * (now identified by its new PK). Without re-keying, the next "new record" request would
   * still resolve to this same cache entry, surfacing the previously-saved record on a form
   * the user expects to be blank.
   *
   * Preserves the live component instance — only the cache key + stored identity change.
   * Returns true if a matching entry was found and re-keyed, false otherwise.
   */
  RekeyComponent(
    resourceType: string,
    oldRecordId: string,
    newRecordId: string,
    appId: string,
    oldDiscriminator?: string,
    newDiscriminator?: string
  ): boolean {
    const oldKey = this.getCacheKey(resourceType, oldRecordId, appId, oldDiscriminator);
    const info = this.cache.get(oldKey);
    if (!info) {
      return false;
    }

    // Once a record has a real id, the discriminator no longer matters (the id is unique).
    // Default the new discriminator to undefined unless explicitly provided.
    const newKey = this.getCacheKey(resourceType, newRecordId, appId, newDiscriminator);
    if (oldKey === newKey) {
      return false;
    }

    info.resourceRecordId = newRecordId;
    info.keyDiscriminator = newDiscriminator;
    info.lastUsed = new Date();
    if (info.resourceData) {
      info.resourceData.ResourceRecordID = newRecordId;
    }

    this.cache.delete(oldKey);
    this.cache.set(newKey, info);
    return true;
  }

  /** @deprecated Use {@link RekeyComponent}. */
  rekeyComponent(
    resourceType: string,
    oldRecordId: string,
    newRecordId: string,
    appId: string,
    oldDiscriminator?: string,
    newDiscriminator?: string
  ): boolean {
    return this.RekeyComponent(resourceType, oldRecordId, newRecordId, appId, oldDiscriminator, newDiscriminator);
  }

  /**
   * Find a cached component by tab ID and detach it.
   * This is a convenience wrapper for callers that only know the tab ID
   * (e.g., Golden Layout tab close events). It resolves the tab ID to
   * resource identity, then delegates to the identity-based markAsDetached.
   */
  FindAndDetachByTabId(tabId: string): CachedComponentInfo | null {
    const entry = Array.from(this.cache.entries())
      .find(([_, info]) => info.attachedToTabId === tabId);

    if (!entry) return null;

    const [_, info] = entry;
    return this.MarkAsDetached(info.resourceType, info.resourceRecordId, info.applicationId, info.keyDiscriminator);
  }

  /** @deprecated Use {@link FindAndDetachByTabId}. */
  findAndDetachByTabId(tabId: string): CachedComponentInfo | null {
    return this.FindAndDetachByTabId(tabId);
  }

  /**
   * Evict least-recently-used detached components when over the limit.
   * Only evicts components that are not currently attached.
   */
  private evictIfNeeded(): void {
    if (ComponentCacheManager.MaxDetachedComponents <= 0) return;

    const detached = Array.from(this.cache.entries())
      .filter(([_, info]) => !info.isAttached)
      .sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime());

    while (detached.length > ComponentCacheManager.MaxDetachedComponents) {
      const [key, info] = detached.shift()!;
      // Drop the destroyed component's cached agent tools so the registry doesn't retain a dead ref.
      this.navigationService?.ForgetResource(info.componentRef.instance);
      this.appRef.detachView(info.componentRef.hostView);
      info.componentRef.destroy();
      this.cache.delete(key);
    }
  }

  /**
   * Get component info by tab ID (for finding what's attached to a tab).
   * Uses linear scan since tabId is metadata, not a key.
   */
  GetComponentByTabId(tabId: string): CachedComponentInfo | null {
    const entry = Array.from(this.cache.entries())
      .find(([_, info]) => info.attachedToTabId === tabId);

    return entry ? entry[1] : null;
  }

  /** @deprecated Use {@link GetComponentByTabId}. */
  getComponentByTabId(tabId: string): CachedComponentInfo | null {
    return this.GetComponentByTabId(tabId);
  }

  /**
   * Remove and destroy a specific component from cache by resource identity.
   */
  DestroyComponent(resourceType: string, recordId: string, appId: string, discriminator?: string): void {
    const key = this.getCacheKey(resourceType, recordId, appId, discriminator);
    const info = this.cache.get(key);

    if (!info) return;

    this.navigationService?.ForgetResource(info.componentRef.instance);
    this.appRef.detachView(info.componentRef.hostView);
    info.componentRef.destroy();
    this.cache.delete(key);
  }

  /** @deprecated Use {@link DestroyComponent}. */
  destroyComponent(resourceType: string, recordId: string, appId: string, discriminator?: string): void {
    return this.DestroyComponent(resourceType, recordId, appId, discriminator);
  }

  /**
   * Remove and destroy component by tab ID (convenience for Golden Layout tab close).
   */
  DestroyComponentByTabId(tabId: string): void {
    const entry = Array.from(this.cache.entries())
      .find(([_, info]) => info.attachedToTabId === tabId);

    if (!entry) return;

    const [key, info] = entry;
    this.appRef.detachView(info.componentRef.hostView);
    info.componentRef.destroy();
    this.cache.delete(key);
  }

  /** @deprecated Use {@link DestroyComponentByTabId}. */
  destroyComponentByTabId(tabId: string): void {
    return this.DestroyComponentByTabId(tabId);
  }

  /**
   * Clear the entire cache, destroying all components.
   * Call this on user logout or app shutdown.
   */
  ClearCache(): void {
    this.cache.forEach(info => {
      this.appRef.detachView(info.componentRef.hostView);
      info.componentRef.destroy();
    });
    this.cache.clear();
  }

  /** @deprecated Use {@link ClearCache}. */
  clearCache(): void {
    return this.ClearCache();
  }

  /**
   * Selectively clear cached components matching a predicate.
   * Components that match are destroyed; those that don't are kept.
   *
   * Use this for tenant switching: clear org-scoped components while
   * keeping system/global components alive.
   *
   * @param predicate Return true for components that should be destroyed.
   * @returns Number of components destroyed.
   */
  ClearCacheByPredicate(predicate: (info: CachedComponentInfo) => boolean): number {
    let destroyed = 0;
    const toRemove: string[] = [];

    this.cache.forEach((info, key) => {
      if (predicate(info)) {
        this.appRef.detachView(info.componentRef.hostView);
        info.componentRef.destroy();
        toRemove.push(key);
        destroyed++;
      }
    });

    for (const key of toRemove) {
      this.cache.delete(key);
    }

    return destroyed;
  }

  /**
   * Get cache statistics for debugging.
   */
  GetCacheStats(): {
    total: number;
    attached: number;
    detached: number;
    byResourceType: Map<string, number>;
  } {
    const stats = {
      total: this.cache.size,
      attached: 0,
      detached: 0,
      byResourceType: new Map<string, number>()
    };

    this.cache.forEach(info => {
      if (info.isAttached) {
        stats.attached++;
      } else {
        stats.detached++;
      }

      const count = stats.byResourceType.get(info.resourceType) || 0;
      stats.byResourceType.set(info.resourceType, count + 1);
    });

    return stats;
  }

  /** @deprecated Use {@link GetCacheStats}. */
  getCacheStats(): {
    total: number;
    attached: number;
    detached: number;
    byResourceType: Map<string, number>;
  } {
    return this.GetCacheStats();
  }
}
