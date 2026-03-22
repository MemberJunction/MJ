import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subscription, BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { CompositeKey } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import {
  SchedulingInstrumentationService,
  JobStatistics,
  JobTypeStatistics
} from '../services/scheduling-instrumentation.service';

@Component({
  standalone: false,
  selector: 'app-scheduling-jobs',
  templateUrl: './scheduling-jobs.component.html',
  styleUrls: ['./scheduling-jobs.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchedulingJobsComponent implements OnInit, OnDestroy {
  @Input() initialState: Record<string, unknown> = {};
  @Output() stateChange = new EventEmitter<Record<string, unknown>>();

  public Jobs: JobStatistics[] = [];
  public FilteredJobs: JobStatistics[] = [];
  public JobTypes: JobTypeStatistics[] = [];
  public IsLoading = true;

  // Slideout state
  public SlideoutOpen = false;
  public SelectedJob: JobStatistics | null = null;

  // Delete confirmation state
  public DeleteConfirmJobId: string | null = null;
  public IsDeleting = false;

  // Filters
  public SearchTerm = '';
  public StatusFilter = '';
  public TypeFilter = '';

  public StatusOptions = ['', 'Active', 'Paused', 'Disabled', 'Pending', 'Expired'];
  public TypeOptions: string[] = [''];

  // Settings keys
  private static readonly SEARCH_STATE_KEY = 'Scheduling.JobsSearchState';

  private searchSubject = new BehaviorSubject<string>('');
  private statusSubject = new BehaviorSubject<string>('');
  private typeSubject = new BehaviorSubject<string>('');
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
    this.setupFilters();
    this.setupSettingsPersistence();

    this.subscriptions.push(
      this.schedulingService.jobStatistics$.subscribe(jobs => {
        this.Jobs = jobs;
        this.IsLoading = false;
        this.updateTypeOptions();
        this.applyFilters();
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
      const stateStr = UserInfoEngine.Instance.GetSetting(SchedulingJobsComponent.SEARCH_STATE_KEY);
      if (stateStr) {
        const state = JSON.parse(stateStr) as Record<string, string>;
        if (state.searchTerm) this.SearchTerm = state.searchTerm;
        if (state.statusFilter) this.StatusFilter = state.statusFilter;
        if (state.typeFilter) this.TypeFilter = state.typeFilter;
      }
    } catch (error) {
      console.warn('[SchedulingJobs] Failed to load user settings:', error);
    } finally {
      this.settingsLoaded = true;
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
        typeFilter: this.TypeFilter
      };
      UserInfoEngine.Instance.SetSettingDebounced(
        SchedulingJobsComponent.SEARCH_STATE_KEY,
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('[SchedulingJobs] Failed to persist search state:', error);
    }
  }

  private restoreState(): void {
    if (this.initialState) {
      if (this.initialState['searchTerm']) this.SearchTerm = this.initialState['searchTerm'] as string;
      if (this.initialState['statusFilter']) this.StatusFilter = this.initialState['statusFilter'] as string;
      if (this.initialState['typeFilter']) this.TypeFilter = this.initialState['typeFilter'] as string;
    }
  }

  private setupFilters(): void {
    this.subscriptions.push(
      combineLatest([
        this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()),
        this.statusSubject.pipe(distinctUntilChanged()),
        this.typeSubject.pipe(distinctUntilChanged())
      ]).subscribe(() => {
        this.applyFilters();
        this.emitState();
        this.cdr.markForCheck();
      })
    );

    this.searchSubject.next(this.SearchTerm);
    this.statusSubject.next(this.StatusFilter);
    this.typeSubject.next(this.TypeFilter);
  }

  public OnSearchChange(term: string): void {
    this.SearchTerm = term;
    this.searchSubject.next(term);
  }

  public OnStatusFilterChange(status: string): void {
    this.StatusFilter = status;
    this.statusSubject.next(status);
  }

  public OnTypeFilterChange(type: string): void {
    this.TypeFilter = type;
    this.typeSubject.next(type);
  }

  public Refresh(): void {
    this.schedulingService.refresh();
  }

  public OpenCreateSlideout(): void {
    this.SelectedJob = null;
    this.SlideoutOpen = true;
    this.cdr.markForCheck();
  }

  public OpenEditSlideout(job: JobStatistics): void {
    this.SelectedJob = job;
    this.SlideoutOpen = true;
    this.cdr.markForCheck();
  }

  public CloseSlideout(): void {
    this.SlideoutOpen = false;
    this.SelectedJob = null;
    this.cdr.markForCheck();
  }

  public OnSlideoutSaved(): void {
    this.CloseSlideout();
    this.schedulingService.refresh();
  }

  public async ToggleJobStatus(job: JobStatistics, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const newStatus = job.status === 'Active' ? 'Paused' : 'Active';
    await this.schedulingService.updateJobStatus(job.jobId, newStatus as 'Active' | 'Paused');
  }

  public ShowDeleteConfirm(job: JobStatistics, event: MouseEvent): void {
    event.stopPropagation();
    this.DeleteConfirmJobId = job.jobId;
    this.cdr.markForCheck();
  }

  public CancelDelete(event: MouseEvent): void {
    event.stopPropagation();
    this.DeleteConfirmJobId = null;
    this.cdr.markForCheck();
  }

  public async ConfirmDelete(jobId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    this.IsDeleting = true;
    this.cdr.markForCheck();
    try {
      const result = await this.schedulingService.deleteJob(jobId);
      if (result) {
        this.DeleteConfirmJobId = null;
      }
    } catch (err) {
      console.error('[SchedulingJobs] Delete error:', err);
    } finally {
      this.IsDeleting = false;
      this.cdr.markForCheck();
    }
  }

  public IsDeleteConfirming(jobId: string): boolean {
    return this.DeleteConfirmJobId === jobId;
  }

  public OpenEntityRecord(job: JobStatistics): void {
    const compositeKey = new CompositeKey();
    compositeKey.LoadFromSingleKeyValuePair('ID', job.jobId);
    SharedService.Instance.OpenEntityRecord('MJ: Scheduled Jobs', compositeKey);
  }

  public GetStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'status-active';
      case 'Paused': return 'status-paused';
      case 'Disabled': return 'status-disabled';
      case 'Pending': return 'status-pending';
      case 'Expired': return 'status-expired';
      default: return '';
    }
  }

  public GetSuccessRateColor(rate: number): string {
    if (rate >= 0.9) return '#10b981';
    if (rate >= 0.7) return '#f59e0b';
    return '#ef4444';
  }

  public GetTypeIcon(typeName: string): string {
    const lower = typeName.toLowerCase();
    if (lower.includes('agent')) return 'fa-solid fa-robot';
    if (lower.includes('action')) return 'fa-solid fa-bolt';
    return 'fa-solid fa-gear';
  }

  public FormatDate(date: Date | undefined): string {
    if (!date) return '-';
    return date.toLocaleString(undefined, {
      month: 'numeric', day: 'numeric', year: '2-digit',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  public FormatPercentage(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  private applyFilters(): void {
    let filtered = [...this.Jobs];

    if (this.SearchTerm) {
      const term = this.SearchTerm.toLowerCase();
      filtered = filtered.filter(j =>
        j.jobName.toLowerCase().includes(term) ||
        j.jobType.toLowerCase().includes(term) ||
        (j.description && j.description.toLowerCase().includes(term))
      );
    }

    if (this.StatusFilter) {
      filtered = filtered.filter(j => j.status === this.StatusFilter);
    }

    if (this.TypeFilter) {
      filtered = filtered.filter(j => j.jobType === this.TypeFilter);
    }

    this.FilteredJobs = filtered;
  }

  private updateTypeOptions(): void {
    const types = new Set(this.Jobs.map(j => j.jobType));
    this.TypeOptions = ['', ...Array.from(types).sort()];
  }

  private emitState(): void {
    this.stateChange.emit({
      searchTerm: this.SearchTerm,
      statusFilter: this.StatusFilter,
      typeFilter: this.TypeFilter
    });
    this.settingsPersistSubject.next();
  }
}
