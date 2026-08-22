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
    // The disabled guard reads IsDisabled, which is driven by the CVA setDisabledState()
    // (the [Disabled] input only takes effect once a forms adapter calls it). Drive it directly.
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
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disabled-state contract — the control is unusable exactly when the `Disabled` input OR the
 * reactive-forms disabled state says so, **at every point in time**, not only at the moment
 * Angular Forms registers the ControlValueAccessor.
 *
 * Needs a real `ngModel` host, unlike the specs above which render the component bare: the defect
 * this guards lives in the seam between the two. Angular calls `setDisabledState()` ONCE, at CVA
 * registration (`setUpControl`, default `CALL_SET_DISABLED_STATE: 'always'`), and `IsDisabled` —
 * the only gate on `Toggle()`/`Open()` — used to be assigned only there. So it froze whatever
 * `Disabled` happened to be at that instant and dropped every later change:
 *
 *   - `Disabled` true at registration → the control was dead FOREVER, even after it went false;
 *   - `Disabled` false at registration → the control could never be locked afterwards.
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
