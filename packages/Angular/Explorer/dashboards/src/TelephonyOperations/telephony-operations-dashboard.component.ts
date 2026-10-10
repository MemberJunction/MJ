import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import {
  BuildTelephonyOperationsAgentContext,
  CalculateOperationsMetrics,
  FormatCurrency,
  FormatDuration,
  ValidateChannelParam,
  ValidateTimeRangeParam,
  type ChannelFilter,
  type InteractionEventRecordLike,
  type InteractionRecordLike,
  type OperationsMetrics,
  type PhoneNumberRecordLike,
  type TimeRangeFilter,
} from './telephony-operations-agent-context';

/**
 * TELEPHONY & INTERACTION OPERATIONS DASHBOARD
 *
 * An Explorer L3 dashboard providing operational analytics across phone calls, web realtime
 * sessions, and multi-party meetings.
 *
 * Metrics computed from `MJ: Interactions`, `MJ: Interaction Events`, and `MJ: Phone Numbers`:
 * - Volume by channel (Phone, Web, Meeting) and direction (Inbound, Outbound, Internal)
 * - Answer rate and abandonment rate
 * - Average handle time (AHT) and speed to answer (ASA)
 * - Transfer and escalation volumes
 * - Cost estimates by day and by phone number
 * - Active live calls / sessions in real time
 *
 * Data is loaded in a single batched `RunViews` call and aggregated in memory.
 */
@RegisterClass(BaseResourceComponent, 'TelephonyOperationsDashboard')
@RegisterClass(BaseResourceComponent, 'InteractionOperationsDashboard')
@Component({
  standalone: false,
  selector: 'mj-telephony-operations-dashboard',
  templateUrl: './telephony-operations-dashboard.component.html',
  styleUrls: ['./telephony-operations-dashboard.component.css'],
})
export class TelephonyOperationsDashboardComponent
  extends BaseResourceComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  public IsLoading = true;
  public ErrorMessage: string | null = null;

  public SelectedTimeRange: TimeRangeFilter = '7d';
  public SelectedChannelFilter: ChannelFilter = 'all';
  public SearchQuery = '';

  public RawInteractions: InteractionRecordLike[] = [];
  public RawEvents: InteractionEventRecordLike[] = [];
  public RawPhoneNumbers: PhoneNumberRecordLike[] = [];

  public Metrics: OperationsMetrics = CalculateOperationsMetrics([], [], []);

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private readonly cdr = inject(ChangeDetectorRef);

  override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Telephony & Interaction Operations';
  }

  override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }

  override async ngOnInit(): Promise<void> {
    super.ngOnInit();
    await this.LoadData();
    this.NotifyLoadComplete();

    // The tab may have been closed while LoadData was in flight; ngOnDestroy already ran and
    // found no timer, so arming one now would leak an interval on a destroyed component.
    if (this.destroyed) {
      return;
    }

    // Auto-refresh live status every 15 seconds
    this.refreshTimer = setInterval(() => {
      this.recalculateMetrics();
      this.cdr.markForCheck();
    }, 15000);
  }

  ngAfterViewInit(): void {
    this.publishAgentContext();
    this.registerAgentClientTools();
  }

  override ngOnDestroy(): void {
    this.destroyed = true;
    super.ngOnDestroy();
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  public async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.ErrorMessage = null;
    this.cdr.markForCheck();

    try {
      const dateFilterInteractions = this.getDateFilter('StartedAt');
      const dateFilterEvents = this.getDateFilter('OccurredAt');

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const [interactionsResult, eventsResult, phoneNumbersResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Interactions',
          ResultType: 'simple',
          ExtraFilter: dateFilterInteractions,
          OrderBy: 'StartedAt DESC',
          MaxRows: 1000,
        },
        {
          EntityName: 'MJ: Interaction Events',
          ResultType: 'simple',
          ExtraFilter: dateFilterEvents,
          OrderBy: 'OccurredAt DESC',
          MaxRows: 2500,
        },
        {
          EntityName: 'MJ: Phone Numbers',
          ResultType: 'simple',
          ExtraFilter: "Status = 'Active'",
          MaxRows: 200,
        },
      ]);

      if (interactionsResult.Success && Array.isArray(interactionsResult.Results)) {
        this.RawInteractions = interactionsResult.Results as unknown as InteractionRecordLike[];
      } else {
        this.RawInteractions = [];
      }

      if (eventsResult.Success && Array.isArray(eventsResult.Results)) {
        this.RawEvents = eventsResult.Results as unknown as InteractionEventRecordLike[];
      } else {
        this.RawEvents = [];
      }

      if (phoneNumbersResult.Success && Array.isArray(phoneNumbersResult.Results)) {
        this.RawPhoneNumbers = phoneNumbersResult.Results as unknown as PhoneNumberRecordLike[];
      } else {
        this.RawPhoneNumbers = [];
      }

      this.recalculateMetrics();
    } catch (err) {
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
      this.publishAgentContext();
    }
  }

  public SetTimeRange(range: TimeRangeFilter): void {
    if (this.SelectedTimeRange !== range) {
      this.SelectedTimeRange = range;
      void this.LoadData();
    }
  }

  public SetChannelFilter(channel: ChannelFilter): void {
    if (this.SelectedChannelFilter !== channel) {
      this.SelectedChannelFilter = channel;
      this.recalculateMetrics();
      this.cdr.markForCheck();
      this.publishAgentContext();
    }
  }

  public OnSearchQueryChange(query: string): void {
    this.SearchQuery = query;
    this.cdr.markForCheck();
  }

  public get FilteredLiveInteractions(): OperationsMetrics['LiveInteractions'] {
    if (!this.SearchQuery.trim()) {
      return this.Metrics.LiveInteractions;
    }
    const q = this.SearchQuery.toLowerCase();
    return this.Metrics.LiveInteractions.filter(
      (i) =>
        (i.RemoteAddress && i.RemoteAddress.toLowerCase().includes(q)) ||
        i.Channel.toLowerCase().includes(q) ||
        i.Direction.toLowerCase().includes(q) ||
        i.ID.toLowerCase().includes(q),
    );
  }

  public get FilteredRecentInteractions(): InteractionRecordLike[] {
    let rows = this.filteredRawInteractions;
    if (this.SearchQuery.trim()) {
      const q = this.SearchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.RemoteAddress && r.RemoteAddress.toLowerCase().includes(q)) ||
          (r.EndReason && r.EndReason.toLowerCase().includes(q)) ||
          r.Channel.toLowerCase().includes(q) ||
          r.Direction.toLowerCase().includes(q) ||
          r.ID.toLowerCase().includes(q),
      );
    }
    return rows.slice(0, 15);
  }

  public FormatCost(amount: number | null): string {
    return FormatCurrency(amount ?? 0);
  }

  public FormatTime(date: Date | string | null): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  public FormatDate(date: Date | string | null): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  public ComputeDuration(started: Date | string, ended: Date | string | null): string {
    const s = started instanceof Date ? started : new Date(started);
    if (isNaN(s.getTime())) return '-';
    const e = ended ? (ended instanceof Date ? ended : new Date(ended)) : new Date();
    if (isNaN(e.getTime())) return '-';
    const sec = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 1000));
    return FormatDuration(sec);
  }

  private get filteredRawInteractions(): InteractionRecordLike[] {
    if (this.SelectedChannelFilter === 'all') {
      return this.RawInteractions;
    }
    return this.RawInteractions.filter((i) => i.Channel === this.SelectedChannelFilter);
  }

  private recalculateMetrics(): void {
    const filtered = this.filteredRawInteractions;
    const activeIds = new Set(filtered.map((i) => i.ID.toLowerCase()));
    const relevantEvents = this.RawEvents.filter((e) => activeIds.has(e.InteractionID.toLowerCase()));

    this.Metrics = CalculateOperationsMetrics(filtered, relevantEvents, this.RawPhoneNumbers);
  }

  private getDateFilter(field: string): string {
    switch (this.SelectedTimeRange) {
      case '24h':
        return `${field} >= DATEADD(hour, -24, GETUTCDATE())`;
      case '7d':
        return `${field} >= DATEADD(day, -7, GETUTCDATE())`;
      case '30d':
        return `${field} >= DATEADD(day, -30, GETUTCDATE())`;
      case 'all':
      default:
        return '1=1';
    }
  }

  private publishAgentContext(): void {
    if (!this.navigationService) return;
    const snapshot = BuildTelephonyOperationsAgentContext(
      this.Metrics,
      this.SelectedTimeRange,
      this.SelectedChannelFilter,
    );
    this.navigationService.SetAgentContext(this, snapshot);
  }

  private registerAgentClientTools(): void {
    if (!this.navigationService) return;

    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'RefreshOperationsData',
        Description: 'Refresh telephony and interaction operations data from the database.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.LoadData();
          return { Success: true };
        },
      },
      {
        Name: 'SetTimeRange',
        Description: 'Set the active time range window (24h, 7d, 30d, all).',
        ParameterSchema: {
          type: 'object',
          properties: {
            timeRange: {
              type: 'string',
              description: 'Time range to display: 24h, 7d, 30d, or all',
              enum: ['24h', '7d', '30d', 'all'],
            },
          },
          required: ['timeRange'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const validated = ValidateTimeRangeParam(params['timeRange']);
          if (!validated.ok) {
            return validated.result;
          }
          this.SetTimeRange(validated.value);
          return { Success: true };
        },
      },
      {
        Name: 'FilterByChannel',
        Description: 'Filter operations metrics by interaction channel (all, Phone, Web, Meeting).',
        ParameterSchema: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              description: 'Channel to filter: all, Phone, Web, or Meeting',
              enum: ['all', 'Phone', 'Web', 'Meeting'],
            },
          },
          required: ['channel'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const validated = ValidateChannelParam(params['channel']);
          if (!validated.ok) {
            return validated.result;
          }
          this.SetChannelFilter(validated.value);
          return { Success: true };
        },
      },
    ]);
  }
}
