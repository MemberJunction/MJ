import { BaseEngine, BaseEnginePropertyConfig, EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { MJViewTypeEntity } from '@memberjunction/core-entities';
import { BaseViewTypeDescriptor, IViewTypeDescriptor } from './view-type.contracts';

/**
 * ViewTypeEngine
 * --------------
 * Loads the `MJ: View Types` metadata rows (active, ordered by Sequence) and, given an
 * `EntityInfo`, returns the list of view-type descriptors that are AVAILABLE for that
 * entity.
 *
 * "Available" means two things both hold:
 *   1. The view type is active and seeded in `MJ: View Types`.
 *   2. A descriptor is registered with the ClassFactory under the row's `DriverClass`
 *      AND that descriptor's `IsAvailableFor(entity)` predicate returns true.
 *
 * This is intentionally Angular-free — it depends only on `@memberjunction/core`,
 * `@memberjunction/global`, and `@memberjunction/core-entities` so it can run anywhere.
 * It extends {@link BaseEngine} for automatic caching + entity-event auto-refresh.
 */
export class ViewTypeEngine extends BaseEngine<ViewTypeEngine> {
  /**
   * Returns the global singleton instance. Do not construct directly.
   */
  public static get Instance(): ViewTypeEngine {
    return super.getInstance<ViewTypeEngine>();
  }

  private _viewTypes: MJViewTypeEntity[] = [];

  /**
   * Loads the view-type metadata. Cheap to call repeatedly — a no-op once loaded
   * (unless `forceRefresh`). Callers should `await ViewTypeEngine.Instance.Config(...)`
   * at entry before reading {@link ViewTypes} or calling {@link GetAvailableViewTypes}.
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const c: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'MJ: View Types',
        PropertyName: '_viewTypes',
        Filter: 'IsActive = 1',
        OrderBy: 'Sequence ASC',
        CacheLocal: true
      }
    ];
    await this.Load(c, provider ?? Metadata.Provider, forceRefresh, contextUser);
  }

  /** All active view-type metadata rows, ordered by Sequence. */
  public get ViewTypes(): MJViewTypeEntity[] {
    return this._viewTypes;
  }

  /**
   * Resolve a single descriptor instance from a `DriverClass` name via the ClassFactory.
   * Returns null when no descriptor is registered under that key (e.g. Cluster / Tag Cloud,
   * whose renderer plugins are out of scope for this round).
   */
  public GetDescriptor(driverClass: string): BaseViewTypeDescriptor | null {
    if (!driverClass) {
      return null;
    }
    return MJGlobal.Instance.ClassFactory.CreateInstance<BaseViewTypeDescriptor>(
      BaseViewTypeDescriptor,
      driverClass
    );
  }

  /**
   * Returns the descriptors that are available for the given entity, in metadata
   * Sequence order. For each active `MJ: View Types` row we resolve its `DriverClass`
   * descriptor from the ClassFactory and keep it only when `IsAvailableFor(entity)` is true.
   *
   * Rows whose `DriverClass` has no registered descriptor (e.g. Cluster, Tag Cloud this
   * round) are silently skipped — so seeding metadata for a not-yet-implemented view type
   * is harmless.
   *
   * @param entity the entity the viewer is displaying
   * @param provider optional metadata provider (multi-provider scenarios)
   */
  public GetAvailableViewTypes(entity: EntityInfo, provider?: IMetadataProvider): IViewTypeDescriptor[] {
    if (!entity) {
      return [];
    }

    return this.GetAvailableViewTypeRows(entity, provider).map(r => r.Descriptor);
  }

  /**
   * Like {@link GetAvailableViewTypes} but returns each available view type's metadata
   * row paired with its resolved descriptor — so callers that need the `MJ: View Types`
   * row ID (for `UserView.ViewTypeID` persistence and per-view-type config keying) get
   * both without a second lookup.
   *
   * @param entity the entity the viewer is displaying
   * @param provider optional metadata provider (multi-provider scenarios)
   */
  public GetAvailableViewTypeRows(
    entity: EntityInfo,
    provider?: IMetadataProvider
  ): Array<{ ViewType: MJViewTypeEntity; Descriptor: IViewTypeDescriptor }> {
    if (!entity) {
      return [];
    }

    const result: Array<{ ViewType: MJViewTypeEntity; Descriptor: IViewTypeDescriptor }> = [];
    for (const row of this._viewTypes) {
      const descriptor = this.GetDescriptor(row.DriverClass);
      if (descriptor && descriptor.IsAvailableFor(entity, provider)) {
        result.push({ ViewType: row, Descriptor: descriptor });
      }
    }
    return result;
  }

  /**
   * Awaits each registered descriptor's optional {@link IViewTypeDescriptor.EnsureAvailabilityData}
   * hook so synchronous {@link GetAvailableViewTypeRows} predicates can read from now-populated
   * caches (e.g. the Cluster view type preloading which entities have Entity Documents). Each
   * DriverClass is prepared at most once; a descriptor whose hook throws simply stays unavailable.
   *
   * @param provider optional metadata provider (multi-provider scenarios)
   */
  public async EnsureAvailabilityData(provider?: IMetadataProvider): Promise<void> {
    const prepared = new Set<string>();
    await Promise.all(
      this._viewTypes.map(async row => {
        if (prepared.has(row.DriverClass)) {
          return;
        }
        prepared.add(row.DriverClass);
        const descriptor = this.GetDescriptor(row.DriverClass);
        if (descriptor) {
          try {
            await descriptor.EnsureAvailabilityData(provider);
          } catch {
            // Availability data failed to load — the descriptor's predicate stays false.
          }
        }
      })
    );
  }
}
