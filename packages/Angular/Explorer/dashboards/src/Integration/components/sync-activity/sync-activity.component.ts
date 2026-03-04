import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { IRunViewProvider, RunView } from '@memberjunction/core';
import {
  IntegrationDataService,
  IntegrationRow,
  IntegrationRunRow,
  RunDetailRow,
  EntityMapRow,
} from '../../services/integration-data.service';

type StatusFilter = 'All' | 'Success' | 'Failed' | 'In Progress' | 'Pending';

interface WatermarkRow {
  ID: string;
  EntityMapID: string;
  WatermarkType: string;
  WatermarkValue: string | null;
  LastAppliedAt: string | null;
  EntityMap: string;
}

@RegisterClass(BaseResourceComponent, 'IntegrationSyncActivity')
@Component({
  standalone: false,
  selector: 'app-sync-activity',
  templateUrl: './sync-activity.component.html',
  styleUrls: ['./sync-activity.component.scss']
})
export class SyncActivityComponent extends BaseResourceComponent implements OnInit {

  Integrations: IntegrationRow[] = [];
  Runs: IntegrationRunRow[] = [];
  FilteredRuns: IntegrationRunRow[] = [];
  RunDetails: RunDetailRow[] = [];
  Watermarks: WatermarkRow[] = [];

  SelectedIntegrationID = '';
  SelectedStatusFilter: StatusFilter = 'All';
  SelectedRunID: string | null = null;
  ActiveDetailsTab: 'entities' | 'watermarks' = 'entities';

  IsLoadingIntegrations = false;
  IsLoadingRuns = false;
  IsLoadingDetails = false;
  IsLoadingWatermarks = false;
  ShowErrorLog = false;

  StatusOptions: StatusFilter[] = ['All', 'Success', 'Failed', 'In Progress', 'Pending'];

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    await this.loadIntegrations();
  }

  private async loadIntegrations(): Promise<void> {
    this.IsLoadingIntegrations = true;
    this.cdr.detectChanges();
    try {
      const summaries = await this.dataService.LoadIntegrationSummaries(this.RunViewToUse);
      this.Integrations = summaries.map(s => s.Integration);
    } catch (err) {
      console.error('[SyncActivity] Failed to load integrations:', err);
    } finally {
      this.IsLoadingIntegrations = false;
      this.cdr.detectChanges();
    }
  }

  async OnIntegrationChange(): Promise<void> {
    this.SelectedRunID = null;
    this.RunDetails = [];
    this.Watermarks = [];
    this.ShowErrorLog = false;
    await this.LoadRuns();
  }

  async LoadRuns(): Promise<void> {
    this.IsLoadingRuns = true;
    this.SelectedRunID = null;
    this.RunDetails = [];
    this.ShowErrorLog = false;
    this.cdr.detectChanges();
    try {
      if (this.SelectedIntegrationID) {
        this.Runs = await this.dataService.LoadRunHistory(
          this.SelectedIntegrationID, 100, this.RunViewToUse
        );
      } else {
        this.Runs = await this.loadAllRuns();
      }
      this.applyStatusFilter();
    } catch (err) {
      console.error('[SyncActivity] Failed to load runs:', err);
    } finally {
      this.IsLoadingRuns = false;
      this.cdr.detectChanges();
    }
  }

  private async loadAllRuns(): Promise<IntegrationRunRow[]> {
    const rv = new RunView(this.RunViewToUse ?? null);
    const result = await rv.RunView<IntegrationRunRow>({
      EntityName: 'MJ: Company Integration Runs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      MaxRows: 200,
      Fields: ['ID', 'CompanyIntegrationID', 'StartedAt', 'EndedAt', 'TotalRecords',
               'Status', 'ErrorLog', 'Integration', 'Company', 'RunByUser'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  OnStatusFilterChange(): void {
    this.applyStatusFilter();
  }

  private applyStatusFilter(): void {
    if (this.SelectedStatusFilter === 'All') {
      this.FilteredRuns = this.Runs;
    } else {
      this.FilteredRuns = this.Runs.filter(r => r.Status === this.SelectedStatusFilter);
    }
  }

  async OnRunClick(run: IntegrationRunRow): Promise<void> {
    if (this.SelectedRunID === run.ID) {
      this.SelectedRunID = null;
      this.RunDetails = [];
      this.Watermarks = [];
      this.ShowErrorLog = false;
      return;
    }
    this.SelectedRunID = run.ID;
    this.RunDetails = [];
    this.Watermarks = [];
    this.ShowErrorLog = false;
    this.ActiveDetailsTab = 'entities';
    await Promise.all([
      this.loadRunDetails(run.ID),
      this.loadWatermarks(run.CompanyIntegrationID),
    ]);
  }

  private async loadRunDetails(runID: string): Promise<void> {
    this.IsLoadingDetails = true;
    this.cdr.detectChanges();
    try {
      this.RunDetails = await this.dataService.LoadRunDetails(runID, this.RunViewToUse);
    } catch (err) {
      console.error('[SyncActivity] Failed to load run details:', err);
    } finally {
      this.IsLoadingDetails = false;
      this.cdr.detectChanges();
    }
  }

  private async loadWatermarks(companyIntegrationID: string): Promise<void> {
    this.IsLoadingWatermarks = true;
    this.cdr.detectChanges();
    try {
      this.Watermarks = await this.loadWatermarkData(companyIntegrationID);
    } catch (err) {
      console.error('[SyncActivity] Failed to load watermarks:', err);
    } finally {
      this.IsLoadingWatermarks = false;
      this.cdr.detectChanges();
    }
  }

  private async loadWatermarkData(companyIntegrationID: string): Promise<WatermarkRow[]> {
    const entityMaps = await this.dataService.LoadEntityMaps(companyIntegrationID, this.RunViewToUse);
    if (entityMaps.length === 0) return [];

    const entityMapIDs = entityMaps.map(m => `'${m.ID}'`).join(',');
    const rv = new RunView(this.RunViewToUse ?? null);
    const result = await rv.RunView<WatermarkRow>({
      EntityName: 'MJ: Company Integration Sync Watermarks',
      ExtraFilter: `EntityMapID IN (${entityMapIDs})`,
      OrderBy: 'LastAppliedAt DESC',
      Fields: ['ID', 'EntityMapID', 'WatermarkType', 'WatermarkValue', 'LastAppliedAt'],
      ResultType: 'simple'
    });

    return this.mergeWatermarksWithEntityMaps(result.Results, entityMaps);
  }

  private mergeWatermarksWithEntityMaps(
    watermarks: WatermarkRow[],
    entityMaps: EntityMapRow[]
  ): WatermarkRow[] {
    const mapLookup = new Map(entityMaps.map(m => [m.ID.toLowerCase(), m]));
    return watermarks.map(w => ({
      ...w,
      EntityMap: mapLookup.get(w.EntityMapID?.toLowerCase())?.ExternalObjectName ?? w.EntityMapID
    }));
  }

  SetDetailsTab(tab: 'entities' | 'watermarks'): void {
    this.ActiveDetailsTab = tab;
  }

  ToggleErrorLog(event: Event): void {
    event.stopPropagation();
    this.ShowErrorLog = !this.ShowErrorLog;
  }

  IsSelectedRun(id: string): boolean {
    return this.SelectedRunID === id;
  }

  GetSelectedRun(): IntegrationRunRow | null {
    return this.FilteredRuns.find(r => r.ID === this.SelectedRunID) ?? null;
  }

  StatusChipClass(status: string): string {
    if (status === 'Success') return 'chip chip-green';
    if (status === 'Failed') return 'chip chip-red';
    if (status === 'In Progress') return 'chip chip-amber';
    return 'chip chip-gray';
  }

  StatusIcon(status: string): string {
    if (status === 'Success') return 'fa-solid fa-circle-check';
    if (status === 'Failed') return 'fa-solid fa-circle-xmark';
    if (status === 'In Progress') return 'fa-solid fa-spinner fa-spin';
    return 'fa-solid fa-clock';
  }

  FormatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  FormatDuration(run: IntegrationRunRow): string {
    if (!run.StartedAt || !run.EndedAt) return '--';
    const ms = new Date(run.EndedAt).getTime() - new Date(run.StartedAt).getTime();
    return this.dataService.FormatDuration(ms);
  }

  FormatWatermark(value: string | null): string {
    if (!value) return 'Not set';
    if (value.length > 40) return value.substring(0, 37) + '...';
    return value;
  }

  get TotalRuns(): number { return this.Runs.length; }
  get SuccessfulRuns(): number { return this.Runs.filter(r => r.Status === 'Success').length; }
  get FailedRuns(): number { return this.Runs.filter(r => r.Status === 'Failed').length; }
  get TotalRecordsInView(): number {
    return this.FilteredRuns.reduce((acc, r) => acc + r.TotalRecords, 0);
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Sync Activity';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-clock-rotate-left';
  }
}

export function LoadSyncActivityComponent(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
