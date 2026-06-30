import { ChangeDetectorRef, Component, OnInit, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJCompanyIntegrationEntity, MJScheduledJobEntity } from '@memberjunction/core-entities';
import { IntegrationDataService, ResolveIntegrationIcon } from '../../services/integration-data.service';
import {
  buildSchedulesAgentContext,
  resolveIntegrationSurface,
  navLabelForSurface,
  resolveIntegrationRecord,
  buildIntegrationNotFoundError,
  ScheduleSummary,
  NamedIntegrationRecord,
} from '../../integration-agent-context';
import { AgentToolResult, validateStringParam } from '../../../shared/agent-tool-validation';

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

interface ScheduleRow {
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
  ScheduledJobID: string | null;
}

interface TimelineMarker {
  Hour: number;
  Minute: number;
  IsNext: boolean;
}

interface TimelineRow {
  IntegrationID: string;
  IntegrationName: string;
  Markers: TimelineMarker[];
  IsLocked: boolean;
}

interface IntervalPreset {
  Label: string;
  Minutes: number;
}

interface CronPreset {
  Label: string;
  Expression: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@RegisterClass(BaseResourceComponent, 'IntegrationSchedules')
@Component({
  standalone: false,
  selector: 'app-integration-schedules',
  templateUrl: './schedules.component.html',
  styleUrls: ['./schedules.component.css']
})
export class SchedulesComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {

  // ---------------------------------------------------------------------------
  // Public state
  // ---------------------------------------------------------------------------

  Schedules: ScheduleRow[] = [];
  IsLoading = true;
  SavingID: string | null = null;
  RunningID: string | null = null;

  /** Track pending edits per integration ID */
  PendingChanges = new Map<string, Partial<ScheduleRow>>();

  /** Timeline data built from schedules */
  TimelineMarkers: TimelineRow[] = [];
  TimelineHours: number[] = [];

  /** Preset interval choices */
  IntervalPresets: IntervalPreset[] = [
    { Label: '5m', Minutes: 5 },
    { Label: '15m', Minutes: 15 },
    { Label: '30m', Minutes: 30 },
    { Label: '1h', Minutes: 60 },
    { Label: '6h', Minutes: 360 },
    { Label: '12h', Minutes: 720 },
    { Label: '24h', Minutes: 1440 }
  ];

  /** Preset cron expressions */
  CronPresets: CronPreset[] = [
    { Label: 'Every hour', Expression: '0 * * * *' },
    { Label: 'Every 6 hours', Expression: '0 */6 * * *' },
    { Label: 'Daily midnight', Expression: '0 0 * * *' },
    { Label: 'Weekdays 9am', Expression: '0 9 * * 1-5' }
  ];

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** JobTypeID for "Integration Sync" scheduled job type (from MJ metadata) */
  private readonly INTEGRATION_SYNC_JOB_TYPE_ID = '4CD34733-4751-4572-B946-17DF6CB3EC90';

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.dataService.Provider = this.ProviderToUse;
    this.buildTimelineHours();
    await this.LoadData();
    this.NotifyLoadComplete();
    // Refresh relative times every 60 seconds
    this.refreshTimer = setInterval(() => this.cdr.detectChanges(), 60_000);
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // AI Agent Context & Client Tools
  //
  // 🔒 SAFETY BOUNDARY: The Schedules surface exposes ONLY navigational,
  // read-only open-record, and refresh tools to the agent
  // (SwitchIntegrationSurface, OpenScheduleRecord, RefreshIntegrationData). It
  // deliberately does NOT expose any sync trigger (RunSync / RunNow — a LIVE
  // external sync), nor update-schedule (SaveSchedule / ToggleScheduleEnabled /
  // SetScheduleType / SetInterval / SetCronExpression — which create/update/disable
  // the linked ScheduledJob), nor edit-mapping / change-credentials. Changing a
  // schedule remains user-driven from the UI. OpenScheduleRecord opens the record
  // in a tab for VIEWING — it does not edit.
  // ---------------------------------------------------------------------------

  ngAfterViewInit(): void {
    this.emitAgentContext();
    this.registerAgentTools();
  }

  private emitAgentContext(): void {
    const context = buildSchedulesAgentContext({
      KPIs: {
        TotalIntegrations: this.Schedules.length,
        ActiveSyncs: 0,
        RecordsSyncedToday: 0,
        SyncErrorRate: 0,
        PipelineCount: 0,
        ScheduledSyncCount: this.ScheduledCount,
      },
      IsLoading: this.IsLoading,
      ScheduleCount: this.Schedules.length,
      EnabledCount: this.ScheduledCount,
      LockedCount: this.LockedCount,
      IntervalCount: this.countByType('Interval'),
      CronCount: this.countByType('Cron'),
      ManualCount: this.countByType('Manual'),
      VisibleSchedules: this.Schedules.map(s => this.buildScheduleSummary(s)),
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
        Name: 'OpenScheduleRecord',
        Description: 'Open a scheduled integration\'s company-integration record in a tab for viewing. Accepts the integration ID or name (exact or partial).',
        ParameterSchema: { type: 'object', properties: { integration: { type: 'string' } }, required: ['integration'] },
        Handler: async (params: Record<string, unknown>) => this.toolOpenScheduleRecord(params),
      },
      {
        Name: 'RefreshIntegrationData',
        Description: 'Reload the integration sync schedules.',
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

  private toolOpenScheduleRecord(params: Record<string, unknown>): AgentToolResult {
    const check = validateStringParam(params['integration'], 'integration');
    if (!check.ok) {
      return check.result;
    }
    const candidates: NamedIntegrationRecord[] = this.Schedules.map(s => ({
      ID: s.ID,
      Name: s.Integration ?? s.Name,
    }));
    const match = resolveIntegrationRecord(check.value, candidates);
    if (!match) {
      return { Success: false, ErrorMessage: buildIntegrationNotFoundError(check.value, candidates, 'integration') };
    }
    this.navigationService.OpenEntityRecord('MJ: Company Integrations', CompositeKey.FromID(match.ID));
    return { Success: true };
  }

  /** Count of schedules of a given cadence type. */
  private countByType(type: 'Manual' | 'Interval' | 'Cron'): number {
    return this.Schedules.filter(s => s.ScheduleType === type).length;
  }

  private buildScheduleSummary(s: ScheduleRow): ScheduleSummary {
    return {
      Name: `${s.Integration ?? s.Name} · ${this.GetNextRunRelative(s)}`,
      Type: s.ScheduleType,
      Enabled: s.ScheduleEnabled,
      Locked: s.IsLocked,
      NextRun: this.GetNextRunRelative(s),
    };
  }

  // ---------------------------------------------------------------------------
  // Resource overrides
  // ---------------------------------------------------------------------------

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Schedules';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-calendar-check';
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.detectChanges();
    try {
      const provider = this.RunViewToUse;
      const rv = new RunView(provider ?? null);
      const result = await rv.RunView<ScheduleRow>({
        EntityName: 'MJ: Company Integrations',
        ExtraFilter: '',
        OrderBy: 'Name',
        Fields: [
          'ID', 'Name', 'Integration', 'Company', 'IsActive',
          'ScheduleEnabled', 'ScheduleType', 'ScheduleIntervalMinutes',
          'CronExpression', 'NextScheduledRunAt', 'LastScheduledRunAt',
          'IsLocked', 'LockedAt', 'ScheduledJobID'
        ],
        ResultType: 'simple'
      });
      this.Schedules = result.Results;
      this.BuildTimeline();
    } catch (err) {
      console.error('[SchedulesComponent] Failed to load data:', err);
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
      this.emitAgentContext();
    }
  }

  // ---------------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------------

  BuildTimeline(): void {
    const now = new Date();
    const rows: TimelineRow[] = [];

    for (const schedule of this.Schedules) {
      if (!schedule.ScheduleEnabled) continue;

      const markers = this.computeMarkersForSchedule(schedule, now);
      if (markers.length > 0 || schedule.IsLocked) {
        rows.push({
          IntegrationID: schedule.ID,
          IntegrationName: schedule.Integration ?? schedule.Name,
          Markers: markers,
          IsLocked: schedule.IsLocked
        });
      }
    }
    this.TimelineMarkers = rows;
  }

  // ---------------------------------------------------------------------------
  // Schedule editing
  // ---------------------------------------------------------------------------

  ToggleScheduleEnabled(integrationID: string): void {
    const schedule = this.findSchedule(integrationID);
    if (!schedule) return;

    const current = this.getEffectiveValue(integrationID, 'ScheduleEnabled', schedule.ScheduleEnabled);
    this.setPendingChange(integrationID, 'ScheduleEnabled', !current);
  }

  SetScheduleType(integrationID: string, type: 'Manual' | 'Interval' | 'Cron'): void {
    this.setPendingChange(integrationID, 'ScheduleType', type);
  }

  SetInterval(integrationID: string, minutes: number): void {
    this.setPendingChange(integrationID, 'ScheduleIntervalMinutes', minutes);
    this.setPendingChange(integrationID, 'ScheduleType', 'Interval');
  }

  SetCronExpression(integrationID: string, expression: string): void {
    this.setPendingChange(integrationID, 'CronExpression', expression);
  }

  OnCronInputChange(integrationID: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.SetCronExpression(integrationID, input.value);
  }

  SetCustomInterval(integrationID: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value > 0) {
      this.SetInterval(integrationID, value);
    }
  }

  HasChanges(integrationID: string): boolean {
    return this.PendingChanges.has(integrationID);
  }

  // ---------------------------------------------------------------------------
  // Save & Run
  // ---------------------------------------------------------------------------

  async SaveSchedule(integrationID: string): Promise<void> {
    const changes = this.PendingChanges.get(integrationID);
    if (!changes) return;

    this.SavingID = integrationID;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const entity = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
      await entity.Load(integrationID);

      // Resolve effective values (pending change wins over stored value)
      const scheduleEnabled = changes.ScheduleEnabled ?? (entity.Get('ScheduleEnabled') as boolean);
      const scheduleType = (changes.ScheduleType ?? entity.Get('ScheduleType') as string) as 'Manual' | 'Interval' | 'Cron';
      const cronExpression = changes.CronExpression ?? (entity.Get('CronExpression') as string | null);
      const intervalMinutes = changes.ScheduleIntervalMinutes ?? (entity.Get('ScheduleIntervalMinutes') as number | null);

      // Apply schedule fields to the entity
      if (changes.ScheduleEnabled !== undefined) entity.Set('ScheduleEnabled', changes.ScheduleEnabled);
      if (changes.ScheduleType !== undefined) entity.Set('ScheduleType', changes.ScheduleType);
      if (changes.ScheduleIntervalMinutes !== undefined) entity.Set('ScheduleIntervalMinutes', changes.ScheduleIntervalMinutes);
      if (changes.CronExpression !== undefined) entity.Set('CronExpression', changes.CronExpression);

      // Create/update/disable the linked ScheduledJob so the scheduler actually fires
      await this.SyncScheduledJob(entity, scheduleEnabled, scheduleType, cronExpression, intervalMinutes, integrationID);

      const saved = await entity.Save();
      if (saved) {
        this.PendingChanges.delete(integrationID);
        await this.LoadData();
      } else {
        console.error('[SchedulesComponent] Failed to save schedule:', entity.LatestResult?.CompleteMessage);
      }
    } catch (err) {
      console.error('[SchedulesComponent] Error saving schedule:', err);
    } finally {
      this.SavingID = null;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduled job sync helpers
  // ---------------------------------------------------------------------------

  /**
   * Creates, updates, or disables the ScheduledJob record linked to this integration.
   * When enabled with a real schedule type, ensures an Active ScheduledJob exists.
   * When disabled or set to Manual, marks the ScheduledJob as Disabled (if one exists).
   */
  private async SyncScheduledJob(
    entity: MJCompanyIntegrationEntity,
    enabled: boolean,
    scheduleType: 'Manual' | 'Interval' | 'Cron',
    cronExpression: string | null,
    intervalMinutes: number | null,
    integrationID: string
  ): Promise<void> {
    const effectiveCron = this.ResolveCronExpression(scheduleType, cronExpression, intervalMinutes);
    const existingJobID = entity.Get('ScheduledJobID') as string | null;
    const shouldBeActive = enabled && scheduleType !== 'Manual' && !!effectiveCron;

    if (shouldBeActive) {
      const jobID = await this.UpsertScheduledJob(existingJobID, entity, effectiveCron!, integrationID);
      if (jobID !== existingJobID) {
        entity.Set('ScheduledJobID', jobID);
      }
    } else if (existingJobID) {
      await this.DisableScheduledJob(existingJobID);
    }
  }

  /** Converts schedule type + config into a cron expression. */
  private ResolveCronExpression(
    scheduleType: 'Manual' | 'Interval' | 'Cron',
    cronExpression: string | null,
    intervalMinutes: number | null
  ): string | null {
    if (scheduleType === 'Cron') return cronExpression;
    if (scheduleType === 'Interval' && intervalMinutes) return this.IntervalToCron(intervalMinutes);
    return null;
  }

  /** Converts an interval in minutes to an equivalent cron expression. */
  private IntervalToCron(minutes: number): string {
    if (minutes < 60) return `*/${minutes} * * * *`;
    const hours = minutes / 60;
    if (Number.isInteger(hours)) return hours === 1 ? '0 * * * *' : `0 */${hours} * * *`;
    return `*/${minutes} * * * *`;
  }

  /**
   * Creates a new ScheduledJob or updates the existing one.
   * Returns the ID of the job (new or existing).
   */
  private async UpsertScheduledJob(
    existingJobID: string | null,
    entity: MJCompanyIntegrationEntity,
    cronExpression: string,
    integrationID: string
  ): Promise<string> {
    const md = this.ProviderToUse;

    if (existingJobID) {
      const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
      const loaded = await job.Load(existingJobID);
      if (loaded) {
        job.Set('CronExpression', cronExpression);
        job.Set('Status', 'Active');
        // Reset NextRunAt so the scheduler picks up the new cron immediately
        job.Set('NextRunAt', new Date());
        await job.Save();
        return existingJobID;
      }
    }

    // No existing job (or failed to load) — create a new one
    const integrationName = (entity.Get('Name') as string) ?? (entity.Get('Integration') as string) ?? 'Integration';
    const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
    job.NewRecord();
    job.Set('Name', `${integrationName} Sync`);
    job.Set('JobTypeID', this.INTEGRATION_SYNC_JOB_TYPE_ID);
    job.Set('CronExpression', cronExpression);
    job.Set('Timezone', 'UTC');
    job.Set('Status', 'Active');
    job.Set('ConcurrencyMode', 'Skip');
    job.Set('Configuration', JSON.stringify({ CompanyIntegrationID: integrationID }));
    // Set NextRunAt to now so the scheduler fires it on next poll without needing a restart
    job.Set('NextRunAt', new Date());
    await job.Save();
    return job.Get('ID') as string;
  }

  /** Sets an existing ScheduledJob to Disabled so it stops firing. */
  private async DisableScheduledJob(jobID: string): Promise<void> {
    const md = this.ProviderToUse;
    const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
    const loaded = await job.Load(jobID);
    if (loaded) {
      job.Set('Status', 'Disabled');
      await job.Save();
    }
  }

  async RunNow(integrationID: string): Promise<void> {
    if (this.RunningID) return;
    this.RunningID = integrationID;
    this.cdr.detectChanges();

    try {
      const result = await this.dataService.RunSync(integrationID);
      if (!result.Success) {
        console.error('[SchedulesComponent] RunSync failed:', result.Message);
      }
      await this.LoadData();
    } catch (err) {
      console.error('[SchedulesComponent] RunNow error:', err);
    } finally {
      this.RunningID = null;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Template helpers
  // ---------------------------------------------------------------------------

  GetEffectiveScheduleEnabled(schedule: ScheduleRow): boolean {
    return this.getEffectiveValue(schedule.ID, 'ScheduleEnabled', schedule.ScheduleEnabled) as boolean;
  }

  GetEffectiveScheduleType(schedule: ScheduleRow): 'Manual' | 'Interval' | 'Cron' {
    return this.getEffectiveValue(schedule.ID, 'ScheduleType', schedule.ScheduleType) as 'Manual' | 'Interval' | 'Cron';
  }

  GetEffectiveInterval(schedule: ScheduleRow): number | null {
    return this.getEffectiveValue(schedule.ID, 'ScheduleIntervalMinutes', schedule.ScheduleIntervalMinutes) as number | null;
  }

  GetEffectiveCron(schedule: ScheduleRow): string | null {
    return this.getEffectiveValue(schedule.ID, 'CronExpression', schedule.CronExpression) as string | null;
  }

  IsIntervalSelected(schedule: ScheduleRow, minutes: number): boolean {
    return this.GetEffectiveInterval(schedule) === minutes;
  }

  GetNextRunRelative(schedule: ScheduleRow): string {
    if (!schedule.NextScheduledRunAt) return 'Not scheduled';
    const next = new Date(schedule.NextScheduledRunAt);
    const diffMs = next.getTime() - Date.now();
    if (diffMs < 0) return 'Overdue';
    return 'in ' + this.formatDurationMs(diffMs);
  }

  GetLastRunRelative(schedule: ScheduleRow): string {
    if (!schedule.LastScheduledRunAt) return 'Never';
    return this.dataService.ComputeRelativeTime(schedule.LastScheduledRunAt);
  }

  GetCronDescription(expression: string | null): string {
    if (!expression) return '';
    const parts = expression.split(' ');
    if (parts.length !== 5) return expression;
    const [min, hour, , , dow] = parts;
    if (min === '0' && hour === '*') return 'Every hour';
    if (min === '0' && hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;
    if (min === '0' && hour !== '*' && dow === '*') return `Daily at ${hour}:00`;
    if (min === '0' && hour !== '*' && dow === '1-5') return `Weekdays at ${hour}:00`;
    if (dow === '1-5') return `Weekdays at ${hour}:${min.padStart(2, '0')}`;
    return expression;
  }

  GetIntegrationIcon(name: string): string {
    return ResolveIntegrationIcon(name);
  }

  ComputeTimelinePosition(hour: number, minute: number): number {
    return ((hour * 60 + minute) / (24 * 60)) * 100;
  }

  IsSaving(integrationID: string): boolean {
    return UUIDsEqual(this.SavingID, integrationID);
  }

  IsRunning(integrationID: string): boolean {
    return UUIDsEqual(this.RunningID, integrationID);
  }

  get ScheduledCount(): number {
    return this.Schedules.filter(s => s.ScheduleEnabled).length;
  }

  get LockedCount(): number {
    return this.Schedules.filter(s => s.IsLocked).length;
  }

  TrackByID(_index: number, item: ScheduleRow): string {
    return item.ID;
  }

  TrackTimelineByID(_index: number, item: TimelineRow): string {
    return item.IntegrationID;
  }

  TrackPresetByMinutes(_index: number, item: IntervalPreset): number {
    return item.Minutes;
  }

  TrackCronPresetByExpr(_index: number, item: CronPreset): string {
    return item.Expression;
  }

  TrackHour(_index: number, hour: number): number {
    return hour;
  }

  TrackMarker(index: number, _item: TimelineMarker): number {
    return index;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private findSchedule(integrationID: string): ScheduleRow | undefined {
    return this.Schedules.find(s => UUIDsEqual(s.ID, integrationID));
  }

  private getEffectiveValue<K extends keyof ScheduleRow>(
    integrationID: string,
    field: K,
    originalValue: ScheduleRow[K]
  ): ScheduleRow[K] {
    const changes = this.PendingChanges.get(integrationID);
    if (changes && field in changes) {
      return changes[field] as ScheduleRow[K];
    }
    return originalValue;
  }

  private setPendingChange<K extends keyof ScheduleRow>(
    integrationID: string,
    field: K,
    value: ScheduleRow[K]
  ): void {
    const existing = this.PendingChanges.get(integrationID) ?? {};
    existing[field] = value;
    this.PendingChanges.set(integrationID, existing);
    this.cdr.detectChanges();
  }

  private buildTimelineHours(): void {
    this.TimelineHours = Array.from({ length: 24 }, (_, i) => i);
  }

  private computeMarkersForSchedule(schedule: ScheduleRow, now: Date): TimelineMarker[] {
    const markers: TimelineMarker[] = [];
    const type = schedule.ScheduleType;

    if (type === 'Interval' && schedule.ScheduleIntervalMinutes && schedule.ScheduleIntervalMinutes > 0) {
      this.computeIntervalMarkers(schedule, now, markers);
    } else if (type === 'Cron' && schedule.CronExpression) {
      this.computeCronMarkers(schedule, now, markers);
    } else if (schedule.NextScheduledRunAt) {
      this.addNextRunMarker(schedule, now, markers);
    }

    return markers;
  }

  private computeIntervalMarkers(schedule: ScheduleRow, now: Date, markers: TimelineMarker[]): void {
    const intervalMs = schedule.ScheduleIntervalMinutes! * 60_000;
    const endTime = now.getTime() + 24 * 60 * 60_000;

    // Start from the next scheduled run or from now
    let cursor = schedule.NextScheduledRunAt
      ? new Date(schedule.NextScheduledRunAt).getTime()
      : now.getTime();

    // If cursor is in the past, advance to the next future occurrence
    while (cursor < now.getTime()) {
      cursor += intervalMs;
    }

    const nextRun = cursor;

    while (cursor < endTime) {
      const d = new Date(cursor);
      markers.push({
        Hour: d.getHours(),
        Minute: d.getMinutes(),
        IsNext: cursor === nextRun
      });
      cursor += intervalMs;
    }
  }

  private computeCronMarkers(schedule: ScheduleRow, now: Date, markers: TimelineMarker[]): void {
    // Simple cron approximation for timeline display
    const times = this.approximateCronTimes(schedule.CronExpression!);
    const nextRunTime = schedule.NextScheduledRunAt ? new Date(schedule.NextScheduledRunAt) : null;

    for (const time of times) {
      const isNext = nextRunTime != null
        && time.Hour === nextRunTime.getHours()
        && time.Minute === nextRunTime.getMinutes();
      markers.push({ Hour: time.Hour, Minute: time.Minute, IsNext: isNext });
    }
  }

  private addNextRunMarker(schedule: ScheduleRow, now: Date, markers: TimelineMarker[]): void {
    const next = new Date(schedule.NextScheduledRunAt!);
    const diffMs = next.getTime() - now.getTime();
    if (diffMs >= 0 && diffMs <= 24 * 60 * 60_000) {
      markers.push({ Hour: next.getHours(), Minute: next.getMinutes(), IsNext: true });
    }
  }

  /**
   * Approximate cron schedule times within a 24-hour window.
   * Handles common patterns only -- not a full cron parser.
   */
  private approximateCronTimes(expression: string): Array<{ Hour: number; Minute: number }> {
    const parts = expression.split(' ');
    if (parts.length !== 5) return [];
    const [minPart, hourPart] = parts;
    const minute = minPart === '*' ? 0 : parseInt(minPart, 10);
    const times: Array<{ Hour: number; Minute: number }> = [];

    if (hourPart === '*') {
      // Every hour
      for (let h = 0; h < 24; h++) {
        times.push({ Hour: h, Minute: isNaN(minute) ? 0 : minute });
      }
    } else if (hourPart.startsWith('*/')) {
      const step = parseInt(hourPart.slice(2), 10);
      if (!isNaN(step) && step > 0) {
        for (let h = 0; h < 24; h += step) {
          times.push({ Hour: h, Minute: isNaN(minute) ? 0 : minute });
        }
      }
    } else {
      // Specific hour(s) — comma-separated
      const hours = hourPart.split(',').map(h => parseInt(h.trim(), 10)).filter(h => !isNaN(h));
      for (const h of hours) {
        times.push({ Hour: h, Minute: isNaN(minute) ? 0 : minute });
      }
    }

    return times;
  }

  private formatDurationMs(ms: number): string {
    const totalMinutes = Math.floor(ms / 60_000);
    if (totalMinutes < 1) return 'less than a minute';
    if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
    return `${hours}h ${minutes}m`;
  }
}

export function LoadSchedulesComponent(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
