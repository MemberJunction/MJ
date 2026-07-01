import { BaseSingleton, MJGlobal } from "@memberjunction/global";
import { IMetadataProvider, Metadata, UserInfo } from "@memberjunction/core";
import { MJExternalDataSourceEntity, MJExternalDataSourceTypeEntity } from "@memberjunction/core-entities";
import { BaseExternalDataSourceDriver } from "./BaseExternalDataSourceDriver";

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

    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseExternalDataSourceDriver>(
      BaseExternalDataSourceDriver,
      dataSourceType.DriverClass,
    );
    if (!driver) {
      throw new Error(
        `No external data source driver registered for DriverClass '${dataSourceType.DriverClass}' ` +
        `(data source '${dataSource.Name}'). Ensure the driver package is installed and its @RegisterClass key matches.`,
      );
    }

    return { dataSource, dataSourceType, driver };
  }

  /** Evict a cached driver (or all of them) — e.g. after editing a data source's config. */
  public ClearCache(dataSourceId?: string): void {
    if (dataSourceId) {
      this.driverCache.delete(dataSourceId);
    } else {
      this.driverCache.clear();
    }
  }
}
