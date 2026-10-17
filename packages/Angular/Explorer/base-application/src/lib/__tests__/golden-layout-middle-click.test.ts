/**
 * @vitest-environment jsdom
 *
 * Middle-clicking a workspace tab closes it through the SAME path as the
 * tab's × button: GoldenLayoutManager dispatches a click to GL's
 * `.lm_close_tab` control, whose GL-owned click handler runs the close.
 * The spy on the close control below stands in for that GL handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
}));

vi.mock('golden-layout', () => ({
  VirtualLayout: class {},
}));

import { GoldenLayoutManager, TabComponentState } from '../golden-layout-manager';

interface TabFixture {
  tabElement: HTMLElement;
  titleElement: HTMLElement;
  closeElement: HTMLElement;
  closeSpy: ReturnType<typeof vi.fn>;
}

function buildTab(): TabFixture {
  const tabElement = document.createElement('div');
  tabElement.className = 'lm_tab';
  const titleElement = document.createElement('span');
  titleElement.className = 'lm_title';
  titleElement.textContent = 'Accounts';
  const closeElement = document.createElement('div');
  closeElement.className = 'lm_close_tab';
  tabElement.append(titleElement, closeElement);
  document.body.appendChild(tabElement);

  // Stand-in for GL's own close-button click handler (Tab.onCloseClick)
  const closeSpy = vi.fn();
  closeElement.addEventListener('click', closeSpy);
  return { tabElement, titleElement, closeElement, closeSpy };
}

function buildState(isPinned: boolean): TabComponentState {
  return {
    tabId: 'tab-1',
    appId: 'app-1',
    appColor: 'var(--mj-brand-primary)',
    title: 'Accounts',
    route: '/app/crm/accounts',
    isPinned,
    isLoaded: true,
    typeIcon: 'fa-solid fa-table',
  };
}

function wireTab(manager: GoldenLayoutManager, tabElement: HTMLElement, state: TabComponentState): void {
  const container = {
    state: {},
    tab: { element: tabElement },
    on: () => undefined,
    close: () => undefined,
    focus: () => undefined,
    setTitle: () => undefined,
  };
  manager['applyTabStyles'](container, state);
}

function mouse(type: 'auxclick' | 'click' | 'mousedown', button: number): MouseEvent {
  return new MouseEvent(type, { button, bubbles: true, cancelable: true });
}

describe('GoldenLayoutManager — middle-click closes a tab', () => {
  let manager: GoldenLayoutManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    manager = new GoldenLayoutManager();
  });

  it('middle-click on a tab invokes the same close path as clicking ×', () => {
    const tab = buildTab();
    wireTab(manager, tab.tabElement, buildState(false));

    tab.closeElement.click(); // the × button
    expect(tab.closeSpy).toHaveBeenCalledTimes(1);

    tab.titleElement.dispatchEvent(mouse('auxclick', 1)); // middle-click on the tab
    expect(tab.closeSpy).toHaveBeenCalledTimes(2);
  });

  it('left-click on a tab does not close it', () => {
    const tab = buildTab();
    wireTab(manager, tab.tabElement, buildState(false));

    tab.titleElement.dispatchEvent(mouse('click', 0));
    tab.titleElement.dispatchEvent(mouse('mousedown', 0));
    expect(tab.closeSpy).not.toHaveBeenCalled();
  });

  it('right-button auxclick does not close the tab', () => {
    const tab = buildTab();
    wireTab(manager, tab.tabElement, buildState(false));

    tab.titleElement.dispatchEvent(mouse('auxclick', 2));
    expect(tab.closeSpy).not.toHaveBeenCalled();
  });

  it('middle-click on a pinned tab does nothing (pinned tabs have no ×)', () => {
    const tab = buildTab();
    wireTab(manager, tab.tabElement, buildState(true));

    tab.titleElement.dispatchEvent(mouse('auxclick', 1));
    expect(tab.closeSpy).not.toHaveBeenCalled();
  });

  it('middle-click closes once the tab is unpinned (guard reads current state)', () => {
    const tab = buildTab();
    wireTab(manager, tab.tabElement, buildState(true));
    wireTab(manager, tab.tabElement, buildState(false)); // re-styled after unpin

    tab.titleElement.dispatchEvent(mouse('auxclick', 1));
    expect(tab.closeSpy).toHaveBeenCalledTimes(1);
  });

  it('middle mousedown is default-prevented so the browser does not start autoscroll', () => {
    const tab = buildTab();
    wireTab(manager, tab.tabElement, buildState(false));

    const middleDown = mouse('mousedown', 1);
    tab.titleElement.dispatchEvent(middleDown);
    expect(middleDown.defaultPrevented).toBe(true);

    const leftDown = mouse('mousedown', 0);
    tab.titleElement.dispatchEvent(leftDown);
    expect(leftDown.defaultPrevented).toBe(false);
  });

  it('middle-click auxclick is default-prevented (nothing else opens)', () => {
    const tab = buildTab();
    wireTab(manager, tab.tabElement, buildState(false));

    const aux = mouse('auxclick', 1);
    tab.titleElement.dispatchEvent(aux);
    expect(aux.defaultPrevented).toBe(true);
  });
});
