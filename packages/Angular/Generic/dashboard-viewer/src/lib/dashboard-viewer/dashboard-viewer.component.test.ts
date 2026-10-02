import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { ApplicationRef, ChangeDetectorRef, ElementRef, EnvironmentInjector, Injector } from '@angular/core';
import type { MJDashboardEntity } from '@memberjunction/core-entities';

class MockEventEmitter<T = unknown> {
  private handlers: Array<(value: T) => void> = [];

  emit(value: T): void {
    for (const handler of this.handlers) {
      handler(value);
    }
  }

  subscribe(handler: (value: T) => void): { unsubscribe: () => void } {
    this.handlers.push(handler);
    return {
      unsubscribe: () => {
        this.handlers = this.handlers.filter(h => h !== handler);
      },
    };
  }
}

/** Angular's createComponent: the viewer creates each part component with it. */
const createComponentMock = vi.fn();
/** ClassFactory.CreateInstanceAsync: the viewer looks up each part's class with it. */
const createPartInstanceMock = vi.fn();
/** The part types DashboardEngine holds. */
const partTypesDouble: Array<{ ID: string; Name: string; DriverClass: string; Icon: string }> = [];

// This is a pure-logic unit test: it constructs DashboardViewerComponent directly and drives its
// lifecycle by hand, with no TestBed and no rendering. But the component's import graph transitively
// pulls in many AOT-compiled Angular classes (base dashboard parts, the breadcrumb, and whole MJ
// Angular barrels like ng-shared-generic / ng-ui-components). Those compiled files reference Angular
// decorators and the ivy runtime at class-init time — `static ɵcmp = ɵɵdefineComponent(...)`, and
// legacy metadata like `static propDecorators = { onClick: [{ type: HostListener, ... }] }`. Since we
// never instantiate or render any of them, we don't need real behavior — only that every symbol they
// touch resolves to a harmless value. So the @angular/core mock is *universally tolerant*: explicit
// stubs for the symbols this test actually uses structurally, and a no-op fallback for everything
// else (ivy builders return {}, any other decorator/metadata symbol returns a no-op decorator).
// This keeps new children in the import graph from reopening this file.
const angularCoreMock: Record<string | symbol, unknown> = {
  Component: () => (target: Function) => target,
  Directive: () => (target: Function) => target,
  Input: () => () => undefined,
  Output: () => () => undefined,
  ViewChild: () => () => undefined,
  EventEmitter: MockEventEmitter,
  ViewEncapsulation: { None: 0 },
  ElementRef: class {},
  ChangeDetectorRef: class {},
  ApplicationRef: class {},
  Injector: class {},
  EnvironmentInjector: class {},
  createComponent: createComponentMock,
};
// ESM/promise-interop keys must NOT be synthesized, or the importer treats the module as a thenable.
const interopKeys = new Set(['then', 'catch', 'finally', '__esModule']);
// A value that works both as a metadata reference (`{ type: HostListener }`) and, when invoked as a
// decorator factory (`@HostBinding()`), returns a no-op decorator.
const noopDecoratorFactory = () => () => undefined;
vi.mock('@angular/core', () => new Proxy(angularCoreMock, {
  // `has` must answer too: vitest guards named-import access with `prop in module` and throws its own
  // "export is not defined on the mock" error before `get` is ever consulted.
  has(target, prop) {
    if (typeof prop !== 'string' || interopKeys.has(prop)) {
      return prop in target;
    }
    return true;
  },
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    if (typeof prop !== 'string' || interopKeys.has(prop)) {
      return undefined;
    }
    // ivy definition builders (ɵɵdefineComponent/Directive/…) run at class-init and must return an
    // object; every other synthesized symbol is a decorator/metadata reference.
    return prop.startsWith('ɵ') ? () => ({}) : noopDecoratorFactory;
  },
}));

vi.mock('@memberjunction/ng-base-types', () => ({
  BaseAngularComponent: class {
    ProviderToUse = {
      CurrentUser: { ID: 'user-1' },
      GetEntityObject: vi.fn(),
    };
  },
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: {},
  RunView: class {},
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: { Instance: { ClassFactory: { CreateInstanceAsync: createPartInstanceMock } } },
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => a === b,
  EscapeHTML: (value: string) => value,
}));

vi.mock('@memberjunction/core-entities', () => ({
  DashboardEngine: {
    Instance: {
      Config: vi.fn().mockResolvedValue(undefined),
      DashboardPartTypes: partTypesDouble,
    },
  },
}));

const initializeMock = vi.fn();
const updateSizeMock = vi.fn();
const destroyMock = vi.fn();
/** The layout Golden Layout reports: the layout on screen, with the user's unsaved changes. */
const getLayoutConfigMock = vi.fn();

vi.mock('../services/golden-layout-wrapper.service', () => ({
  GoldenLayoutWrapperService: class {
    onLayoutChanged = new Subject();
    onPanelClosed = new Subject();
    onPanelSelected = new Subject();
    initialize = initializeMock;
    updateSize = updateSizeMock;
    destroy = destroyMock;
    getLayoutConfig = getLayoutConfigMock;
    addPanel = vi.fn();
    removePanel = vi.fn();
  },
}));

type Rect = { width: number; height: number };

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function createContainer(rect: Rect): HTMLElement {
  return {
    getBoundingClientRect: () => rect,
  } as unknown as HTMLElement;
}

function createDashboard(id: string, config = { layout: null, settings: {} }) {
  return {
    ID: id,
    Name: `Dashboard ${id}`,
    UIConfigDetails: JSON.stringify(config),
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function resolveReadyTimer(): Promise<void> {
  await vi.advanceTimersByTimeAsync(100);
  await flushMicrotasks();
}

describe('DashboardViewerComponent layout lifecycle', () => {
  let DashboardViewerComponent: typeof import('./dashboard-viewer.component').DashboardViewerComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockResizeObserver.instances = [];
    updateSizeMock.mockReset();
    updateSizeMock.mockReturnValue(undefined);
    initializeMock.mockReset();
    destroyMock.mockReset();
    getLayoutConfigMock.mockReset();
    getLayoutConfigMock.mockReturnValue(null);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    ({ DashboardViewerComponent } = await import('./dashboard-viewer.component'));
  });

  it('resolves readiness immediately for an already-sized container', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const states: string[] = [];
    const deferred: string[] = [];
    let readyCount = 0;
    component.layoutContainer = { nativeElement: createContainer({ width: 800, height: 600 }) } as any;
    component.layoutLifecycle.subscribe(event => states.push(event.state));
    component.layoutDeferred.subscribe(event => deferred.push(event.reason));
    component.layoutReady.subscribe(() => readyCount++);

    component.dashboard = createDashboard('dash-1') as any;
    const ready = component.waitForLayoutReady();

    await flushMicrotasks();
    await resolveReadyTimer();
    await expect(ready).resolves.toBeUndefined();

    expect(states).toEqual(['pending-dashboard', 'pending-parts', 'initializing', 'ready']);
    expect(deferred).toEqual([]);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(updateSizeMock).toHaveBeenCalledTimes(1);
    expect(readyCount).toBe(1);
  });

  it('defers initialization until a zero-sized container receives layout dimensions', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rect = { width: 0, height: 0 };
    const states: string[] = [];
    const deferred: string[] = [];
    let resolved = false;
    component.layoutContainer = { nativeElement: createContainer(rect) } as any;
    component.layoutLifecycle.subscribe(event => states.push(event.state));
    component.layoutDeferred.subscribe(event => deferred.push(event.reason));

    component.dashboard = createDashboard('dash-1') as any;
    component.waitForLayoutReady().then(() => {
      resolved = true;
    });

    await flushMicrotasks();
    expect(states).toContain('waiting-for-size');
    expect(deferred).toEqual(['layout container has zero size']);
    expect(initializeMock).not.toHaveBeenCalled();
    expect(resolved).toBe(false);

    rect.width = 1024;
    rect.height = 768;
    MockResizeObserver.instances[0].trigger();
    await flushMicrotasks();
    await resolveReadyTimer();

    expect(resolved).toBe(true);
    expect(states).toEqual(['pending-dashboard', 'pending-parts', 'waiting-for-size', 'initializing', 'ready']);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(updateSizeMock).toHaveBeenCalledTimes(1);
  });

  it('rejects readiness when a zero-sized container never receives layout dimensions', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const states: Array<{ state: string; error?: Error }> = [];
    const errors: Array<{ message: string; error?: Error }> = [];
    component.layoutContainer = { nativeElement: createContainer({ width: 0, height: 0 }) } as any;
    component.layoutLifecycle.subscribe(event => states.push({ state: event.state, error: event.error }));
    component.error.subscribe(event => errors.push(event));

    component.dashboard = createDashboard('dash-1') as any;
    const ready = component.waitForLayoutReady();
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();

    await expect(ready).rejects.toThrow('stayed at zero size');
    expect(states.map(event => event.state)).toEqual(['pending-dashboard', 'pending-parts', 'waiting-for-size', 'error']);
    expect(states.at(-1)?.error?.message).toContain('stayed at zero size');
    expect(errors[0]?.message).toBe('Failed to initialize dashboard layout');
    expect(errors[0]?.error?.message).toContain('stayed at zero size');
    expect(initializeMock).not.toHaveBeenCalled();
    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not initialize a deferred layout after the component is destroyed', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rect = { width: 0, height: 0 };
    let resolved = false;
    component.layoutContainer = { nativeElement: createContainer(rect) } as any;

    component.dashboard = createDashboard('dash-1') as any;
    component.waitForLayoutReady().then(() => {
      resolved = true;
    });
    await flushMicrotasks();

    component.ngOnDestroy();
    await flushMicrotasks();

    rect.width = 800;
    rect.height = 600;
    MockResizeObserver.instances[0].trigger();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();

    expect(resolved).toBe(true);
    expect(initializeMock).not.toHaveBeenCalled();
    expect(updateSizeMock).not.toHaveBeenCalled();
    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale deferred layout cycle resolve the active dashboard readiness', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rect = { width: 0, height: 0 };
    const states: Array<{ state: string; dashboardId?: string }> = [];
    component.layoutContainer = { nativeElement: createContainer(rect) } as any;
    component.layoutLifecycle.subscribe(event => states.push({ state: event.state, dashboardId: event.dashboardId }));

    component.dashboard = createDashboard('dash-1') as any;
    const staleReady = component.waitForLayoutReady();
    let staleResolved = false;
    staleReady.then(() => {
      staleResolved = true;
    });
    await flushMicrotasks();

    rect.width = 900;
    rect.height = 700;
    component.dashboard = createDashboard('dash-2') as any;
    const activeReady = component.waitForLayoutReady();
    await flushMicrotasks();
    await resolveReadyTimer();

    await expect(activeReady).resolves.toBeUndefined();
    expect(staleResolved).toBe(true);
    expect(states).toEqual([
      { state: 'pending-dashboard', dashboardId: 'dash-1' },
      { state: 'pending-parts', dashboardId: 'dash-1' },
      { state: 'waiting-for-size', dashboardId: 'dash-1' },
      { state: 'pending-dashboard', dashboardId: 'dash-2' },
      { state: 'pending-parts', dashboardId: 'dash-2' },
      { state: 'initializing', dashboardId: 'dash-2' },
      { state: 'ready', dashboardId: 'dash-2' },
    ]);
    expect(updateSizeMock).toHaveBeenCalledTimes(1);
  });

  it('rejects readiness and emits error lifecycle when first size update fails', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const failure = new Error('update failed');
    const states: Array<{ state: string; error?: Error }> = [];
    const errors: Array<{ message: string; error?: Error }> = [];
    component.layoutContainer = { nativeElement: createContainer({ width: 800, height: 600 }) } as any;
    component.layoutLifecycle.subscribe(event => states.push({ state: event.state, error: event.error }));
    component.error.subscribe(event => errors.push(event));
    updateSizeMock.mockImplementation(() => {
      throw failure;
    });

    component.dashboard = createDashboard('dash-1') as any;
    const ready = component.waitForLayoutReady();
    await flushMicrotasks();
    await resolveReadyTimer();

    await expect(ready).rejects.toThrow('update failed');
    expect(states.map(event => event.state)).toEqual(['pending-dashboard', 'pending-parts', 'initializing', 'error']);
    expect(states.at(-1)?.error).toBe(failure);
    expect(errors).toEqual([{ message: 'Failed to initialize dashboard layout', error: failure }]);
  });
});

/** A Golden Layout tree with one stack holding the given parts. */
function layoutWith(...panelIds: string[]) {
  return { root: { type: 'stack', content: panelIds.map((id) => ({ type: 'component', componentState: { id } })) } };
}

type LayoutDouble = ReturnType<typeof layoutWith>;

/** A dashboard's saved configuration (UIConfigDetails) with the given layout. */
function savedConfig(layout: LayoutDouble): string {
  return JSON.stringify({ layout, settings: {} });
}

/** A dashboard entity double whose saved layout holds the given parts. Save() succeeds. */
function savedDashboard(id: string, layout: LayoutDouble) {
  return { ID: id, Name: `Dashboard ${id}`, UIConfigDetails: savedConfig(layout), Save: vi.fn(async (): Promise<boolean> => true) };
}

type SavedDashboardDouble = ReturnType<typeof savedDashboard>;

const asEntity = (dashboard: SavedDashboardDouble): MJDashboardEntity => dashboard as unknown as MJDashboardEntity;

describe('DashboardViewerComponent reload from the saved layout', () => {
  let DashboardViewerComponent: typeof import('./dashboard-viewer.component').DashboardViewerComponent;
  type Viewer = InstanceType<typeof DashboardViewerComponent>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockResizeObserver.instances = [];
    updateSizeMock.mockReset();
    initializeMock.mockReset();
    destroyMock.mockReset();
    getLayoutConfigMock.mockReset();
    getLayoutConfigMock.mockReturnValue(null);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    ({ DashboardViewerComponent } = await import('./dashboard-viewer.component'));
  });

  /** A viewer whose layout container has the given size. */
  function createViewer(rect: Rect): Viewer {
    const viewer = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
      {} as unknown as ApplicationRef,
      {} as unknown as Injector,
      {} as unknown as EnvironmentInjector,
    );
    viewer.LayoutContainer = { nativeElement: createContainer(rect) } as ElementRef<HTMLElement>;
    return viewer;
  }

  /** Lets a layout build finish: part types, then the delayed first size update. */
  async function finishLayout(): Promise<void> {
    await flushMicrotasks();
    await resolveReadyTimer();
  }

  /** A viewer showing the dashboard in a sized container. */
  async function showDashboard(dashboard: SavedDashboardDouble): Promise<Viewer> {
    const viewer = createViewer({ width: 800, height: 600 });
    viewer.Dashboard = asEntity(dashboard);
    await finishLayout();
    return viewer;
  }

  /** The layout and edit mode of the last Golden Layout build. */
  function lastBuild(): { layout: unknown; isEditing: unknown } {
    const call = initializeMock.mock.calls.at(-1) ?? [];
    return { layout: call[1], isEditing: call[3] };
  }

  it('reports a newer saved layout only after the dashboard is saved with another layout', async () => {
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = await showDashboard(dashboard);

    expect(viewer.HasNewerSavedLayout()).toBe(false);

    // Another tab saves the same cached dashboard entity with a second part.
    dashboard.UIConfigDetails = savedConfig(layoutWith('panel-1', 'panel-2'));

    expect(viewer.HasNewerSavedLayout()).toBe(true);
  });

  it('compares another copy of the dashboard by its saved layout', async () => {
    const viewer = await showDashboard(savedDashboard('dash-1', layoutWith('panel-1')));

    expect(viewer.HasNewerSavedLayout(asEntity(savedDashboard('dash-1', layoutWith('panel-1'))))).toBe(false);
    expect(viewer.HasNewerSavedLayout(asEntity(savedDashboard('dash-1', layoutWith('panel-1', 'panel-2'))))).toBe(true);
  });

  it('reports no newer saved layout after its own save', async () => {
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = await showDashboard(dashboard);
    // The user added a part: Golden Layout holds it.
    getLayoutConfigMock.mockReturnValue(layoutWith('panel-1', 'panel-2'));

    await expect(viewer.save()).resolves.toBe(true);

    expect(JSON.parse(dashboard.UIConfigDetails).layout).toEqual(layoutWith('panel-1', 'panel-2'));
    expect(viewer.HasNewerSavedLayout()).toBe(false);
  });

  it('rebuilds from the saved layout and drops unsaved changes', async () => {
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = await showDashboard(dashboard);
    // The user removes the part without saving.
    getLayoutConfigMock.mockReturnValue(layoutWith());
    viewer.RemovePanel('panel-1');
    expect(viewer.getConfig()?.layout).toEqual(layoutWith());
    expect(viewer.HasUnsavedChanges).toBe(true);

    const reload = viewer.ReloadFromSaved();
    await finishLayout();
    await expect(reload).resolves.toBeUndefined();

    expect(viewer.getConfig()?.layout).toEqual(layoutWith('panel-1'));
    expect(viewer.HasUnsavedChanges).toBe(false);
    expect(initializeMock).toHaveBeenCalledTimes(2);
    expect(lastBuild().layout).toEqual(layoutWith('panel-1'));
  });

  it('shows another copy of the dashboard, and saves that copy afterwards', async () => {
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = await showDashboard(dashboard);
    const copy = savedDashboard('dash-1', layoutWith('panel-1', 'panel-2'));

    void viewer.ReloadFromSaved(asEntity(copy));
    await finishLayout();

    expect(viewer.Dashboard).toBe(copy);
    expect(viewer.getConfig()?.layout).toEqual(layoutWith('panel-1', 'panel-2'));
    expect(lastBuild().layout).toEqual(layoutWith('panel-1', 'panel-2'));
    expect(viewer.HasNewerSavedLayout(asEntity(copy))).toBe(false);

    getLayoutConfigMock.mockReturnValue(layoutWith('panel-1', 'panel-2'));
    await viewer.save();

    expect(copy.Save).toHaveBeenCalledTimes(1);
    expect(dashboard.Save).not.toHaveBeenCalled();
  });

  it('builds the saved layout, not the layout on screen, when edit mode changes right after the reload starts', async () => {
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = await showDashboard(dashboard);
    dashboard.UIConfigDetails = savedConfig(layoutWith('panel-1', 'panel-2'));
    // Golden Layout still shows the old layout.
    getLayoutConfigMock.mockReturnValue(layoutWith('panel-1'));

    const reload = viewer.ReloadFromSaved();
    viewer.IsEditing = true;
    await finishLayout();
    await reload;

    expect(viewer.getConfig()?.layout).toEqual(layoutWith('panel-1', 'panel-2'));
    expect(lastBuild()).toEqual({ layout: layoutWith('panel-1', 'panel-2'), isEditing: true });
  });

  it('takes another copy of the shown dashboard with the same saved layout, without a rebuild, and saves that copy later', async () => {
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = await showDashboard(dashboard);
    // DashboardEngine reloaded its dashboards: a new copy with the same saved layout.
    const copy = savedDashboard('dash-1', layoutWith('panel-1'));

    expect(viewer.UseSavedCopy(asEntity(copy))).toBe(true);
    await finishLayout();

    expect(viewer.Dashboard).toBe(copy);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(destroyMock).not.toHaveBeenCalled();

    getLayoutConfigMock.mockReturnValue(layoutWith('panel-1', 'panel-2'));
    await viewer.save();

    expect(copy.Save).toHaveBeenCalledTimes(1);
    expect(dashboard.Save).not.toHaveBeenCalled();
  });

  it('refuses a copy whose saved layout differs, and a copy of another dashboard', async () => {
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = await showDashboard(dashboard);

    expect(viewer.UseSavedCopy(asEntity(savedDashboard('dash-1', layoutWith('panel-1', 'panel-2'))))).toBe(false);
    expect(viewer.UseSavedCopy(asEntity(savedDashboard('dash-2', layoutWith('panel-1'))))).toBe(false);
    expect(viewer.Dashboard).toBe(dashboard);
  });

  it('rebuilds a hidden viewer when it gets a size, however long that takes', async () => {
    const rect = { width: 800, height: 600 };
    const dashboard = savedDashboard('dash-1', layoutWith('panel-1'));
    const viewer = createViewer(rect);
    viewer.Dashboard = asEntity(dashboard);
    await finishLayout();
    const states: string[] = [];
    const errors: Array<{ message: string; error?: Error }> = [];
    viewer.LayoutLifecycle.subscribe((event) => states.push(event.state));
    viewer.error.subscribe((event) => errors.push(event));

    // The tab is hidden when another tab saves the dashboard.
    rect.width = 0;
    rect.height = 0;
    dashboard.UIConfigDetails = savedConfig(layoutWith('panel-1', 'panel-2'));
    let reloaded = false;
    void viewer.ReloadFromSaved().then(() => {
      reloaded = true;
    });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(states).toContain('waiting-for-size');
    expect(states).not.toContain('error');
    expect(errors).toEqual([]);
    expect(reloaded).toBe(false);
    expect(initializeMock).toHaveBeenCalledTimes(1);

    rect.width = 800;
    rect.height = 600;
    MockResizeObserver.instances.at(-1)?.trigger();
    await finishLayout();

    expect(reloaded).toBe(true);
    expect(initializeMock).toHaveBeenCalledTimes(2);
    expect(lastBuild().layout).toEqual(layoutWith('panel-1', 'panel-2'));
    expect(states.at(-1)).toBe('ready');
  });
});

/** The part type of the parts in layoutWithParts: a part with an Angular component class. */
const TEST_PART_TYPE = { ID: 'part-type-1', Name: 'Test Part', DriverClass: 'TestPartDriver', Icon: 'fa-solid fa-cube' };

/** A part's saved state (componentState) in a Golden Layout tree. */
interface PartStateDouble {
  id: string;
  partTypeId: string;
  title: string;
  icon: string;
  config: { type: string };
}

/** A Golden Layout tree with one stack holding parts of TEST_PART_TYPE. */
function layoutWithParts(...partIds: string[]) {
  return {
    root: {
      type: 'stack',
      content: partIds.map((id) => {
        const componentState: PartStateDouble = { id, partTypeId: TEST_PART_TYPE.ID, title: `Part ${id}`, icon: TEST_PART_TYPE.Icon, config: { type: 'Custom' } };
        return { type: 'component', componentState };
      }),
    },
  };
}

type PartsLayoutDouble = ReturnType<typeof layoutWithParts>;

/** A dashboard entity double whose saved layout holds parts of TEST_PART_TYPE. */
function partsDashboard(id: string, ...partIds: string[]): MJDashboardEntity {
  const dashboard = {
    ID: id,
    Name: `Dashboard ${id}`,
    UIConfigDetails: JSON.stringify({ layout: layoutWithParts(...partIds), settings: {} }),
    Save: vi.fn(async (): Promise<boolean> => true),
  };
  return dashboard as unknown as MJDashboardEntity;
}

/** Golden Layout shows each part of a layout it loads into a sized container, so the viewer creates each part at once. */
function showEveryPart(
  _container: HTMLElement,
  layout: PartsLayoutDouble | null,
  createPart: (panel: PartStateDouble, element: HTMLElement) => void,
): void {
  for (const item of layout?.root.content ?? []) {
    createPart(item.componentState, document.createElement('div'));
  }
}

/** A part component that the viewer created with Angular's createComponent. */
interface PartComponentDouble {
  instance: { ConfigureRequested: Subject<void>; RemoveRequested: Subject<void>; NavigationRequested: Subject<void> };
  location: { nativeElement: HTMLElement };
  hostView: object;
  destroy: ReturnType<typeof vi.fn>;
}

/** Runs all pending promise callbacks. Timers do not run. */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
  }
}

describe('DashboardViewerComponent overlapping layout builds', () => {
  let DashboardViewerComponent: typeof import('./dashboard-viewer.component').DashboardViewerComponent;
  type Viewer = InstanceType<typeof DashboardViewerComponent>;
  /** Every part component the viewer created, in creation order. */
  let partComponents: PartComponentDouble[];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockResizeObserver.instances = [];
    updateSizeMock.mockReset();
    destroyMock.mockReset();
    getLayoutConfigMock.mockReset();
    getLayoutConfigMock.mockReturnValue(null);
    initializeMock.mockReset();
    initializeMock.mockImplementation(showEveryPart);
    partTypesDouble.splice(0, partTypesDouble.length, TEST_PART_TYPE);
    createPartInstanceMock.mockReset();
    createPartInstanceMock.mockImplementation(async () => ({}));
    partComponents = [];
    createComponentMock.mockReset();
    createComponentMock.mockImplementation((): PartComponentDouble => {
      const part: PartComponentDouble = {
        instance: { ConfigureRequested: new Subject<void>(), RemoveRequested: new Subject<void>(), NavigationRequested: new Subject<void>() },
        location: { nativeElement: document.createElement('div') },
        hostView: {},
        destroy: vi.fn(),
      };
      partComponents.push(part);
      return part;
    });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    ({ DashboardViewerComponent } = await import('./dashboard-viewer.component'));
  });

  afterEach(() => {
    partTypesDouble.splice(0, partTypesDouble.length);
    createPartInstanceMock.mockReset();
    createComponentMock.mockReset();
    initializeMock.mockReset();
  });

  /** A viewer whose layout container has the given size. */
  function createViewer(rect: Rect): Viewer {
    const viewer = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
      { attachView: vi.fn(), detachView: vi.fn() } as unknown as ApplicationRef,
      {} as unknown as Injector,
      {} as unknown as EnvironmentInjector,
    );
    viewer.LayoutContainer = { nativeElement: createContainer(rect) } as ElementRef<HTMLElement>;
    return viewer;
  }

  /** Lets the layout builds that can go on finish: part creation, then the delayed size update. */
  async function finishLayout(): Promise<void> {
    await flushPromises();
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
  }

  /** A viewer showing the dashboard in a sized container. */
  async function showDashboard(dashboard: MJDashboardEntity): Promise<Viewer> {
    const viewer = createViewer({ width: 800, height: 600 });
    viewer.Dashboard = dashboard;
    await finishLayout();
    return viewer;
  }

  /** Holds the next part creation (the lookup of the part's class) until the test releases it. */
  function holdNextPartCreation(): { release: () => void } {
    let release: () => void = () => undefined;
    const held = new Promise<object>((resolve) => {
      release = () => resolve({});
    });
    createPartInstanceMock.mockImplementationOnce(() => held);
    return { release: () => release() };
  }

  /** The number of size updates of the Golden Layout instance the viewer built last. */
  function sizeUpdatesOfShownLayout(): number {
    const shownLayout = initializeMock.mock.contexts.at(-1);
    return updateSizeMock.mock.contexts.filter((layout) => layout === shownLayout).length;
  }

  it('sizes the reloaded layout and reports it ready when the edit-mode rebuild it replaced creates its part later', async () => {
    const viewer = await showDashboard(partsDashboard('dash-1', 'part-1'));
    viewer.IsEditing = true;
    await finishLayout();
    const states: string[] = [];
    viewer.LayoutLifecycle.subscribe((event) => states.push(event.state));

    // Save: the viewer leaves edit mode and rebuilds. Its part is still being created when
    // DashboardEngine reports the save and the tab reloads the saved dashboard.
    const heldPart = holdNextPartCreation();
    viewer.IsEditing = false;
    let reloaded = false;
    void viewer.ReloadFromSaved().then(() => {
      reloaded = true;
    });
    let ready = false;
    void viewer.WaitForLayoutReady().then(() => {
      ready = true;
    });
    await flushPromises();
    heldPart.release();
    await finishLayout();

    expect(sizeUpdatesOfShownLayout()).toBe(1);
    expect(states.at(-1)).toBe('ready');
    expect(ready).toBe(true);
    expect(reloaded).toBe(true);
  });

  it('destroys the part that a replaced rebuild creates late, and keeps the part of the reloaded layout until the viewer is destroyed', async () => {
    const viewer = await showDashboard(partsDashboard('dash-1', 'part-1'));
    viewer.IsEditing = true;
    await finishLayout();

    const heldPart = holdNextPartCreation();
    viewer.IsEditing = false;
    void viewer.ReloadFromSaved();
    await flushPromises();
    heldPart.release();
    await finishLayout();

    // Created in this order: the first layout's part, the edit-mode layout's part, the reloaded
    // layout's part, and last the part of the rebuild that the reload replaced.
    const destroyCounts = (): number[] => partComponents.map((part) => part.destroy.mock.calls.length);
    expect(destroyCounts()).toEqual([1, 1, 0, 1]);

    viewer.ngOnDestroy();

    expect(destroyCounts()).toEqual([1, 1, 1, 1]);
  });

  it('settles a reload that an edit-mode change replaced, and sizes the edit-mode layout', async () => {
    const viewer = await showDashboard(partsDashboard('dash-1', 'part-1'));
    let reloaded = false;
    void viewer.ReloadFromSaved().then(() => {
      reloaded = true;
    });
    // The reload has built its layout and waits to size it when the user enters edit mode.
    await flushPromises();
    viewer.IsEditing = true;
    await finishLayout();

    expect(initializeMock.mock.calls.at(-1)?.[3]).toBe(true);
    expect(sizeUpdatesOfShownLayout()).toBe(1);
    expect(reloaded).toBe(true);
  });

  it('builds one layout, when the container gets a size, if a rebuild starts while a hidden viewer waits to show another dashboard', async () => {
    const rect = { width: 800, height: 600 };
    const viewer = createViewer(rect);
    viewer.Dashboard = partsDashboard('dash-1', 'part-1');
    await finishLayout();

    // The hidden viewer gets another dashboard, and its parts are refreshed while it waits for a size.
    rect.width = 0;
    rect.height = 0;
    viewer.Dashboard = partsDashboard('dash-2', 'part-2');
    let ready = false;
    void viewer.WaitForLayoutReady().then(() => {
      ready = true;
    });
    await flushPromises();
    void viewer.RefreshAllPanels();
    await finishLayout();

    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(ready).toBe(false);

    rect.width = 1024;
    rect.height = 768;
    MockResizeObserver.instances.at(-1)?.trigger();
    await finishLayout();

    expect(initializeMock).toHaveBeenCalledTimes(2);
    expect(sizeUpdatesOfShownLayout()).toBe(1);
    expect(ready).toBe(true);
  });

  it('destroys the late part of the first of the two rebuilds that one edit-mode toggle starts', async () => {
    const viewer = await showDashboard(partsDashboard('dash-1', 'part-1'));

    const heldPart = holdNextPartCreation();
    viewer.ToggleEditMode();
    await flushPromises();
    heldPart.release();
    await finishLayout();
    viewer.ngOnDestroy();

    // Created in this order: the first layout's part, the second rebuild's part, and last the late
    // part of the first rebuild.
    expect(partComponents.map((part) => part.destroy.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('destroys a part that is created after the viewer was destroyed', async () => {
    const viewer = await showDashboard(partsDashboard('dash-1', 'part-1'));

    const heldPart = holdNextPartCreation();
    viewer.IsEditing = true;
    await flushPromises();
    viewer.ngOnDestroy();
    heldPart.release();
    await finishLayout();

    // Created in this order: the first layout's part, then the late part of the edit-mode layout.
    expect(partComponents.map((part) => part.destroy.mock.calls.length)).toEqual([1, 1]);
  });

  it('creates the parts that the shown layout asks for after a rebuild of the hidden viewer failed its size wait', async () => {
    // Golden Layout creates the part of the first stack tab at once, and the part of the second tab
    // when the user opens that tab for the first time.
    const secondTab = document.createElement('div');
    let openSecondTab: () => void = () => undefined;
    initializeMock.mockImplementation(
      (_container: HTMLElement, layout: PartsLayoutDouble | null, createPart: (panel: PartStateDouble, element: HTMLElement) => void): void => {
        const [firstItem, secondItem] = layout?.root.content ?? [];
        createPart(firstItem.componentState, document.createElement('div'));
        openSecondTab = () => createPart(secondItem.componentState, secondTab);
      },
    );
    const rect = { width: 800, height: 600 };
    const viewer = createViewer(rect);
    viewer.Dashboard = partsDashboard('dash-1', 'part-1', 'part-2');
    await finishLayout();

    // The tab stays hidden for longer than the size-wait limit while its parts are refreshed: the
    // refresh fails, and the shown layout stays.
    rect.width = 0;
    rect.height = 0;
    const refreshErrors: Error[] = [];
    void viewer.RefreshAllPanels().catch((error: Error) => {
      refreshErrors.push(error);
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10_000);
    await flushPromises();
    expect(refreshErrors[0]?.message).toContain('stayed at zero size');

    // The tab is shown again, and the user opens the second stack tab.
    rect.width = 800;
    rect.height = 600;
    openSecondTab();
    await finishLayout();

    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(secondTab.childElementCount).toBe(1);
    expect(partComponents.map((part) => part.destroy.mock.calls.length)).toEqual([0, 0]);
  });
});
