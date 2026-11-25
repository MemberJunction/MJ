import { ChangeDetectorRef, Component, inject, AfterViewInit } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { ApplicationSettingEngine, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { TabService } from '@memberjunction/ng-base-application';
import { DescribeCron, ListRefreshService } from '@memberjunction/ng-list-management';
import type { ListRefreshSummary } from '@memberjunction/ng-list-management';

import { ValidateEnumParam, ValidateStringParam } from '../../shared/agent-tool-validation';
import { BuildNotFoundError, CapListNames, ResolveNamedRecord } from '../lists-agent-context';
import {
  AttentionMessage,
  ComputeRefreshStats,
  IsSourceChanged,
  NeedsAttention,
  RefreshStatusLabel,
  RefreshStatusTone,
  RefreshStats,
  ScheduleLabel,
  SelectUpcomingRefreshes,
  SourceLabel,
  UpcomingRefresh,
} from '../lists-refresh-status';

/** The Lists application, whose settings hold the defaults for new lists' refresh routines. */
const LISTS_APPLICATION_ID = '140166B9-4064-4C3F-ACF1-3EB7DB2C9BD0';

/** Shown when the Lists app settings are missing; matches the server's fallback. */
const FALLBACK_DEFAULTS = { Cron: '0 2 * * *', Timezone: 'America/New_York' };

type OwnerFilter = 'anyone' | 'me';

/**
 * Lists app → Refreshes (mockup board 2): every list that refreshes from a view or query, in one
 * place. Stat tiles, the lists that need attention, a table of all self-updating lists, the
 * defaults new lists' routines copy, and what runs in the next 24 hours.
 *
 * 🚨 SAFETY BOUNDARY (agent tools): the agent may filter, open a list or a routine for viewing,
 * and reload. It may NOT refresh a list, approve a source change, unlink a source, pause or
 * resume a routine, or change the Lists app defaults — those stay human actions in the List form.
 */
@RegisterClass(BaseResourceComponent, 'ListsRefreshesResource')
@Component({
  standalone: false,
  selector: 'mj-lists-refreshes-resource',
  templateUrl: './lists-refreshes-resource.component.html',
  styleUrls: ['./lists-refreshes-resource.component.css'],
})
export class ListsRefreshesResource extends BaseResourceComponent implements AfterViewInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly tabService = inject(TabService);
  private readonly refreshService = inject(ListRefreshService);

  public IsLoading = true;
  public ErrorMessage: string | null = null;
  public OwnerFilter: OwnerFilter = 'anyone';
  public Summaries: ListRefreshSummary[] = [];
  public Stats: RefreshStats = { SelfUpdating: 0, Scheduled: 0, ManualOnly: 0, SourceChanged: 0, Failed: 0 };
  public Attention: ListRefreshSummary[] = [];
  public Upcoming: UpcomingRefresh[] = [];
  public DefaultSchedule = '';
  public DefaultTimezone = '';

  /** Self-updating lists after the owner filter, for the table. */
  public get VisibleSummaries(): ListRefreshSummary[] {
    if (this.OwnerFilter === 'anyone') return this.Summaries;
    const me = this.ProviderToUse.CurrentUser?.ID;
    return this.Summaries.filter((s) => !!me && UUIDsEqual(s.OwnerID, me));
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    await this.LoadData();
    this.NotifyLoadComplete();
  }

  ngAfterViewInit(): void {
    this.registerAgentTools();
    this.publishAgentContext();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  /** Loads every self-updating list and the Lists app defaults. */
  public async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.ErrorMessage = null;
    this.cdr.detectChanges();
    try {
      this.refreshService.Provider = this.ProviderToUse;
      const [summaries] = await Promise.all([this.refreshService.LoadSummariesAsync(), this.loadDefaults()]);
      this.applySummaries(summaries);
    } catch (e) {
      this.ErrorMessage = e instanceof Error ? e.message : String(e);
    } finally {
      this.IsLoading = false;
      this.publishAgentContext();
      this.cdr.detectChanges();
    }
  }

  private applySummaries(summaries: ListRefreshSummary[]): void {
    this.Summaries = summaries.filter((s) => s.Status !== 'Static');
    this.Stats = ComputeRefreshStats(this.Summaries);
    this.Attention = this.Summaries.filter((s) => NeedsAttention(s.Status));
    this.Upcoming = SelectUpcomingRefreshes(this.Summaries, new Date());
  }

  private async loadDefaults(): Promise<void> {
    const p = this.ProviderToUse;
    const engine = <ApplicationSettingEngine>ApplicationSettingEngine.GetProviderInstance(p, ApplicationSettingEngine);
    await engine.Config(false, p.CurrentUser, p);
    const cron = engine.GetSetting('Lists.Refresh.DefaultCron', LISTS_APPLICATION_ID)?.trim() || FALLBACK_DEFAULTS.Cron;
    this.DefaultSchedule = DescribeCron(cron);
    this.DefaultTimezone = engine.GetSetting('Lists.Refresh.DefaultTimezone', LISTS_APPLICATION_ID)?.trim() || FALLBACK_DEFAULTS.Timezone;
  }

  public SetOwnerFilter(filter: OwnerFilter): void {
    this.OwnerFilter = filter;
    this.publishAgentContext();
    this.cdr.detectChanges();
  }

  // --- template helpers ---------------------------------------------------

  public StatusLabel(s: ListRefreshSummary): string { return RefreshStatusLabel(s.Status); }
  public StatusTone(s: ListRefreshSummary): string { return RefreshStatusTone(s.Status); }
  public SourceText(s: ListRefreshSummary): string { return SourceLabel(s); }
  public ScheduleText(s: ListRefreshSummary): string { return ScheduleLabel(s); }
  public AttentionText(s: ListRefreshSummary): string { return AttentionMessage(s); }
  public IsSourceChange(s: ListRefreshSummary): boolean { return IsSourceChanged(s.Status); }

  /** The Next column: when the routine runs next, "Paused", or a dash. */
  public NextText(s: ListRefreshSummary): string {
    if (s.Routine?.Status === 'Paused') return 'Paused';
    if (!s.AutoRefresh || !s.Routine || s.Routine.Status !== 'Active' || !s.Routine.NextRunAt) return '—';
    return this.FormatWhen(s.Routine.NextRunAt);
  }

  public FormatWhen(date: Date | null): string {
    if (!date) return 'Never';
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay ? `Today ${time}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  }

  // --- navigation ---------------------------------------------------------

  public OpenList(listID: string, listName: string): void {
    const appId = this.Data?.Configuration?.applicationId || '';
    this.tabService.OpenList(listID, listName, appId);
  }

  public OpenRoutine(s: ListRefreshSummary): void {
    if (!s.Routine) return;
    this.navigationService.OpenEntityRecord('MJ: User Routines', CompositeKey.FromID(s.Routine.ID));
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Refreshes';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-rotate';
  }

  // --- agent --------------------------------------------------------------

  private publishAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      Surface: 'ListsRefreshes',
      IsLoading: this.IsLoading,
      OwnerFilter: this.OwnerFilter,
      SelfUpdatingListCount: this.Stats.SelfUpdating,
      ScheduledListCount: this.Stats.Scheduled,
      ManualOnlyListCount: this.Stats.ManualOnly,
      SourceChangedListCount: this.Stats.SourceChanged,
      FailedListCount: this.Stats.Failed,
      AttentionListNames: CapListNames(this.Attention.map((s) => `${s.ListName} (${RefreshStatusLabel(s.Status)})`)),
      VisibleListNames: CapListNames(this.VisibleSummaries.map((s) => s.ListName)),
      VisibleListCount: this.VisibleSummaries.length,
      UpcomingRefreshNames: CapListNames(this.Upcoming.map((u) => u.ListName)),
      DefaultSchedule: `${this.DefaultSchedule} (${this.DefaultTimezone})`,
    });
  }

  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'FilterRefreshesByOwner',
        Description: 'Show self-updating lists owned by anyone, or only by me.',
        ParameterSchema: { type: 'object', properties: { owner: { type: 'string', enum: ['anyone', 'me'] } }, required: ['owner'] },
        Handler: async (params: Record<string, unknown>) => {
          const check = ValidateEnumParam(params['owner'], ['anyone', 'me'] as const, 'owner');
          if (!check.ok) return check.result;
          this.SetOwnerFilter(check.value);
          return { Success: true, Data: { visibleListCount: this.VisibleSummaries.length } };
        },
      },
      {
        Name: 'OpenSelfUpdatingList',
        Description: 'Open a self-updating list by ID or name (exact ID, exact name, or partial name). A list whose source changed opens on its review screen.',
        ParameterSchema: { type: 'object', properties: { list: { type: 'string' } }, required: ['list'] },
        Handler: async (params: Record<string, unknown>) => this.openListTool(params['list']),
      },
      {
        Name: 'RefreshRefreshesData',
        Description: 'Reload the Refreshes page. Reads only; it does not refresh any list.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.LoadData();
          return { Success: true, Data: { selfUpdatingListCount: this.Stats.SelfUpdating } };
        },
      },
    ]);
  }

  private openListTool(value: unknown): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    const check = ValidateStringParam(value, 'list');
    if (!check.ok) return check.result;
    const candidates = this.Summaries.map((s) => ({ ID: s.ListID, Name: s.ListName }));
    const match = ResolveNamedRecord(check.value, candidates);
    if (!match) return { Success: false, ErrorMessage: BuildNotFoundError(check.value, candidates, 'list') };
    this.OpenList(match.ID, match.Name);
    return { Success: true, Data: { listName: match.Name } };
  }
}

/** Tree-shaking prevention */
export function LoadListsRefreshesResource(): void {}
