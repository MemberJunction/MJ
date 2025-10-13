import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SchedulingInstrumentationService, SchedulingKPIs, JobExecution, UpcomingExecution } from '../services/scheduling-instrumentation.service';

@Component({
  selector: 'app-scheduling-monitoring',
  templateUrl: './scheduling-monitoring.component.html',
  styleUrls: ['./scheduling-monitoring.component.scss']
})
export class SchedulingMonitoringComponent implements OnInit, OnDestroy {
  @Input() initialState: any;
  @Output() stateChange = new EventEmitter<any>();

  public kpis: SchedulingKPIs | null = null;
  public liveExecutions: JobExecution[] = [];
  public upcomingExecutions: UpcomingExecution[] = [];
  public isLoading = false;
  public autoRefreshInterval: number = 30000; // 30 seconds
  public autoRefreshEnabled = true;

  private destroy$ = new Subject<void>();
  private refreshTimer: any;

  constructor(
    private schedulingService: SchedulingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadState();
    this.loadData();
    this.setupAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  private loadState(): void {
    if (this.initialState) {
      this.autoRefreshInterval = this.initialState.autoRefreshInterval || 30000;
      this.autoRefreshEnabled = this.initialState.autoRefreshEnabled !== false;
    }
  }

  private loadData(): void {
    this.isLoading = true;

    this.schedulingService.kpis$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (kpis) => {
          this.kpis = kpis;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading KPIs:', error);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });

    this.schedulingService.liveExecutions$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (executions) => {
          this.liveExecutions = executions;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading live executions:', error);
          this.cdr.markForCheck();
        }
      });

    this.schedulingService.upcomingExecutions$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (executions) => {
          this.upcomingExecutions = executions;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading upcoming executions:', error);
          this.cdr.markForCheck();
        }
      });
  }

  private setupAutoRefresh(): void {
    if (this.autoRefreshEnabled) {
      this.refreshTimer = setInterval(() => {
        this.schedulingService.refresh();
      }, this.autoRefreshInterval);
    }
  }

  public onRefresh(): void {
    this.schedulingService.refresh();
  }

  public toggleAutoRefresh(): void {
    this.autoRefreshEnabled = !this.autoRefreshEnabled;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    if (this.autoRefreshEnabled) {
      this.setupAutoRefresh();
    }
    this.emitStateChange();
  }

  public setRefreshInterval(interval: number): void {
    this.autoRefreshInterval = interval;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    if (this.autoRefreshEnabled) {
      this.setupAutoRefresh();
    }
    this.emitStateChange();
  }

  public getStatusClass(status: string): string {
    switch (status) {
      case 'Running': return 'status-running';
      case 'Completed': return 'status-success';
      case 'Failed': return 'status-error';
      case 'Cancelled': return 'status-warning';
      case 'Timeout': return 'status-warning';
      default: return 'status-info';
    }
  }

  public getStatusIcon(status: string): string {
    switch (status) {
      case 'Running': return 'fa-spinner fa-spin';
      case 'Completed': return 'fa-check-circle';
      case 'Failed': return 'fa-exclamation-circle';
      case 'Cancelled': return 'fa-ban';
      case 'Timeout': return 'fa-clock';
      default: return 'fa-question-circle';
    }
  }

  public formatDuration(ms?: number): string {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  public formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  }

  public formatTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffMs < 0) return 'Overdue!';
    if (diffSeconds < 60) return `${diffSeconds}s`;
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}h ${diffMinutes % 60}m`;
    return date.toLocaleDateString();
  }

  public formatCost(cost: number): string {
    if (cost < 0.01) return '$' + cost.toFixed(4);
    if (cost < 1) return '$' + cost.toFixed(3);
    return '$' + cost.toFixed(2);
  }

  public formatPercentage(value: number): string {
    return (value * 100).toFixed(1) + '%';
  }

  private emitStateChange(): void {
    const state = {
      autoRefreshInterval: this.autoRefreshInterval,
      autoRefreshEnabled: this.autoRefreshEnabled
    };
    this.stateChange.emit(state);
  }
}
