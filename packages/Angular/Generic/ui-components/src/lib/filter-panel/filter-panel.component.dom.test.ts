import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture, typeInto } from '@memberjunction/ng-test-utils';
import { MJFilterPanelComponent, type FilterFieldConfig } from './filter-panel.component';

/**
 * DOM coverage for <mj-filter-panel> — the config-driven filter sidebar (used ~55×). Standalone, no
 * data deps; it renders a widget per FilterFieldConfig and emits ValuesChange/Reset. Covers the text
 * and chips field types + the reset footer (the 'dropdown' field type embeds mj-dropdown, which uses
 * a CDK overlay — exercised separately once an overlay harness exists; not needed for these paths).
 */

const textField: FilterFieldConfig = { key: 'name', label: 'Name', type: 'text', placeholder: 'Search…' };
const chipsField: FilterFieldConfig = {
  key: 'status',
  label: 'Status',
  type: 'chips',
  chipOptions: [
    { text: 'Active', value: 'active' },
    { text: 'Archived', value: 'archived' },
  ],
};

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(MJFilterPanelComponent, { imports: [MJFilterPanelComponent], inputs });

describe('MJFilterPanelComponent (DOM)', () => {
  it('renders a text input with the current value and placeholder', () => {
    const f = render({ Fields: [textField], Values: { name: 'Ada' } });
    const input = query(f, '.mj-filter-panel-text-input') as HTMLInputElement;
    expect(input.value).toBe('Ada');
    expect(input.placeholder).toBe('Search…');
  });

  it('emits ValuesChange when the text input changes', () => {
    const f = render({ Fields: [textField], Values: {} });
    const changes = capture(f.componentInstance.ValuesChange);
    typeInto(f, '.mj-filter-panel-text-input', 'crm');
    expect(changes.at(-1)).toEqual({ name: 'crm' });
  });

  it('renders one chip per option and marks the active one (aria-pressed) from Values', () => {
    const f = render({ Fields: [chipsField], Values: { status: 'archived' } });
    const chips = queryAll(f, 'button.mj-filter-chip');
    expect(chips.length).toBe(2);
    // Values.status === 'archived' → the 2nd option's chip is active, the 1st is not.
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].classList.contains('mj-filter-chip--active')).toBe(true);
  });

  it('emits ValuesChange with the picked value when a chip is clicked', () => {
    const f = render({ Fields: [chipsField], Values: {} });
    const changes = capture(f.componentInstance.ValuesChange);
    (queryAll(f, 'button.mj-filter-chip')[0] as HTMLElement).click();
    expect(changes.at(-1)).toEqual({ status: 'active' });
  });

  it('shows the reset button with the label by default and emits Reset on click', () => {
    const f = render({ Fields: [textField], Values: {}, ResetLabel: 'Clear all' });
    const btn = query(f, '.mj-filter-panel-reset') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toContain('Clear all');
    const resets = capture(f.componentInstance.Reset);
    btn.click();
    expect(resets.length).toBe(1);
  });

  it('hides the reset footer when ShowReset is false', () => {
    const f = render({ Fields: [textField], Values: {}, ShowReset: false });
    expect(query(f, '.mj-filter-panel-reset')).toBeNull();
  });
});
