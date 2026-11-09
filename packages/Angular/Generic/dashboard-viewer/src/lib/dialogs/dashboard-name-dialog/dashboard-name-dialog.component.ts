import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJDialogActionsComponent, MJDialogComponent } from '@memberjunction/ng-ui-components';

/** The longest dashboard name when the host gives no MaxLength: MJ: Dashboards.Name is nvarchar(255). */
export const DASHBOARD_NAME_MAX_LENGTH = 255;

/**
 * mj-dashboard-name-dialog — asks for the name of a new dashboard before it is created.
 *
 * Create stays disabled until the trimmed name has 1 to MaxLength characters. Create, or Enter in the
 * field, emits `Confirmed` with the trimmed name and leaves the dialog open: the host creates the
 * dashboard, sets `Processing` meanwhile, and closes the dialog through `Visible`. Cancel, Esc, the
 * backdrop and the close button emit `Cancelled`; the host closes the dialog and creates nothing.
 *
 * @example
 * ```html
 * <mj-dashboard-name-dialog
 *   [Visible]="ShowNewDashboardDialog"
 *   [MaxLength]="NewDashboardNameMaxLength"
 *   [Processing]="IsCreatingDashboard"
 *   (Confirmed)="OnNewDashboardNamed($event)"
 *   (Cancelled)="OnNewDashboardCancelled()">
 * </mj-dashboard-name-dialog>
 * ```
 */
@Component({
    standalone: true,
    selector: 'mj-dashboard-name-dialog',
    imports: [FormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective],
    template: `
        <mj-dialog [Visible]="Visible" [Title]="Title" Size="sm" [Closeable]="!Processing" (Close)="OnCancel()">
            <label class="dn-field">
                <span class="dn-label">Name</span>
                <input
                    class="mj-input dn-name"
                    type="text"
                    autocomplete="off"
                    data-autofocus
                    [placeholder]="Placeholder"
                    [maxlength]="MaxLength"
                    [disabled]="Processing"
                    [(ngModel)]="Name"
                    (keydown.enter)="OnCreate()" />
            </label>
            <mj-dialog-actions>
                <button type="button" mjButton Variant="primary" class="dn-create" [disabled]="!CanCreate" (click)="OnCreate()">
                    @if (Processing) {
                        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                    }
                    {{ ConfirmText }}
                </button>
                <button type="button" mjButton Variant="secondary" class="dn-cancel" [disabled]="Processing" (click)="OnCancel()">Cancel</button>
            </mj-dialog-actions>
        </mj-dialog>
    `,
    styles: [`
        .dn-field {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-2);
        }
        .dn-label {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-secondary);
        }
    `],
})
export class DashboardNameDialogComponent {
    private _visible = false;

    /** Shows the dialog. Each time it opens, the name field starts empty. */
    @Input()
    set Visible(value: boolean) {
        if (value && !this._visible) {
            this.Name = '';
        }
        this._visible = value;
    }
    get Visible(): boolean {
        return this._visible;
    }

    /** The dialog title. */
    @Input() Title = 'New dashboard';

    /** The label of the confirm button. */
    @Input() ConfirmText = 'Create';

    /** The placeholder of the name field. */
    @Input() Placeholder = 'Name this dashboard';

    /** The longest name accepted: the MaxLength of MJ: Dashboards.Name. */
    @Input() MaxLength = DASHBOARD_NAME_MAX_LENGTH;

    /** True while the host creates the dashboard: Create shows a spinner, and the dialog cannot be changed or closed. */
    @Input() Processing = false;

    /** The trimmed name, when the user clicks Create or presses Enter. The dialog stays open. */
    @Output() Confirmed = new EventEmitter<string>();

    /** The user cancelled: Cancel, Esc, the backdrop or the close button. */
    @Output() Cancelled = new EventEmitter<void>();

    /** The name in the field. */
    public Name = '';

    /** True when the trimmed name has 1 to MaxLength characters and nothing is being created. */
    public get CanCreate(): boolean {
        const length = this.Name.trim().length;
        return length > 0 && length <= this.MaxLength && !this.Processing;
    }

    /** Emits the trimmed name when it is valid. */
    public OnCreate(): void {
        if (this.CanCreate) {
            this.Confirmed.emit(this.Name.trim());
        }
    }

    /** Emits Cancelled, unless the host is creating the dashboard. */
    public OnCancel(): void {
        if (!this.Processing) {
            this.Cancelled.emit();
        }
    }
}
