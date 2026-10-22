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
      /* MJDialogContainerComponent pads only string content (.mj-dialog-body > p); a component
         body arrives with no horizontal padding at all, so the message, labels and inputs sat flush
         against the dialog edges while the header and footer were padded. Same inset as the sibling
         rating dialog, which already compensates for this. */
      padding: 4px 20px 8px;
      /* Parity with the rating dialog: the Explorer shell's global reset makes this redundant, but a host
         without that reset would let the 100%-wide inputs (padding + border, no local box-sizing) overflow. */
      box-sizing: border-box;
    }
    .input-dialog-content * {
      box-sizing: border-box;
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
  @Input() Message: string = '';

  /** @deprecated Use {@link Message}. */
  @Input() set message(value: string) {
    this.Message = value;
  }
  /** @deprecated Use {@link Message}. */
  get message(): string {
    return this.Message;
  }
  @Input() InputLabel: string = '';

  /** @deprecated Use {@link InputLabel}. */
  @Input() set inputLabel(value: string) {
    this.InputLabel = value;
  }
  /** @deprecated Use {@link InputLabel}. */
  get inputLabel(): string {
    return this.InputLabel;
  }
  @Input() InputType: 'text' | 'textarea' | 'number' | 'email' = 'text';

  /** @deprecated Use {@link InputType}. */
  @Input() set inputType(value: 'text' | 'textarea' | 'number' | 'email') {
    this.InputType = value;
  }
  /** @deprecated Use {@link InputType}. */
  get inputType(): 'text' | 'textarea' | 'number' | 'email' {
    return this.InputType;
  }
  @Input() Placeholder: string = '';

  /** @deprecated Use {@link Placeholder}. */
  @Input() set placeholder(value: string) {
    this.Placeholder = value;
  }
  /** @deprecated Use {@link Placeholder}. */
  get placeholder(): string {
    return this.Placeholder;
  }
  @Input() Required: boolean = false;

  /** @deprecated Use {@link Required}. */
  @Input() set required(value: boolean) {
    this.Required = value;
  }
  /** @deprecated Use {@link Required}. */
  get required(): boolean {
    return this.Required;
  }
  @Input() Value: string = '';

  /** @deprecated Use {@link Value}. */
  @Input() set value(value: string) {
    this.Value = value;
  }
  /** @deprecated Use {@link Value}. */
  get value(): string {
    return this.Value;
  }
  @Input() SecondInputLabel: string = '';

  /** @deprecated Use {@link SecondInputLabel}. */
  @Input() set secondInputLabel(value: string) {
    this.SecondInputLabel = value;
  }
  /** @deprecated Use {@link SecondInputLabel}. */
  get secondInputLabel(): string {
    return this.SecondInputLabel;
  }
  @Input() SecondInputPlaceholder: string = '';

  /** @deprecated Use {@link SecondInputPlaceholder}. */
  @Input() set secondInputPlaceholder(value: string) {
    this.SecondInputPlaceholder = value;
  }
  /** @deprecated Use {@link SecondInputPlaceholder}. */
  get secondInputPlaceholder(): string {
    return this.SecondInputPlaceholder;
  }
  @Input() SecondInputRequired: boolean = false;

  /** @deprecated Use {@link SecondInputRequired}. */
  @Input() set secondInputRequired(value: boolean) {
    this.SecondInputRequired = value;
  }
  /** @deprecated Use {@link SecondInputRequired}. */
  get secondInputRequired(): boolean {
    return this.SecondInputRequired;
  }
  @Input() SecondValue: string = '';

  /** @deprecated Use {@link SecondValue}. */
  @Input() set secondValue(value: string) {
    this.SecondValue = value;
  }
  /** @deprecated Use {@link SecondValue}. */
  get secondValue(): string {
    return this.SecondValue;
  }

  OnEnterKey(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (this.InputType !== 'textarea') {
      keyEvent.preventDefault();
      // Trigger OK/primary button click in the MJ dialog
      const okButton = document.querySelector('.mj-dialog-actions .mj-btn--primary') as HTMLButtonElement;
      if (okButton) {
        okButton.click();
      }
    }
  }

  /** @deprecated Use {@link OnEnterKey}. */
  onEnterKey(event: Event): void {
    return this.OnEnterKey(event);
  }

  GetValue(): string {
    return this.Value.trim();
  }

  /** @deprecated Use {@link GetValue}. */
  getValue(): string {
    return this.GetValue();
  }

  GetSecondValue(): string {
    return this.SecondValue.trim();
  }

  /** @deprecated Use {@link GetSecondValue}. */
  getSecondValue(): string {
    return this.GetSecondValue();
  }
}
