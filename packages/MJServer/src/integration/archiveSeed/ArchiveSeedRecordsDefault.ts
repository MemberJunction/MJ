/**
 * Default {@link ArchiveSeedRecords}: entity reads and writes for the archive-seed job.
 */
import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJCompanyIntegrationEntity,
  MJEntityEntity,
  MJExternalDataSourceEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { IntegrationDiscoveryResolver } from '../../resolvers/IntegrationDiscoveryResolver.js';
import type {
  ArchiveSeedCompanyIntegrationRef,
  ArchiveSeedCompanyIntegrationValues,
  ArchiveSeedDataSourceValues,
  ArchiveSeedEntityMap,
  ArchiveSeedRecords,
} from './ArchiveSeedDeps.js';

/** The SQL Server connector's ClassName, then the legacy one. */
const SQLSERVER_CLASS_NAMES = ['@memberjunction/connector-sqlserver', 'SQLServerConnector'];

/** The `seededFromBackup.jobID` of a company integration's configuration, or undefined. */
function SeededJobIDOf(configuration: string | null): string | undefined {
  if (!configuration) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(configuration);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const seeded = (parsed as Record<string, unknown>)['seededFromBackup'];
    const jobID = typeof seeded === 'object' && seeded !== null ? (seeded as Record<string, unknown>)['jobID'] : undefined;
    return typeof jobID === 'string' && jobID !== '' ? jobID : undefined;
  } catch {
    return undefined;
  }
}

/** Saves the record, throwing the provider's complete message on failure. */
async function SaveOrThrow(entity: BaseEntity, what: string): Promise<void> {
  if (!(await entity.Save())) {
    throw new Error(`${what}: ${entity.LatestResult?.CompleteMessage ?? 'save failed'}`);
  }
}

export class DefaultArchiveSeedRecords implements ArchiveSeedRecords {
  public async FindSqlServerIntegrationID(user: UserInfo, provider: IMetadataProvider): Promise<string | undefined> {
    const inList = SQLSERVER_CLASS_NAMES.map(n => `'${EscapeSQLString(n)}'`).join(', ');
    const rows = await this.simpleRows<{ ID: string; ClassName: string | null }>(
      'MJ: Integrations', `ClassName IN (${inList})`, ['ID', 'ClassName'], user, provider,
    );
    for (const className of SQLSERVER_CLASS_NAMES) {
      const match = rows.find(r => r.ClassName?.trim().toLowerCase() === className.toLowerCase());
      if (match) {
        return match.ID;
      }
    }
    return undefined;
  }

  public async FindCompanyIntegrations(integrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedCompanyIntegrationRef[]> {
    const rows = await this.simpleRows<{ ID: string; Name: string; Configuration: string | null }>(
      'MJ: Company Integrations', `IntegrationID='${EscapeSQLString(integrationID)}'`, ['ID', 'Name', 'Configuration'], user, provider,
    );
    return rows.map(r => {
      const ref: ArchiveSeedCompanyIntegrationRef = { ID: r.ID, Name: r.Name };
      const jobID = SeededJobIDOf(r.Configuration);
      if (jobID) {
        ref.SeededJobID = jobID;
      }
      return ref;
    });
  }

  /**
   * Deletes through the same cascade as the Integrations page's delete (runs, entity maps with their
   * field maps, watermarks and record maps, the connection, its unshared credential): a seed that failed
   * after its tables were applied already owns entity maps, which a bare entity delete cannot remove.
   * The connection's own entity Delete still removes its archive-seed job rows and data source.
   */
  public async DeleteCompanyIntegration(id: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const result = await new IntegrationDiscoveryResolver().DeleteConnectionCore(id, false, provider, user);
    if (!result.Success) {
      throw new Error(`Failed to delete Company Integration '${id}': ${result.Message}`);
    }
  }

  public async FindDataSourceTypeID(driverClass: 'SQLServerExternalDriver', user: UserInfo, provider: IMetadataProvider): Promise<string> {
    const rows = await this.simpleRows<{ ID: string }>(
      'MJ: External Data Source Types', `DriverClass='${EscapeSQLString(driverClass)}'`, ['ID'], user, provider,
    );
    if (rows.length === 0) {
      throw new Error(`No External Data Source Type has DriverClass '${driverClass}'`);
    }
    return rows[0].ID;
  }

  public async CreateDataSource(values: ArchiveSeedDataSourceValues, user: UserInfo, provider: IMetadataProvider): Promise<string> {
    const ds = await provider.GetEntityObject<MJExternalDataSourceEntity>('MJ: External Data Sources', user);
    ds.NewRecord();
    ds.Name = values.Name;
    ds.TypeID = values.TypeID;
    ds.DefaultDatabase = values.DefaultDatabase;
    ds.ConnectionConfig = values.ConnectionConfig;
    ds.Status = values.Status;
    await SaveOrThrow(ds, `Failed to create External Data Source '${values.Name}'`);
    return ds.ID;
  }

  public async SetDataSourceDefaultDatabase(id: string, defaultDatabase: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const ds = await provider.GetEntityObject<MJExternalDataSourceEntity>('MJ: External Data Sources', user);
    if (!(await ds.Load(id))) {
      throw new Error(`External Data Source "${id}" not found`);
    }
    ds.DefaultDatabase = defaultDatabase;
    await SaveOrThrow(ds, `Failed to set External Data Source '${id}' default database`);
  }

  public async DeleteDataSource(id: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const ds = await provider.GetEntityObject<MJExternalDataSourceEntity>('MJ: External Data Sources', user);
    if (!(await ds.Load(id))) {
      return;
    }
    if (!(await ds.Delete())) {
      throw new Error(`Failed to delete External Data Source '${id}': ${ds.LatestResult?.CompleteMessage ?? 'delete failed'}`);
    }
  }

  public async CreateCompanyIntegration(values: ArchiveSeedCompanyIntegrationValues, user: UserInfo, provider: IMetadataProvider): Promise<string> {
    const ci = await provider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
    ci.NewRecord();
    ci.CompanyID = values.CompanyID;
    ci.IntegrationID = values.IntegrationID;
    ci.Name = values.Name;
    ci.Configuration = values.Configuration;
    // Inactive while seeding: its data source is the temporary archive, then a Disabled deferred one.
    ci.IsActive = false;
    await SaveOrThrow(ci, `Failed to create Company Integration '${values.Name}'`);
    return ci.ID;
  }

  public async SetCompanyIntegrationConfiguration(id: string, configuration: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const ci = await provider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
    if (!(await ci.Load(id))) {
      throw new Error(`CompanyIntegration "${id}" not found`);
    }
    ci.Configuration = configuration;
    await SaveOrThrow(ci, `Failed to update Company Integration '${id}' configuration`);
  }

  public async EntityMapsFor(companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedEntityMap[]> {
    return this.simpleRows<ArchiveSeedEntityMap>(
      'MJ: Company Integration Entity Maps',
      `CompanyIntegrationID='${EscapeSQLString(companyIntegrationID)}'`,
      ['ID', 'EntityID', 'ExternalObjectName'],
      user,
      provider,
    );
  }

  public async MarkEntitiesBulkLoadable(entityIDs: string[], user: UserInfo, provider: IMetadataProvider): Promise<void> {
    for (const entityID of entityIDs) {
      await this.markBulkLoadable(entityID, user, provider);
    }
    await provider.Refresh();
  }

  public ResolveUser(userID: string): UserInfo | undefined {
    return UserCache.Instance.Users.find(u => UUIDsEqual(u.ID, userID));
  }

  /** One save: a DB CHECK requires tracking and cache trust off whenever direct insert is on. */
  private async markBulkLoadable(entityID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const entity = await provider.GetEntityObject<MJEntityEntity>('MJ: Entities', user);
    if (!(await entity.Load(entityID))) {
      throw new Error(`Entity "${entityID}" not found`);
    }
    if (!entity.TrackRecordChanges && !entity.TrustServerCacheCompletely && entity.AllowDirectSQLInsert) {
      return;
    }
    entity.TrackRecordChanges = false;
    entity.TrustServerCacheCompletely = false;
    entity.AllowDirectSQLInsert = true;
    await SaveOrThrow(entity, `Failed to mark entity '${entity.Name}' bulk-loadable`);
  }

  private async simpleRows<T>(entityName: string, filter: string, fields: string[], user: UserInfo, provider: IMetadataProvider): Promise<T[]> {
    const result = await RunView.FromMetadataProvider(provider).RunView<T>(
      { EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true },
      user,
    );
    if (!result.Success) {
      throw new Error(`Failed to read ${entityName}: ${result.ErrorMessage}`);
    }
    return result.Results ?? [];
  }
}
