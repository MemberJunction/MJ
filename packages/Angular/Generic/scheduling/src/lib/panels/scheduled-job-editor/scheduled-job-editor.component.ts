import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    OnInit,
    inject,
} from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ScheduledJobService } from '../../services/scheduled-job.service';

/** IANA timezone list subset for the dropdown */
const COMMON_TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney',
];

@Component({
    selector: 'mj-scheduled-job-editor',
    standalone: false,
    templateUrl: './scheduled-job-editor.component.html',
    styleUrls: ['./scheduled-job-editor.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduledJobEditorComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private scheduledJobService = inject(ScheduledJobService);

    // ── Inputs ────────────────────────────────────────────────
    private _scheduledJobID: string | null = null;

    @Input()
    set ScheduledJobID(value: string | null) {
        if (value !== this._scheduledJobID) {
            this._scheduledJobID = value;
            if (this.isInitialized) {
                this.loadOrCreateJob();
            }
        }
    }
    get ScheduledJobID(): string | null {
        return this._scheduledJobID;
    }

    @Input() JobTypeID: string | null = null;
    @Input() DefaultConfiguration: string | null = null;
    @Input() HideJobType = false;

    // ── Outputs ───────────────────────────────────────────────
    @Output() Saved = new EventEmitter<MJScheduledJobEntity>();
    @Output() Deleted = new EventEmitter<string>();
    @Output() Cancelled = new EventEmitter<void>();

    // ── State ─────────────────────────────────────────────────
    public IsLoading = false;
    public IsSaving = false;
    public IsNew = false;
    public ShowDeleteConfirm = false;

    public Job: MJScheduledJobEntity | null = null;
    public JobTypes: MJScheduledJobTypeEntity[] = [];
    public Timezones: string[] = COMMON_TIMEZONES;

    // Form fields
    public Name = '';
    public Description = '';
    public SelectedJobTypeID = '';
    public CronExpression = '';
    public Timezone = 'UTC';
    public Status: 'Active' | 'Disabled' | 'Expired' | 'Paused' | 'Pending' = 'Active';
    public ConcurrencyMode = 'Skip';
    public Configuration = '';
    public NotifyOnSuccess = false;
    public NotifyOnFailure = true;

    // Stats (edit mode)
    public TotalRuns = 0;
    public SuccessRuns = 0;
    public FailedRuns = 0;

    public readonly StatusOptions = ['Pending', 'Active', 'Paused', 'Disabled'];
    public readonly ConcurrencyOptions = ['Skip', 'Queue', 'Concurrent'];

    private isInitialized = false;

    public get CanSave(): boolean {
        return this.Name.trim().length > 0
            && this.SelectedJobTypeID.length > 0
            && this.CronExpression.trim().length > 0;
    }

    async ngOnInit(): Promise<void> {
        this.IsLoading = true;
        this.cdr.markForCheck();

        this.JobTypes = await this.scheduledJobService.LoadJobTypes();
        await this.loadOrCreateJob();

        this.isInitialized = true;
        this.IsLoading = false;
        this.cdr.markForCheck();
    }

    public async Save(): Promise<void> {
        if (!this.CanSave || this.IsSaving) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const job = await this.getOrCreateEntity();
            this.applyFormToEntity(job);

            const saved = await job.Save();
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.IsNew ? 'Scheduled job created successfully' : 'Scheduled job updated successfully',
                    'success', 3000
                );
                this.Saved.emit(job);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save: ${job.LatestResult?.Message ?? 'Unknown error'}`,
                    'error', 5000
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            MJNotificationService.Instance.CreateSimpleNotification(`Error saving: ${msg}`, 'error', 5000);
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public ConfirmDelete(): void {
        this.ShowDeleteConfirm = true;
        this.cdr.markForCheck();
    }

    public CancelDelete(): void {
        this.ShowDeleteConfirm = false;
        this.cdr.markForCheck();
    }

    public async DeleteJob(): Promise<void> {
        if (!this.Job || this.IsNew) return;

        this.ShowDeleteConfirm = false;
        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const jobID = this.Job.ID;
            const deleted = await this.Job.Delete();
            if (deleted) {
                MJNotificationService.Instance.CreateSimpleNotification('Scheduled job deleted', 'success', 3000);
                this.Deleted.emit(jobID);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to delete job', 'error', 5000);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            MJNotificationService.Instance.CreateSimpleNotification(`Error deleting: ${msg}`, 'error', 5000);
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    public Cancel(): void {
        this.Cancelled.emit();
    }

    // ── Private ───────────────────────────────────────────────

    private async loadOrCreateJob(): Promise<void> {
        if (this._scheduledJobID) {
            await this.loadExistingJob(this._scheduledJobID);
        } else {
            this.initNewJob();
        }
    }

    private async loadExistingJob(jobID: string): Promise<void> {
        this.IsNew = false;
        const job = await this.scheduledJobService.LoadJob(jobID);
        if (job) {
            this.Job = job;
            this.populateFormFromEntity(job);
            await this.loadRunStats(jobID);
        }
        this.cdr.markForCheck();
    }

    private initNewJob(): void {
        this.IsNew = true;
        this.Job = null;
        this.Name = '';
        this.Description = '';
        this.SelectedJobTypeID = this.JobTypeID ?? '';
        this.CronExpression = '';
        this.Timezone = 'UTC';
        this.Status = 'Active';
        this.ConcurrencyMode = 'Skip';
        this.Configuration = this.DefaultConfiguration ?? '';
        this.NotifyOnSuccess = false;
        this.NotifyOnFailure = true;
        this.TotalRuns = 0;
        this.SuccessRuns = 0;
        this.FailedRuns = 0;
        this.cdr.markForCheck();
    }

    private populateFormFromEntity(job: MJScheduledJobEntity): void {
        this.Name = job.Name ?? '';
        this.Description = job.Description ?? '';
        this.SelectedJobTypeID = job.JobTypeID ?? '';
        this.CronExpression = job.CronExpression ?? '';
        this.Timezone = job.Timezone ?? 'UTC';
        this.Status = job.Status ?? 'Active';
        this.ConcurrencyMode = job.Get('ConcurrencyMode') as string ?? 'Skip';
        this.Configuration = job.Configuration ?? '';
        this.NotifyOnSuccess = job.Get('NotifyOnSuccess') as boolean ?? false;
        this.NotifyOnFailure = job.Get('NotifyOnFailure') as boolean ?? true;
    }

    private applyFormToEntity(job: MJScheduledJobEntity): void {
        job.Name = this.Name.trim();
        job.Description = this.Description.trim();
        job.JobTypeID = this.SelectedJobTypeID;
        job.CronExpression = this.CronExpression.trim();
        job.Timezone = this.Timezone;
        job.Status = this.Status;
        job.Set('ConcurrencyMode', this.ConcurrencyMode);
        job.Configuration = this.Configuration;
        job.Set('NotifyOnSuccess', this.NotifyOnSuccess);
        job.Set('NotifyOnFailure', this.NotifyOnFailure);
    }

    private async getOrCreateEntity(): Promise<MJScheduledJobEntity> {
        if (this.Job && !this.IsNew) {
            return this.Job;
        }
        const md = new Metadata();
        const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
        job.NewRecord();
        return job;
    }

    private async loadRunStats(jobID: string): Promise<void> {
        const runs = await this.scheduledJobService.LoadJobRuns(jobID, 100);
        this.TotalRuns = runs.length;
        this.SuccessRuns = runs.filter(r => r.Status === 'Completed').length;
        this.FailedRuns = runs.filter(r => r.Status === 'Failed').length;
    }
}
