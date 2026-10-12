import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Asks for the operator's reason before WorkQueue.DiscardDelivery runs (the operation requires one, and it is
 * stored with the resolution). Shared by the Dead Letters and Partitions tabs.
 */
@Component({
    standalone: false,
    selector: 'mj-work-queue-discard-dialog',
    templateUrl: './work-queue-discard-dialog.component.html',
    styleUrls: ['./work-queue-discard-dialog.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkQueueDiscardDialogComponent {
    @Input() Visible = false;
    @Input() Title = 'Discard delivery';
    /** What is about to happen, e.g. "3 dead letters will be discarded" or the blocked-key release warning. */
    @Input() Message = '';
    @Input() Busy = false;
    @Output() VisibleChange = new EventEmitter<boolean>();
    @Output() Confirmed = new EventEmitter<string>();

    public Reason = '';

    public get CanConfirm(): boolean {
        return this.Reason.trim().length > 0 && !this.Busy;
    }

    public Confirm(): void {
        if (this.CanConfirm) {
            this.Confirmed.emit(this.Reason.trim());
        }
    }

    public Cancel(): void {
        this.Reason = '';
        this.VisibleChange.emit(false);
    }
}
