import { Component, Input, forwardRef, HostBinding } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

/**
 * mj-switch — Toggle switch. Replaces `<kendo-switch>`.
 */
@Component({
  selector: 'mj-switch',
  standalone: true,
  template: `
    <button type="button" role="switch" class="mj-switch"
      [class.mj-switch--on]="Value" [class.mj-switch--disabled]="IsDisabled"
      [attr.aria-checked]="Value" [disabled]="IsDisabled"
      (click)="Toggle()" (blur)="OnTouched()">
      <span class="mj-switch-track"><span class="mj-switch-thumb"></span></span>
      @if (OnLabel || OffLabel) {
        <span class="mj-switch-label">{{ Value ? OnLabel : OffLabel }}</span>
      }
    </button>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MJSwitchComponent), multi: true }]
})
export class MJSwitchComponent implements ControlValueAccessor {
  @Input() OnLabel = '';
  @Input() OffLabel = '';
  @Input() Disabled = false;
  @HostBinding('class.mj-switch-host') readonly hostClass = true;

  Value = false;
  IsDisabled = false;
  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  Toggle(): void { if (!this.IsDisabled) { this.Value = !this.Value; this.onChange(this.Value); } }
  OnTouched(): void { this.onTouched(); }
  writeValue(value: boolean): void { this.Value = !!value; }
  registerOnChange(fn: (value: boolean) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.IsDisabled = isDisabled || this.Disabled; }
}
