import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJNumericInputComponent } from './numeric-input.component';

/** DOM-level spec for <mj-numeric-input> — attributes, CVA value/disabled, typing + clamping. */
describe('MJNumericInputComponent (DOM)', () => {
  const inputOf = (f: ComponentFixture<MJNumericInputComponent>) =>
    f.nativeElement.querySelector('input.mj-numeric-input') as HTMLInputElement;

  it('reflects Min/Max/Step into the input attributes', () => {
    const input = inputOf(renderComponentFixture(MJNumericInputComponent, { inputs: { Min: 0, Max: 10, Step: 2 } }));
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('10');
    expect(input.getAttribute('step')).toBe('2');
  });

  it('renders the placeholder', () => {
    const f = renderComponentFixture(MJNumericInputComponent, { inputs: { Placeholder: 'Enter a number' } });
    expect(inputOf(f).getAttribute('placeholder')).toBe('Enter a number');
  });

  it('shows the value written through the CVA', () => {
    const f = renderComponentFixture(MJNumericInputComponent, { setup: (c) => c.writeValue(42) });
    expect(inputOf(f).value).toBe('42');
  });

  it('emits the typed value through the CVA onChange', () => {
    const spy = vi.fn();
    const input = inputOf(renderComponentFixture(MJNumericInputComponent, { setup: (c) => c.registerOnChange(spy) }));
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    expect(spy).toHaveBeenCalledWith(7);
  });

  it('clamps a typed value above Max', () => {
    const spy = vi.fn();
    const input = inputOf(
      renderComponentFixture(MJNumericInputComponent, { inputs: { Max: 10 }, setup: (c) => c.registerOnChange(spy) }),
    );
    input.value = '50';
    input.dispatchEvent(new Event('input'));
    expect(spy).toHaveBeenCalledWith(10);
  });

  it('reflects the disabled state set via the CVA', () => {
    const f = renderComponentFixture(MJNumericInputComponent, { setup: (c) => c.setDisabledState(true) });
    expect(inputOf(f).disabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disabled-state contract — the control is unusable exactly when the `Disabled` input OR the
 * reactive-forms disabled state says so, **at every point in time**, not only at the moment
 * Angular Forms registers the ControlValueAccessor.
 *
 * Needs a real `ngModel` host (the specs above render the component bare, which never triggers
 * CVA registration): Angular calls `setDisabledState()` ONCE, at registration, and `IsDisabled`
 * used to be assigned only there — freezing whatever `Disabled` happened to be at that instant
 * and ignoring every later change. Found on `mj-dropdown` 2026-08-07; all five MJ form controls
 * carried the identical defect.
 */
@Component({
  standalone: true,
  imports: [MJNumericInputComponent, FormsModule],
  template: `<mj-numeric-input [Disabled]="Locked" [(ngModel)]="Value" />`,
})
class DisabledHostComponent {
  /** An @Input so specs flip it via `componentRef.setInput()` — the zoneless-correct way to mark
   *  the view dirty; a plain field assignment trips NG0100 on the verify pass. */
  @Input() Locked = false;
  public Value: number | null = null;
}

describe('MJNumericInputComponent — disabled state (DOM, ngModel host)', () => {
  let fixture: ComponentFixture<DisabledHostComponent>;

  const control = (): MJNumericInputComponent =>
    fixture.debugElement.children[0].componentInstance as MJNumericInputComponent;
  const nativeControl = (): HTMLInputElement | HTMLButtonElement =>
    fixture.nativeElement.querySelector('input.mj-numeric-input');
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
describe('MJNumericInputComponent — Disabled with no Angular Forms binding (DOM)', () => {
  it('honours [Disabled] on its own, with no ngModel present', () => {
    const f = renderComponentFixture(MJNumericInputComponent, { inputs: { Disabled: true } });

    expect(f.componentInstance.IsDisabled, 'the gate must follow the input unaided').toBe(true);
    expect((f.nativeElement.querySelector('input.mj-numeric-input') as HTMLInputElement).disabled).toBe(true);
  });
});
