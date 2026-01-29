import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import {
  SchedulingInstrumentationService,
  SchedulingKPIs,
  JobExecution,
  UpcomingExecution,
  LockInfo,
  AlertCondition
} from '../services/scheduling-instrumentation.service';

@Component({
  selector: 'app-scheduling-overview',
  templateUrl: './scheduling-overview.component.html',
  styleUrls: ['./scheduling-overview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchedulingOverviewComponent implements OnInit, OnDestroy {
  @Input() initialState: Record<string, unknown> = {};
  @Output() stateChange = new EventEmitter<Record<string, unknown>>();

  public Kpis: SchedulingKPIs | null = null;
  public LiveExecutions: JobExecution[] = [];
  public UpcomingExecutions: UpcomingExecution[] = [];
  public Locks: LockInfo[] = [];
  public Alerts: AlertCondition[] = [];
  public IsLoading = true;
  public AutoRefreshEnabled = true;

  private subscriptions: Subscription[] = [];
  private autoRefreshSub: Subscription | undefined;

  constructor(
    private schedulingService: SchedulingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.initialState) {
      if (this.initialState['autoRefreshEnabled'] != null) {
        this.AutoRefreshEnabled = this.initialState['autoRefreshEnabled'] as boolean;
      }
    }

    this.subscriptions.push(
      this.schedulingService.kpis$.subscribe(kpis => {
        this.Kpis = kpis;
        this.IsLoading = false;
        this.cdr.markForCheck();
      }),
      this.schedulingService.liveExecutions$.subscribe(execs => {
        this.LiveExecutions = execs;
        this.cdr.markForCheck();
      }),
      this.schedulingService.upcomingExecutions$.subscribe(upcoming => {
        this.UpcomingExecutions = upcoming;
        this.cdr.markForCheck();
      }),
      this.schedulingService.lockInfo$.subscribe(locks => {
        this.Locks = locks;
        this.cdr.markForCheck();
      }),
      this.schedulingService.alerts$.subscribe(alerts => {
        this.Alerts = alerts;
        this.cdr.markForCheck();
      })
    );

    if (this.AutoRefreshEnabled) {
      this.startAutoRefresh();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.stopAutoRefresh();
  }

  public Refresh(): void {
    this.schedulingService.refresh();
  }

  public ToggleAutoRefresh(): void {
    this.AutoRefreshEnabled = !this.AutoRefreshEnabled;
    if (this.AutoRefreshEnabled) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
    this.emitState();
  }

  public async ReleaseLock(jobId: string): Promise<void> {
    await this.schedulingService.releaseLock(jobId);
  }

  public GetStatusIcon(status: string): string {
    switch (status) {
      case 'Running': return 'fa-solid fa-spinner fa-spin';
      case 'Completed': return 'fa-solid fa-circle-check';
      case 'Failed': return 'fa-solid fa-circle-xmark';
      case 'Cancelled': return 'fa-solid fa-ban';
      case 'Timeout': return 'fa-solid fa-clock';
      default: return 'fa-solid fa-circle-question';
    }
  }

  public GetStatusClass(status: string): string {
    switch (status) {
      case 'Running': return 'status-running';
      case 'Completed': return 'status-success';
      case 'Failed': return 'status-error';
      case 'Cancelled': return 'status-warning';
      case 'Timeout': return 'status-warning';
      default: return '';
    }
  }

  public GetAlertIcon(severity: string): string {
    return severity === 'error' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-triangle-exclamation';
  }

  public FormatDuration(ms: number | undefined): string {
    if (ms == null) return '-';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  public FormatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  }

  public FormatTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    if (diffMs <= 0) return 'Now';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    const remainingMin = diffMin % 60;
    return `${diffHr}h ${remainingMin}m`;
  }

  public FormatCost(cost: number): string {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  }

  public FormatPercentage(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  public FormatDateTime(date: Date): string {
    return date.toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  public GetSuccessRateColor(rate: number): string {
    if (rate >= 0.9) return '#10b981';
    if (rate >= 0.7) return '#f59e0b';
    return '#ef4444';
  }

  public GetHealthScore(): number {
    if (!this.Kpis) return 100;
    let score = 100;
    score -= this.Kpis.totalFailures7d * 2;
    score -= this.Kpis.lockedJobs * 10;
    score -= this.Alerts.filter(a => a.severity === 'error').length * 15;
    score -= this.Alerts.filter(a => a.severity === 'warning').length * 5;
    return Math.max(0, Math.min(100, score));
  }

  public GetHealthColor(): string {
    const score = this.GetHealthScore();
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  }

  public GetHealthStrokeDasharray(): string {
    const score = this.GetHealthScore();
    const circumference = 2 * Math.PI * 36;
    const filled = (score / 100) * circumference;
    return `${filled} ${circumference - filled}`;
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.autoRefreshSub = interval(30000).subscribe(() => {
      this.schedulingService.refresh();
    });
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshSub) {
      this.autoRefreshSub.unsubscribe();
      this.autoRefreshSub = undefined;
    }
  }

  private emitState(): void {
    this.stateChange.emit({
      autoRefreshEnabled: this.AutoRefreshEnabled
    });
  }
}
