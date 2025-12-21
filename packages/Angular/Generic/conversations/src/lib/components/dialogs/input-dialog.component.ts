import { Component, Input } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';

@Component({
  standalone: false,
  selector: 'mj-input-dialog',
  template: `
    <div class="input-dialog-content">
      <p class="dialog-message">{{ message }}</p>
      <div class="input-field">
        <label class="input-label">
          {{ inputLabel }}
          <span *ngIf="required" class="required-mark">*</span>
        </label>
        <textarea
          *ngIf="inputType === 'textarea'"
          [(ngModel)]="value"
          [placeholder]="placeholder"
          class="k-textarea">
        </textarea>
        <input
          *ngIf="inputType !== 'textarea'"
          [(ngModel)]="value"
          [type]="inputType || 'text'"
          [placeholder]="placeholder"
          class="k-textbox"
          (keydown.enter)="onEnterKey($event)">
      </div>
      <div class="input-field" *ngIf="secondInputLabel">
        <label class="input-label">
          {{ secondInputLabel }}
          <span *ngIf="secondInputRequired" class="required-mark">*</span>
        </label>
        <textarea
          [(ngModel)]="secondValue"
          [placeholder]="secondInputPlaceholder"
          class="k-textarea">
        </textarea>
      </div>
    </div>
  `,
  styles: [`
    .input-dialog-content {
      padding: 8px 0;
    }
    .dialog-message {
      margin: 0 0 16px 0;
      color: #333;
      font-size: 14px;
    }
    .input-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .input-label {
      font-weight: 500;
      font-size: 13px;
      color: #555;
    }
    .required-mark {
      color: #DC2626;
      margin-left: 2px;
    }
    .k-textbox,
    .k-textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
    }
    .k-textbox:focus,
    .k-textarea:focus {
      outline: none;
      border-color: #3B82F6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    .k-textarea {
      min-height: 80px;
      resize: vertical;
    }
  `]
})
export class InputDialogComponent {
  @Input() message: string = '';
  @Input() inputLabel: string = '';
  @Input() inputType: 'text' | 'textarea' | 'number' | 'email' = 'text';
  @Input() placeholder: string = '';
  @Input() required: boolean = false;
  @Input() value: string = '';
  @Input() secondInputLabel: string = '';
  @Input() secondInputPlaceholder: string = '';
  @Input() secondInputRequired: boolean = false;
  @Input() secondValue: string = '';

  constructor(public dialogRef: DialogRef) {}

  onEnterKey(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (this.inputType !== 'textarea') {
      keyEvent.preventDefault();
      // Trigger OK button click
      const okButton = document.querySelector('.k-dialog-actions button.k-primary') as HTMLButtonElement;
      if (okButton) {
        okButton.click();
      }
    }
  }

  getValue(): string {
    return this.value.trim();
  }

  getSecondValue(): string {
    return this.secondValue.trim();
  }
}
