import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MJAlertComponent,
  MJButtonDirective,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJSwitchComponent,
} from '@memberjunction/ng-ui-components';

/** A result column that holds a record's primary key, so its rows can become a list of those records. */
export interface SaveAsListKeyColumn {
  /** The result column. */
  Column: string;
  /** The entity whose primary key the column holds. */
  EntityName: string;
  /** What to call that entity in the dialog (its display name). */
  EntityDisplayName: string;
}

/** What the user chose. The parent makes the list. */
export interface SaveAsListRequest {
  ListName: string;
  KeyColumn: SaveAsListKeyColumn;
  RefreshMode: 'Additive' | 'Sync';
  AutoRefresh: boolean;
}

/**
 * Asks how to save a Data artifact's results as a list: its name, which records it holds (one of
 * the result columns that hold a record key), the refresh mode, and Refresh automatically. Tells
 * the user what happens to the query: it's linked as is when already saved, or saved Pending in
 * their User Lists. Emits {@link Save}; the parent creates the list and reports back through
 * {@link Submitting} and {@link ErrorMessage}.
 */
@Component({
  selector: 'mj-save-as-list-dialog',
  standalone: true,
  imports: [FormsModule, MJDialogComponent, MJDialogActionsComponent, MJAlertComponent, MJButtonDirective, MJSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .save-as-list { display: flex; flex-direction: column; gap: var(--mj-space-4, 16px); }
    .field { display: flex; flex-direction: column; gap: var(--mj-space-1, 4px); }
    .field__label { font-weight: 600; font-size: var(--mj-text-sm, 13px); color: var(--mj-text-primary); }
    .field__hint { font-size: var(--mj-text-xs, 12px); color: var(--mj-text-muted); }
    .field--inline { display: flex; align-items: center; justify-content: space-between; gap: var(--mj-space-3, 12px); }
  `],
  template: `
    @if (Visible) {
      <mj-dialog [Visible]="true" [Width]="520" Title="Save as list" (Close)="OnCancel()">
        <form class="save-as-list" (submit)="$event.preventDefault(); OnSave()">
          <mj-alert Variant="info">
            @if (SavedQueryName) {
              The list will refresh from the saved query <strong>{{ SavedQueryName }}</strong>.
            } @else {
              The query will be saved in your User Lists, Pending approval, so the list can refresh from it.
              Editing the query later pauses refreshes until you approve the change.
            }
          </mj-alert>

          <div class="field">
            <label class="field__label" for="save-as-list-name">List name</label>
            <input id="save-as-list-name" class="mj-input" name="listName" [(ngModel)]="ListName" required autofocus />
          </div>

          <div class="field">
            <label class="field__label" for="save-as-list-records">Records</label>
            <select id="save-as-list-records" class="mj-input mj-select" name="keyColumn" [(ngModel)]="KeyColumnIndex">
              @for (key of KeyColumns; track key.Column; let i = $index) {
                <option [ngValue]="i">{{ key.EntityDisplayName }} (column {{ key.Column }})</option>
              }
            </select>
            <span class="field__hint">The list holds the records this column identifies.</span>
          </div>

          <div class="field">
            <label class="field__label" for="save-as-list-mode">When it refreshes</label>
            <select id="save-as-list-mode" class="mj-input mj-select" name="refreshMode" [(ngModel)]="RefreshMode">
              <option value="Additive">Add new records only</option>
              <option value="Sync">Add new records and remove ones that no longer match</option>
            </select>
          </div>

          <div class="field--inline">
            <div class="field">
              <span class="field__label" id="save-as-list-auto-label">Refresh automatically</span>
              <span class="field__hint">On the Lists app's schedule. You can change this on the list later.</span>
            </div>
            <mj-switch name="autoRefresh" AriaLabelledBy="save-as-list-auto-label" [(ngModel)]="AutoRefresh" />
          </div>

          @if (ErrorMessage) {
            <mj-alert Variant="error">{{ ErrorMessage }}</mj-alert>
          }
        </form>

        <mj-dialog-actions>
          <button mjButton variant="primary" type="button" [disabled]="!CanSave" (click)="OnSave()">
            <i class="fa-solid fa-list-check"></i> {{ Submitting ? 'Creating...' : 'Create list' }}
          </button>
          <button mjButton variant="outline" type="button" [disabled]="Submitting" (click)="OnCancel()">Cancel</button>
        </mj-dialog-actions>
      </mj-dialog>
    }
  `,
})
export class SaveAsListDialogComponent {
  /** Opening the dialog resets the form. */
  @Input()
  get Visible(): boolean {
    return this._visible;
  }
  set Visible(value: boolean) {
    if (value && !this._visible) this.resetForm();
    this._visible = value;
  }
  private _visible = false;

  /** The list name to start with, usually the artifact's title. */
  @Input() DefaultName = '';
  /** The result columns that hold a record key. The first is selected to start with. */
  @Input() KeyColumns: SaveAsListKeyColumn[] = [];
  /** The saved query the list will refresh from, or null when the query will be saved Pending. */
  @Input() SavedQueryName: string | null = null;
  /** True while the parent is creating the list. */
  @Input() Submitting = false;
  /** Why the last attempt failed, shown in the dialog. */
  @Input() ErrorMessage: string | null = null;

  @Output() Save = new EventEmitter<SaveAsListRequest>();
  @Output() Cancel = new EventEmitter<void>();

  public ListName = '';
  public KeyColumnIndex = 0;
  public RefreshMode: 'Additive' | 'Sync' = 'Additive';
  public AutoRefresh = false;

  public get CanSave(): boolean {
    return !this.Submitting && this.ListName.trim().length > 0 && !!this.KeyColumns[this.KeyColumnIndex];
  }

  public OnSave(): void {
    if (!this.CanSave) return;
    this.Save.emit({
      ListName: this.ListName.trim(),
      KeyColumn: this.KeyColumns[this.KeyColumnIndex],
      RefreshMode: this.RefreshMode,
      AutoRefresh: this.AutoRefresh,
    });
  }

  public OnCancel(): void {
    if (!this.Submitting) this.Cancel.emit();
  }

  private resetForm(): void {
    this.ListName = this.DefaultName.trim();
    this.KeyColumnIndex = 0;
    this.RefreshMode = 'Additive';
    this.AutoRefresh = false;
  }
}
