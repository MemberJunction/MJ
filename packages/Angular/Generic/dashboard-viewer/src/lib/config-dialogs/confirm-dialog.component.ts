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
    @Input() Visible = false;

    /** @deprecated Use {@link Visible}. */
    @Input() set visible(value: ConfirmDialogComponent['Visible']) {
      this.Visible = value;
    }
    /** @deprecated Use {@link Visible}. */
    get visible(): ConfirmDialogComponent['Visible'] {
      return this.Visible;
    }

    /** Dialog type (affects icon and button styling) */
    @Input() Type: ConfirmDialogType = 'warning';

    /** @deprecated Use {@link Type}. */
    @Input() set type(value: ConfirmDialogType) {
      this.Type = value;
    }
    /** @deprecated Use {@link Type}. */
    get type(): ConfirmDialogType {
      return this.Type;
    }

    /** Dialog title */
    @Input() Title = 'Confirm Action';

    /** @deprecated Use {@link Title}. */
    @Input() set title(value: ConfirmDialogComponent['Title']) {
      this.Title = value;
    }
    /** @deprecated Use {@link Title}. */
    get title(): ConfirmDialogComponent['Title'] {
      return this.Title;
    }

    /** Dialog message */
    @Input() Message = 'Are you sure you want to proceed?';

    /** @deprecated Use {@link Message}. */
    @Input() set message(value: ConfirmDialogComponent['Message']) {
      this.Message = value;
    }
    /** @deprecated Use {@link Message}. */
    get message(): ConfirmDialogComponent['Message'] {
      return this.Message;
    }

    /** Confirm button text */
    @Input() ConfirmText = 'Confirm';

    /** @deprecated Use {@link ConfirmText}. */
    @Input() set confirmText(value: ConfirmDialogComponent['ConfirmText']) {
      this.ConfirmText = value;
    }
    /** @deprecated Use {@link ConfirmText}. */
    get confirmText(): ConfirmDialogComponent['ConfirmText'] {
      return this.ConfirmText;
    }

    /** Cancel button text */
    @Input() CancelText = 'Cancel';

    /** @deprecated Use {@link CancelText}. */
    @Input() set cancelText(value: ConfirmDialogComponent['CancelText']) {
      this.CancelText = value;
    }
    /** @deprecated Use {@link CancelText}. */
    get cancelText(): ConfirmDialogComponent['CancelText'] {
      return this.CancelText;
    }

    /** Custom icon class (optional, uses default based on type if not provided) */
    @Input() Icon = '';

    /** @deprecated Use {@link Icon}. */
    @Input() set icon(value: ConfirmDialogComponent['Icon']) {
      this.Icon = value;
    }
    /** @deprecated Use {@link Icon}. */
    get icon(): ConfirmDialogComponent['Icon'] {
      return this.Icon;
    }

    /** Emitted when user confirms */
    @Output() Confirmed = new EventEmitter<void>();

    /**
     * @deprecated Use {@link Confirmed}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (confirmed) keeps working. Must stay AFTER Confirmed: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() confirmed = this.Confirmed;

    /** Emitted when user cancels */
    @Output() Cancelled = new EventEmitter<void>();

    /**
     * @deprecated Use {@link Cancelled}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (cancelled) keeps working. Must stay AFTER Cancelled: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() cancelled = this.Cancelled;

    constructor(private cdr: ChangeDetectorRef) {}

    public GetIcon(): string {
        if (this.Icon) return this.Icon;

        switch (this.Type) {
            case 'danger':
                return 'fa-solid fa-trash';
            case 'info':
                return 'fa-solid fa-info-circle';
            default:
                return 'fa-solid fa-exclamation-triangle';
        }
    }

    /** @deprecated Use {@link GetIcon}. */
    public getIcon(): string {
      return this.GetIcon();
    }

    public Confirm(): void {
        this.Confirmed.emit();
    }

    /** @deprecated Use {@link Confirm}. */
    public confirm(): void {
      return this.Confirm();
    }

    public Cancel(): void {
        this.Cancelled.emit();
    }

    /** @deprecated Use {@link Cancel}. */
    public cancel(): void {
      return this.Cancel();
    }
}
