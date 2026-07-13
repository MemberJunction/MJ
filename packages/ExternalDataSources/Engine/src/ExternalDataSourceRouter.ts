import { BaseSingleton, MJEventType, MJGlobal } from "@memberjunction/global";
import { BaseEntity, BaseEntityEvent, IMetadataProvider, LogError, Metadata, UserInfo } from "@memberjunction/core";
import { MJExternalDataSourceEntity, MJExternalDataSourceTypeEntity } from "@memberjunction/core-entities";
import { BaseExternalDataSourceDriver } from "./BaseExternalDataSourceDriver";

/** Entity names whose changes must invalidate the resolved-driver cache. Lower-cased for comparison. */
const EXTERNAL_DATA_SOURCE_ENTITY = 'mj: external data sources';
const EXTERNAL_DATA_SOURCE_TYPE_ENTITY = 'mj: external data source types';

/** A fully-resolved external data source: its instance row, its type row, and a live driver. */
export interface ResolvedExternalDataSource {
  dataSource: MJExternalDataSourceEntity;
  dataSourceType: MJExternalDataSourceTypeEntity;
  driver: BaseExternalDataSourceDriver;
}

/**
 * Resolves an `ExternalDataSourceID` to a ready-to-use driver.
 *
 * Responsibilities:
 *  - Load the `ExternalDataSource` instance row and its `ExternalDataSourceType`.
 *  - Validate the source is `Active` (fails fast otherwise).
 *  - Instantiate the driver via the MJ ClassFactory keyed on `Type.DriverClass`.
 *  - Cache the resolved driver per data source ID (drivers own their own pools).
 *
 * Process-wide singleton via {@link BaseSingleton} (per CLAUDE.md singleton rule).
 * Server-side only — drivers open remote connections and resolve credentials,
 * neither of which exists in the browser.
 */
export class ExternalDataSourceRouter extends BaseSingleton<ExternalDataSourceRouter> {
  // Cache the in-flight RESOLUTION promise (not the resolved value) so concurrent first-requests for
  // one data source share a single driver instead of each building its own and orphaning all but the
  // last — an orphaned driver's pools (live remote connections for SQL Server) would then leak, since
  // ClearCache only ever sees the winner. Same cold-start race fix as the per-driver connection cache.
  private driverCache = new Map<string, Promise<ResolvedExternalDataSource>>();

  // Guards one-time subscription to the entity-change event stream (see ensureCacheInvalidationSubscription).
  private cacheInvalidationSubscribed = false;

  protected constructor() {
    super();
  }

  public static get Instance(): ExternalDataSourceRouter {
    return super.getInstance<ExternalDataSourceRouter>();
  }

  /**
   * Resolve a data source ID to its driver. Pass the `provider` that owns the
   * request when running under a non-default provider (multi-provider/tenant
   * scenarios); falls back to the global default provider otherwise.
   */
  public async Resolve(
    dataSourceId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ResolvedExternalDataSource> {
    this.ensureCacheInvalidationSubscription();
    const existing = this.driverCache.get(dataSourceId);
    if (existing) {
      return existing;
    }
    const creating = this.createResolved(dataSourceId, contextUser, provider);
    this.driverCache.set(dataSourceId, creating);
    // Never cache a failed resolution — evict so the next call retries (the rejection still propagates).
    creating.catch(() => {
      if (this.driverCache.get(dataSourceId) === creating) {
        this.driverCache.delete(dataSourceId);
      }
    });
    return creating;
  }

  /** Load + validate the data source and instantiate its driver — invoked once per source by the race-safe cache. */
  private async createResolved(
    dataSourceId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ResolvedExternalDataSource> {
    const md = provider ?? Metadata.Provider;
    if (!md) {
      throw new Error('No metadata provider available to resolve external data source.');
    }

    const dataSource = await md.GetEntityObject<MJExternalDataSourceEntity>('MJ: External Data Sources', contextUser);
    if (!(await dataSource.Load(dataSourceId))) {
      throw new Error(`External data source '${dataSourceId}' not found.`);
    }
    if (dataSource.Status !== 'Active') {
      throw new Error(`External data source '${dataSource.Name}' is ${dataSource.Status}; reads are disabled.`);
    }

    const dataSourceType = await md.GetEntityObject<MJExternalDataSourceTypeEntity>('MJ: External Data Source Types', contextUser);
    if (!(await dataSourceType.Load(dataSource.TypeID))) {
      throw new Error(`External data source type '${dataSource.TypeID}' (for '${dataSource.Name}') not found.`);
    }

    // Must check GetRegistration explicitly: CreateInstance returns an instance of the ABSTRACT base
    // (never null) when the DriverClass isn't registered, so a `!driver` guard would be dead code and the
    // first driver call would throw a cryptic "x is not a function" instead of this clear message. A typo
    // in DriverClass, or the driver package not being imported, is a realistic operational scenario.
    const cf = MJGlobal.Instance.ClassFactory;
    if (!cf.GetRegistration(BaseExternalDataSourceDriver, dataSourceType.DriverClass)) {
      throw new Error(
        `No external data source driver registered for DriverClass '${dataSourceType.DriverClass}' ` +
        `(data source '${dataSource.Name}'). Ensure the driver package is installed and its @RegisterClass key matches.`,
      );
    }
    const driver = cf.CreateInstance<BaseExternalDataSourceDriver>(
      BaseExternalDataSourceDriver,
      dataSourceType.DriverClass,
    )!;

    return { dataSource, dataSourceType, driver };
  }

  /**
   * Subscribe (once) to the framework's entity-change event stream so edits to an external data source
   * take effect WITHOUT a process restart. Without this, `createResolved`'s snapshot of the row (Status,
   * ConnectionConfig, CredentialID, schema, TTL) and the `Status !== 'Active'` gate are frozen at first
   * resolve — so disabling or reconfiguring an already-used source would silently no-op until restart.
   *
   * Uses the same MJGlobal -> BaseEntity event channel that every BaseEngine consumes for cache
   * invalidation. SCOPE: this fully covers SINGLE-process invalidation — a local save/delete of a source
   * on this instance evicts its cached driver. It does NOT yet provide cross-instance invalidation: on the
   * SERVER, `remote-invalidate` MJGlobal BaseEntity events aren't raised (that channel is browser-side
   * today), so an edit on one MJAPI instance won't evict another instance's cache until that instance
   * restarts (multi-instance invalidation is a documented follow-up). The remote-invalidate branch in
   * handleEntityChange is kept because it's correct IF such an event ever arrives. Subscribed lazily on
   * first Resolve — before anything is cached there's nothing to invalidate. Process-lifetime subscription.
   */
  private ensureCacheInvalidationSubscription(): void {
    if (this.cacheInvalidationSubscribed) {
      return;
    }
    this.cacheInvalidationSubscribed = true;
    MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
      if (event.event === MJEventType.ComponentEvent && event.eventCode === BaseEntity.BaseEventCode) {
        this.handleEntityChange(event.args as BaseEntityEvent).catch((e) => LogError(e));
      }
    });
  }

  /**
   * Evict cached resolutions in response to a change to an External Data Source (or its Type). A change
   * to the data-source row evicts that one source (local save/delete carries the record); a Type change
   * (e.g. DriverClass) can affect every source of that type, so it evicts all. Cross-server
   * `remote-invalidate` events don't carry the resolved BaseEntity, so they conservatively evict all.
   */
  protected async handleEntityChange(event: BaseEntityEvent): Promise<void> {
    if (!event) {
      return; // defensive: match providerBase's guard — a malformed event must not throw in the handler
    }
    const entityName = (event.baseEntity?.EntityInfo?.Name ?? event.entityName ?? '').toLowerCase().trim();
    if (entityName === EXTERNAL_DATA_SOURCE_TYPE_ENTITY) {
      await this.ClearCache();
      return;
    }
    if (entityName === EXTERNAL_DATA_SOURCE_ENTITY) {
      // Local save/delete carries the row (evict just that source); remote-invalidate does not — evict all.
      const id = event.type !== 'remote-invalidate'
        ? (event.baseEntity as MJExternalDataSourceEntity | undefined)?.ID
        : undefined;
      await (id ? this.ClearCache(id) : this.ClearCache());
    }
  }

  /**
   * Evict a cached driver (or all of them) — e.g. after editing a data source's config — and CLOSE its
   * live connection pool so the eviction doesn't orphan open remote connections. Async because closing
   * a pool is async; awaits the (memoized) resolution so it closes the same driver instance callers use.
   */
  public async ClearCache(dataSourceId?: string): Promise<void> {
    if (dataSourceId) {
      await this.evictAndClose(dataSourceId);
    } else {
      await Promise.all(Array.from(this.driverCache.keys()).map((id) => this.evictAndClose(id)));
    }
  }

  /** Remove one data source's cached driver and best-effort close its pool. */
  private async evictAndClose(dataSourceId: string): Promise<void> {
    const entry = this.driverCache.get(dataSourceId);
    this.driverCache.delete(dataSourceId);
    if (!entry) {
      return;
    }
    try {
      const { driver } = await entry;
      await driver.CloseConnection(dataSourceId);
    } catch {
      // Resolution never completed (nothing to close) or the close failed — best-effort on the evict path.
    }
  }
}
