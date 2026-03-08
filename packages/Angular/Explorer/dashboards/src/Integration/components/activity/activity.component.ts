import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { IRunViewProvider, RunView } from '@memberjunction/core';
import {
  IntegrationDataService,
  IntegrationSummary,
  IntegrationRunRow,
  RunDetailRow,
  EntityMapRow,
} from '../../services/integration-data.service';

type StatusFilterType = 'All' | 'Success' | 'Failed' | 'In Progress' | 'Pending';
type DateFilterType = 'today' | '7d' | '30d' | 'all';

interface WatermarkRow {
  ID: string;
  EntityMapID: string;
  WatermarkType: string;
  WatermarkValue: string | null;
  LastAppliedAt: string | null;
  EntityMap: string;
}

interface IntegrationOption {
  ID: string;
  Name: string;
}

@RegisterClass(BaseResourceComponent, 'IntegrationActivity')
@Component({
  standalone: false,
  selector: 'app-integration-activity',
  templateUrl: './activity.component.html',
  styleUrls: ['./activity.component.css']
})
export class ActivityComponent extends BaseResourceComponent implements OnInit {

  // Data
  AllRuns: IntegrationRunRow[] = [];
  FilteredRuns: IntegrationRunRow[] = [];
  Integrations: IntegrationOption[] = [];
  SelectedRunID: string | null = null;
  SelectedRunDetails: RunDetailRow[] = [];
  WatermarkData: WatermarkRow[] = [];
  IsLoading = true;
  IsLoadingDetail = false;

  // Filters
  StatusFilter: StatusFilterType = 'All';
  IntegrationFilter: string | null = null;
  DateFilter: DateFilterType = '7d';
  SearchQuery = '';
  ExpandedRunID: string | null = null;

  // Expanded row details cache
  private expandedDetails: RunDetailRow[] = [];
  private isLoadingExpanded = false;

  // Detail panel tab
  ActiveDetailTab: 'entities' | 'watermarks' = 'entities';
  IsLoadingWatermarks = false;

  StatusOptions: StatusFilterType[] = ['All', 'Success', 'Failed', 'In Progress', 'Pending'];
  DateOptions: { Value: DateFilterType; Label: string }[] = [
    { Value: 'today', Label: 'Today' },
    { Value: '7d', Label: '7 Days' },
    { Value: '30d', Label: '30 Days' },
    { Value: 'all', Label: 'All' }
  ];

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    await this.LoadData();
  }

  // ── Data Loading ──────────────────────────────────────────

  async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.detectChanges();
    try {
      const provider = this.RunViewToUse;
      const [summaries, runs] = await Promise.all([
        this.dataService.LoadIntegrationSummaries(provider),
        this.loadAllRuns(provider)
      ]);
      this.Integrations = this.buildIntegrationOptions(summaries);
      this.AllRuns = runs;
      this.ApplyFilters();
    } catch (err) {
      console.error('[IntegrationActivity] Failed to load data:', err);
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadAllRuns(provider: IRunViewProvider | null): Promise<IntegrationRunRow[]> {
    const rv = new RunView(provider ?? null);
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

  private buildIntegrationOptions(summaries: IntegrationSummary[]): IntegrationOption[] {
    return summaries.map(s => ({
      ID: s.Integration.ID,
      Name: `${s.Integration.Integration} (${s.Integration.Company})`
    }));
  }

  async LoadRunDetails(runID: string): Promise<RunDetailRow[]> {
    try {
      return await this.dataService.LoadRunDetails(runID, this.RunViewToUse);
    } catch (err) {
      console.error('[IntegrationActivity] Failed to load run details:', err);
      return [];
    }
  }

  async LoadWatermarks(companyIntegrationID: string): Promise<void> {
    this.IsLoadingWatermarks = true;
    this.cdr.detectChanges();
    try {
      this.WatermarkData = await this.loadWatermarkData(companyIntegrationID);
    } catch (err) {
      console.error('[IntegrationActivity] Failed to load watermarks:', err);
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

  // ── Filtering ─────────────────────────────────────────────

  ApplyFilters(): void {
    let filtered = this.AllRuns;
    filtered = this.filterByStatus(filtered);
    filtered = this.filterByIntegration(filtered);
    filtered = this.filterByDate(filtered);
    filtered = this.filterBySearch(filtered);
    this.FilteredRuns = filtered;
  }

  private filterByStatus(runs: IntegrationRunRow[]): IntegrationRunRow[] {
    if (this.StatusFilter === 'All') return runs;
    return runs.filter(r => r.Status === this.StatusFilter);
  }

  private filterByIntegration(runs: IntegrationRunRow[]): IntegrationRunRow[] {
    if (!this.IntegrationFilter) return runs;
    return runs.filter(r => UUIDsEqual(r.CompanyIntegrationID, this.IntegrationFilter));
  }

  private filterByDate(runs: IntegrationRunRow[]): IntegrationRunRow[] {
    const cutoff = this.getDateCutoff(this.DateFilter);
    if (!cutoff) return runs;
    return runs.filter(r => r.StartedAt && new Date(r.StartedAt) >= cutoff);
  }

  private filterBySearch(runs: IntegrationRunRow[]): IntegrationRunRow[] {
    if (!this.SearchQuery.trim()) return runs;
    const query = this.SearchQuery.toLowerCase().trim();
    return runs.filter(r =>
      r.Integration?.toLowerCase().includes(query) ||
      r.Company?.toLowerCase().includes(query)
    );
  }

  private getDateCutoff(range: DateFilterType): Date | null {
    if (range === 'all') return null;
    const now = new Date();
    if (range === 'today') {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return today;
    }
    const days = range === '7d' ? 7 : 30;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }

  SetStatusFilter(status: StatusFilterType): void {
    this.StatusFilter = status;
    this.ApplyFilters();
  }

  SetDateFilter(range: DateFilterType): void {
    this.DateFilter = range;
    this.ApplyFilters();
  }

  SetIntegrationFilter(id: string | null): void {
    this.IntegrationFilter = id;
    this.ApplyFilters();
  }

  OnSearchChange(): void {
    this.ApplyFilters();
  }

  async Refresh(): Promise<void> {
    await this.LoadData();
  }

  // ── Run Selection & Expansion ─────────────────────────────

  async SelectRun(runID: string): Promise<void> {
    if (UUIDsEqual(this.SelectedRunID, runID)) {
      this.SelectedRunID = null;
      this.SelectedRunDetails = [];
      this.WatermarkData = [];
      return;
    }
    this.SelectedRunID = runID;
    this.ActiveDetailTab = 'entities';
    this.IsLoadingDetail = true;
    this.cdr.detectChanges();

    const run = this.findRunByID(runID);
    try {
      this.SelectedRunDetails = await this.LoadRunDetails(runID);
      if (run) {
        await this.LoadWatermarks(run.CompanyIntegrationID);
      }
    } finally {
      this.IsLoadingDetail = false;
      this.cdr.detectChanges();
    }
  }

  async ToggleExpand(runID: string): Promise<void> {
    if (UUIDsEqual(this.ExpandedRunID, runID)) {
      this.ExpandedRunID = null;
      this.expandedDetails = [];
      return;
    }
    this.ExpandedRunID = runID;
    this.isLoadingExpanded = true;
    this.cdr.detectChanges();
    try {
      this.expandedDetails = await this.LoadRunDetails(runID);
    } finally {
      this.isLoadingExpanded = false;
      this.cdr.detectChanges();
    }
  }

  IsExpanded(runID: string): boolean {
    return UUIDsEqual(this.ExpandedRunID, runID);
  }

  IsSelectedRun(runID: string): boolean {
    return UUIDsEqual(this.SelectedRunID, runID);
  }

  GetExpandedDetails(): RunDetailRow[] {
    return this.expandedDetails;
  }

  IsLoadingExpandedDetails(): boolean {
    return this.isLoadingExpanded;
  }

  GetSelectedRun(): IntegrationRunRow | null {
    return this.findRunByID(this.SelectedRunID);
  }

  SetDetailTab(tab: 'entities' | 'watermarks'): void {
    this.ActiveDetailTab = tab;
  }

  private findRunByID(runID: string | null): IntegrationRunRow | null {
    if (!runID) return null;
    return this.AllRuns.find(r => UUIDsEqual(r.ID, runID)) ?? null;
  }

  // ── Formatting Helpers ────────────────────────────────────

  FormatDuration(startedAt: string | null, endedAt: string | null): string {
    if (!startedAt || !endedAt) return '--';
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    return this.dataService.FormatDuration(ms);
  }

  GetRelativeTime(dateStr: string | null): string {
    return this.dataService.ComputeRelativeTime(dateStr);
  }

  FormatAbsoluteDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  FormatWatermark(value: string | null): string {
    if (!value) return 'Not set';
    if (value.length > 40) return value.substring(0, 37) + '...';
    return value;
  }

  FormatDate(dateStr: string | null): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  GetStatusIcon(status: string): string {
    if (status === 'Success') return 'fa-solid fa-circle-check';
    if (status === 'Failed') return 'fa-solid fa-circle-xmark';
    if (status === 'In Progress') return 'fa-solid fa-spinner fa-spin';
    return 'fa-solid fa-clock';
  }

  GetStatusColor(status: string): string {
    if (status === 'Success') return 'green';
    if (status === 'Failed') return 'red';
    if (status === 'In Progress') return 'amber';
    return 'gray';
  }

  GetStatusDotClass(status: string): string {
    return `status-dot dot-${this.GetStatusColor(status)}`;
  }

  StatusChipClass(status: string): string {
    return `chip chip-${this.GetStatusColor(status)}`;
  }

  GetErrorCount(run: IntegrationRunRow): number {
    return run.ErrorLog ? 1 : 0;
  }

  // ── Summary Computed Properties ───────────────────────────

  get TotalRuns(): number {
    return this.FilteredRuns.length;
  }

  get SuccessfulRuns(): number {
    return this.FilteredRuns.filter(r => r.Status === 'Success').length;
  }

  get FailedRuns(): number {
    return this.FilteredRuns.filter(r => r.Status === 'Failed').length;
  }

  get TotalRecordsProcessed(): number {
    return this.FilteredRuns.reduce((acc, r) => acc + r.TotalRecords, 0);
  }

  // ── Duration Bar (detail panel) ───────────────────────────

  GetDurationBarWidth(run: IntegrationRunRow): number {
    if (!run.StartedAt || !run.EndedAt) return 0;
    return 100;
  }

  GetDurationBarLabel(run: IntegrationRunRow): string {
    return this.FormatDuration(run.StartedAt, run.EndedAt);
  }

  // ── Resource overrides ────────────────────────────────────

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Activity';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-clock-rotate-left';
  }
}

export function LoadActivityComponent(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
