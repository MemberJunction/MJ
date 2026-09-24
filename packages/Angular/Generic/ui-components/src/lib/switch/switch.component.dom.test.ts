import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJSwitchComponent } from './switch.component';

/**
 * DOM-level spec for `<mj-switch>`. Proves the harness renders a real template
 * and that the rendered `<button role="switch">` is wired to component state.
 *
 * Class-level behavior (CVA contract: writeValue / registerOnChange) is covered
 * by instantiating the class directly; here we assert on the *rendered DOM* and
 * on the click → handler → state path that only exists in the template.
 *
 * Zoneless note: change detection is driven explicitly with
 * `fixture.detectChanges()`. State that is set *programmatically* (not via a DOM
 * event or `componentRef.setInput`) must be set BEFORE the first
 * `detectChanges()`; otherwise the dev-mode check-no-changes pass throws NG0100
 * because the view was never marked dirty. See guides/ANGULAR_TESTING_GUIDE.md.
 */
describe('MJSwitchComponent (DOM)', () => {
  function buttonOf(fixture: ComponentFixture<MJSwitchComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button.mj-switch') as HTMLButtonElement;
  }

  function render(): { fixture: ComponentFixture<MJSwitchComponent>; button: HTMLButtonElement } {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    fixture.detectChanges();
    return { fixture, button: buttonOf(fixture) };
  }

  it('renders a switch button with aria-checked reflecting Value (off by default)', () => {
    const { button } = render();
    expect(button).not.toBeNull();
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(button.classList.contains('mj-switch--on')).toBe(false);
  });

  it('toggles Value and the on-class / aria-checked when clicked', () => {
    const { fixture, button } = render();

    button.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.Value).toBe(true);
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(button.classList.contains('mj-switch--on')).toBe(true);
  });

  it('emits the new value through the CVA onChange when the button is clicked', () => {
    const { fixture, button } = render();
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);

    button.click();

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders no label span when neither OnLabel nor OffLabel is set', () => {
    const { button } = render();
    expect(button.querySelector('.mj-switch-label')).toBeNull();
  });

  it('renders the OffLabel text when OffLabel is set and Value is false', () => {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    // @Input set via setInput marks the view dirty the zoneless-correct way.
    fixture.componentRef.setInput('OffLabel', 'Off');
    fixture.detectChanges();

    const label = buttonOf(fixture).querySelector('.mj-switch-label');
    expect(label).not.toBeNull();
    expect(label?.textContent?.trim()).toBe('Off');
  });

  it('reflects the disabled state into the rendered button and blocks toggling', () => {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    // Set disabled BEFORE the first CD pass (programmatic state, no DOM event).
    fixture.componentInstance.setDisabledState(true);
    fixture.detectChanges();
    const button = buttonOf(fixture);

    expect(button.disabled).toBe(true);
    expect(button.classList.contains('mj-switch--disabled')).toBe(true);

    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.Value).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disabled-state contract — the control is unusable exactly when the `Disabled` input OR the
 * reactive-forms disabled state says so, **at every point in time**, not only at the moment
 * Angular Forms registers the ControlValueAccessor.
 *
 * Needs a real `ngModel` host (the specs above render the component bare, which never triggers
 * CVA registration): `IsDisabled` is derived state whose only writer was `setDisabledState()`. The
 * forms-driven half was always live (`registerOnDisabledChange` re-fires the hook on every
 * `disable()`/`enable()`); the `Disabled` @Input was a plain field with no recompute path, so the
 * gate froze whatever it happened to be when the hook last ran and ignored every later change —
 * and with no forms binding at all it was completely inert. Found on `mj-dropdown` 2026-08-07;
 * all five MJ form controls carried the identical defect.
 */
@Component({
  standalone: true,
  imports: [MJSwitchComponent, FormsModule],
  template: `<mj-switch [Disabled]="Locked" [(ngModel)]="Value" />`,
})
class DisabledHostComponent {
  /** An @Input so specs flip it via `componentRef.setInput()` — the zoneless-correct way to mark
   *  the view dirty; a plain field assignment trips NG0100 on the verify pass. */
  @Input() Locked = false;
  public Value = false;
}

describe('MJSwitchComponent — disabled state (DOM, ngModel host)', () => {
  let fixture: ComponentFixture<DisabledHostComponent>;

  const control = (): MJSwitchComponent =>
    fixture.debugElement.children[0].componentInstance as MJSwitchComponent;
  const nativeControl = (): HTMLInputElement | HTMLButtonElement =>
    fixture.nativeElement.querySelector('button.mj-switch');
  const lock = (value: boolean): void => {
    fixture.componentRef.setInput('Locked', value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DisabledHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(DisabledHostComponent);
  });

  it('RE-ENABLES when Disabled flips to false after registration', () => {
    lock(true);
    expect(control().IsDisabled).toBe(true);
    expect(nativeControl().disabled).toBe(true);

    lock(false);
    expect(control().IsDisabled, 'the gate must follow the @Input back to false').toBe(false);
    expect(nativeControl().disabled).toBe(false);
  });

  it('LOCKS when Disabled flips to true after registration', () => {
    lock(false);
    expect(control().IsDisabled).toBe(false);

    lock(true);
    expect(control().IsDisabled).toBe(true);
    expect(nativeControl().disabled).toBe(true);
  });

  it('stays disabled while the forms-driven state holds, regardless of @Input churn', () => {
    lock(false); // first CD pass — this is what registers the ControlValueAccessor

    // `setDisabledState` is how Angular Forms reports a programmatically disabled control. Render
    // it via a `lock()` (setInput) rather than a bare `detectChanges()`: a direct call mutates
    // state without marking the view dirty, and zoneless dev-mode check-no-changes then throws
    // NG0100 (guides/ANGULAR_TESTING_GUIDE.md). The @Input churn is the assertion anyway.
    control().setDisabledState(true);
    lock(true);
    lock(false);
    expect(control().IsDisabled, 'forms-driven disable survives @Input churn').toBe(true);
    expect(nativeControl().disabled, 'and it is still rendered disabled').toBe(true);

    control().setDisabledState(false);
    lock(true);
    lock(false);
    expect(control().IsDisabled, 'released by both sources ⇒ usable').toBe(false);
    expect(nativeControl().disabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * The same defect in its broadest form — no Angular Forms anywhere. With no `ngModel` /
 * `formControl` on the element, `setDisabledState()` is never called at all, so the gate was left
 * at its initialiser and `[Disabled]` was completely inert: the control rendered fully enabled and
 * responded to gestures. `Disabled` only ever worked as a side effect of a forms binding happening
 * to compose it in, which is why this is the widest case and the cheapest one to regress.
 */
describe('MJSwitchComponent — Disabled with no Angular Forms binding (DOM)', () => {
  it('honours [Disabled] on its own, with no ngModel present', () => {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    fixture.componentRef.setInput('Disabled', true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button.mj-switch') as HTMLButtonElement;

    expect(fixture.componentInstance.IsDisabled, 'the gate must follow the input unaided').toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.classList.contains('mj-switch--disabled')).toBe(true);

    fixture.componentInstance.Toggle();
    fixture.detectChanges();
    expect(fixture.componentInstance.Value, 'a disabled switch must not toggle').toBe(false);
  });
});
