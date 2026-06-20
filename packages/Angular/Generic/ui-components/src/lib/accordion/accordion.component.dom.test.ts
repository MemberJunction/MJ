import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, attr, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { MJAccordionPanelComponent } from './accordion.component';

/**
 * DOM-level spec for <mj-accordion-panel>. Uses the ng-test-utils query/interaction
 * helpers (query/text/attr/hasClass/click/capture) — assertions stay explicit, the
 * querySelector/dispatch/spy boilerplate doesn't.
 */
describe('MJAccordionPanelComponent (DOM)', () => {
  it('renders the string Title', () => {
    const f = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'Details' } });
    expect(text(f, '.mj-accordion-title')).toBe('Details');
  });

  it('reflects Expanded into the expanded class and aria-expanded', () => {
    const open = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'X', Expanded: true } });
    expect(hasClass(open, '.mj-accordion-panel', 'mj-accordion-panel--expanded')).toBe(true);
    expect(attr(open, '.mj-accordion-header', 'aria-expanded')).toBe('true');

    const closed = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'X' } });
    expect(hasClass(closed, '.mj-accordion-panel', 'mj-accordion-panel--expanded')).toBe(false);
    expect(attr(closed, '.mj-accordion-header', 'aria-expanded')).toBe('false');
  });

  it('shows the body only when Expanded', () => {
    const open = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'X', Expanded: true } });
    expect(query(open, '.mj-accordion-body')).not.toBeNull();

    const closed = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'X' } });
    expect(query(closed, '.mj-accordion-body')).toBeNull();
  });

  it('reflects Disabled into the disabled class and disables the header button', () => {
    const f = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'X', Disabled: true } });
    expect(hasClass(f, '.mj-accordion-panel', 'mj-accordion-panel--disabled')).toBe(true);
    expect((query(f, '.mj-accordion-header') as HTMLButtonElement).disabled).toBe(true);
  });

  it('toggles Expanded and emits ExpandedChange when the header is clicked', () => {
    const f = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'X' } });
    const emitted = capture(f.componentInstance.ExpandedChange);

    click(f, '.mj-accordion-header');

    expect(f.componentInstance.Expanded).toBe(true);
    expect(emitted).toEqual([true]);
  });

  it('does NOT toggle or emit when Disabled (the guard)', () => {
    const f = renderComponentFixture(MJAccordionPanelComponent, { inputs: { Title: 'X', Disabled: true } });
    const emitted = capture(f.componentInstance.ExpandedChange);

    // Call Toggle directly — a disabled button wouldn't dispatch a click anyway, so this exercises the guard itself.
    f.componentInstance.Toggle();

    expect(f.componentInstance.Expanded).toBe(false);
    expect(emitted).toEqual([]);
  });
});
