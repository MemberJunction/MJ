import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    HostListener,
} from '@angular/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';

@Component({
    selector: 'mj-scheduled-job-slide-panel',
    standalone: false,
    templateUrl: './scheduled-job-slide-panel.component.html',
    styleUrls: ['./scheduled-job-slide-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduledJobSlidePanelComponent {
    @Input() IsOpen = false;
    @Input() ScheduledJobID: string | null = null;
    @Input() JobTypeID: string | null = null;
    @Input() DefaultConfiguration: string | null = null;
    @Input() HideJobType = false;

    @Output() Close = new EventEmitter<void>();
    @Output() Saved = new EventEmitter<MJScheduledJobEntity>();
    @Output() Deleted = new EventEmitter<string>();

    @HostListener('document:keydown.escape')
    public OnEscKey(): void {
        if (this.IsOpen) {
            this.ClosePanel();
        }
    }

    public ClosePanel(): void {
        this.Close.emit();
    }

    public OnSaved(job: MJScheduledJobEntity): void {
        this.Saved.emit(job);
    }

    public OnDeleted(jobID: string): void {
        this.Deleted.emit(jobID);
    }

    public get PanelTitle(): string {
        return this.ScheduledJobID ? 'Edit Schedule' : 'Create Schedule';
    }
}
