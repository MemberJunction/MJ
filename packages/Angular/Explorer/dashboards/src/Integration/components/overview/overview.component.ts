import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { RunView, IRunViewProvider } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import {
  IntegrationDataService,
  ResolveIntegrationIcon,
  IntegrationSummary,
  IntegrationKPIs,
  ActivityFeedItem,
  DailyRecordCount,
  EntityMapRow
} from '../../services/integration-data.service';

type StatusColorType = 'green' | 'amber' | 'red' | 'gray';

interface NotificationBanner {
  Type: 'success' | 'error';
  Message: string;
}

@RegisterClass(BaseResourceComponent, 'IntegrationOverview')
@Component({
  standalone: false,
  selector: 'app-integration-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.css']
})
export class OverviewComponent extends BaseResourceComponent implements OnInit, OnDestroy {

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
  EntityMapCounts: Map<string, number> = new Map();

  IsLoading = false;
  RunningIntegrationID: string | null = null;
  Notification: NotificationBanner | null = null;

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    await this.LoadData();
  }

  ngOnDestroy(): void {
    this.clearNotificationTimer();
  }

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.detectChanges();
    try {
      const provider = this.RunViewToUse;
      const [summaries, activityFeed, dailyCounts] = await Promise.all([
        this.dataService.LoadIntegrationSummaries(provider),
        this.dataService.LoadRecentRuns(10, provider),
        this.dataService.LoadDailyRecordCounts(7, provider)
      ]);
      this.Summaries = summaries;
      this.KPIs = this.dataService.ComputeKPIs(summaries);
      this.ActivityFeed = activityFeed;
      this.DailyCounts = dailyCounts;
      await this.loadEntityMapCounts(summaries, provider);
    } catch (err) {
      console.error('[IntegrationOverview] Failed to load data:', err);
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  async Refresh(): Promise<void> {
    await this.LoadData();
  }

  // ---------------------------------------------------------------------------
  // Sync Actions
  // ---------------------------------------------------------------------------

  async RunSync(integrationID: string): Promise<void> {
    if (this.RunningIntegrationID) return;
    this.RunningIntegrationID = integrationID;
    this.dismissNotification();
    this.cdr.detectChanges();

    try {
      const result = await this.dataService.RunSync(integrationID);
      if (result.Success) {
        this.showNotification('success', result.Message || 'Sync started successfully');
        await this.LoadData();
      } else {
        this.showNotification('error', result.Message || 'Sync failed');
      }
    } catch (err) {
      const error = err as Error;
      this.showNotification('error', `Unexpected error: ${error.message}`);
      console.error('[IntegrationOverview] RunSync error:', err);
    } finally {
      this.RunningIntegrationID = null;
      this.cdr.detectChanges();
    }
  }

  IsRunning(integrationID: string): boolean {
    return UUIDsEqual(this.RunningIntegrationID, integrationID);
  }

  // ---------------------------------------------------------------------------
  // KPI Helpers
  // ---------------------------------------------------------------------------

  get SuccessRate(): number {
    if (this.KPIs.ErrorRate == null) return 100;
    return Math.round((100 - this.KPIs.ErrorRate) * 10) / 10;
  }

  get SuccessRateGradient(): string {
    const pct = this.SuccessRate;
    const angle = (pct / 100) * 360;
    return `conic-gradient(#10b981 ${angle}deg, #e5e7eb ${angle}deg)`;
  }

  get ActiveCount(): number {
    return this.KPIs.ActiveSyncs;
  }

  FormatDuration(ms: number | null): string {
    return this.dataService.FormatDuration(ms);
  }

  FormatNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }

  // ---------------------------------------------------------------------------
  // Pipeline Card Helpers
  // ---------------------------------------------------------------------------

  GetIntegrationIcon(summary: IntegrationSummary): string {
    if (summary.SourceType?.IconClass) {
      return summary.SourceType.IconClass;
    }
    return this.resolveIconByName(summary.Integration.Integration ?? summary.Integration.Name);
  }

  GetStatusDotClass(color: StatusColorType): string {
    return `status-dot status-dot-${color}`;
  }

  GetStatusLabel(color: StatusColorType): string {
    if (color === 'green') return 'Healthy';
    if (color === 'amber') return 'Warning';
    if (color === 'red') return 'Error';
    return 'Inactive';
  }

  GetEntityMapCount(integrationID: string): number {
    for (const [key, value] of this.EntityMapCounts) {
      if (UUIDsEqual(key, integrationID)) return value;
    }
    return 0;
  }

  GetSparklineDotClass(run: { Status: string }): string {
    if (run.Status === 'Success') return 'spark-dot spark-green';
    if (run.Status === 'Failed') return 'spark-dot spark-red';
    if (run.Status === 'In Progress' || run.Status === 'Pending') return 'spark-dot spark-amber';
    return 'spark-dot spark-gray';
  }

  GetCardBorderClass(color: StatusColorType): string {
    return color === 'red' ? 'pipeline-card pipeline-card-error' : 'pipeline-card';
  }

  // ---------------------------------------------------------------------------
  // Bar Chart Helpers
  // ---------------------------------------------------------------------------

  get MaxDailyRecords(): number {
    if (this.DailyCounts.length === 0) return 1;
    const maxVal = Math.max(...this.DailyCounts.map(d => d.Records));
    return maxVal > 0 ? maxVal : 1;
  }

  BarHeight(records: number): number {
    return Math.max((records / this.MaxDailyRecords) * 100, 2);
  }

  // ---------------------------------------------------------------------------
  // Activity Feed Helpers
  // ---------------------------------------------------------------------------

  ActivityStatusIcon(status: string): string {
    if (status === 'Success') return 'fa-solid fa-circle-check';
    if (status === 'Failed') return 'fa-solid fa-circle-xmark';
    if (status === 'In Progress') return 'fa-solid fa-spinner fa-spin';
    return 'fa-solid fa-clock';
  }

  // ---------------------------------------------------------------------------
  // Notification Management
  // ---------------------------------------------------------------------------

  DismissNotification(): void {
    this.dismissNotification();
    this.cdr.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Resource Overrides
  // ---------------------------------------------------------------------------

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Overview';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-gauge-high';
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async loadEntityMapCounts(
    summaries: IntegrationSummary[],
    provider: IRunViewProvider | null
  ): Promise<void> {
    if (summaries.length === 0) return;
    const allMaps = await this.loadAllEntityMaps(provider);
    this.EntityMapCounts = this.countMapsByIntegration(allMaps);
  }

  private async loadAllEntityMaps(
    provider: IRunViewProvider | null
  ): Promise<EntityMapRow[]> {
    const rv = new RunView(provider ?? null);
    const result = await rv.RunView<EntityMapRow>({
      EntityName: 'MJ: Company Integration Entity Maps',
      ExtraFilter: '',
      OrderBy: 'CompanyIntegrationID',
      Fields: ['ID', 'CompanyIntegrationID'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  private countMapsByIntegration(maps: EntityMapRow[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const map of maps) {
      const current = counts.get(map.CompanyIntegrationID) ?? 0;
      counts.set(map.CompanyIntegrationID, current + 1);
    }
    return counts;
  }

  private resolveIconByName(name: string): string {
    return ResolveIntegrationIcon(name);
  }

  private showNotification(type: 'success' | 'error', message: string): void {
    this.clearNotificationTimer();
    this.Notification = { Type: type, Message: message };
    this.notificationTimer = setTimeout(() => {
      this.Notification = null;
      this.cdr.detectChanges();
    }, 5000);
  }

  private dismissNotification(): void {
    this.clearNotificationTimer();
    this.Notification = null;
  }

  private clearNotificationTimer(): void {
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
      this.notificationTimer = null;
    }
  }
}

export function LoadOverviewComponent(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
