import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { MJTabNavComponent, type TabConfig } from './tab-nav.component';

/**
 * DOM coverage for <mj-tab-nav> — the config-driven tablist (used ~24×). Standalone, no data. Verifies
 * the WAI-ARIA tablist contract (role, per-tab role + aria-selected), label/icon/badge rendering, the
 * badge-variant class, and the TabChange emission on click.
 */

const TABS: TabConfig[] = [
  { key: 'overview', label: 'Overview', icon: 'fa-solid fa-gauge' },
  { key: 'errors', label: 'Errors', badge: 3, badgeVariant: 'error' },
  { key: 'quiet', label: 'Quiet' },
];

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(MJTabNavComponent, { imports: [MJTabNavComponent], inputs });

describe('MJTabNavComponent (DOM)', () => {
  it('renders a tablist with one role="tab" button per config, labelled', () => {
    const f = render({ Tabs: TABS, ActiveKey: 'overview' });
    expect(query(f, '.mj-tab-nav[role="tablist"]')).not.toBeNull();
    const tabs = queryAll(f, 'button[role="tab"]');
    expect(tabs.length).toBe(3);
    expect(tabs.map((t) => t.querySelector('.mj-tab-nav-label')?.textContent?.trim()))
      .toEqual(['Overview', 'Errors', 'Quiet']);
  });

  it('marks only the ActiveKey tab as active + aria-selected', () => {
    const f = render({ Tabs: TABS, ActiveKey: 'errors' });
    const tabs = queryAll(f, 'button[role="tab"]');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs[1].classList.contains('mj-tab-nav-btn--active')).toBe(true);
  });

  it('renders the icon and the variant-styled badge only where configured', () => {
    const f = render({ Tabs: TABS, ActiveKey: 'overview' });
    const tabs = queryAll(f, 'button[role="tab"]');
    expect(tabs[0].querySelector('i.fa-gauge')).not.toBeNull();
    const badge = tabs[1].querySelector('.mj-tab-nav-badge');
    expect(badge?.textContent?.trim()).toBe('3');
    expect(badge?.classList.contains('mj-tab-nav-badge--error')).toBe(true);
    // No badge on the tab without one.
    expect(tabs[2].querySelector('.mj-tab-nav-badge')).toBeNull();
  });

  it('emits TabChange with the tab key when a tab is clicked', () => {
    const f = render({ Tabs: TABS, ActiveKey: 'overview' });
    const changes = capture(f.componentInstance.TabChange);
    (queryAll(f, 'button[role="tab"]')[2] as HTMLElement).click();
    expect(changes).toEqual(['quiet']);
  });
});
