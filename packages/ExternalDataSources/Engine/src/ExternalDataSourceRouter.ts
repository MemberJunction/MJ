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
  private driverCache = new Map<string, ResolvedExternalDataSource>();

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
    const cached = this.driverCache.get(dataSourceId);
    if (cached) {
      return cached;
    }

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

    const resolved: ResolvedExternalDataSource = { dataSource, dataSourceType, driver };
    this.driverCache.set(dataSourceId, resolved);
    return resolved;
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
