import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
} from '@angular/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';

/** Result emitted when the dialog closes */
export interface ScheduledJobDialogResult {
    Saved: boolean;
    Job?: MJScheduledJobEntity;
    Deleted?: boolean;
}

@Component({
    selector: 'mj-scheduled-job-dialog',
    standalone: false,
    template: `
        @if (Visible) {
            <kendo-dialog [title]="DialogTitle" (close)="OnClose()" [width]="Width">
                <mj-scheduled-job-editor
                    [ScheduledJobID]="ScheduledJobID"
                    [JobTypeID]="JobTypeID"
                    [DefaultConfiguration]="DefaultConfiguration"
                    [HideJobType]="HideJobType"
                    (Saved)="OnSaved($event)"
                    (Deleted)="OnDeleted($event)"
                    (Cancelled)="OnClose()">
                </mj-scheduled-job-editor>
            </kendo-dialog>
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduledJobDialogComponent {
    @Input() Visible = false;
    @Input() ScheduledJobID: string | null = null;
    @Input() JobTypeID: string | null = null;
    @Input() DefaultConfiguration: string | null = null;
    @Input() HideJobType = false;
    @Input() Width = 580;

    @Output() Close = new EventEmitter<ScheduledJobDialogResult>();

    public get DialogTitle(): string {
        return this.ScheduledJobID ? 'Edit Schedule' : 'Create Schedule';
    }

    public OnClose(): void {
        this.Close.emit({ Saved: false });
    }

    public OnSaved(job: MJScheduledJobEntity): void {
        this.Close.emit({ Saved: true, Job: job });
    }

    public OnDeleted(_jobID: string): void {
        this.Close.emit({ Saved: false, Deleted: true });
    }
}
