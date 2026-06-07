import { BaseEngine, BaseEnginePropertyConfig, EntityInfo, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * EntityDocumentAvailabilityEngine
 * --------------------------------
 * A tiny, browser-safe cache of the **active** `MJ: Entity Documents` rows, used to answer
 * one synchronous question: *does this entity have an Entity Document (i.e. vectors) we can
 * cluster?* — which is exactly the {@link ClusterViewType} availability predicate.
 *
 * The Cluster view-type descriptor's `IsAvailableFor` must be synchronous, but the answer
 * depends on data. So the descriptor's `EnsureAvailabilityData` hook calls {@link Config}
 * (awaited once by the host before predicates run), and `IsAvailableFor` then reads this
 * cache via {@link HasActiveDocumentForEntity}.
 *
 * Extends {@link BaseEngine} for automatic caching + entity-event auto-refresh, and honors
 * the per-request provider (multi-provider safe).
 */
export class EntityDocumentAvailabilityEngine extends BaseEngine<EntityDocumentAvailabilityEngine> {
  /** The global singleton instance. Do not construct directly. */
  public static get Instance(): EntityDocumentAvailabilityEngine {
    return super.getInstance<EntityDocumentAvailabilityEngine>();
  }

  private _entityDocuments: MJEntityDocumentEntity[] = [];

  /**
   * Loads the active Entity Documents. Cheap to call repeatedly — a no-op once loaded
   * (unless `forceRefresh`). Call before reading {@link HasActiveDocumentForEntity}.
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const c: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'MJ: Entity Documents',
        PropertyName: '_entityDocuments',
        Filter: "Status = 'Active'",
        CacheLocal: true
      }
    ];
    await this.Load(c, provider ?? Metadata.Provider, forceRefresh, contextUser);
  }

  /** All cached active Entity Document rows. */
  public get EntityDocuments(): MJEntityDocumentEntity[] {
    return this._entityDocuments;
  }

  /**
   * True when the given entity has at least one active Entity Document — i.e. it has vectors
   * and is therefore clusterable. Uses {@link UUIDsEqual} for cross-platform UUID matching.
   */
  public HasActiveDocumentForEntity(entity: EntityInfo | null): boolean {
    if (!entity) {
      return false;
    }
    return this._entityDocuments.some(d => UUIDsEqual(d.EntityID, entity.ID));
  }
}
