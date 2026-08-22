import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJDatepickerComponent } from './datepicker.component';

/**
 * DOM-level spec for <mj-datepicker>. Special case: the calendar is a CDK overlay
 * (renders OUTSIDE the fixture) over a @for day grid, so the popup behavior — month
 * nav, day selection (SelectDate/SelectToday), and the selected/today/other-month day
 * classes — is left to a Playwright/e2e or overlay-harness pass (see deferred note
 * below). Here we cover the reliably unit-testable closed-state surface: the input.
 */
describe('MJDatepickerComponent (DOM)', () => {
  const inputOf = (f: ComponentFixture<MJDatepickerComponent>) => f.nativeElement.querySelector('input.mj-datepicker-input') as HTMLInputElement;

  it('renders the placeholder', () => {
    const f = renderComponentFixture(MJDatepickerComponent, { inputs: { Placeholder: 'Pick a date' } });
    expect(inputOf(f).placeholder).toBe('Pick a date');
  });

  it('shows a CVA-written date in the input', () => {
    const f = renderComponentFixture(MJDatepickerComponent, { setup: (c) => c.writeValue(new Date(2024, 0, 15)) });
    expect(inputOf(f).value).toContain('2024');
  });

  it('emits ValueChange with a Date when a valid date is typed', () => {
    const spy = vi.fn();
    const input = inputOf(renderComponentFixture(MJDatepickerComponent, { setup: (c) => c.ValueChange.subscribe(spy) }));

    input.value = '01/15/2024';
    input.dispatchEvent(new Event('input'));

    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as Date).getFullYear()).toBe(2024);
  });

  it('reflects the disabled state into the wrapper class, the input, and the toggle button', () => {
    const f = renderComponentFixture(MJDatepickerComponent, { setup: (c) => c.setDisabledState(true) });

    expect((f.nativeElement.querySelector('.mj-datepicker') as HTMLElement).classList.contains('mj-datepicker--disabled')).toBe(true);
    expect(inputOf(f).disabled).toBe(true);
    expect((f.nativeElement.querySelector('.mj-datepicker-toggle') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Deferred (CDK overlay + @for day grid — renders outside the fixture) ──────────
  // The calendar popup behavior must be covered by a live/e2e or overlay-harness test,
  // not a jsdom unit test:
  //   - Toggle()/Open() opens the calendar; backdropClick/Escape closes it
  //   - PreviousMonth()/NextMonth() change MonthYearLabel
  //   - SelectDate(day)/SelectToday() set the value, emit ValueChange, and close
  //   - day cells: mj-calendar-day--selected / --today / --other-month + aria-selected
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
  imports: [MJDatepickerComponent, FormsModule],
  template: `<mj-datepicker [Disabled]="Locked" [(ngModel)]="Value" />`,
})
class DisabledHostComponent {
  /** An @Input so specs flip it via `componentRef.setInput()` — the zoneless-correct way to mark
   *  the view dirty; a plain field assignment trips NG0100 on the verify pass. */
  @Input() Locked = false;
  public Value: Date | null = null;
}

describe('MJDatepickerComponent — disabled state (DOM, ngModel host)', () => {
  let fixture: ComponentFixture<DisabledHostComponent>;

  const control = (): MJDatepickerComponent =>
    fixture.debugElement.children[0].componentInstance as MJDatepickerComponent;
  const nativeControl = (): HTMLInputElement | HTMLButtonElement =>
    fixture.nativeElement.querySelector('input.mj-input');
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
