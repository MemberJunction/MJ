import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { MJLeftNavComponent, MJLeftNavSection } from './left-nav.component';

/**
 * DOM coverage for the opt-in desktop collapse on <mj-left-nav> ([Collapsible] / [(Collapsed)]).
 * Asserts the behavioral contract, not pixels (jsdom computes no layout): opt-in rendering, the
 * glyph flip, the emitted state hand-off to the consumer, the locked toggle position (identical
 * inline margin in both states — the "user never re-aims" invariant), the width hand-off, the
 * tooltips/accessible names items grow while collapsed, and how a TREE section survives a rail too
 * narrow to draw one (folds to top level, ancestor stands in as active, tree returns on expand).
 */

const SECTIONS: MJLeftNavSection[] = [
  {
    label: 'Main',
    items: [
      { id: 'a', icon: 'fa-solid fa-users', label: 'People', badge: 2 },
      { id: 'b', icon: 'fa-solid fa-gear', label: 'Settings', description: 'App configuration' },
    ],
  },
];

/** A tree section — the shape the collapse originally had no answer for. */
const TREE_SECTIONS: MJLeftNavSection[] = [
  {
    label: 'Suites',
    items: [
      {
        id: 'regression',
        icon: 'fa-solid fa-flask',
        label: 'Regression',
        children: [
          { id: 'reg-smoke', label: 'Smoke' },
          { id: 'reg-full', label: 'Full sweep' },
        ],
      },
      { id: 'perf', icon: 'fa-solid fa-gauge', label: 'Performance', children: [] },
    ],
  },
];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJLeftNavComponent, { imports: [MJLeftNavComponent], inputs: { Sections: SECTIONS, ...inputs } });

const renderTree = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJLeftNavComponent, {
    imports: [MJLeftNavComponent],
    inputs: { Sections: TREE_SECTIONS, ExpandedIds: ['regression'], ...inputs },
  });

/**
 * Force the ≤700px branch. jsdom does no layout, so its own matchMedia answers false to everything
 * (= desktop) — we hand back a REAL MediaQueryList with `matches` overridden, which keeps the type
 * honest and leaves addEventListener genuinely working.
 */
function stubMobileViewport(): void {
  const mql = window.matchMedia('(max-width: 700px)');
  Object.defineProperty(mql, 'matches', { get: () => true, configurable: true });
  vi.spyOn(window, 'matchMedia').mockReturnValue(mql);
}

afterEach(() => vi.restoreAllMocks());

describe('MJLeftNavComponent desktop collapse (DOM)', () => {
  it('renders NO toggle by default — collapse is strictly opt-in', () => {
    const f = render();
    expect(query(f, '.mj-left-nav__collapse-toggle')).toBeNull();
    expect(query(f, '.mj-left-nav__collapse-divider')).toBeNull();
  });

  it('Collapsible renders the toggle chip + divider, expanded state: « glyph, aria-expanded=true, full width', () => {
    const f = render({ Collapsible: true, Width: 240 });
    const toggle = query(f, '.mj-left-nav__collapse-toggle') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(query(f, '.mj-left-nav__collapse-divider')).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse navigation');
    expect(query(f, '.mj-left-nav__collapse-icon')!.classList.contains('fa-angles-left')).toBe(true);
    const aside = query(f, 'aside.mj-left-nav') as HTMLElement;
    expect(aside.style.width).toBe('240px');
  });

  it('clicking the toggle flips Collapsed, emits CollapsedChange, swaps the glyph, narrows the rail', () => {
    const f = render({ Collapsible: true, Width: 240, CollapsedWidth: 60 });
    const emitted: boolean[] = [];
    (f.componentInstance as MJLeftNavComponent).CollapsedChange.subscribe((v: boolean) => emitted.push(v));

    (query(f, '.mj-left-nav__collapse-toggle') as HTMLButtonElement).click();
    f.detectChanges(false);

    expect(emitted).toEqual([true]);
    const toggle = query(f, '.mj-left-nav__collapse-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expand navigation');
    expect(query(f, '.mj-left-nav__collapse-icon')!.classList.contains('fa-angles-right')).toBe(true);
    expect((query(f, 'aside.mj-left-nav') as HTMLElement).style.width).toBe('60px');
    // The collapsed presentation scopes to this host class (labels hidden, badges corner-docked).
    expect((f.nativeElement as HTMLElement).classList.contains('mj-left-nav-host--collapsed')).toBe(true);

    (query(f, '.mj-left-nav__collapse-toggle') as HTMLButtonElement).click();
    f.detectChanges(false);
    expect(emitted).toEqual([true, false]);
    expect((f.nativeElement as HTMLElement).classList.contains('mj-left-nav-host--collapsed')).toBe(false);
  });

  it('the toggle chip NEVER relocates: identical inline margin in both states (locked position)', () => {
    const f = render({ Collapsible: true });
    const marginExpanded = (query(f, '.mj-left-nav__collapse-toggle') as HTMLElement).style.marginLeft;

    (query(f, '.mj-left-nav__collapse-toggle') as HTMLButtonElement).click();
    f.detectChanges(false);
    const marginCollapsed = (query(f, '.mj-left-nav__collapse-toggle') as HTMLElement).style.marginLeft;

    expect(marginExpanded).toBe(marginCollapsed);
    // Derived for the default 60px band: (60 − 38)/2 − 8 = 3px.
    expect(marginCollapsed).toBe('3px');
  });

  it('collapsed items grow tooltips + accessible names carrying label, description and badge', () => {
    const f = render({ Collapsible: true, Collapsed: true });
    const items = (f.nativeElement as HTMLElement).querySelectorAll('.mj-left-nav__item');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('title')).toBe('People (2)');
    expect(items[0].getAttribute('aria-label')).toBe('People (2)');
    expect(items[1].getAttribute('title')).toBe('Settings — App configuration');
  });

  it('expanded items carry NO redundant tooltips (IconOnly semantics stay opt-in)', () => {
    const f = render({ Collapsible: true, Collapsed: false });
    const item = query(f, '.mj-left-nav__item') as HTMLElement;
    expect(item.getAttribute('title')).toBeNull();
    expect(item.getAttribute('aria-label')).toBeNull();
  });

  it('the toggle names the region it expands (aria-controls → the aside id)', () => {
    const f = render({ Collapsible: true });
    const controls = (query(f, '.mj-left-nav__collapse-toggle') as HTMLElement).getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect((query(f, 'aside.mj-left-nav') as HTMLElement).id).toBe(controls);
  });
});

describe('MJLeftNavComponent collapse + tree sections (DOM)', () => {
  it('EXPANDED: the tree renders in full — chevron, indent and expanded children', () => {
    const f = renderTree({ Collapsible: true, Collapsed: false });

    expect(query(f, '.mj-left-nav__chevron')).not.toBeNull();
    // 2 top-level + the 2 children of the expanded 'regression' node.
    expect(queryAll(f, '.mj-left-nav__item').length).toBe(4);
    // One row per tree-participating node (both top-level items declare `children`); the leaf
    // children declare none, so they render through the flat branch — existing behavior.
    expect(queryAll(f, '.mj-left-nav__row').length).toBe(2);
  });

  it('COLLAPSED: folds to top-level items only — no chevrons, no indent, no children', () => {
    const f = renderTree({ Collapsible: true, Collapsed: true });

    expect(query(f, '.mj-left-nav__chevron')).toBeNull();
    expect(query(f, '.mj-left-nav__chevron-placeholder')).toBeNull();
    expect(query(f, '.mj-left-nav__row')).toBeNull();
    const items = queryAll(f, '.mj-left-nav__item');
    expect(items.length).toBe(2);
    expect(items.map((i) => i.getAttribute('title'))).toEqual(['Regression', 'Performance']);
  });

  it('COLLAPSED: a top-level item stands in as active for its active DESCENDANT', () => {
    const f = renderTree({ Collapsible: true, Collapsed: true, ActiveId: 'reg-full' });

    const parent = queryAll(f, '.mj-left-nav__item')[0] as HTMLElement;
    expect(parent.classList.contains('mj-left-nav__item--active')).toBe(true);
    // 'true' not 'page' — it is the current branch, not the current page.
    expect(parent.getAttribute('aria-current')).toBe('true');
  });

  it('EXPANDED: no stand-in — only the descendant itself is active, and it is the page', () => {
    const f = renderTree({ Collapsible: true, Collapsed: false, ActiveId: 'reg-full' });

    const actives = queryAll(f, '.mj-left-nav__item--active');
    expect(actives.length).toBe(1);
    expect(actives[0].textContent).toContain('Full sweep');
    expect(actives[0].getAttribute('aria-current')).toBe('page');
  });

  it('COLLAPSED: an icon-less item renders a monogram so it is never a blank hit-target', () => {
    // The children carry no icon; surface them at top level to exercise the fallback.
    const f = renderComponentFixture(MJLeftNavComponent, {
      imports: [MJLeftNavComponent],
      inputs: {
        Sections: [{ items: [{ id: 'reg-smoke', label: 'Smoke' }] }] as MJLeftNavSection[],
        Collapsible: true,
        Collapsed: true,
      },
    });

    expect(query(f, '.mj-left-nav__initial')!.textContent!.trim()).toBe('S');
  });

  it('MOBILE: a persisted Collapsed=true does not follow the user into the drawer', () => {
    // ≤700px the rail IS the drawer: full labels, full tree. The collapsed styles are gated to
    // ≥701px, so the collapsed BEHAVIOR has to be gated too or the drawer gets a flattened tree
    // and monograms next to the very labels they stand in for.
    stubMobileViewport();
    const f = renderTree({ Collapsible: true, Collapsed: true, ActiveId: 'reg-full' });

    expect((f.nativeElement as HTMLElement).classList.contains('mj-left-nav-host--collapsed')).toBe(false);
    expect(query(f, '.mj-left-nav__chevron')).not.toBeNull();
    expect(queryAll(f, '.mj-left-nav__item').length).toBe(4);
    expect(query(f, '.mj-left-nav__initial')).toBeNull();
    // No stand-in ancestor either — the real active child is rendered and owns the state.
    expect(queryAll(f, '.mj-left-nav__item--active').length).toBe(1);
    expect(query(f, '.mj-left-nav__item')!.getAttribute('title')).toBeNull();
  });

  it('EXPANDED: no monogram — the visible label already identifies the item', () => {
    const f = renderComponentFixture(MJLeftNavComponent, {
      imports: [MJLeftNavComponent],
      inputs: { Sections: [{ items: [{ id: 'reg-smoke', label: 'Smoke' }] }] as MJLeftNavSection[], Collapsible: true },
    });

    expect(query(f, '.mj-left-nav__initial')).toBeNull();
  });
});
