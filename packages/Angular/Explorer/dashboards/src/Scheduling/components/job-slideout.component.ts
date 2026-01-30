import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { SchedulingInstrumentationService, JobStatistics } from '../services/scheduling-instrumentation.service';

@Component({
  selector: 'app-job-slideout',
  templateUrl: './job-slideout.component.html',
  styleUrls: ['./job-slideout.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JobSlideoutComponent implements OnInit {
  @Input() Mode: 'create' | 'edit' = 'create';
  @Input() Job: JobStatistics | null = null;
  @Output() Close = new EventEmitter<void>();
  @Output() Saved = new EventEmitter<void>();

  public JobTypes: { id: string; name: string }[] = [];
  public IsSaving = false;
  public IsDeleting = false;
  public ShowDeleteConfirm = false;
  public ErrorMessage = '';

  // Form fields
  public Name = '';
  public Description = '';
  public JobTypeID = '';
  public CronExpression = '';
  public Timezone = 'UTC';
  public Status: 'Pending' | 'Active' | 'Paused' | 'Disabled' | 'Expired' = 'Pending';
  public ConcurrencyMode: 'Concurrent' | 'Queue' | 'Skip' = 'Skip';
  public Configuration = '';
  public NotifyOnSuccess = false;
  public NotifyOnFailure = true;

  public StatusOptions = ['Pending', 'Active', 'Paused', 'Disabled'];
  public ConcurrencyOptions = ['Skip', 'Queue', 'Concurrent'];
  public TimezoneOptions = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
    'Pacific/Auckland'
  ];

  constructor(
    private schedulingService: SchedulingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadJobTypes();
    if (this.Mode === 'edit' && this.Job) {
      this.populateFromJob();
    }
  }

  private async loadJobTypes(): Promise<void> {
    this.JobTypes = await this.schedulingService.loadJobTypesForDropdown();
    if (this.Mode === 'create' && this.JobTypes.length > 0 && !this.JobTypeID) {
      this.JobTypeID = this.JobTypes[0].id;
    }
    this.cdr.markForCheck();
  }

  private populateFromJob(): void {
    if (!this.Job) return;
    this.Name = this.Job.jobName;
    this.Description = this.Job.description || '';
    this.JobTypeID = this.Job.jobTypeId;
    this.CronExpression = this.Job.cronExpression;
    this.Timezone = this.Job.timezone;
    this.Status = this.Job.status as 'Pending' | 'Active' | 'Paused' | 'Disabled';
    this.ConcurrencyMode = this.Job.concurrencyMode as 'Concurrent' | 'Queue' | 'Skip';
    this.Configuration = this.Job.configuration || '';
    this.NotifyOnSuccess = this.Job.notifyOnSuccess;
    this.NotifyOnFailure = this.Job.notifyOnFailure;
  }

  public get IsValid(): boolean {
    return !!(this.Name.trim() && this.JobTypeID && this.CronExpression.trim());
  }

  public get Title(): string {
    return this.Mode === 'create' ? 'Create New Job' : 'Edit Job';
  }

  public async Save(): Promise<void> {
    if (!this.IsValid || this.IsSaving) return;

    this.IsSaving = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    const data = {
      Name: this.Name.trim(),
      Description: this.Description.trim() || null,
      JobTypeID: this.JobTypeID,
      CronExpression: this.CronExpression.trim(),
      Timezone: this.Timezone,
      Status: this.Status,
      ConcurrencyMode: this.ConcurrencyMode,
      Configuration: this.Configuration.trim() || null,
      NotifyOnSuccess: this.NotifyOnSuccess,
      NotifyOnFailure: this.NotifyOnFailure
    };

    const jobId = this.Mode === 'edit' && this.Job ? this.Job.jobId : null;
    const success = await this.schedulingService.saveJob(jobId, data);

    this.IsSaving = false;

    if (success) {
      this.Saved.emit();
    } else {
      this.ErrorMessage = 'Failed to save job. Please try again.';
    }
    this.cdr.markForCheck();
  }

  public async Delete(): Promise<void> {
    if (!this.Job || this.IsDeleting) return;

    this.IsDeleting = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    const success = await this.schedulingService.deleteJob(this.Job.jobId);

    this.IsDeleting = false;

    if (success) {
      this.Saved.emit();
    } else {
      this.ErrorMessage = 'Failed to delete job. It may have dependent records.';
      this.ShowDeleteConfirm = false;
    }
    this.cdr.markForCheck();
  }

  public OnConfigurationChange(value: string): void {
    this.Configuration = value;
    this.cdr.markForCheck();
  }

  public OnClose(): void {
    this.Close.emit();
  }
}
