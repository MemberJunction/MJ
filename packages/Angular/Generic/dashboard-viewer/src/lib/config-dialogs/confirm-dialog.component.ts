import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';

/**
 * Confirmation dialog types
 */
export type ConfirmDialogType = 'warning' | 'danger' | 'info';

/**
 * A nice confirmation dialog to replace browser confirm().
 */
@Component({
  standalone: false,
    selector: 'mj-confirm-dialog',
    templateUrl: './confirm-dialog.component.html',
    styleUrls: ['./config-dialog.component.css']
})
export class ConfirmDialogComponent {
    /** Whether the dialog is visible */
    @Input() visible = false;

    /** Dialog type (affects icon and button styling) */
    @Input() type: ConfirmDialogType = 'warning';

    /** Dialog title */
    @Input() title = 'Confirm Action';

    /** Dialog message */
    @Input() message = 'Are you sure you want to proceed?';

    /** Confirm button text */
    @Input() confirmText = 'Confirm';

    /** Cancel button text */
    @Input() cancelText = 'Cancel';

    /** Custom icon class (optional, uses default based on type if not provided) */
    @Input() icon = '';

    /** Emitted when user confirms */
    @Output() confirmed = new EventEmitter<void>();

    /** Emitted when user cancels */
    @Output() cancelled = new EventEmitter<void>();

    constructor(private cdr: ChangeDetectorRef) {}

    public getIcon(): string {
        if (this.icon) return this.icon;

        switch (this.type) {
            case 'danger':
                return 'fa-solid fa-trash';
            case 'info':
                return 'fa-solid fa-info-circle';
            default:
                return 'fa-solid fa-exclamation-triangle';
        }
    }

    public confirm(): void {
        this.confirmed.emit();
    }

    public cancel(): void {
        this.cancelled.emit();
    }
}
