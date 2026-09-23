import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  Input,
  ViewChild,
  forwardRef,
  inject
} from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MJNamedControlBase } from '../a11y/named-control.base';
import { warnIfUnnamed } from '../a11y/unnamed-control-guard';

/**
 * mj-switch — Toggle switch. Replaces `<kendo-switch>`.
 *
 * Every switch needs an ACCESSIBLE NAME. Without one it announces as "switch, on" — or, worse, as
 * its own STATE, because `OnLabel`/`OffLabel` render inside the button and a `role=switch` takes
 * its name from its contents when nothing else names it: a toggle labelled "On" that announces
 * "On, switch, on" says nothing about what it toggles (WCAG 2.1 4.1.2). Use
 * {@link MJNamedControlBase.AriaLabelledBy} when a visible label exists,
 * {@link MJNamedControlBase.AriaLabel} when none does; either one overrides that state text.
 *
 * The switch is a `<button>`, which IS a labelable element, so
 * {@link MJNamedControlBase.InputId} doubles as a `<label for>` target: the label names the switch
 * — overriding the On/Off text, since an associated label outranks an element's own contents — and
 * clicking it focuses and toggles the switch, which `AriaLabelledBy` alone does not give you.
 *
 * @example
 * ```html
 * <mj-switch AriaLabel="Email notifications" [(ngModel)]="isEnabled" OnLabel="On" OffLabel="Off" />
 * ```
 */
@Component({
  selector: 'mj-switch',
  standalone: true,
  template: `
    <button #switchButton type="button" role="switch" class="mj-switch"
      [class.mj-switch--on]="Value" [class.mj-switch--disabled]="IsDisabled"
      [attr.id]="InputId || null"
      [attr.aria-label]="AriaLabel || null"
      [attr.aria-labelledby]="AriaLabelledBy || null"
      [attr.aria-describedby]="AriaDescribedBy || null"
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
export class MJSwitchComponent extends MJNamedControlBase implements ControlValueAccessor, AfterViewInit {
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
  @ViewChild('switchButton') private switchButtonEl: ElementRef<HTMLButtonElement> | undefined;

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

  ngAfterViewInit(): void { warnIfUnnamed(this.switchButtonEl?.nativeElement, 'mj-switch'); }

  Toggle(): void { if (!this.IsDisabled) { this.Value = !this.Value; this.onChange(this.Value); } }
  OnTouched(): void { this.onTouched(); }
  writeValue(value: boolean): void { this.Value = !!value; }
  registerOnChange(fn: (value: boolean) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.formDisabled = isDisabled; this.syncDisabled(); }
}
