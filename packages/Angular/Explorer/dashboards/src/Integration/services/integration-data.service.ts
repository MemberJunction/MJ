import { Injectable } from '@angular/core';
import { RunView } from '@memberjunction/core';

/**
 * Simple row types for read-only data loaded via ResultType: 'simple'
 */
export interface IntegrationRow {
  ID: string;
  Name: string;
  IsActive: boolean | null;
  SourceTypeID: string | null;
  SourceType: string | null;
  LastRunID: string | null;
  LastRunStartedAt: string | null;
  LastRunEndedAt: string | null;
  Company: string;
  Integration: string;
  DriverClassName: string | null;
  Configuration: string | null;
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

/** Aggregated summary for a single integration, used by the Control Tower UI */
export interface IntegrationSummary {
  Integration: IntegrationRow;
  SourceType: SourceTypeRow | null;
  LatestRun: IntegrationRunRow | null;
  StatusColor: 'green' | 'amber' | 'red' | 'gray';
  RelativeTime: string;
}

@Injectable({
  providedIn: 'root'
})
export class IntegrationDataService {

  async LoadIntegrationSummaries(): Promise<IntegrationSummary[]> {
    const rv = new RunView();
    const [integrationsResult, runsResult, sourceTypesResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Company Integrations',
        ExtraFilter: '',
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'IsActive', 'SourceTypeID', 'SourceType', 'LastRunID',
                 'LastRunStartedAt', 'LastRunEndedAt', 'Company', 'Integration',
                 'DriverClassName', 'Configuration'],
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
        ExtraFilter: 'Status=\'Active\'',
        OrderBy: 'Name',
        Fields: ['ID', 'Name', 'Description', 'DriverClass', 'IconClass', 'Status'],
        ResultType: 'simple'
      }
    ]);

    const integrations = integrationsResult.Results as IntegrationRow[];
    const runs = runsResult.Results as IntegrationRunRow[];
    const sourceTypes = sourceTypesResult.Results as SourceTypeRow[];

    return integrations.map(integration => this.buildSummary(integration, runs, sourceTypes));
  }

  async LoadEntityMaps(companyIntegrationID: string): Promise<EntityMapRow[]> {
    const rv = new RunView();
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

  async LoadFieldMaps(entityMapID: string): Promise<FieldMapRow[]> {
    const rv = new RunView();
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

  async LoadRunHistory(companyIntegrationID: string, limit: number = 10): Promise<IntegrationRunRow[]> {
    const rv = new RunView();
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

  async LoadRunDetails(runID: string): Promise<RunDetailRow[]> {
    const rv = new RunView();
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

  async LoadSourceTypes(): Promise<SourceTypeRow[]> {
    const rv = new RunView();
    const result = await rv.RunView<SourceTypeRow>({
      EntityName: 'MJ: Integration Source Types',
      ExtraFilter: 'Status=\'Active\'',
      OrderBy: 'Name',
      Fields: ['ID', 'Name', 'Description', 'DriverClass', 'IconClass', 'Status'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  private buildSummary(
    integration: IntegrationRow,
    allRuns: IntegrationRunRow[],
    sourceTypes: SourceTypeRow[]
  ): IntegrationSummary {
    const latestRun = allRuns.find(r => r.CompanyIntegrationID === integration.ID) ?? null;
    const sourceType = sourceTypes.find(st => st.ID === integration.SourceTypeID) ?? null;
    const statusColor = this.computeStatusColor(latestRun, integration.IsActive);
    const relativeTime = this.computeRelativeTime(latestRun?.StartedAt ?? null);

    return {
      Integration: integration,
      SourceType: sourceType,
      LatestRun: latestRun,
      StatusColor: statusColor,
      RelativeTime: relativeTime
    };
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
