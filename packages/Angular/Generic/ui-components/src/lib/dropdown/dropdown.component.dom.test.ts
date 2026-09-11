import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderComponentFixture, query, capture, overlayQuery, overlayQueryAll, overlayText, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MJDropdownComponent } from './dropdown.component';

/**
 * DOM coverage for <mj-dropdown> — the design-system select (used ~93×; stubbed by many other specs).
 * Its option panel renders through a CDK connected-overlay (into .cdk-overlay-container on the body),
 * so assertions on the open panel use the overlay-query helpers. Covers the trigger (placeholder /
 * selected text / aria-expanded), open → option list, option click → ValueChange + close, disabled
 * gating, the filter box, and the empty state.
 */

const DATA = [
  { text: 'Alpha', value: 'a' },
  { text: 'Beta', value: 'b' },
  { text: 'Gamma', value: 'g' },
];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJDropdownComponent, {
    imports: [MJDropdownComponent],
    inputs: { Data: DATA, TextField: 'text', ValueField: 'value', ValuePrimitive: true, ...inputs },
  });

const trigger = (f: ReturnType<typeof render>) => query(f, '.mj-dropdown') as HTMLElement;
const open = (f: ReturnType<typeof render>) => { trigger(f).click(); f.detectChanges(); };

// CDK reuses one overlay container per file; a panel left open would leak into the next test.
afterEach(() => clearOverlayContainers());

describe('MJDropdownComponent (DOM)', () => {
  it('shows the placeholder and is collapsed before opening', () => {
    const f = render({ Placeholder: 'Pick one' });
    const value = query(f, '.mj-dropdown-value') as HTMLElement;
    expect(value.textContent?.trim()).toBe('Pick one');
    expect(value.classList.contains('mj-dropdown-placeholder')).toBe(true);
    expect(trigger(f).getAttribute('aria-expanded')).toBe('false');
    expect(overlayQuery('.mj-dropdown-panel')).toBeNull();
  });

  it('opens the option panel on click, one option per data item', () => {
    const f = render();
    open(f);
    expect(trigger(f).getAttribute('aria-expanded')).toBe('true');
    expect(overlayQuery('.mj-dropdown-panel[role="listbox"]')).not.toBeNull();
    const opts = overlayQueryAll('.mj-dropdown-option');
    expect(opts.length).toBe(3);
    expect(opts.map((o) => o.textContent?.trim())).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('emits the primitive value and closes when an option is clicked', () => {
    const f = render();
    const changes = capture(f.componentInstance.ValueChange);
    open(f);
    (overlayQueryAll('.mj-dropdown-option')[1] as HTMLElement).click();
    f.detectChanges();
    expect(changes).toEqual(['b']);
    expect(trigger(f).getAttribute('aria-expanded')).toBe('false');
  });

  it('reflects the selected item text in the trigger after selection', () => {
    const f = render();
    open(f);
    (overlayQueryAll('.mj-dropdown-option')[2] as HTMLElement).click();
    f.detectChanges();
    const value = query(f, '.mj-dropdown-value') as HTMLElement;
    expect(value.textContent?.trim()).toBe('Gamma');
    expect(value.classList.contains('mj-dropdown-placeholder')).toBe(false);
  });

  it('does not open when disabled', () => {
    // The disabled guard reads IsDisabled, which composes the [Disabled] input with the forms-driven
    // setDisabledState(). This spec pins the forms-driven half by calling the hook directly; the
    // @Input half is covered by the ngModel-host block below.
    const f = renderComponentFixture(MJDropdownComponent, {
      imports: [MJDropdownComponent],
      inputs: { Data: DATA, TextField: 'text', ValueField: 'value', ValuePrimitive: true },
      setup: (c) => (c as MJDropdownComponent).setDisabledState(true),
    });
    open(f);
    expect(trigger(f).getAttribute('aria-expanded')).toBe('false');
    expect(overlayQuery('.mj-dropdown-panel')).toBeNull();
  });

  it('renders a filter box when Filterable and narrows the options as the user types', () => {
    const f = render({ Filterable: true });
    open(f);
    const filter = overlayQuery('.mj-dropdown-filter') as HTMLInputElement;
    expect(filter).not.toBeNull();
    filter.value = 'al';
    filter.dispatchEvent(new Event('input'));
    f.detectChanges();
    // Case-insensitive substring match: only 'Alpha' contains 'al'.
    const labels = overlayQueryAll('.mj-dropdown-option').map((o) => o.textContent?.trim());
    expect(labels).toEqual(['Alpha']);
  });

  it('shows the empty state when there is no data', () => {
    const f = render({ Data: [] });
    open(f);
    expect(overlayText('.mj-dropdown-no-data')).toBe('No data found');
    expect(overlayQueryAll('.mj-dropdown-option').length).toBe(0);
  });

  // ── #3860: the accessible name ────────────────────────────────────────────────────────────────

  it('names the combobox with AriaLabel — on the trigger AND the popup listbox', () => {
    const f = render({ AriaLabel: 'Interview persona' });
    expect(trigger(f).getAttribute('aria-label')).toBe('Interview persona');
    open(f);
    expect(overlayQuery('.mj-dropdown-panel')?.getAttribute('aria-label')).toBe('Interview persona');
  });

  it('names the combobox from a visible label via AriaLabelledBy — trigger AND popup listbox', () => {
    // The visible-label path. NOT <label for>: the trigger is a div[role=combobox], which
    // label-for neither names nor focuses — the label carries an id and the combobox points at it.
    const f = render({ AriaLabelledBy: 'persona-label' });
    expect(trigger(f).getAttribute('aria-labelledby')).toBe('persona-label');
    open(f);
    expect(overlayQuery('.mj-dropdown-panel')?.getAttribute('aria-labelledby')).toBe('persona-label');
  });

  it('exposes InputId so other markup can reference the trigger', () => {
    const f = render({ InputId: 'persona-select' });
    expect(trigger(f).getAttribute('id')).toBe('persona-select');
  });

  it('passes AriaDescribedBy through for hint and error text', () => {
    const f = render({ AriaDescribedBy: 'persona-hint' });
    expect(trigger(f).getAttribute('aria-describedby')).toBe('persona-hint');
  });

  it('renders NO empty name attributes when nothing is configured — absent beats empty', () => {
    // aria-label="" is worse than no attribute: it overrides any other naming source with an
    // explicitly empty name in the accessible-name computation.
    const f = render({});
    expect(trigger(f).hasAttribute('aria-label')).toBe(false);
    expect(trigger(f).hasAttribute('aria-labelledby')).toBe(false);
    expect(trigger(f).hasAttribute('id')).toBe(false);
    expect(trigger(f).hasAttribute('aria-describedby')).toBe(false);
  });

  it('names the filter box from the dropdown name, so it is not a second unnamed control', () => {
    const f = render({ Filterable: true, AriaLabel: 'Interview persona' });
    open(f);
    expect(overlayQuery('.mj-dropdown-filter')?.getAttribute('aria-label')).toBe('Filter Interview persona');
  });

  it('names the filter box from the VISIBLE label too, via an id list', () => {
    // The AriaLabelledBy path is the one the docs steer callers to, and it is the one where a
    // concatenated string cannot work — this component never sees the label's text, only its id.
    // Without the id list every filterable dropdown named this way announces "Filter options",
    // so a form with six of them has six identical filter boxes.
    const f = render({ Filterable: true, AriaLabelledBy: 'persona-label' });
    open(f);
    const filter = overlayQuery('.mj-dropdown-filter') as HTMLElement;
    const wordId = overlayQuery('.mj-dropdown-sr-only')?.getAttribute('id');

    expect(wordId).toBeTruthy();
    expect(filter.getAttribute('aria-labelledby')).toBe(`${wordId} persona-label`);
    // aria-label must be ABSENT, not empty: it would otherwise win over aria-labelledby.
    expect(filter.hasAttribute('aria-label')).toBe(false);
  });

  it('does not announce "Filter Filter roles" when the name already begins with Filter', () => {
    // This repo's house habit — `AriaLabel="Filter roles"` in explorer-settings — makes an
    // unconditional prefix a real regression, not a hypothetical one.
    const f = render({ Filterable: true, AriaLabel: 'Filter roles' });
    open(f);
    expect(overlayQuery('.mj-dropdown-filter')?.getAttribute('aria-label')).toBe('Filter roles');
  });

  it("keeps the filter's visible placeholder inside its accessible name", () => {
    // WCAG 2.5.3: a voice-control user says what they SEE. The old placeholder said "Search..."
    // while the accessible name said "Filter …", so "click Search" matched nothing.
    const f = render({ Filterable: true, AriaLabel: 'Interview persona' });
    open(f);
    const filter = overlayQuery('.mj-dropdown-filter') as HTMLInputElement;
    expect(filter.getAttribute('placeholder')).toBe('Filter...');
    expect(filter.getAttribute('aria-label')).toContain('Filter');
  });

  it('points the trigger at the listbox with aria-controls while open', () => {
    // aria-expanded without aria-controls tells a screen reader something expanded but not what.
    const f = render();
    expect(trigger(f).hasAttribute('aria-controls')).toBe(false);   // nothing to point at yet

    open(f);

    const listboxId = overlayQuery('.mj-dropdown-panel')?.getAttribute('id');
    expect(listboxId).toBeTruthy();
    expect(trigger(f).getAttribute('aria-controls')).toBe(listboxId);
  });

  it('exposes the disabled state and drops out of the tab order', () => {
    // The SCSS suppresses the focus ring when disabled, so a still-tabbable disabled dropdown means
    // a keyboard user lands on something invisible that then silently ignores Enter.
    // Disable via the forms-driven path, applied in `setup` — before the first change detection —
    // exactly as a reactive form applies it on bind. (The [Disabled] input is an equal source of
    // IsDisabled; the ngModel-host block below covers that side.)
    const f = renderComponentFixture(MJDropdownComponent, {
      imports: [MJDropdownComponent],
      inputs: { Data: DATA, TextField: 'text', ValueField: 'value', ValuePrimitive: true },
      setup: (c) => c.setDisabledState(true),
    });

    expect((query(f, '.mj-dropdown') as HTMLElement).getAttribute('aria-disabled')).toBe('true');
    expect((query(f, '.mj-dropdown') as HTMLElement).getAttribute('tabindex')).toBe('-1');
  });

  it('stays tabbable and unmarked when enabled', () => {
    const f = render();
    expect(trigger(f).getAttribute('tabindex')).toBe('0');
    expect(trigger(f).hasAttribute('aria-disabled')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disabled-state contract — the control is unusable exactly when the `Disabled` input OR the
 * reactive-forms disabled state says so, **at every point in time**, not only at the moment
 * Angular Forms registers the ControlValueAccessor.
 *
 * Needs a real `ngModel` host, unlike the specs above which render the component bare: the defect
 * this guards lives in the seam between the two. `IsDisabled` — the only gate on `Toggle()`/`Open()`
 * — is derived state, and the only thing that ever assigned it was `setDisabledState()`. The
 * forms-driven half was always live (`setUpControl` also wires `registerOnDisabledChange`, so the
 * hook re-fires on every `control.disable()`/`enable()`); what had no recompute path at all was the
 * `Disabled` @Input, a plain field. So the gate froze whatever `Disabled` happened to be when the
 * hook last ran and dropped every later change to the input:
 *
 *   - `Disabled` true at that moment → the control was dead FOREVER, even after it went false;
 *   - `Disabled` false at that moment → the control could never be locked afterwards;
 *   - no forms binding at all → the hook never ran, so `[Disabled]` was completely inert.
 *
 * The first direction shipped a real user-facing failure (a picker gated on "pick a company first"
 * never came back to life once the company was picked). All five MJ form controls carried the
 * identical defect; each now has an equivalent block.
 */
@Component({
  standalone: true,
  imports: [MJDropdownComponent, FormsModule],
  template: `
    <mj-dropdown
      [Data]="Items" TextField="text" ValueField="value" [ValuePrimitive]="true"
      [Disabled]="Locked" [(ngModel)]="Value" />
  `,
})
class DisabledHostComponent {
  public Items = DATA;
  /** An @Input so specs flip it via `componentRef.setInput()` — the zoneless-correct way to mark
   *  the view dirty; a plain field assignment trips NG0100 on the verify pass. */
  @Input() Locked = false;
  public Value: string | null = null;
}

describe('MJDropdownComponent — disabled state (DOM, ngModel host)', () => {
  let fixture: ComponentFixture<DisabledHostComponent>;

  const control = (): MJDropdownComponent =>
    fixture.debugElement.children[0].componentInstance as MJDropdownComponent;
  const hostTrigger = (): HTMLElement =>
    fixture.nativeElement.querySelector('.mj-dropdown') as HTMLElement;
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
    expect(hostTrigger().classList.contains('mj-dropdown--disabled')).toBe(true);

    lock(false);
    expect(control().Disabled, 'the @Input itself is false').toBe(false);
    expect(control().IsDisabled, 'and the gate must have followed it').toBe(false);
    expect(hostTrigger().classList.contains('mj-dropdown--disabled')).toBe(false);

    hostTrigger().click();
    fixture.detectChanges();
    expect(control().IsOpen, 're-enabled dropdown must open on click').toBe(true);
  });

  it('LOCKS when Disabled flips to true after registration', () => {
    lock(false);
    hostTrigger().click();
    fixture.detectChanges();
    expect(control().IsOpen).toBe(true);

    lock(true);
    expect(control().IsDisabled).toBe(true);
    expect(control().IsOpen, 'locking an open dropdown must close its panel').toBe(false);

    hostTrigger().click();
    fixture.detectChanges();
    expect(control().IsOpen).toBe(false);
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

    control().setDisabledState(false);
    lock(true);
    lock(false);
    expect(control().IsDisabled, 'released by both sources ⇒ usable').toBe(false);
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
describe('MJDropdownComponent — Disabled with no Angular Forms binding (DOM)', () => {
  it('honours [Disabled] on its own, with no ngModel present', () => {
    const f = render({ Disabled: true });

    expect(f.componentInstance.IsDisabled, 'the gate must follow the input unaided').toBe(true);
    expect(trigger(f).classList.contains('mj-dropdown--disabled')).toBe(true);

    open(f);
    expect(f.componentInstance.IsOpen, 'a disabled dropdown must not open').toBe(false);
  });
});
