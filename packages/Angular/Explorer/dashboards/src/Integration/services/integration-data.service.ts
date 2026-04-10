import { Injectable } from '@angular/core';
import { Metadata, RunView, IRunViewProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
  MJCompanyIntegrationEntityMapEntity,
  MJCompanyIntegrationFieldMapEntity,
  MJCompanyIntegrationEntity,
  MJIntegrationEntity,
  MJIntegrationSourceTypeEntity,
  MJCompanyIntegrationSyncWatermarkEntity,
} from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
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
  DefaultConfigResult,
  ApplyAllResult
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

/** Aggregated per-entity stats for a run (computed client-side from raw detail records) */
export interface RunDetailRow {
  EntityID: string;
  Entity: string;
  RecordsProcessed: number;
  RecordsCreated: number;
  RecordsUpdated: number;
  RecordsDeleted: number;
  RecordsErrored: number;
  RecordsSkipped: number;
}

/** Raw record from MJ: Company Integration Run Details (one row per record operation) */
interface RawRunDetailRecord {
  ID: string;
  CompanyIntegrationRunID: string;
  EntityID: string;
  RecordID: string;
  Action: string;
  IsSuccess: boolean;
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
  Integration: MJCompanyIntegrationEntity;
  SourceType: MJIntegrationSourceTypeEntity | null;
  /** Icon from the Integration entity — FA class, URL, or base64 */
  Icon: string | null;
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

/** Schedule row for the Schedules component (includes new scheduling fields) */
export interface ScheduleRow {
  ID: string;
  Name: string;
  Integration: string;
  Company: string;
  IsActive: boolean | null;
  ScheduleEnabled: boolean;
  ScheduleType: 'Manual' | 'Interval' | 'Cron';
  ScheduleIntervalMinutes: number | null;
  CronExpression: string | null;
  NextScheduledRunAt: string | null;
  LastScheduledRunAt: string | null;
  IsLocked: boolean;
  LockedAt: string | null;
}

/** Watermark row for the Activity detail panel */
export interface WatermarkRow {
  ID: string;
  EntityMapID: string;
  WatermarkType: string;
  WatermarkValue: string | null;
  Direction: 'Pull' | 'Push';
  EntityMap: string;
}

/** Shared icon resolution map for integration names to Font Awesome icon classes */
const INTEGRATION_ICON_MAP: Array<{ Pattern: RegExp; Icon: string }> = [
  { Pattern: /hubspot/i, Icon: 'fa-brands fa-hubspot' },
  { Pattern: /salesforce/i, Icon: 'fa-brands fa-salesforce' },
  { Pattern: /google/i, Icon: 'fa-brands fa-google' },
  { Pattern: /microsoft|dynamics|azure/i, Icon: 'fa-brands fa-microsoft' },
  { Pattern: /slack/i, Icon: 'fa-brands fa-slack' },
  { Pattern: /jira|atlassian/i, Icon: 'fa-brands fa-atlassian' },
  { Pattern: /github/i, Icon: 'fa-brands fa-github' },
  { Pattern: /stripe/i, Icon: 'fa-brands fa-stripe' },
  { Pattern: /shopify/i, Icon: 'fa-brands fa-shopify' },
  { Pattern: /mailchimp/i, Icon: 'fa-brands fa-mailchimp' },
  { Pattern: /wordpress/i, Icon: 'fa-brands fa-wordpress' },
  { Pattern: /dropbox/i, Icon: 'fa-brands fa-dropbox' },
  { Pattern: /csv|file|import/i, Icon: 'fa-solid fa-file-csv' },
  { Pattern: /postgres|mysql|sql|database|db/i, Icon: 'fa-solid fa-database' },
  { Pattern: /api|rest|graphql/i, Icon: 'fa-solid fa-code' },
  { Pattern: /member|membership/i, Icon: 'fa-solid fa-users' },
  { Pattern: /email|mail/i, Icon: 'fa-solid fa-envelope' },
  { Pattern: /calendar|event/i, Icon: 'fa-solid fa-calendar' }
];

/**
 * Resolve an integration icon. Checks the entity's Icon field first (supports
 * Font Awesome classes, URLs, and base64), then falls back to pattern-based
 * name matching, then to a generic plug icon.
 */
export function ResolveIntegrationIcon(name: string, entityIcon?: string | null): string {
  // If the Integration entity has an Icon value that looks like a FA class, use it directly
  if (entityIcon && entityIcon.startsWith('fa-')) {
    return entityIcon;
  }
  // Fall back to pattern-based name matching
  const match = INTEGRATION_ICON_MAP.find(m => m.Pattern.test(name));
  return match ? match.Icon : 'fa-solid fa-plug';
}

/**
 * Check if the Icon field contains an image URL or base64 data URI
 * (as opposed to a Font Awesome class). Used by templates to decide
 * whether to render an <i> or an <img>.
 */
export function IsImageIcon(icon: string | null | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith('http') || icon.startsWith('data:') || icon.startsWith('/');
}

@Injectable({
  providedIn: 'root'
})
export class IntegrationDataService {

  async LoadIntegrationSummaries(provider?: IRunViewProvider | null): Promise<IntegrationSummary[]> {
    const engine = IntegrationEngineBase.Instance;
    const rv = this.createRunView(provider);

    // Engine provides cached metadata; only runs are dynamic and need a RunView call
    const [, runsResult] = await Promise.all([
      engine.Config(false),
      rv.RunView<IntegrationRunRow>({
        EntityName: 'MJ: Company Integration Runs',
        ExtraFilter: '',
        OrderBy: 'StartedAt DESC',
        Fields: ['ID', 'CompanyIntegrationID', 'StartedAt', 'EndedAt', 'TotalRecords',
                 'Status', 'ErrorLog', 'Integration', 'Company', 'RunByUser'],
        ResultType: 'simple'
      })
    ]);

    const integrations = engine.CompanyIntegrations;
    const runs = runsResult.Results;
    const sourceTypes = engine.SourceTypes;

    const integrationDefs = engine.Integrations;
    return integrations.map(integration => this.buildSummary(integration, runs, sourceTypes, integrationDefs));
  }

  async LoadEntityMaps(companyIntegrationID: string, _provider?: IRunViewProvider | null): Promise<MJCompanyIntegrationEntityMapEntity[]> {
    await IntegrationEngineBase.Instance.Config(false);
    return IntegrationEngineBase.Instance.GetEntityMapsForCompanyIntegration(companyIntegrationID);
  }

  async LoadFieldMaps(entityMapID: string, _provider?: IRunViewProvider | null): Promise<MJCompanyIntegrationFieldMapEntity[]> {
    await IntegrationEngineBase.Instance.Config(false);
    return IntegrationEngineBase.Instance.GetFieldMapsForEntityMap(entityMapID);
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
    const result = await rv.RunView<RawRunDetailRecord>({
      EntityName: 'MJ: Company Integration Run Details',
      ExtraFilter: `CompanyIntegrationRunID='${runID}'`,
      OrderBy: 'Entity',
      Fields: ['ID', 'CompanyIntegrationRunID', 'EntityID', 'RecordID',
               'Action', 'IsSuccess', 'Entity'],
      ResultType: 'simple'
    });
    return this.aggregateRunDetails(result.Results);
  }

  /** Aggregate raw per-record detail rows into per-entity summary rows */
  private aggregateRunDetails(rawRecords: RawRunDetailRecord[]): RunDetailRow[] {
    const entityMap = new Map<string, RunDetailRow>();

    for (const rec of rawRecords) {
      const key = rec.EntityID.toLowerCase();
      let row = entityMap.get(key);
      if (!row) {
        row = {
          EntityID: rec.EntityID,
          Entity: rec.Entity,
          RecordsProcessed: 0,
          RecordsCreated: 0,
          RecordsUpdated: 0,
          RecordsDeleted: 0,
          RecordsErrored: 0,
          RecordsSkipped: 0
        };
        entityMap.set(key, row);
      }

      row.RecordsProcessed++;

      if (!rec.IsSuccess) {
        row.RecordsErrored++;
      } else {
        const action = (rec.Action ?? '').toUpperCase();
        if (action === 'INSERT' || action === 'CREATE') {
          row.RecordsCreated++;
        } else if (action === 'UPDATE') {
          row.RecordsUpdated++;
        } else if (action === 'DELETE') {
          row.RecordsDeleted++;
        } else if (action === 'SKIP' || action === 'SKIPPED') {
          row.RecordsSkipped++;
        }
      }
    }

    return Array.from(entityMap.values()).sort((a, b) => a.Entity.localeCompare(b.Entity));
  }

  async LoadIntegrationDefinitions(_provider?: IRunViewProvider | null): Promise<MJIntegrationEntity[]> {
    await IntegrationEngineBase.Instance.Config(false);
    return IntegrationEngineBase.Instance.Integrations;
  }

  async LoadSourceTypes(_provider?: IRunViewProvider | null): Promise<MJIntegrationSourceTypeEntity[]> {
    await IntegrationEngineBase.Instance.Config(false);
    return IntegrationEngineBase.Instance.SourceTypes.filter(st => st.Status === 'Active');
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
    TransformPipeline?: string | null;
    Priority?: number;
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
    if (params.TransformPipeline !== undefined) fm.TransformPipeline = params.TransformPipeline;
    fm.Status = 'Active';
    fm.Priority = params.Priority ?? 0;

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
    TransformPipeline?: string | null;
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
    if (updates.TransformPipeline !== undefined) fm.TransformPipeline = updates.TransformPipeline;
    return fm.Save();
  }

  /** Load available MJ entities for mapping target selection */
  async LoadMJEntities(_provider?: IRunViewProvider | null): Promise<Array<{ ID: string; Name: string }>> {
    const md = new Metadata();
    return md.Entities
      .map(e => ({ ID: e.ID, Name: e.Name }))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  /** Load entity fields for a given entity (for field mapping destination picker) */
  async LoadEntityFields(entityID: string, _provider?: IRunViewProvider | null): Promise<Array<{ ID: string; Name: string; Type: string; IsRequired: boolean }>> {
    const md = new Metadata();
    const entity = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
    if (!entity) return [];
    return entity.Fields
      .sort((a, b) => a.Sequence - b.Sequence)
      .map(f => ({ ID: f.ID, Name: f.Name, Type: f.Type, IsRequired: !f.AllowsNull }));
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

  /** Execute the full RSU pipeline for an integration entity map */
  async RunSchemaPipeline(
    companyIntegrationID: string,
    entityMap: EntityMapRow
  ): Promise<{ Success: boolean; Message?: string }> {
    const md = new Metadata();
    const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityMap.EntityID));
    if (!entityInfo) {
      return { Success: false, Message: `Entity not found for ID ${entityMap.EntityID}` };
    }

    const objects: SchemaPreviewObjectInput[] = [{
      SourceObjectName: entityMap.ExternalObjectName,
      SchemaName: entityInfo.SchemaName,
      TableName: entityInfo.BaseTable,
      EntityName: entityInfo.Name
    }];

    const client = this.getIntegrationClient();
    const result = await client.ApplySchema(companyIntegrationID, objects);
    return { Success: result.Success, Message: result.Message };
  }

  /** Execute the RSU pipeline for new entity maps — introspects, generates DDL, runs full pipeline */
  async ApplySchemaForNewMaps(
    companyIntegrationID: string,
    objects: SchemaPreviewObjectInput[]
  ): Promise<{ Success: boolean; Message: string }> {
    const client = this.getIntegrationClient();
    const result = await client.ApplySchema(companyIntegrationID, objects);
    return { Success: result.Success, Message: result.Message ?? '' };
  }

  /** Batch apply schema for multiple connectors — one RSU pipeline run */
  async ApplySchemaBatch(
    items: Array<{ CompanyIntegrationID: string; Objects: SchemaPreviewObjectInput[] }>
  ): Promise<{
    Success: boolean;
    Message: string;
    Items?: Array<{ CompanyIntegrationID: string; Success: boolean; Message: string; Warnings?: string[] }>;
    Steps?: Array<{ Name: string; Status: string; DurationMs: number; Message: string }>;
    GitCommitSuccess?: boolean;
    APIRestarted?: boolean;
  }> {
    const client = this.getIntegrationClient();
    return client.ApplySchemaBatch(items);
  }

  /** Full automatic "Apply All" flow: pipeline + entity maps + field maps + sync */
  async ApplyAll(
    companyIntegrationID: string,
    sourceObjectNames: string[]
  ): Promise<ApplyAllResult> {
    const client = this.getIntegrationClient();
    return client.ApplyAll(companyIntegrationID, sourceObjectNames);
  }

  /** Start a sync for a company integration */
  async StartSync(companyIntegrationID: string): Promise<{ Success: boolean; Message: string; RunID?: string }> {
    const client = this.getIntegrationClient();
    return client.StartSync(companyIntegrationID);
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

  /** Get a count of records in the destination MJ entity */
  async GetDestinationRecordCount(
    entityID: string,
    provider?: IRunViewProvider | null
  ): Promise<number> {
    const md = new Metadata();
    const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
    if (!entityInfo) return 0;

    const rv = this.createRunView(provider);
    const result = await rv.RunView<{ TotalCount: number }>({
      EntityName: entityInfo.Name,
      ExtraFilter: '',
      Fields: [entityInfo.FirstPrimaryKey?.Name ?? 'ID'],
      ResultType: 'simple'
    });
    return result.TotalRowCount ?? result.Results.length;
  }

  /** Get the most recent run that touched a given entity */
  async GetLastSyncForEntity(
    companyIntegrationID: string,
    entityID: string,
    provider?: IRunViewProvider | null
  ): Promise<{ StartedAt: string | null; EndedAt: string | null; Status: string; TotalRecords: number } | null> {
    const rv = this.createRunView(provider);
    // Get runs for this integration, most recent first
    const runsResult = await rv.RunView<IntegrationRunRow>({
      EntityName: 'MJ: Company Integration Runs',
      ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
      OrderBy: 'StartedAt DESC',
      MaxRows: 5,
      Fields: ['ID', 'CompanyIntegrationID', 'StartedAt', 'EndedAt', 'TotalRecords', 'Status'],
      ResultType: 'simple'
    });
    if (runsResult.Results.length === 0) return null;

    // Check each run's details to find one that touched this entity
    for (const run of runsResult.Results) {
      const detailResult = await rv.RunView<{ EntityID: string }>({
        EntityName: 'MJ: Company Integration Run Details',
        ExtraFilter: `CompanyIntegrationRunID='${run.ID}' AND EntityID='${entityID}'`,
        MaxRows: 1,
        Fields: ['EntityID'],
        ResultType: 'simple'
      });
      if (detailResult.Results.length > 0) {
        return {
          StartedAt: run.StartedAt,
          EndedAt: run.EndedAt,
          Status: run.Status,
          TotalRecords: run.TotalRecords
        };
      }
    }
    // No run touched this entity — return the most recent run anyway as context
    const latest = runsResult.Results[0];
    return {
      StartedAt: latest.StartedAt,
      EndedAt: latest.EndedAt,
      Status: latest.Status,
      TotalRecords: latest.TotalRecords
    };
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

  /** Load schedule data for all company integrations (includes new scheduling fields) */
  async LoadSchedules(_provider?: IRunViewProvider | null): Promise<MJCompanyIntegrationEntity[]> {
    await IntegrationEngineBase.Instance.Config(false);
    return IntegrationEngineBase.Instance.CompanyIntegrations;
  }

  /** Load sync watermarks for a specific company integration's entity maps */
  async LoadWatermarks(companyIntegrationID: string, _provider?: IRunViewProvider | null): Promise<MJCompanyIntegrationSyncWatermarkEntity[]> {
    await IntegrationEngineBase.Instance.Config(false);
    const entityMaps = IntegrationEngineBase.Instance.GetEntityMapsForCompanyIntegration(companyIntegrationID);
    if (entityMaps.length === 0) return [];

    const mapIDSet = new Set(entityMaps.map(em => em.ID.toLowerCase()));
    return IntegrationEngineBase.Instance.Watermarks.filter(w => mapIDSet.has(w.EntityMapID.toLowerCase()));
  }

  /**
   * Auto-map all entities in a given schema to a company integration.
   * For each entity in the schema that doesn't already have an entity map,
   * creates an entity map (ExternalObjectName = BaseTable) and 1:1 field maps
   * for every non-system column. Returns the count of maps created.
   */
  async AutoMapSchema(
    companyIntegrationID: string,
    schemaName: string,
    direction: 'Pull' | 'Push' | 'Bidirectional' = 'Pull'
  ): Promise<{ EntityMapsCreated: number; FieldMapsCreated: number; Errors: string[] }> {
    const md = new Metadata();
    const errors: string[] = [];

    // Get entities in the target schema
    const schemaEntities = md.Entities.filter(
      e => e.SchemaName.toLowerCase() === schemaName.toLowerCase()
    );
    if (schemaEntities.length === 0) {
      return { EntityMapsCreated: 0, FieldMapsCreated: 0, Errors: [`No entities found in schema "${schemaName}"`] };
    }

    // Load existing entity maps to avoid duplicates
    const existingMaps = await this.LoadEntityMaps(companyIntegrationID);
    const existingEntityIDs = new Set(existingMaps.map(m => m.ID.toLowerCase()));

    // Build a set of entity IDs that already have maps (by EntityID)
    const mappedEntityIDs = new Set<string>();
    for (const em of existingMaps) {
      mappedEntityIDs.add((em as unknown as { EntityID: string }).EntityID?.toLowerCase() ?? '');
    }
    // Also load full map data to check EntityID
    const engine = IntegrationEngineBase.Instance;
    await engine.Config(false);
    const allMaps = engine.GetEntityMapsForCompanyIntegration(companyIntegrationID);
    for (const em of allMaps) {
      mappedEntityIDs.add(em.EntityID.toLowerCase());
    }

    let entityMapsCreated = 0;
    let fieldMapsCreated = 0;

    for (const entity of schemaEntities) {
      // Skip if already mapped
      if (mappedEntityIDs.has(entity.ID.toLowerCase())) continue;

      // Create entity map
      const entityMap = await this.CreateEntityMap({
        CompanyIntegrationID: companyIntegrationID,
        ExternalObjectName: entity.BaseTable,
        EntityID: entity.ID,
        SyncDirection: direction
      });

      if (!entityMap) {
        errors.push(`Failed to create entity map for ${entity.Name}`);
        continue;
      }
      entityMapsCreated++;

      // Create 1:1 field maps for all non-system fields
      const fields = entity.Fields.filter(
        f => !f.Name.startsWith('__mj')
      );

      for (const field of fields) {
        const isKey = field.Name.toLowerCase() === 'uuid' || field.IsPrimaryKey;
        const fm = await this.CreateFieldMap({
          EntityMapID: entityMap.ID,
          SourceFieldName: field.Name,
          DestinationFieldName: field.Name,
          IsKeyField: isKey,
          IsRequired: isKey,
          Direction: direction === 'Bidirectional' ? 'Both' : 'SourceToDest'
        });
        if (fm) {
          fieldMapsCreated++;
        } else {
          errors.push(`Failed to create field map for ${entity.Name}.${field.Name}`);
        }
      }
    }

    return { EntityMapsCreated: entityMapsCreated, FieldMapsCreated: fieldMapsCreated, Errors: errors };
  }

  /** Load available schemas (for auto-map schema picker) */
  LoadSchemas(): string[] {
    const md = new Metadata();
    const schemas = new Set<string>();
    for (const entity of md.Entities) {
      if (entity.SchemaName) schemas.add(entity.SchemaName);
    }
    return Array.from(schemas).sort();
  }

  /** Load entity map count per company integration (used by Overview cards) */
  async LoadEntityMapCounts(_provider?: IRunViewProvider | null): Promise<Map<string, number>> {
    await IntegrationEngineBase.Instance.Config(false);
    const counts = new Map<string, number>();
    for (const em of IntegrationEngineBase.Instance.EntityMaps) {
      if (em.SyncEnabled) {
        const key = em.CompanyIntegrationID.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
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
    integration: MJCompanyIntegrationEntity,
    allRuns: IntegrationRunRow[],
    sourceTypes: MJIntegrationSourceTypeEntity[],
    integrationDefs: MJIntegrationEntity[]
  ): IntegrationSummary {
    const integrationRuns = allRuns.filter(r => UUIDsEqual(r.CompanyIntegrationID, integration.ID));
    const latestRun = integrationRuns.length > 0 ? integrationRuns[0] : null;
    const recentRuns = integrationRuns.slice(0, 5);
    const statusColor = this.computeStatusColor(latestRun, integration.IsActive);
    const relativeTime = this.computeRelativeTime(latestRun?.StartedAt ?? null);
    const totalRecordsSyncedToday = this.computeRecordsSyncedToday(integrationRuns);
    const totalErrors = integrationRuns.filter(r => r.Status === 'Failed').length;
    const durationMs = this.computeDuration(latestRun);
    const sourceType = this.resolveSourceType(integration, sourceTypes);
    const integrationName = integration.Integration ?? '';
    const def = integrationDefs.find(d => d.Name === integrationName);
    const icon = (def?.Get('Icon') as string | null) ?? null;

    return {
      Integration: integration,
      SourceType: sourceType,
      Icon: icon,
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
    integration: MJCompanyIntegrationEntity,
    sourceTypes: MJIntegrationSourceTypeEntity[]
  ): MJIntegrationSourceTypeEntity | null {
    if (!integration.SourceTypeID) return null;
    return sourceTypes.find(st => UUIDsEqual(st.ID, integration.SourceTypeID)) ?? null;
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
