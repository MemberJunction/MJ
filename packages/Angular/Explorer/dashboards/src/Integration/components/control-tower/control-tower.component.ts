import { Component, OnInit, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import {
  IntegrationDataService,
  IntegrationSummary,
  IntegrationKPIs,
  ActivityFeedItem,
  DailyRecordCount
} from '../../services/integration-data.service';

type StatusColorType = 'green' | 'amber' | 'red' | 'gray';

@RegisterClass(BaseResourceComponent, 'IntegrationControlTower')
@Component({
  standalone: false,
  selector: 'app-control-tower',
  templateUrl: './control-tower.component.html',
  styleUrls: ['./control-tower.component.scss']
})
export class ControlTowerComponent extends BaseResourceComponent implements OnInit {
  /**
   * The Provider @Input is inherited from BaseAngularComponent.
   * Use this.RunViewToUse to get the appropriate IRunViewProvider
   * for multi-MJ-instance support.
   */

  Summaries: IntegrationSummary[] = [];
  KPIs: IntegrationKPIs = {
    TotalIntegrations: 0,
    ActiveSyncs: 0,
    RecordsSyncedToday: 0,
    ErrorRate: 0,
    AverageSyncDurationMs: null
  };
  ActivityFeed: ActivityFeedItem[] = [];
  DailyCounts: DailyRecordCount[] = [];

  IsLoading = false;
  ExpandedID: string | null = null;

  private dataService = inject(IntegrationDataService);

  async ngOnInit(): Promise<void> {
    await this.LoadData();
  }

  async LoadData(): Promise<void> {
    this.IsLoading = true;
    try {
      const provider = this.RunViewToUse;
      const [summaries, activityFeed, dailyCounts] = await Promise.all([
        this.dataService.LoadIntegrationSummaries(provider),
        this.dataService.LoadRecentRuns(20, provider),
        this.dataService.LoadDailyRecordCounts(7, provider)
      ]);
      this.Summaries = summaries;
      this.KPIs = this.dataService.ComputeKPIs(summaries);
      this.ActivityFeed = activityFeed;
      this.DailyCounts = dailyCounts;
    } catch (err) {
      console.error('[IntegrationControlTower] Failed to load data:', err);
    } finally {
      this.IsLoading = false;
    }
  }

  async Refresh(): Promise<void> {
    await this.LoadData();
  }

  OnRunNow(integrationID: string): void {
    console.log('[IntegrationControlTower] Run Now clicked for integration:', integrationID);
  }

  OnExpandToggle(integrationID: string): void {
    this.ExpandedID = UUIDsEqual(this.ExpandedID, integrationID) ? null : integrationID;
  }

  IsExpanded(integrationID: string): boolean {
    return UUIDsEqual(this.ExpandedID, integrationID);
  }

  get MaxDailyRecords(): number {
    if (this.DailyCounts.length === 0) return 1;
    const maxVal = Math.max(...this.DailyCounts.map(d => d.Records));
    return maxVal > 0 ? maxVal : 1;
  }

  BarHeight(records: number): number {
    return Math.max((records / this.MaxDailyRecords) * 100, 2);
  }

  FormatDuration(ms: number | null): string {
    return this.dataService.FormatDuration(ms);
  }

  FormatErrorRate(rate: number): string {
    return rate > 0 ? `${rate}%` : '0%';
  }

  StatusChipClass(color: StatusColorType): string {
    return `status-chip status-${color}`;
  }

  SourceIconClass(summary: IntegrationSummary): string {
    return summary.SourceType?.IconClass ?? 'fa-solid fa-plug';
  }

  StatusLabel(color: StatusColorType): string {
    if (color === 'green') return 'Healthy';
    if (color === 'amber') return 'Warning';
    if (color === 'red') return 'Failed';
    return 'Inactive';
  }

  FormatRelativeTime(dateStr: string | null): string {
    return this.dataService.ComputeRelativeTime(dateStr);
  }

  ActivityStatusIcon(status: string): string {
    if (status === 'Success') return 'fa-solid fa-circle-check';
    if (status === 'Failed') return 'fa-solid fa-circle-xmark';
    if (status === 'In Progress') return 'fa-solid fa-spinner fa-spin';
    return 'fa-solid fa-clock';
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Integration Control Tower';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-tower-broadcast';
  }
}

export function LoadIntegrationDashboard(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
