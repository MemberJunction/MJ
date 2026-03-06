import { ComponentRef, ApplicationRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

/**
 * Metadata about a cached component
 */
export interface CachedComponentInfo {
  // The Angular component reference
  componentRef: ComponentRef<BaseResourceComponent>;

  // The wrapper DOM element (for detaching/reattaching)
  wrapperElement: HTMLElement;

  // Resource identity (for matching)
  resourceType: string;
  resourceRecordId: string;
  applicationId: string;

  // Usage tracking
  isAttached: boolean;        // Currently attached to a tab?
  attachedToTabId: string | null;  // Which tab is it attached to?

  // Lifecycle tracking
  lastUsed: Date;
  createdAt: Date;

  // Resource data snapshot (for comparison)
  resourceData: ResourceData;
}

/**
 * Smart component cache manager that preserves component state across tab switches.
 *
 * Features:
 * - Caches components by resource identity (not just tab ID)
 * - Tracks component usage to prevent double-attachment
 * - Detaches/reattaches DOM elements without destroying Angular components
 * - Provides manual cache clearing (no automatic periodic cleanup)
 */
export class ComponentCacheManager {
  private cache = new Map<string, CachedComponentInfo>();

  constructor(private appRef: ApplicationRef) {}

  /**
   * Generate a unique cache key from resource identity
   */
  private getCacheKey(resourceType: string, recordId: string, appId: string): string {
    // Normalize empty/null recordId to ensure consistent matching
    const normalizedRecordId = recordId || '__no_record__';
    return `${appId}::${resourceType}::${normalizedRecordId}`;
  }

  /**
   * Check if a component exists in cache and is available for reuse
   */
  hasAvailableComponent(resourceType: string, recordId: string, appId: string): boolean {
    const key = this.getCacheKey(resourceType, recordId, appId);
    const info = this.cache.get(key);
    return info !== undefined && !info.isAttached;
  }

  /**
   * Get a cached component if available (not currently attached)
   */
  getCachedComponent(resourceType: string, recordId: string, appId: string): CachedComponentInfo | null {
    const key = this.getCacheKey(resourceType, recordId, appId);
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

  /**
   * Store a component in the cache
   */
  cacheComponent(
    componentRef: ComponentRef<BaseResourceComponent>,
    wrapperElement: HTMLElement,
    resourceData: ResourceData,
    tabId: string
  ): void {
    const key = this.getCacheKey(
      resourceData.ResourceType,
      resourceData.ResourceRecordID || '',
      resourceData.Configuration?.applicationId || ''
    );

    const info: CachedComponentInfo = {
      componentRef,
      wrapperElement,
      resourceType: resourceData.ResourceType,
      resourceRecordId: resourceData.ResourceRecordID || '',
      applicationId: resourceData.Configuration?.applicationId || '',
      isAttached: true,
      attachedToTabId: tabId,
      lastUsed: new Date(),
      createdAt: new Date(),
      resourceData
    };

    this.cache.set(key, info);
  }

  /**
   * Mark a component as attached to a tab
   */
  markAsAttached(resourceType: string, recordId: string, appId: string, tabId: string): void {
    const key = this.getCacheKey(resourceType, recordId, appId);
    const info = this.cache.get(key);

    if (info) {
      info.isAttached = true;
      info.attachedToTabId = tabId;
      info.lastUsed = new Date();
    }
  }

  /**
   * Mark a component as detached (available for reuse)
   */
  markAsDetached(tabId: string): CachedComponentInfo | null {
    // Find component by tab ID
    const entry = Array.from(this.cache.entries())
      .find(([_, info]) => info.attachedToTabId === tabId);

    if (!entry) {
      return null;
    }

    const [key, info] = entry;
    info.isAttached = false;
    info.attachedToTabId = null;
    info.lastUsed = new Date();

    return info;
  }

  /**
   * Get component info by tab ID (for finding what's attached to a tab)
   */
  getComponentByTabId(tabId: string): CachedComponentInfo | null {
    const entry = Array.from(this.cache.entries())
      .find(([_, info]) => info.attachedToTabId === tabId);

    return entry ? entry[1] : null;
  }

  /**
   * Remove and destroy a specific component from cache
   */
  destroyComponent(resourceType: string, recordId: string, appId: string): void {
    const key = this.getCacheKey(resourceType, recordId, appId);
    const info = this.cache.get(key);

    if (!info) {
      return;
    }

    // Destroy Angular component
    this.appRef.detachView(info.componentRef.hostView);
    info.componentRef.destroy();

    // Remove from cache
    this.cache.delete(key);

  }

  /**
   * Remove and destroy component by tab ID
   */
  destroyComponentByTabId(tabId: string): void {
    const entry = Array.from(this.cache.entries())
      .find(([_, info]) => info.attachedToTabId === tabId);

    if (!entry) {
      return;
    }

    const [key, info] = entry;

    // Destroy Angular component
    this.appRef.detachView(info.componentRef.hostView);
    info.componentRef.destroy();

    // Remove from cache
    this.cache.delete(key);

  }

  /**
   * Clear the entire cache, destroying all components
   * Call this manually when needed (e.g., user logout, app shutdown)
   */
  clearCache(): void {

    // Destroy all components
    this.cache.forEach(info => {
      this.appRef.detachView(info.componentRef.hostView);
      info.componentRef.destroy();
    });

    // Clear the map
    this.cache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): {
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
}
