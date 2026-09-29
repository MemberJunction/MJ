import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { renderComponentFixture, overlayQuery, clearOverlayContainers } from '@memberjunction/ng-test-utils';
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
 * CVA registration): `IsDisabled` is derived state whose only writer was `setDisabledState()`. The
 * forms-driven half was always live (`registerOnDisabledChange` re-fires the hook on every
 * `disable()`/`enable()`); the `Disabled` @Input was a plain field with no recompute path, so the
 * gate froze whatever it happened to be when the hook last ran and ignored every later change —
 * and with no forms binding at all it was completely inert. Found on `mj-dropdown` 2026-08-07;
 * all five MJ form controls carried the identical defect.
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
  const toggleButton = (): HTMLButtonElement => fixture.nativeElement.querySelector('.mj-datepicker-toggle');
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
    toggleButton().click();
    fixture.detectChanges();
    expect(control().IsOpen).toBe(true);

    lock(true);
    expect(control().IsDisabled).toBe(true);
    expect(nativeControl().disabled).toBe(true);
    expect(control().IsOpen, 'locking an open datepicker must close its calendar').toBe(false);

    toggleButton().click();
    fixture.detectChanges();
    expect(control().IsOpen, 'and it must not reopen while locked').toBe(false);
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
describe('MJDatepickerComponent — Disabled with no Angular Forms binding (DOM)', () => {
  it('honours [Disabled] on its own, with no ngModel present', () => {
    const f = renderComponentFixture(MJDatepickerComponent, { inputs: { Disabled: true } });

    expect(f.componentInstance.IsDisabled, 'the gate must follow the input unaided').toBe(true);
    expect((f.nativeElement.querySelector('.mj-datepicker') as HTMLElement)
      .classList.contains('mj-datepicker--disabled')).toBe(true);
    expect((f.nativeElement.querySelector('input.mj-datepicker-input') as HTMLInputElement).disabled).toBe(true);

    f.componentInstance.Toggle();
    f.detectChanges();
    expect(f.componentInstance.IsOpen, 'a disabled datepicker must not open its calendar').toBe(false);
  });
});

describe('MJDatepickerComponent — accessible name (#4116)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(MJDatepickerComponent, { inputs });
  const input = (f: ComponentFixture<MJDatepickerComponent>) =>
    f.nativeElement.querySelector('input.mj-datepicker-input') as HTMLInputElement;
  const toggle = (f: ComponentFixture<MJDatepickerComponent>) =>
    f.nativeElement.querySelector('.mj-datepicker-toggle') as HTMLButtonElement;
  const open = (f: ComponentFixture<MJDatepickerComponent>) => { toggle(f).click(); f.detectChanges(); };
  /** Id of the hidden span holding one composed word, found by the word itself. */
  const srOnlyId = (f: ComponentFixture<MJDatepickerComponent>, word: string) =>
    Array.from(f.nativeElement.querySelectorAll('.mj-datepicker-sr-only') as NodeListOf<HTMLElement>)
      .find((el) => el.textContent?.trim() === word)
      ?.getAttribute('id');

  // The calendar renders through a CDK connected-overlay; one left open would leak into the next test.
  afterEach(() => clearOverlayContainers());

  it('names the date field with AriaLabel', () => {
    expect(input(render({ AriaLabel: 'Due date' })).getAttribute('aria-label')).toBe('Due date');
  });

  it('names the date field from a visible label via AriaLabelledBy', () => {
    expect(input(render({ AriaLabelledBy: 'due-label' })).getAttribute('aria-labelledby')).toBe('due-label');
  });

  it('puts InputId on the real <input>, which IS a valid <label for> target', () => {
    const f = render({ InputId: 'due-date-field' });
    expect(input(f).getAttribute('id')).toBe('due-date-field');
    expect(input(f).tagName).toBe('INPUT');
  });

  it('passes AriaDescribedBy through for hint and error text', () => {
    expect(input(render({ AriaDescribedBy: 'due-hint' })).getAttribute('aria-describedby')).toBe('due-hint');
  });

  it('renders NO empty name attributes when nothing is configured — absent beats empty', () => {
    const el = input(render());
    expect(el.hasAttribute('aria-label')).toBe(false);
    expect(el.hasAttribute('aria-labelledby')).toBe(false);
    expect(el.hasAttribute('id')).toBe(false);
    expect(el.hasAttribute('aria-describedby')).toBe(false);
  });

  it('names the toggle button from the field name instead of a bare "Open calendar"', () => {
    expect(toggle(render({ AriaLabel: 'Due date' })).getAttribute('aria-label')).toBe('Open calendar for Due date');
  });

  it('names the toggle button from the VISIBLE label too, via an id list', () => {
    const f = render({ AriaLabelledBy: 'due-label' });
    const wordId = srOnlyId(f, 'Open calendar for');
    expect(wordId).toBeTruthy();
    expect(toggle(f).getAttribute('aria-labelledby')).toBe(`${wordId} due-label`);
    // aria-label must be ABSENT, not empty: it would otherwise win over aria-labelledby.
    expect(toggle(f).hasAttribute('aria-label')).toBe(false);
  });

  it('falls back to a generic toggle name when the field itself is unnamed', () => {
    expect(toggle(render()).getAttribute('aria-label')).toBe('Open calendar');
  });

  it('names the calendar grid from the field name, so two pickers do not present two "Calendar"s', () => {
    const f = render({ AriaLabel: 'Due date' });
    open(f);
    expect(overlayQuery('.mj-calendar')?.getAttribute('aria-label')).toBe('Calendar for Due date');
  });

  it('names the calendar grid from the VISIBLE label too, via an id list', () => {
    const f = render({ AriaLabelledBy: 'due-label' });
    const wordId = srOnlyId(f, 'Calendar for');
    open(f);
    expect(overlayQuery('.mj-calendar')?.getAttribute('aria-labelledby')).toBe(`${wordId} due-label`);
    expect(overlayQuery('.mj-calendar')?.hasAttribute('aria-label')).toBe(false);
  });

  it('falls back to a generic calendar name when the field itself is unnamed', () => {
    const f = render();
    open(f);
    expect(overlayQuery('.mj-calendar')?.getAttribute('aria-label')).toBe('Calendar');
  });
});
