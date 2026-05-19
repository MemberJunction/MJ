import { Component, Input } from '@angular/core';

@Component({
  standalone: false,
  selector: 'mj-input-dialog',
  template: `
    <div class="input-dialog-content">
      <p class="dialog-message">{{ message }}</p>
      <div class="input-field">
        <label class="input-label">
          {{ inputLabel }}
          @if (required) {
            <span class="required-mark">*</span>
          }
        </label>
        @if (inputType === 'textarea') {
          <textarea
            [(ngModel)]="value"
            [placeholder]="placeholder"
            class="mj-textarea">
          </textarea>
        }
        @if (inputType !== 'textarea') {
          <input
            [(ngModel)]="value"
            [type]="inputType || 'text'"
            [placeholder]="placeholder"
            class="mj-input"
            (keydown.enter)="onEnterKey($event)">
        }
      </div>
      @if (secondInputLabel) {
        <div class="input-field">
          <label class="input-label">
            {{ secondInputLabel }}
            @if (secondInputRequired) {
              <span class="required-mark">*</span>
            }
          </label>
          <textarea
            [(ngModel)]="secondValue"
            [placeholder]="secondInputPlaceholder"
            class="mj-textarea">
          </textarea>
        </div>
      }
    </div>
    `,
  styles: [`
    .input-dialog-content {
      padding: 8px 0;
    }
    .dialog-message {
      margin: 0 0 16px 0;
      color: var(--mj-text-primary);
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
      color: var(--mj-text-secondary);
    }
    .required-mark {
      color: var(--mj-status-error);
      margin-left: 2px;
    }
    .mj-input,
    .mj-textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
    }
    .mj-input:focus,
    .mj-textarea:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
    }
    .mj-textarea {
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

  onEnterKey(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (this.inputType !== 'textarea') {
      keyEvent.preventDefault();
      // Trigger OK/primary button click in the MJ dialog
      const okButton = document.querySelector('.mj-dialog-actions .mj-btn--primary') as HTMLButtonElement;
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
