import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SchedulingInstrumentationService, JobStatistics } from '../services/scheduling-instrumentation.service';

@Component({
  standalone: false,
  selector: 'app-scheduling-jobs',
  templateUrl: './scheduling-jobs.component.html',
  styleUrls: ['./scheduling-jobs.component.css']
})
export class SchedulingJobsComponent implements OnInit, OnDestroy {
  @Input() initialState: any;
  @Output() stateChange = new EventEmitter<any>();

  public jobs: JobStatistics[] = [];
  public filteredJobs: JobStatistics[] = [];
  public isLoading = false;

  public searchTerm$ = new BehaviorSubject<string>('');
  public statusFilter$ = new BehaviorSubject<string>('all');
  public typeFilter$ = new BehaviorSubject<string>('all');

  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Paused', value: 'Paused' },
    { text: 'Disabled', value: 'Disabled' },
    { text: 'Pending', value: 'Pending' },
    { text: 'Expired', value: 'Expired' }
  ];

  public typeOptions: Array<{text: string, value: string}> = [
    { text: 'All Types', value: 'all' }
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
      if (this.initialState.typeFilter) this.typeFilter$.next(this.initialState.typeFilter);
    }
  }

  private setupFilters(): void {
    combineLatest([
      this.searchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.statusFilter$.pipe(distinctUntilChanged()),
      this.typeFilter$.pipe(distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
        this.emitStateChange();
      });
  }

  private loadData(): void {
    this.isLoading = true;

    this.schedulingService.jobStatistics$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (jobs) => {
          this.jobs = jobs;
          this.updateTypeOptions();
          this.applyFilters();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading jobs:', error);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private updateTypeOptions(): void {
    const uniqueTypes = Array.from(new Set(this.jobs.map(j => j.jobType)));
    this.typeOptions = [
      { text: 'All Types', value: 'all' },
      ...uniqueTypes.map(type => ({ text: type, value: type }))
    ];
  }

  private applyFilters(): void {
    let filtered = [...this.jobs];

    const searchTerm = this.searchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(job =>
        job.jobName.toLowerCase().includes(searchTerm) ||
        job.jobType.toLowerCase().includes(searchTerm)
      );
    }

    const statusFilter = this.statusFilter$.value;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(job => job.status === statusFilter);
    }

    const typeFilter = this.typeFilter$.value;
    if (typeFilter !== 'all') {
      filtered = filtered.filter(job => job.jobType === typeFilter);
    }

    this.filteredJobs = filtered;
    this.cdr.markForCheck();
  }

  public onSearchChange(value: string): void {
    this.searchTerm$.next(value);
  }

  public onStatusFilterChange(value: string): void {
    this.statusFilter$.next(value);
  }

  public onTypeFilterChange(value: string): void {
    this.typeFilter$.next(value);
  }

  public onRefresh(): void {
    this.schedulingService.refresh();
  }

  public getStatusColor(status: string): 'base' | 'info' | 'success' | 'warning' | 'error' | 'none' {
    switch (status) {
      case 'Active': return 'success';
      case 'Paused': return 'warning';
      case 'Disabled': return 'error';
      case 'Pending': return 'info';
      case 'Expired': return 'error';
      default: return 'info';
    }
  }

  public getStatusIcon(status: string): string {
    switch (status) {
      case 'Active': return 'fa-play-circle';
      case 'Paused': return 'fa-pause-circle';
      case 'Disabled': return 'fa-ban';
      case 'Pending': return 'fa-clock';
      case 'Expired': return 'fa-calendar-times';
      default: return 'fa-question-circle';
    }
  }

  public formatPercentage(value: number): string {
    return (value * 100).toFixed(1) + '%';
  }

  public formatDate(date?: Date): string {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  }

  public async onPauseJob(jobId: string): Promise<void> {
    const result = await this.schedulingService.updateJobStatus(jobId, 'Paused');
    if (result) {
      console.log('Job paused successfully');
    }
  }

  public async onResumeJob(jobId: string): Promise<void> {
    const result = await this.schedulingService.updateJobStatus(jobId, 'Active');
    if (result) {
      console.log('Job resumed successfully');
    }
  }

  public async onExecuteJob(jobId: string): Promise<void> {
    const result = await this.schedulingService.executeJobManually(jobId);
    if (result) {
      console.log('Job executed successfully');
    }
  }

  private emitStateChange(): void {
    const state = {
      searchTerm: this.searchTerm$.value,
      statusFilter: this.statusFilter$.value,
      typeFilter: this.typeFilter$.value
    };
    this.stateChange.emit(state);
  }
}
