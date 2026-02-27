import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subscription, BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { CompositeKey } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import {
  SchedulingInstrumentationService,
  JobExecution,
  ExecutionTrendData,
  JobTypeStatistics
} from '../services/scheduling-instrumentation.service';

type TimeRange = '24h' | '7d' | '30d' | '90d';

@Component({
  standalone: false,
  selector: 'app-scheduling-activity',
  templateUrl: './scheduling-activity.component.html',
  styleUrls: ['./scheduling-activity.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchedulingActivityComponent implements OnInit, OnDestroy {
  @Input() initialState: Record<string, unknown> = {};
  @Output() stateChange = new EventEmitter<Record<string, unknown>>();

  public Executions: JobExecution[] = [];
  public FilteredExecutions: JobExecution[] = [];
  public Trends: ExecutionTrendData[] = [];
  public JobTypes: JobTypeStatistics[] = [];
  public IsLoading = true;

  public SearchTerm = '';
  public StatusFilter = '';
  public JobNameFilter = '';
  public SelectedTimeRange: TimeRange = '7d';
  public StatusOptions = ['', 'Running', 'Completed', 'Failed', 'Cancelled', 'Timeout'];
  public UniqueJobNames: string[] = [];
  public ExpandedExecutionIds = new Set<string>();
  public TimeRanges: { value: TimeRange; label: string }[] = [
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' }
  ];

  private static readonly SEARCH_STATE_KEY = 'Scheduling.ActivitySearchState';

  private searchSubject = new BehaviorSubject<string>('');
  private statusSubject = new BehaviorSubject<string>('');
  private jobNameSubject = new BehaviorSubject<string>('');
  private settingsPersistSubject = new Subject<void>();
  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];
  private settingsLoaded = false;

  constructor(
    private schedulingService: SchedulingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadUserSettings();
    this.restoreState();
    this.applyTimeRange();
    this.setupFilters();
    this.setupSettingsPersistence();

    this.subscriptions.push(
      this.schedulingService.executionHistory$.subscribe(execs => {
        this.Executions = execs;
        this.IsLoading = false;
        this.applyFilters();
        this.cdr.markForCheck();
      }),
      this.schedulingService.executionTrends$.subscribe(trends => {
        this.Trends = trends;
        this.cdr.markForCheck();
      }),
      this.schedulingService.jobTypes$.subscribe(types => {
        this.JobTypes = types;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  private loadUserSettings(): void {
    try {
      const stateStr = UserInfoEngine.Instance.GetSetting(SchedulingActivityComponent.SEARCH_STATE_KEY);
      if (stateStr) {
        const state = JSON.parse(stateStr) as Record<string, string>;
        if (state.searchTerm) this.SearchTerm = state.searchTerm;
        if (state.statusFilter) this.StatusFilter = state.statusFilter;
        if (state.jobNameFilter) this.JobNameFilter = state.jobNameFilter;
        if (state.timeRange) this.SelectedTimeRange = state.timeRange as TimeRange;
      }
    } catch (error) {
      console.warn('[SchedulingActivity] Failed to load user settings:', error);
    } finally {
      this.settingsLoaded = true;
    }
  }

  private restoreState(): void {
    if (this.initialState) {
      if (this.initialState['searchTerm']) this.SearchTerm = this.initialState['searchTerm'] as string;
      if (this.initialState['statusFilter']) this.StatusFilter = this.initialState['statusFilter'] as string;
      if (this.initialState['jobNameFilter']) this.JobNameFilter = this.initialState['jobNameFilter'] as string;
      if (this.initialState['timeRange']) this.SelectedTimeRange = this.initialState['timeRange'] as TimeRange;
    }
  }

  private setupSettingsPersistence(): void {
    this.settingsPersistSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.persistSearchState();
    });
  }

  private persistSearchState(): void {
    if (!this.settingsLoaded) return;
    try {
      const state = {
        searchTerm: this.SearchTerm,
        statusFilter: this.StatusFilter,
        jobNameFilter: this.JobNameFilter,
        timeRange: this.SelectedTimeRange
      };
      UserInfoEngine.Instance.SetSettingDebounced(
        SchedulingActivityComponent.SEARCH_STATE_KEY,
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('[SchedulingActivity] Failed to persist search state:', error);
    }
  }

  private setupFilters(): void {
    this.subscriptions.push(
      combineLatest([
        this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()),
        this.statusSubject.pipe(distinctUntilChanged()),
        this.jobNameSubject.pipe(distinctUntilChanged())
      ]).subscribe(() => {
        this.applyFilters();
        this.emitState();
        this.cdr.markForCheck();
      })
    );
    this.searchSubject.next(this.SearchTerm);
    this.statusSubject.next(this.StatusFilter);
    this.jobNameSubject.next(this.JobNameFilter);
  }

  public OnSearchChange(term: string): void {
    this.SearchTerm = term;
    this.searchSubject.next(term);
  }

  public OnStatusFilterChange(status: string): void {
    this.StatusFilter = status;
    this.statusSubject.next(status);
  }

  public OnJobNameFilterChange(name: string): void {
    this.JobNameFilter = name;
    this.jobNameSubject.next(name);
  }

  public ShouldShowLabel(index: number): boolean {
    const total = this.Trends.length;
    if (total <= 10) return true;
    const step = Math.ceil(total / 8);
    return index % step === 0 || index === total - 1;
  }

  public OnTimeRangeChange(range: TimeRange): void {
    this.SelectedTimeRange = range;
    this.applyTimeRange();
    this.emitState();
  }

  public Refresh(): void {
    this.schedulingService.refresh();
  }

  public ToggleExpand(exec: JobExecution): void {
    if (this.ExpandedExecutionIds.has(exec.id)) {
      this.ExpandedExecutionIds.delete(exec.id);
    } else {
      this.ExpandedExecutionIds.add(exec.id);
    }
    this.cdr.markForCheck();
  }

  public IsExpanded(exec: JobExecution): boolean {
    return this.ExpandedExecutionIds.has(exec.id);
  }

  public OpenExecutionRecord(exec: JobExecution, event: MouseEvent): void {
    event.stopPropagation();
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromSingleKeyValuePair('ID', exec.id);
    SharedService.Instance.OpenEntityRecord('MJ: Scheduled Job Runs', compositeKey);
  }

  public OpenJobRecord(exec: JobExecution, event: MouseEvent): void {
    event.stopPropagation();
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromSingleKeyValuePair('ID', exec.jobId);
    SharedService.Instance.OpenEntityRecord('MJ: Scheduled Jobs', compositeKey);
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

  public GetTypeIcon(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('agent')) return 'fa-solid fa-robot';
    if (lower.includes('action')) return 'fa-solid fa-bolt';
    return 'fa-solid fa-gear';
  }

  public GetSuccessRateColor(rate: number): string {
    if (rate >= 0.9) return '#10b981';
    if (rate >= 0.7) return '#f59e0b';
    return '#ef4444';
  }

  public FormatDuration(ms: number | undefined): string {
    if (ms == null) return '-';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  public FormatDateTime(date: Date): string {
    return date.toLocaleString(undefined, {
      month: 'numeric', day: 'numeric', year: '2-digit',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  public FormatChartLabel(date: Date): string {
    const hours = (this.schedulingService.CurrentDateRange.end.getTime() -
                   this.schedulingService.CurrentDateRange.start.getTime()) / (1000 * 60 * 60);
    if (hours <= 24) {
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  public GetMaxTrendValue(): number {
    if (this.Trends.length === 0) return 1;
    return Math.max(...this.Trends.map(t => t.executions), 1);
  }

  public GetBarHeight(count: number): string {
    const max = this.GetMaxTrendValue();
    return `${Math.max((count / max) * 100, 2)}%`;
  }

  public FormatPercentage(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  public TruncateError(msg: string | undefined): string {
    if (!msg) return '-';
    return msg.length > 60 ? msg.substring(0, 60) + '...' : msg;
  }

  private applyTimeRange(): void {
    const now = new Date();
    let start: Date;
    switch (this.SelectedTimeRange) {
      case '24h': start = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
      case '7d': start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case '90d': start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
    }
    this.schedulingService.setDateRange(start, now);
  }

  private applyFilters(): void {
    this.buildUniqueJobNames();
    let filtered = [...this.Executions];

    if (this.SearchTerm) {
      const term = this.SearchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.jobName.toLowerCase().includes(term) ||
        (e.errorMessage && e.errorMessage.toLowerCase().includes(term))
      );
    }

    if (this.StatusFilter) {
      filtered = filtered.filter(e => e.status === this.StatusFilter);
    }

    if (this.JobNameFilter) {
      filtered = filtered.filter(e => e.jobName === this.JobNameFilter);
    }

    this.FilteredExecutions = filtered;
  }

  private buildUniqueJobNames(): void {
    const names = new Set<string>();
    for (const exec of this.Executions) {
      names.add(exec.jobName);
    }
    this.UniqueJobNames = Array.from(names).sort();
  }

  private emitState(): void {
    this.stateChange.emit({
      searchTerm: this.SearchTerm,
      statusFilter: this.StatusFilter,
      jobNameFilter: this.JobNameFilter,
      timeRange: this.SelectedTimeRange
    });
    this.settingsPersistSubject.next();
  }
}
