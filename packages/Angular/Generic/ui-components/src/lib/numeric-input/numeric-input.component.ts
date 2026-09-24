import { Component, Input, forwardRef, HostBinding, ChangeDetectorRef, inject } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

/**
 * mj-numeric-input — Numeric input with min/max/step. Replaces `<kendo-numerictextbox>`.
 */
@Component({
  selector: 'mj-numeric-input',
  standalone: true,
  template: `
    <input type="number" class="mj-input mj-numeric-input"
      [attr.min]="Min" [attr.max]="Max" [attr.step]="Step"
      [attr.placeholder]="Placeholder" [disabled]="IsDisabled"
      [value]="DisplayValue"
      (input)="OnInput($event)" (blur)="OnBlur()" />
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MJNumericInputComponent), multi: true }]
})
export class MJNumericInputComponent implements ControlValueAccessor {
  @Input() Min: number | null = null;
  @Input() Max: number | null = null;
  @Input() Step: number = 1;
  @Input() Format: string = '';
  @Input() Decimals: number | null = null;
  /**
   * Host-driven disable. Composed with Angular Forms' `setDisabledState()` into `IsDisabled`
   * (the actual gate) — see `syncDisabled`. A setter, not a bare field, because this input is
   * routinely bound to an expression that changes over the control's lifetime, and the gate has
   * to follow it every time.
   */
  @Input()
  set Disabled(value: boolean) { this.disabledInput = value; this.syncDisabled(); }
  get Disabled(): boolean { return this.disabledInput; }
  @Input() Placeholder = '';
  @HostBinding('class.mj-numeric-input-host') readonly hostClass = true;

  /** The rendered `[disabled]` state — true when EITHER source says so. Assign via `syncDisabled()`. */
  IsDisabled = false;
  private disabledInput = false;
  private formDisabled = false;
  private cdr = inject(ChangeDetectorRef);

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

  DisplayValue: string | number = '';
  private internalValue: number | null = null;
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  OnInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (raw === '' || raw === '-') { this.internalValue = null; this.onChange(null); return; }
    let num = parseFloat(raw);
    if (isNaN(num)) return;
    num = this.clamp(num);
    this.internalValue = num;
    this.onChange(num);
  }

  OnBlur(): void { this.onTouched(); this.formatDisplay(); }

  writeValue(value: number | null): void { this.internalValue = value; this.formatDisplay(); }
  registerOnChange(fn: (value: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.formDisabled = isDisabled; this.syncDisabled(); }

  private clamp(value: number): number {
    if (this.Min != null && value < this.Min) return this.Min;
    if (this.Max != null && value > this.Max) return this.Max;
    if (this.Decimals != null) { const f = Math.pow(10, this.Decimals); return Math.round(value * f) / f; }
    return value;
  }

  private formatDisplay(): void {
    if (this.internalValue == null) { this.DisplayValue = ''; return; }
    this.DisplayValue = this.Decimals != null ? this.internalValue.toFixed(this.Decimals) : this.internalValue;
  }
}
