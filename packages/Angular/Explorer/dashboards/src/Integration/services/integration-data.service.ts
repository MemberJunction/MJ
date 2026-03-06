import { Injectable } from '@angular/core';
import { RunView, IRunViewProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

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
    const [integrationsResult, runsResult] = await rv.RunViews([
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
      }
    ]);

    const integrations = integrationsResult.Results as IntegrationRow[];
    const runs = runsResult.Results as IntegrationRunRow[];

    return integrations.map(integration => this.buildSummary(integration, runs));
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
               'CredentialTypeID'],
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

  private createRunView(provider?: IRunViewProvider | null): RunView {
    return new RunView(provider ?? null);
  }

  private buildSummary(
    integration: IntegrationRow,
    allRuns: IntegrationRunRow[]
  ): IntegrationSummary {
    const integrationRuns = allRuns.filter(r => UUIDsEqual(r.CompanyIntegrationID, integration.ID));
    const latestRun = integrationRuns.length > 0 ? integrationRuns[0] : null;
    const recentRuns = integrationRuns.slice(0, 5);
    const statusColor = this.computeStatusColor(latestRun, integration.IsActive);
    const relativeTime = this.computeRelativeTime(latestRun?.StartedAt ?? null);
    const totalRecordsSyncedToday = this.computeRecordsSyncedToday(integrationRuns);
    const totalErrors = integrationRuns.filter(r => r.Status === 'Failed').length;
    const durationMs = this.computeDuration(latestRun);

    return {
      Integration: integration,
      SourceType: null,
      LatestRun: latestRun,
      RecentRuns: recentRuns,
      StatusColor: statusColor,
      RelativeTime: relativeTime,
      TotalRecordsSyncedToday: totalRecordsSyncedToday,
      TotalErrors: totalErrors,
      DurationMs: durationMs
    };
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
