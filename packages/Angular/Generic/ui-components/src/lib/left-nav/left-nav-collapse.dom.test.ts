import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJLeftNavComponent, MJLeftNavSection } from './left-nav.component';

/**
 * DOM coverage for the opt-in desktop collapse on <mj-left-nav> ([Collapsible] / [(Collapsed)]).
 * Asserts the behavioral contract, not pixels (jsdom computes no layout): opt-in rendering, the
 * glyph flip, the emitted state hand-off to the consumer, the locked toggle position (identical
 * inline margin in both states — the "user never re-aims" invariant), the width hand-off, and the
 * tooltips/accessible names items grow while collapsed.
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

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJLeftNavComponent, { imports: [MJLeftNavComponent], inputs: { Sections: SECTIONS, ...inputs } });

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
});
