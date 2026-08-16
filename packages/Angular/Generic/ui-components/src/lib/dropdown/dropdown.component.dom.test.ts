import { describe, it, expect, afterEach } from 'vitest';
import { renderComponentFixture, query, capture, overlayQuery, overlayQueryAll, overlayText, clearOverlayContainers } from '@memberjunction/ng-test-utils';
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
});
