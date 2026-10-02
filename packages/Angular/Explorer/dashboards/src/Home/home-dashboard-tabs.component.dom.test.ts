import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { RenderComponentFixture, Query, QueryAll, Click, Capture, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { HomeDashboardTabsComponent } from './home-dashboard-tabs.component';

const d = (ID: string, Name: string) => ({ ID, Name } as unknown as MJDashboardEntity);

const render = (inputs: Record<string, unknown> = {}) =>
  RenderComponentFixture(HomeDashboardTabsComponent, {
    declarations: [HomeDashboardTabsComponent],
    inputs: { Tabs: [d('a', 'Sales pipeline'), d('b', 'Ops health')], ActiveId: 'overview', ...inputs },
  });

const tabs = (f: ComponentFixture<HomeDashboardTabsComponent>) => QueryAll(f, '[role="tab"]') as HTMLElement[];

const pressKey = (target: HTMLElement, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('HomeDashboardTabsComponent (DOM)', () => {
  it('renders Overview, one tab per dashboard, and Add', () => {
    const f = render();
    expect(tabs(f).map(e => e.textContent?.trim())).toEqual(['Overview', 'Sales pipeline', 'Ops health']);
    expect(QueryAll(f, '.ht-add').length).toBe(1);
  });

  it('marks the active tab', () => {
    const f = render({ ActiveId: 'b' });
    expect(tabs(f).map(e => e.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
  });

  it('emits ActiveIdChange with the dashboard id, and overview for the first tab', () => {
    const f = render();
    const changes = Capture(f.componentInstance.ActiveIdChange);
    tabs(f)[1].click();
    tabs(f)[0].click();
    expect(changes).toEqual(['a', 'overview']);
  });

  it('emits AddRequested from the Add button', () => {
    const f = render();
    const adds = Capture(f.componentInstance.AddRequested);
    Click(f, '.ht-add');
    expect(adds.length).toBe(1);
  });

  it('matches the active dashboard id in any letter case', () => {
    const f = render({ ActiveId: 'B' });
    expect(tabs(f).map(e => e.classList.contains('on'))).toEqual([false, false, true]);
  });

  it('selects Overview when the active id names no tab', () => {
    const f = render({ ActiveId: 'gone' });
    expect(tabs(f).map(e => e.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  });

  it('keeps Add out of the tab list and has no accessibility violations', async () => {
    const f = render({ ActiveId: 'a' });
    expect(Query(f, '[role="tablist"] .ht-add')).toBeNull();
    expect(Query(f, '[role="tablist"]')?.getAttribute('aria-label')).toBe('Home views');
    await ExpectNoAxeViolations(f);
  });

  it('puts only the selected tab in the Tab order', () => {
    const f = render({ ActiveId: 'a' });
    expect(tabs(f).map(e => e.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('moves focus between the tabs with the arrow keys, Home and End, without selecting a tab', () => {
    const f = render();
    const changes = Capture(f.componentInstance.ActiveIdChange);
    const [overview, sales, ops] = tabs(f);
    overview.focus();

    pressKey(overview, 'ArrowRight');
    expect(document.activeElement).toBe(sales);
    pressKey(sales, 'End');
    expect(document.activeElement).toBe(ops);
    pressKey(ops, 'ArrowRight');
    expect(document.activeElement).toBe(overview);
    pressKey(overview, 'ArrowLeft');
    expect(document.activeElement).toBe(ops);
    pressKey(ops, 'Home');
    expect(document.activeElement).toBe(overview);
    expect(changes).toEqual([]);
  });

  it('leaves other keys to the browser', () => {
    const f = render();
    const [overview] = tabs(f);
    overview.focus();
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    overview.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(overview);
  });
});
