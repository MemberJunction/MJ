import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MJLeftNavComponent, type MJLeftNavSection } from './left-nav.component';

/**
 * DOM coverage for <mj-left-nav> — the sectioned left navigation (used ~46×). Focuses on the
 * flat-item path (items without children → no expandable/tree branch): section labels, per-item
 * label/icon/description/badge, the active item (--active + aria-current), the ItemClicked output,
 * and the disabled-item guard. The mobile drawer + expandable-tree branches are separate follow-ups.
 */

const SECTIONS: MJLeftNavSection[] = [
  {
    label: 'Main',
    items: [
      { id: 'a', label: 'Alpha', icon: 'fa-solid fa-a', badge: 3 },
      { id: 'b', label: 'Beta', description: 'the second one' },
      { id: 'c', label: 'Gamma', disabled: true },
    ],
  },
];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJLeftNavComponent, { imports: [MJLeftNavComponent], inputs: { Sections: SECTIONS, ...inputs } });
const items = (f: ReturnType<typeof render>) => queryAll(f, '.mj-left-nav__item');

describe('MJLeftNavComponent (DOM)', () => {
  it('renders the section label and one item button per config item', () => {
    const f = render();
    expect(query(f, '.mj-left-nav__section-label')?.textContent?.trim()).toBe('Main');
    expect(items(f).map((el) => el.querySelector('.mj-left-nav__label')?.textContent?.trim()))
      .toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('renders the icon, badge and description where provided', () => {
    const f = render();
    const [alpha, beta] = items(f);
    expect(alpha.querySelector('i.mj-left-nav__icon.fa-a')).not.toBeNull();
    expect(alpha.querySelector('.mj-left-nav__badge')?.textContent?.trim()).toBe('3');
    expect(beta.querySelector('.mj-left-nav__description')?.textContent?.trim()).toBe('the second one');
    expect(beta.querySelector('.mj-left-nav__badge')).toBeNull();
  });

  it('marks the ActiveId item active with aria-current="page"', () => {
    const f = render({ ActiveId: 'b' });
    const [alpha, beta] = items(f);
    expect(beta.classList.contains('mj-left-nav__item--active')).toBe(true);
    expect(beta.getAttribute('aria-current')).toBe('page');
    expect(alpha.classList.contains('mj-left-nav__item--active')).toBe(false);
    expect(alpha.getAttribute('aria-current')).toBeNull();
  });

  it('emits ItemClicked with the item when clicked', () => {
    const f = render();
    const clicked = capture(f.componentInstance.ItemClicked);
    (items(f)[0] as HTMLElement).click();
    expect(clicked.length).toBe(1);
    expect(clicked[0].id).toBe('a');
  });

  it('marks a disabled item and does not emit ItemClicked on click', () => {
    const f = render();
    const gamma = items(f)[2];
    expect(gamma.classList.contains('mj-left-nav__item--disabled')).toBe(true);
    const clicked = capture(f.componentInstance.ItemClicked);
    (gamma as HTMLElement).click();
    expect(clicked.length).toBe(0);
  });
});
