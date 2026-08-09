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
  /**
   * Host-driven disable. Composed with Angular Forms' `setDisabledState()` into `IsDisabled`
   * (the actual gate) — see `syncDisabled`. A setter, not a bare field, because this input is
   * routinely bound to an expression that changes over the control's lifetime, and the gate has
   * to follow it every time.
   */
  @Input()
  set Disabled(value: boolean) { this.disabledInput = value; this.syncDisabled(); }
  get Disabled(): boolean { return this.disabledInput; }
  @HostBinding('class.mj-switch-host') readonly hostClass = true;

  Value = false;
  /** The gate on `Toggle()` — true when EITHER source says so. Assign only via `syncDisabled()`. */
  IsDisabled = false;
  private disabledInput = false;
  private formDisabled = false;
  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  /**
   * Recompute the gate from both of its sources. Angular invokes `setDisabledState()` exactly once
   * for a plain `ngModel` binding (at CVA registration), so composing them only at that moment
   * would freeze whatever `Disabled` happened to be then.
   */
  private syncDisabled(): void { this.IsDisabled = this.disabledInput || this.formDisabled; }

  Toggle(): void { if (!this.IsDisabled) { this.Value = !this.Value; this.onChange(this.Value); } }
  OnTouched(): void { this.onTouched(); }
  writeValue(value: boolean): void { this.Value = !!value; }
  registerOnChange(fn: (value: boolean) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.formDisabled = isDisabled; this.syncDisabled(); }
}
