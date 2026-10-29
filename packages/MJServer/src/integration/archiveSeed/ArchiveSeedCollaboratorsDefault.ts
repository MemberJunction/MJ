/**
 * Default discovery, apply, action and store collaborators of the archive-seed job.
 * Interfaces live in `ArchiveSeedDeps.ts`.
 */
import { LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import type { ActionParam, ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import { ConnectorFactory, IntegrationSchemaSync, type BaseIntegrationConnector, type IntrospectSchemaOptions, type PersistSchemaResult, type SourceSchemaInfo } from '@memberjunction/integration-engine';
import { RuntimeSchemaManager, type ArchiveSeedDiscoveredTable, type ArchiveSeedWork, type RSUPendingWork } from '@memberjunction/schema-engine';
import { SelectArchiveSchemas } from './ArchiveSeedState.js';
import { IntegrationDiscoveryResolver, type ApplyAllBatchInput } from '../../resolvers/IntegrationDiscoveryResolver.js';
import type {
  ArchiveSeedActions,
  ArchiveSeedApply,
  ArchiveSeedApplyResult,
  ArchiveSeedApplyWorkStatus,
  ArchiveSeedDiscovery,
  ArchiveSeedStore,
  ArchiveSeedStoredJob,
} from './ArchiveSeedDeps.js';

/** Platform passed to the schema-apply pipeline. */
const APPLY_PLATFORM = 'sqlserver';
/**
 * No RSU config knob controls the git commit for server-initiated applies; the GraphQL mutations
 * default `skipGitCommit` to false, so the archive seed does the same.
 */
const APPLY_SKIP_GIT_COMMIT = false;

/**
 * Maps an introspected schema to the discovered-table summary the job stores. `SourceObjectInfo`
 * carries no table/view marker; discovery asks the connector for base tables only (`BaseTablesOnly`).
 */
export function MapSourceSchemaToTables(schema: SourceSchemaInfo): ArchiveSeedDiscoveredTable[] {
  return schema.Objects.map(o => {
    const table: ArchiveSeedDiscoveredTable = {
      Name: o.ExternalName,
      ColumnCount: o.Fields.length,
      HasPrimaryKey: o.PrimaryKeyFields.length > 0,
    };
    if (o.IncrementalWatermarkField) {
      table.WatermarkField = o.IncrementalWatermarkField;
    }
    return table;
  });
}

/** Introspects through the company integration's connector and persists the shared catalog. */
export class DefaultArchiveSeedDiscovery implements ArchiveSeedDiscovery {
  public async IntrospectArchive(companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedDiscoveredTable[]> {
    const companyIntegration = await this.loadCompanyIntegration(companyIntegrationID, user, provider);
    const integration = await provider.GetEntityObject<MJIntegrationEntity>('MJ: Integrations', user);
    if (!(await integration.Load(companyIntegration.IntegrationID))) {
      throw new Error(`Integration "${companyIntegration.IntegrationID}" not found`);
    }
    const connector = ConnectorFactory.Resolve(integration);
    const schemas = await this.archiveSchemas(connector, companyIntegration, user);
    // Views are never offered: the load copies rows into tables the apply creates from base tables.
    const options: IntrospectSchemaOptions = schemas.length > 0 ? { Schemas: schemas, BaseTablesOnly: true } : { BaseTablesOnly: true };
    const schema = await connector.IntrospectSchema(companyIntegration, user, options);
    const persisted = await IntegrationSchemaSync.PersistDiscoveredSchema({
      IntegrationID: companyIntegration.IntegrationID,
      CatalogSource: 'Shared',
      SourceSchema: schema,
      ContextUser: user,
      Provider: provider,
    });
    LogStatus(this.describeDiscovery(schemas, schema, persisted));
    return MapSourceSchemaToTables(schema);
  }

  /** One line of what discovery found and persisted; the keyed count is what the apply will accept. */
  private describeDiscovery(schemas: string[], schema: SourceSchemaInfo, persisted: PersistSchemaResult): string {
    const keyed = schema.Objects.filter(o => o.PrimaryKeyFields.length > 0).length;
    return `Archive seed discovery: schemas [${schemas.join(', ')}], ${schema.Objects.length} table(s), ${keyed} keyed; `
      + `persisted ${persisted.ObjectsCreated + persisted.ObjectsUpdated} object(s), ${persisted.FieldsCreated + persisted.FieldsUpdated} field(s)`;
  }

  /**
   * The archive's schemas to introspect (decision D): all the connector can list except the system and
   * MemberJunction ones. Empty when the connector cannot list schemas, in which case the introspection
   * falls back to the data source's default schema.
   */
  private async archiveSchemas(connector: BaseIntegrationConnector, companyIntegration: MJCompanyIntegrationEntity, user: UserInfo): Promise<string[]> {
    const listing = connector as Partial<SchemaListingConnector>;
    if (typeof listing.ListSchemas !== 'function') {
      return [];
    }
    return SelectArchiveSchemas(await listing.ListSchemas.call(connector, companyIntegration, user));
  }

  private async loadCompanyIntegration(id: string, user: UserInfo, provider: IMetadataProvider): Promise<MJCompanyIntegrationEntity> {
    const companyIntegration = await provider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
    if (!(await companyIntegration.Load(id))) {
      throw new Error(`CompanyIntegration "${id}" not found`);
    }
    return companyIntegration;
  }
}

/** A connector that can enumerate its source's schemas (the external-data-source connectors do). */
interface SchemaListingConnector {
  ListSchemas(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<string[]>;
}

/** Applies the selected tables through the same batch pipeline the dashboard uses. */
export class DefaultArchiveSeedApply implements ArchiveSeedApply {
  public async ApplyTables(
    companyIntegrationID: string,
    tableNames: string[],
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<ArchiveSeedApplyResult> {
    const input: ApplyAllBatchInput = {
      Connectors: [{ CompanyIntegrationID: companyIntegrationID, SourceObjects: tableNames.map(n => ({ SourceObjectName: n })) }],
      StartSync: false,
      UnselectedAction: 'ignore',
    };
    const result = await new IntegrationDiscoveryResolver().ApplyAllBatchCore(input, APPLY_PLATFORM, APPLY_SKIP_GIT_COMMIT, false, user, provider);
    return { Success: result.Success, Message: result.Message, APIRestarted: result.APIRestarted === true };
  }
}

/** Runs a registered action by (case-insensitive) name. */
export class DefaultArchiveSeedActions implements ArchiveSeedActions {
  public async Run(actionName: string, params: ActionParam[], user: UserInfo, provider?: IMetadataProvider): Promise<ActionResult> {
    await ActionEngineServer.Instance.Config(false, user);
    const action = this.findAction(actionName);
    return ActionEngineServer.Instance.RunAction({
      Action: action,
      ContextUser: user,
      Params: params,
      SkipActionLog: false,
      Filters: [],
      Provider: provider,
    });
  }

  private findAction(actionName: string): MJActionEntityExtended {
    const wanted = actionName.trim().toLowerCase();
    const action = ActionEngineServer.Instance.Actions.find(a => a.Name.trim().toLowerCase() === wanted);
    if (!action) {
      throw new Error(`Action '${actionName}' is not registered. Push the integration action metadata first.`);
    }
    return action;
  }
}

/** Keeps job state in an `archive-seed` RSU pending-work row. */
export class DefaultArchiveSeedStore implements ArchiveSeedStore {
  public async Create(work: ArchiveSeedWork, companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<string> {
    return RuntimeSchemaManager.Instance.WritePendingWork(this.payload(work, companyIntegrationID), user, provider);
  }

  public async Read(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedStoredJob | undefined> {
    const row = await RuntimeSchemaManager.Instance.ReadPendingWorkByID(jobID, user, provider);
    if (!row || row.Work.WorkType !== 'archive-seed' || !row.Work.ArchiveSeed) {
      return undefined;
    }
    return { ID: row.ID, Work: row.Work.ArchiveSeed, Status: row.Status, CompanyIntegrationID: row.Work.CompanyIntegrationID };
  }

  public async Update(jobID: string, work: ArchiveSeedWork, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const row = await RuntimeSchemaManager.Instance.ReadPendingWorkByID(jobID, user, provider);
    if (!row) {
      throw new Error(`Archive seed job "${jobID}" not found`);
    }
    const updated = await RuntimeSchemaManager.Instance.UpdatePendingWorkPayload(jobID, { ...row.Work, ArchiveSeed: work }, user, provider);
    if (!updated) {
      throw new Error(`Failed to update archive seed job "${jobID}"`);
    }
  }

  public async Complete(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    if (!(await RuntimeSchemaManager.Instance.CompletePendingWork(jobID, user, provider))) {
      throw new Error(`Failed to complete archive seed job "${jobID}"`);
    }
  }

  public async Fail(jobID: string, message: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    if (!(await RuntimeSchemaManager.Instance.FailPendingWork(jobID, message, user, provider))) {
      throw new Error(`Failed to mark archive seed job "${jobID}" failed`);
    }
  }

  public async ApplyWorkStatus(companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedApplyWorkStatus | undefined> {
    const rows = await RuntimeSchemaManager.Instance.ReadPendingWorkForCompanyIntegration(companyIntegrationID, 'apply-objects', user, provider);
    const newest = rows[0];
    return newest ? { Status: newest.Status, ErrorMessage: newest.ErrorMessage } : undefined;
  }

  private payload(work: ArchiveSeedWork, companyIntegrationID: string): RSUPendingWork {
    return {
      WorkType: 'archive-seed',
      CompanyIntegrationID: companyIntegrationID,
      SourceObjectNames: [],
      SchemaName: '',
      CreatedAt: new Date().toISOString(),
      ArchiveSeed: work,
    };
  }
}
