import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    inject,
    OnInit,
} from '@angular/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { ScheduledJobService } from '../../services/scheduled-job.service';

@Component({
    selector: 'mj-scheduled-job-summary',
    standalone: false,
    templateUrl: './scheduled-job-summary.component.html',
    styleUrls: ['./scheduled-job-summary.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduledJobSummaryComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private scheduledJobService = inject(ScheduledJobService);

    private _scheduledJobID: string | null = null;

    @Input()
    set ScheduledJobID(value: string | null) {
        if (value !== this._scheduledJobID) {
            this._scheduledJobID = value;
            if (this.isInitialized) {
                this.loadJob();
            }
        }
    }
    get ScheduledJobID(): string | null {
        return this._scheduledJobID;
    }

    @Input() ShowEditButton = true;

    @Output() EditRequested = new EventEmitter<string>();

    public IsLoading = false;
    public Job: MJScheduledJobEntity | null = null;
    public TotalRuns = 0;
    public SuccessRuns = 0;
    public FailedRuns = 0;
    public LastRun: MJScheduledJobRunEntity | null = null;

    private isInitialized = false;

    async ngOnInit(): Promise<void> {
        await this.loadJob();
        this.isInitialized = true;
    }

    public OnEditClick(): void {
        if (this._scheduledJobID) {
            this.EditRequested.emit(this._scheduledJobID);
        }
    }

    public get StatusClass(): string {
        const status = this.Job?.Status?.toLowerCase() ?? '';
        if (status === 'active') return 'status-active';
        if (status === 'paused') return 'status-paused';
        if (status === 'disabled') return 'status-disabled';
        return 'status-pending';
    }

    public get SuccessRate(): string {
        if (this.TotalRuns === 0) return 'N/A';
        return `${Math.round((this.SuccessRuns / this.TotalRuns) * 100)}%`;
    }

    private async loadJob(): Promise<void> {
        if (!this._scheduledJobID) {
            this.Job = null;
            this.cdr.markForCheck();
            return;
        }

        this.IsLoading = true;
        this.cdr.markForCheck();

        this.Job = await this.scheduledJobService.LoadJob(this._scheduledJobID);
        const runs = await this.scheduledJobService.LoadJobRuns(this._scheduledJobID, 50);
        this.TotalRuns = runs.length;
        this.SuccessRuns = runs.filter(r => r.Status === 'Completed').length;
        this.FailedRuns = runs.filter(r => r.Status === 'Failed').length;
        this.LastRun = runs.length > 0 ? runs[0] : null;

        this.IsLoading = false;
        this.cdr.markForCheck();
    }
}
