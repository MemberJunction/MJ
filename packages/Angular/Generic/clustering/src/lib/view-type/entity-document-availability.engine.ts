import { BaseEngine, BaseEnginePropertyConfig, EntityInfo, IMetadataProvider, Metadata, UserInfo, RunView } from '@memberjunction/core';
import { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';

/**
 * EntityDocumentAvailabilityEngine
 * --------------------------------
 * A tiny, browser-safe cache that answers one synchronous question for the
 * {@link ClusterViewType} availability predicate: *does this entity actually have vectors we
 * can cluster?* — meaning it has an active `MJ: Entity Documents` definition **and** at least
 * one populated `MJ: Entity Record Documents` row (vectorized record). An entity that has an
 * Entity Document configured but no records vectorized yet is NOT clusterable, so the Cluster
 * view type must not be offered for it.
 *
 * The descriptor's `IsAvailableFor` must be synchronous, but the answer depends on data — so the
 * descriptor's async `EnsureAvailabilityData` hook calls {@link Config} (awaited once before the
 * predicates run), and `IsAvailableFor` then reads the populated cache via
 * {@link HasVectorsForEntity}.
 *
 * Extends {@link BaseEngine} for caching + entity-event auto-refresh, and honors the per-request
 * provider (multi-provider safe).
 */
export class EntityDocumentAvailabilityEngine extends BaseEngine<EntityDocumentAvailabilityEngine> {
  /** The global singleton instance. Do not construct directly. */
  public static get Instance(): EntityDocumentAvailabilityEngine {
    return super.getInstance<EntityDocumentAvailabilityEngine>();
  }

  private _entityDocuments: MJEntityDocumentEntity[] = [];
  /** Normalized entity IDs that have ≥1 populated vector record. */
  private _entityIDsWithVectors = new Set<string>();
  private _vectorPresenceLoaded = false;
  /**
   * In-flight vector-presence probe, shared by all concurrent {@link Config} callers so they
   * await the SAME load instead of each kicking off (or short-circuiting past) a partial one.
   * Cleared when the probe settles. This is the linchpin of the fix for the Cluster view-type
   * race: the switcher's availability hook and the renderer's `resolveEntityDocumentID` both
   * call `Config` near-simultaneously on first open.
   */
  private _vectorPresenceInFlight: Promise<void> | null = null;

  /**
   * Loads the active Entity Documents and then probes which of their entities actually have
   * populated vectors. Cheap to call repeatedly — the Entity Documents load is cached by
   * BaseEngine, and the vector-presence probe runs once (until `forceRefresh`).
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const c: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'MJ: Entity Documents',
        PropertyName: '_entityDocuments',
        Filter: "Status = 'Active'",
        CacheLocal: true,
      },
    ];
    await this.Load(c, provider ?? Metadata.Provider, forceRefresh, contextUser);

    await this.ensureVectorPresence(forceRefresh ?? false, provider, contextUser);
  }

  /**
   * Ensure the vector-presence cache is populated exactly once (or re-populated on
   * `forceRefresh`), de-duplicating concurrent callers via {@link _vectorPresenceInFlight}.
   *
   * CRITICAL: `_vectorPresenceLoaded` is flipped to `true` only AFTER the probe resolves and
   * the result set is swapped in — never before the `await`. The previous implementation set
   * the flag at the top of `loadVectorPresence`, so a second concurrent `Config` saw "loaded"
   * while the set was still empty and returned an availability answer of "no vectors" — exactly
   * the flip-flop / "nothing shown then no-vectors" symptom on first Cluster open.
   */
  private async ensureVectorPresence(
    forceRefresh: boolean,
    provider?: IMetadataProvider,
    contextUser?: UserInfo,
  ): Promise<void> {
    if (forceRefresh) {
      this._vectorPresenceLoaded = false;
      this._vectorPresenceInFlight = null;
    }
    if (this._vectorPresenceLoaded) {
      return;
    }
    if (!this._vectorPresenceInFlight) {
      this._vectorPresenceInFlight = this.loadVectorPresence(provider, contextUser)
        .then((populated) => {
          this._entityIDsWithVectors = populated;
          this._vectorPresenceLoaded = true;
        })
        .finally(() => {
          this._vectorPresenceInFlight = null;
        });
    }
    await this._vectorPresenceInFlight;
  }

  /**
   * Determine, per active Entity Document, whether it has at least one populated vector record,
   * and return the set of owning entity IDs. Uses a single batched {@link RunView.RunViews} with
   * `MaxRows: 1` per document so it's a lightweight existence probe, not a full fetch. Returns a
   * fresh set that the caller swaps in atomically once fully populated (see {@link ensureVectorPresence}).
   */
  private async loadVectorPresence(provider?: IMetadataProvider, contextUser?: UserInfo): Promise<Set<string>> {
    const entityIDsWithVectors = new Set<string>();

    const docs = this._entityDocuments;
    if (docs.length === 0) {
      return entityIDsWithVectors;
    }

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const results = await rv.RunViews(
      docs.map((d) => ({
        EntityName: 'MJ: Entity Record Documents',
        ExtraFilter: `EntityDocumentID = '${d.ID}' AND VectorJSON IS NOT NULL`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple' as const,
      })),
      contextUser,
    );

    results.forEach((res, i) => {
      if (res?.Success && (res.Results?.length ?? 0) > 0) {
        entityIDsWithVectors.add(NormalizeUUID(docs[i].EntityID));
      }
    });

    return entityIDsWithVectors;
  }

  /** All cached active Entity Document rows. */
  public get EntityDocuments(): MJEntityDocumentEntity[] {
    return this._entityDocuments;
  }

  /**
   * Return the active Entity Document rows for a given entity, matched by EntityID
   * (case-insensitive UUID comparison). Used by the Cluster view-type renderer to
   * resolve a **deterministic** source document for the entity's vectors — picking
   * the first active doc explicitly rather than letting the server choose one
   * non-deterministically.
   *
   * @param entity The entity to find active documents for.
   * @returns The active Entity Document rows for that entity (possibly empty).
   */
  public GetActiveEntityDocumentsForEntity(entity: EntityInfo | null): MJEntityDocumentEntity[] {
    if (!entity) {
      return [];
    }
    const target = NormalizeUUID(entity.ID);
    return this._entityDocuments.filter((d) => NormalizeUUID(d.EntityID) === target);
  }

  /**
   * True only when the entity has an active Entity Document **and** at least one populated vector
   * record — i.e. it can actually be clustered. Returns false for entities that have an Entity
   * Document configured but no vectorized records yet. UUID matching is case-insensitive.
   */
  public HasVectorsForEntity(entity: EntityInfo | null): boolean {
    if (!entity) {
      return false;
    }
    return this._entityIDsWithVectors.has(NormalizeUUID(entity.ID));
  }
}
