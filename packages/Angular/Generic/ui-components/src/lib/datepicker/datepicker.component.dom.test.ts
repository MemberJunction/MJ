import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
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
