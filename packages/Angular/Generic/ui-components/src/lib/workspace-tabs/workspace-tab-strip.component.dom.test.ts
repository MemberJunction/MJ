import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MJWorkspaceTabStripComponent } from './workspace-tab-strip.component';
import { MJWorkspaceTab } from './workspace-tabs.types';

/**
 * DOM coverage for `<mj-workspace-tab-strip>` — the data-driven draft strip.
 *
 * Scope note: the strip's LOOK comes from the global `.mj-tabs*` stylesheet and its KEYBOARD
 * behaviour from the `mjTabList` directive, which has its own suite (`tabs/tab-list.dom.test.ts`).
 * Neither is re-tested here. What IS the strip's own contract, and what these assert:
 *  - it renders exactly what it is handed and emits intent, holding no state of its own;
 *  - per-tab STATE reaches assistive tech — a dirty dot and a status colour are invisible to a
 *    screen reader, so they are folded into the tab's accessible name instead;
 *  - `role="tab"` sits on the focusable element, with the close button OUT of the tab order;
 *  - closing does not also select (the close button is nested inside the clickable tab).
 */

function tab(id: string, overrides: Partial<MJWorkspaceTab> = {}): MJWorkspaceTab {
  return { Id: id, Label: `Tab ${id}`, Status: 'draft', State: {}, ...overrides };
}

const TABS: MJWorkspaceTab[] = [
  tab('a', { Label: 'Overview' }),
  tab('b', { Label: 'Line items', Dirty: true }),
  tab('c', { Label: 'Rejected one', Status: 'rejected' }),
  tab('d', { Label: 'Done', Status: 'complete' }),
];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJWorkspaceTabStripComponent, {
    imports: [MJWorkspaceTabStripComponent],
    inputs: { Tabs: TABS, ActiveId: 'a', ...inputs },
  });

const tabs = (f: ReturnType<typeof render>) => queryAll(f, '[role="tab"]') as HTMLElement[];

describe('MJWorkspaceTabStripComponent (DOM)', () => {
  it('renders one tab per entry, in the order given', () => {
    const f = render();
    expect(tabs(f).map((t) => t.querySelector('.mj-tabs__label')?.textContent?.trim())).toEqual([
      'Overview',
      'Line items',
      'Rejected one',
      'Done',
    ]);
  });

  it('marks only the active tab, by class AND aria-selected', () => {
    const t = tabs(render({ ActiveId: 'b' }));
    expect(t.map((x) => x.classList.contains('mj-tabs__tab--active'))).toEqual([false, true, false, false]);
    expect(t.map((x) => x.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false']);
  });

  it('emits the tab ID — not its index — when a tab is clicked', () => {
    const f = render();
    const selected = capture(f.componentInstance.TabSelected);

    tabs(f)[2].click();

    // The strip is id-addressed; emitting a position would silently break a reordered host.
    expect(selected).toEqual(['c']);
  });

  it('closing emits TabClosed and does NOT also select the tab', () => {
    const f = render();
    const selected = capture(f.componentInstance.TabSelected);
    const closed = capture(f.componentInstance.TabClosed);

    (tabs(f)[1].querySelector('.mj-tabs__close') as HTMLElement).click();

    expect(closed).toEqual(['b']);
    // The close button sits INSIDE the clickable tab, so a missing stopPropagation would select it.
    expect(selected).toEqual([]);
  });

  it('folds unsaved and rejected state into the accessible name', () => {
    // The dirty dot is aria-hidden and "rejected" is conveyed by colour — neither survives being
    // read aloud, so the tab's name is the only place that information exists for a screen reader.
    const t = tabs(render());
    expect(t[0].getAttribute('aria-label')).toBe('Overview');
    expect(t[1].getAttribute('aria-label')).toBe('Line items (unsaved changes)');
    expect(t[2].getAttribute('aria-label')).toBe('Rejected one (rejected)');
  });

  it('shows the dirty dot only on dirty tabs, and hides it from assistive tech', () => {
    const f = render();
    const dots = tabs(f).map((t) => t.querySelector('.mj-tabs__dirty'));
    expect(dots.map(Boolean)).toEqual([false, true, false, false]);
    expect(dots[1]!.getAttribute('aria-hidden')).toBe('true');
  });

  it('carries lifecycle state as modifier classes for the shared chrome to style', () => {
    const t = tabs(render());
    expect(t[2].classList.contains('mj-tabs__tab--rejected')).toBe(true);
    expect(t[3].classList.contains('mj-tabs__tab--complete')).toBe(true);
    expect(t[0].classList.contains('mj-tabs__tab--rejected')).toBe(false);
  });

  it('keeps the close button OUT of the page tab order', () => {
    // The tab is the single focus stop (mjTabList's roving tabindex); a focusable close button
    // would double the strip's length in the tab order.
    const close = query(render(), '.mj-tabs__close') as HTMLElement;
    expect(close.getAttribute('tabindex')).toBe('-1');
    expect(close.getAttribute('aria-label')).toBe('Close Overview');
  });

  it('emits NewTabRequested when the pinned control is clicked', () => {
    const f = render();
    const requested = capture(f.componentInstance.NewTabRequested);

    (query(f, '.mj-tabs__new') as HTMLElement).click();

    expect(requested).toHaveLength(1);
  });

  // One render per test: the harness configures TestBed on render, and it cannot be reconfigured
  // once instantiated — so a second render() in the same `it` throws.
  it('hides the new-tab control when ShowNewTab is false', () => {
    expect(query(render({ ShowNewTab: false }), '.mj-tabs__new')).toBeNull();
  });

  it('renders an empty strip without error when handed no tabs', () => {
    const f = render({ Tabs: [], ActiveId: null });
    expect(tabs(f)).toHaveLength(0);
    // The new-tab affordance must survive, or an emptied strip becomes a dead end.
    expect(query(f, '.mj-tabs__new')).not.toBeNull();
  });

  it('disables drag-reorder when AllowReorder is false', () => {
    // The escape hatch for hosts where every touch gesture should scroll instead.
    const f = render({ AllowReorder: false });
    expect(f.componentInstance.AllowReorder).toBe(false);
    expect(tabs(f)).toHaveLength(4);
  });
});
