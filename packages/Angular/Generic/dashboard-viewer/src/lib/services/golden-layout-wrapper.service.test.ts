import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LayoutConfig } from 'golden-layout';
import {
  GoldenLayoutWrapperService,
  DASHBOARD_STACK_HEADER_HEIGHT,
  DASHBOARD_TAB_CONTROL_OFFSET,
  type StackActionEvent,
} from './golden-layout-wrapper.service';
import type { DashboardPanel } from '../models/dashboard-types';

/**
 * The size GoldenLayoutWrapperService gives Golden Layout. Golden Layout is a double that records
 * each setSize call; the container reports an on-screen size and a layout size, as an element
 * inside a scaled host does (jsdom reports 0 for both).
 */

/** The parts of a Golden Layout ComponentContainer the service uses when it binds a panel. */
interface ContainerDouble {
  state: DashboardPanel;
  element: HTMLElement;
  tab: { element: HTMLElement };
  setTitle: (title: string) => void;
  on: (event: string, handler: () => void) => void;
}

/** What Golden Layout calls to bind a component: the service's bindComponentEventListener. */
type BindComponent = (container: ContainerDouble, itemConfig: { componentState: Record<string, unknown> }) => { component: HTMLElement };

const { setSizeCalls, bound, layoutHandlers, loadLayout } = vi.hoisted(() => ({
  setSizeCalls: [] as Array<[number, number]>,
  bound: { component: null as BindComponent | null },
  /** The handler the service gave Golden Layout for each layout event, by event name. */
  layoutHandlers: new Map<string, (arg: unknown) => void>(),
  /** Records each layout config the service loads. */
  loadLayout: vi.fn<(config: LayoutConfig) => void>(),
}));

vi.mock('golden-layout', () => {
  class VirtualLayout {
    constructor(_container: HTMLElement, bindComponent: BindComponent) {
      bound.component = bindComponent;
    }
    public resizeWithContainerAutomatically = false;
    public rootItem = null;
    public on(event: string, handler: (arg: unknown) => void): void {
      layoutHandlers.set(event, handler);
    }
    public loadLayout(config: LayoutConfig): void {
      loadLayout(config);
    }
    public saveLayout(): { root: undefined } {
      return { root: undefined };
    }
    public setSize(width: number, height: number): void {
      setSizeCalls.push([width, height]);
    }
    public destroy(): void {}
  }
  return { VirtualLayout, LayoutConfig: { fromResolved: (config: unknown) => config } };
});

/** The container's layout size (offsetWidth / offsetHeight). */
let layoutSize = { width: 750, height: 450 };

/** A layout container in a host shown at 80%: 600 × 360 on screen, laid out at `layoutSize`. */
function scaledContainer(): HTMLElement {
  const container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 360, width: 600, height: 360, toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(container, 'offsetWidth', { configurable: true, get: () => layoutSize.width });
  Object.defineProperty(container, 'offsetHeight', { configurable: true, get: () => layoutSize.height });
  return container;
}

describe('GoldenLayoutWrapperService: the size it gives Golden Layout', () => {
  beforeEach(() => {
    setSizeCalls.length = 0;
    layoutSize = { width: 750, height: 450 };
  });

  it("lays out at the container's layout size, not its on-screen size, in a host shown at 80%", () => {
    const service = new GoldenLayoutWrapperService();

    service.Initialize(scaledContainer(), null, () => undefined);

    expect(setSizeCalls).toEqual([[750, 450]]);
  });

  it('UpdateSize gives Golden Layout the layout size too, and follows it when the container grows', () => {
    const service = new GoldenLayoutWrapperService();
    service.Initialize(scaledContainer(), null, () => undefined);
    setSizeCalls.length = 0;

    service.UpdateSize();
    layoutSize = { width: 900, height: 500 };
    service.UpdateSize();

    expect(setSizeCalls).toEqual([[750, 450], [900, 500]]);
  });

  it('UpdateSize changes nothing while the container has no layout size', () => {
    const service = new GoldenLayoutWrapperService();
    service.Initialize(scaledContainer(), null, () => undefined);
    setSizeCalls.length = 0;

    layoutSize = { width: 0, height: 0 };
    service.UpdateSize();

    expect(setSizeCalls).toEqual([]);
  });
});

/** A component container for a panel. Its tab element already exists, so the icon is added at once. */
function componentContainer(panel: DashboardPanel): ContainerDouble {
  return {
    state: panel,
    element: document.createElement('div'),
    tab: { element: document.createElement('div') },
    setTitle: vi.fn(),
    on: vi.fn(),
  };
}

describe('GoldenLayoutWrapperService: the element it binds for a panel', () => {
  it("marks the panel's content element with the panel id, so the host can find and measure it", () => {
    const service = new GoldenLayoutWrapperService();
    service.Initialize(scaledContainer(), null, () => undefined);
    const panel: DashboardPanel = { id: 'panel-7', title: 'Revenue', partTypeId: 'pt-view', config: { type: 'View' } };
    const container = componentContainer(panel);

    const { component } = bound.component!(container, { componentState: { ...panel } });

    expect(component.dataset['panelId']).toBe('panel-7');
    expect(component.getAttribute('data-panel-id')).toBe('panel-7');
    expect(component.classList.contains('dashboard-panel-content')).toBe(true);
    expect(container.element.querySelector('[data-panel-id="panel-7"]')).toBe(component);
  });
});

/** An active tab of a stack double: the component container it shows and its title. */
interface ActiveTabDouble {
  container: ContainerDouble;
  title: string;
}

/** A tab in a stack double's header: the part it shows, its element, and whether it is the active tab. */
interface HeaderTabDouble {
  part: ActiveTabDouble;
  element: HTMLElement;
  isActive: boolean;
}

/**
 * A Golden Layout stack double: a header with Golden Layout's tab list, controls and tab dropdown list,
 * the header's tabs, an active tab, and the stack events the service listens to.
 */
interface StackDouble {
  isStack: true;
  header: {
    element: HTMLElement;
    tabsContainerElement: HTMLElement;
    controlsContainerElement: HTMLElement;
    tabs: HeaderTabDouble[];
  };
  active: ActiveTabDouble;
  getActiveComponentItem: () => ActiveTabDouble;
  on: (event: string, handler: () => void) => void;
  /** The number of listeners for a stack event. */
  listenerCount: (event: string) => number;
  /** Shows another tab, as Golden Layout does when the user clicks it. */
  show: (next: ActiveTabDouble) => void;
}

function glElement(tagName: string, className: string): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

/** A stack double that shows `active`, with `others` as its other tabs. */
function stackDouble(active: ActiveTabDouble, ...others: ActiveTabDouble[]): StackDouble {
  const handlers = new Map<string, Array<() => void>>();
  const tabs = [active, ...others].map(part => ({ part, element: glElement('div', 'lm_tab'), isActive: part === active }));
  const header = {
    element: glElement('section', 'lm_header'),
    tabsContainerElement: glElement('section', 'lm_tabs'),
    controlsContainerElement: glElement('section', 'lm_controls'),
    tabs,
  };
  header.tabsContainerElement.append(...tabs.map(tab => tab.element));
  header.element.append(header.tabsContainerElement, header.controlsContainerElement, glElement('section', 'lm_tabdropdown_list'));
  const stack: StackDouble = {
    isStack: true,
    header,
    active,
    getActiveComponentItem: () => stack.active,
    on: (event, handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    listenerCount: event => handlers.get(event)?.length ?? 0,
    show: next => {
      stack.active = next;
      tabs.forEach(tab => (tab.isActive = tab.part === next));
      handlers.get('activeContentItemChanged')?.forEach(handler => handler());
    },
  };
  return stack;
}

/** The aria-selected value of each tab in the stack's header. */
function ariaSelected(stack: StackDouble): Array<string | null> {
  return stack.header.tabs.map(tab => tab.element.getAttribute('aria-selected'));
}

/** A Golden Layout tab double: its element and whether it can be dragged. */
interface TabDouble {
  element: HTMLElement;
  reorderEnabled: boolean;
}

/** Golden Layout reports an item it created. */
function reportItem(item: object): void {
  layoutHandlers.get('itemCreated')?.({ target: item });
}

/** Golden Layout reports a tab it created. */
function reportTab(tab: TabDouble): void {
  layoutHandlers.get('tabCreated')?.(tab);
}

function partButtons(stack: StackDouble): HTMLButtonElement[] {
  return Array.from(stack.header.controlsContainerElement.querySelectorAll('button'));
}

describe('GoldenLayoutWrapperService: part buttons in stack headers', () => {
  beforeEach(() => {
    layoutHandlers.clear();
    loadLayout.mockClear();
  });

  /** A service in the given mode with the panels bound, as Golden Layout binds them on load. */
  function serviceWith(isEditing: boolean, ...panels: DashboardPanel[]): { service: GoldenLayoutWrapperService; containers: ContainerDouble[] } {
    const service = new GoldenLayoutWrapperService();
    service.Initialize(scaledContainer(), null, () => undefined, isEditing);
    const containers = panels.map(panel => {
      const container = componentContainer(panel);
      bound.component!(container, { componentState: { ...panel } });
      return container;
    });
    return { service, containers };
  }

  const revenue: DashboardPanel = { id: 'panel-1', title: 'Revenue', partTypeId: 'pt-view', config: { type: 'View' } };
  const costs: DashboardPanel = { id: 'panel-2', title: 'Costs', partTypeId: 'pt-query', config: { type: 'Query' } };

  it('adds Edit part and Remove, styled as small mjButtons, to each stack in edit mode', () => {
    const { containers: [r] } = serviceWith(true, revenue);
    const stack = stackDouble({ container: r, title: 'Revenue' });

    reportItem(stack);

    const group = stack.header.controlsContainerElement.querySelector('.dashboard-stack-actions');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Part actions');
    const buttons = partButtons(stack);
    expect(buttons.map(b => b.textContent?.trim())).toEqual(['Edit part', 'Remove']);
    expect(buttons.map(b => b.className)).toEqual(['mj-btn mj-btn--secondary mj-btn--sm', 'mj-btn mj-btn--flat mj-btn--sm']);
    expect(buttons.map(b => b.querySelector('i')?.className)).toEqual(['fa-solid fa-sliders', 'fa-solid fa-trash-can']);
    expect(buttons.map(b => b.type)).toEqual(['button', 'button']);
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Edit part Revenue', 'Remove Revenue']);
  });

  it('adds no part buttons in view mode', () => {
    const { containers: [r] } = serviceWith(false, revenue);
    const stack = stackDouble({ container: r, title: 'Revenue' });

    reportItem(stack);

    expect(partButtons(stack)).toEqual([]);
  });

  it("acts on the stack's active tab at click time and renames the buttons when the tab changes", () => {
    const { service, containers: [r, c] } = serviceWith(true, revenue, costs);
    const actions: StackActionEvent[] = [];
    service.OnStackAction.subscribe(a => actions.push(a));
    const stack = stackDouble({ container: r, title: 'Revenue' });
    reportItem(stack);

    stack.show({ container: c, title: 'Costs' });
    partButtons(stack)[1].click(); // Remove
    partButtons(stack)[0].click(); // Edit part

    expect(actions).toEqual([{ Action: 'remove', PanelId: 'panel-2' }, { Action: 'edit', PanelId: 'panel-2' }]);
    expect(partButtons(stack).map(b => b.getAttribute('aria-label'))).toEqual(['Edit part Costs', 'Remove Costs']);
  });

  it('marks each stack header as a tab list and keeps aria-selected on the shown tab, in both modes, wiring a stack once', () => {
    for (const isEditing of [true, false]) {
      const { containers: [r, c] } = serviceWith(isEditing, revenue, costs);
      const costsTab: ActiveTabDouble = { container: c, title: 'Costs' };
      const stack = stackDouble({ container: r, title: 'Revenue' }, costsTab);

      reportItem(stack);
      const listeners = stack.listenerCount('activeContentItemChanged');
      reportItem(stack);
      const selectedAtLoad = ariaSelected(stack);
      stack.show(costsTab);

      expect(stack.header.tabsContainerElement.getAttribute('role')).toBe('tablist');
      expect(stack.header.element.querySelector('.lm_tabdropdown_list')?.getAttribute('role')).toBe('tablist');
      expect(selectedAtLoad).toEqual(['true', 'false']);
      expect(ariaSelected(stack)).toEqual(['false', 'true']);
      expect(stack.listenerCount('activeContentItemChanged')).toBe(listeners);
    }
  });

  it('adds the buttons once when Golden Layout reports the same stack again, and ignores items that are not stacks', () => {
    const { containers: [r] } = serviceWith(true, revenue);
    const stack = stackDouble({ container: r, title: 'Revenue' });

    reportItem(stack);
    reportItem(stack);
    reportItem({ isStack: false });

    expect(partButtons(stack)).toHaveLength(2);
  });

  it('lets tabs be dragged only in edit mode, and makes them keyboard-reachable tabs', () => {
    for (const isEditing of [true, false]) {
      serviceWith(isEditing);
      const tab: TabDouble = { element: document.createElement('div'), reorderEnabled: !isEditing };

      reportTab(tab);

      expect(tab.reorderEnabled).toBe(isEditing);
      expect(tab.element.getAttribute('role')).toBe('tab');
      expect(tab.element.tabIndex).toBe(0);
    }
  });

  it('sizes stack headers for the part buttons, and keeps the stack close setting truthy in edit mode', () => {
    serviceWith(true);
    serviceWith(false);

    const [[editConfig], [viewConfig]] = loadLayout.mock.calls;
    expect(DASHBOARD_STACK_HEADER_HEIGHT).toBe(44);
    expect(editConfig.dimensions?.headerHeight).toBe(DASHBOARD_STACK_HEADER_HEIGHT);
    expect(editConfig.header?.close).toBe('tab');
    expect(viewConfig.dimensions?.headerHeight).toBe(DASHBOARD_STACK_HEADER_HEIGHT);
    expect(viewConfig.header?.close).toBe(false);
  });

  it('leaves room beside the tabs for the spacing the viewer CSS adds there, in both modes', () => {
    serviceWith(true);
    serviceWith(false);

    const [[editConfig], [viewConfig]] = loadLayout.mock.calls;
    expect(DASHBOARD_TAB_CONTROL_OFFSET).toBe(78);
    expect(editConfig.settings?.tabControlOffset).toBe(DASHBOARD_TAB_CONTROL_OFFSET);
    expect(viewConfig.settings?.tabControlOffset).toBe(DASHBOARD_TAB_CONTROL_OFFSET);
  });

  it('activates a tab from the keyboard with Enter or Space, as a click does', () => {
    serviceWith(true);
    const tab: TabDouble = { element: document.createElement('div'), reorderEnabled: true };
    reportTab(tab);
    const clicks = vi.fn();
    tab.element.addEventListener('click', clicks);

    const presses = ['Enter', ' ', 'a'].map(key => new KeyboardEvent('keydown', { key, cancelable: true }));
    presses.forEach(press => tab.element.dispatchEvent(press));

    expect(clicks).toHaveBeenCalledTimes(2);
    expect(presses.map(press => press.defaultPrevented)).toEqual([true, true, false]);
  });
});
