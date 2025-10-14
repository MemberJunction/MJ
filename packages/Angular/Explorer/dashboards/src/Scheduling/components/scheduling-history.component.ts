import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SchedulingInstrumentationService, JobExecution, ExecutionTrendData } from '../services/scheduling-instrumentation.service';

@Component({
  selector: 'app-scheduling-history',
  templateUrl: './scheduling-history.component.html',
  styleUrls: ['./scheduling-history.component.scss']
})
export class SchedulingHistoryComponent implements OnInit, OnDestroy {
  @Input() initialState: any;
  @Output() stateChange = new EventEmitter<any>();

  public executions: JobExecution[] = [];
  public filteredExecutions: JobExecution[] = [];
  public trends: ExecutionTrendData[] = [];
  public isLoading = false;

  public dateRange = {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date()
  };

  public searchTerm$ = new BehaviorSubject<string>('');
  public statusFilter$ = new BehaviorSubject<string>('all');

  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Running', value: 'Running' },
    { text: 'Completed', value: 'Completed' },
    { text: 'Failed', value: 'Failed' },
    { text: 'Cancelled', value: 'Cancelled' },
    { text: 'Timeout', value: 'Timeout' }
  ];

  public timeRangeOptions = [
    { text: 'Last 24 Hours', value: 1 },
    { text: 'Last 7 Days', value: 7 },
    { text: 'Last 30 Days', value: 30 },
    { text: 'Last 90 Days', value: 90 }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private schedulingService: SchedulingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadState();
    this.setupFilters();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadState(): void {
    if (this.initialState) {
      if (this.initialState.searchTerm) this.searchTerm$.next(this.initialState.searchTerm);
      if (this.initialState.statusFilter) this.statusFilter$.next(this.initialState.statusFilter);
      if (this.initialState.dateRange) {
        this.dateRange = {
          start: new Date(this.initialState.dateRange.start),
          end: new Date(this.initialState.dateRange.end)
        };
      }
    }
  }

  private setupFilters(): void {
    combineLatest([
      this.searchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.statusFilter$.pipe(distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
        this.emitStateChange();
      });
  }

  private loadData(): void {
    this.isLoading = true;

    this.schedulingService.executionHistory$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (executions) => {
          this.executions = executions;
          this.applyFilters();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading execution history:', error);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });

    this.schedulingService.executionTrends$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trends) => {
          this.trends = trends;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading trends:', error);
          this.cdr.markForCheck();
        }
      });
  }

  private applyFilters(): void {
    let filtered = [...this.executions];

    const searchTerm = this.searchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(exec =>
        exec.jobName.toLowerCase().includes(searchTerm) ||
        exec.jobType.toLowerCase().includes(searchTerm) ||
        (exec.errorMessage && exec.errorMessage.toLowerCase().includes(searchTerm))
      );
    }

    const statusFilter = this.statusFilter$.value;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(exec => exec.status === statusFilter);
    }

    this.filteredExecutions = filtered;
    this.cdr.markForCheck();
  }

  public onSearchChange(value: string): void {
    this.searchTerm$.next(value);
  }

  public onStatusFilterChange(value: string): void {
    this.statusFilter$.next(value);
  }

  public onTimeRangeChange(days: number): void {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    this.dateRange = { start, end };
    this.schedulingService.setDateRange(start, end);
    this.emitStateChange();
  }

  public onRefresh(): void {
    this.schedulingService.refresh();
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

  public formatDate(date: Date): string {
    return new Date(date).toLocaleString();
  }

  private emitStateChange(): void {
    const state = {
      searchTerm: this.searchTerm$.value,
      statusFilter: this.statusFilter$.value,
      dateRange: this.dateRange
    };
    this.stateChange.emit(state);
  }
}
