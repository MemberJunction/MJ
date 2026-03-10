import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { IntegrationDataService, ResolveIntegrationIcon } from '../../services/integration-data.service';

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
export class SchedulesComponent extends BaseResourceComponent implements OnInit, OnDestroy {

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

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async ngOnInit(): Promise<void> {
    this.buildTimelineHours();
    await this.LoadData();
    // Refresh relative times every 60 seconds
    this.refreshTimer = setInterval(() => this.cdr.detectChanges(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
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
          'IsLocked', 'LockedAt'
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
      const md = new Metadata();
      const entity = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
      await entity.Load(integrationID);

      // Use Set() method since scheduling fields are not in the generated class yet
      if (changes.ScheduleEnabled !== undefined) entity.Set('ScheduleEnabled', changes.ScheduleEnabled);
      if (changes.ScheduleType !== undefined) entity.Set('ScheduleType', changes.ScheduleType);
      if (changes.ScheduleIntervalMinutes !== undefined) entity.Set('ScheduleIntervalMinutes', changes.ScheduleIntervalMinutes);
      if (changes.CronExpression !== undefined) entity.Set('CronExpression', changes.CronExpression);

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
