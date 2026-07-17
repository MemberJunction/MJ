import { describe, it, expect, afterEach } from 'vitest';
import { renderComponentFixture, query, capture, overlayQuery, overlayQueryAll, overlayText, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { MJComboboxComponent } from './combobox.component';

/**
 * DOM coverage for <mj-combobox> — the editable/filtering select (used ~10×). Like mj-dropdown its
 * panel renders in a CDK connected-overlay (overlay-query helpers). Options select on `mousedown`
 * (so the click beats the input's blur), and typed custom values commit on blur (async, 150ms).
 * Covers: input/placeholder, focus opens + lists, typing filters, mousedown select → ValueChange +
 * input fill + close, clear → null, empty state, and the AllowCustom blur-commit path.
 */

const DATA = [
  { text: 'Apples', value: 'a' },
  { text: 'Bananas', value: 'b' },
  { text: 'Cherries', value: 'c' },
];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJComboboxComponent, {
    imports: [MJComboboxComponent],
    inputs: { Data: DATA, TextField: 'text', ValueField: 'value', ValuePrimitive: true, ...inputs },
  });

const input = (f: ReturnType<typeof render>) => query(f, '.mj-combobox-input') as HTMLInputElement;
const focusOpen = (f: ReturnType<typeof render>) => { input(f).dispatchEvent(new Event('focus')); f.detectChanges(); };
const mousedown = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

afterEach(() => clearOverlayContainers());

describe('MJComboboxComponent (DOM)', () => {
  it('renders the text input with the placeholder', () => {
    const f = render({ Placeholder: 'Pick a fruit' });
    expect(input(f).placeholder).toBe('Pick a fruit');
    expect(query(f, '.mj-combobox[role="combobox"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the panel and lists all options on focus', () => {
    const f = render();
    focusOpen(f);
    expect(query(f, '.mj-combobox')?.getAttribute('aria-expanded')).toBe('true');
    expect(overlayQueryAll('.mj-dropdown-option').map((o) => o.textContent?.trim())).toEqual(['Apples', 'Bananas', 'Cherries']);
  });

  it('filters the options as the user types', () => {
    const f = render();
    focusOpen(f);
    input(f).value = 'err';
    input(f).dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(overlayQueryAll('.mj-dropdown-option').map((o) => o.textContent?.trim())).toEqual(['Cherries']);
  });

  it('selects an option on mousedown — emits the value, fills the input, closes', () => {
    const f = render();
    const changes = capture(f.componentInstance.ValueChange);
    focusOpen(f);
    mousedown(overlayQueryAll('.mj-dropdown-option')[1]);
    f.detectChanges();
    expect(changes).toEqual(['b']);
    expect(input(f).value).toBe('Bananas');
    expect(query(f, '.mj-combobox')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a clear button once there is input text and clears the value on click', () => {
    const f = render();
    focusOpen(f);
    mousedown(overlayQueryAll('.mj-dropdown-option')[0]);
    f.detectChanges();
    const clear = query(f, '.mj-combobox-clear') as HTMLElement;
    expect(clear).not.toBeNull();
    const changes = capture(f.componentInstance.ValueChange);
    mousedown(clear);
    f.detectChanges();
    expect(changes).toEqual([null]);
    expect(input(f).value).toBe('');
  });

  it('shows the empty state when no options match', () => {
    const f = render();
    focusOpen(f);
    input(f).value = 'zzz';
    input(f).dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(overlayText('.mj-dropdown-no-data')).toBe('No data found');
  });

  it('commits a typed custom value on blur when AllowCustom is true', async () => {
    const f = render({ AllowCustom: true });
    const changes = capture(f.componentInstance.ValueChange);
    focusOpen(f);
    input(f).value = 'Dragonfruit';
    input(f).dispatchEvent(new Event('input'));
    input(f).dispatchEvent(new Event('blur'));
    await new Promise((r) => setTimeout(r, 200)); // OnInputBlur commits after a 150ms guard
    f.detectChanges();
    expect(changes.at(-1)).toBe('Dragonfruit');
  });
});
