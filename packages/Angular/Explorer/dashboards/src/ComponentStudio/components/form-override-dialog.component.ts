import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    OnInit,
    OnChanges,
    SimpleChanges,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RoleInfo } from '@memberjunction/core';

/**
 * Scope of an EntityFormOverride row. Mirrors the DB CHECK constraint
 * (see migrations/v5/V202605161430_*_Interactive_Forms.sql).
 */
export type OverrideScope = 'User' | 'Role' | 'Global';

/**
 * Override row status. Active = runtime serves this; Pending = AI / user
 * draft awaiting activation; Inactive = historical, never served.
 */
export type OverrideStatus = 'Active' | 'Inactive' | 'Pending';

/** Payload emitted by {@link FormOverrideDialogComponent} on confirm. */
export interface FormOverrideDialogResult {
    Name: string;
    Description: string | null;
    Notes: string | null;
    EntityName: string;
    Scope: OverrideScope;
    RoleID: string | null;
    Priority: number;
    Status: OverrideStatus;
}

/**
 * Modal shown after a form-role Component is saved. Lets the author create
 * an `EntityFormOverride` row pointing the just-saved Component at an
 * entity for User / Role / Global scope. Skip exits without persisting —
 * useful when authoring a Component that isn't ready to be activated.
 *
 * The dialog only collects intent. The dashboard wires the confirm event
 * to the write call (currently blocked on the EntityFormOverrideEntity
 * generated class; see Tasks 3 + 15).
 */
@Component({
    standalone: true,
    imports: [CommonModule],
    selector: 'mj-form-override-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
@if (Visible) {
<div class="modal-backdrop" (click)="OnCancelClick()">
    <div class="modal" (click)="$event.stopPropagation()">
        <header class="modal-header">
            <h3>{{ EditMode ? 'Edit form details' : 'Activate this form' }}</h3>
            <button class="close-btn" (click)="OnCancelClick()" aria-label="Close">
                <i class="fa-solid fa-times"></i>
            </button>
        </header>
        <div class="modal-body">
            <p class="hint">
                @if (EditMode) {
                    Update the override's name, description, scope, priority, or status.
                    Component code is edited from the cockpit's main editor — this dialog
                    covers the override-row metadata only.
                } @else {
                    Create an Entity Form Override so MemberJunction renders this
                    Component instead of the default form for matching users.
                    Skip to keep the Component saved but inactive.
                }
            </p>

            <div class="field">
                <label>Override Name</label>
                <input type="text" [value]="Name" (input)="OnNameInput($event)" placeholder="e.g. Compact Application Form" />
            </div>

            <div class="field">
                <label>Description</label>
                <textarea [value]="Description ?? ''" (input)="OnDescriptionInput($event)" rows="2"
                          placeholder="Optional — what's special about this variant?"></textarea>
            </div>

            <div class="field">
                <label>Notes</label>
                <textarea [value]="Notes ?? ''" (input)="OnNotesInput($event)" rows="2"
                          placeholder="Optional — private notes about this version, e.g. why you forked, what changed."></textarea>
            </div>

            <div class="field">
                <label>Entity</label>
                <input type="text" [value]="EntityName" disabled />
                <small class="muted">Set in the Field Binding inspector.</small>
            </div>

            <div class="field">
                <label>Scope</label>
                <div class="scope-options">
                    <label class="radio">
                        <input type="radio" name="scope" [checked]="Scope === 'User'" (change)="OnScopeChange('User')" />
                        Me only (User)
                    </label>
                    <label class="radio">
                        <input type="radio" name="scope" [checked]="Scope === 'Role'" (change)="OnScopeChange('Role')" />
                        A role
                    </label>
                    @if (Scope === 'Role') {
                        <select [value]="RoleID ?? ''" (change)="OnRoleChanged($event)" class="role-picker">
                            <option value="">— pick a role —</option>
                            @for (r of availableRoles; track r.ID) {
                                <option [value]="r.ID">{{ r.Name }}</option>
                            }
                        </select>
                    }
                    <label class="radio">
                        <input type="radio" name="scope" [checked]="Scope === 'Global'" (change)="OnScopeChange('Global')" />
                        Everyone (Global)
                    </label>
                </div>
            </div>

            <div class="field-row">
                <div class="field">
                    <label>Priority</label>
                    <input type="number" [value]="Priority" (input)="OnPriorityInput($event)" min="0" step="1" />
                </div>

                <div class="field">
                    <label>Status</label>
                    <div class="status-options">
                        <label class="radio">
                            <input type="radio" name="status" [checked]="Status === 'Pending'" (change)="Status = 'Pending'" />
                            Pending <span class="muted">(draft)</span>
                        </label>
                        <label class="radio">
                            <input type="radio" name="status" [checked]="Status === 'Active'" (change)="Status = 'Active'" />
                            Active <span class="muted">(live)</span>
                        </label>
                        <label class="radio">
                            <input type="radio" name="status" [checked]="Status === 'Inactive'" (change)="Status = 'Inactive'" />
                            Inactive
                        </label>
                    </div>
                </div>
            </div>

            @if (validationError) {
                <div class="error">{{ validationError }}</div>
            }
        </div>
        <footer class="modal-footer">
            <button class="btn btn-primary" (click)="OnConfirmClick()">{{ EditMode ? 'Save changes' : 'Create Override' }}</button>
            <button class="btn" (click)="OnCancelClick()">{{ EditMode ? 'Cancel' : 'Skip' }}</button>
        </footer>
    </div>
</div>
}
`,
    styles: [`
        .modal-backdrop { position: fixed; inset: 0; background: var(--mj-bg-overlay, rgba(0,0,0,0.5)); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: var(--mj-bg-surface, #fff); border-radius: 8px; width: 520px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--mj-border-default, #e0e0e0); }
        .modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
        .close-btn { background: transparent; border: 0; cursor: pointer; font-size: 16px; color: var(--mj-text-muted, #64748b); padding: 4px; }
        .modal-body { padding: 16px 20px; overflow-y: auto; }
        .modal-footer { display: flex; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--mj-border-default, #e0e0e0); }
        .hint { margin: 0 0 16px; color: var(--mj-text-muted, #64748b); font-size: 13px; line-height: 1.5; }
        .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
        .field label { font-size: 11px; color: var(--mj-text-muted, #64748b); text-transform: uppercase; letter-spacing: 0.5px; }
        .field input[type="text"], .field input[type="number"], .field textarea, .field select { padding: 8px 10px; border: 1px solid var(--mj-border-default, #e0e0e0); border-radius: 4px; font-size: 14px; background: var(--mj-bg-surface, #fff); color: var(--mj-text-primary, #111); font-family: inherit; }
        .field input:disabled { background: var(--mj-bg-surface-sunken, #f1f5f9); color: var(--mj-text-muted, #64748b); }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .muted { font-size: 11px; color: var(--mj-text-muted, #64748b); }
        .scope-options { display: flex; flex-direction: column; gap: 8px; }
        .status-options { display: flex; gap: 16px; padding-top: 6px; }
        .radio { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
        .role-picker { margin-left: 24px; }
        .error { color: var(--mj-status-error-text, #b91c1c); background: var(--mj-status-error-bg, #fee2e2); padding: 8px 12px; border-radius: 4px; font-size: 13px; margin-top: 8px; }
        .btn { padding: 8px 16px; border: 1px solid var(--mj-border-default, #e0e0e0); border-radius: 4px; background: var(--mj-bg-surface, #fff); color: var(--mj-text-primary, #111); font-size: 14px; cursor: pointer; }
        .btn-primary { background: var(--mj-brand-primary, #5B4FE9); color: #fff; border-color: var(--mj-brand-primary, #5B4FE9); font-weight: 500; }
    `],
})
export class FormOverrideDialogComponent extends BaseAngularComponent implements OnInit, OnChanges {

    /**
     * Plain `@Input()`. Per-open re-sync of editable state happens in
     * `ngOnChanges` — that's the only Angular hook that fires AFTER all
     * inputs in a single change-detection cycle are bound. The earlier
     * setter-based approach fired BEFORE peer inputs (`InitialName`,
     * `InitialDescription`, etc.) were set, so the dialog rendered with
     * stale or empty pre-fill values.
     */
    @Input() Visible = false;

    @Input() ComponentName = '';
    @Input() EntityName = '';
    /** Pre-fill for the Description textarea (cockpit's input value). */
    @Input() InitialDescription: string | null = null;
    /** Pre-fill for the Name input (defaults to ComponentName). */
    @Input() InitialName: string | null = null;
    /** Pre-fill for the Notes textarea (when present in the cockpit). */
    @Input() InitialNotes: string | null = null;
    /** Pre-fill for the Status radio group. Default: 'Pending'. */
    @Input() InitialStatus: OverrideStatus | null = null;
    /** Pre-fill for the Scope radio group. Default: 'User'. */
    @Input() InitialScope: OverrideScope | null = null;
    /** Pre-fill for the Role select (when Scope='Role'). */
    @Input() InitialRoleID: string | null | undefined = undefined;
    /** Pre-fill for the Priority numeric input. Default: 0. */
    @Input() InitialPriority: number | undefined = undefined;
    /**
     * When true, render the dialog as "Edit form details" instead of
     * "Activate this form" — same fields, different framing. The
     * confirm button reads "Save changes" and the explanatory hint adapts.
     */
    @Input() EditMode = false;

    @Output() confirmed = new EventEmitter<FormOverrideDialogResult>();
    @Output() dismissed = new EventEmitter<void>();

    public Name = '';
    public Description: string | null = null;
    public Notes: string | null = null;
    public Scope: OverrideScope = 'User';
    public RoleID: string | null = null;
    public Priority = 0;
    public Status: OverrideStatus = 'Pending';
    public validationError: string | null = null;

    public availableRoles: RoleInfo[] = [];

    private readonly cd = inject(ChangeDetectorRef);

    ngOnInit(): void {
        // Load roles eagerly — small list, used only when Scope='Role'.
        const provider = this.ProviderToUse;
        this.availableRoles = provider?.Roles ?? [];
    }

    /**
     * Re-sync editable state every time `Visible` flips false→true, AFTER
     * Angular has bound all the peer `@Input()`s for the same change-
     * detection cycle. The previous setter-based approach fired BEFORE
     * sibling inputs (`InitialName`, etc.) had landed, leaving the dialog
     * pre-fill empty.
     */
    ngOnChanges(changes: SimpleChanges): void {
        const visChange = changes['Visible'];
        if (!visChange) return;
        const becameVisible = !visChange.previousValue && visChange.currentValue;
        if (becameVisible) {
            this.resetFromInputs();
        }
    }

    /**
     * Sync editable state from `@Input()`s. Called on first open AND on
     * every subsequent Visible: false → true transition so the dialog
     * doesn't show stale data from a previous invocation.
     */
    private resetFromInputs(): void {
        this.Name = (this.InitialName?.trim() || this.ComponentName || '').trim();
        this.Description = this.InitialDescription?.trim() || null;
        this.Notes = this.InitialNotes?.trim() || null;
        this.validationError = null;
        // Default Status to Pending — matches the new "create as draft,
        // activate later" workflow. Edit-mode callers will override via
        // InitialStatus.
        if (this.InitialStatus) this.Status = this.InitialStatus;
        if (this.InitialScope) this.Scope = this.InitialScope;
        if (this.InitialRoleID !== undefined) this.RoleID = this.InitialRoleID;
        if (this.InitialPriority !== undefined) this.Priority = this.InitialPriority;
        this.cd.markForCheck();
    }

    public OnNameInput(e: Event): void {
        this.Name = (e.target as HTMLInputElement).value;
    }

    public OnDescriptionInput(e: Event): void {
        const v = (e.target as HTMLTextAreaElement).value;
        this.Description = v.trim().length > 0 ? v : null;
    }

    public OnNotesInput(e: Event): void {
        const v = (e.target as HTMLTextAreaElement).value;
        this.Notes = v.trim().length > 0 ? v : null;
    }

    public OnScopeChange(scope: OverrideScope): void {
        this.Scope = scope;
        if (scope !== 'Role') {
            this.RoleID = null;
        }
    }

    public OnRoleChanged(e: Event): void {
        const v = (e.target as HTMLSelectElement).value;
        this.RoleID = v.length > 0 ? v : null;
    }

    public OnPriorityInput(e: Event): void {
        const parsed = parseInt((e.target as HTMLInputElement).value, 10);
        this.Priority = isNaN(parsed) ? 0 : parsed;
    }

    public OnConfirmClick(): void {
        if (!this.Name?.trim()) {
            this.validationError = 'Name is required.';
            return;
        }
        if (!this.EntityName) {
            this.validationError = 'No entity selected. Pick one in the Field Binding inspector before activating.';
            return;
        }
        if (this.Scope === 'Role' && !this.RoleID) {
            this.validationError = 'Pick a role when Scope = Role.';
            return;
        }
        this.validationError = null;
        this.confirmed.emit({
            Name: this.Name.trim(),
            Description: this.Description,
            Notes: this.Notes,
            EntityName: this.EntityName,
            Scope: this.Scope,
            RoleID: this.RoleID,
            Priority: this.Priority,
            Status: this.Status,
        });
    }

    public OnCancelClick(): void {
        this.dismissed.emit();
    }
}
