import { ChangeDetectorRef, Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, IRunViewProvider, RunView } from '@memberjunction/core';
import {
  IntegrationDataService,
  IntegrationSummary,
  IntegrationRunRow,
  RunDetailRow,
  EntityMapRow,
} from '../../services/integration-data.service';
import {
  buildActivityAgentContext,
  resolveIntegrationSurface,
  navLabelForSurface,
  resolveIntegrationRecord,
  buildIntegrationNotFoundError,
  ActivityRunSummary,
  NamedIntegrationRecord,
} from '../../integration-agent-context';
import { AgentToolResult, validateEnumParam, validateStringParam } from '../../../shared/agent-tool-validation';

type StatusFilterType = 'All' | 'Success' | 'Failed' | 'In Progress' | 'Pending';
type DateFilterType = 'today' | '7d' | '30d' | 'all';

interface WatermarkRow {
  ID: string;
  EntityMapID: string;
  WatermarkType: string;
  WatermarkValue: string | null;
  LastSyncAt: string | null;
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
export class ActivityComponent extends BaseResourceComponent implements OnInit, AfterViewInit {

  // Data
  AllRuns: IntegrationRunRow[] = [];
  FilteredRuns: IntegrationRunRow[] = [];
  Summaries: IntegrationSummary[] = [];
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
    { Value: 'all', Label: 'All' },
    { Value: 'today', Label: 'Today' },
    { Value: '7d', Label: '7 Days' },
    { Value: '30d', Label: '30 Days' }
  ];

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.dataService.Provider = this.ProviderToUse;
    await this.LoadData();
    this.NotifyLoadComplete();
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
      this.Summaries = summaries;
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
      OrderBy: 'LastSyncAt DESC',
      Fields: ['ID', 'EntityMapID', 'WatermarkType', 'WatermarkValue', 'LastSyncAt'],
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
    this.emitAgentContext();
  }

  // ---------------------------------------------------------------------------
  // AI Agent Context & Client Tools
  //
  // 🔒 SAFETY BOUNDARY: The Activity surface exposes ONLY read-only filter /
  // search / select / open-record / navigation / refresh tools to the agent
  // (SwitchIntegrationSurface, FilterActivityByStatus / ByTimeRange / ByIntegration,
  // SearchActivity, ClearActivityFilters, SelectActivityRun, OpenActivityRunRecord,
  // RefreshIntegrationData). It deliberately does NOT expose any sync trigger
  // (RunSync — a LIVE external sync), nor any mutation of mappings, schedules, or
  // credentials. SelectActivityRun opens the read-only detail panel;
  // OpenActivityRunRecord opens the run record in a tab for VIEWING (not editing).
  // The agent can narrow what's shown and select/open runs; the user performs
  // every mutating action from the UI.
  // ---------------------------------------------------------------------------

  ngAfterViewInit(): void {
    this.emitAgentContext();
    this.registerAgentTools();
  }

  private emitAgentContext(): void {
    const kpis = this.dataService.ComputeKPIs(this.Summaries);
    const selectedRun = this.GetSelectedRun();
    const context = buildActivityAgentContext({
      KPIs: {
        TotalIntegrations: kpis.TotalIntegrations,
        ActiveSyncs: kpis.ActiveSyncs,
        RecordsSyncedToday: kpis.RecordsSyncedToday,
        SyncErrorRate: kpis.ErrorRate,
        PipelineCount: 0,
        ScheduledSyncCount: 0,
      },
      IsLoading: this.IsLoading,
      StatusFilter: this.StatusFilter,
      DateFilter: this.DateFilter,
      IntegrationFilterName: this.resolveIntegrationFilterName(),
      SearchQuery: this.SearchQuery,
      FilteredRunCount: this.FilteredRuns.length,
      TotalRunCount: this.AllRuns.length,
      SuccessfulRunCount: this.SuccessfulRuns,
      FailedRunCount: this.FailedRuns,
      TotalRecordsProcessed: this.TotalRecordsProcessed,
      VisibleRuns: this.FilteredRuns.map(r => this.buildRunSummary(r)),
      SelectedRunId: this.SelectedRunID,
      SelectedRunName: selectedRun ? this.runLabel(selectedRun) : null,
      AvailableIntegrationNames: this.Integrations.map(i => i.Name),
    });
    this.navigationService.SetAgentContext(this, context);
  }

  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SwitchIntegrationSurface',
        Description: 'Switch to a different Integration surface. Valid surfaces: Overview, Connections, Activity, Schedules.',
        ParameterSchema: { type: 'object', properties: { surface: { type: 'string' } }, required: ['surface'] },
        Handler: async (params: Record<string, unknown>) => this.toolSwitchSurface(params),
      },
      {
        Name: 'FilterActivityByStatus',
        Description: 'Filter the run-activity list by status. Valid: All, Success, Failed, In Progress, Pending.',
        ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterByStatus(params),
      },
      {
        Name: 'FilterActivityByTimeRange',
        Description: 'Filter the run-activity list by time range. Valid: today, 7d, 30d, all.',
        ParameterSchema: { type: 'object', properties: { range: { type: 'string' } }, required: ['range'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterByTimeRange(params),
      },
      {
        Name: 'FilterActivityByIntegration',
        Description: 'Filter the run-activity list to a single integration. Accepts the integration ID or name (exact or partial), or "all" to clear.',
        ParameterSchema: { type: 'object', properties: { integration: { type: 'string' } }, required: ['integration'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterByIntegration(params),
      },
      {
        Name: 'SearchActivity',
        Description: 'Search the run-activity list by integration or company name.',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>) => this.toolSearch(params),
      },
      {
        Name: 'ClearActivityFilters',
        Description: 'Reset the run-activity filters (status → All, time range → 7d, integration → all, search cleared).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.ResetIntegrationFilter();
          this.OnSearchValueChange('');
          return { Success: true };
        },
      },
      {
        Name: 'SelectActivityRun',
        Description: 'Open the detail panel for a run. Accepts the run ID or a run label (integration/company/status, exact or partial).',
        ParameterSchema: { type: 'object', properties: { run: { type: 'string' } }, required: ['run'] },
        Handler: async (params: Record<string, unknown>) => this.toolSelectRun(params),
      },
      {
        Name: 'OpenActivityRunRecord',
        Description: 'Open a company-integration-run record in a tab for viewing. Accepts the run ID or a run label (exact or partial).',
        ParameterSchema: { type: 'object', properties: { run: { type: 'string' } }, required: ['run'] },
        Handler: async (params: Record<string, unknown>) => this.toolOpenRunRecord(params),
      },
      {
        Name: 'RefreshIntegrationData',
        Description: 'Reload the integration run-activity history.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.LoadData();
          return { Success: true };
        },
      },
    ]);
  }

  private async toolSwitchSurface(params: Record<string, unknown>): Promise<AgentToolResult> {
    const surface = resolveIntegrationSurface(params['surface']);
    if (!surface) {
      return { Success: false, ErrorMessage: 'Invalid surface. Expected one of: Overview, Connections, Activity, Schedules.' };
    }
    const tabId = await this.navigationService.OpenNavItemByName(navLabelForSurface(surface));
    if (!tabId) {
      return { Success: false, ErrorMessage: `Could not open the "${surface}" surface.` };
    }
    return { Success: true };
  }

  private toolFilterByStatus(params: Record<string, unknown>): AgentToolResult {
    const check = validateEnumParam<StatusFilterType>(params['status'], this.StatusOptions, 'status');
    if (!check.ok) {
      return check.result;
    }
    this.SetStatusFilter(check.value);
    return { Success: true };
  }

  private toolFilterByTimeRange(params: Record<string, unknown>): AgentToolResult {
    const allowed = this.DateOptions.map(d => d.Value);
    const check = validateEnumParam<DateFilterType>(params['range'], allowed, 'range');
    if (!check.ok) {
      return check.result;
    }
    this.SetDateFilter(check.value);
    return { Success: true };
  }

  private toolFilterByIntegration(params: Record<string, unknown>): AgentToolResult {
    const check = validateStringParam(params['integration'], 'integration');
    if (!check.ok) {
      return check.result;
    }
    if (check.value.trim().toLowerCase() === 'all') {
      this.SetIntegrationFilter(null);
      return { Success: true };
    }
    const candidates: NamedIntegrationRecord[] = this.Integrations.map(i => ({ ID: i.ID, Name: i.Name }));
    const match = resolveIntegrationRecord(check.value, candidates);
    if (!match) {
      return { Success: false, ErrorMessage: buildIntegrationNotFoundError(check.value, candidates, 'integration') };
    }
    this.SetIntegrationFilter(match.ID);
    return { Success: true };
  }

  private toolSearch(params: Record<string, unknown>): AgentToolResult {
    const check = validateStringParam(params['query'], 'query');
    if (!check.ok) {
      return check.result;
    }
    this.OnSearchValueChange(check.value);
    return { Success: true };
  }

  private async toolSelectRun(params: Record<string, unknown>): Promise<AgentToolResult> {
    const match = this.resolveRunFromParam(params['run']);
    if (!match.ok) {
      return match.result;
    }
    // SelectRun toggles; only open when not already the selected run.
    if (!UUIDsEqual(this.SelectedRunID, match.value.ID)) {
      await this.SelectRun(match.value.ID);
    }
    this.emitAgentContext();
    return { Success: true };
  }

  private toolOpenRunRecord(params: Record<string, unknown>): AgentToolResult {
    const match = this.resolveRunFromParam(params['run']);
    if (!match.ok) {
      return match.result;
    }
    this.navigationService.OpenEntityRecord('MJ: Company Integration Runs', CompositeKey.FromID(match.value.ID));
    return { Success: true };
  }

  /** Resolve an agent-supplied run reference (id or label) against the loaded runs. */
  private resolveRunFromParam(
    raw: unknown,
  ): { ok: true; value: IntegrationRunRow } | { ok: false; result: AgentToolResult } {
    const check = validateStringParam(raw, 'run');
    if (!check.ok) {
      return { ok: false, result: check.result };
    }
    const candidates: NamedIntegrationRecord[] = this.AllRuns.map(r => ({ ID: r.ID, Name: this.runLabel(r) }));
    const match = resolveIntegrationRecord(check.value, candidates);
    if (!match) {
      return { ok: false, result: { Success: false, ErrorMessage: buildIntegrationNotFoundError(check.value, candidates, 'run') } };
    }
    const run = this.AllRuns.find(r => UUIDsEqual(r.ID, match.ID));
    if (!run) {
      return { ok: false, result: { Success: false, ErrorMessage: buildIntegrationNotFoundError(check.value, candidates, 'run') } };
    }
    return { ok: true, value: run };
  }

  /** Human-readable label for a run row, used for agent name-resolution + context. */
  private runLabel(run: IntegrationRunRow): string {
    const who = run.Integration ?? 'Integration';
    const company = run.Company ? ` (${run.Company})` : '';
    return `${who}${company} · ${run.Status}`;
  }

  private buildRunSummary(run: IntegrationRunRow): ActivityRunSummary {
    return {
      ID: run.ID,
      Name: this.runLabel(run),
      Status: run.Status,
      TotalRecords: run.TotalRecords,
      When: this.dataService.ComputeRelativeTime(run.StartedAt),
    };
  }

  /** Resolve the active integration-filter ID to its display name, or null. */
  private resolveIntegrationFilterName(): string | null {
    if (!this.IntegrationFilter) {
      return null;
    }
    return this.Integrations.find(i => UUIDsEqual(i.ID, this.IntegrationFilter))?.Name ?? null;
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

  /** Bridge for <mj-page-search> which emits a plain string. */
  OnSearchValueChange(value: string): void {
    this.SearchQuery = value;
    this.ApplyFilters();
  }

  // ---- Integration filter popover wiring ---------------------------------

  get ActivityFilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'dateRange',
        type: 'chips',
        label: 'Date range',
        chipOptions: this.DateOptions.map(d => ({ text: d.Label, value: d.Value })),
      },
      {
        key: 'status',
        type: 'chips',
        label: 'Status',
        chipOptions: this.StatusOptions.map(s => ({ text: s, value: s })),
      },
      {
        key: 'integration',
        type: 'dropdown',
        label: 'Integration',
        icon: 'fa-solid fa-plug',
        placeholder: 'All Integrations',
        filterable: this.Integrations.length > 10,
        options: [
          { text: 'All Integrations', value: '' },
          ...this.Integrations.map(i => ({ text: i.Name, value: i.ID })),
        ],
      },
    ];
  }

  get ActivityFilterValues(): Record<string, unknown> {
    return {
      dateRange: this.DateFilter,
      status: this.StatusFilter,
      integration: this.IntegrationFilter ?? ''
    };
  }

  get ActiveFilterCount(): number {
    let count = 0;
    if (this.DateFilter !== '7d') count++;
    if (this.StatusFilter !== 'All') count++;
    if (this.IntegrationFilter) count++;
    return count;
  }

  OnFilterValuesChange(values: Record<string, unknown>): void {
    const next = (values ?? {}) as { dateRange?: string; status?: string; integration?: string };
    if (next.dateRange && next.dateRange !== this.DateFilter) {
      this.SetDateFilter(next.dateRange as DateFilterType);
    }
    if (next.status && next.status !== this.StatusFilter) {
      this.SetStatusFilter(next.status as StatusFilterType);
    }
    const integ = next.integration ?? '';
    if ((integ || null) !== this.IntegrationFilter) {
      this.SetIntegrationFilter(integ || null);
    }
  }

  ResetIntegrationFilter(): void {
    if (this.DateFilter !== '7d') this.SetDateFilter('7d');
    if (this.StatusFilter !== 'All') this.SetStatusFilter('All');
    if (this.IntegrationFilter) this.SetIntegrationFilter(null);
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
      this.emitAgentContext();
      return;
    }
    this.SelectedRunID = runID;
    this.ActiveDetailTab = 'entities';
    this.IsLoadingDetail = true;
    this.cdr.detectChanges();
    this.emitAgentContext();

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
