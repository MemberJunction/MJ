import { Component, Input, forwardRef, HostBinding, ChangeDetectorRef, inject } from '@angular/core';
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
  private cdr = inject(ChangeDetectorRef);
  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  /**
   * Recompute the gate from both of its sources. Called whenever either one changes.
   *
   * `IsDisabled` is derived state, and the only thing that assigned it was `setDisabledState()`.
   * The forms-driven half was in fact fine — `setUpControl` also wires `registerOnDisabledChange`,
   * so that hook fires on every `control.disable()`/`enable()`, not just at registration. What had
   * no recompute path at all was the `Disabled` @Input: a plain field, so the gate froze at
   * whatever the first compose produced and every later change to the input was dropped.
   */
  private syncDisabled(): void {
    const disabled = this.disabledInput || this.formDisabled;
    if (disabled === this.IsDisabled) return;
    this.IsDisabled = disabled;
    this.cdr.markForCheck();
  }

  Toggle(): void { if (!this.IsDisabled) { this.Value = !this.Value; this.onChange(this.Value); } }
  OnTouched(): void { this.onTouched(); }
  writeValue(value: boolean): void { this.Value = !!value; }
  registerOnChange(fn: (value: boolean) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.formDisabled = isDisabled; this.syncDisabled(); }
}
