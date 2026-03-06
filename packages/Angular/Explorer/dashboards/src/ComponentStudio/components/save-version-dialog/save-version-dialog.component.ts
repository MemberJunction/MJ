import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface SaveVersionResult {
  Comment: string;
  Mode: 'new' | 'update';
}

@Component({
  standalone: false,
  selector: 'mj-save-version-dialog',
  template: `
    @if (Visible) {
      <kendo-dialog
        [title]="'Save Version'"
        [width]="420"
        (close)="OnCancel()">

        <div class="dialog-body">
          <div class="version-context">
            @if (CurrentVersion > 0) {
              <span class="version-badge">Current: v{{ CurrentVersion }}</span>
            } @else {
              <span class="version-badge new-badge">First version</span>
            }
          </div>

          <div class="form-field">
            <label class="field-label" for="versionComment">Comment</label>
            <input
              kendoTextBox
              id="versionComment"
              [(ngModel)]="Comment"
              placeholder="Describe what changed..."
              class="comment-input" />
          </div>

          @if (CurrentVersion > 0) {
            <div class="save-mode">
              <label class="radio-option" [class.selected]="Mode === 'new'">
                <input type="radio" name="saveMode" value="new" [(ngModel)]="Mode" />
                <div class="radio-content">
                  <span class="radio-label">Save as new version</span>
                  <span class="radio-desc">Creates v{{ CurrentVersion + 1 }}</span>
                </div>
              </label>
              <label class="radio-option" [class.selected]="Mode === 'update'">
                <input type="radio" name="saveMode" value="update" [(ngModel)]="Mode" />
                <div class="radio-content">
                  <span class="radio-label">Update current version</span>
                  <span class="radio-desc">Overwrites v{{ CurrentVersion }}</span>
                </div>
              </label>
            </div>
          }
        </div>

        <kendo-dialog-actions>
          <button kendoButton [themeColor]="'primary'" (click)="OnSave()">
            <i class="fa-solid fa-save"></i> Save
          </button>
          <button kendoButton [themeColor]="'base'" (click)="OnCancel()">
            Cancel
          </button>
        </kendo-dialog-actions>
      </kendo-dialog>
    }
  `,
  styles: [`
    .dialog-body {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 4px 0;
    }

    .version-context {
      display: flex;
      align-items: center;
    }

    .version-badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      background: var(--mat-sys-primary-container, #e0e7ff);
      color: var(--mat-sys-on-primary-container, #1e1b4b);
    }

    .new-badge {
      background: var(--mat-sys-tertiary-container, #f3e8ff);
      color: var(--mat-sys-on-tertiary-container, #4a1d96);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--mat-sys-on-surface, #1f2937);
    }

    .comment-input {
      width: 100%;
    }

    .save-mode {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .radio-option {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--mat-sys-outline-variant, #d1d5db);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .radio-option:hover {
      background: var(--mat-sys-surface-container, #f3f4f6);
    }

    .radio-option.selected {
      border-color: var(--mat-sys-primary, #6366f1);
      background: var(--mat-sys-primary-container, #e0e7ff);
    }

    .radio-option input[type="radio"] {
      margin-top: 2px;
      accent-color: var(--mat-sys-primary, #6366f1);
    }

    .radio-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .radio-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--mat-sys-on-surface, #1f2937);
    }

    .radio-desc {
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #6b7280);
    }
  `]
})
export class SaveVersionDialogComponent {
  @Input() Visible = false;
  @Input() CurrentVersion = 0;
  @Output() Save = new EventEmitter<SaveVersionResult>();
  @Output() Cancel = new EventEmitter<void>();

  Comment = '';
  Mode: 'new' | 'update' = 'new';

  OnSave(): void {
    this.Save.emit({
      Comment: this.Comment,
      Mode: this.Mode
    });
    this.ResetForm();
  }

  OnCancel(): void {
    this.Cancel.emit();
    this.ResetForm();
  }

  private ResetForm(): void {
    this.Comment = '';
    this.Mode = 'new';
  }
}
