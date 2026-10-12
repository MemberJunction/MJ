import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedLayoutConfig } from 'golden-layout';
import {
  GoldenLayoutWrapperService,
  DASHBOARD_STACK_HEADER_HEIGHT,
  DASHBOARD_TAB_CONTROL_OFFSET,
  type StackActionEvent,
} from './golden-layout-wrapper.service';
import { InsertPanel } from '../models/dashboard-layout-editor';
import type { DashboardPanel } from '../models/dashboard-types';

/**
 * GoldenLayoutWrapperService with the real Golden Layout. jsdom has no layout, so every size is 0;
 * Golden Layout still builds its stacks, headers and tabs. It puts tabs that do not fit in a
 * dropdown list, so these tests find a tab by its title attribute, not by its place in the DOM.
 */

function viewPanel(id: string): DashboardPanel {
  return { id, title: `Part ${id}`, partTypeId: 'pt-view', config: { type: 'View', entityName: 'MJ: Users' } };
}

/** Two stacks side by side: A and B as tabs (B shown), and C. */
function twoStacks(): ResolvedLayoutConfig {
  const a = InsertPanel(null, viewPanel('A'), { placement: 'end' });
  const ab = InsertPanel(a, viewPanel('B'), { relativeTo: 'A', placement: 'tab' });
  return InsertPanel(ab, viewPanel('C'), { relativeTo: 'A', placement: 'right' });
}

/** A stack's tab list: the roles of its tab list and tab dropdown list, and the titles of its selected and unselected tabs. */
interface TabListState {
  roles: Array<string | null | undefined>;
  selected: Array<string | null>;
  unselected: Array<string | null>;
}

describe('GoldenLayoutWrapperService with Golden Layout: part buttons', () => {
  let service: GoldenLayoutWrapperService;

  // The service adds each tab's icon on a timer; each test runs those timers before it ends
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    service.Destroy();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  /** Loads the two-stack layout in the given mode, and records the part actions the service emits. */
  function render(isEditing: boolean): { container: HTMLElement; actions: StackActionEvent[]; groups: HTMLElement[] } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    service = new GoldenLayoutWrapperService();
    const actions: StackActionEvent[] = [];
    service.OnStackAction.subscribe(a => actions.push(a));
    service.Initialize(container, twoStacks(), () => undefined, isEditing);
    const groups = Array.from(container.querySelectorAll<HTMLElement>('.lm_stack > .lm_header .lm_controls .dashboard-stack-actions'));
    return { container, actions, groups };
  }

  function partButton(group: HTMLElement, action: 'edit' | 'remove'): HTMLButtonElement {
    return group.querySelector<HTMLButtonElement>(`[data-stack-action="${action}"]`)!;
  }

  /** The tab list state of each stack in the layout. */
  function tabListState(container: HTMLElement): TabListState[] {
    const titles = (stack: HTMLElement, selected: boolean): Array<string | null> =>
      Array.from(stack.querySelectorAll(`.lm_tab[aria-selected="${selected}"]`)).map(tab => tab.getAttribute('title'));
    return Array.from(container.querySelectorAll<HTMLElement>('.lm_stack')).map(stack => ({
      roles: [stack.querySelector('.lm_tabs')?.getAttribute('role'), stack.querySelector('.lm_tabdropdown_list')?.getAttribute('role')],
      selected: titles(stack, true),
      unselected: titles(stack, false),
    }));
  }

  it('gives each stack Edit part and Remove in edit mode, and none in view mode', () => {
    expect(render(true).groups).toHaveLength(2);
    service.Destroy();
    expect(render(false).groups).toHaveLength(0);
  });

  it("acts on each stack's active tab", () => {
    const { groups, actions } = render(true);

    partButton(groups[0], 'remove').click();
    partButton(groups[1], 'edit').click();

    expect(actions).toEqual([{ Action: 'remove', PanelId: 'B' }, { Action: 'edit', PanelId: 'C' }]);
  });

  it('makes every tab a keyboard-reachable tab, and Enter shows it', () => {
    const { container, groups, actions } = render(true);
    const tabs = Array.from(container.querySelectorAll<HTMLElement>('.lm_tab'));
    expect(tabs.map(tab => [tab.getAttribute('role'), tab.tabIndex])).toEqual([['tab', 0], ['tab', 0], ['tab', 0]]);

    const tabA = container.querySelector<HTMLElement>('.lm_tab[title="Part A"]')!;
    tabA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    partButton(groups[0], 'edit').click();

    expect(actions).toEqual([{ Action: 'edit', PanelId: 'A' }]);
    expect(partButton(groups[0], 'edit').getAttribute('aria-label')).toBe('Edit part Part A');
  });

  it('marks each stack header as a tab list and only the shown tab as selected, in both modes', () => {
    const expected = [
      { roles: ['tablist', 'tablist'], selected: ['Part B'], unselected: ['Part A'] },
      { roles: ['tablist', 'tablist'], selected: ['Part C'], unselected: [] },
    ];

    expect(tabListState(render(true).container)).toEqual(expected);
    service.Destroy();
    expect(tabListState(render(false).container)).toEqual(expected);
  });

  it('lays out each stack header at the dashboard header height, over the height in the saved layout', () => {
    expect(twoStacks().dimensions.headerHeight).not.toBe(DASHBOARD_STACK_HEADER_HEIGHT);
    const { container } = render(true);

    const headers = Array.from(container.querySelectorAll<HTMLElement>('.lm_stack > .lm_header'));
    expect(headers.map(header => header.style.height)).toEqual([`${DASHBOARD_STACK_HEADER_HEIGHT}px`, `${DASHBOARD_STACK_HEADER_HEIGHT}px`]);
    expect(service.GetLayoutConfig()?.dimensions.headerHeight).toBe(DASHBOARD_STACK_HEADER_HEIGHT);
  });

  it('keeps room beside the tabs for the viewer CSS spacing, over the default in the saved layout', () => {
    expect(twoStacks().settings.tabControlOffset).not.toBe(DASHBOARD_TAB_CONTROL_OFFSET);
    render(true);

    expect(service.GetLayoutConfig()?.settings.tabControlOffset).toBe(DASHBOARD_TAB_CONTROL_OFFSET);
  });
});
