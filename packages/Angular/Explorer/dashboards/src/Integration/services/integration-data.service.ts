import { Injectable } from '@angular/core';
import { Metadata, RunView, IRunViewProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
  MJCompanyIntegrationEntityMapEntity,
  MJCompanyIntegrationFieldMapEntity
} from '@memberjunction/core-entities';
import {
  GraphQLDataProvider,
  GraphQLIntegrationClient,
  GraphQLActionClient,
  DiscoveredObjectResult,
  DiscoveredFieldResult,
  DiscoveryResult,
  ConnectionTestGraphQLResult,
  SchemaPreviewObjectInput,
  SchemaPreviewResult,
  DefaultConfigResult
} from '@memberjunction/graphql-dataprovider';

/**
 * Simple row types for read-only data loaded via ResultType: 'simple'
 */
export interface IntegrationRow {
  ID: string;
  Name: string;
  IsActive: boolean | null;
  LastRunID: string | null;
  LastRunStartedAt: string | null;
  LastRunEndedAt: string | null;
  Company: string;
  Integration: string;
  DriverClassName: string | null;
}

export interface IntegrationRunRow {
  ID: string;
  CompanyIntegrationID: string;
  StartedAt: string | null;
  EndedAt: string | null;
  TotalRecords: number;
  Status: 'Failed' | 'In Progress' | 'Pending' | 'Success';
  ErrorLog: string | null;
  Integration: string;
  Company: string;
  RunByUser: string;
}

export interface SourceTypeRow {
  ID: string;
  Name: string;
  Description: string | null;
  DriverClass: string;
  IconClass: string | null;
  Status: 'Active' | 'Inactive';
}

export interface EntityMapRow {
  ID: string;
  CompanyIntegrationID: string;
  ExternalObjectName: string;
  ExternalObjectLabel: string | null;
  EntityID: string;
  SyncDirection: 'Bidirectional' | 'Pull' | 'Push';
  SyncEnabled: boolean;
  MatchStrategy: string | null;
  ConflictResolution: 'DestWins' | 'Manual' | 'MostRecent' | 'SourceWins';
  Priority: number;
  DeleteBehavior: 'DoNothing' | 'HardDelete' | 'SoftDelete';
  Status: 'Active' | 'Inactive';
  Entity: string;
}

export interface FieldMapRow {
  ID: string;
  EntityMapID: string;
  SourceFieldName: string;
  SourceFieldLabel: string | null;
  DestinationFieldName: string;
  DestinationFieldLabel: string | null;
  Direction: 'Both' | 'DestToSource' | 'SourceToDest';
  TransformPipeline: string | null;
  IsKeyField: boolean;
  IsRequired: boolean;
  DefaultValue: string | null;
  Priority: number;
  Status: 'Active' | 'Inactive';
}

export interface RunDetailRow {
  ID: string;
  CompanyIntegrationRunID: string;
  EntityID: string;
  RecordsProcessed: number;
  RecordsCreated: number;
  RecordsUpdated: number;
  RecordsDeleted: number;
  RecordsErrored: number;
  RecordsSkipped: number;
  Entity: string;
}

/** Master integration definition (e.g., "HubSpot", "Salesforce") */
export interface IntegrationDefinitionRow {
  ID: string;
  Name: string;
  Description: string | null;
  ClassName: string | null;
  ImportPath: string | null;
  NavigationBaseURL: string | null;
  BatchMaxRequestCount: number;
  BatchRequestWaitTime: number;
  CredentialTypeID: string | null;
  SourceTypeID: string | null;
}

/** Aggregated summary for a single integration, used by the Control Tower UI */
export interface IntegrationSummary {
  Integration: IntegrationRow;
  SourceType: SourceTypeRow | null;
  LatestRun: IntegrationRunRow | null;
  RecentRuns: IntegrationRunRow[];
  StatusColor: 'green' | 'amber' | 'red' | 'gray';
  RelativeTime: string;
  TotalRecordsSyncedToday: number;
  TotalErrors: number;
  DurationMs: number | null;
}

/** KPI data for the Control Tower top strip */
export interface IntegrationKPIs {
  TotalIntegrations: number;
  ActiveSyncs: number;
  RecordsSyncedToday: number;
  ErrorRate: number;
  AverageSyncDurationMs: number | null;
}

/** Activity feed item for the Control Tower bottom section */
export interface ActivityFeedItem {
  RunID: string;
  IntegrationName: string;
  Status: 'Failed' | 'In Progress' | 'Pending' | 'Success';
  StatusColor: 'amber' | 'green' | 'red';
  StartedAt: string | null;
  RelativeTime: string;
  TotalRecords: number;
  RunByUser: string;
}

/** Daily record count for the bar chart */
export interface DailyRecordCount {
  Date: string;
  Label: string;
  Records: number;
}

@Injectable({
  providedIn: 'root'
})
export class IntegrationDataService {

  async LoadIntegrationSummaries(provider?: IRunViewProvider | null): Promise<IntegrationSummary[]> {
    const rv = this.createRunView(provider);
    const [integrationsResult, runsResult, sourceTypesResult, defsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Company Integrations',
        ExtraFilter: '',
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'IsActive', 'LastRunID',
                 'LastRunStartedAt', 'LastRunEndedAt', 'Company', 'Integration',
                 'DriverClassName'],
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: Company Integration Runs',
        ExtraFilter: '',
        OrderBy: 'StartedAt DESC',
        Fields: ['ID', 'CompanyIntegrationID', 'StartedAt', 'EndedAt', 'TotalRecords',
                 'Status', 'ErrorLog', 'Integration', 'Company', 'RunByUser'],
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: Integration Source Types',
        ExtraFilter: '',
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'Description', 'DriverClass', 'IconClass', 'Status'],
        ResultType: 'simple'
      },
      {
        EntityName: 'MJ: Integrations',
        ExtraFilter: '',
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'Description', 'ClassName', 'ImportPath',
                 'NavigationBaseURL', 'BatchMaxRequestCount', 'BatchRequestWaitTime',
                 'CredentialTypeID', 'SourceTypeID'],
        ResultType: 'simple'
      }
    ]);

    const integrations = integrationsResult.Results as IntegrationRow[];
    const runs = runsResult.Results as IntegrationRunRow[];
    const sourceTypes = sourceTypesResult.Results as SourceTypeRow[];
    const defs = defsResult.Results as IntegrationDefinitionRow[];

    return integrations.map(integration => this.buildSummary(integration, runs, sourceTypes, defs));
  }

  async LoadEntityMaps(companyIntegrationID: string, provider?: IRunViewProvider | null): Promise<EntityMapRow[]> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<EntityMapRow>({
      EntityName: 'MJ: Company Integration Entity Maps',
      ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
      OrderBy: 'Priority, ExternalObjectName',
      Fields: ['ID', 'CompanyIntegrationID', 'ExternalObjectName', 'ExternalObjectLabel',
               'EntityID', 'SyncDirection', 'SyncEnabled', 'MatchStrategy',
               'ConflictResolution', 'Priority', 'DeleteBehavior', 'Status', 'Entity'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  async LoadFieldMaps(entityMapID: string, provider?: IRunViewProvider | null): Promise<FieldMapRow[]> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<FieldMapRow>({
      EntityName: 'MJ: Company Integration Field Maps',
      ExtraFilter: `EntityMapID='${entityMapID}'`,
      OrderBy: 'Priority, SourceFieldName',
      Fields: ['ID', 'EntityMapID', 'SourceFieldName', 'SourceFieldLabel',
               'DestinationFieldName', 'DestinationFieldLabel', 'Direction',
               'TransformPipeline', 'IsKeyField', 'IsRequired', 'DefaultValue',
               'Priority', 'Status'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  async LoadRunHistory(companyIntegrationID: string, limit: number = 10, provider?: IRunViewProvider | null): Promise<IntegrationRunRow[]> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<IntegrationRunRow>({
      EntityName: 'MJ: Company Integration Runs',
      ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
      OrderBy: 'StartedAt DESC',
      MaxRows: limit,
      Fields: ['ID', 'CompanyIntegrationID', 'StartedAt', 'EndedAt', 'TotalRecords',
               'Status', 'ErrorLog', 'Integration', 'Company', 'RunByUser'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  async LoadRunDetails(runID: string, provider?: IRunViewProvider | null): Promise<RunDetailRow[]> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<RunDetailRow>({
      EntityName: 'MJ: Company Integration Run Details',
      ExtraFilter: `CompanyIntegrationRunID='${runID}'`,
      OrderBy: 'Entity',
      Fields: ['ID', 'CompanyIntegrationRunID', 'EntityID', 'RecordsProcessed',
               'RecordsCreated', 'RecordsUpdated', 'RecordsDeleted',
               'RecordsErrored', 'RecordsSkipped', 'Entity'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  async LoadIntegrationDefinitions(provider?: IRunViewProvider | null): Promise<IntegrationDefinitionRow[]> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<IntegrationDefinitionRow>({
      EntityName: 'MJ: Integrations',
      ExtraFilter: '',
      OrderBy: 'Name',
      Fields: ['ID', 'Name', 'Description', 'ClassName', 'ImportPath',
               'NavigationBaseURL', 'BatchMaxRequestCount', 'BatchRequestWaitTime',
               'CredentialTypeID', 'SourceTypeID'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  async LoadSourceTypes(provider?: IRunViewProvider | null): Promise<SourceTypeRow[]> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<SourceTypeRow>({
      EntityName: 'MJ: Integration Source Types',
      ExtraFilter: 'Status=\'Active\'',
      OrderBy: 'Name',
      Fields: ['ID', 'Name', 'Description', 'DriverClass', 'IconClass', 'Status'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  async LoadRecentRuns(limit: number = 20, provider?: IRunViewProvider | null): Promise<ActivityFeedItem[]> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<IntegrationRunRow>({
      EntityName: 'MJ: Company Integration Runs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      MaxRows: limit,
      Fields: ['ID', 'CompanyIntegrationID', 'StartedAt', 'EndedAt', 'TotalRecords',
               'Status', 'ErrorLog', 'Integration', 'Company', 'RunByUser'],
      ResultType: 'simple'
    });
    return result.Results.map(run => this.buildActivityFeedItem(run));
  }

  async LoadDailyRecordCounts(days: number = 7, provider?: IRunViewProvider | null): Promise<DailyRecordCount[]> {
    const rv = this.createRunView(provider);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const result = await rv.RunView<IntegrationRunRow>({
      EntityName: 'MJ: Company Integration Runs',
      ExtraFilter: `StartedAt >= '${cutoffStr}'`,
      OrderBy: 'StartedAt ASC',
      Fields: ['ID', 'CompanyIntegrationID', 'StartedAt', 'EndedAt', 'TotalRecords',
               'Status', 'ErrorLog', 'Integration', 'Company', 'RunByUser'],
      ResultType: 'simple'
    });

    return this.aggregateDailyCounts(result.Results, days);
  }

  ComputeKPIs(summaries: IntegrationSummary[]): IntegrationKPIs {
    const totalIntegrations = summaries.length;
    const activeSyncs = summaries.filter(
      s => s.LatestRun?.Status === 'In Progress' || s.LatestRun?.Status === 'Pending'
    ).length;
    const recordsSyncedToday = summaries.reduce((acc, s) => acc + s.TotalRecordsSyncedToday, 0);

    const totalRuns = summaries.reduce((acc, s) => acc + s.RecentRuns.length, 0);
    const totalErrors = summaries.reduce((acc, s) => acc + s.TotalErrors, 0);
    const errorRate = totalRuns > 0 ? (totalErrors / totalRuns) * 100 : 0;

    const durationsMs = summaries
      .filter(s => s.DurationMs != null)
      .map(s => s.DurationMs as number);
    const averageSyncDurationMs = durationsMs.length > 0
      ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
      : null;

    return {
      TotalIntegrations: totalIntegrations,
      ActiveSyncs: activeSyncs,
      RecordsSyncedToday: recordsSyncedToday,
      ErrorRate: Math.round(errorRate * 10) / 10,
      AverageSyncDurationMs: averageSyncDurationMs
    };
  }

  FormatDuration(ms: number | null): string {
    if (ms == null) return '--';
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) return `${minutes}m ${seconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  ComputeRelativeTime(dateStr: string | null): string {
    return this.computeRelativeTime(dateStr);
  }

  // --- Entity Map CRUD ---

  async CreateEntityMap(params: {
    CompanyIntegrationID: string;
    ExternalObjectName: string;
    ExternalObjectLabel?: string;
    EntityID: string;
    SyncDirection?: 'Pull' | 'Push' | 'Bidirectional';
    ConflictResolution?: 'SourceWins' | 'DestWins' | 'MostRecent' | 'Manual';
    Priority?: number;
    DeleteBehavior?: 'SoftDelete' | 'DoNothing' | 'HardDelete';
  }): Promise<MJCompanyIntegrationEntityMapEntity | null> {
    const md = new Metadata();
    const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps');
    em.NewRecord();
    em.CompanyIntegrationID = params.CompanyIntegrationID;
    em.ExternalObjectName = params.ExternalObjectName;
    if (params.ExternalObjectLabel) em.ExternalObjectLabel = params.ExternalObjectLabel;
    em.EntityID = params.EntityID;
    em.SyncDirection = params.SyncDirection ?? 'Pull';
    em.ConflictResolution = params.ConflictResolution ?? 'SourceWins';
    em.Priority = params.Priority ?? 0;
    em.DeleteBehavior = params.DeleteBehavior ?? 'SoftDelete';
    em.Status = 'Active';
    em.SyncEnabled = true;

    const saved = await em.Save();
    if (!saved) {
      console.error('[IntegrationDataService] Failed to create entity map:', em.LatestResult?.CompleteMessage);
      return null;
    }
    return em;
  }

  async DeleteEntityMap(entityMapID: string): Promise<boolean> {
    const md = new Metadata();
    const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps');
    await em.Load(entityMapID);
    return em.Delete();
  }

  async ToggleEntityMapEnabled(entityMapID: string, enabled: boolean): Promise<boolean> {
    const md = new Metadata();
    const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps');
    await em.Load(entityMapID);
    em.SyncEnabled = enabled;
    return em.Save();
  }

  // --- Field Map CRUD ---

  async CreateFieldMap(params: {
    EntityMapID: string;
    SourceFieldName: string;
    SourceFieldLabel?: string;
    DestinationFieldName: string;
    DestinationFieldLabel?: string;
    IsKeyField?: boolean;
    IsRequired?: boolean;
    Direction?: 'SourceToDest' | 'DestToSource' | 'Both';
  }): Promise<MJCompanyIntegrationFieldMapEntity | null> {
    const md = new Metadata();
    const fm = await md.GetEntityObject<MJCompanyIntegrationFieldMapEntity>('MJ: Company Integration Field Maps');
    fm.NewRecord();
    fm.EntityMapID = params.EntityMapID;
    fm.SourceFieldName = params.SourceFieldName;
    if (params.SourceFieldLabel) fm.SourceFieldLabel = params.SourceFieldLabel;
    fm.DestinationFieldName = params.DestinationFieldName;
    if (params.DestinationFieldLabel) fm.DestinationFieldLabel = params.DestinationFieldLabel;
    fm.IsKeyField = params.IsKeyField ?? false;
    fm.IsRequired = params.IsRequired ?? false;
    fm.Direction = params.Direction ?? 'SourceToDest';
    fm.Status = 'Active';
    fm.Priority = 0;

    const saved = await fm.Save();
    if (!saved) {
      console.error('[IntegrationDataService] Failed to create field map:', fm.LatestResult?.CompleteMessage);
      return null;
    }
    return fm;
  }

  async DeleteFieldMap(fieldMapID: string): Promise<boolean> {
    const md = new Metadata();
    const fm = await md.GetEntityObject<MJCompanyIntegrationFieldMapEntity>('MJ: Company Integration Field Maps');
    await fm.Load(fieldMapID);
    return fm.Delete();
  }

  async UpdateFieldMap(fieldMapID: string, updates: {
    SourceFieldName?: string;
    DestinationFieldName?: string;
    IsKeyField?: boolean;
    IsRequired?: boolean;
    Direction?: 'SourceToDest' | 'DestToSource' | 'Both';
    Status?: 'Active' | 'Inactive';
  }): Promise<boolean> {
    const md = new Metadata();
    const fm = await md.GetEntityObject<MJCompanyIntegrationFieldMapEntity>('MJ: Company Integration Field Maps');
    await fm.Load(fieldMapID);
    if (updates.SourceFieldName !== undefined) fm.SourceFieldName = updates.SourceFieldName;
    if (updates.DestinationFieldName !== undefined) fm.DestinationFieldName = updates.DestinationFieldName;
    if (updates.IsKeyField !== undefined) fm.IsKeyField = updates.IsKeyField;
    if (updates.IsRequired !== undefined) fm.IsRequired = updates.IsRequired;
    if (updates.Direction !== undefined) fm.Direction = updates.Direction;
    if (updates.Status !== undefined) fm.Status = updates.Status;
    return fm.Save();
  }

  /** Load available MJ entities for mapping target selection */
  async LoadMJEntities(provider?: IRunViewProvider | null): Promise<Array<{ ID: string; Name: string }>> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<{ ID: string; Name: string }>({
      EntityName: 'MJ: Entities',
      ExtraFilter: '',
      OrderBy: 'Name',
      Fields: ['ID', 'Name'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  /** Load entity fields for a given entity (for field mapping destination picker) */
  async LoadEntityFields(entityID: string, provider?: IRunViewProvider | null): Promise<Array<{ ID: string; Name: string; Type: string; IsRequired: boolean }>> {
    const rv = this.createRunView(provider);
    const result = await rv.RunView<{ ID: string; Name: string; Type: string; IsRequired: boolean }>({
      EntityName: 'MJ: Entity Fields',
      ExtraFilter: `EntityID='${entityID}'`,
      OrderBy: 'Sequence',
      Fields: ['ID', 'Name', 'Type', 'IsRequired'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  // --- Discovery (via GraphQL) ---

  /** Discover external objects available for a company integration */
  async DiscoverObjects(companyIntegrationID: string): Promise<DiscoveryResult<DiscoveredObjectResult[]>> {
    const client = this.getIntegrationClient();
    return client.DiscoverObjects(companyIntegrationID);
  }

  /** Discover fields on a specific external object */
  async DiscoverFields(companyIntegrationID: string, objectName: string): Promise<DiscoveryResult<DiscoveredFieldResult[]>> {
    const client = this.getIntegrationClient();
    return client.DiscoverFields(companyIntegrationID, objectName);
  }

  /** Generate DDL preview for creating tables from discovered objects */
  async SchemaPreview(
    companyIntegrationID: string,
    objects: SchemaPreviewObjectInput[],
    platform: string = 'sqlserver'
  ): Promise<SchemaPreviewResult> {
    const client = this.getIntegrationClient();
    return client.SchemaPreview(companyIntegrationID, objects, platform);
  }

  /** Get the connector's default configuration for quick setup */
  async GetDefaultConfig(companyIntegrationID: string): Promise<DefaultConfigResult> {
    const client = this.getIntegrationClient();
    return client.GetDefaultConfig(companyIntegrationID);
  }

  /** Test connection to the external system */
  async TestConnection(companyIntegrationID: string): Promise<ConnectionTestGraphQLResult> {
    const client = this.getIntegrationClient();
    return client.TestConnection(companyIntegrationID);
  }

  /** Preview source data from the external system via connector's FetchChanges */
  async PreviewSourceData(
    companyIntegrationID: string,
    objectName: string,
    limit: number = 5
  ): Promise<Array<Record<string, string | number | boolean | null>>> {
    const client = this.getIntegrationClient();
    const result = await client.PreviewData(companyIntegrationID, objectName, limit);
    if (!result.Success || !result.Records) {
      console.warn('[IntegrationDataService] PreviewSourceData failed:', result.Message);
      return [];
    }
    return result.Records.map(r => {
      try {
        return JSON.parse(r.Data) as Record<string, string | number | boolean | null>;
      } catch {
        return { _raw: r.Data } as Record<string, string | number | boolean | null>;
      }
    });
  }

  /** Preview destination data by loading a few records from the target entity */
  async PreviewDestinationData(
    entityID: string,
    limit: number = 5,
    provider?: IRunViewProvider | null
  ): Promise<Array<Record<string, string | number | boolean | null>>> {
    const md = new Metadata();
    const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
    if (!entityInfo) return [];

    // Load first N fields (skip internal __mj fields) to keep preview compact
    const fields = entityInfo.Fields
      .filter(f => !f.Name.startsWith('__mj'))
      .slice(0, 8)
      .map(f => f.Name);

    const rv = this.createRunView(provider);
    const result = await rv.RunView<Record<string, string | number | boolean | null>>({
      EntityName: entityInfo.Name,
      ExtraFilter: '',
      OrderBy: `${fields[0]} ASC`,
      MaxRows: limit,
      Fields: fields,
      ResultType: 'simple'
    });
    return result.Results;
  }

  /** Run an integration sync via the "Run Integration Sync" action */
  async RunSync(companyIntegrationID: string): Promise<{ Success: boolean; Message: string }> {
    const actionID = await this.lookupActionID('Run Integration Sync');
    if (!actionID) {
      return {
        Success: false,
        Message: 'Action "Run Integration Sync" not found. Ensure the action is registered.'
      };
    }

    const provider = Metadata.Provider as GraphQLDataProvider;
    const actionClient = new GraphQLActionClient(provider);
    const result = await actionClient.RunAction(actionID, [
      { Name: 'CompanyIntegrationID', Value: companyIntegrationID, Type: 'Input' }
    ]);
    return { Success: result.Success, Message: result.Message ?? '' };
  }

  private async lookupActionID(actionName: string): Promise<string | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>({
      EntityName: 'MJ: Actions',
      ExtraFilter: `Name='${actionName}'`,
      Fields: ['ID'],
      MaxRows: 1,
      ResultType: 'simple'
    });
    return result.Results.length > 0 ? result.Results[0].ID : null;
  }

  private getIntegrationClient(): GraphQLIntegrationClient {
    const provider = Metadata.Provider as GraphQLDataProvider;
    return new GraphQLIntegrationClient(provider);
  }

  private createRunView(provider?: IRunViewProvider | null): RunView {
    return new RunView(provider ?? null);
  }

  private buildSummary(
    integration: IntegrationRow,
    allRuns: IntegrationRunRow[],
    sourceTypes: SourceTypeRow[],
    defs: IntegrationDefinitionRow[]
  ): IntegrationSummary {
    const integrationRuns = allRuns.filter(r => UUIDsEqual(r.CompanyIntegrationID, integration.ID));
    const latestRun = integrationRuns.length > 0 ? integrationRuns[0] : null;
    const recentRuns = integrationRuns.slice(0, 5);
    const statusColor = this.computeStatusColor(latestRun, integration.IsActive);
    const relativeTime = this.computeRelativeTime(latestRun?.StartedAt ?? null);
    const totalRecordsSyncedToday = this.computeRecordsSyncedToday(integrationRuns);
    const totalErrors = integrationRuns.filter(r => r.Status === 'Failed').length;
    const durationMs = this.computeDuration(latestRun);
    const sourceType = this.resolveSourceType(integration, defs, sourceTypes);

    return {
      Integration: integration,
      SourceType: sourceType,
      LatestRun: latestRun,
      RecentRuns: recentRuns,
      StatusColor: statusColor,
      RelativeTime: relativeTime,
      TotalRecordsSyncedToday: totalRecordsSyncedToday,
      TotalErrors: totalErrors,
      DurationMs: durationMs
    };
  }

  private resolveSourceType(
    integration: IntegrationRow,
    defs: IntegrationDefinitionRow[],
    sourceTypes: SourceTypeRow[]
  ): SourceTypeRow | null {
    // Match CompanyIntegration.Integration (name) to Integration definition, then look up SourceTypeID
    const def = defs.find(d => d.Name === integration.Integration);
    if (!def?.SourceTypeID) return null;
    return sourceTypes.find(st => UUIDsEqual(st.ID, def.SourceTypeID)) ?? null;
  }

  private buildActivityFeedItem(run: IntegrationRunRow): ActivityFeedItem {
    return {
      RunID: run.ID,
      IntegrationName: run.Integration,
      Status: run.Status,
      StatusColor: this.runStatusColor(run),
      StartedAt: run.StartedAt,
      RelativeTime: this.computeRelativeTime(run.StartedAt),
      TotalRecords: run.TotalRecords,
      RunByUser: run.RunByUser
    };
  }

  private runStatusColor(run: IntegrationRunRow): 'amber' | 'green' | 'red' {
    if (run.Status === 'Failed') return 'red';
    if (run.Status === 'Success') return 'green';
    return 'amber';
  }

  private computeRecordsSyncedToday(runs: IntegrationRunRow[]): number {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return runs
      .filter(r => r.StartedAt && new Date(r.StartedAt) >= todayStart)
      .reduce((acc, r) => acc + r.TotalRecords, 0);
  }

  private computeDuration(run: IntegrationRunRow | null): number | null {
    if (!run?.StartedAt || !run?.EndedAt) return null;
    return new Date(run.EndedAt).getTime() - new Date(run.StartedAt).getTime();
  }

  private aggregateDailyCounts(runs: IntegrationRunRow[], days: number): DailyRecordCount[] {
    const result: DailyRecordCount[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString(undefined, { weekday: 'short' });

      const dayRecords = runs
        .filter(r => r.StartedAt && r.StartedAt.startsWith(dateStr))
        .reduce((acc, r) => acc + r.TotalRecords, 0);

      result.push({ Date: dateStr, Label: label, Records: dayRecords });
    }
    return result;
  }

  private computeStatusColor(
    latestRun: IntegrationRunRow | null,
    isActive: boolean | null
  ): 'green' | 'amber' | 'red' | 'gray' {
    if (!isActive) return 'gray';
    if (!latestRun) return 'gray';
    if (latestRun.Status === 'Failed') return 'red';
    if (latestRun.Status === 'In Progress' || latestRun.Status === 'Pending') return 'amber';
    if (latestRun.Status === 'Success') {
      return this.isStale(latestRun.StartedAt) ? 'amber' : 'green';
    }
    return 'gray';
  }

  private isStale(startedAt: string | null): boolean {
    if (!startedAt) return true;
    const runDate = new Date(startedAt);
    const hoursAgo = (Date.now() - runDate.getTime()) / (1000 * 60 * 60);
    return hoursAgo > 24;
  }

  private computeRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never run';
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}
