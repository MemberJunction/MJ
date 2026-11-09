import { describe, it, expect, vi, onTestFinished } from 'vitest';
import { NgTemplateOutlet } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { MJButtonDirective, MJPageSearchComponent } from '@memberjunction/ng-ui-components';
import {
  RenderComponentFixture,
  ExpectNoAxeViolations,
  Capture,
  Click,
  Query,
  QueryAll,
  Text,
  TypeInto,
} from '@memberjunction/ng-test-utils';
import { HomeDashboardSwitcherComponent } from './home-dashboard-switcher.component';
import type { HomeSwitcherDashboard } from './home-pinned-dashboards';

/**
 * DOM coverage for <mj-home-dashboard-switcher>: the button and title triggers (the title trigger in a heading), the
 * menu (filter box, Home, the pinned dashboards, New dashboard and Manage pins), its outputs, its keys, what closes it,
 * and where it opens. The button directive and the page search box are real. jsdom has a 1024 × 768 viewport and no
 * layout, so the placement tests give the trigger a box and the menu a height.
 */

type Fixture = ComponentFixture<HomeDashboardSwitcherComponent>;
type SwitcherInputs = Partial<Pick<HomeDashboardSwitcherComponent, 'Dashboards' | 'CurrentId' | 'Look' | 'Label' | 'Align' | 'HeadingLevel'>>;

const REVENUE: HomeSwitcherDashboard = { ID: 'D1000000-0000-4000-8000-000000000001', Name: 'Revenue' };
const QUOTA: HomeSwitcherDashboard = { ID: 'D1000000-0000-4000-8000-000000000002', Name: 'Quota' };

const MENU = '.switcher-menu';
const ROWS = `${MENU} button.switcher-item`;
const FILTER = `${MENU} mj-page-search input`;

/** Renders the switcher with Revenue and Quota pinned. */
function render(inputs: SwitcherInputs = {}): Fixture {
  return RenderComponentFixture(HomeDashboardSwitcherComponent, {
    imports: [NgTemplateOutlet, MJButtonDirective, MJPageSearchComponent],
    declarations: [HomeDashboardSwitcherComponent],
    inputs: { Dashboards: [REVENUE, QUOTA], ...inputs },
  });
}

/** The first element matching `selector`, checked to be a `type`. Throws when there is none. */
function find<T extends Element>(f: Fixture, selector: string, type: { new (): T; prototype: T }): T {
  const found = Query(f, selector);
  if (!(found instanceof type)) {
    throw new Error(`Nothing of the expected type matches "${selector}"`);
  }
  return found;
}

/** The button that opens the menu, in either look. */
const triggerOf = (f: Fixture): HTMLButtonElement => find(f, '.switcher-button, .switcher-title', HTMLButtonElement);
const menuOf = (f: Fixture): HTMLElement => find(f, MENU, HTMLElement);
const filterOf = (f: Fixture): HTMLInputElement => find(f, FILTER, HTMLInputElement);

/** Opens the menu with a click on its trigger. */
function open(f: Fixture): void {
  triggerOf(f).click();
  f.detectChanges();
}

/** The trimmed text of each element matching `selector`. */
function texts(f: Fixture, selector: string): string[] {
  return QueryAll(f, selector).map(e => e.textContent?.trim() ?? '');
}

/** The rows that show a check, by their text. */
function checkedRows(f: Fixture): string[] {
  return QueryAll(f, `${MENU} .switcher-check`).map(check => check.closest('.switcher-item')?.textContent?.trim() ?? '');
}

/** The class of each row's leading icon. */
function rowIcons(f: Fixture): string[] {
  return QueryAll(f, `${ROWS} > i:first-child`).map(icon => icon.className);
}

/** Clicks the menu row with this text. */
function clickRow(f: Fixture, name: string): void {
  const row = QueryAll(f, ROWS).find(e => e.textContent?.trim() === name);
  if (!(row instanceof HTMLButtonElement)) {
    throw new Error(`No menu row named "${name}"`);
  }
  row.click();
  f.detectChanges();
}

/** Presses a key on `target` as a browser sends it: a keydown that bubbles and can be cancelled. */
function pressKey(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Presses a key on the focused element. */
function pressOnFocused(key: string): KeyboardEvent {
  const focused = document.activeElement;
  if (!focused) {
    throw new Error('Nothing has focus');
  }
  return pressKey(focused, key);
}

/** The text of the focused element. */
function focusedText(): string {
  return document.activeElement?.textContent?.trim() ?? '';
}

/**
 * Gives elements a laid-out height, as a browser does for the menu: `full`, cut to the element's max-height style
 * when it has one.
 */
function fakeLaidOutHeight(full: number): void {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement): number {
    const max = Number.parseFloat(this.style.maxHeight);
    return Number.isNaN(max) ? full : Math.min(full, max);
  });
}

/** jsdom's window size, which the placement tests assume. */
const JSDOM_WINDOW = { Width: window.innerWidth, Height: window.innerHeight };

/** Gives the window a new size and sends the resize event, as a browser does. The window gets jsdom's size back when the test ends. */
function resizeWindow(width: number, height: number): void {
  onTestFinished(() => {
    window.innerWidth = JSDOM_WINDOW.Width;
    window.innerHeight = JSDOM_WINDOW.Height;
  });
  window.innerWidth = width;
  window.innerHeight = height;
  window.dispatchEvent(new Event('resize'));
}

/** A button outside the switcher, removed when the test ends. */
function outsideButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Outside';
  document.body.appendChild(button);
  onTestFinished(() => button.remove());
  return button;
}

describe('HomeDashboardSwitcherComponent (DOM)', () => {
  describe('the triggers', () => {
    it('shows the button look as a small secondary mjButton with a gauge icon, "Dashboards" and a chevron, and no menu', () => {
      const f = render();
      const button = triggerOf(f);
      expect(button.classList.contains('switcher-button')).toBe(true);
      expect(button.textContent?.trim()).toBe('Dashboards');
      expect(Array.from(button.querySelectorAll('i')).map(icon => icon.className)).toEqual([
        'fa-solid fa-gauge-high',
        'fa-solid fa-chevron-down',
      ]);
      expect(['mj-btn', 'mj-btn--secondary', 'mj-btn--sm'].filter(name => button.classList.contains(name))).toEqual([
        'mj-btn',
        'mj-btn--secondary',
        'mj-btn--sm',
      ]);
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(Query(f, MENU)).toBeNull();
    });

    it('shows the title look with the Label and a chevron, and marks the CurrentId dashboard as current, in any letter case', () => {
      const f = render({ Look: 'title', Label: 'Quota', CurrentId: QUOTA.ID.toLowerCase(), Align: 'left' });
      const title = triggerOf(f);
      expect(Query(f, '.switcher-button')).toBeNull();
      expect(title.classList.contains('switcher-title')).toBe(true);
      expect(title.classList.contains('mj-btn')).toBe(false);
      expect(Text(f, '.switcher-title .switcher-title-text')).toBe('Quota');
      expect(Array.from(title.querySelectorAll('i')).map(icon => icon.className)).toEqual(['fa-solid fa-chevron-down switcher-chevron']);
      expect(title.getAttribute('aria-haspopup')).toBe('dialog');
      expect(title.getAttribute('aria-expanded')).toBe('false');

      open(f);
      expect(texts(f, `${MENU} .switcher-item.current`)).toEqual(['Quota']);
      expect(texts(f, `${MENU} [aria-current="true"]`)).toEqual(['Quota']);
      expect(checkedRows(f)).toEqual(['Quota']);
      expect(title.getAttribute('aria-expanded')).toBe('true');
    });

    it('puts the title trigger, and only the trigger, in an h1 for HeadingLevel 1: the open menu stays outside the heading', () => {
      const f = render({ Look: 'title', Label: 'Quota', CurrentId: QUOTA.ID, Align: 'left', HeadingLevel: 1 });
      const heading = find(f, 'h1', HTMLHeadingElement);
      expect(heading.querySelector('button')).toBe(triggerOf(f));
      expect(heading.textContent?.trim()).toBe('Quota');

      open(f);
      expect(heading.contains(menuOf(f))).toBe(false);
      expect(heading.textContent?.trim()).toBe('Quota');
      expect(QueryAll(f, 'h1, h2')).toEqual([heading]);
    });

    it('puts the title trigger in an h2 for HeadingLevel 2, and in no heading by default or in the button look', () => {
      const f = render({ Look: 'title', Label: 'Quota', HeadingLevel: 2 });
      expect(find(f, 'h2', HTMLHeadingElement).querySelector('button')).toBe(triggerOf(f));
      expect(Query(f, 'h1')).toBeNull();

      f.componentRef.setInput('HeadingLevel', null);
      f.detectChanges();
      expect(QueryAll(f, 'h1, h2')).toEqual([]);
      expect(triggerOf(f).classList.contains('switcher-title')).toBe(true);

      f.componentRef.setInput('Look', 'button');
      f.componentRef.setInput('HeadingLevel', 1);
      f.detectChanges();
      expect(QueryAll(f, 'h1, h2')).toEqual([]);
      expect(triggerOf(f).classList.contains('switcher-button')).toBe(true);
    });
  });

  describe('the menu', () => {
    it('opens on a click with focus in the filter box, then lists Home (current, with a check), the pinned dashboards, New dashboard and Manage pins', () => {
      const f = render();
      open(f);
      const menu = menuOf(f);
      expect(menu.getAttribute('role')).toBe('dialog');
      expect(menu.getAttribute('aria-label')).toBe('Pinned dashboards');
      expect(texts(f, ROWS)).toEqual(['Home', 'Revenue', 'Quota', 'New dashboard', 'Manage pins']);
      expect(rowIcons(f)).toEqual([
        'fa-solid fa-house',
        'fa-solid fa-gauge-high',
        'fa-solid fa-gauge-high',
        'fa-solid fa-plus',
        'fa-solid fa-thumbtack',
      ]);
      expect(texts(f, `${MENU} .switcher-item.current`)).toEqual(['Home']);
      expect(texts(f, `${MENU} [aria-current="true"]`)).toEqual(['Home']);
      expect(checkedRows(f)).toEqual(['Home']);
      expect(triggerOf(f).getAttribute('aria-expanded')).toBe('true');

      const filter = filterOf(f);
      expect(document.activeElement).toBe(filter);
      expect(filter.value).toBe('');
      expect(filter.placeholder).toBe('Find a pinned dashboard');
      expect(filter.getAttribute('aria-label')).toBe('Find a pinned dashboard');
    });

    it('narrows the list as the user types, in any letter case, says when nothing matches, and starts unfiltered when it opens again', () => {
      const f = render();
      open(f);
      TypeInto(f, FILTER, 'QUO');
      f.detectChanges();
      expect(texts(f, `${MENU} .switcher-dashboard`)).toEqual(['Quota']);
      expect(texts(f, ROWS)).toEqual(['Home', 'Quota', 'New dashboard', 'Manage pins']);

      TypeInto(f, FILTER, 'zzz');
      f.detectChanges();
      expect(texts(f, `${MENU} .switcher-dashboard`)).toEqual([]);
      expect(Text(f, `${MENU} .switcher-empty`)).toBe('No pinned dashboard matches.');

      triggerOf(f).click();
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();
      open(f);
      expect(filterOf(f).value).toBe('');
      expect(texts(f, `${MENU} .switcher-dashboard`)).toEqual(['Revenue', 'Quota']);
    });

    it('says so when no dashboard is pinned, and still offers Home, New dashboard and Manage pins', () => {
      const f = render({ Dashboards: [] });
      open(f);
      expect(Text(f, `${MENU} .switcher-empty`)).toBe('No pinned dashboards yet.');
      expect(texts(f, ROWS)).toEqual(['Home', 'New dashboard', 'Manage pins']);
    });

    it('has no accessibility violations while open, in either look', async () => {
      const f = render();
      open(f);
      expect(texts(f, ROWS)).toHaveLength(5);
      await ExpectNoAxeViolations(f);

      triggerOf(f).click();
      f.componentRef.setInput('Look', 'title');
      f.componentRef.setInput('Label', 'Quota');
      f.componentRef.setInput('CurrentId', QUOTA.ID);
      f.detectChanges();
      open(f);
      expect(Query(f, '.switcher-title')).not.toBeNull();
      expect(texts(f, `${MENU} .switcher-item.current`)).toEqual(['Quota']);
      await ExpectNoAxeViolations(f);
    });
  });

  describe('the outputs', () => {
    it('emits Pick with the dashboard the user picks, or null for Home, and closes the menu', () => {
      const f = render({ CurrentId: REVENUE.ID });
      const picks = Capture(f.componentInstance.Pick);
      open(f);
      clickRow(f, 'Quota');
      expect(picks).toEqual([QUOTA.ID]);
      expect(Query(f, MENU)).toBeNull();
      expect(triggerOf(f).getAttribute('aria-expanded')).toBe('false');

      open(f);
      clickRow(f, 'Home');
      expect(picks).toEqual([QUOTA.ID, null]);
      expect(Query(f, MENU)).toBeNull();
    });

    it('emits New and ManagePins from their rows, and closes the menu', () => {
      const f = render();
      const created = Capture(f.componentInstance.New);
      const managed = Capture(f.componentInstance.ManagePins);
      const picks = Capture(f.componentInstance.Pick);
      open(f);
      Click(f, `${MENU} .switcher-new`);
      f.detectChanges();
      expect([created.length, managed.length]).toEqual([1, 0]);
      expect(Query(f, MENU)).toBeNull();

      open(f);
      Click(f, `${MENU} .switcher-manage`);
      f.detectChanges();
      expect([created.length, managed.length]).toEqual([1, 1]);
      expect(Query(f, MENU)).toBeNull();
      expect(picks).toEqual([]);
    });
  });

  describe('the keys', () => {
    it('moves focus from the filter box to Home with ArrowDown, and between the rows with the arrows, Home and End', () => {
      const f = render();
      open(f);
      expect(pressKey(filterOf(f), 'Home').defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(filterOf(f));

      expect(pressKey(filterOf(f), 'ArrowDown').defaultPrevented).toBe(true);
      expect(focusedText()).toBe('Home');
      pressOnFocused('ArrowDown');
      expect(focusedText()).toBe('Revenue');
      pressOnFocused('End');
      expect(focusedText()).toBe('Manage pins');
      pressOnFocused('ArrowDown');
      expect(focusedText()).toBe('Home');
      pressOnFocused('ArrowUp');
      expect(focusedText()).toBe('Manage pins');
      pressOnFocused('ArrowUp');
      expect(focusedText()).toBe('New dashboard');
      pressOnFocused('Home');
      expect(focusedText()).toBe('Home');
      expect(Query(f, MENU)).not.toBeNull();
    });

    it('closes on Escape and puts focus back on the trigger', () => {
      const f = render();
      open(f);
      pressKey(filterOf(f), 'ArrowDown');
      expect(focusedText()).toBe('Home');
      const escape = pressOnFocused('Escape');
      f.detectChanges();
      expect(escape.defaultPrevented).toBe(true);
      expect(Query(f, MENU)).toBeNull();
      expect(document.activeElement).toBe(triggerOf(f));
      expect(triggerOf(f).getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('what closes it', () => {
    it('closes on a click outside, also when the clicked element stops the click, and on a second click on the trigger; clicks inside keep it open', () => {
      const f = render();
      open(f);
      Click(f, FILTER);
      Click(f, `${MENU} .switcher-list`);
      f.detectChanges();
      expect(Query(f, MENU)).not.toBeNull();
      document.body.click();
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();

      const stopper = outsideButton();
      stopper.addEventListener('click', event => event.stopPropagation());
      open(f);
      stopper.click();
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();

      open(f);
      triggerOf(f).click();
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();
    });

    it('closes when focus moves out of the switcher, as Tab does past the last row, and not when focus moves inside it', () => {
      const f = render();
      const next = outsideButton();
      open(f);
      pressKey(filterOf(f), 'ArrowUp');
      expect(focusedText()).toBe('Manage pins');
      next.focus();
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();
      expect(document.activeElement).toBe(next);

      open(f);
      triggerOf(f).focus();
      f.detectChanges();
      expect(Query(f, MENU)).not.toBeNull();
    });

    it('closes on a page scroll and when the window width changes, but not on a scroll inside the menu', () => {
      const f = render();
      open(f);
      find(f, `${MENU} .switcher-list`, HTMLElement).dispatchEvent(new Event('scroll'));
      f.detectChanges();
      expect(Query(f, MENU)).not.toBeNull();
      document.dispatchEvent(new Event('scroll'));
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();

      open(f);
      resizeWindow(JSDOM_WINDOW.Width - 200, JSDOM_WINDOW.Height);
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();
    });

    it('stays open with focus in the filter box when only the window height changes, as when an on-screen keyboard opens, and closes when the width changes from its width at open', () => {
      const f = render();
      // The window was resized before the menu opens: the menu goes by the width it opens at
      resizeWindow(900, JSDOM_WINDOW.Height);
      open(f);
      expect(document.activeElement).toBe(filterOf(f));

      resizeWindow(900, 400);
      f.detectChanges();
      expect(Query(f, MENU)).not.toBeNull();
      expect(document.activeElement).toBe(filterOf(f));

      resizeWindow(1000, 400);
      f.detectChanges();
      expect(Query(f, MENU)).toBeNull();
    });

    it('stops listening to the page when the menu closes, and when the switcher is destroyed while open', () => {
      const added = vi.spyOn(document, 'addEventListener');
      const removed = vi.spyOn(document, 'removeEventListener');
      const f = render();
      open(f);
      const watching = added.mock.calls.filter(([type]) => type === 'click' || type === 'scroll');
      expect(watching.map(([type, , options]) => [type, options])).toEqual([
        ['click', true],
        ['scroll', true],
      ]);
      document.body.click();
      expect(removed.mock.calls).toEqual(expect.arrayContaining(watching));

      removed.mockClear();
      open(f);
      f.destroy();
      expect(removed.mock.calls).toEqual(expect.arrayContaining(watching));
    });
  });

  describe('where it opens', () => {
    it('opens under the trigger, lined up with its right edge for Align right and its left edge for Align left, inside the viewport', () => {
      const f = render();
      const box = vi.spyOn(triggerOf(f), 'getBoundingClientRect').mockReturnValue(new DOMRect(600, 100, 120, 32));
      open(f);
      expect([menuOf(f).style.left, menuOf(f).style.top]).toEqual(['420px', '136px']);

      triggerOf(f).click();
      f.componentRef.setInput('Align', 'left');
      f.detectChanges();
      open(f);
      expect([menuOf(f).style.left, menuOf(f).style.top]).toEqual(['600px', '136px']);

      triggerOf(f).click();
      f.detectChanges();
      box.mockReturnValue(new DOMRect(900, 100, 100, 32));
      open(f);
      expect(menuOf(f).style.left).toBe('716px');
    });

    it('opens above the trigger when the measured menu does not fit below it, limited to the room above: trigger top − 4 − 8 (588px)', () => {
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
      const f = render();
      vi.spyOn(triggerOf(f), 'getBoundingClientRect').mockReturnValue(new DOMRect(600, 600, 120, 32));
      open(f);
      expect([menuOf(f).style.left, menuOf(f).style.top, menuOf(f).style.maxHeight]).toEqual(['420px', '296px', '588px']);
    });

    it('limits the menu to the room below the trigger: viewport height − 8 − top (trigger 300..332, full height 500: 768 − 8 − 336 = 424px)', () => {
      const f = render();
      vi.spyOn(triggerOf(f), 'getBoundingClientRect').mockReturnValue(new DOMRect(600, 300, 120, 32));
      fakeLaidOutHeight(500);
      open(f);
      expect([menuOf(f).style.top, menuOf(f).style.maxHeight]).toEqual(['336px', '424px']);
    });

    it('measures the menu with no max height, so a menu that fits above opens there at its full height (trigger 500..532, full height 400: top 96px, max height 500 − 4 − 8 = 488px)', () => {
      const f = render();
      vi.spyOn(triggerOf(f), 'getBoundingClientRect').mockReturnValue(new DOMRect(600, 500, 120, 32));
      fakeLaidOutHeight(400);
      open(f);
      expect([menuOf(f).style.top, menuOf(f).style.maxHeight]).toEqual(['96px', '488px']);
    });
  });
});
